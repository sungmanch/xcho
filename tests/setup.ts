/**
 * Global test setup for Vitest
 *
 * Registers chrome.storage.local, chrome.storage.session, and
 * chrome.runtime mocks on globalThis.chrome before each test.
 */

import { createChromeStorageMock } from './mocks/chrome';

const localMock = createChromeStorageMock();
const sessionMock = createChromeStorageMock();

// Register global chrome mock
Object.defineProperty(globalThis, 'chrome', {
  value: {
    storage: {
      local: localMock,
      session: sessionMock,
    },
    runtime: {
      sendMessage: vi.fn(async () => ({})),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
    },
  },
  writable: true,
  configurable: true,
});

function resetStorageMock(mock: ReturnType<typeof createChromeStorageMock>): void {
  mock._reset();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  mock.clear.mockClear();
}

// Reset all mocks and in-memory stores between tests
beforeEach(() => {
  resetStorageMock(localMock);
  resetStorageMock(sessionMock);
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
  (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockClear();
});
