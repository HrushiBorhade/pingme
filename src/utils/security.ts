// pingme v2 — security utilities

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/** Generate a cryptographically secure 32-byte hex token */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Fixed-length constant-time token comparison to prevent timing attacks */
export function verifyToken(received: string, expected: string): boolean {
  // Use fixed-size buffers to avoid leaking token length via early exit
  const FIXED_LEN = 64;
  const expectedBuf = Buffer.alloc(FIXED_LEN);
  const receivedBuf = Buffer.alloc(FIXED_LEN);
  Buffer.from(expected).copy(expectedBuf);
  Buffer.from(received).copy(receivedBuf);

  const match = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  return match && received.length === expected.length;
}

/**
 * Express middleware: require Bearer token for ALL requests.
 * No IP-based bypass — cloudflared makes all requests appear as localhost.
 */
export function createAuthMiddleware(daemonToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice(7);
    if (!verifyToken(token, daemonToken)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}

/** Patterns that should never be sent to tmux sessions */
const BLOCKED_PATTERNS = [
  // rm variants
  /rm\s+-rf/i,
  /rm\s+.*-r.*-f/i,
  /rm\s+.*-f.*-r/i,
  /rm\s+-r\s+\//i,
  /rm\s+--recursive/i,
  // privilege escalation
  /sudo\s+/i,
  /su\s+-c/i,
  /doas\s+/i,
  /pkexec\s+/i,
  // git destructive
  /git\s+push\s+.*--force/i,
  /git\s+push\s+.*-f\b/i,
  // database destructive
  /drop\s+table/i,
  /drop\s+database/i,
  /DELETE\s+FROM\s+/i,
  /TRUNCATE\s+/i,
  // disk destructive
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\//i,
  /chmod\s+777/i,
  // remote code execution
  /curl\s+.*\|\s*(bash|sh|zsh)/i,
  /wget\s+.*\|\s*(bash|sh|zsh)/i,
  /curl\s+.*\|\s*python/i,
  /wget\s+.*\|\s*python/i,
  // scripting execution
  /python[23]?\s+-c\s+/i,
  /perl\s+-e\s+/i,
  /ruby\s+-e\s+/i,
  // system destructive
  /shutdown\s+/i,
  /reboot\b/i,
  /kill\s+-9\s+/i,
  /killall\s+/i,
  // reverse shells / netcat
  /\bnc\s+.*-e/i,
  /\bncat\s+.*-e/i,
];

/** Check if an instruction is safe to send to a tmux session */
export function isInstructionSafe(instruction: string): boolean {
  return !BLOCKED_PATTERNS.some(p => p.test(instruction));
}

/** Validate tmux pane/session format */
export function isValidTmuxTarget(target: string): boolean {
  return /^[\w:.%-]+$/.test(target);
}
