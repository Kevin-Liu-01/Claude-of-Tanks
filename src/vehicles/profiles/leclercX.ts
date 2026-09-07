// Independent Leclerc reconstruction from the owner-supplied Char Leclerc
// scalar study. The older same-author model is supplementary, not a variant.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { addLeclercXRearFittings } from './leclercXRearFittings.ts';
import { leclercWheelSolids } from './leclercXWheels.ts';
import { addLeclercXPanoramicSight } from './leclercXSight.ts';
import { addLeclercXFrontSkirts } from './leclercXFrontSkirts.ts';
import { addLeclercXRearRack } from './leclercXRearRack.ts';
import { addLeclercXFrontGuards, addLeclercXAntennaStocks } from './leclercXSourceFittings.ts';
import { addLeclercXPortRoof, leclercXWellRoofPoints } from './leclercXPortRoof.ts';
import { addLeclercXRearTerrace, leclercXRearShoulderRing } from './leclercXRearShoulders.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;
type Point = readonly [number, number, number];
type Row = readonly [z: number, left: number, right: number, floor: number, roof: number];

export const LECLERC_X_DATUMS = Object.freeze({
  leclerc_x: {
    dims: { hullLengthM: 7.1303053, overallLengthM: 9.8043880, widthM: 3.6, heightM: 2.36494 },
    structuralRoofY: 2.36494, fixedOpticHeightM: 2.764625, highestFittingM: 3.0665927,
    turretPivot: [-.00215336, 1.40294995, .72122934] as Point,
    // Source gun object repeats the yaw origin. Its actual rear housing
    // station and independent straight-bore cuts define this physical datum.
    trunnion: [.018886, 1.8791055, 1.998880] as Point,
    muzzleZ: 6.239235,
  },
});
const D = LECLERC_X_DATUMS.leclerc_x;

function local(g: THREE.BufferGeometry, origin: Point): THREE.BufferGeometry {
  return g.translate(-origin[0], -origin[1], -origin[2]);
}

function prism(rows: readonly Row[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, a, b, low, high]) => ({ z,
    ring: [[a, low], [b, low], [b, high], [a, high]],
  })));
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x - D.turretPivot[0], y - D.turretPivot[1], z - D.turretPivot[2], rx, ry, rz);
}

function hull(P: TankBuilderPort): void {
  const rows = [
    [-3.2068, .948, 1.6029], [-3.0, .70743, 1.60175], [-2.80, .4248, 1.60039],
    [-2.64, .321, 1.5993], [-1.9535, .3104, 1.5946], [-1.6777, .3061, 1.5850],
    [-1.3274, .3007, 1.5781], [-.8307, .2951, 1.5785], [-.6610, .2946, 1.50967],
    [.3832, .2915, 1.507034], [1.8387, .2929, 1.457137], [2.1627, .3017, 1.431081],
    [2.4152, .312, 1.415], [2.80, .4448, 1.344], [3.14, .613, 1.285], [3.3454, 1.04, 1.25308],
  ];
  const sections: SolidSection[] = rows.map(([z, bottom, roof]) => ({ z, ring: [
    [-.97556, bottom], [.95971, bottom], [.95971, roof], [-.97556, roof],
  ] }));
  P.add('hull', sectionSolid(sections));
  // Raised side carriers remain above the running gear; their lower skirt
  // sheets are authored separately so the track bay is not a filled box.
  for (const side of [-1, 1]) {
    const a = side < 0 ? -1.65 : .953, b = side < 0 ? -.969 : 1.65;
    P.add('hull', prism([[-3.2117, a, b, 1.205, 1.5975], [-2.08, a, b, 1.205, 1.5132],
      [2.1483, a, b, 1.205, 1.457381], [3.3569, a, b, 1.214, 1.246904]]));
  }
  P.add('hull', cylY(.8104, .8104, .062, 48), -.002153, 1.523, .721229);
  // Four millimetre overlay is real sheetwork over the source bow plane.
  P.add('hull', prism([[2.2510, -1.4373, 1.4481, 1.4394, 1.44367],
    [3.3454, -1.4373, 1.4481, 1.2488, 1.25308]]));
}

function runningGear(P: TankBuilderPort): void {
  const zs = [-1.90045, -1.10856, -.26549, .56651, 1.38765, 2.17177];
  const wheels = leclercWheelSolids();
  // Source upper shoe faces rise from about 1.17 to 1.185 m. Concealed return
  // supports are inferred, but seat that measured course rather than a low
  // generic run. Ground/road axes are unchanged by the optional rounded knee.
  const rollers = [-1.52, -.12, 1.28].map(z => ({ z, y: 1.016 + .0023 * z, r: .095 }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .3307865, wheelW: .526689, wheelY: .4040425,
    wheelTireBands: [-.1563971, .1563971].map(centerM => ({ centerM,
      widthM: .2138948, innerRadiusM: .2753843 })),
    wheelCoreGeometry: { disc: wheels.core },
    wheelFaceLayers: wheels.faces.flatMap(({ side, steel, rubber }) => [
      { geometry: steel, material: P.mats.wheels, side, name: `leclercSourceWheelSteel${side}` },
      { geometry: rubber, material: P.mats.rubber, side, name: `leclercSourceWheelGroove${side}` },
    ]),
    wheelZs: zs, roadWheelOutsetLeftM: .019049, roadWheelOutsetRightM: -.021407,
    xc: 1.2943, xcLeft: 1.3158745, xcRight: 1.2727975, trackW: .636079,
    // Source Object_5 tread plates span 525.327 mm inside the separate
    // 636.079 mm pin/link envelope. Preserve connector air rather than
    // making the concealed continuous carrier as wide as the pins.
    trackCarrierWidthM: .525327, trackTh: .028, botY: .0525, topY: 1.132315,
    trackShoeDimensions: { padHeight: .027, grouserHeight: .013, webHeight: .026,
      hornHeight: .081, pinRadius: .0222443, pinCentreY: -.0051314 },
    pinCapOuter: .3180395,
    // Separate measured pad, rectangular connector forging and round cap.
    // Source connector's tiny .224° pitch is bounded here by a level forging
    // (<.2 mm end-face difference), not by filling its surrounding link air.
    trackLinkCrossSection: { padWidthM: .5253277, pinCapLengthM: .0404054,
      pinHalfSpacingM: .0388075, connectorInnerM: .2577995, connectorOuterM: .3099674,
      connectorHeightM: .035629, connectorDepthM: .0985811, connectorCentreYDeltaM: -.0005601 },
    // Native r is a recipe input: its outer drum ring is .94*r, while the
    // tooth crown is independently measured. Do not enlarge both together.
    sprocket: { z: -2.57518, y: .77031, r: .309915, trackR: .317005,
      toothTipRadiusM: .389405, axleOutsetLeftM: .0210975, axleOutsetRightM: -.022555,
      axialScaleLeft: .7504657, axialScaleRight: .7504657 },
    idler: { z: 2.86860, y: .79055, r: .3392682, trackR: .297265,
      axleOutsetLeftM: .019049, axleOutsetRightM: -.021407,
      axialScaleLeft: .9008438, axialScaleRight: .9008438 },
    rollers,
    returnRollerWidthM: .22, returnRollerInsetM: .09,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { z: 2.86860, y: .79055, r: .297265 },
      sprocket: { z: -2.57518, y: .77031, r: .317005 },
      contact: KIT.runningGearContactPatch(zs, .3307865), botY: .0525, topY: 1.132315,
      sag: .008, supports: rollers.map(r => ({ z: r.z, y: r.y + r.r + .014 })),
    }), .0525, .34),
    rigidLinkChords: true,
    arms: true, paintedEnds: true, coveredTop: true,
  });
}

function thinSkirts(P: TankBuilderPort, side: number): void {
  const x = side < 0 ? -1.6791 : 1.66564;
  for (const [back, front] of [[-3.1594, -2.0659], [-2.0508, -1.2344],
    [-1.2188, -.4024], [-.3717, .4447], [.4640, 1.2505]]) {
    P.addExternalArmor('hull', box(.0289, .45487, front - back), x, .975005, (back + front) / 2);
    for (const z of [back + .055, front - .055]) {
      P.addEquipment('hullDetail', cylX(.012, .012, 8), x + side * .019, 1.145, z);
    }
  }
  // Source-backed inner flexible sheet extends below the rigid outer panels.
  P.addMudguard(`leclerc_x_inner_skirt_${side}`, 'hullDark', box(.012, .70704, 3.29236),
    side < 0 ? -1.67482 : 1.6616, .84844, -.40894);
  P.add('hull', box(.032, .282, 3.31), x, 1.353, -.404);
}

function skirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    thinSkirts(P, side);
    addLeclercXFrontSkirts(P, side);
  }
  addLeclercXFrontGuards(P);
}

function deck(P: TankBuilderPort): void {
  P.addEquipment('hullDetail', box(1.89, .019, .110), -.00082, 1.6035, -2.0026, -.0068);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.70, .025, .89), side * 1.30, 1.615, -2.72);
    for (let i = 0; i < 9; i++) P.addEquipment('hullDark', box(.65, .012, .027),
      side * 1.30, 1.632, -3.07 + i * .080);
    for (let i = 0; i < 6; i++) P.addEquipment('hullDetail', box(.92, .018, .040),
      side * .65, 1.352 - i * .042, -3.209, -.228);
    const x = side > 0 ? .8324 : -.8066;
    P.addEquipment('hullDetail', box(.122, .05135, .11536), x, 1.25063, 3.27196);
    P.addEquipment('hullGlass', markVehicleNightLens(box(.087, .028, .006), 'headlight'), x, 1.256, 3.333);
    P.addEquipment('hullDetail', box(.40, .08, .13), side * 1.05, 1.339, 3.09, .17);
  }
  P.addEquipment('hullDetail', cylY(.102, .102, .21, 20), 1.496, 1.477, -3.416);
  P.addHatch('hullDetail', box(.63, .034, .41), .70, 1.513, 1.77, .080);
  P.addEquipment('hullDetail', box(.53, .075, .108), .70, 1.528, 1.972);
  P.addEquipment('hullDark', box(.45, .034, .028), .70, 1.556, 2.018);
}

function turretShell(P: TankBuilderPort): void {
  // The source's rotating chamfered collar is mostly hidden by the hull in
  // neutral pose, but remains real turret geometry in isolated/yawed views.
  const collar = new THREE.LatheGeometry([
    [0, 1.253175], [.79131, 1.253175], [.86766, 1.26790],
    [.86766, 1.538998], [.79131, 1.552724], [0, 1.552724],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  collar.translate(.0017613, 0, .725144);
  P.add('turret', local(collar, D.turretPivot));
  turretLowerCheeks(P);
  // Upper armor is genuinely terraced: port bustle roof, starboard crew
  // deck and center spine are not replaced by one full-width tall slab.
  addLeclercXPortRoof(P, D.turretPivot);
  addLeclercXRearTerrace(P, D.turretPivot);
  P.add('turret', local(prism([[-.36, -.2289, 1.3360, 2.060, 2.24775],
    [.6584, -.12, 1.18, 2.008, 2.32099]]), D.turretPivot));
  P.add('turret', local(prism([[-.375, -.2994, .4803, 1.542, 2.23161],
    [1.52, -.2994, .4408, 1.545, 2.22063], [1.95, -.295, .423, 1.6108, 2.130384],
    [2.0, -.295, .4172, 1.6137, 2.133793], [2.03, -.295, .4172, 1.6545, 2.065562],
    [2.08, -.295, .4172, 1.654, 1.686144]]), D.turretPivot));
}

function turretLowerCheeks(P: TankBuilderPort): void {
  // The source's low forward cheeks reach far beyond their narrower upper
  // roof terraces. These measured floor-edge stations must not be replaced
  // with a footprint inferred from roof-only cuts.
  const rows = [
    [-1.7831, -1.115, 1.095, 1.62836, 1.9244, 1.9244],
    [-1.4905, -1.54, 1.5114, 1.554, 2.05523, 2.05523],
    [-1.36, -1.63774, 1.57536, 1.554, 2.059, 2.059],
    [-.3965, -1.63759, 1.57536, 1.554, 2.0630, 2.0630],
    [0, -1.637741, 1.575363, 1.553931, 2.105, 2.10],
    [.5, -1.632321, 1.575363, 1.54657, 2.046, 2.046],
    [1, -1.625247, 1.575363, 1.546567, 2.040, 2.040],
    [1.3, -1.562671, 1.536204, 1.546567, 2.035, 2.034858],
    [1.5, -1.492471, 1.522484, 1.546567, 2.007347, 1.979962],
    [1.7, -1.325844, 1.421114, 1.546567, 1.967488, 1.931539],
    [1.9, -1.159218, 1.273623, 1.546567, 1.920302, 1.877397],
    [2.03, -1.038112, 1.015002, 1.546567, 1.860, 1.785],
    [2.08, -.995720, .476243, 1.546567, 1.835, 1.685736],
    [2.20, -.893981, -.288783, 1.546567, 1.765, 1.75256],
    [2.235, -.420693, -.294273, 1.546567, 1.568, 1.567382],
    [2.237097, -.295, -.294, 1.546567, 1.548, 1.548],
  ];
  // Explicit stations retain the genuine well's bounded floor transition;
  // elsewhere additional top points are coplanar subdivisions only.
  for (const z of [-1.329, -1.25, -1.1, -.95, -.8, -.65, -.5, -.395,
    -.2867, -.2866, .6491, .6492]) {
    const index = rows.findIndex(row => row[0] > z), a = rows[index - 1], b = rows[index];
    const t = (z - a[0]) / (b[0] - a[0]);
    rows.splice(index, 0, a.map((value, i) => i === 0 ? z : value + (b[i] - value) * t));
  }
  const sections: SolidSection[] = rows.map(([z, left, right, floor, port, starboard]) => {
    const span = right - left, edge = Math.min(.10, span * .15), top = Math.min(.32, span * .30);
    const rise = z < 1.04 ? .20 : .010;
    const lowL = Math.min(port - .001, floor + rise), lowR = Math.min(starboard - .001, floor + rise);
    const midL = Math.max(lowL + .0001, port - .15), midR = Math.max(lowR + .0001, starboard - .15);
    return { z, ring: leclercXRearShoulderRing(z, [[left, floor], [right, floor], [right, lowR],
      [right - edge, midR], [right - top, starboard],
      ...leclercXWellRoofPoints(z, left + top, right - top, port, starboard), [left + top, port],
      [left + edge, midL], [left, lowL]]) };
  });
  P.add('turret', local(sectionSolid(sections), D.turretPivot));
}

function optics(P: TankBuilderPort): void {
  // Port primary sight: separate floor, roof and side walls, with the actual
  // source glass behind the forward rain hood. The central gun is separate.
  equipment(P, 'turretDetail', box(.43, .37, .55), -.536, 2.070, 1.66);
  equipment(P, 'turretGlass', box(.393216, .334854, .008), -.539778, 2.073559, 1.966792);
  for (const x of [-.751, -.328]) equipment(P, 'turretDetail', box(.023, .399, .218), x, 2.066, 2.079);
  for (const y of [1.873, 2.251]) equipment(P, 'turretDetail', box(.446, .019, .225), -.5398, y, 2.076);
  addLeclercXPanoramicSight(P, D.turretPivot);
}

function roofEquipment(P: TankBuilderPort): void {
  P.add('turret', cylY(.29516, .29516, .17, 24), .758475 - D.turretPivot[0], 2.265 - D.turretPivot[1], .3509 - D.turretPivot[2]);
  P.addHatch('turretDetail', cylY(.224034, .224034, .0616, 20), .758475 - D.turretPivot[0],
    2.353056 - D.turretPivot[1], .358037 - D.turretPivot[2]);
  addLeclercXAntennaStocks(P, D.turretPivot);
  equipment(P, 'turretDetail', cylY(.051, .06277, .49431, 16), .03843, 2.51482, -1.65486);
  equipment(P, 'turretDetail', cylY(.071, .071, .0337, 16), .03843, 2.252, -1.658);
  // Mandatory game roof weapon on the existing crew hatch. The supplied
  // neutral source omits it; this low supported assembly is documented.
  const mg = sourceMachineGun(P, D.turretPivot);
  mg.add('turretDetail', box(.09, .077, .12), .90, 2.410, .358);
  mg.add('turretDark', box(.080, .072, .265), .90, 2.475, .460);
  mg.add('turretDark', cylZ(.019, .48, 20), .90, 2.479, .8125);
  mg.add('turretDark', cylZ(.006, .006, 16), .90, 2.479, 1.055);
  mg.finish();
}

function rearRack(P: TankBuilderPort): void {
  addLeclercXRearRack(P);
}

function weapons(P: TankBuilderPort): void {
  const [gx, gy, gz] = D.trunnion;
  P.muzzleZ = D.muzzleZ - gz;
  P.add('gunMount', local(prism([[1.990, -.1597, .2009, 1.70837, 2.0713],
    [2.15, -.1597, .2009, 1.70837, 2.13213], [2.6442, -.1597, .2009, 1.70837, 2.13213]]), D.trunnion));
  for (const side of [-1, 1]) for (const z of [2.175, 2.363, 2.541]) {
    P.add('gunMount', box(.025, .246, .052), side < 0 ? -.184 - gx : .210 - gx, 1.949 - gy, z - gz);
  }
  const sleeve = sectionSolid([2.53294, 2.82, 5.90, 6.1405].map(z => {
    const t = Math.max(0, (z - 2.82) / 3.3205), bottom = 1.704 + .040 * t;
    const rx = .144 - .011 * t, top = 2.010136, cy = (bottom + top) / 2;
    return { z, ring: Array.from({ length: 32 }, (_, i) => {
      const a = i * Math.PI / 16;
      return [gx + rx * Math.cos(a), cy + (top - cy) * Math.sin(a)] as const;
    }) };
  }));
  P.add('gun', local(sleeve, D.trunnion));
  const muzzle = new THREE.CylinderGeometry(.118123, .128740, .099, 32, 1, true);
  muzzle.rotateX(Math.PI / 2);
  P.add('gun', muzzle, 0, 0, 6.189735 - gz);
  const bore = new THREE.CylinderGeometry(.060, .060, .30, 32, 1, true);
  bore.rotateX(Math.PI / 2);
  P.add('gunDark', bore, 0, 0, P.muzzleZ - .15);
  P.add('gun', new THREE.RingGeometry(.060, .118123, 32), 0, 0, P.muzzleZ);
  P.add('gunDark', cylZ(.060, .006, 32), 0, 0, P.muzzleZ - .303);
  P.add('gun', box(.067, .041, .22), .01843 - gx, 1.99617 - gy, 6.0881 - gz);
  for (const x of [-.006, .042]) P.add('gun', box(.013, .048, .074),
    x - gx, 2.0363 - gy, 6.0881 - gz);
  P.add('gun', cylZ(.042, .1342, 20), .01776 - gx, 2.066285 - gy, 6.1146 - gz);
  P.add('gunDark', cylZ(.027, .006, 16), .01776 - gx, 2.066285 - gy, 6.184 - gz);
}

export function buildLeclercX(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(...D.trunnion.map((v, i) => v - D.turretPivot[i]) as [number, number, number]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  skirts(P);
  deck(P);
  addLeclercXRearFittings(P);
  turretShell(P);
  optics(P);
  roofEquipment(P);
  rearRack(P);
  weapons(P);
}

export const LECLERC_X_PROFILES = Object.freeze({ leclerc_x: { build: buildLeclercX } });
