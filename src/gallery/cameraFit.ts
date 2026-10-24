import { Box3, Fog, PerspectiveCamera, Vector3 } from 'three';

const direction = new Vector3();
const right = new Vector3();
const vertical = new Vector3();
const offset = new Vector3();
const size = new Vector3();

/** Exact corner/frustum fit, called only on framing and viewport changes. */
export function galleryFitDistance(
  bounds: Box3, target: Vector3, outward: Vector3, up: Vector3,
  fovDeg: number, aspect: number,
): number {
  if (bounds.isEmpty()) return 1;
  direction.copy(outward).normalize();
  right.crossVectors(up, direction).normalize();
  vertical.crossVectors(direction, right).normalize();
  // Leave room for the viewer's camera and layer controls at both edges.
  const tanV = Math.tan(fovDeg * Math.PI / 360) / 1.18;
  const tanH = tanV * Math.max(.01, aspect);
  let distance = 1;
  for (let corner = 0; corner < 8; corner++) {
    offset.set(
      corner & 1 ? bounds.max.x : bounds.min.x,
      corner & 2 ? bounds.max.y : bounds.min.y,
      corner & 4 ? bounds.max.z : bounds.min.z,
    ).sub(target);
    const depth = offset.dot(direction);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / tanH,
      depth + Math.abs(offset.dot(vertical)) / tanV);
  }
  return distance;
}

/** Keep the user's orbit and relative zoom while the viewport changes shape. */
export function resizeGalleryCamera(
  position: Vector3, target: Vector3, up: Vector3, bounds: Box3,
  fovDeg: number, oldAspect: number, newAspect: number,
): number {
  const outward = position.clone().sub(target);
  const previousFit = galleryFitDistance(bounds, target, outward, up, fovDeg, oldAspect);
  const nextFit = galleryFitDistance(bounds, target, outward, up, fovDeg, newAspect);
  position.copy(target).addScaledVector(outward, nextFit / previousFit);
  return nextFit;
}

/** The nearest the near plane may come: a camera inside the specimen's bounds keeps the old close-range clip. */
export const GALLERY_MIN_NEAR_M = 0.05;

/**
 * Depth range per frame (2026-10-23, lane 243; the owner: "insignias and marks on tanks are still glitching, for
 * example if u drag them around the tank gallery"). A perspective depth step spans about d² × 2^-24 / near metres at
 * distance d: at the old fixed 5 cm near that was 0.08 mm at 8 m and 1.7 mm at 38 m, and every polygon offset the
 * vehicle draws with (its coplanar depth layers, the markings' own) grew with it. The near plane now stands just
 * short of the nearest thing the camera can see: 60 % of the way to the specimen's bounds (`stage`, already padded
 * for articulation), and 80 % of the eye depth of the plinth where the frustum's lower edge meets it.
 */
export function fitGalleryDepth(camera: PerspectiveCamera, stage: Box3, floorY: number): void {
  let near = GALLERY_MIN_NEAR_M;
  if (!stage.isEmpty()) {
    near = Math.max(near, stage.distanceToPoint(camera.position) * .6);
    const height = camera.position.y - floorY;
    if (height > 0) {
      camera.getWorldDirection(direction);
      const pitch = Math.asin(Math.max(-1, Math.min(1, -direction.y)));
      const lowerEdge = Math.min(pitch + camera.fov * Math.PI / 360, Math.PI - 1e-3);
      // a plane's eye depth is constant along a screen row: the lower edge holds its nearest visible point
      if (lowerEdge > 0) {
        const plinth = height * (Math.cos(pitch) / Math.tan(lowerEdge) + Math.sin(pitch));
        near = Math.max(GALLERY_MIN_NEAR_M, Math.min(near, plinth * .8));
      }
    }
  }
  if (Math.abs(camera.near - near) > near * .01) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

/** A valid narrow-screen fit must survive controls.update and remain visible. */
export function applyGalleryCameraRange(
  camera: PerspectiveCamera, controls: { maxDistance: number; target: Vector3 },
  fog: Fog, bounds: Box3, fitDistance: number,
): void {
  const diameter = bounds.getSize(size).length();
  controls.maxDistance = Math.max(38, fitDistance * 2.5,
    camera.position.distanceTo(controls.target) * 1.1);
  // Keep the selected specimen before the haze; the ground may still fade.
  fog.near = Math.max(18, controls.maxDistance + diameter);
  fog.far = fog.near + 27;
  camera.far = Math.max(180, controls.maxDistance + diameter * 2);
  camera.updateProjectionMatrix();
}
