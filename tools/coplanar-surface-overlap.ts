import * as THREE from 'three';

type Axis = 0 | 1 | 2;
type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];

interface AuditSettings {
  readonly planeEpsilonM: number;
  readonly normalEpsilon: number;
  readonly areaEpsilonM2: number;
  readonly includeSameObject: boolean;
}

interface ProjectedTriangle {
  readonly projected: Vec2Tuple[];
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
}

interface SurfaceDescription {
  readonly object: string;
  readonly path: string;
  readonly material: string;
  readonly materialIndex: number;
  readonly depthLayer: number | null;
}

interface SurfaceTriangle extends ProjectedTriangle {
  readonly objectId: number;
  readonly surfaceId: string;
  readonly object: string;
  readonly path: string;
  readonly material: string;
  readonly materialIndex: number;
  readonly depthLayer: number | null;
  readonly depthKey: string;
  readonly normal: Vec3Tuple;
  readonly planeNormal: Vec3Tuple;
  readonly planeDistance: number;
  readonly objectRef: THREE.Mesh;
  readonly points: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple];
  readonly areaM2: number;
  readonly droppedAxis: Axis;
}

interface FindingSample {
  readonly point: Vec3Tuple;
  readonly normal: Vec3Tuple;
}

interface InternalFinding {
  readonly plane: string;
  readonly surfaces: SurfaceDescription[];
  areaM2: number;
  trianglePairs: number;
  readonly sampleTriangle: (readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple])[];
  readonly _objectRefs: THREE.Mesh[];
  readonly _samples: FindingSample[];
  readonly depthMitigated: boolean;
  exteriorSample?: Vec3Tuple | null;
}

export type CoplanarFinding = Omit<InternalFinding, '_objectRefs' | '_samples'>;

export interface CoplanarAuditResult {
  readonly settings: AuditSettings;
  readonly stats: {
    readonly objects: number;
    readonly triangles: number;
    readonly planeGroups: number;
    readonly candidatePairs: number;
    readonly findings: number;
    readonly rawFindings: number;
    readonly exteriorFindings: number;
    readonly occludedFindings: number;
    readonly depthMitigatedFindings: number;
    readonly depthMitigatedAreaM2: number;
    readonly visibilityRaycasts: number;
    readonly overlapAreaM2: number;
    readonly skipped: { instancedMeshes: number; batchedMeshes: number; mitigatedMaterials: number };
  };
  readonly findings: CoplanarFinding[];
  readonly mitigatedFindings: CoplanarFinding[];
}

const DEFAULTS = Object.freeze({
  planeEpsilonM: 1e-5,
  normalEpsilon: 1e-5,
  areaEpsilonM2: 1e-6,
  includeSameObject: false,
});

function objectPath(object: THREE.Object3D, root: THREE.Object3D): string {
  const names: string[] = [];
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    names.push(node.name || node.type || 'Object3D');
    if (node === root) break;
  }
  return names.reverse().join('/');
}

function effectivelyVisible(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}

function materialAt(object: THREE.Mesh, materialIndex: number): THREE.Material | undefined {
  return Array.isArray(object.material)
    ? object.material[materialIndex] || object.material[0]
    : object.material;
}

function materialIndexAt(geometry: THREE.BufferGeometry, offset: number): number {
  if (!geometry.groups?.length) return 0;
  for (const group of geometry.groups) {
    if (offset >= group.start && offset < group.start + group.count) {
      return group.materialIndex || 0;
    }
  }
  return 0;
}

function materialIsRasterRelevant(
  material: THREE.Material | undefined,
): material is THREE.Material {
  return !!material && material.visible !== false && material.colorWrite !== false
    && (material.opacity ?? 1) > 0;
}

function canonicalPlane(
  normal: THREE.Vector3,
  point: THREE.Vector3,
  planeEpsilonM: number,
  normalEpsilon: number,
): { readonly normal: Vec3Tuple; readonly distance: number; readonly key: string } {
  let sign = 1;
  if (Math.abs(normal.x) > normalEpsilon) sign = normal.x < 0 ? -1 : 1;
  else if (Math.abs(normal.y) > normalEpsilon) sign = normal.y < 0 ? -1 : 1;
  else sign = normal.z < 0 ? -1 : 1;
  const nx = normal.x * sign;
  const ny = normal.y * sign;
  const nz = normal.z * sign;
  const distance = -(nx * point.x + ny * point.y + nz * point.z);
  const q = (value: number, epsilon: number): number => Math.round(value / epsilon);
  return {
    normal: [nx, ny, nz] as const,
    distance,
    key: `${q(nx, normalEpsilon)},${q(ny, normalEpsilon)},${q(nz, normalEpsilon)},${q(distance, planeEpsilonM)}`,
  };
}

function projectionAxis(normal: Vec3Tuple): Axis {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}

function project(point: Vec3Tuple, droppedAxis: Axis): Vec2Tuple {
  if (droppedAxis === 0) return [point[1], point[2]];
  if (droppedAxis === 1) return [point[0], point[2]];
  return [point[0], point[1]];
}

function signedArea2D(points: readonly Vec2Tuple[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea * 0.5;
}

function lineIntersection(
  a: Vec2Tuple,
  b: Vec2Tuple,
  c: Vec2Tuple,
  d: Vec2Tuple,
  epsilon: number,
): Vec2Tuple {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const denominator = abx * cdy - aby * cdx;
  if (Math.abs(denominator) <= epsilon) return b;
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const t = (acx * cdy - acy * cdx) / denominator;
  return [a[0] + abx * t, a[1] + aby * t];
}

export function triangleIntersectionPolygon2D(
  lhs: readonly Vec2Tuple[],
  rhs: readonly Vec2Tuple[],
  epsilon = 1e-10,
): Vec2Tuple[] {
  let clip = rhs;
  if (signedArea2D(clip) < 0) clip = [rhs[0], rhs[2], rhs[1]];
  let polygon = lhs.slice();
  for (let edge = 0; edge < clip.length && polygon.length; edge += 1) {
    const c = clip[edge];
    const d = clip[(edge + 1) % clip.length];
    const inside = (point: Vec2Tuple): boolean => (d[0] - c[0]) * (point[1] - c[1])
      - (d[1] - c[1]) * (point[0] - c[0]) >= -epsilon;
    const input = polygon;
    polygon = [];
    let previous = input[input.length - 1];
    let previousInside = inside(previous);
    for (const current of input) {
      const currentInside = inside(current);
      if (currentInside !== previousInside) {
        polygon.push(lineIntersection(previous, current, c, d, epsilon));
      }
      if (currentInside) polygon.push(current);
      previous = current;
      previousInside = currentInside;
    }
  }
  return polygon.length >= 3 ? polygon : [];
}

export function triangleIntersectionArea2D(
  lhs: readonly Vec2Tuple[],
  rhs: readonly Vec2Tuple[],
  epsilon = 1e-10,
): number {
  const polygon = triangleIntersectionPolygon2D(lhs, rhs, epsilon);
  return polygon.length ? Math.abs(signedArea2D(polygon)) : 0;
}

function projectedTriangle(points: readonly Vec3Tuple[], droppedAxis: Axis): ProjectedTriangle {
  const projected = points.map((point) => project(point, droppedAxis));
  const us = projected.map((point) => point[0]);
  const vs = projected.map((point) => point[1]);
  return {
    projected,
    minU: Math.min(...us),
    maxU: Math.max(...us),
    minV: Math.min(...vs),
    maxV: Math.max(...vs),
  };
}

function surfaceDescription(triangle: SurfaceTriangle): SurfaceDescription {
  return {
    object: triangle.object,
    path: triangle.path,
    material: triangle.material,
    materialIndex: triangle.materialIndex,
    depthLayer: triangle.depthLayer,
  };
}

function liftPoint(
  point: Vec2Tuple,
  droppedAxis: Axis,
  normal: Vec3Tuple,
  planeDistance: number,
): Vec3Tuple {
  const lifted: [number, number, number] = [0, 0, 0];
  if (droppedAxis === 0) {
    lifted[1] = point[0];
    lifted[2] = point[1];
  } else if (droppedAxis === 1) {
    lifted[0] = point[0];
    lifted[2] = point[1];
  } else {
    lifted[0] = point[0];
    lifted[1] = point[1];
  }
  let sum = planeDistance;
  for (let axis = 0; axis < 3; axis += 1) {
    if (axis !== droppedAxis) sum += normal[axis] * lifted[axis];
  }
  lifted[droppedAxis] = -sum / normal[droppedAxis];
  return lifted;
}

function exteriorSamples(
  root: THREE.Object3D,
  findings: InternalFinding[],
  rasterMeshes: THREE.Object3D[],
  toleranceM: number,
): number {
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  raycaster.far = 100;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  let raycasts = 0;
  for (const finding of findings) {
    finding.exteriorSample = null;
    for (const sample of finding._samples) {
      point.fromArray(sample.point);
      direction.fromArray(sample.normal).normalize();
      origin.copy(point).addScaledVector(direction, 20);
      direction.negate();
      raycaster.set(origin, direction);
      raycasts += 1;
      const hits = raycaster.intersectObjects(rasterMeshes, false);
      const first = hits.find((hit) => hit.distance > 1e-5);
      if (!first || !finding._objectRefs.some((object) => object === first.object)) continue;
      if (first.point.distanceTo(point) > toleranceM) continue;
      finding.exteriorSample = sample.point;
      break;
    }
  }
  return raycasts;
}

export function findCoplanarSurfaceOverlaps(
  root: THREE.Object3D,
  options: Partial<AuditSettings> = {},
): CoplanarAuditResult {
  const settings = { ...DEFAULTS, ...options };
  const groups = new Map<string, SurfaceTriangle[]>();
  const skipped = { instancedMeshes: 0, batchedMeshes: 0, mitigatedMaterials: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  let triangleCount = 0;
  let objectOrdinal = 0;
  const rasterMeshes: THREE.Mesh[] = [];

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !effectivelyVisible(object, root)) return;
    if (object instanceof THREE.InstancedMesh) {
      skipped.instancedMeshes += 1;
      return;
    }
    if (object instanceof THREE.BatchedMesh) {
      skipped.batchedMeshes += 1;
      return;
    }
    if (object.userData?.vehicleMarking || object.userData?.authoredShadowProxy) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.index;
    const fullCount = index?.count || position.count;
    const start = Math.max(0, geometry.drawRange?.start || 0);
    const requestedCount = geometry.drawRange?.count;
    const end = Number.isFinite(requestedCount)
      ? Math.min(fullCount, start + requestedCount)
      : fullCount;
    const objectId = objectOrdinal++;
    if ((Array.isArray(object.material) ? object.material : [object.material])
      .some(materialIsRasterRelevant)) rasterMeshes.push(object);
    const path = objectPath(object, root);
    const vertexIndex = (offset: number): number => index ? index.getX(offset) : offset;

    for (let offset = start; offset + 2 < end; offset += 3) {
      const materialIndex = materialIndexAt(geometry, offset);
      const material = materialAt(object, materialIndex);
      if (!materialIsRasterRelevant(material)) {
        skipped.mitigatedMaterials += 1;
        continue;
      }
      a.fromBufferAttribute(position, vertexIndex(offset)).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, vertexIndex(offset + 1)).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, vertexIndex(offset + 2)).applyMatrix4(object.matrixWorld);
      edgeA.subVectors(b, a);
      edgeB.subVectors(c, a);
      faceNormal.crossVectors(edgeA, edgeB);
      const twiceArea = faceNormal.length();
      if (twiceArea <= settings.areaEpsilonM2 * 2) continue;
      faceNormal.multiplyScalar(1 / twiceArea);
      const plane = canonicalPlane(faceNormal, a, settings.planeEpsilonM, settings.normalEpsilon);
      const points: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple] = [
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
      ];
      const droppedAxis = projectionAxis(plane.normal);
      const projected = projectedTriangle(points, droppedAxis);
      const entry: SurfaceTriangle = {
        objectId,
        surfaceId: `${objectId}:${materialIndex}`,
        object: object.name || '(unnamed)',
        path,
        material: material.name || material.type || '(unnamed)',
        materialIndex,
        depthLayer: object.userData?.coplanarDepthLayer ?? null,
        depthKey: Number.isFinite(object.userData?.coplanarDepthLayer)
          ? `object:${object.userData.coplanarDepthLayer}`
          : material.polygonOffset
            ? `material:${material.polygonOffsetFactor || 0}:${material.polygonOffsetUnits || 0}`
            : 'base:0',
        normal: [faceNormal.x, faceNormal.y, faceNormal.z],
        planeNormal: plane.normal,
        planeDistance: plane.distance,
        objectRef: object,
        points,
        areaM2: twiceArea * 0.5,
        droppedAxis,
        ...projected,
      };
      const bucket = groups.get(plane.key) || [];
      bucket.push(entry);
      groups.set(plane.key, bucket);
      triangleCount += 1;
    }
  });

  const overlaps = new Map<string, InternalFinding>();
  let candidatePairs = 0;
  for (const [planeKey, triangles] of groups) {
    if (triangles.length < 2) continue;
    triangles.sort((lhs, rhs) => lhs.minU - rhs.minU);
    const active = [];
    for (const current of triangles) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].maxU < current.minU - settings.planeEpsilonM) active.splice(index, 1);
      }
      for (const other of active) {
        if (!settings.includeSameObject && other.objectId === current.objectId) continue;
        if (other.surfaceId === current.surfaceId) continue;
        if (other.maxV < current.minV - settings.planeEpsilonM
          || current.maxV < other.minV - settings.planeEpsilonM) continue;
        const facingDot = other.normal[0] * current.normal[0]
          + other.normal[1] * current.normal[1]
          + other.normal[2] * current.normal[2];
        if (facingDot < 1 - settings.normalEpsilon * 4) continue;
        candidatePairs += 1;
        const intersectionPolygon = triangleIntersectionPolygon2D(
          other.projected, current.projected, settings.planeEpsilonM * 0.01);
        const projectedArea = intersectionPolygon.length
          ? Math.abs(signedArea2D(intersectionPolygon)) : 0;
        if (projectedArea <= settings.areaEpsilonM2) continue;
        const normalScale = Math.max(
          Math.abs(current.normal[current.droppedAxis]),
          settings.normalEpsilon,
        );
        const areaM2 = projectedArea / normalScale;
        if (areaM2 <= settings.areaEpsilonM2) continue;
        const ordered = other.surfaceId < current.surfaceId ? [other, current] : [current, other];
        const pairKey = `${ordered[0].surfaceId}|${ordered[1].surfaceId}|${planeKey}`;
        const finding = overlaps.get(pairKey) || {
          plane: planeKey,
          surfaces: ordered.map(surfaceDescription),
          areaM2: 0,
          trianglePairs: 0,
          sampleTriangle: ordered.map((triangle) => triangle.points),
          _objectRefs: ordered.map((triangle) => triangle.objectRef),
          _samples: [],
          depthMitigated: ordered[0].depthKey !== ordered[1].depthKey,
        };
        finding.areaM2 += areaM2;
        finding.trianglePairs += 1;
        if (finding._samples.length < 32) {
          let sumU = 0;
          let sumV = 0;
          for (const point of intersectionPolygon) {
            sumU += point[0];
            sumV += point[1];
          }
          const centroid: Vec2Tuple = [
            sumU / intersectionPolygon.length,
            sumV / intersectionPolygon.length,
          ];
          finding._samples.push({
            point: liftPoint(centroid, current.droppedAxis,
              current.planeNormal, current.planeDistance),
            normal: current.normal,
          });
        }
        overlaps.set(pairKey, finding);
      }
      active.push(current);
    }
  }

  const rawFindings = [...overlaps.values()]
    .map((finding) => ({ ...finding, areaM2: Number(finding.areaM2.toFixed(9)) }))
    .filter((finding) => finding.areaM2 > settings.areaEpsilonM2)
    .sort((lhs, rhs) => rhs.areaM2 - lhs.areaM2);
  const raycasts = exteriorSamples(root, rawFindings, rasterMeshes,
    Math.max(settings.planeEpsilonM * 8, 1e-4));
  const visibleFindings = rawFindings.filter((finding) => finding.exteriorSample);
  const cleanFinding = (
    { _objectRefs: _discardedRefs, _samples: _discardedSamples, ...finding }: InternalFinding,
  ): CoplanarFinding => finding;
  const findings = visibleFindings.filter((finding) => !finding.depthMitigated)
    .map(cleanFinding);
  const mitigatedFindings = visibleFindings.filter((finding) => finding.depthMitigated)
    .map(cleanFinding);
  return {
    settings,
    stats: {
      objects: objectOrdinal,
      triangles: triangleCount,
      planeGroups: groups.size,
      candidatePairs,
      findings: findings.length,
      rawFindings: rawFindings.length,
      exteriorFindings: visibleFindings.length,
      occludedFindings: rawFindings.length - visibleFindings.length,
      depthMitigatedFindings: mitigatedFindings.length,
      depthMitigatedAreaM2: Number(mitigatedFindings
        .reduce((sum, finding) => sum + finding.areaM2, 0).toFixed(9)),
      visibilityRaycasts: raycasts,
      overlapAreaM2: Number(findings.reduce((sum, finding) => sum + finding.areaM2, 0).toFixed(9)),
      skipped,
    },
    findings,
    mitigatedFindings,
  };
}
