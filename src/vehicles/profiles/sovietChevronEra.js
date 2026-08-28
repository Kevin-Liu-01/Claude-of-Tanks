// Shared first-party construction rule for Soviet-family turret ERA.
//
// This is deliberately a geometry helper rather than a vehicle template:
// each profile supplies its own plan, height, depth and tile cadence.  The
// invariant is the part that matters visually and physically: two distinct
// carrier rows meet at one ridge in side elevation, and every visible ERA
// tile is derived from (and offset along) the carrier's actual outer plane.
// That prevents guessed Euler boxes, floating tiles and coplanar flicker.
import { KIT, orientedSlab } from './kit.js';

const DEFAULT_TILE_RANGES = Object.freeze([
  Object.freeze([0.08, 0.31]),
  Object.freeze([0.345, 0.655]),
  Object.freeze([0.69, 0.92]),
]);

function mirroredCarrier(side, plan, row) {
  return orientedSlab(
    ...plan.map(([x, z]) => [side * x, row.y0, z + row.z0]),
    ...plan.map(([x, z]) => [side * x, row.y1, z + row.z1]),
  );
}

function carrierFaceTile(side, plan, row, t0, t1, depth, padT = 0, padY = 0) {
  const a = plan[1];
  const b = plan[2];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const edgeLength = Math.hypot(dx, dz) || 1;
  const nx = side * (-dz / edgeLength);
  const nz = dx / edgeLength;
  const loT = Math.max(0, t0 - padT);
  const hiT = Math.min(1, t1 + padT);
  const loY = row.y0 + padY;
  const hiY = row.y1 - padY;
  const zOffsetAtY = (y) => row.z0
    + (row.z1 - row.z0) * ((y - row.y0) / Math.max(1e-6, row.y1 - row.y0));
  const point = (t, y, push = 0) => [
    side * (a[0] + dx * t) + nx * push,
    y,
    a[1] + dz * t + zOffsetAtY(y) + nz * push,
  ];
  const back = [point(loT, loY), point(hiT, loY), point(hiT, hiY), point(loT, hiY)];
  const face = [
    point(loT, loY, depth), point(hiT, loY, depth),
    point(hiT, hiY, depth), point(loT, hiY, depth),
  ];
  return orientedSlab(...back, ...face);
}

function frontmostTileZ(plans, rows, tileRanges, depth, padY) {
  let frontmost = -Infinity;
  for (const plan of plans) {
    const a = plan[1];
    const b = plan[2];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const edgeLength = Math.hypot(dx, dz) || 1;
    const normalZ = dx / edgeLength;
    for (const row of rows) {
      const height = Math.max(1e-6, row.y1 - row.y0);
      for (const [t0, t1] of tileRanges) {
        for (const t of [t0, t1]) {
          for (const y of [row.y0 + padY, row.y1 - padY]) {
            const rowZ = row.z0 + (row.z1 - row.z0) * ((y - row.y0) / height);
            frontmost = Math.max(frontmost, a[1] + dz * t + rowZ + normalZ * depth);
          }
        }
      }
    }
  }
  return frontmost;
}

export function addSovietChevronEra(P, {
  sector,
  receiptKey,
  family,
  plans,
  rows,
  tileRanges = DEFAULT_TILE_RANGES,
  carrierBucket = 'turret',
  tileBucket = 'turret',
  gasketBucket = 'turretDark',
  gasketDepthM = 0.025,
  tileDepthM = 0.065,
  gasketPadT = 0.015,
  gasketPadY = -0.006,
  tilePadY = 0.012,
  forwardM = 0,
  centerClosure = null,
}) {
  if (!sector || !receiptKey || !family) throw new Error('Chevron ERA requires sector, receiptKey and family');
  if (!Array.isArray(plans) || plans.length === 0) throw new Error(`${family}: chevron plans are empty`);
  if (!Array.isArray(rows) || rows.length !== 2) throw new Error(`${family}: chevron ERA requires exactly two rows`);
  const ridgeY = rows[0].y1;
  if (Math.abs(ridgeY - rows[1].y0) > 1e-6) throw new Error(`${family}: chevron rows do not share a ridge`);
  const seatedPlans = plans.map((plan) => plan.map(([x, z]) => [x, z + forwardM]));
  const frontmostTileZM = frontmostTileZ(seatedPlans, rows, tileRanges, tileDepthM, tilePadY);

  P.visualEraCluster(sector, 'turret', () => {
    for (const side of [-1, 1]) {
      for (const row of rows) {
        for (const plan of seatedPlans) {
          P.add(carrierBucket, mirroredCarrier(side, plan, row));
          for (const [t0, t1] of tileRanges) {
            P.add(gasketBucket, carrierFaceTile(
              side, plan, row, t0, t1, gasketDepthM, gasketPadT, gasketPadY,
            ));
            P.add(tileBucket, carrierFaceTile(
              side, plan, row, t0, t1, tileDepthM, 0, tilePadY,
            ));
          }
        }
      }
    }
    if (centerClosure) {
      const { width, height, depth, x = 0, y, z, rx = 0, ry = 0, rz = 0 } = centerClosure;
      P.add(gasketBucket, KIT.box(width, height, depth), x, y, z + forwardM, rx, ry, rz);
    }
  });

  const receipt = Object.freeze({
    family,
    rowsPerCheek: rows.length,
    carriersPerRow: plans.length,
    carrierSurfacesTotal: rows.length * plans.length * 2,
    tilesPerCarrierSurface: tileRanges.length,
    tilesTotal: rows.length * plans.length * tileRanges.length * 2,
    ridgeY,
    lowerRearZOffset: rows[0].z0,
    ridgeZOffset: rows[0].z1,
    upperRearZOffset: rows[1].z1,
    forwardM,
    frontmostTileZM,
    exactSurfaceOffsets: true,
  });
  P.turretG.userData[receiptKey] = receipt;
  return receipt;
}
