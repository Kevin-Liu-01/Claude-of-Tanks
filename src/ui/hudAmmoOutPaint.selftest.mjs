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
import { readFileSync } from 'node:fs';
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
import { addSightFurniture, clearSightFurniture, setSightNotice, settleSightFurniture, sightNotice } from './sightFurniture.ts';

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
      points: points.slice(), box: box(points, (state.lineWidth * scale()) / 2) }); },
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
let camera = null; // a camera on the frame projects the gun's own ring off the screen's centre (19b)
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
  hud.update({ timeS, mode, player: tank, tanks: [tank], spotting: { isSpotted: () => true }, aim, camera,
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

// 13b. The frame a reload ends on always repaints, whatever the wall clock (critic r9b: with performance.now running
// 200 ms a call, the scope's fade had settled and nothing else kept the canvas live, so a clip's cycle reading t 0 under
// its own kind reused the last cycling paint: the chambered round stayed part-filled). The cycle runs with the clock far
// ahead; the last step paints the round whole in the ready ink.
{
  const realNow = performance.now.bind(performance);
  let skew = 0;
  performance.now = () => realNow() + (skew += 1000);
  try {
    const tank = tankOf('m1a3');
    for (let shot = 0; shot < 2; shot++) assert.ok(fire(tank), `m1a3 (clock ahead): shot ${shot + 1}`);
    const totalS = tank.combat.reload.totalS;
    // (one scoped frame: the scope's fade, which would otherwise keep every frame repainting, settles on the clock)
    frame(tank, { mode: 'sniper' });
    tank.combat.reload.t = totalS / 6 + 1e-6;
    for (let i = 0; i < 60; i++) frame(tank); // the ring eases onto its target
    tank.combat.reload.t = 0;
    const view = frame(tank);
    assert.equal(view.painted, true, 'the frame the cycle ends on repaints');
    assert.deepEqual(rackFills(ctx.ops, INK.reload), [15, 15, 0, 0], 'the chambered round ends whole in the ready ink');
  } finally {
    performance.now = realNow;
  }
}

// 13c. A frame at rest is reused until something it shows changes; a relayout that moves the furniture is such a change
// (sightFurniture.version: the readouts may have to move), and a pass that measures the same boxes is not; so is a face
// that finishes loading after the paint (r10 critic: a reticle painted in the fallback face kept it).
{
  const tank = tankOf('m1a1_abrams_hc', [0, 0, 0]);
  settledFrame(tank);
  clearSightFurniture();
  settleSightFurniture();
  assert.equal(frame(tank).painted, false, 'the same (empty) furniture: reused');
  clearSightFurniture();
  addSightFurniture(10, 10, 60, 40);
  settleSightFurniture();
  assert.equal(frame(tank).painted, true, 'new furniture: repainted');
  assert.equal(frame(tank).painted, false, '... then reused again');
  clearSightFurniture();
  addSightFurniture(10, 10, 60, 40);
  settleSightFurniture();
  assert.equal(frame(tank).painted, false, 'the same box measured again: reused');
  clearSightFurniture();
  addSightFurniture(10, 12, 60, 42);
  settleSightFurniture();
  assert.equal(frame(tank).painted, true, 'the same count of boxes, one moved: repainted');
  assert.equal(frame(tank).painted, false, '... then reused again');
  // ... and a face that finishes loading repaints it (drawn before, the canvas measured and painted in the fallback)
  documentStub.fonts.dispatchEvent(new Event('loadingdone'));
  assert.equal(frame(tank).painted, true, 'a font that loads: repainted');
  assert.equal(frame(tank).painted, false, '... then reused again');
  clearSightFurniture();
  settleSightFurniture();
  frame(tank);
  // a shell switch the authority has not confirmed, no reload running: the reticle shows SWITCHING and, once the ring
  // has eased, reuses that paint (r10 critic: read with the pending flag, the reuse key repainted every frame of it)
  const switching = tankOf('m1a1_abrams_hc');
  switching.input = { shellSlot: 1 };
  switching._networkShellSlot = 0;
  const shown = settledFrame(switching);
  assert.equal(shown.painted, false, 'a shell switch at rest is reused');
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

// 19. critic r7 (D2): from 431 to about 525 px tall the readout line's rest clamp (h - 176) won over the furniture under
// the marker, and the line landed on the rack's countdown (800x500 down to -29.5 px, 900x480 -37.5, 700x460 -45.4, and a
// single gun's '24 ' 5.5 px into '3.2' at 700x460 and 16 m), the rack itself, the struck round and the ring; the range
// tag sat on a small ring's countdown ("3.2 s200 m") and the canvas aim warning's chip on the readout line. On the short
// mouse windows, stacked (under 1000 px) and wide, over a spread of rings, for every reticle state with and without the
// gun travel warning: the readout line and the zoom plate keep 3 px from the countdown, the rack, the empty marks, the
// warning chip, the range tag and the ring's stroke; the empty marks, the rack, the countdown and the chip keep 3 px
// from the ring; the chip keeps 3 px from every other mark; the tag keeps a group gap (16 px) beside a countdown on its
// row, or 3 px from one off it (the phone and landscape scopes too); and a wide tray's controls row stays 3 px clear of
// the stack, with the warning too (the zoom plate moves beside the line, then the chip joins the row, then the chip moves
// above the ring; critic r8: from 431 to 450 px tall the chip's row still ran 4.77 px into a row modelled 112 px over the
// floor, and the receipt skipped exactly those windows; the row's top measures 120 px over the floor, the tray's 64 px
// slots 16 px up, an 8 px gap and its 32 px buttons, at 1024x600, 1280x440 and x480, 1366x768, 1440x450 and x900). Every
// mark under the marker keeps 3 px from the scope's vision switch, and so does a ring centred on the marker (critic r8:
// seated under the sight, the readouts and the chip landed on it on mouse windows 520 to 600 px tall, a wide ring's stack
// on taller ones, and it ran under the tray and the controls row on mouse windows under 616 px tall).
const scopeStates = {
  'rack reload': () => { const tank = tankOf('m1a3', [12, 4, 10]); tank.combat.magazine.rounds = 0;
    Object.assign(tank.combat.reload, { t: 12, totalS: 21, kind: 'magazine' }); return tank; },
  'gun reload': () => { const tank = tankOf('m1a1_abrams_hc'); Object.assign(tank.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' }); return tank; },
  // a shell switch the authority has not confirmed: the countdown reads SWITCHING, wide enough to reach the range tag's
  // columns on a small ring (and painted right before an empty gun, whose row set beside the column must not start past
  // where the SWITCHING countdown ended: r9b critic, a stale countdown edge)
  switching: () => { const tank = tankOf('m1a1_abrams_hc'); tank.input = { shellSlot: 1 }; tank._networkShellSlot = 0;
    Object.assign(tank.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' }); return tank; },
  'dry gun': () => tankOf('m1a1_abrams_hc', [0, 0, 0]),
  'dry rack': () => { const tank = tankOf('m1a3', [0, 0, 0]); tank.combat.magazine.rounds = 0; return tank; },
  'live rack': () => tankOf('m1a3'),
  'mid-cycle': () => { const tank = tankOf('m1a3'); tank.combat.magazine.rounds = 3;
    Object.assign(tank.combat.reload, { t: 1.4, totalS: 2.5, kind: 'intraClip' }); return tank; },
  'gun ready': () => tankOf('m1a1_abrams_hc'),
};
// The vision switch's seat, read off the sheet (aerialHud.css) and modelled at its least size: level with the marker,
// past the widest ring (15% of the short side); a mouse layout right of the sight, past the range tag beside a small ring
// too (80 px), 156x48 at least; touch left of the sight, 104x46, narrower on a portrait under 343 px wide (its old seat,
// 68 px right of the marker and 3 px over it, met the range tag beside a ring of 30 to 50 px: 390x844, 11 m, -4.72 px; on
// the right it ran into the ammo and consumables column at 667x375, 568x290, 360x640 and 320x568). Beside the sight, the
// marks under the marker and the range tag are never past its inner edge, so its true width never matters. A mouse window
// under 540 px wide takes the compact 104x46 plate in the mouse seat (the full plate has no room beside the ring there).
const AERIAL_CSS = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
const MOUSE_SEAT = 'left:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 180px));top:50%;transform:translateY(-50%)';
const COMPACT_SEAT = '@media(pointer:coarse),(max-width:539px){\n .cot-scope-vision .flight-key,.scope-vision-cycle{display:none}\n'
  + ' .cot-hud .cot-scope-vision{left:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 112px));width:104px;min-width:104px;'
  + 'min-height:46px;';
const TOUCH_SEAT = '@media(pointer:coarse){\n /* (left of the sight, its right edge 8 px past the widest ring; a portrait under 343 px '
  + 'wide narrows it to fit) */\n .cot-hud .cot-scope-vision{left:auto;right:calc(50% + 15vmin + 8px);'
  + 'width:min(104px,calc(50% - 15vmin - 16px - env(safe-area-inset-left)));min-width:88px}\n}';
assert.ok(AERIAL_CSS.includes(MOUSE_SEAT) && AERIAL_CSS.includes('min-width:156px;min-height:48px'),
  'the sheet seats the mouse vision switch right of the sight, 156x48 at least');
assert.ok(AERIAL_CSS.includes(COMPACT_SEAT), 'the sheet seats the compact plate (touch, a narrow mouse window) right of the sight');
assert.ok(AERIAL_CSS.includes(TOUCH_SEAT), 'the sheet seats the touch vision switch left of the sight');
function visionSwitchBox(width, height, touch) {
  const vmin = Math.min(width, height);
  if (touch) {
    const x1 = width / 2 - 0.15 * vmin - 8;
    const w = Math.max(88, Math.min(104, width / 2 - 0.15 * vmin - 16));
    return { x0: x1 - w, y0: height / 2 - 23, x1, y1: height / 2 + 23 };
  }
  if (width < 540) {
    const x0 = Math.min(width / 2 + Math.max(0.15 * vmin + 8, 80), width - 112);
    return { x0, y0: height / 2 - 23, x1: x0 + 104, y1: height / 2 + 23 };
  }
  const x0 = Math.min(width / 2 + Math.max(0.15 * vmin + 8, 80), width - 180);
  return { x0, y0: height / 2 - 24, x1: x0 + 156, y1: height / 2 + 24 };
}
// r10 (critic r9): the HUD's panels and controls the reticle keeps clear of, as battleHudLayout measures and publishes
// them (sightFurniture.ts), recorded on the fixture (tools/fixtures/battle-hud-layout.html, Chrome) for every size this
// receipt sweeps by tools/hud-sight-furniture.browser.mjs: the controls row and the tray, a stacked tray's speedometer
// and damage panel beside the sight, a landscape phone's consumables column and systems row, a portrait phone's FIRE
// buttons, the score, the map, the vision switch. (The constant floors hud.ts once modelled missed the consumables at
// 667x375, a small portrait phone's left FIRE button and the touch warning chip.)
const FURNITURE = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-sight-furniture.json', import.meta.url), 'utf8'));
/** Publishes the recorded furniture of `width`x`height` (as the layout pass would; `variant` ':objective' for a mode
 *  with an objective, which shows its panel) and returns its boxes. */
function installFurniture(width, height, touch, variant = '') {
  const boxes = FURNITURE.sizes[`${width}x${height}${touch ? 't' : ''}${variant}`];
  assert.ok(boxes?.length, `${width}x${height}${touch ? ' touch' : ''}: recorded furniture`);
  clearSightFurniture();
  for (const [, x0, y0, x1, y1] of boxes) addSightFurniture(x0, y0, x1, y1);
  settleSightFurniture();
  return boxes.map(([name, x0, y0, x1, y1]) => ({ name, x0, y0, x1, y1 }));
}
/** The touch warning chip the reticle seats under the sight (hud.ts seatTouchWarning), read off its custom properties;
 *  null where it is hidden or not seated. 24 px tall, as the canvas chip's ink (battleHudLayout.css data-seat). */
const touchChip = created.find((element) => element.classes.has('cot-aim-warning'));
function seatedChipBox() {
  if (!touchChip || touchChip.hidden || touchChip.dataset.seat !== 'sight') return null;
  const px = (name) => parseFloat(touchChip.style.getPropertyValue(name));
  const x0 = px('--hud-aim-warning-x'); const y0 = px('--hud-aim-warning-y');
  return { x0, y0, x1: x0 + px('--hud-aim-warning-w'), y1: y0 + 24 };
}
/** The settled paint: the ring eases at exp(-14 dt), so 0.1 s HUD frames (the HUD's dt ceiling) settle it in a few. */
function quickPaint(tank, mode = 'sniper') {
  let ops = null;
  for (let guard = 0; guard < 200; guard++) {
    timeS += 0.1 - DT;
    if (!frame(tank, { mode }).painted) break;
    ops = ctx.ops.slice();
  }
  assert.ok(ops, 'the reticle painted');
  return ops;
}
/** Every gap the reticle's furniture keeps (above), and with `vision` (the switch's box) 3 px from the vision switch, the
 *  ring too with `ringClear` (a ring centred on the marker); returns the parts, by role. */
function reticleGaps(ops, at, { warn, scoped, vision = null, ringClear = false, touch = false }) {
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const contains = (outer, inner) => outer.x0 <= inner.x0 && outer.x1 >= inner.x1 && outer.y0 <= inner.y0 && outer.y1 >= inner.y1;
  const ring = ringOf(ops);
  const warning = warn ? aimWarningState({ gunLimitSpec: true }) : null;
  const warningText = warning && ops.find((op) => op.op === 'fillText' && op.text === warning.text);
  // (a touch layout's chip is the DOM chip the reticle seats, where it sits under the sight; a short landscape parks it
  // in the left lane, with the furniture)
  const seated = touch ? seatedChipBox() : null;
  // (the canvas chip by its 1 px outline's ink, not its fill: r10 critic, the outline came 2.5 px from the ring)
  const chip = seated ? { op: 'dom', box: seated }
    : warningText && ops.find((op) => op.op === 'stroke' && op.box && op.path.length === 6 && contains(op.box, warningText.box));
  // (or, while the sixth-sense notice shows, waits hidden where its place would run into the notice: r10e, section 19e)
  assert.ok(!warn || chip || (touch && windowStub.innerWidth > windowStub.innerHeight && windowStub.innerHeight < 550)
    || (touch && touchChip.hidden && sightNotice.on), `${at}: the warning's chip is seated`);
  assert.ok(touch || !warningText === !warn, `${at}: the canvas paints the warning only on a mouse layout`);
  const countdown = ops.filter((op) => op.op === 'fillText' && op.style === INK.reload && op.text.trim() && !op.text.startsWith('+'));
  const rack = ops.filter((op) => op.op === 'stroke' && op.lineWidth === 3 && op.path.length === 7 && op.style !== INK.dry);
  const marks = ops.filter((op) => op.op === 'stroke' && op.style === INK.dry && op.box);
  const tag = ops.find((op) => op.op === 'fillText' && /^\d+ m$/.test(op.text));
  const zoom = ops.find((op) => op.op === 'fillText' && /^×/.test(op.text));
  const rules = ops.filter((op) => op.op === 'stroke' && op.style === 'rgba(170,240,178,0.5)');
  const line = ops.filter((op) => op.op === 'fillText' && op.style !== INK.reload
    && (/^(\d+|∞) $/.test(op.text) || (/^[A-Z]+$/.test(op.text) && op !== warningText)));
  // (the zoom plate is left out only where the screen leaves it no room clear of the furniture)
  if (scoped) assert.ok(tag && line.length >= 2 && !zoom === !rules.length, `${at}: the readout line, the zoom plate and the range tag`);
  const stack = scoped ? [...line, ...(zoom ? [zoom] : []), ...rules] : [];
  const furniture = [...countdown.map((op) => [op, `the countdown "${op.text}"`]), ...rack.map((op) => [op, 'the rack']),
    ...marks.map((op) => [op, 'an empty mark']), ...(tag ? [[tag, 'the range tag']] : []), ...(chip ? [[chip, 'the warning chip']] : [])];
  for (const item of stack) {
    const name = item.text ?? 'a zoom rule';
    for (const [other, what] of furniture) {
      assert.ok(apart(item.box, other.box) >= 3 - 1e-6, `${at}: "${name}" keeps ${apart(item.box, other.box).toFixed(2)} px from ${what}`);
    }
    assert.ok(ringClearance(ring, item) >= 3 - 1e-6, `${at}: "${name}" keeps ${ringClearance(ring, item).toFixed(2)} px from the ring`);
  }
  for (const [item, what] of furniture.filter(([op]) => op !== tag)) {
    assert.ok(ringClearance(ring, item) >= 3 - 1e-6, `${at}: ${what} keeps ${ringClearance(ring, item).toFixed(2)} px from the ring`);
  }
  if (chip) {
    for (const [other, what] of furniture.filter(([op]) => op !== chip)) {
      assert.ok(apart(chip.box, other.box) >= 3 - 1e-6, `${at}: the warning chip keeps ${apart(chip.box, other.box).toFixed(2)} px from ${what}`);
    }
  }
  if (tag) {
    for (const text of countdown) {
      const row = Math.min(tag.box.y1, text.box.y1) - Math.max(tag.box.y0, text.box.y0) > 0;
      const gap = row ? tag.box.x0 - text.box.x1 : apart(tag.box, text.box);
      assert.ok(gap >= (row ? 16 : 3) - 1e-6, `${at}: the range tag keeps ${gap.toFixed(2)} px beside the countdown "${text.text}"${row ? ' on its row' : ''}`);
    }
  }
  if (vision) {
    for (const [item, what] of [...stack.map((op) => [op, op.text ? `"${op.text}"` : 'a zoom rule']), ...furniture]) {
      assert.ok(apart(item.box, vision) >= 3 - 1e-6, `${at}: ${what} keeps ${apart(item.box, vision).toFixed(2)} px from the vision switch`);
    }
    if (ringClear) {
      const clear = ringClearance(ring, { box: vision });
      assert.ok(clear >= 3 - 1e-6, `${at}: the ring keeps ${clear.toFixed(2)} px from the vision switch`);
    }
  }
  return { ring, chip, line, zoom, stack, tag, countdown, furniture: furniture.map(([op]) => op) };
}
/** The smallest windows, where the widest rings with the column under the marker (and on a portrait phone the warning
 *  chip) leave no place for every mark that keeps 3 px from the furniture: there the row, the chip and the column take
 *  the places that reach least far into it, and this is how far that is at worst, with a margin for the browser's own
 *  text metrics (r10, measured here and on the rendered fixture). Keys ending ':objective' are the recorded objective
 *  stage, which every mode but the standard battle shows (section 19c). 568x290: 3.34 px, a rack set over a 43 px ring
 *  under the score; with the objective panel 22.75 px, the panel over the sight and the systems row under it leaving the
 *  rack no room (only right of the ring is free). 320x568: 25.25 px here, 25.52 rendered, the readout row or the 156 px
 *  warning chip on the systems row, the left FIRE button under the sight. 360x640: 8.87 px (9.64 rendered), the 24 px
 *  chip on the systems row's underlines. 375x667: 7.34 px, '0 ' on the systems row with the warning under the widest
 *  ring. 740x360 and 640x360 with the objective panel: 0.37 px, an empty rack under the widest ring on the systems row. 1024x400 with
 *  the objective panel: 7.62 px, the warning chip set over the widest ring into the panel (the render keeps 3 px). Round
 *  r9 left 568x290 25.5 px into its systems row in a standard battle. Every other swept window, the listed capture sizes
 *  among them, keeps 3 px in a standard battle and in every mode. */
const TIGHT_FLOOR = { '568x290t': -3.5, '320x568t': -26, '360x640t': -9, '375x667t': -7.5,
  '568x290t:objective': -23, '320x568t:objective': -26, '360x640t:objective': -9, '375x667t:objective': -7.5,
  '740x360t:objective': -0.5, '640x360t:objective': -0.5, '1024x400:objective': -8 };
const tightWorst = {};
/** Every mark keeps 3 px from every recorded panel and control (sightFurniture.ts), or on the smallest windows no less
 *  than their floor (TIGHT_FLOOR). */
function assertFurnitureClear(items, boxes, at, key = null) {
  const floor = key && key in TIGHT_FLOOR ? TIGHT_FLOOR[key] : 3;
  for (const item of items) for (const panel of boxes) {
    const gap = Math.max(item.box.x0 - panel.x1, panel.x0 - item.box.x1, item.box.y0 - panel.y1, panel.y0 - item.box.y1);
    if (key in TIGHT_FLOOR) tightWorst[key] = Math.min(tightWorst[key] ?? Infinity, gap);
    assert.ok(gap >= floor - 1e-6, `${at}: ${item.text ? `"${item.text}"` : item.op === 'dom' ? 'the seated chip' : 'a mark'} keeps ${gap.toFixed(2)} px from ${panel.name}`);
  }
}
{
  // (the touch sizes, a phone and the landscape phones, paint the same canvas; their warning is the DOM chip, which the
  // reticle seats under the sight on a portrait phone (critic r9: at 50% + 48 px it met the scope's countdown and a rack
  // dropped below a wide ring) and a short landscape parks in the left lane. A mouse window 400 px tall keeps the compact
  // stack, its struck round leading the readout line under the canvas chip)
  // (r9, critic r8: 800x560, 700x580 and 800x580 put the readouts and the chip on the old switch seat; 1024 to 1440 by 431
  // to 450 ran the chip's row into the controls; 900x720 and 1440x900 drop a wide ring's rack and stack below the ring;
  // 540x720 seats the full mouse plate nearest a wide ring, and 390x844, 480x640 and 520x900 the compact one; the small
  // touch sizes seat it in the narrowest room left of the ring; 1280x420 and 1440x425 run the compact stack over a wide
  // tray's controls row, which it ran as much as 34 px into before it took the row's fallbacks. r10, critic r9: the two
  // stacked trays the capture shows (900x700, 640x720); a wide tray 400 px tall, where the widest rings left the row no
  // room under the sight; 667x375, whose wide ring set the zoom plate on the consumables; 360x640 and 320x568, whose left
  // FIRE button sits under the sight; and the landscape phones under a browser's bars, 740x360, 640x360 and 568x290)
  const sizes = [[800, 400], [800, 500], [900, 480], [700, 460], [700, 431], [700, 440], [700, 520], [1280, 431], [1280, 460],
    [1280, 470], [1024, 490], [1280, 520], [1024, 560], [1024, 600], [1024, 431], [1440, 431], [1280, 440], [1440, 450],
    [800, 560], [700, 580], [800, 580], [1440, 600], [900, 720], [1440, 900], [540, 720], [390, 844], [480, 640], [520, 900],
    [1280, 420], [1440, 425], [900, 700], [640, 720], [1024, 400],
    [390, 844, 'touch'], [844, 390, 'touch'], [667, 375, 'touch'], [568, 290, 'touch'], [320, 568, 'touch'],
    [360, 640, 'touch'], [932, 430, 'touch'], [740, 360, 'touch'], [640, 360, 'touch'], [375, 667, 'touch']];
  const modes = { zoomBeside: 0, chipBeside: 0, chipAbove: 0, rowBeside: 0, rowAbove: 0, noZoom: 0, seatedChip: 0 };
  scope = true;
  for (const [width, height, touch] of sizes) {
    resize(width, height);
    documentStub.body.classes[touch ? 'add' : 'delete']('cot-touch-layout');
    const boxes = installFurniture(width, height, !!touch);
    // (a wide tray's short window also sweeps the rings just wide enough to cross the rack or the struck round, which drop
    // them below the ring: 26 to 31 m put the readouts as much as 6.5 px into the controls row before rowBeside)
    for (const metres of (!touch && width >= 1000 && height <= 470) || (touch && width > height)
      ? [1, 11, 16, 24, 26, 27, 28, 29, 30, 31, 33, 35, 40] : [1, 11, 16, 24, 40]) {
      dispersionM = metres;
      for (const [label, make] of Object.entries(scopeStates)) for (const warn of [false, true]) {
        const tank = make();
        tank.state.gunLimitSpec = warn;
        const at = `${width}x${height}${touch ? ' touch' : ''} scope, ${metres} m, ${label}${warn ? ', gun travel warning' : ''}`;
        const { ring, chip, line, zoom, stack, tag, furniture } = reticleGaps(quickPaint(tank), at,
          { warn, scoped: true, vision: visionSwitchBox(width, height, !!touch), ringClear: true, touch: !!touch });
        if (chip?.op === 'dom') modes.seatedChip++;
        // a small portrait phone keeps the plain stack (the zoom plate under the line) under the sight on a small ring:
        // its rest (96 px under the marker) would set the plate on the aim hint and the left FIRE button, so the row
        // rises over them rather than leaving for the fallbacks
        if (touch && width === 360 && metres === 1 && label === 'gun reload' && !warn) {
          assert.ok(zoom && zoom.box.y0 > line[0].box.y1 && line[0].box.y0 > height / 2
            && Math.abs((zoom.box.x0 + zoom.box.x1) / 2 - width / 2) < 1, `${at}: the plain stack under the sight`);
          modes.risen = (modes.risen ?? 0) + 1;
        }
        if (!zoom) modes.noZoom++;
        else if (Math.abs(zoom.box.y1 - line[0].box.y1) < 3) modes[chip && Math.abs(chip.box.y1 - line[0].box.y1 - 8.4) < 3 ? 'chipBeside' : 'zoomBeside']++;
        if (chip && chip.box.y1 < ring.y - ring.r) modes.chipAbove++;
        if (line[0].box.y1 < ring.y - ring.r) modes.rowAbove++;
        if (line[0].box.x0 > width / 2) {
          // beside the column under the marker, the row keeps a group gap (16 px) from every mark on its level, and starts
          // right past the nearest of them, never past a countdown painted on an earlier frame (r9b critic)
          modes.rowBeside++;
          const left = Math.min(...stack.map((op) => op.box.x0));
          const level = furniture.filter((item) => item !== tag && item.op !== 'dom'
            && Math.min(item.box.y1, line[0].box.y1) > Math.max(item.box.y0, line[0].box.y0 - 10));
          for (const op of level) {
            assert.ok(left - op.box.x1 >= 16 - 0.5, `${at}: the row beside the column keeps ${(left - op.box.x1).toFixed(2)} px from a mark on its level`);
          }
          // (the column's right edge: the rack's turned outer contour 0.6 px past its modelled reach, a struck rack's strike
          // 2 px short of it; a stale countdown edge would carry the row 15 px and more further)
          const columnRight = Math.max(width / 2, ...furniture.filter((item) => item !== tag && item !== chip).map((op) => op.box.x1));
          assert.ok(left - columnRight <= 16 + 3, `${at}: the row beside the column starts ${(left - columnRight).toFixed(2)} px past the column`);
        }
        // every mark of the sight, the readout row, the countdown, the rack, the empty marks, the range tag and the
        // warning chip, keeps 3 px from every panel and control the layout measured
        assertFurnitureClear([...stack, ...furniture], boxes, at, `${width}x${height}${touch ? 't' : ''}`);
      }
    }
  }
  assert.ok(Object.values(modes).every((n) => n > 0) && modes.risen === 1, `the cramped rows ran (${JSON.stringify(modes)})`);
  // (the floors bind: each tight window does reach into its furniture, by no more than its floor allows)
  for (const [key, floor] of Object.entries(TIGHT_FLOOR).filter(([name]) => !name.includes(':'))) {
    assert.ok(tightWorst[key] < 3 && tightWorst[key] >= floor - 1e-6, `${key}: the least gap is ${tightWorst[key]?.toFixed(2)} (floor ${floor})`);
  }
  documentStub.body.classes.delete('cot-touch-layout');
  clearSightFurniture();
  settleSightFurniture();
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19a. r10 (critic r9): unscoped, a portrait phone's gun travel warning is the DOM chip the reticle seats under the
// column (the rack, the struck round, the countdown, the ring), 3 px from each and from the furniture; on the smallest
// phone, whose left FIRE button sits under the sight, it goes over the sight. (The recorded furniture is the scope's:
// its vision switch left of the sight stays in, a stricter test.)
{
  let over = 0;
  for (const [width, height] of [[390, 844], [360, 640], [320, 568]]) {
    resize(width, height);
    documentStub.body.classes.add('cot-touch-layout');
    const boxes = installFurniture(width, height, true);
    for (const metres of [2, 4, 8, 16, 40]) {
      dispersionM = metres;
      for (const label of ['rack reload', 'gun reload', 'dry gun', 'dry rack', 'mid-cycle']) {
        const tank = scopeStates[label]();
        tank.state.gunLimitSpec = true;
        const at = `${width}x${height} touch battle, ${metres} m, ${label}, gun travel warning`;
        const { ring, chip, furniture } = reticleGaps(quickPaint(tank, 'battle'), at, { warn: true, scoped: false, touch: true });
        assert.equal(chip?.op, 'dom', `${at}: the chip is seated under the sight`);
        // (a portrait under 375 px wide narrows it to 156 px, clear of the speedometer beside the sight at 360x640)
        assert.equal(chip.box.x1 - chip.box.x0, width < 375 ? 156 : 180, `${at}: the seated chip's width`);
        if (chip.box.y1 < ring.y - ring.r) over++;
        assertFurnitureClear(furniture, boxes, at, `${width}x${height}t`);
      }
    }
  }
  assert.ok(over > 0, 'the smallest phone seats the chip over the sight');
  // a reload repaints the reticle every frame; once the ring has eased onto its target the seated chip's place is
  // written no more (r10 critic: the ease's tail rewrote its style every frame, by 1e-8 px)
  resize(390, 844);
  documentStub.body.classes.add('cot-touch-layout');
  installFurniture(390, 844, true);
  dispersionM = 13; // under the 15% ceiling (16 m reaches it here), so the ring's radius follows the bloom
  const reloading = scopeStates['rack reload']();
  reloading.state.gunLimitSpec = true;
  quickPaint(reloading, 'battle');
  // a shot's bloom decaying toward the gun's rest the way the simulation's does (without end: src/sim/movement.ts): the
  // chip follows the widening ring, then the creep's last eighth of a pixel moves nothing (the ring's target sits on an
  // eighth-pixel grid); 240 frames on, over a second in which the radius moves under 1/30 px, the chip's place is
  // written once at most (it may cross one grid line), never every frame as the creep would have it
  // (the stub's style records what is written: a change of the seat's top is a write, and the HUD writes it only then)
  const seatTop = () => touchChip.style.getPropertyValue('--hud-aim-warning-y');
  let moved = 0;
  let writes = 0;
  let painted = 0;
  let last = seatTop();
  for (let i = 0; i < 300; i++) {
    dispersionM = 10 * (1 + 0.3 * Math.exp(-i / 40));
    const view = frame(reloading);
    if (i >= 240 && view.painted) painted++;
    if (seatTop() !== last) { if (i < 240) moved++; else writes++; last = seatTop(); }
  }
  assert.ok(moved > 0, 'the chip follows the ring as it eases');
  assert.equal(painted, 60, 'the reload repaints every frame');
  assert.ok(writes <= 1, `the seated chip is not rewritten by the bloom's creep (${writes} writes in 60 frames)`);
  documentStub.body.classes.delete('cot-touch-layout');
  clearSightFurniture();
  settleSightFurniture();
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19c. r10 critic: every mode but the standard battle shows its objective panel, which on a short landscape phone sits
// right over the sight, and seats its controls row, map and quick buttons elsewhere; the furniture is recorded on such a
// mode's stage (Juggernaut's). Through the scope, with and without the gun travel warning, over the rings: Juggernaut's
// ∞ (the owner's own example: a rack cycling or refilling, a gun reloading) and a finite mode's states (an AC-130
// escort, a flag or zone mode: out of rounds, a rack refilling, a gun reloading) keep every gap of section 19 and 3 px
// from that furniture, or no more than a tight window's floor.
{
  const sizes = [[1440, 900], [900, 700], [640, 720], [800, 500], [1024, 400], [390, 844, 'touch'], [844, 390, 'touch'],
    [667, 375, 'touch'], [740, 360, 'touch'], [640, 360, 'touch'], [568, 290, 'touch'], [360, 640, 'touch'], [320, 568, 'touch'],
    [375, 667, 'touch']];
  const states = {
    'rack mid-cycle': [true, () => { const tank = tankOf('m1a3'); tank.combat.magazine.rounds = 3;
      Object.assign(tank.combat.reload, { t: 1.4, totalS: 2.5, kind: 'intraClip' }); return tank; }],
    'rack refill': [true, () => { const tank = tankOf('m1a3'); tank.combat.magazine.rounds = 0;
      Object.assign(tank.combat.reload, { t: 12, totalS: 21, kind: 'magazine' }); return tank; }],
    'gun reload': [true, () => { const tank = tankOf('m1a1_abrams_hc'); Object.assign(tank.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' }); return tank; }],
    'finite gun reload': [false, () => { const tank = tankOf('m1a1_abrams_hc'); Object.assign(tank.combat.reload, { t: 3.2, totalS: 6, kind: 'shell' }); return tank; }],
    'finite rack refill': [false, scopeStates['rack reload']],
    'out of rounds': [false, scopeStates['dry gun']],
    'rack out of rounds': [false, scopeStates['dry rack']],
  };
  unlimitedRounds = true;
  scope = true;
  let endless = 0;
  for (const [width, height, touch] of sizes) {
    resize(width, height);
    documentStub.body.classes[touch ? 'add' : 'delete']('cot-touch-layout');
    const key = `${width}x${height}${touch ? 't' : ''}:objective`;
    const boxes = installFurniture(width, height, !!touch, ':objective');
    for (const metres of [1, 16, 24, 28, 33, 40]) {
      dispersionM = metres;
      for (const [label, [endlessRounds, make]] of Object.entries(states)) for (const warn of [false, true]) {
        unlimitedRounds = endlessRounds;
        const tank = make();
        tank.state.gunLimitSpec = warn;
        const at = `${width}x${height}${touch ? ' touch' : ''} objective-mode scope, ${metres} m, ${label}${warn ? ', gun travel warning' : ''}`;
        const { line, stack, furniture } = reticleGaps(quickPaint(tank), at,
          { warn, scoped: true, vision: visionSwitchBox(width, height, !!touch), ringClear: true, touch: !!touch });
        if (line.some((op) => op.text === '∞ ')) endless++;
        assertFurnitureClear([...stack, ...furniture], boxes, at, key);
      }
    }
  }
  assert.ok(endless > 0, 'the scope reads ∞ under Juggernaut');
  unlimitedRounds = false;
  for (const key of Object.keys(TIGHT_FLOOR).filter((name) => name.endsWith(':objective'))) {
    assert.ok(tightWorst[key] < 3 && tightWorst[key] >= TIGHT_FLOOR[key] - 1e-6, `${key}: the least gap is ${tightWorst[key]?.toFixed(2)} (floor ${TIGHT_FLOOR[key]})`);
  }
  documentStub.body.classes.delete('cot-touch-layout');
  clearSightFurniture();
  settleSightFurniture();
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19d. r10 critic (a mutant that left the range tag out of the chip's ceiling survived every sweep): where a panel sits
// under the sight, the range tag hangs at its 1:30 and the warning chip goes over the sight, where the tag's top, not the
// ring's, is the ceiling the chip keeps 3 px under.
{
  scope = true;
  for (const [width, height, metres] of [[1440, 900, 12], [900, 700, 16]]) {
    resize(width, height);
    dispersionM = metres;
    clearSightFurniture();
    settleSightFurniture();
    const plain = scopeStates['gun reload']();
    plain.state.gunLimitSpec = true;
    const ring = ringOf(quickPaint(plain));
    // (a panel under the marker's columns, its top 24 px under the ring's half radius: the tag's 4:30 meets it)
    const panel = { x0: ring.x - 45, y0: ring.y + ring.r / 2 + 24, x1: ring.x + 45, y1: height, name: 'the panel under the sight' };
    clearSightFurniture();
    addSightFurniture(panel.x0, panel.y0, panel.x1, panel.y1);
    settleSightFurniture();
    const tank = scopeStates['gun reload']();
    tank.state.gunLimitSpec = true;
    const at = `${width}x${height} scope, ${metres} m, gun reload, gun travel warning, a panel under the sight`;
    const { tag, chip, stack, furniture } = reticleGaps(quickPaint(tank), at, { warn: true, scoped: true });
    assert.ok(tag.box.y1 < ring.y, `${at}: the range tag hangs at the 1:30`);
    assert.ok(chip.box.y1 < ring.y - ring.r && chip.box.x1 > tag.box.x0, `${at}: the chip sits over the sight, over the tag's columns`);
    assertFurnitureClear([...stack, ...furniture], [panel], at);
  }
  clearSightFurniture();
  settleSightFurniture();
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19e. r10e (the rendered layout receipt on integ ce8b634668, tools/battle-hud-layout.browser.mjs: at 320x568 the warning
// chip the reticle seats over the sight sat under the DETECTED notice, 82-238 x 233-257 under 70-250 x 215-262.9): on
// every touch size the seated chip yields to the sixth-sense notice, in battle and through the scope, on the standard
// stage and on a mode's objective stage, over the rings, for every reticle state; it keeps 3 px from the notice where
// the layout records it (tools/fixtures/hud-sight-furniture.json `notices`, where the touch plan sets it; a short
// landscape parks the chip in the left lane, unseated) and where integ centred it over the sight, or waits hidden where
// its place runs into the notice. The notice never moves the chip or any mark (it
// comes and goes, and the places clear of it ran into the furniture instead: at 320x568 the left FIRE button, 22 px deep
// at 16 m), so each frame paints as it does without the notice, the chip shown where it was or hidden.
{
  let seated = 0;
  const yielded = {};
  const opsWithout = (ops) => ops.map((op) => JSON.stringify(op)).join('\n');
  // (where the layout now plans the notice, touchNoticePlan.ts, and where integ centred it over the sight, the defect's
  // place: 320x568 measured by the notices session's receipt, the rest from the r10e fixture before the plan)
  const INTEG_NOTICES = { '320x568t': [70, 215, 250, 262.88], '360x640t': [73, 264, 287, 306], '375x667t': [80.5, 277, 294.5, 319],
    '390x844t': [88, 208, 302, 250] };
  const notices = [...Object.entries(FURNITURE.notices).map(([key, box]) => [key, box, '']),
    ...Object.entries(INTEG_NOTICES).map(([key, box]) => [key, box, ' (integ\'s place)'])];
  for (const [key, notice, integ] of notices) {
    const [, width, height, variant] = /^(\d+)x(\d+)t(.*)$/.exec(key).map((v, i) => (i && i < 3 ? Number(v) : v));
    resize(width, height);
    documentStub.body.classes.add('cot-touch-layout');
    installFurniture(width, height, true, variant);
    for (const scoped of [false, true]) for (const metres of [1, 11, 16, 24, 40]) {
      scope = scoped;
      dispersionM = metres;
      for (const [label, make] of Object.entries(scopeStates)) {
        const at = `${key} ${scoped ? 'scope' : 'battle'}, ${metres} m, ${label}, gun travel warning, the DETECTED notice${integ}`;
        setSightNotice(false);
        settleSightFurniture();
        const plain = make();
        plain.state.gunLimitSpec = true;
        const before = opsWithout(quickPaint(plain, scoped ? 'sniper' : 'battle'));
        const place = seatedChipBox();
        setSightNotice(true, ...notice);
        settleSightFurniture();
        const tank = make();
        tank.state.gunLimitSpec = true;
        const ops = quickPaint(tank, scoped ? 'sniper' : 'battle');
        assert.equal(opsWithout(ops), before, `${at}: the reticle paints as it does without the notice`);
        reticleGaps(ops, at, { warn: true, scoped, touch: true });
        const chip = seatedChipBox();
        if (!chip) {
          if (place) {
            yielded[key + integ] = (yielded[key + integ] ?? 0) + 1;
            const gap = Math.max(notice[0] - place.x1, place.x0 - notice[2], notice[1] - place.y1, place.y0 - notice[3]);
            assert.ok(gap < 3, `${at}: the chip hides only where its place runs into the notice (${gap.toFixed(2)} px)`);
          }
          continue;
        }
        seated++;
        assert.deepEqual(chip, place, `${at}: the notice never moves the chip`);
        const gap = Math.max(notice[0] - chip.x1, chip.x0 - notice[2], notice[1] - chip.y1, chip.y0 - notice[3]);
        assert.ok(gap >= 3 - 1e-6, `${at}: the seated chip keeps ${gap.toFixed(2)} px from the notice`);
      }
    }
  }
  assert.ok(seated > 0 && Object.keys(yielded).some((key) => key.endsWith('(integ\'s place)')),
    `the chips were seated, and yielded to integ's place (${JSON.stringify(yielded)})`);
  setSightNotice(false);
  documentStub.body.classes.delete('cot-touch-layout');
  clearSightFurniture();
  settleSightFurniture();
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19f. r10f (the notices critic on integ/229 11a74e4906: the scope's right arm ran through the Daylight vision plate, the
// lower post across the gun travel chip, a mil tick across the rack onto the struck round): through the scope, on mouse
// windows and phones among their recorded furniture (the vision plate in it), for every reticle state with and without
// the warning, over the rings, every cross arm segment keeps 3 px from every mark (the rack, the struck round, the
// countdown, the readout line and zoom plate, the range tag, the chip) and from the furniture, every mil tick 2 px.
{
  const ARM_INK = new Set(['rgba(170,240,178,0.6)', 'rgba(4,7,6,0.38)']);
  const TICK_INK = new Set(['rgba(176,242,184,0.70)', 'rgba(3,7,5,0.52)']);
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  // (a stroke's moveTo/lineTo pairs, each a segment, its line width either side)
  const segments = (op) => {
    const out = [];
    for (let i = 0; i + 1 < op.points.length; i += 2) {
      const [ax, ay] = op.points[i];
      const [bx, by] = op.points[i + 1];
      const pad = op.lineWidth / 2;
      out.push({ x0: Math.min(ax, bx) - pad, y0: Math.min(ay, by) - pad, x1: Math.max(ax, bx) + pad, y1: Math.max(ay, by) + pad });
    }
    return out;
  };
  let arms = 0;
  let ticks = 0;
  scope = true;
  for (const [width, height, touch] of [[1440, 900], [1024, 600], [900, 700], [800, 500], [1280, 520], [390, 844, 'touch'],
    [360, 640, 'touch'], [740, 360, 'touch'], [667, 375, 'touch']]) {
    resize(width, height);
    documentStub.body.classes[touch ? 'add' : 'delete']('cot-touch-layout');
    const boxes = installFurniture(width, height, !!touch);
    for (const metres of [1, 11, 16, 24, 40]) {
      dispersionM = metres;
      for (const [label, make] of Object.entries(scopeStates)) for (const warn of [false, true]) {
        const tank = make();
        tank.state.gunLimitSpec = warn;
        const at = `${width}x${height}${touch ? ' touch' : ''} scope's arms, ${metres} m, ${label}${warn ? ', gun travel warning' : ''}`;
        const ops = quickPaint(tank);
        const { stack, furniture } = reticleGaps(ops, at, { warn, scoped: true, touch: !!touch });
        const marks = [...stack.map((op) => [op.box, op.text ? `"${op.text}"` : 'a zoom rule']),
          ...furniture.map((op) => [op.box, op.op === 'dom' ? 'the seated chip' : op.text ? `"${op.text}"` : 'a mark']),
          ...boxes.map((box) => [box, box.name])];
        for (const op of ops) {
          if (op.op !== 'stroke' || !op.points) continue;
          const arm = ARM_INK.has(op.style);
          if (!arm && !TICK_INK.has(op.style)) continue;
          for (const segment of segments(op)) {
            if (arm) arms++; else ticks++;
            for (const [box, what] of marks) {
              const gap = apart(segment, box);
              assert.ok(gap >= (arm ? 3 : 2) - 1e-6, `${at}: a ${arm ? 'cross arm' : 'mil tick'} keeps ${gap.toFixed(2)} px from ${what}`);
            }
          }
        }
      }
    }
  }
  assert.ok(arms > 0 && ticks > 0, `the scope's arms (${arms}) and ticks (${ticks}) painted`);
  documentStub.body.classes.delete('cot-touch-layout');
  clearSightFurniture();
  settleSightFurniture();
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

// 19b. r8: the gun's ring follows its own lay, off the screen's centre when the turret lags the camera. With a camera on
// the frame and the gun turned off the camera's aim, the ring sits left, right, above and below the marker: every gap of
// section 19 holds (the struck marks test the ring's whole circle, not its lower arc; the warning chip, its row and the
// readout stack keep clear of the ring wherever it sits), through the scope and unscoped. (The range tag still hangs
// off the screen centre's 4:30, not the ring's: older than this item.)
{
  const sizes = [[1280, 460], [800, 500], [390, 844, 'touch']];
  const ringAt = { left: 0, right: 0, above: 0, below: 0 };
  for (const [width, height, touch] of sizes) {
    resize(width, height);
    documentStub.body.classes[touch ? 'add' : 'delete']('cot-touch-layout');
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    camera.position.set(0, 2, 0);
    camera.lookAt(0, 2, 200);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    for (const scoped of width === 1280 ? [true, false] : [true]) {
      scope = scoped;
      for (const metres of [4, 16, 40]) {
        dispersionM = metres;
        for (const dx of [-0.3, 0, 0.3]) for (const dy of [-0.2, 0, 0.2]) {
          for (const [label, make] of Object.entries(scopeStates)) for (const warn of touch ? [false] : [false, true]) {
            const tank = make();
            tank.state.gunLimitSpec = warn;
            tank.visual.gunDirWorld = (out) => out.set(dx, dy, 1).normalize();
            const at = `${width}x${height} ${scoped ? 'scope' : 'battle'}, ${metres} m, the gun at (${dx}, ${dy}), ${label}${warn ? ', gun travel warning' : ''}`;
            const { ring } = reticleGaps(quickPaint(tank, scoped ? 'sniper' : 'battle'), at,
              { warn, scoped, vision: scoped ? visionSwitchBox(width, height, !!touch) : null });
            if (ring.x < width / 2 - 30) ringAt.left++;
            if (ring.x > width / 2 + 30) ringAt.right++;
            if (ring.y < height / 2 - 30) ringAt.above++;
            if (ring.y > height / 2 + 30) ringAt.below++;
          }
        }
      }
    }
  }
  assert.ok(Object.values(ringAt).every((n) => n > 0), `the gun's ring sat off the centre every way (${JSON.stringify(ringAt)})`);
  documentStub.body.classes.delete('cot-touch-layout');
  camera = null;
  scope = false;
  dispersionM = 8;
  resize(WIDTH, HEIGHT);
}

console.log('hudAmmoOutPaint.selftest: the live HUD paints no sweep, countdown or ready flash on a dry gun, a sparse '
  + 'muted ring, a struck round or rack (below a small ring) and spent rack slots, struck launcher and magazine controls; '
  + 'a clip or salvo fills the round being chambered; unlimited rounds never read dry; the clip and the countdown keep '
  + '3 px from the ring and from each other; on short mouse windows the scope readouts keep 3 px from every mark under the '
  + 'marker, the warning chip, the range tag and the ring, 3 px over a wide tray\'s controls row and a landscape phone\'s '
  + 'systems row and off a stacked tray\'s speedometer and damage panel (the chip above the ring, then the row beside the '
  + 'column under the marker, when nothing else fits), '
  + 'wherever the gun\'s ring sits, and every mark and a centred ring keep 3 px from the vision switch beside the sight; '
  + 'every mark of the sight, the touch warning chip the reticle seats under it included, keeps 3 px from the furniture the '
  + 'layout measures (sightFurniture.ts), the row going beside, over the ring or without its zoom plate, a rack, '
  + 'countdown or range tag over the ring, where it must; a reload\'s last frame always repaints');
