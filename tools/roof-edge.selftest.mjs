// A hull at a roof's edge (physics stream F6, 2026-10-14; Urban's flat roof 6: a BMP-2 pivoting on a 7 m roof 11 m up
// swung one track over the edge, its centre of mass a metre inside it, and rolled toward the yard at 15 rad/s, was thrown
// 7 m/s off the roof and hung on its side against the edge for five seconds). Through the real network authority
// (tools/physics-torture.mjs runCase) over a 16 x 16 m flat roof 4 m up: a hull standing along the edge, square to it and
// across it at 45 degrees, its centre of mass inside the edge, a track over the yard, stands level on the roof; one
// driven over the edge at a crawl noses over and comes down on the ground; a hull pivoting by the edge until a track
// hangs over it turns on the roof. No hull rolls faster than gravity turns it, none is thrown up, and the run is exact.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { appendStructureCollisionBand, deriveRuntimeStructureCollisionProfile, mergeStructureDecks } from '../src/world/structureCollision.ts';

await ensureAuthorityFleet(['t90m', 'bmp2', 'm1a2']);

const ROOF_Y = 4, HALF = 8, EDGE_X = -HALF;
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function flatRoof() {
  const walls = [box(2 * HALF, ROOF_Y, 0.3, 0, ROOF_Y / 2, -HALF + 0.15), box(2 * HALF, ROOF_Y, 0.3, 0, ROOF_Y / 2, HALF - 0.15),
    box(0.3, ROOF_Y, 2 * HALF, -HALF + 0.15, ROOF_Y / 2, 0), box(0.3, ROOF_Y, 2 * HALF, HALF - 0.15, ROOF_Y / 2, 0)];
  const top = [[-HALF, ROOF_Y, -HALF], [HALF, ROOF_Y, -HALF], [HALF, ROOF_Y, HALF], [-HALF, ROOF_Y, HALF]];
  const bot = top.map(([x, y, z]) => [x, y - 0.2, z]);
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(top[3], top[2], top[1], top[0]); quad(bot[0], bot[1], bot[2], bot[3]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[i], top[j], bot[j], bot[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const record = appendStructureCollisionBand([], deriveRuntimeStructureCollisionProfile({ walls, roof: [mergeVertices(g)] }).contact, 0, 0, 0, 0);
  record.kind = 'structure';
  mergeStructureDecks([record]);
  return record;
}
const roof = flatRoof();

const DT = 1 / 60;
function run(hull, { x, z = 0, yawDeg, seconds = 6, input, dropTo = 0.12 }) {
  let maxRollRate = 0, maxPitchRate = 0, prev = null, maxTilt = 0, lastRoofS = 0;
  const pose = [];
  const metrics = runCase(hull, 'earth', { id: 'roof-edge', terrain: () => 0, obstacles: [roof], seconds, rest: 'tail',
    spawn: { x, z, yaw: yawDeg * Math.PI / 180, dropTo }, allowBlocked: true, metricsFromS: 0.5, input }, { replay: false,
    trace: (tick, match) => {
      const s = match.entityById.get('subject').state;
      if (prev && tick * DT >= 0.5) {
        maxRollRate = Math.max(maxRollRate, Math.abs(s.visualRoll - prev[0]) / DT);
        maxPitchRate = Math.max(maxPitchRate, Math.abs(s.visualPitch - prev[1]) / DT);
      }
      maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, Math.cos(s.visualPitch) * Math.cos(s.visualRoll))) * 180 / Math.PI);
      if (s.pos.y > ROOF_Y - 0.5) lastRoofS = tick * DT;
      prev = [s.visualRoll, s.visualPitch];
      pose.push([s.pos.x, s.pos.y, s.pos.z, s.visualPitch, s.visualRoll]);
    } });
  const end = pose.at(-1);
  // its last second: how far the root and the attitude still move (a hull at rest, not hanging on a jitter)
  let stillY = 0, stillAtt = 0;
  for (const p of pose.slice(-60)) {
    stillY = Math.max(stillY, Math.abs(p[1] - end[1]));
    stillAtt = Math.max(stillAtt, Math.abs(p[3] - end[3]), Math.abs(p[4] - end[4]));
  }
  return { metrics, maxRollRate, maxPitchRate, maxTilt, end, lastRoofS, stillY, stillAtt };
}
const brake = () => ({ throttle: 0, steer: 0, brake: true });
const fmt = (r) => `roll rate ${r.maxRollRate.toFixed(2)} rad/s, pitch rate ${r.maxPitchRate.toFixed(2)}, tilt ${r.maxTilt.toFixed(1)} deg, `
  + `takeoff ${r.metrics.takeoffMaxMps.toFixed(2)} m/s, pop ${r.metrics.popXZMaxM.toFixed(2)}/${r.metrics.popYMaxM.toFixed(2)} m, `
  + `end y ${r.end[1].toFixed(2)}, last second ${(r.stillY * 1000).toFixed(1)} mm / ${(r.stillAtt * 1000).toFixed(1)} mrad`;
/** Gravity turns a hull off an edge no faster than this (a hull a metre past a 4 m edge lands rolling 3-5 rad/s). */
const ROLL_RATE_MAX = 6;

let stood = 0, fell = 0, pivots = 0, worstRate = 0;
// [hull, heading (deg) against the edge, how far its centre of mass stands inside the edge (m)]
for (const [hull, yawDeg, inside] of [
  ['bmp2', 0, 0.5], ['bmp2', 0, 0.15], ['t90m', 0, 0.4], ['m1a2', 180, 0.3], ['t90m', 45, 0.4], ['bmp2', 135, 0.3],
]) {
  const r = run(hull, { x: EDGE_X + inside, yawDeg, input: brake });
  const at = `a ${hull} heading ${yawDeg} with its centre of mass ${inside} m inside the roof's edge`;
  assert.ok(r.maxRollRate < ROLL_RATE_MAX && r.maxPitchRate < ROLL_RATE_MAX, `${at} turns no faster than gravity turns it (${fmt(r)})`);
  assert.ok(r.metrics.takeoffMaxMps <= 2.5 && r.metrics.energyGainMaxJkg <= 0.2, `${at} is thrown up by nothing (${fmt(r)})`);
  assert.ok(r.maxTilt < 5 && r.end[1] > ROOF_Y - 0.2, `${at} stands level on the roof (${fmt(r)})`);
  assert.ok(r.metrics.popXZMaxM <= 0.12 && r.metrics.popYMaxM <= 0.12, `${at}: no pop (${fmt(r)})`);
  stood++;
  worstRate = Math.max(worstRate, r.maxRollRate, r.maxPitchRate);
}
// driven over the edge at a crawl, square to it and across it: the nose goes over when the centre of mass passes the
// edge, and the hull comes down on the ground
for (const [hull, yawDeg] of [['t90m', -90], ['bmp2', -90], ['m1a2', -60]]) {
  const r = run(hull, { x: EDGE_X + 4.5, yawDeg, seconds: 9, input: () => ({ throttle: 0.25, steer: 0, brake: false }) });
  const at = `a ${hull} driven over the roof's edge at a crawl (heading ${yawDeg})`;
  assert.ok(r.maxRollRate < ROLL_RATE_MAX && r.maxPitchRate < ROLL_RATE_MAX, `${at} turns no faster than gravity turns it (${fmt(r)})`);
  assert.ok(r.metrics.takeoffMaxMps <= 2.5 && r.metrics.energyGainMaxJkg <= 0.2, `${at} is thrown up by nothing (${fmt(r)})`);
  assert.ok(r.end[1] < 1.5, `${at} comes down on the ground (${fmt(r)})`);
  fell++;
  worstRate = Math.max(worstRate, r.maxRollRate, r.maxPitchRate);
}
// pivoting by the edge (the census's Urban site: 1.3 m inside it, square to it, turning 3.5 s): a track swings out over
// the edge and the hull turns on the roof
for (const [hull, steer] of [['bmp2', 1], ['bmp2', -1], ['t90m', 1], ['m1a2', -1]]) {
  const r = run(hull, { x: EDGE_X + 2.6, yawDeg: 81, seconds: 7, input: (t) => (t < 3.5 ? { throttle: 0, steer, brake: false } : brake()) });
  const at = `a ${hull} pivoting (${steer > 0 ? 'right' : 'left'}) 2.6 m inside the roof's edge`;
  assert.ok(r.maxRollRate < ROLL_RATE_MAX && r.maxPitchRate < ROLL_RATE_MAX, `${at} turns no faster than gravity turns it (${fmt(r)})`);
  assert.ok(r.metrics.takeoffMaxMps <= 2.5 && r.metrics.popXZMaxM <= 0.12 && r.metrics.popYMaxM <= 0.12 && r.metrics.energyGainMaxJkg <= 0.2,
    `${at}: no pop and no throw (${fmt(r)})`);
  // on the roof level, or off it on the ground: never hung on the edge
  assert.ok((r.end[1] > ROOF_Y - 0.2 && r.maxTilt < 5) || r.end[1] < 1.5, `${at} ends on the roof or on the ground (${fmt(r)})`);
  pivots++;
  worstRate = Math.max(worstRate, r.maxRollRate, r.maxPitchRate);
}
// exact: the same stand twice ends on the same pose to the bit
const a = run('bmp2', { x: EDGE_X + 0.15, yawDeg: 0, seconds: 3, input: brake }).end;
const b = run('bmp2', { x: EDGE_X + 0.15, yawDeg: 0, seconds: 3, input: brake }).end;
assert.deepEqual(a, b, 'the same stand, the same pose');
console.log(`roof-edge.selftest: ${stood} hulls with their centre of mass inside a roof's edge stand level on it, ${fell} driven over it come down on the ground, ${pivots} pivot by it on the roof; none turns faster than ${worstRate.toFixed(2)} rad/s or is thrown; deterministic`);
