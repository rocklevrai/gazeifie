/* ==========================================================================
   theme.js — accent, wallpaper, and appearance.

   All three write CSS custom properties onto #device. Nothing recolours a
   component directly, which is why adding the light appearance cost one
   block in tokens.css and nothing anywhere else.
   ========================================================================== */

import { emit, system, setTheme as setThemeState } from '../core/state.js';

let device = null;
const root = () => (device ??= document.getElementById('device'));

/* --------------------------------------------------------------------------
   Accent
   -------------------------------------------------------------------------- */

export const ACCENTS = [
  { id: 'amber',  name: 'Amber',  value: '#f2a25c', ink: '#1c1307' },
  { id: 'mint',   name: 'Mint',   value: '#6fd3c7', ink: '#04211d' },
  { id: 'rose',   name: 'Rose',   value: '#f0839f', ink: '#2a0a13' },
  { id: 'iris',   name: 'Iris',   value: '#a48ce0', ink: '#150b28' },
  { id: 'lime',   name: 'Lime',   value: '#a8d45c', ink: '#141f05' },
  { id: 'sky',    name: 'Sky',    value: '#6ea8fe', ink: '#08101f' },
];

/**
 * Set the accent, or pass null to hand control back to the skin default.
 *
 * This has to be an inline style rather than a rule on :root. Each skin block
 * in tokens.css also defines --accent, and a selector like [data-os="phone"]
 * outranks :root — so a :root override would silently lose. An inline style
 * on the element is the only thing that reliably wins.
 */
export function setAccent(id) {
  const accent = ACCENTS.find((a) => a.id === id);
  system.accent = accent ? accent.id : null;

  if (accent) {
    root().style.setProperty('--accent', accent.value);
    root().style.setProperty('--accent-ink', accent.ink);
  } else {
    root().style.removeProperty('--accent');
    root().style.removeProperty('--accent-ink');
  }
  emit('accent:change', system.accent);
}

/* --------------------------------------------------------------------------
   Wallpaper
   Index 0 always means "whatever this skin ships with", so switching between
   the desktop and the phone doesn't strand you on a background designed for
   the other one.
   -------------------------------------------------------------------------- */

export const WALLPAPERS = [
  {
    id: 'default',
    name: 'Default',
    chip: 'linear-gradient(140deg,#3b3157,#1a1824)',
    css: null,
  },
  {
    id: 'ember',
    name: 'Ember',
    chip: 'linear-gradient(140deg,#f2a25c,#4a1d1d)',
    css:
      'radial-gradient(72% 52% at 18% 6%, rgba(255,176,92,.34), transparent 62%),' +
      'radial-gradient(60% 46% at 84% 26%, rgba(214,74,74,.30), transparent 66%),' +
      'linear-gradient(165deg,#2a1710 0%,#20131a 52%,#140d14 100%)',
  },
  {
    id: 'tide',
    name: 'Tide',
    chip: 'linear-gradient(140deg,#5ad2c8,#123a5c)',
    css:
      'radial-gradient(70% 50% at 22% 8%, rgba(90,210,200,.30), transparent 62%),' +
      'radial-gradient(64% 48% at 84% 30%, rgba(58,124,214,.34), transparent 68%),' +
      'linear-gradient(168deg,#0d2136 0%,#0d1c2e 52%,#0a1220 100%)',
  },
  {
    id: 'moss',
    name: 'Moss',
    chip: 'linear-gradient(140deg,#8fc46a,#16301f)',
    css:
      'radial-gradient(70% 50% at 24% 8%, rgba(143,196,106,.26), transparent 62%),' +
      'radial-gradient(58% 44% at 82% 28%, rgba(74,158,132,.28), transparent 68%),' +
      'linear-gradient(168deg,#152618 0%,#132019 52%,#0d1611 100%)',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    chip: 'linear-gradient(140deg,#e88bc0,#3a2160)',
    css:
      'radial-gradient(70% 50% at 20% 6%, rgba(232,139,192,.30), transparent 62%),' +
      'radial-gradient(62% 46% at 86% 26%, rgba(140,110,232,.34), transparent 68%),' +
      'linear-gradient(168deg,#241634 0%,#1d1430 52%,#130e1f 100%)',
  },
  {
    id: 'slate',
    name: 'Slate',
    chip: 'linear-gradient(140deg,#8a90a0,#1b1e26)',
    css: 'linear-gradient(168deg,#242832 0%,#1b1e26 55%,#141720 100%)',
  },
];

export function setWallpaper(id) {
  const paper = WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
  system.wallpaper = paper.id;

  if (paper.css) root().style.setProperty('--wall', paper.css);
  else root().style.removeProperty('--wall');

  emit('wallpaper:change', paper.id);
}

/* --------------------------------------------------------------------------
   Appearance
   -------------------------------------------------------------------------- */

export function setAppearance(theme) {
  setThemeState(theme);
  root().dataset.theme = theme;
}

/** Reset visual choices — used when returning to the interface picker. */
export function resetTheme() {
  setAccent(null);
  setWallpaper('default');
  setAppearance('dark');
}
