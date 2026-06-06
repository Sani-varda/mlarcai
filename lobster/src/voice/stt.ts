import { OpenAI } from 'openai';
import { createReadStream, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Config } from '../types.js';
import { logger } from '../utils/logger.js';

export class SpeechToText {
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

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeToExt(mimeType);
    const tmpPath = join(tmpdir(), `lobster-stt-${randomUUID()}${ext}`);

    try {
      writeFileSync(tmpPath, audioBuffer);
      const transcription = await this.client.audio.transcriptions.create({
        file: createReadStream(tmpPath),
        model: 'whisper-1',
      });
      return transcription.text;
    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`STT error: ${error.message}`);
      throw error;
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/mp3': '.mp3',
    'audio/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/x-m4a': '.m4a',
  };
  return map[mime] ?? '.webm';
}
