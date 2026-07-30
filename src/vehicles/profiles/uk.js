// British family procedural profiles (fidelity oracles: recovered
// chieftain5/challenger1/fv510/centurion/comet/charioteer GLBs).
// Owned by the UK family agent — no other module registers these ids.
import { KIT, CLASSIC, buildProfile, buildHull, evenStations, addSegmentedSkirts } from './kit.js';

// ---------------------------------------------------------------------------
// Cromwell-family chassis (Comet / Charioteer / A30 Challenger): boxy pannier
// hull with near-vertical driver's plate, flat full-length track guards and
// exposed Christie gear — big solid road wheels, no return rollers, idler and
// sprocket horns poking past both hull ends. Original primitive construction
// sized against the recovered m_bergman print hulls and real dimensions.
// ---------------------------------------------------------------------------
function cromwellHull(P, o) {
  const { box, cylX, cylY, cylZ, sph, torus, frustum, buildRunningGear, headlight, periscope } = KIT;
  const width = o.width, length = o.hullLength, halfL = length / 2;
  const roofY = o.roofY, bandY = o.bandY, trackW = o.trackW;
  const innerW = width - trackW * 2.1;
  const bandW = width * 0.94;                       // pannier band inset over the guards

  // lower hull between the tracks
  P.add('hull', box(innerW, bandY - 0.14, length * 0.985), 0, 0.24 + (bandY - 0.14) / 2, 0);
  // full-length pannier band: vertical sides, vertical driver's plate, flat deck
  P.add('hull', box(bandW, roofY - bandY, length), 0, (roofY + bandY) / 2, 0);
  // short lower glacis from the toe up to the band bottom
  P.add('hull', frustum(width * 0.44, halfL * 0.995, halfL * 0.86, width * 0.44, halfL * 0.90, halfL * 0.86, 0.30, bandY + 0.03));
  // rear lower plate closing to the floor
  P.add('hull', frustum(width * 0.44, -halfL * 0.86, -halfL * 0.92, width * 0.44, -halfL * 0.86, -halfL * 0.995, 0.32, bandY + 0.03));

  // riveted plate seams: the Cromwell family hull is a bolted composite —
  // seam strips + rivet dots break the "single tall plate" pannier read
  for (const s of [-1, 1]) {
    const px = s * (bandW / 2 + 0.006);
    P.add('hullDark', box(0.012, 0.016, length * 0.94), px, roofY - 0.055, 0);
    P.add('hullDark', box(0.012, 0.016, length * 0.94), px, bandY + 0.10, 0);
    for (let i = 0; i < 12; i++) {
      P.add('hullDark', cylX(0.016, 0.024, 6), s * (bandW / 2 + 0.007), roofY - 0.13,
        -halfL * 0.90 + i * (length * 0.90 / 11));
    }
    for (const zc of [halfL * 0.46, -halfL * 0.28]) {
      P.add('hullDark', box(0.012, roofY - bandY - 0.14, 0.016), px, (roofY + bandY) / 2, zc);
    }
  }

  // deck: driver's hatch + RAISED louvred engine bank + fillers + intake
  P.add('hullDetail', box(0.62, 0.035, 0.55), width * 0.24, roofY + 0.02, halfL * 0.62);
  P.add('hullDark', box(0.44, 0.02, 0.05), width * 0.24, roofY + 0.035, halfL * 0.55);
  P.add('hull', box(width * 0.58, 0.075, length * 0.245), 0, roofY + 0.03, -halfL * 0.42);
  for (let i = 0; i < 6; i++) {
    const z = -halfL * 0.42 + (2.5 - i) * length * 0.036;
    P.add('hullDark', box(width * 0.50, 0.022, 0.048), 0, roofY + 0.062, z);
    P.add('hullDetail', box(width * 0.53, 0.024, 0.040), 0, roofY + 0.080, z + 0.028, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.05, 10), s * width * 0.30, roofY + 0.045, -halfL * 0.16);
  P.add('hullDetail', cylY(0.075, 0.095, 0.09, 10), -width * 0.24, roofY + 0.05, halfL * 0.36);  // intake mushroom
  P.add('hullDetail', cylY(0.12, 0.085, 0.035, 10), -width * 0.24, roofY + 0.11, halfL * 0.36);

  // twin exhaust cowls with fishtail ducts on the rear deck (Cromwell cue)
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.105, 0.72, 12), s * 0.52, roofY + 0.045, -halfL * 0.74);
    P.add('hullDetail', box(0.26, 0.05, 0.30), s * 0.52, roofY + 0.01, -halfL * 0.925, 0.55, 0, 0);
    P.add('hullDark', box(0.22, 0.022, 0.06), s * 0.52, roofY - 0.065, -halfL * 0.985, 0.55, 0, 0);
  }
  P.add('hullDark', box(width * 0.30, 0.16, 0.03), 0, roofY - 0.30, -halfL * 0.99);   // rear exhaust plate

  // bow: framed driver's visor with hinges (+ Besa MG ball in a ring housing
  // — a real ball + dark barrel stub, not a painted dot)
  P.add('hullDetail', box(0.42, 0.18, 0.05), -width * 0.20, roofY - 0.14, halfL * 0.99);
  P.add('hullDark', box(0.34, 0.055, 0.03), -width * 0.20, roofY - 0.13, halfL * 1.003);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.07, 0.045, 0.05), -width * 0.20 + s * 0.16, roofY - 0.035, halfL * 0.995);
  if (o.mgBall !== false) {
    P.add('hullDetail', cylZ(0.135, 0.06, 14), width * 0.20, roofY - 0.16, halfL * 0.99);
    P.add('hullDetail', sph(0.105, 12), width * 0.20, roofY - 0.16, halfL * 0.995);
    P.add('hullDark', cylZ(0.024, 0.22, 8), width * 0.20, roofY - 0.145, halfL * 1.02);
  } else {
    P.add('hullDetail', box(0.30, 0.16, 0.04), width * 0.20, roofY - 0.15, halfL * 0.99);
    periscope(P, 'hullDetail', width * 0.20, roofY + 0.045, halfL * 0.90);
  }
  periscope(P, 'hullDetail', -width * 0.20, roofY + 0.045, halfL * 0.90);   // driver hood

  // flat full-length track guards with front/rear droops
  for (const s of [-1, 1]) {
    const gx = s * (width / 2 - trackW / 2);
    P.add('hullDetail', box(trackW * 1.12, 0.035, length * 1.02), gx, bandY + 0.02, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.42), gx, bandY - 0.05, halfL * 1.06, -0.28, 0, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.40), gx, bandY - 0.04, -halfL * 1.05, 0.26, 0, 0);
    // boxed step at the pannier shoulder + 2 proud stowage bins per side
    P.add('hullDetail', box(trackW * 0.82, 0.09, 0.30), gx, bandY + 0.08, halfL * 0.56);
    for (const [zc, len2] of [[halfL * 0.28, length * 0.20], [-halfL * 0.42, length * 0.18]]) {
      P.add('hull', box(trackW * 0.92, 0.22, len2), gx + s * 0.03, roofY - 0.03, zc);
      P.add('hullDark', box(trackW * 0.92 + 0.012, 0.018, len2 - 0.06), gx + s * 0.03, roofY + 0.075, zc);
      for (const f of [-0.30, 0.30]) {
        P.add('hullDark', box(trackW * 0.94, 0.23, 0.022), gx + s * 0.035, roofY - 0.03, zc + f * len2);
      }
    }
    // headlight on a stalk at the mudguard tip
    P.add('hullDetail', cylY(0.018, 0.018, 0.14, 8), s * width * 0.40, bandY + 0.10, halfL * 1.00);
    headlight(P, s * width * 0.40, bandY + 0.19, halfL * 1.00, -0.12);
  }
  // bow tow shackles (the old deck tow cable ended in mid-air — deleted)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.09, 0.14), s * width * 0.28, 0.50, halfL * 0.945);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * width * 0.28, 0.50, halfL * 1.000, Math.PI / 2, 0, 0);
  }

  // Christie run: perforated dished wheels with rubber tires + bolt hubs
  const wheelZs = evenStations(o.wheels, o.wheelSpan);
  buildRunningGear(P, {
    style: 'holes', wheelR: o.wheelR, wheelW: Math.min(0.24, trackW * 0.42),
    wheelY: o.wheelR + 0.06, xc: width / 2 - trackW / 2, wheelZs,
    sprocket: { z: -halfL * 0.94, y: o.hornY ?? 0.56, r: o.wheelR * 0.72 },
    idler: { z: halfL * 0.94, y: o.hornY ?? 0.56, r: o.wheelR * 0.72 },
    rollers: o.rollers || [],
    trackW, topY: bandY - 0.07, paintedEnds: true, coveredTop: true, arms: false,
  });
  return { width, length, halfL, roofY };
}

// Comet A34: low welded turret, curved cast front, rear radio bustle,
// 77 mm HV with a flat double-baffle muzzle brake.
function cometBuild(P, o) {
  const { box, polyTurret, cylY, cylZ, cupola, periscope, liftEye, smokeCluster, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.12);
  // 77 mm HV seated at the FACE CENTER (r1 critique: tube exited at the
  // turret/hull seam) in the big bolted internal mantlet plate.
  P.gunG.position.set(0, 0.50, 0.30);
  const h = 0.82;
  P.add('turret', polyTurret([
    [-0.32, 1.02], [0.32, 1.02], [0.80, 0.68], [1.02, 0.12], [0.96, -0.52], [0.70, -0.92],
    [-0.70, -0.92], [-0.96, -0.52], [-1.02, 0.12], [-0.80, 0.68],
  ], h, 1.05, 0.86));
  // curved cast face plate over the throat
  P.add('turret', cylY(0.52, 0.58, h * 0.94, 18, false, -0.9, 1.8), 0, h * 0.03, 0.58);
  // radio bustle overhanging the rear deck, read as a strapped bin
  P.add('turret', box(1.58, h * 0.70, 0.68), 0, h * 0.33, -1.16);
  P.add('turretDark', box(1.40, 0.025, 0.56), 0, h * 0.74, -1.16);
  for (const xr of [-0.45, 0.45]) P.add('turretDark', box(0.025, h * 0.66, 0.69), xr, h * 0.33, -1.165);
  cupola(P, 'turret', -0.46, h - 0.02, -0.42, 0.24, 0.14, 6);
  P.add('turretDark', KIT.torus(0.27, 0.018, 16), -0.46, h + 0.155, -0.42);   // cupola vision ring
  P.add('turret', cylY(0.20, 0.20, 0.05, 12), 0.48, h, -0.38);                // loader hatch
  P.add('turretDark', box(0.32, 0.014, 0.03), 0.48, h + 0.035, -0.38);        // split-hatch seam
  periscope(P, 'turretDetail', 0.30, h + 0.04, 0.22);
  liftEye(P, 'turretDetail', -0.72, h + 0.01, 0.42, 0.5);
  liftEye(P, 'turretDetail', 0.72, h + 0.01, 0.42, -0.5);
  liftEye(P, 'turretDetail', -0.62, h + 0.01, -0.80, 2.6);
  liftEye(P, 'turretDetail', 0.62, h + 0.01, -0.80, -2.6);
  // smoke discharger cluster on the RIGHT cheek, proud on a bracket
  P.add('turretDetail', box(0.05, 0.14, 0.26), 0.86, h * 0.42, 0.48, 0, 0.6, 0);
  smokeCluster(P, 0.95, h * 0.52, 0.55, 5, 0.95, 0.65);
  P.add('turretDetail', box(0.022, 0.85, 0.022), -0.85, h + 0.30, -0.85, 0, 0, -0.05);
  // bolted internal mantlet: wide plate with a bolt ring, coax + sight ports
  P.addGunExtra(box(0.74, 0.58, 0.12), 0, 0, 0.52);
  for (const [bx, by] of [[-0.30, 0.21], [0, 0.24], [0.30, 0.21], [-0.30, -0.21], [0, -0.24],
    [0.30, -0.21], [-0.34, 0], [0.34, 0]]) {
    P.addGunExtraDark(cylZ(0.021, 0.03, 6), bx, by, 0.585);
  }
  P.addGunExtraDark(cylZ(0.032, 0.14, 8), 0.24, 0.10, 0.56);                  // coax Besa port
  P.addGunExtraDark(cylZ(0.026, 0.12, 8), -0.24, 0.12, 0.56);                 // sight port
  P.addGunExtra(cylZ(0.115, 0.30, 12, 0.145), 0, 0, 0.72);
  buildGun(P, { len: o.gunLength, r: 0.055, brake: 'double', sleeve: false, evac: null, collar: false, baseR: 0.11 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, h * 0.42, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

// FV4101 Charioteer: tall angular two-tier welded turret on the Cromwell
// hull, slim long 20-pdr with a big forward overhang.
function charioteerBuild(P, o) {
  const { box, frustum, cylY, cylZ, cupola, periscope, liftEye, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.18);
  // 20-pdr re-seated at the upper-tier face CENTER (r1 critique: it emerged
  // from the tier seam) behind a narrow internal mantlet.
  P.gunG.position.set(0, 0.64, 0.35);
  // lower tier: wide slab base with sloped walls
  P.add('turret', frustum(1.04, 1.22, -1.30, 0.96, 1.02, -1.16, 0, 0.50));
  // upper tier: strongly sloped face and flanks closing to a narrow roof
  P.add('turret', frustum(0.96, 1.02, -1.16, 0.56, 0.34, -0.78, 0.50, 1.00));
  // flat sloped gun face plate + throat
  P.add('turret', box(0.78, 0.46, 0.14), 0, 0.56, 0.78, -0.35, 0, 0);
  P.add('turretDark', box(0.30, 0.05, 0.05), 0.42, 0.94, -0.10);
  cupola(P, 'turret', -0.34, 0.99, -0.52, 0.22, 0.12, 6);
  P.add('turretDark', KIT.torus(0.25, 0.016, 16), -0.34, 1.145, -0.52);      // cupola vision ring
  P.add('turret', cylY(0.19, 0.19, 0.05, 12), 0.40, 1.00, -0.45);            // loader hatch
  P.add('turretDark', box(0.30, 0.014, 0.03), 0.40, 1.035, -0.45);           // split seam
  periscope(P, 'turretDetail', 0.26, 1.05, 0.05);
  liftEye(P, 'turretDetail', -0.82, 0.53, 0.85, 0.5);
  liftEye(P, 'turretDetail', 0.82, 0.53, 0.85, -0.5);
  liftEye(P, 'turretDetail', -0.70, 1.02, -0.72, 2.6);
  liftEye(P, 'turretDetail', 0.70, 1.02, -0.72, -2.6);
  // smoke discharger boxes low on both cheeks (British 2" multibarrel)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.24, 0.13, 0.10), s * 0.80, 0.30, 0.92, 0, s * 0.35, 0);
    for (const k of [-1, 0, 1]) {
      P.add('turretDark', cylZ(0.028, 0.16, 8), s * 0.80 + k * 0.065, 0.38, 0.96, -0.45, s * 0.35, 0);
    }
  }
  // bustle stowage bin resting on the lower-tier roof
  P.add('turret', box(1.15, 0.28, 0.42), 0, 0.645, -1.32);
  P.add('turretDark', box(1.03, 0.018, 0.36), 0, 0.79, -1.32);
  for (const xr of [-0.34, 0.34]) P.add('turretDark', box(0.022, 0.29, 0.43), xr, 0.645, -1.325);
  P.add('turretDetail', box(0.022, 0.90, 0.022), -0.88, 1.28, -0.95, 0, 0, -0.05);
  P.add('turretDetail', box(0.022, 0.90, 0.022), 0.88, 1.28, -0.95, 0, 0, 0.05);
  // narrow internal mantlet + recoil collar; Type B 20-pdr carries a
  // mid-tube fume extractor and a muzzle counterweight collar
  P.addGunExtra(box(0.50, 0.44, 0.12), 0, 0, 0.62);
  for (const [bx, by] of [[-0.20, 0.16], [0.20, 0.16], [-0.20, -0.16], [0.20, -0.16]]) {
    P.addGunExtraDark(cylZ(0.019, 0.03, 6), bx, by, 0.685);
  }
  P.addGunExtra(cylZ(0.095, 0.42, 12, 0.125), 0, 0, 0.86);
  buildGun(P, { len: o.gunLength, r: 0.048, sleeve: false, evac: 0.52, evacR: 1.75, collar: true, baseR: 0.10 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, 0.28, -0.30], Math.PI / 2);
  P.topY = 1.25;
}

// A30 Challenger: the long six-wheel Cromwell chassis with the tall narrow
// 17-pdr turret; the gun barely clears the long nose.
function a30Build(P, o) {
  const { box, cylX, frustum, cylY, cylZ, cupola, periscope, liftEye, buildGun } = KIT;
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, -0.30);
  P.gunG.position.set(0, 0.60, 0.35);
  const h = 1.12;
  // narrow tall shell, lightly sloped, with a rounded cast front
  P.add('turret', frustum(0.86, 1.02, -1.18, 0.78, 0.86, -1.06, 0, h));
  P.add('turret', cylY(0.56, 0.62, h * 0.96, 20, false, -1.1, 2.2), 0, h * 0.02, 0.52);
  // rear bin shoulder read as a strapped stowage bin
  P.add('turret', box(1.42, 0.30, 0.72), 0, 0.15, -0.95);
  P.add('turretDark', box(1.30, 0.018, 0.62), 0, 0.31, -0.95);
  for (const xr of [-0.42, 0.42]) P.add('turretDark', box(0.022, 0.31, 0.73), xr, 0.15, -0.955);
  // pistol port discs on both flanks + corner lifting lugs
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylX(0.085, 0.035, 12), s * 0.83, h * 0.48, -0.18);
    P.add('turretDark', cylX(0.032, 0.04, 8), s * 0.835, h * 0.48, -0.18);
    liftEye(P, 'turretDetail', s * 0.62, h + 0.01, 0.55, s * -0.5);
    liftEye(P, 'turretDetail', s * 0.58, h + 0.01, -0.85, s * -2.6);
  }
  cupola(P, 'turret', 0.02, h - 0.02, -0.55, 0.23, 0.12, 6);
  P.add('turretDark', KIT.torus(0.26, 0.016, 16), 0.02, h + 0.135, -0.55);   // vision-block ring
  P.add('turret', cylY(0.18, 0.18, 0.05, 12), -0.44, h, 0.02);               // loader hatch
  P.add('turretDark', box(0.28, 0.014, 0.03), -0.44, h + 0.035, 0.02);       // split seam
  periscope(P, 'turretDetail', 0.30, h + 0.04, -0.05);
  P.add('turretDetail', box(0.022, 0.85, 0.022), 0.70, h + 0.28, -0.90, 0, 0, 0.05);
  // 17-pdr: narrow internal mantlet slot, recoil housing collar, then the
  // slim tube with a visible sleeve step (oracle print carries a stub tube —
  // gun identity kept at the real proportions instead)
  P.addGunExtra(box(0.44, 0.42, 0.20), 0, 0, 0.55);
  P.addGunExtraDark(box(0.30, 0.30, 0.03), 0, 0, 0.665);                     // recessed slot shadow
  P.addGunExtra(cylZ(0.088, 0.44, 12, 0.115), 0, 0, 0.80);                   // recoil housing
  P.addGunExtra(cylZ(0.062, 0.10, 10), 0, 0, 1.04);                          // sleeve step ring
  buildGun(P, { len: o.gunLength, r: 0.046, sleeve: false, evac: null, collar: false, baseR: 0.10 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [0.86, h * 0.35, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

function chieftain5Kit(P) {
  const { box, cylY, cylZ, lathe, slab, torus, buildGun, cupola, periscope,
    pintleMG, smokeCluster, liftEye, stowage, tarpRoll, jerryCan } = KIT;
  const { rng } = P;
  // Shaded-parity r1: the donor's faceted polyTurret + Stillbrew slabs read
  // as a welded box with a drilled-dot cheek. The Mk.5 turret is ONE ROUNDED
  // CASTING — rebuilt here as a stretched lathe egg flowing into a
  // forward-leaning mantlet-less chin, with the L11 collar emerging straight
  // from the casting on the gun axis (no kink, no separate mantlet).
  P.clear('turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass',
    'turretTrack', 'gun', 'gunDark', 'gunMount', 'gunMountDark');

  // ---- cast turret shell (lathe profiles only, no facets) ----
  P.add('turret', cylY(1.06, 1.12, 0.10, 26), 0, 0.05, -0.20);               // ring seat
  P.add('turret', lathe([
    [0.84, 0.00], [1.02, 0.10], [1.08, 0.30], [1.02, 0.52], [0.88, 0.70],
    [0.64, 0.84], [0.34, 0.93], [0.02, 0.96],
  ], 30, 1.32), 0, 0.02, -0.28);                                             // main casting, egg in plan
  // forward-leaning chin: roof edge sweeps DOWN and FORWARD to the gun collar
  P.add('turret', slab(
    [-0.46, 0.06, 1.28], [0.46, 0.06, 1.28], [0.42, 0.06, 0.30], [-0.42, 0.06, 0.30],
    [-0.60, 0.78, 0.72], [0.60, 0.78, 0.72], [0.66, 0.82, -0.28], [-0.66, 0.82, -0.28]));
  P.add('turret', slab(                                                      // cast jaw under the beak
    [-0.40, 0.02, 0.95], [0.40, 0.02, 0.95], [0.46, 0.02, 0.10], [-0.46, 0.02, 0.10],
    [-0.44, 0.30, 1.24], [0.44, 0.30, 1.24], [0.48, 0.30, 0.20], [-0.48, 0.30, 0.20]));

  // ---- roof furniture ----
  cupola(P, 'turret', -0.50, 0.84, -0.32, 0.28, 0.20, 7);                    // No.15 cupola LEFT
  P.add('turretDark', torus(0.315, 0.02, 20), -0.50, 1.10, -0.32);           // cupola sight ring rail
  pintleMG(P, -0.50, 1.04, -0.48, false);                                    // commander GPMG
  P.add('turret', cylY(0.21, 0.23, 0.07, 16), 0.48, 0.90, -0.40);            // loader hatch ring
  P.add('turretDark', box(0.34, 0.016, 0.03), 0.48, 0.945, -0.40);           // hatch seam
  periscope(P, 'turretDetail', 0.34, 0.90, 0.18);                            // gunner sight
  P.add('turretDetail', box(0.20, 0.14, 0.24), -0.16, 0.92, 0.05);           // commander sight hood
  P.add('turretGlass', box(0.14, 0.05, 0.03), -0.16, 0.95, 0.18);
  liftEye(P, 'turretDetail', -0.78, 0.62, 0.55, 0.4);
  liftEye(P, 'turretDetail', 0.78, 0.62, 0.55, -0.4);

  // ---- searchlight housing on the LEFT cheek ----
  P.add('turret', box(0.46, 0.50, 0.36), -1.00, 0.36, 0.30, 0, -0.42, 0);
  P.add('turretDark', box(0.38, 0.40, 0.05), -1.13, 0.36, 0.44, 0, -0.42, 0);
  P.add('turretGlass', box(0.30, 0.30, 0.02), -1.14, 0.36, 0.45, 0, -0.42, 0);
  P.add('turretDetail', box(0.04, 0.44, 0.04), -1.26, 0.36, 0.32, 0, -0.42, 0);

  // ---- smoke dischargers: 2x6 tube clusters on bracket plates, proud of
  // the casting (the old surface-flush tubes read as drilled dots) ----
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.16, 0.30), s * 0.92, 0.32, 0.78, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.02, 0.44, 0.86, 6, s * 0.95, 0.75);
  }

  // ---- flank stowage wrapping both sides (shoulders reach the hull width
  // like the reference: bins + basket rails, not one armor slab) ----
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.26, 0.96), s * 1.15, 0.34, 0.12);            // dome-to-bin spacer
    P.add('turret', box(0.66, 0.34, 1.02), s * 1.40, 0.36, 0.12, 0, s * 0.04, 0);   // front bin
    P.add('turretDark', box(0.67, 0.02, 0.97), s * 1.40, 0.48, 0.12, 0, s * 0.04, 0);
    P.add('turretDark', box(0.675, 0.35, 0.025), s * 1.405, 0.36, -0.22, 0, s * 0.04, 0);
    P.add('turret', box(0.92, 0.40, 1.28), s * 1.28, 0.30, -1.10, 0, s * 0.03, 0);  // deep rear bin
    P.add('turretDark', box(0.93, 0.02, 1.23), s * 1.28, 0.44, -1.10, 0, s * 0.03, 0);
    for (const zc of [-0.70, -1.45]) {
      P.add('turretDark', box(0.935, 0.41, 0.025), s * 1.285, 0.30, zc, 0, s * 0.03, 0);
    }
    P.add('turretDetail', box(0.035, 0.035, 1.30), s * 1.78, 0.46, -1.08);   // basket top rail
    P.add('turretDetail', box(0.035, 0.035, 1.30), s * 1.78, 0.14, -1.08);   // basket bottom rail
    for (const zr of [-0.50, -1.08, -1.66]) {
      P.add('turretDetail', box(0.03, 0.34, 0.03), s * 1.78, 0.30, zr);      // rail posts
    }
  }
  stowage(P, 'turretCloth', rng, [
    [1.30, 0.56, -1.05, 0.72, 0.26, 1.05],                                   // camo bundle (right shoulder)
    [-1.32, 0.54, -1.30, 0.66, 0.22, 0.80],
  ]);
  tarpRoll(P, 'turretCloth', -1.36, 0.58, 0.12, 0.92, 0.075, false);         // bedroll on left front bin

  // ---- NBC pack + rear basket across the bustle ----
  P.add('turret', box(1.42, 0.46, 0.60), 0, 0.30, -1.96);                    // NBC pack
  P.add('turretDark', box(1.30, 0.03, 0.50), 0, 0.545, -1.96);               // lid seam
  P.add('turretDark', box(0.42, 0.26, 0.04), 0, 0.28, -2.27);                // intake grille
  P.add('turretDetail', box(1.46, 0.05, 0.05), 0, 0.10, -2.30);
  P.add('turretDetail', box(1.90, 0.04, 0.04), 0, 0.52, -2.46);              // basket rails
  P.add('turretDetail', box(1.90, 0.04, 0.04), 0, 0.16, -2.46);
  for (let k = 0; k < 7; k++) {
    P.add('turretDetail', box(0.03, 0.36, 0.03), -0.90 + k * 0.30, 0.34, -2.46);
  }
  stowage(P, 'turretCloth', rng, [[-0.35, 0.62, -2.05, 0.85, 0.24, 0.5]]);
  jerryCan(P, 'turretDetail', 0.62, 0.66, -2.02, 0.15);

  // ---- whip antennas on base pots seated on the rear bin lids (the old
  // bustle-corner pots stood over air behind the casting) ----
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.045, 0.055, 0.12, 8), s * 1.28, 0.54, -1.58);
    P.add('turretDetail', box(0.022, 1.45, 0.022), s * 1.28, 1.32, -1.58, 0, 0, s * 0.04);
  }

  // ---- L11A5 seated straight on the chin axis: cast collar out of the
  // casting, full two-segment thermal sleeve, fume extractor, muzzle
  // counterweight collar (buildGun collar) ----
  P.addGunExtra(box(0.40, 0.40, 0.40), 0, 0, 0.15);                          // hidden root block
  P.addGunExtra(cylZ(0.145, 0.62, 16, 0.215), 0, 0, 0.45);                   // cast collar from the chin
  P.addGunExtraDark(cylZ(0.152, 0.05, 16), 0, 0, 0.72);                      // collar seam ring
  buildGun(P, { len: 6.26, r: 0.098, sleeve: true, evac: 0.58, collar: true, baseR: 0.16 });

  // ---- hull: full-length skirt panels hung from the fender line (Mk.5 is
  // skirted; the exposed toothed top run read as a WW2 chassis) ----
  addSegmentedSkirts(P, 3.68, 6.5, 0.955, 0.31, 6);
  // deep corner mud flaps HUNG FROM the fender tips (replaces the four
  // free-floating ground plates the critique flagged; the reference carries
  // full-depth flaps at all four corners)
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.54, 0.56, 0.045), s * 1.50, 0.82, 3.53, -0.08, 0, 0);
    P.add('hullRubber', box(0.54, 0.56, 0.045), s * 1.50, 0.82, -3.66, 0.08, 0, 0);
  }
  // glacis tow shackles at the nose toes
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.12, 0.10, 0.16), s * 0.95, 0.52, 3.66);
    P.add('hullDetail', torus(0.07, 0.018, 10), s * 0.95, 0.52, 3.76, Math.PI / 2, 0, 0);
  }
}

// FV510 Warrior (up-armoured, per the repaired oracle): the reference is a
// slat/bar-armoured Warrior with a SQUARE two-man turret (~±0.85, not the
// r1 ±1.4 sized against the old fused turret+bow mask), a thin stepped
// RARDEN with flash hider, and horizontal appliqué banks on bow/sides/rear.
function fv510Build(P, o) {
  const { box, cylY, cylZ, buildGun, smokeCluster, periscope, liftEye, stowage } = KIT;
  const hull = buildHull(P, o);
  const halfL = hull.length / 2, roofY = hull.roofY;
  P.turretG.position.set(0, o.turretPivotY, o.turretPivotZ);
  P.gunG.position.set(o.gunX, o.gunY, o.gunZ);

  // ---- square welded two-man turret ----
  const h = 1.00, tw = 0.85;
  P.add('turret', KIT.frustum(tw, 0.95, -1.10, tw * 0.93, 0.80, -1.04, 0, h));
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.34, 0.09, 0.05), s * 0.36, h * 0.80, 0.86);    // face vision blocks
    P.add('turretGlass', box(0.26, 0.045, 0.03), s * 0.36, h * 0.80, 0.885);
  }
  for (const zs of [0.15, -0.35]) {
    P.add('turretDark', box(0.05, 0.09, 0.26), -tw - 0.01, h * 0.78, zs);    // left-side blocks
  }
  // gunner sight pod (cylinder + cap) front-left roof + wire cutter
  P.add('turret', cylY(0.17, 0.19, 0.30, 14), -0.32, h + 0.14, 0.32);
  P.add('turret', cylY(0.10, 0.155, 0.10, 12), -0.32, h + 0.33, 0.32);
  P.add('turretGlass', box(0.20, 0.07, 0.03), -0.32, h + 0.19, 0.50);
  P.add('turretDark', box(0.035, 0.42, 0.035), 0.05, h + 0.24, 0.70, -0.4, 0, 0);
  // commander + gunner hatch rings with lids
  for (const [hx, hz, hr] of [[-0.30, -0.55, 0.20], [0.36, -0.25, 0.18]]) {
    P.add('turret', cylY(hr, hr + 0.02, 0.06, 14), hx, h + 0.03, hz);
    P.add('turret', cylY(hr - 0.03, hr - 0.03, 0.025, 14), hx, h + 0.075, hz);
    P.add('turretDark', box(hr * 1.7, 0.014, 0.03), hx, h + 0.095, hz);
  }
  periscope(P, 'turretDetail', 0.10, h + 0.05, -0.10);
  liftEye(P, 'turretDetail', -0.70, h + 0.01, 0.70, 0.4);
  liftEye(P, 'turretDetail', 0.70, h + 0.01, 0.70, -0.4);
  // 2x4 smoke discharger banks on both cheeks
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.14, 0.30), s * 0.80, 0.42, 0.72, 0, s * 0.6, 0);
    smokeCluster(P, s * 0.90, 0.52, 0.80, 4, s * 1.0, 0.55);
    smokeCluster(P, s * 0.87, 0.40, 0.84, 4, s * 1.0, 0.55);
  }
  // rear stowage basket: rails + mesh + bundles
  P.add('turretDetail', box(1.55, 0.04, 0.04), 0, h * 0.55, -1.42);
  P.add('turretDetail', box(1.55, 0.04, 0.04), 0, h * 0.18, -1.42);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.028, h * 0.40, 0.028), -0.70 + k * 0.28, h * 0.37, -1.42);
  P.add('turretDark', box(1.45, 0.018, 0.30), 0, h * 0.20, -1.26);
  stowage(P, 'turretCloth', P.rng, [[-0.35, h * 0.42, -1.24, 0.6, 0.24, 0.3], [0.42, h * 0.40, -1.24, 0.5, 0.22, 0.3]]);
  // twin whip antennas on roof base pots
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.045, 0.058, 0.12, 8), s * 0.58, h + 0.06, -0.85);
    P.add('turretDetail', box(0.022, 1.55, 0.022), s * 0.58, h + 0.90, -0.85, 0, 0, s * 0.04);
  }
  // RARDEN: mantlet block, then the LONG THIN stepped tube + flash hider
  P.addGunExtra(box(0.28, 0.32, 0.38), 0, 0, 0.30);
  P.addGunExtra(cylZ(0.070, 0.24, 10, 0.088), 0, 0, 0.54);
  buildGun(P, { len: o.gunLength, r: 0.030, sleeve: false, evac: null, collar: false, baseR: 0.062 });
  P.add('gun', cylZ(0.050, 0.60, 10, 0.056), 0, 0, 0.78);                    // stepped sleeve
  P.add('gun', cylZ(0.038, 0.42, 10), 0, 0, 1.30);
  P.add('gunDark', cylZ(0.047, 0.13, 8), 0, 0, 1.72);                        // flash hider
  P.add('gunDark', cylZ(0.033, 0.09, 8, 0.047), 0, 0, 1.82);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [tw + 0.01, h * 0.45, -0.45], Math.PI / 2);
  P.topY = h + 0.55;

  // ---- hull: horizontal slat/bar-armour banks (the reference's dominant
  // surface feature) on bow, flanks and rear ----
  for (let k = 0; k < 5; k++) {
    const y = 1.00 + k * 0.155;
    const z = 3.09 - (y - 0.72) * 0.964;
    P.add('hullDetail', box(2.30, 0.05, 0.09), 0, y + 0.02, z + 0.05, -0.77, 0, 0);   // bow bank
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(0.045, 0.05, 4.60), s * 1.575, 0.86 + k * 0.17, -0.35);  // flank bank
    }
    for (const zh of [-2.30, -0.35, 1.55]) {
      P.add('hullDetail', box(0.05, 0.90, 0.06), s * 1.555, 1.20, zh);       // hanger posts
    }
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(2.10, 0.05, 0.05), 0, 1.00 + k * 0.17, -3.18 - 0.001 * s);  // rear bank
    }
  }
  // fender stowage row at the bow corners — same ±1.72 width bound the old
  // floating wing mirrors provided, now as strapped bins on bracket bars
  for (const s of [-1, 1]) {
    for (const [bz, bl] of [[2.32, 0.52], [1.70, 0.48]]) {
      P.add('hull', box(0.24, 0.20, bl), s * 1.60, 1.37, bz);
      P.add('hullDark', box(0.25, 0.016, bl - 0.05), s * 1.60, 1.475, bz);
      P.add('hullDetail', box(0.18, 0.035, 0.035), s * 1.46, 1.30, bz);
    }
  }
  // big LEFT-side exhaust cowl (Warrior signature) + heat shield louvres
  P.add('hull', box(0.30, 0.42, 1.20), -1.32, 2.10, -0.30);
  P.add('hullDark', box(0.20, 0.14, 0.06), -1.34, 2.24, -0.95);
  for (let k = 0; k < 3; k++) P.add('hullDark', box(0.032, 0.26, 0.24), -1.475, 2.10, -0.62 + k * 0.34);
  // raised louvred powerpack bank on the RIGHT front deck
  P.add('hull', box(1.05, 0.055, 1.15), 0.60, roofY + 0.028, 0.42);
  for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(0.95, 0.02, 0.05), 0.60, roofY + 0.06, 0.82 - k * 0.20);
    P.add('hullDetail', box(0.99, 0.022, 0.042), 0.60, roofY + 0.075, 0.85 - k * 0.20, 0.5, 0, 0);
  }
  // driver hatch ring + periscope hoods on the right glacis shoulder
  P.add('hullDetail', cylY(0.24, 0.26, 0.05, 14), 0.62, roofY + 0.02, 1.26);
  periscope(P, 'hullDetail', 0.48, roofY + 0.045, 1.58);
  periscope(P, 'hullDetail', 0.78, roofY + 0.045, 1.58);
  // rear troop door: raised frame + handle + hinge blocks + bin rack
  P.add('hullDetail', box(1.30, 0.06, 0.06), 0, 2.12, -3.13);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.06, 1.24, 0.06), s * 0.62, 1.50, -3.13);
    P.add('hullDetail', box(0.07, 0.10, 0.08), s * 0.58, 1.86, -3.15);
  }
  P.add('hullDark', box(0.05, 0.16, 0.04), 0.30, 1.42, -3.15);
  P.add('hull', box(0.55, 0.28, 0.15), -0.55, 0.98, -3.10);
  P.add('hullDark', box(0.56, 0.014, 0.11), -0.55, 1.125, -3.11);
  // comms mast on a base pot, rear-right deck (was buried inside the hull)
  P.add('hullDetail', cylY(0.05, 0.065, 0.14, 8), 0.98, roofY + 0.07, -1.18);
  P.add('hullDetail', box(0.035, 1.30, 0.035), 0.98, roofY + 0.75, -1.18, 0, 0, 0.03);
  // rear top-corner rail frames (reference carries them over the troop bay)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.04, 0.04, 1.30), s * 1.10, roofY + 0.16, -2.20);
    P.add('hullDetail', box(0.70, 0.04, 0.04), s * 0.78, roofY + 0.16, -2.84);
    for (const zr of [-1.60, -2.20, -2.80]) {
      P.add('hullDetail', box(0.035, 0.16, 0.035), s * 1.10, roofY + 0.07, zr);
    }
  }
}

// Centurion Mk.3 / Mk.5-2 (shared): buildProfile supplies the tuned hull +
// cast dome; this kit closes the shaded-parity r1 bullets — the floating
// cupola/MG "RWS" cluster gets cast pedestals, the buildHull tow cable gets
// clamp cleats so it reads mounted, and the empty glacis/deck/skirts get
// their Centurion furniture. mk distinguishes the two marks visibly.
function centurionBuild(P, o, mk) {
  const { box, cylY, cylZ, torus, liftEye, smokeCluster, stowage, spareTrackStrip, headlight } = KIT;
  buildProfile(P, o);
  const h = o.turretHeight, tw = o.turretWidth / 2;
  const cX = o.turretWidth * 0.20, cZ = -o.turretDepth * 0.22;

  // ---- roof: cast pedestals under the floating cupola / loader hatch /
  // sight (r1: "roof block reads as a modern RWS on a 1950 tank") ----
  P.add('turret', cylY(0.26, 0.32, 0.28, 18), cX, h - 0.13, cZ);
  P.add('turret', cylY(0.20, 0.25, 0.26, 16), -cX, h - 0.11, -o.turretDepth * 0.18);
  P.add('turret', box(0.20, 0.14, 0.16), o.turretWidth * 0.20, h - 0.01, o.turretFront * 0.28);
  // antennas on bustle-corner base pots (buildTurretAndGun antennas disabled)
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.045, 0.058, 0.12, 8), s * 0.68, h * 0.79, -1.78);
    P.add('turretDetail', box(0.022, 1.0, 0.022), s * 0.68, h * 0.79 + 0.55, -1.78, 0, 0, s * 0.05);
  }
  // big rectangular bustle bin filling the rear rack frame
  P.add('turret', box(1.62, 0.44, 0.56), 0, h * 0.40, -1.95);
  P.add('turretDark', box(1.50, 0.02, 0.46), 0, h * 0.40 + 0.23, -1.95);
  for (const xr of [-0.50, 0.50]) P.add('turretDark', box(0.022, 0.45, 0.57), xr, h * 0.40, -1.955);
  // lifting eyes on the dome shoulders + bustle roof
  liftEye(P, 'turretDetail', -0.80, 0.50, 0.40, 0.5);
  liftEye(P, 'turretDetail', 0.80, 0.50, 0.40, -0.5);
  liftEye(P, 'turretDetail', -0.68, h * 0.78, -1.25, 2.6);
  liftEye(P, 'turretDetail', 0.68, h * 0.78, -1.25, -2.6);
  // smoke dischargers on cheek brackets: Mk.5/2 carries the full 2x6 banks,
  // Mk.3 a lighter triple (replaces the "three painted dots")
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.15, 0.36), s * 0.95, 0.26, 0.50, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.05, 0.37, 0.58, mk === 5 ? 6 : 3, s * 0.95, 0.7);
    if (mk === 5) smokeCluster(P, s * 1.02, 0.27, 0.62, 6, s * 0.95, 0.7);
  }
  // recessed internal mantlet: slim shadow ring buried in the dome tip + a
  // low canvas hood draping from the brow over the gun root (the r1 pass
  // used a wide frame + slab wedge that read as a cream billboard)
  P.add('turretDark', box(0.50, 0.44, 0.06), 0, o.gunY, o.turretFront * 0.80);
  P.add('turretCloth', box(0.46, 0.20, 0.30), 0, o.gunY + 0.17, o.turretFront * 0.78, -0.55, 0, 0);
  P.add('turretCloth', box(0.38, 0.15, 0.22), 0, o.gunY + 0.05, o.turretFront * 0.88, -0.22, 0, 0);
  if (mk === 5) {
    // Mk.5/2 identity: stowage baskets on both bustle flanks + the L7's
    // prominent FAT fume extractor over buildGun's slim default drum
    stowage(P, 'turretCloth', P.rng, [
      [-1.02, h * 0.42, -1.15, 0.30, 0.26, 0.80], [1.02, h * 0.42, -1.15, 0.30, 0.26, 0.80],
    ]);
    const ez = 0.62 * o.gunLength;
    P.add('gun', cylZ(0.100, 0.46, 14), 0, 0, ez);
    P.add('gun', cylZ(0.072, 0.16, 14, 0.100), 0, 0, ez - 0.30);
    P.add('gun', cylZ(0.100, 0.16, 14, 0.072), 0, 0, ez + 0.30);
  }

  // ---- hull: clamp cleats under the buildHull tow cable so it reads
  // mounted (r1: "thin rod floating diagonally over the right deck") ----
  const halfL = o.hullLength / 2, w = o.width;
  P.add('hullDetail', box(0.10, 0.30, 0.14), -w * 0.34, 1.41, halfL * 0.72);
  P.add('hullDetail', box(0.10, 0.30, 0.14), w * 0.34, 1.41, halfL * 0.72);
  P.add('hullDetail', box(0.12, 0.10, 0.14), 0, 1.645, halfL * 0.48);
  // glacis kit: driver hatch lids, headlight pods with guard bars, splash
  // rail, tow shackles (glacis was one empty facet)
  for (const [hx, hz] of [[0.55, 1.95], [1.00, 1.95]]) {
    P.add('hullDetail', box(0.40, 0.035, 0.50), hx, 1.56, hz, -0.38, 0, 0);
    P.add('hullDark', box(0.34, 0.016, 0.03), hx, 1.575, hz - 0.10, -0.38, 0, 0);
  }
  for (const s of [-1, 1]) {
    headlight(P, s * 1.05, 1.22, 2.92, -0.35);
    P.add('hullDetail', box(0.20, 0.02, 0.16), s * 1.05, 1.33, 2.86, -0.38, 0, 0);   // guard bar
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(1.25, 0.05, 0.09), s * 0.60, 1.40, 2.44, -0.38, s * -0.30, 0);  // splash V
    P.add('hullDetail', box(0.11, 0.10, 0.15), s * 0.85, 0.56, 3.58);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * 0.85, 0.56, 3.68, Math.PI / 2, 0, 0);
  }
  // engine deck: louvre field + fuel fillers + rear track-link rack
  P.add('hull', box(w * 0.55, 0.06, 1.35), 0, 1.73, -1.95);
  for (let i = 0; i < 7; i++) {
    P.add('hullDark', box(w * 0.48, 0.02, 0.05), 0, 1.765, -1.42 - i * 0.18);
    P.add('hullDetail', box(w * 0.51, 0.022, 0.042), 0, 1.78, -1.39 - i * 0.18, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.05, 10), s * 0.95, 1.735, -1.15);
  spareTrackStrip(P, 'hull', -0.85, 1.75, -2.52, 3);
  // skirt relief: gap strips at panel joints + lifting handles (r1: "single
  // flat plate"; addSegmentedSkirts seams alone read painted)
  const skX = w / 2 + 0.012, skY = o.skirtY, pD = o.skirtLength / o.skirtPanels;
  for (const s of [-1, 1]) {
    for (let k = 0; k <= o.skirtPanels; k++) {
      P.add('hullDark', box(0.018, o.skirtHeight * 0.94, 0.055), s * skX, skY, o.skirtLength / 2 - k * pD);
    }
    for (let k = 0; k < o.skirtPanels; k++) {
      P.add('hullDetail', box(0.02, 0.05, 0.20), s * (skX + 0.006), skY + o.skirtHeight * 0.28,
        o.skirtLength / 2 - pD / 2 - k * pD);
    }
  }
}
const centurion3Build = (P, o) => centurionBuild(P, o, 3);
const centurion5Build = (P, o) => centurionBuild(P, o, 5);

// Challenger 1 Mk.3: full parametric build sized against the recovered CR1
// oracle (hull ±3.69 normalized, hull top 1.69, skirt hem ~1.0 with all six
// wheels visible, L11A5 tip at 6.26, TOGS barbette on the roof right).
function challenger1Build(P, o) {
  const { box, cylY, cylZ, torus, liftEye, smokeCluster, stowage, pintleMG } = KIT;
  buildProfile(P, o);
  const h = o.turretHeight;
  // TOGS thermal barbette BESIDE the gun root (the r1 roof stub read as a
  // vent): boxy housing with shuttered port face + round sensor ports
  P.add('turret', box(0.52, 0.56, 0.85), 0.80, 0.40, 0.88);
  P.add('turretDark', box(0.42, 0.40, 0.05), 0.80, 0.42, 1.29);
  for (const [px, py] of [[-0.10, 0.10], [0.10, 0.10], [-0.10, -0.08], [0.10, -0.08]]) {
    P.add('turretGlass', cylZ(0.045, 0.03, 10), 0.80 + px, 0.44 + py, 1.315);
  }
  P.add('turretDetail', box(0.54, 0.03, 0.86), 0.80, 0.70, 0.88);            // lid rim
  // commander's station: LOW pintle GPMG + sight housing (replaces the
  // oversized RWS-block read) + gunner sight cowl + loader cupola
  pintleMG(P, o.commanderX, h + 0.04, -0.72, false);
  P.add('turret', box(0.30, 0.20, 0.34), o.commanderX - 0.02, h + 0.06, -0.30);   // sight housing
  P.add('turretGlass', box(0.20, 0.07, 0.03), o.commanderX - 0.02, h + 0.10, -0.12);
  P.add('turret', box(0.34, 0.16, 0.30), 0.28, h + 0.04, 0.42);              // gunner sight cowl
  P.add('turretGlass', box(0.24, 0.06, 0.03), 0.28, h + 0.075, 0.58);
  P.add('turret', cylY(0.20, 0.22, 0.06, 14), o.loaderX, h + 0.02, -0.35);   // loader cupola ring
  P.add('turretDark', box(0.32, 0.014, 0.03), o.loaderX, h + 0.065, -0.35);
  liftEye(P, 'turretDetail', -0.95, h * 0.92, 0.55, 0.4);
  liftEye(P, 'turretDetail', 0.95, h * 0.92, 0.55, -0.4);
  // 2x5 smoke discharger banks on both cheeks (was a flush 5-dot row)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.15, 0.34), s * 1.16, 0.30, 0.62, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.26, 0.42, 0.70, 5, s * 0.95, 0.62);
    smokeCluster(P, s * 1.23, 0.30, 0.74, 5, s * 0.95, 0.62);
  }
  // tubular stowage baskets full of kit wrapping the flanks + rear
  for (const s of [-1, 1]) {
    P.add('turret', box(0.18, 0.44, 1.55), s * 1.38, 0.32, -0.80, 0, s * 0.02, 0);
    P.add('turretDark', box(0.19, 0.02, 1.50), s * 1.38, 0.47, -0.80, 0, s * 0.02, 0);
    for (const zc of [-0.30, -1.30]) P.add('turretDark', box(0.19, 0.45, 0.022), s * 1.385, 0.32, zc);
    P.add('turretDetail', box(0.035, 0.035, 1.60), s * 1.50, 0.50, -0.85);
    P.add('turretDetail', box(0.035, 0.035, 1.60), s * 1.50, 0.12, -0.85);
    for (const zr of [-0.15, -0.85, -1.55]) P.add('turretDetail', box(0.03, 0.40, 0.03), s * 1.50, 0.31, zr);
  }
  P.add('turretDetail', box(2.55, 0.04, 0.04), 0, 0.52, -1.98);              // rear basket rails
  P.add('turretDetail', box(2.55, 0.04, 0.04), 0, 0.14, -1.98);
  for (let k = 0; k < 9; k++) P.add('turretDetail', box(0.03, 0.40, 0.03), -1.20 + k * 0.30, 0.33, -1.98);
  stowage(P, 'turretCloth', P.rng, [
    [-1.34, 0.62, -0.70, 0.30, 0.24, 1.0], [1.34, 0.62, -0.95, 0.30, 0.26, 0.9],
    [-0.45, 0.36, -1.80, 0.8, 0.30, 0.34], [0.55, 0.34, -1.80, 0.7, 0.28, 0.34],
  ]);
  // canvas dust-cover wedge over the raised gun root
  P.add('turretCloth', box(0.55, 0.26, 0.36), 0, o.gunY + 0.16, o.turretFront * 0.72, -0.45, 0, 0);
  P.add('turretCloth', box(0.48, 0.18, 0.26), 0, o.gunY + 0.02, o.turretFront * 0.84, -0.18, 0, 0);

  // ---- hull ----
  const halfL = o.hullLength / 2, w = o.width;
  // clamp cleats under the buildHull tow cable ends + mid saddle (the bare
  // cable ends hovered ~0.2 over the western glacis)
  P.add('hullDetail', box(0.10, 0.26, 0.14), -w * 0.34, 1.40, halfL * 0.72);
  P.add('hullDetail', box(0.10, 0.26, 0.14), w * 0.34, 1.40, halfL * 0.72);
  P.add('hullDetail', box(0.12, 0.10, 0.14), 0, 1.60, halfL * 0.48);
  // splash board + headlight clusters in guards + central tow point +
  // travel-lock crutch on the glacis (was a bare facet)
  P.add('hullDetail', box(1.9, 0.06, 0.10), 0, 1.30, 2.55, -0.30, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.30, 0.20, 0.16), s * 1.28, 1.16, 3.10);
    P.add('hullGlass', cylZ(0.055, 0.02, 10), s * 1.34, 1.18, 3.19);
    P.add('hullGlass', cylZ(0.045, 0.02, 10), s * 1.20, 1.18, 3.19);
    P.add('hullDetail', box(0.34, 0.02, 0.20), s * 1.28, 1.28, 3.08, -0.3, 0, 0);   // guard bar
  }
  P.add('hullDetail', box(0.16, 0.12, 0.16), 0, 0.62, 3.55);
  P.add('hullDetail', torus(0.07, 0.018, 10), 0, 0.62, 3.66, Math.PI / 2, 0, 0);
  P.add('hullDetail', box(0.10, 0.34, 0.10), 0, 1.06, 2.42, -0.55, 0, 0);    // travel-lock crutch A-frame
  P.add('hullDetail', box(0.30, 0.10, 0.10), 0, 1.22, 2.28, -0.55, 0, 0);
  // rear bin rack across the tail (turntable rear was a bare wall)
  P.add('hull', box(1.05, 0.34, 0.20), -0.62, 1.42, -halfL * 0.985);
  P.add('hull', box(0.85, 0.30, 0.18), 0.68, 1.40, -halfL * 0.985);
  P.add('hullDark', box(1.06, 0.018, 0.16), -0.62, 1.60, -halfL * 0.99);
  P.add('hullDetail', box(2.4, 0.04, 0.04), 0, 1.22, -halfL * 1.0);
  // skirt dress-up: bolt rows + panel handles (8 panels via profile)
  const skX = w / 2 + 0.012, pD = o.skirtLength / o.skirtPanels;
  for (const s of [-1, 1]) {
    for (let k = 0; k < o.skirtPanels; k++) {
      const z = o.skirtLength / 2 - pD / 2 - k * pD;
      P.add('hullDetail', box(0.02, 0.05, 0.20), s * skX, o.skirtY + o.skirtHeight * 0.26, z);
      for (const f of [-0.30, 0.30]) {
        P.add('hullDark', cylZ(0.018, 0.014, 6), s * (skX + 0.004), o.skirtY + o.skirtHeight * 0.38, z + f * pD, 0, s * Math.PI / 2, 0);
      }
    }
  }
}

export const UK_PROFILES = {
  challenger1: {
    build: challenger1Build,
    hull: 'western', width: 3.52, hullLength: 7.44, roofY: 1.66, trackTop: 1.02, trackW: 0.62,
    wheels: 6, wheelR: 0.41, wheelY: 0.50, wheelSpan: 5.15, wheelStyle: 'dished', skirts: true,
    skirtY: 1.24, skirtHeight: 0.50, skirtLength: 6.40, skirtPanels: 8,
    turret: 'western', turretPivotY: 1.63, turretPivotZ: -0.18, turretWidth: 2.80,
    turretDepth: 3.30, turretHeight: 0.78, turretFront: 1.30, turretRear: -1.55,
    // gun raised out of the bare wedge toe (r1 critique "gun sits low");
    // pintle GPMG + 2x5 clusters supplied by challenger1Build, not the
    // template mg/smoke defaults
    gunY: 0.20, gunZ: 0, gunLength: 6.62, gunRadius: 0.088, mantletWidth: 0.54,
    mantletHeight: 0.58, pano: false, mg: false, smoke: false,
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
    // Post-repair oracle re-tune: the truthful turret is the real two-man
    // square box (~±0.85) — the r1 ±1.31 shell chased the fused turret+bow
    // mask. RARDEN stays inside the hull nose (tip 3.18 vs nose 3.19).
    turretPivotY: 2.02, turretPivotZ: 0.93, gunX: 0.22, gunY: 0.30, gunZ: 0.40, gunLength: 1.85,
  },
  // Centurion chassis pair: hull band raised to the oracle's 1.74 fender line
  // with the signature full-length armoured skirts over the Horstmann run.
  // Guns carry their real forward reach (trunnions sit ~0.55 ahead of the
  // ring): 20-pdr ≈ 2.3 m overhang, L7 with evacuator ≈ 2.2 m.
  centurion3: {
    ...CLASSIC, build: centurion3Build, width: 3.38, hullLength: 7.56, roofY: 1.70, trackTop: 0.88,
    trackW: 0.57, wheels: 6, wheelR: 0.40, wheelY: 0.50, wheelStyle: 'dished', skirts: true,
    skirtY: 1.04, skirtHeight: 0.60, skirtLength: 6.60,
    skirtPanels: 6, turretPivotY: 1.69, turretPivotZ: -0.12, turretWidth: 2.52, turretDepth: 3.30,
    turretHeight: 0.76, turretFront: 1.06, turretRear: -2.02, pano: false,
    mg: false, antennas: false, smoke: false,          // replaced by centurionBuild kit
    // 20-pdr Type B: mid-tube fume extractor (ref gun is a print stub — G is
    // structurally capped; the honest barrel stays)
    gunY: 0.34, gunZ: 0.55, gunLength: 5.60, gunRadius: 0.048, sleeve: false, evac: 0.55,
  },
  centurion5: {
    ...CLASSIC, build: centurion5Build, width: 3.38, hullLength: 7.56, roofY: 1.70, trackTop: 0.88,
    trackW: 0.57, wheels: 6, wheelR: 0.40, wheelY: 0.50, wheelStyle: 'dished', skirts: true,
    skirtY: 1.04, skirtHeight: 0.60, skirtLength: 6.60,
    skirtPanels: 6, turretPivotY: 1.69, turretPivotZ: -0.12, turretWidth: 2.56, turretDepth: 3.36,
    turretHeight: 0.78, turretFront: 1.08, turretRear: -2.06, pano: false,
    mg: false, antennas: false, smoke: false,          // replaced by centurionBuild kit
    // L7 105 mm (fat mid-tube fume extractor added in centurionBuild)
    gunY: 0.35, gunZ: 0.55, gunLength: 5.45, gunRadius: 0.053, sleeve: false, evac: 0.62,
  },
  comet: {
    build: cometBuild, width: 3.05, hullLength: 6.32, roofY: 1.64, bandY: 0.96, trackW: 0.46,
    wheels: 5, wheelR: 0.45, wheelSpan: 4.40, gunLength: 4.42,
    // Comet cue: FOUR return rollers, visible in the gaps between the big
    // Christie wheels (the Cromwell/Charioteer run has none).
    rollers: evenStations(4, 3.30).map((z) => ({ z, y: 0.76, r: 0.085 })),
  },
  challenger_cruiser: {
    build: a30Build, width: 2.91, hullLength: 6.10, roofY: 1.56, bandY: 0.92, trackW: 0.44,
    wheels: 6, wheelR: 0.41, wheelSpan: 4.75, gunLength: 3.30,
    mgBall: false,   // A30 deleted the hull Besa — visor + hooded periscopes instead
  },
  charioteer: {
    build: charioteerBuild, width: 3.05, hullLength: 5.66, roofY: 1.60, bandY: 0.94, trackW: 0.46,
    wheels: 5, wheelR: 0.44, wheelSpan: 4.00, gunLength: 5.45,
  },
};
