// Campaign slice 5 (2026-09-14, owner: "build the campaign slice, I still don't see campaign
// gameplay"): the Frontline Assault sorties form a ladder of six named operations along one
// front. Each operation is a Frontline Assault battle on a fixed map; clearing it (holding its
// last sector, which campaignProgress records as `held`) unlocks the next. The ladder is pure
// data over the existing per-map record — no wallet, research or server state.
//
// Batch 19 (2026-09-14 evening, owner: "make the other game modes much better and fully fleshed
// out, especially campaign"): every operation now carries a difficulty that folds into the
// Frontline Assault ruleset (extra defenders, tougher hulls — sim/matchRuleset.ts), its own
// sortie clock (lost on expiry), a par time for the second star, and the nation whose vehicles
// fill the enemy roster first. Stars (cleared / under par / no ally lost) live in the record.
import type { MapId } from '../world/maps/catalog.ts';
import type { CampaignRulesetInput } from '../sim/matchRuleset.ts';
import {
  CAMPAIGN_PAR_SHARE, readCampaignRecord, type CampaignRecord, type FrontlineMapProgress,
} from './campaignProgress.ts';

type CampaignEnemy = 'russia' | 'germany' | 'china' | 'usa';

export interface CampaignOperation {
  readonly id: string;
  /** 1-based position on the ladder. */
  readonly index: number;
  readonly mapId: MapId;
  /** The formation named in the brief; the enemy roster prefers vehicles of these nations. */
  readonly enemy: CampaignEnemy;
  /** 1-based ladder difficulty folded into the Frontline Assault ruleset (defenders, hull). */
  readonly difficulty: number;
  /** Sortie clock in seconds; the operation is lost when it runs out. */
  readonly timeLimitS: number;
}

export const CAMPAIGN_OPERATIONS: readonly CampaignOperation[] = Object.freeze([
  Object.freeze({ id: 'first_light', index: 1, mapId: 'verdant', enemy: 'russia', difficulty: 1, timeLimitS: 780 }),
  Object.freeze({ id: 'iron_ridge', index: 2, mapId: 'alpine', enemy: 'germany', difficulty: 2, timeLimitS: 750 }),
  Object.freeze({ id: 'steinburg', index: 3, mapId: 'urban', enemy: 'germany', difficulty: 3, timeLimitS: 720 }),
  Object.freeze({ id: 'tarkhan_steppe', index: 4, mapId: 'steppe', enemy: 'russia', difficulty: 4, timeLimitS: 720 }),
  Object.freeze({ id: 'frontier_basin', index: 5, mapId: 'frontier', enemy: 'china', difficulty: 5, timeLimitS: 690 }),
  Object.freeze({ id: 'delta_crossing', index: 6, mapId: 'delta', enemy: 'usa', difficulty: 6, timeLimitS: 660 }),
] as const);

/** Spec `nation` strings that count as an operation's formation (the fleet spells a few of them two ways). */
export const CAMPAIGN_ENEMY_NATIONS: Readonly<Record<CampaignEnemy, readonly string[]>> = Object.freeze({
  russia: Object.freeze(['Russia', 'USSR', 'USSR/Russia', 'RU']),
  germany: Object.freeze(['Germany']),
  china: Object.freeze(['China']),
  usa: Object.freeze(['USA', 'US']),
});

type CampaignOperationStatus = 'locked' | 'ready' | 'cleared';

interface CampaignLadderEntry {
  readonly operation: CampaignOperation;
  readonly status: CampaignOperationStatus;
  /** The per-map Frontline record behind the status, when the map has been fought. */
  readonly progress: FrontlineMapProgress | null;
  /** Best stars earned on the operation (0–3). */
  readonly stars: number;
}

export function campaignOperationById(id: string | null | undefined): CampaignOperation | null {
  if (!id) return null;
  return CAMPAIGN_OPERATIONS.find((operation) => operation.id === id) ?? null;
}

export function campaignOperationForMap(mapId: string | null | undefined): CampaignOperation | null {
  if (!mapId) return null;
  return CAMPAIGN_OPERATIONS.find((operation) => operation.mapId === mapId) ?? null;
}

/** Par time (second star) for an operation: a fixed share of its clock. */
export function campaignParTimeS(operation: Pick<CampaignOperation, 'timeLimitS'>): number {
  return Math.round(operation.timeLimitS * CAMPAIGN_PAR_SHARE);
}

/** What the Frontline Assault ruleset folds in for an operation (null for a free sortie). */
export function campaignRulesetInput(operationId: string | null | undefined): CampaignRulesetInput | null {
  const operation = campaignOperationById(operationId);
  return operation ? { difficulty: operation.difficulty, timeLimitS: operation.timeLimitS, enemy: operation.enemy } : null;
}

/** Spec nations the enemy roster fills first for an operation ([] for a free sortie). */
export function campaignEnemyNations(operationId: string | null | undefined): readonly string[] {
  const operation = campaignOperationById(operationId);
  return operation ? CAMPAIGN_ENEMY_NATIONS[operation.enemy] : [];
}

function clearedIn(record: CampaignRecord, operation: CampaignOperation): boolean {
  return (record.frontline[operation.mapId]?.held ?? 0) > 0;
}

/** An operation is cleared once its last sector was held; the first is always ready, later ones open when the previous is cleared. */
export function campaignOperationStatus(
  operation: CampaignOperation,
  record: CampaignRecord = readCampaignRecord(),
): CampaignOperationStatus {
  if (clearedIn(record, operation)) return 'cleared';
  if (operation.index === 1) return 'ready';
  const previous = CAMPAIGN_OPERATIONS[operation.index - 2];
  return previous && clearedIn(record, previous) ? 'ready' : 'locked';
}

export function campaignLadder(record: CampaignRecord = readCampaignRecord()): CampaignLadderEntry[] {
  return CAMPAIGN_OPERATIONS.map((operation) => {
    const progress = record.frontline[operation.mapId] ?? null;
    return {
      operation,
      status: campaignOperationStatus(operation, record),
      progress,
      stars: Math.max(0, Math.min(3, Math.floor(progress?.stars ?? 0))),
    };
  });
}

/** The operation after this one on the ladder, or null at the end. */
export function campaignNextOperation(operation: CampaignOperation | null | undefined): CampaignOperation | null {
  if (!operation) return null;
  return CAMPAIGN_OPERATIONS[operation.index] ?? null;
}

interface CampaignSummary {
  readonly cleared: number;
  readonly total: number;
  /** Stars earned across the ladder, out of three per operation. */
  readonly stars: number;
  readonly maxStars: number;
  /** The next operation to fight: the first ready one, or the last one when everything is cleared. */
  readonly next: CampaignOperation;
}

export function campaignSummary(record: CampaignRecord = readCampaignRecord()): CampaignSummary {
  const ladder = campaignLadder(record);
  const cleared = ladder.filter((entry) => entry.status === 'cleared').length;
  const next = ladder.find((entry) => entry.status === 'ready')?.operation
    ?? ladder[ladder.length - 1].operation;
  return {
    cleared,
    total: ladder.length,
    stars: ladder.reduce((sum, entry) => sum + entry.stars, 0),
    maxStars: ladder.length * 3,
    next,
  };
}

/** Objective copy keys every operation shares (the mode rules are the same on every map). */
export const CAMPAIGN_OBJECTIVE_KEYS = Object.freeze([
  'missionBrief.objective.take',
  'missionBrief.objective.hold',
  'missionBrief.objective.lost',
] as const);
