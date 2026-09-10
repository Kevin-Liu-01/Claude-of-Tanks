/** Construction-only composition of accepted Ironworks buildings. */
import { Box3, Matrix4, Vector3, type BufferGeometry } from 'three';
import type { CollisionRecord } from './collision.ts';
import { applyStructureCollisionBand, type StructureCollisionRuntimeProfile } from './structureCollision.ts';
import type { FisheryVegetation } from './mangroveFisheryWharf.ts';
import { planFoundrySupport } from './foundryServiceSupport.ts';

interface Pose { x: number; y: number; z: number; yaw: number }
export interface FoundryServiceCourtSite {
  planIndex: number; kind: string; x: number; z: number; yawDeg: number;
}
export interface FoundryServiceCourtConfig { sites: readonly FoundryServiceCourtSite[] }
export interface FoundryDonor {
  planIndex: number;
  kind: string;
  buckets: Record<string, BufferGeometry[]>;
  profile: StructureCollisionRuntimeProfile;
  source: Pose;
  records: CollisionRecord[];
  feature: { x: number; z: number; w: number; d: number; rot: number };
  placement: { x: number; z: number; rr: number };
}
interface Field {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _layout: {
    roads: readonly (readonly (readonly [number, number])[])[];
    spawns: { player: { x: number; z: number }; enemies: readonly { x: number; z: number }[] };
  };
}
interface Seat {
  donor: FoundryDonor; pose: Pose; transform: Matrix4; box: Box3;
  support: ReturnType<typeof planFoundrySupport>;
}

function matrix(pose: Pose): Matrix4 {
  return new Matrix4().makeRotationY(pose.yaw).setPosition(pose.x, pose.y, pose.z);
}

function transformedBounds(donor: FoundryDonor, transform: Matrix4): Box3 {
  const box = new Box3(), point = new Vector3();
  for (const parts of Object.values(donor.buckets)) for (const geometry of parts) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(transform);
      box.expandByPoint(point);
    }
  }
  return box;
}

function routeDistance(field: Field, x: number, z: number): number {
  let result = Infinity;
  for (const road of field._layout.roads) for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    result = Math.min(result, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return result;
}

function planSeat(field: Field, donor: FoundryDonor, site: FoundryServiceCourtSite): Seat {
  if (![site.x, site.z, site.yawDeg].every(Number.isFinite)) throw new Error('invalid site pose');
  const support = planFoundrySupport(field, donor, site);
  const pose = { x: site.x, z: site.z, y: support.y, yaw: site.yawDeg * Math.PI / 180 };
  const transform = matrix(pose).multiply(matrix(donor.source).invert());
  const box = transformedBounds(donor, transform);
  // Rail kit's three 3m-wide ballast strips are not movement records. Only
  // the gantry's overhead span may cross them; its two feet must stay clear.
  const railBounds = donor.kind === 'gantry' ? support.supports : [{ min: box.min.toArray(), max: box.max.toArray() }];
  for (const foot of railBounds) for (const x of [58, 67, 76]) {
    if (foot.max[0] + 0.3 > x - 1.5 && foot.min[0] - 0.3 < x + 1.5
      && foot.max[2] > -438 && foot.min[2] < 462) throw new Error(`${donor.kind}: blocks rail ballast`);
  }
  // Roads are not collision records. Preserve the actual route network,
  // including the space beneath the crane, independently of the props index.
  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / 2));
  const nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / 2));
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const x = box.min.x + (box.max.x - box.min.x) * ix / nx;
    const z = box.min.z + (box.max.z - box.min.z) * iz / nz;
    if (!Number.isFinite(field.getHeightAt(x, z)) || field.getWaterMaskAt(x, z) !== 0
      || routeDistance(field, x, z) < 7) throw new Error(`${donor.kind}: route or water clearance`);
  }
  if (donor.records.length !== donor.profile.shell.length + 1) throw new Error('collision band count changed');
  return { donor, pose, transform, box, support };
}

function intersects(box: Box3, min: readonly number[], max: readonly number[]): boolean {
  return box.max.x + 0.3 > min[0] && box.min.x - 0.3 < max[0]
    && box.max.z + 0.3 > min[2] && box.min.z - 0.3 < max[2];
}

function requireClearVegetationAndDeployment(box: Box3, field: Field, vegetation: FisheryVegetation): void {
  for (const disc of vegetation.concealers) {
    const dx = Math.max(box.min.x - disc.x, 0, disc.x - box.max.x);
    const dz = Math.max(box.min.z - disc.z, 0, disc.z - box.max.z);
    if (Math.hypot(dx, dz) < disc.r / 0.8 + 0.3) throw new Error('donor intersects vegetation crown');
  }
  for (const spawn of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
    const dx = Math.max(box.min.x - spawn.x, 0, spawn.x - box.max.x);
    const dz = Math.max(box.min.z - spawn.z, 0, spawn.z - box.max.z);
    if (Math.hypot(dx, dz) < 32) throw new Error('donor enters deployment clearance');
  }
}

function requireClearSeats(seats: Seat[], field: Field, blockers: readonly CollisionRecord[], vegetation: FisheryVegetation): void {
  const ignored = new Set(seats.flatMap(seat => seat.donor.records));
  for (let i = 0; i < seats.length; i++) {
    const { box, donor } = seats[i];
    for (const records of [blockers, vegetation.treeObstacles]) for (const record of records) {
      if (!ignored.has(record) && intersects(box, record.min, record.max)) {
        throw new Error(`${donor.kind}: occupied by ${record.kind || 'prop'}`);
      }
    }
    requireClearVegetationAndDeployment(box, field, vegetation);
    for (let j = 0; j < i; j++) {
      if (intersects(box, seats[j].box.min.toArray(), seats[j].box.max.toArray())) throw new Error('court donors overlap');
    }
  }
}

function commitSeat({ donor, pose, transform, box, support }: Seat) {
  let parts = 0;
  for (const values of Object.values(donor.buckets)) for (const geometry of values) {
    geometry.applyMatrix4(transform); parts++;
  }
  const bands = [donor.profile.contact, ...donor.profile.shell];
  bands.forEach((band, i) => {
    const record = donor.records[i];
    record.min[1] = pose.y + band.minY; record.max[1] = pose.y + band.maxY;
    applyStructureCollisionBand(record, band, pose.x, pose.z, pose.yaw);
  });
  Object.assign(donor.feature, { x: pose.x, z: pose.z, rot: pose.yaw });
  Object.assign(donor.placement, { x: pose.x, z: pose.z });
  return { planIndex: donor.planIndex, kind: donor.kind, source: donor.source, target: pose,
    bounds: { min: box.min.toArray(), max: box.max.toArray() }, support, parts };
}

/** Plan all six before mutation. No donor rebuilds, fallback sites or RNG. */
export function composeFoundryServiceCourt(mapId: string, config: FoundryServiceCourtConfig | undefined,
  field: Field, donors: readonly FoundryDonor[], blockers: readonly CollisionRecord[],
  vegetation: FisheryVegetation | null) {
  if (mapId !== 'foundry' || !config) return null;
  if (config.sites.length !== 6 || donors.length !== 6 || !vegetation) {
    return { status: 'unavailable', reason: 'expected six accepted donors and vegetation owner' };
  }
  let seats: Seat[];
  try {
    const used = new Set<number>();
    seats = config.sites.map(site => {
      const donor = donors.find(value => value.planIndex === site.planIndex && value.kind === site.kind);
      if (!donor || used.has(site.planIndex)) throw new Error('missing or duplicate authored donor');
      used.add(site.planIndex);
      return planSeat(field, donor, site);
    });
    requireClearSeats(seats, field, blockers, vegetation);
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
  }
  return { status: 'placed', reason: '', donors: seats.map(commitSeat) };
}
