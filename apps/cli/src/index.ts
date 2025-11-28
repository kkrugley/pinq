#!/usr/bin/env node
import { Command } from 'commander';
import { receiveCommand } from './commands/receive.js';
import { ReceiveOptions } from './types.js';

const program = new Command();

program
  .name('pinq')
  .description('Pair-In Quick CLI for receiving text and files via WebRTC')
  .version('0.0.1');

program
  .command('receive')
  .argument('<code>', 'pairing code displayed in the PWA')
  .option('--path <dir>', 'custom download directory (default: ~/Downloads)')
  .option('--confirm', 'ask for confirmation before receiving files')
  .option('--verbose', 'enable verbose logging')
  .action(async (code: string, opts: ReceiveOptions) => {
    try {
      await receiveCommand(code, opts);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
