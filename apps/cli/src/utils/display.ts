import chalk from 'chalk';
import cliProgress from 'cli-progress';
import ora, { Ora } from 'ora';

export function createSpinner(text: string, verbose?: boolean) {
  const spinner = ora(text);
  if (verbose) {
    spinner.stop();
    // eslint-disable-next-line no-console
    console.log(chalk.gray(`ℹ ${text}`));
    return {
      start: () => undefined,
      succeed: (msg?: string) => console.log(chalk.green(`✓ ${msg || text}`)),
      fail: (msg?: string) => console.error(chalk.red(`✖ ${msg || text}`)),
      stop: () => undefined,
    } as unknown as Ora;
  }

  return spinner.start();
}

export function createProgressBar(total: number) {
  const bar = new cliProgress.SingleBar(
    {
      format: 'Receiving |{bar}| {percentage}% | {value}/{total} bytes',
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0);
  return bar;
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined) return 'unknown';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(2)} ${units[i]}`;
}
