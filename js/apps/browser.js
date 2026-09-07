/* ==========================================================================
   browser.js — the one app that admits it is running inside a real browser.

   YouTube sends X-Frame-Options, so it can never be embedded here. The old
   copy apologised for that at some length. This says what will happen and
   gives you the button.
   ========================================================================== */

import { h } from '../core/dom.js';
import { openExternal, hostOf } from '../core/external.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

const SITES = [
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com' },
];

export function createBrowser() {
  const bar = h('div.url-bar',
    icon('external'),
    h('span.u-host', hostOf(SITES[0].url)),
  );

  function go(site) {
    bar.lastElementChild.textContent = hostOf(site.url);
    if (!openExternal(site.url)) {
      toast('Your browser blocked the pop-up. Allow pop-ups for this page, then try again.', 3600);
    }
  }

  const element = h('div.app-root',
    h('div.pane',
      bar,
      h('p.muted', { style: { margin: 'var(--s4) 0' } },
        'These sites refuse to be embedded, so they open in a real tab rather than inside the device.'),
      h('div', { style: { display: 'grid', gap: 'var(--s2)' } },
        SITES.map((site) => h('button.btn', {
          style: { justifyContent: 'space-between', padding: '11px var(--s3)' },
          onclick: () => go(site),
        }, site.name, icon('external')))),
    ),
  );

  return { element, subtitle: () => hostOf(SITES[0].url) };
}
