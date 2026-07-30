// British family procedural profiles (fidelity oracles: recovered
// chieftain5/challenger1/fv510/centurion/comet/charioteer GLBs).
// Owned by the UK family agent — no other module registers these ids.
import { KIT, CLASSIC, WW2, buildTurretAndGun } from './kit.js';

function chieftain5Kit(P) {
  const { box } = KIT;
  // Mk.5 roof fit and rear stowage, on the already detailed Chieftain
  // hull/turret/suspension. The Mk.10 Stillbrew face is deliberately
  // softened by a broad cast mantlet surround rather than another box.
  P.add('turret', KIT.lathe([[0.58, 0], [0.78, 0.18], [0.66, 0.54], [0.38, 0.72], [0.01, 0.74]], 24, 0.48), 0, 0.02, 0.45, Math.PI / 2, 0, 0);
  P.add('turretDetail', box(2.10, 0.04, 0.04), 0, 0.28, -1.72);
  for (let i = 0; i < 7; i++) P.add('turretDetail', box(0.025, 0.32, 0.025), -0.90 + i * 0.30, 0.30, -1.72);
}

function challenger1Kit(P) {
  const { box } = KIT;
  // Keep the highly detailed Challenger running gear, glacis, engine deck
  // and stepped skirts, but replace the CR2 upper assembly with the Mk.3's
  // lower, shorter, more rectangular Chobham turret and L11A5.
  P.clear('turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth', 'gun', 'gunDark', 'gunMount');
  P.turretG.position.set(0, 1.54, -0.22);
  P.gunG.position.set(0, 0.34, 0);
  buildTurretAndGun(P, {
    turret: 'western', turretWidth: 2.70, turretDepth: 3.30, turretHeight: 0.70,
    turretFront: 1.05, turretRear: -1.92, gunLength: 5.72, gunRadius: 0.078,
    mantletWidth: 0.50, mantletHeight: 0.44, pano: false, mg: true, smokeCount: 5,
    commanderX: 0.55, loaderX: -0.58, commanderZ: -0.52, antennaHeight: 0.78,
  });
  // Distinctive square side stowage bins and long rear basket.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.15, 0.42, 1.18), side * 1.41, 0.34, -1.02);
    P.add('turretDetail', box(0.035, 0.035, 1.48), side * 1.49, 0.44, -1.42);
  }
}

export const UK_PROFILES = {
  challenger1: { base: 'challenger2', kit: challenger1Kit },
  chieftain5: { base: 'chieftain_mk10', kit: chieftain5Kit },
  fv510: {
    hull: 'warrior', width: 3.03, hullLength: 6.34, roofY: 1.78, trackTop: 0.77, trackW: 0.46,
    wheels: 6, wheelR: 0.34, wheelY: 0.43, wheelSpan: 4.72, frontSprocket: false, skirts: true,
    skirtHeight: 0.32, skirtY: 0.83, skirtLength: 5.48, skirtPanels: 6, rearDoor: true,
    turret: 'ifv', turretPivotY: 1.77, turretPivotZ: 0.12, turretWidth: 1.52, turretDepth: 1.72,
    turretHeight: 0.48, turretFront: 0.70, turretRear: -1.02, gunY: 0.24, gunZ: 0.38,
    gunRadius: 0.035, gunLength: 2.05, sleeve: false, evac: null, pano: false, mg: false, smokeCount: 4,
  },
  centurion3: {
    ...CLASSIC, width: 3.38, hullLength: 7.56, roofY: 1.48, trackTop: 0.83, trackW: 0.57, wheels: 6,
    turretPivotY: 1.47, turretPivotZ: -0.12, turretWidth: 2.48, turretDepth: 3.12, turretHeight: 0.72,
    turretFront: 1.02, turretRear: -1.88, pano: false, gunY: 0.36, gunLength: 4.85,
  },
  centurion5: {
    ...CLASSIC, width: 3.38, hullLength: 7.56, roofY: 1.48, trackTop: 0.83, trackW: 0.57, wheels: 6,
    turretPivotY: 1.47, turretPivotZ: -0.12, turretWidth: 2.52, turretDepth: 3.18, turretHeight: 0.74,
    turretFront: 1.04, turretRear: -1.92, pano: false, gunY: 0.37, gunLength: 5.25,
  },
  comet: { ...WW2, width: 3.04, hullLength: 6.55, roofY: 1.46, trackW: 0.50, wheels: 5, turret: 'western', turretWidth: 2.05, turretDepth: 2.35, turretHeight: 0.68, turretFront: 0.82, turretRear: -1.28, gunLength: 4.10, gunRadius: 0.052 },
  challenger_cruiser: { ...WW2, width: 2.91, hullLength: 8.15, roofY: 1.48, trackW: 0.47, wheels: 5, turret: 'western', turretWidth: 2.02, turretDepth: 2.32, turretHeight: 0.72, turretFront: 0.84, turretRear: -1.25, gunLength: 4.25, gunRadius: 0.052 },
  charioteer: { ...CLASSIC, width: 3.05, hullLength: 6.55, roofY: 1.46, trackW: 0.50, wheels: 5, turret: 'western', turretWidth: 2.08, turretDepth: 2.52, turretHeight: 0.82, turretFront: 0.88, turretRear: -1.38, pano: false },
};
