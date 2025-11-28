export interface Metadata {
  type: 'text' | 'file';
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface ReceiveOptions {
  path?: string;
  confirm?: boolean;
  verbose?: boolean;
}
