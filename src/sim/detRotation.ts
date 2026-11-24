/**
 * three.js's rotation constructors on detMath (276, sim-det-trig). Quaternion.setFromEuler, Vector3.applyAxisAngle,
 * Matrix4.makeRotationY and their kin call Math.sin and Math.cos inside three, and an engine's own Math is not one
 * function (src/sim/detMath.ts): Node on arm64 and Chromium return different last bits, and a battle's chaos turned that
 * into drift by step 600-1800 when a page recording was verified in Node (the replay lane, 2026-11-22). Each function
 * here is the three r185 method line for line, in the same operation order, with detMath's sin and cos in place of the
 * native ones, so it is bit-identical to three wherever native Math agrees with detMath (src/sim/detRotation.selftest.mjs).
 * The simulation calls these instead of the methods (tools/det-math-lint.mjs flags the methods by name); rendering keeps
 * three's own.
 */
import { Quaternion } from 'three';
import type { Euler, Matrix4, Vector3 } from 'three';
import * as detMath from './detMath.ts';

const _quaternion = new Quaternion();

/** Quaternion.setFromEuler(euler): `target` from Euler angles in the Euler's order. */
export function quaternionFromEuler(target: Quaternion, euler: Euler): Quaternion {
  const x = euler.x, y = euler.y, z = euler.z, order = euler.order;
  const c1 = detMath.cos(x / 2);
  const c2 = detMath.cos(y / 2);
  const c3 = detMath.cos(z / 2);
  const s1 = detMath.sin(x / 2);
  const s2 = detMath.sin(y / 2);
  const s3 = detMath.sin(z / 2);
  switch (order) {
    case 'XYZ': return target.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
    case 'YXZ': return target.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
    case 'ZXY': return target.set(s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
    case 'ZYX': return target.set(s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
    case 'YZX': return target.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
    case 'XZY': return target.set(s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
    default: throw new Error(`detRotation: unknown Euler order ${order}`);
  }
}

/** Quaternion.setFromAxisAngle(axis, angle): `axis` is unit length. */
export function quaternionFromAxisAngle(target: Quaternion, axis: Vector3, angle: number): Quaternion {
  const halfAngle = angle / 2, s = detMath.sin(halfAngle);
  return target.set(axis.x * s, axis.y * s, axis.z * s, detMath.cos(halfAngle));
}

/** Vector3.applyAxisAngle(axis, angle): rotates `v` in place and returns it. */
export function applyAxisAngle(v: Vector3, axis: Vector3, angle: number): Vector3 {
  return v.applyQuaternion(quaternionFromAxisAngle(_quaternion, axis, angle));
}

/** Vector3.applyEuler(euler): rotates `v` in place and returns it. */
export function applyEuler(v: Vector3, euler: Euler): Vector3 {
  return v.applyQuaternion(quaternionFromEuler(_quaternion, euler));
}

/** Matrix4.makeRotationX(theta). */
export function matrixRotationX(target: Matrix4, theta: number): Matrix4 {
  const c = detMath.cos(theta), s = detMath.sin(theta);
  return target.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
}

/** Matrix4.makeRotationY(theta). */
export function matrixRotationY(target: Matrix4, theta: number): Matrix4 {
  const c = detMath.cos(theta), s = detMath.sin(theta);
  return target.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
}

/** Matrix4.makeRotationZ(theta). */
export function matrixRotationZ(target: Matrix4, theta: number): Matrix4 {
  const c = detMath.cos(theta), s = detMath.sin(theta);
  return target.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** Matrix4.makeRotationFromEuler(euler): the rotation, with the rest of the matrix the identity. */
export function matrixRotationFromEuler(target: Matrix4, euler: Euler): Matrix4 {
  const te = target.elements;
  const x = euler.x, y = euler.y, z = euler.z;
  const a = detMath.cos(x), b = detMath.sin(x);
  const c = detMath.cos(y), d = detMath.sin(y);
  const e = detMath.cos(z), f = detMath.sin(z);
  if (euler.order === 'XYZ') {
    const ae = a * e, af = a * f, be = b * e, bf = b * f;
    te[0] = c * e; te[4] = - c * f; te[8] = d;
    te[1] = af + be * d; te[5] = ae - bf * d; te[9] = - b * c;
    te[2] = bf - ae * d; te[6] = be + af * d; te[10] = a * c;
  } else if (euler.order === 'YXZ') {
    const ce = c * e, cf = c * f, de = d * e, df = d * f;
    te[0] = ce + df * b; te[4] = de * b - cf; te[8] = a * d;
    te[1] = a * f; te[5] = a * e; te[9] = - b;
    te[2] = cf * b - de; te[6] = df + ce * b; te[10] = a * c;
  } else if (euler.order === 'ZXY') {
    const ce = c * e, cf = c * f, de = d * e, df = d * f;
    te[0] = ce - df * b; te[4] = - a * f; te[8] = de + cf * b;
    te[1] = cf + de * b; te[5] = a * e; te[9] = df - ce * b;
    te[2] = - a * d; te[6] = b; te[10] = a * c;
  } else if (euler.order === 'ZYX') {
    const ae = a * e, af = a * f, be = b * e, bf = b * f;
    te[0] = c * e; te[4] = be * d - af; te[8] = ae * d + bf;
    te[1] = c * f; te[5] = bf * d + ae; te[9] = af * d - be;
    te[2] = - d; te[6] = b * c; te[10] = a * c;
  } else if (euler.order === 'YZX') {
    const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
    te[0] = c * e; te[4] = bd - ac * f; te[8] = bc * f + ad;
    te[1] = f; te[5] = a * e; te[9] = - b * e;
    te[2] = - d * e; te[6] = ad * f + bc; te[10] = ac - bd * f;
  } else if (euler.order === 'XZY') {
    const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
    te[0] = c * e; te[4] = - f; te[8] = d * e;
    te[1] = ac * f + bd; te[5] = a * e; te[9] = ad * f - bc;
    te[2] = bc * f - ad; te[6] = b * e; te[10] = bd * f + ac;
  } else throw new Error(`detRotation: unknown Euler order ${euler.order}`);
  te[3] = 0; te[7] = 0; te[11] = 0;
  te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1;
  return target;
}

/** Vector3.setFromSphericalCoords(radius, phi, theta): phi from +y, theta about +y from +z. */
export function vectorFromSphericalCoords(target: Vector3, radius: number, phi: number, theta: number): Vector3 {
  const sinPhiRadius = detMath.sin(phi) * radius;
  return target.set(sinPhiRadius * detMath.sin(theta), detMath.cos(phi) * radius, sinPhiRadius * detMath.cos(theta));
}
