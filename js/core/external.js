/* ==========================================================================
   external.js — leaving the device.

   window.open has to be called synchronously inside the handler for the tap
   that triggered it. Defer it by even one microtask — an await, a setTimeout,
   a promise callback — and Safari treats it as unsolicited and blocks it.

   Every path that opens a real URL goes through here so that constraint is
   stated once instead of being rediscovered at each call site.
   ========================================================================== */

/**
 * @param {string} url
 * @returns {boolean} whether a window was actually opened
 */
export function openExternal(url) {
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return Boolean(opened);
  } catch {
    return false;
  }
}

/** "https://www.youtube.com/feed" → "www.youtube.com" */
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
