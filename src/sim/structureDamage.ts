/**
 * structureDamage.ts — structures that take damage and collapse (destruction core lane, 2026-10-07;
 * docs/DESTRUCTION.md §3, §5, §6).
 *
 * A structure is one collision group (CollisionRecord.structureIdx, packed in the shards as `g`): its contact and
 * movement records in the obstacles, its shell bands in the colliders. `createStructureDamage` derives one record per
 * group from those records alone — footprint (the minimum-area rectangle round its contact parts), base and top,
 * built volume, mass class, hit points — identically from the rendered world (solo) and from a shard (a host). Blows
 * (blast, a penetrator's strike, a hull's ram) take hit points; stages only advance; a collapse flips the group's
 * records (`crushed` on the obstacles, `crushed` + `dead` on the shell bands), at most `COLLAPSES_PER_TICK` a tick in
 * authority order, and reports it to the caller, which raises the rubble and refreshes the route grid.
 *
 * Sections (P2, §3.4; structureSections.ts), when the table is made with `sections`: the blow's section takes it too —
 * a hole where a round strikes a wall (a blast's by its charge, a penetrator's by its calibre), a section that falls at
 * zero (a wall panel down to its stub, the roof, the storeys after it) — and the structure's shell bands point at its
 * openings, which the world raycasts read (world/collision.ts rayStructureOpenings). Each hole and fall is a
 * `StructureBreachEvent`, released by `step` within its budget.
 *
 * Pure and Node-runnable: no three, no DOM, no clock, no RNG (damage is deterministic in its inputs). Allocates at
 * construction and when a stage actually changes; the per-blow paths reuse scratch state.
 */
import { convexHull2, type CollisionRecord, type SimpleCollisionShape } from '../world/collision.ts';
import { impactEnergyKj } from './impact.ts';
import { structureMaterialFor, type StructureMaterial } from './structureMaterial.ts';
import type {
  DestructionCause, MunitionClass, StructureBreachEvent, StructureMassClass, StructureStage, StructureStageEvent,
} from './destructionEvents.ts';
import { blastReachM, structureBlastPoints } from './munitionBlast.ts';
import {
  attachOpenings, blastHoleRadiusM, cascadeFalls, createStructureSections, fellSection, holeRadiusFor, MIN_HOLE_M, NO_HOLE,
  openHole, roofSection, sectionAt, sectionCentre, sectionKind, sectionNormal, sectionSpan, shapeArea, storeyDownAt,
  type StructureSections,
} from './structureSections.ts';
import { structureOpeningAt, STRUCTURE_HOLES_PER_SECTION } from '../world/collision.ts';

/** Stage index order: intact 0, damaged 1, breached 2, collapsed 3. */
export const STAGE_ORDER: readonly StructureStage[] = Object.freeze(['intact', 'damaged', 'breached', 'collapsed']);
/** Integrity at or below which a stage begins (§3.3). */
const DAMAGED_AT = 0.70;
const BREACHED_AT = 0.35;
/** A landmark's integrity never falls below this: it breaches, it never collapses (§3.2). */
const LANDMARK_FLOOR = 0.05;
/** Mass class thresholds on the built volume (m³) and the hit-point law (§3.2). */
const SHED_MAX_M3 = 200;
const HOUSE_MAX_M3 = 2500;
const LARGE_MAX_M3 = 20000;
/** Tuning (2026-10-07, coordinator's feel targets; §5): a 600 m³ house falls to about six 125 mm HE rounds or one
 * gunship howitzer shell and a little, a shed to two HE rounds or a medium hull at 6 m/s. */
const HP_SCALE = 0.72;
const HP_EXPONENT = 0.72;
const HP_FLOOR = 10;
/** Ram pricing (§4.4): energy under this does nothing; above it, one structure point per this many kJ. */
/**
 * Ram pricing (§4.4). A crash below a wall's scuff energy only scuffs it: the energy its face absorbs crushing over a
 * hull's bow contact (≈ 2 m²: a glacis or nose block, 2 m × 1 m) to the 2 cm it can lose without losing section —
 * E₀ = σc · A · d, with the face's crushing strength σc. Timber and sheet (≈ 0.75 MPa as the cladding and studs give):
 * 30 kJ; mudbrick (≈ 1.5 MPa): 60 kJ; brick and stone masonry (≈ 7.5 MPa): 300 kJ; reinforced concrete (≈ 27.5 MPa):
 * 1.1 MJ. For a 50 t hull those are closing speeds of 1.1, 1.5, 3.5 and 6.6 m/s: a 1.3 m/s bump (42 kJ) scuffs
 * masonry, a deliberate ram at 8–12 m/s (1.6–3.6 MJ) breaks it.
 */
export const RAM_SCUFF_KJ: Readonly<Record<StructureMaterial, number>> = Object.freeze({
  timber: 30, adobe: 60, masonry: 300, concrete: 1100,
});
/** One structure point per this much ram energy above the scuff (§5's feel on a masonry house: a 60 t hull at 9 m/s
 * breaches it, at 12 m/s brings it down, a 37.5 t medium at 8 m/s damages it). */
const RAM_KJ_PER_POINT = 40;
/** Collision swaps per fixed step (§5, §10): a collapse's work (the swap, the heap, the route grid's refresh round it) is
 * about 1–4 ms of CPU, so a second collapse in the same tick waits for the next (16.7 ms later). */
export const COLLAPSES_PER_TICK = 1;
/**
 * The collapse, seen (P2, 2026-10-08; wave 277: "the building is never seen to come down" — it stood, then was gone a
 * second later behind its dust). With sections on, a structure whose whole crosses collapse comes down top first before
 * its swap: the roof if it still stands, then each storey from the top every COLLAPSE_STOREY_TICKS, its standing faces
 * falling with it (the last one's breach carries storeyDown: the kit's heap on that floor line), the ground storey to
 * its metre-high stubs, each storey the time its height takes to fall (collapseStoreyTicks: sqrt(2h/g) rounded up, 3.2 m
 * storeys 49 ticks — with weight, not a stutter; the presentation animates each drop over that time). Once the ground
 * storey has landed (its own fall's ticks) and COLLAPSE_SETTLE_TICKS more, its collision swaps, its heap rises and its
 * 'collapsed' stage releases. A three-storey house: the roof at once, the storeys 0.82, 1.63 and 2.45 s later, the swap
 * at 3.47 s. A hull that rammed it keeps driving through while it falls (yieldTo, as P1's one-tick wait did);
 * shells and sight lines meet what still stands (the openings' cap falls with each storey). Sections off: one event and
 * the next tick's swap, as in P1.
 */
export const COLLAPSE_SETTLE_TICKS = 12;
/** The ticks a storey of `storeyHeightM` takes to fall its height (sqrt(2h/g) at 60 Hz rounded up, at least 18): the
 * cascade's spacing between one storey's drop and the next's, and the ground storey's landing before the swap. */
export function collapseStoreyTicks(storeyHeightM: number): number {
  return Math.max(18, Math.ceil(60 * Math.sqrt((2 * Math.max(0, storeyHeightM)) / 9.81)));
}
/** Stage events per fixed step besides collapses (§8.5): the overflow is reported in the next tick. */
export const STAGE_EVENTS_PER_TICK = 4;
/** Breach events (holes and section falls, P2) per fixed step: the overflow is reported in the next tick. */
export const BREACH_EVENTS_PER_TICK = 6;
/** A blast this close to a structure (the blast law's contact zone, 0.6 · W^⅓) strikes its nearest section too. */
const SECTION_CONTACT_Z = 0.6;
/** Blast query buckets (§10). */
const BUCKET_M = 16;
const WORLD_HALF_M = 512;
const BUCKETS = (WORLD_HALF_M * 2) / BUCKET_M;

export interface StructureState {
  /** The group id (CollisionRecord.structureIdx). */
  readonly id: number;
  readonly role: 'building' | 'setpiece' | 'fixed';
  readonly massClass: StructureMassClass;
  /** What its walls are (structureMaterial.ts): the ram's scuff energy (§4.4). */
  readonly material: StructureMaterial;
  /** Takes damage at all (false for a fixed group). */
  readonly destructible: boolean;
  /** Collapses at zero (false for a landmark). */
  readonly collapsible: boolean;
  /** Footprint: the minimum-area rectangle round the contact parts; forward (sin yaw, cos yaw) along its longer side. */
  readonly cx: number;
  readonly cz: number;
  readonly hw: number;
  readonly hd: number;
  readonly yaw: number;
  readonly baseY: number;
  readonly topY: number;
  readonly volumeM3: number;
  readonly maxHp: number;
  hp: number;
  /** Stage index (STAGE_ORDER). */
  stage: number;
  /** A collapse is queued for a coming tick. */
  collapsePending: boolean;
  /** Its contact and movement records (obstacles) and shell bands (colliders). */
  readonly obstacles: CollisionRecord[];
  readonly colliders: CollisionRecord[];
  /** Its sections (P2), derived when first struck in a table made with `sections`; null until then. */
  sections: StructureSections | null;
}

/** One blow, as the caller saw it (where, which way, what made it). */
export interface StructureBlow {
  cause: DestructionCause;
  munition: MunitionClass | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** A penetrator's hole radius at the strike (P2: kinetic and shaped-charge rounds; 0 or absent: none). */
  holeRadiusM?: number;
}

export interface StructureDamageOptions {
  /** Multiplies every structure point dealt (the ruleset's structureDamageScale). */
  damageScale?: number;
  /** The map's house walls (structureMaterial.ts wallMaterialForMap; masonry when absent). */
  wallMaterial?: StructureMaterial;
  /** A collapse applied (records already flipped): raise the rubble, refresh the route grid. */
  onCollapse?(structure: StructureState): void;
  /** Sections (P2): blows open holes and fell sections, which shells and sight lines pass (the ruleset's `sections`). */
  sections?: boolean;
}

export interface StructureDamage {
  readonly structures: readonly StructureState[];
  /** The structure a record belongs to, or null. */
  structureOf(record: CollisionRecord | null | undefined): StructureState | null;
  byId(id: number): StructureState | null;
  /** A burst of `chargeKg` at (x, y, z): every destructible structure within reach takes its share. `direct` takes
   * it at contact (the record the shell struck). */
  applyBlast(chargeKg: number, munition: MunitionClass, blow: StructureBlow, direct?: StructureState | null): void;
  /** Points dealt straight to one structure (a penetrator's strike, a ram's share). */
  applyPoints(structure: StructureState, points: number, blow: StructureBlow): void;
  /** A hull's ram (§4.4): prices the closing speed this crash adds over `priorClosingMps`. */
  applyRam(structure: StructureState, massTons: number, closingMps: number, priorClosingMps: number,
    blow: StructureBlow): void;
  /**
   * A hull pressing into the structure at `closingMps` (§4.4): when that ram brings it down (or it is already going
   * down) the structure yields — the ram is priced, the collapse queued — and this returns the share of its speed the
   * hull keeps after the energy the structure absorbed (its remaining hit points' worth, ½·m·v² beyond); otherwise null
   * (the structure holds: a hard surface, and the crash prices the ram).
   */
  yieldTo(structure: StructureState, massTons: number, closingMps: number, speedMps: number,
    blow: StructureBlow): number | null;
  /** One fixed step: applies queued collapses (at most COLLAPSES_PER_TICK) and releases this tick's events. */
  step(): void;
  /** Moves the events released by `step` into `out` (oldest first) and returns how many. */
  drainEvents(out: StructureStageEvent[]): number;
  /** Moves the breach events (P2) released by `step` into `out` (oldest first) and returns how many. */
  drainBreaches(out: StructureBreachEvent[]): number;
  /** Lay a stage down without an event (a resumed host, a late joiner's settled log): flips a collapse at once. */
  restoreStage(id: number, stage: StructureStage): boolean;
  /**
   * Lay a breach down without an event (a resumed host, a peer replaying the authority's event or log): the hole in its
   * slot, or the section's fall (`sectionDown`, slot NO_HOLE), in the section at the point (the authority classified
   * the same quantized point; the named section for a point inside the footprint). Returns the section it opened, or
   * −1 when nothing changed (already open, a collapsed structure, a table without sections).
   */
  restoreBreach(id: number, section: number, hole: number, x: number, y: number, z: number, radiusM: number,
    sectionDown: boolean): number;
  /** A structure's sections (derived on first use; null for one that takes no damage or a table without sections). */
  sectionsOf(structure: StructureState): StructureSections | null;
}

// ---- Footprints ------------------------------------------------------------------------------------------------

function shapePoints(shape: SimpleCollisionShape, out: Array<[number, number]>): void {
  if (shape.kind === 'circle') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      out.push([shape.cx + Math.cos(a) * shape.r, shape.cz + Math.sin(a) * shape.r]);
    }
  } else if (shape.kind === 'obb') {
    const fx = Math.sin(shape.yaw), fz = Math.cos(shape.yaw), rx = fz, rz = -fx;
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
      out.push([shape.cx + rx * shape.hw * a + fx * shape.hl * b, shape.cz + rz * shape.hw * a + fz * shape.hl * b]);
    }
  } else {
    for (let i = 0; i < shape.points.length; i += 2) out.push([shape.points[i], shape.points[i + 1]]);
  }
}

function recordPoints(record: CollisionRecord, out: Array<[number, number]>): void {
  const shape = record.shape2;
  if (!shape) {
    out.push([record.min[0], record.min[2]], [record.max[0], record.min[2]],
      [record.max[0], record.max[2]], [record.min[0], record.max[2]]);
  } else if (shape.kind === 'compound') {
    for (const part of shape.parts) shapePoints(part, out);
  } else {
    shapePoints(shape, out);
  }
}

/** Built volume of shell bands: each part's area times its own vertical extent (or its record's). */
function bandVolume(record: CollisionRecord): number {
  const shape = record.shape2;
  const recordHeight = Math.max(0, record.max[1] - record.min[1]);
  const partVolume = (part: SimpleCollisionShape): number => {
    const height = part.y0 !== undefined && part.y1 !== undefined ? Math.max(0, part.y1 - part.y0) : recordHeight;
    return shapeArea(part) * height;
  };
  if (!shape) return (record.max[0] - record.min[0]) * (record.max[2] - record.min[2]) * recordHeight;
  if (shape.kind === 'compound') {
    let volume = 0;
    for (const part of shape.parts) volume += partVolume(part);
    return volume;
  }
  return partVolume(shape);
}

interface Footprint { cx: number; cz: number; hw: number; hd: number; yaw: number }

/**
 * The minimum-area rectangle round a point set (rotating calipers over its convex hull), canonical: forward along the
 * longer side, yaw in [0, π), the first minimum in hull order on ties.
 */
export function minimumAreaRectangle(points: ReadonlyArray<readonly [number, number]>): Footprint | null {
  const hull = convexHull2(points);
  const n = hull.length / 2;
  if (n < 3) {
    if (!points.length) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const w = (maxX - minX) * 0.5, d = (maxZ - minZ) * 0.5;
    return d >= w
      ? { cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5, hw: w, hd: d, yaw: 0 }
      : { cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5, hw: d, hd: w, yaw: Math.PI / 2 };
  }
  let best: Footprint | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = hull[j * 2] - hull[i * 2], uz = hull[j * 2 + 1] - hull[i * 2 + 1];
    const length = Math.hypot(ux, uz);
    if (length < 1e-9) continue;
    ux /= length; uz /= length;
    const vx = -uz, vz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const px = hull[k * 2], pz = hull[k * 2 + 1];
      const u = px * ux + pz * uz, v = px * vx + pz * vz;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      const uc = (u0 + u1) * 0.5, vc = (v0 + v1) * 0.5;
      const cx = ux * uc + vx * vc, cz = uz * uc + vz * vc;
      const halfU = (u1 - u0) * 0.5, halfV = (v1 - v0) * 0.5;
      // forward = (sin yaw, cos yaw) along the longer side
      const [fx, fz, hd, hw] = halfU >= halfV ? [ux, uz, halfU, halfV] : [vx, vz, halfV, halfU];
      let yaw = Math.atan2(fx, fz);
      if (yaw < 0) yaw += Math.PI;
      if (yaw >= Math.PI - 1e-12) yaw -= Math.PI;
      best = { cx, cz, hw, hd, yaw };
    }
  }
  return best;
}

/** Mass class from the built volume and the group's role (§3.2). */
export function structureMassClass(volumeM3: number, role: StructureState['role']): StructureMassClass {
  if (role === 'setpiece' || volumeM3 >= LARGE_MAX_M3) return 'landmark';
  if (volumeM3 < SHED_MAX_M3) return 'shed';
  if (volumeM3 < HOUSE_MAX_M3) return 'house';
  return 'large';
}

/** Hit points from the built volume: 0.72 · V^0.72, at least 10 (§3.2). */
export function structureHitPoints(volumeM3: number): number {
  return Math.max(HP_FLOOR, HP_SCALE * Math.pow(Math.max(0, volumeM3), HP_EXPONENT));
}

/** Structure points of a ram (§4.4): (½·m·v² − E₀(material)) / 40, 0 below the material's scuff energy. */
export function ramStructurePoints(massTons: number, closingMps: number, material: StructureMaterial = 'masonry'): number {
  return Math.max(0, impactEnergyKj(massTons, closingMps) - RAM_SCUFF_KJ[material]) / RAM_KJ_PER_POINT;
}

/** The stage an integrity (hp / maxHp) stands at. */
export function stageForIntegrity(integrity: number): number {
  if (integrity <= 0) return 3;
  if (integrity <= BREACHED_AT) return 2;
  if (integrity <= DAMAGED_AT) return 1;
  return 0;
}

// ---- The table -------------------------------------------------------------------------------------------------

interface Group { obstacles: CollisionRecord[]; colliders: CollisionRecord[] }

function buildState(id: number, group: Group, wallMaterial: StructureMaterial): StructureState | null {
  const role: StructureState['role'] = group.obstacles.concat(group.colliders)
    .some((record) => record.structureRole === 'fixed') ? 'fixed'
    : group.obstacles.concat(group.colliders).some((record) => record.structureRole === 'setpiece') ? 'setpiece'
      : 'building';
  const contact = group.obstacles.length ? group.obstacles : group.colliders;
  const points: Array<[number, number]> = [];
  for (const record of contact) recordPoints(record, points);
  const footprint = minimumAreaRectangle(points);
  if (!footprint) return null;
  let baseY = Infinity, topY = -Infinity, volume = 0;
  for (const record of group.obstacles) { baseY = Math.min(baseY, record.min[1]); topY = Math.max(topY, record.max[1]); }
  for (const record of group.colliders) {
    baseY = Math.min(baseY, record.min[1]);
    topY = Math.max(topY, record.max[1]);
    volume += bandVolume(record);
  }
  if (!group.colliders.length) {
    for (const record of group.obstacles) volume += bandVolume(record);
  }
  const massClass = structureMassClass(volume, role);
  const maxHp = structureHitPoints(volume);
  return {
    id, role, massClass, material: structureMaterialFor(massClass, wallMaterial),
    destructible: role !== 'fixed',
    collapsible: role !== 'fixed' && massClass !== 'landmark',
    cx: footprint.cx, cz: footprint.cz, hw: footprint.hw, hd: footprint.hd, yaw: footprint.yaw,
    baseY: Number.isFinite(baseY) ? baseY : 0, topY: Number.isFinite(topY) ? topY : 0,
    volumeM3: volume, maxHp, hp: maxHp, stage: 0, collapsePending: false,
    obstacles: group.obstacles, colliders: group.colliders, sections: null,
  };
}

/** Squared distance from (x, y, z) to a structure's footprint box (0 inside). */
function distanceToStructure(structure: StructureState, x: number, y: number, z: number): number {
  const fx = Math.sin(structure.yaw), fz = Math.cos(structure.yaw);
  const dx = x - structure.cx, dz = z - structure.cz;
  const along = Math.abs(dx * fx + dz * fz) - structure.hd;
  const across = Math.abs(dx * fz - dz * fx) - structure.hw;
  const outAlong = along > 0 ? along : 0, outAcross = across > 0 ? across : 0;
  const outY = y < structure.baseY ? structure.baseY - y : y > structure.topY ? y - structure.topY : 0;
  return Math.sqrt(outAlong * outAlong + outAcross * outAcross + outY * outY);
}

function bucketOf(value: number): number {
  const index = Math.floor((value + WORLD_HALF_M) / BUCKET_M);
  return index < 0 ? 0 : index >= BUCKETS ? BUCKETS - 1 : index;
}

export function createStructureDamage(
  obstacles: readonly CollisionRecord[],
  colliders: readonly CollisionRecord[],
  options: StructureDamageOptions = {},
): StructureDamage {
  const damageScale = Number.isFinite(options.damageScale) && (options.damageScale as number) >= 0
    ? options.damageScale as number : 1;
  const groups = new Map<number, Group>();
  const take = (record: CollisionRecord, list: 'obstacles' | 'colliders') => {
    const id = record.structureIdx;
    if (id === undefined || id === null || !Number.isSafeInteger(id) || id < 0) return;
    let group = groups.get(id);
    if (!group) { group = { obstacles: [], colliders: [] }; groups.set(id, group); }
    if (!group[list].includes(record)) group[list].push(record);
  };
  for (const record of obstacles) take(record, 'obstacles');
  for (const record of colliders) take(record, 'colliders');
  const structures: StructureState[] = [];
  for (const id of [...groups.keys()].sort((a, b) => a - b)) {
    const state = buildState(id, groups.get(id)!, options.wallMaterial ?? 'masonry');
    if (state) structures.push(state);
  }
  const byIdMap = new Map<number, StructureState>(structures.map((structure) => [structure.id, structure]));
  const indexOf = new Map<StructureState, number>(structures.map((structure, index) => [structure, index]));

  // blast buckets: each structure listed in every bucket its footprint's box touches (CSR, ascending ids)
  const bucketLists: number[][] = Array.from({ length: BUCKETS * BUCKETS }, () => []);
  structures.forEach((structure, index) => {
    const ex = Math.abs(Math.sin(structure.yaw)) * structure.hd + Math.abs(Math.cos(structure.yaw)) * structure.hw;
    const ez = Math.abs(Math.cos(structure.yaw)) * structure.hd + Math.abs(Math.sin(structure.yaw)) * structure.hw;
    for (let bz = bucketOf(structure.cz - ez); bz <= bucketOf(structure.cz + ez); bz++) {
      for (let bx = bucketOf(structure.cx - ex); bx <= bucketOf(structure.cx + ex); bx++) {
        bucketLists[bz * BUCKETS + bx].push(index);
      }
    }
  });
  const bucketStart = new Int32Array(BUCKETS * BUCKETS + 1);
  let total = 0;
  for (let i = 0; i < bucketLists.length; i++) { bucketStart[i] = total; total += bucketLists[i].length; }
  bucketStart[bucketLists.length] = total;
  const bucketItems = new Int32Array(total);
  bucketLists.forEach((list, i) => bucketItems.set(list, bucketStart[i]));
  const visitMark = new Int32Array(structures.length);
  let visitEpoch = 0;

  const collapseQueue: StructureState[] = [];
  const pendingEvents: StructureStageEvent[] = [];
  const released: StructureStageEvent[] = [];
  // the collapses coming down storey by storey (sections on): the next fall's tick, the stage event the swap releases
  interface CollapseCascade {
    structure: StructureState;
    sections: StructureSections;
    at: number;
    event: StructureStageEvent;
    munition: MunitionClass | null;
    settling: boolean;
  }
  const cascades: CollapseCascade[] = [];
  let tick = 0;

  // ---- sections (P2) ----
  const sectionsOn = options.sections === true;
  const pendingBreaches: StructureBreachEvent[] = [];
  const releasedBreaches: StructureBreachEvent[] = [];
  const falls: number[] = [];
  const span = { y0: 0, y1: 0 };
  const normal = { x: 0, y: 0, z: 0 };
  const centre = { x: 0, y: 0, z: 0 };
  // the wire's quantization (mp/wire/destructionLog.ts): centres to the millimetre, radii to the centimetre
  const mm = (value: number) => Math.round(value * 1000) / 1000;
  const cm = (value: number) => Math.round(value * 100) / 100;

  function sectionsFor(structure: StructureState): StructureSections | null {
    if (!sectionsOn || !structure.destructible) return null;
    return structure.sections ??= createStructureSections(structure);
  }

  function breachEvent(structure: StructureState, sections: StructureSections, section: number, hole: number,
    x: number, y: number, z: number, radiusM: number, sectionDown: boolean, munition: MunitionClass | null): StructureBreachEvent {
    sectionSpan(sections, section, span);
    sectionNormal(sections, section, normal);
    return {
      structureId: structure.id, massClass: structure.massClass,
      cx: structure.cx, cz: structure.cz, hw: structure.hw, hd: structure.hd, yaw: structure.yaw,
      baseY: structure.baseY, topY: structure.topY,
      section, sectionKind: sectionKind(sections, section), y0: span.y0, y1: span.y1, hole,
      x, y, z, nx: normal.x, ny: normal.y, nz: normal.z, radiusM, munition, sectionDown,
      ...(sectionDown && storeyDownAt(sections, section) ? { storeyDown: true } : {}),
    };
  }

  /** A section falls, then what its fall brings (§3.4): one event each, standing at the section's centre on its face. */
  function fall(structure: StructureState, sections: StructureSections, section: number, munition: MunitionClass | null): void {
    fellSection(sections, section);
    sectionCentre(sections, section, centre);
    pendingBreaches.push(breachEvent(structure, sections, section, NO_HOLE, mm(centre.x), mm(centre.y), mm(centre.z), 0, true, munition));
    cascadeFalls(sections, falls);
    for (const next of falls) {
      sectionCentre(sections, next, centre);
      pendingBreaches.push(breachEvent(structure, sections, next, NO_HOLE, mm(centre.x), mm(centre.y), mm(centre.z), 0, true, munition));
    }
  }

  /**
   * The blow's section takes it (P2): a hole of `holeRadiusM` (before the walls' material) where it struck, unless the
   * point already lies in an opening or the section's slots are full, and its points; at zero the section falls. The
   * point is quantized first, so a peer that replays the event classifies it exactly as here.
   */
  function strikeSection(structure: StructureState, points: number, blow: StructureBlow, holeRadiusM: number): void {
    if (!sectionsOn || !structure.destructible || structure.stage >= 3 || structure.collapsePending) return;
    if (!(points > 0) && !(holeRadiusM > 0)) return;
    const sections = sectionsFor(structure)!;
    const x = mm(blow.x), y = mm(blow.y), z = mm(blow.z);
    const section = sectionAt(sections, x, y, z);
    if (section < 0 || sections.down[section]) return;
    let opened = false;
    const radius = holeRadiusM > 0 ? cm(holeRadiusFor(sections, holeRadiusM, structure.material)) : 0;
    if (radius >= MIN_HOLE_M && sections.holeCount[section] < STRUCTURE_HOLES_PER_SECTION
      && !structureOpeningAt(sections, x, y, z)) {
      const slot = sections.holeCount[section];
      openHole(sections, section, slot, x, y, z, radius);
      pendingBreaches.push(breachEvent(structure, sections, section, slot, x, y, z, radius, false, blow.munition));
      opened = true;
    }
    if (points > 0) {
      sections.hp[section] -= points * damageScale;
      if (sections.hp[section] <= 0) {
        fall(structure, sections, section, blow.munition);
        opened = true;
      }
    }
    if (opened) attachOpenings(sections);
  }

  /** Whether any wall panel or the roof of `sections` still stands (the stubs below a fallen panel do not count). */
  function standing(sections: StructureSections): boolean {
    for (let i = 0; i < sections.count; i++) if (!sections.down[i]) return true;
    return false;
  }

  /** A collapse cascade's next fall: the roof while it stands, else every standing face of the top storey that still has
   * one (the last face's event carries storeyDown). False when nothing stands. */
  function fellNext(cascade: CollapseCascade): boolean {
    const s = cascade.sections;
    const roof = roofSection(s);
    if (!s.down[roof]) {
      fall(cascade.structure, s, roof, cascade.munition);
      return true;
    }
    for (let k = s.storeys - 1; k >= 0; k--) {
      let fell = false;
      for (let f = 0; f < 4; f++) {
        if (s.down[k * 4 + f]) continue; // a face the fall before this one already brought down
        fall(cascade.structure, s, k * 4 + f, cascade.munition);
        fell = true;
      }
      if (fell) return true;
    }
    return false;
  }

  function eventFor(structure: StructureState, stage: number, previous: number, points: number,
    blow: StructureBlow): StructureStageEvent {
    return {
      structureId: structure.id, massClass: structure.massClass,
      cx: structure.cx, cz: structure.cz, hw: structure.hw, hd: structure.hd, yaw: structure.yaw,
      baseY: structure.baseY, topY: structure.topY,
      stage: STAGE_ORDER[stage], previous: STAGE_ORDER[previous],
      cause: blow.cause, munition: blow.munition, x: blow.x, y: blow.y, z: blow.z, dirX: blow.dirX, dirZ: blow.dirZ,
      points, integrity: structure.maxHp > 0 ? Math.max(0, structure.hp / structure.maxHp) : 0,
      ...(sectionsOn ? { sections: true } : {}),
    };
  }

  function flipCollapse(structure: StructureState): void {
    for (const record of structure.obstacles) record.crushed = true;
    for (const record of structure.colliders) { record.crushed = true; record.dead = true; }
  }

  function damage(structure: StructureState, points: number, blow: StructureBlow): void {
    if (!structure.destructible || !(points > 0) || structure.stage >= 3 || structure.collapsePending) return;
    const floor = structure.collapsible ? 0 : structure.maxHp * LANDMARK_FLOOR;
    const before = structure.stage;
    structure.hp = Math.max(floor, structure.hp - points * damageScale);
    let after = stageForIntegrity(structure.maxHp > 0 ? structure.hp / structure.maxHp : 0);
    if (!structure.collapsible && after > 2) after = 2;
    if (after <= before) return;
    // one event per stage crossed, in order; the collapse waits in the queue for its collision swap (with sections on,
    // after its cascade has brought it down storey by storey)
    for (let stage = before + 1; stage <= after; stage++) {
      if (stage === 3) {
        structure.collapsePending = true;
        const event = eventFor(structure, 3, stage - 1, points * damageScale, blow);
        const sections = sectionsFor(structure);
        if (sections) cascades.push({ structure, sections, at: tick, event, munition: blow.munition, settling: false });
        else {
          collapseQueue.push(structure);
          pendingEvents.push(event);
        }
      } else {
        structure.stage = stage;
        pendingEvents.push(eventFor(structure, stage, stage - 1, points * damageScale, blow));
      }
    }
  }

  return {
    structures,
    structureOf(record) {
      const id = record?.structureIdx;
      return id === undefined || id === null ? null : byIdMap.get(id) ?? null;
    },
    byId: (id) => byIdMap.get(id) ?? null,
    applyBlast(chargeKg, munition, blow, direct = null) {
      if (!(chargeKg > 0)) return;
      const reach = blastReachM(chargeKg);
      visitEpoch++;
      const directIndex = direct ? indexOf.get(direct) : undefined;
      if (direct && directIndex !== undefined) {
        visitMark[directIndex] = visitEpoch;
        const points = structureBlastPoints(chargeKg, munition, 0);
        // the struck section takes the burst and its hole (a shaped charge's jet: the larger of the two)
        strikeSection(direct, points, blow, Math.max(blastHoleRadiusM(chargeKg, munition), blow.holeRadiusM ?? 0));
        damage(direct, points, blow);
      }
      const contact = SECTION_CONTACT_Z * Math.cbrt(chargeKg);
      const bx0 = bucketOf(blow.x - reach), bx1 = bucketOf(blow.x + reach);
      const bz0 = bucketOf(blow.z - reach), bz1 = bucketOf(blow.z + reach);
      for (let bz = bz0; bz <= bz1; bz++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const cell = bz * BUCKETS + bx;
          for (let k = bucketStart[cell]; k < bucketStart[cell + 1]; k++) {
            const index = bucketItems[k];
            if (visitMark[index] === visitEpoch) continue;
            visitMark[index] = visitEpoch;
            const structure = structures[index];
            if (!structure.destructible || structure.stage >= 3) continue;
            const distance = distanceToStructure(structure, blow.x, blow.y, blow.z);
            if (distance > reach) continue;
            const points = structureBlastPoints(chargeKg, munition, distance);
            // a burst at a wall's foot strikes its nearest section too (no hole: splash does not punch through)
            if (distance <= contact) strikeSection(structure, points, blow, 0);
            damage(structure, points, blow);
          }
        }
      }
    },
    applyPoints(structure, points, blow) {
      strikeSection(structure, points, blow, blow.holeRadiusM ?? 0);
      damage(structure, points, blow);
    },
    applyRam(structure, massTons, closingMps, priorClosingMps, blow) {
      const points = ramStructurePoints(massTons, closingMps, structure.material)
        - ramStructurePoints(massTons, Math.max(0, priorClosingMps), structure.material);
      strikeSection(structure, points, blow, 0);
      damage(structure, points, blow);
    },
    yieldTo(structure, massTons, closingMps, speedMps, blow) {
      if (!structure.collapsible) return null;
      if (structure.stage >= 3 || structure.collapsePending) return 1;
      const points = ramStructurePoints(massTons, closingMps, structure.material) * damageScale;
      if (!(points > 0) || points < structure.hp) return null;
      // the energy it took to bring the rest of it down, out of the hull's kinetic energy
      const absorbedKj = RAM_SCUFF_KJ[structure.material] + RAM_KJ_PER_POINT * (structure.hp / Math.max(damageScale, 1e-9));
      const energyKj = impactEnergyKj(massTons, speedMps);
      damage(structure, ramStructurePoints(massTons, closingMps, structure.material), blow);
      return energyKj > absorbedKj ? Math.sqrt(1 - absorbedKj / energyKj) : 0;
    },
    step() {
      tick++;
      // collapses coming down (sections on): the next storey's fall when its tick comes; the swap once all is down and
      // settled
      for (let i = 0; i < cascades.length;) {
        const cascade = cascades[i];
        if (tick < cascade.at) { i++; continue; }
        if (!cascade.settling) {
          if (fellNext(cascade)) attachOpenings(cascade.sections);
          if (standing(cascade.sections)) cascade.at = tick + collapseStoreyTicks(cascade.sections.storeyH);
          else { cascade.settling = true; cascade.at = tick + collapseStoreyTicks(cascade.sections.storeyH) + COLLAPSE_SETTLE_TICKS; }
          i++;
          continue;
        }
        collapseQueue.push(cascade.structure);
        pendingEvents.push(cascade.event);
        cascades.splice(i, 1);
      }
      let collapses = 0;
      while (collapseQueue.length && collapses < COLLAPSES_PER_TICK) {
        const structure = collapseQueue.shift()!;
        structure.stage = 3;
        structure.hp = 0;
        flipCollapse(structure);
        options.onCollapse?.(structure);
        collapses++;
      }
      // release events in order: a collapse's event only once its swap is done; stage events within the budget
      let stages = 0;
      while (pendingEvents.length) {
        const next = pendingEvents[0];
        const structure = byIdMap.get(next.structureId)!;
        if (next.stage === 'collapsed') {
          if (structure.stage !== 3) break;
        } else if (stages >= STAGE_EVENTS_PER_TICK) break;
        else stages++;
        released.push(pendingEvents.shift()!);
      }
      // holes and section falls (P2) within their own budget
      for (let breaches = 0; pendingBreaches.length && breaches < BREACH_EVENTS_PER_TICK; breaches++) {
        releasedBreaches.push(pendingBreaches.shift()!);
      }
    },
    drainEvents(out) {
      const count = released.length;
      for (let i = 0; i < count; i++) out.push(released[i]);
      released.length = 0;
      return count;
    },
    drainBreaches(out) {
      const count = releasedBreaches.length;
      for (let i = 0; i < count; i++) out.push(releasedBreaches[i]);
      releasedBreaches.length = 0;
      return count;
    },
    sectionsOf: (structure) => sectionsFor(structure),
    restoreBreach(id, section, hole, x, y, z, radiusM, sectionDown) {
      const structure = byIdMap.get(id);
      if (!structure || structure.stage >= 3) return -1;
      const sections = sectionsFor(structure);
      if (!sections) return -1;
      const local = sectionAt(sections, x, y, z);
      const index = local >= 0 ? local : section;
      if (!(index >= 0 && index < sections.count)) return -1;
      if (sectionDown) {
        if (sections.down[index]) return -1;
        fellSection(sections, index);
      } else {
        // a slot already filled is this hole again (a live event, then the log that carries it)
        if (!(hole >= 0 && hole < STRUCTURE_HOLES_PER_SECTION) || hole < sections.holeCount[index] || !(radiusM > 0)) return -1;
        openHole(sections, index, hole, x, y, z, radiusM);
      }
      attachOpenings(sections);
      return index;
    },
    restoreStage(id, stage) {
      const structure = byIdMap.get(id);
      const index = STAGE_ORDER.indexOf(stage);
      if (!structure || index < 0 || !structure.destructible) return false;
      if (index === 3 && !structure.collapsible) return false;
      if (index <= structure.stage) return true;
      // a restored stage resumes at its bound (hit points are not on the wire, §8.3)
      structure.hp = index === 0 ? structure.maxHp : index === 1 ? structure.maxHp * DAMAGED_AT
        : index === 2 ? structure.maxHp * BREACHED_AT : 0;
      structure.stage = index;
      if (index === 3) {
        structure.collapsePending = false;
        const queued = collapseQueue.indexOf(structure);
        if (queued >= 0) collapseQueue.splice(queued, 1);
        const falling = cascades.findIndex((cascade) => cascade.structure === structure);
        if (falling >= 0) cascades.splice(falling, 1);
        flipCollapse(structure);
        options.onCollapse?.(structure);
      }
      return true;
    },
  };
}
