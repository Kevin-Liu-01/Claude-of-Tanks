/** Redrock's single authored drainage system, shared by playable ground and outland. */
const REDROCK_CANYON = Object.freeze({
  centerX: 8, axisSlope: 0.16, floorHalfWidth: 210, mouthHalfWidth: 330,
  flareStart: 230, flareEnd: 430, floorY: 4, floorGrade: 0.004,
  westHeight: 64, eastHeight: 86,
  // Round 39 (owner 2026-09-22, "in the redrock divide you can literally still see the cutoff - make the divide an
  // enclosed area instead of being in a 'gap'"): past the playable square a headwall with the flanks' own two-tier
  // profile rises from this distance (bench by ~690 m, plateau by ~800 m), so both former mouths are closed and the
  // divide is a basin. The ring's rows past the seam sit at 585, 628 and 674 m: the line lies beyond the first of
  // them (plus the wall's 27 m meander) so the floor stays flat across the seam and the first raised row is the third.
  closureStart: 612,
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
  const halfWidth = redrockCanyonFloorHalfWidth(z);
  const toeDistance = Math.abs(across) - halfWidth;
  const open = toeDistance <= 0 ? floor : floor + canyonWall(across, z, toeDistance);
  if (Math.abs(z) <= REDROCK_CANYON.closureStart) return open;
  // The headwall stands across the mouth with the SAME two-tier profile as the flanks (a low bench, then the steep
  // upper face — so the terrain material reads it as bedded rock, not a sand ramp): its "toe" is the distance past
  // the closure line, meandering ±27 m along the wall so it is not a straight dam, and the west and east flank
  // profiles are blended across the canyon's width so the wall is one surface. The wall only ever raises the open
  // shape; inside ±512 m it is exactly zero, so the playable ground and the seam are untouched.
  const meander = 18 * Math.sin(x * 0.021 + 0.4) + 9 * Math.sin(x * 0.053 + 1.1);
  const headToe = Math.abs(z) - REDROCK_CANYON.closureStart + meander;
  if (headToe <= 0) return open;
  const blend = ramp(-halfWidth, halfWidth, across);
  const head = floor + canyonWall(-1, z, headToe) * (1 - blend) + canyonWall(1, z, headToe) * blend;
  return Math.max(open, head);
}
