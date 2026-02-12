import { GoogleGenerativeAI, GenerateContentResponse } from '@google/generative-ai';
import { TweetData, CommentTone, CommentLength, CommentStance, TokenCost, TokenUsage, GenerationResult, PersonaData, GeminiModel, TranslationResult, ExplanationResult } from '../types';

// Default model - Gemini 3 Flash for faster response
export const DEFAULT_MODEL: GeminiModel = 'gemini-3-flash-preview';

// Singleton client cache - avoids re-creating the client on every API call
let cachedClient: { apiKey: string; client: GoogleGenerativeAI } | null = null;

export function getClient(apiKey: string): GoogleGenerativeAI {
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client;
  }
  const client = new GoogleGenerativeAI(apiKey);
  cachedClient = { apiKey, client };
  return client;
}

// Available models for UI selection
export const AVAILABLE_MODELS: { id: GeminiModel; name: string; description: string }[] = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast, cost-effective' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Higher quality' },
];

// Model pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini 2.0
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
  // Gemini 2.5
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  // Gemini 3 (Preview)
  'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
};

const TONE_INSTRUCTIONS: Record<CommentTone, string> = {
  friendly: 'Warm, approachable. Like chatting with someone you like at a meetup.',
  professional: 'Sharp and insightful. Shows expertise without being stiff.',
  empathetic: 'Understanding and supportive. Acknowledges the emotional context.',
  humorous: 'Witty and clever. Natural humor, not forced jokes.'
};

const LENGTH_INSTRUCTIONS: Record<CommentLength, string> = {
  short: '1 sentence, under 15 words. Punchy.',
  medium: '1-2 sentences. Makes a point with minimal setup.',
  long: '2-3 sentences. Develops a thought fully.'
};

const STANCE_INSTRUCTIONS: Record<CommentStance, string> = {
  agree: `You AGREE with this tweet. Build on their point by:
- Extending their point with your own take or a sharper angle
- Extending their argument with a related insight
- Validating their point with a specific detail`,

  disagree: `You DISAGREE with this tweet. Respectfully challenge by:
- Offering a different lens or pointing out what's being overlooked
- Pointing out a nuance they may have missed
- Presenting a sharper framing that challenges the premise`,

  question: `You're GENUINELY CURIOUS about this tweet. Engage by:
- Asking a specific clarifying question
- Requesting elaboration on an interesting point
- Wondering about a related aspect`,

  neutral: `You're NEUTRAL on this tweet. Participate by:
- Adding a related observation or raising a question others haven't
- Offering a different angle without taking sides
- Adding context that reframes the discussion`
};

// Calculate cost based on token usage
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): TokenCost {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gemini-2.0-flash'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

// Extract token usage from a Gemini API response
function extractUsage(response: GenerateContentResponse, model: string): { usage: TokenUsage; cost: TokenCost } {
  const meta = response.usageMetadata;
  const usage: TokenUsage = {
    promptTokens: meta?.promptTokenCount || 0,
    completionTokens: meta?.candidatesTokenCount || 0,
    totalTokens: meta?.totalTokenCount || 0,
  };
  return { usage, cost: calculateCost(usage.promptTokens, usage.completionTokens, model) };
}

// Build persona section for prompt - focuses ONLY on tone/manner, ignores phrases
export function buildPersonaSection(persona: PersonaData | null): string {
  if (!persona) return '';

  const { writingStyle } = persona;
  const toneTraits: string[] = [];

  // Formality affects overall register
  if (writingStyle.formality === 'casual') {
    toneTraits.push('conversational and relaxed');
  } else if (writingStyle.formality === 'formal') {
    toneTraits.push('polished and measured');
  } else {
    toneTraits.push('balanced tone');
  }

  // Directness affects communication style
  if (writingStyle.directness === 'direct') {
    toneTraits.push('gets to the point quickly');
  } else {
    toneTraits.push('builds context before making the point');
  }

  // Humor affects emotional texture
  if (writingStyle.humor) {
    toneTraits.push('comfortable with wit and playfulness');
  }

  // Sentence rhythm (not specific words)
  if (writingStyle.sentenceLength === 'short') {
    toneTraits.push('punchy rhythm');
  } else if (writingStyle.sentenceLength === 'long') {
    toneTraits.push('flowing, developed thoughts');
  }

  // Opinion style guidance based on persona analysis
  let opinionGuide = '';
  if (persona.opinionStyle) {
    const hookMap: Record<string, string> = {
      'question': 'Open with a provocative or probing question',
      'bold-claim': 'Open with a confident, direct claim',
      'reframe': 'Open by reframing the issue from a different angle',
      'observation': 'Open with a sharp observation others might miss',
    };
    const argMap: Record<string, string> = {
      'evidence': 'Support takes with concrete evidence or data points',
      'analogy': 'Use analogies and comparisons to make the point land',
      'reframe': 'Argue by reframing the problem entirely',
      'direct-assertion': 'Assert directly without elaborate justification',
    };
    const hook = hookMap[persona.opinionStyle.hookPattern] || '';
    const arg = argMap[persona.opinionStyle.argumentStyle] || '';
    const lines = [hook, arg].filter(Boolean).map(l => `- ${l}`);
    if (lines.length > 0) {
      opinionGuide = `\n\nOpinion expression style:\n${lines.join('\n')}`;
    }
  }

  return `
<persona-tone>
Mimic this communication STYLE (NOT specific words or phrases):
- ${toneTraits.join('\n- ')}${opinionGuide}

CRITICAL: Match the TONE and MANNER only. Use your own vocabulary. Never copy specific phrases or expressions.
</persona-tone>`;
}

// Build user intent section - handles Korean/English input for comment direction
export function buildUserIntentSection(userIntent: string | undefined): string {
  if (!userIntent || userIntent.trim() === '') return '';

  return `
<user-intent>
The user wants this specific approach for their reply:
"${userIntent.trim()}"

Incorporate this intent naturally into the reply while maintaining the selected tone and stance.
If the intent is in Korean, understand the meaning and apply it to the English reply.
</user-intent>`;
}

// Build the full comment generation prompt — single source of truth for both sync and stream paths
function buildCommentPrompt(
  tweetText: string,
  tone: CommentTone,
  length: CommentLength,
  stance: CommentStance,
  persona: PersonaData | null,
  userIntent?: string,
): string {
  const personaSection = buildPersonaSection(persona);
  const userIntentSection = buildUserIntentSection(userIntent);
  const personaConstraint = persona
    ? '\n10. Match the persona TONE only, never copy their phrases'
    : '';
  const userIntentCheck = userIntent
    ? '\n- Does the reply reflect the user\'s specified intent?'
    : '';

  return `<role>
You are a skilled X (Twitter) user who writes replies that stop the scroll. You have sharp opinions and an authentic voice. You share what you think, not what you've done.
</role>

<goal>
Write a single reply that hooks readers instantly — the kind that makes people retweet, quote, or jump into the thread.
</goal>

<context>
<tweet>
${tweetText}
</tweet>
</context>
${personaSection}${userIntentSection}
<voice>
Write like a real person firing off a reply, not a copywriter crafting a message.

Open with variety — rotate across these patterns:
- Fragment ("Misses the point entirely", "Not even close")
- Demonstrative ("This only works if...", "That's the part nobody talks about")
- Noun phrase ("The filter works both ways", "Obsession is imitation in disguise")
- Gerund ("Thinking about it doesn't build it", "Learning what not to do matters more")
- Conditional ("If the assumption is X, sure. It's not")
- Imperative ("Drop the theory. Look at what ships")

Sentence fragments are fine. Real replies aren't essays.
Never fabricate personal experience — state opinions, not stories.
"we" belongs mid-sentence at most, never as a sentence opener.
</voice>

<stance>
${STANCE_INSTRUCTIONS[stance]}

Express your stance naturally through your response. Do NOT explicitly say "I agree" or "I disagree".
</stance>

<reply-style>
Tone: ${TONE_INSTRUCTIONS[tone]}
Length: ${LENGTH_INSTRUCTIONS[length]}

Strong replies look like THIS:
- "The real problem isn't X here. Everyone keeps ignoring Y"
- "Works in theory but falls apart the moment it needs to scale"
- "Obsession with metrics kills the thing metrics were meant to measure"
- "If the assumption is Z stays constant, sure. It's not"
- "That's the neat part — it doesn't"
- "Drop the framework. Look at what actually ships"
- "Thinking about a better process is not building one"

Weak replies look like THIS:
- "Great point! Totally agree!" (empty validation)
- "This is so important for everyone to understand" (corporate speak)
- "You should really think about this differently" (preachy, finger-pointing)
- "Thanks for sharing! This really resonates" (AI cheerleading)
- "We need to have a conversation about this" (performative concern)
</reply-style>

<constraints>
1. Hook the reader in the first few words — make them stop scrolling
2. Respond to something SPECIFIC in the tweet, not the general topic
3. Be bold — strong takes get engagement, safe takes get ignored
4. Use concrete details over abstract concepts
5. No emojis, no hashtags, no em-dashes
6. Never claim experience you don't have — state opinions, not stories
7. NEVER use these banned openers: "I'd argue", "Unpopular opinion:", "This.", "Here's the thing", "We [verb]..."
8. Never address the tweet author with "you" — drop the subject, use "this/that", or use impersonal framing
9. Fragments > full sentences. Write like a reply, not a paragraph${personaConstraint}
</constraints>

<self-check>
Before outputting, verify:
- Would this stop someone mid-scroll? Is there a hook?
- Does this sound like someone with a real POV, not a bot?
- Is there a specific take, not just generic agreement?
- Would someone want to reply to this?
- Does this sound like an honest opinion, not a fabricated experience?
- Does the opening avoid banned patterns ("I'd argue", "We...", etc.)?
- Read it back: does it sound like a real tweet reply, or like an AI wrote it?${userIntentCheck}
</self-check>

Output only the reply text. No explanations or meta-commentary.`;
}

export async function generateComment(
  tweetData: TweetData,
  tone: CommentTone,
  apiKey: string,
  persona?: PersonaData | null,
  length: CommentLength = 'medium',
  stance: CommentStance = 'neutral',
  userIntent?: string,
  selectedModel: GeminiModel = DEFAULT_MODEL
): Promise<GenerationResult> {
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: {
      temperature: 1.0,
    }
  });

  const prompt = buildCommentPrompt(tweetData.text, tone, length, stance, persona || null, userIntent);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const { usage, cost } = extractUsage(response, selectedModel);

    return {
      comment: response.text().trim(),
      usage,
      cost,
      model: selectedModel
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate comment: ${error.message}`);
    }
    throw new Error('An error occurred while generating the comment.');
  }
}

export async function generateCommentStream(
  tweetData: TweetData,
  tone: CommentTone,
  apiKey: string,
  onChunk: (text: string) => void,
  persona?: PersonaData | null,
  length: CommentLength = 'medium',
  stance: CommentStance = 'neutral',
  userIntent?: string,
  selectedModel: GeminiModel = DEFAULT_MODEL
): Promise<GenerationResult> {
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: {
      temperature: 1.0,
    }
  });

  const prompt = buildCommentPrompt(tweetData.text, tone, length, stance, persona || null, userIntent);

  try {
    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }

    const response = await result.response;
    const { usage, cost } = extractUsage(response, selectedModel);

    return {
      comment: fullText.trim(),
      usage,
      cost,
      model: selectedModel
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate comment: ${error.message}`);
    }
    throw new Error('An error occurred while generating the comment.');
  }
}

/**
 * Detect if text is primarily Korean based on Unicode ranges.
 * Returns true if text contains mostly Korean characters (>30%).
 */
export function isKoreanText(text: string): boolean {
  // Korean Unicode ranges:
  // - Hangul Syllables: U+AC00 - U+D7AF
  // - Hangul Jamo: U+1100 - U+11FF
  // - Hangul Compatibility Jamo: U+3130 - U+318F
  const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
  const textWithoutSpaces = text.replace(/\s/g, '');
  if (textWithoutSpaces.length === 0) return false;

  const matches = text.match(koreanPattern) || [];
  const koreanRatio = matches.length / textWithoutSpaces.length;

  // If more than 30% Korean characters, consider it Korean
  return koreanRatio > 0.3;
}

/**
 * Translate tweet text to Korean using Gemini API.
 */
export async function translateTweet(
  text: string,
  apiKey: string,
  selectedModel: GeminiModel = DEFAULT_MODEL
): Promise<TranslationResult> {
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: {
      temperature: 0.3, // Lower temperature for accurate translation
    }
  });

  const prompt = `<role>
You are a professional translator specializing in social media content.
</role>

<goal>
Translate the following tweet into natural, colloquial Korean that preserves the original tone and nuance.
</goal>

<source-text>
${text}
</source-text>

<constraints>
1. Preserve the original tone (casual, formal, humorous, etc.)
2. Keep hashtags, mentions (@username), and links unchanged
3. Translate idioms to Korean equivalents rather than literal translations
4. Maintain the original intent and emotional undertone
5. Do not add explanations or notes
</constraints>

<output-format>
Return a JSON object with this exact structure:
{
  "translatedText": "한국어 번역문",
  "sourceLanguage": "en"
}

The sourceLanguage should be the ISO 639-1 code (en, ja, zh, es, fr, etc.)
Return raw JSON only, no markdown formatting.
</output-format>`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text().trim();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const { usage, cost } = extractUsage(response, selectedModel);

    return {
      translatedText: parsed.translatedText || text,
      sourceLanguage: parsed.sourceLanguage || 'unknown',
      usage,
      cost,
      model: selectedModel
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Translation failed: ${error.message}`);
    }
    throw new Error('An error occurred during translation.');
  }
}

/**
 * Generate a Korean explanation for a generated comment,
 * including translation and relevance reasoning.
 */
export async function generateCommentExplanation(
  tweetText: string,
  generatedComment: string,
  apiKey: string,
  selectedModel: GeminiModel = DEFAULT_MODEL
): Promise<ExplanationResult> {
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: {
      temperature: 0.3,
    }
  });

  const prompt = `<role>
You are a bilingual social media expert who explains English tweet replies in Korean.
</role>

<goal>
Given an original tweet and a generated reply, provide:
1. A natural Korean translation of the reply
2. A brief Korean explanation of why this reply is appropriate for the tweet
</goal>

<original-tweet>
${tweetText}
</original-tweet>

<generated-reply>
${generatedComment}
</generated-reply>

<constraints>
1. Translate the reply naturally into Korean (not literal translation)
2. Explain in 1-2 sentences why this reply works well as a response to the tweet
3. Keep the explanation concise and insightful
4. Do not add extra commentary
</constraints>

<output-format>
Return a JSON object with this exact structure:
{
  "koreanTranslation": "댓글의 한국어 번역",
  "relevanceReason": "이 댓글이 원문 트윗에 적절한 이유 설명"
}

Return raw JSON only, no markdown formatting.
</output-format>`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text().trim();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const { usage, cost } = extractUsage(response, selectedModel);

    return {
      explanation: {
        koreanTranslation: parsed.koreanTranslation || '',
        relevanceReason: parsed.relevanceReason || '',
      },
      usage,
      cost,
      model: selectedModel
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Explanation failed: ${error.message}`);
    }
    throw new Error('An error occurred while generating explanation.');
  }
}
