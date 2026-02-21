// pingme v2 — Anthropic <-> OpenAI format conversion for Bolna bridge

import type Anthropic from '@anthropic-ai/sdk';

// ─── OpenAI-compatible types (what Bolna expects) ───────────────

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

export interface OpenAIChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Converters ──────────────────────────────────────────────────

/** Convert an Anthropic streaming event to an OpenAI SSE chunk */
export function convertToOpenAIStreamChunk(
  event: Anthropic.MessageStreamEvent,
  requestId: string,
): OpenAIStreamChunk | null {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    return {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'pingme-bridge',
      choices: [{
        index: 0,
        delta: { content: event.delta.text },
        finish_reason: null,
      }],
    };
  }

  if (event.type === 'message_stop') {
    return {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'pingme-bridge',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    };
  }

  // Other event types (message_start, content_block_start, etc.) — skip
  return null;
}

/** Convert a complete Anthropic Message to an OpenAI chat completion response */
export function convertToOpenAIResponse(
  message: Anthropic.Message,
  requestId: string,
): OpenAIChatCompletion {
  const textContent = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    id: requestId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'pingme-bridge',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: textContent },
      finish_reason: message.stop_reason === 'end_turn' ? 'stop' : message.stop_reason ?? 'stop',
    }],
    usage: {
      prompt_tokens: message.usage.input_tokens,
      completion_tokens: message.usage.output_tokens,
      total_tokens: message.usage.input_tokens + message.usage.output_tokens,
    },
  };
}

/** Extract system message and convert OpenAI messages to Anthropic format */
export function convertOpenAIMessagesToAnthropic(messages: OpenAIMessage[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  let system = '';
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Concatenate system messages (Bolna may send its own + ours)
      system += (system ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Anthropic requires the first message to be from the user
  // If no user messages, add a placeholder
  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== 'user') {
    anthropicMessages.unshift({
      role: 'user',
      content: 'Hello',
    });
  }

  return { system, messages: anthropicMessages };
}
