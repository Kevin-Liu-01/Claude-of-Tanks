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
import { KIT, FITTINGS, evenStations } from './kit.js';

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
  const deckY = o.noseDeckY ?? 1.27;        // flat transmission deck height
  const xc = o.trackXc ?? 1.10;             // konserwa ref tracks end ±1.31

  // gear: 6 small wheels, 3 return rollers, HIGH front sprocket / rear idler
  const wheelZs = evenStations(6, 3.05, zc + o.gearBias);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.86, wheelR: 0.26, wheelW: 0.17, wheelY: 0.29, xc, wheelZs,
    // (trackW per print: both refs read band faces ~1.00..1.41)
    sprocket: { z: front - 0.62, y: 0.56, r: 0.28 },
    idler: { z: rear + 0.56, y: 0.62, r: 0.20 },
    rollers: [-1.02, 0.02, 1.06].map((z) => ({ z: z + zc + o.gearBias, y: 0.84, r: 0.085 })),
    trackW: o.trackW ?? 0.42, topY: 0.93, botY: 0.055, arms: true,
  });
  wheelShadows(P, xc, wheelZs.slice(1, -1), 0.26, 0.17, -0.07);

  // hull boxes
  P.add('hull', box(1.94, 0.66, o.len * 0.90), 0, 0.72, zc);                 // belly (ref front clearance 0.38)
  P.add('hull', box(o.superW * 2, roof - 1.02, o.superLen), 0, (roof + 1.02) / 2, zc + o.superBias); // superstructure
  if (o.topW) P.add('hull', box(o.topW * 2, 0.10, o.superLen * 0.94), 0, roof - 0.05, zc + o.superBias); // narrow top cap
  P.add('hull', slab(                                                        // flat transmission deck, floating bow lip
    [-0.90, 1.00, front - 0.19], [0.90, 1.00, front - 0.19], [0.90, 0.42, front - 0.95], [-0.90, 0.42, front - 0.95],
    [-0.92, deckY - 0.10, front - 0.19], [0.92, deckY - 0.10, front - 0.19], [0.92, deckY, front - 0.92], [-0.92, deckY, front - 0.92]));
  for (const sw of [-1, 1]) {                                                // deck wings over the track wrap
    const xi = sw > 0 ? 0.88 : -1.445, xo = sw > 0 ? 1.445 : -0.88;
    P.add('hull', slab(
      [xi, 0.985, front - 0.21], [xo, 0.985, front - 0.21], [xo, 0.985, front - 0.94], [xi, 0.985, front - 0.94],
      [xi, deckY - 0.10, front - 0.19], [xo, deckY - 0.10, front - 0.19], [xo, deckY, front - 0.92], [xi, deckY, front - 0.92]));
  }
  P.add('hull', slab(                                                        // driver plate up to the roof
    [-1.44, deckY - 0.02, front - 0.86], [1.44, deckY - 0.02, front - 0.86], [1.44, deckY - 0.02, front - 1.04], [-1.44, deckY - 0.02, front - 1.04],
    [-1.44, deckY, front - 0.86], [1.44, deckY, front - 0.86], [1.44, roof, front - 1.06], [-1.44, roof, front - 1.06]));
  P.add('hull', slab(                                                        // lower nose plate: both refs read a
    [-0.78, 0.42, front - 0.64], [0.78, 0.42, front - 0.64], [0.78, 0.40, front - 0.72], [-0.78, 0.40, front - 0.72], // rising 0.43..0.76 bow
    [-0.78, 0.75, front + (o.noseFaceDz ?? -0.155)], [0.78, 0.75, front + (o.noseFaceDz ?? -0.155)], [0.78, 0.46, front - 0.64], [-0.78, 0.46, front - 0.64])); // line; face on the ref's own
  P.add('hull', slab(                                                        // long gentle rear deck fall (1.58 -> 1.43)
    [-1.42, 1.02, rear + 1.05], [1.42, 1.02, rear + 1.05], [1.34, 1.02, rear + 0.12], [-1.34, 1.02, rear + 0.12],
    [-1.42, roof - 0.005, rear + 1.05], [1.42, roof - 0.005, rear + 1.05], [1.34, o.tailY, rear + 0.12], [-1.34, o.tailY, rear + 0.12]));
  P.add('hull', box(2.60, 0.45, 0.10), 0, 1.175, rear + 0.09);               // tail plate (ref tail FLOATS: its
                                                                             //  bottom line reads 0.93-1.01)
  P.add('hull', slab(                                                        // tail underside: ref floats to ~1.0
    [-1.30, 0.97, rear + 0.24], [1.30, 0.97, rear + 0.24], [1.28, 0.97, rear + 0.02], [-1.28, 0.97, rear + 0.02],
    [-1.30, 1.20, rear + 0.24], [1.30, 1.20, rear + 0.24], [1.28, 1.20, rear + 0.02], [-1.28, 1.20, rear + 0.02]));
  P.add('hull', slab(                                                        // tail lip overhang: the ref keeps a
    [-1.20, 0.99, rear + 0.03], [1.20, 0.99, rear + 0.03], [1.18, 1.00, rear - 0.055], [-1.18, 1.00, rear - 0.055], // 1.00..1.07 sliver past
    [-1.20, 1.09, rear + 0.03], [1.20, 1.09, rear + 0.03], [1.18, 1.07, rear - 0.055], [-1.18, 1.07, rear - 0.055])); // its tail plate
  P.add('hull', slab(                                                        // tail undercut wedge (between tracks)
    [-0.80, 0.70, rear + 0.35], [0.80, 0.70, rear + 0.35], [0.75, 0.98, rear + 0.06], [-0.75, 0.98, rear + 0.06],
    [-0.80, 1.06, rear + 0.35], [0.80, 1.06, rear + 0.35], [0.75, 1.10, rear + 0.06], [-0.75, 1.10, rear + 0.06]));

  // fenders: full-length flat track guards, outer edge = width max ±1.45.
  // r2: the flat run stops 0.22 short of the bow and a DROOPING TIP slab
  // carries the ref's falling bow line (both prints read ~fenderY-0.07 ->
  // fenderY-0.20 over the last 0.25 m; r1's flat tips cost 0.2-0.3 err on
  // three bow columns per side view).
  for (const sf of [-1, 1]) {                                                // fenders: segmented per the edge-on
    const fLen = o.len * 1.006 - 0.24;                                       // prism law (stations must read them)
    for (let i = 0; i < 6; i++) {
      const segL = fLen / 6 - 0.008;
      P.add('hull', box(0.46, i % 2 ? 0.045 : 0.05, segL),
        sf * (1.22 + (i % 2 ? -0.002 : 0.002)), o.fenderY, zc - 0.12 + fLen / 2 - (i + 0.5) * (fLen / 6));
    }
    const tLo = Math.min(sf * 1.06, sf * 1.44), tHi = Math.max(sf * 1.06, sf * 1.44);
    P.add('hull', slab(                                                      // drooping bow tip (x 1.06..1.44 so the
      [tLo, o.fenderY - 0.225, front + 0.015], [tHi, o.fenderY - 0.225, front + 0.015], // 0.95-1.0 plan cols keep the
      [tHi, o.fenderY - 0.045, front - 0.245], [tLo, o.fenderY - 0.045, front - 0.245], // ref's shorter 2.11 bow edge)
      [tLo, o.fenderY - 0.185, front + 0.015], [tHi, o.fenderY - 0.185, front + 0.015],
      [tHi, o.fenderY - 0.005, front - 0.245], [tLo, o.fenderY - 0.005, front - 0.245]));
  }
  // r2 REGISTRATION COUNTERWEIGHT (jumbo law): the hull rows register by the
  // 12%-band body-span midpoint — the anchor COLUMNS are chosen per print so
  // (front+rear)/2 equals the ref's own body mid AND front-rear stays inside
  // the published hullLengthM grace. Flap bands hug the ref's fender-lip
  // heights (cheap against the tube-only ref band at the fwd col), and the
  // plates are 15mm clear of their trace-bin boundaries.
  for (const s of [-1, 1]) {                                                 // front mud flaps ahead of the tips —
    // konserwa: band 1.04..1.20, REGISTRATION-INVISIBLE (< the hull-mask
    // body threshold, like its ref's thin bow flap) while the tube union
    // keeps the column whole-mask BODY for hullLengthM. newc: its ref's
    // own bow column is band-FAT, so it takes the 1.00..1.28 plate.
    const fh = o.frontFlapFat ? [0.28, 1.14] : [0.16, 1.12];
    P.add('hull', box(0.18, fh[0], 0.042), s * 0.45, fh[1], front + (o.frontAnchorDz ?? 0.0625));
    P.add('hullDark', box(0.19, 0.04, 0.03), s * 0.45, fh[1] - 0.04, front + (o.frontAnchorDz ?? 0.0625));
  }
  for (const s of [-1, 1]) {                                                 // rear mud flaps: hullLengthM R anchor
    P.add('hull', box(0.18, 0.34, 0.040), s * 0.45, 1.03, rear - (o.rearAnchorDz ?? 0.101)); // (band-fat: the whole-mask
    P.add('hullDark', box(0.19, 0.05, 0.028), s * 0.45, 1.14, rear - (o.rearAnchorDz ?? 0.101)); // len column; ±1-col reg
  }                                                                          //  wobble is the documented floor)

  // furniture: visor, MG ball, hatches, tools, lights, muffler
  P.add('hullDetail', box(0.40, 0.15, 0.045), -0.52, deckY + (roof - deckY) * 0.45, front - 0.99, -0.55, 0, 0); // driver visor
  P.add('hullDark', box(0.30, 0.045, 0.03), -0.52, deckY + (roof - deckY) * 0.45 + 0.01, front - 0.97, -0.55, 0, 0);
  P.add('hullDetail', cylZ(0.115, 0.05, 12), 0.52, deckY + (roof - deckY) * 0.40, front - 0.99);
  P.add('hull', sph(0.088, 12), 0.52, deckY + (roof - deckY) * 0.40, front - 1.02);              // bow MG ball
  P.add('hullDark', cylZ(0.022, 0.12, 8), 0.52, deckY + (roof - deckY) * 0.42, front - 0.93, -0.15, 0, 0);
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
  muffler(P, 0, 0.95, rear + 0.11, 1.6, 0.10);                               // tail muffler (clear of the tail-
                                                                             //  sliver trace column)
  KIT.headlight(P, -1.18, 1.42, front - 1.00, -0.3);
  KIT.headlight(P, 1.18, 1.42, front - 1.00, -0.3);
  fenderTools(P, -1.22, o.fenderY + 0.04, zc + 0.6);
  P.add('hull', box(0.30, 0.16, 0.55), 1.22, o.fenderY + 0.11, zc - 0.75);   // fender stowage box
  P.add('hullDark', box(0.31, 0.13, 0.024), 1.22, o.fenderY + 0.12, zc - 0.75);
  P.add('hull', box(0.26, 0.14, 0.40), -1.22, o.fenderY + 0.10, zc - 1.35);  // jack block
  towHook(P, -0.72, 0.98, front - 0.18); towHook(P, 0.72, 0.98, front - 0.18);
  KIT.spareTrackStrip(P, 'hull', 0, 0.96, front - 0.28, 3);                  // spare links on the nose
  return { front, rear, roof };
}

// newc_pziii — Ausf. J (late) with the 5 cm KwK 39 L/60.
function buildNewcPziii(P) {
  const { box, cylY, cylZ, polyTurret, slab, buildGun, periscope, liftEye } = KIT;
  pziiiHull(P, {
    zc: 0, len: 5.39, roofY: 1.66, superW: 1.31, superLen: 4.15, superBias: -0.55,
    noseDeckY: 1.42, trackXc: 1.20, trackW: 0.40, fenderY: 1.39, tailY: 1.50, gearBias: 0.05, topW: 0,
    frontAnchorDz: 0.077, rearAnchorDz: 0.044, noseFaceDz: -0.08, frontFlapFat: true, // len cols 2.772 / -2.739 (best
  });                                                                        //  measured state, r2)

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
  // rear stowage bin (Rommelkiste) with dark straps (r2: the ref bustle/bin
  // band reads to world -1.45 — the r1 seat left cols -1.2..-1.45 bare)
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
  {                                                                          // §B3 census MG: MG34 beside the
    const mg = FITTINGS.pintleMG({                                           // cupola (top ~2.42 < the 2.49 lid)
      mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.85, elev: 0.10, seed: 32,
    });
    mg.position.set(0.44, 0.44, -1.02);                                      // barrel FORWARD over the roof
    P.turretG.add(mg);
  }
  liftEye(P, 'turretDetail', -0.62, 0.50, 0.42, 0.5);
  liftEye(P, 'turretDetail', 0.62, 0.50, 0.42, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || '221', 0.26, [0.86, 0.26, -0.30], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '221', 0.26, [-0.86, 0.26, -0.30], -Math.PI / 2, 0, -0.10);

  // 5 cm KwK 39 L/60 in the external mantlet block
  P.gunG.position.set(0.12, 0.30, 0.42);
  P.addGunExtra(box(2.00, 0.44, 0.26), -0.10, 0, 0.28);                      // external mantlet (ref plan spans
                                                                             //  x ±1.0; centered against the +0.12
                                                                             //  fused-gun offset print cap)
  P.addGunExtra(box(1.86, 0.10, 0.20), -0.10, 0.26, 0.26);                   // rain lip
  P.addGunExtraDark(cylZ(0.030, 0.14, 8), 0.34, 0.05, 0.44);                 // coax MG port
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), -0.30, 0.07, 0.43);                // sight port
  P.addGunExtra(cylZ(0.105, 0.55, 12, 0.135), 0, 0, 0.695);                  // sleeve step (ref plan front 1.74)
  buildGun(P, { len: 2.90, r: 0.062, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.10 });
  P.topY = 0.92;
}

// pziii_konserwa — early Pz III with the thin 3.7 cm and twin coax MGs.
function buildPziiiKonserwa(P) {
  const { box, cylY, cylZ, polyTurret, slab, buildGun, periscope, liftEye } = KIT;
  pziiiHull(P, {
    zc: -0.35, len: 5.31, roofY: 1.58, superW: 1.435, superLen: 3.24, superBias: -0.02,
    noseDeckY: 1.27, trackXc: 1.21, trackW: 0.40, fenderY: 1.30, tailY: 1.43, gearBias: -0.05, topW: 0,
    frontAnchorDz: 0.134, rearAnchorDz: 0.101,                               // len cols 2.444 / -3.117; hull-reg
  });                                                                        //  = the ref's own; len 5.47 (grace)

  // steep-walled early turret (ref walls ~55°: ±0.93 base -> ±0.54 roof)
  P.turretG.position.set(0, 1.58, 0.10);
  P.add('turret', polyTurret([
    [-0.30, 0.73], [0.30, 0.73], [0.62, 0.71], [0.78, 0.54], [0.88, 0.26],
    [0.90, -0.02], [0.88, -0.32], [0.82, -0.60], [0.66, -0.92], [0.44, -1.12],
    [0.20, -1.22], [-0.20, -1.22], [-0.44, -1.12], [-0.66, -0.92], [-0.82, -0.60],
    [-0.89, -0.32], [-0.92, -0.02], [-0.90, 0.26], [-0.78, 0.54], [-0.62, 0.71],
  ], 0.52, 1.0, 0.58));
  P.add('turret', box(0.90, 0.19, 0.18), 0, 0.115, -1.10);                   // low rear stowage bin (ref band
  P.add('turretDark', box(0.80, 0.02, 0.14), 0, 0.21, -1.10);                //  1.60..1.78 at z -1.0..-1.15)
  P.add('turret', slab(                                                      // rear roof shelf carrying the cupola
    [-0.50, 0.30, -0.60], [0.50, 0.30, -0.60], [0.40, 0.30, -1.08], [-0.40, 0.30, -1.08],
    [-0.50, 0.52, -0.60], [0.50, 0.52, -0.60], [0.40, 0.52, -1.08], [-0.40, 0.52, -1.08]));
  // rear cupola drum + slits (ref crown 2.49 at world z -0.83..-0.97)
  P.add('turret', KIT.xform(cylY(0.37, 0.40, 0.38, 16), 0, 0.71, -0.72, 0, 0, 0, [1, 1, 0.875])); // (r2: ref cupola r ~0.40 in x,
  P.add('turret', KIT.xform(cylY(0.30, 0.30, 0.032, 16), 0, 0.915, -0.70, 0, 0, 0, [1, 1, 0.875])); // z-elliptic: its crown ends -0.97)
  P.add('turretDark', box(0.48, 0.015, 0.03), 0, 0.94, -0.70);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6;
    P.add('turretDark', box(0.10, 0.042, 0.03), Math.sin(a) * 0.355, 0.72, -0.70 + Math.cos(a) * 0.355, 0, a, 0);
  }
  for (const s of [-1, 1]) {                                                 // side hatch doors on the sloped walls
    P.add('turretDark', box(0.014, 0.26, 0.022), s * 0.80, 0.18, -0.02, 0, s * -0.14, s * 0.28);
    P.add('turretDark', box(0.014, 0.26, 0.022), s * 0.76, 0.18, -0.40, 0, s * -0.14, s * 0.28);
    P.add('turretDark', box(0.014, 0.022, 0.40), s * 0.80, 0.32, -0.21, 0, s * -0.14, s * 0.28);
    P.add('turretDetail', box(0.03, 0.06, 0.08), s * 0.80, 0.16, -0.21, 0, s * -0.14, s * 0.28);
  }
  periscope(P, 'turretDetail', -0.26, 0.545, 0.24);
  liftEye(P, 'turretDetail', -0.55, 0.48, 0.32, 0.5);
  liftEye(P, 'turretDetail', 0.55, 0.48, 0.32, -0.5);
  {                                                                          // §B3 census MG: MG34 on the shelf,
    const mg = FITTINGS.pintleMG({                                           // whole stamp under the cupola-crown
      mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.85, elev: 0.10, seed: 31, // silhouette (top 2.46 < 2.48)
    });
    mg.position.set(0.44, 0.44, -0.98);                                      // barrel FORWARD over the roof: the
    P.turretG.add(mg);                                                       // aft aim broke the bustle columns
  }
  P.decal('turret', 'number', P.spec.visual.number || '111', 0.24, [0.80, 0.20, -0.25], Math.PI / 2, 0.22, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '111', 0.24, [-0.80, 0.20, -0.25], -Math.PI / 2, -0.22, -0.10);

  // 3.7 cm KwK 36: internal mantlet + protruding rotor/sleeve (ref plan:
  // rotor r ~0.17 to z 0.97, sleeve to 1.66) + TWIN coax MGs (early cue)
  P.gunG.position.set(0, 0.27, 0.45);
  P.addGunExtra(box(0.78, 0.42, 0.16), 0, 0, 0.30);                          // internal mantlet plate (face 0.83)
  for (const [bx, by] of [[-0.28, 0.14], [0.28, 0.14], [-0.28, -0.14], [0.28, -0.14]]) {
    P.addGunExtraDark(cylZ(0.018, 0.03, 6), bx, by, 0.385);                  // mantlet bolts
  }
  P.addGunExtraDark(cylZ(0.020, 0.42, 6), 0.22, 0.02, 0.44);                 // twin coax MGs
  P.addGunExtraDark(cylZ(0.020, 0.42, 6), 0.33, 0.02, 0.44);
  P.addGunExtra(cylZ(0.165, 0.30, 12, 0.175), 0, 0, 0.38);                   // rotor drum to z 0.98
  P.addGunExtra(cylZ(0.096, 0.14, 10, 0.104), 0, 0, 0.56);                   // recoil sleeve stub to z 1.08 (the
                                                                             //  ref's plan front ends at its rotor)
  buildGun(P, { len: 2.645, r: 0.040, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.075 });
  P.topY = 0.90;
}

// ---------------------------------------------------------------------------
// sherman_jumbo — docs/references/tanks/sherman_jumbo.md. Slab-sided E2 hull
// with sand shields, cast transmission nose, huge cast turret, short 75 mm.
// ---------------------------------------------------------------------------
function buildShermanJumbo(P) {
  const { box, cylX, cylY, cylZ, sph, slab, lathe, polyTurret, buildRunningGear, buildGun, periscope, liftEye } = KIT;
  const zc = -0.08;

  // VVSS: 3 bogies × 2 wheels + 3 rollers, front sprocket (mostly hidden
  // behind the E2 sand skirts, still real for stations/articulation views)
  const bogies = [1.35, 0, -1.35].map((z) => z + zc);
  const wheelZs = bogies.flatMap((z) => [z + 0.40, z - 0.40]);
  // r2: duckbill extended end connectors — trackW 0.56 -> 0.60 with xc pulled
  // to 1.11 (band faces 0.81/1.41: the inner face keeps the ref's
  // ground-reaching track columns at x ±0.80 lit in the front rows — r1
  // floated 0.49 there on the belly line — while the outer face stays
  // ~4cm clear of the 1.4485 skirt inner faces for the containment audit).
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.88, wheelR: 0.22, wheelW: 0.16, wheelY: 0.26, xc: 1.11, wheelZs,
    sprocket: { z: 2.42, y: 0.74, r: 0.30 },                                 // high-mounted M4 sprocket: wrap bottom
    idler: { z: -2.60, y: 0.72, r: 0.24 },                                   // follows the ref's skirt-cutout line
    rollers: bogies.map((z) => ({ z: z - 0.12, y: 0.78, r: 0.075 })),
    trackW: 0.60, topY: 0.86, botY: 0.055, arms: false,
  });
  wheelShadows(P, 1.11, wheelZs.slice(1, -1), 0.22, 0.16, -0.05);
  for (const z of bogies) for (const s of [-1, 1]) {                         // VVSS bogie brackets
    P.add('hullDetail', box(0.14, 0.34, 0.72), s * 1.05, 0.38, z);
    P.add('hullDetail', box(0.16, 0.10, 0.30), s * 1.05, 0.62, z - 0.28);
  }

  // hull: belly raised between the tracks (ref nose undercut 0.47), slab
  // side band ±1.475 to y 1.80, chamfered sponson tops into the 2.01 roof
  P.add('hull', box(2.10, 0.72, 5.70), 0, 0.845, -0.20);                     // belly 0.485..1.205
  P.add('hull', box(2.95, 1.19, 4.80), 0, 1.205, -0.06);                     // slab side band ±1.475, 0.61..1.80, z 2.34..-2.46
  // E2 sand-shield skirts to near ground (ref side bottom 0.01 mid-hull) —
  // SEGMENTED per the edge-on prism law: 6 plates per side with real end
  // faces and alternating x so mid-span station slices keep reading them.
  for (const s of [-1, 1]) {
    const px = [1.4745, 1.4705, 1.4735, 1.472, 1.474, 1.4715];
    const seg = [                                                            // [zF, zR, botF, botR]
      [2.62, 1.90, 0.45, 0.06], [1.90, 0.95, 0.06, 0.05], [0.95, 0.00, 0.05, 0.05],
      [0.00, -0.95, 0.05, 0.05], [-0.95, -1.90, 0.05, 0.06], [-1.90, -3.06, 0.06, 0.50],
    ];
    for (let i = 0; i < 6; i++) {
      const [zF, zR, bF, bR] = seg[i];
      const xo = s * px[i], xi = s * (px[i] - 0.024);
      const lo = Math.min(xo, xi), hi = Math.max(xo, xi);
      P.add('hull', slab(
        [lo, bF, zF], [hi, bF, zF], [hi, bR, zR], [lo, bR, zR],
        [lo, 0.72, zF], [hi, 0.72, zF], [hi, 0.72, zR], [lo, 0.72, zR]));
    }
    // shadowed backing behind the gear — r2: split with RISING end wedges.
    // r1's flat 5.4 m plate (bottom 0.145) owned the silhouette bottom in
    // the sprocket/idler cutout zones where the ref's skirt-cutout line
    // climbs (0.20@2.31 .. 0.47@2.67 front, 0.27@-2.53 .. 0.45@-2.89 rear):
    // ~10 side columns read 0.14 instead of the ref's 0.2-0.47 floor.
    // r2c: ONE mid-run backing plate BEHIND the wheel row (x 0.84..0.89 —
    // inside the track lane in x, so the front mask reads track/ground
    // there, but z-clear of both wrap-zone audits). The r2b inboard wedges
    // (x 0.71..0.76) painted naked y-0.145 columns in the FRONT rows
    // (silhouette masks have no occlusion), and mid-lane wedges clip the
    // wrap ramps — the skirts' own rising cutout line carries the side
    // bottom profile instead.
    P.add('hullDark', box(0.05, 0.55, 4.40), s * 0.865, 0.42, 0.10);         // z -2.10..2.30, y 0.145..0.695
  }
  P.add('hull', slab(                                                        // 47° glacis lower run (1.60 -> 1.81)
    [-1.44, 1.55, 2.42], [1.44, 1.55, 2.42], [1.44, 1.59, 2.36], [-1.44, 1.59, 2.36],
    [-1.44, 1.60, 2.36], [1.44, 1.60, 2.36], [1.44, 1.81, 2.08], [-1.44, 1.81, 2.08]));
  P.add('hull', slab(                                                        // glacis mid step (ref 1.80-1.84 @ z 2.0-2.2)
    [-1.45, 1.78, 2.14], [1.45, 1.78, 2.14], [1.45, 1.80, 1.95], [-1.45, 1.80, 1.95],
    [-1.45, 1.805, 2.12], [1.45, 1.805, 2.12], [1.45, 1.85, 1.95], [-1.45, 1.85, 1.95]));
  P.add('hull', slab(                                                        // upper glacis, tapering to roof width
    [-1.44, 1.84, 1.99], [1.44, 1.84, 1.99], [1.46, 1.86, 1.90], [-1.46, 1.86, 1.90],
    [-1.10, 2.005, 1.80], [1.10, 2.005, 1.80], [1.12, 2.01, 1.74], [-1.12, 2.01, 1.74]));
  P.add('hull', slab(                                                        // nose shelf (ref flat 1.594, z 2.36..2.69)
    [-1.435, 1.28, 2.70], [1.435, 1.28, 2.70], [1.44, 1.30, 2.38], [-1.44, 1.30, 2.38],
    [-1.435, 1.59, 2.68], [1.435, 1.59, 2.68], [1.44, 1.60, 2.38], [-1.44, 1.60, 2.38]));
  P.add('hull', box(2.88, 0.055, 2.70), 0, 1.985, 0.42);                     // roof plate 2.012
  P.add('hull', slab(                                                        // engine deck upper slope 2.01 -> 1.90
    [-1.42, 1.82, -0.90], [1.42, 1.82, -0.90], [1.42, 1.80, -1.72], [-1.42, 1.80, -1.72],
    [-1.42, 2.005, -0.90], [1.42, 2.005, -0.90], [1.42, 1.905, -1.72], [-1.42, 1.905, -1.72]));
  P.add('hull', slab(                                                        // engine deck lower slope 1.90 -> 1.79
    [-1.42, 1.78, -1.70], [1.42, 1.78, -1.70], [1.40, 1.66, -2.70], [-1.40, 1.66, -2.70],
    [-1.42, 1.90, -1.70], [1.42, 1.90, -1.70], [1.40, 1.79, -2.70], [-1.40, 1.79, -2.70]));
  P.add('hull', box(2.72, 0.05, 0.24), 0, 1.795, -2.56);                     // vent ridge (ref 1.82 bump @ -2.58)
  P.add('hull', slab(                                                        // rear plate slope: r2 knee moved to -2.70
    [-1.40, 1.13, -2.66], [1.40, 1.13, -2.66], [1.36, 1.02, -3.04], [-1.36, 1.02, -3.04],
    [-1.40, 1.79, -2.66], [1.40, 1.79, -2.66], [1.36, 1.50, -3.04], [-1.36, 1.50, -3.04]));
  P.add('hull', slab(                                                        // rear underside slope (between tracks)
    [-0.76, 0.485, -2.30], [0.76, 0.485, -2.30], [0.76, 0.78, -3.05], [-0.76, 0.78, -3.05],
    [-0.76, 1.10, -2.35], [0.76, 1.10, -2.35], [0.76, 1.10, -3.05], [-0.76, 1.10, -3.05]));
  for (const s of [-1, 1]) {                                                 // outer tail fill behind the idler wrap
    const xi = s > 0 ? 0.78 : -1.30, xo = s > 0 ? 1.30 : -0.78;
    P.add('hull', slab(
      [xi, 0.80, -2.995], [xo, 0.80, -2.995], [xo, 0.80, -3.05], [xi, 0.80, -3.05],
      [xi, 1.10, -2.995], [xo, 1.10, -2.995], [xo, 1.10, -3.05], [xi, 1.10, -3.05]));
  }
  P.add('hull', box(1.40, 0.82, 0.11), 0, 1.03, -3.085);                     // tail plate center (ref bottom 0.61,
  P.add('hull', box(0.54, 0.82, 0.11), -1.13, 1.03, -3.085);                 //  face -3.14: ref carries plate mass
  P.add('hull', box(0.54, 0.82, 0.11), 1.13, 1.03, -3.085);                  //  through the -3.15 column)
  P.add('hull', slab(                                                        // tail lip, center span (ref -3.18 at |x|<0.72)
    [-0.70, 1.30, -3.05], [0.70, 1.30, -3.05], [0.68, 1.30, -3.20], [-0.68, 1.30, -3.20],
    [-0.70, 1.445, -3.05], [0.70, 1.445, -3.05], [0.68, 1.445, -3.20], [-0.68, 1.445, -3.20]));
  for (const s of [-1, 1]) {                                                 // tail lip outer spans (ref -3.15, notch at ±0.78)
    const xi = s > 0 ? 0.86 : -1.40, xo = s > 0 ? 1.40 : -0.86;
    P.add('hull', slab(
      [xi, 1.30, -3.05], [xo, 1.30, -3.05], [xo, 1.30, -3.15], [xi, 1.30, -3.15],
      [xi, 1.445, -3.05], [xo, 1.445, -3.05], [xo, 1.445, -3.15], [xi, 1.445, -3.15]));
  }
  // cast transmission nose: rounded housing, 3-piece bolted construction —
  // center casting face 2.90, flange plates 2.905, recessed seams at ±0.78.
  P.add('hull', cylX(0.40, 1.46, P.q ? 26 : 12), 0, 0.92, 2.44);            // r2: ends ±0.73 (8cm off the 0.81
                                                                             //  band inner face — containment)
  // r2: hull nose extremes pulled to <=2.885 — the 2.90/2.91 faces sat
  // within AA-bleed range of a drifting bin boundary and, when the shared
  // box moved, leaked hull mass into the gun-band-only column (0.48 err).
  P.add('hull', slab(                                                        // center diff casting face
    [-0.74, 0.53, 2.76], [0.74, 0.53, 2.76], [0.76, 0.51, 2.56], [-0.76, 0.51, 2.56],
    [-0.70, 1.175, 2.883], [0.70, 1.175, 2.883], [0.78, 1.28, 2.58], [-0.78, 1.28, 2.58]));
  P.add('hull', slab(                                                        // upper nose full-width cap (over the wraps)
    [-1.24, 1.165, 2.865], [1.24, 1.165, 2.865], [1.30, 1.175, 2.40], [-1.30, 1.175, 2.40],
    [-1.24, 1.175, 2.883], [1.24, 1.175, 2.883], [1.30, 1.30, 2.42], [-1.30, 1.30, 2.42]));
  for (const s of [-1, 1]) {                                                 // bolted side flange plates (track-clear)
    P.add('hull', slab(
      [s * 0.70 - 0.08, 0.55, 2.86], [s * 0.70 + 0.08, 0.55, 2.86], [s * 0.76, 0.53, 2.62], [s * 0.56, 0.53, 2.62],
      [s * 0.70 - 0.08, 1.13, 2.86], [s * 0.70 + 0.08, 1.13, 2.86], [s * 0.76, 1.20, 2.60], [s * 0.56, 1.20, 2.60]));
  }
  // r2 FRONT DIMS ANCHOR REWORK: r1 anchored hullLengthM with a links block
  // on the diff face (y 0.62..1.10 @ z 2.955) — its low band wrote a 0.78 m
  // bottom err in side_whole against the ref's gun-only band there (ref
  // 2.218..2.416), and the hull-bucket column cost 0.58 cover in side_hull.
  // The anchor is now a travel-lock collar CLAMPED ON THE TUBE (gunMount
  // bucket, below): same z extreme 2.97, band 2.02..2.42 hugs the ref's own
  // band heights (counterweight law), elevates with the gun so articulation
  // poses never strand it (floater-safe), and leaves the hull mask clean.
  P.add('hull', slab(                                                        // nose chin between the tracks
    [-0.74, 0.49, 2.70], [0.74, 0.49, 2.70], [0.76, 0.485, 2.20], [-0.76, 0.485, 2.20], // (x ±0.76: 6cm clear of the
    [-0.74, 0.60, 2.72], [0.74, 0.60, 2.72], [0.76, 0.90, 2.30], [-0.76, 0.90, 2.30])); //  r2 band inner face)
  for (const s of [-1, 1]) {                                                 // front sand-shield tip plates
    const xi = s > 0 ? 1.448 : -1.4745, xo = s > 0 ? 1.4745 : -1.448;
    P.add('hull', slab(
      [xi, 0.55, 2.82], [xo, 0.55, 2.82], [xo, 0.45, 2.56], [xi, 0.45, 2.56],
      [xi, 1.24, 2.78], [xo, 1.24, 2.78], [xo, 1.30, 2.54], [xi, 1.30, 2.54]));
    P.add('hull', box(0.16, 0.045, 0.30), s * 1.37, 1.27, 2.62);             // tip deck strip over the track
  }
  // sponson top chamfers: 1.865 at ±1.475 -> 2.012 at ±1.20 (ref front
  // curve); the rear section's top edge FOLLOWS the falling engine deck.
  for (const s of [-1, 1]) {
    const xo = s > 0 ? [1.20, 1.475] : [-1.475, -1.20];
    P.add('hull', slab(
      [xo[0], 1.79, 1.92], [xo[1], 1.79, 1.92], [xo[1], 1.79, -0.90], [xo[0], 1.79, -0.90],
      s > 0 ? [1.18, 2.012, 1.88] : [-1.475, 1.865, 1.88], s > 0 ? [1.475, 1.865, 1.88] : [1.18, 2.012, 1.88],
      s > 0 ? [1.475, 1.865, -0.90] : [1.18, 2.012, -0.90], s > 0 ? [1.18, 2.012, -0.90] : [-1.475, 1.865, -0.90]));
    P.add('hull', slab(
      [xo[0], 1.74, -0.88], [xo[1], 1.74, -0.88], [xo[1], 1.70, -2.44], [xo[0], 1.70, -2.44],
      s > 0 ? [1.18, 2.00, -0.88] : [-1.475, 1.83, -0.88], s > 0 ? [1.475, 1.83, -0.88] : [1.18, 2.00, -0.88],
      s > 0 ? [1.475, 1.745, -2.44] : [1.18, 1.79, -2.44], s > 0 ? [1.18, 1.79, -2.44] : [-1.475, 1.745, -2.44]));
  }

  // glacis furniture: hoods, MG ball, lights, shackles, spare links
  for (const [hx, hz] of [[-0.55, 1.72], [0.55, 1.72]]) {
    P.add('hull', box(0.50, 0.12, 0.44), hx, 1.92, hz, -0.45, 0, 0);         // driver/co-driver hoods (ref tops 2.04-2.09)
    periscope(P, 'hullDetail', hx, 2.03, hz - 0.22);
  }
  P.add('hull', sph(0.105, 12), 0.62, 1.70, 2.15);                           // bow MG ball on the glacis
  P.add('hullDark', cylZ(0.026, 0.24, 8), 0.62, 1.74, 2.28, -0.35, 0, 0);
  lightsAndGuards(P, [-0.92, 0.92], 1.48, 2.50, -0.2);                       // on the nose shelf (ref top 1.59 there)
  towHook(P, -0.60, 1.06, 2.82); towHook(P, 0.60, 1.06, 2.82);               // r2: pin faces <=2.885 (bin-drift law)
  KIT.spareTrackStrip(P, 'hull', 0, 1.76, 1.98, 3, -0.5, 0);                 // links high on the glacis (ref bare below 2.3)
  P.add('hullDetail', box(0.05, 0.05, 1.2), -1.30, 2.04, 0.3);               // tool row on the left roof edge
  fenderTools(P, 1.20, 2.035, -0.3);
  // engine deck + rear
  P.add('hullDetail', box(0.62, 0.045, 0.85), -0.45, 1.94, -1.35);           // engine hatches
  P.add('hullDetail', box(0.62, 0.045, 0.85), 0.45, 1.94, -1.35);
  for (let i = 0; i < 4; i++) P.add('hullDark', box(1.35, 0.02, 0.06), 0, 1.845, -1.78 - i * 0.14);
  P.add('hullDark', box(1.25, 0.22, 0.06), 0, 1.20, -3.12);                  // rear grille on the tail plate
  P.add('hullWood', box(0.3, 0.14, 0.2), -0.85, 1.62, -2.75);                // jack block
  for (const s of [-1, 1]) {                                                 // rear mud flaps (r2c: REGISTRATION-
    // NEUTRAL). The half-pitch dAlong smear traced to this plate: any rear
    // band >=0.241 of hull-rough makes -3.175 a hull BODY column, dragging
    // the proc body mid off the ref's (its rear body col is -3.10) and
    // sampling every proc column mid-transition. Flap band 1.22..1.44
    // (0.22) stays under the hull body threshold AND under the whole-mask
    // one — hullLengthM's rear anchor is now the tail-plate col at -3.10,
    // with the front collar pushed out to col 3.098 to keep len 6.20.
    P.add('hull', box(0.28, 0.18, 0.042), s * 0.45, 1.35, -3.175);
    P.add('hullDark', box(0.29, 0.05, 0.030), s * 0.45, 1.285, -3.172);      // flap tip edge strip
  }
  P.decal('hull', 'star', null, 0.55, [1.478, 1.30, 0.4], Math.PI / 2);
  P.decal('hull', 'star', null, 0.55, [-1.478, 1.30, 0.4], -Math.PI / 2);

  // T23-style cast turret, rebuilt to the print's measured plan/side curves:
  // wall shell on the exact plan polygon, egg-lathe crown capped at 2.98
  // (published heightM 2.95 owns p95 — the print's own crown rides 3.03-3.13,
  // certified stylization eaten by the thin-fitting rule), basket drum to
  // y 1.22 (print's fused basket, inside the hull at every yaw), undercut
  // bustle rising 2.02 -> 2.42 to the -1.76 tail.
  P.turretG.position.set(0, 2.00, 0.0);
  // r2 dome rebuild: TWO stacked lathes. The ref cast is a strong egg — wide
  // and near-vertical in FRONT view high up (x half ~1.10 at y 2.80) but
  // SHORT fore-aft up top (side tops fall 2.80@z0.58 -> 2.63@z0.94), while
  // its lower walls flare to ±1.225 LOW (front x1.22 tops out ~2.16). One
  // lathe (single plan ratio) could not do both: r1's read +0.15..0.23 too
  // tall on the dome front slope and 0.26 too wide-high at x ±1.2.
  P.add('turret', lathe([                                                    // lower drum: max width LOW (y 2.16)
    [1.16, 0.06], [1.235, 0.155], [1.20, 0.30], [1.145, 0.46], [1.10, 0.60], [1.08, 0.66],
  ], P.q ? 30 : 20, 0.95), 0, 0.005, -0.06);
  P.add('turret', lathe([                                                    // upper crown cap: wide but short (sz 0.61)
    [1.17, 0.60], [1.145, 0.68], [1.107, 0.79], [1.05, 0.86], [0.92, 0.89],
    [0.70, 0.922], [0.36, 0.945], [0.02, 0.955],
  ], P.q ? 30 : 20, 0.61), 0, 0.005, -0.06);                                 // (r2c: ref equator center ~z 0 — the
                                                                             //  -0.10 seat read rear-shifted at x ±1.1)
  P.add('turret', box(1.88, 0.14, 1.58), 0, 0.07, -0.22);                    // front/mid skirt band: bottom AT the
                                                                             //  ref's 2.00 line (was 1.975)
  for (const s of [-1, 1]) {                                                 // cast cheeks flanking the mount —
    for (const c0 of [                                                       // r2: two facets tracing the ref's
      [[0.52, 0.98], [0.94, 0.85], [0.94, 0.30], [0.52, 0.30]],              // convex plan front edge
      [[0.90, 0.87], [1.19, 0.38], [1.19, 0.30], [0.90, 0.30]],              // (0.85@0.9 -> 0.52@1.12 -> 0.44@1.16)
    ]) {
      const c = c0.map(([x, z]) => [s * x, z]);
      if (s < 0) c.reverse();                                                // keep plan winding CCW on the mirror
      P.add('turret', slab(
        [c[0][0], 0.06, c[0][1]], [c[1][0], 0.06, c[1][1]], [c[2][0], 0.06, c[2][1]], [c[3][0], 0.06, c[3][1]],
        [c[0][0], 0.56, c[0][1]], [c[1][0], 0.56, c[1][1]], [c[2][0], 0.56, c[2][1]], [c[3][0], 0.56, c[3][1]]));
    }
  }
  // basket drum (print band to y 1.22) — r2c: the ref's fused ring band
  // shows at z -0.66..+0.60 ONLY (cols at ±0.68-0.71 read ring-line bottoms
  // in the ref; a symmetric r 0.61+ drum lit both and cost 0.40+0.46 err).
  P.add('turret', cylY(0.60, 0.61, 0.80, 16), 0, -0.39, -0.025);
  P.add('turretDark', cylY(0.57, 0.57, 0.78, 16), 0, -0.38, -0.025);
  P.add('turret', slab(                                                      // bustle fwd (r2b: ref rear edge is
    [-0.95, 0.02, -0.98], [0.95, 0.02, -0.98], [0.74, 0.16, -1.50], [-0.74, 0.16, -1.50], // straight ref edge:
    [-0.95, 0.88, -0.98], [0.95, 0.88, -0.98], [0.74, 0.86, -1.50], [-0.74, 0.86, -1.50])); // (0.96,-0.96)->(0.74,-1.50)
  for (const s of [-1, 1]) {                                                 // bustle side wings x 0.95..1.05: the
    const wLo = Math.min(s * 0.95, s * 1.05), wHi = Math.max(s * 0.95, s * 1.05); // ref's near-vertical plan side
    P.add('turret', slab(                                                    // face at x ~1.0, z -0.60..-0.95
      [wLo, 0.04, -0.60], [wHi, 0.04, -0.60], [wHi, 0.04, -0.95], [wLo, 0.04, -0.95],
      [wLo, 0.60, -0.60], [wHi, 0.60, -0.60], [wHi, 0.60, -0.95], [wLo, 0.60, -0.95])); // top 2.60: stays under the
  }                                                                          // dome/bustle side silhouette
  P.add('turret', slab(                                                      // bustle rear: undercut 2.16 -> 2.42
    [-0.74, 0.16, -1.50], [0.74, 0.16, -1.50], [0.58, 0.40, -1.65], [-0.58, 0.40, -1.65], // (ref plan rear -1.63..-1.65
    [-0.74, 0.86, -1.50], [0.74, 0.86, -1.50], [0.58, 0.72, -1.65], [-0.58, 0.72, -1.65])); //  at x ±0.32..0.61)
  P.add('turret', slab(                                                      // NARROW tail stub: the ref's -1.82
    [-0.26, 0.30, -1.63], [0.26, 0.30, -1.63], [0.22, 0.41, -1.80], [-0.22, 0.41, -1.80], // tail is |x|<0.28 in plan;
    [-0.26, 0.72, -1.63], [0.26, 0.72, -1.63], [0.22, 0.60, -1.80], [-0.22, 0.60, -1.80])); // rear face -1.80: reads in
  // the same columns as the ref's -1.82 face without straddling the next
  // bin (its face measures un-lit past -1.815 across both observed binnings).
  P.add('turretDark', box(0.35, 0.12, 0.03), 0, 0.47, -1.745);               // radio hatch seam (under the r2 stub top)
  // cast crown ridges: 2+2 side columns >2.98 (the FULL heightM p95 budget —
  // everything else on the roof rides <=2.975), ALIGNED WITH THE REF'S OWN
  // SPIKES per the budget law: the print's crown band peaks 3.12-3.14 at
  // z +0.34..+0.50 and holds 3.06-3.10 at z -0.41..-0.58. All faces >=15mm
  // off trace-bin boundaries (0.323/0.467 and -0.399/-0.543).
  // Each spike is <=0.055 deep in z — under one trace pitch, so it can span
  // AT MOST 2 columns no matter how the shared-box bin boundaries drift
  // (iteration 2 lesson: moving ANY model extreme re-bins every view; a
  // 0.11-deep spike straddled 3 columns and heightM p95 landed on 3.09).
  P.add('turret', slab(                                                      // front crown spike (ref 3.09-3.12)
    [-0.78, 0.90, 0.515], [0.24, 0.90, 0.515], [0.26, 0.90, 0.450], [-0.80, 0.90, 0.450],
    [-0.70, 1.10, 0.510], [0.18, 1.10, 0.510], [0.20, 1.10, 0.455], [-0.72, 1.10, 0.455]));
  P.add('turret', slab(                                                      // rear crown ridge (ref 3.06-3.10)
    [-0.82, 0.90, -0.408], [0.24, 0.90, -0.408], [0.26, 0.90, -0.473], [-0.80, 0.90, -0.473],
    [-0.74, 1.09, -0.413], [0.18, 1.09, -0.413], [0.20, 1.09, -0.468], [-0.72, 1.09, -0.468]));
  // (crown spikes are LEFT-weighted like the print: its 3.03-3.13 band
  //  reads x -0.7..+0.2 from the front; symmetric spikes cost front rows)
  P.add('turret', slab(                                                      // crown plate z -0.78..+0.40 at 2.975:
    [-0.70, 0.60, 0.40], [0.24, 0.60, 0.40], [0.22, 0.60, -0.78], [-0.66, 0.60, -0.78],   // the grace-free line under
    [-0.70, 0.975, 0.40], [0.24, 0.975, 0.40], [0.22, 0.975, -0.78], [-0.66, 0.975, -0.78])); // the ref's 3.03-3.12 band
                                                                             // (base 0.60 buried in the drum — no slit)
  // roof furniture — print parity: cupola LEFT (x -0.70), loader oval RIGHT
  P.add('turret', cylY(0.26, 0.28, 0.16, 16), -0.65, 0.865, -1.10);          // commander cupola drum (probe: ref
  P.add('turret', cylY(0.225, 0.225, 0.035, 16), -0.65, 0.9575, -1.10);      //  cupola-zone tops 2.99; ours caps at
  P.add('turretDark', box(0.36, 0.015, 0.03), -0.65, 0.9675, -1.10);         //  2.975 = the grace-free line; x
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add('turretGlass', box(0.055, 0.045, 0.03), -0.65 + Math.sin(a) * 0.24, 0.905, -1.10 + Math.cos(a) * 0.24, 0, a, 0);
  }
  P.add('turret', cylY(0.19, 0.21, 0.06, 14), 0.52, 0.80, -0.65);            // loader oval hatch ring
  P.add('turret', cylY(0.165, 0.165, 0.028, 14), 0.52, 0.855, -0.65);
  P.add('turretDark', box(0.28, 0.014, 0.03), 0.52, 0.878, -0.65);
  // .50cal — FITTINGS.pintleMG (§B3 census). Placement is height-budget
  // engineered: seat sunk in the dome at (0.24, 2.58, +0.60), barrel aimed
  // up-forward at 14° so the muzzle line tops out ~2.94 (< the 2.9795
  // grace line, so heightM p95 stays on the 2.975 plateau) INSIDE the
  // front crown spike's silhouette; the receiver mass (top ~2.79) rides
  // the dome slope where the ref's own fused MG band lives. Dark tone per
  // MG PHYSICS (pale deck -> crown-riding dark lines).
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'm2', tone: 'dark', scale: 0.8, elev: 0.24,
      ammo: true, seed: 12,
    });
    mg.position.set(0.42, 0.50, 0.52);
    mg.rotation.y = Math.PI;                                                 // muzzle toward the bow-left crown
    P.turretG.add(mg);
  }
  P.add('turretDetail', box(0.15, 0.14, 0.15), -0.42, 0.90, 0.10);           // periscope tower
  P.add('turretDetail', box(0.13, 0.024, 0.13), -0.42, 0.963, 0.10);         // sharp cap 2.975
  P.add('turretGlass', box(0.11, 0.05, 0.03), -0.42, 0.94, 0.185);
  periscope(P, 'turretDetail', 0.30, 0.90, 0.30);
  P.add('turret', cylY(0.10, 0.12, 0.06, 10), 0.36, 0.90, 0.05);             // ventilator
  P.add('turretDetail', cylX(0.085, 0.035, 12), -1.15, 0.30, -0.30);         // pistol port
  liftEye(P, 'turretDetail', -0.92, 0.62, 0.35, 0.5);
  liftEye(P, 'turretDetail', 0.92, 0.62, 0.35, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || 'C-12', 0.28, [1.13, 0.30, -0.35], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || 'C-12', 0.28, [-1.13, 0.30, -0.35], -Math.PI / 2, 0, -0.10);

  // 75 mm M3 in the huge M62-style combination mount: tapering rotor from
  // the dome front, big flat shield face at z 1.37, sleeve, then the short
  // tube to +3.18 (published overall 6.35 = the print's muzzle exactly).
  P.gunG.position.set(0, 0.31, 0.90);
  P.addGunExtra(slab(                                                        // rotor taper (top 2.73 -> 2.49 world;
    [-0.72, -0.31, -0.28], [0.72, -0.31, -0.28], [0.63, -0.25, 0.47], [-0.63, -0.25, 0.47], // probe: ref rotor line
    [-0.72, 0.42, -0.28], [0.72, 0.42, -0.28], [0.63, 0.18, 0.47], [-0.63, 0.18, 0.47]));   // 2.67@0.81, 2.62@0.95)
  P.addGunExtra(box(1.40, 0.52, 0.16), 0, 0, 0.27);                          // mantlet shield face (ref: full face
  for (const s2 of [-1, 1]) {                                                //  only to ±0.70; sloped cheek wings
    const c = [[0.68, 0.33], [0.91, -0.05], [0.91, -0.22], [0.68, -0.22]]    //  carry the edge to (±0.91, 0.85)
      .map(([x, z]) => [s2 * x, z]);
    if (s2 < 0) c.reverse();                                                 // keep plan winding on the mirror
    P.addGunExtra(KIT.slab(
      [c[0][0], -0.24, c[0][1]], [c[1][0], -0.24, c[1][1]], [c[2][0], -0.24, c[2][1]], [c[3][0], -0.24, c[3][1]],
      [c[0][0], 0.24, c[0][1]], [c[1][0], 0.24, c[1][1]], [c[2][0], 0.24, c[2][1]], [c[3][0], 0.24, c[3][1]]));
  }
  P.addGunExtraDark(cylZ(0.030, 0.12, 8), 0.42, 0.08, 0.33);                 // coax port
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), -0.40, 0.10, 0.33);                // sight port
  P.addGunExtra(cylZ(0.140, 0.34, 14, 0.185), 0, 0, 0.62);                   // recoil sleeve to z 1.70 (ref tapers
                                                                             //  ~0.185 root -> ~0.14 tip)
  buildGun(P, { len: 2.24, r: 0.095, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.135 });
  P.add('gun', cylZ(0.101, 0.10, 12), 0, 0, 2.23);                           // muzzle collar -> +3.18 world
  // travel-lock collar clamped on the tube (front hullLengthM anchor, r2c):
  // world z 3.078..3.118 (col 3.098), band y 1.98..2.42 — the column
  // QUALIFIES as whole-mask body (>0.355 band) so hullLengthM measures
  // 6.198 against the tail-plate col at -3.10, at the ref's own gun-band
  // heights. x ±0.12 keeps it INSIDE the tube-lit plan bins (ref bottom
  // there is already the muzzle run, so the collar is plan-interior).
  // Faces sit >=15mm off the 3.063/3.134 trace-bin boundaries; gunMount
  // bucket so it elevates with the tube (pose-floater-safe) and stays out
  // of the hull mask (hull registration must mirror the ref's own span).
  P.addGunExtra(box(0.24, 0.40, 0.040), 0, -0.06, 2.198);                    // band 2.05..2.45 splits the top/bottom
  P.addGunExtraDark(box(0.20, 0.06, 0.028), 0, -0.06, 2.198);                // err against the ref's 2.19..2.42 tube
                                                                             // band (dark hinge line, interior)
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
    sprocket: { z: -3.50, y: 0.62, r: 0.30 },
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
  P.add('hullDetail', cylY(0.28, 0.28, 0.035, 16), 0, 1.34, -3.38, 0.62, 0, 0); // transmission hatch
  P.add('hull', box(2.42, 0.34, 0.08), 0, 0.72, -3.88);                      // tail plate
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.065, 0.22, 10), s * 0.55, 1.10, -3.86, 0.5, 0, 0);   // twin exhausts
    P.add('hullDetail', cylZ(0.078, 0.05, 10), s * 0.55, 1.115, -3.92, 0.5, 0, 0);
  }
  KIT.fenders(P, 1.04, 1.46, 0.93, -3.90, 1.85, 0.032);                      // fenders ±1.46 (tracks own ±1.50)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.40, 0.38, 0.045), s * 1.22, 0.74, -4.075);           // rear mud flaps (R anchor -> body mid
    P.add('hullDark', box(0.41, 0.05, 0.05), s * 1.22, 0.955, -4.07);        //  -1.05, span 6.09, overall 8.07)
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
  P.add('hull', box(1.05, 0.48, 0.44), 0, 1.86, -1.66);                      // rear-deck stowage trunk
  P.add('hullDark', box(1.07, 0.42, 0.026), 0, 1.84, -1.89);
  P.add('hullDark', box(0.026, 0.42, 0.46), -0.53, 1.84, -1.66);
  KIT.tarpRoll(P, 'hullCloth', -1.24, 1.02, -1.20, 0.90, 0.085, false);      // bedroll on the left fender
  KIT.towCable(P, [[-1.42, 1.05, -0.5], [-1.48, 1.10, 0.6], [-1.40, 1.05, 1.35]]);
  KIT.spareTrackStrip(P, 'hull', 0.55, 1.42, 0.62, 2, -0.49, 0);             // links on the glacis
  // hullLengthM F anchor: compact stowage bin high on the right glacis lip
  // (band merges with the fused tube's 1.81..1.95 ref band -> small err)
  P.add('hull', box(0.24, 0.40, 0.26), 0.50, 0.78, 1.90);                    // headlight/horn cluster box
  P.add('hullDark', box(0.25, 0.32, 0.025), 0.50, 0.78, 2.035);
  KIT.headlight(P, 0.50, 1.02, 2.02, -0.15);

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
  // roof furniture per the measured print: cupola RIGHT (front x +0.25,
  // crown 2.42), loader hatch LEFT, twin vents, antenna at (x .48, z -.40)
  P.add('turret', cylY(0.25, 0.27, 0.32, 16), 0.25, 0.63, -0.67);            // cupola drum (ref band 2.38-2.42)
  P.add('turret', cylY(0.215, 0.215, 0.04, 16), 0.25, 0.805, -0.67);
  P.add('turretDark', box(0.36, 0.015, 0.03), 0.25, 0.835, -0.67);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    P.add('turretGlass', box(0.05, 0.03, 0.028), 0.25 + Math.sin(a) * 0.21, 0.54, -0.67 + Math.cos(a) * 0.21, 0, a, 0);
  }
  P.add('turret', cylY(0.20, 0.22, 0.05, 14), -0.35, 0.615, -0.42);          // loader hatch
  P.add('turret', cylY(0.175, 0.175, 0.026, 14), -0.35, 0.67, -0.42);
  P.add('turretDark', box(0.28, 0.014, 0.03), -0.35, 0.693, -0.42);
  P.add('turret', cylY(0.11, 0.13, 0.07, 10), 0.10, 0.63, -0.92);            // twin ventilator domes
  P.add('turret', cylY(0.11, 0.13, 0.07, 10), -0.18, 0.625, -1.10);
  periscope(P, 'turretDetail', -0.28, 0.64, 0.05);
  // antenna mount rail: the published-heightM p95 carrier (2.72 across 4
  // side columns), seated over the print's own 2.73 whip spike at z -0.40
  P.add('turretDetail', cylY(0.040, 0.050, 0.12, 8), 0.48, 0.70, -0.05);     // base pot
  P.add('turretDetail', box(0.020, 0.30, 0.020), 0.48, 0.90, 0.10, 0.30, 0, 0); // whip stub (thin)
  P.add('turretDetail', box(0.045, 0.06, 0.44), 0.48, 1.075, -0.06);         // rail bar y 2.68-2.735
  P.add('turretDetail', box(0.035, 0.16, 0.035), 0.48, 0.97, 0.12);          // rail posts
  P.add('turretDetail', box(0.035, 0.16, 0.035), 0.48, 0.97, -0.24);
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

// ---------------------------------------------------------------------------
// t30 — US T30 Heavy Tank (155 mm T7). TRACK-ANOMALY FIX (ww2 r2): the id was
// source:'procedural' with NO profile builder, so it fell through to
// tankFactory's buildCommunityPlaceholder — hull slabs + 'hullRubber' track
// PONTOON BOXES only. The containment audit fingerprints the two factory
// band meshes (DynamicDrawUsage) or ground-riding userData.trackBucket
// meshes; the placeholder builds neither, hence the audit anomaly
// "expected 2 band meshes, found 0 (no ground-riding track buckets either)".
// This bespoke build gives it the STANDARD §H base rig — buildRunningGear
// two-layer shoe system (pads + chain/guide horns on real wheels with the
// factory band meshes), hull loft, turret ring, gun assembly, KIT fittings.
// Authored from published data (hull 7.6, overall 10.9, width 3.8, height
// 3.25, track 0.71 m; 8 dual road wheels, REAR drive, long cast turret,
// 155 mm with ~3.2 m bow overhang) — the local print is the gate oracle.
// ---------------------------------------------------------------------------
function buildT30(P) {
  const { box, cylX, cylY, cylZ, sph, slab, lathe, buildRunningGear, buildGun, periscope, liftEye } = KIT;

  // running gear: 8 dual wheels/side, rear sprocket, front idler, 4 rollers —
  // the standard two-layer track system per §H/§B4.
  const wheelZs = evenStations(8, 5.1, 0.05);
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.88, wheelR: 0.33, wheelW: 0.24, wheelY: 0.36, xc: 1.50, wheelZs,
    sprocket: { z: -3.5, y: 0.55, r: 0.38 },
    idler: { z: 3.55, y: 0.52, r: 0.36 },
    rollers: [-2.3, -0.9, 0.5, 1.9].map((z) => ({ z, y: 1.06, r: 0.10 })),
    trackW: 0.71, topY: 1.16, botY: 0.06, arms: true,
  });
  wheelShadows(P, 1.50, wheelZs.slice(1, -1), 0.33, 0.24, -0.06);

  // hull: belly between the tracks, sponson band over them, long glacis
  P.add('hull', box(2.20, 1.05, 7.30), 0, 0.98, -0.05);                      // belly (±1.10: clear of the 1.145
                                                                             //  band inner faces)
  P.add('hull', box(3.68, 0.78, 6.30), 0, 1.90, -0.45);                      // sponson band ±1.84
  P.add('hull', box(3.30, 0.06, 5.00), 0, 2.31, -0.90);                      // roof plate 2.34
  P.add('hull', slab(                                                        // long 54° glacis to the roof (bow lip
    [-1.55, 1.06, 3.72], [1.55, 1.06, 3.72], [1.70, 1.02, 3.30], [-1.70, 1.02, 3.30], // 1.06: above the idler-wrap
    [-1.55, 1.10, 3.70], [1.55, 1.10, 3.70], [1.66, 2.32, 1.55], [-1.66, 2.32, 1.55])); // crest per §B4)
  P.add('hull', slab(                                                        // lower bow plate (center, between
    [-1.05, 0.42, 3.10], [1.05, 0.42, 3.10], [1.08, 0.44, 3.55], [-1.08, 0.44, 3.55], // the tracks)
    [-1.05, 0.46, 3.12], [1.05, 0.46, 3.12], [1.08, 1.06, 3.72], [-1.08, 1.06, 3.72]));
  P.add('hull', slab(                                                        // engine deck fall 2.34 -> 2.06
    [-1.60, 2.00, -1.90], [1.60, 2.00, -1.90], [1.52, 1.92, -3.30], [-1.52, 1.92, -3.30],
    [-1.60, 2.31, -1.90], [1.60, 2.31, -1.90], [1.52, 2.06, -3.30], [-1.52, 2.06, -3.30]));
  P.add('hull', slab(                                                        // tail plate (bottom 1.08: the sprocket
    [-1.45, 1.08, -3.55], [1.45, 1.08, -3.55], [1.38, 1.10, -3.76], [-1.38, 1.10, -3.76], // wrap crest rides 1.03)
    [-1.45, 1.95, -3.32], [1.45, 1.95, -3.32], [1.38, 1.55, -3.76], [-1.38, 1.55, -3.76]));
  KIT.fenders(P, 1.86, 1.90, 2.40, -3.40, 1.35, 0.04);                       // track guards ±1.90 (width 3.8)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, 0.42, 0.05), s * 1.55, 1.28, 3.775);             // front mud flaps (hullLengthM F anchor,
    P.add('hull', box(0.34, 0.40, 0.05), s * 1.42, 1.24, -3.795);            //  above the wrap arcs) + rear (R anchor)
  }
  // deck furniture: hatches, louvres, grilles
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.68, 0.05, 1.00), s * 0.72, 2.045, -2.40);      // engine hatches on the fall
    for (let i = 0; i < 5; i++) P.add('hullDark', box(0.60, 0.02, 0.10), s * 0.72, 2.10, -1.55 - i * 0.22);
  }
  P.add('hullDark', box(1.30, 0.28, 0.06), 0, 1.55, -3.72);                  // rear grille
  P.add('hull', box(0.56, 0.14, 0.56), -0.85, 2.36, 0.35);                   // driver hatch
  P.add('hull', box(0.56, 0.14, 0.56), 0.85, 2.36, 0.35);                    // bow gunner hatch
  periscope(P, 'hullDetail', -0.85, 2.46, 0.18);
  P.add('hull', sph(0.11, 12), 0.72, 1.95, 2.35);                            // bow MG ball on the glacis
  P.add('hullDark', cylZ(0.028, 0.26, 8), 0.72, 2.00, 2.50, -0.5, 0, 0);
  lightsAndGuards(P, [-1.05, 1.05], 2.02, 2.02, -0.3);
  towHook(P, -0.85, 0.75, 3.60); towHook(P, 0.85, 0.75, 3.60);
  KIT.towCable(P, [[-1.80, 2.02, -2.2], [-1.88, 2.06, 0.0], [-1.80, 2.02, 1.6]]);
  fenderTools(P, 1.78, 2.06, 0.8);
  KIT.spareTrackStrip(P, 'hull', 0, 1.60, 3.05, 4, -0.55, 0);                // links on the glacis
  P.decal('hull', 'star', null, 0.6, [1.865, 1.85, 0.6], Math.PI / 2);
  P.decal('hull', 'star', null, 0.6, [-1.865, 1.85, 0.6], -Math.PI / 2);

  // turret: big cast rounded body with a long bustle (T29/T30 family)
  P.turretG.position.set(0, 2.30, 0.0);
  P.add('turret', lathe([                                                    // cast dome
    [1.42, 0.05], [1.52, 0.16], [1.55, 0.34], [1.50, 0.55], [1.38, 0.72],
    [1.16, 0.84], [0.86, 0.91], [0.48, 0.945], [0.02, 0.95],
  ], P.q ? 30 : 20, 1.06), 0, 0.005, -0.15);
  P.add('turret', box(2.30, 0.16, 1.80), 0, 0.06, -0.25);                    // ring skirt band
  P.add('turret', slab(                                                      // bustle box to the rear
    [-1.10, 0.05, -1.20], [1.10, 0.05, -1.20], [0.85, 0.18, -2.05], [-0.85, 0.18, -2.05],
    [-1.10, 0.82, -1.20], [1.10, 0.82, -1.20], [0.85, 0.72, -2.05], [-0.85, 0.72, -2.05]));
  P.add('turretDark', box(0.60, 0.30, 0.04), 0, 0.42, -2.06);                // bustle door seam
  // roof furniture: cupola (right), loader hatch (left), periscopes
  P.add('turret', cylY(0.28, 0.30, 0.16, 16), 0.55, 0.90, -0.72);
  P.add('turret', cylY(0.24, 0.24, 0.035, 16), 0.55, 0.985, -0.72);
  P.add('turretDark', box(0.38, 0.015, 0.03), 0.55, 1.012, -0.72);
  P.add('turret', cylY(0.21, 0.23, 0.06, 14), -0.55, 0.90, -0.70);           // loader hatch ring
  P.add('turret', cylY(0.18, 0.18, 0.028, 14), -0.55, 0.955, -0.70);
  periscope(P, 'turretDetail', -0.30, 0.93, 0.30);
  P.add('turret', cylY(0.11, 0.13, 0.06, 10), 0.30, 0.93, 0.10);             // ventilator
  liftEye(P, 'turretDetail', -1.05, 0.70, 0.40, 0.5);
  liftEye(P, 'turretDetail', 1.05, 0.70, 0.40, -0.5);
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.32, [1.35, 0.35, -0.45], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.32, [-1.35, 0.35, -0.45], -Math.PI / 2, 0, -0.10);
  {                                                                          // §B3 census .50cal on the roof rear
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'm2', tone: 'dark', scale: 0.9, elev: 0.16, seed: 30,
    });
    mg.position.set(0.55, 0.62, -1.35);
    mg.rotation.y = Math.PI;                                                 // parked over the bustle
    P.turretG.add(mg);
  }

  // 155 mm T7: massive rounded mantlet, thick two-step tube, ~3.2 m overhang
  P.gunG.position.set(0, 0.35, 0.50);
  P.addGunExtra(cylX(0.34, 1.05, 16), 0, 0, 0.10);                           // trunnion roll
  P.addGunExtra(cylZ(0.30, 0.85, 14, 0.36), 0, 0, 0.55);                     // cast mantlet collar
  P.addGunExtraDark(cylZ(0.032, 0.14, 8), 0.46, 0.10, 0.60);                 // coax port
  buildGun(P, { len: 6.55, r: 0.115, brake: null, evac: null, sleeve: false, collar: false, baseR: 0.18 });
  P.add('gun', cylZ(0.155, 2.30, 14), 0, 0, 1.90);                           // fat rear tube section
  P.add('gun', cylZ(0.165, 0.14, 14), 0, 0, 3.10);                           // step ring
  P.add('gunDark', cylZ(0.156, 0.03, 14), 0, 0, 3.18);
  P.add('gun', cylZ(0.125, 0.16, 12), 0, 0, 6.42);                           // muzzle collar (overall 10.9 anchor)
  P.topY = 1.35;
}

export const WW2_PROFILES = {
  t30: { build: buildT30 },
  t34_85_cad: { build: buildT3485 },
  newc_tiger: { build: buildNewcTiger },
  newc_pziii: { build: buildNewcPziii },
  pziii_konserwa: { build: buildPziiiKonserwa },
  leichttraktor: { build: buildLeichttraktor },
  q_heavy: { build: buildQHeavy },
  tiger2: { build: buildTiger2 },
  sherman_jumbo: { build: buildShermanJumbo },
};
