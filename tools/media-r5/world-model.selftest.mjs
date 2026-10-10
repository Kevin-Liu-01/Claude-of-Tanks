import assert from 'node:assert/strict';
import { worldModel, sightBlockers, insideRecord } from './world-model.mjs';
import { hullOf, propProblems } from './route-check.mjs';
import { lensReport, absoluteShots, crushTimes } from './lens-check.mjs';

// A synthetic battlefield in the lab's dump format: a flat 200 m square (one hill), and on the hero's lane a fence
// (crushable), a stone wall (overrun 2.2 m/s), a bunker (999) beside it, a utility pole and a tree with its canopy.
const SIZE = 200, STEP = 4, N = SIZE / STEP + 1;
const heights = new Int16Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -SIZE / 2 + i * STEP, z = -SIZE / 2 + j * STEP;
  heights[j * N + i] = Math.round(Math.max(0, 12 - Math.hypot(x - 60, z + 60) * 0.5) * 10); // a 12 m cone at (60, -60)
}
const b64 = (a) => Buffer.from(a.buffer).toString('base64');
const features = {
  map: 'synthetic', size: SIZE,
  obstacles: [
    { k: 'fencerail', b: [-1, 0, 19.9, 1, 1.1, 20.1], c: 1.5 },
    { k: 'wallstone', b: [-1.5, 0, 39.7, 1.5, 1.15, 40.3], c: 2.2, s: ['o', 0, 40, 0.3, 1.5, Math.PI / 2] },
    { k: 'bunker', b: [6, 0, 30, 10, 2.4, 34], c: 999 },
    { k: 'lamp', b: [-6.2, 0, 49.8, -5.8, 7, 50.2], c: null },
    { k: 'tree', b: [-0.4, 0, 70, 0.4, 3, 70.8], c: 0, s: ['c', 0, 70.4, 0.4], t: 1, cr: 3.5 },
    { k: 'structure', b: [-20, 0, -5, -12, 9, 5] },
  ],
  // a utility pole beside the lane: no collision record, a presentation crushable (x, y, z, r, h, kind, dynamic)
  crushables: [[2.6, 0, 60, 0.45, 7.4, 'pole', 0]],
  grid: { step: STEP, n: N, origin: -SIZE / 2, heightDm: b64(heights), water255: b64(new Uint8Array(N * N)) },
};
const model = worldModel(features);
assert.ok(model && model.records.length === 7, 'the dump rebuilds every record and crushable');
const utilityPole = model.records[6];
assert.ok(utilityPole.presentation && utilityPole.crushable && utilityPole.crushMin === 1.2 && utilityPole.max[1] === 7.4, 'a pole comes back as a presentation crushable');
assert.equal(worldModel({ size: 100 }), null, 'a dump without obstacles has no model');
assert.ok(Math.abs(model.heightAt(0, 0)) < 1e-9 && model.heightAt(60, -60) > 11, 'heights come back from the grid');
assert.ok(model.slopeAt(70, -60) > 0.4 && model.slopeAt(0, 0) < 1e-9, 'the slope is the lab\'s, over ±3 m');
const wall = model.records[1], bunker = model.records[2];
assert.ok(model.crushes(wall, 9) && !model.crushes(wall, 2), 'a stone wall falls at 9 m/s, not at 2');
assert.ok(!model.crushes(bunker, 15), 'a bunker never falls');
assert.deepEqual(model.hullContacts(0, 40, 0, 3.6, 1.8).map((r) => r.kind), ['wallstone'], 'a hull on the wall meets it');
assert.deepEqual(model.hullContacts(4.5, 32, 0, 3.6, 1.8).map((r) => r.kind), ['bunker'], 'a hull beside the bunker meets it');

// Routes: the hero down the lane at 9 m/s crushes the fence, the wall and the tree; an ally beside it runs into the
// bunker; a parked foe stands in the structure.
const track = (x, z0, speed, durMs = 8000, facingDeg = 0) => Array.from({ length: 9 }, (_, k) => {
  const tMs = k * durMs / 8;
  return { tMs, pos: [x, z0 + speed * tMs / 1000], facingDeg, turretDeg: 0, gunDeg: 0, transition: 'linear' };
});
const scene = {
  map: 'synthetic',
  actors: [
    { name: 'hero', id: 'leo2a7v_x', pos: [0, 5], facingDeg: 0 },
    { name: 'ally1', id: 'k2_x', pos: [5, 0], facingDeg: 0 },
    { name: 'foe0', id: 't90m_x', pos: [-16, 0], facingDeg: 90 },
  ],
  storyboard: {
    durationMs: 8000, groundRel: true, groundSmooth: 0,
    // a tracking lens 7.5 m off the hero's flank, 3 m up, running with it (it passes 1.5 m behind the pole at 5 s)
    shots: [
      { id: 'a', tMs: 0, pos: [-7.5, 3, 5], lookAt: [0, 1.4, 5], fov: 40, transition: 'linear' },
      { id: 'b', tMs: 8000, pos: [-7.5, 3, 77], lookAt: [0, 1.4, 77], fov: 40, transition: 'linear' },
    ],
    actorTracks: [{ actor: 'hero', keys: track(0, 5, 9) }, { actor: 'ally1', keys: track(5, 0, 9) }],
  },
};
const problems = propProblems(scene, model);
assert.deepEqual(problems.map((p) => [p.actor, p.what]), [
  ['foe0', 'starts in a structure'],
  ['ally1', 'meets a bunker at 9.0 m/s, under its 999.0 m/s overrun'],
], 'the hero crushes its way through; the ally hits the bunker; the parked foe stands in a building');
// 1.8 m/s for 25 s: over the fence's 1.5 m/s overrun, under the stone wall's 2.2
const slow = {
  ...scene, actors: scene.actors.slice(0, 1),
  storyboard: { ...scene.storyboard, durationMs: 25000, actorTracks: [{ actor: 'hero', keys: track(0, 5, 1.8, 25000) }] },
};
assert.deepEqual(propProblems(slow, model).map((p) => p.what), ['meets a wallstone at 1.8 m/s, under its 2.2 m/s overrun'],
  'a crawling hull crushes the fence and stops on the stone wall');

// Sightlines: the pole between a low lens and the hero blocks; a lens high over it does not; a canopy hides what
// stands under it from above; the fence the hero is crushing never does; a lens inside a building is caught.
assert.ok(sightBlockers(model, [-12, 3, 50], [0, 1.4, 50]).some((r) => r.kind === 'lamp'), 'the pole blocks a lens behind it');
assert.equal(sightBlockers(model, [-12, 16, 50], [0, 1.4, 50]).length, 0, 'a lens high over the pole sees past it');
assert.ok(sightBlockers(model, [0, 30, 70.4], [0.5, 1.4, 70.9]).some((r) => r.canopyR), 'a canopy hides what stands under it from above');
assert.equal(sightBlockers(model, [-12, 3, 20], [0, 1.4, 21]).length, 0, 'the fence the hero is crushing is no blocker');
assert.equal(insideRecord(model, [-16, 4, 0])?.kind, 'structure', 'a lens inside a building is caught');
assert.equal(insideRecord(model, [-30, 4, 0]), null);

// The lens report over the take. The tracking lens passes 1.5 m behind the pole at 5 s: the pole fills the frame
// there and blocks that sample; lifted to 30 m the lens sees the hero all the way.
const low = lensReport(scene, model);
assert.ok(low.samples === 81 && low.blocked > 0 && low.blocked < 0.05, `a pole at the lens blocks a sliver of the take (${low.blocked.toFixed(3)})`);
assert.ok(low.worst.some((w) => /lamp/.test(w.by) && Math.abs(w.tMs - 5000) <= 100), `and names it, at 5 s (${JSON.stringify(low.worst)})`);
const lifted = (sc, y) => ({ ...sc, storyboard: { ...sc.storyboard, shots: sc.storyboard.shots.map((s) => ({ ...s, pos: [s.pos[0], y, s.pos[2]] })) } });
const highSeen = lensReport(lifted(scene, 30), model);
assert.equal(highSeen.blocked, 0, `a lens over the props sees the hero all the way (${JSON.stringify(highSeen.worst)})`);
// The tree on the lane: the hero fells it as its nose reaches the trunk (the Studio's own crush plan). A fixed lens
// over the tree loses a hero parked under the standing canopy, and keeps one that fells it and drives on under it.
// the hero's own contact rectangle (hull-dims.json): its nose reaches the trunk (0.4 m round at z 70.4) at centre
// z = 70 - halfLength, at 9 m/s from z = 5
const [heroHalfLength] = hullOf('leo2a7v_x'), noseAt = (70 - heroHalfLength - 5) / 9 * 1000;
const fall = [...crushTimes(scene, model)].find(([r]) => r.kind === 'tree')?.[1];
assert.ok(Math.abs(fall - noseAt) < 60, `the hero fells the tree as its nose reaches the trunk (${fall}, nose at ${noseAt.toFixed(0)})`);
const overTree = [
  { id: 'a', tMs: 0, pos: [-7.5, 12, 70.4], lookAt: [0, 1.4, 70.4], fov: 40, transition: 'linear' },
  { id: 'b', tMs: 8000, pos: [-7.5, 12, 70.4], lookAt: [0, 1.4, 70.4], fov: 40, transition: 'linear' },
];
const parked = { ...scene, actors: [{ name: 'hero', id: 'leo2a7v_x', pos: [0, 70.4], facingDeg: 0 }], storyboard: { ...scene.storyboard, shots: overTree, actorTracks: [] } };
assert.ok(lensReport(parked, model).blocked > 0.9, 'a hero parked under a standing canopy is hidden from above');
const driving = { ...scene, actors: scene.actors.slice(0, 1), storyboard: { ...scene.storyboard, shots: overTree, actorTracks: scene.storyboard.actorTracks.slice(0, 1) } };
const drivingSeen = lensReport(driving, model);
assert.ok(drivingSeen.blockedAt.length && drivingSeen.blockedAt.every((t) => t < fall),
  `the standing canopy hides the hero's approach, the felled one nothing (blocked at ${drivingSeen.blockedAt.join(', ')} ms)`);

// The pole beside the lane: the hero's pass topples it once its centre comes within the battle's reach (its half
// length + 0.5 m: z = 60 - sqrt(reach² - 2.6²)); standing, it hides the hero from a lens behind it; felled, never.
const reach = heroHalfLength + 0.5, reachAt = (60 - Math.sqrt(reach * reach - 2.6 * 2.6) - 5) / 9 * 1000;
const poleFall = crushTimes(scene, model).get(utilityPole);
assert.ok(Math.abs(poleFall - reachAt) < 20, `the hero topples the pole beside its lane (${poleFall}, reach at ${reachAt.toFixed(0)})`);
assert.ok(sightBlockers(model, [8, 3, 60], [0, 1.4, 60]).includes(utilityPole), 'a standing pole hides the hero from a lens behind it');
const behindPole = [
  { id: 'a', tMs: 0, pos: [8, 3, 60], lookAt: [0, 1.4, 60], fov: 40, transition: 'linear' },
  { id: 'b', tMs: 8000, pos: [8, 3, 60], lookAt: [0, 1.4, 60], fov: 40, transition: 'linear' },
];
const poleSeen = lensReport({ ...driving, storyboard: { ...driving.storyboard, shots: behindPole } }, model);
assert.ok(poleSeen.blockedAt.every((t) => t < poleFall), `the toppled pole hides nothing (blocked at ${poleSeen.blockedAt.join(', ')} ms)`);

// ground-relative keys sit on the smoothed ground as the lab seats them
const hill = { storyboard: { groundRel: true, groundSmooth: 0, shots: [{ tMs: 0, pos: [60, 2, -60], lookAt: [0, 1, 0] }] } };
assert.ok(Math.abs(absoluteShots(hill, model)[0].pos[1] - (model.heightAt(60, -60) + 2)) < 1e-6, 'a key on the hill rides its ground');

// The foreground (composition wave c3, 2026-10-08): low cover the sightlines leave out still crowds a low lens, and the
// shrubs a hull drives through (no record of their own) fill a lens beside them; a lens in a crown sees only leaves.
const fixedAt = (pos, look) => [
  { id: 'a', tMs: 0, pos, lookAt: look, fov: 40, transition: 'linear' },
  { id: 'b', tMs: 2000, pos, lookAt: look, fov: 40, transition: 'linear' },
];
const parkedAt = (x, z, shots, sc = scene) => ({ ...sc, actors: [{ name: 'hero', id: 'leo2a7v_x', pos: [x, z], facingDeg: 90 }],
  storyboard: { ...sc.storyboard, durationMs: 2000, shots, actorTracks: [] } });
const overFence = lensReport(parkedAt(0, 32, fixedAt([0, 1.0, 16.5], [0, 1.2, 32])), model).perSample[0].fore;
assert.ok(overFence.share > 0.01 && overFence.kind === 'fencerail', `a fence under a low lens crowds its frame (${JSON.stringify(overFence)})`);
const shrubbed = worldModel({ ...features, shrubs: [[-5, 0, 30, 1.6, 2.2, 0], [40, 0, -40, 1.2, 1.6, 1]] });
assert.equal(shrubbed.records.length, 7, 'shrubs are no records: a hull drives through them');
assert.deepEqual(shrubbed.queryShrubs(-6, 29, -4, 31).map((sh) => sh.kind), ['bush'], 'the shrubs come back on their grid');
assert.deepEqual(shrubbed.queryShrubs(30, -50, 50, -30).map((sh) => sh.kind), ['understorey']);
const besideBush = lensReport(parkedAt(0, 30, fixedAt([-9, 1.6, 30], [0, 1.2, 30]), scene), shrubbed).perSample[0].fore;
assert.ok(besideBush.share > 0.1 && besideBush.kind === 'bush', `a bush between the lens and the hull fills the frame (${JSON.stringify(besideBush)})`);
assert.equal(lensReport(parkedAt(0, 30, fixedAt([-9, 1.6, 30], [0, 1.2, 30]), scene), model).perSample[0].fore.share, 0, 'without the shrubs, nothing');
const inBush = lensReport(parkedAt(0, 30, fixedAt([-5, 1.2, 30], [0, 1.2, 30]), scene), shrubbed);
assert.ok(inBush.inside > 0.9, `a lens inside a crown is caught (${inBush.inside})`);
assert.equal(lensReport(parkedAt(0, 30, fixedAt([-5, 3.0, 30], [0, 1.2, 30]), scene), shrubbed).inside, 0, 'a lens over the crown is not');

// The gun's room (composition wave c3: barrels cut by the frame's edge): a broadside hull 15 m off keeps about a quarter
// of the frame ahead of its muzzle (the Leopard's reaches 7.1 m from its centre); 10 m off, the muzzle is past the edge.
const [, , leoReach] = hullOf('leo2a7v_x');
assert.ok(leoReach > 6.5 && leoReach < 7.5, `the muzzle's reach is the spec's overall length less half the hull (${leoReach})`);
const room15 = lensReport(parkedAt(0, 30, fixedAt([0, 1.6, 15], [0, 1.2, 30])), model).perSample[0];
assert.ok(room15.gunRoom > 0.15 && room15.gunRoom < 0.4 && room15.muzzle[0] < 0, `from 15 m the muzzle points left with room ahead (${JSON.stringify([room15.muzzle, room15.gunRoom])})`);
const room10 = lensReport(parkedAt(0, 30, fixedAt([0, 1.6, 20], [0, 1.2, 30])), model).perSample[0];
assert.ok(room10.gunRoom < 0, `from 10 m the muzzle is past the edge (${room10.gunRoom})`);
assert.equal(room15.sliced, 0, 'no escort, none sliced');
// A merger (composition waves c2-c3: poles "rising straight out of the turret"): the 7 m lamp at (-6, 50) stands 10 m
// behind a hull parked at (-6, 40); seen down that line it rises out of the turret, seen from 8 m aside it does not.
const inLine = lensReport(parkedAt(-6, 40, fixedAt([-6, 1.6, 26], [-6, 1.4, 40])), model).perSample[0];
assert.ok(inLine.merger === 1 && inLine.mergerKind === 'lamp', `the lamp behind the turret merges with it (${JSON.stringify([inLine.merger, inLine.mergerKind])})`);
assert.equal(lensReport(parkedAt(-6, 40, fixedAt([2, 1.6, 26], [-6, 1.4, 40])), model).perSample[0].merger, 0, 'seen from aside it stands clear');

// A hull on a bridge stands on its deck (2026-10-08: the cliffbridge viaduct's hero was placed on the gorge floor): over
// the deck's footprint a deck top 3 m over the ground is the support, beside it the ground is.
const bridged = worldModel({ ...features, obstacles: [...features.obstacles, { k: 'bridge', b: [-3, -30, 80, 3, 3, 95] }] });
assert.equal(bridged.supportAt(0, 85), 3, 'on the deck');
assert.ok(Math.abs(bridged.supportAt(8, 85)) < 1e-9, 'beside it, the ground');

console.log('world-model.selftest: pass');
