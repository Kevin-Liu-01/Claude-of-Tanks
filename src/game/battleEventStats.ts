/** Event-only battle counters. Entity IDs, not vehicle models, own kills. */
export class BattleKillLedger {
  private counts = new Map<string, number>();
  private dead = new Set<string>();
  record(victim: string, killer: string | null | undefined, victimTeam?: string, killerTeam?: string): boolean {
    if (this.dead.has(victim)) return false;
    this.dead.add(victim);
    if (killer && killer !== victim && !(victimTeam != null && victimTeam === killerTeam)) {
      this.counts.set(killer, this.count(killer) + 1);
    }
    return true;
  }
  count(id: string): number { return this.counts.get(id) ?? 0; }
  respawn(id: string): void { this.dead.delete(id); }
  clear(): void { this.counts.clear(); this.dead.clear(); }
}

/** One fired round can hit many targets. Only its first hit counts for accuracy. */
export class FiredRoundLedger {
  private rounds = new Map<number, { hit: boolean; pen: boolean }>();
  private anonymous = 0;
  fire(id?: number | null): void {
    if (id != null && Number.isFinite(id)) this.rounds.set(id, { hit: false, pen: false });
    else this.anonymous++;
  }
  hit(id: number | null | undefined, penetrated = false): { hit: boolean; pen: boolean } {
    const round = id != null ? this.rounds.get(id) : undefined;
    if (round) {
      const fresh = { hit: !round.hit, pen: penetrated && !round.pen };
      round.hit = true; round.pen ||= penetrated;
      return fresh;
    }
    // Legacy replays omit projectile IDs. Consume only a corresponding
    // anonymous fired event; drone/ram/fire events never invent fired rounds.
    if (id == null && this.anonymous > 0) {
      this.anonymous--;
      return { hit: true, pen: penetrated };
    }
    return { hit: false, pen: false };
  }
  clear(): void { this.rounds.clear(); this.anonymous = 0; }
}
