import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';
import type { Config } from '../types.js';
import { logger } from '../utils/logger.js';

export class TextToSpeech {
  private client: OpenAI;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    if (config.llm.openaiApiKey) {
      this.client = new OpenAI({ apiKey: config.llm.openaiApiKey });
    } else {
      this.client = new OpenAI({
        baseURL: config.llm.ollamaBaseUrl + '/v1',
        apiKey: 'ollama',
      });
    }
  }

  async speak(text: string): Promise<Buffer> {
    try {
      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: this.config.voice.ttsVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: text.slice(0, 4096),
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`TTS error: ${error.message}`);
      throw error;
    }
  }
}
