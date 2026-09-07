/* ==========================================================================
   main.js — scene routing and lifecycle.

   Exactly one scene is on at a time: picker → boot → desktop | phone. The
   original spread this across a `show()` function that handled full-screen
   views, window opening, navbar visibility, per-app refresh hooks and phone
   recents bookkeeping all in one body, with two more copies of the same
   post-open logic elsewhere. Routing is separated from what each shell does
   with the route.
   ========================================================================== */

import { h, fill, qs, on } from './core/dom.js';
import { subscribe, system, setOS } from './core/state.js';
import { openExternal } from './core/external.js';
import { icon } from './ui/icons.js';
import { createMenuBar } from './ui/menubar.js';
import { resetTheme } from './ui/theme.js';
import { toast, hideToast } from './ui/toast.js';
import { runBoot, cancelBoot } from './shell/boot.js';
import { createDesktopShell } from './shell/desktop.js';
import { createPhoneShell } from './shell/phone.js';
import { disposeApps } from './apps/registry.js';

const device = qs('#device');
const navbar = qs('#navbar');
const scenes = {
  picker: qs('#picker'),
  boot: qs('#boot'),
  desktop: qs('#desktop'),
  phone: qs('#phone'),
};

const menubar = createMenuBar();

// Shells are built on first use and then live for the session. Rebuilding
// them per switch would re-bind their document-level listeners each time.
let desktopShell = null;
let phoneShell = null;
const getDesktop = () => (desktopShell ??= createDesktopShell());
const getPhone = () => (phoneShell ??= createPhoneShell());

/* -------------------------------------------------------------- routing */

function showScene(name) {
  for (const [id, element] of Object.entries(scenes)) {
    element.classList.toggle('on', id === name);
  }

  const chrome = name === 'desktop' || name === 'phone';
  menubar[chrome ? 'show' : 'hide']();
  navbar.toggleAttribute('hidden', !(chrome && system.os === 'phone'));
}

/* --------------------------------------------------------------- picker */

const CHOICES = [
  {
    os: 'desktop',
    name: 'Desktop',
    desc: 'Floating windows, a dock, and a shell over the filesystem.',
    icon: 'terminal',
    tint: 'linear-gradient(150deg,#f2a25c,#b7602a)',
  },
  {
    os: 'phone',
    name: 'Phone',
    desc: 'A launcher, gesture navigation, and one app at a time.',
    icon: 'home',
    tint: 'linear-gradient(150deg,#6ea8fe,#7b56d6)',
  },
];

function renderPicker() {
  fill(scenes.picker,
    h('div',
      h('h1.pick-head', 'gazéifié'),
      h('p.pick-sub', 'A small computer that runs in a browser tab. Pick an interface to start.'),
    ),
    h('div.pick-grid', CHOICES.map((choice) => h('button.pick-card', {
      onclick: () => boot(choice.os),
    },
      h('span.pk-mark', { style: { background: choice.tint } }, icon(choice.icon)),
      h('span.pk-name', choice.name),
      h('span.pk-desc', choice.desc),
    ))),
  );
}

/* ------------------------------------------------------------ lifecycle */

function boot(os) {
  setOS(os);
  device.dataset.os = os;
  device.dataset.theme = system.theme;

  showScene('boot');
  runBoot(os, () => {
    showScene(os);
    (os === 'desktop' ? getDesktop() : getPhone()).activate();
  });
}

function restart() {
  const shell = system.os === 'desktop' ? getDesktop() : getPhone();
  shell.reset();
  boot(system.os);
}

function toPicker() {
  cancelBoot();
  hideToast();
  desktopShell?.reset();
  phoneShell?.reset();
  disposeApps();
  resetTheme();

  setOS(null);
  delete device.dataset.os;
  delete device.dataset.theme;
  showScene('picker');
}

/* --------------------------------------------------------------- wiring */

subscribe('system:restart', restart);
subscribe('system:switch', toPicker);

subscribe('external:open', (url) => {
  if (!openExternal(url)) {
    toast('Your browser blocked the pop-up. Allow pop-ups for this page, then try again.', 3600);
  }
});

// Something in the boot sequence or a shell can fail without taking the whole
// device down; say so rather than freezing on a half-drawn screen.
on(window, 'error', (event) => {
  console.error(event.error ?? event.message);
  toast('Something went wrong. Check the console for details.', 4000);
});

renderPicker();
showScene('picker');
