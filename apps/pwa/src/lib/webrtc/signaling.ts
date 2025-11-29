import { io, type Socket } from 'socket.io-client';
import type { SignalPayload } from '../types';

type SignalHandler = (payload: SignalPayload) => void;

export class SignalingClient {
  private socket: Socket | null = null;
  private readonly code: string;
  private readonly signalHandlers = new Set<SignalHandler>();

  constructor(private url: string, code: string) {
    this.code = code.trim().toUpperCase();
  }

  async prewarm(): Promise<void> {
    try {
      await fetch(`${this.url}/health`, { cache: 'no-store' });
    } catch (err) {
      // Best-effort warmup; ignore network errors
    }
  }

  async connect(timeoutMs = 30000): Promise<void> {
    if (this.socket?.connected) return;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Не удалось подключиться к серверу сигналинга'));
      }, timeoutMs);

      const handleConnect = () => {
        this.socket?.emit('join-room', { code: this.code, role: 'creator' });
      };

      const handleJoined = (payload: { code: string }) => {
        if (payload.code !== this.code) return;
        cleanup();
        resolve();
      };

      const handleRoomFull = () => {
        cleanup();
        reject(new Error('Комната уже занята другим устройством'));
      };

      const handleRoomExpired = (payload: { code: string }) => {
        if (payload.code !== this.code) return;
        cleanup();
        reject(new Error('Срок действия кода истёк. Сбросьте код и попробуйте снова.'));
      };

      const handleRoomNotFound = () => {
        cleanup();
        reject(new Error('Комната не найдена. Попробуйте с новым кодом.'));
      };

      const handleConnectError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error('Не удалось подключиться к серверу сигналинга'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket?.off('connect', handleConnect);
        this.socket?.off('connect_error', handleConnectError);
        this.socket?.off('room-joined', handleJoined);
        this.socket?.off('room-full', handleRoomFull);
        this.socket?.off('room-expired', handleRoomExpired);
      this.socket?.off('room-not-found', handleRoomNotFound);
      };

      this.socket = io(this.url, {
        transports: ['polling', 'websocket'], // start with polling to survive CF/Render websocket quirks
        upgrade: true,
        forceNew: true,
      });

      this.socket.on('connect', handleConnect);
      this.socket.on('connect_error', handleConnectError);
      this.socket.on('room-joined', handleJoined);
      this.socket.on('room-full', handleRoomFull);
      this.socket.on('room-expired', handleRoomExpired);
      this.socket.on('room-not-found', handleRoomNotFound);
      this.socket.on('signal', (payload: SignalPayload) => {
        this.signalHandlers.forEach((handler) => handler(payload));
      });
    });
  }

  onSignal(handler: SignalHandler) {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
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
