#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Node runner of tools/rust-kernel-bench-core.mjs: proves the WebAssembly kernels (crates/cot-sim-wasm) reproduce the
// recorded battle corpus (tools/rust-kernel-fixtures.mjs) bit for bit, then times them against the TypeScript on
// thread CPU in alternating rounds.
//
//   node tools/rust-kernel-bench.mjs [--fixtures=.qa-dev/rust/fixtures] [--rounds=7] [--parity-only]
//   node tools/rust-kernel-bench.mjs --bundle=DIR   # write DIR/rust-kernel-bench.html + its bundle for a browser
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCotSimWasmNode, COT_SIM_WASM_PATH } from './cot-sim-wasm.mjs';
import { proveParity, benchKernels } from './rust-kernel-bench-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const FILES = { lattice: ['lattice.f32', Float32Array], folds: ['folds.f64', Float64Array], samples: ['samples.f64', Float64Array],
  boxes: ['boxes.f64', Float64Array], queries: ['queries.f64', Float64Array], counts: ['counts.u32', Uint32Array], indices: ['indices.u32', Uint32Array] };

const bundleDir = arg('bundle', null);
if (bundleDir) {
  const out = path.resolve(bundleDir);
  mkdirSync(out, { recursive: true });
  const { build } = await import('esbuild');
  await build({ entryPoints: [path.join(ROOT, 'tools/rust-kernel-bench.browser.mjs')], bundle: true, format: 'esm', outfile: path.join(out, 'rust-kernel-bench.js'), logLevel: 'warning', target: 'es2022',
    external: ['node:*'] }); // the Node loader's imports, never reached in a page
  copyFileSync(path.join(ROOT, COT_SIM_WASM_PATH), path.join(out, 'cot_sim_wasm.wasm'));
  writeFileSync(path.join(out, 'rust-kernel-bench.html'), '<!doctype html><meta charset="utf-8"><title>Rust kernel bench</title><pre id="out">loading</pre><script type="module" src="rust-kernel-bench.js"></script>\n');
  console.log(`[rust-kernel-bench] wrote ${path.relative(process.cwd(), out)}/rust-kernel-bench.html (serve it beside the fixtures/ folder)`);
  process.exit(0);
}

const dir = path.resolve(arg('fixtures', '.qa-dev/rust/fixtures'));
const fx = {};
for (const [key, [file, Type]] of Object.entries(FILES)) {
  const bytes = readFileSync(path.join(dir, file));
  fx[key] = new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / Type.BYTES_PER_ELEMENT);
}
const w = await loadCotSimWasmNode();
const parity = proveParity(fx, w);
for (const r of parity.reports) console.log(`[parity] ${r.kernel}: ${r.mismatches} of ${r.checked} differ${r.first ? ` (first ${JSON.stringify(r.first)})` : ''}`);
if (parity.reports.some((r) => r.mismatches)) process.exitCode = 1;
if (!process.argv.includes('--parity-only')) {
  const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
  const load = loadavg()[0].toFixed(1);
  const { results } = benchKernels(fx, w, parity, { clock: cpu, rounds: Number(arg('rounds', 7)) });
  console.log(`[bench] Node ${process.version} V8 ${process.versions.v8} ${process.arch}, thread CPU, load ${load} -> ${loadavg()[0].toFixed(1)}`);
  for (const r of results) console.log(`[bench] ${r.kernel}: ${r.mismatches !== undefined ? `${r.mismatches} mismatches` : `TS ${r.jsNs} ns, WASM ${r.wasmNs} ns, ${r.speedup}x`}`);
}
