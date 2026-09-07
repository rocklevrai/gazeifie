/* ==========================================================================
   menubar.js — the top strip.

   The original re-queried the document by id five times a second inside its
   clock tick, and wrote the same string into the DOM every time whether or
   not the minute had changed. References are held once here, and each field
   only touches the DOM when its value actually differs.
   ========================================================================== */

import { h, fill, qs, on, pad2 } from '../core/dom.js';
import { subscribe, system } from '../core/state.js';
import { icon } from '../ui/icons.js';

export function createMenuBar() {
  const bar = qs('#menubar');

  const time = h('span.mb-time');
  const place = h('span.mb-place');
  const dnd = h('span', { style: { display: 'none' } }, icon('moon', { size: 12 }));
  const network = h('span');
  const level = h('span.fill');
  const percent = h('span');
  const battery = h('span.battery', percent, h('span.cell', level));

  fill(bar,
    h('div.mb-left', time, place),
    h('div.mb-right', dnd, network, battery),
  );

  let lastTime = '';
  let lastNetwork = '';
  let override = null;

  function tick() {
    const now = new Date();
    const next = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    if (next !== lastTime) {
      lastTime = next;
      time.textContent = next;
    }
  }

  function renderNetwork() {
    const label = override ?? (navigator.onLine
      ? (system.os === 'phone' ? 'wlan0' : 'eth0')
      : 'offline');
    if (label === lastNetwork) return;
    lastNetwork = label;
    network.textContent = label;
  }

  function renderBattery(status) {
    const value = Math.round(status.level * 100);
    percent.textContent = `${value}%`;
    level.style.setProperty('--level', `${value}%`);
    battery.dataset.low = String(value <= 20 && !status.charging);
  }

  // Not every browser exposes the Battery API. Rather than showing a
  // hard-coded "100%" that is simply untrue, the indicator is hidden.
  if (navigator.getBattery) {
    navigator.getBattery().then((status) => {
      renderBattery(status);
      for (const event of ['levelchange', 'chargingchange']) {
        status.addEventListener(event, () => renderBattery(status));
      }
    }).catch(() => { battery.style.display = 'none'; });
  } else {
    battery.style.display = 'none';
  }

  try {
    place.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone
      .split('/').pop().replace(/_/g, ' ');
  } catch {
    place.textContent = '';
  }

  on(window, 'online', renderNetwork);
  on(window, 'offline', renderNetwork);
  subscribe('net:override', (value) => { override = value; renderNetwork(); });
  subscribe('dnd:change', (active) => { dnd.style.display = active ? 'inline-flex' : 'none'; });
  subscribe('os:change', () => { lastNetwork = ''; renderNetwork(); });

  const timer = setInterval(tick, 1000);
  tick();
  renderNetwork();

  return {
    show: () => bar.removeAttribute('hidden'),
    hide: () => bar.setAttribute('hidden', ''),
    destroy: () => clearInterval(timer),
  };
}
