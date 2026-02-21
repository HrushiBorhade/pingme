# pingme-cli — Project Context

## Overview

**pingme** is a CLI tool that adds voice calling to Claude Code sessions using Bolna AI.
- **v1** (shipped): SMS notifications via Twilio when Claude Code stops/needs input
- **v2** (built 2026-02-20): Full bidirectional voice calling — phone rings, you talk through decisions, instructions route back to the right tmux session

**npm:** `@hrushiborhade/pingme`
**GitHub:** `github.com/HrushiBorhade/pingme`

---

## v2 Architecture

### Core Concept
Local Express daemon (port 7331) exposed via Cloudflare tunnel. Acts as the brain for all voice interactions.

### Data Flow
```
Claude Code hooks → daemon → decision engine → Bolna API → phone call
Phone voice → Bolna STT → Custom LLM (our bridge) → Anthropic Claude Sonnet → response
Voice agent → Custom Functions (get_sessions, route_instruction, trigger_action) → daemon → tmux send-keys
```

### Key Components

| Component | File(s) | Purpose |
|-----------|---------|---------|
| **Daemon Server** | `src/daemon/server.ts` | Express server, 9 routes, auth middleware |
| **Session Registry** | `src/daemon/session-registry.ts` | Tracks all Claude Code sessions via hook events |
| **Decision Engine** | `src/daemon/decision-engine.ts` | Event → action routing (call/batch/sms/ignore) |
| **Call Manager** | `src/daemon/call-manager.ts` | Batch timer, Bolna outbound call triggering |
| **Context Bridge** | `src/bridge/chat-completions.ts` | `/v1/chat/completions` — Anthropic→OpenAI format for Bolna Custom LLM |
| **Anthropic Adapter** | `src/bridge/anthropic-adapter.ts` | Message format conversion + SSE streaming |
| **Context Builder** | `src/daemon/context-builder.ts` | Dynamic system prompt with live session data |
| **Bolna Client** | `src/bolna/client.ts` | API client for outbound calls |
| **Custom Functions** | `src/bolna/custom-functions.ts` | 3 Bolna tool definitions (get_sessions, route_instruction, trigger_action) |
| **Hook Generator** | `src/hooks/generator.ts` | Bash hook script using jq for safe JSON |
| **Hook Installer** | `src/hooks/installer.ts` | Writes to `~/.claude/settings.json` |
| **Tunnel** | `src/daemon/tunnel.ts` | Cloudflare tunnel lifecycle |
| **Security** | `src/utils/security.ts` | Auth middleware, token verification, instruction blocklist |
| **Config** | `src/utils/config.ts` | YAML config at `~/.pingme/config.yaml` |
| **State** | `src/daemon/state.ts` | Atomic JSON persistence at `~/.pingme/state.json` |

### API Routes (server.ts)
- `POST /hooks/event` — hook script events (auth required)
- `GET /sessions` — list sessions (Bolna custom function)
- `POST /route` — send instruction to session (Bolna custom function)
- `POST /action` — approve/deny/cancel/status (Bolna custom function)
- `POST /webhooks/bolna` — call completion webhooks (execution_id validated)
- `GET /health` — minimal health check (no auth, no sensitive data)
- `GET /status` — detailed status for CLI (auth required)
- `POST /sessions/:pane/name` — rename a session (auth required)
- `POST /call` — trigger outbound call manually (auth required)

### CLI Commands
- `pingme start` — start daemon + tunnel
- `pingme stop` — stop daemon
- `pingme status` — show sessions and call state
- `pingme call` — trigger manual call
- `pingme name <pane> <name>` — rename a session
- `pingme logs [-f]` — tail daemon logs
- `pingme config` — show/edit config

### Security Model (hardened 2026-02-20)
- **No IP-based auth bypass** — all requests require Bearer token (cloudflared makes everything appear as localhost)
- **Hook scripts embed daemon token** in curl Authorization header
- **Webhook validation** — `/webhooks/bolna` validates execution_id matches active call
- **Instruction blocklist** — 30+ patterns for destructive commands (rm, sudo, git push -f, etc.)
- **tmux target validation** — regex check on pane/session identifiers
- **Constant-time token comparison** — fixed-length buffers, no length leak
- **Atomic state writes** — unique temp filenames per write
- **Queue depth limit** — max 200 queued instructions

### Bolna Integration
- **Custom LLM**: Our `/v1/chat/completions` endpoint acts as the voice agent's brain. Injects live session context into system prompt.
- **Custom Functions**: 3 tools Bolna calls back into our daemon during conversation (get_sessions, route_instruction, trigger_action)
- **Telephony**: Included in Bolna pricing (~$0.05/min)

### Tech Stack
- TypeScript, Express 5, Node 18+
- Anthropic Claude Sonnet (bridge LLM)
- Bolna AI (voice agent orchestration)
- Cloudflare Tunnel (free, no rate limits)
- Winston (logging), YAML (config)

---

## Build & Dev

```bash
npm run build      # TypeScript compile
npm test           # Vitest (42 tests)
npx tsc --noEmit   # Type check only
```

### Architecture Docs
- `ARCHITECTURE.md` — v2 voice calling architecture (comprehensive)
- `DEEP_DIVE.md` — v1 SMS-only architecture deep dive

---

## Bolna Founders Pitch

**Context**: Hrushi wants to share pingme with Bolna AI founders to get on their radar as a builder. They use Claude Code internally. Goal is to showcase builder mindset and get noticed — NOT to directly ask for a role.

**Draft DM/Email:**

> Hey [name], built something you might find fun — I made a CLI tool called **pingme** that uses Bolna to add voice control to Claude Code sessions.
>
> Basically: you're AFK, Claude stops and needs input → Bolna calls your phone → you talk through the decision → instruction routes back to the right tmux session. Multi-session aware, so you can manage multiple agents from one call.
>
> Since you guys use Claude Code too, figured you'd appreciate the use case. Here's a quick demo: [video link]
>
> Package is live on npm: `npx @hrushiborhade/pingme`
>
> Would love any feedback — especially on the Custom LLM + Custom Functions integration. If there's a better way to handle [X specific thing], I'm all ears.

**Strategy notes:**
- Lead with the build, not yourself
- "since you guys use Claude Code too" makes it personal
- Ask for feedback on a specific Bolna API friction point → turns demo into technical conversation
- npm link + video = zero friction to verify
- No "I'm looking for a role" — that conversation happens naturally after they reply

---

## Reminders for Claude
- v2 was built on 2026-02-20 using 4 parallel agents (daemon-builder, bridge-builder, infra-builder, cli-builder)
- Security audit done same day — 20 fixes across 12 files
- All 3 review agents (code-simplifier, code-reviewer, security-auditor) completed and findings addressed
- `last_event_time` is stored in **seconds** (Unix timestamp). Multiply by 1000 when comparing with `Date.now()`
- Bolna sends `queue_if_busy` as string, not boolean — normalized in server.ts
- Timestamp unit: hook events use seconds, JS uses milliseconds. Already handled.
