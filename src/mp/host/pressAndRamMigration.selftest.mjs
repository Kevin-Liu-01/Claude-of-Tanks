// pressAndRamMigration.selftest.mjs — a host migration keeps a crush press under way and a ram pair's cooldown (279). Copyright (c) 2026 Kevin B. Liu.
//
// Two more ledgers of the authority's own (authorityStateMigration's census named them open): the press a hull's tracks
// put on a crushable record (sim/crushPress.ts: CRUSH_PRESS_S of contact fells it) and each ram pair's last ram
// (RAM_PAIR_COOLDOWN_S). Both ran on the authority's own clock, which restarts at 0 on a migrated host, and rode no
// keyframe: a press under way started over, and a pair still cooling could ram again at once. They now run on the battle
// clock and ride NewModeCheckpoint.host (crushPresses by the record's index in the world's static obstacles, ramPairs by
// the pair). Built as killCreditMigration builds a handoff: one actor plays, a keyframe is sealed, encoded, decoded and
// applied to a second actor on the same roster and its own copy of the world, and both hosts step on alike:
//   [1] a hull turning on the spot into a bench (crushPress.selftest's fixture), handed off mid-press: the new host fells
//       the bench on the old host's tick;
//   [2] two hulls driven into each other, handed off just after a ram and clashing again on both hosts while the pair
//       cools: the new host's next rams fall on the old host's ticks.
// Negative controls: the same handoffs with the keyframe sealed without that ledger (the reverted carry): the press starts
// over (the bench falls later) and the pair rams again inside its cooldown.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const DT = 1 / 60;
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);

/** A world of its own for each host: flat ground and `records` (crushable benches), as crushPress.selftest's fixture. */
function worldOf(records) {
  return {
    mapId: 'verdant',
    heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) },
    getObstacles: () => records,
    queryObstacles: (minX, minZ, maxX, maxZ, out) => {
      out.length = 0;
      for (const r of records) if (!r.crushed && r.max[0] >= minX && r.min[0] <= maxX && r.max[2] >= minZ && r.min[2] <= maxZ) out.push(r);
      return out;
    },
    raycast: () => null,
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
}
const benches = () => [1, -1].map((side, index) => ({
  min: [side > 0 ? 1.95 : -2.55, -100, -47.4], max: [side > 0 ? 2.55 : -1.95, 100, -46.4], kind: 'bench', crushable: true,
  propIdx: 60 + index, shape2: { kind: 'obb', cx: side * 2.25, cz: -46.9, hw: 0.3, hl: 0.5, yaw: 0 } }));

function actorFor(seats, records, resume = null) {
  return createMatchActor({ roomId: 'press-ram', mapId: 'verdant', seed: 7, seats, bots: [], world: worldOf(records), countdownS: 0, autoStart: false,
    now: () => 0, schedule: () => () => {}, resume });
}
/** One step; the rams it told, as 'a|b'. */
function step(sim, inputs) {
  sim.step({ dt: DT, inputs });
  const rams = sim.eventsForViewer('migration').filter((event) => event.type === 'tank_ram').map((event) => `${event.aId}|${event.bId}`);
  sim.afterEventBroadcast();
  return rams;
}
/** The old host's keyframe now, applied to a new actor on its own world; `drop` names a host ledger sealed without. */
function handoff(old, seats, records, drop = null) {
  const sim = old.authority;
  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const modeCheckpoint = sim.captureModeCheckpoint();
  if (drop) delete modeCheckpoint.host[drop];
  const snapshot = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  const keyframe = { tick, battleTimeMs, timeS: sim.timeS, battleS: sim.battleS, phase: 'playing', modeCheckpoint, entities: captureEntityExtras(old),
    frame: { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
      meta: captureMeta({ ...snapshot.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)),
      shells: [], viewer: null, modeStateJson: null } };
  const fresh = actorFor(seats, records, { tick, battleTimeMs, battleS: sim.battleS });
  applyResumeState(fresh, decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe)));
  fresh.authority.onMatchReady();
  return { fresh, sealed: modeCheckpoint.host };
}
const control = (values) => ({ throttle: 0, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0, ...values });

console.log('[1] a crush press under way');
{
  const seats = [
    { seat: 0, playerId: 'pivot-a', name: 'A', team: 'alpha', specId: SPEC, spawn: { x: 0, z: -50, yaw: 0 } },
    { seat: 1, playerId: 'pivot-b', name: 'B', team: 'bravo', specId: SPEC, spawn: { x: 0, z: 50, yaw: Math.PI } },
  ];
  const pivot = () => new Map([['pivot-a', control({ steer: 1 })]]);
  /** Ticks until a bench falls on `sim` (at most `limit`), or -1. */
  const toFell = (sim, records, limit) => {
    const inputs = pivot();
    for (let tick = 1; tick <= limit; tick++) { step(sim, inputs); if (records.some((r) => r.crushed)) return tick; }
    return -1;
  };
  const fresh = benches(), freshActor = actorFor(seats, fresh);
  freshActor.authority.onMatchReady();
  const fell = toFell(freshActor.authority, fresh, 180);
  freshActor.stop();
  assert.ok(fell > 20, `setup: the turning hull fells a bench through the press (tick ${fell})`);
  const run = (drop) => {
    const oldRecords = benches(), old = actorFor(seats, oldRecords);
    old.authority.onMatchReady();
    assert.equal(toFell(old.authority, oldRecords, fell - 8), -1, 'setup: the old host stops 8 ticks short of the fell');
    const newRecords = benches();
    const { fresh: next, sealed } = handoff(old, seats, newRecords, drop);
    const atOld = toFell(old.authority, oldRecords, 120), atNew = toFell(next.authority, newRecords, 120);
    old.stop(); next.stop();
    return { sealed, atOld, atNew };
  };
  const carried = run(null);
  assert.ok(carried.sealed.crushPresses?.length > 0 && carried.sealed.crushPresses.every(([index, hullId]) => Number.isInteger(index) && hullId === 'pivot-a'),
    `the keyframe carries the press by the bench's index (${JSON.stringify(carried.sealed.crushPresses)})`);
  assert.equal(carried.atOld, 8, 'the old host fells the bench 8 ticks on, as a fresh match does');
  assert.equal(carried.atNew, carried.atOld, `the new host fells it on the old host's tick (${carried.atNew})`);
  const bare = run('crushPresses');
  // (started over, the turning hull swings off the bench before its 0.45 s: no fell inside the 2 s watched)
  assert.ok(bare.atNew === -1 || bare.atNew > bare.atOld + 10, `negative control: without the carried press the new host starts it over (${bare.atNew === -1 ? 'no fell in 120 ticks' : `${bare.atNew} ticks`} against ${bare.atOld})`);
  console.log(`  ok  the press rides the keyframe: fell ${carried.atNew} ticks after the handoff on both hosts; without it ${bare.atNew === -1 ? 'none in 120 ticks' : bare.atNew}`);
}

console.log('[2] a ram pair cooling');
{
  const seats = [
    { seat: 0, playerId: 'ram-a', name: 'A', team: 'alpha', specId: SPEC, spawn: { x: 0, z: 0, yaw: 0 } },
    { seat: 1, playerId: 'ram-b', name: 'B', team: 'bravo', specId: SPEC, spawn: { x: 0, z: 14, yaw: Math.PI } },
  ];
  const drive = () => new Map([['ram-a', control({ throttle: 1 })], ['ram-b', control({ throttle: 1 })]]);
  /** Every tick in `ticks` that told a ram, from the step after the call. */
  const ramTicks = (sim, ticks) => {
    const inputs = drive(), out = [];
    for (let tick = 1; tick <= ticks; tick++) if (step(sim, inputs).length) out.push(tick);
    return out;
  };
  const run = (drop) => {
    const old = actorFor(seats, []);
    old.authority.onMatchReady();
    const inputs = drive();
    let first = -1;
    for (let tick = 1; tick <= 600 && first < 0; tick++) if (step(old.authority, inputs).length) first = tick;
    assert.ok(first > 0, `setup: the hulls ram (tick ${first})`);
    // the hulls rebound apart, the pair still cooling (RAM_PAIR_COOLDOWN_S is 30 ticks)
    for (let n = 0; n < 8; n++) step(old.authority, inputs);
    const { fresh: next, sealed } = handoff(old, seats, [], drop);
    // the same clash on both hosts while the pair cools: each hull driven back in at 6 m/s
    for (const sim of [old.authority, next.authority]) for (const id of ['ram-a', 'ram-b']) sim.entityById.get(id).state.speed = 6;
    const atOld = ramTicks(old.authority, 90), atNew = ramTicks(next.authority, 90);
    old.stop(); next.stop();
    return { sealed, atOld, atNew };
  };
  const carried = run(null);
  assert.ok(carried.sealed.ramPairs?.length === 1 && carried.sealed.ramPairs[0][0] === 'ram-a|ram-b', `the keyframe carries the cooling pair (${JSON.stringify(carried.sealed.ramPairs)})`);
  assert.ok(!carried.atOld.length || carried.atOld[0] > 22, `setup: the old host's pair cools through the clash (rams on ticks ${carried.atOld.join(', ') || 'none'})`);
  assert.deepEqual(carried.atNew, carried.atOld, `the new host rams on the old host's ticks (${carried.atNew.join(', ') || 'none'} on both)`);
  const bare = run('ramPairs');
  assert.ok(bare.atNew.length && bare.atNew[0] <= 22 && bare.atNew[0] < (bare.atOld[0] ?? Infinity),
    `negative control: without the carried cooldown the new host rams inside it (tick ${bare.atNew[0]}; the old host ${bare.atOld.join(', ') || 'none'})`);
  console.log(`  ok  the cooldown rides the keyframe: rams on ticks ${carried.atNew.join(', ') || 'none'} on both hosts; without it on tick ${bare.atNew[0]}`);
}

console.log('pressAndRamMigration.selftest: a crush press under way and a ram pair\'s cooldown ride a migration on the battle clock (crushPresses by the record\'s obstacle index, ramPairs by the pair); without them the press starts over and the pair rams inside its cooldown');
