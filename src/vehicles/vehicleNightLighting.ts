// Authored lamp semantics: no spec-box guesses, new meshes, or light objects.
// Lens faces stay in the existing material buckets and follow every profile
// geometry transform before emitter seats are measured from those faces.
import * as THREE from 'three';
import { registerSmokeSockets } from './vehicleAuxiliaryGeometry.ts';
import { registerNightLightEmitters, registerNightBeamClearance, type NightLightEmitter } from '../engine/nightLightingRuntime.ts';
import {
  NIGHT_EMISSION_ATTRIBUTE, NIGHT_HEADLIGHT_COLOR, NIGHT_SHTORA_COLOR,
  setNightEmissionMask, installNightEmissionMask, refreshNightEmissionBase,
} from '../engine/nightEmissionMaterial.ts';

export type VehicleLampKind = 'headlight' | 'shtora' | 'marker';
interface LensDefinition {
  readonly kind: VehicleLampKind;
  readonly faces: readonly number[];
  readonly tint?: 'red' | 'warm';
}
type LensMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
const SOURCES = new WeakMap<THREE.Object3D, readonly NightLightEmitter[]>();

function lensDefinition(geometry: THREE.BufferGeometry): LensDefinition | undefined {
  return (geometry.userData as { vehicleNightLens?: LensDefinition }).vehicleNightLens;
}

function vertexAt(geometry: THREE.BufferGeometry, offset: number): number {
  return geometry.index ? geometry.index.getX(offset) : offset;
}

/** Call on an authored lens primitive BEFORE its pose transform. Only its
 * outward +Z aperture is tagged; the explicit Y option is only for authored
 * upward service-lamp caps. Side/rear glass and other optics stay off.
 * Serializable face offsets survive profile clones and nonuniform scaling.
 */
export function markVehicleNightLens<T extends THREE.BufferGeometry>(
  geometry: T, kind: VehicleLampKind,
  options: { readonly curvedAperture?: boolean; readonly apertureAxis?: 'z' | 'y'; readonly tint?: 'red' | 'warm' } = {},
): T {
  const normal = geometry.getAttribute('normal');
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  const faces: number[] = [];
  const minFacingNormal = options.curvedAperture ? .01 : .98;
  for (let face = 0; face < count; face += 3) {
    // A source-authored closed curved lens may have no planar cap. Opt in
    // only on that lens primitive; rear-facing stock is still excluded.
    if ([0, 1, 2].every(corner => {
      const vertex = vertexAt(geometry, face + corner);
      return (options.apertureAxis === 'y' ? normal.getY(vertex) : normal.getZ(vertex)) > minFacingNormal;
    })) faces.push(face);
  }
  if (!faces.length) throw new Error('Authored night lens has no forward aperture');
  geometry.userData.vehicleNightLens = { kind, faces, ...(options.tint ? { tint: options.tint } : {}) } satisfies LensDefinition;
  return geometry;
}

function maskLens(geometry: THREE.BufferGeometry): void {
  const definition = lensDefinition(geometry);
  const vertices: number[] = [];
  if (definition) for (const face of definition.faces) {
    for (let corner = 0; corner < 3; corner++) vertices.push(vertexAt(geometry, face + corner));
  }
  setNightEmissionMask(geometry, definition?.kind === 'shtora' || definition?.tint === 'red' ? 2 : 1, vertices);
}

/** Merge utilities require matching attributes on every part in one bucket. */
export function prepareVehicleNightLensParts(parts: readonly THREE.BufferGeometry[]): void {
  if (!parts.some(part => lensDefinition(part))) return;
  for (const part of parts) maskLens(part);
}

function apertureFrame(geometry: THREE.BufferGeometry, definition: LensDefinition): {
  position: [number, number, number]; direction: [number, number, number];
} {
  const position = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cross = new THREE.Vector3(), center = new THREE.Vector3(), normal = new THREE.Vector3();
  let areaSum = 0;
  for (const face of definition.faces) {
    const ia = vertexAt(geometry, face), ib = vertexAt(geometry, face + 1), ic = vertexAt(geometry, face + 2);
    a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
    const area = cross.subVectors(b, a).cross(c.clone().sub(a)).length();
    center.addScaledVector(a, area / 3).addScaledVector(b, area / 3).addScaledVector(c, area / 3);
    normal.x += normals.getX(ia) * area;
    normal.y += normals.getY(ia) * area;
    normal.z += normals.getZ(ia) * area;
    areaSum += area;
  }
  if (areaSum < 1e-12 || normal.lengthSq() < 1e-12) throw new Error('Authored night lens aperture collapsed');
  center.divideScalar(areaSum); normal.normalize();
  // Lens housing rake is not an optical road-beam aim. Retain the authored
  // azimuth/seat and every already-downward beam; only upward driving lamps
  // adopt the runtime's existing .08 downward slope in their owner frame.
  // Float32-scale deadband keeps horizontal caps' trig residue unchanged.
  const horizontal = Math.hypot(normal.x, normal.z);
  if (definition.kind === 'headlight' && normal.y > 1e-7 && horizontal > 0) {
    normal.y = -.08 * horizontal;
    normal.normalize();
  }
  return { position: [center.x, center.y, center.z], direction: [normal.x, normal.y, normal.z] };
}

function registerSources(mesh: THREE.Object3D, emitters: readonly NightLightEmitter[]): void {
  SOURCES.set(mesh, emitters);
  registerNightLightEmitters(mesh, emitters);
}

/** The merged mesh (not a guessed hull datum) is the emitter owner. */
export function registerVehicleNightLensMesh(mesh: LensMesh, parts: readonly THREE.BufferGeometry[]): void {
  registerSmokeSockets(mesh, parts);
  const lamps = parts.filter(part => lensDefinition(part));
  if (!lamps.length) return;
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) throw new TypeError('Night lens requires one standard material');
  installNightEmissionMask(material);
  registerSources(mesh, lamps.map(part => {
    const definition = lensDefinition(part)!;
    return {
      kind: definition.kind, ...apertureFrame(part, definition),
      color: definition.kind === 'shtora' || definition.tint === 'red' ? NIGHT_SHTORA_COLOR : NIGHT_HEADLIGHT_COLOR,
      intensity: definition.kind === 'headlight' ? 1200 : 0,
      range: definition.kind === 'headlight' ? 75 : 0,
      emission: { material, color: 0xffffff, intensity: 3 },
    };
  }));
}

/** Direct authored Shtora lenses can be statically batched on mobile. Preserve
 * their exact source frames in the replacement owner without extra draws.
 */
export function transferVehicleNightLenses(sources: readonly LensMesh[], batch: LensMesh): void {
  const lamps: NightLightEmitter[] = [];
  for (const source of sources) for (const lamp of SOURCES.get(source) ?? []) {
    source.updateMatrix();
    const position = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(source.matrix);
    const direction = new THREE.Vector3().fromArray(lamp.direction ?? [0, 0, 1]).transformDirection(source.matrix);
    lamps.push({ ...lamp, position: [position.x, position.y, position.z], direction: [direction.x, direction.y, direction.z] });
  }
  if (lamps.length) registerSources(batch, lamps);
}

export function vehicleNightLightEmittersFor(anchor: THREE.Object3D): readonly NightLightEmitter[] {
  return SOURCES.get(anchor) ?? [];
}

/** Gun cross-sections at most this long (m); a gun longer than CLEARANCE_SLICES of them takes longer ones. */
const CLEARANCE_SLICE_M = .2, CLEARANCE_SLICES = 60;
/** The capsule's margin over the widest section (m): the tube's own faceting and the fragment's precision. */
const CLEARANCE_MARGIN_M = .02;

/**
 * (CN-7) The recoiling gun as the capsule its own lamps must not light (registerNightBeamClearance), in the rig's
 * frame: its triangles binned into sections along the bore (the rig's +Z), the bore axis at the median section centre
 * of the gun's front half, the radius its widest section over the front 70 % (tube, fume extractor, thermal sleeve,
 * muzzle brake) plus CLEARANCE_MARGIN_M, from its rearmost to its foremost triangle. Wider breech-end stock (a recoiling
 * mantlet face) stands outside it and keeps its light. Shadow-only proxies are not drawn and are skipped.
 */
function gunBeamCapsule(gun: THREE.Object3D): {
  start: [number, number, number]; end: [number, number, number]; radius: number;
} | null {
  // the mesh-to-rig transform from local poses, leaving every construction-time world matrix as it was
  const toGun = new THREE.Matrix4(), local = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  const triangles: Float32Array[] = [];
  let minZ = Infinity, maxZ = -Infinity;
  gun.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.shadowOnly) return;
    const geometry = object.geometry, position = geometry.getAttribute('position');
    const count = geometry.index?.count ?? position.count;
    const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let copy = 0; copy < copies; copy++) {
      toGun.identity();
      for (let node: THREE.Object3D | null = object; node && node !== gun; node = node.parent) {
        toGun.premultiply(node.matrixAutoUpdate ? local.compose(node.position, node.quaternion, node.scale) : node.matrix);
      }
      if (object instanceof THREE.InstancedMesh) toGun.multiply(object.getMatrixAt(copy, instance));
      const vertices = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(toGun).toArray(vertices, i * 3);
        minZ = Math.min(minZ, vertex.z); maxZ = Math.max(maxZ, vertex.z);
      }
      const corners = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const v = vertexAt(geometry, i) * 3;
        corners[i * 3] = vertices[v]; corners[i * 3 + 1] = vertices[v + 1]; corners[i * 3 + 2] = vertices[v + 2];
      }
      triangles.push(corners);
    }
  });
  if (!(maxZ > minZ)) return null;
  const step = Math.max(CLEARANCE_SLICE_M, (maxZ - minZ) / CLEARANCE_SLICES);
  const slices = Math.ceil((maxZ - minZ) / step);
  const boxes = new Float64Array(slices * 4); // x min/max, y min/max of the triangles spanning each section
  for (let section = 0; section < slices; section++) boxes.set([Infinity, -Infinity, Infinity, -Infinity], section * 4);
  for (const corners of triangles) for (let t = 0; t + 8 < corners.length; t += 9) {
    const z0 = Math.min(corners[t + 2], corners[t + 5], corners[t + 8]), z1 = Math.max(corners[t + 2], corners[t + 5], corners[t + 8]);
    const first = Math.max(0, Math.floor((z0 - minZ) / step)), last = Math.min(slices - 1, Math.floor((z1 - minZ) / step));
    for (let section = first; section <= last; section++) {
      const o = section * 4;
      boxes[o] = Math.min(boxes[o], corners[t], corners[t + 3], corners[t + 6]);
      boxes[o + 1] = Math.max(boxes[o + 1], corners[t], corners[t + 3], corners[t + 6]);
      boxes[o + 2] = Math.min(boxes[o + 2], corners[t + 1], corners[t + 4], corners[t + 7]);
      boxes[o + 3] = Math.max(boxes[o + 3], corners[t + 1], corners[t + 4], corners[t + 7]);
    }
  }
  const mid = (section: number) => minZ + (section + .5) * step;
  const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
  const front = [...Array(slices).keys()].filter(section => boxes[section * 4 + 1] >= boxes[section * 4]);
  const half = front.filter(section => mid(section) >= minZ + .5 * (maxZ - minZ));
  if (!half.length) return null;
  const cx = median(half.map(section => (boxes[section * 4] + boxes[section * 4 + 1]) / 2));
  const cy = median(half.map(section => (boxes[section * 4 + 2] + boxes[section * 4 + 3]) / 2));
  let radius = 0;
  for (const section of front) if (mid(section) >= minZ + .3 * (maxZ - minZ)) {
    const o = section * 4;
    radius = Math.max(radius, cx - boxes[o], boxes[o + 1] - cx, cy - boxes[o + 2], boxes[o + 3] - cy);
  }
  return { start: [cx, cy, minZ], end: [cx, cy, maxZ], radius: radius + CLEARANCE_MARGIN_M };
}

/** A shared material also renders unmarked optics buckets/direct fittings.
 * Explicit zero attributes avoid relying on WebGL's missing-attribute state.
 */
export function finalizeVehicleNightLighting(root: THREE.Object3D): void {
  const counts = { headlights: 0, shtora: 0 };
  let markers = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) refreshNightEmissionBase(material);
    if (materials.some(material => material.userData.nightEmissionMask === true) && !object.geometry.hasAttribute(NIGHT_EMISSION_ATTRIBUTE)) maskLens(object.geometry);
    for (const lamp of SOURCES.get(object) ?? []) {
      if (lamp.kind === 'headlight') counts.headlights++;
      if (lamp.kind === 'shtora') counts.shtora++;
      if (lamp.kind === 'marker') markers++;
    }
  });
  root.userData.nightLightCoverage = Object.freeze(markers ? { ...counts, markers } : counts);
  // (CN-7) the vehicle's own driving lamps never light its gun: lamps flanking the mantlet otherwise put the tube in
  // their cone at 2-5 m, the brightest thing in a night frame
  const gun = counts.headlights ? root.getObjectByName('rig_recoil') : undefined;
  const capsule = gun ? gunBeamCapsule(gun) : null;
  if (gun && capsule) registerNightBeamClearance(root, gun, capsule);
}
