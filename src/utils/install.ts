import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';

interface Credentials {
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

const HOOK_SCRIPT = `#!/usr/bin/env bash

# ┌───────────────────────────────────────────────────────────────┐
# │  pingme - Get texted when your Claude agent is stuck          │
# │  https://github.com/HrushiBorhade/pingme-cli                  │
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

# Read context from stdin (limit to 280 chars for SMS)
CONTEXT=""
if [ ! -t 0 ]; then
    CONTEXT=\$(head -c 280 | tr -cd '[:print:][:space:]')  # Sanitize input
fi

# Message emoji/reason
case "\$EVENT" in
    question)   EMOJI="❓"; REASON="Asking question" ;;
    permission) EMOJI="🔐"; REASON="Needs permission" ;;
    limit)      EMOJI="⚠️"; REASON="Hit limit" ;;
    stopped)    EMOJI="🛑"; REASON="Agent stopped" ;;
    test)       EMOJI="🧪"; REASON="Test ping" ;;
    *)          EMOJI="🔔"; REASON="Needs attention" ;;
esac

# Build message
MESSAGE="\$EMOJI \$PROJECT"
[ -n "\$TMUX_INFO" ] && MESSAGE="\$MESSAGE
📍 \$TMUX_INFO"
MESSAGE="\$MESSAGE
💬 \$REASON"
[ -n "\$CONTEXT" ] && MESSAGE="\$MESSAGE

\$CONTEXT"

# Send SMS (background, detached so it survives script exit)
(
    curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/\$TWILIO_SID/Messages.json" \\
        --user "\$TWILIO_SID:\$TWILIO_TOKEN" \\
        --data-urlencode "From=\$TWILIO_FROM" \\
        --data-urlencode "To=\$MY_PHONE" \\
        --data-urlencode "Body=\$MESSAGE" \\
        --max-time 10 \\
        > /dev/null 2>&1
) &
disown 2>/dev/null || true

exit 0
`;

export async function installHook(credentials: Credentials): Promise<void> {
  const homeDir = homedir();
  const hooksDir = path.join(homeDir, '.claude', 'hooks');
  const hookPath = path.join(hooksDir, 'pingme.sh');
  const configPath = path.join(homeDir, '.claude', 'settings.json');

  // Create hooks directory
  await mkdir(hooksDir, { recursive: true });

  // Create hook script with escaped credentials (prevents shell injection)
  const script = HOOK_SCRIPT
    .replaceAll('{{TWILIO_SID}}', escapeForBash(credentials.twilioSid))
    .replaceAll('{{TWILIO_TOKEN}}', escapeForBash(credentials.twilioToken))
    .replaceAll('{{TWILIO_FROM}}', escapeForBash(credentials.twilioFrom))
    .replaceAll('{{MY_PHONE}}', escapeForBash(credentials.myPhone));

  await writeFile(hookPath, script, { mode: 0o755 });

  // Update Claude config
  let config: Record<string, unknown> = {};

  try {
    if (existsSync(configPath)) {
      const existing = await readFile(configPath, 'utf-8');
      config = JSON.parse(existing);
    }
  } catch {
    // Start fresh
  }

  // Initialize hooks with Claude Code 2.1+ format
  // Format: { matcher: "ToolName" (regex string), hooks: [{ type: "command", command: "..." }] }
  config.hooks = (config.hooks as Record<string, unknown[]>) || {};
  const hooks = config.hooks as Record<string, unknown[]>;
  hooks.PostToolUse = hooks.PostToolUse || [];
  hooks.Stop = hooks.Stop || [];

  // Type for hook format
  type HookEntry = {
    matcher?: string;
    hooks?: Array<{ type: string; command: string }>;
  };

  const postToolHooks = hooks.PostToolUse as HookEntry[];
  const stopHooks = hooks.Stop as HookEntry[];

  // Check if pingme hook already exists (check in hooks array)
  const hasPingmePostTool = postToolHooks.some((h) =>
    h.hooks?.some((hook) => hook.command?.includes('pingme.sh'))
  );

  const hasPingmeStop = stopHooks.some((h) =>
    h.hooks?.some((hook) => hook.command?.includes('pingme.sh'))
  );

  if (!hasPingmePostTool) {
    postToolHooks.push({
      matcher: 'AskUserQuestion',
      hooks: [{ type: 'command', command: '~/.claude/hooks/pingme.sh question' }],
    });
  }

  if (!hasPingmeStop) {
    stopHooks.push({
      hooks: [{ type: 'command', command: '~/.claude/hooks/pingme.sh stopped' }],
    });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2));
}
