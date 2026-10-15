// A hull set down on ground steeper than it can hold (physics streams F5 and F9, 2026-10-14). F5: Airfield's hangar vault —
// an Abrams set level on its 57-degree side read a rise of 1.54 a hull-local metre as a 90-degree plane, its springs
// snapped it 70 degrees nose-down at 12 rad/s past the vault, and on its shell it turned over and the shell's lift carried
// it 7 m up the hangar. F9 (the coordinator: "level hulls snapping onto 50-62 degree faces at 9-11 rad/s"): far from the
// plane it lies onto, a hull's springs turn it no faster than it would fall onto it (movement.ts limitPlaneTurn). Hulls set
// level on 50- and 57-degree faces of terrain and of a shed roof, facing down, up and across them, through the real network
// authority (tools/physics-torture.mjs runCase): each lies onto the face under 6 rad/s (the springs turned them at 9-11),
// never turns past it by more than 15 degrees, never turns over, and is never lifted more than 3 m over the face it lies on
// (a level hull's uphill end starts buried in the face: the root rises as it comes out); the run is exact. (A level hull
// set on a 62-degree face starts with its tail 4-7 m inside it, which no hull in play does; those cases are left out.)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { appendStructureCollisionBand, deriveRuntimeStructureCollisionProfile, mergeStructureDecks } from '../src/world/structureCollision.ts';

await ensureAuthorityFleet(['t90m', 'bmp2', 'm1a2']);

const DT = 1 / 60;
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A 24 x 24 m shed roof rising along +z at `deg` degrees from 4 m eaves. */
function shed(deg) {
  const g = Math.tan(deg * Math.PI / 180), half = 12, eave = 4, at = (z) => eave + (z + half) * g;
  const walls = [box(2 * half, eave, 0.3, 0, eave / 2, -half + 0.15), box(0.3, eave, 2 * half, -half + 0.15, eave / 2, 0),
    box(0.3, eave, 2 * half, half - 0.15, eave / 2, 0)];
  const top = [[-half, at(-half), -half], [half, at(-half), -half], [half, at(half), half], [-half, at(half), half]];
  const bot = top.map(([x, y, z]) => [x, y - 0.2, z]);
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(top[3], top[2], top[1], top[0]); quad(bot[0], bot[1], bot[2], bot[3]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[i], top[j], bot[j], bot[i]); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const record = appendStructureCollisionBand([], deriveRuntimeStructureCollisionProfile({ walls, roof: [mergeVertices(geo)] }).contact, 0, 0, 0, 0);
  record.kind = 'structure';
  mergeStructureDecks([record]);
  return { record, at };
}

function setDown(hull, deg, yawDeg, onRoof, seconds = 3) {
  const g = Math.tan(deg * Math.PI / 180);
  const roof = onRoof ? shed(deg) : null;
  const surface = roof ? (x, z) => roof.at(z) : (x, z) => g * z;
  let rate = 0, tilt = 0, over = 0, minUp = 1, prev = null;
  const metrics = runCase(hull, 'earth', { id: `steep-${deg}`, terrain: roof ? () => 0 : (x, z) => g * z, obstacles: roof ? [roof.record] : [],
    seconds, spawn: { x: 0, z: 0, yaw: yawDeg * Math.PI / 180, dropTo: 0.12 }, allowBlocked: true, rest: 'tail',
    input: () => ({ throttle: 0, brake: true }) }, { replay: false, trace: (tick, match) => {
    const s = match.entityById.get('subject').state;
    if (prev) rate = Math.max(rate, Math.hypot(s.visualPitch - prev[0], s.visualRoll - prev[1]) / DT);
    const up = Math.cos(s.visualPitch) * Math.cos(s.visualRoll);
    minUp = Math.min(minUp, up);
    tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, up))) * 180 / Math.PI);
    // (on the roof: its root over the face it lies on, while the hull is over the roof)
    if (!roof || (Math.abs(s.pos.x) < 10 && Math.abs(s.pos.z) < 10)) over = Math.max(over, s.pos.y - surface(s.pos.x, s.pos.z));
    prev = [s.visualPitch, s.visualRoll];
  } });
  return { rate, tilt, over, minUp, final: metrics.final };
}

let runs = 0, worstRate = 0, worstOver = 0;
for (const deg of [50, 57]) {
  for (const onRoof of [false, true]) {
    for (const [hull, yawDeg, facing] of [['m1a2', 180, 'down'], ['t90m', 0, 'up'], ['bmp2', 90, 'across']]) {
      const r = setDown(hull, deg, yawDeg, onRoof);
      const at = `a ${hull} set level facing ${facing} a ${deg}-degree ${onRoof ? 'roof' : 'slope'}`;
      assert.ok(r.rate < 6, `${at} lies onto it under 6 rad/s (${r.rate.toFixed(2)})`);
      assert.ok(r.tilt < deg + 15, `${at} turns no more than 15 degrees past it (${r.tilt.toFixed(1)} degrees)`);
      assert.ok(r.minUp > 0, `${at} never turns over (its up vector's height down to ${r.minUp.toFixed(2)})`);
      assert.ok(r.over < 3, `${at} is never lifted off the face (its root ${r.over.toFixed(2)} m over it)`);
      worstRate = Math.max(worstRate, r.rate);
      worstOver = Math.max(worstOver, r.over);
      runs++;
    }
  }
}
// exact: the same set-down twice ends on the same pose to the bit
assert.deepEqual(setDown('m1a2', 57, 180, true, 1.5).final, setDown('m1a2', 57, 180, true, 1.5).final, 'the same set-down, the same pose');
console.log(`steep-plane.selftest: ${runs} hulls set level on 50- and 57-degree slopes and roofs lie onto them under ${worstRate.toFixed(2)} rad/s, never past them by 15 degrees, never over, never lifted (${worstOver.toFixed(2)} m); deterministic`);
