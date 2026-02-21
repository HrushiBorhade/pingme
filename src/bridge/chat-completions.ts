// pingme v2 — /v1/chat/completions endpoint (Bolna Custom LLM bridge)

import crypto from 'crypto';
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '../utils/logger.js';
import { buildSystemPrompt, buildCallContextFromActiveCall } from '../daemon/context-builder.js';
import {
  convertToOpenAIStreamChunk,
  convertToOpenAIResponse,
  convertOpenAIMessagesToAnthropic,
} from './anthropic-adapter.js';
import type { OpenAIMessage } from './anthropic-adapter.js';
import type { DaemonState, PingmeConfig } from '../types/index.js';
import * as sessionRegistry from '../daemon/session-registry.js';

const logger = getLogger();

export function createChatCompletionsRouter(
  getState: () => DaemonState,
  config: PingmeConfig,
): Router {
  const router = Router();

  const anthropic = new Anthropic({
    apiKey: config.bridge.api_key,
  });

  router.post('/', async (req, res) => {
    try {
      const { messages, stream } = req.body as {
        messages?: OpenAIMessage[];
        stream?: boolean;
      };

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      const state = getState();

      // Get active sessions sorted by priority
      const sessions = sessionRegistry.getAll(state);

      // Build dynamic system prompt with live session data
      const callContext = buildCallContextFromActiveCall(state.active_call);
      const systemPrompt = buildSystemPrompt(sessions, callContext);

      // Convert OpenAI messages to Anthropic format, injecting our system prompt
      const { system: _originalSystem, messages: anthropicMessages } =
        convertOpenAIMessagesToAnthropic(messages);

      // Our system prompt takes precedence; append the original if present
      const fullSystem = _originalSystem
        ? `${systemPrompt}\n\n---\nADDITIONAL CONTEXT FROM AGENT CONFIG:\n${_originalSystem}`
        : systemPrompt;

      logger.debug('Bridge request', {
        messageCount: messages.length,
        sessionCount: sessions.length,
        stream,
      });

      const requestId = `chatcmpl-${crypto.randomUUID()}`;

      if (stream) {
        // Streaming mode — Bolna expects OpenAI SSE format
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Abort if Anthropic takes too long (voice latency is critical)
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 10_000);

        const streamResponse = anthropic.messages.stream({
          model: config.bridge.model,
          max_tokens: config.bridge.max_tokens,
          system: fullSystem,
          messages: anthropicMessages,
        }, { signal: abortController.signal });

        streamResponse.on('streamEvent', (event: Anthropic.MessageStreamEvent) => {
          const chunk = convertToOpenAIStreamChunk(event, requestId);
          if (chunk) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        });

        streamResponse.on('end', () => {
          clearTimeout(timeout);
          res.write('data: [DONE]\n\n');
          res.end();
        });

        streamResponse.on('error', (err: Error) => {
          logger.error('Anthropic stream error', { error: err.message });
          // Try to send error in SSE format if headers already sent
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            res.status(500).json({ error: 'LLM stream error' });
          }
        });
      } else {
        // Non-streaming mode
        const response = await anthropic.messages.create({
          model: config.bridge.model,
          max_tokens: config.bridge.max_tokens,
          system: fullSystem,
          messages: anthropicMessages,
        });

        const openaiResponse = convertToOpenAIResponse(response, requestId);
        res.json(openaiResponse);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Chat completions error', { error: message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
