// Real paddies (2026-10-12, item 4; the owner: "in some maps such as the jade river deltas spawn, we can see fake water. no
// more of that, we need real water"). A paddy is a level basin cut and filled into the ground, held by a bund, its water a
// square-ended canal a few centimetres under its rim: (1) the paddy's ground — the floor inside, the bund's crest over the
// higher floor between two terraces, the bank blending back to the ground; (2) square-ended water — the shelf and the
// wetness ramp in at the ends as at the sides; (3) Jade River Delta's ten paddies on the finished terrain — every bed level,
// wet from bund to bund at one level, the bund standing over the water, dry past it, off the roads and the deployments,
// each paddy's twin turned 180 degrees about the char; (4) the terrain's wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PADDY_BANK_M, PADDY_BUND_H, PADDY_BUND_M, PADDY_FREEBOARD_M, compilePaddies, inPaddy, levelPaddies, paddyCanals,
  resolvePaddyFloors } from './paddies.ts';
import { canalWetness, carveCanals, compileCanals } from './canals.ts';
import { createHeightField } from './terrain.ts';
import { shallowWaterGeometrySteps } from './shallowWater.ts';
import { getMapConfig } from './maps/index.ts';
import { deploymentFrame } from '../sim/deployment.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// ---- (1) the paddy's ground: two terraces side by side (x 0 and x 23.2, 20 x 30 m), floors 2 and 3 m
const two = compilePaddies([{ x: 0, z: 0, widthM: 20, lengthM: 30 }, { x: 20 + 2 * PADDY_BUND_M, z: 0, widthM: 20, lengthM: 30 }]);
assert.equal(levelPaddies(two, 0, 0, 7), 7, 'before its floors resolve a paddy builds nothing');
resolvePaddyFloors(two, (x) => (x < 11.6 ? 2 : 3));
assert.deepEqual([...two.floors], [2, 3], 'each floor is the median of the ground it covers');
assert.equal(levelPaddies(two, 3, 5, 9), 2, 'inside, the floor (a hummock cut)');
assert.equal(levelPaddies(two, -3, -5, -4), 2, 'inside, the floor (a hollow filled)');
near(levelPaddies(two, -10 - PADDY_BUND_M / 2, 0, -9), 2 + PADDY_BUND_H, 1e-9, "the bund's crest over the floor");
near(levelPaddies(two, 10 + PADDY_BUND_M, 0, 0), 3 + PADDY_BUND_H, 1e-9, 'between two terraces the bund stands over the higher floor');
near(levelPaddies(two, -10 - PADDY_BUND_M - PADDY_BANK_M / 2, 0, 6), 4, 1e-9, 'half way down the bank, half way back to the ground');
assert.equal(levelPaddies(two, -10 - PADDY_BUND_M - PADDY_BANK_M - 0.01, 0, 6), 6, 'past the bank, the ground');
assert.ok(inPaddy(two, -10 - PADDY_BUND_M / 2, 0) && !inPaddy(two, -10 - PADDY_BUND_M - 1, 0), 'vegetation keeps off the water and the bund');
assert.throws(() => compilePaddies([{ x: 0, z: 0, widthM: 1, lengthM: 30 }]), /width and a length/);

// ---- (2) square-ended water: the paddies' canals at each floor less the freeboard
const water = paddyCanals(two);
assert.equal(water.length, 2); assert.equal(water[0].ends, 'square');
near(water[1].level, 3 - PADDY_FREEBOARD_M, 1e-12, 'the water stands its freeboard under the floor');
const canals = compileCanals(water), depth = 0.6;
assert.equal(canalWetness(canals, 0, 13), 1, 'wet two metres inside an end');
assert.equal(canalWetness(canals, 0, 16.5), 0, 'dry past an end (no half circle of water beyond the bund)');
near(carveCanals(canals, 0, 14.6, 2, depth, 0), carveCanals(canals, 9.6, 0, 2, depth, 0), 1e-9, 'the shelf ramps in at the ends as at the sides');
near(carveCanals(canals, 0, 0, 2, depth, 0), 2 - PADDY_FREEBOARD_M - depth, 1e-9, 'the bed a water depth under the level');
assert.throws(() => compileCanals([{ path: [[0, 0], [1, 0], [2, 1]], widthM: 4, level: 0, ends: 'square' }]), /straight two-point path/);

// ---- (3) Jade River Delta on its finished terrain
const cfg = getMapConfig('delta');
const field = createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg);
const paddies = cfg.terrain.paddies;
assert.equal(paddies.length, 10, 'ten paddies');
const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
const placed = new Set(paddies.map((p) => key(p.x, p.z)));
for (const p of paddies) assert.ok(placed.has(key(-8 - p.x, 28 - p.z)), `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): its twin about the char`);
const frame = deploymentFrame(cfg.spawns);
const keepClear = [frame.anchors.alpha, frame.anchors.bravo, cfg.spawns.player, ...cfg.spawns.enemies];
let samples = 0;
for (const p of paddies) {
  const yaw = p.yawDeg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (a, b) => [p.x + s * a + c * b, p.z + c * a - s * b];
  const beds = [];
  for (let a = -p.lengthM / 2 + 2; a <= p.lengthM / 2 - 2; a += 2) for (let b = -p.widthM / 2 + 2; b <= p.widthM / 2 - 2; b += 2) {
    const [x, z] = at(a, b);
    beds.push(field.getHeightAt(x, z));
    assert.equal(field.getWaterMaskAt(x, z), 1, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): wet inside`);
    assert.ok(field._noVeg(x, z), 'no vegetation in the water');
    samples++;
  }
  const bed = beds[0];
  assert.ok(Math.max(...beds) - Math.min(...beds) < 1e-6, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): the bed is level`);
  const level = bed + field.getWaterDepthAt(...at(0, 0));
  for (const [a, b] of [[0, p.widthM / 2 + PADDY_BUND_M / 2], [0, -p.widthM / 2 - PADDY_BUND_M / 2], [p.lengthM / 2 + PADDY_BUND_M / 2, 0], [-p.lengthM / 2 - PADDY_BUND_M / 2, 0]]) {
    const [x, z] = at(a, b);
    assert.ok(field.getHeightAt(x, z) > level + 0.3, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): the bund stands over the water`);
  }
  // past the bund (on every side that faces no neighbouring terrace) the ground is dry
  const nearOther = (x, z) => paddies.some((q) => q !== p && Math.hypot(x - q.x, z - q.z) < Math.hypot(q.widthM, q.lengthM) / 2 + 3);
  let dry = 0;
  for (const [a, b] of [[0, p.widthM / 2 + PADDY_BUND_M + 1.5], [0, -p.widthM / 2 - PADDY_BUND_M - 1.5],
    [p.lengthM / 2 + PADDY_BUND_M + 1.5, 0], [-p.lengthM / 2 - PADDY_BUND_M - 1.5, 0]]) {
    const [x, z] = at(a, b);
    if (nearOther(x, z)) continue;
    assert.equal(field.getWaterMaskAt(x, z), 0, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): dry past the bund`);
    dry++;
  }
  assert.ok(dry >= 2, 'at least two open sides checked');
  for (let a = -p.lengthM / 2 - 12; a <= p.lengthM / 2 + 12; a += 4) for (const b of [-p.widthM / 2 - 12, p.widthM / 2 + 12]) {
    assert.ok(field._roadDist(...at(a, b)) >= 11, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): off the roads (a culvert would dry it)`);
  }
  for (const k of keepClear) assert.ok(Math.hypot(p.x - k.x, p.z - k.z) > 75, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): clear of the deployments`);
}

// ---- (3b) the water's surface: each paddy's own level grid (the sheet's eight-metre lattice keeps out), facing up
const steps = shallowWaterGeometrySteps(field);
let step = steps.next();
while (!step.done) step = steps.next();
const sheet = step.value, sheetPos = sheet.geometry.getAttribute('position'), sheetIdx = sheet.geometry.getIndex();
let downFacing = 0;
for (let i = 0; i < sheetIdx.count; i += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => sheetIdx.getX(i + k));
  const e1x = sheetPos.getX(b) - sheetPos.getX(a), e1z = sheetPos.getZ(b) - sheetPos.getZ(a);
  const e2x = sheetPos.getX(c) - sheetPos.getX(a), e2z = sheetPos.getZ(c) - sheetPos.getZ(a);
  if (e1z * e2x - e1x * e2z < 0) downFacing++;
}
assert.equal(downFacing, 0, 'every triangle of the sheet faces up (the paddies\' own grids too)');
for (const p of paddies) {
  const yaw = p.yawDeg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  for (let a = -p.lengthM / 2; a <= p.lengthM / 2; a += 2.5) for (let b = -p.widthM / 2; b <= p.widthM / 2; b += 2.5) {
    const x = p.x + s * a + c * b, z = p.z + c * a - s * b;
    near(sheet.heightAt(x, z), field.getPaddyWaterLevelAt(x, z), 1e-9, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}): the surface at the level`);
    if (Math.abs(a) < p.lengthM / 2 - 2 && Math.abs(b) < p.widthM / 2 - 2) {
      near(field.getPaddyWaterLevelAt(x, z), field.getHeightAt(x, z) + field.getWaterDepthAt(x, z), 1e-6, 'the level is the bed plus the water');
    }
  }
}

// ---- (4) the terrain's wiring
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /if \(compiledPaddies !== null && roadsOn && padsOn\) h = levelPaddies\(compiledPaddies, x, z, h\);\n\s*if \(compiledCanals !== null && roadsOn && padsOn\) \{/,
  'the paddies are levelled on final queries, just before the canals (their water) are carved');
assert.match(terrain, /resolvePaddyFloors\(compiledPaddies, \(x, z\) => heightAt\(x, z, true, true\)\);\n\s*compiledCanals = compileCanals\(\[\.\.\.\(T\.canals \?\? \[\]\), \.\.\.paddyCanals\(compiledPaddies\)\]\);/,
  'the floors resolve on the finished ground, then their water joins the canals');
console.log(`paddies.selftest: terraces, bunds and banks; square-ended water; Delta's ${paddies.length} paddies level, wet bund to bund and paired about the char (${samples} bed samples)`);
