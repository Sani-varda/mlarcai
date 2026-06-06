import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WebServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private assistant: Assistant;
  private config: Config;

  constructor(assistant: Assistant, config: Config) {
    this.assistant = assistant;
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    this.app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        lobster: 'alive and pinching',
        model: this.config.llm.model,
        uptime: process.uptime(),
      });
    });

    this.app.get('/api/status', (_req, res) => {
      const enabledInts = Object.entries(this.config.integrations)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k);

      res.json({
        name: this.config.personality.name,
        theme: this.config.personality.theme,
        llm: {
          provider: this.config.llm.provider,
          model: this.config.llm.model,
        },
        integrations: enabledInts,
        voice: this.config.voice.enabled,
      });
    });

    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, userId = 'web-user' } = req.body;
        if (!message) {
          res.status(400).json({ error: 'message is required' });
          return;
        }

        const response = await this.assistant.handleMessage(
          'web',
          userId,
          message
        );
        res.json({ response });
      } catch (err: unknown) {
        const error = err as Error;
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/chat/history', (req, res) => {
      const userId = (req.query.userId as string) || 'web-user';
      const conv = this.assistant.getMemory().getConversation('web', userId);
      res.json(conv.messages.slice(-20));
    });

    this.app.post('/api/chat/reset', (req, res) => {
      const userId = req.body.userId || 'web-user';
      this.assistant.getMemory().clearConversation('web', userId);
      res.json({ status: 'cleared' });
    });

    this.app.get('/chat', (_req, res) => {
      const htmlPath = join(__dirname, '..', '..', 'public', 'chat.html');
      if (existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.send(this.getMinimalChatUI());
      }
    });

    this.app.use((_req, res) => {
      res.redirect('/chat');
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, _req) => {
      let userId = 'web-user';

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'identify') {
            userId = msg.userId || 'web-user';
            return;
          }

          if (msg.type === 'message') {
            ws.send(JSON.stringify({ type: 'typing', status: true }));

            const response = await this.assistant.handleMessage(
              'web',
              userId,
              msg.text
            );

            ws.send(
              JSON.stringify({ type: 'message', text: response })
            );
            ws.send(JSON.stringify({ type: 'typing', status: false }));
          }
        } catch (err: unknown) {
          const error = err as Error;
          ws.send(
            JSON.stringify({
              type: 'error',
              text: `Lobster error: ${error.message}`,
            })
          );
        }
      });
    });
  }

  private getMinimalChatUI(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>🦞 Lobster</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1a;
    color: #e0e0e0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    background: linear-gradient(135deg, #FF6B35, #FF8C42);
    padding: 16px;
    text-align: center;
    font-size: 1.2em;
    font-weight: 600;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  header span { font-size: 0.7em; opacity: 0.8; }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .msg {
    max-width: 80%;
    padding: 12px 16px;
    border-radius: 16px;
    line-height: 1.4;
    font-size: 15px;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .user { background: #FF6B35; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .assistant { background: #1e1e2e; color: #e0e0e0; align-self: flex-start; border-bottom-left-radius: 4px; }
  .typing { color: #888; font-style: italic; font-size: 14px; align-self: flex-start; }
  #input-area {
    padding: 12px 16px;
    background: #1a1a2e;
    display: flex;
    gap: 8px;
    border-top: 1px solid #2a2a3e;
  }
  #input-area input {
    flex: 1;
    padding: 12px 16px;
    border: 1px solid #2a2a3e;
    border-radius: 24px;
    background: #0f0f1a;
    color: #e0e0e0;
    font-size: 15px;
    outline: none;
  }
  #input-area input:focus { border-color: #FF6B35; }
  #input-area button {
    padding: 12px 20px;
    border: none;
    border-radius: 24px;
    background: #FF6B35;
    color: #fff;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.2s;
  }
  #input-area button:active { background: #e55a2b; }
  .reset-btn {
    background: none;
    border: 1px solid #444;
    color: #888;
    padding: 6px 12px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 12px;
    position: absolute;
    right: 16px;
    top: 16px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px;
  }
  .status-dot.online { background: #4ade80; }
  .status-dot.offline { background: #f87171; }
</style>
</head>
<body>
<header>
  🦞 Lobster
  <span>— your personal AI</span>
  <button class="reset-btn" onclick="resetChat()">Reset</button>
</header>
<div id="messages"></div>
<div id="input-area">
  <input type="text" id="input" placeholder="Message your lobster..." autofocus />
  <button onclick="send()">Send</button>
</div>
<script>
  const ws = new WebSocket('ws://' + location.host);
  const messages = document.getElementById('messages');
  const input = document.getElementById('input');

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'identify', userId: 'web-user-' + Date.now() }));
    addMessage('assistant', '🦞 Hey there, my delicious human! I\'m your personal lobster assistant. Ask me anything — but don\'t expect me to be nice about it.');
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'message') addMessage('assistant', msg.text);
    if (msg.type === 'typing') setTyping(msg.status);
    if (msg.type === 'error') addMessage('assistant', '❌ ' + msg.text);
  };

  function send() {
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    ws.send(JSON.stringify({ type: 'message', text }));
    input.value = '';
  }

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  let typingEl = null;
  function setTyping(status) {
    if (status && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'typing msg';
      typingEl.textContent = '🦞 Lobster is thinking...';
      messages.appendChild(typingEl);
      messages.scrollTop = messages.scrollHeight;
    } else if (!status && typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function resetChat() {
    messages.innerHTML = '';
    addMessage('assistant', '🦞 Memory wiped! Your lobster has forgotten everything. Ah, sweet ignorance.');
    fetch('/api/chat/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
</script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.server.port, this.config.server.host, () => {
        logger.server(`Web dashboard: http://${this.config.server.host === '0.0.0.0' ? 'localhost' : this.config.server.host}:${this.config.server.port}`);
        logger.server(`API:           http://${this.config.server.host === '0.0.0.0' ? 'localhost' : this.config.server.host}:${this.config.server.port}/api/health`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.wss.close();
    this.httpServer.close();
  }
}
