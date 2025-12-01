export type Listener = (...args: unknown[]) => void;

type EventKey = string | symbol;
type EventsStore = Map<EventKey, Set<Listener>>;

type EventEmitterInstance = {
  _events: EventsStore;
};

type EventEmitterCtor = {
  new (): EventEmitterInstance & EventEmitterMethods;
  prototype: EventEmitterInstance & EventEmitterMethods;
  EventEmitter: EventEmitterCtor;
};

type EventEmitterMethods = {
  on(this: EventEmitterInstance, event: EventKey, listener: Listener): EventEmitterInstance & EventEmitterMethods;
  addListener(this: EventEmitterInstance, event: EventKey, listener: Listener): EventEmitterInstance & EventEmitterMethods;
  once(this: EventEmitterInstance, event: EventKey, listener: Listener): EventEmitterInstance & EventEmitterMethods;
  removeListener(this: EventEmitterInstance, event: EventKey, listener: Listener): EventEmitterInstance & EventEmitterMethods;
  off(this: EventEmitterInstance, event: EventKey, listener: Listener): EventEmitterInstance & EventEmitterMethods;
  removeAllListeners(this: EventEmitterInstance, event?: EventKey): EventEmitterInstance & EventEmitterMethods;
  emit(this: EventEmitterInstance, event: EventKey, ...args: unknown[]): boolean;
};

const EventEmitter = function (this: EventEmitterInstance) {
  if (!(this instanceof (EventEmitter as unknown as new () => EventEmitterInstance))) {
    return new (EventEmitter as unknown as new () => EventEmitterInstance)();
  }

  this._events = new Map();
  return this;
} as unknown as EventEmitterCtor;

const getListeners = (emitter: EventEmitterInstance, event: EventKey) => {
  const listeners = emitter._events.get(event) ?? new Set<Listener>();
  emitter._events.set(event, listeners);
  return listeners;
};

(EventEmitter as unknown as EventEmitterCtor).prototype.on = function (event: EventKey, listener: Listener) {
  getListeners(this, event).add(listener);
  return this;
};

(EventEmitter as unknown as EventEmitterCtor).prototype.addListener = function (
  event: EventKey,
  listener: Listener,
) {
  return (this as EventEmitterInstance & EventEmitterMethods).on(event, listener);
};

(EventEmitter as unknown as EventEmitterCtor).prototype.once = function (event: EventKey, listener: Listener) {
  const onceListener: Listener = (...args: unknown[]) => {
    (this as EventEmitterInstance & EventEmitterMethods).removeListener(event, onceListener);
    listener(...args);
  };

  return (this as EventEmitterInstance & EventEmitterMethods).on(event, onceListener);
};

(EventEmitter as unknown as EventEmitterCtor).prototype.removeListener = function (
  event: EventKey,
  listener: Listener,
) {
  const listeners = this._events.get(event);
  if (!listeners) return this;

  listeners.delete(listener);
  if (listeners.size === 0) {
    this._events.delete(event);
  }

  return this;
};

(EventEmitter as unknown as EventEmitterCtor).prototype.off = function (event: EventKey, listener: Listener) {
  return (this as EventEmitterInstance & EventEmitterMethods).removeListener(event, listener);
};

(EventEmitter as unknown as EventEmitterCtor).prototype.removeAllListeners = function (event?: EventKey) {
  if (typeof event === 'undefined') {
    this._events.clear();
    return this;
  }

  this._events.delete(event);
  return this;
};

(EventEmitter as unknown as EventEmitterCtor).prototype.emit = function (event: EventKey, ...args: unknown[]) {
  const listeners = this._events.get(event);
  if (!listeners || listeners.size === 0) return false;

  listeners.forEach((listener) => listener(...args));
  return true;
};

EventEmitter.EventEmitter = EventEmitter as EventEmitterCtor;

export { EventEmitter };
export default EventEmitter;
