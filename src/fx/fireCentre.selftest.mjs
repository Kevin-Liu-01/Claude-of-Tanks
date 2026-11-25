// fire-center-277 (Kevin 2026-11-24: "tank fires need to be from the center of tank. rn its not, fix."): for every tank in
// the fleet, its live fire on the real FX runtime (fx/effects.ts) burns over its hull's measured centre (the drawn hull's
// bounds, combatAnatomyCalibration(id).hull, which tools/gen-combat-anatomy.mjs measures off each build) and comes up out
// of the hull's top there, upright, pitched and rolled, and flipped, with a hit at the bow before the fire.
//  - in hull space, upright: the fire's horizontal offset from the hull's centre is within BOUND of the hull's length;
//  - every pose: the fire stands on the world's vertical through the hull's centre (within BOUND of the length), and its
//    licks' base lies on the hull's skin over the centre (out of it, never inside);
//  - every id has a measured hull (no id falls back to its dims);
//  - (the follow-up, Main) its kill and its wreck column stand over the same centre: the sim's and the room's
//    tank:destroyed (which name the hull's origin; the wreck's entity resolves) and a replay or Studio kill naming its
//    hull (opts.hull), in every pose.
// Data only: no tank is built (the calibrations are the builds' receipts). Fails listing the ids.
// Negative control: effects.ts before fire-center-277 (a hit's point, else 0.3 of the length behind the origin) fails
// every id; with the fire's fix and the kill at the origin, the kills of the ids whose origin is off the drawn hull's
// middle fail (t95, m46_patton, m47_patton and others).
import '../vehicles/fleetRegistration.ts';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from '../vehicles/combatAnatomyCalibrations.ts';
import { registerCombatAnatomyCalibrations } from '../vehicles/combatAnatomyCalibrationRegistry.ts';
import { createFx } from './effects.ts';
import { hullFireFrame } from './hullFireAnchor.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

registerCombatAnatomyCalibrations(COMBAT_ANATOMY_CALIBRATIONS);

const BOUND = 0.05; // of the hull's length
const LICK_BASE_M = 0.8; // effects.ts LIVE_FIRE_LICK_BASE_M: a live fire's point stands this far under the hull's top
const SKIN_TOL_M = 0.03;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 4, -12); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
const entities = new Map();
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
  { seed: 7, resolveEntity: (id) => entities.get(id) ?? null, auxiliaryEntities: () => entities.values() });
scene.add(fx.group);
const handlers = new Map();
const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; },
  emit(n, p) { for (const f of [...(handlers.get(n) ?? [])]) f(p); } };
fx.bindBus(bus);
const frames = (n) => { for (let i = 0; i < n; i++) fx.update(1 / 60, [], camera, (id) => entities.get(id) ?? null); };

// upright facing anywhere; nose up 25° and rolled 15°; on its side; upside down
const POSES = [
  { name: 'upright', rot: [0, 0.7, 0] },
  { name: 'tilted', rot: [-0.44, -2.1, 0.26] },
  { name: 'on its side', rot: [0, 1.2, Math.PI / 2] },
  { name: 'flipped', rot: [0, -0.4, Math.PI] },
];

const fails = [];
let worst = { id: null, k: 0 }, worstKill = { id: null, k: 0 }, kills = 0;
/** a kill's wreck column (it rides the corpse from the kill's point): on the world's vertical through the centre _c */
function killCentred(key, what, L) {
  const col = fx.getAttachmentDebug().subjects.find((s) => s.id === key);
  if (!col) { fails.push(`${what}: no wreck column`); return; }
  kills++;
  const k = Math.hypot(col.pos[0] - _c.x, col.pos[2] - _c.z) / L;
  if (k > worstKill.k) worstKill = { id: what, k };
  if (k > BOUND) fails.push(`${what}: ${(k * 100).toFixed(1)}% of the hull's length off its centre`);
}
const ids = [...ALL_TANK_IDS];
assert.equal(ids.length, 313, `the fleet's ${ids.length} ids (the brief's 313)`);
const _w = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3();
for (const [n, id] of ids.entries()) {
  const spec = getSpec(id), cal = COMBAT_ANATOMY_CALIBRATIONS[id];
  if (!cal?.hull) { fails.push(`${id}: no measured hull`); continue; }
  const min = cal.hull.min, max = cal.hull.max;
  const L = max[2] - min[2];
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  for (const pose of POSES) {
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.position.set(40 + (n % 7) * 3, 2, 30 + (n % 5) * 4);
    root.rotation.set(...pose.rot);
    root.updateMatrixWorld(true);
    const e = { id, spec, visual: { root, isDestroyed: () => false }, state: { pos: root.position, yaw: pose.rot[1] },
      combat: { destroyed: false, fire: { burning: true } } };
    entities.set(id, e);
    // a hit at the bow before the fire: the fire still burns over the middle
    _w.set(cx, (min[1] + max[1]) / 2, max[2]).applyMatrix4(root.matrixWorld);
    bus.emit('shell:hit', { targetId: id, kind: 'pen', caliberMm: 120, pos: [_w.x, _w.y, _w.z], normal: [0, 0, 1] });
    bus.emit('tank:fire', { id, burning: true });
    frames(2);
    const at = fx.getAttachmentDebug().subjects.find((s) => s.id === id);
    bus.emit('tank:fire', { id, burning: false });
    // _c: the hull's measured centre in the world
    _c.set(cx, (min[1] + max[1]) / 2, cz).applyMatrix4(root.matrixWorld);
    // ---- the kill and its wreck column (the sim's and the room's tank:destroyed name the hull's origin; the wreck's
    // entity resolves) ----
    e.combat.destroyed = true; e.combat.fire.burning = false;
    e.visual.isDestroyed = () => true; e.visual.setDestroyed = () => {};
    bus.emit('tank:destroyed', { id, cause: 'shot', pos: [root.position.x, root.position.y, root.position.z] });
    killCentred(`wreck:${id}`, `${id} ${pose.name} kill`, L);
    // ---- a kill whose wreck does not resolve here names its hull (the killcam's replay, the Studio's actor) ----
    fx.destruction(root.position.clone(), null, 'shot', `ghost:${id}`, { hull: { spec, root } });
    killCentred(`wreck:ghost:${id}`, `${id} ${pose.name} replayed kill`, L);
    fx.resetAll();
    entities.delete(id);
    if (!at?.resolved) { fails.push(`${id} ${pose.name}: no live fire on the hull`); continue; }
    // the licks' base (the fire's point + LICK_BASE up the world), in hull space
    _l.set(at.pos[0], at.pos[1] + LICK_BASE_M, at.pos[2]);
    root.worldToLocal(_l);
    // its distance from the world's vertical through the hull's centre
    const offVertical = Math.hypot(at.pos[0] - _c.x, at.pos[2] - _c.z) / L;
    const offHull = pose.name === 'upright' ? Math.hypot(_l.x - cx, _l.z - cz) / L : 0;
    const k = Math.max(offVertical, offHull);
    if (k > worst.k) worst = { id: `${id} ${pose.name}`, k };
    if (k > BOUND) fails.push(`${id} ${pose.name}: ${(k * 100).toFixed(1)}% of the hull's length off its centre`);
    // on the skin: on one of the fire box's faces (the hull's measured box, its top the turret's roof where the turret
    // covers the centre), never inside the hull's box
    const box = hullFireFrame(spec);
    if (box?.source !== 'calibration') { fails.push(`${id}: the fire's box is not the measured hull`); continue; }
    const fmin = box.min, fmax = box.max;
    const onFace = (axis) => Math.abs(_l.getComponent(axis) - fmin[axis]) < SKIN_TOL_M || Math.abs(_l.getComponent(axis) - fmax[axis]) < SKIN_TOL_M;
    const inside = [0, 1, 2].every((a) => _l.getComponent(a) > min[a] + SKIN_TOL_M && _l.getComponent(a) < max[a] - SKIN_TOL_M);
    if (inside || !(onFace(0) || onFace(1) || onFace(2)) || (pose.name === 'upright' && _l.y < max[1] - SKIN_TOL_M)) {
      fails.push(`${id} ${pose.name}: the licks are born inside or off the hull (${_l.toArray().map((v) => v.toFixed(2))})`);
    }
  }
}
fx.resetAll();
assert.deepEqual(fails, [], `hull effects off their hull's centre or fires not out of its top (${fails.length}):\n  ${fails.join('\n  ')}`);

console.log(`fireCentre.selftest: all ${ids.length} tanks' live fires burn over their measured hull centre (worst ${(worst.k * 100).toFixed(2)}% of the hull's length, ${worst.id}; bound ${BOUND * 100}%) upright, tilted, on their side and flipped, with a bow hit first, and come up out of the hull's top; their ${kills} kills and wreck columns (tank:destroyed's, and a replay's naming its hull) stand over the same centre (worst ${(worstKill.k * 100).toFixed(2)}%${worstKill.id ? `, ${worstKill.id}` : ""})`);
