import type { Config, VoiceRequest, VoiceResponse } from '../types.js';
import { SpeechToText } from './stt.js';
import { TextToSpeech } from './tts.js';
import { logger } from '../utils/logger.js';
import { VoiceConversation } from './conversation.js';

export class VoiceModule {
  private stt: SpeechToText;
  private tts: TextToSpeech;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.stt = new SpeechToText(config);
    this.tts = new TextToSpeech(config);
  }

  async processVoiceInput(request: VoiceRequest): Promise<VoiceResponse> {
    logger.info(
      `Processing voice input from ${request.platform} (${request.audioBuffer.length} bytes)`
    );

    const text = await this.stt.transcribe(request.audioBuffer, 'audio/webm');

    return { text };
  }

  async generateVoiceResponse(text: string): Promise<VoiceResponse> {
    const audioBuffer = await this.tts.speak(text);
    return { text, audioBuffer };
  }
}

export { VoiceConversation };
export { SpeechToText } from './stt.js';
export { TextToSpeech } from './tts.js';
