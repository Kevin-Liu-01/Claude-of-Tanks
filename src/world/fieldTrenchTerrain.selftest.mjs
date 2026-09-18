import assert from 'node:assert/strict';
import { getMapConfig } from './maps/index.ts';
import { createHeightField } from './terrain.ts';
import { FIELD_TRENCH, assaultTrenchCarveDepth } from '../sim/assaultLines.ts';

// owner 2026-09-17 ("more trenches … on ALL maps, extra in Frontline Assault"): every standard field carries
// short fire trenches (two per side of the axis at 30 % / 70 %), dropped where a settlement, a road (26 m berth) or
// the map edge would cross them; a map can opt out; the assault variant adds them clear of its sector lines.
// Raw authoring queries (roads, pads, lakes) never see the carve, so road grades are trench-independent.
let mapsWithTrenches = 0;
for (const id of ['verdant', 'steppe', 'desert', 'winter', 'frontier', 'coastal']) {
  const cfg = getMapConfig(id);
  const field = createHeightField(1337, cfg);
  const flat = createHeightField(1337, { ...cfg, fieldTrenches: false });
  assert.equal(flat.fieldTrenchLines, null, `${id}: opting out leaves no field plan`);
  assert.equal(field.assaultTrenchLines, null, `${id}: the standard field still carries no sector plan`);
  const plan = field.fieldTrenchLines;
  if (!plan) { console.log(`  ${id}: no field trench fits the settlement/roads`); continue; }
  mapsWithTrenches++;
  assert.ok(plan.lines.length >= 1 && plan.lines.length <= 4, `${id}: ${plan.lines.length} lines`);
  assert.equal(plan.profile, FIELD_TRENCH.profile, `${id}: field lines carve the fire-trench section, not the fortified sector section`);
  for (const line of plan.lines) {
    assert.equal(line.halfLengthM, FIELD_TRENCH.halfLengthM);
    const cut = flat.getHeightAt(line.x, line.z) - field.getHeightAt(line.x, line.z);
    assert.ok(cut > FIELD_TRENCH.profile.depthM * 0.75 && cut <= FIELD_TRENCH.profile.depthM + 1e-6, `${id}: floor cut at the line centre ${cut.toFixed(2)} m`);
    for (let k = -2; k <= 2; k++) {
      const s = (k / 2) * line.halfLengthM;
      const px = line.x + line.lx * s, pz = line.z + line.lz * s;
      assert.ok(field._roadDist(px, pz) >= 26, `${id}: the trench keeps 26 m off the roads (${field._roadDist(px, pz).toFixed(1)} m)`);
      assert.ok(field._villageMask(px, pz) < 0.4, `${id}: the trench stays out of the settlement`);
      assert.ok(Math.max(Math.abs(px), Math.abs(pz)) <= 455, `${id}: the trench stays inside the playable field`);
    }
  }
  let same = 0;
  for (const [x, z] of [[-380, -380], [380, 380], [-380, 380], [380, -380], [0, 0]]) {
    if (assaultTrenchCarveDepth(x, z, plan) === 0 && Math.abs(field.getHeightAt(x, z) - flat.getHeightAt(x, z)) < 1e-6) same++;
  }
  assert.ok(same >= 4, `${id}: the carve is local to the trenches (${same}/5 far samples unchanged)`);
  console.log(`  ${id}: ${plan.lines.length} field trenches`);
}
assert.ok(mapsWithTrenches >= 4, `most sampled maps carry field trenches (${mapsWithTrenches}/6)`);

{
  // raw authoring invariance: road node grades and pad seats come from the untrenched ground
  const cfg = getMapConfig('steppe');
  const field = createHeightField(1337, cfg), flat = createHeightField(1337, { ...cfg, fieldTrenches: false });
  assert.deepEqual(field._layout.roads.map((road) => road.map(([x, z]) => [x, z])), flat._layout.roads.map((road) => road.map(([x, z]) => [x, z])), 'same completed roads');
  let roadSamples = 0;
  for (const road of field._layout.roads) for (const [x, z] of road) {
    assert.ok(Math.abs(field.getHeightAt(x, z) - flat.getHeightAt(x, z)) < 1e-9, `steppe: road node (${x.toFixed(1)}, ${z.toFixed(1)}) keeps its grade`);
    roadSamples++;
  }
  assert.ok(roadSamples > 20, `steppe: ${roadSamples} road nodes compared`);
}

{
  const carved = createHeightField(1337, { ...getMapConfig('frontier'), assaultTrenches: true });
  assert.ok(carved.assaultTrenchLines && carved.assaultTrenchLines.lines.length >= 2, 'the assault variant keeps its sector lines');
  for (const line of carved.fieldTrenchLines?.lines ?? []) {
    for (const sector of carved.assaultTrenchLines.lines) {
      assert.ok(Math.hypot(line.x - sector.x, line.z - sector.z) >= sector.halfLengthM + line.halfLengthM + 10,
        'field trenches keep clear of the sector lines');
    }
  }
  console.log(`  frontier [assault]: ${carved.assaultTrenchLines.lines.length} sector lines + ${carved.fieldTrenchLines?.lines.length ?? 0} field trenches`);
}
console.log('fieldTrenchTerrain.selftest: field trenches on every standard map passed');
