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
// (2026-10-12, item 4) the paddies ride on the canals (their water is square-ended canals): they come out with them
take("import { compilePaddies, inPaddy, inPaddyClearing, levelPaddies, paddyCanals, paddyRiceAt, paddyWaterLevelAt, paddyWaterQuads,\n"
  + "  resolvePaddyFloors, PADDY_DEPTH_M, type PaddyConfig, type PaddyRiceSeat, type PaddyWaterQuad } from './paddies.ts';\n");
// (2026-10-15, the paddies' look pass) the trees' clearing, the rice and the paddy's own depth
take(source.slice(source.indexOf("  /** (2026-10-15, the paddies' look pass) Trees and shrubs keep off a paddy's water, bund and bank (paddies.ts"),
  source.indexOf('  _paddyRiceAt?(x: number, z: number, out: PaddyRiceSeat): PaddyRiceSeat | null;\n') + '  _paddyRiceAt?(x: number, z: number, out: PaddyRiceSeat): PaddyRiceSeat | null;\n'.length));
take(source.slice(source.indexOf("    // (the paddies' look pass) a paddy's water stands its own quarter metre, not the map's river depth"),
  source.indexOf('    return liquidDepthM ? shallowWaterDepth(getWaterMaskAt(x, z), liquidDepthM) : 0;\n  }\n\n  /** Round 47')));
take(source.slice(source.indexOf("    ...(compiledPaddies !== null ? { _treeClearAt: (x: number, z: number): boolean => inPaddyClearing(compiledPaddies, x, z),"),
  source.indexOf("paddyRiceAt(compiledPaddies, x, z, out) } : {}),\n") + "paddyRiceAt(compiledPaddies, x, z, out) } : {}),\n".length));
take("  /** (2026-10-12, item 4) A paddy's water level over its water and bund, NaN elsewhere; only on a map with paddies. */\n"
  + "  getPaddyWaterLevelAt?(x: number, z: number): number;\n"
  + "  /** (item 4) Each paddy's own level water surface (paddies.ts paddyWaterQuads); only on a map with paddies. */\n"
  + "  getPaddyWaterQuads?(): readonly PaddyWaterQuad[];\n");
take("    // (2026-10-12, item 4) the paddies' water level, for the shallow-water sheet (only on a map with paddies)\n"
  + "    ...(compiledPaddies !== null ? { getPaddyWaterLevelAt: (x: number, z: number): number => paddyWaterLevelAt(compiledPaddies, x, z),\n"
  + "      getPaddyWaterQuads: () => paddyWaterQuads(compiledPaddies) } : {}),\n");
take(source.slice(source.indexOf('  /**\n   * 2026-10-12 (item 4, the owner: "we need real water"): flooded paddies (paddies.ts)'),
  source.indexOf('  paddies?: readonly PaddyConfig[];\n') + '  paddies?: readonly PaddyConfig[];\n'.length));
take(source.slice(source.indexOf('  // (2026-10-12, item 4) the paddies\' floors: the finished ground\'s median over each'),
  source.indexOf('  // Explicit second phase: all legacy support targets above are frozen.')));
take("    if (compiledPaddies !== null && inPaddy(compiledPaddies, x, z)) return true; // (item 4) a paddy's water and its bund\n");
take(source.slice(source.indexOf('  /**\n   * The map-revival lane (2026-10-07, Tidegate Polders step 5; canals.ts)'),
  source.indexOf('  canals?: readonly CanalConfig[];\n') + '  canals?: readonly CanalConfig[];\n'.length));
take("  // (the map-revival lane, 2026-10-07) the canals, compiled once; null on every map without one\n  let compiledCanals = compileCanals(T.canals);\n"
  + "  // (2026-10-12, item 4) the paddies: their floors resolve on the finished ground below, then their water joins the canals\n"
  + "  const compiledPaddies = compilePaddies(T.paddies);\n");
take(source.slice(source.indexOf('    // (the map-revival lane, 2026-10-07) the canals carved to their profiles'),
  source.indexOf('    // the built mounds stand last, over every constraint above (final queries only)')));
take(source.slice(source.indexOf("    // (the map-revival lane, 2026-10-07) a canal's water, bank to bank, up to a road's culvert"),
  source.indexOf('    if (wetness <= 0) return canalWet;')));
take('    if (wetness <= 0) return canalWet;\n    // Surface heights deliberately yield', '    if (wetness <= 0) return 0;\n    // Surface heights deliberately yield');
take('    if (wetness <= 0) return canalWet;\n    for (const pad of padPts) {', '    if (wetness <= 0) return 0;\n    for (const pad of padPts) {');
take('    return canalWet > wetness ? canalWet : wetness;\n  }', '    return wetness;\n  }');
take("    if (compiledCanals !== null && inCanal(compiledCanals, x, z)) return true; // the map-revival lane: a canal and its banks' foot\n");
// (2026-10-15, Caldera's paddies) a map's paddies hold liquid water off the sea-and-lake maps: the marshes' and lakes' own
// liquid policy is the sea-or-lake flag it always was (marshLiquid), and the sheet is built for a map with paddies
take("  // (2026-10-15, Caldera's paddies) a map's marshes and lakes hold liquid water on a sea-or-lake map only; its paddies hold\n"
  + "  // theirs on any map that is not frozen (Caldera's ash marshes stay dry while its paddies are flooded)\n"
  + "  const marshLiquid = !!cfg?.splat?.seaLake && !T.frozenMarshes;\n"
  + "  const liquidWater = marshLiquid || (!!T.paddies?.length && !T.frozenMarshes);\n",
  "  const liquidWater = !!cfg?.splat?.seaLake && !T.frozenMarshes;\n");
take("    // (Caldera's paddies) a map whose only liquid water is its paddies' reads their canals alone\n"
  + "    if (!marshLiquid) return compiledCanals === null ? 0 : canalWetness(compiledCanals, x, z) * smoothstep(9.5, 10.5, gridSample(gRoadDist, x, z));\n");
take("  // (2026-10-15) a map with paddies builds the sheet for their water even off the sea-and-lake maps (Caldera)\n"
  + "  if (cfg && cfg.splat && (cfg.splat.seaLake || heightField._layout.terrain.paddies?.length) && !heightField._layout.terrain.frozenMarshes) {\n    const waterSteps",
  "  if (cfg?.splat?.seaLake && !heightField._layout.terrain.frozenMarshes) {\n    const waterSteps");
source = source.split('marshLiquid').join('liquidWater');
take("    // (the map-revival lane, 2026-10-07) a canal's water drives as a soft lake's\n    if (compiledCanals !== null && canalWetness(compiledCanals, x, z) > 0.5) return T.softLakes ? 'soft' : 'hard';\n");
// (2026-10-17, the ground lane) the sheet holds a canal's own level (the Polders ditch)
take("import { canalLevelAt } from './canals.ts'; // (the ground lane, 2026-10-17: the sheet holds a canal's level)\n");
take("    ...(liquidWater ? { _waterWetnessAt: waterWetnessAt, getOutlandWaterAt: outlandWaterAt,\n"
  + "      getWaterBodySurfaceAt: (x: number, z: number): number => (compiledCanals !== null ? canalLevelAt(compiledCanals, x, z) : Number.NaN) } : {}),\n",
  "    ...(liquidWater ? { _waterWetnessAt: waterWetnessAt, getOutlandWaterAt: outlandWaterAt } : {}),\n");
assert.ok(!source.includes('compiledCanals') && !source.includes("from './canals.ts'") && !source.includes('compiledPaddies')
  && !source.includes("from './paddies.ts'"), 'the reconstruction holds no canal or paddy line');
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
const unset = MAP_IDS.filter((id) => !getMapConfig(id).terrain?.canals?.length && !getMapConfig(id).terrain?.paddies?.length);
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
// (step 6, the oxbow arm: its ends silted into reed beds) a stretch under a marsh is the marsh's shallow water, not the
// canal's level sheet
const marshes = polders.terrain.marshes ?? [];
const silted = (x, z) => marshes.some((m) => Math.hypot(x - m.x, z - m.z) < m.r);
let siltedSamples = 0;
for (const c of canals) {
  // its water at its level along its length, off the roads' culverts: the sheet lies on the bed one water depth under it
  let wetSamples = 0;
  for (let i = 1; i < c.path.length; i++) {
    const [x0, z0] = c.path[i - 1], [x1, z1] = c.path[i], len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 2; s < len - 2; s += 3) {
      const x = x0 + (x1 - x0) * s / len, z = z0 + (z1 - z0) * s / len;
      if (field._roadDist(x, z) < 11) continue;
      if (silted(x, z)) { siltedSamples++; continue; }
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
assert.ok(siltedSamples < 12, `only the silted ends lie under a marsh (${siltedSamples} samples)`);
console.log(`canals.selftest: the profile; ${unset.length} maps without canals identical to the terrain before the primitive; Polders' ${canals.length} canals at their levels (${siltedSamples} samples in the silted ends' reed beds) PASS`);
