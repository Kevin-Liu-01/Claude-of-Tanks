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
 * The plan holds every map's desktop requests on the standard terrain, and the phone tier's and the assault terrain's
 * where they differ (a phone places two wrecks and dresses less; the assault variant carves trenches the wreck pass
 * steers round): `${mapId}@mobile`, `${mapId}@assault`, `${mapId}@assault-mobile`, resolved by resolveWreckBakeRows.
 * The plan's seed only (another terrain seed lays other roads), where a Worker exists. tools/wreck-bake-plan.mjs --check
 * (src/world/wreckBakePlanDrift.selftest.mjs) holds the plan to the tree.
 */
import { getDeviceTier } from '../engine/quality.ts';
import { WRECK_BAKE_PLAN, WRECK_BAKE_PLAN_VARIANTS } from './maps/wreckBakePlan.ts';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import type { WreckBake, WreckOptions } from './wrecks.ts';

type WreckBakePlanRow = readonly [string, number, 0 | 1];

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
  // (the wreck-worker lane, 2026-10-09) after one failed bake the rest of the plan is not started: a worker that cannot
  // start or went silent would otherwise cost each planned bake its own timeout, and the props build waits on them
  // (it bakes what the plan could not deliver itself, props.ts)
  let stopped = false;
  let chain: Promise<unknown> = Promise.resolve();
  client.prepare();
  for (const [specId, seed, pop] of rows) {
    const key = wreckBakeKey(specId, seed, pop);
    if (pending.has(key)) continue;
    stats.planned++;
    const job = chain.then(() => {
      if (disposed) throw new Error('Wreck prefetch disposed');
      if (stopped) throw new Error('Wreck prefetch stopped after a failed bake');
      return client.bake(specId, { seed, pop: !!pop }, () => undefined);
    }).finally(() => {
      stats.settled++;
      stats.doneMs = Math.round(now() - startedAt);
    });
    job.catch(() => { stats.failed++; stopped = true; });
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

type WreckBakeRows = ReadonlyArray<WreckBakePlanRow>;
type WreckBakeVariant = 'mobile' | 'assault' | 'assault-mobile';

/**
 * A map's planned bakes for a tier and terrain: the variant's own rows where the plan holds them, else what it falls
 * back to — the assault phone to the phone, the phone and the assault terrain to the desktop plan. The plan tool keeps a
 * variant's rows only where they differ from that fallback, so this resolution is the whole plan.
 */
export function resolveWreckBakeRows(
  tables: { plan: Readonly<Record<string, WreckBakeRows>>; variants: Readonly<Record<string, WreckBakeRows>> },
  mapId: string, { mobile, assault }: { mobile: boolean; assault: boolean },
): WreckBakeRows | null {
  const own = (variant: WreckBakeVariant): WreckBakeRows | undefined => tables.variants[`${mapId}@${variant}`];
  const desktop = tables.plan[mapId] ?? null;
  if (assault && mobile) return own('assault-mobile') ?? own('mobile') ?? desktop;
  if (assault) return own('assault') ?? desktop;
  if (mobile) return own('mobile') ?? desktop;
  return desktop;
}

/** The world build's prefetch for a map, or null where the plan holds nothing (see the module note). */
export function startPlannedWreckBakes(mapId: string, terrainVariant: string | null | undefined): WreckBakePrefetch | null {
  if (typeof Worker === 'undefined') return null;
  const rows = resolveWreckBakeRows({ plan: WRECK_BAKE_PLAN, variants: WRECK_BAKE_PLAN_VARIANTS }, mapId,
    { mobile: getDeviceTier() === 'mobile', assault: terrainVariant === 'assault-trenches' });
  return rows?.length ? startWreckBakePrefetch(rows) : null;
}
