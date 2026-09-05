/** Quality is authored placement success/diversity, not an arbitrary body count. */
export function loosePlacementPasses(receipt) {
  if (!receipt || !Number.isInteger(receipt.authoredSites) || receipt.authoredSites < 1) return false;
  if (!Number.isInteger(receipt.acceptedSites) || receipt.acceptedSites > receipt.authoredSites) return false;
  if (!Number.isInteger(receipt.placedMembers) || receipt.placedMembers < receipt.acceptedSites
    || receipt.placedMembers > receipt.acceptedSites * 2) return false;
  return receipt.acceptedSites / receipt.authoredSites >= 0.85
    && new Set(receipt.kinds ?? []).size >= 5;
}

export function evaluateQuality(row) {
  const q = row.quality;
  const checks = {
    mapAuthorship: q.map.landforms >= 5 && q.map.tacticalBeats === 3
      && q.map.roads >= 2 && q.map.wallRuns >= 6,
    buildingQuality: q.buildings.placed >= 15 && q.buildings.familyCount >= 11
      && q.buildings.destructibleFamilies >= 4,
    decorationQuality: q.decorations.destructibles >= 350
      && q.decorations.destructibleKinds >= 32
      && loosePlacementPasses(q.decorations.loosePlacement)
      && q.decorations.wrecks >= 4,
    utilityPoleGrounding: !q.decorations.utilityPoles.enabled
      || (q.decorations.utilityPoles.stations > 0
        && q.decorations.utilityPoles.unsupportedPosts === 0
        && q.decorations.utilityPoles.sourceTrianglesPerPost > 0
        && q.decorations.utilityPoles.sourceTrianglesPerPost <= 3000
        && q.decorations.utilityPoles.maxAcceptedPairRelief <= 0.401),
    decorationGrounding: q.decorations.grounding.unsupportedDestructibles === 0
      && q.decorations.grounding.unsupportedWideDecorations === 0,
    foliageQuality: q.foliage.configuredSpecies >= 2 && q.foliage.concealers >= 20,
    waterQuality: q.water.features === 0 || q.water.liquid || q.water.frozen
      || q.water.softInteraction,
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}
