import { describe, it, expect } from 'vitest';
import { savePersona, loadPersona, saveRawWritings, loadRawWritings, clearPersona } from '../../src/utils/persona';
import type { PersonaData } from '../../src/types';

const mockPersona: PersonaData = {
  writingStyle: {
    sentenceLength: 'short',
    formality: 'casual',
    humor: true,
    directness: 'direct',
  },
  opinionStyle: {
    hookPattern: 'bold-claim',
    argumentStyle: 'direct-assertion',
  },
  commonPhrases: ['honestly', 'look'],
  topics: ['tech', 'startups'],
  exampleResponses: ['Hot take but this is spot on'],
  lastAnalyzed: '2024-06-01T00:00:00.000Z',
};

// ─── savePersona / loadPersona ──────────────────────────────────────────────

describe('savePersona / loadPersona', () => {
  it('roundtrip: save then load returns same persona', async () => {
    await savePersona(mockPersona);
    const loaded = await loadPersona();
    expect(loaded).toEqual(mockPersona);
  });

  it('loadPersona returns null when no persona is saved', async () => {
    const loaded = await loadPersona();
    expect(loaded).toBeNull();
  });

  it('overwrites existing persona on re-save', async () => {
    await savePersona(mockPersona);
    const updatedPersona: PersonaData = {
      ...mockPersona,
      writingStyle: { ...mockPersona.writingStyle, formality: 'formal' },
      lastAnalyzed: '2024-07-01T00:00:00.000Z',
    };
    await savePersona(updatedPersona);
    const loaded = await loadPersona();
    expect(loaded?.writingStyle.formality).toBe('formal');
  });
});

// ─── saveRawWritings / loadRawWritings ──────────────────────────────────────

describe('saveRawWritings / loadRawWritings', () => {
  it('roundtrip: save then load returns same writings', async () => {
    const writings = ['First writing sample', 'Second writing sample'];
    await saveRawWritings(writings);
    const loaded = await loadRawWritings();
    expect(loaded).toEqual(writings);
  });

  it('loadRawWritings returns empty array when no data', async () => {
    const loaded = await loadRawWritings();
    expect(loaded).toEqual([]);
  });

  it('overwrites existing writings on re-save', async () => {
    await saveRawWritings(['old']);
    await saveRawWritings(['new1', 'new2']);
    const loaded = await loadRawWritings();
    expect(loaded).toEqual(['new1', 'new2']);
  });
});

// ─── clearPersona ───────────────────────────────────────────────────────────

describe('clearPersona', () => {
  it('removes both persona and rawWritings', async () => {
    await savePersona(mockPersona);
    await saveRawWritings(['sample text']);

    await clearPersona();

    const persona = await loadPersona();
    const writings = await loadRawWritings();
    expect(persona).toBeNull();
    expect(writings).toEqual([]);
  });

  it('does not throw when clearing already empty storage', async () => {
    await expect(clearPersona()).resolves.not.toThrow();
  });
});
