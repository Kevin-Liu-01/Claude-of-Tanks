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

// ---- (improve-271 plan 032) a later Air Support battle on the same page game aims at its own ground and announces its
// rounds on its own bus: the fire context the first battle built must not keep that battle's world and bus
const fieldOf = (height) => {
  const field = { reads: 0, getHeightAt: () => { field.reads++; return height; }, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  return field;
};
const worldA = { heightField: fieldOf(0), raycast: () => null }, worldB = { heightField: fieldOf(50), raycast: () => null };
const logA = [], logB = [];
const busA = createBus((name, payload) => { if (name === 'mode:strike_round') logA.push(payload); });
const busB = createBus((name, payload) => { if (name === 'mode:strike_round') logB.push(payload); });
let enemyY = 0;
const stepOn = (world, stepBus) => { simStep(game, stepBus, world, null, collider); enemy.state.pos.set(0, enemyY, 150); };
// the first battle above stepped this game on its own world and bus; the next battle, on world B, is the same page game
const savedB = air.capture(); savedB.points = [['pilot', R.points.cap], ['e1', 0]]; air.restore(savedB);
for (let n = 0; n < 10; n++) stepOn(worldA, busA);
for (const t of game.tanks) t.state.pos.y = 50;
enemyY = 50;
pilot.input.aimPoint.set(0, 50, 150);
pilot.input.auxiliaryBits = AIR_STRIKE_BITS.artillery;
const readsA = worldA.heightField.reads;
for (let n = 0; n < 60 * 12; n++) stepOn(worldB, busB);
assert.equal(logA.length, 0, 'no round of the second battle is announced on the first battle\'s bus');
assert.ok(logB.length > 0, `the second battle's rounds are announced on its own bus (${logB.length})`);
assert.ok(worldB.heightField.reads > 0, 'the rounds aim at the second battle\'s ground');
// (the first world's field is still read by its own deformation wrapper's owner only while it steps: none after the switch)
assert.equal(worldA.heightField.reads, readsA, `nothing of the second battle samples the first battle's ground (${worldA.heightField.reads - readsA} reads)`);

console.log(`airSupportSolo: the solo step calls, fires and lands a GBU-12 ${(blasts[0][1] - called[2].landsS).toFixed(3)} s after its ${R.bomb.warningS} s warning; ${hpBefore} -> ${Math.round(enemy.combat.hp)} hp; a second battle on another world aims its ${logB.length} rounds at its own ground and announces them on its own bus`);
