import { io, type Socket } from 'socket.io-client';
import type { SignalPayload } from '../types';

export class SignalingClient {
  private socket: Socket | null = null;

  constructor(private url: string, private code: string) {}

  async prewarm(): Promise<void> {
    try {
      await fetch(`${this.url}/health`, { cache: 'no-store' });
    } catch (err) {
      // Best-effort warmup; ignore network errors
    }
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    await new Promise<void>((resolve, reject) => {
      this.socket = io(this.url, {
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        this.socket?.emit('join-room', this.code);
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        reject(err instanceof Error ? err : new Error('Failed to connect to signaling server'));
      });
    });
  }

  onSignal(handler: (payload: SignalPayload) => void) {
    this.socket?.on('signal', (payload: SignalPayload) => handler(payload));
  }

  sendSignal(signal: unknown) {
    this.socket?.emit('signal', { code: this.code, signal });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
