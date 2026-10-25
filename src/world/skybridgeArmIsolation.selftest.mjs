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
  desert: '92a91c9b09712c08', // 2026-10-24 re-pinned (251), was 256cdd8034669156: the three-map restyle, merged at 3ab921d9f5 (item/maps-restyle-three-241 7fccbb2105, -> c7473e0aace7c9b4), then Sirocco Wadi's fair config at 8ad46d0826 (98d58a3c35)
  winter: '9726f7f88e679a00',
  urban: 'd55a1084385adf87',
  coastal: '0f03646938c5052d', // 2026-10-24 re-pinned (251), was 620c251249cddff8: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  autumn: 'de166fb251c75888', // 2026-10-24 re-pinned (251), was 31207b2388d2371b: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  steppe: 'f39da59d3b8341be',
  railyard: 'e48429e8b71b7471', // 2026-10-24 re-pinned (251), was 3fc793f5cfa28201: the three-map restyle, merged at 3ab921d9f5 (item/maps-restyle-three-241 7fccbb2105)
  frontier: '44b3619585ba02bd', // 2026-10-24 re-pinned (251), was 6dd169127afbaa73: Frontier Basin's rounds, merged at cdbc864cad (item/maps-frontier-saltmere-241 25f784ba5d)
  fjord: '00c2d91c5020daf5', // 2026-10-24 re-pinned (251), was 263574381b329f77: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  delta: '49812268071ab98a', // 2026-10-24 re-pinned (251), was 25bec9a7e9ab9c79: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  badlands: '8a1498dd5c9b9eb1',
  monsoon: '27aca55d5dcff83b', // 2026-10-24 re-pinned (251), was cf9a5157dfdbfe97: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  alpine: 'ad1861235bf42d36', // 2026-10-16 re-pinned, was 02f111788b73aad4: the Glacier Hinterland back in 226 (integ/226 1ad81a403, the integrator's re-revert: alpine rimH 52 -> 30); the port's merge 074713b3a left it at its pin
  caldera: '8242b97c1c879b54',
  foundry: '82760ac67681631c', // 2026-10-17 re-pinned, was 9d91c513ba3f7e1c: MAPS Lane A's Ironworks re-landing (item/maps-ironworks-227, round d4b718bd6): the furnace line's floor, a level apron cut into the ore berm at (-74, -29), 48 x 22 m, level 2.4, bank 14 m (without it the old hash holds)
  ruinspires: 'f8fb31019a15a8f3',
  blackglass: '021077d976df4f0e', // 2026-10-24 re-pinned (251), was 5e7af900683ef1fb: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  titan_gorge: '485e822b044f058f',
  polders: '580b6176b4fff436', // 2026-10-25 re-pinned (252), was 5f161f4969d0c585 (251's waterline ramp from 0.06, now back to 0.12; 251's base was the water banks' 9ccff02bd3e55dae): the narrow drain's station 0 at 0.21, not 0.20 (liquidMarshSurface: its inlet's rise at 0.756; the ramp graded the oxbow bridge's foot past authoredChannels' 0.90)
  copper_mesa: 'c87554e04dfa5e6d', // 2026-10-24 re-pinned (251), was e691d76f1096fc14: the hinterland horizons, merged at f7b257ce67 (horizons-hinterland-240 9bc119439e)
  airfield: '4f534969f5970ae0', // 2026-10-16 re-pinned, was 794c991f91b951fa: MAPS Kestrel Airfield rebuild (integ/226 af8e48d28, item/maps-kestrel 284ef2ffe); the port's merge 074713b3a left it at its pin
  oasis: 'c53e9825cc51eb7a', // 2026-10-24 re-pinned (251), was 156b434394ea66e7: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  whiteout: '45c4a24901c001e1',
  orchard: '9f6683777ae5b79b',
  longleaf: '0cf4d34bac0555b1',
  mangrove: 'e2749e78f6cbf7fe', // 2026-10-24 re-pinned (251), was 9d855cba612b1012: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  saltwind: '74b5e80e6e993b3f', // 2026-10-24 re-pinned (251), was dd2ba94bc4fd2909: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
  reservoir: '23e734e5361bb478', // 2026-10-24 re-pinned (251), was 445afcbee9db735b: GROUND water banks, merged at 0c4da2c505 (item/ground-water-banks-230 2807b6d767): the banks graded from a lip over the water's top. The 10-21 pins were taken before the lane's last bank change and never held on main: its first parent read the integ/226 values
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
