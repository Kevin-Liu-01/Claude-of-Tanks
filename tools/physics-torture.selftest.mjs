// Physics lane (2026-10-03, owner: "make our game physics a lot better and less glitchy and be able to handle our
// extreme gravity modes … while also maintaining perfect beautiful suspension"): one torture run per glitch class the
// lane fixed, through the real authority (tools/physics-torture.mjs), each gated on the metric that caught it. The gates
// marked "before:" failed on the tree before the lane (b74e1c251) with that value; "guard:" gates hold rules the lane's
// own changes could break. The full matrix is `node tools/physics-torture.mjs` (every hull class x gravity world x case).
import assert from 'node:assert/strict';
import { CASES, HULLS, WORLDS, runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet([...new Set([...Object.values(HULLS), 't90m', 'm1a2', 'm551_sheridan'])]);

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
  g('lift off the crest (m)', (m) => m.liftM, 0.65, 'before: 1.88 m (rose at 8.4 m/s up a 38-degree face, travel kept)'),
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

// An assault trench under a heavy hull (its 45-degree far wall under the nose, its tail over the trench): the wall is not
// its grade (movement.ts contactAwareFit's span rule). The grade rule stopped it dead in the trench and it see-sawed.
check('drive-assault-trench', 'heavy', 'earth', [
  g('progress short of 30 m (m)', (m) => 30 - m.progressM, 0, 'before: 19.6 m'),
  // (900: with the grade floor the crossing's own jerk reads 800.2, the far wall's lip taken a little harder)
  g('rendered jerk p99 (rad/s³)', (m) => m.jerkP99, 900, 'before: 1366'),
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
    g('compression short of 15 cm (m)', (m) => 0.15 - m.gearCompMaxM, 0, 'before: 0 (the rebound left from the drooped line)'),
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
  g('dive past 4 degrees (rad)', (m) => m.diveMaxRad - 4 * Math.PI / 180, 0, 'before: the whole hull tipped 6-8 degrees'),
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
check('land-roof-edge', 'medium', 'mars', [
  g('rest jitter at the end (mm rms)', (m) => m.rest?.jitterYRmsMm ?? 0, 0.5, 'before: 12.6 mm, still see-sawing on the edge'),
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
