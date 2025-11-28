import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { JoinRoomPayload, RoomState, SignalPayload } from './types.js';

dotenv.config();

const ROOM_TTL_MS = 5 * 60 * 1000;

export interface SignalingServerOptions {
  port?: number;
  allowedOrigin?: string;
}

function parseAllowedOrigins(raw?: string | string[]) {
  if (!raw) return '*';
  if (Array.isArray(raw)) return raw;
  if (raw.trim() === '*') return '*';
  const parts = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts : '*';
}

export function createSignalingServer(options: SignalingServerOptions = {}) {
  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigin || process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '*',
  );

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  const rooms = new Map<string, RoomState>();

  const clearRoom = (code: string) => {
    const state = rooms.get(code);
    if (state) {
      clearTimeout(state.timer);
      rooms.delete(code);
    }
  };

  const scheduleRoomExpiry = (code: string) => {
    const existing = rooms.get(code);
    if (!existing) return;
    clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const state = rooms.get(code);
      if (!state) return;
      io.to(code).emit('room-expired', { code });
      io.in(code).socketsLeave(code);
      clearRoom(code);
    }, ROOM_TTL_MS);

    existing.timer = timer;
  };

  const handleJoin = (socket: Socket, payload: JoinRoomPayload) => {
    const code = payload.code?.trim().toUpperCase();
    if (!code) {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    const state = rooms.get(code);
    if (state && state.sockets.size >= 2) {
      socket.emit('room-full', { code });
      return;
    }

    if (!state) {
      const timer = setTimeout(() => clearRoom(code), ROOM_TTL_MS);
      rooms.set(code, { code, sockets: new Set([socket.id]), timer });
    } else {
      state.sockets.add(socket.id);
    }

    socket.join(code);
    scheduleRoomExpiry(code);
    socket.emit('room-joined', { code });
    socket.to(code).emit('peer-joined', { peerId: socket.id, code });
  };

  const handleSignal = (socket: Socket, payload: SignalPayload) => {
    const code = payload.code?.trim().toUpperCase();
    if (!code || !rooms.has(code)) {
      socket.emit('room-not-found', { code });
      return;
    }

    socket.to(code).emit('signal', { signal: payload.signal, from: socket.id });
    scheduleRoomExpiry(code);
  };

  const handleDisconnect = (socket: Socket) => {
    for (const [code, state] of rooms.entries()) {
      if (!state.sockets.has(socket.id)) continue;
      state.sockets.delete(socket.id);
      socket.to(code).emit('peer-disconnected', { peerId: socket.id, code });

      if (state.sockets.size === 0) {
        clearRoom(code);
      } else {
        scheduleRoomExpiry(code);
      }
    }
  };

  io.on('connection', (socket) => {
    socket.on('join-room', (payload: JoinRoomPayload) => handleJoin(socket, payload));
    socket.on('signal', (payload: SignalPayload) => handleSignal(socket, payload));
    socket.on('disconnect', () => handleDisconnect(socket));
  });

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const port = options.port || Number(process.env.PORT) || 3000;

  return {
    io,
    app,
    server,
    start() {
      server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`[signaling] listening on port ${port}`);
      });
      return server;
    },
  };
}
