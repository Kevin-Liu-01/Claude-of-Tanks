// The mode's director takes up the old host's clocks, deals and window as made (275; the gaps 274 left in matchModes.ts
// and the authority, docs/MULTIPLAYER-V2.md's "Not taken up"). Through the real resume (match actors, the keyframe as
// matchHostCore.ts seals it, resumeStateFromRetained, applyResumeState), against the old host run on:
// [1] the battle clock: a resumed host read mode time as `timeS + offset`, the offset the frame's milliseconds, so a Horde
//     trickle that fell on a tick's edge fell a tick early (every 90 ticks against the old host's 91). The keyframe
//     carries the old host's battle clock exact (battleS) and the new host's goes on from it: every trickle arrival on the
//     old host's tick.
// [2] the hunt's arrivals lead seed (HuntCheckpoint.arrivals) after a trickle arrival made in the window, and after a wave
//     begun there: the old host's count (it stood at the keyframe's: 6 against 7, 12 against 18), the risen hunters'
//     searches and leads as the old host's revives drew them, and the next arrival's lead.
// [3] an Infected arrival stood up in the window: its ring's draws taken (the arrival points' stream and the sector due
//     next where the old host left them) and its hunter's search and lead from its point.
// [4] the Horde's stranded tracker: a hostile cut off from the humans is benched on the old host's tick (a new host
//     tracked every hostile afresh and benched it 30 s late).
// [5] the bots' role deals and their clocks (CTF roles, a Turbo Ball striker's commit, Zone Control's assignments): the
//     new host deals on the old host's second, the same roles, and a striker keeps its commit: the same route pushes, the
//     hulls within the rows' quantization.
// [6] a keyframe the new host seals in its resume hold, before its first step: a begun advance's arrivals hidden from the
//     seat (lineArrivalDue) ride it, and a host elected from it raises them on their slots (it raised them at their own
//     spawns, their slot draws spent).
// [7] the authority's own state rides the checkpoint (NewModeCheckpoint.host): the combat stream, the fire tick, the route
//     push's clocks and targets, the wreck grid's phase and the spotting, restored as captured.
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
  let same = 0, apart = null, widest = 0, targets = 0;
  for (let k = 1; k <= 60 * 8; k++) {
    step(old); step(fresh);
    const a = JSON.stringify(deals(old)), b = JSON.stringify(deals(fresh));
    if (a === b) same++; else if (apart === null) apart = `step ${k}: ${a.slice(0, 160)} / ${b.slice(0, 160)}`;
    for (const e of old.authority.entities) {
      if (!e.bot) continue;
      const t = fresh.authority.entityById.get(e.id);
      widest = Math.max(widest, Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z));
      if (Math.hypot((e._modeTargetX ?? 0) - (t._modeTargetX ?? 0), (e._modeTargetZ ?? 0) - (t._modeTargetZ ?? 0)) > 0.01) targets++;
    }
  }
  ok(same === 480, `${mode}: over 8 s both hosts deal the same roles on the same steps (${same} of 480 steps alike${apart ? `; first apart ${apart}` : ''})`);
  // (Turbo Ball's bots meet the ball, whose contacts carry the rows' millimetres on: its hulls part 0.6-0.8 m whatever the deal)
  if (mode !== 'turbo_ball') ok(targets === 0 && widest < 0.05, `${mode}: and send their bots to the same places: every route push alike (${targets} apart), the hulls `
    + `within ${widest.toFixed(3)} m (bound 0.05 m)`);
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
  const risen = due.map(([id]) => [id, fresh.authority.entityById.get(id), third.authority.entityById.get(id)]);
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
  const risen = due.map(([id]) => [id, fresh.authority.entityById.get(id), third.authority.entityById.get(id)]);
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

if (failures) { console.error(`modeWindowMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('modeWindowMigration.selftest: the battle clock, the lead seed, a window\'s ring arrivals, the stranded tracker, the role deals, a resume hold\'s due arrivals and the authority\'s own state carry over as the old host had them');
