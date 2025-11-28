import EventEmitter from 'events';
import SimplePeer, { SignalData } from 'simple-peer';
import wrtc from 'wrtc';
import { Metadata } from '../types.js';
import { SignalingClient } from './signaling.js';

interface ReceiverOptions {
  verbose?: boolean;
}

export class WebRTCReceiver extends EventEmitter {
  private peer: SimplePeer.Instance;
  private metadata?: Metadata;
  private metadataResolver?: (meta: Metadata) => void;
  private metadataRejecter?: (err: Error) => void;
  private readonly cleanupSignalListeners: () => void;

  constructor(
    private readonly code: string,
    private readonly signaling: SignalingClient,
    options: ReceiverOptions = {},
  ) {
    super();
    this.peer = new SimplePeer({
      initiator: false,
      trickle: true,
      wrtc,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
        ],
      },
      channelConfig: { maxPacketLifeTime: 3000 },
      allowHalfTrickle: true,
    });

    this.peer.on('signal', (data: SignalData) => this.signaling.sendSignal(this.code, data));
    this.peer.on('data', (chunk: Buffer) => this.handleData(chunk));
    this.peer.on('error', (err) => this.emit('error', err));
    this.peer.on('close', () => this.emit('close'));

    const onSignal = (payload: { signal: SignalData }) => {
      this.peer.signal(payload.signal);
    };

    this.signaling.on('signal', onSignal);
    this.cleanupSignalListeners = () => {
      this.signaling.off('signal', onSignal);
    };

    if (options.verbose) {
      this.peer.on('connect', () => {
        // eslint-disable-next-line no-console
        console.log('[webrtc] data channel open');
      });
      this.peer.on('iceStateChange', (state) => {
        // eslint-disable-next-line no-console
        console.log(`[webrtc] ICE state: ${state}`);
      });
    }
  }

  async start(timeoutMs = 15000) {
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for peer connection'));
      }, timeoutMs);

      this.peer.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });

      this.peer.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    return ready;
  }

  waitForMetadata(timeoutMs = 15000) {
    if (this.metadata) return Promise.resolve(this.metadata);

    return new Promise<Metadata>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for metadata'));
      }, timeoutMs);

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
    if (this.peer.connected) {
      this.peer.send('ACK');
    }
  }

  close() {
    this.cleanupSignalListeners();
    this.peer.destroy();
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
}
