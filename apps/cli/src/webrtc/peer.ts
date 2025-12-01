import EventEmitter from 'events';
import SimplePeer, { SignalData } from 'simple-peer';
import wrtc from '@roamhq/wrtc';
import { ICE_SERVERS } from '@pinq/shared';
import { Metadata } from '../types.js';
import { SignalingClient } from './signaling.js';

interface ReceiverOptions {
  verbose?: boolean;
}

const DEFAULT_WEBRTC_TIMEOUT_MS = 90_000;

export class WebRTCReceiver extends EventEmitter {
  private peer: SimplePeer.Instance | null = null;

  private metadata?: Metadata;

  private metadataResolver?: (meta: Metadata) => void;

  private metadataRejecter?: (err: Error) => void;

  private cleanupSignalListeners: () => void;

  private verbose: boolean;

  private isCleaningUp = false;

  constructor(
    private readonly code: string,
    private readonly signaling: SignalingClient,
    options: ReceiverOptions = {},
  ) {
    super();
    this.verbose = options.verbose ?? false;
    this.cleanupSignalListeners = () => {};

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[CLI] WebRTCReceiver initialized, peer will be created after PWA connects');
    }
  }

  async start(timeoutMs = DEFAULT_WEBRTC_TIMEOUT_MS) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[CLI] Waiting for PWA to join room...');
    }
    await this.waitForPeerJoined(timeoutMs);

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[CLI] PWA joined, creating WebRTC peer...');
    }
    this.createPeer();

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[CLI] Waiting for offer from PWA...');
    }
    await this.waitForOffer(timeoutMs);

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[CLI] Waiting for WebRTC connection...');
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for peer connection'));
      }, timeoutMs);

      this.peer!.once('connect', () => {
        clearTimeout(timer);
        if (this.verbose) {
          // eslint-disable-next-line no-console
          console.log('[CLI] ✅ WebRTC connected!');
        }
        resolve();
      });

      this.peer!.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private waitForPeerJoined(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('PWA не подключилась к комнате (возможно, сервер не проснулся)'));
      }, timeoutMs);

      const handlePeerJoined = (payload: { peerId: string; code: string }) => {
        if (payload.code !== this.code) return;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.signaling.off('peer-joined', handlePeerJoined);
      };

      this.signaling.on('peer-joined', handlePeerJoined);
    });
  }

  private createPeer() {
    this.peer = new SimplePeer({
      initiator: false,
      trickle: true,
      wrtc,
      config: {
        iceServers: ICE_SERVERS,
      },
      channelConfig: { maxPacketLifeTime: 3000 },
      allowHalfTrickle: true,
    });
    // eslint-disable-next-line no-console
    console.log('[CLI] Creating SimplePeer as receiver');

    this.peer.on('signal', (data: SignalData) => {
      if (this.verbose) {
        // eslint-disable-next-line no-console
        console.log('[CLI] Sending signal:', (data as { type?: string }).type || 'candidate');
      }
      this.signaling.sendSignal(this.code, data);
    });
    this.peer.on('data', (chunk: Buffer) => this.handleData(chunk));
    this.peer.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[CLI] ✅ WebRTC connected!');
    });
    this.peer.on('close', () => {
      // eslint-disable-next-line no-console
      console.log('[CLI] ❌ WebRTC closed');
      this.cleanup();
      this.emit('close');
    });
    this.peer.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[CLI] ❌ Peer error:', err);
      this.cleanup();
      this.emit('error', err);
    });

    if (this.verbose) {
      this.peer.on('iceStateChange', (state: string) => {
        // eslint-disable-next-line no-console
        console.log(`[CLI] ICE state: ${state}`);
      });
    }

    const onSignal = (payload: { signal: SignalData }) => {
      if (this.peer && !this.peer.destroyed && !this.isCleaningUp) {
        this.peer.signal(payload.signal);
      }
    };

    this.signaling.on('signal', onSignal);
    this.cleanupSignalListeners = () => {
      this.signaling.off('signal', onSignal);
    };
  }

  private waitForOffer(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Не получен offer от PWA'));
      }, timeoutMs);

      const handleSignal = (payload: { signal: SignalData }) => {
        const sig = payload.signal as { type?: string };
        if (sig.type === 'offer') {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.signaling.off('signal', handleSignal);
      };

      this.signaling.on('signal', handleSignal);
    });
  }

  waitForMetadata(timeoutMs = 60000) {
    const effectiveTimeout = timeoutMs ?? 60000;

    if (this.metadata) return Promise.resolve(this.metadata);

    return new Promise<Metadata>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for metadata'));
      }, effectiveTimeout);

      this.metadataResolver = (meta) => {
        clearTimeout(timer);
        resolve(meta);
      };

      this.metadataRejecter = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  sendAck() {
    if (this.peer && this.peer.connected) {
      this.peer.send('ACK');
    }
  }

  close() {
    this.cleanup();
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
    this.peer = null;
  }

  private handleData(chunk: Buffer) {
    if (!this.metadata) {
      try {
        const meta = JSON.parse(chunk.toString()) as Metadata;
        this.metadata = meta;
        this.metadataResolver?.(meta);
      } catch (err) {
        this.metadataRejecter?.(new Error('Failed to parse metadata'));
        this.emit('error', err as Error);
      }
      return;
    }

    this.emit('data', chunk);
  }

  private cleanup() {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;
    this.cleanupSignalListeners();
    if (this.peer) {
      this.peer.removeAllListeners();
    }
  }
}
