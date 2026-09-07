// Historical test-only photo draft. No playable registry imports this module.
// Original Mk5 construction from the WEG envelope, MoD exterior equipment
// documentation and the dated Kubinka photograph. No AI mesh metric or donor.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { chieftain5CastTurret, chieftain5CastMantlet } from './chieftain5XCast.ts';
import { addChieftain5XAuxiliaryMounts } from './chieftain5XAuxiliaryMounts.ts';
import { chieftain5PhotoWheelSolids } from './chieftain5XWheels.ts';
import { addChieftain5XOptics } from './chieftain5XOptics.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Band = readonly [z: number, left: number, right: number, low: number, high: number];

export const CHIEFTAIN5_X_DATUMS = Object.freeze({
  chieftain5_x: {
    // WEG printed 4-7 fixes chassis length/width/reported 2.90 m height.
    // The armor roof, complete gun length and rig are separate estimates.
    dims: { hullLengthM: 7.48, overallLengthM: 10.80, widthM: 3.51, heightM: 2.45 },
    structuralRoofY: 2.45, fixedOpticHeightM: 2.76, highestFittingM: 3.91,
    reportedEquipmentHeightM: 2.90,
    turretPivot: [0, 1.61, .53] as Point,
    trunnion: [0, 2.035, 1.69] as Point,
    muzzleZ: 7.06,
  },
});
const D = CHIEFTAIN5_X_DATUMS.chieftain5_x;

function local(g: THREE.BufferGeometry, p: Point): THREE.BufferGeometry {
  return g.translate(-p[0], -p[1], -p[2]);
}

function slab(rows: readonly Band[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, a, b, low, top]) => ({ z,
    ring: [[a, low], [b, low], [b, top], [a, top]],
  })));
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x, y - D.turretPivot[1], z - D.turretPivot[2], rx, ry, rz);
}

function hull(P: TankBuilderPort): void {
  const rows = [[-3.70, 1.42, .97, 1.54], [-3.09, 1.46, .58, 1.58],
    [-2.30, 1.46, .508, 1.60], [-.85, 1.44, .508, 1.59],
    [.87, 1.42, .508, 1.58], [1.72, 1.405, .51, 1.61],
    [2.58, 1.31, .575, 1.42], [2.91, 1.015, .695, 1.326],
    [3.12, 1.015, .765, 1.27], [3.51, 1.015, .95, 1.18],
    [3.70, 1.015, 1.04, 1.14]];
  const sections: SolidSection[] = rows.map(([z, w, low, top]) => ({ z,
    ring: [[-.965, low], [.965, low], [1.01, low + .035],
      [1.015, Math.min(top - .07, 1.29)], [w, top - .055], [w * .98, top],
      [-w * .98, top], [-w, top - .055], [-1.015, Math.min(top - .07, 1.29)],
      [-1.01, low + .035]],
  }));
  P.add('hull', sectionSolid(sections));
  P.add('hull', cylY(.895, .895, .105, 48), 0, 1.621, .53);
  for (const side of [-1, 1]) {
    const a = side < 0 ? -1.39 : .355, b = side < 0 ? -.355 : 1.39;
    P.add('hull', slab([[1.44, a, b, 1.525, 1.663],
      [2.30, a, b, 1.395, 1.512],
      [3.19, side < 0 ? -1.015 : .355, side < 0 ? -.355 : 1.015, 1.265, 1.30]]));
  }
}

function runningGear(P: TankBuilderPort): void {
  const zs = [-2.18, -1.39, -.395, .395, 1.39, 2.18];
  const rollers = [-2.21, -1.11, 0, 1.11, 2.21].map(z => ({ z, y: 1.074, r: .085 }));
  const wheels = chieftain5PhotoWheelSolids();
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .395, wheelW: .40, wheelY: .471, wheelZs: zs,
    wheelTireInnerRadiusM: .3535,
    wheelCoreGeometry: { disc: wheels.core },
    wheelFaceLayers: [{ geometry: wheels.shoulder, material: P.mats.rubber,
      name: 'chieftain5PhotoWheelRubberShoulders', appearanceRole: 'wheelTire' }],
    xc: 1.365, trackW: .635, trackTh: .024, botY: .054, topY: 1.225,
    trackShoeDimensions: { padHeight: .032, grouserHeight: .014, webHeight: .030, hornHeight: .10 },
    sprocket: { z: -3.06, y: .879, r: .354, trackR: .328 },
    idler: { z: 3.11, y: .882, r: .321, trackR: .295 },
    rollers, returnRollerWidthM: .24, returnRollerInsetM: .14,
    suspensionPattern: 'paired-bogie',
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { z: 3.11, y: .882, r: .295 }, sprocket: { z: -3.06, y: .879, r: .328 },
      contact: KIT.runningGearContactPatch(zs, .395), botY: .054, topY: 1.225, sag: .018,
      supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .012 })),
    }), .054, .37),
    rigidLinkChords: true, arms: true, coveredTop: true, paintedEnds: true,
  });
  // The native paired yokes remain the moving mechanical attachment. These
  // compact fixed spring housings represent the photo's three bogie groups.
  for (const side of [-1, 1]) for (const z of [-1.785, 0, 1.785]) {
    P.addEquipment('hullDetail', box(.17, .155, .48), side * 1.02, .863, z);
    P.addEquipment('hullDetail', cylX(.070, .15, 16), side * 1.095, .805, z);
  }
}

function guard(P: TankBuilderPort, side: number): void {
  const rows = [[2.63, 1.07, 1.74, 1.444], [3.07, 1.07, 1.74, 1.434],
    [3.39, 1.065, 1.724, 1.371], [3.62, 1.06, 1.687, 1.289],
    [3.74, 1.07, 1.627, 1.204]];
  const sections: SolidSection[] = rows.map(([z, inside, outside, top]) => {
    const ring: [number, number][] = [[inside, top - .035], [outside - .032, top - .065],
      [outside, top - .034], [outside - .023, top], [inside, top]];
    if (side < 0) ring.reverse();
    return { z, ring: ring.map(([x, y]) => [side * x, y]) };
  });
  P.addMudguard(`chieftain5_x_front_guard_${side}`, 'hullDetail', sectionSolid(sections));
  const a = Math.min(side * 1.08, side * 1.70), b = Math.max(side * 1.08, side * 1.70);
  P.addMudguard(`chieftain5_x_front_flap_${side}`, 'hullDark', slab([
    [3.676, a, b, .947, 1.232], [3.708, a + .037, b - .037, .947, 1.219],
  ]));
  P.addMudguard(`chieftain5_x_rear_guard_${side}`, 'hullDetail', slab([
    [-3.74, a, b, 1.205, 1.247], [-3.29, a, b, 1.399, 1.431],
  ]));
  P.addMudguard(`chieftain5_x_rear_flap_${side}`, 'hullDark', box(.62, .25, .027),
    side * 1.39, 1.118, -3.726);
}

function panniers(P: TankBuilderPort, side: number): void {
  for (const [back, front, top] of [[-2.91, -1.73, 1.731], [-1.70, -.39, 1.720],
    [.79, 1.57, 1.688], [1.60, 2.65, 1.644]]) {
    const a = side < 0 ? -1.726 : 1.245, b = side < 0 ? -1.245 : 1.726;
    P.addEquipment('hullDetail', slab([[back, a, b, 1.486, top],
      [front, a, b, 1.486, top - .025]]));
    for (const z of [back + .13, front - .13]) P.addEquipment('hullDetail', box(.035, .033, .072),
      side * 1.693, top + .005, z);
  }
}

function skirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const x = side * 1.737;
    for (const [back, front, lowA, lowB] of [[-3.03, -1.93, .92, .73],
      [-1.91, -.64, .73, .73], [-.62, .65, .73, .73], [.67, 1.94, .73, .73],
      [1.96, 3.02, .73, .94]]) {
      P.addExternalArmor('hull', slab([[back, x - .018, x + .018, lowA, 1.484],
        [front, x - .018, x + .018, lowB, 1.484]]));
      for (const z of [back + .06, front - .06]) {
        P.addEquipment('hullDetail', box(.26, .031, .051), side * 1.60, 1.493, z);
        P.addEquipment('hullDetail', cylX(.012, .014, 8), side * 1.755, 1.417, z);
      }
    }
    P.add('hull', box(.32, .035, 5.78), side * 1.572, 1.482, -.055);
    panniers(P, side);
    guard(P, side);
  }
}

function driver(P: TankBuilderPort): void {
  P.addHatch('hullDetail', cylY(.305, .305, .027, 32).scale(1, 1, 1.57), 0, 1.590, 1.87);
  P.addEquipment('hullDetail', box(.435, .031, .177), 0, 1.725, 1.493);
  for (const x of [-.192, .192]) P.addEquipment('hullDetail', box(.043, .077, .18), x, 1.680, 1.493);
  P.addEquipment('hullDark', box(.32, .062, .022), 0, 1.679, 1.427);
  P.addEquipment('hullGlass', box(.295, .044, .007), 0, 1.683, 1.447);
  for (const x of [-.321, .321]) P.addEquipment('hullDetail', box(.027, .045, .99), x, 1.638, 1.91, .047);
  P.addEquipment('hullDetail', cylY(.049, .049, .079, 16), .34, 1.655, 1.68);
}

function bow(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const x = side * .945;
    P.addEquipment('hullDetail', box(.475, .035, .31), x, 1.408, 2.846);
    P.addEquipment('hullDetail', box(.475, .023, .273), x, 1.626, 2.853);
    for (const dx of [-.225, .005, .225]) P.addEquipment('hullDetail', box(.027, .202, .251),
      x + dx, 1.518, 2.853);
    for (const dx of [-.114, .113]) {
      P.addEquipment('hullDark', cylZ(.079, .071, 24), x + dx, 1.519, 2.836);
      P.addEquipment('hullGlass', cylZ(.064, .007, 24), x + dx, 1.519, 2.878);
      P.addEquipment('hullDetail', torus(.080, .011, 24, 6), x + dx, 1.519, 2.881, Math.PI / 2);
    }
    P.addEquipment('hullDetail', box(.19, .19, .070), side * .57, 1.082, 3.578, -.34);
    P.addEquipment('hullDetail', torus(.068, .024, 20, 6), side * .57, 1.061, 3.662, Math.PI / 2);
    P.addEquipment('hullDetail', cylY(.021, .021, .155, 12), side * 1.725, 1.546, 2.436);
  }
  P.addEquipment('hullDetail', slab([[3.215, -1.13, 1.13, 1.253, 1.283],
    [3.410, -1.13, 1.13, 1.227, 1.305]]));
  P.addEquipment('hullDetail', box(.37, .225, .036), 0, 1.147, 3.617, -.13);
}

function engine(P: TankBuilderPort): void {
  for (const side of [-1, 1]) for (const [z, length] of [[-3.02, .78], [-2.10, .91], [-1.22, .69]]) {
    const x = side * .565;
    P.addEquipment('hullDetail', box(.98, .034, length), x, 1.607, z);
    for (let i = 0; i < Math.floor(length / .049); i++) P.addEquipment('hullDark', box(.90, .016, .023),
      x, 1.631, z - length / 2 + .035 + i * .049);
    for (const dx of [-.34, .34]) P.addEquipment('hullDetail', box(.044, .035, .073),
      x + dx, 1.635, z - length / 2 + .037);
  }
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.235, .095, 2.04), side * 1.219, 1.598, -2.339);
    for (const z of [-3.08, -1.81]) P.addEquipment('hullDetail', cylY(.065, .065, .027, 18),
      side * 1.232, 1.660, z);
    P.addEquipment('hullDetail', box(.29, .22, .093), side * 1.17, 1.337, -3.669);
    P.addEquipment('hullDetail', torus(.066, .022, 20, 6), side * .71, 1.069, -3.701, Math.PI / 2);
  }
  P.addEquipment('hullDetail', box(.50, .26, .10), 0, 1.342, -3.66);
  P.addEquipment('hullDetail', box(.28, .11, .39), 0, 1.659, -2.80);
  for (const x of [-.103, .103]) P.addEquipment('hullDetail', box(.033, .26, .072), x, 1.813, -2.77, -.23);
}

function turret(P: TankBuilderPort): void {
  P.add('turret', local(chieftain5CastTurret(), D.turretPivot));
  P.add('turret', cylY(.88, .88, .15, 48), 0, .089, 0);
}

function stowage(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    equipment(P, 'turretDetail', slab([[-1.97, side < 0 ? -1.47 : 1.10,
      side < 0 ? -1.10 : 1.47, 2.006, 2.409], [-.71, side < 0 ? -1.50 : 1.12,
      side < 0 ? -1.12 : 1.50, 2.006, 2.44]]), 0, 0, 0);
    for (const z of [-1.76, -.91]) equipment(P, 'turretDetail', box(.027, .158, .037),
      side * 1.489, 2.186, z);
  }
  equipment(P, 'turretDetail', box(1.49, .331, .282), 0, 2.15, -2.183);
  for (const x of [-.50, .50]) equipment(P, 'turretDetail', box(.035, .167, .027), x, 2.124, -2.337);
}

function gunnerSight(P: TankBuilderPort): void {
  // A small front opening on the casting, with a recessed wall and real hood.
  equipment(P, 'turretDetail', box(.28, .066, .285), .465, 2.378, 1.044);
  for (const x of [.340, .590]) equipment(P, 'turretDetail', box(.030, .075, .24), x, 2.436, 1.064);
  equipment(P, 'turretDetail', box(.287, .031, .267), .465, 2.484, 1.066);
  equipment(P, 'turretDark', box(.222, .068, .024), .465, 2.435, .970);
  equipment(P, 'turretGlass', box(.189, .044, .007), .465, 2.438, .989);
}

function searchlight(P: TankBuilderPort): void {
  // The Mk5 projector is a large separate left-hand case, not a TOGS barbette.
  equipment(P, 'turretDetail', box(.63, .55, .30), -1.22, 2.227, .261);
  for (const x of [-1.512, -.928]) equipment(P, 'turretDetail', box(.046, .49, .47), x, 2.227, .582);
  for (const y of [1.972, 2.482]) equipment(P, 'turretDetail', box(.63, .044, .47), -1.22, y, .582);
  equipment(P, 'turretDark', box(.515, .444, .023), -1.22, 2.227, .437);
  equipment(P, 'turretGlass', cylZ(.197, .008, 32), -1.22, 2.227, .456);
  // Lower brackets overlap the permanent casting; no detached full-height box.
  for (const z of [.24, .48]) equipment(P, 'turretDetail', box(.28, .10, .053), -1.113, 2.015, z);
}

function cupola(P: TankBuilderPort): void {
  equipment(P, 'turretDetail', cylY(.35, .405, .14, 32), .45, 2.480, -.30);
  addChieftain5XOptics(P, D.turretPivot);
  P.addHatch('turretDetail', cylY(.303, .303, .027, 32), .45,
    2.610 - D.turretPivot[1], -.30 - D.turretPivot[2]);
  P.addHatch('turretDetail', cylY(.287, .287, .031, 32).scale(1, 1, 1.19), -.52,
    2.462 - D.turretPivot[1], -.255 - D.turretPivot[2]);
  equipment(P, 'turretDetail', box(.151, .12, .163), -.51, 2.466, .12);
  for (const [x, z] of [[-.81, -1.045], [.78, -1.26]]) {
    equipment(P, 'turretDetail', cylY(.036, .063, .093, 16), x, 2.444, z);
    equipment(P, 'turretDark', cylY(.004, .009, 1.405, 10), x, 3.185, z);
  }
}

function smokeBank(P: TankBuilderPort, side: number): void {
  // No.9 Mk1 is one cast carrier containing six cups, not six unrelated poles.
  const axis = new THREE.Vector3(side * .49, .22, .844).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  // The fuller bare cheek needs the existing cast bank seated 40 mm farther
  // along its axis. This photo-led placement retains clear inner cup stocks.
  const origin = new THREE.Vector3(side * 1.215, 2.327, 1.12).addScaledVector(axis, .040);
  const carrier = box(.27, .18, .047).applyQuaternion(q);
  equipment(P, 'turretDetail', carrier, ...origin.clone().addScaledVector(axis, -.110).toArray());
  equipment(P, 'turretDetail', box(.085, .24, .155), side * 1.205, 2.225, .974);
  for (const dy of [-.046, .046]) for (const dx of [-.087, 0, .087]) {
    const center = new THREE.Vector3(dx, dy, 0).applyQuaternion(q).add(origin);
    equipment(P, 'turretDetail', new THREE.CylinderGeometry(.038, .042, .177, 20, 1, true)
      .rotateX(Math.PI / 2).applyQuaternion(q), ...center.toArray());
    equipment(P, 'turretDetail', new THREE.RingGeometry(.032, .038, 20).applyQuaternion(q),
      ...center.clone().addScaledVector(axis, .0885).toArray());
    equipment(P, 'turretDark', new THREE.CircleGeometry(.032, 20).applyQuaternion(q),
      ...center.clone().addScaledVector(axis, -.084).toArray());
  }
}

function machineGun(P: TankBuilderPort): void {
  const mg = sourceMachineGun(P, D.turretPivot), x = .782, z = -.42;
  // Compact inferred radial foot attaches the offset pintle to the cupola;
  // it does not raise the whole roof or leave the upright suspended in air.
  mg.add('turretDetail', box(.22, .035, .14), x - .07, 2.589, z);
  mg.add('turretDetail', cylY(.042, .058, .144, 16), x, 2.652, z);
  for (const dx of [-.066, .066]) mg.add('turretDetail', box(.017, .097, .134), x + dx, 2.760, z);
  mg.add('turretDark', box(.115, .090, .322), x, 2.800, z + .042);
  mg.add('turretDark', cylZ(.021, .520, 16), x, 2.808, z + .45);
  mg.add('turretDetail', box(.126, .17, .18), x + .118, 2.780, z - .035);
  mg.add('turretDark', box(.072, .068, .188), x, 2.783, z - .210);
  mg.finish();
}

function gun(P: TankBuilderPort): void {
  P.add('gunMount', local(chieftain5CastMantlet(), D.trunnion));
  addChieftain5XAuxiliaryMounts(P, D.trunnion);
  const rows = [[1.95, .155], [2.28, .153], [2.39, .124], [3.45, .124],
    [3.54, .163], [4.13, .163], [4.24, .116], [6.60, .096], [6.86, .086], [7.06, .086]];
  P.add('gun', new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - D.trunnion[2])),
    40).rotateX(Math.PI / 2));
  for (const [z, radius] of [[2.40, .132], [2.89, .132], [3.42, .132], [4.28, .124],
    [4.82, .120], [5.41, .115], [6.00, .110], [6.57, .104]]) {
    P.add('gun', torus(radius, .008, 24, 6), 0, 0, z - D.trunnion[2], Math.PI / 2);
    P.add('gun', box(.051, .023, .072), .053, radius - .012, z - D.trunnion[2]);
  }
  P.add('gun', new THREE.RingGeometry(.060, .086, 40), 0, 0, D.muzzleZ - D.trunnion[2]);
  P.add('gunDark', new THREE.CylinderGeometry(.060, .060, .32, 40, 1, true)
    .rotateX(Math.PI / 2), 0, 0, D.muzzleZ - .160 - D.trunnion[2]);
  P.add('gunDark', cylZ(.061, .004, 32), 0, 0, D.muzzleZ - .322 - D.trunnion[2]);
  P.add('gun', box(.063, .061, .089), 0, .107, 6.81 - D.trunnion[2]);
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

export function buildChieftain5XPhotoDraft(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(0, D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  skirts(P);
  driver(P);
  bow(P);
  engine(P);
  turret(P);
  stowage(P);
  gunnerSight(P);
  searchlight(P);
  cupola(P);
  smokeBank(P, -1);
  smokeBank(P, 1);
  machineGun(P);
  gun(P);
}

export const CHIEFTAIN5_PHOTO_DRAFT_PROFILES = Object.freeze({
  chieftain5_x: { build: buildChieftain5XPhotoDraft },
});
