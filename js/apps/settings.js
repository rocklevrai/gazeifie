/* ==========================================================================
   settings.js

   Grouped rather than presented as one flat list, and the hostname is edited
   in place. The original opened a browser `prompt()` for it, which pops a
   dialog belonging to Chrome or Safari right on top of the fake OS — and
   which iOS will refuse to show at all after a couple of uses, leaving the
   Rename button apparently broken.
   ========================================================================== */

import { h, fill, on } from '../core/dom.js';
import { emit, subscribe, system, setHost } from '../core/state.js';
import { ACCENTS, WALLPAPERS, setAccent, setWallpaper, setAppearance } from '../ui/theme.js';
import { fs, touched } from '../fs/filesystem.js';
import { toast } from '../ui/toast.js';

const HOSTNAME_PATTERN = /^[a-z0-9-]{1,32}$/i;

export function createSettings() {
  const pane = h('div.pane');
  const element = h('div.app-root', pane);

  /* ------------------------------------------------------------- fragments */

  function row(label, hint, control) {
    return h('div.set-row',
      h('div', h('div.sr-label', label), hint && h('div.sr-hint', hint)),
      h('div.sr-control', control),
    );
  }

  function accentChips() {
    const chips = ACCENTS.map((accent) => h('button.chip', {
      style: { background: accent.value },
      title: accent.name,
      'aria-label': `Accent: ${accent.name}`,
      'aria-pressed': String(system.accent === accent.id),
      onclick: () => setAccent(accent.id),
    }));
    return h('div.chips', chips);
  }

  function wallpaperChips() {
    return h('div.chips', WALLPAPERS.map((paper) => h('button.chip.wide', {
      style: { background: paper.chip },
      title: paper.name,
      'aria-label': `Background: ${paper.name}`,
      'aria-pressed': String(system.wallpaper === paper.id),
      onclick: () => setWallpaper(paper.id),
    })));
  }

  function appearanceControl() {
    const make = (value, label) => h('button', {
      'aria-pressed': String(system.theme === value),
      onclick: () => setAppearance(value),
    }, label);
    return h('div.seg', make('dark', 'Dark'), make('light', 'Light'));
  }

  function hostnameControl() {
    const field = h('input.field', {
      value: system.host,
      maxlength: 32,
      'aria-label': 'Hostname',
      style: { width: '150px' },
    });

    const save = () => {
      const next = field.value.trim();
      if (next === system.host) return;
      if (!HOSTNAME_PATTERN.test(next)) {
        toast('Hostnames use letters, digits and hyphens only.');
        field.value = system.host;
        return;
      }
      setHost(next.toLowerCase());
      fs.etc.hostname = `${system.host}\n`;
      touched();
      field.value = system.host;
      toast(`Hostname is now ${system.host}`);
    };

    on(field, 'keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); field.blur(); }
      if (event.key === 'Escape') { field.value = system.host; field.blur(); }
    });
    on(field, 'blur', save);

    return field;
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    const onDesktop = system.os === 'desktop';

    fill(pane,
      h('div.set-group-title', 'Appearance'),
      row('Accent', 'Used across both interfaces', accentChips()),
      row('Background', 'Applies to the current interface', wallpaperChips()),
      onDesktop && row('Theme', 'Light keeps the terminal dark', appearanceControl()),

      h('div.set-group-title', 'Device'),
      row('Hostname', 'Shown in the shell prompt and neofetch', hostnameControl()),

      h('div.set-group-title', 'System'),
      row('Restart', 'Replays the boot sequence', h('button.btn', {
        onclick: () => emit('system:restart'),
      }, 'Restart')),
      row('Switch interface', 'Return to the chooser', h('button.btn', {
        onclick: () => emit('system:switch'),
      }, 'Switch')),
      row('Release', null, h('span.muted', 'gazéifié 1.0')),
    );
  }

  // Changes made from the shell (`accent mint`, `wallpaper tide`) have to be
  // reflected here, or the pressed state lies about what is selected.
  for (const event of ['accent:change', 'wallpaper:change', 'theme:change', 'os:change', 'host:change']) {
    subscribe(event, () => {
      if (element.isConnected) render();
    });
  }

  render();

  return {
    element,
    onShow: render,
  };
}
