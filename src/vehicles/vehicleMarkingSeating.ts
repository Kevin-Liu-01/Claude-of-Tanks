// Vehicle marking seats: ray-seated insignia/designation placement on the
// finished armor, its visibility receipt and the verified-seat replay. Split
// out of tankFactoryCore.ts in round 46 (docs/CLEANUP-2026-09-22.md §4.4).
import * as THREE from 'three';
import { isVehicleInstancedMesh, isVehicleMesh, type VehicleMesh } from './vehicleMesh.ts';
import {
  SURFACE_MARKING_STYLE, vehicleMarkingAnchor, vehicleMarkingIncludesPermanentHullArmor,
  type VehicleMarkingAnchor, type VehicleMarkingRecord,
} from './vehicleMarkings.ts';
import type { FactoryTankSpec, VehicleDecal, VehicleOwner } from './tankFactoryCore.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

const MARKING_ARMOR_MESH_NAMES = Object.freeze({
  hull: new Set(['hull', 'hullTrackGuardL', 'hullTrackGuardR']),
  turret: new Set(['turret', 'turretPermanentMarkingSurface']),
});

function markingObjectVisibleInTree(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return false;
}

function markingArmorMeshes(
  owner: THREE.Object3D, ownerName: VehicleOwner, permanentHullArmor = false,
): VehicleMesh[] {
  const names = MARKING_ARMOR_MESH_NAMES[ownerName];
  const meshes: VehicleMesh[] = [];
  owner.traverse((object) => {
    const eligible = names.has(object.name)
      || (permanentHullArmor && ownerName === 'hull' && object.name === 'hullExternalArmor');
    if (!isVehicleMesh(object) || isVehicleInstancedMesh(object) || !eligible
        || object.userData.materialOnlyPaintMigration === true
        || !markingObjectVisibleInTree(object, owner)) return;
    if (!object.geometry?.attributes?.position) return;
    meshes.push(object);
  });
  return meshes;
}

function markingLocalBounds(owner: THREE.Object3D, meshes: readonly VehicleMesh[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  const localPoint = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const corners = new Array(8).fill(null).map(() => new THREE.Vector3());
  owner.updateWorldMatrix(true, true);
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box3 = mesh.geometry.boundingBox;
    if (!box3 || box3.isEmpty()) continue;
    let index = 0;
    for (const x of [box3.min.x, box3.max.x]) {
      for (const y of [box3.min.y, box3.max.y]) {
        for (const z of [box3.min.z, box3.max.z]) corners[index++].set(x, y, z);
      }
    }
    for (const corner of corners) {
      worldPoint.copy(corner).applyMatrix4(mesh.matrixWorld);
      localPoint.copy(worldPoint);
      owner.worldToLocal(localPoint);
      bounds.expandByPoint(localPoint);
    }
  }
  return bounds;
}

function markingHitNormalLocal(
  hit: THREE.Intersection<VehicleMesh>,
  owner: THREE.Object3D,
): THREE.Vector3 | null {
  const position = hit.object.geometry.attributes.position;
  const face = hit.face;
  if (!position || !face) return null;
  const a = new THREE.Vector3().fromBufferAttribute(position, face.a).applyMatrix4(hit.object.matrixWorld);
  const b = new THREE.Vector3().fromBufferAttribute(position, face.b).applyMatrix4(hit.object.matrixWorld);
  const c = new THREE.Vector3().fromBufferAttribute(position, face.c).applyMatrix4(hit.object.matrixWorld);
  owner.worldToLocal(a); owner.worldToLocal(b); owner.worldToLocal(c);
  return b.sub(a).cross(c.sub(a)).normalize();
}

function raySeatMarking(
  owner: THREE.Object3D,
  meshes: VehicleMesh[],
  originLocal: THREE.Vector3,
  directionLocal: THREE.Vector3,
  maxDistance = 1.0,
): MarkingHit | null {
  owner.updateWorldMatrix(true, true);
  const originWorld = owner.localToWorld(originLocal.clone());
  const directionWorld = directionLocal.clone().transformDirection(owner.matrixWorld).normalize();
  const raycaster = new THREE.Raycaster(originWorld, directionWorld, 0, maxDistance);
  const hit = raycaster.intersectObjects<VehicleMesh>(meshes, false)[0];
  if (!hit) return null;
  const pointLocal = owner.worldToLocal(hit.point.clone());
  const normalLocal = markingHitNormalLocal(hit, owner);
  if (!normalLocal) return null;
  // The decal normal must face back toward the ray origin, even when an old
  // profile supplied inward-wound triangles.
  if (normalLocal.dot(directionLocal) > 0) normalLocal.multiplyScalar(-1);
  return { pointLocal, normalLocal, distance: hit.distance, object: hit.object };
}

function markingQuaternion(
  normalLocal: THREE.Vector3,
  preferredTangent: THREE.Vector3 | null = null,
): THREE.Quaternion {
  let tangent = preferredTangent?.clone() || new THREE.Vector3(0, 0, 1);
  tangent.addScaledVector(normalLocal, -tangent.dot(normalLocal));
  if (tangent.lengthSq() < 1e-6) {
    tangent.set(0, 1, 0).addScaledVector(normalLocal, -normalLocal.y);
  }
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(normalLocal, tangent).normalize();
  const basis = new THREE.Matrix4().makeBasis(tangent, bitangent, normalLocal);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

const MARKING_VISIBILITY_SAMPLE_GRID = Object.freeze([
  [0, 0],
  [-0.28, -0.28], [0, -0.28], [0.28, -0.28],
  [-0.28, 0], [0.28, 0],
  [-0.28, 0.28], [0, 0.28], [0.28, 0.28],
]);

function markingOccluderMeshes(root: THREE.Object3D): VehicleMesh[] {
  const meshes: VehicleMesh[] = [];
  root.traverse((object) => {
    if (!isVehicleMesh(object)
        || object.userData?.vehicleMarking
        || !markingObjectVisibleInTree(object, root)
        || !object.geometry?.attributes?.position) return;
    meshes.push(object);
  });
  return meshes;
}

function doubleSidedMarkingRaycastScope(meshes: readonly VehicleMesh[]): () => void {
  const originalSides = new Map<THREE.Material, THREE.Side>();
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || originalSides.has(material)) continue;
      originalSides.set(material, material.side);
      material.side = THREE.DoubleSide;
    }
  }
  return () => {
    for (const [material, side] of originalSides) material.side = side;
  };
}

function markingVisibilityReceipt(
  owner: THREE.Object3D,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  size: number,
  occluders: VehicleMesh[],
): MarkingVisibilityReceipt {
  owner.updateWorldMatrix(true, true);
  const centerWorld = owner.localToWorld(position.clone());
  const worldQuaternion = owner.getWorldQuaternion(new THREE.Quaternion()).multiply(quaternion);
  const tangentWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();
  const bitangentWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
  const normalWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
  const expectedDistance = SURFACE_MARKING_STYLE.visibilityRayLengthM
    + SURFACE_MARKING_STYLE.surfaceLiftM;
  let clearSamples = 0;
  let maximumSurfaceErrorM = 0;
  for (const [u, v] of MARKING_VISIBILITY_SAMPLE_GRID) {
    const sample = centerWorld.clone()
      .addScaledVector(tangentWorld, u * size)
      .addScaledVector(bitangentWorld, v * size);
    const origin = sample.clone().addScaledVector(
      normalWorld, SURFACE_MARKING_STYLE.visibilityRayLengthM);
    const raycaster = new THREE.Raycaster(
      origin,
      normalWorld.clone().multiplyScalar(-1),
      0,
      expectedDistance + SURFACE_MARKING_STYLE.visibilityToleranceM,
    );
    const hit = raycaster.intersectObjects(occluders, false)[0];
    if (!hit) {
      maximumSurfaceErrorM = Infinity;
      continue;
    }
    const surfaceOffsetM = hit.distance - expectedDistance;
    const surfaceErrorM = Math.abs(surfaceOffsetM);
    maximumSurfaceErrorM = Math.max(maximumSurfaceErrorM, surfaceErrorM);
    if (surfaceOffsetM >= -SURFACE_MARKING_STYLE.visibilityOcclusionToleranceM
        && surfaceOffsetM <= SURFACE_MARKING_STYLE.visibilityToleranceM) clearSamples += 1;
  }
  return {
    visibilitySamples: MARKING_VISIBILITY_SAMPLE_GRID.length,
    visibilityClearSamples: clearSamples,
    visibilityRatio: clearSamples / MARKING_VISIBILITY_SAMPLE_GRID.length,
    maximumSurfaceErrorM,
    visibilityVerified: clearSamples >= SURFACE_MARKING_STYLE.minimumClearSamples,
  };
}

function markingSeatOverlaps(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  size: number,
  ownerName: VehicleOwner,
  avoid: readonly VehicleDecal[],
): boolean {
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  return avoid.some((placed) => {
    if (placed.parent !== ownerName || !placed.quaternion || !placed.pos) return false;
    const otherNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(placed.quaternion).normalize();
    if (normal.dot(otherNormal) < 0.7) return false;
    const minimumDistance = (size + placed.size) * 0.55
      + SURFACE_MARKING_STYLE.minimumSeparationM;
    return position.distanceTo(new THREE.Vector3(...placed.pos)) < minimumDistance;
  });
}

function markingSearchOffsets(): Array<[number, number]> {
  const longitudinal = [0, 0.05, -0.05, 0.11, -0.11, 0.18, -0.18, 0.27, -0.27];
  const vertical = [0, 0.06, -0.06, 0.13, -0.13, 0.21, -0.21, 0.32, -0.32];
  const offsets: Array<[number, number]> = [];
  for (const dz of longitudinal) {
    for (const dy of vertical) offsets.push([dz, dy]);
  }
  offsets.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1]))
    - (Math.abs(b[0]) + Math.abs(b[1])));
  return offsets;
}

const MARKING_SEARCH_OFFSETS = markingSearchOffsets();

function solveProfileMarkingSeat(
  profile: VehicleMarkingAnchor,
  owner: THREE.Object3D,
  ownerName: VehicleOwner,
  meshes: VehicleMesh[],
  occluders: VehicleMesh[],
  longitudinal: number,
  size: number,
  avoid: readonly VehicleDecal[] = [],
  vertical = profile.vertical,
): MarkingCandidate | null {
  const bounds = markingLocalBounds(owner, meshes);
  if (bounds.isEmpty()) return null;
  const width = bounds.max.x - bounds.min.x;
  const rayDirection = new THREE.Vector3(profile.side === 'right' ? -1 : 1, 0, 0);
  const originX = profile.side === 'right' ? bounds.max.x + 0.24 : bounds.min.x - 0.24;
  let best: MarkingCandidate | null = null;
  for (const [dz, dy] of MARKING_SEARCH_OFFSETS) {
    const zT = THREE.MathUtils.clamp(longitudinal + dz, 0.08, 0.92);
    const yT = THREE.MathUtils.clamp(vertical + dy, 0.12, 0.90);
    const origin = new THREE.Vector3(
      originX,
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, yT),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, zT),
    );
    const hit = raySeatMarking(owner, meshes, origin, rayDirection, width + 0.7);
    if (!hit) continue;
    const tangent = new THREE.Vector3(0, 0, profile.side === 'right' ? -1 : 1);
    const position = hit.pointLocal.clone().addScaledVector(
      hit.normalLocal, SURFACE_MARKING_STYLE.surfaceLiftM);
    const quaternion = markingQuaternion(hit.normalLocal, tangent);
    if (markingSeatOverlaps(position, quaternion, size, ownerName, avoid)) continue;
    const receipt = markingVisibilityReceipt(owner, position, quaternion, size, occluders);
    const candidate = {
      ...hit,
      position,
      quaternion,
      ...receipt,
      searchDistance: Math.abs(dz) + Math.abs(dy),
    };
    if (!best
        || candidate.visibilityClearSamples > best.visibilityClearSamples
        || (candidate.visibilityClearSamples === best.visibilityClearSamples
          && candidate.searchDistance < best.searchDistance)) best = candidate;
    if (candidate.visibilityClearSamples === SURFACE_MARKING_STYLE.visibilitySampleCount) {
      return candidate;
    }
  }
  return best;
}

function reseatAuthoredMarking(
  decal: VehicleDecal,
  owner: THREE.Object3D,
  meshes: VehicleMesh[],
  occluders: VehicleMesh[],
): boolean {
  const euler = new THREE.Euler(decal.rotX, decal.rotY, decal.rotZ, 'ZYX');
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize();
  const tangent = new THREE.Vector3(1, 0, 0).applyEuler(euler).normalize();
  const position = new THREE.Vector3(...decal.pos);
  const attempts = [
    [position.clone().addScaledVector(normal, 0.12), normal.clone().multiplyScalar(-1)],
    [position.clone().addScaledVector(normal, -0.12), normal.clone()],
  ];
  let best: (MarkingHit & { delta: number }) | null = null;
  for (const [origin, direction] of attempts) {
    const hit = raySeatMarking(owner, meshes, origin, direction, 0.42);
    if (!hit) continue;
    const delta = hit.pointLocal.distanceTo(position);
    if (delta <= 0.30 && (!best || delta < best.delta)) best = { ...hit, delta };
  }
  if (!best) return false;
  decal.pos = best.pointLocal.clone().addScaledVector(
    best.normalLocal, SURFACE_MARKING_STYLE.surfaceLiftM).toArray();
  decal.quaternion = markingQuaternion(best.normalLocal, tangent);
  decal.surfaceSupported = true;
  decal.supportGapM = SURFACE_MARKING_STYLE.surfaceLiftM;
  decal.surfaceMesh = best.object.name;
  const size = Number(decal.size) || 0;
  const receipt = markingVisibilityReceipt(
    owner, new THREE.Vector3(...decal.pos), decal.quaternion, size, occluders);
  Object.assign(decal, receipt);
  return size >= SURFACE_MARKING_STYLE.minimumReadableSizeM && receipt.visibilityVerified;
}

function bestProfileMarkingSeatForOwner(
  profile: VehicleMarkingAnchor,
  ownerName: VehicleOwner,
  sideOrder: readonly VehicleMarkingAnchor['side'][],
  owners: Record<VehicleOwner, THREE.Group>,
  surfaces: Record<VehicleOwner, VehicleMesh[]>,
  occluders: VehicleMesh[],
  longitudinal: number,
  candidateSize: number,
  avoid: readonly VehicleDecal[],
  current: ProfileMarkingSeat | null,
): ProfileMarkingSeat | null {
  let selected = current;
  for (const side of sideOrder) {
    const candidate = solveProfileMarkingSeat(
      { ...profile, owner: ownerName, side },
      owners[ownerName],
      ownerName,
      surfaces[ownerName],
      occluders,
      longitudinal,
      candidateSize,
      avoid,
    );
    if (!candidate) continue;
    if (!selected
        || candidate.visibilityClearSamples > selected.candidate.visibilityClearSamples) {
      selected = { candidate, owner: ownerName, size: candidateSize };
    }
    if (candidate.visibilityVerified) break;
  }
  return selected;
}

function findProfileMarkingSeat(
  profile: VehicleMarkingAnchor,
  owners: Record<VehicleOwner, THREE.Group>,
  surfaces: Record<VehicleOwner, VehicleMesh[]>,
  occluders: VehicleMesh[],
  longitudinal: number,
  size: number,
  avoid: readonly VehicleDecal[],
): ProfileMarkingSeat | null {
  const readableSize = Math.max(size, SURFACE_MARKING_STYLE.minimumReadableSizeM);
  const candidateSizes = [...new Set([
    readableSize,
    Math.max(SURFACE_MARKING_STYLE.minimumReadableSizeM, readableSize * 0.88),
    SURFACE_MARKING_STYLE.minimumReadableSizeM,
  ])];
  const ownerOrder: VehicleOwner[] = [
    profile.owner, profile.owner === 'turret' ? 'hull' : 'turret',
  ];
  const sideOrder: Array<VehicleMarkingAnchor['side']> = [
    profile.side, profile.side === 'right' ? 'left' : 'right',
  ];
  let selected: ProfileMarkingSeat | null = null;
  for (const candidateSize of candidateSizes) {
    for (const ownerName of ownerOrder) {
      selected = bestProfileMarkingSeatForOwner(
        profile, ownerName, sideOrder, owners, surfaces, occluders,
        longitudinal, candidateSize, avoid, selected);
      if (selected?.candidate.visibilityVerified) break;
    }
    if (selected?.candidate.visibilityVerified) break;
  }
  return selected;
}

function addProfileVehicleDecal(
  spec: FactoryTankSpec,
  marking: VehicleMarkingRecord,
  decals: VehicleDecal[],
  profile: VehicleMarkingAnchor,
  owners: Record<VehicleOwner, THREE.Group>,
  surfaces: Record<VehicleOwner, VehicleMesh[]>,
  occluders: VehicleMesh[],
  kind: string,
  longitudinal: number,
  size: number,
): boolean {
  const avoid = decals.filter((decal) => decal.kind === 'insignia'
    || decal.kind === 'designation');
  const selected = findProfileMarkingSeat(
    profile, owners, surfaces, occluders, longitudinal, size, avoid);
  if (!selected) return false;
  const seat = selected.candidate;
  decals.push({
    parent: selected.owner,
    kind,
    text: kind === 'designation' ? marking.tacticalNumber : null,
    size: selected.size,
    pos: seat.position.toArray(),
    rotY: 0, rotX: 0, rotZ: 0,
    quaternion: seat.quaternion,
    surfaceSupported: true,
    supportGapM: SURFACE_MARKING_STYLE.surfaceLiftM,
    surfaceMesh: seat.object.name,
    anchorProfile: spec.id,
    visibilitySamples: seat.visibilitySamples,
    visibilityClearSamples: seat.visibilityClearSamples,
    visibilityRatio: seat.visibilityRatio,
    maximumSurfaceErrorM: seat.maximumSurfaceErrorM,
    visibilityVerified: seat.visibilityVerified,
  });
  return true;
}

export function finalizeVehicleMarkingSeats(
  spec: FactoryTankSpec,
  marking: VehicleMarkingRecord,
  decals: VehicleDecal[],
  root: THREE.Object3D,
  hullG: THREE.Group,
  turretG: THREE.Group,
): void {
  const owners: Record<VehicleOwner, THREE.Group> = { hull: hullG, turret: turretG };
  const surfaces: Record<VehicleOwner, VehicleMesh[]> = {
    hull: markingArmorMeshes(hullG, 'hull', vehicleMarkingIncludesPermanentHullArmor(spec.id)),
    turret: markingArmorMeshes(turretG, 'turret'),
  };
  const occluders = markingOccluderMeshes(root);
  const restoreMaterialSides = doubleSidedMarkingRaycastScope(occluders);
  try {
  // Existing family-authored stars, crosses and tactical numbers stay in
  // their chosen historical stations, but are snapped to the actual armor
  // below them. Unsupported legacy planes are discarded rather than allowed
  // to hover beside a reshaped turret.
  for (let index = decals.length - 1; index >= 0; index -= 1) {
    const decal = decals[index];
    if (decal.kind !== 'insignia' && decal.kind !== 'designation') continue;
    const ownerName = decal.parent === 'turret' ? 'turret' : 'hull';
    if (!reseatAuthoredMarking(
      decal, owners[ownerName], surfaces[ownerName], occluders)) {
      decals.splice(index, 1);
    } else {
      decal.anchorProfile = 'authored-surface-seat';
    }
  }

  const profile = vehicleMarkingAnchor(spec.id);
  if (!profile) return;
  if (!decals.some((decal) => decal.kind === 'insignia')) {
    addProfileVehicleDecal(
      spec, marking, decals, profile, owners, surfaces, occluders,
      'insignia', profile.longitudinal, profile.sizeM);
  }
  if (!decals.some((decal) => decal.kind === 'designation')) {
    const textZ = THREE.MathUtils.clamp(
      profile.longitudinal + profile.designationDirection * 0.11, 0.10, 0.90);
    addProfileVehicleDecal(
      spec, marking, decals, profile, owners, surfaces, occluders,
      'designation', textZ, profile.sizeM);
  }
  } finally {
    restoreMaterialSides();
  }
}

function isRuntimeRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function isNumberTuple(entry: RuntimeValue, length: number): boolean {
  return Array.isArray(entry)
    && entry.length === length
    && entry.every((component) => typeof component === 'number');
}

function hasVerifiedMarkingSeatIdentity(value: Record<string, RuntimeValue>): boolean {
  return (value.parent === 'hull' || value.parent === 'turret')
    && typeof value.kind === 'string'
    && typeof value.size === 'number'
    && typeof value.surfaceMesh === 'string'
    && typeof value.anchorProfile === 'string';
}

function hasVerifiedMarkingSeatVisibility(value: Record<string, RuntimeValue>): boolean {
  return typeof value.visibilitySamples === 'number'
    && typeof value.visibilityClearSamples === 'number'
    && typeof value.visibilityRatio === 'number'
    && (value.maximumSurfaceErrorM === null
      || typeof value.maximumSurfaceErrorM === 'number');
}

export function isVerifiedMarkingSeat(value: RuntimeValue): value is VerifiedMarkingSeat {
  return isRuntimeRecord(value)
    && hasVerifiedMarkingSeatIdentity(value)
    && isNumberTuple(value.pos, 3)
    && isNumberTuple(value.quaternion, 4)
    && hasVerifiedMarkingSeatVisibility(value);
}

export function applyVerifiedVehicleMarkingSeats(
  marking: VehicleMarkingRecord,
  decals: VehicleDecal[],
  seats: readonly VerifiedMarkingSeat[],
): void {
  // Builder-authored identity planes are inputs to the authoritative solver,
  // not a second runtime layer. Replace them with the exact generated output
  // of that solver so the visible result remains identical without repeating
  // hundreds of full-triangle raycasts during an interactive tank switch.
  for (let index = decals.length - 1; index >= 0; index -= 1) {
    if (decals[index].kind === 'insignia' || decals[index].kind === 'designation') {
      decals.splice(index, 1);
    }
  }
  for (const seat of seats) {
    decals.push({
      parent: seat.parent,
      kind: seat.kind,
      text: seat.kind === 'designation' ? marking.tacticalNumber : null,
      size: seat.size,
      pos: [...seat.pos],
      rotY: 0, rotX: 0, rotZ: 0,
      quaternion: new THREE.Quaternion(...seat.quaternion),
      surfaceSupported: true,
      supportGapM: SURFACE_MARKING_STYLE.surfaceLiftM,
      surfaceMesh: seat.surfaceMesh,
      anchorProfile: seat.anchorProfile,
      visibilitySamples: seat.visibilitySamples,
      visibilityClearSamples: seat.visibilityClearSamples,
      visibilityRatio: seat.visibilityRatio,
      maximumSurfaceErrorM: seat.maximumSurfaceErrorM,
      visibilityVerified: true,
    });
  }
}

interface MarkingHit {
  pointLocal: THREE.Vector3;
  normalLocal: THREE.Vector3;
  distance: number;
  object: VehicleMesh;
}

interface MarkingVisibilityReceipt {
  visibilitySamples: number;
  visibilityClearSamples: number;
  visibilityRatio: number;
  maximumSurfaceErrorM: number;
  visibilityVerified: boolean;
}

interface MarkingCandidate extends MarkingHit, MarkingVisibilityReceipt {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  searchDistance: number;
}

export interface VerifiedMarkingSeat {
  parent: VehicleOwner;
  kind: string;
  size: number;
  pos: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  surfaceMesh: string;
  anchorProfile: string;
  visibilitySamples: number;
  visibilityClearSamples: number;
  visibilityRatio: number;
  maximumSurfaceErrorM: number | null;
}

interface ProfileMarkingSeat {
  candidate: MarkingCandidate;
  owner: VehicleOwner;
  size: number;
}
