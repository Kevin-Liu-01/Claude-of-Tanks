// hudDomHarness.test-support.mjs — (lane ac130-fx-228 r3) the minimal recording DOM that hudAmmoOutPaint.selftest drives
// the real battle HUD (initHud) through, for receipts that read the HUD's own paint and element state: elements remember
// their classes, attributes, styles and queried children, and every canvas records its 2D operations (with each op's
// box in canvas space). Importing it installs the window/document globals (1280 x 720, devicePixelRatio 1); `created`
// lists every element the HUD makes, in order. Not a receipt itself (no .selftest suffix).
// --- a minimal DOM: elements remember classes, attributes, styles and their queried children; canvases record ---
const created = [];
const CONTEXT_STATE = ['strokeStyle', 'fillStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline',
  'lineCap', 'lineJoin', 'shadowBlur', 'shadowColor', 'globalCompositeOperation', 'lineDashOffset'];
function recordingContext(canvas) {
  const ops = [];
  const stack = [];
  const state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0,
    shadowColor: 'transparent', globalCompositeOperation: 'source-over', lineDashOffset: 0 };
  let dash = [];
  let path = [];
  // The current transform (a, b, c, d, e, f): every op also carries its bounding box in canvas space, so the paint is
  // read by where it lands (the rack's shells are drawn translated and rotated).
  let m = [1, 0, 0, 1, 0, 0];
  let points = [];
  const at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scale = () => Math.hypot(m[0], m[1]);
  const multiply = (n) => {
    m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  const box = (list, pad = 0) => (list.length ? {
    x0: Math.min(...list.map((p) => p[0])) - pad, y0: Math.min(...list.map((p) => p[1])) - pad,
    x1: Math.max(...list.map((p) => p[0])) + pad, y1: Math.max(...list.map((p) => p[1])) + pad,
  } : null);
  const push = (step, ...xy) => { path.push(step); for (let i = 0; i < xy.length; i += 2) points.push(at(xy[i], xy[i + 1])); };
  const ctx = {
    canvas, ops,
    save() { stack.push({ ...state, dash, m }); },
    restore() { const saved = stack.pop(); if (saved) { ({ dash, m } = saved); delete saved.dash; delete saved.m; Object.assign(state, saved); } },
    setLineDash(value) { dash = Array.from(value); }, getLineDash: () => dash.slice(),
    beginPath() { path = []; points = []; }, closePath() {},
    moveTo: (x, y) => push(['moveTo', x, y], x, y), lineTo: (x, y) => push(['lineTo', x, y], x, y),
    arc: (x, y, r, a0, a1) => push(['arc', x, y, r, a0, a1], x - r, y - r, x + r, y + r), arcTo: () => push(['arcTo']),
    ellipse: () => push(['ellipse']), rect: () => push(['rect']), roundRect: () => push(['roundRect']),
    quadraticCurveTo: (cx, cy, x, y) => push(['quad'], cx, cy, x, y), bezierCurveTo: () => push(['bezier']),
    stroke() { ops.push({ op: 'stroke', style: state.strokeStyle, lineWidth: state.lineWidth, dash: dash.slice(), path,
      box: box(points, (state.lineWidth * scale()) / 2) }); },
    fill() { ops.push({ op: 'fill', style: state.fillStyle, path, box: box(points) }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: state.fillStyle, x, y, w, h, box: box([at(x, y), at(x + w, y + h)]) }); },
    strokeRect() { ops.push({ op: 'strokeRect', style: state.strokeStyle }); },
    clearRect() { ops.push({ op: 'clear' }); },
    fillText(text, x, y) {
      const width = String(text).length * 7 * scale();
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] || 10) * scale();
      const [px, py] = at(x, y);
      const x0 = state.textAlign === 'center' ? px - width / 2 : state.textAlign === 'right' || state.textAlign === 'end' ? px - width : px;
      ops.push({ op: 'fillText', text: String(text), style: state.fillStyle, x, y,
        box: { x0, y0: py - size * 0.74, x1: x0 + width, y1: py + size * 0.08 } });
    },
    strokeText(text) { ops.push({ op: 'strokeText', text: String(text), style: state.strokeStyle }); },
    measureText: (text) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    drawImage() { ops.push({ op: 'drawImage' }); },
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; }, transform(a, b, c, d, e, f) { multiply([a, b, c, d, e, f]); },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); }, rotate(r) { multiply([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); }, clip() {},
    isPointInPath: () => false, getTransform: () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }),
  };
  for (const key of CONTEXT_STATE) Object.defineProperty(ctx, key, { get: () => state[key], set: (v) => { state[key] = v; } });
  return ctx;
}
function styleDeclaration() {
  const props = new Map();
  const api = { setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: (k) => props.get(k) ?? '',
    removeProperty: (k) => props.delete(k) };
  return new Proxy(api, {
    get: (target, key) => (key in target ? target[key] : typeof key === 'string' ? props.get(key) ?? '' : undefined),
    set: (_target, key, value) => { props.set(key, String(value)); return true; },
  });
}
class StubElement extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1;
    this.children = []; this.childNodes = this.children; this.parentNode = null;
    this.style = styleDeclaration(); this.dataset = {}; this.attrs = new Map(); this.classes = new Set();
    this.queried = new Map(); this.text = ''; this.hidden = false; this.disabled = false;
    this.width = 300; this.height = 150; this.id = ''; this.title = ''; this.isConnected = true;
    const classes = this.classes;
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => { const on = force === undefined ? !classes.has(name) : !!force; if (on) classes.add(name); else classes.delete(name); return on; },
      contains: (name) => classes.has(name),
      replace: (a, b) => { if (classes.delete(a)) classes.add(b); },
      [Symbol.iterator]: () => classes[Symbol.iterator](),
    };
    created.push(this);
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classes.add(name)); }
  get textContent() { return this.text; }
  set textContent(value) { this.text = value == null ? '' : String(value); }
  get innerHTML() { return this.html ?? ''; }
  set innerHTML(value) { this.html = String(value); this.queried.clear(); this.children.length = 0; }
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children.at(-1) ?? null; }
  get nextSibling() { return null; }
  get offsetWidth() { return 0; } get offsetHeight() { return 0; }
  get clientWidth() { return 0; } get clientHeight() { return 0; }
  get scrollWidth() { return 0; } get scrollHeight() { return 0; }
  appendChild(child) {
    if (child && typeof child === 'object') { child.parentNode?.removeChild?.(child); child.parentNode = this; this.children.push(child); }
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child) { return this.appendChild(child); }
  insertAdjacentElement(_where, child) { return this.appendChild(child); }
  insertAdjacentHTML() {} after() {} before() {} replaceWith() {}
  removeChild(child) { const at = this.children.indexOf(child); if (at >= 0) this.children.splice(at, 1); child.parentNode = null; return child; }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(...children) { this.children.length = 0; this.append(...children); }
  cloneNode() { return new StubElement(this.tagName); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  hasAttribute(key) { return this.attrs.has(key); }
  removeAttribute(key) { this.attrs.delete(key); }
  toggleAttribute(key, force) { const on = force === undefined ? !this.attrs.has(key) : !!force; if (on) this.attrs.set(key, ''); else this.attrs.delete(key); return on; }
  setAttributeNS(_ns, key, value) { this.setAttribute(key, value); }
  /** A queried child stands in for the markup's element: one per selector, stable across queries. */
  querySelector(selector) {
    if (!this.queried.has(selector)) {
      const child = new StubElement(/^(canvas|svg|small|span|button)\b/.exec(selector)?.[1] ?? 'div');
      child.parentNode = this;
      const name = /\.([\w-]+)/.exec(selector)?.[1];
      if (name) child.classes.add(name);
      this.queried.set(selector, child);
    }
    return this.queried.get(selector);
  }
  querySelectorAll() { return []; }
  getElementsByTagName() { return []; }
  closest() { return null; }
  contains(other) { return other === this; }
  matches() { return false; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  getContext() { return (this.context ??= recordingContext(this)); }
  toDataURL() { return 'data:,'; }
  focus() {} blur() {} click() {} scrollIntoView() {} scrollTo() {}
  setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return false; }
  animate() { return { cancel() {}, finish() {}, finished: Promise.resolve(), onfinish: null }; }
  getAnimations() { return []; }
  showPopover() {} hidePopover() {}
}
const WIDTH = 1280;
const HEIGHT = 720;
const documentStub = Object.assign(new EventTarget(), {
  head: new StubElement('head'), body: new StubElement('body'), documentElement: new StubElement('html'),
  visibilityState: 'visible', hidden: false, readyState: 'complete', pointerLockElement: null, fullscreenElement: null,
  fonts: Object.assign(new EventTarget(), { ready: Promise.resolve(), add() {}, load: async () => [] }),
  createElement: (tag) => new StubElement(tag), createElementNS: (_ns, tag) => new StubElement(tag),
  createTextNode: (text) => Object.assign(new EventTarget(), { nodeType: 3, textContent: String(text), remove() {} }),
  createDocumentFragment: () => new StubElement('fragment'),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  exitPointerLock() {}, hasFocus: () => true, elementFromPoint: () => null,
});
const mediaQuery = (query) => Object.assign(new EventTarget(), { matches: false, media: query, addListener() {}, removeListener() {} });
const windowStub = Object.assign(new EventTarget(), {
  innerWidth: WIDTH, innerHeight: HEIGHT, devicePixelRatio: 1, document: documentStub,
  location: { search: '', href: 'http://localhost/', hostname: 'localhost', pathname: '/', hash: '', origin: 'http://localhost' },
  matchMedia: mediaQuery, getComputedStyle: styleDeclaration, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  visualViewport: Object.assign(new EventTarget(), { width: WIDTH, height: HEIGHT, scale: 1, offsetTop: 0, offsetLeft: 0 }),
  screen: { width: WIDTH, height: HEIGHT, orientation: { type: 'landscape-primary', angle: 0, addEventListener() {} } },
  scrollTo() {}, focus() {}, setTimeout, clearTimeout, setInterval, clearInterval,
});
const stored = new Map();
for (const [key, value] of Object.entries({
  window: windowStub, document: documentStub, self: windowStub,
  navigator: { userAgent: 'node', maxTouchPoints: 0, language: 'en-US', languages: ['en-US'], hardwareConcurrency: 8 },
  localStorage: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Element: StubElement, HTMLElement: StubElement, HTMLCanvasElement: StubElement, HTMLImageElement: class {},
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  Image: class { addEventListener() {} decode() { return Promise.resolve(); } },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, getComputedStyle: styleDeclaration, matchMedia: mediaQuery,
  innerWidth: WIDTH, innerHeight: HEIGHT, devicePixelRatio: 1, CSS: { supports: () => true, escape: (s) => s },
})) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

export { created, recordingContext, StubElement, windowStub, documentStub, WIDTH, HEIGHT };
