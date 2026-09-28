/** Redrock's single authored drainage system, shared by playable ground and outland. */
const REDROCK_CANYON = Object.freeze({
  centerX: 8, axisSlope: 0.16, floorHalfWidth: 210, mouthHalfWidth: 330,
  flareStart: 230, flareEnd: 430, floorY: 4, floorGrade: 0.004,
  westHeight: 64, eastHeight: 86,
  // A recessed amphitheatre closes each drainage beyond the deployment areas.
  // Its broken escarpment belongs to the regional geology, away from the rim.
  closureStart: 740,
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
  // Unequal buttresses, talus shelves and side washes continue through the
  // whole region. Fading this sculpture out at |z|=300 made the boundary
  // flanks become smooth ramps. Recesses only cut away from the valley floor.
  const sculpt = 0.94 + 0.06 * Math.sin(z * 0.007 + (west ? 0.5 : 2.4));
  const mouthApron = ramp(330, 430, Math.abs(z)) * (1 - ramp(560, 720, Math.abs(z)));
  const recess = 32 * mouthApron + sculpt * (24
    + 12 * Math.sin(z * 0.029 + (west ? 0.8 : 2.5))
    + 6 * Math.sin(z * 0.071 + (west ? 2.1 : 0.3)));
  const depth = toeDistance - recess;
  const apron = ramp(220, 330, Math.abs(z));
  const lower = west ? ramp(0, 72 - 50 * sculpt + 10 * apron, depth) * 0.28
    : ramp(0, 55 - 37 * sculpt + 21 * apron, depth) * 0.36;
  // Broad upper talus keeps road approaches below the existing shoulder
  // grade ceiling while retaining the unequal, stepped canyon silhouettes.
  const upper = west ? ramp(105 - 43 * sculpt, 180 - 90 * sculpt + 22 * apron, depth) * 0.72
    : ramp(88 - 33 * sculpt, 175 - 91 * sculpt + 25 * apron, depth) * 0.64;
  const height = west
    ? REDROCK_CANYON.westHeight + 6 * ramp(-380, -40, z) - 12 * ramp(170, 360, z)
    : REDROCK_CANYON.eastHeight - 2 * ramp(-280, -40, z) + 6 * ramp(100, 380, z);
  const bedding = 1 + sculpt * (0.035 * Math.sin(z * 0.031) + 0.018 * Math.sin(z * 0.067));
  return (lower + upper) * height * bedding * (1 - sideRavineWeight(across, z));
}

/** Absolute regional datum and unequal eroded flanks; no noise, allocation, or mutable cache. */
export function sampleRedrockCanyon(x: number, z: number): number {
  // The authored combat lanes stay fixed. Beyond them, tributaries bend into
  // the surrounding plateau instead of extending as ruler-straight trenches.
  const regional = ramp(560, 1050, Math.max(Math.abs(x), Math.abs(z)));
  const wx = x + regional * (65 * Math.sin(z * 0.008) + 24 * Math.sin(z * 0.019 + 2));
  const wz = z + regional * (70 * Math.sin(x * 0.007 + 1) + 24 * Math.sin(x * 0.018));
  const upland = regional * (9 * Math.sin(x * 0.008) * Math.sin(z * 0.006)
    + 2 * Math.sin(x * 0.023 + z * 0.011));
  x = wx; z = wz;
  const floor = REDROCK_CANYON.floorY + REDROCK_CANYON.floorGrade * Math.max(-600, Math.min(600, z));
  const across = x - redrockCanyonCenter(z);
  const halfWidth = redrockCanyonFloorHalfWidth(z);
  const toeDistance = Math.abs(across) - halfWidth;
  const open = toeDistance <= 0 ? floor : floor + canyonWall(across, z, toeDistance);
  if (Math.abs(z) <= REDROCK_CANYON.closureStart - 132) return open + upland;
  // Broad alcoves and offset promontories break up the former straight dam.
  // Both walls remain outside the playable floor and carry the same bedding.
  const meander = 100 * Math.sin(x * 0.008 + (z > 0 ? 0.4 : 2.1))
    + 32 * Math.sin(x * 0.029 + 1.1);
  const headToe = Math.abs(z) - REDROCK_CANYON.closureStart + meander;
  if (headToe <= 0) return open + upland;
  const blend = ramp(-halfWidth, halfWidth, across);
  const head = floor + canyonWall(-1, z, headToe) * (1 - blend) + canyonWall(1, z, headToe) * blend;
  return Math.max(open, head) + upland;
}
