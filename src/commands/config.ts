import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig, configExists, getConfigPath } from '../utils/config.js';

export async function config(args: string[]) {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'get') {
    await showConfig(args.slice(1));
  } else if (subcommand === 'set') {
    await setConfig(args.slice(1));
  } else if (subcommand === 'path') {
    console.log(getConfigPath());
  } else {
    p.log.error(`Unknown subcommand: ${subcommand}`);
    p.log.info(`Usage:
  ${pc.cyan('pingme config')}              Show all config
  ${pc.cyan('pingme config get')}          Show all config
  ${pc.cyan('pingme config get <key>')}    Show a specific key
  ${pc.cyan('pingme config set <k> <v>')}  Set a config value
  ${pc.cyan('pingme config path')}         Show config file path`);
    process.exit(1);
  }
}

async function showConfig(args: string[]) {
  if (!configExists()) {
    p.log.warn('No config file found');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} to create one`);
    return;
  }

  const cfg = await loadConfig();
  const key = args[0];

  if (key) {
    const value = getNestedValue(cfg as unknown as Record<string, unknown>, key);
    if (value === undefined) {
      p.log.error(`Unknown config key: ${key}`);
      process.exit(1);
    }
    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  } else {
    // Show full config with sensitive values masked
    const masked = maskSensitive(JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>);
    console.log();
    printConfig(masked, '');
  }
}

async function setConfig(args: string[]) {
  const [key, ...valueParts] = args;
  const value = valueParts.join(' ');

  if (!key || !value) {
    p.log.error('Usage: pingme config set <key> <value>');
    p.log.info(pc.dim('Example: pingme config set daemon.port 8080'));
    process.exit(1);
  }

  if (!configExists()) {
    p.log.warn('No config file found');
    p.log.info(`Run ${pc.cyan('npx @hrushiborhade/pingme init')} to create one`);
    process.exit(1);
  }

  const cfg = await loadConfig();
  const parsed = parseValue(value);

  if (!setNestedValue(cfg as unknown as Record<string, unknown>, key, parsed)) {
    p.log.error(`Unknown config key: ${key}`);
    process.exit(1);
  }

  await saveConfig(cfg);
  p.log.success(`Set ${pc.cyan(key)} = ${pc.dim(String(parsed))}`);
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): boolean {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== 'object' || current[part] === null) {
      return false;
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  if (!(lastKey in current)) {
    return false;
  }

  current[lastKey] = value;
  return true;
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  return value;
}

function maskSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['api_key', 'token', 'daemon_token', 'twilio_sid', 'twilio_token'];

  for (const [key, val] of Object.entries(obj)) {
    if (sensitiveKeys.some(k => key.includes(k)) && typeof val === 'string' && val.length > 0) {
      obj[key] = val.substring(0, 4) + '****' + val.substring(val.length - 4);
    } else if (typeof val === 'object' && val !== null) {
      maskSensitive(val as Record<string, unknown>);
    }
  }

  return obj;
}

function printConfig(obj: Record<string, unknown>, indent: string): void {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      console.log(`${indent}${pc.cyan(key)}:`);
      printConfig(val as Record<string, unknown>, indent + '  ');
    } else {
      const display = val === '' ? pc.dim('(empty)') : pc.dim(String(val));
      console.log(`${indent}${key}: ${display}`);
    }
  }
}
