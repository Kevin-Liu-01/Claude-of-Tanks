// rubbleBodies.selftest.mjs — a building's larger falling pieces are bodies of the game's one physics engine (destruction
// stream, 2026-10-12; the owner: "make the physics for stuff falling around and pieces of buildings and destruction use
// the same kind of physics engine ... natural, grounded physics with no snappiness" and "rubble properly falls down onto
// ground that can potentially be uneven ... instead of ... end up on a flat 2d plane").
//
// Pins: a body comes to rest ON the ground under it (a slope, a step down off a heap's plateau), asleep; the same throw
// lies the same way twice (deterministic, presentation-only); a building's own records let its pieces leave it while the
// neighbours' stay solid; the pool's budget is a hard cap (a full pool of moving bodies refuses, so the stage keeps the
// piece in the program); a delayed body is not drawn before its release; a settled body the pool lets go of stays drawn
// where it lies; the stages' writer sends a stage's larger pieces to bodies up to the stage's budget and no further.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRubbleBodies } from './rubbleBodies.ts';
import { createStructureDebris } from './structureDebris.ts';

let now = 0;
const tick = (bodies, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { now += 1 / 60; bodies.update(); } };
const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
const instancePose = (bodies, i = 0) => {
  const mesh = bodies.group.children.find((c) => c.isInstancedMesh && c.count > i);
  mesh.getMatrixAt(i, m4);
  m4.decompose(p, q, s);
  return { p: p.clone(), q: q.clone(), s: s.clone(), mesh };
};
/** The lowest point of a box of full extents (lx, ly, lz) at the pose (centre p, rotation q). */
const lowest = (pose, lx, ly, lz) => {
  let low = Infinity;
  const v = new THREE.Vector3();
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    v.set(a * lx / 2, b * ly / 2, c * lz / 2).applyQuaternion(pose.q).add(pose.p);
    low = Math.min(low, v.y);
  }
  return low;
};

// a block (palette 'block' is 1 x 0.6 x 0.7 a unit): thrown at scale 0.5 its box is 0.5 x 0.3 x 0.35
const BLOCK = [0.5, 0.3, 0.35];

// ---- on a slope: it comes to rest on the slope, asleep
{
  now = 0;
  const ground = (x, z) => 0.25 * x + 0.1 * z;
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: ground }), materialFor: () => null, capacity: 8 });
  assert.ok(bodies.throw('stone', 'block', 0, 4, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 1.5, 1, 0.4, 2, 1, 0, 0.6, 0.5, 0.4, 0));
  tick(bodies, 8);
  assert.equal(bodies.stats().awake, 0, 'it came to rest');
  const pose = instancePose(bodies);
  const low = lowest(pose, ...BLOCK);
  const g = ground(pose.p.x, pose.p.z);
  assert.ok(Math.abs(low - g) < 0.2, `on the slope under it (lowest ${low.toFixed(3)} vs ground ${g.toFixed(3)})`);
}

// ---- off a heap's plateau: thrown outward from 2 m up, it lies on the street below, never at the plateau's height
{
  now = 0;
  const ground = (x) => (x < 2 ? 2 : 0);
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: ground }), materialFor: () => null, capacity: 8 });
  bodies.throw('stone', 'block', 1.6, 2.5, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 3, 0.5, 0, 0, 0, 2, 1, 1, 1, 0);
  tick(bodies, 8);
  const pose = instancePose(bodies);
  assert.ok(pose.p.x > 2.1, `it carried off the plateau (x ${pose.p.x.toFixed(2)})`);
  assert.ok(lowest(pose, ...BLOCK) < 0.2, 'and lies on the street');
}

// ---- deterministic: the same throws lie the same way twice
function pile() {
  now = 0;
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: (x, z) => 0.05 * x - 0.03 * z }), materialFor: () => null, capacity: 16 });
  for (let k = 0; k < 10; k++) {
    bodies.throw('stone', k % 3 ? 'block' : 'beam', (k % 4) * 0.4, 3 + (k % 3) * 0.5, (k % 5) * 0.3, 0.1 * (k % 2), 0, 0, 1,
      0.5 + 0.05 * k, 0.5, 0.5, (k % 3) - 1, 1, (k % 2) - 0.5, k % 3, 1, 0.5, 1, 1, 1, 0.05 * (k % 3));
  }
  tick(bodies, 6);
  const out = [];
  for (const mesh of bodies.group.children) {
    if (!mesh.isInstancedMesh) continue;
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); out.push(m4.elements.map((v) => Math.round(v * 1e5))); }
  }
  return out;
}
{
  const a = pile();
  assert.ok(a.length === 10, 'ten bodies drawn');
  assert.deepEqual(pile(), a, 'the same throws lie the same way twice');
}

// ---- a building's own records let its pieces leave it; a neighbour's wall stays solid
{
  now = 0;
  const own = { min: [-1, 0, -1], max: [1, 6, 1], structureIdx: 4 };
  const neighbour = { min: [3, 0, -3], max: [3.6, 6, 3], structureIdx: 9 };
  const env = { groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => {
    out.length = 0;
    for (const r of [own, neighbour]) if (r.max[0] >= minX && r.min[0] <= maxX && r.max[2] >= minZ && r.min[2] <= maxZ) out.push(r);
    return out;
  } };
  const bodies = createRubbleBodies({ now: () => now, environment: () => env, materialFor: () => null, capacity: 8 });
  // born inside its own wall, thrown toward the neighbour
  bodies.throw('stone', 'block', 0.6, 3, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 4, 1, 0, 0, 0, 0, 1, 1, 1, 0, 4);
  tick(bodies, 6);
  const pose = instancePose(bodies);
  assert.ok(pose.p.x < 3.05 && pose.p.x > 1, `it left its own wall and stopped at the neighbour's (x ${pose.p.x.toFixed(2)})`);
  assert.ok(Math.abs(pose.p.z) < 1.5 && pose.p.y < 1, 'and lies at its foot, not thrown away');
}

// ---- the budget is a hard cap; a delayed body is hidden until its release; a settled one let go of stays where it lies
{
  now = 0;
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: () => 0 }), materialFor: () => null, capacity: 3 });
  for (let k = 0; k < 3; k++) assert.ok(bodies.throw('stone', 'block', k, 5, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, -1, 0, 0, 0, 0, 1, 1, 1, 0));
  assert.equal(bodies.throw('stone', 'block', 4, 5, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, -1, 0, 0, 0, 0, 1, 1, 1, 0), false,
    'a full pool of moving bodies refuses (the piece stays in the program)');
  tick(bodies, 6);
  assert.equal(bodies.stats().awake, 0);
  const before = instancePose(bodies, 0);
  // a delayed one: the pool lets the oldest sleeper go for it, which stays drawn where it lay
  assert.ok(bodies.throw('stone', 'block', 6, 5, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, -1, 0, 0, 0, 0, 1, 1, 1, 1.5));
  tick(bodies, 0.5);
  const hidden = instancePose(bodies, 3);
  assert.ok(Math.abs(hidden.mesh.instanceMatrix.array[3 * 16]) < 1e-9 && Math.abs(hidden.mesh.instanceMatrix.array[3 * 16 + 5]) < 1e-9, 'a delayed body is not drawn before its release');
  tick(bodies, 6);
  assert.ok(instancePose(bodies, 3).s.lengthSq() > 0.1, 'drawn once released');
  const after = instancePose(bodies, 0);
  assert.ok(after.p.distanceTo(before.p) < 1e-6, 'a settled body the pool let go of stays drawn where it lies');
  assert.ok(bodies.stats().settled >= 1, 'counted settled');
  bodies.reset();
  assert.equal(bodies.stats().live, 0);
}

// ---- the stages' writer: a stage's larger pieces go to bodies up to its budget; the small ones and the rest stay pieces
{
  now = 0;
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: () => 0 }), materialFor: () => null, capacity: 16 });
  const debris = createStructureDebris({ now: () => now, groundY: () => 0, poolCapacity: 64, pieceCap: 128, bodies });
  const w = debris.begin({ x: 0, y: 0, z: 0, yaw: 0.3 }, () => new THREE.MeshStandardMaterial(), 0, false, { tag: 32768 + 2, bodies: 3, structure: 1 });
  let thrown = 0;
  for (let k = 0; k < 6; k++) if (w.pieces.push('stone', 'block', 0, k * 0.5, 3, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 0)) thrown++;
  for (let k = 0; k < 4; k++) if (w.pieces.push('glass', 'shard', 0, k * 0.5, 3, 0, 0, 0, 0, 1, 0.1, 0.1, 0.1, 1, 1, 1, 1, 1, 0)) thrown++;
  debris.commit();
  assert.equal(thrown, 10, 'every piece was taken');
  // (2026-10-13, the collapse frame's bar) the bodies go to the engine in the updates after the stage, a few an update
  assert.equal(bodies.stats().live, 0, 'none thrown in the stage\'s own frame');
  debris.update();
  assert.equal(bodies.stats().live, 3, 'three larger pieces fell as bodies (the stage\'s budget)');
  assert.equal(debris.stats().pieces, 7, 'the rest — three blocks past the budget, four shards — stayed pieces');
  // a settled stage throws nothing at all
  const z = debris.begin({ x: 0, y: 0, z: 0, yaw: 0 }, () => null, 0, true, { tag: 32768 + 2, bodies: 3 });
  assert.equal(z.pieces.push('stone', 'block', 0, 0, 3, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 0), false);
  debris.commit();
  debris.update();
  assert.equal(bodies.stats().live, 3);
  // a collapse's fourteen: four an update, the lowest of the soonest released first; one the engine refuses is a piece
  {
    now = 0;
    const small = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: () => 0 }), materialFor: () => null, capacity: 6 });
    const d = createStructureDebris({ now: () => now, groundY: () => 0, poolCapacity: 64, pieceCap: 128, bodies: small });
    const c = d.begin({ x: 0, y: 0, z: 0, yaw: 0 }, () => new THREE.MeshStandardMaterial(), 0, false, { bodies: 14, structure: 3 });
    for (let k = 0; k < 14; k++) c.pieces.push('stone', 'block', 0, k * 0.6, 2 + (13 - k) * 0.4, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 0);
    d.commit();
    const piecesBefore = d.stats().pieces;
    const live = [];
    for (let u = 0; u < 5; u++) { d.update(); live.push(small.stats().live); now += 1 / 60; }
    assert.deepEqual(live.slice(0, 2), [4, 6], `four an update until the engine is full (${live})`);
    assert.ok(d.stats().pieces - piecesBefore === 8, `the eight it refused are pieces (${d.stats().pieces - piecesBefore})`);
  }
}

console.log('rubbleBodies selftest: rest on slopes and below a plateau, deterministic, own walls let go and neighbours solid, budget, delayed release, settled instances, stage budgets — ok');
