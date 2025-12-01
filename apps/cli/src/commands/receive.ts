import chalk from 'chalk';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { DEFAULT_DOWNLOAD_DIR, SIGNALING_URL } from '../config.js';
import { Metadata, ReceiveOptions } from '../types.js';
import { createProgressBar, createSpinner, formatBytes } from '../utils/display.js';
import { createWriteStream, resolveDownloadPath } from '../utils/file.js';
import { SignalingClient } from '../webrtc/signaling.js';
import { WebRTCReceiver } from '../webrtc/peer.js';

async function prewarm(url: string, verbose?: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (res.ok && verbose) {
      // eslint-disable-next-line no-console
      console.log('[prewarm] signaling responded');
    }
  } catch (err) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.warn('[prewarm] failed to ping signaling server', err);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function promptConfirm(question: string) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${question} (y/N): `);
  rl.close();
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

function handleTextReception(receiver: WebRTCReceiver) {
  let text = '';
  receiver.on('data', (chunk) => {
    const content = chunk.toString();
    if (content === 'EOF') {
      receiver.sendAck();
      // eslint-disable-next-line no-console
      console.log(chalk.green(`\n${text}`));
      receiver.close();
    } else {
      text += content;
    }
  });
}

function handleFileReception(receiver: WebRTCReceiver, metadata: Metadata, targetDir: string) {
  const filename = metadata.filename || `pinq-${Date.now()}`;
  const { filepath, stream } = createWriteStream(targetDir, filename);
  const total = metadata.size ?? 0;
  const progressBar = total > 1024 * 1024 ? createProgressBar(total) : undefined;

  let receivedBytes = 0;

  receiver.on('data', (chunk) => {
    const content = chunk.toString();
    if (content === 'EOF') {
      if (progressBar) {
        progressBar.stop();
      }
      stream.end(() => {
        receiver.sendAck();
        // eslint-disable-next-line no-console
        console.log(chalk.green(`✓ Saved: ${filepath}`));
        receiver.close();
      });
      return;
    }

    const success = stream.write(chunk);
    receivedBytes += chunk.length;

    if (progressBar) {
      progressBar.increment(chunk.length);
    }

    if (!success) {
      stream.once('drain', () => {
        // resume once drained
      });
    }
  });

  stream.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(chalk.red(`✖ File write error: ${err.message}`));
    if (progressBar) {
      progressBar.stop();
    }
    receiver.close();
  });
}

export async function receiveCommand(code: string, options: ReceiveOptions) {
  const normalizedCode = code.trim().toUpperCase();
  const downloadDir = resolveDownloadPath(options.path || DEFAULT_DOWNLOAD_DIR);
  const signaling = new SignalingClient(SIGNALING_URL, { verbose: options.verbose });
  const receiver = new WebRTCReceiver(normalizedCode, signaling, { verbose: options.verbose });
  receiver.once('close', () => signaling.disconnect());
  receiver.once('error', () => signaling.disconnect());

  const connectSpinner = createSpinner('Пробуждение сервера и подключение...', options.verbose);
  try {
    await prewarm(SIGNALING_URL, options.verbose);
    await signaling.join(normalizedCode);
    connectSpinner.succeed('Подключились к серверу, ожидаем телефон...');
  } catch (err) {
    connectSpinner.fail((err as Error).message);
    signaling.disconnect();
    throw err;
  }

  const peerSpinner = createSpinner('Ожидание подключения телефона...', options.verbose);
  try {
    await receiver.start();
    const metadata = await receiver.waitForMetadata();
    peerSpinner.succeed('Телефон подключен');

    if (metadata.type === 'file') {
      if (options.confirm) {
        const ok = await promptConfirm(
          `Receive file ${metadata.filename || 'unnamed'} (${formatBytes(metadata.size)}) to ${path.resolve(downloadDir)}?`,
        );
        if (!ok) {
          receiver.close();
          signaling.disconnect();
          // eslint-disable-next-line no-console
          console.log(chalk.yellow('Transfer cancelled by user.'));
          return;
        }
      }
      handleFileReception(receiver, metadata, downloadDir);
    } else {
      handleTextReception(receiver);
    }
  } catch (err) {
    peerSpinner.fail((err as Error).message);
    receiver.close();
    signaling.disconnect();
    throw err;
  }
}
