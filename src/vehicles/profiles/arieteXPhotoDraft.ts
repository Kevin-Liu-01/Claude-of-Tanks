// HISTORICAL PHOTO DRAFT — test-only, not a playable registry entry or current
// X acceptance target. Superseded by the owner's supplied-file instruction.
// First-party C1 Ariete reconstruction. Envelope: original CIO technical sheet;
// subassembly layout: dated Army photographs. The supplied AI mesh is never
// a metric oracle, runtime dependency, donor builder, or source of topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { addArieteXLaunchers, addArieteXRearStowage } from './arieteXEquipment.ts';
import { arietePhotoWheelSolids } from './primaryPhotoWheelSolids.ts';
import { addArieteXOpticalHead, addArieteXRoofFurniture, addArieteXWheelFasteners } from './arieteXPhotoDetails.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Row = readonly [z: number, halfWidth: number, bottom: number, shoulder: number, roof: number];

export const ARIETE_X_DATUMS = Object.freeze({
  ariete_c1_x: {
    dims: { hullLengthM: 7.99, overallLengthM: 9.87, widthM: 3.61, heightM: 2.50 },
    structuralRoofY: 2.50, fixedOpticHeightM: 2.86, highestFittingM: 3.92,
    // Photo-estimated mechanical stations, not extracted AI object origins.
    turretPivot: [0, 1.60, .56] as Point,
    trunnion: [0, 2.08, 1.77] as Point,
    muzzleZ: 5.875,
  },
});
const D = ARIETE_X_DATUMS.ariete_c1_x;

function local(geometry: THREE.BufferGeometry, point: Point): THREE.BufferGeometry {
  return geometry.translate(-point[0], -point[1], -point[2]);
}

function equipment(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, geometry, x - D.turretPivot[0], y - D.turretPivot[1],
    z - D.turretPivot[2], rx, ry, rz);
}

function hull(P: TankBuilderPort): void {
  const rows: readonly Row[] = [
    [-3.92, 1.02, .98, 1.59, 1.74], [-3.55, 1.04, .57, 1.62, 1.79],
    [-2.85, 1.04, .48, 1.58, 1.82], [-1.36, 1.04, .48, 1.55, 1.68],
    [.55, 1.04, .48, 1.51, 1.63], [1.98, 1.04, .48, 1.48, 1.60],
    [2.72, 1.02, .48, 1.37, 1.47], [3.50, .99, .71, 1.15, 1.27],
    [3.92, .97, .98, 1.08, 1.17],
  ];
  const sections: SolidSection[] = rows.map(([z, width, bottom, shoulder, roof]) => {
    // The central bow terminates between the separate lamp/guard stations;
    // there is no full-width armor slab through either idler's upper course.
    const outer = 1.61 - Math.min(1, Math.max(0, (z - 2.72) / .78)) * .50;
    return { z, ring: [[-width, bottom], [width, bottom], [width + .04, bottom + .08],
      [width + .04, shoulder], [outer, shoulder], [outer - .03, roof], [-outer + .03, roof],
      [-outer, shoulder], [-width - .04, shoulder], [-width - .04, bottom + .08]] };
  });
  P.add('hull', sectionSolid(sections));
  P.add('hull', cylY(.84, .88, .07, 48), 0, 1.63, .56);
}

function runningGear(P: TankBuilderPort): void {
  const wheel = arietePhotoWheelSolids();
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .347, wheelW: .39, wheelY: .423,
    wheelTireInnerRadiusM: .314,
    wheelCoreGeometry: { disc: addArieteXWheelFasteners(wheel.core) },
    wheelFaceLayers: [{ geometry: wheel.shoulder, material: P.mats.rubber,
      name: 'arietePhotoWheelRubberShoulders', appearanceRole: 'wheelTire' }],
    wheelZs: [-2.57, -1.73, -.89, -.05, .79, 1.63, 2.47],
    xc: 1.425, trackW: .57, trackTh: .025, topY: 1.22, botY: .058,
    trackShoeDimensions: { padHeight: .030, grouserHeight: .014, webHeight: .029, hornHeight: .095 },
    sprocket: { z: -3.36, y: .84, r: .33, trackR: .329 },
    idler: { z: 3.30, y: .82, r: .29, trackR: .298 },
    rollers: [-2.13, -.44, 1.25, 2.09].map(z => ({ z, y: 1.085, r: .10 })),
    returnRollerWidthM: .20, returnRollerInsetM: .12,
    arms: true, paintedEnds: true, coveredTop: true,
  });
}

function skirt(P: TankBuilderPort, side: number): void {
  const x = side * 1.791;
  for (const [back, front] of [[-3.26, -2.25], [-2.23, -1.20], [-1.18, -.15],
    [-.13, .90], [.92, 1.95], [1.97, 3.02]]) {
    P.addExternalArmor('hull', box(.028, .59, front - back), x, 1.13, (back + front) / 2);
    for (const z of [back + .055, front - .055]) {
      P.addEquipment('hullDetail', box(.043, .078, .087), side * 1.787, 1.451, z);
      P.addEquipment('hullDetail', cylX(.014, .018, 8), side * 1.810, 1.42, z);
    }
  }
  P.add('hull', box(.073, .10, 6.35), side * 1.732, 1.474, -.09);
  for (const [back, front, y0, y1] of [[3.00, 3.63, 1.45, 1.23],
    [3.63, 3.995, 1.23, 1.19], [-3.995, -3.36, 1.40, 1.49]]) {
    const a = Math.min(side * 1.115, side * 1.805), b = Math.max(side * 1.115, side * 1.805);
    P.addMudguard(`ariete_c1_x_guard_${side}_${back}`, 'hullDetail', sectionSolid([
      { z: back, ring: [[a, y0 - .045], [b, y0 - .045], [b, y0], [a, y0]] },
      { z: front, ring: [[a, y1 - .045], [b, y1 - .045], [b, y1], [a, y1]] },
    ]));
  }
  P.addMudguard(`ariete_c1_x_front_flap_${side}`, 'hullDark', box(.69, .32, .025),
    side * 1.46, 1.035, 3.979);
  P.addMudguard(`ariete_c1_x_rear_flap_${side}`, 'hullDark', box(.67, .30, .025),
    side * 1.46, 1.225, -3.974);
}

function engineDeck(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.78, .030, 1.30), side * .69, 1.822, -2.64);
    for (let i = 0; i < 16; i++) {
      P.addEquipment('hullDark', box(.72, .013, .031), side * .69, 1.842, -3.21 + i * .076);
    }
    // Rear flank cooling louvers are horizontal sheets on a real backing.
    P.addEquipment('hullDark', box(.040, .29, 1.68), side * 1.619, 1.574, -2.47);
    for (let i = 0; i < 8; i++) P.addEquipment('hullDetail', box(.050, .014, 1.65),
      side * 1.646, 1.451 + i * .035, -2.47);
    P.addEquipment('hullDetail', box(.55, .12, .28), side * 1.33, 1.475, -3.73);
    P.addEquipment('hullDetail', box(.24, .20, .12), side * .85, 1.205, -3.915);
    P.addEquipment('hullDetail', torus(.066, .018, 16, 6), side * .85, 1.13, -3.975, Math.PI / 2);
  }
}

function spareLink(P: TankBuilderPort, x: number, z: number): void {
  const y = 1.52 - (z - 2.57) * .28;
  P.addEquipment('hullDark', box(.215, .044, .19), x, y, z, .27);
  for (const dx of [-.085, .085]) {
    P.addEquipment('hullDetail', cylX(.034, .039, 12), x + dx, y + .035, z + .015);
    P.addEquipment('hullDetail', box(.023, .052, .13), x + dx, y + .041, z, .27);
  }
  P.addEquipment('hullDetail', box(.15, .052, .031), x, y + .042, z - .065, .27);
}

function bow(P: TankBuilderPort): void {
  // Dated photographs show two staggered carried-link rows, not an ERA slab.
  for (let i = 0; i < 7; i++) spareLink(P, -.78 + i * .26, 2.91);
  for (let i = 0; i < 6; i++) spareLink(P, -.65 + i * .26, 2.67);
  P.addHatch('hullDetail', cylY(.35, .35, .026, 32), .70, 1.651, 1.67);
  for (const x of [.50, .70, .90]) {
    P.addEquipment('hullDetail', box(.16, .077, .13), x, 1.677, 1.94, .12);
    P.addEquipment('hullGlass', box(.125, .038, .006), x, 1.682, 2.009, .12);
  }
  for (const side of [-1, 1]) {
    const x = side * 1.45;
    const hood = sectionSolid([{ z: 3.39, ring: [[x - .27, 1.20], [x + .27, 1.20],
      [x + .17, 1.58], [x - .17, 1.58]] }, { z: 3.72, ring: [[x - .27, 1.20],
      [x + .27, 1.20], [x + .17, 1.53], [x - .17, 1.53]] }]);
    P.addEquipment('hullDetail', hood);
    P.addEquipment('hullDark', box(.36, .228, .018), x, 1.379, 3.729);
    for (const dx of [-.10, .10]) {
      P.addEquipment('hullDetail', cylZ(.077, .055, 20), x + dx, 1.405, 3.752);
      P.addEquipment('hullGlass', cylZ(.062, .006, 20), x + dx, 1.405, 3.782);
    }
    P.addEquipment('hullDetail', cylZ(.026, .013, 12), x, 1.287, 3.746);
    P.addEquipment('hullDetail', box(.10, .11, .15), side * .91, 1.06, 3.83);
    P.addEquipment('hullDetail', torus(.078, .022, 16, 6), side * .91, 1.00, 3.925, Math.PI / 2);
  }
}

function turret(P: TankBuilderPort): void {
  // The bustle's underside rises toward both ends. This leaves the visible
  // rear wedge and bearing clearance instead of filling it with a tall box.
  const rows: readonly Row[] = [[-2.03, 1.24, 1.94, 2.06, 2.48],
    [-1.59, 1.49, 1.77, 2.04, 2.50], [-.37, 1.49, 1.66, 2.01, 2.50],
    [.82, 1.43, 1.67, 2.02, 2.50], [1.35, 1.33, 1.72, 2.03, 2.46]];
  P.add('turret', local(sectionSolid(rows.map(([z, w, low, shoulder, roof]) => ({ z,
    ring: [[-.76 * w, low], [.76 * w, low], [w, shoulder], [w, roof],
      [-w, roof], [-w, shoulder]],
  }))), D.turretPivot));
  P.add('turret', local(cylY(.82, .82, .13, 48).translate(0, 1.64, .56), D.turretPivot));
  for (const side of [-1, 1]) {
    const sections: SolidSection[] = [[1.30, 1.34, 2.46, 1.72],
      [1.95, 1.09, 2.32, 1.88], [2.35, .50, 2.15, 2.00]].map(([z, outer, roof, floor]) => {
      const a = Math.min(side * .27, side * outer), b = Math.max(side * .27, side * outer);
      return { z, ring: [[a, floor], [b, floor], [b, roof - .09], [a, roof]] };
    });
    P.add('turret', local(sectionSolid(sections), D.turretPivot));
    equipment(P, 'turretDetail', box(.063, .31, .48), side * 1.53, 2.256, -.30);
    for (const z of [-1.22, -.57, .06]) {
      equipment(P, 'turretDetail', box(.025, .26, .028), side * 1.508, 2.25, z);
      equipment(P, 'turretDetail', cylX(.010, .013, 8), side * 1.531, 2.135, z);
    }
  }
}

function crewRoof(P: TankBuilderPort): void {
  for (const [x, z, radius] of [[.64, -.28, .34], [-.62, -.21, .32]]) {
    equipment(P, 'turretDetail', cylY(radius, radius + .025, .062, 32), x, 2.521, z);
    P.addHatch('turretDetail', cylY(radius - .035, radius - .035, .026, 32),
      x, 2.566 - D.turretPivot[1], z - D.turretPivot[2]);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      equipment(P, 'turretDetail', box(.095, .071, .072), x + Math.sin(angle) * radius,
        2.576, z + Math.cos(angle) * radius, 0, angle);
      equipment(P, 'turretGlass', box(.071, .022, .005), x + Math.sin(angle) * (radius + .037),
        2.580, z + Math.cos(angle) * (radius + .037), 0, angle);
    }
  }
  addArieteXOpticalHead(P, D.turretPivot);
  addArieteXRoofFurniture(P, D.turretPivot);
  for (const x of [-1.06, 1.06]) {
    equipment(P, 'turretDetail', cylY(.050, .065, .085, 16), x, 2.534, -1.42);
    equipment(P, 'turretDark', cylY(.004, .009, 1.36, 10), x, 3.24, -1.42);
  }
}

function machineGun(P: TankBuilderPort): void {
  const mg = sourceMachineGun(P, D.turretPivot), x = -.78, z = .07;
  mg.add('turretDetail', cylY(.052, .067, .16, 16), x, 2.645, z);
  for (const dx of [-.063, .063]) mg.add('turretDetail', box(.022, .115, .13),
    x + dx, 2.742, z);
  mg.add('turretDark', box(.117, .112, .32), x, 2.796, z + .08);
  mg.add('turretDark', cylZ(.024, .54, 16), x, 2.813, z + .49);
  mg.add('turretDetail', box(.11, .13, .16), x - .10, 2.78, z + .06);
  mg.add('turretDark', box(.09, .07, .16), x, 2.775, z - .16);
  mg.finish();
}

function gun(P: TankBuilderPort): void {
  const cradle = sectionSolid([{ z: 1.55, ring: [[-.245, 1.86], [.245, 1.86],
    [.245, 2.40], [-.245, 2.40]] }, { z: 2.39, ring: [[-.245, 1.99], [.245, 1.99],
    [.245, 2.255], [-.245, 2.255]] }]);
  P.add('gunMount', local(cradle, D.trunnion));
  const profile = [[1.91, .133], [2.36, .133], [2.43, .115], [3.44, .115],
    [3.47, .157], [4.02, .157], [4.10, .103], [5.68, .089], [5.875, .085]];
  const points = profile.map(([z, radius]) => new THREE.Vector2(radius, z - D.trunnion[2]));
  // Lathe's +Y construction axis becomes the vehicle's +Z bore axis.
  const tube = new THREE.LatheGeometry(points, 40).rotateX(Math.PI / 2);
  P.add('gun', tube);
  for (const z of [2.49, 3.34, 4.14, 5.34]) {
    const r = z < 3.45 ? .122 : z < 4.12 ? .164 : .104;
    P.add('gun', torus(r, .008, 20, 6), 0, 0, z - D.trunnion[2], Math.PI / 2);
  }
  const bore = new THREE.CylinderGeometry(.060, .060, .28, 40, 1, true);
  bore.rotateX(Math.PI / 2);
  P.add('gunDark', bore, 0, 0, D.muzzleZ - .14 - D.trunnion[2]);
  P.add('gun', new THREE.RingGeometry(.060, .085, 40), 0, 0, D.muzzleZ - D.trunnion[2]);
  P.add('gunDark', cylZ(.061, .003, 32), 0, 0, D.muzzleZ - .281 - D.trunnion[2]);
  P.add('gun', box(.082, .089, .065), -.073, .092, 5.69 - D.trunnion[2]);
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

export function buildArieteX(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(...D.trunnion.map((value, i) => value - D.turretPivot[i]) as [number, number, number]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  for (const side of [-1, 1]) skirt(P, side);
  engineDeck(P);
  bow(P);
  turret(P);
  crewRoof(P);
  machineGun(P);
  addArieteXLaunchers(P, D.turretPivot);
  addArieteXRearStowage(P, D.turretPivot);
  gun(P);
}

export const ARIETE_X_PROFILES = Object.freeze({ ariete_c1_x: { build: buildArieteX } });
