const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
