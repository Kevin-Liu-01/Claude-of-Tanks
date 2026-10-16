// One barrel per real gun on every wreck, bent at its bend point (tank-opt 2026-10-15; the owner: "for destroyed tanks;
// fix the guns of the destroyed tanks that kind of spawn 2 barrels").
//
// The wreck bends its gun past a stress point (wreckDents.ts planBend). The live kill (tankFactoryCore.ts
// planLiveCrumple) and the map hulk's bake (wreckCrumple.ts) move the corners of the gun's meshes. A barrel tube built
// as one cylinder has corners only at its breech and muzzle rings: bent as it stood it drew as a straight chord from the
// unmoved breech to the kinked muzzle, 0.1-0.3 m off the kink, out through the thermal-sleeve sections, evacuator,
// collars and bands concentric with it, which follow the kink — two barrels. wreckDents.ts cutAtBend cuts the gun's
// triangles at the kink's planes before the bend, so the kink is exact.
//
// Held here on one id per gun construction (the whole fleet, every wreck mode, pop and two seeds:
// tools/wreck-barrel-census.mjs --all --gate), on the real visuals and the hulk bake's own per-mesh sequence
// (wreckBarrel.test-support.mjs):
//   - one seated muzzle per real gun, and no tube on a bore's outer half owned by a rig other than its muzzle's;
//   - after the kill, tubes concentric intact stay concentric along the whole run (poke <= POKE_M);
//   - every drawn cross-section of the gun's stock lies where the plan's kink puts it (kink <= KINK_M), with stock past
//     the kink: the gun still bends, at its bend point (the cure is not a straight barrel).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { preloadWreckTurretDriver } from './wreckTurretDriverLoader.ts';
import { TANK_SPECS } from './specs.ts';
import { bendGeometry, cutAtBend, planBend, wreckRandom } from './wreckDents.ts';
import { KINK_M, POKE_M, boreRings, measureWreckBarrels, triangleList, worstKink, worstPoke } from './wreckBarrel.test-support.mjs';

// ---- the mechanism on a buildGun-shaped tube ------------------------------------------------------------------------
{
  // a 120 mm tube as buildGun authors it: one-segment cylinders (the main tube 0.4 m to the muzzle, two sleeve
  // sections, an evacuator), all on one bore
  const cyl = (r, z0, z1) => new THREE.CylinderGeometry(r, r, z1 - z0, 24, 1).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
  const parts = [cyl(0.06, 0.4, 5.28), cyl(0.0732, 0.85, 2.44), cyl(0.0732, 2.76, 4.35), cyl(0.0972, 2.2, 2.6)];
  const bend = planBend(0, 5.3, wreckRandom(11), false);
  assert.ok(bend, 'a 5.3 m barrel bends');
  const identity = new THREE.Matrix4();
  const run = (cut) => parts.map((part, k) => {
    const g0 = cut ? cutAtBend(part, bend, identity) : part;
    const g = g0 === part ? part.clone() : g0;
    const I = Float32Array.from(g.attributes.position.array);
    bendGeometry(g, bend, identity, identity);
    for (let i = 0; i < g.attributes.normal.count; i++) {
      const l = Math.hypot(g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i));
      assert.ok(l > 0.99 && l < 1.01, 'unit normals through the cut and the bend');
    }
    return { I, W: g.attributes.position.array, tris: triangleList(g), name: `part${k}`, owner: 'gun' };
  });
  const uncutRings = boreRings(run(false), [0, 0], 0.06, 0.45, 5.25);
  const uncut = worstPoke(uncutRings), uncutKink = worstKink(uncutRings, bend);
  assert.ok(uncut.poke > 0.05, `the failure mode: an uncut one-segment tube leaves its sleeve (${uncut.poke.toFixed(3)} m)`);
  assert.ok(uncutKink.kink > 0.05, `the failure mode: the uncut tube is a chord off the kink (${uncutKink.kink.toFixed(3)} m)`);
  const cutRings = boreRings(run(true), [0, 0], 0.06, 0.45, 5.25);
  const cut = worstPoke(cutRings), cutKink = worstKink(cutRings, bend);
  assert.ok(cut.poke <= POKE_M, `cut at the kink's planes, the pieces stay one barrel (${cut.poke.toFixed(3)} m at ${cut.z})`);
  assert.ok(cutKink.kink <= KINK_M && cutKink.past > 0,
    `cut, the tube turns at its bend point (${cutKink.kink.toFixed(3)} m off at ${cutKink.z}, ${cutKink.past} sections past it)`);
  // the cut is a copy: the source keeps its triangles; every attribute and material group survives, interpolated along
  // the cut edges (a probe attribute linear in position stays that function of position at every new corner)
  const grouped = parts[0].clone();
  grouped.clearGroups(); grouped.addGroup(0, grouped.index.count - 72, 0); grouped.addGroup(grouped.index.count - 72, 72, 1);
  const gp = grouped.attributes.position, probe = new Float32Array(gp.count * 2);
  for (let i = 0; i < gp.count; i++) { probe[2 * i] = 2 * gp.getZ(i) + 1; probe[2 * i + 1] = gp.getX(i) - 3 * gp.getY(i); }
  grouped.setAttribute('probe', new THREE.BufferAttribute(probe, 2));
  const indexCount = grouped.index.count;
  const copy = cutAtBend(grouped, bend, identity);
  assert.notEqual(copy, grouped, 'a crossed geometry comes back as a copy');
  assert.equal(grouped.index.count, indexCount, 'the source is left as it was');
  assert.deepEqual(Object.keys(copy.attributes).sort(), Object.keys(grouped.attributes).sort(), 'every attribute kept');
  assert.equal(copy.groups.length, 2, 'material groups kept');
  assert.equal(copy.groups[1].start, copy.groups[0].count, 'groups contiguous after the cut');
  const cp = copy.attributes.position, cq = copy.attributes.probe;
  for (let i = 0; i < cp.count; i++) {
    assert.ok(Math.abs(cq.getX(i) - (2 * cp.getZ(i) + 1)) < 1e-4 && Math.abs(cq.getY(i) - (cp.getX(i) - 3 * cp.getY(i))) < 1e-4,
      'attributes interpolated along the cut edges');
  }
  for (let i = 0; i < cp.count; i += 3) {
    const zs = [0, 1, 2].map((k) => cp.getZ(i + k));
    const lo = Math.min(...zs), hi = Math.max(...zs);
    for (const plane of [bend.z0, bend.z0 + bend.ramp]) assert.ok(!(lo < plane - 1e-6 && hi > plane + 1e-6), 'no triangle spans a kink plane');
  }
  // a piece no kink plane crosses (a breech collar wholly behind it) needs no cut: it comes back as it is, indexed
  const collar = cyl(0.1, 0.0, 0.6);
  assert.equal(cutAtBend(collar, bend, identity), collar, 'an uncrossed geometry comes back itself');
}

// ---- the fleet sample: the real visuals ------------------------------------------------------------------------------
// One id per gun construction: M1A1 HC (custom tube, MRS collar), Leopard 2A4 (sleeve sections, dark bands), T-72B3M
// obr. 2022 (Soviet autoloader buildGun, evacuator), Challenger 2 (rifled, sleeve), Merkava Mk 4B (long mantlet sleeve
// on the gun rig), CV90 (IFV autocannon that bends), Leopard 2A6 (a measured source gun to its muzzle face, VH.04),
// T-72B3M Hetman (a donor fleet turret and its gun, nationalDonorTurrets.ts), BMPT (twin independent barrels, no bend),
// Strv 103B (casemate: the hull carries the gun). Each as the player's tank, plain, and as a desktop bot, popped, on two
// seeds; three as map hulks.
const LIVE = ['m1a1_abrams_hc', 'leo2a4', 't72b3m_2022', 'challenger2', 'merkava4b', 'cv90', 'leo2a6', 't72b3m_hetman',
  'bmpt_t90', 'strv103b'];
const BAKE = ['leo2a4', 't72b3m_2022', 'merkava4b'];
const BENDS = new Set(['m1a1_abrams_hc', 'leo2a4', 't72b3m_2022', 'challenger2', 'merkava4b', 'cv90', 'leo2a6', 't72b3m_hetman']);
for (const id of [...LIVE, ...BAKE]) assert.ok(TANK_SPECS[id], `${id}: a fleet id`);
await preloadWreckTurretDriver();
await ensureInteriorFills(LIVE);
let checked = 0;
const verdict = (res) => {
  const pose = `${res.id} (${res.mode}, pop ${res.pop}, seed ${res.seed})`;
  assert.equal(res.muzzles, res.realGuns, `${res.id}: one seated muzzle per real gun (${res.muzzles} for ${res.realGuns})`);
  assert.deepEqual(res.strays, [], `${res.id}: a tube on a bore owned by another rig stays behind when the gun moves`);
  for (const bore of res.bores) {
    assert.ok(!(bore.poke > POKE_M), `${pose}: the barrel splits in two at z ${bore.z}: `
      + `${bore.a} leaves ${bore.b} by ${bore.poke} m over ${bore.splitM} m of the run`);
    assert.ok(!(bore.kink > KINK_M), `${pose}: ${bore.kinkPiece} is drawn ${bore.kink} m off the kink at z ${bore.kinkZ}`);
  }
  if (BENDS.has(res.id)) {
    assert.ok(res.bend && res.bendM > 0.15, `${pose}: the barrel still bends (${res.bendM} m)`);
    assert.ok(res.bores.some((b) => b.owner === 'gun' && b.pastKink > 0), `${pose}: stock drawn past the kink`);
  }
  assert.ok(res.pass, `${pose}: one barrel, bent at its bend point`);
  checked++;
};
for (const id of LIVE) {
  verdict(measureWreckBarrels(createTank, TANK_SPECS[id], { mode: 'player', pop: false, seed: 1 }));
  verdict(measureWreckBarrels(createTank, TANK_SPECS[id], { mode: 'bot', pop: true, seed: 132 }));
}
for (const id of BAKE) verdict(measureWreckBarrels(createTank, TANK_SPECS[id], { mode: 'bake', pop: true, seed: 132 }));
console.log(`wreckGunSingleBarrel selftest: ${checked} wrecks, one barrel per gun, bent at its bend point`);
