import fs from 'fs';
import path from 'path';
import os from 'os';

export function resolveDownloadPath(customPath?: string) {
  if (customPath) return path.resolve(customPath);
  const downloads = path.join(os.homedir(), 'Downloads');
  return downloads;
}

export function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createWriteStream(dir: string, filename: string) {
  ensureDirExists(dir);
  const filepath = path.join(dir, filename);
  return { filepath, stream: fs.createWriteStream(filepath) };
}
