// src/game/matchModeWorldLazy.ts — the battle modes' world presentation, out of the game's entry (2026-10-16, the perf
// lane; 226's bundle budget: the props lane's mode objects and objective posts (#28) brought ~25 KB more of it into the
// boot chunk, which went over its budget).
//
// The objectives' markers, posts, flags, goals, air drops and trench works (matchModeWorldPresentation.ts, with
// modeObjects.ts, objectivePosts.ts and captureFlag.ts) are drawn only in a battle with a mode, never in the Garage. Their
// module loads as its own chunk: fetched once the boot is idle, and at once if a mode's state arrives first. Until it
// is in, the presentation draws nothing and keeps the latest state, which it hands over the moment the module lands.
// Its root is this wrapper's, so the scene sees one stable group (the minimap bake excludes it, main.ts). Every battle's
// interface load awaits ready() (main.ts ensureBattleHud: the solo, network and debug entries all join it), so the
// markers are in from the battle's first frame on any network; the idle fetch only makes that wait free.
import * as THREE from 'three';
import type { createMatchModeWorldPresentation, MatchModeWorldPresentation } from './matchModeWorldPresentation.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

type PresentationOptions = Parameters<typeof createMatchModeWorldPresentation>[1];
type PresentationState = Parameters<MatchModeWorldPresentation['update']>[0];

interface LazyPresentationHooks {
  /** When the boot is idle (the default: requestIdleCallback, else a timer). */
  whenIdle?: (load: () => void) => void;
  load?: () => Promise<{ createMatchModeWorldPresentation: typeof createMatchModeWorldPresentation }>;
  onError?: (error: unknown) => void;
}

const defaultWhenIdle = (load: () => void): void => {
  const host = globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
  if (typeof host.requestIdleCallback === 'function') host.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
};

/** The presentation and the promise of its module: resolved once it is in (or its load failed and was logged). */
interface LazyMatchModeWorldPresentation extends MatchModeWorldPresentation {
  ready(): Promise<void>;
}

/** The mode world presentation behind its own chunk: the same interface, a stable root. */
export function createLazyMatchModeWorldPresentation(
  scene: THREE.Object3D,
  options: PresentationOptions = {},
  { whenIdle = defaultWhenIdle, load = () => import('./matchModeWorldPresentation.ts'), onError = (error) => {
    console.warn('[mode objectives] the presentation module did not load (retrying with the next mode state):', error);
  } }: LazyPresentationHooks = {},
): LazyMatchModeWorldPresentation {
  const root = new THREE.Group();
  root.name = 'match-mode-objectives-host';
  scene.add(root);
  let presentation: MatchModeWorldPresentation | null = null;
  let disposed = false;
  let pending: { state: PresentationState; timeS: number } | null = null;
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed module was asked again, and warned, by the
  // next mode state, every frame a mode's state arrives (mainFrameRuntime.ts); now the next mode state asks under the one
  // policy (at once after one failure, then past its backoff; the kept failure in between, one warning per ask)
  const chunk = createLazyChunk(load);
  let asked: Promise<unknown> | null = null;
  let loading: Promise<void> = Promise.resolve();
  const start = (): Promise<void> => {
    const ask = chunk.load();
    if (ask === asked) return loading;
    asked = ask;
    loading = ask.then((module) => {
      if (disposed) return;
      // the real presentation's root under this one (it only adds its root to its parent)
      presentation = module.createMatchModeWorldPresentation(root as unknown as THREE.Scene, options);
      if (pending) presentation.update(pending.state, pending.timeS);
      pending = null;
    }, (error: unknown) => {
      onError(error);
    });
    return loading;
  };
  whenIdle(() => { if (!disposed) void start(); });
  return {
    root,
    ready: () => (presentation || disposed ? Promise.resolve() : start()),
    update(state, timeS) {
      if (presentation) { presentation.update(state, timeS); return; }
      pending = { state, timeS };
      if (state) void start();
    },
    dispose() {
      disposed = true;
      presentation?.dispose();
      presentation = null;
      root.removeFromParent();
    },
  };
}
