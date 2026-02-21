// pingme v2 — config management (YAML + env vars)

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import crypto from 'crypto';
import type { PingmeConfig } from '../types/index.js';

const PINGME_DIR = path.join(homedir(), '.pingme');
const CONFIG_PATH = path.join(PINGME_DIR, 'config.yaml');

export function getConfigDir(): string {
  return PINGME_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getDefaultConfig(): PingmeConfig {
  return {
    mode: 'voice',
    phone: '',
    bolna: {
      api_key: '',
      agent_id: '',
      inbound_number: '',
    },
    bridge: {
      provider: 'anthropic',
      api_key: '',
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
    },
    tunnel: {
      type: 'cloudflared',
    },
    daemon: {
      port: 7331,
      log_level: 'info',
      state_file: path.join(PINGME_DIR, 'state.json'),
      log_file: path.join(PINGME_DIR, 'daemon.log'),
    },
    daemon_token: crypto.randomBytes(32).toString('hex'),
    policy: {
      cooldown_seconds: 60,
      batch_window_seconds: 10,
      max_call_duration: 600,
      call_on: {
        task_completed: true,
        stopped: true,
        question: true,
        permission: true,
        error: false,
      },
      quiet_hours: {
        enabled: true,
        start: '23:00',
        end: '07:00',
        mode: 'sms',
      },
    },
    sms: {
      enabled: false,
      provider: 'twilio',
      twilio_sid: '',
      twilio_token: '',
      twilio_from: '',
    },
    sessions: {
      auto_name: true,
      cleanup_after_minutes: 30,
    },
  };
}

/** Apply environment variable overrides */
function applyEnvOverrides(config: PingmeConfig): PingmeConfig {
  const env = process.env;

  if (env.PINGME_MODE) config.mode = env.PINGME_MODE as 'voice' | 'sms';
  if (env.PINGME_PHONE) config.phone = env.PINGME_PHONE;
  if (env.PINGME_BOLNA_API_KEY) config.bolna.api_key = env.PINGME_BOLNA_API_KEY;
  if (env.PINGME_BOLNA_AGENT_ID) config.bolna.agent_id = env.PINGME_BOLNA_AGENT_ID;
  if (env.PINGME_BRIDGE_API_KEY) config.bridge.api_key = env.PINGME_BRIDGE_API_KEY;
  if (env.PINGME_BRIDGE_MODEL) config.bridge.model = env.PINGME_BRIDGE_MODEL;
  if (env.PINGME_DAEMON_PORT) config.daemon.port = parseInt(env.PINGME_DAEMON_PORT, 10);
  if (env.PINGME_DAEMON_TOKEN) config.daemon_token = env.PINGME_DAEMON_TOKEN;

  return config;
}

export async function loadConfig(): Promise<PingmeConfig> {
  let config = getDefaultConfig();

  if (existsSync(CONFIG_PATH)) {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = parseYaml(raw) as Partial<PingmeConfig>;
    config = { ...config, ...parsed };

    // Deep merge nested objects
    if (parsed.bolna) config.bolna = { ...config.bolna, ...parsed.bolna };
    if (parsed.bridge) config.bridge = { ...config.bridge, ...parsed.bridge };
    if (parsed.tunnel) config.tunnel = { ...config.tunnel, ...parsed.tunnel };
    if (parsed.daemon) config.daemon = { ...config.daemon, ...parsed.daemon };
    if (parsed.policy) {
      config.policy = { ...config.policy, ...parsed.policy };
      if (parsed.policy.call_on) config.policy.call_on = { ...config.policy.call_on, ...parsed.policy.call_on };
      if (parsed.policy.quiet_hours) config.policy.quiet_hours = { ...config.policy.quiet_hours, ...parsed.policy.quiet_hours };
    }
    if (parsed.sms) config.sms = { ...config.sms, ...parsed.sms };
    if (parsed.sessions) config.sessions = { ...config.sessions, ...parsed.sessions };
  }

  return applyEnvOverrides(config);
}

export async function saveConfig(config: PingmeConfig): Promise<void> {
  await mkdir(PINGME_DIR, { recursive: true });

  const yamlStr = stringifyYaml(config, { lineWidth: 120 });
  await writeFile(CONFIG_PATH, yamlStr, { mode: 0o600 });
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}
