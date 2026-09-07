/* ==========================================================================
   dom.js — a ~70 line hyperscript layer.

   The old build constructed UI two ways at once: innerHTML template strings
   for some nodes, createElement chains for others, and re-queried the document
   by id every time it needed a reference — including inside a 1Hz timer.

   Everything here builds nodes once and keeps the reference. `h()` covers the
   template-string cases without the injection risk that came with them.
   ========================================================================== */

/**
 * Build an element.
 *
 *   h('div.row', { onclick: fn }, 'text', childNode)
 *   h('button.btn.primary', { 'aria-pressed': true }, 'Save')
 *
 * @param {string} spec  tag plus optional .classes  ('span', 'div.row.dim')
 * @param {object} [props]
 * @param {...(Node|string|number|false|null|Array)} children
 */
export function h(spec, props, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');

  // A bare child in the props slot — h('div', 'hello') — is a common slip and
  // cheap to support correctly.
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;

    if (key === 'class' || key === 'className') {
      el.className = el.className ? `${el.className} ${value}` : String(value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'text') {
      el.textContent = String(value);
    } else if (key === 'html') {
      // Only ever called with markup this codebase authored — never with
      // filenames, note contents, or anything else a person can type.
      el.innerHTML = value;
    } else if (key in el && key !== 'list' && typeof value !== 'boolean') {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }

  append(el, children);
  return el;
}

/** Append children of any shape, skipping nullish and false. */
export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Replace an element's contents. */
export function fill(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Add a listener and get back its remover. Apps use the returned function in
 * their teardown so nothing is left listening to a detached node.
 */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Coalesce bursty callers into one call per animation frame. Pointermove
 * during a window drag fires far faster than the display refreshes; without
 * this, every one of those events triggers its own layout.
 */
export function rafThrottle(fn) {
  let frame = 0;
  let latest;
  return function throttled(...args) {
    latest = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn.apply(this, latest);
    });
  };
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const pad2 = (n) => String(n).padStart(2, '0');
