// pingme v2 — call manager (batching timer, outbound calls, active call tracking)

import { getLogger } from '../utils/logger.js';
import { saveState } from './state.js';
import { getAll } from './session-registry.js';
import type { DaemonState, EventRecord, ActiveCall, CallRecord, PingmeConfig } from '../types/index.js';

const logger = getLogger();
const MAX_CALL_HISTORY = 50;

export interface CallManager {
  /** Add an event to the batch; starts timer if not running */
  addToBatch(event: EventRecord): void;
  /** Trigger an outbound call immediately with a reason */
  triggerCall(reason: string, priority: 'high' | 'normal'): Promise<void>;
  /** Handle Bolna webhook: call ended */
  onCallEnd(executionId: string, data: { transcript?: string; duration?: number; recording_url?: string }): Promise<void>;
  /** Cancel any pending batch timer */
  cancelBatch(): void;
  /** Shut down the call manager */
  shutdown(): void;
}

export function createCallManager(
  state: DaemonState,
  config: PingmeConfig,
): CallManager {
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let batchedEvents: EventRecord[] = [];

  async function flushBatch(): Promise<void> {
    if (batchedEvents.length === 0) return;

    const events = [...batchedEvents];
    batchedEvents = [];
    batchTimer = null;

    const reason = events.map(e => e.summary).join('; ');
    logger.info('Batch timer expired, triggering call', { eventCount: events.length, reason });

    await triggerCall(reason, 'normal');
  }

  async function triggerCall(reason: string, priority: 'high' | 'normal'): Promise<void> {
    // Don't call if already on a call
    if (state.active_call) {
      logger.info('Already on a call, skipping outbound', { reason });
      return;
    }

    const { bolna, phone } = config;
    if (!bolna.api_key || !bolna.agent_id || !phone) {
      logger.warn('Cannot make outbound call: missing bolna config or phone number');
      return;
    }

    logger.info('Triggering outbound call', { reason, priority });

    try {
      // Build dynamic context for the call
      const sessions = getAll(state);
      const needsAttention = sessions.filter(s =>
        ['stopped', 'asking', 'permission'].includes(s.status),
      ).length;

      const response = await fetch('https://api.bolna.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bolna.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: bolna.agent_id,
          recipient_phone_number: phone,
          user_data: {
            trigger_reason: reason,
            session_count: String(sessions.length),
            needs_attention: String(needsAttention),
          },
          retry_config: {
            enabled: true,
            max_retries: 2,
            retry_on_statuses: ['no-answer', 'busy', 'failed'],
            retry_intervals_minutes: [1, 3],
            retry_on_voicemail: true,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error('Bolna call failed', { status: response.status, body });
        return;
      }

      const result = await response.json() as { execution_id?: string };
      const executionId = result.execution_id || `call-${Date.now()}`;

      state.active_call = {
        bolna_execution_id: executionId,
        started_at: Date.now(),
        direction: 'outbound',
        trigger_event: reason,
        events_during_call: [],
      };
      state.last_call_time = Date.now();
      await saveState(state, config.daemon.state_file);

      logger.info('Outbound call initiated', { executionId });
    } catch (err) {
      logger.error('Failed to trigger outbound call', { error: String(err) });
    }
  }

  async function onCallEnd(
    executionId: string,
    data: { transcript?: string; duration?: number; recording_url?: string },
  ): Promise<void> {
    if (!state.active_call) {
      logger.warn('Received call end but no active call tracked', { executionId });
      return;
    }

    const record: CallRecord = {
      execution_id: executionId,
      direction: state.active_call.direction,
      started_at: state.active_call.started_at,
      ended_at: Date.now(),
      duration_seconds: data.duration ?? Math.floor((Date.now() - state.active_call.started_at) / 1000),
      trigger_event: state.active_call.trigger_event,
      transcript_summary: data.transcript?.substring(0, 500) ?? null,
    };

    state.call_history = [...state.call_history, record].slice(-MAX_CALL_HISTORY);
    state.active_call = null;
    await saveState(state, config.daemon.state_file);

    logger.info('Call ended', {
      executionId,
      duration: record.duration_seconds,
      direction: record.direction,
    });
  }

  function addToBatch(event: EventRecord): void {
    batchedEvents.push(event);

    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(() => {
      flushBatch().catch(err => logger.error('Batch flush failed', { error: String(err) }));
    }, config.policy.batch_window_seconds * 1000);

    logger.debug('Event batched', { event: event.event, batchSize: batchedEvents.length });
  }

  function cancelBatch(): void {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    batchedEvents = [];
  }

  function shutdown(): void {
    cancelBatch();
  }

  return {
    addToBatch,
    triggerCall,
    onCallEnd,
    cancelBatch,
    shutdown,
  };
}
