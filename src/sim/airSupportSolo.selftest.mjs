// Air Support in the solo battle (air-support-270): the solo step (game/state.ts simStep) takes a crew's call from its
// action bits, fires the strike's rounds on the mode's clock into the solo shells, and nothing lands before the warning;
// the AC-130's guns engage only what the side has spotted. The network authority's side is airSupport.selftest.mjs.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';
import { AIR_SUPPORT_RULES as R, matchRulesetFor } from './matchRuleset.ts';
import { createMatchModeController } from './matchModes.ts';
import { AIR_STRIKE_BITS } from './playerActions.ts';

const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
function tank(id, team, z, isPlayer) {
  const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
  combat.equipMults = {};
  const input = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
    aimPoint: new Vector3(0, 0, 0), auxiliaryBits: 0 };
  return { id, specId: spec.id, spec, isPlayer, bot: !isPlayer, team, combat, input, state: createTankState(spec, new Vector3(0, 0, z), 0),
    visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(0, 3, z + 4), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
}
function battle() {
  const game = createGameState();
  game.ruleset = matchRulesetFor('air_support');
  const pilot = tank('pilot', 'player', -200, true), enemy = tank('e1', 'enemy', 150, false);
  game.tanks = [pilot, enemy]; game.allTanks = game.tanks; game.player = pilot;
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 3, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('pilot');
  return { game, pilot, enemy };
}
const { game, pilot, enemy } = battle();
const log = [];
const bus = createBus((name, payload) => { if (name.startsWith('mode:') || name === 'shell:hit' || name === 'munition:blast') log.push([name, game.timeS, payload]); });
const air = game.matchModeController.airSupport;
const saved = air.capture(); saved.points = [['pilot', R.points.cap], ['e1', 0]]; air.restore(saved);
const step = () => { simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider); enemy.state.pos.set(0, 0, 150); };
for (let n = 0; n < 10; n++) step();
pilot.input.aimPoint.set(0, 0, 150);
pilot.input.auxiliaryBits = AIR_STRIKE_BITS.bomb;
step();
const called = log.find(([name]) => name === 'mode:strike_called');
assert.ok(called, 'the solo step takes the call from the crew\'s action bits');
const hpBefore = enemy.combat.hp;
for (let n = 0; n < 60 * 10; n++) step();
const rounds = log.filter(([name]) => name === 'mode:strike_round');
assert.equal(rounds.length, 1, 'one bomb released');
const blasts = log.filter(([name]) => name === 'munition:blast' || name === 'shell:hit');
assert.ok(blasts.length > 0, 'the bomb bursts');
for (const [, timeS] of blasts) assert.ok(timeS >= called[2].landsS - 1e-9, `nothing lands before the warning (${timeS} < ${called[2].landsS})`);
assert.ok(enemy.combat.hp < hpBefore || enemy.combat.destroyed, 'the bomb on the mark hurts the hull under it');
assert.ok(air.pointsOf('pilot') <= R.points.cap - R.bomb.cost + 20, 'the call was paid for');
console.log(`airSupportSolo: the solo step calls, fires and lands a GBU-12 ${(blasts[0][1] - called[2].landsS).toFixed(3)} s after its ${R.bomb.warningS} s warning; ${hpBefore} -> ${Math.round(enemy.combat.hp)} hp`);
