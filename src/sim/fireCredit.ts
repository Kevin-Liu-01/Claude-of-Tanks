/**
 * fireCredit.ts — who set a fire (death-flow-275 R8). A hull that burns out was killed by the crew whose round set it
 * alight, not by itself: the kill, the mode's score and the kill cam's card are theirs. Both drivers keep one ledger (the
 * solo step in game/state.ts, the room authority in sim/authoritativeMatch.ts): a hit that starts a fire records its
 * shooter, a fire that goes out or a hull destroyed or revived forgets it. A fire with no recorded starter (a crash) stays
 * the hull's own, as before. The authority's two ledgers ride a host migration's keyframe (279: NewModeCheckpoint.host;
 * before it a fire burning through a migration was the hull's own kill). Pure, Node-runnable. Copyright © 2026 Kevin B. Liu.
 */
export interface FireCredit {
  /** A hit set `targetId` alight; a crew's own splash on itself starts no credit. */
  ignite(targetId: string, attackerId: string | null | undefined): void;
  /** The crew credited with a fire's kill: the starter, else the burning hull itself. */
  killerOf(targetId: string): string;
  /** The fire went out, the hull was destroyed or it was revived. */
  clear(targetId: string): void;
  /** A new battle. */
  reset(): void;
  /** Every burning hull's starter, in the order they were set alight (a migration keyframe; 279). */
  capture(): [targetId: string, starterId: string][];
  /** A migrated host's ledger: the old host's, whole; an entry that is not two ids is left out. */
  restore(entries: readonly (readonly [string, string])[]): void;
}

export function createFireCredit(): FireCredit {
  const starters = new Map<string, string>();
  return {
    ignite(targetId, attackerId) {
      if (!attackerId || attackerId === targetId || starters.has(targetId)) return;
      starters.set(targetId, attackerId);
    },
    killerOf(targetId) { return starters.get(targetId) ?? targetId; },
    clear(targetId) { starters.delete(targetId); },
    reset() { starters.clear(); },
    capture() { return [...starters]; },
    restore(entries) {
      starters.clear();
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') starters.set(entry[0], entry[1]);
      }
    },
  };
}

/** The destruction cause a fire's tick reports: a rack the fire cooked off is an ammo-rack kill (the turret goes). */
export function fireDeathCause(ammoRacked: boolean): 'ammorack' | 'fire' {
  return ammoRacked ? 'ammorack' : 'fire';
}

/**
 * (death-flow-275 R7) Who damaged each hull last, and when: a scuttled hull's kill is the enemy's that hurt it last within
 * the window (sim/matchRuleset.ts SCUTTLE_CREDIT_S), so a crew cannot scuttle a kill away. Both drivers keep one.
 */
export interface RecentDamage {
  record(targetId: string, attackerId: string | null | undefined, timeS: number): void;
  /** The last damaging attacker within `windowS` of `timeS`, else null. */
  creditFor(targetId: string, timeS: number, windowS: number): string | null;
  clear(targetId: string): void;
  reset(): void;
  /** Each hull's last damaging attacker and when, on the clock `record` was given (a migration keyframe; 279). */
  capture(): [targetId: string, attackerId: string, atS: number][];
  /** A migrated host's ledger: the old host's, whole, its times on the same clock; a malformed entry is left out. */
  restore(entries: readonly (readonly [string, string, number])[]): void;
}

export function createRecentDamage(): RecentDamage {
  const last = new Map<string, { by: string; atS: number }>();
  return {
    record(targetId, attackerId, timeS) {
      if (!attackerId || attackerId === targetId) return;
      const entry = last.get(targetId);
      if (entry) { entry.by = attackerId; entry.atS = timeS; } else last.set(targetId, { by: attackerId, atS: timeS });
    },
    creditFor(targetId, timeS, windowS) {
      const entry = last.get(targetId);
      return entry && timeS - entry.atS <= windowS ? entry.by : null;
    },
    clear(targetId) { last.delete(targetId); },
    reset() { last.clear(); },
    capture() { return [...last].map(([targetId, entry]): [string, string, number] => [targetId, entry.by, entry.atS]); },
    restore(entries) {
      last.clear();
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string' && Number.isFinite(entry[2])) {
          last.set(entry[0], { by: entry[1], atS: entry[2] });
        }
      }
    },
  };
}
