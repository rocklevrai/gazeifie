/* ==========================================================================
   files.js

   Three changes worth calling out against the original:

     1. Navigation is a breadcrumb, not a ".." row. On a path four levels deep
        the old UI needed four taps to get home.
     2. `prompt()` and `confirm()` are gone. Both are browser-chrome dialogs
        that break the illusion of a device instantly, and on iOS they can be
        suppressed entirely — at which point creating a file silently failed.
        Naming now happens in an inline row; deleting arms the button once.
     3. It subscribes to fs:change, so writing a file from the terminal
        updates this listing while it is on screen.
   ========================================================================== */

import { h, fill, on } from '../core/dom.js';
import { subscribe } from '../core/state.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import {
  nodeAt, isDir, pretty, homePath, describe, isValidName, touched,
} from '../fs/filesystem.js';

const ARM_MS = 2600;

export function createFiles() {
  let cwd = homePath();
  /** null, or { name, content } while a file is open. */
  let viewing = null;
  let pending = null; // 'folder' | 'file' while an inline name row is showing

  const breadcrumb = h('nav.path-bar', { 'aria-label': 'Location' });
  const list = h('div.pane');

  const newFolder = h('button.btn.quiet', { onclick: () => startCreate('folder') },
    icon('plus'), 'Folder');
  const newFile = h('button.btn.quiet', { onclick: () => startCreate('file') },
    icon('plus'), 'File');

  const toolbar = h('div.toolbar', breadcrumb, newFolder, newFile);
  const element = h('div.app-root', toolbar, list);

  /* ------------------------------------------------------------ navigation */

  function goTo(path) {
    cwd = path;
    viewing = null;
    pending = null;
    render();
  }

  function renderBreadcrumb() {
    const crumbs = [];
    const home = homePath();
    const insideHome = home.every((part, i) => cwd[i] === part);
    const start = insideHome ? home.length : 0;

    crumbs.push({ label: insideHome ? '~' : '/', path: insideHome ? home : [] });
    for (let i = start; i < cwd.length; i += 1) {
      crumbs.push({ label: cwd[i], path: cwd.slice(0, i + 1) });
    }

    fill(breadcrumb, crumbs.flatMap((crumb, index) => [
      index > 0 && h('span.sep', '/'),
      h('button', { onclick: () => goTo(crumb.path) }, crumb.label),
    ]));

    if (viewing) {
      breadcrumb.append(h('span.sep', '/'), h('button', {
        onclick: () => { viewing = null; render(); },
      }, viewing.name));
    }

    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
  }

  /* ------------------------------------------------------------ create row */

  function startCreate(kind) {
    if (viewing) viewing = null;
    pending = kind;
    render();
  }

  function commitCreate(kind, rawName) {
    const name = rawName.trim();
    pending = null;
    if (!name) return render();

    if (!isValidName(name)) {
      toast('Names cannot contain slashes.');
      return render();
    }

    const parent = nodeAt(cwd);
    if (Object.hasOwn(parent, name)) {
      toast(`${name} already exists here.`);
      return render();
    }

    parent[name] = kind === 'folder' ? {} : '';
    touched();
    render();
  }

  function createRow(kind) {
    const field = h('input.field', {
      placeholder: kind === 'folder' ? 'Folder name' : 'File name',
      'aria-label': kind === 'folder' ? 'New folder name' : 'New file name',
      onkeydown: (event) => {
        if (event.key === 'Enter') commitCreate(kind, field.value);
        if (event.key === 'Escape') { pending = null; render(); }
      },
      onblur: () => { if (pending) commitCreate(kind, field.value); },
    });

    // Focus after the row is in the document, or the caret never lands.
    queueMicrotask(() => field.focus());

    return h('div.row',
      h('span.r-mark', { class: kind === 'folder' ? 'dir' : '' },
        icon(kind === 'folder' ? 'folder' : 'file')),
      field,
    );
  }

  /* ---------------------------------------------------------------- delete */

  function deleteButton(name) {
    let armed = false;
    let timer = 0;

    const disarm = () => {
      armed = false;
      button.classList.remove('armed');
      button.title = `Delete ${name}`;
    };

    const button = h('button.r-del', {
      'aria-label': `Delete ${name}`,
      title: `Delete ${name}`,
      onclick: (event) => {
        event.stopPropagation();

        // First press arms the button, a second within the window commits.
        // No modal, and no way to lose a file to one stray tap.
        if (!armed) {
          armed = true;
          button.classList.add('armed');
          button.title = `Press again to delete ${name}`;
          timer = setTimeout(disarm, ARM_MS);
          toast(`Press again to delete ${name}`, ARM_MS);
          return;
        }

        clearTimeout(timer);
        delete nodeAt(cwd)[name];
        touched();
        render();
      },
    }, icon('trash'));

    return button;
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    renderBreadcrumb();

    if (viewing) {
      fill(list,
        h('div.file-view', viewing.content || '(empty file)'),
      );
      return;
    }

    const node = nodeAt(cwd);
    if (!isDir(node)) {
      // The directory was removed from under us — from the terminal, say.
      cwd = homePath();
      return render();
    }

    const names = Object.keys(node).sort((a, b) => {
      const byKind = Number(isDir(node[b])) - Number(isDir(node[a]));
      return byKind || a.localeCompare(b);
    });

    fill(list, pending && createRow(pending));

    if (!names.length && !pending) {
      list.append(h('div.empty',
        h('strong', 'This folder is empty'),
        'Use Folder or File above to add something.',
      ));
      return;
    }

    for (const name of names) {
      const child = node[name];
      const directory = isDir(child);

      const row = h('div.row', { tabindex: 0, role: 'button' },
        h('span.r-mark', { class: directory ? 'dir' : '' },
          icon(directory ? 'folder' : 'file')),
        h('span.r-name', name),
        h('span.r-meta', describe(child)),
        deleteButton(name),
      );

      const openIt = () => {
        if (directory) goTo([...cwd, name]);
        else { viewing = { name, content: child }; render(); }
      };

      on(row, 'click', openIt);
      on(row, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openIt();
        }
      });

      list.append(row);
    }
  }

  // Keep in step with writes from anywhere else, but only while mounted —
  // re-rendering a detached tree is wasted work.
  let mounted = false;
  subscribe('fs:change', () => {
    if (mounted && !viewing) render();
  });

  render();

  return {
    element,
    subtitle: () => pretty(cwd),
    /** Let other code jump the browser straight to a path. */
    reveal(path, fileName) {
      goTo(path.slice());
      const node = nodeAt(path);
      if (fileName && node && typeof node[fileName] === 'string') {
        viewing = { name: fileName, content: node[fileName] };
        render();
      }
    },
    onShow() { mounted = true; render(); },
    onHide() { mounted = false; },
  };
}
