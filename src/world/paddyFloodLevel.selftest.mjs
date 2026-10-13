// A flooded paddy holds water only on a level floor (2026-10-12, the owner: "in some maps such as the jade river deltas
// spawn, we can see fake water. no more of that, we need real water"). The rotation flooded a fifth of Delta's fields
// wherever its hash fell, and the material painted them as a sky-mirroring water film over floors that rise 2-5 m
// across one field (p10..p90; up to 7.8 m end to end) — paint pretending to be water, the player's tank parked on it,
// trees standing in it. Now a flooded paddy keeps its water only where its floor is level (PADDY_LEVEL_M); elsewhere the
// rice grows green. The height field's profile is the one the material bakes and every CPU reader shares.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { LAND_CROP, PADDY_LEVEL_M, createLandFieldSample, landUseAt, resolveLandUseProfile, withLevelPaddies } from './landUse.ts';
import { deploymentFrame } from '../sim/deployment.ts';

const sample = createLandFieldSample();
for (const id of ['delta', 'caldera']) {
  const cfg = getMapConfig(id);
  const field = createHeightField(typeof cfg.seed === 'number' ? cfg.seed : 1337, cfg);
  const profile = field._landUseProfile;
  assert.ok(profile && profile.floodIds instanceof Set, `${id}: the height field carries the level-paddy profile`);
  // Every field that still floods is level: its floor re-sampled on a finer grid than the scan's stays within the line.
  const floors = new Map();
  let flooded = 0, fields = 0;
  for (let z = -510; z < 510; z += 2.5) for (let x = -510; x < 510; x += 2.5) {
    landUseAt(profile, x, z, sample);
    if (!sample.active) continue;
    fields++;
    if (sample.crop !== LAND_CROP.paddyWater) continue;
    flooded++;
    assert.ok(profile.floodIds.has(sample.id), `${id}: a flooded field is one the scan found level (${sample.id})`);
    if (sample.edgeM < sample.marginM + 0.5) continue;
    let floor = floors.get(sample.id); if (!floor) floors.set(sample.id, floor = []);
    floor.push(field.getHeightAt(x, z));
  }
  for (const [fieldId, floor] of floors) {
    if (floor.length < 20) continue;
    floor.sort((a, b) => a - b);
    const spread = floor[Math.floor(floor.length * 0.9)] - floor[Math.floor(floor.length * 0.1)];
    assert.ok(spread <= PADDY_LEVEL_M + 0.1, `${id}: flooded field ${fieldId} is level (${spread.toFixed(2)} m)`);
  }
  // The rotation floods its share of the paddies (item 31's Caldera r5 rotation floods 7.8% raw; the floor only ensures the level check has paddies to test); the level rule keeps a few percent of the field ground.
  const raw = resolveLandUseProfile(id);
  let rawFlooded = 0;
  for (let z = -510; z < 510; z += 2.5) for (let x = -510; x < 510; x += 2.5) {
    landUseAt(raw, x, z, sample);
    if (sample.active && sample.crop === LAND_CROP.paddyWater) rawFlooded++;
  }
  assert.ok(rawFlooded > fields * 0.05, `${id}: the rotation floods its share (${(rawFlooded / fields).toFixed(3)})`);
  assert.ok(flooded < rawFlooded * 0.15, `${id}: water only on level floors (${(flooded / fields).toFixed(4)} of the field ground)`);
  // No painted water where the players deploy: within 90 m of either anchor no field floods unless it is level.
  const frame = deploymentFrame(cfg.spawns);
  for (const team of ['alpha', 'bravo']) {
    const a = frame.anchors[team];
    for (let dz = -90; dz <= 90; dz += 3) for (let dx = -90; dx <= 90; dx += 3) {
      landUseAt(profile, a.x + dx, a.z + dz, sample);
      if (sample.active && sample.crop === LAND_CROP.paddyWater) assert.ok(profile.floodIds.has(sample.id));
    }
  }
  console.log(`paddyFloodLevel: ${id}: ${profile.floodIds.size} level flooded fields, ${(flooded / fields).toFixed(4)} of the field ground flooded (the rotation alone ${(rawFlooded / fields).toFixed(3)})`);
}
// A land use that floods nothing is returned unchanged; no profile stays none.
const verdant = resolveLandUseProfile('verdant');
assert.equal(withLevelPaddies(verdant, () => 0, 512), verdant, 'a profile without paddies is untouched');
assert.equal(withLevelPaddies(null, () => 0, 512), null);
// The material bakes the height field's own profile (the land use every CPU reader shares).
const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrainSource, /heightField\._landUseProfile \?\? null,\n\s*\);\n\s*let materialStep = materialSteps\.next\(\);/, 'the build hands its profile to the material');
assert.match(terrainSource, /const landUseProfile = landUseProfileOverride \?\? resolveLandUseProfile\(mapId\);/, 'the material bakes it');
console.log('paddyFloodLevel: flooded paddies only on level floors; the material and every CPU reader share the profile');
