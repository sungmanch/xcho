import { describe, it, expect } from 'vitest';
import { storage, sessionStorage } from '../../src/utils/storage';

// ─── storage (chrome.storage.local) ─────────────────────────────────────────

describe('storage (chrome.storage.local)', () => {
  it('get/set roundtrip returns the same value', async () => {
    await storage.set('apiKey', 'test-api-key-123');
    const result = await storage.get('apiKey');
    expect(result).toBe('test-api-key-123');
  });

  it('get returns undefined for non-existent key', async () => {
    const result = await storage.get('apiKey');
    expect(result).toBeUndefined();
  });

  it('remove makes get return undefined', async () => {
    await storage.set('apiKey', 'to-be-removed');
    await storage.remove('apiKey');
    const result = await storage.get('apiKey');
    expect(result).toBeUndefined();
  });

  it('clear removes all keys', async () => {
    await storage.set('apiKey', 'key-1');
    await storage.set('preferredTone', 'friendly');
    await storage.clear();

    const key = await storage.get('apiKey');
    const tone = await storage.get('preferredTone');
    expect(key).toBeUndefined();
    expect(tone).toBeUndefined();
  });

  it('getAll returns all stored data', async () => {
    await storage.set('apiKey', 'my-key');
    await storage.set('preferredTone', 'humorous');
    await storage.set('selectedModel', 'gemini-3-pro-preview');

    const all = await storage.getAll();
    expect(all).toEqual({
      apiKey: 'my-key',
      preferredTone: 'humorous',
      selectedModel: 'gemini-3-pro-preview',
    });
  });

  it('set overwrites existing value', async () => {
    await storage.set('apiKey', 'old-key');
    await storage.set('apiKey', 'new-key');
    const result = await storage.get('apiKey');
    expect(result).toBe('new-key');
  });

  it('stores complex objects like persona', async () => {
    const persona = {
      writingStyle: {
        sentenceLength: 'short' as const,
        formality: 'casual' as const,
        humor: true,
        directness: 'direct' as const,
      },
      commonPhrases: ['honestly', 'the thing is'],
      topics: ['tech', 'AI'],
      exampleResponses: ['Great take on this'],
      lastAnalyzed: '2024-01-01T00:00:00.000Z',
    };
    await storage.set('persona', persona);
    const result = await storage.get('persona');
    expect(result).toEqual(persona);
  });
});

// ─── sessionStorage (chrome.storage.session) ────────────────────────────────

describe('sessionStorage (chrome.storage.session)', () => {
  it('get/set roundtrip returns the same value', async () => {
    const state = {
      tweetData: { text: 'Hello world', author: '@test' },
      generatedComment: 'Nice tweet!',
      tokenUsage: null,
      tokenCost: null,
      currentModel: 'gemini-3-flash-preview',
      commentExplanation: null,
      lastUpdated: Date.now(),
    };
    await sessionStorage.set('sidePanelState', state);
    const result = await sessionStorage.get('sidePanelState');
    expect(result).toEqual(state);
  });

  it('get returns undefined for non-existent key', async () => {
    const result = await sessionStorage.get('tweetCache');
    expect(result).toBeUndefined();
  });

  it('remove makes get return undefined', async () => {
    await sessionStorage.set('tweetCache', { tweet1: { text: 'hello' } });
    await sessionStorage.remove('tweetCache');
    const result = await sessionStorage.get('tweetCache');
    expect(result).toBeUndefined();
  });

  it('clear removes all keys', async () => {
    await sessionStorage.set('tweetCache', { t1: { text: 'a' } });
    await sessionStorage.set('sidePanelState', {
      tweetData: null,
      generatedComment: '',
      tokenUsage: null,
      tokenCost: null,
      currentModel: 'gemini-3-flash-preview',
      commentExplanation: null,
      lastUpdated: 0,
    });
    await sessionStorage.clear();

    const cache = await sessionStorage.get('tweetCache');
    const state = await sessionStorage.get('sidePanelState');
    expect(cache).toBeUndefined();
    expect(state).toBeUndefined();
  });

  it('getAll returns all stored session data', async () => {
    const tweetCache = { t1: { text: 'tweet text' } };
    await sessionStorage.set('tweetCache', tweetCache);

    const all = await sessionStorage.getAll();
    expect(all).toEqual({ tweetCache });
  });

  it('stores tweetResultsCache correctly', async () => {
    const resultsCache = {
      'tweet-abc': {
        generatedComment: 'Great point',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        tokenCost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03 },
        currentModel: 'gemini-3-flash-preview',
        commentExplanation: null,
        lastUpdated: Date.now(),
      },
    };
    await sessionStorage.set('tweetResultsCache', resultsCache);
    const result = await sessionStorage.get('tweetResultsCache');
    expect(result).toEqual(resultsCache);
  });
});
