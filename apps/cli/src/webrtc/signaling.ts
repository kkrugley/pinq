import EventEmitter from 'events';
import { io, Socket } from 'socket.io-client';

interface SignalingOptions {
  verbose?: boolean;
}

export class SignalingClient extends EventEmitter {
  private socket: Socket;
  private verbose?: boolean;

  constructor(private readonly url: string, options: SignalingOptions = {}) {
    super();
    this.verbose = options.verbose;
    this.socket = io(this.url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      autoConnect: false,
    });

    this.socket.on('signal', (payload) => this.emit('signal', payload));
    this.socket.on('peer-joined', (payload) => this.emit('peer-joined', payload));
    this.socket.on('peer-disconnected', (payload) => this.emit('peer-disconnected', payload));
    this.socket.on('room-expired', (payload) => this.emit('room-expired', payload));
  }

  async connect(timeoutMs = 30000) {
    if (this.socket.connected) return;

    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out connecting to signaling server'));
      }, timeoutMs);

      this.socket.once('connect', () => {
        clearTimeout(timer);
        if (this.verbose) {
          // eslint-disable-next-line no-console
          console.log(`[signaling] connected to ${this.url}`);
        }
        resolve();
      });

      this.socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.socket.connect();
    return connectionPromise;
  }

  async join(code: string, timeoutMs = 30000) {
    const normalized = code.trim().toUpperCase();
    await this.connect(timeoutMs);

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out joining room'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('room-joined', onJoined);
        this.socket.off('room-full', onRoomFull);
        this.socket.off('room-not-found', onRoomNotFound);
        this.socket.off('room-expired', onExpired);
      };

      const onJoined = (payload: { code: string }) => {
        if (payload.code !== normalized) return;
        cleanup();
        resolve();
      };

      const onRoomFull = () => {
        cleanup();
        reject(new Error('Room is full'));
      };

      const onRoomNotFound = () => {
        cleanup();
        reject(new Error('Room not found'));
      };

      const onExpired = (payload: { code: string }) => {
        if (payload.code !== normalized) return;
        cleanup();
        reject(new Error('Room expired'));
      };

      this.socket.on('room-joined', onJoined);
      this.socket.on('room-full', onRoomFull);
      this.socket.on('room-not-found', onRoomNotFound);
      this.socket.on('room-expired', onExpired);
      this.socket.emit('join-room', { code: normalized });
    });
  }

  sendSignal(code: string, signal: unknown) {
    this.socket.emit('signal', { code, signal });
  }

  disconnect() {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('[signaling] disconnect');
    }
    this.socket.disconnect();
  }
}
