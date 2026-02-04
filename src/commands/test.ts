import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { execSync } from 'child_process';

export async function test() {
  const hookPath = path.join(homedir(), '.claude', 'hooks', 'pingme.sh');

  if (!existsSync(hookPath)) {
    p.log.error('pingme is not installed');
    p.log.info(`Run ${pc.cyan('npx pingme-cli init')} to set up`);
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Sending test SMS');

  try {
    execSync(`echo "🧪 Test ping from pingme-cli" | "${hookPath}" test`, {
      timeout: 15000,
      stdio: 'ignore',
    });
    s.stop('Test SMS sent!');
    p.log.success('Check your phone for the message');
  } catch (err) {
    s.stop('Failed to send SMS');

    // Provide more specific error message
    const isTimeout = err instanceof Error && err.message.includes('ETIMEDOUT');
    if (isTimeout) {
      p.log.error('Request timed out - check your network connection');
    } else {
      p.log.error('SMS send failed - check your Twilio credentials');
    }
    p.log.info(`Run ${pc.cyan('npx pingme-cli init')} to reconfigure`);
    process.exit(1);
  }

  p.outro(pc.dim('All good!'));
}
