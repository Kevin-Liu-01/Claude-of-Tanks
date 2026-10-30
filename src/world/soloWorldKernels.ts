/**
 * The world kernels for solo battles (on by default, ?simKernels=ts keeps the TypeScript; docs/RUST-KERNELS.md). A solo battle steps its own integration
 * on the main thread over the rendered world (game/state.ts), so its hulls' support — the contact surface, the ground
 * the battle deforms and the tops over it — runs on the kernels here, as the multiplayer host's and the server's do
 * (wasmWorldKernels.ts). Each world gets its own instance: its lattice filled from the world's height function, its
 * obstacles loaded in the order of the world's own grid (so a hull's candidates are the TypeScript's), its ground mirrored
 * from the battle's overlay.
 *
 * ?simKernels=wasm-check runs both: the TypeScript field drives the battle and every answer of the kernels' is compared
 * with it (globalThis.__SIM_KERNELS.check). Browser-only; never loaded under ?simKernels=ts.
 */
import kernelsUrl from '../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm?url';
import { compileWorldKernels } from './wasmWorldKernels.ts';
import { createSoloWorldKernels } from './soloWorldKernelProvider.ts';

/** The kernels' module compiled, and a provider of each world's kernels (game/state.ts setSoloWorldKernels). */
export async function loadSoloWorldKernels(check: boolean) {
  const response = await fetch(kernelsUrl);
  if (!response.ok) throw new Error(`world kernels: HTTP ${response.status}`);
  return createSoloWorldKernels(await compileWorldKernels(await response.arrayBuffer()), check);
}
