/**
 * fractureStages.ts — a building's walls breaking where they are struck and its falls coming down as rigid bodies, driven
 * by the structure stages (destruction lane, 2026-10-15: the fracture package feat/fracture-r2 ported onto integ/226; the
 * owner: "make their collapses much more natural, not slow down the game so much", and "use the same kind of physics
 * engine [as the turret pops], natural, grounded physics with no snappiness").
 *
 * One presentation pool of the one engine (fx/debrisPhysics.ts over sim/rigidBody.ts) holds what a building throws:
 *  - its walls' cells (structureFracture.ts over wallFracture.ts): a round breaks a wall where it strikes — its cells
 *    knocked through, spalled, cracked — and what loses its load path falls as clusters of courses;
 *  - its collapse's pieces (collapseBodies.ts over collapsePieces.ts): the building cut into its own wall panels, floors,
 *    roof slabs and gables, laid ahead in the background and brought down as bodies.
 * The wall cells hold at most `poolShare` of the pool (a round's body past it takes the place of one lain still a while):
 * a collapse always finds room (wave 422's "roof on stilts" was a collapse waiting outside a full pool).
 *
 * Sections off (P1, the ruleset's switch): the rounds and the breach stage break the walls, the collapse brings the whole
 * building down as its pieces at once. Sections on (§3.4), the cascade drives it: a hole the sim opens breaks the wall
 * there, a fallen wall section comes down as its cells (the ground storey keeps its stub, a door its gap to the sill),
 * the roof's section as its slabs, a storey's floor catching what falls inside it until that storey drops; the final
 * collapse lays the kit's pile without throwing again. A settled event (a late joiner) lays the stages as before.
 *
 * Presentation only: the sim's stages, holes, heap and destroyed lists stay the authority; every peer throws the same
 * bodies from the same events (seeded by the structure and the round, spread over updates in fixed work units). The
 * structure stages call in through a host they hand over (StructureStagesOptions.fracture); the fx frame calls update.
 */
import * as THREE from 'three';
import type { MunitionClass, StructureBreachEvent, StructureStageEvent } from '../sim/destructionEvents.ts';
import type { RigidEnvironment } from '../sim/rigidBody.ts';
import {
  damageRng, damageSeed, type DamageFace, type DamageStageResult, type DamageStorey, type DamageWriters, type DebrisShape,
  type FractureMaterial, type FractureSlot,
} from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { createCollapseBodies, type CollapseBodies, type CollapseBodiesEvent } from './collapseBodies.ts';
import type { CollapsePiece } from './collapsePieces.ts';
import { createDebrisPhysics, type DebrisPhysics } from './debrisPhysics.ts';
import { createLandmarkBodies, type LandmarkBodies } from './landmarkBodies.ts';
import { createStructureFracture, type StructureFracture } from './structureFracture.ts';
import { createHangingSweep } from './structureHanging.ts';
import { breachBlowFor } from './structureFx.ts';
import { STAGE_RUN_TAG, type StructureMask } from './structureMask.ts';
import type { StructureDebris } from './structureDebris.ts';
import type { StructureScars } from './structureScars.ts';

/** What the structure stages hand the fracture (their own helpers, closed over their state). */
export interface FractureHost {
  o: { mask: StructureMask; debris: StructureDebris; now(): number; scars?: StructureScars | null };
  /** Keep a span's original positions before the first change (the stages' reset restores them). */
  keep(span: StructureSpan): void;
  /** A span's positions as kept before the stages' first change to it (null: never changed). */
  originalOf?(span: StructureSpan): Float32Array | null;
  /** Whether a structure's storey is coming down now (its fall in flight: what hangs is read once it lands). */
  falling?(structureIdx: number): boolean;
  /** Let go of a structure's standing runs inside a volume (body frame) or owned by a section. */
  dropRuns(seam: StructureDamageSeam, inside: (bx: number, by: number, bz: number) => boolean,
    owns: (owner: { section: number; storey: number }) => boolean): boolean;
  /** A wall panel's intact parts above its stub clamped down (what stands proud of a face: a canopy, a sill). */
  clampPanel(seam: StructureDamageSeam, face: DamageFace, stubTop: number, top: number): boolean;
  /** Land a structure's storey drops in flight (a new event on it lands on them). */
  finishFalls(structureId: number): void;
  /** A builder through the stage writers (the program's pieces land where their flight meets the ground). */
  run(seam: StructureDamageSeam, delayS: number, settled: boolean, build: (out: DamageWriters) => DamageStageResult,
    standing?: boolean, owner?: { section: number; storey: number }, piecesOnly?: boolean): void;
  /** A bucket's material as the world draws it (the structure's spans', the world's, an alias's), or null. */
  worldMaterial(byBucket: Map<string, THREE.Material>, bucket: string): THREE.Material | null;
  spanMaterials(seam: StructureDamageSeam): Map<string, THREE.Material>;
  /** The room behind a hole in a source material's texture (structureStages roomMaterialFor). */
  roomMaterialFor(source: THREE.Material | null | undefined): THREE.Material;
}

/** A round burst on a wall (structureStages' pending strike). */
interface FractureStrike {
  structureId: number; x: number; y: number; z: number; dirX: number; dirZ: number;
  munition: MunitionClass; chargeKg: number; caliberMm: number;
}

/** The fracture as the structure stages call it. */
export interface StageFracture {
  /** A round on a standing wall (P1): true when it broke the wall (no kit hole then). */
  strike(seam: StructureDamageSeam, p: FractureStrike): boolean;
  /** A stage event: 1 the collapse came down as bodies (the stages lay nothing more), 2 the breach broke the wall where
   *  it struck (the stages lay no kit hole), 0 neither. */
  stage(e: StructureStageEvent, seam: StructureDamageSeam | null): 0 | 1 | 2;
  /** Sections on: a hole the sim opened: true when it broke the wall there (no kit rim then); settled (a late joiner's
   *  log), its cells cut and drawn at once, nothing thrown. */
  hole(e: StructureBreachEvent, seam: StructureDamageSeam, settled?: boolean): boolean;
  /** Sections on: a wall section fell: true when its cells come down as bodies (no kit fall, no clamp now); settled, its
   *  cells gone at once, nothing thrown. */
  fallPanel(e: StructureBreachEvent, seam: StructureDamageSeam, storey: DamageStorey, face: DamageFace, stubTop: number,
    top: number, settled?: boolean): boolean;
  /** Sections on: the roof's section fell: true when its slabs come down as bodies (the kit lays its hides only). */
  fallRoof(e: StructureBreachEvent, seam: StructureDamageSeam): boolean;
  /** A storey dropped: the rooms behind its holes, and over it, go with it (`only`: its own alone — every wall of it fell). */
  storeyDown(seam: StructureDamageSeam, storey: number, only?: boolean): void;
  /** A storey's fall lowers the faces over it by `dropM`: for good (`baked`: its end, or a late joiner's at once), or as
   *  shown in flight (structureFracture lowerOver). */
  lowerOver(seam: StructureDamageSeam, storey: number, dropM: number, baked: boolean): void;
  /** A structure's damage changed what it draws: what it left hanging is read (structureHanging.ts) once its faces are
   *  drawn, and comes down (`settled`: a late joiner's, at rest at once). */
  hanging(seam: StructureDamageSeam, settled: boolean): void;
}

interface FractureStagesOptions {
  /** Where the bodies, the redrawn faces and the heaps are drawn (the fx group). */
  group: THREE.Group;
  /** The fx clock (s). */
  now(): number;
  /** What the bodies meet: the ground as drawn (its craters and heaps) and the world's records; null: they wait. */
  environment(): RigidEnvironment | null;
  /** The ground as drawn at a point (the rising heap's base, a refused piece's rest). */
  groundAt(x: number, z: number): number;
  /** A bucket's material anywhere in the world (the stages' materialFor). */
  materialFor(bucket: string): THREE.Material | null;
  /** A hard landing (its dust): world point, speed, mass, the building. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** A piece breaking apart where it struck (a shaft's drums, a roof's sheets): its grit and broken bits. */
  onShards?(x: number, y: number, z: number, vx: number, vy: number, vz: number, massKg: number, structureIdx: number): void;
  /** The vehicles drawn this frame (they shove the pieces). */
  hulls?(): Iterable<unknown> | null;
  /** Live bodies (default 96) and the wall cells' share of them (default 48). */
  capacity?: number;
  poolShare?: number;
}

export interface FractureStages {
  /** The structure stages' hook (StructureStagesOptions.fracture). */
  attach(host: FractureHost): StageFracture;
  /** Whether a structure came down as bodies (its dust is a collapse's of bodies: thinner, from the landings). */
  took(structureIdx: number): boolean;
  /** A breach event after the stages laid it (sections on: a storey's drop lets go of its floor). */
  breach(e: StructureBreachEvent): void;
  /**
   * The combat warm (the stages' warm beside it): one triangle in a bucket's material, unculled, casting through the
   * default depth program as the fracture's faces, bodies and heaps do, so the warm's render compiles what the first
   * broken wall would; the reset after it takes it away. The meshes laid.
   */
  warm(at: { x: number; y: number; z: number }, material: THREE.Material | null): number;
  /** Per render frame: the walls' drawing, the pool's steps, the pieces' poses, the cuts laid ahead. */
  update(): void;
  shiftTime(delta: number): void;
  reset(): void;
  stats(): { bodies: number; awake: number; fracture: number; collapses: number; prepared: number; skipped: number; landmark: number };
  readonly pool: DebrisPhysics;
}

/** A material's debris shape (structureStages' crumble law). */
function shapeOfMaterial(m: FractureMaterial): DebrisShape {
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
}

/** Refused cells a structure throws through the program path in an update (batched into one run). */
interface Refused { x: number; y: number; z: number; size: number; slot: FractureSlot; vx: number; vy: number; vz: number }

export function createFractureStages(o: FractureStagesOptions): FractureStages {
  // (2026-10-15: 96 bodies, the walls' cells half of them — r2's 128 and 64 on its box-manifold engine, which stepped a
  // body at about half integ/226's cost)
  const pool = createDebrisPhysics({ capacity: Math.max(16, o.capacity ?? 96) });
  let host: FractureHost | null = null;
  /** Structures whose match plays sections (their stage events say so). */
  const sectionsOn = new Set<number>();
  /** Buildings that may come down soon, whose cut is kept laid ahead (re-laid when it goes stale): a list, walked each
   *  update without an iterator. */
  const wantCut: Array<{ idx: number; seam: StructureDamageSeam; roofOnly: boolean }> = [];
  const want = (seam: StructureDamageSeam, roofOnly: boolean): void => {
    const w = wantCut.find((x) => x.idx === seam.structureIdx);
    if (w) { w.seam = seam; w.roofOnly = roofOnly; return; }
    // (collapseBodies keeps eight cuts laid: more wanted at once would lay and evict each other every update)
    if (wantCut.length >= 7) wantCut.shift();
    wantCut.push({ idx: seam.structureIdx, seam, roofOnly });
  };
  const unwant = (idx: number): void => { const i = wantCut.findIndex((x) => x.idx === idx); if (i >= 0) wantCut.splice(i, 1); };
  /** Each structure's seam as its events gave it. */
  const seams = new Map<number, StructureDamageSeam>();
  /** Each building's stage events seen (with its fracture's redraws, the version its cut is laid at). */
  const events = new Map<number, number>();
  /** Wall panels fallen (sections on) whose leftovers are clamped once their face is drawn as cells. */
  const clamps: Array<{ seam: StructureDamageSeam; storey: number; faceIndex: number; face: DamageFace; stubTop: number; top: number }> = [];
  const refused = new Map<StructureDamageSeam, Refused[]>();
  let last = o.now();
  /** The warm's own meshes (gone at the reset after its render). */
  const warmed: THREE.Mesh[] = [];
  /** Record boxes of a structure that no longer hold its pieces (a lift bridge's leaves over their gap): world x/z. */
  const passes = new Map<number, number[]>();
  let envBase: RigidEnvironment | null = null, envWrapped: RigidEnvironment | null = null;
  const environment = (): RigidEnvironment | null => {
    const b = o.environment();
    if (!b) return null;
    if (b !== envBase || !envWrapped) {
      envBase = b;
      const solid = b.isSolid;
      envWrapped = {
        groundAt: b.groundAt,
        ...(b.queryStatic ? { queryStatic: b.queryStatic } : {}),
        isSolid(record) {
          if (solid ? !solid(record) : (record.crushed || record.dead)) return false;
          const idx = record.structureIdx;
          if (idx === undefined || !passes.size) return true;
          const list = passes.get(idx);
          if (!list) return true;
          const cx = (record.min[0] + record.max[0]) / 2, cz = (record.min[2] + record.max[2]) / 2;
          for (let i = 0; i < list.length; i += 4) if (cx >= list[i] && cx <= list[i + 2] && cz >= list[i + 1] && cz <= list[i + 3]) return false;
          return true;
        },
      };
    }
    return envWrapped;
  };
  /** Landmarks never fracture their walls (their named pieces are E12's: landmarks/damage.ts), but for the pieces a
   *  builder gives the bodies (landmarkBodies.ts: the lift bridge). */
  const isLandmark = (seam: StructureDamageSeam): boolean => seam.anatomy.massClass === 'landmark';

  const resolverOf = (seam: StructureDamageSeam): ((bucket: string) => THREE.Material | null) => {
    const byBucket = host ? host.spanMaterials(seam) : new Map<string, THREE.Material>();
    return (bucket) => (host ? host.worldMaterial(byBucket, bucket) : null) ?? o.materialFor(bucket);
  };
  const tagOf = (idx: number): number => STAGE_RUN_TAG + idx + 1;
  const bump = (idx: number): void => { events.set(idx, (events.get(idx) ?? 0) + 1); };
  const versionOf = (idx: number): number => fracture.version(idx) * 4096 + (events.get(idx) ?? 0);

  const fracture: StructureFracture = createStructureFracture({
    pool, group: o.group, now: o.now, poolShare: o.poolShare ?? 48,
    keepSpan: (span) => host?.keep(span),
    holdBake: (structureIdx, y) => bodies.floorHolds(structureIdx, y),
    materialFor: (seam, bucket) => resolverOf(seam)(bucket),
    roomMaterial: (seam, bucket) => (host ? host.roomMaterialFor(resolverOf(seam)(bucket)) : null),
    onLanding: o.onLanding,
    onRefused(seam, x, y, z, sizeM, slot, vx, vy, vz) {
      let list = refused.get(seam);
      if (!list) { list = []; refused.set(seam, list); }
      if (list.length < 48) list.push({ x, y, z, size: sizeM, slot, vx, vy, vz });
    },
    onRedrawn(seam, storey, faceIndex) {
      dropFaceRuns(seam, storey, faceIndex);
      markHanging(seam, false);
      // a fallen panel's leftovers (what stood proud of its face) clamped now its face stands as cells
      for (let i = clamps.length - 1; i >= 0; i--) {
        const c = clamps[i];
        if (c.seam !== seam || c.storey !== storey || c.faceIndex !== faceIndex) continue;
        clamps.splice(i, 1);
        if (host?.clampPanel(seam, c.face, c.stubTop, c.top)) seam.touchShadows();
      }
    },
  });
  const landmarks: LandmarkBodies = createLandmarkBodies({
    pool, group: o.group, groundAt: o.groundAt, onLanding: o.onLanding,
    keepSpan: (span) => host?.keep(span),
    pass(structureIdx, minX, minZ, maxX, maxZ) {
      let list = passes.get(structureIdx);
      if (!list) { list = []; passes.set(structureIdx, list); }
      list.push(minX, minZ, maxX, maxZ);
    },
  });
  // (destruction-slabs 227 round 3) what a building's damage left hanging comes down: read once its faces are drawn and
  // no storey of it is falling, one building an update; a fallen building's spans are gone (the mask's, the fracture's)
  const hangingSweep = createHangingSweep({ originalOf: (span) => host?.originalOf?.(span) ?? null, groundAt: o.groundAt });
  const hangingDue = new Map<number, { seam: StructureDamageSeam; settled: boolean }>();
  const fallen = new Set<number>();
  function markHanging(seam: StructureDamageSeam, settled: boolean): void {
    if (fallen.has(seam.structureIdx)) return;
    const was = hangingDue.get(seam.structureIdx);
    hangingDue.set(seam.structureIdx, { seam, settled: settled && (was ? was.settled : true) });
  }
  function sweepHanging(): void {
    for (const [idx, due] of hangingDue) {
      if (fallen.has(idx)) { hangingDue.delete(idx); continue; }
      if (!fracture.idle(idx) || host?.falling?.(idx)) continue;
      hangingDue.delete(idx);
      const tag = tagOf(idx);
      const holders = [...fracture.standing(idx), ...(host ? host.o.debris.standingRuns(tag) : [])];
      const groups = hangingSweep.sweep(due.seam, holders);
      if (groups.length) { landmarks.drop(due.seam, groups, due.settled); bump(idx); }
      return;
    }
  }
  const bodies: CollapseBodies = createCollapseBodies({
    pool, group: o.group, materialFor: o.materialFor, groundAt: o.groundAt, environment,
    onLanding: o.onLanding, onShards: o.onShards, hulls: o.hulls,
    alsoLive: () => fracture.liveBodies() + landmarks.liveBodies() > 0,
  });
  bodies.onShatter(shatterPanel);

  /** The kit's runs on a face the fracture redrew (a damaged stage's patches, an earlier rim): they would hang over its
   *  holes. */
  function dropFaceRuns(seam: StructureDamageSeam, storey: number, faceIndex: number): void {
    const face = seam.anatomy.storeys[storey]?.faces[faceIndex];
    if (!face || !host) return;
    const t = Math.max(0.12, face.layers.reduce((sum, layer) => sum + (layer.thicknessM || 0), 0));
    const y0 = face.origin[1] - 0.1, y1 = face.origin[1] + face.height + 0.1;
    const onFace = (bx: number, by: number, bz: number): boolean => {
      if (by < y0 || by > y1) return false;
      const ox = bx - face.origin[0], oz = bz - face.origin[2];
      const along = ox * face.out[0] + oz * face.out[2];
      return along <= 0.4 && along >= -t - 0.4 && Math.abs(ox * face.u[0] + oz * face.u[2]) <= face.width / 2 + 0.2;
    };
    host.dropRuns(seam, onFace, (owner) => owner.section === face.section);
  }

  /**
   * A wall panel the collapse's failure reached (CollapsePiece.shatterS), or one the pool could not take: it bursts into
   * the kit's pieces over its own rectangle, in its face's layers' buckets and tints — the struck face's driven in along
   * the blow, the faces that gave under their load slumping out and down — through the program path.
   */
  function shatterPanel(seam: StructureDamageSeam, piece: CollapsePiece, e: CollapseBodiesEvent): void {
    const where = piece.face;
    const face = where ? seam.anatomy.storeys[where.storey]?.faces[where.face] : null;
    if (!where || !face || !face.layers.length || !host) return;
    const a = seam.anatomy;
    const c = Math.cos(a.placement.yaw), sn = Math.sin(a.placement.yaw);
    const dl = Math.hypot(e.dirX || 0, e.dirZ || 0) || 1;
    const bdx = ((e.dirX || 0) * c - (e.dirZ || 0) * sn) / dl, bdz = ((e.dirX || 0) * sn + (e.dirZ || 0) * c) / dl;
    const driven = piece.shatterS === 0;
    const speed = e.cause === 'ram' ? 2.4 : e.cause === 'kinetic' ? 1.8 : 3.6;
    const rng = damageRng(damageSeed(a.seed, 9, piece.index));
    const spacing = 0.8;
    const thick = where.thickness;
    // the wall's masonry most (a frame's timbers break short: no poles)
    const masonry = face.layers.filter((l) => l.material !== 'timber' && l.material !== 'plank');
    const slots = masonry.length ? masonry : face.layers;
    host.run(seam, 0, false, (out) => {
      const nu = Math.max(1, Math.round((where.u1 - where.u0) / spacing)), ny = Math.max(1, Math.round((where.y1 - where.y0) / spacing));
      for (let iy = 0; iy < ny; iy++) for (let iu = 0; iu < nu; iu++) {
        const u = where.u0 + (iu + rng()) * (where.u1 - where.u0) / nu;
        const fy = where.y0 + (iy + rng()) * (where.y1 - where.y0) / ny;
        if (face.openings.some((op) => Math.abs(u - op.u) < op.w / 2 && fy > op.y0 && fy < op.y0 + op.h)) continue;
        const slot: FractureSlot = slots.length > 1 && rng() < 0.4 ? slots[slots.length - 1]! : slots[0]!;
        const shape = shapeOfMaterial(slot.material);
        const flat = shape === 'plate' || shape === 'sheet' || shape === 'tile' || shape === 'slate';
        const size = (shape === 'beam' ? 0.7 : 0.55) * (0.7 + rng() * 0.6);
        const px = face.origin[0] + face.u[0] * u - face.out[0] * thick * 0.5;
        const py = face.origin[1] + fy;
        const pz = face.origin[2] + face.u[2] * u - face.out[2] * thick * 0.5;
        const yaw = Math.atan2(face.out[0], face.out[2]);
        const qa = (yaw + (rng() - 0.5) * 1.2) * 0.5, qt = (rng() - 0.5) * 0.8;
        const qy = Math.sin(qa), qw = Math.cos(qa), qx = Math.sin(qt) * 0.5, qz = Math.sin(qt) * 0.3;
        // driven in along the blow (a little up, spread); a wall that gave under its load slumps out and down
        const k = driven ? speed * (0.6 + 0.7 * rng()) : 0.4 + 0.8 * rng();
        const dx = driven ? bdx : face.out[0] * (rng() < 0.7 ? 1 : -1), dz = driven ? bdz : face.out[2] * (rng() < 0.7 ? 1 : -1);
        if (!out.pieces.push(slot.bucket, shape, Math.floor(rng() * 4), px, py, pz, qx, qy, qz, qw,
          size, size * (flat ? 0.14 : 0.62), Math.min(size * 0.8, Math.max(0.2, thick)), slot.tint[0], slot.tint[1], slot.tint[2],
          dx * k + (rng() - 0.5) * 0.8, driven ? 0.4 + rng() * 1.2 : -0.3 + rng() * 0.4, dz * k + (rng() - 0.5) * 0.8)) break;
      }
      return { cuts: [], hides: [] };
    }, false, undefined, true);
  }

  /** Refused cells through the program path: one run a structure an update (body frame pieces, the round's motion). */
  function flushRefused(): void {
    if (!refused.size || !host) return;
    for (const [seam, list] of refused) {
      const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const rng = damageRng(damageSeed(seam.anatomy.seed, 0x7e01, list.length));
      host.run(seam, 0, false, (out) => {
        for (const r of list) {
          const wx = r.x - px, wz = r.z - pz;
          const bx = wx * c - wz * s, bz = wx * s + wz * c;
          const vbx = r.vx * c - r.vz * s, vbz = r.vx * s + r.vz * c;
          const shape = shapeOfMaterial(r.slot.material);
          const flat = shape === 'plate' || shape === 'sheet' || shape === 'tile' || shape === 'slate';
          const qa = rng() * Math.PI;
          // never still: a piece thrown with next to no speed over the ground would lie in the run as a box
          out.pieces.push(r.slot.bucket, shape, Math.floor(rng() * 4), bx, r.y - py, bz, 0, Math.sin(qa), 0, Math.cos(qa),
            r.size, r.size * (flat ? 0.14 : 0.62), r.size * 0.7, r.slot.tint[0], r.slot.tint[1], r.slot.tint[2],
            vbx + (rng() - 0.5) * 0.6, r.vy - 0.3, vbz + (rng() - 0.5) * 0.6);
        }
        return { cuts: [], hides: [] };
      }, false, undefined, true);
    }
    refused.clear();
  }

  /** A building whose walls broke: its records leave its pieces' way (a body born inside its wall would be thrown out).
   *  (Its upper floors catch only its roof's slabs, from its fall on: a cell knocked in under a floor would lodge in it.) */
  function afterStrike(seam: StructureDamageSeam): void {
    bodies.markFalling(seam, false);
    bump(seam.structureIdx);
  }

  /** The building comes down as its pieces (sections off, live). */
  function collapseAsBodies(e: StructureStageEvent, seam: StructureDamageSeam): boolean {
    const h = host;
    if (!h) return false;
    const idx = seam.structureIdx;
    const tag = tagOf(idx);
    const standing = [...h.o.debris.standingRuns(tag), ...fracture.standing(idx)];
    // its pieces stand in its place: it goes from the mask, its rims with it (at once for a building whose cut was laid
    // ahead; a few updates on for one felled whole by one blow, standing in its dust until then); no kit heap under
    // them (the coordinator, 2026-10-11: "no preset rubble" — the heap is what fell)
    const ready = (): void => {
      h.finishFalls(e.structureId);
      const a = seam.anatomy;
      const fall = { eaveM: a.roof ? a.placement.y + a.roof.eaveY - e.baseY : 0, halfW: a.w / 2, halfD: a.d / 2, yaw: a.placement.yaw };
      h.o.mask.collapse(e.structureId, h.o.now(), Math.max(1, e.topY - e.baseY), e.dirX, e.dirZ, e.cx, e.baseY, e.cz, true, fall);
      for (const r of h.o.debris.standingRuns(tag)) h.o.debris.dropRun(r);
      fracture.release(idx);
      h.o.scars?.clearStructure(e.structureId);
      seam.touchShadows();
    };
    const event: CollapseBodiesEvent = { structureId: e.structureId, cause: e.cause, x: e.x, y: e.y, z: e.z, dirX: e.dirX, dirZ: e.dirZ };
    if (!bodies.collapse(seam, event, standing, resolverOf(seam), ready, versionOf(idx))) return false;
    unwant(idx);
    return true;
  }

  const attach = (h: FractureHost): StageFracture => {
    host = h;
    return {
      strike(seam, p) {
        seams.set(seam.structureIdx, seam);
        // (declined, the stages lay the kit's hole: a run the cut laid ahead must hold too)
        bump(seam.structureIdx);
        if (sectionsOn.has(seam.structureIdx) || isLandmark(seam)) return false;
        const faces = fracture.strike(seam, p.x, p.y, p.z, p.dirX, p.dirZ, p.munition, p.chargeKg, p.caliberMm);
        if (!faces) return false;
        afterStrike(seam);
        return true;
      },
      stage(e, seam) {
        if (!seam) return 0;
        const idx = seam.structureIdx;
        const sections = (e as StructureStageEvent & { sections?: boolean }).sections === true;
        const settled = e.settled === true;
        if (isLandmark(seam)) {
          if (landmarks.handles(seam.builder)) landmarks.stage(seam, e.stage, e.dirX, e.dirZ, settled);
          return 0;
        }
        seams.set(idx, seam);
        // (the stage lays its runs after this: a cut laid before them is stale; a collapse lays none before its own)
        if (e.stage !== 'collapsed') bump(idx);
        if (sections) { sectionsOn.add(idx); fracture.holdStoreys(idx, seam); }
        // a building that may come down soon: its cut laid ahead, a little an update (sections on: its roof's only)
        if (!settled && (e.stage === 'damaged' || e.stage === 'breached')) want(seam, sections);
        if (e.stage === 'collapsed') {
          fallen.add(idx);
          hangingDue.delete(idx);
          if (!settled && !sections && collapseAsBodies(e, seam)) return 1;
          // the mask's collapse (settled, sections on, a cut declined): the redrawn faces go with the building (its kit's
          // remnant stands), the bodies already thrown stay where they lie
          fracture.release(idx);
          unwant(idx);
          bodies.forget(idx);
          bodies.dropFloor(idx, 0);
          return 0;
        }
        // (the breach, sections off: a round that breaks the wall where it struck, sized as the stage's blow; settled — a
        // late joiner's log, destruction-slabs 227 — the same break cut and drawn at once, nothing thrown)
        if (e.stage === 'breached' && !sections) {
          const blow = breachBlowFor(e);
          const faces = fracture.strike(seam, blow.x, blow.y, blow.z, e.dirX, e.dirZ, e.munition ?? 'he', 1, 0,
            e.cause === 'ram' ? Math.max(blow.radiusM, 1.6) : blow.radiusM, settled);
          if (faces) { if (!settled) afterStrike(seam); else bump(idx); return 2; }
        }
        return 0;
      },
      hole(e, seam, settled = false) {
        const idx = seam.structureIdx;
        seams.set(idx, seam);
        if (isLandmark(seam)) return false;
        sectionsOn.add(idx);
        fracture.holdStoreys(idx, seam);
        bump(idx);
        if (e.sectionKind === 'roof' || !(e.radiusM > 0)) return false;
        const nl = Math.hypot(e.nx, e.nz);
        if (!(nl > 0.2)) return false;
        // the round's travel into the face (against its outward normal)
        const faces = fracture.strike(seam, e.x, e.y, e.z, -e.nx / nl, -e.nz / nl, e.munition ?? 'he', 1, 0, e.radiusM, settled);
        if (!faces) return false;
        if (!settled) afterStrike(seam);
        return true;
      },
      fallPanel(e, seam, storey, face, stubTop, top, settled = false) {
        const idx = seam.structureIdx;
        seams.set(idx, seam);
        if (isLandmark(seam)) return false;
        sectionsOn.add(idx);
        fracture.holdStoreys(idx, seam);
        bump(idx);
        const faceIndex = storey.faces.indexOf(face);
        if (faceIndex < 0) return false;
        if (!fracture.dropFace(seam, storey.index, faceIndex, stubTop - face.origin[1], 0, 0, settled)) return false;
        if (!settled) afterStrike(seam);
        // (the last face of a storey drops it: the stages' fall moves the band from where it stood, so the face is taken
        // out of the buckets first, or the fall would carry it down beside its own cells)
        if ((e as StructureBreachEvent & { storeyDown?: boolean }).storeyDown === true) fracture.flush(idx);
        // what stood proud of the face goes once its face stands as cells (a clamp before would squash what is drawn);
        // nothing queued (its cells were gone already): now
        if (fracture.idle(idx)) { if (host?.clampPanel(seam, face, stubTop, top)) seam.touchShadows(); }
        else clamps.push({ seam, storey: storey.index, faceIndex, face, stubTop, top });
        return true;
      },
      storeyDown(seam, storey, only = false) {
        fracture.dropRooms(seam.structureIdx, storey, only);
      },
      lowerOver(seam, storey, dropM, baked) {
        fracture.lowerOver(seam.structureIdx, storey, dropM, baked);
      },
      hanging(seam, settled) {
        if (isLandmark(seam) && !landmarks.handles(seam.builder)) { markHanging(seam, settled); return; }
        markHanging(seam, settled);
      },
      fallRoof(e, seam) {
        const idx = seam.structureIdx;
        seams.set(idx, seam);
        if (isLandmark(seam)) return false;
        sectionsOn.add(idx);
        bump(idx);
        bodies.markFalling(seam, true);
        const event: CollapseBodiesEvent = { structureId: e.structureId, cause: null, x: e.x, y: e.y, z: e.z, dirX: 0, dirZ: 0 };
        return bodies.fallRoof(seam, event, resolverOf(seam), versionOf(idx));
      },
    };
  };

  return {
    pool,
    attach,
    took: (structureIdx) => bodies.took(structureIdx),
    breach(e) {
      const ev = e as StructureBreachEvent & { storeyDown?: boolean };
      if (!ev.storeyDown || ev.settled || !host) return;
      // the storey whose floor line the fall reached lets go of its floor (what lay on it falls on)
      const a = seams.get(e.structureId)?.anatomy;
      if (!a) return;
      let k = -1;
      for (let s = 0; s < a.storeys.length; s++) if (Math.abs(a.placement.y + a.storeys[s].y0 - e.y0) < 0.4) k = s;
      if (k >= 0) bodies.dropFloor(e.structureId, k);
    },
    update() {
      const now = o.now();
      const dt = Math.max(0, Math.min(0.25, now - last));
      last = now;
      fracture.update();
      bodies.update(dt);
      landmarks.update(dt);
      if (hangingDue.size) sweepHanging();
      flushRefused();
      // a cut laid ahead gone stale (the walls redrawn, a stage laid since): laid again once the walls' drawing is done,
      // one building an update
      for (let i = 0; i < wantCut.length; i++) {
        const w = wantCut[i], idx = w.idx;
        const v = versionOf(idx);
        if (bodies.preparedVersion(idx) === v || !fracture.idle(idx)) continue;
        const standing = w.roofOnly ? [] : [...(host ? host.o.debris.standingRuns(tagOf(idx)) : []), ...fracture.standing(idx)];
        bodies.prepare(w.seam, resolverOf(w.seam), standing, v, w.roofOnly);
        break;
      }
    },
    warm(at, material) {
      if (!material) return 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([at.x, at.y + 0.5, at.z, at.x + 0.3, at.y + 0.5, at.z, at.x, at.y + 0.8, at.z], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'fx-fracture-warm';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      o.group.add(mesh);
      warmed.push(mesh);
      return 1;
    },
    shiftTime(delta) { last += delta; },
    reset() {
      for (const m of warmed) { m.removeFromParent(); m.geometry.dispose(); }
      warmed.length = 0;
      fracture.reset();
      landmarks.reset();
      bodies.reset();
      passes.clear();
      sectionsOn.clear();
      wantCut.length = 0;
      seams.clear();
      events.clear();
      clamps.length = 0;
      refused.clear();
      hangingDue.clear();
      fallen.clear();
      last = o.now();
    },
    stats() {
      const ps = pool.stats(), fs = fracture.stats(), cs = bodies.stats(), ls = landmarks.stats();
      return { bodies: ps.bodies, awake: ps.awake, fracture: fs.bodies, collapses: cs.collapses, prepared: cs.prepared, skipped: fs.skipped,
        landmark: ls.bodies + ls.baked };
    },
  };
}
