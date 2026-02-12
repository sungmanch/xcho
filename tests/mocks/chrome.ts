/**
 * Chrome Storage Mock Factory
 *
 * Creates an in-memory mock of chrome.storage areas (local/session).
 * Each method returns a Promise, matching the real Chrome API behavior.
 */

export function createChromeStorageMock() {
  let store = new Map<string, unknown>();

  return {
    get: vi.fn(async (key: string | string[] | null) => {
      if (key === null) {
        // Return all stored data
        const result: Record<string, unknown> = {};
        for (const [k, v] of store) {
          result[k] = v;
        }
        return result;
      }
      if (Array.isArray(key)) {
        const result: Record<string, unknown> = {};
        for (const k of key) {
          if (store.has(k)) {
            result[k] = store.get(k);
          }
        }
        return result;
      }
      if (store.has(key)) {
        return { [key]: store.get(key) };
      }
      return {};
    }),

    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) {
        store.set(k, v);
      }
    }),

    remove: vi.fn(async (key: string | string[]) => {
      if (Array.isArray(key)) {
        for (const k of key) {
          store.delete(k);
        }
      } else {
        store.delete(key);
      }
    }),

    clear: vi.fn(async () => {
      store.clear();
    }),

    /** Reset the internal store (useful in beforeEach) */
    _reset: () => {
      store.clear();
    },
  };
}
