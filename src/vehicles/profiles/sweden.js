// Swedish armored family — §5.248 GROUND-UP REBUILDS (sweden rebuild lane,
// 2026-08-17). All three builds are first-party §K measured-loft
// constructions against the batch-B prints (LOCAL-ONLY quarantine
// instruments, never shipped):
//
//   strv81  <- strv81_mmdsonic.glb   (Centurion Mk 3 identity; extraction-
//              suspect print = measurement-only; row yawOffset PI).
//              Frame: hull ±3.78 (published 7.56), muzzle +6.05 (9.83).
//              Print receipts (docs/references/vertex/strv81.json, build
//              frame = print z + 1.211): engine deck 1.94 falling to the
//              1.71 fighting deck, glacis break +2.35 -> center nose 3.54,
//              fender horns to 3.87; turret metal z -1.50..+2.25, widest
//              ±1.658 with side bins, cast crown 2.85, cupola dome 3.02;
//              20-pdr axis 2.08, ext. mantlet r 0.54..0.92 over z 1.39..2.01.
//              KNOWN ORACLE DEFECT (packet cap): two fused whip antennas
//              rake back over z -2.25..-0.25 to y 4.17; matching them would
//              put ~25 build columns into the dims p95 roof (heightM 3.6
//              class) — whips here match bases/rake but stop p95-safe.
//              Excision repair plan queued for the orchestrator lane.
//   strv103 <- strv103b_lamonekeli.glb (fused casemate, fixedMount; row
//              yawOffset +PI/2). Frame: body ±3.52 (published 7.04), fixed
//              105 muzzle +5.47 (8.99). The print is length-short vs its
//              own width (-18.2% body) — published dims are sovereign, so
//              the build lofts the print's WEDGE SHAPE onto the published
//              frame (print z scale 1.2229 about the body mid). The
//              whole-view rows carry the print-frame cost (packet cap +
//              length-warp repair plan queued).
//   strv122 <- strv122_vavtrudner.glb (TRIPO AI print — WEAK instrument,
//              visual influence only; row yawOffset -PI/2). All metrics
//              anchor to published dims (7.72 hull / 9.97 overall / 3.75
//              width / 3.02 height); the print guides equipment stations
//              (roof armor fields, Galix banks, basket, mast pair, wavy
//              skirt hem) at Leopard 2A5-class real proportions.
//
// Geometry is authored fresh in this module (no donor build calls; the
// centurion3 / leo2a5 / casemate residents stay byte-held). Shared
// machinery comes only from kit.js/tankFactory KIT.

import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.js';

const slab = orientedSlab; // §C.1 winding guard on every hand-built slab

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

// Closed body loft: rows { z, b, t, w, wt } (bottom y, top y, half-width at
// the bottom, half-width at the top — wt defaults to w). Each segment is one
// closed oriented slab, so the shell reads as solid fabrication (§7.2
// plate-fill law) and every station window sees real end faces.
function loftBody(P, bucket, rows) {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]; const c = rows[i + 1];
    const aw = a.w; const cw = c.w;
    const awt = a.wt ?? a.w; const cwt = c.wt ?? c.w;
    P.add(bucket, slab(
      [-aw, a.b, a.z], [aw, a.b, a.z], [cw, c.b, c.z], [-cw, c.b, c.z],
      [-awt, a.t, a.z], [awt, a.t, a.z], [cwt, c.t, c.z], [-cwt, c.t, c.z]));
  }
}

// Segmented long side strip (edge-on prism law §7.3): per-bin boxes with
// real end faces so every 0.52 m station window catches a cap.
function segStrip(P, bucket, x, y, z0, z1, w, h, seg = 0.46) {
  const n = Math.max(1, Math.round((z1 - z0) / seg));
  const d = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    P.add(bucket, KIT.box(w, h, d - 0.015), x, y, z0 + d * (i + 0.5));
  }
}

// ===========================================================================
// Strv 81 — Swedish Centurion Mk 3, 20-pdr era
// ===========================================================================
function buildStrv81(P) {
  const { box, cylX, cylY, cylZ, torus, polyMultiLoft, headlight, liftEye,
    periscope, towCable, spareTrackStrip, buildRunningGear } = KIT;

  // ---- hull ---------------------------------------------------------------
  // Print side/plan lines (build z): tail plate -3.78, engine deck 1.94 over
  // -3.2..-2.6 falling to the 1.71 fighting deck at -0.4..+2.35, glacis to
  // the 1.21 center nose at +3.46, fender horns running to +3.78.
  const TUB_W = 1.02;
  const BELT = 1.30;                       // sponson floor / skirt top line
  // lower tub with nose/tail rakes (belly 0.42 between the tracks)
  loftBody(P, 'hull', [
    { z: -3.63, b: 1.00, t: BELT, w: 0.94 },
    { z: -3.30, b: 0.60, t: BELT, w: TUB_W },
    { z: -2.60, b: 0.50, t: BELT, w: TUB_W },
    { z: 2.60, b: 0.50, t: BELT, w: TUB_W },
    { z: 3.00, b: 0.30, t: BELT, w: TUB_W },
    { z: 3.24, b: 0.46, t: BELT, w: TUB_W },
    { z: 3.38, b: 0.62, t: BELT, w: 0.98 },
  ]);
  // upper body: the print's raised engine deck falls in one continuous loft
  // to the fighting deck, then the full-width glacis drops to the nose.
  loftBody(P, 'hull', [
    { z: -3.72, b: BELT, t: 1.80, w: 1.00 },
    { z: -3.45, b: BELT, t: 1.86, w: 1.04 },
    { z: -3.20, b: BELT, t: 1.930, w: 1.04 },
    { z: -2.60, b: BELT, t: 1.930, w: 1.04 },
    { z: -2.00, b: BELT, t: 1.89, w: 1.04 },
    { z: -1.20, b: BELT, t: 1.83, w: 1.04 },
    { z: -0.40, b: BELT, t: 1.71, w: 1.04 },
    { z: 2.28, b: BELT, t: 1.71, w: 1.04 },
  ]);
  // glacis: ref step line 1.71@2.28 -> 1.55@2.72 -> 1.55 splash plateau to
  // 3.07 -> 1.46@3.30 -> 1.30@3.52 -> nose tip 1.16@3.54 (center plate).
  P.add('hull', slab(
    [-1.49, 1.02, 3.34], [1.49, 1.02, 3.34], [1.04, 1.26, 2.28], [-1.04, 1.26, 2.28],
    [-1.49, 1.14, 3.38], [1.49, 1.14, 3.38], [1.04, 1.71, 2.28], [-1.04, 1.71, 2.28]));
  P.add('hull', slab(
    [-1.30, 1.50, 3.07], [1.30, 1.50, 3.07], [1.24, 1.575, 2.72], [-1.24, 1.575, 2.72],
    [-1.30, 1.548, 3.07], [1.30, 1.548, 3.07], [1.24, 1.62, 2.72], [-1.24, 1.62, 2.72]));
  // nose lower plate closes the beak to the tub
  P.add('hull', slab(
    [-0.98, 0.90, 3.36], [0.98, 0.90, 3.36], [1.02, 0.55, 3.10], [-1.02, 0.55, 3.10],
    [-1.49, 1.02, 3.385], [1.49, 1.02, 3.385], [1.04, 1.26, 2.30], [-1.04, 1.26, 2.30]));
  // tail plate + lower rear rake close the stern
  P.add('hull', slab(
    [-0.94, 1.00, -3.63], [0.94, 1.00, -3.63], [1.02, 0.60, -3.30], [-1.02, 0.60, -3.30],
    [-1.00, 1.80, -3.72], [1.00, 1.80, -3.72], [1.04, 1.86, -3.45], [-1.04, 1.86, -3.45]));

  // fenders: full-length top plates over the track lane, segmented (§7.3),
  // with the print's falling horn courses closing the ±1.6 line at the bow.
  segStrip(P, 'hull', -1.3325, 1.700, -3.72, 2.42, 0.575, 0.035, 0.512);
  segStrip(P, 'hull', 1.3325, 1.700, -3.72, 2.42, 0.575, 0.035, 0.512);
  segStrip(P, 'hullDetail', -1.6525, 1.648, -3.70, 2.40, 0.062, 0.032, 0.505);
  segStrip(P, 'hullDetail', 1.6525, 1.648, -3.70, 2.40, 0.062, 0.032, 0.505);
  for (const s of [-1, 1]) {
    // falling fender-horn courses (ref line 1.66@2.42 -> 1.55@2.72..3.07 ->
    // 1.46@3.30 -> 1.32@3.56 -> 1.16 tip at 3.74)
    P.add('hull', slab(
      [s * 0.93, 1.47, 3.07], [s * 1.675, 1.47, 3.07], [s * 1.675, 1.56, 2.42], [s * 1.06, 1.56, 2.42],
      [s * 0.93, 1.55, 3.07], [s * 1.675, 1.55, 3.07], [s * 1.675, 1.66, 2.42], [s * 1.06, 1.66, 2.42]));
    P.add('hull', slab(
      [s * 0.93, 1.36, 3.30], [s * 1.675, 1.36, 3.30], [s * 1.675, 1.47, 3.07], [s * 1.06, 1.47, 3.07],
      [s * 0.93, 1.46, 3.30], [s * 1.675, 1.46, 3.30], [s * 1.675, 1.55, 3.07], [s * 1.06, 1.55, 3.07]));
    P.add('hull', slab(
      [s * 0.93, 1.03, 3.65], [s * 1.66, 1.03, 3.65], [s * 1.66, 1.36, 3.30], [s * 1.06, 1.36, 3.30],
      [s * 0.93, 1.13, 3.655], [s * 1.66, 1.13, 3.655], [s * 1.66, 1.46, 3.30], [s * 1.06, 1.46, 3.30]));
    // idler guard side hang (ref keeps falling to 0.85 at the tip zone)
    P.add('hull', box(0.025, 0.34, 0.30), s * 1.615, 1.03, 3.50);
    // rear fender fall into the raised overhang shelf
    P.add('hull', slab(
      [s * 1.05, 1.585, -3.77], [s * 1.675, 1.585, -3.77], [s * 1.675, 1.665, -3.58], [s * 1.05, 1.665, -3.58],
      [s * 1.05, 1.655, -3.77], [s * 1.675, 1.655, -3.77], [s * 1.675, 1.70, -3.58], [s * 1.05, 1.70, -3.58]));
    // skirt course: continuous plate line at ±1.664 (bosses carry the
    // committed 3.39 width), hem at the print's 0.84 exposed-disc line.
    for (let k = 0; k < 12; k++) {
      P.add('hull', box(0.020, 0.50, 0.452), s * 1.654, 1.05, -2.79 + k * 0.467);
    }
    for (const bz of [-2.32, -1.39, -0.45, 0.49, 1.42, 2.36]) {
      P.add('hullDetail', box(0.031, 0.40, 0.24), s * 1.6745, 1.03, bz);
    }
    // skirt hem brackets
    for (let k = 0; k < 6; k++) {
      P.add('hullDetail', box(0.015, 0.36, 0.10), s * 1.652, 0.82, -2.5 + k * 0.99);
    }
    // hull side wall above the skirts to the fender line (closes the
    // sponson face the print reads at ±1.6 between hem and deck)
    segStrip(P, 'hull', s * 1.594, 1.50, -3.70, 2.42, 0.024, 0.40, 0.51);
  }

  // ---- running gear: six-wheel Horstmann course, rear drive, front idler
  for (const s of [-1, 1]) {
    P.add('hullRunningGearDark', box(0.02, 1.06, 6.6), s * 1.03, 0.62, -0.10);
  }
  // inter-track sight baffles: break the 3/4-view line to the far-side gear
  // under the raked bow/stern (hidden behind the wraps in every scored view)
  P.add('hullRunningGearDark', box(2.02, 0.14, 0.03), 0, 0.45, 2.98);
  P.add('hullRunningGearDark', box(2.02, 0.14, 0.03), 0, 0.46, -3.10);
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.455, xc: 1.315,
    wheelZs: [1.95, 1.10, 0.22, -0.66, -1.54, -2.42],
    sprocket: { z: -3.22, y: 0.74, r: 0.31 }, idler: { z: 3.04, y: 0.78, r: 0.32 },
    trackW: 0.54, trackTh: 0.085, topY: 1.02, botY: 0.055,
    coveredTop: true, arms: false, paintedEnds: true, contactZF: 2.10, contactZR: -2.44,
    // r-series dark-olive recipe + gearFloor ambient re-attach (the
    // ambient-dead pad class reads as mask holes in the floater scan)
    padHex: 0x343a29, chainHex: 0x2b3122, tireHex: 0x3a4034, gearFloor: true,
  });

  // ---- glacis / deck furniture ---------------------------------------
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.048, shield: true,
      seed: 8135 + (s > 0 ? 1 : 0),
    }), s * 0.98, 1.46, 3.14);
    liftEye(P, 'hullDetail', s * 1.34, 1.44, 3.30, s * 0.3);
    // rear stowage boxes on the fender run (print: proud boxes at the tail)
    P.add('hull', box(0.42, 0.15, 0.62), s * 1.32, 1.705, -3.05);
    P.add('hullDark', box(0.36, 0.020, 0.54), s * 1.32, 1.788, -3.05);
    P.add('hull', box(0.42, 0.15, 0.55), s * 1.32, 1.70, -2.32);
    P.add('hullDark', box(0.36, 0.018, 0.47), s * 1.32, 1.782, -2.32);
    // fender tool boxes forward
    P.add('hull', box(0.40, 0.14, 0.78), s * 1.33, 1.715, 1.06);
    P.add('hullDark', box(0.34, 0.016, 0.68), s * 1.33, 1.792, 1.06);
    P.add('hull', box(0.40, 0.13, 0.64), s * 1.33, 1.705, 2.10);
  }
  spareTrackStrip(P, 'hull', -0.52, 1.36, 3.06, 3);
  towCable(P, [[-0.92, 1.735, 2.15], [0, 1.715, 1.35], [0.92, 1.735, 2.15]]);
  // driver hatch (right) + periscopes on the glacis break
  P.add('hullDetail', box(0.44, 0.030, 0.40), 0.52, 1.725, 2.06);
  P.add('hullDark', box(0.36, 0.014, 0.03), 0.52, 1.742, 1.96);
  periscope(P, 'hullDetail', 0.36, 1.72, 1.86); periscope(P, 'hullDetail', 0.70, 1.72, 1.86);
  // engine deck louvres (the raised rear deck carries transverse ribs)
  P.add('hullDark', box(1.86, 0.022, 1.30), 0, 1.924, -2.88);
  if (P.q) for (let i = 0; i < 6; i++) {
    P.add('hullDetail', box(1.78, 0.024, 0.05), 0, 1.928, -3.36 + i * 0.19);
  }
  P.add('hullDark', box(1.70, 0.022, 0.72), 0, 1.885, -2.02);
  for (let i = 0; i < 4; i++) {
    P.add('hullDetail', box(1.62, 0.022, 0.05), 0, 1.895, -2.28 + i * 0.17);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.035, 10), s * 0.72, 1.895, -1.55);
  // rear overhang shelf: the ref hangs a HIGH full-width shelf past the
  // sprocket (bottoms 1.29, tops 1.80 -> 1.64 falling to the -3.845 end)
  P.add('hull', slab(
    [-1.55, 1.24, -3.90], [1.55, 1.24, -3.90], [1.55, 1.26, -3.70], [-1.55, 1.26, -3.70],
    [-1.55, 1.67, -3.90], [1.55, 1.67, -3.90], [1.55, 1.80, -3.70], [-1.55, 1.80, -3.70]));
  // tail: exhaust box + rear plate kit (print: center mass 0.9 halfW)
  P.add('hull', box(1.62, 0.30, 0.16), 0, 1.46, -3.70);
  P.add('hullDark', box(0.34, 0.16, 0.10), -0.55, 1.30, -3.72);
  P.add('hullDark', box(0.34, 0.16, 0.10), 0.55, 1.30, -3.72);
  towCable(P, [[-0.84, 1.20, -3.68], [0, 1.10, -3.71], [0.84, 1.20, -3.68]]);
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.05, 0.94, 0.028), s * 1.615, 1.13, -3.64);
    P.add('hullRubber', box(0.075, 0.40, 0.028), s * 1.575, 0.98, 3.60);
  }

  // ---- turret: cast Mk 3 shell (ring 0,1.76,0.35) -------------------------
  // Print stations (turret local = world - [0,1.76,0.35]): metal z
  // -1.85..+1.90 local, widest ±1.13 cast + side bins to ±1.63, skirt bottom
  // -0.14 local at the sides, undercut bustle (+0.24), crown 1.09 local.
  P.turretG.position.set(0, 1.76, 0.35);
  P.gunG.position.set(0, 0.32, 0.75);
  const PLAN = [
    [0.42, 1.44], [0.86, 1.26], [1.10, 0.55], [1.13, -0.30], [0.96, -1.05],
    [0.70, -1.80], [-0.70, -1.80], [-0.96, -1.05], [-1.13, -0.30],
    [-1.10, 0.55], [-0.86, 1.26], [-0.42, 1.44],
  ];
  const frontBias = (pt) => pt[1] > 1.0 ? 0.16 : pt[1] > 0 ? -0.02 : pt[1] < -1.5 ? 0.24 : -0.14;
  // cast walls: uniform-height rings (a per-point front dive on the cap ring
  // read as a tent roof); the front dive lives in the brow/roof cap below.
  P.add('turret', polyMultiLoft(PLAN, [
    { height: (pt) => frontBias(pt), inset: 1 },
    { height: 0.42, inset: 1 },
    { height: (pt) => (pt[1] > 1.0 ? 0.56 : 0.74), inset: (pt) => (pt[1] > 1.0 ? 0.90 : 0.93) },
    { height: (pt) => (pt[1] > 1.0 ? 0.62 : 0.96), inset: (pt) => (pt[1] > 1.0 ? 0.72 : 0.80) },
  ]));
  // roof cap: rear-biased plan, gentle dome to the 2.85 crown plateau
  P.add('turret', polyMultiLoft([
    [0.42, 0.78], [0.80, 0.32], [0.92, -0.35], [0.78, -1.02], [0.52, -1.52],
    [-0.52, -1.52], [-0.78, -1.02], [-0.92, -0.35], [-0.80, 0.32], [-0.42, 0.78],
  ], [
    { height: 0.88, inset: 0.97 },
    { height: 1.055, inset: 0.76 },
    { height: 1.09, inset: 0.40 },
  ]));
  // brow: closes the fwd crown from the cheek tops to the roof cap — front
  // edge buried in the wall face, rear edge overlapping the cap front.
  P.add('turret', slab(
    [-0.62, 0.44, 1.32], [0.62, 0.44, 1.32], [0.78, 0.80, 0.42], [-0.78, 0.80, 0.42],
    [-0.56, 0.60, 1.28], [0.56, 0.60, 1.28], [0.66, 1.00, 0.42], [-0.66, 1.00, 0.42]));
  // ABSORBED (owner c425f495): unequal skewed crown plates — the broken roof
  // cadence of the print — re-seated onto the measured roof cap.
  P.add('turret', box(0.74, 0.050, 0.58), -0.36, 1.095, -0.42, 0, -0.08, 0);
  P.add('turret', box(0.58, 0.046, 0.50), 0.38, 1.088, -0.35, 0, 0.10, 0);
  P.add('turretDark', box(0.46, 0.015, 0.08), 0.38, 1.118, -0.10, 0, 0.10, 0);
  // ABSORBED (owner c425f495): the print's large right-wall ventilator /
  // search housing — concentric drums + radial ribs, buried into the cast
  // side wall at the measured station.
  P.add('turret', cylX(0.20, 0.20, 18, 0.15), 1.02, 0.42, -0.62);
  P.add('turretDark', cylX(0.15, 0.035, 18, 0.12), 1.13, 0.42, -0.62);
  for (let i = 0; i < 6; i++) {
    P.add('turretDetail', box(0.028, 0.20, 0.032), 1.147, 0.42, -0.62, 0, 0, i * Math.PI / 3);
  }
  // ring plinth seats the shell on the 1.71 deck (no ring daylight)
  P.add('turret', cylY(1.06, 1.12, 0.10, P.q ? 26 : 14), 0, -0.10, -0.10);
  // side stowage bins carry the print's ±1.63 plan line (left long, right
  // split — §K.1 preserved asymmetry), seated into the cast wall.
  P.add('turret', box(0.52, 0.42, 1.38), -1.395, 0.34, 0.32);
  P.add('turretDark', box(0.46, 0.018, 1.26), -1.395, 0.558, 0.32);
  P.add('turret', box(0.50, 0.40, 0.88), 1.40, 0.33, 0.42);
  P.add('turretDark', box(0.43, 0.016, 0.78), 1.40, 0.538, 0.42);
  P.add('turret', box(0.44, 0.36, 0.55), 1.34, 0.32, -0.55);
  // bustle bin across the rear face + rear-quarter stowage (print plan
  // carries the wide line to the bustle)
  P.add('turret', box(2.04, 0.50, 0.42), 0, 0.52, -1.94);
  P.add('turretDark', box(1.92, 0.020, 0.34), 0, 0.778, -1.94);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.34, 0.40, 0.92), s * 1.20, 0.36, -1.22);
    P.add('turretDark', box(0.28, 0.016, 0.82), s * 1.20, 0.568, -1.22);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.030, 0.44, 0.030), s * 0.72, 0.50, -2.10);
  }
  // commander cupola (left) with the crown at the published 3.01/3.02 line —
  // ORACLE DEFECT CAP: the print's cupola/MG cluster reads 3.08-3.15; the
  // published p95 roof pins this build at 3.02/3.04 (packet cap).
  // The earlier station matched the measured bounds but disappeared at
  // garage scale.  The source's broad multi-block cupola is expressed in
  // plan (not height) so it remains within the certified roof envelope.
  P.add('turret', cylY(0.34, 0.37, 0.14, 20), -0.44, 1.10, -0.45);
  P.add('turretDark', torus(0.325, 0.017, 20), -0.44, 1.185, -0.45);
  P.add('turret', cylY(0.305, 0.305, 0.055, 20), -0.44, 1.21, -0.45);
  P.add('turret', KIT.sph(0.155, 18, Math.PI / 2), -0.44, 1.13, -0.45);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.20;
    P.add('turretDetail', box(0.105, 0.052, 0.035),
      -0.44 + Math.sin(a) * 0.335, 1.142, -0.45 + Math.cos(a) * 0.335, 0, a, 0);
    P.add('turretGlass', box(0.079, 0.027, 0.018),
      -0.44 + Math.sin(a) * 0.345, 1.151, -0.45 + Math.cos(a) * 0.345, 0, a, 0);
  }
  // Loader hatch: broad source coaming, hinged lid, vision block and a low
  // grab handle.  Every part overlaps the roof or the coaming below it.
  P.add('turretDark', torus(0.285, 0.015, 18), 0.42, 1.10, -0.42);
  P.add('turret', cylY(0.270, 0.270, 0.050, 18), 0.42, 1.095, -0.42);
  P.add('turretDetail', box(0.25, 0.042, 0.075), 0.42, 1.132, -0.66);
  P.add('turretDark', box(0.18, 0.028, 0.038), 0.42, 1.158, -0.64);
  P.add('turretGlass', box(0.11, 0.026, 0.025), 0.42, 1.135, -0.17);
  for (const x of [0.31, 0.53]) {
    P.add('turretDetail', box(0.025, 0.052, 0.19), x, 1.145, -0.42);
  }
  // shielded Ksp AA mount forward of the cupola, held under the 3.04 line
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.84,
    elev: 0.04, shield: false, ammo: true, seed: 8120,
  }), -0.44, 1.04, 0.02, [0, 0.06, 0]);
  // Source-specific low cradle rails make the mount read as one planted
  // station rather than a loose barrel over the cast roof.
  P.add('turretDetail', box(0.040, 0.070, 0.47), -0.67, 1.105, -0.02, 0, 0.06, 0);
  P.add('turretDetail', box(0.040, 0.070, 0.47), -0.21, 1.105, -0.02, 0, 0.06, 0);
  P.add('turretDark', box(0.50, 0.040, 0.045), -0.44, 1.125, 0.18, 0, 0.06, 0);
  // periscope cadence on the forward crown
  for (const [x, z, ry] of [[-0.30, 0.86, 0.06], [0.06, 0.92, 0], [0.42, 0.84, -0.08]]) {
    P.add('turretDetail', box(0.13, 0.045, 0.075), x, 1.065, z, 0, ry, 0);
    P.add('turretGlass', box(0.09, 0.020, 0.013), x, 1.088, z + 0.034, 0, ry, 0);
  }
  // Low crown service courses and grab rails from the source top view.  The
  // courses are intentionally shallow and broken around both crew stations.
  for (const [x, z, w, d, ry] of [
    [-0.70, 0.35, 0.34, 0.035, -0.18],
    [0.68, 0.32, 0.32, 0.035, 0.18],
    [-0.73, -0.98, 0.30, 0.035, 0.08],
    [0.73, -0.98, 0.30, 0.035, -0.08],
    [0.00, -1.30, 0.62, 0.032, 0],
  ]) {
    P.add('turretDark', box(w, 0.016, d), x, 1.078, z, 0, ry, 0);
  }
  for (const x of [-0.76, 0.76]) {
    P.add('turretDetail', box(0.030, 0.055, 0.50), x, 1.105, -1.12);
    P.add('turretDetail', box(0.22, 0.055, 0.030), x > 0 ? 0.66 : -0.66, 1.105, -1.36);
  }
  // whip pair: print bases (±0.40, world 2.72, z -0.45/-0.28) and BACKWARD
  // rakes are matched via the mount rotation (antennaWhip's own rake is a
  // lateral lean); length stops at the p95-safe 3.04 line (cap note above).
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.040, 0.050, 0.09, 10), s * 0.40, 0.90, -0.82);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: s < 0 ? 0.30 : 0.26, r: 0.012, rake: 0,
      seed: 8130 + (s > 0 ? 1 : 0),
    }), s * 0.40, 0.955, -0.82, [s < 0 ? -1.05 : -0.50, 0, 0]);
  }
  // Large source search lamp: backed drum, brow-buried shoe and visible lens.
  P.add('turretDetail', box(0.10, 0.22, 0.10), -0.60, 0.58, 1.00);
  P.add('turret', cylZ(0.120, 0.18, 16), -0.60, 0.74, 1.08);
  P.add('turretDark', torus(0.105, 0.014, 16), -0.60, 0.74, 1.175, Math.PI / 2, 0, 0);
  P.add('turretGlass', cylZ(0.092, 0.018, 16), -0.60, 0.74, 1.180);
  // smoke dischargers on both cheeks (Centurion sextet cadence)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.18, 0.16), s * 0.84, 0.42, 1.10, 0, -s * 0.12, s * 0.08);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.046, len: 0.29,
      splay: s * 1.02, pitch: -0.40, arc: 0.52,
      slot: 'detail', seed: 8100 + (s > 0 ? 1 : 0),
    }), s * 0.87, 0.48, 1.16);
  }
  liftEye(P, 'turretDetail', -0.86, 0.70, -1.12, -0.5);
  liftEye(P, 'turretDetail', 0.86, 0.70, -1.12, 0.5);

  // ---- 20-pdr with the external cast mantlet -------------------------
  // gun frame: axis world 2.08 = gun local y 0; world z = local + 1.10.
  P.addGunExtra(slab(
    [-0.76, -0.34, 0.48], [0.76, -0.34, 0.48], [0.60, -0.28, 0.95], [-0.60, -0.28, 0.95],
    [-0.76, 0.36, 0.48], [0.76, 0.36, 0.48], [0.60, 0.30, 0.95], [-0.60, 0.30, 0.95]));
  P.addGunExtra(KIT.xform(cylX(0.34, 1.18, P.q ? 22 : 12), 0, 0, 0), 0, 0, 0.62);
  P.addGunExtraDark(box(1.30, 0.055, 0.06), 0, -0.325, 0.55);                 // dust-cover seam
  for (const s of [-1, 1]) {
    P.addGunExtraDark(cylX(0.055, 0.16, 10), s * 0.70, 0.02, 0.52);           // trunnion bosses
  }
  // tube: slim 20-pdr with counterweight swell at the muzzle (print r 0.107).
  // Gun-local frame: world z = local + 1.10; muzzle local 4.97 -> world 6.07
  // = published overall 9.85 against the -3.78 tail.
  P.add('gun', cylZ(0.100, 1.72, P.q ? 22 : 12, 0.113), 0, 0, 1.16);
  P.add('gun', cylZ(0.091, 2.00, P.q ? 22 : 12, 0.100), 0, 0, 3.02);
  P.add('gun', cylZ(0.085, 0.56, P.q ? 22 : 12, 0.091), 0, 0, 4.30);
  P.add('gun', cylZ(0.106, 0.42, P.q ? 22 : 12), 0, 0, 4.64);                 // counterweight (overlaps the tube)
  P.add('gunDark', cylZ(0.108, 0.05, 12), 0, 0, 4.47);
  muzzleBore(P, { z: 4.83, r: 0.082 });
  P.muzzleZ = 4.85;

  P.decal('turret', 'number', '81', 0.26, [1.395, 0.42, 0.42], Math.PI / 2);
  P.decal('turret', 'number', '81', 0.26, [-1.40, 0.44, 0.32], -Math.PI / 2);
  P.topY = 1.30;
}

// ===========================================================================
// Strv 103B — the S-tank. Fixed 105 in the hull, suspension-aimed wedge.
// ===========================================================================
function buildStrv103B(P) {
  const { box, cylX, cylY, cylZ, torus, frustum, headlight, liftEye,
    periscope, towCable, spareTrackStrip, buildRunningGear } = KIT;
  P.fixedMount = true;

  // ---- primary wedge (print shape lofted onto the published 7.04 frame) --
  // Rows from the mapped print table (tools/tmp-sweden-lofts.py strv103):
  // tail plate 1.30..1.64@-3.52, low rear deck 1.52-1.56, deck rise at
  // -1.6/-1.2, roof plateau 1.97-1.99, glacis break ~+1.35 falling to the
  // 1.54 nose, belly 0.34.
  const BELT = 1.36;                        // shoe-clearance seam (side wall break)
  const rows = [
    { z: -3.52, b: 1.02, t: 1.50, w: 0.92 },
    { z: -3.30, b: 0.66, t: 1.52, w: 1.02 },
    { z: -2.95, b: 0.40, t: 1.53, w: 1.02 },
    { z: -2.40, b: 0.34, t: 1.55, w: 1.02 },
    { z: -1.85, b: 0.34, t: 1.60, w: 1.02 },
    { z: -1.30, b: 0.34, t: 1.90, w: 1.02 },
    { z: -0.85, b: 0.34, t: 2.00, w: 1.02 },
    { z: 0.45, b: 0.34, t: 2.005, w: 1.02 },
    { z: 0.95, b: 0.34, t: 1.93, w: 1.02 },
    { z: 1.55, b: 0.34, t: 1.76, w: 1.02 },
    { z: 2.30, b: 0.40, t: 1.64, w: 1.02, wt: 1.46 },
    { z: 2.95, b: 0.52, t: 1.58, w: 1.00, wt: 1.26 },
    { z: 3.42, b: 0.66, t: 1.53, w: 0.94, wt: 1.06 },
  ];
  // lower tub + upper flare (the certified two-course recipe: tub inboard of
  // the course, upper loft flares to the full-width armor above the BELT)
  loftBody(P, 'hull', rows.map((r) => ({ z: r.z, b: r.b, t: Math.min(r.t, BELT), w: r.w })));
  loftBody(P, 'hull', rows.map((r) => ({
    z: r.z, b: Math.min(r.t, BELT), t: r.t, w: r.w,
    wt: r.t > BELT + 0.05 ? Math.min(1.58, r.w + 0.56) : r.w,
  })));
  // full-width deck edge strips close the sponson tops the flare leaves
  for (const s of [-1, 1]) {
    segStrip(P, 'hull', s * 1.50, 1.545, -3.05, 2.30, 0.16, 0.045, 0.535);
  }

  // ---- fixed 105 mm L74 (hull frame, fixedMount topology) -----------------
  // Bore axis 1.44 (print 1.435); muzzle at the published overall (+5.47).
  muzzleBore(P, { z: 5.425, r: 0.082, y: 1.44, parent: 'hullG' });
  const gunRuns = [
    { z0: 5.44, z1: 5.32, r: 0.104 },                                        // muzzle collar
    { z0: 5.32, z1: 3.62, r: 0.082 },                                        // fore tube
    { z0: 3.62, z1: 2.42, r: 0.090 },                                        // mid step
    { z0: 2.42, z1: 1.30, r: 0.098, r2: 0.112 },                             // rear taper into the glacis
  ];
  for (const rn of gunRuns) {
    P.add('hull', KIT.xform(cylZ(rn.r, rn.z0 - rn.z1, P.q ? 20 : 10, rn.r2 ?? rn.r),
      0, 0, (rn.z0 + rn.z1) / 2), 0, 1.44, 0);
  }
  P.add('hull', KIT.xform(cylZ(0.115, 0.46, 12, 0.13), 0, 0, 0, -0.34), 0, 1.42, 1.30); // glacis exit sleeve
  P.add('hullDetail', box(0.06, 0.26, 0.06), 0, 1.20, 3.02);                 // travel-clamp post
  P.add('hullDetail', box(0.22, 0.05, 0.09), 0, 1.335, 3.02);
  P.turretG.position.set(0, 1.44, 0.40);                                     // virtual anchors (fx only)
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 5.02;

  // ---- the 103B nose protection screen (the print's defining fence) ------
  // Two supported carriers planted into the glacis shoulders + eleven ribs:
  // tips ride the print's 2.03-2.08 line over the glacis (z +1.6..+2.9).
  for (const [y, z] of [[1.86, 1.98], [2.02, 1.72]]) {
    P.add('hullDetail', box(2.56, 0.034, 0.034), 0, y, z, -0.42, 0, 0);
  }
  for (let i = 0; i < 11; i++) {
    const x = -1.20 + i * 0.24;
    P.add('hullDetail', box(0.028, 0.55, 0.028), x, 1.82, 1.90, -0.46, 0, (i - 5) * 0.014);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.09, 0.30, 0.11), s * 1.26, 1.70, 1.84, -0.42, 0, 0);
  }

  // ---- folded dozer blade under the nose ----------------------------------
  P.add('hull', slab(
    [-1.46, 0.52, 2.72], [1.46, 0.52, 2.72], [1.46, 0.68, 3.38], [-1.46, 0.68, 3.38],
    [-1.46, 0.74, 2.76], [1.46, 0.74, 2.76], [1.46, 0.86, 3.38], [-1.46, 0.86, 3.38]));
  P.add('hullDark', box(1.70, 0.05, 0.06), 0, 0.52, 2.76);
  P.add('hullDark', cylX(0.070, 2.56, 12), 0, 0.70, 3.34);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.055, 0.06, 0.82), s * 0.86, 0.64, 2.42, -0.36, 0, 0);
    P.add('hullDetail', box(0.075, 0.11, 1.02), s * 0.78, 0.82, 2.70, -0.46, 0, 0);
  }

  // ---- glacis louvre banks (radiators live on the glacis) -----------------
  const glY = (z) => 1.76 - (z - 0.95) * 0.30;
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.80, 0.025, 1.10), s * 0.46, glY(1.75) + 0.02, 1.75, -0.30, 0, 0);
    for (let i = 0; i < 6; i++) {
      const z = 1.30 + i * 0.19;
      P.add('hullDetail', box(0.78, 0.026, 0.045), s * 0.46, glY(z) + 0.045, z + 0.05, -0.30, 0, 0);
    }
  }
  P.add('hullDetail', box(1.78, 0.05, 0.05), 0, glY(2.45) + 0.05, 2.45, -0.30, 0, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hullTrack', box(0.25, 0.055, 0.17), s * (0.36 + i * 0.28), 1.06, 2.62, -0.30, 0, 0);
  }

  // ---- commander station / roof suite --------------------------------
  // Print cluster caps 2.33 over ~1 m of roof; published heightM (2.14,
  // p95-sovereign) pins the build cluster at 2.16 (certified cap class).
  P.add('hull', box(0.80, 0.10, 1.00), 0.48, 2.02, -0.30);                    // planted plinth
  P.add('hull', box(0.34, 0.24, 0.36), 0.62, 2.03, -0.52);                    // sight head
  P.add('hullDark', box(0.30, 0.02, 0.32), 0.62, 2.155, -0.52);
  P.add('hull', cylY(0.24, 0.26, 0.10, 16), 0.24, 2.03, -0.10);               // commander cupola
  P.add('hullDark', torus(0.235, 0.014, 16), 0.24, 2.095, -0.10);
  mount(P, 'hull', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.60,
    elev: 0.02, shield: false, ammo: true, seed: 10320,
  }), 0.24, 2.02, -0.10, [0, 0.05, 0]);
  P.add('hull', cylY(0.15, 0.17, 0.11, 14), 0.02, 2.00, -0.30);               // crown drum
  P.add('hullDark', torus(0.145, 0.012, 14), 0.02, 2.065, -0.30);
  P.add('hull', KIT.sph(0.145, 14, Math.PI / 2), -0.52, 1.96, 0.10);          // observation dome
  P.add('hullDark', torus(0.13, 0.011, 12), -0.52, 2.005, 0.10);
  periscope(P, 'hullDetail', 0.26, 1.94, 0.55); periscope(P, 'hullDetail', -0.30, 1.92, 0.72);
  P.add('hull', box(0.50, 0.14, 0.46), -0.72, 2.00, -1.05);                   // unequal service lid
  P.add('hullDark', box(0.44, 0.018, 0.40), -0.72, 2.075, -1.05);
  P.add('hull', box(0.36, 0.10, 0.36), 0.10, 1.99, -1.22);

  // ---- rear deck: twin grilles, boxes, rim strip ---------------------
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.98, 0.025, 0.88), s * 0.60, 1.63, -2.30);
    for (let i = 0; i < 7; i++) {
      P.add('hullDetail', box(0.90, 0.026, 0.034), s * 0.60, 1.652, -2.63 + i * 0.11);
    }
    P.add('hull', box(0.40, 0.12, 0.34), s * 1.12, 1.60, -1.85);
    P.add('hullDark', box(0.34, 0.016, 0.28), s * 1.12, 1.665, -1.85);
    // rear stowage boxes over the tail slope
    P.add('hull', box(0.50, 0.15, 0.80), s * 1.24, 1.615, -2.95);
    P.add('hullDark', box(0.51, 0.11, 0.022), s * 1.24, 1.62, -2.95);
  }
  // flotation-screen rim strips around the deck edge (103B cue)
  for (const s of [-1, 1]) {
    segStrip(P, 'hull', s * 1.560, 1.985, -1.30, 1.05, 0.065, 0.055, 0.47);
    segStrip(P, 'hull', s * 1.545, 1.60, -3.05, -1.35, 0.065, 0.050, 0.44);
  }
  P.add('hull', box(2.98, 0.055, 0.065), 0, 1.53, -3.42);
  P.add('hull', box(2.60, 0.05, 0.06), 0, 1.90, 1.15, -0.30, 0, 0);
  // raked antenna masts (print pair at the rear roof)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.042, 0.052, 0.09, 10), s * 0.94, 1.62, -2.02);
    P.add('hullDark', KIT.xform(cylY(0.012, 0.009, 0.52, 8), 0, 0.26, 0, -0.22, 0, 0), s * 0.94, 1.66, -2.02);
  }
  // fixed MG box on the left front fender (Ksp 58 pair)
  P.add('hull', box(0.24, 0.14, 0.56), -1.44, 1.50, 1.72, -0.16, 0, 0);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.50, 1.56, 2.04);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.40, 1.56, 2.04);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.40, 0.22, 0.10), s * 1.24, 1.35, 2.46, -0.30, 0, 0);
    for (const [dx, dy] of [[-0.09, 0.04], [0.09, 0.04], [0, -0.05]]) {
      headlight(P, s * 1.24 + dx, 1.36 + dy, 2.51, -0.30, 0.046);
    }
  }
  liftEye(P, 'hullDetail', -1.50, 2.02, 0.55, 0.4); liftEye(P, 'hullDetail', 1.50, 2.02, 0.55, -0.4);
  towCable(P, [[-0.85, 1.62, 2.30], [0, 1.70, 1.75], [0.85, 1.62, 2.30]]);
  // tail exhausts under the stern lip (band-thin)
  P.add('hullDark', box(2.9, 0.075, 0.05), 0, 1.26, -3.55);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.52, 0.10, 0.26), s * 0.82, 1.42, -3.44);
    P.add('hullDark', cylZ(0.052, 0.14, 8), s * 0.52, 1.34, -3.50);
    P.add('hullDark', box(1.00, 0.22, 0.026), s * 0.64, 1.42, -3.556);
    for (let i = 0; i < 4; i++) {
      P.add('hullDetail', box(0.92, 0.022, 0.036), s * 0.64, 1.335 + i * 0.058, -3.575);
    }
  }

  // ---- side row + rear air-cleaner boxes (the 3.63 width carrier) ----
  for (const s of [-1, 1]) {
    // shallow segmented skirt/stowage course over the wheel tops
    for (let k = 0; k < 7; k++) {
      const z = 1.50 - k * 0.62;
      P.add('hull', box(0.075, 0.55, 0.55), s * 1.545, 1.05, z);
      P.add('hullDark', box(0.018, 0.46, 0.47), s * 1.592, 1.05, z);
      P.add('hullDetail', box(0.016, 0.11, 0.51), s * 1.60, 1.28, z);
    }
    // rear air-cleaner / service boxes: the S-tank's widest point (±1.815
    // over a 0.58 z-band carries the published 3.63 widthM)
    P.add('hull', box(0.42, 0.46, 0.60), s * 1.61, 1.30, -2.62);
    P.add('hullDark', box(0.020, 0.38, 0.50), s * 1.8055, 1.30, -2.62);
    P.add('hullDetail', box(0.016, 0.10, 0.54), s * 1.812, 1.50, -2.62);
  }

  // ---- running gear: 4 big discs, front drive, raised rear idler ----------
  for (const s of [-1, 1]) {
    P.add('hullRunningGearDark', box(0.02, 0.66, 4.3), s * 1.02, 0.60, 0.05);
  }
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.72, wheelR: 0.40, wheelW: 0.22, wheelY: 0.50, xc: 1.28,
    wheelZs: [1.62, 0.66, -0.30, -1.26], trackW: 0.60, trackTh: 0.075,
    sprocket: { z: 2.42, y: 0.88, r: 0.30 }, idler: { z: -2.15, y: 0.90, r: 0.27 },
    topY: 1.18, botY: 0.045, arms: true, coveredTop: false, deadSag: 0.030,
    paintedEnds: true, padHex: 0x343a29, chainHex: 0x2b3122, tireHex: 0x3a4034, gearFloor: true,
  });
  // tail underside wedge from the raised idler to the stern
  P.add('hull', frustum(1.18, -2.45, -3.50, 1.20, -2.43, -3.52, 1.10, 1.24));

  P.decal('hull', 'number', P.spec.visual.number || '103B', 0.30, [1.60, 1.28, -0.6], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '103B', 0.30, [-1.60, 1.28, -0.6], -Math.PI / 2, 0, 0);
  P.topY = 1.42;
}

// ===========================================================================
// Strv 122 — Swedish Leopard 2A5-class (fresh geometry, leo grammar kinship)
// ===========================================================================
function buildStrv122(P) {
  const { box, cylX, cylY, cylZ, torus, polyMultiLoft, headlight, liftEye,
    periscope, towCable, spareTrackStrip, buildRunningGear } = KIT;

  // ---- hull ---------------------------------------------------------------
  // Real Leopard 2 proportions on the published 7.72 frame; the Tripo print
  // sets equipment stations only. Deck staircase 1.70 -> 1.825 aft, glacis
  // 1.665@+2.42 falling to the 1.25 beak at +3.90, belly 0.60.
  const TUB_W = 1.02;
  const SIDE_W = 1.638;
  loftBody(P, 'hull', [
    { z: -3.73, b: 0.92, t: 1.42, w: 0.96 },
    { z: -3.35, b: 0.62, t: 1.42, w: TUB_W },
    { z: 2.60, b: 0.60, t: 1.42, w: TUB_W },
    { z: 3.30, b: 0.78, t: 1.42, w: TUB_W },
    { z: 3.98, b: 0.98, t: 1.50, w: 0.98 },
  ]);
  // sponson body: full-width upper hull with the deck staircase
  loftBody(P, 'hull', [
    { z: -3.82, b: 1.42, t: 1.825, w: 1.00 },
    { z: -3.40, b: 1.42, t: 1.825, w: SIDE_W },
    { z: -2.51, b: 1.42, t: 1.825, w: SIDE_W },
    { z: -2.32, b: 1.42, t: 1.77, w: SIDE_W },
    { z: -1.16, b: 1.42, t: 1.765, w: SIDE_W },
    { z: -1.02, b: 1.42, t: 1.70, w: SIDE_W },
    { z: 1.95, b: 1.42, t: 1.685, w: SIDE_W },
    { z: 2.42, b: 1.42, t: 1.665, w: SIDE_W },
  ]);
  // glacis: two-plane Leo nose — upper sheet to the beak, lower return
  P.add('hull', slab(
    [-1.02, 1.42, 2.42], [1.02, 1.42, 2.42], [0.98, 1.16, 3.97], [-0.98, 1.16, 3.97],
    [-1.638, 1.665, 2.42], [1.638, 1.665, 2.42], [0.98, 1.32, 3.97], [-0.98, 1.32, 3.97]));
  P.add('hull', slab(
    [-1.02, 1.00, 3.90], [1.02, 1.00, 3.90], [1.02, 0.78, 3.30], [-1.02, 0.78, 3.30],
    [-1.00, 1.18, 3.925], [1.00, 1.18, 3.925], [1.02, 1.42, 3.30], [-1.02, 1.42, 3.30]));
  // splash board chevron on the glacis (Strv 122 cue)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.78, 0.020, 0.055), s * 0.40, 1.575, 2.92, -0.16, s * 0.38, 0);
  }
  // rear wall + tail lip
  P.add('hull', slab(
    [-1.02, 0.92, -3.73], [1.02, 0.92, -3.73], [1.02, 0.62, -3.35], [-1.02, 0.62, -3.35],
    [-1.02, 1.82, -3.82], [1.02, 1.82, -3.82], [1.04, 1.825, -3.40], [-1.04, 1.825, -3.40]));
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.30, 0.30, 0.05), s * 0.62, 1.30, -3.745);          // exhaust grilles
    for (let i = 0; i < 4; i++) {
      P.add('hullDetail', box(0.26, 0.022, 0.042), s * 0.62, 1.19 + i * 0.075, -3.77);
    }
  }
  // fenders + front mudguards
  segStrip(P, 'hull', -1.376, 1.640, -3.66, 2.38, 0.52, 0.030, 0.502);
  segStrip(P, 'hull', 1.376, 1.640, -3.66, 2.38, 0.52, 0.030, 0.502);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.52, 0.045, 0.92), s * 1.376, 1.575, 3.42, -0.12, 0, 0);
    P.add('hullRubber', box(0.075, 0.52, 0.028), s * 1.60, 0.98, 3.86);
    P.add('hullRubber', box(0.075, 0.55, 0.028), s * 1.60, 1.00, -3.79);
  }

  // ---- running gear: seven-wheel Leo course (family rig standard §H) ------
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.78, wheelR: 0.37, wheelW: 0.24, wheelY: 0.395, xc: 1.376,
    wheelZs: [2.70, 1.86, 1.02, 0.18, -0.66, -1.50, -2.34],
    sprocket: { z: -3.19, y: 1.09, r: 0.295 }, idler: { z: 3.48, y: 1.11, r: 0.25 },
    trackW: 0.64, trackTh: 0.085, topY: 0.97, botY: 0.055,
    coveredTop: true, arms: false, paintedEnds: true,
    padHex: 0x343a29, chainHex: 0x2b3122, tireHex: 0x3a4034, gearFloor: true,
  });

  // ---- Swedish heavy skirts with the wavy hem ------------------------
  // Front course: five deep panels at ±1.875 (the 3.75 width carrier),
  // scalloped hems (each panel's own bottom line — the "wavy" read).
  for (const s of [-1, 1]) {
    const hems = [0.58, 0.66, 0.60, 0.68, 0.62];
    for (let k = 0; k < 5; k++) {
      const z = 3.42 - k * 0.485;
      const hem = hems[k];
      P.add('hull', box(0.055, 1.36 - hem, 0.46), s * 1.8475, hem + (1.36 - hem) / 2, z);
      P.add('hullDark', box(0.014, 0.16, 0.40), s * 1.876, 1.30, z);
    }
    // rear course: shallower panels, slightly inset, wavy hems
    const rhems = [0.80, 0.88, 0.82, 0.90, 0.84, 0.90, 0.82];
    for (let k = 0; k < 7; k++) {
      const z = 0.86 - k * 0.62;
      const hem = rhems[k];
      P.add('hull', box(0.045, 1.36 - hem, 0.60), s * 1.842, hem + (1.36 - hem) / 2, z);
      P.add('hullDark', box(0.012, 0.14, 0.54), s * 1.866, 1.295, z);
    }
    // skirt hanger rail
    segStrip(P, 'hull', s * 1.80, 1.475, -3.20, 3.55, 0.045, 0.075, 0.61);
  }

  // ---- deck furniture ------------------------------------------------
  P.add('hullDark', box(1.30, 0.022, 0.85), 0, 1.836, -2.95);                  // rear intake grille
  for (let i = 0; i < 5; i++) P.add('hullDetail', box(1.22, 0.024, 0.05), 0, 1.85, -3.24 + i * 0.145);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.58, 0.020, 0.78), s * 1.05, 1.79, -2.20);          // fan wells
    P.add('hullDetail', torus(0.30, 0.020, 18), s * 0.78, 1.80, -2.68);
    P.add('hull', box(0.44, 0.10, 0.72), s * 1.30, 1.72, -1.35);               // sponson boxes
    P.add('hullDark', box(0.38, 0.016, 0.62), s * 1.30, 1.775, -1.35);
    headlight(P, s * 0.90, 1.50, 3.62, -0.2);
    P.add('hullDetail', box(0.18, 0.02, 0.14), s * 0.90, 1.545, 3.56, -0.25, 0, 0);
  }
  towCable(P, [[-0.92, 1.70, 1.9], [0, 1.685, 1.1], [0.92, 1.70, 1.9]]);
  periscope(P, 'hullDetail', -0.42, 1.70, 2.30); // driver station (left)
  P.add('hullDetail', box(0.46, 0.028, 0.42), -0.42, 1.695, 2.06);
  spareTrackStrip(P, 'hull', 0.55, 1.50, 3.30, 3, -0.16);
  liftEye(P, 'hullDetail', -1.30, 1.70, 2.95, -0.3); liftEye(P, 'hullDetail', 1.30, 1.70, 2.95, 0.3);

  // ---- turret: 2A5-class wedge with the Swedish roof armor ---------------
  // Ring (0, 1.70, -0.30); wedge apex +2.55 world, cheeks ±1.35, bustle to
  // -2.62 world with the basket rack behind (print stations).
  P.turretG.position.set(0, 1.70, -0.30);
  P.gunG.position.set(0, 0.33, 0.90);
  const PLAN = [
    [0.16, 2.85], [0.94, 1.30], [1.32, 0.35], [1.35, -0.85], [1.16, -2.32],
    [-1.16, -2.32], [-1.35, -0.85], [-1.32, 0.35], [-0.94, 1.30], [-0.16, 2.85],
  ];
  // wedge: tall rear shell, nose collapsing to the apex line
  const bot = (pt) => pt[1] > 1.2 ? 0.30 - (pt[1] - 1.2) * 0.10 : 0.02;
  P.add('turret', polyMultiLoft(PLAN, [
    { height: (pt) => bot(pt), inset: 1 },
    { height: (pt) => pt[1] > 1.2 ? 0.62 + (pt[1] - 1.2) * 0.06 : 0.58, inset: 1 },
    { height: (pt) => pt[1] > 1.2 ? 0.80 : 0.94, inset: (pt) => pt[1] > 1.2 ? 0.92 : 0.90 },
    { height: (pt) => pt[1] > 1.2 ? 0.86 : 1.02, inset: (pt) => pt[1] > 1.2 ? 0.72 : 0.74 },
  ]));
  // ring plinth (closes the wedge underside to the 1.70 deck)
  P.add('turret', cylY(1.02, 1.10, 0.16, P.q ? 26 : 14), 0, -0.06, -0.30);
  // Swedish roof armor fields: two raised plate arrays over the crew roof
  P.add('turret', box(1.74, 0.09, 1.30), 0, 0.99, -0.72);
  P.add('turretDark', box(1.62, 0.016, 1.18), 0, 1.043, -0.72);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.56, 0.09, 0.62), s * 0.64, 1.045, -0.42);
    P.add('turretDark', box(0.47, 0.015, 0.52), s * 0.64, 1.098, -0.42);
    P.add('turret', box(0.50, 0.08, 0.56), s * 0.60, 1.04, -1.28);
    P.add('turretDark', box(0.42, 0.014, 0.47), s * 0.60, 1.088, -1.28);
  }
  // Make the Swedish roof package read as an articulated armor system at
  // garage scale, rather than one dark, featureless slab.  The spine, cross
  // joints and fasteners all sit directly on the existing roof field and stay
  // inside its plan envelope; they do not create a second turret silhouette.
  P.add('turret', box(0.18, 0.065, 1.18), 0, 1.076, -0.74);
  P.add('turretDark', box(0.13, 0.014, 1.08), 0, 1.116, -0.74);
  for (const z of [-1.22, -0.76, -0.30]) {
    P.add('turretDark', box(1.54, 0.016, 0.035), 0, 1.110, z);
    for (const x of [-0.72, -0.24, 0.24, 0.72]) {
      P.add('turretDetail', cylY(0.022, 0.024, 0.020, 8), x, 1.126, z);
    }
  }
  // Low warning/observation pods on broad armored shoes.  Their shallow
  // housings deliberately remain below the PERI and MG skyline.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.070, 0.30), s * 1.02, 0.92, 0.18,
      -0.10, s * 0.16, 0);
    P.add('turretDark', box(0.22, 0.11, 0.024), s * 1.02, 0.95, 0.342,
      -0.10, s * 0.16, 0);
    P.add('turretGlass', box(0.12, 0.055, 0.018), s * 1.02, 0.95, 0.358,
      -0.10, s * 0.16, 0);
  }
  // bustle roof + rear rack complex: rails meet posts, posts return into the
  // backed bustle armor (connected — floaters law)
  P.add('turret', box(2.20, 0.30, 0.06), 0, 0.44, -2.345);
  for (const y of [0.24, 0.38, 0.52, 0.66]) {
    P.add('turretDetail', box(2.42, 0.026, 0.030), 0, y, -2.62);
  }
  for (let i = 0; i < 9; i++) {
    P.add('turretDetail', box(0.028, 0.46, 0.030), -1.13 + i * 0.2825, 0.45, -2.62);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.030, 0.40, 0.30), s * 1.21, 0.45, -2.47);
    P.add('turretDetail', box(0.22, 0.032, 0.032), s * 1.12, 0.26, -2.46);
    P.add('turretDetail', box(0.22, 0.032, 0.032), s * 1.12, 0.62, -2.46);
    // bustle side stowage
    P.add('turret', box(0.30, 0.42, 0.88), s * 1.24, 0.42, -1.75);
    P.add('turretDark', box(0.26, 0.018, 0.78), s * 1.24, 0.638, -1.75);
  }
  // commander panorama (PERI R17, left-rear) — the 3.02 height carrier
  P.add('turret', box(0.36, 0.08, 0.36), -0.55, 1.06, -1.02);
  P.add('turretDetail', cylY(0.115, 0.135, 0.24, 16), -0.55, 1.21, -1.02);
  P.add('turretGlass', box(0.17, 0.09, 0.022), -0.55, 1.24, -0.84);
  P.add('turretDark', cylY(0.125, 0.125, 0.032, 16), -0.55, 1.285, -1.02);
  // gunner's EMES housing (right roof, recessed block with the doors)
  P.add('turret', box(0.52, 0.16, 0.46), 0.62, 1.04, 0.10);
  P.add('turretDark', box(0.44, 0.024, 0.38), 0.62, 1.125, 0.10);
  P.add('turretGlass', box(0.30, 0.055, 0.020), 0.62, 1.06, 0.34);
  // hatches
  P.add('turretDark', torus(0.24, 0.013, 16), -0.42, 1.045, -0.35);
  P.add('turret', cylY(0.23, 0.23, 0.040, 16), -0.42, 1.038, -0.35);
  P.add('turretDark', torus(0.22, 0.012, 16), 0.52, 1.045, -0.72);
  P.add('turret', cylY(0.21, 0.21, 0.038, 16), 0.52, 1.038, -0.72);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.70,
    elev: 0.04, shield: false, ammo: true, ring: { r: 0.15, stubs: 3 }, seed: 12220,
  }), 0.50, 1.05, -0.35, [0, 0.05, 0]);
  // Galix banks: angled tube clusters on both rear side walls
  for (const s of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.042, len: 0.27,
      splay: s * 1.06, pitch: -0.42, arc: 0.60,
      slot: 'detail', seed: 12200 + (s > 0 ? 1 : 0),
    }), s * 1.28, 0.72, -1.30);
  }
  // mast pair on the bustle roof (thin whips — p95-safe column count)
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.036, 0.046, 0.07, 10), s * 0.95, 0.92, -2.05);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: s < 0 ? 0.78 : 0.62, r: 0.012,
      rake: -s * 0.05, seed: 12230 + (s > 0 ? 1 : 0),
    }), s * 0.95, 0.955, -2.05);
  }
  // crosswind mast (rear roof center)
  P.add('turretDetail', cylY(0.022, 0.028, 0.24, 8), 0, 1.14, -1.62);
  P.add('turretDark', cylY(0.040, 0.040, 0.045, 8), 0, 1.28, -1.62);
  liftEye(P, 'turretDetail', -1.30, 0.86, -0.10, -0.5);
  liftEye(P, 'turretDetail', 1.30, 0.86, -0.10, 0.5);

  // ---- L44 with thermal sleeve, MRS and the wedge mantlet ------------
  P.addGunExtra(slab(
    [-0.50, -0.34, 0.62], [0.50, -0.34, 0.62], [0.40, -0.30, 1.10], [-0.40, -0.30, 1.10],
    [-0.50, 0.34, 0.62], [0.50, 0.34, 0.62], [0.40, 0.30, 1.10], [-0.40, 0.30, 1.10]));
  P.addGunExtra(cylZ(0.20, 0.42, P.q ? 20 : 12, 0.165), 0, 0, 1.24);
  for (const s of [-1, 1]) P.addGunExtraDark(cylZ(0.036, 0.09, 10), s * 0.28, 0.08, 0.98);
  // tube: sleeve segments with dark cinch rings, MRS collar, plain muzzle.
  // Gun-local frame: world z = local + 0.60; muzzle local 5.51 -> world 6.11
  // = published overall 9.97 against the -3.86 tail.
  P.add('gun', cylZ(0.115, 1.00, P.q ? 22 : 12), 0, 0, 1.60);
  P.add('gun', cylZ(0.135, 1.30, P.q ? 22 : 12), 0, 0, 2.75);                  // sleeve 1
  P.add('gunDark', cylZ(0.140, 0.05, 12), 0, 0, 2.12);
  P.add('gun', cylZ(0.132, 1.10, P.q ? 22 : 12), 0, 0, 4.01);                  // sleeve 2
  P.add('gunDark', cylZ(0.137, 0.05, 12), 0, 0, 3.43);
  P.add('gunDark', cylZ(0.142, 0.06, 12), 0, 0, 4.59);
  P.add('gun', cylZ(0.118, 0.44, P.q ? 22 : 12), 0, 0, 4.83);                  // MRS collar zone
  P.add('gun', cylZ(0.108, 0.52, P.q ? 22 : 12), 0, 0, 5.32);
  muzzleBore(P, { z: 5.555, r: 0.092 });
  P.muzzleZ = 5.57;

  P.decal('turret', 'number', '122', 0.25, [-1.365, 0.40, -0.85], -Math.PI / 2);
  P.decal('turret', 'number', '122', 0.25, [1.365, 0.40, -0.85], Math.PI / 2);
  P.topY = 1.54;
}

export const SWEDEN_PROFILES = {
  strv103: { build: buildStrv103B },
  strv81: { build: buildStrv81 },
  strv122: { build: buildStrv122 },
};
