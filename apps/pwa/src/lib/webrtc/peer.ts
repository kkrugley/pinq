import SimplePeer, { type SignalData } from 'simple-peer';
import type { Metadata } from '../types';
import { chunkFile, chunkText, CHUNK_SIZE } from '../utils/fileChunker';
import { SignalingClient } from './signaling';

export class WebRTCSender {
  private peer: SimplePeer.Instance;
  private signaling: SignalingClient;
  private connectionPromise: Promise<void> | null = null;
  private ackPromise: Promise<void> | null = null;

  constructor(signalingUrl: string, private code: string) {
    this.signaling = new SignalingClient(signalingUrl, code);
    this.peer = new SimplePeer({
      initiator: true,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
        ],
      },
    });

    this.peer.on('signal', (data: SignalData) => this.signaling.sendSignal(data));
  }

  async connect(onStatus?: (status: string) => void): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        onStatus?.('Warming up signaling...');
        await this.signaling.prewarm();
        onStatus?.('Joining room...');
        await this.signaling.connect();
        this.signaling.onSignal((payload) => this.peer.signal(payload.signal));
        onStatus?.('Waiting for receiver...');

        await new Promise<void>((resolve, reject) => {
          const handleConnect = () => {
            cleanup();
            resolve();
          };
          const handleError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            this.peer.off('connect', handleConnect);
            this.peer.off('error', handleError);
          };
          this.peer.once('connect', handleConnect);
          this.peer.once('error', handleError);
        });
      })();
    }

    return this.connectionPromise;
  }

  private waitForAck(timeoutMs = 10000) {
    if (this.ackPromise) return this.ackPromise;

    this.ackPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Не дождались подтверждения от компьютера'));
      }, timeoutMs);

      const handleData = (data: Buffer | string) => {
        const payload = data.toString();
        if (payload === 'ACK') {
          cleanup();
          resolve();
        }
      };

      const handleError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        cleanup();
        reject(new Error('Соединение закрыто до подтверждения'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.peer.off('data', handleData);
        this.peer.off('error', handleError);
        this.peer.off('close', handleClose);
      };

      this.peer.on('data', handleData);
      this.peer.once('error', handleError);
      this.peer.once('close', handleClose);
    });

    return this.ackPromise;
  }

  async sendText(text: string, onProgress?: (percent: number) => void) {
    const metadata: Metadata = { type: 'text' };
    this.peer.send(JSON.stringify(metadata));

    const chunks = chunkText(text, CHUNK_SIZE);
    const total = text.length || 1;
    let sent = 0;

    for (const chunk of chunks) {
      this.peer.send(chunk);
      sent += chunk.length;
      onProgress?.((sent / total) * 100);
    }

    this.peer.send('EOF');
    onProgress?.(100);

    await this.waitForAck();
  }

  async sendFile(file: File, onProgress?: (percent: number) => void) {
    const metadata: Metadata = {
      type: 'file',
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    };
    this.peer.send(JSON.stringify(metadata));

    let offset = 0;
    for await (const chunk of chunkFile(file, CHUNK_SIZE)) {
      this.peer.send(chunk);
      offset += chunk.length;
      onProgress?.((offset / file.size) * 100);
    }

    this.peer.send('EOF');
    onProgress?.(100);

    await this.waitForAck();
  }

  destroy() {
    this.peer.destroy();
    this.signaling.disconnect();
    this.connectionPromise = null;
    this.ackPromise = null;
  }
}
