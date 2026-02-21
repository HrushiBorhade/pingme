// pingme v2 — hook installer (writes script + updates settings.json)

import { writeFile, readFile, mkdir, stat, lstat, access, constants } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { generateHookScript } from './generator.js';
import { ALL_EVENTS, getDefaultEvents, type HookEventDef } from '../utils/events.js';
import type { PingmeConfig } from '../types/index.js';

// ─── Paths ──────────────────────────────────────────────────────

const PINGME_HOOKS_DIR = path.join(homedir(), '.pingme', 'hooks');
const HOOK_SCRIPT_PATH = path.join(PINGME_HOOKS_DIR, 'pingme.sh');
const CLAUDE_SETTINGS_PATH = path.join(homedir(), '.claude', 'settings.json');

// ─── Settings helpers ───────────────────────────────────────────

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type: string; command: string; timeout?: number }>;
};

async function readClaudeSettings(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn('[pingme] settings.json has invalid JSON — using defaults');
    }
    return {};
  }
}

async function writeClaudeSettings(config: Record<string, unknown>): Promise<void> {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  await mkdir(dir, { recursive: true });

  try {
    await access(dir, constants.W_OK);
  } catch {
    throw new Error(`Cannot write to ${CLAUDE_SETTINGS_PATH} — check permissions`);
  }

  await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(config, null, 2));

  const stats = await stat(CLAUDE_SETTINGS_PATH);
  if (stats.size === 0) {
    throw new Error('Settings file is empty after write');
  }
}

/** Remove all existing pingme v2 hook entries from settings.json */
function removePingmeV2Hooks(config: Record<string, unknown>): void {
  if (!config.hooks || typeof config.hooks !== 'object') return;

  const hooks = config.hooks as Record<string, unknown>;

  for (const eventName of Object.keys(hooks)) {
    const eventHooks = hooks[eventName];
    if (!Array.isArray(eventHooks)) continue;

    const validHooks = eventHooks.filter((h): h is HookEntry => {
      return typeof h === 'object' && h !== null && 'hooks' in h;
    });

    hooks[eventName] = validHooks.filter(
      h => !h.hooks?.some(hook => hook.command?.includes('.pingme/hooks/pingme.sh')),
    );

    if ((hooks[eventName] as HookEntry[]).length === 0) {
      delete hooks[eventName];
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete config.hooks;
  }
}

/** Add v2 hook entries for enabled events */
function addPingmeV2Hooks(config: Record<string, unknown>, events: HookEventDef[]): void {
  config.hooks = (config.hooks as Record<string, unknown[]>) || {};
  const hooks = config.hooks as Record<string, HookEntry[]>;

  for (const evt of events) {
    hooks[evt.event] = hooks[evt.event] || [];

    const entry: HookEntry = {
      hooks: [{
        type: 'command',
        command: `~/.pingme/hooks/pingme.sh ${evt.scriptArg}`,
        timeout: 5000,
      }],
    };
    if (evt.matcher) {
      entry.matcher = evt.matcher;
    }

    hooks[evt.event].push(entry);
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Install the v2 hook script and register hooks in settings.json.
 * Writes ~/.pingme/hooks/pingme.sh and updates ~/.claude/settings.json.
 */
export async function installV2Hooks(
  config: PingmeConfig,
  enabledEvents?: HookEventDef[],
): Promise<void> {
  // Create hooks directory
  await mkdir(PINGME_HOOKS_DIR, { recursive: true });

  // Security: verify it's not a symlink
  const dirStats = await lstat(PINGME_HOOKS_DIR);
  if (dirStats.isSymbolicLink()) {
    throw new Error(
      'Security: ~/.pingme/hooks is a symlink. Refusing to install. ' +
      'Remove the symlink and try again.',
    );
  }

  // Write the hook script
  const script = generateHookScript(config.daemon.port, config.daemon_token);
  await writeFile(HOOK_SCRIPT_PATH, script, { mode: 0o700 });

  // Verify the write
  const hookStats = await stat(HOOK_SCRIPT_PATH);
  if (hookStats.size === 0) {
    throw new Error('Hook script is empty after write');
  }
  if ((hookStats.mode & 0o700) !== 0o700) {
    throw new Error('Hook script has incorrect permissions');
  }

  // Update settings.json
  const events = enabledEvents || getDefaultEvents();
  const settings = await readClaudeSettings();

  removePingmeV2Hooks(settings);
  addPingmeV2Hooks(settings, events);

  await writeClaudeSettings(settings);
}

/** Remove all v2 hook entries from settings.json */
export async function uninstallV2Hooks(): Promise<void> {
  const settings = await readClaudeSettings();
  removePingmeV2Hooks(settings);
  await writeClaudeSettings(settings);
}

/** Get currently enabled v2 events from settings.json */
export function getEnabledV2Events(settings: Record<string, unknown>): HookEventDef[] {
  const hooks = settings.hooks as Record<string, HookEntry[]> | undefined;
  if (!hooks) return [];

  const enabled: HookEventDef[] = [];

  for (const evt of ALL_EVENTS) {
    const eventHooks = hooks[evt.event];
    if (!Array.isArray(eventHooks)) continue;

    const hasPingmeV2 = eventHooks.some(h =>
      h.hooks?.some(hook => hook.command?.includes('.pingme/hooks/pingme.sh')),
    );
    if (hasPingmeV2) {
      enabled.push(evt);
    }
  }

  return enabled;
}
