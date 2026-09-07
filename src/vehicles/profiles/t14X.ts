// New first-party Armata X: authored from scalar source measurements and
// neutral source views, not the old T-14 builder or source topology.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addT14CornerJunction, sourceCornerZ } from './t14XCorner.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';

const { box, cylY, cylZ, torus } = KIT;
const RING_Y = 1.69;
const RING_Z = -.22;
const localY = (worldY: number) => worldY - RING_Y;
const localZ = (worldZ: number) => worldZ - RING_Z;

function tubSection(z: number, width: number, roof: number, bottom: number): SolidSection {
  // Vertical inner wheel-well wall: no diagonal shoulder passing through the
  // high return course. The upper shoulder is part of the same closed solid.
  const inner = Math.min(1.00, width - .14);
  const step = Math.min(roof - .06, 1.30);
  return { z, ring: [[-inner, bottom], [inner, bottom], [inner, step],
    [width, step], [width, roof - .035], [width - .10, roof],
    [-width + .10, roof], [-width, roof - .035], [-width, step], [-inner, step]] };
}

function addHull(P: TankBuilderPort): void {
  P.add('hull', sectionSolid([
    tubSection(-3.878, 1.34, 1.66, 1.423),
    tubSection(-3.8052, 1.60, 1.67, 1.20),
    tubSection(-3.7031, 1.60, 1.67, 1.00),
    tubSection(-3.6020, 1.60, 1.67, .80),
    tubSection(-3.50, 1.60, 1.67, .7062),
    tubSection(-2.90, 1.64, 1.66, .55),
    tubSection(-1.28, 1.64, 1.67, .42),
    tubSection(.20, 1.83, 1.67, .42),
    tubSection(2.05, 1.83, 1.67, .43),
    tubSection(2.40, 1.83, 1.538, .46),
    tubSection(2.80, 1.83, 1.501, .51),
    tubSection(3.20, 1.83, 1.455, .58),
    // The bow narrows between the raised idlers. Its separate wrap-over
    // fenders join the glacis; the central tub cannot cross the track arc.
    tubSection(3.47, 1.14, 1.386, .69),
    tubSection(3.60, 1.14, 1.323, .73),
    tubSection(4.00, 1.14, 1.124, .84),
    tubSection(4.17, 1.10, 1.03, .88),
    tubSection(4.30, 1.03, 1.00, .93),
  ]));
  P.gear = KIT.buildRunningGear(P, {
    wheelR: .3385, wheelW: .5455, wheelY: .4166, xc: 1.343,
    wheelZs: [-2.1577, -1.3711, -.5740, .2150, 1.0117, 1.8668, 2.7725],
    // Source flat-course islands are .542 m wide and .0683 m radially deep.
    // Keep the measured axles; explicitly size pad, web and guide instead of
    // inheriting the old fleet's .308 m generic Soviet guide envelope.
    trackW: .550, trackTh: .068, topY: 1.085, botY: .072,
    trackShoeDimensions: { padHeight: .018, grouserHeight: .008, webHeight: .012,
      hornHeight: .036, pinRadius: .012, pinCentreY: 0 },
    // Rim radii and shoe pitch radii differ: source complete track extent
    // is Z[-3.27183,3.82843], not the generic wheel-plus-clearance envelope.
    sprocket: { z: -2.9680, y: .8107, r: .3075, trackR: .19 },
    idler: { z: 3.5280, y: .8503, r: .2753, trackR: .185 },
    style: 'rubber', arms: true, paintedEnds: true, coveredTop: true,
  });
  addHullSides(P);
  addHullDeck(P);
  addSternFittings(P);
}

function addSternFittings(P: TankBuilderPort): void {
  // The aft fenders overhang the shorter central rear plate. Treating the
  // entire source rear envelope as one tub erases this genuine recess.
  for (const side of [-1, 1]) {
    const left = side < 0 ? -1.62 : 1.08, right = side < 0 ? -1.08 : 1.62;
    const geometry = sectionSolid([
      [-4.27, 1.38, 1.65], [-4.17, 1.19, 1.67],
      [-3.95, .98, 1.69], [-3.85, .76, 1.70], [-3.65, .82, 1.70],
    ].map(([z, low, high]) => ({ z, ring: [[left, low], [right, low],
      [right, high], [left, high]] })));
    P.add('hull', geometry);
    P.addEquipment('hullDetail', box(.049, .183, .119), side * 1.503, 1.511, -4.265);
    P.addEquipment('hullDark', cylY(.0211, .0211, .225, 12), side * 1.503, 1.512, -4.306);
    P.addEquipment('hullDetail', box(.30, .14, .06), side * .62, 1.06, -3.77);
    KIT.towCable(P, [[side * .30, 1.34, -3.90], [side * 1.05, 1.31, -3.87],
      [side * 1.17, 1.10, -3.79], [side * .90, .81, -3.67], [side * .46, .85, -3.72]], .022);
    for (let i = 0; i < 4; i++) P.addEquipment('hullDark', box(.19, .08, .065),
      side * .14, .94 + i * .10, -3.77 - i * .045);
  }
}

function addHullSides(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // Source front skirt terminates at the long open rear slat cage.
    for (let i = 0; i < 5; i++) {
      const z = -1.22 + i * .93;
      const top = z > 2 ? 1.66 - (z - 2) * .31 : 1.66;
      P.destructibleCluster(`skirt_era_${side < 0 ? 'L' : 'R'}`, () => {
      P.add('hull', markEraHitFaces(box(.18, top - .49, .915),[side,0,0]), side * 1.762, (top + .49) / 2, z + .46);
      P.addEquipment('hullDetail', markEraFurniture(box(.024, .045, .88)), side * 1.862, top - .08, z + .46);
      for (const dz of [.12, .80]) {
        P.addEquipment('hullDetail', markEraFurniture(cylZ(.026, .028, 10)), side * 1.864, .70, z + dz, 0, Math.PI / 2);
        P.addEquipment('hullDetail', markEraFurniture(box(.036, .17, .045)), side * 1.873, .72, z + dz);
      }
      });
    }
    addFrontShoulder(P, side);
    P.addMudguard('armata-x-front-flap', 'hullRubber', box(.8266, .1039, .026), side * 1.1754, .8996, 4.2874);
    P.addMudguard('armata-x-rear-flap', 'hullRubber', box(.625, .328, .086), side * 1.35, .924, -3.921);
    addRearLattice(P, side);
    addSideFixtures(P, side);
  }
}

function shoulderStrip(P: TankBuilderPort, side: number, inner: number, outer: number,
  rows: readonly (readonly [number, number, number])[]): void {
  const geometry = sectionSolid(rows.map(([z, bottom, top]) => {
    const ring: [number, number][] = [[inner, bottom], [outer, bottom], [outer, top], [inner, top]];
    return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
  }));
  P.addMudguard('armata-x-integrated-shoulder', 'hull', geometry);
}

function addFrontShoulder(P: TankBuilderPort, side: number): void {
  // Source armor is about .15 m above the old bare fender at Z4.0. Its
  // inboard cover and outboard rail enclose a real recessed lamp channel.
  shoulderStrip(P, side, .969, 1.589, [
    [2.05, 1.54, 1.66721], [2.40, 1.50, 1.63749],
    [2.72, 1.48, 1.61031], [2.90, 1.46, 1.59502], [3.074, 1.44, 1.57042],
    [3.20, 1.30, 1.551], [3.47, 1.30, 1.49228], [3.74, 1.22, 1.43372],
    [4.00, 1.10, 1.30624], [4.26, .94, 1.17331], [4.289, .94, 1.1585],
  ]);
  shoulderStrip(P, side, 1.706, 1.8345, [
    [3.20, 1.30, 1.545], [3.47, 1.30, 1.48359], [3.74, 1.23, 1.43466], [3.78, 1.22, 1.43466],
    [4.00, 1.10, 1.32151], [4.26, .84434, 1.17914], [4.293, .84434, 1.161],
  ]);
  shoulderStrip(P, side, 1.589, 1.706, [
    [3.20, 1.30, 1.42345], [3.752, 1.23, 1.42345],
  ]);
  shoulderStrip(P, side, 1.589, 1.706, [
    [3.752, 1.23, 1.43466], [3.78, 1.22, 1.43466],
    [4.00, 1.10, 1.32153], [4.26, .84434, 1.17918], [4.293, .84434, 1.161],
  ]);
  // Source Object_13 housing, partially recessed into the Y1.42345 floor;
  // no oversized dark box protruding over the shoulder.
  P.addEquipment('hullDark', box(.12624, .03979, .03979), side * 1.62075, 1.41738, 3.54464);
  P.addEquipment('hullGlass', box(.098, .023, .004), side * 1.62075, 1.425, 3.566);
}

function addRearLattice(P: TankBuilderPort, side: number): void {
    // Rear air gap remains real: slats and their brackets, not a filled wall.
    for (let j = 0; j < 14; j++) {
      const y = .808 + j * .069;
      const rearZ = y < 1.15 ? -3.81 - (y - .80) * 1.35 : -4.28;
      const frontZ = -1.28;
      P.addEquipment('hullOpenLattice', box(.025, .025, frontZ - rearZ), side * 1.936, y, (frontZ + rearZ) / 2);
    }
    for (const z of [-4.27, -3.29, -2.28, -1.28]) {
      const bottom = z < -4 ? 1.15 : .80;
      P.addEquipment('hullOpenLattice', box(.035, 1.713 - bottom, .035), side * 1.931, (1.713 + bottom) / 2, z);
      P.addEquipment('hullOpenLatticeDark', box(.36, .035, .04), side * 1.77, 1.55, z);
    }
    P.addEquipment('hullOpenLattice', box(.05, .025, 3.02), side * 1.93, 1.701, -2.78);
    P.addEquipment('hullDetail', box(.28, .02, 2.96), side * 1.60, 1.66, -2.76);
    for (let j = 0; j < 5; j++) {
      P.addEquipment('hullOpenLattice', box(.86, .022, .025), side * 1.08, 1.15 + j * .12, -4.27);
    }
}

function addSideFixtures(P: TankBuilderPort, side: number): void {
    P.addEquipment('hullDark', box(.48, .18, .035), side * 1.35, 1.38, -4.215);
    for (let j = 0; j < 7; j++) P.addEquipment('hullDetail', box(.42, .012, .018), side * 1.35, 1.304 + j * .024, -4.238);
    for (const z of [-3.15, -.82, 1.45]) P.addEquipment('hullDetail', torus(.035, .010, 12, 6), side * 1.46, 1.697, z, Math.PI / 2);
}

function addHullDeck(P: TankBuilderPort): void {
  addGlacisPanels(P);
  addGlacisServiceFittings(P);
  addCrewHatches(P);
  for (let i = 0; i < 3; i++) {
    const z = -3.31 + i * .81;
    P.addEquipment('hullDark', box(2.67, .024, .69), 0, 1.671, z);
    for (let j = 0; j < 17; j++) P.addEquipment('hullDetail', box(2.56, .020, .02), 0, 1.694, z - .31 + j * .039);
  }
  for (const x of [-.68, .68]) P.addEquipment('hullDark', cylZ(.07, .12, 12), x, 1.22, -3.85);
}

function glacisPanel(P: TankBuilderPort, x0: number, x1: number,
  z0: number, z1: number, top0: number, top1: number, depth: number, reactive = false): void {
  // A closed, positive-thickness strip seated through the supporting skin.
  // The source panel courses change slope; no rotated box bridges the bend.
  const geometry=sectionSolid([
    { z: z0, ring: [[x0, top0-depth], [x1, top0-depth], [x1, top0], [x0, top0]] },
    { z: z1, ring: [[x0, top1-depth], [x1, top1-depth], [x1, top1], [x0, top1]] },
  ]);
  P.addEquipment('hullDetail',reactive?markEraHitFaces(geometry,[0,1,0]):geometry);
}

function addGlacisPanels(P: TankBuilderPort): void {
  // Source Object_12: seven .24038 m long tiles and a separate short course,
  // not the former five-by-two generic ERA grid. Scalar plane/ray measurements
  // retain actual seams while the structural hull remains closed beneath them.
  const longTop = (z: number) => 1.419614 - (z-3.42)*.497925;
  for (let column = -3; column <= 3; column++) {
    const x = column*.2452;
    P.destructibleCluster(`glacis_era_${column < 0 ? 'L' : 'R'}`, () => {
    glacisPanel(P, x-.12019, x+.12019, 3.40636, 4.19376,
      longTop(3.40636), longTop(4.19376), .035,true);
    glacisPanel(P, x-.12019, x+.12019, 3.13987, 3.38505, 1.471735, 1.43102, .035,true);
    for (const dx of [-.086, .086]) for (const z of [3.442, 4.168]) {
      P.addEquipment('hullDetail', markEraFurniture(cylY(.0113,.0113,.010,6)), x+dx, longTop(z)+.003, z, Math.atan(.497925));
    }
    });
  }
  glacisPanel(P,-1.0033,.93054,2.69633,3.13504,1.596,1.47916,.14);
  for (const [x0,x1] of [[-.88695,-.48103],[-.47073,-.13203],[-.12423,.22497],[.23098,.63691]]) {
    glacisPanel(P,x0,x1,2.39911,2.69671,1.64467,1.59615,.13);
  }
  for (const [x0,x1] of [[-.85428,-.44835],[-.43996,-.03404]]) {
    glacisPanel(P,x0,x1,2.11843,2.41062,1.66347,1.616,.075);
  }
}

function addGlacisServiceFittings(P: TankBuilderPort): void {
  // Source's asymmetric low hatch and hinge lie on the broad central plate.
  glacisPanel(P,-.44632,-.10105,2.93907,3.14507,1.5602,1.5052,.043);
  P.addEquipment('hullDetail',cylZ(.01945,.19714,12),-.27368,1.57488,3.15888,0,Math.PI/2);
  P.addEquipment('hullDetail',box(.043,.049,.105),-.372,1.522,2.876,Math.atan(.27));
  glacisPanel(P,.63899,.9201,2.55943,2.68812,1.62486,1.596,.14);
  for (const x of [-.736,-.368,0,.368,.7315]) {
    P.addEquipment('hullDetail',cylY(.0158,.0158,.010,6),x,1.026,4.255,Math.atan(.497925));
  }
  for (const side of [-1,1]) for (const x of [.98577,1.26159,1.53638]) {
    for (const [z,y] of [[3.07419,1.572],[3.70636,1.443]]) {
      P.addEquipment('hullDetail',box(.03342,.018,.035),side*x,y,z,Math.atan(.217));
    }
  }
}

function clippedHatch(width: number, length: number, depth: number): THREE.BufferGeometry {
  // Authored eight-corner plan, not a rectangular lid hiding its rim.
  const w = width / 2, l = length / 2, cut = Math.min(.13, width / 4, length / 4);
  return sectionSolid([
    { z: -l, ring: [[-w + cut, 0], [w - cut, 0], [w - cut, depth], [-w + cut, depth]] },
    { z: -l + cut, ring: [[-w, 0], [w, 0], [w, depth], [-w, depth]] },
    { z: l - cut, ring: [[-w, 0], [w, 0], [w, depth], [-w, depth]] },
    { z: l, ring: [[-w + cut, 0], [w - cut, 0], [w - cut, depth], [-w + cut, depth]] },
  ]);
}

function addCrewHatches(P: TankBuilderPort): void {
  // The source crew stations are staggered, not a symmetric pair at Z1.82.
  for (const [x, z, width, length, top] of [[-.622, 1.80, .634, .478, 1.68108],
    [.5534, 1.61, .548, .249, 1.68877]]) {
    P.addEquipment('hullDark', clippedHatch(width + .055, length + .055, .019), x, 1.654, z);
    P.addHatch('hullDetail', clippedHatch(width, length, .018), x, top - .018, z);
    for (const dx of [-width * .32, width * .32]) {
      P.addEquipment('hullDetail', cylZ(.016, .075, 12), x + dx, top, z - length * .49, 0, Math.PI / 2);
    }
    P.addEquipment('hullDark', box(.13, .014, .017), x, top + .012, z + .06);
    for (const dx of [-.056, .056]) P.addEquipment('hullDetail', box(.017, .025, .023), x + dx, top, z + .06);
  }
  for (const [x, z, top] of [[-.6364, 2.0223, 1.75133], [.5534, 1.7327, 1.77295]]) {
    for (const dx of [-.24, 0, .24]) {
      P.addEquipment('hullDark', box(.206, .098, .17), x + dx, top - .049, z);
      P.addEquipment('hullGlass', box(.164, .042, .010), x + dx, top - .033, z + .088);
    }
  }
  P.addEquipment('hullDark', box(.2055, .102, .0967), .0211, 1.7226, 1.806);
  P.addEquipment('hullGlass', box(.148, .04, .009), .0211, 1.747, 1.857);
}

function turretSection(z: number, half: number, low: number, roof: number): SolidSection {
  return { z: localZ(z), ring: [[-half + .09, localY(low)], [half - .09, localY(low)],
    [half, localY(low + .12)], [half, localY(roof - .09)],
    [half - .12, localY(roof)], [-half + .12, localY(roof)],
    [-half, localY(roof - .09)], [-half, localY(low + .12)]] };
}

function frontZ(x: number, y: number): number {
  // Independently authored intersecting front planes. Scalar source probes,
  // not a sampled source contour, establish the distinct center/outer slopes.
  const inner = 3.03043 - .824 * y - Math.max(0, Math.abs(x) - .4645) * .682;
  const outer = 4.88067 - 1.351 * y - 1.113 * Math.abs(x);
  return Math.min(inner, outer, 1.35781);
}

function frontPanel(P: TankBuilderPort, side: number, x0: number, x1: number, y0: number, y1: number, depth = .15): void {
  const point = (x: number, y: number, back: boolean): [number, number, number] =>
    [side * x, localY(y), localZ(frontZ(x, y) - (back ? depth : 0))];
  P.add('turret', orientedSlab(point(x0, y0, true), point(x1, y0, true),
    point(x1, y0, false), point(x0, y0, false), point(x0, y1, true),
    point(x1, y1, true), point(x1, y1, false), point(x0, y1, false)));
}

function cornerPocketZ(x: number, y: number, z: number, u: number, v: number): number {
  // Object_11 has a folded recess here, distinct from the larger side
  // aperture. Independent source rays fix its floor and rear-wall planes.
  // The exterior attachment edges stay on the existing shroud envelope.
  const back = .26647 - .6144 * (x - 1.15) + .1766 * (y - 2.19);
  const floor = .48724 - .900 * (x - 1.15) - 4.1026 * (y - 2.04);
  const lintel = .37232 - .493 * (x - 1.12) + 4.3022 * (y - 2.29);
  const blend = Math.max(0, Math.min(1, (u - .32) / .05, (.94 - u) / .11,
    (v - .10) / .18, (1 - v) / .05));
  const recessed = Math.min(z + .08, Math.max(back, floor, lintel));
  return z + (recessed - z) * blend;
}

function cornerPoint(side: number, u: number, v: number, front: boolean): [number, number, number] {
  // Exact source planes own the recess and its inboard jamb to X1.34.
  const boundary = u === 0;
  if (boundary) u = .35 / (.438 - .034 * v);
  const x = .99 + u * (front ? .438 - .034 * v : .333 - .033 * v);
  const y = front ? 1.98 + .05 * u + v * (.32 - .04 * u)
    : 2.01 + .015 * u + v * (.29 - .005 * u);
  const z = front ? (boundary ? sourceCornerZ(x, y)
    : cornerPocketZ(x, y, .58 - .33 * u + v * (-.19 + .013 * u), u, v)) : (side > 0 ? -.085 : -.19);
  return [side * x, localY(y), localZ(z)];
}

function addCornerPocket(P: TankBuilderPort, side: number): void {
  // Closed positive-thickness fabrication: the middle cells are the actual
  // recessed wall; surrounding cells form its floor, jambs and upper lip.
  // No dark face, alpha mask, detached frame or hidden full-face backing.
  const columns = [0, .94, 1];
  const rows = [0, .10, .20, .28, .38, .83, .95, 1];
  const point = (u: number, v: number, front: boolean) => cornerPoint(side, u, v, front);
  for (let c = 0; c < columns.length - 1; c++) for (let r = 0; r < rows.length - 1; r++) {
    const u0 = columns[c], u1 = columns[c + 1], v0 = rows[r], v1 = rows[r + 1];
    P.add('turret', orientedSlab(
      point(u0, v0, false), point(u1, v0, false), point(u1, v0, true), point(u0, v0, true),
      point(u0, v1, false), point(u1, v1, false), point(u1, v1, true), point(u0, v1, true),
    ));
  }
}

function sideShroud(P: TankBuilderPort, side: number): void {
  const part = (stations: readonly (readonly [number, number, number, number])[]): void => {
    P.add('turret', sectionSolid(stations.map(([z, outer, low, high]) => {
      const inner = .99;
      const ring: [number, number][] = [[inner, low], [outer, low + .015],
        [outer, high], [inner, high]];
      const mirrored = ring.map(([x, y]): [number, number] => [side * x, localY(y)]);
      return { z: localZ(z), ring: side < 0 ? mirrored.reverse() : mirrored };
    })));
  };
  // The supplied configuration is asymmetric: only the positive-X flank
  // has this service opening. Its aft jamb is Z-.383, not the old -.60.
  part([[-.73, 1.35, 2.02, 2.55], [-.60, 1.344, 2.02, 2.549], [-.383, 1.342, 2.02, 2.547]]);
  addT14CornerJunction(P, side, RING_Y, RING_Z);
  addCornerPocket(P, side);
  P.add('turret', orientedSlab(
    [side * 1.18, localY(2.30), localZ(side > 0 ? -.085 : -.19)], [side * 1.29, localY(2.31), localZ(side > 0 ? -.085 : -.19)],
    [side * 1.394, localY(2.31), localZ(.073)], [side * 1.18, localY(2.30), localZ(sourceCornerZ(1.18, 2.30))],
    [side * 1.18, localY(2.378), localZ(side > 0 ? -.085 : -.19)], [side * 1.28168, localY(2.3828), localZ(side > 0 ? -.085 : -.19)],
    [side * 1.37944, localY(2.3828), localZ(.04804)], [side * 1.18, localY(2.378), localZ(sourceCornerZ(1.18, 2.378))],
  ));
  P.add('turret', orientedSlab(
    [side * 1.18, localY(2.378), localZ(-.19)], [side * 1.28168, localY(2.3828), localZ(-.19)],
    [side * 1.37944, localY(2.3828), localZ(.04804)], [side * 1.18, localY(2.378), localZ(sourceCornerZ(1.18, 2.378))],
    [side * 1.18, localY(2.45), localZ(-.19)], [side * 1.274, localY(2.45), localZ(-.19)],
    [side * 1.366, localY(2.45), localZ(.025)], [side * 1.18, localY(2.45), localZ(sourceCornerZ(1.18, 2.45))],
  ));
  P.add('turret', orientedSlab(
    [side * 1.18, localY(2.45), localZ(-.19)], [side * 1.274, localY(2.45), localZ(-.19)],
    [side * 1.366, localY(2.45), localZ(.025)], [side * 1.18, localY(2.45), localZ(sourceCornerZ(1.18, 2.45))],
    [side * 1.18, localY(2.545), localZ(-.19)], [side * 1.258, localY(2.545), localZ(-.19)],
    [side * 1.34, localY(2.55), localZ(-.12)], [side * 1.18, localY(2.56), localZ(sourceCornerZ(1.18, 2.56))],
  ));
  part([[-.60, 1.344, 2.379, 2.549], [-.085, 1.323, 2.379, 2.545]]);
  if (side < 0) addClosedLeftShroud(P);
  else {
    const backing = clippedHatch(.28791, .260397, .0404);
    backing.rotateZ(-Math.PI / 2);
    P.addEquipment('turretDark', backing, .73154, localY(2.211203), localZ(-.2342335));
  }
}

function addClosedLeftShroud(P: TankBuilderPort): void {
  const point = (y: number, z: number, outer: boolean): [number, number, number] => [
    outer ? (1.3676015 + .000249 * y + .0482515 * z) / -.998835 : -.99, localY(y), localZ(z),
  ];
  P.add('turret', orientedSlab(
    point(1.995, -.60, true), point(1.995, -.60, false), point(1.995, -.085, false), point(1.995, -.085, true),
    point(2.49417, -.60, true), point(2.49417, -.60, false), point(2.49417, -.085, false), point(2.49417, -.085, true),
  ));
}

function middleCoreSection(z: number, window = false): SolidSection {
  const u = (z + 1.20) / 1.56;
  const half = .86 + .01 * u, low = 1.84 - .04 * u, roof = 2.48 + .07 * u;
  if (!window) return turretSection(z, half, low, roof);
  // The source right-hand aperture sees a .731708m structural base wall.
  // Keep the roof, left wall and underside; locally recess only this flank.
  return { z: localZ(z), ring: [[-half + .09, localY(low)], [half - .09, localY(low)],
    [half, localY(low + .12)], [half, localY(1.995)], [.731708, localY(1.995)],
    [.731708, localY(2.390)], [half, localY(2.390)], [half, localY(roof - .09)],
    [half - .12, localY(roof)], [-half + .12, localY(roof)],
    [-half, localY(roof - .09)], [-half, localY(low + .12)]] };
}

function addSightCavity(P: TankBuilderPort): void {
  // Independently measured optical recess: glass is behind its narrow rim,
  // with a steep floor. Moving a dark face over an intact cheek is not a hole.
  P.add('turret', box(.37, .36, .08), .675, localY(2.27), localZ(.527251));
  const slab = (x0: number, x1: number, y0: number, y1: number,
    z00: number, z10: number, z01: number, z11: number): void => {
    P.add('turret', orientedSlab(
      [x0, localY(y0), localZ(.54)], [x1, localY(y0), localZ(.54)],
      [x1, localY(y0), localZ(z10)], [x0, localY(y0), localZ(z00)],
      [x0, localY(y1), localZ(.54)], [x1, localY(y1), localZ(.54)],
      [x1, localY(y1), localZ(z11)], [x0, localY(y1), localZ(z01)],
    ));
  };
  const floorZ = (y: number) => .795427 - .97281 / .23162 * (y - 2.15);
  slab(.50, .85, 2.10, 2.184, floorZ(2.10), floorZ(2.10), floorZ(2.184), floorZ(2.184));
  const rimZ = (x: number) => .714899 - .90719 / .42071 * (x - .55);
  slab(.52, .58, 2.184, 2.44, rimZ(.52), rimZ(.58), rimZ(.52), rimZ(.58));
  P.addEquipment('turretDark', box(.2651403, .0067475, .084075), .6576282, localY(2.1968108), localZ(.6092885));
  P.addEquipment('turretDark', box(.2651403, .0067494, .084075), .6576282, localY(2.4048799), localZ(.6092885));
  P.addEquipment('turretDark', box(.205, .215, .057), .685, localY(2.30084), localZ(.595751));
  P.addEquipment('turretGlass', box(.19588375, .20132065, .009), .68505215, localY(2.3008449), localZ(.627367));
  P.addEquipment('turretDetail', cylZ(.065, .025674, 20), .80, localY(2.29), localZ(.664163));
}

function addTurret(P: TankBuilderPort): void {
  P.add('turret', cylY(.98, .98, .14, 48), 0, .055, 0);
  // Narrow structural core does not fill the APS space underneath the shroud.
  P.add('turret', sectionSolid([
    turretSection(-2.78, .81, 2.22, 2.50),
    turretSection(-2.43, 1.13, 2.04, 2.55),
    turretSection(-1.42, 1.16, 1.85, 2.55),
    turretSection(-1.20, .86, 1.84, 2.48),
    middleCoreSection(-.383),
  ]));
  P.add('turret', sectionSolid([middleCoreSection(-.383, true), middleCoreSection(-.085, true)]));
  P.add('turret', sectionSolid([
    middleCoreSection(-.085),
    turretSection(.36, .87, 1.80, 2.55),
    turretSection(.56, .42, 1.81, 2.54),
  ]));
  // Central gun opening has a real upper lintel and lower armored bearing,
  // leaving the moving mantlet unobstructed instead of building a front box.
  frontPanel(P, 1, -.40, .40, 2.32, 2.51, .42);
  P.add('turret', box(.78, .085, .68), 0, localY(1.84), localZ(.94));
  frontPanel(P, -1, .39, .48, 1.98, 2.50, .46);
  for (const [x0, x1] of [[.48, .70], [.70, .90], [.90, .99]]) {
    frontPanel(P, -1, x0, x1, 1.98, 2.25, .46);
    frontPanel(P, -1, x0, x1, 2.25, 2.50, .46);
  }
  // Right-front sight cavity: separate source floor, rim and recessed optic.
  frontPanel(P, 1, .39, .50, 1.98, 2.50, .36);
  frontPanel(P, 1, .85, .99, 1.98, 2.50, .28);
  frontPanel(P, 1, .50, .85, 1.98, 2.10, .36);
  frontPanel(P, 1, .50, .85, 2.44, 2.50, .24);
  addSightCavity(P);
  // Asymmetric side shroud: the right opening has an inset backing; the
  // left wall is closed in the supplied source configuration.
  for (const side of [-1, 1]) {
    sideShroud(P, side);
    // Front perimeter Afganit tube array is attached to the rotating base,
    // exposed under the raised shroud with proper gaps between launch tubes.
    for (let i = 0; i < 5; i++) {
      const angle = side * (.25 + i * .21);
      const x = Math.sin(angle) * 1.01;
      const z = Math.cos(angle) * .90 - .13;
      P.addEquipment('turretDetail', cylZ(.087, .34, 16), x, localY(1.865), localZ(z), 0, angle);
      P.addEquipment('turretDark', cylZ(.062, .009, 14), x + Math.sin(angle) * .18, localY(1.865), localZ(z + Math.cos(angle) * .18), 0, angle);
      P.addEquipment('turretDark', box(.14, .07, .12), x, localY(1.75), localZ(z));
    }
    P.addEquipment('turretDetail', box(.11, .11, .09), side * 1.292, localY(2.40), localZ(-.14), 0, side * .38);
    P.addEquipment('turretGlass', box(.04, .045, .01), side * 1.31, localY(2.40), localZ(-.095), 0, side * .38);
    for (let i = 0; i < 3; i++) {
      P.addEquipment('turretDetail', box(.14, .43, .61), side * 1.145, localY(2.34), localZ(-1.05 - i * .65));
      for (const y of [2.19, 2.48]) P.addEquipment('turretDark', cylZ(.012, .018, 8), side * 1.225, localY(y), localZ(-1.04 - i * .65), 0, side * Math.PI / 2);
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) {
      P.addEquipment('turretDark', cylY(.039, .039, .013, 12), side * (1.04 - row * .105), localY(2.57), localZ(-.91 - col * .105));
    }
    P.addEquipment('turretDetail', box(.45, .32, .12), side * 1.015, localY(2.68), localZ(-.48));
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      P.addEquipment('turretDark', cylZ(.039, .01, 12), side * (1.015 + (col - 1.5) * .094), localY(2.59 + row * .091), localZ(-.41));
    }
  }
}

function addRoofEquipment(P: TankBuilderPort): void {
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = (col - 1) * .48, z = .12 - row * .49;
    P.addEquipment('turretDetail', box(.46, .017, .465), x, localY(2.563), localZ(z));
    for (const dx of [-.18, .18]) for (const dz of [-.17, .17]) {
      P.addEquipment('turretDark', cylY(.011, .011, .012, 6), x + dx, localY(2.578), localZ(z + dz));
    }
  }
  // Source rear roof station: drum-shaped panoramic bearing, tall armored
  // remote gun support beside it, level MG rigidly attached to that cradle.
  // .75684m is the bearing's maximum diameter, not the tall optic head.
  // Horizontal source rays fix the upper radii at .21133 and .19137m.
  P.addEquipment('turretDetail', cylY(.2113, .3071, .055, 36), -.40938, localY(2.5375), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.21133, .21133, .249, 36), -.40938, localY(2.6805), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.198, .198, .061, 36), -.40938, localY(2.8355), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.19137, .19137, .201, 36), -.40938, localY(2.9665), localZ(-1.254));
  P.addEquipment('turretDetail', box(.1736, .24283, .08256), -.46588, localY(2.94737), localZ(-1.12036));
  P.addEquipment('turretGlass', box(.13, .17, .009), -.46588, localY(2.957), localZ(-1.0745));
  P.addEquipment('turretDetail', cylY(.197, .197, .013, 36), -.40938, localY(3.074), localZ(-1.254));
  P.addEquipment('turretDetail', box(.485, .58, .30), -.43, localY(2.858), localZ(-1.708));
  for (const [x, y] of [[.14243, 3.16535], [-.64682, 3.16265]]) {
    P.addEquipment('turretDark', cylY(.0164, .0164, .0338, 12), x, localY(y), localZ(-1.698));
  }
  addRwsCradle(P);
  const weapon = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 1.50,
    tone: 'two-tone', elev: 0, ammo: true, shield: false, ring: false, barrelBridge: true, seed: 260905 });
  weapon.name = 'armataXRemoteMachineGun';
  weapon.position.set(-.087, localY(2.718), localZ(-1.7115));
  P.turretG.add(weapon);
  for (const [x, z, height] of [[-.712, .156, .760], [.815, -2.346, 1.128]]) {
    P.addEquipment('turretDetail', cylY(.044, .055, .09, 14), x, localY(2.60), localZ(z));
    P.addEquipment('turretDark', cylY(.009, .013, height, 10), x, localY(2.64 + height / 2), localZ(z));
  }
  P.addEquipment('turretDetail', cylY(.031, .040, .44, 12), .703, localY(2.771), localZ(.232));
  P.addEquipment('turretDark', box(.05, .060, .045), .703, localY(3.018), localZ(.232));
  for (const side of [-1, 1]) {
    P.addEquipment('turretDetail', box(.022, .022, .36), side * .72, localY(2.69), localZ(-2.25));
    for (const z of [-2.08, -2.42]) P.addEquipment('turretDetail', box(.022, .15, .022), side * .72, localY(2.615), localZ(z));
  }
  P.addEquipment('turretDetail', box(1.44, .022, .022), 0, localY(2.69), localZ(-2.43));
}

function addRwsCradle(P: TankBuilderPort): void {
  const section = (x0: number, x1: number, low: number, high: number,
    back0: number, front0: number, back1: number, front1: number): void => {
    P.addEquipment('turretDetail', orientedSlab(
      [x0, localY(low), localZ(back0)], [x1, localY(low), localZ(back0)],
      [x1, localY(low), localZ(front0)], [x0, localY(low), localZ(front0)],
      [x0, localY(high), localZ(back1)], [x1, localY(high), localZ(back1)],
      [x1, localY(high), localZ(front1)], [x0, localY(high), localZ(front1)],
    ));
  };
  // Source front slope retreats from Z−1.384 at Y2.60 to −1.626 at
  // Y3.14. Only the fork walls extend above the receiver-bearing floor.
  section(-.210, .110, 2.568, 2.87, -1.79, -1.377, -1.844, -1.463);
  for (const x of [-.210, .110]) {
    section(x, x + .058, 2.87, 2.96, -1.844, -1.463, -1.844, -1.507);
    section(x, x + .058, 2.96, 3.150, -1.844, -1.507, -1.766, -1.633);
    P.addEquipment('turretDark', cylZ(.025, .016, 12), x + .029, localY(3.055), localZ(-1.842));
  }
  P.addEquipment('turretDark', box(.008, .07, .20), .173, localY(2.901), localZ(-1.704));
  // Source Object_15 is a full-depth positive-X support beside the weapon,
  // not an empty fork across this entire width. The narrow negative-X gap
  // and forward receiver clearance remain genuinely open.
  section(-.001210, .161313, 2.898874, 2.973030, -1.844, -1.474581, -1.843788, -1.515167);
  section(-.001210, .161313, 2.973030, 3.144819, -1.843788, -1.515167, -1.768057, -1.629514);
  section(-.001210, .161708, 3.144819, 3.150478, -1.768057, -1.629514, -1.758765, -1.640078);
}

function addCannon(P: TankBuilderPort): void {
  // Closed octagonal mantlet is seated behind the bore pivot, as measured
  // in Object_15. The old cylindrical add-on at Z1.51 overexposed its collar.
  const ring: [number, number][] = [[-.17, -.26608], [.17, -.26608],
    [.33126, -.151], [.33126, .15], [.214, .22505], [-.214, .22505],
    [-.33126, .15], [-.33126, -.151]];
  P.addGunExtra(sectionSolid([{ z: -.5232, ring }, { z: .035, ring }]));
  P.addGunExtra(cylZ(.1906, .13, 28, .17), 0, 0, .086);
  KIT.buildGun(P, { len: 4.643, r: .085, baseR: .17, sleeve: true, collar: true });
  P.addEquipment('gunMount', box(.21, .045, .31), .055, .208, .23);
  // Muzzle-reference bracket and its short electrical guide: separate
  // source fixture, not an arbitrary attachment extending the barrel.
  P.addEquipment('gunDark', cylZ(.1003, .0263, 24), 0, .00336, 4.302);
  P.addEquipment('gun', box(.07509, .07027, .04067), 0, .080565, 4.45228);
  P.addEquipment('gunDark', box(.07046, .03206, .01835), 0, .09841, 4.42463);
  P.addEquipment('gunDark', cylZ(.010025, .49992, 10), 0, .093625, 4.02017);
  for (const z of [4.42064, 4.47229]) P.addEquipment('gunDark', box(.0652, .01907, .01887), -.002565, -.088535, z);
}

export function buildT14X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, RING_Y, RING_Z);
  P.gunG.position.set(0, localY(2.051), localZ(1.00));
  addHull(P);
  addTurret(P);
  addRoofEquipment(P);
  addCannon(P);
  P.topY = localY(3.18);
}

export const T14_X_PROFILES = { t14_x: { build: buildT14X } };
