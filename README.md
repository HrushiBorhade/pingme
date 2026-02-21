# pingme

Voice calling for Claude Code — phone rings when agents need you, talk through decisions, instructions route back to the right tmux session.

[![npm version](https://img.shields.io/npm/v/@hrushiborhade/pingme)](https://www.npmjs.com/package/@hrushiborhade/pingme)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## The Problem

You're running multiple Claude Code instances across tmux panes. One stops because it needs permission or has a question. You think it's still working. Hours later, you find it blocked. Time wasted.

## The Solution

**pingme calls your phone.** Not a text — an actual phone call. A voice agent tells you exactly what's happening: "Your frontend session wants to run `npm run build`. Should I approve?" You say yes, it routes back. All from your phone.

## Quick Start

```bash
npx @hrushiborhade/pingme init    # Setup (Bolna API key, phone number)
npx @hrushiborhade/pingme start   # Start daemon + tunnel
```

That's it. When Claude Code needs you, your phone rings.

## How It Works

```
Claude Code hooks → daemon (port 7331) → decision engine → Bolna API → phone call
Your voice → Bolna STT → Custom LLM (our bridge) → Claude Sonnet → response
Voice agent → Custom Functions → daemon → tmux send-keys → back to Claude Code
```

1. **Hooks** capture Claude Code lifecycle events (permission requests, questions, stops)
2. **Decision engine** evaluates: is the session genuinely blocked? Only calls for permission/question events — normal stops are silent
3. **Bolna AI** places the call with a voice agent that has live session context
4. **Custom LLM bridge** injects real-time session data into every voice response
5. **Custom Functions** let the voice agent check sessions, route instructions, and approve/deny — all through your daemon

## What the Voice Agent Knows

The agent doesn't just say "your session stopped." It extracts the full context:

| Event | What the agent says |
|-------|-------------------|
| Bash permission | "Frontend wants to run `npm run build`. Approve karun?" |
| File write | "Backend wants to create `/src/utils/auth.ts`. Should I approve?" |
| Question with options | "Claude is asking: which section should we build? Option 1: Call History, Option 2: Knowledge Base" |
| Unexpected stop | "Your API session stopped unexpectedly" |

Normal `end_turn` stops? Ignored. No annoying calls when Claude finishes its job.

## Commands

```bash
pingme start            # Start daemon + Cloudflare tunnel
pingme stop             # Stop daemon
pingme status           # Show sessions, call state, uptime
pingme call             # Trigger manual outbound call
pingme name <pane> <n>  # Rename a session for voice-friendly IDs
pingme logs [-f]        # Tail daemon logs
pingme config           # Show/edit YAML configuration
pingme init             # First-time setup
```

## Architecture

| Component | Purpose |
|-----------|---------|
| **Daemon Server** | Express on port 7331, 9 routes, auth middleware |
| **Session Registry** | Tracks all Claude Code sessions with rich pending action context |
| **Decision Engine** | Event → action routing (call/batch/sms/ignore) |
| **Call Manager** | Batch timer, Bolna outbound call triggering |
| **Context Bridge** | `/v1/chat/completions` — Anthropic → OpenAI format for Bolna Custom LLM |
| **Custom Functions** | 3 Bolna tools: `get_sessions`, `route_instruction`, `trigger_action` |
| **Hook System** | Bash scripts using `jq` for safe JSON, installed in `~/.claude/settings.json` |
| **Cloudflare Tunnel** | Free, no rate limits, exposes daemon to Bolna |

## Configuration

Config lives at `~/.pingme/config.yaml`:

```yaml
mode: voice
phone: "+91XXXXXXXXXX"
bolna:
  api_key: bn-xxxxx
  agent_id: xxxxx
bridge:
  provider: anthropic
  model: claude-haiku-4-5-20251001
  max_tokens: 150
policy:
  cooldown_seconds: 60
  batch_window_seconds: 10
  call_on:
    permission: true    # Session blocked — needs approval
    question: true      # Session blocked — needs answer
    stopped: false      # Normal stops are silent
    task_completed: false
  quiet_hours:
    enabled: true
    start: "23:00"
    end: "07:00"
    mode: sms
```

## Voice & Language

pingme speaks **Hinglish** by default — natural Hindi-English mix, the way Indian developers talk.

- **STT**: Deepgram `nova-3` with `language: "multi"` for Hindi-English code-switching
- **TTS**: ElevenLabs `eleven_turbo_v2_5` with Daksh (conversational Hindi male voice)
- **LLM**: Your configured bridge model with Hinglish system prompt

Keyword boosting for developer terms: tmux, Claude, pane, session, approve, deny, haan, nahi.

## Security

- **Bearer token auth** on all sensitive routes (constant-time comparison)
- **Instruction blocklist**: 30+ destructive patterns (`rm -rf`, `sudo`, `git push -f`, etc.)
- **Webhook validation**: execution ID matching with age-check fallback
- **tmux target validation**: regex check on all pane/session identifiers
- **Atomic state writes**: unique temp filenames per write, no partial reads
- **Queue depth limit**: max 200 queued instructions
- **No IP-based auth bypass**: cloudflared makes everything localhost, so all routes require Bearer token

## Supported Hook Events

**Call-triggering (enabled by default):**
| Event | Description |
|-------|-------------|
| Permission request | Agent needs your permission to proceed |
| Question (PreToolUse) | Agent is about to ask you a question |

**Silent by default (configurable):**
| Event | Description |
|-------|-------------|
| Task completed | Agent finished a task |
| Agent stopped | Agent stopped running |
| Tool failed | A tool call failed |
| Notification | Agent sent a notification |
| Subagent start/stop | Subagent lifecycle |
| Session start/end | Session lifecycle |

## Prerequisites

- Node.js 18+
- [Bolna AI account](https://bolna.ai) with API key and agent ID
- [Anthropic API key](https://console.anthropic.com) for the bridge LLM
- Claude Code CLI
- `jq` (for hook script JSON construction)
- `tmux` (for multi-session management)

## Development

```bash
git clone https://github.com/HrushiBorhade/pingme.git
cd pingme
npm install
npm run build      # TypeScript compile
npm test           # Vitest (42 tests)
npx tsc --noEmit   # Type check only
```

## Tech Stack

TypeScript, Express 5, Node 18+, Anthropic Claude Sonnet, Bolna AI, Cloudflare Tunnel, Winston, YAML config.

## License

[MIT](LICENSE)
