import { GoogleGenerativeAI } from '@google/generative-ai';
import { TweetData, CommentTone, CommentLength, TokenCost, GenerationResult, PersonaData } from '../types';

// Current model - Gemini 3 Pro for higher quality comment generation
const MODEL_NAME = 'gemini-3-pro-preview';

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

export async function generateComment(
  tweetData: TweetData,
  tone: CommentTone,
  apiKey: string,
  persona?: PersonaData | null,
  length: CommentLength = 'medium'
): Promise<GenerationResult> {
  if (!apiKey) {
    throw new Error('API key is not configured.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 1.0,  // Gemini 3 Pro optimal - 2.0 causes looping/degraded output
    }
  });

  const personaSection = buildPersonaSection(persona || null);
  const personaConstraint = persona
    ? '\n5. Match the persona TONE only, never copy their phrases'
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
${personaSection}
<stance-guidance>
Before writing, decide your position on the tweet:
- AGREE: Build on their point with your own angle
- DISAGREE: Respectfully challenge with a different perspective
- NEUTRAL: Ask a question or share a related observation

You do NOT need to acknowledge agreement/disagreement explicitly. Just respond naturally from your chosen stance.
</stance-guidance>

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
4. No emojis, no hashtags, no em-dashes${personaConstraint}
</constraints>

<self-check>
Before outputting, verify:
- Does this sound like a real person with opinions?
- Is the tone authentic to the requested style?
- Would this feel natural in a Twitter thread?
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
    const cost = calculateCost(promptTokens, completionTokens, MODEL_NAME);

    return {
      comment: text.trim(),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
      cost,
      model: MODEL_NAME
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate comment: ${error.message}`);
    }
    throw new Error('An error occurred while generating the comment.');
  }
}
