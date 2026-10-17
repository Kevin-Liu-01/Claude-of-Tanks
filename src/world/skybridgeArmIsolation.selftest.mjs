// skybridgeArmIsolation.selftest.mjs — the horizons stream's Skybridge port (2026-10-16; the coordinator's terrain.ts
// grant): the map-revival lane's rounds 4-8 (Lake Powell's arm, its meander, the path ridges and the 'carve' union in
// terrain.ts, the lake candidate index) moved Skybridge's heights and must move no other map's. Every other map's
// heightfield, sampled on a 16 m grid over the square (65 x 65, seed 1337), hashes to its value on integ/226 d4b0d0fcb,
// before the port. When a map's own terrain changes later, re-pin its row here with the reason (each re-pin bisected:
// the hash at the cause merge's first parent is the old pin, at the merge the new one).
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
  autumn: '7729ce23aed0d036', // 2026-10-17 re-pinned, was 5647eccd5ae5f182: MAPS Lane A's autumn backlog (item/maps-backlog-227): the f3 hedge-bank ridge at (128, 59) retired (its 1.6 m faces were the steep cells inside zone 2's disc); the ford green stays at (154, 54)
  steppe: 'f39da59d3b8341be',
  railyard: '3fc793f5cfa28201',
  frontier: '6dd169127afbaa73',
  fjord: '844ae8b1facb58b7',
  delta: 'caed446bb84fde07', // 2026-10-16 re-pinned, was 125801425dddc92c: GROUND Delta stacks (integ/226 91aebdbf2, item/ground-delta-stacks cf4abb8f5: the second paddy row keeps its west paddy); the port's merge 074713b3a left it at its pin
  badlands: '8a1498dd5c9b9eb1',
  monsoon: '84b5ee48c992bafc', // 2026-10-16 re-pinned, was ee7f16856debcd25: MAPS Monsoon Ridge Kohima (integ/226 d8a514543, item/maps-monsoon efaafd74c; merged before the port, which was cut from d4b0d0fcb); the port's own side 074713b3a^2 still hashes to the old pin
  alpine: 'ad1861235bf42d36', // 2026-10-16 re-pinned, was 02f111788b73aad4: the Glacier Hinterland back in 226 (integ/226 1ad81a403, the integrator's re-revert: alpine rimH 52 -> 30); the port's merge 074713b3a left it at its pin
  caldera: '8242b97c1c879b54',
  foundry: '82760ac67681631c', // 2026-10-17 re-pinned, was 9d91c513ba3f7e1c: MAPS Lane A's Ironworks re-landing (item/maps-ironworks-227, round d4b718bd6): the furnace line's floor, a level apron cut into the ore berm at (-74, -29), 48 x 22 m, level 2.4, bank 14 m (without it the old hash holds)
  ruinspires: 'f8fb31019a15a8f3',
  blackglass: '05d5d86640658a70',
  titan_gorge: '485e822b044f058f',
  polders: 'cdb827a60a297964',
  copper_mesa: 'e691d76f1096fc14',
  airfield: '4f534969f5970ae0', // 2026-10-16 re-pinned, was 794c991f91b951fa: MAPS Kestrel Airfield rebuild (integ/226 af8e48d28, item/maps-kestrel 284ef2ffe); the port's merge 074713b3a left it at its pin
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
