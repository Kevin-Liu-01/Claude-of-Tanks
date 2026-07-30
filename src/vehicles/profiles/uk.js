// British family procedural profiles (fidelity oracles: recovered
// chieftain5/challenger1/fv510/centurion/comet/charioteer GLBs).
// Owned by the UK family agent — no other module registers these ids.
import { KIT, CLASSIC, buildProfile, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Cromwell-family chassis (Comet / Charioteer / A30 Challenger): boxy pannier
// hull with near-vertical driver's plate, flat full-length track guards and
// exposed Christie gear — big solid road wheels, no return rollers, idler and
// sprocket horns poking past both hull ends. Original primitive construction
// sized against the recovered m_bergman print hulls and real dimensions.
// ---------------------------------------------------------------------------
function cromwellHull(P, o) {
  const { box, frustum, buildRunningGear, headlight, towCable } = KIT;
  const width = o.width, length = o.hullLength, halfL = length / 2;
  const roofY = o.roofY, bandY = o.bandY, trackW = o.trackW;
  const innerW = width - trackW * 2.1;

  // lower hull between the tracks
  P.add('hull', box(innerW, bandY - 0.14, length * 0.985), 0, 0.24 + (bandY - 0.14) / 2, 0);
  // full-length pannier band: vertical sides, vertical driver's plate, flat deck
  P.add('hull', box(width * 0.985, roofY - bandY, length), 0, (roofY + bandY) / 2, 0);
  // short lower glacis from the toe up to the band bottom
  P.add('hull', frustum(width * 0.44, halfL * 0.995, halfL * 0.86, width * 0.44, halfL * 0.90, halfL * 0.86, 0.30, bandY + 0.03));
  // rear lower plate closing to the floor
  P.add('hull', frustum(width * 0.44, -halfL * 0.86, -halfL * 0.92, width * 0.44, -halfL * 0.86, -halfL * 0.995, 0.32, bandY + 0.03));

  // deck furniture: driver's hatch, engine access, fuel fillers, louvres
  P.add('hullDetail', box(0.62, 0.035, 0.55), width * 0.24, roofY + 0.02, halfL * 0.62);
  P.add('hullDark', box(0.44, 0.02, 0.05), width * 0.24, roofY + 0.035, halfL * 0.55);
  P.add('hullDetail', box(width * 0.55, 0.03, length * 0.20), 0, roofY + 0.02, -halfL * 0.42);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(width * 0.48, 0.018, 0.05), 0, roofY + 0.04, -halfL * (0.28 + i * 0.09));
  P.add('hullDark', box(width * 0.30, 0.16, 0.03), 0, roofY - 0.30, -halfL * 0.99);   // rear exhaust plate
  // hull MG ball (right bow) + driver's visor
  P.add('hullDetail', KIT.sph(0.11, 12), width * 0.24, roofY - 0.16, halfL * 0.985);
  P.add('hullDark', box(0.34, 0.10, 0.03), -width * 0.22, roofY - 0.14, halfL * 0.995);

  // flat full-length track guards with front/rear droops
  for (const s of [-1, 1]) {
    const gx = s * (width / 2 - trackW / 2);
    P.add('hullDetail', box(trackW * 1.12, 0.035, length * 1.02), gx, bandY + 0.02, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.42), gx, bandY - 0.05, halfL * 1.06, -0.28, 0, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.40), gx, bandY - 0.04, -halfL * 1.05, 0.26, 0, 0);
    // pannier stowage boxes over the guards
    P.add('hull', box(trackW * 0.9, 0.20, length * 0.22), gx, roofY - 0.02, halfL * 0.30);
    P.add('hull', box(trackW * 0.9, 0.20, length * 0.20), gx, roofY - 0.02, -halfL * 0.40);
  }
  headlight(P, -width * 0.30, roofY + 0.06, halfL * 0.97, -0.2);
  headlight(P, width * 0.30, roofY + 0.06, halfL * 0.97, -0.2);
  towCable(P, [[-width * 0.30, roofY + 0.02, halfL * 0.30], [0, roofY + 0.02, halfL * 0.55], [width * 0.30, roofY + 0.02, halfL * 0.30]]);

  // Christie run: solid dished wheels, bare top run under the guards
  const wheelZs = evenStations(o.wheels, o.wheelSpan);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.82, wheelR: o.wheelR, wheelW: Math.min(0.24, trackW * 0.42),
    wheelY: o.wheelR + 0.06, xc: width / 2 - trackW / 2, wheelZs,
    sprocket: { z: -halfL * 0.94, y: o.hornY ?? 0.56, r: o.wheelR * 0.72 },
    idler: { z: halfL * 0.94, y: o.hornY ?? 0.56, r: o.wheelR * 0.72 },
    rollers: [],
    trackW, topY: bandY - 0.07, paintedEnds: true, coveredTop: true, arms: false,
  });
  return { width, length, halfL, roofY };
}

// Comet A34: low welded turret, curved cast front, rear radio bustle,
// 77 mm HV with a flat double-baffle muzzle brake.
function cometBuild(P, o) {
  const { box, polyTurret, cylY, cylZ, cupola, periscope, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.12);
  P.gunG.position.set(0, 0.42, 0.30);
  const h = 0.82;
  P.add('turret', polyTurret([
    [-0.32, 1.02], [0.32, 1.02], [0.80, 0.68], [1.02, 0.12], [0.96, -0.52], [0.70, -0.92],
    [-0.70, -0.92], [-0.96, -0.52], [-1.02, 0.12], [-0.80, 0.68],
  ], h, 1.05, 0.86));
  // curved cast face plate over the throat
  P.add('turret', cylY(0.52, 0.58, h * 0.94, 18, false, -0.9, 1.8), 0, h * 0.03, 0.58);
  // radio bustle overhanging the rear deck
  P.add('turret', box(1.58, h * 0.70, 0.68), 0, h * 0.33, -1.16);
  P.add('turretDark', box(1.40, 0.025, 0.56), 0, h * 0.74, -1.16);
  cupola(P, 'turret', -0.46, h - 0.02, -0.42, 0.24, 0.14, 6);
  P.add('turret', cylY(0.20, 0.20, 0.05, 12), 0.48, h, -0.38);
  periscope(P, 'turretDetail', 0.30, h + 0.04, 0.22);
  P.add('turretDetail', box(0.022, 0.85, 0.022), -0.85, h + 0.30, -0.85, 0, 0, -0.05);
  P.addGunExtra(box(0.56, 0.44, 0.20), 0, 0, 0.62);      // internal mantlet cheek plate
  P.addGunExtra(cylZ(0.11, 0.34, 12, 0.14), 0, 0, 0.80);
  buildGun(P, { len: o.gunLength, r: 0.055, brake: 'double', sleeve: false, evac: null, collar: false, baseR: 0.11 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, h * 0.42, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

// FV4101 Charioteer: tall angular two-tier welded turret on the Cromwell
// hull, slim long 20-pdr with a big forward overhang.
function charioteerBuild(P, o) {
  const { box, frustum, cylY, cylZ, cupola, periscope, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.18);
  P.gunG.position.set(0, 0.52, 0.35);
  // lower tier: wide slab base with sloped walls
  P.add('turret', frustum(1.04, 1.22, -1.30, 0.96, 1.02, -1.16, 0, 0.50));
  // upper tier: strongly sloped face and flanks closing to a narrow roof
  P.add('turret', frustum(0.96, 1.02, -1.16, 0.56, 0.34, -0.78, 0.50, 1.00));
  // flat sloped gun face plate + throat
  P.add('turret', box(0.78, 0.46, 0.14), 0, 0.56, 0.78, -0.35, 0, 0);
  P.add('turretDark', box(0.30, 0.05, 0.05), 0.42, 0.94, -0.10);
  cupola(P, 'turret', -0.34, 0.99, -0.52, 0.22, 0.12, 6);
  P.add('turret', cylY(0.19, 0.19, 0.05, 12), 0.40, 1.00, -0.45);
  periscope(P, 'turretDetail', 0.26, 1.05, 0.05);
  P.add('turretDetail', box(0.022, 0.90, 0.022), -0.88, 1.28, -0.95, 0, 0, -0.05);
  P.add('turretDetail', box(0.022, 0.90, 0.022), 0.88, 1.28, -0.95, 0, 0, 0.05);
  P.addGunExtra(box(0.46, 0.40, 0.22), 0, 0, 0.68);
  P.addGunExtra(cylZ(0.095, 0.42, 12, 0.13), 0, 0, 0.92);
  buildGun(P, { len: o.gunLength, r: 0.048, sleeve: false, evac: null, collar: false, baseR: 0.10 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, 0.28, -0.30], Math.PI / 2);
  P.topY = 1.25;
}

// A30 Challenger: the long six-wheel Cromwell chassis with the tall narrow
// 17-pdr turret; the gun barely clears the long nose.
function a30Build(P, o) {
  const { box, frustum, cylY, cylZ, cupola, periscope, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.30);
  P.gunG.position.set(0, 0.60, 0.35);
  const h = 1.12;
  // narrow tall shell, lightly sloped, with a rounded cast front
  P.add('turret', frustum(0.86, 1.02, -1.18, 0.78, 0.86, -1.06, 0, h));
  P.add('turret', cylY(0.56, 0.62, h * 0.96, 20, false, -1.1, 2.2), 0, h * 0.02, 0.52);
  P.add('turret', box(1.42, 0.30, 0.72), 0, 0.15, -0.95);   // rear bin shoulder
  cupola(P, 'turret', 0.02, h - 0.02, -0.55, 0.23, 0.12, 6);
  P.add('turret', cylY(0.18, 0.18, 0.05, 12), -0.44, h, 0.02);
  periscope(P, 'turretDetail', 0.30, h + 0.04, -0.05);
  P.add('turretDetail', box(0.022, 0.85, 0.022), 0.70, h + 0.28, -0.90, 0, 0, 0.05);
  P.addGunExtra(box(0.44, 0.42, 0.20), 0, 0, 0.55);
  P.addGunExtra(cylZ(0.09, 0.36, 12, 0.12), 0, 0, 0.76);
  buildGun(P, { len: o.gunLength, r: 0.046, sleeve: false, evac: null, collar: false, baseR: 0.10 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [0.86, h * 0.35, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

function chieftain5Kit(P) {
  const { box, cylZ, buildGun } = KIT;
  // Mk.5 on the detailed Chieftain donor. The old cast-dome lathe glued to
  // the turret face read as a Soviet mantlet blob in every quarter view and
  // is gone — the donor casting already has the needle-nose plan. The L11A5
  // is rebuilt at its real reach: reference oracle shows a 3.25 m overhang
  // past the hull nose (raw muzzle ≈ 7.16 with the nose plate at 3.74) and a
  // fat, fully thermal-sleeved tube.
  P.clear('gun', 'gunDark', 'gunMount');
  P.addGunExtra(cylZ(0.15, 0.55, 14, 0.22), 0, 0, 0.38);   // tapered cast collar
  P.addGunExtra(box(0.44, 0.44, 0.28), 0, 0, 0.10);
  buildGun(P, { len: 6.26, r: 0.10, sleeve: true, evac: 0.58, baseR: 0.17 });
  // The oracle's turret shoulders reach the full hull width — its flank bins
  // and camo-bundle racks sit proud OVER the tracks. Deep outboard bins with
  // lid seams close the big front/rear-view shoulder gap.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.60, 0.42, 1.90), side * 1.50, 0.34, -0.42, 0, side * 0.03, 0);
    P.add('turretDark', box(0.61, 0.02, 1.85), side * 1.50, 0.47, -0.42, 0, side * 0.03, 0);
    for (const zc of [0.30, -0.45, -1.15]) {
      P.add('turretDark', box(0.615, 0.43, 0.025), side * 1.505, 0.34, zc, 0, side * 0.03, 0);
    }
    // tall whip antennas (the reference masts reach ~1 m over the roof)
    P.add('turretDetail', box(0.022, 1.05, 0.022), side * (side > 0 ? 0.85 : 0.52), 1.30, side > 0 ? -1.2 : -0.5, 0, 0, side * 0.05);
  }
  // ground-level track mud flaps at all four corners (reference feet)
  for (const side of [-1, 1]) for (const [zc, tilt] of [[3.78, -0.10], [-3.86, 0.10]]) {
    P.add('hullRubber', box(0.56, 0.52, 0.045), side * 1.50, 0.42, zc, tilt, 0, 0);
  }
}

// FV510 Warrior: parametric warrior hull + ifv turret, plus the identity kit
// the oracle shows above the roofline — twin sight heads on the turret, the
// tall L-shaped exhaust/NBC stack on the right rear quarter and bow trim
// plates. RARDEN stays inside the hull length like the reference.
function fv510Build(P, o) {
  const { box, cylX } = KIT;
  buildProfile(P, o);
  // turret sight heads (gunner + commander) and RARDEN cheek armor
  P.add('turret', box(0.38, 0.34, 0.40), -0.46, 1.13, 0.34);
  P.add('turretGlass', box(0.26, 0.10, 0.03), -0.46, 1.17, 0.56);
  P.add('turret', box(0.34, 0.30, 0.36), 0.42, 1.11, -0.12);
  P.add('turretDark', box(0.17, 0.40, 0.62), -0.58, 0.62, 0.78);
  // hanging flank stowage plates + bustle rack (the oracle turret carries a
  // deep skirt of bins that drops below the hull roofline and overhangs the
  // hull sides)
  for (const side of [-1, 1]) {
    P.add('turret', box(0.20, 0.62, 1.45), side * (side > 0 ? 1.46 : 1.34), 0.20, -0.35, 0, side * 0.04, 0);
  }
  P.add('turret', box(1.95, 0.55, 0.45), 0, 0.24, -1.55);
  // comms mast (rear right)
  P.add('turretDetail', box(0.035, 1.40, 0.035), 0.98, 1.68, -1.18, 0, 0, 0.04);
  // low armoured muffler on the right rear deck (kept below the flank top)
  P.add('hull', box(0.24, 0.34, 1.00), 1.24, 2.30, -1.76);
  P.add('hullDark', box(0.18, 0.13, 0.22), 1.26, 2.36, -2.28);
  // wing mirrors low on both bow corners: the oracle's width bound is its
  // mirror tips, not the hull — matching arms keep both bodies at the same
  // normalized width instead of my hull rendering ~13% oversized.
  for (const side of [-1, 1]) {
    P.add('hullDetail', cylX(0.022, 0.24, 8), side * 1.60, 1.62, 2.60);
    P.add('hullDark', box(0.06, 0.26, 0.18), side * 1.72, 1.62, 2.60);
  }
  // bow trim vane plates
  P.add('hullDetail', box(0.62, 0.06, 0.55), -0.75, 1.55, 2.98, -0.5, 0, 0);
  P.add('hullDetail', box(0.62, 0.06, 0.55), 0.75, 1.55, 2.98, -0.5, 0, 0);
}

// Challenger 1 Mk.3: full parametric build sized against the recovered CR1
// oracle (hull ±3.69 normalized, hull top 1.69, skirt hem ~1.0 with all six
// wheels visible, L11A5 tip at 6.26, TOGS barbette on the roof right).
function challenger1Build(P, o) {
  const { box, cylY } = KIT;
  buildProfile(P, o);
  // TOGS thermal sight barbette on the roof right + louvred face
  P.add('turret', box(0.52, 0.46, 0.74), 0.72, 0.95, 0.10);
  P.add('turretDark', box(0.42, 0.30, 0.05), 0.72, 0.95, 0.49);
  P.add('turret', cylY(0.16, 0.16, 0.10, 12), -0.55, 0.82, -0.30);
  // Distinctive square side stowage bins along the turret flanks.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.15, 0.42, 1.18), side * 1.41, 0.34, -0.72);
    P.add('turretDetail', box(0.035, 0.035, 1.42), side * 1.49, 0.44, -1.02);
  }
}

export const UK_PROFILES = {
  challenger1: {
    build: challenger1Build,
    hull: 'western', width: 3.52, hullLength: 7.44, roofY: 1.66, trackTop: 1.02, trackW: 0.62,
    wheels: 6, wheelR: 0.41, wheelY: 0.50, wheelSpan: 5.15, skirts: true, skirtY: 1.24,
    skirtHeight: 0.50, skirtLength: 6.40, skirtPanels: 6,
    turret: 'western', turretPivotY: 1.63, turretPivotZ: -0.18, turretWidth: 2.80,
    turretDepth: 3.30, turretHeight: 0.78, turretFront: 1.30, turretRear: -1.55,
    gunY: 0.10, gunZ: 0, gunLength: 6.62, gunRadius: 0.088, mantletWidth: 0.54,
    mantletHeight: 0.58, pano: false, mg: true, smokeCount: 5,
    commanderX: 0.55, loaderX: -0.58, commanderZ: -0.52, antennaHeight: 1.05,
  },
  chieftain5: { base: 'chieftain_mk10', kit: chieftain5Kit },
  // FV510 Warrior sized to its recovered oracle: a SHORT (±2.83 normalized)
  // but very TALL (flank top 2.30) troop hull, big forward two-man turret
  // (pivot z ≈ +0.9), thin RARDEN that never clears the nose, and the tall
  // right-rear exhaust stack.
  fv510: {
    build: fv510Build,
    hull: 'warrior', width: 3.03, hullLength: 6.38, roofY: 2.40, trackTop: 1.00, trackW: 0.52,
    wheels: 6, wheelR: 0.40, wheelY: 0.51, wheelSpan: 4.88, frontSprocket: true, skirts: true,
    skirtHeight: 0.82, skirtY: 1.18, skirtLength: 5.56, skirtPanels: 6, rearDoor: true,
    turret: 'ifv', turretPivotY: 2.02, turretPivotZ: 0.93, turretWidth: 2.62, turretDepth: 2.50,
    turretHeight: 1.16, turretFront: 1.08, turretRear: -1.42, gunX: -0.48, gunY: 0.30, gunZ: 0.40,
    gunRadius: 0.038, gunLength: 1.85, sleeve: false, evac: null, pano: false, mg: false,
    smokeCount: 4, antennaHeight: 1.10,
  },
  // Centurion chassis pair: hull band raised to the oracle's 1.74 fender line
  // with the signature full-length armoured skirts over the Horstmann run.
  // Guns carry their real forward reach (trunnions sit ~0.55 ahead of the
  // ring): 20-pdr ≈ 2.3 m overhang, L7 with evacuator ≈ 2.2 m.
  centurion3: {
    ...CLASSIC, width: 3.38, hullLength: 7.56, roofY: 1.70, trackTop: 0.88, trackW: 0.57, wheels: 6,
    wheelR: 0.40, wheelY: 0.50, skirts: true, skirtY: 1.04, skirtHeight: 0.60, skirtLength: 6.60,
    skirtPanels: 6, turretPivotY: 1.69, turretPivotZ: -0.12, turretWidth: 2.52, turretDepth: 3.30,
    turretHeight: 0.76, turretFront: 1.06, turretRear: -2.02, pano: false,
    gunY: 0.34, gunZ: 0.55, gunLength: 5.60, gunRadius: 0.048, sleeve: false, evac: null,
  },
  centurion5: {
    ...CLASSIC, width: 3.38, hullLength: 7.56, roofY: 1.70, trackTop: 0.88, trackW: 0.57, wheels: 6,
    wheelR: 0.40, wheelY: 0.50, skirts: true, skirtY: 1.04, skirtHeight: 0.60, skirtLength: 6.60,
    skirtPanels: 6, turretPivotY: 1.69, turretPivotZ: -0.12, turretWidth: 2.56, turretDepth: 3.36,
    turretHeight: 0.78, turretFront: 1.08, turretRear: -2.06, pano: false,
    gunY: 0.35, gunZ: 0.55, gunLength: 5.45, gunRadius: 0.053, sleeve: false, evac: 0.62,
  },
  comet: {
    build: cometBuild, width: 3.05, hullLength: 6.32, roofY: 1.64, bandY: 0.96, trackW: 0.46,
    wheels: 5, wheelR: 0.45, wheelSpan: 4.40, gunLength: 4.42,
  },
  challenger_cruiser: {
    build: a30Build, width: 2.91, hullLength: 6.10, roofY: 1.56, bandY: 0.92, trackW: 0.44,
    wheels: 6, wheelR: 0.41, wheelSpan: 4.75, gunLength: 3.30,
  },
  charioteer: {
    build: charioteerBuild, width: 3.05, hullLength: 5.66, roofY: 1.60, bandY: 0.94, trackW: 0.46,
    wheels: 5, wheelR: 0.44, wheelSpan: 4.00, gunLength: 5.45,
  },
};
