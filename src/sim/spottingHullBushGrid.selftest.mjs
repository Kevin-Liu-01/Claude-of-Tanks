// spottingHullBushGrid.selftest.mjs — the hull's own bush bonus from a grid of the concealment discs (2026-10-13, the
// perf stream): getConcealment's bush term must equal the walk over every disc (same tests, ascending order, the cap's
// early return) for any place, with dead discs, giant discs, a fired tank (the 15 m rule) and a list that grows.
import assert from 'node:assert/strict';
import { createSpottingSystem, MAX_BUSH_BONUS } from './spotting.ts';

let seed = 77;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const concealers = [];
for (let i = 0; i < 4000; i++) {
  // clumps (woods and hedges) and loose bushes over 1.1 km; a few giant woods discs; a share felled
  const clump = i % 7 === 0;
  const cx = (rand() - 0.5) * 1100, cz = (rand() - 0.5) * 1100;
  concealers.push({ x: clump ? Math.round(cx / 40) * 40 + rand() * 8 : cx, z: clump ? Math.round(cz / 40) * 40 + rand() * 8 : cz,
    r: i % 211 === 0 ? 24 + rand() * 10 : 1.5 + rand() * 6, add: 0.05 + rand() * 0.3, dead: rand() < 0.08 });
}
const BUSH_FIRE_TRANSPARENT_M = 15;
function walk(px, pz, bloom) {
  let bush = 0;
  for (let i = 0; i < concealers.length; i++) {
    const c = concealers[i];
    if (c.dead) continue;
    const dx = c.x - px, dz = c.z - pz, radius = c.r + 1.2;
    if (dx * dx + dz * dz > radius * radius) continue;
    if (bloom > 0 && Math.hypot(dx, dz) - c.r < BUSH_FIRE_TRANSPARENT_M) continue;
    bush += c.add;
    if (bush >= MAX_BUSH_BONUS) return MAX_BUSH_BONUS;
  }
  return bush;
}
const tank = { id: 'p1', team: 'player', spec: { id: 'fixture_medium', role: 'medium', dims: { heightM: 2.7 } },
  state: { pos: { x: 0, y: 0, z: 0 }, speed: 0 }, combat: { destroyed: false } };
const sys = createSpottingSystem({ getTanks: () => [tank], concealers, rng: () => 0.5 });
let inBush = 0, capped = 0;
for (let k = 0; k < 6000; k++) {
  // half the probes on a disc's rim (the boundary the grid must not lose), the rest anywhere
  const c = concealers[Math.floor(rand() * concealers.length)];
  const a = rand() * 6.283, on = k % 2 === 0;
  const x = on ? c.x + Math.cos(a) * (c.r + 1.2) * (0.98 + rand() * 0.04) : (rand() - 0.5) * 1200;
  const z = on ? c.z + Math.sin(a) * (c.r + 1.2) * (0.98 + rand() * 0.04) : (rand() - 0.5) * 1200;
  tank.state.pos.x = x; tank.state.pos.z = z;
  const want = walk(x, z, 0);
  assert.equal(sys.getConcealment(tank, 1).bush, want, `probe ${k}: the walk's bonus at (${x}, ${z})`);
  if (want > 0) inBush++;
  if (want === MAX_BUSH_BONUS) capped++;
}
assert.ok(inBush > 1500 && capped > 10, `the probes reach bushes (${inBush}) and the cap (${capped})`);
// a fired tank: the 15 m rule lights the discs it stands in
sys.notifyFired('p1', 2);
for (let k = 0; k < 600; k++) {
  const c = concealers[Math.floor(rand() * concealers.length)];
  tank.state.pos.x = c.x + (rand() - 0.5) * 30; tank.state.pos.z = c.z + (rand() - 0.5) * 30;
  const snap = sys.getConcealment(tank, 2.05);
  assert.ok(snap.bloom > 0, 'the fire bloom is up');
  assert.equal(snap.bush, walk(tank.state.pos.x, tank.state.pos.z, snap.bloom), `fired probe ${k}`);
}
// a felled disc stops concealing at once; a grown list is re-indexed
{
  const quiet = createSpottingSystem({ getTanks: () => [tank], concealers, rng: () => 0.5 });
  const target = concealers.find((c) => !c.dead && c.r < 4);
  tank.state.pos.x = target.x; tank.state.pos.z = target.z;
  const before = quiet.getConcealment(tank, 1).bush;
  target.dead = true;
  assert.equal(quiet.getConcealment(tank, 1).bush, walk(target.x, target.z, 0));
  assert.ok(quiet.getConcealment(tank, 1).bush < before || before === MAX_BUSH_BONUS);
  target.dead = false;
  concealers.push({ x: 600, z: 600, r: 3, add: 0.3 });
  tank.state.pos.x = 600; tank.state.pos.z = 600;
  assert.equal(quiet.getConcealment(tank, 1).bush, walk(600, 600, 0), 'the grown list is indexed again');
}

console.log(`spottingHullBushGrid.selftest: 6,600 probes equal the walk over ${concealers.length} discs (${inBush} in a bush, ${capped} capped)`);
