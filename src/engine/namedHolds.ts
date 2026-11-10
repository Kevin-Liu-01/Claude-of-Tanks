/**
 * namedHolds.ts — (2026-11-02 audit R3/R4) one owner for a switch that several modules hold at once.
 *
 * The adaptive governor's suspension and the temporal-AA override were single booleans that every owner wrote
 * directly (last writer wins): a context restore during a covered battle load turned the governor back on while the
 * load still held it, and a Studio film restored a snapshot of TAA that a preset change had since replaced. Here the
 * switch is derived: it is on while any named hold stands, and each owner releases only what it acquired.
 *
 * Two hold shapes share one state:
 * - `acquire(reason)` returns a counted handle; its `release()` runs once (a second call is ignored). For owners that
 *   start and finish in one place (the Studio film).
 * - `set(reason, held)` is a latch, one slot per reason; setting it twice is one hold. For an owner whose start and end
 *   live in different modules (the covered loading phase: the Garage's battle start, the solo and network loads, the
 *   Garage return) or an event pair (context lost / restored).
 *
 * `onChange(held)` runs only when the derived switch flips, never on a hold that leaves it unchanged. No DOM; Node-runnable.
 */
export interface NamedHold<Reason extends string> {
  readonly reason: Reason;
  readonly released: boolean;
  release(): void;
}

export interface NamedHolds<Reason extends string> {
  /** True while any hold (handle or latch) stands. */
  readonly held: boolean;
  acquire(reason: Reason): NamedHold<Reason>;
  set(reason: Reason, held: boolean): void;
  has(reason: Reason): boolean;
  /** The reasons holding now (allocates: telemetry and tests only). */
  reasons(): Reason[];
}

export function createNamedHolds<Reason extends string>(onChange: (held: boolean) => void): NamedHolds<Reason> {
  const counts = new Map<Reason, number>();
  const latched = new Set<Reason>();
  let total = 0;
  const change = (delta: number): void => {
    const was = total > 0;
    total += delta;
    const now = total > 0;
    if (was !== now) onChange(now);
  };
  return {
    get held() { return total > 0; },
    acquire(reason) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      let released = false;
      const hold: NamedHold<Reason> = {
        reason,
        get released() { return released; },
        release() {
          if (released) return;
          released = true;
          const left = (counts.get(reason) ?? 1) - 1;
          if (left > 0) counts.set(reason, left); else counts.delete(reason);
          change(-1);
        },
      };
      change(1);
      return hold;
    },
    set(reason, held) {
      if (held === latched.has(reason)) return;
      if (held) latched.add(reason); else latched.delete(reason);
      change(held ? 1 : -1);
    },
    has(reason) { return latched.has(reason) || (counts.get(reason) ?? 0) > 0; },
    reasons() {
      const out: Reason[] = [...latched];
      for (const reason of counts.keys()) if (!latched.has(reason)) out.push(reason);
      return out;
    },
  };
}
