/**
 * structureStages.ts — a structure's damage stages laid into the world's own geometry (destruction-fx lane,
 * 2026-10-07; DESTRUCTION.md §16.4).
 *
 * The core lane decides when a building crosses a stage or opens a hole; the world's seam (world.structureDamage(id),
 * src/world/structureDamageSeam.ts) resolves each stage's builder through the building's kit chain. This module runs
 * those builders and lays down what they return, the same on every tier (a building's state is world state):
 *
 *  - what a builder writes (the broken rim in the wall's own courses, the dark room behind a hole, the stubs and the
 *    pile of a collapse, the falling pieces) goes through the debris writers (structureDebris.ts), in the building's
 *    own bucket materials;
 *  - its cuts go into the structure mask (structureMask.ts: a cylinder along the face's outward normal, body frame to
 *    world), so the intact wall opens behind the rim — and its shadow with it;
 *  - its part-class hides (a damaged building's glass) flatten those parts' vertex ranges in the bucket's positions
 *    (kept, so reset() stands every building up again for the next match);
 *  - a collapse starts the mask's fall, and the static shadow cache, which cannot see a shape the GPU changes, is
 *    touched (seam.touchShadows) on every frame the fall moves the building and once on the frame it is discarded; a
 *    cut, a hide or a settled stage touches once.
 *
 * A stage that jumps (a breach out of an intact building) lays the one it skipped. P1's breach stage names a blow, not
 * a hole: the seam's holeAt picks the face nearest the blow's point (breachBlowFor sizes it). Settled stages (a late
 * joiner, a migration) lay their final state at once and throw nothing. A kit that throws costs its look, never the
 * match. Event time only: nothing here runs per frame but the touches of a fall.
 */
import * as THREE from 'three';
import type { StructureBreachEvent, StructureStageEvent } from '../sim/destructionEvents.ts';
import { damageSeed, type DamageStageResult, type DamageWriters } from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { breachBlowFor } from './structureFx.ts';
import { COLLAPSE_S, STAGE_RUN_TAG, type StructureMask } from './structureMask.ts';
import type { StructureDebris } from './structureDebris.ts';
import type { StructureScars } from './structureScars.ts';

export interface StructureStages {
  /** A stage event, with its structure's seam (null: the mask alone — a world without the seam). */
  stage(e: StructureStageEvent, seam: StructureDamageSeam | null): void;
  /** A P2 hole event, with its structure's seam. */
  breach(e: StructureBreachEvent, seam: StructureDamageSeam | null): void;
  /** Per render frame: touch the casters of every building still falling. */
  update(): void;
  shiftTime(delta: number): void;
  /** Stand every building up again: the mask is the caller's to reset; the flattened parts come back here. */
  reset(): void;
  /** receipts: buildings falling, part ranges flattened */
  stats(): { falling: number; flattened: number };
}

export interface StructureStagesOptions {
  mask: StructureMask;
  debris: StructureDebris;
  now: () => number;
  /**
   * A bucket's material anywhere in the world (the builders write a building's hidden layers too — the stone core
   * under its render, the timber of its floors — in buckets its own spans may not draw); null when the world has none.
   */
  materialFor?(bucket: string): THREE.Material | null;
  /** The phone tier's scars (its walls stand uncut: each cut is drawn on the face instead). */
  scars?: StructureScars | null;
}

export function createStructureStages(o: StructureStagesOptions): StructureStages {
  const { mask, debris } = o;

  /** The bucket materials a structure's writers draw in: a plain bucket mesh's (a batch's clone only when no plain
   *  mesh draws that bucket). */
  function spanMaterials(seam: StructureDamageSeam): Map<string, THREE.Material> {
    const byBucket = new Map<string, THREE.Material>();
    for (let pass = 0; pass < 2; pass++) {
      for (const span of seam.spans) {
        if ((span.instanceId !== null) === (pass === 0) || byBucket.has(span.bucket)) continue;
        const m = (span.mesh as THREE.Mesh).material;
        const material = Array.isArray(m) ? m[0] : m;
        if (material) byBucket.set(span.bucket, material);
      }
    }
    return byBucket;
  }

  const flattened: { span: StructureSpan; saved: Float32Array }[] = [];
  let flattenedSpans = new WeakSet<StructureSpan>();
  function flattenSpan(span: StructureSpan): void {
    if (flattenedSpans.has(span) || span.count <= 0) return;
    flattenedSpans.add(span);
    const pos = span.position;
    const arr = pos.array as Float32Array;
    const a = span.first * 3, n = span.count * 3;
    flattened.push({ span, saved: arr.slice(a, a + n) });
    // every vertex of the part onto its first: whole triangles collapse to a point (crushableClutter's flattening)
    const x = arr[a], y = arr[a + 1], z = arr[a + 2];
    for (let i = a; i < a + n; i += 3) { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; }
    pos.addUpdateRange(a, n);
    pos.needsUpdate = true;
  }

  /** What a stage returns: its cuts into the mask (body frame to world), its part-class hides flattened. */
  function apply(seam: StructureDamageSeam, result: DamageStageResult | null | undefined): void {
    if (!result) return;
    let changed = false;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const cut of result.cuts ?? []) {
      // world = R(yaw) body + placement (world/structureDamageSeam.ts holeOnAnatomy's frame)
      const wx = px + cut.x * c + cut.z * s, wz = pz - cut.x * s + cut.z * c;
      const wnx = cut.nx * c + cut.nz * s, wnz = -cut.nx * s + cut.nz * c;
      mask.addHole(seam.structureIdx, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM, cut.outsideM ?? 0.3);
      // a hole goes through the wall's layers; a spall or the render ring only through its render
      o.scars?.add(seam.structureIdx, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM >= 0.2,
        (seam.anatomy.seed + Math.round(cut.x * 100) + Math.round(cut.y * 100)) >>> 0);
      changed = true;
    }
    for (const hide of result.hides ?? []) {
      // the whole structure (a collapse) is the mask's fall; a section's hide waits for sections on the spans (P2)
      if (hide.partClass === null || hide.section !== null) continue;
      for (const span of seam.spans) if (span.partClass === hide.partClass) { flattenSpan(span); changed = true; }
    }
    if (changed) seam.touchShadows();
  }

  // a bucket no mesh of this world draws: a plain lit material over the writer's own vertex tints (made once per bucket)
  const fallbacks = new Map<string, THREE.Material>();
  function fallbackFor(bucket: string): THREE.Material {
    let m = fallbacks.get(bucket);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0x8a8276, roughness: 0.95, metalness: 0, vertexColors: true });
      m.name = `fx-structure-fallback-${bucket}`;
      fallbacks.set(bucket, m);
    }
    return m;
  }

  /** The world's patched shadow depth material of a bucket this structure draws in (its spans' meshes carry them). */
  function depthMaterials(seam: StructureDamageSeam): Map<string, THREE.Material> {
    const byBucket = new Map<string, THREE.Material>();
    for (const span of seam.spans) {
      const d = (span.mesh as THREE.Mesh).customDepthMaterial;
      if (d && !byBucket.has(span.bucket)) byBucket.set(span.bucket, d);
    }
    return byBucket;
  }

  /** A stage's builder through the writers. `standing`: its runs belong to the standing building (a breach's rim and
   *  room, a spall's units) and fall with it; a collapse's own stubs and pile stay where they lie. */
  function run(seam: StructureDamageSeam, delayS: number, settled: boolean, build: (out: DamageWriters) => DamageStageResult,
    standing = true): void {
    const byBucket = spanMaterials(seam);
    const resolve = (bucket: string): THREE.Material => byBucket.get(bucket) ?? o.materialFor?.(bucket) ?? fallbackFor(bucket);
    const depths = standing ? depthMaterials(seam) : null;
    const out = debris.begin(seam.anatomy.placement, resolve, delayS, settled, standing
      ? { tag: STAGE_RUN_TAG + seam.structureIdx + 1, depthFor: (bucket) => depths?.get(bucket) ?? null }
      : {});
    let result: DamageStageResult | null = null;
    try { result = build(out); } catch { result = null; }
    debris.commit();
    apply(seam, result);
  }

  const falling: { seam: StructureDamageSeam; until: number }[] = [];

  return {
    stage(e, seam) {
      const settled = e.settled === true;
      if (e.stage === 'collapsed') {
        // the building crumbles into its dust over COLLAPSE_S, then is gone (settled: gone at once)
        mask.collapse(e.structureId, o.now(), Math.max(1, e.topY - e.baseY), e.dirX, e.dirZ, e.cx, e.baseY, e.cz, settled);
        o.scars?.clearStructure(e.structureId);
        if (seam) {
          if (settled) seam.touchShadows();
          else falling.push({ seam, until: o.now() + COLLAPSE_S });
        }
      }
      if (!seam) return;
      const stageSeed = (stage: number): number => damageSeed(seam.anatomy.seed, stage);
      // a blow that jumps a stage lays the one it skipped: a breach out of an intact building is damaged too
      if (e.stage === 'damaged' || (e.stage === 'breached' && e.previous === 'intact')) {
        run(seam, 0, settled, (out) => seam.damaged(stageSeed(1), out));
      }
      if (e.stage === 'breached') {
        const blow = breachBlowFor(e);
        const spec = seam.holeAt(blow.x, blow.y, blow.z, blow.radiusM, e.dirX, e.dirZ, e.munition, e.cause, 0);
        if (spec) run(seam, 0, settled, (out) => seam.breach(spec, out));
      }
      // a collapse's stubs and pile show under the dust, a little after the fall begins
      if (e.stage === 'collapsed') run(seam, 0.7, settled, (out) => seam.collapse(stageSeed(3), out), false);
    },
    breach(e, seam) {
      if (!seam || !(e.radiusM > 0)) return;
      const cause = e.munition === 'kinetic' || e.munition === 'autocannon_ap' ? 'kinetic' : 'blast';
      const spec = seam.holeAt(e.x, e.y, e.z, e.radiusM, 0, 0, e.munition, cause, e.hole);
      if (spec) run(seam, 0, e.settled === true, (out) => seam.breach(spec, out));
    },
    update() {
      if (!falling.length) return;
      const now = o.now();
      let k = 0;
      // every frame the mask moves a building, and the one it is discarded on
      for (const f of falling) { f.seam.touchShadows(); if (now <= f.until) falling[k++] = f; }
      falling.length = k;
    },
    shiftTime(delta) {
      for (const f of falling) f.until += delta;
    },
    reset() {
      for (const f of flattened) {
        const pos = f.span.position;
        (pos.array as Float32Array).set(f.saved, f.span.first * 3);
        pos.addUpdateRange(f.span.first * 3, f.saved.length);
        pos.needsUpdate = true;
      }
      flattened.length = 0;
      flattenedSpans = new WeakSet();
      falling.length = 0;
      o.scars?.reset();
    },
    stats: () => ({ falling: falling.length, flattened: flattened.length }),
  };
}
