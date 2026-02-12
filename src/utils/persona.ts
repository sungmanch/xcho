import { PersonaData } from '../types';
import { storage } from './storage';
import { getClient } from './gemini';

const MODEL_NAME = 'gemini-3-pro-preview';

// Gemini 3 Pro optimized prompt using:
// - XML tags for clear section boundaries
// - Context-first, instructions-last ordering
// - Explicit schema with field descriptions
// - Direct, concise language (no filler)
const ANALYSIS_PROMPT = `You are a writing style analyst specializing in digital communication patterns.

<context>
The following texts are written by a single person. Your task is to extract their unique communication fingerprint for generating personalized social media replies.
</context>

<writings>
`;

export async function analyzeWritings(
  writings: string[],
  apiKey: string
): Promise<PersonaData> {
  if (!apiKey) {
    throw new Error('API key is required for analysis');
  }

  if (writings.length === 0) {
    throw new Error('No writings provided for analysis');
  }

  const genAI = getClient(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // Combine writings with separators
  const combinedWritings = writings
    .map((w, i) => `--- Writing ${i + 1} ---\n${w}`)
    .join('\n\n');

  // Limit to prevent token overflow (roughly 50k chars)
  const truncatedWritings = combinedWritings.slice(0, 50000);

  // Complete the prompt with task instructions and schema (placed after context per Gemini 3 best practices)
  const analysisInstructions = `
</writings>

<task>
Analyze these writings to extract a persona profile. Focus on patterns that would help generate authentic social media replies in this person's voice.
</task>

<schema>
Return a JSON object with this structure:
{
  "writingStyle": {
    "sentenceLength": "short|medium|long" (based on average word count per sentence),
    "formality": "casual|neutral|formal" (vocabulary and structure analysis),
    "humor": true|false (presence of jokes, wit, or playful language),
    "directness": "direct|indirect" (gets to point vs builds up context)
  },
  "opinionStyle": {
    "hookPattern": "question|bold-claim|reframe|observation" (how they open an opinion — do they ask a provocative question, make a bold claim, reframe the issue, or start with an observation?),
    "argumentStyle": "evidence|analogy|reframe|direct-assertion" (how they back up their take — with data/evidence, analogies, reframing the problem, or just asserting directly?)
  },
  "commonPhrases": ["..."] (5-10 signature expressions, transitions, or verbal tics),
  "topics": ["..."] (3-7 recurring themes or subject areas),
  "exampleResponses": ["..."] (3-5 short replies in this person's authentic voice)
}
</schema>

<rules>
- Base analysis strictly on the provided writings
- For exampleResponses: generate realistic 1-2 sentence social media replies
- Return raw JSON only, no markdown formatting
</rules>`;

  const prompt = ANALYSIS_PROMPT + truncatedWritings + analysisInstructions;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: parsed.writingStyle?.sentenceLength || 'medium',
        formality: parsed.writingStyle?.formality || 'neutral',
        humor: parsed.writingStyle?.humor || false,
        directness: parsed.writingStyle?.directness || 'direct',
      },
      ...(parsed.opinionStyle && {
        opinionStyle: {
          hookPattern: parsed.opinionStyle.hookPattern || 'bold-claim',
          argumentStyle: parsed.opinionStyle.argumentStyle || 'direct-assertion',
        },
      }),
      commonPhrases: parsed.commonPhrases || [],
      topics: parsed.topics || [],
      exampleResponses: parsed.exampleResponses || [],
      lastAnalyzed: new Date().toISOString(),
    };

    return persona;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Persona analysis failed: ${error.message}`);
    }
    throw new Error('Failed to analyze writings');
  }
}

export async function savePersona(persona: PersonaData): Promise<void> {
  await storage.set('persona', persona);
}

export async function loadPersona(): Promise<PersonaData | null> {
  const persona = await storage.get('persona');
  return persona || null;
}

export async function saveRawWritings(writings: string[]): Promise<void> {
  await storage.set('rawWritings', writings);
}

export async function loadRawWritings(): Promise<string[]> {
  const writings = await storage.get('rawWritings');
  return writings || [];
}

export async function clearPersona(): Promise<void> {
  await storage.remove('persona');
  await storage.remove('rawWritings');
}
