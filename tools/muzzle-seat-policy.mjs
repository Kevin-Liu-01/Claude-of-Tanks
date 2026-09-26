/** Retained legacy seating, or a ray-verified physical recess at the same mouth. */
export function muzzleSeatAxialFit(receipt) {
  if (![receipt.lipAdvanceM, receipt.annulusForwardM, receipt.discForwardM,
    receipt.lipFrontM, receipt.markerGapM].every(Number.isFinite)
    || receipt.lipFrontM <= 0 || receipt.lipFrontM > receipt.markerGapM + .001
    || receipt.annulusForwardM <= receipt.discForwardM
    || receipt.annulusForwardM > receipt.lipFrontM) return false;
  // r3 (owner 2026-09-22, "make sure were saving the triangles"): the flat dark ring is the lip and the
  // annular face in one plane, so annulusForwardM equals lipFrontM; the seat law is otherwise the r2 law.
  if (receipt.revision === 'terminal-surface-fit-r2' || receipt.revision === 'terminal-surface-fit-r3') {
    return receipt.discForwardM >= .0002;
  }
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

/** A verified physical mouth's own annulus is its rim (owner 2026-09-22, "make sure were saving the
 * triangles": the barrel-paint fallback rim/annulus that used to shadow it is no longer built), so a
 * flush annulus (projection 0) is accepted as well as a source-authored projecting lip, which can hide
 * the finish ring but never the aperture. Either extent must agree with the measured assembled stock. */
export function physicalMuzzleRimSample(receipt, sample) {
  if (receipt?.revision !== 'physical-recess-r1' || !sample?.gunOwned) return false;
  const {radiusM, zM} = sample;
  const inner = receipt.physicalInnerRadiusM, outer = receipt.measuredOuterRadiusM;
  const projection = receipt.physicalRimProjectionM;
  return [radiusM,zM,inner,outer,projection,receipt.measuredProjectionM].every(Number.isFinite)
    && projection >= 0 && projection <= .1 && outer > inner && inner > 0
    && Math.abs(projection-receipt.measuredProjectionM) <= .0015
    && radiusM > inner && radiusM <= outer*1.001
    && zM >= -.001 && zM <= projection+.001;
}

/** Read the aperture, not the surrounding brake face, on small-caliber guns.
 * Physical recesses already supply a ray-verified inner radius. Retain the
 * legacy sampling window for other mouths and the same luminance thresholds. */
export function muzzleBoreLuminance(data, width, height, radiusPx, receipt = null) {
  let innerRatio = .38;
  if (receipt?.revision === 'physical-recess-r1') {
    const inner = receipt.physicalInnerRadiusM, outer = receipt.outerRadiusM;
    if (![inner, outer].every(Number.isFinite) || inner <= 0 || outer <= inner) {
      throw new Error('Physical bore luminance requires a valid measured aperture');
    }
    innerRatio = Math.min(innerRatio, .6 * inner / outer);
  }
  const innerRadiusPx = radiusPx * innerRatio;
  let inner = 0, innerN = 0, surround = 0, surroundN = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2) / radiusPx;
      if (d > 1.65) continue;
      const i = (y * width + x) * 4;
      const luma = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
      if (d <= innerRatio) { inner += luma; innerN++; }
      else if (d >= 1.15) { surround += luma; surroundN++; }
    }
  }
  return { innerLuma: innerN ? inner / innerN : 255,
    surroundLuma: surroundN ? surround / surroundN : 0, radiusPx,
    innerRadiusPx, innerPixelCount: innerN, surroundPixelCount: surroundN };
}
