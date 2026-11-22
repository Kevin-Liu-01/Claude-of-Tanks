// A Horde wave the old host began just before a migration is not begun again (gaps 274, G2). The keyframe a migration
// resumes from is sealed in the lull; the old host begins the next wave at the lull's end and dies before the next
// keyframe (a mode event's follows within MODE_KEYFRAME_SPACING_MS). The elected seat holds that keyframe, its newest
// frame (newer, showing the wave begun) and the respawns it was told. The checkpoint's director (the wave, its queue, the
// lull's end, the trickle's clock, the last wave's hulls) is the lull's, so the restored host found the lull run out on
// its first step and began the wave a second time: every arrival revived again (a second mode_respawn each, a hull on
// the field thrown back onto the ring), the wave announced again; and its own constructor's opening (wave 1 and its
// arrivals) went out to the seats on its first tick. Now the frame's wave is named in the checkpoint
// (migrationState.ts checkpointAtNewestFrame: begunWave) and the restore takes the wave up as begun
// (matchModes.ts startHordeWave): the old host's draw (G1's carried stream), queue, special and health scale, the
// trickle's clock from the lull's end; a drawn hull with a newer row stays where it stands, one hidden from the seat
// arrives on the new host's first step; nothing is announced again, and the construction's own events are dropped.
//
// Through the real resume (a Horde match actor, resumeStateFromRetained, applyResumeState): [1] every arrival in the
// seat's newest frame; [2] the arrivals hidden from the seat (the frame holds no hostile row: they rose out of its sight).
// Each arrival drives at the begun wave's pace (fix-up r1, the correctness review: the restore stamped every hull at the
// base speed, and only a revive stamped the wave's).
// Fix-up r1 (the completeness and correctness reviews of gaps 274) adds: [3] an ally down when the lull ends, whose row
// in the seat's newest frame is from before the old host stood it up (a far tier's held row): the begun restore stands
// no ally up a second time (the old host's revive was announced, and the seat holds no row of it). [4] Frontline: the
// keyframe sealed as the attack takes sector 2, the old host advancing to the last sector in the window (a second
// mode_line_advanced and mode_wave_started, and its four arrivals revived again on the new host, before): the new host
// takes the advance up as begun (matchModes.ts advanceLine; migrationState.ts checkpointAtNewestFrame's line.begun), with
// the old host's reinforcement draw, counter-attack and regroup clocks and streams, and a defender alive since sector 1
// keeps that sector's pace (WaveCheckpoint.paces). [5] the same with the arrivals hidden from the seat (the line guard's
// usual case): they rise on the new host's first step, on their slots. [6] a Horde trickle arrival in the window: the new
// host takes it up as made (out of the queue, the trickle's clock from it) rather than bringing one more on at once.
// Fix-up r2 (the reviews of fix-up r1) adds: the arrival points' stream after a seen begun wave [1] and a trickle arrival
// [6] (each later arrival lands where the old host's does), and [5b] the hidden arrivals of a begun advance on their own
// slots' draws in slot order; and the director's other moves a window can hold, each made a second time before: [7] a
// Horde wave cleared ([7b] the frame at the clear's own step), [8] a cache taken, [9] a Frontline reinforce trickle
// arrival, [10] a counter-attack launched.
// Fix-up r3 (the round-3 correctness review: two guards no receipt held) adds: [8b] a Mars cache and [8c] an AC-130
// supply drop taken in the window (the objectives' and the escort's cache lists, not the Horde's), and [10b] a
// counter-attack due after the resume, still launched and announced once (checkpointAtNewestFrame names a launch only
// when the frame is past the counter's moment).
// 276 (the window replayed: every host since 275 seals its battle clock, and a resume plays the window again): the same
// moves on the replay's path, where a move the frame shows that the play did not make is taken up as made after it
// (matchModes.ts takeView, through these writers): [7r] and [7br] a Horde wave cleared by a death the play never saw (it
// was cleared again on the first step, a second repair, cache and mode_wave_cleared); [4r] and [5r] an advance the play
// makes itself (its arrivals and the ally's revive the old host's); [4h] and [5h] the sector taken by a hand the play
// never saw (sealed halfway through it), arrivals the rows stood up kept on the field; [8r] a cache the seat took in the
// window; [8h] one the play's held hull drove onto that the seat never reached, on the ground at the resume; [6r] a seat's
// kill that let the old host's trickle bring one on that the play's full field held back (its queue held it twice), [6r2]
// that arrival killed again in the window, [6r3] an arrival the play made itself and then lost (not taken again); [9r] and
// [9r2] the same for Frontline's reinforce trickle; [4k] an advance's own arrival and [7k] a begun wave's killed again
// inside the window, down at the resume, never stood up again.
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeClocksOf, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const spec = 'm1a1_abrams_hc';
await ensureAuthorityFleet([spec]);
const seats = [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }];
const bots = Array.from({ length: 10 }, (_, i) => ({ playerId: `z-${i}`, name: `Z${i}`, team: 'bravo', specId: spec }));
const horde = matchRulesetFor('endless_horde');
// a wave of twelve with six on the field (the queue trickles in) on a flat, open world whose ring points are all clear
const rules = { ...horde, horde: { ...horde.horde, spawnOutOfSight: false, waveSize: 12, maxAlive: 6, maxAliveCap: 6 } };
const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
const inputs = new Map();
const make = (resume, roster = bots) => createMatchActor({ roomId: 'wave-start', mapId: 'verdant', mode: 'endless_horde', seed: 7, seats, bots: roster, ruleset: rules, world,
  countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });

/** The actor's frame at `tick` in the host's shape (matchActor.ts frames, its mode state included); `hidden`: no bravo row. */
function hostFrame(actor, tick, era, hidden) {
  const sim = actor.authority, battleTimeMs = Math.round(sim.timeS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.filter((e) => !hidden || e.team !== 'bravo').map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
    shells: [], viewer: null, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}
const fielded = (actor) => actor.authority.entities.filter((e) => e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed).map((e) => e.id).sort();
/** Each fielded hostile whose pace (modeSpeedMultiplier) differs between the hosts, as "id old/new". */
const paceApart = (old, fresh) => fielded(old).map((id) => [id, old.authority.entityById.get(id).modeSpeedMultiplier, fresh.authority.entityById.get(id).modeSpeedMultiplier])
  .filter(([, a, b]) => !(Math.abs(a - b) < 1e-12)).map(([id, a, b]) => `${id} ${a}/${b}`);
const hordeOf = (actor) => actor.authority.captureModeCheckpoint().mode.waves.horde;
/** A migration keyframe of `actor` at `tick`; `replayed` (276) names its battle clock, as every host since 275 seals it, so
 *  a resume replays the window from it; without, the resume takes the 275 reading of the window. */
const sealKeyframe = (actor, tick, era, frame, replayed = false) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick,
  battleTimeMs: Math.round(actor.authority.timeS * 1000), timeS: actor.authority.timeS, ...(replayed ? { battleS: actor.authority.battleS } : {}),
  phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(), entities: captureEntityExtras(actor), frame }));

/**
 * The old host plays wave 1 out (every hostile falls as it stands), seals a keyframe 0.3 s before the lull's end, begins
 * wave 2 and runs 0.5 s on; the elected seat resumes from that keyframe, its newest frame and the respawns it was told.
 */
function windowStart(hidden) {
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map(), started = [];
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const tell = (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); if (ev.type === 'mode_wave_started') started.push(ev.wave); };
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15, tell); }
  while (sim.modeController.state.horde.nextWaveInS > 0.3) step(old, 1, tell);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era, false) }));
  const sealedWave = keyframe.modeCheckpoint.mode.waves.wave;
  told.clear(); started.length = 0;
  step(old, 30, tell);
  const frame = hostFrame(old, tick, era, hidden);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  const constructed = fresh.authority.pendingEventCount, serial = fresh.authority.modeEventSerial;
  applyResumeState(fresh, state);
  return { old, fresh, sim, step, tick, keyframe, sealedWave, started: [...started], told: new Map(told), frame, constructed,
    pendingAfter: fresh.authority.pendingEventCount, announced: fresh.authority.modeEventSerial - serial };
}

for (const [label, hidden] of [['[1] every arrival in the seat\'s newest frame', false], ['[2] the arrivals hidden from the seat', true]]) {
  console.log(label);
  const run = windowStart(hidden);
  const { old, fresh, step } = run;
  const oldField = fielded(old);
  ok(run.sealedWave === 1 && run.started.join() === '2' && run.told.size === oldField.length && oldField.length > 0,
    `the case is built: the keyframe is sealed in wave 1's lull, the old host begins wave 2 after it and brings on ${oldField.length} `
    + `(told ${run.told.size} respawns, ${run.started.length} wave start: ${run.started.join() || 'none'})`);
  ok(run.frame.tick > run.keyframe.tick && typeof run.frame.modeStateJson === 'string' && /"wave":2/.test(run.frame.modeStateJson),
    `the case is built: the newest frame (tick ${run.frame.tick}) is newer than the keyframe (tick ${run.keyframe.tick}) and shows wave 2`);
  ok(run.constructed > 0 && run.pendingAfter === 0, `the new host's construction left ${run.constructed} events of its own opening; none is left to `
    + `send on its first tick (${run.pendingAfter} pending after the resume)`);
  ok(fresh.authority.modeController.state.horde.wave === 2 && run.announced === 0, `the restore takes wave 2 up, announcing nothing (the new host shows `
    + `wave ${fresh.authority.modeController.state.horde.wave}; ${run.announced} mode events during the resume)`);
  const a = hordeOf(old), b = hordeOf(fresh);
  const sealedRng = run.keyframe.modeCheckpoint.mode.rng, oldMode = old.authority.captureModeCheckpoint().mode, freshMode = fresh.authority.captureModeCheckpoint().mode;
  ok(a.special === b.special && a.healthScale === b.healthScale && a.nextWaveAtS === null && b.nextWaveAtS === null
    && JSON.stringify(oldMode.waves.lastWaveIds) === JSON.stringify(freshMode.waves.lastWaveIds) && oldMode.rng[0] === freshMode.rng[0] && freshMode.rng[0] !== sealedRng[0],
  `the director is the old host's: its special (${b.special}), health scale, no lull due, the wave's hulls (${freshMode.waves.lastWaveIds.join(', ')}) and `
    + 'the draws\' stream past the same shuffle');
  ok(Math.abs(a.nextTrickleAtS - b.nextTrickleAtS) <= 1 / 60 + 1e-9, `the trickle's clock runs from the lull's end (old ${a.nextTrickleAtS.toFixed(3)}, `
    + `new ${b.nextTrickleAtS.toFixed(3)})`);
  // fix-up r2 (the correctness review: the kept arrivals placed nothing, so the stream stood behind the old host's and a
  // later arrival landed on another's point, the same hull 266 m apart by wave 4)
  if (!hidden) ok(oldMode.rng[1] === freshMode.rng[1] && a.spawnSector === b.spawnSector, `the arrival points' stream and the sector due next are where `
    + `the old host's arrivals left them (${freshMode.rng[1]}, sector ${b.spawnSector} against ${oldMode.rng[1]}, sector ${a.spawnSector})`);
  // both hosts on together: the new host's first steps (its start, as matchActor.ts start() readies a loading authority)
  fresh.authority.onMatchReady();
  const heard = [];
  step(fresh, 20, (ev) => heard.push(ev)); step(old, 20);
  const again = heard.filter((ev) => ev.type === 'mode_wave_started');
  ok(again.length === 0, `the new host never announces the wave again (${again.length} mode_wave_started)`);
  const respawned = heard.filter((ev) => ev.type === 'mode_respawn').map((ev) => ev.id).sort();
  ok(JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `the new host fields the old host's hulls (${fielded(fresh).join(', ')} against `
    + `${fielded(old).join(', ')})`);
  const pace = old.authority.entityById.get(fielded(old)[0])?.modeSpeedMultiplier;
  ok(pace > 1 && paceApart(old, fresh).length === 0, `every arrival drives at wave 2's pace on both hosts (x${pace}; apart: ${paceApart(old, fresh).join(', ') || 'none'})`);
  ok(fresh.authority.modeController.state.horde.queued === old.authority.modeController.state.horde.queued
    && fresh.authority.modeController.state.horde.remaining === old.authority.modeController.state.horde.remaining,
  `the queue is the old host's (${fresh.authority.modeController.state.horde.queued} against ${old.authority.modeController.state.horde.queued}; `
    + `remaining ${fresh.authority.modeController.state.horde.remaining} against ${old.authority.modeController.state.horde.remaining})`);
  if (!hidden) {
    ok(respawned.length === 0, `no hull the old host brought on rises again on the new host (${respawned.join(', ') || 'none'})`);
    const moved = [];
    for (const id of oldField) {
      const e = fresh.authority.entityById.get(id).state.pos, o = old.authority.entityById.get(id).state.pos;
      const d = Math.hypot(e.x - o.x, e.z - o.z);
      if (!(d < 15)) moved.push(`${id} ${d.toFixed(0)} m`);
    }
    ok(moved.length === 0, `every arrival drives on from where the old host put it (within 15 m of the old host's hull 20 ticks on; apart: ${moved.join(', ') || 'none'})`);
  } else {
    ok(JSON.stringify(respawned) === JSON.stringify(oldField), `the hidden arrivals rise on the new host's first step, those alone (${respawned.join(', ')} `
      + `against the old host's ${oldField.join(', ')})`);
  }
  old.stop(); fresh.stop();
}

console.log('[3] an ally down when the lull ends, its row in the seat\'s newest frame from before its revive');
{
  const old = make(null, [...bots, { playerId: 'a-0', name: 'A0', team: 'alpha', specId: spec }]), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const tell = (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); };
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15, tell); }
  // the ally falls in the lull: it stays down until the wave starts (the Horde stands its allies up then)
  const ally = sim.entityById.get('a-0');
  ally.combat.hp = 0; ally.combat.destroyed = true;
  step(old, 2, tell);
  while (sim.modeController.state.horde.nextWaveInS > 0.3) step(old, 1, tell);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era, false) }));
  const livesAtKeyframe = ally.modeLives;
  told.clear();
  // the seat's row of the ally is held from 0.1 s after the keyframe, before the lull's end (its far tier's last)
  step(old, 6, tell);
  const heldRow = captureEntityRow(ally, old.wireIdOf('a-0'), era, tick);
  step(old, 24, tell);
  const latest = hostFrame(old, tick, era, false);
  const frame = { ...latest, entities: latest.entities.map((row) => (row.entityId === heldRow.entityId ? heldRow : row)) };
  ok(keyframe.modeCheckpoint.mode.lives.find(([id]) => id === 'a-0')?.[1] === 'down' && !ally.combat.destroyed && ally.modeLives === livesAtKeyframe + 1
    && told.get('a-0') > heldRow.tick && heldRow.tick > keyframe.tick && heldRow.hp <= 0,
  `the case is built: the ally is down at the keyframe, the old host stands it up once at the wave start (told at tick ${told.get('a-0')}), `
    + `and the seat's row of it is from tick ${heldRow.tick}, before that (hp ${heldRow.hp})`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs }, [...bots, { playerId: 'a-0', name: 'A0', team: 'alpha', specId: spec }]);
  const serial = fresh.authority.modeEventSerial;
  applyResumeState(fresh, state);
  const twin = fresh.authority.entityById.get('a-0');
  ok(fresh.authority.modeController.state.horde.wave === 2 && fresh.authority.modeEventSerial - serial === 0,
    `the restore takes wave 2 up announcing nothing, no ally's revive either (${fresh.authority.modeEventSerial - serial} mode events)`);
  ok(twin.modeLives === livesAtKeyframe, `the ally is not stood up a second time by the restore (its lives ${twin.modeLives}, the keyframe's ${livesAtKeyframe})`);
  fresh.authority.onMatchReady();
  const again = [];
  step(fresh, 20, (ev) => { if (ev.type === 'mode_respawn' && ev.id === 'a-0') again.push(ev); }); step(old, 20);
  ok(again.length === 0, `nor on its first steps (${again.length} mode_respawn for it)`);
  old.stop(); fresh.stop();
}

/**
 * Frontline (fix-up r1, the completeness review's probe): the attack stands in the live sector and every defender
 * standing falls, but one, d-7, pinned 300 m across the line from sector 2 (it never contests): alive since sector 1, at
 * that sector's pace. An allied bot, a-2, falls just before the keyframe: the advance stands it up, and the seat's row of
 * it is from before the advance (a far tier's held row), so the resume cannot replay that revive. The keyframe is sealed
 * as sector 2 is about to fall; the old host advances to the last sector in the window and runs 0.5 s on; the elected
 * seat resumes from that keyframe, its newest frame (`hidden`: no defender row: every one rose, or stood, out of its
 * sight) and the respawns it was told. `holdAttack` (fix-up r2): the attack stands still where it took sector 2, through
 * the window and on both hosts after it, so the line guard reads it where it stood at the advance.
 */
function frontlineWindow(hidden, holdAttack = false, replayed = false, hand = false, killAt = 0) {
  const lineSeats = [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }];
  const lineBots = [...Array.from({ length: 3 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...Array.from({ length: 8 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const makeLine = (resume) => createMatchActor({ roomId: 'line-window', mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats: lineSeats, bots: lineBots,
    ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeLine(null), sim = old.authority;
  sim.onMatchReady();
  const lineOf = (actor) => actor.authority.modeController.state.line.index;
  const zoneOf = (actor) => { const st = actor.authority.modeController.state; return st.zones[Math.min(st.line.index, st.zones.length - 1)]; };
  const zones = sim.modeController.state.zones;
  const ax = zones.at(-1).x - zones[0].x, az = zones.at(-1).z - zones[0].z, al = Math.hypot(ax, az) || 1;
  const pin = { x: zones[1].x - az / al * 300, z: zones[1].z + ax / al * 300 };
  const SURVIVOR = 'd-7';
  const pinSurvivor = (actor) => { const e = actor.authority.entityById.get(SURVIVOR); e.state.pos.x = pin.x; e.state.pos.z = pin.z; e.state.speed = 0; };
  // held, each attacker on a spot of its own (stacked on one, the hulls push each other apart, a metre a host)
  const heldAt = { h0: 0, 'a-0': 10, 'a-1': -10, 'a-2': 20 };
  const placeAttack = (actor, zone) => {
    for (const e of actor.authority.entities) {
      if (e.team !== 'alpha' || e.modeActive === false || e.combat.destroyed) continue;
      e.state.pos.x = zone.x + (holdAttack ? heldAt[e.id] ?? 0 : e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z;
      if (holdAttack) e.state.speed = 0;
    }
  };
  const takeSector = (actor) => {
    placeAttack(actor, zoneOf(actor));
    for (const e of actor.authority.entities) {
      if (e.team === 'bravo' && e.id !== SURVIVOR && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
    }
    pinSurvivor(actor);
  };
  // after the advance: the survivor pinned, and with `holdAttack` the attack where it took sector 2
  const hold = (actor) => { pinSurvivor(actor); if (holdAttack) placeAttack(actor, zones[1]); };
  let tick = 0;
  const step = (actor, n, heard, fight) => {
    for (let k = 0; k < n; k++) {
      fight?.(actor);
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  // (`hand`: sealed halfway through the sector, which a hand the play never sees takes 5 ticks into the window)
  for (let guard = 0; guard < 30000 && !(lineOf(old) === 1 && zoneOf(old).control > (hand ? 0.4 : 0.95)); guard++) step(old, 1, null, takeSector);
  const ally = sim.entityById.get('a-2');
  ally.combat.hp = 0; ally.combat.destroyed = true;
  for (let guard = 0; guard < 600 && !(zoneOf(old).control > (hand ? 0.5 : 0.97)); guard++) step(old, 1, null, takeSector);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), replayed);
  const allyLives = ally.modeLives;
  const told = new Map(), heard = [], rose = new Map();
  let windowStep = 0, killed = null;
  const fight = (actor) => {
    if (hand && ++windowStep === 5) Object.assign(zones[1], { control: 1, owner: 'alpha', contested: false });
    // (`killAt`: a seat kills the advance's first arrival again that many steps into the window)
    if (killAt && windowStep === killAt && actor === old) {
      killed = [...told.keys()].filter((id) => id.startsWith('d-')).sort()[0] ?? null;
      if (killed) { const e = sim.entityById.get(killed); e.combat.hp = 0; e.combat.destroyed = true; }
    }
    return lineOf(actor) < 2 ? takeSector(actor) : hold(actor);
  };
  const listen = (ev) => {
    heard.push(ev.type);
    if (ev.type === 'mode_respawn') { told.set(ev.id, tick); const p = sim.entityById.get(ev.id).state.pos; rose.set(ev.id, { x: p.x, z: p.z }); }
  };
  // the sector falls in the window; from the advance on, the fight stops (the arrivals stand on their slots)
  step(old, 1, listen, fight);
  const heldAlly = captureEntityRow(ally, old.wireIdOf('a-2'), era, tick);
  step(old, 29, listen, fight);
  const latest = hostFrame(old, tick, era, hidden);
  const frame = { ...latest, entities: latest.entities.map((row) => (row.entityId === heldAlly.entityId ? heldAlly : row)) };
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeLine({ tick: state.tick, ...resumeClocksOf(state) });
  const serial = fresh.authority.modeEventSerial;
  const applied = applyResumeState(fresh, state);
  // (replayed, the play's own mode events count on the serial and go to no seat: none is left pending)
  return { old, fresh, sim, step, tick, keyframe, frame, told, rose, heard, pinSurvivor, hold, SURVIVOR, lineOf, replayedSteps: applied.replayed?.steps ?? 0, killed: () => killed,
    announced: replayed ? fresh.authority.pendingEventCount : fresh.authority.modeEventSerial - serial,
    pendingAfter: fresh.authority.pendingEventCount, ally: { lives: allyLives, held: heldAlly, oldLives: ally.modeLives, freshLives: fresh.authority.entityById.get('a-2').modeLives } };
}
const lineDirector = (actor) => {
  const { mode } = actor.authority.captureModeCheckpoint();
  const line = mode.waves.line;
  return { index: line.index, wave: mode.waves.wave, fresh: [...line.fresh].sort().join(), lastWave: [...mode.waves.lastWaveIds].sort().join(),
    counter: line.counter, regroup: line.regroup, reinforceAt: line.nextReinforceAtS, rng: mode.rng };
};
const count = (list, type) => list.filter((t) => t === type).length;
for (const [label, hidden, replayed, hand, killAt = 0] of [['[4] Frontline: the line advanced after the keyframe, every arrival in the seat\'s newest frame', false, false, false],
  ['[5] Frontline: the line advanced after the keyframe, the arrivals hidden from the seat', true, false, false],
  // (276) the keyframe naming its battle clock: the window replayed. As built, the play takes the sector itself (the attack
  // stood in it at the keyframe): the advance, its arrivals and the ally's revive are the play's, the old host's
  ['[4r] [4] replayed: the play makes the advance', false, true, false],
  ['[5r] [5] replayed: the play makes the advance', true, true, false],
  // and the sector taken by a hand the play never sees (sealed halfway through it): the new host takes the advance up as made
  ['[4h] [4] replayed, the sector taken by a hand the play never saw', false, true, true],
  ['[5h] [5] replayed, the sector taken by a hand the play never saw', true, true, true],
  // (round 5) and one of the advance's arrivals a seat kills again inside the window: down at the resume, never risen again
  ['[4k] [4h] with an arrival killed again in the window', false, true, true, 20]]) {
  // the play made the advance itself (its revives the old host's, nothing left to rise on the first step)
  const played = replayed && !hand;
  console.log(label);
  const run = frontlineWindow(hidden, false, replayed, hand, killAt);
  ok(replayed === (run.replayedSteps === 30), replayed ? `the window is replayed (${run.replayedSteps} steps)` : 'the 275 reading (no battle clock)');
  if (killAt) {
    const id = run.killed(), e = run.fresh.authority.entityById.get(id), o = run.old.authority.entityById.get(id);
    ok(!!id && e.modeLife === 'down' && o.modeLife === 'down' && e.modeLives === o.modeLives, `${id}, the advance's arrival killed again, is down at the `
      + `resume as on the old host, its life counted alike (${e.modeLife}, lives ${e.modeLives} against ${o.modeLives}; round 5: benched, it rose again)`);
  }
  const { old, fresh, step } = run;
  const sealed = run.keyframe.modeCheckpoint.mode;
  const arrivals = [...run.told.keys()].filter((id) => id.startsWith('d-')).sort();
  ok(sealed.waves.line.index === 1 && sealed.waves.wave === 2 && run.lineOf(old) === 2 && count(run.heard, 'mode_line_advanced') === 1
    && count(run.heard, 'mode_wave_started') === 1 && arrivals.length > 0 && JSON.parse(run.frame.modeStateJson).line.index === 2,
  `the case is built: the keyframe is sealed on sector 2 (line 1, wave 2, control ${sealed.waves.line.zones[1].control.toFixed(3)}), the old host advances `
    + `to the last sector after it (${count(run.heard, 'mode_line_advanced')} advance, ${count(run.heard, 'mode_wave_started')} wave start, arrivals `
    + `${arrivals.join(', ')}) and the newest frame shows line 2`);
  ok((sealed.waves.paces ?? []).some(([id, at]) => id === run.SURVIVOR && at === 1), `the keyframe names the survivor's pace: its life began in wave 1 `
    + `(paces ${JSON.stringify(sealed.waves.paces ?? [])})`);
  ok(run.lineOf(fresh) === 2 && run.announced === 0 && run.pendingAfter === 0, `the restore takes the advance up, announcing nothing (line `
    + `${run.lineOf(fresh)}; ${run.announced} mode events during the resume, ${run.pendingAfter} pending)`);
  const zonesOf = (actor) => actor.authority.modeController.state.zones.map((z) => `${z.id} ${z.owner ?? '-'} ${z.control.toFixed(3)}`).join('; ');
  ok(zonesOf(fresh) === zonesOf(old), `the sectors stand as the frame shows them, the one taken in the window held (${zonesOf(fresh)} against ${zonesOf(old)})`);
  ok(run.told.has('a-2') && run.ally.held.hp <= 0 && run.ally.held.tick < run.told.get('a-2') && run.ally.oldLives === run.ally.lives + 1
    && run.ally.freshLives === (played ? run.ally.oldLives : run.ally.lives), `no ally stands up twice: the old host stood a-2 up at the advance (told at tick `
      + `${run.told.get('a-2')}; the seat's row of it from tick ${run.ally.held.tick}), and the restore stands it up no second time (its lives `
      + `${run.ally.freshLives}, the keyframe's ${run.ally.lives}${played ? `, the old host's ${run.ally.oldLives}: the play's advance stood it up` : ''})`);
  const a = lineDirector(old), b = lineDirector(fresh);
  ok(a.wave === b.wave && a.fresh === b.fresh && a.lastWave === b.lastWave && a.rng[0] === b.rng[0] && a.reinforceAt === b.reinforceAt,
    `the reinforcement is the old host's: wave ${b.wave}, its arrivals (${b.fresh}), the line's hulls and the draws' stream past the same shuffle`
      + `${a.wave === b.wave && a.fresh === b.fresh && a.lastWave === b.lastWave && a.rng[0] === b.rng[0] && a.reinforceAt === b.reinforceAt ? ''
        : ` (old: wave ${a.wave}, ${a.fresh}; ${a.lastWave}; ${a.rng[0]}; ${a.reinforceAt}; new: wave ${b.wave}, ${b.fresh}; ${b.lastWave}; ${b.rng[0]}; ${b.reinforceAt})`}`);
  // (replayed, the advance's moment is the old host's to the bit: the revives the seat was told of, on the play's clock)
  const tol = replayed ? 1e-9 : 1 / 60 + 1e-9;
  ok(!!a.counter && !!b.counter && a.counter.line === b.counter.line && a.counter.x === b.counter.x && a.counter.z === b.counter.z
    && Math.abs(a.counter.atS - b.counter.atS) <= tol && Math.abs(a.counter.untilS - b.counter.untilS) <= tol,
  `the counter-attack on sector 2 falls when the old host's does (old ${a.counter?.atS.toFixed(3)}, new ${b.counter?.atS.toFixed(3)})`);
  ok(!!a.regroup && !!b.regroup && Math.abs(a.regroup.untilS - b.regroup.untilS) <= tol,
    `the regroup before the last sector runs on the old host's clock (until old ${a.regroup?.untilS.toFixed(3)}, new ${b.regroup?.untilS.toFixed(3)})`);
  if (!hidden) ok(a.rng[1] === b.rng[1], `the arrival points' stream stands where the old host's placing left it (${a.rng[1]} against ${b.rng[1]})`);
  fresh.authority.onMatchReady();
  const freshHeard = [], respawned = [], freshRose = new Map();
  step(fresh, 20, (ev) => {
    freshHeard.push(ev.type);
    if (ev.type === 'mode_respawn') { respawned.push(ev.id); const p = fresh.authority.entityById.get(ev.id).state.pos; freshRose.set(ev.id, { x: p.x, z: p.z }); }
  }, run.pinSurvivor);
  step(old, 20, null, run.pinSurvivor);
  ok(count(freshHeard, 'mode_line_advanced') === 0 && count(freshHeard, 'mode_wave_started') === 0,
    `the new host never advances or announces the sector again (${count(freshHeard, 'mode_line_advanced')} advance, `
      + `${count(freshHeard, 'mode_wave_started')} wave start)`);
  ok(JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `the new host fields the old host's defenders (${fielded(fresh).join(', ')} against `
    + `${fielded(old).join(', ')})`);
  ok(paceApart(old, fresh).length === 0, `every defender drives at its life's pace on both hosts: the survivor at sector 1's `
    + `(x${old.authority.entityById.get(run.SURVIVOR).modeSpeedMultiplier}), the arrivals at the last sector's; apart: ${paceApart(old, fresh).join(', ') || 'none'}`);
  if (!hidden || played) {
    ok(respawned.length === 0, `no defender the old host brought on rises again on the new host (${respawned.join(', ') || 'none'})`);
    const moved = [];
    for (const id of arrivals) {
      const e = fresh.authority.entityById.get(id).state.pos, o = old.authority.entityById.get(id).state.pos;
      const d = Math.hypot(e.x - o.x, e.z - o.z);
      if (!(d < 15)) moved.push(`${id} ${d.toFixed(0)} m`);
    }
    // (hidden and played, each arrival stands where the play's line guard put it, round the play's attack, which the
    // staging's hand moved on the old host alone: no row sets it right)
    if (hidden) console.log(`      (hidden arrivals the play placed round its own attack, 20 ticks on: apart ${moved.join(', ') || 'none past 15 m'})`);
    else ok(moved.length === 0, `every arrival holds the line from where the old host put it (within 15 m 20 ticks on; apart: ${moved.join(', ') || 'none'})`);
  } else {
    ok(JSON.stringify(respawned.sort()) === JSON.stringify(arrivals), `the hidden arrivals rise on the new host's first steps, those alone (${respawned.join(', ')} `
      + `against the old host's ${arrivals.join(', ')})`);
    const c = lineDirector(old), d = lineDirector(fresh);
    ok(c.rng[1] === d.rng[1], `once they stand, the arrival points' stream is where the old host's is (${c.rng[1]} against ${d.rng[1]})`);
    // where they rise against the old host's: the line guard reads the attack where it stands on the new host's first
    // step, which drove on 0.5 s from where it took the sector (a residual, fix-up r2; [5b] holds the attack still)
    const placed = arrivals.map((id) => [id, Math.hypot(freshRose.get(id)?.x - run.rose.get(id)?.x, freshRose.get(id)?.z - run.rose.get(id)?.z)]);
    console.log(`      (the attack moved on 0.5 s: each rises ${placed.map(([id, d]) => `${id} ${d.toFixed(1)} m`).join(', ')} from the old host's)`);
  }
  old.stop(); fresh.stop();
}

console.log('[5b] the arrivals hidden from the seat, the attack held where it took the sector: each rises where the old host placed it');
{
  // fix-up r2 (the correctness review: they rose in entity order, each drawing another slot's depth and jitter on the
  // first step, 19.8 m apart 2 s on): the restore takes each hidden slot's draws in slot order with the seen ones', and
  // they rise in slot order, so with the attack where the line guard read it at the advance each stands on the old
  // host's spot
  const run = frontlineWindow(true, true);
  const { old, fresh, step } = run;
  const arrivals = [...run.told.keys()].filter((id) => id.startsWith('d-')).sort();
  fresh.authority.onMatchReady();
  const freshRose = new Map();
  step(fresh, 20, (ev) => { if (ev.type === 'mode_respawn') { const p = fresh.authority.entityById.get(ev.id).state.pos; freshRose.set(ev.id, { x: p.x, z: p.z }); } }, run.hold);
  const placed = arrivals.map((id) => [id, Math.hypot(freshRose.get(id)?.x - run.rose.get(id)?.x, freshRose.get(id)?.z - run.rose.get(id)?.z)]);
  ok(arrivals.length > 1 && placed.every(([, d]) => d < 0.5), `each hidden arrival rises where the old host placed it: its own slot's draws, in slot order `
    + `(${placed.map(([id, d]) => `${id} ${d.toFixed(2)} m`).join(', ')})`);
  old.stop(); fresh.stop();
}

console.log('[6] a Horde trickle arrival after the keyframe: taken up as made, never brought on twice');
{
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  // wave 1 opens with the field full and the rest queued; two hostiles fall at once, so the field is short by two and
  // the trickle brings one on every trickleS
  step(old, 1);
  const opening = fielded(old);
  for (const id of opening.slice(0, 2)) { const e = sim.entityById.get(id); e.combat.hp = 0; e.combat.destroyed = true; }
  step(old, 1);
  for (let guard = 0; guard < 600 && hordeOf(old).nextTrickleAtS - sim.timeS > 0.2; guard++) step(old, 1);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era, false) }));
  const sealed = keyframe.modeCheckpoint.mode.waves.horde;
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  const frame = hostFrame(old, tick, era, false);
  ok(sealed.queued > 1 && told.size === 1 && hordeOf(old).queued === sealed.queued - 1 && fielded(old).length < 6,
    `the case is built: the keyframe holds ${sealed.queued} queued, the old host's trickle brings ${[...told.keys()].join(', ')} on after it `
      + `(${hordeOf(old).queued} queued), and the field is still short (${fielded(old).length} of 6)`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  const a = hordeOf(old), b = hordeOf(fresh);
  ok(a.queued === b.queued && Math.abs(a.nextTrickleAtS - b.nextTrickleAtS) <= 1 / 60 + 1e-9, `the queue and the trickle's clock are the old `
    + `host's (queued ${b.queued} against ${a.queued}; next at ${b.nextTrickleAtS.toFixed(3)} against ${a.nextTrickleAtS.toFixed(3)})`);
  // fix-up r2 (the correctness review: the arrival placed nothing, so the stream stood one arrival behind and every later
  // arrival landed on the point the old host gave the one before it, 266 m off by wave 4)
  const ra = old.authority.captureModeCheckpoint().mode, rb = fresh.authority.captureModeCheckpoint().mode;
  ok(ra.rng[1] === rb.rng[1] && ra.waves.horde.spawnSector === rb.waves.horde.spawnSector, `the arrival points' stream and the sector due next are where `
    + `the old host's arrival left them (${rb.rng[1]}, sector ${rb.waves.horde.spawnSector} against ${ra.rng[1]}, sector ${ra.waves.horde.spawnSector})`);
  fresh.authority.onMatchReady();
  const oldArrivals = [], newArrivals = [], oldAt = [], newAt = [];
  const at = (actor, id) => { const p = actor.authority.entityById.get(id).state.pos; return `${id}@(${p.x.toFixed(1)},${p.z.toFixed(1)})`; };
  for (let k = 0; k < 150; k++) {
    step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn') { newArrivals.push(k); newAt.push(at(fresh, ev.id)); } });
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn') { oldArrivals.push(k); oldAt.push(at(old, ev.id)); } });
  }
  ok(oldArrivals.length > 0 && newArrivals.length === oldArrivals.length && newArrivals.every((k, i) => Math.abs(k - oldArrivals[i]) <= 1),
    `over the next 2.5 s the new host brings hostiles on when the old host does, none sooner (ticks ${newArrivals.join(', ') || 'none'} against `
      + `${oldArrivals.join(', ') || 'none'})`);
  ok(hordeOf(old).queued === hordeOf(fresh).queued && fielded(old).length === fielded(fresh).length, `and the queue and the field stay the old host's `
    + `(queued ${hordeOf(fresh).queued} against ${hordeOf(old).queued}; ${fielded(fresh).length} against ${fielded(old).length} on the field)`);
  ok(oldAt.length > 0 && JSON.stringify(newAt) === JSON.stringify(oldAt), `each later arrival lands where the old host's does (${newAt.join(' ') || 'none'} `
    + `against ${oldAt.join(' ') || 'none'})`);
  old.stop(); fresh.stop();
}

/**
 * [6r] (276): wave 1 opens with the field full and the rest queued, its trickle due and held back by the full field; the
 * seat's kill (the play never fires it) falls in the window's first tick, and the old host's trickle brings one on at
 * once. `killAgain`: the seat kills that arrival again 10 ticks on. The elected seat resumes from a keyframe naming its
 * battle clock (the window replayed).
 */
function trickleWindow(killAgain) {
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  step(old, 150);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), true);
  const sealed = keyframe.modeCheckpoint.mode.waves.horde;
  const victim = sim.entityById.get(fielded(old)[0]);
  victim.combat.hp = 0; victim.combat.destroyed = true;
  const hear = (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); };
  step(old, 10, hear);
  if (killAgain) for (const id of told.keys()) { const e = sim.entityById.get(id); e.combat.hp = 0; e.combat.destroyed = true; }
  step(old, 20, hear);
  const frame = hostFrame(old, tick, era, false);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  return { old, fresh, sim, step, sealed, keyframe, victim, told, applied };
}
const hordeShown = (actor) => { const h = actor.authority.snapshotMeta('h0').modeState.horde; return `alive ${h.alive} queued ${h.queued} remaining ${h.remaining}`; };
for (const [label, killAgain] of [['[6r] (276) a seat\'s kill in a replayed window lets the old host\'s trickle bring one on that the play\'s full field held back: taken up as made', false],
  ['[6r2] (276) and the seat kills that arrival again inside the window: its arrival taken, then its death', true]]) {
  console.log(label);
  const { old, fresh, sim, step, sealed, keyframe, victim, told, applied } = trickleWindow(killAgain);
  const arrival = [...told.keys()][0];
  ok(sealed.queued > 1 && sealed.nextTrickleAtS < keyframe.modeCheckpoint.mode.elapsedS && told.size === 1 && hordeOf(old).queued === sealed.queued - 1
    && fielded(old).length === (killAgain ? 5 : 6), `the case is built: the keyframe holds the field full, ${sealed.queued} queued and the trickle due; the seat `
      + `kills ${victim.id} and the old host's trickle brings ${arrival} on (${hordeOf(old).queued} queued)${killAgain ? `, which the seat kills again` : ''}`);
  const a = hordeOf(old), b = hordeOf(fresh);
  ok(applied.replayed?.steps === 30 && a.queued === b.queued && Math.abs(a.nextTrickleAtS - b.nextTrickleAtS) <= 1e-9 && hordeShown(fresh) === hordeShown(old)
    && JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `the queue, the trickle's clock and the field are the old host's (queued ${b.queued} `
      + `against ${a.queued}; next at ${b.nextTrickleAtS.toFixed(3)} against ${a.nextTrickleAtS.toFixed(3)}; ${hordeShown(fresh)}; before, the queue held the `
      + `arrival twice and the trickle stood due)`);
  if (killAgain) {
    const e = fresh.authority.entityById.get(arrival), o = sim.entityById.get(arrival);
    ok(e.modeLife === 'down' && e.modeLives === o.modeLives, `the arrival is down at the resume, its life counted as the old host's (${e.modeLife}, lives ${e.modeLives} against ${o.modeLives})`);
  }
  fresh.authority.onMatchReady();
  // the same hand on both: every fielded hostile falls each second; each host's arrivals, tick by tick
  const oldArrivals = [], newArrivals = [];
  for (let k = 0; k < 240; k++) {
    if (k % 60 === 0) for (const actor of [old, fresh]) for (const id of fielded(actor)) { const e = actor.authority.entityById.get(id); e.combat.hp = 0; e.combat.destroyed = true; }
    step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn') newArrivals.push(k); });
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn') oldArrivals.push(k); });
  }
  ok(oldArrivals.length > 0 && JSON.stringify(newArrivals) === JSON.stringify(oldArrivals), `over the next 4 s, every hostile felled each second, the new `
    + `host brings hostiles on when the old host does (ticks ${newArrivals.join(', ')} against ${oldArrivals.join(', ')}; the seat's victim, its rest clock `
    + `from the frame, comes back a trickle beat later, past these 4 s)`);
  old.stop(); fresh.stop();
}

console.log('[6r3] (276) a trickle arrival both hosts made in a replayed window that the play alone then loses: its arrival not taken again');
{
  // waveStartMigration [6]'s staging (the field short by two, the trickle due 0.2 s on), sealed with its battle clock; both
  // hosts' trickles bring one on in the window, and a hand on the play's own steps kills it there (a round the seat's real
  // hull blocked); the frame's row stands it alive
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  step(old, 1);
  for (const id of fielded(old).slice(0, 2)) { const e = sim.entityById.get(id); e.combat.hp = 0; e.combat.destroyed = true; }
  step(old, 1);
  for (let guard = 0; guard < 600 && hordeOf(old).nextTrickleAtS - sim.timeS > 0.2; guard++) step(old, 1);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), true);
  const keyTick = tick;
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  const frame = hostFrame(old, tick, era, false);
  const [arrival, arrivedAt] = [...told][0] ?? [];
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const play = fresh.authority.step.bind(fresh.authority);
  let played = 0;
  fresh.authority.step = (input) => {
    if (++played === arrivedAt - keyTick + 3) { const e = fresh.authority.entityById.get(arrival); e.combat.hp = 0; e.combat.destroyed = true; }
    return play(input);
  };
  applyResumeState(fresh, state);
  fresh.authority.step = play;
  const a = hordeOf(old), b = hordeOf(fresh), ra = old.authority.captureModeCheckpoint().mode, rb = fresh.authority.captureModeCheckpoint().mode;
  ok(told.size === 1 && played === 30 && a.queued === b.queued && ra.rng[1] === rb.rng[1] && hordeShown(fresh) === hordeShown(old)
    && fresh.authority.entityById.get(arrival).modeLife === 'alive', `${arrival}, the play's own arrival, stands as the row shows it, its arrival taken once: `
      + `the queue and the arrival points' stream the old host's (queued ${b.queued} against ${a.queued}; ${hordeShown(fresh)})`);
  old.stop(); fresh.stop();
}

// Fix-up r2 (the completeness review's census of the wave directors: three more moves the window can hold, each made a
// second time by the new host). Each keyframe is sealed 0.3 s before the move, the old host runs 30 ticks on, and the
// elected seat resumes from that keyframe, its newest frame and the respawns it was told.
for (const [label, windowTicks, replayed] of [['[7] a Horde wave cleared after the keyframe: taken up as made, never cleared twice', 30, false],
  ['[7b] the seat\'s newest frame is the clear\'s own step (its lull not yet counted down)', 1, false],
  ['[7r] [7] with the keyframe naming its battle clock (every host\'s since 275): the window replayed, the death the play never saw', 30, true],
  ['[7br] [7b] replayed', 1, true]]) {
  console.log(label);
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard, each) => {
    for (let k = 0; k < n; k++) {
      each?.(actor);
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const living = (actor) => actor.authority.entities.filter((e) => e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed);
  // one hostile stands (the lowest id), the rest fall as they come, until the queue is empty; the survivor is worn
  const fellAllButOne = (actor) => { for (const e of living(actor).sort((p, q) => (p.id < q.id ? -1 : 1)).slice(1)) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 2000 && !(hordeOf(old).queued === 0 && living(old).length === 1); guard++) step(old, 15, null, fellAllButOne);
  const h0 = sim.entityById.get('h0');
  h0.combat.hp = Math.round(h0.combat.maxHp * 0.4);
  step(old, 2);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), replayed);
  const sealed = keyframe.modeCheckpoint.mode.waves.horde, hpAtKeyframe = h0.combat.hp;
  const last = living(old)[0];
  last.combat.hp = 0; last.combat.destroyed = true;
  const heardOld = [];
  step(old, windowTicks, (ev) => { if (ev.type.startsWith('mode_')) heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  const frame = hostFrame(old, tick, era, false);
  const shownLull = JSON.parse(frame.modeStateJson).horde.nextWaveInS;
  ok(sealed.nextWaveAtS === null && sealed.queued === 0 && count(heardOld, 'mode_wave_cleared') === 1 && h0.combat.hp > hpAtKeyframe
    && (windowTicks === 1 ? shownLull === 0 : shownLull > 0),
  `the case is built: the keyframe holds wave 1's last hostile standing and no lull, the old host clears the wave after it (${heardOld.join(', ')}) `
      + `and patches h0 up (${hpAtKeyframe} -> ${h0.combat.hp} hp); the frame shows ${shownLull.toFixed(3)} s of the lull left`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const serial = fresh.authority.modeEventSerial;
  const applied = applyResumeState(fresh, state);
  // (replayed, the play's own mode events count on the serial and go to no seat: none is left pending)
  const announced = replayed ? fresh.authority.pendingEventCount : fresh.authority.modeEventSerial - serial;
  ok(replayed === (applied.replayed?.steps === windowTicks), replayed ? `the window is replayed (${applied.replayed?.steps} steps)` : 'the 275 reading (no battle clock)');
  const a = hordeOf(old), b = hordeOf(fresh), ma = old.authority.captureModeCheckpoint().mode, mb = fresh.authority.captureModeCheckpoint().mode;
  ok(b.nextWaveAtS !== null && Math.abs(a.nextWaveAtS - b.nextWaveAtS) <= 1 / 60 + 1e-9 && announced === 0,
    `the restore takes the clear up, announcing nothing: the lull ends when the old host's does (${b.nextWaveAtS?.toFixed(3)} against ${a.nextWaveAtS.toFixed(3)})`);
  const caches = (m) => JSON.stringify(m.waves.horde.pickups.map((p) => [p.id, p.kind, p.active, p.x.toFixed(3), p.z.toFixed(3)]));
  ok(caches(mb) === caches(ma) && mb.waves.horde.sequence === ma.waves.horde.sequence && mb.rng[0] === ma.rng[0] && mb.rng[1] === ma.rng[1],
    `the clear's cache is the old host's (${caches(mb)}), and both streams stand where the old host's clear left them`);
  fresh.authority.onMatchReady();
  const heardNew = [];
  for (let k = 0; k < 120; k++) { step(fresh, 1, (ev) => { if (ev.type.startsWith('mode_')) heardNew.push(ev.type); }); step(old, 1); }
  const fh0 = fresh.authority.entityById.get('h0');
  ok(count(heardNew, 'mode_wave_cleared') === 0 && count(heardNew, 'mode_pickup_spawned') === 0, `the new host never clears the wave again (${heardNew.join(', ') || 'no mode events'} in 2 s)`);
  ok(fh0.combat.hp === h0.combat.hp, `h0 is patched up once (${fh0.combat.hp} hp on the new host against ${h0.combat.hp} on the old)`);
  ok(Math.abs(hordeOf(old).nextWaveAtS - hordeOf(fresh).nextWaveAtS) <= 1 / 60 + 1e-9 && hordeOf(fresh).nextWaveAtS !== null,
    `and the lull still ends when the old host's does (${hordeOf(fresh).nextWaveAtS?.toFixed(3)} against ${hordeOf(old).nextWaveAtS?.toFixed(3)})`);
  old.stop(); fresh.stop();
}

console.log('[7k] (276) a Horde clear and the next wave begun in one replayed window, the play seeing neither, one of the wave\'s arrivals killed again');
{
  // [7]'s staging: wave 1's last hostile falls to the seat in the window's first tick, so the play never clears it; the
  // window (540 ticks) holds the old host's clear and its next wave's start, and the seat kills one of that wave's
  // arrivals again 25 ticks before the frame. The begun wave keeps it, down: never stood up again
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0, k = 0, victim = null;
  const told = new Map();
  const step = (actor, n, heard, each) => {
    for (let j = 0; j < n; j++) {
      each?.(actor);
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const living = (actor) => actor.authority.entities.filter((e) => e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed);
  const fellAllButOne = (actor) => { for (const e of living(actor).sort((p, q) => (p.id < q.id ? -1 : 1)).slice(1)) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 2000 && !(hordeOf(old).queued === 0 && living(old).length === 1); guard++) step(old, 15, null, fellAllButOne);
  step(old, 2);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), true);
  const last = living(old)[0];
  last.combat.hp = 0; last.combat.destroyed = true;
  step(old, 540, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); }, () => {
    if (++k !== 515) return;
    victim = [...told.keys()].filter((id) => id.startsWith('z-')).sort()[0] ?? null;
    if (victim) { const e = sim.entityById.get(victim); e.combat.hp = 0; e.combat.destroyed = true; }
  });
  const frame = hostFrame(old, tick, era, false);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  const waveOf = (actor) => actor.authority.captureModeCheckpoint().mode.waves.wave;
  ok(applied.replayed?.steps === 540 && waveOf(old) === 2 && waveOf(fresh) === 2 && !!victim, `the case is built: the old host cleared wave 1 and began `
    + `wave 2 in the window, the play neither; the seat killed ${victim} again`);
  const e = fresh.authority.entityById.get(victim), o = sim.entityById.get(victim);
  ok(e.modeLife === 'down' && o.modeLife === 'down' && JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `${victim} is down at the resume as on `
    + `the old host, the field alike (${fielded(fresh).join(', ')}; round 5: benched, it rose again)`);
  fresh.authority.onMatchReady();
  const rose = [];
  step(fresh, 60, (ev) => { if (ev.type === 'mode_respawn' && ev.id === victim) rose.push(ev.id); });
  ok(rose.length === 0 && fresh.authority.entityById.get(victim).modeLife === 'down', `and it does not rise again on the new host's first second (${rose.length})`);
  old.stop(); fresh.stop();
}

for (const [label, replayed] of [['[8] a cache taken after the keyframe: taken once', false],
  ['[8r] [8] replayed (the play\'s h0 never reached it: the frame shows it taken)', true]]) {
  console.log(label);
  // wave 1 played out (every hostile falls as it stands): its clear drops a cache; h0, worn, drives onto it after the
  // keyframe and the old host hands it over
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15); }
  const cache = hordeOf(old).pickups.find((p) => p.active);
  const h0 = sim.entityById.get('h0');
  h0.combat.hp = 1000;
  step(old, 2);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), replayed);
  h0.state.pos.x = cache.x; h0.state.pos.z = cache.z; h0.state.speed = 0;
  const heardOld = [];
  step(old, 30, (ev) => { if (ev.type.startsWith('mode_')) heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  const frame = hostFrame(old, tick, era, false);
  ok(!!cache && keyframe.modeCheckpoint.mode.waves.horde.pickups.some((p) => p.id === cache.id && p.active) && count(heardOld, 'mode_pickup_collected') === 1
    && h0.combat.hp > 1000, `the case is built: the keyframe holds ${cache?.id} (${cache?.kind}) on the ground, and h0 takes it after (${heardOld.join(', ')}; `
      + `1000 -> ${h0.combat.hp} hp)`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  ok(replayed === (applied.replayed?.steps === 30), replayed ? `the window is replayed (${applied.replayed?.steps} steps)` : 'the 275 reading (no battle clock)');
  ok(!hordeOf(fresh).pickups.some((p) => p.id === cache.id && p.active), `the restore holds the cache taken (${JSON.stringify(hordeOf(fresh).pickups.map((p) => [p.id, p.active]))})`);
  fresh.authority.onMatchReady();
  const heardNew = [];
  for (let k = 0; k < 60; k++) { step(fresh, 1, (ev) => { if (ev.type.startsWith('mode_')) heardNew.push(ev.type); }); step(old, 1); }
  const fh0 = fresh.authority.entityById.get('h0');
  ok(count(heardNew, 'mode_pickup_collected') === 0 && fh0.combat.hp === h0.combat.hp, `h0, still on the spot, does not take it again (${heardNew.join(', ') || 'no mode events'} `
    + `in 1 s; ${fh0.combat.hp} hp on the new host against ${h0.combat.hp} on the old)`);
  old.stop(); fresh.stop();
}

console.log('[8h] a cache the play\'s held hull drives onto that the seat never reached: on the ground at the resume');
{
  // (276) the seat's h0 runs at the cache with its throttle open and stops short of it in the window (its real command, a
  // hard brake, which the play never hears); the play's h0 drives on, on its keyframe command, and takes it. The frame lists
  // it; at the resume it lies there on both hosts, and h0 takes it once when it drives on
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0, stopOld = false;
  const told = new Map();
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      if (actor === old && stopOld) old.authority.entityById.get('h0').state.speed = 0;
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15); }
  const cache = hordeOf(old).pickups.find((p) => p.active);
  const h0 = sim.entityById.get('h0');
  h0.combat.hp = 1000;
  // h0 40 m short of the cache, facing it, driving at it (its seat's command) until it runs; then 9 m short on its heading
  const yaw = 0.3;
  h0.state.pos.set(cache.x - Math.sin(yaw) * 40, 0, cache.z - Math.cos(yaw) * 40); h0.state.yaw = yaw; h0.state.turretYaw = 0;
  const drive = { throttle: 1, steer: 0, brake: false, fire: false, fireIntentSeq: null, aimLocked: false, shellSlot: 0, actionBits: 0, aimYaw: yaw, aimPitch: 0, aimDistance: 200 };
  inputs.set('h0', drive);
  step(old, 150);
  h0.state.pos.x = cache.x - Math.sin(h0.state.yaw) * 9; h0.state.pos.z = cache.z - Math.cos(h0.state.yaw) * 9;
  step(old, 2);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era, hostFrame(old, tick, era, false), true);
  inputs.set('h0', { ...drive, throttle: 0, brake: true });
  stopOld = true;
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  stopOld = false;
  const frame = hostFrame(old, tick, era, false);
  const active = (actor) => hordeOf(actor).pickups.find((p) => p.id === cache.id)?.active;
  ok(active(old) === true && h0.combat.hp === 1000 && keyframe.entities.length > 0, `the case is built: h0 runs at ${cache.id} at the keyframe and stops short in the window (1000 hp)`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  applyResumeState(fresh, state);
  fresh.authority.onMatchReady();
  const fh0 = fresh.authority.entityById.get('h0');
  ok(active(fresh) === true && fh0.combat.hp === h0.combat.hp, `the cache the play's h0 took lies on the ground at the resume, as the frame shows it (active: `
    + `${active(fresh)}; h0 ${fh0.combat.hp} hp against ${h0.combat.hp})`);
  inputs.set('h0', drive);
  const heardNew = [], heardOld = [];
  for (let k = 0; k < 90; k++) { step(fresh, 1, (ev) => { if (ev.type.startsWith('mode_')) heardNew.push(ev.type); }); step(old, 1, (ev) => { if (ev.type.startsWith('mode_')) heardOld.push(ev.type); }); }
  inputs.delete('h0');
  ok(count(heardNew, 'mode_pickup_collected') === 1 && count(heardOld, 'mode_pickup_collected') === 1 && fh0.combat.hp === h0.combat.hp,
    `and h0 takes it once when it drives on, on both hosts (${fh0.combat.hp} hp against ${h0.combat.hp})`);
  old.stop(); fresh.stop();
}

/**
 * [8b] and [8c]: [8]'s case on another mode's cache list. `mode` and `roster` make the match (seed 7, h0 the seat);
 * `setUp` plays it to its first cache, `listOf` reads that list from a mode checkpoint, `landed` says the cache can be
 * taken, and `pin` holds a hull in place each step. The taker, worn to 30 %, is held 300 m off the cache until the
 * keyframe and on it after; the old host runs 30 ticks on, and the elected seat resumes from that keyframe, its newest
 * frame and the respawns it was told. Both hosts then run 1 s side by side.
 */
function cacheWindow({ mode, roomId, roster, taker, setUp, listOf, landed, pin }) {
  const makeMode = (resume) => createMatchActor({ roomId, mapId: 'verdant', mode, seed: 7, seats, bots: roster, ruleset: matchRulesetFor(mode), world,
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeMode(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0, cache = null, onCache = false;
  const told = new Map();
  const hold = (actor) => {
    pin?.(actor);
    if (!cache) return;
    const e = actor.authority.entityById.get(taker);
    e.state.pos.set(cache.x + (onCache ? 0 : 300), 0, cache.z); e.state.speed = 0;
  };
  const step = (actor, n, heard) => {
    for (let k = 0; k < n; k++) {
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
      hold(actor);
    }
  };
  const cachesOf = (actor) => listOf(actor.authority.captureModeCheckpoint().mode);
  setUp?.(old, step);
  for (let guard = 0; guard < 60 * 300 && !cachesOf(old).some((p) => p.active); guard++) step(old, 1);
  cache = cachesOf(old).find((p) => p.active) ?? null;
  const t = sim.entityById.get(taker);
  t.combat.hp = Math.round(t.combat.maxHp * 0.3);
  hold(old);
  for (let guard = 0; guard < 60 * 30 && cache && !landed(old, cache); guard++) step(old, 1);
  step(old, 2);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era, false) }));
  const hpAtKeyframe = t.combat.hp;
  onCache = true;
  hold(old);
  const heardOld = [];
  step(old, 30, (ev) => { if (ev.type.startsWith('mode_')) heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, tick); });
  const frame = hostFrame(old, tick, era, false);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeMode({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  const restored = cachesOf(fresh).map((p) => [p.id, p.active]);
  fresh.authority.onMatchReady();
  const heardNew = [];
  for (let k = 0; k < 60; k++) { step(fresh, 1, (ev) => { if (ev.type.startsWith('mode_')) heardNew.push(ev.type); }); step(old, 1); }
  const result = { cache, sealed: listOf(keyframe.modeCheckpoint.mode), heardOld, hpAtKeyframe, hpOld: t.combat.hp,
    hpNew: fresh.authority.entityById.get(taker).combat.hp, restored, heardNew };
  old.stop(); fresh.stop();
  return result;
}

for (const [label, setting] of [
  ['[8b] a Mars cache taken after the keyframe (the objectives\' cache list): taken once', {
    // Mars with its one enemy held far off; h0 takes the first cache dropped
    mode: 'mars', roomId: 'mars-cache', roster: [{ playerId: 'b-0', name: 'B0', team: 'bravo', specId: spec }], taker: 'h0',
    listOf: (mode) => mode.objectives?.caches?.pickups ?? [], landed: () => true,
    pin: (actor) => { const b = actor.authority.entityById.get('b-0'); b.state.pos.set(400, 0, 400); b.state.speed = 0; } }],
  ['[8c] an AC-130 supply drop taken after the keyframe (the escort\'s support list): taken once', {
    // the gunship (h0) calls a repair drop at its aim; an escort tank takes it once it has landed
    mode: 'ac130', roomId: 'ac130-drop', roster: Array.from({ length: 4 }, (_, i) => ({ playerId: `g-${i}`, name: `G${i}`, team: 'alpha', specId: spec })), taker: 'g-0',
    setUp: (actor, step) => { step(actor, 120); actor.authority.modeController.requestSupply('h0', 'heal', actor.authority.timeS); },
    listOf: (mode) => mode.support?.pickups ?? [], landed: (actor, cache) => actor.authority.timeS > (cache.landAtS ?? 0) }],
]) {
  console.log(label);
  const { cache, sealed, heardOld, hpAtKeyframe, hpOld, hpNew, restored, heardNew } = cacheWindow(setting);
  ok(!!cache && sealed.some((p) => p.id === cache.id && p.active) && count(heardOld, 'mode_pickup_collected') === 1 && hpOld > hpAtKeyframe,
    `the case is built: the keyframe holds ${cache?.id} (${cache?.kind}) down, and ${setting.taker} takes it after (${heardOld.join(', ')}; ${hpAtKeyframe} -> ${hpOld} hp)`);
  ok(!!cache && restored.some(([id, active]) => id === cache.id && !active), `the restore holds the cache taken (${JSON.stringify(restored)})`);
  ok(count(heardNew, 'mode_pickup_collected') === 0 && hpNew === hpOld, `${setting.taker}, still on the spot, does not take it again (${heardNew.join(', ') || 'no mode events'} `
    + `in 1 s; ${hpNew} hp on the new host against ${hpOld} on the old)`);
}

/** Frontline as shipped (seed 7, the attackers 3 allied bots and h0, eight defenders) for [9] and [10]. */
const lineBots = [...Array.from({ length: 3 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
  ...Array.from({ length: 8 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
const makeFront = (resume, roomId) => createMatchActor({ roomId, mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats, bots: lineBots,
  ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const lineCheckpoint = (actor) => actor.authority.captureModeCheckpoint().mode;
const stepper = (old) => {
  const run = { tick: 0 };
  run.step = (actor, n, heard, each) => {
    for (let k = 0; k < n; k++) {
      each?.(actor);
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) run.tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  return run;
};
const sealAt = (old, run) => {
  const sim = old.authority, era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick: run.tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, run.tick, era, false) }));
  return { keyframe, era };
};

console.log('[9] a Frontline reinforce trickle arrival after the keyframe: taken up as made, never brought on twice');
{
  const old = makeFront(null, 'reinforce-window'), sim = old.authority, run = stepper(old);
  sim.onMatchReady();
  const zoneOf = (actor) => { const st = actor.authority.modeController.state; return st.zones[Math.min(st.line.index, st.zones.length - 1)]; };
  const zones = sim.modeController.state.zones;
  const ax = zones.at(-1).x - zones[0].x, az = zones.at(-1).z - zones[0].z, al = Math.hypot(ax, az) || 1;
  const reach = matchRulesetFor('frontline_assault').assault.contestReachM;
  // the attack contests the live sector from inside its contest reach, never in the zone (it never falls)
  const contest = (actor) => {
    const zone = zoneOf(actor);
    for (const e of actor.authority.entities) {
      if (e.team !== 'alpha' || e.modeActive === false || e.combat.destroyed) continue;
      const back = 30 + reach * 0.5 + (e.id === 'h0' ? 0 : 3);
      e.state.pos.x = zone.x - ax / al * back; e.state.pos.z = zone.z - az / al * back; e.state.speed = 0;
    }
  };
  const fellDefenders = (actor) => { for (const e of actor.authority.entities) if (e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  const fight = (actor) => { contest(actor); fellDefenders(actor); };
  run.step(old, 60, null, fight);
  for (let guard = 0; guard < 6000 && !Number.isFinite(lineCheckpoint(old).waves.line.nextReinforceAtS ?? NaN); guard++) run.step(old, 1, null, fight);
  const dueAt = lineCheckpoint(old).waves.line.nextReinforceAtS;
  for (let guard = 0; guard < 6000 && lineCheckpoint(old).elapsedS < dueAt - 0.3; guard++) run.step(old, 1, null, fight);
  const { keyframe, era } = sealAt(old, run);
  const told = new Map(), heardOld = [];
  run.step(old, 30, (ev) => { heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, run.tick); }, contest);
  const frame = hostFrame(old, run.tick, era, false);
  ok(count(heardOld, 'mode_line_reinforced') === 1 && told.size === 1 && keyframe.modeCheckpoint.mode.waves.line.nextReinforceAtS === dueAt,
    `the case is built: the keyframe holds the trickle due at ${dueAt.toFixed(3)} (mode ${keyframe.modeCheckpoint.mode.elapsedS.toFixed(3)}), and the old host's `
      + `trickle brings ${[...told.keys()].join(', ')} on after it (${count(heardOld, 'mode_line_reinforced')} mode_line_reinforced)`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeFront({ tick: state.tick, battleTimeMs: state.battleTimeMs }, 'reinforce-window');
  applyResumeState(fresh, state);
  const la = lineCheckpoint(old), lb = lineCheckpoint(fresh);
  ok(Math.abs(la.waves.line.nextReinforceAtS - lb.waves.line.nextReinforceAtS) <= 1 / 60 + 1e-9, `the trickle's clock runs from the arrival `
    + `(next at ${lb.waves.line.nextReinforceAtS?.toFixed(3)} against the old host's ${la.waves.line.nextReinforceAtS?.toFixed(3)})`);
  ok(la.rng[0] === lb.rng[0] && la.rng[1] === lb.rng[1], `both streams stand where the old host's arrival left them, its rear slot's draw taken `
    + `([${lb.rng.join(', ')}] against [${la.rng.join(', ')}])`);
  fresh.authority.onMatchReady();
  const heardNew = [];
  for (let k = 0; k < 180; k++) {
    run.step(fresh, 1, (ev) => { if (/mode_line_reinforced|mode_respawn/.test(ev.type)) heardNew.push(`${ev.type} ${ev.id}`); }, contest);
    run.step(old, 1, null, contest);
  }
  ok(heardNew.length === 0 && JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `over the next 3 s the new host brings no defender on `
    + `(${heardNew.join(', ') || 'none'}): it fields the old host's (${fielded(fresh).join(', ')} against ${fielded(old).join(', ')})`);
  old.stop(); fresh.stop();
}

for (const again of [false, true]) {
console.log(again ? '[9r2] (276) [9r] with the reinforcement killed again in the window: its arrival taken, then its death'
  : '[9r] (276) a seat\'s kill in a replayed window lets the old host\'s reinforce trickle bring one on that the play\'s full line held back: taken up as made');
  // the attack contests the live sector from inside its contest reach, every hull kept whole (the line stays full); sealed
  // 0.3 s before the trickle's tick with its battle clock; the seat's kill falls in the window's first tick
  const old = makeFront(null, 'reinforce-replay'), sim = old.authority, run = stepper(old);
  sim.onMatchReady();
  const zoneOf = (actor) => { const st = actor.authority.modeController.state; return st.zones[Math.min(st.line.index, st.zones.length - 1)]; };
  const zones = sim.modeController.state.zones;
  const ax = zones.at(-1).x - zones[0].x, az = zones.at(-1).z - zones[0].z, al = Math.hypot(ax, az) || 1;
  const reach = matchRulesetFor('frontline_assault').assault.contestReachM;
  const hand = (actor) => {
    const zone = zoneOf(actor);
    for (const e of actor.authority.entities) {
      if (e.modeActive === false || e.combat.destroyed) continue;
      e.combat.hp = e.combat.maxHp;
      if (e.team !== 'alpha') continue;
      const back = 30 + reach * 0.5 + (e.id === 'h0' ? 0 : 3);
      e.state.pos.x = zone.x - ax / al * back; e.state.pos.z = zone.z - az / al * back; e.state.speed = 0;
    }
  };
  run.step(old, 60, null, hand);
  for (let guard = 0; guard < 6000 && !Number.isFinite(lineCheckpoint(old).waves.line.nextReinforceAtS ?? NaN); guard++) run.step(old, 1, null, hand);
  const dueAt = lineCheckpoint(old).waves.line.nextReinforceAtS;
  for (let guard = 0; guard < 6000 && lineCheckpoint(old).elapsedS < dueAt - 0.3; guard++) run.step(old, 1, null, hand);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, run.tick, era, hostFrame(old, run.tick, era, false), true);
  const victim = sim.entityById.get(fielded(old)[0]);
  victim.combat.hp = 0; victim.combat.destroyed = true;
  const told = new Map(), heardOld = [];
  const hear = (ev) => { heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, run.tick); };
  let killed = null;
  for (let k = 0; k < 30; k++) {
    run.step(old, 1, hear);
    // (`again`: the seat kills the reinforcement 5 ticks after it comes on)
    if (again && killed === null && told.size === 1 && run.tick - [...told.values()][0] === 5) {
      killed = [...told.keys()][0]; const e = sim.entityById.get(killed); e.combat.hp = 0; e.combat.destroyed = true;
    }
  }
  const frame = hostFrame(old, run.tick, era, false);
  ok(count(heardOld, 'mode_line_reinforced') === 1 && told.size === 1 && (!again || killed), `the case is built: the line full at the keyframe, the trickle due at ${dueAt.toFixed(3)}; `
    + `the seat kills ${victim.id} and the old host's trickle brings ${[...told.keys()].join(', ')} on`);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeFront({ tick: state.tick, ...resumeClocksOf(state) }, 'reinforce-replay');
  const applied = applyResumeState(fresh, state);
  const la = lineCheckpoint(old), lb = lineCheckpoint(fresh);
  ok(applied.replayed?.steps === 30 && la.waves.line.nextReinforceAtS === lb.waves.line.nextReinforceAtS && la.rng.join() === lb.rng.join()
    && JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `the trickle's clock, both streams (the arrival's rear slot draw taken) and the field are `
      + `the old host's (next at ${lb.waves.line.nextReinforceAtS?.toFixed(3)} against ${la.waves.line.nextReinforceAtS?.toFixed(3)}; [${lb.rng.join(', ')}])`);
  if (again) {
    const e = fresh.authority.entityById.get(killed), o = sim.entityById.get(killed);
    ok(e.modeLife === 'down' && o.modeLife === 'down' && e.modeLives === o.modeLives, `${killed} is down at the resume as on the old host, its life counted `
      + `alike (${e.modeLife}, lives ${e.modeLives} against ${o.modeLives})`);
  }
  old.stop(); fresh.stop();
}

/**
 * [10] and [10b]: the attack takes sector 1 (each defender falls as it stands), the keyframe is sealed `leadS` before the
 * counter-attack falls due, and the old host runs 30 ticks on; the elected seat resumes from that keyframe, its newest
 * frame and the respawns it was told.
 */
function counterWindow(leadS) {
  const old = makeFront(null, 'counter-window'), sim = old.authority, run = stepper(old);
  sim.onMatchReady();
  const zoneOf = (actor) => { const st = actor.authority.modeController.state; return st.zones[Math.min(st.line.index, st.zones.length - 1)]; };
  const takeSector = (actor) => {
    const zone = zoneOf(actor);
    for (const e of actor.authority.entities) {
      if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) { e.state.pos.x = zone.x + (e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z; }
      if (e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
    }
  };
  for (let guard = 0; guard < 30000 && sim.modeController.state.line.index < 1; guard++) run.step(old, 1, null, takeSector);
  const counterAt = lineCheckpoint(old).waves.line.counter?.atS;
  for (let guard = 0; guard < 6000 && lineCheckpoint(old).elapsedS < counterAt - leadS; guard++) run.step(old, 1);
  const { keyframe, era } = sealAt(old, run);
  const told = new Map(), heardOld = [];
  run.step(old, 30, (ev) => { if (ev.type.startsWith('mode_')) heardOld.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, run.tick); });
  const frame = hostFrame(old, run.tick, era, false);
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeFront({ tick: state.tick, battleTimeMs: state.battleTimeMs }, 'counter-window');
  applyResumeState(fresh, state);
  return { old, fresh, run, keyframe, heardOld, counterAt, frameAtS: lineCheckpoint(old).elapsedS };
}

console.log('[10] a Frontline counter-attack launched after the keyframe: its squad picked, never announced twice');
{
  const { old, fresh, run, keyframe, heardOld, counterAt } = counterWindow(0.3);
  const sealedCounter = keyframe.modeCheckpoint.mode.waves.line.counter, oldSquad = lineCheckpoint(old).waves.line.counter?.ids ?? [];
  ok(!!sealedCounter && sealedCounter.ids.length === 0 && count(heardOld, 'mode_counter_attack') === 1 && oldSquad.length > 0,
    `the case is built: the keyframe holds the counter-attack due at ${counterAt?.toFixed(3)} with no squad (mode ${keyframe.modeCheckpoint.mode.elapsedS.toFixed(3)}), `
      + `and the old host launches it after (squad ${oldSquad.join(', ')})`);
  // a keyframe the new host seals in its resume hold, before its first step picks the squad, still names the launch
  const inHold = lineCheckpoint(fresh).waves.line.counter;
  ok(inHold?.launched === true && inHold.ids.length === 0, `a keyframe sealed before the new host's first step names the launch (${JSON.stringify(inHold)})`);
  fresh.authority.onMatchReady();
  const heardNew = [];
  for (let k = 0; k < 180; k++) { run.step(fresh, 1, (ev) => { if (ev.type.startsWith('mode_')) heardNew.push(ev.type); }); run.step(old, 1); }
  const newSquad = lineCheckpoint(fresh).waves.line.counter?.ids ?? [];
  ok(count(heardNew, 'mode_counter_attack') === 0, `the new host never announces the counter-attack again (${heardNew.join(', ') || 'no mode events'} in 3 s)`);
  ok(JSON.stringify(newSquad) === JSON.stringify(oldSquad), `its squad is the old host's (${newSquad.join(', ') || 'none'} against ${oldSquad.join(', ')})`);
  old.stop(); fresh.stop();
}

console.log('[10b] a Frontline counter-attack due after the resume: still launched and announced, once, as the old host does');
{
  // the keyframe sealed 3 s before the counter-attack falls due and the seat's frame 0.5 s on: neither is past its moment,
  // so the restore names no launch (migrationState.ts checkpointAtNewestFrame's frame-moment test) and the new host
  // launches it when it falls due, announced
  const { old, fresh, run, keyframe, heardOld, counterAt, frameAtS } = counterWindow(3);
  const sealedCounter = keyframe.modeCheckpoint.mode.waves.line.counter;
  ok(!!sealedCounter && sealedCounter.ids.length === 0 && frameAtS < counterAt && count(heardOld, 'mode_counter_attack') === 0,
    `the case is built: the keyframe holds the counter-attack due at ${counterAt?.toFixed(3)} with no squad (mode ${keyframe.modeCheckpoint.mode.elapsedS.toFixed(3)}), `
      + `and the seat's frame (mode ${frameAtS.toFixed(3)}) is before it`);
  const restored = lineCheckpoint(fresh).waves.line.counter;
  ok(!!restored && restored.launched === undefined && restored.ids.length === 0, `the restore names no launch (${JSON.stringify(restored)})`);
  fresh.authority.onMatchReady();
  const heardNew = [], heardOldAfter = [];
  for (let k = 0; k < 240; k++) {
    run.step(fresh, 1, (ev) => { if (ev.type === 'mode_counter_attack') heardNew.push(k); });
    run.step(old, 1, (ev) => { if (ev.type === 'mode_counter_attack') heardOldAfter.push(k); });
  }
  const oldSquad = lineCheckpoint(old).waves.line.counter?.ids ?? [], newSquad = lineCheckpoint(fresh).waves.line.counter?.ids ?? [];
  ok(heardOldAfter.length === 1 && heardNew.length === 1 && Math.abs(heardNew[0] - heardOldAfter[0]) <= 1,
    `the new host announces the counter-attack once, on the old host's tick (step ${heardNew.join(', ') || 'never'} after the resume against ${heardOldAfter.join(', ') || 'never'})`);
  ok(oldSquad.length > 0 && JSON.stringify(newSquad) === JSON.stringify(oldSquad), `its squad is the old host's (${newSquad.join(', ') || 'none'} against ${oldSquad.join(', ') || 'none'})`);
  old.stop(); fresh.stop();
}

if (failures) { console.error(`waveStartMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('waveStartMigration.selftest: a Horde wave begun or cleared, a Horde, Mars or AC-130 cache taken, a Frontline advance, reinforcement or counter-attack, or a trickle arrival made after the keyframe is taken up as made, never made again, seen or unseen by the elected seat; a counter-attack due after the resume is still announced');
