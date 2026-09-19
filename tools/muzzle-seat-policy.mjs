/** Retained legacy seating, or a ray-verified physical recess at the same mouth. */
export function muzzleSeatAxialFit(receipt) {
  if (![receipt.lipAdvanceM, receipt.annulusForwardM, receipt.discForwardM,
    receipt.lipFrontM, receipt.markerGapM].every(Number.isFinite)
    || receipt.lipFrontM <= 0 || receipt.lipFrontM > receipt.markerGapM + .001
    || receipt.annulusForwardM <= receipt.discForwardM
    || receipt.annulusForwardM > receipt.lipFrontM) return false;
  if (receipt.revision === 'terminal-surface-fit-r2') return receipt.discForwardM >= .0002;
  if (receipt.revision !== 'physical-recess-r1' || receipt.supportSource !== 'authored-physical-bore') return false;
  const depth = receipt.physicalBoreDepthM;
  return [depth, receipt.measuredMinimumDepthM, receipt.measuredMaximumRimOffsetM,
    receipt.physicalDiscDepthM].every(Number.isFinite)
    && depth >= .01 && depth <= .5 && receipt.markerGapM === 0
    && Math.abs(receipt.measuredMinimumDepthM - depth) <= .005
    && receipt.measuredMaximumRimOffsetM >= 0 && receipt.measuredMaximumRimOffsetM <= .005
    && Math.abs(receipt.discForwardM + depth - .0005) < 1e-6
    && Math.abs(receipt.physicalDiscDepthM + receipt.discForwardM) < 1e-5;
}

/** A source-authored projecting lip can hide the finish ring, but never the
 * aperture. Its extent must agree with the measured assembled stock. */
export function physicalMuzzleRimSample(receipt, sample) {
  if (receipt?.revision !== 'physical-recess-r1' || !sample?.gunOwned) return false;
  const {radiusM, zM} = sample;
  const inner = receipt.physicalInnerRadiusM, outer = receipt.measuredOuterRadiusM;
  const projection = receipt.physicalRimProjectionM;
  return [radiusM,zM,inner,outer,projection,receipt.measuredProjectionM].every(Number.isFinite)
    && projection > 0 && projection <= .1 && outer > inner && inner > 0
    && Math.abs(projection-receipt.measuredProjectionM) <= .0015
    && radiusM > inner && radiusM <= outer*1.001
    && zM >= -.001 && zM <= projection+.001;
}
