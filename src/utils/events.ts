// All Claude Code hook events with metadata
// This is the single source of truth for supported events

export interface HookEventDef {
  /** Claude Code hook event name (e.g. "Stop", "PostToolUse") */
  event: string;
  /** Argument passed to pingme.sh script */
  scriptArg: string;
  /** Emoji for SMS message */
  emoji: string;
  /** Short label for display */
  label: string;
  /** Human-readable description */
  description: string;
  /** Whether this event is enabled by default */
  defaultEnabled: boolean;
  /** Optional matcher regex for hook (e.g. "AskUserQuestion" for PostToolUse) */
  matcher?: string;
  /** Whether this event fires frequently and may be annoying */
  spammy: boolean;
}

export const ALL_EVENTS: HookEventDef[] = [
  {
    event: 'TaskCompleted',
    scriptArg: 'task_completed',
    emoji: '✅',
    label: 'Task completed',
    description: 'Agent finished a task',
    defaultEnabled: true,
    spammy: false,
  },
  {
    event: 'Stop',
    scriptArg: 'stopped',
    emoji: '🛑',
    label: 'Agent stopped',
    description: 'Agent stopped running',
    defaultEnabled: true,
    spammy: false,
  },
  {
    event: 'PreToolUse',
    scriptArg: 'question',
    emoji: '❓',
    label: 'Asking question',
    description: 'Agent is about to ask you a question (fires before question is shown)',
    defaultEnabled: true,
    matcher: 'AskUserQuestion',
    spammy: false,
  },
  {
    event: 'Notification',
    scriptArg: 'notification',
    emoji: '🔔',
    label: 'Notification',
    description: 'Agent sent a notification',
    defaultEnabled: true,
    spammy: false,
  },
  {
    event: 'PermissionRequest',
    scriptArg: 'permission',
    emoji: '🔐',
    label: 'Needs permission',
    description: 'Agent needs your permission to proceed',
    defaultEnabled: true,
    spammy: false,
  },
  {
    event: 'PostToolUseFailure',
    scriptArg: 'tool_failed',
    emoji: '❌',
    label: 'Tool failed',
    description: 'A tool call failed',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'SubagentStop',
    scriptArg: 'subagent_stop',
    emoji: '🤖',
    label: 'Subagent finished',
    description: 'A subagent finished running',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'SessionEnd',
    scriptArg: 'session_end',
    emoji: '🔴',
    label: 'Session ended',
    description: 'Claude Code session ended',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'SessionStart',
    scriptArg: 'session_start',
    emoji: '🟢',
    label: 'Session started',
    description: 'Claude Code session started',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'SubagentStart',
    scriptArg: 'subagent_start',
    emoji: '🚀',
    label: 'Subagent started',
    description: 'A subagent started running',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'TeammateIdle',
    scriptArg: 'teammate_idle',
    emoji: '💤',
    label: 'Teammate idle',
    description: 'A teammate agent is idle',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'PreCompact',
    scriptArg: 'pre_compact',
    emoji: '📦',
    label: 'Pre-compact',
    description: 'Context is about to be compacted',
    defaultEnabled: false,
    spammy: false,
  },
  {
    event: 'UserPromptSubmit',
    scriptArg: 'prompt_submit',
    emoji: '📝',
    label: 'Prompt submitted',
    description: 'User submitted a prompt (spammy)',
    defaultEnabled: false,
    spammy: true,
  },
  {
    event: 'PreToolUse',
    scriptArg: 'pre_tool',
    emoji: '🔧',
    label: 'Pre tool use',
    description: 'About to use a tool (spammy)',
    defaultEnabled: false,
    spammy: true,
  },
];

/** Get events that are enabled by default */
export function getDefaultEvents(): HookEventDef[] {
  return ALL_EVENTS.filter((e) => e.defaultEnabled);
}

/** Find an event definition by its script argument */
export function getEventByScriptArg(scriptArg: string): HookEventDef | undefined {
  return ALL_EVENTS.find((e) => e.scriptArg === scriptArg);
}
