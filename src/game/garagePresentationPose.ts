// One canonical Garage composition. Environment identity may change terrain,
// structures, materials and atmosphere; it may never rotate the hero, move the
// camera, or introduce a second framing path.
export const GARAGE_PRESENTATION_POSE = Object.freeze({
  // Vehicle forward is local +Z. The camera stays on that bow hemisphere and
  // sits to world +X: the glacis faces the viewer while the bow and gun extend
  // toward screen-left in the canonical Verdant composition.
  heroHeadingRad: 0,
  cameraOffsetM: Object.freeze([7.4, 2.75, 8] as const),
  cameraLookHeightM: 1.6,
  cameraFovDeg: 42,
  cameraAzimuthRad: Math.PI / 4,
  cameraPitchRad: Math.atan2(1.2, Math.hypot(7.4, 8)),
});

export const GARAGE_HERO_HEADING_RAD = GARAGE_PRESENTATION_POSE.heroHeadingRad;
export const GARAGE_CAMERA_LOOK_HEIGHT_M = GARAGE_PRESENTATION_POSE.cameraLookHeightM;
export const GARAGE_CAMERA_AZIMUTH_RAD = GARAGE_PRESENTATION_POSE.cameraAzimuthRad;
export const GARAGE_CAMERA_PITCH_RAD = GARAGE_PRESENTATION_POSE.cameraPitchRad;

// One physical turntable contract shared by the indoor stage, outdoor terrain
// cutout, hero seating, and visual audits. The platform bottom stays at y=0;
// every ground surface is held below it so no biome can swallow the rim.
export const GARAGE_PLATFORM_GEOMETRY = Object.freeze({
  deckRadiusM: 6,
  baseRadiusM: 6.35,
  topYM: 0.36,
  groundSurfaceYM: -0.025,
  terrainSurfaceYM: -0.045,
  // Garage terrain excerpts use a 2.4 x 2.33 m grid. This exclusion extends
  // beyond the podium by more than one complete cell diagonal, ensuring that
  // no terrain triangle whose vertices sit outside the base can bridge across
  // and visually cut through it.
  terrainClearRadiusM: 9.8,
  terrainFeatherRadiusM: 12.4,
});

/** Lower one terrain sample into the platform's feathered exclusion zone. */
export function garagePlatformTerrainHeight(x: number, z: number, sourceY: number): number {
  const radius = Math.hypot(x, z);
  if (radius <= GARAGE_PLATFORM_GEOMETRY.terrainClearRadiusM) {
    return Math.min(sourceY, GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM);
  }
  if (radius >= GARAGE_PLATFORM_GEOMETRY.terrainFeatherRadiusM) return sourceY;
  const linear = (radius - GARAGE_PLATFORM_GEOMETRY.terrainClearRadiusM)
    / (GARAGE_PLATFORM_GEOMETRY.terrainFeatherRadiusM
      - GARAGE_PLATFORM_GEOMETRY.terrainClearRadiusM);
  const smooth = linear * linear * (3 - 2 * linear);
  const cleared = Math.min(sourceY, GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM);
  return cleared + (sourceY - cleared) * smooth;
}

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
