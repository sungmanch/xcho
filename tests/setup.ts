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

// Reset all mocks and in-memory stores between tests
beforeEach(() => {
  localMock._reset();
  localMock.get.mockClear();
  localMock.set.mockClear();
  localMock.remove.mockClear();
  localMock.clear.mockClear();

  sessionMock._reset();
  sessionMock.get.mockClear();
  sessionMock.set.mockClear();
  sessionMock.remove.mockClear();
  sessionMock.clear.mockClear();

  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
  (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mockClear();
});
