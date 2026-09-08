// Explicit native-QA framing only. Never scan or raycast world fixtures in a
// game frame; use authored masks and actual intact instance transforms.
import { Box3, InstancedMesh, Matrix3, Matrix4, Raycaster, Vector3,
  type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { WORLD_FIXTURE_ACTIVE_ATTRIBUTE } from '../world/worldNightFixtureInstances.ts';

export type NightWorldFixtureKind = 'structure-window' | 'relay-beacon' | 'lighthouse' | 'streetlamp';
const FIXTURE_VIEW = {
  'structure-window': { distance: 4, fov: 40, mask: 1 },
  'relay-beacon': { distance: 5, fov: 40, mask: 2 },
  lighthouse: { distance: 8, fov: 44, mask: 1 },
  streetlamp: { distance: 7, fov: 48, mask: 1 },
} as const;
interface FixtureFace {
  readonly mesh: Mesh;
  readonly faceIndex: number;
  readonly slot: number | null;
  readonly point: Vector3;
  readonly direction: Vector3;
  readonly score: number;
}
export interface NightWorldFixtureInspection {
  readonly kind: NightWorldFixtureKind;
  readonly ownerUuid: string;
  readonly ownerName: string;
  readonly materialUuid: string;
  readonly faceIndex: number;
  readonly slot: number | null;
  readonly mask: 1 | 2;
  readonly point: number[];
  /** Lamp pool position is the whole lens center, not a visible face centroid. */
  readonly sourcePoint?: number[];
  readonly direction: number[];
  readonly camera: number[];
  readonly fov: number;
  readonly lineOfSight: 'authored-emissive-face';
}

function eligible(mesh: Mesh, kind: NightWorldFixtureKind): boolean {
  if (!mesh.isMesh || Array.isArray(mesh.material)) return false;
  if (mesh.material.userData.nightEmissionMask !== true) return false;
  if (kind === 'streetlamp') return mesh instanceof InstancedMesh && mesh.name === 'destructible-lamp';
  if (mesh.material.userData.nightLightKind !== 'fixture') return false;
  if (kind === 'relay-beacon') return mesh instanceof InstancedMesh && mesh.name === 'destructible-relaystation';
  if (kind === 'structure-window') return mesh instanceof InstancedMesh
    && ['destructible-securityoffice', 'destructible-servicegarage', 'destructible-corneroffice'].includes(mesh.name);
  // The only authored static warm mask in the physical-glass bucket is the
  // lighthouse lantern; generic glass retains mask0 in the shared draw.
  return !(mesh instanceof InstancedMesh) && (mesh.material as MeshStandardMaterial).type === 'MeshPhysicalMaterial';
}

function appendFaces(mesh: Mesh, matrix: Matrix4, slot: number | null,
  reference: Vector3, maskValue: number, out: FixtureFace[]): void {
  const geometry = mesh.geometry, mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  if (!mask || !position || !normal) return;
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  for (let offset = 0, count = geometry.index?.count ?? position.count; offset < count; offset += 3) {
    const ids = [0, 1, 2].map(i => geometry.index?.getX(offset + i) ?? offset + i);
    if (ids.some(index => mask.getX(index) !== maskValue)) continue;
    const point = new Vector3(), direction = new Vector3();
    for (const index of ids) {
      point.add(new Vector3().fromBufferAttribute(position, index));
      direction.add(new Vector3().fromBufferAttribute(normal, index));
    }
    direction.normalize().applyNormalMatrix(normalMatrix);
    if (Math.abs(direction.y) > .35) continue;
    point.multiplyScalar(1 / 3).applyMatrix4(matrix);
    out.push({ mesh, faceIndex: offset / 3, slot, point, direction, score: point.distanceToSquared(reference) });
  }
}

function candidates(root: Object3D, reference: Vector3, kind: NightWorldFixtureKind): FixtureFace[] {
  const out: FixtureFace[] = [], instance = new Matrix4(), world = new Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    const mesh = object as Mesh;
    if (!eligible(mesh, kind)) return;
    const maskValue = kind === 'relay-beacon' ? 2 : 1;
    if (!(mesh instanceof InstancedMesh)) {
      appendFaces(mesh, mesh.matrixWorld, null, reference, maskValue, out); return;
    }
    const active = mesh.geometry.getAttribute(WORLD_FIXTURE_ACTIVE_ATTRIBUTE);
    if (!active) return;
    for (let slot = 0; slot < mesh.count; slot++) {
      if (active.getX(slot) < .5) continue;
      mesh.getMatrixAt(slot, instance); world.multiplyMatrices(mesh.matrixWorld, instance);
      if (Math.abs(world.determinant()) < 1e-8) continue;
      appendFaces(mesh, world, slot, reference, maskValue, out);
    }
  });
  return out.sort((a, b) => a.score - b.score).slice(0, 128);
}

function visibleInRoot(object: Object3D, root: Object3D): boolean {
  for (let owner: Object3D | null = object; owner; owner = owner.parent) {
    if (!owner.visible) return false;
    if (owner === root) return true;
  }
  return false;
}

function unobstructed(root: Object3D, face: FixtureFace, camera: Vector3): boolean {
  const direction = face.point.clone().sub(camera), distance = direction.length();
  const ray = new Raycaster(camera.clone(), direction.normalize(), .02, distance + .02);
  const hit = ray.intersectObject(root, true).find(hit => visibleInRoot(hit.object, root));
  if (!hit || hit.object !== face.mesh || hit.faceIndex !== face.faceIndex || (hit.instanceId ?? null) !== face.slot) return false;
  const outward = camera.clone().sub(face.point).normalize();
  ray.set(face.point.clone().addScaledVector(outward, .03), outward); ray.far = distance - .03;
  return !ray.intersectObject(root, true).some(hit => visibleInRoot(hit.object, root));
}

function lampSourcePoint(face: FixtureFace): number[] {
  const mesh = face.mesh as InstancedMesh, geometry = mesh.geometry;
  const mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE), position = geometry.getAttribute('position');
  const bounds = new Box3(), vertex = new Vector3(), instance = new Matrix4();
  for (let index = 0; index < mask.count; index++) {
    if (mask.getX(index) === 1) bounds.expandByPoint(vertex.fromBufferAttribute(position, index));
  }
  mesh.getMatrixAt(face.slot!, instance);
  return bounds.getCenter(vertex).applyMatrix4(instance).applyMatrix4(mesh.matrixWorld).toArray();
}

export function inspectNightWorldFixture(
  root: Object3D, reference: Vector3, kind: NightWorldFixtureKind,
): NightWorldFixtureInspection | null {
  if (!Object.hasOwn(FIXTURE_VIEW, kind)) throw new TypeError('Unknown authored fixture kind');
  const view = FIXTURE_VIEW[kind];
  for (const face of candidates(root, reference, kind)) {
    const side = new Vector3(-face.direction.z, 0, face.direction.x).normalize();
    const camera = face.point.clone().addScaledVector(face.direction, view.distance).addScaledVector(side, .65);
    camera.y += .25;
    if (!unobstructed(root, face, camera)) continue;
    const material = face.mesh.material as MeshStandardMaterial;
    return { kind, ownerUuid: face.mesh.uuid, ownerName: face.mesh.name, materialUuid: material.uuid,
      faceIndex: face.faceIndex, slot: face.slot, mask: view.mask,
      point: face.point.toArray(), sourcePoint: kind === 'streetlamp' ? lampSourcePoint(face) : undefined,
      direction: face.direction.toArray(), camera: camera.toArray(),
      fov: view.fov, lineOfSight: 'authored-emissive-face' };
  }
  return null;
}
