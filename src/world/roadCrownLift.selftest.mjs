// Receipt for the road paths' crown lift (terrain.ts RoadPathStyle.crownLiftM; the map-revival lane, 2026-10-07,
// Tidegate Polders step 7: "lanes as wide as a modern road and level with the water"): an opt-in hook that raises a
// styled path's carriageway on a crowned bank of its own. (1) Every map that lifts no path builds the same terrain to the
// bit as the terrain before the hook: the hook's lines are taken back out of terrain.ts's own source and both builds are
// compared map by map (heights, the water mask and the ground type on a grid). (2) Polders' raised roads: on a lifted
// line's centre, away from the farm court's lane that keeps its grade, the ground stands the lift over the same build
// without it; the bank's crest holds the carriageway and its verge, its shoulders come down to the graded plane within
// six metres; where the lifted roads meet the mill lane the lift has ramped out; off the roads nothing moves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');

// ---- (1) every map that lifts no path: the same terrain as before the hook, to the bit
const terrainURL = new URL('./terrain.ts', import.meta.url);
let source = readFileSync(terrainURL, 'utf8');
const cut = (from, to, keep = '') => {
  const a = source.indexOf(from), b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `the hook's lines stand in terrain.ts: ${from.slice(0, 60)}`);
  source = source.slice(0, a) + keep + source.slice(b);
};
cut('  /**\n   * The map-revival lane (2026-10-07, Tidegate Polders\' lanes on the dyke crowns)', '}\n/** The road layer\'s class codes', '');
cut('  // (the map-revival lane, 2026-10-07; RoadPathStyle.crownLiftM) the crowned banks of the lifted paths', '  const roads = layout.roads;');
cut('    if (crownStyles) fillRoadCrowns(crownStyles, nodeElev);\n', '  // --- road node elevations:', '  }\n');
cut('      // (the map-revival lane, 2026-10-07) a lifted path\'s crowned bank over the graded plane', '    }\n    const detailed = applyRoadShoulderDetail');
assert.ok(!/crownLift|gRoadLift|gRoadCrest|fillRoadCrowns|crownStyles/.test(source.replace(/widthM\?: number;\n}/, '')), 'the reconstruction holds no line of the hook');
const beforeURL = new URL('./terrain.ts?before-crown-lift', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  if (url === beforeURL) return { format: 'module-typescript', shortCircuit: true, source };
  return next(url, context);
} });
let before;
try { before = (await import(beforeURL)).createHeightField; } finally { hooks.deregister(); }
const digest = (field) => {
  const h = createHash('sha256');
  const buf = new Float64Array(3);
  for (let z = -500; z <= 500; z += 12.5) for (let x = -500; x <= 500; x += 12.5) {
    buf[0] = field.getHeightAt(x, z); buf[1] = field.getWaterMaskAt(x, z);
    buf[2] = ['hard', 'medium', 'soft'].indexOf(field.getGroundType(x, z));
    h.update(Buffer.from(buf.buffer));
  }
  return h.digest('hex').slice(0, 16);
};
const lifts = (config) => (config.terrain?.roads?.pathStyles ?? []).some((style) => (style?.crownLiftM ?? 0) > 0);
const unset = MAP_IDS.filter((id) => !lifts(getMapConfig(id)));
for (const id of unset) {
  const config = getMapConfig(id);
  assert.equal(digest(createHeightField(1337, config)), digest(before(1337, config)), `${id}: no lifted path, the same terrain to the bit`);
}
assert.deepEqual(MAP_IDS.filter((id) => lifts(getMapConfig(id))), ['polders'], 'Polders is the only map that lifts its roads');

// ---- (2) Polders' raised roads
const polders = getMapConfig('polders');
const flat = { ...polders, terrain: { ...polders.terrain, roads: { ...polders.terrain.roads,
  pathStyles: polders.terrain.roads.pathStyles.map((style) => style && { ...style, crownLiftM: undefined }) } } };
const raised = createHeightField(1337, polders), level = createHeightField(1337, flat);
const lift = polders.terrain.roads.pathStyles[5].crownLiftM;
// along every lifted road's line (its authored path, sampled every 8 m): the bank never lowers the road and never lifts
// it more than the lift (a road already on an embankment as high takes none), and where the road crossed the fields at
// grade it stands on its bank
const lines = polders.terrain.roads.paths;
let samples = 0, banked = 0, best = null;
polders.terrain.roads.pathStyles.forEach((style, r) => {
  if (!((style?.crownLiftM ?? 0) > 0)) return;
  const path = lines[r];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], len = Math.hypot(bx - ax, bz - az);
    for (let t = 4; t < len - 4; t += 8) {
      const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len;
      if (Math.max(Math.abs(x), Math.abs(z)) > 440) continue;
      const delta = raised.getHeightAt(x, z) - level.getHeightAt(x, z);
      assert.ok(delta > -1e-6 && delta < style.crownLiftM + 0.02, `the bank lifts by at most the lift at (${x.toFixed(0)}, ${z.toFixed(0)}): ${delta.toFixed(3)}`);
      samples++;
      if (delta > 0.5 * style.crownLiftM) banked++;
      const ux = (bz - az) / len, uz = -(bx - ax) / len;
      if (!best || delta > best.delta) best = { x, z, ux, uz, delta, half: style.widthM / 2 };
    }
  }
});
assert.ok(samples > 150 && banked > samples * 0.3, `the lifted roads stand on their banks over the fields (${banked} of ${samples} samples)`);
// the bank's section where it stands highest: the crest holds the carriageway and its verge, the shoulders down by six metres
{
  const at = (k) => raised.getHeightAt(best.x + best.ux * k, best.z + best.uz * k) - level.getHeightAt(best.x + best.ux * k, best.z + best.uz * k);
  assert.ok(best.delta > 0.9 * lift, `a bank at its full lift (${best.delta.toFixed(3)} at ${best.x.toFixed(0)}, ${best.z.toFixed(0)})`);
  const crest = best.half + 1.2;
  for (const side of [-1, 1]) {
    assert.ok(Math.abs(at(side * (crest - 0.3)) - best.delta) < 0.12, 'the crest holds the carriageway and its verge');
    assert.ok(Math.abs(at(side * (crest + 6.5))) < 0.05, 'the shoulder meets the graded plane within six metres');
  }
}
// the mill lane keeps its grade: on its line in the farm court nothing is lifted
for (const [x, z] of [[-80, 0], [-120, -62]]) {
  assert.ok(Math.abs(raised.getHeightAt(x, z) - level.getHeightAt(x, z)) < 1e-9, `the mill lane keeps its grade at (${x}, ${z})`);
}
// off the roads (beyond the banks) nothing moves
let off = 0;
for (let z = -440; z <= 440; z += 40) for (let x = -440; x <= 440; x += 40) {
  if (raised._roadDist(x, z) < 20) continue;
  assert.ok(Math.abs(raised.getHeightAt(x, z) - level.getHeightAt(x, z)) < 1e-9, `off the roads the ground is untouched at (${x}, ${z})`);
  off++;
}
assert.ok(off > 300, `a field of samples off the roads (${off})`);
console.log(`roadCrownLift.selftest: ${unset.length} maps without a lifted path identical to the terrain before the hook; Polders' lanes on their crowns PASS`);
