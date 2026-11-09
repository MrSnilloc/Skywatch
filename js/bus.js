// bus.js — a tiny "announce / listen" helper so screens can react to data changes.

export function createBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] = handlers[name] || new Set()).add(fn);
      return () => handlers[name].delete(fn);
    },
    emit(name, payload) {
      (handlers[name] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
    },
  };
}
