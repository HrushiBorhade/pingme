import * as p from '@clack/prompts';
import pc from 'picocolors';
import { open } from 'fs/promises';
import { existsSync, statSync, watch } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { createInterface } from 'readline';

const LOG_FILE = path.join(homedir(), '.pingme', 'daemon.log');

export async function logs(args: string[]) {
  const lines = parseInt(args.find(a => a.startsWith('--lines='))?.split('=')[1] || '20', 10);
  const follow = args.includes('--follow') || args.includes('-f');

  if (!existsSync(LOG_FILE)) {
    p.log.warn('No log file found');
    p.log.info(pc.dim(`Expected at: ${LOG_FILE}`));
    p.log.info(`Start the daemon with: ${pc.cyan('pingme start')}`);
    process.exit(1);
  }

  p.log.info(`${pc.dim('Log file:')} ${LOG_FILE}`);
  console.log();

  // Read the last N lines
  await tailFile(LOG_FILE, lines);

  if (follow) {
    p.log.info(pc.dim('Following log output... (Ctrl+C to stop)'));
    console.log();

    await watchFile(LOG_FILE);
  }
}

async function tailFile(filePath: string, numLines: number): Promise<void> {
  const fh = await open(filePath, 'r');
  const rl = createInterface({ input: fh.createReadStream({ encoding: 'utf-8' }) });

  const buffer: string[] = [];

  for await (const line of rl) {
    buffer.push(line);
    if (buffer.length > numLines) buffer.shift();
  }

  await fh.close();

  for (const line of buffer) {
    console.log(colorLogLine(line));
  }
}

function watchFile(filePath: string): Promise<void> {
  return new Promise((_resolve) => {
    let fileSize = statSync(filePath).size;
    let reading = false;

    watch(filePath, async () => {
      if (reading) return;
      reading = true;

      const fh = await open(filePath, 'r');
      try {
        const stats = statSync(filePath);
        if (stats.size <= fileSize) {
          fileSize = stats.size;
          return;
        }

        const stream = fh.createReadStream({ start: fileSize, encoding: 'utf-8' });
        const rl = createInterface({ input: stream });

        for await (const line of rl) {
          if (line.trim()) console.log(colorLogLine(line));
        }

        fileSize = stats.size;
      } finally {
        await fh.close();
        reading = false;
      }
    });
  });
}

function colorLogLine(line: string): string {
  if (line.includes('[ERROR]')) return pc.red(line);
  if (line.includes('[WARN]')) return pc.yellow(line);
  if (line.includes('[DEBUG]')) return pc.dim(line);
  return line;
}
