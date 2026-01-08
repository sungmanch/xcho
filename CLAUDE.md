# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xcho is a Chrome extension that generates AI-powered reply suggestions for X (Twitter). It uses Google Gemini API to create personalized, authentic-sounding comments based on selected tweets.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Development mode with hot reload
npm run build        # Production build (outputs to dist/)
```

After building, load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` folder

## Architecture

### Chrome Extension Structure (Manifest V3)

The extension uses three interconnected components that communicate via Chrome's messaging API:

1. **Content Script** ([src/content/index.ts](src/content/index.ts))
   - Injected into x.com/twitter.com pages
   - Detects tweet clicks and extracts tweet data using DOM selectors (`[data-testid="tweetText"]`, `[data-testid="User-Name"]`)
   - Handles both timeline view (article elements) and detail page (direct extraction)
   - Uses MutationObserver to detect SPA navigation (URL changes)

2. **Background Service Worker** ([src/background/index.ts](src/background/index.ts))
   - Manages side panel lifecycle
   - Caches tweet data per tab (Map<tabId, TweetData>) to handle timing issues between content script and side panel
   - Cleans up cache when tabs close

3. **Side Panel UI** ([src/sidepanel/App.tsx](src/sidepanel/App.tsx))
   - React-based UI for comment generation
   - Requests cached tweet data from background on mount (handles race conditions)
   - Settings modal for API key and persona configuration

### Message Flow

```
User clicks tweet → Content Script extracts data → sends TWEET_CLICKED message
→ Background caches data + opens side panel → Side panel requests GET_CURRENT_TWEET
→ Background returns cached data → UI displays tweet + generation options
```

### Key Utilities

- [src/utils/gemini.ts](src/utils/gemini.ts): LLM integration with structured prompting (role/goal/context/constraints pattern), token tracking, and cost calculation
- [src/utils/persona.ts](src/utils/persona.ts): Writing style analysis from uploaded documents, extracts formality/directness/humor traits
- [src/utils/storage.ts](src/utils/storage.ts): Typed wrapper around chrome.storage.local

### Type Definitions

All shared types are in [src/types/index.ts](src/types/index.ts) including `TweetData`, `PersonaData`, `MessagePayload`, and token/cost tracking interfaces.

## Extension Debugging

See [DEBUGGING.md](DEBUGGING.md) for step-by-step debugging guide. Key debugging points:
- Content script: Check X.com page console for emoji-prefixed logs
- Background worker: Click "service worker" link in chrome://extensions/
- Side panel: Right-click inside panel → Inspect

## Configuration

- Gemini API key stored in chrome.storage.local
- Current model: `gemini-3-pro-preview` (configurable in gemini.ts)
- Model pricing defined in MODEL_PRICING constant for cost tracking
