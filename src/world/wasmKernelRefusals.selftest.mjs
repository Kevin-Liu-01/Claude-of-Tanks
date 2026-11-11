// The world kernels' refusals named per call and asserted at the seam (2026-11-02 audit S2, round 2 U37; crates/cot-sim-wasm
// `State`, src/world/wasmWorldKernels.ts). Round one checked the protocols, but left gaps the host could not see past:
// - a heap's start: `overlay_add_rubble` took a flag that had the kernel resolve the start on its own clock, so a heap
//   laid before a `set_time` rose otherwise than one laid after it, and only the host's habit of sending the overlay's
//   start kept the two grounds alike. The export takes the start the overlay resolved, and nothing else;
// - `grid_out_ptr` and a clearance walk begun over a missing grid answered null / 0 with no code, so the host's error
//   named whatever older refusal was left;
// - `protocol_refusal` kept the last refusal for ever, so the host could not tell a refused NaN from an answered one: a
//   hull's sample between its query and its begin went into the sim as NaN unasserted, and a walk's entry read before
//   its lane handed out a record was reported as a nested scan. The code is now the last checked call's (0 when taken);
// - the bind's replay ignored a crater the kernel refused (the revision check began after the replay, so it absorbed it);
// - (round 3 B15) the clocks: the host asserts the kernel's overlay clock equals the overlay's at the bind, each step and
//   each reset; held here with overlays whose clock parts from the kernel's at each of the three.
// Held on the committed package through its raw exports and through the production seam (instantiateWorldKernels).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileWorldKernels, instantiateWorldKernels } from './wasmWorldKernels.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';

const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
const flat = () => 0;
const instance = (heightAt = flat) => new WebAssembly.Instance(module, { env: { terrain_height: heightAt } }).exports;
const bits = (value) => Buffer.from(new Float64Array([value]).buffer).toString('hex');
const OUT_OF_ORDER = 2, CONFLICT = 4, BAD_HANDLE = 6;

// ---- a heap rises from the start the call names, whatever the kernel's clock read when it was laid
{
  // the overlay's own answer: clock at 5 s, a heap starting at 5.5 s, read at 6 s (a quarter of its 2 s rise)
  const overlay = createTerrainDeformation();
  overlay.setTime(5);
  overlay.addRubble(0, 0, 6, 8, 0.3, 1.5, 5.5);
  overlay.setTime(6);
  const at = [[0.4, 0.7], [3.1, -2.2], [-5.5, 6.25]];
  const want = at.map(([x, z]) => overlay.contactOffsetAt(x, z, false));
  const risen = createTerrainDeformation();
  risen.addRubble(0, 0, 6, 8, 0.3, 1.5);
  assert.notEqual(bits(want[0]), bits(risen.contactOffsetAt(0.4, 0.7, false)), 'the heap is still rising at 6 s (the reads below can tell a start)');
  for (const order of ['the clock set first', 'the heap laid first']) {
    const w = instance();
    if (order === 'the clock set first') w.overlay_set_time(5);
    w.overlay_add_rubble(0, 0, 6, 8, 0.3, 1.5, 5.5);
    if (order === 'the heap laid first') w.overlay_set_time(5);
    w.overlay_set_time(6);
    at.forEach(([x, z], i) => assert.equal(bits(w.terrain_contact(x, z)), bits(want[i]),
      `${order}: the kernel's heap at (${x}, ${z}) reads ${w.terrain_contact(x, z)} where the overlay's reads ${want[i]} (it started on the kernel's clock, not at the start it was given)`));
  }
}

// ---- every refused call names its code
{
  const w = instance();
  assert.equal(w.grid_out_ptr(4), 0, 'a handle this instance never made has no answer buffer');
  assert.equal(w.protocol_refusal(), BAD_HANDLE, 'grid_out_ptr names its refusal (it left the code untouched)');
}

// ---- and the code is the last checked call's: 0 when it was taken
{
  const w = instance();
  assert.equal(w.lattice_set_vertex(10, 10, 5), 0);
  assert.equal(w.lattice_set_vertex(10, 10, 4.25), CONFLICT);
  assert.equal(w.protocol_refusal(), CONFLICT);
  assert.equal(w.lattice_set_vertex(11, 10, 4.25), 0);
  assert.equal(w.protocol_refusal(), 0, 'a call taken clears the code: protocol_refusal is the last checked call\'s');
  // a hull's sample between its query and its begin is refused; the begin that follows is taken, and says so
  const boxes = w.scratch_ptr(4 * 8);
  new Float64Array(w.memory.buffer, boxes, 4).set([8.5, 8.5, 11.5, 11.5]);
  const grid = w.grid_new(boxes, 1, 24);
  const flatRecords = [8.5, 0, 8.5, 11.5, 2, 11.5, 0, 1, 1, 0, 0, 0, 10, 10, 1.5, 1.5, 0];
  const data = w.scratch_ptr(flatRecords.length * 8);
  new Float64Array(w.memory.buffer, data, flatRecords.length).set(flatRecords);
  assert.equal(w.records_load(data, flatRecords.length, grid), 1);
  assert.equal(w.support_query(10, 10), 1);
  assert.ok(Number.isNaN(w.support_top(10, 10, 0.5)));
  assert.equal(w.protocol_refusal(), OUT_OF_ORDER, 'the refused sample names its code');
  assert.equal(w.support_begin(10, 10, 2.3, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0), 0);
  assert.equal(w.protocol_refusal(), 0, 'the begin taken after it reads 0, not the sample\'s refusal');
  assert.ok(Number.isNaN(w.support_top(2000, 2000, NaN)), 'a NaN ground answers NaN');
  assert.equal(w.protocol_refusal(), 0, 'and that NaN is an answer, not a refusal');
}

// ---- at the seam: a refused sample throws, an answered NaN passes
const box = (cx, cz) => ({ kind: 'building', min: [cx - 1.5, 0, cz - 1.5], max: [cx + 1.5, 2, cz + 1.5], crushable: false,
  crushed: false, dead: false, shape2: { kind: 'obb', cx, cz, hw: 1.5, hl: 1.5, yaw: 0 } });
{
  const records = [box(10, 10), box(14, 10), box(40, 40)];
  const kernels = instantiateWorldKernels(module, flat);
  kernels.obstacleGrid(records, 24, true);
  const terrain = { getHeightAt: (x) => (x > 1000 ? NaN : 0), getHeightAtFast: (x) => (x > 1000 ? NaN : 0), getGroundType: () => 'dirt' };
  const field = kernels.supportField(terrain);
  field.beginHull(10, 10, 2.3, null);
  assert.equal(field.getHeightAt(10, 10), 2, 'the box\'s top under the hull');
  assert.ok(Number.isNaN(field.getHeightAt(2000, 2000)), 'a NaN the kernel answered (the ground off the map) is passed on, not thrown');
  // a beginHull that throws after its query (a record's state unreadable) leaves the hull queried and not begun: its
  // samples are refused, and the host throws instead of handing the sim a NaN
  Object.defineProperty(records[0], 'crushed', { configurable: true, get() { throw new Error('the record\'s state is unreadable'); } });
  assert.throws(() => field.beginHull(10, 10, 2.3, null), /unreadable/);
  assert.throws(() => field.getHeightAt(10, 10), /support_top refused \(out of its order\)/, 'a refused sample throws (it answered NaN into the sim)');
  assert.throws(() => field.getHeightAtFast(10, 10), /support_top refused \(out of its order\)/);
  assert.throws(() => field.getContactHeightAt(10, 10), /support_contact refused \(out of its order\)/);
  Object.defineProperty(records[0], 'crushed', { configurable: true, writable: true, value: false });
  field.beginHull(10, 10, 2.3, null);
  assert.equal(field.getContactHeightAt(10, 10), 2, 'begun again, the hull reads its box');
}

// ---- at the seam: a walk's entry says why it has none
{
  const records = [box(10, 10), box(14, 10), box(40, 40)];
  const scan = instantiateWorldKernels(module, flat).obstacleGrid(records, 24, true).clearance;
  const walk = scan.begin(0, 0, 50, 50);
  assert.throws(() => scan.entry(walk), /entry read before its lane handed out a record/,
    'an open walk with no lane record yet says so (it was reported as a nested scan)');
  assert.equal(scan.lane(walk, 5, 10, 1, 0, 30, 0.5, 0), records[0], 'the lane meets the first box');
  assert.ok(scan.entry(walk) > 0);
  scan.begin(39, 39, 41, 41);
  assert.throws(() => scan.entry(walk), /read after a later walk began/, 'a superseded walk is a nested scan');
}

// ---- the bind's replay asserts each crater the kernel admits, as the live mirror does
{
  const kernels = instantiateWorldKernels(module, flat);
  const listed = createTerrainDeformation();
  listed.addCrater(5, 5, 2, 0.5, 0.2, 1);
  // an overlay whose list holds a crater the kernel will not admit (the two sides' bucket rules drifted apart)
  const drifted = { clockS: listed.clockS, revision: listed.revision + 1, mirror: (m) => listed.mirror(m),
    stamps: [...listed.stamps, { kind: 'crater', x: 9, z: 9, radiusM: 0, depthM: 0.5, rimM: 0.2, seed: 2 }] };
  assert.throws(() => kernels.mirrorOverlay(drifted), /refused a crater the overlay admitted/,
    'a replayed crater the kernel refuses throws at the bind (the revision offset absorbed it, and the grounds parted silently)');
  kernels.mirrorOverlay(listed);
  listed.addCrater(-5, -5, 2, 0.5, 0.2, 3);
  kernels.mirrorOverlay(null);
}

// ---- the mirrored ground's clock is asserted in step with the overlay's at the bind, each step and each reset (round 3
// B15: no receipt put the two clocks apart, so the assert could have been a no-op and every receipt would pass)
{
  const clockApart = (what) => new RegExp(`mirrored ground's clock reads .* where the overlay's reads .* \\(${what}\\)`);
  // the overlay itself, bound, stepped and reset: the clocks never part
  const kernels = instantiateWorldKernels(module, flat);
  const overlay = createTerrainDeformation();
  overlay.setTime(1.5);
  kernels.mirrorOverlay(overlay);
  overlay.setTime(2.25);
  overlay.setTime(Infinity);
  overlay.reset();
  overlay.setTime(0.5);
  kernels.mirrorOverlay(null);
  // the bind: an overlay whose clock reads a time the kernel unsets (Infinity, where the overlay's own setTime unsets it)
  const unsetBy = createTerrainDeformation();
  const infinite = { clockS: Infinity, stamps: [], get revision() { return unsetBy.revision; }, mirror: (m) => unsetBy.mirror(m) };
  assert.throws(() => instantiateWorldKernels(module, flat).mirrorOverlay(infinite), clockApart('the bind'),
    'a clock the kernel cannot hold throws at the bind');
  // a step: an overlay that tells its mirrors another time than its clock reads
  const told = createTerrainDeformation();
  const skewed = Object.create(told, {
    mirror: { value: (m) => told.mirror({ crater: m.crater, rubble: m.rubble, course: m.course, reset: m.reset, time: (t) => m.time(t + 0.25) }) },
  });
  instantiateWorldKernels(module, flat).mirrorOverlay(skewed);
  assert.throws(() => told.setTime(3), clockApart('a step'), 'a step whose told time parts from the clock throws where it happens');
  // a reset: an overlay whose reset keeps its clock (the overlay before the 2026-11-02 audit S2: the next battle's first
  // heap started on the last battle's time)
  const kept = createTerrainDeformation();
  let lastS = NaN;
  const keeping = Object.create(kept, {
    clockS: { get: () => (Number.isNaN(kept.clockS) ? lastS : kept.clockS) },
    setTime: { value: (t) => { kept.setTime(t); lastS = kept.clockS; } },
  });
  instantiateWorldKernels(module, flat).mirrorOverlay(keeping);
  keeping.setTime(4);
  assert.throws(() => keeping.reset(), clockApart('a reset'), 'a reset that keeps the overlay\'s clock throws (the kernel\'s is unset)');
}

console.log('wasmKernelRefusals selftest passed: a heap rises from the start it was given whatever the kernel\'s clock; every '
  + 'refusal names its code and the code is the last checked call\'s; a refused sample throws at the seam while an answered '
  + 'NaN passes; a walk\'s missing entry says why; a replayed crater the kernel refuses throws at the bind; the two clocks '
  + 'parted at the bind, a step or a reset throw there');
