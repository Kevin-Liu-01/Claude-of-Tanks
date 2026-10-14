// The spotting system's sightline bush bonus reads the concealer grid (2026-10-13, the MP stream: the authority's tick).
// Every spot check walked every canopy disc of the map; on Monsoon that walk was +0.2 ms of a 28-bot tick. The system
// now visits only the discs whose centre lies within the largest disc's reach of the segment, in ascending index order
// with bushBonusBetween's own test. This receipt proves the bonus is the walk's to the bit (Object.is) over thousands of
// random sightlines through a dense random canopy — long and short lines, axis-aligned and zero-length ones, lines off
// the map, the cap's early return, a firing target's lit-up discs, discs felled after the grid was built and discs added.
import assert from 'node:assert/strict';
import { bushBonusBetween, createSpottingSystem } from './spotting.ts';

let seed = 4242;
const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const between = (lo, hi) => lo + (hi - lo) * random();

// a dense canopy: clustered groves and scattered bushes, radii 0.5–14 m, small and zero adds, some felled
const concealers = [];
for (let grove = 0; grove < 60; grove++) {
  const cx = between(-500, 500), cz = between(-500, 500), spread = between(10, 80);
  for (let k = 0; k < 60; k++) concealers.push({ x: cx + between(-spread, spread), z: cz + between(-spread, spread), r: between(0.5, 6), add: [0, 0.05, 0.1, 0.12][k % 4], dead: k % 11 === 0 });
}
for (let k = 0; k < 600; k++) concealers.push({ x: between(-520, 520), z: between(-520, 520), r: k % 50 === 0 ? 14 : between(0.5, 4), add: between(0, 0.2) });

const tank = (id, team) => ({ id, team, spec: { id: 'fixture_medium', role: 'medium', dims: { heightM: 2.7 } }, state: { pos: { x: 0, y: 0, z: 0 }, speed: 0 }, combat: { destroyed: false } });
const spotter = tank('s', 'enemy'), target = tank('t', 'player');
const system = createSpottingSystem({ getTanks: () => [spotter, target], raycast: null, concealers, rng: () => 0.5 });

function line(n) {
  const kind = n % 8;
  const a = { x: between(-520, 520), z: between(-520, 520) };
  if (kind === 0) return [a, { x: a.x, z: a.z }]; // zero length
  if (kind === 1) return [a, { x: a.x + between(-445, 445), z: a.z }]; // along x (dz = 0)
  if (kind === 2) return [a, { x: a.x, z: a.z + between(-445, 445) }]; // along z (dx = 0)
  if (kind === 3) return [{ x: between(-900, -600), z: a.z }, { x: between(600, 900), z: a.z + between(-50, 50) }]; // off the map at both ends
  if (kind === 4) return [a, { x: a.x + between(-20, 20), z: a.z + between(-20, 20) }]; // short
  return [a, { x: a.x + between(-445, 445), z: a.z + between(-445, 445) }];
}

let lines = 0, capped = 0, positive = 0, firedDiffers = 0, timeS = 10;
function check(label) {
  for (let n = 0; n < 4000; n++) {
    const [a, b] = line(n);
    spotter.state.pos.x = a.x; spotter.state.pos.z = a.z; target.state.pos.x = b.x; target.state.pos.z = b.z;
    timeS += 100; // the target's last shot long ago: not firing
    const quiet = system.bushBonusBetween(spotter, target, timeS);
    const expected = bushBonusBetween(concealers, a.x, a.z, b.x, b.z, false);
    assert.ok(Object.is(quiet, expected), `${label} line ${n}: ${quiet} vs the walk's ${expected}`);
    system.notifyFired('t', timeS); // firing now: discs within 15 m of the target light up
    const firing = system.bushBonusBetween(spotter, target, timeS + 0.1);
    const expectedFiring = bushBonusBetween(concealers, a.x, a.z, b.x, b.z, true);
    assert.ok(Object.is(firing, expectedFiring), `${label} line ${n} firing: ${firing} vs the walk's ${expectedFiring}`);
    lines++;
    if (expected >= 0.5) capped++;
    if (expected > 0) positive++;
    if (firing !== quiet) firedDiffers++;
  }
}
check('built grid');
// fell discs after the grid was built (the battle's felled canopies) and add more (the list's length changes: re-index)
for (let i = 0; i < concealers.length; i += 7) concealers[i].dead = true;
for (let k = 0; k < 300; k++) concealers.push({ x: between(-500, 500), z: between(-500, 500), r: between(0.5, 18), add: between(0.02, 0.2) });
concealers.push({ x: NaN, z: 0, r: 2, add: 0.01 }, { x: 40, z: -30, r: 300, add: 0.03 }); // a non-finite place and an outsize radius: marked for every line
check('felled and grown');
assert.ok(capped > 100 && positive > lines / 4 && positive < lines, `capped, positive and empty lines covered (${capped} capped, ${positive} positive of ${lines})`);
assert.ok(firedDiffers > 50, `the firing target's lit discs covered (${firedDiffers})`);

// the walk's cost against the grid's, same lines, CPU time over alternating rounds (a report, not a gate)
const sample = Array.from({ length: 3000 }, (_, n) => line(n + 5));
let walkMs = 0, gridMs = 0, sink = 0;
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
for (let round = 0; round < 4; round++) {
  let t0 = cpu();
  for (const [a, b] of sample) sink += bushBonusBetween(concealers, a.x, a.z, b.x, b.z, false);
  walkMs += cpu() - t0;
  t0 = cpu();
  for (const [a, b] of sample) { spotter.state.pos.x = a.x; spotter.state.pos.z = a.z; target.state.pos.x = b.x; target.state.pos.z = b.z; sink -= system.bushBonusBetween(spotter, target, timeS + 1e6); }
  gridMs += cpu() - t0;
}
assert.ok(Number.isFinite(sink));
walkMs /= 4; gridMs /= 4;
console.log(`sightlineBush.selftest: ${lines} sightlines over ${concealers.length} discs (felled and added mid-run): the walk's bonus to the bit, quiet and firing (${capped} capped, ${positive} positive, ${firedDiffers} lit up by the flash); 3,000 lines: walk ${walkMs.toFixed(1)} ms, grid ${gridMs.toFixed(1)} ms`);
