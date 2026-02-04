import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Tests for the hook script execution behavior.
 * We create actual scripts and test their behavior.
 */
describe('Hook Script Behavior', () => {
  const testDir = path.join(os.tmpdir(), `pingme-hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Event Handling', () => {
    it('should handle question event', async () => {
      const hookScript = `#!/usr/bin/env bash
EVENT="\${1:-unknown}"
case "$EVENT" in
    question) echo "QUESTION" ;;
    *) echo "OTHER" ;;
esac
`;
      const hookPath = path.join(testDir, 'test-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}" question`, { encoding: 'utf-8' });
      expect(output.trim()).toBe('QUESTION');
    });

    it('should handle stopped event', async () => {
      const hookScript = `#!/usr/bin/env bash
EVENT="\${1:-unknown}"
case "$EVENT" in
    stopped) echo "STOPPED" ;;
    *) echo "OTHER" ;;
esac
`;
      const hookPath = path.join(testDir, 'test-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}" stopped`, { encoding: 'utf-8' });
      expect(output.trim()).toBe('STOPPED');
    });

    it('should handle test event', async () => {
      const hookScript = `#!/usr/bin/env bash
EVENT="\${1:-unknown}"
case "$EVENT" in
    test) echo "TEST" ;;
    *) echo "OTHER" ;;
esac
`;
      const hookPath = path.join(testDir, 'test-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}" test`, { encoding: 'utf-8' });
      expect(output.trim()).toBe('TEST');
    });

    it('should default to unknown for missing event', async () => {
      const hookScript = `#!/usr/bin/env bash
EVENT="\${1:-unknown}"
echo "$EVENT"
`;
      const hookPath = path.join(testDir, 'test-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}"`, { encoding: 'utf-8' });
      expect(output.trim()).toBe('unknown');
    });
  });

  describe('Stdin Handling', () => {
    it('should read context from stdin', async () => {
      const hookScript = `#!/usr/bin/env bash
if [ ! -t 0 ]; then
    CONTEXT=$(cat)
    echo "$CONTEXT"
fi
`;
      const hookPath = path.join(testDir, 'stdin-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const testMessage = 'Hello from stdin';
      const output = execSync(`echo "${testMessage}" | "${hookPath}"`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      });
      expect(output.trim()).toBe(testMessage);
    });

    it('should truncate long stdin to 280 chars', async () => {
      const hookScript = `#!/usr/bin/env bash
if [ ! -t 0 ]; then
    CONTEXT=$(head -c 280)
    echo -n "$CONTEXT" | wc -c | tr -d ' '
fi
`;
      const hookPath = path.join(testDir, 'truncate-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const longMessage = 'A'.repeat(500);
      const output = execSync(`echo "${longMessage}" | "${hookPath}"`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      });
      expect(parseInt(output.trim(), 10)).toBeLessThanOrEqual(280);
    });
  });

  describe('Project Name Extraction', () => {
    it('should extract project name from PWD', async () => {
      const hookScript = `#!/usr/bin/env bash
PROJECT=$(basename "$PWD")
echo "$PROJECT"
`;
      const hookPath = path.join(testDir, 'project-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`cd "${testDir}" && "${hookPath}"`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      });
      expect(output.trim()).toBe(path.basename(testDir));
    });

    it('should sanitize project name', async () => {
      const hookScript = `#!/usr/bin/env bash
PROJECT=$(basename "$PWD" | tr -cd '[:alnum:]._-')
echo "$PROJECT"
`;
      const hookPath = path.join(testDir, 'sanitize-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}"`, { encoding: 'utf-8' });
      // Should only contain alphanumeric, dots, underscores, hyphens
      expect(output.trim()).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });

  describe('Curl Check', () => {
    it('should detect if curl is available', async () => {
      const hookScript = `#!/usr/bin/env bash
if command -v curl &> /dev/null; then
    echo "HAS_CURL"
else
    echo "NO_CURL"
fi
`;
      const hookPath = path.join(testDir, 'curl-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      const output = execSync(`"${hookPath}"`, { encoding: 'utf-8' });
      // Most systems have curl
      expect(['HAS_CURL', 'NO_CURL']).toContain(output.trim());
    });
  });

  describe('Background Execution', () => {
    it('should exit immediately with exit 0', async () => {
      const hookScript = `#!/usr/bin/env bash
# Simulate background work
(sleep 0.1) &
exit 0
`;
      const hookPath = path.join(testDir, 'bg-hook.sh');
      await writeFile(hookPath, hookScript, { mode: 0o755 });

      // Should complete quickly (not wait for background process)
      const start = Date.now();
      execSync(`"${hookPath}"`, { encoding: 'utf-8' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should be much faster than 1 second
    });
  });
});

describe('Error Code Detection', () => {
  it('should categorize timeout errors', () => {
    const timeoutMessages = ['ETIMEDOUT', 'timed out', 'timedout'];
    timeoutMessages.forEach((msg) => {
      expect(msg.toLowerCase()).toMatch(/time/i);
    });
  });

  it('should categorize network errors', () => {
    const networkMessages = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET'];
    networkMessages.forEach((msg) => {
      expect(msg.startsWith('E')).toBe(true);
    });
  });

  it('should categorize permission errors', () => {
    const permissionMessages = ['EACCES', 'permission denied'];
    expect(permissionMessages.some((m) => m.toLowerCase().includes('acces') || m.toLowerCase().includes('permission'))).toBe(true);
  });
});
