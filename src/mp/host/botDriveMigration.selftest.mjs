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
// Fix-up r1 (the correctness review of gaps 274: two parts of the take were in no receipt): [1] also holds the brain's
// streams, the controller's (its LOS and probe timers draw from it every interval, the reaction and unstick sides on
// demand) and the planner's, where the keyframe left them, not where a fresh brain's stand. [6] a raider revived between
// the keyframe and the seat's newest frame: its brain keeps the drive resume() left it (the old host's revive reset its
// watchdog and mission too), not its dead life's way and watchdog, and takes the brain's streams, which outlive a life
// on the old host as well (before, a revived or fallen hull took none, and its streams went back to the construction's).
// Fix-up r2 (both reviews' major): [7] a raider DOWN when the keyframe is sealed carried no streams at all (the extras
// wrote a bot's way, and its streams with it, only for a live hull), so its brain drew its next life from the
// construction's: the two raiders parted 55 m within 25 s. A down bot's extras now carry its streams alone: [7a] still down
// at the resume, the raiders keep one track; [7b] revived before the seat's frame, within 4 m (the old brain planned that
// life from its spawn and drove it 0.25 s before the frame, the new one plans it from the newer row).
// 275: [7a] also holds the brain a down bot carries (game/ai.ts BotBrain): once both hosts revive the raider, its new
// brain is the old host's, field for field. [7b]'s bound is 0.5 m (it was 4 m): a hull the old host stood up in the
// window drives from its revive on, and the new host spools its engine from the told revive (movement.ts spoolFromRest;
// built at rest, it pulled away 0.3 s behind: 3.1 m without it).
// 276: a live hull's spool rides its hull exact (MigrationEntityExtras.hull; [1] holds it taken as sealed). A resume now
// replays its window where it can (migrationState.ts replayWindow): [2], [3] and [6] seal no battle clock, and [7b] drops
// the replay, so they hold the 275 reading a resume takes where it cannot; [7c] is [7b]'s staging replayed: the raider's
// revived life and its streams are the old host's (0.00 m; its staging's pins of b-0 in the window, which no seat knows,
// are set right by the seat's rows).
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeClocksOf, resumeStateFromRetained } from './migrationState.ts';
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
  const spoolAtKey = hull.state._spool;
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
  const spoolTaken = fresh.authority.entityById.get('a-0').state._spool;
  const resumed = fresh.authority.entityById.get('a-0').aiCtl.captureDrive?.() ?? null;
  const built = make(null);
  const constructed = built.authority.entityById.get('a-0').aiCtl.captureDrive?.()?.streams ?? null;
  built.stop();
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
  return { keyframe, sealedWay, taken, resumed, constructed, oldLift, newLift, apart, goalAt, replanned, spool: [spoolAtKey, spoolTaken] };
}
const at = (t) => (t === null ? 'never' : `+${t.toFixed(2)} s`);

console.log('[1] the keyframe alone: the raider going in at speed drives the old host\'s track and lifts the flag on its tick');
{
  const run = migrateRaider();
  ok(run.oldLift !== null && run.oldLift > 4 && run.replanned !== null && run.replanned < run.oldLift, `the case is built: the old host's raider `
    + `re-plans its way ${at(run.replanned)} after the keyframe and lifts the flag ${at(run.oldLift)}`);
  // (its spool rides the hull exact since 276: MigrationEntityExtras.hull)
  ok(run.spool[0] > 0.5 && run.spool[1] === run.spool[0] && run.sealedWay?.owner === 'destination' && run.sealedWay.way.length > 0,
    `the keyframe carries the raider's drive: its spool (${run.spool[0].toFixed(2)}, taken ${run.spool[1].toFixed(2)}) and its way (${run.sealedWay ? `${run.sealedWay.owner}, `
      + `${run.sealedWay.way.length} waypoints, watchdog ${run.sealedWay.nav[3].toFixed(2)} s` : 'none'})`);
  ok(run.newLift !== null && Math.abs(run.newLift - run.oldLift) <= 1 / 60 + 1e-9, `the new host's raider lifts it on the same tick (${at(run.newLift)} against `
    + `${at(run.oldLift)})`);
  ok(run.apart < 0.5, `the two raiders drive one track to the flag (at most ${run.apart.toFixed(2)} m apart)`);
  const sealedStreams = run.sealedWay?.streams ?? [null, null];
  ok(Number.isInteger(sealedStreams[0]) && Number.isInteger(sealedStreams[1]) && sealedStreams[0] !== run.constructed?.[0] && sealedStreams[1] !== run.constructed?.[1],
    `the case is built: the old brain drew from both its streams before the keyframe (controller ${sealedStreams[0]}, planner ${sealedStreams[1]}; a fresh `
      + `brain's ${run.constructed?.[0]}, ${run.constructed?.[1]})`);
  ok(run.resumed?.streams?.[0] === sealedStreams[0] && run.resumed?.streams?.[1] === sealedStreams[1], `the new brain draws on from the keyframe's `
    + `positions of both (controller ${run.resumed?.streams?.[0]}, planner ${run.resumed?.streams?.[1]})`);
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

console.log('[6] a raider revived after the keyframe: the fresh brain\'s drive, the old brain\'s streams');
{
  // the raider going in at the keyframe (its way, watchdog and mission carried), killed on the next tick, revived by the
  // mode 2 s on (an arranged 2 s respawn, the shortest a room sets: within the keyframe cadence) and the seat's newest
  // frame taken 0.25 s after the revive it was told
  const reviveRules = { ...matchRulesetFor(mode), respawnS: 2 };
  const makeRevive = (resume) => createMatchActor({ roomId: 'bot-drive-revive', mapId: 'verdant', mode, seed: 33, seats, bots, ruleset: reviveRules,
    world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeRevive(null), sim = old.authority;
  sim.onMatchReady();
  const live = sim.modeController.state;
  const hull = sim.entityById.get('a-0'), pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('b-0');
  const own = live.flags.find((f) => f.team === 'alpha'), goal = live.flags.find((f) => f.team === 'bravo');
  const dx = own.x - goal.x, dz = own.z - goal.z, length = Math.hypot(dx, dz) || 1;
  const hold = (e, out) => { e.state.pos.set(goal.x + dx / length * out, 0, goal.z + dz / length * out); e.state.speed = 0; };
  pilot.state.pos.set(own.x, 0, own.z);
  const enemyAt = { x: enemy.state.pos.x, z: enemy.state.pos.z };
  let tick = 0;
  const told = new Map();
  const step = () => {
    sim.step({ dt: 1 / 60, inputs }); tick++;
    for (const ev of sim.eventsForViewer('pilot')) if (ev.type === 'mode_respawn') told.set(ev.id, tick);
    sim.afterEventBroadcast();
    pilot.state.speed = 0; enemy.state.pos.set(enemyAt.x, 0, enemyAt.z); enemy.state.speed = 0;
  };
  hold(hull, 100);
  for (let s = 0; s < 18; s++) {
    for (let k = 0; k < 60; k++) step();
    const d = Math.hypot(hull.state.pos.x - goal.x, hull.state.pos.z - goal.z);
    if (d < 60 || d > 115) hold(hull, 100);
  }
  for (let k = 0; k < 60; k++) step();
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era) }));
  const deadLife = keyframe.entities.find((e) => e.entityId === old.wireIdOf('a-0'))?.way ?? null;
  hull.combat.hp = 0; hull.combat.destroyed = true;
  for (let k = 0; k < 600 && !told.has('a-0'); k++) step();
  for (let k = 0; k < 15; k++) step();
  const oldBrain = hull.aiCtl.captureDrive();
  const { state } = resumeStateFromRetained(keyframe, 0, hostFrame(old, tick, era), 500, [], [], [...told]);
  const fresh = makeRevive({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  const revived = fresh.authority.entityById.get('a-0'), brain = revived.aiCtl.captureDrive();
  ok(!!deadLife && deadLife.owner === 'destination' && deadLife.nav[0] < 1e8 && told.has('a-0') && !hull.combat.destroyed && !revived.combat.destroyed,
    `the case is built: the keyframe carries the living raider's way (${deadLife ? `${deadLife.owner}, ${deadLife.way.length} waypoints, watchdog on (`
      + `${deadLife.nav[0].toFixed(0)}, ${deadLife.nav[1].toFixed(0)}) ${deadLife.nav[3].toFixed(2)} s` : 'none'}); it falls, the old host revives it (told at `
      + `tick ${told.get('a-0') ?? 'never'}) and the seat's frame shows it alive`);
  ok(brain.nav[0] > 1e8 && brain.nav[2] === null && brain.nav[3] === 0 && brain.mission === null, `the revived raider's brain keeps the drive resume() `
    + `left it: no leg yet and no mission (watchdog ${JSON.stringify(brain.nav)}, mission ${JSON.stringify(brain.mission)}), not its dead life's`);
  ok(brain.streams[0] === deadLife?.streams[0] && brain.streams[1] === deadLife?.streams[1], `and the brain's streams go on from the keyframe's (controller `
    + `${brain.streams[0]}, planner ${brain.streams[1]}; the old brain kept its own through the revive and stands at ${oldBrain.streams[0]}, ${oldBrain.streams[1]})`);
  old.stop(); fresh.stop();
}

/**
 * Fix-up r2 (the correctness and completeness reviews' major): a raider DOWN when the keyframe is sealed ([6]'s staging,
 * the raider killed 0.5 s before it). The extras carried a bot's way, and its streams with it, only for a live hull, so
 * the new brain drew its next life from the construction's positions: the two raiders parted 55 m within 25 s. Now a down
 * bot's extras carry its brain's streams alone (MigrationEntityExtras.streams, taken by takeStreams). `revivedInWindow`:
 * the old host revives it before the seat's newest frame (taken 0.25 s after the revive it was told).
 */
function downAtKeyframe(revivedInWindow, replay = false) {
  const reviveRules = { ...matchRulesetFor(mode), respawnS: 2 };
  const makeRevive = (resume) => createMatchActor({ roomId: 'bot-drive-revive', mapId: 'verdant', mode, seed: 33, seats, bots, ruleset: reviveRules,
    world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeRevive(null), sim = old.authority;
  sim.onMatchReady();
  const live = sim.modeController.state;
  const hull = sim.entityById.get('a-0'), pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('b-0');
  const own = live.flags.find((f) => f.team === 'alpha'), goal = live.flags.find((f) => f.team === 'bravo');
  const dx = own.x - goal.x, dz = own.z - goal.z, length = Math.hypot(dx, dz) || 1;
  const hold = (e, out) => { e.state.pos.set(goal.x + dx / length * out, 0, goal.z + dz / length * out); e.state.speed = 0; };
  pilot.state.pos.set(own.x, 0, own.z);
  const enemyAt = { x: enemy.state.pos.x, z: enemy.state.pos.z };
  let tick = 0;
  const told = new Map();
  const step = (actor) => {
    const s = actor.authority;
    s.step({ dt: 1 / 60, inputs });
    for (const ev of s.eventsForViewer('pilot')) if (actor === old && ev.type === 'mode_respawn') told.set(ev.id, tick + 1);
    s.afterEventBroadcast();
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
  for (let k = 0; k < 60; k++) step(old);
  hull.combat.hp = 0; hull.combat.destroyed = true;
  for (let k = 0; k < 30; k++) step(old);
  const atKeyframe = hull.aiCtl.captureDrive().streams;
  const era = createEraIndexer();
  // sealed as matchHostCore.ts seals it, the battle clock exact (275)
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, battleS: sim.battleS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era) }));
  const sealed = keyframe.entities.find((e) => e.entityId === old.wireIdOf('a-0'));
  let latest = null;
  if (revivedInWindow) {
    for (let k = 0; k < 600 && !told.has('a-0'); k++) step(old);
    for (let k = 0; k < 15; k++) step(old);
    latest = hostFrame(old, tick, era);
  }
  const atResume = hull.aiCtl.captureDrive().streams;
  const { state } = resumeStateFromRetained(keyframe, 0, latest, latest ? 500 : null, [], [], [...told]);
  // the 275 reading of the window, unless the case replays it (276: header)
  if (!replay) delete state.replay;
  const fresh = makeRevive({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  const twin = fresh.authority.entityById.get('a-0');
  const taken = twin.aiCtl.captureDrive().streams;
  const built = makeRevive(null);
  const constructed = built.authority.entityById.get('a-0').aiCtl.captureDrive().streams;
  built.stop();
  const downAtResume = hull.combat.destroyed && twin.combat.destroyed;
  fresh.authority.onMatchReady();
  // the first step: what each brain measures from its hull (a brain handed the dead life's record and no hand-back read the
  // move from its death to its spawn as one tick's progress)
  step(old); step(fresh);
  const firstTick = { old: hull.aiCtl.debugInfo(), fresh: twin.aiCtl.debugInfo() };
  let apart = 0, apartAt = null, together = 0, brainsOnRise = null;
  for (let k = 1; k <= 60 * 25; k++) {
    step(old); step(fresh);
    if (hull.combat.destroyed || twin.combat.destroyed) continue;
    // the first step both are up: the brain each drives its new life with (275)
    if (brainsOnRise === null) brainsOnRise = [JSON.stringify(hull.aiCtl.captureBrain()), JSON.stringify(twin.aiCtl.captureBrain())];
    together++;
    const d = Math.hypot(hull.state.pos.x - twin.state.pos.x, hull.state.pos.z - twin.state.pos.z);
    if (d > apart) { apart = d; apartAt = k / 60; }
  }
  old.stop(); fresh.stop();
  return { sealed, atKeyframe, taken, constructed, downAtResume, apart, apartAt, together, told: told.get('a-0') ?? null, keyTick: keyframe.tick, brainsOnRise,
    sealedBrain: !!sealed?.brain, firstTick, replayed: applied.replayed ?? null, atResume };
}
/** The fields two brain records hold apart, as `part[index] old/new` (game/ai.ts BotBrain's lists). */
function brainApart(a, b) {
  const x = JSON.parse(a) ?? {}, y = JSON.parse(b) ?? {}, out = [];
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const p = x[key], q = y[key];
    if (JSON.stringify(p) === JSON.stringify(q)) continue;
    if (Array.isArray(p) && Array.isArray(q) && (key === 'n' || key === 's' || key === 'h')) {
      const mp = new Map(), mq = new Map();
      for (let i = 0; i < p.length; i += 2) mp.set(p[i], p[i + 1]);
      for (let i = 0; i < q.length; i += 2) mq.set(q[i], q[i + 1]);
      for (const i of new Set([...mp.keys(), ...mq.keys()])) if (JSON.stringify(mp.get(i)) !== JSON.stringify(mq.get(i))) out.push(`${key}[${i}] ${JSON.stringify(mp.get(i))}/${JSON.stringify(mq.get(i))}`);
    } else out.push(`${key} ${JSON.stringify(p)?.slice(0, 60)}/${JSON.stringify(q)?.slice(0, 60)}`);
  }
  return out.join(', ') || 'none';
}
for (const [label, revivedInWindow, replay] of [['[7a] a raider down when the keyframe is sealed, still down at the resume', false, false],
  ['[7b] a raider down when the keyframe is sealed, revived before the seat\'s newest frame (the 275 reading)', true, false],
  ['[7c] the same, the window replayed (276)', true, true]]) {
  console.log(label);
  const run = downAtKeyframe(revivedInWindow, replay);
  if (replay) ok(run.replayed?.steps > 0, `the resume replays the window (${JSON.stringify(run.replayed)})`);
  ok(!!run.sealed && !run.sealed.way && Number.isInteger(run.atKeyframe[0]) && Number.isInteger(run.atKeyframe[1])
    && run.atKeyframe[0] !== run.constructed[0] && run.atKeyframe[1] !== run.constructed[1] && (revivedInWindow ? run.told > run.keyTick && !run.downAtResume : run.downAtResume),
  `the case is built: the raider is down at the keyframe (no way carried), its brain drew from both streams before (controller ${run.atKeyframe[0]}, `
    + `planner ${run.atKeyframe[1]}; a fresh brain's ${run.constructed[0]}, ${run.constructed[1]}), and ${revivedInWindow ? `the old host revives it after the `
      + `keyframe (told at tick ${run.told})` : 'it is still down on both hosts at the resume'}`);
  ok(JSON.stringify(run.sealed?.streams ?? null) === JSON.stringify(run.atKeyframe), `the keyframe carries the down raider's streams alone `
    + `(${JSON.stringify(run.sealed?.streams ?? null)})`);
  // (replayed, the old host's draws in the window are the play's too: its positions at the frame)
  const drawsFrom = replay ? run.atResume : run.atKeyframe;
  ok(run.taken[0] === drawsFrom[0] && run.taken[1] === drawsFrom[1], `the new brain draws on from the ${replay ? 'old host\'s positions at the seat\'s frame' : 'keyframe\'s positions'} `
    + `of both (controller ${run.taken[0]}, planner ${run.taken[1]}), not a fresh brain's`);
  // 275: 0.5 m revived in the window too (it was 4 m: the engine at rest; the spool is now the ramp's since the told revive)
  if (revivedInWindow && !replay) {
    const { old: a, fresh: b } = run.firstTick;
    ok(Math.abs(b.progressRate - a.progressRate) < 3 && b.burstDamage === a.burstDamage, `the revived raider's brain, handed its hull after the record, reads `
      + `no spike on its first tick (progressRate ${b.progressRate} m/s against the old host's ${a.progressRate}, burstDamage ${b.burstDamage}/${a.burstDamage})`);
  }
  if (!revivedInWindow) {
    ok(run.sealedBrain && !!run.brainsOnRise && run.brainsOnRise[0] !== 'null' && run.brainsOnRise[0] === run.brainsOnRise[1], `the keyframe carries the down `
      + `raider's brain, and once both hosts revive it the new brain is the old host's, field for field (${run.brainsOnRise ? `${run.brainsOnRise[0].length} `
      + `bytes of record${run.brainsOnRise[0] === run.brainsOnRise[1] ? ', alike' : `; apart: ${brainApart(run.brainsOnRise[0], run.brainsOnRise[1])}`}` : 'never both up'})`);
  }
  // (the window replayed: its pins of b-0, which the staging makes each step, are no seat's to know; the rows set it right)
  const bound = replay ? 0.05 : 0.5;
  ok(run.together > 60 * 10 && run.apart < bound, `once both are up the two raiders keep one track for 25 s (at most ${run.apart.toFixed(2)} m apart`
    + `${run.apartAt === null ? '' : `, at +${run.apartAt.toFixed(2)} s`}; ${(run.together / 60).toFixed(1)} s together; bound ${bound} m${revivedInWindow
      ? ': the old brain drove its revived life 0.25 s before the seat\'s frame' : ''})`);
}

if (failures) { console.error(`botDriveMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('botDriveMigration.selftest: a migrated bot keeps its spool, its way, its watchdog and its streams, and drives on as the old host\'s');
