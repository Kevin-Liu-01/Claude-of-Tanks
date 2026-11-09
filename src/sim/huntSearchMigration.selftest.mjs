// The hunters' search survives a host migration (round 8 Y2, s2-06). A bravo hunter with nobody in sight searches: its
// side's freshest sighting it has not spent, else a director arrival's lead point, else a sweep (a spiral round its own
// anchor: a spent sighting, a reached lead, where it rose), else the ring round the last contact or the humans'
// deployment (268 item 10: a hunter never stands on a spent lead). That search lived in four controller maps the mode
// checkpoint did not carry, so an elected host's hunters started over: back to the deployment ring, or to a phantom lead
// its own constructor's wave had drawn. The search is now one record per hunter (phase, anchor, lead, spentAtS, step),
// carried in the checkpoint with the side's sightings, last contact, plans and the arrivals' lead seed.
//
// Proof by parity: an uninterrupted host and a new host restored from JSON.parse(JSON.stringify(captureCheckpoint())),
// the keyframe's own encoding (migrationState.ts), over the same hulls, stepped on the same clock past assignEveryS,
// give every hunter the same destination. [1] Endless Horde's second wave, nobody ever spotted: every arrival drives
// on to its director lead. [2] Endless Horde, spotted, then hidden: one hunter reaches the sighting (spent) and its
// sweep points, and the host goes as it stands on its next point; the rest still drive to the sighting. [3] Infected,
// spotted, then hidden: one hunter mid-sweep. Each case also compares the two hosts' whole hunt state after the steps
// (the plans' clock, the sightings' refresh clock and the arrivals' lead seed included), and (fix-up r1, the completeness
// review: a capture that dropped either clock passed, the final compare reading both hosts through it) checks that the
// keyframe itself names both clocks, within assignEveryS and intelRefreshS of the migration. [4] The record is JSON-safe
// and the restore refuses a corrupt one. Every bot asks for its destination each step, as the drivers do.
// [5] (fix-up r2, the correctness review: a hunter revived between the keyframe and the elected seat's newest frame came
// back with its dead life's search, its old anchor and director lead) through the real resume: a Horde match actor, a
// trickle arrival told after the keyframe, resumeStateFromRetained and applyResumeState (migrationState.ts
// checkpointAfterRevives). [5a] A returning hunter holds no record until its first plan anchors it where it stands, with
// no lead; every other hunter keeps the keyframe's record, and the plans and their clock are the keyframe's. [5b] A first
// arrival has no plan in the keyframe, so the new host's first route push (before its first step sets the mode clock)
// plans every hunter at once: on the keyframe's clock, not on 0. (Fix-up r3, the completeness review: both checks also
// passed for a hunter that held no record at all; each now requires the record.)
// [6] (fix-up r3, the correctness review r3: fix-up r2 restored that clock in every mode) the clock dates the stages the
// objective modes' bots wait at, the CTF raid's (raidWaitS 12 s) and Frontline's attack plan (pushAfterS 15 s), which
// the checkpoint did not carry. On the mode's clock the new host's first push staged them afresh and held a lone raider
// or attacker the old host had going in for the whole wait; on clock 0 (H8) it held it one push, then a stage read as
// waited out and sent a waiting hull in alone up to the wait early. The stages are carried now: through the real resume,
// a hull going in goes in at the new host's first push, a waiting one and one that reached the stage after the old host's
// last push (staged on the mode's clock) go in within one route push of when the old host sends them.
import { Vector3 } from 'three';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from '../mp/host/migrationState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createMatchModeController } from './matchModes.ts';
import { HUNT_RULES, matchRulesetFor } from './matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const hordeRules = { ...matchRulesetFor('endless_horde'), horde: { ...matchRulesetFor('endless_horde').horde, spawnOutOfSight: false } };
const infectedRules = matchRulesetFor('infected');
const roster = (mode) => (mode === 'infected'
  ? [tank('human', 'alpha', 0, -150, false), ...[0, 1, 2, 3].map((i) => tank(`s${i}`, 'alpha', i * 12 - 18, -140)),
    ...[0, 1, 2].map((i) => tank(`inf${i}`, 'bravo', i * 10, 300))]
  : [tank('human', 'alpha', 0, -150, false), tank('ally-0', 'alpha', 10, -150),
    ...Array.from({ length: 10 }, (_, i) => tank(`z${i}`, 'bravo', i * 6 - 30, 380))]);
/** One host's controller over its own hulls; `sight.on` is the bravo side's spotting of the humans. */
function host(mode, ruleset, entities, sight) {
  return createMatchModeController({ mode, entities, seed: 5, terrainHeight: () => 0, ruleset,
    spotting: { isSpotted: (_id, side) => side === 'bravo' && sight.on },
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.state.yaw = spawn.yaw ?? 0; target.combat.destroyed = false; } });
}
const copyHull = (from, to) => {
  Object.assign(to.state.pos, from.state.pos); to.state.yaw = from.state.yaw;
  to.combat = { ...from.combat }; to.modeActive = from.modeActive; to.team = from.team;
};
const hunters = (entities) => entities.filter((e) => e.team === 'bravo' && e.bot && e.modeActive !== false && !e.combat.destroyed);
const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
const fmt = (p) => (p ? `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})` : 'none');

/**
 * Run the old host to the migration, build the new one (its constructor's own opening included, as an elected host's
 * is), give it the old host's hulls and restore the JSON keyframe, then step both on one clock and compare.
 */
function migrate(label, mode, ruleset, setUp) {
  const sight = { on: false };
  const oldHulls = roster(mode);
  const old = host(mode, ruleset, oldHulls, sight);
  const clock = { t: 0 };
  // a step, then every bot asks for its destination (the hunt plans on that ask, once per assignEveryS)
  const step = (ctl, hulls, seconds) => {
    const end = clock.t + seconds;
    while (clock.t < end - 1e-9) { clock.t += 0.25; ctl.step(1 / 60, clock.t); for (const h of hunters(hulls)) ctl.botTarget(h); }
  };
  const picked = setUp({ old, oldHulls, sight, clock, step: (s) => step(old, oldHulls, s) });
  const keyframe = JSON.parse(JSON.stringify(old.captureCheckpoint(clock.t)));
  // the keyframe carries the plans' clock and the sightings' refresh clock as the old host holds them: every case has
  // planned and refreshed by now, so each lies within its own interval of the migration
  const planAtS = keyframe.hunt?.planAtS, intelAtS = keyframe.hunt?.intelAtS;
  ok(Number.isFinite(planAtS) && planAtS <= clock.t && clock.t - planAtS < HUNT_RULES.assignEveryS,
    `${label}: the keyframe names the plans' clock (${planAtS} at ${clock.t}, every ${HUNT_RULES.assignEveryS} s)`);
  ok(Number.isFinite(intelAtS) && intelAtS <= clock.t && clock.t - intelAtS < HUNT_RULES.intelRefreshS,
    `${label}: the keyframe names the sightings' refresh clock (${intelAtS} at ${clock.t}, every ${HUNT_RULES.intelRefreshS} s)`);
  const newHulls = roster(mode);
  const fresh = host(mode, ruleset, newHulls, sight); // the elected host's controller: its constructor opens a wave
  for (const [i, hull] of oldHulls.entries()) copyHull(hull, newHulls[i]);
  fresh.restoreCheckpoint(keyframe);
  // both hosts on one clock, past the next assignment
  const resumeAt = clock.t;
  for (const [ctl, hulls] of [[old, oldHulls], [fresh, newHulls]]) { clock.t = resumeAt; step(ctl, hulls, HUNT_RULES.assignEveryS + 0.5); }
  let same = 0, differ = [];
  for (const h of hunters(oldHulls)) {
    const twin = newHulls.find((e) => e.id === h.id);
    const a = old.botTarget(h), b = fresh.botTarget(twin);
    if (near(a, b)) same++; else differ.push(`${h.id} ${fmt(a)} vs ${fmt(b)}`);
  }
  console.log(`  ${label}: ${same} of ${same + differ.length} hunters keep their destination${differ.length ? `; differ: ${differ.join('; ')}` : ''}`);
  for (const [id, what] of picked) {
    const h = oldHulls.find((e) => e.id === id), twin = newHulls.find((e) => e.id === id);
    const a = old.botTarget(h), b = fresh.botTarget(twin);
    ok(near(a, b), `${label}: ${id} (${what}) heads for the same point on the new host (${fmt(a)} vs ${fmt(b)})`);
    const before = old.huntSearchOf?.(h), after = fresh.huntSearchOf?.(twin);
    ok(!!before && JSON.stringify(before) === JSON.stringify(after), `${label}: ${id}'s search record is the old host's `
      + `(${before?.phase ?? 'none'}, step ${before?.step ?? '-'} vs ${after?.phase ?? 'none'}, step ${after?.step ?? '-'})`);
  }
  ok(differ.length === 0, `${label}: every hunter keeps its destination (${same} of ${same + differ.length})`);
  // the whole hunt, as the two hosts hold it now: searches, plans and their clock, the sightings and their refresh
  // clock, the last contact and the arrivals' lead seed
  const huntOld = JSON.stringify(old.captureCheckpoint(clock.t).hunt), huntNew = JSON.stringify(fresh.captureCheckpoint(clock.t).hunt);
  ok(huntOld !== undefined && huntOld === huntNew, `${label}: the new host's hunt state is the uninterrupted host's`
    + `${huntOld === undefined ? ' (no hunt in the checkpoint)' : ''}`);
  return { old, fresh, oldHulls, newHulls };
}

console.log('[1] Endless Horde\'s second wave, nobody ever spotted: the arrivals drive on to their leads');
migrate('horde leads', 'endless_horde', hordeRules, ({ old, oldHulls, step }) => {
  step(2);
  // the first wave falls; the second arrives after the lull (the new host's own opening draws a first wave's leads)
  for (const z of hunters(oldHulls)) z.combat.destroyed = true;
  for (let guard = 0; guard < 80 && old.state.horde.wave < 2; guard++) step(0.25);
  ok(old.state.horde.wave === 2, `the case is built: the second wave is on (wave ${old.state.horde.wave})`);
  step(2);
  const lead = hunters(oldHulls).find((h) => old.huntSearchOf?.(h)?.phase === 'lead') ?? hunters(oldHulls)[0];
  ok(!old.huntSearchOf || old.huntSearchOf(lead)?.phase === 'lead', `the case is built: ${lead.id} drives to its director lead `
    + `(${old.huntSearchOf?.(lead)?.phase ?? 'phase not exposed'})`);
  return [[lead.id, 'its lead']];
});

console.log('[2] Endless Horde, spotted then hidden: a hunter mid-sweep after its spent sighting');
migrate('horde sweep', 'endless_horde', hordeRules, ({ old, oldHulls, sight, step }) => {
  sight.on = true; step(3);
  sight.on = false; step(1.5);
  const h = hunters(oldHulls)[0];
  const seen = old.freshestSighting(h);
  ok(!!seen, `the case is built: bravo holds a sighting (${fmt(seen)})`);
  Object.assign(h.state.pos, { x: seen.x + 5, z: seen.z + 5 }); step(1.5); // within arriveM: the sighting is spent
  const first = { ...old.botTarget(h) };
  Object.assign(h.state.pos, { x: first.x, z: first.z }); step(1.5); // on its first sweep point: the next is drawn
  const second = { ...old.botTarget(h) };
  ok(!near(first, second) && !near(second, seen), `the case is built: ${h.id} swept on from ${fmt(first)} to ${fmt(second)}, `
    + `past the spent sighting ${fmt(seen)}`);
  ok(!old.huntSearchOf || (old.huntSearchOf(h)?.phase === 'sweep' && old.huntSearchOf(h)?.step >= 1),
    `the case is built: ${h.id} sweeps at step ${old.huntSearchOf?.(h)?.step ?? 'not exposed'}`);
  // the host goes as the hunter reaches that point, before its next plan: the new host must count it reached
  Object.assign(h.state.pos, { x: second.x, z: second.z });
  const other = hunters(oldHulls)[1];
  return [[h.id, 'mid-sweep'], [other.id, 'on to the sighting']];
});

console.log('[3] Infected, spotted then hidden: a hunter mid-sweep');
migrate('infected sweep', 'infected', infectedRules, ({ old, oldHulls, sight, step }) => {
  sight.on = true; step(2);
  sight.on = false; step(1.5);
  const h = hunters(oldHulls)[0];
  const seen = old.freshestSighting(h);
  ok(!!seen, `the case is built: the infected hold a sighting (${fmt(seen)})`);
  Object.assign(h.state.pos, { x: seen.x + 5, z: seen.z + 5 }); step(1.5);
  const first = { ...old.botTarget(h) };
  Object.assign(h.state.pos, { x: first.x, z: first.z }); step(1.5);
  ok(!near(first, old.botTarget(h)), `the case is built: ${h.id} swept on from ${fmt(first)} to ${fmt(old.botTarget(h))}`);
  return [[h.id, 'mid-sweep']];
});

console.log('[4] the record is JSON-safe; a corrupt one is refused');
{
  const sight = { on: false };
  const hulls = roster('endless_horde');
  const ctl = host('endless_horde', hordeRules, hulls, sight);
  let t = 0;
  for (let i = 0; i < 12; i++) ctl.step(1 / 60, t += 0.25);
  const checkpoint = ctl.captureCheckpoint(t);
  const text = JSON.stringify(checkpoint);
  ok(!!checkpoint.hunt && checkpoint.hunt.searches.length > 0, `the checkpoint carries the search (${checkpoint.hunt?.searches.length ?? 0} records)`);
  ok(JSON.stringify(JSON.parse(text)) === text && !/NaN|Infinity/.test(text), 'the hunt checkpoint survives the JSON round trip unchanged');
  if (checkpoint.hunt) {
    const bad = JSON.parse(text);
    const victim = bad.hunt.searches[0][0];
    bad.hunt.searches[0][1].phase = 'teleport';
    bad.hunt.searches[1][1].x = null;
    const other = bad.hunt.searches[1][0];
    const target = createMatchModeController({ mode: 'endless_horde', entities: roster('endless_horde'), seed: 5, terrainHeight: () => 0,
      ruleset: hordeRules, spotting: { isSpotted: () => false }, setActive(e, a) { e.modeActive = a; }, revive() {} });
    target.restoreCheckpoint(bad);
    ok(target.huntSearchOf({ id: victim }) === null && target.huntSearchOf({ id: other }) === null,
      'records with an unknown phase or a missing number are dropped, and the new host\'s own opening anchors for them do not '
      + 'survive the restore (the next plan anchors those hunters where they stand)');
  }
}

console.log('[5] a trickle arrival after the keyframe, through the real resume (migrationState.ts)');
{
  const spec = 'm1a1_abrams_hc';
  await ensureAuthorityFleet([spec]);
  const seats = [{ seat: 0, playerId: 'h0', name: 'H0', team: 'alpha', specId: spec }];
  // a wave of twelve with six on the field: a fallen hostile comes back on the trickle, one arrival at a time
  const rules = { ...hordeRules, horde: { ...hordeRules.horde, waveSize: 12, maxAlive: 6, maxAliveCap: 6 } };
  // the infected rise on the director's ring round the survivors, placed on this flat, open world as the Horde's are
  const infectedArrivals = { ...infectedRules, infectionBots: { ...infectedRules.infectionBots,
    arrival: { ...infectedRules.infectionBots.arrival, spawnOutOfSight: false } } };
  const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
  const inputs = new Map();
  /**
   * A Horde actor with `hostiles` bots: three fall at 3 s, a keyframe is sealed every 0.25 s until a trickle arrival is
   * told after one (the next keyframe would follow its mode_respawn within MODE_KEYFRAME_SPACING_MS), and the elected
   * seat resumes from that keyframe and the newest frame. With `infected`: an Infected actor with `hostiles` infected
   * bots and three survivor bots, one of which falls at 3 s and rises infected (its first life as a hunter).
   */
  function gapArrival(hostiles, infected = false) {
    const bots = [...Array.from({ length: hostiles }, (_, i) => ({ playerId: `z-${i}`, name: `Z${i}`, team: 'bravo', specId: spec })),
      ...(infected ? [0, 1, 2].map((i) => ({ playerId: `s-${i}`, name: `S${i}`, team: 'alpha', specId: spec })) : [])];
    const make = (resume) => createMatchActor({ roomId: 'hunt-revive', mapId: 'verdant', mode: infected ? 'infected' : 'endless_horde', seed: 7, seats,
      bots, ruleset: infected ? infectedArrivals : rules, world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
    const era = createEraIndexer();
    const frameOf = (actor, tick) => {
      const sim = actor.authority, battleTimeMs = Math.round(sim.timeS * 1000);
      const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
      return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
        meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((e) => captureEntityRow(e, actor.wireIdOf(e.id), era, tick)),
        shells: [], viewer: null, modeStateJson: null };
    };
    const keyframeOf = (actor, tick) => decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(actor.authority.timeS * 1000),
      timeS: actor.authority.timeS, phase: 'playing', modeCheckpoint: actor.authority.captureModeCheckpoint(), entities: captureEntityExtras(actor), frame: frameOf(actor, tick) }));
    const old = make(null), sim = old.authority;
    sim.onMatchReady();
    let tick = 0;
    const told = new Map(); // the mode_respawn every seat is told, with the tick it is told at
    const step = (n) => { for (let k = 0; k < n; k++) { sim.step({ dt: 1 / 60, inputs }); tick++; for (const ev of sim.eventsForViewer('h0')) if (ev.type === 'mode_respawn') told.set(ev.id, tick); sim.afterEventBroadcast(); } };
    step(180);
    const zs = sim.entities.filter((e) => e.team === 'bravo');
    const fallen = infected ? sim.entities.filter((e) => e.team === 'alpha' && e.bot).slice(0, 1)
      : zs.filter((e) => !e.combat.destroyed && e.modeActive !== false).slice(0, 3);
    for (const z of fallen) { z.combat.hp = 0; z.combat.destroyed = true; }
    // the Horde: any hostile the trickle brings on (a fallen one, or one resting since the start); Infected: the convert
    const watched = infected ? fallen : zs;
    let keyframe = null, revived = [];
    for (let guard = 0; guard < 240 && !revived.length; guard++) {
      const sealed = keyframeOf(old, tick);
      told.clear();
      step(15);
      revived = watched.filter((z) => told.has(z.id)).map((z) => z.id);
      if (revived.length) keyframe = sealed;
    }
    const { state } = resumeStateFromRetained(keyframe, 0, frameOf(old, tick), 1500, [], [], [...told]);
    const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
    applyResumeState(fresh, state);
    const hunt = keyframe?.modeCheckpoint?.mode?.hunt;
    return { old, fresh, zs, revived, keyframe, sealedSearch: new Map(hunt?.searches ?? []), sealedPlans: new Map(hunt?.plans ?? []),
      sealedAtS: keyframe?.modeCheckpoint?.mode?.elapsedS ?? NaN, ctl: fresh.authority.modeController,
      recordOf: (actor, id) => actor.authority.modeController.huntSearchOf?.(actor.authority.entityById.get(id)) };
  }
  const describe = (record) => (record ? `${record.phase} at ${fmt(record)}, lead ${fmt(record.lead)}, atS ${record.atS.toFixed(2)}` : record === null ? 'none' : 'not exposed');

  console.log(' [5a] a returning hunter: its dead life\'s search stays behind');
  {
    const { old, fresh, zs, revived, keyframe, sealedSearch, sealedAtS, recordOf } = gapArrival(6);
    ok(revived.length > 0 && revived.every((id) => sealedSearch.has(id)), `the case is built: ${revived.join(', ') || 'no hostile'} arrived after the `
      + `keyframe (tick ${keyframe?.tick}) with its dead life's record in it (${revived.map((id) => sealedSearch.get(id)?.phase ?? 'none').join(', ')})`);
    ok(revived.every((id) => { const now = recordOf(old, id); return !!now && JSON.stringify(now) !== JSON.stringify(sealedSearch.get(id)); }),
      `the case is built: the old host started each one's search over (${revived.map((id) => describe(recordOf(old, id))).join('; ')})`);
    for (const id of revived) {
      const record = recordOf(fresh, id), dead = sealedSearch.get(id);
      ok(record === null, `${id}'s dead life's search does not come back on the new host (restored: ${describe(record)}; the dead life's at `
        + `${fmt(dead)}, lead ${fmt(dead?.lead)})`);
    }
    const kept = zs.filter((z) => !revived.includes(z.id));
    const keptSame = kept.filter((z) => JSON.stringify(recordOf(fresh, z.id)) === JSON.stringify(sealedSearch.get(z.id) ?? null));
    ok(kept.length > 0 && keptSame.length === kept.length, `every other hunter keeps the keyframe's record (${keptSame.length} of ${kept.length})`);
    const sealedHunt = keyframe?.modeCheckpoint?.mode?.hunt, restoredHunt = fresh.authority.captureModeCheckpoint()?.mode?.hunt;
    const plansOf = (hunt) => JSON.stringify(hunt?.plans ?? null);
    ok(!!sealedHunt && restoredHunt?.planAtS === sealedHunt.planAtS && plansOf(restoredHunt) === plansOf(sealedHunt)
      && revived.every((id) => sealedHunt.plans.some(([planned]) => planned === id)),
    `the plans and their clock are the keyframe's, the returning hunter's included (planAtS ${sealedHunt?.planAtS} -> ${restoredHunt?.planAtS})`);
    // the new host plays on: the first plan that finds the hunter no quarry anchors it where it then stands, with no lead
    const at = new Map(revived.map((id) => [id, { ...fresh.authority.entityById.get(id).state.pos }]));
    fresh.authority.onMatchReady();
    for (let n = 0; n < 90; n++) { fresh.authority.step({ dt: 1 / 60, inputs }); fresh.authority.eventsForViewer('h0'); fresh.authority.afterEventBroadcast(); }
    for (const id of revived) {
      const record = recordOf(fresh, id), from = at.get(id);
      ok(!!record && record.lead === null && record.atS >= sealedAtS && Math.hypot(record.x - from.x, record.z - from.z) < 30,
        `${id} hunts on from where it rose, 1.5 s on (${describe(record)}; restored at ${fmt(from)})`);
    }
    old.stop(); fresh.stop();
  }

  console.log(' [5b] a first arrival (no plan in the keyframe): the new host\'s first route push plans on the keyframe\'s clock');
  {
    const { old, fresh, revived, keyframe, sealedSearch, sealedPlans, sealedAtS, recordOf } = gapArrival(8);
    ok(revived.length > 0 && revived.every((id) => !sealedSearch.has(id) && !sealedPlans.has(id)), `the case is built: ${revived.join(', ') || 'no hostile'} `
      + `arrived after the keyframe (tick ${keyframe?.tick}, mode clock ${sealedAtS}) for the first time: no record, no plan`);
    fresh.authority.onMatchReady();
    fresh.authority.step({ dt: 1 / 60, inputs }); fresh.authority.eventsForViewer('h0'); fresh.authority.afterEventBroadcast();
    const planAtS = fresh.authority.captureModeCheckpoint()?.mode?.hunt?.planAtS;
    ok(Number.isFinite(planAtS) && planAtS >= sealedAtS, `the plans' clock after the first tick reads the mode's (${planAtS} against the keyframe's ${sealedAtS})`);
    for (const id of revived) {
      const record = recordOf(fresh, id);
      ok(!!record && record.atS >= sealedAtS, `${id}'s search is dated on the mode's clock (${describe(record)})`);
    }
    old.stop(); fresh.stop();
  }

  console.log(' [5c] the infected hunt: a survivor that rises infected after the keyframe plans on the keyframe\'s clock');
  {
    const { old, fresh, revived, keyframe, sealedSearch, sealedPlans, sealedAtS, recordOf } = gapArrival(2, true);
    const sealedTeams = new Map(keyframe?.modeCheckpoint?.mode?.teams ?? []);
    ok(revived.length > 0 && revived.every((id) => sealedTeams.get(id) === 'bravo' && !sealedSearch.has(id) && !sealedPlans.has(id)),
      `the case is built: ${revived.join(', ') || 'no survivor'} fell before the keyframe (tick ${keyframe?.tick}, mode clock ${sealedAtS}) `
      + 'and rose infected after it: infected in the keyframe, with no record and no plan');
    fresh.authority.onMatchReady();
    fresh.authority.step({ dt: 1 / 60, inputs }); fresh.authority.eventsForViewer('h0'); fresh.authority.afterEventBroadcast();
    const planAtS = fresh.authority.captureModeCheckpoint()?.mode?.hunt?.planAtS;
    ok(Number.isFinite(planAtS) && planAtS >= sealedAtS, `the plans' clock after the first tick reads the mode's (${planAtS} against the keyframe's ${sealedAtS})`);
    for (const id of revived) {
      const record = recordOf(fresh, id);
      ok(!!record && record.atS >= sealedAtS, `${id}'s search is dated on the mode's clock (${describe(record)})`);
    }
    old.stop(); fresh.stop();
  }
}

console.log('[6] the objective modes\' stages across a migration: a lone raider or attacker goes in when the old host sends it');
{
  const spec = 'm1a1_abrams_hc';
  const seats = [{ seat: 0, playerId: 'pilot', name: 'Pilot', team: 'alpha', specId: spec }];
  const bots = [{ playerId: 'a-0', name: 'A0', team: 'alpha', specId: spec }, { playerId: 'b-0', name: 'B0', team: 'bravo', specId: spec }];
  const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
  const inputs = new Map([['pilot', { throttle: 0, steer: 0, fire: false, brake: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
  // the stage (CTF: within raidStageM 120 of the enemy flag; Frontline: inside the zone's edge, ZONE_RADIUS_M plus
  // flankConvergeM), a point outside it, the band the hull is kept in while it drives, and the wait a lone hull holds for
  // (raidWaitS 12 s; pushAfterS 15 s); the route push runs every routeRefreshS (1.25 s)
  const modes = [{ mode: 'capture_the_flag', what: 'raider', goalName: 'the enemy flag', insideM: 100, outsideM: 160, band: [60, 115], waitS: 12 },
    { mode: 'frontline_assault', what: 'attacker', goalName: 'the live zone', insideM: 70, outsideM: 150, band: [45, 100], waitS: 15 }];
  const PUSH_S = 1.25;
  /**
   * One lone hull at its stage, the host migrated at a keyframe and both hosts run on together. `going`: inside the stage
   * past the wait (the old host has it going in); `waiting`: inside it for 3 s (staged, waiting); `fresh`: put inside it
   * after the old host's last route push, so neither host has staged it at the keyframe.
   */
  function migrateStage({ mode, insideM, outsideM, band, waitS }, scenario) {
    const make = (resume) => createMatchActor({ roomId: 'stage-clock', mapId: 'verdant', mode, seed: 33, seats, bots, ruleset: matchRulesetFor(mode),
      world, countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
    const old = make(null), sim = old.authority;
    sim.onMatchReady();
    const live = sim.modeController.state;
    const hull = sim.entityById.get('a-0'), pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('b-0');
    // the line the hull stands on: CTF from the enemy flag toward the own flag; Frontline from the zone toward the pilot
    const own = mode === 'capture_the_flag' ? live.flags.find((f) => f.team === 'alpha') : null;
    const goal = mode === 'capture_the_flag' ? live.flags.find((f) => f.team === 'bravo') : live.zones[live.line?.index ?? 0];
    const from = own ?? pilot.state.pos;
    const dx = from.x - goal.x, dz = from.z - goal.z, length = Math.hypot(dx, dz) || 1;
    const hold = (e, out) => { e.state.pos.set(goal.x + dx / length * out, 0, goal.z + dz / length * out); e.state.speed = 0; };
    // the human far back (CTF: on its own flag) and the enemy bot pinned where it spawned: the hull alone at the goal
    if (own) pilot.state.pos.set(own.x, 0, own.z); else hold(pilot, 300);
    const enemyAt = { x: enemy.state.pos.x, z: enemy.state.pos.z };
    const step = (actor) => {
      const s = actor.authority;
      s.step({ dt: 1 / 60, inputs }); s.eventsForViewer('pilot'); s.afterEventBroadcast();
      s.entityById.get('pilot').state.speed = 0;
      const b = s.entityById.get('b-0'); b.state.pos.set(enemyAt.x, 0, enemyAt.z); b.state.speed = 0;
    };
    // the hull drives in: put it back inside the stage once a second when it leaves the band
    const keepInside = (e, seconds, actor) => {
      for (let s = 0; s < seconds; s++) {
        for (let k = 0; k < 60; k++) step(actor);
        const d = Math.hypot(e.state.pos.x - goal.x, e.state.pos.z - goal.z);
        if (d < band[0] || d > band[1]) hold(e, insideM);
      }
    };
    if (scenario === 'going') { hold(hull, insideM); keepInside(hull, waitS + 2, old); } else {
      for (let k = 0; k < 600; k++) { if (k % 60 === 0) hold(hull, outsideM); step(old); }
      hold(hull, insideM);
      if (scenario === 'waiting') keepInside(hull, 3, old);
    }
    // the keyframe, and the elected seat's resume from it (resumeStateFromRetained, applyResumeState)
    const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
    const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
    const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
      meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((e) => captureEntityRow(e, old.wireIdOf(e.id), era, tick)),
      shells: [], viewer: null, modeStateJson: null };
    const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing',
      modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame }));
    const { state } = resumeStateFromRetained(keyframe, 0, null, null, []);
    const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
    applyResumeState(fresh, state);
    // the stages as the keyframe carries them (CTF: objectives.raids; Frontline: waves.line.attack), and as the new host
    // holds them after the restore (its own capture, before it steps)
    const stagesOf = (mode_) => (mode === 'capture_the_flag' ? mode_?.objectives?.raids : mode_?.waves?.line?.attack) ?? null;
    const sealedStages = stagesOf(keyframe.modeCheckpoint.mode), restoredStages = stagesOf(fresh.authority.captureModeCheckpoint().mode);
    const entry = sealedStages?.find(([id]) => id === 'a-0')?.[1];
    const stage = !entry ? 'none' : 'go' in entry ? `staged at ${entry.atS.toFixed(2)}, ${entry.go ? 'going in' : 'waiting'}`
      : entry.pushing ? 'pushing' : entry.stagedAtS === null ? 'not staged' : `staged at ${entry.stagedAtS.toFixed(2)}, waiting`;
    fresh.authority.onMatchReady();
    const moved = fresh.authority.entityById.get('a-0');
    const fromGoal = (e) => Math.hypot((e._modeTargetX ?? NaN) - goal.x, (e._modeTargetZ ?? NaN) - goal.z);
    const atS = sim.timeS, routedAtKeyframe = fromGoal(hull);
    step(old); step(fresh);
    const firstPush = { old: fromGoal(hull), fresh: fromGoal(moved) };
    // on together until each host sends the hull in from its stage: the first route to the goal after one to the stage
    // (each host's mode clock is the old host's timeS)
    let oldHeld = firstPush.old > 1, newHeld = firstPush.fresh > 1, oldIn = null, newIn = null;
    for (let k = 0; k < (waitS + 4) * 60 && (oldIn === null || newIn === null); k++) {
      step(old); step(fresh);
      const o = fromGoal(hull), n = fromGoal(moved);
      if (o > 1) oldHeld = true; else if (oldHeld && oldIn === null && o < 1) oldIn = sim.timeS;
      if (n > 1) newHeld = true; else if (newHeld && newIn === null && n < 1) newIn = sim.timeS;
    }
    old.stop(); fresh.stop();
    return { atS, stage, restoredSame: JSON.stringify(restoredStages) === JSON.stringify(sealedStages), routedAtKeyframe, firstPush, oldIn, newIn };
  }
  const at = (t) => (t === null ? 'never' : `${t.toFixed(2)} s`);
  for (const c of modes) {
    const { mode, what, goalName } = c;
    const carried = (run, expect) => ok(expect.test(run.stage) && run.restoredSame, `${mode}: the keyframe carries the ${what}'s stage `
      + `(${run.stage}) and the new host restores it as sealed`);
    const going = migrateStage(c, 'going');
    ok(going.routedAtKeyframe < 1 && going.firstPush.old < 1, `${mode}: the case is built: at the keyframe (${going.atS.toFixed(2)} s) the old `
      + `host has its lone ${what} going in, past the wait at its stage`);
    carried(going, mode === 'capture_the_flag' ? /going in$/ : /^pushing$/);
    ok(going.firstPush.fresh < 1, `${mode}: going in: the new host's first route push sends its ${what} in, as the old host does `
      + `(routed ${going.firstPush.fresh.toFixed(0)} m from ${goalName}; it was staged afresh and held for the wait, or for one push)`);
    const waiting = migrateStage(c, 'waiting');
    ok(waiting.routedAtKeyframe > 1 && waiting.oldIn !== null && waiting.oldIn - waiting.atS > PUSH_S, `${mode}: the case is built: at the `
      + `keyframe (${waiting.atS.toFixed(2)} s) the old host holds its lone ${what} at the stage, and sends it in at ${at(waiting.oldIn)}`);
    carried(waiting, /waiting$/);
    ok(waiting.newIn !== null && Math.abs(waiting.newIn - waiting.oldIn) <= PUSH_S + 1 / 60, `${mode}: waiting: the new host sends its `
      + `${what} in within one route push of the old host (new host ${at(waiting.newIn)}; it went in alone before its wait was out, or `
      + 'waited a fresh one)');
    const fresh = migrateStage(c, 'fresh');
    ok(fresh.routedAtKeyframe < 1 && fresh.oldIn !== null && fresh.oldIn - fresh.atS > PUSH_S, `${mode}: the case is built: the ${what} `
      + `reached the stage after the old host's last push (${fresh.atS.toFixed(2)} s; still routed in from outside it), and the old host `
      + `holds it at its next push and sends it in at ${at(fresh.oldIn)}`);
    carried(fresh, /^(none|not staged)$/);
    ok(fresh.newIn !== null && Math.abs(fresh.newIn - fresh.oldIn) <= PUSH_S + 1 / 60, `${mode}: fresh: the new host's first push stages `
      + `its ${what} on the mode's clock, so it goes in within one route push of the old host (new host ${at(fresh.newIn)}; on clock 0 `
      + 'the stage read waited out)');
  }
}

if (failures) { console.error(`huntSearchMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('huntSearchMigration.selftest: hunters keep their leads and sweeps across a host migration (Horde and Infected), and raiders and attackers their stages (CTF and Frontline)');
