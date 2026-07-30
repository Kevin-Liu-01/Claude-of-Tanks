// Leopard 2 lineage + KF51 procedural profiles (fidelity oracles:
// leo2a6_buh, leo2a4_bergman, recovered leo2_revolution, leo2a5, leo2a7v,
// leopard2_proto). Owned by the Leopard family agent.
import { KIT, WESTERN, LEOPARD } from './kit.js';

function leo2RevolutionKit(P) {
  const { box, cylY } = KIT;
  // AMAP package over the A4: full-depth faceted turret cheeks/bustle,
  // modular hull-side arrays and the characteristic raised roof station.
  for (const side of [-1, 1]) {
    P.add('turret', KIT.slab(
      [side * 0.22, 0.04, 1.20], [side * 1.58, 0.04, 0.68], [side * 1.62, 0.04, -1.72], [side * 0.48, 0.04, -2.08],
      [side * 0.20, 0.84, 0.76], [side * 1.43, 0.74, 0.25], [side * 1.48, 0.72, -1.80], [side * 0.44, 0.88, -2.08]));
    for (let i = 0; i < 6; i++) P.add('hull', box(0.15, 0.68, 0.92), side * 1.94, 0.79, 2.52 - i * 0.98, 0, 0, side * 0.035);
    P.add('turretDetail', box(0.05, 0.05, 1.55), side * 1.58, 0.40, -1.20);
  }
  P.add('hull', KIT.frustum(1.70, 3.82, 2.55, 1.55, 3.68, 2.72, 1.15, 1.50));
  P.add('turretDetail', cylY(0.18, 0.21, 0.12, 16), 0.56, 1.02, -0.55);
  P.add('turretDetail', box(0.34, 0.28, 0.38), 0.56, 1.20, -0.55);
}

function leo2a5Kit(P) {
  // A5 keeps the arrowhead A6 turret but the shorter L/44 cannon.
  P.clear('gun', 'gunDark');
  KIT.buildGun(P, { len: 5.30, r: 0.079, sleeve: true, evac: 0.58, collar: true, baseR: 0.16 });
}

function leo2a7vKit(P) {
  const { box } = KIT;
  // A7V: added frontal hull module, deeper side protection and enlarged
  // rear hull cooling/APU housings. Keep the full L/55A1 A7 turret.
  P.add('hull', KIT.frustum(1.74, 3.90, 2.62, 1.60, 3.76, 2.76, 1.12, 1.56));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) P.add('hull', box(0.13, 0.74, 0.80), side * 1.98, 0.78, 2.86 - i * 0.90, 0, 0, side * 0.025);
    P.add('hullDetail', box(0.28, 0.62, 0.74), side * 1.72, 1.16, -3.30);
  }
  P.add('hullDark', box(2.48, 0.56, 0.05), 0, 1.15, -3.84);
}

export const LEOPARD_PROFILES = {
  kf51: { ...LEOPARD, width: 3.60, hullLength: 7.70, roofY: 1.72, trackW: 0.64, turretWidth: 2.45, turretDepth: 3.45, turretHeight: 0.72, turretFront: 1.18, turretRear: -1.96, gunLength: 6.63, gunRadius: 0.085, pano: true },
  leo2a6: { ...LEOPARD, width: 3.08, hullLength: 7.72, roofY: 1.78, trackW: 0.57, turretWidth: 2.30, turretDepth: 3.20, turretHeight: 0.72, turretFront: 1.10, turretRear: -1.80, gunLength: 6.25, gunRadius: 0.079, antennaHeight: 0.88, pano: true },
  leo2_revolution: { base: 'leo2a4', kit: leo2RevolutionKit },
  leo2a5: { base: 'leo2a6', kit: leo2a5Kit },
  leo2a7v: { base: 'leo2a7', kit: leo2a7vKit },
  leopard2_proto: { ...WESTERN, width: 3.55, hullLength: 7.65, roofY: 1.58, trackW: 0.61, turret: 'cast', turretWidth: 2.55, turretDepth: 2.95, turretHeight: 0.68, pano: false },
};
