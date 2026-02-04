import * as p from '@clack/prompts';
import pc from 'picocolors';
import { init } from './commands/init.js';
import { test } from './commands/test.js';
import { uninstall } from './commands/uninstall.js';

const VERSION = '1.0.0';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';

  // Version flag (no header needed)
  if (command === '--version' || command === '-v') {
    console.log(`pingme-cli v${VERSION}`);
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
${pc.bold('Usage:')} npx pingme-cli ${pc.dim('<command>')}

${pc.bold('Commands:')}
  ${pc.cyan('init')}        Setup pingme (default)
  ${pc.cyan('test')}        Send a test SMS
  ${pc.cyan('uninstall')}   Remove pingme

${pc.bold('Examples:')}
  ${pc.dim('$')} npx pingme-cli init
  ${pc.dim('$')} npx pingme-cli test
`);
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
