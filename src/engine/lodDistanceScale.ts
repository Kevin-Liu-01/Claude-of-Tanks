import { LOD, Vector3, type Camera, type Object3D, type PerspectiveCamera } from 'three';

// Screen-size LOD for vehicles (sealed lane round 2, 2026-10-10; the coordinator's approval of the follow-up to the
// owner's "some vehicles are see through ... gaps in the middle of their bodies"). three's LOD and the vehicle detail
// horizons read the true camera distance, but the sniper sight magnifies by narrowing the field of view (cameraRig:
// fov = 60 / zoom), so a scoped enemy at 200 m drew its 200 m state, its detail culled, filling the reticle.

/** The gameplay camera's base vertical field of view (cameraRig BASE_FOV_DEG): the vehicle LOD horizons (64 m on the
 * battle bots' LOW geometry, 150 m otherwise) and detail hand-offs were authored against it. */
export const LOD_REFERENCE_FOV_DEG = 60;
const REFERENCE_TAN = Math.tan((LOD_REFERENCE_FOV_DEG * Math.PI) / 360);

/**
 * The factor that turns a camera distance into the distance at which the object would look the same size under the
 * reference field of view: tan(fov / 2) / tan(30 deg) for a perspective camera, so a x8 sight (7.5 deg) reads a tank
 * at 200 m like one at 23 m. Never above 1: a view wider than the reference keeps the authored horizons, so every
 * unscoped frame is unchanged. three's own camera.zoom still divides, as THREE.LOD.update does.
 */
export function lodDistanceScale(camera: Camera): number {
  const zoom = (camera as PerspectiveCamera).zoom || 1;
  const perspective = camera as PerspectiveCamera;
  if (!perspective.isPerspectiveCamera || !(perspective.fov > 0)) return 1 / zoom;
  const ratio = Math.tan((perspective.fov * Math.PI) / 360) / REFERENCE_TAN;
  return Math.min(1, ratio) / zoom;
}

const _camera = new Vector3();
const _object = new Vector3();

/** THREE.LOD.update with the screen-equivalent distance (lodDistanceScale) in place of the true one. */
export function zoomAwareLodUpdate(this: LOD, camera: Camera): void {
  const levels = this.levels;
  if (levels.length <= 1) return;
  _camera.setFromMatrixPosition(camera.matrixWorld);
  _object.setFromMatrixPosition(this.matrixWorld);
  const distance = _camera.distanceTo(_object) * lodDistanceScale(camera);
  levels[0].object.visible = true;
  let index = 1;
  for (; index < levels.length; index++) {
    let levelDistance = levels[index].distance;
    if (levels[index].object.visible) levelDistance -= levelDistance * levels[index].hysteresis;
    if (distance >= levelDistance) {
      levels[index - 1].object.visible = false;
      levels[index].object.visible = true;
    } else break;
  }
  (this as LOD & { _currentLevel: number })._currentLevel = index - 1;
  for (; index < levels.length; index++) levels[index].object.visible = false;
}

/** Every LOD under `root` picks its level by screen size (zoomAwareLodUpdate). Returns the number installed. */
export function installZoomAwareLods(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof LOD)) return;
    object.update = zoomAwareLodUpdate;
    count++;
  });
  return count;
}
