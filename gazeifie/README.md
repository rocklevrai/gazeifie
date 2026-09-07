# gazéifié

A small computer that runs in a browser tab. Boots into one of two interfaces:
a **Desktop** with floating windows, a dock and a shell, or a **Phone** with a
launcher, gesture navigation and a recents switcher. Both run against the same
in-memory filesystem, so a file you create in the terminal appears in Files
while you are looking at it.

---

## Running it

The code uses ES modules, so it needs to be served over HTTP. Opening
`index.html` from the file system directly will fail with a CORS error — that
is a browser rule about `file://`, not a bug in the app.

```bash
cd gazeifie
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works: `npx serve`, `php -S localhost:8000`, a Netlify or
GitHub Pages drop, whatever you already use. There is no build step, no
bundler and no dependencies.

---

## Layout

```
index.html                 60-line skeleton; all content is built in JS
manifest.webmanifest       home-screen install
icon.svg, apple-touch-icon.png

css/
  tokens.css               the whole design system: type, space, radius,
                           motion, and one palette block per skin
  base.css                 reset, device shell, responsive frame, picker, boot
  apps.css                 app components — skin-agnostic, reads tokens only
  desktop.css              window chrome, dock, desk icons
  phone.css                launcher, stage, recents, control centre

js/
  main.js                  scene routing and lifecycle
  core/
    dom.js                 h() hyperscript, rafThrottle, small helpers
    state.js               event bus + the system record
    external.js            leaving the device (pop-up blocker rules)
  fs/
    filesystem.js          the tree, path helpers, change notifications
  apps/
    registry.js            one record per app; instances are lazy singletons
    terminal.js  files.js  notes.js  calc.js
    stopwatch.js browser.js settings.js about.js
  shell/
    boot.js                both boot sequences, cancellable and skippable
    desktop.js             window manager + dock
    phone.js               launcher, gestures, recents, control centre
  ui/
    icons.js  menubar.js  toast.js  theme.js
```

### How the pieces fit

**Apps know nothing about skins.** An app returns
`{ element, subtitle?, onShow?, onHide? }` and reads only semantic tokens
(`--ink`, `--surface`, `--accent`). The same element renders correctly in a
desktop window or a full-screen phone stage with no per-skin overrides. The
previous version needed a long `[data-platform="linux"]` block to repaint every
app; none of that exists now.

**Apps are lazy singletons.** Created on first launch and kept, so closing and
reopening the terminal preserves its scrollback and the stopwatch keeps
counting.

**Shells talk to apps through the bus.** `open files` in the terminal emits
`app:launch`; whichever shell is on screen handles it. No circular imports and
no app has a reference to a window manager.

**One record per app.** `registry.js` holds the name, icon, tint and preferred
window size together. The old version spread this across four parallel arrays
(`APPS`, `APP_COLORS`, `WIN_SIZE`, `WIN_APPS`) that had to be kept in the same
order by hand.

---

## What changed

### Structure

- ~40 module-level globals (`HOST`, `PLATFORM`, `wins`, `zTop`, `cAcc`, `cOp`,
  `swRun`, `fcwd`, `recents`, …) replaced by closures and one system record.
- `document.getElementById` was called hundreds of times, including inside a
  1 Hz timer. References are held once.
- UI was built two ways at once — `innerHTML` strings and `createElement`
  chains. Now one `h()` helper, with no injection surface.
- Apps were `<section>` elements in the HTML that got physically moved into
  windows and parked back afterwards. Apps now own their element.

### Window manager

- Position is a `transform`, not `left`/`top` — composited instead of
  invalidating layout every pointer event.
- Pointer moves coalesced to one per animation frame. The old code called
  `getBoundingClientRect()` inside each `pointermove`, forcing a synchronous
  layout per event while dragging a blurred surface.
- Bounds measured once and on resize, via `ResizeObserver`.
- **New:** resize grips, double-click maximise, edge snapping with a live
  preview, `Cmd/Ctrl+W` and `Cmd/Ctrl+M`.
- The three-window cap is gone. It existed because windows were sized for a
  400px phone; the shell is responsive now.
- The dock absorbed the taskbar — one control per app showing running, focused
  and minimised state, instead of two rows each doing half the job.

### Bugs fixed

- `200 + 10%` returned `0.1`. Percentage now resolves against the pending
  left-hand side, so it returns `220`.
- Pressing `=` repeatedly did nothing after the first press. It now repeats the
  last operation, as a physical calculator does.
- Dividing by zero displayed "Not a number", which describes the value rather
  than the mistake. It now says "Cannot divide by 0" and recovers cleanly.
- The stopwatch ran on `setInterval(31)`, fighting the refresh rate and
  painting frames in background tabs. Now on `requestAnimationFrame`, with
  elapsed time computed from timestamps so a skipped frame cannot cause drift.
- Terminal scrollback grew without limit; a few hundred commands left thousands
  of nodes for the browser to lay out on every append. Capped at 400 lines.
- Boot sequences could overlap. Restarting mid-boot left the old sequence
  writing into a screen that had moved on. Sequences are now cancellable.
- `touch foo` in the terminal left the Files app showing a stale listing.
  The filesystem now publishes changes.
- `cp`/`mv` of a directory shared object references, so editing the copy
  changed the original. Directories are deep-copied, and moving a directory
  into itself is refused.
- `prompt()` and `confirm()` are gone. They are browser chrome sitting on top
  of the fake OS, and iOS suppresses them after repeated use — at which point
  Rename and New File silently stopped working. Naming happens inline;
  deleting arms the button once.
- Scenes overrode `position: absolute` with `relative`, discarding `inset: 0`
  and collapsing both shells to zero height.
- `body { color: var(--ink) }` resolved the token at body scope, so every
  element that merely inherited its colour got the wrong one. Visible in the
  light theme as row labels lighter than the hints beneath them.

### Interface

- Monospace was the UI font for everything. It is now confined to the terminal
  and boot log, where it is true.
- Unicode characters (`✕ – ▸ ⚙ ◴`) were being used as interface controls, so
  weight and baseline shifted between platforms. Replaced with a drawn SVG set.
- The Aqua homage is gone: flat controls with hover pills, hairline edges, one
  shadow, and a radius hierarchy instead of gel lozenges and pinstripes.
- Wallpapers carry the colour so the chrome can stay quiet.
- **New:** a light theme for the desktop. It costs one block in `tokens.css`
  because no component knows the theme exists.

### Responsive

- The desktop skin goes genuinely full-screen on a large display.
- The phone skin keeps its frame and bezel — a phone OS stretched across a 27"
  monitor is the wrong answer.
- Below 560px the desktop dock spans the width and icons shrink, so that skin
  stays usable on a phone rather than collapsing.

### Accessibility

- Visible focus rings throughout; every icon-only control has a label.
- Toasts are a live region, so they are announced.
- `prefers-reduced-motion` honoured in one rule. Animation-completion handlers
  fall back to timeouts, since `animationend` never fires when motion is
  reduced — otherwise closing a window under that setting would leave it on
  screen forever.
- Rows are keyboard-operable; the terminal supports Tab completion, history,
  `Ctrl+L` and `Ctrl+C`.

---

## Known limits

- The filesystem is in memory and resets when the tab closes. Persisting it to
  `localStorage` would be a contained change in `fs/filesystem.js`.
- Windows are draggable by touch but resizing wants a pointer; the grip is
  small for a fingertip.
- The terminal parser splits on whitespace and does not handle quoting, so
  `write notes.txt "two words"` keeps the quotes.
