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

export type ReceivedPayload =
  | { type: 'text'; text: string; metadata: Metadata }
  | { type: 'file'; blob: Blob; metadata: Metadata };
