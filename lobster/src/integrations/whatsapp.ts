import type { IntegrationAdapter } from '../types.js';
import type { Assistant } from '../core/assistant.js';
import { logger } from '../utils/logger.js';

export class WhatsAppAdapter implements IntegrationAdapter {
  name = 'WhatsApp';
  private assistant: Assistant;

  constructor(assistant: Assistant) {
    this.assistant = assistant;
  }

  async start(): Promise<void> {
    logger.info('WhatsApp uses whatsapp-web.js for QR-code based auth.');
    logger.info('On first launch, scan the QR code with your phone.');
    logger.info('This requires a headless browser (Puppeteer) to be available.');

    try {
      const { Client, LocalAuth } = await import('whatsapp-web.js');
      const qrcode = await import('qrcode-terminal');

      const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      client.on('qr', (qr: string) => {
        qrcode.default.generate(qr, { small: true });
        logger.info('Scan the QR code above with WhatsApp on your phone.');
      });

      client.on('ready', () => {
        logger.success('WhatsApp connected! 🦞');
      });

      client.on('message', async (msg: any) => {
        if (msg.from === 'status@broadcast') return;
        if (msg.isGroup) return;
        if (msg.type !== 'chat' && msg.type !== 'ptt') return;

        const userId = msg.from;
        const text = msg.body || '[voice message received]';

        try {
          await msg.startTyping?.();
          const response = await this.assistant.handleMessage(
            'whatsapp',
            userId,
            text
          );

          await msg.reply(response);
          logger.chat('WhatsApp', `< ${text}`);
          logger.chat('WhatsApp', `> ${response.slice(0, 100)}...`);
        } catch (err: unknown) {
          const error = err as Error;
          logger.error(`WhatsApp error: ${error.message}`);
          await msg.reply('🦞 *The lobster dropped its phone. Try again?*');
        }
      });

      await client.initialize();
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes('Cannot find module')) {
        logger.warn(
          'whatsapp-web.js is not installed. To use WhatsApp integration, run:'
        );
        logger.warn('  npm install whatsapp-web.js qrcode-terminal');
        logger.warn('Note: whatsapp-web.js requires Puppeteer which downloads Chromium.');
        throw new Error('WhatsApp dependencies not installed');
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('WhatsApp adapter does not support graceful stop. (whatsapp-web.js limitation)');
  }

  async sendMessage(_channel: string, _message: string): Promise<void> {
    logger.warn('WhatsApp sendMessage not implemented for direct channel sends');
  }
}
