# Xcho (Chrome Extension)

AI-powered reply assistant for X (Twitter) using Google Gemini.

## Features

- Automatically extracts tweet content when you click on a tweet
- Generates contextual replies using Google Gemini AI
- 4 tone options: Friendly, Professional, Empathetic, Humorous
- 4 stance options: Agree, Disagree, Question, Neutral
- 3 length options: Short, Medium, Long
- User intent input: Guide reply direction in Korean or English
- Persona analysis: Upload your writings to generate replies in your voice
- Model selection: Gemini 3 Flash / Pro
- Streaming response display
- Tweet translation to Korean
- Comment explanation: Korean translation + relevance analysis
- Per-tweet result caching (restored when switching between tweets)
- Session state persistence (survives side panel close/reopen)
- Edit and copy generated comments
- Token usage and cost tracking

## Architecture

Xcho is a Chrome Extension (Manifest V3) with three components:

- **Content Script** — Injected into X.com, detects tweet clicks and extracts tweet data
- **Background Service Worker** — Manages side panel lifecycle and caches tweet data per tab
- **Side Panel** — React-based UI for comment generation with settings and persona management

See [docs/architecture.md](docs/architecture.md) for detailed message flows and state management.

## Tech Stack

- **Language**: TypeScript
- **Build Tool**: Vite
- **UI Framework**: React
- **LLM**: Google Gemini API
- **Manifest**: Chrome Extension Manifest V3

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

Development mode (with hot reload):
```bash
npm run dev
```

Production build:
```bash
npm run build
```

### 3. Load Extension in Chrome

1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder

### 4. Configure Gemini API Key

1. Get an API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Open the extension Side Panel and enter your API key in Settings

## Usage

1. Go to X (Twitter) website
2. Click on a tweet you want to reply to
3. The Side Panel opens automatically (or click the extension icon)
4. Select your preferred tone and length
5. Click "Generate Comment"
6. Review and edit the generated reply
7. Click "Copy" and paste into the tweet reply box

## Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Watch mode for development
```

Tests cover utility functions (Gemini API helpers, storage wrapper, persona management). See [docs/development.md](docs/development.md) for testing guide.

## Project Structure

```
xcho/
├── src/
│   ├── background/       # Background service worker
│   ├── content/          # Content script (tweet extraction + X page interaction)
│   ├── sidepanel/        # React-based Side Panel UI
│   ├── utils/            # Utility functions (Gemini API, Storage, Persona)
│   └── types/            # TypeScript type definitions
├── tests/                # Vitest test suite
│   ├── mocks/            # Chrome API and Gemini SDK mocks
│   └── utils/            # Utility function tests
├── docs/                 # Project documentation
├── icons/                # Extension icons
├── manifest.json         # Chrome Extension configuration
├── sidepanel.html        # Side Panel HTML entry
└── vite.config.ts        # Vite build + test configuration
```

## Documentation

- [Architecture](docs/architecture.md) — Component overview, message flow, state management, caching
- [Prompt Engineering](docs/prompt-engineering.md) — Prompt structure, design decisions, persona integration
- [Development Guide](docs/development.md) — Setup, workflow, testing, debugging, adding features

## Notes

- Your Gemini API key is stored locally and never transmitted externally
- API usage may incur charges to your Google account
- Always review generated replies before posting

## License

MIT
