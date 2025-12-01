import { io, type Socket } from 'socket.io-client';
import type { SignalPayload } from '../types';

type SignalHandler = (payload: SignalPayload) => void;
type PeerJoinedHandler = (payload: { peerId: string; code: string }) => void;

const DEFAULT_SIGNALING_TIMEOUT_MS = 90_000;
const PREWARM_TIMEOUT_MS = 70_000;

export class SignalingClient {
  private socket: Socket | null = null;

  private readonly code: string;

  private readonly signalHandlers = new Set<SignalHandler>();

  private readonly peerJoinedHandlers = new Set<PeerJoinedHandler>();

  private static ackGuarded = false;

  constructor(private url: string, code: string) {
    SignalingClient.guardSocketAckRegistration();
    this.code = code.trim().toUpperCase();
  }

  private static guardSocketAckRegistration() {
    if (SignalingClient.ackGuarded) return;

    const socketCtor = (io as unknown as { Socket?: { prototype?: unknown } }).Socket;
    const proto = socketCtor?.prototype as {
      _registerAckCallback?: (id: number, ack?: (...args: unknown[]) => void) => void;
    };

    const originalRegisterAck = proto?._registerAckCallback;
    if (!proto || !originalRegisterAck) return;

    proto._registerAckCallback = function registerAckCallbackGuard(
      this: unknown,
      id: number,
      ack?: (...args: unknown[]) => void,
    ) {
      if (typeof ack !== 'function') return;
      return originalRegisterAck.call(this, id, ack);
    };

    SignalingClient.ackGuarded = true;
  }

  async prewarm(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[PWA Signaling] Pre-warming server...');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PREWARM_TIMEOUT_MS);

      const response = await fetch(`${this.url}/health`, {
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timer);

      if (response.ok) {
        // eslint-disable-next-line no-console
        console.log('[PWA Signaling] Server is warm');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[PWA Signaling] Pre-warm failed, server may be cold:', err);
    }
  }

  async connect(timeoutMs = DEFAULT_SIGNALING_TIMEOUT_MS): Promise<void> {
    if (this.socket?.connected) return;

    const effectiveTimeout = timeoutMs ?? DEFAULT_SIGNALING_TIMEOUT_MS;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Failed to connect to signaling (server may be asleep)'));
      }, effectiveTimeout);

      const handleConnect = () => {
        // eslint-disable-next-line no-console
        console.log('[PWA Signaling] Connected, joining room');
        this.socket?.emit('join-room', { code: this.code, role: 'creator' });
      };

      const handleJoined = (payload: { code: string }) => {
        if (payload.code !== this.code) return;
        // eslint-disable-next-line no-console
        console.log('[PWA Signaling] Room joined');
        cleanup();
        resolve();
      };

      const handleRoomFull = () => {
        cleanup();
        reject(new Error('Room is already occupied by another device'));
      };

      const handleRoomExpired = (payload: { code: string }) => {
        if (payload.code !== this.code) return;
        cleanup();
        reject(new Error('Code expired. Reset the code and try again.'));
      };

      const handleRoomNotFound = () => {
        cleanup();
        reject(new Error('Room not found. Try a new code.'));
      };

      const handleConnectError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error('Failed to connect to signaling server'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        // eslint-disable-next-line no-console
        console.log('[PWA Signaling] Cleanup - removing listeners');
        this.socket?.off('connect', handleConnect);
        this.socket?.off('connect_error', handleConnectError);
        this.socket?.off('room-joined', handleJoined);
        this.socket?.off('room-full', handleRoomFull);
        this.socket?.off('room-expired', handleRoomExpired);
        this.socket?.off('room-not-found', handleRoomNotFound);
      };

      this.socket = io(this.url, {
        transports: ['polling', 'websocket'],
        upgrade: true,
        forceNew: true,
        timeout: effectiveTimeout,
        reconnectionAttempts: 5,
      });

      // socket.io-client has an internal ack timeout helper that assumes the
      // callback is always a function. In practice we occasionally see
      // `_registerAckCallback` invoked with an undefined ack (for example after
      // a reconnect race), which leads to a runtime "t.call is undefined" error
      // in the bundled PWA. Guard the method so it no-ops when the ack is
      // missing instead of crashing the UI.
      const socketWithAck = this.socket as unknown as {
        _registerAckCallback?: (id: number, ack?: (...args: unknown[]) => void) => void;
      };
      const originalRegisterAck = socketWithAck._registerAckCallback?.bind(socketWithAck);
      if (originalRegisterAck) {
        socketWithAck._registerAckCallback = (id: number, ack?: (...args: unknown[]) => void) => {
          if (typeof ack !== 'function') return;
          originalRegisterAck(id, ack);
        };
      }

      this.socket.on('connect', handleConnect);
      this.socket.on('connect_error', handleConnectError);
      this.socket.on('room-joined', handleJoined);
      this.socket.on('room-full', handleRoomFull);
      this.socket.on('room-expired', handleRoomExpired);
      this.socket.on('room-not-found', handleRoomNotFound);

      this.socket.on('signal', (payload: SignalPayload) => {
        this.signalHandlers.forEach((handler) => handler(payload));
      });

      this.socket.on('peer-joined', (payload: { peerId: string; code: string }) => {
        this.peerJoinedHandlers.forEach((handler) => handler(payload));
      });
    });
  }

  onSignal(handler: SignalHandler) {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
  }

  onPeerJoined(handler: PeerJoinedHandler) {
    this.peerJoinedHandlers.add(handler);
    return () => this.peerJoinedHandlers.delete(handler);
  }

  sendSignal(signal: unknown) {
    this.socket?.emit('signal', { code: this.code, signal });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.signalHandlers.clear();
  }
}
