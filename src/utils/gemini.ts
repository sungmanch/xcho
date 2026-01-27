import { GoogleGenerativeAI } from '@google/generative-ai';
import { TweetData, CommentTone, CommentLength, CommentStance, TokenCost, GenerationResult, PersonaData, GeminiModel, TranslationResult } from '../types';

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
- Adding your own experience or example that supports their view
- Extending their argument with a related insight
- Validating their point with a specific detail`,

  disagree: `You DISAGREE with this tweet. Respectfully challenge by:
- Offering a different perspective with reasoning
- Pointing out a nuance they may have missed
- Sharing a counterexample from experience`,

  question: `You're GENUINELY CURIOUS about this tweet. Engage by:
- Asking a specific clarifying question
- Requesting elaboration on an interesting point
- Wondering about a related aspect`,

  neutral: `You're NEUTRAL on this tweet. Participate by:
- Sharing a related observation without judgment
- Mentioning a similar pattern you've noticed
- Adding context without taking sides`
};

// Calculate cost based on token usage
function calculateCost(
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

// Build persona section for prompt - focuses ONLY on tone/manner, ignores phrases
function buildPersonaSection(persona: PersonaData | null): string {
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

  return `
<persona-tone>
Mimic this communication STYLE (NOT specific words or phrases):
- ${toneTraits.join('\n- ')}

CRITICAL: Match the TONE and MANNER only. Use your own vocabulary. Never copy specific phrases or expressions.
</persona-tone>`;
}

// Build user intent section - handles Korean/English input for comment direction
function buildUserIntentSection(userIntent: string | undefined): string {
  if (!userIntent || userIntent.trim() === '') return '';

  return `
<user-intent>
The user wants this specific approach for their reply:
"${userIntent.trim()}"

Incorporate this intent naturally into the reply while maintaining the selected tone and stance.
If the intent is in Korean, understand the meaning and apply it to the English reply.
</user-intent>`;
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

  const personaSection = buildPersonaSection(persona || null);
  const userIntentSection = buildUserIntentSection(userIntent);
  const personaConstraint = persona
    ? '\n6. Match the persona TONE only, never copy their phrases'
    : '';
  const userIntentCheck = userIntent
    ? '\n- Does the reply reflect the user\'s specified intent?'
    : '';

  // Gemini 3 Pro optimized prompt structure: Role → Goal → Context → Constraints → Self-check
  const prompt = `<role>
You are a real X (Twitter) user writing authentic replies. You have opinions, experiences, and a distinct voice.
</role>

<goal>
Write a single reply to the tweet below that sounds genuinely human and could spark engagement.
</goal>

<context>
<tweet>
${tweetData.text}
</tweet>
</context>
${personaSection}${userIntentSection}
<pronoun-guidance>
Before replying, identify WHO the tweet is about:
- If discussing the tweet author's own experience: use "you" or address them directly
- If discussing a third party (person, company, group): use "they", "he", "she", or the specific name
- If discussing a shared experience or community: use "we"
- If discussing the reader/audience: use "you" appropriately

Match your pronouns to the tweet's actual subject. Do NOT default to "you" for everything.

Examples:
- Tweet: "Elon just announced new pricing" -> Reply about "he" or "Elon", not "you"
- Tweet: "I tried the new feature today" -> Reply addressing "you" (the author)
- Tweet: "Developers are frustrated with the API changes" -> Use "they" for developers
</pronoun-guidance>

<stance>
${STANCE_INSTRUCTIONS[stance]}

Express your stance naturally through your response. Do NOT explicitly say "I agree" or "I disagree".
</stance>

<reply-style>
Tone: ${TONE_INSTRUCTIONS[tone]}
Length: ${LENGTH_INSTRUCTIONS[length]}

Good replies feel like THIS:
- "Wait, this happened to me last week. The fix was simpler than I thought"
- "Counterpoint: what if the real issue is we're measuring the wrong thing?"
- "Curious what made you think of this. Been noticing similar patterns"

Bad replies feel like THIS:
- "Great point! Totally agree!" (generic validation)
- "This is so important for everyone to understand" (corporate speak)
- "Absolutely! Love the way you put this" (AI-sounding)
</reply-style>

<constraints>
1. Respond to something SPECIFIC in the tweet, not the general topic
2. Use natural, conversational language
3. Vary your sentence structure
4. No emojis, no hashtags, no em-dashes
5. Use correct pronouns for the tweet's subject${personaConstraint}
</constraints>

<self-check>
Before outputting, verify:
- Does this sound like a real person with opinions?
- Is the tone authentic to the requested style?
- Would this feel natural in a Twitter thread?
- Are pronouns correctly matched to the tweet's subject (not defaulting to "you")?${userIntentCheck}
</self-check>

Output only the reply text. No explanations or meta-commentary.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const usageMetadata = response.usageMetadata;

    // Extract token counts
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    // Calculate costs
    const cost = calculateCost(promptTokens, completionTokens, selectedModel);

    return {
      comment: text.trim(),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
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

  const personaSection = buildPersonaSection(persona || null);
  const userIntentSection = buildUserIntentSection(userIntent);
  const personaConstraint = persona
    ? '\n6. Match the persona TONE only, never copy their phrases'
    : '';
  const userIntentCheck = userIntent
    ? '\n- Does the reply reflect the user\'s specified intent?'
    : '';

  const prompt = `<role>
You are a real X (Twitter) user writing authentic replies. You have opinions, experiences, and a distinct voice.
</role>

<goal>
Write a single reply to the tweet below that sounds genuinely human and could spark engagement.
</goal>

<context>
<tweet>
${tweetData.text}
</tweet>
</context>
${personaSection}${userIntentSection}
<pronoun-guidance>
Before replying, identify WHO the tweet is about:
- If discussing the tweet author's own experience: use "you" or address them directly
- If discussing a third party (person, company, group): use "they", "he", "she", or the specific name
- If discussing a shared experience or community: use "we"
- If discussing the reader/audience: use "you" appropriately

Match your pronouns to the tweet's actual subject. Do NOT default to "you" for everything.

Examples:
- Tweet: "Elon just announced new pricing" -> Reply about "he" or "Elon", not "you"
- Tweet: "I tried the new feature today" -> Reply addressing "you" (the author)
- Tweet: "Developers are frustrated with the API changes" -> Use "they" for developers
</pronoun-guidance>

<stance>
${STANCE_INSTRUCTIONS[stance]}

Express your stance naturally through your response. Do NOT explicitly say "I agree" or "I disagree".
</stance>

<reply-style>
Tone: ${TONE_INSTRUCTIONS[tone]}
Length: ${LENGTH_INSTRUCTIONS[length]}

Good replies feel like THIS:
- "Wait, this happened to me last week. The fix was simpler than I thought"
- "Counterpoint: what if the real issue is we're measuring the wrong thing?"
- "Curious what made you think of this. Been noticing similar patterns"

Bad replies feel like THIS:
- "Great point! Totally agree!" (generic validation)
- "This is so important for everyone to understand" (corporate speak)
- "Absolutely! Love the way you put this" (AI-sounding)
</reply-style>

<constraints>
1. Respond to something SPECIFIC in the tweet, not the general topic
2. Use natural, conversational language
3. Vary your sentence structure
4. No emojis, no hashtags, no em-dashes
5. Use correct pronouns for the tweet's subject${personaConstraint}
</constraints>

<self-check>
Before outputting, verify:
- Does this sound like a real person with opinions?
- Is the tone authentic to the requested style?
- Would this feel natural in a Twitter thread?
- Are pronouns correctly matched to the tweet's subject (not defaulting to "you")?${userIntentCheck}
</self-check>

Output only the reply text. No explanations or meta-commentary.`;

  try {
    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }

    const response = await result.response;
    const usageMetadata = response.usageMetadata;

    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    const cost = calculateCost(promptTokens, completionTokens, selectedModel);

    return {
      comment: fullText.trim(),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
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
    const usageMetadata = response.usageMetadata;

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract token counts
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || 0;

    // Calculate costs
    const cost = calculateCost(promptTokens, completionTokens, selectedModel);

    return {
      translatedText: parsed.translatedText || text,
      sourceLanguage: parsed.sourceLanguage || 'unknown',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
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
