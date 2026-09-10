/** Redrock's single authored drainage system, shared by playable ground and outland. */
export const REDROCK_CANYON = Object.freeze({
  centerX: 8, axisSlope: 0.16, floorHalfWidth: 210, mouthHalfWidth: 330,
  flareStart: 230, flareEnd: 430, floorY: 4, floorGrade: 0.004,
  westHeight: 64, eastHeight: 86,
});

function ramp(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Slightly oblique north/south axis; the mouth does not become a radial bowl. */
export function redrockCanyonCenter(z: number): number {
  return REDROCK_CANYON.centerX + REDROCK_CANYON.axisSlope * z;
}

/** The two deployment mouths flare once, then continue at a fixed width outside the map. */
export function redrockCanyonFloorHalfWidth(z: number): number {
  return REDROCK_CANYON.floorHalfWidth + (REDROCK_CANYON.mouthHalfWidth - REDROCK_CANYON.floorHalfWidth)
    * ramp(REDROCK_CANYON.flareStart, REDROCK_CANYON.flareEnd, Math.abs(z));
}

function sideRavineWeight(across: number, z: number): number {
  // Road-width beds open into broad eroded shoulders. The long transition is
  // resolved by both the playable grid and the lower-density distant mesh.
  const south = 1 - ramp(8, 82, Math.abs(z - (-207 + across * 0.035)));
  const north = 1 - ramp(8, 86, Math.abs(z - (110 + Math.abs(across) * 0.24)));
  return Math.max(south, north);
}

function canyonWall(across: number, z: number, toeDistance: number): number {
  const west = across < 0;
  // Steep bedrock faces and broad benches frame the central battlefield.
  // Recesses only cut away from the protected valley floor, never intrude into
  // a road. Broader weathered shoulders at the mouths fit the coarser outland.
  const sculpt = 1 - ramp(180, 300, Math.abs(z));
  const recess = sculpt > 0 ? sculpt * (18
    + 12 * Math.sin(z * 0.029 + (west ? 0.8 : 2.5))
    + 6 * Math.sin(z * 0.071 + (west ? 2.1 : 0.3))) : 0;
  const depth = toeDistance - recess;
  const lower = west ? ramp(0, 72 - 50 * sculpt, depth) * 0.28
    : ramp(0, 55 - 37 * sculpt, depth) * 0.36;
  const upper = west ? ramp(105 - 43 * sculpt, 180 - 90 * sculpt, depth) * 0.72
    : ramp(88 - 33 * sculpt, 175 - 91 * sculpt, depth) * 0.64;
  const height = west
    ? REDROCK_CANYON.westHeight + 6 * ramp(-380, -40, z) - 12 * ramp(170, 360, z)
    : REDROCK_CANYON.eastHeight - 2 * ramp(-280, -40, z) + 6 * ramp(100, 380, z);
  const bedding = 1 + sculpt * (0.035 * Math.sin(z * 0.031) + 0.018 * Math.sin(z * 0.067));
  return (lower + upper) * height * bedding * (1 - sideRavineWeight(across, z));
}

/** Absolute regional datum and unequal eroded flanks; no noise, allocation, or mutable cache. */
export function sampleRedrockCanyon(x: number, z: number): number {
  const floor = REDROCK_CANYON.floorY + REDROCK_CANYON.floorGrade * Math.max(-600, Math.min(600, z));
  const across = x - redrockCanyonCenter(z);
  const toeDistance = Math.abs(across) - redrockCanyonFloorHalfWidth(z);
  return toeDistance <= 0 ? floor : floor + canyonWall(across, z, toeDistance);
}
