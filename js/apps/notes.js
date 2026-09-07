/* ==========================================================================
   notes.js — a scratchpad backed by ~/notes.txt.

   The original wired the textarea straight to the filesystem object on every
   keystroke and showed no feedback at all, so there was no way to tell the
   note was going anywhere. Same binding, but debounced, and it says so.
   ========================================================================== */

import { h, on } from '../core/dom.js';
import { subscribe, system } from '../core/state.js';
import { fs, touched } from '../fs/filesystem.js';

const SAVE_DELAY = 400;

export function createNotes() {
  const noteFile = () => fs.home[system.user];

  const pad = h('textarea.notepad', {
    placeholder: 'Start typing. This is saved to ~/notes.txt for as long as the tab is open.',
    spellcheck: false,
    'aria-label': 'Note contents',
  });

  const count = h('span');
  const saved = h('span', 'Saved');
  const element = h('div.app-root', pad, h('div.notes-status', count, saved));

  pad.value = noteFile()['notes.txt'] ?? '';

  function updateCount() {
    const text = pad.value;
    const words = text.split(/\s+/).filter(Boolean).length;
    count.textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${text.length} characters`;
  }

  let timer = 0;
  on(pad, 'input', () => {
    updateCount();
    saved.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(() => {
      noteFile()['notes.txt'] = pad.value;
      saved.textContent = 'Saved';
      touched();
    }, SAVE_DELAY);
  });

  // If the file is rewritten elsewhere — `write notes.txt hello` in the shell —
  // pick that up rather than silently overwriting it on the next keystroke.
  subscribe('fs:change', () => {
    const onDisk = noteFile()['notes.txt'] ?? '';
    if (document.activeElement !== pad && onDisk !== pad.value) {
      pad.value = onDisk;
      updateCount();
    }
  });

  updateCount();

  return {
    element,
    subtitle: () => '~/notes.txt',
    onShow() { updateCount(); },
  };
}
