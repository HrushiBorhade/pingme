import * as p from '@clack/prompts';
import pc from 'picocolors';
import { installHook } from '../utils/install.js';
import { sendTestSMS } from '../utils/twilio.js';
import { ALL_EVENTS, type HookEventDef } from '../utils/events.js';

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
            if (!value.match(/^AC[a-z0-9]{32}$/i)) {
              return 'Invalid SID format (should be 34 alphanumeric chars starting with AC)';
            }
          },
        }),

      twilioToken: () =>
        p.password({
          message: 'Twilio Auth Token',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.match(/^[a-z0-9]{32}$/i)) {
              return 'Invalid token format (should be 32 alphanumeric chars)';
            }
          },
        }),

      twilioFrom: () =>
        p.text({
          message: 'Twilio Phone Number',
          placeholder: '+14155238886',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.match(/^\+\d{1,15}$/)) {
              return 'Invalid phone format (e.g., +14155238886)';
            }
          },
        }),

      myPhone: () =>
        p.text({
          message: 'Your Phone Number',
          placeholder: '+1234567890',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.match(/^\+\d{1,15}$/)) {
              return 'Invalid phone format (e.g., +1234567890)';
            }
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

  // Event selection
  const selectedEvents = await p.multiselect({
    message: 'Which events should trigger an SMS?',
    options: ALL_EVENTS.map((evt) => ({
      value: evt,
      label: `${evt.emoji}  ${evt.label}`,
      hint: evt.spammy ? 'spammy' : evt.description,
    })),
    initialValues: ALL_EVENTS.filter((e) => e.defaultEnabled),
    required: true,
  });

  if (p.isCancel(selectedEvents)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  const enabledEvents = selectedEvents as HookEventDef[];

  const s = p.spinner();

  // Install hook
  s.start('Creating hook script');
  try {
    await installHook(credentials, enabledEvents);
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
  const eventList = enabledEvents.map((e) => `  ${e.emoji}  ${e.label}`).join('\n');
  p.note(
    `Your Claude agent will now ping you for these events:

${eventList}

${pc.dim('Commands:')}
  ${pc.cyan('npx @hrushiborhade/pingme events')}     Change which events trigger SMS
  ${pc.cyan('npx @hrushiborhade/pingme test')}       Send a test SMS
  ${pc.cyan('npx @hrushiborhade/pingme uninstall')}  Remove pingme`,
    'Setup complete'
  );

  p.outro(pc.dim('Now go doom scroll guilt-free ') + '🚀');
}
