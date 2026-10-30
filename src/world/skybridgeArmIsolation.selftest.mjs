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
  desert: '1445b738cb70bac0', // 2026-10-29 re-pinned (264 integrator), was 891caf0f7f23e028: world-reds-264's Sirocco apron 1 on a 24 m bank (814a41c7dc, its zones back on their aprons); red on the lane's own head
  winter: '9726f7f88e679a00',
  urban: 'd55a1084385adf87',
  coastal: '595cfd950d2af04f', // 2026-10-25 re-pinned (253), was 0f03646938c5052d: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  autumn: 'ed0716f53af187df', // 2026-10-25 re-pinned (253), was de166fb251c75888: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  steppe: '0e275757b3e79111', // 2026-10-25 re-pinned (253), was f39da59d3b8341be: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  railyard: '1bf44a69727a965d', // 2026-10-25 re-pinned (253), was e48429e8b71b7471: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  frontier: '44b3619585ba02bd', // 2026-10-24 re-pinned (251), was 6dd169127afbaa73: Frontier Basin's rounds, merged at cdbc864cad (item/maps-frontier-saltmere-241 25f784ba5d)
  fjord: '00c2d91c5020daf5', // 2026-10-24 re-pinned (251), was 263574381b329f77: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  delta: '49812268071ab98a', // 2026-10-24 re-pinned (251), was 25bec9a7e9ab9c79: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  badlands: 'a1ab15731238cb6e', // 2026-10-25 re-pinned (253), was 8a1498dd5c9b9eb1: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  monsoon: '0a5fb791b1a36618', // 2026-10-25 re-pinned (253), was 27aca55d5dcff83b: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  alpine: '12b2c6a0697295fb', // 2026-10-25 re-pinned (253), was ad1861235bf42d36: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  caldera: 'ccaf228e6a7f7eb4', // 2026-10-25 re-pinned (253), was 8242b97c1c879b54: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  foundry: '82760ac67681631c', // 2026-10-17 re-pinned, was 9d91c513ba3f7e1c: MAPS Lane A's Ironworks re-landing (item/maps-ironworks-227, round d4b718bd6): the furnace line's floor, a level apron cut into the ore berm at (-74, -29), 48 x 22 m, level 2.4, bank 14 m (without it the old hash holds)
  ruinspires: 'f8fb31019a15a8f3',
  blackglass: '4aa6c62512d680c1', // 2026-10-25 re-pinned (253), was 021077d976df4f0e: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  titan_gorge: '485e822b044f058f',
  polders: '58c527805ac01a0d', // 2026-10-25 re-pinned (252 integ), was a487ebeb56d7d8b0 (253's pinned-math ruling) and 580b6176b4fff436 (world-receipts-251 on the old math): both together, the pinned-math terrain under 252's waterline ramp back at 0.12 and the narrow drain's station 0 at 0.21
  copper_mesa: 'c87554e04dfa5e6d', // 2026-10-24 re-pinned (251), was e691d76f1096fc14: the hinterland horizons, merged at f7b257ce67 (horizons-hinterland-240 9bc119439e)
  airfield: '4f534969f5970ae0', // 2026-10-16 re-pinned, was 794c991f91b951fa: MAPS Kestrel Airfield rebuild (integ/226 af8e48d28, item/maps-kestrel 284ef2ffe); the port's merge 074713b3a left it at its pin
  oasis: 'c53e9825cc51eb7a', // 2026-10-24 re-pinned (251), was 156b434394ea66e7: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  whiteout: '45c4a24901c001e1',
  orchard: '9f6683777ae5b79b',
  longleaf: '0cf4d34bac0555b1',
  mangrove: 'd9fc87a9abaea80b', // 2026-10-25 re-pinned (253), was e2749e78f6cbf7fe: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  saltwind: '74b5e80e6e993b3f', // 2026-10-24 re-pinned (251), was dd2ba94bc4fd2909: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  reservoir: 'b6f9c0f2907d0fb0', // 2026-10-25 re-pinned (253), was 23e734e5361bb478: the pinned-math ruling (the terrain's sin/cos/atan2/pow/exp on src/sim/detMath.ts)
  mars: 'b760ed9717fba45a',
  moon: '0aa6b7fb664e549a', // 2026-10-18 re-pinned, was 7ce00910e42eb981: MAPS Earthrise 228 rebuild (item/maps-earthrise-228 8018118a90, integ/228 27adeab6a; the owner's ask, independent blind 16-0): the moon's landforms and works rebuilt
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
