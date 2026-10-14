// A hull at rest on a roof stands still (physics stream F4(b), 2026-10-14; the coordinator: "a hull standing on a pitched
// deck that flips between the full and partial plane fit every few ticks moves the gun sight ±3 mrad, about ±3 m at
// 1 km"). Hulls stood for 10 s on each class of deck — a flat roof with a parapet under one track, along it and across it
// (Desert's: the hull perched on the parapet sprang nose-down off it, its tail lifted, the tip set it back), a gable
// straddled across its
// ridge and along it, a 30-degree pitch across and downhill, a 40-degree shed downhill — through the real network
// authority (tools/physics-torture.mjs runCase): over their last 5 s the pitch and roll vary less than 0.2 mrad and the
// height less than 0.2 mm; driven off afterwards, every hull moves off as before (no pop, no launch); the same stand
// twice ends on the same pose to the bit.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { appendStructureCollisionBand, deriveRuntimeStructureCollisionProfile, mergeStructureDecks } from '../src/world/structureCollision.ts';

await ensureAuthorityFleet(['t90m', 'bmp2', 'm1a2']);

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const flat = () => 0;
function building(walls, roof) {
  const record = appendStructureCollisionBand([], deriveRuntimeStructureCollisionProfile({ walls, roof }).contact, 0, 0, 0, 0);
  record.kind = 'structure';
  mergeStructureDecks([record]);
  return record;
}
const shellWalls = (half) => [box(2 * half, 4, 0.3, 0, 2, -half + 0.15), box(2 * half, 4, 0.3, 0, 2, half - 0.15),
  box(0.3, 4, 2 * half, -half + 0.15, 2, 0), box(0.3, 4, 2 * half, half - 0.15, 2, 0)];
/** Slab faces between the four top corners (and 0.2 m under them). */
function slab(top) {
  const bot = top.map(([x, y, z]) => [x, y - 0.2, z]);
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(top[3], top[2], top[1], top[0]); quad(bot[0], bot[1], bot[2], bot[3]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[i], top[j], bot[j], bot[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return mergeVertices(g);
}
/** A 16 x 16 m flat roof at 4 m with a 0.6 m parapet 0.25 m thick along its west edge. */
function parapetRoof() {
  const half = 8;
  return building(shellWalls(half), [slab([[-half, 4, -half], [half, 4, -half], [half, 4, half], [-half, 4, half]]),
    box(0.25, 0.6, 2 * half, -half + 0.125, 4.3, 0)]);
}
/** A gable of `deg` degrees over a 20 x 16 m house, its ridge along x at z = 0. */
function gable(deg) {
  const g = Math.tan(deg * Math.PI / 180), halfD = 8, eave = 4, ridge = eave + halfD * g, halfW = 10;
  return building(shellWalls(halfD), [
    slab([[-halfW, eave, -halfD], [halfW, eave, -halfD], [halfW, ridge, 0], [-halfW, ridge, 0]]),
    slab([[halfW, eave, halfD], [-halfW, eave, halfD], [-halfW, ridge, 0], [halfW, ridge, 0]]),
  ]);
}
/** A 20 x 20 m shed roof rising along +z at `deg` degrees from 4 m eaves. */
function shed(deg) {
  const g = Math.tan(deg * Math.PI / 180), half = 10, at = (z) => 4 + (z + half) * g;
  return building(shellWalls(half), [slab([[-half, at(-half), -half], [half, at(-half), -half], [half, at(half), half], [-half, at(half), half]])]);
}

const roofs = { parapet: parapetRoof(), gable30: gable(30), shed40: shed(40) };
// [deck class, roof, hull, x, z, heading (deg)]
const stands = [
  // (before the latch the oblique ones flipped between the fits: 5-11 mrad of pitch noise for as long as they stood)
  ['parapet under the left track', 'parapet', 't90m', -6.2, 0, 0],
  ['parapet across the left track', 'parapet', 'm1a2', -6.4, 0, 20],
  ['parapet across the left track', 'parapet', 'm1a2', -6.4, 0, 340],
  ['parapet across the left track', 'parapet', 'm1a2', -6.8, 0, 40],
  ['parapet across the left track', 'parapet', 'm1a2', -7.2, 0, 40],
  ['parapet across the left track', 'parapet', 'm1a2', -6.8, 0, 320],
  ['gable, across its ridge', 'gable30', 't90m', 0, 0, 0],
  ['gable, along its ridge', 'gable30', 'bmp2', 0, 0, 90],
  ['30-degree pitch, across', 'gable30', 'm1a2', 2, -3.5, 90],
  ['30-degree pitch, facing up it', 'gable30', 't90m', -2, -3.5, 0],
  ['40-degree shed, downhill', 'shed40', 't90m', 0, 0, 180],
];

const SIM_DT = 1 / 60;
function stand(roofId, hull, x, z, yawDeg, { seconds = 10, driveFrom = Infinity } = {}) {
  const pose = [];
  const metrics = runCase(hull, 'earth', { id: `rest-${roofId}`, terrain: flat, obstacles: [roofs[roofId]], seconds, rest: 'tail',
    // (the pops and throws are read from 2 s: the spawn's own seat over a parapet is the harness's, not the sim's)
    spawn: { x, z, yaw: yawDeg * Math.PI / 180, dropTo: 0.12 }, allowBlocked: true, metricsFromS: 2,
    input: (t) => (t >= driveFrom ? { throttle: 1 } : { throttle: 0, brake: true }) }, { replay: false,
    trace: (tick, match) => {
      const s = match.entityById.get('subject').state;
      pose.push([tick * SIM_DT, s.pos.x, s.pos.y, s.pos.z, s.visualPitch, s.visualRoll]);
    } });
  return { metrics, pose };
}
const sd = (values) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length);
};

let worstAtt = 0, worstY = 0;
for (const [label, roofId, hull, x, z, yawDeg] of stands) {
  const { pose } = stand(roofId, hull, x, z, yawDeg);
  const tail = pose.filter((p) => p[0] >= 5);
  const pitchSd = sd(tail.map((p) => p[4])) * 1000, rollSd = sd(tail.map((p) => p[5])) * 1000, ySd = sd(tail.map((p) => p[2])) * 1000;
  const at = `a ${hull} at rest on a ${label} (${roofId}, x ${x}, heading ${yawDeg})`;
  assert.ok(pitchSd < 0.2 && rollSd < 0.2, `${at} holds its attitude (pitch ${pitchSd.toFixed(3)}, roll ${rollSd.toFixed(3)} mrad over 5 s)`);
  assert.ok(ySd < 0.2, `${at} holds its height (${ySd.toFixed(3)} mm)`);
  worstAtt = Math.max(worstAtt, pitchSd, rollSd);
  worstY = Math.max(worstY, ySd);
  // move-off: stood 4 s, then driven 1.5 s: it leaves its latch as it did before (it moves — up a 30-degree pitch it starts
  // slowly — with no pop and no throw)
  const off = stand(roofId, hull, x, z, yawDeg, { seconds: 5.5, driveFrom: 4 });
  const start = off.pose.find((p) => p[0] >= 4), end = off.pose[off.pose.length - 1];
  const moved = Math.hypot(end[1] - start[1], end[3] - start[3]);
  assert.ok(moved > 0.3, `${at}: driven, it moves off (${moved.toFixed(2)} m)`);
  assert.ok(off.metrics.popXZMaxM <= 0.12 && off.metrics.popYMaxM <= 0.12 && off.metrics.takeoffMaxMps <= 2.5,
    `${at}: moving off, no pop and no throw (${off.metrics.popXZMaxM.toFixed(3)} / ${off.metrics.popYMaxM.toFixed(3)} m, ${off.metrics.takeoffMaxMps.toFixed(2)} m/s)`);
}
// exact: the same stand twice ends on the same pose to the bit
const a = stand('parapet', 't90m', -6.2, 0, 0, { seconds: 6 }).pose.at(-1);
const b = stand('parapet', 't90m', -6.2, 0, 0, { seconds: 6 }).pose.at(-1);
assert.deepEqual(a, b, 'the same stand, the same pose');
console.log(`roof-rest.selftest: ${stands.length} hulls at rest on parapets, ridges, pitches and a shed hold within ${worstAtt.toFixed(3)} mrad and ${worstY.toFixed(3)} mm over 5 s; each moves off when driven; deterministic`);
