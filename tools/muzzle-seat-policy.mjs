/** Preserve exact seam evidence, then require both seam flanks and an offset
 * course. Coplanar shared edges can lose an exact ray to floating-point error;
 * finite openings and obstructions still fail at the unchanged radius. */
export function sampleMuzzleRingSeams(sample) {
  return { cardinal: sample(0), required: [.173, -.0001, .0001].flatMap(sample) };
}

/** Retained legacy seating, or a ray-verified physical recess at the same mouth. */
export function muzzleSeatAxialFit(receipt) {
  if (['physical-recess-r2', 'carved-physical-recess-r1'].includes(receipt.revision)) {
    const depth=receipt.physicalBoreDepthM, radius=receipt.physicalInnerRadiusM;
    const projection=receipt.physicalRimProjectionM??0;
    return [depth,radius,projection,receipt.measuredMinimumDepthM,receipt.measuredMaximumDepthM,
      receipt.measuredMaximumWallErrorM,receipt.measuredMaximumRimOffsetM].every(Number.isFinite)
      && depth>=.01 && depth<=.5 && radius>0 && receipt.supportOuterRadiusM>radius
      && projection>=0 && projection<=.1
      && Math.abs(receipt.measuredMinimumDepthM-depth)<.001
      && Math.abs(receipt.measuredMaximumDepthM-depth)<.001
      && receipt.measuredMaximumWallErrorM>=0
      && receipt.measuredMaximumWallErrorM<=radius*(1-Math.cos(Math.PI/12))+.0001
      && receipt.measuredMaximumRimOffsetM>=0 && receipt.measuredMaximumRimOffsetM<=projection+.004
      && receipt.lipFrontM===0 && receipt.annulusForwardM===0 && receipt.discForwardM===-depth;
  }
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
  if (!['physical-recess-r1','physical-recess-r2','carved-physical-recess-r1'].includes(receipt?.revision) || !sample?.gunOwned) return false;
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
  if (['physical-recess-r1','physical-recess-r2','carved-physical-recess-r1'].includes(receipt?.revision)) {
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
