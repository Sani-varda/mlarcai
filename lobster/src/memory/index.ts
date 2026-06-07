import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage, Conversation, Config } from '../types.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

export class MemoryManager {
  private conversations: Map<string, Conversation> = new Map();
  private longTermMemory: Map<string, string> = new Map();
  private maxHistory: number;
  private contextWindow: number;
  private longTermEnabled: boolean;
  private summarizationEnabled: boolean;
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Config) {
    this.maxHistory = config?.memory?.maxHistory ?? 50;
    this.contextWindow = config?.memory?.contextWindow ?? 10;
    this.longTermEnabled = config?.memory?.longTermEnabled ?? false;
    this.summarizationEnabled = config?.memory?.summarizationEnabled ?? false;
    this.load();
    this.loadLongTerm();
    this.saveTimer = setInterval(() => this.save(), 30_000);
  }

  private getConversationsPath(): string {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    return join(DATA_DIR, 'conversations.json');
  }

  private getLongTermPath(): string {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    return join(DATA_DIR, 'long-term-memory.json');
  }

  private load(): void {
    const path = this.getConversationsPath();
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

  private loadLongTerm(): void {
    if (!this.longTermEnabled) return;
    const path = this.getLongTermPath();
    if (!existsSync(path)) return;
    try {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [key, val] of Object.entries(data)) {
        this.longTermMemory.set(key, val);
      }
    } catch {
      logger.warn('Failed to load long-term memory');
    }
  }

  private save(): void {
    if (!this.dirty) return;

    const convPath = this.getConversationsPath();
    const convData: Record<string, Conversation> = {};
    for (const [key, val] of this.conversations) {
      convData[key] = val;
    }
    writeFileSync(convPath, JSON.stringify(convData, null, 2));

    if (this.longTermEnabled) {
      const ltPath = this.getLongTermPath();
      const ltData: Record<string, string> = {};
      for (const [key, val] of this.longTermMemory) {
        ltData[key] = val;
      }
      writeFileSync(ltPath, JSON.stringify(ltData, null, 2));
    }

    this.dirty = false;
  }

  private convId(platform: string, userId: string, agentId?: string): string {
    return agentId ? `${platform}:${userId}:${agentId}` : `${platform}:${userId}`;
  }

  private markDirty(): void {
    this.dirty = true;
  }

  getConversation(platform: string, userId: string, agentId?: string): Conversation {
    const id = this.convId(platform, userId, agentId);
    let conv = this.conversations.get(id);
    if (!conv) {
      conv = {
        id,
        platform,
        userId,
        agentId,
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
    message: ChatMessage,
    agentId?: string
  ): void {
    const conv = this.getConversation(platform, userId, agentId);
    conv.messages.push(message);
    conv.updatedAt = new Date();

    if (conv.messages.length > this.maxHistory) {
      const systemMsgs = conv.messages.filter((m) => m.role === 'system');
      const others = conv.messages
        .filter((m) => m.role !== 'system')
        .slice(-this.maxHistory + systemMsgs.length);
      conv.messages = [...systemMsgs, ...others];
    }

    this.markDirty();
  }

  getContext(platform: string, userId: string, agentId?: string): ChatMessage[] {
    const conv = this.getConversation(platform, userId, agentId);
    const systemMsgs = conv.messages.filter((m) => m.role === 'system');
    const history = conv.messages
      .filter((m) => m.role !== 'system' && m.role !== 'tool')
      .slice(-this.contextWindow * 2);

    const context = [...systemMsgs, ...history];

    if (this.longTermEnabled && conv.summary) {
      context.unshift({
        role: 'system',
        content: `[Long-term memory summary for this conversation]: ${conv.summary}`,
      });
    }

    return context;
  }

  clearConversation(platform: string, userId: string, agentId?: string): void {
    const id = this.convId(platform, userId, agentId);
    const conv = this.conversations.get(id);
    if (conv) {
      const system = conv.messages.filter((m) => m.role === 'system');
      conv.messages = system;
      conv.summary = undefined;
      conv.updatedAt = new Date();
      this.markDirty();
    }
  }

  setSummary(platform: string, userId: string, summary: string, agentId?: string): void {
    const conv = this.getConversation(platform, userId, agentId);
    conv.summary = summary;
    this.markDirty();
  }

  getSummary(platform: string, userId: string, agentId?: string): string | undefined {
    return this.getConversation(platform, userId, agentId).summary;
  }

  storeLongTerm(key: string, value: string): void {
    if (!this.longTermEnabled) return;
    this.longTermMemory.set(key, value);
    this.markDirty();
  }

  getLongTerm(key: string): string | undefined {
    return this.longTermMemory.get(key);
  }

  searchLongTerm(query: string): Array<{ key: string; value: string }> {
    if (!this.longTermEnabled) return [];
    const results: Array<{ key: string; value: string }> = [];
    const lower = query.toLowerCase();
    for (const [key, value] of this.longTermMemory) {
      if (key.toLowerCase().includes(lower) || value.toLowerCase().includes(lower)) {
        results.push({ key, value });
      }
    }
    return results;
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  getAllLongTerm(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.longTermMemory) {
      result[key] = value;
    }
    return result;
  }

  destroy(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.save();
  }
}
