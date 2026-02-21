// pingme v2 — session registry (manages SessionState map)

import crypto from 'crypto';
import { getLogger } from '../utils/logger.js';
import type { HookEvent, SessionState, EventRecord, DaemonState, PendingAction } from '../types/index.js';

const logger = getLogger();
const MAX_RECENT_EVENTS = 20;

/** Extract a one-line summary from a hook event payload */
function extractSummary(event: HookEvent): string {
  if (!event.payload) return event.event;

  // For question/pre_tool events with AskUserQuestion, surface the actual question text
  if (event.event === 'question' || event.event === 'pre_tool') {
    const toolInput = event.payload.tool_input as Record<string, unknown> | undefined;
    const questions = toolInput?.questions as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(questions) && questions.length > 0 && questions[0].question) {
      return `${event.event}: ${String(questions[0].question).substring(0, 120)}`;
    }
  }

  const msg =
    (event.payload.message as string) ||
    (event.payload.tool_name as string) ||
    (event.payload.reason as string) ||
    '';

  if (msg) return `${event.event}: ${msg.substring(0, 120)}`;
  return event.event;
}

/** Create a PendingAction with defaults for null fields */
function pendingAction(fields: Partial<PendingAction> & Pick<PendingAction, 'type' | 'summary'>): PendingAction {
  return {
    detail: null,
    options: null,
    tool_name: null,
    command: null,
    file_path: null,
    ...fields,
  };
}

/** Parse AskUserQuestion tool_input into a question PendingAction */
function parseQuestionInput(toolInput: Record<string, unknown> | undefined): PendingAction | null {
  const questions = toolInput?.questions as Array<Record<string, unknown>> | undefined;
  if (!questions || !Array.isArray(questions) || questions.length === 0) return null;

  const q = questions[0];
  const questionText = q.question ? String(q.question) : 'Unknown question';
  const opts = q.options as Array<Record<string, unknown>> | undefined;
  const optionLabels: string[] = [];

  if (opts && Array.isArray(opts)) {
    for (const opt of opts) {
      const label = opt.label ? String(opt.label) : '';
      const desc = opt.description ? String(opt.description) : '';
      optionLabels.push(desc ? `${label} — ${desc}` : label);
    }
  }

  return pendingAction({
    type: 'question',
    summary: questionText.substring(0, 300),
    detail: questions.length > 1 ? `${questions.length} questions total` : null,
    options: optionLabels.length > 0 ? optionLabels : null,
    tool_name: 'AskUserQuestion',
  });
}

/** Extract a rich pending action from a hook event payload */
function extractPendingAction(event: HookEvent): PendingAction | null {
  const payload = event.payload;
  const toolName = payload?.tool_name ? String(payload.tool_name) : null;
  const toolInput = payload?.tool_input as Record<string, unknown> | undefined;

  switch (event.event) {
    case 'permission': {
      if (toolName === 'Bash' && toolInput?.command) {
        const cmd = String(toolInput.command);
        return pendingAction({
          type: 'permission',
          summary: `Wants to run: ${cmd.substring(0, 200)}`,
          detail: cmd.length > 200 ? cmd : null,
          tool_name: toolName,
          command: cmd,
        });
      }

      if (toolName === 'Write' && toolInput?.file_path) {
        return pendingAction({
          type: 'permission',
          summary: `Wants to create file: ${String(toolInput.file_path)}`,
          tool_name: toolName,
          file_path: String(toolInput.file_path),
        });
      }

      if (toolName === 'Edit' && toolInput?.file_path) {
        const snippet = toolInput.old_string ? String(toolInput.old_string).substring(0, 100) : null;
        return pendingAction({
          type: 'permission',
          summary: `Wants to edit: ${String(toolInput.file_path)}`,
          detail: snippet,
          tool_name: toolName,
          file_path: String(toolInput.file_path),
        });
      }

      return pendingAction({
        type: 'permission',
        summary: toolName ? `Needs permission to use ${toolName}` : 'Needs permission',
        tool_name: toolName,
      });
    }

    case 'question': {
      const parsed = parseQuestionInput(toolInput);
      if (parsed) return parsed;

      const msg = payload?.message ? String(payload.message) : 'Agent is asking a question';
      return pendingAction({
        type: 'question',
        summary: msg.substring(0, 300),
        tool_name: 'AskUserQuestion',
      });
    }

    case 'stopped': {
      const reason = payload?.reason ? String(payload.reason) : '';
      const msg = payload?.message ? String(payload.message) : '';
      return pendingAction({
        type: 'stopped',
        summary: reason ? `Stopped: ${reason}` : 'Stopped',
        detail: msg || null,
      });
    }

    case 'task_completed': {
      const msg = payload?.message ? String(payload.message) : '';
      return pendingAction({
        type: 'task_completed',
        summary: msg ? `Task completed: ${msg.substring(0, 200)}` : 'Task completed',
        detail: msg.length > 200 ? msg : null,
      });
    }

    case 'tool_failed': {
      const error = payload?.error ? String(payload.error) : (payload?.message ? String(payload.message) : '');
      return pendingAction({
        type: 'tool_failed',
        summary: toolName ? `${toolName} failed: ${error.substring(0, 200)}` : `Tool failed: ${error.substring(0, 200)}`,
        detail: error.length > 200 ? error : null,
        tool_name: toolName,
      });
    }

    case 'notification': {
      const msg = payload?.message ? String(payload.message) : 'Notification';
      return pendingAction({ type: 'notification', summary: msg.substring(0, 300) });
    }

    case 'subagent_stop': {
      const msg = payload?.message ? String(payload.message) : '';
      const name = payload?.subagent_name ? String(payload.subagent_name) : '';
      return pendingAction({
        type: 'subagent_stop',
        summary: name ? `Subagent "${name}" finished` : 'Subagent finished',
        detail: msg || null,
      });
    }

    case 'subagent_start': {
      const name = payload?.subagent_name ? String(payload.subagent_name) : '';
      const desc = payload?.description ? String(payload.description) : '';
      return pendingAction({
        type: 'subagent_start',
        summary: name ? `Subagent "${name}" started` : 'Subagent started',
        detail: desc || null,
      });
    }

    case 'session_start':
      return pendingAction({ type: 'session_start', summary: 'Session started' });

    case 'session_end':
      return pendingAction({ type: 'session_end', summary: 'Session ended' });

    case 'pre_tool': {
      // PreToolUse for AskUserQuestion -- extract question + options early
      if (toolName === 'AskUserQuestion') {
        const parsed = parseQuestionInput(toolInput);
        if (parsed) return parsed;
      }

      // Generic pre-tool: extract what tool is about to be used
      if (toolName) {
        let summary = `About to use ${toolName}`;
        if (toolName === 'Bash' && toolInput?.command) {
          summary = `About to run: ${String(toolInput.command).substring(0, 200)}`;
        } else if ((toolName === 'Write' || toolName === 'Edit') && toolInput?.file_path) {
          summary = `About to ${toolName === 'Write' ? 'create' : 'edit'}: ${String(toolInput.file_path)}`;
        }

        return pendingAction({
          type: 'pre_tool',
          summary,
          tool_name: toolName,
          command: toolInput?.command ? String(toolInput.command) : null,
          file_path: toolInput?.file_path ? String(toolInput.file_path) : null,
        });
      }

      return null;
    }

    default:
      return null;
  }
}

/** Map hook event names to session status */
function eventToStatus(eventName: string): SessionState['status'] {
  switch (eventName) {
    case 'session_start':
      return 'active';
    case 'stopped':
      return 'stopped';
    case 'question':
      return 'asking';
    case 'permission':
      return 'permission';
    case 'session_end':
      return 'ended';
    default:
      return 'active';
  }
}

/** Register a new session or update an existing one from a hook event */
export function registerOrUpdate(state: DaemonState, event: HookEvent): SessionState {
  // Find existing session by (directory, tmux_pane) pair
  const existing = Object.values(state.sessions).find(
    s => s.directory === event.directory && s.tmux_pane === event.tmux_pane,
  );

  const record: EventRecord = {
    event: event.event,
    timestamp: event.timestamp,
    summary: extractSummary(event),
  };

  if (existing) {
    existing.status = eventToStatus(event.event);
    existing.last_event = event.event;
    existing.last_event_time = event.timestamp;
    existing.recent_events = [...existing.recent_events, record].slice(-MAX_RECENT_EVENTS);
    existing.pending_action = extractPendingAction(event);

    if (event.payload?.message) {
      existing.last_message = String(event.payload.message).substring(0, 500);
    }
    if (event.payload?.tool_name) {
      existing.last_tool = String(event.payload.tool_name);
    }
    if (event.event === 'stopped' && event.payload?.reason) {
      existing.stop_reason = String(event.payload.reason);
    }

    logger.debug('Updated session', { id: existing.id, event: event.event });
    return existing;
  }

  // Create new session
  const id = crypto.randomUUID();
  const session: SessionState = {
    id,
    project: event.project,
    directory: event.directory,
    tmux_session: event.tmux_session,
    tmux_pane: event.tmux_pane,
    status: eventToStatus(event.event),
    last_event: event.event,
    last_event_time: event.timestamp,
    recent_events: [record],
    last_message: event.payload?.message ? String(event.payload.message).substring(0, 500) : '',
    last_tool: event.payload?.tool_name ? String(event.payload.tool_name) : '',
    stop_reason: '',
    registered_at: Date.now(),
    session_name: event.project || `session-${id.substring(0, 8)}`,
    pending_action: extractPendingAction(event),
  };

  state.sessions[id] = session;
  logger.info('Registered new session', { id, name: session.session_name, pane: session.tmux_pane });
  return session;
}

/** Find a session by friendly name (case-insensitive partial match) */
export function findByName(state: DaemonState, name: string): SessionState | undefined {
  const lower = name.toLowerCase();
  return Object.values(state.sessions).find(
    s => s.session_name.toLowerCase() === lower ||
         s.session_name.toLowerCase().includes(lower),
  );
}

/** Find a session by tmux pane address */
export function findByPane(state: DaemonState, pane: string): SessionState | undefined {
  return Object.values(state.sessions).find(s => s.tmux_pane === pane);
}

/** Remove sessions with no events for longer than maxAgeMs */
export function cleanStale(state: DaemonState, maxAgeMinutes: number): number {
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  let removed = 0;

  for (const [id, session] of Object.entries(state.sessions)) {
    if (now - session.last_event_time * 1000 > maxAgeMs) {
      logger.info('Removing stale session', { id, name: session.session_name });
      delete state.sessions[id];
      removed++;
    }
  }

  return removed;
}

/** Get all non-ended sessions */
export function getAll(state: DaemonState): SessionState[] {
  return Object.values(state.sessions).filter(s => s.status !== 'ended');
}
