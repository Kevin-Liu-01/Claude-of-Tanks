import { sampleShorelineMask, shorelineRadiusAt } from '../shoreline.ts';

export interface RiverLandingAnchor {
  lakeIndex: number;
  shoreAngleDeg: number;
  /** Dry working coasts may omit reeds; existing wet-bank sites keep them. */
  shoreReeds?: boolean;
  /** Four to ten complete 1.9 m spans; omission preserves the 7.6 m kit. */
  jettyLength?: number;
}

interface LandingHeightField {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
}

interface LandingLake {
  x: number;
  z: number;
  r: number;
  level?: number;
}

/** Authored shore placement, never one automatic jetty per interpolated cell. */
export function planRiverLanding(
  heightField: LandingHeightField, lakes: readonly LandingLake[], anchor: RiverLandingAnchor,
): { x: number; z: number; angle: number; length: number; deckY: number;
  waterLevel: number; boatX: number; boatZ: number; boatYaw: number } | null {
  const length = anchor.jettyLength === undefined ? 7.6 : anchor.jettyLength;
  const spans = length / 1.9;
  if (!Number.isFinite(length) || length < 7.6 || length > 19
    || Math.abs(spans - Math.round(spans)) > 1e-9) {
    throw new RangeError('jettyLength must be 7.6–19 m in complete 1.9 m spans');
  }
  const lake = lakes[anchor.lakeIndex];
  if (!lake || !Number.isFinite(lake.level)) return null;
  const angle = anchor.shoreAngleDeg * Math.PI / 180;
  const radius = shorelineRadiusAt(lake, angle);
  const x = lake.x + Math.cos(angle) * radius * 1.02;
  const z = lake.z + Math.sin(angle) * radius * 1.02;
  const inward = angle + Math.PI;
  const level = lake.level!;
  const tipX = x + Math.cos(inward) * length;
  const tipZ = z + Math.sin(inward) * length;
  // The tip must reach the true planar liquid core. The deck stays low above
  // that same waterline; do not put a tall pier on a cliff or across a road.
  for (const side of [-0.75, 0, 0.75]) {
    const px = tipX - Math.sin(inward) * side;
    const pz = tipZ + Math.cos(inward) * side;
    if (heightField.getWaterMaskAt(px, pz) !== 1
      || Math.abs(heightField.getHeightAt(px, pz) - level) > 1e-8) return null;
  }
  // Validate every pile station along the actual authored length, not only
  // a short default footprint or an unsampled midpoint of a longer deck.
  for (let station = 0; station <= Math.round(spans); station++) {
    const t = station * 1.9;
    for (const side of [-1, 1]) {
      const px = x + Math.cos(inward) * t - Math.sin(inward) * side * 0.75;
      const pz = z + Math.sin(inward) * t + Math.cos(inward) * side * 0.75;
      if (heightField._roadDist(px, pz) < 7 || heightField.getHeightAt(px, pz) > level + 0.50) return null;
    }
  }
  const boatX = lake.x + Math.cos(angle) * radius * 1.16 - Math.sin(angle) * 5;
  const boatZ = lake.z + Math.sin(angle) * radius * 1.16 + Math.cos(angle) * 5;
  // A shore of one overlapping cell may be inside the next cell. Inspect the
  // full union so a grounded fishing boat is never placed in open water.
  if (sampleShorelineMask([], lakes, boatX, boatZ) > 0.02
    || heightField.getHeightAt(boatX, boatZ) <= level + 0.05) return null;
  return {
    x, z, angle: inward, length, deckY: level + 0.65, waterLevel: level,
    boatX, boatZ,
    boatYaw: -angle - Math.PI / 2,
  };
}
