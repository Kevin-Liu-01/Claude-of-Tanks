// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The engine-neutral core of tools/rust-kernel-bench.mjs (Node) and tools/rust-kernel-bench.html (a browser bundle):
// replays the recorded battle corpus (tools/rust-kernel-fixtures.mjs) through the TypeScript kernels and the
// WebAssembly ones (crates/cot-sim-wasm), proves each reproduces every recorded answer bit for bit, then times them in
// alternating rounds (A B B A) in three call shapes: one boundary crossing per call, a batch per crossing, and the
// shell step that owns its whole loop.
import { Vector3 } from 'three';
import { createTerrainContactSampler } from '../src/world/terrainContactSurface.ts';
import { createObstacleGrid } from '../src/world/collision.ts';
import { createShell, stepShell } from '../src/sim/ballistics.ts';

const SIZE = 1024, HALF = SIZE / 2, CHUNK = 128, SEGMENTS = 96, CELLS = SIZE / CHUNK * SEGMENTS, N = CELLS + 1;
const STEP = CHUNK / SEGMENTS;
const SHELL_STRIDE = 14;

function latticeCoordinates() {
  const exact = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const chunk = Math.min(Math.floor(i / SEGMENTS), SIZE / CHUNK - 1);
    exact[i] = -HALF + chunk * CHUNK + (i - chunk * SEGMENTS) * STEP;
  }
  return exact;
}

/** The height function the fixture captured: the lattice's corners at their exact coordinates, the folds' centres. */
function fixtureHeightAt(fx) {
  const exact = latticeCoordinates();
  const centres = new Map();
  for (let i = 0; i < fx.folds.length; i += 3) centres.set(`${exact[fx.folds[i]] + STEP * 0.5}|${exact[fx.folds[i + 1]] + STEP * 0.5}`, fx.folds[i + 2]);
  return (x, z) => {
    const ix = Math.round((x + HALF) / STEP), iz = Math.round((z + HALF) / STEP);
    if (exact[ix] === x && exact[iz] === z) return fx.lattice[iz * N + ix];
    const centre = centres.get(`${x}|${z}`);
    if (centre === undefined) throw new Error(`the fixture has no height at (${x}, ${z})`);
    return centre;
  };
}

/** A WebAssembly instance's lattice filled from the fixture (every corner known, every fold decided). */
function fillWasmLattice(w, fx) {
  // every pointer before any view: the first call allocates the instance's state and may grow (detach) the memory
  const heights = w.lattice_heights_ptr(), ready = w.lattice_ready_ptr();
  w.lattice_flips_ptr();
  new Float32Array(w.memory.buffer, heights, N * N).set(fx.lattice);
  new Uint8Array(w.memory.buffer, ready, Math.ceil(N * N / 8)).fill(0xff);
  for (let i = 0; i < fx.folds.length; i += 3) w.lattice_set_flip_from_centre(fx.folds[i], fx.folds[i + 1], fx.folds[i + 2]);
}

const mismatchReport = (name, total, bad, first) => ({ kernel: name, checked: total, mismatches: bad, ...(first ? { first } : {}) });

/** Parity: every recorded contact height and grid answer, through the TypeScript (on the fixture) and the WebAssembly. */
export function proveParity(fx, w) {
  const reports = [];
  // contact, TypeScript on the fixture's height function (validates the fixture) and WebAssembly per call and batched
  const sampler = createTerrainContactSampler(fixtureHeightAt(fx));
  fillWasmLattice(w, fx);
  const n = fx.samples.length / 3;
  let badJs = 0, badWasm = 0, firstJs = null, firstWasm = null;
  for (let i = 0; i < n; i++) {
    const x = fx.samples[3 * i], z = fx.samples[3 * i + 1], want = fx.samples[3 * i + 2];
    const js = sampler(x, z);
    if (!Object.is(js, want)) { badJs++; firstJs ??= { x, z, want, got: js }; }
    const wasm = w.contact_sample(x, z);
    if (!Object.is(wasm, want)) { badWasm++; firstWasm ??= { x, z, want, got: wasm, status: w.contact_status() }; }
  }
  reports.push(mismatchReport('contact (TypeScript on the fixture)', n, badJs, firstJs));
  reports.push(mismatchReport('contact (WebAssembly, per call)', n, badWasm, firstWasm));
  {
    const chunk = 4096, bytes = chunk * 3 * 8, base = w.scratch_ptr(bytes);
    const f64 = new Float64Array(w.memory.buffer);
    const pts = base >> 3, outs = pts + 2 * chunk;
    let bad = 0, first = null;
    for (let at = 0; at < n; at += chunk) {
      const k = Math.min(chunk, n - at);
      for (let i = 0; i < k; i++) { f64[pts + 2 * i] = fx.samples[3 * (at + i)]; f64[pts + 2 * i + 1] = fx.samples[3 * (at + i) + 1]; }
      const done = w.contact_sample_batch(base, k, base + 2 * chunk * 8, 0);
      if (done !== k) throw new Error(`batch stopped at ${done} of ${k}`);
      for (let i = 0; i < k; i++) if (!Object.is(f64[outs + i], fx.samples[3 * (at + i) + 2])) { bad++; first ??= { at: at + i, want: fx.samples[3 * (at + i) + 2], got: f64[outs + i] }; }
    }
    reports.push(mismatchReport('contact (WebAssembly, batches of 4096)', n, bad, first));
  }
  // grid
  const records = [];
  for (let i = 0; i < fx.boxes.length; i += 4) records.push({ min: [fx.boxes[i], 0, fx.boxes[i + 1]], max: [fx.boxes[i + 2], 0, fx.boxes[i + 3]] });
  const slot = new Map(records.map((r, i) => [r, i]));
  const jsQuery = createObstacleGrid(records);
  const boxBytes = fx.boxes.length * 8, boxPtr = w.scratch_ptr(boxBytes);
  new Float64Array(w.memory.buffer, boxPtr, fx.boxes.length).set(fx.boxes);
  const handle = w.grid_new(boxPtr, records.length, 24);
  const outBase = w.grid_out_ptr(handle) >> 2;
  const q = fx.queries.length / 4;
  const out = [];
  let at = 0, badJsQ = 0, badWasmQ = 0, firstJsQ = null, firstWasmQ = null;
  const u32 = () => new Uint32Array(w.memory.buffer);
  for (let i = 0; i < q; i++) {
    const count = fx.counts[i];
    jsQuery(fx.queries[4 * i], fx.queries[4 * i + 1], fx.queries[4 * i + 2], fx.queries[4 * i + 3], out);
    let same = out.length === count;
    for (let k = 0; same && k < count; k++) same = slot.get(out[k]) === fx.indices[at + k];
    if (!same) { badJsQ++; firstJsQ ??= { query: i }; }
    const m = w.grid_query(handle, fx.queries[4 * i], fx.queries[4 * i + 1], fx.queries[4 * i + 2], fx.queries[4 * i + 3]);
    const view = u32();
    let sameW = m === count;
    for (let k = 0; sameW && k < count; k++) sameW = view[outBase + k] === fx.indices[at + k];
    if (!sameW) { badWasmQ++; firstWasmQ ??= { query: i, want: count, got: m }; }
    at += count;
  }
  reports.push(mismatchReport('grid (TypeScript on the fixture records)', q, badJsQ, firstJsQ));
  reports.push(mismatchReport('grid (WebAssembly, per call)', q, badWasmQ, firstWasmQ));
  return { reports, records, jsQuery, handle, sampler };
}

/** Alternating rounds: for each kernel, A then B then B then A, `rounds` times; the median time per operation of each. */
function abba(clock, rounds, a, b) {
  const ta = [], tb = [];
  for (let r = 0; r < rounds; r++) {
    for (const [fn, list] of [[a, ta], [b, tb], [b, tb], [a, ta]]) {
      const t0 = clock();
      fn();
      list.push(clock() - t0);
    }
  }
  const median = (list) => [...list].sort((x, y) => x - y)[list.length >> 1];
  return [median(ta), median(tb)];
}

/** Time the kernels. `clock()` returns milliseconds (thread CPU in Node, performance.now in a browser). */
export function benchKernels(fx, w, ctx, { clock, rounds = 7 }) {
  const results = [];
  const n = fx.samples.length / 3;
  let sink = 0;
  // contact: per call
  {
    const xs = new Float64Array(n), zs = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = fx.samples[3 * i]; zs[i] = fx.samples[3 * i + 1]; }
    const js = () => { let s = 0; for (let i = 0; i < n; i++) s += ctx.sampler(xs[i], zs[i]); sink += s; };
    const wasm = () => { const f = w.contact_sample; let s = 0; for (let i = 0; i < n; i++) s += f(xs[i], zs[i]); sink += s; };
    const [a, b] = abba(clock, rounds, js, wasm);
    results.push({ kernel: 'contact sample, one crossing per point', ops: n, jsNs: a * 1e6 / n, wasmNs: b * 1e6 / n });
    // batched: the points written into the instance's memory, one crossing per 256, the heights read back
    const chunk = 256, base = w.scratch_ptr(chunk * 3 * 8);
    const batch = () => {
      const f64 = new Float64Array(w.memory.buffer);
      const pts = base >> 3, outs = pts + 2 * chunk, outPtr = base + 2 * chunk * 8;
      let s = 0;
      for (let at = 0; at < n; at += chunk) {
        const k = Math.min(chunk, n - at);
        for (let i = 0; i < k; i++) { f64[pts + 2 * i] = xs[at + i]; f64[pts + 2 * i + 1] = zs[at + i]; }
        w.contact_sample_batch(base, k, outPtr, 0);
        for (let i = 0; i < k; i++) s += f64[outs + i];
      }
      sink += s;
    };
    const [a2, b2] = abba(clock, rounds, js, batch);
    results.push({ kernel: 'contact sample, batches of 256 points', ops: n, jsNs: a2 * 1e6 / n, wasmNs: b2 * 1e6 / n });
  }
  // grid: per call, the answer handed back as records (what the match consumes)
  {
    const q = fx.queries.length / 4, out = [], records = ctx.records, qs = fx.queries;
    const outBase = w.grid_out_ptr(ctx.handle) >> 2;
    const js = () => { let s = 0; for (let i = 0; i < q; i++) s += ctx.jsQuery(qs[4 * i], qs[4 * i + 1], qs[4 * i + 2], qs[4 * i + 3], out).length; sink += s; };
    const wasm = () => {
      const u32 = new Uint32Array(w.memory.buffer), query = w.grid_query, h = ctx.handle;
      let s = 0;
      for (let i = 0; i < q; i++) {
        const m = query(h, qs[4 * i], qs[4 * i + 1], qs[4 * i + 2], qs[4 * i + 3]);
        out.length = 0;
        for (let k = 0; k < m; k++) out.push(records[u32[outBase + k]]);
        s += out.length;
      }
      sink += s;
    };
    const [a, b] = abba(clock, rounds, js, wasm);
    results.push({ kernel: 'obstacle grid query, one crossing per query', ops: q, jsNs: a * 1e6 / q, wasmNs: b * 1e6 / q });
    // batched: every query of the corpus in one crossing, the answers mapped back to records
    const boxPtr = w.scratch_ptr(q * 4 * 8 + q * 4 + fx.indices.length * 4 + 64);
    const countsPtr = boxPtr + q * 4 * 8, indicesPtr = countsPtr + q * 4;
    const batch = () => {
      new Float64Array(w.memory.buffer, boxPtr, q * 4).set(qs);
      const total = w.grid_query_batch(ctx.handle, boxPtr, q, countsPtr, indicesPtr, fx.indices.length + 16);
      const u32 = new Uint32Array(w.memory.buffer), cBase = countsPtr >> 2, iBase = indicesPtr >> 2;
      let s = 0, at = 0;
      for (let i = 0; i < q; i++) {
        const m = u32[cBase + i];
        out.length = 0;
        for (let k = 0; k < m; k++) out.push(records[u32[iBase + at + k]]);
        at += m;
        s += out.length;
      }
      sink += s + total;
    };
    const [a2, b2] = abba(clock, rounds, js, batch);
    results.push({ kernel: 'obstacle grid query, all queries in one crossing', ops: q, jsNs: a2 * 1e6 / q, wasmNs: b2 * 1e6 / q });
  }
  // shells: 512 live shells stepped 360 times (six seconds); the TypeScript's objects vs the packed batch
  {
    const count = 512, steps = 360, dt = 1 / 60;
    const spec = { velocityMps: 1750, pen100Mm: 640, pen1000Mm: 590 };
    const make = () => Array.from({ length: count }, (_, i) => createShell(spec, 'p', false, new Vector3(i, 2, -i), new Vector3(Math.sin(i), 0.05, Math.cos(i)).normalize(), i));
    const ptr = w.scratch_ptr(count * SHELL_STRIDE * 8);
    let shellsJs = make();
    const pack = (shells) => {
      const f64 = new Float64Array(w.memory.buffer, ptr, count * SHELL_STRIDE);
      shells.forEach((s, i) => f64.set([s.pos.x, s.pos.y, s.pos.z, s.prevPos.x, s.prevPos.y, s.prevPos.z, s.vel.x, s.vel.y, s.vel.z, s.ageS, s.distM, s.gravityMps2, s.spec.maxLifetimeS ?? 6, s.dead ? 1 : 0], i * SHELL_STRIDE));
    };
    // parity first: one flight each way
    const ref = make();
    for (let k = 0; k < steps; k++) for (const s of ref) stepShell(s, dt);
    pack(make());
    w.shells_step(ptr, count, dt, steps);
    const f64 = new Float64Array(w.memory.buffer, ptr, count * SHELL_STRIDE);
    let bad = 0;
    ref.forEach((s, i) => { const o = i * SHELL_STRIDE; if (![s.pos.x, s.pos.y, s.pos.z, s.vel.y, s.ageS, s.distM].every((v, j) => Object.is(v, f64[o + [0, 1, 2, 7, 9, 10][j]])) || (s.dead ? 1 : 0) !== f64[o + 13]) bad++; });
    results.push({ kernel: 'shell step parity (512 shells × 360 steps)', ops: count, mismatches: bad });
    const js = () => { shellsJs = make(); for (let k = 0; k < steps; k++) for (const s of shellsJs) stepShell(s, dt); sink += shellsJs[0].pos.x; };
    const wasm = () => { const fresh = make(); pack(fresh); w.shells_step(ptr, count, dt, steps); sink += new Float64Array(w.memory.buffer, ptr, 1)[0]; };
    const [a, b] = abba(clock, rounds, js, wasm);
    results.push({ kernel: 'shell step, the kernel owns all 360 steps', ops: count * steps, jsNs: a * 1e6 / (count * steps), wasmNs: b * 1e6 / (count * steps) });
    // per tick: the authority's objects packed in, stepped once, unpacked, every tick
    const perTick = () => {
      const shells = make();
      for (let k = 0; k < steps; k++) {
        pack(shells);
        w.shells_step(ptr, count, dt, 1);
        const v = new Float64Array(w.memory.buffer, ptr, count * SHELL_STRIDE);
        for (let i = 0; i < count; i++) {
          const s = shells[i], o = i * SHELL_STRIDE;
          s.pos.set(v[o], v[o + 1], v[o + 2]); s.prevPos.set(v[o + 3], v[o + 4], v[o + 5]); s.vel.set(v[o + 6], v[o + 7], v[o + 8]);
          s.ageS = v[o + 9]; s.distM = v[o + 10]; s.dead = v[o + 13] !== 0;
        }
      }
      sink += shells[0].pos.x;
    };
    const [a2, b2] = abba(clock, rounds, js, perTick);
    results.push({ kernel: 'shell step, packed and unpacked every tick', ops: count * steps, jsNs: a2 * 1e6 / (count * steps), wasmNs: b2 * 1e6 / (count * steps) });
  }
  for (const r of results) if (r.jsNs) { r.jsNs = +r.jsNs.toFixed(2); r.wasmNs = +r.wasmNs.toFixed(2); r.speedup = +(r.jsNs / r.wasmNs).toFixed(2); }
  return { results, sink };
}
