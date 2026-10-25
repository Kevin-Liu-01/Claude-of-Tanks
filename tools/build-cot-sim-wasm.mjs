#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Rebuild crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm (release, wasm32-unknown-unknown, offline) and its manifest: the
// byte length, sha256 and the sha256 of every source it compiles from.
//
//   node tools/build-cot-sim-wasm.mjs           # rebuild and rewrite the binary and the manifest
//   node tools/build-cot-sim-wasm.mjs --check   # rebuild into target/ and prove the committed binary byte-identical
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(ROOT, 'crates/cot-sim-wasm/pkg');
const BUILT = path.join(ROOT, 'target/wasm32-unknown-unknown/release/cot_sim_wasm.wasm');
const CHECK = process.argv.includes('--check');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

execFileSync('cargo', ['build', '-q', '-p', 'cot-sim-wasm', '--release', '--target', 'wasm32-unknown-unknown', '--offline'], { cwd: ROOT, stdio: 'inherit' });
const bytes = readFileSync(BUILT);
const sources = {};
for (const dir of ['crates/cot-sim/src', 'crates/cot-sim-wasm/src']) {
  for (const name of readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.rs')).sort()) sources[`${dir}/${name}`] = sha(readFileSync(path.join(ROOT, dir, name)));
}
for (const file of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates/cot-sim/Cargo.toml', 'crates/cot-sim-wasm/Cargo.toml']) sources[file] = sha(readFileSync(path.join(ROOT, file)));
const manifest = { binary: 'cot_sim_wasm.wasm', bytes: bytes.length, sha256: sha(bytes), sources };
if (CHECK) {
  const committed = readFileSync(path.join(PKG, 'cot_sim_wasm.wasm'));
  const stated = JSON.parse(readFileSync(path.join(PKG, 'manifest.json'), 'utf8'));
  const problems = [];
  if (!committed.equals(bytes)) problems.push(`the committed binary (${committed.length} B) is not the clean rebuild (${bytes.length} B)`);
  if (JSON.stringify(stated) !== JSON.stringify(manifest)) problems.push('the manifest is stale: run node tools/build-cot-sim-wasm.mjs');
  if (problems.length) { for (const p of problems) console.error(`[cot-sim-wasm] ${p}`); process.exit(1); }
  console.log(`[cot-sim-wasm] the committed binary is the clean rebuild (${bytes.length} B, sha256 ${manifest.sha256.slice(0, 12)})`);
} else {
  mkdirSync(PKG, { recursive: true });
  writeFileSync(path.join(PKG, 'cot_sim_wasm.wasm'), bytes);
  writeFileSync(path.join(PKG, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`[cot-sim-wasm] wrote crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm (${bytes.length} B, sha256 ${manifest.sha256.slice(0, 12)})`);
}
