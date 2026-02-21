import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, configExists } from '../utils/config.js';

const PID_FILE = path.join(homedir(), '.pingme', 'daemon.pid');

export async function start(args: string[]) {
  const background = args.includes('--background') || args.includes('-b');

  if (!configExists()) {
    p.log.error('pingme is not configured');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} first`);
    process.exit(1);
  }

  const config = await loadConfig();
  const port = config.daemon.port;

  if (background) {
    const s = p.spinner();
    s.start('Starting daemon in background');

    try {
      const entrypoint = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../daemon/server.js',
      );

      const child = spawn(process.execPath, [entrypoint], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, PINGME_DAEMON: '1' },
      });

      child.unref();

      if (child.pid) {
        await mkdir(path.dirname(PID_FILE), { recursive: true });
        await writeFile(PID_FILE, String(child.pid), 'utf-8');
      }

      s.stop(`Daemon started (pid ${child.pid})`);
      p.log.info(`Listening on ${pc.cyan(`http://localhost:${port}`)}`);
      p.log.info(`PID file: ${pc.dim(PID_FILE)}`);
      p.outro(pc.dim('Stop with: pingme stop'));
    } catch (err) {
      s.stop(pc.red('Failed to start daemon'));
      p.log.error(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  } else {
    p.log.info(`Starting daemon on ${pc.cyan(`http://localhost:${port}`)}`);
    p.log.info(pc.dim('Press Ctrl+C to stop'));
    console.log();

    const { startDaemon } = await import('../daemon/server.js');
    await startDaemon(config);
  }
}
