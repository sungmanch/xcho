export interface TweetData {
  text: string;
  author?: string;
  url?: string;
}

export interface CommentSuggestion {
  text: string;
  tone: CommentTone;
}

export type CommentTone = 'friendly' | 'professional' | 'empathetic' | 'humorous';
export type CommentLength = 'short' | 'medium' | 'long';
export type CommentStance = 'agree' | 'disagree' | 'question' | 'neutral';

export interface StorageData {
  apiKey?: string;
  preferredTone?: CommentTone;
  preferredLength?: CommentLength;
  preferredStance?: CommentStance;
  persona?: PersonaData;
  rawWritings?: string[];
}

export interface MessagePayload {
  type: 'TWEET_CLICKED' | 'GENERATE_COMMENT' | 'OPEN_SIDEPANEL' | 'GET_CURRENT_TWEET';
  data?: TweetData | CommentSuggestion | any;
}

// Token usage and cost tracking
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface GenerationResult {
  comment: string;
  usage: TokenUsage;
  cost: TokenCost;
  model: string;
}

// Persona data for personalized responses
export interface PersonaData {
  writingStyle: {
    sentenceLength: 'short' | 'medium' | 'long';
    formality: 'casual' | 'neutral' | 'formal';
    humor: boolean;
    directness: 'direct' | 'indirect';
  };
  commonPhrases: string[];
  topics: string[];
  exampleResponses: string[];
  lastAnalyzed: string;
}
