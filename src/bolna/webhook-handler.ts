// pingme v2 — Bolna webhook handler (receives call status updates)

import { Router } from 'express';
import { getLogger } from '../utils/logger.js';
import type { DaemonState, CallRecord } from '../types/index.js';

const logger = getLogger();

const MAX_CALL_HISTORY = 50;

export interface BolnaWebhookPayload {
  execution_id?: string;
  status?: string;
  transcript?: string;
  duration?: number;
  recording_url?: string;
}

export function createWebhookRouter(
  getState: () => DaemonState,
  saveState: (state: DaemonState) => Promise<void>,
): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const body = req.body as BolnaWebhookPayload;
    const { execution_id, status, transcript, duration } = body;

    logger.info('Bolna webhook received', { execution_id, status, duration });

    const state = getState();

    if (status === 'completed' || status === 'failed' || status === 'no-answer' || status === 'busy') {
      // Record call in history
      if (state.active_call && state.active_call.bolna_execution_id === execution_id) {
        const record: CallRecord = {
          execution_id: execution_id || '',
          direction: state.active_call.direction,
          started_at: state.active_call.started_at,
          ended_at: Date.now(),
          duration_seconds: duration || Math.floor((Date.now() - state.active_call.started_at) / 1000),
          trigger_event: state.active_call.trigger_event,
          transcript_summary: transcript ? transcript.substring(0, 500) : null,
        };

        state.call_history = [...state.call_history, record].slice(-MAX_CALL_HISTORY);
        state.active_call = null;
        state.last_call_time = Date.now();

        logger.info('Call ended', {
          execution_id,
          status,
          duration: record.duration_seconds,
        });

        saveState(state).catch(err => {
          logger.error('Failed to save state after call end', { error: String(err) });
        });
      }
    }

    res.status(200).json({ received: true });
  });

  return router;
}
