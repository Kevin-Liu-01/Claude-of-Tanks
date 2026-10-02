#!/usr/bin/env node
/**
 * build-world-kernel.mjs — rebuilds the opt-in Rust/WebAssembly world kernel (wasm/world-kernel) and its manifest.
 *
 *   npm run wasm:world-kernel            # cargo build → wasm/world-kernel/pkg/cot_world_kernel.wasm + .json
 *   npm run wasm:world-kernel:check      # rebuild in a temporary target dir; the bytes must equal the committed ones
 *
 * The binary is committed (≈ 6 KB, ≈ 1.6 KB brotli) because neither `npm test` nor the deploy build may require a
 * Rust toolchain: src/wasm/worldKernel.selftest.mjs proves the committed bytes against the JavaScript noise and
 * checks that the manifest's source digest still matches the crate, so an edited crate without a rebuild fails
 * the receipt. This script needs cargo with the wasm32-unknown-unknown target (rustup target add …).
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_KERNEL_CRATE, worldKernelArtifactIdentity, worldKernelSourceDigest } from './world-kernel-identity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CRATE = join(ROOT, WORLD_KERNEL_CRATE);
const CHECK = process.argv.includes('--check');
const PKG_WASM = join(CRATE, 'pkg', 'cot_world_kernel.wasm');
const PKG_MANIFEST = join(CRATE, 'pkg', 'cot_world_kernel.json');

// Reproducible flags come from the crate's .cargo/config.toml; ambient RUSTFLAGS would silently override them.
const env = { ...process.env };
for (const key of ['RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_BUILD_RUSTFLAGS', 'CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS']) delete env[key];

function cargoBuild(targetDir) {
  execFileSync('cargo', ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', '--target-dir', targetDir],
    { cwd: CRATE, env, stdio: 'inherit' });
  return join(targetDir, 'wasm32-unknown-unknown', 'release', 'cot_world_kernel.wasm');
}

const toolchain = execFileSync('rustc', ['--version'], { cwd: CRATE, env, encoding: 'utf8' }).trim();
if (CHECK) {
  const scratch = mkdtempSync(join(tmpdir(), 'cot-world-kernel-'));
  try {
    const built = readFileSync(cargoBuild(scratch));
    const committed = readFileSync(PKG_WASM);
    const manifest = JSON.parse(readFileSync(PKG_MANIFEST, 'utf8'));
    if (!built.equals(committed)) {
      throw new Error(`wasm/world-kernel: a clean rebuild (${built.length} B) differs from the committed binary `
        + `(${committed.length} B) — run npm run wasm:world-kernel and commit the result`);
    }
    if (manifest.sourceSha256 !== worldKernelSourceDigest(ROOT)) throw new Error('wasm/world-kernel: manifest source digest is stale');
    console.log(`world kernel reproducible: ${built.length} B, ${toolchain} (manifest built with ${manifest.toolchain})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else {
  const output = cargoBuild(join(CRATE, 'target'));
  copyFileSync(output, PKG_WASM);
  chmodSync(PKG_WASM, 0o644); // cargo marks cdylib output executable; the committed asset is plain data
  const manifest = { ...worldKernelArtifactIdentity(ROOT), toolchain, target: 'wasm32-unknown-unknown', profile: 'release' };
  writeFileSync(PKG_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${WORLD_KERNEL_CRATE}/pkg/cot_world_kernel.wasm (${manifest.bytes} B, sha256 ${manifest.sha256.slice(0, 12)}…)`);
}
