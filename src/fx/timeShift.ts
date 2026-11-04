/**
 * timeShift.ts — one fx runtime's clock-rebase registry (2026-11-02 audit R7).
 *
 * Every part of a runtime that stamps absolute fx-clock times (particles' births, a glow's or an ember's, a structure
 * fracture's face hold, a light's or a ring's birth) must move them when the runtime pins its clock elsewhere
 * (effects.ts rebaseFxClock: a capture's pin past 20 s, the Studio's reset to 0 at every load and seek), or ages jump:
 * embers expire at once, a collapsing building's redrawn faces are disposed the moment their hold should start. The
 * rebase used to be a hand list in effects.ts that had drifted from the modules (it missed the volume media's embers
 * and every stamp inside the fracture stages' structure fracture). Now each part is registered where the runtime makes
 * it (`add`: anything with a `shiftTime`), the runtime's own arrays beside it (`on`), and the rebase walks the registry;
 * a module that owns a sub-part with stamps shifts it inside its own shiftTime.
 *
 * Node-only, no three.
 */

export interface FxTimeShifting {
  shiftTime(delta: number): void;
}

export interface FxTimeShiftRegistry {
  /** Register a part the runtime made (null: an absent tier's part, skipped); returns it, for the construction site. */
  add<T extends FxTimeShifting | null | undefined>(name: string, part: T): T;
  /** Register a shift of the runtime's own stamps. */
  on(name: string, shift: (delta: number) => void): void;
  /** Move every registered stamp by `delta` seconds, in registration order. */
  shift(delta: number): void;
  /** The registered names, in order (diagnostics and selftests). */
  names(): readonly string[];
}

export function createFxTimeShiftRegistry(): FxTimeShiftRegistry {
  const names: string[] = [];
  const shifts: Array<(delta: number) => void> = [];
  const registry: FxTimeShiftRegistry = {
    add(name, part) {
      if (part) registry.on(name, (delta) => part.shiftTime(delta));
      return part;
    },
    on(name, shift) {
      if (names.includes(name)) throw new Error(`fx time shift "${name}" is registered twice`);
      names.push(name);
      shifts.push(shift);
    },
    shift(delta) {
      if (!(delta !== 0 && Number.isFinite(delta))) return;
      for (let i = 0; i < shifts.length; i++) shifts[i](delta);
    },
    names() { return names; },
  };
  return registry;
}
