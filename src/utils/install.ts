import { writeFile, readFile, mkdir, access, constants, stat, lstat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { ALL_EVENTS, getDefaultEvents, type HookEventDef } from './events.js';

export interface Credentials {
  twilioSid: string;
  twilioToken: string;
  twilioFrom: string;
  myPhone: string;
}

// Escape special characters for bash strings (prevents shell injection)
function escapeForBash(str: string): string {
  // Replace backslashes first, then other special chars
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/!/g, '\\!');
}

// Build the case statement entries from all events
function buildCaseEntries(): string {
  const entries = ALL_EVENTS.map(
    (e) => `    ${e.scriptArg}) EMOJI="${e.emoji}"; REASON="${e.label}" ;;`
  );
  entries.push(`    test)       EMOJI="🧪"; REASON="Test ping" ;;`);
  entries.push(`    *)          EMOJI="🔔"; REASON="Needs attention" ;;`);
  return entries.join('\n');
}

const HOOK_SCRIPT = `#!/usr/bin/env bash

# ┌───────────────────────────────────────────────────────────────┐
# │  pingme - Get texted when your Claude agent needs attention   │
# │  https://github.com/HrushiBorhade/pingme                     │
# └───────────────────────────────────────────────────────────────┘

# Config (do not edit manually - use 'npx pingme-cli init' to reconfigure)
TWILIO_SID="{{TWILIO_SID}}"
TWILIO_TOKEN="{{TWILIO_TOKEN}}"
TWILIO_FROM="{{TWILIO_FROM}}"
MY_PHONE="{{MY_PHONE}}"

# Check for curl
if ! command -v curl &> /dev/null; then
    exit 0  # Silently exit if curl not available
fi

# Context
EVENT="\${1:-unknown}"
PROJECT=\$(basename "\$PWD" | tr -cd '[:alnum:]._-')  # Sanitize project name

# tmux info (if available)
TMUX_INFO=""
if [ -n "\$TMUX" ]; then
    TMUX_INFO=\$(tmux display-message -p '#S:#I.#P (#W)' 2>/dev/null || echo "")
fi

# Read context from stdin
RAW_INPUT=""
if [ ! -t 0 ]; then
    RAW_INPUT=\$(cat)
fi

# Try to extract meaningful context from JSON input using jq
CONTEXT=""
if command -v jq &> /dev/null && [ -n "\$RAW_INPUT" ]; then
    # Try to extract tool_name, message, or other useful fields
    TOOL_NAME=\$(echo "\$RAW_INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
    MESSAGE=\$(echo "\$RAW_INPUT" | jq -r '.message // empty' 2>/dev/null)
    PROMPT=\$(echo "\$RAW_INPUT" | jq -r '.prompt // empty' 2>/dev/null)
    STOP_REASON=\$(echo "\$RAW_INPUT" | jq -r '.stop_reason // empty' 2>/dev/null)

    if [ -n "\$TOOL_NAME" ]; then
        CONTEXT="Tool: \$TOOL_NAME"
    fi
    if [ -n "\$MESSAGE" ]; then
        CONTEXT="\${CONTEXT:+\$CONTEXT\\n}\$MESSAGE"
    fi
    if [ -n "\$PROMPT" ]; then
        CONTEXT="\${CONTEXT:+\$CONTEXT\\n}\$PROMPT"
    fi
    if [ -n "\$STOP_REASON" ]; then
        CONTEXT="\${CONTEXT:+\$CONTEXT\\n}Reason: \$STOP_REASON"
    fi
fi

# Fallback: use raw input truncated to 280 chars
if [ -z "\$CONTEXT" ] && [ -n "\$RAW_INPUT" ]; then
    CONTEXT=\$(echo "\$RAW_INPUT" | head -c 280 | tr -cd '[:print:][:space:]')
fi

# Truncate context to 280 chars for SMS
CONTEXT=\$(echo "\$CONTEXT" | head -c 280)

# Message emoji/reason
case "\$EVENT" in
${buildCaseEntries()}
esac

# Build message
SMS="\$EMOJI \$PROJECT"
[ -n "\$TMUX_INFO" ] && SMS="\$SMS
📍 \$TMUX_INFO"
SMS="\$SMS
💬 \$REASON"
[ -n "\$CONTEXT" ] && SMS="\$SMS

\$CONTEXT"

# Send SMS (background, detached so it survives script exit)
(
    curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/\$TWILIO_SID/Messages.json" \\
        --user "\$TWILIO_SID:\$TWILIO_TOKEN" \\
        --data-urlencode "From=\$TWILIO_FROM" \\
        --data-urlencode "To=\$MY_PHONE" \\
        --data-urlencode "Body=\$SMS" \\
        --max-time 10 \\
        > /dev/null 2>&1
) &
disown 2>/dev/null || true

exit 0
`;

// Type for hook entries in settings.json
type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type: string; command: string; timeout?: number }>;
};

function getConfigPath(): string {
  return path.join(homedir(), '.claude', 'settings.json');
}

function getHookPath(): string {
  return path.join(homedir(), '.claude', 'hooks', 'pingme.sh');
}

async function readConfig(): Promise<Record<string, unknown>> {
  const configPath = getConfigPath();
  try {
    const existing = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(existing);

    // Validate structure
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[pingme] Settings file has invalid format - using defaults');
      return {};
    }

    return parsed;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      // File doesn't exist - this is expected on first install
      return {};
    }
    if (err instanceof SyntaxError) {
      console.error('[pingme] Settings file is corrupted (invalid JSON)');
      console.error(`[pingme] Backup found at ${configPath}.bak`);
      console.error('[pingme] Using default configuration');
    } else {
      console.warn(`[pingme] Failed to read settings: ${error.message}`);
    }
    return {};
  }
}

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  // Check write permission first
  try {
    await access(configDir, constants.W_OK);
  } catch {
    throw new Error(`Cannot write to ${configPath} - check permissions`);
  }

  await writeFile(configPath, JSON.stringify(config, null, 2));

  // Verify write succeeded
  const stats = await stat(configPath);
  if (stats.size === 0) {
    throw new Error('Config file is empty after write');
  }
}

/** Remove all existing pingme hook entries from settings.json */
function removePingmeHooks(config: Record<string, unknown>): void {
  if (!config.hooks || typeof config.hooks !== 'object') {
    return; // No hooks to remove
  }

  const hooks = config.hooks as Record<string, unknown>;

  for (const eventName of Object.keys(hooks)) {
    const eventHooks = hooks[eventName];

    // Validate structure before manipulating
    if (!Array.isArray(eventHooks)) {
      console.warn(`[pingme] Unexpected structure in hooks.${eventName} - skipping`);
      continue;
    }

    // Type guard
    const validHooks = eventHooks.filter((h): h is HookEntry => {
      return typeof h === 'object' && h !== null && 'hooks' in h;
    });

    hooks[eventName] = validHooks.filter(
      (h) => !h.hooks?.some((hook) => hook.command?.includes('pingme.sh'))
    );

    // Clean up empty arrays
    if ((hooks[eventName] as HookEntry[]).length === 0) {
      delete hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(hooks).length === 0) {
    delete config.hooks;
  }
}

/** Add hook entries for the given events */
function addPingmeHooks(config: Record<string, unknown>, enabledEvents: HookEventDef[]): void {
  config.hooks = (config.hooks as Record<string, unknown[]>) || {};
  const hooks = config.hooks as Record<string, HookEntry[]>;

  for (const evt of enabledEvents) {
    hooks[evt.event] = hooks[evt.event] || [];

    const entry: HookEntry = {
      hooks: [{ type: 'command', command: `~/.claude/hooks/pingme.sh ${evt.scriptArg}`, timeout: 10000 }],
    };
    if (evt.matcher) {
      entry.matcher = evt.matcher;
    }

    hooks[evt.event].push(entry);
  }
}

export async function installHook(
  credentials: Credentials,
  enabledEvents?: HookEventDef[]
): Promise<void> {
  const hooksDir = path.join(homedir(), '.claude', 'hooks');
  const hookPath = getHookPath();

  // Create hooks directory
  await mkdir(hooksDir, { recursive: true });

  // SECURITY: Verify it's not a symlink
  const stats = await lstat(hooksDir);
  if (stats.isSymbolicLink()) {
    throw new Error(
      'Security: ~/.claude/hooks is a symlink. Refusing to install. ' +
        'Remove the symlink and try again.'
    );
  }

  // Create hook script with escaped credentials (prevents shell injection)
  const script = HOOK_SCRIPT.replaceAll('{{TWILIO_SID}}', escapeForBash(credentials.twilioSid))
    .replaceAll('{{TWILIO_TOKEN}}', escapeForBash(credentials.twilioToken))
    .replaceAll('{{TWILIO_FROM}}', escapeForBash(credentials.twilioFrom))
    .replaceAll('{{MY_PHONE}}', escapeForBash(credentials.myPhone));

  await writeFile(hookPath, script, { mode: 0o700 });

  // Verify write succeeded
  const hookStats = await stat(hookPath);
  if (hookStats.size === 0) {
    throw new Error('Hook script is empty after write');
  }
  if ((hookStats.mode & 0o700) !== 0o700) {
    throw new Error('Hook script has incorrect permissions');
  }

  // Update Claude settings.json
  const events = enabledEvents || getDefaultEvents();
  const config = await readConfig();

  // Remove old pingme hooks, then add new ones
  removePingmeHooks(config);
  addPingmeHooks(config, events);

  await writeConfig(config);
}

/** Update which events are enabled in settings.json without rewriting the script */
export async function updateEvents(enabledEvents: HookEventDef[]): Promise<void> {
  const config = await readConfig();
  removePingmeHooks(config);
  addPingmeHooks(config, enabledEvents);
  await writeConfig(config);
}

/** Read currently enabled events from settings.json */
export function getEnabledEvents(config: Record<string, unknown>): HookEventDef[] {
  const hooks = config.hooks as Record<string, HookEntry[]> | undefined;
  if (!hooks) return [];

  const enabled: HookEventDef[] = [];

  for (const evt of ALL_EVENTS) {
    const eventHooks = hooks[evt.event];
    if (!Array.isArray(eventHooks)) continue;

    const hasPingme = eventHooks.some((h) =>
      h.hooks?.some((hook) => hook.command?.includes('pingme.sh'))
    );
    if (hasPingme) {
      enabled.push(evt);
    }
  }

  return enabled;
}

/** Remove all pingme entries from settings.json (for uninstall) */
export async function cleanSettingsJson(): Promise<void> {
  const config = await readConfig();
  removePingmeHooks(config);
  await writeConfig(config);
}

// Re-export for backward compatibility
export { escapeForBash as _escapeForBash };
