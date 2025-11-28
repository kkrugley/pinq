const FALLBACK_URL = 'https://pinq.onrender.com';

export const SIGNALING_URL =
  (import.meta.env.VITE_SIGNALING_URL as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:3000' : FALLBACK_URL);
