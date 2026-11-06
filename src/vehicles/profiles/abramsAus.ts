// The Australian Army's M1A1 AIM SA (release 269; australiaSpecs.ts): the fleet's plain M1A1 build (the commander's .50
// on the CWS, the loader's pintle gun) with the Australian kit the 2012-2023 photographs show on every tank: the TMAPU
// standing in the left rear of a lengthened bustle rack (a black box with a louvred and a round grille on its rear face,
// its tall exhaust pipe beside it), the rack's raised second tier of rails round its rear, and the call-sign
// plate on the rack (docs/references/tanks/m1a1_aim_sa_aus.md). The kangaroo and the three-tone are the spec's
// (vehicleMarkings.ts, the disruptive coat). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { ABRAMS_PROFILES } from './abrams.ts';
import { KIT } from './kit.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

const { box, cylY, cylZ } = KIT;

// Turret-local stations (pivot 0, 1.632, 0.350 on the hull), measured off the 268 M1A1 shell's build (b0b4d539fb, the
// owner's model; .qa-dev rack probe): the bustle's rear face at M1A1_TURRET.REAR_Z (-2.56), the rack's rear rail at
// z -2.95 across the full x +-1.65 with its floor at y 0.26, its low rail at 0.28 and its top rail at 0.62; the extension
// carries it 0.50 m further, to z -3.45 (the old shell's rack stood at z -3.47 between x +-1.07)
const RACK = { x: 1.65, floor: 0.26, low: 0.28, mid: 0.62, tier: 0.98, front: -2.95, rear: -3.45 } as const;
// the TMAPU on the rack's left (+x: a +Z hull's left), read off the square rear photograph (rear_adfa2015, ~2.5 mm a pixel
// on the 3.5 m hull): 0.72 m across from 0.22 m off the centreline, 0.52 m tall over the rack floor, in the extension
// just behind the rack's rear rail
const TMAPU = { x0: 0.22, x1: 0.94, z0: -2.89, z1: -3.40, y1: 0.79 } as const;

/** The rack's extension: mesh floor, side and rear rails at the rack's two heights, and the raised tier over the rear. */
function rackExtension(P: TankBuilderPort): void {
  const depth = RACK.front - RACK.rear, zc = (RACK.front + RACK.rear) / 2;
  P.add('turretDark', box(RACK.x * 2, 0.012, depth), 0, RACK.floor, zc);
  for (const y of [RACK.low, RACK.mid, RACK.tier]) {
    P.add('turretDetail', box(RACK.x * 2 + 0.045, 0.045, 0.045), 0, y, RACK.rear);
    for (const side of [-1, 1]) P.add('turretDetail', box(0.045, 0.045, depth), side * RACK.x, y, zc);
  }
  for (const x of [-RACK.x, -0.85, 0, 0.85, RACK.x]) {
    P.add('turretDetail', box(0.04, RACK.tier - RACK.low, 0.04), x, (RACK.tier + RACK.low) / 2, RACK.rear);
  }
  // the tier's front posts rise from the old rack's dropped rail
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.04, RACK.tier - RACK.mid, 0.04), side * RACK.x, (RACK.tier + RACK.mid) / 2, RACK.front);
  }
}

/** The tank-mounted auxiliary power unit: the black box across the rack's joint, a tan panel over the inboard part of
 * its rear face carrying the square louvred grille and the round grille, a latch on its outboard part, and the tall capped
 * exhaust pipe standing on the rack floor just inboard of it (rear_adfa2015, rear34_adfa2015). */
function tmapu(P: TankBuilderPort): void {
  const { x0, x1, z0, z1, y1 } = TMAPU, y0 = RACK.floor + 0.006;
  const xc = (x0 + x1) / 2, w = x1 - x0, d = z0 - z1, h = y1 - y0;
  P.add('turretDark', box(w, h, d), xc, y0 + h / 2, (z0 + z1) / 2);
  P.add('turretDark', box(w + 0.02, 0.016, d + 0.02), xc, y1 + 0.008, (z0 + z1) / 2);
  const gy = y1 - 0.13, panelX1 = x0 + 0.52;
  P.add('turret', box(panelX1 - x0 - 0.02, 0.22, 0.010), (x0 + panelX1) / 2, gy, z1 - 0.005);
  P.add('turretDetail', box(0.16, 0.16, 0.012), 0.63, gy, z1 - 0.011);
  for (let i = 0; i < 5; i++) P.add('turretDark', box(0.14, 0.012, 0.016), 0.63, gy - 0.06 + i * 0.03, z1 - 0.018, 0.5);
  P.add('turretDetail', cylZ(0.07, 0.014, 20), 0.475, gy, z1 - 0.012);
  P.add('turretDark', cylZ(0.05, 0.018, 20), 0.475, gy, z1 - 0.016);
  P.add('turretDetail', box(0.05, 0.08, 0.03), x1 - 0.12, gy, z1 - 0.015);
  // (269 blind critic: at 0.23 m over the box, 3.2 cm thick, it read as a stub) the pipe 0.34 m over the box and thicker,
  // under its cap and T-head, its top (2.81 m) inside the photo packet's tallest (docs/references/photos)
  const stackX = x0 - 0.10, stackZ = z1 + 0.14, stackTop = y1 + 0.34;
  P.add('turretDark', cylY(0.042, 0.042, stackTop - y0, 12), stackX, (y0 + stackTop) / 2, stackZ);
  P.add('turretDark', cylY(0.056, 0.056, 0.035, 12), stackX, stackTop + 0.017, stackZ);
  P.add('turretDark', box(0.18, 0.035, 0.05), stackX, stackTop + 0.052, stackZ);
}


/** The call-sign plate hung on the rack's right side rail (the tank's number on it; the TMAPU holds the left rear). */
function callSignPlate(P: TankBuilderPort): void {
  const x = -RACK.x - 0.03, y = (RACK.low + RACK.mid) / 2, z = (RACK.front + RACK.rear) / 2;
  P.add('turret', box(0.012, 0.26, 0.40), x, y, z);
  P.decal('turret', 'number', '', 0.17, [x - 0.008, y, z], -Math.PI / 2);
}

export function buildM1A1AimSaAus(P: TankBuilderPort): void {
  // buildTejasFamily branches on the source family id: present the plain M1A1's id for the base build only (the
  // Ukrainian M1A1's pattern, ukraine.ts), then restore the Australian identity before the kit
  const id = P.spec.id;
  P.spec.id = 'm1a1';
  try {
    ABRAMS_PROFILES.m1a1.build(P);
  } finally {
    P.spec.id = id;
  }
  rackExtension(P);
  tmapu(P);
  // (the rack's and the extension's loads are the decor layer's: decorations.ts LIVED_IN_ROWS m1a1_aim_sa_aus)
  callSignPlate(P);
  P.turretG.userData.ausAbramsReceipt = { base: 'm1a1', tmapu: 'rack-left-rear', rackExtensionM: RACK.front - RACK.rear,
    rackTiers: 2, callSignPlate: true };
  // the owner, 2026-11-02: "a lot of ghillie on them and on their barrels" (ghillieFleetSuits.ts m1a1_aim_sa_aus)
  addVehicleGhillieSuit(P);
}
