// The committed WebAssembly kernel matches its recorded inputs (272, plan 045). The authority and the browser import
// crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm, which only `node tools/build-cot-sim-wasm.mjs` rebuilds; its manifest
// records the binary's length and SHA-256 and the SHA-256 of every source it compiled from. A Rust source, Cargo file
// or toolchain pin edited without a rebuild (or a new source the manifest does not name) fails here, with no Rust
// toolchain needed. This proves the binary matches its recorded inputs, not that a rebuild is byte-identical: that is
// `node tools/build-cot-sim-wasm.mjs --check` (the pinned toolchain), docs/RUST-KERNELS.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = 'run node tools/build-cot-sim-wasm.mjs and commit the binary and manifest';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(ROOT, 'crates/cot-sim-wasm/pkg/manifest.json'), 'utf8'));

// The build tool's source rule (tools/build-cot-sim-wasm.mjs, which runs cargo when imported): every .rs file of the two
// crates' src directories, then the workspace and crate Cargo files and the toolchain pin.
const RUST_DIRS = ['crates/cot-sim/src', 'crates/cot-sim-wasm/src'];
const CARGO_FILES = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates/cot-sim/Cargo.toml', 'crates/cot-sim-wasm/Cargo.toml'];
const expected = [
  ...RUST_DIRS.flatMap((dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.rs')).sort().map((name) => `${dir}/${name}`)),
  ...CARGO_FILES,
];

const problems = [];
const binary = readFileSync(join(ROOT, 'crates/cot-sim-wasm/pkg', manifest.binary));
if (binary.length !== manifest.bytes) problems.push(`${manifest.binary}: ${binary.length} B committed, ${manifest.bytes} B in the manifest`);
if (sha(binary) !== manifest.sha256) problems.push(`${manifest.binary}: its SHA-256 is not the manifest's`);
for (const file of expected.filter((path) => !Object.hasOwn(manifest.sources, path))) problems.push(`${file}: a kernel source the manifest does not name`);
for (const file of Object.keys(manifest.sources).filter((path) => !expected.includes(path))) problems.push(`${file}: in the manifest, no longer a kernel source`);
for (const [file, digest] of Object.entries(manifest.sources)) {
  const full = join(ROOT, file);
  if (!existsSync(full)) problems.push(`${file}: missing`);
  else if (sha(readFileSync(full)) !== digest) problems.push(`${file}: changed since the binary was built`);
}
assert.deepEqual(problems, [], `the committed kernel does not match its sources (${FIX}):\n${problems.join('\n')}`);
console.log(`sim-kernel-manifest.selftest: ${manifest.binary} (${manifest.bytes} B) and its ${expected.length} sources match the manifest PASS`);
