import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { ALL_EVENTS, type HookEventDef } from '../utils/events.js';
import { getEnabledEvents, updateEvents } from '../utils/install.js';

export async function events() {
  const hookPath = path.join(homedir(), '.claude', 'hooks', 'pingme.sh');
  const configPath = path.join(homedir(), '.claude', 'settings.json');

  if (!existsSync(hookPath)) {
    p.log.error('pingme is not installed');
    p.log.info(`Run ${pc.cyan('npx pingme-cli init')} to set up`);
    process.exit(1);
  }

  // Read current config to find enabled events
  let config: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) {
      const existing = await readFile(configPath, 'utf-8');
      config = JSON.parse(existing);
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException | SyntaxError;
    if (error instanceof SyntaxError) {
      p.log.warn('Settings file is corrupted - using defaults');
    } else if ('code' in error && error.code !== 'ENOENT') {
      p.log.warn(`Failed to read settings: ${error.message}`);
    }
    // Use fresh config
  }

  const currentlyEnabled = getEnabledEvents(config);
  const currentScriptArgs = new Set(currentlyEnabled.map((e) => e.scriptArg));

  p.log.info(
    pc.dim(`Currently enabled: ${currentlyEnabled.length} event${currentlyEnabled.length !== 1 ? 's' : ''}`)
  );

  const selectedEvents = await p.multiselect({
    message: 'Which events should trigger an SMS?',
    options: ALL_EVENTS.map((evt) => ({
      value: evt,
      label: `${evt.emoji}  ${evt.label}`,
      hint: evt.spammy ? 'spammy' : evt.description,
    })),
    initialValues: ALL_EVENTS.filter((e) => currentScriptArgs.has(e.scriptArg)),
    required: true,
  });

  if (p.isCancel(selectedEvents)) {
    p.cancel('Cancelled');
    return;
  }

  const enabledEvents = selectedEvents as HookEventDef[];

  const s = p.spinner();
  s.start('Updating event configuration');
  try {
    await updateEvents(enabledEvents);
    s.stop('Events updated');
  } catch (err) {
    s.stop(pc.red('Failed to update events'));
    p.log.error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }

  const eventList = enabledEvents.map((e) => `  ${e.emoji}  ${e.label}`).join('\n');
  p.note(
    `SMS notifications enabled for:

${eventList}`,
    'Updated'
  );

  p.outro(pc.dim('Done!'));
}
