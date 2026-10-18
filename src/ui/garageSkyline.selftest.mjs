// garage r9 (K10) skyline receipt: each Garage's outside environment comes from its own map. The generator is current
// and byte-stable; every Garage with a skyline builds its map's named landmarks at their bearings within the horizon's
// triangle budget, deterministically, with sky left over the tallest of them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGarageSkylineBackdrop, garageSkylineEnabled } from './garageSkyline.ts';
import { GARAGE_SKYLINES } from './garageSkylines.generated.ts';

const check = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/generate-garage-skylines.mjs', import.meta.url)), '--check'], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr || check.stdout);
assert.match(check.stdout, /garage skylines: current \(10 maps/);

// the acceptance list (criterion 12): the landmark types each place must show
const REQUIRED = {
  badlands: { jebel: 4, inselberg: 2 },
  alpine: { massif: 3, lake: 1, fort: 1, hospice: 1, village: 1 },
  winter: { massif: 1, lake: 1, church: 1, sawmill: 1, village: 1 },
  monsoon: { ridge: 3, river: 1, terraces: 1, town: 1 },
};
for (const [mapId, required] of Object.entries(REQUIRED)) {
  assert.ok(garageSkylineEnabled(mapId), `${mapId}: builds its horizon from its map`);
  const geometry = createGarageSkylineBackdrop(mapId);
  const again = createGarageSkylineBackdrop(mapId);
  assert.deepEqual([...again.getAttribute('position').array.slice(0, 3000)], [...geometry.getAttribute('position').array.slice(0, 3000)],
    `${mapId}: the skyline builds deterministically`);
  const triangles = geometry.index.count / 3;
  assert.ok(triangles <= 9500, `${mapId}: horizon and landmarks ${triangles} triangles (K10: 9,500)`);
  const marks = geometry.userData.skylineLandmarks;
  for (const [type, count] of Object.entries(required)) {
    const built = marks.filter((mark) => mark.type === type);
    assert.ok(built.length >= count, `${mapId}: ${built.length} ${type} built, ${count} required`);
  }
  // each built landmark stands at its map bearing (the generated row's compass bearing from the Garage's anchor)
  for (const mark of marks) {
    const row = GARAGE_SKYLINES[mapId].landmarks.find((candidate) => candidate.type === mark.type && candidate.azDeg === mark.azDeg);
    assert.ok(row, `${mapId}: ${mark.type} ${mark.name} comes from the map's rows`);
  }
  assert.ok(geometry.userData.maxElevationDeg > 2 && geometry.userData.maxElevationDeg <= 13, `${mapId}: sky over the skyline`);
  geometry.dispose(); again.dispose();
}
for (const mapId of ['verdant', 'desert', 'urban', 'coastal', 'railyard', 'foundry']) {
  assert.ok(GARAGE_SKYLINES[mapId], `${mapId}: the generator bakes its map's relief and rows for its lane`);
}
console.log('garageSkyline.selftest: skylines current, landmarks from the maps, budgets kept');
