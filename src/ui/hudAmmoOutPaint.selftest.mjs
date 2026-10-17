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
import { initHud, RETICLE_AMMO_INK as INK } from './hud.ts';

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
  const push = (step) => { path.push(step); };
  const ctx = {
    canvas, ops,
    save() { stack.push({ ...state, dash }); },
    restore() { const saved = stack.pop(); if (saved) { ({ dash } = saved); delete saved.dash; Object.assign(state, saved); } },
    setLineDash(value) { dash = Array.from(value); }, getLineDash: () => dash.slice(),
    beginPath() { path = []; }, closePath() {},
    moveTo: (x, y) => push(['moveTo', x, y]), lineTo: (x, y) => push(['lineTo', x, y]),
    arc: (x, y, r, a0, a1) => push(['arc', x, y, r, a0, a1]), arcTo: () => push(['arcTo']),
    ellipse: () => push(['ellipse']), rect: () => push(['rect']), roundRect: () => push(['roundRect']),
    quadraticCurveTo: () => push(['quad']), bezierCurveTo: () => push(['bezier']),
    stroke() { ops.push({ op: 'stroke', style: state.strokeStyle, lineWidth: state.lineWidth, dash: dash.slice(), path }); },
    fill() { ops.push({ op: 'fill', style: state.fillStyle, path }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: state.fillStyle, x, y, w, h }); },
    strokeRect() { ops.push({ op: 'strokeRect', style: state.strokeStyle }); },
    clearRect() { ops.push({ op: 'clear' }); },
    fillText(text, x, y) { ops.push({ op: 'fillText', text: String(text), style: state.fillStyle, x, y }); },
    strokeText(text) { ops.push({ op: 'strokeText', text: String(text), style: state.strokeStyle }); },
    measureText: (text) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    drawImage() { ops.push({ op: 'drawImage' }); },
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    setTransform() {}, resetTransform() {}, transform() {}, translate() {}, rotate() {}, scale() {}, clip() {},
    isPointInPath: () => false, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
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

await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'type90', 'ztz100_prototype', 'bwp1', 'mbt70']);
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
const controller = createAimController({
  getGame: () => ({ player: current, tanks: [current] }),
  getRig: () => ({ aimPoint: new THREE.Vector3(0, 2, 200), aimDist: 200, mode: 'CHASE', zoom: 1 }),
  worldRaycast: () => null,
  targetVisible: () => true,
  // The shell cards as game/playerBattleActions builds them: the ruleset's unlimited mark rides every card.
  getShellCards: () => current.spec.gun.shells.map((shell) => ({ name: shell.name, type: shell.guided ? 'ATGM' : shell.type,
    dmg: shell.dmg, penLabel: '', count: 0, ...(unlimitedRounds ? { unlimited: true } : {}) })),
  computeDispersion: () => 8, // a ring above the radius floor, so a settled reticle is reused
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

// 9. Unlimited rounds (Juggernaut, Infected, Horde): stowage at zero never caps the rack or empties the sight.
{
  unlimitedRounds = true;
  const ruleset = { ...matchRulesetFor('standard'), ammo: 'unlimited' };
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

console.log('hudAmmoOutPaint.selftest: the live HUD paints no sweep, countdown or ready flash on a dry gun, a sparse '
  + 'muted ring, a struck round or rack and spent rack slots, struck launcher and magazine controls; unlimited rounds '
  + 'never read dry');
