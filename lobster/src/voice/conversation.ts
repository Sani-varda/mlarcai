import chalk from 'chalk';
import { EventEmitter } from 'node:events';
import { Assistant } from '../core/assistant.js';
import type { Config } from '../types.js';
import { logger } from '../utils/logger.js';
import { MicrophoneCapture, AudioChunk } from './listener.js';
import { playMp3Buffer } from './player.js';
import { SpeechToText } from './stt.js';
import { TextToSpeech } from './tts.js';

const WAKE_WORDS = ['hey lobster', 'hey jarvis', 'lobster', 'jarvis'];

export interface ConversationConfig {
  wakeWordEnabled: boolean;
  wakeWord: string;
  silenceTimeoutMs: number;
  minSpeechMs: number;
  maxSpeechMs: number;
  followUpWindowMs: number;
  vadThreshold: number;
}

const defaultConversationConfig: ConversationConfig = {
  wakeWordEnabled: true,
  wakeWord: 'hey lobster',
  silenceTimeoutMs: 1200,
  minSpeechMs: 300,
  maxSpeechMs: 15000,
  followUpWindowMs: 8000,
  vadThreshold: 0.02,
};

export class VoiceConversation extends EventEmitter {
  private config: Config;
  private conversationConfig: ConversationConfig;
  private mic: MicrophoneCapture;
  private stt: SpeechToText;
  private tts: TextToSpeech;
  private assistant: Assistant;
  private ownAssistant: boolean;
  private background: boolean;
  private running = false;
  private speaking = false;
  private speechBuffer: Buffer[] = [];
  private speechStartTime = 0;
  private lastSpeechEndTime = 0;
  private silenceStartTime = 0;
  private consecutiveSilenceMs = 0;
  private wakeWordDetected = false;
  private wakeWordChecked = false;
  private inConversation = false;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Config, assistant?: Assistant, background = false) {
    super();
    this.config = config;
    this.background = background;
    this.conversationConfig = { ...defaultConversationConfig };
    if (config.voice?.conversation) {
      Object.assign(this.conversationConfig, config.voice.conversation);
    }
    this.mic = new MicrophoneCapture();
    this.stt = new SpeechToText(config);
    this.tts = new TextToSpeech(config);
    this.ownAssistant = !assistant;
    this.assistant = assistant ?? new Assistant(config);
  }

  async start(): Promise<void> {
    logger.info(chalk.cyan('🎙️ Voice conversation mode starting...'));

    if (this.background) {
      const status = this.conversationConfig.wakeWordEnabled
        ? `listening for "${this.conversationConfig.wakeWord}"`
        : 'always listening';
      logger.info(`[Voice] ${status}`);
    } else {
      console.log(chalk.cyan('\n  🎙️ Voice Conversation Mode'));
      console.log(chalk.dim(`  Wake word: ${this.conversationConfig.wakeWordEnabled ? `"${this.conversationConfig.wakeWord}"` : 'disabled'}`));
      console.log(chalk.dim('  Say "exit" or "goodbye" to end the conversation'));
      console.log(chalk.dim('  Press Ctrl+C to quit\n'));

      if (this.conversationConfig.wakeWordEnabled) {
        console.log(chalk.hex('#FF8C42')(`  🤫 Listening for wake word "${this.conversationConfig.wakeWord}"...\n`));
      } else {
        console.log(chalk.hex('#FF8C42')('  🎤 Always listening (wake word disabled)\n'));
      }
    }

    this.running = true;
    this.setupMicEvents();
    this.mic.start();
  }

  stop(): void {
    this.running = false;
    this.mic.stop();
    if (this.ownAssistant) this.assistant.destroy();
    if (this.followUpTimer) clearTimeout(this.followUpTimer);
    logger.info('Voice conversation stopped');
  }

  isListening(): boolean {
    return this.running;
  }

  private setupMicEvents(): void {
    this.mic.on('audio', (chunk: AudioChunk) => {
      if (!this.running) return;
      this.processAudioChunk(chunk);
    });

    this.mic.on('error', (err: Error) => {
      logger.error(`Mic error: ${err.message}`);
      if (this.background) {
        logger.warn('Voice disabled — install sox/rec/arecord for voice features');
      } else {
        console.log(chalk.red(`\n  ❌ Microphone error: ${err.message}`));
        console.log(chalk.yellow('  Make sure sox/rec/arecord is installed\n'));
      }
    });

    this.mic.on('stopped', () => {
      logger.info('Mic stopped');
    });
  }

  private processAudioChunk(chunk: AudioChunk): void {
    const threshold = this.conversationConfig.vadThreshold;

    if (chunk.energy > threshold) {
      if (!this.speaking) {
        this.speaking = true;
        this.speechStartTime = chunk.timestamp;
        this.speechBuffer = [chunk.buffer];
        this.consecutiveSilenceMs = 0;
      } else {
        this.speechBuffer.push(chunk.buffer);
        this.consecutiveSilenceMs = 0;
      }
      this.silenceStartTime = 0;
    } else {
      if (this.speaking) {
        this.speechBuffer.push(chunk.buffer);
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = chunk.timestamp;
        }
        this.consecutiveSilenceMs = chunk.timestamp - this.silenceStartTime;

        const speechDuration = this.silenceStartTime - this.speechStartTime;
        if (speechDuration > this.conversationConfig.maxSpeechMs) {
          this.finalizeSpeechSegment();
        } else if (this.consecutiveSilenceMs >= this.conversationConfig.silenceTimeoutMs) {
          this.finalizeSpeechSegment();
        }
      }
    }
  }

  private async finalizeSpeechSegment(): Promise<void> {
    this.speaking = false;
    this.lastSpeechEndTime = Date.now();

    const audioData = Buffer.concat(this.speechBuffer);
    this.speechBuffer = [];
    this.consecutiveSilenceMs = 0;
    this.silenceStartTime = 0;

    const speechDuration = this.lastSpeechEndTime - this.speechStartTime;
    if (speechDuration < this.conversationConfig.minSpeechMs) return;

    this.processSpeechSegment(audioData);
  }

  private async processSpeechSegment(audioBuffer: Buffer): Promise<void> {
    try {
      if (this.conversationConfig.wakeWordEnabled && !this.wakeWordChecked) {
        const transcript = await this.stt.transcribe(audioBuffer, 'audio/wav');

        const lower = transcript.toLowerCase().trim();
        const matchedWakeWord = WAKE_WORDS.find((ww) => lower.includes(ww));

        if (matchedWakeWord) {
          this.wakeWordDetected = true;
          this.wakeWordChecked = true;
          this.inConversation = true;

          const cleanText = lower.replace(new RegExp(matchedWakeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
          if (!this.background) {
            logger.info(`Wake word "${matchedWakeWord}" detected`);
          }
          logger.info(`[Voice] Wake word triggered by "${matchedWakeWord}"`);

          if (!this.background) {
            console.log(chalk.green(`\n  👋 Yes?`));
          }

          if (cleanText && cleanText.length > 2) {
            await this.handleUserSpeech(cleanText);
          } else if (!this.background) {
            console.log(chalk.hex('#FF8C42')('  🎤 Go ahead, I\'m listening...'));
          }
        }
        return;
      }

      const transcript = await this.stt.transcribe(audioBuffer, 'audio/wav');
      if (!transcript.trim() || transcript.trim().length < 2) return;

      const lower = transcript.toLowerCase().trim();
      if (!this.background && this.isExitPhrase(lower)) {
        console.log(chalk.cyan(`\n  🦞 ${transcript}`));
        console.log(chalk.cyan('  Goodbye! 👋\n'));
        this.stop();
        return;
      }

      await this.handleUserSpeech(transcript);
    } catch (err) {
      logger.error(`Failed to process speech: ${(err as Error).message}`);
    }
  }

  private isExitPhrase(text: string): boolean {
    return ['exit', 'goodbye', 'bye', 'see you later', 'shut down', 'go to sleep'].some(
      (phrase) => text === phrase || text.startsWith(phrase)
    );
  }

  private async handleUserSpeech(transcript: string): Promise<void> {
    if (this.background) {
      logger.info(`[Voice] You: ${transcript}`);
    } else {
      console.log(chalk.white(`\n  You: ${transcript}`));
    }

    try {
      const response = await this.assistant.handleMessage('voice', 'voice-user', transcript);
      logger.info(`[Voice] Response: ${response.slice(0, 100)}${response.length > 100 ? '...' : ''}`);

      if (!this.background) {
        console.log(chalk.cyan(`  🦞 ${response}`));
      }

      try {
        const audioBuffer = await this.tts.speak(response);
        await playMp3Buffer(audioBuffer);
      } catch (ttsErr) {
        logger.warn(`TTS playback failed: ${(ttsErr as Error).message}`);
      }

      this.scheduleFollowUp();
    } catch (err) {
      const error = err as Error;
      logger.error(`LLM response error: ${error.message}`);
      if (!this.background) {
        console.log(chalk.red(`  ❌ Error: ${error.message}`));
      }
    }
  }

  private scheduleFollowUp(): void {
    if (this.followUpTimer) clearTimeout(this.followUpTimer);

    this.followUpTimer = setTimeout(() => {
      if (!this.running) return;
      this.inConversation = false;
      this.wakeWordChecked = false;
      this.wakeWordDetected = false;

      if (this.conversationConfig.wakeWordEnabled) {
        logger.info('[Voice] Returned to wake word listening');
        if (!this.background) {
          console.log(chalk.hex('#FF8C42')(`\n  🤫 Listening for wake word...\n`));
        }
      }
    }, this.conversationConfig.followUpWindowMs);
  }
}
