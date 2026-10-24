// The far LOD (perf-255, the coordinator's ruling: "at 21v21 the low bots shouldn't stay at about 90k tris at every
// range"). Past FAR_LOD_ENTER_M of screen-equivalent distance a battle build draws two stand-ins built from its own
// finished tree instead of its detail:
// - the far hull: per owner (the direct parent: an articulation rig, the hull, the turret, a station) and material,
//   every visible static draw merged in the owner's frame and simplified by vertex clustering (a cell of
//   FAR_HULL_CELL_M, split by normal direction so hard edges stay hard; each cell keeps its first vertex's attributes);
// - the far running gear: every road wheel, return roller and end wheel as one low cylinder (its tread in the tyre's
//   material, its faces in the wheel paint), drawn as one mesh on the hull; the track bands stay as they are.
// The detail is parked on FAR_LOD_PARKED_LAYER (no camera renders it), so the visibility other owners keep on those
// objects (ERA strips, the detail hand-offs, the far copies) is untouched, and the gear's runtime stops while far (the
// band deformation and the wheel conformance: tankFactoryCore syncFromState). Raster-identical is not the claim: at
// these ranges a vehicle is tens of pixels across, and the CPU render pairs (tools/tmp-perf255-far-pairs) hold the
// switch to a few pixels. Nothing here runs for the player's own tank, a killcam subject or any inspection view (they
// sync near or with no distance).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FAR_LOD_ENTER_M = 180;
export const FAR_LOD_RETURN_M = 165;
/** The layer the far LOD parks a vehicle's detailed draws on: no camera renders it. */
export const FAR_LOD_PARKED_LAYER = 27;
/** The far hull's clustering cell (m): a quarter of a pixel at FAR_LOD_ENTER_M on a 900-line, 55-degree view; a 9 cm cell
 * collapsed thin strips (a Merkava's skirt rubber) that still draw a line of pixels there. */
const FAR_HULL_CELL_M = 0.05;
const WHEEL_SEGMENTS = 10;

/**
 * Simplify `source` by vertex clustering: vertices in one cell of `cellM` whose normals point the same way (each axis
 * in five bands) become the cell's first such vertex, with all its attributes; triangles that collapse are dropped.
 * Null when nothing is left.
 */
export function clusterGeometry(source: THREE.BufferGeometry, cellM: number): THREE.BufferGeometry | null {
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const count = position.count;
  const representative = new Int32Array(count);
  const cells = new Map<number, number>();
  const kept: number[] = [];
  const band = (value: number): number => Math.max(0, Math.min(4, Math.round((value + 1) * 2)));
  const index = (value: number): number => Math.max(0, Math.min(1023, Math.floor(value / cellM) + 512));
  for (let v = 0; v < count; v++) {
    const direction = normal ? band(normal.getX(v)) * 25 + band(normal.getY(v)) * 5 + band(normal.getZ(v)) : 0;
    const key = ((index(position.getX(v)) * 1024 + index(position.getY(v))) * 1024 + index(position.getZ(v))) * 128 + direction;
    let out = cells.get(key);
    if (out === undefined) { out = kept.length; cells.set(key, out); kept.push(v); }
    representative[v] = out;
  }
  const triangles: number[] = [];
  const corners = source.index ? source.index.count : count;
  for (let t = 0; t + 2 < corners; t += 3) {
    const i0 = source.index ? source.index.getX(t) : t, i1 = source.index ? source.index.getX(t + 1) : t + 1;
    const i2 = source.index ? source.index.getX(t + 2) : t + 2;
    const a = representative[i0], b = representative[i1], c = representative[i2];
    if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
  }
  if (!triangles.length) return null;
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const plain = attribute as THREE.BufferAttribute;
    const size = plain.itemSize;
    const Kind = plain.array.constructor as new (length: number) => THREE.TypedArray;
    const array = new Kind(kept.length * size);
    for (let o = 0; o < kept.length; o++) for (let k = 0; k < size; k++) array[o * size + k] = plain.array[kept[o] * size + k];
    out.setAttribute(name, new THREE.BufferAttribute(array, size, plain.normalized));
  }
  out.setIndex(kept.length < 65536 ? new THREE.Uint16BufferAttribute(triangles, 1) : new THREE.Uint32BufferAttribute(triangles, 1));
  out.computeBoundingSphere();
  return out;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function layoutOf(geometry: THREE.BufferGeometry): string | null {
  if (Object.keys(geometry.morphAttributes).length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  const parts: string[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
    const plain = attribute as THREE.BufferAttribute;
    parts.push(`${name}:${plain.itemSize}:${plain.normalized ? 1 : 0}:${plain.array.constructor.name}`);
  }
  return geometry.getAttribute('position') && geometry.getAttribute('normal') ? `${parts.sort().join(',')}|${geometry.index ? 'i' : 'n'}` : null;
}

/**
 * Whether `object` draws at the far LOD's range: it and every ancestor up to `root` visible and on the default layer, and
 * on the level each LOD above it shows at FAR_LOD_RETURN_M (the LODs switch at render time, so a build's levels all
 * stand visible: the 150 m greeble tier would otherwise join the far hull and stand out again).
 */
function drawnUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  if (!object.layers.isEnabled(0)) return false;
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    const lod = node.parent as THREE.LOD | null;
    if (lod?.isLOD && lod.levels.length) {
      let shown = lod.levels[0].object;
      for (const level of lod.levels) if (FAR_LOD_RETURN_M >= level.distance) shown = level.object;
      if (shown !== node) return false;
    }
    if (node === root) return true;
  }
  return false;
}

export interface FarHull {
  /** The stand-ins, one per owner, material and vertex layout, hidden until the far LOD shows them. */
  meshes: THREE.Mesh[];
  /** The draws they stand in for (parked while far). */
  sources: THREE.Mesh[];
  geometries: THREE.BufferGeometry[];
  trianglesBefore: number;
  trianglesAfter: number;
}

/**
 * The far hull of `root` as it draws now: every visible, opaque, single-material static draw `admit` accepts, merged
 * per direct parent, material and layout in the parent's frame and clustered; groups that cluster to nothing, or a
 * single draw that would not get smaller, stay as they are.
 */
export function buildFarHull(
  root: THREE.Object3D,
  /** The coplanar depth offset a draw takes at this range (coplanarDepth.ts): a stand-in keeps one, so coplanar parts
   * of one material at different depths stand in apart (a Merkava's dark skirt panel over its painted side). */
  depthOf: (mesh: THREE.Mesh) => { depth: number; ties: number },
  admit: (mesh: THREE.Mesh) => boolean,
): FarHull {
  const groups = new Map<string, { owner: THREE.Object3D; material: THREE.Material; meshes: THREE.Mesh[]; depth: number; ties: number }>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean };
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh || !mesh.parent) return;
    if (Array.isArray(mesh.material) || !mesh.material) return;
    const material = mesh.material;
    if (material.transparent || material.depthTest === false || material.colorWrite === false || !material.visible) return;
    if (!drawnUnder(mesh, root) || !admit(mesh)) return;
    const layout = layoutOf(mesh.geometry);
    if (!layout) return;
    const { depth, ties } = depthOf(mesh);
    const key = `${mesh.parent.uuid}|${material.uuid}|${layout}|${mesh.renderOrder}|${mesh.layers.mask}|${depth}|${ties}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = { owner: mesh.parent, material, meshes: [], depth, ties });
    group.meshes.push(mesh);
  });
  const hull: FarHull = { meshes: [], sources: [], geometries: [], trianglesBefore: 0, trianglesAfter: 0 };
  for (const { owner, material, meshes, depth, ties } of groups.values()) {
    const before = meshes.reduce((sum, mesh) => sum + triangleCount(mesh.geometry), 0);
    const placed = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const merged = placed.length > 1 ? mergeGeometries(placed, false) : placed[0];
    for (const geometry of placed) if (geometry !== merged) geometry.dispose();
    if (!merged) continue;
    const clustered = clusterGeometry(merged, FAR_HULL_CELL_M);
    merged.dispose();
    if (!clustered || (meshes.length === 1 && triangleCount(clustered) >= before * 0.8)) { clustered?.dispose(); continue; }
    const stand = new THREE.Mesh(clustered, material);
    stand.name = 'farLodHull';
    stand.visible = false;
    stand.castShadow = false;
    stand.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    stand.renderOrder = meshes[0].renderOrder;
    stand.userData.farLod = true;
    stand.userData.coplanarDepthOffset = depth;
    stand.userData.coplanarDepthTies = ties;
    owner.add(stand);
    hull.meshes.push(stand);
    hull.sources.push(...meshes);
    hull.geometries.push(clustered);
    hull.trianglesBefore += before;
    hull.trianglesAfter += triangleCount(clustered);
  }
  return hull;
}

export interface FarWheel {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Its width along x (m). */
  w: number;
}

/**
 * Low cylinders along x, one per wheel, in one geometry: group 0 the treads and the faces' outer rings (the tyre's
 * material), group 1 the faces' inner discs (the wheel paint, out to WHEEL_DISC_SHARE of the radius): a wheel reads as
 * its rubber ring and its painted dish, as the detailed wheels do at this range.
 */
const WHEEL_DISC_SHARE = 0.62;
export function farWheelsGeometry(wheels: readonly FarWheel[], segments = WHEEL_SEGMENTS): THREE.BufferGeometry {
  const rubberPositions: number[] = [], rubberNormals: number[] = [];
  const paintPositions: number[] = [], paintNormals: number[] = [];
  for (const wheel of wheels) {
    const x0 = wheel.x - wheel.w / 2, x1 = wheel.x + wheel.w / 2;
    const at = (a: number, r: number): [number, number] => [wheel.y + Math.cos(a) * r, wheel.z + Math.sin(a) * r];
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2, a1 = ((s + 1) / segments) * Math.PI * 2;
      const [y0, z0] = at(a0, wheel.r), [y1, z1] = at(a1, wheel.r);
      const [iy0, iz0] = at(a0, wheel.r * WHEEL_DISC_SHARE), [iy1, iz1] = at(a1, wheel.r * WHEEL_DISC_SHARE);
      const ny0 = Math.cos(a0), nz0 = Math.sin(a0), ny1 = Math.cos(a1), nz1 = Math.sin(a1);
      rubberPositions.push(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1);
      rubberNormals.push(0, ny0, nz0, 0, ny0, nz0, 0, ny1, nz1, 0, ny0, nz0, 0, ny1, nz1, 0, ny1, nz1);
      for (const [x, n] of [[x1, 1], [x0, -1]] as const) {
        // the face, wound outward: its rubber ring (two triangles) and its painted dish (a fan about the axle)
        const ring = n > 0
          ? [x, iy0, iz0, x, y0, z0, x, y1, z1, x, iy0, iz0, x, y1, z1, x, iy1, iz1]
          : [x, iy0, iz0, x, y1, z1, x, y0, z0, x, iy0, iz0, x, iy1, iz1, x, y1, z1];
        rubberPositions.push(...ring);
        for (let k = 0; k < 6; k++) rubberNormals.push(n, 0, 0);
        paintPositions.push(...(n > 0 ? [x, wheel.y, wheel.z, x, iy0, iz0, x, iy1, iz1] : [x, wheel.y, wheel.z, x, iy1, iz1, x, iy0, iz0]));
        for (let k = 0; k < 3; k++) paintNormals.push(n, 0, 0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([...rubberPositions, ...paintPositions]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...rubberNormals, ...paintNormals]), 3));
  // a planar UV so the materials' maps sample their mean, as the wheels' own faces do at this range
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.addGroup(0, rubberPositions.length / 3, 0);
  geometry.addGroup(rubberPositions.length / 3, paintPositions.length / 3, 1);
  geometry.computeBoundingSphere();
  return geometry;
}

let nextBuildAt = 0;
/** Whether a vehicle may build its far LOD now: one at a time, spaced by the last build's own cost (a battle's first
 * far frame would otherwise build dozens in one task). A vehicle refused stays at its detail and asks again. */
export function claimFarLodBuild(now: number): boolean {
  return now >= nextBuildAt;
}
export function noteFarLodBuild(startedAt: number, endedAt: number): void {
  nextBuildAt = endedAt + Math.max(4, endedAt - startedAt);
}

/** Park `objects` (and every draw under them) on FAR_LOD_PARKED_LAYER, remembering each one's mask; returns the undo. */
export function parkDraws(objects: readonly THREE.Object3D[]): () => void {
  const saved: Array<[THREE.Object3D, number]> = [];
  for (const object of objects) {
    object.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh || node.layers.mask === 1 << FAR_LOD_PARKED_LAYER) return;
      saved.push([node, node.layers.mask]);
      node.layers.set(FAR_LOD_PARKED_LAYER);
    });
  }
  return () => {
    for (const [node, mask] of saved) node.layers.mask = mask;
    saved.length = 0;
  };
}
