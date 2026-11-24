// Air crashes are HE (air-crash-he-276; the owner, 2026-11-23: "when a plane is shot down and falls it should cause a big
// explosion with sounds and explosion hole. duh. same with drones if they hit the ground or a building, its like HE", and
// "plane wrecks and so on should leave the biggest craters and actual wrecks"). sim/airCrash.ts: a crash is one HE round
// of its airframe's class in the normal shell pipeline. Pins, on the real authority (the room's step) and the solo step:
//   1. a downed A-10 over open ground makes exactly one HE detonation, where its fall's arc (sim/strikeRuns.ts crashFall)
//      meets the ground, with its class's charge, and digs a crater larger than the GBU-12's;
//   2. a hull inside the blast takes damage, one outside it none;
//   3. a drone flown into a shed bursts on its wall as the drone's crash (its charge, not its shaped charge) and
//      damages the house;
//   4. solo against authority: a drone shot down by a roof gun falls and bursts at the same tick, the same point, with
//      the same damage, on both drivers;
//   5. a negative control: with the crash round removed (its strike marked as crashed before it falls), check 1 fails.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { AIR_CRASH_ROUNDS, AIR_CRASH_RULES, AIR_STRIKE_WEAPONS, DRONE_WARHEAD, AIR_SUPPORT_RULES, applyRulesetToCombat, matchRulesetFor } from './matchRuleset.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from './playerActions.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { crashFall } from './strikeRuns.ts';
import { craterFor, munitionChargeKg, structureBlastPoints } from './munitionBlast.ts';
import { initializeAerial } from './aerialCombat.ts';
import { createAuxiliaryState, roofStationCount } from './auxiliarySystems.ts';
import { createCombatState } from './damage.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createBus, createGameState, mulberry32, simStep } from '../game/state.ts';

const R = AIR_SUPPORT_RULES;
const DT = 1 / 60;
await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a1', 'kv2']);

// ---- 1, 2, 5: a downed A-10 over open ground ---------------------------------------------------------------------------
const firmField = { getHeightAt: () => 0, getGroundType: () => 'firm', getNormalAt: () => new Vector3(0, 1, 0) };
const SEATS = [
  { seat: 0, playerId: 'caller', name: 'Caller', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'near', name: 'Near', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 2, playerId: 'gunner', name: 'Gunner', team: 'bravo', specId: 'm1a1_abrams_hc' },
];
/** The ground point (y 0) a downed strike's fall meets: the root of y(t) = 0 on crashFall's arc. */
function crashPoint(strike, downedS) {
  const at = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };
  crashFall(R, strike, downedS, downedS, at, vel);
  const g = AIR_CRASH_RULES.fall.gravityMps2;
  const t = (vel.y + Math.sqrt(vel.y * vel.y + 2 * g * at.y)) / g;
  crashFall(R, strike, downedS, downedS + t, at);
  return { x: at.x, z: at.z, fallS: t };
}

function downedJet({ removeCrash = false } = {}) {
  const actor = createMatchActor({ roomId: 'air-crash', mapId: 'verdant', mode: 'air_support', seed: 31, seats: SEATS, bots: [],
    ruleset: matchRulesetFor('air_support'), world: { mapId: 'verdant', heightField: firmField, getObstacles: () => [] },
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });
  const sim = actor.authority;
  sim.onMatchReady();
  const air = sim.modeController.airSupport;
  const at = { caller: [0, -220], near: [-200, -200], gunner: [0, 320] };
  const input = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['caller', input], ['near', { ...input }], ['gunner', { ...input }]]);
  const log = [];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step({ dt: DT, inputs });
      input.actionBits = 0;
      for (const event of sim.eventsForViewer('caller')) log.push(event);
      sim.afterEventBroadcast();
      for (const id of ['caller', 'near', 'gunner']) { const e = sim.entityById.get(id); if (!e.combat.destroyed) { e.state.pos.set(at[id][0], 0, at[id][1]); e.state.speed = 0; } }
    }
  };
  tick(30);
  // the caller calls the strafing run at the mark (0, 0) with its ledger at the cap
  const saved = air.capture(); saved.points = saved.points.map(([id, value]) => [id, id === 'caller' ? R.points.cap : value]); air.restore(saved);
  Object.assign(input, encodeAimIntent(sim.entityById.get('caller').state.pos, new Vector3(0, 0, 0)));
  input.actionBits = AIR_STRIKE_BITS.strafe;
  tick(1);
  const strike = air.strikes.find((s) => s.kind === 'strafe');
  assert.ok(strike, 'the strafing run was called');
  // in its dive, before its gun opens: the gunner's rounds bring it down (the whole of its hit points at once)
  tick(Math.round((R.strafe.warningS - 1.5) * 60));
  const downedS = air.view(null).nowS;
  air.damageAircraft(strike, 'gunner', strike.hp, downedS);
  assert.equal(strike.downedS, downedS, 'brought down');
  if (removeCrash) strike.crashed = true;
  const point = crashPoint(strike, downedS);
  // a hull of the caller's side 7 m from where it will fall, the caller 70 m off it (past the A-10's 36 m blast)
  at.near = [point.x + 7, point.z]; at.caller = [point.x - 70, point.z];
  const hpBefore = { near: sim.entityById.get('near').combat.hp, caller: sim.entityById.get('caller').combat.hp };
  tick(Math.ceil((point.fallS + 2) * 60));
  actor.stop();
  return { log, strike, point, hpBefore, hp: { near: sim.entityById.get('near').combat.hp, caller: sim.entityById.get('caller').combat.hp } };
}

/** Checks 1 and 2 on a downed-jet run; throws on the first that fails. */
function checkJet(run) {
  const crashRounds = run.log.filter((e) => e.type === 'mode_strike_round' && e.strikeId === run.strike.id && e.crash === 1);
  assert.equal(crashRounds.length, 1, 'one crash round leaves the downed jet');
  const shellId = crashRounds[0].shellId;
  const impacts = run.log.filter((e) => e.type === 'shell_impact' && e.shellId === shellId);
  assert.equal(impacts.length, 1, 'exactly one detonation');
  const impact = impacts[0];
  const charge = munitionChargeKg(AIR_CRASH_ROUNDS.attack);
  assert.equal(impact.munition, 'howitzer', 'an HE burst');
  assert.ok(Math.abs(impact.chargeKg - charge) < 1e-9, `the A-10 class's charge (${impact.chargeKg} kg, the table's ${charge.toFixed(1)})`);
  assert.ok(Math.hypot(impact.x - run.point.x, impact.z - run.point.z) < 0.05 && Math.abs(impact.y) < 0.05,
    `where the fall's arc meets the ground (${impact.x.toFixed(3)}, ${impact.z.toFixed(3)} against ${run.point.x.toFixed(3)}, ${run.point.z.toFixed(3)})`);
  const crater = run.log.find((e) => e.type === 'terrain_crater' && e.craterId === impact.craterId);
  assert.ok(crater, 'it dug a crater');
  const bomb = craterFor(munitionChargeKg(AIR_STRIKE_WEAPONS.bomb), 'howitzer', 1, { radiusM: 0, depthM: 0, rimM: 0 }).radiusM;
  assert.ok(crater.radiusM > bomb, `the crater (${crater.radiusM.toFixed(2)} m) is larger than the GBU-12's (${bomb.toFixed(2)} m)`);
  const nearHit = run.log.find((e) => e.type === 'shell_hit' && e.shellId === shellId && e.targetId === 'near');
  assert.ok(nearHit && run.hp.near < run.hpBefore.near, `the hull 7 m off takes the blast (${run.hpBefore.near} -> ${run.hp.near})`);
  assert.equal(nearHit.shooterId, 'gunner', 'credited to the crew that brought it down');
  assert.ok(!run.log.some((e) => e.type === 'shell_hit' && e.shellId === shellId && e.targetId === 'caller'), 'the hull 70 m off is not struck');
  assert.equal(run.hp.caller, run.hpBefore.caller, 'and loses nothing');
  return { impact, crater, nearHp: [run.hpBefore.near, run.hp.near].map((hp) => Math.round(hp)) };
}
const jet = checkJet(downedJet());
// 5. the negative control: no crash round, no detonation, and the check fails
assert.throws(() => checkJet(downedJet({ removeCrash: true })), /one crash round/, 'without the crash round the check fails');

// ---- 3: a drone flown into a shed ---------------------------------------------------------------------------------------
let house = null;
{
  const { setCompoundShape, setObbShape } = await import('../world/collision.ts');
  const { createHeadlessCollisionWorld } = await import('../world/headlessCollisionWorld.ts');
  const { packCollisionRecord } = await import('../world/collisionRecordPacking.ts');
  const probe = createAuthoritativeMatch({ mapId: 'verdant', seed: 1, countdownS: 0,
    players: [{ id: 'probe', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } }] });
  let base = Infinity;
  for (let x = -3; x <= 3; x += 1) for (let z = -37; z <= -33; z += 1) base = Math.min(base, probe.heightField.getHeightAt(x, z));
  base -= 0.2;
  // a 6 x 4 m shed, 3.5 m tall (84 m^3: 17.5 hit points), across the drone's path, its south wall at z = -37: the crash's
  // contact blast (8.75 points) takes it past 'damaged'; the drone's shaped charge (2.9) would leave it intact
  const contact = setObbShape({ min: [0, base, 0], max: [0, base + 1.8, 0], kind: 'structure', structureIdx: 0 }, 0, -35, 3, 2, 0);
  const shellBand = setCompoundShape({ min: [0, base, 0], max: [0, base + 3.5, 0], kind: 'structure', structureIdx: 0 },
    [{ kind: 'obb', cx: 0, cz: -35, hw: 3, hl: 2, yaw: 0 }]);
  const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: probe.heightField,
    manifest: { obstacles: [packCollisionRecord(contact)], colliders: [packCollisionRecord(shellBand)], concealers: [] } });
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 5, countdownS: 0, gameMode: 'drone', worldCollision: world, players: [
    { id: 'pilot', specId: 'kv2', team: 'bravo', spawn: { x: 0, z: -80, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 160, z: 160, yaw: 0 } },
  ] });
  match.onMatchReady();
  const pilot = match.entityById.get('pilot');
  const idle = { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, shellSlot: 0, actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100 };
  const inputs = new Map([['far', null]]);
  const wall = new Vector3(0, base + 1.75, -37);
  let impact = null, stage = null, launched = false;
  for (let i = 0; i < 60 * 14 && !impact; i++) {
    const v = pilot.aerial;
    inputs.set('pilot', !launched ? { ...idle, throttle: 1, brake: false, actionBits: PLAYER_ACTION_BITS.DRONE }
      : { ...idle, throttle: 1, brake: false, aimLocked: false, ...encodeAimIntent(v, wall) });
    match.step({ dt: DT, inputs });
    if (pilot.aerial?.active) launched = true;
    for (const event of match.eventsForViewer('pilot')) {
      if (event.type === 'shell_impact' && event.shooterId === 'pilot' && !impact) impact = event;
      if (event.type === 'structure_stage' && event.structureId === 0 && !stage) stage = event;
    }
    match.afterEventBroadcast();
  }
  for (let i = 0; i < 4 && !stage; i++) {
    match.step({ dt: DT, inputs: new Map() });
    for (const event of match.eventsForViewer('pilot')) if (event.type === 'structure_stage' && event.structureId === 0 && !stage) stage = event;
    match.afterEventBroadcast();
  }
  assert.ok(launched, 'the drone flew');
  assert.ok(impact, 'the drone met the shed');
  assert.equal(impact.structureId, 0, `on the shed (${JSON.stringify(impact)})`);
  assert.equal(impact.munition, 'howitzer', 'as the drone\'s crash (HE), not its shaped charge');
  assert.ok(Math.abs(impact.chargeKg - munitionChargeKg(AIR_CRASH_ROUNDS.drone)) < 1e-9, `with the drone class's charge (${impact.chargeKg} kg)`);
  const crashPoints = structureBlastPoints(munitionChargeKg(AIR_CRASH_ROUNDS.drone), 'howitzer', 0);
  assert.ok(stage && stage.points > structureBlastPoints(munitionChargeKg(DRONE_WARHEAD), 'drone_fpv', 0) && stage.points <= crashPoints + 1e-9,
    `the shed is damaged by the crash's blast (${JSON.stringify(stage)}; its contact ${crashPoints.toFixed(2)} points)`);
  probe.stop?.();
  house = { impact, stage };
}

// ---- 4: solo against authority, a drone shot down by a roof gun ------------------------------------------------------
const flatField = {
  getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, maxY: 0, getGroundType: () => 'firm',
  getNormalAt: () => new Vector3(0, 1, 0), getContactNormalAt: (_x, _z, out) => out.set(0, 1, 0),
  *warmFastTilesAround() {},
};
const groundRay = (o, d, maxDist) => {
  if (d.y >= -1e-9) return null;
  const t = -o.y / d.y;
  return t >= 0 && t <= maxDist ? { dist: t, point: new Vector3(o.x + d.x * t, 0, o.z + d.z * t), normal: new Vector3(0, 1, 0), kind: 'terrain', record: null } : null;
};
const flatWorld = () => ({ mapId: 'steppe', heightField: flatField, raycast: groundRay,
  getObstacles: () => [], getColliders: () => [], queryObstacles: (_a, _b, _c, _d, out) => { if (out) { out.length = 0; return out; } return []; } });
const IDLE = { throttle: 0, steer: 0, brake: true, fire: false, fireIntentSeq: null, aimLocked: true, shellSlot: 0, actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100 };
const HOVER_TICKS = 60 * 8;
/** The hover's pilot input: launch while docked, then hold (throttle 0) aimed at the target. */
const hoverInput = (v, target) => (v?.active ? { ...IDLE, throttle: 0, brake: false, aimLocked: false, ...encodeAimIntent(v, target) }
  : { ...IDLE, throttle: 0, brake: false, actionBits: PLAYER_ACTION_BITS.DRONE });

function authorityHover() {
  const match = createAuthoritativeMatch({ players: [
    { id: 't0', specId: 'm1a1', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
    { id: 'pilot', specId: 'kv2', team: 'bravo', spawn: { x: 0, z: 30, yaw: Math.PI } },
  ], mapId: 'steppe', seed: 7, countdownS: 0, gameMode: 'drone', worldCollision: flatWorld() });
  match.onMatchReady();
  const target = match.entityById.get('t0'), pilot = match.entityById.get('pilot');
  target.state.pos.set(0, 0, 0); target.state.yaw = 0; target.state.turretYaw = 0;
  pilot.state.pos.set(0, 0, 30); pilot.state.yaw = Math.PI;
  target.combat.auxiliary ??= createAuxiliaryState(target.spec);
  // the hulls as the authority settled them: the page's battle starts from these (driverStepParity's t0)
  const settled = Object.fromEntries([target, pilot].map((e) => [e.id,
    structuredClone(Object.fromEntries(Object.entries(e.state).filter(([key]) => key !== 'pos' && !key.startsWith('_'))))]));
  const settledPos = Object.fromEntries([target, pilot].map((e) => [e.id, e.state.pos.clone()]));
  // and their kit as the authority fitted it (the default equipment's multipliers: the HE splash's among them)
  const equipMults = Object.fromEntries([target, pilot].map((e) => [e.id, structuredClone(e.combat.equipMults ?? {})]));
  const inputs = new Map([['t0', null]]);
  const out = { down: null, shellId: null, impact: null };
  for (let tick = 1; tick <= HOVER_TICKS && !out.impact; tick++) {
    if (!out.down) inputs.set('pilot', hoverInput(pilot.aerial, target.state.pos)); else inputs.set('pilot', IDLE);
    match.step({ dt: SIM_DT, inputs });
    for (const ev of match.eventsForViewer('pilot')) {
      if (ev.type === 'drone_down' && ev.id === 'pilot' && !out.down) { out.down = tick; out.shellId = ev.shellId; }
      if (ev.type === 'shell_impact' && out.shellId != null && ev.shellId === out.shellId) out.impact = { tick, x: ev.x, y: ev.y, z: ev.z, munition: ev.munition, chargeKg: ev.chargeKg };
    }
    match.afterEventBroadcast();
  }
  out.hp = { t0: target.combat.hp, pilot: pilot.combat.hp };
  out.settled = settled; out.settledPos = settledPos; out.equipMults = equipMults;
  return out;
}

function soloHover({ settled, settledPos, equipMults }) {
  const game = createGameState();
  game.ruleset = matchRulesetFor('drone');
  // the page's combat stream is the authority's (its match seed): the crash's damage roll is drawn from it on both
  game.combatRng = mulberry32(7);
  const tank = (id, sid, team, x, z, yaw) => {
    const spec = TANK_SPECS[sid], combat = createCombatState(spec);
    combat.equipMults = {};
    // the mode's hull rules, as the page's spawn and the authority stamp them (its damage scale among them)
    applyRulesetToCombat(combat, spec.gun.shells, game.ruleset);
    return { id, specId: sid, spec, isPlayer: false, team, combat, state: createTankState(spec, new Vector3(x, 0, z), yaw),
      input: { ...IDLE, aimPoint: new Vector3() },
      visual: { root: new Group(), gunMuzzleWorld: (o) => o.set(x, 2, z), gunDirWorld: (o) => o.set(0, 0, 1), recoilKick() {}, setDestroyed() {} } };
  };
  const target = tank('t0', 'm1a1', 'player', 0, 0, 0), pilot = tank('pilot', 'kv2', 'enemy', 0, 30, Math.PI);
  game.tanks = [target, pilot]; game.allTanks = [target, pilot];
  for (const e of game.tanks) { game.tankById.set(e.id, e); initializeAerial(e, game.ruleset); }
  target.combat.auxiliary ??= createAuxiliaryState(target.spec);
  for (const e of game.tanks) {
    const pos = e.state.pos;
    Object.assign(e.state, structuredClone(settled[e.id]), { pos });
    pos.copy(settledPos[e.id]);
    e.combat.equipMults = structuredClone(equipMults[e.id]);
  }
  const out = { down: null, shellId: null, impact: null };
  let tick = 0;
  const bus = createBus((name, payload) => {
    if (name === 'drone:down' && payload.id === 'pilot' && !out.down) { out.down = tick; out.shellId = payload.shellId; }
    if (name === 'shell:expired' && out.shellId != null && payload.shellId === out.shellId && !out.impact) {
      out.impact = { tick, x: payload.pos[0], y: payload.pos[1], z: payload.pos[2] };
    }
  });
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  const world = { heightField: flatField, raycast: groundRay };
  for (tick = 1; tick <= HOVER_TICKS && !out.impact; tick++) {
    const input = out.down ? IDLE : hoverInput(pilot.aerial, target.state.pos);
    Object.assign(pilot.input, input); pilot.input.auxiliaryBits = input.actionBits;
    if (pilot.aerial?.active) pilot.input.aimPoint.copy(target.state.pos);
    simStep(game, bus, world, null, collider);
  }
  out.hp = { t0: target.combat.hp, pilot: pilot.combat.hp };
  return out;
}
const onAuthority = authorityHover(), onPage = soloHover(onAuthority);
assert.ok(onAuthority.down && onAuthority.impact, `the authority downs the drone and its crash bursts (${JSON.stringify(onAuthority)})`);
assert.ok(onPage.down && onPage.impact, `the solo step downs the drone and its crash bursts (${JSON.stringify(onPage)})`);
assert.equal(onAuthority.impact.munition, 'howitzer', 'a downed drone bursts as HE');
assert.equal(onPage.down, onAuthority.down, 'downed on the same tick');
assert.equal(onPage.impact.tick, onAuthority.impact.tick, 'its crash bursts on the same tick');
for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(onPage.impact[k] - onAuthority.impact[k]) < 1e-6, `at the same point (${k}: ${onPage.impact[k]} / ${onAuthority.impact[k]})`);
assert.deepEqual(onPage.hp, onAuthority.hp, 'with the same damage');

console.log(`airCrash: a downed A-10 bursts once as HE (${jet.impact.chargeKg.toFixed(1)} kg) where its fall meets the ground, a `
  + `${jet.crater.radiusM.toFixed(2)} m crater, the hull 7 m off ${jet.nearHp.join(' -> ')} hp and the one 70 m off untouched; without `
  + `its crash round the check fails; a drone flown into a shed bursts on its wall at ${house.impact.chargeKg.toFixed(2)} kg (stage `
  + `${house.stage.stage}); a drone shot down bursts at tick ${onAuthority.impact.tick} on both drivers at the same point and damage PASS`);
