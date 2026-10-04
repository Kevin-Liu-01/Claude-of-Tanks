// The map-borders lane (2026-10-03, gauntlet wave 30, Frosthollow's north views): the villages past the edge string
// along the roads that leave the square from 110 m out, and each has its church. Wave 3 searched them from 260 m, but
// the roads now end at the foot of the ranges (~300-450 m out on a mountain map), so a mountain map's villages found no
// room, and Frosthollow's north lost its hamlet and church spire.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { buildBorderFarmsteads, resolveBorderArchitecture, selectFarmsteadSites } from './borderFarmsteads.ts';

// a road leaving the square north for 330 m over a flat, open country
const xs = [], zs = [];
for (let s = 0; s <= 360; s += 40) { xs.push(0); zs.push(512 + s); }
const line = { xs, zs, length: 330 };
const options = {
  seed: 7, style: 'winter', count: 6, fieldAngle: 0.2,
  groundAt: () => 0, woodsAt: () => 0, blockedAt: () => 0,
  roadDistanceAt: (x, z) => (z > 512 && z < 512 + 330 ? Math.abs(x) : Infinity),
  roadLines: [line],
};
const sites = selectFarmsteadSites(options);
const village = sites.filter((site) => site.village);
assert.ok(village.length >= 3, `a village strings along the road (${village.length} yards)`);
for (const site of village) {
  const out = site.z - 512;
  assert.ok(out >= 110 - 1 && out <= 330, `its yards stand 110-330 m out, before the road ends (${out.toFixed(0)} m)`);
  assert.ok(Math.abs(site.x) >= 26 && Math.abs(site.x) <= 32, `each faces the road 26-32 m off it (${site.x.toFixed(1)} m)`);
}
const churches = sites.filter((site) => site.church);
assert.equal(churches.length, 1, 'the village has its church');
const church = churches[0].church;
assert.ok(Math.abs(church.x) >= 16 && church.z - 512 <= 330, `the church stands off the road, within the village (${church.x.toFixed(1)}, ${(church.z - 512).toFixed(0)} m out)`);
assert.ok(Math.abs(Math.sin(church.yaw - Math.PI / 2)) < 1e-9, 'its nave runs along the road');
// the built village carries its spire (a tower over 25 m), and no hamlet church besides
const mesh = buildBorderFarmsteads({ ...options, sites });
const pos = mesh.geometry.getAttribute('position');
let spire = 0;
for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - church.x, pos.getZ(i) - church.z) < 25) spire = Math.max(spire, pos.getY(i));
assert.ok(spire > 25, `the church's spire stands ${spire.toFixed(1)} m`);

// Frosthollow: a village and its church on a north road, inside the border census's edge-n view (from (0, 442) looking
// north, its 88-degree width) and before the ranges' foot
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const { getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');
const { buildHorizonRing } = await import('./maps/horizon.ts');
const cfg = getMapConfig('winter');
const ring = buildHorizonRing(null, cfg, 1337, createHeightField(1337, cfg));
const farms = ring.getObjectByName('border-farmsteads');
assert.ok(farms, 'Frosthollow has farmsteads past its edge');
const fp = farms.geometry.getAttribute('position');
let tower = null;
for (let i = 0; i < fp.count; i++) {
  const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
  if (z < 512 || Math.abs(Math.atan2(x, z - 442)) > 44 * Math.PI / 180) continue;
  // a spire's apex: a vertex 25 m or more over the lowest vertex near it
  let low = Infinity;
  for (let j = 0; j < fp.count; j += 3) if (Math.abs(fp.getX(j) - x) < 6 && Math.abs(fp.getZ(j) - z) < 6) low = Math.min(low, fp.getY(j));
  if (y - low > 25 && (!tower || y - low > tower.rise)) tower = { x, z, rise: y - low };
}
assert.ok(tower, 'a church spire stands in Frosthollow\'s north view');
assert.ok(tower.z - 512 < 420, `before the ranges' foot (${(tower.z - 512).toFixed(0)} m out)`);

// gauntlet wave 30, Ironworks' edge-e-up ("the new hamlets read as American red barns"): a map with a regional building
// kit builds its hamlets from it — the square's own kit, or its region's where the square has none (Ironworks, on the
// Saar: the coalfield's workers' cottage pairs) — and a map with neither keeps the generic farm set
assert.equal(resolveBorderArchitecture('foundry', undefined, false)?.style.id, 'ruhr', 'Ironworks: the coalfield workers\' houses');
assert.equal(resolveBorderArchitecture('frontier', 'hessian', false)?.style.id, 'hessian', 'a square\'s own kit');
assert.equal(resolveBorderArchitecture('winter', undefined, true), null, 'no kit: the generic farm set');
const foundry = getMapConfig('foundry');
const foundryFarms = buildHorizonRing(null, foundry, 1337, createHeightField(1337, foundry)).getObjectByName('border-farmsteads');
assert.ok(foundryFarms, 'Ironworks has hamlets past its edge');
const tris = foundryFarms.geometry.getAttribute('position').count / 3;
assert.ok(tris <= 70000, `the hamlets stay a background (${tris} triangles in one draw)`);
assert.ok(tris > 10000, `the kit's buildings, not the generic boxes (~650 triangles a map): ${tris}`);
// no generic barn walls left (colours as the mesh carries them: sRGB x 0.8, linear, x 0.9)
const lin = (c) => c.map((v) => Math.pow(v * 0.8, 2.2) * 0.9);
const near = (col, i, c) => Math.abs(col.getX(i) - c[0]) < 2e-3 && Math.abs(col.getY(i) - c[1]) < 2e-3 && Math.abs(col.getZ(i) - c[2]) < 2e-3;
const genericBarn = [[0.46, 0.20, 0.15], [0.37, 0.30, 0.23], [0.62, 0.55, 0.45]].map(lin);
const fc = foundryFarms.geometry.getAttribute('color');
let generic = 0;
for (let i = 0; i < fc.count; i++) if (genericBarn.some((c) => near(fc, i, c))) generic++;
assert.equal(generic, 0, 'no generic barn left at Ironworks');
console.log(`borderFarmsteads.selftest: a ${village.length}-yard village from 110 m with its church; Frosthollow's north spire at (${tower.x.toFixed(0)}, ${tower.z.toFixed(0)}), ${tower.rise.toFixed(1)} m; Ironworks' hamlets from the coalfield kit, ${tris} triangles`);
