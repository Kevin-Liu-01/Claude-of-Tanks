/**
 * The hulks baked after the reveal (wreck-bake-after-reveal-278; see wreckBakeFacts.ts). A browser props build with a
 * wreck worker and the map's recorded facts places each hulk from its facts (seat, collision, footprints, budget) and
 * draws its stand-in (its movement solids, charred) in a mesh of their own, 'tank-wrecks-deferred'. Once the battle is
 * shown (main.ts onReveal through world.bakeDeferredWrecks), this bakes them on the worker one bake at a time, the bakes
 * whose hulks stand nearest the player's spawn first, and swaps each bake's hulks in as it lands: each hulk a mesh of its
 * own posed by its matrix (props.ts commitWreck's pose: turned, leant to its ground, moved to its seat) over the bake's
 * one geometry, its shadow proxy beside it, and the stand-ins left rebuilt without it (a few hundred triangles a hulk).
 * No hulk's vertices are moved on the main thread and no map-wide merge runs in the battle; the GPU upload of a bake's
 * geometry is the cost of each swap. Nothing a battle reads moves: the obstacles, colliders and records were laid from
 * the facts. A bake that fails keeps its hulks' stand-ins.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  /** ms from the start to each bake's swap, in swap order (nearest the spawn first) */
  swapsMs: number[];
  /** ms from the start to the last swap (or the last bake settled) */
  doneMs: number;
  /** the longest swap's own main-thread time (ms) */
  swapMaxMs: number;
}

/** What the props build leaves on its group (userData.deferredWrecks) for the swap. */
export interface DeferredWreckPlan {
  hulks: DeferredWreckHulk[];
  /** the stand-ins' mesh and their shadow proxy */
  mesh: THREE.Mesh;
  shadow: THREE.Mesh | null;
  /** where the bakes start: the player's spawn (x, z) */
  focus: [number, number] | null;
  state: 'pending' | 'baking' | 'done' | 'cancelled';
  /** A baked hulk's drawn mesh and shadow proxy over the bake's geometries, posed by `matrix` (props.ts). */
  makeHulk(geo: THREE.BufferGeometry, shadowGeo: THREE.BufferGeometry | null, matrix: THREE.Matrix4, specId: string): THREE.Object3D[];
  /** The stand-ins' shadow proxy's caster profile, from its remaining parts (props.ts partsShadowProfile). */
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
const _turn = new THREE.Quaternion(), _yaw = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);

/** A hulk's pose as one matrix: props.ts commitWreck's rotateY(yaw), then its ground's lean, then its seat. */
export function deferredHulkMatrix(hulk: DeferredWreckHulk, target = new THREE.Matrix4()): THREE.Matrix4 {
  _turn.set(...hulk.quaternion).multiply(_yaw.setFromAxisAngle(_up, hulk.yaw));
  return target.compose(new THREE.Vector3(...hulk.position), _turn, _one);
}

/** The bakes in the order they are asked for: the one with a hulk nearest `focus` first (seat order without one). */
export function deferredBakeOrder(hulks: readonly DeferredWreckHulk[], focus: [number, number] | null): string[] {
  const nearest = new Map<string, number>();
  hulks.forEach((hulk, index) => {
    const d = focus ? Math.hypot(hulk.position[0] - focus[0], hulk.position[2] - focus[1]) : index;
    const key = bakeKey(hulk);
    nearest.set(key, Math.min(nearest.get(key) ?? Infinity, d));
  });
  return [...nearest.keys()].sort((a, b) => nearest.get(a)! - nearest.get(b)!);
}

/** The stand-ins' mesh and shadow redrawn from the hulks still waiting; both leave the scene when none is. */
function redrawStandIns(plan: DeferredWreckPlan): void {
  const parts = plan.hulks.map((hulk) => hulk.standIn).filter((g): g is THREE.BufferGeometry => g !== null);
  for (const mesh of [plan.mesh, plan.shadow]) {
    if (!mesh) continue;
    const previous = mesh.geometry;
    if (parts.length) {
      mesh.geometry = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
    } else {
      mesh.geometry = new THREE.BufferGeometry();
      mesh.removeFromParent();
    }
    previous.dispose();
  }
  if (plan.shadow && parts.length) plan.setShadowProfile(plan.shadow, parts);
}

/**
 * Bake a plan's hulks and swap them in as they land. Resolves with its stats once every bake has settled (or with what
 * it reached when cancelled); a plan already started resolves at once. `makeClient`, `pace` and `now` are the receipts'
 * seams.
 */
export async function bakeDeferredWrecks(plan: DeferredWreckPlan, {
  makeClient = () => createWreckBakeClient(),
  pace = nextTurn,
  now = () => performance.now(),
}: { makeClient?: () => BakeClient; pace?: () => Promise<void>; now?: () => number } = {}): Promise<DeferredWreckStats | null> {
  if (plan.state !== 'pending') return plan.stats ?? null;
  plan.state = 'baking';
  const startedAt = now();
  const keys = deferredBakeOrder(plan.hulks, plan.focus);
  const stats: DeferredWreckStats = { hulks: plan.hulks.length, bakes: keys.length, baked: 0, failed: 0, swapsMs: [], doneMs: 0, swapMaxMs: 0 };
  plan.stats = stats;
  const client = makeClient();
  let cancelled = false;
  plan.cancel = () => { cancelled = true; plan.state = 'cancelled'; client.dispose(); };
  const release = (baked: WreckBake | null): void => { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); };
  const matrix = new THREE.Matrix4();
  // (the hulks join the stand-ins' parent: the props group, even once the last stand-in has left it)
  const parent = plan.mesh.parent;
  try {
    if (!parent) { plan.state = 'cancelled'; return stats; }
    for (const key of keys) {
      const hulks = plan.hulks.filter((hulk) => bakeKey(hulk) === key);
      let baked: WreckBake | null = null;
      try {
        baked = await client.bake(hulks[0].specId, hulks[0].options, () => (cancelled ? Promise.reject(new Error('cancelled')) : undefined));
      } catch (error) {
        if (cancelled) return stats;
        console.warn(`[wrecks] the ${hulks[0].specId} wreck did not bake after the reveal; its stand-in stays`, error);
      }
      if (cancelled) { release(baked); return stats; }
      if (!baked) { stats.failed++; continue; }
      stats.baked++;
      // the swap lands in a turn of its own
      await pace();
      if (cancelled) { release(baked); return stats; }
      const swapStart = now();
      for (const hulk of hulks) {
        for (const object of plan.makeHulk(baked.geo, baked.shadowGeo, deferredHulkMatrix(hulk, matrix), hulk.specId)) parent.add(object);
        hulk.standIn?.dispose();
        hulk.standIn = null;
      }
      redrawStandIns(plan);
      const end = now();
      stats.swapMaxMs = Math.max(stats.swapMaxMs, Math.round((end - swapStart) * 10) / 10);
      stats.swapsMs.push(Math.round(end - startedAt));
    }
    stats.doneMs = Math.round(now() - startedAt);
    plan.state = 'done';
    return stats;
  } finally {
    if (!cancelled) client.dispose();
    plan.cancel = undefined;
  }
}
