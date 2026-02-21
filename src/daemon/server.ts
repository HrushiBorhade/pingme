// pingme v2 — daemon HTTP server (Express on port 7331)

import express from 'express';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';
import { createAuthMiddleware, isInstructionSafe, isValidTmuxTarget } from '../utils/security.js';
import { loadState, saveState } from './state.js';
import { registerOrUpdate, findByName, findByPane, cleanStale, getAll } from './session-registry.js';
import { decide } from './decision-engine.js';
import { createCallManager } from './call-manager.js';
import type { CallManager } from './call-manager.js';
import { startTunnel, stopTunnel } from './tunnel.js';
import { createChatCompletionsRouter } from '../bridge/chat-completions.js';
import { getToolsV2WithUrl } from '../bolna/custom-functions.js';
import { BolnaClient } from '../bolna/client.js';
import { humanizeAge } from '../utils/format.js';
import type {
  PingmeConfig,
  DaemonState,
  HookEvent,
  SessionState,
  QueuedInstruction,
  SessionSummary,
  RouteResult,
  ActionResult,
} from '../types/index.js';

const execFileAsync = promisify(execFile);

const RECEIVABLE_STATUSES = new Set(['stopped', 'asking', 'permission']);
const TERMINAL_CALL_STATUSES = new Set(['completed', 'failed', 'no-answer', 'busy', 'voicemail', 'error', 'carrier', 'call-disconnected']);
const MAX_QUEUE_DEPTH = 200;

function canReceiveInput(status: string): boolean {
  return RECEIVABLE_STATUSES.has(status);
}

/** Map session state to a summary for API responses */
function toSessionSummary(s: SessionState): SessionSummary {
  return {
    name: s.session_name,
    project: s.project,
    status: s.status,
    last_activity: humanizeAge(Date.now() - s.last_event_time * 1000),
    last_message: s.last_message ? s.last_message.substring(0, 200) : undefined,
    tmux_pane: s.tmux_pane,
    can_receive_input: canReceiveInput(s.status),
    pending_action: s.pending_action,
  };
}

/** Send a text instruction to a tmux session via send-keys */
async function sendToSession(
  session: SessionState,
  instruction: string,
): Promise<{ success: boolean; error?: string }> {
  // Validate the tmux session exists
  try {
    await execFileAsync('tmux', ['has-session', '-t', session.tmux_session]);
  } catch {
    return { success: false, error: `tmux session "${session.tmux_session}" not found` };
  }

  // Send the instruction via tmux send-keys
  try {
    await execFileAsync('tmux', ['send-keys', '-t', session.tmux_pane, instruction, 'Enter']);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to send keys: ${String(err)}` };
  }
}

/** Deliver any queued instructions for a session that just stopped */
async function deliverQueuedInstructions(
  state: DaemonState,
  session: SessionState,
  config: PingmeConfig,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const pending = state.instruction_queue.filter(
    q => q.target_session_id === session.id && !q.delivered && q.deliver_on === 'next_stop',
  );

  for (const qi of pending) {
    // Re-check safety at delivery time
    if (!isInstructionSafe(qi.instruction)) {
      logger.warn('Blocked queued instruction at delivery', {
        session: session.session_name,
        instruction: qi.instruction.substring(0, 80),
      });
      qi.delivered = true;
      qi.delivered_at = Date.now();
      continue;
    }

    const result = await sendToSession(session, qi.instruction);
    if (result.success) {
      qi.delivered = true;
      qi.delivered_at = Date.now();
      logger.info('Delivered queued instruction', {
        session: session.session_name,
        instruction: qi.instruction.substring(0, 80),
      });
    } else {
      logger.warn('Failed to deliver queued instruction', {
        session: session.session_name,
        error: result.error,
      });
    }
  }

  if (pending.length > 0) {
    await saveState(state, config.daemon.state_file);
  }
}

/** Prune delivered instructions from the queue */
function pruneInstructionQueue(state: DaemonState): void {
  state.instruction_queue = state.instruction_queue.filter(q => !q.delivered);
  if (state.instruction_queue.length > MAX_QUEUE_DEPTH) {
    state.instruction_queue = state.instruction_queue.slice(-MAX_QUEUE_DEPTH);
  }
}

/** Start the daemon server. Returns the Express app for testing. */
export async function startDaemon(config: PingmeConfig): Promise<express.Express> {
  const logger = createLogger(config.daemon.log_level);
  const app = express();
  const authMiddleware = createAuthMiddleware(config.daemon_token);

  // Load persisted state
  const state = await loadState(config.daemon.state_file);

  // Clear any stale active call from a previous crash
  if (state.active_call) {
    logger.warn('Found active call from previous run, clearing');
    state.active_call = null;
    await saveState(state, config.daemon.state_file);
  }

  // Create call manager
  const callManager: CallManager = createCallManager(state, config);

  // Middleware
  app.use(express.json());

  // ─── Bridge: /v1/chat/completions ── Bolna Custom LLM (no auth — Bolna can't send Bearer) ───
  const chatRouter = createChatCompletionsRouter(() => state, config);
  app.use('/v1/chat/completions', chatRouter);

  // ─── POST /hooks/event ── from hook scripts (authenticated) ───
  app.post('/hooks/event', authMiddleware, (req, res) => {
    const event = req.body as HookEvent;

    if (!event.event || !event.directory) {
      res.status(400).json({ error: 'Missing required fields: event, directory' });
      return;
    }

    // Validate tmux targets
    if (event.tmux_pane && !isValidTmuxTarget(event.tmux_pane)) {
      res.status(400).json({ error: 'Invalid tmux_pane format' });
      return;
    }
    if (event.tmux_session && !isValidTmuxTarget(event.tmux_session)) {
      res.status(400).json({ error: 'Invalid tmux_session format' });
      return;
    }

    // Default timestamp if missing
    if (!event.timestamp) {
      event.timestamp = Math.floor(Date.now() / 1000);
    }

    // Log payload at debug level for diagnostics
    logger.debug('Hook event received', {
      event: event.event,
      pane: event.tmux_pane,
      payload: event.payload,
    });

    // Update session registry
    const session = registerOrUpdate(state, event);

    // Deliver queued instructions if session stopped
    if (event.event === 'stopped' || event.event === 'task_completed') {
      deliverQueuedInstructions(state, session, config, logger).catch(err =>
        logger.error('Error delivering queued instructions', { error: String(err) }),
      );
    }

    // If active call, inject event into call context
    if (state.active_call) {
      state.active_call.events_during_call.push({
        event: event.event,
        timestamp: event.timestamp,
        summary: `${session.session_name}: ${event.event}`,
      });
      logger.info('Event during active call', { event: event.event, session: session.session_name });
    } else {
      // Decision engine
      const action = decide(event, state, config.policy);

      switch (action.type) {
        case 'call':
          // Cancel batch timer for high priority, call immediately
          callManager.cancelBatch();
          callManager.triggerCall(action.reason, action.priority).catch(err =>
            logger.error('Failed to trigger call', { error: String(err) }),
          );
          break;
        case 'batch':
          callManager.addToBatch(action.event);
          break;
        case 'sms':
          logger.info('SMS action (not implemented yet)', { message: action.message });
          break;
        case 'ignore':
          break;
      }
    }

    // Persist state asynchronously
    saveState(state, config.daemon.state_file).catch(err =>
      logger.error('Failed to save state', { error: String(err) }),
    );

    res.json({ received: true, session_id: session.id });
  });

  // ─── GET /sessions ── Bolna custom function ──────────────────
  app.get('/sessions', authMiddleware, (_req, res) => {
    const sessionName = _req.query.session_name as string | undefined;

    let sessions = getAll(state);

    if (sessionName) {
      sessions = sessions.filter(s =>
        s.session_name.toLowerCase().includes(sessionName.toLowerCase()),
      );
    }

    const summary = sessions.map(toSessionSummary);
    res.json({ sessions: summary, total: summary.length });
  });

  // ─── POST /route ── Bolna custom function (send instruction) ─
  app.post('/route', authMiddleware, async (req, res) => {
    const { session_name, instruction, queue_if_busy } = req.body as {
      session_name?: string;
      instruction?: string;
      queue_if_busy?: boolean | string;
    };

    if (!session_name || !instruction) {
      const result: RouteResult = { success: false, error: 'Missing session_name or instruction' };
      res.status(400).json(result);
      return;
    }

    // Safety check
    if (!isInstructionSafe(instruction)) {
      const result: RouteResult = {
        success: false,
        error: 'Instruction blocked by safety filter',
      };
      res.json(result);
      return;
    }

    const session = findByName(state, session_name);
    if (!session) {
      const result: RouteResult = {
        success: false,
        error: `No session found matching "${session_name}"`,
      };
      res.json(result);
      return;
    }

    if (canReceiveInput(session.status)) {
      const sendResult = await sendToSession(session, instruction);
      const result: RouteResult = {
        success: sendResult.success,
        message: sendResult.success
          ? `Sent "${instruction}" to ${session.session_name}`
          : sendResult.error,
      };
      res.json(result);
      return;
    }

    // Session is busy — normalize queue_if_busy from string or boolean
    const shouldQueue = queue_if_busy === true || queue_if_busy === 'true';
    if (shouldQueue) {
      // Enforce queue depth limit
      pruneInstructionQueue(state);
      if (state.instruction_queue.length >= MAX_QUEUE_DEPTH) {
        const result: RouteResult = {
          success: false,
          error: 'Instruction queue is full. Try again later.',
        };
        res.json(result);
        return;
      }

      const queued: QueuedInstruction = {
        id: crypto.randomUUID(),
        target_session_id: session.id,
        instruction,
        queued_at: Date.now(),
        deliver_on: 'next_stop',
        delivered: false,
        delivered_at: null,
      };
      state.instruction_queue.push(queued);
      await saveState(state, config.daemon.state_file);

      const result: RouteResult = {
        success: true,
        queued: true,
        message: `Session "${session.session_name}" is busy. Instruction queued for delivery when it next stops.`,
      };
      res.json(result);
      return;
    }

    const result: RouteResult = {
      success: false,
      error: `Session "${session.session_name}" is currently working and not accepting input.`,
      suggestion: 'Set queue_if_busy to true to queue the instruction.',
    };
    res.json(result);
  });

  // ─── POST /action ── Bolna custom function (approve/deny/etc) ─
  app.post('/action', authMiddleware, async (req, res) => {
    const { session_name, action } = req.body as {
      session_name?: string;
      action?: string;
    };

    if (!session_name || !action) {
      const result: ActionResult = { success: false, error: 'Missing session_name or action' };
      res.status(400).json(result);
      return;
    }

    const session = findByName(state, session_name);
    if (!session) {
      const result: ActionResult = { success: false, error: `Session "${session_name}" not found` };
      res.json(result);
      return;
    }

    switch (action) {
      case 'approve':
      case 'deny': {
        if (session.status !== 'permission') {
          res.json({ success: false, error: 'Session is not waiting for permission' } satisfies ActionResult);
          return;
        }
        const key = action === 'approve' ? 'y' : 'n';
        const verb = action === 'approve' ? 'Approved' : 'Denied';
        const sendResult = await sendToSession(session, key);
        const result: ActionResult = {
          success: sendResult.success,
          message: sendResult.success
            ? `${verb} permission for ${session.session_name}`
            : sendResult.error,
        };
        res.json(result);
        return;
      }

      case 'cancel': {
        try {
          await execFileAsync('tmux', ['send-keys', '-t', session.tmux_pane, 'C-c']);
          const result: ActionResult = { success: true, message: `Sent cancel signal to ${session.session_name}` };
          res.json(result);
        } catch {
          const result: ActionResult = { success: false, error: 'Failed to send cancel signal' };
          res.json(result);
        }
        return;
      }

      case 'status': {
        const result: ActionResult = {
          success: true,
          session: {
            ...session,
            recent_events: session.recent_events.slice(-10),
          },
        };
        res.json(result);
        return;
      }

      default: {
        const result: ActionResult = { success: false, error: `Unknown action: ${action}` };
        res.json(result);
        return;
      }
    }
  });

  // ─── POST /webhooks/bolna ── call status webhooks ────────────
  app.post('/webhooks/bolna', (req, res) => {
    const body = req.body as Record<string, unknown>;
    // Bolna may send execution_id under different field names
    const execution_id = (body.execution_id ?? body.executionId ?? body.call_id ?? body.id) as string | undefined;
    const status = body.status as string | undefined;
    const transcript = body.transcript as string | undefined;
    const duration = body.duration as number | undefined;
    const recording_url = body.recording_url as string | undefined;

    logger.info('Bolna webhook', { execution_id, status, duration, body_keys: Object.keys(body) });

    if (state.active_call && TERMINAL_CALL_STATUSES.has(status ?? '')) {
      if (execution_id && execution_id === state.active_call.bolna_execution_id) {
        // Exact match — trusted
        logger.info('Clearing active call on terminal status', { status, execution_id });
        callManager.onCallEnd(execution_id, { transcript, duration, recording_url }).catch(err =>
          logger.error('Error handling call end', { error: String(err) }),
        );
      } else if (!execution_id) {
        // Bolna sometimes omits execution_id — accept only if the call has been
        // active for at least 5 seconds (reduces spoofing window on this unauthed endpoint)
        const callAge = Date.now() - state.active_call.started_at;
        if (callAge > 5000) {
          const eid = state.active_call.bolna_execution_id;
          logger.warn('Bolna webhook missing execution_id, clearing active call by age', { status, callAge, eid });
          callManager.onCallEnd(eid, { transcript, duration, recording_url }).catch(err =>
            logger.error('Error handling call end', { error: String(err) }),
          );
        } else {
          logger.warn('Bolna webhook missing execution_id and call too fresh, ignoring', { status, callAge });
        }
      } else {
        logger.warn('Bolna webhook execution_id mismatch, ignoring', {
          received: execution_id,
          expected: state.active_call.bolna_execution_id,
        });
      }
    }

    res.status(200).json({ received: true });
  });

  // ─── GET /health ── health check (minimal, no sensitive data) ─
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ─── GET /status ── detailed status for CLI ───────────────────
  app.get('/status', authMiddleware, (_req, res) => {
    const sessions = getAll(state);

    const summary = sessions.map(toSessionSummary);
    res.json({
      sessions: summary,
      active_call: state.active_call,
      recent_calls: state.call_history.slice(-10),
      uptime_seconds: Math.floor(process.uptime()),
      queued_instructions: state.instruction_queue.filter(q => !q.delivered).length,
    });
  });

  // ─── POST /sessions/:pane/name ── rename a session ────────────
  app.post('/sessions/:pane/name', authMiddleware, (req, res) => {
    const { name } = req.body as { name?: string };
    const rawPane = req.params.pane;
    const pane = decodeURIComponent(Array.isArray(rawPane) ? rawPane[0] : rawPane);

    if (!name) {
      res.status(400).json({ success: false, error: 'Missing name' });
      return;
    }

    const session = findByPane(state, pane);
    if (!session) {
      res.status(404).json({ success: false, error: `No session found for pane "${pane}"` });
      return;
    }

    session.session_name = name;
    saveState(state, config.daemon.state_file).catch(err =>
      logger.error('Failed to save state after rename', { error: String(err) }),
    );

    res.json({ success: true, session });
  });

  // ─── POST /call ── internal: trigger outbound call now ──────
  app.post('/call', authMiddleware, async (_req, res) => {
    const reason = (_req.body as { reason?: string }).reason || 'manual trigger';

    if (state.active_call) {
      res.json({ success: false, error: 'A call is already active' });
      return;
    }

    await callManager.triggerCall(reason, 'high');
    res.json({ success: true, message: 'Call triggered' });
  });

  // Start stale session cleanup interval (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const removed = cleanStale(state, config.sessions.cleanup_after_minutes);
    if (removed > 0) {
      pruneInstructionQueue(state);
      saveState(state, config.daemon.state_file).catch(err =>
        logger.error('Failed to save state after cleanup', { error: String(err) }),
      );
    }
  }, 5 * 60 * 1000);

  // Start the HTTP server
  const server = app.listen(config.daemon.port, () => {
    logger.info(`Daemon listening on port ${config.daemon.port}`);

    // Start tunnel and register with Bolna (async, non-blocking)
    if (config.mode === 'voice' && config.bolna.api_key && config.bolna.agent_id) {
      startTunnel(config.daemon.port)
        .then(async (tunnelUrl) => {
          logger.info('Tunnel ready, updating Bolna agent', { tunnelUrl });

          const bolna = new BolnaClient(config.bolna.api_key);
          const apiTools = getToolsV2WithUrl(tunnelUrl, config.daemon_token);

          try {
            // GET current agent config (v2 API returns full config)
            const currentAgent = await bolna.getAgent(config.bolna.agent_id) as Record<string, unknown>;

            // Set webhook URL so Bolna sends call events back to us
            currentAgent.webhook_url = `${tunnelUrl}/webhooks/bolna`;

            // Set context-aware welcome message using dynamic variables
            currentAgent.agent_welcome_message =
              "Hey, it's pingme. {trigger_reason}. Want the full status, or should I just cover what needs attention?";

            // Navigate to tasks[0] and configure everything
            const tasks = currentAgent.tasks as Record<string, unknown>[] | undefined;
            if (tasks && Array.isArray(tasks) && tasks.length > 0) {
              const task = tasks[0];

              // ── task_config: conversation behavior settings ──
              const taskConfig = (task.task_config ?? {}) as Record<string, unknown>;
              taskConfig.hangup_after_silence = 10;
              taskConfig.call_terminate = config.policy.max_call_duration;
              taskConfig.number_of_words_for_interruption = 3;
              taskConfig.incremental_delay = 500;
              taskConfig.backchanneling = true;
              taskConfig.backchanneling_message_gap = 6;
              taskConfig.backchanneling_start_delay = 4;
              taskConfig.voicemail = true;
              task.task_config = taskConfig;

              // ── tools_config: LLM + api_tools ──
              const toolsConfig = (task.tools_config ?? {}) as Record<string, unknown>;

              // Custom LLM pointing to our tunnel bridge
              const llmAgent = (toolsConfig.llm_agent ?? {}) as Record<string, unknown>;
              const existingLlmConfig = (llmAgent.llm_config ?? {}) as Record<string, unknown>;
              llmAgent.llm_config = {
                ...existingLlmConfig,
                provider: 'custom',
                base_url: `${tunnelUrl}/v1`,
                model: 'custom',
                max_tokens: config.bridge.max_tokens,
                family: 'openai',
                temperature: 0.1,
                top_p: 0.9,
                agent_flow_type: 'streaming',
              };
              toolsConfig.llm_agent = llmAgent;

              // Custom functions in v2 format
              toolsConfig.api_tools = apiTools;

              // Transcriber: Deepgram nova-3 with multilingual code-switching (Hindi + English)
              const transcriber = (toolsConfig.transcriber ?? {}) as Record<string, unknown>;
              const transcriberConfig = (transcriber.transcriber_config ?? {}) as Record<string, unknown>;
              transcriberConfig.model = 'nova-3';
              transcriberConfig.language = 'multi';
              transcriberConfig.keywords = 'tmux:80,Claude:90,pane:70,session:60,frontend:50,backend:50,approve:80,deny:80,cancel:70,permission:60,haan:60,nahi:60,theek:50';
              transcriberConfig.endpointing = 200;
              transcriber.transcriber_config = transcriberConfig;
              toolsConfig.transcriber = transcriber;

              // Synthesizer: ElevenLabs multilingual with Hindi voice
              const synthesizer = (toolsConfig.synthesizer ?? {}) as Record<string, unknown>;
              const synthConfig = (synthesizer.synthesizer_config ?? {}) as Record<string, unknown>;
              synthConfig.model = 'eleven_turbo_v2_5';
              synthConfig.voice = 'Daksh';
              synthConfig.voice_id = 'Z55vjGJIfg7PlYv2c1k6';
              synthConfig.buffer_size = 200;
              synthConfig.speed_rate = 1.05;
              synthesizer.synthesizer_config = synthConfig;
              toolsConfig.synthesizer = synthesizer;

              task.tools_config = toolsConfig;
            }

            // PUT back the full config via v2 API
            await bolna.updateAgent(config.bolna.agent_id, currentAgent);
            logger.info('Bolna agent updated with tunnel URL, custom functions, and voice settings');
          } catch (err) {
            logger.error('Failed to update Bolna agent', { error: String(err) });
          }
        })
        .catch(err => {
          logger.error('Failed to start tunnel', { error: String(err) });
        });
    }
  });

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down daemon...');
    clearInterval(cleanupInterval);
    callManager.shutdown();
    stopTunnel();
    server.close();
    saveState(state, config.daemon.state_file).catch(err =>
      logger.error('Failed to save state during shutdown', { error: String(err) }),
    );
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return app;
}

// Auto-start when spawned as background daemon
if (process.env.PINGME_DAEMON === '1') {
  import('../utils/config.js').then(async ({ loadConfig }) => {
    const config = await loadConfig();
    await startDaemon(config);
  }).catch(err => {
    console.error('Daemon failed to start:', err);
    process.exit(1);
  });
}
