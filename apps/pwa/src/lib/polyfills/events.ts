export type Listener = (...args: unknown[]) => void;

type EventKey = string | symbol;

export class EventEmitter {
  private events = new Map<EventKey, Set<Listener>>();

  on(event: EventKey, listener: Listener) {
    const listeners = this.events.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.events.set(event, listeners);
    return this;
  }

  addListener(event: EventKey, listener: Listener) {
    return this.on(event, listener);
  }

  once(event: EventKey, listener: Listener) {
    const onceListener: Listener = (...args) => {
      this.removeListener(event, onceListener);
      listener(...args);
    };

    return this.on(event, onceListener);
  }

  removeListener(event: EventKey, listener: Listener) {
    const listeners = this.events.get(event);
    if (!listeners) return this;

    listeners.delete(listener);
    if (listeners.size === 0) this.events.delete(event);
    return this;
  }

  off(event: EventKey, listener: Listener) {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event?: EventKey) {
    if (typeof event === 'undefined') {
      this.events.clear();
      return this;
    }

    this.events.delete(event);
    return this;
  }

  emit(event: EventKey, ...args: unknown[]) {
    const listeners = this.events.get(event);
    if (!listeners || listeners.size === 0) return false;

    listeners.forEach((listener) => listener(...args));
    return true;
  }
}

export default EventEmitter;
