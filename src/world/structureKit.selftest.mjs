import assert from 'node:assert/strict';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS, STRUCTURE_CATALOG,
} from './maps/structureKit.js';
import { getMapConfig, MAP_IDS } from './maps/index.js';

function seeded(seed = 0x51a7c7) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = STRUCTURE_CATALOG.map(({ id }) => id);
assert.equal(ids.length, 24, 'twenty-four new building types are registered');
assert.equal(new Set(ids).size, ids.length, 'new building ids are unique');
assert.equal(Object.keys(STRUCTURE_BUILDERS).length, 8, 'eight heavyweight merged buildings');
assert.equal(Object.keys(DESTRUCTIBLE_BUILDING_TYPES).length, 16,
  'sixteen light buildings have destruction states');

for (const [id, build] of Object.entries(STRUCTURE_BUILDERS)) {
  const buckets = Object.fromEntries(
    ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked']
      .map((key) => [key, []]),
  );
  const info = build(seeded(), buckets, 'plaster');
  assert.ok(info.w > 5 && info.d > 5 && info.h > 4, `${id}: authored building dimensions`);
  const geos = Object.values(buckets).flat();
  assert.ok(geos.length >= 10, `${id}: detailed multi-part geometry`);
  for (const geo of geos) assert.ok(geo.attributes.position.count > 0, `${id}: valid geometry`);
}

for (const [id, meta] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) {
  assert.equal(meta.id, id, `${id}: registry id matches`);
  assert.equal(meta.cls, 'break', `${id}: persistent swap-to-debris destruction`);
  assert.equal(meta.contact, 'ob', `${id}: tank collision participates`);
  assert.equal(meta.collider, true, `${id}: shell/LOS cover while intact`);
  assert.ok(['structureWood', 'structureCanvas', 'structureMetal'].includes(meta.surfaceMaterial),
    `${id}: destructible building selects a textured surface family`);
  assert.ok(meta.hw > 1 && meta.hl > 1 && meta.h > 3, `${id}: building-scale footprint`);
  const intact = meta.build(seeded());
  const broken = meta.broken(seeded(0x71f00d));
  for (const [state, geo] of [['intact', intact], ['broken', broken]]) {
    const { position, color, uv } = geo.attributes;
    assert.ok(position.count >= 120, `${id}: ${state} geometry is detailed`);
    assert.equal(color.count, position.count,
      `${id}: ${state} geometry carries baked colors for one-draw-call rendering`);
    assert.equal(uv.count, position.count,
      `${id}: ${state} geometry carries tiled UVs for its surface texture`);
    geo.computeBoundingBox();
    assert.ok(Number.isFinite(geo.boundingBox.min.x) && Number.isFinite(geo.boundingBox.max.z),
      `${id}: ${state} bounds are finite`);
  }
}

const used = new Set();
for (const mapId of MAP_IDS) {
  const props = getMapConfig(mapId).props;
  const mapTypes = [
    ...props.plan.filter((id) => STRUCTURE_BUILDERS[id]),
    ...(props.destructibleBuildings || []),
  ];
  assert.ok(mapTypes.length >= 4, `${mapId}: at least four new structure beats`);
  assert.equal(new Set(props.destructibleBuildings || []).size,
    (props.destructibleBuildings || []).length, `${mapId}: no repeated light-building family`);
  for (const id of mapTypes) {
    assert.ok(ids.includes(id), `${mapId}: ${id} is a registered new structure`);
    used.add(id);
  }
}
assert.deepEqual([...used].sort(), [...ids].sort(),
  'all twenty-four new structure types are deliberately assigned to maps');

console.log('structureKit.selftest: 24 new types; 16 destructible; all maps covered');
