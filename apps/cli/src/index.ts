#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { receiveCommand } from './commands/receive.js';
import { ReceiveOptions } from './types.js';

async function promptCode(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question('Enter the 6-character code from PWA: ')).trim().toUpperCase();
  rl.close();
  return answer;
}

async function runReceive(code: string | undefined, opts: ReceiveOptions) {
  const finalCode = code?.trim().toUpperCase() || (await promptCode());
  if (!finalCode) {
    // eslint-disable-next-line no-console
    console.error('Code is empty, exiting.');
    process.exit(1);
  }

  try {
    await receiveCommand(finalCode, opts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('pinq')
  .description('Pair-In Quick CLI for receiving text and files over WebRTC')
  .version('0.1.0')
  .argument('[code]', 'code from PWA; if omitted you will be prompted')
  .option('--path <dir>', 'save directory (default: ~/Downloads)')
  .option('--confirm', 'ask confirmation before receiving a file')
  .option('--verbose', 'verbose logging')
  .action((code: string | undefined, opts: ReceiveOptions) => {
    // eslint-disable-next-line no-console
    console.log('🔥 Pair-In Quick — receive data without the cloud');
    return runReceive(code, opts);
  });

program
  .command('receive')
  .description('Explicitly provide the code to receive')
  .argument('<code>', 'code from PWA')
  .option('--path <dir>', 'save directory (default: ~/Downloads)')
  .option('--confirm', 'ask confirmation before receiving a file')
  .option('--verbose', 'verbose logging')
  .action((code: string, opts: ReceiveOptions) => runReceive(code, opts));

program.parseAsync(process.argv);
