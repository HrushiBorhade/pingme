import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, configExists } from '../utils/config.js';
import type { SessionSummary, ActiveCall, CallRecord } from '../types/index.js';

const STATUS_EMOJI: Record<string, string> = {
  active: '🟢',
  stopped: '🛑',
  waiting: '⏳',
  asking: '❓',
  permission: '🔐',
  ended: '⚫',
};

function timeAgo(timestamp: string | number): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface StatusResponse {
  sessions: SessionSummary[];
  active_call: ActiveCall | null;
  recent_calls: CallRecord[];
  uptime_seconds: number;
  queued_instructions: number;
}

export async function status(args: string[]) {
  const jsonMode = args.includes('--json');

  if (!configExists()) {
    p.log.error('pingme is not configured');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} first`);
    process.exit(1);
  }

  const config = await loadConfig();
  const port = config.daemon.port;

  let data: StatusResponse;
  try {
    const res = await fetch(`http://localhost:${port}/status`, {
      headers: { 'Authorization': `Bearer ${config.daemon_token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as StatusResponse;
  } catch {
    p.log.error('Daemon is not running');
    p.log.info(`Start it with: ${pc.cyan('pingme start')}`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Daemon info
  const uptimeMin = Math.floor(data.uptime_seconds / 60);
  p.log.info(`Daemon uptime: ${pc.cyan(`${uptimeMin}m`)}  |  Queued instructions: ${pc.cyan(String(data.queued_instructions))}`);

  // Active call
  if (data.active_call) {
    p.log.info(`${pc.green('📞 Active call')} — ${data.active_call.direction} (${timeAgo(data.active_call.started_at)})`);
  }

  // Sessions
  if (data.sessions.length === 0) {
    p.log.info(pc.dim('No active sessions'));
    p.outro(pc.dim('Waiting for Claude Code hooks...'));
    return;
  }

  console.log();
  console.log(
    `  ${pc.dim(pad('SESSION', 20))} ${pc.dim(pad('STATUS', 12))} ${pc.dim(pad('PROJECT', 18))} ${pc.dim(pad('PANE', 10))} ${pc.dim('LAST ACTIVITY')}`,
  );
  console.log(pc.dim('  ' + '─'.repeat(78)));

  for (const s of data.sessions) {
    const emoji = STATUS_EMOJI[s.status] || '⚪';
    const statusText = colorStatus(s.status);
    const name = pad(s.name || '(unnamed)', 20);
    const project = pad(s.project || '-', 18);
    const pane = pad(s.tmux_pane || '-', 10);
    const activity = s.last_activity ? timeAgo(s.last_activity) : '-';

    console.log(`  ${name} ${emoji} ${statusText} ${project} ${pane} ${pc.dim(activity)}`);

    if (s.last_message) {
      console.log(`  ${pc.dim('  └ ' + truncate(s.last_message, 70))}`);
    }
  }

  console.log();
  p.outro(pc.dim(`${data.sessions.length} session(s)`));
}

function colorStatus(status: string): string {
  const text = pad(status, 10);
  switch (status) {
    case 'active': return pc.green(text);
    case 'stopped': return pc.red(text);
    case 'asking':
    case 'permission': return pc.yellow(text);
    case 'waiting': return pc.dim(text);
    case 'ended': return pc.dim(text);
    default: return text;
  }
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max - 3) + '...' : str;
}
