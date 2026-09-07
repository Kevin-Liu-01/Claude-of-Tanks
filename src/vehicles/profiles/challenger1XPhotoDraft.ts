// HISTORICAL PHOTO DRAFT — isolated unit-only regression fixture.
// Superseded by the owner's supplied-file target. No runtime fleet loader may
// import this module; its tests are not current Challenger shape acceptance.
// Original independently authored MoD drawing/photo reconstruction follows.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { addChallenger1XRearEquipment } from './challenger1XRearEquipment.ts';
import { addChallenger1XDeckFittings, addChallenger1XLouvreBanks } from './challenger1XDeckFittings.ts';
import { addChallenger1XFrontCaps, addChallenger1XBowHooks } from './challenger1XFrontFittings.ts';
import { challenger1PhotoWheelSolids } from './challenger1XWheels.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Strip = readonly [z: number, left: number, right: number, low: number, high: number];

export const CHALLENGER1_X_DATUMS = Object.freeze({
  challenger1_x: {
    // Handbook xiii fixes overall/width/hood. Hull and armor roof are inferred
    // separately; its 9.80 m "gun in crutch" is emphatically NOT hull length.
    dims: { hullLengthM: 8.39, overallLengthM: 11.56, widthM: 3.51, heightM: 2.50 },
    structuralRoofY: 2.50, fixedOpticHeightM: 2.95, highestFittingM: 4.11,
    turretPivot: [0, 1.70, .54] as Point,
    trunnion: [0, 2.10, 1.69] as Point,
    muzzleZ: 7.365,
  },
});
const D = CHALLENGER1_X_DATUMS.challenger1_x;

function local(g: THREE.BufferGeometry, p: Point): THREE.BufferGeometry {
  return g.translate(-p[0], -p[1], -p[2]);
}

function strip(rows: readonly Strip[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, a, b, low, high]) => ({ z,
    ring: [[a, low], [b, low], [b, high], [a, high]],
  })));
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x, y - D.turretPivot[1], z - D.turretPivot[2], rx, ry, rz);
}

function hull(P: TankBuilderPort): void {
  const rows = [[-4.13, 1.46, 1.00, 1.70], [-3.47, 1.47, .57, 1.80],
    [-2.72, 1.47, .50, 1.81], [-1.20, 1.45, .50, 1.76],
    [.74, 1.45, .50, 1.69], [2.10, 1.41, .50, 1.64],
    [2.95, 1.07, .54, 1.385], [3.72, 1.03, .92, 1.20],
    [4.13, 1.02, 1.035, 1.17]];
  const sections: SolidSection[] = rows.map(([z, w, low, top]) => {
    const bay = Math.min(1.36, top - .040);
    return { z, ring: [[-.98, low], [.98, low], [1.02, low + .05],
      [1.02, bay], [w, top - .035], [w, top], [-w, top], [-w, top - .035],
      [-1.02, bay], [-1.02, low + .05]] };
  });
  P.add('hull', sectionSolid(sections));
  P.add('hull', cylY(.885, .885, .115, 48), 0, 1.735, .54);
  for (const side of [-1, 1]) {
    const a = side < 0 ? -1.61 : .30, b = side < 0 ? -.30 : 1.61;
    // Two raised glacis shoulders flank a real lower driver channel.
    P.add('hull', strip([[1.81, a, b, 1.56, 1.80],
      [2.70, a, b, 1.365, 1.55], [3.58, a, b, 1.20, 1.34]]));
  }
}

function runningGear(P: TankBuilderPort): void {
  const wheel=challenger1PhotoWheelSolids();
  const zs = [-2.18, -1.385, -.59, .59, 1.385, 2.18];
  const rollers = [-2.13, -.76, .76, 2.13].map(z => ({ z, y: 1.055, r: .092 }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .395, wheelW: .39, wheelY: .470,
    wheelTireInnerRadiusM:.369,
    wheelCoreGeometry:{disc:wheel.core},
    wheelFaceLayers:[{geometry:wheel.shoulder,material:P.mats.rubber,
      name:'challenger1PhotoWheelRubberShoulders',appearanceRole:'wheelTire'}],
    wheelZs: zs, xc: 1.385, trackW: .650, trackTh: .024, botY: .0515, topY: 1.203,
    linkPitchM: .1715, // 92 shoes per side, as listed in the original handbook.
    trackShoeDimensions: { padHeight: .029, grouserHeight: .013, webHeight: .030, hornHeight: .095 },
    sprocket: { z: -3.33, y: .848, r: .347, trackR: .322 },
    idler: { z: 3.36, y: .866, r: .31, trackR: .292 },
    rollers, returnRollerWidthM: .23, returnRollerInsetM: .09,
    contactZF: 2.395, contactZR: -2.395,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { z: 3.36, y: .866, r: .292 }, sprocket: { z: -3.33, y: .848, r: .322 },
      contact: { zF: 2.395, zR: -2.395 }, botY: .0515, topY: 1.203, sag: .022,
      supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .012 })),
    }), .0515, .40),
    rigidLinkChords: true, arms: true, coveredTop: true, paintedEnds: true,
  });
}

function skirt(P: TankBuilderPort, side: number): void {
  const x = side * 1.739;
  const panels = [[-3.48, -2.39, 1.00, .79], [-2.365, -1.02, .79, .79],
    [-.995, .39, .79, .79], [.415, 1.77, .79, .79], [1.795, 3.37, .79, 1.04]];
  for (const [back, front, lowA, lowB] of panels) {
    P.addExternalArmor('hull', strip([[back, x - .016, x + .016, lowA, 1.52],
      [front, x - .016, x + .016, lowB, 1.52]]));
    for (const z of [back + .055, front - .055]) {
      P.addEquipment('hullDetail', box(.045, .055, .062), x, 1.548, z);
      P.addEquipment('hullDetail', cylX(.013, .012, 8), side * 1.756, 1.492, z);
      P.addEquipment('hullDetail', box(.30, .027, .046), side * 1.58, 1.437, z);
    }
  }
  P.add('hull', box(.18, .06, 6.73), side * 1.60, 1.563, -.10);
  const a = Math.min(side * 1.03, side * 1.735), b = Math.max(side * 1.03, side * 1.735);
  addChallenger1XFrontCaps(P, side);
  P.addMudguard(`challenger1_x_rear_guard_${side}`, 'hullDetail', strip([
    [-4.195, a, b, 1.285, 1.325], [-3.85, a, b, 1.373, 1.413],
    [-3.28, a, b, 1.500, 1.540],
  ]));
  P.addMudguard(`challenger1_x_rear_flap_${side}`, 'hullDark', box(.70, .29, .026),
    side * 1.38, 1.167, -4.182);
}

function driver(P: TankBuilderPort): void {
  // Fig.1's oblong door lives below the two flanking glacis shoulders.
  const door = cylY(.30, .30, .034, 32).scale(1, 1, 1.43);
  P.addHatch('hullDetail', door, 0, 1.672, 1.91);
  P.addEquipment('hullDetail', cylY(.068, .068, .075, 20), .344, 1.729, 1.84);
  P.addEquipment('hullDetail', box(.21, .025, .05), .24, 1.733, 1.84);
  P.addEquipment('hullDetail', box(.48, .040, .15), 0, 1.795, 1.56);
  for (const x of [-.219, .219]) P.addEquipment('hullDetail', box(.043, .095, .19), x, 1.739, 1.56);
  P.addEquipment('hullDark', box(.405, .084, .021), 0, 1.736, 1.493);
  P.addEquipment('hullGlass', box(.34, .056, .007), 0, 1.739, 1.520);
  for (const side of [-1, 1]) P.addEquipment('hullDetail', box(.032, .038, .96),
    side * .345, 1.728, 1.99, .13);
}

function bow(P: TankBuilderPort): void {
  P.addEquipment('hullDetail', box(2.94, .10, .032), 0, 1.361, 3.676);
  for (const side of [-1, 1]) {
    const x = side * 1.30;
    P.addEquipment('hullDetail', box(.43, .040, .29), x, 1.416, 3.45);
    P.addEquipment('hullDetail', cylZ(.095, .085, 24), x, 1.531, 3.487);
    P.addEquipment('hullGlass', cylZ(.074, .009, 24), x, 1.531, 3.534);
    for (const dx of [-.172, .172]) P.addEquipment('hullDetail', box(.036, .175, .145),
      x + dx, 1.502, 3.456);
    P.addEquipment('hullDetail', cylY(.009, .009, .34, 10), side * 1.679, 1.637, 3.22);
    P.addEquipment('hullDark', box(.024, .22, .12), side * 1.679, 1.901, 3.22);
    P.addEquipment('hullGlass', box(.005, .185, .094), side * 1.696, 1.901, 3.22);
  }
  addChallenger1XBowHooks(P);
  P.addEquipment('hullDetail', torus(.047, .018, 16, 6), 0, 1.035, 4.143, Math.PI / 2);
}

function engineDeck(P: TankBuilderPort): void {
  addChallenger1XLouvreBanks(P);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.47, .13, 2.63), side * 1.367, 1.826, -2.69);
    for (const z of [-3.72, -2.75, -1.75]) {
      P.addEquipment('hullDetail', cylY(.052, .052, .027, 18), side * 1.37, 1.904, z);
      P.addEquipment('hullDetail', box(.020, .15, .047), side * 1.49, 1.990, z);
    }
    P.addEquipment('hullDetail', cylZ(.019, 2.33, 12), side * 1.49, 2.063, -2.69);
    P.addEquipment('hullDetail', box(.54, .025, .86), side * .58, 1.801, -1.58);
    P.addEquipment('hullDetail', cylY(.069, .069, .036, 20), side * .64, 1.833, -1.45);
  }
  addChallenger1XRearEquipment(P);
  addChallenger1XDeckFittings(P);
  P.addEquipment('hullDetail', box(.28, .15, .41), 0, 1.886, -3.64);
  for (const x of [-.12, .12]) P.addEquipment('hullDetail', box(.055, .26, .085), x, 2.033, -3.53, -.32);
}

function turret(P: TankBuilderPort): void {
  const rows = [[-2.37, 1.14, 2.035, 2.10, 2.46], [-1.92, 1.40, 1.835, 2.12, 2.50],
    [-.90, 1.47, 1.76, 2.11, 2.50], [.56, 1.42, 1.75, 2.08, 2.50],
    [1.30, 1.18, 1.80, 2.09, 2.46], [1.96, .45, 1.96, 2.08, 2.22]];
  P.add('turret', local(sectionSolid(rows.map(([z, w, low, shoulder, top]) => ({ z,
    ring: [[-.68 * w, low], [.68 * w, low], [w, shoulder], [w * .89, top],
      [-w * .89, top], [-w, shoulder]],
  }))), D.turretPivot));
  P.add('turret', cylY(.875, .875, .13, 48), 0, .075, 0);
  for (const side of [-1, 1]) {
    const sections = [[-.22, 1.62, 1.975, 2.50], [.80, 1.53, 1.94, 2.50],
      [1.56, 1.09, 1.985, 2.34], [2.23, .32, 2.045, 2.15]];
    P.add('turret', local(sectionSolid(sections.map(([z, w, low, top]) => {
      const ring: [number, number][] = [[.26, low], [w, low], [w * .91, top], [.26, top]];
      if (side < 0) ring.reverse();
      return { z, ring: ring.map(([x, y]) => [side * x, y]) };
    })), D.turretPivot));
  }
}

function turretStowage(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    for (const [back, front] of [[-2.25, -1.57], [-1.545, -.84]]) {
      equipment(P, 'turretDetail', box(.30, .48, front - back), side * 1.44, 2.259, (back + front) / 2);
      equipment(P, 'turretDetail', box(.325, .027, front - back + .01), side * 1.44, 2.514,
        (back + front) / 2);
      for (const z of [back + .10, front - .10]) equipment(P, 'turretDetail', box(.025, .15, .040),
        side * 1.601, 2.21, z);
    }
    equipment(P, 'turretDetail', box(.073, .24, .48), side * 1.625, 2.179, -.42);
  }
  equipment(P, 'turretDetail', box(1.68, .38, .31), 0, 2.254, -2.40);
  equipment(P, 'turretDetail', box(.58, .26, .027), 0, 2.251, -2.568);
  for (const x of [-.65, .65]) equipment(P, 'turretDetail', box(.024, .22, .038), x, 2.23, -2.566);
}

function togs(P: TankBuilderPort): void {
  // Real stepped right-hand barbette. The window is deep inside the separate
  // side walls and overhanging cover, never painted onto a filled armor box.
  equipment(P, 'turretDetail', box(.57, .30, .60), 1.18, 2.464, .25);
  for (const x of [.925, 1.435]) equipment(P, 'turretDetail', box(.060, .275, .59), x, 2.737, .555);
  equipment(P, 'turretDetail', box(.57, .055, .66), 1.18, 2.889, .54);
  equipment(P, 'turretDark', box(.456, .215, .025), 1.18, 2.74, .325);
  equipment(P, 'turretGlass', box(.390, .156, .008), 1.18, 2.74, .348);
}

function roof(P: TankBuilderPort): void {
  equipment(P, 'turretDetail', cylY(.35, .39, .12, 32), .48, 2.548, -.25);
  for (let i = 0; i < 9; i++) {
    const angle = i * Math.PI * 2 / 9;
    equipment(P, 'turretDark', box(.102, .053, .055), .48 + Math.sin(angle) * .34,
      2.626, -.25 + Math.cos(angle) * .34, 0, angle);
  }
  P.addHatch('turretDetail', cylY(.302, .302, .028, 32), .48,
    2.669 - D.turretPivot[1], -.25 - D.turretPivot[2]);
  equipment(P, 'turretDetail', box(.31, .13, .25), .49, 2.702, .09);
  equipment(P, 'turretDetail', box(.34, .041, .30), .49, 2.9295, .09);
  for (const x of [.342, .638]) equipment(P, 'turretDetail', box(.043, .175, .245), x, 2.833, .09);
  equipment(P, 'turretDark', box(.247, .141, .019), .49, 2.839, .015);
  equipment(P, 'turretGlass', box(.205, .093, .008), .49, 2.84, .031);
  P.addHatch('turretDetail', cylY(.31, .31, .035, 32).scale(1, 1, 1.18), -.55,
    2.524 - D.turretPivot[1], -.20 - D.turretPivot[2]);
  equipment(P, 'turretDetail', box(.16, .135, .15), -.56, 2.558, .18);
  for (const [x, z] of [[-.98, -.98], [.97, -1.61], [-1.0, .32]]) {
    equipment(P, 'turretDetail', cylY(.035, .061, .09, 16), x, 2.530, z);
    equipment(P, 'turretDark', cylY(.004, .009, 1.49, 10), x, 3.32, z);
  }
}

function smoke(P: TankBuilderPort): void {
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const c = new THREE.Vector3(side * (.76 + i * .112), 2.365,
      [1.78, 1.72, 1.66, 1.50, 1.31][i]);
    const d = new THREE.Vector3(side * .36, .53, .77).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const tube = new THREE.CylinderGeometry(.042, .044, .175, 20, 1, true);
    tube.rotateX(Math.PI / 2).applyQuaternion(q).translate(...c.toArray());
    equipment(P, 'turretDetail', tube, 0, 0, 0);
    const back = new THREE.CircleGeometry(.034, 20);
    back.applyQuaternion(q).translate(...c.clone().addScaledVector(d, -.063).toArray());
    equipment(P, 'turretDark', back, 0, 0, 0);
    equipment(P, 'turretDetail', box(.073, .075, .105), c.x - d.x * .07,
      c.y - .086, c.z - d.z * .075);
  }
}

function machineGun(P: TankBuilderPort): void {
  const mg = sourceMachineGun(P, D.turretPivot), x = .76, z = -.37;
  // Inferred short pintle foot bridges onto the hatch ring. The upright alone
  // would begin 60 mm above the adjacent sloping cupola shoulder.
  mg.add('turretDetail', box(.22, .040, .14), x - .07, 2.654, z);
  mg.add('turretDetail', cylY(.051, .063, .135, 16), x, 2.735, z);
  for (const dx of [-.068, .068]) mg.add('turretDetail', box(.019, .105, .145), x + dx, 2.823, z);
  mg.add('turretDark', box(.124, .113, .34), x, 2.886, z + .025);
  mg.add('turretDark', cylZ(.023, .53, 16), x, 2.90, z + .46);
  mg.add('turretDark', box(.088, .076, .19), x, 2.87, z - .23);
  mg.add('turretDetail', box(.13, .17, .18), x + .12, 2.86, z + .04);
  mg.finish();
}

function gun(P: TankBuilderPort): void {
  const cradle = sectionSolid([{ z: 1.39, ring: [[-.24, 1.83], [.24, 1.83],
    [.24, 2.43], [-.24, 2.43]] }, { z: 2.35, ring: [[-.205, 1.945], [.205, 1.945],
    [.205, 2.285], [-.205, 2.285]] }]);
  P.add('gunMount', local(cradle, D.trunnion));
  const stations = [[1.91, .158], [2.41, .158], [2.50, .126], [4.07, .126],
    [4.18, .163], [4.79, .163], [4.91, .114], [6.99, .097], [7.15, .088], [7.365, .088]];
  P.add('gun', new THREE.LatheGeometry(stations.map(([z, r]) => new THREE.Vector2(r,
    z - D.trunnion[2])), 40).rotateX(Math.PI / 2));
  for (const [z, r] of [[2.58, .134], [3.07, .134], [3.58, .134], [4.0, .134],
    [4.98, .122], [5.52, .117], [6.14, .111], [6.70, .106]]) {
    P.add('gun', torus(r, .007, 24, 6), 0, 0, z - D.trunnion[2], Math.PI / 2);
  }
  P.add('gun', new THREE.RingGeometry(.060, .088, 40), 0, 0, D.muzzleZ - D.trunnion[2]);
  P.add('gunDark', new THREE.CylinderGeometry(.060, .060, .31, 40, 1, true)
    .rotateX(Math.PI / 2), 0, 0, D.muzzleZ - .155 - D.trunnion[2]);
  P.add('gunDark', cylZ(.061, .003, 32), 0, 0, D.muzzleZ - .311 - D.trunnion[2]);
  P.add('gun', box(.084, .068, .109), 0, .106, 7.155 - D.trunnion[2]);
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

export function buildChallenger1X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(0, D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  for (const side of [-1, 1]) skirt(P, side);
  driver(P);
  bow(P);
  engineDeck(P);
  turret(P);
  turretStowage(P);
  togs(P);
  roof(P);
  smoke(P);
  machineGun(P);
  gun(P);
}

export const CHALLENGER1_X_PROFILES = Object.freeze({ challenger1_x: { build: buildChallenger1X } });
