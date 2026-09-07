/* ==========================================================================
   toast.js — transient messages.

   Also an accessibility fix over the original, which appended text to a plain
   div: a screen reader was never told a message had appeared. This is a live
   region, so it is announced.
   ========================================================================== */

import { qs } from '../core/dom.js';

let node = null;
let timer = 0;

function element() {
  if (!node) {
    node = qs('#toast');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
  }
  return node;
}

/**
 * @param {string} message
 * @param {number} [ms]
 */
export function toast(message, ms = 2200) {
  const el = element();
  el.textContent = message;
  el.classList.add('on');

  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), ms);
}

export function hideToast() {
  clearTimeout(timer);
  element().classList.remove('on');
}
