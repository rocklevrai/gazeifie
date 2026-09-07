/* ==========================================================================
   filesystem.js — the in-memory tree.

   A directory is a plain object, a file is a string. That representation was
   already the right call in the original, so it stays.

   What changes: mutations now go through functions that announce themselves.
   Previously `touch newfile` in the terminal left the Files app showing a
   stale listing until you navigated away and back, because the two read the
   same object but neither told the other it had written to it.
   ========================================================================== */

import { emit, system } from '../core/state.js';

export const fs = {
  bin: { sh: '#!/bin/sh\n', ls: '', cat: '', uname: '' },
  etc: {
    hostname: 'gazéifié\n',
    'os-release':
      'NAME="gazéifié"\nVERSION="1.0 (handheld)"\nID=gazeifie\nARCH=arm64\n',
    motd: 'Welcome to gazéifié. Type `help` to see what this shell knows.\n',
  },
  home: {
    user: {
      'readme.txt':
        'This device is a small pile of ES modules.\n' +
        'Nothing here leaves the browser — the filesystem lives in memory\n' +
        'and resets when you close the tab.\n',
      'notes.txt': '',
      projects: {
        'todo.md':
          '- [x] split the single file into modules\n' +
          '- [x] give windows resize and snap\n' +
          '- [ ] make notes survive a reload\n' +
          '- [ ] more wallpapers\n',
      },
    },
  },
  var: { log: { 'boot.log': 'kernel: ok\n' } },
};

/** Announce a write. Anything reading the tree can re-render off this. */
export function touched() {
  emit('fs:change');
}

/**
 * Turn a path string into absolute parts, relative to `cwd`.
 * Handles `/`, `.`, `..`, `~`, and collapses empty segments.
 */
export function resolve(path, cwd = []) {
  const parts = path.startsWith('/') ? [] : cwd.slice();
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else if (segment === '~') parts.splice(0, parts.length, 'home', system.user);
    else parts.push(segment);
  }
  return parts;
}

/** The node at an absolute path, or null. */
export function nodeAt(parts) {
  let node = fs;
  for (const part of parts) {
    if (node && typeof node === 'object' && Object.hasOwn(node, part)) node = node[part];
    else return null;
  }
  return node;
}

export const isDir = (node) => node !== null && typeof node === 'object';
export const isFile = (node) => typeof node === 'string';

/** The containing directory of a path, plus the final segment. */
export function parentOf(parts) {
  const name = parts[parts.length - 1];
  return { parent: nodeAt(parts.slice(0, -1)), name };
}

/** `/home/user/projects` → `~/projects` */
export function pretty(parts) {
  const absolute = `/${parts.join('/')}`;
  const home = `/home/${system.user}`;
  return absolute.startsWith(home) ? `~${absolute.slice(home.length)}` : absolute;
}

export const homePath = () => ['home', system.user];

/** Bytes for a file, item count for a directory. */
export function describe(node) {
  if (isDir(node)) {
    const count = Object.keys(node).length;
    return count === 1 ? '1 item' : `${count} items`;
  }
  return `${node.length} B`;
}

/** Total size of the tree, used by `df`. */
export function usedBytes() {
  let total = 0;
  (function walk(node) {
    for (const [key, value] of Object.entries(node)) {
      total += key.length;
      if (isDir(value)) walk(value);
      else total += value.length;
    }
  })(fs);
  return total;
}

/** Deep copy for `cp` — directories must not end up sharing a reference. */
export const cloneNode = (node) =>
  isDir(node) ? structuredClone(node) : node;

/** Filenames that would corrupt path parsing. */
export const isValidName = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 64 &&
  !/[/\\]/.test(name) &&
  name !== '.' &&
  name !== '..';
