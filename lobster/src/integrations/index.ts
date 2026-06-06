import type { IntegrationAdapter } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import type { Config } from '../types.js';
import { logger } from '../utils/logger.js';

export class IntegrationManager {
  private adapters: IntegrationAdapter[] = [];
  private assistant: Assistant;
  private config: Config;

  constructor(assistant: Assistant, config: Config) {
    this.assistant = assistant;
    this.config = config;
  }

  async startAll(): Promise<void> {
    const { telegram, whatsapp } = this.config.integrations;
    const started: string[] = [];

    if (telegram.enabled && telegram.botToken) {
      const { TelegramAdapter } = await import('./telegram.js');
      this.adapters.push(new TelegramAdapter(this.assistant, telegram.botToken));
      started.push('Telegram');
    }

    if (whatsapp.enabled) {
      const { WhatsAppAdapter } = await import('./whatsapp.js');
      this.adapters.push(new WhatsAppAdapter(this.assistant));
      started.push('WhatsApp');
    }

    if (started.length === 0) {
      logger.warn('No integrations enabled. Run `lobster setup` to configure.');
      return;
    }

    for (const adapter of this.adapters) {
      try {
        await adapter.start();
        logger.success(`${adapter.name} connected! 🦞`);
      } catch (err: unknown) {
        const error = err as Error;
        logger.error(`Failed to start ${adapter.name}: ${error.message}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        await adapter.stop();
      } catch {
        // ignore stop errors
      }
    }
    this.adapters = [];
  }
}
