// Lvkv 9040 (release 269, builder S; the owner 2026-11-03: "also add ... LVKV 9040 (swedish)", then "also based the lvkv
// 9040 on the correct cv9040 mk 4 hull"): the Swedish Luftvärnskanonvagn 9040's turret on the fleet's CV90 Mk IV hull and
// running gear (profiles/cv90MkivSourceX.ts, called with its default-off `hullOnly`, so it draws no turret), the turret
// built from the owner's photograph (photos 01-02: the vehicle's right side, winter 2005, on the early hull) and the
// published figures (docs/references/tanks/lvkv9040.md):
//   - a welded turret larger than the Strf 9040's: a full-width low rear section, a taller front section whose sloped
//     front plate runs down over the driver's hatch, and between the front section's cheeks the slot the gun elevates in;
//   - ONE 40 mm Bofors L/70 on a mantlet drum in that slot: the cradle's large round cover out of the front plate, the
//     ribbed jacket, the long barrel and its slotted flash eliminator, the v0 radar riding on the cover;
//   - the PS-95 search radar's drum (Thomson-CSF Harfang) raised on its column over the rear section's left side, the
//     three bands round its rolled top;
//   - the commander's tall sight head on the right of the front roof and the gunner's on the left, the commander's hatch
//     behind his sight, a lamp on the right cheek, three smoke dischargers a side, a whip at the right rear.
// Every datum the combat record shares is in profiles/lvkv9040Frame.ts (lvkv9040Specs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { hatchParts } from './fieldChest.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { buildCv90MkivX } from './cv90MkivSourceX.ts';
import {
  LVKV_GUN as G, LVKV_MUZZLE_Z, LVKV_RADAR as R, LVKV_SIGHTS, LVKV_TRUNNION, LVKV_TURRET as T,
} from './lvkv9040Frame.ts';

type P3 = readonly [number, number, number];
const SIDES = [-1, 1] as const;

/** A closed convex solid over the points (UVs from x/z, as the fleet's convex slabs). */
function convex(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
const mirror = (points: readonly P3[], s: number): P3[] => points.map(([x, y, z]) => [s * x, y, z] as P3);
/** The body's side wall at height y (|x|): from the floor's half-width up to the top's under the roof chamfer. */
const wallX = (y: number): number => T.halfWBottom
  + (T.halfWTop - T.halfWBottom) * Math.min(1, (y - T.floorY) / (T.frontRoofY - T.roofChamfer - T.floorY));

// --------------------------------------------------------------------- turret --
/**
 * The welded body (photo 02): the rear section and the centre block to the slot's rear wall as one loft (its roof
 * rising from the rear section's to the front section's at the seam, the roof edges and the rear corners chamfered),
 * the two cheeks of the front section either side of the gun slot, and the chin under the slot.
 */
function addTurretBody(P: TankBuilderPort): void {
  const { cylY } = KIT;
  const { floorY: F, roofChamfer: C, halfWBottom: wb, halfWTop: wt } = T;
  // the ring collar on the hull's race, sunk into the deck and 2 cm up into the floor
  P.add('turret', cylY(0.95, 0.97, 0.12, P.q ? 32 : 20), 0, F - 0.04, 0);
  const ring = (bottom: number, top: number, roof: number, floor: number = F): SectionPoint[] => [
    [-bottom, floor], [bottom, floor], [top, roof - C], [top - C, roof], [-(top - C), roof], [-top, roof - C],
  ];
  const rc = T.rearChamfer, inset = 0.01;
  // (ahead of the seam the block runs 1 cm inside the cheeks' walls, roof and floor, so no face of it lies on theirs: the
  // 1 cm taper before their rear faces is the seam's weld groove, and the mantlet cover between them sits 1 cm low)
  P.add('turret', sectionSolid([
    { z: T.rearZ, ring: ring(wb - rc, wt - rc, T.bustleRoofY - 0.04) },
    { z: T.rearZ + rc, ring: ring(wb, wt, T.bustleRoofY) },
    { z: T.stepZ0, ring: ring(wb, wt, T.bustleRoofY) },
    { z: T.stepZ1, ring: ring(wb, wt, T.frontRoofY) },
    { z: T.stepZ1 + 0.02, ring: ring(wb - inset, wt - inset, T.frontRoofY - inset, F + 0.005) },
    { z: T.slotRearZ, ring: ring(wb - inset, wt - inset, T.frontRoofY - inset, F + 0.005) },
  ]));
  // the cheeks: the inner face on the slot, the outer wall, the roof and its edge chamfer, the sloped front plate down to
  // the foot, the outer front corner cut back in plan; their rear 2 cm inside the centre block
  const z0 = T.stepZ1 + 0.01, xi = T.slotHalfW, Y = T.frontRoofY;
  const cheek: P3[] = [
    [xi, F, z0], [xi, Y, z0], [xi, Y, T.roofFrontZ], [xi, T.footY, T.footZ], [xi, F, T.footZ - 0.04],
    [wb, F, z0], [wt, Y - C, z0], [wt - C, Y, z0],
    [wt, Y - C, T.roofFrontZ - 0.08], [wt - C, Y, T.roofFrontZ - 0.05], [T.roofFrontHalfW, Y, T.roofFrontZ],
    [wb, F, T.roofFrontZ + 0.24], [T.footHalfW, T.footY, T.footZ], [T.footHalfW, F, T.footZ - 0.04],
  ];
  for (const s of SIDES) P.add('turret', convex(mirror(cheek, s)));
  // the chin under the slot, 1 cm into each cheek: level under the mantlet, then chamfered down to the floor ahead of the
  // cheeks' foot so the cradle's cover clears it by 2 cm at full depression
  const xc = T.slotHalfW + 0.01, chinFloor = F + 0.004;
  P.add('turret', convex([-1, 1].flatMap((s) => [
    [s * xc, chinFloor, z0], [s * xc, T.slotFloorY, z0], [s * xc, T.slotFloorY, T.chinBreakZ], [s * xc, chinFloor, T.footZ - 0.04],
  ] as P3[])));
}

/**
 * The PS-95 drum (photo 02): raised on its column over the rear section's left, the radome's rolled top lip and the three
 * bands under it; the column on a base flange on the roof.
 */
function addSearchRadar(P: TankBuilderPort): void {
  const { cylY } = KIT;
  const n = P.q ? 36 : 22, roof = T.bustleRoofY;
  P.add('turretDark', cylY(R.columnR + 0.06, R.columnR + 0.08, 0.05, n), R.x, roof + 0.015, R.z);
  P.add('turretDark', cylY(R.columnR - 0.03, R.columnR, R.bottomY - roof + 0.03, n), R.x, (R.bottomY + roof) / 2, R.z);
  const bodyTop = R.topY - R.lipH;
  P.addEquipment('turretDark', cylY(R.r, R.r, bodyTop - R.bottomY, n), R.x, (bodyTop + R.bottomY) / 2, R.z);
  P.addEquipment('turretDark', cylY(R.r + 0.02, R.r + 0.005, R.lipH, n), R.x, bodyTop + R.lipH / 2, R.z);
  for (const dy of [0.05, 0.095, 0.14]) P.add('turretDetail', cylY(R.r + 0.008, R.r + 0.008, 0.02, n), R.x, bodyTop - dy, R.z);
}

/** The sight heads (photo 02: the commander's tall head with its hood on the right, the gunner's on the left), the
 * commander's hatch, the lamp on the right cheek and the whip at the right rear. */
function addRoofKit(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const roof = T.frontRoofY;
  for (const sight of [LVKV_SIGHTS.commander, LVKV_SIGHTS.gunner]) {
    const { x, z, w, d, h } = sight;
    // the head 1.5 cm into the roof, its hood overhanging the window, the window frame and glass on its front
    P.addEquipment('turretEquipment', box(w, h, d), x, roof - 0.015 + h / 2, z);
    P.addEquipment('turretEquipment', box(w + 0.04, 0.04, d + 0.08), x, roof + h - 0.03, z + 0.03);
    P.add('turretDark', box(w - 0.05, h * 0.36, 0.02), x, roof + h * 0.58, z + d / 2 + 0.005);
    P.addModuleVisual('optics', 'turretGlass', box(w - 0.09, h * 0.26, 0.012), x, roof + h * 0.58, z + d / 2 + 0.017);
  }
  // the commander's hatch on the rear section's roof behind his sight
  const hatch = hatchParts(0.25, !!P.q, 1);
  for (const g of hatch.lid) P.addCupola('turret', g, -0.50, T.bustleRoofY - 0.01, -0.47);
  for (const g of hatch.dark) P.add('turretDark', g, -0.50, T.bustleRoofY - 0.01, -0.47);
  // the lamp on the right cheek's wall under the roof edge (photo 02's bright lens), its housing 1 cm into the wall
  const lampX = -(wallX(0.66) + 0.075 - 0.012);
  P.addEquipment('turretEquipment', cylZ(0.075, 0.14, P.q ? 18 : 12), lampX, 0.66, 0.86);
  P.add('turretGlass', cylZ(0.06, 0.012, P.q ? 18 : 12), lampX, 0.66, 0.935);
  // the whip on the rear section's right rear corner
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.30, r: 0.010, seed: 9041 }), -0.84, T.bustleRoofY, -1.02);
}

/** Three 76 mm smoke dischargers a side on the cheeks' walls behind the lamp (photo 02, the dark tubes at the seam): a
 * bracket bar 8 mm into the wall, the tubes splayed out, up and forward with their feet 1 cm into it. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const y = 0.40, tilt = Math.atan2(T.halfWBottom - T.halfWTop, T.frontRoofY - T.roofChamfer - T.floorY);
  for (const s of SIDES) {
    const face = wallX(y) + 0.06 - 0.008;
    P.addEquipment('turretDetail', xform(box(0.06, 0.10, 0.40), 0, 0, 0, 0, 0, s * tilt), s * (face - 0.03), y, 0.58);
    const bore = new THREE.Vector3(s * 0.55, 0.45, 0.70).normalize();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    for (const z of [0.44, 0.58, 0.72]) {
      const foot = new THREE.Vector3(s * face, y, z);
      const tube = foot.clone().addScaledVector(bore, 0.10), mouth = foot.clone().addScaledVector(bore, 0.212);
      P.addEquipment('turretDetail', xform(markSmokeTube(cylZ(0.040, 0.22, P.q ? 12 : 8)), 0, 0, 0, turn.x, turn.y, turn.z),
        tube.x, tube.y, tube.z);
      P.add('turretDark', xform(cylZ(0.032, 0.012, P.q ? 12 : 8), 0, 0, 0, turn.x, turn.y, turn.z), mouth.x, mouth.y, mouth.z);
    }
  }
}

// ------------------------------------------------------------------------ gun --
/** The Bofors (gun-local): the mantlet drum, the cradle's round cover and the v0 radar on it (elevating, not recoiling);
 * the ribbed jacket, the barrel and the flash eliminator (recoiling, each seated into the part behind it). */
function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ, lathe, xform } = KIT;
  const n = P.q ? 28 : 16;
  P.addGunExtra(cylX(G.mantletR, G.mantletHalfW * 2, P.q ? 32 : 20), 0, 0, 0);
  P.addGunExtra(xform(lathe([
    [0.001, G.shroudRearZ], [G.shroudR, G.shroudRearZ], [G.shroudR, G.shroudTaperZ],
    [G.shroudR - 0.03, G.shroudTaperZ + 0.24], [G.shroudFrontR, G.shroudFrontZ], [0.001, G.shroudFrontZ],
  ], n), 0, 0, 0, Math.PI / 2, 0, 0));
  // the v0 radar riding on the cover (the photo's cylinder over the gun), on two brackets
  P.addGunExtra(cylZ(0.065, 0.34, P.q ? 18 : 12), -0.10, 0.29, 1.08);
  P.addGunExtra(cylZ(0.035, 0.05, P.q ? 18 : 12, 0.065), -0.10, 0.29, 1.275);
  for (const z of [0.98, 1.08]) P.addGunExtra(box(0.05, 0.10, 0.05), -0.10, 0.215, z);
  // the recoiling tube: the ribbed jacket out of the cover, the barrel from inside the cover, the slotted flash eliminator
  const jacketLen = G.jacketFrontZ - G.jacketRearZ;
  P.add('gun', cylZ(G.jacketR, jacketLen, n), 0, 0, (G.jacketFrontZ + G.jacketRearZ) / 2);
  for (let k = 0; k < 4; k++) P.add('gun', cylZ(G.ribR, 0.024, n), 0, 0, G.jacketRearZ + 0.10 + k * 0.058);
  const barrelLen = G.deviceRearZ + 0.02 - G.barrelRearZ;
  P.add('gun', cylZ(G.barrelFrontR, barrelLen, n, G.barrelR), 0, 0, G.barrelRearZ + barrelLen / 2);
  const deviceLen = LVKV_MUZZLE_Z - G.deviceRearZ;
  P.add('gun', cylZ(G.deviceR, deviceLen, n, G.deviceRearR), 0, 0, G.deviceRearZ + deviceLen / 2);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('gunDark', xform(box(0.016, 0.010, 0.13), 0, 0, 0, 0, 0, a),
      -Math.sin(a) * (G.deviceR - 0.002), Math.cos(a) * (G.deviceR - 0.002), LVKV_MUZZLE_Z - 0.10);
  }
  P.muzzleZ = LVKV_MUZZLE_Z;
}

export function buildLvkv9040(P: TankBuilderPort): void {
  // the CV90 Mk IV's own hull and running gear, its turret left off (the owner 2026-11-03)
  buildCv90MkivX(P, { hullOnly: true });
  const [tx, ty, tz] = P.spec.armor.turretPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(...LVKV_TRUNNION);
  addTurretBody(P);
  addSearchRadar(P);
  addRoofKit(P);
  addSmokeDischargers(P);
  addGun(P);
  P.topY = R.topY;
}

export const LVKV9040_PROFILES = {
  lvkv9040: { build: buildLvkv9040 },
} as const;
