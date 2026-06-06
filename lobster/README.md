<div align="center">

# 🦞 Lobster

**A private, local AI assistant with real-time browser control, Telegram integration, and a web dashboard.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-%3E%3D5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-FF6B35)](LICENSE)
[![Ollama](https://img.shields.io/badge/ollama-powered-4ade80?logo=ollama)](https://ollama.com)
[![Playwright](https://img.shields.io/badge/playwright-browser-blue?logo=playwright)](https://playwright.dev)

`npx lobster setup` · `npx lobster start`

</div>

---

## Overview

Lobster is a fully self-hosted AI assistant that runs entirely on your machine using [Ollama](https://ollama.com) for LLM inference. It combines the privacy of local AI with practical automation capabilities — including real browser control through your installed Chrome.

Communicate with Lobster via **Telegram** or its built-in **web dashboard**. Ask it to search the web, navigate pages, click elements, type into forms, extract content, or take screenshots — all performed live in your browser.

## Key Features

| Capability | Description |
|---|---|
| **🔒 100% Private** | All inference runs locally via Ollama. No cloud, no data collection |
| **🌐 Real Browser Control** | Uses your installed Chrome (Playwright + CDP) to navigate, click, type, search, extract, and screenshot |
| **💬 Telegram Bot** | Full Telegram integration — message Lobster like any contact |
| **🌍 Web Dashboard** | Express + WebSocket UI, accessible from any device on your network |
| **🧠 Local Memory** | Persistent conversation history stored on disk, fully under your control |
| **🎤 Voice (Optional)** | Speech-to-text (Whisper) and text-to-speech for hands-free interaction |
| **🦞 Configurable Personality** | Lobster, pirate, or default themes with adjustable sass level |
| **🔧 CLI Management** | `lobster setup`, `lobster start`, `lobster chat`, `lobster status` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Lobster                               │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Telegram  │  │  Web Sockets │  │     CLI (Commander)    │ │
│  │   Bot     │  │  Dashboard   │  │  setup / start / chat  │ │
│  └────┬─────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│       │               │                      │               │
│  ┌────▼───────────────▼──────────────────────▼─────────────┐ │
│  │               Assistant Engine                           │ │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────────────────┐ │ │
│  │  │ LLM     │  │  Memory  │  │  Personality / Prompts  │ │ │
│  │  │ Client  │  │  Manager │  │                         │ │ │
│  │  └────┬────┘  └──────────┘  └─────────────────────────┘ │ │
│  └───────┼──────────────────────────────────────────────────┘ │
│          │                                                     │
│  ┌───────▼──────────────────────────────────────────────────┐ │
│  │                Tool Registry                              │ │
│  │  browser_navigate  browser_click  browser_type           │ │
│  │  browser_extract   browser_search  browser_screenshot    │ │
│  │  browser_close                                            │ │
│  └───────┬──────────────────────────────────────────────────┘ │
│          │                                                     │
│  ┌───────▼──────────┐    ┌──────────────────────────────┐    │
│  │  Ollama (Local)  │    │   Playwright + Chrome (CDP)  │    │
│  │  qwen2.5:7b      │    │   Real browser automation    │    │
│  └──────────────────┘    └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Stack

- **LLM Backend**: [Ollama](https://ollama.com) with OpenAI-compatible API (`/v1/chat/completions`)
- **Browser Automation**: [Playwright](https://playwright.dev) connecting to your system Chrome via CDP
- **Web Server**: [Express](https://expressjs.com) + [ws](https://github.com/websockets/ws) WebSocket server
- **Chat Integrations**: [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api), [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- **Voice**: OpenAI Whisper (STT) and TTS APIs (optional)

## Prerequisites

- **Node.js 18+** and npm
- **Ollama** installed and running (`ollama serve`)
- At least one LLM model pulled (e.g., `ollama pull qwen2.5:7b`)
- **Google Chrome** installed (for browser automation)

### Optional Dependencies

- OpenAI API key (for voice features or cloud LLM)
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Quick Start

```bash
# 1. Clone and enter the project
git clone https://github.com/Sani-varda/mlarcai.git
cd lobster

# 2. Install dependencies
npm install

# 3. Run the guided setup wizard
npm run setup

# 4. Start Lobster
npm start
```

Open **http://localhost:3000** in your browser, or message `@mlarcbot` on Telegram.

## Configuration

### Default Configuration (`config/default.json`)

```json
{
  "llm": {
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "temperature": 0.8,
    "maxTokens": 2048
  },
  "integrations": {
    "telegram": { "enabled": true },
    "whatsapp": { "enabled": false }
  },
  "browser": {
    "mode": "real"
  },
  "personality": {
    "name": "Lobster",
    "theme": "lobster",
    "sassLevel": "medium"
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

### Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `LLM_MODEL` | Ollama model name (default: `qwen2.5:7b`) |
| `LLM_PROVIDER` | `ollama` or `openai` |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `PORT` | Web server port (default: `3000`) |
| `HOST` | Web server host (default: `0.0.0.0`) |

## Usage

### CLI Commands

| Command | Description |
|---|---|
| `npm run setup` | Run the guided setup wizard |
| `npm start` | Start Lobster (web server + chat integrations) |
| `npx lobster chat` | Interactive CLI chat session |
| `npx lobster status` | Show configuration and status |

### In-Chat Commands

| Command | Description |
|---|---|
| `/reset` | Clear conversation memory |
| `who are you` | Display Lobster's configuration |

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Add the token to your `.env` file or run `npm run setup`
3. Start Lobster and message your bot

### Web Dashboard

Accessible at **http://localhost:3000/chat** from any device on your network. Features:
- Real-time WebSocket messaging
- Mobile-responsive design
- Conversation history
- Reset button to clear context

## Browser Automation

Lobster uses your installed Chrome browser via Playwright to perform real-time web tasks:

| Tool | Description |
|---|---|
| `browser_navigate(url)` | Navigate to a URL |
| `browser_search(query)` | Search Google and return results |
| `browser_click(selector)` | Click an element by CSS selector |
| `browser_type(selector, text)` | Type into an input field |
| `browser_extract()` | Extract visible text from the current page |
| `browser_screenshot()` | Capture a screenshot (base64 PNG) |
| `browser_close()` | Close the browser instance |

**Browser modes:**
- `real` (default): Launches your system Chrome with full session support
- `headless`: Uses Playwright's headless Chromium (no visible window)

Configure via `config/default.json` → `browser.mode`.

### How It Works

1. LLM (qwen2.5:7b) receives a user request
2. Assistant engine detects intent to browse/search
3. Tool-calling API (`chatWithTools`) invokes the appropriate browser function
4. Playwright connects to your Chrome via `channel: 'chrome'`
5. The action is performed live — you see your browser responding
6. Results are returned to the LLM for summarization

If the model returns tool calls as text content (common with local models), a fallback parser extracts the JSON and executes the tool automatically.

## Project Structure

```
lobster/
├── src/
│   ├── index.ts                # CLI entry point + commands
│   ├── setup.ts                # Guided setup wizard
│   ├── config.ts               # Configuration loader
│   ├── types.ts                # TypeScript type definitions
│   ├── core/
│   │   ├── assistant.ts        # Main assistant engine with tool loop
│   │   ├── llm.ts              # LLM client (Ollama / OpenAI API)
│   │   └── personality.ts      # Personality prompt builder
│   ├── tools/
│   │   ├── index.ts            # Tool definitions + executor
│   │   └── browser.ts          # Playwright browser automation
│   ├── integrations/
│   │   ├── index.ts            # Multi-platform integration manager
│   │   ├── telegram.ts         # Telegram bot (polling)
│   │   └── whatsapp.ts         # WhatsApp Web adapter
│   ├── server/
│   │   └── index.ts            # Express + WebSocket server
│   ├── memory/
│   │   └── index.ts            # Local conversation persistence
│   ├── voice/
│   │   ├── index.ts            # Voice hub
│   │   ├── stt.ts              # Speech-to-text (Whisper)
│   │   └── tts.ts              # Text-to-speech
│   └── utils/
│       ├── banner.ts           # Startup ASCII art
│       └── logger.ts           # Structured logging
├── config/
│   └── default.json            # Default configuration
├── data/                       # Persistent data (gitignored)
├── .env                        # Environment variables (gitignored)
├── package.json
└── tsconfig.json
```

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode
npm start

# Run setup wizard
npm run setup
```

The project uses TypeScript with strict mode. Build output goes to `dist/`.

### Adding a New Tool

1. Add the function to `src/tools/browser.ts`
2. Register the tool definition in `src/tools/index.ts` (`toolDefinitions` + `toolMap`)
3. The LLM will discover it automatically via the OpenAI-compatible tool schema

## Privacy

- **All inference runs locally** via Ollama. No prompts or responses leave your machine
- **Conversation history** is stored in `data/conversations.json` — a local file you control
- **No telemetry, no analytics, no external calls** unless you explicitly configure a cloud provider (OpenAI)
- **You can delete all data** by removing the `data/` directory or using `/reset` in chat
- **Browser automation** runs on your local Chrome — no remote servers involved

## Personality Themes

| Theme | Description |
|---|---|
| `lobster` | Sassy seafood chef. Maximum crustacean energy. Claw puns included. |
| `pirate` | A digital pirate captain. Helpful but speaks like a salty sea dog. |
| `default` | Friendly assistant without the gimmick. |

Sass levels: `high` · `medium` · `low`

## License

MIT — do whatever you want with it.

---

<div align="center">
  <sub>Built with 🦞 · Your data is yours. Your assistant is yours. The sass is free.</sub>
</div>
