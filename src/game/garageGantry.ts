export const VERDANT_GANTRY = Object.freeze({
  postX: 2.4,
  endZ: 3.2,
  postHeight: 4.9,
  postWidth: 0.14,
  footThickness: 0.08,
  crossheadY: 4.82,
  crossheadHeight: 0.24,
  crossheadWidth: 5.12,
  bridgeY: 4.92,
  bridgeHeight: 0.30,
  bridgeLength: 7.10,
  sideRailY: 4.68,
  sideRailHeight: 0.20,
  sideRailLength: 6.55,
});

function intervalsOverlap(
  centerA: number, sizeA: number, centerB: number, sizeB: number,
): boolean {
  return Math.abs(centerA - centerB) <= (sizeA + sizeB) / 2;
}

/** Exact structural receipt for the four-post Verdant turret gantry. */
export function auditVerdantGantryConnectivity(): Readonly<Record<string, boolean>> {
  const g = VERDANT_GANTRY;
  return Object.freeze({
    feetMeetPosts: intervalsOverlap(
      g.footThickness / 2, g.footThickness,
      g.postHeight / 2, g.postHeight,
    ),
    postsMeetCrossheads: intervalsOverlap(
      g.postHeight / 2, g.postHeight,
      g.crossheadY, g.crossheadHeight,
    ),
    crossheadsSpanPosts: g.crossheadWidth / 2 >= g.postX + g.postWidth / 2,
    bridgeMeetsCrossheads: intervalsOverlap(
      0, g.bridgeLength,
      g.endZ, 0.26,
    ) && intervalsOverlap(
      g.crossheadY, g.crossheadHeight,
      g.bridgeY, g.bridgeHeight,
    ),
    sideRailsMeetCrossheads: intervalsOverlap(
      0, g.sideRailLength,
      g.endZ, 0.26,
    ) && intervalsOverlap(
      g.crossheadY, g.crossheadHeight,
      g.sideRailY, g.sideRailHeight,
    ),
  });
}
