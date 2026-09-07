// Explicit diagnostics only: select a real outward-facing lit pane and prove
// its camera sightline against rendered geometry. Never part of a frame loop.
import { Matrix3, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { vehicleNightLightEmittersFor } from '../vehicles/vehicleNightLighting.ts';

type ApertureKind = 'window' | 'shtora' | 'headlight';

interface WindowCandidate {
  mesh: Mesh;
  faceIndex: number;
  point: Vector3;
  direction: Vector3;
  score: number;
}

export interface NightWindowInspection {
  kind: ApertureKind;
  ownerUuid: string;
  materialUuid: string;
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

function belongsToHeadlight(mesh: Mesh, point: Vector3): boolean {
  let nearest = Infinity, selected = null;
  for (const lamp of vehicleNightLightEmittersFor(mesh)) {
    const distance = point.distanceToSquared(new Vector3().fromArray(lamp.position));
    if (distance < nearest) { nearest = distance; selected = lamp; }
  }
  // Mask1 also includes parking lamps. The nearest authored source, not color
  // or generic glass ownership, distinguishes the actual driving aperture.
  return selected?.kind === 'headlight';
}

function windowCandidates(root: Object3D, reference: Vector3, kind: ApertureKind): WindowCandidate[] {
  const candidates: WindowCandidate[] = [];
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const authored = kind === 'window' ? mesh.material.userData.nightLightKind === 'window'
      : mesh.material.userData.nightEmissionMask === true;
    if (!authored) return;
    const { geometry } = mesh, mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!mask || !position || !normal) return;
    const count = geometry.index?.count ?? position.count;
    for (let offset = 0; offset < count; offset += 3) {
      const ids = [0, 1, 2].map(i => geometry.index?.getX(offset + i) ?? offset + i);
      if (ids.some(i => mask.getX(i) !== (kind === 'shtora' ? 2 : 1))) continue;
      const direction = new Vector3().fromBufferAttribute(normal, ids[0])
        .applyNormalMatrix(new Matrix3().getNormalMatrix(mesh.matrixWorld));
      if (Math.abs(direction.y) > .25) continue;
      const point = new Vector3();
      for (const id of ids) point.add(new Vector3().fromBufferAttribute(position, id));
      point.multiplyScalar(1 / 3);
      if (kind === 'headlight' && !belongsToHeadlight(mesh, point)) continue;
      point.applyMatrix4(mesh.matrixWorld);
      candidates.push({ mesh, faceIndex: offset / 3, point, direction, score: point.distanceToSquared(reference) });
    }
  });
  return candidates.sort((a, b) => a.score - b.score).slice(0, 64);
}

function unobstructedPane(root: Object3D, candidate: WindowCandidate, camera: Vector3): boolean {
  const direction = candidate.point.clone().sub(camera), distance = direction.length();
  // Raycaster retains origin by reference; the reverse check must not move
  // the returned inspection camera to 3 cm off the selected aperture.
  const ray = new Raycaster(camera.clone(), direction.normalize(), .02, distance + .02);
  const hit = ray.intersectObject(root, true).find(hit => visibleInRoot(hit.object, root));
  if (!hit || hit.object !== candidate.mesh || hit.faceIndex !== candidate.faceIndex) return false;
  // Reverse trace also rejects a camera inside a neighboring single-sided wall.
  const outward = camera.clone().sub(candidate.point).normalize();
  ray.set(candidate.point.clone().addScaledVector(outward, .03), outward);
  ray.far = distance - .03;
  return !ray.intersectObject(root, true).some(hit => visibleInRoot(hit.object, root));
}

function inspectAperture(root: Object3D, reference: Vector3, kind: ApertureKind): NightWindowInspection | null {
  for (const candidate of windowCandidates(root, reference, kind)) {
    const side = new Vector3(-candidate.direction.z, 0, candidate.direction.x);
    const camera = candidate.point.clone().addScaledVector(candidate.direction, 4)
      .addScaledVector(side, .65).add(new Vector3(0, .25, 0));
    if (!unobstructedPane(root, candidate, camera)) continue;
    const material = candidate.mesh.material;
    if (Array.isArray(material)) continue;
    return { kind, ownerUuid: candidate.mesh.uuid, materialUuid: material.uuid, faceIndex: candidate.faceIndex,
      point: candidate.point.toArray(), direction: candidate.direction.toArray(), camera: camera.toArray(),
      lineOfSight: 'authored-emissive-face' };
  }
  return null;
}

export function inspectNightWindow(root: Object3D, reference: Vector3): NightWindowInspection | null {
  return inspectAperture(root, reference, 'window');
}

/** Only called with the selected player's vehicle root, never world beacons. */
export function inspectNightShtora(root: Object3D, reference: Vector3): NightWindowInspection | null {
  return inspectAperture(root, reference, 'shtora');
}

/** Actual registered driving lens, excluding parking lamps and other glass. */
export function inspectNightHeadlight(root: Object3D, reference: Vector3): NightWindowInspection | null {
  return inspectAperture(root, reference, 'headlight');
}
