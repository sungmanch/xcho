# Development Guide

This guide covers everything you need to develop, test, debug, and extend Xcho.

## Prerequisites

- **Node.js** >= 18.0.0
- **Chrome** browser (for loading the extension)
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

```bash
# Clone the repository
git clone <repository-url>
cd xcho

# Install dependencies
npm install

# Start development server
npm run dev
```

After the dev server starts, load the extension in Chrome:

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `dist` folder in the project root

## Development Workflow

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Dev | `npm run dev` | Start Vite dev server with HMR |
| Build | `npm run build` | TypeScript check + production build to `dist/` |
| Test | `npm test` | Run test suite once |
| Test (watch) | `npm run test:watch` | Run tests in watch mode |

### Hot Reload Behavior

Xcho uses `@crxjs/vite-plugin` for Chrome extension development with Vite. Reload behavior differs by component:

| Component | Hot reload? | When to manually reload |
|-----------|-------------|------------------------|
| **Side Panel** | Yes (Vite HMR) | Rarely -- HMR handles most changes |
| **Content Script** | No | After any change to `src/content/` |
| **Background Worker** | No | After any change to `src/background/` |
| **Manifest** | No | After any change to `manifest.json` |

**To reload the extension manually:**
1. Go to `chrome://extensions/`
2. Click the refresh button on the Xcho card
3. Refresh the X.com tab (Cmd+Shift+R / Ctrl+Shift+R)

### Build for Production

```bash
npm run build
```

This runs TypeScript type checking (`tsc`) followed by Vite's production build. The output goes to `dist/`. Load this folder as an unpacked extension for production-grade testing.

## Testing

### Framework

Xcho uses **Vitest** with a **jsdom** environment for unit testing.

Configuration lives in `vite.config.ts`:

```typescript
test: {
  globals: true,          // vi, describe, it, expect available globally
  environment: 'jsdom',   // DOM APIs available in tests
  setupFiles: ['./tests/setup.ts'],
  include: ['tests/**/*.test.ts'],
}
```

### Test Structure

```
tests/
  setup.ts              # Global setup: Chrome API mocks, beforeEach cleanup
  mocks/
    chrome.ts           # In-memory chrome.storage mock factory
    gemini.ts           # @google/generative-ai mock factory
```

### Global Test Setup (`tests/setup.ts`)

The setup file registers a `globalThis.chrome` mock before tests run, providing:

- `chrome.storage.local` -- In-memory key-value store (via `createChromeStorageMock`)
- `chrome.storage.session` -- Separate in-memory store
- `chrome.runtime.sendMessage` -- Vitest mock function
- `chrome.runtime.onMessage.addListener/removeListener` -- Vitest mock functions

All mocks are reset between tests via `beforeEach` to prevent state leakage.

### Mock Factories

**Chrome Storage Mock** (`tests/mocks/chrome.ts`):
- Creates an in-memory `Map`-backed implementation of `chrome.storage` areas
- Supports `get` (single key, array, null for all), `set`, `remove`, `clear`
- Exposes `_reset()` for test cleanup and `_store` for inspection

**Gemini Mock** (`tests/mocks/gemini.ts`):
- `createMockGenerativeModel()` -- Returns a model with mock `generateContent` and `generateContentStream`
- `createMockGoogleGenerativeAI()` -- Returns a mock SDK instance with `getGenerativeModel`
- `setupGeminiMock()` -- Calls `vi.mock('@google/generative-ai')` for module-level mocking

### Writing New Tests

1. Create a test file in `tests/` matching the pattern `tests/**/*.test.ts`
2. Chrome APIs are automatically available via the global setup
3. For tests that call Gemini, use `setupGeminiMock()` at module scope:

```typescript
import { setupGeminiMock } from './mocks/gemini';

const mockAI = setupGeminiMock();

describe('generateComment', () => {
  it('should return generated text', async () => {
    // mockAI._mockModel.generateContent is pre-configured
    // to return 'Mock generated response'
    const result = await generateComment(tweetData, 'friendly', 'fake-key');
    expect(result.comment).toBe('Mock generated response');
  });
});
```

4. For storage tests, the global mock handles everything:

```typescript
import { storage } from '../src/utils/storage';

describe('storage', () => {
  it('should persist and retrieve values', async () => {
    await storage.set('apiKey', 'test-key');
    const value = await storage.get('apiKey');
    expect(value).toBe('test-key');
  });
});
```

## Debugging

For a comprehensive step-by-step debugging guide, see [DEBUGGING.md](../DEBUGGING.md).

### Quick Reference

Each extension component has its own console. You need to open the right DevTools to see logs:

| Component | How to access console | Log prefix |
|-----------|----------------------|------------|
| **Content Script** | F12 on the X.com page | Emoji-prefixed (e.g., `[rocket] X Comment Helper content script loaded`) |
| **Background Worker** | chrome://extensions/ -> click "service worker" link | Plain text |
| **Side Panel** | Right-click inside the side panel -> Inspect | Emoji-prefixed |

### Common Issues

**"Failed to send message" in content script console:**
The background service worker has gone inactive. Reload the extension at chrome://extensions/ and refresh the X.com page.

**Tweet text not extracted:**
X.com may have changed its DOM structure. Test the selectors manually in the X.com console:

```javascript
document.querySelector('article[data-testid="tweet"]')
document.querySelector('[data-testid="tweetText"]')?.textContent
```

**Side panel shows "Select a Tweet" after clicking:**
The message didn't reach the side panel. Check that:
1. The background worker received the `TWEET_CLICKED` message
2. The side panel's `GET_CURRENT_TWEET` request returned data

## Adding Features

### New Tone

1. Add the value to `CommentTone` in `src/types/index.ts`:
   ```typescript
   export type CommentTone = 'friendly' | 'professional' | 'empathetic' | 'humorous' | 'sarcastic';
   ```

2. Add tone instruction in `TONE_INSTRUCTIONS` in `src/utils/gemini.ts`:
   ```typescript
   sarcastic: 'Dry and cutting. Says the opposite of what it means with a straight face.'
   ```

3. Add display label in `TONE_LABELS` in `src/sidepanel/App.tsx`:
   ```typescript
   sarcastic: 'Sarcastic'
   ```

### New Model

1. Add the model ID to `GeminiModel` in `src/types/index.ts`:
   ```typescript
   export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-3-ultra-preview';
   ```

2. Add pricing in `MODEL_PRICING` in `src/utils/gemini.ts`:
   ```typescript
   'gemini-3-ultra-preview': { input: 5.00, output: 30.00 },
   ```

3. Add to `AVAILABLE_MODELS` array in `src/utils/gemini.ts`:
   ```typescript
   { id: 'gemini-3-ultra-preview', name: 'Gemini 3 Ultra', description: 'Maximum quality' },
   ```

### New Stance

Follow the same pattern as tones: update `CommentStance` type, add to `STANCE_INSTRUCTIONS` in gemini.ts, add to `STANCE_LABELS` in App.tsx.

### Prompt Modifications

The comment generation prompt lives in both `generateComment` and `generateCommentStream` in `src/utils/gemini.ts`. These two functions contain duplicate prompt templates -- if you modify one, update the other to match.

Key areas to modify:
- `<voice>` section for writing rules
- `STANCE_INSTRUCTIONS` object for stance behavior
- `TONE_INSTRUCTIONS` object for tone descriptions
- `<constraints>` section for numbered rules
- `<self-check>` section for verification items

See [docs/prompt-engineering.md](./prompt-engineering.md) for detailed design rationale.

## Code Conventions

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig.json)
- **No unused locals or parameters** enforced
- **Target:** ES2020
- **Module resolution:** Bundler mode (Vite)
- **JSX:** react-jsx (automatic React import)

### Type Definitions

All shared types live in `src/types/index.ts`:

- `TweetData`, `CommentSuggestion` -- Data models
- `CommentTone`, `CommentLength`, `CommentStance`, `GeminiModel` -- Union type enums
- `StorageData` -- Keys and types for `chrome.storage.local`
- `SessionStorageData` -- Keys and types for `chrome.storage.session`
- `MessagePayload` -- Chrome messaging format with discriminated `type` field
- `TokenUsage`, `TokenCost`, `GenerationResult` -- API result types
- `PersonaData` -- Writing style analysis result
- `TweetResults`, `SidePanelState` -- Cache and session restore types

### Storage

All storage access goes through typed wrappers in `src/utils/storage.ts`:

- `storage.get(key)` / `storage.set(key, value)` -- `chrome.storage.local` with `StorageData` types
- `sessionStorage.get(key)` / `sessionStorage.set(key, value)` -- `chrome.storage.session` with `SessionStorageData` types

Never call `chrome.storage.local` or `chrome.storage.session` directly in the side panel code. The background service worker accesses session storage directly for the tweet cache because it needs lower-level control.

### Message Types

All message types are defined in the `MessagePayload` interface:

```typescript
type: 'TWEET_CLICKED' | 'GENERATE_COMMENT' | 'OPEN_SIDEPANEL' | 'GET_CURRENT_TWEET'
```

When adding a new message type, update this union and handle it in the appropriate listener (background's `onMessage` or side panel's `onMessage`).

## Project Structure

```
xcho/
  manifest.json              # Chrome extension manifest (V3)
  sidepanel.html             # Side panel entry point
  vite.config.ts             # Vite + CRXJS + Vitest config
  tsconfig.json              # TypeScript config (strict mode)
  package.json               # Dependencies and scripts
  src/
    content/
      index.ts               # Content script entry: click handling, SPA nav
      extractors.ts           # DOM extraction: timeline view + detail page
    background/
      index.ts               # Service worker: caching, side panel lifecycle
    sidepanel/
      App.tsx                 # React UI: generation, translation, settings
      App.css                 # Styles
      main.tsx                # React entry point
    types/
      index.ts               # All shared TypeScript interfaces and types
    utils/
      gemini.ts              # Gemini API: prompts, streaming, cost calc
      persona.ts             # Persona analysis: upload, analyze, persist
      storage.ts             # Typed wrappers for chrome.storage
  tests/
    setup.ts                 # Global test setup with Chrome API mocks
    mocks/
      chrome.ts              # In-memory chrome.storage mock
      gemini.ts              # Gemini SDK mock
  docs/
    architecture.md          # System architecture documentation
    prompt-engineering.md    # Prompt design documentation
    development.md           # This file
```
