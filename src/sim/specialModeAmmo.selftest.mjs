// Endless rounds in the special modes (owner 2026-10-17: "for special modes like juggernaut, ammo should be endless"):
// the competitive and realistic modes keep the vehicle's own loadout, every special and arcade mode plays unlimited
// rounds, the rule card says so, a cache under unlimited rounds is always a repair (Gravity Mode's timed drop through the
// controller here; zombieBalance and matchModes pin the Horde's), and a fired channel refills on both fire paths: the
// network authority's and the solo battle's (game/state.ts tryFire).
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState } from './damage.ts';
import { createMatchModeController, GAME_MODE_IDS } from './matchModes.ts';
import { createTankState } from './movement.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';
import { cacheHealChance, matchRulesetFor, refillUnlimitedAmmunition, rulesetLines, rulesetUnlimitedFor } from './matchRuleset.ts';

const AMMO = {
  standard: 'spec', capture_the_flag: 'spec', zone_control: 'spec', realistic: 'spec',
  turbo_ball: 'unlimited', gun_game: 'unlimited', ac130: 'unlimited',
  juggernaut: 'unlimited', infected: 'unlimited', endless_horde: 'unlimited', mars: 'unlimited', drone: 'unlimited', frontline_assault: 'unlimited',
  proving_ground: 'unlimited', // 230: the test drive's range (matchRuleset.ts PROVING_GROUND ammo: 'unlimited')
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

// Per entity (critic r3): the one read both refill sites, both shell-card builders and the loader audio use. Unlimited
// rounds are every seat's in an unlimited mode, except the AC-130's escorts: only the gunship refills there.
for (const mode of GAME_MODE_IDS) {
  const rules = matchRulesetFor(mode);
  const gunshipMode = rules.aerial === 'gunship';
  assert.equal(rulesetUnlimitedFor(rules, {}), rules.ammo === 'unlimited' && !gunshipMode, `${mode}: a ground seat`);
  assert.equal(rulesetUnlimitedFor(rules, { aerial: { kind: 'gunship' } }), rules.ammo === 'unlimited', `${mode}: the gunship`);
  assert.equal(rulesetUnlimitedFor(rules, { aerial: { kind: 'drone' } }), rules.ammo === 'unlimited' && !gunshipMode,
    `${mode}: a drone carrier is a ground seat`);
}
assert.equal(rulesetUnlimitedFor(null, { aerial: { kind: 'gunship' } }), false, 'no ruleset: the vehicle\'s own loadout');

// the authority's fire path: the boss fires; its channel is full again after the shot in Juggernaut, one round lighter
// in Standard and for an AC-130 escort (a bravo human seat: a ground tank beside the alpha gunship, which never refills)
for (const mode of ['juggernaut', 'standard', 'infected', 'endless_horde', 'ac130']) {
  const escort = mode === 'ac130';
  const match = createAuthoritativeMatch({ gameMode: mode, countdownS: 0, mapId: 'verdant', seed: 31, players: [
    { id: 'pilot', specId: 'm1a1_abrams_hc', team: escort ? 'bravo' : 'alpha', spawn: { x: 0, z: -60, yaw: 0 } },
    { id: 'hostile', specId: 'm1a1_abrams_hc', team: escort ? 'alpha' : 'bravo', bot: true, spawn: { x: 0, z: 140, yaw: Math.PI } },
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
  assert.equal(pilot.aerial?.kind === 'gunship', false, `${mode}: the pilot is a ground seat`);
  assert.equal(pilot.combat.ammo[0], matchRulesetFor(mode).ammo === 'unlimited' && !escort ? capacity : capacity - 1,
    `${mode}: ${escort ? 'an escort spends its' : matchRulesetFor(mode).ammo} rounds after one shot`);
}

// Gravity Mode's timed caches through the controller (matchModes spawnPickup reads cacheHealChance; Mars has no Horde
// state to carry a heal share): ten minutes of drops on both cache settings are all repairs, and the live list holds no
// ammunition cache, which unlimited rounds could never take and which would hold one of the twelve cache slots. A
// finite-rounds Mars table splits its drops at the same spots: the draw is kept, so the seeded stream does not shift.
{
  const tank = (id, team, x, z, bot) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [24, 16, 6], ammoCapacity: [24, 16, 6] } });
  const marsDrops = (ruleset) => {
    const drops = [];
    const match = createMatchModeController({ mode: 'mars', seed: 42, ruleset, terrainHeight: () => 0, revive() {},
      entities: [tank('pilot', 'player', 0, -100, false), tank('wing', 'player', 15, -100, true), tank('foe', 'enemy', 0, 100, true)],
      emit(type, payload) { if (type === 'mode_pickup_spawned') drops.push(payload); } });
    for (let timeS = 0; timeS <= 600; timeS += 0.5) assert.equal(match.step(0.5, timeS), null, 'the run reaches ten minutes');
    return { drops, live: match.state.pickups.filter((pickup) => pickup.active) };
  };
  for (const [caches, least] of [['standard', 20], ['frequent', 40]]) {
    const ruleset = matchRulesetFor('mars', null, { marsCaches: caches });
    const { drops, live } = marsDrops(ruleset);
    assert.ok(drops.length >= least, `Mars ${caches}: ${drops.length} caches dropped in ten minutes`);
    assert.deepEqual([...new Set(drops.map((drop) => drop.kind))], ['heal'], `Mars ${caches}: every cache is a repair`);
    assert.equal(live.length, 12, `Mars ${caches}: the cache list fills`);
    assert.ok(live.every((pickup) => pickup.kind === 'heal'), `Mars ${caches}: no ammunition cache holds a slot`);
    const finite = marsDrops({ ...ruleset, ammo: 'spec' }).drops;
    assert.deepEqual(new Set(finite.map((drop) => drop.kind)), new Set(['heal', 'ammo']), `Mars ${caches}: finite rounds split the drops`);
    assert.deepEqual(finite.map((drop) => [drop.x, drop.z]), drops.map((drop) => [drop.x, drop.z]),
      `Mars ${caches}: the drops land at the same spots either way`);
  }
}

// the solo battle's fire path (game/state.ts tryFire): the same shot refills the channel in Juggernaut and the other
// special modes and spends one round in Standard and for an AC-130 escort (a ground seat: no gunship view)
for (const mode of ['juggernaut', 'standard', 'infected', 'endless_horde', 'mars', 'ac130']) {
  const spec = getSpec('m1a3'), combat = createCombatState(spec), game = createGameState();
  game.ruleset = matchRulesetFor(mode);
  const input = { throttle: 0, steer: 0, brake: true, fire: true, shellSlot: 0, aimYaw: 0, aimPitch: 0.25, aimDistance: 300, actionBits: 0 };
  const entity = { id: 'pilot', specId: spec.id, spec, isPlayer: true, team: 'player', combat, input,
    state: createTankState(spec, new Vector3(), 0),
    visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(0, 5, 10), gunDirWorld: (out) => out.set(0, 0.25, 1).normalize(), recoilKick() {} } };
  combat.equipMults = {};
  game.tanks = [entity]; game.allTanks = [entity]; game.tankById.set(entity.id, entity);
  const capacity = combat.ammoCapacity[0];
  assert.equal(combat.ammo[0], capacity, `solo ${mode}: a full channel before the shot`);
  let fired = 0;
  const bus = createBus((name, payload) => { if (name === 'shell:fired' && payload.shooterId === 'pilot') fired++; });
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider);
  assert.equal(fired, 1, `solo ${mode}: the pilot fired`);
  assert.equal(combat.ammo[0], rulesetUnlimitedFor(game.ruleset, entity) ? capacity : capacity - 1,
    `solo ${mode}: ${game.ruleset.ammo} rounds after one shot`);
  assert.equal(combat.ammo[0] === capacity, mode !== 'standard' && mode !== 'ac130', `solo ${mode}: refilled exactly where it should`);
}

console.log('specialModeAmmo: competitive and realistic modes keep spec rounds; every special and arcade mode plays unlimited rounds, its card says so, its caches repair (Horde and Gravity Mode drops), and both the authority and the solo battle refill a fired channel — the AC-130 gunship\'s alone, never an escort\'s (rulesetUnlimitedFor)');
