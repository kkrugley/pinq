export const CHUNK_SIZE = 16 * 1024;

export function chunkText(text: string, chunkSize = CHUNK_SIZE): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize));
  }

  return chunks;
}

export async function* chunkFile(file: File, chunkSize = CHUNK_SIZE): AsyncGenerator<Uint8Array, void, void> {
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    yield new Uint8Array(buffer);
    offset += chunkSize;
  }
}
