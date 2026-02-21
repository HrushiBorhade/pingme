import * as p from '@clack/prompts';
import pc from 'picocolors';
import { installHook } from '../utils/install.js';
import { sendTestSMS } from '../utils/twilio.js';
import { ALL_EVENTS, type HookEventDef } from '../utils/events.js';
import { getDefaultConfig, saveConfig, getConfigDir } from '../utils/config.js';
import { mkdir } from 'fs/promises';

export async function init() {
  // Mode selection
  const mode = await p.select({
    message: 'How should pingme notify you?',
    options: [
      {
        value: 'voice' as const,
        label: '📞 Voice calls (recommended)',
        hint: 'AI calls you and reads out what happened',
      },
      {
        value: 'sms' as const,
        label: '💬 SMS only (classic)',
        hint: 'Text messages via Twilio',
      },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (mode === 'voice') {
    await initVoiceMode();
  } else {
    await initSmsMode();
  }
}

async function initVoiceMode() {
  p.log.info(pc.dim('Voice mode requires a Bolna API key and an Anthropic API key.'));
  p.log.info(pc.dim('Get your Bolna key at: ') + pc.cyan('https://app.bolna.dev'));
  p.log.info(pc.dim('Get your Anthropic key at: ') + pc.cyan('https://console.anthropic.com'));

  const credentials = await p.group(
    {
      bolnaApiKey: () =>
        p.password({
          message: 'Bolna API Key',
          validate: (value) => {
            if (!value) return 'Required';
          },
        }),

      phone: () =>
        p.text({
          message: 'Your Phone Number (to receive calls)',
          placeholder: '+1234567890',
          validate: (value) => {
            if (!value) return 'Required';
            if (!value.match(/^\+\d{1,15}$/)) {
              return 'Invalid phone format (e.g., +1234567890)';
            }
          },
        }),

      anthropicApiKey: () =>
        p.password({
          message: 'Anthropic API Key (for bridge LLM)',
          validate: (value) => {
            if (!value) return 'Required';
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(0);
      },
    },
  );

  // Event selection
  const selectedEvents = await p.multiselect({
    message: 'Which events should trigger a call?',
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

  // Create config
  s.start('Saving configuration');
  try {
    const config = getDefaultConfig();
    config.mode = 'voice';
    config.phone = credentials.phone;
    config.bolna.api_key = credentials.bolnaApiKey;
    config.bridge.api_key = credentials.anthropicApiKey;

    await mkdir(getConfigDir(), { recursive: true });
    await saveConfig(config);
    s.stop('Configuration saved');
  } catch (err) {
    s.stop(pc.red('Failed to save config'));
    p.log.error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }

  // Install v2 hooks (POST to daemon instead of running shell script)
  s.start('Installing Claude Code hooks');
  try {
    await installHook(
      {
        twilioSid: '',
        twilioToken: '',
        twilioFrom: '',
        myPhone: credentials.phone,
      },
      enabledEvents,
    );
    s.stop('Hooks installed');
  } catch (err) {
    s.stop(pc.red('Failed to install hooks'));
    p.log.error(err instanceof Error ? err.message : 'Unknown error');
    p.log.info('Check that you have write permissions to ~/.claude/');
    process.exit(1);
  }

  // Done
  const eventList = enabledEvents.map((e) => `  ${e.emoji}  ${e.label}`).join('\n');
  p.note(
    `Voice mode configured! Events that will trigger a call:

${eventList}

${pc.dim('Next steps:')}
  ${pc.cyan('pingme start')}          Start the daemon
  ${pc.cyan('pingme start -b')}       Start in background
  ${pc.cyan('pingme status')}         Check session status
  ${pc.cyan('pingme call')}           Trigger a test call
  ${pc.cyan('pingme config')}         View/edit config`,
    'Setup complete',
  );

  p.outro(pc.dim('Start the daemon with: ') + pc.cyan('pingme start'));
}

async function initSmsMode() {
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
    },
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

  // Save config for SMS mode
  s.start('Saving configuration');
  try {
    const config = getDefaultConfig();
    config.mode = 'sms';
    config.phone = credentials.myPhone;
    config.sms.enabled = true;
    config.sms.twilio_sid = credentials.twilioSid;
    config.sms.twilio_token = credentials.twilioToken;
    config.sms.twilio_from = credentials.twilioFrom;

    await mkdir(getConfigDir(), { recursive: true });
    await saveConfig(config);
    s.stop('Configuration saved');
  } catch (err) {
    s.stop(pc.red('Failed to save config'));
    p.log.error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  }

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
    'Setup complete',
  );

  p.outro(pc.dim('Now go doom scroll guilt-free ') + '🚀');
}
