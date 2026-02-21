// pingme v2 — tunnel manager (cloudflared tunnel lifecycle)

import { spawn, type ChildProcess } from 'child_process';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

let tunnelProc: ChildProcess | null = null;
let tunnelUrl: string | null = null;

/** Start a cloudflare quick tunnel and return the public URL */
export async function startTunnel(port: number): Promise<string> {
  // Kill any existing tunnel first
  stopTunnel();

  return new Promise<string>((resolve, reject) => {
    const proc = spawn('cloudflared', [
      'tunnel', '--url', `http://localhost:${port}`,
      '--no-autoupdate',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tunnelProc = proc;
    let resolved = false;

    const onData = (data: Buffer) => {
      const line = data.toString();
      // Cloudflare prints the URL to stderr
      const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        tunnelUrl = match[0];
        logger.info('Tunnel started', { url: tunnelUrl });
        resolve(tunnelUrl);
      }
    };

    proc.stderr?.on('data', onData);
    proc.stdout?.on('data', onData);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        logger.error('Failed to start cloudflared', { error: String(err) });
        reject(new Error(`Failed to start cloudflared: ${String(err)}`));
      }
    });

    proc.on('exit', (code) => {
      tunnelProc = null;
      tunnelUrl = null;
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited with code ${code}`));
      } else {
        logger.warn('Tunnel process exited', { code });
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        stopTunnel();
        reject(new Error('Tunnel start timeout (15s) — is cloudflared installed?'));
      }
    }, 15_000);
  });
}

/** Stop the tunnel process */
export function stopTunnel(): void {
  if (tunnelProc && !tunnelProc.killed) {
    tunnelProc.kill('SIGTERM');
    logger.info('Tunnel stopped');
  }
  tunnelProc = null;
  tunnelUrl = null;
}

/** Get the current tunnel URL, or null if not running */
export function getTunnelUrl(): string | null {
  return tunnelUrl;
}

/**
 * Ensure the tunnel is running and healthy.
 * Restarts if the process died or the health check fails.
 * Returns the tunnel URL.
 */
export async function ensureTunnel(port: number): Promise<string> {
  // Process still alive — verify with a health check
  if (tunnelProc && !tunnelProc.killed && tunnelUrl) {
    try {
      const resp = await fetch(`${tunnelUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) return tunnelUrl;
    } catch {
      logger.warn('Tunnel health check failed, restarting');
    }
  }

  // Tunnel is dead or unhealthy — restart
  logger.info('Starting tunnel', { port });
  return startTunnel(port);
}
