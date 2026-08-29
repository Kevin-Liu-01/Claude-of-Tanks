import * as THREE from 'three';

const DEFAULT_SAMPLE_FRACTIONS = Object.freeze([0.45, 0.55, 0.65, 0.75]);
const BARREL_MESH_NAMES = /^(gun|gunBarrel\d+)$/;
const BATCHED_BARREL_MESH_NAMES = /^gunMount$/;
const NUMBERED_BARREL_NAME = /^gunBarrel(\d+)$/;
const EPSILON = 1e-6;
const NODE_EPSILON = 1e-4;

const _gunWorldInverse = new THREE.Matrix4();
const _meshToGun = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();

function edgePlaneIntersections(a, b, planeZ) {
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

function appendGeometrySlice(segments, mesh, gunWorldInverse, planeZ, maxRadiusM) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return;
  _meshToGun.multiplyMatrices(gunWorldInverse, mesh.matrixWorld);
  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const readVertex = (target, vertexIndex) => target
    .fromBufferAttribute(position, vertexIndex)
    .applyMatrix4(_meshToGun);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 3;
    readVertex(_a, index ? index.getX(offset) : offset);
    readVertex(_b, index ? index.getX(offset + 1) : offset + 1);
    readVertex(_c, index ? index.getX(offset + 2) : offset + 2);
    const minZ = Math.min(_a.z, _b.z, _c.z);
    const maxZ = Math.max(_a.z, _b.z, _c.z);
    if (planeZ < minZ - EPSILON || planeZ > maxZ + EPSILON) continue;
    if (Math.abs(_a.z - planeZ) <= EPSILON
      && Math.abs(_b.z - planeZ) <= EPSILON
      && Math.abs(_c.z - planeZ) <= EPSILON) continue;
    const intersections = [
      ...edgePlaneIntersections(_a, _b, planeZ),
      ...edgePlaneIntersections(_b, _c, planeZ),
      ...edgePlaneIntersections(_c, _a, planeZ),
    ];
    const unique = [];
    for (const point of intersections) {
      if (!unique.some(([x, y]) => Math.hypot(point[0] - x, point[1] - y) <= EPSILON)) {
        unique.push(point);
      }
    }
    if (unique.length < 2) continue;
    let pair = [unique[0], unique[1]];
    let pairDistance = 0;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const distance = Math.hypot(unique[i][0] - unique[j][0], unique[i][1] - unique[j][1]);
        if (distance > pairDistance) {
          pair = [unique[i], unique[j]];
          pairDistance = distance;
        }
      }
    }
    if (pairDistance <= EPSILON) continue;
    if (pair.some(([x, y]) => Math.hypot(x, y) > maxRadiusM)) continue;
    segments.push(pair);
  }
}

function barrelLanes(meshes, gunWorldInverse) {
  const laneMeshes = new Map([['main', []]]);
  for (const mesh of meshes) {
    const numbered = mesh.name.match(NUMBERED_BARREL_NAME);
    const lane = numbered ? `barrel-${numbered[1]}` : 'main';
    if (!laneMeshes.has(lane)) laneMeshes.set(lane, []);
    laneMeshes.get(lane).push(mesh);
  }
  const lanes = [];
  for (const [name, meshesForLane] of laneMeshes) {
    if (!meshesForLane.length) continue;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const mesh of meshesForLane) {
      const position = mesh.geometry?.attributes?.position;
      if (!position) continue;
      _meshToGun.multiplyMatrices(gunWorldInverse, mesh.matrixWorld);
      for (let vertex = 0; vertex < position.count; vertex++) {
        _a.fromBufferAttribute(position, vertex).applyMatrix4(_meshToGun);
        minZ = Math.min(minZ, _a.z);
        maxZ = Math.max(maxZ, _a.z);
      }
    }
    if (Number.isFinite(minZ) && Number.isFinite(maxZ)) {
      lanes.push({
        name,
        meshes: meshesForLane,
        minZ,
        maxZ,
        allowOffset: name !== 'main',
      });
    }
  }
  return lanes;
}

function pointKey([x, y]) {
  return `${Math.round(x / NODE_EPSILON)},${Math.round(y / NODE_EPSILON)}`;
}

function sliceComponents(segments) {
  const nodes = new Map();
  const parent = new Map();
  const ensureNode = (point) => {
    const key = pointKey(point);
    if (!nodes.has(key)) {
      nodes.set(key, point);
      parent.set(key, key);
    }
    return key;
  };
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = key;
    while (parent.get(current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  for (const [a, b] of segments) union(ensureNode(a), ensureNode(b));
  const components = new Map();
  for (const [key, point] of nodes) {
    const root = find(key);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(point);
  }
  return [...components.values()];
}

function componentReceipt(points, planeZ) {
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

/**
 * Measures actual main-gun cross-sections in rig_gun local space. This sees
 * both baked vertex distortion and inherited scene transforms, unlike checks
 * that only inspect CylinderGeometry constructor parameters.
 */
export function measureTurretBarrelCircularity(visual, options = {}) {
  const {
    sampleFractions = DEFAULT_SAMPLE_FRACTIONS,
    maxAspectRatio = 1.08,
    maxRadiusM = 0.45,
    maxCenterOffsetM = 0.08,
    minimumSpanM = 0.025,
    requireMeasurement = false,
    meshNamePattern = BARREL_MESH_NAMES,
    fallbackMeshNamePattern = BATCHED_BARREL_MESH_NAMES,
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
  const samples = [];
  const samplePattern = (pattern, source) => {
    const meshes = [];
    gunRig.traverse((object) => {
      if (object.isMesh && object.visible !== false && pattern.test(object.name)) meshes.push(object);
    });
    for (const lane of barrelLanes(meshes, _gunWorldInverse)) {
      const startZ = Math.max(0, lane.minZ);
      const endZ = Math.min(muzzleZ, lane.maxZ);
      if (endZ - startZ <= minimumSpanM) continue;
      for (const fraction of sampleFractions) {
        const zM = startZ + (endZ - startZ) * fraction;
        const segments = [];
        for (const mesh of lane.meshes) {
          appendGeometrySlice(segments, mesh, _gunWorldInverse, zM, maxRadiusM);
        }
        for (const component of sliceComponents(segments)) {
          const receipt = componentReceipt(component, zM);
          if (!receipt) continue;
          if (receipt.widthM < minimumSpanM || receipt.heightM < minimumSpanM) continue;
          if (!lane.allowOffset
            && Math.hypot(receipt.centerXM, receipt.centerYM) > maxCenterOffsetM) continue;
          receipt.fraction = fraction;
          receipt.lane = lane.name;
          receipt.source = source;
          receipt.pass = receipt.aspectRatio <= maxAspectRatio + EPSILON;
          samples.push(receipt);
        }
      }
    }
  };
  samplePattern(meshNamePattern, 'barrel');
  // A few legacy builders merge their tube into gunMount. Only fall back to
  // that batched mesh when no dedicated gun contour exists; otherwise an
  // intentionally non-circular mantlet tunnel could be mistaken for a tube.
  if (!samples.length && fallbackMeshNamePattern) {
    samplePattern(fallbackMeshNamePattern, 'gunMount-fallback');
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
  const worst = samples.reduce((current, sample) => (
    !current || sample.aspectRatio > current.aspectRatio ? sample : current
  ), null);
  return {
    pass: samples.every((sample) => sample.pass),
    muzzleZ,
    maxAspectRatio,
    worst,
    samples,
  };
}
