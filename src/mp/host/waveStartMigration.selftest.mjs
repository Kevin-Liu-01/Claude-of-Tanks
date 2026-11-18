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
const make = (resume) => createMatchActor({ roomId: 'wave-start', mapId: 'verdant', mode: 'endless_horde', seed: 7, seats, bots, ruleset: rules, world,
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

if (failures) { console.error(`waveStartMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('waveStartMigration.selftest: a Horde wave begun after the keyframe is taken up as begun, never begun again, seen or unseen by the elected seat');
