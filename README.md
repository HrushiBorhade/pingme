# pingme

> My Claude agent pings me when it's stuck. Now I doom scroll guilt-free. Yours is just... stuck.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

pingme hooks into Claude Code's lifecycle events and texts your phone when your agent actually needs you.

## The Problem

You're running multiple Claude Code instances across tmux panes. One stops because it needs permission or has a question. You think it's still working. Hours later, you find it blocked. Time wasted.

## The Solution

```bash
npx @hrushiborhade/pingme init
```

Now your Claude agent texts you when it needs you.

## What You Get

SMS notifications for **14 Claude Code hook events** — you choose which ones:

**Enabled by default:**
- ✅ **Task completed** — agent finished a task
- 🛑 **Agent stopped** — agent stopped running
- ❓ **Asking question** — agent is asking you a question
- 🔔 **Notification** — agent sent a notification
- 🔐 **Needs permission** — agent needs your permission to proceed

**Available (off by default):**
- ❌ Tool failed
- 🤖 Subagent finished
- 🔴 Session ended
- 🟢 Session started
- 🚀 Subagent started
- 💤 Teammate idle
- 📦 Pre-compact
- 📝 Prompt submitted (spammy)
- 🔧 Pre tool use (spammy)

Each message includes:
- **Project name** — which codebase needs you
- **tmux context** — which pane to jump to
- **Reason** — what the agent needs
- **Context** — extracted from JSON input (tool name, message, etc.) when `jq` is available

## Setup

### 1. Get Twilio Credentials (free trial works)

1. Sign up at [twilio.com/console](https://console.twilio.com)
2. Get your Account SID and Auth Token from the dashboard
3. Get a phone number (or use the trial number)

### 2. Install pingme

```bash
npx @hrushiborhade/pingme init
```

Follow the prompts — pick your Twilio creds, then choose which events should trigger an SMS. Done.

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

1. **Installation**: When you run `npx @hrushiborhade/pingme init`, pingme creates:
   - A bash script at `~/.claude/hooks/pingme.sh` that sends SMS via Twilio
   - Hook entries in `~/.claude/settings.json` for each selected event

2. **Hook Triggers**: Hooks are configured for your selected events. For example:
   - `TaskCompleted` — triggers when a task finishes
   - `PostToolUse` with `AskUserQuestion` matcher — triggers when Claude asks you a question
   - `Stop` — triggers when Claude stops execution
   - `PermissionRequest` — triggers when Claude needs permission
   - ...and any other events you enable

3. **Notification Flow**: When triggered, the hook script:
   - Detects your current project name from the working directory
   - Captures tmux session/window/pane info (if available)
   - Extracts context from JSON stdin using `jq` (with raw text fallback)
   - Sends an SMS via Twilio's API with context about what needs attention

4. **Reconfiguration**: Run `npx @hrushiborhade/pingme events` anytime to change which events trigger SMS — no need to re-enter Twilio credentials.

## Example SMS

```
✅ agentQ
📍 dev:2.1 (main)
💬 Task completed
```

## Security

- **Credentials are stored locally** in `~/.claude/hooks/pingme.sh`
- Credentials are never sent to any server except Twilio's API
- The hook script only runs when Claude Code triggers it
- Input is sanitized to prevent shell injection
- SMS requests are made over HTTPS

To update or remove credentials, run `npx @hrushiborhade/pingme init` again or `npx @hrushiborhade/pingme uninstall`.

## Troubleshooting

### SMS not sending

1. **Verify credentials**: Run `npx @hrushiborhade/pingme test` to send a test message
2. **Check Twilio balance**: Free trial includes $15 credit; ensure it's not exhausted
3. **Verify phone numbers**: Both numbers must include country code (e.g., `+1` for US)
4. **Trial account limitations**: Twilio trial accounts can only send to verified numbers

### Hook not triggering

1. **Restart Claude Code**: Hooks are loaded on startup
2. **Check settings.json**: Verify hooks are present in `~/.claude/settings.json`
3. **Check script permissions**: Run `chmod +x ~/.claude/hooks/pingme.sh`

### "curl not found" or no SMS sent

The hook script requires `curl`. Install it via your package manager:
- macOS: `brew install curl` (usually pre-installed)
- Ubuntu/Debian: `sudo apt install curl`

### Uninstalling

```bash
npx @hrushiborhade/pingme uninstall
```

This removes the hook script and cleans up all hook entries from `~/.claude/settings.json`.

## Requirements

- Node.js 18+
- Twilio account (free trial includes $15 credit)
- Claude Code CLI
- `curl` (pre-installed on most systems)
- `jq` (optional — enables richer context extraction from JSON input)

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run the build: `npm run build`
5. Test locally: `npm start init`
6. Commit your changes: `git commit -m 'Add my feature'`
7. Push to your fork: `git push origin feature/my-feature`
8. Open a Pull Request

### Development

```bash
git clone https://github.com/HrushiBorhade/pingme.git
cd pingme
npm install
npm run dev    # Watch mode for TypeScript
npm run build  # Build for production
npm test       # Run tests
```

### Ideas for Contribution

- Support for other notification providers (Slack, Discord, Pushover)
- Rate limiting to prevent SMS spam
- Quiet hours configuration
- Custom message templates

## License

MIT

---

Built for developers who run AI agents and want their life back.
