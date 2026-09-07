/* ==========================================================================
   icons.js — one stroked icon set, drawn on a 24×24 grid.

   The old build used Unicode characters as interface controls (✕ – ▸ ⚙ ◴).
   Those render at whatever weight and baseline each platform happens to have,
   which is why the close button sat a pixel high on some devices and looked
   like a different typeface on others. These are geometry, so they don't move.
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  close:     'M6 6l12 12M18 6L6 18',
  minus:     'M5 12h14',
  maximise:  'M5.5 5.5h13v13h-13z',
  restore:   'M8.5 8.5h10v10h-10z M5.5 15.5v-10h10',
  chevronL:  'M14.5 5.5L8 12l6.5 6.5',
  chevronR:  'M9.5 5.5L16 12l-6.5 6.5',
  arrowUp:   'M12 19.5V5M5.5 11.5L12 5l6.5 6.5',
  folder:    'M3 18.5v-12A1.5 1.5 0 0 1 4.5 5h4L11 8h8.5A1.5 1.5 0 0 1 21 9.5v9A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z',
  file:      'M6 3.5h8l4 4v13H6z M14 3.5v4h4',
  terminal:  'M5.5 7.5L10 12l-4.5 4.5M12.5 16.5h6',
  pencil:    'M4 20h4.2L20 8.2 15.8 4 4 15.8z M14.5 5.5L18.5 9.5',
  play:      'M8.5 5.2v13.6L19 12z',
  calc:      'M6.5 3.5h11v17h-11z M9.5 7.5h5 M9.5 12h.01 M12 12h.01 M14.5 12h.01 M9.5 16h.01 M12 16h.01 M14.5 16h.01',
  timer:     'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9.5V13l2.5 2 M9.5 2.5h5',
  sliders:   'M4 7h6M14 7h6M4 17h10M18 17h2 M12 4.5v5 M16 14.5v5',
  info:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5.5 M12 7.6v.01',
  wifi:      'M2.5 8.6a15 15 0 0 1 19 0 M6 12.2a10 10 0 0 1 12 0 M9.4 15.7a5 5 0 0 1 5.2 0 M12 19.2v.01',
  bluetooth: 'M7.5 7.5L16.5 16.5 12 20V4l4.5 3.5L7.5 16.5',
  moon:      'M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z',
  rotate:    'M20 11.5a8 8 0 1 0-2.4 5.8 M20 5.5v6h-6',
  sun:       'M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M18.7 5.3l-1.4 1.4 M6.7 17.3l-1.4 1.4',
  external:  'M14 4.5h5.5V10 M19.5 4.5L11 13 M18 14v5.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1h5',
  trash:     'M4.5 7h15 M9.5 7V4h5v3 M6.5 7l1 13.5h9L17.5 7',
  plus:      'M12 5.5v13M5.5 12h13',
  power:     'M12 3.5v8.5 M6.6 6.9a7.5 7.5 0 1 0 10.8 0',
  swap:      'M4 8.5h13l-3.5-3.5 M20 15.5H7l3.5 3.5',
  home:      'M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  check:     'M5 12.5l4.5 4.5L19 7.5',
};

/**
 * @param {keyof PATHS} name
 * @param {{size?: number, title?: string}} [opts]
 * @returns {SVGElement}
 */
export function icon(name, opts = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (opts.size) {
    svg.setAttribute('width', opts.size);
    svg.setAttribute('height', opts.size);
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name] || PATHS.info);
  svg.appendChild(path);
  return svg;
}

export const hasIcon = (name) => name in PATHS;
