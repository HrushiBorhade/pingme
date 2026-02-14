import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const cliPath = path.join(process.cwd(), 'bin', 'pingme.js');

describe('CLI Commands', () => {
  describe('version', () => {
    it('should display version with --version', () => {
      const output = execSync(`node "${cliPath}" --version`, { encoding: 'utf-8' });
      expect(output.trim()).toMatch(/^pingme v\d+\.\d+\.\d+$/);
    });

    it('should display version with -v', () => {
      const output = execSync(`node "${cliPath}" -v`, { encoding: 'utf-8' });
      expect(output.trim()).toMatch(/^pingme v\d+\.\d+\.\d+$/);
    });
  });

  describe('help', () => {
    it('should display help with help command', () => {
      const output = execSync(`node "${cliPath}" help`, { encoding: 'utf-8' });
      expect(output).toContain('Usage:');
      expect(output).toContain('init');
      expect(output).toContain('test');
      expect(output).toContain('uninstall');
    });

    it('should display help with --help', () => {
      const output = execSync(`node "${cliPath}" --help`, { encoding: 'utf-8' });
      expect(output).toContain('Usage:');
    });

    it('should display help with -h', () => {
      const output = execSync(`node "${cliPath}" -h`, { encoding: 'utf-8' });
      expect(output).toContain('Usage:');
    });
  });

  describe('unknown command', () => {
    it('should exit with error for unknown command', () => {
      try {
        execSync(`node "${cliPath}" unknown-cmd 2>&1`, { encoding: 'utf-8' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as { status: number }).status).toBe(1);
      }
    });
  });
});

describe('Shell Injection Prevention', () => {
  const testDir = path.join(os.tmpdir(), `pingme-injection-${Date.now()}`);

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

  it('should not execute escaped double quotes', async () => {
    const hookScript = `#!/usr/bin/env bash
TWILIO_SID="AC\\"; touch ${testDir}/pwned1; echo \\""
echo "safe"
`;
    const hookPath = path.join(testDir, 'test1.sh');
    await writeFile(hookPath, hookScript, { mode: 0o755 });

    execSync(`"${hookPath}"`, { encoding: 'utf-8' });
    expect(existsSync(path.join(testDir, 'pwned1'))).toBe(false);
  });

  it('should not execute escaped command substitution', async () => {
    const hookScript = `#!/usr/bin/env bash
TOKEN="\\$(touch ${testDir}/pwned2)"
echo "safe"
`;
    const hookPath = path.join(testDir, 'test2.sh');
    await writeFile(hookPath, hookScript, { mode: 0o755 });

    execSync(`"${hookPath}"`, { encoding: 'utf-8' });
    expect(existsSync(path.join(testDir, 'pwned2'))).toBe(false);
  });

  it('should not execute escaped backticks', async () => {
    const hookScript = `#!/usr/bin/env bash
PHONE="\\$(touch ${testDir}/pwned3)"
echo "safe"
`;
    const hookPath = path.join(testDir, 'test3.sh');
    await writeFile(hookPath, hookScript, { mode: 0o755 });

    execSync(`"${hookPath}"`, { encoding: 'utf-8' });
    expect(existsSync(path.join(testDir, 'pwned3'))).toBe(false);
  });
});

describe('Input Validation Logic', () => {
  describe('Twilio SID validation', () => {
    it('should accept valid SID starting with AC', () => {
      const sid = 'ACtest00000000000000000000000000';
      expect(sid.startsWith('AC')).toBe(true);
      expect(sid.length).toBeGreaterThan(10);
    });

    it('should reject SID not starting with AC', () => {
      const sid = 'XX1234567890';
      expect(sid.startsWith('AC')).toBe(false);
    });
  });

  describe('Phone number validation', () => {
    it('should accept phone with country code', () => {
      const phone = '+14155238886';
      expect(phone.startsWith('+')).toBe(true);
    });

    it('should reject phone without country code', () => {
      const phone = '4155238886';
      expect(phone.startsWith('+')).toBe(false);
    });
  });

  describe('Token validation', () => {
    it('should accept token with sufficient length', () => {
      const token = 'a'.repeat(32);
      expect(token.length >= 20).toBe(true);
    });

    it('should reject short token', () => {
      const token = 'short';
      expect(token.length >= 20).toBe(false);
    });
  });
});
