// Fleet-wide combat-anatomy finalizer. It reconciles authored armor/module/
// crew coordinates with measured first-party geometry receipts, then adds
// only the extra internal systems that have real simulation behavior.
// Pure array math: no DOM, WebGL or Three dependency.

import { MODULE_IDS } from '../sim/moduleCatalog.ts';
import type { EraProtection } from '../sim/armor.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  combatAnatomyCalibration,
  type AnatomyCalibrationBounds,
  type AnatomyCalibrationCell,
  type AnatomyCalibrationStructure,
  type AnatomyModuleShapeReceipt,
  type AnatomyEraPlateReceipt,
  type CombatAnatomyCalibration,
} from './combatAnatomyCalibrationRegistry.ts';
import { isCombatAnatomyMeasurementMode } from './combatAnatomyMeasurementMode.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import type {
  InternalCrewStation,
  InternalLayoutRecord,
  InternalSystemPlacement,
} from './internalLayoutRegistry.ts';

const FINALIZED = Symbol.for('claude-of-tanks.combat-anatomy.v2');
const MISSILE_RELOAD_FLOOR_S = 8;
const EPS = 1e-9;

type Vec3 = number[];

interface Bounds {
  min: Vec3;
  max: Vec3;
}

interface ArmorPlate {
  name: string;
  verts: Vec3[];
  physicalMm: number;
  keMm: number;
  ceMm: number;
  kind?: string;
  era?: EraProtection | null;
  moduleLink?: string | null;
  gunFollow?: boolean;
}

interface AnatomyShapeEllipsoid {
  kind: 'ellipsoid';
  center: Vec3;
  radii: Vec3;
}

interface AnatomyShapeCapsule {
  kind: 'capsule';
  a: Vec3;
  b: Vec3;
  radius: number;
}

interface AnatomyShapeCylinder {
  kind: 'ellipticCylinder';
  center: Vec3;
  axis: number;
  halfLength: number;
  radii: number[];
}

type AnatomyShape = AnatomyShapeEllipsoid | AnatomyShapeCapsule | AnatomyShapeCylinder;

interface AnatomyVolume extends Bounds {
  turretLocal?: boolean;
  external?: boolean;
  parts?: Bounds[];
  shapes?: AnatomyShape[];
  visualForm?: string;
  layoutPlacement?: string;
  layoutConfidence?: string;
  layoutSources?: string[];
}

interface ModuleVolume extends AnatomyVolume {
  module: string;
}

interface CrewVolume extends AnatomyVolume {
  crew: string;
  station?: string;
}

interface CollisionFace {
  indices: number[];
  normal: Vec3;
  constant: number;
  center: Vec3;
  plate: ArmorPlate;
  internal?: boolean;
}

interface CollisionCell extends Bounds {
  vertices: Vec3[];
  faces: CollisionFace[];
  structureKind: string | null;
}

interface ArmorAnatomy {
  turretPivot: Vec3;
  hullPlates: ArmorPlate[];
  turretPlates: ArmorPlate[];
  modules?: ModuleVolume[];
  crew?: CrewVolume[];
  collisionShells?: { hull: CollisionCell[]; turret: CollisionCell[] };
  bodyContactPoints?: { hull: number[]; turret: number[] };
}

interface CombatShell {
  reloadS?: number;
  guided?: boolean;
  type?: string;
}

export interface CombatAnatomySpec {
  id: string;
  role: string;
  gun?: { reloadS: number; shells?: CombatShell[] };
  armor?: ArmorAnatomy;
  [key: symbol]: RuntimeValue;
}

interface LegacyInternalLayout {
  confidence: string;
  sources: string[];
  crew: InternalCrewStation[];
  systems: {
    engine: InternalSystemPlacement;
    transmission: InternalSystemPlacement;
    ammoRack: InternalSystemPlacement;
    autoloader: InternalSystemPlacement | null;
    feedSystem: InternalSystemPlacement | null;
    missileRack: InternalSystemPlacement | null;
  };
}

type CombatInternalLayout = InternalLayoutRecord | LegacyInternalLayout;

interface PlateDescriptor {
  plate: ArmorPlate;
  normal: Vec3;
  center: Vec3;
  min: Vec3;
  max: Vec3;
}

interface ShellSegment {
  cell: CollisionCell;
  bounds: Bounds;
}

function isRecord(value: RuntimeValue): value is Record<PropertyKey, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function isCombatAnatomySpec(value: RuntimeValue): value is CombatAnatomySpec & { armor: ArmorAnatomy } {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.role !== 'string') return false;
  const armor = value.armor;
  return isRecord(armor)
    && Array.isArray(armor.turretPivot)
    && Array.isArray(armor.hullPlates)
    && Array.isArray(armor.turretPlates);
}

function copyBox(box: AnatomyVolume, module: string): ModuleVolume {
  return {
    module,
    min: box.min.slice(),
    max: box.max.slice(),
    turretLocal: !!box.turretLocal,
  };
}

function shrinkBox(
  box: AnatomyVolume,
  module: string,
  scale: readonly number[],
  offset: readonly number[] = [0, 0, 0],
): ModuleVolume {
  const out = copyBox(box, module);
  for (let axis = 0; axis < 3; axis++) {
    const center = (box.min[axis] + box.max[axis]) / 2 + offset[axis];
    const half = Math.max(0.035, (box.max[axis] - box.min[axis]) * scale[axis] / 2);
    out.min[axis] = center - half;
    out.max[axis] = center + half;
  }
  return out;
}

function plateBounds(plates: readonly ArmorPlate[] | undefined, mainOnly = false): Bounds | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const plate of plates || []) {
    if (plate.kind === 'external') continue;
    if (mainOnly && (plate.kind || 'main') !== 'main') continue;
    for (const point of plate.verts || []) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

function mapPoint(point: Vec3, from: Bounds, to: AnatomyCalibrationBounds | Bounds): void {
  for (let axis = 0; axis < 3; axis++) {
    const span = from.max[axis] - from.min[axis];
    if (!(span > 1e-5)) continue;
    const t = (point[axis] - from.min[axis]) / span;
    point[axis] = to.min[axis] + t * (to.max[axis] - to.min[axis]);
  }
}

function mapBox(box: Bounds, from: Bounds, to: AnatomyCalibrationBounds | Bounds): void {
  mapPoint(box.min, from, to);
  mapPoint(box.max, from, to);
  for (let axis = 0; axis < 3; axis++) {
    if (box.min[axis] > box.max[axis]) [box.min[axis], box.max[axis]] = [box.max[axis], box.min[axis]];
  }
}

function boxBounds(boxes: readonly Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
  }
  return { min, max };
}

function sub(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: readonly number[], b: readonly number[]): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: readonly number[]): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > EPS ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0];
}

function plateDescriptor(plate: ArmorPlate): PlateDescriptor | null {
  const verts = plate.verts || [];
  if (verts.length < 3) return null;
  const normal = normalize(cross(sub(verts[1], verts[0]), sub(verts[verts.length - 1], verts[0])));
  const center = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of verts) {
    for (let axis = 0; axis < 3; axis++) {
      center[axis] += point[axis] / verts.length;
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { plate, normal, center, min, max };
}

function boundsGap(point: readonly number[], min: readonly number[], max: readonly number[]): number {
  let squared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = point[axis] < min[axis]
      ? min[axis] - point[axis]
      : point[axis] > max[axis] ? point[axis] - max[axis] : 0;
    squared += gap * gap;
  }
  return Math.sqrt(squared);
}

function nearestPlate(
  faceCenter: readonly number[],
  faceNormal: readonly number[],
  descriptors: readonly PlateDescriptor[],
): ArmorPlate | null {
  let best: ArmorPlate | null = null;
  let bestScore = Infinity;
  for (const descriptor of descriptors) {
    const alignment = dot(faceNormal, descriptor.normal);
    if (alignment < 0.12) continue;
    const planeDistance = Math.abs(dot(descriptor.normal, sub(faceCenter, descriptor.center)));
    const edgeDistance = boundsGap(faceCenter, descriptor.min, descriptor.max);
    const score = planeDistance + edgeDistance * 0.75 + (1 - alignment) * 1.25;
    if (score < bestScore) {
      bestScore = score;
      best = descriptor.plate;
    }
  }
  if (best) return best;
  // Very small bevel faces can be almost orthogonal to every broad authored
  // zone. They still inherit the nearest physical plate rather than becoming
  // an unarmored hole in the closed shell.
  for (const descriptor of descriptors) {
    const score = Math.hypot(...sub(faceCenter, descriptor.center));
    if (score < bestScore) {
      bestScore = score;
      best = descriptor.plate;
    }
  }
  return best;
}

function prepareCollisionCells(
  sourceCells: readonly AnatomyCalibrationCell[] | undefined,
  plates: readonly ArmorPlate[],
): CollisionCell[] {
  if (!Array.isArray(sourceCells) || !sourceCells.length) return [];
  const descriptors = (plates || [])
    .filter((plate) => (plate.kind || 'main') === 'main')
    .map(plateDescriptor)
    .filter((descriptor): descriptor is PlateDescriptor => descriptor !== null);
  if (!descriptors.length) return [];
  const cells: CollisionCell[] = [];
  for (const source of sourceCells) {
    if (!Array.isArray(source.vertices) || !Array.isArray(source.faces)) continue;
    const vertices = source.vertices.map((point: readonly number[]) => point.slice());
    const center = [
      (source.min[0] + source.max[0]) * 0.5,
      (source.min[1] + source.max[1]) * 0.5,
      (source.min[2] + source.max[2]) * 0.5,
    ];
    const faces: CollisionFace[] = [];
    for (const sourceIndices of source.faces) {
      if (!Array.isArray(sourceIndices) || sourceIndices.length !== 3) continue;
      const indices = sourceIndices.slice();
      const a = vertices[indices[0]];
      const b = vertices[indices[1]];
      const c = vertices[indices[2]];
      if (!a || !b || !c) continue;
      let normal = normalize(cross(sub(b, a), sub(c, a)));
      const faceCenter = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ];
      if (dot(normal, sub(faceCenter, center)) < 0) {
        [indices[1], indices[2]] = [indices[2], indices[1]];
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      const plate = nearestPlate(faceCenter, normal, descriptors);
      if (!plate) continue;
      faces.push({
        indices,
        normal,
        constant: -dot(normal, a),
        center: faceCenter,
        plate,
      });
    }
    if (faces.length < 4) continue;
    cells.push({
      min: source.min.slice(),
      max: source.max.slice(),
      vertices,
      faces,
      structureKind: source.structureKind || null,
    });
  }
  const boundaryCounts = new Map<number, number>();
  for (const cell of cells) {
    for (const z of [cell.min[2], cell.max[2]]) {
      const key = Math.round(z * 10000);
      boundaryCounts.set(key, (boundaryCounts.get(key) || 0) + 1);
    }
  }
  for (const cell of cells) {
    for (const face of cell.faces) {
      const key = Math.round(face.center[2] * 10000);
      face.internal = Math.abs(face.normal[2]) > 0.985 && (boundaryCounts.get(key) || 0) > 1;
    }
  }
  return cells;
}

/**
 * Flatten the exact closed-shell vertices into a de-duplicated point cloud for
 * rigid terrain contact. Rollover support must use the same authored envelope
 * as shell tracing: spec.dims.heightM includes antennas, weapon stations and
 * other non-load-bearing dressing, so a dimensions box visibly levitates an
 * inverted tank. This receipt is built once with the combat anatomy and costs
 * no allocation in the fixed-step movement loop.
 */
function collisionContactPoints(cells: readonly CollisionCell[] | undefined): number[] {
  const points: number[] = [];
  const seen = new Set<string>();
  for (const cell of cells || []) {
    for (const point of cell.vertices || []) {
      // Generated anatomy is quantized well beyond contact precision. A
      // millimetre key removes shared cell-boundary duplicates without moving
      // the coordinates that armor tracing owns.
      const key = `${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)},${Math.round(point[2] * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point[0], point[1], point[2]);
    }
  }
  return points;
}

function centeredBounds(bounds: Bounds | AnatomyCalibrationBounds): { center: Vec3; half: Vec3 } {
  const center = [0, 0, 0];
  const half = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    center[axis] = (bounds.min[axis] + bounds.max[axis]) * 0.5;
    half[axis] = Math.max(0.018, (bounds.max[axis] - bounds.min[axis]) * 0.5);
  }
  return { center, half };
}

function longestAxis(half: readonly number[]): number {
  return half[1] > half[0] && half[1] >= half[2] ? 1 : half[2] > half[0] ? 2 : 0;
}

function capsuleForBounds(bounds: Bounds, fill = 0.88): AnatomyShapeCapsule {
  const { center, half } = centeredBounds(bounds);
  const axis = longestAxis(half);
  const crossAxes = [0, 1, 2].filter((value) => value !== axis);
  const radius = Math.max(0.018, Math.min(half[crossAxes[0]], half[crossAxes[1]]) * fill);
  const extent = Math.max(0, half[axis] - radius);
  const a = center.slice();
  const b = center.slice();
  a[axis] -= extent;
  b[axis] += extent;
  return { kind: 'capsule', a, b, radius };
}

function ellipsoidForBounds(
  bounds: Bounds,
  scale: readonly number[] = [0.92, 0.90, 0.92],
): AnatomyShapeEllipsoid {
  const { center, half } = centeredBounds(bounds);
  return {
    kind: 'ellipsoid',
    center,
    radii: half.map((value, axis) => Math.max(0.018, value * scale[axis])),
  };
}

function cylinderForBounds(bounds: Bounds, axis = 1, fill = 0.92): AnatomyShapeCylinder {
  const { center, half } = centeredBounds(bounds);
  const radialAxes = [0, 1, 2].filter((value) => value !== axis);
  return {
    kind: 'ellipticCylinder',
    center,
    axis,
    halfLength: half[axis] * fill,
    radii: [half[radialAxes[0]] * fill, half[radialAxes[1]] * fill],
  };
}

function moduleShapeForBounds(module: string, bounds: Bounds): AnatomyShape {
  if (module === 'turretRing' || module === 'gunMount') return cylinderForBounds(bounds, 1, 0.94);
  if (module === 'gun') return capsuleForBounds(bounds, 0.72);
  if (module === 'fuelTank' || module === 'ammoRack' || module === 'missileRack'
      || module === 'autoloader' || module === 'feedSystem' || module === 'transmission') {
    return capsuleForBounds(bounds, 0.84);
  }
  return ellipsoidForBounds(bounds);
}

function addPreciseInternalShapes(armor: ArmorAnatomy): void {
  for (const volume of armor.modules || []) {
    const parts = Array.isArray(volume.parts) && volume.parts.length ? volume.parts : [volume];
    const cells = volume.turretLocal
      ? armor.collisionShells?.turret
      : armor.collisionShells?.hull;
    const internal = volume.external !== true && volume.module !== 'trackL' && volume.module !== 'trackR'
      && volume.module !== 'gun' && volume.module !== 'optics';
    volume.shapes = [];
    for (const part of parts) {
      const segments = internal ? splitBoundsAcrossShell(part, cells) : [];
      if (!segments.length) {
        volume.shapes.push(moduleShapeForBounds(volume.module, part));
        continue;
      }
      const candidates: Array<{ shape: AnatomyShape; fit: number }> = [];
      for (const segment of segments) {
        const shape = moduleShapeForBounds(volume.module, segment.bounds);
        const fit = fitShapeInsideShell(shape, [segment.cell]);
        candidates.push({ shape, fit });
      }
      const fitted = candidates.filter((candidate) => candidate.fit >= 0.06);
      const keep = fitted.length ? fitted : [candidates.reduce<{ shape: AnatomyShape; fit: number } | null>(
        (best, candidate) => !best || candidate.fit > best.fit ? candidate : best, null,
      )].filter((candidate): candidate is { shape: AnatomyShape; fit: number } => candidate !== null);
      volume.shapes.push(...keep.map((candidate) => candidate.shape));
    }
  }
  for (const volume of armor.crew || []) {
    const { center, half } = centeredBounds(volume);
    const body: AnatomyShapeEllipsoid = {
      kind: 'ellipsoid',
      center: [center[0], center[1] - half[1] * 0.12, center[2]],
      radii: [half[0] * 0.78, half[1] * 0.72, half[2] * 0.72],
    };
    const headRadius = Math.max(0.07, Math.min(0.19, half[0] * 0.58, half[2] * 0.58));
    const head: AnatomyShapeEllipsoid = {
      kind: 'ellipsoid',
      center: [center[0], center[1] + half[1] * 0.67, center[2]],
      radii: [headRadius, Math.max(0.08, half[1] * 0.19), headRadius],
    };
    const cells = volume.turretLocal
      ? armor.collisionShells?.turret
      : armor.collisionShells?.hull;
    volume.shapes = [];
    for (const base of [body, head]) {
      const bounds = {
        min: base.center.map((value, axis) => value - base.radii[axis]),
        max: base.center.map((value, axis) => value + base.radii[axis]),
      };
      const segments = splitBoundsAcrossShell(bounds, cells);
      if (!segments.length) {
        volume.shapes.push(base);
        continue;
      }
      const candidates: Array<{ shape: AnatomyShapeEllipsoid; fit: number }> = [];
      for (const segment of segments) {
        const shape = ellipsoidForBounds(segment.bounds, [1, 1, 1]);
        const fit = fitShapeInsideShell(shape, [segment.cell]);
        candidates.push({ shape, fit });
      }
      const fitted = candidates.filter((candidate) => candidate.fit >= 0.06);
      const keep = fitted.length ? fitted : [candidates.reduce<{ shape: AnatomyShapeEllipsoid; fit: number } | null>(
        (best, candidate) => !best || candidate.fit > best.fit ? candidate : best, null,
      )].filter((candidate): candidate is { shape: AnatomyShapeEllipsoid; fit: number } => candidate !== null);
      volume.shapes.push(...keep.map((candidate) => candidate.shape));
    }
  }
}

function shapeCenter(shape: AnatomyShape): Vec3 {
  if (shape.kind !== 'capsule') return shape.center;
  return [
    (shape.a[0] + shape.b[0]) * 0.5,
    (shape.a[1] + shape.b[1]) * 0.5,
    (shape.a[2] + shape.b[2]) * 0.5,
  ];
}

function moveShape(shape: AnatomyShape, delta: readonly number[]): void {
  const points = shape.kind === 'capsule' ? [shape.a, shape.b] : [shape.center];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) point[axis] += delta[axis];
  }
}

function shapeSupportRadius(shape: AnatomyShape, normal: readonly number[]): number {
  if (shape.kind === 'ellipsoid') {
    return Math.hypot(
      normal[0] * shape.radii[0],
      normal[1] * shape.radii[1],
      normal[2] * shape.radii[2],
    );
  }
  if (shape.kind === 'capsule') {
    const half = [
      (shape.b[0] - shape.a[0]) * 0.5,
      (shape.b[1] - shape.a[1]) * 0.5,
      (shape.b[2] - shape.a[2]) * 0.5,
    ];
    return Math.abs(dot(normal, half)) + shape.radius;
  }
  const radialAxes = [0, 1, 2].filter((axis) => axis !== shape.axis);
  return Math.abs(normal[shape.axis]) * shape.halfLength + Math.hypot(
    normal[radialAxes[0]] * shape.radii[0],
    normal[radialAxes[1]] * shape.radii[1],
  );
}

function scaleShape(shape: AnatomyShape, scale: number): void {
  if (!(scale < 1)) return;
  if (shape.kind === 'ellipsoid') {
    for (let axis = 0; axis < 3; axis++) shape.radii[axis] *= scale;
    return;
  }
  if (shape.kind === 'capsule') {
    const center = shapeCenter(shape);
    for (const point of [shape.a, shape.b]) {
      for (let axis = 0; axis < 3; axis++) {
        point[axis] = center[axis] + (point[axis] - center[axis]) * scale;
      }
    }
    shape.radius *= scale;
    return;
  }
  shape.halfLength *= scale;
  shape.radii[0] *= scale;
  shape.radii[1] *= scale;
}

function cellOutsideDistance(cell: CollisionCell, center: readonly number[]): number {
  let outside = -Infinity;
  for (const face of cell.faces) {
    outside = Math.max(outside, dot(face.normal, center) + face.constant);
  }
  return outside;
}

function splitBoundsAcrossShell(
  bounds: Bounds,
  cells: readonly CollisionCell[] | undefined,
): ShellSegment[] {
  const shell = (cells || []).filter((cell) => !cell.structureKind);
  if (!shell.length) return [];
  const segments: ShellSegment[] = [];
  for (const cell of shell) {
    const minZ = Math.max(bounds.min[2], cell.min[2]);
    const maxZ = Math.min(bounds.max[2], cell.max[2]);
    if (maxZ - minZ <= 0.018) continue;
    segments.push({
      cell,
      bounds: {
        min: [bounds.min[0], bounds.min[1], minZ],
        max: [bounds.max[0], bounds.max[1], maxZ],
      },
    });
  }
  if (segments.length) return segments;
  const center = [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
  let nearest = shell[0];
  let distance = Infinity;
  for (const cell of shell) {
    const gap = center[2] < cell.min[2]
      ? cell.min[2] - center[2]
      : center[2] > cell.max[2] ? center[2] - cell.max[2] : 0;
    if (gap < distance) {
      distance = gap;
      nearest = cell;
    }
  }
  return [{ cell: nearest, bounds }];
}

function fitShapeInsideShell(shape: AnatomyShape, cells: readonly CollisionCell[]): number {
  if (!cells?.length) return 1;
  let center = shapeCenter(shape);
  let cell = cells[0];
  let best = Infinity;
  for (const candidate of cells) {
    const outside = cellOutsideDistance(candidate, center);
    if (outside < best) {
      best = outside;
      cell = candidate;
    }
  }
  const margin = 0.006;
  // Seat the whole smooth volume, not only its center, inside the chosen
  // convex component. Repeating handles corners where one inward move
  // slightly violates a neighboring plane; scaling is the last resort.
  for (let iteration = 0; iteration < 10; iteration++) {
    let moved = false;
    center = shapeCenter(shape);
    for (const face of cell.faces) {
      const excess = dot(face.normal, center) + face.constant
        + shapeSupportRadius(shape, face.normal) + margin;
      if (excess <= 0) continue;
      moveShape(shape, face.normal.map((value) => -value * excess));
      moved = true;
      center = shapeCenter(shape);
    }
    if (!moved) break;
  }
  // An oversized authoring box can oscillate between opposite facets. Seat
  // its center unconditionally before deriving the final uniform shrink.
  for (let iteration = 0; iteration < 10; iteration++) {
    let moved = false;
    center = shapeCenter(shape);
    for (const face of cell.faces) {
      const signed = dot(face.normal, center) + face.constant;
      if (signed <= -margin) continue;
      moveShape(shape, face.normal.map((value) => -value * (signed + margin)));
      moved = true;
      center = shapeCenter(shape);
    }
    if (!moved) break;
  }
  center = shapeCenter(shape);
  let scale = 1;
  for (const face of cell.faces) {
    const available = -margin - (dot(face.normal, center) + face.constant);
    const support = shapeSupportRadius(shape, face.normal);
    if (support > EPS) scale = Math.min(scale, available / support);
  }
  const appliedScale = Math.max(0.001, Math.min(1, scale));
  scaleShape(shape, appliedScale);
  return appliedScale;
}

function fixedCompartment(calibration: CombatAnatomyCalibration | null): Bounds | null {
  const hull = calibration?.hull;
  const left = calibration?.tracks?.left;
  const right = calibration?.tracks?.right;
  if (!hull || !left || !right) return null;
  const hullWidth = hull.max[0] - hull.min[0];
  const hullHeight = hull.max[1] - hull.min[1];
  const centerX = (hull.min[0] + hull.max[0]) / 2;
  const trackMinZ = Math.min(left.min[2], right.min[2]);
  const trackMaxZ = Math.max(left.max[2], right.max[2]);
  const trackDepth = trackMaxZ - trackMinZ;
  return {
    min: [centerX - hullWidth * 0.32, hull.min[1] + hullHeight * 0.32, trackMinZ + trackDepth * 0.34],
    max: [centerX + hullWidth * 0.32, hull.max[1] - hullHeight * 0.10, trackMinZ + trackDepth * 0.78],
  };
}

function fitFixedBoxes(
  boxes: readonly AnatomyVolume[],
  pivot: readonly number[],
  target: Bounds | null,
): void {
  if (!boxes.length || !target) return;
  // Bake fixed-mount boxes into hull coordinates before normalizing the
  // fighting compartment. The articulation pivot remains useful to the gun,
  // but it must not make internal systems or people behave like turret crew.
  for (const box of boxes) {
    if (box.turretLocal) {
      for (let axis = 0; axis < 3; axis++) {
        box.min[axis] += pivot[axis];
        box.max[axis] += pivot[axis];
      }
      box.turretLocal = false;
    }
  }
  const from = boxBounds(boxes);
  if (!from) return;
  for (const box of boxes) mapBox(box, from, target);
}

// The articulation pivots (armor.turretPivot / armor.gunPivot) are RIG
// anchors, not anatomy: tankFactory seats the visual rig_turret/rig_gun at
// exactly these arrays, and every geometry receipt is measured INSIDE those
// rig frames (tools/gen-combat-anatomy.mjs computes envelopes relative to
// rig_hull/rig_turret). Remapping a pivot through the plate->receipt map
// therefore moves the rendered turret off its authored ring wherever the
// authored plate bounds differ from the measured envelope (§5.356 fleet
// floating-turret regression: pl01 +0.63 m, pt91_twardy +0.28 m). Plates and
// boxes calibrate; pivots stay profile-authored.
function reconcileFrame(
  plates: readonly ArmorPlate[],
  boxes: readonly AnatomyVolume[],
  target: AnatomyCalibrationBounds | Bounds | null,
): void {
  // ERA, tracks, cages and spaced appliques are add-on layers authored against
  // their visible procedural geometry. They neither choose nor inherit the
  // base-shell calibration transform: applying the hull/turret envelope scale
  // to those already-seated coordinates silently moves the gameplay surface
  // away from its cassette (most visibly on long skirt fields). Main armor and
  // internal boxes remain receipt-calibrated below.
  const from = plateBounds(plates, true);
  if (!from || !target) return;
  const seen = new Set<Vec3>();
  for (const plate of plates || []) {
    if ((plate.kind || 'main') !== 'main') continue;
    for (const point of plate.verts || []) {
      if (seen.has(point)) continue;
      seen.add(point);
      mapPoint(point, from, target);
    }
  }
  for (const box of boxes) mapBox(box, from, target);
}

function structurePlate(
  name: string,
  stats: { physicalMm: number; keMm: number; ceMm: number },
  verts: Vec3[],
): ArmorPlate {
  return {
    name,
    verts,
    physicalMm: stats.physicalMm,
    keMm: stats.keMm,
    ceMm: stats.ceMm,
    kind: 'main',
    era: null,
    moduleLink: null,
    gunFollow: false,
  };
}

function appendStructurePlates(
  plates: ArmorPlate[],
  structures: readonly AnatomyCalibrationStructure[] | undefined,
  frame: string,
): void {
  if (!Array.isArray(structures) || !structures.length) return;
  const roof = (plates || []).find((plate) =>
    (plate.kind || 'main') === 'main' && /roof|deck/i.test(plate.name || ''))
    || (plates || []).find((plate) => (plate.kind || 'main') === 'main');
  if (!roof) return;
  const stats = {
    physicalMm: Math.max(8, Number(roof.physicalMm) || 8),
    keMm: Math.max(8, Number(roof.keMm ?? roof.physicalMm) || 8),
    ceMm: Math.max(8, Number(roof.ceMm ?? roof.physicalMm) || 8),
  };
  structures.forEach((structure, index) => {
    const [x0, y0, z0] = structure.min;
    const [x1, y1, z1] = structure.max;
    if (!(x1 > x0 && y1 > y0 && z1 > z0)) return;
    const prefix = `${frame}_${structure.kind || 'roof_structure'}_${String(index + 1).padStart(2, '0')}`;
    plates.push(
      structurePlate(`${prefix}_front`, stats,
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]),
      structurePlate(`${prefix}_rear`, stats,
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]),
      structurePlate(`${prefix}_right`, stats,
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]),
      structurePlate(`${prefix}_left`, stats,
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]),
      structurePlate(`${prefix}_top`, stats,
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]),
    );
  });
}

function applyEraPlateReceipts(
  armor: ArmorAnatomy,
  receipts: readonly AnatomyEraPlateReceipt[] | undefined,
): void {
  for (const receipt of receipts || []) {
    const plates = receipt.owner === 'turret' ? armor.turretPlates : armor.hullPlates;
    const matchIndexes = plates.map((plate, index) => ({ plate, index }))
      .filter(({ plate }) => plate.kind === 'era' && plate.name === receipt.name);
    if (!matchIndexes.length) continue;
    const sourceSurfaces: readonly (readonly (readonly number[])[])[] =
      Array.isArray(receipt.surfaces) && receipt.surfaces.length
      ? receipt.surfaces
      : Array.isArray(receipt.verts) ? [receipt.verts] : [];
    const surfaces: number[][][] = sourceSurfaces
      .map((surface: readonly (readonly number[])[]) => surface.map(
        (point: readonly number[]) => point.slice(),
      ))
      .filter((surface: number[][]) => surface.length >= 3 && surface.every(
        (point: number[]) => point.length >= 3
          && point.every((value: number) => Number.isFinite(value)),
      ));
    if (!surfaces.length) continue;

    // A wrapped or faceted cassette bank is one destructible gameplay zone,
    // but it needs one collision quad per real visible face. Every clone keeps
    // the same name so damage.ts spends the whole bank exactly once.
    const template = matchIndexes[0].plate;
    const insertionIndex = matchIndexes[0].index;
    for (let index = matchIndexes.length - 1; index >= 0; index--) {
      plates.splice(matchIndexes[index].index, 1);
    }
    plates.splice(insertionIndex, 0, ...surfaces.map((verts) => ({
      ...template,
      verts,
    })));
  }
}

function applyModuleShapes(
  armor: ArmorAnatomy,
  receipts: readonly AnatomyModuleShapeReceipt[] | undefined,
): void {
  if (!Array.isArray(receipts) || !receipts.length) return;
  for (const receipt of receipts) {
    const box = (armor.modules || []).find((entry) =>
      entry.module === receipt.module && !!entry.turretLocal === !!receipt.turretLocal);
    if (!box || !Array.isArray(receipt.parts) || !receipt.parts.length) continue;
    const parts: Bounds[] = receipt.parts.map((part: AnatomyCalibrationBounds) => ({
      min: part.min.slice(),
      max: part.max.slice(),
    }));
    box.parts = parts;
    const bounds = boxBounds(parts);
    if (!bounds) continue;
    box.min.splice(0, 3, ...bounds.min);
    box.max.splice(0, 3, ...bounds.max);
  }
}

function reconcileChildFrame(
  plates: readonly ArmorPlate[],
  boxes: readonly AnatomyVolume[],
  pivot: readonly number[],
  from: Bounds | null,
  to: AnatomyCalibrationBounds | Bounds | null,
): void {
  if (!pivot || !from || !to) return;
  // Compose each turret-local point with the authored pivot, scale it through
  // the hull receipt, then decompose about the SAME authored pivot: world
  // placements calibrate while the rig anchor (and the visual gun it seats)
  // keeps the profile-authored frame.
  const mapLocalPoint = (point: Vec3): void => {
    for (let axis = 0; axis < 3; axis++) point[axis] += pivot[axis];
    mapPoint(point, from, to);
    for (let axis = 0; axis < 3; axis++) point[axis] -= pivot[axis];
  };
  const seen = new Set<Vec3>();
  for (const plate of plates || []) {
    for (const point of plate.verts || []) {
      if (seen.has(point)) continue;
      seen.add(point);
      mapLocalPoint(point);
    }
  }
  for (const box of boxes) {
    mapLocalPoint(box.min);
    mapLocalPoint(box.max);
    for (let axis = 0; axis < 3; axis++) {
      if (box.min[axis] > box.max[axis]) [box.min[axis], box.max[axis]] = [box.max[axis], box.min[axis]];
    }
  }
}

function reconcileTracks(
  modules: readonly ModuleVolume[],
  target: CombatAnatomyCalibration['tracks'] | null,
): void {
  if (!target) return;
  for (const box of modules) {
    if (box.module !== 'trackL' && box.module !== 'trackR') continue;
    const side = box.module === 'trackL' ? target.left : target.right;
    if (!side) continue;
    box.min.splice(0, 3, ...side.min);
    box.max.splice(0, 3, ...side.max);
  }
}

function hasMissile(spec: CombatAnatomySpec): boolean {
  const defaultReloadS = spec.gun?.reloadS || 0;
  return (spec.gun?.shells || []).some((shell) => (
    Number(shell.reloadS || defaultReloadS) >= MISSILE_RELOAD_FLOOR_S
    && (shell.guided || (spec.role === 'ifv' && shell.type === 'HEAT'))
  ));
}

function alignTurretRing(armor: ArmorAnatomy, calibration: CombatAnatomyCalibration | null): void {
  const ring = (armor.modules || []).find((box) => box.module === 'turretRing');
  if (!ring || !calibration?.turret) return;
  const thickness = Math.max(0.14, ring.max[1] - ring.min[1]);
  const baseY = calibration.turret.min[1] + (ring.turretLocal ? 0 : armor.turretPivot[1]);
  ring.min[1] = baseY - thickness * 0.5;
  ring.max[1] = baseY + thickness * 0.5;
}

function moveBoxToPlacement(
  box: ModuleVolume,
  placement: string,
  bounds: AnatomyCalibrationBounds | Bounds,
  turretLocal = box.turretLocal,
): void {
  if (!box || !bounds || !['front', 'rear', 'turret'].includes(placement)) return;
  const oldCenter = box.min.map((value, axis) => (value + box.max[axis]) * 0.5);
  const originalSize = box.min.map((value, axis) => box.max[axis] - value);
  const span = bounds.min.map((value, axis) => bounds.max[axis] - value);
  const changesFrame = box.turretLocal !== turretLocal;
  const size = originalSize.map((value, axis) => changesFrame
    ? Math.min(value, span[axis] * 0.82)
    : value);
  const nextCenter = oldCenter.slice();
  // Front powerpacks sit behind the tapered nose/glacis, not at the outer
  // receipt quarter-point. A 0.32 inset keeps their full service envelope in
  // the front compartment across narrow BMP/Puma/Marder hull shoulders.
  if (placement === 'front') nextCenter[2] = bounds.max[2] - span[2] * 0.32;
  if (placement === 'rear' || placement === 'turret') nextCenter[2] = bounds.min[2] + span[2] * 0.22;
  for (let axis = 0; axis < 3; axis++) {
    nextCenter[axis] = Math.max(bounds.min[axis] + size[axis] * 0.5,
      Math.min(bounds.max[axis] - size[axis] * 0.5, nextCenter[axis]));
  }
  const delta = nextCenter.map((value, axis) => value - oldCenter[axis]);
  const resized = size.some((value, axis) => Math.abs(value - originalSize[axis]) > EPS);
  if (!changesFrame && !resized && Array.isArray(box.parts)) {
    for (const part of box.parts) {
      for (let axis = 0; axis < 3; axis++) {
        part.min[axis] += delta[axis];
        part.max[axis] += delta[axis];
      }
    }
  } else {
    delete box.parts;
  }
  for (let axis = 0; axis < 3; axis++) {
    box.min[axis] = nextCenter[axis] - size[axis] * 0.5;
    box.max[axis] = nextCenter[axis] + size[axis] * 0.5;
  }
  box.turretLocal = turretLocal;
}

function boxForStation(
  template: CrewVolume,
  frameBounds: AnatomyCalibrationBounds | Bounds,
  station: string,
): Bounds {
  const size = template.min.map((value, axis) => Math.min(
    template.max[axis] - value,
    (frameBounds.max[axis] - frameBounds.min[axis]) * (axis === 1 ? 0.72 : 0.34),
  ));
  const xFraction = station.endsWith('Left') ? -0.28 : station.endsWith('Right') ? 0.28 : 0;
  const zFraction = station.startsWith('front') ? 0.29 : station.startsWith('rear') ? -0.24 : 0;
  const center = [
    (frameBounds.min[0] + frameBounds.max[0]) * 0.5
      + (frameBounds.max[0] - frameBounds.min[0]) * xFraction,
    Math.max((frameBounds.min[1] + frameBounds.max[1]) * 0.5,
      frameBounds.min[1] + size[1] * 0.5),
    (frameBounds.min[2] + frameBounds.max[2]) * 0.5
      + (frameBounds.max[2] - frameBounds.min[2]) * zFraction,
  ];
  return {
    min: center.map((value, axis) => Math.max(frameBounds.min[axis] + 0.03, value - size[axis] * 0.5)),
    max: center.map((value, axis) => Math.min(frameBounds.max[axis] - 0.03, value + size[axis] * 0.5)),
  };
}

function applyPublishedCrewLayout(
  spec: CombatAnatomySpec & { armor: ArmorAnatomy },
  layout: CombatInternalLayout,
  calibration: CombatAnatomyCalibration | null,
): void {
  const armor = spec.armor;
  const existing = new Map((armor.crew || []).map((box) => [box.crew, box]));
  const hullBounds = calibration?.hull || plateBounds(armor.hullPlates, true);
  const turretBounds = calibration?.turret || plateBounds(armor.turretPlates, true);
  const next: CrewVolume[] = [];
  for (const station of layout.crew) {
    const turretLocal = station.frame === 'turret';
    let box = existing.get(station.role);
    const frameChanged = box && !!box.turretLocal !== turretLocal;
    if (!box || frameChanged) {
      const candidates = armor.crew || [];
      const template = candidates.find((entry) => !!entry.turretLocal === turretLocal)
        || candidates.find((entry) => entry.crew === 'driver')
        || candidates[0];
      const bounds = turretLocal ? turretBounds : hullBounds;
      if (!template || !bounds) continue;
      const placed = boxForStation(template, bounds, station.station);
      box = { crew: station.role, min: placed.min, max: placed.max, turretLocal };
    }
    box.station = station.station;
    box.visualForm = 'seatedCrew';
    box.layoutConfidence = layout.confidence;
    box.layoutSources = layout.sources.slice();
    next.push(box);
  }
  armor.crew = next;
}

function moduleSystem(
  layout: CombatInternalLayout,
  module: string,
): InternalSystemPlacement | null {
  if (!(module in layout.systems)) return null;
  return layout.systems[module as keyof typeof layout.systems] || null;
}

function legacyInternalLayout(spec: CombatAnatomySpec & { armor: ArmorAnatomy }): LegacyInternalLayout {
  const hasLoader = (spec.armor?.crew || []).some((box) => box.crew === 'loader');
  return {
    confidence: 'legacy-nonplayable',
    sources: [],
    crew: (spec.armor?.crew || []).map((box) => ({
      role: box.crew,
      frame: box.turretLocal ? 'turret' : 'hull',
      station: box.crew === 'driver' ? 'frontLeft' : 'midCenter',
    })),
    systems: {
      engine: { placement: 'rear', form: 'dieselPowerpack' },
      transmission: { placement: 'rear', form: 'integratedFinalDrive' },
      ammoRack: { placement: 'hull', form: 'hullBins' },
      autoloader: !hasLoader && spec.role !== 'ifv'
        ? { placement: 'hull', form: 'genericAutoloader' } : null,
      feedSystem: spec.role === 'ifv'
        ? { placement: 'turret', form: 'dualBeltFeed' } : null,
      missileRack: hasMissile(spec)
        ? { placement: 'hull', form: 'gunLaunchedRounds' } : null,
    },
  };
}

function applyModuleLayoutMetadata(
  spec: CombatAnatomySpec & { armor: ArmorAnatomy },
  layout: CombatInternalLayout,
  calibration: CombatAnatomyCalibration | null,
): void {
  const armor = spec.armor;
  const hullBounds = calibration?.hull || plateBounds(armor.hullPlates, true);
  const turretBounds = calibration?.turret || plateBounds(armor.turretPlates, true);
  for (const box of armor.modules || []) {
    const system = moduleSystem(layout, box.module);
    if (!system) continue;
    box.visualForm = system.form;
    box.layoutPlacement = system.placement;
    box.layoutConfidence = layout.confidence;
    box.layoutSources = layout.sources.slice();
    if (hullBounds && (box.module === 'engine' || box.module === 'transmission')
        && (system.placement === 'front' || system.placement === 'rear')) {
      const centerZ = (box.min[2] + box.max[2]) * 0.5;
      const hullCenterZ = (hullBounds.min[2] + hullBounds.max[2]) * 0.5;
      const wrongEnd = system.placement === 'front' ? centerZ < hullCenterZ : centerZ > hullCenterZ;
      if (wrongEnd) moveBoxToPlacement(box, system.placement, hullBounds, false);
    }
    if (box.module === 'ammoRack' && system.placement === 'turret' && !box.turretLocal && turretBounds) {
      moveBoxToPlacement(box, 'turret', turretBounds, true);
    }
  }
}

function addDerivedModules(
  spec: CombatAnatomySpec & { armor: ArmorAnatomy },
  layout: CombatInternalLayout,
  calibration: CombatAnatomyCalibration | null,
): void {
  const armor = spec.armor;
  const modules = armor.modules || (armor.modules = []);
  const byName = new Map(modules.map((box) => [box.module, box]));
  const engine = byName.get('engine');
  const ammo = byName.get('ammoRack');
  const gun = byName.get('gun');

  if (!byName.has('transmission') && engine) {
    const rearward = (engine.min[2] + engine.max[2]) / 2 < 0 ? -1 : 1;
    const depth = engine.max[2] - engine.min[2];
    const transmission = shrinkBox(
      engine, 'transmission', [0.86, 0.72, 0.34], [0, -0.04, rearward * depth * 0.25],
    );
    modules.push(transmission);
    byName.set('transmission', transmission);
  }

  const autoloaderSystem = moduleSystem(layout, 'autoloader');
  const feedSystem = moduleSystem(layout, 'feedSystem');
  const missileSystem = moduleSystem(layout, 'missileRack')
    || (hasMissile(spec) ? { placement: 'hull', form: 'gunLaunchedRounds' } : null);
  if (!autoloaderSystem && byName.has('autoloader')) {
    const remove = byName.get('autoloader');
    if (remove) modules.splice(modules.indexOf(remove), 1);
    byName.delete('autoloader');
  }
  if (autoloaderSystem && !byName.has('autoloader') && ammo) {
    const autoloader = shrinkBox(ammo, 'autoloader', [0.72, 0.48, 0.72], [0, 0.02, 0]);
    modules.push(autoloader);
    byName.set('autoloader', autoloader);
  }
  if (!feedSystem && byName.has('feedSystem')) {
    const remove = byName.get('feedSystem');
    if (remove) modules.splice(modules.indexOf(remove), 1);
    byName.delete('feedSystem');
  }
  if (feedSystem && !byName.has('feedSystem') && (gun || ammo)) {
    const source = gun || ammo;
    if (source) {
      const feed = shrinkBox(source, 'feedSystem', [0.74, 0.55, 0.58], [0, -0.02, -0.04]);
      modules.push(feed);
      byName.set('feedSystem', feed);
    }
  }
  if (!missileSystem && byName.has('missileRack')) {
    const remove = byName.get('missileRack');
    if (remove) modules.splice(modules.indexOf(remove), 1);
    byName.delete('missileRack');
  }
  if (missileSystem && !byName.has('missileRack') && ammo) {
    const side = (ammo.min[0] + ammo.max[0]) / 2 <= 0 ? 1 : -1;
    const width = ammo.max[0] - ammo.min[0];
    const missileRack = shrinkBox(ammo, 'missileRack', [0.42, 0.62, 0.78], [side * width * 0.24, 0.03, 0]);
    modules.push(missileRack);
    byName.set('missileRack', missileRack);
  }

  for (const box of modules) {
    const system = moduleSystem(layout, box.module)
      || (box.module === 'missileRack' ? missileSystem : null);
    if (!system) continue;
    box.visualForm = system.form;
    box.layoutPlacement = system.placement;
    box.layoutConfidence = layout.confidence;
    box.layoutSources = layout.sources.slice();
    if ((box.module === 'engine' || box.module === 'transmission')
        && (system.placement === 'front' || system.placement === 'rear')) {
      const hullBounds = calibration?.hull || plateBounds(armor.hullPlates, true);
      if (!hullBounds) continue;
      const centerZ = (box.min[2] + box.max[2]) * 0.5;
      const hullCenterZ = (hullBounds.min[2] + hullBounds.max[2]) * 0.5;
      const wrongEnd = system.placement === 'front' ? centerZ < hullCenterZ : centerZ > hullCenterZ;
      if (wrongEnd) moveBoxToPlacement(box, system.placement, hullBounds, false);
    }
    if ((box.module === 'autoloader' || box.module === 'feedSystem' || box.module === 'missileRack')
        && system.placement === 'turret' && !box.turretLocal && calibration?.turret) {
      moveBoxToPlacement(box, 'turret', calibration.turret, true);
    }
  }

  // Stable presentation and RNG trace order: core systems first, then the
  // vehicle-specific mechanisms, while preserving authored boxes.
  const order = new Map<string, number>(MODULE_IDS.map((id, index) => [id, index]));
  modules.sort((a, b) => (order.get(a.module) ?? 999) - (order.get(b.module) ?? 999));
}

export function finalizeCombatAnatomy<T>(
  spec: T,
  calibration?: CombatAnatomyCalibration | null,
): T;
export function finalizeCombatAnatomy(
  spec: RuntimeValue,
  requestedCalibration?: CombatAnatomyCalibration | null,
): RuntimeValue {
  if (!isCombatAnatomySpec(spec)) return spec;
  const calibration = requestedCalibration === undefined
    ? combatAnatomyCalibration(spec.id)
    : requestedCalibration;
  if (!spec?.armor || spec[FINALIZED]) return spec;
  const armor = spec.armor;
  const hullBoxes = [...(armor.modules || []), ...(armor.crew || [])].filter((box) => !box.turretLocal);
  const turretBoxes = [...(armor.modules || []), ...(armor.crew || [])].filter((box) => box.turretLocal);
  if (calibration) {
    // Preserve the authored lower-belly datum; receipts deliberately own the
    // side, roof and longitudinal faces that players can actually aim at.
    const hullFrom = plateBounds(armor.hullPlates, true);
    const hullTarget = hullFrom && calibration.hull ? {
      min: [calibration.hull.min[0], hullFrom.min[1], calibration.hull.min[2]],
      max: calibration.hull.max.slice(),
    } : null;
    if (!calibration.turret) {
      // Fixed-mount/casemate armor still uses the turret-local trace frame,
      // even though its visible superstructure belongs to the hull mesh.
      // Scale that child frame through the hull receipt as one rigid anatomy
      // instead of leaving crew floating at the donor pivot.
      reconcileChildFrame(armor.turretPlates, turretBoxes, armor.turretPivot, hullFrom, hullTarget);
      reconcileFrame(armor.hullPlates, hullBoxes, hullTarget);
      const compartment = fixedCompartment(calibration);
      const fixedModules = (armor.modules || []).filter(
        (box) => box.turretLocal && box.module !== 'trackL' && box.module !== 'trackR',
      );
      fitFixedBoxes(fixedModules, armor.turretPivot, compartment);
      fitFixedBoxes(armor.crew || [], armor.turretPivot, compartment);
      const fixedMount = (armor.modules || []).find((box) => box.module === 'turretRing');
      if (fixedMount) {
        fixedMount.module = 'gunMount';
      } else if (!(armor.modules || []).some((box) => box.module === 'gunMount')) {
        // Purpose-built casemate anatomy has no fictional turret ring to
        // rename. Derive the fixed trunnion/mount from the authored gun box so
        // module damage remains available without restoring an invisible
        // rotating volume. This also keeps new turretless specs on the same
        // contract as older donor-based tank destroyers.
        const gun = (armor.modules || []).find((box) => box.module === 'gun');
        if (gun) {
          const depth = gun.max[2] - gun.min[2];
          (armor.modules || (armor.modules = [])).push(shrinkBox(
            gun, 'gunMount', [1.18, 1.08, 0.42], [0, 0, -depth * 0.25],
          ));
        }
      }
    } else {
      reconcileFrame(armor.hullPlates, hullBoxes, hullTarget);
      reconcileFrame(armor.turretPlates, turretBoxes, calibration.turret);
    }
    reconcileTracks(armor.modules || [], calibration.tracks || null);
    alignTurretRing(armor, calibration);
    applyModuleShapes(armor, calibration.moduleShapes);
    appendStructurePlates(armor.hullPlates, calibration.hullStructures, 'hull');
    appendStructurePlates(armor.turretPlates, calibration.turretStructures, 'turret');
    // The generator measures authored reactive cassettes. Reapplying its
    // previous fitted quads here would make ERA calibration self-referential
    // and allow update/check drift, while the mature hull/module calibration
    // remains intentionally active during measurement.
    if (!isCombatAnatomyMeasurementMode()) {
      applyEraPlateReceipts(armor, calibration.eraPlates);
    }
  }
  // Non-playable comparison/authoring specs are intentionally outside the
  // 122-vehicle evidence registry. Keep their authored anatomy usable without
  // diluting the playable-fleet exact-coverage gate.
  const layout = internalLayoutFor(spec.id) || legacyInternalLayout(spec);
  applyPublishedCrewLayout(spec, layout, calibration);
  applyModuleLayoutMetadata(spec, layout, calibration);
  addDerivedModules(spec, layout, calibration);
  armor.collisionShells = {
    hull: prepareCollisionCells([
      ...(calibration?.hullCollision || []),
      ...(calibration?.hullStructureCollision || []),
    ], armor.hullPlates),
    turret: prepareCollisionCells([
      ...(calibration?.turretCollision || []),
      ...(calibration?.turretStructureCollision || []),
    ], armor.turretPlates),
  };
  armor.bodyContactPoints = {
    hull: collisionContactPoints(armor.collisionShells.hull),
    turret: collisionContactPoints(armor.collisionShells.turret),
  };
  addPreciseInternalShapes(armor);
  Object.defineProperty(spec, FINALIZED, { value: true, enumerable: false });
  return spec;
}

export { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
