// Shared first-party construction rule for Soviet-family turret ERA.
//
// This is deliberately a geometry helper rather than a vehicle template:
// each profile supplies its own plan, height, depth and tile cadence.  The
// invariant is the part that matters visually and physically: two distinct
// carrier rows meet at one ridge in side elevation, and every visible ERA
// tile is derived from (and offset along) the carrier's actual outer plane.
// That prevents guessed Euler boxes, floating tiles and coplanar flicker.
import { KIT, orientedSlab } from './kit.js';

import type * as THREE from 'three';

type Side = -1 | 1;
type PlanPoint = readonly [x: number, z: number];
type ChevronPlan = readonly PlanPoint[];
type TileRange = readonly [start: number, end: number];

interface ChevronRow {
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

interface CenterClosure {
  width: number;
  height: number;
  depth: number;
  x?: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

interface ChevronBuilderPort {
  turretG: THREE.Object3D;
  add(
    bucket: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rx?: number,
    ry?: number,
    rz?: number,
  ): void;
  visualEraCluster(sector: string, owner: 'turret', build: () => void): void;
}

export interface SovietChevronEraOptions {
  sector: string;
  receiptKey: string;
  family: string;
  plans: readonly ChevronPlan[];
  rows: readonly [ChevronRow, ChevronRow];
  tileRanges?: readonly TileRange[];
  carrierBucket?: string;
  tileBucket?: string;
  gasketBucket?: string;
  gasketDepthM?: number;
  tileDepthM?: number;
  gasketPadT?: number;
  gasketPadY?: number;
  tilePadY?: number;
  forwardM?: number;
  centerClosure?: CenterClosure | null;
}

export interface SovietChevronEraReceipt {
  readonly family: string;
  readonly rowsPerCheek: number;
  readonly carriersPerRow: number;
  readonly carrierSurfacesTotal: number;
  readonly tilesPerCarrierSurface: number;
  readonly tilesTotal: number;
  readonly ridgeY: number;
  readonly lowerRearZOffset: number;
  readonly ridgeZOffset: number;
  readonly upperRearZOffset: number;
  readonly forwardM: number;
  readonly frontmostTileZM: number;
  readonly exactSurfaceOffsets: true;
}

const DEFAULT_TILE_RANGES: readonly TileRange[] = Object.freeze([
  Object.freeze([0.08, 0.31] as const),
  Object.freeze([0.345, 0.655] as const),
  Object.freeze([0.69, 0.92] as const),
]);

function mirroredCarrier(
  side: Side,
  plan: ChevronPlan,
  row: ChevronRow,
): THREE.BufferGeometry {
  return orientedSlab(
    ...plan.map(([x, z]) => [side * x, row.y0, z + row.z0]),
    ...plan.map(([x, z]) => [side * x, row.y1, z + row.z1]),
  );
}

function carrierFaceTile(
  side: Side,
  plan: ChevronPlan,
  row: ChevronRow,
  t0: number,
  t1: number,
  depth: number,
  padT = 0,
  padY = 0,
): THREE.BufferGeometry {
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
  const zOffsetAtY = (y: number): number => row.z0
    + (row.z1 - row.z0) * ((y - row.y0) / Math.max(1e-6, row.y1 - row.y0));
  const point = (t: number, y: number, push = 0): [number, number, number] => [
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

function frontmostTileZ(
  plans: readonly ChevronPlan[],
  rows: readonly ChevronRow[],
  tileRanges: readonly TileRange[],
  depth: number,
  padY: number,
): number {
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

export function addSovietChevronEra(P: ChevronBuilderPort, {
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
}: SovietChevronEraOptions): SovietChevronEraReceipt {
  if (!sector || !receiptKey || !family) throw new Error('Chevron ERA requires sector, receiptKey and family');
  if (!Array.isArray(plans) || plans.length === 0) throw new Error(`${family}: chevron plans are empty`);
  if (!Array.isArray(rows) || rows.length !== 2) throw new Error(`${family}: chevron ERA requires exactly two rows`);
  const ridgeY = rows[0].y1;
  if (Math.abs(ridgeY - rows[1].y0) > 1e-6) throw new Error(`${family}: chevron rows do not share a ridge`);
  const seatedPlans: ChevronPlan[] = plans.map((plan: ChevronPlan) => (
    plan.map(([x, z]: PlanPoint): PlanPoint => [x, z + forwardM])
  ));
  const frontmostTileZM = frontmostTileZ(seatedPlans, rows, tileRanges, tileDepthM, tilePadY);

  P.visualEraCluster(sector, 'turret', () => {
    for (const side of [-1, 1] as const) {
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

  const receipt: SovietChevronEraReceipt = Object.freeze({
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
