# Xcho (Chrome Extension)

AI-powered reply assistant for X (Twitter) using Google Gemini.

## Features

- Automatically extracts tweet content when you click on a tweet
- Generates contextual replies using Google Gemini AI
- 4 tone options: Friendly, Professional, Empathetic, Humorous
- 3 length options: Short, Medium, Long
- Persona analysis: Upload your writings to generate replies in your voice
- Edit and copy generated comments
- Token usage and cost tracking

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

## Project Structure

```
xcho/
├── src/
│   ├── background/       # Background service worker
│   ├── content/          # Content script (X page interaction)
│   ├── sidepanel/        # React-based Side Panel UI
│   ├── utils/            # Utility functions (Gemini API, Storage, Persona)
│   └── types/            # TypeScript type definitions
├── icons/                # Extension icons
├── manifest.json         # Chrome Extension configuration
├── sidepanel.html        # Side Panel HTML entry
└── vite.config.ts        # Vite build configuration
```

## Notes

- Your Gemini API key is stored locally and never transmitted externally
- API usage may incur charges to your Google account
- Always review generated replies before posting

## License

MIT
