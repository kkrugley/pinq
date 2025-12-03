import SimplePeer, { type SignalData, type SimplePeerInstance } from 'simple-peer';
import { ACK_MARKER, EOF_MARKER, ICE_SERVERS } from '@pinq/shared';
import type { Metadata, ReceivedPayload } from '../types';
import { chunkFile, chunkText, CHUNK_SIZE } from '../utils/fileChunker';
import { SignalingClient } from './signaling';

const CONNECT_TIMEOUT_MS = 120_000;
const ACK_TIMEOUT_MS = 45_000; // allow extra time for large files before considering it a failure
const ACK_LINGER_MS = 800;
const METADATA_TIMEOUT_MS = 5 * 60 * 1000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const EOF_BYTES = textEncoder.encode(EOF_MARKER);
const LEGACY_EOF_BYTES = textEncoder.encode('EOF');

const DEFAULT_RECEIVE_TIMEOUT_MS = 90_000;

function toUint8Array(chunk: Uint8Array | string) {
  return typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk;
}

function isMarkerChunk(chunk: Uint8Array | string, marker: string, markerBytes: Uint8Array) {
  if (typeof chunk === 'string') return chunk === marker;
  const data = toUint8Array(chunk);
  if (data.byteLength !== markerBytes.byteLength) return false;
  for (let i = 0; i < markerBytes.byteLength; i += 1) {
    if (data[i] !== markerBytes[i]) return false;
  }
  return true;
}

function isEofChunk(chunk: Uint8Array | string) {
  return isMarkerChunk(chunk, EOF_MARKER, EOF_BYTES) || isMarkerChunk(chunk, 'EOF', LEGACY_EOF_BYTES);
}

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
      throw new Error('WebRTC is not supported in this browser');
    }

    const peer = new SimplePeer({
      initiator: true,
      trickle: true,
      allowHalfTrickle: true,
      wrtc: undefined,
      config: {
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 16,
      },
      channelConfig: { maxPacketLifeTime: 3000 },
    });
    // eslint-disable-next-line no-console
    console.log('[PWA] Creating SimplePeer as initiator');

    this.attachSignalHandler(peer);
    peer.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ✅ WebRTC connected!');
    });
    peer.on('iceStateChange', (state: string) => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ICE state (sender):', state);
    });
    peer.on('close', () => {
      this.cleanupSignalHandler?.();
      this.cleanupSignalHandler = null;
      // eslint-disable-next-line no-console
      console.log('[PWA] ❌ WebRTC closed');
    });
    peer.on('error', (err: Error) => {
      this.cleanupSignalHandler?.();
      this.cleanupSignalHandler = null;
      // eslint-disable-next-line no-console
      console.error('[PWA] ❌ Peer error:', err);
    });
    this.peer = peer;
    return peer;
  }

  private attachSignalHandler(peer: SimplePeerInstance) {
    this.cleanupSignalHandler?.();

    const peerWithState = peer as SimplePeerInstance & { destroyed?: boolean };

    const handleInboundSignal = (payload: { signal: SignalData }) => {
      if (peerWithState.destroyed) return;
      try {
        peerWithState.signal(payload.signal);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PWA] Ignoring signal on destroyed peer', err);
      }
    };

    const handleOutboundSignal = (data: SignalData) => {
      if (peerWithState.destroyed) return;
      // eslint-disable-next-line no-console
      console.log('[PWA] Sending signal:', (data as { type?: string }).type || 'candidate');
      this.signaling.sendSignal(data);
    };

    peerWithState.on('signal', handleOutboundSignal);
    const cleanupInbound = this.signaling.onSignal(handleInboundSignal);
    this.cleanupSignalHandler = () => {
      cleanupInbound?.();
      peerWithState.off?.('signal', handleOutboundSignal);
    };
  }

  async connect(onStatus?: (status: string) => void, timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        onStatus?.('Warming up signaling...');
        await this.signaling.prewarm();

        onStatus?.('Connecting to signaling...');
        await this.signaling.connect({ timeoutMs });
        // eslint-disable-next-line no-console
        console.log('[PWA] Joined room with code:', this.code);

        onStatus?.('Creating WebRTC connection...');
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
              reject(new Error('Desktop did not connect in time'));
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
              reject(new Error('Connection closed before it was established'));
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
          onStatus?.('Waiting for desktop...');
        });
      })();
    }

    return this.connectionPromise;
  }

  private getPeerOrThrow() {
    if (!this.peer) {
      throw new Error('Connection to desktop is not established');
    }
    return this.peer;
  }

  private waitForAck(timeoutMs = ACK_TIMEOUT_MS) {
    const peer = this.getPeerOrThrow();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for desktop confirmation'));
      }, timeoutMs);

      const handleData = (data: Uint8Array | string) => {
        const payload = typeof data === 'string' ? data : new TextDecoder().decode(data);
        if (payload === ACK_MARKER || payload === 'ACK') {
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
        reject(new Error('Connection closed before confirmation'));
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
    const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0) || 1;
    let sent = 0;

    for (const chunk of chunks) {
      peer.send(chunk);
      sent += chunk.length;
      onProgress?.((sent / total) * 100);
    }

    peer.send(EOF_MARKER);
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

    peer.send(EOF_MARKER);
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

export class WebRTCReceiver {
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
      throw new Error('WebRTC is not supported in this browser');
    }

    this.cleanupSignalHandler?.();

    const peer = new SimplePeer({
      initiator: false,
      trickle: true,
      wrtc: undefined,
      config: {
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 16,
      },
      allowHalfTrickle: true,
      channelConfig: { maxPacketLifeTime: 3000 },
    });
    // eslint-disable-next-line no-console
    console.log('[PWA] Creating SimplePeer as receiver');

    const peerWithState = peer as SimplePeerInstance & { destroyed?: boolean };

    const handleOutboundSignal = (data: SignalData) => {
      if (peerWithState.destroyed) return;
      // eslint-disable-next-line no-console
      console.log('[PWA] Sending signal:', (data as { type?: string }).type || 'candidate');
      this.signaling.sendSignal(data);
    };

    const handleInboundSignal = (payload: { signal: SignalData }) => {
      if (peerWithState.destroyed) return;
      try {
        peerWithState.signal(payload.signal);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PWA] Ignoring signal on destroyed peer', err);
      }
    };

    peerWithState.on('signal', handleOutboundSignal);
    const cleanupInbound = this.signaling.onSignal(handleInboundSignal);
    this.cleanupSignalHandler = () => {
      cleanupInbound?.();
      peerWithState.off?.('signal', handleOutboundSignal);
    };

    peer.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ✅ WebRTC connected (receiver)');
    });
    peer.on('iceStateChange', (state: string) => {
      // eslint-disable-next-line no-console
      console.log('[PWA] ICE state (receiver):', state);
    });
    peer.on('close', () => {
      // eslint-disable-next-line no-console
      console.log('[PWA] WebRTC closed');
      this.cleanupSignalHandler?.();
    });
    peer.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[PWA] ❌ Peer error:', err);
      this.cleanupSignalHandler?.();
    });

    this.peer = peer;
    return peer;
  }

  private waitForPeerJoined(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanupPeerJoinedHandler?.();
        this.cleanupPeerJoinedHandler = null;
        reject(new Error('Sender did not join in time'));
      }, timeoutMs);

      const handlePeerJoined = (payload: { peerId: string; code: string }) => {
        if (payload.code !== this.code) return;
        clearTimeout(timer);
        this.cleanupPeerJoinedHandler?.();
        this.cleanupPeerJoinedHandler = null;
        resolve();
      };

      this.cleanupPeerJoinedHandler = this.signaling.onPeerJoined(handlePeerJoined);
    });
  }

  private waitForOffer(timeoutMs: number) {
    return new Promise<{ offer: SignalData; candidates: SignalData[] }>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Did not receive offer from sender'));
      }, timeoutMs);

      let cleanupSignalWatcher: (() => void) | undefined;
      const candidates: SignalData[] = [];

      const handleSignal = (payload: { signal: SignalData }) => {
        const sig = payload.signal as { type?: string };
        if (sig?.type === 'offer') {
          cleanup();
          resolve({ offer: payload.signal, candidates: [...candidates] });
          return;
        }
        candidates.push(payload.signal);
      };

      const cleanup = () => {
        clearTimeout(timer);
        cleanupSignalWatcher?.();
      };

      cleanupSignalWatcher = this.signaling.onSignal(handleSignal);
    });
  }

  private waitForConnection(timeoutMs: number) {
    const peer = this.getPeerOrThrow();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for WebRTC connection'));
      }, timeoutMs);

      const handleConnect = () => {
        cleanup();
        resolve();
      };

      const handleError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        cleanup();
        reject(new Error('Connection closed before it was established'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        peer.off?.('connect', handleConnect);
        peer.off?.('error', handleError);
        peer.off?.('close', handleClose);
      };

      peer.once('connect', handleConnect);
      peer.once('error', handleError);
      peer.once('close', handleClose);
    });
  }

  private getPeerOrThrow() {
    if (!this.peer) {
      throw new Error('Connection is not established');
    }
    return this.peer;
  }

  async connect(onStatus?: (status: string) => void, timeoutMs = DEFAULT_RECEIVE_TIMEOUT_MS) {
    if (!this.connectionPromise) {
      this.connectionPromise = (async () => {
        onStatus?.('Warming up signaling...');
        await this.signaling.prewarm();

        onStatus?.('Connecting to signaling...');
        await this.signaling.connect({ timeoutMs, role: 'guest' });
        // eslint-disable-next-line no-console
        console.log('[PWA] Joined room as guest with code:', this.code);

        onStatus?.('Waiting for sender to join...');
        void this.waitForPeerJoined(timeoutMs)
          .then(() => onStatus?.('Sender connected. Preparing transfer...'))
          .catch(() => {});

        onStatus?.('Waiting for offer...');
        const { offer, candidates } = await this.waitForOffer(timeoutMs);

        onStatus?.('Creating WebRTC connection...');
        this.createPeer();

        const peer = this.getPeerOrThrow();
        peer.signal(offer);
        candidates.forEach((candidate) => peer.signal(candidate));

        onStatus?.('Negotiating connection...');
        await this.waitForConnection(timeoutMs);

        onStatus?.('Connected. Waiting for data...');
      })().catch((err) => {
        this.connectionPromise = null;
        this.destroy();
        throw err;
      });
    }

    return this.connectionPromise;
  }

  private waitForMetadata(timeoutMs = METADATA_TIMEOUT_MS) {
    const peer = this.getPeerOrThrow();
    return new Promise<Metadata>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for metadata'));
      }, timeoutMs);

      const handleData = (chunk: Uint8Array | string) => {
        try {
          const raw = typeof chunk === 'string' ? chunk : textDecoder.decode(chunk);
          const metadata = JSON.parse(raw) as Metadata;
          cleanup();
          resolve(metadata);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error('Failed to parse metadata'));
        }
      };

      const handleError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        cleanup();
        reject(new Error('Connection closed before metadata was received'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        peer.off?.('data', handleData);
        peer.off?.('error', handleError);
        peer.off?.('close', handleClose);
      };

      peer.once('data', handleData);
      peer.once('error', handleError);
      peer.once('close', handleClose);
    });
  }

  private sendAck() {
    if (this.peer && this.peer.connected) {
      this.peer.send(ACK_MARKER);
      this.peer.send('ACK');
    }
  }

  private async receiveText(onProgress?: (percent: number) => void) {
    const peer = this.getPeerOrThrow();
    return new Promise<string>((resolve, reject) => {
      let text = '';
      let finished = false;

      const cleanup = () => {
        peer.off?.('data', handleData);
        peer.off?.('error', handleError);
        peer.off?.('close', handleClose);
      };

      const finalize = () => {
        if (finished) return;
        finished = true;
        cleanup();
        this.sendAck();
        onProgress?.(100);
        setTimeout(() => resolve(text), ACK_LINGER_MS);
      };

      const handleData = (chunk: Uint8Array | string) => {
        if (isEofChunk(chunk)) {
          finalize();
          return;
        }
        const content = typeof chunk === 'string' ? chunk : textDecoder.decode(chunk);
        text += content;
      };

      const handleError = (err: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Connection closed before transfer completed'));
      };

      peer.on('data', handleData);
      peer.once('error', handleError);
      peer.once('close', handleClose);
    });
  }

  private async receiveFile(metadata: Metadata, onProgress?: (percent: number) => void) {
    const peer = this.getPeerOrThrow();
    const chunks: Uint8Array[] = [];
    const total = metadata.size ?? 0;
    let received = 0;

    return new Promise<Blob>((resolve, reject) => {
      let finished = false;

      const cleanup = () => {
        peer.off?.('data', handleData);
        peer.off?.('error', handleError);
        peer.off?.('close', handleClose);
      };

      const finalize = () => {
        if (finished) return;
        finished = true;
        cleanup();
        this.sendAck();
        onProgress?.(100);
        const parts: ArrayBuffer[] = chunks.map((chunk) => {
          const start = chunk.byteOffset;
          const end = chunk.byteOffset + chunk.byteLength;
          const source = chunk.buffer;
          return source instanceof ArrayBuffer ? source.slice(start, end) : chunk.slice().buffer;
        });
        const blob = new Blob(parts, { type: metadata.mimeType || 'application/octet-stream' });
        setTimeout(() => resolve(blob), ACK_LINGER_MS);
      };

      const handleError = (err: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Connection closed before transfer completed'));
      };

      const handleData = (chunk: Uint8Array | string) => {
        if (isEofChunk(chunk)) {
          finalize();
          return;
        }

        const buffer = toUint8Array(chunk);
        chunks.push(buffer);
        received += buffer.byteLength;

        if (total > 0) {
          onProgress?.((received / total) * 100);
        }
      };

      peer.on('data', handleData);
      peer.once('error', handleError);
      peer.once('close', handleClose);
    });
  }

  async receive(
    options: {
      onProgress?: (percent: number) => void;
      onStatus?: (status: string) => void;
      onMetadata?: (metadata: Metadata) => void;
    } = {},
  ) {
    const { onProgress, onStatus, onMetadata } = options;
    await this.connect(onStatus);
    const metadata = await this.waitForMetadata();
    onMetadata?.(metadata);

    if (metadata.type === 'text') {
      onStatus?.('Receiving text...');
      const text = await this.receiveText(onProgress);
      return { type: 'text', text, metadata } as ReceivedPayload;
    }

    onStatus?.(`Receiving ${metadata.filename || 'file'}...`);
    const blob = await this.receiveFile(metadata, onProgress);
    return { type: 'file', blob, metadata } as ReceivedPayload;
  }

  destroy() {
    this.cleanupSignalHandler?.();
    this.cleanupSignalHandler = null;
    this.cleanupPeerJoinedHandler?.();
    this.cleanupPeerJoinedHandler = null;
    this.peer?.destroy();
    this.peer = null;
    this.signaling.disconnect();
    this.connectionPromise = null;
  }
}
