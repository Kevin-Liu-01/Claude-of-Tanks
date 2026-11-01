// The 2A4-era Leopard 2 turret (the owner, 2026-10-28: "redesingn the turrets off of our leopard 2a6 and have them be the
// before variants basically"): our source-measured Leopard 2A6 (leopardA6X.ts) before its wedge. The 2A6 X's measured
// shell sections, hatch rings, smoke-tube rows and aft lifting eye carry over in its own z frame; the wedge add-on armour,
// the 2A5's side modules and its long mantlet cover come off; the 2A4's front armour block goes back on from the 2A6 X's
// seam, as the photographed 2A4s have it (the owner, 2026-10-28: "fronts of leo 2a4s are sloped thoughh. check the real
// tanks"): two cheek blocks whose vertical faces stand only 0.5 m before a 40-degree bevel slopes back to the roof, their
// top edges bevelled along the sides and their outer corners cut back to the walls, the EMES 15 sight's window a pocket cut
// through the right cheek's upper face and bevel with its armoured doors standing open, the wide flat mantlet between them
// (its top bevelled under the brow) with the FERO Z18 auxiliary sight's round port right of the gun and the coaxial MG3's
// high on its left. The roof carries the commander's ring with eight periscopes and the PERI R17 ahead of it (right),
// the loader's ring and MG3 (left); two rows of four smoke tubes a side; grab rails on the cheek faces and the walls; the
// ammunition hatch welded shut on the left wall; bins on the bustle's sides and a box on its rear plate; two whips. The
// proportions are checked against Björn Huber's published 2A4 side drawing (leopard2A4FamilyArmor.ts) and the Austrian and
// Singaporean 2A4s the owner and Main supplied (docs/references/tanks/leo2a4-family.md).
//
// Frames: turret metres from the ring's centre on the deck (world 0, 1.64, 0.37); the world's right of a +Z hull is -X.
// Every add-on that is not the turret's armour (sights, rails, tubes, bins, eyes) is equipment or detail, never the
// 'turret' bucket.
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { buildLeopard2A6Front } from './leopard2A4Wedge.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEO2A4_CHEEK_FRONT, LEO2A4_TURRET, leopard2A4BarrelM, type Leopard2A4Gun } from '../leopard2A4FamilyArmor.ts';
import { cheekFaceZ } from '../leopard2CheekFrontDatums.ts';
import { addLeopard2CheekBlocks, addLeopard2Emes15 } from './leopard2CheekFront.ts';

const T = LEO2A4_TURRET;
type Point = readonly [number, number, number];

/** What a variant asks of the common turret. */
export interface Leopard2A4TurretOptions {
  readonly gun: Leopard2A4Gun;
  /** The 2A4's square front block (default), or the 2A6 look of the 2A4s upgraded with the wedge add-on armour. */
  readonly front?: 'block' | 'wedge';
  /** Seeds for the turret's fittings. */
  readonly seed: number;
  /** The loader's machine gun on its ring's mount (a variant whose remote station replaces it leaves it off): the MG3, or
   *  the FN MAG (the Dutch-pattern MAG 58, the Canadian C6), worked from inside on a remote mount where `remote`. */
  readonly loaderMG?: false | { readonly cls: 'mg3' | 'mag58' | 'mag'; readonly name: string; readonly remote?: boolean };
  /** The 2A6 X's two rows of four smoke tubes a side (a variant with its own dischargers leaves them off). */
  readonly smoke?: boolean;
  /** The grab rails on the cheek faces and the walls (a variant whose appliqué covers them leaves them off). */
  readonly faceRails?: boolean;
  readonly wallRails?: boolean;
  /** The lifting lug block low on the right cheek's face (an appliqué over the face leaves it off). */
  readonly faceLug?: boolean;
  /** The radios' whips standing (default), or none (a kit lays its own: folded, raked or caged). */
  readonly whips?: boolean;
  /** The bins on the bustle's sides and the box on its rear plate. */
  readonly sideBins?: boolean;
  readonly rearBox?: boolean;
  /** The tactical number on the walls, held this far off them (an appliqué's thickness). */
  readonly numberOffsetM?: number | null;
}

/** A welded section, counter-clockwise from +Z: chamfered lower corners, vertical walls, a bevelled roof edge. */
function shellRing(right: number, left: number, bottom: number, roof: number, foot = 0.04, bevel = 0.07): SectionPoint[] {
  const shoulder = roof - bevel;
  return [
    [-right + foot, bottom], [left - foot, bottom], [left, bottom + foot], [left, shoulder],
    [left - bevel, roof], [-right + bevel, roof], [-right, shoulder], [-right, bottom + foot],
  ];
}

/**
 * The welded shell from the bustle's rear plate to the front block's seam: the 2A6 X's measured stations (right wall,
 * left wall, floor, roof), the bustle's chamfered rear corners closing to the rear plate.
 */
function turretShell(P: TankBuilderPort, wedge: boolean): void {
  const s = (z: number, right: number, left: number, floor: number, roof: number): SolidSection =>
    ({ z, ring: shellRing(right, left, floor, roof) });
  P.add('turret', sectionSolid([
    s(T.rearZ, T.rearRightM, T.rearLeftM, T.rearFloorY, T.rearRoofY),
    s(T.bustleEndZ, 1.10, 1.16, T.bustleFloorY, 0.775),
    s(-1.8062, T.bustleRightM, T.wallLeftM, T.bustleFloorY, T.roofY),
    s(-1.023, 1.213, T.wallLeftM, T.bustleFloorY, T.roofY),
    s(-0.4664, T.wallRightM, T.wallLeftM, 0.146, T.roofY),
    s(0.2587, T.wallRightM, T.wallLeftM, T.floorY, T.roofY),
    s(0.3715, T.wallRightM, T.wallLeftM, T.floorY, 0.7904),
    // the 2A6 look's wedges stand on the 2A6 X's seam; the square block's swept cheeks in front of a shorter shell, its
    // front behind their outer ends' bevelled tops (leopard2CheekFrontDatums.ts)
    wedge ? s(T.blockZ, T.wallRightM, T.wallLeftM, T.floorY, 0.739)
      : s(LEO2A4_CHEEK_FRONT.rootZ, T.wallRightM, T.wallLeftM, T.floorY, LEO2A4_CHEEK_FRONT.cheekTopY + 0.005),
  ], { sideQuadDiagonal: 'convex' }));
}

/** The faces' z at |x| (swept back from the slot's edge: the shared cheek front's line). */
export const leopard2A4FaceZ = (absX: number): number => cheekFaceZ(LEO2A4_CHEEK_FRONT, absX);

/**
 * The front armour block: the two swept cheek blocks in front of the shell and the EMES 15's notch cut through the right
 * one (leopard2CheekFront.ts, shared with the 262 early Leopards); the brow closing the slot over the mantlet, its top the
 * cheeks' (level, then the bevel); the welded joints; the lifting lug low on the right face (photographed on the Austrian
 * and Singaporean 2A4s).
 */
function frontBlock(P: TankBuilderPort, lug: boolean): void {
  const { box } = KIT;
  const F = LEO2A4_CHEEK_FRONT, floor = T.floorY, top = T.blockTopY, slot = T.slotHalfWidthM;
  const sweep = F.sweepDeg * Math.PI / 180, lerp = THREE.MathUtils.lerp;
  addLeopard2CheekBlocks(P, F);
  /** The cheeks' top at the slot's edge: level to the bevel, then down to the faces' top. */
  const topAt = (z: number): number => z <= T.bevelZ ? top : lerp(top, T.faceTopY, (z - T.bevelZ) / (T.faceZ - T.bevelZ));
  // the brow over the slot, its underside clear of the mantlet at full elevation, ending 4 cm behind the faces
  const brow = (z: number, under: number): SolidSection => ({ z, ring: [[-slot, under], [slot, under], [slot, topAt(z)], [-slot, topAt(z)]] });
  P.add('turret', sectionSolid([brow(F.rootZ - 0.02, 0.69), brow(T.bevelZ, 0.69), brow(T.faceZ - 0.04, 0.60)]));
  // the welded joints: the faces with the slot's walls, the block's seam with the shell, each side
  for (const sx of [-1, 1]) {
    P.addEquipment('turretDark', box(0.012, T.faceTopY - floor - 0.04, 0.012), sx * (slot + 0.006), (T.faceTopY + floor) / 2, T.faceZ - 0.006);
    P.addEquipment('turretDark', box(0.014, top - floor - 0.06, 0.014), sx * ((sx < 0 ? T.wallRightM : T.wallLeftM) + 0.003),
      (top + floor) / 2 - 0.02, F.rootZ + 0.02);
  }
  // the lug lies on the right face, turned with its sweep
  if (lug) P.addEquipment('turretDetail', box(0.30, 0.09, 0.05), -0.86, floor + 0.10, leopard2A4FaceZ(0.86) + 0.024, 0, -sweep, 0);
}

/**
 * The 2A4's mantlet: a wide flat plate filling the slot 3 cm behind the cheeks' faces, its top bevelled back under the
 * brow like the cheeks', the gun's round collar on it, the FERO Z18 auxiliary sight's round port right of the gun and the
 * coaxial MG3's port high on its left (as photographed); the 120 mm L/44 (or L/55) with its thermal sleeves and evacuator.
 */
function gunAssembly(P: TankBuilderPort, gun: Leopard2A4Gun, wedge: boolean): void {
  const { cylZ, torus } = KIT;
  const face = T.mantletFaceZ, seg = P.q ? 24 : 14, len = leopard2A4BarrelM(gun), hw = T.slotHalfWidthM - 0.01;
  P.gunG.position.set(T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]);
  if (wedge) {
    // the 2A6 look: the tube runs out of the long mantlet cover (leopard2A4Wedge.ts)
    KIT.buildGun(P, { len, r: T.barrelRadiusM, sleeve: true, evac: gun === 'L55' ? 0.60 : 0.56, evacR: 1.78, collar: true,
      baseR: 0.15 });
    muzzleBore(P, { len, r: T.barrelRadiusM });
    return;
  }
  // the plate's section (gun frame): a vertical face to 0.20 over the bore, the bevel back to 0.30; the body's underside
  // rises toward its back inside the slot, so at full elevation it keeps clear of the hull's ring
  const ring = (front: number, low = -0.23): SectionPoint[] => [[-hw, low], [hw, low], [hw, front], [-hw, front]];
  P.addGunExtra(sectionSolid([
    { z: -0.30, ring: ring(0.30, -0.14) },
    { z: -0.12, ring: ring(0.30) },
    { z: face - 0.12, ring: ring(0.30) },
    { z: face, ring: ring(0.20) },
  ]), 0, 0, 0);
  P.addGunExtra(cylZ(0.21, 0.035, seg), 0, 0, face + 0.015);                      // the collar's flange
  P.addGunExtra(cylZ(0.17, 0.09, seg, 0.15), 0, 0, face + 0.075);               // the collar narrowing to the sleeve
  // FERO Z18 (right of the gun, bore height): an 85 mm aperture in a 140 mm collar standing 45 mm proud; the coaxial MG3
  // (high left): a 68 mm hole in a raised ring (the 262 lane's measures, as photographed)
  P.addGunExtra(cylZ(0.07, 0.045, P.q ? 16 : 10), -0.285, 0, face + 0.0225);
  P.addGunExtraDark(cylZ(0.0425, 0.012, P.q ? 16 : 10), -0.285, 0, face + 0.040);
  P.addGunExtra(KIT.xform(torus(0.046, 0.012, P.q ? 16 : 10), 0, 0, 0, Math.PI / 2, 0, 0), 0.31, 0.16, face + 0.010);
  P.addGunExtraDark(cylZ(0.034, 0.012, P.q ? 16 : 10), 0.31, 0.16, face + 0.004);
  KIT.buildGun(P, { len, r: T.barrelRadiusM, sleeve: true, evac: gun === 'L55' ? 0.60 : 0.56, evacR: 1.78, collar: true,
    baseR: 0.15 });
  muzzleBore(P, { len, r: T.barrelRadiusM });
}


/**
 * The roof: the commander's ring (the 2A6 X's) with eight periscopes and its hatch, the PERI R17 ahead of it on its
 * drum; the loader's ring (the 2A6 X's), its periscope and hatch and the MG3 on its mount; the lifting eyes (the 2A6 X's
 * aft arch, two on the front block, two at the bustle's corners); the radios' antenna bases and whips.
 */
function roofFittings(P: TankBuilderPort, o: Leopard2A4TurretOptions): void {
  const { box, cylY } = KIT;
  const roof = T.roofY, seg = P.q ? 28 : 16;
  const [cx, cz, cr, ch] = T.commander;
  P.add('turret', cylY(cr, cr + 0.01, ch * 0.6, seg), cx, roof + ch * 0.3, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    P.addEquipment('turretDetail', box(0.10, 0.07, 0.06), cx + Math.sin(a) * (cr + 0.01), roof + ch * 0.6 + 0.02,
      cz + Math.cos(a) * (cr + 0.01), 0, a, 0);
    P.addEquipment('turretGlass', box(0.07, 0.03, 0.012), cx + Math.sin(a) * (cr + 0.045), roof + ch * 0.6 + 0.025,
      cz + Math.cos(a) * (cr + 0.045), 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(cr * 0.73, cr * 0.73, 0.035, seg), cx, roof + ch * 0.6 + 0.018, cz);
  P.addEquipment('turretDark', box(0.26, 0.022, 0.035), cx, roof + ch * 0.6 + 0.045, cz - 0.16);
  // PERI R17 (the 2A4; the 2A6 look carries the R17A2 behind the ring): a drum 0.30 m across ahead of the commander's ring, its head 0.40 m over the roof, the window box angled
  // forward under a cap
  const px = cx - 0.02, pz = cz + cr + 0.22;
  if (o.front !== 'wedge') {
  P.addEquipment('turretDetail', cylY(0.15, 0.16, 0.14, P.q ? 20 : 12), px, roof + 0.07, pz);
  P.addEquipment('turretDetail', box(0.26, 0.20, 0.24), px, roof + 0.24, pz);
  P.addEquipment('turretDetail', box(0.22, 0.09, 0.10), px, roof + 0.27, pz + 0.14, -0.25, 0, 0);
  P.addEquipment('turretGlass', box(0.17, 0.05, 0.012), px, roof + 0.27, pz + 0.194, -0.25, 0, 0);
  P.addEquipment('turretDetail', box(0.28, 0.02, 0.26), px, roof + 0.35, pz);
  }
  // the loader's ring and flat hatch, the periscope ahead of it, the MG3 on the ring's outboard mount
  const [lx, lz, lr, lh] = T.loader;
  P.add('turret', cylY(lr, lr + 0.01, lh, seg), lx, roof + lh / 2, lz);
  P.addHatch('turretHatch', cylY(lr * 0.76, lr * 0.76, 0.03, seg), lx, roof + lh + 0.012, lz);
  P.addEquipment('turretDark', box(0.30, 0.022, 0.035), lx, roof + lh + 0.035, lz - 0.20);
  P.addEquipment('turretDetail', box(0.16, 0.08, 0.10), lx - 0.05, roof + lh + 0.02, lz + lr - 0.02);
  P.addEquipment('turretGlass', box(0.12, 0.03, 0.012), lx - 0.05, roof + lh + 0.03, lz + lr + 0.032);
  const lmg = o.loaderMG ?? { cls: 'mg3', name: 'leo2a4LoaderMG3' };
  if (lmg) {
    P.addEquipment('turretDetail', cylY(0.05, 0.06, 0.10, 10), lx + 0.27, roof + lh + 0.03, lz + 0.18);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: lmg.cls, tone: 'two-tone', seed: o.seed + 3, rotation: [0, 0.06, 0],
      working: true, ridingCradle: true, ...(lmg.remote ? { remoteControlled: true } : {}) });
    mg.name = lmg.name;
    mg.position.set(lx + 0.27, roof + lh + 0.08, lz + 0.18);
    P.turretG.add(mg);
  }
  // the lifting eyes: the 2A6 X's aft arch on the roof's centreline, two on the front block, two at the bustle's corners
  const arch = new THREE.Shape();
  arch.moveTo(-1.282345, 0.80021);
  for (const [z, y] of [[-1.267225, 0.85858], [-1.244395, 0.89393], [-1.200275, 0.91312], [-1.155905, 0.91151],
    [-1.106825, 0.88419], [-1.032135, 0.83902], [-0.997255, 0.80393], [-1.045, 0.80021], [-1.14, 0.831],
    [-1.16, 0.870669], [-1.18, 0.875729], [-1.20, 0.874281], [-1.225, 0.847], [-1.245, 0.80021]] as const) arch.lineTo(z, y);
  arch.closePath();
  const eye = new THREE.ExtrudeGeometry(arch, { depth: 0.03736, bevelEnabled: false });
  eye.rotateY(-Math.PI / 2).translate(0.018685, -0.009, 0);
  P.addEquipment('turretDetail', eye);
  P.addEquipment('turretDetail', box(0.067, 0.025, 0.309), 0, roof - 0.001, -1.1398);
  // the right front eye outboard of the EMES 15 housing's lip and on the block's flat top (at -1.05, 1.20 it stood half on the
  // bevel and its foot met the lip once the window deepened: the window critic)
  for (const [x, y, z] of [[0.95, T.blockTopY, 1.30], [-1.14, T.blockTopY, 1.06], [0.92, roof, -2.25], [-0.90, roof, -2.25]] as const) {
    KIT.liftEye(P, 'turretDetail', x, y + 0.015, z);
  }
  // the radios' antenna bases at the bustle's corners (the 2A6 X's), their whips
  for (const sx of [-1, 1]) {
    const ax = sx < 0 ? -0.88017 : 0.91495, az = -1.98;
    P.addEquipment('turretDetail', cylY(0.0335, 0.045, 0.10, 12), ax, roof + 0.05, az);
    if (o.whips === false) continue;
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.60, r: 0.0086, seed: o.seed + 20 + (sx > 0 ? 1 : 0),
      rotation: [-0.10, 0, 0] });
    whip.position.set(ax, roof + 0.10, az);
    P.turretG.add(whip);
  }
}

/** One of the 2A6 X's smoke tubes: an open mouth on its stock, its capped breech and a saddle into the flank. */
function smokeTube(P: TankBuilderPort, mouth: Point, direction: Point): void {
  const seg = P.q ? 16 : 10;
  const axis = new THREE.Vector3(...direction).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const center = new THREE.Vector3(...mouth).addScaledVector(axis, -0.1071);
  const body = new THREE.CylinderGeometry(0.0437, 0.0437, 0.2142, seg, 1, true);
  body.applyQuaternion(rotation).translate(...center.toArray());
  P.addEquipment('turretDetail', body);
  const rim = markSmokeTube(new THREE.RingGeometry(0.0305, 0.0437, seg));
  rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
  rim.translate(...mouth);
  P.addEquipment('turretDetail', rim);
  // the bore's lining (its faces turned inward) down to the loaded grenade's face 4 cm in: the bare tube's inside read as
  // an open seam from a low front view (the sealed check, release 264's gate)
  const liner = new THREE.CylinderGeometry(0.0305, 0.0305, 0.04, seg, 1, true).scale(-1, 1, 1);
  liner.computeVertexNormals();
  liner.applyQuaternion(rotation).translate(...new THREE.Vector3(...mouth).addScaledVector(axis, -0.02).toArray());
  P.addEquipment('turretDark', liner);
  const grenade = new THREE.CircleGeometry(0.0305, seg);
  grenade.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
  grenade.translate(...new THREE.Vector3(...mouth).addScaledVector(axis, -0.04).toArray());
  P.addEquipment('turretDark', grenade);
  const back = new THREE.Vector3(...mouth).addScaledVector(axis, -0.207);
  const cap = new THREE.CylinderGeometry(0.042, 0.042, 0.014, seg);
  cap.applyQuaternion(rotation).translate(...back.toArray());
  P.addEquipment('turretDark', cap);
  const root = back.clone();
  root.x = mouth[0] < 0 ? -(T.wallRightM - 0.12) : T.wallLeftM - 0.02;
  P.addEquipment('turretDetail', new THREE.TubeGeometry(new THREE.LineCurve3(root, back), 1, 0.024, 8, false));
}

/** The 2A6 X's smoke tubes: two staggered rows of four a side, turned up and out (its measured mouths and axes). */
function smokeTubes(P: TankBuilderPort): void {
  const y = (v: number): number => v - T.pivot[1];
  const leftAxis: Point = [0.2833336, 0.5865999, 0.7586980];
  const rightAxis: Point = [-0.3683290, 0.5865440, 0.7213180];
  for (const dz of [-0.43220, -0.22331, 0, 0.20889]) smokeTube(P, [1.330162, y(2.350317), -1.264813 + dz], leftAxis);
  for (const dz of [-0.32763, 0, 0.20889, 0.41150]) smokeTube(P, [1.368452, y(2.066207), -0.980383 + dz], leftAxis);
  for (const [dx, dz] of [[0.06149, -0.53299], [0.03755, -0.32547], [0, 0], [-0.02394, 0.20751]]) {
    smokeTube(P, [-1.427776 + dx, y(2.066742), -0.855594 + dz], rightAxis);
  }
  for (const [dx, dz] of [[0.04954, -0.42934], [0.02560, -0.22183], [0, 0], [-0.02394, 0.20752]]) {
    smokeTube(P, [-1.357136 + dx, y(2.350862), -1.133764 + dz], rightAxis);
  }
}

/** The walls' and faces' grab rails on their stand-offs, the ammunition hatch welded shut on the left wall. */
function railsAndHatch(P: TankBuilderPort, o: Leopard2A4TurretOptions): void {
  const { box } = KIT;
  /** A rail along the run (x0, z0) to (x1, z1), held off the surface by (ox, oz) on a stand-off at each end. */
  const rail = (x0: number, x1: number, y: number, z0: number, z1: number, ox: number, oz: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    P.addEquipment('turretDetail', box(0.022, 0.022, len), (x0 + x1) / 2 + ox, y, (z0 + z1) / 2 + oz, 0, ry, 0);
    for (const t of [0.06, 0.94]) {
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      P.addEquipment('turretDetail', box(0.02, 0.02, Math.hypot(ox, oz) + 0.012), x + ox / 2, y, z + oz / 2, 0, Math.atan2(ox, oz), 0);
    }
  };
  if (o.faceRails !== false && o.front !== 'wedge') {
    // across each cheek's face under the EMES notch's sill (the photographed 2A4s), standing 5 cm off it
    rail(-0.58, -1.06, 0.30, leopard2A4FaceZ(0.58), leopard2A4FaceZ(1.06), 0, 0.05);
    rail(0.98, 0.58, 0.30, leopard2A4FaceZ(0.98), leopard2A4FaceZ(0.58), 0, 0.05);
  }
  if (o.wallRails !== false) {
    rail(-T.wallRightM, -T.wallRightM, 0.44, 0.95, -0.30, -0.055, 0);
    rail(T.wallLeftM, T.wallLeftM, 0.44, -0.30, 0.95, 0.055, 0);
  }
  // the ammunition hatch on the left (loader's) wall, welded shut: a raised plate and the bead round its edge
  const hx = T.wallLeftM + 0.0175, hz = -0.42;
  P.addEquipment('turretDetail', box(0.035, 0.30, 0.42), hx, 0.38, hz);
  for (const [dy, dz, h, d] of [[0.155, 0, 0.012, 0.44], [-0.155, 0, 0.012, 0.44], [0, 0.215, 0.32, 0.012], [0, -0.215, 0.32, 0.012]] as const) {
    P.addEquipment('turretDark', box(0.04, h, d), hx + 0.002, 0.38 + dy, hz + dz);
  }
}

/** The bins on the bustle's sides behind the tubes, and the box across the rear plate's top. */
function bustleStowage(P: TankBuilderPort, o: Leopard2A4TurretOptions): void {
  const { box } = KIT;
  if (o.sideBins !== false) {
    for (const sx of [-1, 1]) {
      const wall = sx < 0 ? 1.11 : 1.165;
      P.addEquipment('turretDetail', box(0.13, 0.30, 0.46), sx * (wall + 0.065), 0.55, -2.03);
      P.addEquipment('turretDark', box(0.135, 0.012, 0.47), sx * (wall + 0.066), 0.70, -2.03);
      for (const dz of [-0.13, 0.13]) P.addEquipment('turretDark', box(0.02, 0.05, 0.03), sx * (wall + 0.135), 0.62, -2.03 + dz);
    }
  }
  if (o.rearBox !== false) {
    P.addEquipment('turretDetail', box(1.30, 0.26, 0.20), 0, 0.56, T.rearZ - 0.10);
    P.addEquipment('turretDark', box(1.32, 0.014, 0.21), 0, 0.69, T.rearZ - 0.10);
    for (const sx of [-0.4, 0.4]) P.addEquipment('turretDark', box(0.06, 0.04, 0.02), sx, 0.62, T.rearZ - 0.205);
  }
}

/** The 2A4-era turret, its gun and its standing fittings; a variant's kit goes on after it. */
export function buildLeopard2A4Turret(P: TankBuilderPort, o: Leopard2A4TurretOptions): void {
  P.turretG.position.set(T.pivot[0], T.pivot[1], T.pivot[2]);
  P.add('turret', KIT.cylY(1.00, 1.00, 0.03, P.q ? 48 : 24), 0, 0.013, 0);                       // ring guard
  // 266 (roof-pocket census): behind the trunnion the 2A6 X's floor rises 0.15-0.21 m over the ring (0.146 at z -0.47, the
  // bustle's 0.214 from -1.02), a sealed hollow inside the seat collar; the collar's wall is 4 cm here (turretSeatRace.ts),
  // so the census no longer reads daylight through a 1.2 cm band into it (the release-265 2A4s' 3.3-4.3k cm2 of ring pockets)
  P.turretG.userData.turretSeatCollarWallM = 0.04;
  const wedge = o.front === 'wedge';
  turretShell(P, wedge);
  if (wedge) buildLeopard2A6Front(P);
  else {
    frontBlock(P, o.faceLug !== false);
    addLeopard2Emes15(P, LEO2A4_CHEEK_FRONT);
  }
  gunAssembly(P, o.gun, wedge);
  roofFittings(P, o);
  if (o.smoke !== false) smokeTubes(P);
  railsAndHatch(P, o);
  bustleStowage(P, o);
  if (o.numberOffsetM !== null) {
    for (const sx of [-1, 1]) {
      const x = (sx < 0 ? T.wallRightM : T.wallLeftM) + (o.numberOffsetM ?? 0.002);
      P.decal('turret', 'number', null, 0.24, [sx * x, 0.50, -0.95], sx * Math.PI / 2);
    }
  }
}
