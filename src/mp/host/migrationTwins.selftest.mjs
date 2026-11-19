// A host-migrated match plays on as the old host would have (275, the drift gaps 274 left: Kevin, 2026-11-18, "chase it
// next"). Each case runs the old host on and a new host resumed from the old host's keyframe (and the seat's newest frame,
// where the case has a window) side by side with the same inputs, and holds every bot's two hulls within a stated bound
// of each other: the migrated twin against the unmigrated one. Where nothing a seat could not know happened in a window,
// the bound is the floor the wire's rows set (a quantized twin: an unmigrated host whose hulls are snapped to the rows'
// millimetre precision at the same moment; every migration restores the hulls from those rows), plus a few centimetres.
//
// What parted the twins, and what carries it now (each pinned by the lane's mutants, served through a load hook):
// - the brain (game/ai.ts BotBrain): its traffic with its allies (the deadlock, the escape, a committed passing path), its
//   detour side, its settle and press windows, its timers' phases and the rest; a new brain began at its construction's.
// - the brain's clock: the authority's restarts at 0 on a migrated host; the brain runs on the battle clock now (the
//   authority's battleS, the old host's own float sum gone on), as do the route push and the spotting.
// - the hull's integrator no row carries: the gun's dispersion bloom above all (a fresh gun read as settled).
// - the authority's own: the spotting (it began empty: a Horde wave fielded on the new host parted 51 m), the combat
//   stream, the route push's clocks and targets, the wreck grid's phase.
// - a window's arrivals (a wave begun after the keyframe): their points' draws as the old host found them, their hunters'
//   leads and the lead seed, the plans the old host made for them, read from the hulls where the rows have them (the
//   restore read the construction's spawns), and the engine spool of a hull revived in the window (it drives from its
//   revive on; one built at rest pulled away 0.3 s behind).
//
// [1] Frontline attackers, the keyframe 30 ticks after the advance to the second sector (no window): within the quantized
//     twin's gap plus 0.05 m, and 0.5 m, over 14 s; the defenders within 1.5 m. Gaps 274's head: 112.5 m (a-2), 1.7 m.
// [2] Endless Horde, the keyframe in the lull 0.3 s before it ends (no window): the wave the new host begins itself keeps
//     the old host's hulls within 0.05 m over 14 s. Gaps 274's head: 51 m.
// [3] Endless Horde, the wave begun in the window (the seat's newest frame 2, 12 and 30 ticks into it: a mode event's
//     keyframe follows within MODE_KEYFRAME_SPACING_MS), its arrivals seen or hidden from the seat: within 8 m seen, and
//     6 m hidden (12 m 30 ticks in: they rise on the new host's first step), over 14 s. Gaps 274's head: 62-68 m seen.
//     What is left is the window's own play, which no keyframe or frame records: the risen bots' first moves and their
//     brains' first ticks.
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyAuthorityRow } from '../match/authorityRow.ts';
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

/** The actor's frame at `tick` in the host's shape; `hidden`: no bravo row (they rose out of the seat's sight). */
function hostFrame(actor, tick, era, hidden = false) {
  // the battle clock's milliseconds (a resumed host's frames carry the battle's, matchActor.ts metaOnBattleClock)
  const sim = actor.authority, battleTimeMs = Math.round(sim.battleS * 1000);
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.filter((e) => !hidden || e.team !== 'bravo').map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
    shells: [], viewer: null, modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
}
/** The keyframe the old host seals at `tick`, as matchHostCore.ts buildKeyframe seals it (its battle clock exact). */
const sealKeyframe = (actor, tick, era) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(actor.authority.battleS * 1000),
  timeS: actor.authority.timeS, battleS: actor.authority.battleS, phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(),
  entities: captureEntityExtras(actor), frame: hostFrame(actor, tick, era) }));
/** A new host resumed as matchHostCore.ts does: its battle clock the resume state's. */
function resume(make, keyframe, latest, told) {
  const { state } = resumeStateFromRetained(keyframe, 0, latest, latest ? 500 : null, [], [], [...told]);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs, ...(state.battleS !== undefined ? { battleS: state.battleS } : {}) });
  applyResumeState(fresh, state);
  return fresh;
}
/** The quantization floor's twin: every live hull snapped to its row's precision, as a migration restores it. */
function quantize(actor) {
  const era = createEraIndexer();
  for (const e of actor.authority.entities) if (!e.combat.destroyed) applyAuthorityRow(e.state, captureEntityRow(e, actor.wireIdOf(e.id), era, 0));
}
/** Both hosts on together `seconds`, `each` run on both before every step; the widest gap between one bot's two hulls, by side. */
function together(old, other, seconds, each = () => {}) {
  const widest = { alpha: 0, bravo: 0 }, at = { alpha: '', bravo: '' };
  const step = (actor) => { each(actor); actor.authority.step({ dt: 1 / 60, inputs }); actor.authority.eventsForViewer('h0'); actor.authority.afterEventBroadcast(); };
  for (let k = 1; k <= seconds * 60; k++) {
    step(old); step(other);
    for (const e of old.authority.entities) {
      const t = other.authority.entityById.get(e.id);
      if (!e.bot || e.combat.destroyed || t.combat.destroyed || e.modeActive === false || t.modeActive === false) continue;
      const d = Math.hypot(e.state.pos.x - t.state.pos.x, e.state.pos.z - t.state.pos.z);
      if (d > widest[e.team]) { widest[e.team] = d; at[e.team] = `${e.id} +${(k / 60).toFixed(2)} s`; }
    }
  }
  return { widest, at };
}

console.log('[1] Frontline attackers after the advance, the keyframe alone: the quantization floor');
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
  const fresh = resume(make, keyframe, null, []);
  fresh.authority.onMatchReady();
  const floorTwin = make(null);
  floorTwin.authority.onMatchReady();
  stage(floorTwin);
  quantize(floorTwin);
  // the old host and its two twins on together (the old host is stepped once a tick for both comparisons: a second copy of it)
  const oldAgain = make(null);
  oldAgain.authority.onMatchReady();
  stage(oldAgain);
  ok(old.authority.modeController.state.line.index === 2 && keyframe.battleS === old.authority.battleS, `the case is built: the line has advanced to the `
    + `last sector and the keyframe (${keyframe.battleS.toFixed(3)} s) carries the battle clock exact`);
  const migrated = together(old, fresh, 14, pinSurvivor);
  const floor = together(oldAgain, floorTwin, 14, pinSurvivor);
  ok(migrated.widest.alpha <= floor.widest.alpha + 0.05 && migrated.widest.alpha < 0.5, `the attackers keep the old host's tracks for 14 s: at most `
    + `${migrated.widest.alpha.toFixed(2)} m apart (${migrated.at.alpha}) against the quantized twin's ${floor.widest.alpha.toFixed(2)} m (bound: it plus 0.05 m, `
    + 'and 0.5 m; gaps 274\'s head 112.5 m)');
  ok(migrated.widest.bravo < 1.5, `the defenders too: at most ${migrated.widest.bravo.toFixed(2)} m (${migrated.at.bravo}; the quantized twin's `
    + `${floor.widest.bravo.toFixed(2)} m; bound 1.5 m)`);
  for (const actor of [old, fresh, floorTwin, oldAgain]) actor.stop();
}

/**
 * The Horde staging of waveStartMigration [1]/[2]: wave 1 played out, the keyframe sealed 0.3 s before the lull's end;
 * with `window` the old host runs that many ticks on (wave 2 begins 18 ticks in) and the seat's newest frame is then,
 * its hostiles `hidden` from it or not; without, the keyframe alone. Both hosts then run on 14 s.
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
  const fresh = resume(make, keyframe, window ? hostFrame(old, tick, era, hidden) : null, told);
  fresh.authority.onMatchReady();
  const run = together(old, fresh, 14);
  const wave = (actor) => actor.authority.modeController.state.horde.wave;
  const out = { gap: run.widest.bravo, at: run.at.bravo, waves: `${wave(old)}/${wave(fresh)}`, told: told.size };
  old.stop(); fresh.stop();
  return out;
}

console.log('[2] Endless Horde, the keyframe alone in the lull: the wave the new host begins keeps the old host\'s hulls');
{
  const run = hordeTwin(0, false);
  ok(run.waves === '2/2' && run.gap < 0.05, `the wave's hostiles keep the old host's tracks for 14 s: at most ${run.gap.toFixed(3)} m apart (${run.at || 'none'}; `
    + `waves ${run.waves}; bound 0.05 m; gaps 274's head 51 m)`);
}

console.log('[3] Endless Horde, the wave begun in the window: its arrivals seen or hidden from the seat');
for (const [window, hidden, bound] of [[20, false, 8], [30, false, 8], [48, false, 8], [20, true, 6], [30, true, 6], [48, true, 12]]) {
  const run = hordeTwin(window, hidden);
  ok(run.told > 0 && run.waves === '2/2' && run.gap < bound, `the frame ${window - 18} ticks into wave 2, its arrivals ${hidden ? 'hidden from' : 'in'} the seat's `
    + `frame (${run.told} told): at most ${run.gap.toFixed(2)} m apart over 14 s (${run.at}; bound ${bound} m${hidden ? '' : '; gaps 274\'s head 63-64 m'})`);
}

if (failures) { console.error(`migrationTwins.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('migrationTwins.selftest: a migrated host\'s bots keep the old host\'s tracks, to the rows\' precision where the window holds nothing, within a stated bound where it holds a wave\'s arrivals');
