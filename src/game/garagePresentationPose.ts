// One canonical Garage composition. Environment identity may change terrain,
// structures, materials and atmosphere; it may never rotate the hero, move the
// camera, or introduce a second framing path.
export const GARAGE_PRESENTATION_POSE = Object.freeze({
  // Vehicle forward is local +Z and the canonical camera sits at world +Z.
  // Zero yaw therefore presents the bow; PI would present the engine deck.
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
