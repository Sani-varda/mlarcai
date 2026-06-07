import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', '..', 'tmp');

export function playAudio(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    let player: ReturnType<typeof spawn>;

    if (isWindows) {
      player = spawn('powershell', [
        '-Command',
        `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`,
      ], { stdio: 'ignore' });
    } else if (isMac) {
      player = spawn('afplay', [filePath], { stdio: 'ignore' });
    } else {
      player = spawn('aplay', [filePath], { stdio: 'ignore' });
    }

    player.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Player exited with code ${code}`));
    });

    player.on('error', reject);
  });
}

export function playMp3Buffer(buffer: Buffer): Promise<void> {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const tmpFile = join(TMP_DIR, `lobster_voice_${Date.now()}.mp3`);
  writeFileSync(tmpFile, buffer);

  return playAudio(tmpFile).finally(() => {
    try { unlinkSync(tmpFile); } catch {}
  });
}
