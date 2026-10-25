// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Browser entry of the kernel bench (bundled by `node tools/rust-kernel-bench.mjs --bundle=DIR`): fetches the
// fixtures from ./fixtures/ and the module beside the page, proves parity and times the kernels on performance.now().
import { instantiateCotSimWasm } from './cot-sim-wasm.mjs';
import { proveParity, benchKernels } from './rust-kernel-bench-core.mjs';

const FILES = { lattice: ['lattice.f32', Float32Array], folds: ['folds.f64', Float64Array], samples: ['samples.f64', Float64Array],
  boxes: ['boxes.f64', Float64Array], queries: ['queries.f64', Float64Array], counts: ['counts.u32', Uint32Array], indices: ['indices.u32', Uint32Array] };
const out = document.getElementById('out');
const lines = [navigator.userAgent];
const show = (line) => { lines.push(line); out.textContent = lines.join('\n'); };
try {
  const fx = {};
  for (const [key, [file, Type]] of Object.entries(FILES)) fx[key] = new Type(await (await fetch(`fixtures/${file}`)).arrayBuffer());
  const w = await instantiateCotSimWasm(await (await fetch('cot_sim_wasm.wasm')).arrayBuffer());
  const parity = proveParity(fx, w);
  for (const r of parity.reports) show(`[parity] ${r.kernel}: ${r.mismatches} of ${r.checked} differ${r.first ? ` (first ${JSON.stringify(r.first)})` : ''}`);
  const rounds = Number(new URLSearchParams(location.search).get('rounds') ?? 7);
  const { results } = benchKernels(fx, w, parity, { clock: () => performance.now(), rounds });
  for (const r of results) show(`[bench] ${r.kernel}: ${r.mismatches !== undefined ? `${r.mismatches} mismatches` : `TS ${r.jsNs} ns, WASM ${r.wasmNs} ns, ${r.speedup}x`}`);
  show('DONE');
  window.__benchResults = results;
} catch (error) {
  show(`ERROR ${error.stack ?? error}`);
}
