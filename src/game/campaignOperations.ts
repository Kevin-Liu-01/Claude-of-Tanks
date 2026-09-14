// Campaign slice 5 (2026-09-14, owner: "build the campaign slice, I still don't see campaign
// gameplay"): the Frontline Assault sorties form a ladder of six named operations along one
// front. Each operation is a Frontline Assault battle on a fixed map; clearing it (holding its
// last sector, which campaignProgress records as `held`) unlocks the next. The ladder is pure
// data over the existing per-map record — no wallet, research or server state.
import type { MapId } from '../world/maps/catalog.ts';
import { readCampaignRecord, type CampaignRecord, type FrontlineMapProgress } from './campaignProgress.ts';

export type CampaignEnemy = 'russia' | 'germany' | 'china' | 'usa';

export interface CampaignOperation {
  readonly id: string;
  /** 1-based position on the ladder. */
  readonly index: number;
  readonly mapId: MapId;
  /** Copy only: the formation named in the brief; the roster stays the battle's random roster. */
  readonly enemy: CampaignEnemy;
}

export const CAMPAIGN_OPERATIONS: readonly CampaignOperation[] = Object.freeze([
  Object.freeze({ id: 'first_light', index: 1, mapId: 'verdant', enemy: 'russia' }),
  Object.freeze({ id: 'iron_ridge', index: 2, mapId: 'alpine', enemy: 'germany' }),
  Object.freeze({ id: 'steinburg', index: 3, mapId: 'urban', enemy: 'germany' }),
  Object.freeze({ id: 'tarkhan_steppe', index: 4, mapId: 'steppe', enemy: 'russia' }),
  Object.freeze({ id: 'frontier_basin', index: 5, mapId: 'frontier', enemy: 'china' }),
  Object.freeze({ id: 'delta_crossing', index: 6, mapId: 'delta', enemy: 'usa' }),
] as const);

export type CampaignOperationStatus = 'locked' | 'ready' | 'cleared';

export interface CampaignLadderEntry {
  readonly operation: CampaignOperation;
  readonly status: CampaignOperationStatus;
  /** The per-map Frontline record behind the status, when the map has been fought. */
  readonly progress: FrontlineMapProgress | null;
}

export function campaignOperationById(id: string | null | undefined): CampaignOperation | null {
  if (!id) return null;
  return CAMPAIGN_OPERATIONS.find((operation) => operation.id === id) ?? null;
}

export function campaignOperationForMap(mapId: string | null | undefined): CampaignOperation | null {
  if (!mapId) return null;
  return CAMPAIGN_OPERATIONS.find((operation) => operation.mapId === mapId) ?? null;
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
  return CAMPAIGN_OPERATIONS.map((operation) => ({
    operation,
    status: campaignOperationStatus(operation, record),
    progress: record.frontline[operation.mapId] ?? null,
  }));
}

export interface CampaignSummary {
  readonly cleared: number;
  readonly total: number;
  /** The next operation to fight: the first ready one, or the last one when everything is cleared. */
  readonly next: CampaignOperation;
}

export function campaignSummary(record: CampaignRecord = readCampaignRecord()): CampaignSummary {
  const ladder = campaignLadder(record);
  const cleared = ladder.filter((entry) => entry.status === 'cleared').length;
  const next = ladder.find((entry) => entry.status === 'ready')?.operation
    ?? ladder[ladder.length - 1].operation;
  return { cleared, total: ladder.length, next };
}

/** Objective copy keys every operation shares (the mode rules are the same on every map). */
export const CAMPAIGN_OBJECTIVE_KEYS = Object.freeze([
  'missionBrief.objective.take',
  'missionBrief.objective.hold',
  'missionBrief.objective.lost',
] as const);
