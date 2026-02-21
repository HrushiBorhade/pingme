// pingme v2 — Bolna custom function definitions (voice agent tools)

export interface BolnaCustomFunction {
  name: string;
  description: string;
  pre_call_message: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  key: 'custom_task';
  value: {
    method: string;
    param: Record<string, string>;
    url: string;
    api_token: string;
    headers: Record<string, string>;
  };
}

interface ToolTemplate {
  name: string;
  description: string;
  pre_call_message: string;
  parameters: BolnaCustomFunction['parameters'];
  key: 'custom_task';
  value: {
    method: string;
    param: Record<string, string>;
    headers: Record<string, string>;
  };
  urlPath: string;
}

const TEMPLATES: ToolTemplate[] = [
  {
    name: 'get_sessions',
    description:
      'Fetch the current state of all Claude Code sessions. Call this when the user says "what\'s going on", "check my sessions", "any updates", "status report", "how are things", or before routing any instruction. Always call this first to get fresh data.',
    pre_call_message: 'Let me check your sessions.',
    parameters: {
      type: 'object',
      properties: {
        session_name: {
          type: 'string',
          description: 'Optional: filter to a specific session by name. Leave empty for all sessions.',
        },
      },
      required: [],
    },
    key: 'custom_task',
    value: {
      method: 'GET',
      param: {
        session_name: '%(session_name)s',
      },
      headers: {},
    },
    urlPath: '/sessions',
  },
  {
    name: 'route_instruction',
    description:
      'Send a text instruction to a specific Claude Code session. Call this when the user says "tell frontend to...", "send this to...", "run this on...", or gives any instruction for a session. The instruction is typed into the terminal. If busy, it gets queued.',
    pre_call_message: 'Sending that instruction now.',
    parameters: {
      type: 'object',
      properties: {
        session_name: {
          type: 'string',
          description: 'The name of the session to send the instruction to',
        },
        instruction: {
          type: 'string',
          description: 'The instruction text to send to the session',
        },
        queue_if_busy: {
          type: 'string',
          description: 'If "true", queue the instruction for delivery when the session next stops. If "false", fail if session is busy.',
        },
      },
      required: ['session_name', 'instruction'],
    },
    key: 'custom_task',
    value: {
      method: 'POST',
      param: {
        session_name: '%(session_name)s',
        instruction: '%(instruction)s',
        queue_if_busy: '%(queue_if_busy)s',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    },
    urlPath: '/route',
  },
  {
    name: 'trigger_action',
    description:
      "Trigger an action on a session. Call this when the user says 'approve', 'yes allow it', 'go ahead', 'deny', 'no don't allow', 'cancel that', 'stop it', or asks for detailed status of one session. Actions: approve, deny, cancel, status.",
    pre_call_message: 'On it.',
    parameters: {
      type: 'object',
      properties: {
        session_name: {
          type: 'string',
          description: 'The name of the session',
        },
        action: {
          type: 'string',
          description: 'The action to perform: approve, deny, cancel, status',
        },
      },
      required: ['session_name', 'action'],
    },
    key: 'custom_task',
    value: {
      method: 'POST',
      param: {
        session_name: '%(session_name)s',
        action: '%(action)s',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    },
    urlPath: '/action',
  },
];

/** Build the three custom function definitions with tunnel URL and auth token filled in (v1 format) */
export function getToolsWithUrl(tunnelUrl: string, token: string): BolnaCustomFunction[] {
  const apiToken = `Bearer ${token}`;

  return TEMPLATES.map(({ urlPath, value, ...rest }) => ({
    ...rest,
    value: {
      ...value,
      url: `${tunnelUrl}${urlPath}`,
      api_token: apiToken,
    },
  }));
}

/** v2 API format for Bolna api_tools */
export interface BolnaToolsV2 {
  tools: Array<{
    name: string;
    description: string;
    pre_call_message: string;
    parameters: BolnaCustomFunction['parameters'];
  }>;
  tools_params: Record<string, {
    method: string;
    url: string;
    api_token: string;
    param: string; // stringified JSON
  }>;
}

/** Build custom function definitions in Bolna v2 format (tools + tools_params) */
export function getToolsV2WithUrl(tunnelUrl: string, token: string): BolnaToolsV2 {
  const apiToken = `Bearer ${token}`;

  const tools = TEMPLATES.map(({ name, description, pre_call_message, parameters }) => ({
    name,
    description,
    pre_call_message,
    parameters,
  }));

  const tools_params: BolnaToolsV2['tools_params'] = {};
  for (const t of TEMPLATES) {
    tools_params[t.name] = {
      method: t.value.method,
      url: `${tunnelUrl}${t.urlPath}`,
      api_token: apiToken,
      param: JSON.stringify(t.value.param),
    };
  }

  return { tools, tools_params };
}
