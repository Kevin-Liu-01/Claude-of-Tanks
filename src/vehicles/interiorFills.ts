// Interior fills: buried solids that make every hull and turret watertight by
// construction (owner 2026-09-13: "pour water into the turret or hull and it
// must not spill out"). tools/gen-interior-fills.mjs voxelises each body,
// floods the exterior and greedy-meshes the deep-interior volume the water
// reaches into axis-aligned boxes; the boxes live in per-fleet-group
// generated modules (interiorFillGroups/*.generated.ts) that load lazily like
// the combat-anatomy calibrations, and tankFactory applies them after the
// profile build. Fills sit strictly inside the body's own shells, so
// silhouettes never move; behind a real gap they read as the dark interior
// wall the eye expects. They are excluded from authored-geometry fingerprints.
// 2026-10-16 (tank-opt HIDDEN; owner 2026-10-15: "inside the tanks where we cant see, we dont have unneeded
// geometry"): an intact rendered tank draws each component's fill as its boundary surface, conforming and exact on
// the voxel lattice (interiorFillSurface.ts), unless the closed boxes are fewer triangles; a wreck (setDestroyed) and a
// geometry-only build (a map hulk's bake) draw the closed boxes they always drew.
import * as THREE from 'three';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { interiorFillSurface, type InteriorFillSurface } from './interiorFillSurface.ts';

export interface InteriorFillRecord {
  /** Fine voxel size in metres (box indices are in these units). */
  readonly v: number;
  /** Voxel grid origin in the tank frame. */
  readonly o: readonly [number, number, number];
  /** Turret pivot in the tank frame at build pose (metadata; boxes stay in the tank frame). */
  readonly t: readonly [number, number, number];
  /** Gun pivot in the tank frame at build pose (metadata, 2026-09-14: pockets the gun and mantlet enclose ride with the gun). */
  readonly g?: readonly [number, number, number];
  /** Base64 little-endian Uint16 sextets [x0, y0, z0, x1, y1, z1] (inclusive voxel spans). */
  readonly hull?: string;
  readonly turret?: string;
  readonly gun?: string;
}

type InteriorFillComponent = 'hull' | 'turret' | 'gun';

type InteriorFillBox = readonly [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number];

const registry = new Map<string, InteriorFillRecord>();
const loadedGroups = new Set<string>();
const pendingGroups = new Map<string, Promise<void>>();

function registerInteriorFills(records: Readonly<Record<string, InteriorFillRecord>>): void {
  for (const [id, record] of Object.entries(records)) registry.set(id, record);
}

function interiorFillGroupOf(specId: string): string {
  return FLEET_GROUP_BY_ID[specId] || 'core';
}

function ensureInteriorFillGroup(group: string): Promise<void> {
  if (loadedGroups.has(group)) return Promise.resolve();
  const loader = (INTERIOR_FILL_GROUP_LOADERS as Readonly<Record<string, (() => Promise<{ INTERIOR_FILLS: Readonly<Record<string, InteriorFillRecord>> }>) | undefined>>)[group];
  if (!loader) { loadedGroups.add(group); return Promise.resolve(); }
  let pending = pendingGroups.get(group);
  if (!pending) {
    pending = loader().then((module) => {
      registerInteriorFills(module.INTERIOR_FILLS);
      loadedGroups.add(group);
      pendingGroups.delete(group);
    });
    pendingGroups.set(group, pending);
  }
  return pending;
}

/** Load the fill groups the given tank ids need (no-op for groups already resident). */
export function ensureInteriorFills(specIds: Iterable<string>): Promise<void> {
  const groups = new Set<string>();
  for (const id of specIds) groups.add(interiorFillGroupOf(id));
  return Promise.all([...groups].map(ensureInteriorFillGroup)).then(() => undefined);
}

export function ensureAllInteriorFills(): Promise<void> {
  return Promise.all(Object.keys(INTERIOR_FILL_GROUP_LOADERS).map(ensureInteriorFillGroup)).then(() => undefined);
}

export function hasInteriorFills(specId: string): boolean {
  return registry.has(specId);
}

export function interiorFillRecord(specId: string): InteriorFillRecord | null {
  return registry.get(specId) ?? null;
}

function decodeSextets(encoded: string): Uint16Array {
  const binary = atob(encoded);
  const out = new Uint16Array(binary.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8);
  return out;
}

/** One component's inclusive voxel spans (Uint16 sextets), empty when the record has none. */
export function interiorFillSpans(record: InteriorFillRecord, component: InteriorFillComponent): Uint16Array {
  const encoded = record[component];
  return encoded ? decodeSextets(encoded) : new Uint16Array(0);
}

/** Decode one component's boxes into [centre, size] metres in the TANK frame (build pose). */
export function interiorFillBoxes(record: InteriorFillRecord, component: InteriorFillComponent): InteriorFillBox[] {
  return boxesFromSpans(record, interiorFillSpans(record, component));
}

function boxesFromSpans(record: InteriorFillRecord, spans: Uint16Array): InteriorFillBox[] {
  const boxes: InteriorFillBox[] = [];
  for (let i = 0; i + 5 < spans.length; i += 6) {
    const [x0, y0, z0, x1, y1, z1] = [spans[i], spans[i + 1], spans[i + 2], spans[i + 3], spans[i + 4], spans[i + 5]];
    boxes.push([
      record.o[0] + ((x0 + x1 + 1) / 2) * record.v,
      record.o[1] + ((y0 + y1 + 1) / 2) * record.v,
      record.o[2] + ((z0 + z1 + 1) / 2) * record.v,
      (x1 - x0 + 1) * record.v, (y1 - y0 + 1) * record.v, (z1 - z0 + 1) * record.v,
    ]);
  }
  return boxes;
}

/**
 * The closed boxes as one geometry (36 vertices per box, no index): every fill's mesh through 2026-10-15, a wreck's and
 * a map hulk's since, and an intact tank's where they are no more triangles than the boundary surface.
 */
function closedFillGeometry(boxes: readonly InteriorFillBox[]): THREE.BufferGeometry | null {
  if (!boxes.length) return null;
  const positions = new Float32Array(boxes.length * 36 * 3);
  const normals = new Float32Array(boxes.length * 36 * 3);
  // 6 faces x 2 triangles; corners as (sx, sy, sz) signs
  const faces: ReadonlyArray<readonly [normal: readonly [number, number, number], corners: ReadonlyArray<readonly [number, number, number]>]> = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  let k = 0;
  for (const [cx, cy, cz, sx, sy, sz] of boxes) {
    for (const [normal, corners] of faces) {
      for (const [ux, uy, uz] of corners) {
        positions[k] = cx + ux * sx / 2; positions[k + 1] = cy + uy * sy / 2; positions[k + 2] = cz + uz * sz / 2;
        normals[k] = normal[0]; normals[k + 1] = normal[1]; normals[k + 2] = normal[2];
        k += 3;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/**
 * The boundary surface as one geometry (3 vertices per triangle, no index; interiorFillSurface.ts): each lattice
 * point becomes origin + index · voxel on every axis, once, so the triangles on the two sides of an edge share its
 * endpoints bit for bit (and keep sharing them through the rig transform, which is the same for both).
 */
function surfaceFillGeometry(record: InteriorFillRecord, surface: InteriorFillSurface): THREE.BufferGeometry {
  const { corners, faces } = surface;
  const positions = new Float32Array(corners.length), normals = new Float32Array(corners.length);
  for (let i = 0; i < corners.length; i += 3) {
    positions[i] = record.o[0] + corners[i] * record.v;
    positions[i + 1] = record.o[1] + corners[i + 1] * record.v;
    positions[i + 2] = record.o[2] + corners[i + 2] * record.v;
  }
  for (let t = 0; t < faces.length; t++) {
    const axis = faces[t] >> 1, sign = faces[t] & 1 ? -1 : 1;
    for (let k = 0; k < 3; k++) normals[9 * t + 3 * k + axis] = sign;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/** The surface an intact tank draws for these spans, or null where the closed boxes are no more triangles. */
function drawnSurface(spans: Uint16Array): InteriorFillSurface | null {
  if (!spans.length) return null;
  const surface = interiorFillSurface(spans);
  return surface && surface.faces.length < 2 * spans.length ? surface : null;
}

/**
 * Triangles of one component's (or the whole record's) fill: `closed` the closed boxes' (twelve a box: what a map
 * hulk's bake draws), `drawn` what a rendered tank draws (the boundary surface, or the closed boxes where fewer).
 */
export function interiorFillTriangleCounts(record: InteriorFillRecord, only?: InteriorFillComponent): { boxes: number; closed: number; drawn: number } {
  let boxes = 0, drawn = 0;
  for (const component of only ? [only] : (['hull', 'turret', 'gun'] as const)) {
    const spans = interiorFillSpans(record, component);
    boxes += spans.length / 6;
    drawn += drawnSurface(spans)?.faces.length ?? 2 * spans.length;
  }
  return { boxes, closed: 12 * boxes, drawn };
}

/** Triangles an intact tank draws for one component's spans (the generator's stats). */
export function drawnFillTriangles(spans: Uint16Array): number {
  return drawnSurface(spans)?.faces.length ?? 2 * spans.length;
}

/** What a fill mesh was built from, so a wreck can draw its closed boxes in the same frame. */
interface FillMeshSource {
  readonly record: InteriorFillRecord;
  readonly component: InteriorFillComponent;
  /** The build-time inverse of the rig's world matrix that took the boxes into the rig's frame. */
  readonly toRig: THREE.Matrix4;
}
const fillSources = new WeakMap<THREE.Object3D, FillMeshSource>();

/**
 * A fill mesh's closed boxes in the mesh's own frame, bit for bit the mesh a rendered tank drew through 2026-10-15;
 * null when the mesh is no fill or already draws them. A wreck draws these (tankFactoryCore setDestroyed swaps them
 * in, resetDestroyed back): its dents move vertices one at a time, and the boxes' many corners follow a dent as they
 * always have, where the surface's few would leave its large faces flat under a dented plate.
 */
export function closedInteriorFillGeometry(mesh: THREE.Object3D): THREE.BufferGeometry | null {
  const source = fillSources.get(mesh);
  if (!source) return null;
  const geometry = closedFillGeometry(interiorFillBoxes(source.record, source.component));
  geometry?.applyMatrix4(source.toRig);
  return geometry;
}

interface ApplyInteriorFillsOptions {
  readonly specId: string;
  readonly hullG: THREE.Object3D;
  readonly turretG: THREE.Object3D;
  /** Gun rig (elevation frame); gun-frame fills are skipped when absent. */
  readonly gunG?: THREE.Object3D | null;
  readonly material: THREE.Material;
  readonly disposables: { push(resource: { dispose(): void }): unknown };
  /** A record to apply instead of the registered one: the fleet watertight gate attaches the shipped fills to its
   * shared fill-free build without loading the registry, so the pass's other audits keep their build. */
  readonly record?: InteriorFillRecord | null;
  /** Draw the closed boxes (the fills' mesh through 2026-10-15) instead of the boundary surface: a geometry-only build
   * (a map hulk's bake, the workshop dressing) is baked into other meshes, counted by their triangle budgets (props.ts
   * WRECK_TRIS_BUDGET) and crumpled on the CPU, and keeps exactly the triangles it always had. */
  readonly closed?: boolean;
}

/**
 * Add the registered fills for a tank to its hull and turret rigs: each component's boundary surface (or its closed
 * boxes, when those are no more triangles or `closed` asks for them). Returns box counts (0 when none are registered)
 * and the meshes attached.
 */
export function applyInteriorFills({ specId, hullG, turretG, gunG = null, material, disposables, record: explicit, closed = false }: ApplyInteriorFillsOptions): { hull: number; turret: number; gun: number; meshes: THREE.Mesh[] } {
  const record = explicit === undefined ? registry.get(specId) : explicit;
  const counts = { hull: 0, turret: 0, gun: 0, meshes: [] as THREE.Mesh[] };
  if (!record) return counts;
  const inverse = new THREE.Matrix4();
  const targets: Array<readonly [InteriorFillComponent, THREE.Object3D]> = [['hull', hullG], ['turret', turretG]];
  if (gunG) targets.push(['gun', gunG]);
  for (const [component, parent] of targets) {
    const spans = interiorFillSpans(record, component);
    const boxes = boxesFromSpans(record, spans);
    const surface = closed ? null : drawnSurface(spans);
    const geometry = surface ? surfaceFillGeometry(record, surface) : closedFillGeometry(boxes);
    if (!geometry) continue;
    // Boxes are authored in the tank frame at build pose; rigs may carry a scale or offset
    // (profile `s`, turret pivot), so the geometry is taken into the rig's own frame.
    parent.updateMatrixWorld(true);
    geometry.applyMatrix4(inverse.copy(parent.matrixWorld).invert());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${component}InteriorFill`;
    mesh.userData.interiorFill = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    disposables.push(geometry);
    // a surface mesh remembers its boxes for the wreck (closedInteriorFillGeometry)
    if (surface) fillSources.set(mesh, { record, component, toRig: inverse.clone() });
    counts[component] = boxes.length;
    counts.meshes.push(mesh);
  }
  return counts;
}
