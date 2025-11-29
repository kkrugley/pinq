export interface JoinRoomPayload {
  code: string;
  role?: 'creator' | 'guest';
}

export interface SignalPayload {
  code: string;
  signal: unknown;
}

export interface RoomState {
  code: string;
  sockets: Set<string>;
  timer: NodeJS.Timeout;
}
