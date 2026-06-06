import TelegramBot from 'node-telegram-bot-api';
import type { IntegrationAdapter } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import { logger } from '../utils/logger.js';

export class TelegramAdapter implements IntegrationAdapter {
  name = 'Telegram';
  private bot: TelegramBot;
  private assistant: Assistant;

  constructor(assistant: Assistant, token: string) {
    this.assistant = assistant;
    this.bot = new TelegramBot(token, { polling: true });
  }

  async start(): Promise<void> {
    this.bot.on('message', async (msg) => {
      if (!msg.text || !msg.from) return;
      const userId = msg.from.id.toString();
      const chatId = msg.chat.id;

      try {
        await this.bot.sendChatAction(chatId, 'typing');
        const response = await this.assistant.handleMessage(
          'telegram',
          userId,
          msg.text
        );

        await this.sendSafe(chatId, response);

        logger.chat('Telegram', `< ${msg.text}`);
        logger.chat('Telegram', `> ${response.slice(0, 100)}...`);
      } catch (err: unknown) {
        const error = err as Error;
        logger.error(`Telegram error: ${error.message}`);
        await this.bot.sendMessage(
          chatId,
          '🦞 The lobster dropped its phone. Try again?'
        );
      }
    });

    const me = await this.bot.getMe();
    logger.info(`Telegram bot @${me.username} is ready!`);
  }

  private async sendSafe(chatId: number, text: string): Promise<void> {
    const maxLen = 4000;
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }

    for (const chunk of chunks) {
      try {
        await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      } catch {
        try {
          const cleaned = chunk
            .replace(/[*_`[\]()~>#+\-=|{}.!\\]/g, '')
            .trim();
          await this.bot.sendMessage(chatId, cleaned || '(empty response)');
        } catch {
          await this.bot.sendMessage(chatId, chunk.slice(0, 2000));
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.bot.stopPolling();
  }

  async sendMessage(_channel: string, message: string): Promise<void> {
    logger.warn('Telegram sendMessage not implemented for direct channel sends');
  }
}
