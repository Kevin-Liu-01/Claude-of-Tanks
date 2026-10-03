// Physics lane (2026-10-03, owner: "make our game physics a lot better and less glitchy and be able to handle our
// extreme gravity modes … while also maintaining perfect beautiful suspension"): one torture run per glitch class the
// lane fixed, through the real authority (tools/physics-torture.mjs), each gated on the metric that caught it. The gates
// marked "before:" failed on the tree before the lane (b74e1c251) with that value; "guard:" gates hold rules the lane's
// own changes could break. The full matrix is `node tools/physics-torture.mjs` (every hull class x gravity world x case).
import assert from 'node:assert/strict';
import { CASES, HULLS, WORLDS, runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet([...new Set([...Object.values(HULLS), 't90m', 'm1a2'])]);

const failures = [];
let runs = 0;
function check(caseId, hull, world, gates) {
  const caseDef = CASES.find((c) => c.id === caseId);
  assert.ok(caseDef, `unknown torture case ${caseId}`);
  assert.ok(WORLDS[world], `unknown world ${world}`);
  const metrics = runCase(HULLS[hull] ?? hull, world, caseDef, { replay: gates.some((g) => g.replay) });
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

// Prediction replays the authority's step from the checkpoint (movement checkpoint v4 carries the tip state).
check('drive-field-trench', 'medium', 'earth', [
  g('prediction replay error (m)', (m) => m.replay.maxErrM, 0.02, 'guard: without the tip state the replay ran 0.3–1.2 m off', true),
]);

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
console.log(`physics-torture.selftest: ${runs} torture runs — boost ceiling, cliff edges, the Sirocco climb and swing, stacking, roof edges, the Moon step, prediction replay and rest all hold`);
