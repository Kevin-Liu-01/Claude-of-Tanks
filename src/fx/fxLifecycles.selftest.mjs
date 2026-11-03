// 2026-11-02 audit F10: the battle FX runtime's own lifecycles, on the real runtime (fx/effects.ts):
//  - deferred beats: a beat due under the killcam's suppression fires (its particles join the hidden emitters; it was
//    dropped for good), a light due then stays dark, and a deferred wreck made for one life of a visual never lands on
//    the next (a Studio actor reset inside the delay was wrecked again);
//  - a building's stages: a replayed or doubled stage event lays nothing again (its dust, the mask's collapse stamp, the
//    stage builders ran twice: a building stood up and fell again);
//  - smoke columns: a fire raised with no hit before it smokes where its hull stands, a fire seen burning whose
//    burning:false was lost goes out with the combat record, and a late joiner's already-burning hull smokes;
//  - one HE round, one burst: its hull event and its expiry split across frames (a network peer's queue) drew two;
//  - under the killcam's suppression the runtime keeps its scene graph hidden whatever its subsystems write each frame
//    (they re-showed themselves), hides a child added meanwhile, and the release restores what each owner asked for;
//  - a bus takes one runtime: binding twice, or a second runtime (a failed initializer's retry) binding the same bus,
//    never doubles the effects or leaves the first reacting;
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
function runtime(entities = new Map()) {
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
    { seed: 5, resolveEntity: (id) => entities.get(id) ?? null, auxiliaryEntities: () => entities.values() });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => { const l = handlers.get(n); l.splice(l.indexOf(f), 1); }; },
    emit(n, p) { for (const f of [...(handlers.get(n) ?? [])]) f(p); }, handlers };
  fx.bindBus(bus);
  const frames = (n, dt = 1 / 60, shells = []) => { for (let i = 0; i < n; i++) fx.update(dt, shells, camera, (id) => entities.get(id) ?? null); };
  return { fx, bus, frames };
}
function fakeVisual() {
  const root = new THREE.Group();
  scene.add(root);
  return { root, wrecks: 0, life: 0, wrecked: false,
    setDestroyed() { this.wrecks++; this.wrecked = true; }, isDestroyed() { return this.wrecked; }, wreckLife() { return this.life; } };
}

// ---- deferred beats ----
{
  const { fx, frames } = runtime();
  frames(2);
  // a composed kill's wreck is deferred 0.15 s; the killcam opens inside it
  const killed = fakeVisual();
  fx.destruction(new THREE.Vector3(0, 0, 0), killed, 'ammorack');
  assert.equal(killed.wrecks, 0, 'the wreck waits for the fireball');
  fx.setReplaySuppressed(true);
  frames(20);
  assert.equal(killed.wrecks, 1, 'a beat due under the suppression fires (it was dropped for good)');
  const debug = fx.getReplaySuppressionDebug();
  assert.deepEqual(debug.lightIntensities, [0, 0], 'and the lights stay dark while suppressed');
  fx.setReplaySuppressed(false);
  // a Studio actor restaged inside the delay: the deferred wreck was made for the life it ended
  const restaged = fakeVisual();
  fx.destruction(new THREE.Vector3(30, 0, 0), restaged, 'ammorack');
  restaged.life++;
  frames(20);
  assert.equal(restaged.wrecks, 0, 'a deferred wreck never lands on a visual reset since');
  fx.resetAll();
}

// ---- a building's stages are laid once ----
{
  const { fx, bus, frames } = runtime();
  frames(2);
  // what the stage threw: its chunks (and any media), summed over the pools
  const media = () => {
    let n = 0;
    fx.group.traverse((o) => { if (/^fx-(chunks-|volume-media)/.test(o.name) && o.geometry) n += o.geometry.instanceCount ?? 0; });
    return n;
  };
  const stage = (stage, previous) => ({ structureId: 3, massClass: 'house', cx: 10, cz: 5, hw: 4, hd: 5, yaw: 0, baseY: 0, topY: 7,
    stage, previous, cause: 'blast', munition: 'he', x: 10, y: 2, z: 0, dirX: 0, dirZ: 1, points: 300, integrity: 0 });
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  frames(6);
  const once = media();
  assert.ok(once > 0, `a collapse throws its debris (${once} pieces)`);
  fx.resetAll();
  frames(2);
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  bus.emit('structure:stage', stage('breached', 'damaged'));
  frames(6);
  assert.equal(media(), once, 'a doubled collapse and a late lower stage lay nothing again');
  fx.resetAll();
  frames(2);
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  frames(6);
  assert.equal(media(), once, 'a reset forgets what was laid: the next match lays it again');
  fx.resetAll();
}

// ---- smoke columns follow the fire, not only its events ----
{
  const hull = (id, x, burning) => ({ id, visual: { root: new THREE.Group() }, state: { pos: new THREE.Vector3(x, 0, 12) },
    combat: { destroyed: false, fire: { burning } } });
  const entities = new Map([['burner', hull('burner', 5, true)], ['late', hull('late', -8, true)]]);
  const { fx, bus, frames } = runtime(entities);
  const live = () => fx.getAttachmentDebug().subjects.map((s) => s.id).sort();
  bus.emit('tank:fire', { id: 'burner', burning: true });
  frames(3);
  assert.ok(live().includes('burner'), 'a fire raised with no hit before it smokes where its hull stands');
  const at = fx.getAttachmentDebug().subjects.find((s) => s.id === 'burner');
  assert.ok(Math.abs(at.pos[0] - 5) < 1.5 && Math.abs(at.pos[2] - 12) < 1.5, `at the hull (${at.pos.map((v) => v.toFixed(1))})`);
  frames(40);
  assert.ok(live().includes('late'), "a late joiner's already-burning hull smokes (no tank:fire edge reached it)");
  entities.get('burner').combat.fire.burning = false; // its burning:false lost
  frames(3);
  assert.ok(!live().includes('burner'), 'a fire seen burning goes out with the combat record');
  fx.resetAll();
}

// ---- one burst per HE round, whatever frames its events land on ----
{
  const { fx, bus, frames } = runtime();
  // the media bodies drawn: a hull's plate burst ~25, the ground's ~100, both ~125
  const bodies = () => fx.group.getObjectByName('fx-volume-media').children[0].geometry.instanceCount;
  const near = (a, b) => Math.abs(a - b) <= 5;
  let id = 100;
  const fired = (shellId) => bus.emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
    shellType: 'HE', caliberMm: 125, shellName: '125 mm HE', munition: 'he', chargeKg: 3.4 });
  const hit = (shellId) => bus.emit('shell:hit', { shellId, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 40, pos: [1, 0.8, 0],
    normal: [0, 1, 0], caliberMm: 125, shellType: 'HE', destroyed: false });
  const expired = (shellId) => bus.emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, munition: 'he', chargeKg: 3.4,
    caliberMm: 125, shellType: 'HE' });
  const run = (script) => { fx.resetAll(); frames(2); const shellId = id++; fired(shellId); script(shellId); frames(12); return bodies(); };
  // the solo order: the hull event and the expiry in one step: the ground's burst, the hull's fragments
  const sameFrame = run((s) => { hit(s); expired(s); frames(1); });
  const hullThenExpiry = run((s) => { hit(s); frames(2); expired(s); });
  assert.ok(near(hullThenExpiry, sameFrame), `a hull event, then its expiry two frames later: one burst (${hullThenExpiry} vs ${sameFrame})`);
  const expiryThenHull = run((s) => { expired(s); frames(2); hit(s); });
  assert.ok(near(expiryThenHull, sameFrame), `an expiry, then its hull event two frames later: one burst (${expiryThenHull} vs ${sameFrame})`);
  const hullOnly = run((s) => { hit(s); });
  assert.ok(hullOnly > 0 && hullOnly < sameFrame, `a hull event whose expiry never lands bursts on the hull after its wait (${hullOnly})`);
  fx.resetAll();
}

// ---- the scene graph stays hidden under the suppression ----
{
  const { fx, frames } = runtime();
  frames(2);
  const shown = () => fx.group.children.filter((c) => !c.isLight && c.visible).map((c) => c.name || c.type);
  // live rounds keep their subsystems writing every frame: a tracer, a wire-guided missile
  const shells = [
    { id: 71, pos: new THREE.Vector3(0, 2, 10), vel: new THREE.Vector3(0, 0, 1500), spec: { tracer: 'TANK' }, shooterId: 'g', ageS: 0.05, distM: 60 },
    { id: 72, pos: new THREE.Vector3(4, 3, 20), vel: new THREE.Vector3(0, 0, 250), spec: { guided: true, tracer: 'ATGM' }, shooterId: 'g', ageS: 1, distM: 250 },
  ];
  frames(3, 1 / 60, shells);
  const before = shown();
  assert.ok(before.length > 0, `live rounds draw (${before})`);
  const ownerHidden = fx.group.children.find((c) => !c.isLight && !c.visible);
  fx.setReplaySuppressed(true);
  assert.deepEqual(shown(), [], 'the suppression hides the scene graph at once');
  frames(3, 1 / 60, shells);
  assert.deepEqual(shown(), [], 'and keeps it hidden through the subsystems\' own per-frame writes');
  const late = new THREE.Group();
  late.name = 'late-child';
  fx.group.add(late);
  frames(1, 1 / 60, shells);
  assert.equal(late.visible, false, 'a child added under the suppression is hidden too');
  fx.setReplaySuppressed(false);
  assert.ok(before.every((name) => shown().includes(name)), 'the release shows what its owners asked for');
  if (ownerHidden) assert.equal(ownerHidden.visible, false, 'never a mesh its owner had hidden');
  fx.group.remove(late);
  fx.resetAll();
}

// ---- a bus takes one runtime, once ----
{
  const groundBurst = (bus, shellId) => {
    bus.emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9], shellType: 'HE',
      caliberMm: 125, shellName: '125 mm HE', munition: 'he', chargeKg: 3.4 });
    bus.emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, munition: 'he', chargeKg: 3.4, caliberMm: 125, shellType: 'HE' });
  };
  const media = (fx) => fx.group.getObjectByName('fx-volume-media').children[0].geometry.instanceCount;
  const once = runtime();
  once.frames(2); groundBurst(once.bus, 501); once.frames(6);
  const single = media(once.fx);
  const twice = runtime();
  twice.fx.bindBus(twice.bus);
  twice.frames(2); groundBurst(twice.bus, 502); twice.frames(6);
  assert.ok(Math.abs(media(twice.fx) - single) <= 5, `a bus bound twice reacts once (${media(twice.fx)} vs ${single})`);
  // a second runtime on the first one's bus takes it over
  const first = runtime();
  const second = runtime();
  second.fx.bindBus(first.bus);
  first.bus.emit('tank:destroyed', { id: 'x', cause: 'shot', pos: [3, 0, 3] });
  // (read before a frame: with no corpse to ride, the wreck column leaves at the next update)
  const wreckOf = (fx) => fx.getAttachmentDebug().subjects.some((c) => c.id === 'wreck:x');
  assert.equal(wreckOf(second.fx), true, 'the runtime that bound the bus last reacts');
  assert.equal(wreckOf(first.fx), false, 'the one it replaced no longer does');
  // one runtime on two buses (the page's, then the Studio's private one): binding the second keeps the first, and
  // rebinding either undoes only that bus's earlier binding
  const page = runtime();
  const studioHandlers = new Map();
  const studioBus = { on(n, f) { (studioHandlers.get(n) ?? studioHandlers.set(n, []).get(n)).push(f);
    return () => { const l = studioHandlers.get(n); l.splice(l.indexOf(f), 1); }; },
  emit(n, p) { for (const f of [...(studioHandlers.get(n) ?? [])]) f(p); } };
  const listeners = (handlers) => [...handlers.values()].reduce((n, l) => n + l.length, 0);
  const pageListeners = listeners(page.bus.handlers);
  page.fx.bindBus(studioBus);
  page.fx.bindBus(studioBus);
  assert.equal(listeners(page.bus.handlers), pageListeners, 'binding a second bus keeps the first bus\'s subscriptions');
  assert.equal(listeners(studioHandlers), pageListeners, 'and the second, bound twice, holds one set');
  page.bus.emit('tank:destroyed', { id: 'p', cause: 'shot', pos: [3, 0, 3] });
  studioBus.emit('tank:destroyed', { id: 's', cause: 'shot', pos: [-3, 0, 3] });
  const wrecks = page.fx.getAttachmentDebug().subjects.map((c) => c.id).filter((id) => id.startsWith('wreck:')).sort();
  assert.deepEqual(wrecks, ['wreck:p', 'wreck:s'], `the runtime reacts once to each bus (${wrecks})`);
  page.fx.resetAll(); page.frames(2); groundBurst(page.bus, 503); page.frames(6);
  assert.ok(Math.abs(media(page.fx) - single) <= 5, `the page bus still bursts once after the Studio's binding (${media(page.fx)} vs ${single})`);
  for (const r of [once, twice, first, second, page]) r.fx.resetAll();
}

console.log('fxLifecycles.selftest: deferred beats fire under suppression and never outlive their visual\'s life; a building\'s stages are laid once; smoke columns follow the fire; one burst per HE round; the scene graph stays hidden under the suppression; a bus takes one runtime');
