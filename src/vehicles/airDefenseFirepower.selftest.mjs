// 2026-11-06 air-defence firepower (airDefenseFirepower.ts; the owner: "a super super high fire rate and a tonn of ammo. a ton
// of rockets too multiple rockts per launcher"): every air-defence vehicle's cannon at the simulation's 0.05 s floor, its
// sustained output twice the authored gun's, its rounds six times the authored stowage, its rack firing whole in salvos
// with three loads, the family weighed as its own balance cohort; the M163's Vulcan in 300-round bursts, and (270) at the
// rotary floor, one round a tick, the fleet's only rotary gun.
import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { sustainedPrimaryDpm } from './balanceAudit.ts';
import { FIRE_CYCLE_FLOOR_S, ROTARY_FIRE_CYCLE_FLOOR_S, fireCycleFloorS } from '../sim/fireCycleFloor.ts';

const AIR_DEFENCE = ['m163_vads', 'tunguska_m', 'pantsir_s1', 'gepard_1a2', 'pgz95', 'pgz09', 'type87_aw', 'marksman_t55',
  'itpsv_leopard2', 'lvkv9040', 'k30_biho', 'pza_loara'];
// each rack and its salvo: every tube a launch
const RACKS = { tunguska_m: 8, pantsir_s1: 12, pgz95: 4 };

for (const id of AIR_DEFENCE) {
  const spec = getSpec(id);
  const cannon = spec.gun.shells.filter((round) => !round.guided);
  assert.ok(cannon.length >= 2, `${id}: two cannon rounds`);
  const floorS = fireCycleFloorS(spec.gun.autoloader);
  for (const round of cannon) {
    assert.equal(round.reloadS, floorS, `${id} ${round.name}: the floor cycle`);
    assert.ok(round.count >= 240, `${id} ${round.name}: a ton of rounds (${round.count})`);
  }
  if (spec.gun.autoloader) assert.equal(spec.gun.autoloader.intraClipS, floorS, `${id}: the burst at the floor cycle`);
  else assert.equal(spec.gun.reloadS, floorS, `${id}: the belt at the floor cycle`);
  const dpm = sustainedPrimaryDpm(spec);
  assert.ok(dpm > 18000 && dpm < 23000, `${id}: twice the twin 35 mm's sustained ~10,500 a minute (${Math.round(dpm)})`);
  assert.equal(spec.balanceCohort, 'air-defence', `${id}: weighed among the air defence`);
  const missile = spec.gun.shells.find((round) => round.guided);
  if (RACKS[id]) {
    assert.ok(missile, `${id}: its missile rack`);
    assert.deepEqual(spec.gun.launcherSalvo, { rounds: RACKS[id], intervalS: 0.15 }, `${id}: the rack fires whole`);
    assert.equal(missile.count, RACKS[id] * 3, `${id}: three loads of missiles`);
    assert.equal(missile.reloadS, 6, `${id}: the rack reloads in 6 s`);
  } else {
    assert.equal(missile, undefined, `${id}: guns only`);
    assert.equal(spec.gun.launcherSalvo, undefined, `${id}: no salvo`);
  }
}

// the M163's Vulcan (270): 300-round bursts at the rotary floor, one round a tick (3,600 a minute, 5 s a burst), a 2 s
// reset, each round's damage cut to hold twice the authored gun's output (7 of the API's 20: ~18,000 a minute against the
// authored ~9,550, the whole-damage rounding's 6 % under twice)
const m163 = getSpec('m163_vads');
assert.deepEqual(m163.gun.autoloader, { magazineSize: 300, intraClipS: ROTARY_FIRE_CYCLE_FLOOR_S, fullReloadS: 2, rotary: true },
  'm163_vads: the burst limiter at the rotary floor');
assert.equal(m163.gun.reloadS, 2, 'm163_vads: the headline reload is the burst reset');
assert.deepEqual(m163.gun.shells.map((round) => [round.name, round.dmg, round.count]),
  [['M53 API', 7, 4200], ['M56 HEI', 8, 8400]], 'm163_vads: its rounds');
assert.deepEqual(m163.gun.shells.map((round) => round.maxLifetimeS), [3, 3], 'm163_vads: each round flies 3 s, ~3.1 km');
const authoredDpm = 20 * 60 * 60 / (4 + 59 * 0.06);
assert.ok(Math.abs(sustainedPrimaryDpm(m163) / authoredDpm - 2) < 0.12, `m163_vads: about twice the authored output (${
  (sustainedPrimaryDpm(m163) / authoredDpm).toFixed(2)}x)`);
// rotary is opt-in: every other vehicle's guns keep the 0.05 s floor
const rotary = ALL_TANK_IDS.filter((id) => getSpec(id).gun.autoloader?.rotary);
assert.deepEqual(rotary, ['m163_vads'], 'the M163 is the only rotary gun');
for (const id of AIR_DEFENCE.filter((id) => id !== 'm163_vads')) {
  assert.equal(fireCycleFloorS(getSpec(id).gun.autoloader), FIRE_CYCLE_FLOOR_S, `${id}: the 0.05 s floor`);
}
// the Tunguska-M's 2A38M pair: a third of each round's damage at six times the rate
assert.deepEqual(getSpec('tunguska_m').gun.shells.map((round) => [round.name, round.dmg, round.count]),
  [['3UBR8 APDS', 17, 5712], ['9M311M', 360, 24], ['3UOF8 HE-I', 16, 5712]], 'tunguska_m: its rounds');

console.log(`airDefenseFirepower.selftest: ${AIR_DEFENCE.length} air-defence vehicles at the floor (the M163 at one round a tick), `
  + `twice the sustained output, six times the rounds, ${Object.keys(RACKS).length} racks firing whole PASS`);
