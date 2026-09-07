// Authored lamp semantics: no spec-box guesses, new meshes, or light objects.
// Lens faces stay in the existing material buckets and follow every profile
// geometry transform before emitter seats are measured from those faces.
import * as THREE from 'three';
import { registerNightLightEmitters, type NightLightEmitter } from '../engine/nightLightingRuntime.ts';
import {
  NIGHT_EMISSION_ATTRIBUTE, NIGHT_HEADLIGHT_COLOR, NIGHT_SHTORA_COLOR,
  setNightEmissionMask, installNightEmissionMask, refreshNightEmissionBase,
} from '../engine/nightEmissionMaterial.ts';

export type VehicleLampKind = 'headlight' | 'shtora' | 'marker';
interface LensDefinition { readonly kind: VehicleLampKind; readonly faces: readonly number[]; }
type LensMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
const SOURCES = new WeakMap<THREE.Object3D, readonly NightLightEmitter[]>();

function lensDefinition(geometry: THREE.BufferGeometry): LensDefinition | undefined {
  return (geometry.userData as { vehicleNightLens?: LensDefinition }).vehicleNightLens;
}

function vertexAt(geometry: THREE.BufferGeometry, offset: number): number {
  return geometry.index ? geometry.index.getX(offset) : offset;
}

/** Call on an authored lens primitive BEFORE its pose transform. Only its
 * outward +Z aperture is tagged; side/rear glass and all other optics stay off.
 * Serializable face offsets survive profile clones and nonuniform scaling.
 */
export function markVehicleNightLens<T extends THREE.BufferGeometry>(
  geometry: T, kind: VehicleLampKind, options: { readonly curvedAperture?: boolean } = {},
): T {
  const normal = geometry.getAttribute('normal');
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  const faces: number[] = [];
  const minNormalZ = options.curvedAperture ? .01 : .98;
  for (let face = 0; face < count; face += 3) {
    // A source-authored closed curved lens may have no planar cap. Opt in
    // only on that lens primitive; rear-facing stock is still excluded.
    if ([0, 1, 2].every(corner => normal.getZ(vertexAt(geometry, face + corner)) > minNormalZ)) faces.push(face);
  }
  if (!faces.length) throw new Error('Authored night lens has no forward aperture');
  geometry.userData.vehicleNightLens = { kind, faces } satisfies LensDefinition;
  return geometry;
}

function maskLens(geometry: THREE.BufferGeometry): void {
  const definition = lensDefinition(geometry);
  const vertices: number[] = [];
  if (definition) for (const face of definition.faces) {
    for (let corner = 0; corner < 3; corner++) vertices.push(vertexAt(geometry, face + corner));
  }
  setNightEmissionMask(geometry, definition?.kind === 'shtora' ? 2 : 1, vertices);
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
  return { position: [center.x, center.y, center.z], direction: [normal.x, normal.y, normal.z] };
}

function registerSources(mesh: THREE.Object3D, emitters: readonly NightLightEmitter[]): void {
  SOURCES.set(mesh, emitters);
  registerNightLightEmitters(mesh, emitters);
}

/** The merged mesh (not a guessed hull datum) is the emitter owner. */
export function registerVehicleNightLensMesh(mesh: LensMesh, parts: readonly THREE.BufferGeometry[]): void {
  const lamps = parts.filter(part => lensDefinition(part));
  if (!lamps.length) return;
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) throw new TypeError('Night lens requires one standard material');
  installNightEmissionMask(material);
  registerSources(mesh, lamps.map(part => {
    const definition = lensDefinition(part)!;
    return {
      kind: definition.kind, ...apertureFrame(part, definition),
      color: definition.kind === 'shtora' ? NIGHT_SHTORA_COLOR : NIGHT_HEADLIGHT_COLOR,
      intensity: definition.kind === 'headlight' ? 80 : 0,
      range: definition.kind === 'headlight' ? 42 : 0,
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
}
