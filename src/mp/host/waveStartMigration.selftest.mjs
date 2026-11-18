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
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from './migrationState.ts';
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
 * sight) and the respawns it was told.
 */
function frontlineWindow(hidden) {
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
  const takeSector = (actor) => {
    const zone = zoneOf(actor);
    for (const e of actor.authority.entities) {
      if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) { e.state.pos.x = zone.x + (e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z; }
      if (e.team === 'bravo' && e.id !== SURVIVOR && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
    }
    pinSurvivor(actor);
  };
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
  for (let guard = 0; guard < 30000 && !(lineOf(old) === 1 && zoneOf(old).control > 0.95); guard++) step(old, 1, null, takeSector);
  const ally = sim.entityById.get('a-2');
  ally.combat.hp = 0; ally.combat.destroyed = true;
  for (let guard = 0; guard < 600 && !(zoneOf(old).control > 0.97); guard++) step(old, 1, null, takeSector);
  const era = createEraIndexer();
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: hostFrame(old, tick, era, false) }));
  const allyLives = ally.modeLives;
  const told = new Map(), heard = [];
  const fight = (actor) => (lineOf(actor) < 2 ? takeSector(actor) : pinSurvivor(actor));
  const listen = (ev) => { heard.push(ev.type); if (ev.type === 'mode_respawn') told.set(ev.id, tick); };
  // the sector falls in the window; from the advance on, the fight stops (the arrivals stand on their slots)
  step(old, 1, listen, fight);
  const heldAlly = captureEntityRow(ally, old.wireIdOf('a-2'), era, tick);
  step(old, 29, listen, fight);
  const latest = hostFrame(old, tick, era, hidden);
  const frame = { ...latest, entities: latest.entities.map((row) => (row.entityId === heldAlly.entityId ? heldAlly : row)) };
  const { state } = resumeStateFromRetained(keyframe, 0, frame, 1500, [], [], [...told]);
  const fresh = makeLine({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  const serial = fresh.authority.modeEventSerial;
  applyResumeState(fresh, state);
  return { old, fresh, sim, step, tick, keyframe, frame, told, heard, pinSurvivor, SURVIVOR, lineOf, announced: fresh.authority.modeEventSerial - serial,
    pendingAfter: fresh.authority.pendingEventCount, ally: { lives: allyLives, held: heldAlly, oldLives: ally.modeLives, freshLives: fresh.authority.entityById.get('a-2').modeLives } };
}
const lineDirector = (actor) => {
  const { mode } = actor.authority.captureModeCheckpoint();
  const line = mode.waves.line;
  return { index: line.index, wave: mode.waves.wave, fresh: [...line.fresh].sort().join(), lastWave: [...mode.waves.lastWaveIds].sort().join(),
    counter: line.counter, regroup: line.regroup, reinforceAt: line.nextReinforceAtS, rng: mode.rng };
};
const count = (list, type) => list.filter((t) => t === type).length;
for (const [label, hidden] of [['[4] Frontline: the line advanced after the keyframe, every arrival in the seat\'s newest frame', false],
  ['[5] Frontline: the line advanced after the keyframe, the arrivals hidden from the seat', true]]) {
  console.log(label);
  const run = frontlineWindow(hidden);
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
    && run.ally.freshLives === run.ally.lives, `no ally stands up twice: the old host stood a-2 up at the advance (told at tick ${run.told.get('a-2')}; the `
      + `seat's row of it from tick ${run.ally.held.tick}), and the restore stands it up no second time (its lives ${run.ally.freshLives}, the keyframe's ${run.ally.lives})`);
  const a = lineDirector(old), b = lineDirector(fresh);
  ok(a.wave === b.wave && a.fresh === b.fresh && a.lastWave === b.lastWave && a.rng[0] === b.rng[0] && a.reinforceAt === b.reinforceAt,
    `the reinforcement is the old host's: wave ${b.wave}, its arrivals (${b.fresh}), the line's hulls and the draws' stream past the same shuffle`
      + `${a.wave === b.wave && a.fresh === b.fresh && a.lastWave === b.lastWave && a.rng[0] === b.rng[0] && a.reinforceAt === b.reinforceAt ? ''
        : ` (old: wave ${a.wave}, ${a.fresh}; ${a.lastWave}; ${a.rng[0]}; ${a.reinforceAt}; new: wave ${b.wave}, ${b.fresh}; ${b.lastWave}; ${b.rng[0]}; ${b.reinforceAt})`}`);
  ok(!!a.counter && !!b.counter && a.counter.line === b.counter.line && a.counter.x === b.counter.x && a.counter.z === b.counter.z
    && Math.abs(a.counter.atS - b.counter.atS) <= 1 / 60 + 1e-9 && Math.abs(a.counter.untilS - b.counter.untilS) <= 1 / 60 + 1e-9,
  `the counter-attack on sector 2 falls when the old host's does (old ${a.counter?.atS.toFixed(3)}, new ${b.counter?.atS.toFixed(3)})`);
  ok(!!a.regroup && !!b.regroup && Math.abs(a.regroup.untilS - b.regroup.untilS) <= 1 / 60 + 1e-9,
    `the regroup before the last sector runs on the old host's clock (until old ${a.regroup?.untilS.toFixed(3)}, new ${b.regroup?.untilS.toFixed(3)})`);
  if (!hidden) ok(a.rng[1] === b.rng[1], `the arrival points' stream stands where the old host's placing left it (${a.rng[1]} against ${b.rng[1]})`);
  fresh.authority.onMatchReady();
  const freshHeard = [], respawned = [];
  step(fresh, 20, (ev) => { freshHeard.push(ev.type); if (ev.type === 'mode_respawn') respawned.push(ev.id); }, run.pinSurvivor);
  step(old, 20, null, run.pinSurvivor);
  ok(count(freshHeard, 'mode_line_advanced') === 0 && count(freshHeard, 'mode_wave_started') === 0,
    `the new host never advances or announces the sector again (${count(freshHeard, 'mode_line_advanced')} advance, `
      + `${count(freshHeard, 'mode_wave_started')} wave start)`);
  ok(JSON.stringify(fielded(fresh)) === JSON.stringify(fielded(old)), `the new host fields the old host's defenders (${fielded(fresh).join(', ')} against `
    + `${fielded(old).join(', ')})`);
  ok(paceApart(old, fresh).length === 0, `every defender drives at its life's pace on both hosts: the survivor at sector 1's `
    + `(x${old.authority.entityById.get(run.SURVIVOR).modeSpeedMultiplier}), the arrivals at the last sector's; apart: ${paceApart(old, fresh).join(', ') || 'none'}`);
  if (!hidden) {
    ok(respawned.length === 0, `no defender the old host brought on rises again on the new host (${respawned.join(', ') || 'none'})`);
    const moved = [];
    for (const id of arrivals) {
      const e = fresh.authority.entityById.get(id).state.pos, o = old.authority.entityById.get(id).state.pos;
      const d = Math.hypot(e.x - o.x, e.z - o.z);
      if (!(d < 15)) moved.push(`${id} ${d.toFixed(0)} m`);
    }
    ok(moved.length === 0, `every arrival holds the line from where the old host put it (within 15 m 20 ticks on; apart: ${moved.join(', ') || 'none'})`);
  } else {
    ok(JSON.stringify(respawned.sort()) === JSON.stringify(arrivals), `the hidden arrivals rise on the new host's first steps, those alone (${respawned.join(', ')} `
      + `against the old host's ${arrivals.join(', ')})`);
    const c = lineDirector(old), d = lineDirector(fresh);
    ok(c.rng[1] === d.rng[1], `once they stand, the arrival points' stream is where the old host's is (${c.rng[1]} against ${d.rng[1]})`);
  }
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
  fresh.authority.onMatchReady();
  const oldArrivals = [], newArrivals = [];
  for (let k = 0; k < 150; k++) {
    step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn') newArrivals.push(k); });
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn') oldArrivals.push(k); });
  }
  ok(oldArrivals.length > 0 && newArrivals.length === oldArrivals.length && newArrivals.every((k, i) => Math.abs(k - oldArrivals[i]) <= 1),
    `over the next 2.5 s the new host brings hostiles on when the old host does, none sooner (ticks ${newArrivals.join(', ') || 'none'} against `
      + `${oldArrivals.join(', ') || 'none'})`);
  ok(hordeOf(old).queued === hordeOf(fresh).queued && fielded(old).length === fielded(fresh).length, `and the queue and the field stay the old host's `
    + `(queued ${hordeOf(fresh).queued} against ${hordeOf(old).queued}; ${fielded(fresh).length} against ${fielded(old).length} on the field)`);
  old.stop(); fresh.stop();
}

if (failures) { console.error(`waveStartMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('waveStartMigration.selftest: a Horde wave begun, a Frontline advance made or a trickle arrival made after the keyframe is taken up as made, never made again, seen or unseen by the elected seat');
