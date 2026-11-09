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

if (failures) { console.error(`huntSearchMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('huntSearchMigration.selftest: hunters keep their leads and sweeps across a host migration (Horde and Infected)');
