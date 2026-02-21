// pingme v2 — hook script generator (bash script that POSTs to local daemon)

/**
 * Generate the v2 hook bash script.
 * This script runs on every Claude Code hook event and POSTs JSON to the daemon.
 * Uses jq for safe JSON construction. Falls back to SMS if daemon is unreachable.
 */
export function generateHookScript(daemonPort: number, daemonToken: string): string {
  return `#!/usr/bin/env bash

# ┌───────────────────────────────────────────────────────────────┐
# │  pingme v2 — hook script                                      │
# │  POSTs Claude Code events to the local daemon                 │
# │  Falls back to SMS if daemon is unreachable                   │
# │  https://github.com/HrushiBorhade/pingme                     │
# └───────────────────────────────────────────────────────────────┘

DAEMON_URL="http://localhost:${daemonPort}"
DAEMON_TOKEN="${daemonToken}"
EVENT="\${1:-unknown}"
PROJECT=\$(basename "\$PWD" | tr -cd '[:alnum:]._-')
DIRECTORY="\$PWD"

# tmux context (if running inside tmux)
TMUX_SESSION=""
TMUX_PANE=""
if [ -n "\$TMUX" ]; then
    TMUX_SESSION=\$(tmux display-message -p '#S' 2>/dev/null || echo "")
    TMUX_PANE=\$(tmux display-message -p '#S:#I.#P' 2>/dev/null || echo "")
fi

# Read stdin (Claude Code hook JSON payload)
RAW_INPUT=""
if [ ! -t 0 ]; then
    RAW_INPUT=\$(cat)
fi

TIMESTAMP=\$(date +%s)

# Build JSON payload safely using jq
if command -v jq >/dev/null 2>&1; then
    PAYLOAD=\$(jq -n \\
        --arg event "\$EVENT" \\
        --arg project "\$PROJECT" \\
        --arg directory "\$DIRECTORY" \\
        --arg tmux_session "\$TMUX_SESSION" \\
        --arg tmux_pane "\$TMUX_PANE" \\
        --argjson timestamp "\$TIMESTAMP" \\
        --argjson payload "\$( [ -n "\$RAW_INPUT" ] && echo "\$RAW_INPUT" || echo "null" )" \\
        '{event: $event, project: $project, directory: $directory, tmux_session: $tmux_session, tmux_pane: $tmux_pane, timestamp: $timestamp, payload: $payload}')
else
    # Fallback: use python for safe JSON if jq not available
    PAYLOAD=\$(python3 -c "
import json, sys, os
payload_raw = sys.argv[7] if sys.argv[7] != '' else None
try:
    payload = json.loads(payload_raw) if payload_raw else None
except (json.JSONDecodeError, TypeError):
    payload = None
print(json.dumps({
    'event': sys.argv[1],
    'project': sys.argv[2],
    'directory': sys.argv[3],
    'tmux_session': sys.argv[4],
    'tmux_pane': sys.argv[5],
    'timestamp': int(sys.argv[6]),
    'payload': payload
}))
" "\$EVENT" "\$PROJECT" "\$DIRECTORY" "\$TMUX_SESSION" "\$TMUX_PANE" "\$TIMESTAMP" "\$RAW_INPUT" 2>/dev/null)

    # If python also fails, skip this event
    if [ -z "\$PAYLOAD" ]; then
        exit 0
    fi
fi

# POST to daemon (fire-and-forget, background)
# Capture HTTP status code to detect daemon failure
(
    RESPONSE=\$(curl -s -o /dev/null -w "%{http_code}" \\
        -X POST "\$DAEMON_URL/hooks/event" \\
        -H "Content-Type: application/json" \\
        -H "Authorization: Bearer \$DAEMON_TOKEN" \\
        --data "\$PAYLOAD" \\
        --max-time 5 2>/dev/null)

    if [ "\$RESPONSE" != "200" ]; then
        # Daemon is down — fall back to SMS if configured
        if [ -f ~/.pingme/sms-fallback.sh ]; then
            ~/.pingme/sms-fallback.sh "\$EVENT" "\$PROJECT"
        fi
    fi
) &
disown 2>/dev/null || true

exit 0
`;
}
