// BMPT T-90 weapon module: the Ob'yekt 199 "Ramka" Terminator station on the T-90M X hull (profiles/afvFamily.ts
// buildBMPTT90 clears the X turret, then calls this). 267 (lane t90-family-267, both 266 critics: "the weapon module
// lacks the tall hammerhead with high armoured missile boxes"): a low octagonal turret base, a narrow waist, the tall
// armoured head flaring out over it (the hammerhead), the twin 2A42 30 mm cannons high in one elevating armoured
// casing between trunnion brackets on the head's sloped front, the two long armoured Ataka launcher boxes standing on
// pivot shafts off the head's flanks with their tops at the crown, and the commander's panoramic sight on its tall
// armoured housing at the rear right with the gunner's sight mast on the left (the 2018 serial's parade photographs).
//
// Combat wiring kept: the turret ring seat (turretG at the T-90A's [0, 1.374, 0.15]), the twin bores at x ±0.20 on
// their own recoil groups (spec.gun.muzzles, recoilRig.selftest.mjs), the muzzle station 3.366 and eight Ataka tubes
// (guidedLauncherTubes.selftest.mjs). The trunnion now stands at the head's crown, so the measured combat frame
// (t90MarkFrames.ts) and the eight launch exits (fleetLauncherMuzzles.ts) carry this file's numbers.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { weaponAssembly } from './weaponStock.ts';

type P3 = readonly [number, number, number];

// Turret-local authoring frame (the installed size policy scales it by 1.05 afterwards).
const ROOF_Y = 0.96;                 // the head's flat rear deck: the drone dock's four measured feet stand on it
const BASE_TOP_Y = 0.18, HEAD_W = 0.68, FLARE_Y = 0.56, HEAD_BOTTOM_Y = 0.40, WAIST_W = 0.40;
const HEAD_REAR_Z = -0.80, ROOF_FRONT_Z = 0.27, NOSE_Z = 0.70, NOSE_Y = 0.58, CHIN_Z = 0.45;
const GLACIS_SLOPE = (ROOF_Y - NOSE_Y) / (NOSE_Z - ROOF_FRONT_Z);
const BMPT_T90_TRUNNION = Object.freeze({ y: 1.00, z: 0.55 });
// Ataka launcher boxes: centre line, section and length; tube columns and rows inside each box.
const BOX = Object.freeze({ x: 0.95, w: 0.42, y: 0.85, h: 0.34, rearZ: -0.45, frontZ: 1.65 });
const TUBE_X = [0.85, 1.05] as const, TUBE_Y = [0.77, 0.93] as const, TUBE_R = 0.07;
const LAUNCH_FACE_Z = 1.695;         // the front cover's terminal discs (fleetLauncherMuzzles.ts bmpt_t90)

function hull(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

const mirrored = (points: readonly P3[]): P3[] => points.flatMap(([x, y, z]) => [[-x, y, z], [x, y, z]] as P3[]);

function octagon(apothem: number, y: number): P3[] {
  const r = apothem / Math.cos(Math.PI / 8);
  return Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + k * Math.PI / 4;
    return [r * Math.sin(a), y, r * Math.cos(a)] as P3;
  });
}

/** Counter-clockwise box section with chamfered top corners (viewed from +Z). */
function chamferedSection(w: number, bottom: number, top: number, chamfer: number): SectionPoint[] {
  return [[-w, bottom], [w, bottom], [w, top - chamfer], [w - chamfer, top], [-(w - chamfer), top], [-w, top - chamfer]];
}

const glacisY = (z: number): number => ROOF_Y - GLACIS_SLOPE * (z - ROOF_FRONT_Z);

function addStationBody(P: TankBuilderPort): void {
  const { cylY } = KIT;
  // Ring collar on the hull's race (its foot stays 45 mm into the source-X T-90M deck, as before), then the low
  // octagonal turret base with raked faces all round.
  P.add('turret', cylY(0.90, 0.92, 0.12, 32), 0, -0.02, 0);
  P.add('turret', hull([...octagon(0.95, 0.02), ...octagon(0.84, BASE_TOP_Y)]));
  // The narrow waist: a slab-sided pedestal, its walls leaning in, buried into the base and into the head.
  P.add('turret', hull(mirrored([
    [0.46, BASE_TOP_Y - 0.02, -0.72], [0.46, BASE_TOP_Y - 0.02, 0.48],
    [WAIST_W, HEAD_BOTTOM_Y + 0.02, -0.66], [WAIST_W, HEAD_BOTTOM_Y + 0.02, 0.42],
  ])));
  // The hammerhead: welded flanks flaring out from the waist to the full head width, vertical upper walls, the flat
  // rear deck, the sloped front glacis under the cannon casing and the chin running back into the waist.
  P.add('turret', hull(mirrored([
    [HEAD_W, ROOF_Y, HEAD_REAR_Z], [HEAD_W, FLARE_Y, HEAD_REAR_Z], [WAIST_W, HEAD_BOTTOM_Y, HEAD_REAR_Z + 0.10],
    [HEAD_W, ROOF_Y, ROOF_FRONT_Z], [HEAD_W, NOSE_Y, NOSE_Z], [WAIST_W, HEAD_BOTTOM_Y, CHIN_Z],
  ])));
  // Trunnion brackets: two armoured cheeks rising off the glacis either side of the casing, round over the pins.
  for (const side of [-1, 1]) {
    const profile: Array<readonly [number, number]> = [
      [0.80, 0.36], [0.60, 0.64], [0.92, 0.665], [1.00, 0.67], [1.08, 0.64], [1.115, 0.55], [1.08, 0.46], [1.00, 0.43],
    ];
    P.add('turret', hull(profile.flatMap(([y, z]) => [[side * 0.385, y, z], [side * 0.475, y, z]] as P3[])));
    P.add('turretDetail', KIT.cylX(0.085, 0.04, 20), side * 0.49, BMPT_T90_TRUNNION.y, BMPT_T90_TRUNNION.z);
    P.add('turretDark', KIT.cylX(0.040, 0.02, 12), side * 0.515, BMPT_T90_TRUNNION.y, BMPT_T90_TRUNNION.z);
  }
}

function addCannonPlant(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  // Common armoured casing over both receivers. Its rear is a drum on the trunnion axis, so elevation turns it in
  // its own envelope; the glacis stays 0.21 m off the axis and the casing reaches 0.13 m below it.
  P.addGunExtra(cylX(0.13, 0.72, 24), 0, 0, 0);
  P.addGunExtra(sectionSolid([
    { z: 0, ring: chamferedSection(0.36, -0.13, 0.13, 0.05) },
    { z: 0.90, ring: chamferedSection(0.31, -0.10, 0.06, 0.04) },
  ]), 0, 0, 0);
  P.addGunExtra(box(0.64, 0.18, 0.04), 0, -0.02, 0.90);                    // front mantlet plate
  P.addGunExtraDark(cylX(0.045, 0.98, 12), 0, 0, 0);                       // trunnion pins through both brackets
  const lidPitch = Math.atan2(0.07, 0.90);
  const lid = KIT.xform(box(0.44, 0.012, 0.50), 0, 0, 0, lidPitch, 0, 0);
  P.addGunExtra(lid, 0, 0.13 - Math.tan(lidPitch) * 0.40 + 0.003, 0.40);   // receiver access lid on the sloped top
  for (const hx of [-0.14, 0.14]) {
    P.addGunExtraDark(cylX(0.012, 0.09, 8), hx, 0.13 - Math.tan(lidPitch) * 0.14 + 0.008, 0.14);  // lid hinges
  }
  for (const side of [-1, 1]) {
    const barrel = side < 0 ? 0 : 1;
    P.addGunExtra(cylZ(0.072, 0.08, 16), side * 0.20, 0, 0.95);           // barrel port boss on the mantlet plate
    P.add(`gunBarrel${barrel}`, cylZ(0.050, 0.60, 12), side * 0.20, 0, 1.00);
    P.add(`gunBarrel${barrel}`, cylZ(0.041, 2.55, 12), side * 0.20, 0, 1.88);
    P.add(`gunBarrel${barrel}Dark`, cylZ(0.058, 0.20, 12), side * 0.20, 0, 3.24);
    P.add(`gunBarrel${barrel}Dark`, cylZ(0.022, 0.026, 12), side * 0.20, 0, 3.353);
  }
  // VH.04 (2026-10-15): the muzzle anchor is the twin barrels' mouth face (3.366), not 4 mm in front of it
  P.muzzleZ = 3.366;
}

function addAtakaLaunchers(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  const length = BOX.frontZ - BOX.rearZ, midZ = (BOX.frontZ + BOX.rearZ) / 2;
  for (const side of [-1, 1]) {
    const cx = side * BOX.x;
    // Elevating pivot shaft from the head's flank (a flange on the wall) into the box's inner face.
    P.addEquipment('turret', box(0.04, 0.26, 0.32), side * (HEAD_W + 0.015), BOX.y, 0.05);
    P.addEquipment('turret', cylX(0.085, 0.16, 18), side * 0.71, BOX.y, 0.05);
    // The armoured box, its raised top plate, the hinged front cover and the hinge knuckles.
    const shell = box(BOX.w, BOX.h, length);
    shell.userData.rangeSilhouette = true;
    P.addEquipment('turret', shell, cx, BOX.y, midZ);
    P.addEquipment('turret', box(BOX.w - 0.06, 0.025, length - 0.30), cx, BOX.y + BOX.h / 2 + 0.005, midZ - 0.05);
    P.addEquipment('turret', box(BOX.w + 0.02, BOX.h + 0.02, 0.04), cx, BOX.y, BOX.frontZ + 0.01);
    for (const dx of [-0.14, 0.14]) {
      P.add('turretDark', cylX(0.022, 0.10, 10), cx + dx, BOX.y + BOX.h / 2 + 0.012, BOX.frontZ + 0.012);
    }
    // two clamp bands round the box
    for (const z of [0.20, 1.05]) P.addEquipment('turret', box(BOX.w + 0.02, BOX.h + 0.02, 0.06), cx, BOX.y, z);
    for (const tx of TUBE_X) for (const ty of TUBE_Y) {
      // the frangible disc over each tube's mouth on the cover: the launch exit
      P.add('turretDark', cylZ(TUBE_R - 0.014, 0.020, 16), side * tx, ty, LAUNCH_FACE_Z - 0.010);
      // the tube's tail standing out of the open rear with its end cap
      P.add('turretDetail', cylZ(TUBE_R, 0.08, 16), side * tx, ty, BOX.rearZ - 0.03);
      P.add('turretDetail', cylZ(TUBE_R - 0.007, 0.015, 16), side * tx, ty, BOX.rearZ - 0.075);
    }
  }
  // guided-load rule (owner 2026-09-18): the spec's Ataka load is at least one round per tube — the profile publishes its
  // tube census for guidedLauncherTubes.selftest
  P.turretG.userData.launcherTubes = TUBE_X.length * TUBE_Y.length * 2;
}

function addStationArmour(P: TankBuilderPort): void {
  const { box } = KIT;
  const rake = Math.atan(GLACIS_SLOPE), ny = Math.cos(rake), nz = Math.sin(rake);
  for (const side of [-1, 1]) {
    const suffix = side > 0 ? 'R' : 'L';
    // K-5 class bricks on the glacis either side of the trunnion brackets (the front cheeks' reactive field).
    P.visualEraCluster(`turret_era_${suffix}`, 'turret', () => {
      for (const z of [0.40, 0.56]) {
        P.add('turret', box(0.16, 0.075, 0.17), side * 0.585, glacisY(z) + ny * 0.0325, z + nz * 0.0325, rake, 0, 0);
      }
    });
    // Flat reactive tiles along each launcher box's outer face (the station's flank field).
    P.visualEraCluster(`side_era_${suffix}`, 'turret', () => {
      for (const z of [-0.24, 0.42, 0.80]) {
        P.add('turret', box(0.05, 0.26, 0.34), side * (BOX.x + BOX.w / 2 + 0.015), BOX.y, z);
        P.add('turretDark', box(0.035, 0.012, 0.28), side * (BOX.x + BOX.w / 2 + 0.015), BOX.y + 0.133, z);
      }
    });
  }
}

function addSightsAndKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // The commander sits on the right (-x, the T-90's cupola side) and the gunner on the left, as the rear photographs
  // show. Commander: the panoramic sight's tall armoured housing over the head's rear right corner (strap hinges on its
  // rear door), then the big drum head with its window and cap, the station's highest point. It stands outboard and aft
  // of the drone dock's quadcopter and its takeoff column (x -0.51..0.19, z -0.49..0.21 over y 1.29).
  const housing = box(0.40, 0.72, 0.40);
  housing.userData.rangeSilhouette = true;
  P.addEquipment('turret', housing, -0.55, 0.97, -0.70);
  for (const y of [0.74, 0.97, 1.20]) P.add('turretDark', box(0.12, 0.035, 0.015), -0.63, y, -0.903);
  P.add('turretDark', box(0.02, 0.12, 0.03), -0.40, 0.97, -0.91);
  const drum = cylY(0.20, 0.20, 0.30, 28);
  drum.userData.rangeSilhouette = true;
  P.addEquipment('turret', drum, -0.55, 1.47, -0.70);
  P.addEquipment('turret', cylY(0.205, 0.20, 0.035, 28), -0.55, 1.635, -0.70);
  // its window looks forward and out to the right, over the right launcher box
  P.add('turretGlass', box(0.16, 0.10, 0.04), -0.65, 1.47, -0.527, 0, -Math.PI / 6, 0);
  // Gunner: the sight block on the deck's left rear (its forward window, the round lamp on its back), and the sensor
  // mast standing off it.
  P.addEquipment('turret', box(0.34, 0.28, 0.32), 0.49, 1.09, -0.56);
  P.add('turretGlass', box(0.14, 0.08, 0.02), 0.49, 1.12, -0.395);
  P.addEquipment('turret', cylZ(0.08, 0.06, 18), 0.52, 1.08, -0.73);
  P.add('turretGlass', box(0.09, 0.05, 0.012), 0.52, 1.08, -0.762);
  P.addEquipment('turret', box(0.08, 0.30, 0.08), 0.42, 1.37, -0.60);
  P.addEquipment('turret', box(0.12, 0.12, 0.15), 0.42, 1.55, -0.585);
  P.add('turretGlass', box(0.08, 0.05, 0.015), 0.42, 1.555, -0.508);
  // Rear stowage box on the head's back wall between the two sight housings: lid, two latches, hinge rod.
  P.addEquipment('turret', box(0.54, 0.28, 0.22), 0.02, 0.77, -0.905);
  P.addEquipment('turret', box(0.56, 0.025, 0.24), 0.02, 0.917, -0.905);
  for (const x of [-0.16, 0.20]) P.add('turretDark', box(0.05, 0.07, 0.014), x, 0.84, -1.018);
  P.add('turretDark', KIT.cylX(0.010, 0.50, 8), 0.02, 0.925, -0.795);
  // Service plate on the deck (clear of the drone dock's feet and its takeoff column).
  P.add('turretDetail', box(0.26, 0.012, 0.34), -0.27, ROOF_Y + 0.004, 0.06);
  // Smoke dischargers on the deck's front corners, firing forward, outward and up over the launcher boxes.
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.18, 0.05, 0.12), side * 0.575, ROOF_Y + 0.015, 0.11, 0, side * 0.30, 0);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.040, len: 0.22, spacing: 0.095,
      splay: side * 0.60, pitch: -0.42, arc: 0.25, slot: 'detail', seed: 3830 + (side > 0 ? 1 : 0),
    }), side * 0.585, ROOF_Y + 0.06, 0.12);
  }
  // Whips: a tall one on the gunner's sight block, a short one beside the panoramic housing.
  for (const [x, y, z, h, seed] of [[0.60, 1.23, -0.66, 0.85, 3820], [-0.17, ROOF_Y, -0.70, 0.66, 3821]] as const) {
    P.add('turretDetail', cylY(0.040, 0.048, 0.05, 12), x, y + 0.02, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.011, rake: x > 0 ? -0.04 : 0.04, seed }),
      x, y + 0.04, z);
  }
  // the station number on the left launcher box's outer face, ahead of its reactive tiles
  P.decal('turret', 'number', 'BMPT-90', 0.19, [BOX.x + BOX.w / 2 + 0.005, BOX.y, 1.35], Math.PI / 2);
}

/** The Terminator station on a cleared turret rig (the caller clears the donor's turret and gun buckets first). */
export function buildTerminatorT90Station(P: TankBuilderPort): void {
  // Deterministic rig seats (§5.361 rig-anchor law: the ring rides turretPivot): the turntable's foot (local -0.08)
  // stays 45 mm into the source-X T-90M deck (1.339 m); the trunnion stands at the head's crown.
  P.turretG.scale.set(1, 1, 1);
  P.gunG.scale.set(1, 1, 1);
  P.turretG.position.set(0, 1.374, 0.15);
  P.gunG.position.set(0, BMPT_T90_TRUNNION.y, BMPT_T90_TRUNNION.z);
  addStationBody(P);
  addCannonPlant(P);
  // VH.14 (coordinator ruling 2026-10-14): the real BMPT carries two 2A42, four Ataka and a coaxial PKTM and no roof
  // machine gun (roofWeaponPolicy.ts).
  weaponAssembly(P, () => addAtakaLaunchers(P));
  addStationArmour(P);
  addSightsAndKit(P);
  P.topY = Math.max(P.topY || 0, 1.6525);
}
