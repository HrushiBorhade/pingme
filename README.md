# pingme

pingme hooks into Claude Code's lifecycle events and texts your phone when your agent actually needs you.

[![npm version](https://img.shields.io/npm/v/@hrushiborhade/pingme)](https://www.npmjs.com/package/@hrushiborhade/pingme)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## The Problem

You're running multiple Claude Code instances across tmux panes. One stops because it needs permission or has a question. You think it's still working. Hours later, you find it blocked. Time wasted.

## Quick Start

```bash
npx @hrushiborhade/pingme init
```

Follow the prompts — enter your Twilio credentials, choose which events should trigger an SMS, and you're done.

## Supported Events

SMS notifications for **14 Claude Code hook events** — you choose which ones:

**Enabled by default:**
| Event | Description |
|-------|-------------|
| ✅ Task completed | Agent finished a task |
| 🛑 Agent stopped | Agent stopped running |
| ❓ Asking question | Agent is asking you a question |
| 🔔 Notification | Agent sent a notification |
| 🔐 Needs permission | Agent needs your permission to proceed |

**Available (off by default):**
| Event | Description |
|-------|-------------|
| ❌ Tool failed | A tool call failed |
| 🤖 Subagent finished | A subagent finished running |
| 🔴 Session ended | Claude Code session ended |
| 🟢 Session started | Claude Code session started |
| 🚀 Subagent started | A subagent started running |
| 💤 Teammate idle | A teammate agent is idle |
| 📦 Pre-compact | Context is about to be compacted |
| 📝 Prompt submitted | User submitted a prompt (spammy) |
| 🔧 Pre tool use | About to use a tool (spammy) |

Each SMS includes:
- **Project name** — which codebase needs you
- **tmux context** — which pane to jump to (if applicable)
- **Reason** — what the agent needs
- **Context** — extracted from JSON input via `jq` (with raw text fallback)

## Commands

```bash
npx @hrushiborhade/pingme init       # Setup pingme
npx @hrushiborhade/pingme events     # Change which events trigger SMS
npx @hrushiborhade/pingme test       # Send a test SMS
npx @hrushiborhade/pingme uninstall  # Remove pingme (hook + settings)
npx @hrushiborhade/pingme --version  # Show version
npx @hrushiborhade/pingme --help     # Show help
```

## How It Works

pingme uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks) to detect when the agent needs your attention.

1. **Installation** — `npx @hrushiborhade/pingme init` creates:
   - A bash script at `~/.claude/hooks/pingme.sh` that sends SMS via Twilio
   - Hook entries in `~/.claude/settings.json` for each selected event

2. **Hook Triggers** — Hooks are registered for your selected events:
   - `TaskCompleted` — when a task finishes
   - `PostToolUse` (matcher: `AskUserQuestion`) — when Claude asks a question
   - `Stop` — when Claude stops execution
   - `PermissionRequest` — when Claude needs permission
   - ...and any other events you enable

3. **Notification Flow** — When triggered, the hook script:
   - Detects your current project name from the working directory
   - Captures tmux session/window/pane info (if available)
   - Extracts context from JSON stdin using `jq` (with raw text fallback)
   - Sends an SMS via Twilio's API

4. **Reconfiguration** — Run `npx @hrushiborhade/pingme events` anytime to change which events trigger SMS without re-entering Twilio credentials.

## Example SMS

```
✅ agentQ
📍 dev:2.1 (main)
💬 Task completed
```

## Setup

### Prerequisites

- Node.js 18+
- [Twilio account](https://console.twilio.com) (free trial includes $15 credit)
- Claude Code CLI
- `curl` (pre-installed on most systems)
- `jq` (optional — enables richer context extraction from JSON input)

### Twilio Configuration

1. Sign up at [twilio.com/console](https://console.twilio.com)
2. Get your Account SID and Auth Token from the dashboard
3. Get a phone number (or use the trial number)
4. Run `npx @hrushiborhade/pingme init` and follow the prompts

## Security

- Credentials are stored locally in `~/.claude/hooks/pingme.sh`
- Credentials are never sent to any server except Twilio's API
- The hook script only runs when Claude Code triggers it
- Input is sanitized to prevent shell injection
- SMS requests are made over HTTPS

## Troubleshooting

### SMS not sending

1. Run `npx @hrushiborhade/pingme test` to verify credentials
2. Check your Twilio balance (free trial includes $15 credit)
3. Verify both phone numbers include country code (e.g., `+1` for US)
4. Twilio trial accounts can only send to verified numbers

### Hook not triggering

1. Restart Claude Code — hooks are loaded on startup
2. Verify hooks are present in `~/.claude/settings.json`
3. Check script permissions: `chmod +x ~/.claude/hooks/pingme.sh`

### curl not found

Install via your package manager:
- macOS: `brew install curl` (usually pre-installed)
- Ubuntu/Debian: `sudo apt install curl`

## Contributing

Contributions are welcome.

```bash
git clone https://github.com/HrushiBorhade/pingme.git
cd pingme
npm install
npm run dev    # Watch mode
npm run build  # Build for production
npm test       # Run tests
```

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and run `npm run build && npm test`
4. Open a Pull Request

### Ideas for Contribution

- Support for other notification providers (Slack, Discord, Pushover)
- Rate limiting to prevent SMS spam
- Quiet hours configuration
- Custom message templates

## License

[MIT](LICENSE)
