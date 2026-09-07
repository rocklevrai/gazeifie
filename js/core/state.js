/* ==========================================================================
   state.js — one event bus and one system record.

   The original kept roughly forty loose `let` bindings at module scope
   (`HOST`, `PLATFORM`, `current`, `wins`, `zTop`, `cAcc`, `cOp`, `cCur`,
   `swRun`, `swBase`, `fcwd`, `recents`, …) and used name prefixes as a
   stand-in for namespacing. Anything could write to any of them from
   anywhere, so answering "what changed the hostname?" meant reading the
   whole file.

   Now: the shared facts live here, they are changed through named functions,
   and interested parties subscribe. Everything not genuinely shared stays
   private to the module that owns it.
   ========================================================================== */

const listeners = new Map();

/**
 * Subscribe to an event. Returns an unsubscribe function.
 * @param {string} event
 * @param {(payload: any) => void} handler
 */
export function subscribe(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

/** Fire an event. A throwing subscriber must not take the others down. */
export function emit(event, payload) {
  for (const handler of listeners.get(event) ?? []) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[bus] "${event}" subscriber failed`, error);
    }
  }
}

/* --------------------------------------------------------------------------
   System record
   -------------------------------------------------------------------------- */

export const system = {
  bootedAt: Date.now(),
  user: 'user',
  host: 'gazéifié',
  /** null before an interface is chosen, then 'desktop' | 'phone'. */
  os: null,
  /** 'dark' | 'light' — desktop skin only. */
  theme: 'dark',
  accent: null,
  wallpaper: 0,
  online: navigator.onLine,
};

export function setHost(name) {
  system.host = name;
  emit('host:change', name);
}

export function setOS(os) {
  system.os = os;
  system.bootedAt = Date.now();
  emit('os:change', os);
}

export function setTheme(theme) {
  system.theme = theme;
  emit('theme:change', theme);
}

export const uptimeMs = () => Date.now() - system.bootedAt;

/** "4m", "38s" — the short form the menu bar and `uptime` both want. */
export function uptimeShort() {
  const seconds = Math.floor(uptimeMs() / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
