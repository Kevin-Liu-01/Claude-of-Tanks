// A hull on its shell (physics stream F5, 2026-10-14; the coordinator: "when the hull's up vector is past about 70 degrees,
// the track springs shouldn't push, and contact should go through the hull shell's restitution and friction only. Prove
// it with a receipt that drops a hull on its side onto a gable"). Hulls dropped on their side onto a 52-degree gable (the
// Urban roof a hull on its side slid off and bounced 7-19 m/s from) and a 60-degree one, through the real network
// authority (tools/physics-torture.mjs runCase): after it first touches the roof a hull's centre never rises more than a
// shell's rebound over where it touched (its springs damped toward the support's rate under its own turn and lifted it a
// metre over the contact, and an inverted hull read the grade backwards and slid 6 m up a 60-degree roof), every
// rebound is the ruleset's restitution of the closing that made it, no flight gains energy, and the run is exact: the
// same drop twice ends on the same pose to the bit.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { appendStructureCollisionBand, deriveRuntimeStructureCollisionProfile, mergeStructureDecks } from '../src/world/structureCollision.ts';

await ensureAuthorityFleet(['t90m', 'bmp2']);

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A 20 x 16 m house under a gable of `deg` degrees, its ridge along x at z = 0 over 4 m eaves. */
function gable(deg) {
  const g = Math.tan(deg * Math.PI / 180), halfD = 8, eave = 4, ridge = eave + halfD * g, halfW = 10;
  const walls = [box(20, 4, 0.3, 0, 2, -halfD + 0.3), box(20, 4, 0.3, 0, 2, halfD - 0.3), box(0.3, 4, 16, -10, 2, 0), box(0.3, 4, 16, 10, 2, 0)];
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const s of [-1, 1]) {
    const top = s > 0 ? [[-halfW, eave, halfD], [halfW, eave, halfD], [halfW, ridge, 0], [-halfW, ridge, 0]]
      : [[halfW, eave, -halfD], [-halfW, eave, -halfD], [-halfW, ridge, 0], [halfW, ridge, 0]];
    const bot = top.map(([x, y, z]) => [x, y - 0.2, z]);
    quad(top[0], top[1], top[2], top[3]); quad(bot[3], bot[2], bot[1], bot[0]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[j], top[i], bot[i], bot[j]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const record = appendStructureCollisionBand([], deriveRuntimeStructureCollisionProfile({ walls, roof: [mergeVertices(geo)] }).contact, 0, 0, 0, 0);
  record.kind = 'structure';
  mergeStructureDecks([record]);
  return { record, g };
}

/** Drop `hull` on its side (roll), heading `yawDeg`, at z on the gable, clear of the roof by `drop` m. */
function sideDrop(roof, hull, z, yawDeg, roll, drop) {
  let contactY = null, peak = -Infinity, prevY = null, maxRide = 0, maxClosing = 0, prevV = 0;
  const caseDef = { id: 'side-drop', terrain: () => 0, obstacles: [roof.record], seconds: 6, rest: 'tail', allowBlocked: true,
    // (on its side the hull's root is half a width off its flank; clear of the roof under its whole length)
    spawn: { x: 0, z, yaw: yawDeg * Math.PI / 180, dropTo: 1.9 + drop + 3.8 * roof.g, roll },
    input: () => ({ throttle: 0, brake: true }) };
  const metrics = runCase(hull, 'earth', caseDef, { replay: false, trace: (tick, match) => {
    const s = match.entityById.get('subject').state;
    // the hull's centre, 0.9 m up its own up axis from the root
    const cy = s.pos.y + 0.9 * Math.cos(s.visualPitch) * Math.cos(s.visualRoll);
    if (s.grounded !== false && contactY === null) contactY = cy;
    if (contactY !== null) {
      peak = Math.max(peak, cy);
      maxRide = Math.max(maxRide, s._ride.v);
    }
    if (prevY !== null) maxClosing = Math.max(maxClosing, -prevV);
    prevY = cy;
    prevV = s._ride.v;
  } });
  return { metrics, rise: peak - contactY, maxRide, maxClosing };
}

const cases = [[-1.5, 0, Math.PI / 2, 0.6], [-3, 90, Math.PI / 2, 0.6], [-3, 0, -Math.PI / 2, 2], [-0.5, 90, Math.PI / 2, 1.5]];
let worstRise = 0, worstRide = 0, runs = 0;
for (const deg of [52, 60]) {
  const roof = gable(deg);
  for (const hull of ['t90m', 'bmp2']) {
    for (const [z, yawDeg, roll, drop] of cases) {
      const { metrics, rise, maxRide, maxClosing } = sideDrop(roof, hull, z, yawDeg, roll, drop);
      const at = `a ${hull} dropped on its ${roll > 0 ? 'right' : 'left'} side onto a ${deg}-degree gable (z ${z}, heading ${yawDeg})`;
      assert.ok(Number.isFinite(rise), `${at} lands on the roof`);
      // (a shell's rebound off a fall of a few metres: the ruleset's restitution, a fraction of a metre)
      assert.ok(rise < 0.3, `${at}: its centre never rises more than a rebound over where it touched (${rise.toFixed(2)} m)`);
      assert.ok(metrics.reboundExcessMps <= 0.05 && metrics.energyGainMaxJkg <= 0.2,
        `${at}: every rebound is the restitution of its closing, no flight gains energy (${metrics.reboundExcessMps.toFixed(2)} m/s, ${metrics.energyGainMaxJkg.toFixed(2)} J/kg)`);
      assert.ok(maxRide <= 0.5 * maxClosing + 0.2,
        `${at}: the shell is handed no upward speed its rebounds do not explain (${maxRide.toFixed(2)} m/s after closings up to ${maxClosing.toFixed(2)} m/s)`);
      worstRise = Math.max(worstRise, rise);
      worstRide = Math.max(worstRide, maxRide);
      runs++;
    }
  }
}
// exact: the same drop twice ends on the same pose to the bit
const roof = gable(52);
const a = sideDrop(roof, 't90m', -1.5, 0, Math.PI / 2, 0.6).metrics.final;
const b = sideDrop(roof, 't90m', -1.5, 0, Math.PI / 2, 0.6).metrics.final;
assert.deepEqual(a, b, 'the same drop, the same pose');
console.log(`shell-contact.selftest: ${runs} hulls dropped on their side onto 52- and 60-degree gables, none rising more than ${worstRise.toFixed(2)} m over where it touched or riding up faster than ${worstRide.toFixed(2)} m/s; rebounds by the restitution alone; deterministic`);
