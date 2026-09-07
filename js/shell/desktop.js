/* ==========================================================================
   desktop.js — the "Slate" shell and its window manager.

   Notes on what changed from the original window manager:

     · Position is a transform, not `left`/`top`. Moving a window with left/top
       invalidates layout on every pointer event; a transform is composited.
     · Pointer moves are coalesced to one per animation frame. They arrive far
       faster than the display refreshes, and the old code called
       getBoundingClientRect inside each one — a forced synchronous layout,
       per event, while dragging a blurred surface.
     · Bounds are measured once and on resize, rather than per frame.
     · The three-window cap is gone. It existed because windows were sized for
       a 400px-wide phone; the shell is responsive now, so the limit was an
       arbitrary refusal on a screen with room for eight.
     · The dock absorbed the taskbar. One control per app that shows whether it
       is running, focused or minimised, instead of two rows doing half a job
       each.
   ========================================================================== */

import { h, fill, on, qs, rafThrottle, clamp } from '../core/dom.js';
import { subscribe, system, uptimeShort } from '../core/state.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { APPS, DOCK_ORDER, appMeta, appInstance } from '../apps/registry.js';
import { homePath } from '../fs/filesystem.js';

const EDGE = 26;          // px from an edge that arms a snap
const HEADER_KEEP = 40;   // px of a window that must stay on screen
const CASCADE = 26;

export function createDesktopShell() {
  const scene = qs('#desktop');
  const desk = qs('#desk');
  const layer = qs('#windows');
  const dock = qs('#dock');
  const deskStat = qs('#deskstat');
  const snapHint = h('div', { id: 'snap' });
  layer.appendChild(snapHint);

  /** @type {Map<string, object>} id → window record */
  const windows = new Map();
  let bounds = { w: 0, h: 0 };
  let zTop = 10;
  let focusedId = null;
  let dockHeight = 74;

  /* ----------------------------------------------------------------- bounds */

  function measure() {
    const rect = layer.getBoundingClientRect();
    bounds = { w: rect.width, h: rect.height };
    dockHeight = dock.offsetHeight + 20;
  }

  const observer = new ResizeObserver(() => {
    measure();
    for (const win of windows.values()) {
      if (win.maximised) applyRect(win, { x: 0, y: 0, w: bounds.w, h: bounds.h });
      else place(win, win.x, win.y);
    }
  });
  observer.observe(layer);

  /* ------------------------------------------------------------- geometry */

  function place(win, x, y) {
    win.x = clamp(x, -(win.w - HEADER_KEEP * 2), bounds.w - HEADER_KEEP);
    win.y = clamp(y, 0, Math.max(0, bounds.h - HEADER_KEEP));
    win.el.style.setProperty('--x', `${Math.round(win.x)}px`);
    win.el.style.setProperty('--y', `${Math.round(win.y)}px`);
  }

  function resize(win, w, h) {
    win.w = clamp(w, 220, Math.max(220, bounds.w));
    win.h = clamp(h, 150, Math.max(150, bounds.h));
    win.el.style.width = `${Math.round(win.w)}px`;
    win.el.style.height = `${Math.round(win.h)}px`;
  }

  function applyRect(win, rect) {
    resize(win, rect.w, rect.h);
    place(win, rect.x, rect.y);
  }

  /** Where a window dropped at this pointer position would snap, if anywhere. */
  function snapZoneFor(clientX, clientY) {
    const rect = layer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const usable = bounds.h - dockHeight;

    if (y < EDGE) return { id: 'max', x: 0, y: 0, w: bounds.w, h: bounds.h };
    if (x < EDGE) return { id: 'left', x: 0, y: 0, w: bounds.w / 2, h: usable };
    if (x > bounds.w - EDGE) {
      return { id: 'right', x: bounds.w / 2, y: 0, w: bounds.w / 2, h: usable };
    }
    return null;
  }

  function showSnap(zone) {
    if (!zone) {
      snapHint.classList.remove('on');
      return;
    }
    Object.assign(snapHint.style, {
      width: `${zone.w}px`,
      height: `${zone.h}px`,
      transform: `translate3d(${zone.x}px, ${zone.y}px, 0)`,
    });
    snapHint.classList.add('on');
  }

  /* -------------------------------------------------------------- z-order */

  function focus(id) {
    const win = windows.get(id);
    if (!win) return;

    if (win.minimised) {
      win.minimised = false;
      win.el.classList.remove('minimised');
    }

    win.el.style.zIndex = String(++zTop);
    focusedId = id;

    for (const [otherId, other] of windows) {
      other.el.classList.toggle('focused', otherId === id);
    }

    refreshTitle(id);
    win.instance.onShow?.();
    renderDock();
  }

  /* --------------------------------------------------------------- chrome */

  function refreshTitle(id) {
    const win = windows.get(id);
    if (!win) return;
    const subtitle = win.instance.subtitle?.();
    fill(win.titleEl, win.meta.name, subtitle && h('span.wh-sub', subtitle));
  }

  function headerButton(name, label, action, danger) {
    return h('button.win-btn', {
      class: danger ? 'danger' : '',
      'aria-label': label,
      title: label,
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => { event.stopPropagation(); action(); },
    }, icon(name));
  }

  /* ----------------------------------------------------- open / close etc. */

  function open(id) {
    if (windows.has(id)) {
      focus(id);
      return;
    }

    const meta = appMeta(id);
    if (!meta) return toast(`No app called “${id}”.`);

    const instance = appInstance(id);
    const titleEl = h('div.wh-title');

    const maximiseButton = headerButton('maximise', 'Maximise', () => toggleMaximise(id));

    const header = h('div.win-header', titleEl,
      headerButton('minus', 'Minimise', () => minimise(id)),
      maximiseButton,
      headerButton('close', 'Close', () => close(id), true),
    );

    const body = h('div.win-body', instance.element);
    const grip = h('div.win-resize', { 'aria-hidden': 'true' });

    const el = h('section.window', {
      role: 'dialog',
      'aria-label': meta.name,
      dataset: { app: id },
    }, header, body, grip);

    const win = {
      id, el, header, body, titleEl, grip, meta, instance,
      x: 0, y: 0, w: 0, h: 0,
      minimised: false,
      maximised: false,
      restore: null,
      maximiseButton,
    };

    windows.set(id, win);
    layer.appendChild(el);

    // Size to the app's preference, shrunk to fit if the screen is small.
    measure();
    resize(win,
      Math.min(meta.size.w, bounds.w - 16),
      Math.min(meta.size.h, bounds.h - 16));

    // Cascade down and right, restarting from the top-left every sixth window
    // so a long session doesn't march them off the screen.
    const step = ((windows.size - 1) % 6) * CASCADE;
    place(win,
      clamp(14 + step, 8, Math.max(8, bounds.w - win.w - 8)),
      clamp(14 + step, 8, Math.max(8, bounds.h - win.h - 8)));

    bindDrag(win);
    bindResize(win);
    on(el, 'pointerdown', () => { if (focusedId !== id) focus(id); });

    focus(id);
    if (id === 'browser') toast('Sites open in a new tab — allow pop-ups if nothing happens.', 3200);
  }

  function close(id) {
    const win = windows.get(id);
    if (!win) return;

    win.instance.onHide?.();
    win.el.classList.add('closing');

    const finish = () => {
      // The element belongs to the app instance, not the window, so it is
      // detached rather than destroyed — reopening restores the app's state.
      win.instance.element.remove();
      win.el.remove();
      windows.delete(id);
      if (focusedId === id) focusedId = null;
      renderDock();
    };

    // Fall back to a timeout: animationend never fires under reduced motion.
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    win.el.addEventListener('animationend', once, { once: true });
    setTimeout(once, 260);
  }

  function minimise(id) {
    const win = windows.get(id);
    if (!win) return;
    win.minimised = true;
    win.el.classList.add('minimised');
    win.instance.onHide?.();
    if (focusedId === id) focusedId = null;
    renderDock();
  }

  function toggleMaximise(id) {
    const win = windows.get(id);
    if (!win) return;

    if (win.maximised) {
      win.maximised = false;
      win.el.classList.remove('maximised');
      applyRect(win, win.restore);
      fill(win.maximiseButton, icon('maximise'));
      win.maximiseButton.title = 'Maximise';
    } else {
      win.restore = { x: win.x, y: win.y, w: win.w, h: win.h };
      win.maximised = true;
      win.el.classList.add('maximised');
      applyRect(win, { x: 0, y: 0, w: bounds.w, h: bounds.h });
      fill(win.maximiseButton, icon('restore'));
      win.maximiseButton.title = 'Restore';
    }
    focus(id);
  }

  function closeAll() {
    for (const id of [...windows.keys()]) {
      const win = windows.get(id);
      win.instance.onHide?.();
      win.instance.element.remove();
      win.el.remove();
      windows.delete(id);
    }
    focusedId = null;
    renderDock();
  }

  /* ------------------------------------------------------------ dragging */

  function bindDrag(win) {
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let zone = null;
    let dragging = false;

    const move = rafThrottle((clientX, clientY) => {
      if (!dragging) return;
      place(win, originX + (clientX - startX), originY + (clientY - startY));
      zone = snapZoneFor(clientX, clientY);
      showSnap(zone);
    });

    on(win.header, 'pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (event.target.closest('.win-btn')) return;

      // Dragging a maximised window pulls it back to its old size, grabbed
      // proportionally so the pointer stays where you took hold of it.
      if (win.maximised) {
        const ratio = (event.clientX - win.el.getBoundingClientRect().left) / win.w;
        toggleMaximise(win.id);
        place(win, event.clientX - win.w * ratio, Math.max(0, event.clientY - 18));
      }

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = win.x;
      originY = win.y;
      win.el.classList.add('interacting');
      win.header.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    on(win.header, 'pointermove', (event) => move(event.clientX, event.clientY));

    const end = (event) => {
      if (!dragging) return;
      dragging = false;
      win.el.classList.remove('interacting');
      win.header.releasePointerCapture?.(event.pointerId);
      showSnap(null);

      if (zone) {
        if (zone.id === 'max') {
          if (!win.maximised) toggleMaximise(win.id);
        } else {
          win.restore = { x: win.x, y: win.y, w: win.w, h: win.h };
          applyRect(win, zone);
        }
        zone = null;
      }
    };

    on(win.header, 'pointerup', end);
    on(win.header, 'pointercancel', end);
    on(win.header, 'dblclick', () => toggleMaximise(win.id));
  }

  /* ------------------------------------------------------------ resizing */

  function bindResize(win) {
    let startX = 0;
    let startY = 0;
    let originW = 0;
    let originH = 0;
    let active = false;

    const move = rafThrottle((clientX, clientY) => {
      if (!active) return;
      resize(win, originW + (clientX - startX), originH + (clientY - startY));
    });

    on(win.grip, 'pointerdown', (event) => {
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      originW = win.w;
      originH = win.h;
      win.el.classList.add('interacting');
      win.grip.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    on(win.grip, 'pointermove', (event) => move(event.clientX, event.clientY));

    const end = (event) => {
      if (!active) return;
      active = false;
      win.el.classList.remove('interacting');
      win.grip.releasePointerCapture?.(event.pointerId);
    };

    on(win.grip, 'pointerup', end);
    on(win.grip, 'pointercancel', end);
  }

  /* ----------------------------------------------------------------- dock */

  function renderDock() {
    fill(dock, DOCK_ORDER.map((id) => {
      const meta = appMeta(id);
      if (!meta) return null;
      const win = windows.get(id);

      return h('button.dock-tile', {
        'aria-label': meta.name,
        dataset: {
          app: id,
          running: String(Boolean(win)),
          focused: String(focusedId === id),
          minimised: String(Boolean(win?.minimised)),
        },
        onclick: () => {
          // One control, three behaviours: launch, focus, or minimise the
          // window you are already looking at.
          if (!win) open(id);
          else if (win.minimised || focusedId !== id) focus(id);
          else minimise(id);
        },
      },
        h('span.dk-tip', meta.name),
        h('span.dk-mark', { style: { background: meta.tint } }, icon(meta.icon)),
        h('span.dk-dot'),
      );
    }));
  }

  /* ------------------------------------------------------------ desk icons */

  const DESK_ITEMS = [
    { kind: 'app', id: 'terminal' },
    { kind: 'app', id: 'files' },
    { kind: 'file', path: homePath(), name: 'readme.txt' },
    { kind: 'dir', path: [...homePath(), 'projects'], name: 'projects' },
  ];

  function renderDesk() {
    fill(desk, DESK_ITEMS.map((item) => {
      const meta = item.kind === 'app' ? appMeta(item.id) : null;
      const label = meta ? meta.name : item.name;
      const glyph = meta ? meta.icon : item.kind === 'dir' ? 'folder' : 'file';
      const tint = meta ? meta.tint
        : item.kind === 'dir'
          ? 'linear-gradient(150deg,#f0b556,#c8842a)'
          : 'linear-gradient(150deg,#dfe4ec,#b3bcc9)';

      return h('button.desk-icon', {
        onclick: () => {
          if (item.kind === 'app') return open(item.id);
          open('files');
          const files = appInstance('files');
          files.reveal?.(item.kind === 'dir' ? item.path : item.path,
            item.kind === 'file' ? item.name : null);
          refreshTitle('files');
        },
      },
        h('span.di-mark', {
          style: { background: tint, color: item.kind === 'file' ? '#3d4655' : '#fff' },
        }, icon(glyph)),
        h('span.di-label', label),
      );
    }));
  }

  /* --------------------------------------------------------------- wiring */

  /* Both shells exist for the life of the page, so every subscription is
     guarded: without this, launching an app from the terminal would open it
     in the desktop *and* the phone at once, and the second mount would steal
     the app's element out of the first. */
  const isActive = () => scene.classList.contains('on');

  const unsubscribes = [
    subscribe('app:launch', ({ id }) => {
      if (!isActive()) return;
      // The shell accepts an app's name as well as its id, because `open files`
      // is what a person types.
      const match = appMeta(id) ?? APPS.find((a) => a.name.toLowerCase() === id);
      if (!match) return toast(`No app called “${id}”.`);
      open(match.id);
    }),
    subscribe('app:close', ({ id }) => { if (isActive()) close(id); }),
    subscribe('fs:change', () => {
      if (!isActive()) return;
      if (windows.has('files')) refreshTitle('files');
      if (windows.has('terminal')) refreshTitle('terminal');
    }),
    subscribe('host:change', () => renderDesk()),
  ];

  // Keyboard shortcuts a desktop is expected to have.
  const onKey = (event) => {
    if (!scene.classList.contains('on')) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'w' && focusedId) {
      event.preventDefault();
      close(focusedId);
    }
    if (meta && event.key.toLowerCase() === 'm' && focusedId) {
      event.preventDefault();
      minimise(focusedId);
    }
  };
  on(window, 'keydown', onKey);

  function tickStat() {
    if (!scene.classList.contains('on')) return;
    const load = (0.04 + (new Date().getSeconds() % 7) / 100).toFixed(2);
    deskStat.textContent = `${system.host} · up ${uptimeShort()} · load ${load}`;
  }
  const statTimer = setInterval(tickStat, 1000);

  measure();
  renderDesk();
  renderDock();
  tickStat();

  return {
    open,
    close,
    closeAll,
    /** Called when the desktop scene becomes visible. */
    activate() {
      measure();
      renderDesk();
      renderDock();
      tickStat();
    },
    /** Show the desktop by minimising everything, rather than losing state. */
    showDesk() {
      for (const id of windows.keys()) minimise(id);
    },
    hasWindows: () => windows.size > 0,
    /** Tear down session state without unbinding the shell itself. */
    reset() {
      closeAll();
      zTop = 10;
    },
  };
}
