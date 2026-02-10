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
export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

export interface StorageData {
  apiKey?: string;
  preferredTone?: CommentTone;
  preferredLength?: CommentLength;
  preferredStance?: CommentStance;
  selectedModel?: GeminiModel;
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

// Translation result from AI translation
export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  usage: TokenUsage;
  cost: TokenCost;
  model: string;
}

// Cache for storing translations
export interface TranslationCacheEntry {
  translatedText: string;
  sourceLanguage: string;
  timestamp: number;
}

export interface TranslationCache {
  [key: string]: TranslationCacheEntry;
}

// Comment explanation (Korean translation + relevance)
export interface CommentExplanation {
  koreanTranslation: string;
  relevanceReason: string;
}

export interface ExplanationResult {
  explanation: CommentExplanation;
  usage: TokenUsage;
  cost: TokenCost;
  model: string;
}

// Session storage for state persistence across sidepanel reopens
export interface SessionStorageData {
  tweetCache?: Record<string, TweetData>;
  sidePanelState?: SidePanelState;
}

export interface SidePanelState {
  tweetData: TweetData | null;
  generatedComment: string;
  tokenUsage: TokenUsage | null;
  tokenCost: TokenCost | null;
  currentModel: string;
  commentExplanation: CommentExplanation | null;
  lastUpdated: number;
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
