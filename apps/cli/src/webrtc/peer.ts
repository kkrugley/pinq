import EventEmitter from 'events';
import SimplePeer, { SignalData } from 'simple-peer';
import wrtc from '@roamhq/wrtc';
import { ACK_MARKER, ICE_SERVERS } from '@pinq/shared';
import { Metadata } from '../types.js';
import { SignalingClient } from './signaling.js';

interface ReceiverOptions {
  verbose?: boolean;
}

const DEFAULT_WEBRTC_TIMEOUT_MS = 90_000;
const METADATA_TIMEOUT_MS = 5 * 60 * 1000; // room TTL is 5 minutes

export class WebRTCReceiver extends EventEmitter {
  private peer: SimplePeer.Instance | null = null;

  private metadata?: Metadata;

  private metadataResolver?: (meta: Metadata) => void;

  private metadataRejecter?: (err: Error) => void;

  private cleanupSignalListeners: () => void;

  private verbose: boolean;

  private isCleaningUp = false;

  private intentionalClose = false;

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
        reject(new Error('PWA did not join the room (signaling may still be waking up)'));
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
    this.intentionalClose = false;
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
    this.peer.on('data', (chunk: Buffer | string) => this.handleData(chunk));
    this.peer.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[CLI] ✅ WebRTC connected!');
    });
    this.peer.on('close', () => {
      const message = this.intentionalClose ? '[CLI] WebRTC closed' : '[CLI] ❌ WebRTC closed';
      // eslint-disable-next-line no-console
      console.log(message);
      this.metadataRejecter?.(new Error('WebRTC connection closed'));
      this.resetMetadataState();
      this.cleanup();
      this.emit('close');
    });
    this.peer.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[CLI] ❌ Peer error:', err);
      this.metadataRejecter?.(err);
      this.resetMetadataState();
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
        reject(new Error('Did not receive offer from PWA'));
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

  waitForMetadata(timeoutMs = METADATA_TIMEOUT_MS) {
    const effectiveTimeout = timeoutMs ?? METADATA_TIMEOUT_MS;

    if (this.metadata) return Promise.resolve(this.metadata);

    return new Promise<Metadata>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.metadataResolver = undefined;
        this.metadataRejecter = undefined;
        reject(new Error('Timed out waiting for metadata'));
      }, effectiveTimeout);

      this.metadataResolver = (meta) => {
        clearTimeout(timer);
        this.metadataResolver = undefined;
        this.metadataRejecter = undefined;
        resolve(meta);
      };

      this.metadataRejecter = (err) => {
        clearTimeout(timer);
        this.metadataResolver = undefined;
        this.metadataRejecter = undefined;
        reject(err);
      };
    });
  }

  sendAck() {
    if (this.peer && this.peer.connected) {
      this.peer.send(ACK_MARKER);
      // Also send legacy marker for backward compatibility with older PWA builds
      this.peer.send('ACK');
    }
  }

  close() {
    this.intentionalClose = true;
    this.cleanup();
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
    this.peer = null;
  }

  private handleData(chunk: Buffer | string) {
    if (!this.metadata) {
      try {
        const metaString = typeof chunk === 'string' ? chunk : chunk.toString();
        const meta = JSON.parse(metaString) as Metadata;
        this.metadata = meta;
        this.metadataResolver?.(meta);
        this.metadataResolver = undefined;
        this.metadataRejecter = undefined;
      } catch (err) {
        this.metadataRejecter?.(new Error('Failed to parse metadata'));
        this.metadataResolver = undefined;
        this.metadataRejecter = undefined;
        this.emit('error', err as Error);
      }
      return;
    }

    this.emit('data', chunk);
  }

  private cleanup() {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;
    this.resetMetadataState();
    this.cleanupSignalListeners();
    if (this.peer) {
      this.peer.removeAllListeners();
    }
  }

  private resetMetadataState() {
    this.metadata = undefined;
    this.metadataResolver = undefined;
    this.metadataRejecter = undefined;
  }
}
