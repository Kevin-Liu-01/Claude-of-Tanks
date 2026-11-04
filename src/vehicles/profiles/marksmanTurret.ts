// The Marconi Marksman twin 35 mm air-defence turret (release 269, builder M; the owner 2026-11-03: "UK Marksman", the
// Finnish ItPsv 90 and the ItPsv Leopard 2): one turret module, built once, that any hull seats on its own ring through its
// adapter (Wikipedia: "installed by the use of an adapter ring"). The ItPsv 90 carries it on the fleet's T-55A hull, the
// ItPsv Leopard 2 on the Leopard 2A4's (profiles/marksman.ts). From the photographs (docs/references/tanks/marksman_t55.md):
//   - the welded octagonal body on its collar: broad roof-edge chamfers, a deep lower chamfer deepest at the front, the
//     blunt vertical prow under a sloped upper band (photos 01-03, 07-10);
//   - on each flank the large bearing drum, and on it the gun's armoured pod turning with the gun: a long faceted box,
//     its tail cut back, its nose a pyramid to the barrel (photos 01, 02, 05, 09, 10);
//   - the 35 mm Oerlikon KDA's barrel: the jacket, clamps, the long tube with its cable, the v0 sleeve and the slotted
//     brake with two baffles and four lugs (photos 05, 06);
//   - the Marconi 400-series radar on the rear roof: the base drum, its boot, the column, the head and electronics box, the
//     dish, and the electro-optical tracker on its boom (photos 02, 04, 07, 10);
//   - the commander's and gunner's sight heads mid-roof and their hatches, the four 76 mm dischargers at each rear roof
//     corner, the louvred grille low on each flank's rear (photos 02, 07, 08), lift eyes and two whips.
// Every datum the combat records share is in profiles/marksmanFrame.ts.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { KIT } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import {
  MARKSMAN_ADAPTERS, MARKSMAN_BARREL as BARREL, MARKSMAN_BODY as BODY, MARKSMAN_BODY_FACES, MARKSMAN_BORE as BORE,
  MARKSMAN_COLLAR as COLLAR, MARKSMAN_DRUM as DRUM, MARKSMAN_GRILLE as GRILLE, MARKSMAN_MUZZLE_Z, MARKSMAN_POD as POD,
  MARKSMAN_RADAR as RADAR, MARKSMAN_RINGS, MARKSMAN_SIGHTS as SIGHTS, MARKSMAN_SMOKE as SMOKE, MARKSMAN_TRUNNION,
  marksmanBodyPoint,
} from './marksmanFrame.ts';

type P3 = readonly [number, number, number];
const SIDES = [-1, 1] as const;

/** How a hull seats the turret. */
export interface MarksmanSeat {
  /** The hull's ring and adapter (marksmanFrame.ts MARKSMAN_RINGS, MARKSMAN_ADAPTERS). */
  readonly adapter: keyof typeof MARKSMAN_ADAPTERS & keyof typeof MARKSMAN_RINGS;
  /** The ring's centre as the hull's own builder drew it (hull frame): it must be the frame's. */
  readonly ring: readonly [number, number, number];
  /** The gun pods in the weapon steel's dark finish (the 2015 ItPsv Leopard 2's, photos 02-08) or in the turret's paint
   * (the ItPsv 90's, photo 01). */
  readonly darkPods: boolean;
}

/** UVs from x/z, as the fleet's convex slabs. */
function planarUv(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** A closed convex solid over the points. */
function convex(points: readonly P3[]): THREE.BufferGeometry {
  return planarUv(new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))));
}

/** A closed solid from its planar convex faces, each turned to face away from the solid's centre and fanned. */
function polygonSolid(faces: readonly (readonly P3[])[]): THREE.BufferGeometry {
  const all = faces.flat();
  const c = all.reduce((acc, p) => acc.add(new THREE.Vector3(...p)), new THREE.Vector3()).divideScalar(all.length);
  const out: number[] = [];
  for (const face of faces) {
    const v = face.map((p) => new THREE.Vector3(...p));
    const mid = v.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(v.length);
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const ordered = n.dot(mid.clone().sub(c)) < 0 ? v.slice().reverse() : v;
    for (let k = 1; k < ordered.length - 1; k++) {
      for (const p of [ordered[0], ordered[k], ordered[k + 1]]) out.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geometry.computeVertexNormals();
  return planarUv(geometry);
}

/** A lathe turned so its outward faces face out (LatheGeometry's winding follows the profile's direction). */
function outwardLathe(profile: readonly (readonly [number, number])[], segments: number): THREE.BufferGeometry {
  const geometry = KIT.lathe(profile, segments).toNonIndexed();
  const p = geometry.getAttribute('position');
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.clone().cross(c));
  }
  if (volume < 0) {
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The orientation turning +z onto `dir`. */
function aim(dir: THREE.Vector3): THREE.Euler {
  return new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
}

// --------------------------------------------------------------------------------------------------------- body --
function addBody(P: TankBuilderPort, seat: MarksmanSeat): void {
  const { cylX, cylY } = KIT;
  const n = P.q ? 40 : 24;
  // the hull's adapter ring, sunk into its deck, and the collar from it into the body's floor
  const A = MARKSMAN_ADAPTERS[seat.adapter];
  P.add('turret', cylY(A.r, A.r, A.topY - A.bottomY, n), 0, (A.topY + A.bottomY) / 2, 0);
  P.add('turretDark', cylY(A.r + 0.004, A.r + 0.004, 0.012, n), 0, A.topY - 0.008, 0);
  P.add('turret', cylY(COLLAR.r, COLLAR.r, COLLAR.topY + 0.02 - (A.topY - 0.01), n),
    0, (COLLAR.topY + 0.02 + A.topY - 0.01) / 2, 0);
  // the welded body: its fifteen planar faces (marksmanFrame.ts)
  P.add('turret', polygonSolid(Object.values(MARKSMAN_BODY_FACES).map((face) => face.map(marksmanBodyPoint))));
  // the bearing drums on the flanks (turret stock about the elevation axis), each run into the body, a cover disc on its
  // outer face round the gun's hub
  const [, ty, tz] = MARKSMAN_TRUNNION;
  for (const s of SIDES) {
    P.add('turret', cylX(DRUM.r, DRUM.outerX - DRUM.innerX, n), s * (DRUM.outerX + DRUM.innerX) / 2, ty, tz);
    P.add('turretDark', cylX(DRUM.r - 0.05, 0.010, n), s * (DRUM.outerX + 0.001), ty, tz);
  }
}

/** The louvred grille low on each flank's rear (photos 02, 07, 08): a frame, a dark recess and a lattice of diamonds. */
function addGrilles(P: TankBuilderPort): void {
  const { box } = KIT;
  const { z0, z1, y0, y1 } = GRILLE, x = BODY.sideX, zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
  for (const s of SIDES) {
    P.add('turretDark', box(0.012, y1 - y0, z1 - z0), s * (x + 0.002), yc, zc);
    for (const yy of [y0, y1]) P.add('turretDetail', box(0.035, 0.035, z1 - z0 + 0.035), s * (x + 0.012), yy, zc);
    for (const zz of [z0, z1]) P.add('turretDetail', box(0.035, y1 - y0, 0.035), s * (x + 0.012), yc, zz);
    const rows = 3, cols = P.q ? 4 : 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const y = y0 + (y1 - y0) * (r + 0.5) / rows, z = z0 + (z1 - z0) * (c + 0.5) / cols;
        P.add('turretDetail', box(0.02, 0.10, 0.10), s * (x + 0.011), y, z, Math.PI / 4, 0, 0);
      }
    }
  }
}

/** The four 76 mm dischargers at each rear roof corner on a bracket, raised outboard and a little aft (photos 02, 07). */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const x = BODY.sideX;
  for (const s of SIDES) {
    P.addEquipment('turretDetail', box(0.12, 0.24, 0.30), s * (x + 0.05), SMOKE.y, SMOKE.z);
    const bore = new THREE.Vector3(s * 0.80, 0.50, -0.22).normalize(), turn = aim(bore);
    for (const dy of [-0.065, 0.065]) {
      for (const dz of [-0.075, 0.075]) {
        const foot = new THREE.Vector3(s * (x + 0.10), SMOKE.y + dy, SMOKE.z + dz);
        const tube = foot.clone().addScaledVector(bore, SMOKE.tubeL / 2 - 0.02);
        const mouth = foot.clone().addScaledVector(bore, SMOKE.tubeL - 0.022);
        P.addEquipment('turretDetail', xform(markSmokeTube(cylZ(SMOKE.tubeR, SMOKE.tubeL, P.q ? 12 : 8)), 0, 0, 0, turn.x, turn.y, turn.z),
          tube.x, tube.y, tube.z);
        P.add('turretDark', xform(cylZ(SMOKE.tubeR - 0.01, 0.012, P.q ? 12 : 8), 0, 0, 0, turn.x, turn.y, turn.z), mouth.x, mouth.y, mouth.z);
      }
    }
  }
}

/** The sight heads, the hatches, the lift eyes and the whips on the roof. */
function addRoofKit(P: TankBuilderPort): void {
  const { box, cylY, liftEye } = KIT;
  const roof = BODY.roofY, n = P.q ? 20 : 12;
  for (const s of SIDES) {
    // the sight head: a round base, a tall box with its window forward and a hood over it
    const x = s * SIGHTS.x, z = SIGHTS.z;
    P.addEquipment('turretDetail', cylY(0.15, 0.16, 0.07, n), x, roof + 0.025, z);
    P.addEquipment('turretDetail', box(0.22, 0.26, 0.30), x, roof + 0.185, z);
    P.add('turretDark', box(0.17, 0.11, 0.012), x, roof + 0.22, z + 0.152);
    P.add('turretGlass', box(0.14, 0.08, 0.012), x, roof + 0.22, z + 0.160);
    P.addEquipment('turretDetail', box(0.24, 0.025, 0.10), x, roof + 0.31, z + 0.16);
    // the crew hatch ahead of it, hinged on its outer side
    P.add('turretDetail', cylY(SIGHTS.hatchR + 0.04, SIGHTS.hatchR + 0.04, 0.035, n), s * SIGHTS.hatchX, roof + 0.012, SIGHTS.hatchZ);
    P.addHatch('turretHatch', cylY(SIGHTS.hatchR, SIGHTS.hatchR, 0.04, n), s * SIGHTS.hatchX, roof + 0.045, SIGHTS.hatchZ);
    P.add('turretDark', box(0.06, 0.04, 0.16), s * (SIGHTS.hatchX + SIGHTS.hatchR - 0.01), roof + 0.06, SIGHTS.hatchZ);
    // lift eyes at the roof's corners and the whips on their bases at its rear
    liftEye(P, 'turretDetail', s * 0.55, roof, 0.90, 0);
    liftEye(P, 'turretDetail', s * 0.55, roof, -1.47, 0);
    P.addEquipment('turretDetail', cylY(0.045, 0.05, 0.09, 10), s * 0.50, roof + 0.035, -1.28);
    P.addEquipment('turretDetail', antennaPart(cylY(0.012, 0.016, 2.10, 8)), s * 0.50, roof + 1.10, -1.28);
    // a grab handle either side of the rear face's access plate
    P.add('turretDark', box(0.03, 0.03, 0.06), s * 0.52, 0.86, BODY.rearZ - 0.025);
    P.add('turretDark', box(0.03, 0.03, 0.06), s * 0.52, 0.56, BODY.rearZ - 0.025);
    P.add('turretDark', box(0.03, 0.33, 0.03), s * 0.52, 0.71, BODY.rearZ - 0.06);
  }
  // the bolted access plate on the rear face
  P.add('turretDetail', box(0.86, 0.50, 0.024), 0, 0.72, BODY.rearZ - 0.008);
}

/** The Marconi 400-series radar on the rear roof (marksmanFrame.ts MARKSMAN_RADAR), its dish facing forward. */
function addRadar(P: TankBuilderPort): void {
  const { box, cylX, cylY, cylZ, xform } = KIT;
  const R = RADAR, n = P.q ? 28 : 18, roof = BODY.roofY, x = R.x, z = R.z;
  P.addEquipment('turret', cylY(R.baseR, R.baseR + 0.01, R.baseTopY - roof + 0.01, n), x, (R.baseTopY + roof - 0.01) / 2, z);
  P.addEquipment('turretDark', cylY(R.columnR + 0.04, R.baseR - 0.01, R.bootTopY - R.baseTopY + 0.01, n),
    x, (R.bootTopY + R.baseTopY - 0.01) / 2, z);
  P.addEquipment('turretDetail', cylY(R.columnR, R.columnR, R.columnTopY - R.bootTopY + 0.02, n), x, (R.columnTopY + R.bootTopY) / 2, z);
  P.addEquipment('turretDark', cylY(R.columnR + 0.04, R.columnR + 0.04, 0.03, n), x, R.bootTopY + 0.07, z);
  // the head on the column, the electronics box on its right, the elevation axle through it with the dish's yoke
  P.addEquipment('turretDetail', box(0.32, 0.30, 0.30), x, R.headY, z);
  P.addEquipment('turretDetail', box(0.15, 0.30, 0.26), x - 0.225, R.headY - 0.02, z - 0.01);
  P.add('turretDark', box(0.012, 0.18, 0.16), x - 0.304, R.headY - 0.02, z - 0.01);
  P.addEquipment('turretDetail', cylX(0.07, R.boomX + 0.03 - 0.13, P.q ? 16 : 10), x + (R.boomX + 0.03 + 0.13) / 2, R.axleY, z);
  // the dish: a shallow paraboloid shell, concave forward and canted up, on a short neck from the head's front
  const tilt = (R.dishTiltDeg * Math.PI) / 180, d = R.dishDepth, r = R.dishR;
  const dish = outwardLathe([[0.0005, -0.025], [r * 0.5, d * 0.25 - 0.02], [r, d - 0.02], [r, d], [r * 0.5, d * 0.25],
    [0.0005, 0]], n);
  const vertexY = R.axleY + 0.10, vertexZ = z + R.dishZ;
  // the dish's frame: u across, v up its face, w along its boresight (forward, canted up), from its vertex
  const at = (u: number, v: number, w: number): P3 => [x + u, vertexY + v * Math.cos(tilt) + w * Math.sin(tilt),
    vertexZ - v * Math.sin(tilt) + w * Math.cos(tilt)];
  P.addEquipment('turretDark', xform(dish, 0, 0, 0, Math.PI / 2 - tilt, 0, 0), x, vertexY, vertexZ);
  // the neck from the head's front into the shell's back
  P.addEquipment('turretDetail', convex([
    ...[-1, 1].flatMap((sx) => [[x + sx * 0.10, R.axleY - 0.08, z + 0.10], [x + sx * 0.10, R.axleY + 0.08, z + 0.10]] as P3[]),
    ...[-1, 1].flatMap((su) => [-1, 1].map((sv) => at(su * 0.07, sv * 0.06, 0.002))),
  ]));
  // the feed's boss in the dish's centre
  const boss = at(0, 0, 0.012);
  P.add('turretDark', xform(cylZ(0.035, 0.03, 10), 0, 0, 0, -tilt, 0, 0), ...boss);
  // the electro-optical tracker on its boom from the axle's left end (photos 03, 04, 10)
  const foot: P3 = [x + R.boomX, R.axleY, z], head: P3 = [x + R.boomX, R.topY - 0.10, z + 0.12];
  const len = Math.hypot(head[1] - foot[1], head[2] - foot[2]), lean = Math.atan2(head[2] - foot[2], head[1] - foot[1]);
  P.addEquipment('turretDetail', cylY(0.035, 0.04, len, 10), x + R.boomX, (foot[1] + head[1]) / 2, (foot[2] + head[2]) / 2, lean, 0, 0);
  P.addEquipment('turretDetail', box(0.13, 0.11, 0.20), x + R.boomX, R.topY - 0.055, head[2] + 0.02);
  P.add('turretGlass', cylZ(0.035, 0.012, 12), x + R.boomX, R.topY - 0.055, head[2] + 0.125);
}

// --------------------------------------------------------------------------------------------------------- guns --
/** Each KDA (gun-local about the drum's axis): the hub, the armoured pod, its door, and the barrel. */
function addGuns(P: TankBuilderPort, seat: MarksmanSeat): void {
  const { box, cylX, cylZ } = KIT;
  const n = P.q ? 18 : 12;
  const podBucket = seat.darkPods ? 'gunMountDark' : 'gunMount';
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1;
    const mirror = (points: readonly P3[]): P3[] => points.map(([x, y, z]) => [s * x, y, z] as P3);
    // the hub from the drum's cover into the pod's inner face (a body of revolution about the axis)
    P.addGunExtraDark(cylX(DRUM.hubR, DRUM.hubOuterX - (DRUM.outerX - 0.02), n), s * (DRUM.hubOuterX + DRUM.outerX - 0.02) / 2, 0, 0);
    // the pod: a chamfered section along its body, the tail cut back top and bottom, the nose a pyramid to the face
    const section = (z: number, x0: number, x1: number, y0: number, y1: number, top: number, bottom: number): P3[] => [
      [x0, y0 + 0.03, z], [x0 + 0.03, y0, z], [x1 - bottom, y0, z], [x1, y0 + bottom, z],
      [x1, y1 - top, z], [x1 - top, y1, z], [x0 + 0.03, y1, z], [x0, y1 - 0.03, z],
    ];
    const { innerX: x0, outerX: x1, bottomY: y0, topY: y1, topChamfer: tc, bottomChamfer: bc } = POD;
    P.add(podBucket, convex(mirror([
      ...section(POD.tailZ, x0, x1 - 0.02, POD.tailBottomY, POD.tailTopY, tc * 0.6, bc),
      ...section(POD.tailCutZ, x0, x1, y0, y1, tc, bc),
      ...section(POD.shoulderZ, x0, x1, y0, y1, tc, bc),
      ...section(POD.shoulderZ + 0.12, x0 + 0.04, x1 - 0.07, y0 + 0.08, y1 - 0.06, tc * 0.8, bc),
      ...section(POD.noseZ, BORE.x - POD.faceHalfW, BORE.x + POD.faceHalfW, BORE.y - POD.faceHalfH, BORE.y + POD.faceHalfH, 0.04, 0.02),
    ])));
    // the access door on the pod's outer face, its hinges at the front edge and its latch
    const doorY = (y0 + y1) / 2 - 0.04, doorZ = 0.28;
    P.add(podBucket, box(0.016, 0.22, 0.36), s * (x1 + 0.004), doorY, doorZ);
    P.addGunExtraDark(box(0.02, 0.035, 0.08), s * (x1 + 0.013), doorY, doorZ - 0.12);
    for (const dy of [-0.07, 0.07]) P.addGunExtraDark(KIT.cylY(0.012, 0.012, 0.05, 8), s * (x1 + 0.014), doorY + dy, doorZ + 0.18);
    // the barrel: the mantlet sleeve on the nose's face, the jacket, its clamp, the tapered tube with a mid clamp and the
    // cable along its top, the v0 sleeve, the brake's two side plates, its baffles and the front ring with four lugs
    const bx = s * BORE.x, by = BORE.y, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`, B = BARREL;
    const mid = (span: readonly number[]): number => (span[0] + span[1]) / 2;
    const len = (span: readonly number[]): number => span[1] - span[0];
    P.addGunExtraDark(cylZ(B.sleeveR, len(B.sleeveZ), n), bx, by, mid(B.sleeveZ));
    P.add(barrel, cylZ(B.jacketR, len(B.jacketZ), n), bx, by, mid(B.jacketZ));
    P.add(dark, cylZ(B.jacketR + 0.010, 0.05, n), bx, by, B.jacketZ[1]);
    // (the tube and the cable run 2-5 cm into the v0 sleeve, the brake's plates 1 cm, so no end face lies on another)
    const tubeEnd = B.tubeZ[1] + 0.05;
    P.add(dark, cylZ(B.muzzleR, tubeEnd - B.tubeZ[0], n, B.tubeR), bx, by, (B.tubeZ[0] + tubeEnd) / 2);
    const clampZ = 2.75;
    P.add(dark, cylZ(B.tubeR + 0.012, 0.06, n), bx, by, clampZ);
    P.add(dark, cylZ(0.011, B.tubeZ[1] + 0.02 - clampZ, 6), bx, by + B.tubeR + 0.006, (clampZ + B.tubeZ[1] + 0.02) / 2);
    P.add(dark, cylZ(B.tubeR + 0.016, len(B.v0Z), n), bx, by, mid(B.v0Z));
    const plates = [B.brakeZ[0] - 0.01, B.brakeZ[1] - 0.005] as const;
    for (const sx of [-1, 1]) P.add(dark, box(0.024, 0.15, len(plates)), bx + sx * (B.brakeR + 0.002), by, mid(plates));
    P.add(dark, cylZ(B.brakeR, 0.07, n), bx, by, B.brakeZ[0] + 0.045);
    P.add(dark, cylZ(B.brakeR, 0.06, n), bx, by, B.brakeZ[0] + 0.23);
    P.add(dark, cylZ(B.brakeR + 0.004, 0.06, n), bx, by, B.brakeZ[1] - 0.03);
    for (const [lx, ly] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      P.add(dark, box(lx ? 0.04 : 0.05, ly ? 0.04 : 0.05, 0.035), bx + lx * 0.088, by + ly * 0.088, B.brakeZ[1] - 0.002 - 0.0175);
    }
  }
  P.muzzleZ = MARKSMAN_MUZZLE_Z;
}

/**
 * The Marksman turret on a hull's ring: the caller has built the hull; the turret group stands on the hull's ring (the
 * frame's, which the specs read), the gun group at the drum's axis (marksmanFrame.ts MARKSMAN_TRUNNION).
 */
export function buildMarksmanTurret(P: TankBuilderPort, seat: MarksmanSeat): void {
  const ring = MARKSMAN_RINGS[seat.adapter];
  if (seat.ring.some((v, i) => Math.abs(v - ring[i]) > 1e-9)) {
    throw new Error(`Marksman: the ${seat.adapter} hull's ring ${seat.ring} is not the frame's ${ring}`);
  }
  P.turretG.position.set(ring[0], ring[1], ring[2]);
  P.gunG.position.set(...MARKSMAN_TRUNNION);
  addBody(P, seat);
  addGrilles(P);
  addSmokeDischargers(P);
  addRoofKit(P);
  addRadar(P);
  addGuns(P, seat);
  P.topY = BODY.roofY + 0.30;
}
