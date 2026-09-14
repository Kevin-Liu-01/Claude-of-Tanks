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
import * as THREE from 'three';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';

export interface InteriorFillRecord {
  /** Fine voxel size in metres (box indices are in these units). */
  readonly v: number;
  /** Voxel grid origin in the tank frame. */
  readonly o: readonly [number, number, number];
  /** Turret pivot in the tank frame at build pose (metadata; boxes stay in the tank frame). */
  readonly t: readonly [number, number, number];
  /** Base64 little-endian Uint16 sextets [x0, y0, z0, x1, y1, z1] (inclusive voxel spans). */
  readonly hull?: string;
  readonly turret?: string;
}

export type InteriorFillBox = readonly [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number];

const registry = new Map<string, InteriorFillRecord>();
const loadedGroups = new Set<string>();
const pendingGroups = new Map<string, Promise<void>>();

export function registerInteriorFills(records: Readonly<Record<string, InteriorFillRecord>>): void {
  for (const [id, record] of Object.entries(records)) registry.set(id, record);
}

export function interiorFillGroupOf(specId: string): string {
  return FLEET_GROUP_BY_ID[specId] || 'core';
}

export function ensureInteriorFillGroup(group: string): Promise<void> {
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

/** Decode one component's boxes into [centre, size] metres in the TANK frame (build pose). */
export function interiorFillBoxes(record: InteriorFillRecord, component: 'hull' | 'turret'): InteriorFillBox[] {
  const encoded = record[component];
  if (!encoded) return [];
  const spans = decodeSextets(encoded);
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

/** Merge a component's boxes into one geometry (24 vertices per box, no index). */
export function interiorFillGeometry(boxes: readonly InteriorFillBox[]): THREE.BufferGeometry | null {
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

export interface ApplyInteriorFillsOptions {
  readonly specId: string;
  readonly hullG: THREE.Object3D;
  readonly turretG: THREE.Object3D;
  readonly material: THREE.Material;
  readonly disposables: { push(resource: { dispose(): void }): unknown };
}

/** Add the registered fills for a tank to its hull and turret rigs. Returns box counts (0 when none are registered). */
export function applyInteriorFills({ specId, hullG, turretG, material, disposables }: ApplyInteriorFillsOptions): { hull: number; turret: number } {
  const record = registry.get(specId);
  const counts = { hull: 0, turret: 0 };
  if (!record) return counts;
  const inverse = new THREE.Matrix4();
  for (const [component, parent] of [['hull', hullG], ['turret', turretG]] as const) {
    const boxes = interiorFillBoxes(record, component);
    const geometry = interiorFillGeometry(boxes);
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
    counts[component] = boxes.length;
  }
  return counts;
}
