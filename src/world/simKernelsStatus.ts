/**
 * The world kernels' status (docs/RUST-KERNELS.md): whether a world steps on them, and why not. A tiny DOM-free module
 * the host's Worker, the page's solo runtime and the server share, so a failed load is named the same everywhere and
 * reported (simKernelsReport.ts on the page, the match service's log on the server).
 */
/**
 * Whether a world steps on the kernels, and why not ('off': the flag or the boot named none; otherwise the failure's
 * reason, simKernelsFailureReason): a failed load falls back to the TypeScript, never silently (simKernelsReport.ts).
 */
export interface SimKernelsStatus {
  mode: 'wasm' | 'ts';
  reason?: string;
}

/**
 * Why the kernels' module did not load, as a short code for telemetry and the page's __SIM_KERNELS:
 * - 'csp': a Content Security Policy without 'wasm-unsafe-eval' refused the compile;
 * - 'http_<status>': the asset's fetch answered an error;
 * - 'network': the fetch failed;
 * - 'compile' and 'link': the bytes were not a module this engine accepts;
 * - 'no_webassembly': the engine has none;
 * - 'missing': the server's binary is not on disk (a deploy image without crates/cot-sim-wasm/pkg);
 * - 'error': anything else.
 */
export function simKernelsFailureReason(error: unknown): string {
  if (typeof WebAssembly !== 'object') return 'no_webassembly';
  if ((error as { code?: unknown } | null)?.code === 'ENOENT') return 'missing';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/content security policy|unsafe-eval/i.test(message)) return 'csp';
  const status = /HTTP (\d{3})/.exec(message);
  if (status) return `http_${status[1]}`;
  if (error instanceof WebAssembly.CompileError) return 'compile';
  if (error instanceof WebAssembly.LinkError) return 'link';
  if (error instanceof TypeError && /fetch|network|load failed/i.test(message)) return 'network';
  return 'error';
}
