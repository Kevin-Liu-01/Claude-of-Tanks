/**
 * The wreck bake prefetch (2026-10-07, the time-to-battle lane; the owner: "going into games takes a long time").
 *
 * A map's props build bakes its tank wrecks one by one in the wreck worker (wreckBakeClient.ts): each placement asks
 * for a donor's settled, charred hulk and waits for it, so the bakes ran in series on the world build's critical path,
 * after the terrain and the vegetation. The bakes a map asks for are fixed by its seed and config, so
 * tools/wreck-bake-plan.mjs records them per map (maps/wreckBakePlan.ts) and the world build starts them here, in a
 * worker of their own, when it starts — beside the terrain and vegetation on the main thread. The props build takes a
 * planned bake when it asks for it (the same donor, seed and pop through the same worker code: the same wreck); a
 * request the plan does not hold is baked on demand as before, so a stale plan costs time, never a different wreck.
 *
 * Desktop tier, the standard terrain and the plan's seeds only (a phone places two wrecks, an assault variant carves
 * other ground and another terrain seed lays other roads, so their requests differ from the plan), where a Worker exists.
 */
import { getDeviceTier } from '../engine/quality.ts';
import { WRECK_BAKE_PLAN } from './maps/wreckBakePlan.ts';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import type { WreckBake, WreckOptions } from './wrecks.ts';

export type WreckBakePlanRow = readonly [string, number, 0 | 1];

interface PrefetchClient {
  prepare(): void;
  bake(specId: string, options: WreckOptions, checkpoint: () => Promise<void> | void): Promise<WreckBake | null>;
  dispose(): void;
}

export interface WreckBakePrefetchStats {
  planned: number;
  taken: number;
  missed: number;
  settled: number;
  failed: number;
  /** ms from the start to the last planned bake settled */
  doneMs: number;
}

export interface WreckBakePrefetch {
  /** The planned bake for this donor and options, or null when the plan holds none (bake it on demand). */
  take(specId: string, options: { seed: number; pop: boolean }): Promise<WreckBake | null> | null;
  /** Stop the worker and release every planned bake nobody took. */
  dispose(): void;
  readonly stats: WreckBakePrefetchStats;
}

export function wreckBakeKey(specId: string, seed: number, pop: boolean | 0 | 1): string {
  return `${specId}|${seed}|${pop ? 1 : 0}`;
}

function releaseBake(baked: WreckBake | null): void {
  baked?.geo.dispose();
  baked?.shadowGeo?.dispose();
}

/** Start the planned bakes, in plan order, one at a time in a worker of their own. */
export function startWreckBakePrefetch(
  rows: readonly WreckBakePlanRow[],
  makeClient: () => PrefetchClient = () => createWreckBakeClient(),
  now: () => number = () => performance.now(),
): WreckBakePrefetch {
  const client = makeClient();
  const pending = new Map<string, Promise<WreckBake | null>>();
  const stats: WreckBakePrefetchStats = { planned: 0, taken: 0, missed: 0, settled: 0, failed: 0, doneMs: 0 };
  const startedAt = now();
  let disposed = false;
  let chain: Promise<unknown> = Promise.resolve();
  client.prepare();
  for (const [specId, seed, pop] of rows) {
    const key = wreckBakeKey(specId, seed, pop);
    if (pending.has(key)) continue;
    stats.planned++;
    const job = chain.then(() => {
      if (disposed) throw new Error('Wreck prefetch disposed');
      return client.bake(specId, { seed, pop: !!pop }, () => undefined);
    }).finally(() => {
      stats.settled++;
      stats.doneMs = Math.round(now() - startedAt);
    });
    job.catch(() => { stats.failed++; });
    chain = job.catch(() => null);
    pending.set(key, job);
  }
  return {
    take(specId, options) {
      const key = wreckBakeKey(specId, options.seed, options.pop);
      const job = pending.get(key);
      if (!job) { stats.missed++; return null; }
      pending.delete(key);
      stats.taken++;
      return job;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of pending.values()) job.then(releaseBake, () => {});
      pending.clear();
      client.dispose();
    },
    get stats() { return stats; },
  };
}

/** The world build's prefetch for a map, or null where the plan does not apply (see the module note). */
export function startPlannedWreckBakes(mapId: string, terrainVariant: string | null | undefined): WreckBakePrefetch | null {
  if (typeof Worker === 'undefined' || terrainVariant || getDeviceTier() === 'mobile') return null;
  const rows = WRECK_BAKE_PLAN[mapId];
  return rows?.length ? startWreckBakePrefetch(rows) : null;
}
