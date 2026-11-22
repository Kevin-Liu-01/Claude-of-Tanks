// The mode's director takes up the old host's clocks, deals and window as made (275; the gaps 274 left in matchModes.ts
// and the authority, docs/MULTIPLAYER-V2.md's "Not taken up"). Through the real resume (match actors, the keyframe as
// matchHostCore.ts seals it, resumeStateFromRetained, applyResumeState), against the old host run on:
// [1] the battle clock: a resumed host read mode time as `timeS + offset`, the offset the frame's milliseconds, so a Horde
//     trickle that fell on a tick's edge fell a tick early (every 90 ticks against the old host's 91). The keyframe
//     carries the old host's battle clock exact (battleS) and the new host's goes on from it: every trickle arrival on the
//     old host's tick. [1b] the same from the seat's newest frame 0.5 s on (the usual migration): the keyframe's clock gone
//     on a step's dt a step to the frame (migrationState.ts battleClockAt), bit for bit.
// [2] the hunt's arrivals lead seed (HuntCheckpoint.arrivals) after a trickle arrival made in the window, and after a wave
//     begun there: the old host's count (it stood at the keyframe's: 6 against 7, 12 against 18), the risen hunters'
//     searches and leads as the old host's revives drew them, and the next arrival's lead.
// [3] an Infected arrival stood up in the window: its ring's draws taken (the arrival points' stream and the sector due
//     next where the old host left them) and its hunter's search and lead from its point. [3b] the same for a refused
//     Horde arrival due again that the old host's retry stood up there. [3c] a begun wave whose arrivals find no point:
//     they wait in the queue with the stall's clock started, as on the old host (gaps 274 had them due at once).
// [4] the Horde's stranded tracker: a hostile cut off from the humans is benched on the old host's tick (a new host
//     tracked every hostile afresh and benched it 30 s late).
// [5] the bots' role deals and their clocks (CTF roles, a Turbo Ball striker's commit, Zone Control's assignments): the
//     new host deals on the old host's second, the same roles, and a striker keeps its commit: the same route pushes, the
//     hulls within the rows' quantization. [5b] Frontline's hold ranks: a defender falls after the resume, and the rest
//     take their new ring slots on the old host's steps.
// [6] a keyframe the new host seals in its resume hold, before its first step: a begun advance's arrivals hidden from the
//     seat (lineArrivalDue) ride it, and a host elected from it raises them on their slots (it raised them at their own
//     spawns, their slot draws spent).
// [7] the authority's own state rides the checkpoint (NewModeCheckpoint.host): the combat stream, the fire tick, the route
//     push's clocks and targets, the wreck grid's phase and the spotting, restored as captured.
// [8] the hull a row rounds or does not carry (276: MigrationEntityExtras.hull, which took over 275's integrator parts):
//     from the keyframe alone every part as the old hull's (the bloom, the slew, the last speed, the rollover's clock, the
//     held posture, the rock and the spring among the movement checkpoint's, and the pose exact); from a newer row only its
//     drive (the bloom, the slew, the spool and the turn rate: round 1 review, the rest belongs with the pose the row seats).
// 276: a resume replays its window where it can (migrationState.ts replayWindow; migrationTwins holds it). Every case here
// with a newer frame is the reading a resume takes where it cannot (a window past MAX_REPLAY_STEPS, a keyframe from before
// the battle clock): the resume below drops the replay, as resumeStateFromRetained leaves it out then.
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
const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
const inputs = new Map();
function hostFrame(actor, tick, era, hidden = false) {
  // the battle clock's milliseconds (a resumed host's frames carry the battle's, matchActor.ts metaOnBattleClock)
  const sim = actor.authority, battleTimeMs = Math.round(sim.battleS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.filter((e) => !hidden || e.team !== 'bravo').map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
    shells: [], viewer: null, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}
const sealKeyframe = (actor, tick, era) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(actor.authority.battleS * 1000),
  timeS: actor.authority.timeS, battleS: actor.authority.battleS, phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(),
  entities: captureEntityExtras(actor), frame: hostFrame(actor, tick, era) }));
function resume(make, keyframe, latest, told) {
  const { state } = resumeStateFromRetained(keyframe, 0, latest, latest ? 500 : null, [], [], [...told]);
  // the 275 reading of the window (276 replays it where it can: header)
  delete state.replay;
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs, ...(state.battleS !== undefined ? { battleS: state.battleS } : {}) });
  applyResumeState(fresh, state);
  return fresh;
}
/** An actor stepper that tells `heard` each event (the seat h0's) and counts the old host's ticks. */
function stepper(old) {
  const clock = { tick: 0 };
  const step = (actor, n = 1, heard = null, before = null) => {
    for (let k = 0; k < n; k++) {
      before?.(actor);
      actor.authority.step({ dt: 1 / 60, inputs });
      if (actor === old) clock.tick++;
      for (const ev of actor.authority.eventsForViewer('h0')) heard?.(ev);
      actor.authority.afterEventBroadcast();
    }
  };
  return { clock, step };
}
const modeOf = (actor) => actor.authority.captureModeCheckpoint().mode;
const fmt = (p) => (p ? `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})` : 'none');

const hordeBots = Array.from({ length: 10 }, (_, i) => ({ playerId: `z-${i}`, name: `Z${i}`, team: 'bravo', specId: spec }));
const hordeRules = (extra = {}) => { const horde = matchRulesetFor('endless_horde'); return { ...horde, horde: { ...horde.horde, spawnOutOfSight: false, waveSize: 12, maxAlive: 6, maxAliveCap: 6, ...extra } }; };
const makeHorde = (rules) => (resumed) => createMatchActor({ roomId: 'mode-window', mapId: 'verdant', mode: 'endless_horde', seed: 7, seats, bots: hordeBots, ruleset: rules,
  world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });

console.log('[1] the battle clock: the trickle falls on the old host\'s ticks');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 1);
  // two hostiles fall: the trickle brings one on every trickleS; the keyframe 0.3 s in
  for (const e of sim.entities.filter((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false).slice(0, 2)) { e.combat.hp = 0; e.combat.destroyed = true; }
  step(old, 18);
  const keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
  const withClock = resume(make, keyframe, null, []);
  const { battleS: _dropped, ...older } = keyframe;
  const withoutClock = resume(make, older, null, []);
  for (const actor of [withClock, withoutClock]) actor.authority.onMatchReady();
  const arrivals = { old: [], clock: [], none: [] };
  const fell = (actor) => { const e = actor.authority.entities.find((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false); if (e) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let k = 1; k <= 60 * 12; k++) {
    // one hostile falls every 1.5 s on every host alike, so the field is short and the trickle runs
    const fall = k % 90 === 1 ? fell : null;
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn') arrivals.old.push(k); }, fall);
    step(withClock, 1, (ev) => { if (ev.type === 'mode_respawn') arrivals.clock.push(k); }, fall);
    step(withoutClock, 1, (ev) => { if (ev.type === 'mode_respawn') arrivals.none.push(k); }, fall);
  }
  ok(typeof keyframe.battleS === 'number' && keyframe.battleS !== Math.round(keyframe.battleS * 1000) / 1000 && arrivals.old.length >= 5,
    `the case is built: the keyframe's battle clock (${keyframe.battleS}) is no whole millisecond, and the old host's trickle brings ${arrivals.old.length} arrivals in 12 s`);
  ok(JSON.stringify(arrivals.clock) === JSON.stringify(arrivals.old), `with the old host's battle clock carried, every arrival falls on its tick (${arrivals.clock.join(', ')} `
    + `against ${arrivals.old.join(', ')})`);
  ok(withClock.authority.battleS === sim.battleS, `the new host's battle clock is the old host's, bit for bit (${withClock.authority.battleS} against ${sim.battleS})`);
  console.log(`  (an older keyframe, its clock the frame's milliseconds: ${arrivals.none.join(', ')})`);
  for (const actor of [old, withClock, withoutClock]) actor.stop();
}

console.log('[1b] the battle clock at the seat\'s newest frame, 0.5 s on: the keyframe\'s gone on a step at a time');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 1);
  for (const e of sim.entities.filter((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false).slice(0, 2)) { e.combat.hp = 0; e.combat.destroyed = true; }
  step(old, 18);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const told = new Map();
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); });
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era), told);
  ok(fresh.authority.battleS === sim.battleS && fresh.authority.battleS !== keyframe.battleS, `the new host's battle clock is the old host's at the frame, bit for bit `
    + `(${fresh.authority.battleS} against ${sim.battleS}; the keyframe's ${keyframe.battleS})`);
  fresh.authority.onMatchReady();
  const arrivals = { old: [], fresh: [] };
  const fell = (actor) => { const e = actor.authority.entities.find((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false); if (e) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let k = 1; k <= 60 * 12; k++) {
    const fall = k % 90 === 1 ? fell : null;
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn') arrivals.old.push(k); }, fall);
    step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn') arrivals.fresh.push(k); }, fall);
  }
  ok(arrivals.old.length >= 5 && JSON.stringify(arrivals.fresh) === JSON.stringify(arrivals.old), `every arrival after it falls on the old host's tick `
    + `(${arrivals.fresh.join(', ')} against ${arrivals.old.join(', ')})`);
  old.stop(); fresh.stop();
}

console.log('[2] the hunt\'s lead seed after the window\'s arrivals: a trickle arrival, a wave begun');
for (const kind of ['trickle', 'wave']) {
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  const told = new Map();
  const tell = (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); };
  let keyframe;
  if (kind === 'trickle') {
    step(old, 1);
    for (const e of sim.entities.filter((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false).slice(0, 2)) { e.combat.hp = 0; e.combat.destroyed = true; }
    step(old, 1);
    for (let guard = 0; guard < 600 && modeOf(old).waves.horde.nextTrickleAtS - sim.battleS > 0.2; guard++) step(old, 1);
    keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
    step(old, 30, tell);
  } else {
    const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed && e.modeActive !== false) { e.combat.hp = 0; e.combat.destroyed = true; } };
    for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15); }
    while (sim.modeController.state.horde.nextWaveInS > 0.3) step(old, 1);
    keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
    step(old, 30, tell);
  }
  const era = createEraIndexer();
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era), told);
  const seeds = { sealed: keyframe.modeCheckpoint.mode.hunt?.arrivals, old: modeOf(old).hunt?.arrivals, fresh: modeOf(fresh).hunt?.arrivals };
  const risen = [...told.keys()];
  ok(risen.length > 0 && seeds.old > seeds.sealed, `the case is built (${kind}): ${risen.join(', ')} arrived in the window, the old host's lead seed `
    + `${seeds.sealed} -> ${seeds.old}`);
  ok(seeds.fresh === seeds.old, `the new host's lead seed is the old host's (${seeds.fresh} against ${seeds.old})`);
  const searchOf = (actor, id) => actor.authority.modeController.huntSearchOf?.(actor.authority.entityById.get(id));
  const leads = risen.map((id) => [id, searchOf(old, id), searchOf(fresh, id)]);
  ok(leads.every(([, a, b]) => a?.lead && b?.lead && Math.hypot(a.lead.x - b.lead.x, a.lead.z - b.lead.z) < 1),
    `each risen hunter drives on to the lead the old host's revive gave it (${leads.map(([id, a, b]) => `${id} ${fmt(b?.lead)} against ${fmt(a?.lead)}`).join('; ')})`);
  // the next arrival's lead: both hosts run on together, one hostile falling every 1.5 s, until each brings one more on
  fresh.authority.onMatchReady();
  const next = { old: null, fresh: null };
  const fell = (actor) => { const e = actor.authority.entities.find((x) => x.team === 'bravo' && !x.combat.destroyed && x.modeActive !== false); if (e) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let k = 1; k <= 60 * 8 && (!next.old || !next.fresh); k++) {
    const fall = k % 90 === 1 ? fell : null;
    step(old, 1, (ev) => { if (ev.type === 'mode_respawn' && !next.old) next.old = ev.id; }, fall);
    step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn' && !next.fresh) next.fresh = ev.id; }, fall);
  }
  const lo = next.old && searchOf(old, next.old)?.lead, ln = next.fresh && searchOf(fresh, next.fresh)?.lead;
  ok(!!lo && !!ln && next.old === next.fresh && Math.hypot(lo.x - ln.x, lo.z - ln.z) < 1, `the next arrival (${next.fresh ?? 'none'}) drives on to the old host's `
    + `lead (${fmt(ln)} against ${fmt(lo)}; the keyframe's seed gave another, about 150 m off)`);
  old.stop(); fresh.stop();
}

console.log('[3] an Infected arrival stood up in the window: its ring\'s draws and its hunter\'s lead');
{
  const infected = matchRulesetFor('infected');
  const rules = { ...infected, infectionBots: { ...infected.infectionBots, arrival: { ...infected.infectionBots.arrival, spawnOutOfSight: false } } };
  const bots = [...[0, 1].map((i) => ({ playerId: `z-${i}`, name: `Z${i}`, team: 'bravo', specId: spec })), ...[0, 1, 2].map((i) => ({ playerId: `s-${i}`, name: `S${i}`, team: 'alpha', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'mode-window-infected', mapId: 'verdant', mode: 'infected', seed: 7, seats, bots, ruleset: rules, world,
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 180);
  const survivor = sim.entityById.get('s-0');
  survivor.combat.hp = 0; survivor.combat.destroyed = true;
  const told = new Map();
  let keyframe = null;
  for (let guard = 0; guard < 240 && !told.has('s-0'); guard++) {
    const sealed = sealKeyframe(old, clock.tick, createEraIndexer());
    told.clear();
    step(old, 15, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); });
    if (told.has('s-0')) keyframe = sealed;
  }
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, createEraIndexer()), told);
  const sealedTeams = new Map(keyframe.modeCheckpoint.mode.teams);
  const a = modeOf(old), b = modeOf(fresh);
  ok(sealedTeams.get('s-0') === 'bravo' && keyframe.modeCheckpoint.mode.rng[1] !== a.rng[1], `the case is built: s-0 fell before the keyframe and rose infected `
    + `on the ring after it, drawing from the arrival points' stream (${keyframe.modeCheckpoint.mode.rng[1]} -> ${a.rng[1]})`);
  ok(b.rng[1] === a.rng[1], `the new host's arrival points' stream is where the old host's ring arrival left it (${b.rng[1]} against ${a.rng[1]})`);
  const sa = old.authority.modeController.huntSearchOf(old.authority.entityById.get('s-0')), sb = fresh.authority.modeController.huntSearchOf(fresh.authority.entityById.get('s-0'));
  ok(!!sa?.lead && !!sb?.lead && Math.hypot(sa.lead.x - sb.lead.x, sa.lead.z - sb.lead.z) < 1, `its hunter drives on to the old host's lead (${fmt(sb?.lead)} against ${fmt(sa?.lead)})`);
  old.stop(); fresh.stop();
}

console.log('[3b] a refused Horde arrival due again, stood up in the window: its search\'s draws and its hunter\'s lead');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 60);
  // a hostile resting off the field is made a refused arrival due again in 0.2 s (its placement refused: retryArrival's
  // state), by restoring the old host's own checkpoint with that respawn into it: the old host then plays it out
  const cp = sim.captureModeCheckpoint();
  const resting = cp.mode.waves.inactive.find((id) => id.startsWith('z-') && !cp.mode.respawns.some(([key]) => key === id));
  cp.mode.respawns.push([resting, { atS: sim.battleS + 0.2, healthScale: cp.mode.waves.horde.healthScale }]);
  sim.restoreModeCheckpoint(JSON.parse(JSON.stringify(cp)));
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const told = new Map();
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); });
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era), told);
  const a = modeOf(old), b = modeOf(fresh);
  ok(!!resting && told.has(resting) && keyframe.modeCheckpoint.mode.respawns.some(([key]) => key === resting) && a.rng[1] !== keyframe.modeCheckpoint.mode.rng[1],
    `the case is built: ${resting} was due again at the keyframe and the old host's retry stood it up in the window, drawing from the arrival points' stream`);
  ok(b.rng[1] === a.rng[1] && b.waves.horde.spawnSector === a.waves.horde.spawnSector && b.waves.horde.stalledAtS === a.waves.horde.stalledAtS,
    `the new host's arrival points' stream, sector and stall clock are where the old host's retry left them (${b.rng[1]}, sector ${b.waves.horde.spawnSector} `
      + `against ${a.rng[1]}, sector ${a.waves.horde.spawnSector})`);
  const sa = old.authority.modeController.huntSearchOf(old.authority.entityById.get(resting)), sb = fresh.authority.modeController.huntSearchOf(fresh.authority.entityById.get(resting));
  ok(!!sa?.lead && !!sb?.lead && Math.hypot(sa.lead.x - sb.lead.x, sa.lead.z - sb.lead.z) < 1, `its hunter drives on to the old host's lead (${fmt(sb?.lead)} against ${fmt(sa?.lead)})`);
  old.stop(); fresh.stop();
}

console.log('[3c] a begun wave whose arrivals find no point: they wait in the queue, the stall\'s clock started, as on the old host');
{
  // every point is in the human's sight on this open ground (a sight range of 10 km): each drawn arrival is refused at the
  // wave's start, on both hosts, until the field has stood empty stallTrickles trickles (then the ring in sight is taken)
  const make = makeHorde(hordeRules({ spawnOutOfSight: true, sightRangeM: 10000 }));
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed && e.modeActive !== false) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15); }
  while (sim.modeController.state.horde.nextWaveInS > 0.3) step(old, 1);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const told = new Map();
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); });
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era), told);
  const a = modeOf(old).waves.horde, b = modeOf(fresh).waves.horde;
  ok(old.authority.modeController.state.horde.wave === 2 && told.size === 0 && a.queued > 0 && a.stalledAtS !== null, `the case is built: the old host began wave 2 in `
    + `the window and stood no arrival up (${a.queued} queued, its stall clock from ${a.stalledAtS?.toFixed(3)})`);
  ok(fresh.authority.modeController.state.horde.wave === 2 && b.queued === a.queued && b.stalledAtS === a.stalledAtS && JSON.stringify(b.due ?? null) === 'null',
    `the new host takes the wave up with them queued and the stall clock the old host's (${b.queued} queued, stall ${b.stalledAtS?.toFixed?.(3) ?? b.stalledAtS}; `
      + `due ${JSON.stringify(b.due ?? null)})`);
  fresh.authority.onMatchReady();
  let rose = 0;
  for (let k = 0; k < 120; k++) { step(fresh, 1, (ev) => { if (ev.type === 'mode_respawn') rose++; }); step(old, 1); }
  ok(rose === 0, `and none rises on the new host's first steps (${rose} mode_respawn in 2 s)`);
  old.stop(); fresh.stop();
}

console.log('[4] the stranded tracker: a cut-off hostile benched on the old host\'s tick');
{
  // strandedS shortened to 6 s: the subject, the first fielded hostile, is held 400 m off the human (never gaining)
  const make = makeHorde(hordeRules({ strandedS: 6 }));
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 1);
  const subject = sim.entities.filter((e) => e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed).map((e) => e.id).sort()[0];
  const human = sim.entityById.get('h0');
  const pin = { x: human.state.pos.x + 400, z: human.state.pos.z + 400 };
  const hold = (actor) => { const e = actor.authority.entityById.get(subject); if (e && !e.combat.destroyed && e.modeActive !== false) { e.state.pos.x = pin.x; e.state.pos.z = pin.z; e.state.speed = 0; } };
  step(old, 4 * 60, null, hold);
  const keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
  const fresh = resume(make, keyframe, null, []);
  fresh.authority.onMatchReady();
  const benched = { old: null, fresh: null };
  for (let k = 1; k <= 60 * 8; k++) {
    step(old, 1, (ev) => { if (ev.type === 'mode_horde_recycled' && ev.id === subject && benched.old === null) benched.old = k; }, hold);
    step(fresh, 1, (ev) => { if (ev.type === 'mode_horde_recycled' && ev.id === subject && benched.fresh === null) benched.fresh = k; }, hold);
  }
  const strand = keyframe.modeCheckpoint.mode.waves.horde.strand;
  ok(!!strand && strand.track.some(([id]) => id === subject) && benched.old !== null, `the case is built: the keyframe carries the tracker (${strand?.track.length ?? 0} `
    + `hostiles, its last look at ${strand?.atS?.toFixed(2)}), and the old host benches ${subject} ${benched.old} steps after it`);
  ok(benched.fresh === benched.old, `the new host benches it on the same step (${benched.fresh ?? 'never'} against ${benched.old})`);
  old.stop(); fresh.stop();
}

console.log('[5] the bots\' role deals and their clocks');
for (const mode of ['capture_the_flag', 'turbo_ball', 'zone_control']) {
  const bots = [...[0, 1, 2].map((i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })), ...[0, 1, 2].map((i) => ({ playerId: `b-${i}`, name: `B${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'mode-window-deals', mapId: 'verdant', mode, seed: 9, seats, bots, ruleset: matchRulesetFor(mode), world,
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 6 * 60 + 17);
  const keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
  const fresh = resume(make, keyframe, null, []);
  const deals = (actor) => actor.authority.captureModeCheckpoint().mode.objectives?.deals ?? null;
  const sealed = keyframe.modeCheckpoint.mode.objectives?.deals;
  const part = mode === 'capture_the_flag' ? 'flag' : mode === 'turbo_ball' ? 'ball' : 'zone';
  ok(!!sealed?.[part] && Number.isFinite(sealed[part].atS), `${mode}: the case is built: the keyframe carries the ${part} deal (dealt at ${sealed?.[part]?.atS?.toFixed(3)})`);
  ok(JSON.stringify(deals(fresh)) === JSON.stringify(sealed), `${mode}: the new host holds the old host's deal and its clock before its first step`);
  fresh.authority.onMatchReady();
  // each bot's errand as the mode deals it (botTarget, read on both hosts alike each step): its mission, and where for CTF
  // and Zone Control (Turbo Ball's spots track the ball, which the rows' millimetres move)
  const errands = (actor) => actor.authority.entities.filter((e) => e.bot).map((e) => {
    const target = actor.authority.modeController.botTarget(e);
    return `${e.id} ${target?.mission ?? '-'}${mode === 'turbo_ball' || !target ? '' : ` ${Math.round(target.x)},${Math.round(target.z)}`}`;
  }).join('; ');
  let same = 0, apart = null, widest = 0, targets = 0, dealsAlike = 0, dealsApart = null;
  for (let k = 1; k <= 60 * 8; k++) {
    step(old); step(fresh);
    const a = errands(old), b = errands(fresh);
    if (a === b) same++; else if (apart === null) apart = `step ${k}: ${a.slice(0, 160)} / ${b.slice(0, 160)}`;
    // the deals themselves (the capture's view: a restore that dropped a part shows here)
    const da = JSON.stringify(deals(old)), db = JSON.stringify(deals(fresh));
    if (da === db) dealsAlike++; else if (dealsApart === null) dealsApart = `step ${k}: ${da.slice(0, 120)} / ${db.slice(0, 120)}`;
    for (const e of old.authority.entities) {
      if (!e.bot) continue;
      const t = fresh.authority.entityById.get(e.id);
      widest = Math.max(widest, Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z));
      if (Math.hypot((e._modeTargetX ?? 0) - (t._modeTargetX ?? 0), (e._modeTargetZ ?? 0) - (t._modeTargetZ ?? 0)) > 0.01) targets++;
    }
  }
  ok(same === 480, `${mode}: over 8 s both hosts send every bot on the same errand on the same steps (${same} of 480 steps alike${apart ? `; first apart ${apart}` : ''})`);
  ok(dealsAlike === 480, `${mode}: and deal the same roles on the same steps, a striker's commit with them (${dealsAlike} of 480 steps alike${dealsApart ? `; first apart ${dealsApart}` : ''})`);
  // (Turbo Ball's bots meet the ball, whose contacts carry the rows' millimetres on: its hulls part 0.6-0.8 m whatever the deal)
  if (mode !== 'turbo_ball') ok(targets === 0 && widest < 0.05, `${mode}: and send their bots to the same places: every route push alike (${targets} apart), the hulls `
    + `within ${widest.toFixed(3)} m (bound 0.05 m)`);
  old.stop(); fresh.stop();
}

console.log('[5b] Frontline\'s hold ranks: the defenders re-ranked on the old host\'s second after one of them falls');
{
  const bots = [...Array.from({ length: 2 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...Array.from({ length: 6 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'mode-window-hold', mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats, bots,
    ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  // the attack kept at its deployment (no fight): the defenders hold their sector on its ring, dealt once a second
  const atStart = new Map(sim.entities.filter((e) => e.team === 'alpha').map((e) => [e.id, { x: e.state.pos.x, z: e.state.pos.z }]));
  const holdBack = (actor) => { for (const [id, p] of atStart) { const e = actor.authority.entityById.get(id); e.state.pos.x = p.x; e.state.pos.z = p.z; e.state.speed = 0; } };
  step(old, 8 * 60 + 30, null, holdBack);
  const keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
  const fresh = resume(make, keyframe, null, []);
  const hold = keyframe.modeCheckpoint.mode.waves.line.hold;
  ok(!!hold && Number.isFinite(hold.atS) && hold.ranks.length >= 3 && sim.battleS - hold.atS > 0.2, `the case is built: the keyframe carries the hold ranks `
    + `(${hold?.ranks.length ?? 0} defenders, dealt at ${hold?.atS?.toFixed(3)}, ${(sim.battleS - (hold?.atS ?? 0)).toFixed(2)} s before it)`);
  fresh.authority.onMatchReady();
  // one defender falls on both hosts on the first step after the resume: the next deal re-ranks the rest
  const fall = (actor) => { const e = actor.authority.entityById.get('d-0'); if (!e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; } };
  let targets = 0, widest = 0;
  for (let k = 1; k <= 60 * 4; k++) {
    step(old, 1, null, (a) => { holdBack(a); fall(a); }); step(fresh, 1, null, (a) => { holdBack(a); fall(a); });
    for (const e of old.authority.entities) {
      if (e.team !== 'bravo' || e.combat.destroyed) continue;
      const t = fresh.authority.entityById.get(e.id);
      if (Math.hypot((e._modeTargetX ?? 0) - (t._modeTargetX ?? 0), (e._modeTargetZ ?? 0) - (t._modeTargetZ ?? 0)) > 0.01) targets++;
      widest = Math.max(widest, Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z));
    }
  }
  ok(targets === 0 && widest < 0.05, `the defenders take their new slots on the old host's steps: every route push alike (${targets} apart), the hulls within `
    + `${widest.toFixed(3)} m over 4 s (bound 0.05 m)`);
  old.stop(); fresh.stop();
}

console.log('[6] a keyframe sealed in the resume hold carries a begun advance\'s hidden arrivals');
{
  const bots = [...Array.from({ length: 3 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...Array.from({ length: 8 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'mode-window-line', mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats, bots,
    ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  const lineOf = (actor) => actor.authority.modeController.state.line.index;
  const zoneOf = (actor) => { const st = actor.authority.modeController.state; return st.zones[Math.min(st.line.index, st.zones.length - 1)]; };
  const takeSector = (actor) => {
    const zone = zoneOf(actor);
    for (const e of actor.authority.entities) {
      if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) { e.state.pos.x = zone.x + (e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z; e.state.speed = 0; }
      if (e.team === 'bravo' && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
    }
  };
  for (let guard = 0; guard < 30000 && !(lineOf(old) === 1 && zoneOf(old).control > 0.95); guard++) step(old, 1, null, takeSector);
  for (let guard = 0; guard < 600 && !(zoneOf(old).control > 0.97); guard++) step(old, 1, null, takeSector);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const told = new Map();
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); }, (actor) => { if (lineOf(actor) < 2) takeSector(actor); });
  // the seat sees no defender: every arrival rose out of its sight, due on the new host's first step
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era, true), told);
  const held = sealKeyframe(fresh, clock.tick, createEraIndexer());
  const due = held.modeCheckpoint.mode.waves.line.due ?? [];
  ok(lineOf(old) === 2 && lineOf(fresh) === 2 && [...told.keys()].some((id) => id.startsWith('d-')), `the case is built: the old host advanced in the window and raised `
    + `${[...told.keys()].filter((id) => id.startsWith('d-')).join(', ')} out of the seat's sight; the new host took the advance up`);
  ok(due.length > 0, `the keyframe the new host seals in its resume hold names them due on their slots (${due.map(([id, slot]) => `${id} slot ${slot}`).join(', ') || 'none'})`);
  const third = resume(make, held, null, []);
  fresh.authority.onMatchReady(); third.authority.onMatchReady();
  step(fresh); step(third);
  // (the arrivals the seat was told, not the due list the keyframe names: one it leaves out is checked too)
  const risen = [...told.keys()].filter((id) => id.startsWith('d-')).map((id) => [id, fresh.authority.entityById.get(id), third.authority.entityById.get(id)]);
  ok(risen.length > 0 && risen.every(([, a, b]) => !a.combat.destroyed && !b.combat.destroyed && Math.hypot(a.state.pos.x - b.state.pos.x, a.state.pos.z - b.state.pos.z) < 0.01),
    `a host elected from that keyframe raises each on its slot, where the first new host does (${risen.map(([id, a, b]) => `${id} ${Math.hypot(a.state.pos.x - b.state.pos.x, a.state.pos.z - b.state.pos.z).toFixed(3)} m`).join(', ')})`);
  old.stop(); fresh.stop(); third.stop();
}

console.log('[6b] the same for a Horde wave begun in the window, its arrivals hidden from the seat');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed && e.modeActive !== false) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(old, 15); }
  while (sim.modeController.state.horde.nextWaveInS > 0.3) step(old, 1);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const told = new Map();
  step(old, 30, (ev) => { if (ev.type === 'mode_respawn') told.set(ev.id, clock.tick); });
  const fresh = resume(make, keyframe, hostFrame(old, clock.tick, era, true), told);
  const held = sealKeyframe(fresh, clock.tick, createEraIndexer());
  const due = held.modeCheckpoint.mode.waves.horde.due ?? [];
  ok(told.size > 0 && due.length === told.size, `the keyframe the new host seals in its resume hold names the wave's ${told.size} hidden arrivals due, with their `
    + `points and lead seeds (${due.map(([id, , , , seed]) => `${id} seed ${seed}`).join(', ') || 'none'})`);
  const third = resume(make, held, null, []);
  fresh.authority.onMatchReady(); third.authority.onMatchReady();
  step(fresh); step(third);
  const searchOf = (actor, id) => actor.authority.modeController.huntSearchOf(actor.authority.entityById.get(id));
  const risen = [...told.keys()].map((id) => [id, fresh.authority.entityById.get(id), third.authority.entityById.get(id)]);
  ok(risen.length > 0 && risen.every(([id, a, b]) => !a.combat.destroyed && !b.combat.destroyed && Math.hypot(a.state.pos.x - b.state.pos.x, a.state.pos.z - b.state.pos.z) < 0.01
    && JSON.stringify(searchOf(fresh, id)?.lead) === JSON.stringify(searchOf(third, id)?.lead)), `a host elected from it raises each where the first new host does, `
    + `on the same lead (${risen.map(([id, a, b]) => `${id} ${Math.hypot(a.state.pos.x - b.state.pos.x, a.state.pos.z - b.state.pos.z).toFixed(3)} m`).join(', ')})`);
  old.stop(); fresh.stop(); third.stop();
}

console.log('[7] the authority\'s own state rides the checkpoint and is restored as captured');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 5 * 60);
  const keyframe = sealKeyframe(old, clock.tick, createEraIndexer());
  const fresh = resume(make, keyframe, null, []);
  const host = keyframe.modeCheckpoint.host, again = fresh.authority.captureModeCheckpoint().host;
  ok(!!host && Number.isInteger(host.stream) && host.spotting.records.length > 0 && host.targets.length > 0, `the keyframe carries the combat stream (${host?.stream}), the `
    + `route push's clocks (${host?.routeDue.map((v) => v.toFixed(3)).join(', ')}) and ${host?.targets.length} targets, the wreck grid's phase (${host?.wreckTicks}) and `
    + `${host?.spotting.records.length} spotting records`);
  const { atS: _a, ...sealedRest } = host ?? {}, { atS: _b, ...restoredRest } = again ?? {};
  ok(JSON.stringify(restoredRest) === JSON.stringify(sealedRest), 'the new host holds them as captured before its first step');
  old.stop(); fresh.stop();
}

console.log('[8] the hull a row rounds or does not carry: every part from the keyframe alone; from a newer row its drive');
{
  const make = makeHorde(hordeRules());
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const { clock, step } = stepper(old);
  step(old, 60);
  // the seat's hull mid-everything: a bloomed, slewing gun, a hull just braking on a grade, rocking, held over its tracks,
  // its attitude spring and recoil moving and its rollover's clock running
  const st = sim.entityById.get('h0').state;
  const set = (o, values) => Object.keys(values).forEach((k) => { o[k] = values[k]; });
  st.bloomF = 2.75; st.turretYawRate = 0.31; st._prevSpeed = 4.25; st.rolloverCountdownS = 1.5;
  set(st._rollover, { elapsedS: 0.85, expired: false });
  set(st._hold, { p: 0.011, r: -0.007, pv: 0.021, rv: -0.013 });
  set(st._holdSeat, { p: -0.004, r: 0.006, pv: 0.002, rv: -0.003 });
  set(st._susp, { p: 0.012, r: -0.009, pv: 0.031, rv: -0.017, d: 0.008, dv: 0.022, c: -0.002, cv: 0.004 });
  set(st._spring, { pitch: 0.013, roll: -0.011, pitchV: 0.05, rollV: -0.04, recoilVX: 0.2, recoilVZ: -0.15 });
  const read = (s) => JSON.stringify({ bloomF: s.bloomF, turretYawRate: s.turretYawRate, _prevSpeed: s._prevSpeed, rolloverCountdownS: s.rolloverCountdownS,
    _rollover: { ...s._rollover }, _hold: { ...s._hold }, _holdSeat: { ...s._holdSeat }, _susp: { ...s._susp }, _spring: { ...s._spring } });
  const sealedRead = read(st);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, clock.tick, era);
  const fresh = resume(make, keyframe, null, []);
  ok(read(fresh.authority.entityById.get('h0').state) === sealedRead, `from the keyframe alone the new hull holds every part as the old one's (${sealedRead.length} bytes alike)`);
  const oldHull = sim.entityById.get('h0').state, newHull = fresh.authority.entityById.get('h0').state;
  ok(['x', 'y', 'z'].every((k) => newHull.pos[k] === oldHull.pos[k]) && ['yaw', 'speed', 'visualPitch', 'visualRoll', 'turretYaw', 'gunPitch', 'atGunLimit', '_spool', 'yawRate']
    .every((k) => newHull[k] === oldHull[k]), 'and its pose exact (not the row\'s millimetres), its gun limit flag, its spool and its turn rate (276)');
  // the seat's newest frame 0.5 s on: the attitude's parts and the last speed are the newer row's (as a resume without
  // them seats it), the drive the keyframe's
  step(old, 30);
  const latest = hostFrame(old, clock.tick, era);
  const withNewer = resume(make, keyframe, latest, []);
  const bare = { ...keyframe, entities: keyframe.entities.map(({ hull: _dropped, ...rest }) => rest) };
  const seated = resume(make, bare, latest, []);
  const a = JSON.parse(read(withNewer.authority.entityById.get('h0').state)), b = JSON.parse(read(seated.authority.entityById.get('h0').state));
  const parts = ['_prevSpeed', 'rolloverCountdownS', '_rollover', '_hold', '_holdSeat', '_susp', '_spring'];
  ok(a.bloomF === 2.75 && a.turretYawRate === 0.31 && parts.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k])), `from a row 0.5 s newer it takes the bloom `
    + `(${a.bloomF}) and the slew (${a.turretYawRate}), and leaves the rest as the newer row seats it (${parts.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(', ') || 'all alike'})`);
  for (const actor of [old, fresh, withNewer, seated]) actor.stop();
}

if (failures) { console.error(`modeWindowMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('modeWindowMigration.selftest: the battle clock (from the keyframe or a newer frame), the lead seed, a window\'s ring arrivals (Infected and a refused Horde arrival), a begun wave\'s refused arrivals, the stranded tracker, the role deals, the hold ranks, a resume hold\'s due arrivals, the authority\'s own state and the hull exact carry over as the old host had them');
