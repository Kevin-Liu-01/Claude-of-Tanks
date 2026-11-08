// 2026-11-02 audit M7 (round 6 V4, split off from ai.watchResume.selftest): the Watch hand-back's checks that repeat a
// check of ai.watchResume's at another length, height or branch, and the rules with no case there, in the MANUAL bots
// suite (tools/selftest-tiers.mjs). ai.watchResume read 7.8-10 s of user CPU in the default tier (round three's file
// 5.9 s); this file reads 4.0-4.3 s of user CPU at load 43-76 (fix-up r6; 4.4-7.5 s at load 70-160 in fix-up r4,
// 09654a0bb6's 5.6-6.1 s; the import 1.5-1.6 s of it), and runs when the owner names the suite. Of the round's 76
// mutants of ai.ts, 69 fail one of the two receipts, two of them this file alone (the obstacle list's branch; the walk's
// last point under a deck the field publishes), and every check here but the setups fails on one of them; seven fail
// neither (round 6 bots NOTES, fix-up r6). The sections keep ai.watchResume's numbers; their history is there.
// [7] (round 2; round 3, A2) a level route held through a park on its way: here the 30 s park off the way (its deadline
// not yet up) and the 0.1 s, 0.5 s and 2 s coasting toggles; the default keeps the 200 s parks (on and off the way, the
// one on it coasting from route speed) and the revive, and [8]'s toggles of a search leg.
// [11] (round 4, F5) a stretch is the hull's way only where it can drive to it: here the drop off the causeway's crest
// over the gun's 8 m band and a toggle on the crest; the default keeps the drop under the band (the round-four review's).
// [12] (round 5, U5 and its fix-up r1; round 6, V3) the elevation dwell's record rule (hullOnParkLevel): here off and onto
// a 2.2 m rock, the 1 m box read from the last obstacle list (a fixture's branch: every solo bot has the match's query),
// off a tiered rock's top and off its first tier, onto a three-tier rock's second tier, up a formation's caps, a 1 m
// box's top under a deck's end (fix-up r3; the default keeps the box's edge there, fix-up r4), and the walk's last point
// under a deck the field publishes (fix-up r2: its only case). The mutants of two parts of the rule fail only here (the
// obstacle list's branch, that last point), and seven readings of the ground under a deck fail neither file (round 6
// V4, fix-ups r1 to r6; ai.watchResume's header).
import { SIM_DT } from '../sim/movement.ts';
import {
  beside, coasted, column, compoundRecord, crestHandBack, crestLabel, dwellHandBack, dwellLabel, kept, levelRouteHandBack,
  levelRouteLabel, restarted, setupOk, where,
} from './ai.watchResume.test-support.mjs';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

console.log('[7] a level route ends with no verdict at a hand-back that finds the hull off its way, and holds while it is on it (the rest)');
// ai.watchResume [7]'s history. On dbdbfc2ad5 a hull handed back 270 m off drove the last route on from there; on
// 92f415e879 a 0.5 s toggle (6.5 m of coast) and a 2 s one (20 m) ended the route; a 0.1 s one coasts 1.4 m.
{
  const label = levelRouteLabel;
  const far = await levelRouteHandBack({ parkS: 30, far: true });
  ok(far.routing && far.before.routeOwner === 'level', `setup: the floor bot drives a level route to the deck (owner ${far.before.routeOwner})`);
  ok(far.after.unbearableVerdicts === far.before.unbearableVerdicts && !far.back.levelRouting && far.back.routeOwner !== 'level'
    && far.oldRouteTicks === 0,
    `a 30 s park in which the watcher drove 270 m off: the route ends with no verdict and is not driven on from there (${label(far)}; ${(far.oldRouteTicks * SIM_DT).toFixed(1)} s of it after)`);
  for (const parkS of [0.1, 0.5, 2]) {
    const toggled = await levelRouteHandBack({ parkS });
    ok(toggled.after.unbearableVerdicts === toggled.before.unbearableVerdicts && toggled.back.levelRouting
      && toggled.back.routeOwner === 'level' && toggled.after.levelRoutes === toggled.before.levelRoutes && toggled.oldRouteTicks > 400,
      `a ${parkS} s Take and Leave of the bot on its route: the hull coasts on along it and the route runs on (${coasted(toggled)}; ${label(toggled)})`);
  }
}

console.log('[11] a level route ends with no verdict when the watcher drives its hull off the road onto the level below, within reach of it (the rest)');
// ai.watchResume [11]'s history: here round four's first case, taken on the crest past z 45 and left on the floor beside
// it 12.9 m below the road (over the gun's band), and a toggle on the crest, which keeps the route.
{
  const label = crestLabel;
  const dropped = await crestHandBack({ parkS: 0.5, offTheSide: true, takeZ: 45 });
  ok(dropped.routing && dropped.onCrest && dropped.before.routeOwner === 'level' && dropped.dropM > 8,
    `setup: the floor bot drives its level route up the causeway's crest past z 45 (owner ${dropped.before.routeOwner}); the watcher leaves it ${dropped.dropM.toFixed(1)} m below the road`);
  ok(!dropped.back.levelRouting && dropped.back.routeOwner !== 'level'
    && dropped.after.unbearableVerdicts === dropped.before.unbearableVerdicts,
    `a 0.5 s Take and Leave in which the watcher drove off the crest onto the floor 11 m beside the road, ${dropped.dropM.toFixed(1)} m below it: the route ends at the hand-back with no verdict, then or before the road is planned again (${label(dropped)})`);
  ok(dropped.nextRouteAfterS !== null && dropped.nextRouteAfterS >= 6 - 0.05,
    `and the lock plans the road again from the floor (${dropped.nextRouteAfterS === null ? 'never' : `${dropped.nextRouteAfterS.toFixed(2)} s`} after the hand-back; ELEVATION_LOCK_S 6 s)`);
  const stayed = await crestHandBack({ parkS: 0.5, offTheSide: false });
  ok(stayed.back.levelRouting && stayed.back.routeOwner === 'level' && stayed.after.unbearableVerdicts === stayed.before.unbearableVerdicts
    && stayed.after.levelRoutes === stayed.before.levelRoutes,
    `a 0.5 s Take and Leave on the crest: the hull coasts on up the road on its level, and the route runs on to its end (coasted ${stayed.coastM.toFixed(1)} m; ${label(stayed)})`);
}

console.log('[12] the elevation lock\'s dwell after a park onto, off or between records: the record rule (the rest)');
// ai.watchResume [12]'s history and its record cases (which parts of the rule they reach: its [12] comment and header);
// here the same parts at another height, direction or branch, and the only case of the walk's last point under a deck
// the field publishes; the 1 m box read from the last obstacle list is the only case of that branch. On
// f60d0aa200 each restart below kept 2.9 s of dwell and the lock decided 3.15 s after Leave; on b03868e697 the one on a
// box under a deck's end did.
{
  const label = dwellLabel;
  // a 2.2 m rock's top and the ground beside it, either way (ai.watchResume's 1 m box, off and onto)
  const HIGH = Object.freeze({ min: [-10, 0, 18], max: [10, 2.2, 38] });
  const offHigh = await dwellHandBack((at) => [-13, at[2]], null, HIGH);
  ok(setupOk(offHigh, 2.2, 0), `setup: the floor bot dwells on a 2.2 m rock's top; the watcher leaves it on the ground beside the rock (${where(offHigh)})`);
  ok(restarted(offHigh),
    `a 0.5 s park that left the hull on the ground below the 2.2 m rock it was taken on: the dwell restarts (${label(offHigh)}; ELEVATION_LOCK_S 6 s)`);
  const ontoHigh = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoHigh, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's top (${where(ontoHigh)})`);
  ok(restarted(ontoHigh),
    `a 0.5 s park that left the hull on a 2.2 m rock beside the ground it was taken on: the dwell restarts (${label(ontoHigh)}; ELEVATION_LOCK_S 6 s)`);
  // round 6 (V3): ai.watchResume's 1 m box reads the records through the match's obstacle query; a fixture without one
  // reads the controller's last obstacle list (parkLevelSolids' other branch), to the same restart
  const ontoBoxList = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(1), { onY: null, awayY: 1, query: false });
  ok(setupOk(ontoBoxList, 0, 1), `setup: as the default receipt's 1 m box, with no obstacle query (${where(ontoBoxList)})`);
  ok(restarted(ontoBoxList),
    `a 0.5 s park that left the hull on a 1 m box, read from the last obstacle list: the dwell restarts (${label(ontoBoxList)})`);
  // fix-up r2 (the completeness review r2): ai.watchResume's tiered rock the other way, taken on its 1.3 m top (the tiers
  // nested columns from the ground, 0.7 m and 1.3 m), left on the ground beside it
  const tiers = compoundRecord([column(-10, 18, 10, 38, 0.7), column(-7, 21, 7, 35, 1.3)], 0, 1.3);
  const offTiers = await dwellHandBack((at) => [-13, at[2]], null, tiers, { onY: 1.3 });
  ok(setupOk(offTiers, 1.3, 0), `setup: the floor bot dwells on a two-tier rock's 1.3 m top; the watcher leaves it on the ground beside the rock (${where(offTiers)})`);
  ok(restarted(offTiers),
    `a 0.5 s park that left the hull on the ground below the tiered rock it was taken on: the dwell restarts (${label(offTiers)})`);
  // fix-up r3 (the completeness review r3, its B and C): ai.watchResume's lower tier (ontoLedge) the other way, taken on a
  // two-tier rock's 0.7 m first tier (its 1.3 m tier clear of the hull to the east), left on the ground beside it; and
  // onto a three-tier rock's 1.3 m second tier (0.7, 1.3 and 1.9 m), where the part's own top is neither the record's nor
  // the first tier's
  const ledge = compoundRecord([column(-10, 18, 10, 38, 0.7), column(4, 18, 10, 38, 1.3)], 0, 1.3);
  const offLedge = await dwellHandBack((at) => [-13, at[2]], null, ledge, { onY: 0.7 });
  ok(setupOk(offLedge, 0.7, 0), `setup: the floor bot dwells on a two-tier rock's 0.7 m first tier; the watcher leaves it on the ground beside the rock (${where(offLedge)})`);
  ok(restarted(offLedge),
    `a 0.5 s park that left the hull on the ground below the tiered rock's first tier it was taken on: the dwell restarts (${label(offLedge)})`);
  const threeTiers = compoundRecord([column(-40, 14, -8, 26, 0.7), column(-40, 14, -14, 26, 1.3), column(-40, 14, -30, 26, 1.9)],
    0, 1.9);
  const ontoMiddleTier = await dwellHandBack((at) => [at[0], 22], [-16, 31], threeTiers, { onY: null, awayY: 1.3 });
  ok(setupOk(ontoMiddleTier, 0, 1.3), `setup: the floor bot dwells on the ground; the watcher leaves it on a three-tier rock's 1.3 m second tier (${where(ontoMiddleTier)})`);
  ok(restarted(ontoMiddleTier),
    `a 0.5 s park that left the hull on a tiered rock's 1.3 m second tier: the dwell restarts (${label(ontoMiddleTier)})`);
  // fix-up r2 (the completeness review r2): a formation's blocks, each one part under its own drawn top (rockCollision.ts
  // applyFormationCollision), here two caps rising 0.4 per metre from z 26; ai.watchResume's roof is the drawn compound
  // part's default case
  const capTop = [-40, 26, 0, -0.4, 0];
  const caps = compoundRecord([column(-40, 10, -25, 26, 3, -0.5, capTop.slice()), column(-25, 10, -10, 26, 3, -0.5, capTop.slice())],
    -0.5, 3);
  const upCaps = await dwellHandBack((at) => [at[0], 22], [-16, 31], caps, { onY: null, awayY: 1.6 });
  ok(setupOk(upCaps, 0, 1.6), `setup: the floor bot dwells on the ground; the watcher leaves it 1.6 m up a formation's two drawn caps (${where(upCaps)})`);
  ok(kept(upCaps), `a 0.5 s park that left the hull up a formation's caps it drives down and back up: the dwell holds (${label(upCaps)})`);
  // fix-up r2 (the correctness review r2): the walk's last point reads the ground of the spot it arrives at, where it
  // stood under a deck the field publishes the bed under it (recordWalkReaches: b.ground; groundUnder, fix-up r3), not
  // the deck's top over it. Taken on the ground under a 4.5 m deck, 1 m inside its south end (the line runs out through
  // the end; hullReaches reads every point under a deck before the last as its top, so only a spot within one 1.5 m
  // point of the end is read stood put), left on a 0.5 m step outside it
  const DECK = Object.freeze([Object.freeze({ x: -22.7, z: 42.2, ux: 0, uz: 1, halfLength: 10, halfWidth: 6, deckY: 4.5, approachM: 0 })]);
  const underDeckEnd = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(0.5, -0.5), { onY: null, awayY: 0.5, decks: DECK });
  const [takenX, , takenZ] = underDeckEnd.parkedAt;
  ok(setupOk(underDeckEnd, 0, 0.5) && takenZ > DECK[0].z - DECK[0].halfLength && takenZ < DECK[0].z - DECK[0].halfLength + 1.5
    && Math.abs(takenX - DECK[0].x) < DECK[0].halfWidth,
    `setup: the floor bot dwells on the ground under a deck's end; the watcher leaves it on a 0.5 m step outside the deck (${where(underDeckEnd)})`);
  ok(kept(underDeckEnd),
    `a 0.5 s park that left the hull on a 0.5 m step beside the deck it was taken under: the dwell holds (${label(underDeckEnd)})`);
  // fix-up r3 (the correctness review r3; fix-up r2's probe P2): an end on a record's top under a deck the field
  // publishes. Taken on the ground, left on a 1 m box's top under a 4.5 m deck, 1 m inside its north end: endFloor read
  // the ground there as the hull's own height (the deck's top over it, clamped to the root), so the box's top was that
  // ground, both ends read their ground, and the dwell held (b03868e697 and 1cbcc1faaf: 2.9 -> 2.9 s, decided 3.15 s);
  // it reads the bed now (groundUnder), and the walk gets onto the box no more than without the deck
  const deckOverBox = Object.freeze([Object.freeze({ x: -22.7, z: 13, ux: 0, uz: 1, halfLength: 10, halfWidth: 6, deckY: 4.5, approachM: 0 })]);
  const underDeckBox = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(1), { onY: null, awayY: 1, decks: deckOverBox });
  const [boxX, , boxZ] = underDeckBox.handedBackAt, [box] = deckOverBox;
  ok(setupOk(underDeckBox, 0, 1) && boxZ < box.z + box.halfLength && boxZ > box.z + box.halfLength - 1.5
    && Math.abs(boxX - box.x) < box.halfWidth,
    `setup: the floor bot dwells on the ground; the watcher leaves it on a 1 m box's top under a deck's end (${where(underDeckBox)})`);
  ok(restarted(underDeckBox),
    `a 0.5 s park that left the hull on a 1 m box under a deck, past the 0.55 m step it mounts: the dwell restarts (${label(underDeckBox)})`);
}

if (failures) { console.error(`ai.watchResumeLevels.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResumeLevels.selftest: a parked brain resumes from the hull as it stands, on every level');
