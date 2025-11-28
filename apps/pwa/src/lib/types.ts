export interface Metadata {
  type: 'text' | 'file';
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface SignalPayload {
  code: string;
  signal: unknown;
}
