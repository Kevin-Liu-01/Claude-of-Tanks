// Exact centreline cap / mouth-edge profiles of a barrel's terminal geometry,
// read by the factory core's muzzle seating. Split out of tankFactoryCore.ts in
// round 46 (docs/CLEANUP-2026-09-22.md §4.4).
import * as THREE from 'three';
import { isVehicleMesh } from './vehicleMesh.ts';

export interface AxisGeometryCapProfile {
  z: number;
  outerRadiusM: number;
}

function axisPositionAttribute(
  geometry: THREE.BufferGeometry,
): THREE.BufferAttribute | null {
  const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
  if (!position || position.itemSize < 3
    || position instanceof THREE.InterleavedBufferAttribute) return null;
  return position;
}

function barycentricWeightsContainPoint(
  wa: number,
  wb: number,
  wc: number,
  epsilon: number,
): boolean {
  return wa >= -epsilon && wb >= -epsilon && wc >= -epsilon;
}

export function axisGeometryCapProfile(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  minZ: number,
  maxZ: number,
): AxisGeometryCapProfile | null {
  const position = axisPositionAttribute(geometry);
  if (!position) return null;
  const vertices = position.array;
  const stride = position.itemSize;
  const index = geometry.index && geometry.index.array;
  const triangleCount = Math.floor((index ? index.length : position.count) / 3);
  let bestZ = -Infinity;
  let bestRadius = 0;
  const eps = 1e-8;
  for (let t = 0; t < triangleCount; t++) {
    const ia = (index ? index[t * 3] : t * 3) * stride;
    const ib = (index ? index[t * 3 + 1] : t * 3 + 1) * stride;
    const ic = (index ? index[t * 3 + 2] : t * 3 + 2) * stride;
    const ax = vertices[ia], ay = vertices[ia + 1];
    const bx = vertices[ib], by = vertices[ib + 1];
    const cx = vertices[ic], cy = vertices[ic + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < eps) continue;
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
    const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
    const wc = 1 - wa - wb;
    if (!barycentricWeightsContainPoint(wa, wb, wc, eps)) continue;
    const z = wa * vertices[ia + 2] + wb * vertices[ib + 2] + wc * vertices[ic + 2];
    if (z < minZ || z > maxZ) continue;
    const outerRadiusM = Math.max(
      Math.hypot(ax - x, ay - y),
      Math.hypot(bx - x, by - y),
      Math.hypot(cx - x, cy - y),
    );
    if (z > bestZ + eps) {
      bestZ = z;
      bestRadius = outerRadiusM;
    } else if (Math.abs(z - bestZ) <= eps) {
      bestRadius = Math.max(bestRadius, outerRadiusM);
    }
  }
  return Number.isFinite(bestZ)
    ? { z: bestZ, outerRadiusM: bestRadius }
    : null;
}

export const MUZZLE_COUNTERBORE_MAX_M = 0.03;

export function axisGeometryMouthEdgeProfile(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  centerZ: number,
  caliberRadiusM: number,
): AxisGeometryCapProfile | null {
  const position = axisPositionAttribute(geometry);
  if (!position) return null;
  const minimumSupportR = Math.max(0.006, caliberRadiusM * 1.15);
  const maximumSupportR = Math.max(0.24, caliberRadiusM * 2.8);
  let outerRadiusM = Infinity;
  for (let index = 0; index < position.count; index++) {
    const z = position.getZ(index);
    if (Math.abs(z - centerZ) > 0.12) continue;
    const radius = Math.hypot(position.getX(index) - x, position.getY(index) - y);
    if (radius < minimumSupportR || radius > maximumSupportR) continue;
    outerRadiusM = Math.min(outerRadiusM, radius);
  }
  if (!Number.isFinite(outerRadiusM)) return null;
  const courseToleranceM = Math.max(0.004, outerRadiusM * 0.08);
  // The mouth face is the most forward vertex anywhere between the bore lip
  // and the outer course: chamfered or stepped muzzles (Challenger 1 X) end
  // their flat face inside the outer course, and the lining must seat on that
  // face rather than on the bevel's rear rim.
  const innerBandR = Math.max(0.005, caliberRadiusM * 0.98);
  let bestZ = -Infinity;
  for (let index = 0; index < position.count; index++) {
    const z = position.getZ(index);
    if (Math.abs(z - centerZ) > 0.12) continue;
    const radius = Math.hypot(position.getX(index) - x, position.getY(index) - y);
    if (radius >= innerBandR && radius <= outerRadiusM + courseToleranceM) bestZ = Math.max(bestZ, z);
  }
  return Number.isFinite(bestZ) ? { z: bestZ, outerRadiusM } : null;
}

export function objectRadialRadiusInFrame(
  object: THREE.Object3D,
  frame: THREE.Object3D,
  x: number,
  y: number,
): number | null {
  if (!isVehicleMesh(object)) return null;
  const position = object.geometry.getAttribute('position');
  if (!position || position.itemSize < 3) return null;
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert()
    .multiply(object.matrixWorld);
  const point = new THREE.Vector3();
  let radius = 0;
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index).applyMatrix4(toFrame);
    radius = Math.max(radius, Math.hypot(point.x - x, point.y - y));
  }
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}
