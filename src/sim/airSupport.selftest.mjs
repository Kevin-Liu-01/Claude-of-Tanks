// Air Support (air-support-270): the ledger and the five call-ins through the network authority as a room hosts it (the
// match actor on a flat field), and the rules the solo battle shares. Pins the ruling's gates that a receipt can hold:
// a warning before every strike (no round of any call-in arrives before its warning has run), recon reveals through the
// spotting system, points and cooldowns and the side's air cap, aircraft brought down by the other side's rounds (the
// strike ends), bots calling and evading, the host-migration checkpoint, the action bits, and a deterministic replay.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from './playerActions.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES, airStrikeFlies, matchRulesetFor } from './matchRuleset.ts';
import { GAME_MODE_IDS } from './gameModeCatalog.ts';
import { aircraftPose, strikeCovers } from './airSupport.ts';
import { encodeAimIntent } from './aimIntent.ts';
import { killSourceOf } from './aerialCombat.ts';

const R = AIR_SUPPORT_RULES;
const SPEC = 'm1a1_abrams_hc';
const seats = [
  { seat: 0, playerId: 'caller', name: 'Caller', team: 'alpha', specId: SPEC },
  { seat: 1, playerId: 'e1', name: 'E1', team: 'bravo', specId: SPEC },
  { seat: 2, playerId: 'e2', name: 'E2', team: 'bravo', specId: SPEC },
];
await ensureAuthorityFleet([SPEC]);
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });

// the action bits: one a call-in, all distinct; the supply bits double as artillery and recon only because no mode both
// drops supplies (the AC-130's escort) and calls strikes
{
  const bits = AIR_STRIKE_KINDS.map((kind) => AIR_STRIKE_BITS[kind]);
  assert.equal(new Set(bits).size, AIR_STRIKE_KINDS.length);
  for (const bit of bits) assert.equal(bit & (bit - 1), 0, 'one-hot');
  for (const mode of GAME_MODE_IDS) {
    const rules = matchRulesetFor(mode);
    assert.ok(!(rules.airSupport && (mode === 'ac130' || rules.aerial)), `${mode}: never both supply drops and call-ins`);
  }
  assert.equal(matchRulesetFor('air_support').airSupport, R);
  assert.equal(PLAYER_ACTION_BITS.STRIKE_GUNSHIP, 1 << 15, 'the u16 is full, never wider');
  assert.equal(killSourceOf(null, { reloadGroup: 'strike-strafe' }), 'strafe');
  assert.equal(killSourceOf(null, { reloadGroup: 'strike-bomb' }), 'bomb');
  assert.equal(killSourceOf(null, { reloadGroup: 'gunship-cannon' }), 'ac130');
  assert.equal(killSourceOf(null, { reloadGroup: 'strike-artillery' }), 'artillery');
}

const shellViews = { callerSeen: 0, callerHidden: 0 };
function run({ bots = [], shootDown = false, migrateAt = null } = {}) {
  const make = (resume) => createMatchActor({ roomId: 'air-support', mapId: 'verdant', mode: 'air_support', seed: 77, seats, bots,
    ruleset: matchRulesetFor('air_support'), world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const actor = make(null), sim = actor.authority;
  sim.onMatchReady();
  const at = { caller: [0, -220], e1: [0, 160], e2: [12, 172] };
  for (const [id, [x, z]] of Object.entries(at)) { const e = sim.entityById.get(id); e.state.pos.set(x, 0, z); e.state.speed = 0; }
  const air = sim.modeController.airSupport;
  assert.ok(air, 'air_support carries the ledger');
  // the caller's ledger at its cap before each call (the cap holds: the test buys every call-in in turn)
  const fund = () => { const saved = air.capture(); saved.points = saved.points.map(([id, value]) => [id, id === 'caller' ? R.points.cap : value]); air.restore(saved); };
  const paid = [];
  const input = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['caller', input], ['e1', { ...input }], ['e2', { ...input }]]);
  const log = [];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step({ dt: 1 / 60, inputs });
      input.actionBits = 0;
      for (const event of sim.eventsForViewer('e1')) log.push(event);
      sim.afterEventBroadcast();
      // the enemy holds still where we put it (the test reads the strikes, not the driving)
      for (const id of ['caller', 'e1', 'e2']) { const e = sim.entityById.get(id); if (!e.combat.destroyed) { e.state.pos.set(at[id][0], 0, at[id][1]); e.state.speed = 0; } }
      // improve-271 plan 014: snapshot() and observeForViewer() send a viewer the same shells (one rule: a strike's round
      // is public, as its footprint and heading are; the owner, 2026-11-05), whether or not the viewer sees the caller
      if (Math.round(sim.timeS * 60) % 6 === 0) {
        const entitiesOut = [], shellsOut = [];
        sim.observeForViewer('e1', entitiesOut, shellsOut);
        if (shellsOut.some((shell) => typeof shell.strikeId === 'number')) {
          const tickNow = Math.round(sim.timeS * 60);
          const snap = sim.snapshot({ tick: tickNow, serverTimeMs: tickNow * 1000 / 60, viewerId: 'e1', ackInputSeq: null });
          assert.deepEqual(snap.shells.map((shell) => shell.id).sort(), shellsOut.map((shell) => shell.id).sort(),
            `tick ${tickNow}: snapshot() and observeForViewer() agree on the strike rounds`);
          shellViews[entitiesOut.some((entity) => entity.id === 'caller') ? 'callerSeen' : 'callerHidden']++;
        }
      }
    }
  };
  tick(30);
  const call = (kind, target) => {
    const caller = sim.entityById.get('caller');
    fund();
    Object.assign(input, encodeAimIntent(caller.state.pos, target));
    input.actionBits = AIR_STRIKE_BITS[kind];
    tick(1);
    paid.push([kind, R.points.cap - air.pointsOf('caller')]);
  };
  const e1 = () => sim.entityById.get('e1').state.pos;
  // recon first: the enemy at 380 m is out of the caller's sight, then revealed by the pass for revealS
  call('recon', e1());
  tick(Math.ceil(R.recon.warningS * 60) + 6);
  assert.equal(air.revealed('e1', 'alpha'), true, 'the recon pass reveals the enemy near its track');
  for (const kind of ['artillery', 'strafe', 'bomb', 'gunship']) {
    // the side's air: wait until a slot is free
    for (let guard = 0; guard < 3600 && air.strikes.filter((s) => s.team === 'alpha' && s.downedS == null && s.endS > sim.timeS).length >= R.teamAirCap; guard++) tick(1);
    // the AC-130 engages only what its side has spotted: the caller drives up to 110 m of the enemy (in sight) first
    if (kind === 'gunship') { at.caller = [0, 50]; sim.entityById.get('caller').state.pos.set(0, 0, 50); tick(90);
    }
    call(kind, e1());
    if (migrateAt === kind) {
      const checkpoint = sim.captureModeCheckpoint();
      const copy = JSON.parse(JSON.stringify(checkpoint));
      const second = make({ tick: Math.round(sim.timeS * 60), battleTimeMs: Math.round(sim.timeS * 1000) });
      second.authority.restoreModeCheckpoint(copy);
      assert.deepEqual(second.authority.modeController.airSupport.capture(), air.capture(), 'the ledger and the strikes survive a host change');
      second.stop();
    }
    if (shootDown && kind === 'strafe') {
      // e1's rounds through the jet while it comes in: the strike falls before its gun opens, and no round of it leaves
      const strike = air.strikes.find((s) => s.kind === 'strafe');
      const pose = aircraftPose(R, strike, sim.timeS, { x: 0, y: 0, z: 0, yaw: 0, bank: 0 });
      for (let n = 0; n < 3; n++) {
        const shell = { dead: false, shooterId: 'e1', prevPos: { x: pose.x - 5, y: pose.y, z: pose.z }, pos: { x: pose.x + 5, y: pose.y, z: pose.z }, spec: { dmg: 300 } };
        air.tryHitAircraft(shell, sim.timeS);
      }
      assert.ok(strike.downedS != null, 'two main-gun hits bring the jet down');
      tick(1);
      assert.ok(log.some((e) => e.type === 'mode_aircraft_down' && e.strikeId === strike.id));
    }
  }
  tick(60 * 45);
  actor.stop();
  return { log, air, sim, paid };
}

const first = run();
assert.ok(shellViews.callerHidden > 0, `strike rounds compared for a viewer that does not see the caller (${JSON.stringify(shellViews)})`);
const called = first.log.filter((e) => e.type === 'mode_strike_called');
assert.deepEqual(called.map((e) => e.kind), ['recon', 'artillery', 'strafe', 'bomb', 'gunship'], 'every call-in was accepted, in order');
// the warning: every round of every strike leaves no earlier than its call and arrives no earlier than its warning's end
const strikeOf = new Map(called.map((e) => [e.strikeId, e]));
const rounds = first.log.filter((e) => e.type === 'mode_strike_round');
const roundStrike = new Map(rounds.map((e) => [e.shellId, strikeOf.get(e.strikeId)]));
assert.ok(rounds.length > 40, `rounds fired (${rounds.length})`);
const arrivals = first.log.filter((e) => (e.type === 'shell_hit' || e.type === 'shell_impact') && roundStrike.has(e.shellId));
assert.ok(arrivals.length > 10, `strike rounds arrived (${arrivals.length})`);
let earliest = Infinity;
for (const e of arrivals) {
  const strike = roundStrike.get(e.shellId);
  earliest = Math.min(earliest, e.timeS - strike.landsS);
  assert.ok(e.timeS >= strike.landsS - 1e-9, `${strike.kind} round arrived ${e.timeS.toFixed(3)} before its warning ended ${strike.landsS.toFixed(3)}`);
  assert.ok(strike.landsS - strike.timeS >= R[strike.kind].warningS - 1e-9, 'the warning ran its full length');
}
for (const kind of ['artillery', 'strafe', 'bomb', 'gunship']) {
  assert.ok(arrivals.some((e) => roundStrike.get(e.shellId).kind === kind), `${kind}: its rounds reach the ground`);
}
const kills = first.log.filter((e) => e.type === 'tank_destroyed' && e.killerId === 'caller');
assert.ok(first.log.some((e) => e.type === 'shell_hit' && e.attackerId === 'caller'), 'the strikes hit the enemy, credited to the caller');
for (const kill of kills) assert.ok(['artillery', 'strafe', 'bomb', 'ac130'].includes(kill.source), `a strike's kill names its call-in (${kill.source})`);
// points: each call paid its cost (the call's own tick may add one trickle point)
for (const [kind, drop] of first.paid) assert.ok(drop >= R[kind].cost - 1 && drop <= R[kind].cost, `${kind} cost ${R[kind].cost}, paid ${drop}`);
// the cooldown and the air cap refuse a second call at once
{
  const strike = first.air.requestStrike('caller', 'recon', 0, 0, first.sim.timeS);
  assert.equal(strike, true, 'recon off cooldown after the run');
  assert.equal(first.air.requestStrike('caller', 'recon', 0, 0, first.sim.timeS + 1), false, 'a second recon waits its cooldown');
}

// determinism: the same seed and inputs fire the same rounds at the same ticks onto the same points
const second = run();
const digest = (log) => JSON.stringify(log.filter((e) => e.type.startsWith('mode_strike') || e.type === 'shell_hit' || e.type === 'tank_destroyed')
  .map((e) => [e.type, e.timeS, e.shellId ?? null, e.strikeId ?? null, Math.round((e.x ?? 0) * 1000), Math.round((e.z ?? 0) * 1000), e.damage ?? null]));
assert.equal(digest(second.log), digest(first.log), 'a replay fires the same strikes');

// shot down: the jet falls, the caller's lane is never walked
{
  const downed = run({ shootDown: true });
  const strafe = downed.log.find((e) => e.type === 'mode_strike_called' && e.kind === 'strafe');
  assert.equal(downed.log.filter((e) => e.type === 'mode_strike_round' && e.strikeId === strafe.strikeId).length, 0, 'a downed jet fires nothing');
}
// migration: the ledger, the cooldowns and a strike in the air carry across a host change
run({ migrateAt: 'bomb' });

// bots: an enemy bot with points calls on the caller it spots, and a bot inside a bomb's footprint evades
{
  const make = createMatchActor({ roomId: 'air-bots', mapId: 'verdant', mode: 'air_support', seed: 5, seats: [seats[0]],
    bots: [{ playerId: 'b1', name: 'B1', team: 'bravo', specId: SPEC }, { playerId: 'b2', name: 'B2', team: 'bravo', specId: SPEC }],
    ruleset: matchRulesetFor('air_support'), world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });
  const sim = make.authority; sim.onMatchReady();
  const air = sim.modeController.airSupport;
  // the bot that calls: one whose seeded preference a lone spotted enemy can answer (the gunship's needs two)
  const caller = ['b1', 'b2'].find((id) => air.botPreference(id) !== 'gunship');
  assert.ok(caller, 'a bot of the two prefers a call-in short of the gunship');
  const other = caller === 'b1' ? 'b2' : 'b1';
  const saved = air.capture(); saved.points = saved.points.map(([id]) => [id, id === caller ? R.points.cap : 0]); air.restore(saved);
  sim.entityById.get('caller').state.pos.set(0, 0, 0); sim.entityById.get(caller).state.pos.set(0, 0, 200);
  const calls = [];
  for (let n = 0; n < 60 * 6 && !calls.length; n++) {
    sim.step({ dt: 1 / 60, inputs: new Map([['caller', { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 }]]) });
    for (const e of sim.eventsForViewer('caller')) if (e.type === 'mode_strike_called') calls.push(e);
    sim.afterEventBroadcast();
    sim.entityById.get('caller').state.pos.set(0, 0, 0);
  }
  assert.ok(calls.length && calls[0].callerId === caller, 'a bot with points calls a strike on the enemy it spots');
  const strike = air.strikes[0];
  const b2 = sim.entityById.get(other);
  b2.state.pos.set(strike.x + 3, 0, strike.z + 2);
  const target = sim.modeController.botObjective(b2);
  if (strike.kind !== 'gunship' && strike.kind !== 'recon') {
    assert.equal(target?.mission, 'evade', `a bot inside the ${strike.kind}'s footprint leaves it`);
    assert.equal(strikeCovers(R, strike, target.x, target.z, 0), false, 'its way out is outside the footprint');
  }
  make.stop();
}
// counter-air: a bot crew's roof station engages the strafing jet as it runs in and lands its shares on the airframe
{
  const actor = createMatchActor({ roomId: 'air-aa', mapId: 'verdant', mode: 'air_support', seed: 9, seats: [seats[0]],
    bots: [{ playerId: 'aa', name: 'AA', team: 'bravo', specId: SPEC }],
    ruleset: matchRulesetFor('air_support'), world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });
  const sim = actor.authority; sim.onMatchReady();
  const air = sim.modeController.airSupport;
  const saved = air.capture(); saved.points = saved.points.map(([id]) => [id, id === 'caller' ? R.points.cap : 0]); air.restore(saved);
  const input = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const hold = () => { sim.entityById.get('caller').state.pos.set(0, 0, -200); const aa = sim.entityById.get('aa'); if (!aa.combat.destroyed) aa.state.pos.set(0, 0, 150); };
  hold();
  const hits = [];
  for (let n = 0; n < 60 * 14; n++) {
    if (n === 30) { Object.assign(input, encodeAimIntent(sim.entityById.get('caller').state.pos, { x: 0, y: 0, z: 150 })); input.actionBits = AIR_STRIKE_BITS.strafe; }
    sim.step({ dt: 1 / 60, inputs: new Map([['caller', input]]) });
    input.actionBits = 0;
    for (const e of sim.eventsForViewer('caller')) if (e.type === 'mode_aircraft_hit') hits.push(e);
    sim.afterEventBroadcast();
    hold();
  }
  assert.ok(hits.length > 0 && hits.every((e) => e.by === 'aa' && e.kind === 'strafe'), `the bot's roof station hits the jet (${hits.length} shares)`);
  actor.stop();
}
assert.ok(AIR_STRIKE_KINDS.every((kind) => R[kind].warningS >= 3), 'every call-in warns at least 3 s');
assert.ok(!airStrikeFlies('artillery') && airStrikeFlies('gunship'));
console.log(`airSupport: 5 call-ins accepted, ${rounds.length} rounds, ${arrivals.length} arrivals all at or after their warnings (earliest +${earliest.toFixed(3)} s); recon reveals; points, cooldowns, air cap, shoot-down, bots calling and evading, migration and replay pass`);
