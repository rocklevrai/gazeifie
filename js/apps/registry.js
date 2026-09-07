/* ==========================================================================
   registry.js — one record per app.

   The original spread each app's definition across four separate structures
   that had to be kept in the same order and in agreement by hand: APPS,
   APP_COLORS, WIN_SIZE and WIN_APPS. Adding an app meant editing all four,
   and forgetting one produced a grey icon or a window that opened at the
   wrong size with no error anywhere.

   Instances are created on first launch and kept, so an app kept its state
   when you close and reopen it — the terminal keeps its scrollback, the
   stopwatch keeps counting.
   ========================================================================== */

import { createTerminal } from './terminal.js';
import { createFiles } from './files.js';
import { createNotes } from './notes.js';
import { createCalculator } from './calc.js';
import { createStopwatch } from './stopwatch.js';
import { createBrowser } from './browser.js';
import { createSettings } from './settings.js';
import { createAbout } from './about.js';

export const APPS = [
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'A shell over the in-memory filesystem',
    icon: 'terminal',
    tint: 'linear-gradient(150deg,#4b5162,#282c38)',
    size: { w: 460, h: 380 },
    create: createTerminal,
  },
  {
    id: 'files',
    name: 'Files',
    tagline: 'Browse and edit the filesystem',
    icon: 'folder',
    tint: 'linear-gradient(150deg,#f0b556,#c8842a)',
    size: { w: 420, h: 400 },
    create: createFiles,
  },
  {
    id: 'notes',
    name: 'Notes',
    tagline: 'Scratchpad saved to ~/notes.txt',
    icon: 'pencil',
    tint: 'linear-gradient(150deg,#5db3ec,#2f7dc0)',
    size: { w: 380, h: 400 },
    create: createNotes,
  },
  {
    id: 'calc',
    name: 'Calculator',
    tagline: 'Arithmetic with a keypad',
    icon: 'calc',
    tint: 'linear-gradient(150deg,#ef8aa4,#c2506e)',
    size: { w: 300, h: 420 },
    create: createCalculator,
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    tagline: 'Timing with lap splits',
    icon: 'timer',
    tint: 'linear-gradient(150deg,#a189ec,#6b4fc4)',
    size: { w: 340, h: 400 },
    create: createStopwatch,
  },
  {
    id: 'browser',
    name: 'Browser',
    tagline: 'Opens real sites in a real tab',
    icon: 'play',
    tint: 'linear-gradient(150deg,#ef6d5e,#c22f26)',
    size: { w: 360, h: 320 },
    create: createBrowser,
  },
  {
    id: 'settings',
    name: 'Settings',
    tagline: 'Accent, background, hostname',
    icon: 'sliders',
    tint: 'linear-gradient(150deg,#7c8899,#4d5865)',
    size: { w: 440, h: 420 },
    create: createSettings,
  },
  {
    id: 'about',
    name: 'About',
    tagline: 'Device and browser details',
    icon: 'info',
    tint: 'linear-gradient(150deg,#6fc98d,#3d8c5c)',
    size: { w: 400, h: 400 },
    create: createAbout,
  },
];

/** Which apps sit in the dock, in order. */
export const DOCK_ORDER = ['terminal', 'files', 'notes', 'calc', 'stopwatch', 'browser', 'settings', 'about'];

/** Phone dock — four, the most a row can hold comfortably. */
export const PHONE_DOCK = ['terminal', 'files', 'notes', 'settings'];

const byId = new Map(APPS.map((app) => [app.id, app]));
const instances = new Map();

/** Metadata only — never constructs anything. */
export const appMeta = (id) => byId.get(id) ?? null;

/**
 * The live instance for an app, created on first request.
 * @returns {{element: HTMLElement, subtitle?: () => string|null,
 *            onShow?: () => void, onHide?: () => void} | null}
 */
export function appInstance(id) {
  if (instances.has(id)) return instances.get(id);

  const meta = byId.get(id);
  if (!meta) return null;

  const instance = meta.create();
  instance.meta = meta;
  instances.set(id, instance);
  return instance;
}

export const isLoaded = (id) => instances.has(id);

/** Drop every instance — used when switching interfaces, so the next boot is clean. */
export function disposeApps() {
  for (const instance of instances.values()) {
    instance.onHide?.();
    instance.onDestroy?.();
    instance.element.remove();
  }
  instances.clear();
}
