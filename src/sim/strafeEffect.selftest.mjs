// strafeEffect.selftest.mjs — the strafing run's bite (air-support-275; owner 2026-11-21: "make strafing a lot more
// effective than it is right now"). The solo step (game/state.ts simStep) flies one A-10 run down a lane with a light
// vehicle (a BMP-2) and an MBT (an M1A1 HC) parked in it, through the real projectile, armour and module pipeline, and
// pins what it does with the ruleset's numbers: the BMP-2 takes enough rounds to lose at least half its hull, the MBT
// takes rounds through its engine deck (a tenth of its hull at least, and a module). The same run with the 270 figures (28 rounds over a 140 m lane in 1.6 s at a 15-degree dive from
// 120 m, a random 5 m spread, 110 hp and the calibre's module damage a round, no laying on hulls) is printed beside it,
// as the receipt the lane's numbers are stated against.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';
import { AIR_STRIKE_WEAPONS, AIR_SUPPORT_RULES as R, matchRulesetFor } from './matchRuleset.ts';
import { createMatchModeController } from './matchModes.ts';
import { AIR_STRIKE_BITS } from './playerActions.ts';

const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
function tank(id, specId, team, x, z, yaw, isPlayer) {
  const spec = getSpec(specId), combat = createCombatState(spec);
  combat.equipMults = {};
  const input = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
    aimPoint: new Vector3(0, 0, 0), auxiliaryBits: 0 };
  return { id, specId: spec.id, spec, isPlayer, bot: !isPlayer, team, combat, input, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 3, z + 4), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
}

/** One run with `airSupport` rules; the BMP-2 sits 25 m short of the mark and the M1A1 15 m past it, both in the lane. */
function run(airSupport) {
  const game = createGameState();
  game.ruleset = { ...matchRulesetFor('air_support'), airSupport };
  const pilot = tank('pilot', 'm1a1_abrams_hc', 'player', 0, -300, 0, true);
  const light = tank('ifv', 'bmp2', 'enemy', 1.5, 125, 0.9, false);
  const mbt = tank('mbt', 'm1a1_abrams_hc', 'enemy', -1, 165, -0.4, false);
  game.tanks = [pilot, light, mbt]; game.allTanks = game.tanks; game.player = pilot;
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 11, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('pilot');
  const hits = { ifv: 0, mbt: 0 }, modules = { ifv: 0, mbt: 0 };
  const bus = createBus((name, payload) => {
    if (name !== 'shell:hit' || !payload || (payload.targetId !== 'ifv' && payload.targetId !== 'mbt')) return;
    hits[payload.targetId]++;
    modules[payload.targetId] += (payload.modulesHit ?? []).length;
  });
  const air = game.matchModeController.airSupport;
  const saved = air.capture(); saved.points = [['pilot', R.points.cap], ['ifv', 0], ['mbt', 0]]; air.restore(saved);
  const hold = () => { light.state.pos.set(1.5, 0, 125); mbt.state.pos.set(-1, 0, 165); };
  const step = () => { simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider); hold(); };
  for (let n = 0; n < 10; n++) step();
  pilot.input.aimPoint.set(0, 0, 150);
  pilot.input.auxiliaryBits = AIR_STRIKE_BITS.strafe;
  const before = { ifv: light.combat.hp, mbt: mbt.combat.hp };
  for (let n = 0; n < 60 * 12; n++) step();
  return {
    hits,
    ifvLoss: (before.ifv - Math.max(0, light.combat.hp)) / light.combat.maxHp, ifvDead: !!light.combat.destroyed,
    mbtLoss: (before.mbt - Math.max(0, mbt.combat.hp)) / mbt.combat.maxHp, ifvModules: modules.ifv, mbtModules: modules.mbt,
  };
}

const now = run(R);
// the 270 strafe, with its round's figures put back for the length of its run
const OLD = { ...R, strafe: { ...R.strafe, lengthM: 140, rounds: 28, fireS: 1.6, spreadM: 5, diveDeg: 15, altitudeM: 120, snapAlongM: 0 } };
const gau8 = AIR_STRIKE_WEAPONS.strafe, kept = { dmg: gau8.dmg, moduleDmg: gau8.moduleDmg };
gau8.dmg = 110; gau8.moduleDmg = 30;
let then;
try { then = run(OLD); } finally { gau8.dmg = kept.dmg; gau8.moduleDmg = kept.moduleDmg; }

const fmt = (r) => `BMP-2 ${r.hits.ifv} hits, ${(r.ifvLoss * 100).toFixed(0)} % hull${r.ifvDead ? ' (destroyed)' : ''}, ${r.ifvModules} module hits; `
  + `M1A1 ${r.hits.mbt} hits, ${(r.mbtLoss * 100).toFixed(0)} % hull, ${r.mbtModules} module hits`;
console.log(`strafeEffect: 275 ${fmt(now)}`);
console.log(`strafeEffect: 270 ${fmt(then)}`);
assert.ok(now.hits.ifv >= 4, `the light vehicle in the lane takes a burst (${now.hits.ifv} hits)`);
assert.ok(now.ifvLoss >= 0.5 || now.ifvDead, `the light vehicle loses at least half its hull (${(now.ifvLoss * 100).toFixed(0)} %)`);
assert.ok(now.hits.mbt >= 3, `the MBT in the lane is struck (${now.hits.mbt} hits)`);
assert.ok(now.mbtLoss >= 0.1 && now.mbtModules >= 1, `the MBT's engine deck is opened (${(now.mbtLoss * 100).toFixed(0)} % hull, ${now.mbtModules} module hits)`);
assert.ok(now.ifvLoss > then.ifvLoss + 0.4 && now.mbtLoss > then.mbtLoss, 'both hulls come off far worse than under the 270 run');
assert.ok(now.hits.ifv + now.hits.mbt >= 2 * (then.hits.ifv + then.hits.mbt), 'at least twice the 270 run\'s hits on the hulls in the lane');
