/* ==========================================================================
   stopwatch.js

   Two fixes over the original:

     · it drove the display with setInterval(31), which fights the refresh
       rate and keeps ticking when the app is nowhere on screen. It is now on
       requestAnimationFrame, which the browser pauses in a background tab and
       which lines up with the frames actually being drawn.
     · elapsed time is always computed from timestamps rather than accumulated
       per tick, so a throttled or skipped frame cannot make the clock drift.
   ========================================================================== */

import { h, fill, on, pad2 } from '../core/dom.js';

export function createStopwatch() {
  let running = false;
  let startedAt = 0;
  let carried = 0;
  let frame = 0;
  let visible = false;
  let laps = [];
  let lastSplit = 0;

  const readout = h('div.sw-time', { role: 'timer', 'aria-live': 'off' });
  const lapList = h('div.sw-laps');

  const startButton = h('button.btn.primary', { onclick: toggle }, 'Start');
  const lapButton = h('button.btn', { onclick: recordLap, disabled: true }, 'Lap');
  const resetButton = h('button.btn', { onclick: reset, disabled: true }, 'Reset');

  const element = h('div.app-root',
    h('div.sw',
      readout,
      h('div.sw-controls', startButton, lapButton, resetButton),
      lapList,
    ),
  );

  const elapsed = () => carried + (running ? Date.now() - startedAt : 0);

  function formatTime(ms) {
    const centiseconds = Math.floor(ms / 10) % 100;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    const head = hours ? `${hours}:${pad2(minutes)}` : pad2(minutes);
    return [`${head}:${pad2(seconds)}`, pad2(centiseconds)];
  }

  function draw() {
    const [main, centiseconds] = formatTime(elapsed());
    fill(readout, main, h('span.cs', `.${centiseconds}`));
  }

  function tick() {
    draw();
    frame = running && visible ? requestAnimationFrame(tick) : 0;
  }

  function startTicking() {
    if (!frame && running && visible) frame = requestAnimationFrame(tick);
  }

  function stopTicking() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function toggle() {
    if (running) {
      carried = elapsed();
      running = false;
      stopTicking();
      startButton.textContent = 'Start';
      startButton.classList.add('primary');
    } else {
      startedAt = Date.now();
      running = true;
      startButton.textContent = 'Stop';
      startButton.classList.remove('primary');
      startTicking();
    }
    lapButton.disabled = !running;
    resetButton.disabled = false;
    draw();
  }

  function recordLap() {
    const total = elapsed();
    if (!total) return;
    laps.push({ split: total - lastSplit, total });
    lastSplit = total;
    renderLaps();
  }

  function reset() {
    running = false;
    stopTicking();
    carried = 0;
    lastSplit = 0;
    laps = [];
    startButton.textContent = 'Start';
    startButton.classList.add('primary');
    lapButton.disabled = true;
    resetButton.disabled = true;
    draw();
    renderLaps();
  }

  function renderLaps() {
    if (!laps.length) {
      fill(lapList, h('div.empty',
        h('strong', 'No laps yet'),
        'Press Lap while the timer runs to record a split.',
      ));
      return;
    }

    // Only worth marking a fastest and slowest once there is a race to run.
    const splits = laps.map((lap) => lap.split);
    const fastest = laps.length > 2 ? Math.min(...splits) : null;
    const slowest = laps.length > 2 ? Math.max(...splits) : null;

    fill(lapList, laps.map((lap, index) => {
      const [split, splitCs] = formatTime(lap.split);
      const [total, totalCs] = formatTime(lap.total);
      return h('div.lap', {
        class: [lap.split === fastest && 'best', lap.split === slowest && 'worst']
          .filter(Boolean).join(' '),
      },
        h('span.lp-n', `Lap ${index + 1}`),
        h('span.lp-split', `${split}.${splitCs}`),
        h('span.lp-total', `${total}.${totalCs}`),
      );
    }).reverse());
  }

  draw();
  renderLaps();

  return {
    element,
    subtitle: () => (running ? 'running' : null),
    onShow() {
      visible = true;
      draw();
      startTicking();
    },
    onHide() {
      // The clock keeps running — closing the app should not lose your time —
      // but there is no reason to paint frames nobody can see.
      visible = false;
      stopTicking();
    },
  };
}
