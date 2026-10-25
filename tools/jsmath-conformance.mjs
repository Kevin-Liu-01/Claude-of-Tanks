#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// How closely does the Rust port's numerics (crates/cot-sim/src/jsmath.rs, the pure-Rust libm) reproduce this
// engine's Math.*? Draws a deterministic corpus over the ranges the simulation uses for every transcendental it calls,
// evaluates it here and writes inputs and results as raw doubles; `cargo run -p cot-sim --example jsmath_conformance
// -- <file>` reports, per function and range, how many results differ from the Rust evaluation and by how many ulps.
//
//   node tools/jsmath-conformance.mjs [--out=FILE] [--n=100000]   write the corpus with this engine's results
//   node tools/jsmath-conformance.mjs --digest                     print one digest per function and range
//   --pinned                                                       evaluate on the pinned math (tools/cot-sim-wasm.mjs)
//
// `conformanceDigests` is self-contained (no imports), so a browser can evaluate the same corpus by pasting the
// function source and calling it; equal digests mean the two engines return the same bits.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Every case: a function name, its arity, the Math call, the input ranges (one [lo, hi] per argument). */
export function conformanceCases() {
  const trig = [[-Math.PI, Math.PI], [-8, 8], [-1000, 1000], [-0.01, 0.01]];
  return [
    ...trig.map((r) => ['sin', 1, (a) => Math.sin(a), [r]]),
    ...trig.map((r) => ['cos', 1, (a) => Math.cos(a), [r]]),
    ...trig.map((r) => ['tan', 1, (a) => Math.tan(a), [r]]),
    ['asin', 1, (a) => Math.asin(a), [[-1, 1]]],
    ['acos', 1, (a) => Math.acos(a), [[-1, 1]]],
    ['atan', 1, (a) => Math.atan(a), [[-10, 10]]],
    ['atan', 1, (a) => Math.atan(a), [[-1e4, 1e4]]],
    ['atan2', 2, (y, x) => Math.atan2(y, x), [[-1, 1], [-1, 1]]],
    ['atan2', 2, (y, x) => Math.atan2(y, x), [[-2000, 2000], [-2000, 2000]]],
    ['exp', 1, (a) => Math.exp(a), [[-1, 1]]],
    ['exp', 1, (a) => Math.exp(a), [[-30, 30]]],
    ['log', 1, (a) => Math.log(a), [[1e-6, 1]]],
    ['log', 1, (a) => Math.log(a), [[1, 1e6]]],
    ['pow', 2, (a, b) => Math.pow(a, b), [[0, 10], [-3, 3]]],
    ['pow', 2, (a, b) => Math.pow(a, b), [[0, 2000], [0.5, 0.5]]],
    ['pow', 2, (a, b) => Math.pow(a, b), [[0, 2000], [1.5, 1.5]]],
    ['cbrt', 1, (a) => Math.cbrt(a), [[-1000, 1000]]],
    ['hypot2', 2, (a, b) => Math.hypot(a, b), [[-1000, 1000], [-1000, 1000]]],
    ['hypot3', 3, (a, b, c) => Math.hypot(a, b, c), [[-1000, 1000], [-1000, 1000], [-1000, 1000]]],
  ];
}

/** A 53-bit uniform stream from two mulberry32 draws per double, seeded per case. */
function makeUniform(seed) {
  let state = seed | 0;
  const next = () => {
    state = state + 0x6D2B79F5 | 0;
    let v = Math.imul(state ^ state >>> 15, 1 | state);
    v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v;
    return (v ^ v >>> 14) >>> 0;
  };
  return () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
}

/** Evaluate every case over `n` inputs; `sink(caseIndex, inputs, result)` sees each evaluation. */
export function evaluateCorpus(n, sink) {
  const cases = conformanceCases();
  cases.forEach(([, arity, fn, ranges], c) => {
    const uniform = makeUniform(0x5eed + c * 7919);
    const args = new Array(arity);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < arity; k++) {
        const [lo, hi] = ranges[k];
        args[k] = lo === hi ? lo : lo + (hi - lo) * uniform();
      }
      sink(c, args, fn(...args));
    }
  });
  return cases;
}

/** One FNV-1a-64 digest of the result bits per case, plus the case labels. Self-contained for a browser paste. */
export function conformanceDigests(n) {
  const view = new DataView(new ArrayBuffer(8));
  const digests = [];
  const cases = evaluateCorpus(n, (c, _args, result) => {
    view.setFloat64(0, result, true);
    let h = digests[c] ?? 0xcbf29ce484222325n;
    for (let b = 0; b < 8; b++) h = BigInt.asUintN(64, (h ^ BigInt(view.getUint8(b))) * 0x100000001b3n);
    digests[c] = h;
  });
  return cases.map(([name, , , ranges], c) => `${name} ${JSON.stringify(ranges)} ${digests[c].toString(16).padStart(16, '0')}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
  const n = Number(arg('n', 100000));
  if (process.argv.includes('--pinned')) {
    const { loadCotSimWasmNode, pinMath } = await import('./cot-sim-wasm.mjs');
    pinMath(await loadCotSimWasmNode());
  }
  if (process.argv.includes('--digest')) {
    for (const line of conformanceDigests(n)) console.log(line);
  } else {
    const out = path.resolve(arg('out', '.qa-dev/rust/jsmath-corpus.bin'));
    const cases = conformanceCases();
    // header: magic, case count, n; per case: name (16 bytes), arity, ranges; then per case n rows of arity + 1 doubles
    const rows = cases.reduce((sum, [, arity]) => sum + n * (arity + 1), 0);
    const buf = new DataView(new ArrayBuffer(16 + cases.length * (16 + 8 + 48) + rows * 8));
    let at = 0;
    for (const ch of 'JSMATHC1') buf.setUint8(at++, ch.charCodeAt(0));
    buf.setUint32(at, cases.length, true); buf.setUint32(at + 4, n, true); at += 8;
    for (const [name, arity, , ranges] of cases) {
      for (let i = 0; i < 16; i++) buf.setUint8(at++, i < name.length ? name.charCodeAt(i) : 0);
      buf.setUint32(at, arity, true); at += 8;
      for (let k = 0; k < 3; k++) { buf.setFloat64(at, ranges[k]?.[0] ?? 0, true); buf.setFloat64(at + 8, ranges[k]?.[1] ?? 0, true); at += 16; }
    }
    evaluateCorpus(n, (_c, args, result) => {
      for (const a of args) { buf.setFloat64(at, a, true); at += 8; }
      buf.setFloat64(at, result, true); at += 8;
    });
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, new Uint8Array(buf.buffer));
    console.log(`[jsmath-conformance] ${cases.length} cases x ${n} -> ${path.relative(process.cwd(), out)} (${process.version}, V8 ${process.versions.v8})`);
  }
}
