// src/world/maps/buildingStyleTable.selftest.mjs — the building-style table's laws (item buildings-270).
//   1. every battlefield has a row (the type says so; this says it at run time too), and each row's kit is a kit;
//   2. each map's `props.architecture` is its row's kit (the row is the source);
//   3. a row's measure is its kit's: the kit's reading (tools/building-style-reading.mjs, pinned in
//      src/world/buildingStyleReading.baseline.json) has its median storey count, storey height, pitch and window bay
//      inside the row's ranges and its commonest roof form among the row's forms;
//   4. every row carries photographs (a Commons file page or another sourced page with author and license), at least two
//      for a terrestrial place;
//   5. the weathering and wear the row sets are shares (0–1) and its colours are hex.
// `node tools/building-style-reading.mjs --json=src/world/buildingStyleReading.baseline.json` refreshes the reading after
// a kit's houses change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { BUILDING_STYLES, buildingStyleOf } = await import('./buildingStyleTable.ts');
const { MAP_IDS } = await import('./mapIds.ts');
const { getMapConfig } = await import('./index.ts');
const { ARCHITECTURE_STYLE_IDS } = await import('./regional/index.ts');
const reading = JSON.parse(readFileSync(new URL('../buildingStyleReading.baseline.json', import.meta.url), 'utf8'));

const OFF_WORLD = new Set(['mars', 'moon']);
const within = (v, [lo, hi], slack = 0) => v >= lo - slack && v <= hi + slack;

// 1
assert.deepEqual(Object.keys(BUILDING_STYLES).sort(), [...MAP_IDS].sort(), 'one row per battlefield');
assert.equal(buildingStyleOf('atlantis'), null);
for (const id of MAP_IDS) {
  const row = BUILDING_STYLES[id];
  assert.ok(ARCHITECTURE_STYLE_IDS.includes(row.kit), `${id}: kit ${row.kit} is a kit`);
  // 2
  assert.equal(getMapConfig(id).props.architecture, row.kit, `${id}: props.architecture reads its row`);
  // 5
  for (const v of [row.weathering.damp, row.weathering.moss, row.damage.wear]) assert.ok(v >= 0 && v <= 1, `${id}: shares in 0–1`);
  for (const c of [...row.roof.colours, ...row.facade.colours]) assert.match(c, /^#[0-9a-f]{6}$/, `${id}: hex colour ${c}`);
  assert.ok(row.storeys[0] <= row.storeys[1] && row.storeyM[0] <= row.storeyM[1], `${id}: ranges ordered`);
  // 3
  const r = reading[row.kit];
  assert.ok(r, `${id}: ${row.kit} has a reading`);
  if (r.houses) {
    const roofs = Object.entries(r.roofs).sort((a, b) => b[1] - a[1]);
    assert.ok(row.roof.forms.includes(roofs[0][0]), `${id}: the kit's commonest roof (${roofs[0][0]}) is among the row's forms ${row.roof.forms}`);
    assert.ok(within(r.mid.storeys, row.storeys), `${id}: the kit's storeys ${r.storeys} sit in the row's ${row.storeys}`);
    assert.ok(within(r.mid.storeyM, row.storeyM, 0.25), `${id}: the kit's storey height ${r.storeyM} m sits in the row's ${row.storeyM}`);
    if (r.mid.pitchDeg !== null && row.roof.pitchDeg) assert.ok(within(r.mid.pitchDeg, row.roof.pitchDeg, 5), `${id}: the kit's pitch ${r.pitchDeg}° sits in the row's ${row.roof.pitchDeg}`);
    if (r.mid.bayM !== null && row.windows.bayM) assert.ok(within(r.mid.bayM, row.windows.bayM, 0.4), `${id}: the kit's window bay ${r.window.bayM} m sits in the row's ${row.windows.bayM}`);
  }
  // 4
  const floor = OFF_WORLD.has(id) ? 0 : 2;
  assert.ok(row.references.length >= floor, `${id}: ${row.references.length} photographs (at least ${floor})`);
  for (const ref of row.references) {
    assert.match(ref.url, /^https:\/\//, `${id}: a reference is a page`);
    assert.ok(ref.author && ref.license && ref.shows, `${id}: ${ref.url} names its author, license and what it shows`);
  }
}

console.log(`buildingStyleTable selftest: ${MAP_IDS.length} rows, each its map's kit, measured against its kit, with its photographs`);
