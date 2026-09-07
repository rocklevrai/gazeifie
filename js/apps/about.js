/* ==========================================================================
   about.js — what this thing is running on.

   Read fresh each time it is shown: viewport size and network state change
   while the app sits open, and a spec sheet that lies is worse than none.
   ========================================================================== */

import { h, fill } from '../core/dom.js';
import { system, uptimeShort } from '../core/state.js';

export function createAbout() {
  const list = h('dl.pane');
  const element = h('div.app-root', list);

  const installed = () =>
    matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  function render() {
    const rows = [
      ['Hostname', system.host],
      ['User', system.user],
      ['Interface', system.os === 'phone' ? 'Phone' : 'Desktop'],
      ['Release', 'gazéifié 1.0'],
      ['Kernel', system.os === 'phone' ? '6.9.0-arm64 (mobile)' : '6.9.0-arm64'],
      ['Uptime', uptimeShort()],
      ['Display', `${screen.width}×${screen.height} at ${window.devicePixelRatio || 1}×`],
      ['Viewport', `${innerWidth}×${innerHeight}`],
      ['Memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'not reported'],
      ['Processors', navigator.hardwareConcurrency || 'not reported'],
      ['Network', navigator.onLine ? 'Connected' : 'Offline'],
      ['Installed', installed() ? 'Yes, from the home screen' : 'No, running in a browser tab'],
      ['Storage', 'In memory — everything resets when the tab closes'],
    ];

    fill(list, rows.map(([term, definition]) =>
      h('div.spec-row', h('dt', term), h('dd', String(definition)))));
  }

  render();

  return {
    element,
    onShow: render,
  };
}
