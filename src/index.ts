import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init } from './commands/init.js';
import { test } from './commands/test.js';
import { uninstall } from './commands/uninstall.js';
import { events } from './commands/events.js';

// Read version from package.json (single source of truth)
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';

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
${pc.bold('Usage:')} npx @hrushiborhade/pingme ${pc.dim('<command>')}

${pc.bold('Commands:')}
  ${pc.cyan('init')}        Setup pingme (default)
  ${pc.cyan('events')}      Configure which events trigger SMS
  ${pc.cyan('test')}        Send a test SMS
  ${pc.cyan('uninstall')}   Remove pingme

${pc.bold('Examples:')}
  ${pc.dim('$')} npx @hrushiborhade/pingme init
  ${pc.dim('$')} npx @hrushiborhade/pingme events
  ${pc.dim('$')} npx @hrushiborhade/pingme test
`);
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
