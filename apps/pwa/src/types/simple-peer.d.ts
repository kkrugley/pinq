declare module 'simple-peer' {
  export type SignalData = unknown;

  export interface SimplePeerOptions {
    initiator?: boolean;
    trickle?: boolean;
    wrtc?: unknown;
    config?: RTCConfiguration;
    channelConfig?: RTCDataChannelInit;
    allowHalfTrickle?: boolean;
  }

  export interface Instance {
    connected: boolean;
    signal(data: SignalData): void;
    send(data: any): void;
    destroy(err?: Error): void;
    on(event: 'signal', cb: (data: SignalData) => void): this;
    on(event: 'connect', cb: () => void): this;
    on(event: 'data', cb: (chunk: any) => void): this;
    on(event: 'close', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
    once(event: 'signal', cb: (data: SignalData) => void): this;
    once(event: 'connect', cb: () => void): this;
    once(event: 'data', cb: (chunk: any) => void): this;
    once(event: 'close', cb: () => void): this;
    once(event: 'error', cb: (err: Error) => void): this;
    off(event: string, cb: (...args: any[]) => void): this;
  }

  export default class SimplePeer implements Instance {
    connected: boolean;
    constructor(opts?: SimplePeerOptions);
    static readonly WEBRTC_SUPPORT: boolean;
    signal(data: SignalData): void;
    send(data: any): void;
    destroy(err?: Error): void;
    on(event: 'signal', cb: (data: SignalData) => void): this;
    on(event: 'connect', cb: () => void): this;
    on(event: 'data', cb: (chunk: any) => void): this;
    on(event: 'close', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
    once(event: 'signal', cb: (data: SignalData) => void): this;
    once(event: 'connect', cb: () => void): this;
    once(event: 'data', cb: (chunk: any) => void): this;
    once(event: 'close', cb: () => void): this;
    once(event: 'error', cb: (err: Error) => void): this;
    off(event: string, cb: (...args: any[]) => void): this;
  }

  export namespace SimplePeer {
    export type Instance = import('simple-peer').Instance;
  }

  export { SimplePeerOptions, Instance as SimplePeerInstance };
}
