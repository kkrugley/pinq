import chalk from 'chalk';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { ACK_MARKER, EOF_MARKER } from '@pinq/shared';
import { DEFAULT_DOWNLOAD_DIR, SIGNALING_URL } from '../config.js';
import { Metadata, ReceiveOptions } from '../types.js';
import { createProgressBar, createSpinner, formatBytes } from '../utils/display.js';
import { createWriteStream, resolveDownloadPath } from '../utils/file.js';
import { SignalingClient } from '../webrtc/signaling.js';
import { WebRTCReceiver } from '../webrtc/peer.js';

const ACK_LINGER_MS = 800;
const EOF_BUFFER = Buffer.from(EOF_MARKER);
const LEGACY_EOF_BUFFER = Buffer.from('EOF');

async function prewarm(url: string, verbose?: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
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

async function promptConfirm(question: string, defaultYes = false) {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
  const answer = await rl.question(`${question}${suffix}`);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return defaultYes;
  return ['y', 'yes', 'д', 'да'].includes(normalized);
}

function handleTextReception(receiver: WebRTCReceiver) {
  return new Promise<void>((resolve, reject) => {
    let text = '';
    let finished = false;

    const cleanup = () => {
      receiver.off('data', onData);
      receiver.off('error', onError);
      receiver.off('close', onClose);
    };

    const complete = () => {
      if (finished) return;
      finished = true;
      receiver.sendAck();
      // eslint-disable-next-line no-console
      console.log(chalk.green(`\n${text}`));
      setTimeout(() => {
        receiver.close();
        cleanup();
        resolve();
      }, ACK_LINGER_MS);
    };

    const onError = (err: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    };

    const onClose = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Соединение закрыто до завершения передачи'));
    };

    const onData = (chunk: Buffer | string) => {
      const isEof =
        typeof chunk === 'string'
          ? chunk === EOF_MARKER || chunk === 'EOF'
          : chunk.equals(EOF_BUFFER) || chunk.equals(LEGACY_EOF_BUFFER);
      if (isEof) {
        complete();
      } else {
        const content =
          typeof chunk === 'string'
            ? chunk
            : chunk.equals(EOF_BUFFER) || chunk.equals(LEGACY_EOF_BUFFER)
              ? ''
              : chunk.toString();
        text += content;
      }
    };

    receiver.on('data', onData);
    receiver.on('error', onError);
    receiver.on('close', onClose);
  });
}

function handleFileReception(receiver: WebRTCReceiver, metadata: Metadata, targetDir: string) {
  const filename = metadata.filename || `pinq-${Date.now()}`;
  const { filepath, stream } = createWriteStream(targetDir, filename);
  const total = metadata.size ?? 0;
  const progressBar = total > 1024 * 1024 ? createProgressBar(total) : undefined;

  return new Promise<void>((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      receiver.off('data', onData);
      receiver.off('error', onError);
      receiver.off('close', onClose);
      stream.off('error', onStreamError);
    };

    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      if (progressBar) {
        progressBar.stop();
      }
      cleanup();
      stream.destroy();
      reject(err);
    };

    const onStreamError = (err: Error) => {
      fail(err);
    };

    const onError = (err: Error) => fail(err);

    const onClose = () => fail(new Error('Соединение закрыто до завершения передачи'));

    const onData = (chunk: Buffer | string) => {
      const isEof =
        typeof chunk === 'string'
          ? chunk === EOF_MARKER || chunk === 'EOF'
          : (chunk as Buffer).equals(EOF_BUFFER) || (chunk as Buffer).equals(LEGACY_EOF_BUFFER);
      if (isEof) {
        finished = true;
        if (progressBar) {
          progressBar.stop();
        }
        stream.end(() => {
          receiver.sendAck();
          // eslint-disable-next-line no-console
          console.log(chalk.green(`✓ Saved: ${filepath}`));
          setTimeout(() => {
            receiver.close();
            cleanup();
            resolve();
          }, ACK_LINGER_MS);
        });
        return;
      }

      const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
      const success = stream.write(bufferChunk);

      if (progressBar) {
        progressBar.increment(bufferChunk.length);
      }

      if (!success) {
        stream.once('drain', () => {
          // resume once drained
        });
      }
    };

    receiver.on('data', onData);
    receiver.on('error', onError);
    receiver.on('close', onClose);
    stream.on('error', onStreamError);
  });
}

export async function receiveCommand(code: string, options: ReceiveOptions) {
  const normalizedCode = code.trim().toUpperCase();
  const downloadDir = resolveDownloadPath(options.path || DEFAULT_DOWNLOAD_DIR);
  const signaling = new SignalingClient(SIGNALING_URL, { verbose: options.verbose });
  const receiver = new WebRTCReceiver(normalizedCode, signaling, { verbose: options.verbose });

  const connectSpinner = createSpinner('Пробуждение сервера и подключение...', options.verbose);
  try {
    await prewarm(SIGNALING_URL, options.verbose);
    await signaling.join(normalizedCode);
    connectSpinner.succeed('Подключились к серверу, ожидаем телефон...');
  } catch (err) {
    connectSpinner.fail((err as Error).message);
    throw err;
  }

  try {
    const peerSpinner = createSpinner('Ожидание подключения телефона...', options.verbose);
    try {
      await receiver.start();
      peerSpinner.succeed('Телефон подключен');
    } catch (err) {
      peerSpinner.fail((err as Error).message);
      throw err;
    }

    const metadataSpinner = createSpinner('Ожидаем данные от телефона...', options.verbose);
    let metadata: Metadata;
    try {
      metadata = await receiver.waitForMetadata();
      metadataSpinner.stop();
    } catch (err) {
      metadataSpinner.fail((err as Error).message);
      throw err;
    }

    if (metadata.type === 'file') {
      if (options.confirm) {
        const ok = await promptConfirm(
          `Receive file ${metadata.filename || 'unnamed'} (${formatBytes(metadata.size)}) to ${path.resolve(downloadDir)}?`,
        );
        if (!ok) {
          // eslint-disable-next-line no-console
          console.log(chalk.yellow('Transfer cancelled by user.'));
          return;
        }
      }
      await handleFileReception(receiver, metadata, downloadDir);
    } else {
      await handleTextReception(receiver);
    }
  } finally {
    receiver.close();
    signaling.disconnect();
  }
}
