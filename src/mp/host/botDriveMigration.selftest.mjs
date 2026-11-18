// A migrated bot drives on as the old host's would (gaps 274, G3). The keyframe carried a bot's hull (its row) and its
// fight (the extras), not its drive: a fresh host's hull pulled away with its engine's spool at rest (0.2 s behind
// within two seconds), and its fresh brain planned its way afresh from the hull, with its progress watchdog, the route's
// age and its seeded streams (its planner's included) at the construction's. The old host's raider re-planned on its
// 4 s watchdog onto another way; the new host's did not, and lifted the flag 1.9 s apart (the reviewer's CTF staging,
// round 8 fix-up r3). The extras now carry a live hull's spool and turn rate (motion) and a live bot's way (game/ai.ts
// BotDrive: the route, its cursor and owner, where the hull stood, the mission's destination and route age, the watchdog,
// the controller's and planner's stream positions), and the new brain takes it up after resume() (takeDrive), the list
// only while the hull still lies on it from where it stood (the Watch hand-back's test).
//
// Through the real resume (a CTF match actor, resumeStateFromRetained, applyResumeState), both hosts on together: [1] the
// keyframe alone, the raider going in at speed: the two hulls drive one track to the flag and lift it on one tick. [2]
// the seat's newest frame 0.5 s newer: the new brain takes the way on from the newer row, and the raider keeps the old
// host's track. [3] that frame with the hull thrown 40 m off its way: the stale list is refused and the brain plans
// afresh, and still goes in. [4] the record is JSON-safe and a corrupt one changes nothing. [5] mulberry32, its state
// now readable, draws the verbatim copy's sequence.
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { mulberry32 } from '../../game/ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const spec = 'm1a1_abrams_hc';
await ensureAuthorityFleet([spec]);
const mode = 'capture_the_flag';
const seats = [{ seat: 0, playerId: 'pilot', name: 'Pilot', team: 'alpha', specId: spec }];
const bots = [{ playerId: 'a-0', name: 'A0', team: 'alpha', specId: spec }, { playerId: 'b-0', name: 'B0', team: 'bravo', specId: spec }];
const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
const inputs = new Map([['pilot', { throttle: 0, steer: 0, fire: false, brake: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
const make = (resume) => createMatchActor({ roomId: 'bot-drive', mapId: 'verdant', mode, seed: 33, seats, bots, ruleset: matchRulesetFor(mode),
  world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
function hostFrame(actor, tick, era) {
  const sim = actor.authority, battleTimeMs = Math.round(sim.timeS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
    shells: [], viewer: null, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}

/**
 * The CTF raider going in (huntSearchMigration [6]'s staging; the round 8 reviewer's probe): held inside the stage
 * 18 s, past its wait (the hold puts it back once a second, and its progress watchdog runs), then 2 s on by itself, the
 * keyframe sealed (t 20 s, 92 m from the flag); with `newerS` the old host runs on that long and the
 * seat's newest frame is taken then (`offWayM`: the hull thrown that far across its way just before). Both hosts then
 * run on together; each one's raider is logged every tick until both have lifted the flag.
 */
function migrateRaider({ newerS = 0, offWayM = 0 } = {}) {
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const live = sim.modeController.state;
  const hull = sim.entityById.get('a-0'), pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('b-0');
  const own = live.flags.find((f) => f.team === 'alpha'), goal = live.flags.find((f) => f.team === 'bravo');
  const goalAt = { x: goal.x, z: goal.z };
  const dx = own.x - goal.x, dz = own.z - goal.z, length = Math.hypot(dx, dz) || 1;
  const hold = (e, out) => { e.state.pos.set(goal.x + dx / length * out, 0, goal.z + dz / length * out); e.state.speed = 0; };
  pilot.state.pos.set(own.x, 0, own.z);
  const enemyAt = { x: enemy.state.pos.x, z: enemy.state.pos.z };
  let tick = 0;
  const step = (actor) => {
    const s = actor.authority;
    s.step({ dt: 1 / 60, inputs }); s.eventsForViewer('pilot'); s.afterEventBroadcast();
    s.entityById.get('pilot').state.speed = 0;
    const b = s.entityById.get('b-0'); b.state.pos.set(enemyAt.x, 0, enemyAt.z); b.state.speed = 0;
    if (actor === old) tick++;
  };
  hold(hull, 100);
  for (let s = 0; s < 18; s++) {
    for (let k = 0; k < 60; k++) step(old);
    const d = Math.hypot(hull.state.pos.x - goal.x, hull.state.pos.z - goal.z);
    if (d < 60 || d > 115) hold(hull, 100);
  }
  for (let k = 0; k < 120; k++) step(old);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era) }));
  const sealedWay = keyframe.entities.find((e) => e.entityId === old.wireIdOf('a-0'))?.way ?? null;
  const keyInfo = hull.aiCtl.debugInfo();
  let latest = null;
  if (newerS > 0) {
    for (let k = 0; k < Math.round(newerS * 60); k++) step(old);
    if (offWayM) {
      const yaw = hull.state.yaw;
      hull.state.pos.x += Math.cos(yaw) * offWayM; hull.state.pos.z -= Math.sin(yaw) * offWayM;
      step(old);
    }
    latest = hostFrame(old, tick, era);
  }
  const { state } = resumeStateFromRetained(keyframe, 0, latest, latest ? 500 : null, []);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  fresh.authority.onMatchReady();
  const moved = fresh.authority.entityById.get('a-0');
  const taken = moved.aiCtl.captureDrive?.() ?? null;
  const lifted = (actor) => actor.authority.modeController.state.flags.find((f) => f.team === 'bravo').status === 'carried';
  let oldLift = null, newLift = null, apart = 0, replanned = null;
  for (let k = 1; k <= 60 * 14 && (oldLift === null || newLift === null); k++) {
    step(old); step(fresh);
    // the old host's raider re-plans its way on its own (its 4 s progress watchdog, its route 6 s old): a new list
    const info = hull.aiCtl.debugInfo();
    if (replanned === null && (info.wpCount !== keyInfo.wpCount || info.wpIndex < keyInfo.wpIndex)) replanned = k / 60;
    if (oldLift === null && lifted(old)) oldLift = k / 60;
    if (newLift === null && lifted(fresh)) newLift = k / 60;
    if (oldLift === null && newLift === null) apart = Math.max(apart, Math.hypot(hull.state.pos.x - moved.state.pos.x, hull.state.pos.z - moved.state.pos.z));
  }
  old.stop(); fresh.stop();
  return { keyframe, sealedWay, taken, oldLift, newLift, apart, goalAt, replanned, motion: keyframe.entities.find((e) => e.entityId === old.wireIdOf('a-0'))?.motion ?? null };
}
const at = (t) => (t === null ? 'never' : `+${t.toFixed(2)} s`);

console.log('[1] the keyframe alone: the raider going in at speed drives the old host\'s track and lifts the flag on its tick');
{
  const run = migrateRaider();
  ok(run.oldLift !== null && run.oldLift > 4 && run.replanned !== null && run.replanned < run.oldLift, `the case is built: the old host's raider `
    + `re-plans its way ${at(run.replanned)} after the keyframe and lifts the flag ${at(run.oldLift)}`);
  ok(Array.isArray(run.motion) && run.motion[0] > 0.5 && run.sealedWay?.owner === 'destination' && run.sealedWay.way.length > 0,
    `the keyframe carries the raider's drive: its spool (${run.motion?.[0]?.toFixed?.(2) ?? 'none'}) and its way (${run.sealedWay ? `${run.sealedWay.owner}, `
      + `${run.sealedWay.way.length} waypoints, watchdog ${run.sealedWay.nav[3].toFixed(2)} s` : 'none'})`);
  ok(run.newLift !== null && Math.abs(run.newLift - run.oldLift) <= 1 / 60 + 1e-9, `the new host's raider lifts it on the same tick (${at(run.newLift)} against `
    + `${at(run.oldLift)})`);
  ok(run.apart < 0.5, `the two raiders drive one track to the flag (at most ${run.apart.toFixed(2)} m apart)`);
}

console.log('[2] the seat\'s newest frame 0.5 s newer: the new brain takes the way on from the newer row');
{
  const run = migrateRaider({ newerS: 0.5 });
  ok(!!run.taken && run.taken.owner === 'destination' && JSON.stringify(run.taken.way.at(-1)) === JSON.stringify(run.sealedWay?.way.at(-1)),
    `the new brain holds the old host's way (${run.taken ? `${run.taken.owner}, ${run.taken.way.length} waypoints` : 'none'})`);
  ok(run.newLift !== null && Math.abs(run.newLift - run.oldLift) <= 0.25, `the new host's raider lifts the flag within 0.25 s of the old host's `
    + `(${at(run.newLift)} against ${at(run.oldLift)})`);
  ok(run.apart < 2, `the two raiders keep one track (at most ${run.apart.toFixed(2)} m apart)`);
}

console.log('[3] that frame with the hull thrown 40 m off its way: the stale list is refused, the brain plans afresh');
{
  const run = migrateRaider({ newerS: 0.5, offWayM: 40 });
  const sealedFirst = JSON.stringify(run.sealedWay?.way[0] ?? null);
  ok(!!run.sealedWay && (!run.taken || JSON.stringify(run.taken.way[0] ?? null) !== sealedFirst || run.taken.owner !== 'destination'),
    `the new brain does not drive the old host's list from 40 m off it (sealed first waypoint ${sealedFirst}; held `
      + `${run.taken ? `${run.taken.owner} ${JSON.stringify(run.taken.way[0] ?? null)}` : 'none'})`);
  ok(run.newLift !== null, `and its raider still goes in and lifts the flag (${at(run.newLift)}; the old host's ${at(run.oldLift)})`);
}

console.log('[4] the record is JSON-safe; a corrupt one changes nothing');
{
  const actor = make(null), sim = actor.authority;
  sim.onMatchReady();
  for (let k = 0; k < 240; k++) { sim.step({ dt: 1 / 60, inputs }); sim.afterEventBroadcast(); }
  const brain = sim.entityById.get('a-0').aiCtl;
  const record = brain.captureDrive?.();
  const text = JSON.stringify(record ?? null);
  ok(!!record && text === JSON.stringify(JSON.parse(text)) && !/NaN|Infinity/.test(text), `the way survives the keyframe's JSON round trip (${text.length} bytes)`);
  if (record) {
    const corrupt = { ...JSON.parse(text), way: [[1, null]], nav: ['x'], streams: ['y', 1.5], mission: [Infinity, 0, 0] };
    brain.takeDrive(corrupt, 0);
    ok(JSON.stringify(brain.captureDrive()) === text, 'a record with a broken waypoint, watchdog, stream or mission changes nothing');
    // taken from a row 0.5 s newer than the capture, the way's clocks describe the row's moment: the route's age and the
    // watchdog run on by the gap
    brain.takeDrive(record, 0.5);
    const aged = brain.captureDrive();
    ok(record.owner === 'destination' && !!record.mission && Math.abs(aged.mission?.[2] - record.mission[2] - 0.5) < 1e-9
      && Math.abs(aged.nav[3] - record.nav[3] - 0.5) < 1e-9, `taken 0.5 s on, the route's age and the watchdog run on by 0.5 s (age `
      + `${record.mission?.[2]?.toFixed(3)} -> ${aged.mission?.[2]?.toFixed(3)}, watchdog ${record.nav[3].toFixed(3)} -> ${aged.nav[3].toFixed(3)})`);
  }
  actor.stop();
}

console.log('[5] mulberry32 draws the verbatim copy\'s sequence; its position reads and sets');
{
  // ARCHITECTURE.md §1.4's copy, as game/ai.ts held it before its state became readable
  const verbatim = (a) => function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let same = true;
  for (const seed of [0, 1, 7001, 41033, 0x7fffffff, 0xffffffff, -5]) {
    const a = mulberry32(seed), b = verbatim(seed);
    for (let i = 0; i < 200; i++) if (a() !== b()) same = false;
  }
  ok(same, 'seven seeds, 200 draws each: the same values');
  const a = mulberry32(43033);
  for (let i = 0; i < 17; i++) a();
  const b = mulberry32(1);
  b.state = a.state;
  ok(typeof a.state === 'number' && [0, 1, 2, 3].every(() => a() === b()), `a stream set to another's position draws on as it does (state ${a.state})`);
}

if (failures) { console.error(`botDriveMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('botDriveMigration.selftest: a migrated bot keeps its spool, its way, its watchdog and its streams, and drives on as the old host\'s');
