import { createOpaqueLoadingYielder, type FrameSchedulerOptions } from '../engine/frameScheduler.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import {
  acquireSharedTextureLease,
  resolveMultiplayerCamoPattern,
  type SharedTextureLease,
} from '../vehicles/materials.ts';
import { getSpec } from '../vehicles/specs.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';

export interface BrowserRosterPlayer {
  id: string;
  name?: string;
  specId: string;
  camo?: string;
  team?: string;
}

export interface PreparedBrowserRosterPlayer extends BrowserRosterPlayer {
  camo: string;
}

export interface BrowserRosterAssetRequest {
  players: readonly BrowserRosterPlayer[];
  viewerId: string;
  spectator: boolean;
  mapId: string;
  anisotropy: number;
  signal?: AbortSignal;
  rosterScheduling?: FrameSchedulerOptions;
}

export interface BrowserRosterAssetPreparation {
  players: PreparedBrowserRosterPlayer[];
  ready: Promise<void>;
  /** Stop between jobs, drain any active painter, and release every held lease. */
  dispose(): Promise<void>;
}

export interface BrowserRosterAssetDependencies {
  ensureTankBuilder(specId: string): Promise<void>;
  getSpec(specId: string): FleetTankSpec;
  resolveMultiplayerCamoPattern(specId: string, selection: string, mapId: string): string;
  acquireSharedTextureLease(
    spec: FleetTankSpec,
    anisotropy: number,
    quality: 'high' | 'ai',
    selection: string,
    tick: () => Promise<void>,
  ): Promise<SharedTextureLease>;
}

const defaultDependencies: BrowserRosterAssetDependencies = {
  ensureTankBuilder,
  getSpec,
  resolveMultiplayerCamoPattern,
  acquireSharedTextureLease,
};

interface RosterAssetJob {
  specId: string;
  camo: string;
  quality: 'high' | 'ai';
}

export function browserRosterTextureQuality(
  playerId: string,
  viewerId: string,
  spectator: boolean,
): 'high' | 'ai' {
  return !spectator && playerId === viewerId ? 'high' : 'ai';
}

function rosterAssetJobs(
  players: readonly PreparedBrowserRosterPlayer[],
  viewerId: string,
  spectator: boolean,
): RosterAssetJob[] {
  const jobs: RosterAssetJob[] = [];
  const seen = new Set<string>();
  for (const player of players) {
    if (player.team === 'spectator') continue;
    const quality = browserRosterTextureQuality(player.id, viewerId, spectator);
    const key = JSON.stringify([player.specId, player.camo, quality]);
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ specId: player.specId, camo: player.camo, quality });
  }
  return jobs;
}

/**
 * Entry-local builder/paint preparation; never creates geometry or a bridge.
 * Concrete camouflage and viewer quality are bound before the first await so
 * later Garage intent cannot change a pending job's cache identity. Successful
 * leases survive an optional sibling failure until the caller has either
 * acquired visual references or drained the failed entry.
 */
export function prepareBrowserBattleRosterAssets(
  request: BrowserRosterAssetRequest,
  overrides: Partial<BrowserRosterAssetDependencies> = {},
): BrowserRosterAssetPreparation {
  const dependencies = { ...defaultDependencies, ...overrides };
  const { viewerId, spectator, mapId, anisotropy, signal, rosterScheduling } = request;
  const players = request.players.map((player) => ({
    ...player,
    camo: dependencies.resolveMultiplayerCamoPattern(player.specId, player.camo || 'factory', mapId),
  }));
  const jobs = rosterAssetJobs(players, viewerId, spectator);
  const yieldWork = createOpaqueLoadingYielder(8, 50, rosterScheduling);
  const leases = new Set<SharedTextureLease>();
  let stopped = false;
  let disposal: Promise<void> | null = null;
  const continueWork = (): boolean => {
    throwIfNetworkBattleEntryAborted(signal);
    return !stopped;
  };

  const ready = Promise.resolve().then(async () => {
    const builders = new Set<string>();
    for (const job of jobs) {
      if (!continueWork()) return;
      if (!builders.has(job.specId)) {
        await dependencies.ensureTankBuilder(job.specId);
        builders.add(job.specId);
      }
      if (!continueWork()) return;
      // Do not put cancellation in the painter's tick: in-place texture
      // promotions must finish before disposal or the next entry can proceed.
      const lease = await dependencies.acquireSharedTextureLease(
        dependencies.getSpec(job.specId), anisotropy, job.quality, job.camo, yieldWork,
      );
      leases.add(lease);
      if (!continueWork()) return;
      await yieldWork();
    }
    continueWork();
  });
  // Optional work can fail while world/transport are still pending. Preserve
  // the original rejection for its later join without an unhandled rejection.
  void ready.catch(() => {});

  return {
    players,
    ready,
    dispose() {
      stopped = true;
      if (!disposal) {
        disposal = ready.catch(() => {}).then(() => {
          for (const lease of leases) {
            try { lease.release(); } catch (_) { /* drain every lease; preserve the entry error */ }
          }
          leases.clear();
        });
      }
      return disposal;
    },
  };
}
