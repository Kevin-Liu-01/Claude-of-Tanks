/**
 * fireCredit.ts — who set a fire (death-flow-275 R8). A hull that burns out was killed by the crew whose round set it
 * alight, not by itself: the kill, the mode's score and the kill cam's card are theirs. Both drivers keep one ledger (the
 * solo step in game/state.ts, the room authority in sim/authoritativeMatch.ts): a hit that starts a fire records its
 * shooter, a fire that goes out or a hull destroyed or revived forgets it. A fire with no recorded starter (a crash, a
 * ledger lost to a host migration) stays the hull's own, as before. Pure, Node-runnable. Copyright © 2026 Kevin B. Liu.
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
  };
}

/** The destruction cause a fire's tick reports: a rack the fire cooked off is an ammo-rack kill (the turret goes). */
export function fireDeathCause(ammoRacked: boolean): 'ammorack' | 'fire' {
  return ammoRacked ? 'ammorack' : 'fire';
}
