// ERA surface frames: per-plate authored basis, PCA fit of the seated part
// cloud and the fitted-surface collection consumed by the factory core's ERA
// binding. Split out of tankFactoryCore.ts in round 46 (docs/CLEANUP-2026-09-22.md §4.4);
// eraWholeFitReuse.selftest keeps this algorithm byte-exact against its upstream.
import * as THREE from 'three';
import { authoredEraSurfaces } from './eraAuthoredFaces.ts';
import type { ArmorPlate } from './specHelpers.ts';

export type EraSurface = number[][];

interface EraSurfaceFrame {
  authoredU: THREE.Vector3;
  authoredNormal: THREE.Vector3;
}

interface EraSurfaceCollection {
  surfaces: EraSurface[];
  exactSurfaces: EraSurface[];
  allPoints: THREE.Vector3[];
}

export function createEraSurfaceFrame(plate: ArmorPlate): EraSurfaceFrame | null {
  const origin = new THREE.Vector3().fromArray(plate.verts[0]);
  const authoredU = new THREE.Vector3().fromArray(plate.verts[1]).sub(origin).normalize();
  const authoredV = new THREE.Vector3().fromArray(plate.verts[plate.verts.length - 1]).sub(origin);
  const authoredNormal = new THREE.Vector3().crossVectors(authoredU, authoredV).normalize();
  if (authoredU.lengthSq() < 0.99 || authoredNormal.lengthSq() < 0.99) return null;
  return { authoredU, authoredNormal };
}

function pointCloudCovariance(
  points: readonly THREE.Vector3[],
  centroid: THREE.Vector3,
): number[][] {
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const value of points) {
    const dx = value.x - centroid.x;
    const dy = value.y - centroid.y;
    const dz = value.z - centroid.z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  return [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
}

function selectJacobiAxes(covariance: number[][]): [number, number] {
  let row = 0;
  let column = 1;
  if (Math.abs(covariance[0][2]) > Math.abs(covariance[row][column])) {
    [row, column] = [0, 2];
  }
  if (Math.abs(covariance[1][2]) > Math.abs(covariance[row][column])) {
    [row, column] = [1, 2];
  }
  return [row, column];
}

function rotateJacobiBasis(
  covariance: number[][],
  eigenvectors: number[][],
  row: number,
  column: number,
): void {
  const angle = 0.5 * Math.atan2(
    2 * covariance[row][column], covariance[column][column] - covariance[row][row],
  );
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const app = covariance[row][row];
  const aqq = covariance[column][column];
  const apq = covariance[row][column];
  covariance[row][row] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
  covariance[column][column] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
  covariance[row][column] = 0;
  covariance[column][row] = 0;

  for (let index = 0; index < 3; index++) {
    if (index === row || index === column) continue;
    const akp = covariance[index][row];
    const akq = covariance[index][column];
    covariance[index][row] = cosine * akp - sine * akq;
    covariance[row][index] = covariance[index][row];
    covariance[index][column] = sine * akp + cosine * akq;
    covariance[column][index] = covariance[index][column];
  }
  for (let index = 0; index < 3; index++) {
    const vrp = eigenvectors[index][row];
    const vrq = eigenvectors[index][column];
    eigenvectors[index][row] = cosine * vrp - sine * vrq;
    eigenvectors[index][column] = sine * vrp + cosine * vrq;
  }
}

function diagonalizePointCloud(covariance: number[][], eigenvectors: number[][]): void {
  for (let iteration = 0; iteration < 18; iteration++) {
    const [row, column] = selectJacobiAxes(covariance);
    if (Math.abs(covariance[row][column]) < 1e-10) break;
    rotateJacobiBasis(covariance, eigenvectors, row, column);
  }
}

function extremeEigenAxis(eigenvalues: readonly number[], findMinimum: boolean): number {
  let selected = 0;
  for (let index = 1; index < eigenvalues.length; index++) {
    const replacesSelected = findMinimum
      ? eigenvalues[index] < eigenvalues[selected]
      : eigenvalues[index] > eigenvalues[selected];
    if (replacesSelected) selected = index;
  }
  return selected;
}

function orientEraSurfaceNormal(
  normal: THREE.Vector3,
  centroid: THREE.Vector3,
  authoredNormal: THREE.Vector3,
): void {
  const seedAlignment = normal.dot(authoredNormal);
  if (Math.abs(seedAlignment) > 0.05) {
    if (seedAlignment < 0) normal.negate();
  } else if (normal.dot(centroid) < 0) {
    normal.negate();
  }
}

function createEraSurfaceBasis(
  eigenvectors: number[][],
  maximumAxis: number,
  normal: THREE.Vector3,
  authoredU: THREE.Vector3,
): [THREE.Vector3, THREE.Vector3] {
  const maximumVector = new THREE.Vector3(
    eigenvectors[0][maximumAxis], eigenvectors[1][maximumAxis], eigenvectors[2][maximumAxis],
  );
  const u = maximumVector.clone().addScaledVector(normal, -maximumVector.dot(normal)).normalize();
  if (u.lengthSq() < 0.99) {
    u.copy(authoredU).addScaledVector(normal, -authoredU.dot(normal)).normalize();
    if (u.lengthSq() < 0.99) {
      u.set(1, 0, 0).addScaledVector(normal, -normal.x).normalize();
    }
  }
  return [u, new THREE.Vector3().crossVectors(normal, u).normalize()];
}

export function fitEraPointCloud(
  points: THREE.Vector3[],
  frame: EraSurfaceFrame,
): EraSurface | null {
  if (points.length < 4) return null;
  const centroid = points.reduce((sum, value) => sum.add(value), new THREE.Vector3())
    .multiplyScalar(1 / points.length);
  const covariance = pointCloudCovariance(points, centroid);
  const eigenvectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  diagonalizePointCloud(covariance, eigenvectors);

  const eigenvalues = [covariance[0][0], covariance[1][1], covariance[2][2]];
  const minimumAxis = extremeEigenAxis(eigenvalues, true);
  const maximumAxis = extremeEigenAxis(eigenvalues, false);
  const normal = new THREE.Vector3(
    eigenvectors[0][minimumAxis], eigenvectors[1][minimumAxis], eigenvectors[2][minimumAxis],
  ).normalize();
  orientEraSurfaceNormal(normal, centroid, frame.authoredNormal);
  const [u, v] = createEraSurfaceBasis(eigenvectors, maximumAxis, normal, frame.authoredU);

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  let outwardN = -Infinity;
  for (const value of points) {
    const projectedU = value.dot(u);
    const projectedV = value.dot(v);
    const projectedNormal = value.dot(normal);
    uMin = Math.min(uMin, projectedU);
    uMax = Math.max(uMax, projectedU);
    vMin = Math.min(vMin, projectedV);
    vMax = Math.max(vMax, projectedV);
    outwardN = Math.max(outwardN, projectedNormal);
  }
  if (![uMin, uMax, vMin, vMax, outwardN].every(Number.isFinite)
      || uMax - uMin < 0.02 || vMax - vMin < 0.02) return null;
  const pointAt = (projectedU: number, projectedV: number): number[] => new THREE.Vector3()
    .addScaledVector(u, projectedU)
    .addScaledVector(v, projectedV)
    .addScaledVector(normal, outwardN)
    .toArray();
  return [pointAt(uMin, vMin), pointAt(uMax, vMin), pointAt(uMax, vMax), pointAt(uMin, vMax)];
}

export function collectEraSurfaces(
  parts: readonly THREE.BufferGeometry[],
  sideSuffix: number,
  frame: EraSurfaceFrame,
): EraSurfaceCollection {
  const point = new THREE.Vector3();
  const surfaces: EraSurface[] = [];
  const exactSurfaces: EraSurface[] = [];
  const allPoints: THREE.Vector3[] = [];
  for (const part of parts) {
    const exact = authoredEraSurfaces(part);
    if (exact !== null) {
      // A physical cassette can straddle X=0 yet deplete as one owned module.
      // Preserve its real triangles; a plate-name suffix is not a cutting plane.
      exactSurfaces.push(...exact);
      continue;
    }
    const positions = part.getAttribute('position');
    if (!positions) continue;
    const partPoints: THREE.Vector3[] = [];
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index);
      if (sideSuffix > 0 && point.x < -1e-4) continue;
      if (sideSuffix < 0 && point.x > 1e-4) continue;
      const value = point.clone();
      partPoints.push(value);
      allPoints.push(value);
    }
    const surface = fitEraPointCloud(partPoints, frame);
    if (surface) surfaces.push(surface);
  }
  return { surfaces, exactSurfaces, allPoints };
}
