// Preserved photo-draft fixture, not the actual supplied-file X runtime.
// Independent Strv 122 construction from FMV envelope data and dated Army
// photographs. The supplied TRIPO mesh supplies no metric/topology/runtime data.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { addStrv122XGalix } from './strv122XGalix.ts';
import { strv122PhotoWheelSolids } from './primaryPhotoWheelSolids.ts';
import { addStrv122XBustle } from './strv122XBustle.ts';
import { addStrv122XGlacisShoulders,addStrv122XSurfaceAssembly,addStrv122XBowInterfaces,
  STRV122_CHEEK_SECTIONS } from './strv122XSurfaceAssembly.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Row = readonly [z: number, width: number, bottom: number, shoulder: number, top: number];

export const STRV122_X_DATUMS = Object.freeze({
  strv122_x: {
    // FMV gives overall length/width. Hull length and armor roof are explicitly
    // photo-estimated; its 3.00 m reported equipment height is NOT armor roof.
    dims: { hullLengthM: 7.70, overallLengthM: 9.97, widthM: 3.78, heightM: 2.533 },
    structuralRoofY: 2.533, coreRoofY: 2.47, fixedOpticHeightM: 2.90, highestFittingM: 3.93,
    reportedEquipmentHeightM: 3.00,
    turretPivot: [0, 1.61, .61] as Point,
    trunnion: [0, 2.055, 1.63] as Point,
    muzzleZ: 6.12,
  },
});
const D = STRV122_X_DATUMS.strv122_x;

function local(geometry: THREE.BufferGeometry, p: Point): THREE.BufferGeometry {
  return geometry.translate(-p[0], -p[1], -p[2]);
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x, y - D.turretPivot[1], z - D.turretPivot[2], rx, ry, rz);
}

function hull(P: TankBuilderPort): void {
  const rows: readonly Row[] = [[-3.81, 1.57, .89, 1.45, 1.58],
    [-3.18, 1.59, .48, 1.43, 1.60], [-1.49, 1.61, .495, 1.44, 1.60],
    [.78, 1.61, .515, 1.44, 1.58], [2.38, 1.55, .534, 1.43, 1.56],
    [2.82, 1.14, .54, 1.35, 1.48], [3.50, 1.05, .83, 1.16, 1.28],
    [3.81, 1.02, 1.02, 1.12, 1.17]];
  const sections: SolidSection[] = rows.map(([z, width, low, shoulder, top]) => ({ z,
    ring: [[-.97, low], [.97, low], [1.035, low + .07], [1.035, shoulder],
      [width, shoulder], [width - .015, top], [-width + .015, top], [-width, shoulder],
      [-1.035, shoulder], [-1.035, low + .07]],
  }));
  P.add('hull', sectionSolid(sections));
  P.add('hull', cylY(.85, .85, .09, 48), 0, 1.605, .61);
  // Photo-supported broad glacis applique has distinct upper/lower planes,
  // not a borrowed Leopard-family hull with scaled accessories.
  P.add('hull', sectionSolid([{ z: 2.22, ring: [[-1.53, 1.50], [1.53, 1.50],
    [1.53, 1.705], [-1.53, 1.705]] }, { z: 3.64,
    ring: [[-1.04, 1.18], [1.04, 1.18], [1.04, 1.30], [-1.04, 1.30]] }]));
  addStrv122XGlacisShoulders(P);
}

function runningGear(P: TankBuilderPort): void {
  const wheel = strv122PhotoWheelSolids();
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .345, wheelW: .40, wheelY: .421,
    wheelTireInnerRadiusM: .311,
    wheelCoreGeometry: { disc: wheel.core },
    wheelFaceLayers: [{ geometry: wheel.shoulder, material: P.mats.rubber,
      name: 'strv122PhotoWheelRubberShoulders', appearanceRole: 'wheelTire' }],
    wheelZs: [-2.46, -1.63, -.80, .03, .86, 1.69, 2.52],
    xc: 1.42, trackW: .635, trackTh: .024, botY: .054, topY: 1.198,
    trackShoeDimensions: { padHeight: .032, grouserHeight: .014, webHeight: .030, hornHeight: .10 },
    sprocket: { z: -3.14, y: .835, r: .335, trackR: .332 },
    idler: { z: 3.07, y: .814, r: .285, trackR: .293 },
    rollers: [-2.00, -.40, 1.24, 2.04].map(z => ({ z, y: 1.093, r: .075 })),
    returnRollerWidthM: .25, returnRollerInsetM: .15,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { z: 3.07, y: .814, r: .293 }, sprocket: { z: -3.14, y: .835, r: .332 },
      botY: .054, topY: 1.198, sag: .022,
      contact: KIT.runningGearContactPatch([-2.46, -1.63, -.80, .03, .86, 1.69, 2.52], .345),
      supports: [-2.00, -.40, 1.24, 2.04].map(z => ({ z, y: 1.180 })),
    }), .054, .37),
    rigidLinkChords: true,
    arms: true, coveredTop: true, paintedEnds: true,
  });
}

function guard(P: TankBuilderPort, side: number): void {
  const a = Math.min(side * 1.09, side * 1.875), b = Math.max(side * 1.09, side * 1.875);
  const rows = [[2.52, 1.442], [3.04, 1.433], [3.46, 1.319], [3.85, 1.275]];
  P.addMudguard(`strv122_x_front_guard_${side}`, 'hullDetail', sectionSolid(rows.map(([z, y]) => ({ z,
    ring: [[a, y - .026], [b, y - .026], [b, y], [a, y]],
  }))));
  P.addMudguard(`strv122_x_front_flap_${side}`, 'hullDark', box(.75, .32, .028),
    side * 1.49, 1.115, 3.836);
  P.addMudguard(`strv122_x_rear_guard_${side}`, 'hullDetail', box(.75, .037, .70),
    side * 1.49, 1.413, -3.50);
  P.addMudguard(`strv122_x_rear_flap_${side}`, 'hullDark', box(.75, .32, .029),
    side * 1.49, 1.251, -3.835);
}

function skirtLoop(P: TankBuilderPort, side: number, z: number): void {
  const points: Point[] = [[side * 1.816, .956, z - .22],
    [side * 1.818, .722, z - .115], [side * 1.818, .722, z + .115],
    [side * 1.816, .956, z + .22]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
    const tube = cylY(.011, .011, a.distanceTo(b), 10);
    tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize())).translate(...a.add(b).multiplyScalar(.5).toArray());
    P.addEquipment('hullDetail', tube);
  }
}

function skirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const panels = [[-3.17, -2.19, .026], [-2.17, -1.17, .026], [-1.15, -.15, .026],
      [-.13, .87, .055], [.89, 1.88, .055], [1.90, 2.80, .055]];
    for (const [back, front, thickness] of panels) {
      P.addExternalArmor('hull', box(thickness, .535, front - back),
        side * (thickness > .03 ? 1.8625 : 1.817), 1.2175, (back + front) / 2);
      for (const z of [back + .045, front - .045]) {
        P.addEquipment('hullDetail', box(.031, .075, .065), side * 1.826, 1.494, z);
        P.addEquipment('hullDetail', cylX(.010, .015, 8), side * 1.898, 1.18, z);
      }
    }
    for (const z of [-2.42, -.56, 1.29]) skirtLoop(P, side, z);
    P.add('hull', box(.06, .08, 6.32), side * 1.754, 1.494, -.14);
    P.addEquipment('hullDetail', cylZ(.019, 6.25, 10), side * 1.835, 1.207, -.20);
    guard(P, side);
  }
}

function engineDeck(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', cylY(.48, .48, .030, 36), side * .68, 1.609, -2.65);
    for (let i = -6; i <= 6; i++) {
      const length = Math.sqrt(.45 ** 2 - (i * .065) ** 2) * 2;
      P.addEquipment('hullDark', box(length, .012, .018), side * .68, 1.631, -2.65 + i * .065);
    }
    P.addEquipment('hullDetail', box(.52, .07, 1.86), side * 1.35, 1.619, -2.28);
    P.addEquipment('hullDark', box(.024, .16, .38), side * 1.826, 1.472, -1.58);
    for (let i = 0; i < 8; i++) P.addEquipment('hullDetail', box(.032, .17, .012),
      side * 1.842, 1.472, -1.745 + i * .047);
    P.addEquipment('hullDetail', box(.27, .18, .15), side * 1.24, 1.355, -3.757);
    P.addEquipment('hullDetail', torus(.072, .022, 18, 6), side * .92, 1.08, -3.80, Math.PI / 2);
  }
  P.addEquipment('hullDark', box(1.76, .27, .025), 0, 1.346, -3.817);
  for (let i = 0; i < 16; i++) P.addEquipment('hullDetail', box(.026, .25, .031),
    -.825 + i * .11, 1.346, -3.835);
}

function lamp(P: TankBuilderPort, x: number): void {
  // Rectangular lamp has a recessed front face and a supported surrounding
  // housing, following the broad bow-light stations in the 2018 photographs.
  P.addEquipment('hullDetail', box(.29, .055, .23), x, 1.522, 3.075, .27);
  P.addEquipment('hullDetail', box(.29, .040, .17), x, 1.661, 3.069, .27);
  for (const dx of [-.132, .132]) P.addEquipment('hullDetail', box(.026, .12, .20),
    x + dx, 1.589, 3.067, .27);
  P.addEquipment('hullDark', box(.237, .088, .025), x, 1.586, 3.037, .27);
  P.addEquipment('hullGlass', box(.208, .063, .006), x, 1.591, 3.055, .27);
}

function bow(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    lamp(P, side * 1.03);
    P.addEquipment('hullDetail', box(.12, .14, .14), side * .83, 1.11, 3.86);
    P.addEquipment('hullDetail', torus(.077, .022, 24, 8), side * .83, .98, 3.925, Math.PI / 2);
    for (const z of [2.41, 2.77, 3.13]) P.addEquipment('hullDetail', cylY(.018, .018, .017, 8),
      side * .91, 1.706 - (z - 2.22) * .285 + .01, z);
  }
  P.addHatch('hullDetail', cylY(.345, .345, .027, 32), .57, 1.595, 1.59);
  for (const x of [.36, .57, .78]) {
    P.addEquipment('hullDetail', box(.16, .08, .13), x, 1.648, 1.85);
    P.addEquipment('hullGlass', box(.126, .039, .007), x, 1.651, 1.919);
  }
  P.addEquipment('hullDetail', box(1.93, .025, .040), 0, 1.727, 2.234);
  addStrv122XBowInterfaces(P);
}

function turretCore(P: TankBuilderPort): void {
  const rows: readonly Row[] = [[-2.14, 1.20, 1.99, 2.10, 2.44],
    [-1.72, 1.42, 1.76, 2.07, 2.47], [-.68, 1.43, 1.69, 2.04, 2.47],
    [.78, 1.42, 1.69, 2.04, 2.47], [1.43, 1.24, 1.77, 2.06, 2.44]];
  P.add('turret', local(sectionSolid(rows.map(([z, w, low, shoulder, top]) => ({ z,
    ring: [[-.78 * w, low], [.78 * w, low], [w, shoulder], [w * .965, top],
      [-w * .965, top], [-w, shoulder]],
  }))), D.turretPivot));
  P.add('turret', cylY(.83, .83, .13, 48), 0, .07, 0);
  for (const side of [-1, 1]) {
    const sections: SolidSection[] = STRV122_CHEEK_SECTIONS.map(([z, w, low, top]) => {
      const ring: [number, number][] = [[.25, low + .04], [w * .81, low],
        [w, (low + top) / 2], [w * .97, top], [.25, top]];
      if (side < 0) ring.reverse();
      return { z, ring: ring.map(([x, y]) => [side * x, y]) };
    });
    P.add('turret', local(sectionSolid(sections), D.turretPivot));
    // Separate roof-protection plates are not a tall boxed turret replacement.
    equipment(P, 'turretDetail', box(1.055, .070, 1.40), side * .75, 2.498, .035);
    for (const z of [.32, .75, 1.18]) for (const x of [.46, 1.18]) {
      equipment(P, 'turretDetail', cylY(.012, .014, .012, 8), side * x,
        2.538 - Math.max(0, z - .60) * .040, z);
    }
  }
}

function roof(P: TankBuilderPort): void {
  for (const [x, z, r] of [[.63, -.36, .31], [-.58, -.19, .35]]) {
    equipment(P, 'turretDetail', cylY(r, r + .020, .073, 32), x, 2.561, z);
    P.addHatch('turretDetail', cylY(r - .025, r - .025, .027, 32),
      x, 2.611 - D.turretPivot[1], z - D.turretPivot[2]);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI * 2 / 6;
      equipment(P, 'turretDark', box(.098, .035, .042), x + Math.sin(angle) * r,
        2.594, z + Math.cos(angle) * r, 0, angle);
    }
  }
  equipment(P, 'turretDetail', cylY(.15, .17, .24, 24), .65, 2.685, -.99);
  equipment(P, 'turretDetail', cylY(.20, .20, .115, 32), .65, 2.8425, -.99);
  equipment(P, 'turretGlass', box(.17, .048, .010), .65, 2.845, -.788);
  for (const x of [-1.22, 1.22]) {
    equipment(P, 'turretDetail', cylY(.035, .075, .095, 16), x, 2.506, -1.65);
    equipment(P, 'turretDark', cylY(.004, .009, 1.39, 10), x, 3.235, -1.65);
  }
  equipment(P, 'turretDetail', box(.046, .36, .61), -1.46, 2.20, -.63);
  for (const z of [-.86, -.42]) equipment(P, 'turretDetail', cylZ(.026, .033, 10),
    -1.493, 2.24, z, 0, Math.PI / 2);
}

function gunnerSight(P: TankBuilderPort): void {
  const x = .87, back = .75, front = 1.19;
  for (const dx of [-.205, .205]) equipment(P, 'turretDetail', box(.045, .30, front - back),
    x + dx, 2.637, (back + front) / 2);
  equipment(P, 'turretDetail', box(.455, .030, .44), x, 2.793, .97);
  equipment(P, 'turretDetail', box(.455, .030, .44), x, 2.479, .97);
  equipment(P, 'turretDark', box(.366, .266, .027), x, 2.635, .787);
  equipment(P, 'turretGlass', box(.326, .216, .009), x, 2.635, .809);
  equipment(P, 'turretDetail', box(.031, .244, .045), x, 2.635, .838);
}

function machineGun(P: TankBuilderPort): void {
  const mg = sourceMachineGun(P, D.turretPivot), x = -.59, z = .14;
  mg.add('turretDetail', cylY(.045, .063, .18, 16), x, 2.679, z);
  for (const dx of [-.061, .061]) mg.add('turretDetail', box(.019, .097, .145), x + dx, 2.792, z);
  mg.add('turretDark', box(.108, .115, .30), x, 2.853, z + .055);
  mg.add('turretDark', cylZ(.022, .50, 16), x, 2.870, z + .44);
  mg.add('turretDark', box(.094, .073, .14), x, 2.84, z - .13);
  mg.add('turretDetail', box(.13, .13, .15), x - .12, 2.86, z + .035);
  mg.finish();
}

function gun(P: TankBuilderPort): void {
  P.add('gunMount', local(sectionSolid([{ z: 1.38, ring: [[-.24, 1.85], [.24, 1.85],
    [.24, 2.43], [-.24, 2.43]] }, { z: 2.28, ring: [[-.215, 1.855], [.215, 1.855],
    [.215, 2.295], [-.215, 2.295]] }]), D.trunnion));
  // A turned flexible mantlet boot encloses the moving barrel, replacing
  // the long exposed rectangular scaffold. Its inner bore remains open.
  const sleeve=[[.133,2.24],[.247,2.24],[.262,2.30],[.255,2.39],
    [.236,2.53],[.225,2.65],[.206,2.73],[.192,2.78],[.133,2.78],[.133,2.24]];
  P.add('gunMount',new THREE.LatheGeometry(sleeve.map(([r,z])=>new THREE.Vector2(r,z-D.trunnion[2])),40)
    .rotateX(Math.PI/2));
  for(const [z,r]of [[2.35,.260],[2.49,.247],[2.63,.228],[2.73,.211]])
    P.add('gunMount',torus(r,.008,32,8),0,0,z-D.trunnion[2],Math.PI/2);
  const points = [[1.90, .129], [2.67, .129], [2.72, .101], [3.25, .101],
    [3.34, .161], [3.88, .161], [4.02, .100], [5.95, .081], [6.12, .081]];
  P.add('gun', new THREE.LatheGeometry(points.map(([z, r]) => new THREE.Vector2(r,
    z - D.trunnion[2])), 40).rotateX(Math.PI / 2));
  for (const [z, r] of [[2.90, .11], [3.20, .11], [4.06, .108], [5.01, .096]]) {
    P.add('gun', torus(r, .006, 20, 6), 0, 0, z - D.trunnion[2], Math.PI / 2);
  }
  P.add('gun', new THREE.RingGeometry(.060, .081, 40), 0, 0, D.muzzleZ - D.trunnion[2]);
  P.add('gunDark', new THREE.CylinderGeometry(.060, .060, .29, 40, 1, true)
    .rotateX(Math.PI / 2), 0, 0, D.muzzleZ - .145 - D.trunnion[2]);
  P.add('gunDark', cylZ(.061, .003, 32), 0, 0, D.muzzleZ - .291 - D.trunnion[2]);
  P.add('gun', box(.073, .092, .057), .064, .079, 5.96 - D.trunnion[2]);
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

export function buildStrv122X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(0, D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  skirts(P);
  engineDeck(P);
  bow(P);
  turretCore(P);
  roof(P);
  gunnerSight(P);
  addStrv122XGalix(P, D.turretPivot);
  addStrv122XBustle(P, D.turretPivot);
  addStrv122XSurfaceAssembly(P,D.turretPivot);
  machineGun(P);
  gun(P);
}

export const STRV122_X_PROFILES = Object.freeze({ strv122_x: { build: buildStrv122X } });
