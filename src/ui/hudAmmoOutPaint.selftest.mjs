// Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
// autoloader/missile indicators. and for special modes like juggernaut, ammo should be endless."
//
// The live paint. hudAmmoOut.selftest proves the derivations; this receipt proves the wiring that paints them. Real
// hulls fire dry through the simulation, the real aim controller composes the frame, and the real battle HUD (initHud)
// paints it over a minimal DOM whose 2D context records every stroke, fill and text. The reticle canvas is then read
// by role: the dispersion ring and its dash count, the amber reload sweep and countdown, the ready pulse, the
// autoloader/salvo rack's ready, spent and struck shells, the struck single round, the tray cooldown and the struck
// launcher and magazine controls. Desktop and mobile paint the same canvas, tray and controls row.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { consumeAmmunition, hasAmmunition } from '../sim/ammunition.ts';
import { createCombatState, selectFirstAvailableShell, startPostShotReload, tickReload } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { matchRulesetFor, refillUnlimitedAmmunition } from '../sim/matchRuleset.ts';
import { createAimController } from '../game/aimController.ts';
import { createBus } from '../game/stateCore.ts';
import { aimWarningState, initHud, RETICLE_AMMO_INK as INK } from './hud.ts';

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
  fonts: { ready: Promise.resolve(), add() {}, load: async () => [] },
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

// --- the battle: the real HUD, the real aim controller, real hulls through the simulation ---
const hud = initHud(createBus());
const reticle = created.find((element) => element.classes.has('cot-ret'));
assert.ok(reticle, 'the HUD mounts its reticle canvas');
const ctx = reticle.getContext('2d');
const traySlots = created.filter((element) => element.classes.has('cot-shell'));
const specialButton = created.find((element) => element.classes.has('cot-special'));
const missileButton = created.find((element) => element.classes.has('cot-auxiliary') && element.innerHTML.includes('>ATGM<'));
assert.equal(traySlots.length, 3);
hud.setMode('battle');

await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'type90', 'ztz100_prototype', 'object695', 'bwp1', 'mbt70']);
const DT = 1 / 60;
const busy = (combat) => combat.reload.t > 0 || (combat.gunReload?.t ?? 0) > 0;
const settle = (combat) => { for (let guard = 0; busy(combat) && guard < 200000; guard++) tickReload(combat, DT); };
function fire(tank, ruleset = null) {
  const { combat, spec } = tank;
  settle(combat);
  if (!consumeAmmunition(combat, combat.shellSlot)) return false;
  if (ruleset) refillUnlimitedAmmunition(ruleset, combat, combat.shellSlot);
  startPostShotReload(combat, spec);
  if (!hasAmmunition(combat, combat.shellSlot)) selectFirstAvailableShell(combat, spec);
  return true;
}
function tankOf(id, ammo = null) {
  const spec = getSpec(id);
  const combat = createCombatState(spec);
  if (ammo) ammo.forEach((count, slot) => { combat.ammo[slot] = count; });
  return { id: 'player', team: 'alpha', isPlayer: true, spec, combat, specialAction: createSpecialActionState(spec),
    state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0,
      atGunLimit: false, gunLimitSpec: false },
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } } };
}
let current = null;
let unlimitedRounds = false;
let scope = false; // the ×8 sight
let dispersionM = 8;
const controller = createAimController({
  getGame: () => ({ player: current, tanks: [current] }),
  getRig: () => ({ aimPoint: new THREE.Vector3(0, 2, 200), aimDist: 200, mode: scope ? 'SNIPER' : 'CHASE', zoom: scope ? 8 : 1 }),
  worldRaycast: () => null,
  targetVisible: () => true,
  // The shell cards as game/playerBattleActions builds them: the ruleset's unlimited mark rides every card.
  getShellCards: () => current.spec.gun.shells.map((shell) => ({ name: shell.name, type: shell.guided ? 'ATGM' : shell.type,
    dmg: shell.dmg, penLabel: '', count: 0, ...(unlimitedRounds ? { unlimited: true } : {}) })),
  computeDispersion: () => dispersionM, // 8 m: a ring above the radius floor, so a settled reticle is reused
  now: () => 0,
});
const aim = {
  singleReticle: false, point: new THREE.Vector3(), distM: 0, dispersionRadM: 0, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [],
  zoom: 1, gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false,
  penRatio: null,
};
let timeS = 30;

const FULL_TURN = Math.PI * 2;
const arcOf = (op) => (op.path.length === 1 && op.path[0][0] === 'arc' ? op.path[0] : null);
/** What one HUD frame painted on the reticle canvas, read by role. */
function readReticle(ops) {
  const strokes = ops.filter((op) => op.op === 'stroke');
  // The dispersion ring: the two dashed full-circle strokes (the dark halo, then the ring ink).
  const ring = strokes.filter((op) => op.dash.length >= 2 && arcOf(op) && arcOf(op)[5] - arcOf(op)[4] >= FULL_TURN - 1e-6)[1];
  const dryInk = (width) => strokes.filter((op) => op.style === INK.dry && Math.abs(op.lineWidth - width) < 1e-6).length;
  return {
    painted: ops.length > 0,
    ringInk: ring?.style ?? null,
    ringDashes: ring ? Math.round((FULL_TURN * arcOf(ring)[3]) / (ring.dash[0] + ring.dash[1])) : null,
    sweep: strokes.some((op) => op.style === INK.reload && arcOf(op)),
    countdown: ops.filter((op) => op.op === 'fillText' && op.style === INK.reload && !op.text.startsWith('+'))
      .map((op) => op.text).join('') || null,
    pulse: strokes.some((op) => op.style === '#ffffff'),
    readyShells: ops.filter((op) => op.op === 'fillRect' && op.style === INK.reload).length,
    spentShells: dryInk(1),
    struck: dryInk(1.5),
    dryRound: dryInk(1.2),
    dryCount: ops.filter((op) => op.op === 'fillText' && op.style === INK.dry).map((op) => op.text.trim()),
  };
}
/** One battle frame: the aim controller composes, the HUD updates and paints. */
function frame(tank, { advance = 0, mode = 'battle' } = {}) {
  current = tank;
  for (let t = 0; t < advance; t += DT) tickReload(tank.combat, DT);
  controller.update(aim);
  ctx.ops.length = 0;
  timeS += DT;
  hud.update({ timeS, mode, player: tank, tanks: [tank], spotting: { isSpotted: () => true }, aim,
    auxiliaryKeyLabels: { missile: 'E' } });
  const view = readReticle(ctx.ops);
  view.trayCooldown = traySlots[aim.shellSlot].querySelector('.cool').style.height;
  view.trayEmpty = traySlots[aim.shellSlot].classes.has('empty');
  return view;
}
/** Frames until the reticle settles (the radius eases in), then the settled frame. */
function settledFrame(tank) {
  let view = frame(tank);
  for (let guard = 0; view.painted && guard < 600; guard++) view = frame(tank);
  assert.equal(view.painted, false, 'a reticle at rest is reused, not repainted');
  return view;
}
const LIVE_RING = 32;
const DRY_RING = 16;

// 1. A conventional gun mid-reload (the reference): the amber sweep and countdown, the full ring, the ready pulse.
{
  const tank = tankOf('m1a1_abrams_hc');
  settledFrame(tank);
  assert.ok(fire(tank));
  const view = frame(tank, { advance: 0.5 });
  assert.deepEqual([view.ringInk === INK.dryRing, view.ringDashes, view.sweep], [false, LIVE_RING, true]);
  assert.match(view.countdown, /^\d+(\.\d)? s$/, 'the reload counts down in the reload ink');
  assert.deepEqual([view.dryRound, view.struck, view.spentShells], [0, 0, 0], 'a loaded gun shows no empty state');
  assert.notEqual(view.trayCooldown, '0', 'the selected tray slot sweeps its cooldown');
  settle(tank.combat);
  assert.equal(frame(tank).pulse, true, 'the reload ending flashes ready');
}

// 2. The same gun fired to its last round: the simulation still reloads, the sight shows an empty gun.
{
  const tank = tankOf('m1a1_abrams_hc');
  while (tank.combat.ammo.some((count) => count > 0)) assert.ok(fire(tank));
  assert.ok(tank.combat.reload.t > 1, 'the simulation still runs the post-shot reload');
  let view = frame(tank, { advance: 0.25 });
  assert.equal(view.sweep, false, 'no amber sweep');
  assert.equal(view.countdown, null, 'no countdown');
  assert.equal(view.ringInk, INK.dryRing, 'the ring turns to the muted empty ink');
  assert.equal(view.ringDashes, DRY_RING, 'and thins to sparse dashes');
  assert.ok(view.dryRound >= 1 && view.struck >= 1, 'one hollow, struck round where the countdown would run');
  assert.deepEqual([view.trayCooldown, view.trayEmpty], ['0', true], 'the tray slot is empty, with no cooldown');
  // The sim's reload keeps ticking under an unchanged empty sight: the reticle is reused, not repainted per frame.
  let reused = false;
  for (let guard = 0; guard < 240 && busy(tank.combat); guard++) {
    view = frame(tank, { advance: DT });
    if (!view.painted) { reused = true; break; }
  }
  assert.ok(reused && busy(tank.combat), 'a dry sight at rest is reused while the simulation reload ticks');
  settle(tank.combat);
  view = frame(tank);
  assert.equal(view.pulse, false, 'the reload ending never flashes ready');
}

// 3. A weapon that turns dry mid-reload (a network mirror's count lands after its reload): no ready flash.
{
  const tank = tankOf('m1a1_abrams_hc', [1, 0, 0]);
  Object.assign(tank.combat.reload, { t: 3, totalS: 6, kind: 'shell' });
  assert.equal(frame(tank).sweep, true);
  tank.combat.ammo[0] = 0;
  const view = frame(tank);
  assert.deepEqual([view.pulse, view.sweep, view.countdown, view.ringInk], [false, false, null, INK.dryRing]);
}

// 4. The empty state reaches a sight at rest through the reuse keys (the last round mirrored away, nothing else moves).
{
  const tank = tankOf('m1a1_abrams_hc', [1, 0, 0]);
  settledFrame(tank);
  tank.combat.ammo[0] = 0;
  const view = frame(tank);
  assert.equal(view.painted, true, 'the dry transition repaints a reused reticle');
  assert.deepEqual([view.ringInk, view.ringDashes, view.dryRound > 0], [INK.dryRing, DRY_RING, true]);
  unlimitedRounds = true;
  assert.equal(frame(tank).ringInk !== INK.dryRing, true, 'and the unlimited mark brings the live sight back');
  unlimitedRounds = false;
}

// 4b. The feed is a reuse key of the settled reticle: a round stowed (or spent) in another slot repaints the rack.
// (Before the sniper case: leaving the scope runs a fade that holds the reticle repainting while the clock runs.)
{
  const tank = tankOf('m1a3', [2, 4, 0]);
  tank.combat.magazine.rounds = 2;
  settle(tank.combat);
  assert.deepEqual([settledFrame(tank).painted], [false]);
  tank.combat.ammo[2] = 1; // the third cannon round: the magazine still holds two, the selected slot still two
  const view = frame(tank);
  assert.equal(view.painted, true, 'a feed change alone repaints the reused reticle');
  assert.deepEqual([view.readyShells, view.spentShells], [2, 1], 'one spent slot fewer');
}

// 5. Sniper: the sparse ring and the chambered count in the empty ink.
{
  const tank = tankOf('m1a1_abrams_hc', [0, 0, 0]);
  const view = frame(tank, { mode: 'sniper' });
  assert.equal(view.ringDashes, 20, 'the sniper ring thins from 40 to 20 dashes');
  assert.deepEqual(view.dryCount, ['0'], 'the chambered count reads 0 in the empty ink');
}

// 6. An autoloader (M1A3: four-round magazine, a guided round in slot 1): short of stowage, then dry; its guided
// special control is struck once the last missile is gone.
{
  const tank = tankOf('m1a3', [2, 4, 0]);
  let view = frame(tank);
  assert.deepEqual([view.readyShells, view.spentShells, view.struck], [2, 2, 0],
    'two rounds stowed: two ready shells and two spent slots, not four ready');
  fire(tank); fire(tank);
  view = frame(tank);
  assert.equal(tank.combat.shellSlot, 1, 'the empty cannon falls back to the guided round');
  assert.deepEqual([view.ringInk !== INK.dryRing, view.readyShells, view.spentShells, view.struck], [true, 0, 4, 0],
    'the guided round is loaded (a live sight) while the cannon rack shows every shell spent');
  assert.equal(specialButton.classes.has('empty'), false, 'the guided special control is live');
  while (fire(tank));
  view = frame(tank, { advance: 0.5 });
  assert.equal(view.sweep, false);
  assert.equal(view.countdown, null);
  assert.deepEqual([view.readyShells, view.spentShells, view.struck], [0, 4, 1], 'every shell spent, the rack struck');
  assert.equal(view.dryRound, 0, 'a rack is struck itself; no extra single round');
  assert.equal(specialButton.classes.has('empty') && specialButton.disabled, true, 'the spent guided control is struck');
}

// 6b. A magazine-reload hull (Type 90: three-round bustle): the reload control is spent once nothing is stowed.
{
  const tank = tankOf('type90', [1, 0, 0]);
  let view = frame(tank);
  assert.deepEqual([view.readyShells, view.spentShells], [1, 2], 'one round stowed: one ready shell, two spent slots');
  assert.equal(specialButton.classes.has('empty'), false, 'a round is stowed: the reload control is live');
  assert.ok(fire(tank));
  view = frame(tank, { advance: 0.5 });
  assert.deepEqual([view.readyShells, view.spentShells, view.struck, view.sweep], [0, 3, 1, false]);
  const label = specialButton.querySelector('.sl');
  assert.equal(specialButton.classes.has('empty') && specialButton.disabled, true,
    'the magazine-reload control is struck and disabled: nothing stowed to load');
  assert.equal(label.textContent, label.dataset.short, 'with no countdown');
}

// 7. A guided salvo rack (ZTZ-100 prototype): nothing stowed while the salvo counter still holds one missile.
{
  const tank = tankOf('ztz100_prototype', [3, 0, 0]);
  fire(tank); fire(tank); fire(tank);
  assert.equal(tank.combat.launcherSalvoShots, 1, 'the salvo counter still says one missile is left in the group');
  const view = frame(tank, { advance: 0.5 });
  assert.deepEqual([view.readyShells, view.spentShells, view.struck, view.sweep], [0, 2, 1, false],
    'the rack never reads a missile that is not there');
}

// 8. A spent ATGM launcher while the autocannon fires (BWP-1's guided special; MBT-70's extra launcher beside its
// hydropneumatic special): the control is struck, its count is spoken only, the sight stays live.
{
  const tank = tankOf('bwp1');
  const slot = tank.spec.gun.shells.findIndex((shell) => shell.guided === true);
  tank.combat.ammo[slot] = 0;
  const view = frame(tank);
  assert.equal(view.ringInk !== INK.dryRing && view.dryRound === 0, true, 'the selected autocannon is loaded');
  const label = specialButton.querySelector('.sl');
  assert.equal(specialButton.classes.has('empty') && specialButton.disabled, true, 'the guided special is struck');
  assert.equal(label.textContent, label.dataset.short, 'no "0/N" text on the control');
  assert.notEqual(specialButton.getAttribute('aria-label'), specialButton.title, 'the spoken label carries the count');
  // the autocannon's three-digit count tightens its slot's bottom row (critic r3: APFSDS180); two digits do not
  assert.ok(tank.combat.ammo[0] >= 100 && traySlots[0].classes.has('wide'), `a ${tank.combat.ammo[0]}-round slot is wide`);
  assert.equal(traySlots[slot].classes.has('wide'), false, 'an empty launcher slot is not');
}
{
  const tank = tankOf('mbt70');
  const slot = tank.spec.gun.shells.findIndex((shell) => shell.guided === true);
  tank.combat.ammo[slot] = 0;
  selectFirstAvailableShell(tank.combat, tank.spec); // the last Shillelagh is gone: the sim selects the cannon
  assert.notEqual(tank.combat.shellSlot, slot);
  const view = frame(tank);
  assert.equal(view.ringInk !== INK.dryRing && view.dryRound === 0, true, 'the selected cannon is loaded');
  assert.equal(missileButton.hidden, false, 'the extra launcher has its own control');
  assert.equal(missileButton.classes.has('empty') && missileButton.disabled, true, 'the launcher control is struck');
  assert.equal(missileButton.querySelector('.sl').textContent, 'ATGM', 'no "0/N" text: the count is spoken only');
  assert.match(missileButton.getAttribute('aria-label'), /^ATGM \S/, 'the spoken label carries the count');
  assert.equal(specialButton.classes.has('empty'), false, 'the hydropneumatic special is untouched');
}

// 9. Unlimited rounds (Juggernaut, Infected and the Horde, in their ruleset rows since the merged rules head): stowage
// at zero never caps the rack or empties the sight.
{
  unlimitedRounds = true;
  const ruleset = matchRulesetFor('juggernaut');
  assert.equal(ruleset.ammo, 'unlimited');
  const tank = tankOf('m1a3', [0, 0, 0]);
  let view = frame(tank);
  assert.deepEqual([view.ringInk !== INK.dryRing, view.readyShells, view.spentShells, view.struck], [true, 4, 0, 0],
    'the ∞ mark feeds the whole rack whatever the counters say');
  tank.combat.ammo.forEach((_, slot) => { tank.combat.ammo[slot] = tank.combat.ammoCapacity[slot]; });
  for (let shot = 0; shot < 9; shot++) assert.ok(fire(tank, ruleset));
  view = frame(tank, { advance: 0.1 });
  assert.equal(view.sweep, true, 'the clip still cycles');
  assert.deepEqual([view.spentShells, view.dryRound, view.struck], [0, 0, 0]);
  unlimitedRounds = false;
}

// --- what the critic's mutation sweep left unpinned (r3) ---
const fills = (ops, style) => ops.filter((op) => op.op === 'fillRect' && op.style === style);

// 10. A full reload spreads its fill over the shells that will load: Type 90 with one round stowed fills that one
// shell at the reload's own pace (half way at half time), never a third of the rack at triple speed.
{
  const tank = tankOf('type90', [1, 0, 0]);
  tank.combat.magazine.rounds = 0;
  Object.assign(tank.combat.reload, { t: 5, totalS: 10, kind: 'magazine' });
  frame(tank);
  const loading = fills(ctx.ops, INK.cycling);
  assert.equal(loading.length, 1, 'one shell fills: the only one stowage can load');
  assert.ok(Math.abs(loading[0].h - (14 * 0.5 + 1)) < 1e-6, `half the reload fills half the shell (${loading[0].h})`);
}

// 12. Unlimited rounds with every stowage counter at zero: the rack, the sight and the magazine control agree (the
// mark lifts the cap on every path, as the tray's ∞ does), and the same counters on a finite loadout agree on empty.
{
  unlimitedRounds = true;
  const tank = tankOf('type90', [0, 0, 0]);
  let view = frame(tank);
  assert.deepEqual([view.ringInk !== INK.dryRing, view.readyShells, view.spentShells, view.struck], [true, 3, 0, 0]);
  assert.equal(specialButton.classes.has('empty'), false,
    'the magazine-reload control is not struck: nothing reads spent under the mark, from the first frame');
  unlimitedRounds = false;
  view = frame(tank);
  assert.deepEqual([view.ringInk, view.readyShells, view.struck], [INK.dryRing, 0, 1]);
  assert.equal(specialButton.classes.has('empty') && specialButton.disabled, true, 'finite and empty: struck');
}

// 13. Between two rounds of a clip the rack shows the cycle itself: the round being chambered (the next to fire, the
// last ready slot) fills from its base, the slot of the round just fired stays empty, and nothing vanishes when the
// cycle ends (critic r3: the fired slot filled back in, then emptied). No numeral under the rack. The same holds for
// the guided salvo racks between two missiles: the ZTZ-100 prototype's pair and Object 695's four.
/** The rack's fills in one ink by slot, left to right: the shells' 1 px outlines give the slot centres. */
function rackFills(ops, style) {
  const centre = (box) => (box.x0 + box.x1) / 2;
  const slots = ops.filter((op) => op.op === 'stroke' && op.lineWidth === 1 && op.box && op.box.x1 - op.box.x0 < 24
    && op.box.y0 > HEIGHT / 2).map((op) => centre(op.box)).sort((a, b) => a - b);
  const heights = slots.map(() => 0);
  for (const op of fills(ops, style)) {
    const x = centre(op.box);
    const slot = slots.reduce((best, c, index) => (Math.abs(c - x) < Math.abs(slots[best] - x) ? index : best), 0);
    heights[slot] = op.h;
  }
  return heights;
}
for (const [id, slots, fired] of [['m1a3', 4, 2], ['ztz100_prototype', 2, 1], ['object695', 4, 1]]) {
  const tank = tankOf(id);
  for (let shot = 0; shot < fired; shot++) assert.ok(fire(tank), `${id}: shot ${shot + 1}`);
  assert.equal(tank.combat.reload.kind, 'intraClip', `${id}: the group cycles to its next round`);
  const ready = slots - fired;
  const totalS = tank.combat.reload.totalS;
  tank.combat.reload.t = totalS / 2;
  let view = frame(tank);
  assert.equal(view.countdown, null, `${id}: no countdown under the rack while the group cycles`);
  assert.equal(view.sweep, true, `${id}: the ring still sweeps the cycle`);
  const half = rackFills(ctx.ops, INK.cycling);
  assert.equal(half.length, slots, `${id}: ${slots} rack slots`);
  assert.deepEqual(half, [...Array(ready - 1).fill(15), 8, ...Array(fired).fill(0)],
    `${id}: the round being chambered half filled at half the cycle, the fired slot${fired > 1 ? 's' : ''} empty (${half})`);
  // through the whole cycle: the chambered slot only grows, a fired slot never fills
  let last = 0;
  for (let step = 1; step <= 6; step++) {
    tank.combat.reload.t = totalS * (1 - step / 6) + (step === 6 ? 0 : 1e-6);
    view = frame(tank);
    const ink = step === 6 ? INK.reload : INK.cycling;
    const heights = rackFills(ctx.ops, ink);
    assert.ok(heights.slice(ready).every((h) => h === 0), `${id} step ${step}: a fired slot never fills (${heights})`);
    assert.ok(heights[ready - 1] >= last, `${id} step ${step}: the chambered round only fills (${heights})`);
    last = heights[ready - 1];
  }
  assert.deepEqual(rackFills(ctx.ops, INK.reload), [...Array(ready).fill(15), ...Array(fired).fill(0)],
    `${id}: the cycle ends with every ready round whole; nothing vanishes`);
}

// 14. The ×8 sight on short landscape phones (critic r3 measured 844x390, 932x430 and 667x375): the empty mark, the
// rack, its countdown and the range tag never land on the readout line or the zoom plate. Desktop keeps its stack.
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
function resize(width, height) {
  Object.assign(windowStub, { innerWidth: width, innerHeight: height });
  Object.assign(windowStub.visualViewport, { width, height });
  windowStub.dispatchEvent(new Event('resize'));
}
function scopePaint(tank, width, height) {
  const view = frame(tank, { mode: 'sniper' });
  const texts = ctx.ops.filter((op) => op.op === 'fillText' && op.text.trim() && op.box.y0 > height / 2);
  const strokes = ctx.ops.filter((op) => op.op === 'stroke' && op.box);
  const dry = strokes.filter((op) => op.style === INK.dry);
  const shells = strokes.filter((op) => op.lineWidth === 1 && op.box.x1 - op.box.x0 < 24 && op.box.y0 > height / 2
    && Math.abs((op.box.x0 + op.box.x1) / 2 - width / 2) < 40);
  return { view, texts, dry, shells, text: (pattern) => texts.find((op) => pattern.test(op.text)) };
}
function assertApart(items, others, label) {
  for (const a of items) for (const b of others) {
    if (a !== b) assert.ok(!overlap(a.box, b.box), `${label}: ${a.text ?? a.style} over ${b.text ?? b.style}`);
  }
}
scope = true;
for (const [width, height] of [[844, 390], [932, 430], [667, 375]]) {
  resize(width, height);
  const at = `${width}x${height}`;
  // a single-shot gun, empty: the struck round leads the readout line
  let paint = scopePaint(tankOf('m1a1_abrams_hc', [0, 0, 0]), width, height);
  const count = paint.text(/^0 $/);
  const round = paint.dry.filter((op) => op.lineWidth === 1.2);
  assert.ok(count && round.length, `${at}: the empty count and its struck round`);
  for (const op of round) {
    assert.ok(op.box.x1 <= count.box.x0 && op.box.y1 > count.box.y0 && op.box.y0 < count.box.y1,
      `${at}: the round rides the readout line, left of the count`);
  }
  assertApart(paint.dry, paint.texts, `${at} empty cannon`);
  assertApart(paint.texts, paint.texts, `${at} empty cannon`);
  // reloading: the countdown clears the readout line
  const loaded = tankOf('m1a1_abrams_hc');
  Object.assign(loaded.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' });
  paint = scopePaint(loaded, width, height);
  assert.ok(paint.view.countdown, `${at}: the reload counts down`);
  assertApart(paint.texts, paint.texts, `${at} reloading cannon`);
  // an autoloader, empty: the struck rack sits above the readout line
  const dryRack = tankOf('m1a3', [0, 0, 0]);
  dryRack.combat.magazine.rounds = 0;
  paint = scopePaint(dryRack, width, height);
  assert.equal(paint.shells.length, 4, `${at}: four spent shells`);
  assertApart(paint.dry, paint.texts, `${at} empty rack`);
  assertApart([...paint.shells, ...paint.texts], paint.texts, `${at} empty rack`);
  // ... and the strike keeps 3 px from every text, the readout line under it included (the capture's strike gap)
  for (const strike of paint.dry.filter((op) => op.lineWidth === 1.5)) for (const text of paint.texts) {
    const apart = Math.max(text.box.x0 - strike.box.x1, strike.box.x0 - text.box.x1, text.box.y0 - strike.box.y1,
      strike.box.y0 - text.box.y1);
    assert.ok(apart >= 3, `${at} empty rack: the strike keeps ${apart.toFixed(2)} px from "${text.text}"`);
  }
  // an autoloader reloading its rack: the countdown sits beside it (left), clear of the shells, readout and range tag
  const refill = tankOf('m1a3', [12, 4, 10]);
  refill.combat.magazine.rounds = 0;
  Object.assign(refill.combat.reload, { t: 12, totalS: 21, kind: 'magazine' });
  paint = scopePaint(refill, width, height);
  const clock = paint.text(/^12$/);
  assert.ok(clock, `${at}: the rack reload counts down`);
  assert.ok(clock.box.x1 <= Math.min(...paint.shells.map((op) => op.box.x0)), `${at}: the countdown is left of the rack`);
  assertApart([...paint.shells, ...paint.texts], paint.texts, `${at} reloading rack`);
}
// the shortest stack (h <= 300: a small phone under browser bars): a rack, struck or reloading, keeps the readout line
// and the zoom plate under it too (a struck rack may drop below a small ring)
resize(568, 290);
for (const [ammo, reload] of [[[0, 0, 0], null], [[12, 4, 10], { t: 12, totalS: 21, kind: 'magazine' }]]) {
  const tank = tankOf('m1a3', ammo);
  tank.combat.magazine.rounds = 0;
  if (reload) Object.assign(tank.combat.reload, reload);
  const paint = scopePaint(tank, 568, 290);
  const lines = paint.texts.filter((op) => !/^\d+ m$/.test(op.text) && !/^\d+$/.test(op.text) && op.text.trim() !== 's');
  assert.ok(lines.length >= 2 && paint.shells.length === 4, '568x290: the readout line, the zoom plate and the rack');
  assertApart([...paint.shells, ...paint.dry], lines, `568x290 ${reload ? 'reloading' : 'empty'} rack`);
}
// desktop: the stack sits well below the scope, the struck round stays under the marker
resize(WIDTH, HEIGHT);
{
  const paint = scopePaint(tankOf('m1a1_abrams_hc', [0, 0, 0]), WIDTH, HEIGHT);
  const round = paint.dry.filter((op) => op.lineWidth === 1.2);
  assert.ok(round.length && round.every((op) => Math.abs((op.box.x0 + op.box.x1) / 2 - WIDTH / 2) < 1),
    'desktop: the struck round stays centred under the marker');
  assertApart(paint.dry, paint.texts, 'desktop empty cannon');
}
scope = false;

/** The last painted frame once the ring has eased to its target (the next frame reuses the canvas). */
function settledPaint(tank, mode = 'battle') {
  let ops = null;
  for (let guard = 0; guard < 600; guard++) {
    if (!frame(tank, { mode }).painted) break;
    ops = ctx.ops.slice();
  }
  assert.ok(ops, 'the reticle painted');
  return ops;
}
/** The dispersion ring's halo (the wider of its two dashed full strokes): centre, radius and outer reach. */
function ringOf(ops) {
  const halo = ops.filter((op) => op.op === 'stroke' && op.dash.length >= 2 && arcOf(op)
    && arcOf(op)[5] - arcOf(op)[4] >= FULL_TURN - 1e-6)[0];
  const r = (halo.box.x1 - halo.box.x0) / 2 - halo.lineWidth / 2;
  return { x: (halo.box.x0 + halo.box.x1) / 2, y: (halo.box.y0 + halo.box.y1) / 2, r, reach: halo.lineWidth / 2 };
}
/** How far an empty mark keeps from the ring's stroke (negative: the ring runs through it). */
function ringClearance(ring, mark) {
  const { x0, y0, x1, y1 } = mark.box;
  const near = Math.hypot(Math.max(x0 - ring.x, 0, ring.x - x1), Math.max(y0 - ring.y, 0, ring.y - y1));
  const far = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x - ring.x, y - ring.y)));
  return Math.max(near - (ring.r + ring.reach), (ring.r - ring.reach) - far);
}

// 15. A phone's small ring, unscoped (critic r3: the struck round sat on the ring's sparse dashes, the same red): the
// empty mark — a single gun's struck round, an autoloader's struck rack — drops below the ring, 3 px clear of its
// stroke; a ring wide enough to hold the mark keeps it under the marker.
resize(390, 844);
for (const [id, label] of [['m1a1_abrams_hc', 'struck round'], ['m1a3', 'struck rack']]) {
  // rings of 11 (the floor), 15, 22, 29 and 40 px under the mark, and 58.5 (the phone's ceiling) holding it
  for (const [metres, wide] of [[1, false], [4, false], [6, false], [8, false], [11, false], [40, true]]) {
    dispersionM = metres;
    const tank = tankOf(id, [0, 0, 0]);
    if (tank.combat.magazine) tank.combat.magazine.rounds = 0;
    const ops = settledPaint(tank);
    const ring = ringOf(ops);
    const marks = ops.filter((op) => op.op === 'stroke' && op.style === INK.dry && op.box);
    assert.ok(marks.length, `${id} ${metres} m: the ${label} is painted`);
    for (const mark of marks) {
      const clear = ringClearance(ring, mark);
      assert.ok(clear >= 3, `${id}, a ${Math.round(ring.r)} px ring: the ${label} keeps ${clear.toFixed(2)} px from it`);
    }
    const top = Math.min(...marks.map((op) => op.box.y0));
    if (wide) assert.ok(top < ring.y + ring.r - 10, `${id}, a ${Math.round(ring.r)} px ring holds the ${label} under the marker`);
    else assert.ok(top > ring.y + ring.r, `${id}, a ${Math.round(ring.r)} px ring: the ${label} sits below it`);
  }
}
// 15b. critic r4 (D3): the canvas aim warning (a non-touch layout; a touch layout shows its own chip) moves under an
// empty mark that dropped below a small ring. On rings of 22, 29 and 40 px — a 29 px ring drops the struck round to
// about cy+36..53, just above where the warning used to sit — the chip never covers the mark and the warning text
// keeps 3 px from the mark and its strike, for both the gun travel limit and the rollover warning.
{
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const contains = (outer, inner) => outer.x0 <= inner.x0 && outer.x1 >= inner.x1 && outer.y0 <= inner.y0 && outer.y1 >= inner.y1;
  for (const [id, label] of [['m1a1_abrams_hc', 'struck round'], ['m1a3', 'struck rack']]) {
    for (const metres of [6, 8, 11]) {
      for (const [kind, warn] of [['limit', { gunLimitSpec: true }], ['rollover', { selfRightLabel: 'F' }]]) {
        dispersionM = metres;
        const tank = tankOf(id, [0, 0, 0]);
        if (tank.combat.magazine) tank.combat.magazine.rounds = 0;
        if (kind === 'limit') tank.state.gunLimitSpec = true;
        else Object.assign(tank.state, { overturned: true, grounded: true, _body: { tumbling: true } });
        const ops = settledPaint(tank);
        const ring = ringOf(ops);
        const at = `${id}, a ${Math.round(ring.r)} px ring, ${kind}`;
        const warning = aimWarningState(warn);
        assert.equal(warning.kind, kind);
        const text = ops.find((op) => op.op === 'fillText' && op.text === warning.text);
        assert.ok(text, `${at}: the canvas paints the warning`);
        const chip = ops.find((op) => op.op === 'fill' && op.box && op.path.length === 6 && contains(op.box, text.box));
        assert.ok(chip, `${at}: the warning's chip`);
        const marks = ops.filter((op) => op.op === 'stroke' && op.style === INK.dry && op.box);
        assert.ok(marks.length && Math.min(...marks.map((op) => op.box.y0)) > ring.y + ring.r, `${at}: the ${label} sits below the ring`);
        for (const mark of marks) {
          const what = mark.lineWidth === 1.5 ? 'strike' : label;
          assert.ok(apart(text.box, mark.box) >= 3,
            `${at}: the warning text keeps ${apart(text.box, mark.box).toFixed(2)} px from the ${what}`);
          assert.ok(apart(chip.box, mark.box) > 0, `${at}: the warning chip covers the ${what}`);
        }
      }
    }
  }
}
dispersionM = 8;

// 16. The portrait phone's scope (h > 430; critic r3: the struck rack's strike ended 1.5 px from the range tag): the
// tag starts past the rack on every small ring, not only on the short landscape stack — 3 px clear of the strike.
scope = true;
dispersionM = 1; // the scope's smallest ring: the tag hangs nearest the rack
{
  const tank = tankOf('m1a3', [0, 0, 0]);
  tank.combat.magazine.rounds = 0;
  const ops = settledPaint(tank, 'sniper');
  const tag = ops.find((op) => op.op === 'fillText' && /^\d+ m$/.test(op.text));
  const strike = ops.filter((op) => op.op === 'stroke' && op.style === INK.dry && op.lineWidth === 1.5);
  assert.ok(tag && strike.length, 'the range tag and the rack\'s strike');
  for (const op of strike) {
    const apart = Math.max(tag.box.x0 - op.box.x1, op.box.x0 - tag.box.x1, tag.box.y0 - op.box.y1, op.box.y0 - tag.box.y1);
    assert.ok(apart >= 3, `390x844 scope: the strike keeps ${apart.toFixed(2)} px from "${tag.text}"`);
  }
}
dispersionM = 8;
scope = false;
resize(WIDTH, HEIGHT);

// 17. The touch layer dims its FIRE buttons while the selected gun is dry (critic r3 advisory): the HUD marks the body,
// clears the mark when a round is loaded or the HUD hides, and an unlimited mark never sets it.
{
  const marked = () => documentStub.body.classes.has('cot-gun-dry');
  frame(tankOf('m1a1_abrams_hc', [0, 0, 0]));
  assert.equal(marked(), true, 'dry: marked');
  frame(tankOf('m1a1_abrams_hc', [1, 0, 0]));
  assert.equal(marked(), false, 'a round loaded: cleared');
  unlimitedRounds = true;
  frame(tankOf('m1a1_abrams_hc', [0, 0, 0]));
  assert.equal(marked(), false, 'unlimited rounds: never marked');
  unlimitedRounds = false;
  frame(tankOf('m1a1_abrams_hc', [0, 0, 0]));
  hud.setMode('hidden');
  assert.equal(marked(), false, 'a hidden HUD clears it');
  hud.setMode('battle');
}

// 18. critic r6: every mark under the marker keeps 3 px from the ring's stroke (its halo), and the countdown 3 px from
// the rack. A phone's live clip — full, short of stowage, unlimited mid-cycle — inside a small ring touched it (D3); the
// desktop scope's rack reload printed its countdown on the ring's dashes, the digits' tops on the clip (D2). On a
// phone's rings of 11 to 40 px and the desktop scope's at 1440x900 and 1920x1080, the clip, the countdown and the scope
// readout line keep their gaps; a ring wide enough to hold the clip keeps it under the marker.
{
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  // the rack's shells by their dark contours (magazineShellPath: seven points, 3 px wide), where their ink ends
  const contours = (ops) => ops.filter((op) => op.op === 'stroke' && op.lineWidth === 3 && op.path.length === 7 && op.style !== INK.dry);
  const countdownOf = (ops) => ops.filter((op) => op.op === 'fillText' && op.style === INK.reload && op.text.trim() && !op.text.startsWith('+'));
  const live = {
    full: () => tankOf('m1a3'),
    'short of stowage': () => { const tank = tankOf('m1a3', [2, 4, 0]); tank.combat.magazine.rounds = 4; return tank; },
    'unlimited mid-cycle': () => { const tank = tankOf('m1a3', [0, 0, 0]); tank.combat.magazine.rounds = 3;
      Object.assign(tank.combat.reload, { t: 1.4, totalS: 2.5, kind: 'intraClip' }); return tank; },
    'reloading its rack': () => { const tank = tankOf('m1a3', [12, 4, 10]); tank.combat.magazine.rounds = 0;
      Object.assign(tank.combat.reload, { t: 12, totalS: 21, kind: 'magazine' }); return tank; },
  };
  const check = (ops, at) => {
    const ring = ringOf(ops);
    const shells = contours(ops);
    assert.ok(shells.length >= 4, `${at}: the rack's shells`);
    for (const shell of shells) {
      const clear = ringClearance(ring, shell);
      assert.ok(clear >= 3 - 1e-6, `${at}: a shell keeps ${clear.toFixed(2)} px from a ${Math.round(ring.r)} px ring`);
    }
    for (const text of countdownOf(ops)) {
      const clear = ringClearance(ring, text);
      assert.ok(clear >= 3 - 1e-6, `${at}: the countdown "${text.text}" keeps ${clear.toFixed(2)} px from the ring`);
      for (const shell of shells) {
        assert.ok(apart(text.box, shell.box) >= 3 - 1e-6, `${at}: the countdown keeps ${apart(text.box, shell.box).toFixed(2)} px from the rack`);
      }
    }
    return { ring, shells };
  };
  resize(390, 844);
  for (const [metres, wide] of [[1, false], [4, false], [6, false], [8, false], [11, false], [40, true]]) {
    dispersionM = metres;
    for (const [label, make] of Object.entries(live)) {
      unlimitedRounds = label === 'unlimited mid-cycle';
      const ops = settledPaint(make());
      const { ring, shells } = check(ops, `390x844, ${metres} m, ${label}`);
      if (label === 'reloading its rack') assert.ok(countdownOf(ops).length, `${metres} m: the rack reload counts down`);
      const top = Math.min(...shells.map((op) => op.box.y0));
      if (wide) assert.ok(top < ring.y + ring.r - 10, `a ${Math.round(ring.r)} px ring holds the ${label} clip under the marker`);
      else assert.ok(top > ring.y + ring.r, `a ${Math.round(ring.r)} px ring: the ${label} clip sits below it`);
    }
    // a single gun reloading: its countdown clears the small ring too
    const gun = tankOf('m1a1_abrams_hc');
    Object.assign(gun.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' });
    const ops = settledPaint(gun);
    const clock = countdownOf(ops);
    assert.ok(clock.length, `${metres} m: the gun's countdown`);
    for (const text of clock) assert.ok(ringClearance(ringOf(ops), text) >= 3 - 1e-6, `390x844, ${metres} m: the gun's countdown keeps 3 px from the ring`);
  }
  unlimitedRounds = false;
  dispersionM = 8;
  scope = true;
  // (the scope's rings over a spread of dispersions: the larger ones drop the rack and its countdown below the ring,
  // down to where the readout line used to start)
  const radii = new Set();
  for (const [width, height] of [[1440, 900], [1920, 1080], [WIDTH, HEIGHT]]) {
    resize(width, height);
    for (const metres of [1, 4, 8, 11, 16, 24]) {
      dispersionM = metres;
      const at = `${width}x${height} scope, ${metres} m`;
      const ops = settledPaint(live['reloading its rack'](), 'sniper');
      radii.add(Math.round(check(ops, at).ring.r));
      const clock = countdownOf(ops);
      assert.ok(clock.length, `${at}: the scope's rack reload counts down`);
      // the readout line and the zoom plate start under the countdown
      const lines = ops.filter((op) => op.op === 'fillText' && op.text.trim() && op.style !== INK.reload && op.box.y0 > height / 2
        && !/^\d+ m$/.test(op.text));
      assert.ok(lines.length >= 2, `${at}: the readout line and the zoom plate`);
      for (const line of lines) for (const text of clock) {
        assert.ok(line.box.y0 - text.box.y1 >= 3 - 1e-6, `${at}: "${line.text}" starts ${(line.box.y0 - text.box.y1).toFixed(2)} px under the countdown`);
      }
    }
  }
  assert.ok(Math.max(...radii) >= 45 && Math.min(...radii) <= 30, `the scope's rings span small to wide (${[...radii].join(', ')} px)`);
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

console.log('hudAmmoOutPaint.selftest: the live HUD paints no sweep, countdown or ready flash on a dry gun, a sparse '
  + 'muted ring, a struck round or rack (below a small ring) and spent rack slots, struck launcher and magazine controls; '
  + 'a clip or salvo fills the round being chambered; unlimited rounds never read dry; the clip and the countdown keep '
  + '3 px from the ring and from each other');
