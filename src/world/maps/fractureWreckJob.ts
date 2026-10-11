// src/world/maps/fractureWreckJob.ts — (the destructible-kits lane, 2026-10-11) a deferred broken state as data.
//
// The coordinator: "build wreck states lazily: when a piece is first destroyed, or during idle time after the battle is
// live ... intact builds stay at load". A settled wreck (fractureSettle.ts) takes a tenth of a second or more of one
// thread per kind, so a pool (props.ts) spends the wreck's draws at load and keeps its job: the numbers the wreck is
// built from. A worker (fractureWreckWorker.ts) builds it from the job once the battle runs, so the first break finds
// it ready; the main thread builds it from the same job when a copy breaks before then, or a late joiner restores one.
// Both run the same builders on the same numbers: the same wreck. Types only here (and the one helper), so a kit's
// table can hold a job without importing the other kits.
import type * as THREE from 'three';
import type { ShedStyle } from './shedKit.ts';
import type { FortTones, PillboxStyle } from './fortKit.ts';

/** What a deferred wreck is built from (structured-cloneable: plain numbers, strings and arrays). */
export type FractureWreckJob =
  | { readonly kit: 'shed'; readonly kind: 'fieldhut' | 'leanto'; readonly style: ShedStyle; readonly seed: number; readonly salt: number }
  | { readonly kit: 'pillbox'; readonly style: PillboxStyle; readonly tones: FortTones; readonly seed: number }
  /** A part-built light kind (structureKit SETTLED_WRECK_KINDS), settled from its own parts (legacyWreck.ts). */
  | { readonly kit: 'legacy'; readonly kind: string; readonly seed: number };

/** A deferred broken state: the builder the main thread runs when it must, carrying the job a worker runs ahead of it. */
export type DeferredWreck = (() => THREE.BufferGeometry) & { readonly job: FractureWreckJob };

/** `build` must be the job's own builder (fractureWreckWorker.ts buildFractureWreck runs the same one). */
export function deferredWreck(job: FractureWreckJob, build: () => THREE.BufferGeometry): DeferredWreck {
  return Object.assign(build, { job });
}
