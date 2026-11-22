// fire-visible-275 (Kevin 2026-11-22: "if a tank is on fire or our tank we have to see the fire effects"): every burning
// hull this viewer sees has a live fire on the real FX runtime (fx/effects.ts), whatever else is smoking:
//  - each tank state: our own, an ally, a near and a far enemy, lit by their tank:fire edge or found only by the burn
//    scan (a hull spotted mid-fire, a network seat its tank_fire event was withheld from, a late joiner, a migrated
//    host's restored record);
//  - the budget: four wrecks smoking (MAX_COLUMNS full) never keep a fire dark, a burst of kills after it never evicts
//    one, and over the fires' own budget (six) the nearest burn, our own always among them;
//  - each camera kind: the chase view, the sight (zoomed, camera.userData.scoped) and a far view keep every fire live
//    and on its hull; a far fire's licks fill at least LIVE_FIRE_MIN_VIEW of the view's height, and the sight's narrow
//    field never blows a far fire up;
//  - the far tier: a fire rides the hull's visual root, so a far hull drawn by its far-LOD meshes (far-hull-273's one
//    draw swaps meshes under the root, never the root) keeps its fire on it as it drives.
// Negative control: with the old shared cap (columns.length >= MAX_COLUMNS in the scan) the first block fails.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const LIVE_FIRE_MIN_VIEW = 0.007; // effects.ts
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
const CHASE = { pos: [0, 3.2, -8], look: [0, 1.6, 20], fov: 55, scoped: false };
const SCOPE = { pos: [0, 2.3, 1.6], look: [0, 2.0, 400], fov: 7, scoped: true };
const FAR = { pos: [0, 30, -260], look: [0, 0, 120], fov: 55, scoped: false };
function view(kind) {
  camera.position.set(...kind.pos); camera.fov = kind.fov; camera.userData.scoped = kind.scoped;
  camera.updateProjectionMatrix(); camera.lookAt(...kind.look); camera.updateMatrixWorld(true);
}
view(CHASE);

function runtime(entities, options = {}) {
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
    { seed: 7, resolveEntity: (id) => entities.get(id) ?? null, auxiliaryEntities: () => entities.values(), ...options });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => { const l = handlers.get(n); l.splice(l.indexOf(f), 1); }; },
    emit(n, p) { for (const f of [...(handlers.get(n) ?? [])]) f(p); } };
  fx.bindBus(bus);
  const frames = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) fx.update(dt, [], camera, (id) => entities.get(id) ?? null); };
  return { fx, bus, frames };
}
/** a hull whose visual root stands where its state does; a far-LOD hull's meshes under the root are swapped, not it */
function hull(id, x, z, extra = {}) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const near = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6)); root.add(near);
  scene.add(root);
  return { id, visual: { root, near, isDestroyed: () => false }, state: { pos: root.position, yaw: 0 },
    combat: { destroyed: false, fire: { burning: false } }, ...extra };
}
function wreck(id, x, z) {
  const h = hull(id, x, z);
  h.combat.destroyed = true;
  h.visual.isDestroyed = () => true;
  h.visual.setDestroyed = () => {};
  return h;
}
const debug = (fx) => fx.getAttachmentDebug().subjects;
const fires = (fx) => debug(fx).filter((s) => !s.id.startsWith('wreck:'));
const wrecks = (fx) => debug(fx).filter((s) => s.id.startsWith('wreck:')).length;
const ids = (fx) => fires(fx).map((s) => s.id).sort();
function onHull(fx, entity, what) {
  const at = fires(fx).find((s) => s.id === entity.id);
  assert.ok(at, `${what}: ${entity.id} has a live fire`);
  assert.ok(at.resolved, `${what}: ${entity.id}'s fire rides its hull`);
  const p = entity.visual.root.position;
  assert.ok(Math.hypot(at.pos[0] - p.x, at.pos[2] - p.z) < 2.5,
    `${what}: ${entity.id}'s fire on its hull (${at.pos.map((v) => v.toFixed(1))} vs ${p.x}, ${p.z})`);
  return at;
}
function seenSize(at) {
  const d = camera.position.distanceTo(new THREE.Vector3(...at.pos));
  return at.lickW / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

// ---- each tank state, with the wreck budget full ----
const own = hull('me', 0, 0, { team: 'alpha', isPlayer: true });
const ally = hull('ally', 12, 18, { team: 'alpha' });
const nearFoe = hull('foe-near', -6, 60, { team: 'bravo' });
const farFoe = hull('foe-far', 8, 350, { team: 'bravo' });
const sampled = hull('foe-mp', 30, 120, { team: 'bravo', networkVisible: true }); // a peer's actor: its record from samples only
const migrated = hull('foe-migrated', -40, 90, { team: 'bravo' }); // a migrated host's restored record, no edge
const states = [own, ally, nearFoe, farFoe, sampled, migrated];
const entities = new Map(states.map((e) => [e.id, e]));
const { fx, bus, frames } = runtime(entities);
// four (then six) kills: the wreck smoke's budget full of burning wrecks
const kill = (id, x, z) => {
  entities.set(id, wreck(id, x, z));
  bus.emit('tank:destroyed', { id, cause: 'shot', pos: [x, 0, z] });
};
for (let i = 0; i < 6; i++) kill(`dead${i}`, 60 + i * 8, 40);
frames(30);
assert.equal(wrecks(fx), 4, 'four burning wrecks fill the smoke budget (MAX_COLUMNS)');
// our own and the near foe lit by their edge; the rest only by their combat record (the scan)
for (const e of states) e.combat.fire.burning = true;
bus.emit('tank:fire', { id: own.id, burning: true });
bus.emit('tank:fire', { id: nearFoe.id, burning: true });
frames(40);
assert.deepEqual(ids(fx), states.map((e) => e.id).sort(),
  'every burning hull has a live fire with four wrecks smoking (the scan is never refused by the wreck budget)');
assert.equal(wrecks(fx), 4, 'and the wrecks keep theirs');
// a burst of kills right after: no fire is evicted for a wreck
kill('dead6', 140, 40); kill('dead7', 150, 40);
frames(10);
assert.deepEqual(ids(fx), states.map((e) => e.id).sort(), 'a burst of kills after the fires evicts none of them');

// ---- each camera kind: live, on its hull, and seen ----
for (const [name, kind] of [['chase', CHASE], ['sight', SCOPE], ['far', FAR]]) {
  view(kind);
  frames(6);
  for (const e of states) onHull(fx, e, name);
}
view(CHASE);
frames(2);
const chaseFar = seenSize(onHull(fx, farFoe, 'chase'));
assert.ok(chaseFar >= LIVE_FIRE_MIN_VIEW * 0.999,
  `a fire 350 m off fills at least ${LIVE_FIRE_MIN_VIEW} of the view's height (${chaseFar.toFixed(4)})`);
const ownChase = onHull(fx, own, 'chase');
assert.ok(ownChase.lickW < 1.2, `our own fire close by keeps its own size, no floor (${ownChase.lickW.toFixed(2)} m)`);
view(FAR);
frames(2);
const farFar = seenSize(onHull(fx, farFoe, 'far'));
assert.ok(farFar >= LIVE_FIRE_MIN_VIEW * 0.999, `from a far view too (${farFar.toFixed(4)})`);
view(SCOPE);
frames(2);
const scopeFarW = onHull(fx, farFoe, 'sight').lickW;
view(CHASE);
frames(2);
assert.ok(scopeFarW <= onHull(fx, farFoe, 'chase').lickW + 1e-6,
  `the sight's zoom never blows a far fire up (${scopeFarW.toFixed(2)} m in the sight)`);

// ---- the far tier: the fire rides the root while the far-LOD meshes swap under it ----
farFoe.visual.near.visible = false; // the far-LOD draw takes over under the same root
farFoe.visual.root.position.set(20, 0, 380);
farFoe.visual.root.updateMatrixWorld(true);
frames(4);
onHull(fx, farFoe, 'far-LOD hull driving');

// ---- out: a fire goes out with its record, and over the fires' own budget the nearest burn ----
sampled.combat.fire.burning = false;
frames(3);
assert.ok(!ids(fx).includes(sampled.id), 'a fire goes out with its record');
fx.resetAll();
{
  const many = new Map();
  for (let i = 0; i < 9; i++) {
    const e = hull(`h${i}`, (i % 3) * 10, 30 + i * 40);
    e.combat.fire.burning = true;
    many.set(e.id, e);
  }
  const me = hull('me', 0, 0);
  me.combat.fire.burning = true;
  many.set('me', me);
  const r = runtime(many);
  view(CHASE);
  r.frames(40);
  assert.deepEqual(ids(r.fx), ['h0', 'h1', 'h2', 'h3', 'h4', 'me'], 'over the fires\' budget (six) the nearest burn, our own first');
  many.get('h0').combat.fire.burning = false;
  r.frames(40);
  assert.ok(ids(r.fx).includes('h5'), 'and the next nearest lights when one goes out');
  r.fx.resetAll();
}

console.log('fireVisible.selftest: every burning hull (own, ally, near and far foe, scan-only and migrated) has a live fire on its hull with the wreck budget full and after a burst of kills; the chase, sight and far views keep them; far licks fill at least 0.7% of the view and the sight never enlarges them; a far-LOD hull keeps its fire on its root; over six fires the nearest burn');
