/**
 * structureDamageSeam.ts — the world's runtime seam for damage geometry (destruction core lane, 2026-10-07;
 * docs/DESTRUCTION.md §16).
 *
 * At build time the world describes every structure through its kit chain (the builder's own kit, the map's regional
 * kit, then the default) and records where its parts landed in the merged buckets (`StructureSpan`: the mesh, the
 * vertex range, the bucket, the part class — the same contiguous ranges the crushable clutter flattens). At runtime the
 * presentation asks `world.structureDamage(id)` for a structure's seam: its anatomy (with the sim's mound filled in),
 * its spans (to hide, cut or collapse its intact geometry), the stage builders, each resolved member by member through
 * the chain, and `touchShadows()` for the frames its shader reshapes the structure.
 *
 * Every bucket mesh and batch is in world space (identity matrices under the world root, never moved), so a span's
 * positions, the anatomy's placement and the presentation's pivots are all world points.
 */
import { BufferAttribute, type BufferGeometry, type Material, type Object3D } from 'three';
import {
  damageSeed, kitPlanFor, structureDamageKitChain,
  type BreachSpec, type DamageFace, type DamagePartClass, type DamageStageResult, type DamageWriters, type StructureDamageAnatomy,
  type StructureDamageKit, type StructureDescribeInput,
} from './destructionKit.ts';
import { DEFAULT_STRUCTURE_DAMAGE_KIT, describeDefault } from './destructionDefaultKit.ts';
import type { DestructionCause, MunitionClass, StructureMassClass } from '../sim/destructionEvents.ts';

/**
 * Where one of a structure's parts landed: a vertex range of a merged bucket mesh's position attribute, or of a batch's
 * (a BatchedMesh holds every geometry in one set of attributes: `first` is absolute there, the geometry's vertexStart
 * included, so a range flattens the same way in both). Merged geometries are non-indexed: the range is the part's
 * triangles, three vertices each.
 */
export interface StructureSpan {
  mesh: Object3D;
  /** The batch's geometry id for a BatchedMesh's cell (for reference: `first` is already absolute); null for a plain mesh. */
  geometryId: number | null;
  /** The batch's one instance drawing that geometry (its cell's: the fine-detail LOD shows and hides it); null for a mesh. */
  instanceId: number | null;
  position: BufferAttribute;
  bucket: string;
  partClass: DamagePartClass;
  first: number;
  count: number;
}

export interface StructureDamageSeam {
  readonly structureIdx: number;
  readonly builder: string;
  readonly style: string | null;
  readonly anatomy: StructureDamageAnatomy;
  readonly spans: readonly StructureSpan[];
  damaged(seed: number, out: DamageWriters): DamageStageResult;
  breach(hole: BreachSpec, out: DamageWriters): DamageStageResult;
  sectionDown(section: number, seed: number, out: DamageWriters): DamageStageResult;
  /** A storey drops after its faces (P2): `storey` is the anatomy's (holeAt maps the event's point to it). */
  storeyDown(storey: number, seed: number, out: DamageWriters): DamageStageResult;
  collapse(seed: number, out: DamageWriters): DamageStageResult;
  /**
   * The hole a blow at world point (x, y, z) opens (radius `radiusM`, blow direction `dirX`, `dirZ` in the world): the
   * anatomy face nearest the point, the storey it stands in, the centre along the face and above the storey floor, the
   * direction in the body frame, and the seed (`damageSeed(anatomy.seed, section, hole)`), ready for `breach`. Null for
   * an anatomy without storeys.
   */
  holeAt(x: number, y: number, z: number, radiusM: number, dirX: number, dirZ: number, munition: MunitionClass | null,
    cause: DestructionCause, hole?: number): BreachSpec | null;
  /**
   * Tell the static shadow cache (engine/shadowStaticCache.ts) that the meshes casting this structure's shadow change
   * shape this frame without a CPU-side change it can see (a shader reshaping them through `aDamage`). Call it on every
   * frame the shape changes — each frame of a collapse animation, once for a settled stage — and the cache redraws
   * those meshes with the dynamic casters while they change, returning them to the static layer a second after the
   * last call. A structure no mesh casts for costs nothing.
   */
  touchShadows(): void;
}

/** The shadow-content epoch the static shadow cache mixes into a caster's signature (shadowStaticCache.casterSignature). */
export function touchShadowCasters(meshes: readonly Object3D[]): void {
  for (const mesh of meshes) {
    const epoch = mesh.userData.cotShadowEpoch;
    mesh.userData.cotShadowEpoch = typeof epoch === 'number' ? (epoch + 1) | 0 : 1;
  }
}

/** What a part of a bucket is for the presentation's hides (§16.4). */
export function partClassOf(bucket: string, fine = false): DamagePartClass {
  if (bucket === 'glass' || bucket === 'curtain') return 'glass';
  if (bucket === 'roof' || bucket === 'regionalRoof' || bucket === 'straw') return 'roof';
  return fine ? 'trim' : 'wall';
}

/** A map's 32-bit hash for damage seeds. */
export function mapDamageHash(mapId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < mapId.length; i++) { hash ^= mapId.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

export interface DescribeStructureArgs {
  structureIdx: number;
  mapId: string;
  builder: string;
  style: string | null;
  parts: Readonly<Record<string, readonly BufferGeometry[]>>;
  w: number;
  d: number;
  h: number;
  placement: { x: number; y: number; z: number; yaw: number };
  massClass: StructureMassClass;
}

/** The structure's anatomy through its kit chain (the first `describe` that answers), else the default's reading. */
export function describeStructure(args: DescribeStructureArgs): StructureDamageAnatomy {
  const seed = damageSeed(mapDamageHash(args.mapId), Math.round(args.placement.x * 100), Math.round(args.placement.z * 100));
  const input: StructureDescribeInput = { ...args, seed, kitPlan: kitPlanFor(args.parts, args.style) };
  for (const kit of structureDamageKitChain(args.builder, args.style)) {
    if (kit === DEFAULT_STRUCTURE_DAMAGE_KIT || !kit.describe) continue;
    try {
      const anatomy = kit.describe(input);
      if (anatomy) return anatomy;
    } catch {
      // a kit that cannot describe this building leaves it to the default (never a build failure)
    }
  }
  return describeDefault(input);
}

type StageMember = 'damaged' | 'breach' | 'sectionDown' | 'storeyDown' | 'collapse';

export function createStructureDamageSeam(structureIdx: number, builder: string, style: string | null,
  anatomy: StructureDamageAnatomy, spans: readonly StructureSpan[]): StructureDamageSeam {
  const chain = structureDamageKitChain(builder, style);
  // the anatomy came from one kit: its builders read that kit's plan, so a member comes from that kit first; an anatomy
  // the default described is built by the default (another kit's builders would look for a plan it does not have)
  const own = chain.find((kit) => kit.id === anatomy.kit) ?? null;
  const kitFor = (member: StageMember): StructureDamageKit => {
    if (anatomy.kit === 'default') return DEFAULT_STRUCTURE_DAMAGE_KIT;
    if (own && own[member]) return own;
    return chain.find((candidate) => candidate[member]) ?? DEFAULT_STRUCTURE_DAMAGE_KIT;
  };
  const damagedKit = kitFor('damaged'), breachKit = kitFor('breach');
  const sectionKit = kitFor('sectionDown'), storeyKit = kitFor('storeyDown'), collapseKit = kitFor('collapse');
  const casters = [...new Set(spans.map((span) => span.mesh))].filter((mesh) => mesh.castShadow);
  return {
    structureIdx, builder, style, anatomy, spans,
    touchShadows: () => touchShadowCasters(casters),
    holeAt: (x, y, z, radiusM, dirX, dirZ, munition, cause, hole = 0) =>
      holeOnAnatomy(anatomy, x, y, z, radiusM, dirX, dirZ, munition, cause, hole),
    damaged: (seed, out) => (damagedKit.damaged ?? DEFAULT_STRUCTURE_DAMAGE_KIT.damaged!).call(damagedKit, anatomy, seed, out),
    breach: (hole, out) => (breachKit.breach ?? DEFAULT_STRUCTURE_DAMAGE_KIT.breach!).call(breachKit, anatomy, hole, out),
    sectionDown: (section, seed, out) => (sectionKit.sectionDown ?? DEFAULT_STRUCTURE_DAMAGE_KIT.sectionDown!)
      .call(sectionKit, anatomy, section, seed, out),
    storeyDown: (storey, seed, out) => (storeyKit.storeyDown ?? DEFAULT_STRUCTURE_DAMAGE_KIT.storeyDown!)
      .call(storeyKit, anatomy, storey, seed, out),
    collapse: (seed, out) => (collapseKit.collapse ?? DEFAULT_STRUCTURE_DAMAGE_KIT.collapse!).call(collapseKit, anatomy, seed, out),
  };
}

/** The body frame of a placement: world = R(yaw) · body + placement (props.ts composes the merge matrix so). */
function holeOnAnatomy(anatomy: StructureDamageAnatomy, x: number, y: number, z: number, radiusM: number, dirX: number,
  dirZ: number, munition: MunitionClass | null, cause: DestructionCause, hole: number): BreachSpec | null {
  if (!anatomy.storeys.length) return null;
  const { placement } = anatomy;
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  const dx = x - placement.x, dz = z - placement.z;
  const bx = dx * c - dz * s, bz = dx * s + dz * c, by = y - placement.y;
  const storey = anatomy.storeys.find((candidate) => by < candidate.y1) ?? anatomy.storeys[anatomy.storeys.length - 1]!;
  let face: DamageFace | null = null, best = Infinity;
  for (const candidate of storey.faces) {
    // the distance to the face's rectangle in plan: off its plane, and past its ends
    const along = (bx - candidate.origin[0]) * candidate.u[0] + (bz - candidate.origin[2]) * candidate.u[2];
    const off = (bx - candidate.origin[0]) * candidate.out[0] + (bz - candidate.origin[2]) * candidate.out[2];
    const past = Math.max(0, Math.abs(along) - candidate.width / 2);
    const gap = Math.hypot(off, past);
    if (gap < best) { best = gap; face = candidate; }
  }
  if (!face) return null;
  const along = (bx - face.origin[0]) * face.u[0] + (bz - face.origin[2]) * face.u[2];
  const u = Math.max(-face.width / 2, Math.min(face.width / 2, along));
  const hy = Math.max(0, Math.min(storey.y1 - storey.y0, by - storey.y0));
  const length = Math.hypot(dirX, dirZ);
  const wx = length > 1e-9 ? dirX / length : -face.out[0] * c - face.out[2] * s;
  const wz = length > 1e-9 ? dirZ / length : face.out[0] * s - face.out[2] * c;
  return {
    section: face.section, storey: storey.index, face: face.name, hole, u, y: hy, radiusM,
    dirX: wx * c - wz * s, dirZ: wx * s + wz * c, munition, cause, seed: damageSeed(anatomy.seed, face.section, hole),
  };
}

/**
 * Record the spans of every structure part among `sources` as merged (in order, de-indexed: crushableClutter.ts
 * bindClutterBatch's layout) into one geometry drawn by `mesh`: a plain mesh's `position` (offset 0), or a batch's
 * shared position attribute from its geometry `geometryId`'s vertexStart (`offset`).
 */
export function bindStructureSpans(sources: readonly BufferGeometry[], position: BufferAttribute, mesh: Object3D,
  bucket: string, spans: Map<number, StructureSpan[]>, geometryId: number | null = null, fine = false, offset = 0,
  instanceId: number | null = null): void {
  let first = offset;
  for (const source of sources) {
    const count = source.index?.count ?? source.getAttribute('position').count;
    const id = source.userData.structureIdx;
    if (typeof id === 'number' && Number.isSafeInteger(id)) {
      let list = spans.get(id);
      if (!list) { list = []; spans.set(id, list); }
      list.push({ mesh, geometryId, instanceId, position, bucket, partClass: partClassOf(bucket, fine), first, count });
    }
    first += count;
  }
}

/**
 * The per-vertex structure tag (§16.4): `aDamage` = structureIdx + 1 on the vertices of every structure part merged into
 * `merged` (in `sources` order, de-indexed), 0 elsewhere. Added only when a structure part is among the sources, or when
 * `force` (a batch whose geometries must share one attribute set). Returns whether the attribute was added.
 */
export function tagStructureVertices(sources: readonly BufferGeometry[], merged: BufferGeometry, force = false): boolean {
  let total = 0, any = false;
  for (const source of sources) {
    total += source.index?.count ?? source.getAttribute('position').count;
    if (typeof source.userData.structureIdx === 'number') any = true;
  }
  if (!any && !force) return false;
  const position = merged.getAttribute('position');
  if (!position || position.count !== total) return false;
  const values = new Uint16Array(total);
  let first = 0;
  for (const source of sources) {
    const count = source.index?.count ?? source.getAttribute('position').count;
    const id = source.userData.structureIdx;
    if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0 && id < 0xffff) values.fill(id + 1, first, first + count);
    first += count;
  }
  merged.setAttribute('aDamage', new BufferAttribute(values, 1));
  return true;
}

/**
 * A props-bucket material as the world hands it to a patch (world.patchStructureMaterials). `role` 'surface' is a
 * bucket's (or a batch's own) lit material; 'depth' is the MeshDepthMaterial (RGBA packing) a bucket mesh that holds a
 * structure casts its shadow through, so a vertex patch moves the shadow with the building.
 */
export interface StructureMaterialInfo {
  bucket: string;
  role: 'surface' | 'depth';
  /** The first mesh drawing it, and every mesh that does. */
  mesh: Object3D;
  meshes: readonly Object3D[];
  batched: boolean;
}

export interface StructureMaterialEntry {
  material: Material;
  bucket: string;
  role: 'surface' | 'depth';
  mesh: Object3D;
  batched: boolean;
}

/** Hand every distinct props-bucket material to `patch` once (with every mesh that draws it); returns how many. */
export function patchStructureMaterialEntries(entries: readonly StructureMaterialEntry[],
  patch: (material: Material, info: StructureMaterialInfo) => void): number {
  const byMaterial = new Map<Material, StructureMaterialEntry[]>();
  for (const entry of entries) {
    const list = byMaterial.get(entry.material);
    if (list) list.push(entry); else byMaterial.set(entry.material, [entry]);
  }
  for (const [material, list] of byMaterial) {
    patch(material, { bucket: list[0]!.bucket, role: list[0]!.role, mesh: list[0]!.mesh, meshes: list.map((entry) => entry.mesh),
      batched: list[0]!.batched });
  }
  return byMaterial.size;
}
