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
 * match. Event time only: nothing here runs per frame but the touches of a fall and a storey's drop in flight (the P2
 * cascade's storeys come down over gravity's time, sqrt(2 h / g), not in one frame).
 */
import * as THREE from 'three';
import type { MunitionClass, StructureBreachEvent, StructureStageEvent } from '../sim/destructionEvents.ts';
import {
  damageRng, damageSeed, type DamageFace, type DamageRole, type DamageStageResult, type DamageStorey, type DamageWriters,
  type DebrisShape, type FractureMaterial, type FractureSlot,
} from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { breachBlowFor } from './structureFx.ts';
import {
  COLLAPSE_S, MAX_HOLES, STAGE_RUN_TAG, collapseFrontTime, collapseWallHeight, holeOutlinePhase01, toppleLandS, type StructureMask,
} from './structureMask.ts';
import type { StructureDebris } from './structureDebris.ts';
import type { StructureScars } from './structureScars.ts';

export interface StructureStages {
  /** A stage event, with its structure's seam (null: the mask alone — a world without the seam). */
  stage(e: StructureStageEvent, seam: StructureDamageSeam | null): void;
  /** A P2 hole or section fall, with its structure's seam (a fall: the kit's section dropped, its intact parts clamped). */
  breach(e: StructureBreachEvent, seam: StructureDamageSeam | null): void;
  /**
   * A round burst on a standing structure (P1, sections off: dcore 2026-10-09, waves 294a/b "hits read as an orange
   * light on an intact wall — no punched hole, no thrown debris"): the kit's own breach at the burst, sized by the round
   * (strikeHoleRadius), its rim in the wall's courses, the room behind it and its pieces thrown — the presentation's, as
   * the P1 breach stage's hole is (a late joiner sees the stage's). At most STRIKE_HOLES of them a building (the mask
   * keeps four), one per place; none once the sim cuts its own holes (sections on) or it is coming down.
   */
  strike(structureId: number, seam: StructureDamageSeam | null, x: number, y: number, z: number, dirX: number, dirZ: number,
    munition: MunitionClass, chargeKg: number): void;
  /**
   * The combat warm (before reveal; dcore 2026-10-09, the collapse spike: the first collapse compiled its programs
   * mid-battle): a building's first damage draws two programs the world does not — the room behind a hole and the
   * pieces' pool material (its runs draw in the world's own bucket materials). A room run at `at` (in the first of
   * `buckets`, the world's) and one piece, through the stage writers, unculled, so the warm's private render compiles
   * them. The caller resets the fx after its render (resetAll stands everything up again). Returns the runs laid.
   */
  warm(at: { x: number; y: number; z: number }, buckets: Iterable<string>): number;
  /** Per render frame: touch the casters of every building still falling. */
  update(): void;
  shiftTime(delta: number): void;
  /** Stand every building up again: the mask is the caller's to reset; the flattened parts come back here. */
  reset(): void;
  /** receipts: buildings falling, part ranges flattened, spans whose original positions are kept, storeys dropping */
  stats(): { falling: number; flattened: number; kept: number; dropping: number };
}

/** The writers with their thrown pieces slowed to `k` of the kit's speed, never thrown upward faster than a metre a
 *  second (a collapse's pieces drop off the walls; they are not blown out). */
function dampPieces(out: DamageWriters, k: number, maxY = Infinity): DamageWriters {
  const p = out.pieces;
  const pieces = {
    // (the battle strips, final: a gable house's roof pieces hung in a spray over its ridge as the mask dropped the roof
    // into the walls) none leaves above the eaves: the roof's own fall to its pieces' line is the mask's
    push: (bucket: string, shape: DebrisShape, variant: number, px: number, py: number, pz: number, qx: number, qy: number,
      qz: number, qw: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, vx: number, vy: number,
      vz: number): boolean => p.push(bucket, shape, variant, px, Math.min(py, maxY), pz, qx, qy, qz, qw, sx, sy, sz, r, g, b,
      vx * k, Math.min(1, vy * k), vz * k),
    get count() { return p.count; },
    get capacity() { return p.capacity; },
  };
  return Object.assign(Object.create(Object.getPrototypeOf(out) as object) as DamageWriters, out, { pieces });
}

/** Strike holes a standing building takes (the mask keeps MAX_HOLES: one is left for the breach stage's). */
const STRIKE_HOLES = 3;
/** A burst's hole on a wall (P1 strike holes): smaller than the breach stage's blow (structureFx breachBlowFor) — a
 *  tank's HE round punches through a metre, a howitzer's or a missile's more; under a kilogram of charge, a pock. */
function strikeHoleRadius(munition: MunitionClass, chargeKg: number): number {
  if (!(chargeKg > 0)) return 0;
  const r = munition === 'howitzer' || munition === 'missile' ? 1.5
    : munition === 'rocket' || munition === 'hesh' ? 1.2
      : munition === 'he' ? 0.55 + 0.25 * Math.min(2, Math.sqrt(chargeKg))
        : munition === 'atgm' || munition === 'heat' || munition === 'drone_fpv' ? 0.6
          : munition === 'autocannon_he' ? 0.32
            : 0.4;
  return chargeKg < 0.3 ? Math.min(r, 0.35) : r;
}

/** A shaft's topple (structureMask toppleLandS): the hinge over its foot, the fall's world direction and its landing. */
interface StructureTopple {
  hingeM: number;
  dirX: number;
  dirZ: number;
  /** s after the blow: it lies on the ground and the kit's drums take its place */
  landS: number;
  /** how far along the ground it reaches from its foot (m) */
  lengthM: number;
}
/** The hinge a shaft breaks at over its foot (the kit's stump stands 1.2 to 3.5 m: the shaft goes over above it). */
const TOPPLE_HINGE_M = 1.5;
/**
 * A collapse that topples (dcore 2026-10-09): a shaft (the regional kit's stack, water tower, minaret or tower: its
 * anatomy carries a shaft plan) goes over toward the blow (against the event's direction: the struck side's foot is
 * gone; a blow without one, a direction of its own seed), about the leading edge of its foot; null for anything else, and after the P2 cascade (its bands are down).
 */
export function structureTopple(anatomy: StructureDamageSeam['anatomy'] | null | undefined, e: StructureStageEvent): StructureTopple | null {
  if (!anatomy || (e as StructureStageEvent & { sections?: boolean }).sections === true) return null;
  const plan = anatomy.kitPlan as { damage?: { shaft?: unknown } } | undefined;
  if (!plan?.damage?.shaft) return null;
  const H = Math.max(1, e.topY - e.baseY);
  // (wave 322: "the fallen shaft disappears" — it went over away from the shooter, behind its own stump and dust) a round
  // that blows out the foot on the struck side takes that side's support away: the shaft leans into the gap and goes
  // over toward the blow, where the shooter sees it fall
  let dx = Number.isFinite(e.dirX) ? -e.dirX : 0, dz = Number.isFinite(e.dirZ) ? -e.dirZ : 0;
  let dl = Math.hypot(dx, dz);
  if (!(dl > 1e-3)) {
    const ang = damageRng(damageSeed(anatomy.seed, 11))() * Math.PI * 2;
    dx = Math.cos(ang); dz = Math.sin(ang); dl = 1;
  }
  const hingeM = Math.min(TOPPLE_HINGE_M, H * 0.2);
  return { hingeM, dirX: dx / dl, dirZ: dz / dl, landS: toppleLandS(H, hingeM), lengthM: H - hingeM };
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
  /** The share of the collapse's crumble pieces this tier throws (1 desktop; the phone a few, its pools are small). */
  crumble?: number;
}

/** The section and storey a run was laid for (-1: none — a roof's wreckage has no storey, a storey's heap no
 *  section): a section's fall takes its own runs, a storey's drop its storey's. */
interface RunOwner { section: number; storey: number }

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
  const _tgt: number[] = [];
  interface ClampOptions {
    /** A part moves only when this share of its vertices stands in the volume (0: every vertex in it, whatever its
     *  part's share — a regional house draws one geometry per bucket and role for the whole building). */
    minShare?: number;
    /** The line the volume falls to: a part going down to it whole is flattened to a point instead (facades
     *  2026-10-08: a storey's ceiling squashed onto its floor line made a lid over the storey below). */
    line?: number;
    /** Parts the caller moves itself (a dropped storey's roof rides down whole). */
    skip?(span: StructureSpan): boolean;
  }
  /** A span's part matrix (its mesh, times its instance's) into _m, the inverse into _mi. */
  function spanMatrices(span: StructureSpan): void {
    const mesh = span.mesh as THREE.Object3D & { getMatrixAt?(index: number, target: THREE.Matrix4): THREE.Matrix4 };
    _m.copy(mesh.matrixWorld);
    if (span.instanceId !== null && typeof mesh.getMatrixAt === 'function') { mesh.getMatrixAt(span.instanceId, _inst); _m.multiply(_inst); }
    _mi.copy(_m).invert();
  }
  function clampStructure(seam: StructureDamageSeam, inside: (bx: number, by: number, bz: number) => boolean,
    clampY: (bx: number, by: number, bz: number) => number | null, opts: ClampOptions = {}): boolean {
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const minShare = opts.minShare ?? 0.8, line = opts.line;
    let changed = false;
    for (const span of seam.spans) {
      if (span.count <= 0 || flattenedSpans.has(span) || opts.skip?.(span)) continue;
      spanMatrices(span);
      const arr = span.position.array as Float32Array;
      if (minShare > 0) {
        // a part belongs to the section when most of it stands in the section's volume: a corner of the next face's
        // wall (its end inside this face's slab) stays
        let inN = 0;
        for (let i = span.first, end = span.first + span.count; i < end; i++) {
          _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
          const wx = _p.x - px, wz = _p.z - pz;
          if (inside(wx * c - wz * s, _p.y - py, wx * s + wz * c)) inN++;
        }
        if (inN < span.count * minShare) continue;
      }
      // the targets first: a part going down to the line whole is flattened, not squashed into a sheet on it
      _tgt.length = span.count;
      let moved = 0, toLine = 0;
      for (let k = 0; k < span.count; k++) {
        const i = span.first + k;
        _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        // world = R(yaw) body + placement (three's rotateY), so body = R(-yaw)(world - placement)
        const wx = _p.x - px, wz = _p.z - pz, by = _p.y - py;
        const to = clampY(wx * c - wz * s, by, wx * s + wz * c);
        if (to === null || !(to < by)) { _tgt[k] = NaN; continue; }
        _tgt[k] = to;
        moved++;
        if (line !== undefined && Math.abs(to - line) < 1e-6) toLine++;
      }
      if (!moved) continue;
      if (line !== undefined && toLine === span.count) { flattenSpan(span); changed = true; continue; }
      keep(span);
      for (let k = 0; k < span.count; k++) {
        if (Number.isNaN(_tgt[k])) continue;
        const i = span.first + k;
        _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        _p.y = _tgt[k] + py;
        _p.applyMatrix4(_mi);
        arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
      }
      span.position.addUpdateRange(span.first * 3, span.count * 3);
      span.position.needsUpdate = true;
      changed = true;
    }
    return changed;
  }
  /** A part lowered whole by `dropM` (world y; the roof riding a dropped storey down). */
  function lowerSpan(span: StructureSpan, dropM: number): boolean {
    if (span.count <= 0 || flattenedSpans.has(span) || !(dropM > 0)) return false;
    spanMatrices(span);
    keep(span);
    const arr = span.position.array as Float32Array;
    for (let i = span.first, end = span.first + span.count; i < end; i++) {
      _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
      _p.y -= dropM;
      _p.applyMatrix4(_mi);
      arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
    }
    span.position.addUpdateRange(span.first * 3, span.count * 3);
    span.position.needsUpdate = true;
    return true;
  }
  /** A span's highest point in the body frame. */
  function spanTop(seam: StructureDamageSeam, span: StructureSpan): number {
    spanMatrices(span);
    const arr = span.position.array as Float32Array;
    let top = -Infinity;
    for (let i = span.first, end = span.first + span.count; i < end; i++) {
      _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
      if (_p.y > top) top = _p.y;
    }
    return top - seam.anatomy.placement.y;
  }
  const SLAB_EPS = 0.08;
  /** The dressing a house stands proud of a face falls with its panel (facades 2026-10-08: a door's surround and canopy,
   *  window boxes, shutters, sills, balconies — up to 0.9 m out — stood in front of the stub); not in the band's top
   *  JETTY_KEEP_M, where the storey above's sill beam, joists and jetty stand proud of the face below. */
  const PROUD_M = 1.0, JETTY_KEEP_M = 0.12;
  /** A wall panel above its stub: the face's slab (its width, its wall's thickness, the dressing proud of it) from the
   *  stub top up to the band's top; a part above the stub whole (a canopy, a window box) is flattened. */
  function clampPanel(seam: StructureDamageSeam, face: DamageFace, stubTop: number, top: number): boolean {
    const t = Math.max(0.12, face.layers.reduce((sum, layer) => sum + (layer.thicknessM || 0), 0));
    const bottom = stubTop - Math.max(1, stubTop - face.origin[1]);
    const inSlab = (bx: number, by: number, bz: number): boolean => {
      if (by < bottom - SLAB_EPS || by > top + SLAB_EPS) return false;
      const ox = bx - face.origin[0], oz = bz - face.origin[2];
      const along = ox * face.out[0] + oz * face.out[2];
      if (along < -t - SLAB_EPS || along > (by <= top - JETTY_KEEP_M ? PROUD_M : SLAB_EPS)) return false;
      return Math.abs(ox * face.u[0] + oz * face.u[2]) <= face.width / 2 + SLAB_EPS;
    };
    return clampStructure(seam, inSlab, (bx, by, bz) => (by > stubTop && inSlab(bx, by, bz) ? stubTop : null), { line: stubTop });
  }
  /** A storey dropped: every vertex of its band over the footprint (the eaves and dressing past the walls too) down to
   *  its floor line, whatever its part's share; a part going down whole is flattened (no lid over the storey below);
   *  what stood on the storey (the storeys above, gables, chimney tops) comes down by the storey's height; a roof that
   *  rises above the band rides down whole (its eaves dip into the band). The storey below keeps its top. */
  function storeyReach(seam: StructureDamageSeam, storey: DamageStorey): [number, number] {
    const a = seam.anatomy, jet = Math.max(0, ...storey.jetty);
    return [a.w / 2 + jet + 1.5, a.d / 2 + jet + 1.5];
  }
  function clampStorey(seam: StructureDamageSeam, storey: DamageStorey): boolean {
    const [reachX, reachZ] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    const rides = new Set<StructureSpan>();
    for (const span of seam.spans) {
      if (span.partClass === 'roof' && !flattenedSpans.has(span) && spanTop(seam, span) > storey.y1 + SLAB_EPS) rides.add(span);
    }
    let changed = clampStructure(seam, () => true, (bx, by, bz) => {
      if (Math.abs(bx) > reachX || Math.abs(bz) > reachZ || !(by > storey.y0 + 0.02)) return null;
      return by <= storey.y1 + SLAB_EPS ? storey.y0 : by - dropM;
    }, { minShare: 0, line: storey.y0, skip: (span) => rides.has(span) });
    for (const span of rides) changed = lowerSpan(span, dropM) || changed;
    return changed;
  }
  /** A fallen section takes the structure's standing runs with it (facades: a dropped storey left the room behind an
   *  upper hole and a fallen roof's eave bands standing): a labelled run by its owner alone (a hole's room stands metres
   *  in; a fallen roof's wreckage is no storey's), an unlabelled one (a damaged stage's patches) when mostly inside the
   *  fallen volume. */
  function dropRuns(seam: StructureDamageSeam, inside: (bx: number, by: number, bz: number) => boolean,
    owns: (owner: RunOwner) => boolean): boolean {
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let dropped = false;
    for (const mesh of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      const owner = mesh.userData.runOwner as RunOwner | undefined;
      let gone = false;
      if (owner) gone = owns(owner);
      else {
        // the rest (a damaged stage's patches) by where they stand: mostly inside the fallen volume. The writers lay the
        // runs in the world frame (toWorld: world = R(yaw) body + placement), so body = R(-yaw)(world - placement)
        const pos = mesh.geometry.getAttribute('position');
        let inN = 0;
        for (let i = 0; i < pos.count; i++) {
          const wx = pos.getX(i) - px, wz = pos.getZ(i) - pz;
          if (inside(wx * c - wz * s, pos.getY(i) - py, wx * s + wz * c)) inN++;
        }
        gone = pos.count > 0 && inN >= pos.count * 0.5;
      }
      if (gone) { debris.dropRun(mesh); dropped = true; }
    }
    return dropped;
  }
  /** A dropped storey's neighbours among the structure's standing runs (its own are gone) settle by the clamp's law, per
   *  vertex over the footprint: over the band down by the storey's height, in it onto the floor line (a fallen roof's
   *  wreckage rides down and its hanging rafters lie on the line; an upper storey's heap rides down onto it). */
  function settleRuns(seam: StructureDamageSeam, storey: DamageStorey, reachX: number, reachZ: number): boolean {
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const dropM = storey.y1 - storey.y0;
    let moved = false;
    for (const mesh of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      let touched = false;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) - px, wz = pos.getZ(i) - pz;
        if (Math.abs(wx * c - wz * s) > reachX || Math.abs(wx * s + wz * c) > reachZ) continue;
        const by = pos.getY(i) - py;
        if (!(by > storey.y0 + 0.02)) continue;
        pos.setY(i, (by > storey.y1 + SLAB_EPS ? by - dropM : storey.y0) + py);
        touched = true;
      }
      if (!touched) continue;
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
      moved = true;
    }
    return moved;
  }
  /** Structures that have had a real P2 hole: a P1 'breached' stage cuts them no synthetic one. */
  const realHoles = new Set<number>();
  /** P1: the holes punched in a standing building (strike holes and the breach stage's), world points; and the buildings
   *  coming down (no more holes in them). */
  const punched = new Map<number, Array<[number, number, number]>>();
  const downed = new Set<number>();
  /** P2's sections seen on a building (a stage or a breach that says so): its holes are the sim's, never a strike's. */
  const sectionsSeen = new Set<number>();
  interface PendingStrike {
    structureId: number; seam: StructureDamageSeam; x: number; y: number; z: number; dirX: number; dirZ: number;
    munition: MunitionClass; chargeKg: number; at: number;
  }
  const pendingStrikes: PendingStrike[] = [];
  /** The wait before a strike's hole is punched (s): the burst's flash covers it, the step's own events land first. */
  const STRIKE_WAIT_S = 0.08;
  function punch(p: PendingStrike): void {
    const { structureId, seam, x, y, z } = p;
    if (realHoles.has(structureId) || sectionsSeen.has(structureId) || downed.has(structureId)) return;
    // (the battle strips, b3: a strike's hole healed over when later cuts — the damaged stage's spalls — took its slot in
    // the mask's ring) a strike never takes a slot another cut holds, and leaves one for the breach stage
    if (mask.holes(seam.structureIdx) >= MAX_HOLES - 1) return;
    const list = punched.get(structureId);
    if ((list?.length ?? 0) >= STRIKE_HOLES || nearPunched(structureId, x, y, z, 1.2)) return;
    const radiusM = strikeHoleRadius(p.munition, p.chargeKg);
    const cause = p.munition === 'kinetic' || p.munition === 'autocannon_ap' ? 'kinetic' : 'blast';
    let spec = seam.holeAt(x, y, z, radiusM, p.dirX, p.dirZ, p.munition, cause, 1 + (list?.length ?? 0));
    if (!spec) return;
    // (the battle strips, b3: a sheet hall's torn sheet curled up past its eaves round a hole at the wall's head) a
    // strike's hole stands inside its face: smaller where the face is tight round it, none where a pock cannot fit
    const face = seam.anatomy.storeys[spec.storey]?.faces.find((f) => f.name === spec!.face);
    if (face) {
      const fit = Math.min(spec.y - 0.25, face.height - spec.y - 0.35, face.width / 2 - Math.abs(spec.u) - 0.25);
      if (fit < 0.35) return;
      if (fit < spec.radiusM) {
        spec = seam.holeAt(x, y, z, fit, p.dirX, p.dirZ, p.munition, cause, 1 + (list?.length ?? 0));
        if (!spec) return;
      }
    }
    finishFalls(structureId);
    notePunched(structureId, x, y, z);
    // (wave 322 / the stack strips: a strike's pieces strewed the yard thirty metres out like confetti) at half the kit's
    // throw, never up: they fall out of the hole and lie at the wall's foot
    run(seam, 0, false, (out) => seam.breach(spec, dampPieces(out, 0.5)), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed);
  }
  const nearPunched = (id: number, x: number, y: number, z: number, within: number): boolean =>
    (punched.get(id) ?? []).some(([hx, hy, hz]) => Math.hypot(hx - x, hy - y, hz - z) < within);
  const notePunched = (id: number, x: number, y: number, z: number): void => {
    const list = punched.get(id);
    if (list) list.push([x, y, z]); else punched.set(id, [[x, y, z]]);
  };
  /** The kit sections that have fallen, per structure: a section falls once (facades 2026-10-08: two of the sim's
   *  3.2 m bands on a wall that is one part from foot to eave map to one kit section; the second event lays nothing). */
  const fallenSections = new Map<number, Set<number>>();
  const fallOnce = (structureId: number, section: number): boolean => {
    let set = fallenSections.get(structureId);
    if (!set) { set = new Set(); fallenSections.set(structureId, set); }
    if (set.has(section)) return false;
    set.add(section);
    return true;
  };

  /** What a stage returns: its cuts into the mask (body frame to world), its part-class hides flattened. */
  function apply(seam: StructureDamageSeam, result: DamageStageResult | null | undefined, holeSeed?: number): void {
    if (!result) return;
    let changed = false;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const cut of result.cuts ?? []) {
      // world = R(yaw) body + placement (world/structureDamageSeam.ts holeOnAnatomy's frame)
      const wx = px + cut.x * c + cut.z * s, wz = pz - cut.x * s + cut.z * c;
      const wnx = cut.nx * c + cut.nz * s, wnz = -cut.nx * s + cut.nz * c;
      // a breach's cuts follow the outline the kit's rim does (its own seed's phase)
      mask.addHole(seam.structureIdx, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM, cut.outsideM ?? 0.3,
        holeSeed !== undefined ? holeOutlinePhase01(holeSeed) : undefined);
      // a hole goes through the wall's layers; a spall or the render ring only through its render
      o.scars?.add(seam.structureIdx, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM >= 0.2,
        (seam.anatomy.seed + Math.round(cut.x * 100) + Math.round(cut.y * 100)) >>> 0);
      changed = true;
    }
    for (const hide of result.hides ?? []) {
      // the whole structure (a collapse) is the mask's fall; a section's hide waits for sections on the spans (P2)
      if (hide.partClass === null || hide.section !== null) continue;
      for (const span of seam.spans) if (span.partClass === hide.partClass) { flattenSpan(span); changed = true; }
      // (a building whose roof has its own bucket loses it above; one whose roof shares the walls' bucket loses its faces)
      if (hide.partClass === 'roof' && !seam.spans.some((sp) => sp.partClass === 'roof')) changed = flattenRoofFaces(seam) || changed;
    }
    if (changed) seam.touchShadows();
  }

  /** A roof drawn in another bucket (a sheet hall's in structureMetal, shingles in wood: their spans are 'wall' by
   *  bucket) goes with the roof's hide (facades 2026-10-08): every upward triangle of the structure (normal y > 0.3)
   *  standing over the eaves (or the top storey's top where there is no roof) and inside the footprint plus 1.5 m
   *  collapses to a point; a vertical gable stays, as a real one does. Non-indexed spans (the world's merged buckets). */
  const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
  function flattenRoofFaces(seam: StructureDamageSeam): boolean {
    const a = seam.anatomy;
    const top = a.storeys.length ? a.storeys[a.storeys.length - 1]!.y1 : 0;
    const eave = a.roof ? a.roof.eaveY - 0.15 : top - 0.1;
    const reachX = a.w / 2 + 1.5, reachZ = a.d / 2 + 1.5;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const inBody = (v: THREE.Vector3): boolean => {
      const wx = v.x - px, wz = v.z - pz;
      return v.y - py >= eave && Math.abs(wx * c - wz * sn) <= reachX && Math.abs(wx * sn + wz * c) <= reachZ;
    };
    let changed = false;
    for (const span of seam.spans) {
      if (span.count < 3 || span.partClass === 'roof' || flattenedSpans.has(span)) continue;
      const geo = (span.mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geo || geo.index) continue;
      spanMatrices(span);
      const arr = span.position.array as Float32Array;
      const start = span.first + ((3 - (span.first % 3)) % 3);
      let touched = false;
      for (let i = start; i + 2 < span.first + span.count; i += 3) {
        _ta.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        _tb.set(arr[i * 3 + 3], arr[i * 3 + 4], arr[i * 3 + 5]).applyMatrix4(_m);
        _tc.set(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]).applyMatrix4(_m);
        _e1.subVectors(_tb, _ta); _e2.subVectors(_tc, _ta);
        const n = _e1.cross(_e2);
        const len = n.length();
        if (!(len > 1e-9) || Math.abs(n.y) / len <= 0.3) continue;
        if (!inBody(_ta) || !inBody(_tb) || !inBody(_tc)) continue;
        if (!touched) { keep(span); touched = true; }
        for (let k = 1; k < 3; k++) {
          arr[(i + k) * 3] = arr[i * 3]; arr[(i + k) * 3 + 1] = arr[i * 3 + 1]; arr[(i + k) * 3 + 2] = arr[i * 3 + 2];
        }
      }
      if (touched) {
        span.position.addUpdateRange(span.first * 3, span.count * 3);
        span.position.needsUpdate = true;
        changed = true;
      }
    }
    return changed;
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
  // (wave 277: a breach read as "a black blot") the room behind a hole is dim, not black: daylight falls in through the
  // hole and the windows and bounces off its floor and far wall — its interior tint lifted, a little light of its own
  // (dcore 2026-10-09, the battle strips: a punched hole's room read as a pale grey-white blob in a stone wall) dimmer
  // (wave 322: "glowing white bars and dots" — a light floor slab behind a hole at 1.9x its tint bloomed in the sun) at its
  // own tint, never brighter: the dark interiors stay dim through their small light of their own
  // (wave 326: still "a glowing white bar along a storey seam" — the floor slab over a hole, cream in the sun) the room
  // at six tenths of its tint: in shade, as a room's inside is
  const roomMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.6, 0.6, 0.6), roughness: 1, metalness: 0,
    vertexColors: true, envMapIntensity: 0, emissive: new THREE.Color(0.016, 0.014, 0.012) });
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
    standing = true, owner?: RunOwner, piecesOnly = false, noPieces = false, holeSeed?: number): void {
    const byBucket = spanMaterials(seam);
    const resolve = (bucket: string, role?: DamageRole): THREE.Material => role === 'room' ? roomMaterial
      : byBucket.get(bucket) ?? o.materialFor?.(bucket) ?? fallbackFor(bucket);
    const depths = standing ? depthMaterials(seam) : null;
    const out = debris.begin(seam.anatomy.placement, resolve, delayS, settled, standing
      ? { tag: STAGE_RUN_TAG + seam.structureIdx + 1, depthFor: (bucket) => depths?.get(bucket) ?? null, meshes: !piecesOnly,
        pieces: !noPieces }
      : { meshes: !piecesOnly, pieces: !noPieces });
    let result: DamageStageResult | null = null;
    try { result = build(out); } catch { result = null; }
    const made = debris.commit();
    if (owner) for (const mesh of made) mesh.userData.runOwner = owner;
    apply(seam, result, holeSeed);
  }

  // ---- the collapse's crumble (round 7, wave 277: "no wall, roof or masonry is ever seen falling in pieces or with any
  // weight"): the mask cuts the walls above a ragged front coming down from the top (structureMask collapseFront); as it
  // passes each band of every face, that band's own pieces leave it — in the face's layers' buckets and tints, the core
  // most, the skin less — barely pushed, so they drop with gravity's weight, land at its foot, tumble a little and lie
  const CRUMBLE_BAND = 0.45;
  const crumbleShare = Math.max(0, Math.min(1, o.crumble ?? 1));
  const shapeOfMaterial = (m: FractureMaterial): DebrisShape => {
    switch (m) {
      case 'brick': case 'adobe': return 'block';
      case 'stone': case 'rubble': return 'stone';
      case 'concrete': case 'plaster': return 'plate';
      case 'timber': return 'beam';
      case 'plank': case 'infill': return 'plate';
      case 'metal': case 'canvas': return 'sheet';
      case 'glass': return 'shard';
      case 'tile': return 'tile';
      case 'slate': return 'slate';
      case 'thatch': return 'straw';
      default: return 'chunk';
    }
  };
  function crumble(seam: StructureDamageSeam, e: StructureStageEvent): void {
    if (!(crumbleShare > 0)) return;
    const a = seam.anatomy;
    // the walls up to the eaves (the roof is the mask's: it drops onto the front)
    const H = collapseWallHeight(Math.max(1, e.topY - e.baseY), a.roof ? a.placement.y + a.roof.eaveY - e.baseY : 0);
    const baseRel = e.baseY - a.placement.y;
    const c = Math.cos(a.placement.yaw), sn = Math.sin(a.placement.yaw);
    // the blow in the body frame: the struck side's pieces are pushed out harder
    const dl = Math.hypot(e.dirX || 0, e.dirZ || 0) || 1;
    const bdx = ((e.dirX || 0) * c - (e.dirZ || 0) * sn) / dl, bdz = ((e.dirX || 0) * sn + (e.dirZ || 0) * c) / dl;
    const rng = damageRng(damageSeed(a.seed, 7, e.structureId));
    const bands = Math.max(1, Math.ceil(H / CRUMBLE_BAND));
    // (dcore 2026-10-09, the battle strips: the falling walls threw a cloud of large blocks that lay as a carpet) fewer,
    // a little smaller: the pile is the kit's heap, the pieces its fall
    const spacing = 1.7;
    for (let b = 0; b < bands; b++) {
      const h1 = H - b * CRUMBLE_BAND, h0 = Math.max(0, h1 - CRUMBLE_BAND);
      const y0 = baseRel + h0, y1 = baseRel + h1;
      run(seam, collapseFrontTime(0.5 * (h0 + h1), H), false, (out) => {
        for (const storey of a.storeys) {
          for (const face of storey.faces) {
            const fy0 = face.origin[1], fy1 = face.origin[1] + face.height;
            if (fy1 <= y0 || fy0 >= y1 || !face.layers.length) continue;
            const thick = face.layers.reduce((sum, l) => sum + l.thicknessM, 0) || 0.3;
            const yaw = Math.atan2(face.out[0], face.out[2]);
            const push = 0.3 + Math.max(0, -(face.out[0] * bdx + face.out[2] * bdz)) * 0.9;
            const n = Math.max(1, Math.round(face.width / spacing));
            for (let i = 0; i < n; i++) {
              // (a tier with small pools throws its share of them)
              if (crumbleShare < 1 && rng() > crumbleShare) continue;
              const u = -face.width / 2 + (i + rng()) * (face.width / n);
              const y = y0 + rng() * (Math.min(y1, fy1) - Math.max(y0, fy0)) + Math.max(0, fy0 - y0);
              // nothing falls out of a window or a door
              const fy = y - fy0;
              if (face.openings.some((op) => Math.abs(u - op.u) < op.w / 2 && fy > op.y0 && fy < op.y0 + op.h)) continue;
              // (dcore 2026-10-09, waves 294a/b: "pale popcorn chips far paler than the red facade") the wall's own
              // face most (its skin: the brick, the stone, the timber and infill), its core the rest
              const slot: FractureSlot = face.layers.length > 1 && rng() < 0.35 ? face.layers[face.layers.length - 1]! : face.layers[0]!;
              const shape = shapeOfMaterial(slot.material);
              const flat = shape === 'plate' || shape === 'sheet' || shape === 'tile' || shape === 'slate';
              const size = (shape === 'beam' ? 1.3 : 0.6) * (0.7 + rng() * 0.6);
              const inset = thick * 0.5;
              const px = face.origin[0] + face.u[0] * u - face.out[0] * inset;
              const pz = face.origin[2] + face.u[2] * u - face.out[2] * inset;
              // aligned with the wall, a little askew
              const qa = (yaw + (rng() - 0.5) * 0.6) * 0.5, qt = (rng() - 0.5) * 0.4;
              const qy = Math.sin(qa), qw = Math.cos(qa), qx = Math.sin(qt) * 0.5, qz = Math.sin(qt) * 0.3;
              const v = push * (0.6 + rng() * 0.8);
              out.pieces.push(slot.bucket, shape, Math.floor(rng() * 4), px, y, pz, qx, qy, qz, qw,
                size, size * (flat ? 0.14 : 0.62), Math.min(size * 0.8, Math.max(0.2, thick)),
                slot.tint[0], slot.tint[1], slot.tint[2],
                face.out[0] * v + (rng() - 0.5) * 0.6, -0.4 + rng() * 0.6, face.out[2] * v + (rng() - 0.5) * 0.6);
            }
          }
        }
        return { cuts: [], hides: [] };
      }, false);
    }
  }

  const falling: { seam: StructureDamageSeam; until: number }[] = [];

  /** A storey's drop at once: the band down to its floor line, what stood on it lowered by its height, its own runs gone
   *  and its neighbours settled, then the kit's heap on the floor line (laid last: it stands); `holes`: its holes and
   *  scars too (a fall in flight has moved them itself). */
  function dropStorey(structureId: number, seam: StructureDamageSeam, storey: DamageStorey, settled: boolean, holes: boolean): boolean {
    const a = seam.anatomy;
    let changed = clampStorey(seam, storey);
    const [reachX, reachZ] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    changed = dropRuns(seam, (bx, by, bz) => by > storey.y0 + 0.02 && by <= storey.y1 + SLAB_EPS && Math.abs(bx) <= reachX
      && Math.abs(bz) <= reachZ, (owner) => owner.storey === storey.index) || changed;
    changed = settleRuns(seam, storey, reachX, reachZ) || changed;
    if (holes) {
      mask.moveHoles(seam.structureIdx, a.placement.y + storey.y0 + 0.02, a.placement.y + storey.y1 + SLAB_EPS, dropM);
      o.scars?.clearWhere(structureId, (_x, y) => y > a.placement.y + storey.y0 + 0.02);
    }
    const storeyDown = (seam as StructureDamageSeam & { storeyDown?(storey: number, seed: number, out: DamageWriters): DamageStageResult })
      .storeyDown;
    if (typeof storeyDown === 'function') {
      run(seam, 0, settled, (out) => storeyDown.call(seam, storey.index, damageSeed(a.seed, 1000 + storey.index), out), true,
        { section: -1, storey: storey.index });
    }
    return changed;
  }

  /** A storey's drop in flight: what it moves and where it all stood when it began (spans in their own frame, runs'
   *  world heights), how far it has come down (d), and its clock. */
  interface FallSpan { span: StructureSpan; obj: Float32Array; ride: boolean }
  interface FallRun { mesh: THREE.Mesh; pos: THREE.BufferAttribute; y: Float32Array }
  interface StoreyFall {
    structureId: number; seam: StructureDamageSeam; storey: DamageStorey; settled: boolean;
    t0: number; T: number; dropM: number; d: number;
    px: number; py: number; pz: number; c: number; s: number; reachX: number; reachZ: number;
    spans: FallSpan[]; runs: FallRun[];
  }
  const G = 9.81;
  const storeyFalls: StoreyFall[] = [];
  /** The clamp's law at depth d (body frame): over the footprint, the band toward its floor line, above it down by d. */
  function fallTo(f: StoreyFall, bx: number, by: number, bz: number, d: number): number {
    if (Math.abs(bx) > f.reachX || Math.abs(bz) > f.reachZ || !(by > f.storey.y0 + 0.02)) return by;
    return by <= f.storey.y1 + SLAB_EPS ? Math.max(f.storey.y0, by - d) : by - d;
  }
  function startStoreyFall(structureId: number, seam: StructureDamageSeam, storey: DamageStorey, settled: boolean): void {
    const a = seam.anatomy;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const [reachX, reachZ] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    const f: StoreyFall = { structureId, seam, storey, settled, t0: o.now(), T: Math.sqrt(2 * Math.max(0.1, dropM) / G), dropM, d: 0,
      px, py, pz, c, s, reachX, reachZ, spans: [], runs: [] };
    // the band's holes are crushed with it at once, and the phone's scars above the floor line go
    mask.moveHoles(seam.structureIdx, py + storey.y0 + 0.02, py + storey.y1 + SLAB_EPS, 0);
    o.scars?.clearWhere(structureId, (_x, y) => y > py + storey.y0 + 0.02);
    for (const span of seam.spans) {
      if (span.count <= 0 || flattenedSpans.has(span)) continue;
      const ride = span.partClass === 'roof' && spanTop(seam, span) > storey.y1 + SLAB_EPS;
      spanMatrices(span);
      const arr = span.position.array as Float32Array;
      let moves = ride;
      for (let i = span.first, end = span.first + span.count; !moves && i < end; i++) {
        _p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        const wx = _p.x - px, wz = _p.z - pz, by = _p.y - py;
        moves = fallTo(f, wx * c - wz * s, by, wx * s + wz * c, dropM) !== by;
      }
      if (!moves) continue;
      keep(span);
      f.spans.push({ span, obj: arr.slice(span.first * 3, (span.first + span.count) * 3), ride });
    }
    for (const mesh of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const y = new Float32Array(pos.count);
      let moves = false;
      for (let i = 0; i < pos.count; i++) {
        y[i] = pos.getY(i);
        if (!moves) {
          const wx = pos.getX(i) - px, wz = pos.getZ(i) - pz, by = y[i] - py;
          moves = fallTo(f, wx * c - wz * s, by, wx * s + wz * c, dropM) !== by;
        }
      }
      if (moves) f.runs.push({ mesh, pos, y });
    }
    storeyFalls.push(f);
    falling.push({ seam, until: f.t0 + f.T });
  }
  /** The fall at depth d: every vertex it moves from where it stood, the holes above the band down with them. */
  function applyFall(f: StoreyFall, d: number): void {
    for (const fs of f.spans) {
      const { span } = fs;
      spanMatrices(span);
      const arr = span.position.array as Float32Array;
      for (let k = 0; k < span.count; k++) {
        const i = span.first + k, j = k * 3;
        _p.set(fs.obj[j], fs.obj[j + 1], fs.obj[j + 2]).applyMatrix4(_m);
        const wx = _p.x - f.px, wz = _p.z - f.pz, by = _p.y - f.py;
        const to = fs.ride ? by - d : fallTo(f, wx * f.c - wz * f.s, by, wx * f.s + wz * f.c, d);
        if (to === by) { arr[i * 3] = fs.obj[j]; arr[i * 3 + 1] = fs.obj[j + 1]; arr[i * 3 + 2] = fs.obj[j + 2]; continue; }
        _p.y = to + f.py;
        _p.applyMatrix4(_mi);
        arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
      }
      span.position.addUpdateRange(span.first * 3, span.count * 3);
      span.position.needsUpdate = true;
    }
    for (const r of f.runs) {
      for (let i = 0; i < r.pos.count; i++) {
        const wx = r.pos.getX(i) - f.px, wz = r.pos.getZ(i) - f.pz, by = r.y[i] - f.py;
        r.pos.setY(i, fallTo(f, wx * f.c - wz * f.s, by, wx * f.s + wz * f.c, d) + f.py);
      }
      r.pos.needsUpdate = true;
      r.mesh.geometry.computeBoundingSphere();
    }
    if (d > f.d) {
      mask.moveHoles(f.seam.structureIdx, f.py + f.storey.y0 + 0.02, f.py + f.storey.y1 + SLAB_EPS - f.d, d - f.d);
      f.d = d;
    }
    f.seam.touchShadows();
  }
  /** The fall's end: everything back where it stood, then the instant drop's own path lays the exact end. */
  function finishFall(f: StoreyFall): void {
    for (const fs of f.spans) {
      (fs.span.position.array as Float32Array).set(fs.obj, fs.span.first * 3);
      fs.span.position.addUpdateRange(fs.span.first * 3, fs.span.count * 3);
      fs.span.position.needsUpdate = true;
    }
    for (const r of f.runs) {
      for (let i = 0; i < r.pos.count; i++) r.pos.setY(i, r.y[i]);
      r.pos.needsUpdate = true;
      r.mesh.geometry.computeBoundingSphere();
    }
    if (f.d < f.dropM) {
      mask.moveHoles(f.seam.structureIdx, f.py + f.storey.y0 + 0.02, f.py + f.storey.y1 + SLAB_EPS - f.d, f.dropM - f.d);
      f.d = f.dropM;
    }
    dropStorey(f.structureId, f.seam, f.storey, f.settled, false);
    f.seam.touchShadows();
  }
  /** A new event on a structure lands on its finished drops (the cascade's next storey, its collapse, a hole). */
  function finishFalls(structureId: number): void {
    if (!storeyFalls.length) return;
    let k = 0;
    for (const f of storeyFalls) {
      if (f.structureId === structureId) finishFall(f);
      else storeyFalls[k++] = f;
    }
    storeyFalls.length = k;
  }

  return {
    stage(e, seam) {
      finishFalls(e.structureId);
      if ((e as StructureStageEvent & { sections?: boolean }).sections === true) sectionsSeen.add(e.structureId);
      const settled = e.settled === true;
      if (e.stage === 'collapsed') {
        // the roof drops into it and the walls come down along the crumble front over COLLAPSE_S, then it is gone
        // (settled: gone at once); the mask needs its eaves and footprint for the roof
        const a = seam?.anatomy;
        const fall = a ? { eaveM: a.roof ? a.placement.y + a.roof.eaveY - e.baseY : 0, halfW: a.w / 2, halfD: a.d / 2,
          yaw: a.placement.yaw } : { eaveM: 0, halfW: e.hw, halfD: e.hd, yaw: e.yaw };
        // after the P2 cascade (sections on) every storey is down already: what stands folds quickly under the final dust
        const cascaded = (e as StructureStageEvent & { sections?: boolean }).sections === true;
        // a shaft goes over whole in the blow's direction (structureTopple), not down its own front
        const topple = structureTopple(a, e);
        mask.collapse(e.structureId, o.now(), Math.max(1, e.topY - e.baseY), topple ? topple.dirX : e.dirX, topple ? topple.dirZ : e.dirZ,
          e.cx, e.baseY, e.cz, settled, topple ? { ...fall, toppleHingeM: topple.hingeM } : fall, cascaded ? 0.25 : undefined);
        o.scars?.clearStructure(e.structureId);
        if (seam) {
          if (settled) seam.touchShadows();
          else falling.push({ seam, until: o.now() + (cascaded ? 0.3 : topple ? topple.landS + 1.7 : COLLAPSE_S) });
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
      // (a round's own strike hole there is the breach already: no second hole on top of it)
      if (e.stage === 'breached' && !sections && (settled || !nearPunched(e.structureId, e.x, e.y, e.z, 2))) {
        const blow = breachBlowFor(e);
        // a ram's breach is the hull's way in: wider than the hull is high
        const radiusM = e.cause === 'ram' ? Math.max(blow.radiusM, 3.2) : blow.radiusM;
        const spec = seam.holeAt(blow.x, blow.y, blow.z, radiusM, e.dirX, e.dirZ, e.munition, e.cause, 0);
        if (spec) {
          notePunched(e.structureId, e.x, e.y, e.z);
          run(seam, 0, settled, (out) => seam.breach(spec, out), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed);
        }
      }
      if (e.stage === 'collapsed') downed.add(e.structureId);
      // (dcore 2026-10-09, wave 294a: "the tank sits inside the unbroken wall for ~900 ms") a ram that brings a building
      // down opens the hull's way through at once (the breach stage's ram blow, a little wider than the hull is high),
      // while the rest comes down along the front
      if (e.stage === 'collapsed' && e.cause === 'ram' && !settled && !sections && !structureTopple(seam.anatomy, e)) {
        // in through the struck face and out through the far one along the hull's heading (a hull that brings it down
        // keeps going: the authority's ramThrough), so it never drives through a standing wall while the front comes down
        const blow = breachBlowFor(e);
        const r = Math.max(blow.radiusM, 3.2);
        const a = seam.anatomy;
        const c = Math.cos(a.placement.yaw), sn = Math.sin(a.placement.yaw);
        const dl = Math.hypot(e.dirX || 0, e.dirZ || 0) || 1;
        const dx = (e.dirX || 0) / dl, dz = (e.dirZ || 0) / dl;
        const wx = blow.x - a.placement.x, wz = blow.z - a.placement.z;
        const bx = wx * c - wz * sn, bz = wx * sn + wz * c, bdx = dx * c - dz * sn, bdz = dx * sn + dz * c;
        const hw = a.w / 2, hd = a.d / 2;
        const tx = bdx > 1e-3 ? (hw - bx) / bdx : bdx < -1e-3 ? (-hw - bx) / bdx : Infinity;
        const tz = bdz > 1e-3 ? (hd - bz) / bdz : bdz < -1e-3 ? (-hd - bz) / bdz : Infinity;
        const through = Math.min(tx, tz);
        // (the breach stage the same blow raised has opened the way in already)
        const ways: Array<[number, number, number]> = nearPunched(e.structureId, e.x, e.y, e.z, 1.5) ? [] : [[blow.x, blow.z, 0]];
        if (Number.isFinite(through) && through > 1) ways.push([blow.x + dx * through, blow.z + dz * through, 1]);
        for (const [hx, hz, hole] of ways) {
          const spec = seam.holeAt(hx, blow.y, hz, r, e.dirX, e.dirZ, e.munition, e.cause, hole);
          if (!spec) continue;
          notePunched(e.structureId, hx, blow.y, hz);
          run(seam, 0, false, (out) => seam.breach(spec, out), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed);
        }
      }
      // a collapse's stubs and pile show under the walls as they come down; the walls' own pieces leave the front
      if (e.stage === 'collapsed') {
        // after the P2 cascade the storeys threw their own pieces as they dropped: the kit lays its pile, stubs and
        // chimneys at once and throws none (its writer's capacity 0); otherwise the pile shows under the falling walls and
        // the walls' own pieces leave the crumble front
        const topple = structureTopple(seam.anatomy, e);
        if ((e as StructureStageEvent & { sections?: boolean }).sections === true) {
          run(seam, 0, settled, (out) => seam.collapse(stageSeed(3), out), false, undefined, false, true);
        } else if (topple) {
          // a shaft: its stump, the heap round its foot and its drums along the fall line show as it lands, where it
          // lies (the kit reads the fall's line, body frame, off its writers); no front, so no crumble
          const { yaw } = seam.anatomy.placement;
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          const axis: [number, number] = [topple.dirX * c - topple.dirZ * sn, topple.dirX * sn + topple.dirZ * c];
          run(seam, topple.landS, settled, (out) => {
            (out as DamageWriters & { fallAxis?: [number, number] }).fallAxis = axis;
            return seam.collapse(stageSeed(3), out);
          }, false);
        } else {
          // (dcore 2026-10-09, waves 294a/b: "flat carpets spread metres across the street") the walls' pieces topple
          // off them and land at their foot: the kit's throw at 0.55 of its speed, never up
          const eaveY = seam.anatomy.roof ? seam.anatomy.roof.eaveY : Infinity;
          run(seam, 0.7, settled, (out) => seam.collapse(stageSeed(3), dampPieces(out, 0.55, eaveY)), false);
          if (!settled) crumble(seam, e);
        }
      }
    },
    warm(at, buckets) {
      const list = [...buckets].filter((bucket) => !!o.materialFor?.(bucket));
      const resolve = (bucket: string, role?: DamageRole): THREE.Material => role === 'room' ? roomMaterial
        : o.materialFor?.(bucket) ?? fallbackFor(bucket);
      const out = debris.begin({ x: at.x, y: at.y, z: at.z, yaw: 0 }, resolve, 0, false, { tag: STAGE_RUN_TAG + 1 });
      const tri = (bucket: string, role: DamageRole, k: number): void => {
        if (!out.mesh.begin(bucket, role)) return;
        const x = (k % 8) * 0.4, y = Math.floor(k / 8) * 0.4;
        const a = out.mesh.vertex(x, y, 0, 0, 0, 1, 0, 0, 1, 1, 1);
        const b = out.mesh.vertex(x + 0.3, y, 0, 0, 0, 1, 1, 0, 1, 1, 1);
        const c = out.mesh.vertex(x, y + 0.3, 0, 0, 0, 1, 0, 1, 1, 1, 1);
        out.mesh.triangle(a, b, c);
        out.mesh.end();
      };
      // (the deployment's covered compile: a run per world bucket cost seconds of battle entry, and the spike's first
      // collapse compiled exactly two programs the world had not: the room behind a hole and the pieces' material) the
      // room and one piece, nothing else (R262: the warm keeps battle entry within half a second)
      tri(list[0] ?? 'stone', 'room', 0);
      out.pieces.push(list[0] ?? 'stone', 'chunk', 0, 0, 0.5, 0, 0, 0, 0, 1, 0.2, 0.2, 0.2, 0.5, 0.5, 0.5, 0, 0, 0);
      const made = debris.commit();
      for (const mesh of made) mesh.frustumCulled = false;
      return made.length;
    },
    strike(structureId, seam, x, y, z, dirX, dirZ, munition, chargeKg) {
      // punched a moment later, under the burst's flash: the same step's stage and breach events land first (with
      // sections on the sim's own hole is the hole; a collapse takes the building down instead)
      // (the phone tier draws scars, not cuts, and its event-time budget is small: a strike there stays the wall's burst)
      if (!seam || o.scars || !(strikeHoleRadius(munition, chargeKg) > 0)) return;
      pendingStrikes.push({ structureId, seam, x, y, z, dirX, dirZ, munition, chargeKg, at: o.now() });
    },
    breach(e, seam) {
      finishFalls(e.structureId);
      sectionsSeen.add(e.structureId);
      if (!seam) return;
      const settled = e.settled === true;
      const cause = e.munition === 'kinetic' || e.munition === 'autocannon_ap' ? 'kinetic' : 'blast';
      if (!e.sectionDown) {
        if (!(e.radiusM > 0)) return;
        realHoles.add(e.structureId);
        const spec = seam.holeAt(e.x, e.y, e.z, e.radiusM, 0, 0, e.munition, cause, e.hole);
        if (spec) run(seam, 0, settled, (out) => seam.breach(spec, out), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed);
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
        if (roof && fallOnce(e.structureId, roof.section)) {
          // the roof's own patches and eave bands from earlier blows go with it (first: the fall's own runs stand)
          const reachX = a.w / 2 + 1.5, reachZ = a.d / 2 + 1.5;
          changed = dropRuns(seam, (bx, by, bz) => by >= roof.eaveY - 0.25 && Math.abs(bx) <= reachX && Math.abs(bz) <= reachZ,
            (owner) => owner.section === roof.section) || changed;
          o.scars?.clearWhere(e.structureId, (_x, y) => y >= a.placement.y + roof.eaveY - 0.25);
          run(seam, 0, settled, (out) => seam.sectionDown(roof.section, damageSeed(a.seed, roof.section, 255), out), true,
            { section: roof.section, storey: -1 });
        }
      } else {
        const spec = seam.holeAt(e.x, e.y, e.z, 0.01, 0, 0, e.munition, cause, 255);
        const storey = spec ? a.storeys[spec.storey] : null;
        const face = storey ? storey.faces.find((f) => f.name === spec!.face) ?? null : null;
        if (spec && storey && face && fallOnce(e.structureId, spec.section)) {
          // the panel above its stub (a metre over the base; an upper storey's falls to its floor line)
          const y0 = e.y0 - a.placement.y, y1 = e.y1 - a.placement.y;
          const stubTop = Math.max(y0, baseY + 1 - a.placement.y, storey.y0), top = Math.max(y1, storey.y1);
          changed = clampPanel(seam, face, stubTop, top) || changed;
          // the panel's own rims and the room behind its holes go with it (before the kit's fall: its own runs stand)
          const t = Math.max(0.12, face.layers.reduce((sum, layer) => sum + (layer.thicknessM || 0), 0));
          const onPanel = (bx: number, by: number, bz: number): boolean => {
            if (by <= stubTop || by > top + SLAB_EPS) return false;
            const ox = bx - face.origin[0], oz = bz - face.origin[2];
            const along = ox * face.out[0] + oz * face.out[2];
            return along <= SLAB_EPS + 0.1 && along >= -t - 1.2 && Math.abs(ox * face.u[0] + oz * face.u[2]) <= face.width / 2 + 0.3;
          };
          changed = dropRuns(seam, onPanel, (owner) => owner.section === spec.section) || changed;
          o.scars?.clearWhere(e.structureId, (x, y, z) => {
            const { x: px, y: py, z: pz, yaw } = a.placement;
            const c = Math.cos(yaw), s = Math.sin(yaw), wx = x - px, wz = z - pz;
            return onPanel(wx * c - wz * s, y - py, wx * s + wz * c);
          });
          // falling with its storey (the core 2026-10-08: its stub and room were laid only to be hidden by the drop), the
          // panel throws its pieces only; the storey's own fall lays what is left
          run(seam, 0, settled, (out) => seam.sectionDown(spec.section, damageSeed(a.seed, spec.section, 255), out), true,
            { section: spec.section, storey: storey.index }, ev.storeyDown === true);
        }
        if (ev.storeyDown === true && storey) {
          // the band down to its floor line, what stood on it lowered by its height, its holes' runs and cuts gone, then
          // the kit's heap on the floor line (laid last: it stands); live, it comes down over gravity's time (the core
          // 2026-10-08: the cascade's next storey follows sqrt(2 h / g) after), settled at once
          if (settled) changed = dropStorey(e.structureId, seam, storey, settled, true) || changed;
          else startStoreyFall(e.structureId, seam, storey, settled);
        }
      }
      if (changed) seam.touchShadows();
    },
    update() {
      if (pendingStrikes.length) {
        const t = o.now();
        let k = 0;
        for (const p of pendingStrikes) {
          if (t - p.at >= STRIKE_WAIT_S) punch(p);
          else pendingStrikes[k++] = p;
        }
        pendingStrikes.length = k;
      }
      if (storeyFalls.length) {
        const t = o.now();
        let k = 0;
        for (const f of storeyFalls) {
          const age = t - f.t0;
          if (age >= f.T) { finishFall(f); continue; }
          applyFall(f, Math.min(f.dropM, 0.5 * G * Math.max(0, age) * Math.max(0, age)));
          storeyFalls[k++] = f;
        }
        storeyFalls.length = k;
      }
      if (!falling.length) return;
      const now = o.now();
      let k = 0;
      // every frame the mask moves a building, and the one it is discarded on
      for (const f of falling) { f.seam.touchShadows(); if (now <= f.until) falling[k++] = f; }
      falling.length = k;
    },
    shiftTime(delta) {
      for (const p of pendingStrikes) p.at += delta;
      for (const f of falling) f.until += delta;
      for (const f of storeyFalls) f.t0 += delta;
    },
    reset() {
      storeyFalls.length = 0;
      for (const [span, saved] of originals) {
        const pos = span.position;
        (pos.array as Float32Array).set(saved, span.first * 3);
        pos.addUpdateRange(span.first * 3, saved.length);
        pos.needsUpdate = true;
      }
      originals.clear();
      realHoles.clear();
      punched.clear();
      downed.clear();
      sectionsSeen.clear();
      pendingStrikes.length = 0;
      fallenSections.clear();
      flattened.length = 0;
      flattenedSpans = new WeakSet();
      falling.length = 0;
      o.scars?.reset();
    },
    stats: () => ({ falling: falling.length, flattened: flattened.length, kept: originals.size, dropping: storeyFalls.length }),
  };
}
