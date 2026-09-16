// Shared seating for the Abrams X field kits (the Ukrainian kit, the SEPv3 kit): the study's
// measured planes in the hull frame, the turret roof envelope, the inclined side walls, and the
// turret/hull seat + tag helpers. Everything a kit lays on the finished study is authored in the
// hull frame and re-seated into the turret frame where the turret owns it.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { XYZ } from './abramsSourceXGeometry.ts';
import { ABRAMS_SOURCE_X_FRAME } from '../abramsSourceXDatums.ts';

/** Outward unit normal and offset: a point p lies on the plane when n·p = d. */
export type Plane = readonly [number, number, number, number];
export type KitOwner = 'hull' | 'turret';

export const TURRET = ABRAMS_SOURCE_X_FRAME.turret;
/** The flat centre roof (buildTurretArmor `roof`). */
export const ROOF_Y = 2.360795;

// Measured source planes (hull frame) from buildTurretArmor / frontDeck.
export const RIGHT_SIDE: Plane = [.861624, .507547, 0, 2.159152];
export const LEFT_SIDE: Plane = [-.86164, .507521, 0, 2.276882];
export const RIGHT_CHEEK: Plane = [.510997, .499844, .699312, 2.674797];
export const LEFT_CHEEK: Plane = [-.363382, .515021, .776342, 2.888263];
// frontDeck(): y = 1.64504 - 0.12582 z on the upper glacis (z 1.72 .. 3.91).
export const GLACIS: Plane = [0, .99217, .12483, 1.63216];

/** Every upper-bounding plane of the turret solids; their lower envelope is the visible roof. */
const ROOF_PLANES: readonly Plane[] = [
  [0, 1, 0, ROOF_Y],
  [.08694, .996214, 0, 2.423304], [-.093856, .995073, .031953, 2.419014],
  [.064548, .991802, .11028, 2.382967], [-.063661, .991288, .115304, 2.397732],
  [0, .992939, .118622, 2.38873],
];

/** Height of the turret roof surface at (x, z) in the hull frame. */
export function turretRoofY(x: number, z: number): number {
  let y = Infinity;
  for (const [a, b, c, d] of ROOF_PLANES) y = Math.min(y, (d - a * x - c * z) / b);
  return y;
}

/** Signed x of the inclined turret side wall at height y (hull frame). */
export function turretSideX(side: -1 | 1, y: number): number {
  const plane = side > 0 ? RIGHT_SIDE : LEFT_SIDE;
  return (plane[3] - plane[1] * y) / plane[0];
}

/** Orthonormal frame on a plane: u horizontal along the plane, v up the plane, n outward. */
export function planeFrame(plane: Plane): { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 } {
  const n = new THREE.Vector3(plane[0], plane[1], plane[2]).normalize();
  const u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { u, v, n };
}

/** Solve the plane for the missing coordinate so an authored (y, z) / (x, y) / (x, z) point sits on it. */
export function onPlaneX(plane: Plane, y: number, z: number): XYZ {
  return [(plane[3] - plane[1] * y - plane[2] * z) / plane[0], y, z];
}
export function onPlaneZ(plane: Plane, x: number, y: number): XYZ {
  return [x, y, (plane[3] - plane[0] * x - plane[1] * y) / plane[2]];
}
export function onPlaneY(plane: Plane, x: number, z: number): XYZ {
  return [x, (plane[3] - plane[0] * x - plane[2] * z) / plane[1], z];
}

/** Hull-frame point re-seated into the owner's frame. */
export function seatKit(owner: KitOwner, p: XYZ): XYZ {
  return owner === 'turret' ? [p[0] - TURRET[0], p[1] - TURRET[1], p[2] - TURRET[2]] : p;
}

/** Add a kit part: `center` is in the hull frame; the geometry is tagged under `key` for receipts. */
export function putKit(P: TankBuilderPort, owner: KitOwner, bucket: string, key: string, part: string,
  geometry: THREE.BufferGeometry, center: XYZ, equipment = true): void {
  const c = seatKit(owner, center);
  geometry.userData[key] = part;
  if (equipment) P.addEquipment(bucket, geometry, c[0], c[1], c[2]);
  else P.add(bucket, geometry, c[0], c[1], c[2]);
}
