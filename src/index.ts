import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init } from './commands/init.js';
import { test } from './commands/test.js';
import { uninstall } from './commands/uninstall.js';
import { events } from './commands/events.js';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';
import { call } from './commands/call.js';
import { name } from './commands/name.js';
import { logs } from './commands/logs.js';
import { config } from './commands/config.js';

// Read version from package.json (single source of truth)
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';
  const commandArgs = args.slice(1);

  // Version flag (no header needed)
  if (command === '--version' || command === '-v') {
    console.log(`pingme v${VERSION}`);
    return;
  }

  // Header
  console.log();  // Add spacing
  p.intro(pc.bgCyan(pc.black(' pingme ')));

  switch (command) {
    case 'init':
      await init();
      break;
    case 'start':
      await start(commandArgs);
      break;
    case 'stop':
      await stop();
      break;
    case 'status':
      await status(commandArgs);
      break;
    case 'call':
      await call(commandArgs);
      break;
    case 'name':
      await name(commandArgs);
      break;
    case 'logs':
      await logs(commandArgs);
      break;
    case 'config':
      await config(commandArgs);
      break;
    case 'test':
      await test();
      break;
    case 'events':
      await events();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      p.log.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
${pc.bold('Usage:')} pingme ${pc.dim('<command>')} ${pc.dim('[options]')}

${pc.bold('Setup:')}
  ${pc.cyan('init')}                Setup pingme (default)
  ${pc.cyan('config')}              View/edit configuration
  ${pc.cyan('config set <k> <v>')}  Update a config value

${pc.bold('Daemon:')}
  ${pc.cyan('start')}               Start the daemon
  ${pc.cyan('start -b')}            Start in background
  ${pc.cyan('stop')}                Stop the daemon
  ${pc.cyan('status')}              Show sessions and daemon health
  ${pc.cyan('status --json')}       Output as JSON
  ${pc.cyan('logs')}                Show daemon logs
  ${pc.cyan('logs -f')}             Follow daemon logs

${pc.bold('Sessions:')}
  ${pc.cyan('call')}                Trigger an outbound call
  ${pc.cyan('call --session <id>')} Call for a specific session
  ${pc.cyan('name <pane> <name>')}  Rename a session

${pc.bold('SMS (legacy):')}
  ${pc.cyan('events')}              Configure which events trigger SMS
  ${pc.cyan('test')}                Send a test SMS
  ${pc.cyan('uninstall')}           Remove pingme
`);
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
