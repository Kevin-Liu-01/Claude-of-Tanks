/**
 * activeWorld.ts — the one reference to the battlefield on screen (mp-fixes-277; Kevin 2026-11-24, after 276 shipped:
 * "multiplayer is broken ... and still merges 2 maps"). Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 *
 * The class of the bug: code that found "the world" by looking for it. Every built battlefield stays in the scene,
 * hidden, so the Garage's prefetch, the next round's warm and the last round's world sit beside the presented one
 * (worldActivationRuntime.ts). The black-world guard, armed by a network round with no world port, took the first scene
 * child named `world-*`: on a page whose Garage had planned another battlefield that was the hidden one, so the guard
 * read the presented battlefield as missing every frame and its first heal set the hidden one visible. Two maps drawn.
 *
 * Now the world's owner, the activation runtime, binds this reference once, and every reader asks it: the battlefield
 * presented (or dormant under the Garage), and whether an object is a battlefield root the runtime holds. No module picks
 * a world by name or by walking the scene (src/world/activeWorld.selftest.mjs scans for it). Pure: no DOM; three's types only.
 */
import type { Object3D } from 'three';

/** What a reader may see of the presented battlefield. */
export interface ActiveWorldView {
  readonly mapId: string;
  readonly group: Object3D;
}

interface ActiveWorldSource {
  /** The battlefield presented, or dormant under the Garage; null before the first one. */
  current(): ActiveWorldView | null;
  /** Whether `root` is the root of a battlefield the owner holds (presented, resident, warming or retired). */
  isBattlefieldRoot(root: Object3D): boolean;
}

let source: ActiveWorldSource | null = null;

/** The owner's binding (one per page: the last runtime made binds); returns its unbind. */
export function bindActiveWorld(next: ActiveWorldSource): () => void {
  source = next;
  return () => { if (source === next) source = null; };
}

/** The battlefield on screen (dormant under the Garage), from its owner; null when there is none or no owner. */
export function activeWorld(): ActiveWorldView | null {
  return source?.current() ?? null;
}

/** Whether `root` is a battlefield root (so a scene walk never treats one as a plain presentation root). */
export function isBattlefieldRoot(root: Object3D | null | undefined): boolean {
  return !!root && (source?.isBattlefieldRoot(root) ?? false);
}
