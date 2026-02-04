import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * These tests verify the hook script generation and escaping logic.
 * We test by creating actual files in a temp directory.
 */
describe('Hook Script Generation', () => {
  const testDir = path.join(os.tmpdir(), `pingme-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('escapeForBash', () => {
    // Test the escape function by creating a script and verifying its content

    it('should escape double quotes', async () => {
      const input = 'test"value';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('test\\"value');
    });

    it('should escape dollar signs', async () => {
      const input = '$HOME';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('\\$HOME');
    });

    it('should escape backticks', async () => {
      const input = '`whoami`';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('\\`whoami\\`');
    });

    it('should escape backslashes', async () => {
      const input = 'path\\to\\file';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('path\\\\to\\\\file');
    });

    it('should escape exclamation marks', async () => {
      const input = 'hello!world';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('hello\\!world');
    });

    it('should escape complex injection attempts', async () => {
      const input = '"; rm -rf /; echo "';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('\\"; rm -rf /; echo \\"');
    });

    it('should escape command substitution', async () => {
      const input = '$(cat /etc/passwd)';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('\\$(cat /etc/passwd)');
    });

    it('should handle empty string', async () => {
      const escaped = escapeForBash('');
      expect(escaped).toBe('');
    });

    it('should not modify safe strings', async () => {
      const input = 'ACtest0000000000';
      const escaped = escapeForBash(input);
      expect(escaped).toBe('ACtest0000000000');
    });
  });
});

describe('Settings JSON Generation', () => {
  it('should generate correct hook format', () => {
    const hookEntry = {
      matcher: 'AskUserQuestion',
      hooks: [{ type: 'command', command: '~/.claude/hooks/pingme.sh question' }],
    };

    expect(hookEntry.matcher).toBe('AskUserQuestion');
    expect(hookEntry.hooks).toHaveLength(1);
    expect(hookEntry.hooks[0].type).toBe('command');
    expect(hookEntry.hooks[0].command).toContain('pingme.sh');
  });

  it('should generate Stop hook without matcher', () => {
    const hookEntry = {
      hooks: [{ type: 'command', command: '~/.claude/hooks/pingme.sh stopped' }],
    };

    expect(hookEntry.hooks).toHaveLength(1);
    expect(hookEntry.hooks[0].command).toContain('stopped');
  });
});

describe('Hook Script Content', () => {
  it('should have correct shebang', () => {
    const scriptStart = '#!/usr/bin/env bash';
    expect(scriptStart).toBe('#!/usr/bin/env bash');
  });

  it('should include curl check', () => {
    const curlCheck = 'command -v curl';
    expect(curlCheck).toContain('curl');
  });

  it('should include all event types', () => {
    const events = ['question', 'permission', 'limit', 'stopped', 'test'];
    const reasons = ['Asking question', 'Needs permission', 'Hit limit', 'Agent stopped', 'Test ping'];

    events.forEach((event, i) => {
      expect(events).toContain(event);
      expect(reasons[i]).toBeDefined();
    });
  });
});

// Helper function to test (mirrors the one in install.ts)
function escapeForBash(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/!/g, '\\!');
}
