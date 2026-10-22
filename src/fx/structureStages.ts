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
  anatomyCentre, damageRng, damageSeed, type DamageFace, type DamageFall, type DamageRole, type DamageStageResult, type DamageStorey, type DamageWriters,
  type DebrisShape, type FractureMaterial, type FractureSlot, type StructureDamageAnatomy,
} from '../world/destructionKit.ts';
import { clearOverEaves, drawnOverAt, faceSetback, faceSetbackMedian, roofFurnitureAt, storeyInterior } from '../world/structureEnclosure.ts';
import { clampPieceTops } from './uprightPlates.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { toppleHingeM } from '../world/toppleHinge.ts';
import { breachBlowFor } from './structureFx.ts';
import {
  COLLAPSE_S, MAX_HOLES, STAGE_RUN_TAG, collapseFrontTime, collapseWallHeight, holeOutlinePhase01, toppleLandS, type StructureMask,
} from './structureMask.ts';
import type { StructureDebris } from './structureDebris.ts';
import { bindMaterialEnvIntensity } from '../engine/materialEnvIntensity.ts';
import type { StructureScars } from './structureScars.ts';
import type { FractureHost, StageFracture } from './fractureStages.ts';

/** A span's parts as flattenRoofFurniture reads them: its drawn triangles (from `start`, `n` of them) and their roots. */
interface OverEavesSpan {
  readonly span: StructureSpan;
  readonly find: (t: number) => number;
  readonly n: number;
  readonly start: number;
  readonly drawn: Uint8Array;
}

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
    munition: MunitionClass, chargeKg: number, caliberMm?: number): void;
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
  /** Whether a structure's storey is coming down now (its fall in flight: what stood over it moves with it). */
  falling(structureIdx: number): boolean;
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

/** The writers with their mesh runs refused but the pile's (a late joiner's settled roof fall: its rubble only). */
function rubbleOnly(out: DamageWriters): DamageWriters {
  const mesh0 = out.mesh;
  const mesh = Object.create(mesh0) as DamageWriters['mesh'];
  mesh.begin = (bucket: string, role: DamageRole): boolean => (role === 'rubble' ? mesh0.begin(bucket, role) : false);
  return Object.assign(Object.create(Object.getPrototypeOf(out) as object) as DamageWriters, out, { mesh });
}

/** Strike holes a standing building takes (the mask keeps MAX_HOLES; three are left for the stages' own cuts). 2026-10-10
 *  (the owner: "shooting buildings should cause destruction too"): every burst and every armour-piercing round leaves its
 *  hole, a dozen hits a building before it falls (it went from three, the rest of a battle's hits showing nothing). */
const STRIKE_HOLES = 9;
/** (round 5) A set piece's piece falls over gravity's time from its middle's drop, this much slower (it turns as it
 *  goes), never quicker or longer than these (s). */
const FALL_SLOW = 1.25, FALL_MIN_S = 0.45, FALL_MAX_S = 1.6;
/** (round 5) A part over the eaves stands with the roof gone when what stands under it holds this share of its lowest
 *  points (the slab check: a part held a quarter less than it was in the intact building hangs). */
const HOLD_OVER_EAVES = 0.75;
/** (destruction-slabs 227 round 5) A top storey's room open to the sky (its roof fallen): its walls and floor lit as the
 *  outside is (laid dim, 0.55-0.6, they read as one flat dark plane over the roofless storey: the critics' tavern lid) —
 *  (round 6: at 0.95 and 0.85 the round-5 films' tavern's inner walls glared white in the sun) a quarter under it —
 *  (238: the glare was the room material's light, roomMaterialFor; drawn in the building's own material, the quarter under
 *  read near black beside the sunlit wall heads) as the outside is again. */
const OPEN_ROOM_WALL = 0.95, OPEN_ROOM_FLOOR = 0.85;
/** A room's floor this far over its floor line (m): the storey under it draws its own top there. */
const ROOM_FLOOR_LIFT_M = 0.02;
/** A tank round's hole through a wall (no charge: the shot's own): a ragged pierce sized by its calibre, its rim spalled. */
function pierceHoleRadius(munition: MunitionClass, caliberMm: number): number {
  if (munition !== 'kinetic') return 0;
  return Math.min(0.45, Math.max(0.22, 0.1 + 0.0024 * (caliberMm > 0 ? caliberMm : 105)));
}
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
  // (an open frame buckles over its standing bays, a shaft above its stump: world/toppleHinge.ts, the collapse's rule too)
  const hingeM = toppleHingeM(H, (plan.damage.shaft as { lattice?: boolean }).lattice === true);
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
  /** Walls broken where struck, falls and collapses as rigid bodies (fx/fractureStages.ts; the phone: none). */
  fracture?: ((host: FractureHost) => StageFracture) | null;
}

/** The section and storey a run was laid for (-1: none — a roof's wreckage has no storey, a storey's heap no
 *  section): a section's fall takes its own runs, a storey's drop its storey's. */
interface RunOwner { section: number; storey: number }

/**
 * (the destruction check, Monsoon: a thatched granary's heap in the default kit's 'straw' bucket fell to the untextured
 * fallback while the world draws its thatch as 'thatch') a bucket the world does not draw under that name takes the
 * world's own material of the same stuff: thatch, straw and hay; a regional bucket and its base twin.
 */
const BUCKET_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  straw: ['thatch', 'hay'], hay: ['thatch', 'straw'], thatch: ['straw', 'hay'],
  stone: ['regionalStone'], regionalStone: ['stone'], roof: ['regionalRoof'], regionalRoof: ['roof'],
  wood: ['structureWood'], structureWood: ['wood'], plaster: ['regionalPlaster', 'plaster2'], regionalPlaster: ['plaster'],
  plaster2: ['regionalPlaster2', 'plaster'], regionalPlaster2: ['plaster2', 'regionalPlaster'],
  plaster3: ['regionalPlaster3', 'plaster'], regionalPlaster3: ['plaster3', 'regionalPlaster'],
});
/** The world's buckets of the same stuff as `bucket`, in the order a missing one is looked for. */
export function bucketAliases(bucket: string): readonly string[] {
  return BUCKET_ALIASES[bucket] ?? [];
}

/**
 * (destruction-slabs 227 round 4; the census's 242 runs of remnant piers 1-7 m over the building as drawn at their spot:
 * a firestation's steel stub, a stack's stump, a ruin's collapse stub over its banked heap) a remnant run's pieces cut
 * down to half a metre over the drawn form where their tops stand (the anatomy's enclosure: its tallest drawn over the
 * spot and the cells round it); where the drawn form is not known, as drawn. Its runs are world-space (structureDebris).
 */
function clampRemnantTops(mesh: THREE.Mesh, a: StructureDamageSeam['anatomy']): void {
  if (!a.enclosure) return;
  const { x: px, y: py, z: pz, yaw } = a.placement;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  clampPieceTops(mesh.geometry, (x, z) => {
    const dx = x - px, dz = z - pz, top = drawnOverAt(a, dx * c - dz * s, dx * s + dz * c, 1);
    return top >= 0 && Number.isFinite(top) ? py + top : NaN;
  }, 0.5);
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
  function storeyReach(seam: StructureDamageSeam, storey: DamageStorey): [number, number, number, number] {
    const a = seam.anatomy, jet = Math.max(0, ...storey.jetty);
    // (destruction-slabs 227) about the body's own centre (the default reading's faces stand about its walls' box)
    const [cx, cz] = anatomyCentre(a);
    return [a.w / 2 + jet + 1.5, a.d / 2 + jet + 1.5, cx, cz];
  }
  function clampStorey(seam: StructureDamageSeam, storey: DamageStorey): boolean {
    const [reachX, reachZ, cx, cz] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    const rides = new Set<StructureSpan>();
    for (const span of seam.spans) {
      if (span.partClass === 'roof' && !flattenedSpans.has(span) && spanTop(seam, span) > storey.y1 + SLAB_EPS) rides.add(span);
    }
    let changed = clampStructure(seam, () => true, (bx, by, bz) => {
      if (Math.abs(bx - cx) > reachX || Math.abs(bz - cz) > reachZ || !(by > storey.y0 + 0.02)) return null;
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
  function settleRuns(seam: StructureDamageSeam, storey: DamageStorey, reachX: number, reachZ: number, cx = 0, cz = 0): boolean {
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const dropM = storey.y1 - storey.y0;
    let moved = false;
    for (const mesh of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      let touched = false;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) - px, wz = pos.getZ(i) - pz;
        if (Math.abs(wx * c - wz * s - cx) > reachX || Math.abs(wx * s + wz * c - cz) > reachZ) continue;
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
    munition: MunitionClass; chargeKg: number; caliberMm: number; at: number;
  }
  const pendingStrikes: PendingStrike[] = [];
  /** The wait before a strike's hole is punched (s): the burst's flash covers it, the step's own events land first. */
  const STRIKE_WAIT_S = 0.08;
  function punch(p: PendingStrike): void {
    const { structureId, seam, x, y, z } = p;
    if (realHoles.has(structureId) || sectionsSeen.has(structureId) || downed.has(structureId)) return;
    if (fracture?.strike(seam, p)) { finishFalls(structureId); notePunched(structureId, x, y, z); return; }
    // (the battle strips, b3: a strike's hole healed over when later cuts — the damaged stage's spalls — took its slot in
    // the mask's ring) a strike never takes a slot another cut holds, and leaves one for the breach stage
    if (mask.holes(seam.structureIdx) >= MAX_HOLES - 1) return;
    const list = punched.get(structureId);
    const cause = p.munition === 'kinetic' || p.munition === 'autocannon_ap' ? 'kinetic' : 'blast';
    // a round's hole may sit closer to another than a burst's (a burst blows the wall round it)
    if ((list?.length ?? 0) >= STRIKE_HOLES || nearPunched(structureId, x, y, z, cause === 'kinetic' ? 0.6 : 1.1)) return;
    const radiusM = cause === 'kinetic' ? pierceHoleRadius(p.munition, p.caliberMm) : strikeHoleRadius(p.munition, p.chargeKg);
    if (!(radiusM > 0)) return;
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
    // a round's hole throws less, and slower, than a burst's: the spall falls out of it
    const throwK = cause === 'kinetic' ? 0.3 : 0.5;
    bodiesNext = strikeBodies(cause === 'kinetic' ? 'pierce' : 'blast', p.chargeKg);
    run(seam, 0, false, (out) => seam.breach(spec, dampPieces(out, throwK)), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed,
      cause === 'kinetic' ? 'pierce' : 'blast');
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
  /**
   * (destruction-slabs 227 round 6; the round-5 films' urban church #15: its nave's roof came down as the hanging sweep's
   * bodies once the top bands of its walls fell — no roof section's fall, so its rooms kept their ceilings and their shade,
   * one flat dark plane over the roofless nave at its wall heads to the film's end) the structures whose roof the sweep
   * took down (ROOF_GONE_SHARE of its triangles gone): open to the sky as a roof section's fall leaves them.
   */
  const roofOpened = new Set<number>();
  const ROOF_GONE_SHARE = 0.5;
  /** Whether a structure's roof is down: its section fell, or the sweep took most of it. */
  const roofDown = (seam: StructureDamageSeam): boolean => {
    const roof = seam.anatomy.roof;
    return !!roof && (roofOpened.has(seam.structureIdx) || !!fallenSections.get(seam.structureIdx)?.has(roof.section));
  };
  /** The roof's spans' share of their triangles still drawn (no roof span: 1). */
  function roofDrawnShare(seam: StructureDamageSeam): number {
    let all = 0, drawn = 0;
    for (const span of seam.spans) {
      if (span.partClass !== 'roof') continue;
      const arr = span.position.array as Float32Array;
      const start = span.first + ((3 - (span.first % 3)) % 3);
      const n = Math.max(0, Math.floor((span.first + span.count - start) / 3));
      for (let t = 0; t < n; t++) {
        const i = (start + t * 3) * 3;
        all++;
        const ux = arr[i + 3]! - arr[i]!, uy = arr[i + 4]! - arr[i + 1]!, uz = arr[i + 5]! - arr[i + 2]!;
        const vx = arr[i + 6]! - arr[i]!, vy = arr[i + 7]! - arr[i + 1]!, vz = arr[i + 8]! - arr[i + 2]!;
        if ((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 > 1e-18) drawn++;
      }
    }
    return all ? drawn / all : 1;
  }
  /** (round 6) The sweep took parts of a structure down: once most of its roof is gone, its top storey opens to the sky
   *  (rooms without ceilings, lit; what stood over the eaves looked at again). True when it opened now. */
  function roofDropped(seam: StructureDamageSeam): boolean {
    if (!seam.anatomy.roof || roofDown(seam) || roofDrawnShare(seam) > ROOF_GONE_SHARE) return false;
    roofOpened.add(seam.structureIdx);
    const opened = openTopRooms(seam);
    if (flattenRoofFurniture(seam) || opened) seam.touchShadows();
    return true;
  }

  /** What a stage returns: its cuts into the mask (body frame to world), its part-class hides flattened. */
  function apply(seam: StructureDamageSeam, result: DamageStageResult | null | undefined, holeSeed?: number,
    holeKind?: 'blast' | 'pierce', made: readonly THREE.Mesh[] = []): void {
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
        holeSeed !== undefined ? holeOutlinePhase01(holeSeed) : undefined, holeKind);
      // a hole through the wall opens through the earlier runs there too (a spall's render ring cuts only the skin: none)
      if (cut.depthM >= 0.2 && o.scars == null) {
        trimRuns(seam, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM, cut.outsideM ?? 0.3,
          holeSeed !== undefined ? holeOutlinePhase01(holeSeed) * Math.PI * 2 : null, made);
      }
      // a hole goes through the wall's layers; a spall or the render ring only through its render
      o.scars?.add(seam.structureIdx, wx, py + cut.y, wz, cut.radiusM, wnx, wnz, cut.depthM >= 0.2,
        (seam.anatomy.seed + Math.round(cut.x * 100) + Math.round(cut.y * 100)) >>> 0);
      changed = true;
    }
    for (const hide of result.hides ?? []) {
      // a set piece's named piece (landmarks/pieces.ts: a figure, a merlon, a sail) goes by its own spans
      if (hide.piece) {
        for (const span of seam.spans) if (span.piece === hide.piece) { flattenSpan(span); changed = true; }
        continue;
      }
      // the whole structure (a collapse) is the mask's fall; a section's hide waits for sections on the spans (P2)
      if (hide.partClass === null || hide.section !== null) continue;
      for (const span of seam.spans) if (span.partClass === hide.partClass) { flattenSpan(span); changed = true; }
      // (a building whose roof has its own bucket loses it above; one whose roof shares the walls' bucket loses its faces)
      if (hide.partClass === 'roof' && !seam.spans.some((sp) => sp.partClass === 'roof')) changed = flattenRoofFaces(seam) || changed;
      // (destruction-slabs 227 round 2) and the roof's furniture goes with it (a chimney or a dormer on the covering: the
      // roof's slabs carry it down; stood in the world it was left in the sky, or on the attic floor)
      if (hide.partClass === 'roof') changed = flattenRoofFurniture(seam) || changed;
    }
    if (changed) seam.touchShadows();
  }

  /**
   * The roof's furniture out of the world's buckets when its roof falls (destruction-slabs 227 round 2): every triangle of
   * the structure's other spans wholly over the eaves line (less 15 cm), centred in the footprint plus 1.5 m, over a cluster
   * structureEnclosure roofFurnitureAt reads as furniture (a chimney or a dormer on the covering: small, not drawn from
   * below — one decision a cluster, its frames and glass with its plaster) collapses to a point; collapsePieces'
   * furnitureAt reads the same, so the roof's slabs carry what the world drops. Needs the drawn enclosure (none: nothing
   * goes). Non-indexed spans.
   * (round 3, the engineering critic: a cottage's verge boards stood as an A-frame over its roofless walls, a farmhouse's
   * roof ladder hung beside its gable, a dormer's cap at antenna height — fine trim the enclosure never measures) And every
   * connected part (its corners welded) that starts within a metre under the eaves and reaches 30 cm over them, centred in
   * the footprint, over no cluster standing over the eaves (a gable, a tower, a stack drawn from below: their trim stays
   * with them) goes whole: what the roof carried (a ladder, an aerial, a verge board, a ridge's tiles) goes with it.
   */
  function flattenRoofFurniture(seam: StructureDamageSeam): boolean {
    const a = seam.anatomy;
    if (!a.roof || !a.enclosure || !a.storeys.length) return false;
    const eaveY = a.roof.eaveY, ridgeY = a.roof.ridgeY;
    const eave = eaveY - 0.15;
    const reachX = a.w / 2 + 1.5, reachZ = a.d / 2 + 1.5;
    const [bcx, bcz] = anatomyCentre(a);
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    let changed = false;
    const perSpan: OverEavesSpan[] = [];
    const candidates: Array<{ span: StructureSpan; r: number }> = [];
    const topSt = a.storeys[a.storeys.length - 1]!;
    const topHalf = (topSt.y0 + topSt.y1) / 2;
    for (const span of seam.spans) {
      if (span.count < 3 || span.partClass === 'roof' || span.piece || flattenedSpans.has(span)) continue;
      const geo = (span.mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geo || geo.index) continue;
      spanMatrices(span);
      const arr = span.position.array as Float32Array;
      const start = span.first + ((3 - (span.first % 3)) % 3);
      const n = Math.max(0, Math.floor((span.first + span.count - start) / 3));
      if (!n) continue;
      // each triangle's corners in the world (the buckets stand at identity) and its connected part (corners welded)
      const parent = new Int32Array(n);
      for (let t = 0; t < n; t++) parent[t] = t;
      const find = (t: number): number => { while (parent[t] !== t) { parent[t] = parent[parent[t]]!; t = parent[t]!; } return t; };
      const owner = new Map<string, number>();
      const drawn = new Uint8Array(n);
      for (let t = 0; t < n; t++) {
        const i = start + t * 3;
        _ta.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        _tb.set(arr[i * 3 + 3], arr[i * 3 + 4], arr[i * 3 + 5]).applyMatrix4(_m);
        _tc.set(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]).applyMatrix4(_m);
        _e1.subVectors(_tb, _ta); _e2.subVectors(_tc, _ta);
        if (!(_e1.cross(_e2).lengthSq() > 1e-18)) continue;
        drawn[t] = 1;
        for (const v of [_ta, _tb, _tc]) {
          const key = `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
          const prev = owner.get(key);
          if (prev === undefined) owner.set(key, t);
          else { const ra = find(prev), rb = find(t); if (ra !== rb) parent[ra] = rb; }
        }
      }
      // per part: its lowest and highest corner (body y) and its middle (body frame)
      const lo = new Map<number, number>(), hi = new Map<number, number>(), mid = new Map<number, [number, number, number]>();
      for (let t = 0; t < n; t++) {
        if (!drawn[t]) continue;
        const r = find(t), i = start + t * 3;
        _ta.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        _tb.set(arr[i * 3 + 3], arr[i * 3 + 4], arr[i * 3 + 5]).applyMatrix4(_m);
        _tc.set(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]).applyMatrix4(_m);
        const y0 = Math.min(_ta.y, _tb.y, _tc.y) - py, y1 = Math.max(_ta.y, _tb.y, _tc.y) - py;
        lo.set(r, Math.min(lo.get(r) ?? Infinity, y0)); hi.set(r, Math.max(hi.get(r) ?? -Infinity, y1));
        const wx = (_ta.x + _tb.x + _tc.x) / 3 - px, wz = (_ta.z + _tb.z + _tc.z) / 3 - pz;
        const m = mid.get(r) ?? [0, 0, 0];
        m[0] += wx * c - wz * sn; m[1] += wx * sn + wz * c; m[2]++;
        mid.set(r, m);
      }
      for (const [r, y0] of lo) {
        const m = mid.get(r)!;
        if (!(y0 >= eaveY - 1 && hi.get(r)! > eaveY + 0.3)) continue;
        if (Math.abs(m[0] / m[2] - bcx) > reachX || Math.abs(m[1] / m[2] - bcz) > reachZ) continue;
        candidates.push({ span, r });
      }
      perSpan.push({ span, find, n, start, drawn });
    }
    // what holds a part over the eaves up: the structure's other parts standing under it (its walls, a gable drawn in a
    // wall's bucket, a stack drawn from below — never the roof that falls, nor another part over the eaves until it is
    // held itself: two verge boards side by side hold nothing up); held over half its lowest points, it stands
    const goes = holdOverEaves(a, perSpan, candidates, eaveY);
    for (const ps of perSpan) {
      const { span, find, n, start, drawn } = ps;
      const arr = span.position.array as Float32Array;
      spanMatrices(span);
      let touched = false;
      for (let t = 0; t < n; t++) {
        if (!drawn[t]) continue;
        const i = start + t * 3;
        if (!goes.get(span)?.has(find(t))) {
          _ta.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
          _tb.set(arr[i * 3 + 3], arr[i * 3 + 4], arr[i * 3 + 5]).applyMatrix4(_m);
          _tc.set(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]).applyMatrix4(_m);
          // (round 3, the visual critic: a tavern's top storey stood capped by one flat dark plane, its interior's dark
          // volume's top the roof had covered) the dark bucket's level tops in the top storey's upper half go too
          // its centroid in the body frame
          const wx = (_ta.x + _tb.x + _tc.x) / 3 - px, wz = (_ta.z + _tb.z + _tc.z) / 3 - pz;
          const mx = wx * c - wz * sn, mz = wx * sn + wz * c;
          if (Math.abs(mx - bcx) > reachX || Math.abs(mz - bcz) > reachZ) continue;
          if (!darkTop(span, py, topHalf)) {
            if (Math.min(_ta.y, _tb.y, _tc.y) - py < eave) continue;
            // (and a level surface over the eaves under no standing cluster: the attic's lid the roof covered — left, it
            // capped the roofless storey as one clean flat roof, the critic's "flat raft")
            if (!roofFurnitureAt(a, mx, mz, eaveY, ridgeY)) {
              const ux = _tb.x - _ta.x, uy = _tb.y - _ta.y, uz = _tb.z - _ta.z, vx = _tc.x - _ta.x, vy = _tc.y - _ta.y, vz = _tc.z - _ta.z;
              const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
              if (!(Math.abs(ny) > 0.85 * Math.hypot(nx, ny, nz)) || !clearOverEaves(a, mx, mz, eaveY, ridgeY)) continue;
            }
          }
        }
        if (!touched) { keep(span); touched = true; }
        for (let q = 1; q < 3; q++) {
          arr[(i + q) * 3] = arr[i * 3]; arr[(i + q) * 3 + 1] = arr[i * 3 + 1]; arr[(i + q) * 3 + 2] = arr[i * 3 + 2];
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

  /**
   * (destruction-slabs 227 round 4, the critics' tavern #7: the roofless top storey capped by one flat dark plane at its
   * wall heads — the ceiling of the room laid behind its holes before the roof fell) the top storey's rooms lose their
   * ceilings with the roof: open to the sky. True when one changed.
   */
  function openTopRooms(seam: StructureDamageSeam): boolean {
    const a = seam.anatomy;
    const top = a.storeys.length - 1;
    let changed = false;
    for (const m of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      if (m.userData.room !== true || (m.userData.runOwner as RunOwner | undefined)?.storey !== top) continue;
      const g = m.geometry, ix = g.index, nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
      if (!ix || !nrm) continue;
      // (round 5; the round-4 critics' tavern #7, depot #8 and urban church #15 in the game's films: the roofless top storey
      // under one flat dark plane — its room's walls and floor, laid dim for a glimpse through a hole, open to the sky now)
      // lit as the sky lights it, once
      if (m.userData.openToSky !== true) {
        m.userData.openToSky = true;
        m.material = Array.isArray(m.material) ? m.material.map(openRoomMaterial) : openRoomMaterial(m.material);
        changed = true;
        const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (col) {
          for (let i = 0; i < col.count; i++) {
            const ny = nrm.getY(i);
            const k = ny > 0.9 ? OPEN_ROOM_FLOOR / 0.55 : Math.abs(ny) < 0.5 ? OPEN_ROOM_WALL / (Math.abs(nrm.getX(i)) > 0.5 ? 0.56 : 0.6) : 1;
            if (k !== 1) col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
          }
          col.needsUpdate = true;
          changed = true;
        }
      }
      const tris: number[] = [];
      for (let t = 0; t * 3 + 2 < ix.count; t++) {
        const v = ix.getX(t * 3);
        if (ix.getX(t * 3 + 1) === v && ix.getX(t * 3 + 2) === v) continue;
        if (nrm.getY(v) < -0.9) tris.push(t);
      }
      if (tris.length) { debris.dropRunTris(m, tris); changed = true; }
    }
    return changed;
  }

  /** Whether the triangle in _ta.._tc is a level top of the dark bucket (an interior's dark volume) over `overY` (body y). */
  function darkTop(span: StructureSpan, py: number, overY: number): boolean {
    if (span.bucket !== 'dark') return false;
    if ((_ta.y + _tb.y + _tc.y) / 3 - py < overY) return false;
    _e1.subVectors(_tb, _ta); _e2.subVectors(_tc, _ta);
    const n = _e1.cross(_e2);
    return n.y > 0.85 * n.length();
  }
  /**
   * Which parts over the eaves the structure's standing parts do not hold up (flattenRoofFurniture, round 3): per span, the
   * roots of the parts (`candidates`) that go. A body-frame grid (0.5 m) of the highest point drawn per cell by every part
   * that is no candidate (the walls, a stack drawn from below; the roof's spans are not among them); a candidate whose
   * lowest points (per cell) stand within 0.8 m over that grid's tops round them for half or more of its cells is held, and
   * holds in its turn (a gable drawn in a wall's bucket from the eaves holds its verge boards), until none more is.
   */
  function holdOverEaves(a: StructureDamageAnatomy, perSpan: readonly OverEavesSpan[], candidates: ReadonlyArray<{ span: StructureSpan; r: number }>,
    eaveY: number): Map<StructureSpan, Set<number>> {
    const goes = new Map<StructureSpan, Set<number>>();
    if (!candidates.length) return goes;
    const CELL = 0.5;
    const [bcx, bcz] = anatomyCentre(a);
    const half = Math.max(a.w, a.d) / 2 + 3;
    const x0 = bcx - half, z0 = bcz - half, nx = Math.ceil((2 * half) / CELL), N = nx * nx;
    const top = new Float32Array(N).fill(-Infinity);
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const pending = new Map<StructureSpan, Set<number>>();
    for (const { span, r } of candidates) { let set = pending.get(span); if (!set) pending.set(span, set = new Set()); set.add(r); }
    /** Every sample (body frame, ~0.4 m apart) of span `ps`'s triangles in parts `pick(root)`: visit(cell, y). */
    const samples = (ps: OverEavesSpan, pick: (root: number) => boolean, visit: (cell: number, y: number) => void): void => {
      spanMatrices(ps.span);
      const arr = ps.span.position.array as Float32Array;
      for (let t = 0; t < ps.n; t++) {
        if (!ps.drawn[t] || !pick(ps.find(t))) continue;
        const i = ps.start + t * 3;
        _ta.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
        _tb.set(arr[i * 3 + 3], arr[i * 3 + 4], arr[i * 3 + 5]).applyMatrix4(_m);
        _tc.set(arr[i * 3 + 6], arr[i * 3 + 7], arr[i * 3 + 8]).applyMatrix4(_m);
        const la = _ta.distanceTo(_tb), lb = _tb.distanceTo(_tc), lc = _tc.distanceTo(_ta);
        const k = Math.max(1, Math.min(40, Math.ceil(Math.max(la, lb, lc) / 0.4)));
        for (let u = 0; u <= k; u++) for (let v = 0; v <= k - u; v++) {
          const wa = 1 - (u + v) / k, wb = u / k, wc = v / k;
          const x = _ta.x * wa + _tb.x * wb + _tc.x * wc - px, y = _ta.y * wa + _tb.y * wb + _tc.y * wc - py, z = _ta.z * wa + _tb.z * wb + _tc.z * wc - pz;
          const bx = x * c - z * sn, bz = x * sn + z * c;
          const ci = Math.floor((bx - x0) / CELL), ck = Math.floor((bz - z0) / CELL);
          if (ci < 0 || ck < 0 || ci >= nx || ck >= nx) continue;
          visit(ck * nx + ci, y);
        }
      }
    };
    for (const ps of perSpan) {
      const mine = pending.get(ps.span);
      samples(ps, (root) => !mine?.has(root), (cell, y) => { if (y > top[cell]!) top[cell] = y; });
    }
    for (let pass = 0; pass < 6; pass++) {
      let held = 0;
      for (const ps of perSpan) {
        const mine = pending.get(ps.span);
        if (!mine?.size) continue;
        for (const root of [...mine]) {
          const low = new Map<number, number>();
          samples(ps, (r) => r === root, (cell, y) => { const v = low.get(cell); if (v === undefined || y < v) low.set(cell, y); });
          let ok = 0;
          for (const [cell, y] of low) {
            const ci = cell % nx, ck = (cell - ci) / nx;
            let t = -Infinity;
            for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
              const ii = ci + di, kk = ck + dk;
              if (ii >= 0 && kk >= 0 && ii < nx && kk < nx) t = Math.max(t, top[kk * nx + ii]!);
            }
            if (t >= y - 0.8) ok++;
          }
          // (round 5; the census's fjord #0 fishery, R narrow-back: a 1.4 m beam of its roof's frame 6.6 m up, held over half
          // its cells, hung 40 % held once the roof fell — the slab check calls a quarter less than it was held hanging) held
          // over three quarters of its lowest points, it stands
          if (low.size && ok >= HOLD_OVER_EAVES * low.size) {
            mine.delete(root); held++;
            samples(ps, (r) => r === root, (cell, y) => { if (y > top[cell]!) top[cell] = y; });
          }
        }
      }
      if (!held) break;
    }
    for (const [span, set] of pending) if (set.size) goes.set(span, set);
    void eaveY;
    return goes;
  }

  /** A roof drawn in another bucket (a sheet hall's in structureMetal, shingles in wood: their spans are 'wall' by
   *  bucket) goes with the roof's hide (facades 2026-10-08): every upward triangle of the structure (normal y > 0.3)
   *  reaching over the eaves (or the top storey's top where there is no roof) and centred inside the footprint plus
   *  1.5 m collapses to a point; a vertical gable stays, as a real one does. Non-indexed spans (the world's merged
   *  buckets). (Props census E6, lane B 2026-10-14: the test was every corner over the eaves less 15 cm, so a slope
   *  whose eave overhangs below that line — every pitched roof with an overhang — stood whole on roof-down; now its
   *  highest corner over the eaves line and its centroid in the footprint.) */
  const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
  function flattenRoofFaces(seam: StructureDamageSeam): boolean {
    const a = seam.anatomy;
    const top = a.storeys.length ? a.storeys[a.storeys.length - 1]!.y1 : 0;
    const eave = a.roof ? a.roof.eaveY - 0.15 : top - 0.1;
    const reachX = a.w / 2 + 1.5, reachZ = a.d / 2 + 1.5;
    const [bcx, bcz] = anatomyCentre(a);
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    // the triangle reaches over the eaves line (its highest corner) and stands in the footprint (its centroid)
    const inBody = (ta: THREE.Vector3, tb: THREE.Vector3, tc: THREE.Vector3): boolean => {
      if (Math.max(ta.y, tb.y, tc.y) - py < eave) return false;
      const wx = (ta.x + tb.x + tc.x) / 3 - px, wz = (ta.z + tb.z + tc.z) / 3 - pz;
      return Math.abs(wx * c - wz * sn - bcx) <= reachX && Math.abs(wx * sn + wz * c - bcz) <= reachZ;
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
        if (!inBody(_ta, _tb, _tc)) continue;
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

  const worldMaterial = (byBucket: Map<string, THREE.Material>, bucket: string): THREE.Material | null => {
    const own = byBucket.get(bucket) ?? o.materialFor?.(bucket) ?? null;
    if (own) return own;
    for (const alias of bucketAliases(bucket)) {
      const m = byBucket.get(alias) ?? o.materialFor?.(alias) ?? null;
      if (m) return m;
    }
    return null;
  };
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
  // (2026-10-12, the owner's Steinburg screenshot: "big flat untextured grey-blue rectangles ... in the wall where it
  // broke") the room was one flat untextured material whose envMapIntensity 0 three never honoured (materialEnvIntensity.ts):
  // the sky's light and its grazing sheen made every room box a slate-blue slab. It is drawn in the building's own bucket
  // texture now (the wall's plaster or brick, its floor's boards), shaded by the writer's interior tints, and takes only a
  // share of the sky's light (bound, so it holds); one program for every bucket (a map always: white where none)
  const ROOM_WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  ROOM_WHITE.needsUpdate = true;
  // (destruction-slabs 233; the owner's "weird ugly boxes/surfaces", the critics' dark lid over tavern #7's and depot #8's
  // roofless top storeys) a room open to the sky is no interior. The room material is lit as no world material is (it is
  // not the engine's shadow material, engineCtx.setupShadowMaterial: every cascade's sun at once, none of the world's sky
  // fill), so the roofless storey's far wall in its own shade drew near black — one flat dark plane over the storey from
  // the camera above — and its sunlit faces glared. Open, the room draws in its building's own material, lit as the
  // building's outside is (the faces the fracture redraws and the kit's rims draw in it too); with none, a room material
  // at the sky's full share and no light of its own
  const roomMaterials = new Map<string, THREE.MeshStandardMaterial>();
  function roomMaterialFor(source: THREE.Material | null | undefined, open = false): THREE.Material {
    if (open && source) return source;
    const map = (source as (THREE.Material & { map?: THREE.Texture | null }) | null | undefined)?.map ?? null;
    const own = (source as THREE.MeshStandardMaterial | null | undefined)?.envMapIntensity;
    const env = open ? (typeof own === 'number' && Number.isFinite(own) ? own : 1) : 0.35;
    const key = `${map ? map.uuid : 'none'}${open ? `|open ${env}` : ''}`;
    let m = roomMaterials.get(key);
    if (!m) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: map ?? ROOM_WHITE, roughness: 1, metalness: 0,
        vertexColors: true, envMapIntensity: env, emissive: open ? new THREE.Color(0, 0, 0) : new THREE.Color(0.012, 0.0105, 0.009) });
      mat.name = 'fx-structure-room';
      mat.userData.roomSource = source ?? null;
      if (open) mat.userData.openToSky = true;
      mat.onBeforeCompile = (shader) => { bindMaterialEnvIntensity(shader as unknown as { uniforms: Record<string, THREE.IUniform> }, mat); };
      mask.patch(mat);
      roomMaterials.set(key, mat);
      m = mat;
    }
    return m;
  }
  /** A room's material open to the sky (roomMaterialFor open: its source, the building's own); any other as it is. */
  function openRoomMaterial(material: THREE.Material): THREE.Material {
    if (material.name !== 'fx-structure-room' || material.userData.openToSky === true) return material;
    return roomMaterialFor(material.userData.roomSource as THREE.Material | null, true);
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

  /**
   * How many of the next stage's larger pieces fall as bodies of the engine (rubbleBodies.ts; 2026-10-12, the owner: one
   * physics engine for everything that falls): set by the caller just before `run`, consumed by it. A strike's by its
   * charge (a rifle round's spall stays grit; a howitzer's hole throws blocks), a falling panel and a collapse the most.
   */
  let bodiesNext = 0;
  const STRIKE_BODIES_MAX = 8;
  /** A strike hole's bodies by the burst's charge (kg): a pierce two, a tank HE round three to five, a howitzer eight. */
  const strikeBodies = (kind: 'blast' | 'pierce', chargeKg: number): number => kind === 'pierce' ? 2
    : Math.max(2, Math.min(STRIKE_BODIES_MAX, Math.round(2 + 1.6 * Math.sqrt(Math.max(0, chargeKg)))));
  /** A live run's named-piece hides, held to its wreck's birth (227, lane B co-hold: a piece laid after the run's delay stood till it shows). */
  const heldHides: { seam: StructureDamageSeam; hides: DamageStageResult['hides']; at: number }[] = [];

  /**
   * (destruction-slabs 227 round 5; the round-4 critic's films: polders #46's tower mill lost its upper shaft, cap and sails
   * in one 100 ms step, a stump with chunks already on the ground in their place; verdant #17's post mill swapped its body's
   * silhouette and lost its sails the same way) the E12 kit lays a set piece's pieces at rest at once: each laid by one
   * rigid turn (DamageFall) is shown falling there — a copy of its own triangles turned and dropped over gravity's time,
   * its turn eased in as a fall's is — and the stage's laid copy shows when the fall ends, where the fall ends.
   */
  interface PieceFall { seam: StructureDamageSeam; meshes: THREE.Mesh[]; axis: THREE.Vector3; angle: number; pivot: THREE.Vector3; t: THREE.Vector3;
    t0: number; T: number }
  const pieceFalls: PieceFall[] = [];
  const _fq = new THREE.Quaternion(), _fm = new THREE.Matrix4(), _fb = new THREE.Matrix4(), _fbi = new THREE.Matrix4(), _fv = new THREE.Vector3();
  const _fr = new THREE.Matrix4(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(1, 1, 1), _fup = new THREE.Vector3(0, 1, 0);
  /** A body-frame fall's pose `k` of the way (0..1) as a world matrix into _fm (the meshes' vertices are in the world). */
  function fallMatrix(f: PieceFall, k: number): THREE.Matrix4 {
    const { x, y, z, yaw } = f.seam.anatomy.placement;
    _fb.compose(_fp.set(x, y, z), _fq.setFromAxisAngle(_fup, yaw), _fs);
    _fbi.copy(_fb).invert();
    _fq.setFromAxisAngle(f.axis, f.angle * k);
    _fr.makeRotationFromQuaternion(_fq);
    // body frame: v -> R_k (v - pivot) + pivot + t k
    _fv.copy(f.pivot).applyQuaternion(_fq).negate().add(f.pivot).addScaledVector(f.t, k);
    _fr.setPosition(_fv);
    return _fm.copy(_fb).multiply(_fr).multiply(_fbi);
  }
  function startPieceFalls(seam: StructureDamageSeam, falls: readonly DamageFall[], made: readonly THREE.Mesh[]): void {
    let until = 0;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const fall of falls) {
      const spans = seam.spans.filter((sp) => sp.piece === fall.piece && sp.count >= 3 && !flattenedSpans.has(sp));
      if (!spans.length) continue;
      // its own triangles as they stand (world), per material; its middle (body frame) for its drop
      const byMat = new Map<THREE.Material, { geometry: THREE.BufferGeometry; names: string[]; data: number[][] }>();
      let mx = 0, my = 0, mz = 0, n = 0;
      for (const span of spans) {
        const mesh = span.mesh as THREE.Mesh;
        const geometry = mesh.geometry as THREE.BufferGeometry;
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
        let e = byMat.get(material);
        if (!e) {
          const names = Object.keys(geometry.attributes).filter((nm) => nm !== 'position' && nm !== 'aDamage');
          e = { geometry, names, data: [[], ...names.map(() => [])] };
          byMat.set(material, e);
        }
        spanMatrices(span);
        const arr = span.position.array as Float32Array;
        const start = span.first + ((3 - (span.first % 3)) % 3);
        const end = start + Math.floor((span.first + span.count - start) / 3) * 3;
        for (let i = start; i < end; i++) {
          _fv.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(_m);
          e.data[0]!.push(_fv.x, _fv.y, _fv.z);
          const wx = _fv.x - px, wz = _fv.z - pz;
          mx += wx * c - wz * sn; my += _fv.y - py; mz += wx * sn + wz * c; n++;
          e.names.forEach((nm, j) => {
            const attr = e!.geometry.getAttribute(nm) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
            for (let q = 0; q < attr.itemSize; q++) e!.data[j + 1]!.push(attr.getComponent(i, q));
          });
        }
      }
      if (!n) continue;
      mx /= n; my /= n; mz /= n;
      const meshes: THREE.Mesh[] = [];
      for (const [material, e] of byMat) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(e.data[0]!, 3));
        e.names.forEach((nm, j) => {
          const attr = e.geometry.getAttribute(nm) as THREE.BufferAttribute;
          g.setAttribute(nm, new THREE.Float32BufferAttribute(e.data[j + 1]!, attr.itemSize, attr.normalized));
        });
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `fx-landmark-piece-fall-${seam.structureIdx}-${fall.piece}`;
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        debris.group.add(mesh);
        meshes.push(mesh);
      }
      // the turn as an axis and an angle; its middle's drop sets the fall's time
      _fr.set(fall.r[0]!, fall.r[1]!, fall.r[2]!, 0, fall.r[3]!, fall.r[4]!, fall.r[5]!, 0, fall.r[6]!, fall.r[7]!, fall.r[8]!, 0, 0, 0, 0, 1);
      _fq.setFromRotationMatrix(_fr).normalize();
      const angle = 2 * Math.acos(Math.min(1, Math.abs(_fq.w)));
      const sw = _fq.w < 0 ? -1 : 1, sl = Math.sqrt(Math.max(0, 1 - _fq.w * _fq.w));
      const axis = sl > 1e-6 ? new THREE.Vector3(sw * _fq.x / sl, sw * _fq.y / sl, sw * _fq.z / sl) : new THREE.Vector3(0, 1, 0);
      const pivot = new THREE.Vector3(fall.pivot[0], fall.pivot[1], fall.pivot[2]), t = new THREE.Vector3(fall.t[0], fall.t[1], fall.t[2]);
      _fv.set(mx, my, mz).sub(pivot).applyMatrix4(_fr).add(pivot).add(t);
      const drop = Math.max(0.3, my - _fv.y);
      const T = Math.min(FALL_MAX_S, Math.max(FALL_MIN_S, Math.sqrt(2 * drop / 9.81) * FALL_SLOW));
      const f: PieceFall = { seam, meshes, axis, angle, pivot, t, t0: o.now(), T };
      fallMatrix(f, 0);
      for (const m of meshes) { m.matrix.copy(_fm); m.matrixWorldNeedsUpdate = true; }
      pieceFalls.push(f);
      until = Math.max(until, f.t0 + T);
    }
    if (until > 0) for (const m of made) debris.showFrom(m, until);
  }
  function stepPieceFalls(): void {
    if (!pieceFalls.length) return;
    const now = o.now();
    let k = 0;
    for (const f of pieceFalls) {
      // (gone the moment the laid copy shows: the debris reads the same sum)
      if (now >= f.t0 + f.T) { for (const m of f.meshes) { m.removeFromParent(); m.geometry.dispose(); } f.seam.touchShadows(); continue; }
      const u = Math.min(1, Math.max(0, (now - f.t0) / f.T));
      // (a fall gathers speed: its turn and its drop eased in)
      fallMatrix(f, u * u);
      for (const m of f.meshes) { m.matrix.copy(_fm); m.matrixWorldNeedsUpdate = true; }
      f.seam.touchShadows();
      pieceFalls[k++] = f;
    }
    pieceFalls.length = k;
  }
  /** A stage's builder through the writers. `standing`: its runs belong to the standing building (a breach's rim and
   *  room, a spall's units) and fall with it; a collapse's own stubs and pile stay where they lie. */
  function run(seam: StructureDamageSeam, delayS: number, settled: boolean, build: (out: DamageWriters) => DamageStageResult,
    standing = true, owner?: RunOwner, piecesOnly = false, noPieces = false, holeSeed?: number, holeKind?: 'blast' | 'pierce'): void {
    const byBucket = spanMaterials(seam);
    const resolve = (bucket: string, role?: DamageRole): THREE.Material => {
      const own = worldMaterial(byBucket, bucket);
      return role === 'room' ? roomMaterialFor(own) : own ?? fallbackFor(bucket);
    };
    const depths = standing ? depthMaterials(seam) : null;
    const bodies = bodiesNext;
    bodiesNext = 0;
    const out = debris.begin(seam.anatomy.placement, resolve, delayS, settled, standing
      ? { tag: STAGE_RUN_TAG + seam.structureIdx + 1, depthFor: (bucket) => depths?.get(bucket) ?? null, meshes: !piecesOnly,
        pieces: !noPieces, bodies, structure: seam.structureIdx }
      : { meshes: !piecesOnly, pieces: !noPieces, bodies, structure: seam.structureIdx });
    // (2026-10-12) a kit's dark box behind each hole stood beside the next hole's, so a wall with several holes showed
    // their edges and sides as flat panels: the storey's one interior (layInterior) is the room every hole on it opens
    // into. A kit that lays no room (a ruin, open to the sky) never asks, and gets none
    let wantsRoom = false;
    const mesh0 = out.mesh;
    const meshW = Object.create(mesh0) as DamageWriters['mesh'];
    // (destruction-slabs 227, Copper Mesa's ore bin: the regional kit's open storey behind a fallen section, its side and
    // opposite walls, boards and joists in the building's own buckets, stood between the bin's legs on the faces' box) a
    // kit's room of any bucket is the storey's one interior
    meshW.begin = (bucket: string, role: DamageRole): boolean => {
      if (role === 'room') { wantsRoom = true; return false; }
      return mesh0.begin(bucket, role);
    };
    const writers: DamageWriters = { mesh: meshW, pieces: out.pieces };
    let result: DamageStageResult | null = null;
    try { result = build(writers); } catch { result = null; }
    const made = debris.commit();
    // (round 5) a set piece's pieces the stage laid at rest are seen falling there first (a live stage laid at once)
    if (!settled && !(delayS > 0) && result?.falls?.length) startPieceFalls(seam, result.falls, made);
    // (destruction-slabs 227 round 4) no remnant stands taller than the building was drawn where it stands
    for (const mesh of made) if (mesh.name.startsWith('fx-structure-remnant-')) clampRemnantTops(mesh, seam.anatomy);
    if (owner) for (const mesh of made) mesh.userData.runOwner = owner;
    const held = !settled && delayS > 0 && result?.hides?.some((h) => h.piece) ? result.hides.filter((h) => h.piece) : null;
    if (held) heldHides.push({ seam, hides: held, at: o.now() + delayS });
    apply(seam, held ? { ...result!, hides: result!.hides.filter((h) => !h.piece) } : result, holeSeed, holeKind, made);
    if (wantsRoom && standing && !piecesOnly) {
      const storey = owner && owner.storey >= 0 ? owner.storey : 0;
      const hint = roomHint(seam, storey, owner?.section ?? -1, result);
      layInterior(seam, storey, settled, hint[0], hint[1]);
    }
  }

  /**
   * Where the room behind a stage's opening is (body frame, a plan point inside the drawn wall): a hole's cut pushed in
   * past the wall's depth; a fallen panel's middle behind its drawn wall (its setback); else the body's middle.
   */
  function roomHint(seam: StructureDamageSeam, storey: number, section: number, result: DamageStageResult | null): [number, number] {
    const cuts = result?.cuts ?? [];
    for (let i = cuts.length - 1; i >= 0; i--) {
      const cut = cuts[i];
      if (!(cut.depthM >= 0.2)) continue;
      return [cut.x - cut.nx * (cut.depthM + 0.4), cut.z - cut.nz * (cut.depthM + 0.4)];
    }
    const st = seam.anatomy.storeys[storey];
    const fi = st ? st.faces.findIndex((f) => f.section === section) : -1;
    if (st && fi >= 0) {
      const face = st.faces[fi];
      let back = faceSetback(seam.anatomy, storey, fi, 0);
      if (!Number.isFinite(back)) back = faceSetbackMedian(seam.anatomy, storey, fi).median;
      if (!Number.isFinite(back)) back = 0;
      const t = face.layers.reduce((sum, l) => sum + l.thicknessM, 0) || 0.3;
      return [face.origin[0] - face.out[0] * (back + t + 0.5), face.origin[2] - face.out[2] * (back + t + 0.5)];
    }
    return anatomyCentre(seam.anatomy);
  }

  /** The rooms laid, per structure: one per storey and enclosed component (structureEnclosure storeyInterior). */
  const interiors = new Map<number, Set<string>>();
  /** A storey's room claimed (its interior's key): false when one is laid there already, the kit's or the fracture's. */
  function claimRoom(seam: StructureDamageSeam, key: string): boolean {
    let laid = interiors.get(seam.structureIdx);
    if (!laid) { laid = new Set(); interiors.set(seam.structureIdx, laid); }
    if (laid.has(key)) return false;
    laid.add(key);
    return true;
  }
  /** The bucket's tile density (repeats a metre) the kits' fallback surface uses (regional fracture.ts fallbackSurface). */
  const tileDensity = (bucket: string): number => bucket.includes('Stone') || bucket === 'stone' ? 0.5
    : /laster/i.test(bucket) ? 0.42 : 0.55;
  /**
   * A storey's room, laid once at the first hole into it (2026-10-12, the owner: broken faces show the building's own
   * material with proper inner faces): the inside of its walls, its floor and its ceiling facing in, just behind the
   * walls, in the building's own buckets (the walls' render or masonry, the floor's boards or stone, the ceiling's
   * joists), dimly lit. A standing run: holes look into it (no cut takes it), it falls, folds and drops with its storey.
   * (destruction-slabs 227, the owner's Verdant church: "these weird ugly boxes/surfaces still randomly come up") it is
   * the drawn enclosure behind the hole (structureEnclosure.ts storeyInterior: the enclosed component behind `hint`, under
   * what covers it, its ceiling at the band's drawn wall top), never the box the storey's faces span: a church's forecourt
   * and towers, a station's canopy, a windmill's sails stood inside that box. No room where the band encloses under half
   * its box (a frame, a trestle, a pipe run, a tank farm) or where the room would be under 2 m².
   */
  function layInterior(seam: StructureDamageSeam, storeyIndex: number, settled: boolean, hintX: number, hintZ: number): void {
    const a = seam.anatomy;
    const storey = a.storeys[storeyIndex];
    if (!storey || !storey.faces.length) return;
    const above = a.storeys[storeyIndex + 1];
    // under the eaves: the mask lets what stands over them ride the roof down (the battle strips: the old room boxes reached
    // the eaves, rode the falling roof and stood over the heap as slate panels until the fold)
    const eaveCap = a.roof ? a.roof.eaveY - 0.15 : Infinity;
    const room = storeyInterior(a, storeyIndex, hintX, hintZ, Math.min(eaveCap, (above ? above.y0 : storey.y1) - 0.06));
    if (!room) return;
    if (!claimRoom(seam, room.key)) return;
    const { y0, y1 } = room;
    // its materials: the walls' render or infill where they have one (an interior is plastered), else their masonry
    const face = storey.faces[0]!;
    const wallSlot = face.layers.find((l) => l.material === 'plaster' || l.material === 'infill')
      ?? face.layers[face.layers.length - 1] ?? face.layers[0];
    if (!wallSlot) return;
    const coreSlot = face.layers[face.layers.length - 1] ?? wallSlot;
    const floorSlot = storey.floor?.structure ?? coreSlot;
    const ceilSlot = above?.floor?.structure ?? a.roof?.structure ?? floorSlot;
    // (destruction-slabs 227 round 4, the visual and the engineering critics' tavern #7: a hole on the top storey after the
    // roof fell laid a room whose ceiling stood as a flat dark plane at the wall heads, the roofless tavern read as a box with
    // a lid) no ceiling under a roof that has fallen — (round 5) and open to the sky it is lit as the sky lights it
    const open = !above && roofDown(seam);
    const byBucket = spanMaterials(seam);
    // (233) open to the sky, in the building's own material (roomMaterialFor)
    const resolve = (bucket: string): THREE.Material => roomMaterialFor(worldMaterial(byBucket, bucket), open);
    const out = debris.begin(a.placement, resolve, 0, settled, { tag: STAGE_RUN_TAG + seam.structureIdx + 1, pieces: false, structure: seam.structureIdx });
    const m = out.mesh;
    // a quad facing `n` (body frame; wound to face it), its tile laid by the bucket's density on the plane it faces
    const quad = (bucket: string, tint: readonly number[], shade: number, n: readonly [number, number, number],
      corners: ReadonlyArray<readonly [number, number, number]>): void => {
      if (!m.begin(bucket, 'room')) return;
      const d = tileDensity(bucket);
      const ids = corners.map(([x, y, z]) => {
        const u = n[1] !== 0 ? x * d : Math.abs(n[0]) > 0.5 ? z * d : x * d;
        const v = n[1] !== 0 ? z * d : y * d;
        return m.vertex(x, y, z, n[0], n[1], n[2], u, v, tint[0]! * shade, tint[1]! * shade, tint[2]! * shade);
      });
      const [p0, p1, p2] = corners;
      const ex = p1![0] - p0![0], ey = p1![1] - p0![1], ez = p1![2] - p0![2], fx = p2![0] - p0![0], fy = p2![1] - p0![1], fz = p2![2] - p0![2];
      const facing = (ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2] >= 0;
      if (facing) { m.triangle(ids[0]!, ids[1]!, ids[2]!); m.triangle(ids[0]!, ids[2]!, ids[3]!); }
      else { m.triangle(ids[0]!, ids[2]!, ids[1]!); m.triangle(ids[0]!, ids[3]!, ids[2]!); }
      m.end();
    };
    const wt = wallSlot.tint, wb = wallSlot.bucket;
    // its walls, facing in along the room's drawn boundary
    for (const [ax, az, bx, bz, nx, nz] of room.walls) {
      // (round 3: the owner's "dark grey-navy slabs" — a room's walls at 0.4 of the render read as one flat dark plane through
      // a blown-out facade) in shade, its texture readable
      quad(wb, wt, open ? OPEN_ROOM_WALL : Math.abs(nx) > 0.5 ? 0.56 : 0.6, [nx!, 0, nz!], [[ax!, y0, az!], [bx!, y0, bz!], [bx!, y1, bz!], [ax!, y1, az!]]);
    }
    // its floor (up) and its ceiling (down), rectangle by rectangle; (round 5) the floor a hand over the floor line (the
    // storey under it draws its top there: the two fought, a dark and a pale floor flickering through each other)
    const fy = y0 + ROOM_FLOOR_LIFT_M;
    for (const [x0, z0, x1, z1] of room.rects) {
      quad(floorSlot.bucket, floorSlot.tint, open ? OPEN_ROOM_FLOOR : 0.55, [0, 1, 0], [[x0!, fy, z1!], [x1!, fy, z1!], [x1!, fy, z0!], [x0!, fy, z0!]]);
      if (!open) quad(ceilSlot.bucket, ceilSlot.tint, 0.4, [0, -1, 0], [[x0!, y1, z0!], [x1!, y1, z0!], [x1!, y1, z1!], [x0!, y1, z1!]]);
    }
    const made = debris.commit();
    for (const mesh of made) {
      mesh.userData.runOwner = { section: -1, storey: storeyIndex } satisfies RunOwner;
      mesh.userData.room = true;
      // (round 5) laid open to the sky, lit so (openTopRooms leaves it as it is)
      if (open) mesh.userData.openToSky = true;
      // inside the walls its shadow is the building's own; drawn through the default depth program it would stand as a
      // box's shadow once the building folded away
      mesh.castShadow = false;
    }
  }

  /**
   * A new hole takes the earlier runs it opens through with it (2026-10-12, the owner's Steinburg strips: a hole's rim of
   * the wall's own units is a run no hole cuts, so a later hole beside it left those units hanging in the opening as
   * strips of brick): every triangle of the structure's standing runs (not the ones this stage just laid) whose centre
   * stands inside the new cut — within its depth through the wall, inside the inner edge of its ragged outline — is
   * folded to a point, as the mask discards the wall there. A room behind a hole stands beyond the cut's depth and stays.
   */
  function trimRuns(seam: StructureDamageSeam, x: number, y: number, z: number, radiusM: number, nx: number, nz: number,
    depthM: number, outsideM: number, phase: number | null, keep: readonly THREE.Mesh[]): boolean {
    let trimmed = false;
    for (const mesh of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
      // the room the holes look into is never in a cut (it stands behind the wall's thickness)
      if (keep.includes(mesh) || mesh.name.startsWith('fx-structure-room-')) continue;
      const geo = mesh.geometry;
      const index = geo.getIndex();
      const pos = geo.getAttribute('position');
      if (!index || !pos) continue;
      const idx = index.array as Uint16Array | Uint32Array;
      let touched = false;
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
        if (a === b && b === c) continue;
        const dx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 - x;
        const dy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 - y;
        const dz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3 - z;
        const along = dx * nx + dz * nz;
        if (along > outsideM || along < -depthM) continue;
        const lx = dx - nx * along, lz = dz - nz * along;
        const rl = Math.hypot(lx, dy, lz);
        // the outline's inner edge (the mask's blocky cells reach in to 0.85 of it)
        let lobe = 0.48;
        if (phase !== null) {
          const th = Math.atan2(dy, lx * nz - lz * nx);
          lobe = 0.8 + 0.2 * Math.sin(3 * th + phase) + 0.12 * Math.sin(5 * th + 2 * phase);
        }
        if (rl >= radiusM * 0.85 * lobe) continue;
        idx[t + 1] = a; idx[t + 2] = a;
        touched = true;
      }
      if (touched) { index.needsUpdate = true; trimmed = true; }
    }
    return trimmed;
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
      bodiesNext = 1;
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
    fracture?.storeyDown(seam, storey.index);
    let changed = clampStorey(seam, storey);
    const [reachX, reachZ, rcx, rcz] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    // (destruction-slabs 227 round 3) the faces the fracture draws over it come down with the world's spans
    fracture?.lowerOver(seam, storey.index, dropM, true);
    changed = dropRuns(seam, (bx, by, bz) => by > storey.y0 + 0.02 && by <= storey.y1 + SLAB_EPS && Math.abs(bx - rcx) <= reachX
      && Math.abs(bz - rcz) <= reachZ, (owner) => owner.storey === storey.index) || changed;
    changed = settleRuns(seam, storey, reachX, reachZ, rcx, rcz) || changed;
    if (holes) {
      mask.moveHoles(seam.structureIdx, a.placement.y + storey.y0 + 0.02, a.placement.y + storey.y1 + SLAB_EPS, dropM);
      o.scars?.clearWhere(structureId, (_x, y) => y > a.placement.y + storey.y0 + 0.02);
    }
    const storeyDown = (seam as StructureDamageSeam & { storeyDown?(storey: number, seed: number, out: DamageWriters): DamageStageResult })
      .storeyDown;
    if (typeof storeyDown === 'function') {
      bodiesNext = 10;
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
    px: number; py: number; pz: number; c: number; s: number; reachX: number; reachZ: number; rcx: number; rcz: number;
    spans: FallSpan[]; runs: FallRun[];
  }
  const G = 9.81;
  const storeyFalls: StoreyFall[] = [];
  /** The clamp's law at depth d (body frame): over the footprint, the band toward its floor line, above it down by d. */
  function fallTo(f: StoreyFall, bx: number, by: number, bz: number, d: number): number {
    if (Math.abs(bx - f.rcx) > f.reachX || Math.abs(bz - f.rcz) > f.reachZ || !(by > f.storey.y0 + 0.02)) return by;
    return by <= f.storey.y1 + SLAB_EPS ? Math.max(f.storey.y0, by - d) : by - d;
  }
  function startStoreyFall(structureId: number, seam: StructureDamageSeam, storey: DamageStorey, settled: boolean): void {
    const a = seam.anatomy;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const [reachX, reachZ, rcx, rcz] = storeyReach(seam, storey);
    const dropM = storey.y1 - storey.y0;
    const f: StoreyFall = { structureId, seam, storey, settled, t0: o.now(), T: Math.sqrt(2 * Math.max(0.1, dropM) / G), dropM, d: 0,
      px, py, pz, c, s, reachX, reachZ, rcx, rcz, spans: [], runs: [] };
    // the band's holes are crushed with it at once, and the phone's scars above the floor line go; the fracture's rooms
    // in it and over it with them
    fracture?.storeyDown(seam, storey.index);
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
    fracture?.lowerOver(f.seam, f.storey.index, d, false);
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

  const fracture = o.fracture?.({ o, keep, dropRuns, clampPanel, finishFalls, run, worldMaterial, spanMaterials, roomMaterialFor, openRoomMaterial,
    originalOf: (span) => originals.get(span) ?? null, roofDropped, claimRoom,
    falling: (structureIdx) => storeyFalls.some((f) => f.structureId === structureIdx) }) ?? null;
  return {
    stage(e, seam) {
      finishFalls(e.structureId);
      if ((e as StructureStageEvent & { sections?: boolean }).sections === true) sectionsSeen.add(e.structureId);
      const took = fracture?.stage(e, seam) ?? 0;
      if (took === 1) { downed.add(e.structureId); return; }
      if (took === 2) notePunched(e.structureId, e.x, e.y, e.z);
      const settled = e.settled === true;
      if (e.stage === 'collapsed' && settled && seam) {
        // (destruction-slabs 227) settled, the building is gone at once: its standing runs with it (the fracture's ready()
        // drops them so live; the mask folds them away, but a run left in the scene stands for any reader of it)
        for (const r of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) debris.dropRun(r);
      }
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
      // (destruction-slabs 227 round 3) what a stage's hides left hanging comes down once the faces are drawn
      if (e.stage !== 'collapsed') fracture?.hanging(seam, settled);
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
          bodiesNext = 8;
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
        const [rcx, rcz] = anatomyCentre(a);
        const bx = wx * c - wz * sn - rcx, bz = wx * sn + wz * c - rcz, bdx = dx * c - dz * sn, bdz = dx * sn + dz * c;
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
          bodiesNext = 6;
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
          bodiesNext = 12;
          run(seam, topple.landS, settled, (out) => {
            (out as DamageWriters & { fallAxis?: [number, number] }).fallAxis = axis;
            return seam.collapse(stageSeed(3), out);
          }, false);
        } else {
          // (dcore 2026-10-09, waves 294a/b: "flat carpets spread metres across the street") the walls' pieces topple
          // off them and land at their foot: the kit's throw at 0.55 of its speed, never up
          const eaveY = seam.anatomy.roof ? seam.anatomy.roof.eaveY : Infinity;
          bodiesNext = 14;
          run(seam, 0.7, settled, (out) => seam.collapse(stageSeed(3), dampPieces(out, 0.55, eaveY)), false);
          if (!settled) crumble(seam, e);
        }
      }
    },
    warm(at, buckets) {
      const list = [...buckets].filter((bucket) => !!o.materialFor?.(bucket));
      const resolve = (bucket: string, role?: DamageRole): THREE.Material => role === 'room' ? roomMaterialFor(o.materialFor?.(bucket))
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
      // (a still piece on a standing building is laid in its run now: the warm's piece falls, so it draws the pool's program)
      out.pieces.push(list[0] ?? 'stone', 'chunk', 0, 0, 0.5, 0, 0, 0, 0, 1, 0.2, 0.2, 0.2, 0.5, 0.5, 0.5, 0, -0.5, 0);
      const made = debris.commit();
      for (const mesh of made) mesh.frustumCulled = false;
      return made.length;
    },
    strike(structureId, seam, x, y, z, dirX, dirZ, munition, chargeKg, caliberMm = 0) {
      // punched a moment later, under the burst's flash: the same step's stage and breach events land first (with
      // sections on the sim's own hole is the hole; a collapse takes the building down instead)
      // (the phone tier draws scars, not cuts, and its event-time budget is small: a strike there stays the wall's burst)
      if (!seam || o.scars || !(strikeHoleRadius(munition, chargeKg) > 0 || pierceHoleRadius(munition, caliberMm) > 0)) return;
      pendingStrikes.push({ structureId, seam, x, y, z, dirX, dirZ, munition, chargeKg, caliberMm, at: o.now() });
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
        // (destruction-slabs 227) a late joiner's settled hole breaks the wall as the live one did (cut and drawn at once):
        // the kit's rim and room are for the walls the fracture does not draw (a landmark's, a declined strike's)
        if (fracture?.hole(e, seam, settled)) return;
        const spec = seam.holeAt(e.x, e.y, e.z, e.radiusM, 0, 0, e.munition, cause, e.hole);
        if (spec) {
          bodiesNext = 5;
          run(seam, 0, settled, (out) => seam.breach(spec, out), true, { section: spec.section, storey: spec.storey }, false, false, spec.seed);
          // (round 4; the census's hostomel warehouse: an earlier rim's pieces a later kit hole cut round stood in the air)
          // what a kit hole left hanging comes down too
          fracture?.hanging(seam, settled);
        }
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
          const [rcx, rcz] = anatomyCentre(a);
          changed = dropRuns(seam, (bx, by, bz) => by >= roof.eaveY - 0.25 && Math.abs(bx - rcx) <= reachX && Math.abs(bz - rcz) <= reachZ,
            (owner) => owner.section === roof.section) || changed;
          o.scars?.clearWhere(e.structureId, (_x, y) => y >= a.placement.y + roof.eaveY - 0.25);
          bodiesNext = 8;
          const slabs = !settled && !!fracture?.fallRoof(e, seam);
          // (destruction-slabs 227) settled (a late joiner): the roof hidden and the kit's roof rubble laid, no eave band or
          // patch over walls the live fall took down as bodies
          run(seam, 0, settled, (out) => seam.sectionDown(roof.section, damageSeed(a.seed, roof.section, 255), settled ? rubbleOnly(out) : out), true,
            { section: roof.section, storey: -1 }, slabs, slabs);
          // (round 5) the top storey's rooms open to the sky with the roof (their ceilings went only with a later wall's fall)
          changed = openTopRooms(seam) || changed;
        }
      } else {
        const spec = seam.holeAt(e.x, e.y, e.z, 0.01, 0, 0, e.munition, cause, 255);
        const storey = spec ? a.storeys[spec.storey] : null;
        const face = storey ? storey.faces.find((f) => f.name === spec!.face) ?? null : null;
        if (spec && storey && face && fallOnce(e.structureId, spec.section)) {
          // the panel above its stub (a metre over the base; an upper storey's falls to its floor line)
          const y0 = e.y0 - a.placement.y, y1 = e.y1 - a.placement.y;
          const stubTop = Math.max(y0, baseY + 1 - a.placement.y, storey.y0), top = Math.max(y1, storey.y1);
          const cells = !!fracture?.fallPanel(e, seam, storey, face, stubTop, top, settled);
          if (!cells) changed = clampPanel(seam, face, stubTop, top) || changed;
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
          bodiesNext = cells ? 0 : 12;
          if (!cells) run(seam, 0, settled, (out) => seam.sectionDown(spec.section, damageSeed(a.seed, spec.section, 255), out), true,
            { section: spec.section, storey: storey.index }, ev.storeyDown === true);
        }
        // (destruction-slabs 227) every wall of the storey down: its room stands in the open (a dark box in the ruin, its
        // ceiling a plate over nothing) — it goes
        if (storey && storey.faces.every((f) => fallenSections.get(e.structureId)?.has(f.section))) {
          fracture?.storeyDown(seam, storey.index, true);
          for (const r of debris.standingRuns(STAGE_RUN_TAG + seam.structureIdx + 1)) {
            if (r.userData.room === true && (r.userData.runOwner as RunOwner | undefined)?.storey === storey.index) { debris.dropRun(r); changed = true; }
          }
        }
        // (destruction-slabs 227 round 3) a wall gone under a roof that fell before it: what stood over the eaves on it (the
        // verge boards along a gable the roof left standing) is looked at again — held by nothing now, it goes
        if (roofDown(seam)) { const opened = openTopRooms(seam); changed = flattenRoofFurniture(seam) || opened || changed; }
        if (ev.storeyDown === true && storey) {
          // the band down to its floor line, what stood on it lowered by its height, its holes' runs and cuts gone, then
          // the kit's heap on the floor line (laid last: it stands); live, it comes down over gravity's time (the core
          // 2026-10-08: the cascade's next storey follows sqrt(2 h / g) after), settled at once
          if (settled) changed = dropStorey(e.structureId, seam, storey, settled, true) || changed;
          else startStoreyFall(e.structureId, seam, storey, settled);
        }
      }
      // (destruction-slabs 227 round 3) what the section's fall left hanging comes down once the faces are drawn
      fracture?.hanging(seam, settled);
      if (changed) seam.touchShadows();
    },
    update() {
      stepPieceFalls();
      if (heldHides.length) { let k = 0; for (const h of heldHides) if (o.now() >= h.at) apply(h.seam, { cuts: [], hides: h.hides }); else heldHides[k++] = h; heldHides.length = k; }
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
    falling: (structureIdx) => storeyFalls.some((f) => f.structureId === structureIdx),
    shiftTime(delta) {
      for (const p of pendingStrikes) p.at += delta;
      for (const h of heldHides) h.at += delta;
      for (const f of falling) f.until += delta;
      for (const f of storeyFalls) f.t0 += delta;
      for (const f of pieceFalls) f.t0 += delta;
    },
    reset() {
      storeyFalls.length = 0;
      for (const f of pieceFalls) for (const m of f.meshes) { m.removeFromParent(); m.geometry.dispose(); }
      pieceFalls.length = 0;
      for (const [span, saved] of originals) {
        const pos = span.position;
        (pos.array as Float32Array).set(saved, span.first * 3);
        pos.addUpdateRange(span.first * 3, saved.length);
        pos.needsUpdate = true;
      }
      originals.clear();
      realHoles.clear();
      punched.clear();
      interiors.clear();
      downed.clear();
      sectionsSeen.clear();
      pendingStrikes.length = 0;
      heldHides.length = 0;
      fallenSections.clear();
      roofOpened.clear();
      flattened.length = 0;
      flattenedSpans = new WeakSet();
      falling.length = 0;
      o.scars?.reset();
    },
    stats: () => ({ falling: falling.length, flattened: flattened.length, kept: originals.size, dropping: storeyFalls.length }),
  };
}
