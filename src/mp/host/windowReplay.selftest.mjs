// The window between the keyframe and the seat's newest frame, played again on the new host (276; migrationState.ts
// replayWindow): what the replay reads from the seat and how the seat's frame corrects it. migrationTwins holds the
// result (to the bit where the window holds play alone); this receipt holds the parts, each through the real resume
// (a match actor, resumeStateFromRetained, applyResumeState), the old host run on beside it.
// [1] which resumes replay, and on what clocks: a newer frame in play within MAX_REPLAY_STEPS replays the battle clocks'
//     steps on an actor built on the keyframe's clocks (resumeClocksOf), and ends on the old host's battle clock exactly;
//     an actor built on the frame's is refused; a window whose ticks the old host dropped replays its battle clocks' steps.
//     None replays from a keyframe alone, a keyframe that names no battle clock (an older host's), a frame that shows a
//     verdict, or a window past MAX_REPLAY_STEPS: those take the 275 reading.
// [2] a row at its own tick: a far tier's row the seat holds from before its frame corrects the play at that step, and
//     the seat's hull drives on from it on its held command (applied at the frame instead, it stood where the row was).
//     [2b] the seat's held command holds its trigger off: a seat that pressed fire as the keyframe was sealed fires no
//     round in the play.
// [3] the fight from the rows: what another hand did in the window (a seat's shell the play never fired: a hull's hp cut
//     and a reactive plate spent, one destroyed and its turret thrown; the seat's own shot) is the rows' on the new host:
//     the hp, the plate, the life (the mode takes the death on its first step), the thrown turret, the shooter's
//     ammunition and reload.
// [4] a life the play took that the rows show alive (a fire the old host saw put out): the hull stands alive with the
//     row's hp, and the mode adopts it on its first step (no respawn due).
// [5] the mode as the seat's frame shows it: a flag the seat's hull lifted in the window, which the play never reached,
//     is carried by it on the new host, at a carrier's pace; a mode view that agrees leaves the play's own. [5b] the old
//     host's carrier scored in the window while the play's carries on: at the resume no carrier, at the old host's pace.
// [6] what the seat was told of: a prop's fall (the fence crushed in the new world), craters and holes in the destruction
//     log, a smoke screen the seat raised in the window: each once (one the play made, or the keyframe stood, is not
//     doubled). A deed is matched one for one where it is, not by its number, which a seat's deed in the window shifts, nor
//     by a section alone; two craters on one spot are two. The seat's are laid down under this host's next numbers.
//     [6b] (destructionMatch's own restore on verdant's structures) a hole the play did not make, beside one it did, opens
//     in its section's next slot, and a late joiner from this host's log opens both.
// [7] a seat's kill in a mode that scores it (Zone Control, Gun Game): the frame's view differs (the score) and is taken
//     without rewriting a life or re-arming a gun (a fresh controller's restore stood the victim up at 0 hp and gave every
//     Gun Game hull a loaded gun); the victim goes down at the resume with its respawn due; the score is exact.
// [8] the frame's view where another hand parted it from the play: a zone meter (Zone Control's; Frontline's, its line
//     unmoved), now and 2 s on; a survivor infected (the frame alone shows the death: no conversion announced again, its
//     respawn at most the window late; and one risen again among the infected inside a longer window, its faction the
//     frame's; each at the infected's pace); a survivor the play alone infected (a hand on the play's own steps), a
//     survivor again where a row stands it up, and the play's (rising as one of the infected) where none does; a ring
//     arrival the play did not make by the frame, taken as made, and one killed again before the frame, taken then down;
//     the ball struck, to the bit and 1 s on.
// Also: a far tier's row is another seat's ([2]); a row that parts on the fire or the magazine alone ([3]); the play's own
// events of the window go to no seat ([5]); a keyframe sealed in the countdown, with no mode checkpoint, or with its clocks
// 2.5 ms apart is not replayed ([1]).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { MAX_REPLAY_STEPS, applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeClocksOf, resumeStateFromRetained } from './migrationState.ts';
import { PHASE, VERDICT } from '../wire/constants.ts';
import { dequantizePosition, dequantizeReloadS } from '../wire/quantize.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { createDestructionMatch } from '../../sim/destructionMatch.ts';
import { createTerrainDeformation } from '../../sim/terrainDeformation.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { quantizeDestructionEntry } from '../wire/destructionLog.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const spec = 'm1a1_abrams_hc';
// (b-0 a T-90AM: reactive plates a row shows spent)
// (h1 a Leclerc: an autoloader's magazine a row counts)
await ensureAuthorityFleet([spec, 't90am', 'leclerc_s2']);
const seats = [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }, { seat: 1, playerId: 'h1', name: 'H1', team: 'alpha', specId: 'leclerc_s2' }];
const bots = [...[0, 1].map((i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
  ...[0, 1, 2].map((i) => ({ playerId: `b-${i}`, name: `B${i}`, team: 'bravo', specId: i === 0 ? 't90am' : spec }))];
/** Flat ground and a row of crushable fences far off the field (migrationState.selftest's), one world per host. */
const makeWorld = () => {
  const obstacles = Array.from({ length: 12 }, (_, index) => ({ min: [900 + index * 3, 0, 900], max: [901 + index * 3, 2, 901], crushable: true, kind: 'fence', crushed: false, shape2: null }));
  return {
    mapId: 'verdant', obstacles,
    heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) },
    getObstacles: () => obstacles,
    queryObstacles(minX, minZ, maxX, maxZ, out) { out.length = 0; for (const o of obstacles) if (o.max[0] >= minX && o.min[0] <= maxX && o.max[2] >= minZ && o.min[2] <= maxZ) out.push(o); return out; },
    raycast: () => null,
    crushObstacle(obstacle) { if (obstacle.crushed) return false; obstacle.crushed = true; return true; },
  };
};
const makeFor = (mode, ruleset = matchRulesetFor(mode)) => (resume) => createMatchActor({ roomId: 'window-replay', mapId: 'verdant', mode, seed: 5, seats, bots, ruleset,
  world: makeWorld(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const make = makeFor('capture_the_flag');
const inputs = new Map();
const seatInput = (over = {}) => ({ throttle: 1, steer: 0.3, brake: false, fire: false, fireIntentSeq: null, aimLocked: false, shellSlot: 0, actionBits: 0,
  aimYaw: 0, aimPitch: 0, aimDistance: 200, ...over });

/** The actor's frame at `tick`: the seat's (its viewer h0) or, `sealed`, a keyframe's; `rows` rewrites rows (a held row). */
function frameOf(actor, tick, era, sealed = false, rows = (r) => r) {
  const sim = actor.authority, battleTimeMs = Math.round(sim.battleS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'h0', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [...(snap.meta.destroyedObstacleIndices ?? [])],
    destruction: (snap.meta.destructionLog ?? []).map((entry) => ({ ...entry })),
    entities: rows(sim.entities.map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick))),
    shells: [], viewer: sealed ? null : { entityId: actor.wireIdOf('h0') }, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}
const seal = (actor, tick, era) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(actor.authority.battleS * 1000),
  timeS: actor.authority.timeS, battleS: actor.authority.battleS, phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(),
  entities: captureEntityExtras(actor), frame: frameOf(actor, tick, era, true) }));

/**
 * A CTF match `t0` s in (the seat driving its weave from `driveFrom` s), `before` run on the old host just before the
 * keyframe, then `window` ticks on with `during(old, step)` before each; the seat's frame then (`rows` rewrites its rows).
 */
function stage({ t0 = 20, window = 30, driveFrom = Infinity, driver = 'h0', mode = 'capture_the_flag', ruleset = matchRulesetFor(mode), before = () => {}, during = () => {}, rows = (r) => r } = {}) {
  const old = makeFor(mode, ruleset)(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = [];
  const step = () => { sim.step({ dt: 1 / 60, inputs }); tick++; for (const ev of sim.eventsForViewer('h0')) if (ev.type === 'mode_respawn') told.push([ev.id, tick]); sim.afterEventBroadcast(); };
  for (let k = 0; k < t0 * 60; k++) { if (k >= driveFrom * 60) inputs.set(driver, seatInput()); step(); }
  before(old);
  const era = createEraIndexer();
  const keyframe = seal(old, tick, era);
  const keyTick = tick;
  told.length = 0;
  for (let k = 1; k <= window; k++) { during(old, k); step(); }
  const latest = frameOf(old, tick, era, false, rows);
  return { old, keyframe, latest, keyTick, tick, told: [...told], era, mode, ruleset };
}
/** The new host as matchHostCore.ts boots it: on resumeClocksOf's clocks, the state applied, the battle on (`pending`: the
 *  events left queued for its first broadcast). */
function resumeOf(staged, { fallen = [] } = {}) {
  const { state } = resumeStateFromRetained(staged.keyframe, 0, staged.latest, 500, fallen, [], staged.told);
  const fresh = makeFor(staged.mode, staged.ruleset)({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  const pending = fresh.authority.pendingEventCount;
  fresh.authority.onMatchReady();
  return { state, fresh, applied, pending };
}
const stepBoth = (...actors) => { for (const actor of actors) { actor.authority.step({ dt: 1 / 60, inputs }); actor.authority.eventsForViewer('h0'); actor.authority.afterEventBroadcast(); } };

console.log('[1] which resumes replay, and on what clocks');
{
  const staged = stage();
  const { state, fresh, applied } = resumeOf(staged);
  const old = staged.old;
  ok(state.replay?.steps === 30 && resumeClocksOf(state).battleS === staged.keyframe.battleS && resumeClocksOf(state).battleTimeMs === staged.keyframe.battleTimeMs,
    `a frame 30 ticks newer replays its 30 steps on the keyframe's clocks (${state.replay?.steps} steps from ${staged.keyframe.battleS.toFixed(3)} s)`);
  ok(applied.replayed?.steps === 30 && fresh.authority.battleS === old.authority.battleS
    && Math.abs(fresh.resumedBattleTimeMs + fresh.authority.timeS * 1000 - staged.latest.meta.battleTimeMs) <= 1,
  `and ends on the old host's battle clock exactly (${fresh.authority.battleS} against ${old.authority.battleS}; published ${(fresh.resumedBattleTimeMs + fresh.authority.timeS * 1000).toFixed(1)} ms against the frame's ${staged.latest.meta.battleTimeMs})`);
  ok(applied.replayed?.modeFromFrame === false && applied.replayed?.corrected === 0 && applied.replayed?.verdict === false, `a window of play alone needs no row `
    + `and leaves the mode the play's (${applied.replayed?.corrected} rows, mode from the frame: ${applied.replayed?.modeFromFrame}, no verdict)`);
  const wrongClocks = make({ tick: state.tick, battleTimeMs: state.battleTimeMs, battleS: state.battleS });
  assert.throws(() => applyResumeState(wrongClocks, state), /resumeClocksOf/, 'an actor built on the frame\'s clocks is refused');
  ok(true, 'an actor built on the frame\'s clocks is refused (it would end a window late)');
  for (const actor of [old, fresh, wrongClocks]) actor.stop();
  // none of these replays: the 275 reading of them resumes on the state's own clocks
  const plain = stage({ window: 30 });
  const cases = [
    ['a keyframe alone', resumeStateFromRetained(plain.keyframe, 0, null, null, []).state],
    ['a keyframe that names no battle clock (an older host\'s)', resumeStateFromRetained({ ...plain.keyframe, battleS: undefined }, 0, plain.latest, 500, []).state],
    ['a frame that shows a verdict', resumeStateFromRetained(plain.keyframe, 0, { ...plain.latest, meta: { ...plain.latest.meta, verdict: VERDICT.ALPHA, verdictReason: 'score' } }, 500, []).state],
    ['a keyframe sealed in the countdown', resumeStateFromRetained({ ...plain.keyframe, frame: { ...plain.keyframe.frame, meta: { ...plain.keyframe.frame.meta, phase: PHASE.COUNTDOWN, countdownMs: 500 } } }, 0, plain.latest, 500, []).state],
    ['a keyframe with no mode checkpoint', resumeStateFromRetained({ ...plain.keyframe, modeCheckpoint: undefined }, 0, plain.latest, 500, []).state],
    // (an actor takes a keyframe's float clock only within 2 ms of its milliseconds, matchActor.ts: the replay's gate is the
    // same; the frame's clock still agrees with the keyframe's steps, so only that gate refuses it)
    ['a keyframe whose two clocks part by 2.5 ms', resumeStateFromRetained({ ...plain.keyframe, battleTimeMs: plain.keyframe.battleTimeMs - 2.5 }, 0, plain.latest, 500, []).state],
  ];
  const long = stage({ t0: 5, window: MAX_REPLAY_STEPS + 10 });
  cases.push([`a window of ${MAX_REPLAY_STEPS + 10} steps`, resumeStateFromRetained(long.keyframe, 0, long.latest, 500, []).state]);
  for (const [label, read] of cases) {
    const clocks = resumeClocksOf(read);
    ok(!read.replay && clocks.battleTimeMs === read.battleTimeMs, `${label}: no replay, the state's own clocks (${clocks.battleTimeMs} ms)`);
  }
  const longFresh = make({ tick: cases.at(-1)[1].tick, ...resumeClocksOf(cases.at(-1)[1]) });
  ok(!applyResumeState(longFresh, cases.at(-1)[1]).replayed, 'and the long window resumes as 275 read it');
  // a window whose ticks the old host's loop dropped (server/match/loop.ts: the tick keeps the wall grid while the sim
  // stands): the frame 20 ticks past its 30 steps; the steps are the battle clocks', not the ticks'
  const dropped = stage();
  dropped.latest = { ...dropped.latest, tick: dropped.latest.tick + 20, entities: dropped.latest.entities.map((row) => ({ ...row, tick: row.tick + 20 })) };
  const droppedResume = resumeOf(dropped);
  ok(droppedResume.applied.replayed?.steps === 30 && droppedResume.fresh.authority.battleS === dropped.old.authority.battleS,
    `a window whose ticks the old host dropped replays the battle clocks' steps (${droppedResume.applied.replayed?.steps} for 50 ticks) to its clock`);
  for (const actor of [plain.old, long.old, longFresh, dropped.old, droppedResume.fresh]) actor.stop();
}

console.log('[2] a row at its own tick');
{
  // another seat (h1) drives on one command through the window; the elected seat's frame holds its row from 12 ticks before
  // (a far tier's: the elected seat's own row is always the frame's)
  const held = 12;
  let heldRow = null;
  const staged = stage({ driveFrom: 18, driver: 'h1', rows: (rows) => rows.map((row) => (row.entityId === heldRow?.entityId ? heldRow : row)),
    during: (old, k) => { if (k === 30 - held) heldRow = captureEntityRow(old.authority.entityById.get('h1'), old.wireIdOf('h1'), createEraIndexer(), old.authority.timeS * 60 | 0); } });
  // (the held row's tick is the old host's step count at its capture: the keyframe's plus 30 - held)
  heldRow.tick = staged.keyTick + 30 - held;
  staged.latest.entities = staged.latest.entities.map((row) => (row.entityId === heldRow.entityId ? heldRow : row));
  const { fresh, applied } = resumeOf(staged);
  const a = staged.old.authority.entityById.get('h1').state.pos, b = fresh.authority.entityById.get('h1').state.pos;
  const rowM = Math.hypot(dequantizePosition(heldRow.x) - a.x, dequantizePosition(heldRow.z) - a.z), newM = Math.hypot(b.x - a.x, b.z - a.z);
  // (within a third of the held row's distance: the row reseats the ride and the spring, and the held aim is the
  // keyframe's, so the play's hull drives on near the old one's, not on it)
  ok(applied.replayed?.corrected >= 1 && rowM > 1 && newM < rowM / 3, `corrected at its own step and driven on: the seat's hull stands ${newM.toFixed(3)} m from the `
    + `old host's at the frame (its held row, ${held} ticks old, ${rowM.toFixed(2)} m)`);
  inputs.delete('h1');
  staged.old.stop(); fresh.stop();
}

console.log('[2b] a seat holding its trigger at the keyframe fires nothing in the play');
{
  // the seat presses fire as the keyframe is sealed and lets go: the play holds its last command, its trigger held off
  let triggerAtKey = false;
  const staged = stage({ before: (old) => {
    // a step with the trigger held (its round leaves before the keyframe), so the hull's command holds it when sealed
    inputs.set('h0', seatInput({ throttle: 0, steer: 0, brake: true, fire: true, fireIntentSeq: 7 }));
    old.authority.step({ dt: 1 / 60, inputs }); old.authority.afterEventBroadcast();
    const h0 = old.authority.entityById.get('h0');
    triggerAtKey = h0.input.fire === true;
    // its gun nearly loaded again: a trigger held through the play would fire within the window
    h0.combat.reload.t = Math.min(h0.combat.reload.t, 0.1);
  }, during: (old, k) => { if (k === 1) inputs.set('h0', seatInput({ throttle: 0, steer: 0, brake: true })); } });
  inputs.delete('h0');
  const { fresh } = resumeOf(staged);
  const ownShells = (actor) => actor.authority.snapshot({ tick: staged.tick, serverTimeMs: 0, viewerId: '', ackInputSeq: null }).shells.filter((shell) => shell.shooterId === 'h0').length;
  ok(triggerAtKey && ownShells(fresh) === 0, `the trigger held as the keyframe was sealed: no round of the seat's leaves in the play (${ownShells(fresh)} in flight on `
    + `the new host, ${ownShells(staged.old)} on the old)`);
  staged.old.stop(); fresh.stop();
}

console.log('[3] the fight from the rows');
{
  const staged = stage({ driveFrom: 18, during: (old, k) => {
    const sim = old.authority;
    if (k === 2) inputs.set('h0', seatInput({ fire: true, fireIntentSeq: 1 }));
    if (k === 3) inputs.set('h0', seatInput());
    // another hand's shell (a seat's the play never fired): one hull's hp cut and a reactive plate spent, another destroyed
    // and its turret thrown
    if (k === 5) {
      const b0 = sim.entityById.get('b-0').combat;
      b0.hp -= 300; (b0.eraSpent ??= new Set()).add('glacis_era_L');
      const b1 = sim.entityById.get('b-1'); b1.combat.hp = 0; b1.combat.destroyed = true;
      const p = b1.state.pos;
      sim.restoreWreckTurret('b-1', { x: p.x + 2, y: p.y + 1.5, z: p.z, qx: 0, qy: 0, qz: 0, qw: 1, asleep: false });
      // the other seat set alight, its hp as it was: a row that parts from the play on the fire alone
      const h1 = sim.entityById.get('h1').combat;
      h1.fire.burning = true; h1.fire.ticksLeft = 6; h1.fire.tickTimer = 0.4;
    }
  } });
  const { fresh, applied } = resumeOf(staged);
  const old = staged.old.authority, sim = fresh.authority;
  const rowOf = (id) => staged.latest.entities.find((row) => row.entityId === staged.old.wireIdOf(id));
  ok(applied.replayed?.corrected >= 3 && Math.round(sim.entityById.get('b-0').combat.hp) === rowOf('b-0').hp && rowOf('b-0').hp < sim.entityById.get('b-0').combat.maxHp,
    `the hull another hand hit takes the row's hp (${sim.entityById.get('b-0').combat.hp} = ${rowOf('b-0').hp})`);
  const h0 = sim.entityById.get('h0').combat, h0Row = rowOf('h0');
  ok(h0.ammo[0] === h0Row.ammo0 && h0Row.ammo0 < old.entityById.get('h0').combat.ammo[0] + 1 && Math.abs(h0.reload.t - dequantizeReloadS(h0Row.reload)) < 1e-9 && h0Row.reload > 0,
    `the seat's own shot: its ammunition (${h0.ammo[0]}) and its reload (${h0.reload.t.toFixed(3)} s left) are the row's`);
  ok(sim.entityById.get('b-0').combat.eraSpent?.has('glacis_era_L') && rowOf('b-0').eraSpent.length > 0, `its reactive plate the row shows spent is spent `
    + `(${[...sim.entityById.get('b-0').combat.eraSpent ?? []].join(', ')})`);
  const thrown = rowOf('b-1').wreckBody, body = sim.entityById.get('b-1')._wreckTurret;
  ok(!!thrown && !!body && Math.abs(body[0] - thrown.x / 1000) < 0.002, `and the hull it destroyed has its turret thrown where the row has it `
    + `(${body ? body[0].toFixed(2) : 'none'} against ${thrown ? (thrown.x / 1000).toFixed(2) : 'none'})`);
  ok(sim.entityById.get('h1').combat.fire.burning && old.entityById.get('h1').combat.fire.burning, 'the other seat, set alight in the window, burns on the new host');
  stepBoth(staged.old, fresh);
  const b1 = sim.entityById.get('b-1'), b1Old = old.entityById.get('b-1');
  ok(b1.combat.destroyed && b1.modeLife === 'down' && b1Old.modeLife === 'down', `the hull it destroyed is down, and the mode took the death on its first step `
    + `(${b1.modeLife}; the old host's ${b1Old.modeLife})`);
  inputs.delete('h0');
  staged.old.stop(); fresh.stop();
}

console.log('[3b] a row that parts from the play on its magazine alone');
{
  // the other seat's autoloader round spent in the window, its intra-clip reload already done (an unlimited-ammunition
  // mode refills the rack and not the magazine): ammunition, reloads and hp read as the play's, the magazine count does not
  const staged = stage({ during: (old, k) => { if (k === 5) old.authority.entityById.get('h1').combat.magazine.rounds -= 1; } });
  const { fresh, applied } = resumeOf(staged);
  const h1New = fresh.authority.entityById.get('h1').combat, h1Old = staged.old.authority.entityById.get('h1').combat;
  const row = staged.latest.entities.find((r) => r.entityId === staged.old.wireIdOf('h1'));
  ok(applied.replayed?.corrected >= 1 && h1New.magazine.rounds === h1Old.magazine.rounds && row.magazineRounds === h1Old.magazine.rounds,
    `the seat holds the rounds its row counts (${h1New.magazine.rounds} of ${h1New.magazine.capacity}; the old host's ${h1Old.magazine.rounds})`);
  staged.old.stop(); fresh.stop();
}

console.log('[4] a life the play took that the rows show alive');
{
  // b-2 at 1 hp, burning and its charges spent at the keyframe; in the window another hand puts the old host's fire out and
  // mends it (the play's burns on and takes the hull)
  const staged = stage({ window: 45, before: (old) => {
    const b2 = old.authority.entityById.get('b-2'), c = b2.combat;
    c.hp = 1; c.fire.burning = true; c.fire.ticksLeft = 4; c.fire.tickTimer = 0;
    if (b2.consumables) b2.consumables.charges.fill(0);
  }, during: (old, k) => { if (k === 1) { const c = old.authority.entityById.get('b-2').combat; c.fire.burning = false; c.hp = 500; } } });
  const { fresh, applied, state } = resumeOf(staged);
  // the play alone took it: the same resume with the seat's rows of b-2 left out
  const b2Wire = staged.old.wireIdOf('b-2');
  const playOnly = make({ tick: state.tick, ...resumeClocksOf(state) });
  applyResumeState(playOnly, { ...state, frame: { ...state.frame, entities: state.frame.entities.filter((row) => row.entityId !== b2Wire || row.tick <= staged.keyTick) } });
  const b2 = fresh.authority.entityById.get('b-2'), b2Old = staged.old.authority.entityById.get('b-2');
  ok(playOnly.authority.entityById.get('b-2').combat.destroyed && !b2Old.combat.destroyed && !b2.combat.destroyed && b2.combat.hp === 500 && !b2.combat.fire.burning,
    `the play burns the hull down, the old host's was mended: it stands alive with the row's hp (${b2.combat.hp}), its fire out (${applied.replayed?.corrected} rows set the play right)`);
  playOnly.stop();
  stepBoth(staged.old, fresh);
  const respawns = fresh.authority.captureModeCheckpoint().mode.respawns.map(([id]) => id);
  ok(b2.modeLife === 'alive' && !b2.combat.destroyed && !respawns.includes('b-2'), `and the mode adopts it on its first step (${b2.modeLife}, no respawn due: `
    + `${JSON.stringify(respawns)})`);
  staged.old.stop(); fresh.stop();
}

console.log('[5] the mode as the seat\'s frame shows it');
{
  // the seat's hull stood on the bravo flag by another hand until it lifts it (the play's hull never reached it); the
  // carrier at the standing pace (FLAG_CARRIER_SPEED_SCALE: CTF's own pitch keeps a carrier's full pace)
  const ctf = matchRulesetFor('capture_the_flag');
  const staged = stage({ window: 40, ruleset: { ...ctf, flagPitch: { ...ctf.flagPitch, carrierSpeedScale: undefined } }, during: (old) => {
    const flag = old.authority.modeController.state.flags.find((f) => f.team === 'bravo');
    if (flag.status !== 'carried') { const h0 = old.authority.entityById.get('h0'); h0.state.pos.set(flag.x, 0, flag.z); h0.state.speed = 0; }
  } });
  const { fresh, applied, pending } = resumeOf(staged);
  const flagOld = staged.old.authority.modeController.state.flags.find((f) => f.team === 'bravo');
  const flagNew = fresh.authority.modeController.state.flags.find((f) => f.team === 'bravo');
  ok(flagOld.status === 'carried' && flagOld.carrierId === 'h0' && applied.replayed?.modeFromFrame === true && flagNew.status === 'carried' && flagNew.carrierId === 'h0',
    `the flag the seat lifted in the window is carried by it on the new host (${flagNew.status} by ${flagNew.carrierId}; the mode from the frame: `
    + `${applied.replayed?.modeFromFrame})`);
  const paceOld = staged.old.authority.entityById.get('h0').modeSpeedMultiplier, paceNew = fresh.authority.entityById.get('h0').modeSpeedMultiplier;
  ok(paceNew === paceOld && paceNew < 1, `and drives at a carrier's pace there, as on the old host (x${paceNew} against x${paceOld})`);
  // every seat heard the old host's events of the window (the lift among them): the play's own go to none
  ok(pending === 0, `and none of the play's own events waits for the new host's first broadcast (${pending} pending)`);
  staged.old.stop(); fresh.stop();
}

console.log('[5b] a flag the old host\'s carrier scored in the window, which the play\'s still carries');
{
  // h0 lifts the bravo flag before the keyframe; another hand puts the old host's h0 on its own flag 5 ticks into the window
  // and it scores (the flag home, its pace given back); the play's h0 carries on. At the resume the carrier is no carrier,
  // at the old host's pace
  const ctf = matchRulesetFor('capture_the_flag');
  const ruleset = { ...ctf, flagPitch: { ...ctf.flagPitch, carrierSpeedScale: undefined } };
  const flagOf = (actor, team) => actor.authority.modeController.state.flags.find((f) => f.team === team);
  const staged = stage({ ruleset, before: (old) => {
    for (let k = 0; k < 120 && flagOf(old, 'bravo').status !== 'carried'; k++) {
      const flag = flagOf(old, 'bravo'), h0 = old.authority.entityById.get('h0');
      h0.state.pos.set(flag.x, 0, flag.z); h0.state.speed = 0;
      old.authority.step({ dt: 1 / 60, inputs }); old.authority.afterEventBroadcast();
    }
  }, during: (old, k) => {
    if (k !== 5) return;
    const home = flagOf(old, 'alpha'), h0 = old.authority.entityById.get('h0');
    h0.state.pos.set(home.x, 0, home.z); h0.state.speed = 0;
  } });
  const { fresh } = resumeOf(staged);
  const paceOf = (actor) => actor.authority.entityById.get('h0').modeSpeedMultiplier;
  const flagOld = flagOf(staged.old, 'bravo'), flagNew = flagOf(fresh, 'bravo');
  ok(staged.keyframe.modeCheckpoint.mode.objectives.flags.find((f) => f.team === 'bravo').carrierId === 'h0' && flagOld.status !== 'carried'
    && flagNew.status === flagOld.status && flagNew.carrierId === null && paceOf(fresh) === paceOf(staged.old) && paceOf(fresh) === 1,
  `h0 carried the flag at the keyframe and scored it in the window; at the resume it carries nothing, at the old host's pace (x${paceOf(fresh)} against `
    + `x${paceOf(staged.old)}; the flag ${flagNew.status})`);
  staged.old.stop(); fresh.stop();
}

console.log('[6] what the seat was told of');
{
  // the seat's smoke before the keyframe (the keyframe stands it) and in the window (the play never raised it); a fence the
  // seat was told fell; a crater in the frame's log
  const smoke = (old) => { inputs.set('h0', seatInput({ throttle: 0, steer: 0, brake: true, actionBits: PLAYER_ACTION_BITS.SMOKE })); old.authority.step({ dt: 1 / 60, inputs }); old.authority.afterEventBroadcast(); inputs.delete('h0'); };
  const staged = stage({ before: (old) => { smoke(old); old.authority.entityById.get('h0').combat.auxiliary.smokeReadyAt = 0; }, during: (old, k) => { if (k === 4) { smoke(old); } } });
  // a crater the play holds as its 6 (the keyframe's log stands in for the play's own deed: no shell digs this hard ground)
  // and the frame's log: the seat's crater first (the old host's 6), the play's deed after it (the old host's 7), and the
  // seat's second crater on the play's spot (8): matched one for one where each is, the seat's two laid down under this
  // host's next numbers (before: the frame's numbers gave two craters the id 6 and the next one an id the seats held; and
  // the second crater on one spot read as the play's and was lost)
  const crater = (craterId, x) => ({ kind: 'crater', craterId, x, z: 40, radiusM: 1.5, depthM: 0.3, rimM: 0.1, seed: 9 });
  // and two holes in one section of one structure: the play's (x 60) and the seat's before it (x 61): matched by where
  // each is, not by the section alone (this world holds no structure: the log alone shows them)
  const hole = (slot, x) => ({ kind: 'breach', structureId: 0, section: 0, hole: slot, x, y: 1, z: 40, radiusM: 0.5, sectionDown: false });
  staged.keyframe.frame.destruction = [...(staged.keyframe.frame.destruction ?? []), crater(6, 46), hole(0, 60)];
  staged.latest.destruction = [...(staged.latest.destruction ?? []), crater(6, 47), crater(7, 46), crater(8, 46), hole(0, 61), hole(1, 60)];
  const { fresh } = resumeOf(staged, { fallen: [5] });
  const screens = (actor) => actor.authority.snapshotMeta('h0').smokeScreens;
  const oldScreens = screens(staged.old), newScreens = screens(fresh);
  ok(oldScreens.length === 2 && newScreens.length === 2, `both smoke screens stand once (${newScreens.length} on the new host, ${oldScreens.length} on the old)`);
  // the seat's kit as its row has it (its charge spent and its cooldown running: the play never pressed it)
  const kitOld = staged.old.authority.entityById.get('h0').combat.auxiliary, kitNew = fresh.authority.entityById.get('h0').combat.auxiliary;
  const leftOf = (kit, actor) => kit.smokeReadyAt - actor.authority.timeS;
  ok(kitNew.smokeCharges === kitOld.smokeCharges && Math.abs(leftOf(kitNew, fresh) - leftOf(kitOld, staged.old)) < 0.002,
    `and its smoke kit is its row's: ${kitNew.smokeCharges} charges, ${leftOf(kitNew, fresh).toFixed(3)} s to ready (the old host's ${kitOld.smokeCharges}, `
      + `${leftOf(kitOld, staged.old).toFixed(3)} s)`);
  const log = fresh.authority.snapshotMeta('h0').destructionLog;
  const at = (x) => log.filter((entry) => entry.kind === 'crater' && entry.x === x).length;
  const ids = log.filter((entry) => entry.kind === 'crater').map((entry) => entry.craterId);
  ok(at(46) === 2 && at(47) === 1, `each crater once: the play's and the seat's second on one spot, the seat's first (${at(46)} at x 46, ${at(47)} at x 47)`);
  ok(JSON.stringify(ids) === JSON.stringify([6, 7, 8]), `under this host's numbers, each its own and past every number the seats hold (${JSON.stringify(ids)})`);
  const holes = log.filter((entry) => entry.kind === 'breach').map((entry) => entry.x).sort((a, b) => a - b);
  ok(JSON.stringify(holes) === JSON.stringify([60, 61]), `each hole once, matched where it is (${JSON.stringify(holes)})`);
  const destroyed = fresh.authority.snapshotMeta('h0').destroyedObstacleIndices;
  ok(destroyed.includes(5) && fresh.authority.restoreDestroyedObstacles([5], 0).restored === 1, `the fence the seat was told fell is down on the new host (${JSON.stringify(destroyed)})`);
  staged.old.stop(); fresh.stop();
}

console.log('[6b] a hole the play did not make, beside one it did');
{
  // destructionMatch's own restore on verdant's sectioned structures (the replay lays the frame's missing deeds down so):
  // the old host opened the seat's hole first (its slot 0) and a bot's after it (1); the play made the bot's alone, in its
  // slot 0. Laid down under the frame's number the seat's hole was refused (its slot filled); under this host's next slot it
  // opens, and a late joiner reading this host's log opens both
  const rules = { ...matchRulesetFor('standard').destruction, craters: true, sections: true };
  const host = () => { const world = createDedicatedWorldCollision('verdant');
    return createDestructionMatch({ rules, obstacles: world.getObstacles(), colliders: world.getColliders(), ground: createTerrainDeformation(), groundTypeAt: () => 'medium' }); };
  const old = host(), play = host(), late = host();
  const target = play.structures.structures.find((structure) => structure.destructible && play.structures.sectionsOf(structure)?.count > 0);
  const hole = (slot, x) => quantizeDestructionEntry({ kind: 'breach', structureId: target.id, section: 0, hole: slot, x, y: 1.25, z: -900, radiusM: 0.5, sectionDown: false });
  const holes = (match) => JSON.stringify(Array.from(match.structures.sectionsOf(match.structures.structures.find((structure) => structure.id === target.id)).holeCount));
  old.restore([hole(0, 900.25), hole(1, 901.5)]);
  play.restore([hole(0, 901.5)]);
  const applied = play.restore([hole(0, 900.25)], true);
  ok(applied === 1 && holes(play) === holes(old) && play.log.at(-1).hole === 1, `the seat's hole opens in the section's next slot (${holes(play)} holes by section `
    + `against the old host's ${holes(old)}; logged as slot ${play.log.at(-1).hole})`);
  late.restore(play.log.map((entry) => ({ ...entry })));
  ok(holes(late) === holes(old), `a late joiner from this host's log opens both (${holes(late)})`);
}

console.log('[7] a seat\'s kill in a mode that scores it');
for (const mode of ['zone_control', 'gun_game']) {
  // the seat's shell in the window (the play never fires it): b-1 destroyed and scored as tank_destroyed scores a kill; the
  // frame's view then differs (the score), and the new host takes it without rewriting a life or re-arming a gun
  // (Zone Control 60 s in, where bravo holds the zones: the kill scores for the side whose running score carries a fraction
  // the play keeps exact; a hand the play never saw, credited to b-0)
  const [victimId, killerId] = mode === 'zone_control' ? ['a-1', 'b-0'] : ['b-1', 'h0'];
  const staged = stage({ mode, t0: mode === 'zone_control' ? 60 : 20, during: (old, k) => {
    if (k !== 5) return;
    const victim = old.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true;
    old.authority.modeController.recordDestruction(victimId, killerId, true);
  } });
  const { fresh, applied } = resumeOf(staged);
  const old = staged.old.authority, sim = fresh.authority;
  const guns = (actor) => actor.authority.entities.filter((e) => e.bot && !e.combat.destroyed).map((e) => `${e.id} ${e.combat.reload.kind} ${e.combat.reload.t.toFixed(4)} ${e.combat.ammo[0]}`).join('; ');
  const scoreOf = (actor) => JSON.stringify(actor.authority.modeController.captureCheckpoint(actor.authority.battleS).score);
  ok(applied.replayed?.modeFromFrame === true && sim.entityById.get(victimId).combat.destroyed && scoreOf(fresh) === scoreOf(staged.old) && guns(fresh) === guns(staged.old),
    `${mode}: the victim stays down (the rows' life, not the play's), the score is the old host's exactly (${scoreOf(fresh)}), and no gun is re-armed`);
  stepBoth(staged.old, fresh);
  const respawn = (actor) => actor.authority.captureModeCheckpoint().mode.respawns.some(([id]) => id === victimId);
  ok(sim.entityById.get(victimId).modeLife === 'down' && old.entityById.get(victimId).modeLife === 'down' && respawn(fresh) === respawn(staged.old),
    `${mode}: the mode takes the death at the resume, a respawn due as on the old host (${respawn(fresh)})`);
  staged.old.stop(); fresh.stop();
}

console.log('[8] the frame\'s view where the play parts from it: a zone meter, a survivor infected, the ball');
{
  // another hand in the window: a zone meter moved (Zone Control's objectives; Frontline's line, its sector unmoved)
  const zonesOf = (actor) => actor.authority.modeController.state.zones.map((zone) => `${zone.id} ${zone.control} ${zone.owner} ${zone.contested}`).join('; ');
  for (const mode of ['zone_control', 'frontline_assault']) {
    const staged = stage({ mode, t0: 30, during: (old, k) => {
      if (k === 5) { const zone = old.authority.modeController.state.zones[0]; zone.control = Math.max(-1, Math.min(1, zone.control + 0.2)); }
    } });
    const { fresh, applied } = resumeOf(staged);
    ok(applied.replayed?.modeFromFrame === true && zonesOf(fresh) === zonesOf(staged.old), `${mode}: the meter is the frame's (${zonesOf(fresh)})`);
    for (let k = 0; k < 120; k++) stepBoth(staged.old, fresh);
    ok(zonesOf(fresh) === zonesOf(staged.old), `${mode}: and runs on as the old host's (2 s on: ${zonesOf(fresh)})`);
    staged.old.stop(); fresh.stop();
  }
}
{
  // Infected: a survivor killed by another hand 5 ticks into the window (the seat heard mode_infected then); the frame alone
  // shows the death
  const victimId = 'a-1';
  const staged = stage({ mode: 'infected', during: (old, k) => { if (k === 5) { const victim = old.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; } } });
  const { fresh } = resumeOf(staged);
  const old = staged.old.authority, sim = fresh.authority;
  const due = (authority) => authority.captureModeCheckpoint().mode.respawns.find(([id]) => id === victimId)?.[1].atS;
  ok(sim.entityById.get(victimId).team === old.entityById.get(victimId).team && sim.entityById.get(victimId).modeLife === 'down'
    && sim.entityById.get(victimId).modeSpeedMultiplier === old.entityById.get(victimId).modeSpeedMultiplier,
  `infected: the victim is the infected's at the resume, down, at their pace, as on the old host (${sim.entityById.get(victimId).team}, `
    + `x${sim.entityById.get(victimId).modeSpeedMultiplier})`);
  const heard = [];
  for (const actor of [staged.old, fresh]) { actor.authority.step({ dt: 1 / 60, inputs }); heard.push(actor.authority.eventsForViewer('h0').filter((ev) => ev.type === 'mode_infected').length); actor.authority.afterEventBroadcast(); }
  const late = due(sim) - due(old);
  ok(heard[1] === 0 && late >= 0 && late <= 30 / 60 + 1e-9, `infected: the new host announces no conversion (${heard[1]} mode_infected), and the respawn is due `
    + `${late.toFixed(3)} s after the old host's (the death's moment is the frame's: at most the window late)`);
  staged.old.stop(); fresh.stop();
}
{
  // and a victim risen again among the infected inside a longer window (Infected respawns in 5 s): no row shows its death,
  // the frame shows its faction
  const victimId = 'a-1';
  const staged = stage({ mode: 'infected', window: 400, during: (old, k) => { if (k === 5) { const victim = old.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; } } });
  const { fresh } = resumeOf(staged);
  const oldVictim = staged.old.authority.entityById.get(victimId), newVictim = fresh.authority.entityById.get(victimId);
  ok(oldVictim.modeLife === 'alive' && oldVictim.team !== 'alpha' && newVictim.team === oldVictim.team && newVictim.modeLife === 'alive'
    && newVictim.modeSpeedMultiplier === oldVictim.modeSpeedMultiplier, `infected: one risen again among the infected in the window is theirs at the `
    + `resume, at their pace (${newVictim.team}, ${newVictim.modeLife}, x${newVictim.modeSpeedMultiplier}; the old host's ${oldVictim.team})`);
  const heard = [];
  for (let k = 0; k < 60; k++) { stepBoth(staged.old); fresh.authority.step({ dt: 1 / 60, inputs }); heard.push(...fresh.authority.eventsForViewer('h0').filter((ev) => ev.type === 'mode_infected')); fresh.authority.afterEventBroadcast(); }
  ok(heard.length === 0, `infected: and is converted no second time (${heard.length} mode_infected in 1 s)`);
  staged.old.stop(); fresh.stop();
}
{
  // and a survivor the play alone infected (its held hull took a round the seat's dodged: a hand on the play's own steps,
  // never the old host's): the frame shows it a survivor, and so is it at the resume
  const victimId = 'h1';
  const staged = stage({ mode: 'infected' });
  const { state } = resumeStateFromRetained(staged.keyframe, 0, staged.latest, 500, [], [], staged.told);
  const fresh = makeFor(staged.mode, staged.ruleset)({ tick: state.tick, ...resumeClocksOf(state) });
  const play = fresh.authority.step.bind(fresh.authority);
  let played = 0;
  fresh.authority.step = (input) => {
    if (++played === 5) { const victim = fresh.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; }
    return play(input);
  };
  applyResumeState(fresh, state);
  fresh.authority.step = play;
  fresh.authority.onMatchReady();
  const oldVictim = staged.old.authority.entityById.get(victimId), newVictim = fresh.authority.entityById.get(victimId);
  const counts = (actor) => JSON.stringify(actor.authority.modeController.state.infection);
  ok(played > 5 && newVictim.team === oldVictim.team && oldVictim.team === 'alpha' && newVictim.modeLife === 'alive' && !newVictim.combat.destroyed
    && newVictim.modeSpeedMultiplier === oldVictim.modeSpeedMultiplier, `infected: one the play alone infected is a survivor at the resume, alive, at a `
      + `survivor's pace (${newVictim.team}, ${newVictim.modeLife}, x${newVictim.modeSpeedMultiplier}; the old host's ${oldVictim.team})`);
  for (let k = 0; k < 60; k++) stepBoth(staged.old, fresh);
  ok(counts(fresh) === counts(staged.old) && newVictim.team === 'alpha' && fresh.authority.result == null, `infected: and stays one, the counts the `
    + `old host's 1 s on (${counts(fresh)})`);
  staged.old.stop(); fresh.stop();
}
{
  // and one the play alone infected whose row the seat's frame leaves out (hidden from it): no row stands it up, so it
  // stays the play's, infected and down, and rises as one of them (round 4: turned back to a survivor while down, it rose
  // as a survivor 4.6 s on, which Infected never does)
  const victimId = 'h1';
  const staged = stage({ mode: 'infected' });
  const wire = staged.old.wireIdOf(victimId);
  staged.latest.entities = staged.latest.entities.filter((row) => row.entityId !== wire);
  const { state } = resumeStateFromRetained(staged.keyframe, 0, staged.latest, 500, [], [], staged.told);
  const fresh = makeFor(staged.mode, staged.ruleset)({ tick: state.tick, ...resumeClocksOf(state) });
  const play = fresh.authority.step.bind(fresh.authority);
  let played = 0;
  fresh.authority.step = (input) => {
    if (++played === 5) { const victim = fresh.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; }
    return play(input);
  };
  applyResumeState(fresh, state);
  fresh.authority.step = play;
  fresh.authority.onMatchReady();
  const victim = fresh.authority.entityById.get(victimId);
  ok(victim.team !== 'alpha' && victim.modeLife === 'down', `infected: one the play alone infected that no row stands up stays the play's (${victim.team}, ${victim.modeLife})`);
  const rose = [];
  for (let k = 0; k < 360; k++) { fresh.authority.step({ dt: 1 / 60, inputs }); for (const ev of fresh.authority.eventsForViewer('h0')) if (ev.type === 'mode_respawn' && ev.id === victimId) rose.push(victim.team); fresh.authority.afterEventBroadcast(); }
  ok(rose.length === 1 && rose[0] !== 'alpha', `infected: and rises as one of them, never a survivor (${JSON.stringify(rose)} in 6 s)`);
  staged.old.stop(); fresh.stop();
}
{
  // and an infected killed by another hand 5 ticks into a long window, risen on the ring by the old host there; the play
  // kills it itself only at its step 30 (its respawn not yet due at the frame), and the frame's row shows it risen: its
  // ring arrival is taken as made, the hunt's arrivals counted as the old host's (the hulls part after, the doc names it)
  const victimId = 'b-1';
  const staged = stage({ mode: 'infected', window: 320, during: (old, k) => { if (k === 5) { const victim = old.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; } } });
  const { state } = resumeStateFromRetained(staged.keyframe, 0, staged.latest, 500, [], [], staged.told);
  const fresh = makeFor(staged.mode, staged.ruleset)({ tick: state.tick, ...resumeClocksOf(state) });
  const play = fresh.authority.step.bind(fresh.authority);
  let played = 0;
  fresh.authority.step = (input) => {
    if (++played === 30) { const victim = fresh.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; }
    return play(input);
  };
  applyResumeState(fresh, state);
  fresh.authority.step = play;
  const huntOf = (actor) => actor.authority.captureModeCheckpoint().mode.hunt?.arrivals;
  const oldVictim = staged.old.authority.entityById.get(victimId), newVictim = fresh.authority.entityById.get(victimId);
  ok(staged.told.some(([id]) => id === victimId) && oldVictim.modeLife === 'alive' && newVictim.modeLife === 'alive' && huntOf(fresh) === huntOf(staged.old),
    `infected: a ring arrival the play did not make by the frame is taken as made (${victimId} ${newVictim.modeLife}; the hunt's arrivals ${huntOf(fresh)} `
      + `against ${huntOf(staged.old)})`);
  staged.old.stop(); fresh.stop();
}
{
  // and that ring arrival killed again by the seat 5 ticks after the old host stood it up, before the frame: its arrival
  // taken, then its death (its respawn from the frame)
  const victimId = 'b-1';
  let riseK = null, againK = null;
  const staged = stage({ mode: 'infected', window: 320, during: (old, k) => {
    const victim = old.authority.entityById.get(victimId);
    if (k === 5) { victim.combat.hp = 0; victim.combat.destroyed = true; return; }
    if (k > 5 && riseK === null && victim.modeLife === 'alive' && !victim.combat.destroyed) riseK = k;
    if (riseK !== null && againK === null && k === riseK + 5) { victim.combat.hp = 0; victim.combat.destroyed = true; againK = k; }
  } });
  const { state } = resumeStateFromRetained(staged.keyframe, 0, staged.latest, 500, [], [], staged.told);
  const fresh = makeFor(staged.mode, staged.ruleset)({ tick: state.tick, ...resumeClocksOf(state) });
  const play = fresh.authority.step.bind(fresh.authority);
  let played = 0;
  fresh.authority.step = (input) => {
    if (++played === 30) { const victim = fresh.authority.entityById.get(victimId); victim.combat.hp = 0; victim.combat.destroyed = true; }
    return play(input);
  };
  applyResumeState(fresh, state);
  fresh.authority.step = play;
  const huntOf = (actor) => actor.authority.captureModeCheckpoint().mode.hunt?.arrivals;
  const dueOf = (actor) => actor.authority.captureModeCheckpoint().mode.respawns.find(([id]) => id === victimId)?.[1].atS;
  const oldVictim = staged.old.authority.entityById.get(victimId), newVictim = fresh.authority.entityById.get(victimId);
  const late = dueOf(fresh) - dueOf(staged.old);
  ok(riseK !== null && againK !== null && newVictim.modeLife === 'down' && oldVictim.modeLife === 'down' && huntOf(fresh) === huntOf(staged.old)
    && late >= 0 && late <= 320 / 60, `infected: that arrival killed again before the frame is taken, then down (the hunt's arrivals ${huntOf(fresh)} against `
      + `${huntOf(staged.old)}; its respawn ${late.toFixed(3)} s after the old host's, from the frame)`);
  staged.old.stop(); fresh.stop();
}
{
  // Turbo Ball: the ball struck by another hand 5 ticks into the window (the play's ball flew on as it was)
  const staged = stage({ mode: 'turbo_ball', during: (old, k) => { if (k === 5) { const ball = old.authority.modeController.state.ball; ball.vx += 4; ball.vz -= 3; } } });
  const { fresh } = resumeOf(staged);
  const ballOf = (actor) => { const { ball, ballActiveAtS } = actor.authority.captureModeCheckpoint().mode.objectives;
    return JSON.stringify([ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz, ball.lastTouchId, ballActiveAtS]); };
  ok(ballOf(fresh) === ballOf(staged.old), `turbo_ball: the ball is the frame's to the bit (${ballOf(fresh)})`);
  for (let k = 0; k < 60; k++) stepBoth(staged.old, fresh);
  ok(ballOf(fresh) === ballOf(staged.old), `turbo_ball: and flies on as the old host's (1 s on)`);
  staged.old.stop(); fresh.stop();
}

if (failures) { console.error(`windowReplay.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('windowReplay.selftest: a resume replays its window on the keyframe\'s clocks to the old host\'s, the seat\'s rows set it right at their own ticks (pose, fight, life), and the mode, props, destruction and smoke the seat was told of are the new host\'s');
