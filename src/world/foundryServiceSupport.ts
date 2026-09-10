/** Construction-only rigid seats for the six existing Foundry court donors. */
import { Box3, Matrix4, Vector3, type BufferGeometry } from 'three';

interface Pose { x: number; y: number; z: number; yaw: number }
export interface FoundrySupportDonor {
  kind: string;
  buckets: Record<string, readonly BufferGeometry[]>;
  source: Pose;
}
export interface FoundrySupportSite { x: number; z: number; yawDeg: number }
export interface FoundrySupportField {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
}
export const FOUNDRY_SUPPORT_EMBED = 0.03;
export const FOUNDRY_SUPPORT_TOP_CLEARANCE = 0.03;
/** Explicit art limit: a container body is not a 2.6m-thick foundation. */
export const FOUNDRY_CONTAINER_MAX_BURIAL = 0.12;

interface Foot { role: string; box: Box3 }
interface FootSample {
  foot: Foot; groundMin: number; groundMax: number; samples: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  minRoad: number; maxWater: number;
}
export interface FoundrySupportReceipt {
  role: string;
  min: [number, number, number];
  max: [number, number, number];
  groundMin: number; groundMax: number; samples: number;
  bottomGapMin: number; bottomGapMax: number;
  topClearanceMin: number; topClearanceMax: number;
}
export interface FoundrySupportPlan {
  y: number; lowerY: number; upperY: number;
  supports: FoundrySupportReceipt[];
  minRoad: number; maxWater: number;
}

function poseMatrix(pose: Pose): Matrix4 {
  if (![pose.x, pose.y, pose.z, pose.yaw].every(Number.isFinite)) {
    throw new Error('Foundry support requires a finite source pose');
  }
  return new Matrix4().makeRotationY(pose.yaw).setPosition(pose.x, pose.y, pose.z);
}

function localBounds(geometry: BufferGeometry, inverse: Matrix4, point: Vector3): Box3 {
  const box = new Box3(), position = geometry.attributes.position;
  if (!position || position.itemSize !== 3 || !position.count) throw new Error('Foundry support has no positions');
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(inverse);
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Foundry support has nonfinite geometry');
    box.expandByPoint(point);
  }
  return box;
}

function matchesBand(box: Box3, bottom: number, top: number): boolean {
  // Source parts already made one Float32 world-pose round trip. This tolerance
  // identifies a known support primitive; it never permits a terrain gap.
  return Math.abs(box.min.y - bottom) < 0.001 && Math.abs(box.max.y - top) < 0.001;
}

function supportRole(kind: string, bucket: string, geometry: BufferGeometry, box: Box3): string | null {
  if (geometry.userData.structureSupport?.part === 'entry-threshold') return 'threshold';
  if (kind === 'containerRow') return bucket === 'baked' && matchesBand(box, 0, 2.6) ? 'container' : null;
  if (bucket !== 'stone') return null;
  switch (kind) {
    case 'factory': return matchesBand(box, -0.7, 0.5) ? 'plinth' : null;
    case 'warehouse':
      if (matchesBand(box, -0.65, 0.45)) return 'plinth';
      return matchesBand(box, 0, 0.7) ? 'dock' : null;
    case 'gantry': return matchesBand(box, -0.03, 0.47) ? 'foot' : null;
    case 'stack': return matchesBand(box, -0.1, 1.5) ? 'plinth' : null;
    case 'shed': return matchesBand(box, -0.005, 0.545) ? 'platform' : null;
    default: throw new Error(`Unsupported Foundry donor: ${kind}`);
  }
}

function requireFeet(kind: string, feet: Foot[]): void {
  const count = (role: string): number => feet.filter(foot => foot.role === role).length;
  const valid: Record<string, boolean> = {
    containerRow: feet.length >= 5 && feet.length <= 6 && count('container') === feet.length,
    gantry: feet.length === 2 && count('foot') === 2,
    stack: feet.length === 1 && count('plinth') === 1,
    shed: feet.length === 1 && count('platform') === 1,
    factory: count('plinth') === 1 && count('threshold') >= 1 && feet.length === count('threshold') + 1,
    warehouse: count('plinth') === 1 && count('dock') === 1 && count('threshold') >= 1
      && feet.length === count('threshold') + 2,
  };
  if (!valid[kind]) throw new Error(`${kind}: actual support primitive census changed`);
}

function collectFeet(donor: FoundrySupportDonor): Foot[] {
  const inverse = poseMatrix(donor.source).invert(), point = new Vector3(), feet: Foot[] = [];
  for (const [bucket, parts] of Object.entries(donor.buckets)) for (const geometry of parts) {
    const box = localBounds(geometry, inverse, point);
    const role = supportRole(donor.kind, bucket, geometry, box);
    if (role) feet.push({ role, box });
  }
  requireFeet(donor.kind, feet);
  return feet;
}

function sampleFoot(field: FoundrySupportField, foot: Foot, site: FoundrySupportSite): FootSample {
  const box = foot.box, yaw = site.yawDeg * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const nx = Math.max(1, Math.ceil(box.max.x - box.min.x)), nz = Math.max(1, Math.ceil(box.max.z - box.min.z));
  if (nx > 32 || nz > 32) throw new Error('Foundry support exceeds its bounded footprint');
  const row: FootSample = { foot, groundMin: Infinity, groundMax: -Infinity, samples: 0,
    minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minRoad: Infinity, maxWater: 0 };
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const lx = box.min.x + (box.max.x - box.min.x) * ix / nx;
    const lz = box.min.z + (box.max.z - box.min.z) * iz / nz;
    const x = site.x + lx * c + lz * s, z = site.z - lx * s + lz * c;
    const h = field.getHeightAt(x, z), water = field.getWaterMaskAt(x, z), road = field._roadDist(x, z);
    if (![h, water, road].every(Number.isFinite) || water !== 0) throw new Error('Foundry support enters water or invalid ground');
    row.groundMin = Math.min(row.groundMin, h); row.groundMax = Math.max(row.groundMax, h);
    row.minX = Math.min(row.minX, x); row.maxX = Math.max(row.maxX, x);
    row.minZ = Math.min(row.minZ, z); row.maxZ = Math.max(row.maxZ, z);
    row.minRoad = Math.min(row.minRoad, road); row.maxWater = Math.max(row.maxWater, water); row.samples++;
  }
  return row;
}

function lowerSeat(row: FootSample): number {
  const box = row.foot.box;
  return row.foot.role === 'container'
    ? row.groundMax - box.min.y - FOUNDRY_CONTAINER_MAX_BURIAL
    : row.groundMax - box.max.y + FOUNDRY_SUPPORT_TOP_CLEARANCE;
}

function receipt(row: FootSample, y: number): FoundrySupportReceipt {
  const bottom = y + row.foot.box.min.y, top = y + row.foot.box.max.y;
  return { role: row.foot.role, min: [row.minX, bottom, row.minZ], max: [row.maxX, top, row.maxZ],
    groundMin: row.groundMin, groundMax: row.groundMax, samples: row.samples,
    bottomGapMin: bottom - row.groundMax, bottomGapMax: bottom - row.groundMin,
    topClearanceMin: top - row.groundMax, topClearanceMax: top - row.groundMin };
}

/** No geometry mutation, resampling of RNG, terrain edit or retained owner. */
export function planFoundrySupport(
  field: FoundrySupportField, donor: FoundrySupportDonor, site: FoundrySupportSite,
): FoundrySupportPlan {
  if (![site.x, site.z, site.yawDeg].every(Number.isFinite)) throw new Error('Foundry support requires a finite target');
  const rows = collectFeet(donor).map(foot => sampleFoot(field, foot, site));
  const lowerY = Math.max(...rows.map(lowerSeat));
  const upperY = Math.min(...rows.map(row => row.groundMin - row.foot.box.min.y - FOUNDRY_SUPPORT_EMBED));
  if (lowerY > upperY) throw new Error(`${donor.kind}: incompatible rigid support interval ${lowerY}..${upperY}`);
  // Stay just inside the feasible interval for the following Float32 rigid
  // transform. Threshold/dock rows prevent the deep plinth from lifting doors.
  const y = upperY - Math.min(0.0001, (upperY - lowerY) * 0.5);
  return { y, lowerY, upperY, supports: rows.map(row => receipt(row, y)),
    minRoad: Math.min(...rows.map(row => row.minRoad)), maxWater: Math.max(...rows.map(row => row.maxWater)) };
}
