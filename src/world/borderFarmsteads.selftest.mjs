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
// ... and a kit that builds no dwelling (Kestrel Airfield's Hostomel hangars) leaves the generic set, its church in the
// generic stone
{
  const airfield = getMapConfig('airfield');
  const arch = resolveBorderArchitecture('airfield', airfield.props?.architecture, false);
  assert.equal(arch?.style.id, 'hostomel', 'Kestrel Airfield resolves its hangar kit');
  const plain = buildBorderFarmsteads({ ...options, sites });
  const hangars = buildBorderFarmsteads({ ...options, sites, architecture: arch });
  assert.deepEqual(Array.from(hangars.geometry.getAttribute('position').array), Array.from(plain.geometry.getAttribute('position').array),
    'the hangar kit builds the generic yards');
  assert.deepEqual(Array.from(hangars.geometry.getAttribute('color').array), Array.from(plain.geometry.getAttribute('color').array),
    'in the generic colours');
}
// (the costland lane, 2026-10-09: batch 6 is opt-in per map, borderLandform.ts batch6 — the receipt opts Ironworks in)
const foundry = { ...getMapConfig('foundry'), terrain: { ...getMapConfig('foundry').terrain, border: { ...(getMapConfig('foundry').terrain?.border ?? {}), batch6: true } } };
const foundryField = createHeightField(1337, foundry);
const foundryRing = buildHorizonRing(null, foundry, 1337, foundryField);
const foundryFarms = foundryRing.getObjectByName('border-farmsteads');
assert.ok(foundryFarms, 'Ironworks has hamlets past its edge');
{
  // the borders lane (2026-10-08, Verdant's face trees 56 % in crops): past the ring's hand-over (720 m) the land past the
  // border is one woods field — the relief bake's stands (maps/horizon.ts standAt) — which the parcels keep off, the
  // ring's trees stand in and the farmsteads' yards stay out of
  const { HORIZON_STAND_HANDOVER_M } = await import('./horizonRelief.ts');
  const { Matrix4, Vector3 } = await import('three');
  const standAt = foundryRing.userData.horizonRing.standAt;
  assert.equal(typeof standAt, 'function', 'the ring carries its stands');
  const tint = [0, 0, 0, 1];
  const cropAt = (x, z) => 1 - foundryField._borderParcelAt(x, z, tint, Math.hypot(x, z) > HORIZON_STAND_HANDOVER_M[0] ? standAt(x, z) : undefined)[3];
  const forest = foundryRing.getObjectByName('horizon-forest');
  const m = new Matrix4(), v = new Vector3();
  let past = 0, inCrop = 0;
  for (const child of forest.children) {
    if (!/-(range|face|band)$/.test(child.name)) continue;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, m); v.setFromMatrixPosition(m);
      if (Math.hypot(v.x, v.z) < HORIZON_STAND_HANDOVER_M[1]) continue;
      past++;
      if (cropAt(v.x, v.z) > 0.5) inCrop++;
    }
  }
  assert.ok(past > 500, `Ironworks' ring stands trees past the hand-over (${past})`);
  assert.ok(inCrop <= past * 0.03, `the ring's trees past the hand-over stand in its woods, not its crops (${inCrop} of ${past})`);
  // and a stand past the hand-over sows no field: where the stand is closed the parcel's crop is gone
  let closed = 0, sown = 0;
  for (let a = 0; a < 720; a++) for (const r of [900, 1000, 1100]) {
    const x = Math.cos(a * Math.PI / 360) * r, z = Math.sin(a * Math.PI / 360) * r;
    if (standAt(x, z) < 0.9) continue;
    closed++;
    if (cropAt(x, z) > 0.1) sown++;
  }
  assert.ok(closed > 50 && sown === 0, `no crop under a closed stand past the hand-over (${sown} of ${closed})`);
}
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

// gauntlet wave 40 (Ruin Spires: "a red-roofed farm on that horizon reads wrong past a destroyed megacity"): no farm
// building stands past the edge of a ruined city or a country without farmland; the farms' sites keep their shelter
// copses, so nothing else on the ring moves (its forest is the same tree for tree)
const { resolveBorderLandform } = await import('./borderLandform.ts');
for (const id of ['ruinspires', 'blackglass', 'skybridge', 'titan_gorge', 'caldera', 'copper_mesa']) {
  const config = getMapConfig(id);
  assert.equal(resolveBorderLandform(config.horizon?.style, config.terrain?.border, id).farmBuildings, false, `${id}: no farm buildings`);
}
const forestOf = (group) => {
  const forest = group.getObjectByName('horizon-forest');
  return Object.values(forest?.userData ?? {}).find((v) => v && v.placements instanceof Float32Array)?.placements;
};
const ruins = getMapConfig('ruinspires');
const ruinsRing = buildHorizonRing(null, ruins, 1337, createHeightField(1337, ruins));
assert.equal(ruinsRing.getObjectByName('border-farmsteads'), undefined, 'Ruin Spires: no farm past the edge');
const withFarms = { ...ruins, terrain: { ...ruins.terrain, border: { ...(ruins.terrain.border ?? {}), farmBuildings: true } } };
const farmRing = buildHorizonRing(null, withFarms, 1337, createHeightField(1337, withFarms));
assert.ok(farmRing.getObjectByName('border-farmsteads'), 'the farms\' sites are still chosen (a twin with buildings raises them)');
assert.deepEqual(Array.from(forestOf(ruinsRing)), Array.from(forestOf(farmRing)), 'the ring forest is the same tree for tree');
console.log(`borderFarmsteads.selftest: a ${village.length}-yard village from 110 m with its church; Frosthollow's north spire at (${tower.x.toFixed(0)}, ${tower.z.toFixed(0)}), ${tower.rise.toFixed(1)} m; Ironworks' hamlets from the coalfield kit, ${tris} triangles; no farm past Ruin Spires, its forest unchanged`);
