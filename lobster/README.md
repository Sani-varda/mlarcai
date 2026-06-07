<div align="center">

# 🦞 Lobster

**A private, local AI assistant with multi-agent orchestration, workflow automation, real-time voice, and browser control.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-%3E%3D5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-FF6B35)](LICENSE)
[![Ollama](https://img.shields.io/badge/ollama-powered-4ade80?logo=ollama)](https://ollama.com)
[![Playwright](https://img.shields.io/badge/playwright-browser-blue?logo=playwright)](https://playwright.dev)

`npx lobster setup` · `npx lobster start`

</div>

---

## Overview

Lobster is a fully self-hosted AI assistant that runs entirely on your machine using [Ollama](https://ollama.com) for LLM inference. It combines the privacy of local AI with practical automation capabilities — including real browser control, multi-agent orchestration, cron-based workflow scheduling, a plugin skills system, and a full duplex voice conversation mode with local speech-to-text.

Communicate with Lobster via **Telegram**, its built-in **web dashboard**, **CLI chat**, or **voice**. Ask it to search the web, execute automated workflows, manage scheduled tasks, navigate pages, click elements, or extract content — all performed live in your browser.

## Key Features

| Capability | Description |
|---|---|
| **🔒 100% Private** | All inference runs locally via Ollama. No cloud, no data collection |
| **🧠 Multi-Agent System** | Route messages to specialized agents via `@agentname` syntax; each agent has its own personality, tools, and prompt |
| **⚙️ Workflow Engine** | Define multi-step automation pipelines with conditions, approvals, template interpolation, and skill execution |
| **⏰ Cron Scheduling** | Schedule workflow execution with cron expressions; add/remove tasks via CLI |
| **🔌 Skills System** | Plugin architecture for adding custom tools and capabilities via `skill.json` manifests |
| **🌐 Real Browser Control** | Uses your installed Chrome (Playwright + CDP) to navigate, click, type, search, extract, and screenshot |
| **💬 Telegram Bot** | Full Telegram integration — message Lobster like any contact |
| **🌍 Web Dashboard** | Express + WebSocket UI with push-to-talk voice; accessible from any device on your network |
| **🎤 Voice (Local STT + TTS)** | Real-time voice conversation with wake word, energy-based VAD, local Whisper STT (no API key needed), and edge-tts playback |
| **🧠 Enhanced Memory** | Persistent conversation history, long-term key-value memory, automatic summarization, multi-conversation support |
| **🦞 Configurable Personality** | Lobster, pirate, or default themes with adjustable sass level |
| **🔧 Full CLI Management** | `lobster start`, `setup`, `status`, `chat`, `voice`, `agents`, `workflows`, `skills`, `tasks`, `task add/remove` |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Lobster                                  │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌───────────────┐  │
│  │ Telegram  │  │  Web Sockets │  │  CLI   │  │  Voice (VAD   │  │
│  │   Bot     │  │  Dashboard   │  │  Chat  │  │  + STT + TTS) │  │
│  └────┬─────┘  └──────┬───────┘  └───┬────┘  └──────┬────────┘  │
│       │               │              │               │           │
│  ┌────▼───────────────▼──────────────▼───────────────▼─────────┐ │
│  │                   Integration Manager                        │ │
│  │     startAll() / stopAll() — orchestrates all subsystems    │ │
│  └─────────────────────────┬────────────────────────────────────┘ │
│                            │                                      │
│  ┌─────────────────────────▼────────────────────────────────────┐ │
│  │                    Assistant Engine                            │ │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐ │ │
│  │  │  LLM     │  │   Memory   │  │  Agent   │  │Personality │ │ │
│  │  │  Client  │  │  Manager   │  │  Router  │  │  Builder   │ │ │
│  │  └────┬─────┘  └────────────┘  └──────────┘  └────────────┘ │ │
│  └───────┼──────────────────────────────────────────────────────┘ │
│          │                                                        │
│  ┌───────▼──────────────────────────────────────────────────────┐ │
│  │                   Tool Registry + Executor                    │ │
│  │  browser_* tools  │  skill tools (plugin)  │  workflow exec  │ │
│  └───────┬──────────────────────────────────────────────────────┘ │
│          │                    │                    │               │
│  ┌───────▼──────────┐ ┌──────▼───────┐ ┌─────────▼────────────┐  │
│  │  Ollama (Local)  │ │   Skills     │ │    Workflow Engine   │  │
│  │  qwen2.5:7b      │ │   Plugin     │ │    + Scheduler       │  │
│  │                  │ │   System     │ │    (cron tasks)       │  │
│  └──────────────────┘ └──────────────┘ └──────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              Browser (Playwright + Chrome CDP)                 │ │
│  │  navigate · click · type · search · extract · screenshot     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Component Stack

- **LLM Backend**: [Ollama](https://ollama.com) with OpenAI-compatible API (`/v1/chat/completions`)
- **Browser Automation**: [Playwright](https://playwright.dev) connecting to your system Chrome via CDP
- **Web Server**: [Express](https://expressjs.com) + [ws](https://github.com/websockets/ws) WebSocket server
- **Chat Integrations**: [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- **Voice STT**: Local [openai-whisper](https://github.com/openai/whisper) (Python) — no API key required; falls back automatically
- **Voice TTS**: [edge-tts](https://github.com/rany2/edge-tts) — free Microsoft Edge neural voices, no API key
- **Voice Capture**: [mic](https://github.com/ashishbajaj99/mic) + [sox](https://sourceforge.net/projects/sox/) (or `rec`/`arecord`)
- **Scheduling**: Custom cron expression parser with `setInterval`-based evaluation

## Prerequisites

- **Node.js 18+** and npm
- **Ollama** installed and running (`ollama serve`)
- At least one LLM model pulled (e.g., `ollama pull qwen2.5:7b`)
- **Google Chrome** installed (for browser automation)

### Optional Dependencies

- **Sox** (for voice capture on Windows/macOS) — `winget install sox`, `brew install sox`, or `apt install sox`
- **Python 3.8+** with pip (for local Whisper STT) — `pip install openai-whisper`
- **ffmpeg** (required by local Whisper) — `winget install ffmpeg`, `brew install ffmpeg`, or `apt install ffmpeg`
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Quick Start

```bash
# 1. Clone and enter the project
git clone <your-repo-url>
cd lobster

# 2. Install dependencies
npm install

# 3. Run the guided setup wizard
npm run setup

# 4. Start Lobster
npm start
```

Open **http://localhost:3000** in your browser, or message `@<your-bot>` on Telegram.

## Configuration

### Default Configuration (`config/default.json`)

```json
{
  "llm": {
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "ollamaBaseUrl": "http://localhost:11434",
    "openaiApiKey": "",
    "openaiModel": "gpt-4o-mini",
    "temperature": 0.8,
    "maxTokens": 2048
  },
  "integrations": {
    "telegram": { "enabled": true },
    "whatsapp": { "enabled": false }
  },
  "voice": {
    "enabled": false,
    "conversation": {
      "wakeWord": "hey lobster",
      "silenceTimeoutMs": 1200,
      "followUpWindowMs": 8000
    }
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "personality": {
    "name": "Lobster",
    "theme": "lobster",
    "sassLevel": "medium"
  },
  "memory": {
    "enabled": true,
    "maxHistory": 50,
    "longTermEnabled": false,
    "summarizationEnabled": false
  },
  "browser": {
    "mode": "real"
  },
  "skills": {
    "enabled": true,
    "paths": []
  },
  "workflows": {
    "enabled": true,
    "directory": ""
  },
  "scheduler": {
    "enabled": false,
    "heartbeatIntervalMinutes": 30
  },
  "agents": {
    "defaultAgentId": "main",
    "list": [
      {
        "id": "main",
        "name": "Lobster",
        "description": "Main general-purpose lobster assistant",
        "personalityTheme": "lobster",
        "allowedTools": []
      }
    ]
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
| `OPENAI_API_KEY` | OpenAI API key (for cloud LLM or remote STT/TTS) |
| `PORT` | Web server port (default: `3000`) |
| `HOST` | Web server host (default: `0.0.0.0`) |

## Usage

### CLI Commands

| Command | Description |
|---|---|
| `lobster start` | Start Lobster (web server + integrations + optional voice daemon) |
| `lobster start --no-web` | Start Lobster without web server |
| `lobster setup` | Run the guided setup wizard |
| `lobster status` | Show configuration summary and status |
| `lobster chat` | Interactive CLI chat session |
| `lobster voice` | Start real-time voice conversation mode |
| `lobster agents` | List configured agents |
| `lobster workflows` | List registered workflow definitions |
| `lobster tasks` | List scheduled cron tasks |
| `lobster task add <name> <cron> <workflow>` | Add a scheduled task |
| `lobster task remove <id>` | Remove a scheduled task |
| `lobster skills` | List loaded skills and their tools |

### In-Chat Commands

| Command | Description |
|---|---|
| `/reset` | Clear conversation memory |
| `/agents` | List available agents |
| `/workflows` | List available workflows |
| `@agentname <message>` | Route a message to a specific agent |

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Add the token to your `.env` file or run `npm run setup`
3. Start Lobster and message your bot

### Web Dashboard

Accessible at **http://localhost:3000** from any device on your network. Features:
- Real-time WebSocket messaging
- Mobile-responsive design
- Push-to-talk voice input (mic button → MediaRecorder → STT → LLM → TTS)
- Conversation reset button
- Typing indicator

---

## Multi-Agent System

Lobster supports multiple AI agents with distinct personalities, system prompts, and allowed tools. Messages are routed by prefix:

- `@agentname what's the weather?` — sends to the named agent
- `/agentname summarize this` — same, alternative syntax
- Plain messages go to the default agent

Configure agents in `config/default.json` under `agents.list`:

```json
{
  "agents": {
    "defaultAgentId": "main",
    "list": [
      { "id": "main", "name": "Lobster", "personalityTheme": "lobster", "allowedTools": [] },
      { "id": "coder", "name": "Coder", "personalityTheme": "default", "allowedTools": ["browser_navigate", "browser_search"] }
    ]
  }
}
```

Each agent gets its own conversation history and memory scope.

## Workflow Engine

Define multi-step automation pipelines as JSON files (`.json` or `.workflow` extension) in a directory of your choice. Workflows support:

- **Sequential steps** — execute one after another
- **Conditional steps** — skip steps based on conditions
- **Human-in-the-loop approval** — pause for manual approval (5-minute timeout)
- **Template interpolation** — `{{stepName.output}}` references
- **Tool/skill execution** — call any registered tool or skill function
- **Input/output passing** — pipe data between steps

### Example Workflow

```json
{
  "name": "daily-research",
  "description": "Fetch latest news and summarize",
  "steps": [
    {
      "name": "search-news",
      "type": "tool",
      "tool": "browser_search",
      "params": { "query": "latest AI news {{today}}" }
    },
    {
      "name": "review",
      "type": "approval",
      "message": "Review the search results before continuing"
    },
    {
      "name": "summarize",
      "type": "llm",
      "prompt": "Summarize these findings: {{search-news.output}}"
    }
  ]
}
```

Set `workflows.directory` in config to your workflows folder, then call `executeWorkflow('daily-research')` from CLI, Telegram, or a scheduled task.

## Cron Scheduling

Schedule workflows to run automatically with cron expressions:

```bash
lobster task add morning-briefing "0 8 * * 1-5" daily-research
lobster task list
lobster task remove <task-id>
```

The scheduler evaluates cron expressions every 60 seconds. Supports standard cron syntax:
- `* * * * *` — every minute
- `0 8 * * 1-5` — weekdays at 8:00 AM
- `*/15 * * * *` — every 15 minutes
- `0 0 1 * *` — first day of every month

Enable the scheduler in config: `scheduler.enabled: true`.

## Skills System

Skills are plugins that add custom tools and capabilities. A skill consists of:

- **`skill.json`** — manifest with name, description, and tool definitions
- **Optional `index.js`** — exports a `toolMap` with runtime implementations

### Example Skill

```json
{
  "name": "system-info",
  "description": "Get system information (CPU, memory, disk)",
  "tools": [
    {
      "name": "get_system_info",
      "description": "Returns current system resource usage",
      "params": {}
    }
  ]
}
```

```javascript
// index.js
export const toolMap = {
  get_system_info: async () => {
    const os = require('os');
    return JSON.stringify({ cpu: os.cpus().length, memory: os.totalmem() });
  }
};
```

Place skills in a directory and configure `skills.paths` in config. Skills auto-load on startup.

## Voice Features

Lobster supports real-time voice conversation — completely free and local.

### Modes

| Mode | Description | How to Use |
|---|---|---|
| **Daemon (background)** | Voice listener starts with `lobster start` | Set `voice.enabled: true` in config |
| **CLI standalone** | Dedicated voice session | `lobster voice` |
| **Push-to-talk** | Mic button in web dashboard | Open `http://localhost:3000` and click the 🎤 button |

### How It Works

1. **Microphone capture** — `mic` package wraps system audio tools (`sox` on Windows/Mac, `arecord` on Linux), captures raw PCM at 16kHz 16-bit mono
2. **Voice Activity Detection** — Energy-based VAD detects when speech starts/stops; configurable silence timeout and thresholds
3. **Speech-to-Text** — Local `openai-whisper` (Python) transcribes audio; falls back automatically when no OpenAI API key is configured. The `tiny` model (~72MB) downloads on first use
4. **LLM Processing** — Transcribed text is sent through the Assistant engine for a response
5. **Text-to-Speech** — `edge-tts` generates natural speech from Microsoft Edge neural voices (free, no API key)
6. **Playback** — Audio plays via system default sound device (PowerShell `SoundPlayer` on Windows, `afplay` on macOS, `aplay` on Linux)

### Wake Word

When wake word mode is enabled, Lobster listens for "hey lobster" or "jarvis" before processing speech. After wake, a follow-up window keeps the conversation flowing naturally. Say "goodbye", "exit", or "stop" to end.

### Prerequisites for Voice

```bash
# Install sox (audio capture)
winget install sox                # Windows
brew install sox                  # macOS
sudo apt install sox              # Linux

# Install local Whisper (STT)
pip install openai-whisper

# Install ffmpeg (required by Whisper)
winget install ffmpeg             # Windows
brew install ffmpeg               # macOS
sudo apt install ffmpeg           # Linux
```

## Memory System

Lobster's `MemoryManager` provides persistent, multi-scoped conversation storage:

| Feature | Description |
|---|---|
| **Conversation History** | Per-platform, per-user, per-agent message history persisted to disk |
| **Long-Term Memory** | Key-value storage for facts, preferences, and learned information |
| **Summarization** | Automatic conversation summaries for long-running contexts |
| **Auto-Save** | Periodic flush to disk (every 30 seconds) |
| **Reset** | `/reset` command clears conversation without losing long-term memory |
| **API Access** | Full REST API for reading conversations and long-term memory |

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

## Project Structure

```
lobster/
├── src/
│   ├── index.ts                # CLI entry point + all commands
│   ├── setup.ts                # Guided setup wizard
│   ├── config.ts               # Configuration loader
│   ├── types.ts                # TypeScript type definitions
│   ├── core/
│   │   ├── assistant.ts        # Main assistant engine with tool loop
│   │   ├── llm.ts              # LLM client (Ollama / OpenAI API)
│   │   └── personality.ts      # Personality prompt builder
│   ├── agents/
│   │   └── index.ts            # Multi-agent router + registration
│   ├── tools/
│   │   ├── index.ts            # Tool definitions + executor
│   │   └── browser.ts          # Playwright browser automation
│   ├── skills/
│   │   └── index.ts            # Skills/plugin system
│   ├── workflows/
│   │   ├── index.ts            # Workflow engine (steps, conditions, approvals)
│   │   └── scheduler.ts        # Cron scheduler + task management
│   ├── integrations/
│   │   ├── index.ts            # Multi-platform integration manager
│   │   └── telegram.ts         # Telegram bot (polling)
│   ├── server/
│   │   └── index.ts            # Express + WebSocket + push-to-talk voice
│   ├── memory/
│   │   └── index.ts            # Memory manager (history, long-term, summarization)
│   ├── voice/
│   │   ├── index.ts            # Voice module exports
│   │   ├── conversation.ts     # Full duplex voice conversation loop
│   │   ├── listener.ts         # Microphone capture via sox/rec/arecord
│   │   ├── player.ts           # Cross-platform audio playback
│   │   ├── stt.ts              # OpenAI Whisper API STT
│   │   ├── stt-local.ts        # Local Whisper STT via Python subprocess
│   │   └── tts.ts              # Text-to-speech (OpenAI / edge-tts)
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

# Type-check without emitting
npm run typecheck
```

The project uses TypeScript with strict mode. Build output goes to `dist/`.

## Privacy

- **All inference runs locally** via Ollama. No prompts or responses leave your machine
- **Conversation history** is stored in `data/conversations.json` — a local file you control
- **No telemetry, no analytics, no external calls** unless you explicitly configure a cloud provider (OpenAI)
- **You can delete all data** by removing the `data/` directory or using `/reset` in chat
- **Browser automation** runs on your local Chrome — no remote servers involved
- **Voice STT** uses local Whisper by default — no audio data sent to external APIs
- **Voice TTS** uses edge-tts (connects to Microsoft Edge's free TTS endpoint) or local playback

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
