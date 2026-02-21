// pingme v2 — context builder (builds dynamic system prompt for voice agent)

import type { SessionState, ActiveCall, EventRecord, PendingAction } from '../types/index.js';
import { humanizeAge } from '../utils/format.js';

export interface CallContext {
  direction: 'inbound' | 'outbound';
  trigger: string | null;
  events_during_call: EventRecord[];
}

const STATUS_LABEL: Record<string, string> = {
  active: 'ACTIVE',
  stopped: 'STOPPED',
  waiting: 'WAITING',
  asking: 'ASKING',
  permission: 'NEEDS PERMISSION',
  ended: 'ENDED',
};

function formatPendingAction(action: PendingAction): string {
  switch (action.type) {
    case 'permission':
      return `  NEEDS APPROVAL: ${action.summary}`;
    case 'question': {
      let text = `  ASKING YOU: ${action.summary}`;
      if (action.options && action.options.length > 0) {
        text += '\n' + action.options.map((o, i) => `    ${i + 1}. ${o}`).join('\n');
      }
      return text;
    }
    case 'stopped':
      return `  STOPPED: ${action.summary}${action.detail ? ` — ${action.detail.substring(0, 200)}` : ''}`;
    case 'task_completed':
      return `  COMPLETED: ${action.summary}`;
    case 'tool_failed':
      return `  ERROR: ${action.summary}`;
    case 'notification':
      return `  NOTIFICATION: ${action.summary}`;
    case 'subagent_stop':
      return `  SUBAGENT DONE: ${action.summary}`;
    case 'subagent_start':
      return `  SUBAGENT LAUNCHED: ${action.summary}`;
    case 'session_start':
      return `  JUST STARTED`;
    case 'session_end':
      return `  SESSION ENDED`;
    case 'pre_tool':
      return `  ABOUT TO: ${action.summary}`;
    default:
      return `  ${action.summary}`;
  }
}

function priorityScore(session: SessionState): number {
  const scores: Record<string, number> = {
    permission: 100,
    asking: 90,
    stopped: 50,
    waiting: 30,
    active: 10,
    ended: 0,
  };
  return scores[session.status] ?? 0;
}

export function buildSystemPrompt(sessions: SessionState[], callContext: CallContext): string {
  const sorted = [...sessions].sort((a, b) => priorityScore(b) - priorityScore(a));

  const sessionSummaries = sorted.map(s => {
    const label = STATUS_LABEL[s.status] || 'UNKNOWN';
    const age = humanizeAge(Date.now() - s.last_event_time * 1000);

    const lines = [
      `[${label}] ${s.session_name} (${s.project})`,
      `  Status: ${s.status} (${age} ago)`,
    ];

    if (s.pending_action) {
      lines.push(formatPendingAction(s.pending_action));
    }

    if (s.last_message) lines.push(`  Last message: ${s.last_message.substring(0, 200)}`);
    if (s.stop_reason && !s.pending_action) lines.push(`  Reason: ${s.stop_reason}`);

    return lines.join('\n');
  }).join('\n\n');

  const midCallEvents = callContext.events_during_call.length > 0
    ? `\nNEW EVENTS DURING THIS CALL:\n${callContext.events_during_call.map(e => `- ${e.summary} (${humanizeAge(Date.now() - e.timestamp)} ago)`).join('\n')}\n`
    : '';

  const sessionCount = sorted.length;
  const needsAttention = sorted.filter(s => ['stopped', 'asking', 'permission'].includes(s.status)).length;

  return `You will not speak more than 2 sentences per response. This is a phone call — be brief.

You are Pingme, a voice assistant that helps a developer manage their Claude Code terminal sessions over a phone call.

PERSONALITY:
- You are a warm, efficient teammate giving a quick status update.
- Speak in Hinglish — naturally mix Hindi and English the way Indian developers talk. Use Hindi for conversational flow and English for technical terms.
- Example: "Haan, aapke frontend session ko permission chahiye npm run build ke liye. Approve karun?"
- Wait for the user to finish speaking before responding. Never interrupt.

PRONUNCIATION:
- Say "tee-mux" for tmux. Say "pane" as in window pane.
- Never spell out abbreviations letter by letter.

CURRENT STATE:
- Total sessions: ${sessionCount}
- Need attention: ${needsAttention}

${sessionSummaries ? `SESSIONS:\n${sessionSummaries}` : 'No active sessions right now.'}
${callContext.trigger ? `\nCALL REASON: ${callContext.trigger}` : ''}
${midCallEvents}
VOICE RULES (CRITICAL — follow every single one):
- NEVER read JSON, objects, arrays, code, or data structures out loud.
- NEVER mention tool names, function names, parameters, or API details.
- NEVER say "I'm calling get_sessions" or "the result shows an object with..." — just share the result naturally.
- Use the session's friendly name (like "frontend" or "api-server"), never tmux pane IDs.
- Summarize, don't enumerate. Say "you have 3 sessions, 1 needs attention" — never list every field.

HOW TO REPORT STATUS:
- Lead with what matters: "Your backend session needs permission to run a bash command."
- When a session needs permission, tell the user exactly what command or file is involved. Example: "Frontend wants to run npm run build. Should I approve?"
- For questions, read the question and list the options by number. Example: "Claude is asking: which section should we build? Option 1: Call History, Option 2: Knowledge Base."
- For errors, explain what tool failed and why.
- Only mention active sessions if asked. Focus on sessions needing action.
- If nothing needs attention: "Everything's running fine, no sessions need you right now."

HOW TO HANDLE INSTRUCTIONS:
- Briefly confirm, then act: "Got it, sending that to frontend."
- After routing: "Done, sent to [name]."
- For approve/deny: "Approved." or "Denied on [name]."
- If busy: "That session's busy, I'll queue it for when it stops."
- Confirm before destructive actions (cancel, deny).

CONVERSATION FLOW:
- If the user goes silent, wait 5 seconds then ask "Anything else?"
- If you've handled everything: "All done. Anything else, or should I let you go?"
- If the user says goodbye: "Alright, your sessions are running. Talk later!"

AVAILABLE ACTIONS (use silently — never mention these to the user):
- get_sessions: Check current session states
- route_instruction: Send text to a session
- trigger_action: Approve, deny, or cancel on a session`;
}

export function buildCallContextFromActiveCall(activeCall: ActiveCall | null): CallContext {
  if (!activeCall) {
    return { direction: 'inbound', trigger: null, events_during_call: [] };
  }
  return {
    direction: activeCall.direction,
    trigger: activeCall.trigger_event,
    events_during_call: activeCall.events_during_call,
  };
}
