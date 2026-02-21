// pingme v2 — Bolna API client

import { getLogger } from '../utils/logger.js';

const logger = getLogger();

const BOLNA_BASE_URL = 'https://api.bolna.ai';

export interface BolnaCallResponse {
  execution_id: string;
  status: string;
}

export interface BolnaExecutionStatus {
  execution_id: string;
  status: string;
  transcript?: string;
  duration?: number;
  recording_url?: string;
}

export class BolnaClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${BOLNA_BASE_URL}${path}`;

    logger.debug('Bolna API request', { method, path });

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('Bolna API error', { status: response.status, body: text });
      throw new Error(`Bolna API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Trigger an outbound call via Bolna */
  async makeCall(agentId: string, phone: string): Promise<BolnaCallResponse> {
    return this.request<BolnaCallResponse>('POST', '/call', {
      agent_id: agentId,
      recipient_phone_number: phone,
    });
  }

  /** Get the status of a call execution */
  async getExecution(executionId: string): Promise<BolnaExecutionStatus> {
    return this.request<BolnaExecutionStatus>('GET', `/executions/${executionId}`);
  }

  /** Get a Bolna agent's full configuration (v2 API) */
  async getAgent(agentId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', `/v2/agent/${agentId}`);
  }

  /** Update a Bolna agent's configuration (v2 PUT — requires all existing fields) */
  async updateAgent(agentId: string, agentConfig: Record<string, unknown>): Promise<void> {
    await this.request('PUT', `/v2/agent/${agentId}`, { agent_config: agentConfig });
  }
}
