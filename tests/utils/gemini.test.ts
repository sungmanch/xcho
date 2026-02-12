import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isKoreanText, calculateCost, buildPersonaSection, buildUserIntentSection } from '../../src/utils/gemini';
import type { PersonaData } from '../../src/types';

// ─── isKoreanText ───────────────────────────────────────────────────────────

describe('isKoreanText', () => {
  it('returns true for pure Korean text', () => {
    expect(isKoreanText('안녕하세요 반갑습니다')).toBe(true);
  });

  it('returns false for English text', () => {
    expect(isKoreanText('Hello, how are you?')).toBe(false);
  });

  it('returns true for mixed text above 30% Korean', () => {
    // "안녕 hi" → 2 Korean chars out of 4 non-space chars = 50%
    expect(isKoreanText('안녕 hi')).toBe(true);
  });

  it('returns false for mixed text below 30% Korean', () => {
    // "가 abcdefghij" → 1 Korean char out of 11 non-space chars ≈ 9%
    expect(isKoreanText('가 abcdefghij')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isKoreanText('')).toBe(false);
  });

  it('returns false at exactly 30% Korean (uses > not >=)', () => {
    // We need exactly 30%: 3 Korean chars out of 10 total non-space chars
    // "가나다abcdefg" → 3 Korean / 10 total = 0.3 exactly → false
    expect(isKoreanText('가나다abcdefg')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isKoreanText('   ')).toBe(false);
  });
});

// ─── calculateCost ──────────────────────────────────────────────────────────

describe('calculateCost', () => {
  it('calculates cost for flash model correctly', () => {
    // gemini-3-flash-preview: input $0.50/1M, output $3.00/1M
    const result = calculateCost(1_000_000, 1_000_000, 'gemini-3-flash-preview');
    expect(result.inputCost).toBeCloseTo(0.50);
    expect(result.outputCost).toBeCloseTo(3.00);
    expect(result.totalCost).toBeCloseTo(3.50);
  });

  it('calculates cost for pro model correctly', () => {
    // gemini-3-pro-preview: input $2.00/1M, output $12.00/1M
    const result = calculateCost(1_000_000, 1_000_000, 'gemini-3-pro-preview');
    expect(result.inputCost).toBeCloseTo(2.00);
    expect(result.outputCost).toBeCloseTo(12.00);
    expect(result.totalCost).toBeCloseTo(14.00);
  });

  it('returns zero costs for 0 tokens', () => {
    const result = calculateCost(0, 0, 'gemini-3-flash-preview');
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('falls back to gemini-2.0-flash pricing for unknown model', () => {
    // gemini-2.0-flash: input $0.10/1M, output $0.40/1M
    const result = calculateCost(1_000_000, 1_000_000, 'unknown-model-xyz');
    expect(result.inputCost).toBeCloseTo(0.10);
    expect(result.outputCost).toBeCloseTo(0.40);
    expect(result.totalCost).toBeCloseTo(0.50);
  });

  it('calculates fractional token counts correctly', () => {
    // 500 input tokens on pro: (500 / 1M) * 2.00 = 0.001
    const result = calculateCost(500, 1000, 'gemini-3-pro-preview');
    expect(result.inputCost).toBeCloseTo(0.001);
    expect(result.outputCost).toBeCloseTo(0.012);
    expect(result.totalCost).toBeCloseTo(0.013);
  });
});

// ─── buildPersonaSection ────────────────────────────────────────────────────

describe('buildPersonaSection', () => {
  it('returns empty string for null persona', () => {
    expect(buildPersonaSection(null)).toBe('');
  });

  it('includes all traits for casual/direct/humor/short persona', () => {
    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: 'short',
        formality: 'casual',
        humor: true,
        directness: 'direct',
      },
      commonPhrases: [],
      topics: [],
      exampleResponses: [],
      lastAnalyzed: new Date().toISOString(),
    };

    const result = buildPersonaSection(persona);
    expect(result).toContain('conversational and relaxed');
    expect(result).toContain('gets to the point quickly');
    expect(result).toContain('comfortable with wit and playfulness');
    expect(result).toContain('punchy rhythm');
    expect(result).toContain('<persona-tone>');
    expect(result).toContain('</persona-tone>');
  });

  it('includes formal and indirect traits', () => {
    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: 'long',
        formality: 'formal',
        humor: false,
        directness: 'indirect',
      },
      commonPhrases: [],
      topics: [],
      exampleResponses: [],
      lastAnalyzed: new Date().toISOString(),
    };

    const result = buildPersonaSection(persona);
    expect(result).toContain('polished and measured');
    expect(result).toContain('builds context before making the point');
    expect(result).toContain('flowing, developed thoughts');
    expect(result).not.toContain('comfortable with wit');
  });

  it('includes neutral formality and medium sentence length', () => {
    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: 'medium',
        formality: 'neutral',
        humor: false,
        directness: 'direct',
      },
      commonPhrases: [],
      topics: [],
      exampleResponses: [],
      lastAnalyzed: new Date().toISOString(),
    };

    const result = buildPersonaSection(persona);
    expect(result).toContain('balanced tone');
    // medium sentence length has no extra trait
    expect(result).not.toContain('punchy rhythm');
    expect(result).not.toContain('flowing');
  });

  it('includes opinion style guide when opinionStyle is present', () => {
    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: 'medium',
        formality: 'casual',
        humor: false,
        directness: 'direct',
      },
      opinionStyle: {
        hookPattern: 'question',
        argumentStyle: 'analogy',
      },
      commonPhrases: [],
      topics: [],
      exampleResponses: [],
      lastAnalyzed: new Date().toISOString(),
    };

    const result = buildPersonaSection(persona);
    expect(result).toContain('Opinion expression style');
    expect(result).toContain('Open with a provocative or probing question');
    expect(result).toContain('Use analogies and comparisons to make the point land');
  });

  it('does not include opinion section when opinionStyle is absent', () => {
    const persona: PersonaData = {
      writingStyle: {
        sentenceLength: 'medium',
        formality: 'casual',
        humor: false,
        directness: 'direct',
      },
      commonPhrases: [],
      topics: [],
      exampleResponses: [],
      lastAnalyzed: new Date().toISOString(),
    };

    const result = buildPersonaSection(persona);
    expect(result).not.toContain('Opinion expression style');
  });
});

// ─── buildUserIntentSection ─────────────────────────────────────────────────

describe('buildUserIntentSection', () => {
  it('returns empty string for undefined input', () => {
    expect(buildUserIntentSection(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(buildUserIntentSection('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(buildUserIntentSection('   ')).toBe('');
  });

  it('wraps normal input in user-intent tags with trimmed text', () => {
    const result = buildUserIntentSection('  be sarcastic about this  ');
    expect(result).toContain('<user-intent>');
    expect(result).toContain('</user-intent>');
    expect(result).toContain('"be sarcastic about this"');
    // Should not have leading/trailing spaces inside quotes
    expect(result).not.toContain('"  be sarcastic');
  });

  it('includes instruction text about intent incorporation', () => {
    const result = buildUserIntentSection('test intent');
    expect(result).toContain('Incorporate this intent naturally');
    expect(result).toContain('If the intent is in Korean');
  });
});

// ─── getClient (singleton caching) ──────────────────────────────────────────

describe('getClient', () => {
  beforeEach(async () => {
    // Reset the module to clear the cached client singleton
    vi.resetModules();
  });

  it('returns same client for same API key', async () => {
    const { getClient } = await import('../../src/utils/gemini');
    const client1 = getClient('test-key-123');
    const client2 = getClient('test-key-123');
    expect(client1).toBe(client2);
  });

  it('returns new client for different API key', async () => {
    const { getClient } = await import('../../src/utils/gemini');
    const client1 = getClient('key-aaa');
    const client2 = getClient('key-bbb');
    expect(client1).not.toBe(client2);
  });

  it('replaces cached client when key changes', async () => {
    const { getClient } = await import('../../src/utils/gemini');
    const client1 = getClient('key-aaa');
    const _client2 = getClient('key-bbb');
    const client3 = getClient('key-bbb');
    // client3 should match client2 (same key), but not client1
    expect(client3).toBe(_client2);
    expect(client3).not.toBe(client1);
  });
});
