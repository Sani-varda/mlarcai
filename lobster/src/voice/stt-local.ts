import { spawn, execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', '..', 'tmp');
const SAMPLE_RATE = 16000;

export class LocalSTT {
  private model: string;
  private readyPromise: Promise<void> | null = null;
  private ready = false;
  private pythonCmd: string;

  constructor(model = 'tiny') {
    this.model = model;
    this.pythonCmd = this.findPython();
  }

  private findPython(): string {
    try {
      execSync('python --version', { encoding: 'utf8' });
      return 'python';
    } catch {
      try {
        execSync('python3 --version', { encoding: 'utf8' });
        return 'python3';
      } catch {}
    }
    return 'python';
  }

  async ensureModel(): Promise<void> {
    if (this.ready) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const proc = spawn(this.pythonCmd, [
        '-c',
        `import whisper; whisper.load_model('${this.model}'); print('OK')`,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          this.ready = true;
          logger.info(`Whisper model "${this.model}" loaded`);
          resolve();
        } else {
          reject(new Error(`Failed to load whisper model: ${stderr.slice(0, 200)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });

    return this.readyPromise;
  }

  async transcribe(audioBuffer: Buffer, _mimeType: string): Promise<string> {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const wavPath = join(TMP_DIR, `lobster-stt-${randomUUID()}.wav`);

    try {
      const wavBuffer = this.rawToWav(audioBuffer);
      writeFileSync(wavPath, wavBuffer);

      return new Promise<string>((resolve, reject) => {
        const proc = spawn(this.pythonCmd, [
          '-c',
          `import whisper; m = whisper.load_model('${this.model}'); r = m.transcribe('${wavPath.replace(/\\/g, '/')}'); print(r['text'])`,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          try { unlinkSync(wavPath); } catch {}

          if (code === 0) {
            const text = stdout.trim();
            resolve(text || '');
          } else {
            const msg = stderr.includes('FP16') ? 'Whisper running on CPU (this is fine)' : stderr.slice(0, 200);
            logger.warn(`Whisper stderr: ${msg}`);
            resolve(stdout.trim() || '');
          }
        });

        proc.on('error', (err) => {
          try { unlinkSync(wavPath); } catch {}
          reject(err);
        });
      });
    } catch (err) {
      try { unlinkSync(wavPath); } catch {}
      throw err;
    }
  }

  private rawToWav(rawPcm: Buffer): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = rawPcm.length;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(totalSize - 8, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20);  // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, rawPcm]);
  }
}
