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
import { damageSeed, type DamageFace, type DamageRole, type DamageStageResult, type DamageStorey, type DamageWriters } from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { breachBlowFor } from './structureFx.ts';
import { COLLAPSE_S, STAGE_RUN_TAG, type StructureMask } from './structureMask.ts';
import type { StructureDebris } from './structureDebris.ts';
import type { StructureScars } from './structureScars.ts';

export interface StructureStages {
  /** A stage event, with its structure's seam (null: the mask alone — a world without the seam). */
  stage(e: StructureStageEvent, seam: StructureDamageSeam | null): void;
  /** A P2 hole or section fall, with its structure's seam (a fall: the kit's section dropped, its intact parts clamped). */
  breach(e: StructureBreachEvent, seam: StructureDamageSeam | null): void;
  /** Per render frame: touch the casters of every building still falling. */
  update(): void;
  shiftTime(delta: number): void;
  /** Stand every building up again: the mask is the caller's to reset; the flattened parts come back here. */
  reset(): void;
  /** receipts: buildings falling, part ranges flattened, spans whose original positions are kept */
  stats(): { falling: number; flattened: number; kept: number };
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

  // every span a stage changes keeps its original range once: reset() stands the building up from these (a part
  // flattened and clamped in either order comes back whole)
  const originals = new Map<StructureSpan, Float32Array>();
  function keep(span: StructureSpan): void {
    if (originals.has(span)) return;
    const a = span.first * 3;
    originals.set(span, (span.position.array as Float32Array).slice(a, a + span.count * 3));
  }
  const flattened: StructureSpan[] = [];
  let flattenedSpans = new WeakSet<StructureSpan>();
  function flattenSpan(span: StructureSpan): void {
    if (flattenedSpans.has(span) || span.count <= 0) return;
    flattenedSpans.add(span);
    keep(span);
    const pos = span.position;
    const arr = pos.array as Float32Array;
    const a = span.first * 3, n = span.count * 3;
    flattened.push(span);
    // every vertex of the part onto its first: whole triangles collapse to a point (crushableClutter's flattening)
    const x = arr[a], y = arr[a + 1], z = arr[a + 2];
    for (let i = a; i < a + n; i += 3) { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; }
    pos.addUpdateRange(a, n);
    pos.needsUpdate = true;
  }

  // P2 section falls (DESTRUCTION.md §3.4): a fallen section's intact parts are clamped down where they stand, in the
  // buckets' own positions (any kit, every tier): every vertex of the structure inside the section's volume (body frame)
  // goes down to the line it falls to
  const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _inst = new THREE.Matrix4(), _p = new THREE.Vector3();
  function clampStructure(seam: StructureDamageSeam, inside: (bx: number, by: number, bz: number) => boolean,
    clampY: (bx: number, by: number, bz: number) => number | null): boolean {
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let changed = false;
    for (const span of seam.spans) {
      if (span.count <= 0) continue;
      const mesh = span.mesh as THREE.Object3D & { getMatrixAt?(index: number, target: THREE.Matrix4): THREE.Matrix4 };
      _m.copy(mesh.matrixWorld);
      if (span.instanceId !== null && typeof mesh.getMatrixAt === 'function') { mesh.getMatrixAt(span.instanceId, _inst); _m.multiply(_inst); }
      _mi.copy(_m).invert();
      const arr = span.position.array as Float32Array;
      // a part belongs to the section when most of it stands in the section's volume: a corner of the next face's wall
      // (its end inside this face's slab) stays
      let inN = 0;
      for (let i = span.first, end = span.first + span.count; i < end; i++) {
        _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        const wx = _p.x - px, wz = _p.z - pz;
        if (inside(wx * c - wz * s, _p.y - py, wx * s + wz * c)) inN++;
      }
      if (inN < span.count * 0.8) continue;
      let touched = false;
      for (let i = span.first, end = span.first + span.count; i < end; i++) {
        _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        // world = R(yaw) body + placement (three's rotateY), so body = R(-yaw)(world - placement)
        const wx = _p.x - px, wz = _p.z - pz;
        const by = _p.y - py;
        const to = clampY(wx * c - wz * s, by, wx * s + wz * c);
        if (to === null || to >= by) continue;
        if (!touched) { keep(span); touched = true; }
        _p.y = to + py;
        _p.applyMatrix4(_mi);
        arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
      }
      if (touched) {
        span.position.addUpdateRange(span.first * 3, span.count * 3);
        span.position.needsUpdate = true;
        changed = true;
      }
    }
    return changed;
  }
  const SLAB_EPS = 0.08;
  /** A wall panel above its stub: the face's slab (its width, its wall's thickness) from the stub top up to the band's top. */
  function clampPanel(seam: StructureDamageSeam, face: DamageFace, stubTop: number, top: number): boolean {
    const t = Math.max(0.12, face.layers.reduce((sum, layer) => sum + (layer.thicknessM || 0), 0));
    const bottom = stubTop - Math.max(1, stubTop - face.origin[1]);
    const inSlab = (bx: number, by: number, bz: number): boolean => {
      if (by < bottom - SLAB_EPS || by > top + SLAB_EPS) return false;
      const ox = bx - face.origin[0], oz = bz - face.origin[2];
      const along = ox * face.out[0] + oz * face.out[2];
      if (along > SLAB_EPS || along < -t - SLAB_EPS) return false;
      return Math.abs(ox * face.u[0] + oz * face.u[2]) <= face.width / 2 + SLAB_EPS;
    };
    return clampStructure(seam, inSlab, (bx, by, bz) => (by > stubTop && inSlab(bx, by, bz) ? stubTop : null));
  }
  /** A storey dropped: its whole band over the footprint down to its floor line (the storey below keeps its walls; the
   *  kit's storeyDown throws the slab's pieces). */
  function clampStorey(seam: StructureDamageSeam, storey: DamageStorey): boolean {
    const a = seam.anatomy;
    const reachX = a.w / 2 + Math.max(0, ...storey.jetty) + 0.3, reachZ = a.d / 2 + Math.max(0, ...storey.jetty) + 0.3;
    const inBand = (bx: number, by: number, bz: number): boolean => by >= storey.y0 - SLAB_EPS && by <= storey.y1 + SLAB_EPS
      && Math.abs(bx) <= reachX && Math.abs(bz) <= reachZ;
    return clampStructure(seam, inBand, (bx, by, bz) => (by > storey.y0 + 0.02 && inBand(bx, by, bz) ? storey.y0 : null));
  }
  /** Structures that have had a real P2 hole: a P1 'breached' stage cuts them no synthetic one. */
  const realHoles = new Set<number>();

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
      // a standing run in it still falls and folds with its building
      mask.patch(m);
      fallbacks.set(bucket, m);
    }
    return m;
  }
  // the room behind a breach (b5: the kits write it in the world's 'dark' bucket, whose glossy window material showed
  // the sky's reflection through the hole as a slate-blue disc): matte, in the builder's own interior tint, no
  // reflection, falling and folding with its building like every standing run
  const roomMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true,
    envMapIntensity: 0 });
  roomMaterial.name = 'fx-structure-room';
  mask.patch(roomMaterial);

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
    const resolve = (bucket: string, role?: DamageRole): THREE.Material => role === 'room' ? roomMaterial
      : byBucket.get(bucket) ?? o.materialFor?.(bucket) ?? fallbackFor(bucket);
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
      // with sections on (the match's ruleset), the struck section's own holes are the breach: no synthetic one
      const sections = (e as StructureStageEvent & { sections?: boolean }).sections === true || realHoles.has(e.structureId);
      if (e.stage === 'breached' && !sections) {
        const blow = breachBlowFor(e);
        const spec = seam.holeAt(blow.x, blow.y, blow.z, blow.radiusM, e.dirX, e.dirZ, e.munition, e.cause, 0);
        if (spec) run(seam, 0, settled, (out) => seam.breach(spec, out));
      }
      // a collapse's stubs and pile show under the dust, a little after the fall begins
      if (e.stage === 'collapsed') run(seam, 0.7, settled, (out) => seam.collapse(stageSeed(3), out), false);
    },
    breach(e, seam) {
      if (!seam) return;
      const settled = e.settled === true;
      const cause = e.munition === 'kinetic' || e.munition === 'autocannon_ap' ? 'kinetic' : 'blast';
      if (!e.sectionDown) {
        if (!(e.radiusM > 0)) return;
        realHoles.add(e.structureId);
        const spec = seam.holeAt(e.x, e.y, e.z, e.radiusM, 0, 0, e.munition, cause, e.hole);
        if (spec) run(seam, 0, settled, (out) => seam.breach(spec, out));
        return;
      }
      // a section fell (hole 255, radius 0, standing at the section's centre on its face): the kit's section there
      realHoles.add(e.structureId);
      const a = seam.anatomy;
      const ev = e as StructureBreachEvent & { storeyDown?: boolean; baseY?: number };
      const baseY = Number.isFinite(ev.baseY) ? (ev.baseY as number) : a.placement.y;
      let changed = false;
      if (e.sectionKind === 'roof') {
        const roof = a.roof;
        if (roof) run(seam, 0, settled, (out) => seam.sectionDown(roof.section, damageSeed(a.seed, roof.section, 255), out));
      } else {
        const spec = seam.holeAt(e.x, e.y, e.z, 0.01, 0, 0, e.munition, cause, 255);
        const storey = spec ? a.storeys[spec.storey] : null;
        const face = storey ? storey.faces.find((f) => f.name === spec!.face) ?? null : null;
        if (spec && storey && face) {
          run(seam, 0, settled, (out) => seam.sectionDown(spec.section, damageSeed(a.seed, spec.section, 255), out));
          // the panel above its stub (a metre over the base; an upper storey's falls to its floor line)
          const y0 = e.y0 - a.placement.y, y1 = e.y1 - a.placement.y;
          changed = clampPanel(seam, face, Math.max(y0, baseY + 1 - a.placement.y, storey.y0), Math.max(y1, storey.y1)) || changed;
        }
        if (ev.storeyDown === true && storey) {
          const storeyDown = (seam as StructureDamageSeam & { storeyDown?(storey: number, seed: number, out: DamageWriters): DamageStageResult })
            .storeyDown;
          if (typeof storeyDown === 'function') {
            run(seam, 0, settled, (out) => storeyDown.call(seam, storey.index, damageSeed(a.seed, 1000 + storey.index), out));
          }
          changed = clampStorey(seam, storey) || changed;
        }
      }
      if (changed) seam.touchShadows();
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
      for (const [span, saved] of originals) {
        const pos = span.position;
        (pos.array as Float32Array).set(saved, span.first * 3);
        pos.addUpdateRange(span.first * 3, saved.length);
        pos.needsUpdate = true;
      }
      originals.clear();
      realHoles.clear();
      flattened.length = 0;
      flattenedSpans = new WeakSet();
      falling.length = 0;
      o.scars?.reset();
    },
    stats: () => ({ falling: falling.length, flattened: flattened.length, kept: originals.size }),
  };
}
