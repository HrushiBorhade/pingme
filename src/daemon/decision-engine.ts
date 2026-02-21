// pingme v2 — decision engine (HookEvent + DaemonState -> NotifyAction)

import type { HookEvent, DaemonState, NotifyAction, EventRecord, CallPolicy } from '../types/index.js';

/** Convert a HookEvent to an EventRecord for batching */
function toEventRecord(event: HookEvent): EventRecord {
  const summary = event.payload?.message
    ? `${event.event}: ${String(event.payload.message).substring(0, 120)}`
    : event.event;

  return {
    event: event.event,
    timestamp: event.timestamp,
    summary,
  };
}

/** Format a one-line SMS message from a hook event */
function formatSMS(event: HookEvent): string {
  const project = event.project || 'unknown';

  switch (event.event) {
    case 'stopped':
      return `[pingme] ${project} stopped${event.payload?.reason ? `: ${event.payload.reason}` : ''}`;
    case 'question':
      return `[pingme] ${project} is asking: ${event.payload?.message || 'needs input'}`;
    case 'permission':
      return `[pingme] ${project} needs permission${event.payload?.message ? `: ${event.payload.message}` : ''}`;
    case 'task_completed':
      return `[pingme] ${project} completed a task`;
    case 'tool_failed':
      return `[pingme] ${project} tool failed: ${event.payload?.tool_name || 'unknown'}`;
    default:
      return `[pingme] ${project}: ${event.event}`;
  }
}

/** Parse "HH:MM" time string to minutes since midnight */
function parseTime(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) throw new Error(`Invalid time format: "${time}"`);
  return h * 60 + m;
}

/** Check if the current time falls within quiet hours */
function isQuietHours(policy: CallPolicy): boolean {
  if (!policy.quiet_hours.enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const start = parseTime(policy.quiet_hours.start);
  const end = parseTime(policy.quiet_hours.end);

  // Handle overnight range (e.g. 23:00 -> 07:00)
  if (start > end) {
    return currentMinutes >= start || currentMinutes < end;
  }
  return currentMinutes >= start && currentMinutes < end;
}

/** Normal stop reasons that don't need a call — Claude finished its work */
const SILENT_STOP_REASONS = new Set(['end_turn', 'max_turns']);

/** Build a voice-friendly reason string from an event */
function voiceReason(event: HookEvent): string {
  const project = event.project || 'a session';
  const toolName = event.payload?.tool_name ? String(event.payload.tool_name) : null;
  const toolInput = event.payload?.tool_input as Record<string, unknown> | undefined;

  if (event.event === 'permission') {
    if (toolName === 'Bash' && toolInput?.command) {
      return `${project} needs permission to run a command`;
    }
    if (toolName === 'Write' || toolName === 'Edit') {
      return `${project} needs permission to modify a file`;
    }
    return `${project} needs your permission`;
  }

  if (event.event === 'question') {
    const questions = toolInput?.questions as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(questions) && questions.length > 0 && questions[0].question) {
      return `${project} has a question for you`;
    }
    return `${project} needs your input`;
  }

  if (event.event === 'stopped') {
    const reason = event.payload?.reason ? String(event.payload.reason) : '';
    if (reason && !SILENT_STOP_REASONS.has(reason)) {
      return `${project} stopped unexpectedly`;
    }
    return `${project} finished and stopped`;
  }

  if (event.event === 'task_completed') {
    return `${project} completed a task`;
  }

  return `${project} needs attention`;
}

/** Evaluate a hook event and decide what notification action to take */
export function decide(event: HookEvent, state: DaemonState, policy: CallPolicy): NotifyAction {
  // Session start/end are silent
  if (event.event === 'session_start' || event.event === 'session_end') {
    return { type: 'ignore' };
  }

  // Notifications are silent — just informational
  if (event.event === 'notification') {
    return { type: 'ignore' };
  }

  // Check if this event type is configured to trigger calls
  const callOn = policy.call_on;
  const eventKey = event.event as keyof typeof callOn;
  const isCallEnabled = callOn[eventKey] ?? false;

  // During active call -- batch events into the conversation
  if (state.active_call) {
    return { type: 'batch', event: toEventRecord(event) };
  }

  // Quiet hours -- downgrade to SMS or silence
  if (isQuietHours(policy)) {
    if (policy.quiet_hours.mode === 'sms') {
      return { type: 'sms', message: formatSMS(event) };
    }
    return { type: 'ignore' };
  }

  // Cooldown -- don't call again too soon
  if (state.last_call_time &&
      Date.now() - state.last_call_time < policy.cooldown_seconds * 1000) {
    return { type: 'sms', message: formatSMS(event) };
  }

  // Permission request or question -- always call (high priority, session is blocked)
  if (event.event === 'permission' || event.event === 'question') {
    if (isCallEnabled) {
      return { type: 'call', reason: voiceReason(event), priority: 'high' };
    }
    return { type: 'sms', message: formatSMS(event) };
  }

  // Stopped -- only call if the stop reason indicates something unexpected
  if (event.event === 'stopped') {
    const reason = event.payload?.reason ? String(event.payload.reason) : '';
    if (SILENT_STOP_REASONS.has(reason)) {
      // Normal completion — don't bother the user
      return { type: 'ignore' };
    }
    // Unexpected stop — batch it (may warrant attention)
    if (isCallEnabled) {
      return { type: 'batch', event: toEventRecord(event) };
    }
    return { type: 'sms', message: formatSMS(event) };
  }

  // Task completed -- batchable (normal priority)
  if (event.event === 'task_completed') {
    if (isCallEnabled) {
      return { type: 'batch', event: toEventRecord(event) };
    }
    return { type: 'sms', message: formatSMS(event) };
  }

  // Everything else -- ignore (subagent events, pre_tool, etc.)
  return { type: 'ignore' };
}
