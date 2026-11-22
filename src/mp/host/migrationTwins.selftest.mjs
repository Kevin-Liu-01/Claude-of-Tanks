// A host-migrated match plays on as the old host would have (275, the drift gaps 274 left: Kevin, 2026-11-18, "chase it
// next"; 276, the window). Each case runs the old host on and a new host resumed from the old host's keyframe (and the
// seat's newest frame, where the case has a window) side by side with the same inputs, and holds every bot's two hulls
// together: the migrated twin against the unmigrated one.
//
// 275 carried what parted the twins from a keyframe alone (the brain, its battle clock, the gun's bloom, the authority's
// spotting and streams, the director's clocks and deals) and took the window up from what the seat could read of it. That
// left two floors (276):
// - the keyframe's own: its rows round each hull's pose to the millimetre and carry no integrator flag; a fight parted
//   on them by tens of metres within 10 s (the round 1 review's CTF staging: 23 m), the gun's limit flag the most of it
//   (the bot's gun-limit nudge reads it). The keyframe now carries every live hull exact (MigrationEntityExtras.hull: the
//   pose, the hp, the movement prediction checkpoint and the held input), and a down bot's brain waits for its revive's
//   hand-back. From a keyframe alone the new host is the old one, to the bit.
// - the window's: every bot's play between the keyframe and the seat's frame (its brain ticks, its stream draws, a hidden
//   hull's moves, a wave's arrivals as they drove). The resume now replays it (migrationState.ts replayWindow): the match
//   restored at the keyframe and stepped the old host's steps to the frame, the seat's rows correcting it where it parts
//   from them. A window that holds nothing a seat could not know plays as the old host played it, to the bit.
//
// Each window case also runs the 275 reading of it (a resume that cannot replay: the replay dropped), and prints it.
// [1] Frontline attackers, the keyframe 30 ticks after the advance to the second sector (no window): to the bit over 14 s
//     (the rows alone, a quantized twin, part them 0.36 m; gaps 274's head: 112.5 m).
// [2] Endless Horde, the keyframe in the lull 0.3 s before it ends (no window): the wave the new host begins, to the bit.
// [3] Endless Horde, the wave begun in the window (the seat's newest frame 2, 12 and 30 ticks into it), its arrivals seen
//     or hidden from the seat: to the bit (the 275 reading: 5.5-5.9 m and 0.07 m seen, 1-10 m hidden).
// [4] Frontline, the line advanced in the window (the capture the attackers began before the keyframe ends in it, the
//     defenders rise on the next sector, and the seat's frame is 30 ticks after): to the bit.
// [5] a 4v4 CTF fight (the round 1 review's staging: 45 s in, a 30-tick window), on flat ground and on hills: to the bit
//     (the 275 reading: 26 m in 10 s, 14 m, 1.8 m on hills).
// [6] that fight with the seat's human driving and firing throughout, its inputs no replay has (in the play it holds the
//     command it had at the keyframe, its trigger held; its row sets its hull right at the frame): every bot within 0.05 m
//     over 10 s, and the human's own hull within 0.5 m (it braked through the play at first: 3.5 m). Its shots fall
//     outside the window here; a shot still in flight at the frame is no keyframe's or replay's (docs/MULTIPLAYER-V2.md).
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyAuthorityRow } from '../match/authorityRow.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeClocksOf, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const spec = 'm1a1_abrams_hc';
await ensureAuthorityFleet([spec]);
const seats = [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }];
const flatWorld = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
// the round 1 review's hills (review-correctness-r1 probe-window.mjs)
const hillsAt = (x, z) => 4 * Math.sin(x / 37) + 3 * Math.cos(z / 53) + 1.5 * Math.sin((x + z) / 19);
const hillyWorld = { mapId: 'verdant', heightField: { getHeightAt: hillsAt, getGroundType: () => 'hard', getNormalAt: (x, z) => {
  const e = 0.5, hx = (hillsAt(x + e, z) - hillsAt(x - e, z)) / (2 * e), hz = (hillsAt(x, z + e) - hillsAt(x, z - e)) / (2 * e);
  return new Vector3(-hx, 1, -hz).normalize();
} }, getObstacles: () => [] };
const world = flatWorld;
const inputs = new Map();

/**
 * The actor's frame at `tick` in the host's shape, the seat's (its viewer the seat's hull: the replay reads the mode view
 * as served it) or, `sealed`, a keyframe's (no viewer); `hidden`: no bravo row (they rose out of the seat's sight).
 */
function hostFrame(actor, tick, era, hidden = false, sealed = false) {
  // the battle clock's milliseconds (a resumed host's frames carry the battle's, matchActor.ts metaOnBattleClock)
  const sim = actor.authority, battleTimeMs = Math.round(sim.battleS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'h0', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.filter((e) => !hidden || e.team !== 'bravo').map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
    shells: [], viewer: sealed ? null : { entityId: actor.wireIdOf('h0') }, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}
/** The keyframe the old host seals at `tick`, as matchHostCore.ts buildKeyframe seals it (its battle clock exact). */
const sealKeyframe = (actor, tick, era) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(actor.authority.battleS * 1000),
  timeS: actor.authority.timeS, battleS: actor.authority.battleS, phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(),
  entities: captureEntityExtras(actor), frame: hostFrame(actor, tick, era, false, true) }));
/** A new host resumed as matchHostCore.ts does (its clocks resumeClocksOf's): the window replayed, or (`replay` false) read as 275 read it. */
function resume(make, keyframe, latest, told, replay = true) {
  const { state } = resumeStateFromRetained(keyframe, 0, latest, latest ? 500 : null, [], [], [...told]);
  if (!replay) delete state.replay;
  const fresh = make({ tick: state.tick, ...resumeClocksOf(state) });
  const applied = applyResumeState(fresh, state);
  fresh.authority.onMatchReady();
  return { fresh, replayed: applied.replayed ?? null };
}
/** The quantization floor's twin: every live hull snapped to its row's precision, as a resume from rows alone stands it. */
function quantize(actor) {
  const era = createEraIndexer();
  for (const e of actor.authority.entities) if (!e.combat.destroyed) applyAuthorityRow(e.state, captureEntityRow(e, actor.wireIdOf(e.id), era, 0));
}
/**
 * The old host and its twins on together `seconds`, `each` run on every host before every step (with the step's count),
 * the same inputs to all; the widest gap between one bot's two hulls, by twin and side.
 */
function together(old, twins, seconds, each = () => {}) {
  const out = twins.map(() => ({ widest: { alpha: 0, bravo: 0 }, at: { alpha: '', bravo: '' }, seat: 0 }));
  const step = (actor, k) => { each(actor, k); actor.authority.step({ dt: 1 / 60, inputs }); actor.authority.eventsForViewer('h0'); actor.authority.afterEventBroadcast(); };
  for (let k = 1; k <= seconds * 60; k++) {
    step(old, k);
    twins.forEach((twin, i) => {
      step(twin, k);
      for (const e of old.authority.entities) {
        const t = twin.authority.entityById.get(e.id);
        // the seat's own hull beside the bots
        if (!e.bot && !e.combat.destroyed && !t.combat.destroyed) out[i].seat = Math.max(out[i].seat, Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z));
        if (!e.bot || e.combat.destroyed || t.combat.destroyed || e.modeActive === false || t.modeActive === false) continue;
        const d = Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z);
        if (d > out[i].widest[e.team]) { out[i].widest[e.team] = d; out[i].at[e.team] = `${e.id} +${(k / 60).toFixed(2)} s`; }
      }
    });
  }
  return out;
}
const apart = (run, side) => `${run.widest[side].toFixed(3)} m${run.at[side] ? ` (${run.at[side]})` : ''}`;
const both = (run) => Math.max(run.widest.alpha, run.widest.bravo);
const wider = (run) => apart(run, run.widest.alpha > run.widest.bravo ? 'alpha' : 'bravo');

console.log('[1] Frontline attackers after the advance, the keyframe alone: to the bit');
{
  const bots = [...Array.from({ length: 3 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...Array.from({ length: 8 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'twin-line', mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats, bots,
    ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  // the attack takes sector 1 (the attackers on its centre, every defender but one pinned 300 m off the line falls), the
  // line advances, and the keyframe is sealed 30 ticks later
  const stage = (actor) => {
    const st = actor.authority.modeController.state, zones = st.zones;
    const ax = zones.at(-1).x - zones[0].x, az = zones.at(-1).z - zones[0].z, al = Math.hypot(ax, az) || 1;
    const pin = { x: zones[1].x - az / al * 300, z: zones[1].z + ax / al * 300 };
    const pinSurvivor = (a) => { const e = a.authority.entityById.get('d-7'); e.state.pos.x = pin.x; e.state.pos.z = pin.z; e.state.speed = 0; };
    const takeSector = (a) => {
      const s = a.authority.modeController.state, zone = s.zones[Math.min(s.line.index, s.zones.length - 1)];
      for (const e of a.authority.entities) {
        if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) { e.state.pos.x = zone.x + (e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z; }
        if (e.team === 'bravo' && e.id !== 'd-7' && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
      }
      pinSurvivor(a);
    };
    let ticks = 0;
    const step = (fight) => { fight(actor); actor.authority.step({ dt: 1 / 60, inputs }); actor.authority.eventsForViewer('h0'); actor.authority.afterEventBroadcast(); ticks++; };
    const zoneOf = () => { const s = actor.authority.modeController.state; return s.zones[Math.min(s.line.index, s.zones.length - 1)]; };
    for (let guard = 0; guard < 30000 && !(st.line.index === 1 && zoneOf().control > 0.95); guard++) step(takeSector);
    for (let guard = 0; guard < 600 && !(zoneOf().control > 0.97); guard++) step(takeSector);
    for (let k = 0; k < 30; k++) step((a) => (a.authority.modeController.state.line.index < 2 ? takeSector(a) : pinSurvivor(a)));
    return { ticks, pinSurvivor };
  };
  const old = make(null);
  old.authority.onMatchReady();
  const { ticks, pinSurvivor } = stage(old);
  const keyframe = sealKeyframe(old, ticks, createEraIndexer());
  const { fresh } = resume(make, keyframe, null, []);
  const floorTwin = make(null);
  floorTwin.authority.onMatchReady();
  stage(floorTwin);
  quantize(floorTwin);
  ok(old.authority.modeController.state.line.index === 2 && keyframe.battleS === old.authority.battleS, `the case is built: the line has advanced to the `
    + `last sector and the keyframe (${keyframe.battleS.toFixed(3)} s) carries the battle clock exact`);
  const [migrated, floor] = together(old, [fresh, floorTwin], 14, (a) => pinSurvivor(a));
  ok(both(migrated) === 0, `every bot keeps the old host's track for 14 s, to the bit: the attackers ${apart(migrated, 'alpha')}, the defenders `
    + `${apart(migrated, 'bravo')} apart (the rows alone, a quantized twin: ${apart(floor, 'alpha')} and ${apart(floor, 'bravo')}; gaps 274's head 112.5 m)`);
  for (const actor of [old, fresh, floorTwin]) actor.stop();
}

/**
 * The Horde staging of waveStartMigration [1]/[2]: wave 1 played out, the keyframe sealed 0.3 s before the lull's end;
 * with `window` the old host runs that many ticks on (wave 2 begins 18 ticks in) and the seat's newest frame is then,
 * its hostiles `hidden` from it or not; without, the keyframe alone. Both hosts then run on 14 s: the replay's twin and
 * the 275 reading's.
 */
function hordeTwin(window, hidden) {
  const bots = Array.from({ length: 10 }, (_, i) => ({ playerId: `z-${i}`, name: `Z${i}`, team: 'bravo', specId: spec }));
  const horde = matchRulesetFor('endless_horde');
  const rules = { ...horde, horde: { ...horde.horde, spawnOutOfSight: false, waveSize: 12, maxAlive: 6, maxAliveCap: 6 } };
  const make = (resumed) => createMatchActor({ roomId: 'twin-horde', mapId: 'verdant', mode: 'endless_horde', seed: 7, seats, bots, ruleset: rules, world,
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = (n) => { for (let k = 0; k < n; k++) { sim.step({ dt: 1 / 60, inputs }); tick++; for (const ev of sim.eventsForViewer('h0')) if (ev.type === 'mode_respawn') told.set(ev.id, tick); sim.afterEventBroadcast(); } };
  const killAll = () => { for (const e of sim.entities) if (e.team === 'bravo' && !e.combat.destroyed && e.modeActive !== false) { e.combat.hp = 0; e.combat.destroyed = true; } };
  for (let guard = 0; guard < 400 && !(sim.modeController.state.horde.nextWaveInS > 0.4); guard++) { killAll(); step(15); }
  while (sim.modeController.state.horde.nextWaveInS > 0.3) step(1);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era);
  told.clear();
  step(window);
  const latest = window ? hostFrame(old, tick, era, hidden) : null;
  const replayed = resume(make, keyframe, latest, told);
  const read = window ? resume(make, keyframe, latest, told, false) : null;
  const twins = [replayed.fresh, ...(read ? [read.fresh] : [])];
  const [run, run275] = together(old, twins, 14);
  const wave = (actor) => actor.authority.modeController.state.horde.wave;
  const out = { gap: run.widest.bravo, at: run.at.bravo, gap275: run275?.widest.bravo ?? null, waves: twins.map((t) => `${wave(old)}/${wave(t)}`).join(' '), told: told.size,
    replayed: replayed.replayed };
  for (const actor of [old, ...twins]) actor.stop();
  return out;
}

console.log('[2] Endless Horde, the keyframe alone in the lull: the wave the new host begins keeps the old host\'s hulls');
{
  const run = hordeTwin(0, false);
  ok(run.waves === '2/2' && run.gap === 0, `the wave's hostiles keep the old host's tracks for 14 s, to the bit: ${run.gap.toFixed(3)} m apart${run.at ? ` (${run.at})` : ''} `
    + `(waves ${run.waves}; gaps 274's head 27 m)`);
}

console.log('[3] Endless Horde, the wave begun in the window: its arrivals seen or hidden from the seat');
for (const [window, hidden] of [[20, false], [30, false], [48, false], [20, true], [30, true], [48, true]]) {
  const run = hordeTwin(window, hidden);
  ok(run.told > 0 && run.waves === '2/2 2/2' && run.replayed?.steps === window && run.gap === 0, `the frame ${window - 18} ticks into wave 2, its arrivals `
    + `${hidden ? 'hidden from' : 'in'} the seat's frame (${run.told} told), the window replayed (${run.replayed?.steps} steps, ${run.replayed?.corrected} rows `
    + `set it right): to the bit over 14 s (the 275 reading: ${run.gap275.toFixed(2)} m)`);
}

console.log('[4] Frontline, the line advanced in the window');
{
  const bots = [...Array.from({ length: 3 }, (_, i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...Array.from({ length: 8 }, (_, i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'twin-line-window', mapId: 'verdant', mode: 'frontline_assault', seed: 7, seats, bots,
    ruleset: matchRulesetFor('frontline_assault'), world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  const zones = sim.modeController.state.zones;
  const ax = zones.at(-1).x - zones[0].x, az = zones.at(-1).z - zones[0].z, al = Math.hypot(ax, az) || 1;
  const pin = { x: zones[1].x - az / al * 300, z: zones[1].z + ax / al * 300 };
  const pinSurvivor = (a) => { const e = a.authority.entityById.get('d-7'); e.state.pos.x = pin.x; e.state.pos.z = pin.z; e.state.speed = 0; };
  const lineOf = (a) => a.authority.modeController.state.line.index;
  const zoneOf = (a) => { const s = a.authority.modeController.state; return s.zones[Math.min(s.line.index, s.zones.length - 1)]; };
  const takeSector = (a) => {
    const zone = zoneOf(a);
    for (const e of a.authority.entities) {
      if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) { e.state.pos.x = zone.x + (e.id === 'h0' ? 0 : 6); e.state.pos.z = zone.z; }
      if (e.team === 'bravo' && e.id !== 'd-7' && e.modeActive !== false && !e.combat.destroyed) { e.combat.hp = 0; e.combat.destroyed = true; }
    }
    pinSurvivor(a);
  };
  let tick = 0;
  const told = new Map();
  const step = (fight) => { fight(old); sim.step({ dt: 1 / 60, inputs }); tick++; for (const ev of sim.eventsForViewer('h0')) if (ev.type === 'mode_respawn') told.set(ev.id, tick); sim.afterEventBroadcast(); };
  // the attack stood on sector 1's centre and its defenders down (the staging's hand) until the capture is near done;
  // the keyframe then, and the window holds the play alone: the capture ends, the line advances, the defenders rise
  for (let guard = 0; guard < 30000 && !(lineOf(old) === 1 && zoneOf(old).control > 0.95); guard++) step(takeSector);
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era);
  told.clear();
  const play = () => {};
  for (let guard = 0; guard < 600 && lineOf(old) < 2; guard++) step(play);
  for (let k = 0; k < 30; k++) step(play);
  const latest = hostFrame(old, tick, era);
  const replayed = resume(make, keyframe, latest, told), read = resume(make, keyframe, latest, told, false);
  ok(lineOf(old) === 2 && lineOf(replayed.fresh) === 2 && lineOf(read.fresh) === 2 && [...told.keys()].some((id) => id.startsWith('d-')), `the case is built: the old `
    + `host advanced in the window (${[...told.keys()].join(', ')} told; ${replayed.replayed?.steps} steps replayed) and both new hosts took the advance up`);
  const [run, run275] = together(old, [replayed.fresh, read.fresh], 14, (a) => pinSurvivor(a));
  ok(both(run) === 0, `every bot keeps the old host's track for 14 s, to the bit: the attackers ${apart(run, 'alpha')}, the defenders ${apart(run, 'bravo')} `
    + `(the 275 reading: ${apart(run275, 'alpha')} and ${apart(run275, 'bravo')})`);
  for (const actor of [old, replayed.fresh, read.fresh]) actor.stop();
}

/**
 * The round 1 review's fight (review-correctness-r1 probe-window.mjs): a 4v4 CTF match with the seat's human, `t0` s in,
 * the keyframe, the old host `window` ticks on, and the seat's frame; then the old host and both new hosts on 10 s.
 * `human`: the seat drives a weave and fires at the nearest hostile every 2.5 s (75 ticks off the keyframe's beat), the
 * same inputs on every host after the frame; in the window only the old host has them.
 */
function fightTwin({ seed, window = 30, t0 = 45, hilly = false, human = false }) {
  const bots = [...[0, 1, 2, 3].map((i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...[0, 1, 2, 3].map((i) => ({ playerId: `b-${i}`, name: `B${i}`, team: 'bravo', specId: spec }))];
  const make = (resumed) => createMatchActor({ roomId: 'twin-fight', mapId: 'verdant', mode: 'capture_the_flag', seed, seats, bots, ruleset: matchRulesetFor('capture_the_flag'),
    world: hilly ? hillyWorld : flatWorld, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume: resumed });
  const drive = (sim, k) => {
    if (!human) return;
    const me = sim.entityById.get('h0');
    if (!me || me.combat.destroyed) { inputs.delete('h0'); return; }
    let near = null, nearM = Infinity;
    for (const e of sim.entities) {
      if (e.team !== 'bravo' || e.combat.destroyed || e.modeActive === false) continue;
      const d = Math.hypot(e.state.pos.x - me.state.pos.x, e.state.pos.z - me.state.pos.z);
      if (d < nearM) { nearM = d; near = e; }
    }
    const fire = k % 150 === 75 && !!near;
    inputs.set('h0', { throttle: 1, steer: Math.sin(k / 70), brake: false, fire, fireIntentSeq: fire ? (k - 75) / 150 : null, aimLocked: false, shellSlot: 0, actionBits: 0,
      aimYaw: near ? Math.atan2(near.state.pos.x - me.state.pos.x, near.state.pos.z - me.state.pos.z) : 0, aimPitch: 0, aimDistance: Math.min(400, nearM) });
  };
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const told = new Map();
  const step = () => { drive(sim, tick); sim.step({ dt: 1 / 60, inputs }); tick++; for (const ev of sim.eventsForViewer('h0')) if (ev.type === 'mode_respawn') told.set(ev.id, tick); sim.afterEventBroadcast(); };
  for (let k = 0; k < t0 * 60; k++) step();
  const era = createEraIndexer();
  const keyframe = sealKeyframe(old, tick, era);
  told.clear();
  for (let k = 0; k < window; k++) step();
  const latest = hostFrame(old, tick, era);
  inputs.delete('h0');
  const replayed = resume(make, keyframe, latest, told), read = resume(make, keyframe, latest, told, false);
  // on together, the inputs read off the old host before its step and ridden to every host's (they stand in `inputs`)
  const from = tick;
  const [run, run275] = together(old, [replayed.fresh, read.fresh], 10, (actor, k) => { if (actor === old) drive(sim, from + k - 1); });
  for (const actor of [old, replayed.fresh, read.fresh]) actor.stop();
  inputs.delete('h0');
  return { run, run275, replayed: replayed.replayed };
}

console.log('[5] a 4v4 CTF fight, a 30-tick window: to the bit');
for (const [seed, hilly] of [[9, false], [5, false], [5, true]]) {
  const { run, run275, replayed } = fightTwin({ seed, hilly });
  ok(replayed?.steps === 30 && both(run) === 0, `seed ${seed}${hilly ? ', on hills' : ''}: every bot keeps the old host's track for 10 s, to the bit `
    + `(${both(run).toFixed(3)} m; the 275 reading: ${wider(run275)})`);
}

console.log('[6] the fight with the seat\'s human driving and firing, its inputs no replay holds');
for (const seed of [1, 2, 3]) {
  const { run, run275, replayed } = fightTwin({ seed, human: true });
  ok(replayed?.steps === 30 && replayed.corrected > 0 && both(run) < 0.05, `seed ${seed}: the human's row sets it right at the frame (${replayed?.corrected} rows), and `
    + `every bot keeps within 0.05 m of the old host's for 10 s (${wider(run)}; the 275 reading: ${wider(run275)})`);
  // the seat's hull drove the window on its last command (it braked through the play before: 3.5 m behind)
  ok(run.seat < 0.5, `and the human's own hull within 0.5 m of the old host's (${run.seat.toFixed(3)} m; the 275 reading: ${run275.seat.toFixed(3)} m)`);
}

if (failures) { console.error(`migrationTwins.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('migrationTwins.selftest: a migrated host plays on as the old host would have, to the bit from a keyframe alone and through a window it replays that holds nothing a seat could not know');
