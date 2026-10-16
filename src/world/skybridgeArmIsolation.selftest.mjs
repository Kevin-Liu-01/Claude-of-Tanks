// skybridgeArmIsolation.selftest.mjs — the horizons stream's Skybridge port (2026-10-16; the coordinator's terrain.ts
// grant): the map-revival lane's rounds 4-8 (Lake Powell's arm, its meander, the path ridges and the 'carve' union in
// terrain.ts, the lake candidate index) moved Skybridge's heights and must move no other map's. Every other map's
// heightfield, sampled on a 16 m grid over the square (65 x 65, seed 1337), hashes to its value on integ/226 d4b0d0fcb,
// before the port. When a map's own terrain changes later, re-pin its row here with the reason.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const BEFORE = {
  verdant: '00c9b6068a16a463',
  desert: '256cdd8034669156',
  winter: '9726f7f88e679a00',
  urban: 'd55a1084385adf87',
  coastal: 'bd0869e3b6f74cbd',
  autumn: '5647eccd5ae5f182',
  steppe: 'f39da59d3b8341be',
  railyard: '3fc793f5cfa28201',
  frontier: '6dd169127afbaa73',
  fjord: '844ae8b1facb58b7',
  delta: '125801425dddc92c',
  badlands: '8a1498dd5c9b9eb1',
  monsoon: 'ee7f16856debcd25',
  alpine: '02f111788b73aad4',
  caldera: '8242b97c1c879b54',
  foundry: '9d91c513ba3f7e1c',
  ruinspires: 'f8fb31019a15a8f3',
  blackglass: '05d5d86640658a70',
  titan_gorge: '485e822b044f058f',
  polders: 'cdb827a60a297964',
  copper_mesa: 'e691d76f1096fc14',
  airfield: '794c991f91b951fa',
  oasis: '6901cc139213a499',
  whiteout: '45c4a24901c001e1',
  orchard: '9f6683777ae5b79b',
  longleaf: '0cf4d34bac0555b1',
  mangrove: '0f287d0f5ff5b30e',
  saltwind: '590eec2375e191ba',
  reservoir: '863f6b8225ce9365',
  mars: 'b760ed9717fba45a',
  moon: '7ce00910e42eb981',
  cliffbridge: '073028df8cb5fabb',
};
const changed = [];
for (const id of MAP_IDS) {
  if (id === 'skybridge') continue;
  assert.ok(BEFORE[id], `${id}: a pinned heightfield (a new map takes its row)`);
  const hf = createHeightField(1337, getMapConfig(id));
  const v = new Float64Array(65 * 65);
  let k = 0;
  for (let j = 0; j <= 64; j++) for (let i = 0; i <= 64; i++) v[k++] = hf.getHeightAt(-512 + i * 16, -512 + j * 16);
  const digest = createHash('sha256').update(Buffer.from(v.buffer)).digest('hex').slice(0, 16);
  if (digest !== BEFORE[id]) changed.push(`${id} ${digest} (was ${BEFORE[id]})`);
}
assert.deepEqual(changed, [], 'every other map\'s heightfield is byte-identical to integ/226 before the Skybridge port');
// the port's hooks are Skybridge's alone: no other map authors a path ridge or a carve union
for (const id of MAP_IDS) {
  if (id === 'skybridge') continue;
  const forms = getMapConfig(id).terrain?.landforms ?? [];
  assert.ok(!forms.some((f) => f.path || f.widths || f.union === 'carve'), `${id}: no path ridge or carve union`);
}
console.log(`skybridgeArmIsolation.selftest: ${MAP_IDS.length - 1} other maps' heightfields byte-identical to integ/226; the arm's hooks Skybridge's alone`);
