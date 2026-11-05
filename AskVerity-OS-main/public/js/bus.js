/** Tiny application-wide event bus built on CustomEvent. */

const target = new EventTarget();

export function emit(type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  const listener = (event) => handler(event.detail);
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

/** Convenience facade so modules can `import { bus }`. */
export const bus = { emit, on };
