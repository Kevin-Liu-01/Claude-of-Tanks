/**
 * The hulks baked after the reveal (wreck-bake-after-reveal-278; see wreckBakeFacts.ts). A browser props build with a
 * wreck worker and the map's recorded facts places each hulk from its facts (seat, collision, footprints, budget) and
 * draws its stand-in (its movement solids, charred) in a mesh of its own, 'tank-wrecks-deferred'. Once the battle is
 * shown (main.ts onReveal through world.bakeDeferredWrecks), this bakes the hulks on the worker, one at a time, poses
 * each as the props build would have (props.ts commitWreck: turned, leant to its ground, moved to its seat) and swaps the
 * mesh's geometry and its shadow proxy's for the real ones in one step. Nothing a battle reads moves: the obstacles,
 * colliders and records were laid from the facts. A bake that fails keeps its hulk's stand-in.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeWreckGeometries } from './exactWreckGeometry.ts';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import type { WreckBake } from './wrecks.ts';
import type { WreckState } from './wreckStates.ts';

/** A hulk placed from its facts: its bake's request, its pose and its stand-in (world space; null: none drawn). */
export interface DeferredWreckHulk {
  specId: string;
  options: { seed: number; state: WreckState; remnant: number };
  yaw: number;
  quaternion: [number, number, number, number];
  position: [number, number, number];
  standIn: THREE.BufferGeometry | null;
}

export interface DeferredWreckStats {
  hulks: number;
  bakes: number;
  baked: number;
  failed: number;
  /** ms from the start to the last bake settled, and to the swap; the swap's own main-thread time */
  bakedMs: number;
  swappedMs: number;
  swapMs: number;
}

/** What the props build leaves on its group (userData.deferredWrecks) for the swap. */
export interface DeferredWreckPlan {
  hulks: DeferredWreckHulk[];
  mesh: THREE.Mesh;
  shadow: THREE.Mesh | null;
  state: 'pending' | 'baking' | 'done' | 'cancelled';
  setShadowProfile(mesh: THREE.Mesh, geos: THREE.BufferGeometry[]): void;
  stats?: DeferredWreckStats;
  /** Stop a bake under way (the world's dispose). */
  cancel?: () => void;
}

interface BakeClient {
  bake(specId: string, options: DeferredWreckHulk['options'], checkpoint: () => Promise<void> | void): Promise<WreckBake | null>;
  dispose(): void;
}

/** A turn of the event loop that lets a frame through (an idle callback where the page has one). */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => resolve(), { timeout: 100 });
    else setTimeout(resolve, 0);
  });
}

const bakeKey = (hulk: DeferredWreckHulk): string => `${hulk.specId}|${hulk.options.seed}|${hulk.options.state}`;

/** A bake's geometry posed as props.ts commitWreck poses it: turned, leant to its ground, moved to its seat. */
function posed(source: THREE.BufferGeometry, hulk: DeferredWreckHulk, quat: THREE.Quaternion): THREE.BufferGeometry {
  const g = source.clone();
  const box = g.boundingBox !== null, sphere = g.boundingSphere !== null;
  g.boundingBox = null; g.boundingSphere = null;
  g.rotateY(hulk.yaw);
  g.applyQuaternion(quat);
  if (box) g.boundingBox = new THREE.Box3();
  if (sphere) g.boundingSphere = new THREE.Sphere();
  g.translate(hulk.position[0], hulk.position[1], hulk.position[2]);
  return g;
}

/**
 * Bake a plan's hulks and swap them in. Resolves with its stats once swapped (or with what it reached when cancelled);
 * a plan already started resolves at once. `makeClient`, `pace` and `now` are the receipts' seams.
 */
export async function bakeDeferredWrecks(plan: DeferredWreckPlan, {
  makeClient = () => createWreckBakeClient(),
  pace = nextTurn,
  now = () => performance.now(),
}: { makeClient?: () => BakeClient; pace?: () => Promise<void>; now?: () => number } = {}): Promise<DeferredWreckStats | null> {
  if (plan.state !== 'pending') return plan.stats ?? null;
  plan.state = 'baking';
  const startedAt = now();
  const keys = [...new Set(plan.hulks.map(bakeKey))];
  const stats: DeferredWreckStats = { hulks: plan.hulks.length, bakes: keys.length, baked: 0, failed: 0, bakedMs: 0, swappedMs: 0, swapMs: 0 };
  plan.stats = stats;
  const client = makeClient();
  const bakes = new Map<string, WreckBake | null>();
  const made: THREE.BufferGeometry[] = [];
  let cancelled = false;
  plan.cancel = () => { cancelled = true; plan.state = 'cancelled'; client.dispose(); };
  const release = (): void => {
    for (const baked of bakes.values()) { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); }
    bakes.clear();
    while (made.length) made.pop()!.dispose();
  };
  try {
    for (const key of keys) {
      const hulk = plan.hulks.find((h) => bakeKey(h) === key)!;
      let baked: WreckBake | null = null;
      try {
        baked = await client.bake(hulk.specId, hulk.options, () => (cancelled ? Promise.reject(new Error('cancelled')) : undefined));
      } catch (error) {
        if (cancelled) return stats;
        console.warn(`[wrecks] the ${hulk.specId} wreck did not bake after the reveal; its stand-in stays`, error);
      }
      if (cancelled) { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); return stats; }
      bakes.set(key, baked);
      if (baked) stats.baked++; else stats.failed++;
    }
    stats.bakedMs = Math.round(now() - startedAt);
    // each hulk posed in a turn of its own (a hulk is ~50k vertices: three transforms ~6.5 ms on a desktop)
    const drawn: THREE.BufferGeometry[] = [], shadows: THREE.BufferGeometry[] = [];
    const quat = new THREE.Quaternion();
    for (const hulk of plan.hulks) {
      await pace();
      if (cancelled) return stats;
      quat.set(...hulk.quaternion);
      const baked = bakes.get(bakeKey(hulk));
      if (baked) {
        drawn.push(posed(baked.geo, hulk, quat));
        made.push(drawn[drawn.length - 1]);
        if (baked.shadowGeo) { shadows.push(posed(baked.shadowGeo, hulk, quat)); made.push(shadows[shadows.length - 1]); }
      } else if (hulk.standIn) {
        drawn.push(hulk.standIn);
        shadows.push(hulk.standIn);
      }
    }
    await pace();
    if (cancelled) return stats;
    // the swap: one merge and one upload, in one task
    const swapStart = now();
    const nextDrawn = drawn.length ? mergeWreckGeometries(drawn) : new THREE.BufferGeometry();
    // (a stand-in is non-indexed; a mix merges as non-indexed)
    const mixed = shadows.some((g) => g.index) && shadows.some((g) => !g.index);
    const shadowParts = mixed ? shadows.map((g) => {
      if (!g.index) return g;
      const flat = g.toNonIndexed();
      made.push(flat);
      return flat;
    }) : shadows;
    const nextShadow = plan.shadow && shadowParts.length ? mergeGeometries(shadowParts, false) : null;
    const previous = plan.mesh.geometry;
    plan.mesh.geometry = nextDrawn;
    previous.dispose();
    if (plan.shadow && nextShadow) {
      const old = plan.shadow.geometry;
      plan.shadow.geometry = nextShadow;
      plan.setShadowProfile(plan.shadow, shadowParts);
      old.dispose();
    }
    stats.swapMs = Math.round((now() - swapStart) * 10) / 10;
    stats.swappedMs = Math.round(now() - startedAt);
    for (const hulk of plan.hulks) { hulk.standIn?.dispose(); hulk.standIn = null; }
    plan.state = 'done';
    return stats;
  } finally {
    release();
    if (!cancelled) client.dispose();
    plan.cancel = undefined;
  }
}
