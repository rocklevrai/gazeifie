/* ==========================================================================
   phone.js — the "Halo" shell.

   Structurally close to the original, which had the gestures right. The
   changes are in the details:

     · one `openApp` path instead of routing every app through the shared
       full-screen view switcher that the desktop also used
     · recents cards are cloned from the live app element and scaled with a
       measured factor, so a card is never a stretched approximation
     · the gesture handler distinguishes flick from drag by velocity as well
       as distance, which is what separates "go home" from "show me everything"
       reliably on a short screen
   ========================================================================== */

import { h, fill, on, qs, clamp, pad2 } from '../core/dom.js';
import { emit, subscribe } from '../core/state.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { APPS, PHONE_DOCK, appMeta, appInstance } from '../apps/registry.js';

const MAX_RECENTS = 6;
const DISMISS_DISTANCE = 90;
const CARD_WIDTH = 216;

export function createPhoneShell() {
  const scene = qs('#phone');
  const launcher = qs('#launcher');
  const clockEl = qs('#lcClock');
  const dateEl = qs('#lcDate');
  const grid = qs('#lcGrid');
  const dock = qs('#lcDock');
  const stage = qs('#stage');
  const recents = qs('#recents');
  const track = qs('.rc-track', recents);
  const controlCentre = qs('#cc');
  const ccGrid = qs('#ccGrid');
  const brightness = qs('#brightness');
  const dimmer = qs('#dimmer');
  const gestureBar = qs('#gesturebar');

  let currentId = null;
  let recentIds = [];
  let recentsOpen = false;

  const stageTitle = h('div.sh-title');
  const stageHeader = h('div.stage-header', stageTitle);
  const stageBody = h('div.app-root');
  fill(stage, stageHeader, stageBody);

  /* ------------------------------------------------------------- launcher */

  function appTile(id, extraClass) {
    const meta = appMeta(id);
    if (!meta) return null;
    return h('button.app-icon', {
      class: extraClass,
      'aria-label': meta.name,
      onclick: () => openApp(id),
    },
      h('span.ic-mark', { style: { background: meta.tint } }, icon(meta.icon)),
      h('span.ic-label', meta.name),
    );
  }

  function renderLauncher() {
    fill(grid, APPS.map((app) => appTile(app.id)));
    fill(dock, PHONE_DOCK.map((id) => appTile(id)));
  }

  function tickClock() {
    const now = new Date();
    clockEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }

  /* ------------------------------------------------------------ app stage */

  function openApp(id) {
    const meta = appMeta(id);
    if (!meta) return toast(`No app called “${id}”.`);

    if (currentId === id) return;
    if (currentId) appInstance(currentId).onHide?.();

    const instance = appInstance(id);
    currentId = id;
    recentIds = [id, ...recentIds.filter((other) => other !== id)].slice(0, MAX_RECENTS);

    fill(stageBody, instance.element);
    updateStageTitle();
    scene.dataset.app = id;

    closeControlCentre();
    closeRecents();
    instance.onShow?.();
  }

  function updateStageTitle() {
    if (!currentId) return;
    const meta = appMeta(currentId);
    const subtitle = appInstance(currentId).subtitle?.();
    fill(stageTitle, meta.name, subtitle && h('span.sh-sub', ` ${subtitle}`));
  }

  function goHome() {
    closeControlCentre();
    closeRecents();
    if (!currentId) return;

    const instance = appInstance(currentId);
    instance.onHide?.();
    stage.classList.add('leaving');

    const finish = () => {
      stage.classList.remove('leaving');
      instance.element.remove();
      delete scene.dataset.app;
      currentId = null;
    };

    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    stage.addEventListener('animationend', once, { once: true });
    setTimeout(once, 260);
  }

  /** Flick sideways on the gesture bar to move through recent apps. */
  function cycle(direction) {
    if (recentIds.length < 2) return;
    const index = recentIds.indexOf(currentId);
    const next = recentIds[(index + direction + recentIds.length) % recentIds.length];
    if (next && next !== currentId) openApp(next);
  }

  /* --------------------------------------------------------------- recents */

  function buildCard(id) {
    const meta = appMeta(id);
    const instance = appInstance(id);

    const shot = h('div.rc-shot');
    const card = h('div.rc-card', { dataset: { app: id } },
      shot,
      h('div.rc-meta',
        h('span.rc-mark', { style: { background: meta.tint } }, icon(meta.icon)),
        meta.name,
      ),
    );

    // A static clone: live nodes would keep running timers and stealing focus.
    const clone = instance.element.cloneNode(true);
    const rect = qs('#screen').getBoundingClientRect();
    const width = rect.width || 390;
    const height = rect.height || 700;
    const scale = CARD_WIDTH / width;

    Object.assign(clone.style, {
      width: `${width}px`,
      height: `${height}px`,
      transform: `scale(${scale})`,
      display: 'flex',
    });
    shot.appendChild(clone);

    on(shot, 'click', () => { closeRecents(); openApp(id); });
    makeDismissable(card, id);
    return card;
  }

  function makeDismissable(card, id) {
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let active = false;

    on(card, 'pointerdown', (event) => {
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      offset = 0;
      card.style.transition = 'none';
    });

    on(card, 'pointermove', (event) => {
      if (!active) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy)) return; // horizontal: let the row scroll
      offset = Math.min(0, dy);
      card.style.transform = `translateY(${offset}px)`;
      card.style.opacity = String(clamp(1 + offset / 400, 0, 1));
    });

    const end = () => {
      if (!active) return;
      active = false;
      card.style.transition = '';

      if (offset < -DISMISS_DISTANCE) {
        card.style.transform = 'translateY(-140%)';
        card.style.opacity = '0';
        recentIds = recentIds.filter((other) => other !== id);
        if (currentId === id) currentId = null;
        setTimeout(() => {
          card.remove();
          if (!recentIds.length) closeRecents();
        }, 220);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
      }
    };

    on(card, 'pointerup', end);
    on(card, 'pointercancel', end);
  }

  function openRecents() {
    closeControlCentre();
    fill(track, recentIds.map(buildCard));
    recents.classList.add('on');
    recentsOpen = true;
  }

  function closeRecents() {
    if (!recentsOpen) return;
    recents.classList.remove('on');
    recentsOpen = false;
    setTimeout(() => { if (!recentsOpen) fill(track); }, 300);
  }

  on(recents, 'click', (event) => {
    if (event.target === recents || event.target === track) closeRecents();
  });

  /* -------------------------------------------------------- control centre */

  const TOGGLES = [
    { id: 'wifi', icon: 'wifi', label: 'Wi-Fi', on: true },
    { id: 'bluetooth', icon: 'bluetooth', label: 'Bluetooth', on: false },
    { id: 'dnd', icon: 'moon', label: 'Do not disturb', on: false },
    { id: 'rotation', icon: 'rotate', label: 'Rotation lock', on: false },
  ];

  function renderControlCentre() {
    fill(ccGrid, TOGGLES.map((toggle) => {
      const button = h('button.cc-toggle', {
        'aria-pressed': String(toggle.on),
        onclick: () => {
          toggle.on = !toggle.on;
          button.setAttribute('aria-pressed', String(toggle.on));
          if (toggle.id === 'wifi') emit('net:override', toggle.on ? null : 'offline');
          if (toggle.id === 'dnd') emit('dnd:change', toggle.on);
        },
      },
        h('span.tg-mark', icon(toggle.icon)),
        h('span', toggle.label),
      );
      return button;
    }));
  }

  const openControlCentre = () => controlCentre.classList.add('on');
  const closeControlCentre = () => controlCentre.classList.remove('on');

  on(brightness, 'input', () => {
    // Brightness never reaches zero: an unrecoverable black screen is a bug,
    // not a feature.
    dimmer.style.opacity = String(((100 - Number(brightness.value)) / 100) * 0.74);
  });

  on(controlCentre, 'click', (event) => {
    if (event.target === controlCentre || event.target.classList.contains('cc-handle')) {
      closeControlCentre();
    }
  });

  // Pull down from the menu bar to open, push up anywhere on the sheet to close.
  let sheetStart = 0;
  on(qs('#menubar'), 'pointerdown', (event) => { sheetStart = event.clientY; });
  on(qs('#menubar'), 'pointerup', (event) => {
    if (scene.classList.contains('on') && event.clientY - sheetStart > 24) openControlCentre();
  });
  on(controlCentre, 'pointerdown', (event) => { sheetStart = event.clientY; });
  on(controlCentre, 'pointerup', (event) => {
    if (event.clientY - sheetStart < -24) closeControlCentre();
  });

  /* ---------------------------------------------------------- gesture bar */

  (function bindGestures() {
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let active = false;

    on(gestureBar, 'pointerdown', (event) => {
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      startedAt = performance.now();
      gestureBar.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    on(gestureBar, 'pointerup', (event) => {
      if (!active) return;
      active = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const elapsed = performance.now() - startedAt;

      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
        return cycle(dx < 0 ? 1 : -1);
      }

      if (dy < -40) {
        // Velocity is what separates the two upward gestures: a quick flick
        // means home, a slow deliberate pull means show me everything.
        const velocity = Math.abs(dy) / Math.max(elapsed, 1);
        if (dy < -110 || elapsed > 260 || velocity < 0.5) return openRecents();
        return goHome();
      }

      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) goHome();
    });

    on(gestureBar, 'pointercancel', () => { active = false; });

    on(gestureBar, 'keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goHome();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        openRecents();
      }
    });
  })();

  /* --------------------------------------------------------------- wiring */

  /* See the matching note in desktop.js: both shells are live for the whole
     session, so each one ignores events while it is not the active scene. */
  const isActive = () => scene.classList.contains('on');

  const unsubscribes = [
    subscribe('app:launch', ({ id }) => {
      if (!isActive()) return;
      const match = appMeta(id) ?? APPS.find((app) => app.name.toLowerCase() === id);
      if (!match) return toast(`No app called “${id}”.`);
      openApp(match.id);
    }),
    subscribe('app:close', () => { if (isActive()) goHome(); }),
    subscribe('fs:change', () => { if (isActive()) updateStageTitle(); }),
  ];

  const clockTimer = setInterval(tickClock, 1000);

  renderLauncher();
  renderControlCentre();
  tickClock();

  return {
    open: openApp,
    goHome,
    activate() {
      renderLauncher();
      tickClock();
    },
    hasApp: () => Boolean(currentId),
    /** Tear down session state without unbinding the shell itself. */
    reset() {
      if (currentId) appInstance(currentId).onHide?.();
      currentId = null;
      recentIds = [];
      delete scene.dataset.app;
      fill(stageBody);
      closeRecents();
      closeControlCentre();
      dimmer.style.opacity = '0';
      brightness.value = '100';
    },
  };
}
