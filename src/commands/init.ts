import * as p from '@clack/prompts';
import pc from 'picocolors';
import { installHook } from '../utils/install.js';
import { sendTestSMS } from '../utils/twilio.js';

export async function init() {
  p.log.info(pc.dim('Get your Twilio credentials at: ') + pc.cyan('https://console.twilio.com'));

  const credentials = await p.group(
    {
      twilioSid: () =>
        p.text({
          message: 'Twilio Account SID',
          placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.startsWith('AC')) return 'Should start with AC';
          },
        }),

      twilioToken: () =>
        p.password({
          message: 'Twilio Auth Token',
          validate: (value) => {
            if (!value) return 'Required';
            if (value.length < 20) return 'Token seems too short';
          },
        }),

      twilioFrom: () =>
        p.text({
          message: 'Twilio Phone Number',
          placeholder: '+14155238886',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.startsWith('+')) return 'Include country code (e.g., +1...)';
          },
        }),

      myPhone: () =>
        p.text({
          message: 'Your Phone Number',
          placeholder: '+1234567890',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.startsWith('+')) return 'Include country code (e.g., +1...)';
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(0);
      },
    }
  );

  const s = p.spinner();

  // Install hook
  s.start('Creating hook script');
  try {
    await installHook(credentials);
    s.stop('Hook script created');
  } catch (err) {
    s.stop(pc.red('Failed to create hook script'));
    p.log.error(err instanceof Error ? err.message : 'Unknown error');
    p.log.info('Check that you have write permissions to ~/.claude/');
    process.exit(1);
  }

  // Send test SMS
  s.start('Sending test SMS');
  const testResult = await sendTestSMS(credentials);
  if (testResult.success) {
    s.stop('Test SMS sent');
  } else {
    s.stop(pc.yellow('Could not send test SMS'));
    p.log.warn('Setup completed, but test SMS failed. Check your Twilio credentials.');
  }

  // Done
  p.note(
    `Your Claude agent will now ping you when it needs attention.

${pc.dim('Commands:')}
  ${pc.cyan('npx pingme-cli test')}       Send a test SMS
  ${pc.cyan('npx pingme-cli uninstall')}  Remove pingme`,
    'Setup complete'
  );

  p.outro(pc.dim('Now go doom scroll guilt-free ') + '🚀');
}
