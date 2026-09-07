// Explicit diagnostics only: select a real outward-facing lit pane and prove
// its camera sightline against rendered geometry. Never part of a frame loop.
import { Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';

interface WindowCandidate {
  mesh: Mesh;
  faceIndex: number;
  point: Vector3;
  direction: Vector3;
  score: number;
}

export interface NightWindowInspection {
  kind: 'window';
  ownerUuid: string;
  faceIndex: number;
  point: number[];
  direction: number[];
  camera: number[];
  lineOfSight: 'authored-emissive-face';
}

function visibleInRoot(object: Object3D, root: Object3D): boolean {
  for (let parent: Object3D | null = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
    if (parent === root) return true;
  }
  return false;
}

function windowCandidates(root: Object3D, reference: Vector3): WindowCandidate[] {
  const candidates: WindowCandidate[] = [];
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.userData.nightLightKind !== 'window') return;
    const { geometry } = mesh, mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!mask || !position || !normal) return;
    const count = geometry.index?.count ?? position.count;
    for (let offset = 0; offset < count; offset += 3) {
      const ids = [0, 1, 2].map(i => geometry.index?.getX(offset + i) ?? offset + i);
      if (ids.some(i => mask.getX(i) !== 1)) continue;
      const direction = new Vector3().fromBufferAttribute(normal, ids[0]).transformDirection(mesh.matrixWorld);
      if (Math.abs(direction.y) > .25) continue;
      const point = new Vector3();
      for (const id of ids) point.add(new Vector3().fromBufferAttribute(position, id));
      point.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
      candidates.push({ mesh, faceIndex: offset / 3, point, direction, score: point.distanceToSquared(reference) });
    }
  });
  return candidates.sort((a, b) => a.score - b.score).slice(0, 64);
}

function unobstructedPane(root: Object3D, candidate: WindowCandidate, camera: Vector3): boolean {
  const direction = candidate.point.clone().sub(camera), distance = direction.length();
  const ray = new Raycaster(camera, direction.normalize(), .02, distance + .02);
  const hit = ray.intersectObject(root, true).find(hit => visibleInRoot(hit.object, root));
  if (!hit || hit.object !== candidate.mesh || hit.faceIndex !== candidate.faceIndex) return false;
  // Reverse trace also rejects a camera inside a neighboring single-sided wall.
  const outward = camera.clone().sub(candidate.point).normalize();
  ray.set(candidate.point.clone().addScaledVector(outward, .03), outward);
  ray.far = distance - .03;
  return !ray.intersectObject(root, true).some(hit => visibleInRoot(hit.object, root));
}

export function inspectNightWindow(root: Object3D, reference: Vector3): NightWindowInspection | null {
  for (const candidate of windowCandidates(root, reference)) {
    const side = new Vector3(-candidate.direction.z, 0, candidate.direction.x);
    const camera = candidate.point.clone().addScaledVector(candidate.direction, 4)
      .addScaledVector(side, .65).add(new Vector3(0, .25, 0));
    if (!unobstructedPane(root, candidate, camera)) continue;
    return { kind: 'window', ownerUuid: candidate.mesh.uuid, faceIndex: candidate.faceIndex,
      point: candidate.point.toArray(), direction: candidate.direction.toArray(), camera: camera.toArray(),
      lineOfSight: 'authored-emissive-face' };
  }
  return null;
}
