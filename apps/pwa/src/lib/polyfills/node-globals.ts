import { Buffer as NodeBuffer } from 'buffer';

type ProcessPolyfill = {
  env: Record<string, string>;
  version: string;
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void;
};

const ensureProcess = () => {
  if (typeof globalThis.process !== 'undefined') return globalThis.process as ProcessPolyfill;

  const processPolyfill: ProcessPolyfill = {
    env: {},
    version: '',
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
      queueMicrotask(() => callback(...args)),
  };

  Reflect.set(globalThis, 'process', processPolyfill);
  return processPolyfill;
};

const ensureBuffer = () => {
  if (typeof globalThis.Buffer !== 'undefined') return globalThis.Buffer;

  (globalThis as typeof globalThis & { Buffer: typeof NodeBuffer }).Buffer = NodeBuffer;
  return NodeBuffer;
};

const ensureGlobal = () => {
  if (typeof globalThis.global === 'undefined') {
    (globalThis as typeof globalThis & { global: typeof globalThis }).global = globalThis;
  }
};

ensureGlobal();
ensureProcess();
ensureBuffer();

export {};
