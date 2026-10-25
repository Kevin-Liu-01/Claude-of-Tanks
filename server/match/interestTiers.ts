/**
 * Interest tiers of the per-viewer snapshot publisher (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.3 and §13.9).
 *
 * The spotting filter decides WHICH entities a viewer receives — upstream of this module, in the authority's viewer
 * snapshot: a hidden enemy is never sent at any tier. The tiers decide HOW OFTEN each visible entity's row is refreshed
 * for that viewer: every snapshot when near or engaged (the viewer's own vehicle always), every second snapshot in the
 * middle band, every third far away. A row that is not refreshed is the one the viewer already holds: the delta codec
 * sends nothing for it and the row keeps the tick it was captured at, so the client interpolates the entity between
 * its own samples instead of reading a held row as a fresh pose. Events (shots, hits, deaths, chat) are never tiered.
 *
 * The radii come from the fleet's engagement ranges: spotting is unconditional inside 50 m and reaches 445 m at most
 * (src/sim/spotting.ts), the guns engage at 100–400 m, the battlefields span 600–1,000 m. Inside INTEREST_NEAR_M a hull
 * can ram, flank or be aimed at within a second; out to INTEREST_MID_M every second sample still places a hull moving at
 * 15 m/s within 0.5 m of its true pose at the client's interpolation delay; beyond it a third sample keeps a distant
 * hull to a metre. Engagement (a hit either way, a shell landing beside the viewer, a ram) puts an entity on the near
 * tier for INTEREST_ENGAGED_S whatever its distance, so an exchange at 400 m is followed at full rate.
 *
 * Refreshes are phased by entity id so the far tier's rows never all land on one snapshot. Node-runnable; the per-viewer
 * state is typed arrays and one row reference per entity — nothing is allocated per snapshot.
 *
 * The snapshot budget (mp-scale-251, docs/MULTIPLAYER-V2.md §13.30). A host's uplink grows with every viewer it serves,
 * and each viewer's stream with every entity it sees: a 14v14 host sent 3.4 Mbit/s, a 32v32 test room 5.3. The rows a
 * viewer must have are never held back: its own hull, an entity engaged with it, and an entity that has just come into
 * view. The other rows due on a snapshot are refreshed most stale first, the nearer tier first among equals, while the
 * viewer's row budget lasts (snapshotRowBudgetBytes: the host's uplink target shared by its viewers); a row the budget
 * cannot carry is held, as a
 * row between its refreshes is, and is due again on the next snapshot (`deferred`); one that has waited
 * MAX_DEFERRED_STALENESS cadences is refreshed whatever the budget, so it never starves. With the budget unspent the
 * tiers' cadences are exactly what they were.
 */
import { MAX_ENTITIES, TICK_HZ } from '../../src/mp/wire/constants.ts';
import type { EntityRow } from '../../src/mp/wire/messages.ts';

/** Every snapshot inside this distance (m) of the viewer's hull. */
export const INTEREST_NEAR_M = 100;
/** Every second snapshot inside this distance (m); every third beyond it. */
export const INTEREST_MID_M = 300;
/** Snapshots between refreshes per tier. */
export const INTEREST_CADENCE: readonly [number, number, number] = Object.freeze([1, 2, 3]) as unknown as readonly [number, number, number];
/** After a hit either way, a near miss or a ram: the entity stays on the near tier for this long. */
const INTEREST_ENGAGED_S = 4;
export const INTEREST_ENGAGED_TICKS = INTEREST_ENGAGED_S * TICK_HZ;
/** A shell landing within this distance (m) of the viewer counts as fired at it. */
export const INTEREST_NEAR_MISS_M = 15;

export type InterestTier = 0 | 1 | 2;

/** The host uplink a match aims to stay under (bits per second; §13.9's 14v14 line), shared by its viewers. */
export const HOST_UPLINK_TARGET_BPS = 4_000_000;
/** A snapshot's bytes besides its rows (the header and meta, the viewer section): what the budget leaves them. */
const SNAPSHOT_OVERHEAD_BYTES = 220;
/** The row budget never falls under this (about ten moving rows): a crowded room stretches far rows, never starves the near ones' neighbours. */
const MIN_ROW_BUDGET_BYTES = 160;

/**
 * A viewer's row budget per snapshot (bytes): the host's uplink target divided among `viewers` at `snapshotHz`, less a
 * snapshot's overhead, never under MIN_ROW_BUDGET_BYTES. At 14v14 (28 viewers, 20 Hz) about 670 B, which only bursts
 * reach; at 63 viewers about 180 B, which stretches the mid and far tiers.
 */
export function snapshotRowBudgetBytes(viewers: number, snapshotHz: number, uplinkTargetBps = HOST_UPLINK_TARGET_BPS): number {
  if (!(uplinkTargetBps > 0) || !Number.isFinite(uplinkTargetBps)) return Infinity;
  const perSnapshot = uplinkTargetBps / Math.max(1, viewers) / Math.max(1, snapshotHz) / 8;
  return Math.max(MIN_ROW_BUDGET_BYTES, Math.floor(perSnapshot - SNAPSHOT_OVERHEAD_BYTES));
}

const NEAR_SQ = INTEREST_NEAR_M * INTEREST_NEAR_M;
const MID_SQ = INTEREST_MID_M * INTEREST_MID_M;

/** The tier of an entity at squared distance `distanceSqM` from the viewer's hull. */
export function interestTierFor(distanceSqM: number): InterestTier {
  if (distanceSqM <= NEAR_SQ) return 0;
  if (distanceSqM <= MID_SQ) return 1;
  return 2;
}

/** Whether a row on a tier of cadence `cadence` is refreshed at snapshot `snapshotIndex` (phases spread by entity id). */
export function refreshDue(snapshotIndex: number, entityId: number, cadence: number): boolean {
  return cadence <= 1 || (snapshotIndex + entityId) % cadence === 0;
}

/** One viewer's interest state: what it holds per entity and its counters. */
export interface ViewerInterest {
  /** The row the viewer holds per entity id (null: never sent). */
  readonly rows: Array<EntityRow | null>;
  /** The snapshot index each entity was last included at (-1: never). */
  readonly seenAt: Int32Array;
  /** The authority tick until which each entity is engaged with the viewer (0: not engaged). */
  readonly engagedUntil: Int32Array;
  /** The snapshot index each entity's row was last refreshed at (-1: never). */
  readonly freshAt: Int32Array;
  /** 1 while an entity's due row waits for the budget (it is due again on the next snapshot). */
  readonly deferred: Uint8Array;
  /** Due rows the budget held back since the viewer attached. */
  deferredRows: number;
  /** Rows refreshed per tier since the viewer attached. */
  readonly published: [number, number, number];
  /** Rows carried over unchanged since the viewer attached. */
  held: number;
  /** Entities per tier in the newest snapshot. */
  readonly population: [number, number, number];
}

export function createViewerInterest(): ViewerInterest {
  return {
    rows: new Array<EntityRow | null>(MAX_ENTITIES + 1).fill(null),
    seenAt: new Int32Array(MAX_ENTITIES + 1).fill(-1),
    engagedUntil: new Int32Array(MAX_ENTITIES + 1),
    freshAt: new Int32Array(MAX_ENTITIES + 1).fill(-1),
    deferred: new Uint8Array(MAX_ENTITIES + 1),
    deferredRows: 0,
    published: [0, 0, 0],
    held: 0,
    population: [0, 0, 0],
  };
}

/** Mark `entityId` engaged with the viewer until `untilTick`. */
export function engageEntity(interest: ViewerInterest, entityId: number, untilTick: number): void {
  if (entityId < 1 || entityId > MAX_ENTITIES) return;
  if (untilTick > interest.engagedUntil[entityId]!) interest.engagedUntil[entityId] = untilTick;
}

/** The tier of `entityId` for this viewer at `tick`: the near tier while engaged, else by distance. */
export function viewerTierFor(interest: ViewerInterest, entityId: number, tick: number, distanceSqM: number): InterestTier {
  return interest.engagedUntil[entityId]! > tick ? 0 : interestTierFor(distanceSqM);
}

/**
 * Whether the viewer's row for `entityId` must be captured fresh at snapshot `snapshotIndex` on `tier`: always on the
 * near tier, always when the viewer holds no row or the entity was absent from the previous snapshot (it just came
 * into view — a held row from before that would be stale), else by the tier's phased cadence.
 */
export function needsFreshRow(interest: ViewerInterest, entityId: number, tier: InterestTier, snapshotIndex: number): boolean {
  const cadence = INTEREST_CADENCE[tier];
  if (cadence <= 1) return true;
  if (!interest.rows[entityId] || interest.seenAt[entityId] !== snapshotIndex - 1) return true;
  return interest.deferred[entityId] === 1 || refreshDue(snapshotIndex, entityId, cadence);
}

/**
 * Whether a fresh row for `entityId` may not wait for the budget: the viewer's own hull, an entity engaged with it, a
 * viewer that holds no row, and an entity absent from the previous snapshot (a held row would be stale). A near row
 * otherwise may wait, last of all and one snapshot at most (MAX_DEFERRED_STALENESS on a cadence of one).
 */
export function mustRefreshRow(interest: ViewerInterest, entityId: number, snapshotIndex: number, tick: number, own: boolean): boolean {
  return own || interest.engagedUntil[entityId]! > tick || !interest.rows[entityId] || interest.seenAt[entityId] !== snapshotIndex - 1;
}

/**
 * A due row this overdue (in its tier's cadences) is refreshed whatever the budget: a viewer whose must-refresh rows
 * alone spend its share (a 63-viewer test room: eleven near hulls each) would otherwise hold its mid and far rows
 * forever. Under any budget a mid row is refreshed at least every 4 snapshots (5 Hz at 20 Hz) and a far row every 6.
 */
export const MAX_DEFERRED_STALENESS = 2;

/** How overdue a due row is: snapshots since its last refresh over its tier's cadence (the budget refreshes the largest first). */
export function rowStaleness(interest: ViewerInterest, entityId: number, tier: InterestTier, snapshotIndex: number): number {
  const freshAt = interest.freshAt[entityId]!;
  return freshAt < 0 ? Infinity : (snapshotIndex - freshAt) / INTEREST_CADENCE[tier];
}

/** A due row the budget holds back: the viewer keeps the row it holds, and the row is due again next snapshot. */
export function deferRow(interest: ViewerInterest, entityId: number): void {
  interest.deferred[entityId] = 1;
  interest.deferredRows++;
}

/** Begin a snapshot: the tier populations count afresh. */
export function beginSnapshot(interest: ViewerInterest): void {
  interest.population[0] = 0;
  interest.population[1] = 0;
  interest.population[2] = 0;
}

/** Record the row chosen for `entityId` at `snapshotIndex` on `tier`. */
export function recordRow(interest: ViewerInterest, entityId: number, tier: InterestTier, snapshotIndex: number, row: EntityRow, fresh: boolean): void {
  interest.rows[entityId] = row;
  interest.seenAt[entityId] = snapshotIndex;
  interest.population[tier]++;
  if (fresh) {
    interest.published[tier]++;
    interest.freshAt[entityId] = snapshotIndex;
    interest.deferred[entityId] = 0;
  } else interest.held++;
}
