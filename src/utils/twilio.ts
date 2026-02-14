import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

interface Credentials {
  twilioSid: string;
  twilioToken: string;
  twilioFrom: string;
  myPhone: string;
}

export type TestErrorCode =
  | 'HOOK_NOT_FOUND'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'SCRIPT_ERROR'
  | 'UNKNOWN';

interface TestResult {
  success: boolean;
  error?: string;
  errorCode?: TestErrorCode;
}

const TIMEOUT_MS = 15000;

/**
 * Determines the error code based on the error type and message
 */
function getErrorCode(err: unknown): TestErrorCode {
  if (!(err instanceof Error)) {
    return 'UNKNOWN';
  }

  const message = err.message.toLowerCase();

  // Node.js child_process timeout (ETIMEDOUT or killed due to timeout)
  if (message.includes('etimedout') || message.includes('timedout') || message.includes('timed out')) {
    return 'TIMEOUT';
  }

  // Check for signal-based timeout (execSync kills with SIGTERM on timeout)
  if ('signal' in err && err.signal === 'SIGTERM') {
    return 'TIMEOUT';
  }

  // Network-related errors
  if (
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('network') ||
    message.includes('could not resolve')
  ) {
    return 'NETWORK_ERROR';
  }

  // Permission errors
  if (message.includes('eacces') || message.includes('permission denied')) {
    return 'PERMISSION_DENIED';
  }

  // Script execution errors (non-zero exit code)
  if (message.includes('exited with') || message.includes('exit code')) {
    return 'SCRIPT_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Returns a user-friendly error message based on the error code
 */
function getErrorMessage(errorCode: TestErrorCode, originalError?: string): string {
  switch (errorCode) {
    case 'HOOK_NOT_FOUND':
      return 'Hook script not found. Run "npx @hrushiborhade/pingme init" to set up.';
    case 'TIMEOUT':
      return `Request timed out after ${TIMEOUT_MS / 1000} seconds. Check your network connection or Twilio service status.`;
    case 'NETWORK_ERROR':
      return 'Network error. Check your internet connection and try again.';
    case 'PERMISSION_DENIED':
      return 'Permission denied. Check that the hook script is executable (chmod +x ~/.claude/hooks/pingme.sh).';
    case 'SCRIPT_ERROR':
      return 'Hook script failed. Check your Twilio credentials with "npx @hrushiborhade/pingme init".';
    case 'UNKNOWN':
    default:
      return originalError || 'An unexpected error occurred while sending SMS.';
  }
}

/**
 * Sends a test SMS using the installed hook script.
 * This validates that the Twilio credentials are working correctly.
 */
export async function sendTestSMS(credentials: Credentials): Promise<TestResult> {
  const hookPath = path.join(homedir(), '.claude', 'hooks', 'pingme.sh');

  // Pre-flight check: verify hook script exists
  if (!existsSync(hookPath)) {
    return {
      success: false,
      error: getErrorMessage('HOOK_NOT_FOUND'),
      errorCode: 'HOOK_NOT_FOUND',
    };
  }

  const execOptions: ExecSyncOptionsWithBufferEncoding = {
    timeout: TIMEOUT_MS,
    stdio: ['pipe', 'pipe', 'pipe'], // Capture stdout/stderr for better error diagnosis
    killSignal: 'SIGTERM',
  };

  try {
    execSync(
      `echo "pingme installed! Your Claude agent can now reach you." | "${hookPath}" test`,
      execOptions
    );
    return { success: true };
  } catch (err) {
    const errorCode = getErrorCode(err);
    const originalMessage = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      error: getErrorMessage(errorCode, originalMessage),
      errorCode,
    };
  }
}
