/**
 * fxProf.ts — an opt-in tally of where the destruction presentation spends its frames (dcore 2026-10-11, the decisive
 * wave's hitch probe: a struck house's collapse rendered a quarter fewer frames than main's). Off unless a diagnostic
 * sets `globalThis.__fxProf = {}`: each section then adds its milliseconds, its count and its longest to that record.
 * One global read a call when off; nothing allocated either way.
 */
type FxProf = Record<string, number>;

/** A section's start (0 when the tally is off). */
export function profStart(): number {
  return (globalThis as { __fxProf?: FxProf }).__fxProf ? performance.now() : 0;
}

/** A section's end: its time, count and longest into the tally. */
export function profEnd(name: string, t0: number): void {
  if (!t0) return;
  const p = (globalThis as { __fxProf?: FxProf }).__fxProf;
  if (!p) return;
  const dt = performance.now() - t0;
  p[name] = (p[name] ?? 0) + dt;
  p[`${name}:n`] = (p[`${name}:n`] ?? 0) + 1;
  if (dt > (p[`${name}:max`] ?? 0)) p[`${name}:max`] = dt;
}
