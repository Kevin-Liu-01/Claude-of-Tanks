import assert from 'node:assert/strict';
import { fanSmokeMounts, smokeFanArc } from './smokeFan.ts';

const az = (m) => Math.atan2(m.direction[0], m.direction[2]) * 180 / Math.PI;
const el = (m) => Math.atan2(m.direction[1], Math.hypot(m.direction[0], m.direction[2])) * 180 / Math.PI;
const tube = (x, y, z, azDeg, elDeg, owner = 'turret') => {
  const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180;
  return { owner, position: [x, y, z], direction: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)] };
};

// six parallel tubes a side (the M1A2's modelled launchers, all at 51 degrees): each takes its own azimuth across the
// family's arc, innermost mouth innermost, and keeps its mouth, owner and elevation
const parallel = [];
for (const side of [-1, 1]) for (let k = 0; k < 6; k++) parallel.push(tube(side * (1.3 + 0.06 * k), 0.49, 1.38 + 0.07 * k, side * 51, 16));
const fanned = fanSmokeMounts('m1a2', parallel);
assert.equal(fanned.length, parallel.length, 'every tube kept');
const arc = smokeFanArc('m1a2');
for (const side of [-1, 1]) {
  const mine = fanned.map((m, i) => ({ m, i })).filter(({ i }) => Math.sign(parallel[i].position[0]) === side);
  const azs = mine.map(({ m }) => az(m)).sort((a, b) => Math.abs(a) - Math.abs(b));
  assert.ok(Math.abs(Math.abs(azs[0]) - arc.inner) < 0.05 && Math.abs(Math.abs(azs.at(-1)) - arc.outer) < 0.05, `the side spans the M250 arc (${azs.map((a) => a.toFixed(1))})`);
  assert.ok(azs.every((a) => Math.sign(a) === side), 'each side fans outward on its own side');
  for (let k = 1; k < azs.length; k++) assert.ok(Math.abs(azs[k]) - Math.abs(azs[k - 1]) > 5, 'each tube its own azimuth');
  // the innermost mouth (nearest the centreline) takes the innermost azimuth
  const innerMouth = mine.reduce((a, b) => Math.abs(parallel[a.i].position[0]) <= Math.abs(parallel[b.i].position[0]) ? a : b);
  assert.ok(Math.abs(Math.abs(az(innerMouth.m)) - arc.inner) < 0.05, 'the innermost mouth fires innermost');
}
for (let i = 0; i < parallel.length; i++) {
  assert.deepEqual(fanned[i].position, parallel[i].position, 'mouths unchanged');
  assert.equal(fanned[i].owner, parallel[i].owner, 'owners unchanged');
  assert.ok(Math.abs(el(fanned[i]) - 16) < 0.05, 'elevations unchanged');
  assert.ok(Math.abs(Math.hypot(...fanned[i].direction) - 1) < 1e-3, 'unit directions');
}
// the generic fan: a side's widest bore is kept, its inner tube brought in to 8 degrees, at least 5 degrees between tubes
const generic = fanSmokeMounts('leo2a6', [tube(-1.1, 0.5, 1, -11, 29), tube(-1.2, 0.5, 1, -11, 29), tube(-1.3, 0.5, 1, -11, 29),
  tube(1.1, 0.5, 1, 40, 29), tube(1.2, 0.5, 1, 60, 29)]);
assert.equal(smokeFanArc('leo2a6'), null, 'the Leopard takes the generic fan');
assert.deepEqual(generic.slice(0, 3).map(az).map((a) => +a.toFixed(1)), [-8, -13, -18], 'parallel tubes step out from 8 degrees');
assert.deepEqual(generic.slice(3).map(az).map((a) => +a.toFixed(1)), [8, 60], 'a wide side keeps its widest bore');
// a near-flat tube lofts its grenade (the 12 degree floor), a launcher on one side spreads across the bow
const lone = fanSmokeMounts('demo_lone', [tube(1.2, 0.4, 1, 30, 3), tube(1.3, 0.4, 1, 45, 3), tube(1.4, 0.4, 1, 60, 3)]);
assert.ok(lone.every((m) => el(m) >= 11.99), 'elevation floor');
assert.ok(az(lone[0]) < 0 && az(lone.at(-1)) > 0, `a one-sided launcher spreads across the bow (${lone.map(az).map((a) => a.toFixed(1))})`);
// centreline tubes keep their bores; the law is a pure function of its input
const centre = [tube(0, 0.5, 2, 0, 30)];
assert.deepEqual(fanSmokeMounts('demo_centre', centre)[0].direction.map((v) => +v.toFixed(3)), centre[0].direction.map((v) => +v.toFixed(3)));
assert.deepEqual(fanSmokeMounts('m1a2', parallel), fanned, 'deterministic');
// the documented families
assert.ok(smokeFanArc('t90m') && smokeFanArc('ua_t72b3m_modern') && smokeFanArc('challenger2') && smokeFanArc('type10')
  && smokeFanArc('kf51_x') && smokeFanArc('m1a1'), 'documented families take their arcs');
console.log('smokeFan: parallel tubes fan across the family arc (innermost mouth innermost), mouths/owners/elevations kept, generic fan, elevation floor, one-sided launcher, centreline and determinism passed');
