import SimplePeer, { type SignalData, type SimplePeerInstance } from 'simple-peer';
import { ICE_SERVERS } from '@pinq/shared';
import type { Metadata } from '../types';
import { chunkFile, chunkText, CHUNK_SIZE } from '../utils/fileChunker';
import { SignalingClient } from './signaling';

export class WebRTCSender {
  private peer: SimplePeerInstance | null = null;

  private signaling: SignalingClient;

  private connectionPromise: Promise<void> | null = null;

  private cleanupSignalHandler: (() => void) | null = null;

  private cleanupPeerJoinedHandler: (() => void) | null = null;

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
        iceServers: ICE_SERVERS,
      },
    });
    // eslint-disable-next-line no-console
    console.log('[PWA] Creating SimplePeer as initiator');

    this.attachSignalHandler(peer);
    peer.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ✅ WebRTC connected!');
    });
    peer.on('close', () => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ❌ WebRTC closed');
    });
    peer.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[PWA] ❌ Peer error:', err);
    });
    this.peer = peer;
    return peer;
  }

  private attachSignalHandler(peer: SimplePeerInstance) {
    this.cleanupSignalHandler?.();
    this.cleanupSignalHandler = this.signaling.onSignal((payload) => peer.signal(payload.signal));

    peer.on('signal', (data: SignalData) => {
      // eslint-disable-next-line no-console
      console.log('[PWA] Sending signal:', (data as { type?: string }).type || 'candidate');
      this.signaling.sendSignal(data);
    });
  }

  async connect(onStatus?: (status: string) => void, timeoutMs = 60000): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        onStatus?.('Пробуждение сервера...');
        await this.signaling.prewarm();

        onStatus?.('Подключение к серверу...');
        await this.signaling.connect();
        // eslint-disable-next-line no-console
        console.log('[PWA] Joined room with code:', this.code);

        onStatus?.('Создание WebRTC соединения...');
        await new Promise<void>((resolve, reject) => {
          let peer: SimplePeerInstance;
          let cleanupConnection: (() => void) | null = null;

          const cleanupAll = () => {
            cleanupConnection?.();
            this.cleanupPeerJoinedHandler?.();
            this.cleanupPeerJoinedHandler = null;
          };

          const startConnectionAttempt = () => {
            cleanupConnection?.();
            this.peer?.destroy();
            peer = this.createPeer();

            const timer = setTimeout(() => {
              cleanupAll();
              reject(new Error('Не удалось дождаться подключения компьютера'));
            }, timeoutMs);

            const handleConnect = () => {
              cleanupAll();
              resolve();
            };

            const handleError = (err: Error) => {
              cleanupAll();
              reject(err);
            };

            const handleClose = () => {
              cleanupAll();
              reject(new Error('Соединение закрыто до установления'));
            };

            cleanupConnection = () => {
              clearTimeout(timer);
              peer.off?.('connect', handleConnect);
              peer.off?.('error', handleError);
              peer.off?.('close', handleClose);
            };

            peer.once('connect', handleConnect);
            peer.once('error', handleError);
            peer.once('close', handleClose);
          };

          this.cleanupPeerJoinedHandler = this.signaling.onPeerJoined(() => {
            if (this.peer?.connected) return;
            startConnectionAttempt();
          });

          startConnectionAttempt();
          onStatus?.('Ожидание компьютера...');
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
        peer.off?.('data', handleData);
        peer.off?.('error', handleError);
        peer.off?.('close', handleClose);
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
    this.cleanupPeerJoinedHandler?.();
    this.peer?.destroy();
    this.peer = null;
    this.signaling.disconnect();
    this.connectionPromise = null;
  }
}
