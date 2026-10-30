// The T-64's own running gear (owner 2026-10-27: "the T-64's distinctive small road wheels, six a side, with their
// internal shock absorption, and the thin track"). Six small dual road wheels a side, each half a steel-tyred pressed
// disc carrying its tyre on an internal rubber ring (the T-64's "internal shock absorption"), twelve pressed dimples
// round a six-bolt hub; four return rollers (the T-72 has three); the front idler and the rear drive; a thin 540 mm
// single-pin track at 164 mm pitch (Kharkiv MicroCAD 2017, s3_66: 540 mm, 164 mm, 78-79 links).
// Commons photos read for the face: VictorAnyakin, "T-64B wheels and track" and "T-64B forward wheels suspension"
// (CC BY-SA 4.0, 2015). Stations come from the 42manako T-64BM1M print on the T-64 frame (t64Armor.ts); the print's
// three return rollers are corrected to the four every published description gives.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { KIT } from './kit.ts';
import { mergeAll } from '../factoryGeometry.ts';
import { turnedGearStock, returnRollerStock, gearFastener } from '../runningGearPrimitives.ts';

type GearKit = Pick<typeof KIT, 'buildRunningGear'>;

/** Road-wheel axle stations, bow to stern (the print's own six). */
export const T64_ROAD_STATIONS = Object.freeze([1.947, 1.175, .271, -.484, -1.302, -2.144] as const);
export const T64_GEAR = Object.freeze({
  wheelR: .28, wheelY: .335, halfGap: .040, halfWidth: .150,
  trackCentreX: 1.365, trackW: .54, pitch: .164,
  idler: Object.freeze({ z: 2.793, y: .73, r: .29 }),
  sprocket: Object.freeze({ z: -2.723, y: .68, r: .317 }),
  rollerR: .10, rollerY: .925,
  rollerZs: Object.freeze([1.66, .54, -.58, -1.70] as const),
  topY: 1.085,
} as const);

function mergeOwned(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  try { return mergeAll(parts); }
  finally { for (const geometry of parts) if (geometry.index) geometry.dispose(); }
}

function tagged(geometry: THREE.BufferGeometry, part: string): THREE.BufferGeometry {
  geometry.userData.t64Gear = part;
  return geometry;
}

/** One road wheel in its axle frame (local +X outboard): two halves round the guide-horn channel. Each half is a
 * turned steel tyre and pressed disc (wheel paint) with the internal rubber ring showing between them (the fleet
 * rubber), the dished face pressed with twelve dimples, and a proud hub under a six-bolt cap (dark steel). */
export function t64RoadWheelStock(high: boolean) {
  const { wheelR: R, halfGap: g, halfWidth: w } = T64_GEAR, o = g + w, segments = high ? 24 : 12;
  const tire: THREE.BufferGeometry[] = [], metal: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // steel tyre band, groove for the rubber ring, dished disc, hub boss
    metal.push(turnedGearStock([
      [.06, g], [R, g], [R, o], [R - .032, o], [R - .032, o - .024], [R - .058, o - .024], [R - .058, o - .012],
      [.205, o - .012], [.125, o - .038], [.085, o - .038], [.085, o + .022], [.06, o + .022], [.06, g],
    ], segments, side));
    // the internal rubber ring, its face 8 mm inside the tyre's
    tire.push(turnedGearStock([[R - .058, o - .024], [R - .032, o - .024], [R - .032, o - .008], [R - .058, o - .008],
      [R - .058, o - .024]], segments, side));
    if (high) {
      // twelve pressed dimples on the dish (r 0.165): a raised lip round a shadowed pocket
      const dishX = o - .012 - (.205 - .165) * (.026 / .080);
      for (let k = 0; k < 12; k++) {
        const a = (k + .5) * Math.PI / 6, y = Math.cos(a) * .165, z = Math.sin(a) * .165;
        metal.push(new THREE.TorusGeometry(.024, .006, 4, 10).rotateY(Math.PI / 2).translate(side * (dishX + .002), y, z));
        dark.push(new THREE.CylinderGeometry(.020, .020, .004, 10).rotateZ(Math.PI / 2).translate(side * (dishX - .001), y, z));
      }
    }
    // hub cap and its six bolts
    dark.push(turnedGearStock([[0, o + .022], [.058, o + .022], [.058, o + .040], [.040, o + .052], [0, o + .052],
      [0, o + .022]], high ? 12 : 8, side));
    if (high) for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      dark.push(gearFastener(.011, .014, true).translate(side * (o + .028), Math.cos(a) * .070, Math.sin(a) * .070));
    }
  }
  // the axle tube through the channel
  metal.push(turnedGearStock([[0, -g - .002], [.07, -g - .002], [.07, g + .002], [0, g + .002], [0, -g - .002]], high ? 12 : 8));
  return { tire: tagged(mergeOwned(tire), 'internal-rubber-ring'), disc: tagged(mergeOwned(metal), 'steel-tyred-dual'),
    dark: tagged(mergeOwned(dark), 'hub-hardware') };
}

/** The T-64 course on the true T-64 hull. `coveredTop`: the variant's skirt or side screens cover the return run. */
export function buildT64RunningGear(P: TankBuilderPort, kit: GearKit) {
  const G = T64_GEAR;
  const gear = kit.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelY: G.wheelY, wheelW: 2 * (G.halfGap + G.halfWidth),
    wheelZs: [...T64_ROAD_STATIONS], xc: G.trackCentreX,
    sprocket: { ...G.sprocket, trackR: G.sprocket.r - .03 }, idler: { ...G.idler, trackR: G.idler.r - .02 },
    rollers: G.rollerZs.map(z => ({ z, y: G.rollerY, r: G.rollerR })), rollerR: G.rollerR,
    returnRollerStockGeometry: returnRollerStock(G.rollerR, G.trackW * .62, P.q),
    trackW: G.trackW, trackTh: .028, topY: G.topY, botY: .04,
    roadWheelGeometry: t64RoadWheelStock(P.q),
    wheelPattern: 'pressed-eight', trackPattern: 'soviet-single-pin', linkPitchM: G.pitch,
    trackShoeDimensions: { padHeight: .030, grouserHeight: .010, webHeight: .016, hornHeight: .058, pinRadius: .012, pinCentreY: 0 },
    paintedEnds: true, arms: true, coveredTop: true, sprocketDepthScale: .80, idlerDepthScale: .80,
  });
  P.hullG.userData.t64GearContract = { roadStationsM: [...T64_ROAD_STATIONS], wheelRadiusM: G.wheelR,
    returnRollers: G.rollerZs.length, trackWidthM: G.trackW, pitchM: G.pitch, gaugeM: 2 * G.trackCentreX };
  return gear;
}
