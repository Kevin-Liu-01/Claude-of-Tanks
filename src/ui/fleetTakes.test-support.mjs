// fleetTakes.test-support.mjs — a small browser port for the fleet-takes selftests (src/ui/fleetTakes.ts and the
// surfaces that show a vehicle's own take): elements with classes, attributes, dataset, capture/bubble events and a
// minimal selector engine; a markup parser for the innerHTML the Garage panel writes; video elements that record their
// source, playback and loads; and IntersectionObserver, matchMedia, document visibility, timers and fetch that a test
// drives by hand. Nothing here is a selftest: the selftests that use it are registered in tools/selftest-suites.mjs.

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'source', 'path', 'circle', 'rect', 'line']);
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function parseSelectorPart(part) {
  const tag = /^[a-zA-Z][\w-]*/.exec(part)?.[0]?.toLowerCase() ?? null;
  const classes = [...part.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  const attributes = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((match) => [match[1], match[2]]);
  return { tag, classes, attributes };
}

function matchesPart(element, { tag, classes, attributes }) {
  if (tag && element.localName !== tag) return false;
  const own = element.className.split(/\s+/);
  if (!classes.every((name) => own.includes(name))) return false;
  return attributes.every(([name, value]) => (value === undefined ? element.hasAttribute(name) : element.getAttribute(name) === value));
}

export function createFakeDom() {
  const state = {
    hidden: false,
    reducedMotion: false,
    playRejection: null,
    timers: new Map(),
    nextTimer: 1,
    observers: [],
    mediaLists: new Map(),
    fetches: [],
    responses: new Map(),
  };

  class FakeElement {
    constructor(tagName) {
      this.localName = String(tagName).toLowerCase();
      this.tagName = this.localName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributeMap = new Map();
      this.dataset = {};
      this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
      this.listeners = [];
      this.ownText = '';
      this.hidden = false;
      this.disabled = false;
    }
    get className() { return this.attributeMap.get('class') ?? ''; }
    set className(value) { this.attributeMap.set('class', String(value)); }
    get id() { return this.attributeMap.get('id') ?? ''; }
    set id(value) { this.attributeMap.set('id', String(value)); }
    get title() { return this.attributeMap.get('title') ?? ''; }
    set title(value) { this.attributeMap.set('title', String(value)); }
    get href() { return this.attributeMap.get('href') ?? ''; }
    set href(value) { this.attributeMap.set('href', String(value)); }
    get classList() {
      const element = this;
      const names = () => element.className.split(/\s+/).filter(Boolean);
      return {
        add: (...add) => { element.className = [...new Set([...names(), ...add])].join(' '); },
        remove: (...drop) => { element.className = names().filter((name) => !drop.includes(name)).join(' '); },
        toggle: (name, force) => {
          const on = force ?? !names().includes(name);
          if (on) element.classList.add(name); else element.classList.remove(name);
          return on;
        },
        contains: (name) => names().includes(name),
      };
    }
    get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    set textContent(value) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.ownText = String(value);
    }
    set innerHTML(html) {
      this.textContent = '';
      const stack = [this];
      for (const match of String(html).matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g)) {
        const top = stack[stack.length - 1];
        if (match[5] !== undefined) { top.ownText += match[5]; continue; }
        if (match[1]) { if (stack.length > 1) stack.pop(); continue; }
        const element = document.createElement(match[2]);
        for (const attribute of match[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
          element.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
        }
        top.append(element);
        if (!match[4] && !VOID_TAGS.has(element.localName)) stack.push(element);
      }
    }
    setAttribute(name, value) {
      this.attributeMap.set(name, String(value));
      if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value);
      if (name === 'hidden') this.hidden = true;
    }
    getAttribute(name) { return this.attributeMap.has(name) ? this.attributeMap.get(name) : null; }
    hasAttribute(name) { return this.attributeMap.has(name); }
    removeAttribute(name) {
      this.attributeMap.delete(name);
      if (name.startsWith('data-')) delete this.dataset[camel(name.slice(5))];
    }
    append(...nodes) {
      for (const node of nodes) {
        if (typeof node === 'string') { this.ownText += node; continue; }
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      }
    }
    appendChild(node) { this.append(node); return node; }
    prepend(...nodes) {
      for (const node of nodes.reverse()) {
        node.remove();
        node.parentNode = this;
        this.children.unshift(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.ownText = '';
      this.append(...nodes);
    }
    after(...nodes) {
      const parent = this.parentNode;
      if (!parent) return;
      const index = parent.children.indexOf(this) + 1;
      for (const node of nodes) node.remove();
      for (const node of nodes) node.parentNode = parent;
      parent.children.splice(index, 0, ...nodes);
    }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
    addEventListener(type, listener, options) {
      const capture = options === true || !!options?.capture;
      this.listeners.push({ type, listener, capture, once: !!options?.once });
    }
    removeEventListener(type, listener, options) {
      const capture = options === true || !!options?.capture;
      this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.listener === listener && entry.capture === capture));
    }
    dispatchEvent(event) {
      event.target ??= this;
      event.stopped = false;
      event.stopPropagation = () => { event.stopped = true; };
      event.preventDefault ??= () => {};
      const path = [];
      for (let node = this.parentNode; node; node = node.parentNode) path.unshift(node);
      const call = (node, capture) => {
        for (const entry of [...node.listeners]) {
          if (entry.type !== event.type || (capture !== null && entry.capture !== capture)) continue;
          if (entry.once) node.listeners.splice(node.listeners.indexOf(entry), 1);
          event.currentTarget = node;
          entry.listener.call(node, event);
        }
      };
      for (const node of path) { if (event.stopped) return true; call(node, true); }
      if (!event.stopped) call(this, null);
      if (event.bubbles) for (const node of [...path].reverse()) { if (event.stopped) break; call(node, false); }
      return true;
    }
    click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
    focus() { document.activeElement = this; }
    get descendants() { return this.children.flatMap((child) => [child, ...child.descendants]); }
    querySelectorAll(selector) {
      const groups = selector.split(',').map((group) => group.trim().split(/\s+/).map(parseSelectorPart));
      return this.descendants.filter((element) => groups.some((parts) => {
        if (!matchesPart(element, parts[parts.length - 1])) return false;
        let index = parts.length - 2;
        for (let node = element.parentNode; node && index >= 0 && node !== this.parentNode; node = node.parentNode) {
          if (node instanceof FakeElement && matchesPart(node, parts[index])) index--;
        }
        return index < 0;
      }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    closest(selector) {
      const part = parseSelectorPart(selector);
      for (let node = this; node; node = node.parentNode) if (node instanceof FakeElement && matchesPart(node, part)) return node;
      return null;
    }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  }

  class FakeVideo extends FakeElement {
    constructor() {
      super('video');
      this.paused = true;
      this.playCalls = 0;
      this.loads = 0;
      this.error = null;
      this.muted = false;
      this.defaultMuted = false;
      this.loop = false;
      this.playsInline = false;
      this.preload = 'auto';
      this.disablePictureInPicture = false;
      this.tabIndex = 0;
    }
    get src() { return this.getAttribute('src') ?? ''; }
    set src(value) { this.setAttribute('src', value); }
    get poster() { return this.getAttribute('poster') ?? ''; }
    set poster(value) { this.setAttribute('poster', value); }
    play() {
      this.playCalls++;
      if (state.playRejection) return Promise.reject(state.playRejection);
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() { this.loads++; }
    /** The browser failing to load the current source. */
    fail() {
      this.error = { code: 4 };
      this.dispatchEvent({ type: 'error' });
    }
  }

  class FakeDetails extends FakeElement {
    constructor() { super('details'); this.open = false; }
  }

  class FakeIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      this.disconnected = false;
      state.observers.push(this);
    }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  }

  const document = {
    hidden: false,
    activeElement: null,
    listeners: [],
    createElement(tag) {
      const name = String(tag).toLowerCase();
      if (name === 'video') return new FakeVideo();
      if (name === 'details') return new FakeDetails();
      return new FakeElement(name);
    },
    createElementNS(_namespace, tag) { return new FakeElement(tag); },
    addEventListener(type, listener) { this.listeners.push({ type, listener }); },
    removeEventListener(type, listener) {
      this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.listener === listener));
    },
  };
  document.body = new FakeElement('body');

  function mediaList(query) {
    if (!state.mediaLists.has(query)) {
      const listeners = new Set();
      state.mediaLists.set(query, {
        media: query,
        get matches() { return query.includes('prefers-reduced-motion') && state.reducedMotion; },
        addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
        listeners,
      });
    }
    return state.mediaLists.get(query);
  }

  const dom = {
    state,
    document,
    FakeElement,
    FakeVideo,
    HTMLElement: FakeElement,
    HTMLDetailsElement: FakeDetails,
    IntersectionObserver: FakeIntersectionObserver,
    matchMedia: mediaList,
    setTimeout(callback, delay = 0) {
      const id = state.nextTimer++;
      state.timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { state.timers.delete(id); },
    /** Run every pending timer (and any it schedules), shortest delay first. */
    runTimers() {
      let ran = 0;
      while (state.timers.size && ran < 100) {
        const [id, timer] = [...state.timers].sort((a, b) => a[1].delay - b[1].delay)[0];
        state.timers.delete(id);
        timer.callback();
        ran++;
      }
      return ran;
    },
    /** A same-site fetch: registered bodies answer 200, registered statuses answer without a body, the rest 404. */
    fetch(url) {
      state.fetches.push(String(url));
      const answer = state.responses.get(String(url));
      if (answer instanceof Error) return Promise.reject(answer);
      if (answer === undefined) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new SyntaxError('404')) });
      if (typeof answer === 'number') return Promise.resolve({ ok: answer < 400, status: answer, json: () => Promise.reject(new SyntaxError('no body')) });
      if (typeof answer === 'string') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve().then(() => JSON.parse(answer)) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(structuredClone(answer)) });
    },
    respond(url, answer) { state.responses.set(url, answer); },
    /** Observers watching `target` (optionally only those with this rootMargin). */
    observersOf(target, rootMargin) {
      return state.observers.filter((observer) => observer.targets.has(target)
        && (rootMargin === undefined || (observer.options.rootMargin ?? '0px') === rootMargin));
    },
    /** Report an intersection to every observer of `target`: `near` for margin observers, `ratio` for the rest. */
    intersect(target, ratio, near = ratio > 0) {
      for (const observer of dom.observersOf(target)) {
        const margin = observer.options.rootMargin && observer.options.rootMargin !== '0px';
        const isIntersecting = margin ? near : ratio > 0;
        observer.callback([{ target, isIntersecting, intersectionRatio: isIntersecting ? (margin ? Math.max(ratio, 0.01) : ratio) : 0 }], observer);
      }
    },
    setHidden(hidden) {
      document.hidden = hidden;
      for (const entry of [...document.listeners]) if (entry.type === 'visibilitychange') entry.listener({ type: 'visibilitychange' });
    },
    setReducedMotion(reduce) {
      state.reducedMotion = reduce;
      for (const list of state.mediaLists.values()) for (const listener of [...list.listeners]) listener({ matches: list.matches });
    },
    /** Put the port on globalThis (the modules under test read their globals at call time). */
    install(target = globalThis) {
      const values = {
        document, IntersectionObserver: FakeIntersectionObserver, matchMedia: mediaList,
        HTMLElement: FakeElement, HTMLDetailsElement: FakeDetails,
        setTimeout: dom.setTimeout, clearTimeout: dom.clearTimeout, fetch: dom.fetch,
      };
      const previous = {};
      for (const [name, value] of Object.entries(values)) {
        previous[name] = Object.getOwnPropertyDescriptor(target, name);
        Object.defineProperty(target, name, { configurable: true, writable: true, value });
      }
      return () => {
        for (const [name, descriptor] of Object.entries(previous)) {
          if (descriptor) Object.defineProperty(target, name, descriptor);
          else delete target[name];
        }
      };
    },
  };
  return dom;
}

/** Settle chained promises (a first import(), fetch, json, then the surface's own continuation). */
export async function settle(rounds = 4) {
  for (let index = 0; index < rounds; index++) {
    await new Promise((resolve) => setImmediate(resolve));
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
  }
}
