import { sampleShorelineMask, shorelineRadiusAt } from '../shoreline.ts';

export interface RiverLandingAnchor {
  lakeIndex: number;
  shoreAngleDeg: number;
}

interface LandingHeightField {
  getHeightAt(x: number, z: number): number;
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
  const lake = lakes[anchor.lakeIndex];
  if (!lake || !Number.isFinite(lake.level)) return null;
  const angle = anchor.shoreAngleDeg * Math.PI / 180;
  const radius = shorelineRadiusAt(lake, angle);
  const x = lake.x + Math.cos(angle) * radius * 1.02;
  const z = lake.z + Math.sin(angle) * radius * 1.02;
  const inward = angle + Math.PI;
  const length = 7.6;
  const level = lake.level!;
  const tipX = x + Math.cos(inward) * length;
  const tipZ = z + Math.sin(inward) * length;
  // The tip must reach the true planar liquid core. The deck stays low above
  // that same waterline; do not put a tall pier on a cliff or across a road.
  if (Math.abs(heightField.getHeightAt(tipX, tipZ) - level) > 0.01) return null;
  for (const t of [0, length * 0.5, length]) {
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
