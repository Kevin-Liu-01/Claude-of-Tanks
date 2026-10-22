// A roller-carried upper track run hangs by the length of each span (fleet lane 2026-10-08, the coordinator's track
// brief: "sag between return rollers"). Every span between return rollers used to dip one fixed 2.2 cm, so a 0.7 m span
// and a 2 m span read as the same ruler-straight line. A free span now hangs by the square of its length (2.5 cm a square
// metre, at most 6.5 cm), never closer to a road wheel's top than the course's floor there; dead-track runs (the sag
// argument without rollerSag), taut end spans and authored loopPoints courses keep their old laws.
import assert from 'node:assert/strict';
import { KIT } from './tankFactoryCore.ts';

const sprocket = { z: -2.6, y: 0.7, r: 0.3 }, idler = { z: 2.6, y: 0.7, r: 0.3 };
const rollerZs = [-1.6, -0.4, 1.0];
const supports = rollerZs.map((z) => ({ z, y: 1.05 }));
const course = (options) => KIT.trackLoopPoints({ sprocket, idler, supports, botY: 0.04, sag: 0.022, ...options });

/** Deepest drop below the chord between two support stations, read off the course's upper run. */
function dipBetween(points, z0, z1) {
  const upper = points.filter(([, y]) => y > 0.85);
  const at = (z) => upper.reduce((best, p) => (Math.abs(p[0] - z) < Math.abs(best[0] - z) ? p : best));
  const [a, b] = [at(z0), at(z1)];
  let dip = 0;
  for (const [z, y] of upper) {
    if (z <= Math.min(a[0], b[0]) + 1e-9 || z >= Math.max(a[0], b[0]) - 1e-9) continue;
    dip = Math.max(dip, a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]) - y);
  }
  return dip;
}
const close = (actual, expected, label, tol = 1e-6) => assert.ok(Math.abs(actual - expected) < tol,
  `${label}: ${actual.toFixed(5)} m, expected ${expected.toFixed(5)} m`);

// the old law where no rollerSag is asked: one dip of min(sag, 1.6 sag span) in every span
const legacy = course({});
close(dipBetween(legacy, -1.6, -0.4), 0.022, 'legacy 1.2 m span');
close(dipBetween(legacy, -0.4, 1.0), 0.022, 'legacy 1.4 m span');

// roller sag: each span by its own length
const hung = course({ rollerSag: true });
close(dipBetween(hung, -1.6, -0.4), 0.025 * 1.2 * 1.2, 'a 1.2 m span between rollers');
close(dipBetween(hung, -0.4, 1.0), 0.025 * 1.4 * 1.4, 'a 1.4 m span between rollers');
assert.ok(dipBetween(hung, -0.4, 1.0) > dipBetween(hung, -1.6, -0.4), 'the longer span hangs deeper');

// a long span stops at the cap
const far = KIT.trackLoopPoints({ sprocket, idler, supports: [{ z: -1.4, y: 1.05 }, { z: 1.4, y: 1.05 }], botY: 0.04, sag: 0.022,
  rollerSag: true });
close(dipBetween(far, -1.4, 1.4), 0.065, 'a 2.8 m span is capped');

// the floor: a road wheel's top under the 1.4 m span allows 2 cm at its station (0.3 m into the span)
const floorZ = -0.1, t = (floorZ + 0.4) / 1.4, allowed = 0.02;
const floorY = 1.05 - allowed * Math.sin(t * Math.PI);
const floored = course({ rollerSag: true, sagFloor: [[floorZ, floorY]] });
const upper = floored.filter(([, y]) => y > 0.85);
for (const [z, y] of upper) {
  if (z <= -0.4 || z >= 1.0) continue;
  const expected = 1.05 - allowed * Math.sin(((z + 0.4) / 1.4) * Math.PI);
  close(y, expected, `the floored span at z ${z.toFixed(2)}`);
}
assert.ok(upper.every(([z, y]) => Math.abs(z - floorZ) > 0.05 || y >= floorY - 1e-9), 'the run never passes below the floor');
close(dipBetween(floored, -1.6, -0.4), 0.025 * 1.2 * 1.2, 'a floor under one span leaves the next alone');

// taut end spans stay straight under roller sag too
const taut = course({ rollerSag: true, tautRearSpan: true });
const rearExitZ = taut.filter(([, y]) => y > 0.85).reduce((lo, p) => (p[0] < lo[0] ? p : lo))[0];
assert.ok(dipBetween(taut, rearExitZ, -1.6) < 1e-9, 'the taut rear span is straight');

console.log('trackRollerSag.selftest: legacy law kept, spans hang by their length to the cap, floors and taut spans hold PASS');
