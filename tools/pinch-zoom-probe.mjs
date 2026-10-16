#!/usr/bin/env node
// Pinch-zoom layout probe (2026-10-16; owner: "using both my fingers on track pad to like expand the screen in landing
// causes a bunch of weirdness and layout shifts and stuff. fix and make sure its not anywhere else").
//
// A trackpad pinch zooms the VISUAL viewport: visualViewport.scale rises, its width and height shrink, it fires
// 'resize' and 'scroll', and window 'resize' never fires. It must only magnify. For each surface this probe settles
// the page, takes two control snapshots (whatever differs between them is animation, not the pinch), then drives a
// real Chrome trackpad pinch (CDP Input.synthesizePinchGesture, mouse source: the page sees ctrl+wheel first), pans
// the zoomed view, pinches back out, and compares every phase with the control: the html/body/#app boxes, the
// --cot-viewport-* and --cot-ui-scale variables, the responsive bands (body data-cot-*), every canvas's backing and
// client size, the key elements' boxes, the layout box (offset*) of every rendered element, the window and inner
// scroll positions, cot:layoutchange events and layout-shift entries. Last, a real resize (page.setViewport) must
// still relayout.
//
// The game page (/, /studio) and the HUD preview cancel the pinch outright (src/ui/pinchZoomGuard.ts): there the probe
// records whether the trackpad pinch was cancelled, then lets a zoom through anyway and checks that the zoom only
// magnifies and that a pinch-out over the DOM returns the page to scale 1. On the game page the leak is
// Emulation.setPageScaleFactor(2): the same page scale a pinch sets, with the same visualViewport 'resize' (a touch
// pinch there would be a tap: it dismisses the splash and presses garage buttons). Elsewhere it is a touch pinch over
// the DOM (touch-action: manipulation allows one on a touchscreen desktop). A pinch-out over a 3D canvas is that
// canvas's camera zoom by design (gallery orbit, garage showroom, battle sight), so the pinch-out aims at the DOM.
//
//   node tools/pinch-zoom-probe.mjs --base=http://127.0.0.1:5291 [--label=branch] [--out=<file.json>]
//        [--surfaces=home,home-scrolled,docs,docs-topic,gallery,dossier,notfound,hud,splash,garage,battle,studio]
//        (splash, garage and battle in that order continue one page: one boot)
//        [--width=1440] [--height=900] [--resize=1000x700] [--chrome=<executable>] [--ready-timeout=1200]
//        [--battle-timeout=900]
//
// Serve a checkout first (dev or preview), e.g. `node node_modules/vite/bin/vite.js --port 5291 --strictPort` and kill
// that exact PID afterwards. Chrome runs headless on SwiftShader (--use-angle=swiftshader), so the probe needs neither
// the GPU nor the capture lock. Exit 0 when every surface only magnifies and the resize relayouts; 1 when any surface
// relayouts under the pinch (an origin/main before the 2026-10-16 fix exits 1 here: that is the negative control); 2 on
// a usage error. A manual probe: it needs a browser and a served build, so it is not part of npm test.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SURFACES = Object.freeze([
  'home', 'home-scrolled', 'docs', 'docs-topic', 'gallery', 'dossier', 'notfound', 'hud', 'splash', 'garage', 'battle', 'studio',
]);
/** The responsive variables a layout reads (offset/scale vars are read too: main wrote them, the fix removed them). */
export const LAYOUT_VARS = Object.freeze([
  '--cot-viewport-width', '--cot-viewport-height', '--cot-ui-scale',
  '--cot-viewport-offset-left', '--cot-viewport-offset-top', '--cot-viewport-scale',
]);
const ZOOMED = 1.01;
/** A box may wobble by a rounding pixel; anything more moved. */
export const BOX_TOLERANCE_PX = 1;
const PHASES = Object.freeze(['pinched', 'panned', 'restored']);

// ---------------------------------------------------------------------------------------------- surfaces

const GAME_QUERY = 'nosplash=1&tier=desktop';
const SURFACES = {
  home: {
    route: '/home', kind: 'public', title: 'the landing page on arrival',
    keys: ['nav.public-nav', 'header.v5-hero', 'header.v5-hero > *', 'section.manual-start', 'section.v5-social-proof', 'section.v5-authored'],
  },
  'home-scrolled': {
    route: '/home', kind: 'public', title: 'the landing page read part-way down',
    keys: ['nav.public-nav', 'header.v5-hero', 'section.v5-authored', 'section.v5-facts', 'section.v5-film', 'section.v5-split--garage'],
    scrollWindowTo: 2600,
  },
  docs: {
    route: '/docs', kind: 'public', title: 'the field manual',
    keys: ['nav.public-nav', 'header.docs-hero', 'section.docs-chapters', 'main.docs-layout', 'aside.docs-toc', 'article.docs-main'],
  },
  'docs-topic': {
    route: '/docs/vehicles', kind: 'public', title: 'a field-manual topic page',
    keys: ['nav.public-nav', 'main', 'main > *', 'aside', 'article'],
    scrollWindowTo: 900,
  },
  gallery: {
    route: '/gallery', kind: 'public', title: 'the tank gallery', ready: 'window.__TANK_GALLERY_READY === true',
    pinchOver: 'aside.archive-panel',
    keys: ['nav.public-nav', 'main.gallery-shell', 'aside.archive-panel', 'section.viewer', 'aside.dossier', '#vehicleList'],
  },
  dossier: {
    route: '/gallery?id=m1a2', kind: 'public', title: 'a gallery dossier', ready: 'window.__TANK_GALLERY_READY === true',
    pinchOver: 'aside.dossier',
    keys: ['nav.public-nav', 'main.gallery-shell', 'aside.dossier', '.dossier-scroll', '.dossier-head', 'section.viewer'],
    scrollInner: { selector: '.dossier-scroll', top: 700 },
  },
  notfound: {
    route: '/pinch-zoom-probe-missing-page', kind: 'public', title: 'the 404 page',
    keys: ['nav.public-nav', 'main', 'main > *', 'header', 'footer'],
  },
  hud: {
    // the HUD editor's preview page: the real battle HUD (initHud, responsiveLayout, the touch-free desktop profile)
    // laid out over no WebGL, so the HUD's layout is probed in seconds; `battle` is the live one
    route: '/hud-preview.html?profile=desktop', devRoute: '/site/hud-preview.html?profile=desktop', kind: 'public',
    title: 'the battle HUD (the HUD editor preview)',
    // its own setup can fail after mounting the HUD (2026-10-16: TANK_SPECS.leo2a5 no longer exists, on main too): the
    // mounted HUD is still the live layout, so a posted preview error with a HUD in the page counts as ready (noted)
    ready: 'document.documentElement.dataset.previewReady === "true" || (window.__PINCH_PROBE?.previewError && !!document.querySelector(".cot-hud"))',
    keys: ['#app', '.cot-hud', '.cot-hud > *', 'body > *'],
  },
  splash: {
    route: '/', kind: 'game', title: 'the game page on arrival (the press-any-key splash)', forceSplash: true,
    ready: 'window.__GAME_READY === true',
    keys: ['#app', '#cot-boot', '#cot-boot > *', '#cot-boot-hero'],
  },
  garage: {
    route: `/?${GAME_QUERY}`, kind: 'game', title: 'the garage', ready: 'window.__GAME_READY === true',
    // after the splash it is the same page: a click past the press-any-key gate, as a player enters
    continuesFrom: 'splash', dismissSplash: true,
    pinchOver: '.cot-garage .cot-brand-rail',
    keys: ['#app', '.cot-garage', '.cot-garage > *'],
  },
  battle: {
    route: `/?${GAME_QUERY}`, kind: 'game', title: 'a battle HUD', ready: 'window.__GAME_READY === true', battle: true,
    continuesFrom: 'garage', keys: ['#app', '.cot-hud', '.cot-hud > *'],
  },
  studio: {
    route: `/studio?${GAME_QUERY}`, kind: 'game', title: 'the studio',
    ready: 'window.__GAME_READY === true && !!document.querySelector(".cot-studio .dock")',
    // over the right dock, which stops 'wheel' propagation (a bubble-phase guard used to miss a pinch there)
    pinchOver: '.cot-studio .dock',
    keys: ['#app', '.cot-studio', '.cot-studio > *'],
  },
};

// ---------------------------------------------------------------------------------------------- arguments

const KNOWN_ARGS = /^--(base|label|out|surfaces|width|height|resize|chrome|ready-timeout|battle-timeout|help)(=|$)/;

function argReader(argv) {
  return (name, fallback) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
}

function parseSurfaces(list) {
  const surfaces = list.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = surfaces.filter((s) => !SURFACES[s]);
  if (bad.length) throw new Error(`unknown surface(s): ${bad.join(',')} (known: ${Object.keys(SURFACES).join(',')})`);
  return surfaces;
}

function parseSizes(value) {
  const resize = value('resize', '1000x700').split('x').map(Number);
  const width = Number(value('width', '1440')), height = Number(value('height', '900'));
  const valid = resize.length === 2 && [width, height, ...resize].every((n) => Number.isInteger(n) && n > 0);
  if (!valid) throw new Error('bad --width/--height/--resize');
  return { width, height, resize: { width: resize[0], height: resize[1] } };
}

export function parseArgs(argv) {
  const value = argReader(argv);
  const unknown = argv.filter((arg) => !KNOWN_ARGS.test(arg));
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  const surfaces = parseSurfaces(value('surfaces', DEFAULT_SURFACES.join(',')));
  const base = value('base', '');
  if (!/^https?:\/\/[^/]+/.test(base)) throw new Error('--base=<origin of a served checkout> is required, e.g. --base=http://127.0.0.1:5291');
  return {
    base: base.replace(/\/+$/, ''), label: value('label', 'run'), out: value('out', ''), surfaces, ...parseSizes(value),
    chrome: value('chrome', ''),
    // a dev server's first game load transforms the whole module graph, and SwiftShader links every program on the
    // CPU: tens of minutes on a loaded machine
    readyTimeoutMs: Number(value('ready-timeout', '1200')) * 1000,
    battleTimeoutMs: Number(value('battle-timeout', '900')) * 1000,
  };
}

// ---------------------------------------------------------------------------------------------- comparison (pure)

const sameBox = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= BOX_TOLERANCE_PX);
const equalValue = (a, b) => (Array.isArray(a) || Array.isArray(b) ? sameBox(a, b) : a === b);

function addEntries(out, prefix, entries) {
  for (const [name, v] of Object.entries(entries)) out[`${prefix} ${name}`] = v;
}

/** The measurements gated per phase, flattened to name -> comparable value. */
export function flatten(snapshot) {
  const out = {
    'document scrollWidth': snapshot.doc.scrollWidth,
    'document scrollHeight': snapshot.doc.scrollHeight,
    'window scrollX': snapshot.scroll.x,
    'window scrollY': snapshot.scroll.y,
  };
  addEntries(out, 'var', snapshot.vars);
  addEntries(out, 'band', snapshot.bands);
  addEntries(out, 'box', snapshot.shell);
  snapshot.canvases.forEach((c, i) => { out[`canvas[${i}] ${c.label}`] = [c.width, c.height, c.clientWidth, c.clientHeight]; });
  addEntries(out, 'scrollTop', snapshot.scrollers);
  addEntries(out, 'key', snapshot.keys);
  return out;
}

/** Every steady measurement (equal in both controls) that the phase changed, dropped or added. */
function compareMeasures(controlA, controlB, phase) {
  const a = flatten(controlA), b = flatten(controlB), p = flatten(phase);
  const volatile = Object.keys(b).filter((k) => !equalValue(a[k], b[k]));
  const steady = (key) => !volatile.includes(key);
  const changed = Object.keys(b).filter(steady)
    .filter((key) => !(key in p) || !equalValue(b[key], p[key]))
    .map((key) => ({ key, control: b[key], phase: key in p ? p[key] : '(gone)' }));
  for (const key of Object.keys(p)) if (!(key in b) && steady(key)) changed.push({ key, control: '(absent)', phase: p[key] });
  return { volatile, changed };
}

/** Every element whose layout box held still across the controls (and is not animated) but moved in the phase. */
function compareCensus(controlA, controlB, phase) {
  const moved = [];
  let compared = 0;
  for (const [id, box] of Object.entries(controlB.census)) {
    const before = controlA.census[id], after = phase.census[id];
    const animated = !before || !after || before[4] || box[4] || after[4];
    if (animated || !sameBox(before.slice(0, 4), box.slice(0, 4))) continue;
    compared++;
    if (!sameBox(box.slice(0, 4), after.slice(0, 4))) moved.push({ element: box[5], control: box.slice(0, 4), phase: after.slice(0, 4) });
  }
  return { moved, compared };
}

/**
 * Compare a phase with the control. A measurement that differed between the two controls is volatile (animation,
 * a carousel, a loading poster) and is left out; so is an element whose layout box moved between the controls or
 * that has a running animation. Returns every changed measurement and every moved element.
 */
export function comparePhase(controlA, controlB, phase) {
  return { ...compareMeasures(controlA, controlB, phase), ...compareCensus(controlA, controlB, phase) };
}

/** Layout-shift entries recorded inside [from, to] (page clock), largest first. */
export function shiftsBetween(entries, from, to) {
  return entries.filter((e) => e.startTime >= from && e.startTime <= to).sort((x, y) => y.value - x.value);
}

function phaseProblems(compare = {}) {
  const problems = [];
  for (const name of PHASES) {
    const cmp = compare[name];
    if (cmp?.changed.length) problems.push(`${name}: ${cmp.changed.length} measurement(s) changed (${cmp.changed.slice(0, 4).map((c) => c.key).join('; ')})`);
    if (cmp?.moved.length) problems.push(`${name}: ${cmp.moved.length} element box(es) moved (${cmp.moved.slice(0, 3).map((m) => m.element).join('; ')})`);
  }
  return problems;
}

function zoomProblems(zoom) {
  if (!zoom || !(zoom.peakScale > ZOOMED)) return ['the pinch never zoomed the page, nothing was tested'];
  // a pinch-out that could only land on a 3D canvas is that canvas's camera zoom by design, not a stuck page
  if (zoom.restoredScale > ZOOMED && !zoom.pinchOutOverCanvas) {
    return [`a pinch-out over the DOM left the page stuck at scale ${zoom.restoredScale.toFixed(2)}`];
  }
  return [];
}

/** The verdict for one surface from its phase comparisons, counters and resize check. */
export function verdictFor(result) {
  const problems = [...zoomProblems(result.zoom), ...phaseProblems(result.compare)];
  if (result.layoutchangeDuringPinch > 0) problems.push(`cot:layoutchange fired ${result.layoutchangeDuringPinch} time(s) during the pinch`);
  if (result.pinchShifts?.length) problems.push(`${result.pinchShifts.length} layout-shift entr(y/ies) during the pinch (sum ${result.pinchShiftSum.toFixed(4)})`);
  if (result.resize && !result.resize.relayout) problems.push(`a real resize to ${result.resize.to} did not relayout (${result.resize.why})`);
  return { pass: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------- page side

/** Before any page script: counters and the layout-shift log. Serialized into the page, so self-contained. */
function installObservers({ forceSplash, holdBootWatchdog }) {
  if (forceSplash) window.__COT_FORCE_SPLASH = true;
  // A SwiftShader boot on a busy machine can sit in one CPU-bound stage (the sky bake, shader links) past the boot
  // watchdog's 30 s stall limit, and index.html then replaces the document to recover. Spending its auto-reload
  // budget up front (the same sessionStorage record a real reload leaves) keeps the slow boot going: the watchdog
  // shows its retry notice instead and the boot still completes. Layout is untouched.
  if (holdBootWatchdog) {
    try { sessionStorage.setItem('cot.bootRecovery.v1', JSON.stringify({ count: 2, at: Date.now(), reason: 'pinch-zoom-probe' })); } catch { /* storage blocked: the watchdog may reload */ }
  }
  const log = { layoutchange: 0, windowResize: 0, vvResize: 0, vvScroll: 0, wheel: 0, ctrlWheel: 0, ctrlWheelCancelled: 0, shifts: [] };
  window.__PINCH_PROBE = log;
  addEventListener('cot:layoutchange', () => { log.layoutchange++; });
  addEventListener('resize', () => { log.windowResize++; });
  window.visualViewport?.addEventListener('resize', () => { log.vvResize++; });
  window.visualViewport?.addEventListener('scroll', () => { log.vvScroll++; });
  // bubble phase on window, registered first: it sees the cancels of capture-phase guards (the fix's), not of a guard
  // registered later in the bubble phase (main's), so the zoom outcome is the reliable reading
  addEventListener('wheel', (event) => {
    log.wheel++;
    if (!event.ctrlKey) return;
    log.ctrlWheel++;
    if (event.defaultPrevented) log.ctrlWheelCancelled++;
  }, { passive: true });
  addEventListener('message', (event) => { if (event.data?.type === 'cot:hud-preview-error') log.previewError = true; });
  const nodeLabel = (n) => {
    if (!n) return '(gone)';
    if (n.nodeType !== 1) return `#${n.nodeName}`;
    const classes = n.classList?.length ? `.${[...n.classList].slice(0, 2).join('.')}` : '';
    return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${classes}`;
  };
  const rect = (b) => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  const source = (s) => ({ node: nodeLabel(s.node), previousRect: rect(s.previousRect), currentRect: rect(s.currentRect) });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        log.shifts.push({ startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
          sources: (entry.sources || []).slice(0, 5).map(source) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* no layout-shift support: the other measurements still gate */ }
}

/** One snapshot of everything a pinch must not change (layout boxes, not transformed boxes). Self-contained. */
function pageSnapshot({ keys, layoutVars, censusLimit }) {
  const root = document.documentElement;
  const round = (v) => Math.round(v * 10) / 10;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList?.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
  const rect = (el) => { const b = el.getBoundingClientRect(); return [round(b.left), round(b.top), round(b.width), round(b.height)]; };
  const rendered = (el) => el instanceof HTMLElement && el.getClientRects().length > 0;
  const memo = (fn) => { const cache = new Map(); const run = (el) => { if (!el) return false; if (!cache.has(el)) cache.set(el, fn(el, run)); return cache.get(el); }; return run; };
  const fixedChain = memo((el, up) => {
    if (el === root) return false;
    const pos = getComputedStyle(el).position;
    return pos === 'fixed' || pos === 'sticky' || up(el.parentElement);
  });
  // document-relative for flowing elements, viewport-relative for fixed/sticky ones: a pan that scrolls the layout
  // viewport must not read as a moved box
  const docRect = (el) => {
    const r = rect(el);
    return fixedChain(el) ? r : [round(r[0] + scrollX), round(r[1] + scrollY), r[2], r[3]];
  };
  const readVars = () => {
    const computed = getComputedStyle(root);
    const vars = {};
    for (const name of layoutVars) {
      const v = root.style.getPropertyValue(name).trim() || computed.getPropertyValue(name).trim();
      if (v) vars[name] = v;
    }
    return vars;
  };
  const readBands = () => Object.fromEntries(Object.entries(document.body?.dataset || {}).filter(([k]) => k.startsWith('cot')));
  const readShell = () => {
    const app = document.getElementById('app');
    return { html: rect(root), body: rect(document.body), ...(app ? { '#app': rect(app) } : {}) };
  };
  const readCanvases = () => [...document.querySelectorAll('canvas')]
    .filter((c) => c.getClientRects().length && c.clientWidth > 0)
    .slice(0, 12)
    .map((c) => ({ label: label(c), width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight }));
  const readKeys = () => {
    const boxes = {};
    for (const selector of keys) {
      const hits = [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length).slice(0, 10);
      hits.forEach((el, i) => { boxes[`${selector}${i ? `[${i}]` : ''} ${label(el)}`] = docRect(el); });
    }
    return boxes;
  };
  // inner scroll containers (lists, the dossier, the docs index): their scrollTop must survive the pinch
  const scrolls = (el) => {
    if (!(el instanceof HTMLElement) || !el.clientHeight || el.scrollHeight <= el.clientHeight + 1) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll';
  };
  const readScrollers = () => {
    const scrollers = {};
    for (const el of [...document.body.querySelectorAll('*')].filter(scrolls).slice(0, 40)) {
      let key = label(el);
      for (let i = 2; key in scrollers; i++) key = `${label(el)}[${i}]`;
      scrollers[key] = Math.round(el.scrollTop);
    }
    return scrollers;
  };
  // every rendered element's LAYOUT box (offset*: transforms and scrolling excluded, so a hover scale or a pan is not a
  // move), keyed by a stable per-element id; animated elements are flagged so the comparison leaves them out
  const readCensus = () => {
    const ids = window.__PINCH_PROBE_IDS || (window.__PINCH_PROBE_IDS = new WeakMap());
    const running = new Set((document.getAnimations?.() || []).filter((a) => a.playState === 'running').map((a) => a.effect?.target).filter(Boolean));
    const animated = memo((el, up) => running.has(el) || up(el.parentElement));
    const idOf = (el) => {
      if (!ids.has(el)) ids.set(el, (window.__PINCH_PROBE_NEXT = (window.__PINCH_PROBE_NEXT || 0) + 1));
      return ids.get(el);
    };
    const census = {};
    const boxes = [...document.body.querySelectorAll('*')].filter((el) => rendered(el) && (el.offsetWidth || el.offsetHeight));
    for (const el of boxes.slice(0, censusLimit)) {
      census[idOf(el)] = [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight, animated(el) ? 1 : 0, label(el)];
    }
    return census;
  };
  const readViewport = () => {
    const vv = window.visualViewport;
    if (!vv) return { scale: 1, width: innerWidth, height: innerHeight, offsetLeft: 0, offsetTop: 0, innerWidth, innerHeight, dpr: devicePixelRatio };
    return { scale: vv.scale, width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, innerWidth, innerHeight, dpr: devicePixelRatio };
  };
  return {
    t: performance.now(), viewport: readViewport(),
    vars: readVars(), bands: readBands(), shell: readShell(), canvases: readCanvases(), keys: readKeys(),
    scrollers: readScrollers(), census: readCensus(),
    doc: { scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight },
    scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
    counters: { ...window.__PINCH_PROBE, shifts: window.__PINCH_PROBE.shifts.length },
  };
}

/** The client point to aim at: over the selector's VISIBLE part (clipped to the visual viewport) or the centre. */
function pageAimPoint(selector) {
  const vv = window.visualViewport;
  const pad = 24;
  let x0 = vv.offsetLeft + pad, y0 = vv.offsetTop + pad, x1 = vv.offsetLeft + vv.width - pad, y1 = vv.offsetTop + vv.height - pad;
  const b = selector ? document.querySelector(selector)?.getBoundingClientRect() : null;
  const clip = b ? [Math.max(x0, b.left + 8), Math.max(y0, b.top + 8), Math.min(x1, b.right - 8), Math.min(y1, b.bottom - 8)] : null;
  if (clip && clip[2] > clip[0] && clip[3] > clip[1]) [x0, y0, x1, y1] = [clip[0], clip[1], clip[2], Math.min(clip[3], clip[1] + 520)];
  const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, over: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : null };
}

/** A visible point with no canvas under it (the pinch-out: over a canvas a pinch is its camera zoom). */
function pageDomPoint({ x, y }) {
  const vv = window.visualViewport;
  const isCanvas = (el) => !!el && (el.tagName === 'CANVAS' || !!el.closest?.('canvas'));
  const label = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : null);
  const candidates = [[x, y]];
  for (let gy = 1; gy < 8; gy++) for (let gx = 1; gx < 8; gx++) candidates.push([vv.offsetLeft + (vv.width * gx) / 8, vv.offsetTop + (vv.height * gy) / 8]);
  for (const [px, py] of candidates) {
    const hit = document.elementFromPoint(px, py);
    if (hit && !isCanvas(hit)) return { x: px, y: py, over: label(hit), canvas: false };
  }
  return { x, y, over: label(document.elementFromPoint(x, y)), canvas: true };
}

/** A visible point whose wheel scrolls only the root (no inner scroller, no canvas): the pan target. */
function pagePanPoint() {
  const vv = window.visualViewport;
  const scrollsOn = (s, n, axis) => (s[`overflow${axis}`] === 'auto' || s[`overflow${axis}`] === 'scroll')
    && (axis === 'Y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1);
  const blocked = (el) => {
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.tagName === 'CANVAS' || scrollsOn(s, n, 'Y') || scrollsOn(s, n, 'X')) return true;
    }
    return false;
  };
  for (let gy = 1; gy < 6; gy++) {
    for (let gx = 1; gx < 6; gx++) {
      const x = vv.offsetLeft + (vv.width * gx) / 6, y = vv.offsetTop + (vv.height * gy) / 6;
      const hit = document.elementFromPoint(x, y);
      if (hit && !blocked(hit)) return { x, y };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- browser side

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[pinch-zoom ${new Date().toTimeString().slice(0, 8)}] ${m}`);
const snapshot = (page, surface) => page.evaluate(pageSnapshot, { keys: surface.keys, layoutVars: LAYOUT_VARS, censusLimit: 3000 });
const readScale = (page) => page.evaluate(() => window.visualViewport?.scale ?? 1);
const widthVarIs = (page, px, timeout) => page.waitForFunction(
  (w) => document.documentElement.style.getPropertyValue('--cot-viewport-width').trim() === w, { timeout, polling: 250 }, px);

/**
 * Where to aim CDP input so it lands on a client point. CDP input coordinates are CSS px of the VISUAL viewport (a
 * touch pinch outside it is "Position out of bounds"), so a zoomed page maps client = offset + cdp. Clamped inside
 * the visible area. (A mousemove calibration was tried first: on a busy SwiftShader page the event can arrive late
 * and a stale reading aimed the pinch off-screen.)
 */
async function cdpPointFor(page, clientX, clientY) {
  const vv = await page.evaluate(() => {
    const v = window.visualViewport;
    return v ? { left: v.offsetLeft, top: v.offsetTop, width: v.width, height: v.height } : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  });
  const clamp = (v, max) => Math.min(Math.max(v, 2), Math.max(2, max - 2));
  return { x: clamp(clientX - vv.left, vv.width), y: clamp(clientY - vv.top, vv.height) };
}

async function pinch(cdp, at, scaleFactor, source = 'mouse') {
  await cdp.send('Input.synthesizePinchGesture', { x: at.x, y: at.y, scaleFactor, relativeSpeed: 2400, gestureSourceType: source });
}

/** A dev server serves site/ pages under /site/; a build serves them at the root. */
async function routeFor(surface, options) {
  if (!surface.devRoute) return surface.route;
  try {
    const response = await fetch(`${options.base}${surface.devRoute}`, { headers: { accept: 'text/html' } });
    if (response.ok && /hud-?preview|hudEditorPreview/i.test(await response.text())) return surface.devRoute;
  } catch { /* fall back to the build route */ }
  return surface.route;
}

/** splash -> garage -> battle share one page (one SwiftShader boot instead of three): back to the probe's size first. */
async function continuePage(page, surface, options) {
  await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
  await widthVarIs(page, `${options.width}px`, 60000);
  if (surface.dismissSplash && await page.$('#cot-boot')) {
    await page.mouse.click(Math.round(options.width / 2), Math.round(options.height * 0.3));
    await page.waitForFunction(() => !document.getElementById('cot-boot'), { timeout: 120000, polling: 250 });
  }
}

async function enterBattle(page, options) {
  log('  entering battle (m1a2 on verdant) …');
  const started = Date.now();
  await page.evaluate(() => { window.__PINCH_BATTLE = window.__DEBUG.beginBattleEntry('m1a2', 'verdant').then(() => 'open', (e) => `error ${e?.message || e}`); });
  // settled: the countdown over and the loading veil (.cot-bl) out of layout, or its stage text changing mid-probe reads
  // as a moved box
  await page.waitForFunction('window.__DEBUG?.game?.phase === "battle" && window.__DEBUG.game.preBattleS <= 0'
    + ' && !!document.querySelector(".cot-hud") && !document.querySelector(".cot-bl.on, .cot-bl.leaving")',
  { timeout: options.battleTimeoutMs, polling: 500 });
  log(`  battle open and settled after ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

async function readyPage(page, surface, options, reused) {
  if (reused) await continuePage(page, surface, options);
  else {
    // the game page's 'load' waits on its whole module graph (minutes from a cold dev server): its ready flag decides
    await page.goto(`${options.base}${await routeFor(surface, options)}`,
      { waitUntil: surface.kind === 'game' ? 'domcontentloaded' : 'load', timeout: options.readyTimeoutMs });
  }
  if (surface.ready) await page.waitForFunction(surface.ready, { timeout: options.readyTimeoutMs, polling: 250 });
  if (surface.battle) await enterBattle(page, options);
  await sleep(2500);
  if (surface.scrollWindowTo) { await page.evaluate((y) => window.scrollTo(0, y), surface.scrollWindowTo); await sleep(900); }
  if (surface.scrollInner) {
    await page.evaluate(({ selector, top }) => { const el = document.querySelector(selector); if (el) el.scrollTop = top; }, surface.scrollInner);
    await sleep(900);
  }
}

// ---------------------------------------------------------------------------------------------- the phases

/** Aim, park the pointer there (hover state equal in the controls and the pinch), then the two controls. */
async function controls(run) {
  const { page, cdp, surface } = run;
  run.aim = await page.evaluate(pageAimPoint, surface.pinchOver || null);
  run.aimCdp = await cdpPointFor(page, run.aim.x, run.aim.y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: run.aimCdp.x, y: run.aimCdp.y });
  await sleep(600);
  run.controlA = await snapshot(page, surface);
  await sleep(2200);
  run.controlB = await snapshot(page, surface);
}

/** When a guard cancelled the trackpad pinch: let a zoom through anyway, to test that it only magnifies. */
async function leakZoom(run, zoom) {
  const { page, cdp, surface } = run;
  if (surface.kind !== 'game') {
    await pinch(cdp, run.aimCdp, 2, 'touch').catch((e) => { zoom.touchError = e.message; });
    await sleep(900);
    zoom.method = 'touch pinch over the DOM';
    if (await readScale(page) > ZOOMED) return;
  }
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(900);
  zoom.method = 'Emulation.setPageScaleFactor(2)';
}

/** 1. the trackpad pinch to 2x. */
async function zoomIn(run) {
  const { page, cdp, controlB } = run;
  await pinch(cdp, run.aimCdp, 2, 'mouse');
  await sleep(900);
  const trackpadScale = await readScale(page);
  const after = await page.evaluate(() => ({ ...window.__PINCH_PROBE, shifts: undefined }));
  const zoom = {
    aimedOver: run.aim.over, trackpadScale, method: 'trackpad pinch (CDP mouse source: ctrl+wheel)',
    ctrlWheelEvents: after.ctrlWheel - controlB.counters.ctrlWheel,
    ctrlWheelSeenCancelled: after.ctrlWheelCancelled - controlB.counters.ctrlWheelCancelled,
    // the game page and the HUD preview cancel a trackpad pinch (pinchZoomGuard); the public pages keep browser zoom
    trackpadPinchCancelled: trackpadScale <= ZOOMED,
  };
  if (zoom.trackpadPinchCancelled) await leakZoom(run, zoom);
  zoom.peakScale = await readScale(page);
  run.zoom = zoom;
  run.pinched = await snapshot(page, run.surface);
}

/** 2. pan the zoomed view: a plain wheel over a non-scrolling point moves only the visual viewport. */
async function panZoomed(run) {
  const { page, cdp, pinched, zoom } = run;
  const pan = zoom.peakScale > ZOOMED ? await page.evaluate(pagePanPoint) : null;
  if (pan) {
    // toward whichever side has room, so the pan moves the visual viewport inside the layout viewport and never
    // scrolls the page itself (that would be the reader scrolling, not the pinch)
    const v = pinched.viewport;
    const dx = v.innerWidth - v.width - v.offsetLeft >= 180 ? 180 : -Math.min(180, v.offsetLeft);
    const dy = v.innerHeight - v.height - v.offsetTop >= 120 ? 120 : -Math.min(120, v.offsetTop);
    const at = await cdpPointFor(page, pan.x, pan.y);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: dx, deltaY: 0 });
    await sleep(250);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: dy });
    await sleep(900);
  }
  run.panned = await snapshot(page, run.surface);
  zoom.pan = pan
    ? { offsetLeft: [pinched.viewport.offsetLeft, run.panned.viewport.offsetLeft], offsetTop: [pinched.viewport.offsetTop, run.panned.viewport.offsetTop] }
    : 'no non-scrolling point to pan over';
}

/** 3. pinch back out to 1 over the DOM (the game page's guard must let a zoom-out through). */
async function zoomOut(run) {
  const { page, cdp, surface, zoom } = run;
  const aimed = await page.evaluate(pageAimPoint, surface.pinchOver || null);
  const back = await page.evaluate(pageDomPoint, aimed);
  zoom.pinchOutOver = back.over;
  await pinch(cdp, await cdpPointFor(page, back.x, back.y), 1 / Math.max(zoom.peakScale, 1), 'mouse');
  await sleep(900);
  zoom.restoredScale = await readScale(page);
  if (zoom.restoredScale > ZOOMED) {
    // over a canvas the pinch is that canvas's camera zoom by design; over the DOM it must un-zoom the page
    zoom.pinchOutBlocked = !back.canvas;
    zoom.pinchOutOverCanvas = back.canvas;
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await sleep(900);
  }
  run.restored = await snapshot(page, surface);
}

const layoutOf = (s) => ({ vars: s.vars, bands: s.bands, shell: s.shell, canvases: s.canvases, scroll: s.scroll, doc: s.doc, scrollers: s.scrollers });

/** The phase comparisons, the counters and the layout shifts inside the pinch. */
async function judgePinch(run, result) {
  const { page, controlA, controlB, pinched, panned, restored } = run;
  result.zoom = run.zoom;
  result.compare = Object.fromEntries(PHASES.map((name) => [name, comparePhase(controlA, controlB, run[name])]));
  result.layoutchangeDuringPinch = restored.counters.layoutchange - controlB.counters.layoutchange;
  result.counters = { control: controlB.counters, restored: restored.counters };
  const shifts = await page.evaluate(() => window.__PINCH_PROBE.shifts);
  result.pinchShifts = shiftsBetween(shifts, controlB.t, restored.t);
  result.pinchShiftSum = result.pinchShifts.reduce((s, e) => s + e.value, 0);
  result.controlShifts = shiftsBetween(shifts, controlA.t, controlB.t).length;
  result.viewports = { control: controlB.viewport, pinched: pinched.viewport, panned: panned.viewport, restored: restored.viewport };
  result.layout = { control: layoutOf(controlB), pinched: layoutOf(pinched), restored: layoutOf(restored) };
}

/** Whether a real resize relayouted: the width variable, a cot:layoutchange, and on the game page the renderer. */
export function resizeVerdict(resized, restored, surface, size) {
  const widthVar = resized.vars['--cot-viewport-width'];
  const want = `${size.width}px`;
  const fired = resized.counters.layoutchange - restored.counters.layoutchange;
  // the game's renderer follows the new size (the Studio's 3D view sits beside its dock, so not always full width)
  const canvasesFollow = surface.kind !== 'game' || resized.canvases.some((c, i) => !!restored.canvases[i]
    && (c.clientWidth !== restored.canvases[i].clientWidth || c.clientHeight !== restored.canvases[i].clientHeight));
  const why = [[widthVar !== want, `--cot-viewport-width ${widthVar} != ${want}`], [fired <= 0, 'no cot:layoutchange'],
    [!canvasesFollow, 'no canvas followed the new size']].find(([bad]) => bad)?.[1] ?? 'ok';
  return {
    to: `${size.width}x${size.height}`, widthVar, layoutchange: fired, bands: resized.bands,
    windowResize: resized.counters.windowResize - restored.counters.windowResize, innerWidth: resized.viewport.innerWidth,
    canvases: resized.canvases.map((c) => [c.label, c.width, c.height, c.clientWidth, c.clientHeight]),
    relayout: why === 'ok', why,
  };
}

/** 4. a real resize must still relayout. */
async function resizeCheck(run, result) {
  const { page, options } = run;
  await page.setViewport({ width: options.resize.width, height: options.resize.height, deviceScaleFactor: 1 });
  // responsiveLayout applies in the next animation frame: on a busy SwiftShader garage that can be many seconds away
  const started = Date.now();
  await widthVarIs(page, `${options.resize.width}px`, 90000).catch(() => {});
  const waitedMs = Date.now() - started;
  await sleep(1200);
  result.resize = { ...resizeVerdict(await snapshot(page, run.surface), run.restored, run.surface, options.resize), waitedMs };
}

/**
 * One surface. `context` is shared by the run (one HTTP cache: a game boot re-fetches ~1100 dev modules otherwise);
 * `reuse` is the previous surface's still-open page when this surface continues it; `keepOpen` hands this page on.
 */
async function probeSurface(context, name, options, { reuse = null, keepOpen = false } = {}) {
  const surface = SURFACES[name];
  const page = reuse || await context.newPage();
  const errors = [];
  const onError = (e) => errors.push(String(e.message || e).slice(0, 300));
  page.on('pageerror', onError);
  const result = { surface: name, title: surface.title, route: surface.route, kind: surface.kind, continued: !!reuse, steps: [] };
  const started = Date.now();
  const step = (label) => result.steps.push([label, Date.now() - started]);
  try {
    if (!reuse) {
      await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(installObservers, { forceSplash: !!surface.forceSplash, holdBootWatchdog: surface.kind === 'game' });
    }
    await readyPage(page, surface, options, !!reuse);
    step('ready');
    if (await page.evaluate(() => !!window.__PINCH_PROBE?.previewError)) {
      result.note = 'the HUD preview posted cot:hud-preview-error after mounting the HUD (its setup threw); the mounted HUD is probed as laid out';
    }
    const run = { page, cdp: await page.createCDPSession(), surface, options };
    for (const [label, phase] of [['controls', controls], ['pinched', zoomIn], ['panned', panZoomed], ['restored', zoomOut]]) {
      await phase(run);
      step(label);
    }
    await judgePinch(run, result);
    await resizeCheck(run, result);
    step('resized');
  } catch (error) {
    result.error = String(error?.stack || error).slice(0, 1200);
  } finally {
    result.pageErrors = errors.slice(0, 8);
    page.off('pageerror', onError);
    if (!keepOpen || result.error) await page.close().catch(() => {});
  }
  result.verdict = result.error ? { pass: false, problems: [`probe error: ${result.error.split('\n')[0]}`] } : verdictFor(result);
  return { result, page: keepOpen && !result.error ? page : null };
}

// ---------------------------------------------------------------------------------------------- main

const USAGE = `usage: node tools/pinch-zoom-probe.mjs --base=<served origin> [--label=<name>] [--out=<report.json>]
  [--surfaces=${DEFAULT_SURFACES.join(',')}]
  [--width=1440] [--height=900] [--resize=1000x700] [--chrome=<executable>] [--ready-timeout=1200] [--battle-timeout=900]
exit 0: every surface only magnifies and a real resize relayouts; 1: a surface relayouts under a pinch; 2: usage`;

function logResult(r) {
  const zoom = r.zoom ? `zoom ${r.zoom.peakScale.toFixed(2)} by ${r.zoom.method} · trackpad pinch cancelled: ${r.zoom.trackpadPinchCancelled}` : 'zoom -';
  log(`  ${r.verdict.pass ? 'MAGNIFIES ONLY' : 'RELAYOUT/FAIL'} · ${zoom} · resize relayouts: ${r.resize?.relayout ?? '-'}`);
  for (const p of r.verdict.problems) log(`    - ${p}`);
}

async function runSurfaces(browser, options) {
  const context = await browser.createBrowserContext();
  const results = [];
  let handed = null;
  for (const [index, name] of options.surfaces.entries()) {
    const next = options.surfaces[index + 1];
    const keepOpen = !!next && SURFACES[next].continuesFrom === name;
    const reuse = handed && SURFACES[name].continuesFrom === handed.from ? handed.page : null;
    if (handed && !reuse) await handed.page.close().catch(() => {});
    log(`${options.label}: ${name} (${SURFACES[name].route}${reuse ? ', continuing its page' : ''}) …`);
    const { result, page } = await probeSurface(context, name, options, { reuse, keepOpen });
    handed = page ? { from: name, page } : null;
    results.push(result);
    logResult(result);
  }
  return results;
}

function writeReport(options, results) {
  const report = {
    tool: 'pinch-zoom-probe', label: options.label, base: options.base, at: new Date().toISOString(),
    viewport: `${options.width}x${options.height}`, pass: results.every((r) => r.verdict.pass), results,
  };
  if (options.out) {
    mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(report, null, 1)}\n`);
    log(`report: ${path.resolve(options.out)}`);
  }
  log(`${options.label}: ${report.pass ? 'PASS' : 'FAIL'} — ${results.filter((r) => r.verdict.pass).length}/${results.length} surface(s) only magnify under a pinch`);
  return report.pass;
}

function optionsOrExit(argv) {
  if (argv.includes('--help')) { console.log(USAGE); process.exit(0); }
  try { return parseArgs(argv); } catch (error) {
    console.error(`pinch-zoom-probe: ${error.message}\n${USAGE}`);
    return process.exit(2);
  }
}

async function main() {
  const options = optionsOrExit(process.argv.slice(2));
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: 'new',
    // a waitForFunction is one awaited CDP call: it must outlive the longest wait the run allows
    protocolTimeout: Math.max(options.readyTimeoutMs, options.battleTimeoutMs) + 120000,
    ...(options.chrome ? { executablePath: options.chrome } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
      '--disable-dev-shm-usage', `--window-size=${options.width},${options.height}`],
  });
  let results = [];
  try {
    results = await runSurfaces(browser, options);
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(writeReport(options, results) ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
