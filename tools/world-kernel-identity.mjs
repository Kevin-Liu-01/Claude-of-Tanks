/**
 * world-kernel-identity.mjs — the digests that tie the committed world-kernel binary to its Rust sources
 * (shared by tools/build-world-kernel.mjs and src/wasm/worldKernel.selftest.mjs; no toolchain needed).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const WORLD_KERNEL_CRATE = 'wasm/world-kernel';
export const WORLD_KERNEL_WASM = `${WORLD_KERNEL_CRATE}/pkg/cot_world_kernel.wasm`;
export const WORLD_KERNEL_MANIFEST = `${WORLD_KERNEL_CRATE}/pkg/cot_world_kernel.json`;

/** Every input of the cargo build, in a fixed order: manifest, lockfile, flags, then src/ sorted. */
function worldKernelSourceFiles(root) {
  const crate = join(root, WORLD_KERNEL_CRATE);
  const sources = readdirSync(join(crate, 'src')).filter((name) => name.endsWith('.rs')).sort()
    .map((name) => `src/${name}`);
  return ['Cargo.toml', 'Cargo.lock', '.cargo/config.toml', ...sources];
}

export function worldKernelSourceDigest(root) {
  const crate = join(root, WORLD_KERNEL_CRATE);
  const hash = createHash('sha256');
  for (const file of worldKernelSourceFiles(root)) hash.update(file).update('\0').update(readFileSync(join(crate, file))).update('\0');
  return hash.digest('hex');
}

/** The ABI constant the kernel exports (`pub const ABI: u32 = N;` in src/lib.rs). */
function worldKernelSourceAbi(root) {
  const match = /pub const ABI: u32 = (\d+);/.exec(readFileSync(join(root, WORLD_KERNEL_CRATE, 'src', 'lib.rs'), 'utf8'));
  if (!match) throw new Error('wasm/world-kernel/src/lib.rs must declare `pub const ABI: u32 = N;`');
  return Number(match[1]);
}

export function worldKernelArtifactIdentity(root) {
  const bytes = readFileSync(join(root, WORLD_KERNEL_WASM));
  return {
    artifact: WORLD_KERNEL_WASM,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    abi: worldKernelSourceAbi(root),
    sourceSha256: worldKernelSourceDigest(root),
  };
}
