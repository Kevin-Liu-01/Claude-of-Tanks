// Receipt for the terrace zones' order of construction (terrain.ts applyTerraces; the map-revival lane, Orchard Valley
// round 5, 2026-10-07, after the ground lane's read of gauntlet wave 251: the terrace risers read at range as lit and
// shaded facets, "the risers' mesh relief in the light"). The near-field relief (the 3-8 m humps of 10-25 cm) was laid
// over the steps after they were cut, so every bench carried humps and every riser broke into facets; the steps are now
// cut after it, so its humps are taken into the steps. (1) Terrace zones are Orchard's alone, so every other map builds
// the same terrain by construction (the zone lookup returns null and every step is skipped). (2) Orchard: built against
// terrain.ts as it was (the stepping restored before the near-field relief in its own source), the zones' benches stood
// off their levels by the relief; now the benches lie at their levels to the float, and the ground off the terraces is
// unchanged (to the bit but for float noise in the edge band, whose outland composition samples the square's edge).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');

// ---- (1) the terrace zones are Orchard's alone
const zoned = MAP_IDS.filter((id) => (getMapConfig(id).terrain?.terraces ?? []).length > 0);
assert.deepEqual(zoned, ['orchard'], 'Orchard is the only map with terrace zones');

// ---- (2) Orchard's benches before and after
const terrainURL = new URL('./terrain.ts', import.meta.url);
let source = readFileSync(terrainURL, 'utf8');
const swap = (from, to) => {
  assert.equal(source.split(from).length, 2, `the construction's lines stand in terrain.ts once: ${from.slice(0, 70)}`);
  source = source.replace(from, to);
};
swap(`    const tz = terraceZones.length ? terraceZoneWeight(terraceZones, x, z) : null;
    {
      const f1 = noi.noise(x * 0.0104 + 610, z * 0.0104 - 320);`, `    {
      const f1 = noi.noise(x * 0.0104 + 610, z * 0.0104 - 320);`);
swap(`      if (tz) micro *= 1 - 0.85 * tz.weight;
      h += micro;
    }`, `      const tz = terraceZones.length ? terraceZoneWeight(terraceZones, x, z) : null;
      if (tz) micro *= 1 - 0.85 * tz.weight;
      h += micro;
      if (tz) h = applyTerraces(tz, x, z, h, cw, vm, marshW);
    }`);
source = source.replace(/    \/\/ the map-revival lane \(2026-10-05; round 5, 2026-10-07\): a terrace zone is stepped after the near-field relief[^\n]*\n(    \/\/[^\n]*\n)*    if \(tz\) h = applyTerraces\(tz, x, z, h, cw, vm, marshW\);\n/, '');
assert.equal(source.split('h = applyTerraces(').length, 2, 'the reconstruction steps the zones once, before the near-field relief');
const beforeURL = new URL('./terrain.ts?before-terrace-order', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  if (url === beforeURL) return { format: 'module-typescript', shortCircuit: true, source };
  return next(url, context);
} });
let before;
try { before = (await import(beforeURL)).createHeightField; } finally { hooks.deregister(); }

const config = getMapConfig('orchard');
const now = createHeightField(1337, config), was = before(1337, config);
const step = config.terrain.terraces[0].stepM;
const inside = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// the zones' cores (their feather and 12 m more in from every side), off the roads' corridors and inside the square;
// the open-country zones (a zone kept in the settlement, below, lies where the near-field relief stands down)
const open = config.terrain.terraces.filter((zone) => !zone.settlement);
const core = (x, z) => open.some((zone) => {
  const pad = (zone.feather ?? 24) + 12;
  return inside(zone.polygon, x, z) && [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].every(([dx, dz]) => inside(zone.polygon, x + dx, z + dz));
});
let samples = 0, levelNow = 0, levelWas = 0, off = 0, offSame = 0, offMax = 0;
const onLevel = (h) => Math.abs(h / step - Math.round(h / step)) * step < 1e-6;
for (let z = -440; z <= 440; z += 3.7) for (let x = -440; x <= 440; x += 3.7) {
  if (now._roadDist(x, z) < 26) continue;
  if (core(x, z)) {
    samples++;
    if (onLevel(now.getHeightAt(x, z))) levelNow++;
    if (onLevel(was.getHeightAt(x, z))) levelWas++;
  } else if (!config.terrain.terraces.some((zone) => inside(zone.polygon, x, z))) {
    off++;
    const d = Math.abs(now.getHeightAt(x, z) - was.getHeightAt(x, z));
    if (d === 0) offSame++;
    offMax = Math.max(offMax, d);
  }
}
assert.ok(samples > 4000, `samples in the zones' cores (${samples})`);
assert.ok(levelWas < samples * 0.01, `before: the near-field relief stood the benches off their levels (${levelWas} of ${samples} on a level)`);
assert.ok(levelNow > samples * 0.3, `now: the benches lie at their levels (${levelNow} of ${samples} on a level)`);
// off the terraces the ground is unchanged; the edge band's outland composition samples the square's edge (the terraces'
// heights among them), so a few points there move by float noise
assert.ok(off > 20000 && offSame > off * 0.99 && offMax < 1e-3, `off the terraces the ground is unchanged (${offSame} of ${off} to the bit, the rest within ${offMax.toExponential(1)} m)`);
// ---- (3) a zone kept in the settlement (TerraceZoneConfig.settlement, Orchard round 5: the village on its terraced hill)
// steps its ground inside the village's levelled ground; the same zone without the opt-in lies level there, as every
// settlement did before it
const kept = config.terrain.terraces.filter((zone) => zone.settlement);
assert.ok(kept.length === 1 && kept[0].settlement === 1, 'Orchard keeps one terrace zone in its settlement, the village hill');
const flat = createHeightField(1337, { ...config, terrain: { ...config.terrain,
  terraces: config.terrain.terraces.map((zone) => zone.settlement ? { ...zone, settlement: undefined } : zone) } });
const v = config.terrain.village;
let inVillage = 0, keptLevel = 0, flatLevel = 0;
for (let z = -440; z <= 440; z += 2.3) for (let x = -440; x <= 440; x += 2.3) {
  if (x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1 || now._roadDist(x, z) < 20) continue;
  const zone = kept[0], pad = zone.feather + 8;
  if (![[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].every(([dx, dz]) => inside(zone.polygon, x + dx, z + dz))) continue;
  inVillage++;
  if (onLevel(now.getHeightAt(x, z))) keptLevel++;
  if (onLevel(flat.getHeightAt(x, z))) flatLevel++;
}
assert.ok(inVillage > 500, `samples of the village hill's zone inside the settlement (${inVillage})`);
assert.ok(keptLevel > inVillage * 0.3 && flatLevel < inVillage * 0.02, `kept in the settlement the hill's benches lie at their levels (${keptLevel} of ${inVillage}; without the opt-in ${flatLevel})`);
console.log(`terraceBenches.selftest: Orchard's benches at their levels ${levelNow} of ${samples} core samples (before ${levelWas}); off the terraces ${offSame} of ${off} samples unchanged to the bit, the rest within ${offMax.toExponential(1)} m; the village hill's zone kept in the settlement ${keptLevel} of ${inVillage} on a level (${flatLevel} without the opt-in); no other map has terrace zones PASS`);
