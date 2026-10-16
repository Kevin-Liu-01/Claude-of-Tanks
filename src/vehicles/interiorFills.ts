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
// 2026-10-16 (tank-opt HIDDEN; owner: "inside the tanks where we cant see, we dont have unneeded geometry"): a box
// face pressed flat against same-component neighbours lies inside the component's own solid and is never drawn
// (interiorFillFaces.ts); every other face keeps its exact triangles, so the solid's outer surface is unchanged.
import * as THREE from 'three';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { drawnFillFaces, internalFillFaces } from './interiorFillFaces.ts';

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

/**
 * Box and face counts of a record (or of one component): `faces` the six per box, `internal` the faces its own solid
 * buries (never drawn), so the mesh carries 2 x (faces - internal) triangles.
 */
export function interiorFillFaceCounts(record: InteriorFillRecord, only?: InteriorFillComponent): { boxes: number; faces: number; internal: number } {
  let boxes = 0, internal = 0;
  for (const component of only ? [only] : ['hull', 'turret', 'gun'] as const) {
    const mask = internalFillFaces(interiorFillSpans(record, component));
    boxes += mask.length;
    internal += 6 * mask.length - drawnFillFaces(mask);
  }
  return { boxes, faces: 6 * boxes, internal };
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
 * Merge a component's boxes into one geometry (6 vertices per drawn face, no index). `internal` (interiorFillFaces.ts)
 * marks the faces the component's own solid buries: they are left out, and every drawn face is written exactly as the
 * full mesher wrote it (same corners, order, positions and normals), so only never-visible triangles disappear.
 */
function interiorFillGeometry(boxes: readonly InteriorFillBox[], internal: Uint8Array): THREE.BufferGeometry | null {
  if (!boxes.length) return null;
  const drawn = drawnFillFaces(internal);
  if (!drawn) return null;
  const positions = new Float32Array(drawn * 6 * 3);
  const normals = new Float32Array(drawn * 6 * 3);
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
  for (let b = 0; b < boxes.length; b++) {
    const [cx, cy, cz, sx, sy, sz] = boxes[b];
    const buried = internal[b];
    for (let f = 0; f < faces.length; f++) {
      if (buried & (1 << f)) continue;
      const [normal, corners] = faces[f];
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
}

/** Add the registered fills for a tank to its hull and turret rigs. Returns box counts (0 when none are registered). */
export function applyInteriorFills({ specId, hullG, turretG, gunG = null, material, disposables, record: explicit }: ApplyInteriorFillsOptions): { hull: number; turret: number; gun: number } {
  const record = explicit === undefined ? registry.get(specId) : explicit;
  const counts = { hull: 0, turret: 0, gun: 0 };
  if (!record) return counts;
  const inverse = new THREE.Matrix4();
  const targets: Array<readonly [InteriorFillComponent, THREE.Object3D]> = [['hull', hullG], ['turret', turretG]];
  if (gunG) targets.push(['gun', gunG]);
  for (const [component, parent] of targets) {
    const spans = interiorFillSpans(record, component);
    const boxes = boxesFromSpans(record, spans);
    const geometry = interiorFillGeometry(boxes, internalFillFaces(spans));
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
