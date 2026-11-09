// 2026-11-06 air-defence firepower (airDefenseFirepower.ts; the owner: "a super super high fire rate and a tonn of ammo. a ton
// of rockets too multiple rockts per launcher"): every air-defence vehicle's cannon at the simulation's 0.05 s floor, its
// sustained output twice the authored gun's, its rounds six times the authored stowage, its rack firing whole in salvos
// with three loads, the family weighed as its own balance cohort; the M163's Vulcan in 300-round bursts.
import assert from 'node:assert/strict';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
import { sustainedPrimaryDpm } from './balanceAudit.ts';

const AIR_DEFENCE = ['m163_vads', 'tunguska_m', 'pantsir_s1', 'gepard_1a2', 'pgz95', 'pgz09', 'type87_aw', 'marksman_t55',
  'itpsv_leopard2', 'lvkv9040', 'k30_biho', 'pza_loara'];
// each rack and its salvo: every tube a launch
const RACKS = { tunguska_m: 8, pantsir_s1: 12, pgz95: 4 };

for (const id of AIR_DEFENCE) {
  const spec = getSpec(id);
  const cannon = spec.gun.shells.filter((round) => !round.guided);
  assert.ok(cannon.length >= 2, `${id}: two cannon rounds`);
  for (const round of cannon) {
    assert.equal(round.reloadS, 0.05, `${id} ${round.name}: the floor cycle`);
    assert.ok(round.count >= 240, `${id} ${round.name}: a ton of rounds (${round.count})`);
  }
  if (spec.gun.autoloader) assert.equal(spec.gun.autoloader.intraClipS, 0.05, `${id}: the burst at the floor cycle`);
  else assert.equal(spec.gun.reloadS, 0.05, `${id}: the belt at the floor cycle`);
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

// the M163's Vulcan: 300-round bursts at the floor, a 2 s reset, the authored 20 mm's damage nearly kept
const m163 = getSpec('m163_vads');
assert.deepEqual(m163.gun.autoloader, { magazineSize: 300, intraClipS: 0.05, fullReloadS: 2 }, 'm163_vads: the burst limiter');
assert.equal(m163.gun.reloadS, 2, 'm163_vads: the headline reload is the burst reset');
assert.deepEqual(m163.gun.shells.map((round) => [round.name, round.dmg, round.count]),
  [['M53 API', 18, 4200], ['M56 HEI', 20, 8400]], 'm163_vads: its rounds');
// the Tunguska-M's 2A38M pair: a third of each round's damage at six times the rate
assert.deepEqual(getSpec('tunguska_m').gun.shells.map((round) => [round.name, round.dmg, round.count]),
  [['3UBR8 APDS', 17, 5712], ['9M311M', 360, 24], ['3UOF8 HE-I', 16, 5712]], 'tunguska_m: its rounds');

console.log(`airDefenseFirepower.selftest: ${AIR_DEFENCE.length} air-defence vehicles at the 0.05 s floor, twice the sustained `
  + `output, six times the rounds, ${Object.keys(RACKS).length} racks firing whole PASS`);
