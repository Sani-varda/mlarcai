import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import { getAllWorkflows, getAllExecutions, executeWorkflow, approveWorkflow, rejectWorkflow } from '../workflows/index.js';
import { getAllAgents } from '../agents/index.js';
import { getAllSkills } from '../skills/index.js';
import { getAllTasks, addTask, removeTask } from '../workflows/scheduler.js';
import { SpeechToText } from '../voice/stt.js';
import { LocalSTT } from '../voice/stt-local.js';
import { TextToSpeech } from '../voice/tts.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WebServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private assistant: Assistant;
  private config: Config;
  private stt: SpeechToText | null;
  private localStt: LocalSTT | null;
  private tts: TextToSpeech;
  private sttReady = false;

  constructor(assistant: Assistant, config: Config) {
    this.assistant = assistant;
    this.config = config;
    this.stt = config.llm.openaiApiKey ? new SpeechToText(config) : null;
    this.localStt = config.llm.openaiApiKey ? null : new LocalSTT('tiny');
    this.tts = new TextToSpeech(config);
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
        capabilities: {
          skills: this.config.skills.enabled,
          workflows: this.config.workflows.enabled,
          scheduler: this.config.scheduler.enabled,
          multiAgent: this.config.agents.list.length > 1,
          longTermMemory: this.config.memory.longTermEnabled,
        },
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
        agents: getAllAgents().length,
        skills: getAllSkills().length,
        workflows: getAllWorkflows().length,
        scheduledTasks: getAllTasks().length,
      });
    });

    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, userId = 'web-user', agentId } = req.body;
        if (!message) {
          res.status(400).json({ error: 'message is required' });
          return;
        }

        const response = await this.assistant.handleMessage(
          'web',
          userId,
          message,
          agentId
        );
        res.json({ response });
      } catch (err: unknown) {
        const error = err as Error;
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/chat/history', (req, res) => {
      const userId = (req.query.userId as string) || 'web-user';
      const agentId = req.query.agentId as string | undefined;
      const conv = this.assistant.getMemory().getConversation('web', userId, agentId);
      res.json(conv.messages.slice(-20));
    });

    this.app.post('/api/chat/reset', (req, res) => {
      const userId = req.body.userId || 'web-user';
      const agentId = req.body.agentId as string | undefined;
      this.assistant.getMemory().clearConversation('web', userId, agentId);
      res.json({ status: 'cleared' });
    });

    this.app.post('/api/voice/chat', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
      try {
        const audioBuffer = req.body as Buffer;
        if (!audioBuffer || audioBuffer.length === 0) {
          res.status(400).json({ error: 'audio data is required' });
          return;
        }

        const userId = (req.query.userId as string) || 'web-user';
        const agentId = req.query.agentId as string | undefined;

        let text: string;

        if (this.stt) {
          text = await this.stt.transcribe(audioBuffer, 'audio/webm');
        } else if (this.localStt) {
          if (!this.sttReady) {
            res.status(400).json({ error: 'Whisper STT model still loading, retry in a few seconds' });
            return;
          }
          text = await this.localStt.transcribe(audioBuffer, 'audio/wav');
        } else {
          res.status(500).json({ error: 'No STT backend available' });
          return;
        }
        if (!text.trim()) {
          res.json({ text: '', audio: null });
          return;
        }

        const response = await this.assistant.handleMessage('web', userId, text, agentId);

        let audioBase64: string | null = null;
        try {
          const responseAudio = await this.tts.speak(response);
          audioBase64 = responseAudio.toString('base64');
        } catch {
          // TTS failure is non-fatal
        }

        res.json({ text, response, audio: audioBase64 });
      } catch (err: unknown) {
        const error = err as Error;
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/workflows', (_req, res) => {
      res.json(getAllWorkflows());
    });

    this.app.get('/api/workflows/executions', (_req, res) => {
      res.json(getAllExecutions());
    });

    this.app.post('/api/workflows/run', async (req, res) => {
      try {
        const { name, input } = req.body;
        if (!name) {
          res.status(400).json({ error: 'workflow name is required' });
          return;
        }
        const execution = await executeWorkflow(name, input);
        res.json(execution);
      } catch (err: unknown) {
        const error = err as Error;
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/workflows/approve', (req, res) => {
      const { id } = req.body;
      const ok = approveWorkflow(id);
      res.json({ approved: ok });
    });

    this.app.post('/api/workflows/reject', (req, res) => {
      const { id } = req.body;
      const ok = rejectWorkflow(id);
      res.json({ rejected: ok });
    });

    this.app.get('/api/agents', (_req, res) => {
      res.json(getAllAgents());
    });

    this.app.get('/api/skills', (_req, res) => {
      res.json(getAllSkills());
    });

    this.app.get('/api/tasks', (_req, res) => {
      res.json(getAllTasks());
    });

    this.app.post('/api/tasks', (req, res) => {
      try {
        const task = req.body;
        addTask(task);
        res.json({ status: 'created', task });
      } catch (err: unknown) {
        const error = err as Error;
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/tasks/:id', (req, res) => {
      const ok = removeTask(req.params.id);
      res.json({ removed: ok });
    });

    this.app.get('/api/memory', (req, res) => {
      const userId = (req.query.userId as string) || 'web-user';
      const agentId = req.query.agentId as string | undefined;
      const summary = this.assistant.getMemory().getSummary('web', userId, agentId);
      const longTerm = this.assistant.getMemory().getAllLongTerm();
      res.json({ summary, longTerm });
    });

    this.app.post('/api/memory/long-term', (req, res) => {
      const { key, value } = req.body;
      if (!key || !value) {
        res.status(400).json({ error: 'key and value are required' });
        return;
      }
      this.assistant.getMemory().storeLongTerm(key, value);
      res.json({ status: 'stored' });
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
      let currentAgentId: string | undefined;

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'identify') {
            userId = msg.userId || 'web-user';
            currentAgentId = msg.agentId;
            return;
          }

          if (msg.type === 'message') {
            ws.send(JSON.stringify({ type: 'typing', status: true }));

            const response = await this.assistant.handleMessage(
              'web',
              userId,
              msg.text,
              currentAgentId
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
  #input-area .mic-btn {
    background: #2a2a3e;
    font-size: 20px;
    padding: 12px 14px;
    line-height: 1;
  }
  #input-area .mic-btn.recording {
    background: #ef4444;
    animation: pulse 1s ease infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  .msg .audio-btn {
    background: none;
    border: 1px solid #FF6B35;
    color: #FF6B35;
    padding: 4px 10px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 13px;
    margin-top: 6px;
  }
  .msg .audio-btn:hover { background: #FF6B35; color: #fff; }
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
  <button class="mic-btn" id="micBtn" onclick="toggleMic()">🎤</button>
  <button onclick="send()">Send</button>
</div>
<script>
  const ws = new WebSocket('ws://' + location.host);
  const messages = document.getElementById('messages');
  const input = document.getElementById('input');
  const micBtn = document.getElementById('micBtn');

  let mediaRecorder = null;
  let recording = false;
  let audioChunks = [];

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'identify', userId: 'web-user-' + Date.now() }));
    addMessage('assistant', '🦞 Hey there, my delicious human! I\\'m your personal lobster assistant. Ask me anything — but don\\'t expect me to be nice about it.');
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

  async function toggleMic() {
    if (recording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        micBtn.textContent = '🎤';
        micBtn.classList.remove('recording');
        if (blob.size < 1000) return;

        setTyping(true);
        try {
          const res = await fetch('/api/voice/chat?userId=' + encodeURIComponent('web-user-' + Date.now()), {
            method: 'POST',
            body: blob,
          });
          const data = await res.json();
          setTyping(false);

          if (data.error) {
            addMessage('assistant', '❌ ' + data.error);
            return;
          }

          if (data.text && data.text.trim()) {
            addMessage('user', '🎤 ' + data.text);
          }
          if (data.response) {
            const el = addMessage('assistant', data.response);
            if (data.audio) {
              const btn = document.createElement('button');
              btn.className = 'audio-btn';
              btn.textContent = '🔊 Play';
              btn.onclick = () => {
                const audio = new Audio('data:audio/mp3;base64,' + data.audio);
                audio.play();
              };
              el.appendChild(btn);
            }
          }
        } catch (err) {
          setTyping(false);
          const msg = err instanceof Error ? err.message : 'Voice processing failed';
          addMessage('assistant', '❌ ' + msg);
        }
      };

      mediaRecorder.start();
      recording = true;
      micBtn.textContent = '⏹';
      micBtn.classList.add('recording');
    } catch (err) {
      addMessage('assistant', '❌ Microphone access denied. Allow mic permissions and try again.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    recording = false;
  }

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
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
      this.httpServer.listen(this.config.server.port, this.config.server.host, async () => {
        logger.server(`Web dashboard: http://${this.config.server.host === '0.0.0.0' ? 'localhost' : this.config.server.host}:${this.config.server.port}`);
        logger.server(`API:           http://${this.config.server.host === '0.0.0.0' ? 'localhost' : this.config.server.host}:${this.config.server.port}/api/health`);

        if (this.localStt) {
          logger.info('Loading local Whisper STT model...');
          try {
            await this.localStt.ensureModel();
            this.sttReady = true;
            logger.success('Whisper STT model ready');
          } catch (err) {
            logger.error(`Whisper model load failed: ${(err as Error).message}`);
          }
        }

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.wss.close();
    this.httpServer.close();
  }
}
