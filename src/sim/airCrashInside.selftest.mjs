// A downed aircraft comes down inside the battlefield (air-crash-he-276c; Main 2026-11-24: "keep crashes inside the drawn,
// dug square in the sim"). Beyond the playable square the ground is the horizon's, never dug or drawn as a crater, and no
// hull stands there: sim/strikeRuns.ts crashFall turns a fall whose carry would land it past AIR_CRASH_RULES.fall.landInsideM
// to land inside, so its crater, its blast and its wreck fall where the ground is drawn and dug. Pins:
//   1. control: a strafing run called inward from the square's edge and brought down before its gun opens would, on its
//      natural carry (the arc without the turn), land past +-512 m;
//   2. the network authority (the room's step): its crash round bursts once, inside the square, on crashFall's arc;
//   3. the solo step (game/state.ts simStep): the same strike bursts at the same point;
//   4. a fall whose carry already lands inside keeps it bit for bit (the arc is the natural one).
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { AIR_CRASH_RULES, AIR_SUPPORT_RULES as R, matchRulesetFor } from './matchRuleset.ts';
import { AIR_STRIKE_BITS } from './playerActions.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { crashFall, runPose, runVelocity } from './strikeRuns.ts';
import { createCombatState } from './damage.ts';
import { createTankState } from './movement.ts';
import { createMatchModeController } from './matchModes.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';

const DT = 1 / 60;
const SQUARE = 512;
const CALLER = [0, 460], MARK = [0, 300], GUNNER = [0, -300];
await ensureAuthorityFleet(['m1a1_abrams_hc']);
const firm = { getHeightAt: () => 0, getGroundType: () => 'firm', getNormalAt: () => new Vector3(0, 1, 0) };

/** Where the fall meets y 0 on its natural carry (the arc before crashFall's turn), and on crashFall's own arc. */
function landings(strike) {
  const f = AIR_CRASH_RULES.fall, p = runPose(R, strike, strike.downedS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
  const v = runVelocity(R, strike, strike.downedS, { x: 0, y: 0, z: 0 });
  const vy = v.y * f.carry - f.sinkMps, t = (vy + Math.sqrt(vy * vy + 2 * f.gravityMps2 * p.y)) / f.gravityMps2;
  const at = crashFall(R, strike, strike.downedS, strike.downedS + t, { x: 0, y: 0, z: 0 });
  return { natural: { x: p.x + v.x * f.carry * t, z: p.z + v.z * f.carry * t }, arc: { x: at.x, y: at.y, z: at.z }, fallS: t };
}
const inside = (p, m) => Math.abs(p.x) <= m && Math.abs(p.z) <= m;

// ---- 2: the network authority -------------------------------------------------------------------------------------------
function authorityRun() {
  const seats = [
    { seat: 0, playerId: 'caller', name: 'Caller', team: 'alpha', specId: 'm1a1_abrams_hc' },
    { seat: 1, playerId: 'gunner', name: 'Gunner', team: 'bravo', specId: 'm1a1_abrams_hc' },
  ];
  const actor = createMatchActor({ roomId: 'air-crash-inside', mapId: 'verdant', mode: 'air_support', seed: 31, seats, bots: [],
    ruleset: matchRulesetFor('air_support'), world: { mapId: 'verdant', heightField: firm, getObstacles: () => [] },
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });
  const sim = actor.authority;
  sim.onMatchReady();
  const air = sim.modeController.airSupport;
  const at = { caller: CALLER, gunner: GUNNER };
  const input = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['caller', input], ['gunner', { ...input }]]);
  const log = [];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step({ dt: DT, inputs });
      input.actionBits = 0;
      for (const event of sim.eventsForViewer('caller')) log.push(event);
      sim.afterEventBroadcast();
      for (const id of ['caller', 'gunner']) { const e = sim.entityById.get(id); if (!e.combat.destroyed) { e.state.pos.set(at[id][0], 0, at[id][1]); e.state.speed = 0; } }
    }
  };
  tick(30);
  const saved = air.capture(); saved.points = saved.points.map(([id, value]) => [id, id === 'caller' ? R.points.cap : value]); air.restore(saved);
  Object.assign(input, encodeAimIntent(sim.entityById.get('caller').state.pos, new Vector3(MARK[0], 0, MARK[1])));
  input.actionBits = AIR_STRIKE_BITS.strafe;
  tick(1);
  const strike = air.strikes.find((s) => s.kind === 'strafe');
  assert.ok(strike, 'authority: the strafing run was called');
  tick(Math.round((R.strafe.warningS - 1.5) * 60));
  air.damageAircraft(strike, 'gunner', strike.hp, air.view(null).nowS);
  const land = landings(strike);
  tick(Math.ceil((land.fallS + 2) * 60));
  actor.stop();
  const round = log.find((e) => e.type === 'mode_strike_round' && e.strikeId === strike.id && e.crash === 1);
  assert.ok(round, 'authority: one crash round leaves the downed jet');
  const impacts = log.filter((e) => e.type === 'shell_impact' && e.shellId === round.shellId);
  assert.equal(impacts.length, 1, 'authority: exactly one detonation');
  return { strike: { ...strike }, land, impact: impacts[0] };
}

// ---- 3: the solo step ---------------------------------------------------------------------------------------------------
function soloRun() {
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  const tank = (id, team, [x, z], isPlayer) => {
    const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
    combat.equipMults = {};
    const input = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
      aimPoint: new Vector3(0, 0, 0), auxiliaryBits: 0 };
    return { id, specId: spec.id, spec, isPlayer, bot: !isPlayer, team, combat, input, state: createTankState(spec, new Vector3(x, 0, z), 0),
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 3, z + 4), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
  };
  const game = createGameState();
  game.ruleset = matchRulesetFor('air_support');
  const pilot = tank('pilot', 'player', CALLER, true), enemy = tank('e1', 'enemy', GUNNER, false);
  game.tanks = [pilot, enemy]; game.allTanks = game.tanks; game.player = pilot;
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 3, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('pilot');
  const log = [];
  const bus = createBus((name, payload) => { if (name === 'mode:strike_round' || name === 'munition:blast') log.push([name, payload]); });
  const air = game.matchModeController.airSupport;
  const saved = air.capture(); saved.points = [['pilot', R.points.cap], ['e1', 0]]; air.restore(saved);
  // the firm field as the shells' world: a ray meets the plane y 0
  const ground = { heightField: firm, raycast(o, d, maxDist) {
    if (!(d.y < 0) || o.y < 0) return null;
    const dist = -o.y / d.y;
    return dist > maxDist ? null : { dist, point: new Vector3(o.x + d.x * dist, 0, o.z + d.z * dist), normal: new Vector3(0, 1, 0), kind: 'terrain', record: null };
  } };
  const step = () => {
    simStep(game, bus, ground, null, collider);
    pilot.state.pos.set(CALLER[0], 0, CALLER[1]); enemy.state.pos.set(GUNNER[0], 0, GUNNER[1]);
  };
  for (let n = 0; n < 10; n++) step();
  pilot.input.aimPoint.set(MARK[0], 0, MARK[1]);
  pilot.input.auxiliaryBits = AIR_STRIKE_BITS.strafe;
  step();
  pilot.input.auxiliaryBits = 0;
  const strike = air.strikes.find((s) => s.kind === 'strafe');
  assert.ok(strike, 'solo: the strafing run was called');
  while (game.timeS < strike.landsS - 1.5) step();
  air.damageAircraft(strike, 'e1', strike.hp, air.view(null).nowS);
  const land = landings(strike);
  for (let n = 0; n < Math.ceil((land.fallS + 2) * 60); n++) step();
  const blasts = log.filter(([name, p]) => name === 'munition:blast' && p.surface === 'terrain');
  assert.equal(blasts.length, 1, `solo: exactly one detonation (${blasts.length})`);
  return { strike: { ...strike }, land, impact: blasts[0][1] };
}

const net = authorityRun();
// 1. control: the natural carry lands outside the square
assert.ok(!inside(net.land.natural, SQUARE), `1: the natural carry lands past +-${SQUARE} m (${net.land.natural.x.toFixed(1)}, ${net.land.natural.z.toFixed(1)})`);
// 2. the authority's burst: inside the square, where crashFall's arc meets the ground
assert.ok(inside(net.impact, AIR_CRASH_RULES.fall.landInsideM + 0.05), `2: the authority's crash bursts inside (${net.impact.x.toFixed(2)}, ${net.impact.z.toFixed(2)})`);
assert.ok(Math.hypot(net.impact.x - net.land.arc.x, net.impact.z - net.land.arc.z) < 0.05 && Math.abs(net.impact.y) < 0.05,
  `2: on crashFall's arc (${net.impact.x.toFixed(3)}, ${net.impact.z.toFixed(3)} against ${net.land.arc.x.toFixed(3)}, ${net.land.arc.z.toFixed(3)})`);

const solo = soloRun();
assert.ok(!inside(solo.land.natural, SQUARE), '3: the solo run is the same off-square case');
assert.ok(inside(solo.impact, AIR_CRASH_RULES.fall.landInsideM + 0.05), `3: the solo crash bursts inside (${solo.impact.x.toFixed(2)}, ${solo.impact.z.toFixed(2)})`);
assert.ok(Math.hypot(solo.impact.x - solo.land.arc.x, solo.impact.z - solo.land.arc.z) < 0.05,
  `3: on crashFall's arc (${solo.impact.x.toFixed(3)}, ${solo.impact.z.toFixed(3)} against ${solo.land.arc.x.toFixed(3)}, ${solo.land.arc.z.toFixed(3)})`);

// 4. a fall landing inside on its own keeps its natural arc
{
  // the same run marked 600 m further in: it comes down well inside
  const strike = { ...net.strike, x: 0, z: net.strike.z - 600, heading: Math.PI };
  const land = landings(strike);
  assert.ok(inside(land.natural, 400), '4: the inward run lands inside on its own');
  assert.ok(Math.abs(land.arc.x - land.natural.x) < 1e-9 && Math.abs(land.arc.z - land.natural.z) < 1e-9,
    `4: and keeps its carry (${land.arc.x}, ${land.arc.z} against ${land.natural.x}, ${land.natural.z})`);
}

console.log(`airCrashInside: PASS (natural landing (${net.land.natural.x.toFixed(1)}, ${net.land.natural.z.toFixed(1)}); `
  + `authority burst (${net.impact.x.toFixed(2)}, ${net.impact.z.toFixed(2)}); solo (${solo.impact.x.toFixed(2)}, ${solo.impact.z.toFixed(2)}))`);
