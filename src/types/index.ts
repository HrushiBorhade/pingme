// pingme v2 — shared types

// ─── Pending Action ─────────────────────────────────────────

export type PendingActionType =
  | 'permission'
  | 'question'
  | 'stopped'
  | 'task_completed'
  | 'tool_failed'
  | 'notification'
  | 'subagent_stop'
  | 'subagent_start'
  | 'session_start'
  | 'session_end'
  | 'pre_tool';

export interface PendingAction {
  type: PendingActionType;
  summary: string;
  detail: string | null;
  options: string[] | null;
  tool_name: string | null;
  command: string | null;
  file_path: string | null;
}

// ─── Session ─────────────────────────────────────────────────

export type SessionStatus = 'active' | 'stopped' | 'waiting' | 'asking' | 'permission' | 'ended';

export interface EventRecord {
  event: string;
  timestamp: number;
  summary: string;
}

export interface SessionState {
  id: string;
  project: string;
  directory: string;
  tmux_session: string;
  tmux_pane: string;

  status: SessionStatus;
  last_event: string;
  last_event_time: number;

  recent_events: EventRecord[];
  last_message: string;
  last_tool: string;
  stop_reason: string;

  registered_at: number;
  session_name: string;
  pending_action: PendingAction | null;
}

// ─── Hook Events ─────────────────────────────────────────────

export interface HookEvent {
  event: string;
  project: string;
  directory: string;
  tmux_session: string;
  tmux_pane: string;
  timestamp: number;
  payload: Record<string, unknown> | null;
}

// ─── Instruction Queue ───────────────────────────────────────

export interface QueuedInstruction {
  id: string;
  target_session_id: string;
  instruction: string;
  queued_at: number;
  deliver_on: 'next_stop' | 'immediate';
  delivered: boolean;
  delivered_at: number | null;
}

// ─── Calls ───────────────────────────────────────────────────

export interface ActiveCall {
  bolna_execution_id: string;
  started_at: number;
  direction: 'inbound' | 'outbound';
  trigger_event: string | null;
  events_during_call: EventRecord[];
}

export interface CallRecord {
  execution_id: string;
  direction: 'inbound' | 'outbound';
  started_at: number;
  ended_at: number;
  duration_seconds: number;
  trigger_event: string | null;
  transcript_summary: string | null;
}

// ─── Daemon State ────────────────────────────────────────────

export interface DaemonState {
  sessions: Record<string, SessionState>;
  instruction_queue: QueuedInstruction[];
  call_history: CallRecord[];
  last_call_time: number | null;
  active_call: ActiveCall | null;
}

// ─── Call Policy ─────────────────────────────────────────────

export interface CallPolicy {
  cooldown_seconds: number;
  batch_window_seconds: number;
  max_call_duration: number;
  call_on: {
    task_completed: boolean;
    stopped: boolean;
    question: boolean;
    permission: boolean;
    error: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
    mode: 'sms' | 'silent';
  };
}

// ─── Configuration ───────────────────────────────────────────

export interface BolnaConfig {
  api_key: string;
  agent_id: string;
  inbound_number: string;
}

export interface BridgeConfig {
  provider: 'anthropic' | 'openai';
  api_key: string;
  model: string;
  max_tokens: number;
}

export interface TunnelConfig {
  type: 'cloudflared' | 'ngrok';
  name?: string;
  domain?: string;
}

export interface DaemonConfig {
  port: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  state_file: string;
  log_file: string;
}

export interface SmsConfig {
  enabled: boolean;
  provider: 'twilio';
  twilio_sid: string;
  twilio_token: string;
  twilio_from: string;
}

export interface SessionsConfig {
  auto_name: boolean;
  cleanup_after_minutes: number;
}

export interface PingmeConfig {
  mode: 'voice' | 'sms';
  phone: string;
  bolna: BolnaConfig;
  bridge: BridgeConfig;
  tunnel: TunnelConfig;
  daemon: DaemonConfig;
  daemon_token: string;
  policy: CallPolicy;
  sms: SmsConfig;
  sessions: SessionsConfig;
}

// ─── Decision Engine ─────────────────────────────────────────

export type NotifyAction =
  | { type: 'call'; reason: string; priority: 'high' | 'normal' }
  | { type: 'sms'; message: string }
  | { type: 'batch'; event: EventRecord }
  | { type: 'ignore' };

// ─── API Responses ───────────────────────────────────────────

export interface SessionSummary {
  name: string;
  project: string;
  status: SessionStatus;
  last_activity: string;
  last_message: string | undefined;
  tmux_pane: string;
  can_receive_input: boolean;
  pending_action: PendingAction | null;
}

export interface RouteResult {
  success: boolean;
  queued?: boolean;
  message?: string;
  error?: string;
  available_sessions?: string[];
  suggestion?: string;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  session?: SessionState;
}
