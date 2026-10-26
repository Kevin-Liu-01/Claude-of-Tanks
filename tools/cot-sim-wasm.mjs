// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The cot-sim WebAssembly module (crates/cot-sim-wasm, raw C ABI, no imports) for Node tools and browser pages, and
// the pinned ECMAScript math it carries.
//
// `pinMath(wasm)` replaces the transcendental Math functions with the module's (the pure-Rust libm the Rust port
// computes with) and Math.hypot with V8's Kahan formula in plain JavaScript, so a TypeScript evaluation gives the same
// bits on every engine: Node on arm64 runs fdlibm fused by clang's FMA contraction, Chromium another build of it,
// Safari the system libm, Firefox its own fdlibm hypot, and every V8 its platform's libc pow
// (tools/jsmath-conformance.mjs measures them). It returns the function that puts the engine's own back.

export const PINNED_MATH = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'pow', 'cbrt', 'tanh', 'cosh', 'expm1'];

export const COT_SIM_WASM_PATH = 'crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm';

/** Instantiate the module from its bytes (a browser page fetches them; Node reads them with loadCotSimWasmNode). */
export async function instantiateCotSimWasm(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
}

/** Node: the committed binary under the repository root (or `path`). */
export async function loadCotSimWasmNode(path) {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const file = path ?? fileURLToPath(new URL(`../${COT_SIM_WASM_PATH}`, import.meta.url));
  return instantiateCotSimWasm(readFileSync(file));
}

/** V8's MathHypot (math.tq): an infinite argument beats a NaN; scale by the largest magnitude; Kahan-sum the squares. */
export function v8Hypot(...values) {
  let max = 0;
  let oneIsNaN = false;
  const abs = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const value = Number(values[i]);
    if (Number.isNaN(value)) { oneIsNaN = true; continue; }
    abs[i] = Math.abs(value);
    if (abs[i] > max) max = abs[i];
  }
  if (max === Infinity) return Infinity;
  if (oneIsNaN) return NaN;
  if (max === 0) return 0;
  let sum = 0;
  let compensation = 0;
  for (let i = 0; i < abs.length; i++) {
    const n = abs[i] / max;
    const summand = n * n - compensation;
    const preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return Math.sqrt(sum) * max;
}

/** Install the pinned math over the global Math; returns the restore function. */
export function pinMath(wasm) {
  const saved = Object.fromEntries([...PINNED_MATH, 'hypot'].map((name) => [name, Math[name]]));
  for (const name of PINNED_MATH) Math[name] = wasm[`js_${name}`];
  Math.hypot = v8Hypot;
  return () => Object.assign(Math, saved);
}
