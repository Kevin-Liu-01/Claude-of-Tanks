// Receipt for terrain.canals (the map-revival lane, 2026-10-07, Tidegate Polders step 5; canals.ts): the shared, opt-in
// linear water primitive. (1) The profile: a canal's bed one water depth under its level across the channel, the shelf
// up to the waterline, the banks rising at the profile's slope until they meet the ground, never raised; a road keeps its
// ground over it. (2) Every map that lists no canal builds the same terrain to the bit as the terrain before the
// primitive: the canal lines are taken back out of terrain.ts's own source and both builds are compared map by map
// (heights, the water mask, the ground type and the vegetation exclusion on a grid). (3) Polders' canals: their water at
// their level, wet bank to bank off the roads, each meeting no basin or one at its own level (the five leveled basins).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { compileCanals, carveCanals, canalWetness, inCanal } = await import('./canals.ts');
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');

// ---- (1) the profile
assert.equal(compileCanals(undefined), null, 'no canals: nothing compiled');
assert.equal(compileCanals([]), null, 'an empty list: nothing compiled');
const one = compileCanals([{ path: [[0, 0], [100, 0]], widthM: 10, level: 2, profile: 'bank', shelfM: 1 }]);
const depth = 0.5, slope = 1 / 2.5;
assert.equal(carveCanals(one, 50, 0, 9, depth, 0), 2 - depth, 'the bed at the centre: one water depth under the level');
assert.equal(carveCanals(one, 50, 3.9, 9, depth, 0), 2 - depth, 'the bed out to the shelf');
assert.ok(Math.abs(carveCanals(one, 50, 4.5, 9, depth, 0) - (2 - depth / 2)) < 1e-9, 'the shelf rises to the waterline');
assert.ok(Math.abs(carveCanals(one, 50, 5, 9, depth, 0) - 2) < 1e-9, 'the waterline at the half-width');
assert.ok(Math.abs(carveCanals(one, 50, 7.5, 9, depth, 0) - (2 + 2.5 * slope)) < 1e-9, 'the bank rises at its slope');
assert.equal(carveCanals(one, 50, 7.5, 2.5, depth, 0), 2.5, 'the bank meets the ground: never raised');
assert.equal(carveCanals(one, 50, 0, 9, depth, 1), 9, 'a road keeps its ground over the canal');
assert.ok(Math.abs(carveCanals(one, 50, 0, 9, depth, 0.5) - (9 + (1.5 - 9) * 0.5)) < 1e-9, 'the culvert blends the carve');
assert.equal(carveCanals(one, 50, 40, 9, depth, 0), 9, 'past its reach the ground is untouched');
assert.equal(canalWetness(one, 50, 0), 1, 'wet at the centre');
assert.equal(canalWetness(one, 50, 7), 0, 'dry past the waterline');
assert.ok(inCanal(one, 50, 6) && !inCanal(one, 50, 8), 'the vegetation keeps off the water and the banks\' foot');
assert.throws(() => compileCanals([{ path: [[0, 0]], widthM: 4, level: 0 }]), /two points/, 'a canal needs a path');

// ---- (2) every map without canals: the same terrain as before the primitive, to the bit
const terrainURL = new URL('./terrain.ts', import.meta.url);
let source = readFileSync(terrainURL, 'utf8');
const take = (inserted, original = '') => {
  assert.equal(source.split(inserted).length, 2, `the canal lines stand once in terrain.ts: ${inserted.slice(0, 60)}`);
  source = source.replace(inserted, original);
};
take("import { canalWetness, carveCanals, compileCanals, inCanal, type CanalConfig } from './canals.ts';\n");
take(source.slice(source.indexOf('  /**\n   * The map-revival lane (2026-10-07, Tidegate Polders step 5; canals.ts)'),
  source.indexOf('  canals?: readonly CanalConfig[];\n') + '  canals?: readonly CanalConfig[];\n'.length));
take("  // (the map-revival lane, 2026-10-07) the canals, compiled once; null on every map without one\n  const compiledCanals = compileCanals(T.canals);\n");
take(source.slice(source.indexOf('    // (the map-revival lane, 2026-10-07) the canals carved to their profiles'),
  source.indexOf('    // the built mounds stand last, over every constraint above (final queries only)')));
take(source.slice(source.indexOf("    // (the map-revival lane, 2026-10-07) a canal's water, bank to bank, up to a road's culvert"),
  source.indexOf('    if (wetness <= 0) return canalWet;')));
take('    if (wetness <= 0) return canalWet;\n    // Surface heights deliberately yield', '    if (wetness <= 0) return 0;\n    // Surface heights deliberately yield');
take('    if (wetness <= 0) return canalWet;\n    for (const pad of padPts) {', '    if (wetness <= 0) return 0;\n    for (const pad of padPts) {');
take('    return canalWet > wetness ? canalWet : wetness;\n  }', '    return wetness;\n  }');
take("    if (compiledCanals !== null && inCanal(compiledCanals, x, z)) return true; // the map-revival lane: a canal and its banks' foot\n");
take("    // (the map-revival lane, 2026-10-07) a canal's water drives as a soft lake's\n    if (compiledCanals !== null && canalWetness(compiledCanals, x, z) > 0.5) return T.softLakes ? 'soft' : 'hard';\n");
assert.ok(!source.includes('compiledCanals') && !source.includes("from './canals.ts'"), 'the reconstruction holds no canal line');
const beforeURL = new URL('./terrain.ts?before-canals', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  if (url === beforeURL) return { format: 'module-typescript', shortCircuit: true, source };
  return next(url, context);
} });
let before;
try { before = (await import(beforeURL)).createHeightField; } finally { hooks.deregister(); }
const digest = (field) => {
  const h = createHash('sha256');
  const buf = new Float64Array(4);
  for (let z = -500; z <= 500; z += 12.5) for (let x = -500; x <= 500; x += 12.5) {
    buf[0] = field.getHeightAt(x, z); buf[1] = field.getWaterMaskAt(x, z);
    buf[2] = ['hard', 'medium', 'soft'].indexOf(field.getGroundType(x, z)); buf[3] = field._noVeg(x, z) ? 1 : 0;
    h.update(Buffer.from(buf.buffer));
  }
  return h.digest('hex').slice(0, 16);
};
const unset = MAP_IDS.filter((id) => !getMapConfig(id).terrain?.canals?.length);
for (const id of unset) {
  const cfg = getMapConfig(id);
  assert.equal(digest(createHeightField(1337, cfg)), digest(before(1337, cfg)), `${id}: no canal, the same terrain to the bit`);
}

// ---- (3) Polders' canals
const polders = getMapConfig('polders');
const canals = polders.terrain.canals ?? [];
assert.ok(canals.length >= 3, 'Polders lays its vaart and two weteringen');
const field = createHeightField(1337, polders);
const lakes = polders.terrain.lakes;
for (const c of canals) {
  // its water at its level along its length, off the roads' culverts: the sheet lies on the bed one water depth under it
  let wetSamples = 0;
  for (let i = 1; i < c.path.length; i++) {
    const [x0, z0] = c.path[i - 1], [x1, z1] = c.path[i], len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 2; s < len - 2; s += 3) {
      const x = x0 + (x1 - x0) * s / len, z = z0 + (z1 - z0) * s / len;
      if (field._roadDist(x, z) < 11) continue;
      const wet = field.getWaterMaskAt(x, z);
      assert.ok(wet > 0.99, `${c.name}: wet at ${x.toFixed(1)},${z.toFixed(1)} (${wet.toFixed(2)})`);
      const surface = field.getHeightAt(x, z) + field.getWaterDepthAt(x, z);
      assert.ok(Math.abs(surface - c.level) < 0.02, `${c.name}: the water at its level at ${x.toFixed(1)},${z.toFixed(1)} (${surface.toFixed(3)} vs ${c.level})`);
      wetSamples++;
    }
  }
  assert.ok(wetSamples >= 10, `${c.name}: water along its length (${wetSamples} samples)`);
  // the five leveled basins: a canal that meets a basin takes its level
  for (const lake of lakes) {
    const touches = c.path.some(([x, z]) => Math.hypot(x - lake.x, z - lake.z) < lake.r + c.widthM);
    if (touches) assert.ok(Math.abs((lake.level ?? NaN) - c.level) < 1e-9, `${c.name}: meets the basin at ${lake.x},${lake.z} at its level`);
  }
}
console.log(`canals.selftest: the profile; ${unset.length} maps without canals identical to the terrain before the primitive; Polders' ${canals.length} canals at their levels PASS`);
