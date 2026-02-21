import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, configExists } from '../utils/config.js';
import type { ActionResult } from '../types/index.js';

export async function name(args: string[]) {
  if (!configExists()) {
    p.log.error('pingme is not configured');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} first`);
    process.exit(1);
  }

  const [pane, ...nameParts] = args;
  const newName = nameParts.join(' ');

  if (!pane || !newName) {
    p.log.error('Usage: pingme name <pane> <name>');
    p.log.info(pc.dim('Example: pingme name %0 "frontend build"'));
    process.exit(1);
  }

  const config = await loadConfig();
  const port = config.daemon.port;

  const s = p.spinner();
  s.start(`Renaming session in pane ${pane}`);

  try {
    const res = await fetch(`http://localhost:${port}/sessions/${encodeURIComponent(pane)}/name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.daemon_token}`,
      },
      body: JSON.stringify({ name: newName }),
    });

    const data = (await res.json()) as ActionResult;

    if (!res.ok || !data.success) {
      s.stop(pc.red('Rename failed'));
      p.log.error(data.error || `HTTP ${res.status}`);
      process.exit(1);
    }

    s.stop(`Session renamed to ${pc.cyan(newName)}`);
  } catch {
    s.stop(pc.red('Could not reach daemon'));
    p.log.error('Daemon is not running');
    p.log.info(`Start it with: ${pc.cyan('pingme start')}`);
    process.exit(1);
  }

  p.outro(pc.dim('Done'));
}
