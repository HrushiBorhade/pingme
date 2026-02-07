import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import { unlink, access, constants } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { cleanSettingsJson } from '../utils/install.js';

export async function uninstall() {
  const hookPath = path.join(homedir(), '.claude', 'hooks', 'pingme.sh');

  if (!existsSync(hookPath)) {
    p.log.warn('pingme is not installed (hook file not found)');
    p.outro(pc.dim('Nothing to do'));
    return;
  }

  // Check if we have write permission to delete the file
  try {
    await access(hookPath, constants.W_OK);
  } catch {
    p.log.error(`Permission denied: Cannot delete ${hookPath}`);
    p.log.info(pc.dim(`Try running: sudo rm "${hookPath}"`));
    process.exit(1);
  }

  const confirm = await p.confirm({
    message: 'Remove pingme?',
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    return;
  }

  const s = p.spinner();
  s.start('Removing pingme');

  try {
    await unlink(hookPath);
  } catch (err) {
    s.stop('Could not remove hook');
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    p.log.error(`Failed to delete hook: ${errorMessage}`);
    p.log.info(pc.dim(`Manually delete: rm "${hookPath}"`));
    process.exit(1);
  }

  // Clean up settings.json entries
  try {
    await cleanSettingsJson();
  } catch {
    // Non-fatal — hook file is already gone
  }

  s.stop('pingme removed');
  p.outro(pc.dim('pingme uninstalled'));
}
