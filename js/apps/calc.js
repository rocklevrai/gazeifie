/* ==========================================================================
   calc.js

   The arithmetic is separated from the keypad here, which fixes two things
   the original got wrong:

     · `%` divided the entry by 100 with no reference to the pending operation,
       so `200 + 10 %` gave 0.1 rather than 20
     · pressing `=` repeatedly did nothing after the first press; real
       calculators repeat the last operation, and people rely on that
   ========================================================================== */

import { h, fill, on } from '../core/dom.js';

const DIVIDE = '\u00f7';
const MULTIPLY = '\u00d7';
const MINUS = '\u2212';
const BACKSPACE = '\u232b';
const SIGN = '\u00b1';

const LAYOUT = [
  ['C', 'fn'], [BACKSPACE, 'fn'], ['%', 'fn'], [DIVIDE, 'op'],
  ['7', ''], ['8', ''], ['9', ''], [MULTIPLY, 'op'],
  ['4', ''], ['5', ''], ['6', ''], [MINUS, 'op'],
  ['1', ''], ['2', ''], ['3', ''], ['+', 'op'],
  [SIGN, 'fn'], ['0', ''], ['.', ''], ['=', 'eq'],
];

/** Map a physical key to the label it stands for. */
const FROM_KEYBOARD = {
  '/': DIVIDE, '*': MULTIPLY, x: MULTIPLY, '-': MINUS, '+': '+',
  Enter: '=', '=': '=', Backspace: BACKSPACE, Escape: 'C', c: 'C',
  '%': '%', '.': '.', ',': '.',
};

function operate(a, operator, b) {
  switch (operator) {
    case '+': return a + b;
    case MINUS: return a - b;
    case MULTIPLY: return a * b;
    case DIVIDE: return b === 0 ? Number.NaN : a / b;
    default: return b;
  }
}

/**
 * Resolve a pending operation into what the display should read.
 *
 * Errors should say what happened. "Not a number" is what NaN formats to, but
 * it describes the value rather than the mistake — the person divided by zero
 * and deserves to be told so.
 */
function resolve(a, operator, b) {
  if (operator === DIVIDE && b === 0) return 'Cannot divide by 0';
  return format(operate(a, operator, b));
}

/** Trim floating-point noise without lying about large or small numbers. */
function format(value) {
  if (Number.isNaN(value)) return 'Not a number';
  if (!Number.isFinite(value)) return 'Infinity';

  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e12 || magnitude < 1e-9)) {
    return value.toExponential(6).replace('e', 'e');
  }
  return String(Number(value.toPrecision(12)));
}

/** Spoken names for keys whose glyph does not read well aloud. */
const KEY_LABELS = {
  [DIVIDE]: 'divide',
  [MULTIPLY]: 'multiply',
  [MINUS]: 'minus',
  [BACKSPACE]: 'backspace',
  [SIGN]: 'plus or minus',
  '+': 'plus',
  '.': 'decimal point',
  '%': 'percent',
  C: 'clear',
  '=': 'equals',
};

export function createCalculator() {
  let accumulator = null;
  let operator = null;
  let entry = '0';
  let fresh = true;
  /** Remembered so `=` can repeat, the way a physical calculator does. */
  let repeat = null;

  const expression = h('div.calc-expr');
  const value = h('div.calc-val', { role: 'status', 'aria-live': 'polite' });
  const pad = h('div.calc-pad');

  const element = h('div.app-root', { tabindex: 0 },
    h('div.calc',
      h('div.calc-out', expression, value),
      pad,
    ),
  );

  function draw() {
    value.textContent = entry;
    expression.textContent = operator !== null ? `${format(accumulator)} ${operator}` : '';
  }

  function reset() {
    accumulator = null;
    operator = null;
    entry = '0';
    fresh = true;
    repeat = null;
  }

  function press(key) {
    if (/^\d$/.test(key)) {
      entry = fresh || entry === '0' ? key : entry + key;
      fresh = false;
      return draw();
    }

    switch (key) {
      case '.':
        if (fresh) { entry = '0.'; fresh = false; }
        else if (!entry.includes('.')) entry += '.';
        break;

      case 'C':
        reset();
        break;

      case BACKSPACE:
        entry = entry.length > 1 ? entry.slice(0, -1) : '0';
        if (entry === '0' || entry === '-') { entry = '0'; fresh = true; }
        break;

      case SIGN:
        entry = entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
        break;

      case '%': {
        // A percentage is relative to the pending left-hand side when there
        // is one: 200 + 10% means 200 + 20, not 200 + 0.1.
        const current = parseFloat(entry) || 0;
        const base = operator !== null && accumulator !== null ? accumulator : 1;
        entry = format((current / 100) * (operator === null ? 1 : base));
        fresh = true;
        break;
      }

      case '=': {
        const current = parseFloat(entry) || 0;
        if (operator !== null) {
          repeat = { operator, operand: current };
          entry = resolve(accumulator, operator, current);
          accumulator = null;
          operator = null;
        } else if (repeat) {
          entry = resolve(current, repeat.operator, repeat.operand);
        }
        fresh = true;
        break;
      }

      default: {
        // An operator key.
        const current = parseFloat(entry) || 0;
        // Chaining (2 + 3 + …) resolves the pending operation first; changing
        // your mind about the operator (2 + × ) just swaps it.
        if (operator !== null && !fresh) {
          entry = resolve(accumulator, operator, current);
          // A failed operation must not be carried into the next one.
          accumulator = Number.parseFloat(entry);
          if (Number.isNaN(accumulator)) accumulator = 0;
        } else {
          accumulator = current;
          entry = format(accumulator);
        }
        operator = key;
        fresh = true;
        repeat = null;
      }
    }

    draw();
  }

  fill(pad, LAYOUT.map(([label, kind]) => h('button.key', {
    class: kind,
    'aria-label': KEY_LABELS[label] ?? label,
    onclick: () => press(label),
  }, label)));

  on(element, 'keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const label = /^\d$/.test(event.key) ? event.key : FROM_KEYBOARD[event.key];
    if (!label) return;
    event.preventDefault();
    press(label);
  });

  draw();

  return {
    element,
    onShow() { element.focus({ preventScroll: true }); },
  };
}
