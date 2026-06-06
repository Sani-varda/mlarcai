<div align="center">

# 🦞 Lobster

**Your friendly, private, local AI assistant with a crustacean attitude.**

`npx lobster setup` · `npx lobster start`

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-%3E%3D5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-FF6B35)](LICENSE)

</div>

---

## 🦀 What is Lobster?

Lobster is a **personal AI assistant that runs entirely on your own devices**. Your conversations stay on your machine. No cloud, no data collection, no privacy concerns.

It integrates with **Telegram and WhatsApp** — so you can message it like any other contact. It also has a **web dashboard** for mobile access and **voice capabilities**.

And it has the personality of a slightly-too-confident lobster.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔒 100% Private** | Runs locally via Ollama. Your data never leaves your machine |
| **💬 Chat Apps** | Telegram · WhatsApp — message it like a person |
| **🌐 Web Dashboard** | Built-in web UI, accessible from your phone on the same network |
| **🎤 Voice** | Speech-to-text + text-to-speech for hands-free interaction |
| **🧠 Memory** | Remembers conversations (locally stored, you control it) |
| **🦞 Personality** | Witty, sarcastic, lobster-themed. Adjustable sass levels |
| **⚡ Fast** | Runs on your hardware with local LLMs (Ollama) |
| **🔧 CLI Setup** | Guided wizard — run one command to get started |

## 📋 Prerequisites

- **Node.js 18+** and **npm**
- **Ollama** with a model pulled (e.g., `ollama pull gemma4`)
- **Ollama running** (`ollama serve`)

Optional:
- OpenAI API key (for cloud LLM or voice features)
- Chrome/Chromium (for WhatsApp integration)
- Bot tokens for your chat platforms

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd lobster
npm install

# 2. Run the guided setup
npx lobster setup

# 3. Start Lobster
npx lobster start
```

That's it. Run `npx lobster setup` and it will walk you through everything.

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `npx lobster setup` | Guided setup wizard — configure LLM, chat apps, personality |
| `npx lobster start` | Start Lobster (web dashboard + chat integrations) |
| `npx lobster chat` | Interactive CLI chat with Lobster |
| `npx lobster status` | Show current configuration and status |

### In-Chat Commands

| Command | Description |
|---------|-------------|
| `/reset` | Clear Lobster's memory of your conversation |
| `who are you` | Show Lobster's current configuration |

## 💬 Chat App Setup

### Telegram
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token — paste it when `lobster setup` asks

### WhatsApp
1. Run `npx lobster setup` and enable WhatsApp
2. On first start, a QR code appears in the terminal
3. Open WhatsApp on your phone → Settings → Linked Devices → Scan

## 🎤 Voice

Voice features use OpenAI's Whisper (STT) and TTS APIs. You'll need an **OpenAI API key**.

In the web dashboard (`http://localhost:3000/chat`), voice input works on mobile browsers that support the Media Recording API.

## 🏗️ Architecture

```
lobster/
├── src/
│   ├── index.ts              # CLI entry point + commands
│   ├── setup.ts              # Guided setup wizard
│   ├── config.ts             # Configuration manager
│   ├── types.ts              # TypeScript types
│   ├── core/
│   │   ├── assistant.ts      # Main assistant engine
│   │   ├── personality.ts    # Lobster personality system
│   │   └── llm.ts            # LLM client (Ollama + OpenAI)
│   ├── integrations/
│   │   ├── index.ts          # Integration manager
│   │   ├── telegram.ts       # Telegram bot adapter
│   │   └── whatsapp.ts       # WhatsApp adapter
│   ├── voice/
│   │   ├── index.ts          # Voice hub
│   │   ├── stt.ts            # Speech-to-text (Whisper)
│   │   └── tts.ts            # Text-to-speech
│   ├── memory/
│   │   └── index.ts          # Conversation memory
│   ├── server/
│   │   └── index.ts          # Express + WebSocket server
│   └── utils/
│       ├── banner.ts         # ASCII art banner
│       └── logger.ts         # Logging utilities
├── config/
│   └── default.json          # Default configuration
├── data/                     # Runtime data (conversations)
├── package.json
└── tsconfig.json
```

## 🧪 Running Locally

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Lobster
cd lobster
npm install
npm start
```

Then open **http://localhost:3000** in your browser, or message Lobster through any connected chat app.

## 🔒 Privacy

- All conversations are stored **locally** in `data/conversations.json`
- LLM inference runs via **Ollama on your machine** (unless you configure OpenAI)
- No data is sent to any third party unless you explicitly connect an external service
- You can delete your conversation history at any time by removing the `data/` directory

## 🎭 Personality

Lobster has three personality themes:

- **lobster** — Sassy seafood chef. Maximum crustacean energy. Lots of claw puns.
- **pirate** — Yarr, a digital pirate captain. Helpful but speaks like a salty sea dog.
- **default** — Friendly assistant without the gimmick.

Each has configurable sass levels: `high`, `medium`, `low`.

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt it. PRs welcome for:
- New chat platform integrations
- Additional personality themes
- Tool/plugin system improvements
- Documentation improvements

## 📄 License

MIT — do whatever you want with it. Just don't blame the lobster.

---

<div align="center">
  <sub>Built with 🦞 by someone who really likes lobsters</sub>
  <br>
  <sub>Your data is yours. Your assistant is yours. The sass is free.</sub>
</div>
