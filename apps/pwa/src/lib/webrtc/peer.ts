import SimplePeer, { type SignalData } from 'simple-peer';
import type { Metadata } from '../types';
import { chunkFile, chunkText, CHUNK_SIZE } from '../utils/fileChunker';
import { SignalingClient } from './signaling';

export class WebRTCSender {
  private peer: SimplePeer.Instance | null = null;
  private signaling: SignalingClient;
  private connectionPromise: Promise<void> | null = null;
  private cleanupSignalHandler: (() => void) | null = null;

  constructor(signalingUrl: string, private code: string) {
    this.signaling = new SignalingClient(signalingUrl, code);
  }

  private createPeer() {
    if (typeof window === 'undefined' || !window.RTCPeerConnection) {
      throw new Error('WebRTC не поддерживается в этом браузере');
    }

    const peer = new SimplePeer({
      initiator: true,
      trickle: true,
      wrtc: undefined,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
        ],
      },
    });

    peer.on('signal', (data: SignalData) => this.signaling.sendSignal(data));
    peer.on('error', (err) => {
      console.error('[WebRTC] Peer error:', err);
    });
    this.peer = peer;
    return peer;
  }

  async connect(onStatus?: (status: string) => void, timeoutMs = 30000): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        onStatus?.('Warming up signaling...');
        await this.signaling.prewarm();
        onStatus?.('Joining room...');
        await this.signaling.connect();

        const peer = this.createPeer();
        this.cleanupSignalHandler = this.signaling.onSignal((payload) => peer.signal(payload.signal));

        onStatus?.('Waiting for receiver...');

        await new Promise<void>((resolve, reject) => {
          const removeListener = (event: string, handler: (...args: unknown[]) => void) => {
            const off =
              (peer as unknown as { off?: typeof peer.off }).off ??
              (peer as unknown as { removeListener?: typeof peer.removeListener }).removeListener ??
              (peer as unknown as { removeEventListener?: typeof peer.removeEventListener }).removeEventListener;
            off?.call(peer, event, handler);
          };

          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Не удалось дождаться подключения компьютера'));
          }, timeoutMs);

          const handleConnect = () => {
            cleanup();
            resolve();
          };
          const handleError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            clearTimeout(timer);
            removeListener('connect', handleConnect);
            removeListener('error', handleError);
          };
          peer.once('connect', handleConnect);
          peer.once('error', handleError);
        });
      })();
    }

    return this.connectionPromise;
  }

  private getPeerOrThrow() {
    if (!this.peer) {
      throw new Error('Соединение с компьютером не установлено');
    }
    return this.peer;
  }

  private waitForAck(timeoutMs = 10000) {
    const peer = this.getPeerOrThrow();
    const removeListener = (event: string, handler: (...args: unknown[]) => void) => {
      // simple-peer in browser uses readable-stream EventEmitter which doesn't implement off()
      const off =
        (peer as unknown as { off?: typeof peer.off }).off ??
        (peer as unknown as { removeListener?: typeof peer.removeListener }).removeListener ??
        (peer as unknown as { removeEventListener?: typeof peer.removeEventListener }).removeEventListener;
      off?.call(peer, event, handler);
    };

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Не дождались подтверждения от компьютера'));
      }, timeoutMs);

      const handleData = (data: Uint8Array | string) => {
        const payload = typeof data === 'string' ? data : new TextDecoder().decode(data);
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
        removeListener('data', handleData);
        removeListener('error', handleError);
        removeListener('close', handleClose);
      };

      peer.on('data', handleData);
      peer.once('error', handleError);
      peer.once('close', handleClose);
    });
  }

  async sendText(text: string, onProgress?: (percent: number) => void) {
    if (!this.peer) {
      await this.connect();
    }
    const peer = this.getPeerOrThrow();

    const metadata: Metadata = { type: 'text' };
    peer.send(JSON.stringify(metadata));

    const chunks = chunkText(text, CHUNK_SIZE);
    const total = text.length || 1;
    let sent = 0;

    for (const chunk of chunks) {
      peer.send(chunk);
      sent += chunk.length;
      onProgress?.((sent / total) * 100);
    }

    peer.send('EOF');
    onProgress?.(100);

    await this.waitForAck();
  }

  async sendFile(file: File, onProgress?: (percent: number) => void) {
    if (!this.peer) {
      await this.connect();
    }
    const peer = this.getPeerOrThrow();

    const metadata: Metadata = {
      type: 'file',
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    };
    peer.send(JSON.stringify(metadata));

    let offset = 0;
    for await (const chunk of chunkFile(file, CHUNK_SIZE)) {
      peer.send(chunk);
      offset += chunk.length;
      onProgress?.((offset / file.size) * 100);
    }

    peer.send('EOF');
    onProgress?.(100);

    await this.waitForAck();
  }

  destroy() {
    this.cleanupSignalHandler?.();
    this.peer?.destroy();
    this.peer = null;
    this.signaling.disconnect();
    this.connectionPromise = null;
  }
}
