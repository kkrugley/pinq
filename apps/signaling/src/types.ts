export interface JoinRoomPayload {
  code: string;
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
