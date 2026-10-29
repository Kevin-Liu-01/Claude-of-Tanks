/**
 * cameraLens.ts — the gameplay camera's lens as a screen-space pass or a custom cull rebuilds it (battle-camera-264).
 *
 * The chase framing raises the picture with a lens shift (cameraRig.ts applyLens writes `camera.view`), an off-axis
 * projection: the frustum's centre no longer lies on the camera's forward axis. A pass that rebuilt a pixel's view ray
 * from `tan(fov / 2)` and the aspect alone aimed every ray 2 · shift · tan(fov / 2) off vertically (1.7 m at the hull's
 * 13 m on a 1280x720 battle), so the aerial pass's contact shadows marched from the wrong place under the tank. Both
 * terms come from the projection matrix itself, so the shift, the zoom and any later view offset are in them.
 *
 * The view ray through NDC (x, y) is `fwd + right · (x · tan.x + shift.x) + up · (y · tan.y + shift.y)`; a point at
 * view-space (X, Y) and depth D along `fwd` lands at NDC `((X / D − shift.x) / tan.x, (Y / D − shift.y) / tan.y)`.
 * A centred lens has shift (0, 0) and the tangents three's fov and aspect give.
 */
import type * as THREE from 'three';

/** Read the camera's frustum half-extent tangents and centre offset (both per unit depth) into `tan` and `shift`. */
export function readCameraLens(camera: THREE.PerspectiveCamera, tan: THREE.Vector2, shift: THREE.Vector2): void {
  const e = camera.projectionMatrix.elements;
  tan.set(1 / e[0], 1 / e[5]);
  shift.set(e[8] / e[0], e[9] / e[5]);
}

/**
 * A perspective projection over the lens's own frustum, each edge widened outward by `padRad` (at most 1.5 rad from
 * the axis): a cull frustum that holds every view ray of the shifted picture, as the centred one held the centred.
 */
export function lensCullProjection(
  out: THREE.Matrix4, tan: THREE.Vector2, shift: THREE.Vector2, padRad: number, near: number, far: number,
): THREE.Matrix4 {
  const right = Math.tan(Math.min(1.5, Math.atan(shift.x + tan.x) + padRad));
  const left = Math.tan(Math.max(-1.5, Math.atan(shift.x - tan.x) - padRad));
  const top = Math.tan(Math.min(1.5, Math.atan(shift.y + tan.y) + padRad));
  const bottom = Math.tan(Math.max(-1.5, Math.atan(shift.y - tan.y) - padRad));
  return out.makePerspective(near * left, near * right, near * top, near * bottom, near, far);
}
