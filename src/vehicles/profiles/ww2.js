// WWII / inter-war community procedural profiles (fidelity oracles:
// recovered/community Tiger, Panzer III, T-34, Sherman Jumbo, Tiger II,
// Quaternius heavy, Leichttraktor GLBs). Owned by the WWII family agent.
//
// Wave-2 rebuild: every id below is a bespoke build (profile.build) replacing
// the generic parametric template. Dimensions come from width-normalized mask
// probes of each local oracle (docs/references/tanks/<id>.md) plus published
// real-vehicle data. Original primitive reconstructions only — no source mesh
// data is copied.
//
// FRAME NOTE (soviet-heavy rule): oracles whose gun is fused into the
// turret/whole mesh normalize on the FULL bounding box, so their hulls sit
// REAR-SHIFTED in world space (pziii_konserwa, tiger2, t34_85_cad, and
// slightly newc_tiger). Each build replicates its oracle's frame so the
// raw-frame cannon-overhang metric and in-game silhouette line up.
//
// WIDTH GUARD: probes width-normalize — nothing may exceed each build's
// committed max half-width (q_heavy 1.80, pziii pair 1.45, jumbo 1.475,
// tiger2 1.88, t34 1.50, newc_tiger 1.855, leichttraktor 1.14) or the whole
// model rescales and every mask shifts.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// Dark recess field behind every road wheel (soviet-heavy sovGear rule): the
// painted rim/hub/bolts stand proud of a shadowed disc so wheels read out of
// the bay shadow under any camo. Merged into hullDark — zero extra draws.
function wheelShadows(P, xc, wheelZs, r, w, lift = 0) {
  const { cylX } = KIT;
  for (const z of wheelZs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(r * 0.72, w * 1.06, 12), s * xc, r + 0.10 + lift, z);
  }
}

// Bow tow hook/shackle: bracket block + dark pin.
function towHook(P, x, y, z) {
  const { box, cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.12, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.01, z + 0.03);
}

// German rear muffler: transverse dark drum + exhaust stub.
function muffler(P, x, y, z, len = 0.9, r = 0.11) {
  const { cylX, cylY } = KIT;
  P.add('hullDark', cylX(r, len, 12), x, y, z);
  P.add('hullDark', cylY(0.035, 0.035, 0.12, 8), x + len * 0.30, y + r + 0.05, z);
}

// Fender pioneer tool row: shovel + axe head + dark clamps.
function fenderTools(P, x, y, z) {
  const { box } = KIT;
  KIT.shovelTool(P, x, y, z, 0.85);
  P.add('hullWood', box(0.03, 0.022, 0.6), x + 0.10, y, z - 0.15);
  P.add('hullDark', box(0.10, 0.03, 0.09), x + 0.10, y, z - 0.42);
  for (const dz of [-0.25, 0.25]) P.add('hullDark', box(0.16, 0.035, 0.03), x + 0.05, y + 0.005, z + dz);
}

// Headlight pair with brush-guard hoops.
function lightsAndGuards(P, xs, y, z, rx = -0.3) {
  for (const x of xs) {
    KIT.headlight(P, x, y, z, rx);
    P.add('hullDetail', KIT.torus(0.07, 0.011, 12), x, y, z + 0.055);
  }
}

// ---------------------------------------------------------------------------
// q_heavy — docs/references/tanks/q_heavy.md (stylized Quaternius; the oracle
// IS the reference). Squat slab hull ±1.80 × 5.26 m, cab band ±1.09 to 1.17,
// rear hump to 1.44; snouted dome turret crown 1.65; fat 2-step gun to +3.68.
// ---------------------------------------------------------------------------
function buildQHeavy(P) {
  const { box, cylY, cylZ, slab, frustum, buildRunningGear, buildGun, polyTurret } = KIT;
  // DIMS-FIRST REBUILD (gate v9): the Quaternius toy oracle at published width
  // measures ~5.4 x 1.7 (len x height) against the invented published spec of
  // 7.2 x 3.0 — dims are sovereign, so the whole build carries the published
  // envelope (z x1.37, y x1.75 over the oracle frame) and the curve rows eat
  // the documented proportion cap (docs/references/tanks/q_heavy.md).

  // running gear: 9 chunky exposed wheels scaled onto the stretched hull
  const wheelZs = evenStations(9, 5.30, -0.09);
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.42, wheelW: 0.30, wheelY: 0.45, xc: 1.44, wheelZs,
    sprocket: { z: -3.07, y: 0.50, r: 0.38 },
    idler: { z: 3.07, y: 0.50, r: 0.38 },
    rollers: [], trackW: 0.62, topY: 1.26, botY: 0.07, arms: true, deadSag: 0.05,
  });
  wheelShadows(P, 1.44, wheelZs, 0.42, 0.30, -0.06);

  // hull: belly between the tracks + full-width shoulder slab over them
  P.add('hull', box(2.20, 0.96, 6.48), 0, 1.01, 0);
  P.add('hull', box(3.60, 0.49, 6.16), 0, 1.545, 0);                          // shoulder deck +-1.80
  P.add('hull', box(3.56, 1.26, 0.48), 0, 1.16, 3.36);                        // bow block
  P.add('hull', box(3.56, 1.09, 0.45), 0, 1.09, -3.37);                       // stern block
  P.add('hull', slab(                                                         // bow underside chamfer
    [-1.76, 0.53, 3.60], [1.76, 0.53, 3.60], [1.78, 0.53, 3.12], [-1.78, 0.53, 3.12],
    [-1.76, 1.09, 3.60], [1.76, 1.09, 3.60], [1.78, 1.79, 3.15], [-1.78, 1.79, 3.15]));
  // center cab band +-1.09 with the long glacis running down the nose
  P.add('hull', box(2.18, 0.30, 4.43), 0, 1.90, -0.41);                       // cab roof band to 2.05
  P.add('hull', slab(
    [-1.09, 1.72, 3.56], [1.09, 1.72, 3.56], [1.09, 1.75, 1.81], [-1.09, 1.75, 1.81],
    [-1.09, 1.58, 3.59], [1.09, 1.58, 3.59], [1.09, 2.05, 1.81], [-1.09, 2.05, 1.81])); // glacis wedge
  P.add('hull', frustum(1.09, -2.60, -3.35, 1.09, -2.74, -3.35, 1.79, 2.49)); // rear engine hump
  P.add('hull', slab(                                                         // hump rear chamfer + tail
    [-1.09, 1.79, -3.35], [1.09, 1.79, -3.35], [1.05, 1.79, -3.56], [-1.05, 1.79, -3.56],
    [-1.09, 2.28, -3.35], [1.09, 2.28, -3.35], [1.05, 1.86, -3.53], [-1.05, 1.86, -3.53]));

  // chunky character: dark grilles on the hump, cab vision slit, intake panel
  for (let i = 0; i < 3; i++) P.add('hullDark', box(1.86, 0.02, 0.15), 0, 2.50, -2.76 - i * 0.21);
  P.add('hullDark', box(1.70, 0.28, 0.03), 0, 2.17, -3.58);                   // hump rear grille
  P.add('hullDark', box(0.98, 0.08, 0.03), 0, 1.91, 2.68);                    // cab driver slit
  P.add('hullDark', box(0.65, 0.02, 0.56), -0.55, 2.07, -0.48);               // cab intake panel
  P.add('hullDetail', box(0.65, 0.02, 0.56), 0.55, 2.068, -0.48);
  P.add('hullDetail', cylY(0.16, 0.18, 0.18, 10), 0.62, 2.14, -1.85);         // stubby air filter
  P.add('hullDark', cylY(0.06, 0.06, 0.52, 8), -0.85, 2.66, -2.95);           // exhaust stack on the hump
  P.add('hullDetail', cylY(0.085, 0.085, 0.10, 8), -0.85, 2.95, -2.95);
  lightsAndGuards(P, [-0.62, 0.62], 1.65, 3.59, -0.25);
  towHook(P, -0.55, 1.26, 3.56); towHook(P, 0.55, 1.26, 3.56);
  for (const s of [-1, 1]) {                                                  // fender edge bolts
    for (let i = 0; i < 7; i++) P.add('hullDark', box(0.05, 0.022, 0.07), s * 1.70, 1.81, 2.72 - i * 0.90);
    P.add('hull', box(0.30, 0.60, 0.045), s * 1.45, 0.74, 3.59);              // front mud flaps
    P.add('hull', box(0.30, 0.53, 0.045), s * 1.45, 0.70, -3.59);             // rear mud flaps
  }
  KIT.towCable(P, [[-1.55, 1.81, -1.78], [-1.66, 1.84, 0.27], [-1.55, 1.81, 2.19]]);

  // turret: rounded snouted dome, pivot at the plan centroid
  P.turretG.position.set(0, 2.05, -0.18);
  P.add('turret', polyTurret([
    [-0.42, 2.09], [0.42, 2.09], [0.98, 1.26], [1.25, 0.60], [1.34, 0.13],
    [1.32, -0.60], [1.27, -1.26], [1.16, -1.85], [0.92, -2.14],
    [-0.92, -2.14], [-1.16, -1.85], [-1.27, -1.26], [-1.32, -0.60],
    [-1.34, 0.13], [-1.25, 0.60], [-0.98, 1.26],
  ], 0.86, 1.03, 0.80));
  P.add('turret', cylY(0.96, 1.02, 0.26, 18), 0, -0.10, -0.60);               // under-collar
  P.add('turret', box(1.16, 0.55, 0.79), 0, 0.31, 1.69);                      // gun-shield snout
  P.add('turretDark', box(0.66, 0.09, 0.03), 0, 0.44, 2.09);                  // snout sight slit
  P.add('turret', cylY(0.24, 0.26, 0.07, 14), -0.38, 0.845, -0.82);           // hatch ring
  P.add('turret', cylY(0.205, 0.205, 0.04, 14), -0.38, 0.90, -0.82);          // lid (p95 height carrier)
  P.add('turretDark', box(0.36, 0.014, 0.04), -0.38, 0.925, -0.82);           // lid seam
  P.add('turret', cylY(0.10, 0.12, 0.11, 10), 0.42, 0.83, -0.99);             // vent dome
  P.add('turretDetail', box(0.03, 0.05, 0.73), 1.24, 0.44, 0.20, 0, -0.35, 0); // side grab bars
  P.add('turretDetail', box(0.03, 0.05, 0.73), -1.24, 0.44, 0.20, 0, 0.35, 0);
  P.decal('turret', 'number', P.spec.visual.number || '05', 0.30, [1.20, 0.42, -0.73], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', P.spec.visual.number || '05', 0.30, [-1.20, 0.42, -0.73], -Math.PI / 2, 0, -0.05);

  // gun: fat two-step tube, muzzle at published overall (+5.20 world)
  P.gunG.position.set(0, 0.40, 1.19);
  P.addGunExtra(cylZ(0.19, 0.45, 14, 0.24), 0, 0, 0.20);                      // root collar out of the snout
  buildGun(P, { len: 4.19, r: 0.11, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.16 });
  P.add('gun', cylZ(0.148, 2.05, 14), 0, 0, 1.42);                            // fat rear tube section
  P.add('gun', cylZ(0.159, 0.12, 14), 0, 0, 2.51);                            // step ring
  P.add('gunDark', cylZ(0.149, 0.03, 14), 0, 0, 2.58);                        // step shadow
  P.add('gun', cylZ(0.119, 0.13, 12), 0, 0, 4.10);                            // muzzle collar
  P.topY = 1.09;
}

// ---------------------------------------------------------------------------
// Panzer III family hull (newc_pziii / pziii_konserwa) — boxy hull, flat
// full-length fenders at ±1.45, 6 small rubber-tired wheels + 3 return
// rollers, FRONT sprocket. o parametrizes the two oracles' frames.
// ---------------------------------------------------------------------------
function pziiiHull(P, o) {
  const { box, cylY, slab, buildRunningGear, sph, cylZ } = KIT;
  const zc = o.zc;                          // hull center (konserwa is rear-shifted)
  const roof = o.roofY;                     // superstructure roof height
  const front = zc + o.len / 2, rear = zc - o.len / 2;

  // gear: 6 small wheels, 3 return rollers, front sprocket / rear idler
  const wheelZs = evenStations(6, 3.05, zc + o.gearBias);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.86, wheelR: 0.26, wheelW: 0.17, wheelY: 0.29, xc: 1.20, wheelZs,
    sprocket: { z: front - 0.60, y: 0.40, r: 0.26 },
    idler: { z: rear + 0.56, y: 0.42, r: 0.23 },
    rollers: [-1.02, 0.02, 1.06].map((z) => ({ z: z + zc + o.gearBias, y: 0.84, r: 0.085 })),
    trackW: 0.42, topY: 0.93, botY: 0.055, arms: true,
  });
  wheelShadows(P, 1.20, wheelZs, 0.26, 0.17, -0.07);

  // hull boxes
  P.add('hull', box(2.04, 0.72, o.len * 0.92), 0, 0.58, zc);                 // belly
  P.add('hull', box(o.superW * 2, roof - 1.02, o.superLen), 0, (roof + 1.02) / 2, zc + o.superBias); // superstructure
  if (o.topW) P.add('hull', box(o.topW * 2, 0.10, o.superLen * 0.94), 0, roof - 0.05, zc + o.superBias); // narrow top cap
  P.add('hull', box(2.82, 0.52, 0.42), 0, 0.88, front - 0.22);               // nose block
  P.add('hull', slab(                                                        // glacis plate
    [-1.40, 1.08, front - 0.06], [1.40, 1.08, front - 0.06], [1.41, 1.10, front - 1.05], [-1.41, 1.10, front - 1.05],
    [-1.40, 1.14, front - 0.04], [1.40, 1.14, front - 0.04], [1.41, o.plateY, front - 1.15], [-1.41, o.plateY, front - 1.15]));
  P.add('hull', slab(                                                        // driver plate up to the roof
    [-1.40, o.plateY - 0.02, front - 1.16], [1.40, o.plateY - 0.02, front - 1.16], [1.40, o.plateY - 0.02, front - 1.42], [-1.40, o.plateY - 0.02, front - 1.42],
    [-1.40, o.plateY, front - 1.16], [1.40, o.plateY, front - 1.16], [1.40, roof, front - 1.44], [-1.40, roof, front - 1.44]));
  P.add('hull', box(2.82, 0.05, 0.9), 0, roof - 0.13, rear + 1.0);           // rear deck step
  P.add('hull', slab(                                                        // tail slope
    [-1.38, 0.62, rear + 0.75], [1.38, 0.62, rear + 0.75], [1.30, 0.62, rear + 0.06], [-1.30, 0.62, rear + 0.06],
    [-1.38, roof - 0.16, rear + 0.75], [1.38, roof - 0.16, rear + 0.75], [1.30, o.tailY, rear + 0.08], [-1.30, o.tailY, rear + 0.08]));
  P.add('hull', box(2.60, 0.42, 0.10), 0, 0.82, rear + 0.10);                // tail plate

  // fenders: full-length flat track guards, outer edge = width max ±1.45
  P.add('hull', box(0.46, 0.045, o.len * 0.985), 1.22, o.fenderY, zc);
  P.add('hull', box(0.46, 0.045, o.len * 0.985), -1.22, o.fenderY, zc);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.42, 0.03, 0.38), s * 1.22, o.fenderY - 0.05, front - 0.02, -0.30, 0, 0); // front droop
    P.add('hullDetail', box(0.42, 0.03, 0.36), s * 1.22, o.fenderY - 0.05, rear + 0.02, 0.28, 0, 0);   // rear droop
  }

  // furniture: visor, MG ball, hatches, tools, lights, muffler
  P.add('hullDetail', box(0.40, 0.15, 0.045), -0.52, o.plateY + (roof - o.plateY) * 0.45, front - 1.27, -0.55, 0, 0); // driver visor
  P.add('hullDark', box(0.30, 0.045, 0.03), -0.52, o.plateY + (roof - o.plateY) * 0.45 + 0.01, front - 1.25, -0.55, 0, 0);
  P.add('hullDetail', cylZ(0.115, 0.05, 12), 0.52, o.plateY + (roof - o.plateY) * 0.40, front - 1.27);
  P.add('hull', sph(0.088, 12), 0.52, o.plateY + (roof - o.plateY) * 0.40, front - 1.24);              // bow MG ball
  P.add('hullDark', cylZ(0.022, 0.20, 8), 0.52, o.plateY + (roof - o.plateY) * 0.42, front - 1.12, -0.15, 0, 0);
  for (const s of [-1, 1]) {                                                 // side escape hatches
    P.add('hullDark', box(0.014, 0.34, 0.022), s * (o.superW + 0.004), roof - 0.35, zc + 0.55);
    P.add('hullDark', box(0.014, 0.34, 0.022), s * (o.superW + 0.004), roof - 0.35, zc + 1.05);
    P.add('hullDark', box(0.014, 0.022, 0.50), s * (o.superW + 0.004), roof - 0.19, zc + 0.80);
    P.add('hullDetail', box(0.03, 0.06, 0.10), s * (o.superW + 0.01), roof - 0.32, zc + 0.80);         // handle
  }
  for (let i = 0; i < 4; i++) {                                              // rear deck louvres
    P.add('hullDark', box(1.9, 0.018, 0.075), 0, roof - 0.115, rear + 1.28 - i * 0.16);
  }
  P.add('hullDetail', cylY(0.16, 0.16, 0.035, 12), -0.72, roof + 0.018, zc + o.superBias - 0.45); // deck hatch discs
  P.add('hullDetail', cylY(0.16, 0.16, 0.035, 12), 0.72, roof + 0.018, zc + o.superBias - 0.45);
  muffler(P, 0, 0.95, rear + 0.07, 1.6, 0.10);                               // tail muffler (inside hullLengthM span)
  lightsAndGuards(P, [-1.18, 1.18], o.fenderY + 0.10, front - 0.35, -0.2);
  P.add('hullDark', box(0.07, 0.16, 0.07), -0.95, o.fenderY + 0.11, front - 0.75);  // Notek light stalk
  P.add('hullDetail', box(0.10, 0.06, 0.08), -0.95, o.fenderY + 0.21, front - 0.75);
  fenderTools(P, -1.22, o.fenderY + 0.04, zc + 0.6);
  P.add('hull', box(0.30, 0.16, 0.55), 1.22, o.fenderY + 0.11, zc - 0.75);   // fender stowage box
  P.add('hullDark', box(0.31, 0.13, 0.024), 1.22, o.fenderY + 0.12, zc - 0.75);
  P.add('hull', box(0.26, 0.14, 0.40), -1.22, o.fenderY + 0.10, zc - 1.35);  // jack block
  towHook(P, -0.72, 0.70, front - 0.10); towHook(P, 0.72, 0.70, front - 0.10);
  KIT.spareTrackStrip(P, 'hull', 0, 0.96, front - 0.28, 3);                  // spare links on the nose
  return { front, rear, roof };
}

// newc_pziii — Ausf. J (late) with the 5 cm KwK 39 L/60.
function buildNewcPziii(P) {
  const { box, cylY, cylZ, polyTurret, buildGun, periscope, liftEye } = KIT;
  pziiiHull(P, {
    zc: 0, len: 5.39, roofY: 1.66, superW: 1.41, superLen: 4.15, superBias: -0.55,
    plateY: 1.50, fenderY: 1.39, tailY: 1.50, gearBias: 0.05, topW: 0,
  });

  P.turretG.position.set(0, 1.66, 0.35);
  P.add('turret', polyTurret([
    [-0.44, 0.80], [0.44, 0.80], [0.86, 0.42], [0.89, 0.10], [0.86, -0.34],
    [0.62, -0.78], [0.40, -0.96], [-0.40, -0.96], [-0.62, -0.78], [-0.86, -0.34],
    [-0.89, 0.10], [-0.86, 0.42],
  ], 0.58, 1.04, 0.82));
  for (const s of [-1, 1]) {                                                 // low cheek wings flanking the mantlet
    P.add('turret', box(0.34, 0.24, 0.34), s * 0.60, 0.12, 0.82, 0, s * -0.30, 0);
  }
  // cupola: drum at the turret rear center with 5 dark vision slits
  P.add('turret', cylY(0.29, 0.31, 0.27, 16), 0, 0.665, -0.80);
  P.add('turret', cylY(0.255, 0.255, 0.035, 16), 0, 0.825, -0.80);
  P.add('turretDark', box(0.42, 0.016, 0.03), 0, 0.855, -0.80);              // split-lid seam
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6;
    P.add('turretDark', box(0.10, 0.045, 0.03), Math.sin(a) * 0.30, 0.70, -0.80 + Math.cos(a) * 0.30, 0, a, 0);
  }
  // rear stowage bin (Rommelkiste) with dark straps
  P.add('turret', box(0.94, 0.38, 0.44), 0, 0.36, -1.30);
  P.add('turretDark', box(0.84, 0.02, 0.36), 0, 0.555, -1.30);
  for (const xr of [-0.30, 0.30]) P.add('turretDark', box(0.022, 0.39, 0.45), xr, 0.36, -1.305);
  // side crew hatch doors + hinges
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.014, 0.30, 0.022), s * 0.86, 0.22, -0.02, 0, s * -0.12, 0);
    P.add('turretDark', box(0.014, 0.30, 0.022), s * 0.83, 0.22, -0.40, 0, s * -0.12, 0);
    P.add('turretDark', box(0.014, 0.022, 0.40), s * 0.845, 0.38, -0.21, 0, s * -0.12, 0);
    P.add('turretDetail', box(0.03, 0.07, 0.09), s * 0.865, 0.20, -0.21, 0, s * -0.12, 0);
  }
  periscope(P, 'turretDetail', -0.30, 0.585, 0.30);
  P.add('turret', cylY(0.09, 0.11, 0.05, 10), 0.35, 0.575, -0.15);           // ventilator
  liftEye(P, 'turretDetail', -0.62, 0.50, 0.42, 0.5);
  liftEye(P, 'turretDetail', 0.62, 0.50, 0.42, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || '221', 0.26, [0.86, 0.26, -0.30], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '221', 0.26, [-0.86, 0.26, -0.30], -Math.PI / 2, 0, -0.10);

  // 5 cm KwK 39 L/60 in the external mantlet block
  P.gunG.position.set(0.12, 0.30, 0.42);
  P.addGunExtra(box(1.72, 0.44, 0.26), 0, 0, 0.28);                          // external mantlet
  P.addGunExtra(box(1.60, 0.10, 0.20), 0, 0.26, 0.26);                       // rain lip
  P.addGunExtraDark(cylZ(0.030, 0.14, 8), 0.34, 0.05, 0.44);                 // coax MG port
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), -0.30, 0.07, 0.43);                // sight port
  P.addGunExtra(cylZ(0.105, 0.36, 12, 0.135), 0, 0, 0.62);                   // sleeve step
  buildGun(P, { len: 2.83, r: 0.062, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.10 });
  P.topY = 0.92;
}

// pziii_konserwa — early Pz III with the thin 3.7 cm and twin coax MGs.
function buildPziiiKonserwa(P) {
  const { box, cylY, cylZ, polyTurret, buildGun, periscope, liftEye } = KIT;
  pziiiHull(P, {
    zc: -0.35, len: 5.31, roofY: 1.58, superW: 1.40, superLen: 3.9, superBias: -0.35,
    plateY: 1.42, fenderY: 1.30, tailY: 1.46, gearBias: 0.10, topW: 1.00,
  });

  P.turretG.position.set(0, 1.58, 0.10);
  P.add('turret', polyTurret([
    [-0.30, 0.74], [0.30, 0.74], [0.72, 0.42], [0.88, 0.10], [0.86, -0.34],
    [0.66, -0.72], [0.42, -0.98], [-0.42, -0.98], [-0.66, -0.72], [-0.86, -0.34],
    [-0.88, 0.10], [-0.72, 0.42],
  ], 0.55, 1.04, 0.80));
  // rear-center cupola drum + slits
  P.add('turret', cylY(0.27, 0.29, 0.38, 16), 0, 0.70, -0.59);
  P.add('turret', cylY(0.235, 0.235, 0.032, 16), 0, 0.905, -0.59);
  P.add('turretDark', box(0.40, 0.015, 0.03), 0, 0.93, -0.59);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6;
    P.add('turretDark', box(0.10, 0.042, 0.03), Math.sin(a) * 0.28, 0.70, -0.59 + Math.cos(a) * 0.28, 0, a, 0);
  }
  for (const s of [-1, 1]) {                                                 // side hatch doors
    P.add('turretDark', box(0.014, 0.28, 0.022), s * 0.84, 0.20, 0.02, 0, s * -0.14, 0);
    P.add('turretDark', box(0.014, 0.28, 0.022), s * 0.80, 0.20, -0.36, 0, s * -0.14, 0);
    P.add('turretDark', box(0.014, 0.022, 0.40), s * 0.825, 0.35, -0.17, 0, s * -0.14, 0);
    P.add('turretDetail', box(0.03, 0.06, 0.08), s * 0.845, 0.18, -0.17, 0, s * -0.14, 0);
  }
  periscope(P, 'turretDetail', -0.26, 0.575, 0.24);
  liftEye(P, 'turretDetail', -0.58, 0.50, 0.34, 0.5);
  liftEye(P, 'turretDetail', 0.58, 0.50, 0.34, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || '111', 0.26, [0.84, 0.24, -0.25], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '111', 0.26, [-0.84, 0.24, -0.25], -Math.PI / 2, 0, -0.10);

  // 3.7 cm KwK 36 in the internal mantlet + TWIN coax MG barrels (early cue)
  P.gunG.position.set(0, 0.27, 0.45);
  P.addGunExtra(box(0.78, 0.42, 0.16), 0, 0, 0.30);                          // internal mantlet plate
  for (const [bx, by] of [[-0.28, 0.14], [0.28, 0.14], [-0.28, -0.14], [0.28, -0.14]]) {
    P.addGunExtraDark(cylZ(0.018, 0.03, 6), bx, by, 0.385);                  // mantlet bolts
  }
  P.addGunExtraDark(cylZ(0.020, 0.34, 6), 0.22, 0.02, 0.42);                 // twin coax MGs
  P.addGunExtraDark(cylZ(0.020, 0.34, 6), 0.33, 0.02, 0.42);
  P.addGunExtra(cylZ(0.062, 0.26, 10, 0.082), 0, 0, 0.48);                   // recoil sleeve
  buildGun(P, { len: 2.62, r: 0.040, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.075 });
  P.topY = 0.90;
}

// ---------------------------------------------------------------------------
// sherman_jumbo — docs/references/tanks/sherman_jumbo.md. Slab-sided E2 hull
// with sand shields, cast transmission nose, huge cast turret, short 75 mm.
// ---------------------------------------------------------------------------
function buildShermanJumbo(P) {
  const { box, cylX, cylY, cylZ, sph, slab, lathe, buildRunningGear, buildGun, periscope, liftEye, pintleMG } = KIT;
  const zc = -0.08;
  const front = 3.02, rear = -3.18;

  // VVSS: 3 bogies × 2 wheels + 3 rollers, front sprocket
  const bogies = [1.35, 0, -1.35].map((z) => z + zc);
  const wheelZs = bogies.flatMap((z) => [z + 0.40, z - 0.40]);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.88, wheelR: 0.22, wheelW: 0.16, wheelY: 0.26, xc: 1.16, wheelZs,
    sprocket: { z: front - 0.55, y: 0.40, r: 0.30 },
    idler: { z: rear + 0.55, y: 0.34, r: 0.26 },
    rollers: bogies.map((z) => ({ z: z - 0.12, y: 0.78, r: 0.075 })),
    trackW: 0.50, topY: 0.86, botY: 0.055, arms: false,
  });
  wheelShadows(P, 1.16, wheelZs, 0.22, 0.16, -0.05);
  for (const z of bogies) for (const s of [-1, 1]) {                         // VVSS bogie brackets
    P.add('hullDetail', box(0.14, 0.34, 0.72), s * 1.05, 0.38, z);
    P.add('hullDetail', box(0.16, 0.10, 0.30), s * 1.05, 0.62, z - 0.28);
  }

  // hull: tall slab sides with E2 sand-shield skirts down to the bogie line
  P.add('hull', box(2.10, 0.85, 5.9), 0, 0.60, zc);                          // belly
  P.add('hull', box(2.95, 1.25, 5.55), 0, 1.235, zc - 0.16);                 // slab side band (±1.475, up to the sponson top)
  P.add('hull', box(2.95, 0.50, 4.55), 0, 0.58, zc - 0.53);                  // sand-shield skirt to y 0.33
  P.add('hullDark', box(2.96, 0.035, 4.50), 0, 0.345, zc - 0.53);            // skirt bottom lip
  for (const s of [-1, 1]) {                                                 // shadowed suspension backing —
    P.add('hullDark', box(0.045, 0.50, 5.4), s * 1.03, 0.42, zc);            // closes the skirt/wheel slit
  }
  P.add('hull', slab(                                                        // 47° one-piece glacis
    [-1.46, 1.18, 2.88], [1.46, 1.18, 2.88], [1.46, 1.20, 2.80], [-1.46, 1.20, 2.80],
    [-1.46, 1.22, 2.86], [1.46, 1.22, 2.86], [1.46, 2.03, 1.58], [-1.46, 2.03, 1.58]));
  P.add('hull', box(2.88, 0.055, 2.65), 0, 2.015, 0.30);                     // roof
  P.add('hull', slab(                                                        // engine deck fall
    [-1.44, 1.90, -1.05], [1.44, 1.90, -1.05], [1.44, 1.78, -2.55], [-1.44, 1.78, -2.55],
    [-1.44, 1.98, -1.05], [1.44, 1.98, -1.05], [1.44, 1.83, -2.55], [-1.44, 1.83, -2.55]));
  P.add('hull', slab(                                                        // rear plate slope
    [-1.42, 0.95, -2.55], [1.42, 0.95, -2.55], [1.36, 0.95, -3.10], [-1.36, 0.95, -3.10],
    [-1.42, 1.82, -2.55], [1.42, 1.82, -2.55], [1.36, 1.47, -3.09], [-1.36, 1.47, -3.09]));
  P.add('hull', box(2.70, 0.55, 0.12), 0, 0.72, -3.10);                      // tail plate
  // cast transmission nose: rounded housing + 3-piece bolted flanges
  P.add('hull', cylX(0.50, 2.72, P.q ? 26 : 12), 0, 0.78, 2.52);
  for (const s of [-0.68, 0.68]) P.add('hull', cylX(0.515, 0.05, P.q ? 24 : 12), s, 0.78, 2.52);
  P.add('hull', box(2.72, 0.55, 0.75), 0, 0.90, 2.35);                       // fill above the nose
  // sponson top chamfers (canonical slab corner order per side)
  for (const s of [-1, 1]) {
    const xo = s > 0 ? [1.30, 1.44] : [-1.44, -1.30];                        // [minX, maxX]
    const xt = s > 0 ? [1.16, 1.44] : [-1.44, -1.16];
    P.add('hull', slab(
      [xo[0], 1.86, 1.60], [xo[1], 1.86, 1.60], [xo[1], 1.86, -2.50], [xo[0], 1.86, -2.50],
      [s > 0 ? xt[0] : xt[0], s > 0 ? 2.03 : 1.90, 1.56], [s > 0 ? xt[1] : xt[1], s > 0 ? 1.90 : 2.03, 1.56],
      [s > 0 ? xt[1] : xt[1], s > 0 ? 1.90 : 2.03, -2.50], [s > 0 ? xt[0] : xt[0], s > 0 ? 2.03 : 1.90, -2.50]));
  }

  // glacis furniture: hoods, MG ball, lights, shackles, spare links
  for (const [hx, hz] of [[-0.55, 1.90], [0.55, 1.90]]) {
    P.add('hull', box(0.52, 0.16, 0.55), hx, 1.90, hz, -0.64, 0, 0);         // driver/co-driver hoods
    periscope(P, 'hullDetail', hx, 2.045, hz - 0.28);
  }
  P.add('hull', sph(0.105, 12), 0.62, 1.56, 2.30);                           // bow MG ball
  P.add('hullDark', cylZ(0.026, 0.24, 8), 0.62, 1.60, 2.44, -0.35, 0, 0);
  lightsAndGuards(P, [-0.92, 0.92], 1.72, 2.14, -0.62);
  towHook(P, -0.60, 0.78, 2.98); towHook(P, 0.60, 0.78, 2.98);
  KIT.spareTrackStrip(P, 'hull', 0, 1.62, 2.30, 3, -0.64, 0);                // links on the glacis
  P.add('hullDetail', box(0.05, 0.05, 1.2), -1.30, 2.06, 0.3);               // tool row on the left roof edge
  fenderTools(P, 1.20, 2.055, -0.3);
  // engine deck + rear
  P.add('hullDetail', box(0.62, 0.05, 0.85), -0.45, 1.965, -1.55);           // engine hatches
  P.add('hullDetail', box(0.62, 0.05, 0.85), 0.45, 1.965, -1.55);
  for (let i = 0; i < 4; i++) P.add('hullDark', box(1.35, 0.02, 0.06), 0, 1.90, -1.15 - i * 0.14);
  P.add('hull', box(1.65, 0.10, 0.5), 0, 0.98, -3.05, 0.5, 0, 0);            // exhaust deflector
  P.add('hullDark', box(1.25, 0.24, 0.06), 0, 1.22, -2.98);                  // rear grille
  P.add('hullWood', box(0.3, 0.14, 0.2), -0.85, 1.60, -2.95);                // jack block
  P.decal('hull', 'star', null, 0.55, [1.478, 1.30, 0.4], Math.PI / 2);
  P.decal('hull', 'star', null, 0.55, [-1.478, 1.30, 0.4], -Math.PI / 2);

  // turret: cast dome (repaired print: ring-centered, dome r ~1.25) + rear
  // bustle + the print's turret BASKET drum — the fused print's turret node
  // carries its basket, so the gate's isolated turret mask reaches ~0.75
  // below the ring; the basket stays inside the hull at every yaw.
  P.turretG.position.set(0, 2.00, 0.0);
  P.add('turret', lathe([
    [1.10, 0.01], [1.22, 0.14], [1.25, 0.32], [1.23, 0.54], [1.13, 0.72],
    [0.89, 0.84], [0.45, 0.92], [0.02, 0.94],
  ], P.q ? 30 : 16, 0.97), 0, 0, -0.10);
  P.add('turret', KIT.cylY(0.60, 0.61, 0.72, 16), 0, -0.39, 0.0);            // basket drum (print ring r 0.61)
  P.add('turretDark', KIT.cylY(0.56, 0.56, 0.70, 16), 0, -0.38, 0.0);
  P.add('turret', box(1.64, 0.58, 0.62), 0, 0.42, -1.22);                    // bustle (skirt hangs low)
  P.add('turret', box(1.40, 0.38, 0.22), 0, 0.40, -1.52);                    // bustle tail
  P.add('turretDark', box(0.35, 0.20, 0.03), 0, 0.50, -1.64);                // radio hatch seam
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.40, 0.80, -1.12, 0.48, 0.15, 0.36]]); // duffel on the bustle
  // roof furniture
  P.add('turret', cylY(0.26, 0.28, 0.11, 16), 0.46, 0.80, -0.52);            // commander cupola
  P.add('turret', cylY(0.225, 0.225, 0.03, 16), 0.46, 0.925, -0.52);
  P.add('turretDark', box(0.36, 0.015, 0.03), 0.46, 0.95, -0.52);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('turretGlass', box(0.055, 0.035, 0.03), 0.46 + Math.sin(a) * 0.24, 0.86, -0.52 + Math.cos(a) * 0.24, 0, a, 0);
  }
  P.add('turret', cylY(0.19, 0.21, 0.07, 14), -0.48, 0.76, -0.42);           // loader oval hatch ring
  P.add('turret', cylY(0.165, 0.165, 0.028, 14), -0.48, 0.845, -0.42);
  P.add('turretDark', box(0.28, 0.014, 0.03), -0.48, 0.868, -0.42);
  P.add('turretDark', box(0.085, 0.09, 0.55), 0.28, 0.86, -0.85);              // .50cal stowed low on the bustle
  P.add('turretDark', KIT.cylZ(0.021, 0.42, 8), 0.28, 0.90, -0.55, -0.06, 0, 0);
  P.add('turretDetail', box(0.15, 0.14, 0.15), 0.20, 0.94, -0.18);           // commander periscope tower
  P.add('turretGlass', box(0.11, 0.05, 0.03), 0.20, 0.97, -0.10);
  periscope(P, 'turretDetail', 0.30, 0.88, 0.15);
  P.add('turret', cylY(0.10, 0.12, 0.06, 10), -0.30, 0.83, 0.20);            // ventilator
  P.add('turretDetail', cylX(0.085, 0.035, 12), -1.14, 0.30, -0.30);         // pistol port
  liftEye(P, 'turretDetail', -0.92, 0.60, 0.35, 0.5);
  liftEye(P, 'turretDetail', 0.92, 0.60, 0.35, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || 'C-12', 0.28, [1.13, 0.30, -0.35], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || 'C-12', 0.28, [-1.13, 0.30, -0.35], -Math.PI / 2, 0, -0.10);

  // 75 mm M3 in the huge combination mount — muzzle ends nearly at the bow
  P.gunG.position.set(0, 0.31, 0.90);
  P.addGunExtra(box(1.94, 0.74, 0.30), 0, 0.02, 0.28);                       // wide flat mantlet
  P.addGunExtra(box(1.30, 0.60, 0.24), 0, 0.02, 0.50);                       // outer armor slab
  P.addGunExtraDark(cylZ(0.030, 0.12, 8), 0.42, 0.10, 0.60);                 // coax port
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), -0.40, 0.12, 0.59);                // sight port
  P.addGunExtra(cylZ(0.145, 0.28, 14, 0.170), 0, 0, 0.68);                   // rotor collar
  buildGun(P, { len: 2.28, r: 0.090, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.14 });
  P.add('gun', cylZ(0.098, 0.08, 12), 0, 0, 2.22);                           // muzzle collar
  P.topY = 1.30;
}

// ---------------------------------------------------------------------------
// tiger2 — docs/references/tanks/tiger2.md. Rear-shifted frame (zc −1.355),
// series Henschel turret, 8.8 L/71 with 2.7 m overhang, 9 overlapped wheels.
// ---------------------------------------------------------------------------
function buildTiger2(P) {
  const { box, cylY, cylZ, slab, polyTurret, buildRunningGear, buildGun, periscope, liftEye, cupola, sph } = KIT;
  const front = 2.24, rear = -4.95;

  // 9 overlapped steel-rim wheels (2 rows), front sprocket
  const wheelZs = evenStations(9, 4.30, -1.10);
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.385, wheelW: 0.26, wheelY: 0.40, xc: 1.44, wheelZs,
    layers: [[0.10], [-0.08]], recessDepth: 0.25, bayShadowTop: 1.00,
    sprocket: { z: 1.72, y: 0.60, r: 0.34 },
    idler: { z: -3.92, y: 0.46, r: 0.33 },
    rollers: [], trackW: 0.74, trackTh: 0.12, topY: 0.98, botY: 0.06,
  });

  // hull
  P.add('hull', box(2.12, 0.62, 6.50), 0, 0.80, -1.25);                      // belly (ref front bot 0.49)
  P.add('hull', box(3.14, 0.90, 5.45), 0, 1.41, -1.87);                      // upper hull ±1.57
  P.add('hull', box(3.10, 0.05, 5.42), 0, 1.855, -1.88);                     // roof plate
  P.add('hull', slab(                                                        // 50° glacis, full width
    [-1.56, 0.90, 2.30], [1.56, 0.90, 2.30], [1.57, 0.95, 2.10], [-1.57, 0.95, 2.10],
    [-1.56, 0.94, 2.28], [1.56, 0.94, 2.28], [1.57, 1.86, 0.88], [-1.57, 1.86, 0.88]));
  P.add('hull', slab(                                                        // lower nose plate
    [-1.52, 0.30, 1.92], [1.52, 0.30, 1.92], [1.54, 0.55, 2.16], [-1.54, 0.55, 2.16],
    [-1.52, 0.34, 1.94], [1.52, 0.34, 1.94], [1.56, 0.90, 2.30], [-1.56, 0.90, 2.30]));
  P.add('hull', slab(                                                        // overhung tail plate
    [-1.30, 0.95, -4.42], [1.30, 0.95, -4.42], [1.26, 0.95, -4.52], [-1.26, 0.95, -4.52],
    [-1.30, 0.99, -4.44], [1.30, 0.99, -4.44], [1.28, 1.84, -4.70], [-1.28, 1.84, -4.70]));
  KIT.fenders(P, 1.575, 1.88, 1.27, -4.25, 1.45, 0.038);                     // track guards ±1.88 (nose is bare track)
  for (const s of [-1, 1]) {                                                 // hull side plates over the track run
    P.add('hull', box(0.045, 0.52, 5.9), s * 1.86, 1.20, -1.35);
    P.add('hullDark', box(0.02, 0.46, 5.85), s * 1.878, 1.18, -1.35);
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.44, 0.05), s * 1.66, 1.12, 2.42);               // front mud flaps (hullLengthM F anchor)
    P.add('hull', box(0.30, 0.42, 0.05), s * 1.40, 1.08, -4.86);              // rear mud flaps (hullLengthM R anchor)
    for (let i = 0; i < 8; i++) {                                            // fender edge bolt row
      P.add('hullDark', box(0.045, 0.02, 0.045), s * 1.80, 1.295, 1.3 - i * 0.70);
    }
  }
  // engine deck: center hatch + louvre banks + radiator humps
  P.add('hull', cylY(0.42, 0.42, 0.035, 18), 0, 1.875, -3.60);               // fan hatch
  P.add('hullDark', cylY(0.43, 0.43, 0.012, 18), 0, 1.872, -3.60);
  for (const s of [-1, 1]) {
    P.add('hull', box(1.00, 0.07, 1.55), s * 0.98, 1.875, -3.65);            // radiator humps to 1.91
    for (let i = 0; i < 6; i++) P.add('hullDark', box(0.88, 0.02, 0.10), s * 0.98, 1.915, -3.05 - i * 0.24);
    P.add('hullDark', cylY(0.095, 0.095, 0.50, 10), s * 0.28, 1.60, -4.62, 0.14, 0, 0); // exhaust pipes
    P.add('hullDetail', cylY(0.14, 0.14, 0.30, 10), s * 0.28, 1.48, -4.58, 0.14, 0, 0); // armored shrouds
    P.add('hullDetail', cylY(0.095, 0.13, 0.05, 10), s * 0.28, 1.83, -4.65, 0.14, 0, 0);
  }
  P.add('hullDark', box(1.9, 0.02, 0.10), 0, 1.868, -2.75);                  // forward deck grille
  // oracle-matched deep-wading intake tower over the rear deck (the print's
  // hull mesh carries this mass; gate hull rows demand it)
  P.add('hull', KIT.slab(
    [-1.02, 1.86, -2.06], [1.02, 1.86, -2.06], [1.00, 1.86, -3.42], [-1.00, 1.86, -3.42],
    [-1.02, 2.74, -2.10], [1.02, 2.74, -2.10], [1.00, 2.50, -3.40], [-1.00, 2.50, -3.40]));
  P.add('hullDark', box(1.70, 0.02, 1.05), 0, 2.66, -2.62, -0.08, 0, 0);       // tower top grille
  P.add('hull', box(0.55, 0.24, 0.30), 0, 2.20, 0.08);                         // driver periscope tower
  P.add('hullDark', box(0.42, 0.05, 0.05), 0, 2.30, 0.20);
  // bow furniture
  P.add('hull', sph(0.105, 12), 0.62, 1.44, 1.50);                           // bow MG ball on the glacis
  P.add('hullDark', cylZ(0.026, 0.26, 8), 0.62, 1.50, 1.64, -0.62, 0, 0);
  P.add('hull', box(0.34, 0.10, 0.26), -0.62, 1.72, 1.10, -0.62, 0, 0);      // driver periscope hood
  P.add('hullDark', box(0.26, 0.035, 0.05), -0.62, 1.745, 1.16, -0.62, 0, 0);
  lightsAndGuards(P, [-0.85], 1.90, 0.95, -0.15);                            // single Bosch light
  towHook(P, -1.15, 0.72, 2.24); towHook(P, 1.15, 0.72, 2.24);
  towHook(P, -1.10, 1.02, -4.50); towHook(P, 1.10, 1.02, -4.50);
  KIT.towCable(P, [[-1.62, 1.32, -3.2], [-1.70, 1.36, -1.2], [-1.62, 1.32, 0.8]]);
  fenderTools(P, 1.70, 1.315, 0.2);
  P.add('hullWood', box(0.28, 0.13, 0.62), 0.72, 1.44, -4.58, 0.42, 0, 0);   // jack block on the tail
  P.decal('hull', 'cross', null, 0.5, [1.578, 1.55, -1.4], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.5, [-1.578, 1.55, -1.4], -Math.PI / 2);

  // series Henschel turret: narrow front, sides splaying rearward
  P.turretG.position.set(0, 1.86, -0.65);
  P.add('turret', polyTurret([
    [-0.72, 1.06], [0.72, 1.06], [0.86, 0.76], [0.95, 0.15], [1.13, -0.28],
    [1.27, -0.70], [1.29, -1.00], [1.29, -1.22], [1.00, -1.40],
    [-1.00, -1.40], [-1.29, -1.22], [-1.29, -1.00], [-1.27, -0.70],
    [-1.13, -0.28], [-0.95, 0.15], [-0.80, 0.78],
  ], 0.72, 1.02, 0.74));
  // roof ramps rearward 2.60 -> 2.80 into the raised rear roof deck whose
  // crown carries the oracle's 3.03 band (z −1.06..−1.66 world, near full
  // width) — hatch rings are drawn INTO the deck, no proud drum above it
  P.add('turret', KIT.slab(
    [-0.86, 0.72, 0.80], [0.86, 0.72, 0.80], [0.83, 0.72, -0.30], [-0.83, 0.72, -0.30],
    [-0.86, 0.74, 0.78], [0.86, 0.74, 0.78], [0.83, 0.94, -0.30], [-0.83, 0.94, -0.30]));
  P.add('turret', KIT.frustum(1.04, -0.34, -1.10, 0.78, -0.42, -1.02, 0.72, 1.16)); // raised rear roof mound (crown 3.02, ±0.78)
  P.add('turret', box(1.44, 0.07, 1.00), 0, 1.195, -0.72);                   // mound cap plate -> published heightM 3.09 (p95)
  P.add('turret', cylY(0.30, 0.32, 0.045, 16), -0.45, 1.155, -0.72);         // cupola ring flush on the deck
  P.add('turretDark', cylY(0.325, 0.325, 0.014, 16), -0.45, 1.152, -0.72);   // ring seam
  P.add('turretDark', box(0.44, 0.016, 0.03), -0.45, 1.185, -0.72);          // split lid seam
  for (let k = 0; k < 6; k++) {                                              // cupola periscope slits
    const a = (k / 6) * Math.PI * 2 + 0.4;
    P.add('turretDark', box(0.07, 0.02, 0.05), -0.45 + Math.sin(a) * 0.24, 1.168, -0.72 + Math.cos(a) * 0.24, 0, a, 0);
  }
  P.add('turret', box(0.46, 0.035, 0.52), 0.45, 1.165, -0.72);               // loader hatch on the deck
  P.add('turretDark', box(0.47, 0.014, 0.03), 0.45, 1.19, -0.72);
  periscope(P, 'turretDetail', 0.42, 0.78, 0.45);
  P.add('turret', cylY(0.10, 0.12, 0.06, 10), 0.02, 0.80, 0.30);             // ventilator dome
  P.add('turretDark', box(0.34, 0.30, 0.035), 0, 0.30, -1.50);               // rear hatch seam
  P.add('turretDetail', box(0.40, 0.36, 0.045), 0, 0.30, -1.475);
  liftEye(P, 'turretDetail', -0.85, 0.74, 0.30, 0.5);
  liftEye(P, 'turretDetail', 0.85, 0.74, 0.30, -0.5);
  liftEye(P, 'turretDetail', 0.02, 0.74, -1.34, 1.6);
  for (const s of [-1, 1]) {                                                 // spare track links on the walls
    for (let i = 0; i < 3; i++) {
      P.add('turretTrack', box(0.035, 0.30, 0.50), s * (1.10 + i * 0.028), 0.30, -0.42 - i * 0.56, 0, s * 0.10, 0);
      P.add('turretDark', box(0.05, 0.06, 0.06), s * (1.12 + i * 0.028), 0.44, -0.42 - i * 0.56, 0, s * 0.10, 0);
    }
  }
  P.decal('turret', 'number', P.spec.visual.number || '204', 0.34, [1.17, 0.35, -0.85], Math.PI / 2, 0, 0.12);
  P.decal('turret', 'number', P.spec.visual.number || '204', 0.34, [-1.17, 0.35, -0.85], -Math.PI / 2, 0, -0.12);

  // turret-rear stowage bins on the bustle (oracle plan tail to −3.0)
  P.add('turret', box(1.24, 0.58, 0.60), 0, 0.50, -1.80);
  P.add('turretDark', box(1.14, 0.02, 0.50), 0, 0.795, -1.80);
  for (const xr of [-0.40, 0.40]) P.add('turretDark', box(0.022, 0.59, 0.61), xr, 0.50, -1.805);
  P.add('turret', box(1.02, 0.42, 0.28), 0, 0.42, -2.22);                    // tail bin

  // 8.8 cm KwK 43 L/71: saddle collar + long two-step tube + double baffle
  P.gunG.position.set(0, 0.40, 1.05);
  P.addGunExtra(KIT.cylX(0.28, 0.80, 16), 0, 0, 0);                          // trunnion saddle roll
  P.addGunExtra(sph(0.24, 12), 0, 0, 0.28);                                  // cast ball at the root
  P.addGunExtra(cylZ(0.215, 0.85, 14, 0.26), 0, 0, 0.50);                    // mantlet collar
  P.addGunExtraDark(cylZ(0.192, 0.045, 14), 0, 0, 0.88);                     // collar seam
  P.addGunExtra(box(0.55, 0.26, 0.52), 0, -0.26, 0.34);                      // cast chin under the root
  P.addGunExtraDark(cylZ(0.028, 0.12, 8), 0.36, 0.06, 0.30);                 // coax port
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.34, 0.36), s * 0.50, 0.40, 1.00, -0.10, s * -0.35, 0); // cheeks over the roll
  }
  buildGun(P, { len: 4.95, r: 0.078, brake: 'double', evac: null, sleeve: false, collar: false, baseR: 0.12 });
  P.add('gun', cylZ(0.102, 1.45, 14), 0, 0, 1.42);                           // fat rear tube section
  P.add('gun', cylZ(0.110, 0.08, 14), 0, 0, 2.18);                           // step ring
  P.add('gunDark', cylZ(0.103, 0.018, 14), 0, 0, 2.235);
  P.topY = 1.35;
}

// ---------------------------------------------------------------------------
// t34_85_cad — docs/references/tanks/t34_85_cad.md. Rear-shifted frame
// (zc −1.125), sloped sides, cast egg turret, bare 85 mm, 5 Christie wheels.
// ---------------------------------------------------------------------------
function buildT3485(P) {
  const { box, cylY, cylZ, cylX, sph, slab, lathe, frustum, buildRunningGear, buildGun, periscope, liftEye } = KIT;
  const zc = -1.125;
  const front = 1.72, rear = -3.97;

  // Christie gear: 5 big perforated wheels, REAR sprocket, no rollers
  const wheelZs = evenStations(5, 3.60, -1.15);
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.42, wheelW: 0.22, wheelY: 0.46, xc: 1.25, wheelZs,
    sprocket: { z: -3.50, y: 0.46, r: 0.33 },
    idler: { z: 1.26, y: 0.50, r: 0.30 },
    rollers: [], trackW: 0.50, topY: 0.94, botY: 0.055, arms: true, deadSag: 0.06,
  });
  wheelShadows(P, 1.25, wheelZs, 0.42, 0.22, -0.10);

  // hull: sloped side band over the tracks, flat roof, long glacis
  P.add('hull', box(2.06, 0.75, 5.35), 0, 0.55, zc);                         // belly
  P.add('hull', frustum(1.46, 0.52, -3.62, 1.385, 0.47, -3.58, 0.86, 1.60)); // sloped sponson band
  P.add('hull', box(2.78, 0.05, 4.05), 0, 1.595, -1.55);                     // roof plate
  P.add('hull', slab(                                                        // 60° glacis
    [-1.44, 0.90, 1.70], [1.44, 0.90, 1.70], [1.44, 0.92, 1.62], [-1.44, 0.92, 1.62],
    [-1.44, 0.94, 1.68], [1.44, 0.94, 1.68], [1.44, 1.60, 0.44], [-1.44, 1.60, 0.44]));
  P.add('hull', slab(                                                        // lower nose back to the idler
    [-1.30, 0.48, 1.28], [1.30, 0.48, 1.28], [1.42, 0.50, 1.66], [-1.42, 0.50, 1.66],
    [-1.30, 0.52, 1.30], [1.30, 0.52, 1.30], [1.44, 0.90, 1.72], [-1.44, 0.90, 1.72]));
  P.add('hull', box(2.60, 0.05, 0.55), 0, 1.53, -2.16);                      // grille recess deck
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.2, 0.02, 0.10), 0, 1.545, -1.95 - i * 0.18);
  P.add('hull', box(2.30, 0.09, 0.62), 0, 1.575, -2.75);                     // raised vent hump
  P.add('hullDark', box(2.0, 0.02, 0.42), 0, 1.625, -2.75);                  // mesh square
  P.add('hull', slab(                                                        // tail slope w/ round hatch
    [-1.28, 0.90, -3.10], [1.28, 0.90, -3.10], [1.18, 0.92, -3.88], [-1.18, 0.92, -3.88],
    [-1.28, 1.55, -3.06], [1.28, 1.55, -3.06], [1.18, 1.00, -3.86], [-1.18, 1.00, -3.86]));
  P.add('hullDetail', cylY(0.30, 0.30, 0.035, 16), 0, 1.32, -3.45, 0.58, 0, 0); // transmission hatch
  P.add('hull', box(2.42, 0.34, 0.08), 0, 0.72, -3.88);                      // tail plate
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.065, 0.22, 10), s * 0.55, 1.10, -3.86, 0.5, 0, 0);   // twin exhausts
    P.add('hullDetail', cylZ(0.078, 0.05, 10), s * 0.55, 1.115, -3.92, 0.5, 0, 0);
  }
  KIT.fenders(P, 1.04, 1.46, 0.93, -3.90, 1.85, 0.032);                      // fenders ±1.46 (tracks own ±1.50)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.42, 0.42, 0.05), s * 1.25, 0.80, 1.86);              // front mud flaps
    P.add('hull', box(0.40, 0.40, 0.05), s * 1.22, 0.78, -3.94);             // rear mud flaps (R anchor, inside overall)
    P.add('hullDetail', box(0.018, 0.018, 2.0), s * 1.435, 1.30, -1.4);      // sponson handrails
    for (const dz of [-2.2, -1.4, -0.6]) P.add('hullDetail', box(0.014, 0.09, 0.014), s * 1.435, 1.25, dz);
  }
  // glacis furniture
  P.add('hull', box(0.62, 0.10, 0.60), -0.45, 1.30, 1.06, -0.49, 0, 0);      // driver hatch plate
  P.add('hullDark', box(0.54, 0.02, 0.52), -0.45, 1.335, 1.05, -0.49, 0, 0); // hatch seam
  periscope(P, 'hullDetail', -0.60, 1.47, 0.72, -0.2);
  P.add('hull', sph(0.10, 12), 0.50, 1.24, 1.28);                            // bow MG ball
  P.add('hullDark', cylZ(0.024, 0.22, 8), 0.50, 1.28, 1.42, -0.45, 0, 0);
  lightsAndGuards(P, [-0.58], 1.30, 0.92, -0.45);
  towHook(P, -0.85, 0.75, 1.55); towHook(P, 0.85, 0.75, 1.55);
  // side stowage: flush fender boxes + saw (the print carries no side drums —
  // its only external stowage is the big rear-deck trunk; oracle wins)
  P.add('hull', box(0.26, 0.14, 0.80), 1.30, 1.03, -2.55);                   // right fender bin
  P.add('hullDark', box(0.27, 0.11, 0.024), 1.30, 1.04, -2.75);
  P.add('hull', box(0.30, 0.16, 0.85), -1.28, 1.05, 0.15);                   // left fender bin
  P.add('hullDark', box(0.31, 0.13, 0.024), -1.28, 1.06, 0.0);
  P.add('hull', box(1.05, 0.48, 0.52), 0, 1.86, -1.80);                      // rear-deck stowage trunk
  P.add('hullDark', box(1.07, 0.42, 0.026), 0, 1.84, -2.07);
  P.add('hullDark', box(0.026, 0.42, 0.54), -0.53, 1.84, -1.80);
  KIT.tarpRoll(P, 'hullCloth', -1.24, 1.02, -1.20, 0.90, 0.085, false);      // bedroll on the left fender
  KIT.towCable(P, [[-1.42, 1.05, -0.5], [-1.48, 1.10, 0.6], [-1.40, 1.05, 1.35]]);
  KIT.spareTrackStrip(P, 'hull', 0.55, 1.42, 0.62, 2, -0.49, 0);             // links on the glacis
  // bow spare-link rack riding the glacis line past the bow tip: the
  // published hullLengthM (6.1) F anchor (band > 12% with the glacis)
  P.add('hullTrack', box(0.44, 0.16, 0.52), 0, 1.06, 1.92);
  P.add('hullDark', box(0.36, 0.10, 0.03), 0, 1.06, 2.185);

  // cast egg turret, forward on the hull
  P.turretG.position.set(0, 1.63, -0.35);
  P.add('turret', lathe([
    [0.78, 0.00], [0.90, 0.09], [0.95, 0.24], [0.89, 0.42], [0.74, 0.55],
    [0.46, 0.62], [0.02, 0.635],
  ], P.q ? 30 : 16, 1.42), 0, 0, -0.20);
  P.add('turret', frustum(0.62, 1.02, 0.30, 0.55, 0.92, 0.34, 0.06, 0.50));  // mantlet cheek block
  // rear bustle stub (the oracle's rear roof holds ~2.2-2.4 to z −1.9)
  P.add('turret', box(1.46, 0.40, 0.34), 0, 0.26, -1.42);
  P.add('turretDark', box(1.34, 0.02, 0.26), 0, 0.47, -1.42);
  // roof furniture: cupola (left-rear), loader hatch, twin vents, periscopes
  P.add('turret', cylY(0.27, 0.29, 0.38, 16), -0.33, 0.78, -0.68);            // cupola drum (published-height carrier)
  P.add('turret', cylY(0.235, 0.235, 0.10, 16), -0.33, 1.045, -0.68);
  P.add('turret', cylY(0.20, 0.20, 0.045, 16), -0.33, 1.12, -0.68);
  P.add('turretDark', box(0.38, 0.015, 0.03), -0.33, 1.145, -0.68);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    P.add('turretGlass', box(0.05, 0.03, 0.028), -0.33 + Math.sin(a) * 0.225, 0.68, -0.68 + Math.cos(a) * 0.225, 0, a, 0);
  }
  P.add('turret', cylY(0.20, 0.22, 0.05, 14), 0.38, 0.615, -0.42);           // loader hatch
  P.add('turret', cylY(0.175, 0.175, 0.026, 14), 0.38, 0.67, -0.42);
  P.add('turretDark', box(0.28, 0.014, 0.03), 0.38, 0.693, -0.42);
  P.add('turret', cylY(0.11, 0.13, 0.07, 10), 0.10, 0.63, -0.92);            // twin ventilator domes
  P.add('turret', cylY(0.11, 0.13, 0.07, 10), -0.18, 0.625, -1.10);
  periscope(P, 'turretDetail', 0.28, 0.64, 0.05);
  // whip antenna on the roof (oracle carries one at its LEFT, to ~3.2 m)
  P.add('turretDetail', cylY(0.035, 0.045, 0.10, 8), -0.52, 0.66, -0.25);    // base pot
  P.add('turretDetail', box(0.018, 0.90, 0.018), -0.52, 1.14, -0.25, 0, 0, -0.03);
  for (const s of [-1, 1]) {                                                 // turret handrails
    P.add('turretDetail', box(0.018, 0.018, 1.15), s * 0.94, 0.30, -0.45, 0, s * 0.06, 0);
    for (const dz of [-0.95, -0.45, 0.05]) P.add('turretDetail', box(0.06, 0.016, 0.016), s * 0.90, 0.30, dz, 0, s * 0.06, 0);
  }
  P.decal('turret', 'number', P.spec.visual.number || '85', 0.30, [0.93, 0.28, -0.45], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '85', 0.30, [-0.93, 0.28, -0.45], -Math.PI / 2, 0, -0.10);

  // 85 mm ZiS-S-53: narrow cast mantlet, recoil sleeve, bare tube (no brake)
  // batch-7 oracle repair zeroed the print's 1.78deg rest yaw about its own
  // ring: the replicated +0.15 gun x offset is DROPPED (tube on centerline).
  P.gunG.position.set(0, 0.25, 0.85);
  P.addGunExtra(cylX(0.17, 0.46, 14), 0, 0, 0.02);                           // trunnion roll
  P.addGunExtra(box(0.44, 0.40, 0.30), 0, 0, 0.14);                          // cradle block
  P.addGunExtra(cylZ(0.115, 0.55, 12, 0.15), 0, 0, 0.42);                    // rounded mantlet sleeve
  P.addGunExtraDark(cylZ(0.024, 0.10, 8), 0.24, 0.05, 0.40);                 // coax port
  buildGun(P, { len: 3.63, r: 0.055, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.10 });
  P.add('gun', KIT.cylZ(0.066, 0.10, 12), 0, 0, 3.56);                       // muzzle collar (overallLengthM anchor pixels)
  P.topY = 0.90;
}

// ---------------------------------------------------------------------------
// newc_tiger — docs/references/tanks/newc_tiger.md. Stylized Tiger I: slab
// hull, wide drum turret w/ rear bin, 8.8 L/56 w/ double baffle, interleaved
// dished wheels behind ±1.85 fender flare.
// ---------------------------------------------------------------------------
function buildNewcTiger(P) {
  const { box, cylY, cylZ, cylX, sph, slab, polyTurret, buildRunningGear, buildGun, periscope, liftEye } = KIT;
  const front = 3.10, rear = -3.10;

  const wheelZs = evenStations(8, 4.05, -0.18);
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.37, wheelW: 0.24, wheelY: 0.40, xc: 1.38, wheelZs,
    layers: [[0.12], [-0.06]], recessDepth: 0.25, bayShadowTop: 0.98,
    sprocket: { z: 2.26, y: 0.44, r: 0.34 },
    idler: { z: -2.62, y: 0.42, r: 0.32 },
    rollers: [], trackW: 0.62, trackTh: 0.11, topY: 0.94, botY: 0.06,
  });

  // hull
  P.add('hull', box(2.10, 0.72, 5.90), 0, 0.50, -0.02);                      // belly
  P.add('hull', box(3.04, 0.75, 5.20), 0, 1.32, -0.32);                      // superstructure ±1.52
  P.add('hull', box(3.00, 0.045, 5.15), 0, 1.70, -0.32);                     // roof plate
  P.add('hull', box(3.40, 0.42, 0.55), 0, 0.92, 2.84);                       // bow block (full track width)
  P.add('hull', slab(                                                        // small glacis
    [-1.51, 1.10, 3.06], [1.51, 1.10, 3.06], [1.52, 1.12, 2.78], [-1.52, 1.12, 2.78],
    [-1.51, 1.14, 3.04], [1.51, 1.14, 3.04], [1.52, 1.44, 2.36], [-1.52, 1.44, 2.36]));
  P.add('hull', slab(                                                        // vertical driver plate
    [-1.51, 1.42, 2.36], [1.51, 1.42, 2.36], [1.51, 1.42, 2.22], [-1.51, 1.42, 2.22],
    [-1.51, 1.46, 2.34], [1.51, 1.46, 2.34], [1.51, 1.70, 2.20], [-1.51, 1.70, 2.20]));
  P.add('hull', box(3.00, 0.05, 1.45), 0, 1.725, -1.72);                     // raised rear deck
  for (const s of [-1, 1]) {
    P.add('hull', box(0.95, 0.045, 1.30), s * 0.80, 1.765, -1.72);           // radiator humps
    for (let i = 0; i < 4; i++) P.add('hullDark', box(0.82, 0.018, 0.09), s * 0.80, 1.790, -1.30 - i * 0.26);
  }
  P.add('hull', slab(                                                        // tail slope
    [-1.45, 0.85, -2.42], [1.45, 0.85, -2.42], [1.36, 0.85, -2.98], [-1.36, 0.85, -2.98],
    [-1.45, 1.70, -2.42], [1.45, 1.70, -2.42], [1.36, 1.06, -2.96], [-1.36, 1.06, -2.96]));
  P.add('hull', box(2.60, 0.45, 0.10), 0, 0.66, -2.98);                      // tail plate
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.105, 0.105, 0.55, 10), s * 0.48, 1.42, -2.90);  // exhaust stacks
    P.add('hullDetail', box(0.32, 0.62, 0.06), s * 0.48, 1.38, -2.80);       // shroud plates
    P.add('hullDetail', cylY(0.105, 0.135, 0.05, 10), s * 0.48, 1.72, -2.90);
  }
  KIT.fenders(P, 1.52, 1.85, 1.00, -2.52, 2.14, 0.04);                       // fender flare ±1.85
  for (const s of [-1, 1]) {
    P.add('hull', box(0.32, 0.44, 0.05), s * 1.68, 0.86, 3.14);              // front mud flaps (hullLengthM F anchor)
    P.add('hull', box(0.32, 0.42, 0.05), s * 1.68, 0.84, -3.14);             // rear mud flaps (R anchor)
    for (let i = 0; i < 7; i++) P.add('hullDark', box(0.045, 0.02, 0.045), s * 1.77, 1.025, 1.75 - i * 0.72);
  }
  // front plate furniture
  P.add('hullDetail', box(0.42, 0.16, 0.05), -0.55, 1.58, 2.115);            // driver visor
  P.add('hullDark', box(0.34, 0.05, 0.03), -0.55, 1.58, 2.14);
  P.add('hull', sph(0.10, 12), 0.55, 1.56, 2.12);                            // bow MG ball
  P.add('hullDark', cylZ(0.024, 0.24, 8), 0.55, 1.58, 2.26, -0.08, 0, 0);
  lightsAndGuards(P, [0], 1.76, 2.10, -0.2);                                 // center Bosch light
  towHook(P, -1.05, 0.88, 2.80); towHook(P, 1.05, 0.88, 2.80);
  KIT.towCable(P, [[-1.60, 1.06, -1.6], [-1.68, 1.09, 0.2], [-1.60, 1.06, 1.9]]);
  fenderTools(P, 1.66, 1.045, 0.4);
  P.add('hullWood', box(0.26, 0.12, 0.60), -1.66, 1.09, -1.6);               // jack on the left fender
  for (let k = 0; k < 4; k++) {                                              // links flat on the bow face
    P.add('hullTrack', box(0.40, 0.17, 0.045), -0.68 + k * 0.46, 1.00, 2.94);
    P.add('hullTrack', box(0.34, 0.05, 0.06), -0.68 + k * 0.46, 1.02, 2.955);
  }
  P.decal('hull', 'cross', null, 0.5, [1.525, 1.35, 0.9], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.5, [-1.525, 1.35, 0.9], -Math.PI / 2);

  // wide drum turret, skirt hanging below the roof line
  P.turretG.position.set(0, 1.70, -0.10);
  P.add('turret', KIT.xform(polyTurret([
    [-0.55, 1.26], [0.55, 1.26], [0.95, 0.85], [1.14, 0.35], [1.17, 0.0],
    [1.10, -0.42], [0.92, -0.75], [0.70, -1.05], [0.55, -1.30],
    [-0.55, -1.30], [-0.70, -1.05], [-0.92, -0.75], [-1.10, -0.42],
    [-1.17, 0.0], [-1.14, 0.35], [-0.95, 0.85],
  ], 0.93, 1.0, 0.95), 0, -0.19, 0));
  P.add('turret', cylY(0.33, 0.35, 0.34, 16), -0.55, 0.94, -0.12);            // drum cupola (published-height carrier)
  P.add('turret', cylY(0.29, 0.29, 0.10, 16), -0.55, 1.20, -0.12);
  P.add('turret', cylY(0.25, 0.25, 0.05, 16), -0.55, 1.275, -0.12);
  P.add('turretDark', box(0.46, 0.016, 0.03), -0.55, 1.305, -0.12);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.5;
    P.add('turretDark', box(0.11, 0.05, 0.03), -0.55 + Math.sin(a) * 0.34, 0.88, -0.12 + Math.cos(a) * 0.34, 0, a, 0);
  }
  P.add('turret', cylY(0.21, 0.23, 0.045, 14), 0.45, 0.755, -0.45);          // loader hatch
  P.add('turret', cylY(0.185, 0.185, 0.026, 14), 0.45, 0.805, -0.45);
  P.add('turretDark', box(0.30, 0.014, 0.03), 0.45, 0.825, -0.45);
  P.add('turret', box(1.30, 0.56, 0.44), 0, 0.42, -1.18);                    // rear bin
  P.add('turretDark', box(1.20, 0.02, 0.36), 0, 0.715, -1.18);
  for (const xr of [-0.42, 0.42]) P.add('turretDark', box(0.022, 0.57, 0.45), xr, 0.42, -1.185);
  P.add('turretDetail', cylX(0.09, 0.035, 12), 1.06, 0.35, -0.45);           // side pistol port
  P.add('turretDark', cylX(0.035, 0.04, 8), 1.065, 0.35, -0.45);
  periscope(P, 'turretDetail', 0.30, 0.77, 0.55);
  liftEye(P, 'turretDetail', -0.85, 0.76, 0.45, 0.5);
  liftEye(P, 'turretDetail', 0.85, 0.76, 0.45, -0.5);
  P.decal('turret', 'cross', null, 0.36, [1.10, 0.30, -0.25], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'cross', null, 0.36, [-1.10, 0.30, -0.25], -Math.PI / 2, 0, -0.06);

  // 8.8 cm KwK 36 L/56: wide flat mantlet + double-baffle brake.
  // batch-7 oracle repair re-seated the print's whole turret assembly onto
  // the hull axis: the replicated +0.10 gun x offset is DROPPED.
  P.gunG.position.set(0, 0.37, 0.75);
  P.addGunExtra(box(1.55, 0.60, 0.30), 0, 0, 0.48);                          // wide mantlet block
  P.addGunExtra(cylX(0.26, 1.48, 14), 0, 0, 0.40);                           // mantlet roll top
  P.addGunExtraDark(cylZ(0.028, 0.12, 8), 0.40, 0.08, 0.62);                 // coax port
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), -0.42, 0.10, 0.62);                // sight port
  P.add('turret', box(1.52, 0.68, 0.10), 0, 0.42, 1.235);                    // sealing face plate
  P.addGunExtra(cylZ(0.13, 0.40, 14, 0.16), 0, 0, 0.70);                     // root collar
  buildGun(P, { len: 4.50, r: 0.068, brake: 'double', evac: null, sleeve: false, collar: false, baseR: 0.115 });
  P.add('gun', cylZ(0.094, 1.30, 14), 0, 0, 1.55);                           // fat rear section
  P.add('gun', cylZ(0.101, 0.08, 14), 0, 0, 2.25);                           // step ring
  P.add('gunDark', cylZ(0.095, 0.018, 14), 0, 0, 2.30);
  P.topY = 1.10;
}

// ---------------------------------------------------------------------------
// leichttraktor — docs/references/tanks/leichttraktor.md. Stylized VK 31:
// rear turret, raised cab, tall riveted track frames, thin 37 mm over the deck.
// ---------------------------------------------------------------------------
function buildLeichttraktor(P) {
  const { box, cylY, cylZ, slab, lathe, buildRunningGear, buildGun, periscope } = KIT;

  const wheelZs = evenStations(6, 2.70, -0.05);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.84, wheelR: 0.185, wheelW: 0.13, wheelY: 0.21, xc: 0.90, wheelZs,
    sprocket: { z: -1.72, y: 0.50, r: 0.28 },
    idler: { z: 1.70, y: 0.52, r: 0.30 },
    rollers: [], trackW: 0.34, topY: 1.06, botY: 0.05, deadSag: 0.04,
  });
  // tall riveted track frames over the running gear (oracle: solid ±1.14 band)
  for (const s of [-1, 1]) {
    const xi = s > 0 ? 1.09 : -1.14, xo = s > 0 ? 1.14 : -1.09;              // [minX, maxX] per side
    P.add('hull', box(0.05, 0.72, 3.55), s * 1.115, 0.82, -0.05);            // outer frame plate
    P.add('hull', box(0.07, 0.09, 3.60), s * 1.10, 1.19, -0.05);             // top rail
    P.add('hull', slab(                                                      // front horn to the idler
      [xi, 0.60, 2.12], [xo, 0.60, 2.12], [xo, 0.60, 1.72], [xi, 0.60, 1.72],
      [xi, 0.86, 2.10], [xo, 0.86, 2.10], [xo, 1.18, 1.70], [xi, 1.18, 1.70]));
    P.add('hull', slab(                                                      // rear horn to the sprocket
      [xi, 0.58, -1.76], [xo, 0.58, -1.76], [xo, 0.58, -2.10], [xi, 0.58, -2.10],
      [xi, 1.18, -1.74], [xo, 1.18, -1.74], [xo, 0.84, -2.08], [xi, 0.84, -2.08]));
    for (let i = 0; i < 9; i++) {                                            // frame rivet row
      P.add('hullDark', box(0.02, 0.035, 0.035), s * 1.145, 1.10, 1.55 - i * 0.39);
      P.add('hullDark', box(0.02, 0.035, 0.035), s * 1.145, 0.52, 1.55 - i * 0.39);
    }
    for (const z of [-1.35, -0.35, 0.65]) {                                  // mud chute slots
      P.add('hullDark', box(0.02, 0.28, 0.05), s * 1.142, 0.82, z);
    }
  }

  // hull: engine bow + raised cab + rear fighting deck
  P.add('hull', box(2.00, 1.00, 3.60), 0, 1.00, 0.02);                       // main body ±1.0
  P.add('hull', slab(                                                        // glacis
    [-1.00, 1.30, 2.06], [1.00, 1.30, 2.06], [1.00, 1.32, 1.98], [-1.00, 1.32, 1.98],
    [-1.00, 1.34, 2.04], [1.00, 1.34, 2.04], [1.00, 1.52, 1.42], [-1.00, 1.52, 1.42]));
  P.add('hull', slab(                                                        // nose beak
    [-0.82, 0.84, 2.24], [0.82, 0.84, 2.24], [0.90, 0.86, 2.04], [-0.90, 0.86, 2.04],
    [-0.82, 0.88, 2.24], [0.82, 0.88, 2.24], [0.90, 1.30, 2.08], [-0.90, 1.30, 2.08]));
  P.add('hull', box(2.00, 0.10, 1.40), 0, 1.50, 1.35);                       // fore deck 1.55
  P.add('hull', box(1.30, 0.28, 0.55), 0, 1.63, 0.35);                       // raised driver cab
  P.add('hullDark', box(0.72, 0.05, 0.03), 0, 1.70, 0.635);                  // cab visor slit
  P.add('hullDark', box(0.03, 0.05, 0.30), 0.66, 1.70, 0.42);                // cab side slits
  P.add('hullDark', box(0.03, 0.05, 0.30), -0.66, 1.70, 0.42);
  P.add('hull', box(2.00, 0.20, 1.85), 0, 1.59, -0.88);                      // rear fighting deck 1.69
  P.add('hull', slab(                                                        // tail slope
    [-0.95, 0.80, -1.78], [0.95, 0.80, -1.78], [0.85, 0.82, -2.18], [-0.85, 0.82, -2.18],
    [-0.95, 1.66, -1.78], [0.95, 1.66, -1.78], [0.85, 1.14, -2.16], [-0.85, 1.14, -2.16]));
  // engine hatches + intake + exhaust muffler along the right fender
  P.add('hullDetail', box(0.55, 0.035, 0.55), -0.42, 1.522, 1.35);
  P.add('hullDetail', box(0.55, 0.035, 0.55), 0.42, 1.522, 1.35);
  for (let i = 0; i < 3; i++) P.add('hullDark', box(0.42, 0.018, 0.05), -0.42, 1.545, 1.52 - i * 0.17);
  P.add('hullDark', cylZ(0.075, 0.85, 10), 0.88, 1.52, 1.05);                // muffler pipe (on the deck)
  P.add('hullDetail', cylZ(0.08, 0.05, 10), 0.88, 1.52, 0.60);
  P.add('hullDetail', box(0.06, 0.10, 0.55), 0.88, 1.47, 1.05);              // muffler saddle brackets
  lightsAndGuards(P, [-0.55, 0.55], 1.30, 1.90, -0.3);                       // seated on the glacis (floater fix)
  P.add('hullDetail', box(0.10, 0.06, 0.16), -0.55, 1.24, 1.92);             // light brackets
  P.add('hullDetail', box(0.10, 0.06, 0.16), 0.55, 1.24, 1.92);
  towHook(P, -0.45, 0.90, 2.18); towHook(P, 0.45, 0.90, 2.18);
  for (let i = 0; i < 6; i++) {                                              // hull rivet rows
    P.add('hullDark', box(0.03, 0.03, 0.02), -0.99 - 0.008, 1.44, 1.25 - i * 0.55);
    P.add('hullDark', box(0.03, 0.03, 0.02), 0.99 + 0.008, 1.44, 1.25 - i * 0.55);
  }

  // rear round turret with cupola
  P.turretG.position.set(0, 1.69, -0.82);
  P.add('turret', lathe([
    [0.68, -0.16], [0.77, 0.0], [0.80, 0.20], [0.74, 0.44], [0.56, 0.55], [0.02, 0.58],
  ], P.q ? 28 : 14, 1.06), 0, 0, -0.05);
  P.add('turret', cylY(0.29, 0.305, 0.18, 14), -0.10, 0.625, -0.02);         // cupola drum (heightM p95 carrier)
  P.add('turret', cylY(0.26, 0.26, 0.028, 14), -0.10, 0.725, -0.02);
  P.add('turretDark', box(0.40, 0.014, 0.028), -0.10, 0.746, -0.02);
  for (let k = 0; k < 4; k++) {                                              // dome vision slits
    const a = (k / 4) * Math.PI * 2 + 0.8;
    P.add('turretDark', box(0.09, 0.04, 0.026), Math.sin(a) * 0.66, 0.22, -0.02 + Math.cos(a) * 0.66, 0, a, 0);
  }
  for (let k = 0; k < 10; k++) {                                             // dome base rivets
    const a = (k / 10) * Math.PI * 2;
    P.add('turretDark', box(0.028, 0.028, 0.02), Math.sin(a) * 0.76, -0.06, -0.02 + Math.cos(a) * 0.76, 0, a, 0);
  }
  periscope(P, 'turretDetail', 0.30, 0.545, -0.30);
  P.decal('turret', 'number', P.spec.visual.number || '13', 0.22, [0.78, 0.16, -0.05], Math.PI / 2, 0, 0.08);
  P.decal('turret', 'number', P.spec.visual.number || '13', 0.22, [-0.78, 0.16, -0.05], -Math.PI / 2, 0, -0.08);

  // thin 37 mm + coax MG, tube stays over the deck (no bow overhang).
  // The print's tube barely passes its bow: published overallLengthM is
  // split between a shorter tube and a rear tow-skid so the short-gun
  // cover cost stays minimal (dims sovereign).
  P.gunG.position.set(0, 0.30, 0.30);
  P.addGunExtra(box(0.52, 0.32, 0.20), 0, 0, 0.42);                          // small mantlet plate
  P.addGunExtraDark(cylZ(0.020, 0.26, 6), 0.20, 0.02, 0.52);                 // coax MG
  P.addGunExtra(cylZ(0.050, 0.30, 10, 0.066), 0, 0, 0.62);                   // sleeve
  buildGun(P, { len: 2.95, r: 0.030, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.058 });
  P.add('hull', box(0.30, 0.05, 0.26), 0, 1.045, -2.31);                     // rear tow bar (overall R anchor,
  P.add('hullDark', box(0.10, 0.09, 0.06), 0, 1.03, -2.43);                  //  band-THIN so hullLengthM stays put)
  P.topY = 0.85;
}

export const WW2_PROFILES = {
  t34_85_cad: { build: buildT3485 },
  newc_tiger: { build: buildNewcTiger },
  newc_pziii: { build: buildNewcPziii },
  pziii_konserwa: { build: buildPziiiKonserwa },
  leichttraktor: { build: buildLeichttraktor },
  q_heavy: { build: buildQHeavy },
  tiger2: { build: buildTiger2 },
  sherman_jumbo: { build: buildShermanJumbo },
};
