// The Australian Army's M1A1 AIM SA (release 269; australiaSpecs.ts): the fleet's plain M1A1 build (the commander's .50
// on the CWS, the loader's pintle gun) with the Australian kit the 2012-2023 photographs show on every tank: the TMAPU
// standing in the left rear of a lengthened bustle rack (a black box with a louvred and a round grille on its rear face
// and the exhaust stack on its roof), the rack's raised second tier of rails round its rear, and the call-sign
// plate on the rack (docs/references/tanks/m1a1_aim_sa_aus.md). The kangaroo and the three-tone are the spec's
// (vehicleMarkings.ts, the disruptive coat). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { ABRAMS_PROFILES } from './abrams.ts';
import { KIT } from './kit.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

const { box, cylY, cylZ } = KIT;

// Turret-local stations (pivot 0, 1.632, 0.350 on the hull): the M1A1 rack's rear frame stands at z -3.47 between
// x +-1.07 with its floor at y 0.24 and its dropped top rail at 0.63; the extension carries it to z -3.97
const RACK = { x: 1.05, floor: 0.24, low: 0.29, mid: 0.63, tier: 0.98, front: -3.47, rear: -3.97 } as const;
const TMAPU = { x0: -0.98, x1: -0.36, z0: -3.40, z1: -3.92, y1: 0.98 } as const;

/** The rack's extension: mesh floor, side and rear rails at the rack's two heights, and the raised tier over the rear. */
function rackExtension(P: TankBuilderPort): void {
  const depth = RACK.front - RACK.rear, zc = (RACK.front + RACK.rear) / 2;
  P.add('turretDark', box(RACK.x * 2, 0.012, depth), 0, RACK.floor, zc);
  for (const y of [RACK.low, RACK.mid, RACK.tier]) {
    P.add('turretDetail', box(RACK.x * 2 + 0.045, 0.045, 0.045), 0, y, RACK.rear);
    for (const side of [-1, 1]) P.add('turretDetail', box(0.045, 0.045, depth), side * RACK.x, y, zc);
  }
  for (const x of [-RACK.x, -0.35, 0.35, RACK.x]) {
    P.add('turretDetail', box(0.04, RACK.tier - RACK.low, 0.04), x, (RACK.tier + RACK.low) / 2, RACK.rear);
  }
  // the tier's front posts rise from the old rack's dropped rail
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.04, RACK.tier - RACK.mid, 0.04), side * RACK.x, (RACK.tier + RACK.mid) / 2, RACK.front);
  }
}

/** The tank-mounted auxiliary power unit: the black box across the rack's joint, its louvred and round grilles on the
 * rear face, two handles, the exhaust stack and its cap on the roof's outboard rear corner. */
function tmapu(P: TankBuilderPort): void {
  const { x0, x1, z0, z1, y1 } = TMAPU, y0 = RACK.floor + 0.006;
  const xc = (x0 + x1) / 2, w = x1 - x0, d = z0 - z1, h = y1 - y0;
  P.add('turretDark', box(w, h, d), xc, y0 + h / 2, (z0 + z1) / 2);
  P.add('turretDark', box(w + 0.02, 0.016, d + 0.02), xc, y1 + 0.008, (z0 + z1) / 2);
  const gy = y0 + h * 0.58;
  P.add('turretDetail', box(0.22, 0.22, 0.012), x0 + 0.17, gy, z1 - 0.006);
  for (let i = 0; i < 5; i++) P.add('turretDark', box(0.19, 0.014, 0.018), x0 + 0.17, gy - 0.08 + i * 0.04, z1 - 0.014, 0.5);
  P.add('turretDetail', cylZ(0.10, 0.016, 20), x1 - 0.17, gy, z1 - 0.008);
  P.add('turretDark', cylZ(0.072, 0.02, 20), x1 - 0.17, gy, z1 - 0.012);
  for (const x of [x0 + 0.12, x1 - 0.12]) P.add('turretDetail', box(0.10, 0.02, 0.025), x, y1 - 0.07, z1 - 0.014);
  P.add('turretDark', cylY(0.04, 0.04, 0.20, 12), x0 + 0.10, y1 + 0.10, z1 + 0.10);
  P.add('turretDark', box(0.12, 0.03, 0.05), x0 + 0.10, y1 + 0.215, z1 + 0.10);
}

/** The call-sign plate on the rear rails right of the TMAPU, the tank's number on it. */
function callSignPlate(P: TankBuilderPort): void {
  const x = 0.55, y = (RACK.low + RACK.mid) / 2, z = RACK.rear - 0.03;
  P.add('turret', box(0.46, 0.26, 0.012), x, y, z);
  P.decal('turret', 'number', '', 0.17, [x, y, z - 0.008], Math.PI);
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
  callSignPlate(P);
  P.turretG.userData.ausAbramsReceipt = { base: 'm1a1', tmapu: 'rack-left-rear', rackExtensionM: RACK.front - RACK.rear,
    rackTiers: 2, callSignPlate: true };
  // the owner, 2026-11-02: "a lot of ghillie on them and on their barrels" (ghillieFleetSuits.ts m1a1_aim_sa_aus)
  addVehicleGhillieSuit(P);
}
