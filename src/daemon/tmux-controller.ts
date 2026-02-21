// pingme v2 — tmux controller (send instructions to Claude Code sessions)

import { execFile } from 'child_process';
import { promisify } from 'util';
import { getLogger } from '../utils/logger.js';
import { isInstructionSafe } from '../utils/security.js';
import type { SessionState } from '../types/index.js';

const execFileAsync = promisify(execFile);
const logger = getLogger();

/** Check if a tmux session exists */
export async function checkPaneExists(tmuxSession: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', tmuxSession]);
    return true;
  } catch {
    return false;
  }
}

/** Get the last N lines of a tmux pane's visible content */
export async function getPaneContent(tmuxPane: string, lines: number = 5): Promise<string> {
  try {
    const { stdout } = await execFileAsync('tmux', [
      'capture-pane', '-t', tmuxPane, '-p',
    ]);
    return stdout.split('\n').slice(-lines).join('\n');
  } catch (err) {
    logger.warn('Failed to capture pane content', { pane: tmuxPane, error: String(err) });
    return '';
  }
}

/** Check if a tmux pane is waiting for user input */
export async function isSessionWaiting(tmuxPane: string): Promise<boolean> {
  const content = await getPaneContent(tmuxPane, 5);
  if (!content) return false;

  return (
    content.includes('\u276F') ||   // ❯ prompt
    content.includes('? ') ||
    content.includes('(y/n)') ||
    content.includes('(Y/n)') ||
    content.includes('(yes/no)')
  );
}

/** Send an instruction to a Claude Code session via tmux send-keys */
export async function sendToSession(
  session: SessionState,
  instruction: string,
): Promise<{ success: boolean; error?: string }> {
  // Safety check — block dangerous patterns
  if (!isInstructionSafe(instruction)) {
    logger.warn('Blocked unsafe instruction', {
      session: session.session_name,
      instruction: instruction.substring(0, 80),
    });
    return { success: false, error: 'Instruction blocked by safety filter' };
  }

  // Verify the tmux session still exists
  const exists = await checkPaneExists(session.tmux_session);
  if (!exists) {
    return { success: false, error: `tmux session "${session.tmux_session}" not found` };
  }

  // Check if Claude Code is actually waiting for input
  const waiting = await isSessionWaiting(session.tmux_pane);
  if (!waiting) {
    return { success: false, error: `Session "${session.session_name}" is not waiting for input` };
  }

  // Send the instruction via tmux send-keys
  // execFile passes instruction as a single argument — no shell injection possible
  try {
    await execFileAsync('tmux', ['send-keys', '-t', session.tmux_pane, instruction, 'Enter']);
    logger.info('Sent instruction to session', {
      session: session.session_name,
      pane: session.tmux_pane,
      instruction: instruction.substring(0, 120),
    });
    return { success: true };
  } catch (err) {
    logger.error('Failed to send keys to tmux', {
      session: session.session_name,
      error: String(err),
    });
    return { success: false, error: `Failed to send to tmux: ${String(err)}` };
  }
}
