import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { antennaPart } from './antennaPart.ts';
// Shape vocabulary only. Vehicle measurements and silhouettes belong to their
// individual source-study profiles; no complete donor vehicle is assembled here.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionSolidOptions } from './sectionSolid.ts';
import { mirrorX } from '../runningGearPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type ArmorStation = readonly [z: number, bellyHalf: number, shoulderHalf: number,
  roofHalf: number, floorY: number, shoulderY: number, roofY: number];

export function armorLoft(rows: readonly ArmorStation[], originY = 0, originZ = 0,
  options: SectionSolidOptions = {}): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, belly, shoulder, roofHalf, floor, knee, roof]) => ({
    z: z - originZ,
    ring: [[-belly, floor - originY], [belly, floor - originY],
      [shoulder, knee - originY], [roofHalf, roof - originY],
      [-roofHalf, roof - originY], [-shoulder, knee - originY]],
  })), options);
}

export function turretEquipment(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, geometry, x - P.turretG.position.x,
    y - P.turretG.position.y, z - P.turretG.position.z, rx, ry, rz);
}

/** Open tube, physical mouth annulus and recessed termination.
 * `shadowedBore` (2026-10-17, CDX-62): the bore's wall and backstop are drawn as the carved bores' are (the hardware
 * dark wall, the shadow backstop) instead of in polished weapon steel. A small-calibre bore in a polished tube caught
 * the gallery light down its whole length (amx10p read 84 against the muzzle-bore probe's 80; kf41_lynx 41 inside a
 * dark brake), so the mouth did not read as a hole. */
export function openTube(P: TankBuilderPort, radius: number, start: number, end: number, boreRadius = radius * .74,
  { shadowedBore = false }: { shadowedBore?: boolean } = {}): void {
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
  const floor = new THREE.CircleGeometry(boreRadius, n);
  if (shadowedBore) {
    for (const [name, geometry, material, z] of [
      ['openTubeBoreWall', inner, P.mats.dark, end - .10],
      ['openTubeBoreBackstop', floor, P.mats.shadow, end - .20],
    ] as const) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(0, 0, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      // bore stock exactly as the carved bores' wall and backstop: barrel stock to the bore inventory, never a
      // small part on a wreck, never a carving surface (carvedMuzzleBore.ts, wrecks.ts, muzzle-bore-inventory.mjs)
      mesh.userData.carvedBoreStock = true;
      P.recoilG.add(mesh);
      P.disposables.push(geometry);
    }
    P.add('gun', new THREE.RingGeometry(boreRadius, radius, n), 0, 0, end);
  } else {
    // (the shipped order: wall, mouth annulus, backstop)
    P.add('gunDark', inner, 0, 0, end - .10);
    P.add('gun', new THREE.RingGeometry(boreRadius, radius, n), 0, 0, end);
    P.add('gunDark', floor, 0, 0, end - .20);
  }
  P.muzzleZ = end;
  P.physicalMuzzleBore = { outerRadiusM: radius, innerRadiusM: boreRadius, depthM: .20 };
}

/**
 * A turret sight head inside the box `width` x `height` x `depth` centred on (x, y, z), windows facing +Z.
 *
 * 2026-10-17 (227, VEH-01; the round-4 critics' "hollow optic() boxes"): it was four 35 mm walls and a back plate round
 * one dark pane that filled the whole front, so every importer's sight read as an empty square tube. It is now a solid
 * armoured head on a narrower slew plinth, under a roof plate, with a brow and cheeks shading a framed window: the day
 * and thermal panes side by side and the laser rangefinder's port below them. Same envelope as before.
 */
export function optic(P: TankBuilderPort, x: number, y: number, z: number,
  width: number, height: number, depth: number): void {
  const put = (bucket: string, g: THREE.BufferGeometry, dx: number, dy: number, dz: number) =>
    turretEquipment(P, bucket, g, x + dx, y + dy, z + dz);
  const w = width, h = height, d = depth;
  const plinthH = h * .16, headH = h * .80, roofH = h * .04;
  const face = -d / 2 + d * .88;                        // the head's front face (the brow and cheeks stand ahead of it)
  put('turretDetail', KIT.box(w * .84, plinthH, d * .84), 0, -h / 2 + plinthH / 2, -d * .08);            // slew plinth
  put('turretDetail', KIT.box(w, headH, d * .88), 0, -h / 2 + plinthH + headH / 2, -d * .06);             // armoured head
  put('turretDetail', KIT.box(w * .94, roofH, d * .86), 0, h / 2 - roofH / 2, -d * .07);                  // roof plate
  const hood = d / 2 - face;
  put('turretDetail', KIT.box(w, h * .05, hood), 0, h * .44, face + hood / 2);                             // brow
  const cheek = Math.min(.03, w * .12);
  for (const side of [-1, 1]) put('turretDetail', KIT.box(cheek, h * .42, hood), side * (w - cheek) / 2, h * .2, face + hood / 2);
  const winY = h * .2;
  put('turretDark', KIT.box(w - 2 * cheek - .01, h * .40, .014), 0, winY, face + .007);                    // window frame
  put('turretGlass', KIT.box(w * .40, h * .28, .012), -w * .18, winY, face + .016);                        // day pane
  put('turretGlass', KIT.box(w * .24, h * .28, .012), w * .22, winY, face + .016);                         // thermal pane
  const port = Math.min(w, h) * .07;
  put('turretDark', KIT.cylZ(port * 1.5, .01, P.q ? 16 : 10), w * .22, -h * .1, face + .005);              // rangefinder bezel
  put('turretGlass', KIT.cylZ(port, .012, P.q ? 16 : 10), w * .22, -h * .1, face + .011);                  // rangefinder port
}

/** The hollow sight box `optic` built before 2026-10-17, kept (240) for type89, borsuk and puma_s1 until their own lanes
 * adopt the solid head above. */
export function opticFrame(P: TankBuilderPort, x: number, y: number, z: number,
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
  // 2026-10-11 (fleet-weapons lane, round 4; waves 345-392's critics on the Sabra: the banks are "plain pale cream
  // cylinders with no dark bores, rails or mounts ... like rows of chalk sticks"): each discharger is a painted cup with a
  // 30 mm recessed mouth and its dark grenade face a millimetre off the recess floor, the cups seated in a dark cradle
  // rail on the bracket's top; the face was a disc floating a centimetre off the tube's axis.
  turretEquipment(P, 'turretDark', KIT.box(.10, .012, count * .12 + .06), side * (x + .02), y + .086, z);
  const n = P.q ? 14 : 8, length = .24, recess = .03;
  const aim = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-.6, side * .55, 0, 'XYZ'));
  for (let i = 0; i < count; i++) {
    const cz = z + (i - (count - 1) / 2) * .12;
    const cup = markSmokeTube(blindCup(.05, .039, length, recess, n)).applyMatrix4(aim);
    turretEquipment(P, 'turretDetail', cup, side * (x + .04), y + .08, cz);
    const face = KIT.cylZ(.038, .004, n).translate(0, 0, length / 2 - recess + .003).applyMatrix4(aim);
    turretEquipment(P, 'turretDark', face, side * (x + .04), y + .08, cz);
  }
}

/** A cup along +Z (centred): closed back, `depth`-deep recess of radius `bore` at the front. */
function blindCup(radius: number, bore: number, length: number, depth: number, segments: number): THREE.BufferGeometry {
  const profile = [new THREE.Vector2(0, -length / 2), new THREE.Vector2(radius, -length / 2),
    new THREE.Vector2(radius, length / 2), new THREE.Vector2(bore, length / 2),
    new THREE.Vector2(bore, length / 2 - depth), new THREE.Vector2(0, length / 2 - depth)];
  const lathe = new THREE.LatheGeometry(profile, segments).rotateX(Math.PI / 2);
  const flat = lathe.toNonIndexed(); lathe.dispose(); flat.computeVertexNormals();
  return flat;
}

export function antenna(P: TankBuilderPort, x: number, bottom: number, top: number, z: number): void {
  turretEquipment(P, 'turretDetail', KIT.cylY(.038, .055, .11, P.q ? 14 : 8), x, bottom + .055, z);
  turretEquipment(P, 'turretDark', antennaPart(KIT.cylY(.009, .017, top - bottom - .10, P.q ? 10 : 6)),
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
export function chassisLoft(rows: readonly ArmorStation[], innerWallHalf: number,
  options: SectionSolidOptions = {}): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, belly, shoulder, roofHalf, floor, knee, roof]) => ({ z,
    ring: [[-belly,floor],[belly,floor],[innerWallHalf,Math.min(floor+.17,knee-.025)],
      [innerWallHalf,knee],[shoulder,knee],[roofHalf,roof],[-roofHalf,roof],
      [-shoulder,knee],[-innerWallHalf,knee],[-innerWallHalf,Math.min(floor+.17,knee-.025)]],
  })),options);
}
