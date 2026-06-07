import type { IntegrationAdapter } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import type { Config } from '../types.js';
import { logger } from '../utils/logger.js';
import { initSkills } from '../skills/index.js';
import { initWorkflows } from '../workflows/index.js';
import { startScheduler } from '../workflows/scheduler.js';
import { initAgents } from '../agents/index.js';

export class IntegrationManager {
  private adapters: IntegrationAdapter[] = [];
  private assistant: Assistant;
  private config: Config;

  constructor(assistant: Assistant, config: Config) {
    this.assistant = assistant;
    this.config = config;
  }

  async startAll(): Promise<void> {
    await this.initializeCapabilities();

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
    } else {
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
  }

  private async initializeCapabilities(): Promise<void> {
    initAgents(this.config);
    await initSkills(this.config);
    initWorkflows(this.config);
    startScheduler(this.config);
  }

  async stopAll(): Promise<void> {
    const { stopScheduler } = await import('../workflows/scheduler.js');
    stopScheduler();

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
