import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BIT_DEPTH = 16;

export interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
  energy: number;
}

export class MicrophoneCapture extends EventEmitter {
  private process: ChildProcess | null = null;
  private running = false;
  private device: string;

  constructor(device?: string) {
    super();
    this.device = device || 'default';
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    try {
      if (isWindows) {
        this.process = spawn('sox', [
          '-b', String(BIT_DEPTH),
          '--endian', 'little',
          '-c', String(CHANNELS),
          '-r', String(SAMPLE_RATE),
          '-e', 'signed-integer',
          '-t', 'waveaudio', 'default', '-p',
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
      } else if (isMac) {
        this.process = spawn('rec', [
          '-b', String(BIT_DEPTH),
          '--endian', 'little',
          '-c', String(CHANNELS),
          '-r', String(SAMPLE_RATE),
          '-e', 'signed-integer',
          '-t', 'raw', '-',
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
      } else {
        this.process = spawn('arecord', [
          '-c', String(CHANNELS),
          '-r', String(SAMPLE_RATE),
          '-f', 'S16_LE',
          '-D', this.device,
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
      }

      const stream = this.process.stdout;
      if (!stream) {
        this.emit('error', new Error('Failed to get stdout from audio process'));
        return;
      }

      stream.on('data', (data: Buffer) => {
        if (!this.running) return;
        const energy = this.calculateEnergy(data);
        this.emit('audio', { buffer: data, timestamp: Date.now(), energy });
      });

      stream.on('error', (err) => {
        this.emit('error', err);
      });

      this.process.on('exit', (code) => {
        logger.info(`Mic process exited with code ${code}`);
        this.running = false;
        this.emit('stopped');
      });

      logger.info(`Microphone started (${isWindows ? 'sox' : isMac ? 'rec' : 'arecord'}, ${SAMPLE_RATE}Hz)`);
    } catch (err) {
      this.running = false;
      this.emit('error', new Error(`Failed to start mic: ${(err as Error).message}`));
    }
  }

  stop(): void {
    this.running = false;
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {}
      this.process = null;
    }
  }

  private calculateEnergy(data: Buffer): number {
    let sum = 0;
    const samples = data.length / 2;
    for (let i = 0; i < data.length; i += 2) {
      const sample = data.readInt16LE(i);
      sum += Math.abs(sample);
    }
    return sum / samples;
  }

  isRunning(): boolean {
    return this.running;
  }
}
