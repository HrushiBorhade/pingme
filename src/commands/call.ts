import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, configExists } from '../utils/config.js';

export async function call(args: string[]) {
  if (!configExists()) {
    p.log.error('pingme is not configured');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} first`);
    process.exit(1);
  }

  const config = await loadConfig();
  const port = config.daemon.port;

  // Parse --session flag
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : undefined;

  const s = p.spinner();
  s.start('Triggering outbound call');

  try {
    const body: Record<string, string> = {};
    if (sessionId) body.session_id = sessionId;

    const res = await fetch(`http://localhost:${port}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.daemon_token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { success: boolean; message?: string; error?: string };

    if (!res.ok || !data.success) {
      s.stop(pc.red('Call failed'));
      p.log.error(data.error || data.message || `HTTP ${res.status}`);
      process.exit(1);
    }

    s.stop('Call initiated');
    if (data.message) p.log.info(data.message);
  } catch {
    s.stop(pc.red('Could not reach daemon'));
    p.log.error('Daemon is not running');
    p.log.info(`Start it with: ${pc.cyan('pingme start')}`);
    process.exit(1);
  }

  p.outro(pc.dim('Your phone should ring shortly'));
}
