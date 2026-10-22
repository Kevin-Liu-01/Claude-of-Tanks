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

/**
 * A camouflage suit's cloth (ghillieSuit.ts: the net and garnish, nonArmor open-lattice dressing named
 * <id>_ghillie_<owner>_net / _leaves): paint is never backed by it. 2026-10-21 (the M1A1 Abrams FEP): its hull
 * insignia read 6/9 clear on the ULCANS drape hanging in its paint plane, the armour 6-8 cm behind and the drape over
 * its middle row; a sample whose first surface is the suit's cloth is not clear (the impact decals' rule,
 * fx/impactDecals.ts isImpactDecalSkin).
 */
function isSuitCloth(object: THREE.Object3D): boolean {
  return object.userData?.continuityRole === 'open-lattice' && /_ghillie_/.test(object.name);
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
  return boundedMarkingVisibilityReceipt(owner, position, quaternion, size, occluders, -1) as MarkingVisibilityReceipt;
}

/**
 * The visibility receipt, abandoned (null) as soon as the samples left cannot lift its clear count above `mustExceed`:
 * the search then knows the candidate cannot be chosen, and its remaining rays are never cast.
 */
function boundedMarkingVisibilityReceipt(
  owner: THREE.Object3D,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  size: number,
  occluders: VehicleMesh[],
  mustExceed: number,
): MarkingVisibilityReceipt | null {
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
  let measured = 0;
  for (const [u, v] of MARKING_VISIBILITY_SAMPLE_GRID) {
    if (clearSamples + (MARKING_VISIBILITY_SAMPLE_GRID.length - measured) <= mustExceed) return null;
    measured += 1;
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
        && surfaceOffsetM <= SURFACE_MARKING_STYLE.visibilityToleranceM
        && !isSuitCloth(hit.object)) clearSamples += 1;
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
  mustExceedClear = -1,
  reach: MarkingReach | null = null,
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
    if (reach && position.distanceTo(reach.point) > reach.maxM) continue;
    if (markingSeatOverlaps(position, quaternion, size, ownerName, avoid)) continue;
    // 2026-10-05 (leo2a6_ua: 724 candidates, 6,525 visibility rays per receipt build). A candidate stops casting its
    // visibility rays once it can no longer be chosen, which leaves every seat exactly as the full search chose it: a
    // later candidate replaces the best only with more clear samples (the offsets run outward, so a tie keeps the
    // nearer one), and this side's result matters to the caller only above its current selection's count.
    const floor = Math.max(best ? best.visibilityClearSamples : -1, mustExceedClear);
    const receipt = boundedMarkingVisibilityReceipt(owner, position, quaternion, size, occluders, floor);
    if (!receipt) continue;
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
      profile.vertical,
      selected ? selected.candidate.visibilityClearSamples : -1,
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

/**
 * netting-225 (2026-10-14, seat stability; the coordinator's ruling on the netted hulls): a re-solve starts from the
 * vehicle's own verified seats. The search runs outward from the profile's anchor and takes the first candidate that
 * reads best, so a change elsewhere on a vehicle (a camouflage suit laid differently, a fitting) moved markings that
 * still read clear, by up to 3.6 m (25 seats on the netted hulls). Now a profile seat that still sits on its armour and
 * reads at least its recorded clear count stands as it was; one that reads fewer is searched again round where it
 * stood, never farther than MARKING_RESEAT_REACH_M; only where nothing within that reach reads the minimum does the
 * profile's own search range further.
 */
const MARKING_RESEAT_REACH_M = 0.5;
/** How far a standing seat may lie off the armour it was solved on (its lift aside), and turn off its normal. */
const MARKING_STANDING_SURFACE_M = 0.002;
const MARKING_STANDING_NORMAL_COS = Math.cos(THREE.MathUtils.degToRad(5));

interface MarkingReach {
  readonly point: THREE.Vector3;
  readonly maxM: number;
}

/** The prior seat's visibility receipt when it still stands (on its armour, clear of the others, as clear as recorded). */
function standingMarkingSeat(
  prior: VerifiedMarkingSeat,
  owner: THREE.Object3D,
  meshes: VehicleMesh[],
  occluders: VehicleMesh[],
  avoid: readonly VehicleDecal[],
): MarkingVisibilityReceipt | null {
  const position = new THREE.Vector3(...prior.pos);
  const quaternion = new THREE.Quaternion(...prior.quaternion);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  const hit = raySeatMarking(owner, meshes, position.clone().addScaledVector(normal, 0.12), normal.clone().negate(), 0.42);
  if (!hit || hit.object.name !== prior.surfaceMesh) return null;
  const seated = hit.pointLocal.clone().addScaledVector(hit.normalLocal, SURFACE_MARKING_STYLE.surfaceLiftM);
  if (seated.distanceTo(position) > MARKING_STANDING_SURFACE_M
      || hit.normalLocal.dot(normal) < MARKING_STANDING_NORMAL_COS) return null;
  if (markingSeatOverlaps(position, quaternion, prior.size, prior.parent, avoid)) return null;
  const receipt = markingVisibilityReceipt(owner, position, quaternion, prior.size, occluders);
  return receipt.visibilityVerified && receipt.visibilityClearSamples >= prior.visibilityClearSamples ? receipt : null;
}

/** The best seat within MARKING_RESEAT_REACH_M of the prior one (its owner, either side, its size or smaller). */
function reseatNearPriorMarking(
  profile: VehicleMarkingAnchor,
  prior: VerifiedMarkingSeat,
  owners: Record<VehicleOwner, THREE.Group>,
  surfaces: Record<VehicleOwner, VehicleMesh[]>,
  occluders: VehicleMesh[],
  avoid: readonly VehicleDecal[],
): ProfileMarkingSeat | null {
  const ownerName = prior.parent;
  const owner = owners[ownerName];
  const bounds = markingLocalBounds(owner, surfaces[ownerName]);
  if (bounds.isEmpty()) return null;
  const point = new THREE.Vector3(...prior.pos);
  const reach = { point, maxM: MARKING_RESEAT_REACH_M };
  const share = (value: number, min: number, max: number): number => (max - min > 1e-6 ? (value - min) / (max - min) : 0.5);
  const longitudinal = share(point.z, bounds.min.z, bounds.max.z);
  const vertical = share(point.y, bounds.min.y, bounds.max.y);
  const near: VehicleMarkingAnchor['side'] = point.x >= (bounds.min.x + bounds.max.x) / 2 ? 'right' : 'left';
  const sizes = [...new Set([prior.size, prior.size * 0.88, SURFACE_MARKING_STYLE.minimumReadableSizeM])]
    .filter((size) => size >= SURFACE_MARKING_STYLE.minimumReadableSizeM && size <= prior.size);
  let selected: ProfileMarkingSeat | null = null;
  for (const size of sizes) {
    for (const side of [near, near === 'right' ? 'left' : 'right'] as const) {
      const candidate = solveProfileMarkingSeat(
        { ...profile, owner: ownerName, side }, owner, ownerName, surfaces[ownerName], occluders,
        longitudinal, size, avoid, vertical, selected ? selected.candidate.visibilityClearSamples : -1, reach);
      if (candidate && (!selected || candidate.visibilityClearSamples > selected.candidate.visibilityClearSamples)) {
        selected = { candidate, owner: ownerName, size };
      }
    }
    if (selected && selected.candidate.visibilityClearSamples >= prior.visibilityClearSamples) break;
  }
  return selected?.candidate.visibilityVerified ? selected : null;
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
  prior: VerifiedMarkingSeat | null = null,
): boolean {
  const avoid = decals.filter((decal) => decal.kind === 'insignia'
    || decal.kind === 'designation');
  if (prior) {
    const standing = standingMarkingSeat(prior, owners[prior.parent], surfaces[prior.parent], occluders, avoid);
    if (standing) {
      // as recorded, unless it now reads clearer (a re-measure of the same seat never rewrites it by rounding noise)
      const was = prior.maximumSurfaceErrorM ?? Infinity, now = standing.maximumSurfaceErrorM;
      const same = standing.visibilityClearSamples === prior.visibilityClearSamples
        && (Number.isFinite(was) ? Math.abs(now - was) < 1e-6 : !Number.isFinite(now));
      decals.push({
        parent: prior.parent,
        kind,
        text: kind === 'designation' ? marking.tacticalNumber : null,
        size: prior.size,
        pos: [...prior.pos],
        rotY: 0, rotX: 0, rotZ: 0,
        quaternion: new THREE.Quaternion(...prior.quaternion),
        surfaceSupported: true,
        supportGapM: SURFACE_MARKING_STYLE.surfaceLiftM,
        surfaceMesh: prior.surfaceMesh,
        anchorProfile: spec.id,
        visibilitySamples: standing.visibilitySamples,
        visibilityClearSamples: standing.visibilityClearSamples,
        visibilityRatio: same ? prior.visibilityRatio : standing.visibilityRatio,
        // (a record's unbounded error is written null: it stays unbounded)
        maximumSurfaceErrorM: same ? was : standing.maximumSurfaceErrorM,
        visibilityVerified: true,
      });
      return true;
    }
  }
  const selected = (prior && reseatNearPriorMarking(profile, prior, owners, surfaces, occluders, avoid))
    || findProfileMarkingSeat(profile, owners, surfaces, occluders, longitudinal, size, avoid);
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

/**
 * Re-measure a seated marking's visibility on the built vehicle, as the solver measured it (the same nine-ray footprint
 * against every other visible mesh, both faces). The fleet audit holds the generated seats to the armor this way
 * (2026-10-05: receipt builds apply them instead of re-solving).
 */
export function measureSeatedMarkingVisibility(
  root: THREE.Object3D,
  mark: THREE.Object3D,
): { readonly visibilitySamples: number; readonly visibilityClearSamples: number } {
  const owner = mark.parent;
  if (!owner) throw new Error('measureSeatedMarkingVisibility: the marking has no owner');
  root.updateMatrixWorld(true);
  const occluders = markingOccluderMeshes(root);
  const restoreMaterialSides = doubleSidedMarkingRaycastScope(occluders);
  try {
    const receipt = markingVisibilityReceipt(owner, mark.position, mark.quaternion, mark.scale.x, occluders);
    return { visibilitySamples: receipt.visibilitySamples, visibilityClearSamples: receipt.visibilityClearSamples };
  } finally {
    restoreMaterialSides();
  }
}

export function finalizeVehicleMarkingSeats(
  spec: FactoryTankSpec,
  marking: VehicleMarkingRecord,
  decals: VehicleDecal[],
  root: THREE.Object3D,
  hullG: THREE.Group,
  turretG: THREE.Group,
  priorSeats: readonly RuntimeValue[] | null = null,
): void {
  const owners: Record<VehicleOwner, THREE.Group> = { hull: hullG, turret: turretG };
  // netting-225 seat stability: the vehicle's seat of a kind as last verified (the generator's registry): its profile
  // seat, else a builder's station the solver must now replace (searched round where it stood)
  const priorProfileSeat = (kind: string): VerifiedMarkingSeat | null => {
    const prior = (priorSeats ?? []).filter((seat): seat is VerifiedMarkingSeat => isVerifiedMarkingSeat(seat) && seat.kind === kind);
    return prior.find((seat) => seat.anchorProfile === spec.id) ?? prior[0] ?? null;
  };
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
  // netting-225 seat stability: where the last verified seats solved a kind on the profile (the builder's own station
  // read too faint then), that station stays retired while the profile's seat stands (the Type 90A's two, revived when
  // its suit's garnish came to lie flat, moved both its markings by 0.4 to 0.7 m)
  const profileSolved = (kind: string): boolean => {
    const prior = (priorSeats ?? []).filter((seat): seat is VerifiedMarkingSeat => isVerifiedMarkingSeat(seat) && seat.kind === kind);
    return prior.length > 0 && prior.every((seat) => seat.anchorProfile === spec.id);
  };
  for (let index = decals.length - 1; index >= 0; index -= 1) {
    const decal = decals[index];
    if (decal.kind !== 'insignia' && decal.kind !== 'designation') continue;
    const ownerName = decal.parent === 'turret' ? 'turret' : 'hull';
    if (profileSolved(decal.kind) || !reseatAuthoredMarking(
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
      'insignia', profile.longitudinal, profile.sizeM, priorProfileSeat('insignia'));
  }
  if (!decals.some((decal) => decal.kind === 'designation')) {
    const textZ = THREE.MathUtils.clamp(
      profile.longitudinal + profile.designationDirection * 0.11, 0.10, 0.90);
    addProfileVehicleDecal(
      spec, marking, decals, profile, owners, surfaces, occluders,
      'designation', textZ, profile.sizeM, priorProfileSeat('designation'));
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
