import * as THREE from 'three';
import { GUN_ROTOR_KEY } from './gunRotorSpin.ts';

const DEFAULT_SAMPLE_FRACTIONS = Object.freeze([0.45, 0.55, 0.65, 0.75]);
const DEFAULT_AXIS_SAMPLE_FRACTIONS = Object.freeze([0.80, 0.85, 0.90, 0.925, 0.95, 0.975]);
const BARREL_MESH_NAMES = /^(gun|gunBarrel\d+)$/;
const BATCHED_BARREL_MESH_NAMES = /^gunMount$/;
const FORWARD_BARREL_MESH_NAMES = /^(gun|gunDark|gunMount|gunMountDark|gunBarrel\d+(?:Dark)?)$/;
const NUMBERED_BARREL_NAME = /^gunBarrel(\d+)(?:Dark)?$/;
const ROTOR_LANE = 'rotor';
const EPSILON = 1e-6;
const NODE_EPSILON = 1e-4;

const _gunWorldInverse = new THREE.Matrix4();
const _meshToGun = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();

type SlicePoint = [number, number];
type SliceSegment = [SlicePoint, SlicePoint];

interface BarrelLane {
  name: string;
  meshes: THREE.Mesh[];
  minZ: number;
  maxZ: number;
  allowOffset: boolean;
  expectedCenterXM: number;
  // the lane's fire axis in rig_gun space: a slice keeps only section points within maxRadiusM of it
  axisXM: number;
  axisYM: number;
  // its tubes ride a rotor (gunRotorSpin.ts): the bore is the cluster's centre, no one barrel's
  rotary: boolean;
}

interface BarrelLaneBounds {
  minZ: number;
  maxZ: number;
}

interface BarrelSamplingContext {
  gunRig: THREE.Object3D;
  gunWorldInverse: THREE.Matrix4;
  muzzleZ: number;
  maxRadiusM: number;
  maxCenterOffsetM: number;
  minimumSpanM: number;
  maxAspectRatio: number;
  maxLateralAxisOffsetM: number;
  samples: BarrelCircularitySample[];
}

interface BarrelCircularitySample {
  zM: number;
  widthM: number;
  heightM: number;
  centerXM: number;
  centerYM: number;
  aspectRatio: number;
  ellipseErrorP80: number;
  pointCount: number;
  fraction?: number;
  lane?: string;
  source?: string;
  expectedCenterXM?: number;
  lateralAxisOffsetM?: number;
  axisPass?: boolean;
  pass?: boolean;
}

interface TurretBarrelCircularityOptions {
  sampleFractions?: readonly number[];
  maxAspectRatio?: number;
  maxRadiusM?: number;
  maxCenterOffsetM?: number;
  minimumSpanM?: number;
  requireMeasurement?: boolean;
  meshNamePattern?: RegExp;
  fallbackMeshNamePattern?: RegExp | null;
  checkAxisAlignment?: boolean;
  axisSampleFractions?: readonly number[];
  axisMeshNamePattern?: RegExp;
  maxLateralAxisOffsetM?: number;
}

interface TurretBarrelVisual {
  root?: THREE.Object3D | null;
}

interface TurretBarrelCircularityResult {
  pass: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  muzzleZ?: number;
  maxAspectRatio?: number;
  maxLateralAxisOffsetM?: number;
  worst?: BarrelCircularitySample | null;
  worstAxis?: BarrelCircularitySample | null;
  samples: BarrelCircularitySample[];
}

function isMeshObject(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function edgePlaneIntersections(
  a: THREE.Vector3,
  b: THREE.Vector3,
  planeZ: number,
): SlicePoint[] {
  const da = a.z - planeZ;
  const db = b.z - planeZ;
  if (Math.abs(da) <= EPSILON && Math.abs(db) <= EPSILON) {
    return [[a.x, a.y], [b.x, b.y]];
  }
  if ((da < -EPSILON && db < -EPSILON) || (da > EPSILON && db > EPSILON)) return [];
  const denominator = b.z - a.z;
  if (Math.abs(denominator) <= EPSILON) return [];
  const t = (planeZ - a.z) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON) return [];
  const clampedT = Math.max(0, Math.min(1, t));
  return [[
    a.x + (b.x - a.x) * clampedT,
    a.y + (b.y - a.y) * clampedT,
  ]];
}

function uniqueSlicePoints(points: readonly SlicePoint[]): SlicePoint[] {
  const unique: SlicePoint[] = [];
  for (const point of points) {
    const duplicate = unique.some(([x, y]) => (
      Math.hypot(point[0] - x, point[1] - y) <= EPSILON
    ));
    if (!duplicate) unique.push(point);
  }
  return unique;
}

function farthestSliceSegment(points: readonly SlicePoint[]): {
  pair: SliceSegment;
  distance: number;
} | null {
  if (points.length < 2) return null;
  let pair: SliceSegment = [points[0], points[1]];
  let distance = 0;
  for (let left = 0; left < points.length; left++) {
    for (let right = left + 1; right < points.length; right++) {
      const candidateDistance = Math.hypot(
        points[left][0] - points[right][0],
        points[left][1] - points[right][1],
      );
      if (candidateDistance > distance) {
        pair = [points[left], points[right]];
        distance = candidateDistance;
      }
    }
  }
  return { pair, distance };
}

function trianglePlaneSegment(
  planeZ: number,
  maxRadiusM: number,
  axisXM: number,
  axisYM: number,
): SliceSegment | null {
  const minZ = Math.min(_a.z, _b.z, _c.z);
  const maxZ = Math.max(_a.z, _b.z, _c.z);
  if (planeZ < minZ - EPSILON || planeZ > maxZ + EPSILON) return null;
  const triangleLiesOnPlane = Math.abs(_a.z - planeZ) <= EPSILON
    && Math.abs(_b.z - planeZ) <= EPSILON
    && Math.abs(_c.z - planeZ) <= EPSILON;
  if (triangleLiesOnPlane) return null;
  const unique = uniqueSlicePoints([
    ...edgePlaneIntersections(_a, _b, planeZ),
    ...edgePlaneIntersections(_b, _c, planeZ),
    ...edgePlaneIntersections(_c, _a, planeZ),
  ]);
  const segment = farthestSliceSegment(unique);
  if (!segment || segment.distance <= EPSILON) return null;
  if (segment.pair.some(([x, y]) => Math.hypot(x - axisXM, y - axisYM) > maxRadiusM)) return null;
  return segment.pair;
}

function appendGeometrySlice(
  segments: SliceSegment[],
  mesh: THREE.Mesh,
  gunWorldInverse: THREE.Matrix4,
  planeZ: number,
  maxRadiusM: number,
  axisXM: number,
  axisYM: number,
): void {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return;
  _meshToGun.multiplyMatrices(gunWorldInverse, mesh.matrixWorld);
  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const readVertex = (target: THREE.Vector3, vertexIndex: number): THREE.Vector3 => target
    .fromBufferAttribute(position, vertexIndex)
    .applyMatrix4(_meshToGun);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 3;
    readVertex(_a, index ? index.getX(offset) : offset);
    readVertex(_b, index ? index.getX(offset + 1) : offset + 1);
    readVertex(_c, index ? index.getX(offset + 2) : offset + 2);
    const segment = trianglePlaneSegment(planeZ, maxRadiusM, axisXM, axisYM);
    if (segment) segments.push(segment);
  }
}

function ridesRotor(mesh: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) if (node.userData?.[GUN_ROTOR_KEY]) return true;
  return false;
}

function barrelLaneMeshGroups(meshes: readonly THREE.Mesh[]): Map<string, THREE.Mesh[]> {
  const laneMeshes = new Map<string, THREE.Mesh[]>([['main', []]]);
  for (const mesh of meshes) {
    const numbered = mesh.name.match(NUMBERED_BARREL_NAME);
    // 270: a rotary cluster's tubes (gunRotorSpin.ts) are one lane of their own, measured about the gun's bore
    const lane = numbered ? `barrel-${numbered[1]}` : ridesRotor(mesh) ? ROTOR_LANE : 'main';
    const group = laneMeshes.get(lane) || [];
    group.push(mesh);
    laneMeshes.set(lane, group);
  }
  return laneMeshes;
}

function barrelLaneBounds(
  meshes: readonly THREE.Mesh[],
  gunWorldInverse: THREE.Matrix4,
): BarrelLaneBounds | null {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of meshes) {
    const position = mesh.geometry?.attributes?.position;
    if (!position) continue;
    _meshToGun.multiplyMatrices(gunWorldInverse, mesh.matrixWorld);
    for (let vertex = 0; vertex < position.count; vertex++) {
      _a.fromBufferAttribute(position, vertex).applyMatrix4(_meshToGun);
      minZ = Math.min(minZ, _a.z);
      maxZ = Math.max(maxZ, _a.z);
    }
  }
  return Number.isFinite(minZ) && Number.isFinite(maxZ) ? { minZ, maxZ } : null;
}

function expectedBarrelLaneAxis(
  name: string,
  gunWorldInverse: THREE.Matrix4,
  gunRig: THREE.Object3D,
): { x: number; y: number } {
  const numbered = name.match(/^barrel-(\d+)$/);
  const muzzleName = numbered ? `rig_muzzle_tip_${numbered[1]}` : 'rig_muzzle';
  const muzzle = gunRig.getObjectByName(muzzleName);
  if (!muzzle) return { x: 0, y: 0 };
  muzzle.getWorldPosition(_muzzleWorld);
  _muzzleWorld.applyMatrix4(gunWorldInverse);
  return { x: _muzzleWorld.x, y: _muzzleWorld.y };
}

function barrelLanes(
  meshes: THREE.Mesh[],
  gunWorldInverse: THREE.Matrix4,
  gunRig: THREE.Object3D,
): BarrelLane[] {
  const lanes: BarrelLane[] = [];
  for (const [name, meshesForLane] of barrelLaneMeshGroups(meshes)) {
    if (!meshesForLane.length) continue;
    const bounds = barrelLaneBounds(meshesForLane, gunWorldInverse);
    if (!bounds) continue;
    const axis = expectedBarrelLaneAxis(name, gunWorldInverse, gunRig);
    // 270: a numbered tube is sliced about its own fire axis; the air-defence twins carry theirs 0.9-1.4 m out on the
    // turret sides, past any radius about the gun's centre. A rotor's barrels sit round the bore, off it by design. The
    // main lane keeps the gun's centre.
    const offset = name !== 'main';
    lanes.push({
      name,
      meshes: meshesForLane,
      ...bounds,
      allowOffset: offset,
      expectedCenterXM: axis.x,
      axisXM: offset ? axis.x : 0,
      axisYM: offset ? axis.y : 0,
      rotary: name === ROTOR_LANE,
    });
  }
  return lanes;
}

function pointKey([x, y]: SlicePoint): string {
  return `${Math.round(x / NODE_EPSILON)},${Math.round(y / NODE_EPSILON)}`;
}

function sliceComponents(segments: SliceSegment[]): SlicePoint[][] {
  const nodes = new Map<string, SlicePoint>();
  const parent = new Map<string, string>();
  const ensureNode = (point: SlicePoint): string => {
    const key = pointKey(point);
    if (!nodes.has(key)) {
      nodes.set(key, point);
      parent.set(key, key);
    }
    return key;
  };
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let current = key;
    while (parent.get(current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  for (const [a, b] of segments) union(ensureNode(a), ensureNode(b));
  const components = new Map<string, SlicePoint[]>();
  for (const [key, point] of nodes) {
    const root = find(key);
    if (!components.has(root)) components.set(root, []);
    components.get(root)!.push(point);
  }
  return [...components.values()];
}

function componentReceipt(
  points: SlicePoint[],
  planeZ: number,
): BarrelCircularitySample | null {
  // A rectangular mantlet or sight housing generally contributes four to
  // eight section vertices. Require a genuine polygonal tube contour so the
  // aspect gate evaluates barrels, not nearby gun-mounted furniture.
  if (points.length < 10) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const widthM = maxX - minX;
  const heightM = maxY - minY;
  if (widthM <= EPSILON || heightM <= EPSILON) return null;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radiusX = widthM / 2;
  const radiusY = heightM / 2;
  const ellipseErrors = points.map(([x, y]) => Math.abs(
    Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY) - 1,
  )).sort((a, b) => a - b);
  const ellipseErrorP80 = ellipseErrors[Math.floor((ellipseErrors.length - 1) * 0.80)];
  if (ellipseErrorP80 > 0.12) return null;
  return {
    zM: planeZ,
    widthM,
    heightM,
    centerXM: centerX,
    centerYM: centerY,
    aspectRatio: Math.max(widthM, heightM) / Math.min(widthM, heightM),
    ellipseErrorP80,
    pointCount: points.length,
  };
}

function matchingBarrelMeshes(gunRig: THREE.Object3D, pattern: RegExp): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  gunRig.traverse((object) => {
    if (isMeshObject(object) && object.visible !== false && pattern.test(object.name)) {
      meshes.push(object);
    }
  });
  return meshes;
}

function measureBarrelStation(
  context: BarrelSamplingContext,
  lane: BarrelLane,
  zM: number,
  fraction: number,
  source: string,
): BarrelCircularitySample[] {
  const segments: SliceSegment[] = [];
  for (const mesh of lane.meshes) {
    appendGeometrySlice(segments, mesh, context.gunWorldInverse, zM, context.maxRadiusM, lane.axisXM, lane.axisYM);
  }
  const stationSamples: BarrelCircularitySample[] = [];
  for (const component of sliceComponents(segments)) {
    const receipt = componentReceipt(component, zM);
    if (!receipt) continue;
    if (receipt.widthM < context.minimumSpanM || receipt.heightM < context.minimumSpanM) continue;
    if (!lane.allowOffset
      && Math.hypot(receipt.centerXM, receipt.centerYM) > context.maxCenterOffsetM) continue;
    receipt.fraction = fraction;
    receipt.lane = lane.name;
    receipt.source = source;
    receipt.pass = receipt.aspectRatio <= context.maxAspectRatio + EPSILON;
    stationSamples.push(receipt);
  }
  return stationSamples;
}

// 270: of equal tubes (within a millimetre) the one nearest the fire axis is the bore: the Pantsir-S1's 2A38M carries two
// barrels in one cradle and fires down its inner one
const AXIS_TIE_M = 0.001;

function primaryAxisSample(
  samples: readonly BarrelCircularitySample[],
  maxAspectRatio: number,
  expectedCenterXM: number,
): BarrelCircularitySample | null {
  const bore = (sample: BarrelCircularitySample): number => Math.min(sample.widthM, sample.heightM);
  return samples
    .filter((sample) => sample.aspectRatio <= maxAspectRatio + EPSILON)
    .reduce<BarrelCircularitySample | null>((current, sample) => (
      !current || bore(sample) > bore(current) + AXIS_TIE_M
        || (bore(sample) > bore(current) - AXIS_TIE_M
          && Math.abs(sample.centerXM - expectedCenterXM) < Math.abs(current.centerXM - expectedCenterXM))
        ? sample
        : current
    ), null);
}

function appendAxisSample(
  context: BarrelSamplingContext,
  lane: BarrelLane,
  stationSamples: readonly BarrelCircularitySample[],
): void {
  const tube = primaryAxisSample(stationSamples, context.maxAspectRatio, lane.expectedCenterXM);
  if (!tube) return;
  // 270: a rotary cluster (the M163's Vulcan) sets its barrels round the bore, so its axis is their common centre
  const round = stationSamples.filter((sample) => sample.aspectRatio <= context.maxAspectRatio + EPSILON);
  const primary = lane.rotary ? {
    ...tube,
    centerXM: round.reduce((sum, sample) => sum + sample.centerXM, 0) / round.length,
    centerYM: round.reduce((sum, sample) => sum + sample.centerYM, 0) / round.length,
    source: 'rotor-cluster',
  } : tube;
  primary.expectedCenterXM = lane.expectedCenterXM;
  primary.lateralAxisOffsetM = Math.abs(primary.centerXM - lane.expectedCenterXM);
  primary.axisPass = primary.lateralAxisOffsetM <= context.maxLateralAxisOffsetM + EPSILON;
  primary.pass = primary.pass && primary.axisPass;
  context.samples.push(primary);
}

function sampleBarrelPattern(
  context: BarrelSamplingContext,
  pattern: RegExp,
  source: string,
  fractions: readonly number[],
  axisAudit: boolean,
): void {
  const meshes = matchingBarrelMeshes(context.gunRig, pattern);
  for (const lane of barrelLanes(meshes, context.gunWorldInverse, context.gunRig)) {
    const startZ = Math.max(0, lane.minZ);
    const endZ = Math.min(context.muzzleZ, lane.maxZ);
    if (endZ - startZ <= context.minimumSpanM) continue;
    for (const fraction of fractions) {
      const zM = startZ + (endZ - startZ) * fraction;
      const stationSamples = measureBarrelStation(context, lane, zM, fraction, source);
      if (axisAudit) appendAxisSample(context, lane, stationSamples);
      else context.samples.push(...stationSamples);
    }
  }
}

/**
 * Measures actual main-gun cross-sections in rig_gun local space. This sees
 * both baked vertex distortion and inherited scene transforms, unlike checks
 * that only inspect CylinderGeometry constructor parameters.
 */
export function measureTurretBarrelCircularity(
  visual: TurretBarrelVisual | null | undefined,
  options: TurretBarrelCircularityOptions = {},
): TurretBarrelCircularityResult {
  const {
    sampleFractions = DEFAULT_SAMPLE_FRACTIONS,
    maxAspectRatio = 1.08,
    maxRadiusM = 0.45,
    maxCenterOffsetM = 0.08,
    minimumSpanM = 0.025,
    requireMeasurement = false,
    meshNamePattern = BARREL_MESH_NAMES,
    fallbackMeshNamePattern = BATCHED_BARREL_MESH_NAMES,
    checkAxisAlignment = true,
    axisSampleFractions = DEFAULT_AXIS_SAMPLE_FRACTIONS,
    axisMeshNamePattern = FORWARD_BARREL_MESH_NAMES,
    maxLateralAxisOffsetM = 0.02,
  } = options;
  const root = visual?.root;
  const gunRig = root?.getObjectByName('rig_gun');
  const muzzle = root?.getObjectByName('rig_muzzle');
  if (!root || !gunRig || !muzzle) {
    return { pass: false, error: 'missing root, rig_gun, or rig_muzzle', samples: [] };
  }
  root.updateMatrixWorld(true);
  muzzle.getWorldPosition(_muzzleWorld);
  const muzzleGunLocal = gunRig.worldToLocal(_muzzleWorld.clone());
  const muzzleZ = muzzleGunLocal.z;
  if (!(muzzleZ > minimumSpanM)) {
    return { pass: false, error: `invalid muzzle station ${muzzleZ}`, samples: [] };
  }

  _gunWorldInverse.copy(gunRig.matrixWorld).invert();
  const samples: BarrelCircularitySample[] = [];
  const samplingContext: BarrelSamplingContext = {
    gunRig,
    gunWorldInverse: _gunWorldInverse,
    muzzleZ,
    maxRadiusM,
    maxCenterOffsetM,
    minimumSpanM,
    maxAspectRatio,
    maxLateralAxisOffsetM,
    samples,
  };
  sampleBarrelPattern(samplingContext, meshNamePattern, 'barrel', sampleFractions, false);
  // A few legacy builders merge their tube into gunMount. Only fall back to
  // that batched mesh when no dedicated gun contour exists; otherwise an
  // intentionally non-circular mantlet tunnel could be mistaken for a tube.
  if (!samples.length && fallbackMeshNamePattern) {
    sampleBarrelPattern(
      samplingContext, fallbackMeshNamePattern, 'gunMount-fallback', sampleFractions, false,
    );
  }
  if (checkAxisAlignment) {
    sampleBarrelPattern(
      samplingContext, axisMeshNamePattern, 'forward-axis', axisSampleFractions, true,
    );
  }
  if (!samples.length) {
    const reason = 'no measurable turret-barrel contour';
    return {
      pass: !requireMeasurement,
      skipped: !requireMeasurement,
      error: requireMeasurement ? reason : undefined,
      reason,
      muzzleZ,
      samples,
    };
  }
  const worst = samples.reduce<BarrelCircularitySample | null>((current, sample) => (
    !current || sample.aspectRatio > current.aspectRatio ? sample : current
  ), null);
  const worstAxis = samples.reduce<BarrelCircularitySample | null>((current, sample) => (
    sample.lateralAxisOffsetM === undefined
      ? current
      : !current || sample.lateralAxisOffsetM > (current.lateralAxisOffsetM ?? -Infinity)
        ? sample
        : current
  ), null);
  return {
    pass: samples.every((sample) => sample.pass),
    muzzleZ,
    maxAspectRatio,
    maxLateralAxisOffsetM,
    worst,
    worstAxis,
    samples,
  };
}
