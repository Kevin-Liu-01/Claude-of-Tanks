// src/world/maps/vehicleModels.ts — the map-vehicles lane's catalogue of real vehicle types (2026-10-05), each at its
// own dimensions, for the fleets in vehicleFleets.ts. A spec is the type's proportions and its face: the body's length,
// width and wheelbase, where the screen and the roof stand, the wings, the grille and the lamps, the cab, the body.
// Sources: the makers' published dimensions; period photographs for the faces.

import { CHROME, TRIM, WOOD, fixedPaint, type CarBodySpec } from './vehicleCoachwork.ts';
import type { CarModel, JeepModel, PeriodCarModel, PickupModel, TruckModel } from './vehicleBodies.ts';

// ---------------------------------------------------------------------------------------------------- shared bits

const CAR_BASE = {
  sillR: 0.04, tuckLow: 0.05, tuckHigh: 0.03, bonnetCrown: 0.03, roofCrown: 0.04, pillarW: 0.04,
} satisfies Partial<CarBodySpec>;

// ---------------------------------------------------------------------------------------------------- the 1930s-40s

/** GAZ-M1 "Emka" (1936-43): the Red Army's staff car, the Ford Model 40 grown Russian. */
export const GAZ_M1: PeriodCarModel = {
  kind: 'period',
  body: {
    ...CAR_BASE, length: 4.44, width: 1.52, noseWidth: 0.92, frontAxle: 1.67, rearAxle: -1.175, wheelR: 0.36, tyreW: 0.18,
    track: 1.45, sill: 0.46, noseBottom: 0.55, tailBottom: 0.5, belt: 1.05, noseH: 1.04, tailH: 0.92,
    cowlZ: 0.42, glassRearZ: -1.42, roofFrontZ: 0.16, roofRearZ: -1.05, roofH: 1.72, roofTaper: 0.86,
    bonnetCrown: 0.07, roofCrown: 0.06, shoulderR: 0.1, sillR: 0.05, noseRound: 0.28, tailRound: 0.3,
    tuckHigh: 0.05, doorCuts: [0.36, -0.42, -1.05], pillars: [-0.44], pillarW: 0.05, rear: 'notch',
    glassH: 0.4, roofEdgeR: 0.16, backlight: { w: 0.6, h: 0.62, top: 0.14 },
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
export const GAZ_61: PeriodCarModel = {
  ...GAZ_M1,
  body: { ...GAZ_M1.body, wheelR: 0.4, tyreW: 0.2, sill: 0.54, noseBottom: 0.63, tailBottom: 0.58, belt: 1.13, noseH: 1.12,
    tailH: 1.0, roofH: 1.8 },
  wings: { ...GAZ_M1.wings, w: 0.29 },
  runningBoardY: 0.5,
  grille: { ...GAZ_M1.grille!, y: 0.88 },
  lamps: { ...GAZ_M1.lamps, y: 1.08 },
  spare: 'side',
};

/** GAZ-M415 (1939-41): the Emka's front and cab with a wooden bed — the kolkhoz pickup. */
export const GAZ_M415: PeriodCarModel = { ...GAZ_M1, bed: { zF: -0.5, zB: -2.3, hw: 0.72, floor: 0.82, top: 1.22 }, spare: 'side' };

/** Citroen Traction Avant 11 BL (1934-57): low, front-driven, black; the occupation's and the Resistance's car. */
export const TRACTION: PeriodCarModel = {
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
export const WILLYS_MB: JeepModel = {
  kind: 'jeep', length: 3.33, frontAxle: 1.06, rearAxle: -0.97, wheelR: 0.36, tyreW: 0.16, track: 1.24,
  wheel: { rim: 0.5, style: 'disc' },
  tub: { hw: 0.7, floor: 0.52, top: 1.02, zF: 0.22, rearRound: 0.1 },
  bonnet: { hw: 0.4, top: 1.06, slope: 0.03 },
  grille: { style: 'slots', w: 0.62, h: 0.44, y: 0.84, count: 9 },
  lamps: { x: 0.36, y: 0.84, r: 0.085, inGrille: true },
  wings: { w: 0.24, flatTop: 0.84 },
  windscreen: { h: 0.42, folded: false },
  top: 'none', spare: 'rear',
};

/** GAZ-67B (1944-53): the Soviet jeep — a narrow barred radiator, wings like a polutorka's, a slab tub. */
export const GAZ_67B: JeepModel = {
  ...WILLYS_MB, length: 3.35, frontAxle: 1.08, rearAxle: -1.02, wheelR: 0.38, tyreW: 0.17, track: 1.446,
  tub: { hw: 0.8, floor: 0.6, top: 1.1, zF: 0.2, rearRound: 0.08 },
  bonnet: { hw: 0.36, top: 1.18, slope: 0.05 },
  grille: { style: 'vbars', w: 0.46, h: 0.5, y: 0.92, count: 11 },
  lamps: { x: 0.56, y: 0.96, r: 0.09, inGrille: false },
  wings: { w: 0.26, flatTop: 0.94 },
  windscreen: { h: 0.44, folded: false }, top: 'canvas', spare: 'rear',
};

/** VW Kuebelwagen Typ 82 (1940-45): rear-engined, a sloped smooth nose, slab sides, the spare on the bonnet. */
export const KUBEL: JeepModel = {
  ...WILLYS_MB, length: 3.74, frontAxle: 1.15, rearAxle: -1.25, wheelR: 0.33, tyreW: 0.17, track: 1.37,
  tub: { hw: 0.8, floor: 0.5, top: 1.0, zF: 0.45, rearRound: 0.12 },
  bonnet: { hw: 0.62, top: 0.98, slope: 0.32 },
  grille: { style: 'none', w: 0, h: 0, y: 0, count: 0 },
  lamps: { x: 0.64, y: 0.86, r: 0.085, inGrille: false, mount: 'wing' },
  wings: { w: 0.26, flatTop: 0.76 },
  windscreen: { h: 0.4, folded: false }, top: 'none', spare: 'bonnet', slopeNose: true,
  doors: [0.42, -0.22, -0.78], rearDeck: { zF: -0.8, top: 1.0, tail: 0.72 },
};

/** GAZ-AA "polutorka" (1932-49) with its wooden drop sides. */
export const GAZ_AA: TruckModel = {
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
export const GAZ_AA_BOX: TruckModel = {
  ...GAZ_AA, body: { type: 'box', zF: 0.12, zB: -2.62, hw: 0.99, floorY: 1.1, sideH: 0.5, top: 2.45, wood: true },
};

/** ZIS-5V (1942-48): the wartime three-tonner — a wooden cab, flat bent wings, a single headlamp, a canvas tilt. */
export const ZIS_5V: TruckModel = {
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
export const WC_54: TruckModel = {
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
export const WC_51: TruckModel = {
  ...WC_54, length: 4.24, frontAxle: 1.55, rearAxles: [-0.94],
  cab: { ...WC_54.cab, zF: 1.0, zB: 0.25, roof: 1.98, soft: true, intoBody: false, rearWindow: true },
  body: { type: 'dropside', zF: 0.2, zB: -2.07, hw: 0.95, floorY: 0.95, sideH: 0.48, wood: false },
  bonnet: { ...WC_54.bonnet!, zRad: 1.98 },
};

/** GMC CCKW-353 (1941-45): the deuce-and-a-half, 6x6, its brush-guard grille, a canvas-topped cab, the tilt. */
export const GMC_CCKW: TruckModel = {
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
export const OPEL_BLITZ: TruckModel = {
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

export const OPEL_BLITZ_BOX: TruckModel = {
  ...OPEL_BLITZ, body: { type: 'box', zF: 0.3, zB: -2.98, hw: 1.1, floorY: 1.22, sideH: 0.5, top: 2.75, wood: false },
};

// ---------------------------------------------------------------------------------------------------- the 1960s USA

/** Ford Falcon (1960-63): the compact — flat sides, a full-width grille, round lamps at its ends, chrome. */
export const FORD_FALCON: CarModel = {
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

export const FORD_FALCON_WAGON: CarModel = {
  ...FORD_FALCON,
  body: { ...FORD_FALCON.body, glassRearZ: -2.3, roofRearZ: -2.16, rear: 'estate', pillars: [-0.44, -1.22], doorCuts: [0.35, -0.42, -1.18] },
  roofRack: true,
};

/** Ford Econoline (1961-67): the forward-control van — a flat face, round lamps, the cab over the engine. */
export const ECONOLINE: CarModel = {
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
export const FORD_F100: PickupModel = {
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
export const JEEP_CJ5: JeepModel = {
  ...WILLYS_MB, length: 3.4, frontAxle: 1.15, rearAxle: -0.91, wheelR: 0.37, tyreW: 0.2, track: 1.3,
  tub: { hw: 0.76, floor: 0.56, top: 1.05, zF: 0.28, rearRound: 0.12 },
  bonnet: { hw: 0.42, top: 1.1, slope: 0.02 },
  grille: { style: 'slots', w: 0.6, h: 0.42, y: 0.88, count: 7 },
  lamps: { x: 0.36, y: 0.88, r: 0.085, inGrille: true },
  wings: { w: 0.26, flatTop: 0.88 },
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
export const FORD_F600_STAKE: TruckModel = {
  ...F600_BASE, body: { type: 'dropside', zF: 0.02, zB: -3.22, hw: 1.15, floorY: 1.25, sideH: 1.05, wood: true },
};
export const FORD_F600_BOX: TruckModel = {
  ...F600_BASE, body: { type: 'box', zF: 0.02, zB: -3.22, hw: 1.17, floorY: 1.25, sideH: 0.5, top: 3.05, wood: false },
};
/** International Harvester Loadstar (1962-78) flatbed with pipe. */
export const IH_LOADSTAR: TruckModel = {
  ...F600_BASE,
  wide: { ...F600_BASE.wide, noseH: 1.3, topH: 1.36, noseRound: 0.08, shoulderR: 0.06 },
  frontFace: { ...F600_BASE.frontFace, grille: { y: 1.02, w: 1.45, h: 0.42, style: 'mesh', bars: 12, chrome: false, frame: 'body' } },
  body: { type: 'flatbed', zF: 0.02, zB: -3.22, hw: 1.15, floorY: 1.25, sideH: 0.2, wood: true, load: 'pipes' },
};

// ---------------------------------------------------------------------------------------------------- Yugoslavia, 1980s-90s

/** Zastava 101 "Stojadin" (1971-2008): Kragujevac's hatchback on the Fiat 128. */
export const ZASTAVA_101: CarModel = {
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
export const YUGO_45: CarModel = {
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
export const VW_T3: CarModel = {
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
export const HILUX_N50: PickupModel = {
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
export const LADA_NIVA: CarModel = {
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
export const TAM_110: TruckModel = { ...TAM_BASE, body: { type: 'tilt', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.38, sideH: 0.55, top: 3.0, wood: false } };
/** TAM 80 with a box body. */
export const TAM_80_BOX: TruckModel = {
  ...TAM_BASE, dualRear: true, wheelR: 0.44, frontAxle: 2.25, cab: { ...TAM_BASE.cab, y0: 1.05, belt: 1.8, win: 2.38, roof: 2.55 },
  body: { type: 'box', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.25, sideH: 0.5, top: 3.0, wood: false },
};
/** FAP 1314 with drop sides. */
export const FAP_1314: TruckModel = {
  ...TAM_BASE, dualRear: true, wheelR: 0.52, cab: { ...TAM_BASE.cab, r: 0.06, roofR: 0.08 },
  frontFace: { ...TAM_BASE.frontFace, grille: { y: 1.5, w: 1.4, h: 0.36, style: 'mesh', bars: 10, chrome: false, frame: 'body' } },
  body: { type: 'dropside', zF: 1.28, zB: -3.08, hw: 1.17, floorY: 1.4, sideH: 0.6, wood: false },
};

// ---------------------------------------------------------------------------------------------------- Ukraine, 2022

/** VAZ-2107 (1982-2012): the "semyorka", its chrome grille and the square lamps. */
export const VAZ_2107: CarModel = {
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
export const VAZ_2104: CarModel = {
  ...VAZ_2107,
  body: { ...VAZ_2107.body, glassRearZ: -2.06, roofRearZ: -1.96, rear: 'estate', pillars: [-0.45, -1.4], doorCuts: [0.36, -0.42, -1.12],
    backlight: { w: 0.85, h: 0.6 }, windowFrame: TRIM },
  front: { ...VAZ_2107.front, grille: { y: 0.66, w: 0.5, h: 0.16, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    lamps: [{ shape: 'rect', x: 0.58, y: 0.66, w: 0.3, h: 0.14, bezel: 'black' }] },
  rear: { ...VAZ_2107.rear, lamps: [{ shape: 'rect', x: 0.66, y: 0.66, w: 0.14, h: 0.22, lens: 'red' }] },
  roofRack: true,
};

/** UAZ-452 "bukhanka" (1965-): the loaf of bread — rounded everywhere, a split screen, round lamps low. */
export const UAZ_452: CarModel = {
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
export const HILUX_DC: PickupModel = {
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
export const KAMAZ_4326: TruckModel = {
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
export const GAZ_3307_BOX: TruckModel = {
  ...GAZ_53_BASE,
  frontFace: { ...GAZ_53_BASE.frontFace, lamps: [{ shape: 'rect', x: 0.84, y: 1.1, w: 0.22, h: 0.12, bezel: 'black' }],
    grille: { y: 1.02, w: 1.15, h: 0.38, style: 'hbars', bars: 5, chrome: false, frame: 'black' } },
  body: { type: 'box', zF: 0.02, zB: -3.15, hw: 1.17, floorY: 1.22, sideH: 0.5, top: 2.95, wood: false },
};

/** ZIL-130 (1964-94) with drop sides. */
export const ZIL_130: TruckModel = {
  ...GAZ_53_BASE, length: 6.6, frontAxle: 2.3, rearAxles: [-1.5], wheelR: 0.48, tyreW: 0.26, trackF: 1.8, trackR: 1.79,
  wide: { zNose: 3.25, noseH: 1.36, topH: 1.42, noseBottom: 0.62, archR: 0.56, shoulderR: 0.08, noseRound: 0.12 },
  cab: { ...GAZ_53_BASE.cab, zF: 1.62, zB: 0.1, hw: 1.08, belt: 1.55, win: 2.15, roof: 2.38, rake: 0.25, tumble: 0.08, r: 0.18 },
  frontFace: { lamps: [{ shape: 'round', x: 0.92, y: 1.12, r: 0.09, bezel: 'chrome' }, { shape: 'rect', x: 0.95, y: 0.92, w: 0.14, h: 0.06, lens: 'amber' }],
    grille: { y: 1.0, w: 1.15, h: 0.42, style: 'hbars', bars: 7, chrome: true, frame: 'chrome' }, bumper: { y: 0.72, h: 0.16, style: 'painted' } },
  body: { type: 'dropside', zF: 0.0, zB: -3.25, hw: 1.16, floorY: 1.32, sideH: 0.58, wood: true },
};

// ---------------------------------------------------------------------------------------------------- the 1930s-40s, more

/** A period sedan's common body: a ~4.7 m four-door of the late 1930s, tall, upright screen, separate wings. */
const PERIOD_BASE: PeriodCarModel = {
  ...GAZ_M1,
  body: { ...GAZ_M1.body },
  details: { handles: CHROME, mirrors: 'none', wipers: true, seams: true },
};

/** Ford V8 Model 81A/91A Fordor (1938-39): the lamps faired into the wings, a heart-shaped grille. */
export const FORD_V8_1938: PeriodCarModel = {
  ...PERIOD_BASE,
  body: { ...PERIOD_BASE.body, length: 4.7, width: 1.6, noseWidth: 0.9, frontAxle: 1.72, rearAxle: -1.12, wheelR: 0.37, tyreW: 0.16,
    track: 1.42, sill: 0.45, belt: 1.02, noseH: 1.0, tailH: 0.9, cowlZ: 0.42, roofFrontZ: 0.14, roofRearZ: -1.0, glassRearZ: -1.42,
    roofH: 1.7, noseRound: 0.32, tailRound: 0.34, glassH: 0.38, splitScreen: true },
  grille: { w: 0.52, h: 0.68, y: 0.78, v: 0.14, bars: 16, chrome: true, vertical: true },
  lamps: { x: 0.56, y: 0.92, dz: 0.38, r: 0.1, mount: 'wing' },
  spare: 'none',
  rearLamps: [{ shape: 'round', x: 0.6, y: 0.82, r: 0.04, lens: 'red', dz: 0.2 }],
};

/** Ford Deluxe (1940): sealed-beam lamps in the wings' noses, a V of chrome bars either side of the bonnet's point. */
export const FORD_1940: PeriodCarModel = {
  ...FORD_V8_1938,
  body: { ...FORD_V8_1938.body, length: 4.83, noseWidth: 0.96, belt: 1.0, noseH: 0.98, roofH: 1.68 },
  grille: { w: 0.7, h: 0.5, y: 0.72, v: 0.18, bars: 9, chrome: true },
  lamps: { x: 0.62, y: 0.82, dz: 0.5, r: 0.1, mount: 'wing' },
};

/** Ford woody station wagon (1939-40): the 1940 front, the body behind the cowl in varnished ash and maple. */
export const FORD_WOODY: PeriodCarModel = {
  ...FORD_1940,
  body: { ...FORD_1940.body, glassRearZ: -2.36, roofRearZ: -2.24, rear: 'estate', pillars: [-0.44, -1.32], doorCuts: [0.36, -0.42, -1.3],
    rearMat: { fromZ: 0.36, mat: WOOD }, backlight: { w: 0.8, h: 0.55, top: 0.1 } },
  spare: 'side',
};

/** Chevrolet Master Deluxe (1936): lamps on stalks, a tall barred grille, the "turret top". */
export const CHEVROLET_1936: PeriodCarModel = {
  ...PERIOD_BASE,
  body: { ...PERIOD_BASE.body, length: 4.6, width: 1.65, noseWidth: 0.86, frontAxle: 1.66, rearAxle: -1.09, wheelR: 0.36, tyreW: 0.16,
    track: 1.44, sill: 0.46, belt: 1.04, noseH: 1.02, tailH: 0.95, cowlZ: 0.45, roofFrontZ: 0.18, roofRearZ: -1.0, glassRearZ: -1.4,
    roofH: 1.74, noseRound: 0.22, tailRound: 0.36 },
  grille: { w: 0.58, h: 0.72, y: 0.82, v: 0.06, bars: 14, chrome: true, vertical: true },
  lamps: { x: 0.54, y: 1.02, dz: 0.4, r: 0.11 },
  spare: 'tail',
};

/** Chevrolet (1934): a squarer cab and a taller nose. */
export const CHEVROLET_1934: PeriodCarModel = {
  ...CHEVROLET_1936,
  body: { ...CHEVROLET_1936.body, length: 4.5, roofH: 1.78, tailH: 1.0, noseRound: 0.14, tailRound: 0.26, shoulderR: 0.07, roofTaper: 0.9 },
  grille: { w: 0.6, h: 0.76, y: 0.84, v: 0.03, bars: 14, chrome: true, vertical: true },
};

/** Buick Series 40 Special (1935-36): long, tall, a pointed barred grille; the Bund's taxis and private cars. */
export const BUICK_1935: PeriodCarModel = {
  ...CHEVROLET_1936,
  body: { ...CHEVROLET_1936.body, length: 4.92, width: 1.72, noseWidth: 0.9, frontAxle: 1.82, rearAxle: -1.18, wheelR: 0.38,
    cowlZ: 0.36, roofFrontZ: 0.1, roofRearZ: -1.1, glassRearZ: -1.5, roofH: 1.75 },
  grille: { w: 0.62, h: 0.8, y: 0.84, v: 0.12, bars: 16, chrome: true, vertical: true },
  lamps: { x: 0.58, y: 1.04, dz: 0.44, r: 0.12 },
};

/** Humber Super Snipe (1938-48): the British staff car of Burma and India, upright and square. */
export const HUMBER_SNIPE: PeriodCarModel = {
  ...PERIOD_BASE,
  body: { ...PERIOD_BASE.body, length: 4.65, width: 1.75, noseWidth: 0.92, frontAxle: 1.68, rearAxle: -1.18, wheelR: 0.38, tyreW: 0.18,
    track: 1.5, sill: 0.48, belt: 1.06, noseH: 1.06, tailH: 0.98, cowlZ: 0.4, roofFrontZ: 0.16, roofRearZ: -1.06, glassRearZ: -1.46,
    roofH: 1.75, noseRound: 0.12, tailRound: 0.3, shoulderR: 0.07, roofTaper: 0.9 },
  grille: { w: 0.6, h: 0.66, y: 0.82, v: 0.02, bars: 12, chrome: true, vertical: true },
  lamps: { x: 0.6, y: 0.98, dz: 0.36, r: 0.11 },
  spare: 'side',
};

/** Humber Heavy Utility (1941-45): the "Box", a boxy estate on the Snipe's chassis. */
export const HUMBER_UTILITY: PeriodCarModel = {
  ...HUMBER_SNIPE,
  body: { ...HUMBER_SNIPE.body, glassRearZ: -2.3, roofRearZ: -2.2, rear: 'estate', roofH: 1.95, pillars: [-0.44, -1.3], doorCuts: [0.36, -0.42, -1.28],
    tailRound: 0.08, roofTaper: 0.94, backlight: { w: 0.7, h: 0.5, top: 0.1 }, glassH: 0.46 },
  wheel: { rim: 0.5, style: 'disc' },
  bumpers: 'painted',
};

/** Ford pickup (1938-40): the car's front and cab, a narrow steel bed with a wooden floor. */
export const FORD_PICKUP_1940: PeriodCarModel = {
  ...FORD_1940, bed: { zF: -0.4, zB: -2.32, hw: 0.68, floor: 0.82, top: 1.25 }, spare: 'side', bumpers: 'painted',
};

/** Austin 10 "Tilly" (1939-45): the light utility, a small saloon front with a canvas-topped bed. */
export const AUSTIN_TILLY: PeriodCarModel = {
  ...HUMBER_SNIPE,
  body: { ...HUMBER_SNIPE.body, length: 3.98, width: 1.47, noseWidth: 0.82, frontAxle: 1.48, rearAxle: -0.89, wheelR: 0.33, tyreW: 0.15,
    track: 1.22, belt: 0.98, noseH: 0.98, roofH: 1.62, cowlZ: 0.42 },
  bed: { zF: -0.18, zB: -1.99, hw: 0.66, floor: 0.75, top: 1.15 },
  grille: { w: 0.48, h: 0.56, y: 0.76, v: 0.02, bars: 9, chrome: false, vertical: true },
  lamps: { x: 0.5, y: 0.92, dz: 0.3, r: 0.09 },
  bumpers: 'painted', spare: 'side',
};

/** Ford panel delivery (1938-41): the car's front, a closed van body with no side glass behind the doors. */
export const FORD_PANEL_1940: PeriodCarModel = {
  ...FORD_1940,
  body: { ...FORD_1940.body, glassRearZ: -2.36, roofRearZ: -2.28, rear: 'estate', roofH: 1.86, pillars: [], doorCuts: [0.36, -0.36],
    sideGlassTo: -0.3, backlight: { w: 0.62, h: 0.34, top: 0.08, split: true }, glassH: 0.4, roofEdgeR: 0.14, tailRound: 0.16 },
  spare: 'side', bumpers: 'painted',
};

/** Austin 7 van (1930s): the tiny delivery van of the treaty ports' shops. */
export const AUSTIN_7_VAN: PeriodCarModel = {
  ...FORD_PANEL_1940,
  body: { ...FORD_PANEL_1940.body, length: 3.15, width: 1.3, noseWidth: 0.7, frontAxle: 1.08, rearAxle: -0.84, wheelR: 0.3, tyreW: 0.11,
    track: 1.1, sill: 0.4, belt: 0.95, noseH: 0.95, tailH: 0.95, cowlZ: 0.38, roofFrontZ: 0.2, roofRearZ: -1.5, glassRearZ: -1.58,
    roofH: 1.72, noseRound: 0.1, tailRound: 0.08, doorCuts: [0.32, -0.3], sideGlassTo: -0.25, glassH: 0.36, splitScreen: false },
  grille: { w: 0.42, h: 0.5, y: 0.74, v: 0.01, bars: 8, chrome: true, vertical: true },
  lamps: { x: 0.42, y: 0.92, dz: 0.24, r: 0.08 },
  wings: { w: 0.18, front: [[1.1, 0.25], [1.0, 0.7], [0.5, 0.95], [0, 1.02], [-0.6, 0.85]], rear: [[0.95, 0.3], [0.6, 0.86], [0, 1.0], [-0.7, 0.8], [-1.0, 0.3]] },
  runningBoardY: 0.38,
};

/** Bantam BRC-40 (1941): the first jeep, of the Louisiana maneuvers. */
export const BANTAM_BRC40: JeepModel = {
  ...WILLYS_MB, length: 3.38,
  grille: { style: 'vbars', w: 0.58, h: 0.42, y: 0.84, count: 10 },
  lamps: { x: 0.52, y: 0.92, r: 0.085, inGrille: false },
  wings: { w: 0.26, flatTop: 0.84 },
};

/** Kurogane Type 95 (1936-44): the Imperial Army's small scout car, air-cooled, a soft top. */
export const KUROGANE_95: JeepModel = {
  ...WILLYS_MB, length: 3.6, frontAxle: 1.1, rearAxle: -0.9, wheelR: 0.35, tyreW: 0.14, track: 1.2,
  tub: { hw: 0.66, floor: 0.55, top: 1.02, zF: 0.3, rearRound: 0.18 },
  bonnet: { hw: 0.42, top: 1.0, slope: 0.12 },
  grille: { style: 'vbars', w: 0.5, h: 0.36, y: 0.8, count: 8 },
  lamps: { x: 0.5, y: 0.94, r: 0.08, inGrille: false },
  wings: { w: 0.22, flatTop: 0.8 }, top: 'canvas', spare: 'rear',
};

/** DKW Munga (1956-68): the Bundeswehr's and the foresters' two-stroke runabout, slab-sided, round lamps. */
export const DKW_MUNGA: JeepModel = {
  ...WILLYS_MB, length: 3.45, frontAxle: 1.1, rearAxle: -0.9, wheelR: 0.33, tyreW: 0.16, track: 1.2,
  tub: { hw: 0.76, floor: 0.55, top: 1.05, zF: 0.36, rearRound: 0.08 },
  bonnet: { hw: 0.7, top: 1.02, slope: 0.1 },
  grille: { style: 'slots', w: 0.42, h: 0.2, y: 0.86, count: 5 },
  lamps: { x: 0.56, y: 0.86, r: 0.08, inGrille: false },
  wings: { w: 0.22, flatTop: 0.82 }, top: 'canvas', spare: 'side',
};

/** GAZ-69 (1953-73): the Soviet field car under its tent, doors and a squared bonnet. */
export const GAZ_69: JeepModel = {
  ...GAZ_67B, length: 3.85, frontAxle: 1.25, rearAxle: -1.05, wheelR: 0.39, tyreW: 0.18, track: 1.44,
  tub: { hw: 0.88, floor: 0.6, top: 1.2, zF: 0.28, rearRound: 0.06 },
  bonnet: { hw: 0.66, top: 1.26, slope: 0.04 },
  grille: { style: 'vbars', w: 0.56, h: 0.42, y: 0.95, count: 9 },
  lamps: { x: 0.62, y: 1.02, r: 0.09, inGrille: false },
  wings: { w: 0.28, flatTop: 0.96 }, top: 'canvas', spare: 'rear',
};

const NARROW_TRUCK: TruckModel = { ...GAZ_AA };

/** Studebaker US6 (1941-45): lend-lease, the Red Army's six-by-six to Berlin; a guard of bars over its grille. */
export const STUDEBAKER_US6: TruckModel = {
  ...NARROW_TRUCK, length: 6.5, width: 2.24, frontAxle: 2.45, rearAxles: [-0.95, -2.07], wheelR: 0.47, tyreW: 0.2,
  trackF: 1.6, trackR: 1.66, dualRear: true, wheelStyle: 'disc', frameY: 0.95, frameHW: 0.44,
  bonnet: { zRad: 2.85, hwFront: 0.4, hwRear: 0.45, yTop: 1.55, r: 0.08, louvres: true },
  radiator: { w: 0.9, h: 0.78, y: 1.2, style: 'mesh', round: 0.04, chrome: false, bars: 10 },
  wings: { style: 'round', w: 0.36, reach: 0.95 }, runningBoardY: 0.78,
  cab: { zF: 1.68, zB: 0.62, hw: 1.0, y0: 1.05, belt: 1.58, win: 2.05, roof: 2.22, rake: 0.04, tumble: 0.02, r: 0.08,
    roofR: 0.1, split: true, doorFrom: 0.14, doorTo: 0.7, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 1.32, r: 0.1, dz: -0.08, bezel: 'body' }], bumper: { y: 0.76, h: 0.15, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.95, y: 1.1, r: 0.04, lens: 'red' }],
  body: { type: 'tilt', zF: 0.5, zB: -3.22, hw: 1.1, floorY: 1.3, sideH: 0.5, top: 2.8, wood: true },
  spare: 'side', fuelTank: 'side', mirrors: true,
};

/** ZIS-150 (1947-57): the post-war three-and-a-half-tonner, a rounded cab, round wings, a chrome barred grille. */
export const ZIS_150: TruckModel = {
  ...NARROW_TRUCK, length: 6.6, width: 2.38, frontAxle: 2.45, rearAxles: [-1.5], wheelR: 0.48, tyreW: 0.22,
  trackF: 1.7, trackR: 1.74, dualRear: true, wheelStyle: 'truck', frameY: 0.95, frameHW: 0.44,
  bonnet: { zRad: 2.9, hwFront: 0.44, hwRear: 0.5, yTop: 1.55, r: 0.14, louvres: true },
  radiator: { w: 0.86, h: 0.8, y: 1.2, style: 'vbars', round: 0.16, chrome: true, bars: 11 },
  wings: { style: 'round', w: 0.38, reach: 1.0 }, runningBoardY: 0.78,
  cab: { zF: 1.62, zB: 0.42, hw: 1.08, y0: 1.05, belt: 1.6, win: 2.1, roof: 2.3, rake: 0.12, tumble: 0.06, r: 0.16,
    roofR: 0.16, split: true, doorFrom: 0.12, doorTo: 0.7, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.68, y: 1.3, r: 0.1, dz: 0.0, bezel: 'chrome' }], bumper: { y: 0.74, h: 0.14, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 1.0, y: 1.1, r: 0.05, lens: 'red' }],
  body: { type: 'tilt', zF: 0.3, zB: -3.28, hw: 1.15, floorY: 1.32, sideH: 0.55, top: 2.85, wood: true },
  spare: 'side', fuelTank: 'side', mirrors: true,
};

/** GAZ-51 (1946-75): the two-and-a-half-tonner of every kolkhoz and grain station. */
export const GAZ_51: TruckModel = {
  ...ZIS_150, length: 5.72, width: 2.28, frontAxle: 2.15, rearAxles: [-1.15], wheelR: 0.44, tyreW: 0.2, trackF: 1.59, trackR: 1.65,
  bonnet: { zRad: 2.56, hwFront: 0.4, hwRear: 0.46, yTop: 1.46, r: 0.13, louvres: true },
  radiator: { w: 0.76, h: 0.72, y: 1.12, style: 'vbars', round: 0.14, chrome: true, bars: 10 },
  wings: { style: 'round', w: 0.34, reach: 1.0 }, runningBoardY: 0.72, frameY: 0.88,
  cab: { ...ZIS_150.cab, zF: 1.42, zB: 0.3, hw: 1.0, y0: 0.98, belt: 1.5, win: 1.98, roof: 2.13 },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 1.22, r: 0.1, dz: 0.0, bezel: 'chrome' }], bumper: { y: 0.7, h: 0.13, style: 'painted' } },
  body: { type: 'dropside', zF: 0.18, zB: -2.86, hw: 1.1, floorY: 1.2, sideH: 0.6, wood: true },
};

/** GAZ-51 with a box (the grain-station's and the post's). */
export const GAZ_51_BOX: TruckModel = {
  ...GAZ_51, body: { type: 'box', zF: 0.18, zB: -2.86, hw: 1.1, floorY: 1.2, sideH: 0.5, top: 2.75, wood: true },
};

/** Mercedes-Benz L 3500 (1949-61): the "Rundhauber", its round bonnet and wings, a canvas tilt. */
export const MERCEDES_L3500: TruckModel = {
  ...ZIS_150, length: 6.5, width: 2.3, frontAxle: 2.4, rearAxles: [-1.45], wheelR: 0.46, tyreW: 0.2, trackF: 1.68, trackR: 1.7,
  bonnet: { zRad: 2.85, hwFront: 0.42, hwRear: 0.5, yTop: 1.5, r: 0.2, louvres: false },
  radiator: { w: 0.7, h: 0.72, y: 1.15, style: 'vbars', round: 0.26, chrome: false, bars: 9 },
  wings: { style: 'round', w: 0.38, reach: 1.05 },
  cab: { ...ZIS_150.cab, r: 0.2, roofR: 0.2, tumble: 0.08, rake: 0.1 },
  frontFace: { lamps: [{ shape: 'round', x: 0.66, y: 1.24, r: 0.1, dz: 0.0, bezel: 'body' }], bumper: { y: 0.72, h: 0.14, style: 'painted' } },
  body: { type: 'tilt', zF: 0.3, zB: -3.2, hw: 1.13, floorY: 1.3, sideH: 0.55, top: 2.85, wood: true },
};

/** Magirus-Deutz S 3500 (1951-): the air-cooled Rundhauber with a load of coal, the coalfield's lorry. */
export const MAGIRUS_COAL: TruckModel = {
  ...MERCEDES_L3500,
  radiator: { w: 0.74, h: 0.8, y: 1.16, style: 'hbars', round: 0.3, chrome: false, bars: 12 },
  body: { type: 'flatbed', zF: 0.3, zB: -3.2, hw: 1.12, floorY: 1.3, sideH: 0.5, wood: false, load: 'coal' },
};

/** Volvo LV 8/9 (1930s): the Norwegian roads' lorry, flat wings, a tall radiator, a canvas tilt. */
export const VOLVO_LV: TruckModel = {
  ...ZIS_5V, length: 6.2, wheelR: 0.45,
  radiator: { w: 0.66, h: 0.86, y: 1.2, style: 'vbars', round: 0.08, chrome: true, bars: 13 },
  frontFace: { lamps: [{ shape: 'round', x: 0.56, y: 1.32, r: 0.11, dz: 0.06, bezel: 'chrome' }], bumper: { y: 0.68, h: 0.12, style: 'painted' } },
};

/** Ford V8 truck (1934-39) with a box. */
export const FORD_V8_TRUCK_BOX: TruckModel = {
  ...GAZ_AA, wings: { style: 'round', w: 0.3, reach: 1.0 },
  radiator: { w: 0.6, h: 0.72, y: 1.1, style: 'vbars', round: 0.16, chrome: true, bars: 13 },
  body: { type: 'box', zF: 0.12, zB: -2.62, hw: 1.0, floorY: 1.1, sideH: 0.5, top: 2.45, wood: true },
};

/** Chevrolet 1.5-ton (1937-40) with drop sides. */
export const CHEVROLET_DROPSIDE: TruckModel = {
  ...GAZ_AA, wings: { style: 'round', w: 0.31, reach: 1.0 },
  radiator: { w: 0.64, h: 0.74, y: 1.1, style: 'hbars', round: 0.14, chrome: true, bars: 12 },
  body: { type: 'dropside', zF: 0.12, zB: -2.62, hw: 1.0, floorY: 1.1, sideH: 0.55, wood: true },
};

/** Chevrolet G506 (1941-45): the Army's 1.5-ton, a grille guard, a canvas tilt. */
export const CHEVROLET_G506: TruckModel = {
  ...GMC_CCKW, length: 5.9, frontAxle: 2.25, rearAxles: [-1.25], dualRear: true,
  body: { type: 'tilt', zF: 0.6, zB: -2.95, hw: 1.08, floorY: 1.25, sideH: 0.5, top: 2.75, wood: false },
};

/** A logging truck of the 1940s piney woods: a Ford or a Chevrolet tractor with bunks and stakes and a load of logs. */
export const LOGGING_TRUCK_1940: TruckModel = {
  ...CHEVROLET_DROPSIDE, length: 6.1, frontAxle: 2.4, rearAxles: [-1.55],
  body: { type: 'logs', zF: 0.6, zB: -3.05, hw: 1.0, floorY: 1.1, sideH: 0.4, wood: true },
};

/** Isuzu (Ishikawajima) Type 94 (1934-): the Imperial Army's six-wheeled truck, its soft cab. */
export const ISUZU_TYPE94: TruckModel = {
  ...ZIS_5V, length: 5.4, frontAxle: 2.1, rearAxles: [-0.8, -1.8], wheelR: 0.42, tyreW: 0.17, dualRear: false,
  cab: { ...ZIS_5V.cab, soft: true, zF: 1.25, zB: 0.3 },
  radiator: { w: 0.62, h: 0.78, y: 1.14, style: 'vbars', round: 0.06, chrome: false, bars: 11 },
  body: { type: 'tilt', zF: 0.2, zB: -2.7, hw: 1.0, floorY: 1.2, sideH: 0.5, top: 2.6, wood: true },
};

/** Ford truck (1934) with a box. */
export const FORD_1934_BOX: TruckModel = { ...FORD_V8_TRUCK_BOX };

/** Dodge (1936) 1.5-ton with drop sides. */
export const DODGE_1936: TruckModel = {
  ...CHEVROLET_DROPSIDE, radiator: { w: 0.62, h: 0.76, y: 1.12, style: 'vbars', round: 0.2, chrome: true, bars: 15 },
};

/** Bedford QL (1941-45): the British three-tonner, a short bonnet under a flat-fronted cab. */
export const BEDFORD_QL: TruckModel = {
  ...GMC_CCKW, length: 6.0, frontAxle: 2.05, rearAxles: [-1.45], dualRear: false, wheelR: 0.48, tyreW: 0.24,
  bonnet: { zRad: 2.62, hwFront: 0.42, hwRear: 0.48, yTop: 1.5, r: 0.04, louvres: false },
  radiator: { w: 0.84, h: 0.62, y: 1.18, style: 'mesh', round: 0.02, chrome: false, bars: 10 },
  wings: { style: 'flat', w: 0.4, reach: 0.9 },
  cab: { ...GMC_CCKW.cab, zF: 2.2, zB: 1.15, soft: false, rake: 0, r: 0.03, roofR: 0.05 },
  body: { type: 'tilt', zF: 1.0, zB: -3.0, hw: 1.1, floorY: 1.35, sideH: 0.5, top: 2.95, wood: false },
};

/** Bedford MW (1939-45) with a box body. */
export const BEDFORD_MW_BOX: TruckModel = {
  ...WC_54, length: 4.5, cab: { ...WC_54.cab, intoBody: false, rearWindow: true, roof: 2.0 },
  radiator: { w: 0.7, h: 0.6, y: 1.05, style: 'mesh', round: 0.02, chrome: false, bars: 9 },
  body: { type: 'box', zF: 0.25, zB: -2.25, hw: 0.97, floorY: 1.0, sideH: 0.5, top: 2.3, wood: false },
};

/** Austin K2/Y ambulance (1939-45): "Katy", the box body over a short bonnet. */
export const AUSTIN_K2: TruckModel = {
  ...WC_54, length: 4.88,
  radiator: { w: 0.66, h: 0.66, y: 1.08, style: 'vbars', round: 0.06, chrome: false, bars: 10 },
  body: { type: 'box', zF: 0.32, zB: -2.44, hw: 1.0, floorY: 0.98, sideH: 0.5, top: 2.4, wood: false },
};

/** CMP C60L (1942-45): the Canadian Military Pattern three-tonner — forward control, its windscreen sloping forward. */
export const CMP_C60L: TruckModel = {
  kind: 'truck', length: 6.2, width: 2.3, frontAxle: 2.2, rearAxles: [-1.4], wheelR: 0.48, tyreW: 0.22,
  trackF: 1.7, trackR: 1.7, dualRear: true, wheelStyle: 'disc', frameY: 1.0, frameHW: 0.44, front: 'cabover',
  cab: { zF: 2.95, zB: 1.55, hw: 1.08, y0: 1.1, belt: 1.75, win: 2.25, roof: 2.45, rake: -0.28, tumble: 0, r: 0.03,
    roofR: 0.04, split: true, doorFrom: 0.15, doorTo: 0.75, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.72, y: 1.2, r: 0.09, bezel: 'body' }],
    grille: { y: 1.45, w: 1.3, h: 0.42, style: 'mesh', bars: 12, chrome: false, frame: 'body' }, bumper: { y: 0.82, h: 0.18, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.95, y: 1.15, r: 0.04, lens: 'red' }],
  body: { type: 'dropside', zF: 1.4, zB: -3.1, hw: 1.1, floorY: 1.38, sideH: 0.6, wood: false },
  spare: 'side', fuelTank: 'side', mirrors: true,
};

/** Berliet GLR (1950-77): France's lorry, a round nose with slatted grille, a canvas tilt. */
export const BERLIET_GLR: TruckModel = {
  ...MERCEDES_L3500,
  radiator: { w: 0.78, h: 0.78, y: 1.18, style: 'hbars', round: 0.12, chrome: true, bars: 9 },
  body: { type: 'tilt', zF: 0.3, zB: -3.2, hw: 1.13, floorY: 1.3, sideH: 0.55, top: 2.85, wood: false },
};

// ---------------------------------------------------------------------------------------------------- the 1950s-60s cars

/** GAZ-M20 Pobeda (1946-58): the fastback "Victory", the first Soviet car with its wings in the body. */
export const POBEDA: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.66, width: 1.7, frontAxle: 1.6, rearAxle: -1.1, wheelR: 0.36, tyreW: 0.17, track: 1.36, archR: 0.42,
    sill: 0.3, noseBottom: 0.36, tailBottom: 0.36, belt: 0.92, noseH: 0.88, tailH: 0.6, cowlZ: 0.42, glassRearZ: -2.0,
    roofFrontZ: 0.05, roofRearZ: -0.9, roofH: 1.64, roofTaper: 0.84, bonnetCrown: 0.06, roofCrown: 0.07, shoulderR: 0.14,
    noseRound: 0.3, tailRound: 0.36, tuckLow: 0.06, tuckHigh: 0.06, doorCuts: [0.38, -0.36, -1.0], pillars: [-0.38], rear: 'hatch',
    windowFrame: CHROME,
  },
  wheel: { rim: 0.58, style: 'hubcap' },
  front: { lamps: [{ shape: 'round', x: 0.64, y: 0.76, r: 0.09, bezel: 'chrome' }],
    grille: { y: 0.62, w: 0.9, h: 0.26, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.1, style: 'chrome' }, plate: { y: 0.42, w: 0.5, h: 0.12 } },
  rear: { lamps: [{ shape: 'round', x: 0.62, y: 0.6, r: 0.05, lens: 'red', bezel: 'chrome' }],
    bumper: { y: 0.44, h: 0.1, style: 'chrome' }, plate: { y: 0.56, w: 0.3, h: 0.17 } },
  details: { handles: CHROME, mirrors: 'wing', mirrorMat: CHROME, wipers: true, seams: true, sideTrim: { y: 0.62, mat: CHROME } },
};

/** Moskvitch 423 (1957-63): the estate on the 402. */
export const MOSKVITCH_423: CarModel = {
  kind: 'car',
  body: {
    ...CAR_BASE, length: 4.06, width: 1.54, frontAxle: 1.32, rearAxle: -1.05, wheelR: 0.33, tyreW: 0.15, track: 1.22, archR: 0.39,
    sill: 0.3, noseBottom: 0.36, tailBottom: 0.38, belt: 0.92, noseH: 0.86, tailH: 0.92, cowlZ: 0.45, glassRearZ: -2.03,
    roofFrontZ: 0.0, roofRearZ: -1.92, roofH: 1.6, roofTaper: 0.86, bonnetCrown: 0.05, roofCrown: 0.05, shoulderR: 0.1,
    noseRound: 0.2, tailRound: 0.1, doorCuts: [0.42, -0.32, -0.95], pillars: [-0.34, -1.1], rear: 'estate', windowFrame: CHROME,
    backlight: { w: 0.8, h: 0.55 },
  },
  wheel: { rim: 0.58, style: 'hubcap' },
  front: { lamps: [{ shape: 'round', x: 0.58, y: 0.74, r: 0.085, bezel: 'chrome' }],
    grille: { y: 0.64, w: 0.6, h: 0.24, style: 'mesh', bars: 10, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.09, style: 'chrome' }, plate: { y: 0.42, w: 0.5, h: 0.12 } },
  rear: { lamps: [{ shape: 'round', x: 0.62, y: 0.72, r: 0.045, lens: 'red', bezel: 'chrome' }],
    bumper: { y: 0.46, h: 0.09, style: 'chrome' }, plate: { y: 0.62, w: 0.3, h: 0.17 } },
  details: { handles: CHROME, mirrors: 'door', mirrorMat: CHROME, wipers: true, seams: true },
};

/** UAZ-450 (1958-65): the first "bukhanka", as the UAZ-452 with a lighter face. */
export const UAZ_450: CarModel = { ...UAZ_452, front: { ...UAZ_452.front, grille: { y: 0.98, w: 0.4, h: 0.2, style: 'vbars', bars: 5, chrome: false, frame: 'body' } } };

/** Volkswagen Type 1 "Beetle" (1938-2003): the round car, rear-engined, its lamps in the wings. */
export const VW_BEETLE: PeriodCarModel = {
  ...PERIOD_BASE,
  body: { ...PERIOD_BASE.body, length: 4.05, width: 1.38, noseWidth: 1.22, frontAxle: 1.28, rearAxle: -1.12, wheelR: 0.31, tyreW: 0.15,
    track: 1.31, sill: 0.4, noseBottom: 0.38, tailBottom: 0.44, belt: 0.9, noseH: 0.72, tailH: 0.6, cowlZ: 0.55, roofFrontZ: 0.22,
    roofRearZ: -0.5, glassRearZ: -1.46, tailSlope: true, roofH: 1.5, roofTaper: 0.82, bonnetCrown: 0.1, roofCrown: 0.1, shoulderR: 0.18,
    noseRound: 0.42, tailRound: 0.5, doorCuts: [0.48, -0.42], pillars: [-0.44], pillarW: 0.045, rear: 'hatch', windowFrame: CHROME,
    glassH: 0.36, roofEdgeR: 0.2, sideGlassTo: -1.0, backlight: { w: 0.66, h: 0.4, top: 0.14, split: true } },
  wings: { w: 0.24, front: [[1.05, 0.3], [0.95, 0.75], [0.5, 1.0], [0, 1.04], [-0.65, 0.88]], rear: [[1.0, 0.25], [0.65, 0.85], [0, 1.04], [-0.7, 0.85], [-1.1, 0.35]] },
  runningBoardY: 0.36,
  grille: null,
  lamps: { x: 0.56, y: 0.76, dz: 0.42, r: 0.085, mount: 'wing' },
  bumpers: 'chrome', spare: 'none',
  rearLamps: [{ shape: 'round', x: 0.58, y: 0.7, r: 0.045, lens: 'red', dz: 0.25 }],
};

/** Citroen 2CV (1948-90): four wheels under an umbrella — a corrugated bonnet, lamps on the wings, the canvas roof. */
export const CITROEN_2CV: PeriodCarModel = {
  ...VW_BEETLE,
  body: { ...VW_BEETLE.body, length: 3.83, width: 1.42, noseWidth: 0.86, frontAxle: 1.15, rearAxle: -1.24, wheelR: 0.3, tyreW: 0.125,
    track: 1.26, sill: 0.42, belt: 0.92, noseH: 0.8, tailH: 0.72, cowlZ: 0.5, bonnetCrown: 0.08, roofFrontZ: 0.2, roofRearZ: -0.72, glassRearZ: -1.62,
    tailSlope: true,
    roofH: 1.6, roofTaper: 0.86, shoulderR: 0.1, noseRound: 0.18, tailRound: 0.45, roofMat: fixedPaint(0x2b2b2a, 0.95),
    glassH: 0.4, roofEdgeR: 0.12, pillars: [-0.4], sideGlassTo: -0.98, backlight: { w: 0.5, h: 0.42, top: 0.16 } },
  grille: { w: 0.46, h: 0.3, y: 0.7, v: 0.01, bars: 4, chrome: true },
  lamps: { x: 0.5, y: 0.9, dz: 0.25, r: 0.08 },
  bumpers: 'painted',
};

/** Opel Rekord P2 Caravan (1960-63): the estate of the Wirtschaftswunder. */
export const OPEL_REKORD_CARAVAN: CarModel = {
  ...FORD_FALCON_WAGON,
  body: { ...FORD_FALCON_WAGON.body, length: 4.5, width: 1.65, track: 1.32, belt: 0.88, roofH: 1.45, noseH: 0.8, tailRound: 0.1 },
  front: { ...FORD_FALCON.front, lamps: [{ shape: 'round', x: 0.66, y: 0.66, r: 0.085, bezel: 'chrome' }],
    grille: { y: 0.6, w: 1.1, h: 0.18, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' } },
  roofRack: false,
};

// ---------------------------------------------------------------------------------------------------- 1960s-90s Europe

/** Volkswagen Type 2 T1 "Bulli" (1950-67): the split windscreen over a V-shaped nose, two-tone. */
export const VW_T1: CarModel = {
  ...VW_T3,
  body: { ...VW_T3.body, length: 4.28, width: 1.75, frontAxle: 1.42, rearAxle: -0.98, wheelR: 0.33, tyreW: 0.16, track: 1.37, archR: 0.38,
    belt: 1.08, noseH: 1.04, cowlZ: 1.98, roofFrontZ: 1.72, roofRearZ: -2.04, glassRearZ: -2.14, roofH: 1.94, shoulderR: 0.16,
    noseRound: 0.42, tailRound: 0.3, roofCrown: 0.04, pillars: [1.36, 0.42, -0.6], doorCuts: [1.42, 0.6, -0.3],
    roofMat: fixedPaint(0xe8e4d8, 0.45), upperMat: fixedPaint(0xe8e4d8, 0.45), backlight: { w: 0.62, h: 0.36, top: 0.08 },
    glassH: 0.46, roofEdgeR: 0.14, splitScreen: true },
  front: { lamps: [{ shape: 'round', x: 0.62, y: 0.9, r: 0.085, bezel: 'chrome' }, { shape: 'round', x: 0.55, y: 0.66, r: 0.03, lens: 'amber', bezel: 'chrome' }],
    bumper: { y: 0.44, h: 0.09, style: 'painted' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'round', x: 0.78, y: 0.72, r: 0.045, lens: 'red', bezel: 'chrome' }],
    bumper: { y: 0.45, h: 0.09, style: 'painted' }, plate: { y: 0.62, w: 0.52, h: 0.11 } },
  details: { handles: CHROME, mirrors: 'door', wipers: true, seams: true },
};

const CABOVER_LIGHT: TruckModel = {
  kind: 'truck', length: 5.4, width: 1.9, frontAxle: 1.95, rearAxles: [-1.05], wheelR: 0.38, tyreW: 0.2,
  trackF: 1.5, trackR: 1.45, dualRear: true, wheelStyle: 'truck', frameY: 0.82, frameHW: 0.4, front: 'cabover',
  cab: { zF: 2.65, zB: 1.15, hw: 0.95, y0: 0.95, belt: 1.55, win: 2.05, roof: 2.22, rake: 0.08, tumble: 0.03, r: 0.12,
    roofR: 0.12, split: false, doorFrom: 0.2, doorTo: 0.82, rearWindow: true },
  frontFace: { lamps: [{ shape: 'rect', x: 0.7, y: 0.86, w: 0.22, h: 0.12, bezel: 'black' }, { shape: 'rect', x: 0.86, y: 1.0, w: 0.06, h: 0.08, lens: 'amber' }],
    grille: { y: 1.2, w: 1.1, h: 0.2, style: 'hbars', bars: 3, chrome: false, frame: 'body' }, bumper: { y: 0.66, h: 0.18, style: 'painted' } },
  rearLamps: [{ shape: 'rect', x: 0.82, y: 0.95, w: 0.16, h: 0.08, lens: 'red' }],
  body: { type: 'dropside', zF: 1.05, zB: -2.7, hw: 0.95, floorY: 1.05, sideH: 0.42, wood: false },
  spare: 'under', fuelTank: 'side', mirrors: true,
};

/** Volkswagen T1 Pritsche (1952-67): the pickup Bulli, its flat bed and drop sides. */
export const VW_T1_PICKUP: TruckModel = {
  ...CABOVER_LIGHT, length: 4.3, width: 1.75, frontAxle: 1.45, rearAxles: [-0.95], wheelR: 0.33, tyreW: 0.16, trackF: 1.37, trackR: 1.36,
  dualRear: false, wheelStyle: 'disc', frameY: 0.6,
  cab: { zF: 2.12, zB: 0.95, hw: 0.86, y0: 0.62, belt: 1.15, win: 1.68, roof: 1.92, rake: 0.18, tumble: 0.05, r: 0.36,
    roofR: 0.15, split: true, doorFrom: 0.25, doorTo: 0.8, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 0.9, r: 0.085, bezel: 'chrome' }], bumper: { y: 0.44, h: 0.09, style: 'painted' } },
  body: { type: 'dropside', zF: 0.9, zB: -2.12, hw: 0.84, floorY: 0.92, sideH: 0.38, wood: false },
};

/** Mercedes-Benz L 319 (1955-68) with a box body: the bakery's, the post's, the Bundesbahn's van. */
export const MERCEDES_L319_BOX: TruckModel = {
  ...CABOVER_LIGHT, length: 5.1, width: 1.95, dualRear: false, wheelR: 0.36,
  cab: { ...CABOVER_LIGHT.cab, zF: 2.5, zB: 1.25, r: 0.3, roofR: 0.18, rake: 0.15, belt: 1.35, win: 1.88, roof: 2.12, y0: 0.82 },
  frontFace: { lamps: [{ shape: 'round', x: 0.72, y: 0.92, r: 0.08, bezel: 'chrome' }],
    grille: { y: 1.02, w: 0.62, h: 0.32, style: 'vbars', bars: 8, chrome: true, frame: 'chrome' }, bumper: { y: 0.55, h: 0.12, style: 'painted' } },
  body: { type: 'box', zF: 1.15, zB: -2.5, hw: 0.97, floorY: 0.92, sideH: 0.5, top: 2.4, wood: false },
};

/** Volkswagen Golf Mk1 (1974-83): the square hatchback, round lamps in a black grille. */
export const VW_GOLF1: CarModel = {
  ...ZASTAVA_101,
  body: { ...ZASTAVA_101.body, length: 3.72, width: 1.61, frontAxle: 1.16, rearAxle: -1.24, track: 1.39, belt: 0.86, noseH: 0.74,
    roofH: 1.39, cowlZ: 0.36, roofFrontZ: -0.16, roofRearZ: -1.26, glassRearZ: -1.84, shoulderR: 0.04, noseRound: 0.05, tailRound: 0.05,
    doorCuts: [0.32, -0.42, -1.02], pillars: [-0.44], pillarW: 0.06 },
  front: { lamps: [{ shape: 'round', x: 0.6, y: 0.66, r: 0.085, bezel: 'black' }],
    grille: { y: 0.66, w: 0.9, h: 0.16, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    bumper: { y: 0.42, h: 0.08, style: 'chrome' }, plate: { y: 0.4, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.6, y: 0.72, w: 0.2, h: 0.14, lens: 'red' }],
    bumper: { y: 0.44, h: 0.08, style: 'chrome' }, plate: { y: 0.58, w: 0.52, h: 0.11 } },
};

/** Mercedes-Benz W123 (1976-86): the saloon of Beirut's taxis and Cairo's, its tall grille and wide lamps. */
export const MERCEDES_W123: CarModel = {
  ...VAZ_2107,
  body: { ...VAZ_2107.body, length: 4.72, width: 1.79, frontAxle: 1.52, rearAxle: -1.3, wheelR: 0.33, tyreW: 0.18, track: 1.49, archR: 0.4,
    sill: 0.26, belt: 0.88, noseH: 0.78, tailH: 0.84, cowlZ: 0.48, roofFrontZ: -0.1, roofRearZ: -1.05, glassRearZ: -1.5, roofH: 1.44,
    shoulderR: 0.06, noseRound: 0.08, tailRound: 0.08, doorCuts: [0.42, -0.42, -1.12], pillars: [-0.44] },
  front: { lamps: [{ shape: 'rect', x: 0.6, y: 0.62, w: 0.36, h: 0.17, bezel: 'chrome' }],
    grille: { y: 0.64, w: 0.42, h: 0.28, style: 'hbars', bars: 6, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.1, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.62, y: 0.68, w: 0.34, h: 0.16, lens: 'red', bezel: 'black' }],
    bumper: { y: 0.46, h: 0.1, style: 'chrome' }, plate: { y: 0.62, w: 0.52, h: 0.11 } },
};

/** Mercedes-Benz S123 (1978-86): the W123 estate. */
export const MERCEDES_W123T: CarModel = {
  ...MERCEDES_W123,
  body: { ...MERCEDES_W123.body, glassRearZ: -2.36, roofRearZ: -2.24, rear: 'estate', pillars: [-0.44, -1.36], doorCuts: [0.42, -0.42, -1.12],
    backlight: { w: 0.85, h: 0.6 }, windowFrame: TRIM },
  rear: { ...MERCEDES_W123.rear, lamps: [{ shape: 'rect', x: 0.7, y: 0.7, w: 0.16, h: 0.24, lens: 'red' }] },
  roofRack: true,
};

/** Volkswagen Caddy Mk1 (1979-92): the Golf with a bed. */
export const VW_CADDY: PickupModel = {
  ...HILUX_N50,
  cab: { ...HILUX_N50.cab, length: 2.2, width: 1.64, frontAxle: 0.36, wheelR: 0.29, tyreW: 0.165, track: 1.39, archR: 0.36,
    sill: 0.28, noseBottom: 0.32, tailBottom: 0.36, belt: 0.88, noseH: 0.76, tailH: 0.88, cowlZ: -0.36, glassRearZ: -1.1,
    roofFrontZ: -0.66, roofRearZ: -1.02, roofH: 1.48, sideGlassTo: -0.96 },
  cabZ: 1.12, rearAxle: -1.18, trackR: 1.39,
  bed: { zF: 0.0, zB: -2.15, hw: 0.8, floor: 0.66, top: 0.96, archR: 0.36 },
  front: VW_GOLF1.front,
  rearLamps: [{ shape: 'rect', x: 0.66, y: 0.78, w: 0.1, h: 0.14, lens: 'red' }],
  rearBumper: 'black',
};

/** Volkswagen Iltis (1978-88): the Bundeswehr's field car of the Fulda Gap, a canvas top. */
export const VW_ILTIS: JeepModel = {
  ...DKW_MUNGA, length: 3.9, frontAxle: 1.2, rearAxle: -1.02, wheelR: 0.36, tyreW: 0.17, track: 1.23,
  tub: { hw: 0.76, floor: 0.6, top: 1.12, zF: 0.36, rearRound: 0.06 },
  bonnet: { hw: 0.74, top: 1.08, slope: 0.08 },
  grille: { style: 'slots', w: 0.9, h: 0.16, y: 0.92, count: 6 },
  lamps: { x: 0.56, y: 0.92, r: 0.085, inGrille: true },
  top: 'canvas', spare: 'bonnet',
};

/** Mercedes-Benz LP 813 (1965-84): the forward-control lorry, its cab and canvas tilt. */
export const MERCEDES_LP813: TruckModel = {
  ...TAM_110, wheelR: 0.46,
  cab: { ...TAM_BASE.cab, r: 0.08, roofR: 0.1, rake: 0.05 },
  frontFace: { lamps: [{ shape: 'round', x: 0.86, y: 1.0, r: 0.09, bezel: 'chrome' }, { shape: 'rect', x: 1.0, y: 1.25, w: 0.08, h: 0.08, lens: 'amber' }],
    grille: { y: 1.5, w: 1.3, h: 0.3, style: 'hbars', bars: 6, chrome: false, frame: 'black' }, bumper: { y: 0.78, h: 0.2, style: 'painted' } },
  dualRear: true,
};

export const MERCEDES_LP813_BOX: TruckModel = { ...MERCEDES_LP813, body: { type: 'box', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.25, sideH: 0.5, top: 3.0, wood: false } };

/** Unimog 406 (1963-89): the farmer's and the forester's universal machine, a short bonnet, big tyres, a small bed. */
export const UNIMOG_406: TruckModel = {
  kind: 'truck', length: 4.3, width: 2.0, frontAxle: 1.38, rearAxles: [-1.0], wheelR: 0.55, tyreW: 0.32,
  trackF: 1.63, trackR: 1.63, dualRear: false, wheelStyle: 'truck', frameY: 0.95, frameHW: 0.4, front: 'narrow',
  bonnet: { zRad: 2.0, hwFront: 0.52, hwRear: 0.55, yTop: 1.5, r: 0.08, louvres: false },
  radiator: { w: 1.04, h: 0.36, y: 1.32, style: 'hbars', round: 0.04, chrome: false, bars: 4 },
  wings: { style: 'round', w: 0.4, reach: 0.9 }, runningBoardY: 0.95,
  cab: { zF: 1.1, zB: 0.1, hw: 0.98, y0: 1.05, belt: 1.6, win: 2.08, roof: 2.3, rake: 0.05, tumble: 0.03, r: 0.12,
    roofR: 0.12, split: false, doorFrom: 0.15, doorTo: 0.75, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.62, y: 1.28, r: 0.08, dz: -0.1, bezel: 'body' }], bumper: { y: 0.82, h: 0.15, style: 'painted' } },
  rearLamps: [{ shape: 'round', x: 0.85, y: 1.15, r: 0.04, lens: 'red' }],
  body: { type: 'dropside', zF: 0.0, zB: -2.12, hw: 0.98, floorY: 1.25, sideH: 0.4, wood: false },
  spare: 'none', fuelTank: 'none', mirrors: true,
};

/** Renault 4 (1961-94): the tall hatchback of every French village. */
export const RENAULT_4: CarModel = {
  ...YUGO_45,
  body: { ...YUGO_45.body, length: 3.67, width: 1.49, frontAxle: 1.15, rearAxle: -1.3, wheelR: 0.3, tyreW: 0.135, track: 1.25, archR: 0.36,
    sill: 0.3, belt: 0.92, noseH: 0.8, tailH: 0.95, roofH: 1.55, cowlZ: 0.48, roofFrontZ: 0.0, roofRearZ: -1.7, glassRearZ: -1.83,
    shoulderR: 0.05, noseRound: 0.08, tailRound: 0.06, doorCuts: [0.44, -0.36, -1.08], pillars: [-0.38, -1.2], rear: 'estate',
    backlight: { w: 0.8, h: 0.5 } },
  front: { lamps: [{ shape: 'round', x: 0.52, y: 0.68, r: 0.075, bezel: 'chrome' }],
    grille: { y: 0.66, w: 0.78, h: 0.14, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    bumper: { y: 0.44, h: 0.06, style: 'tube' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.6, y: 0.72, w: 0.08, h: 0.12, lens: 'red' }],
    bumper: { y: 0.45, h: 0.06, style: 'tube' }, plate: { y: 0.6, w: 0.52, h: 0.11 } },
};

/** Citroen H van (1947-81): corrugated sides, the face of every French market. */
export const CITROEN_H: CarModel = {
  ...ECONOLINE,
  body: { ...ECONOLINE.body, length: 4.26, width: 1.99, frontAxle: 1.45, rearAxle: -1.08, wheelR: 0.33, tyreW: 0.17, track: 1.62, archR: 0.4,
    belt: 1.12, noseH: 1.0, tailH: 1.12, cowlZ: 1.86, roofFrontZ: 1.66, roofRearZ: -2.05, glassRearZ: -2.13, roofH: 2.08,
    noseRound: 0.3, tailRound: 0.06, shoulderR: 0.08, doorCuts: [1.22, 0.4], pillars: [1.16], sideGlassFrom: 1.82, sideGlassTo: 1.22 },
  front: { lamps: [{ shape: 'round', x: 0.72, y: 0.92, r: 0.08, bezel: 'chrome' }],
    grille: { y: 0.82, w: 0.9, h: 0.24, style: 'vbars', bars: 9, chrome: false, frame: 'body' },
    bumper: { y: 0.42, h: 0.08, style: 'painted' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true, sideTrim: { y: 1.4, mat: TRIM } },
};

/** Peugeot 404 (1960-75): the saloon of North Africa's roads and taxi stands. */
export const PEUGEOT_404: CarModel = {
  ...VAZ_2107,
  body: { ...VAZ_2107.body, length: 4.44, width: 1.68, frontAxle: 1.38, rearAxle: -1.27, wheelR: 0.31, tyreW: 0.165, track: 1.35, archR: 0.38,
    belt: 0.9, noseH: 0.8, tailH: 0.86, roofH: 1.45, cowlZ: 0.46, roofFrontZ: -0.1, roofRearZ: -1.02, glassRearZ: -1.46, shoulderR: 0.06,
    noseRound: 0.1, tailRound: 0.1 },
  front: { lamps: [{ shape: 'round', x: 0.62, y: 0.68, r: 0.09, bezel: 'chrome' }],
    grille: { y: 0.64, w: 1.0, h: 0.22, style: 'mesh', bars: 14, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.09, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
};

/** Peugeot 404 pickup (1967-88): the "bâchée", built in Africa until the 1980s. */
export const PEUGEOT_404_PICKUP: PickupModel = {
  ...HILUX_N50,
  cab: { ...HILUX_N50.cab, length: 2.5, width: 1.68, frontAxle: 0.47, wheelR: 0.33, tyreW: 0.17, track: 1.35, archR: 0.4, sill: 0.34,
    belt: 0.95, noseH: 0.82, tailH: 0.95, roofH: 1.55, cowlZ: -0.38, glassRearZ: -1.25, roofFrontZ: -0.68, roofRearZ: -1.16, sideGlassTo: -1.06 },
  cabZ: 1.15, rearAxle: -1.55, trackR: 1.35,
  bed: { zF: -0.12, zB: -2.42, hw: 0.82, floor: 0.72, top: 1.06, archR: 0.4 },
  front: PEUGEOT_404.front,
  rearBumper: 'tube',
};

/** Citroen Mehari (1968-87): the plastic open car of the beaches and the farms. */
export const MEHARI: JeepModel = {
  ...DKW_MUNGA, length: 3.52, frontAxle: 1.1, rearAxle: -1.27, wheelR: 0.3, tyreW: 0.135, track: 1.26,
  tub: { hw: 0.76, floor: 0.5, top: 0.98, zF: 0.3, rearRound: 0.04 },
  bonnet: { hw: 0.74, top: 0.95, slope: 0.12 },
  grille: { style: 'slots', w: 0.9, h: 0.16, y: 0.8, count: 9 },
  lamps: { x: 0.58, y: 0.8, r: 0.07, inGrille: true }, top: 'none', spare: 'bonnet',
};

/** Saviem SG2 (1965-82) with a box: the forward-control van-lorry of French towns. */
export const SAVIEM_BOX: TruckModel = {
  ...CABOVER_LIGHT, cab: { ...CABOVER_LIGHT.cab, r: 0.14, roofR: 0.12 },
  frontFace: { lamps: [{ shape: 'round', x: 0.72, y: 0.86, r: 0.08, bezel: 'chrome' }],
    grille: { y: 1.12, w: 1.1, h: 0.24, style: 'hbars', bars: 5, chrome: false, frame: 'body' }, bumper: { y: 0.62, h: 0.14, style: 'painted' } },
  body: { type: 'box', zF: 1.05, zB: -2.7, hw: 0.97, floorY: 1.0, sideH: 0.5, top: 2.75, wood: false },
};

/** Saviem JL (1957-) with drop sides. */
export const SAVIEM_FLATBED: TruckModel = { ...BERLIET_GLR, body: { type: 'dropside', zF: 0.3, zB: -3.2, hw: 1.13, floorY: 1.3, sideH: 0.5, wood: true } };

// ---------------------------------------------------------------------------------------------------- North Africa, the Levant, the Gulf

/** Peugeot 504 (1968-) and its break: the Sahel's and the Maghreb's long-distance taxis. */
export const PEUGEOT_504: CarModel = {
  ...PEUGEOT_404,
  body: { ...PEUGEOT_404.body, length: 4.49, width: 1.69, belt: 0.88, roofH: 1.46, shoulderR: 0.05, noseRound: 0.08, tailRound: 0.12 },
  front: { lamps: [{ shape: 'rect', x: 0.62, y: 0.66, w: 0.3, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.64, w: 0.6, h: 0.16, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.09, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
};

export const PEUGEOT_504_BREAK: CarModel = {
  ...PEUGEOT_504,
  body: { ...PEUGEOT_504.body, glassRearZ: -2.4, roofRearZ: -2.26, rear: 'estate', roofH: 1.52, pillars: [-0.44, -1.4], doorCuts: [0.42, -0.42, -1.12],
    backlight: { w: 0.85, h: 0.6 }, windowFrame: TRIM },
  rear: { ...PEUGEOT_404.rear, lamps: [{ shape: 'rect', x: 0.66, y: 0.72, w: 0.14, h: 0.22, lens: 'red' }] },
  roofRack: true,
};

/** Toyota HiAce H50 (1982-89): the minibus of every route from Tunis to Dhaka. */
export const HIACE_H50: CarModel = {
  ...VW_T3,
  body: { ...VW_T3.body, length: 4.3, width: 1.69, frontAxle: 1.62, rearAxle: -0.73, wheelR: 0.3, tyreW: 0.185, track: 1.43, archR: 0.37,
    belt: 1.08, noseH: 1.0, cowlZ: 2.0, roofFrontZ: 1.72, roofRearZ: -2.08, glassRearZ: -2.15, roofH: 1.96, shoulderR: 0.08,
    noseRound: 0.14, tailRound: 0.06, pillars: [1.36, 0.25, -0.9], doorCuts: [1.42, 0.55] },
  front: { lamps: [{ shape: 'rect', x: 0.6, y: 0.82, w: 0.22, h: 0.14, bezel: 'black' }],
    grille: { y: 0.82, w: 0.7, h: 0.14, style: 'hbars', bars: 3, chrome: true, frame: 'chrome' },
    bumper: { y: 0.42, h: 0.12, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
};

/** Land Rover Series III (1971-85): the station wagon of the Levant and the deserts. */
export const LAND_ROVER_S3: CarModel = {
  ...LADA_NIVA,
  body: { ...LADA_NIVA.body, length: 3.62, width: 1.68, frontAxle: 1.1, rearAxle: -1.13, wheelR: 0.39, tyreW: 0.19, track: 1.31, archR: 0.47,
    sill: 0.46, belt: 1.2, noseH: 1.08, tailH: 1.2, roofH: 1.97, cowlZ: 0.42, roofFrontZ: 0.3, roofRearZ: -1.74, glassRearZ: -1.81,
    shoulderR: 0.03, noseRound: 0.02, tailRound: 0.03, tuckLow: 0.0, tuckHigh: 0.02, roofTaper: 0.96, roofMat: fixedPaint(0xdedad0, 0.5),
    doorCuts: [0.4, -0.34], pillars: [-0.36, -1.1], backlight: { w: 0.5, h: 0.5 } },
  front: { lamps: [{ shape: 'round', x: 0.58, y: 0.84, r: 0.085, bezel: 'body' }],
    grille: { y: 0.82, w: 0.82, h: 0.32, style: 'mesh', bars: 10, chrome: false, frame: 'black' },
    bumper: { y: 0.52, h: 0.12, style: 'black' }, plate: { y: 0.52, w: 0.4, h: 0.11 } },
  spareOnTail: true,
};

/** Toyota Land Cruiser 70 (1984-): the desert's work car. */
export const LAND_CRUISER_70: CarModel = {
  ...LAND_ROVER_S3,
  body: { ...LAND_ROVER_S3.body, length: 4.0, width: 1.69, frontAxle: 1.25, rearAxle: -1.06, track: 1.42, belt: 1.15, roofH: 1.94,
    cowlZ: 0.55, roofFrontZ: 0.3, roofRearZ: -1.92, glassRearZ: -2.0, shoulderR: 0.05, noseRound: 0.04, roofMat: undefined },
  front: { lamps: [{ shape: 'round', x: 0.6, y: 0.88, r: 0.085, bezel: 'chrome' }],
    grille: { y: 0.86, w: 0.9, h: 0.24, style: 'hbars', bars: 4, chrome: false, frame: 'body' },
    bumper: { y: 0.55, h: 0.14, style: 'black' }, plate: { y: 0.54, w: 0.4, h: 0.11 } },
  spareOnTail: true,
};

/** Toyota Land Cruiser 80 (1990-97): the long estate of the Gulf and the Jordanian desert police. */
export const LAND_CRUISER_80: CarModel = {
  ...LAND_CRUISER_70,
  body: { ...LAND_CRUISER_70.body, length: 4.82, width: 1.93, frontAxle: 1.48, rearAxle: -1.37, track: 1.6, roofH: 1.86, belt: 1.12,
    cowlZ: 0.62, roofFrontZ: 0.15, roofRearZ: -2.3, glassRearZ: -2.4, shoulderR: 0.1, noseRound: 0.18, tailRound: 0.1,
    doorCuts: [0.55, -0.32, -1.25], pillars: [-0.36, -1.32] },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.86, w: 0.3, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.86, w: 0.7, h: 0.2, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.55, h: 0.16, style: 'painted' }, plate: { y: 0.56, w: 0.4, h: 0.11 } },
  spareOnTail: false,
};

/** Toyota Hilux N70 (2004-15), single cab: Wadi Rum's and Siwa's camp runabout. */
export const HILUX_N70: PickupModel = {
  ...HILUX_DC,
  cab: { ...HILUX_DC.cab, length: 2.75, frontAxle: 0.85, cowlZ: -0.2, roofFrontZ: -0.66, roofRearZ: -1.32, glassRearZ: -1.375,
    doorCuts: [-0.24, -1.3], pillars: [], sideGlassTo: -1.18 },
  cabZ: 1.28, rearAxle: -1.72,
  bed: { zF: -0.14, zB: -2.65, hw: 0.92, floor: 0.88, top: 1.2, archR: 0.48 },
};

/** Ford Transit Mk2 (1978-86). */
export const FORD_TRANSIT_MK2: CarModel = {
  ...VW_T3,
  body: { ...VW_T3.body, length: 4.62, width: 1.95, frontAxle: 1.88, rearAxle: -0.9, wheelR: 0.33, tyreW: 0.185, track: 1.68, archR: 0.4,
    belt: 1.1, noseH: 0.98, cowlZ: 1.5, roofFrontZ: 1.1, roofRearZ: -2.22, glassRearZ: -2.31, roofH: 2.06, shoulderR: 0.08,
    noseRound: 0.12, tailRound: 0.05, pillars: [0.86], doorCuts: [0.95, 0.15], sideGlassTo: 0.82, backlight: { w: 0.6, h: 0.4 } },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.8, w: 0.24, h: 0.16, bezel: 'black' }],
    grille: { y: 0.8, w: 0.86, h: 0.18, style: 'hbars', bars: 4, chrome: false, frame: 'black' },
    bumper: { y: 0.44, h: 0.12, style: 'black' }, plate: { y: 0.44, w: 0.52, h: 0.11 } },
};

const KURZHAUBER: TruckModel = {
  ...GAZ_3307_BOX, length: 6.4, width: 2.3, frontAxle: 2.05, wide: { zNose: 2.95, noseH: 1.3, topH: 1.36, noseBottom: 0.62, archR: 0.52, shoulderR: 0.16, noseRound: 0.2 },
  cab: { zF: 1.62, zB: 0.3, hw: 1.08, y0: 1.0, belt: 1.5, win: 2.05, roof: 2.3, rake: 0.08, tumble: 0.05, r: 0.12, roofR: 0.14,
    split: false, doorFrom: 0.12, doorTo: 0.7, rearWindow: true },
  frontFace: { lamps: [{ shape: 'round', x: 0.86, y: 1.1, r: 0.09, bezel: 'chrome' }],
    grille: { y: 1.02, w: 0.82, h: 0.48, style: 'hbars', bars: 9, chrome: false, frame: 'body' }, bumper: { y: 0.72, h: 0.16, style: 'painted' } },
};

/** Mercedes-Benz L 911 (1959-) "Kurzhauber": the short-bonneted lorry of North Africa and the Levant. */
export const MERCEDES_L911: TruckModel = { ...KURZHAUBER, body: { type: 'tilt', zF: 0.18, zB: -3.18, hw: 1.13, floorY: 1.25, sideH: 0.55, top: 2.85, wood: true } };
export const MERCEDES_L911_BOX: TruckModel = { ...KURZHAUBER, body: { type: 'box', zF: 0.18, zB: -3.18, hw: 1.14, floorY: 1.25, sideH: 0.5, top: 2.95, wood: false } };
export const MERCEDES_L911_FLATBED: TruckModel = { ...KURZHAUBER, body: { type: 'dropside', zF: 0.18, zB: -3.18, hw: 1.13, floorY: 1.25, sideH: 0.55, wood: true } };
/** A water tanker on the Kurzhauber: the Bedouin camps' supply. */
export const WATER_TANKER: TruckModel = { ...KURZHAUBER, body: { type: 'tanker', zF: 0.12, zB: -3.18, hw: 1.08, floorY: 1.22, sideH: 0.5, top: 2.5, wood: false } };

/** Mercedes-Benz LP 1513 (1963-84): the forward-control lorry of the Levant's roads. */
export const MERCEDES_LP1513: TruckModel = { ...MERCEDES_LP813, length: 6.6, wheelR: 0.5 };
export const MERCEDES_LP1513_BOX: TruckModel = { ...MERCEDES_LP813_BOX, length: 6.6, wheelR: 0.5 };

/** Isuzu Forward / FTR (1990s-): a modern forward-control tilt. */
export const ISUZU_FTR: TruckModel = {
  ...MERCEDES_LP813,
  cab: { ...TAM_BASE.cab, r: 0.18, roofR: 0.16, rake: 0.14 },
  frontFace: { lamps: [{ shape: 'rect', x: 0.86, y: 0.95, w: 0.28, h: 0.14, bezel: 'black' }, { shape: 'rect', x: 1.02, y: 1.18, w: 0.08, h: 0.1, lens: 'amber' }],
    grille: { y: 1.45, w: 1.4, h: 0.26, style: 'hbars', bars: 3, chrome: true, frame: 'body' }, bumper: { y: 0.75, h: 0.22, style: 'painted' } },
};

/** Isuzu Elf / N-series (1990s-) with a box: Asia's and the Gulf's delivery lorry. */
export const ISUZU_ELF_BOX: TruckModel = {
  ...CABOVER_LIGHT, cab: { ...CABOVER_LIGHT.cab, r: 0.2, roofR: 0.15, rake: 0.18 },
  body: { type: 'box', zF: 1.05, zB: -2.7, hw: 0.97, floorY: 1.0, sideH: 0.5, top: 2.75, wood: false },
};

// ---------------------------------------------------------------------------------------------------- Asia

/** Toyota Corolla E110 (1995-2002): Japan's and Bangladesh's saloon. */
export const COROLLA_E110: CarModel = {
  ...VAZ_2107,
  body: { ...VAZ_2107.body, length: 4.27, width: 1.69, frontAxle: 1.35, rearAxle: -1.12, wheelR: 0.3, tyreW: 0.185, track: 1.46, archR: 0.37,
    sill: 0.26, belt: 0.88, noseH: 0.7, tailH: 0.92, cowlZ: 0.84, roofFrontZ: 0.06, roofRearZ: -0.84, glassRearZ: -1.42, roofH: 1.39,
    bonnetCrown: 0.04, roofCrown: 0.07, roofTaper: 0.8, shoulderR: 0.14, noseRound: 0.3, tailRound: 0.22, tuckHigh: 0.07,
    doorCuts: [0.8, -0.3, -1.12], pillars: [-0.33], pillarW: 0.06, windowFrame: TRIM },
  front: { lamps: [{ shape: 'rect', x: 0.6, y: 0.61, w: 0.36, h: 0.13, bezel: 'black' }],
    grille: { y: 0.6, w: 0.46, h: 0.1, style: 'hbars', bars: 2, chrome: true, frame: 'chrome' },
    bumper: { y: 0.42, h: 0.16, style: 'painted' }, plate: { y: 0.4, w: 0.4, h: 0.12 } },
  rear: { lamps: [{ shape: 'rect', x: 0.6, y: 0.72, w: 0.32, h: 0.12, lens: 'red' }],
    bumper: { y: 0.44, h: 0.16, style: 'painted' }, plate: { y: 0.62, w: 0.4, h: 0.12 } },
  details: { handles: TRIM, mirrors: 'door', wipers: true, seams: true },
};

/** Toyota Probox (2002-): the estate of every Japanese trade and Bangladeshi office. */
export const TOYOTA_PROBOX: CarModel = {
  ...COROLLA_E110,
  body: { ...COROLLA_E110.body, length: 4.2, width: 1.69, roofH: 1.5, belt: 0.92, glassRearZ: -2.08, roofRearZ: -2.0, rear: 'estate',
    pillars: [-0.44, -1.32], doorCuts: [0.48, -0.42, -1.2], noseRound: 0.14, tailRound: 0.06, backlight: { w: 0.85, h: 0.6 } },
  rear: { ...COROLLA_E110.rear, lamps: [{ shape: 'rect', x: 0.72, y: 0.8, w: 0.1, h: 0.26, lens: 'red' }] },
};

/** Suzuki Every (1999-): the kei van, 3.4 m of square box. */
export const SUZUKI_EVERY: CarModel = {
  ...HIACE_H50,
  body: { ...HIACE_H50.body, length: 3.39, width: 1.47, frontAxle: 1.22, rearAxle: -1.13, wheelR: 0.28, tyreW: 0.145, track: 1.29, archR: 0.33,
    belt: 1.0, noseH: 0.88, cowlZ: 1.42, roofFrontZ: 1.12, roofRearZ: -1.62, glassRearZ: -1.69, roofH: 1.88, shoulderR: 0.08,
    noseRound: 0.16, tailRound: 0.04, pillars: [0.9, -0.3], doorCuts: [0.98, -0.1] },
  front: { lamps: [{ shape: 'rect', x: 0.52, y: 0.82, w: 0.22, h: 0.14, bezel: 'black' }],
    grille: { y: 0.82, w: 0.5, h: 0.08, style: 'hbars', bars: 2, chrome: false, frame: 'black' },
    bumper: { y: 0.4, h: 0.14, style: 'painted' }, plate: { y: 0.42, w: 0.33, h: 0.16, yellow: true } },
};

/** Suzuki Carry (1999-): the kei truck — the Japanese farm's pickup, 3.4 m, its cab over the front wheels. */
export const SUZUKI_CARRY: TruckModel = {
  ...CABOVER_LIGHT, length: 3.39, width: 1.47, frontAxle: 1.1, rearAxles: [-0.8], wheelR: 0.27, tyreW: 0.145, trackF: 1.29, trackR: 1.29,
  dualRear: false, wheelStyle: 'disc', frameY: 0.5, frameHW: 0.36,
  cab: { zF: 1.66, zB: 0.42, hw: 0.73, y0: 0.55, belt: 1.02, win: 1.55, roof: 1.75, rake: 0.12, tumble: 0.03, r: 0.12,
    roofR: 0.08, split: false, doorFrom: 0.25, doorTo: 0.85, rearWindow: true },
  frontFace: { lamps: [{ shape: 'rect', x: 0.5, y: 0.78, w: 0.2, h: 0.13, bezel: 'black' }],
    grille: { y: 0.98, w: 0.6, h: 0.08, style: 'hbars', bars: 2, chrome: false, frame: 'black' }, bumper: { y: 0.4, h: 0.12, style: 'painted' } },
  rearLamps: [{ shape: 'rect', x: 0.62, y: 0.62, w: 0.12, h: 0.1, lens: 'red' }],
  body: { type: 'dropside', zF: 0.38, zB: -1.68, hw: 0.73, floorY: 0.66, sideH: 0.3, wood: false },
  spare: 'none', fuelTank: 'none',
};

/** Suzuki Jimny JB23 (1998-2018). */
export const SUZUKI_JIMNY: CarModel = {
  ...LADA_NIVA,
  body: { ...LADA_NIVA.body, length: 3.4, width: 1.48, frontAxle: 1.05, rearAxle: -1.2, wheelR: 0.34, tyreW: 0.18, track: 1.21, archR: 0.42,
    belt: 1.05, roofH: 1.7, cowlZ: 0.42, roofFrontZ: -0.02, roofRearZ: -1.62, glassRearZ: -1.7, noseRound: 0.18, tailRound: 0.1, shoulderR: 0.1 },
  front: { lamps: [{ shape: 'round', x: 0.5, y: 0.8, r: 0.08, bezel: 'black' }],
    grille: { y: 0.8, w: 0.5, h: 0.2, style: 'vbars', bars: 5, chrome: false, frame: 'black' },
    bumper: { y: 0.5, h: 0.14, style: 'black' }, plate: { y: 0.5, w: 0.33, h: 0.16, yellow: true } },
  spareOnTail: true,
};

/** Mitsubishi Fuso Fighter (1990s-) with a tilt. */
export const FUSO_FIGHTER: TruckModel = { ...ISUZU_FTR, body: { type: 'tilt', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.3, sideH: 0.5, top: 2.95, wood: false } };

/** Hino Ranger (1990s-) with drop sides. */
export const HINO_RANGER: TruckModel = {
  ...ISUZU_FTR,
  frontFace: { ...ISUZU_FTR.frontFace, grille: { y: 1.4, w: 1.5, h: 0.3, style: 'mesh', bars: 12, chrome: false, frame: 'body' } },
  body: { type: 'dropside', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.3, sideH: 0.45, wood: false },
};

/** Toyota HiAce H100 (1989-2004): the Bangladeshi microbus. */
export const HIACE_H100: CarModel = {
  ...HIACE_H50,
  body: { ...HIACE_H50.body, shoulderR: 0.12, noseRound: 0.22 },
  front: { ...HIACE_H50.front, lamps: [{ shape: 'rect', x: 0.6, y: 0.82, w: 0.26, h: 0.12, bezel: 'black' }],
    grille: { y: 0.8, w: 0.7, h: 0.1, style: 'hbars', bars: 2, chrome: true, frame: 'chrome' } },
};

/** Mahindra Bolero pickup (2000s-). */
export const BOLERO_PICKUP: PickupModel = {
  ...HILUX_N70,
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.96, w: 0.26, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.92, w: 0.66, h: 0.3, style: 'vbars', bars: 7, chrome: true, frame: 'chrome' },
    bumper: { y: 0.58, h: 0.18, style: 'black' }, plate: { y: 0.6, w: 0.4, h: 0.12 } },
};

/** Mahindra MM540 (1980s-2010): the Willys's Indian descendant, its canvas top. */
export const MAHINDRA_MM540: JeepModel = { ...JEEP_CJ5, top: 'canvas', grille: { style: 'slots', w: 0.6, h: 0.4, y: 0.88, count: 7 } };

/** Tata LPT 1613 (1980s-): the bonneted lorry of the subcontinent, its high wooden body painted bright. */
export const TATA_1613: TruckModel = {
  ...KURZHAUBER, wheelR: 0.5,
  wide: { zNose: 2.95, noseH: 1.28, topH: 1.36, noseBottom: 0.64, archR: 0.56, shoulderR: 0.1, noseRound: 0.14 },
  frontFace: { lamps: [{ shape: 'round', x: 0.86, y: 1.08, r: 0.09, bezel: 'chrome' }],
    grille: { y: 1.04, w: 1.1, h: 0.4, style: 'hbars', bars: 8, chrome: true, frame: 'chrome' }, bumper: { y: 0.72, h: 0.18, style: 'painted' } },
  body: { type: 'dropside', zF: 0.18, zB: -3.18, hw: 1.13, floorY: 1.3, sideH: 1.1, wood: true },
};

/** Tata 407 (1986-) with a box. */
export const TATA_407_BOX: TruckModel = { ...ISUZU_ELF_BOX, frontFace: { ...CABOVER_LIGHT.frontFace, lamps: [{ shape: 'round', x: 0.7, y: 0.86, r: 0.08, bezel: 'chrome' }] } };
/** Tata LPT 1613 with drop sides. */
export const TATA_1613_DROPSIDE: TruckModel = { ...TATA_1613, body: { type: 'dropside', zF: 0.18, zB: -3.18, hw: 1.13, floorY: 1.3, sideH: 0.6, wood: true } };

/** Toyota Vios (2007-): the Mekong towns' saloon. */
export const TOYOTA_VIOS: CarModel = {
  ...COROLLA_E110,
  body: { ...COROLLA_E110.body, length: 4.25, roofH: 1.46, belt: 0.9, noseRound: 0.3, tailRound: 0.22, shoulderR: 0.14 },
};

/** Toyota Innova (2004-): the people mover. */
export const TOYOTA_INNOVA: CarModel = {
  ...TOYOTA_PROBOX,
  body: { ...TOYOTA_PROBOX.body, length: 4.58, width: 1.77, roofH: 1.75, belt: 1.0, cowlZ: 0.85, roofFrontZ: 0.1, shoulderR: 0.14, noseRound: 0.3,
    track: 1.5, frontAxle: 1.42, rearAxle: -1.33, wheelR: 0.33, archR: 0.4 },
};

/** UAZ-469 (1973-): the Soviet field car, kept in Vietnam's provinces, its canvas tilt over the rear. */
export const UAZ_469: CarModel = {
  ...LAND_ROVER_S3,
  body: { ...LAND_ROVER_S3.body, length: 4.03, width: 1.79, frontAxle: 1.22, rearAxle: -1.16, wheelR: 0.42, tyreW: 0.21, track: 1.45, archR: 0.5,
    belt: 1.25, roofH: 2.02, cowlZ: 0.48, roofFrontZ: 0.28, roofRearZ: -1.92, glassRearZ: -2.0, roofMat: fixedPaint(0x3e4230, 0.95),
    doorCuts: [0.44, -0.3, -1.0], pillars: [-0.32] },
  front: { lamps: [{ shape: 'round', x: 0.6, y: 0.88, r: 0.09, bezel: 'body' }],
    grille: { y: 0.86, w: 0.7, h: 0.34, style: 'vbars', bars: 9, chrome: false, frame: 'body' },
    bumper: { y: 0.55, h: 0.12, style: 'painted' }, plate: { y: 0.54, w: 0.5, h: 0.11 } },
};

/** Kia K-series / Thaco (2000s-): the light forward-control pickup of the Mekong delta. */
export const KIA_K190: TruckModel = {
  ...CABOVER_LIGHT, length: 5.0, width: 1.74, frontAxle: 1.85, rearAxles: [-0.95], wheelR: 0.35, tyreW: 0.185, trackF: 1.48, trackR: 1.3,
  dualRear: true, frameY: 0.72,
  cab: { ...CABOVER_LIGHT.cab, zF: 2.45, zB: 1.0, hw: 0.86, y0: 0.85, belt: 1.42, win: 1.95, roof: 2.12 },
  body: { type: 'dropside', zF: 0.92, zB: -2.5, hw: 0.86, floorY: 0.95, sideH: 0.4, wood: false },
};

/** Hyundai Mighty (2000s-) with a tilt. */
export const HYUNDAI_MIGHTY: TruckModel = { ...ISUZU_ELF_BOX, body: { type: 'tilt', zF: 1.05, zB: -2.7, hw: 0.97, floorY: 1.0, sideH: 0.45, top: 2.65, wood: false } };
/** Thaco Ollin (2010s-) with drop sides. */
export const THACO_DROPSIDE: TruckModel = { ...CABOVER_LIGHT };

// ---------------------------------------------------------------------------------------------------- Australia, North America, Spain

/** Holden HQ Kingswood (1971-74): the Australian saloon. */
export const HOLDEN_HQ: CarModel = {
  ...FORD_FALCON,
  body: { ...FORD_FALCON.body, length: 4.8, width: 1.88, track: 1.54, roofH: 1.37, belt: 0.84, noseRound: 0.12, tailRound: 0.12 },
  front: { lamps: [{ shape: 'round', x: 0.72, y: 0.62, r: 0.09, bezel: 'chrome' }],
    grille: { y: 0.6, w: 1.2, h: 0.22, style: 'mesh', bars: 16, chrome: true, frame: 'chrome' },
    bumper: { y: 0.4, h: 0.12, style: 'chrome' }, plate: { y: 0.4, w: 0.37, h: 0.13 } },
};

export const HOLDEN_HQ_WAGON: CarModel = {
  ...HOLDEN_HQ,
  body: { ...HOLDEN_HQ.body, glassRearZ: -2.36, roofRearZ: -2.22, rear: 'estate', pillars: [-0.44, -1.32], doorCuts: [0.35, -0.42, -1.18],
    backlight: { w: 0.85, h: 0.6 } },
  roofRack: true,
};

/** Holden HQ ute (1971-74): the coupe utility — the saloon's front, the tray behind the cab. */
export const HOLDEN_UTE: PickupModel = {
  ...FORD_F100,
  cab: { ...FORD_F100.cab, width: 1.88, belt: 0.86, noseH: 0.78, tailH: 0.86, roofH: 1.36, sill: 0.3, noseBottom: 0.34, tailBottom: 0.36,
    track: 1.54, wheelR: 0.33, tyreW: 0.18, archR: 0.4 },
  bed: { zF: -0.17, zB: -2.42, hw: 0.94, floor: 0.58, top: 0.86, archR: 0.4 },
  front: HOLDEN_HQ.front,
};

/** Toyota Land Cruiser FJ40 (1960-84), hardtop. */
export const LAND_CRUISER_FJ40: CarModel = {
  ...LAND_ROVER_S3,
  body: { ...LAND_ROVER_S3.body, length: 3.84, frontAxle: 1.15, rearAxle: -1.13, belt: 1.12, roofH: 1.95, roofMat: fixedPaint(0xeae6dc, 0.5),
    shoulderR: 0.04, noseRound: 0.03 },
  front: { lamps: [{ shape: 'round', x: 0.62, y: 0.82, r: 0.085, bezel: 'body' }],
    grille: { y: 0.82, w: 0.8, h: 0.26, style: 'hbars', bars: 3, chrome: false, frame: 'body' },
    bumper: { y: 0.52, h: 0.12, style: 'painted' }, plate: { y: 0.52, w: 0.37, h: 0.13 } },
};

/** International ACCO (1960s-) with a tilt. */
export const INTERNATIONAL_ACCO: TruckModel = { ...MERCEDES_LP813, wheelR: 0.48, cab: { ...TAM_BASE.cab, r: 0.05, roofR: 0.06, rake: 0.02 } };
/** Bedford TK (1960-86) with a box. */
export const BEDFORD_TK_BOX: TruckModel = {
  ...ISUZU_ELF_BOX, length: 6.0, width: 2.2,
  cab: { ...CABOVER_LIGHT.cab, hw: 1.08, r: 0.1, roofR: 0.1, rake: 0.0 },
  frontFace: { lamps: [{ shape: 'round', x: 0.82, y: 0.92, r: 0.09, bezel: 'chrome' }],
    grille: { y: 0.92, w: 1.0, h: 0.3, style: 'hbars', bars: 5, chrome: false, frame: 'body' }, bumper: { y: 0.6, h: 0.16, style: 'painted' } },
  body: { type: 'box', zF: 1.05, zB: -3.0, hw: 1.1, floorY: 1.05, sideH: 0.5, top: 2.95, wood: false },
};
/** An International flatbed with sawn timber (the West Coast's mills and mines). */
export const INTERNATIONAL_TIMBER: TruckModel = { ...INTERNATIONAL_ACCO, body: { type: 'flatbed', zF: 1.28, zB: -3.08, hw: 1.15, floorY: 1.38, sideH: 0.2, wood: true, load: 'crates' } };

/** Chevrolet Caprice (1977-90). */
export const CHEVROLET_CAPRICE: CarModel = {
  ...MERCEDES_W123,
  body: { ...MERCEDES_W123.body, length: 5.37, width: 1.92, track: 1.57, roofH: 1.43 },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.64, w: 0.32, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.62, w: 0.9, h: 0.22, style: 'mesh', bars: 14, chrome: true, frame: 'chrome' },
    bumper: { y: 0.42, h: 0.12, style: 'chrome' }, plate: { y: 0.42, w: 0.3, h: 0.15 } },
};

/** Chevrolet Suburban (1973-91): the long estate of the North. */
export const CHEVROLET_SUBURBAN: CarModel = {
  ...LAND_CRUISER_80,
  body: { ...LAND_CRUISER_80.body, length: 5.5, width: 2.0, roofH: 1.85, noseRound: 0.06, tailRound: 0.04, shoulderR: 0.06,
    doorCuts: [0.62, -0.25, -1.2], pillars: [-0.28, -1.3] },
  front: { lamps: [{ shape: 'rect', x: 0.7, y: 0.86, w: 0.26, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.86, w: 1.2, h: 0.3, style: 'mesh', bars: 12, chrome: true, frame: 'chrome' },
    bumper: { y: 0.54, h: 0.14, style: 'chrome' }, plate: { y: 0.54, w: 0.3, h: 0.15 } },
};

/** Chevrolet G20 (1971-96): the panel van. */
export const CHEVY_G20: CarModel = {
  ...FORD_TRANSIT_MK2,
  body: { ...FORD_TRANSIT_MK2.body, length: 4.95, width: 2.02, roofH: 2.02, noseRound: 0.1 },
  front: { lamps: [{ shape: 'rect', x: 0.7, y: 0.82, w: 0.26, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.82, w: 1.1, h: 0.26, style: 'mesh', bars: 12, chrome: true, frame: 'chrome' },
    bumper: { y: 0.46, h: 0.12, style: 'chrome' }, plate: { y: 0.46, w: 0.3, h: 0.15 } },
};

/** Ford F-250 (1980-86). */
export const FORD_F250: PickupModel = {
  ...FORD_F100,
  cab: { ...FORD_F100.cab, noseH: 1.15, belt: 1.18, roofH: 1.9, shoulderR: 0.05, noseRound: 0.04 },
  front: { lamps: [{ shape: 'rect', x: 0.74, y: 0.98, w: 0.24, h: 0.14, bezel: 'chrome' }],
    grille: { y: 0.94, w: 1.2, h: 0.3, style: 'mesh', bars: 10, chrome: true, frame: 'chrome' },
    bumper: { y: 0.54, h: 0.14, style: 'chrome' }, plate: { y: 0.54, w: 0.3, h: 0.15 } },
};

/** Jeep CJ-7 (1976-86), its canvas top. */
export const JEEP_CJ7: JeepModel = { ...JEEP_CJ5, length: 3.76, frontAxle: 1.2, rearAxle: -1.17, top: 'canvas' };

const US_BONNETED = { ...F600_BASE, length: 6.6, wheelR: 0.5, wide: { ...F600_BASE.wide, noseH: 1.42, topH: 1.48, noseRound: 0.06, shoulderR: 0.05 } } satisfies Omit<TruckModel, 'body'>;
/** A Kenworth/GMC conventional with a tilt (the DEW Line's supply truck). */
export const US_CONVENTIONAL_TILT: TruckModel = { ...US_BONNETED, body: { type: 'tilt', zF: 0.02, zB: -3.25, hw: 1.15, floorY: 1.3, sideH: 0.55, top: 3.0, wood: false } };
export const US_CONVENTIONAL_BOX: TruckModel = { ...US_BONNETED, body: { type: 'box', zF: 0.02, zB: -3.25, hw: 1.17, floorY: 1.3, sideH: 0.5, top: 3.05, wood: false } };
export const US_CONVENTIONAL_FLATBED: TruckModel = { ...US_BONNETED, body: { type: 'flatbed', zF: 0.02, zB: -3.25, hw: 1.15, floorY: 1.3, sideH: 0.2, wood: true, load: 'crates' } };

/** SEAT 600 (1957-73): Spain's people's car, rear-engined, round lamps, no grille. */
export const SEAT_600: CarModel = {
  ...YUGO_45,
  body: { ...YUGO_45.body, length: 3.3, width: 1.38, frontAxle: 1.0, rearAxle: -1.0, wheelR: 0.28, tyreW: 0.13, track: 1.15, archR: 0.33,
    belt: 0.86, noseH: 0.72, tailH: 0.74, roofH: 1.4, cowlZ: 0.5, roofFrontZ: 0.1, roofRearZ: -0.95, glassRearZ: -1.35, bonnetCrown: 0.06,
    roofCrown: 0.06, shoulderR: 0.14, noseRound: 0.32, tailRound: 0.36, rear: 'notch', doorCuts: [0.45, -0.38], pillars: [], windowFrame: CHROME },
  front: { lamps: [{ shape: 'round', x: 0.5, y: 0.66, r: 0.07, bezel: 'chrome' }],
    bumper: { y: 0.42, h: 0.06, style: 'chrome' }, plate: { y: 0.4, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.56, y: 0.66, w: 0.06, h: 0.12, lens: 'red' }],
    grille: { y: 0.6, w: 0.5, h: 0.2, style: 'hbars', bars: 6, chrome: false, frame: 'body' },
    bumper: { y: 0.44, h: 0.06, style: 'chrome' }, plate: { y: 0.52, w: 0.3, h: 0.15 } },
};

/** SEAT 124 Familiar (1968-80). */
export const SEAT_124_FAMILIAR: CarModel = {
  ...VAZ_2104,
  front: { lamps: [{ shape: 'round', x: 0.62, y: 0.66, r: 0.075, bezel: 'chrome' }, { shape: 'round', x: 0.45, y: 0.66, r: 0.075, bezel: 'chrome' }],
    grille: { y: 0.66, w: 0.6, h: 0.14, style: 'hbars', bars: 4, chrome: true, frame: 'chrome' },
    bumper: { y: 0.44, h: 0.08, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } },
};

/** SAVA J4 (1960s-70s): the Spanish-built Austin J4 van. */
export const SAVA_J4: CarModel = { ...SUZUKI_EVERY, body: { ...SUZUKI_EVERY.body, length: 3.95, width: 1.65, noseRound: 0.3, shoulderR: 0.16, roofH: 1.9 },
  front: { lamps: [{ shape: 'round', x: 0.6, y: 0.86, r: 0.08, bezel: 'chrome' }],
    grille: { y: 0.66, w: 0.7, h: 0.22, style: 'vbars', bars: 10, chrome: true, frame: 'chrome' },
    bumper: { y: 0.4, h: 0.08, style: 'chrome' }, plate: { y: 0.42, w: 0.52, h: 0.11 } } };

/** Land Rover Santana 88 (1958-) and the 109 pickup. */
export const SANTANA_88: CarModel = { ...LAND_ROVER_S3 };
export const SANTANA_PICKUP: PickupModel = {
  ...HILUX_N50,
  cab: { ...HILUX_N50.cab, width: 1.68, noseH: 1.08, belt: 1.18, roofH: 1.98, shoulderR: 0.03, noseRound: 0.02, tuckLow: 0, tuckHigh: 0.02,
    wheelR: 0.39, tyreW: 0.19, archR: 0.47, sill: 0.46 },
  front: LAND_ROVER_S3.front,
  bed: { zF: -0.12, zB: -2.33, hw: 0.82, floor: 0.82, top: 1.2, archR: 0.47 },
};

/** Pegaso Comet (1959-) and the Ebro and Barreiros forward-control lorries of 1960s-70s Spain. */
export const PEGASO_COMET: TruckModel = { ...MERCEDES_LP813, cab: { ...TAM_BASE.cab, r: 0.14, roofR: 0.12, rake: 0.08 } };
export const EBRO_BOX: TruckModel = { ...MERCEDES_LP813_BOX };
export const BARREIROS_DROPSIDE: TruckModel = { ...FAP_1314 };

// ---------------------------------------------------------------------------------------------------- France, the present day
// 2026-10-08 (the coordinator: Saltmere Bay is the present-day Breton coast — its tank wrecks' era is 'modern' and its
// references are present-day photographs): Renault, Peugeot and Citroën cars and vans, a fishing pickup, Renault and
// Iveco light trucks.

/** Renault Clio IV (2012-19): the five-door supermini, its swept lamps either side of a black grille. */
export const RENAULT_CLIO_4: CarModel = {
  ...COROLLA_E110,
  body: { ...COROLLA_E110.body, length: 4.06, width: 1.73, frontAxle: 1.38, rearAxle: -1.21, wheelR: 0.31, tyreW: 0.195, track: 1.5, archR: 0.38,
    sill: 0.28, belt: 0.92, beltRise: 0.06, noseH: 0.72, tailH: 0.95, cowlZ: 0.7, roofFrontZ: -0.05, roofRearZ: -1.1, glassRearZ: -1.88,
    roofH: 1.45, roofTaper: 0.8, shoulderR: 0.16, noseRound: 0.34, tailRound: 0.24, rear: 'hatch',
    doorCuts: [0.7, -0.28, -1.12], pillars: [-0.3], pillarW: 0.06, backlight: { w: 0.8, h: 0.42 } },
  front: { lamps: [{ shape: 'rect', x: 0.62, y: 0.7, w: 0.34, h: 0.11, bezel: 'black' }],
    grille: { y: 0.64, w: 0.62, h: 0.12, style: 'hbars', bars: 2, chrome: false, frame: 'black' },
    bumper: { y: 0.42, h: 0.2, style: 'painted' }, plate: { y: 0.44, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.66, y: 0.86, w: 0.22, h: 0.12, lens: 'red' }],
    bumper: { y: 0.44, h: 0.2, style: 'painted' }, plate: { y: 0.62, w: 0.52, h: 0.11 } },
};

/** Peugeot 308 SW (2014-21): the estate, its long roof and rails. */
export const PEUGEOT_308_SW: CarModel = {
  ...TOYOTA_PROBOX,
  body: { ...TOYOTA_PROBOX.body, length: 4.58, width: 1.8, frontAxle: 1.5, rearAxle: -1.23, wheelR: 0.32, tyreW: 0.205, track: 1.56, archR: 0.39,
    sill: 0.28, belt: 0.94, beltRise: 0.05, noseH: 0.74, tailH: 0.98, cowlZ: 0.85, roofFrontZ: 0.08, roofRearZ: -1.95, glassRearZ: -2.12,
    roofH: 1.47, roofTaper: 0.82, shoulderR: 0.16, noseRound: 0.34, tailRound: 0.16,
    doorCuts: [0.82, -0.25, -1.12], pillars: [-0.28, -1.25], pillarW: 0.06, backlight: { w: 0.85, h: 0.5 } },
  front: { lamps: [{ shape: 'rect', x: 0.64, y: 0.72, w: 0.32, h: 0.1, bezel: 'black' }],
    grille: { y: 0.6, w: 0.7, h: 0.16, style: 'mesh', bars: 8, chrome: false, frame: 'chrome' },
    bumper: { y: 0.42, h: 0.2, style: 'painted' }, plate: { y: 0.44, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.7, y: 0.86, w: 0.18, h: 0.14, lens: 'red' }],
    bumper: { y: 0.44, h: 0.2, style: 'painted' }, plate: { y: 0.64, w: 0.52, h: 0.11 } },
  roofRack: true,
};

/** Citroën Berlingo III (2018-), the van: tall and blunt, its load bay's sides blind behind the doors. */
export const CITROEN_BERLINGO: CarModel = {
  ...TOYOTA_INNOVA,
  body: { ...TOYOTA_INNOVA.body, length: 4.4, width: 1.85, frontAxle: 1.32, rearAxle: -1.46, wheelR: 0.32, tyreW: 0.205, track: 1.55, archR: 0.4,
    sill: 0.32, belt: 1.06, noseH: 0.86, tailH: 1.1, cowlZ: 0.95, roofFrontZ: 0.3, roofRearZ: -2.1, glassRearZ: -2.18, roofH: 1.84,
    roofTaper: 0.92, shoulderR: 0.12, noseRound: 0.32, tailRound: 0.08, rear: 'estate',
    doorCuts: [0.85, -0.2, -1.0], pillars: [-0.22], sideGlassTo: -0.25, backlight: { w: 0.8, h: 0.42 } },
  front: { lamps: [{ shape: 'rect', x: 0.66, y: 0.84, w: 0.3, h: 0.12, bezel: 'black' }],
    grille: { y: 0.74, w: 0.8, h: 0.16, style: 'hbars', bars: 2, chrome: false, frame: 'black' },
    bumper: { y: 0.46, h: 0.24, style: 'black' }, plate: { y: 0.48, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.8, y: 0.96, w: 0.1, h: 0.3, lens: 'red' }],
    bumper: { y: 0.46, h: 0.2, style: 'black' }, plate: { y: 0.7, w: 0.52, h: 0.11 } },
};

/** Dacia Duster II (2018-): the four-by-four the coast drives, high-set on its big wheels (the jeep role's budget leaves
 * out its roof rails). */
export const DACIA_DUSTER: CarModel = {
  ...TOYOTA_PROBOX,
  body: { ...TOYOTA_PROBOX.body, length: 4.34, width: 1.8, frontAxle: 1.4, rearAxle: -1.27, wheelR: 0.36, tyreW: 0.215, track: 1.56, archR: 0.44,
    sill: 0.42, noseBottom: 0.45, tailBottom: 0.48, belt: 1.1, noseH: 0.95, tailH: 1.1, cowlZ: 0.78, roofFrontZ: 0.0, roofRearZ: -1.85,
    glassRearZ: -2.0, roofH: 1.69, roofTaper: 0.84, shoulderR: 0.14, noseRound: 0.3, tailRound: 0.14,
    doorCuts: [0.72, -0.3, -1.12], pillars: [-0.32, -1.3], pillarW: 0.07, backlight: { w: 0.8, h: 0.45 } },
  front: { lamps: [{ shape: 'rect', x: 0.62, y: 0.88, w: 0.3, h: 0.13, bezel: 'black' }],
    grille: { y: 0.86, w: 0.7, h: 0.16, style: 'hbars', bars: 3, chrome: true, frame: 'chrome' },
    bumper: { y: 0.55, h: 0.24, style: 'painted' }, plate: { y: 0.54, w: 0.52, h: 0.11 } },
  rear: { lamps: [{ shape: 'rect', x: 0.72, y: 0.98, w: 0.16, h: 0.16, lens: 'red' }],
    bumper: { y: 0.56, h: 0.22, style: 'black' }, plate: { y: 0.76, w: 0.52, h: 0.11 } },
};

/** The light trucks' modern cab: a short sloping nose, the screen raked, the corners well rounded. */
const MODERN_LIGHT_CAB: TruckModel = {
  ...CABOVER_LIGHT, length: 6.2, width: 2.05, frontAxle: 2.05, rearAxles: [-1.6], wheelR: 0.36, tyreW: 0.215, trackF: 1.75, trackR: 1.7,
  wheelStyle: 'disc', frameY: 0.78,
  cab: { ...CABOVER_LIGHT.cab, zF: 2.95, zB: 1.2, hw: 1.02, y0: 0.9, belt: 1.45, win: 2.05, roof: 2.45, rake: 0.32, tumble: 0.05, r: 0.24, roofR: 0.18 },
  frontFace: { lamps: [{ shape: 'rect', x: 0.74, y: 1.05, w: 0.3, h: 0.14, bezel: 'black' }],
    grille: { y: 0.92, w: 1.0, h: 0.2, style: 'hbars', bars: 2, chrome: false, frame: 'black' }, bumper: { y: 0.6, h: 0.22, style: 'black' } },
  rearLamps: [{ shape: 'rect', x: 0.9, y: 0.9, w: 0.12, h: 0.2, lens: 'red' }],
};

/** Renault Master III (2010-) with a box body: the coast's delivery van. */
export const RENAULT_MASTER_BOX: TruckModel = {
  ...MODERN_LIGHT_CAB, dualRear: false,
  body: { type: 'box', zF: 1.15, zB: -3.1, hw: 1.05, floorY: 0.98, sideH: 0.5, top: 3.0, wood: false },
};

/** Iveco Daily (2014-) with drop sides: the oyster farm's and the builders' flatbed. */
export const IVECO_DAILY_DROPSIDE: TruckModel = {
  ...MODERN_LIGHT_CAB,
  frontFace: { ...MODERN_LIGHT_CAB.frontFace, grille: { y: 0.95, w: 1.1, h: 0.26, style: 'hbars', bars: 3, chrome: false, frame: 'black' } },
  body: { type: 'dropside', zF: 1.15, zB: -3.1, hw: 1.05, floorY: 1.0, sideH: 0.4, wood: false },
};

/** Renault Trucks D (2013-): the medium distribution lorry, forward control, its tilt. */
export const RENAULT_TRUCKS_D: TruckModel = {
  ...KAMAZ_4326, length: 7.4, width: 2.5, frontAxle: 2.6, rearAxles: [-1.6], wheelR: 0.48, tyreW: 0.28, trackF: 2.0, trackR: 1.85,
  dualRear: true, wheelStyle: 'truck', frameY: 1.0,
  cab: { ...KAMAZ_4326.cab, zF: 3.5, zB: 1.75, hw: 1.22, y0: 1.15, belt: 1.95, win: 2.65, roof: 2.95, rake: 0.12, tumble: 0.04, r: 0.16, roofR: 0.2 },
  frontFace: { lamps: [{ shape: 'rect', x: 0.95, y: 0.98, w: 0.3, h: 0.14, bezel: 'black' }],
    grille: { y: 1.55, w: 1.6, h: 0.4, style: 'hbars', bars: 3, chrome: false, frame: 'black' }, bumper: { y: 0.8, h: 0.3, style: 'black' } },
  body: { type: 'tilt', zF: 1.65, zB: -3.6, hw: 1.24, floorY: 1.35, sideH: 0.6, top: 3.3, wood: false },
};
