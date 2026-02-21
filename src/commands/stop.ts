import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const PID_FILE = path.join(homedir(), '.pingme', 'daemon.pid');

export async function stop() {
  const s = p.spinner();
  s.start('Stopping daemon');

  if (!existsSync(PID_FILE)) {
    s.stop(pc.yellow('No PID file found'));
    p.log.info(pc.dim('If the daemon is running, stop it manually or use Ctrl+C'));
    p.outro(pc.dim('Daemon stopped'));
    return;
  }

  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);

    if (!isNaN(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        s.stop(`Daemon stopped (pid ${pid})`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
          s.stop(pc.yellow('Daemon was not running (stale PID file)'));
        } else {
          throw err;
        }
      }
    }

    await unlink(PID_FILE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      s.stop(pc.red('Failed to stop daemon'));
      p.log.error(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  }

  p.outro(pc.dim('Daemon stopped'));
}
