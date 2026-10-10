// Track-dust adapters for the Studio's cinematic layer, one per actor and keyed by the actor itself.
//
// Studio.load() restarts actor uids at a1 (clearActors resets uidSeq), so a cache keyed by uid handed every later
// scene's a1 the adapter built for the session's first a1: its track dust and track prints followed that first scene's
// path, and the scene's own tanks raised none. A cinema --jobs session (many scenes in one page) carried one take's dust
// into the next ones on the same map (2026-10-03: a still covered by a dust cloud from an earlier job's hero).

import type { CineTrackActor } from '../fx/cinematicFx.ts';

/** Builds each actor's adapter once and hands the same one back for that actor until clear(). */
export function createTrackDustAdapters<A extends object>(build: (actor: A) => CineTrackActor): {
  adapterFor(actor: A): CineTrackActor;
  clear(): void;
} {
  let cache = new WeakMap<A, CineTrackActor>();
  return {
    adapterFor(actor) {
      let adapter = cache.get(actor);
      if (!adapter) {
        adapter = build(actor);
        cache.set(actor, adapter);
      }
      return adapter;
    },
    clear() {
      cache = new WeakMap();
    },
  };
}
