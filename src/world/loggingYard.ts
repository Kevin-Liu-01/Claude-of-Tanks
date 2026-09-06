/** Construction-only Longleaf composition: move accepted props, never add them. */
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { setObbShape, type CollisionRecord } from './collision.ts';
import { planGroundedSegment, sampleDiscGround, sampleObbGround, type GroundedSegmentEndpoint } from './propPlacement.ts';

interface YardPose { x: number; z: number; yaw: number }
export interface LoggingYardConfig {
  flatbeds: readonly YardPose[];
  bundles: readonly YardPose[];
  clearcut: readonly (readonly [number, number])[];
}
interface YardTerrain {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getGroundType(x: number, z: number): string;
  _roadDist(x: number, z: number): number;
  _noVeg(x: number, z: number): boolean;
  _layout: { spawns: { player: { x: number; z: number }; enemies: readonly { x: number; z: number }[] } };
}
interface TimberGrounding {
  kind: string; x: number; y: number; z: number; relief?: number;
  start?: GroundedSegmentEndpoint; end?: GroundedSegmentEndpoint;
  supportMin?: number; supportMax?: number;
}
export interface FieldTimberPiece {
  geometry: BufferGeometry;
  grounding: TimberGrounding;
  radius: number;
  length: number;
  height: number;
  yaw: number;
}
interface YardVehicle {
  kind: string; x: number; y: number; z: number; yaw: number; sc: number; h: number;
  slot: number; state: number; ob: CollisionRecord | null; col?: CollisionRecord;
  groundSupport: { mode: 'pitched' | 'obb' | 'disc'; min: number; max: number; spread: number } | null;
}
interface YardVehiclePool { meta: { hw?: number; hl?: number; r: number }; mats4: Matrix4[] }
interface PlacementReceipt { attempted: number; accepted: number; unsafe: number; unavailable: number }
export interface LoggingYardReceipt {
  flatbeds: PlacementReceipt; bundles: PlacementReceipt; clearcut: PlacementReceipt;
  campsMoved: 0;
}

function pointIsDry(field: YardTerrain, x: number, z: number): boolean {
  if (Math.max(Math.abs(x), Math.abs(z)) > 455 || field._noVeg(x, z)
      || field._roadDist(x, z) < 7 || field.getGroundType(x, z) === 'soft') return false;
  const spawns = field._layout.spawns;
  if (Math.hypot(x - spawns.player.x, z - spawns.player.z) < 26) return false;
  return !spawns.enemies.some(s => Math.hypot(x - s.x, z - s.z) < 26);
}

/** Conservative actual-prop bounds, including walls, crates and late wrecks.
 * Authored yard sites may be inside the village only after this full check. */
function supportedSite(field: YardTerrain, point: YardPose, hw: number, hl: number,
  blockers: readonly CollisionRecord[], ignore?: CollisionRecord | null, pad = 0.3): boolean {
  if (![point.x, point.z, point.yaw, hw, hl].every(Number.isFinite)) return false;
  const c = Math.cos(point.yaw), s = Math.sin(point.yaw);
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const x = point.x + ix * hw * c + iz * hl * s, z = point.z - ix * hw * s + iz * hl * c;
    if (!pointIsDry(field, x, z) || field.getNormalAt(x, z).y < 0.9) return false;
  }
  const rx = Math.abs(c) * hw + Math.abs(s) * hl + pad;
  const rz = Math.abs(s) * hw + Math.abs(c) * hl + pad;
  return !blockers.some(ob => ob !== ignore && point.x + rx > ob.min[0] && point.x - rx < ob.max[0]
    && point.z + rz > ob.min[2] && point.z - rz < ob.max[2]);
}

function relocateVehicle(record: YardVehicle, pool: YardVehiclePool, field: YardTerrain, point: YardPose): void {
  const hw = (pool.meta.hw ?? pool.meta.r) * record.sc, hl = (pool.meta.hl ?? pool.meta.r) * record.sc;
  const support = sampleObbGround(field, point.x, point.z, hw, hl, point.yaw, 0.025);
  const y = Math.min(field.getHeightAt(point.x, point.z) - 0.04, support.y);
  record.x = point.x; record.z = point.z; record.y = y; record.yaw = point.yaw;
  record.groundSupport = { mode: 'obb', ...support };
  pool.mats4[record.slot].compose(new Vector3(point.x, y, point.z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), point.yaw), new Vector3(record.sc, record.sc, record.sc));
  const rx = hw * Math.abs(Math.cos(point.yaw)) + hl * Math.abs(Math.sin(point.yaw)) + 0.05;
  const rz = hw * Math.abs(Math.sin(point.yaw)) + hl * Math.abs(Math.cos(point.yaw)) + 0.05;
  for (const ob of [record.ob, record.col]) {
    if (!ob) continue;
    ob.min[0] = point.x - rx; ob.max[0] = point.x + rx; ob.min[1] = y; ob.max[1] = y + record.h;
    ob.min[2] = point.z - rz; ob.max[2] = point.z + rz;
    setObbShape(ob, point.x, point.z, hw + 0.05, hl + 0.05, point.yaw);
  }
}

function timberPose(piece: FieldTimberPiece, field: YardTerrain, point: YardPose) {
  const q = new Quaternion();
  if (piece.grounding.kind === 'fallen-log') {
    const p = planGroundedSegment(field, point.x, point.z, Math.cos(point.yaw), -Math.sin(point.yaw),
      piece.length, piece.radius * 0.85, piece.radius * 0.1);
    q.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(p.axisX, p.axisY, p.axisZ));
    return { matrix: new Matrix4().makeRotationFromQuaternion(q).setPosition(p.x, p.y, p.z),
      receipt: { x: p.x, y: p.y, z: p.z, relief: p.relief, start: p.start, end: p.end } };
  }
  const support = sampleDiscGround(field, point.x, point.z, piece.radius, 0.06);
  q.setFromAxisAngle(new Vector3(0, 1, 0), point.yaw);
  return { matrix: new Matrix4().makeRotationFromQuaternion(q).setPosition(point.x, support.y + piece.height / 2, point.z),
    receipt: { x: point.x, y: support.y, z: point.z, relief: support.spread, supportMin: support.min, supportMax: support.max } };
}

function relocateTimber(piece: FieldTimberPiece, field: YardTerrain, point: YardPose): void {
  const old = timberPose(piece, field, { ...piece.grounding, yaw: piece.yaw });
  const next = timberPose(piece, field, point);
  piece.geometry.applyMatrix4(next.matrix.multiply(old.matrix.invert()));
  Object.assign(piece.grounding, next.receipt);
  piece.yaw = point.yaw;
}

function newReceipt(attempted: number): PlacementReceipt {
  return { attempted, accepted: 0, unsafe: 0, unavailable: 0 };
}

function placeYardVehicles(config: LoggingYardConfig, field: YardTerrain, blockers: readonly CollisionRecord[],
  records: readonly YardVehicle[], pools: ReadonlyMap<string, YardVehiclePool>): PlacementReceipt {
  const receipt = newReceipt(config.flatbeds.length), donors = records.filter(r => r.kind === 'truckflatbed');
  const pool = pools.get('truckflatbed');
  for (let i = 0; i < config.flatbeds.length; i++) {
    const donor = donors[i], point = config.flatbeds[i];
    if (!donor || !pool) { receipt.unavailable++; continue; }
    const hw = (pool.meta.hw ?? pool.meta.r) * donor.sc, hl = (pool.meta.hl ?? pool.meta.r) * donor.sc;
    if (!supportedSite(field, point, hw, hl, blockers, donor.ob)
        || sampleObbGround(field, point.x, point.z, hw, hl, point.yaw).spread > 0.45) { receipt.unsafe++; continue; }
    relocateVehicle(donor, pool, field, point); receipt.accepted++;
  }
  return receipt;
}

function clearcutStation(config: LoggingYardConfig, index: number, count: number): YardPose {
  const fraction = index / Math.max(1, count - 1) * (config.clearcut.length - 1);
  const segment = Math.min(config.clearcut.length - 2, Math.floor(fraction)), t = fraction - segment;
  const a = config.clearcut[segment], b = config.clearcut[segment + 1];
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  const offset = (index % 2 ? -1 : 1) * (7 + (index % 3) * 3);
  return { x: a[0] + dx * t - dz / length * offset, z: a[1] + dz * t + dx / length * offset,
    yaw: Math.atan2(-dz, dx) + (index % 3 - 1) * 0.18 };
}

function updateTimberFootprint(piece: FieldTimberPiece, footprint: CollisionRecord): void {
  piece.geometry.computeBoundingBox();
  const box = piece.geometry.boundingBox!;
  footprint.min[0] = box.min.x; footprint.min[1] = box.min.y; footprint.min[2] = box.min.z;
  footprint.max[0] = box.max.x; footprint.max[1] = box.max.y; footprint.max[2] = box.max.z;
}

function placeTimber(config: LoggingYardConfig, field: YardTerrain, pieces: readonly FieldTimberPiece[],
  blockers: readonly CollisionRecord[]): Pick<LoggingYardReceipt, 'bundles' | 'clearcut'> {
  const bundles = newReceipt(config.bundles.length), clearcut = newReceipt(0);
  const logs = pieces.filter(p => p.grounding.kind === 'fallen-log');
  const bundleDonors = new Set(logs.slice(0, config.bundles.length));
  const remaining = pieces.length - bundleDonors.size;
  let bundleIndex = 0, cutIndex = 0;
  // Unmoved donors still occupy their original ground. Reserve every actual
  // footprint up front; a rejected move must not let another piece overlap it.
  const occupied = pieces.map(piece => {
    const footprint: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
    updateTimberFootprint(piece, footprint);
    return footprint;
  });
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    const bundle = bundleDonors.has(piece), receipt = bundle ? bundles : clearcut;
    const point = bundle ? config.bundles[bundleIndex++] : clearcutStation(config, cutIndex++, remaining);
    if (!bundle) clearcut.attempted++;
    // Cylinder axes are local X in the yaw convention of the legacy logs.
    const hw = piece.length ? piece.length / 2 : piece.radius * 1.15, hl = piece.radius * 1.15;
    const fit = timberPose(piece, field, point);
    if (!supportedSite(field, point, hw, hl, blockers)
        || !supportedSite(field, point, hw, hl, occupied, occupied[index], 0.05)
        || fit.receipt.relief > 0.65) { receipt.unsafe++; continue; }
    relocateTimber(piece, field, point); receipt.accepted++;
    updateTimberFootprint(piece, occupied[index]);
  }
  bundles.unavailable = config.bundles.length - bundleDonors.size;
  return { bundles, clearcut };
}

export function composeLoggingYard(config: LoggingYardConfig | undefined, field: YardTerrain,
  pieces: readonly FieldTimberPiece[], blockers: readonly CollisionRecord[], records: readonly YardVehicle[],
  pools: ReadonlyMap<string, YardVehiclePool>): LoggingYardReceipt | null {
  if (!config) return null;
  if (config.flatbeds.length > 2 || config.bundles.length > 10 || config.clearcut.length < 2
      || config.clearcut.length > 6 || pieces.length > 26) throw new Error('Logging yard exceeds original bounded allocation');
  for (let i = 1; i < config.clearcut.length; i++) {
    const a = config.clearcut[i - 1], b = config.clearcut[i];
    const length = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!Number.isFinite(length) || length === 0) throw new Error('Invalid logging clearcut path');
  }
  const flatbeds = placeYardVehicles(config, field, blockers, records, pools);
  const timber = placeTimber(config, field, pieces, blockers);
  return { flatbeds, ...timber, campsMoved: 0 };
}
