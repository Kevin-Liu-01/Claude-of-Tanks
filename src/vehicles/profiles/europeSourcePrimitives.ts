// Shape vocabulary only. Vehicle measurements and silhouettes belong to their
// individual source-study profiles; no complete donor vehicle is assembled here.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { mirrorX } from '../runningGearPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type ArmorStation = readonly [z: number, bellyHalf: number, shoulderHalf: number,
  roofHalf: number, floorY: number, shoulderY: number, roofY: number];

export function armorLoft(rows: readonly ArmorStation[], originY = 0, originZ = 0): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, belly, shoulder, roofHalf, floor, knee, roof]) => ({
    z: z - originZ,
    ring: [[-belly, floor - originY], [belly, floor - originY],
      [shoulder, knee - originY], [roofHalf, roof - originY],
      [-roofHalf, roof - originY], [-shoulder, knee - originY]],
  })));
}

export function turretEquipment(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, geometry, x - P.turretG.position.x,
    y - P.turretG.position.y, z - P.turretG.position.z, rx, ry, rz);
}

/** Open tube, physical mouth annulus and recessed termination. */
export function openTube(P: TankBuilderPort, radius: number, start: number, end: number, boreRadius = radius * .74): void {
  const n = P.q ? 28 : 14;
  const outer = new THREE.CylinderGeometry(radius, radius, end - start, n, 1, true);
  outer.rotateX(Math.PI / 2);
  P.add('gun', outer, 0, 0, (end + start) / 2);
  const inner = new THREE.CylinderGeometry(boreRadius, boreRadius, .20, n, 1, true);
  inner.rotateX(Math.PI / 2);
  // The bore wall is viewed from inside: reverse its actual winding, not the material.
  const index = inner.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a);
  }
  inner.computeVertexNormals();
  P.add('gunDark', inner, 0, 0, end - .10);
  P.add('gun', new THREE.RingGeometry(boreRadius, radius, n), 0, 0, end);
  P.add('gunDark', new THREE.CircleGeometry(boreRadius, n), 0, 0, end - .20);
  P.muzzleZ = end;
  P.physicalMuzzleBore = { outerRadiusM: radius, innerRadiusM: boreRadius, depthM: .20 };
}

export function optic(P: TankBuilderPort, x: number, y: number, z: number,
  width: number, height: number, depth: number): void {
  const put = (bucket: string, g: THREE.BufferGeometry, dx: number, dy: number, dz: number) =>
    turretEquipment(P, bucket, g, x + dx, y + dy, z + dz);
  const wall = .035;
  for (const side of [-1, 1]) put('turretDetail', KIT.box(wall, height, depth), side * (width - wall) / 2, 0, 0);
  for (const side of [-1, 1]) put('turretDetail', KIT.box(width, wall, depth), 0, side * (height - wall) / 2, 0);
  put('turretDetail', KIT.box(width, height, wall), 0, 0, -depth / 2);
  put('turretGlass', KIT.box(width - .07, height - .07, .02), 0, 0, depth / 2 - .055);
}

export function smokeBank(P: TankBuilderPort, side: number, x: number, y: number,
  z: number, count: number): void {
  turretEquipment(P, 'turretDetail', KIT.box(.14, .16, count * .12 + .08), side * x, y, z);
  for (let i = 0; i < count; i++) {
    turretEquipment(P, 'turretDetail', KIT.cylZ(.05, .24, P.q ? 14 : 8),
      side * (x + .04), y + .08, z + (i - (count - 1) / 2) * .12, -.6, side * .55);
    turretEquipment(P, 'turretDark', KIT.cylZ(.037, .018, P.q ? 14 : 8),
      side * (x + .095), y + .15, z + (i - (count - 1) / 2) * .12 + .09, -.6, side * .55);
  }
}

export function antenna(P: TankBuilderPort, x: number, bottom: number, top: number, z: number): void {
  turretEquipment(P, 'turretDetail', KIT.cylY(.038, .055, .11, P.q ? 14 : 8), x, bottom + .055, z);
  turretEquipment(P, 'turretDark', KIT.cylY(.009, .017, top - bottom - .10, P.q ? 10 : 6),
    x, (top + bottom + .10) / 2, z);
}

export function deckGrille(P: TankBuilderPort, x: number, y: number, z: number,
  width: number, length: number): void {
  P.addEquipment('hullDark', KIT.box(width, .022, length), x, y, z);
  const count = P.q ? 13 : 6;
  for (let i = 0; i < count; i++) {
    P.addEquipment('hullDetail', KIT.box(width, .012, .018), x, y + .019,
      z - length * .46 + i * length * .92 / (count - 1));
  }
}

// mirrorX lives with the leaf running-gear primitives (2026-09-22 wheel audit) so wheel stock modules
// stay importable by the running-gear builder; the source-study profiles keep importing it from here.
export { mirrorX };

/** A real closed side sheet follows the hull's fore/aft roof and lower return. */
export function sideWall(P: TankBuilderPort, side: number, innerX: number, outerX: number,
  stations: readonly (readonly [z: number, bottomY: number, topY: number])[]): void {
  const geometry = sectionSolid(stations.map(([z, bottom, top]) => ({z,
    ring: [[innerX,bottom],[outerX,bottom],[outerX,top],[innerX,top]],
  })));
  P.addExternalArmor('hull', side < 0 ? mirrorX(geometry) : geometry);
}

/** Narrow lower chassis, vertical wheel-bay wall, and horizontal sponson return. */
export function chassisLoft(rows: readonly ArmorStation[], innerWallHalf: number): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, belly, shoulder, roofHalf, floor, knee, roof]) => ({ z,
    ring: [[-belly,floor],[belly,floor],[innerWallHalf,Math.min(floor+.17,knee-.025)],
      [innerWallHalf,knee],[shoulder,knee],[roofHalf,roof],[-roofHalf,roof],
      [-shoulder,knee],[-innerWallHalf,knee],[-innerWallHalf,Math.min(floor+.17,knee-.025)]],
  })));
}
