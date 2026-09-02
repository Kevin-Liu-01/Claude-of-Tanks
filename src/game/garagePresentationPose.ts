// One canonical Garage composition. Environment identity may change terrain,
// structures, materials and atmosphere; it may never rotate the hero, move the
// camera, or introduce a second framing path.
export const GARAGE_PRESENTATION_POSE = Object.freeze({
  // Vehicle forward is local +Z. The camera sits behind the hull on world -Z
  // and to world +X: the engine deck is nearest the viewer while the bow and
  // gun extend toward screen-left in the canonical Verdant composition.
  heroHeadingRad: 0,
  cameraOffsetM: Object.freeze([7.4, 2.75, -8] as const),
  cameraLookHeightM: 1.6,
  cameraFovDeg: 42,
  cameraAzimuthRad: Math.PI * 3 / 4,
  cameraPitchRad: Math.atan2(1.2, Math.hypot(7.4, 8)),
});

export const GARAGE_HERO_HEADING_RAD = GARAGE_PRESENTATION_POSE.heroHeadingRad;
export const GARAGE_CAMERA_LOOK_HEIGHT_M = GARAGE_PRESENTATION_POSE.cameraLookHeightM;
export const GARAGE_CAMERA_AZIMUTH_RAD = GARAGE_PRESENTATION_POSE.cameraAzimuthRad;
export const GARAGE_CAMERA_PITCH_RAD = GARAGE_PRESENTATION_POSE.cameraPitchRad;

/**
 * Convert authored Garage view coordinates into world-local X/Z.
 *
 * `side` is positive toward screen-right and `depth` is positive away from
 * the opening camera. Keeping scenery in this frame lets the one canonical
 * camera change without mirroring routes, facilities, or landmark districts.
 */
export function garageViewPoint(side: number, depth: number): Readonly<{ x: number; z: number }> {
  const yaw = GARAGE_CAMERA_AZIMUTH_RAD;
  return {
    x: Math.cos(yaw) * side - Math.sin(yaw) * depth,
    z: -Math.sin(yaw) * side - Math.cos(yaw) * depth,
  };
}

/** Convert world-local X/Z back into opening-camera side/depth coordinates. */
export function garageWorldPointToView(
  x: number,
  z: number,
): Readonly<{ side: number; depth: number }> {
  const yaw = GARAGE_CAMERA_AZIMUTH_RAD;
  return {
    side: Math.cos(yaw) * x - Math.sin(yaw) * z,
    depth: -Math.sin(yaw) * x - Math.cos(yaw) * z,
  };
}

/** Convert the original +45-degree authored X/Z recipes into view space. */
export function legacyGaragePointToView(
  x: number,
  z: number,
): Readonly<{ side: number; depth: number }> {
  return {
    side: (x - z) * Math.SQRT1_2,
    depth: -(x + z) * Math.SQRT1_2,
  };
}
