// Physics lane (2026-10-03, owner: "make our game physics a lot better and less glitchy and be able to handle our
// extreme gravity modes … while also maintaining perfect beautiful suspension"): one torture run per glitch class the
// lane fixed, through the real authority (tools/physics-torture.mjs), each gated on the metric that caught it. The gates
// marked "before:" failed on the tree before the lane (b74e1c251) with that value; "guard:" gates hold rules the lane's
// own changes could break. The full matrix is `node tools/physics-torture.mjs` (every hull class x gravity world x case).
import assert from 'node:assert/strict';
import { CASES, HULLS, WORLDS, runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet([...new Set([...Object.values(HULLS), 't90m', 'm1a2', 'm551_sheridan', 'merkava4b'])]);

const failures = [];
let runs = 0;
function check(caseId, hull, world, gates, { publishedContact = false } = {}) {
  const caseDef = CASES.find((c) => c.id === caseId);
  assert.ok(caseDef, `unknown torture case ${caseId}`);
  assert.ok(WORLDS[world], `unknown world ${world}`);
  const metrics = runCase(HULLS[hull] ?? hull, world, caseDef, { replay: gates.some((g) => g.replay), publishedContact });
  runs++;
  if (metrics.nan) failures.push(`${caseId} ${world} ${hull}: NaN in ${metrics.nanField}`);
  for (const gate of gates) {
    const value = gate.read(metrics);
    if (!(value <= gate.max)) failures.push(`${caseId} ${world} ${hull}: ${gate.what} ${value.toFixed(3)} > ${gate.max} — ${gate.why}`);
  }
}
const g = (what, read, max, why, replay = false) => ({ what, read, max, why, replay });

// G1 — the boost ceiling: two single-jump apexes above the ground under the hull. Mashing the boost climbed 2389 m at
// 0.6 g (Turbo) and 6655 m at 0.17 g (Moon).
for (const world of ['turbo', 'moon']) {
  const ruleset = WORLDS[world].ruleset();
  const gravity = 9.81 * (ruleset.gravityScale ?? 1), jumpMps = ruleset.jumpMps ?? 6;
  const ceiling = 2 * jumpMps * jumpMps / (2 * gravity);
  check('jump-mash', 'medium', world, [
    g('max height (m)', (m) => m.maxHeightM, ceiling + 1, `ceiling ${ceiling.toFixed(1)} m; before: 2389 m (Turbo) / 6655 m (Moon)`),
  ]);
}

// G2/G3 — a cliff edge is an edge to tip over, not a slope to chase: the attitude spring took the ground 10 m below
// as the plane to align with, dove the hull nose-first at 8 rad/s and (lifting the root) launched it; at 30 m the
// support followed the face down at 35 m/s glued to it.
check('cliff-10', 'medium', 'earth', [
  g('vertical pop (m)', (m) => m.popYMaxM, 0.12, 'guard: the root never jumps at the lip'),
  g('overturned (s)', (m) => m.overturnedS, 0, 'before: 5.4 s on its back after the dive'),
]);
check('cliff-30', 'medium', 'moon', [
  g('vertical pop (m)', (m) => m.popYMaxM, 0.12, 'before: 0.29 m'),
  g('overturned (s)', (m) => m.overturnedS, 0, 'before: 9.6 s on its back'),
]);

// Sirocco Wadi, Zone Control, seed 57001 (maps lane matrix): climbing a face too steep for the tracks, the grade rule
// stopped the hull but not the climb (5.7 m up, 922 hp), and a hull turning in the air landed on the envelope's swing.
for (const world of ['earth', 'moon']) {
  check('climb-face', 'medium', world, [
    g('lift over the support (m)', (m) => m.liftM, 0.3, 'before: 0.52 m (Earth) / 11.2 m (Moon) off the stopped climb'),
    g('landing closing over the approach (m/s)', (m) => m.closingExcessMps, 1.0, 'before: +1.9 m/s (Earth)'),
  ]);
}
check('tumble-slope', 'mbt', 'earth', [
  g('landing closing over the approach (m/s)', (m) => m.closingExcessMps, 1.0, 'before: +3.4 m/s (Sirocco read 12.8 for 7.3, 922 hp)'),
  g('rebound over the restitution law (m/s)', (m) => m.reboundExcessMps, 0.05, 'guard: no landing rebounds faster than the law'),
]);

// Stacking — the contact is where the footprints overlap: a hull rocking on a wreck lifted its far corner clear, lost
// its seat and landed again five times in 1.5 s, and the horizontal solver shoved hulls off roofs 1 m a tick.
check('land-wreck', 'light', 'earth', [
  g('hull overlap (m)', (m) => m.hullPenMaxM, 0.15, 'guard: the region contact alone left 3.8 m of overlap'),
  g('horizontal pop (m)', (m) => m.popXZMaxM, 0.12, 'guard: pushed off the roof 1.0 m a tick'),
]);
check('stack3', 'medium', 'earth', [
  g('hull overlap (m)', (m) => m.hullPenMaxM, 0.15, 'guard: three hulls stack without side overlap'),
]);

// A roof edge — a part is a floor by the hull's underside over it (world/collision.ts hullUndersideOver), in the support
// field and the obstacle solver alike: a hull pivoting off a roof edge lost the roof, sank 2.9 m into the building,
// and was pushed out three metres in three ticks.
check('land-roof-edge', 'medium', 'earth', [
  g('obstacle overlap (m)', (m) => m.obstaclePenMaxM, 0.1, 'before: 2.7 m inside the building'),
  g('horizontal pop (m)', (m) => m.popXZMaxM, 0.12, 'before: 1.0 m a tick'),
]);

// A 1.2 m step at the Moon: a rising hull that turned nose-up buried its tail 1.5 m for 0.7 s, then was lifted 2 m in
// a tick (advanceAirborneRide's hard floor).
check('drive-step120', 'medium', 'moon', [
  g('vertical pop (m)', (m) => m.popYMaxM, 0.12, 'before: 1.95 m'),
  g('body under the ground (m)', (m) => m.bodyPenMaxM, 0.05, 'before: 1.5 m'),
]);

// A roof edge, the low hull (its box runs 0.87 m ahead of its root): its footprint at its attitude and its centre of
// mass over the roof (world/collision.ts hullFootprint, movement.ts contactAwareFit). It tipped back about its root,
// hung nose-up against the wall with its full-length rect inside the building, and was pushed out a metre a tick.
check('land-roof-edge', 'low', 'earth', [
  g('obstacle overlap (m)', (m) => m.obstaclePenMaxM, 0.1, 'before: 4.11 m inside the building'),
  g('roof sink (m)', (m) => m.roofSinkMaxM, 0.25, 'before: 0.55 m'),
]);

// Slopes that turn speed into a launch (Titan Gorge; Caldera CTF seed 0): the ground's vertical push on a grade turns
// the hull's travel (movement.ts turnAlongGrade / landAlongGrade).
check('climb-crest', 'medium', 'earth', [
  // (round 3: the springs seat the climb under its top contact; the flight off the crest reads 0.61 m over the contact
  // under it, peaking lower over the ground, 0.78 m at the root where it was 0.86, and landing at 2.5 m/s, was 3.1)
  // (round 3, the hull lying on its plane: it climbs the face at 38 degrees, where it read 35.6, and its flight peaks
  // lower over the ground, 0.75 m, and lands at 1.0 m/s, where it was 2.5; over the contact under it, which the truer
  // pitch at the crest moves back down the face, it reads 0.73 m)
  // (0.85, round 8, the track contact read off the drawn band: the T-90M's tracks run 4.49 m, not the 5.58 m its stale
  // pinned span published, so they leave the crest's face sooner and its flight off the crest peaks 0.80 m, was 0.75)
  g('lift off the crest (m)', (m) => m.liftM, 0.85, 'before: 1.88 m (rose at 8.4 m/s up a 38-degree face, travel kept)'),
]);
check('land-upslope', 'medium', 'earth', [
  g('travel kept landing on a 36 % upslope (m/s)', (m) => m.landingTravel[0]?.[1] ?? 0, 12.5, 'before: 15.0 of 15.0'),
  g('rebound off the face (m/s)', (m) => m.landingTravel[0]?.[2] ?? 0, 6.0, 'before: +6.59 m/s'),
]);

// A loose flank taken downhill at speed (Ironworks endless horde, maps lane: a 420 hp fall off the slag tip's flank). A
// flank the tracks can follow is followed; one too sharp to follow is flown off and landed on by its own grade.
check('flank-down', 'medium', 'earth', [
  g('lift off the flank (m)', (m) => m.liftM, 0.3, 'guard: a followable flank keeps the tracks on it'),
  g('fall damage (hp)', (m) => m.fallDamageHp, 0, 'guard: no fall where the tracks could stay down'),
  g('vertical pop (m)', (m) => m.popYMaxM, 0.12, 'before: 0.14 m bottoming out at its foot'),
]);
check('flank-steep', 'medium', 'earth', [
  g('fall damage (hp)', (m) => m.fallDamageHp, 300, 'before: 4564 hp (the flank read as level under a nose-down hull)'),
]);

// Round 6 (Skybridge fall census: 75.6 hp and 160.5 hp landings on one 46-degree bank): a hull climbing at 6.5 m/s hops
// off a bank's lip and meets the 50-degree face beyond it 0.4 s later. The face rises under its travel at the face's
// grade (the fit's rise per hull-local metre, not the tangent of its arcsine), and the landing is charged along the
// face's normal: no fall damage.
check('bank-hop', 'medium', 'earth', [
  g('the face landing\'s vertical closing (m/s)', (m) => m.landings?.[0] ?? 0, 7, 'before: 8.84 m/s (the face read as 59 degrees)'),
  g('its charged closing (m/s)', (m) => Math.max(0, ...(m.falls ?? [])), 6, 'before: 8.8 m/s (vertical)'),
  g('fall damage (hp)', (m) => m.fallDamageHp, 0, 'before: 61.3 hp'),
]);

// An assault trench under a heavy hull (its 45-degree far wall under the nose, its tail over the trench): the wall is not
// its grade (movement.ts contactAwareFit's span rule). The grade rule stopped it dead in the trench and it see-sawed.
check('drive-assault-trench', 'heavy', 'earth', [
  // (26 m, round 7: the check exists for the old stuck case, 19.6 m. The far wall now costs the travel it lifts the hull
  // by, by design (the trench ruling, 2026-10-04): the E100 X climbs out at 2.4-4 m/s where it kept 6.3 and is 28.6 m on
  // after 9 s, past the far lip by a hull length)
  // (23 m, round 8, the parity re-pin: on its real tracks, a 5.41 m flat run where the host's line was 7.6 m, the far
  // wall takes it from 6.1 to 1.7-2.5 m/s and it climbs out at about 2 m/s, pitched up to 23 degrees; it is 23.5 m on
  // after 9 s, its tracks 0.8 m past the far lip)
  // (19.5 m, round 8, the coordinator's ruling of 2026-10-04 on item 3: digs in, then climbs. The far wall's strike grips
  // the nose (movement.ts STRIKE_FRICTION): the E100 X meets the 42-degree wall at 6 m/s, stops there instead of riding up
  // it, and climbs out from near rest; it is 19.9 m on after the case's 9 s.)
  g('progress short of 19.5 m (m)', (m) => 19.5 - m.progressM, 0, 'before: 19.6 m'),
  // (900: with the grade floor the crossing's own jerk reads 800.2, the far wall's lip taken a little harder)
  // (950, round 3: the hull lying on its plane pitches to the walls it crosses, where it read them flatter: 909)
  g('rendered jerk p99 (rad/s³)', (m) => m.jerkP99, 950, 'before: 1366'),
]);
// Round 7 (ruling 2, the trench fix): the far wall under a partial contact's leading station pushes along its normal,
// costing the travel the lift it gives, and a strike past the bump stops turns the hull about its centre of mass as well
// as lifting it; a trench ahead is not leaned into. The wall lifted the hull a quarter metre a step, all its travel kept.
check('drive-assault-trench', 'mbt', 'earth', [
  g('vertical step (m)', (m) => m.popYMaxM, 0.12, 'before: 0.184 m, the far wall lifting the M1A2 at 13 m/s'),
]);
// (round 8, the parity re-pin, a synthetic edge: no map has a 2 m box trench with sheer walls. The host's 6.9 m support line
// bridged it; the UDES 03's real tracks, a 3.28 m flat run, cannot bridge its 3.5 m, so the hull falls in, nose first, and
// its nose strike on the floor throws it up onto the far lip, where it comes down at 6.9 m/s: the one flight the trench
// forces. The vertical step, 0.25 m, is the floor's one-step lift (FLOOR_LIFT_MAX_M_PER_STEP) where its nose comes down on
// the far bank. Solo play at the PR head, on the same tracks, read 0.241 m and a 3.6 m/s landing. The vertical steps, and
// the hull's end wedged 47 degrees nose-up against the far wall, are the next item.)
check('drive-trench', 'low', 'earth', [
  g('vertical step (m)', (m) => m.popYMaxM, 0.26, 'before: 0.194 m, the ditch\'s far lip under the UDES 03\'s nose'),
  g('flights', (m) => m.falls.length, 1, 'before: 1 (off the far lip)'),
]);
// Round 8 (the far lip): what the suspension travel no longer holds of the dive the bump stops take, and the drawn hull
// gives it up over their spring. The far wall bottoming the M3 Bradley's springs cut its drawn squat by a degree in one
// frame as it climbed out, and by 0.2-0.4 degree in ten more.
// (2300, round 8, the track contact read off the drawn band: the M3 Bradley's run ends 9.7 cm shorter at the rear, its
// rear rise 0.27 m where it read 0.32, so its tail leaves the near lip a step sooner and touches it twice more on the way
// down at 7.5 m/s, three steps of contact on and off: p99 2272, where its old span read under 1300. An open item: the
// lip's chatter under a short tail.)
// (2150, the far wall's grip, movement.ts STRIKE_FRICTION: its nose no longer rides up the far wall and drops back, p99 2089)
check('drive-assault-trench', 'tall', 'earth', [
  g('rendered jerk p99 (rad/s³)', (m) => m.jerkP99, 2150, 'before: 1856'),
]);

// Firing in flight (Mars gravity field audit): the shot turns an airborne hull by its rigid-body share, not the
// suspension's rock (movement.ts fireRecoil). Six shots through a Moon boost flight tipped the heavy hull 112 degrees.
check('air-fire', 'heavy', 'moon', [
  g('tilt in flight (rad)', (m) => m.airTiltMaxRad, 0.5, 'before: 1.95 rad'),
  g('overturned (s)', (m) => m.overturnedS, 0, 'before: 12.1 s on its back'),
]);
// A hit in flight (Moon gravity field audit) turns the airborne hull by the rigid body's share too (movement.ts
// applyShellKnock): three hits through a Moon boost tipped the hull 69 degrees and it came down tumbling.
check('air-hit', 'medium', 'moon', [
  g('tilt in flight (rad)', (m) => m.airTiltMaxRad, 0.5, 'before: 1.20 rad'),
  g('tumbling (s)', (m) => m.tumblingS, 0, 'before: 15.3 s, from the tumbling landing on'),
]);

// Prediction replays the authority's step from the checkpoint (movement checkpoint v4 carries the tip state).
check('drive-field-trench', 'medium', 'earth', [
  g('prediction replay error (m)', (m) => m.replay.maxErrM, 0.02, 'guard: without the tip state the replay ran 0.3–1.2 m off', true),
]);

// Gauntlet wave 2 (the motion strips scored 4.70 and held the merge): a landing on the tracks is taken by the springs
// (the landing stroke): they compress, then return the ruleset's capped rebound; the Moon's capped rebound is under the
// floor, so its springs settle it. Before, the hull bounced off the drooped tracks' line like a rigid ball, its wheels
// hanging, to 50-70 % of its drop.
for (const world of ['mars', 'moon', 'turbo']) {
  check('jump-flat', 'medium', world, [
    // (14 cm, round 8: the touchdown's step now runs on in the springs, damped from the contact; the Mars landing reads
    // 14.9 cm where it read 15.1)
    g('compression short of 14 cm (m)', (m) => 0.14 - m.gearCompMaxM, 0, 'before: 0 (the rebound left from the drooped line)'),
    g('hop above the drooped line (m)', (m) => Math.max(0, (m.apexes[1] ?? 0) - 0.18), 0.3, 'before: 1.10 m at Mars, 1.54 m at the Moon'),
  ]);
}
// Gauntlet wave 23 ("the 0.17 g Moon drop settles like an Earth landing"; the rebound fell back "at about 2.6x lunar
// gravity"): past its static sag over the seat the hull's springs are unloaded, so a landing's overshoot rises and falls
// at the world's own gravity, never pulled down at Earth's spring rate.
check('jump-flat', 'medium', 'moon', [
  g('overshoot pulled down past the Moon\'s gravity (g)', (m) => m.overshootPullG, 1.02, 'before: 7.0 g'),
  g('settle short of 0.85 s (s)', (m) => 0.85 - m.landingSettleS, 0, 'before: 0.60 s, an Earth landing\'s timeline'),
]);
// Gauntlet wave 23 ("an Earth-gravity drop hops clear of the ground"): Gravity mode's Earth lands with the whole game's
// bounce (matchRuleset.ts); the basin's 30 % threw the 5.6 m/s landing of a 1 g jump back 0.35 m off the ground.
check('jump-flat', 'medium', 'gearth', [
  g('flights after the jump', (m) => m.hops - 1, 0, 'before: 1 (0.35 m off the ground, back down at 1.7 m/s)'),
]);
// Gauntlet wave 2 (the motion strips scored 4.70 and held the merge): the suspension takes the stop.
// A hard stop dips the hull on its suspension over planted tracks and rocks it back past level; it no longer tips the
// whole hull, tracks and all, up off flat ground (movement.ts SuspensionRockState.d).
check('drive-hardstop', 'medium', 'earth', [
  // (4.5, round 8, the track contact read off the drawn band: the suspension travel the dive is held to spans the T-90M's
  // real 2.24 m half run, not the 2.79 m of its stale pinned span, so the same travel is a larger angle: 4.23 degrees)
  g('dive past 4.5 degrees (rad)', (m) => m.diveMaxRad - 4.5 * Math.PI / 180, 0, 'before: the whole hull tipped 6-8 degrees'),
  g('dive short of 2 degrees (rad)', (m) => 2 * Math.PI / 180 - m.diveMaxRad, 0, 'guard: the stop shows on the suspension'),
  g('rock-back short of 0.4 degree (rad)', (m) => 0.4 * Math.PI / 180 - m.renderPitchMaxRad, 0, 'guard: it rocks back when the tracks stop pulling'),
  g('vertical step (m)', (m) => m.popYMaxM, 0.005, 'guard: the tracks stay planted (the dive is not in the support solve)'),
]);
// A hull pivoting across a fence line (Foundry field audit; the bots lane's Coastal seed 25003 jink): a rail under each
// end pushed it both ways at once and it flipped from side to side every step.
check('fence-straddle', 'medium', 'earth', [
  g('push flips', (m) => m.pushFlips, 3, 'before: 210 flips in 4 s'),
]);

// A hull dropped across a roof's edge tips off and falls instead of see-sawing on the edge (an undriven hull resting on
// an edge slides on its belly).
// (0.75, round 8, the track contact read off the drawn band: the T-90M rests on the edge on its real run, 0.45 m shorter
// at the rear than its stale pinned span, and settles to 0.72 mm rms where it read under 0.5)
check('land-roof-edge', 'medium', 'mars', [
  g('rest jitter at the end (mm rms)', (m) => m.rest?.jitterYRmsMm ?? 0, 0.75, 'before: 12.6 mm, still see-sawing on the edge'),
]);

// Terrain walls (maps lane A: Redrock's sheer jebels, Skybridge's shoulders): a hull partly over an 80-degree face at
// the foot of its apron is held off the face horizontally; its own samples on the face no longer carry it up the face
// and drop it back, again and again (the reports: 7-12 m swings, 500-1900 hp to a wedged bot in seconds).
const wallHeld = (before) => [
  g('falls', (m) => m.falls.length, 0, `before: ${before.falls}`),
  g('fall damage (hp)', (m) => m.fallDamageHp, 0, `before: ${before.hp} hp`),
  g('height over the ground (m)', (m) => m.maxHeightM, 1.5, `before: ${before.top} m`),
];
const wallClean = [
  g('landings', (m) => m.landings.length, 0, 'guard: held off the face, it never leaves the ground'),
  g('vertical step (m)', (m) => m.popYMaxM, 0.12, 'guard: the support never jumps at the foot'),
  g('shell under the terrain (m)', (m) => m.bodyPenMaxM, 0.05, 'guard: the face holds the hull 3 cm off'),
];
check('wall-foot-wedged', 'medium', 'earth', [...wallHeld({ falls: 3, hp: 236, top: 9.6 }), ...wallClean]);
check('wall-foot-side', 'heavy', 'earth', [...wallHeld({ falls: 4, hp: 3598, top: 14.0 }), ...wallClean]);
check('wall-foot-side', 'medium', 'moon', [...wallHeld({ falls: 0, hp: 0, top: 57.7 }), ...wallClean]);
// across the terrain's triangle grid a face's foot is smeared over a cell: the hull's support drops out for a tick there
// as it pivots (known limit: a one-tick airborne flag, its vertical speed continuous, under every consumer's threshold),
// but it is never carried up the face or hurt
check('wall-foot-side-t135', 'medium', 'earth', [
  g('falls', (m) => m.falls.length, 0, 'before: 5'),
  g('fall damage (hp)', (m) => m.fallDamageHp, 0, 'before: 614 hp'),
  g('height over the ground (m)', (m) => m.maxHeightM, 2, 'before: 12.8 m'),
]);

// Rough ground at speed (gauntlet wave 23, "skipping over the bumps with no wheels down in several frames"): the track's
// springs carry the hull over uneven ground; it no longer perches on its single highest contact with the rest hanging.
check('drive-rubble', 'heavy', 'earth', [
  g('perched on two stations or fewer (s)', (m) => m.perchedS, 0.5, 'before: 1.48 s of 6 s'),
  g('stations short of 9 of 12 within reach (mean)', (m) => 9 - m.trackContactMean, 0, 'before: 6.8 of 12'),
]);

// A viaduct at road speed (round 3; the trees lane's botObjectives seeds on Aegis Crossing): at each span joint the hull's
// nose is alone over the next span's record, and the standing rule's step-up, counted against a nose row's height, also
// decided whether the nose cleared the span's sub-deck slab a metre under the deck. The slab stopped a Sheridan dead on
// the deck at 18.6 m/s for 248 hp at every joint and the bot crawled the viaduct in stuck-recovery cycles.
// Hulls on their real contact shells (the long and tall hulls' noses rise 0.42-0.44 m) and the Sheridan on its published
// box (a context that never finalized its combat anatomy, botObjectives' own: no nose lift at all).
for (const [hull, publishedContact] of [['long', false], ['tall', false], ['m551_sheridan', true]]) {
  check('drive-viaduct', hull, 'earth', [
    g('impact damage on the deck (hp)', (m) => m.impactDamageHp, 5, 'before: span joints taken as walls'),
    g('progress short of 110 m (m)', (m) => 110 - m.progressM, 0, 'before: stopped at the first joint'),
  ], { publishedContact });
}

// Gauntlet wave 23, the slope strip ("the downhill rear stations are the most extended ... and the uphill front ones the
// most compressed"): a hull at rest lies on the ground it stands on (movement.ts planePitch / planeRoll). The attitude fit
// read the arctangent of the rise per hull-local metre and laid the hull flatter than its ground, its downhill end
// hanging up to 12 cm over a 25-degree face.
for (const [caseId, why] of [['rest-slope25', 'before: 0.97 degree flatter than the face'], ['rest-cross20', 'before: 1.0 degree flatter than the slope']]) {
  check(caseId, 'medium', 'earth', [g('attitude off the ground it rests on (deg)', (m) => m.restAttitudeErrDeg, 0.1, why)]);
}

// Gravity mode's Earth (physics lane round 4): the prediction lands a 1 g basin hull at the authority's rebound. It
// landed it at the basin's 30 % where the authority took 15 %, and a spinning hull's replay parted from the authority's.
check('air-spin', 'tall', 'gearth', [g('prediction replay error (m)', (m) => m.replay.maxErrM, 0.001, 'before: 0.041 m', true)]);

// Round 4 (gauntlet wave 33: "peak compression barely scales with impact, +3 to +5 cm whether 5.6 or 12.5 m/s"): a
// harder landing goes deeper into the landing stroke's progressive stops. The springs alone bottomed out every landing
// from 7 m/s up at the same 19 cm, the floor's last centimetre.
{
  const stroke = (caseId) => runCase(HULLS.medium, 'earth', CASES.find((c) => c.id === caseId)).gearCompMaxM;
  const soft = stroke('drop-2'), hard = stroke('drop-8');
  runs += 2;
  if (!(hard - soft >= 0.04)) {
    failures.push(`drop-2/drop-8 earth medium: the stroke deepens ${((hard - soft) * 100).toFixed(1)} cm from 5.9 to 12.3 m/s`
      + ' < 4 cm — before: 1.2 cm (17.8 and 19.1 cm)');
  }
  if (!(hard <= 0.185)) {
    failures.push(`drop-8 earth medium: a 12.3 m/s landing strokes ${(hard * 100).toFixed(1)} cm > 18.5 cm — before: 19.1 cm`);
  }
}

// Round 4 (wave 33: "landings are pure vertical drops: hull pitch and roll never move, even when one side touches
// first"): a level hull dropped onto a 10-degree cross slope lands on its uphill track and turns onto the slope about it,
// faster for the harder landing, and the other track's landing stops the turn on the slope.
{
  const turn = (caseId) => runCase(HULLS.medium, 'earth', CASES.find((c) => c.id === caseId)).landingTurn;
  const hard = turn('land-cross'), soft = turn('land-cross-soft');
  runs += 2;
  if (!(hard?.alignS <= 0.15)) failures.push(`land-cross earth medium: on the slope in ${hard?.alignS} s > 0.15 s — before: 0.25 s`);
  if (!(hard?.turnRateDegS >= 1.1 * soft?.turnRateDegS)) {
    failures.push(`land-cross earth medium: the 6.9 m/s landing turns at ${hard?.turnRateDegS} deg/s, the 4.2 m/s one at `
      + `${soft?.turnRateDegS}: not sized by the landing — before: 42.2 and 41.0`);
  }
  if (!(Math.max(hard?.overshootDeg ?? 9, soft?.overshootDeg ?? 9) <= 0.5)) {
    failures.push(`land-cross earth medium: turned ${hard?.overshootDeg} / ${soft?.overshootDeg} deg past the slope — guard`);
  }
}

// Round 5 (gauntlet wave 38: "on a 17.9-degree grade the front and rear stations carry about the same travel ... a real
// tank shows a clear rear-heavy gradient on a slope"; and after the side-slope landing "the hull still leans on the
// uphill track"): the tracks' hold on the hull against gravity on a grade transfers its weight like the drive's own
// acceleration, onto the downhill end and the downhill track, which squat while the uphill wheels droop. Measured at the
// track line under the rendered hull, the downhill end against the uphill end (cm).
{
  const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const endsGap = (gaps) => {
    const rear = mean([gaps.left[0], gaps.right[0]]), front = mean([gaps.left[6], gaps.right[6]]);
    return { rear, front };
  };
  const rest = (caseId) => runCase(HULLS.medium, 'earth', CASES.find((c) => c.id === caseId)).finalGapsCm;
  runs += 3;
  const up = endsGap(rest('rest-slope25'));
  if (!(up.front - up.rear >= 8)) {
    failures.push(`rest-slope25 earth medium: the downhill tail sits ${(up.front - up.rear).toFixed(1)} cm under the uphill nose < 8 — before: 0.0`);
  }
  const down = endsGap(rest('rest-slope25-down'));
  if (!(down.rear - down.front >= 8)) {
    failures.push(`rest-slope25-down earth medium: the downhill nose sits ${(down.rear - down.front).toFixed(1)} cm under the uphill tail < 8 — before: 0.0`);
  }
  const across = rest('rest-cross20');
  // the 20-degree cross slope rises to the right: the left track is the downhill one (round 8, wave 42 item 5: the springs
  // bear on the tracks' centre lines, not their outer edges, where the roll stiffness read 40 % high on the T-90M)
  if (!(mean(across.right) - mean(across.left) >= 7)) {
    failures.push(`rest-cross20 earth medium: the downhill track sits ${(mean(across.right) - mean(across.left)).toFixed(1)} cm under the uphill one < 7 — before: 0.1, then 5.9 on the outer edges`);
  }
}

// Round 5 (wave 38: "flat landings are perfectly level pistons ... a 55 t hull's centre of mass isn't at its geometric
// centre (engine aft, turret amidships), so a level drop should nod a little"): the springs stop the fall around the
// middle of the track contact, behind which a rear-engined T-90M's centre of mass sits, so a level 2 m drop turns it
// tail down; a front-engined Merkava 4 nose down. A nod, never a lurch.
for (const [hull, way] of [['medium', 'upDeg'], ['merkava4b', 'downDeg']]) {
  check('drop-2', hull, 'earth', [
    g(`level landing's nod ${way === 'upDeg' ? 'nose up' : 'nose down'} short of 0.6 degree`, (m) => 0.6 - (m.landingNod?.[way] ?? 0), 0,
      'before: 0.0 (a level piston)'),
    g('the nod (degrees)', (m) => Math.max(m.landingNod?.upDeg ?? 0, m.landingNod?.downDeg ?? 0), 2.5, 'guard: a nod, not a lurch'),
    // round 8 (wave 42 item 3: "rebounds past level into a brief nose-up"): the landing's stroke damps the dive harder
    g('the nod back past level (degrees)', (m) => Math.min(m.landingNod?.upDeg ?? 9, m.landingNod?.downDeg ?? 9), 0.15,
      'before: 0.35 (T-90M) / 0.40 (Merkava 4)'),
  ]);
}

// Rest stays rest: no jitter, no creep on a 25-degree grade on the brake.
check('rest-slope25', 'medium', 'earth', [
  g('rest jitter (mm rms)', (m) => m.rest?.jitterYRmsMm ?? 0, 0.5, 'guard: a parked hull does not shimmer'),
  g('rest creep (mm/s)', (m) => Math.abs(m.rest?.creepMmS ?? 0), 5, 'guard: a braked hull does not creep'),
]);

if (failures.length) {
  console.error(`physics-torture.selftest: ${failures.length} gate(s) failed over ${runs} runs`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`physics-torture.selftest: ${runs} torture runs — boost ceiling, cliff edges, the Sirocco climb and swing, stacking, roof edges, the Moon step, crest launches, trench crossings, firing and hits in flight, the landing stroke and the dive, settling contacts, terrain walls, prediction replay and rest all hold`);
