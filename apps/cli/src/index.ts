#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { receiveCommand } from './commands/receive.js';
import { ReceiveOptions } from './types.js';

async function promptCode(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question('Введите 6-значный код из PWA: ')).trim().toUpperCase();
  rl.close();
  return answer;
}

async function runReceive(code: string | undefined, opts: ReceiveOptions) {
  const finalCode = code?.trim().toUpperCase() || (await promptCode());
  if (!finalCode) {
    // eslint-disable-next-line no-console
    console.error('Код не введён, выхожу.');
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
  .description('Pair-In Quick CLI для приёма текста и файлов по WebRTC')
  .version('0.1.0')
  .argument('[code]', 'код из PWA; если не передан — будет запрос')
  .option('--path <dir>', 'директория сохранения (по умолчанию ~/Downloads)')
  .option('--confirm', 'спрашивать подтверждение перед приёмом файла')
  .option('--verbose', 'подробный лог')
  .action((code: string | undefined, opts: ReceiveOptions) => {
    // eslint-disable-next-line no-console
    console.log('🔥 Pair-In Quick — приём данных без облака');
    return runReceive(code, opts);
  });

program
  .command('receive')
  .description('Явно указать код для приёма')
  .argument('<code>', 'код из PWA')
  .option('--path <dir>', 'директория сохранения (по умолчанию ~/Downloads)')
  .option('--confirm', 'спрашивать подтверждение перед приёмом файла')
  .option('--verbose', 'подробный лог')
  .action((code: string, opts: ReceiveOptions) => runReceive(code, opts));

program.parseAsync(process.argv);
