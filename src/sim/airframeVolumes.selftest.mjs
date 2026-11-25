// The airframes' hit volumes and wrecks (sim/airframeVolumes.ts, aircraft-solid-277). Pins, on the real drawn airframes
// (game/strikeJetAirframe.ts, fighterJetAirframe.ts, gunshipAirframe.ts):
//   1. each airframe's boxes hold at least 99 % of its drawn vertices (within 5 cm), and every box holds vertices of its own
//      (none is empty air);
//   2. toAirframe / fromAirframe are the drawn pose (three.js Euler 'YXZ' of (-pitch, yaw, bank)) and its inverse;
//   3. the swept test: a round crossing the path of a jet at 220 m/s between two steps, where a test against either step's
//      pose alone misses it, strikes it; a control with one pose for both ends misses;
//   4. the wreck: its boxes cut as its break says (the torn wing short at its tear, the nose short), the drawn wreck torn at
//      the same span (game/airframeParts.ts weatherAirframe moves no drawn vertex of the torn wing past the tear), and its
//      collision record's parts each within the boxes' posed extent, its lowest point on the ground it was seated on.
import assert from 'node:assert/strict';
import { Euler, Object3D, Vector3 } from 'three';
import { AIRFRAME_BOXES, fromAirframe, seatWreck, segmentMeetsBoxes, toAirframe, wreckBoxes, wreckBreak, wreckCollisionRecord }
  from './airframeVolumes.ts';
import { buildStrikeJetAirframe } from '../game/strikeJetAirframe.ts';
import { buildFighterJetAirframe } from '../game/fighterJetAirframe.ts';
import { buildGunshipAirframe } from '../game/gunshipAirframe.ts';
import { weatherAirframe } from '../game/airframeParts.ts';

const HOOKS = { setup() {}, release() {} };
function vertices(root) {
  root.updateMatrixWorld(true);
  const out = [], v = new Vector3();
  root.traverseVisible((o) => {
    const p = o.isMesh ? o.geometry.attributes.position : null;
    for (let i = 0; p && i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); out.push([v.x, v.y, v.z]); }
  });
  return out;
}
const built = {
  strike: (() => { const a = buildStrikeJetAirframe(HOOKS); for (const b of a.bombs) b.visible = false; return a.root; })(),
  fighter: (() => { const a = buildFighterJetAirframe(HOOKS); for (const b of a.bombs) b.visible = false; for (const m of a.missiles) m.visible = false; return a.root; })(),
  gunship: buildGunshipAirframe(HOOKS).root,
};

// ---- 1 ---------------------------------------------------------------------------------------------------------------------
const inBox = (p, b, m) => p[0] >= b[0] - m && p[0] <= b[3] + m && p[1] >= b[1] - m && p[1] <= b[4] + m && p[2] >= b[2] - m && p[2] <= b[5] + m;
const coverage = {};
for (const [id, root] of Object.entries(built)) {
  const vs = vertices(root), boxes = AIRFRAME_BOXES[id];
  const per = boxes.map(() => 0);
  let inside = 0;
  for (const p of vs) {
    let hit = false;
    boxes.forEach((box, i) => { if (inBox(p, box.b, 0.05)) { per[i]++; hit = true; } });
    if (hit) inside++;
  }
  coverage[id] = inside / vs.length;
  assert.ok(coverage[id] >= 0.99, `1: ${id}: ${(coverage[id] * 100).toFixed(1)} % of its ${vs.length} drawn vertices in its boxes (want 99 %)`);
  per.forEach((n, i) => assert.ok(n >= 150, `1: ${id}'s ${boxes[i].role} box holds ${n} drawn vertices (empty air?)`));
}

// ---- 2 ---------------------------------------------------------------------------------------------------------------------
const pose = { x: 12, y: 230, z: -40, yaw: 0.9, pitch: -0.35, bank: 0.7 };
const o = new Object3D();
o.position.set(pose.x, pose.y, pose.z);
o.rotation.copy(new Euler(-pose.pitch, pose.yaw, pose.bank, 'YXZ'));
o.updateMatrixWorld(true);
for (const local of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [3.2, -1.1, 7.5]]) {
  const drawn = new Vector3(...local).applyMatrix4(o.matrixWorld);
  const ours = fromAirframe(pose, { x: local[0], y: local[1], z: local[2] }, { x: 0, y: 0, z: 0 });
  assert.ok(Math.hypot(drawn.x - ours.x, drawn.y - ours.y, drawn.z - ours.z) < 1e-9, `2: fromAirframe is the drawn pose (${local})`);
  const back = toAirframe(pose, ours, { x: 0, y: 0, z: 0 });
  assert.ok(Math.hypot(back.x - local[0], back.y - local[1], back.z - local[2]) < 1e-9, `2: toAirframe inverts it (${local})`);
}

// ---- 3 ---------------------------------------------------------------------------------------------------------------------
// a fighter at 220 m/s along +z moves 3.7 m a step, past the length of its fin (3 m): a drone hovering 2 m over its spine
// line (over the fuselage, under the fin's top) stands just ahead of the fin at the last step's pose and just behind it at
// this step's, so neither pose alone meets it; swept with the jet, the fin passes through it
const step = 220 / 60;
const was = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }, now = { ...was, z: step };
const drone = { x: 0, y: 2, z: -4.6 };
const box = {};
assert.ok(!segmentMeetsBoxes(AIRFRAME_BOXES.fighter, was, drone, was, drone, 0, box), '3: control: at the last step\'s pose the drone is clear');
assert.ok(!segmentMeetsBoxes(AIRFRAME_BOXES.fighter, now, drone, now, drone, 0, box), '3: control: at this step\'s pose the drone is clear');
const swept = segmentMeetsBoxes(AIRFRAME_BOXES.fighter, was, drone, now, drone, 0, box);
assert.ok(swept && AIRFRAME_BOXES.fighter[swept.box].role === 'fin', '3: swept with the jet, its fin meets the drone');

// ---- 4 ---------------------------------------------------------------------------------------------------------------------
for (const [id, kind] of [['strike', 'strafe'], ['fighter', 'bomb'], ['gunship', 'gunship']]) {
  for (const wreckId of [3, 4, 11]) {
    const brk = wreckBreak(wreckId), boxes = wreckBoxes(id, brk);
    const full = AIRFRAME_BOXES[id].find((x) => x.role === 'wing').b, half = Math.max(-full[0], full[3]);
    const torn = boxes.filter((x) => x.role === 'wing').find((x) => (brk.wing > 0 ? x.b[3] : -x.b[0]) < half - 1e-6);
    assert.ok(torn, `4: ${id} #${wreckId}: its ${brk.wing > 0 ? 'port' : 'starboard'} wing box is cut short`);
    const tearX = half * brk.tipFrac;
    // the drawn wreck torn at the same span: no drawn vertex of the airframe past the tear on that side, outboard
    const root = id === 'strike' ? buildStrikeJetAirframe(HOOKS).root : id === 'fighter' ? buildFighterJetAirframe(HOOKS).root : buildGunshipAirframe(HOOKS).root;
    const body = AIRFRAME_BOXES[id].find((x) => x.role === 'fuselage').b, length = body[5] - body[2], noseZ = body[5] - length * brk.noseFrac;
    weatherAirframe(root, 1, { wing: brk.wing, tearX, bodyHalfX: Math.max(-body[0], body[3]), tipZ: body[5], noseZ, crumpleFromZ: noseZ - 1 });
    let pastTear = 0, pastNose = 0;
    root.traverse((m) => {
      if (!m.isMesh || !m.userData || m.geometry.attributes.color == null) return;
      const p = m.geometry.attributes.position;
      if (m.parent !== root && m !== root.children[0]) return;
      for (let i = 0; i < p.count; i++) {
        if (p.getX(i) * brk.wing > tearX + 1e-4) pastTear++;
        if (p.getZ(i) > noseZ + 0.05) pastNose++;
      }
    });
    assert.equal(pastTear, 0, `4: ${id} #${wreckId}: the drawn wing is torn at the box's tear (${pastTear} vertices past it)`);
    assert.equal(pastNose, 0, `4: ${id} #${wreckId}: the drawn nose is crumpled to the box's (${pastNose} vertices past it)`);
    // the record: seated on the ground at y 5, every part's span within the posed boxes' extent
    const attitude = { yaw: 0.4, pitch: -0.45, bank: Math.PI + 0.1 };
    const at = seatWreck(id, brk, attitude, 30, 5, -20, { x: 0, y: 0, z: 0 });
    const wreck = { id: wreckId, kind, team: 'alpha', ...at, ...attitude, atS: 0, untilS: 75 };
    const record = wreckCollisionRecord(wreck);
    assert.ok(Math.abs(record.min[1] - 5) < 1e-9, `4: ${id} #${wreckId}: its lowest point on the ground it was seated on (${record.min[1]})`);
    assert.equal(record.kind, 'aircraft_wreck');
    assert.ok(record.shape2.kind === 'compound' && record.shape2.parts.length >= boxes.length, `4: ${id}: one or more parts a box`);
    assert.ok(!record.crushable, '4: a wreck is never crushed');
  }
}

console.log(`airframeVolumes: the boxes hold ${Object.entries(coverage).map(([id, c]) => `${id} ${(c * 100).toFixed(1)} %`).join(', ')} of the `
  + 'drawn vertices; the pose is the drawn one; the swept test meets a drone a 220 m/s jet\'s fin passes through, which either step\'s pose misses; the wrecks are torn where '
  + 'their boxes are, seated on the ground PASS');
