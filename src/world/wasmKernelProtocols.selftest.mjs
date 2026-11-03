// The world kernels' cross-call protocols, checked per call (2026-11-02 audit S2; crates/cot-sim-wasm `State`): one
// instance carries order-dependent state for its host, and each order slip used to answer from a half-made state, trap
// the instance or read a stale value. Held here, on the committed package through its raw exports and the production
// seam (headlessCollisionWorld `kernels`, wasmWorldKernels.ts):
// - contact: `contact_status` is the last call's, `contact_cell_flipped`'s included (it kept the previous sample's);
// - the lattice is written once: no raw write pointer, a corner or split changed is refused, a split waits for its
//   corners; the bench's fixture fill (tools/rust-kernel-bench-core.mjs) goes through the checked writers and answers
//   as the TypeScript sampler does;
// - clearance: a walk begun inside another supersedes it, and the outer walk's next call throws at the seam (it read the
//   inner walk's place and silently skipped or repeated records);
// - support: a query before the records is refused (it trapped), a begin needs its query at the same point, a sample
//   between a query and its begin is refused;
// - grids: a handle this instance never made, or freed, is refused (it trapped).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileWorldKernels } from './wasmWorldKernels.ts';
import { createTerrainContactSampler, terrainCellFoldCandidate } from './terrainContactSurface.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { fillWasmLattice } from '../../tools/rust-kernel-bench-core.mjs';

const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
const steep = (x, z) => 30 * Math.sin(x * 0.05) * Math.cos(z * 0.04) - 12 * Math.abs(Math.sin((x - z) * 0.9)) + 0.25 * x;
const instance = (heightAt = steep) => new WebAssembly.Instance(module, { env: { terrain_height: heightAt } }).exports;
const REFUSED_COUNT = -1, WALK_STALE = -2;
const NOT_LOADED = 1, OUT_OF_ORDER = 2, MISMATCH = 3, CONFLICT = 4, OUT_OF_RANGE = 5, BAD_HANDLE = 6, CORNERS_MISSING = 8;

// ---- contact: the status is the last call's
{
  const w = instance();
  assert.ok(Number.isNaN(w.contact_sample(1, 1)) && w.contact_status() === 2, 'a corner missing');
  w.contact_height(1, 1);
  assert.ok(Number.isFinite(w.contact_sample(1, 1)) && w.contact_status() === 0, 'answered');
  assert.equal(w.contact_cell_flipped(200, -150), 2, 'a split asked where a corner is missing');
  assert.equal(w.contact_status(), 2, 'contact_status names contact_cell_flipped\'s lack, not the last sample\'s answer');
  assert.equal(w.contact_missing_ix() !== 0 || w.contact_missing_iz() !== 0, true);
  const flipped = w.contact_cell_flipped(1, 1);
  assert.equal(w.contact_status(), 0, 'answered (its corners and split were filled by contact_height)');
  assert.equal(flipped, w.contact_flipped(1, 1));
}

// ---- the lattice is written once, and the bench's fixture fill rides the checked writers
{
  const w = instance();
  assert.equal(typeof w.lattice_heights_ptr, 'undefined', 'no raw write pointer into the lattice');
  assert.equal(typeof w.lattice_ready_ptr, 'undefined');
  assert.equal(w.lattice_set_flip_from_centre(400, 400, 1), CORNERS_MISSING, 'a split waits for its corners');
  assert.equal(w.lattice_set_vertex(10, 10, 4.25), 0);
  assert.equal(w.lattice_set_vertex(10, 10, 4.25), 0, 'the same corner again is no change');
  assert.equal(w.lattice_set_vertex(10, 10, 5), CONFLICT, 'a known corner never moves');
  assert.equal(w.protocol_refusal(), CONFLICT);
  assert.equal(w.lattice_set_vertex(769, 0, 1), OUT_OF_RANGE);

  const N = 769, STEP = 128 / 96;
  const exact = new Float64Array(N);
  for (let i = 0; i < N; i++) { const chunk = Math.min(Math.floor(i / 96), 7); exact[i] = -512 + chunk * 128 + (i - chunk * 96) * STEP; }
  const lattice = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) lattice[iz * N + ix] = steep(exact[ix], exact[iz]);
  const folds = [];
  for (let iz = 0; iz < N - 1; iz++) {
    for (let ix = 0; ix < N - 1; ix++) {
      const a = lattice[iz * N + ix], b = lattice[iz * N + ix + 1], c = lattice[(iz + 1) * N + ix], d = lattice[(iz + 1) * N + ix + 1];
      if (terrainCellFoldCandidate(a, b, c, d)) folds.push(ix, iz, steep(exact[ix] + STEP * 0.5, exact[iz] + STEP * 0.5));
    }
  }
  const fx = { lattice, folds: Float64Array.from(folds) };
  const bench = instance(() => { throw new Error('a filled lattice never asks the height function'); });
  fillWasmLattice(bench, fx);
  const sampler = createTerrainContactSampler(steep);
  let seed = 0x1234567;
  const random = () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 4000; i++) {
    const x = random() * 1020 - 510, z = random() * 1020 - 510;
    assert.ok(Object.is(bench.contact_sample(x, z), sampler(x, z)), `the filled lattice answers as the TypeScript at (${x}, ${z})`);
  }
  assert.ok(folds.length > 300, `the fixture's folds were decided (${folds.length / 3})`);
  const moved = Float32Array.from(lattice);
  moved[N * 300 + 200] += 1;
  assert.throws(() => fillWasmLattice(bench, { lattice: moved, folds: fx.folds }), /refused the fixture's lattice \(code 4\)/, 'a fill that moves a corner is refused');
  // the first fold decided again from a centre on each diagonal's midpoint: one of the two turns it, and is refused
  const [fx0, fz0] = [folds[0], folds[1]];
  const [a, b, c, d] = [lattice[fz0 * N + fx0], lattice[fz0 * N + fx0 + 1], lattice[(fz0 + 1) * N + fx0], lattice[(fz0 + 1) * N + fx0 + 1]];
  const outcomes = [(a + d) / 2, (b + c) / 2].map((centre) => {
    try { fillWasmLattice(bench, { lattice, folds: Float64Array.from([fx0, fz0, centre]) }); return 'taken'; } catch (error) {
      assert.match(error.message, /refused the fixture's fold .*code 4/);
      return 'refused';
    }
  });
  assert.deepEqual(outcomes.sort(), ['refused', 'taken'], 'a decided split never turns');
}

// ---- clearance: a nested walk supersedes the outer one, at the production seam
{
  const world = createDedicatedWorldCollision('urban', { kernels: module });
  const scan = world.queryObstacles.clearance;
  const obstacles = world.getObstacles();
  // a box with several records, and another far from it
  const anchor = obstacles.find((r) => !r.crushable && r.kind !== 'bridge');
  const [x, z] = [(anchor.min[0] + anchor.max[0]) / 2, (anchor.min[2] + anchor.max[2]) / 2];
  const all = (walk, px, pz, margin) => { const out = []; for (let r = scan.point(walk, px, pz, margin, 0); r; r = scan.point(walk, px, pz, margin, 0)) out.push(r); return out; };
  const whole = all(scan.begin(x - 40, z - 40, x + 40, z + 40), x, z, 40);
  assert.ok(whole.length >= 3, `the outer box holds records (${whole.length})`);
  const outer = scan.begin(x - 40, z - 40, x + 40, z + 40);
  assert.equal(scan.point(outer, x, z, 40, 0), whole[0]);
  const inner = scan.begin(x + 300, z + 300, x + 301, z + 301);
  assert.notEqual(inner, outer, 'each walk its own id');
  assert.throws(() => scan.point(outer, x, z, 40, 0), /read after a later walk began/, 'the outer walk never reads the inner one\'s place');
  assert.throws(() => scan.lane(outer, x, z, 1, 0, 30, 1, 0), /read after a later walk began/);
  assert.throws(() => scan.entry(outer), /read after a later walk began/);
  // each walk begun again walks its own box from the start
  const again = scan.begin(x - 40, z - 40, x + 40, z + 40);
  assert.deepEqual(all(again, x, z, 40), whole, 'a walk begun again is whole');
  world.release?.();
}

// ---- support: query, flags, begin, samples; and grid handles
{
  const w = instance(() => 0);
  assert.equal(w.support_query(10, 10), REFUSED_COUNT, 'no query before the records (once a trap)');
  assert.equal(w.protocol_refusal(), NOT_LOADED);
  assert.equal(w.clearance_begin(0, 0, 1, 1), 0, 'no walk before the records');
  assert.equal(w.grid_query(3, 0, 0, 1, 1), REFUSED_COUNT, 'a handle this instance never made (once a trap)');
  assert.equal(w.protocol_refusal(), BAD_HANDLE);
  // two 2 m boxes at (10, 10) and (40, 40)
  const at = w.scratch_ptr(8 * 8);
  new Float64Array(w.memory.buffer, at, 8).set([8.5, 8.5, 11.5, 11.5, 38.5, 38.5, 41.5, 41.5]);
  const grid = w.grid_new(at, 2, 24);
  const flat = [];
  for (const [cx, cz] of [[10, 10], [40, 40]]) flat.push(cx - 1.5, 0, cz - 1.5, cx + 1.5, 2, cz + 1.5, 0, 1, 1, 0, 0, 0, cx, cz, 1.5, 1.5, 0);
  const data = w.scratch_ptr(flat.length * 8);
  new Float64Array(w.memory.buffer, data, flat.length).set(flat);
  assert.equal(w.records_load(data, flat.length, grid + 5), REFUSED_COUNT, 'records over a grid never made are refused');
  assert.equal(w.records_load(data, flat.length, grid), 2);
  const begin = (x, z) => w.support_begin(x, z, 2.3, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(w.support_top(10, 10, 0.5), 0.5, 'no hull begun: no candidates');
  assert.equal(begin(10, 10), OUT_OF_ORDER, 'a hull is queried before it begins');
  assert.equal(w.support_query(10, 10), 1);
  assert.ok(Number.isNaN(w.support_top(10, 10, 0.5)), 'between its query and its begin a hull reads nothing');
  assert.ok(Number.isNaN(w.support_contact(10, 10)));
  assert.equal(w.support_sample_hull(), OUT_OF_ORDER);
  assert.equal(begin(10.5, 10), MISMATCH, 'the hull begun is the hull queried');
  assert.equal(begin(10, 10), 0);
  assert.equal(w.support_top(10, 10, 0.5), 2, 'the box\'s top under the hull');
  assert.equal(begin(10, 10), OUT_OF_ORDER, 'a second begin needs its own query');
  assert.equal(w.grid_free(grid), 7, 'the records\' grid stays while they do');
  const spare = w.grid_new(at, 1, 24);
  assert.equal(w.grid_free(spare), 0);
  assert.equal(w.grid_query(spare, 0, 0, 20, 20), REFUSED_COUNT, 'a freed grid answers nothing');
  assert.equal(w.grid_free(spare), BAD_HANDLE);
  assert.equal(w.grid_query(grid, 0, 0, 20, 20), 1, 'the loaded grid answers on');
}

console.log('wasmKernelProtocols selftest passed: contact status is the last call\'s; the lattice is written once (the bench '
  + 'fill through checked writers answers as the TypeScript); a nested clearance walk throws at the seam; a hull is queried, '
  + 'begun and sampled in order; grid handles are checked');
