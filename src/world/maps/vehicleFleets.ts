// src/world/maps/vehicleFleets.ts — the map-vehicles lane's catalogue (2026-10-05): real vehicle types at their real
// dimensions, gathered into fleets, one per place and year, and each map's fleet from its `Reference:` line. The eight
// placement roles stay the battlefield's (props.ts places a sedan, a wagon, a van, a pickup, a jeep, a tilt truck, a
// box truck and a flatbed wherever the inhabit pass seats one, and the shards keep their records); the fleet says what
// that role is on this map: on Verdant (Kursk, 1943) the flatbed is a GAZ-AA polutorka and the sedan a GAZ-M1 Emka, in
// Sarajevo (1992-96) a FAP and a Zastava 101, at Glen Canyon (the 1960s) a Loadstar and a Falcon.
//
// Every dimension is the vehicle's own; a body longer or wider than its role's placement box is scaled down to fit it
// (civilianVehicleKit.ts), a tall canvas tilt or box rises over its collision record (the record keeps its height).

import { CHROME, TRIM, type CarBodySpec } from './vehicleCoachwork.ts';
import type { CarModel, JeepModel, PeriodCarModel, PickupModel, TruckModel, VehicleModel } from './vehicleBodies.ts';

export type CivilianRole = 'truck' | 'jeep' | 'sedan' | 'wagon' | 'pickup' | 'van' | 'truckbox' | 'truckflatbed';

/** One role's vehicle on a fleet: the model and the liveries its copies wear (sRGB hex, one per copy by place). */
export interface FleetEntry {
  readonly model: VehicleModel;
  readonly paints: readonly number[];
}

export interface Fleet {
  readonly id: string;
  /** Where and when (the reference the fleet dresses). */
  readonly label: string;
  /** 0 new .. 1 derelict: how much rust the bodies carry. */
  readonly age: number;
  readonly roles: Readonly<Record<CivilianRole, FleetEntry>>;
}

// ---------------------------------------------------------------------------------------------------- shared bits

const CAR_BASE = {
  sillR: 0.04, tuckLow: 0.05, tuckHigh: 0.03, bonnetCrown: 0.03, roofCrown: 0.04, pillarW: 0.04,
} satisfies Partial<CarBodySpec>;

// ---------------------------------------------------------------------------------------------------- the 1930s-40s

/** GAZ-M1 "Emka" (1936-43): the Red Army's staff car, the Ford Model 40 grown Russian. */
const GAZ_M1: PeriodCarModel = {
  kind: 'period',
  body: {
    ...CAR_BASE, length: 4.44, width: 1.52, noseWidth: 0.92, frontAxle: 1.67, rearAxle: -1.175, wheelR: 0.36, tyreW: 0.18,
    track: 1.45, sill: 0.46, noseBottom: 0.55, tailBottom: 0.5, belt: 1.05, noseH: 1.04, tailH: 0.92,
    cowlZ: 0.42, glassRearZ: -1.42, roofFrontZ: 0.16, roofRearZ: -1.05, roofH: 1.72, roofTaper: 0.86,
    bonnetCrown: 0.07, roofCrown: 0.06, shoulderR: 0.1, sillR: 0.05, noseRound: 0.28, tailRound: 0.3,
    tuckHigh: 0.05, doorCuts: [0.36, -0.42, -1.05], pillars: [-0.44], pillarW: 0.05, rear: 'notch',
  },
  wheel: { rim: 0.55, style: 'hubcap' },
  wings: { w: 0.27, front: [[1.15, 0.2], [1.06, 0.62], [0.62, 0.92], [0, 1.02], [-0.62, 0.86]],
    rear: [[0.95, 0.25], [0.62, 0.86], [0, 1.02], [-0.72, 0.8], [-1.05, 0.25]] },
  runningBoardY: 0.43,
  grille: { w: 0.6, h: 0.62, y: 0.8, v: 0.08, bars: 14, chrome: true, vertical: true },
  lamps: { x: 0.52, y: 1.0, dz: 0.42, r: 0.11 },
  bumpers: 'chrome', spare: 'tail',
  rearLamps: [{ shape: 'round', x: 0.62, y: 0.85, r: 0.045, lens: 'red', dz: 0.15 }],
  details: { handles: CHROME, mirrors: 'none', wipers: true, seams: true },
};

/** GAZ-61-73 (1941-45): the Emka's body on the four-wheel-drive chassis — a hand's breadth higher, bigger wheels. */
const GAZ_61: PeriodCarModel = {
  ...GAZ_M1,
  body: { ...GAZ_M1.body, wheelR: 0.4, tyreW: 0.2, sill: 0.54, noseBottom: 0.63, tailBottom: 0.58, belt: 1.13, noseH: 1.12,
    tailH: 1.0, roofH: 1.8 },
  wings: { ...GAZ_M1.wings, w: 0.29 },
  runningBoardY: 0.5,
  grille: { ...GAZ_M1.grille, y: 0.88 },
  lamps: { ...GAZ_M1.lamps, y: 1.08 },
  spare: 'side',
};

/** GAZ-M415 (1939-41): the Emka's front and cab with a wooden bed — the kolkhoz pickup. */
const GAZ_M415: PeriodCarModel = { ...GAZ_M1, bed: { zF: -0.5, zB: -2.3, hw: 0.72, floor: 0.82, top: 1.22 }, spare: 'side' };

/** Citroen Traction Avant 11 BL (1934-57): low, front-driven, black; the occupation's and the Resistance's car. */
const TRACTION: PeriodCarModel = {
  kind: 'period',
  body: {
    ...CAR_BASE, length: 4.45, width: 1.62, noseWidth: 0.86, frontAxle: 1.52, rearAxle: -1.39, wheelR: 0.33, tyreW: 0.15,
    track: 1.34, sill: 0.36, noseBottom: 0.45, tailBottom: 0.4, belt: 0.9, noseH: 0.9, tailH: 0.78,
    cowlZ: 0.32, glassRearZ: -1.5, roofFrontZ: 0.06, roofRearZ: -1.1, roofH: 1.5, roofTaper: 0.84,
    bonnetCrown: 0.06, roofCrown: 0.06, shoulderR: 0.1, noseRound: 0.3, tailRound: 0.4, tuckHigh: 0.05,
    doorCuts: [0.26, -0.5, -1.15], pillars: [-0.52], pillarW: 0.05, rear: 'notch',
  },
  wheel: { rim: 0.6, style: 'car' },
  wings: { w: 0.24, front: [[1.2, 0.25], [1.1, 0.7], [0.6, 0.95], [0, 1.03], [-0.62, 0.88]],
    rear: [[0.9, 0.3], [0.6, 0.85], [0, 1.0], [-0.7, 0.75], [-1.0, 0.3]] },
  runningBoardY: 0.34,
  grille: { w: 0.56, h: 0.56, y: 0.68, v: 0.12, bars: 9, chrome: true },
  lamps: { x: 0.5, y: 0.86, dz: 0.5, r: 0.1 },
  bumpers: 'chrome', spare: 'none',
  rearLamps: [{ shape: 'round', x: 0.55, y: 0.72, r: 0.04, lens: 'red', dz: 0.25 }],
  details: { handles: CHROME, mirrors: 'none', wipers: true, seams: true },
};

/** Willys MB / Ford GPW (1941-45). */
const WILLYS_MB: JeepModel = {
  kind: 'jeep', length: 3.33, frontAxle: 1.06, rearAxle: -0.97, wheelR: 0.36, tyreW: 0.16, track: 1.24,
  wheel: { rim: 0.5, style: 'disc' },
  tub: { hw: 0.7, floor: 0.52, top: 1.02, zF: 0.22, rearRound: 0.1 },
  bonnet: { hw: 0.4, top: 1.06, slope: 0.03 },
  grille: { style: 'slots', w: 0.62, h: 0.44, y: 0.84, count: 9 },
  lamps: { x: 0.36, y: 0.84, r: 0.085, inGrille: true },
  wings: { w: 0.24, flatTop: 0.62 },
  windscreen: { h: 0.42, folded: false },
  top: 'none', spare: 'rear',
};

/** GAZ-67B (1944-53): the Soviet jeep — a narrow barred radiator, wings like a polutorka's, a slab tub. */
const GAZ_67B: JeepModel = {
  ...WILLYS_MB, length: 3.35, frontAxle: 1.08, rearAxle: -1.02, wheelR: 0.38, tyreW: 0.17, track: 1.446,
  tub: { hw: 0.8, floor: 0.6, top: 1.1, zF: 0.2, rearRound: 0.08 },
  bonnet: { hw: 0.36, top: 1.18, slope: 0.05 },
  grille: { style: 'vbars', w: 0.46, h: 0.5, y: 0.92, count: 11 },
  lamps: { x: 0.56, y: 0.96, r: 0.09, inGrille: false },
  wings: { w: 0.26, flatTop: 0.66 },
  windscreen: { h: 0.44, folded: false }, top: 'canvas', spare: 'rear',
};

/** VW Kuebelwagen Typ 82 (1940-45): rear-engined, a sloped smooth nose, slab sides, the spare on the bonnet. */
const KUBEL: JeepModel = {
  ...WILLYS_MB, length: 3.74, frontAxle: 1.15, rearAxle: -1.25, wheelR: 0.33, tyreW: 0.17, track: 1.37,
  tub: { hw: 0.8, floor: 0.5, top: 1.0, zF: 0.45, rearRound: 0.12 },
  bonnet: { hw: 0.62, top: 0.98, slope: 0.32 },
  grille: { style: 'none', w: 0, h: 0, y: 0, count: 0 },
  lamps: { x: 0.52, y: 0.86, r: 0.08, inGrille: false },
  wings: { w: 0.26, flatTop: 0.55 },
  windscreen: { h: 0.4, folded: false }, top: 'none', spare: 'bonnet', slopeNose: true,
};

/** GAZ-AA "polutorka" (1932-49) with its wooden drop sides. */
const GAZ_AA: TruckModel = {
  kind: 'truck', length: 5.34, width: 2.03, frontAxle: 2.03, rearAxles: [-1.41], wheelR: 0.4, tyreW: 0.17,
  trackF: 1.405, trackR: 1.42, dualRear: false, wheelStyle: 'spoke', frameY: 0.78, frameHW: 0.42, front: 'narrow',
  bonnet: { zRad: 2.36, hwFront: 0.3, hwRear: 0.37, yTop: 1.4, r: 0.05, louvres: true },
  radiator: { w: 0.64, h: 0.76, y: 1.1, style: 'vbars', round: 0.1, chrome: false, bars: 12 },
  wings: { style: 'flat', w: 0.3, reach: 0.95 }, runningBoardY: 0.62,
  cab: { zF: 1.27, zB: 0.22, hw: 0.82, y0: 0.92, belt: 1.42, win: 1.84, roof: 1.98, rake: 0, tumble: 0.02, r: 0.05,
    roofR: 0.06, split: false, doorFrom: 0.12, doorTo: 0.72, rearWindow: true, visor: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.52, y: 1.22, r: 0.11, dz: 0.05, bezel: 'body' }],
    bumper: { y: 0.62, h: 0.1, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.85, y: 1.05, r: 0.05, lens: 'red' }],
  body: { type: 'dropside', zF: 0.12, zB: -2.62, hw: 0.98, floorY: 1.1, sideH: 0.5, wood: true },
  spare: 'under', fuelTank: 'none', mirrors: true,
};

/** GAZ-AA with a wooden box ("furgon": the field workshop, the post van, the field kitchen's store). */
const GAZ_AA_BOX: TruckModel = {
  ...GAZ_AA, body: { type: 'box', zF: 0.12, zB: -2.62, hw: 0.99, floorY: 1.1, sideH: 0.5, top: 2.45, wood: true },
};

/** ZIS-5V (1942-48): the wartime three-tonner — a wooden cab, flat bent wings, a single headlamp, a canvas tilt. */
const ZIS_5V: TruckModel = {
  kind: 'truck', length: 6.06, width: 2.24, frontAxle: 2.3, rearAxles: [-1.51], wheelR: 0.46, tyreW: 0.18,
  trackF: 1.53, trackR: 1.67, dualRear: true, wheelStyle: 'disc', frameY: 0.88, frameHW: 0.44, front: 'narrow',
  bonnet: { zRad: 2.72, hwFront: 0.36, hwRear: 0.42, yTop: 1.5, r: 0.03, louvres: true },
  radiator: { w: 0.72, h: 0.8, y: 1.18, style: 'vbars', round: 0.04, chrome: false, bars: 9 },
  wings: { style: 'flat', w: 0.34, reach: 0.9 }, runningBoardY: 0.72,
  cab: { zF: 1.5, zB: 0.32, hw: 0.95, y0: 1.0, belt: 1.55, win: 2.0, roof: 2.16, rake: 0, tumble: 0, r: 0.02,
    roofR: 0.03, split: false, doorFrom: 0.15, doorTo: 0.7, rearWindow: true, visor: false },
  frontFace: { lamps: [{ shape: 'round', x: 0.6, y: 1.3, r: 0.11, dz: 0.06, bezel: 'body' }],
    bumper: { y: 0.68, h: 0.12, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.95, y: 1.15, r: 0.05, lens: 'red' }],
  body: { type: 'tilt', zF: 0.22, zB: -3.0, hw: 1.1, floorY: 1.25, sideH: 0.55, top: 2.75, wood: true },
  spare: 'side', fuelTank: 'none', mirrors: true,
};

/** Dodge WC-54 ambulance (1942-44): a three-quarter-ton with a steel box body; lend-lease to the Red Army too. */
const WC_54: TruckModel = {
  kind: 'truck', length: 4.95, width: 1.97, frontAxle: 1.75, rearAxles: [-1.25], wheelR: 0.42, tyreW: 0.22,
  trackF: 1.65, trackR: 1.65, dualRear: false, wheelStyle: 'disc', frameY: 0.82, frameHW: 0.42, front: 'narrow',
  bonnet: { zRad: 2.18, hwFront: 0.4, hwRear: 0.44, yTop: 1.32, r: 0.08, louvres: false },
  radiator: { w: 0.78, h: 0.62, y: 1.02, style: 'mesh', round: 0.04, chrome: false, bars: 10 },
  wings: { style: 'flat', w: 0.3, reach: 0.95 }, runningBoardY: 0.68,
  cab: { zF: 1.2, zB: 0.3, hw: 0.95, y0: 0.95, belt: 1.4, win: 1.8, roof: 2.25, rake: 0.08, tumble: 0, r: 0.04,
    roofR: 0.08, split: true, doorFrom: 0.2, doorTo: 0.75, rearWindow: false, intoBody: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.55, y: 1.18, r: 0.1, dz: 0.0, bezel: 'body' }],
    bumper: { y: 0.66, h: 0.12, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.82, y: 1.0, r: 0.04, lens: 'red' }],
  body: { type: 'box', zF: 0.32, zB: -2.47, hw: 0.97, floorY: 0.98, sideH: 0.5, top: 2.25, wood: false },
  spare: 'side', fuelTank: 'none', mirrors: true,
};

/** Dodge WC-51 weapons carrier (1942-45): open cab under canvas, flat wings, an open bed. */
const WC_51: TruckModel = {
  ...WC_54, length: 4.24, frontAxle: 1.55, rearAxles: [-0.94],
  cab: { ...WC_54.cab, zF: 1.0, zB: 0.25, roof: 1.98, soft: true, intoBody: false, rearWindow: true },
  body: { type: 'dropside', zF: 0.2, zB: -2.07, hw: 0.95, floorY: 0.95, sideH: 0.48, wood: false },
  bonnet: { ...WC_54.bonnet!, zRad: 1.98 },
};

/** GMC CCKW-353 (1941-45): the deuce-and-a-half, 6x6, its brush-guard grille, a canvas-topped cab, the tilt. */
const GMC_CCKW: TruckModel = {
  kind: 'truck', length: 6.9, width: 2.24, frontAxle: 2.72, rearAxles: [-1.07, -2.19], wheelR: 0.46, tyreW: 0.2,
  trackF: 1.6, trackR: 1.72, dualRear: true, wheelStyle: 'disc', frameY: 0.95, frameHW: 0.44, front: 'narrow',
  bonnet: { zRad: 3.12, hwFront: 0.42, hwRear: 0.45, yTop: 1.55, r: 0.06, louvres: true },
  radiator: { w: 0.98, h: 0.82, y: 1.2, style: 'vbars', round: 0.02, chrome: false, bars: 14 },
  wings: { style: 'flat', w: 0.38, reach: 0.95 }, runningBoardY: 0.78,
  cab: { zF: 1.88, zB: 0.82, hw: 1.0, y0: 1.05, belt: 1.6, win: 2.1, roof: 2.28, rake: 0.05, tumble: 0, r: 0.04,
    roofR: 0.08, split: true, doorFrom: 0.15, doorTo: 0.72, rearWindow: true, soft: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 1.32, r: 0.1, dz: -0.05, bezel: 'body' }],
    bumper: { y: 0.74, h: 0.16, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.95, y: 1.1, r: 0.04, lens: 'red' }],
  body: { type: 'tilt', zF: 0.72, zB: -3.4, hw: 1.1, floorY: 1.3, sideH: 0.5, top: 2.82, wood: false },
  spare: 'side', fuelTank: 'side', mirrors: true,
};

/** Opel Blitz 3.6-36S (1937-44): the Wehrmacht's three-tonner — round wings, a barred radiator, a rounded cab. */
const OPEL_BLITZ: TruckModel = {
  kind: 'truck', length: 6.02, width: 2.265, frontAxle: 2.28, rearAxles: [-1.32], wheelR: 0.45, tyreW: 0.2,
  trackF: 1.62, trackR: 1.66, dualRear: true, wheelStyle: 'disc', frameY: 0.9, frameHW: 0.44, front: 'narrow',
  bonnet: { zRad: 2.68, hwFront: 0.38, hwRear: 0.44, yTop: 1.48, r: 0.12, louvres: true },
  radiator: { w: 0.76, h: 0.74, y: 1.12, style: 'vbars', round: 0.18, chrome: false, bars: 11 },
  wings: { style: 'round', w: 0.36, reach: 1.0 }, runningBoardY: 0.74,
  cab: { zF: 1.5, zB: 0.42, hw: 1.0, y0: 1.0, belt: 1.55, win: 2.0, roof: 2.18, rake: 0.05, tumble: 0.04, r: 0.12,
    roofR: 0.14, split: true, doorFrom: 0.12, doorTo: 0.7, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 1.25, r: 0.1, dz: 0.02, bezel: 'body' }],
    bumper: { y: 0.7, h: 0.12, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.95, y: 1.1, r: 0.04, lens: 'red' }],
  body: { type: 'dropside', zF: 0.3, zB: -2.98, hw: 1.08, floorY: 1.22, sideH: 0.52, wood: true },
  spare: 'side', fuelTank: 'none', mirrors: true,
};

const OPEL_BLITZ_BOX: TruckModel = {
  ...OPEL_BLITZ, body: { type: 'box', zF: 0.3, zB: -2.98, hw: 1.1, floorY: 1.22, sideH: 0.5, top: 2.75, wood: false },
};

// ---------------------------------------------------------------------------------------------------- the 1960s USA

/** Ford Falcon (1960-63): the compact — flat sides, a full-width grille, round lamps at its ends, chrome. */
const FORD_FALCON: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.6, width: 1.78, frontAxle: 1.58, rearAxle: -1.2, wheelR: 0.32, tyreW: 0.17, track: 1.44, archR: 0.39,
    sill: 0.26, noseBottom: 0.32, tailBottom: 0.36, belt: 0.86, noseH: 0.78, tailH: 0.8, cowlZ: 0.42, glassRearZ: -1.32,
    roofFrontZ: -0.12, roofRearZ: -0.95, roofH: 1.36, roofTaper: 0.84, shoulderR: 0.06, noseRound: 0.1, tailRound: 0.12,
    doorCuts: [0.35, -0.42, -1.05], pillars: [-0.44], rear: 'notch', windowFrame: CHROME,
  },
  wheel: { rim: 0.6, style: 'hubcap' },
  front: { lamps: [{ shape: 'round', x: 0.72, y: 0.6, r: 0.085, bezel: 'chrome' }],
    grille: { y: 0.6, w: 1.25, h: 0.2, style: 'mesh', bars: 18, chrome: true, frame: 'chrome' },
    bumper: { y: 0.4, h: 0.1, style: 'chrome' }, plate: { y: 0.4, w: 0.3, h: 0.15 } },
  rear: { lamps: [{ shape: 'round', x: 0.62, y: 0.66, r: 0.07, lens: 'red', bezel: 'chrome' }],
    bumper: { y: 0.42, h: 0.1, style: 'chrome' }, plate: { y: 0.58, w: 0.3, h: 0.15 } },
  details: { handles: CHROME, mirrors: 'door', mirrorMat: CHROME, wipers: true, seams: true, sideTrim: { y: 0.66, mat: CHROME } },
};

const FORD_FALCON_WAGON: CarModel = {
  ...FORD_FALCON,
  body: { ...FORD_FALCON.body, glassRearZ: -2.3, roofRearZ: -2.16, rear: 'estate', pillars: [-0.44, -1.22], doorCuts: [0.35, -0.42, -1.18] },
  roofRack: true,
};

/** Ford Econoline (1961-67): the forward-control van — a flat face, round lamps, the cab over the engine. */
const ECONOLINE: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.3, width: 1.9, frontAxle: 1.38, rearAxle: -0.88, wheelR: 0.33, tyreW: 0.18, track: 1.6, archR: 0.4,
    sill: 0.32, noseBottom: 0.36, tailBottom: 0.38, belt: 1.12, noseH: 1.1, tailH: 1.12, cowlZ: 1.96, glassRearZ: -2.15,
    roofFrontZ: 1.68, roofRearZ: -2.05, roofH: 1.95, roofTaper: 0.94, bonnetCrown: 0.01, roofCrown: 0.03, shoulderR: 0.12,
    noseRound: 0.22, tailRound: 0.1, doorCuts: [1.25, 0.4], pillars: [1.18], pillarW: 0.06, rear: 'estate',
    sideGlassFrom: 1.9, sideGlassTo: 1.22, backlight: { w: 0.42, h: 0.5 },
  },
  wheel: { rim: 0.6, style: 'hubcap' },
  front: { lamps: [{ shape: 'round', x: 0.7, y: 0.86, r: 0.09, bezel: 'chrome' }, { shape: 'rect', x: 0.4, y: 0.62, w: 0.1, h: 0.06, lens: 'amber' }],
    grille: { y: 0.78, w: 0.9, h: 0.14, style: 'hbars', bars: 3, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.1, style: 'chrome' }, plate: { y: 0.44, w: 0.3, h: 0.15 } },
  rear: { lamps: [{ shape: 'rect', x: 0.82, y: 0.8, w: 0.08, h: 0.16, lens: 'red' }],
    bumper: { y: 0.45, h: 0.1, style: 'chrome' }, plate: { y: 0.62, w: 0.3, h: 0.15 } },
  details: { handles: CHROME, mirrors: 'door', mirrorMat: TRIM, wipers: true, seams: true },
};

/** Ford F-100 (1961-66), styleside. */
const FORD_F100: PickupModel = {
  kind: 'pickup',
  cab: {
    ...CAR_BASE, length: 2.59, width: 1.98, frontAxle: 0.375, wheelR: 0.36, tyreW: 0.2, track: 1.65,
    sill: 0.42, noseBottom: 0.5, tailBottom: 0.45, belt: 1.12, noseH: 1.08, tailH: 1.12,
    cowlZ: -0.62, glassRearZ: -1.295, roofFrontZ: -0.84, roofRearZ: -1.2, roofH: 1.84, roofTaper: 0.9,
    bonnetCrown: 0.02, shoulderR: 0.08, noseRound: 0.1, tailRound: 0.04, archR: 0.45, doorCuts: [-0.66, -1.24],
    pillars: [], windowFrame: CHROME, sideGlassTo: -1.13, backlight: { w: 0.62, h: 0.62 },
  },
  cabZ: 1.175, rearAxle: -1.37, trackR: 1.65,
  wheel: { rim: 0.55, style: 'hubcap' },
  bed: { zF: -0.17, zB: -2.42, hw: 0.98, floor: 0.78, top: 1.12, archR: 0.45 },
  front: { lamps: [{ shape: 'round', x: 0.74, y: 0.9, r: 0.09, bezel: 'chrome' }],
    grille: { y: 0.88, w: 1.25, h: 0.26, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.5, h: 0.12, style: 'chrome' }, plate: { y: 0.5, w: 0.3, h: 0.15 } },
  rearLamps: [{ shape: 'rect', x: 0.9, y: 0.95, w: 0.07, h: 0.16, lens: 'red' }],
  details: { handles: CHROME, mirrors: 'door', mirrorMat: CHROME, wipers: true, seams: true },
  rearBumper: 'chrome',
};

/** Jeep CJ-5 (1955-83): the civilian jeep, its seven-slot grille and the rounded wings. */
const JEEP_CJ5: JeepModel = {
  ...WILLYS_MB, length: 3.4, frontAxle: 1.15, rearAxle: -0.91, wheelR: 0.37, tyreW: 0.2, track: 1.3,
  tub: { hw: 0.76, floor: 0.56, top: 1.05, zF: 0.28, rearRound: 0.12 },
  bonnet: { hw: 0.42, top: 1.1, slope: 0.02 },
  grille: { style: 'slots', w: 0.6, h: 0.42, y: 0.88, count: 7 },
  lamps: { x: 0.36, y: 0.88, r: 0.085, inGrille: true },
  wings: { w: 0.26, flatTop: 0.66 },
  windscreen: { h: 0.44, folded: false }, top: 'canvas', spare: 'rear',
};

const F600_BASE = {
  kind: 'truck', length: 6.5, width: 2.3, frontAxle: 2.38, rearAxles: [-1.42], wheelR: 0.48, tyreW: 0.23,
  trackF: 1.8, trackR: 1.75, dualRear: true, wheelStyle: 'truck', frameY: 0.95, frameHW: 0.43, front: 'wide',
  wide: { zNose: 3.2, noseH: 1.36, topH: 1.42, noseBottom: 0.62, archR: 0.56, shoulderR: 0.1, noseRound: 0.14 },
  cab: { zF: 1.55, zB: 0.12, hw: 1.0, y0: 1.0, belt: 1.5, win: 2.08, roof: 2.3, rake: 0.18, tumble: 0.06, r: 0.16,
    roofR: 0.12, split: false, doorFrom: 0.12, doorTo: 0.7, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.88, y: 1.12, r: 0.1, bezel: 'chrome' }],
    grille: { y: 1.05, w: 1.35, h: 0.4, style: 'hbars', bars: 5, chrome: true, frame: 'chrome' },
    bumper: { y: 0.72, h: 0.16, style: 'chrome' } },
  rearLamps: [{ shape: 'round', x: 1.05, y: 1.1, r: 0.05, lens: 'red' }],
  spare: 'side', fuelTank: 'side', mirrors: true,
} satisfies Omit<TruckModel, 'body'>;

/** Ford F-600 (1961-66) stake bed: the high stake racks a dam crew loads. */
const FORD_F600_STAKE: TruckModel = {
  ...F600_BASE, body: { type: 'dropside', zF: 0.02, zB: -3.22, hw: 1.15, floorY: 1.25, sideH: 1.05, wood: true },
};
const FORD_F600_BOX: TruckModel = {
  ...F600_BASE, body: { type: 'box', zF: 0.02, zB: -3.22, hw: 1.17, floorY: 1.25, sideH: 0.5, top: 3.05, wood: false },
};
/** International Harvester Loadstar (1962-78) flatbed with pipe. */
const IH_LOADSTAR: TruckModel = {
  ...F600_BASE,
  wide: { ...F600_BASE.wide, noseH: 1.3, topH: 1.36, noseRound: 0.08, shoulderR: 0.06 },
  frontFace: { ...F600_BASE.frontFace, grille: { y: 1.02, w: 1.45, h: 0.42, style: 'mesh', bars: 12, chrome: false, frame: 'body' } },
  body: { type: 'flatbed', zF: 0.02, zB: -3.22, hw: 1.15, floorY: 1.25, sideH: 0.2, wood: true, load: 'pipes' },
};

// ---------------------------------------------------------------------------------------------------- Yugoslavia, 1980s-90s

/** Zastava 101 "Stojadin" (1971-2008): Kragujevac's hatchback on the Fiat 128. */
const ZASTAVA_101: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 3.83, width: 1.59, frontAxle: 1.22, rearAxle: -1.23, wheelR: 0.28, tyreW: 0.15, track: 1.31, archR: 0.35,
    sill: 0.24, noseBottom: 0.28, tailBottom: 0.32, belt: 0.86, noseH: 0.74, tailH: 0.86, cowlZ: 0.42, glassRearZ: -1.9,
    roofFrontZ: -0.08, roofRearZ: -1.1, roofH: 1.36, roofTaper: 0.85, shoulderR: 0.05, noseRound: 0.08, tailRound: 0.08,
    doorCuts: [0.36, -0.36, -1.0], pillars: [-0.38], rear: 'hatch',
  },
  wheel: { rim: 0.62, style: 'car' },
  front: { lamps: [{ shape: 'rect', x: 0.57, y: 0.62, w: 0.24, h: 0.12, bezel: 'black' }],
    grille: { y: 0.62, w: 0.6, h: 0.1, style: 'hbars', bars: 3, chrome: false, frame: 'black' },
    bumper: { y: 0.44, h: 0.08, style: 'black' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.6, y: 0.7, w: 0.18, h: 0.12, lens: 'red' }],
    bumper: { y: 0.46, h: 0.08, style: 'black' }, plate: { y: 0.6, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

/** Yugo 45 (1980-2008). */
const YUGO_45: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 3.49, width: 1.54, frontAxle: 1.08, rearAxle: -1.07, wheelR: 0.27, tyreW: 0.145, track: 1.29, archR: 0.34,
    sill: 0.24, noseBottom: 0.28, tailBottom: 0.3, belt: 0.88, noseH: 0.76, tailH: 0.88, cowlZ: 0.38, glassRearZ: -1.74,
    roofFrontZ: -0.12, roofRearZ: -1.5, roofH: 1.39, roofTaper: 0.86, shoulderR: 0.04, noseRound: 0.06, tailRound: 0.06,
    doorCuts: [0.34, -0.68], pillars: [-0.98], pillarW: 0.06, rear: 'hatch',
  },
  wheel: { rim: 0.62, style: 'car' },
  front: { lamps: [{ shape: 'rect', x: 0.55, y: 0.64, w: 0.22, h: 0.11, bezel: 'black' }],
    grille: { y: 0.64, w: 0.6, h: 0.1, style: 'hbars', bars: 3, chrome: false, frame: 'black' },
    bumper: { y: 0.44, h: 0.09, style: 'black' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.58, y: 0.72, w: 0.16, h: 0.14, lens: 'red' }],
    bumper: { y: 0.46, h: 0.09, style: 'black' }, plate: { y: 0.62, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

/** Volkswagen Transporter T3 (1979-92), built at TAS in Vogosca too. */
const VW_T3: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.57, width: 1.85, frontAxle: 1.55, rearAxle: -0.91, wheelR: 0.32, tyreW: 0.185, track: 1.57, archR: 0.39,
    sill: 0.3, noseBottom: 0.34, tailBottom: 0.36, belt: 1.05, noseH: 1.0, tailH: 1.05, cowlZ: 2.05, glassRearZ: -2.28,
    roofFrontZ: 1.72, roofRearZ: -2.2, roofH: 1.95, roofTaper: 0.95, bonnetCrown: 0.01, roofCrown: 0.02, shoulderR: 0.06,
    noseRound: 0.1, tailRound: 0.06, doorCuts: [1.4, 0.55], pillars: [1.32, 0.0, -1.1], pillarW: 0.06, rear: 'estate',
    backlight: { w: 0.8, h: 0.45 },
  },
  wheel: { rim: 0.6, style: 'car' },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.82, w: 0.22, h: 0.13, bezel: 'black' }],
    grille: { y: 0.82, w: 1.0, h: 0.12, style: 'hbars', bars: 2, chrome: false, frame: 'black' },
    bumper: { y: 0.42, h: 0.12, style: 'black' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.78, y: 0.72, w: 0.1, h: 0.24, lens: 'red' }],
    bumper: { y: 0.44, h: 0.12, style: 'black' }, plate: { y: 0.62, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

/** Toyota Hilux N50 (1983-88), single cab. */
const HILUX_N50: PickupModel = {
  kind: 'pickup',
  cab: {
    ...CAR_BASE, length: 2.45, width: 1.69, frontAxle: 0.42, wheelR: 0.33, tyreW: 0.185, track: 1.43,
    sill: 0.36, noseBottom: 0.42, tailBottom: 0.4, belt: 1.0, noseH: 0.96, tailH: 1.0,
    cowlZ: -0.42, glassRearZ: -1.225, roofFrontZ: -0.72, roofRearZ: -1.13, roofH: 1.6, roofTaper: 0.9,
    shoulderR: 0.05, noseRound: 0.08, tailRound: 0.04, archR: 0.42, doorCuts: [-0.48, -1.18], pillars: [],
    sideGlassTo: -1.06, backlight: { w: 0.66, h: 0.6 },
  },
  cabZ: 1.12, rearAxle: -1.3, trackR: 1.4,
  wheel: { rim: 0.58, style: 'disc' },
  bed: { zF: -0.12, zB: -2.33, hw: 0.82, floor: 0.72, top: 1.04, archR: 0.42 },
  front: { lamps: [{ shape: 'rect', x: 0.62, y: 0.8, w: 0.2, h: 0.12, bezel: 'black' }],
    grille: { y: 0.8, w: 0.92, h: 0.16, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    bumper: { y: 0.5, h: 0.1, style: 'chrome' }, plate: { y: 0.5, w: 0.36, h: 0.13 } },
  rearLamps: [{ shape: 'rect', x: 0.74, y: 0.86, w: 0.08, h: 0.18, lens: 'red' }],
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
  rearBumper: 'tube',
};

/** Lada Niva / VAZ-2121 (1977-): the three-door four-by-four, round lamps in a black grille. */
const LADA_NIVA: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 3.74, width: 1.68, frontAxle: 1.12, rearAxle: -1.08, wheelR: 0.37, tyreW: 0.185, track: 1.43,
    sill: 0.38, noseBottom: 0.42, tailBottom: 0.46, belt: 1.06, noseH: 0.98, tailH: 1.06, cowlZ: 0.5, glassRearZ: -1.87,
    roofFrontZ: 0.04, roofRearZ: -1.78, roofH: 1.64, roofTaper: 0.88, shoulderR: 0.05, noseRound: 0.06, tailRound: 0.06,
    doorCuts: [0.48, -0.62], pillars: [-0.66], pillarW: 0.05, rear: 'estate', archR: 0.45, backlight: { w: 0.8, h: 0.55 },
  },
  wheel: { rim: 0.55, style: 'disc' },
  front: { lamps: [{ shape: 'round', x: 0.6, y: 0.8, r: 0.085, bezel: 'black' }, { shape: 'rect', x: 0.72, y: 0.66, w: 0.08, h: 0.05, lens: 'amber' }],
    grille: { y: 0.8, w: 0.72, h: 0.16, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    bumper: { y: 0.52, h: 0.1, style: 'chrome' }, plate: { y: 0.5, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.66, y: 0.78, w: 0.14, h: 0.16, lens: 'red' }],
    bumper: { y: 0.54, h: 0.1, style: 'chrome' }, plate: { y: 0.66, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

const TAM_BASE = {
  kind: 'truck', length: 6.2, width: 2.38, frontAxle: 2.2, rearAxles: [-1.25], wheelR: 0.5, tyreW: 0.26,
  trackF: 1.9, trackR: 1.84, dualRear: false, wheelStyle: 'truck', frameY: 1.05, frameHW: 0.43, front: 'cabover',
  cab: { zF: 3.08, zB: 1.4, hw: 1.16, y0: 1.18, belt: 1.95, win: 2.55, roof: 2.75, rake: 0.08, tumble: 0.03, r: 0.1,
    roofR: 0.12, split: false, doorFrom: 0.22, doorTo: 0.82, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.82, y: 0.95, r: 0.09, bezel: 'black' }, { shape: 'rect', x: 1.0, y: 1.3, w: 0.08, h: 0.1, lens: 'amber' }],
    grille: { y: 1.55, w: 1.2, h: 0.3, style: 'hbars', bars: 5, chrome: false, frame: 'body' },
    bumper: { y: 0.82, h: 0.22, style: 'painted' } },
  rearLamps: [{ shape: 'rect', x: 1.0, y: 1.2, w: 0.18, h: 0.08, lens: 'red' }],
  spare: 'side', fuelTank: 'side', mirrors: true,
} satisfies Omit<TruckModel, 'body'>;

/** TAM 110 T7 (1980s): the JNA's four-by-four forward-control truck, its canvas tilt. */
const TAM_110: TruckModel = { ...TAM_BASE, body: { type: 'tilt', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.38, sideH: 0.55, top: 3.0, wood: false } };
/** TAM 80 with a box body. */
const TAM_80_BOX: TruckModel = {
  ...TAM_BASE, dualRear: true, wheelR: 0.44, frontAxle: 2.25, cab: { ...TAM_BASE.cab, y0: 1.05, belt: 1.8, win: 2.38, roof: 2.55 },
  body: { type: 'box', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.25, sideH: 0.5, top: 3.0, wood: false },
};
/** FAP 1314 with drop sides. */
const FAP_1314: TruckModel = {
  ...TAM_BASE, dualRear: true, wheelR: 0.52, cab: { ...TAM_BASE.cab, r: 0.06, roofR: 0.08 },
  frontFace: { ...TAM_BASE.frontFace, grille: { y: 1.5, w: 1.4, h: 0.36, style: 'mesh', bars: 10, chrome: false, frame: 'body' } },
  body: { type: 'dropside', zF: 1.28, zB: -3.08, hw: 1.17, floorY: 1.4, sideH: 0.6, wood: false },
};

// ---------------------------------------------------------------------------------------------------- Ukraine, 2022

/** VAZ-2107 (1982-2012): the "semyorka", its chrome grille and the square lamps. */
const VAZ_2107: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.15, width: 1.62, frontAxle: 1.25, rearAxle: -1.175, wheelR: 0.29, tyreW: 0.165, track: 1.34, archR: 0.36,
    sill: 0.24, noseBottom: 0.3, tailBottom: 0.33, belt: 0.9, noseH: 0.8, tailH: 0.86, cowlZ: 0.45, glassRearZ: -1.42,
    roofFrontZ: -0.12, roofRearZ: -1.02, roofH: 1.44, roofTaper: 0.86, shoulderR: 0.05, noseRound: 0.08, tailRound: 0.08,
    doorCuts: [0.36, -0.42, -1.12], pillars: [-0.45], rear: 'notch', windowFrame: CHROME,
  },
  wheel: { rim: 0.6, style: 'car' },
  front: { lamps: [{ shape: 'rect', x: 0.58, y: 0.66, w: 0.3, h: 0.15, bezel: 'chrome' }],
    grille: { y: 0.66, w: 0.5, h: 0.18, style: 'vbars', bars: 9, chrome: true, frame: 'chrome' },
    bumper: { y: 0.46, h: 0.09, style: 'chrome' }, plate: { y: 0.44, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.58, y: 0.72, w: 0.32, h: 0.13, lens: 'red', bezel: 'chrome' }],
    bumper: { y: 0.48, h: 0.09, style: 'chrome' }, plate: { y: 0.62, w: 0.29, h: 0.17 } },
  details: { handles: CHROME, mirrors: 'door', mirrorMat: CHROME, wipers: true, seams: true, sideTrim: { y: 0.6, mat: TRIM } },
};

/** VAZ-2104 (1984-2012): the estate. */
const VAZ_2104: CarModel = {
  ...VAZ_2107,
  body: { ...VAZ_2107.body, glassRearZ: -2.06, roofRearZ: -1.96, rear: 'estate', pillars: [-0.45, -1.4], doorCuts: [0.36, -0.42, -1.12],
    backlight: { w: 0.85, h: 0.6 }, windowFrame: TRIM },
  front: { ...VAZ_2107.front, grille: { y: 0.66, w: 0.5, h: 0.16, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    lamps: [{ shape: 'rect', x: 0.58, y: 0.66, w: 0.3, h: 0.14, bezel: 'black' }] },
  rear: { ...VAZ_2107.rear, lamps: [{ shape: 'rect', x: 0.66, y: 0.66, w: 0.14, h: 0.22, lens: 'red' }] },
  roofRack: true,
};

/** UAZ-452 "bukhanka" (1965-): the loaf of bread — rounded everywhere, a split screen, round lamps low. */
const UAZ_452: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.36, width: 1.94, frontAxle: 1.45, rearAxle: -0.85, wheelR: 0.39, tyreW: 0.21, track: 1.45,
    sill: 0.4, noseBottom: 0.44, tailBottom: 0.46, belt: 1.18, noseH: 1.12, tailH: 1.18, cowlZ: 1.98, glassRearZ: -2.18,
    roofFrontZ: 1.62, roofRearZ: -2.0, roofH: 2.05, roofTaper: 0.9, bonnetCrown: 0.04, roofCrown: 0.06, shoulderR: 0.22,
    noseRound: 0.36, tailRound: 0.3, tuckLow: 0.06, tuckHigh: 0.06, doorCuts: [1.3, 0.55, -0.3], pillars: [1.22, 0.1, -1.0],
    pillarW: 0.06, rear: 'estate', archR: 0.47, backlight: { w: 0.7, h: 0.45 },
  },
  wheel: { rim: 0.55, style: 'disc' },
  front: { lamps: [{ shape: 'round', x: 0.68, y: 0.82, r: 0.09, bezel: 'body' }, { shape: 'round', x: 0.68, y: 0.64, r: 0.035, lens: 'amber', bezel: 'body' }],
    grille: { y: 0.98, w: 0.5, h: 0.18, style: 'vbars', bars: 6, chrome: false, frame: 'body' },
    bumper: { y: 0.5, h: 0.1, style: 'painted' }, plate: { y: 0.5, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'round', x: 0.8, y: 0.74, r: 0.05, lens: 'red', bezel: 'body' }],
    bumper: { y: 0.52, h: 0.1, style: 'painted' }, plate: { y: 0.7, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

/** Toyota Hilux AN120 (2015-), double cab: the volunteers' and the territorial defence's pickup. */
const HILUX_DC: PickupModel = {
  kind: 'pickup',
  cab: {
    ...CAR_BASE, length: 3.45, width: 1.855, frontAxle: 0.86, wheelR: 0.385, tyreW: 0.265, track: 1.54,
    sill: 0.45, noseBottom: 0.5, tailBottom: 0.5, belt: 1.18, noseH: 1.12, tailH: 1.18,
    cowlZ: 0.08, glassRearZ: -1.725, roofFrontZ: -0.42, roofRearZ: -1.63, roofH: 1.82, roofTaper: 0.88,
    bonnetCrown: 0.04, roofCrown: 0.05, shoulderR: 0.1, noseRound: 0.24, tailRound: 0.05, archR: 0.48,
    doorCuts: [0.02, -0.82, -1.6], pillars: [-0.84], pillarW: 0.06, sideGlassTo: -1.5, backlight: { w: 0.68, h: 0.55 },
  },
  cabZ: 0.93, rearAxle: -1.72, trackR: 1.55,
  wheel: { rim: 0.62, style: 'car' },
  bed: { zF: -0.82, zB: -2.65, hw: 0.92, floor: 0.88, top: 1.2, archR: 0.48 },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.98, w: 0.32, h: 0.11, bezel: 'black' }],
    grille: { y: 0.92, w: 0.86, h: 0.3, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.58, h: 0.2, style: 'painted' }, plate: { y: 0.6, w: 0.52, h: 0.11 } },
  rearLamps: [{ shape: 'rect', x: 0.86, y: 1.0, w: 0.08, h: 0.24, lens: 'red' }],
  details: { handles: CHROME, mirrors: 'door', wipers: true, seams: true },
  rearBumper: 'chrome',
};

/** KamAZ-4326 (1995-): the four-by-four KamAZ, its tilt. */
const KAMAZ_4326: TruckModel = {
  kind: 'truck', length: 6.6, width: 2.5, frontAxle: 2.38, rearAxles: [-1.85], wheelR: 0.6, tyreW: 0.36,
  trackF: 2.0, trackR: 2.0, dualRear: false, wheelStyle: 'truck', frameY: 1.12, frameHW: 0.43, front: 'cabover',
  cab: { zF: 3.25, zB: 1.4, hw: 1.24, y0: 1.25, belt: 2.05, win: 2.7, roof: 3.0, rake: 0.1, tumble: 0.04, r: 0.12,
    roofR: 0.15, split: false, doorFrom: 0.2, doorTo: 0.8, rearWindow: true },
  frontFace: { lamps: [{ shape: 'rect', x: 0.95, y: 0.96, w: 0.26, h: 0.12, bezel: 'black' }, { shape: 'rect', x: 1.12, y: 1.32, w: 0.08, h: 0.12, lens: 'amber' }],
    grille: { y: 1.62, w: 1.5, h: 0.34, style: 'hbars', bars: 4, chrome: false, frame: 'body' }, bumper: { y: 0.8, h: 0.3, style: 'painted' } },
  rearLamps: [{ shape: 'rect', x: 1.0, y: 1.15, w: 0.22, h: 0.1, lens: 'red' }],
  body: { type: 'tilt', zF: 1.28, zB: -3.25, hw: 1.22, floorY: 1.5, sideH: 0.6, top: 3.3, wood: false },
  spare: 'side', fuelTank: 'side', mirrors: true,
};

const GAZ_53_BASE = {
  kind: 'truck', length: 6.4, width: 2.38, frontAxle: 2.28, rearAxles: [-1.42], wheelR: 0.46, tyreW: 0.24,
  trackF: 1.63, trackR: 1.69, dualRear: true, wheelStyle: 'truck', frameY: 0.92, frameHW: 0.43, front: 'wide',
  wide: { zNose: 3.15, noseH: 1.3, topH: 1.38, noseBottom: 0.6, archR: 0.54, shoulderR: 0.1, noseRound: 0.14 },
  cab: { zF: 1.55, zB: 0.12, hw: 1.04, y0: 0.98, belt: 1.5, win: 2.05, roof: 2.22, rake: 0.2, tumble: 0.07, r: 0.16,
    roofR: 0.12, split: true, doorFrom: 0.12, doorTo: 0.68, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.86, y: 1.1, r: 0.09, bezel: 'chrome' }],
    grille: { y: 1.0, w: 1.0, h: 0.42, style: 'vbars', bars: 9, chrome: false, frame: 'body' },
    bumper: { y: 0.7, h: 0.15, style: 'painted' } },
  rearLamps: [{ shape: 'rect', x: 1.0, y: 1.0, w: 0.18, h: 0.08, lens: 'red' }],
  spare: 'side', fuelTank: 'side', mirrors: true,
} satisfies Omit<TruckModel, 'body'>;

/** GAZ-3307 (1989-) with a box body. */
const GAZ_3307_BOX: TruckModel = {
  ...GAZ_53_BASE,
  frontFace: { ...GAZ_53_BASE.frontFace, lamps: [{ shape: 'rect', x: 0.84, y: 1.1, w: 0.22, h: 0.12, bezel: 'black' }],
    grille: { y: 1.02, w: 1.15, h: 0.38, style: 'hbars', bars: 5, chrome: false, frame: 'black' } },
  body: { type: 'box', zF: 0.02, zB: -3.15, hw: 1.17, floorY: 1.22, sideH: 0.5, top: 2.95, wood: false },
};

/** ZIL-130 (1964-94) with drop sides. */
const ZIL_130: TruckModel = {
  ...GAZ_53_BASE, length: 6.6, frontAxle: 2.3, rearAxles: [-1.5], wheelR: 0.48, tyreW: 0.26, trackF: 1.8, trackR: 1.79,
  wide: { zNose: 3.25, noseH: 1.36, topH: 1.42, noseBottom: 0.62, archR: 0.56, shoulderR: 0.08, noseRound: 0.12 },
  cab: { ...GAZ_53_BASE.cab, zF: 1.62, zB: 0.1, hw: 1.08, belt: 1.55, win: 2.15, roof: 2.38, rake: 0.25, tumble: 0.08, r: 0.18 },
  frontFace: { lamps: [{ shape: 'round', x: 0.92, y: 1.12, r: 0.09, bezel: 'chrome' }, { shape: 'rect', x: 0.95, y: 0.92, w: 0.14, h: 0.06, lens: 'amber' }],
    grille: { y: 1.0, w: 1.15, h: 0.42, style: 'hbars', bars: 7, chrome: true, frame: 'chrome' }, bumper: { y: 0.72, h: 0.16, style: 'painted' } },
  body: { type: 'dropside', zF: 0.0, zB: -3.25, hw: 1.16, floorY: 1.32, sideH: 0.58, wood: true },
};

// ---------------------------------------------------------------------------------------------------- the fleets

const ARMY_GREEN = [0x4b5320, 0x55602f, 0x4a5232, 0x5b6340];

export const FLEETS: Readonly<Record<string, Fleet>> = {
  soviet1943: {
    id: 'soviet1943', label: 'Kursk salient, 1943', age: 0.35,
    roles: {
      sedan: { model: GAZ_M1, paints: [0x1d1e1c, 0x2b3128, 0x2a3036, 0x3a4030] },
      wagon: { model: GAZ_61, paints: [0x3e4730, 0x2b3128, 0x4b5320] },
      pickup: { model: GAZ_M415, paints: ARMY_GREEN },
      van: { model: WC_54, paints: [0x4a4b2a, 0x55553a] },
      jeep: { model: GAZ_67B, paints: ARMY_GREEN },
      truck: { model: ZIS_5V, paints: ARMY_GREEN },
      truckbox: { model: GAZ_AA_BOX, paints: ARMY_GREEN },
      truckflatbed: { model: GAZ_AA, paints: [...ARMY_GREEN, 0x6a6a58] },
    },
  },
  western1944: {
    id: 'western1944', label: 'the Western Front, 1944-45', age: 0.3,
    roles: {
      sedan: { model: TRACTION, paints: [0x1c1c1c, 0x232323, 0x3b2f2a, 0x2c3330] },
      wagon: { model: KUBEL, paints: [0xa8915a, 0x6b6a52, 0x5d6151] },
      pickup: { model: WC_51, paints: [0x4a4b2a, 0x505131] },
      van: { model: WC_54, paints: [0x4a4b2a, 0x55553a] },
      jeep: { model: WILLYS_MB, paints: [0x4a4b2a, 0x4f5030, 0x55553a] },
      truck: { model: GMC_CCKW, paints: [0x4a4b2a, 0x505131] },
      truckbox: { model: OPEL_BLITZ_BOX, paints: [0x5d6151, 0xa8915a, 0x6b6a52] },
      truckflatbed: { model: OPEL_BLITZ, paints: [0x5d6151, 0xa8915a, 0x6b6a52] },
    },
  },
  us1960s: {
    id: 'us1960s', label: 'the American Southwest, the 1960s', age: 0.2,
    roles: {
      sedan: { model: FORD_FALCON, paints: [0x2e7f80, 0xe9e4d6, 0xa83226, 0xc8b78a, 0x3a5f8a, 0x7a9e7e] },
      wagon: { model: FORD_FALCON_WAGON, paints: [0xe9e4d6, 0xc8b78a, 0x7a9e7e, 0x8a2e2a] },
      pickup: { model: FORD_F100, paints: [0x2e7f80, 0xe9e4d6, 0x8a2e2a, 0x3a5f8a, 0xb08d4a] },
      van: { model: ECONOLINE, paints: [0xe9e4d6, 0x3a5f8a, 0xc9a227] },
      jeep: { model: JEEP_CJ5, paints: [0xc9a227, 0x5f6b44, 0xa83226, 0xe9e4d6] },
      truck: { model: FORD_F600_STAKE, paints: [0xe9e4d6, 0xc9a227, 0x3a5f8a] },
      truckbox: { model: FORD_F600_BOX, paints: [0xe9e4d6, 0xc9a227] },
      truckflatbed: { model: IH_LOADSTAR, paints: [0xc9a227, 0xe9e4d6, 0x8a2e2a] },
    },
  },
  yugoslav1990s: {
    id: 'yugoslav1990s', label: 'Bosnia and Dalmatia, the 1980s-90s', age: 0.3,
    roles: {
      sedan: { model: ZASTAVA_101, paints: [0xd8d4c8, 0xb03a2e, 0xd9772b, 0x2c6e8f, 0xcdbf8c, 0x4a4a48] },
      wagon: { model: YUGO_45, paints: [0xd8d4c8, 0xb03a2e, 0x2c6e8f, 0xd4c48c, 0x6a7a3a] },
      pickup: { model: HILUX_N50, paints: [0xeeeeea, 0xb03a2e, 0x8a8f86] },
      van: { model: VW_T3, paints: [0xd8d4c8, 0x2c6e8f, 0xc9a227, 0xeeeeea] },
      jeep: { model: LADA_NIVA, paints: [0xeeeeea, 0x4a5a3a, 0xc9a227, 0xb03a2e] },
      truck: { model: TAM_110, paints: [0x4a5a3a, 0x525d40] },
      truckbox: { model: TAM_80_BOX, paints: [0xd8d4c8, 0x2c6e8f, 0x4a5a3a] },
      truckflatbed: { model: FAP_1314, paints: [0xd9772b, 0x2c6e8f, 0x4a5a3a] },
    },
  },
  ukraine2022: {
    id: 'ukraine2022', label: 'Kyiv oblast, 2022', age: 0.25,
    roles: {
      sedan: { model: VAZ_2107, paints: [0xe8e8e2, 0x9aa0a4, 0x2a2d30, 0x7a1e1e, 0x3d6b45, 0x6b7a8a] },
      wagon: { model: VAZ_2104, paints: [0xe8e8e2, 0x9aa0a4, 0x6b7a8a, 0x7a5a3a] },
      pickup: { model: HILUX_DC, paints: [0xe8e8e2, 0x2a2d30, 0x9aa0a4, 0x4b5a32] },
      van: { model: UAZ_452, paints: [0x5a6b3e, 0xe8e8e2, 0x4a6a8a] },
      jeep: { model: LADA_NIVA, paints: [0x3d6b45, 0xe8e8e2, 0x9aa0a4, 0x7a1e1e] },
      truck: { model: KAMAZ_4326, paints: [0x4b5a32, 0xd9822b] },
      truckbox: { model: GAZ_3307_BOX, paints: [0x2f5d8a, 0x4b5a32, 0xe8e8e2] },
      truckflatbed: { model: ZIL_130, paints: [0x3a6fa0, 0x4b5a32, 0xd9822b] },
    },
  },
};

/** Each map's fleet (its Reference: line); maps without one dress in the default until their fleet lands. */
const MAP_FLEETS: Readonly<Record<string, string>> = {
  verdant: 'soviet1943',
  alpine: 'western1944', foundry: 'western1944', reservoir: 'western1944', polders: 'western1944', autumn: 'western1944',
  skybridge: 'us1960s', titan_gorge: 'us1960s',
  ruinspires: 'yugoslav1990s', saltwind: 'yugoslav1990s',
  airfield: 'ukraine2022',
};

export const DEFAULT_FLEET = 'ukraine2022';

export function fleetForMap(mapId: string): Fleet {
  return FLEETS[MAP_FLEETS[mapId] ?? DEFAULT_FLEET];
}

// ---------------------------------------------------------------------------------------------------- the soil

export interface VehicleClimate {
  /** Soil splashed up the lower body (sRGB hex) and how much. */
  readonly dirt: number;
  readonly dirtAmount: number;
  /** Dust on the top faces (sRGB hex) and how much (dry maps). */
  readonly dust: number;
  readonly dustAmount: number;
}

const TEMPERATE: VehicleClimate = { dirt: 0x4a3c2c, dirtAmount: 0.5, dust: 0x8a7c66, dustAmount: 0 };
const ARID: VehicleClimate = { dirt: 0x8c7454, dirtAmount: 0.45, dust: 0xb09872, dustAmount: 0.35 };
const RED_ROCK: VehicleClimate = { dirt: 0x8a4e30, dirtAmount: 0.5, dust: 0xb07a52, dustAmount: 0.35 };
const SNOW: VehicleClimate = { dirt: 0x5a5650, dirtAmount: 0.45, dust: 0x9a968c, dustAmount: 0 };
const TROPICAL: VehicleClimate = { dirt: 0x6a4a30, dirtAmount: 0.6, dust: 0x8a7458, dustAmount: 0.05 };
const ASH: VehicleClimate = { dirt: 0x2e2c2a, dirtAmount: 0.55, dust: 0x4e4a46, dustAmount: 0.25 };
const BLACK_EARTH: VehicleClimate = { dirt: 0x2e2620, dirtAmount: 0.6, dust: 0x6a5e50, dustAmount: 0.05 };

const MAP_CLIMATES: Readonly<Record<string, VehicleClimate>> = {
  verdant: BLACK_EARTH, steppe: { ...ARID, dirt: 0x7a6a4e, dustAmount: 0.25 }, desert: ARID, oasis: ARID, badlands: RED_ROCK,
  titan_gorge: RED_ROCK, skybridge: RED_ROCK, copper_mesa: { ...RED_ROCK, dirt: 0x6e5a48 }, frontier: TEMPERATE,
  winter: SNOW, whiteout: SNOW, alpine: SNOW, delta: TROPICAL, mangrove: TROPICAL, monsoon: TROPICAL,
  caldera: ASH, orchard: { ...ARID, dustAmount: 0.2 },
};

export function climateForMap(mapId: string): VehicleClimate {
  return MAP_CLIMATES[mapId] ?? TEMPERATE;
}
