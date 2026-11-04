// Lvkv 9040 (release 269, builder S; the owner 2026-11-03: "also add ... LVKV 9040 (swedish)", then "also based the lvkv
// 9040 on the correct cv9040 mk 4 hull"): the Swedish Luftvärnskanonvagn 9040's turret on the fleet's CV90 Mk IV hull and
// running gear (profiles/cv90MkivSourceX.ts, called with its default-off `hullOnly`, so it draws no turret), the turret
// built from the owner's photograph (photos 01-02: the vehicle's right side, winter 2005, on the early hull) and the
// published figures (docs/references/tanks/lvkv9040.md):
//   - a welded turret larger than the Strf 9040's: a full-width low rear section, a taller front section whose sloped
//     front plate runs down over the driver's hatch, and between the front section's cheeks the slot the gun elevates in;
//   - ONE 40 mm Bofors L/70 on a mantlet drum in that slot: the cradle's cover one long cone out of the front plate, the
//     ribbed jacket, the long barrel and its short flared tip, the sight pod riding on the cover;
//   - the PS-95 search radar's drum (Thomson-CSF Harfang) raised on its column over the rear section's left side, the
//     three bands round its rolled top;
//   - the commander's tall sight head on the right of the front roof and the gunner's hooded sight on the left, the
//     commander's hatch behind his sight, a lamp set into the right cheek's front face, three smoke dischargers a side.
// Every datum the combat record shares is in profiles/lvkv9040Frame.ts (lvkv9040Specs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
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
 * The PS-95 drum (photo 02; fix round 1, the blind critic): low on a dark base nearly its own width, a turntable plate on
 * the roof, a core and a ring of eight posts with daylight between them up into its floor; the radome's top edge rounded,
 * the three bands under it (round 2: the mast beside it, in no photograph, gone).
 */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, cylY, torus } = KIT;
  const n = P.q ? 36 : 22, roof = T.bustleRoofY, postH = R.bottomY - roof + 0.04;
  P.add('turretDark', cylY(R.baseR - 0.02, R.baseR, 0.04, n), R.x, roof + 0.01, R.z);
  P.add('turretDark', cylY(0.16, 0.16, postH, P.q ? 20 : 12), R.x, roof + postH / 2, R.z);
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * Math.PI / 4;
    P.add('turretDark', box(0.07, postH, 0.07), R.x + Math.cos(a) * R.postR, roof + postH / 2, R.z + Math.sin(a) * R.postR, 0, -a, 0);
  }
  const rimY = R.topY - R.rimR;
  P.addEquipment('turretDark', cylY(R.r, R.r, rimY - R.bottomY, n), R.x, (rimY + R.bottomY) / 2, R.z);
  P.addEquipment('turretDark', torus(R.r - R.rimR, R.rimR, n, P.q ? 10 : 6), R.x, rimY, R.z);
  P.addEquipment('turretDark', cylY(R.r - R.rimR, R.r - R.rimR, 0.04, n), R.x, R.topY - 0.025, R.z);
  for (const dy of [0.05, 0.095, 0.14]) P.add('turretDetail', cylY(R.r + 0.008, R.r + 0.008, 0.02, n), R.x, rimY - dy, R.z);
}

/** The sight heads (photos 01-02; fix round 1, the blind critic): the commander's chunky head on the right, its front
 * raked back under a lid jutting forward, a large window in it; the gunner's on the left an open sight under a flat hood
 * plate on two cheeks and a back plate. The commander's hatch and the lamp in the right cheek's front face. */
function addRoofKit(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const roof = T.frontRoofY;
  {
    const { x, z, w, d, h } = LVKV_SIGHTS.commander, rake = 0.14, foot = roof - 0.015, top = roof + h;
    P.addEquipment('turretEquipment', convex(mirror([
      [w / 2, foot, z - d / 2], [w / 2, top, z - d / 2], [w / 2, foot, z + d / 2], [w / 2, top, z + d / 2 - rake],
    ] as P3[], 1).concat(mirror([
      [w / 2, foot, z - d / 2], [w / 2, top, z - d / 2], [w / 2, foot, z + d / 2], [w / 2, top, z + d / 2 - rake],
    ] as P3[], -1)).map(([px, py, pz]) => [px + x, py, pz] as P3)));
    // the lid: 1 cm into the head's top, jutting 0.17 m past the raked face's top edge
    P.addEquipment('turretEquipment', box(w + 0.04, 0.035, d + 0.04), x, top + 0.0075, z + 0.03);
    const a = Math.atan2(rake, top - foot), wy = foot + (top - foot) * 0.48, wz = z + d / 2 - rake * 0.48;
    const nz = Math.cos(a), ny = Math.sin(a);
    P.add('turretDark', xform(box(w - 0.06, h * 0.50, 0.02), 0, 0, 0, -a, 0, 0), x, wy - ny * 0.005, wz + nz * -0.005);
    P.addModuleVisual('optics', 'turretGlass', xform(box(w - 0.10, h * 0.40, 0.012), 0, 0, 0, -a, 0, 0),
      x, wy + ny * 0.009, wz + nz * 0.009);
  }
  {
    const { x, z, w, d, h } = LVKV_SIGHTS.gunner, foot = roof - 0.015;
    for (const s of SIDES) P.addEquipment('turretEquipment', box(0.03, h + 0.015, d), x + s * (w / 2 - 0.015), foot + (h + 0.015) / 2, z);
    P.addEquipment('turretEquipment', box(w, h + 0.015, 0.03), x, foot + (h + 0.015) / 2, z - d / 2 + 0.015);
    P.addEquipment('turretEquipment', box(w + 0.06, 0.03, d + 0.10), x, roof + h + 0.005, z + 0.04);
    // the sight itself under the hood, low and back, its window forward
    P.addEquipment('turretEquipment', box(w - 0.10, h * 0.50, d * 0.55), x, foot + h * 0.25, z - d * 0.20);
    P.add('turretDark', box(w - 0.14, h * 0.26, 0.02), x, foot + h * 0.29, z - d * 0.20 + d * 0.275 + 0.005);
    P.addModuleVisual('optics', 'turretGlass', box(w - 0.17, h * 0.18, 0.012), x, foot + h * 0.29, z - d * 0.20 + d * 0.275 + 0.017);
  }
  // the commander's hatch on the rear section's roof behind his sight
  const hatch = hatchParts(0.25, !!P.q, 1);
  for (const g of hatch.lid) P.addCupola('turret', g, -0.50, T.bustleRoofY - 0.01, -0.47);
  for (const g of hatch.dark) P.add('turretDark', g, -0.50, T.bustleRoofY - 0.01, -0.47);
  // the lamp set into the upper rear corner of the right cheek's sloped front face (photo 02's bright lens; fix round 2, the
  // A/B judge), its housing along the face's normal, 3 cm into it; the face from the cheek's corners (addTurretBody)
  const A = new THREE.Vector3(-T.halfWTop, T.frontRoofY - T.roofChamfer, T.roofFrontZ - 0.08);
  const B = new THREE.Vector3(-T.halfWBottom, T.floorY, T.roofFrontZ + 0.24), C = new THREE.Vector3(-T.footHalfW, T.footY, T.footZ);
  const normal = new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A)).normalize();
  const at = A.clone().multiplyScalar(0.80).addScaledVector(B, 0.06).addScaledVector(C, 0.14);
  const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal));
  const housing = at.clone().addScaledVector(normal, 0.02), lens = at.clone().addScaledVector(normal, 0.071);
  P.addEquipment('turretEquipment', xform(cylZ(0.07, 0.10, P.q ? 18 : 12), 0, 0, 0, turn.x, turn.y, turn.z), housing.x, housing.y, housing.z);
  P.add('turretGlass', xform(cylZ(0.056, 0.012, P.q ? 18 : 12), 0, 0, 0, turn.x, turn.y, turn.z), lens.x, lens.y, lens.z);
  // (round 2, the A/B judge: the rear rack and the whip show in no photograph; gone)
}

/** Three 76 mm smoke dischargers a side in a cluster on the front section's side panel behind the cheeks (photo 02's dark
 * round tubes facing forward; fix round 2, the A/B judge: 0.35 m further back, round and forward): a block 8 mm into the
 * wall, the three tubes in a triangle facing forward, a little out and up, their feet 1 cm into it. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const y = 0.47, z = 0.14, len = 0.26, tilt = Math.atan2(T.halfWBottom - T.halfWTop, T.frontRoofY - T.roofChamfer - T.floorY);
  const up = new THREE.Vector3(0, 1, 0);
  for (const s of SIDES) {
    const wall = wallX(y);
    P.addEquipment('turretDetail', xform(box(0.20, 0.20, 0.12), 0, 0, 0, 0, 0, s * tilt), s * (wall + 0.092), y, z - 0.05);
    const bore = new THREE.Vector3(s * 0.22, 0.18, 0.96).normalize();
    const u = new THREE.Vector3().crossVectors(up, bore).normalize().multiplyScalar(s);
    const v = new THREE.Vector3().crossVectors(bore, u).normalize().multiplyScalar(s);
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    const centre = new THREE.Vector3(s * (wall + 0.10), y, z);
    for (const [du, dv] of [[-0.048, -0.042], [0.048, -0.042], [0, 0.042]] as const) {
      const foot = centre.clone().addScaledVector(u, du).addScaledVector(v, dv);
      const tube = foot.clone().addScaledVector(bore, len / 2), mouth = foot.clone().addScaledVector(bore, len - 0.005);
      P.addEquipment('turretDetail', xform(markSmokeTube(cylZ(0.045, len, P.q ? 14 : 10)), 0, 0, 0, turn.x, turn.y, turn.z),
        tube.x, tube.y, tube.z);
      P.add('turretDark', xform(cylZ(0.036, 0.012, P.q ? 14 : 10), 0, 0, 0, turn.x, turn.y, turn.z), mouth.x, mouth.y, mouth.z);
    }
  }
}

// ------------------------------------------------------------------------ gun --
/** The Bofors (gun-local; fix rounds 1 and 2, the critics, photos 01-02): the mantlet drum, the cradle's cover one long
 * cone from the turret face into the ribs, its sight pod near the face (one fat tube with a rounded rear on two thin legs,
 * daylight under it) (elevating, not recoiling); the band of eight ribs, the barrel and the short flared tip (recoiling,
 * each seated into the part behind it). */
function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ, lathe, sph, xform } = KIT;
  const n = P.q ? 28 : 16;
  P.addGunExtra(cylX(G.mantletR, G.mantletHalfW * 2, P.q ? 32 : 20), 0, 0, 0);
  P.addGunExtra(xform(lathe([
    [0.001, G.coneRearZ], [G.coneRearR, G.coneRearZ], [G.coneFrontR, G.coneFrontZ], [0.001, G.coneFrontZ],
  ], n), 0, 0, 0, Math.PI / 2, 0, 0));
  // the sight pod on the cone's top right near the face (0.38 m long, 0.15 m thick): two thin legs from 1 cm inside the
  // cone up 1 cm into the pod, the pod's front face dark, its rear a half sphere
  const podX = -0.08, podY = 0.30, podR = 0.075, podZ0 = 0.38, podZ1 = 0.70;
  for (const z of [0.44, 0.63]) {
    const coneR = G.coneRearR + (G.coneFrontR - G.coneRearR) * (z - G.coneRearZ) / (G.coneFrontZ - G.coneRearZ);
    const foot = Math.sqrt(coneR * coneR - podX * podX) - 0.01, top = podY - podR + 0.01;
    P.addGunExtra(box(0.03, top - foot, 0.03), podX, (top + foot) / 2, z);
  }
  P.addGunExtra(cylZ(podR, podZ1 - podZ0, P.q ? 18 : 12), podX, podY, (podZ0 + podZ1) / 2);
  P.addGunExtra(xform(sph(podR, P.q ? 18 : 12, Math.PI / 2), 0, 0, 0, -Math.PI / 2, 0, 0), podX, podY, podZ0);
  P.addGunExtraDark(cylZ(podR - 0.012, 0.012, P.q ? 18 : 12), podX, podY, podZ1 + 0.002);
  // the recoiling tube: the rib band out of the cone, the barrel from inside the cone, the flared tip
  const ribsLen = G.ribsFrontZ - G.ribsRearZ;
  P.add('gun', cylZ(G.ribsCoreR, ribsLen, n), 0, 0, (G.ribsFrontZ + G.ribsRearZ) / 2);
  const pitch = (ribsLen - 0.08) / (G.ribCount - 1);
  for (let k = 0; k < G.ribCount; k++) P.add('gun', cylZ(G.ribR, 0.022, n), 0, 0, G.ribsRearZ + 0.06 + k * pitch);
  const barrelLen = G.tipRearZ + 0.02 - G.barrelRearZ;
  P.add('gun', cylZ(G.barrelFrontR, barrelLen, n, G.barrelR), 0, 0, G.barrelRearZ + barrelLen / 2);
  const tipLen = LVKV_MUZZLE_Z - G.tipRearZ;
  P.add('gun', cylZ(G.tipR, tipLen, n, G.tipRearR), 0, 0, G.tipRearZ + tipLen / 2);
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
