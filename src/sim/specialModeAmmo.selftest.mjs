// Endless rounds in the special modes (owner 2026-10-17: "for special modes like juggernaut, ammo should be endless"):
// the competitive and realistic modes keep the vehicle's own loadout, every special and arcade mode plays unlimited
// rounds, the rule card says so, a cache under unlimited rounds is always a repair, and a fired channel refills on the
// network authority's fire path (the solo fire site calls the same refillUnlimitedAmmunition).
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { GAME_MODE_IDS } from './matchModes.ts';
import { cacheHealChance, matchRulesetFor, refillUnlimitedAmmunition, rulesetLines } from './matchRuleset.ts';

const AMMO = {
  standard: 'spec', capture_the_flag: 'spec', zone_control: 'spec', realistic: 'spec',
  turbo_ball: 'unlimited', gun_game: 'unlimited', ac130: 'unlimited',
  juggernaut: 'unlimited', infected: 'unlimited', endless_horde: 'unlimited', mars: 'unlimited', drone: 'unlimited', frontline_assault: 'unlimited',
};
assert.deepEqual(Object.keys(AMMO).sort(), [...GAME_MODE_IDS].sort(), 'every mode is classed');
for (const mode of GAME_MODE_IDS) {
  const rules = matchRulesetFor(mode);
  assert.equal(rules.ammo, AMMO[mode], `${mode}: ${AMMO[mode]} rounds`);
  assert.equal(rulesetLines(rules).some((line) => line.key === 'ammoUnlimited'), AMMO[mode] === 'unlimited', `${mode}: the card states unlimited rounds exactly when they are`);
  assert.equal(cacheHealChance(rules, 1) === 1, AMMO[mode] === 'unlimited', `${mode}: unlimited rounds make every cache a repair`);
  // an arrangement never changes the ammunition class
  assert.equal(matchRulesetFor(mode, null, { allies: 2, enemies: 9 }).ammo, AMMO[mode], `${mode}: arranged sides keep the class`);
}
assert.equal(matchRulesetFor('juggernaut', null, { juggernautRole: 'hunter' }).ammo, 'unlimited', 'both Juggernaut roles play unlimited rounds');
assert.equal(matchRulesetFor('mars', null, { marsGravity: 'moon', marsCaches: 'frequent' }).ammo, 'unlimited');
assert.equal(matchRulesetFor('frontline_assault', { difficulty: 6, enemy: 'russia' }).ammo, 'unlimited', 'a campaign operation keeps unlimited rounds');

{
  const combat = { ammo: [30, 10, 4], ammoCapacity: [30, 10, 4] };
  combat.ammo[2] = 3;
  refillUnlimitedAmmunition(matchRulesetFor('juggernaut'), combat, 2);
  assert.deepEqual(combat.ammo, [30, 10, 4], 'the fired channel refills');
  combat.ammo[0] = 29;
  refillUnlimitedAmmunition(matchRulesetFor('zone_control'), combat, 0);
  assert.equal(combat.ammo[0], 29, 'a competitive mode never refills');
}

// the authority's fire path: the boss fires; its channel is full again after the shot in Juggernaut, one round lighter
// in Standard
for (const mode of ['juggernaut', 'standard', 'infected', 'endless_horde']) {
  const match = createAuthoritativeMatch({ gameMode: mode, countdownS: 0, mapId: 'verdant', seed: 31, players: [
    { id: 'pilot', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -60, yaw: 0 } },
    { id: 'hostile', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, spawn: { x: 0, z: 140, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const pilot = match.entityById.get('pilot');
  const capacity = pilot.combat.ammoCapacity[0];
  const input = { throttle: 0, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['pilot', input]]);
  for (let i = 0; i < 30; i++) match.step({ dt: 1 / 60, inputs });
  let fired = 0;
  input.fire = true;
  for (let i = 0; i < 90 && !fired; i++) {
    match.step({ dt: 1 / 60, inputs });
    for (const event of match.eventsForViewer('pilot')) if (event.type === 'shell_fired' && event.shooterId === 'pilot') fired++;
    match.afterEventBroadcast();
  }
  assert.equal(fired, 1, `${mode}: the pilot fired`);
  assert.equal(pilot.combat.ammo[0], matchRulesetFor(mode).ammo === 'unlimited' ? capacity : capacity - 1,
    `${mode}: ${matchRulesetFor(mode).ammo} rounds after one shot`);
}

console.log('specialModeAmmo: competitive and realistic modes keep spec rounds; every special and arcade mode plays unlimited rounds, its card says so, its caches repair, and the authority refills a fired channel');
