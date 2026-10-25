/**
 * The dedicated server's world kernels (workstream #3, RUST-ENGINE-DECISION §7.1): COT_SIM_KERNELS=wasm compiles the
 * committed crates/cot-sim-wasm binary once per process, and every dedicated world answers its terrain contact and
 * obstacle-grid queries on its own instance (src/world/wasmWorldKernels.ts). Unset (or `ts`) keeps the TypeScript.
 * The kernels change no bit of the simulation, so a server on them plays the same match as one without.
 */
import { readFile } from 'node:fs/promises';
import { compileWorldKernels, type WorldKernelModule } from '../../src/world/wasmWorldKernels.ts';

const SIM_KERNELS_WASM_PATH = new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url);

/** The kernels COT_SIM_KERNELS asks for: the compiled module, or null for the TypeScript. */
export async function serverWorldKernels(flag = process.env.COT_SIM_KERNELS ?? ''): Promise<WorldKernelModule | null> {
  if (flag === '' || flag === 'ts') return null;
  if (flag !== 'wasm') throw new Error(`COT_SIM_KERNELS=${flag}: use wasm, ts or leave it unset`);
  return compileWorldKernels(await readFile(SIM_KERNELS_WASM_PATH));
}
