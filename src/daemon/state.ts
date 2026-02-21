// pingme v2 — state persistence (read/write ~/.pingme/state.json)

import { writeFile, readFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger.js';
import type { DaemonState } from '../types/index.js';

const logger = getLogger();

export function createEmptyState(): DaemonState {
  return {
    sessions: {},
    instruction_queue: [],
    call_history: [],
    last_call_time: null,
    active_call: null,
  };
}

/** Load state from disk, returning empty state if file doesn't exist */
export async function loadState(statePath: string): Promise<DaemonState> {
  try {
    if (!existsSync(statePath)) {
      logger.info('No state file found, starting fresh');
      return createEmptyState();
    }

    const raw = await readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as DaemonState;

    // Ensure all required fields exist (handles upgrades)
    return {
      sessions: parsed.sessions ?? {},
      instruction_queue: parsed.instruction_queue ?? [],
      call_history: parsed.call_history ?? [],
      last_call_time: parsed.last_call_time ?? null,
      active_call: parsed.active_call ?? null,
    };
  } catch (err) {
    logger.error('Failed to load state file, starting fresh', { error: String(err) });
    return createEmptyState();
  }
}

/** Persist state to disk using atomic write (temp file + rename) */
export async function saveState(state: DaemonState, statePath: string): Promise<void> {
  const dir = path.dirname(statePath);
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    await rename(tmpPath, statePath);
  } catch (err) {
    logger.error('Failed to save state', { error: String(err) });
    throw err;
  }
}
