// The standard check's B2 openings verdict, measured on the build alone (owner, 2026-11-12: outside 3D models are
// tank-generation comparison bases only; no gate reads one). A vehicle with an approved exterior opening may show raw
// contiguity holes only inside that opening: the AFT-10's launcher slots and the Warrior TES(H)'s side bays (bounded
// regions), the Barak's bow bay and the Arietes' rear coupler (exact pinned hull-frame lattice cells, at HIGH and, for
// the Arietes, LOW). Every other vehicle keeps zero holes. The pinned cells and regions are the build's own approved
// openings (tools/ariete-source-openings.mjs, tools/barak-source-openings.mjs, tools/source-openings-policy.mjs); the
// tank-generation tools compare them with a source model separately (tools/source-opening-check.mjs), never here.
import {isArieteOpeningTarget,validArieteOpeningRaster} from './ariete-source-openings.mjs';
import {validBarakOpeningRaster} from './barak-source-openings.mjs';
import {approvedOpeningRegion} from './source-openings-policy.mjs';

const REGION_IDS = Object.freeze(['aft10','warrior_tes_h','merkava4_barak']);

/** True for a vehicle whose build carries an approved exterior opening. */
export function hasApprovedOpening(id) {
  return REGION_IDS.includes(id) || isArieteOpeningTarget(id);
}

/**
 * {passed, rawHoleCells, intentionalCells, unexpectedCells, reason?} for one contiguity scan (the hull-anchored primary
 * raster after the listed hidden gaps). `lowScan` is the LOW-quality raster, required for the Ariete targets.
 */
export function approvedOpeningsVerdict({id, scan, lowScan = null}) {
  const raw = scan?.holeCells;
  const fail = (reason, unexpected = raw) => ({passed:false,rawHoleCells:raw,intentionalCells:0,unexpectedCells:unexpected,reason});
  if (!Number.isInteger(raw) || raw < 0 || scan.error) return fail('Missing continuity scan');
  if (!hasApprovedOpening(id)) return {passed:raw===0,rawHoleCells:raw,intentionalCells:0,unexpectedCells:raw};
  const qualities = isArieteOpeningTarget(id) ? [['high',scan],['low',lowScan]] : [['high',scan]];
  let intentionalCells = 0, unexpectedCells = 0;
  const failures = [];
  for (const [quality, raster] of qualities) {
    if (!raster || !Number.isInteger(raster.holeCells) || raster.error || !Array.isArray(raster.samples)
        || raster.samples.length !== raster.holeCells)
      return fail(`Missing ${quality.toUpperCase()} continuity raster samples`);
    if (isArieteOpeningTarget(id) && !validArieteOpeningRaster(id, raster, quality))
      return fail(`The ${quality.toUpperCase()} rear-coupler raster is not the pinned approved opening`);
    if (id === 'merkava4_barak' && !validBarakOpeningRaster(raster))
      return fail('The bow-bay raster is not the pinned approved opening');
    for (const sample of raster.samples) {
      const inside = Number.isFinite(sample?.x) && Number.isFinite(sample?.z)
        && approvedOpeningRegion(id, sample.x, sample.z, quality);
      if (quality === 'high') inside ? intentionalCells++ : unexpectedCells++;
      if (!inside) failures.push({quality, x: sample?.x, z: sample?.z});
    }
  }
  return {passed:failures.length===0,rawHoleCells:raw,intentionalCells,unexpectedCells,
    ...(failures.length ? {failures,reason:'Holes outside the approved opening'} : {})};
}
