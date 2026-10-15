// HB-1a / HS-1 (the horizons stream, 2026-10-13): the horizon envelope tool reproduces H1's measured ring skylines and
// its maths holds on synthetic cases. Fast: three maps' rings from the centre eye (PLAN HS-1's selftest), no EYE8
// march; the full 33-map table is a tool run (docs/HORIZON-ENVELOPE.md).
import assert from 'node:assert/strict';
import {
  countSummits, distantRange, judge, loadWorld, marchSkyline, measureRing, skylineStats, ENVELOPE, EARTH_R_M,
} from './horizon-envelope.mjs';

// ---- summits: prominence on a closed profile
const flat = new Array(360).fill(1);
assert.equal(countSummits(flat), 0, 'a ruled line has no summit');
const two = Array.from({ length: 360 }, (_, i) => 1 + 1.2 * Math.exp(-(((i - 90) / 8) ** 2)) + 0.8 * Math.exp(-(((i - 250) / 10) ** 2)));
assert.equal(countSummits(two), 2, 'two peaks, each clearing 0.4°');
const ripple = Array.from({ length: 360 }, (_, i) => 1 + 0.15 * Math.sin(i / 3));
assert.equal(countSummits(ripple), 0, 'ripples under 0.4° prominence are no summits');

// ---- the distant-range arithmetic (PLAN HS-9, B-architecture F4): a 1,000 m range at 30 km stands about 1.8° up and
// keeps a few percent of its light under Verdant's fog
const range = distantRange({ reliefM: 1000, distM: 30_000, fogDensity: 0.00074 });
assert.ok(range.angleDeg > 1.7 && range.angleDeg < 1.85, `1 km range at 30 km: ${range.angleDeg.toFixed(2)}°`);
assert.ok(Math.abs(range.dropM - 30_000 ** 2 / (2 * EARTH_R_M)) < 1e-9, 'earth drop d²/2R′');
assert.ok(range.transmittance > 0.01 && range.transmittance < 0.2, `transmittance ${range.transmittance.toFixed(3)}`);

// ---- the march: a flat plain's skyline sinks with the earth, a wall at 1 km stands at its angle
const plain = marchSkyline(() => 0, { x: 0, z: 0, y: 2.5 }, { bearings: 36, maxM: 20_000 });
assert.ok(plain.elev.every((e) => e < 0), 'a sea-level plain from 2.5 m: the skyline is below the horizontal');
const wall = marchSkyline((x, z) => (Math.hypot(x, z) > 1000 ? 50 : 0), { x: 0, z: 0, y: 2.5 }, { bearings: 36, maxM: 3000, curvature: false });
const wallStats = skylineStats(wall);
assert.ok(Math.abs(wallStats.p50 - Math.atan2(47.5, 1000) * 180 / Math.PI) < 0.1, `a 50 m wall at 1 km: ${wallStats.p50.toFixed(2)}°`);
assert.equal(wallStats.under1km, 0);

// ---- H1's numbers (H1 §4, origin/main d9197a92b): the ring skyline median from the centre eye
const world = await loadWorld();
const H1 = { verdant: { c1: 1.72, c2: 18 }, titan_gorge: { c1: 12.25, c2: 40 }, polders: { c1: 0.71, c2: 6 } };
for (const [id, want] of Object.entries(H1)) {
  const row = await measureRing(world, id, { eyes: 'centre' });
  assert.ok(Math.abs(row.centre.p50 - want.c1) < 0.02, `${id}: C1 ${row.centre.p50.toFixed(2)}° (H1 ${want.c1}°)`);
  assert.ok(Math.abs(row.outlandRise - want.c2) < 1.5, `${id}: C2 ${row.outlandRise.toFixed(1)} m (H1 ${want.c2} m)`);
  const verdict = judge(row);
  if (id === 'verdant') assert.deepEqual(verdict.failures, [], 'Verdant, the bar, sits inside the envelope');
  if (id === 'polders') for (const k of ['C1', 'C2', 'C4', 'C9']) assert.ok(verdict.failures.includes(k), `Polders is outside on ${k} (H1 §5.2)`);
  if (id === 'titan_gorge') assert.ok(verdict.failures.includes('C1'), 'Titan is a wall (12.25°)');
  console.log(`horizon-envelope: ${id} C1 ${row.centre.p50.toFixed(2)}° C2 ${row.outlandRise.toFixed(1)} m summits ${row.centre.summits} outside [${verdict.failures.join(' ')}]`);
}
assert.deepEqual(ENVELOPE.C1, [1.7, 7.7]);
console.log('horizon-envelope.selftest: ok');
