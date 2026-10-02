// src/engine/worldKernel.ts — the opt-in Rust/WebAssembly world kernel (`?wasm=world`).
//
// What it does: compiles wasm/world-kernel/pkg/cot_world_kernel.wasm (a bit-exact Rust port of simplexFast.ts,
// ≈ 6 KB, ≈ 1.6 KB brotli) and installs it as SimplexNoise's accelerator, so every noise table constructed
// afterwards — the height field's, the props', the horizon's — evaluates in WebAssembly. The kernel returns the
// identical doubles (src/engine/worldKernel.selftest.mjs proves it on random, edge-case and whole-battlefield
// samples), so collision, spotting, the receipts and the multiplayer host see the same world.
//
// Measured payoff (wgpu spike, 2026-10-01): an exact height sample spends about half its time in noise, but at this
// granularity — one JS→Wasm crossing per noise call, the JavaScript calls inlined by TurboFan — the kernel runs
// terrain's core() 1.2× faster and whole battlefield builds within ±5% of the JavaScript path (warm Node builds,
// CPU time). A kernel that owns core() (nine noises per crossing) measured 2.3–2.5× on core() and ≈ +3–10 % of a
// build; that needs a hook inside terrain.ts's hash-pinned constructor, so it stays an owner decision.
//
// Scope and fallback: main.ts imports this module only when the page URL carries `?wasm=world`, and awaits the
// installation before the world module loads; without the flag nothing here is fetched or evaluated. Any failure —
// no WebAssembly, a fetch or compile error, a wrong ABI, a self-check mismatch — leaves the JavaScript noise in place
// and records why in `window.__WORLD_KERNEL`.
import {
  installSimplexKernel,
  SimplexNoise,
  type SimplexKernel,
  type SimplexNoiseMethods,
} from './simplexFast.ts';

/** The page-URL opt-in. */
export const WORLD_KERNEL_FLAG = /[?&]wasm=world(?:&|$)/;
const KERNEL_URL = new URL('../../wasm/world-kernel/pkg/cot_world_kernel.wasm', import.meta.url);
/** Must equal `ABI` in wasm/world-kernel/src/lib.rs. */
export const WORLD_KERNEL_ABI = 1;
const TABLE_WORDS = 512;

interface WorldKernelReceipt {
  installed: boolean;
  reason: string | null;
  bytes: number;
  fetchMs: number;
  compileMs: number;
  checkMs: number;
  /** Noise tables bound to a kernel instance so far (one 64 KiB instance each). */
  instances: number;
}

interface KernelExports {
  memory: WebAssembly.Memory;
  cot_abi(): number;
  cot_tables(): number;
  cot_noise2(x: number, y: number): number;
  cot_noise3(x: number, y: number, z: number): number;
  cot_noise4(x: number, y: number, z: number, w: number): number;
}

interface WorldKernelOptions {
  /** The kernel bytes (default: fetch the bundled asset). */
  readBytes?: () => Promise<ArrayBuffer | Uint8Array<ArrayBuffer>>;
  now?: () => number;
}

/** The kernel binds only the tables `Math.floor(random() * 256)` produces; its index masks are exact for those. */
function boundableTables(perm: Int32Array, permMod12: Int32Array, permMod32: Int32Array): boolean {
  if (perm.length !== TABLE_WORDS || permMod12.length !== TABLE_WORDS || permMod32.length !== TABLE_WORDS) return false;
  for (let i = 0; i < TABLE_WORDS; i++) {
    const value = perm[i];
    if (value < 0 || value > 255 || permMod12[i] !== value % 12 || permMod32[i] !== value % 32) return false;
  }
  return true;
}

/** A SimplexKernel over a compiled module: one instance (one 64 KiB page) per noise table. */
export function createWorldKernel(module: WebAssembly.Module, receipt: WorldKernelReceipt | null = null): SimplexKernel {
  return {
    bind(perm, permMod12, permMod32): SimplexNoiseMethods | null {
      if (!boundableTables(perm, permMod12, permMod32)) return null;
      const kernel = new WebAssembly.Instance(module, {}).exports as unknown as KernelExports;
      if (kernel.cot_abi() !== WORLD_KERNEL_ABI) return null;
      const tables = new Int32Array(kernel.memory.buffer, kernel.cot_tables(), 3 * TABLE_WORDS);
      tables.set(perm, 0);
      tables.set(permMod12, TABLE_WORDS);
      tables.set(permMod32, 2 * TABLE_WORDS);
      if (receipt) receipt.instances++;
      return { noise: kernel.cot_noise2, noise3d: kernel.cot_noise3, noise4d: kernel.cot_noise4 };
    },
  };
}

/** Samples the install-time self-check compares (ordinary, negative, large, signed-zero and non-finite inputs). */
function selfCheckSamples(): number[][] {
  const samples: number[][] = [[0, 0, 0, 0], [-0, -0, -0, -0], [1e9, -1e9, 3e9, -7e9], [2 ** 53, -(2 ** 53), 1e20, -1e20],
    [Number.NaN, 1, 2, 3], [Infinity, -Infinity, 0.5, -0.5]];
  let state = 0x2545f491;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = 0; i < 96; i++) samples.push([(next() - 0.5) * 2400, (next() - 0.5) * 2400, (next() - 0.5) * 64, (next() - 0.5) * 64]);
  return samples;
}

/** Compare the kernel with the JavaScript noise on one fixed table; false on the first difference. */
export function worldKernelMatchesJavaScript(kernel: SimplexKernel): boolean {
  let state = 0x9e3779b9;
  const reference = new SimplexNoise({
    random: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
  });
  const tables = reference as unknown as { _perm: Int32Array; _pm12: Int32Array; _pm32: Int32Array };
  const bound = kernel.bind(tables._perm, tables._pm12, tables._pm32);
  if (!bound) return false;
  // The prototype methods are the JavaScript implementation even if a kernel is already installed.
  const js = SimplexNoise.prototype;
  for (const [x, y, z, w] of selfCheckSamples()) {
    if (!Object.is(bound.noise(x, y), js.noise.call(reference, x, y))) return false;
    if (!Object.is(bound.noise3d(x, y, z), js.noise3d.call(reference, x, y, z))) return false;
    if (!Object.is(bound.noise4d(x, y, z, w), js.noise4d.call(reference, x, y, z, w))) return false;
  }
  return true;
}

let pending: Promise<WorldKernelReceipt> | null = null;

/** Compile, self-check and install the kernel once; resolves (never rejects) with what happened. */
export function installWorldKernel(options: WorldKernelOptions = {}): Promise<WorldKernelReceipt> {
  pending ??= load(options);
  return pending;
}

async function load(options: WorldKernelOptions): Promise<WorldKernelReceipt> {
  const now = options.now ?? ((): number => performance.now());
  const receipt: WorldKernelReceipt = {
    installed: false, reason: null, bytes: 0, fetchMs: 0, compileMs: 0, checkMs: 0, instances: 0,
  };
  publish(receipt);
  try {
    if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is unavailable');
    const started = now();
    const bytes = options.readBytes
      ? await options.readBytes()
      : await fetch(KERNEL_URL).then((response) => {
        if (!response.ok) throw new Error(`kernel fetch ${response.status}`);
        return response.arrayBuffer();
      });
    const fetched = now();
    receipt.bytes = bytes.byteLength;
    receipt.fetchMs = fetched - started;
    const module = await WebAssembly.compile(bytes);
    const compiled = now();
    receipt.compileMs = compiled - fetched;
    const probe = createWorldKernel(module);
    const matches = worldKernelMatchesJavaScript(probe);
    receipt.checkMs = now() - compiled;
    if (!matches) throw new Error('kernel self-check differs from the JavaScript noise');
    installSimplexKernel(createWorldKernel(module, receipt));
    receipt.installed = true;
  } catch (error) {
    receipt.reason = error instanceof Error ? error.message : String(error);
  }
  return receipt;
}

function publish(receipt: WorldKernelReceipt): void {
  if (typeof window !== 'undefined') (window as unknown as { __WORLD_KERNEL?: WorldKernelReceipt }).__WORLD_KERNEL = receipt;
}
