/* ==========================================================================
   boot.js

   Both sequences are cancellable. The original scheduled its next line with a
   fresh setTimeout each step and kept no handle on it, so switching
   interfaces mid-boot left the old sequence still writing lines into a screen
   that had moved on — and, on restart, two sequences interleaving.

   Both are also skippable. A boot animation is charming once and an
   obstruction every time after.
   ========================================================================== */

import { h, fill, on, qs } from '../core/dom.js';

const DESKTOP_LINES = [
  ['gazéifié 1.0  (tty1)', 'head'],
  ['', ''],
  ['[    0.000000] Booting on physical CPU 0x0', 'ok'],
  ['[    0.104221] Memory: 6144M available', 'ok'],
  ['[    0.291884] Mounting root filesystem (in-memory)', 'ok'],
  ['[    0.402117] Starting compositor', 'ok'],
  ['[    0.588903] Touch input: capacitive, 10-point', 'ok'],
  ['[    0.771560] Radio firmware unsigned — continuing', 'warn'],
  ['[    0.902433] Starting session for user', 'ok'],
  ['', ''],
  ['welcome back.', 'head'],
];

/** Shared cancel handle so two sequences can never overlap. */
let active = null;

function cancel() {
  if (!active) return;
  clearTimeout(active.timer);
  active.cancelled = true;
  active = null;
}

/**
 * @param {'desktop'|'phone'} kind
 * @param {() => void} done
 */
export function runBoot(kind, done) {
  cancel();
  const scene = qs('#boot');
  const session = { timer: 0, cancelled: false };
  active = session;

  const finish = () => {
    if (session.cancelled) return;
    cancel();
    detachSkip();
    done();
  };

  // Tap or press a key to skip ahead.
  const skip = (event) => {
    if (event.type === 'keydown' && !['Enter', ' ', 'Escape'].includes(event.key)) return;
    finish();
  };
  const detachSkip = () => {
    scene.removeEventListener('click', skip);
    window.removeEventListener('keydown', skip);
  };
  on(scene, 'click', skip);
  on(window, 'keydown', skip);

  if (kind === 'phone') {
    scene.classList.add('phone-boot');
    fill(scene,
      h('div.boot-mark', 'g'),
      h('div.boot-progress', h('i')),
    );
    session.timer = setTimeout(finish, 1500);
    return;
  }

  scene.classList.remove('phone-boot');
  const log = h('div');
  const caret = h('div.caret');
  fill(scene, log, caret);

  let index = 0;
  (function next() {
    if (session.cancelled) return;

    if (index >= DESKTOP_LINES.length) {
      caret.textContent = '_';
      session.timer = setTimeout(finish, 460);
      return;
    }

    const [text, className] = DESKTOP_LINES[index];
    index += 1;
    const line = h('div.line', className ? { class: className } : null);
    line.textContent = text;
    log.appendChild(line);

    // Slight jitter so it reads as a machine working rather than a metronome.
    session.timer = setTimeout(next, text === '' ? 80 : 120 + Math.random() * 110);
  })();
}

export const cancelBoot = cancel;
