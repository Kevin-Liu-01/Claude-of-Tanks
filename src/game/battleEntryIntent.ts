/**
 * What the current solo entry asked for beyond its tank and map (2026-11-02 audit F2): the battlefield variant its
 * mode carves (Frontline Assault's trenches), the campaign operation it flies, and whether it was a watched battle.
 * Every solo entry records all three at once, so nothing of an earlier entry survives into a later one (a Play-menu
 * start after a watched Garage battle left "watched" set, and Battle Again then watched instead of fighting), and a
 * world build that names its own variant (a network room, null for a standard room) is never given a solo leftover.
 * Pure state: main owns the instance; the Garage phase clears it.
 */
export type BattleTerrainVariant = 'assault-trenches' | null;

export interface BattleEntryIntentRecord {
  readonly terrainVariant: BattleTerrainVariant;
  readonly campaignOperationId: string | null;
  readonly watched: boolean;
}

export interface BattleEntryIntent extends BattleEntryIntentRecord {
  /** A solo entry's whole intent, replacing every field of the last one. */
  begin(intent: BattleEntryIntentRecord): void;
  clear(): void;
  /**
   * The variant a world build takes: an explicit request wins, null included (a network room's standard battlefield);
   * only a battle-context build that names none takes the solo entry's.
   */
  resolveTerrainVariant(requested: BattleTerrainVariant | undefined, battleContext: boolean): BattleTerrainVariant;
}

const EMPTY: BattleEntryIntentRecord = Object.freeze({ terrainVariant: null, campaignOperationId: null, watched: false });

export function createBattleEntryIntent(): BattleEntryIntent {
  let current: BattleEntryIntentRecord = EMPTY;
  return {
    get terrainVariant() { return current.terrainVariant; },
    get campaignOperationId() { return current.campaignOperationId; },
    get watched() { return current.watched; },
    begin({ terrainVariant, campaignOperationId, watched }) {
      current = Object.freeze({
        terrainVariant: terrainVariant === 'assault-trenches' ? terrainVariant : null,
        campaignOperationId: typeof campaignOperationId === 'string' && campaignOperationId ? campaignOperationId : null,
        watched: watched === true,
      });
    },
    clear() { current = EMPTY; },
    resolveTerrainVariant(requested, battleContext) {
      if (requested !== undefined) return requested === 'assault-trenches' ? requested : null;
      return battleContext ? current.terrainVariant : null;
    },
  };
}
