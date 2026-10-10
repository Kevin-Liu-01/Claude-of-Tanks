import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  beltCarriesTracer, createProjectileTracers, tracerCaliber, tracerClassFor, tracerLineage,
} from './projectileTracers.ts';

// ammunition lineage: green for Soviet-lineage ammunition, red for NATO's and everyone else's
assert.equal(tracerLineage({ id: 't90m', nation: 'Russia' }), 'east');
assert.equal(tracerLineage({ id: 'ztz99a', nation: 'China' }), 'east');
assert.equal(tracerLineage({ id: 'ua_t72b3m_modern', nation: 'Ukraine' }), 'east', 'a Ukrainian T-72 fires Soviet-lineage rounds');
assert.equal(tracerLineage({ id: 'ua_m2a3_bradley', nation: 'Ukraine' }), 'nato', 'a donated Bradley fires NATO rounds');
assert.equal(tracerLineage({ id: 'pl_t72b3_modern', nation: 'Poland' }), 'east');
assert.equal(tracerLineage({ id: 'leo2a6', nation: 'Germany' }), 'nato');
assert.equal(tracerLineage(null), 'nato', 'an unknown shooter takes the red default');
// classes by calibre: belt mix and burn time
const mg = tracerClassFor(12.7, 'nato'), mgEast = tracerClassFor(7.62, 'east'), cannon = tracerClassFor(30, 'east'), tank = tracerClassFor(120, 'nato');
assert.equal(mg.beltEvery, 5, 'a NATO machine-gun belt: 4 ball, 1 tracer');
assert.equal(mgEast.beltEvery, 4);
assert.equal(cannon.beltEvery, 4);
assert.equal(tank.beltEvery, 1, 'every tank round carries its tracer');
assert.ok(mg.burnS >= 2 && mg.burnS <= 4 && tank.burnS >= 2 && tank.burnS <= 5, 'tracers burn for a few seconds');
assert.deepEqual([0, 1, 2, 3, 4, 5, 9, 10].map((i) => beltCarriesTracer(i, 5)), [true, false, false, false, false, true, false, true]);

// a networked round carries its type, not its calibre: the shooter's main gun when it fires that type, else the roof
// machine gun's
const abrams = { gun: { caliberMm: 120, shells: [{ type: 'APFSDS' }, { type: 'HEAT' }] } };
assert.equal(tracerCaliber({ type: 'APFSDS' }, abrams), 120);
assert.equal(tracerCaliber({ type: 'AP' }, abrams), 12.7, "an AP round an Abrams' main gun does not fire is its roof gun's");
assert.equal(tracerCaliber({ type: 'AP' }, { gun: { caliberMm: 30, shells: [{ type: 'AP' }, { type: 'HE' }] } }), 30);
assert.equal(tracerCaliber({ type: 'AP', caliberMm: 7.62 }, abrams), 7.62, 'a round that carries its calibre keeps it');
assert.equal(tracerCaliber({ type: 'HE' }, null), 100);

// the runtime
const scene = new THREE.Scene();
let now = 10;
const shooters = { a: { id: 'm1a2', nation: 'USA' }, b: { id: 't90m', nation: 'Russia' }, c: { id: 'leo2a6', nation: 'Germany' },
  d: { id: 'k2', nation: 'South Korea' }, e: { id: 'ztz99a', nation: 'China' } };
const tr = createProjectileTracers({ shooter: (id) => shooters[id] ?? null, scene, now: () => now, capacity: 64 });
const geo = tr.mesh.geometry;
const head = geo.getAttribute('aHead'), tail = geo.getAttribute('aTail'), core = geo.getAttribute('aCore'), halo = geo.getAttribute('aHalo');
const shell = (id, shooterId, caliberMm, x, ageS = 0.2, extra = {}) => ({ id, shooterId, pos: new THREE.Vector3(x, 2, 50),
  vel: new THREE.Vector3(0, 0, 850), ageS, distM: 170, spec: { type: 'AP', caliberMm }, ...extra });
function frame(shells) {
  tr.begin();
  for (const s of shells) tr.write(s);
  tr.end();
  return geo.instanceCount;
}
/** End every round in flight (each draws its last streak once), so the next case starts with an empty pool. */
function flush() { frame([]); frame([]); }
// a ten-round NATO burst: rounds 0 and 5 glow, the rest fly unseen
const burst = Array.from({ length: 10 }, (_, i) => shell(100 + i, 'a', 12.7, i));
assert.equal(frame(burst), 2, 'a 10-round NATO burst shows two tracers');
// the same rounds keep their belt places next frame (no re-roll)
assert.equal(frame(burst), 2);
// the streak is speed x exposure (day: 1/60 s), clamped to the distance flown
const i0 = 0;
const dz = head.getZ(i0) - tail.getZ(i0);
assert.ok(Math.abs(dz - 850 / 60) < 0.05, `the day streak is speed x 1/60 s (${dz.toFixed(2)} m)`);
assert.ok(core.getX(i0) > core.getZ(i0), 'NATO machine-gun tracers burn red-orange');
const dayHalo = tail.getW(i0), dayHaloRad = halo.getX(i0);
flush();
// (r2) the charge lights a little past the muzzle: a round 3 m out is still dark, and once alight its smear never
// reaches back past the point it lit at
assert.equal(frame([shell(300, 'a', 120, 0, 0.002, { distM: 3 })]), 0, 'a tank round 3 m out of the muzzle is not yet alight');
flush();
frame([shell(301, 'a', 120, 0, 0.01, { distM: 16 })]);
assert.ok(head.getZ(0) - tail.getZ(0) <= 16 - tank.igniteM + 1e-6, 'the smear stops where the charge lit, never at the muzzle');
assert.ok(tank.igniteM >= 5 && tank.igniteM <= 20 && mg.igniteM >= 2 && mg.igniteM <= 10, 'tracers ignite metres, not tens of metres, out');
flush();
// a tank round's trace is a short dash behind the dart, not a lit rod: speed x exposure, at most its cap
frame([shell(302, 'a', 120, 0, 0.2, { vel: new THREE.Vector3(0, 0, 1650) })]);
assert.ok(head.getZ(0) - tail.getZ(0) <= tank.streakMaxM + 1e-6 && tank.streakMaxM <= 15, 'an APFSDS dash, not a rod');
flush();
// tank rounds: every one glows, hotter than a machine gun's; by day in its warm colour (a white glare is the dark's)
assert.equal(frame([shell(310, 'a', 120, 0), shell(311, 'a', 120, 1), shell(312, 'a', 120, 2)]), 3);
assert.ok(core.getX(0) > 1.2 && core.getY(0) < 0.4 * core.getX(0), 'by day a tank tracer is a warm orange point');
flush();
frame([shell(320, 'c', 12.7, 0)]);
assert.ok(core.getY(0) < 0.25 * core.getX(0), 'by day a NATO machine-gun tracer is red-orange, not pale');
// a Russian machine gun burns green
flush();
frame([shell(400, 'b', 7.62, 0)]);
assert.ok(core.getY(0) > core.getX(0), 'Soviet-lineage tracers burn green');
flush();
// burnout: past its burn time a tracer goes dark for the rest of its flight
assert.equal(frame([shell(500, 'a', 120, 0, 3.6 + 0.2)]), 0, 'a burnt-out tracer draws nothing');
flush();
assert.equal(frame([shell(501, 'a', 120, 0, 3.6 + 0.05)]), 1, 'it dims through its burnout first');
flush();
// a round that ends draws its last streak once more, then is gone
assert.equal(frame([shell(600, 'a', 120, 0)]), 1);
assert.equal(frame([]), 1, 'a round gone since the last frame leaves its last line once');
assert.equal(frame([]), 0, 'and then nothing');
assert.equal(tr.stats().tracked, 0, 'records are released');
flush();
// a deflected round tumbles: its light flickers frame to frame
const flick = [];
for (let k = 0; k < 12; k++) { now = 10 + k / 60; frame([shell(700, 'a', 120, 0, 0.3, { bounces: 1 })]); flick.push(core.getX(0)); }
assert.ok(Math.max(...flick) - Math.min(...flick) > 0.5, 'a tumbling tracer flickers');
// the night: the camera opens and the halo widens and brightens
scene.userData.lightModel = { night: 1, exposure: 3.3 };
flush();
assert.equal(frame([shell(800, 'b', 120, 0)]), 1, 'a tank round at night');
assert.ok(core.getX(0) > 2.5, 'at night a tank tracer is a hot bright core');
flush();
assert.equal(frame([shell(801, 'd', 12.7, 0)]), 1, 'a machine-gun tracer at night');
assert.ok(tail.getW(0) > dayHalo * 1.5 && halo.getX(0) > dayHaloRad * 1.5, 'the halo grows at night');
assert.ok(head.getZ(0) - tail.getZ(0) > 850 / 60 + 1, 'the night camera smears a longer streak');
// a gun's belts are its own: the coax's count never shifts the main gun's (and the reverse)
tr.reset(); flush();
assert.equal(frame([shell(900, 'a', 7.62, 0), shell(901, 'a', 120, 1), shell(902, 'a', 7.62, 2), shell(903, 'a', 120, 3)]), 3,
  "the coax's first round and both main-gun rounds glow");
// every instance is finite
for (let i = 0; i < geo.instanceCount; i++) {
  for (const a of [head, tail, core, halo]) for (const c of ['getX', 'getY', 'getZ', 'getW']) assert.ok(Number.isFinite(a[c](i)));
}
// (r2) the strike: a round reported struck draws its last dash into the strike point, throws sparks there for a few
// frames (a machine-gun round often skipping off), all from its own seed, and none off water
scene.userData.lightModel = null;
function strikeRun(id, shooterId, cal, water = false) {
  tr.reset(); now = 20;
  frame([shell(id, shooterId, cal, 0, 0.2, { pos: new THREE.Vector3(0, 2, 60) })]);
  tr.strike(id, [0, 0.3, 75], water);
  now += 1 / 60;
  const drawn = frame([]);
  const last = [head.getX(0), head.getY(0), head.getZ(0)];
  const shots = [];
  for (let i = 0; i < drawn; i++) shots.push([head.getX(i), head.getY(i), head.getZ(i), tail.getX(i), tail.getY(i), tail.getZ(i)].map((v) => v.toFixed(4)).join(','));
  const counts = [drawn];
  for (let k = 0; k < 30; k++) { now += 1 / 60; counts.push(frame([])); }
  return { drawn, last, shots, counts };
}
const st1 = strikeRun(3000, 'a', 12.7), st2 = strikeRun(3000, 'a', 12.7);
assert.ok(Math.hypot(st1.last[0], st1.last[1] - 0.3, st1.last[2] - 75) < 1e-4, 'the last dash ends in the strike');
assert.ok(st1.drawn >= 3, `the strike throws sparks (${st1.drawn - 1})`);
assert.deepEqual(st1.shots, st2.shots, 'the same strike throws the same sparks');
assert.equal(st1.counts.at(-1), 0, 'and they die out within half a second');
assert.ok(st1.shots.slice(1).every((v) => v.split(',').every((c) => Number.isFinite(Number(c)))), 'finite sparks');
let ricochets = 0;
for (let id = 3100; id < 3140; id++) {
  const run = strikeRun(id, 'a', 12.7);
  // a ricochet is the one spark still burning bright after 0.15 s, well above the ground
  if (run.counts[9] > 0) ricochets++;
}
assert.ok(ricochets >= 10 && ricochets <= 36, `machine-gun rounds often skip off (${ricochets} of 40 still flying at 0.15 s)`);
assert.equal(strikeRun(3200, 'a', 12.7, true).drawn, 1, 'a strike in water throws no sparks, its last dash only');
const tankStrike = strikeRun(3300, 'a', 120);
assert.ok(tankStrike.drawn >= 6, 'a tank round throws a spray of sparks');
tr.reset();
// capacity: a storm of rounds never overruns the pool
flush();
const storm = Array.from({ length: 200 }, (_, i) => shell(1000 + i, 'a', 120, i * 0.1));
assert.equal(frame(storm), 64, 'the pool holds at its capacity');
// reset: a rematch starts clean (belt counts too)
tr.reset();
assert.equal(geo.instanceCount, 0);
assert.equal(frame([shell(2000, 'a', 12.7, 0)]), 1, "after a reset a gun's first round is a tracer again");
tr.mesh.geometry.dispose(); tr.mesh.material.dispose();
console.log('projectileTracers: lineage, belt mix, streak = speed x exposure, ignition, tank dash, warm day colour, burnout, last streak, tumble, night halo, strike sparks and ricochets, capacity and reset passed');
