// Gallery anatomy data: the combat armor model, read into the exact lists the anatomy views draw.
//
// Pure and Node-runnable (no DOM, no Three.js). Every list here is a reading of `spec.armor`, never an edit of it:
//   - armor surfaces mirror traceTank's plate selection (src/sim/armor.ts): collision-shell faces replace the main
//     plates of a frame that has cells; ERA (unless spent), spaced and external plates stay; external weapon stock
//     keeps its finite faces; gun-follow plates ride the gun frame;
//   - modules and crew are the combat volumes, one drawn part per combat part, in the combat volume's own frame;
//   - the crew head anchor is the head of the crew body shapes the combat anatomy builds from each station box.
// The fleet receipt (anatomyData.selftest.mjs) ray-checks the drawn armor against traceTank for every vehicle.
import type { AnatomySystem, CrewRole } from './anatomyPalette.ts';
import { crewRole, moduleSystem } from './anatomyPalette.ts';

type Vec3 = readonly [number, number, number];

interface AnatomyPlate {
  name?: string;
  kind?: string;
  verts?: readonly Vec3[];
  physicalMm?: number;
  keMm?: number;
  ceMm?: number;
  gunFollow?: boolean;
  moduleLink?: string | null;
  era?: { keReduction?: number; ceFlatMm?: number } | null;
  weaponHousing?: boolean;
}

interface AnatomyFace { plate?: AnatomyPlate; indices?: readonly number[] }
interface AnatomyCell { vertices?: readonly Vec3[]; faces?: readonly AnatomyFace[] }

export type AnatomyShape =
  | { kind: 'ellipsoid'; center: Vec3; radii: Vec3 }
  | { kind: 'capsule'; a: Vec3; b: Vec3; radius: number }
  | { kind: 'ellipticCylinder'; center: Vec3; radii: readonly [number, number]; axis: 0 | 1 | 2; halfLength: number };

interface AnatomyVolume {
  module?: string;
  crew?: string;
  min: Vec3;
  max: Vec3;
  turretLocal?: boolean;
  gunFollow?: boolean;
  roofGunFollow?: boolean;
  external?: boolean;
  visualForm?: string;
  station?: string;
  layoutPlacement?: string;
  layoutConfidence?: string;
  layoutSources?: readonly string[];
  shapes?: readonly AnatomyShape[];
  parts?: ReadonlyArray<{ min: Vec3; max: Vec3 }>;
}

interface AnatomyWeaponStock {
  module: string;
  min: Vec3;
  max: Vec3;
  turretLocal?: boolean;
  gunFollow?: boolean;
  plates: readonly AnatomyPlate[];
}

export interface AnatomyArmor {
  turretPivot?: readonly number[];
  gunPivot?: readonly number[];
  gunBarrel?: { lengthM: number; radiusM: number; collision?: boolean };
  hullPlates?: readonly AnatomyPlate[];
  turretPlates?: readonly AnatomyPlate[];
  collisionShells?: { hull?: readonly AnatomyCell[]; turret?: readonly AnatomyCell[] };
  externalWeapons?: readonly AnatomyWeaponStock[];
  trackShapes?: ReadonlyArray<{ module: string; x0: number; x1: number; poly: ReadonlyArray<readonly [number, number]> }>;
  modules?: readonly AnatomyVolume[];
  crew?: readonly AnatomyVolume[];
  roofGun?: { owner?: string; position: readonly number[]; rotation: readonly number[]; scale: readonly number[]; pivot: readonly number[] };
}

/** The combat frame a drawn part rides: hull, turret (pivot + yaw), gun (pitch about the trunnion), roof weapon. */
type AnatomyFrame = 'hull' | 'turret' | 'gun' | 'roofGun';

/** How the heat map classes a surface: main armor takes the ramp, add-on layers keep identity colours. */
type ArmorLayer = 'main' | 'era' | 'spaced' | 'external' | 'housing';

export interface ArmorSurface {
  plate: AnatomyPlate;
  frame: 'hull' | 'turret' | 'gun';
  source: 'shell' | 'plate' | 'weapon';
  layer: ArmorLayer;
  /** Triangle soup in the frame's local metres, outward (counter-clockwise) winding, 9 numbers per triangle. */
  positions: number[];
  /** Weapon-stock index for `source: 'weapon'`. */
  weapon?: number;
}

function plateLayer(plate: AnatomyPlate, source: ArmorSurface['source']): ArmorLayer {
  if (source === 'weapon' || plate.weaponHousing) return 'housing';
  const kind = plate.kind || 'main';
  if (kind === 'era') return 'era';
  if (kind === 'spaced') return 'spaced';
  if (kind === 'external') return 'external';
  return 'main';
}

type P3 = [number, number, number];
const sub = (a: readonly number[], b: readonly number[]): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): P3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scaleAdd = (a: readonly number[], b: readonly number[], s: number): P3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
function normalize(a: readonly number[]): P3 | null {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 1e-12 && Number.isFinite(length) ? [a[0] / length, a[1] / length, a[2] / length] : null;
}

/** Keep the part of a convex polygon where dot(m, p) + k <= 0 (Sutherland–Hodgman). */
function clipPolygon(points: readonly P3[], m: readonly number[], k: number): P3[] {
  const out: P3[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    const da = dot(m, a) + k, db = dot(m, b) + k;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) out.push(scaleAdd(a, sub(b, a), da / (da - db)));
  }
  return out;
}

function polygonArea(points: readonly P3[]): number {
  let sum: P3 = [0, 0, 0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const c = cross(sub(points[index], points[0]), sub(points[index + 1], points[0]));
    sum = [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]];
  }
  return Math.hypot(sum[0], sum[1], sum[2]) / 2;
}

function fanPolygon(points: readonly P3[], out: number[]): void {
  for (let index = 1; index < points.length - 1; index += 1) out.push(...points[0], ...points[index], ...points[index + 1]);
}

/**
 * The region a plate's ray test accepts, as a polygon in the test's own plane (src/sim/armor.ts): intersectQuad takes
 * the plane through v0 with normal (v1−v0)×(v3−v0), intersectPlatePolygon the area-weighted fan normal, and
 * intersectConvexPlate (convex plates and weapon stock) (v1−v0)×(v2−v0); each accepts the points left of every edge.
 * The polygon is that intersection of edge half-planes, wound counter-clockwise about the test normal (the only side a
 * shell can strike).
 */
export function plateTestPolygon(plate: AnatomyPlate, test: 'quad' | 'polygon' | 'convex'): P3[] {
  const verts = (plate.verts || []).filter((point) => Array.isArray(point) && point.length >= 3
    && point.slice(0, 3).every(Number.isFinite)).map((point) => [point[0], point[1], point[2]] as P3);
  if (test === 'quad' ? verts.length < 4 : verts.length < 3) return [];
  const edges = test === 'quad' ? verts.slice(0, 4) : verts;
  const origin = verts[0];
  let normal: P3 | null;
  if (test === 'quad') normal = normalize(cross(sub(verts[1], origin), sub(verts[3], origin)));
  else if (test === 'convex') normal = normalize(cross(sub(verts[1], origin), sub(verts[2], origin)));
  else {
    let sum: P3 = [0, 0, 0];
    for (let index = 1; index < verts.length - 1; index += 1) {
      const c = cross(sub(verts[index], origin), sub(verts[index + 1], origin));
      sum = [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]];
    }
    normal = normalize(sum);
  }
  if (!normal) return [];
  const n = normal;
  const project = (point: P3): P3 => scaleAdd(point, n, -dot(sub(point, origin), n));
  // Start from a square in the test plane that holds every projected vertex, then keep the left side of each edge.
  const u = normalize(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n)) as P3;
  const v = cross(n, u);
  const span = 4 + edges.reduce((max, point) => Math.max(max, Math.hypot(...sub(point, origin))), 0);
  let polygon: P3[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
    scaleAdd(scaleAdd(origin, u, a * span), v, b * span));
  for (let index = 0; index < edges.length && polygon.length >= 3; index += 1) {
    const a = project(edges[index]), b = project(edges[(index + 1) % edges.length]);
    const inward = cross(n, sub(b, a));
    // left of edge a→b about n ⇔ dot(n × e, p − a) >= 0 ⇔ dot(−(n × e), p) + dot(n × e, a) <= 0
    polygon = clipPolygon(polygon, [-inward[0], -inward[1], -inward[2]], dot(inward, a));
  }
  return polygon.length >= 3 && polygonArea(polygon) > 1e-10 ? polygon : [];
}

function plateTest(plate: AnatomyPlate & { convexPolygon?: boolean; excludedEdges?: readonly number[] }):
  'quad' | 'polygon' | 'convex' {
  if (!plate.convexPolygon) return 'quad';
  return plate.excludedEdges !== undefined ? 'polygon' : 'convex';
}

interface AnatomyFacePlane extends AnatomyFace { normal?: readonly number[]; constant?: number }
interface AnatomyCellPlanes { min?: readonly number[]; max?: readonly number[]; faces?: readonly AnatomyFacePlane[] }

/**
 * A collision cell exactly as traceTank tests it: the intersection of its face half-planes (n·x + c <= 0) inside the
 * cell bounds. Each boundary polygon carries the first face whose plane produced it (the face traceTank reports as
 * the entry when planes coincide). Polygons still lying on the cell bounds have no face: traceTank never reports
 * them, so they are counted, not drawn.
 */
export function cellPolytope(cell: AnatomyCellPlanes): { polygons: Array<{ face: AnatomyFacePlane; points: P3[] }>; unbounded: number } {
  const min = cell.min, max = cell.max;
  if (!min || !max) return { polygons: [], unbounded: 0 };
  const corner = (x: number, y: number, z: number): P3 => [x ? max[0] : min[0], y ? max[1] : min[1], z ? max[2] : min[2]];
  // Six outward counter-clockwise box faces.
  let polygons: Array<{ face: AnatomyFacePlane | null; points: P3[] }> = [
    [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)],
    [corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)],
    [corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0)],
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)],
    [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0)],
  ].map((points) => ({ face: null, points }));
  for (const face of cell.faces || []) {
    const n = face.normal, c = Number(face.constant);
    if (!n || !Number.isFinite(c) || Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
    const cap: P3[] = [];
    const next: typeof polygons = [];
    for (const polygon of polygons) {
      const clipped = clipPolygon(polygon.points, n, c);
      for (const point of clipped) if (Math.abs(dot(n, point) + c) <= 1e-9) cap.push(point);
      if (clipped.length >= 3 && polygonArea(clipped) > 1e-12) next.push({ face: polygon.face, points: clipped });
    }
    polygons = next;
    // Order the cap's unique points counter-clockwise about the outward normal.
    const unique: P3[] = [];
    for (const point of cap) if (!unique.some((other) => Math.hypot(...sub(point, other)) < 1e-9)) unique.push(point);
    if (unique.length < 3) continue;
    const center = unique.reduce((sum, point) => scaleAdd(sum, point, 1 / unique.length), [0, 0, 0] as P3);
    const nn = normalize(n) as P3;
    const u = normalize(cross(Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], nn)) as P3;
    const v = cross(nn, u);
    unique.sort((a, b) => Math.atan2(dot(sub(a, center), v), dot(sub(a, center), u))
      - Math.atan2(dot(sub(b, center), v), dot(sub(b, center), u)));
    if (polygonArea(unique) > 1e-12) polygons.push({ face, points: unique });
  }
  const drawn = polygons.filter((polygon): polygon is { face: AnatomyFacePlane; points: P3[] } => !!polygon.face);
  return { polygons: drawn, unbounded: polygons.length - drawn.length };
}

function shellSurfaces(cells: readonly AnatomyCell[] | undefined, frame: 'hull' | 'turret', out: ArmorSurface[]): void {
  const byPlate = new Map<AnatomyPlate, number[]>();
  for (const cell of cells || []) {
    for (const polygon of cellPolytope(cell as AnatomyCellPlanes).polygons) {
      const plate = polygon.face.plate;
      if (!plate) continue;
      let positions = byPlate.get(plate);
      if (!positions) { positions = []; byPlate.set(plate, positions); }
      fanPolygon(polygon.points, positions);
    }
  }
  for (const [plate, positions] of byPlate) {
    if (positions.length) out.push({ plate, frame, source: 'shell', layer: plateLayer(plate, 'shell'), positions });
  }
}

function plateSurfaces(
  plates: readonly AnatomyPlate[] | undefined,
  frame: 'hull' | 'turret',
  replaceMain: boolean,
  trackModules: ReadonlySet<string>,
  eraSpent: ReadonlySet<string>,
  out: ArmorSurface[],
): void {
  for (const plate of plates || []) {
    const kind = plate.kind || 'main';
    if (replaceMain && kind === 'main') continue;
    if (kind === 'era' && plate.name && eraSpent.has(plate.name)) continue;
    if (kind === 'external' && plate.moduleLink && trackModules.has(plate.moduleLink)) continue;
    const positions: number[] = [];
    fanPolygon(plateTestPolygon(plate, plateTest(plate)), positions);
    if (!positions.length) continue;
    out.push({ plate, frame: plate.gunFollow ? 'gun' : frame, source: 'plate', layer: plateLayer(plate, 'plate'), positions });
  }
}

/**
 * Every armor surface a shell can strike first, in the order traceTank tests them. `eraSpent` names detonated tiles
 * (the Gallery specimen removes stripped plates from its armor model itself).
 */
export function armorSurfaces(armor: AnatomyArmor, eraSpent: ReadonlySet<string> = new Set()): ArmorSurface[] {
  const out: ArmorSurface[] = [];
  const trackModules = new Set((armor.trackShapes || []).map((shape) => shape.module));
  const hullCells = armor.collisionShells?.hull;
  const turretCells = armor.collisionShells?.turret;
  plateSurfaces(armor.hullPlates, 'hull', !!hullCells?.length, trackModules, eraSpent, out);
  plateSurfaces(armor.turretPlates, 'turret', !!turretCells?.length, trackModules, eraSpent, out);
  shellSurfaces(hullCells, 'hull', out);
  shellSurfaces(turretCells, 'turret', out);
  (armor.externalWeapons || []).forEach((part, weapon) => {
    const frame = part.gunFollow ? 'gun' : part.turretLocal ? 'turret' : 'hull';
    for (const plate of part.plates || []) {
      const positions: number[] = [];
      fanPolygon(plateTestPolygon(plate, 'convex'), positions);
      if (positions.length) out.push({ plate, frame, source: 'weapon', layer: 'housing', positions, weapon });
    }
  });
  return out;
}

/** The plate value the heat map shows for one metric (the sim's own fallbacks: KE and CE default to physical). */
export function plateMetricMm(plate: AnatomyPlate, metric: 'ke' | 'ce' | 'physical'): number {
  const physical = Number(plate.physicalMm || 0);
  if (metric === 'physical') return physical;
  return Number((metric === 'ke' ? plate.keMm : plate.ceMm) ?? physical);
}

type Bounds = { min: [number, number, number]; max: [number, number, number] };

export function shapeBounds(shape: AnatomyShape): Bounds {
  if (shape.kind === 'ellipsoid') {
    return {
      min: [0, 1, 2].map((axis) => shape.center[axis] - shape.radii[axis]) as Bounds['min'],
      max: [0, 1, 2].map((axis) => shape.center[axis] + shape.radii[axis]) as Bounds['max'],
    };
  }
  if (shape.kind === 'capsule') {
    return {
      min: [0, 1, 2].map((axis) => Math.min(shape.a[axis], shape.b[axis]) - shape.radius) as Bounds['min'],
      max: [0, 1, 2].map((axis) => Math.max(shape.a[axis], shape.b[axis]) + shape.radius) as Bounds['max'],
    };
  }
  let radial = 0;
  const half = [0, 1, 2].map((axis) => (axis === shape.axis ? shape.halfLength : shape.radii[radial++]));
  return {
    min: [0, 1, 2].map((axis) => shape.center[axis] - half[axis]) as Bounds['min'],
    max: [0, 1, 2].map((axis) => shape.center[axis] + half[axis]) as Bounds['max'],
  };
}

function shapeCenter(shape: AnatomyShape): [number, number, number] {
  if (shape.kind === 'capsule') return [0, 1, 2].map((axis) => (shape.a[axis] + shape.b[axis]) / 2) as [number, number, number];
  return [shape.center[0], shape.center[1], shape.center[2]];
}

function unionBounds(list: readonly Bounds[]): Bounds | null {
  if (!list.length) return null;
  const min: Bounds['min'] = [Infinity, Infinity, Infinity];
  const max: Bounds['max'] = [-Infinity, -Infinity, -Infinity];
  for (const bounds of list) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return { min, max };
}

function inside(point: readonly number[], bounds: { min: Vec3; max: Vec3 }, margin = 1e-6): boolean {
  return [0, 1, 2].every((axis) => point[axis] >= bounds.min[axis] - margin && point[axis] <= bounds.max[axis] + margin);
}

function volumeFrame(volume: AnatomyVolume, armor: AnatomyArmor): AnatomyFrame {
  if (volume.roofGunFollow && armor.roofGun) return 'roofGun';
  if (volume.gunFollow) return 'gun';
  return volume.turretLocal ? 'turret' : 'hull';
}

export interface ModulePart {
  /** Index of the combat module in `armor.modules`. */
  index: number;
  /** Index of the part inside the module (0 for single-part modules). */
  part: number;
  parts: number;
  module: string;
  system: AnatomySystem;
  frame: AnatomyFrame;
  form: string;
  /**
   * The drawn bounds: the union of the combat hit shapes of this part (what a shell can actually strike), else the
   * authored part or volume box. Drawn models are fitted inside these bounds.
   */
  min: [number, number, number];
  max: [number, number, number];
  /** The authored combat volume box of the whole module. */
  volume: AnatomyVolume;
  /** The exact hit shapes of this part. */
  shapes: AnatomyShape[];
}

/** Track modules: the exterior (drawn as the ghost shell) already shows the running gear, so their models are left
 * out; their exact hit volumes still draw under Hit volumes. */
export const TRACK_MODULES: ReadonlySet<string> = new Set(['trackL', 'trackR']);

/**
 * Every combat module part, one per combat part (tracks included, flagged by TRACK_MODULES). The scene draws a model
 * for every part except the tracks.
 */
export function moduleParts(armor: AnatomyArmor): ModulePart[] {
  const out: ModulePart[] = [];
  (armor.modules || []).forEach((volume, index) => {
    const module = String(volume.module || 'module');
    const frame = volumeFrame(volume, armor);
    const shapes = [...(volume.shapes || [])];
    const parts = volume.parts?.length ? volume.parts : [{ min: volume.min, max: volume.max }];
    const assigned: AnatomyShape[][] = parts.map(() => []);
    for (const shape of shapes) {
      const center = shapeCenter(shape);
      let best = parts.findIndex((part) => inside(center, part));
      if (best < 0) {
        let bestDistance = Infinity;
        parts.forEach((part, partIndex) => {
          const distance = [0, 1, 2].reduce((sum, axis) => {
            const mid = (part.min[axis] + part.max[axis]) / 2;
            return sum + (center[axis] - mid) ** 2;
          }, 0);
          if (distance < bestDistance) { bestDistance = distance; best = partIndex; }
        });
      }
      assigned[Math.max(0, best)].push(shape);
    }
    parts.forEach((part, partIndex) => {
      const ownShapes = assigned[partIndex];
      const bounds = unionBounds(ownShapes.map(shapeBounds)) || {
        min: [part.min[0], part.min[1], part.min[2]],
        max: [part.max[0], part.max[1], part.max[2]],
      };
      out.push({
        index, part: partIndex, parts: parts.length, module, system: moduleSystem(module), frame,
        form: String(volume.visualForm || ''), min: bounds.min, max: bounds.max, volume, shapes: ownShapes,
      });
    });
  });
  return out;
}

export interface CrewStation {
  index: number;
  crew: string;
  role: CrewRole;
  frame: AnatomyFrame;
  volume: AnatomyVolume;
  /** Station box centre, frame-local. */
  center: [number, number, number];
  /** Head centre: the centre of the station's combat head shape(s), where a shell finds this crew member's head. */
  head: [number, number, number];
  /** Exact crew hit shapes. */
  shapes: AnatomyShape[];
}

/**
 * The combat anatomy builds two body shapes per station box (combatAnatomy crewBodyShapes): a torso ellipsoid with a
 * vertical radius of 0.72 half-heights and a head ellipsoid with a horizontal radius of at most 0.19 m and a vertical
 * radius of max(0.08 m, 0.19 half-heights); where either crosses a hull-shell cell boundary it is refitted inside the
 * cell, which only shrinks it, and can leave fragments wherever the original shape crossed a cell. The head shapes are
 * the ones within the head's size; the anchor is the centre of the largest of them near the station's head position,
 * so the drawn head always sits inside a real head hit shape.
 */
const CREW_HEAD_OFFSET_OF_HALF_HEIGHT = 0.67;
const CREW_HEAD_MAX_RADIUS_M = 0.19;
const CREW_HEAD_MIN_VERTICAL_M = 0.08;
const CREW_HEAD_VERTICAL_OF_HALF_HEIGHT = 0.19;
const CREW_HEAD_SEARCH_M = 0.35;

function shapeVolume(shape: AnatomyShape): number {
  if (shape.kind === 'ellipsoid') return (4 / 3) * Math.PI * shape.radii[0] * shape.radii[1] * shape.radii[2];
  if (shape.kind === 'capsule') {
    const length = Math.hypot(shape.b[0] - shape.a[0], shape.b[1] - shape.a[1], shape.b[2] - shape.a[2]);
    return Math.PI * shape.radius ** 2 * (length + (4 / 3) * shape.radius);
  }
  return Math.PI * shape.radii[0] * shape.radii[1] * shape.halfLength * 2;
}

function crewHeadShapes(volume: AnatomyVolume): AnatomyShape[] {
  const halfY = (volume.max[1] - volume.min[1]) / 2;
  const vertical = Math.max(CREW_HEAD_MIN_VERTICAL_M, halfY * CREW_HEAD_VERTICAL_OF_HALF_HEIGHT);
  return (volume.shapes || []).filter((shape) => {
    const bounds = shapeBounds(shape);
    const half = [0, 1, 2].map((axis) => (bounds.max[axis] - bounds.min[axis]) / 2);
    return half[0] <= CREW_HEAD_MAX_RADIUS_M + 1e-6 && half[2] <= CREW_HEAD_MAX_RADIUS_M + 1e-6 && half[1] <= vertical + 1e-6;
  });
}

export function crewStations(armor: AnatomyArmor): CrewStation[] {
  return (armor.crew || []).map((volume, index) => {
    const center = [0, 1, 2].map((axis) => (volume.min[axis] + volume.max[axis]) / 2) as [number, number, number];
    const halfY = (volume.max[1] - volume.min[1]) / 2;
    const nominal: [number, number, number] = [center[0], center[1] + halfY * CREW_HEAD_OFFSET_OF_HALF_HEIGHT, center[2]];
    const heads = crewHeadShapes(volume);
    const near = heads.filter((shape) => {
      const point = shapeCenter(shape);
      return Math.hypot(point[0] - nominal[0], point[2] - nominal[2]) <= CREW_HEAD_SEARCH_M;
    });
    const pool = near.length ? near : heads;
    const largest = pool.reduce<AnatomyShape | null>((best, shape) => (!best || shapeVolume(shape) > shapeVolume(best) ? shape : best), null);
    const head = largest ? shapeCenter(largest) : nominal;
    return {
      index,
      crew: String(volume.crew || 'crew'),
      role: crewRole(String(volume.crew || '')),
      frame: volumeFrame(volume, armor),
      volume,
      center,
      head,
      shapes: [...(volume.shapes || [])],
    };
  });
}

/** Lowest exact hull-shell point (the compartment floor), hull frame. */
export function hullFloorY(armor: AnatomyArmor): number {
  let floor = Infinity;
  for (const cell of armor.collisionShells?.hull || []) {
    for (const point of cell.vertices || []) floor = Math.min(floor, point[1]);
  }
  return Number.isFinite(floor) ? floor : 0;
}
