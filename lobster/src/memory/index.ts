import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage, Conversation } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

export class MemoryManager {
  private conversations: Map<string, Conversation> = new Map();
  private maxHistory: number;
  private contextWindow: number;
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxHistory = 50, contextWindow = 10) {
    this.maxHistory = maxHistory;
    this.contextWindow = contextWindow;
    this.load();
    this.saveTimer = setInterval(() => this.save(), 30_000);
  }

  private getPath(): string {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    return join(DATA_DIR, 'conversations.json');
  }

  private load(): void {
    const path = this.getPath();
    if (!existsSync(path)) return;
    try {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);
      for (const [key, val] of Object.entries(data)) {
        const conv = val as Conversation;
        conv.createdAt = new Date(conv.createdAt);
        conv.updatedAt = new Date(conv.updatedAt);
        this.conversations.set(key, conv);
      }
    } catch {
      // Corrupted data, start fresh
    }
  }

  private save(): void {
    if (!this.dirty) return;
    const path = this.getPath();
    const data: Record<string, Conversation> = {};
    for (const [key, val] of this.conversations) {
      data[key] = val;
    }
    writeFileSync(path, JSON.stringify(data, null, 2));
    this.dirty = false;
  }

  private convId(platform: string, userId: string): string {
    return `${platform}:${userId}`;
  }

  getConversation(platform: string, userId: string): Conversation {
    const id = this.convId(platform, userId);
    let conv = this.conversations.get(id);
    if (!conv) {
      conv = {
        id,
        platform,
        userId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.conversations.set(id, conv);
    }
    return conv;
  }

  addMessage(
    platform: string,
    userId: string,
    message: ChatMessage
  ): void {
    const conv = this.getConversation(platform, userId);
    conv.messages.push(message);
    conv.updatedAt = new Date();

    if (conv.messages.length > this.maxHistory) {
      const systemMsgs = conv.messages.filter((m) => m.role === 'system');
      const others = conv.messages
        .filter((m) => m.role !== 'system')
        .slice(-this.maxHistory + systemMsgs.length);
      conv.messages = [...systemMsgs, ...others];
    }
    this.dirty = true;
  }

  getContext(platform: string, userId: string): ChatMessage[] {
    const conv = this.getConversation(platform, userId);
    const systemMsgs = conv.messages.filter((m) => m.role === 'system');
    const history = conv.messages
      .filter((m) => m.role !== 'system' && m.role !== 'tool')
      .slice(-this.contextWindow * 2);
    return [...systemMsgs, ...history];
  }

  clearConversation(platform: string, userId: string): void {
    const id = this.convId(platform, userId);
    const conv = this.conversations.get(id);
    if (conv) {
      const system = conv.messages.filter((m) => m.role === 'system');
      conv.messages = system;
      conv.updatedAt = new Date();
      this.dirty = true;
    }
  }

  destroy(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.save();
  }
}
