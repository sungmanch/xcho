# Architecture

Xcho is a Chrome extension (Manifest V3) with three interconnected runtime layers that communicate via Chrome's messaging API. This document explains how data flows between those layers, how state is managed, and how tweet data is extracted from X's DOM.

## Component Overview

### Content Script (`src/content/index.ts`, `src/content/extractors.ts`)

Injected into every `x.com` and `twitter.com` page at `document_idle`. Its sole job is to detect tweet interactions and extract tweet data from the DOM.

- Listens for click events on the page (capture phase)
- Detects SPA navigation via `MutationObserver` on `document.body`
- Auto-detects tweet data when navigating to a tweet detail page (`/status/:id`)
- Sends `TWEET_CLICKED` messages to the background service worker

The content script has no state of its own beyond a `lastUrl` string for tracking SPA navigation.

### Background Service Worker (`src/background/index.ts`)

The central coordinator. It receives messages from the content script, caches tweet data per tab, opens the side panel, and serves cached data to the side panel on request.

- Caches tweet data in `chrome.storage.session` keyed by `tabId`
- Opens the side panel via `chrome.sidePanel.open()` when a tweet is clicked
- Responds to `GET_CURRENT_TWEET` requests from the side panel
- Cleans up cached tweet data when tabs close (`chrome.tabs.onRemoved`)
- Handles extension icon clicks to manually open the side panel

### Side Panel (`src/sidepanel/App.tsx`)

A React application rendered in Chrome's side panel. This is where the user interacts with generation options and sees results.

- Requests cached tweet data from the background on mount
- Listens for `TWEET_CLICKED` messages directly (Chrome broadcasts to all extension contexts)
- Manages generation settings (tone, stance, length, model, user intent)
- Streams comment generation via Gemini API
- Auto-generates Korean explanations after comment generation
- Provides tweet translation, persona management, and settings UI

## Message Flow

Two primary message sequences drive the extension:

### Sequence 1: Tweet Click (Content Script to Side Panel)

```
User clicks tweet on X.com
         |
         v
+------------------+
| Content Script   |  1. Click event captured (capture phase)
|                  |  2. Find closest article[data-testid="tweet"]
|                  |  3. Extract text, author, URL via extractors.ts
|                  |  4. Send TWEET_CLICKED message
+--------+---------+
         |
         | chrome.runtime.sendMessage({ type: 'TWEET_CLICKED', data })
         v
+------------------+
| Background       |  5. Cache tweet data in session storage (keyed by tabId)
| Service Worker   |  6. Open side panel via chrome.sidePanel.open()
+--------+---------+
         |
         | Message broadcast to all extension contexts
         v
+------------------+
| Side Panel       |  7. Receive TWEET_CLICKED in onMessage listener
|                  |  8. Save previous tweet's results to per-tweet cache
|                  |  9. Check if new tweet has cached results -> restore or clear
|                  | 10. Display tweet, reset translation state
+------------------+
```

### Sequence 2: Side Panel Opens (Late Join)

When the side panel opens after the tweet click has already been processed, it requests the cached data:

```
Side Panel mounts (useEffect on [])
         |
         v
+------------------+
| Side Panel       |  1. Load settings from chrome.storage.local
|                  |  2. Restore session state from chrome.storage.session
|                  |  3. Send GET_CURRENT_TWEET message
+--------+---------+
         |
         | chrome.runtime.sendMessage({ type: 'GET_CURRENT_TWEET' })
         v
+------------------+
| Background       |  4. Query active tab via chrome.tabs.query()
| Service Worker   |  5. Look up cached tweet for that tabId
|                  |  6. Return cached TweetData (or null)
+--------+---------+
         |
         | sendResponse({ data: cachedTweetData })
         v
+------------------+
| Side Panel       |  7. Check per-tweet results cache for this tweet
|                  |  8. If cached results exist -> restore comment, explanation, etc.
|                  |  9. Otherwise fall back to sidePanelState comparison
|                  | 10. Display tweet data
+------------------+
```

The `return true` in the background's `onMessage` handler is critical -- it tells Chrome to keep the message channel open for the asynchronous `sendResponse` call.

## State Management

Xcho uses four distinct state layers, each with different lifetimes and purposes:

### Layer 1: React Component State (App.tsx)

Ephemeral UI state managed via `useState` hooks. Lost when the side panel closes.

| State | Purpose |
|-------|---------|
| `tweetData` | Currently selected tweet |
| `generatedComment` | Generated reply text (editable) |
| `selectedTone/Length/Stance` | Current generation parameters |
| `selectedModel` | Active Gemini model |
| `userIntent` | Optional freeform intent text |
| `persona` | Loaded PersonaData |
| `translation` | Korean translation of tweet |
| `commentExplanation` | Korean translation + relevance of generated comment |
| `isLoading`, `isTranslating`, etc. | Loading flags |
| `error`, `success` | Notification messages |
| `expandedOption` | Which accordion section is open |
| `isTweetExpanded` | Whether tweet text is fully expanded |

### Layer 2: chrome.storage.local (Persistent)

Survives browser restarts. Used for user preferences and configuration.

| Key | Type | Purpose |
|-----|------|---------|
| `apiKey` | `string` | Gemini API key |
| `preferredTone` | `CommentTone` | Last used tone |
| `preferredLength` | `CommentLength` | Last used length |
| `preferredStance` | `CommentStance` | Last used stance |
| `selectedModel` | `GeminiModel` | Preferred model |
| `persona` | `PersonaData` | Analyzed writing persona |
| `rawWritings` | `string[]` | Uploaded writing samples |

Typed via the `StorageData` interface and accessed through the `storage` wrapper in `src/utils/storage.ts`.

### Layer 3: chrome.storage.session (Session-Scoped)

Persists across side panel reopens within the same browser session, but cleared when Chrome exits.

| Key | Type | Purpose |
|-----|------|---------|
| `tweetCache` | `Record<string, TweetData>` | Per-tab tweet cache (background writes, side panel reads) |
| `sidePanelState` | `SidePanelState` | Last known side panel state for restore |
| `tweetResultsCache` | `Record<string, TweetResults>` | Per-tweet generated results (LRU, max 10) |

Typed via the `SessionStorageData` interface. The background calls `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` at startup so the side panel (untrusted context) can access session storage directly.

### Layer 4: In-Memory Refs

React `useRef` values that persist across renders but are lost on unmount.

| Ref | Type | Purpose |
|-----|------|---------|
| `translationCacheRef` | `Map<string, TranslationCacheEntry>` | Translation cache (keyed by first 100 chars of tweet) |
| `fileInputRef` | `HTMLInputElement` | File input DOM reference for persona upload |

## Caching Strategy

### Per-Tab Tweet Cache (Background)

**Storage:** `chrome.storage.session` under `tweetCache`
**Key:** `String(tabId)`
**Lifetime:** Until tab closes or tweet replaced

When the content script sends a `TWEET_CLICKED` message, the background writes the tweet data keyed by the sender's tab ID. This solves the race condition where the side panel opens before the message arrives -- the panel can request cached data via `GET_CURRENT_TWEET`. Tab closure triggers cleanup via `chrome.tabs.onRemoved`.

### Per-Tweet Results Cache (Side Panel)

**Storage:** `chrome.storage.session` under `tweetResultsCache`
**Key:** First 200 characters of the tweet text
**Lifetime:** Session (LRU eviction at 10 entries)

When switching between tweets, the side panel saves the current tweet's generated results (comment, token usage, cost, explanation) before loading the new tweet. If the user returns to a previously viewed tweet, the cached results are restored instantly without re-generation.

The LRU eviction logic finds the entry with the smallest `lastUpdated` timestamp and removes it when the cache exceeds 10 entries.

### Translation Cache (In-Memory)

**Storage:** `useRef<Map>` in React component
**Key:** First 100 characters of the tweet text
**Lifetime:** Until side panel unmounts

Translations are cached in-memory to avoid redundant API calls when the user toggles the translation panel or revisits the same tweet within a session. This cache is not persisted to storage.

## DOM Extraction

### Two Extraction Modes

X (Twitter) is a single-page application, so tweet DOM structure varies by context:

#### Timeline View (`extractTweetData`)

Used when the user clicks a tweet in the timeline feed:

1. Click handler finds the closest `article[data-testid="tweet"]` ancestor
2. Within that article, queries `[data-testid="tweetText"]` for tweet content
3. Queries `[data-testid="User-Name"]` (with fallbacks to `User-Names` and `UserName`) for author
4. Returns `{ text, author, url }` as `TweetData`

#### Detail Page (`extractMainTweetData`)

Used when the user is on a tweet detail page (`/status/:id`):

1. Detected via regex: `/\/status\/\d+/.test(window.location.pathname)`
2. Queries `document.querySelector('[data-testid="tweetText"]')` directly (no article wrapper)
3. Queries `document.querySelector('[data-testid="User-Name"]')` for author
4. Uses `window.location.href` as the tweet URL

On detail pages there is no wrapping `article` element for the main tweet, so the extraction queries the document directly. A retry mechanism (`tryExtract`) attempts up to 5 times with 500ms delays to handle dynamically loaded content.

### SPA Navigation Handling

X uses client-side routing, so page changes don't trigger new content script injections. Xcho handles this with:

1. **MutationObserver** on `document.body` (childList + subtree) -- any DOM mutation triggers a URL comparison
2. **URL tracking** via `lastUrl` -- when `window.location.href` changes, `handleUrlChange` fires
3. **Delayed detection** -- after a URL change, `autoDetectTweetOnDetailPage` is called with a 500ms delay to allow the new page content to render

This means navigating from the timeline to a tweet detail page (or between detail pages) automatically extracts and sends the new tweet data without requiring the user to click.
