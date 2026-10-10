/**
 * destructionDefaultKit.ts — the default structure damage kit (destruction core lane, 2026-10-07; docs/DESTRUCTION.md
 * §16). It serves every structure whose own kit (a regional house kit, a landmark) gives no plan: the base structure
 * kit's buildings, sheds, industrial halls, set pieces without a kit. `describe` reads the building's parts by bucket
 * (bounding boxes, sampled vertex colours: numbers only, cheap enough for a 400-building map); the stage builders write
 * the damage in the building's own buckets and tints, deterministically from their seeds, within the §16.3 caps:
 *
 * - damaged: two spalled patches on the ground storey's widest faces (the render knocked off a disc and the core's units
 *   showing, a lip of render round them, a backing behind; on bare masonry the units' faces broken back), chips off the
 *   walls in the outer layer's bucket, the glass gone (shards);
 * - breach: a ragged rim of the wall's own units (bricks, blocks, stones, plates) over the band 0.75 r – 1.25 r round the
 *   hole, where the presentation's blocky cut edge runs (0.8 r – 1.2 r); on a rendered wall the render broken back
 *   further (a shallow ring cut of 1.45 r with the core's units in it); the dark room behind with the floor-slab edge
 *   where the hole crosses a storey line; debris thrown along the blow. Nothing stands proud of the wall;
 * - sectionDown (P2, §3.4): a roof's covering sliding off (tiles, slates, sheet, straw); a wall panel toppling out and
 *   down in its own layers (a few big slabs, then its units, the glass in its openings) above a stub whose top is a
 *   ragged course of the wall's own units (the ground storey keeps its lowest metre, an upper storey its floor line),
 *   the room it opens dark behind (its far wall, floor and ceiling);
 * - storeyDown (P2): a storey dropping after its faces — its floor slab (joists or concrete) breaking up into the storey
 *   below with what stood on it;
 * - collapse: ragged wall stubs (taller at a masonry building's corners), a heap of chunks in the building's own buckets
 *   seated on the sim's mound, and the falling debris.
 *
 * Frames are the body frame (destructionKit.ts). Registered as 'default' on import (the world's seam imports it).
 */
import type { BufferGeometry } from 'three';
import { STRUCTURE_WALL_STUB_M } from './collision.ts';
import {
  bodyMoundHeightAt, damageRng, holeOutlineK, registerStructureDamageKit,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamageOpening, type DamagePieceWriter,
  type DamageRoof, type DamageStageResult, type DamageStorey, type DamageWriters, type DebrisShape, type FaceName,
  type FractureMaterial, type FractureSlot, type Rgb, type StructureCut, type StructureDamageAnatomy, type StructureDamageKit,
  type StructureDescribeInput, type Vec3,
} from './destructionKit.ts';

/** What the default describe needs of a map's regional style (maps/regional/types.ts ArchitectureSurfaces). */
export interface DefaultKitStyle {
  stoneKind?: string;
  roofKind?: string;
  concrete?: boolean;
  earth?: boolean;
}

let styleOf: (style: string | null) => DefaultKitStyle | null = () => null;
/** The world builder registers how a style id reads (props.ts: from the map's regional architecture). */
export function setDefaultKitStyleReader(reader: (style: string | null) => DefaultKitStyle | null): void {
  styleOf = reader;
}

const ROOM: Rgb = [0.032, 0.028, 0.025];
const TIMBER: Rgb = [0.36, 0.27, 0.19];
const WHITE: Rgb = [1, 1, 1];
const STOREY_M = 3;
const FACE_ORDER: readonly FaceName[] = ['front', 'right', 'back', 'left'];
const OPEN_SHELLS = /barn|granary|shed|depot|mill|warehouse|hangar|garage|stable|hall|works|factory|foundry|silo/i;
const WALL_BUCKETS = ['regionalStone', 'stone', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'plaster', 'plaster2',
  'plaster3', 'structureMetal', 'steel', 'wood', 'structureWood', 'baked', 'dark'] as const;
const ROOF_BUCKETS = new Set(['roof', 'regionalRoof']);

// ---- describe ----------------------------------------------------------------------------------------------------

interface BucketSummary {
  area: number;
  minY: number;
  maxY: number;
  tint: [number, number, number];
  tinted: number;
}

/** Bounding-box surface area and a sampled mean vertex colour per bucket (64 vertices a part at most). */
function summarize(parts: Readonly<Record<string, readonly BufferGeometry[]>>): Map<string, BucketSummary> {
  const out = new Map<string, BucketSummary>();
  for (const [bucket, list] of Object.entries(parts)) {
    for (const geometry of list ?? []) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box || box.isEmpty()) continue;
      const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
      const entry = out.get(bucket) ?? { area: 0, minY: Infinity, maxY: -Infinity, tint: [0, 0, 0], tinted: 0 };
      entry.area += 2 * (sx * sy + sy * sz + sz * sx);
      entry.minY = Math.min(entry.minY, box.min.y);
      entry.maxY = Math.max(entry.maxY, box.max.y);
      const color = geometry.getAttribute('color');
      if (color) {
        const step = Math.max(1, Math.floor(color.count / 64));
        for (let i = 0; i < color.count; i += step) {
          entry.tint[0] += color.getX(i); entry.tint[1] += color.getY(i); entry.tint[2] += color.getZ(i);
          entry.tinted++;
        }
      }
      out.set(bucket, entry);
    }
  }
  return out;
}

const tintOf = (summary: BucketSummary | undefined): Rgb => (summary && summary.tinted
  ? [summary.tint[0] / summary.tinted, summary.tint[1] / summary.tinted, summary.tint[2] / summary.tinted] : WHITE);

function wallLayers(bucket: string, tint: Rgb, style: DefaultKitStyle | null): FractureSlot[] {
  if (bucket === 'regionalStone' || bucket === 'stone') {
    const kind = style?.stoneKind;
    const material: FractureMaterial = kind === 'brick' ? 'brick' : kind === 'block' ? 'concrete'
      : kind === 'rubble' || kind === 'fieldstone' || kind === 'greywacke' ? 'rubble' : 'stone';
    return [{ material, bucket, tint, thicknessM: 0.45, share: 1 }];
  }
  if (bucket === 'wood' || bucket === 'structureWood' || bucket === 'dark') return [{ material: 'plank', bucket, tint, thicknessM: 0.1, share: 1 }];
  if (bucket === 'structureMetal' || bucket === 'steel') return [{ material: 'metal', bucket, tint, thicknessM: 0.02, share: 1 }];
  if (bucket === 'baked') return [{ material: 'concrete', bucket, tint, thicknessM: 0.25, share: 1 }];
  // render over its core: concrete where the style pours it, earth in the earth kits, else rubble masonry
  if (style?.concrete && /plaster2/i.test(bucket)) return [{ material: 'concrete', bucket, tint, thicknessM: 0.25, share: 1 }];
  const core: FractureMaterial = style?.earth ? 'adobe' : style?.stoneKind === 'brick' ? 'brick' : 'rubble';
  return [
    { material: 'plaster', bucket, tint, thicknessM: 0.03, share: 1 },
    { material: core, bucket: core === 'adobe' ? bucket : 'stone', tint: core === 'adobe' ? tint : WHITE, thicknessM: 0.4, share: 1 },
  ];
}

function roofCovering(bucket: string, tint: Rgb, style: DefaultKitStyle | null): FractureSlot {
  if (bucket === 'straw') return { material: 'thatch', bucket, tint, thicknessM: 0.35, share: 1 };
  const kind = style?.roofKind;
  const material: FractureMaterial = kind === 'slate' ? 'slate' : kind === 'sheet' || kind === 'asbestos' ? 'metal'
    : kind === 'shingle' ? 'plank' : 'tile';
  return { material, bucket, tint, thicknessM: material === 'metal' ? 0.01 : 0.04, share: 1 };
}

/** The four faces of a w × d body on a storey (house.ts bodyFaces: front +Z, right +X, back −Z, left −X). */
function storeyFaces(w: number, d: number, y0: number, height: number, section0: number, layers: FractureSlot[], bucket: string): DamageFace[] {
  const faces: Record<FaceName, { origin: Vec3; u: Vec3; out: Vec3; width: number }> = {
    front: { origin: [0, y0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w },
    right: { origin: [w / 2, y0, 0], u: [0, 0, -1], out: [1, 0, 0], width: d },
    back: { origin: [0, y0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    left: { origin: [-w / 2, y0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  };
  return FACE_ORDER.map((name, i) => ({ name, ...faces[name], height, section: section0 + i, bucket, layers,
    openings: [], members: [], masonry: null }));
}

/** Glass parts' boxes as openings on the nearest face of their storey. */
function placeOpenings(parts: Readonly<Record<string, readonly BufferGeometry[]>>, storeys: DamageStorey[]): void {
  for (const geometry of parts.glass ?? []) {
    const box = geometry.boundingBox;
    if (!box || box.isEmpty()) continue;
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
    const storey = storeys.find((s) => cy >= s.y0 && cy < s.y1) ?? storeys[storeys.length - 1];
    if (!storey) continue;
    let best: DamageFace | null = null, bestGap = Infinity;
    for (const face of storey.faces) {
      const gap = Math.abs((cx - face.origin[0]) * face.out[0] + (cz - face.origin[2]) * face.out[2]);
      if (gap < bestGap) { bestGap = gap; best = face; }
    }
    if (!best || bestGap > 1.5) continue;
    const u = (cx - best.origin[0]) * best.u[0] + (cz - best.origin[2]) * best.u[2];
    const extent = Math.abs(best.u[0]) > 0.5 ? box.max.x - box.min.x : box.max.z - box.min.z;
    const opening: DamageOpening = { kind: 'window', u, w: Math.max(0.3, extent), y0: box.min.y - storey.y0,
      h: Math.max(0.3, box.max.y - box.min.y), reveal: 0.2 };
    best.openings.push(opening);
  }
}

export function describeDefault(input: StructureDescribeInput): StructureDamageAnatomy {
  const style = styleOf(input.style);
  const summary = summarize(input.parts);
  let wallBucket = 'stone', wallArea = -1;
  for (const bucket of WALL_BUCKETS) {
    const entry = summary.get(bucket);
    if (entry && entry.area > wallArea) { wallArea = entry.area; wallBucket = bucket; }
  }
  const roofBucket = [...summary.keys()].find((bucket) => ROOF_BUCKETS.has(bucket)) ?? (summary.has('straw') ? 'straw' : null);
  const roofEntry = roofBucket ? summary.get(roofBucket) : undefined;
  let top = 0;
  for (const entry of summary.values()) top = Math.max(top, entry.maxY);
  const height = Math.max(1, Number.isFinite(input.h) && input.h > 0 ? Math.max(input.h, top) : top);
  const eave = roofEntry && roofEntry.minY > 1 ? Math.min(roofEntry.minY, height) : height;
  const count = Math.max(1, Math.min(12, Math.round(eave / STOREY_M)));
  const storeyH = eave / count;
  const wallTint = tintOf(summary.get(wallBucket));
  const layers = wallLayers(wallBucket, wallTint, style);
  const concrete = layers.some((slot) => slot.material === 'concrete');
  const storeys: DamageStorey[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = i * storeyH;
    storeys.push({
      index: i, y0, y1: y0 + storeyH, jetty: [0, 0, 0, 0], framed: false,
      faces: storeyFaces(input.w, input.d, y0, storeyH, i * 4, layers, wallBucket),
      floor: i === 0 ? null : {
        thicknessM: concrete ? 0.25 : 0.22,
        structure: concrete
          ? { material: 'concrete', bucket: wallBucket, tint: wallTint, thicknessM: 0.25, share: 1 }
          : { material: 'timber', bucket: 'wood', tint: TIMBER, thicknessM: 0.22, share: 1 },
        joistPitchM: concrete ? 0 : 0.6,
      },
    });
  }
  placeOpenings(input.parts, storeys);
  let roof: DamageRoof | null = null;
  if (roofBucket && roofEntry) {
    const rise = Math.max(0, roofEntry.maxY - eave);
    const half = Math.max(0.5, Math.min(input.w, input.d) / 2);
    roof = {
      kind: rise > 0.6 ? 'gable' : 'flat', section: count * 4, pitchDeg: Math.atan2(rise, half) * 180 / Math.PI,
      eaveY: eave, ridgeY: Math.max(eave, roofEntry.maxY), thicknessM: 0.2,
      covering: roofCovering(roofBucket, tintOf(roofEntry), style),
      structure: concrete
        ? { material: 'concrete', bucket: wallBucket, tint: wallTint, thicknessM: 0.2, share: 1 }
        : { material: 'timber', bucket: 'wood', tint: TIMBER, thicknessM: 0.16, share: 1 },
      battenPitchM: 0.35, rafterPitchM: 0.9, slabs: [],
    };
  }
  const masonry = layers.some((slot) => slot.material === 'brick' || slot.material === 'stone' || slot.material === 'rubble'
    || slot.material === 'concrete' || slot.material === 'adobe');
  const rubble: FractureSlot[] = [];
  for (const slot of layers) rubble.push({ ...slot, share: slot.material === 'plaster' ? 0.1 : 0.6 });
  if (roof) rubble.push({ ...roof.covering, share: 0.2 });
  if (summary.has('wood') || summary.has('structureWood')) {
    rubble.push({ material: 'timber', bucket: summary.has('wood') ? 'wood' : 'structureWood', tint: TIMBER, thicknessM: 0.2, share: 0.1 });
  }
  return {
    structureIdx: input.structureIdx, kit: 'default', seed: input.seed, massClass: input.massClass,
    placement: input.placement, w: input.w, d: input.d, h: height,
    plinth: null, storeys, roof, chimneys: [],
    interior: { color: ROOM, open: OPEN_SHELLS.test(input.builder) },
    rubble,
    remnant: { stubHeightM: Math.min(1.4, 0.3 * eave), corners: masonry, chimneys: false },
  };
}

// ---- shared writing helpers --------------------------------------------------------------------------------------

/** A box (a chunk, a stub, a slab edge) as 12 triangles: centre, half extents along the body axes, yaw about +Y. */
function writeBox(out: DamageMeshWriter, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number,
  tint: Rgb, shade = 1): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const corner = (sx: number, sy: number, sz: number): Vec3 => {
    const lx = sx * hx, lz = sz * hz;
    return [cx + lx * c + lz * s, cy + sy * hy, cz - lx * s + lz * c];
  };
  const faces: Array<[Vec3, [number, number, number][]]> = [
    [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
    [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
    [[1, 0, 0], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]],
    [[0, 0, 1], [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]]],
    [[0, 0, -1], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]],
  ];
  const r = tint[0] * shade, g = tint[1] * shade, b = tint[2] * shade;
  for (const [n, quad] of faces) {
    const nx = n[0] * c + n[2] * s, nz = -n[0] * s + n[2] * c;
    const ids = quad.map(([sx, sy, sz], i) => {
      const p = corner(sx, sy, sz);
      return out.vertex(p[0], p[1], p[2], nx, n[1], nz, i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0, r, g, b);
    });
    out.triangle(ids[0]!, ids[1]!, ids[2]!);
    out.triangle(ids[0]!, ids[2]!, ids[3]!);
  }
}

const VERTS_PER_BOX = 24;

/** The writer's room for `boxes` more boxes. */
const roomFor = (out: DamageMeshWriter, boxes: number): boolean => out.vertices + boxes * VERTS_PER_BOX <= out.capacity;

function unitOf(material: FractureMaterial): { shape: DebrisShape; size: number } {
  switch (material) {
    case 'brick': return { shape: 'brick', size: 0.24 };
    case 'stone': return { shape: 'block', size: 0.4 };
    case 'rubble': return { shape: 'stone', size: 0.3 };
    case 'concrete': return { shape: 'plate', size: 0.45 };
    case 'adobe': return { shape: 'clod', size: 0.3 };
    case 'plaster': return { shape: 'plate', size: 0.25 };
    case 'timber': return { shape: 'beam', size: 0.6 };
    case 'plank': return { shape: 'splinter', size: 0.5 };
    case 'metal': return { shape: 'sheet', size: 0.6 };
    case 'glass': return { shape: 'shard', size: 0.12 };
    case 'tile': return { shape: 'tile', size: 0.3 };
    case 'slate': return { shape: 'slate', size: 0.3 };
    case 'thatch': return { shape: 'straw', size: 0.5 };
    case 'earth': return { shape: 'clod', size: 0.4 };
    default: return { shape: 'chunk', size: 0.3 };
  }
}

function pushPiece(out: DamagePieceWriter, slot: FractureSlot, rng: () => number, x: number, y: number, z: number,
  vx: number, vy: number, vz: number, scale = 1): boolean {
  const unit = unitOf(slot.material);
  const size = unit.size * scale * (0.7 + rng() * 0.6);
  // a uniformly random orientation (Shoemake): a unit quaternion from three draws
  const u1 = rng(), u2 = rng() * Math.PI * 2, u3 = rng() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  const flat = unit.shape === 'plate' || unit.shape === 'sheet' || unit.shape === 'tile' || unit.shape === 'slate';
  return out.push(slot.bucket, unit.shape, Math.floor(rng() * 4), x, y, z,
    a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3),
    size, size * (flat ? 0.15 : 0.6), size * 0.8,
    slot.tint[0], slot.tint[1], slot.tint[2], vx, vy, vz);
}

function faceOf(anatomy: StructureDamageAnatomy, storeyIndex: number, name: FaceName): { storey: DamageStorey; face: DamageFace } | null {
  const storey = anatomy.storeys[Math.max(0, Math.min(anatomy.storeys.length - 1, storeyIndex))];
  const face = storey?.faces.find((f) => f.name === name);
  return storey && face ? { storey, face } : null;
}

const thicknessOf = (face: DamageFace): number => face.layers.reduce((sum, slot) => sum + slot.thicknessM, 0) || 0.3;

/**
 * Units of `slot` laid in courses over the annulus `inner`–`outer` (inner 0: the disc) round (cx, cy, cz) on `face`, each
 * course filling its chords with whole units, its ends stepped a little; set `fromM`–`toM` behind the face plane. Stops at
 * the writer's cap; skips courses under the ground.
 */
function layCourses(mesh: DamageMeshWriter, face: DamageFace, slot: FractureSlot, rng: () => number, cx: number, cy: number,
  cz: number, inner: number, outer: number, unitW: number, unitH: number, fromM: number, toM: number, shade: number): void {
  const yaw = Math.atan2(face.out[0], face.out[2]);
  const rows = Math.ceil((2 * outer) / unitH);
  for (let row = 0; row < rows && roomFor(mesh, 1); row++) {
    const ly = -outer + (row + 0.5) * unitH;
    if (cy + ly - unitH * 0.5 < 0.02) continue;
    const outerHalf = Math.sqrt(Math.max(0, outer * outer - ly * ly));
    const innerHalf = Math.abs(ly) < inner ? Math.sqrt(inner * inner - ly * ly) : 0;
    const chords: Array<[number, number]> = innerHalf > 0 ? [[-outerHalf, -innerHalf], [innerHalf, outerHalf]] : [[-outerHalf, outerHalf]];
    for (const [from, to] of chords) {
      const a = from - rng() * outer * 0.04, b = to + rng() * outer * 0.04;
      const n = Math.max(1, Math.round((b - a) / unitW)), w = (b - a) / n;
      for (let i = 0; i < n && roomFor(mesh, 1); i++) {
        const lu = a + (i + 0.5) * w;
        // a unit's depth stays inside fromM – toM (its centre wanders a tenth of the span, its half depth is 0.4 of it), so
        // nothing stands proud of the wall's plane: a tier that cuts nothing shows none of it
        const along = -(fromM + (toM - fromM) * (0.5 + (rng() - 0.5) * 0.2));
        writeBox(mesh, cx + face.u[0] * lu + face.out[0] * along, cy + ly, cz + face.u[2] * lu + face.out[2] * along,
          w * 0.5 * (1 + rng() * 0.08), unitH * 0.5 * (0.96 + rng() * 0.08), Math.max(0.004, (toM - fromM) * 0.4),
          yaw + (rng() - 0.5) * 0.04, slot.tint, shade * (0.8 + rng() * 0.2));
      }
    }
  }
}

/**
 * Units of `slot` laid in courses round (cx, cy, cz) on `face` over a ragged annulus: at angle θ (atan2(up, along u)) a
 * unit stands when its distance lies between `inner`·k(θ) and `outer`·k(θ), and inside `arcs` when given ([start, span]
 * radians each). Each course's runs of units (its chords) are kept or dropped whole — `dropShare` of them dropped — so
 * the rim breaks; set `fromM`–`toM` behind the face plane. Stops at the writer's cap; skips courses under the ground.
 */
function layRaggedCourses(mesh: DamageMeshWriter, face: DamageFace, slot: FractureSlot, rng: () => number, cx: number, cy: number,
  cz: number, inner: number, outer: number, unitW: number, unitH: number, fromM: number, toM: number, shade: number,
  k: (theta: number) => number, dropShare: number, arcs: ReadonlyArray<readonly [number, number]> | null): void {
  const yaw = Math.atan2(face.out[0], face.out[2]);
  let kMax = 0;
  for (let a = 0; a < 48; a++) kMax = Math.max(kMax, k((a / 48) * Math.PI * 2));
  const reach = outer * kMax;
  const rows = Math.ceil((2 * reach) / unitH);
  const cols = Math.ceil((2 * reach) / unitW) + 1;
  const inArcs = (theta: number): boolean => {
    if (!arcs) return true;
    for (const [start, span] of arcs) {
      const d = ((theta - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (d <= span) return true;
    }
    return false;
  };
  for (let row = 0; row < rows && roomFor(mesh, 1); row++) {
    const ly = -reach + (row + 0.5) * unitH;
    if (cy + ly - unitH * 0.5 < 0.02) continue;
    const stagger = (row % 2 ? 0.5 : 0) * unitW + (rng() - 0.5) * unitW * 0.2;
    let inRun = false, keep = true;
    for (let i = 0; i < cols && roomFor(mesh, 1); i++) {
      const lu = -reach + (i - 0.5) * unitW + stagger;
      const rho = Math.hypot(lu, ly), theta = Math.atan2(ly, lu), kk = k(theta);
      if (!(rho >= inner * kk && rho <= outer * kk && inArcs(theta))) { inRun = false; continue; }
      if (!inRun) { inRun = true; keep = rng() >= dropShare; }
      if (!keep) continue;
      // a unit's depth stays inside fromM – toM (as layCourses): nothing stands proud of the wall's plane
      const along = -(fromM + (toM - fromM) * (0.5 + (rng() - 0.5) * 0.2));
      writeBox(mesh, cx + face.u[0] * lu + face.out[0] * along, cy + ly, cz + face.u[2] * lu + face.out[2] * along,
        unitW * 0.5 * (0.92 + rng() * 0.12), unitH * 0.5 * (0.96 + rng() * 0.08), Math.max(0.004, (toM - fromM) * 0.4),
        yaw + (rng() - 0.5) * 0.06, slot.tint, shade * (0.8 + rng() * 0.2));
    }
  }
}

const SPALLING: ReadonlySet<FractureMaterial> = new Set(['plaster', 'brick', 'stone', 'rubble', 'concrete', 'adobe']);

// ---- stages ------------------------------------------------------------------------------------------------------

function damaged(anatomy: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult {
  const rng = damageRng(seed);
  const pieces = out.pieces;
  const mesh = out.mesh;
  const cuts: StructureCut[] = [];
  // spalled patches: the ground storey's two widest masonry faces, each a disc clear of its openings
  const ground = anatomy.storeys[0];
  const faces = ground ? [...ground.faces].filter((face) => face.width >= 2.5 && face.layers.length
    && SPALLING.has(face.layers[0]!.material)).sort((a, b) => b.width - a.width).slice(0, 2) : [];
  for (const face of faces) {
    const skin = face.layers[0]!, core = face.layers[face.layers.length - 1]!;
    const rendered = skin !== core;
    const radius = 0.3 + rng() * 0.2;
    let centre: [number, number] | null = null;
    for (let attempt = 0; attempt < 6 && !centre; attempt++) {
      const u = (rng() - 0.5) * Math.max(0, face.width - 2 * radius - 0.6);
      const y = 0.45 + radius + rng() * Math.max(0, face.height - 2 * radius - 0.75);
      const clear = face.openings.every((o) => Math.abs(u - o.u) > o.w / 2 + radius + 0.25
        || y + radius + 0.25 < o.y0 || y - radius - 0.25 > o.y0 + o.h);
      if (clear) centre = [u, y];
    }
    if (!centre) continue;
    const cx = face.origin[0] + face.u[0] * centre[0], cz = face.origin[2] + face.u[2] * centre[0], cy = ground!.y0 + centre[1];
    const unit = unitOf(core.material).size;
    const unitW = Math.max(unit, radius * 0.7), unitH = unitW * 0.5;
    const skinM = rendered ? skin.thicknessM : 0;
    const yaw = Math.atan2(face.out[0], face.out[2]);
    // the core's units showing (their faces broken back a little on bare masonry), a backing behind them, and the
    // render's lip round the knocked-off disc
    if (mesh.begin(core.bucket, 'rim')) {
      layCourses(mesh, face, core, rng, cx, cy, cz, 0, radius, unitW, unitH, skinM + (rendered ? 0.005 : 0.025), skinM + 0.07, 0.85);
      if (roomFor(mesh, 1)) {
        writeBox(mesh, cx - face.out[0] * (skinM + 0.08), cy, cz - face.out[2] * (skinM + 0.08), radius * 1.1, radius * 1.1, 0.01,
          yaw, core.tint, 0.45);
      }
      mesh.end();
    }
    if (rendered && mesh.begin(skin.bucket, 'rim')) {
      layCourses(mesh, face, skin, rng, cx, cy, cz, radius * 0.95, radius * 1.12, Math.max(0.12, radius * 0.45), Math.max(0.06, radius * 0.22),
        0.002, skinM, 1);
      mesh.end();
    }
    cuts.push({ x: cx, y: cy, z: cz, nx: face.out[0], nz: face.out[2], radiusM: radius, depthM: skinM + 0.03, outsideM: 0.01 });
  }
  // chips off the walls: a few spalls a face on the ground storey and the next
  for (const storey of anatomy.storeys.slice(0, 2)) {
    for (const face of storey.faces) {
      const slot = face.layers[0];
      if (!slot) continue;
      for (let k = 0; k < 3 && pieces.count < pieces.capacity; k++) {
        const u = (rng() - 0.5) * face.width * 0.9, y = storey.y0 + rng() * face.height;
        const x = face.origin[0] + face.u[0] * u + face.out[0] * 0.05, z = face.origin[2] + face.u[2] * u + face.out[2] * 0.05;
        pushPiece(pieces, slot, rng, x, y, z, face.out[0] * (0.5 + rng()), 0.5 + rng(), face.out[2] * (0.5 + rng()), 0.6);
      }
      // the glass in its openings breaks out
      for (const opening of face.openings) {
        const glass: FractureSlot = { material: 'glass', bucket: 'glass', tint: WHITE, thicknessM: 0.01, share: 1 };
        for (let k = 0; k < 2 && pieces.count < pieces.capacity; k++) {
          const u = opening.u + (rng() - 0.5) * opening.w, y = storey.y0 + opening.y0 + rng() * opening.h;
          pushPiece(pieces, glass, rng, face.origin[0] + face.u[0] * u + face.out[0] * 0.1, y,
            face.origin[2] + face.u[2] * u + face.out[2] * 0.1, face.out[0] * (1 + rng()), rng(), face.out[2] * (1 + rng()));
        }
      }
    }
  }
  return { cuts, hides: [{ section: null, partClass: 'glass' }] };
}

function breach(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: DamageWriters): DamageStageResult {
  const rng = damageRng(hole.seed);
  const located = faceOf(anatomy, hole.storey, hole.face);
  if (!located) return { cuts: [], hides: [] };
  const { storey, face } = located;
  const depth = thicknessOf(face);
  const cx = face.origin[0] + face.u[0] * hole.u, cz = face.origin[2] + face.u[2] * hole.u;
  const cy = storey.y0 + hole.y;
  const radius = Math.max(0.15, hole.radiusM);
  const mesh = out.mesh;
  // the rim: the wall's own units laid in courses over the band the cut's edge runs in, following the hole's ragged
  // outline (holeOutlineK, the FX lane's cut follows the same lobes: 0.75–1.25 of the edge's own distance at each
  // angle), set into the wall's thickness (a broken masonry edge steps along its courses), about a third of its course
  // chords dropped so the rim breaks (wave 277: "a neat round dark ring, like a porthole"); a big hole's units grow with
  // it so the band stays within the cap
  const slot = face.layers[face.layers.length - 1] ?? face.layers[0]!;
  const skin = face.layers[0]!;
  const unitW = Math.max(unitOf(slot.material).size, radius * 0.4), unitH = unitW * 0.5;
  const edge = (theta: number): number => holeOutlineK(theta, hole.seed) / 0.8;
  if (mesh.begin(slot.bucket, 'rim')) {
    layRaggedCourses(mesh, face, slot, rng, cx, cy, cz, radius * 0.75, radius * 1.25, unitW, unitH, depth * 0.1, depth * 0.9, 0.95,
      edge, 1 / 3, null);
    mesh.end();
  }
  // a rendered wall's render broken back round the hole: a shallow ring cut wider than the hole with the core's units
  // showing in it just behind the render's plane, laid as two or three broken arcs round the ragged edge, not a full
  // ring. Nothing stands proud of the wall, so a tier that cuts nothing shows none of it
  const ring = skin !== slot ? radius * 1.45 : 0;
  if (ring > 0 && mesh.begin(slot.bucket, 'rim')) {
    const unitR = Math.max(unitOf(slot.material).size, radius * 0.6);
    const arcs: Array<[number, number]> = [];
    const count = 2 + (rng() < 0.5 ? 1 : 0);
    let start = rng() * Math.PI * 2;
    for (let a = 0; a < count; a++) {
      const span = (0.3 + rng() * 0.25) * Math.PI * (3 / count);
      arcs.push([start, span]);
      start += (Math.PI * 2) / count + (rng() - 0.5) * 0.6;
    }
    layRaggedCourses(mesh, face, slot, rng, cx, cy, cz, radius, ring * 1.2, unitR, unitR * 0.5, skin.thicknessM + 0.004,
      skin.thicknessM + 0.07, 0.85, edge, 0.2, arcs);
    mesh.end();
  }
  // the room behind it: a dark backing, and the slab edge where the hole crosses a storey line
  if (mesh.begin('dark', 'room')) {
    const yaw = Math.atan2(face.out[0], face.out[2]);
    const back = anatomy.interior.open ? -Math.min(anatomy.w, anatomy.d) * 0.9 : -depth - 0.6;
    writeBox(mesh, cx + face.out[0] * back, cy, cz + face.out[2] * back, radius * 1.5, radius * 1.5, 0.05, yaw, anatomy.interior.color);
    for (const s of anatomy.storeys) {
      if (!s.floor || Math.abs(s.y0 - cy) > radius) continue;
      const half = Math.sqrt(Math.max(0, radius * radius - (s.y0 - cy) ** 2));
      writeBox(mesh, cx + face.out[0] * (-depth - 0.3), s.y0, cz + face.out[2] * (-depth - 0.3), half, s.floor.thicknessM / 2, 0.3, yaw,
        s.floor.structure.tint, 0.8);
    }
    mesh.end();
  }
  // debris thrown along the blow
  const pieces = out.pieces;
  const dirX = Number.isFinite(hole.dirX) ? hole.dirX : -face.out[0], dirZ = Number.isFinite(hole.dirZ) ? hole.dirZ : -face.out[2];
  for (let k = 0; k < 24 && pieces.count < pieces.capacity; k++) {
    const a = rng() * Math.PI * 2, reach = radius * Math.sqrt(rng());
    const speed = 2 + rng() * (hole.cause === 'kinetic' ? 4 : 7);
    pushPiece(pieces, k % 4 === 0 ? skin : slot, rng, cx + face.u[0] * Math.cos(a) * reach, cy + Math.sin(a) * reach, cz + face.u[2] * Math.cos(a) * reach,
      dirX * speed + (rng() - 0.5) * 2, 1 + rng() * 3, dirZ * speed + (rng() - 0.5) * 2);
  }
  // the ring first, the hole last (the newest cut a ring buffer keeps)
  const hole0: StructureCut = { x: cx, y: cy, z: cz, nx: face.out[0], nz: face.out[2], radiusM: radius, depthM: depth + 0.2, outsideM: 0.3 };
  return {
    cuts: ring > 0
      ? [{ x: cx, y: cy, z: cz, nx: face.out[0], nz: face.out[2], radiusM: ring, depthM: skin.thicknessM + 0.02, outsideM: 0.01 }, hole0]
      : [hole0],
    hides: [],
  };
}

/**
 * A wall panel falls (P2, §3.4): the face's slab above its stub (the ground storey keeps its lowest metre, as the sim's
 * openings do; an upper storey's panel goes to its floor line). What stands is a stub whose top is a ragged course of
 * the wall's core units, set in its thickness; the room it opens shows dark behind (its far wall, its floor, and the
 * ceiling where a storey stands above); the panel itself topples out and down in its own layers — a few big slabs of it
 * first, then its units — and its windows' glass with it. The presentation clamps the panel's intact geometry down to
 * the stub (the hide names the face's section).
 */
function wallPanelDown(anatomy: StructureDamageAnatomy, storey: DamageStorey, face: DamageFace, rng: () => number,
  out: DamageWriters): DamageStageResult {
  const stubTop = storey.index === 0 ? storey.y0 + Math.min(STRUCTURE_WALL_STUB_M, face.height * 0.5) : storey.y0;
  const top = storey.y0 + face.height;
  const depth = thicknessOf(face);
  const skin = face.layers[0]!, core = face.layers[face.layers.length - 1] ?? skin;
  const yaw = Math.atan2(face.out[0], face.out[2]);
  const at = (u: number, inward: number): [number, number] =>
    [face.origin[0] + face.u[0] * u - face.out[0] * inward, face.origin[2] + face.u[2] * u - face.out[2] * inward];
  const mesh = out.mesh;
  // the stub's broken top: the core's units along the face in one course, stepped up a second here and there
  if (mesh.begin(core.bucket, 'remnant')) {
    const unitW = Math.max(0.2, unitOf(core.material).size), unitH = unitW * 0.5;
    const n = Math.max(1, Math.round(face.width / unitW)), w = face.width / n;
    for (let i = 0; i < n && roomFor(mesh, 2); i++) {
      const u = -face.width / 2 + (i + 0.5) * w;
      const courses = rng() < 0.4 ? 2 : 1;
      for (let c = 0; c < courses; c++) {
        const [x, z] = at(u + (rng() - 0.5) * w * 0.1, depth * (0.5 + (rng() - 0.5) * 0.1));
        writeBox(mesh, x, stubTop + (c + 0.5) * unitH * (0.85 + rng() * 0.3) - unitH * 0.35, z,
          w * 0.5 * (0.88 + rng() * 0.1), unitH * 0.5, depth * 0.4, yaw + (rng() - 0.5) * 0.06, core.tint, 0.78 + rng() * 0.2);
      }
    }
    mesh.end();
  }
  // the room it opens: dark at its far wall (an open shell's far side), its floor and, under a storey, its ceiling
  if (mesh.begin('dark', 'room')) {
    const across = Math.abs(face.out[0]) > Math.abs(face.out[2]) ? anatomy.w : anatomy.d;
    const back = anatomy.interior.open ? across * 0.9 : Math.max(depth + 0.6, across - depth - 0.1);
    const cy = (stubTop + top) / 2, hy = Math.max(0.05, (top - stubTop) / 2);
    const [bx, bz] = at(0, back);
    writeBox(mesh, bx, cy, bz, face.width / 2, hy, 0.05, yaw, anatomy.interior.color);
    const [fx, fz] = at(0, back / 2);
    writeBox(mesh, fx, storey.y0 + 0.02, fz, face.width / 2, 0.02, back / 2, yaw, anatomy.interior.color, 1.4);
    if (anatomy.storeys[storey.index + 1]) writeBox(mesh, fx, top - 0.02, fz, face.width / 2, 0.02, back / 2, yaw, anatomy.interior.color, 0.8);
    mesh.end();
  }
  // the panel topples: its big slabs first, then its units in its own layers (the render one in four), out and down
  const pieces = out.pieces;
  const height = Math.max(0.1, top - stubTop);
  const count = Math.min(160, Math.max(40, Math.round(face.width * height * 5)));
  for (let k = 0; k < count && pieces.count < pieces.capacity; k++) {
    const u = (rng() - 0.5) * face.width, y = stubTop + rng() * height;
    const [x, z] = at(u, -0.05);
    const outward = 0.6 + rng() * 1.6 + (y - stubTop) * 0.25;
    pushPiece(pieces, k % 4 === 0 ? skin : core, rng, x, y, z,
      face.out[0] * outward + face.u[0] * (rng() - 0.5) * 0.6, -rng() * 0.8,
      face.out[2] * outward + face.u[2] * (rng() - 0.5) * 0.6, k < 6 ? 3 + rng() * 2 : 1);
  }
  const glass: FractureSlot = { material: 'glass', bucket: 'glass', tint: WHITE, thicknessM: 0.01, share: 1 };
  for (const opening of face.openings) {
    if (storey.y0 + opening.y0 + opening.h < stubTop) continue;
    for (let k = 0; k < 4 && pieces.count < pieces.capacity; k++) {
      const u = opening.u + (rng() - 0.5) * opening.w, y = storey.y0 + opening.y0 + rng() * opening.h;
      const [x, z] = at(u, -0.1);
      pushPiece(pieces, glass, rng, x, y, z, face.out[0] * (1 + rng()), rng(), face.out[2] * (1 + rng()));
    }
  }
  return { cuts: [], hides: [{ section: face.section, partClass: null }] };
}

function sectionDown(anatomy: StructureDamageAnatomy, section: number, seed: number, out: DamageWriters): DamageStageResult {
  const rng = damageRng(seed);
  const roof = anatomy.roof;
  if (!roof || roof.section !== section) {
    for (const storey of anatomy.storeys) {
      const face = storey.faces.find((candidate) => candidate.section === section);
      if (face && face.layers.length) return wallPanelDown(anatomy, storey, face, rng, out);
    }
    return { cuts: [], hides: [] };
  }
  const pieces = out.pieces;
  // the covering slides off and falls: its own units across the roof's plan, thrown outward a little
  for (let k = 0; k < 120 && pieces.count < pieces.capacity; k++) {
    const x = (rng() - 0.5) * anatomy.w, z = (rng() - 0.5) * anatomy.d;
    const y = roof.eaveY + (roof.ridgeY - roof.eaveY) * (1 - Math.abs(x) / Math.max(0.5, anatomy.w / 2)) * rng();
    pushPiece(pieces, roof.covering, rng, x, y, z, x * 0.3 + (rng() - 0.5), rng(), z * 0.3 + (rng() - 0.5));
  }
  return { cuts: [], hides: [{ section: null, partClass: 'roof' }] };
}

/**
 * A storey drops after its faces (P2): its floor slab — an upper storey's joists or concrete — breaks up and falls into
 * the storey below, with what stood on it (the building's pile materials, a share each). The presentation clamps the
 * storey's band down to its floor line; the hides name its faces' sections.
 */
function storeyDown(anatomy: StructureDamageAnatomy, storeyIndex: number, seed: number, out: DamageWriters): DamageStageResult {
  const rng = damageRng(seed);
  const storey = anatomy.storeys[storeyIndex];
  if (!storey) return { cuts: [], hides: [] };
  const pieces = out.pieces;
  const halfW = anatomy.w / 2 * 0.9, halfD = anatomy.d / 2 * 0.9;
  if (storey.floor) {
    const slot = storey.floor.structure;
    for (let k = 0; k < 90 && pieces.count < pieces.capacity; k++) {
      pushPiece(pieces, slot, rng, (rng() * 2 - 1) * halfW, storey.y0, (rng() * 2 - 1) * halfD,
        (rng() - 0.5) * 0.8, -0.5 - rng() * 1.5, (rng() - 0.5) * 0.8, k < 8 ? 2.5 : 1);
    }
  }
  for (let k = 0; k < 60 && pieces.count < pieces.capacity && anatomy.rubble.length; k++) {
    const slot = anatomy.rubble[k % anatomy.rubble.length]!;
    pushPiece(pieces, slot, rng, (rng() * 2 - 1) * halfW, storey.y0 + rng() * (storey.y1 - storey.y0), (rng() * 2 - 1) * halfD,
      (rng() - 0.5) * 0.6, -1 - rng() * 2, (rng() - 0.5) * 0.6);
  }
  return { cuts: [], hides: storey.faces.map((face) => ({ section: face.section, partClass: null })) };
}

function collapse(anatomy: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = out.mesh;
  const ground = anatomy.storeys[0];
  if (!ground) return { cuts: [], hides: [{ section: null, partClass: null }] };
  // the stubs: ragged runs along each ground-storey face, taller at a masonry building's corners
  const stub = anatomy.remnant.stubHeightM;
  for (const face of ground.faces) {
    const slot = face.layers[face.layers.length - 1] ?? face.layers[0]!;
    if (!mesh.begin(slot.bucket, 'remnant')) continue;
    const yaw = Math.atan2(face.out[0], face.out[2]) + Math.PI / 2;
    const depth = thicknessOf(face);
    const runs = Math.max(2, Math.round(face.width / 1.5));
    for (let k = 0; k < runs && roomFor(mesh, 1); k++) {
      const u0 = -face.width / 2 + (k / runs) * face.width, u1 = -face.width / 2 + ((k + 1) / runs) * face.width;
      const corner = anatomy.remnant.corners && (k === 0 || k === runs - 1);
      const h = stub * (corner ? 1.2 + rng() * 0.6 : 0.3 + rng() * 0.7);
      if (h < 0.1) continue;
      const u = (u0 + u1) / 2;
      writeBox(mesh, face.origin[0] + face.u[0] * u - face.out[0] * depth / 2, h / 2, face.origin[2] + face.u[2] * u - face.out[2] * depth / 2,
        (u1 - u0) / 2, h / 2, depth / 2, yaw, slot.tint, 0.85 + rng() * 0.15);
    }
    mesh.end();
  }
  // the heap: chunks in the building's own buckets by their shares, seated on the sim's mound
  const total = anatomy.rubble.reduce((sum, slot) => sum + slot.share, 0) || 1;
  const reach = { x: anatomy.w / 2 + 2, z: anatomy.d / 2 + 2 };
  for (const slot of anatomy.rubble) {
    if (!mesh.begin(slot.bucket, 'rubble')) continue;
    const unit = unitOf(slot.material).size;
    const wanted = Math.round((slot.share / total) * Math.min(400, (mesh.capacity - mesh.vertices) / VERTS_PER_BOX));
    for (let k = 0; k < wanted && roomFor(mesh, 1); k++) {
      const x = (rng() * 2 - 1) * reach.x, z = (rng() * 2 - 1) * reach.z;
      const top = bodyMoundHeightAt(anatomy, x, z);
      if (top < 0.05 && rng() < 0.7) continue;
      const size = unit * (0.8 + rng() * 1.6);
      writeBox(mesh, x, Math.max(size * 0.3, top - size * 0.25), z, size * (0.6 + rng() * 0.6), size * (0.25 + rng() * 0.35),
        size * (0.5 + rng() * 0.5), rng() * Math.PI, slot.tint, 0.7 + rng() * 0.3);
    }
    mesh.end();
  }
  // the falling debris: off the wall tops and the roof line, inward and down
  const pieces = out.pieces;
  const top = anatomy.roof ? anatomy.roof.eaveY : anatomy.h;
  for (let k = 0; k < 240 && pieces.count < pieces.capacity; k++) {
    const slot = anatomy.rubble[k % Math.max(1, anatomy.rubble.length)]!;
    const face = ground.faces[k % ground.faces.length]!;
    const u = (rng() - 0.5) * face.width;
    pushPiece(pieces, slot, rng, face.origin[0] + face.u[0] * u, top * (0.4 + rng() * 0.6), face.origin[2] + face.u[2] * u,
      -face.out[0] * rng() * 2, -rng() * 2, -face.out[2] * rng() * 2);
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

export const DEFAULT_STRUCTURE_DAMAGE_KIT: StructureDamageKit = Object.freeze({
  id: 'default',
  describe: describeDefault,
  damaged,
  breach,
  sectionDown,
  storeyDown,
  collapse,
});
registerStructureDamageKit(DEFAULT_STRUCTURE_DAMAGE_KIT);
