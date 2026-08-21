// Polish armored family — §5.248 GROUND-UP REBUILDS (owner order 2026-08-17:
// "completely new ones built from the ground up doing high quality visual
// AND exact geometric comparison with the 3d models... leclerc highest
// standards"). The previous module cloned complete donor hulls (buildK2 /
// buildT72B87Native / buildPT91M) and overlaid decoration packages; every
// builder below is a fresh §K measured-loft construction against its own
// §5.248 batch-B print (pl01_501st / t72m1_jaguar_manako / pt91a_manako),
// published dims sovereign. Donor GRAMMAR (russia-lane loftHull/dome/tube
// helpers, KIT fittings) is shared per §H family-rig law; donor GEOMETRY is
// not. Measured lines cite the poland-wave vertex workorders (round 1).
//
// The three GLBs remain fixed local visual/metric oracles only; runtime
// playables stay first-party procedural.

import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.js';
import { addVehicleGhillieSuit } from '../ghillieSuit.js';
import {
  loftHull, meshDomeCurved, ringSkin, tubeGun, ruBoot, ruSaddle, nsvt, mast,
  ruGlacisKit, ruDeck, ruSkirtBand, ruFlaps, rehookClone,
} from './russia.js';
import { buildT72B87Native } from './t72.js';

// ---------------------------------------------------------------------------
// Shared Polish fittings (fresh authorship — the old clone-package helpers
// are retired with the clones)
// ---------------------------------------------------------------------------

function mount(P, owner, fitting, x, y, z, rotation = null) {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

// ERAWA cassette course — the Polish ERA grammar (square shallow cassettes
// with visible rim + bolt, on a real carrier plate; never floating bricks).
// Face-proud <=55 mm; rows follow the carrier plane's own rake.
function erawaCourse(P, o) {
  const { box } = KIT;
  const bucket = o.bucket ?? 'hull';
  const dark = o.dark ?? (bucket.startsWith('hull') ? 'hullDark' : 'turretDark');
  const nx = o.cols, ny = o.rows;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      if (o.skip && o.skip(r, c)) continue;
      const u = (c - (nx - 1) / 2) * o.pitchU;
      const v = (r - (ny - 1) / 2) * o.pitchV;
      // local face frame: right = o.right, up = o.up, out = o.out
      const x = o.x + o.right[0] * u + o.up[0] * v;
      const y = o.y + o.right[1] * u + o.up[1] * v;
      const z = o.z + o.right[2] * u + o.up[2] * v;
      P.add(bucket, box(o.tileW, o.tileH, o.tileD), x, y, z,
        o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      if (o.seams !== false) {
        P.add(dark, box(o.tileW * 0.86, o.tileH * 0.86, 0.012),
          x + o.out[0] * (o.tileD * 0.5 + 0.004),
          y + o.out[1] * (o.tileD * 0.5 + 0.004),
          z + o.out[2] * (o.tileD * 0.5 + 0.004),
          o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      }
    }
  }
}

// Edge-on prism law (GEOMETRY-GATE station-slice visibility): long slab
// strips are subdivided so every ~0.52 m station slab contains real
// cross-section faces. lerp the two profile rows and emit <=maxLen pieces.
function segmentedStrip(P, bucket, row0, row1, emit, maxLen = 0.38) {
  const [z0] = row0, [z1] = row1;
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / maxLen));
  for (let k = 0; k < n; k++) {
    const a = row0.map((v, i) => v + ((row1[i] - v) * k) / n);
    const b = row0.map((v, i) => v + ((row1[i] - v) * (k + 1)) / n);
    emit(a, b);
  }
}

// §5.267 fix-round cupola: a REAL T-72-family commander/gunner station —
// ring, domed lid with hinge lug + grab rail, and a RADIAL periscope
// wreath around the ring wall (lateral pokes, not crown spikes — the
// heightM p95 budget stays untouched). lidTop caps the crown absolutely.
function polishCupola(P, o) {
  const { box, cylY, torus } = KIT;
  const r = o.r;
  P.add('turret', cylY(r, r + 0.02, o.ringH ?? 0.05, 16), o.x, o.y, o.z);
  P.add('turretDark', torus(r + 0.005, 0.012, 16), o.x, o.y + (o.ringH ?? 0.05) / 2 + 0.006, o.z);
  // domed lid: shallow lathe capped at lidTop
  const lidBase = o.y + (o.ringH ?? 0.05) / 2 + 0.008;
  const lidH = Math.max(0.012, (o.lidTop ?? (lidBase + 0.03)) - lidBase);
  P.add('turret', KIT.lathe(
    [[r * 0.94, 0], [r * 0.84, lidH * 0.55], [r * 0.48, lidH * 0.9], [0.02, lidH]], 16),
    o.x, lidBase, o.z);
  // hinge lug + grab rail stay BELOW the lid crown (r-fix receipt: a lug
  // at lidBase+0.02 read heightM 2.213 on pt91 and broke the dims-100 hold)
  P.add('turretDark', box(0.055, 0.020, 0.10), o.x + r * 0.86, o.y + (o.ringH ?? 0.05) / 2 - 0.002, o.z, 0, 0.3, 0);
  P.add('turretDetail', box(0.10, 0.014, 0.02), o.x - r * 0.55, lidBase + lidH * 0.35, o.z + r * 0.35, 0, -0.5, 0);
  // radial periscope wreath on the ring wall
  const n = o.periscopes ?? 4;
  for (let i = 0; i < n; i++) {
    const a = o.arc0 + (i / Math.max(1, n - 1)) * (o.arc1 - o.arc0);
    P.add('turretDark', box(0.055, 0.035, 0.045),
      o.x + Math.sin(a) * (r + 0.035), o.y + 0.012, o.z + Math.cos(a) * (r + 0.035), 0, a, 0);
  }
}

function polishWhips(P, list, seedBase) {
  list.forEach(([x, y, z, h, rake], i) => {
    P.add('turretDetail', KIT.cylY(0.030, 0.040, 0.055, 10), x, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h, r: 0.011, rake, seed: seedBase + i,
    }), x, y + 0.028, z);
  });
}

// ===========================================================================
// T-72M1 JAGUAR — Polish modernized T-72M1.
// Print: t72m1_jaguar_manako.glb (FUSED, whole-view instrument only,
// yawOffset -90 resolved this round). Gate scope: whole curves + dims +
// floaters (componentMasks:false).
// Measured frame (poland-wave workorder r1, absolute): rear extreme -3.29,
// deck plateau 1.46-1.48 over z -2.66..-1.70, turret bustle 1.98 z
// -1.6..-1.07, dome band 2.43-2.51 z -0.33..+1.05 (PRINT-TALL vs published
// heightM 2.23 — capped, normalize plan reported), MG spike 2.78 @ -0.86,
// glacis-over-tube line 1.75-1.77 falling to nose 0.85-0.90 @ 3.60-3.70,
// plan: hull edge ±1.73, fender front corners 3.69 @ |x| 1.02..1.73, center
// nose 3.32-3.48, rear plate -3.27, right-flank snorkel sliver x 1.86
// z -1.31..-2.02, tube ±0.145 to muzzle 6.13-6.24, evacuator bulge to 4.83.
// Published dims sovereign: hull 6.86, overall 9.53 (rear -3.29 -> muzzle
// 6.24), width 3.59 (skirt faces ±1.795), height 2.23 (p95 roof; dome crown
// 2.25 + <=4 spike columns).
// ===========================================================================

function buildT72M1JaguarLegacy(P) {
  const { box, cylY, cylZ, torus, buildRunningGear } = KIT;

  // ---- hull loft to the measured whole-silhouette lines -------------------
  loftHull(P, {
    // rear fall 1.46 -> 0.96 over -2.66..-3.24 (ref side -3.08 reads
    // 1.35..0.79, -3.19 reads 1.22); deck plateau 1.46-1.48; glacis line
    // under the printed tube: fold at z 1.30 falling to the 0.88 nose tip.
    deck: [[-3.26, 0.96], [-3.10, 1.30], [-2.94, 1.42], [-2.70, 1.46],
      [-2.30, 1.475], [-1.95, 1.475], [-1.70, 1.46], [0.60, 1.44],
      [1.30, 1.40], [2.10, 1.19], [2.90, 0.99], [3.66, 0.87]],
    belly: [[-3.26, 0.80], [-3.02, 0.56], [-2.58, 0.43], [2.30, 0.43],
      [2.95, 0.55], [3.40, 0.68], [3.66, 0.80]],
    // full-width sponson band; nose narrows to the center glacis V (plan
    // center 3.32-3.48, outer 3.69 carried by the fender corners below)
    wUp: [[-3.26, 1.62], [2.55, 1.62], [3.20, 1.30], [3.66, 0.94]],
    wLo: [[-3.26, 0.97], [2.48, 0.97], [3.66, 0.80]],
    sponsonY: 1.14,
  });

  // fender shelves + bow corner boxes carry the plan's 3.69 outer front
  // corners (|x| 1.02..1.73) ahead of the narrowing center glacis
  for (const s of [-1, 1]) {
    P.add('hull', box(0.16, 0.05, 5.9), s * 1.70, 1.22, 0.45);
    P.add('hull', box(0.70, 0.14, 0.55), s * 1.42, 1.10, 3.38);   // corner box f 3.655
    P.add('hull', box(0.70, 0.10, 0.06), s * 1.42, 1.06, 3.685);  // fender lip f 3.715? no: face 3.715 too far — keep 3.685+0.03
    P.add('hullRubber', box(0.62, 0.16, 0.04), s * 1.40, 0.92, 3.70); // mud flap
    P.add('hullDark', box(0.03, 0.05, 0.48), s * 1.775, 1.245, 3.35); // guard rail
    // fender-slot §B2 floors: REAL dark slot plates (the v2 hole scan hides
    // /shadow/ meshes — per-harness law receipt this round), both proven
    // outside the swept course by the strict clip audit (wrap+shoes end
    // ~2.97; plates at z >=3.00 / inboard of the 1.09 course wall).
    P.add('hullDark', box(0.64, 0.01, 0.76), s * 1.30, 1.06, 3.26);
    P.add('hullDark', box(0.16, 0.01, 0.32), s * 0.99, 1.10, 2.76);
    // §5.267 fix 3: seat the bow corner boxes — the webs live INSIDE the
    // box/slot-floor union (r-fix receipt: deep webs at y 0.91 printed
    // -0.28 bottoms on three bow side columns and cost whole 0.3)
    P.add('hull', box(0.10, 0.09, 0.30), s * 1.30, 1.055, 3.30);
    P.add('hull', box(0.08, 0.10, 0.05), s * 1.40, 1.03, 3.665);
    P.add('hullDetail', box(0.55, 0.025, 0.05), s * 1.42, 1.125, 3.665); // flap hinge strip
  }

  // ---- running gear: T-72 family stance (six dished pairs) ---------------
  const wheelZs = [-2.01, -1.19, -0.37, 0.45, 1.27, 2.09];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.455, wheelW: 0.23, wheelY: 0.47, xc: 1.37,
    dishR: 0.79, wheelZs,
    sprocket: { z: -2.36, y: 0.68, r: 0.32 },
    idler: { z: 2.46, y: 0.69, r: 0.30 },
    contactZF: 2.20, contactZR: -2.08,
    rollers: [-1.35, -0.15, 1.10].map((z) => ({ z, y: 0.91, r: 0.082 })),
    trackW: 0.56, topY: 1.00, botY: 0.025, paintedEnds: true,
    coveredTop: true, arms: true,
    // §5.267 fix 2 (§5.262 gearFloor/tireHex law): exposed gear gets the
    // re-hooked tire/dish clones so the six dished pairs read crisply
    // instead of ambient-dead discs
    tireHex: 0x2e302a, wheelHex: 0x49503f, gearFloor: true,
  });
  // The smart running-gear builder above owns the complete dished wheel
  // train.  Do not add a second static face course here: it cannot follow the
  // suspension and previously produced the same doubled-wheel artifact seen
  // on older Abrams/Leopard builds.

  // ---- skirts: WIDTH ANCHOR ±1.795 (published 3.59) -----------------------
  // §5.267 fix 2 (buried-gear class): the band rides fender-hung like the
  // print — bottom raised 0.72 -> 1.00 so the six dished pairs read; the
  // lower 0.09 renders as the dark rubber hem band. Mask-neutral: the side
  // silhouette bottom in this z-span is the track ground run.
  ruSkirtBand(P, {
    x: 1.775, th: 0.04, z0: -1.95, z1: 2.35, yTop: 1.26, yBot: 0.80,
    panels: 7, dressIn: 0.03, rubberBotH: 0.12, lipY: 0.785,
  });
  // fender support brackets close the rail's daylight onto the sponson wall
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
    P.add('hullDetail', box(0.055, 0.10, 0.06), s * 1.70, 1.15, -2.30 + k * 0.87);
  }

  // ---- bow furniture -------------------------------------------------------
  // §5.267 fix 5: guarded headlight pods replace the flat bucket lamps
  ruGlacisKit(P, { w: 3.30, y: 1.16, z: 2.62, eyeX: 0.95, eyeZ: 2.92,
    eyeSplit: true, hookY: 0.90, hookZ: 3.05, lights: false });
  for (const s of [-1, 1]) {
    // (r-fix receipt: pods proud of the glacis at y 1.20 cost the FRONT
    // registered mask 0.28 — tucked onto the plate line they stay guarded
    // pods for the eye and mask-interior for the gate)
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.085, r: 0.038,
      shield: true, seed: 7351 + (s > 0 ? 1 : 0),
    }), s * 1.13, 1.13, 2.56, [-0.30, 0, 0]);
  }
  P.add('hull', box(2.20, 0.045, 0.15), 0, 1.31, 2.42, -0.30, 0, 0); // splash ridge
  ruDeck(P, { deckY: 1.44, hatchX: -0.42, hatchZ: 1.78, gz: -1.55,
    grilles: 4, gw: 1.46, periY: 1.42, gY: 1.465 });
  // §5.267 fix 4: REAL louvre relief on the powerpack deck — sunk dark
  // wells + raised rib bars + end cheeks (relief tops +0.012 over the
  // deck line: sub-pixel for the side masks, real shadow for the eye)
  for (let k = 0; k < 5; k++) {
    const z = -1.62 - k * 0.20;
    P.add('hullDark', box(1.44, 0.016, 0.13), 0, 1.462, z);
    P.add('hullDetail', box(1.48, 0.018, 0.035), 0, 1.468, z + 0.085);
  }
  for (const s of [-1, 1]) P.add('hull', box(0.06, 0.020, 1.10), s * 0.76, 1.462, -2.02);
  // transverse exhaust louvre stack on the left sponson (T-72 tell)
  P.add('hullDark', box(0.10, 0.06, 0.62), -1.60, 1.30, -1.62);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.115, 0.014, 0.10),
    -1.60, 1.315, -1.40 - k * 0.15);

  // Jaguar ERA arrangement: low-profile ERAWA-1 glacis field on the plate's
  // own rake (proud <=55 mm — inside the printed tube-over-glacis line)
  erawaCourse(P, {
    x: 0, y: 1.245, z: 2.16, right: [1, 0, 0], up: [0, 0.242, -0.970],
    out: [0, 0.970, 0.242], cols: 8, rows: 3, pitchU: 0.315, pitchV: 0.30,
    tileW: 0.29, tileH: 0.27, tileD: 0.055, rx: -1.325,
    skip: (r, c) => r === 2 && (c === 3 || c === 4),
  });

  // ---- rear: plate furniture + unditching log (rear extreme -3.29) --------
  P.add('hullDark', box(1.90, 0.30, 0.05), 0, 1.13, -3.245);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.84, 0.03, 0.03),
    0, 1.02 + k * 0.10, -3.25);
  // §5.267 fix 5: r1 log silhouette RESTORED (the r-fix 0.10 shrink cost
  // rear-view overlap vs the print's own fat log line) — the round read
  // comes from end discs + strap blocks + the hub boss, not from moving
  // the certified -3.29 rear extreme
  mount(P, 'hull', FITTINGS.unditchingLog({
    // §5.267 plank-read receipt: the stock wood slot renders pale tan on
    // this scheme — the log body takes a re-hooked olive-timber clone
    mats: { ...P.mats, wood: rehookClone(P.mats.wood, 0x4a4636, 0x0a0906) },
    len: 2.30, r: 0.125, straps: 3, seed: 7301,
  }), 0, 0.95, -3.165);
  for (const s of [-1, 1]) {
    P.add('hullDetail', KIT.cylZ(0.105, 0.02, 14), s * 1.16, 0.95, -3.165);
    P.add('hullDark', box(0.04, 0.10, 0.05), s * 0.90, 0.93, -3.20);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.16, 0.09, 0.05), s * 1.15, 1.36, -3.24);
    P.add('hullDetail', box(0.09, 0.05, 0.04), s * 0.62, 1.30, -3.245);
  }
  // right-flank deep-wading snorkel (the print's x 1.86 z -1.31..-2.02
  // sliver): stowed tube on the right sponson shoulder
  P.add('hullDetail', cylZ(0.075, 0.70, 12), 1.685, 1.36, -1.66);
  P.add('hullDark', cylZ(0.079, 0.03, 12), 1.685, 1.36, -1.34);
  P.add('hullDark', box(0.05, 0.06, 0.04), 1.66, 1.28, -1.52);

  // ---- turret: measured cast dome (crown pinned to the published-height
  // band 2.25; the print's 2.43-2.51 dome band is certified print-tall) ----
  const rings = [
    [1.24, 0.045], [1.28, 0.16], [1.22, 0.42], [1.06, 0.60],
    [0.80, 0.74], [0.44, 0.83], [0.03, 0.85],
  ];
  // §5.267 fix 1: roofTiltScale flattens the crown shading (t72b3m r20
  // device — silhouette bytes identical) so the dome stops reading as an
  // oversized smooth ball
  meshDomeCurved(P, rings, 0.96, 0, -0.06, { capR: 1.9, roofTiltScale: 0.55 });
  // cast-texture cues (§5.267 fix 1, all <=6 mm proud — mask-neutral):
  // casting seam band at the dome waist + lifting bosses + cheek weld beads
  P.add('turretDark', KIT.lathe([[1.215, 0.395], [1.228, 0.415], [1.215, 0.435]], 30, 0.96), 0, 0, -0.06);
  for (const [bx, bz] of [[-0.62, 0.30], [0.66, 0.24], [0.02, -0.72]]) {
    P.add('turretDetail', cylY(0.055, 0.06, 0.028, 10), bx, 0.775, bz);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.012, 0.02, 0.62), s * 1.06, 0.52, 0.30, 0, s * 0.42, -0.10);
    P.add('turretDark', box(0.012, 0.02, 0.50), s * 1.21, 0.30, -0.55, 0, s * 0.12, 0);
  }
  // bustle: the print's 1.98 band over z -1.6..-1.07 (turret-local -1.58..-1.05)
  P.add('turret', box(1.46, 0.42, 0.56), 0, 0.37, -1.28);
  P.add('turret', box(1.10, 0.34, 0.24), 0, 0.33, -1.62, 0.10, 0, 0);
  P.add('turretDark', box(1.36, 0.30, 0.035), 0, 0.34, -1.575);
  for (const s2 of [-0.42, 0.08, 0.52]) P.add('turretDark', box(0.03, 0.36, 0.56), s2, 0.37, -1.282); // lid straps
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.32, h: 0.16, fill: 0.40, rails: 2, seed: 7311,
  }), 0, 0.50, -1.30);

  // ERAWA-2 wedge cheeks (Jaguar's "new ERA arrangement" — the front tells)
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.24, 0.10, 1.22], [s * 1.02, 0.10, 0.84], [s * 1.14, 0.12, 0.30], [s * 0.30, 0.12, 0.55],
      [s * 0.22, 0.56, 1.02], [s * 0.94, 0.52, 0.70], [s * 1.06, 0.50, 0.24], [s * 0.28, 0.54, 0.44]));
    erawaCourse(P, {
      bucket: 'turret',
      x: s * 0.66, y: 0.33, z: 0.86, right: [s * 0.42, 0, -0.62],
      up: [0, 1, 0], out: [s * 0.72, 0.28, 0.55],
      cols: 3, rows: 2, pitchU: 0.30, pitchV: 0.235,
      tileW: 0.26, tileH: 0.215, tileD: 0.05,
      ry: s * 0.60, rx: -0.16,
    });
    // Conformal ERAWA flank course: the blocks follow the cast side instead
    // of hovering beyond it, and give the Jaguar the layered armor read that
    // was being lost at normal garage distance.
    for (let i = 0; i < 4; i++) {
      const z = 0.18 - i * 0.36;
      const x = 1.17 - i * 0.025;
      P.add('turret', box(0.075, 0.235, 0.30), s * x, 0.39, z,
        -0.10, s * (0.10 + i * 0.035), 0);
      P.add('turretDark', box(0.018, 0.16, 0.24), s * (x + 0.041), 0.40, z,
        -0.10, s * (0.10 + i * 0.035), 0);
    }
  }

  // roof: REAL cupolas (§5.267 fix 1 — lids + hinge + radial periscope
  // wreaths; crowns capped at 2.255 world so heightM's p95 stays inside
  // the dims budget: lid columns read ~0.005 over the 2.25 crown only)
  polishCupola(P, { x: -0.38, y: 0.812, z: -0.42, r: 0.30, ringH: 0.05,
    lidTop: 0.846, periscopes: 5, arc0: -0.7, arc1: 2.2 });
  polishCupola(P, { x: 0.44, y: 0.812, z: -0.35, r: 0.25, ringH: 0.04,
    lidTop: 0.840, periscopes: 3, arc0: 2.6, arc1: 4.4 });
  // PCO KLW-1 Asteria thermal sight (the Jaguar tell): hooded box with a
  // real brow, side cheeks and lens ring (§5.267 fix 5)
  P.add('turretDetail', box(0.34, 0.24, 0.33), -0.50, 0.70, 0.28);
  P.add('turretDetail', box(0.38, 0.045, 0.14), -0.50, 0.835, 0.38);   // hood brow
  for (const s of [-1, 1]) P.add('turretDetail', box(0.035, 0.20, 0.30), -0.50 + s * 0.20, 0.70, 0.26);
  P.add('turretDark', box(0.26, 0.14, 0.03), -0.50, 0.72, 0.455);
  P.add('turretDark', KIT.cylZ(0.075, 0.02, 14), -0.42, 0.72, 0.468, 0, 0, 0);
  P.add('turretGlass', box(0.16, 0.08, 0.02), -0.52, 0.72, 0.472);
  // Shallow roof armor/service panels and periscope cadence.  These remain
  // under the certified crown but break up the formerly empty dome top.
  for (const [x, z, rz] of [[0.12, -0.06, -0.10], [0.20, -0.55, 0.08], [-0.05, -0.92, -0.06]]) {
    P.add('turret', box(0.34, 0.035, 0.28), x, 0.815, z, 0, 0, rz);
    P.add('turretDark', box(0.27, 0.012, 0.035), x, 0.839, z + 0.08, 0, 0, rz);
  }
  // (§5.290 dims-recovery: the crown cadence sat at skin 0.834 where any
  // seat under the p95 budget reads flush — the rhythm re-seats down the
  // forward dome slope, blocks fully proud with bottoms on the local skin,
  // tops <= 2.24 world = under the crown tier the p95 now reads)
  for (const [x, y, z, yaw] of [[0.10, 0.783, 0.70, -0.10], [0.52, 0.8015, 0.40, 0.08], [0.72, 0.791, 0.10, 0.18]]) {
    KIT.periscope(P, 'turretDetail', x, y, z, yaw);
  }
  // Protected commander panorama and Luna-style cheek searchlight.  Both
  // have broad armor shoes and visible lens backs, so neither reads as a
  // loose box pushed into the casting.
  // (§5.290 dims-recovery: head mount sunk 0.84 -> 0.75 — its four side
  // columns read 2.33 and owned heightM's p95; at 0.75 the head still rises
  // 6.4 cm proud of the shoe and the lens/glass faces stay exposed, while
  // the p95 hands back to the dome crown tier 2.2594 = the pre-owner read)
  P.add('turret', box(0.38, 0.055, 0.38), 0.44, 0.755, -0.72);
  P.add('turret', box(0.30, 0.18, 0.30), 0.44, 0.75, -0.72, -0.04, 0.05, 0);
  P.add('turretDark', box(0.22, 0.12, 0.026), 0.44, 0.76, -0.553, -0.04, 0.05, 0);
  P.add('turretGlass', box(0.15, 0.075, 0.018), 0.44, 0.76, -0.537, -0.04, 0.05, 0);
  P.add('turret', box(0.36, 0.11, 0.24), 0.68, 0.55, 0.62, -0.12, 0.18, 0);
  P.add('turretDark', cylZ(0.145, 0.15, 18), 0.68, 0.58, 0.73);
  P.add('turretGlass', cylZ(0.112, 0.018, 18), 0.68, 0.58, 0.817);
  // Two paired roof cassettes continue the ERAWA field over the gun shoulders
  // while leaving the sight and both crew stations unobstructed.
  // (§5.290 dims-recovery receipt: a +0.07 re-seat that surfaced these from
  // the dome casting measured whole 90.9 -> 90.8 — the print carries no mass
  // over the gun shoulders — so the owner's seats stand exactly as landed)
  for (const s of [-1, 1]) for (let row = 0; row < 2; row++) {
    P.add('turret', box(0.25, 0.060, 0.25), s * 0.20, 0.735 - row * 0.035,
      0.48 - row * 0.29, -0.12 - row * 0.05, s * 0.06, 0);
    P.add('turretDark', box(0.19, 0.012, 0.035), s * 0.20, 0.773 - row * 0.035,
      0.55 - row * 0.29, -0.12 - row * 0.05, s * 0.06, 0);
  }
  // commander day/thermal head, low profile (within dome band)
  P.add('turretDetail', box(0.24, 0.14, 0.22), -0.38, 0.76, -0.26);
  P.add('turretDark', box(0.18, 0.08, 0.025), -0.38, 0.77, -0.145);

  // RCWS (Jaguar package, §5.267 fix 5): pedestal + receiver mass + the
  // MG on top — still low-slung on the dome shoulder (pt91m height-law
  // precedent; receiver top ~2.25 = the crown line)
  P.add('turretDark', cylY(0.11, 0.14, 0.10, 12), -0.85, 0.50, -0.80);
  P.add('turretDetail', box(0.20, 0.11, 0.30), -0.85, 0.60, -0.80);   // cradle/receiver base
  P.add('turretDark', box(0.06, 0.05, 0.34), -0.85, 0.665, -0.72);    // gun trough
  // steeper stow (r-fix receipt: scale 0.72 at elev 0.18 spanned 5 side
  // columns at ~2.3 and read heightM 2.27 — the mass stays, the barrel
  // rides up so the station keeps <=3 columns)
  const jaguarWkm = FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.62, elev: 0.35,
    ammo: true, seed: 7321,
  });
  jaguarWkm.name = 'jaguar_wkm_b';
  mount(P, 'turret', jaguarWkm, -0.85, 0.60, -0.80, [0, 0.10, 0]);

  // smoke banks: 902A Tucha clusters (§5.267: re-seated proud of the dome
  // skin so the tubes READ — the r1 seats sank into the casting)
  // (r-fix receipt: proud smoke re-seats cost side-mask overlap the fused
  // metric prices — the banks hold the r1 seats; the visible-read work
  // lives in the mount rails' dark line + the family camo contrast)
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.20, 0.035, 0.07), s * 0.96, 0.435, 0.58, 0, s * 0.55, 0); // mount rail
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 5, r: 0.040, len: 0.27, splay: s * 1.00,
      pitch: -0.40, arc: 0.55, spacing: 0.095, slot: 'detail',
      rotation: [0, 0, -s * 0.08], seed: 7331 + (s > 0 ? 1 : 0),
    }), s * 0.98, 0.44, 0.62);
  }
  // low antenna stubs on the bustle shoulders (tops held under the crown —
  // the §C whip-rough coupling law: no mast may re-enter the p95 population)
  polishWhips(P, [[-0.92, 0.60, -1.10, 0.22, -0.05], [0.96, 0.60, -1.02, 0.19, 0.06]], 7341);

  // ---- gun: sleeved 2A46M with evacuator + measured muzzle ----------------
  // axis world 1.64 (pivot 1.40 + 0.24); tube local z to 5.74 (muzzle world
  // 6.24 = rear extreme -3.29 + published overall 9.53)
  // §5.267 fix 1: REAL mantlet mass at the root — sealed trunnion saddle
  // roll + flanking mantlet cheeks behind the canvas boot (the r1 bare
  // cone was the critic's dominant family-read defect)
  // (r-fix receipt: the first saddle/cheek pass sat at gun-local z 0-0.2 =
  // INSIDE the dome shell — invisible; the dome face is at world ~1.15, so
  // the visible mantlet block lives at local 0.62..0.95)
  ruSaddle(P, { rollR: 0.235, rollW: 0.90, tubeR: 0.125, rootR: 0.155, rootL: 0.52 });
  P.addGunExtra(box(0.46, 0.42, 0.30), 0, -0.01, 0.80);            // mantlet block at the dome face
  for (const s of [-1, 1]) {
    P.addGunExtra(box(0.13, 0.34, 0.24), s * 0.29, -0.02, 0.76);   // mantlet cheeks
    P.addGunExtraDark(box(0.025, 0.26, 0.02), s * 0.355, -0.02, 0.80);
  }
  P.addGunExtra(box(0.60, 0.13, 0.22), 0, -0.24, 0.74);            // chin plate
  ruBoot(P, { pts: [[0.30, 0.62, 0.52, 0.00], [0.62, 0.46, 0.40, 0.01], [0.95, 0.32, 0.30, 0.015]] });
  tubeGun(P, [
    [0.95, 2.45, 0.120, 0.116],
    [2.45, 3.85, 0.116, 0.112],
    [3.85, 4.35, 0.112, 0.110],          // sleeve stage
    // bore evacuator (plan bulge to 4.83) — §D razor-band law: dia 0.28
    // stays under the 12% body filter so hullLengthM cannot read the tube
    // as body (r1 printed 8.55 with the 0.34 evacuator)
    [4.35, 4.82, 0.140, 0.135],
    [4.82, 5.62, 0.108, 0.104],
    [5.62, 5.74, 0.112, 0.112],          // muzzle collar
  ], { rings: [[2.45, 0.122], [3.85, 0.116], [4.35, 0.144], [4.82, 0.112]], muzzle: 5.74 });
  muzzleBore(P, { r: 0.098, boreR: 0.062 });
  P.addGunExtraDark(cylZ(0.032, 0.10, 10), 0.30, 0.10, 0.55); // coax port
  P.decal('hull', 'number', 'PL-721', 0.26, [-1.797, 1.02, 0.90], -Math.PI / 2);
  P.decal('hull', 'number', 'PL-721', 0.26, [1.797, 1.02, 0.90], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.30);
}

// Current production Jaguar.  The Polish modernization shares the certified
// T-72 six-wheel chassis, track course, cast turret and 2A46 articulation with
// the live Russian T-72 family.  Everything that makes it a Jaguar remains a
// first-party Polish overlay: shallow camouflaged ERAWA, Drawa/Obra optics,
// smoke banks, WKM-B, bustle services and external stowage.  The legacy
// measured build above remains only as an authoring receipt while the fleet
// migrates; it is deliberately not registered as playable geometry.
function buildT72M1JaguarCurrentPrototype(P) {
  const { box, cylY, cylZ, torus } = KIT;
  buildT72B87Native(P, 'jaguar');

  P.hullG.userData.t72FamilyFoundation = 'current-t72b87';
  P.turretG.userData.polishModernization = 't72m1-jaguar-erawa';

  // ERAWA-1 glacis: a buried camouflaged carrier and three staggered courses
  // follow the upper-glacis rake.  These are shallow armor cassettes, not gray
  // spare-track blocks and not cubes floating above the plate.
  P.add('hull', box(2.54, 0.050, 0.94), 0, 1.245, 1.95, -0.30, 0, 0);
  for (let row = 0; row < 3; row++) {
    const z = 1.68 + row * 0.30;
    const y = 1.305 - row * 0.060;
    for (let col = -4; col <= 4; col++) {
      if (row === 2 && Math.abs(col) === 4) continue;
      const x = col * 0.286 + (row === 1 ? 0.035 : row === 2 ? -0.028 : 0);
      P.add('hull', box(0.267, 0.090, 0.270), x, y, z, -0.30, 0, 0);
      P.add('hullDark', box(0.222, 0.012, 0.020), x, y + 0.050, z + 0.122, -0.30, 0, 0);
    }
  }

  // Full-length ERAWA side courses sit flush on the existing current-T-72
  // skirts.  Their back faces overlap the panels by 12 mm, guaranteeing a
  // visible armor-to-fender load path while preserving the single track run.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = -2.02 + i * 0.67;
      const h = 0.255 + (i % 3) * 0.012;
      P.add('hull', box(0.078, h, 0.585), s * 1.792, 1.075 + (i % 2) * 0.010, z,
        0, 0, s * ((i % 3) - 1) * 0.010);
      P.add('hullDark', box(0.014, h * 0.72, 0.505), s * 1.838,
        1.075 + (i % 2) * 0.010, z);
      P.add('hullDetail', box(0.016, 0.022, 0.48), s * 1.842,
        1.075 + h * 0.48, z);
    }
    // Polish fender returns and rubber terminals are seated on the shelves.
    P.add('hull', box(0.18, 0.075, 0.74), s * 1.69, 1.205, 2.52, -0.05, 0, 0);
    P.add('hullRubber', box(0.42, 0.30, 0.035), s * 1.49, 1.02, 2.82, -0.12, 0, 0);
    P.add('hullDark', box(0.05, 0.13, 0.46), s * 1.64, 1.16, 2.57, -0.08, 0, 0);
  }

  // Two connected ERAWA cheek carriers conform to the current cast turret.
  // Rows taper inward around the mantlet, producing the Jaguar's compact
  // chevron rather than the old oversized dome or a Russian Kontakt necklace.
  for (const s of [-1, 1]) {
    P.add('turretDark', orientedSlab(
      [s * 0.10, 0.02, 1.10], [s * 0.78, 0.02, 0.98], [s * 1.38, 0.02, 0.45], [s * 0.74, 0.02, 0.38],
      [s * 0.11, 0.10, 1.07], [s * 0.75, 0.10, 0.95], [s * 1.33, 0.10, 0.44], [s * 0.72, 0.10, 0.37]));
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = s * (0.20 + i * 0.245 + row * 0.014);
      const z = 1.06 - i * 0.118 - row * 0.135 + (i % 2 ? 0.012 : -0.008);
      const y = 0.075 + row * 0.120 + i * 0.012;
      const yaw = s * (0.31 + i * 0.075 + row * 0.018);
      const w = 0.225 - i * 0.006 + (row === 1 ? 0.010 : 0);
      P.add('turret', box(w, 0.096 + (i % 2) * 0.010, 0.225), x, y, z,
        -0.11, yaw, s * ((i % 3) - 1) * 0.012);
      P.add('turretDark', box(w * 0.78, 0.012, 0.020), x, y + 0.057, z + 0.102,
        -0.11, yaw, 0);
    }
    for (let i = 0; i < 5; i++) {
      const z = 0.20 - i * 0.245;
      P.add('turret', box(0.205, 0.135, 0.250), s * (1.25 - i * 0.045),
        0.19 - i * 0.010, z, -0.05, s * (0.63 + i * 0.12), 0);
    }
  }

  // Drawa-T fire-control optics and Obra laser-warning heads remain low on
  // broad shoes so no sensor or decoration hovers above the casting.
  P.add('turret', box(0.38, 0.055, 0.34), -0.54, 0.565, 0.32, -0.06, 0, 0);
  P.add('turret', box(0.28, 0.175, 0.27), -0.54, 0.645, 0.34, -0.04, 0, 0);
  P.add('turretDark', box(0.225, 0.105, 0.025), -0.54, 0.660, 0.486, -0.04, 0, 0);
  P.add('turretGlass', box(0.145, 0.075, 0.014), -0.50, 0.666, 0.501, -0.04, 0, 0);
  P.add('turret', cylY(0.31, 0.33, 0.060, 18), 0.48, 0.635, -0.10);
  P.add('turretDark', torus(0.255, 0.016, 18), 0.48, 0.672, -0.10);
  P.add('turret', box(0.20, 0.145, 0.21), 0.75, 0.535, 0.08, 0, -0.08, 0);
  P.add('turretGlass', box(0.145, 0.070, 0.020), 0.75, 0.55, 0.196, 0, -0.08, 0);
  for (const [x, y, z, ry] of [
    [-1.17, 0.39, 0.34, -0.48], [1.17, 0.39, 0.34, 0.48],
    [-0.86, 0.42, -0.80, -2.60], [0.86, 0.42, -0.80, 2.60],
  ]) {
    P.add('turret', box(0.14, 0.095, 0.12), x, y, z, 0, ry, 0);
    P.add('turretGlass', box(0.085, 0.050, 0.018), x + Math.sin(ry) * 0.068,
      y, z + Math.cos(ry) * 0.068, 0, ry, 0);
  }

  // Polish smoke banks: four launchers per connected armored shoe, clear of
  // the ERAWA cassettes and attached to the traversing turret hierarchy.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.34, 0.075, 0.30), s * 1.00, 0.30, 0.49, 0, s * -0.52, 0);
    for (let i = 0; i < 4; i++) {
      P.add('turretDark', cylZ(0.045, 0.235, 10), s * (0.86 + i * 0.078),
        0.35 + (i % 2) * 0.028, 0.72 - i * 0.080, -0.42, s * -(0.24 + i * 0.09), 0);
    }
  }

  // Open rear basket, snorkel and unequal service cells return directly into
  // the cast rear; all equipment traverses with the turret.
  P.add('turretDark', box(1.72, 0.045, 0.045), 0, 0.49, -1.46);
  P.add('turretDark', box(1.72, 0.045, 0.045), 0, 0.25, -1.45);
  for (const x of [-0.82, -0.42, 0, 0.46, 0.82]) {
    P.add('turretDark', box(0.038, 0.25, 0.34), x, 0.37, -1.30, 0.18, 0, 0);
  }
  for (const [x, w, h] of [[-0.54, 0.42, 0.19], [-0.08, 0.34, 0.23], [0.42, 0.46, 0.17]]) {
    P.add('turret', box(w, h, 0.28), x, 0.25 + h / 2, -1.18, 0, x * 0.08, 0);
    P.add('turretDark', box(w - 0.045, 0.018, 0.22), x, 0.26 + h, -1.18, 0, x * 0.08, 0);
  }
  P.add('turret', cylZ(0.105, 0.82, 16), 0.72, 0.34, -1.23, Math.PI / 2, 0, 0);
  P.add('turretDark', torus(0.108, 0.014, 16), 0.72, 0.34, -1.66, Math.PI / 2, 0, 0);

  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'dark', elev: -0.03, ammo: true });
  mg.scale.setScalar(0.78);
  mg.position.set(-0.55, 0.68, -0.18);
  mg.name = 'jaguar_wkm_b';
  P.turretG.add(mg);
  polishWhips(P, [[-0.90, 0.58, -0.56, 0.76, -0.02], [0.88, 0.58, -0.58, 0.64, 0.03]], 7210);

  // A connected, angular Polish mantlet skin closes the gun-root valley.
  for (const s of [-1, 1]) {
    P.addGunExtra(box(0.16, 0.28, 0.42), s * 0.26, -0.02, 0.02, 0, s * 0.10, 0);
    P.addGunExtraDark(box(0.022, 0.22, 0.30), s * 0.35, -0.02, 0.05, 0, s * 0.10, 0);
  }
  P.addGunExtra(box(0.58, 0.10, 0.30), 0, -0.19, 0.04);

  P.decal('hull', 'number', 'PL-721', 0.24, [-1.84, 1.08, 0.72], -Math.PI / 2);
  P.decal('hull', 'number', 'PL-721', 0.24, [1.84, 1.08, 0.72], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.16);
}

// Production Jaguar refit. Preserve the measured Polish hull, native
// six-wheel course and source-correct cast-turret envelope above, then bring
// across the current T-72 family's structural grammar as an inset refit. The
// additions stay inside the certified silhouette: cast cheek load paths,
// seated ERAWA returns, backed fender armor and a connected service field.
// This avoids the short-chassis regression of the donor prototype while still
// making the playable Jaguar visibly part of the live T-72 family.
function buildT72M1Jaguar(P) {
  const { box, cylY, cylZ, torus } = KIT;
  buildT72M1JaguarLegacy(P);

  P.hullG.userData.t72FamilyFoundation = 'measured-current-t72-family';
  P.turretG.userData.polishModernization = 't72m1-jaguar-erawa-refit';

  // Shallow ERAWA skirt faces are planted into the existing fender-hung
  // panels. Their outer faces remain on the published-width anchor instead
  // of widening the vehicle or becoming a second skirt wall.
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = -1.96 + i * 0.69;
    const h = 0.225 + (i % 3) * 0.012;
    P.add('hull', box(0.030, h, 0.56), s * 1.780, 1.045 + (i % 2) * 0.010, z,
      0, 0, s * ((i % 3) - 1) * 0.008);
    P.add('hullDark', box(0.009, h * 0.70, 0.46), s * 1.796,
      1.045 + (i % 2) * 0.010, z);
    P.add('hullDetail', box(0.010, 0.020, 0.44), s * 1.797,
      1.045 + h * 0.47, z);
  }

  // Buried cast continuations close the lower gun-root valleys. These are
  // structural turret mass behind the Polish ERAWA wedge, borrowed from the
  // current T-72B family rather than decorative blocks hung in open space.
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.10, 0.03, 1.11], [s * 0.68, 0.03, 0.98], [s * 1.03, 0.03, 0.57], [s * 0.70, 0.03, 0.48],
      [s * 0.12, 0.23, 1.03], [s * 0.63, 0.24, 0.92], [s * 0.96, 0.23, 0.54], [s * 0.66, 0.23, 0.45]));

    // A low inner chevron course bridges the sight-safe gap between the
    // main wedge leaves and the mantlet. Tiles overlap the cast continuation
    // and remain below the roof crown.
    for (let i = 0; i < 4; i++) {
      const x = s * (0.20 + i * 0.185);
      const z = 1.00 - i * 0.105;
      P.add('turret', box(0.165, 0.078, 0.175), x, 0.44 - i * 0.012, z,
        -0.14, s * (0.22 + i * 0.08), -0.045);
      P.add('turretDark', box(0.125, 0.010, 0.024), x, 0.485 - i * 0.012,
        z + 0.075, -0.14, s * (0.22 + i * 0.08), -0.045);
    }
  }

  // Backed driver/splash detail and unequal engine-deck service cells add
  // current-family articulation without altering the certified hull loft.
  P.add('hull', box(2.16, 0.040, 0.13), 0, 1.315, 2.43, -0.30, 0, 0);
  for (const [x, z, w, d] of [
    [-0.52, -1.55, 0.62, 0.34], [0.18, -1.62, 0.52, 0.30], [0.73, -1.74, 0.42, 0.26],
  ]) {
    P.add('hullDark', box(w, 0.016, d), x, 1.463, z);
    P.add('hullDetail', box(w * 0.82, 0.014, 0.030), x, 1.476, z + d * 0.34);
  }

  // Commander ring receives the current T-72 concentric seat and a visible
  // hinge return while leaving the Polish WKM-B, Drawa and Obra package clear.
  P.add('turret', cylY(0.305, 0.325, 0.035, 18), -0.38, 0.806, -0.42);
  P.add('turretDark', torus(0.290, 0.010, 18), -0.38, 0.827, -0.42);
  P.add('turretDark', box(0.055, 0.025, 0.11), -0.10, 0.821, -0.42, 0, 0.22, 0);

  // Deep Polish modernization package. ERAWA wraps the side bins and rear
  // bustle instead of ending at the frontal chevron, while shallow roof
  // singles fill the exposed shoulder quadrants without blocking either
  // hatch, the Drawa sight or the gun-recoil corridor.
  let addedEraTiles = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -0.94 + i * 0.31;
      P.add('turret', box(0.055, 0.235, 0.275), s * 1.432, 0.43, z,
        -0.04, s * (0.10 + i * 0.025), 0);
      P.add('turretDark', box(0.012, 0.170, 0.225), s * 1.463, 0.43, z,
        -0.04, s * (0.10 + i * 0.025), 0);
      addedEraTiles++;
    }
    for (let i = 0; i < 3; i++) {
      const x = s * (0.32 + i * 0.28);
      const z = 0.24 - i * 0.035;
      P.add('turret', box(0.245, 0.050, 0.205), x, 0.796 - i * 0.012, z,
        0.06, s * (0.04 + i * 0.025), 0);
      P.add('turretDark', box(0.195, 0.012, 0.155), x, 0.827 - i * 0.012, z,
        0.06, s * (0.04 + i * 0.025), 0);
      addedEraTiles++;
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.275;
    P.add('turret', box(0.25, 0.19, 0.050), x, 0.44 + (i % 2) * 0.015, -1.676);
    P.add('turretDark', box(0.195, 0.135, 0.012), x,
      0.44 + (i % 2) * 0.015, -1.708);
    addedEraTiles++;
  }

  // Fender kit: lidded tool lockers, recovery boxes, a strapped canvas roll
  // and spare links. These are equipment buckets, so they add visible field
  // detail without inflating the Jaguar's armor or combat-anatomy volumes.
  let hullEquipmentPieces = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -1.16 + i * 0.68;
      const w = i === 1 ? 0.46 : 0.40;
      P.addEquipment('hull', box(w, 0.16, 0.48), s * 1.43, 1.34, z,
        0, s * (i - 1) * 0.025, 0);
      P.addEquipment('hullDark', box(w * 0.92, 0.020, 0.42), s * 1.43, 1.431, z,
        0, s * (i - 1) * 0.025, 0);
      P.addEquipment('hullDetail', box(0.035, 0.055, 0.09), s * 1.64, 1.35,
        z + 0.11, 0, 0, 0);
      hullEquipmentPieces += 3;
    }
    P.addEquipment('hullCloth', cylZ(0.095, 0.72, 12), s * 1.40, 1.45, -1.82);
    for (const z of [-2.02, -1.62]) {
      P.addEquipment('hullDark', torus(0.098, 0.012, 12), s * 1.40, 1.45, z,
        Math.PI / 2, 0, 0);
    }
    hullEquipmentPieces += 3;
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.48 + i * 0.24;
    P.addEquipment('hullDetail', box(0.20, 0.055, 0.16), x, 1.385, 2.72,
      -0.30, 0, (i - 2) * 0.012);
    P.addEquipment('hullDark', box(0.155, 0.012, 0.11), x, 1.418, 2.74,
      -0.30, 0, (i - 2) * 0.012);
    hullEquipmentPieces += 2;
  }

  // Turret service furniture: side basket rails, tarp rolls, cable trunks,
  // extra Obra heads and a compact commander's panoramic sight. Everything
  // is seated on a visible shoe and traverses with the turret.
  let turretEquipmentPieces = 0;
  for (const s of [-1, 1]) {
    P.addEquipment('turretDark', box(0.035, 0.28, 0.74), s * 1.47, 0.43, -0.70,
      0, s * 0.10, 0);
    for (const y of [0.32, 0.54]) {
      P.addEquipment('turretDark', box(0.035, 0.035, 0.78), s * 1.48, y, -0.70,
        0, s * 0.10, 0);
    }
    P.addEquipment('turretCloth', cylZ(0.105, 0.58, 12), s * 1.40, 0.50, -0.72,
      0, s * 0.10, 0);
    P.addEquipment('turretDark', torus(0.108, 0.012, 12), s * 1.40, 0.50, -0.98,
      Math.PI / 2, 0, 0);
    P.addEquipment('turretDark', torus(0.108, 0.012, 12), s * 1.40, 0.50, -0.46,
      Math.PI / 2, 0, 0);
    P.addEquipment('turret', box(0.13, 0.09, 0.12), s * 1.08, 0.56, -0.92,
      0, s * 2.55, 0);
    P.addEquipment('turretGlass', box(0.075, 0.044, 0.014),
      s * 1.08 + Math.sin(s * 2.55) * 0.066, 0.56,
      -0.92 + Math.cos(s * 2.55) * 0.066, 0, s * 2.55, 0);
    turretEquipmentPieces += 8;
  }
  P.addEquipment('turret', box(0.34, 0.035, 0.32), -0.12, 0.700, -0.70);
  P.addEquipment('turretDark', cylY(0.115, 0.135, 0.055, 14), -0.12, 0.746, -0.70);
  P.addEquipment('turret', box(0.18, 0.10, 0.18), -0.12, 0.790, -0.70,
    0, -0.20, 0);
  P.addEquipment('turretGlass', box(0.115, 0.060, 0.014), -0.10, 0.795, -0.602,
    0, -0.20, 0);
  P.addEquipment('turretDark', box(0.025, 0.16, 0.030), 0.02, 0.76, -0.96,
    -0.35, 0, 0);
  P.addEquipment('turretDark', box(0.025, 0.14, 0.030), 0.10, 0.70, -1.08,
    -0.48, 0, 0);
  turretEquipmentPieces += 6;

  // Rear recovery fittings and exhaust service details break up the broad
  // plate while remaining above the sprocket/track sweep.
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', cylZ(0.070, 0.34, 10), s * 1.12, 1.20, -3.18,
      Math.PI / 2, 0, 0);
    P.addEquipment('hullDetail', box(0.18, 0.11, 0.035), s * 1.38, 1.34, -3.17);
    P.addEquipment('hullDark', box(0.09, 0.06, 0.025), s * 1.38, 1.34, -3.193);
    hullEquipmentPieces += 3;
  }

  P.turretG.userData.jaguarModernizationReceipt = Object.freeze({
    eraTiles: addedEraTiles,
    turretEquipmentPieces,
    panoramicSight: true,
    sideBaskets: 2,
    rearEraCourse: 5,
  });
  P.hullG.userData.jaguarModernizationReceipt = Object.freeze({
    hullEquipmentPieces,
    fenderLockers: 6,
    spareLinks: 5,
    canvasRolls: 2,
  });
}

// ===========================================================================
// PT-91A TWARDY — ERAWA-1/2 coverage, Polish bins, PCO sights, WKM-B.
// Print: pt91a_manako.glb (misc_a/misc_b split). _vlo AUDIT (this round):
// chassis_vlo is a whole-vehicle LOD shell riding the HULL node — it bakes
// the at-rest turret AND the full gun into every hull mask (ref side_hull
// carries the tube band 1.84..1.56 out to z 6.25 and turret tops 2.07-2.46
// across the works band; stations z-range inflates to ~10 m). hullCurves /
// stations / front_hull are certified-capped until the orchestrator lands
// the chassis_vlo excision (normalize plan reported in the packet). Whole +
// turret rows and dims/floaters are honest and are the round's targets.
// Measured (workorder r1, absolute): rear rack 1.31-1.40 to -3.71, engine
// tops 1.45-1.56 z -3.15..-2.03, bustle 2.04-2.07 z -1.58..-1.14, mast
// spike 3.52 @ -1.02, dome band 2.13-2.29 z -0.8..-0.13, cupola crest
// 2.46-2.60 z -0.02..+0.43, ERA wedge fall 2.52-2.46 z 0.43..1.66, IR spike
// 2.54 @ 1.44, tube band 1.84..1.56/1.62 to muzzle 6.25, plan: hull edge
// ±1.75, fender fronts 3.84 (PRINT-LONG vs published hull 6.95 — capped),
// rear -3.54 with drum slivers -3.62..-3.68, turret shoulders ±1.50-1.52,
// wedge tips plan 1.72 @ |x| 0.5-0.6, evacuator col +0.18 to 4.71.
// Published sovereign: hull 6.95 (body -3.41..+3.54, mid 0.065 = the
// polluted-registration counterweight), overall 9.67 (rear drums -3.42 ->
// muzzle 6.25 — the print's own muzzle), width 3.59, height 2.19 (dome
// crown 2.19; mast+cupola spikes <=4 columns at the ref's own zones).
// ===========================================================================

function buildPT91Twardy(P) {
  const { box, cylX, cylY, cylZ, torus, buildRunningGear } = KIT;

  // ---- hull loft (published envelope, ref engine-stack cadence) ----------
  loftHull(P, {
    deck: [[-3.41, 1.30], [-3.24, 1.43], [-3.00, 1.50], [-2.62, 1.555],
      [-2.06, 1.555], [-1.90, 1.50], [-0.80, 1.475], [1.10, 1.49],
      [2.00, 1.40], [2.30, 1.335], [2.55, 1.29], [3.05, 1.13], [3.54, 1.00]],
    belly: [[-3.41, 0.84], [-3.14, 0.55], [-2.68, 0.43], [2.30, 0.43],
      [2.92, 0.56], [3.54, 0.78]],
    wUp: [[-3.41, 1.63], [2.60, 1.63], [3.18, 1.32], [3.54, 1.02]],
    wLo: [[-3.41, 0.97], [2.50, 0.97], [3.54, 0.80]],
    sponsonY: 1.14,
  });

  // bow corner fenders carry the plan front outboard of the center V
  for (const s of [-1, 1]) {
    P.add('hull', box(0.62, 0.13, 0.42), s * 1.40, 1.09, 3.30);
    P.add('hullRubber', box(0.58, 0.15, 0.04), s * 1.38, 0.93, 3.52);
    P.add('hullDark', box(0.03, 0.05, 0.44), s * 1.755, 1.235, 3.28);
    P.add('hull', box(0.16, 0.05, 5.7), s * 1.70, 1.215, 0.30);
    // fender-slot §B2 floor: a REAL dark slot plate riding 6 cm above the
    // idler wrap arc at its z (strict clip audit proof; the v2 hole scan
    // hides /shadow/ meshes so the leclerc shadow device cannot close B2)
    P.add('hullDark', box(0.24, 0.01, 0.28), s * 1.53, 1.10, 3.00);
  }

  // ---- running gear: T-72 stance centered on the 0.065 body mid ----------
  const wheelZs = [-1.95, -1.13, -0.31, 0.51, 1.33, 2.15];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.455, wheelW: 0.23, wheelY: 0.47, xc: 1.37,
    dishR: 0.79, wheelZs,
    sprocket: { z: -2.30, y: 0.68, r: 0.32 },
    idler: { z: 2.52, y: 0.69, r: 0.30 },
    contactZF: 2.26, contactZR: -2.02,
    rollers: [-1.29, -0.09, 1.16].map((z) => ({ z, y: 0.91, r: 0.082 })),
    trackW: 0.56, topY: 1.00, botY: 0.025, paintedEnds: true,
    coveredTop: true, arms: true,
  });

  // The smart running-gear builder owns the complete road-wheel face stack.
  // Do not add a second static disc/inset layer here: it would remain hull-
  // fixed while the suspension instances move and visibly double the wheels.

  // ---- skirts: ERAWA-1 armored forward third + rubber run (±1.795) -------
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      P.add('hull', box(0.065, 0.36, 0.60), s * 1.7625, 1.02, 2.02 - k * 0.64,
        0, 0, s * (k % 2 ? 0.015 : -0.012));
      P.add('hullDark', box(0.018, 0.28, 0.025), s * 1.797, 1.02, 2.32 - k * 0.64);
    }
  }
  ruSkirtBand(P, {
    x: 1.775, th: 0.04, z0: -2.02, z1: 0.10, yTop: 1.20, yBot: 0.74,
    panels: 4, dressIn: 0.03,
  });

  // ---- ERAWA-1 glacis field on the plate rake + bow kit -------------------
  erawaCourse(P, {
    x: 0, y: 1.255, z: 2.28, right: [1, 0, 0], up: [0, 0.30, -0.954],
    out: [0, 0.954, 0.30], cols: 9, rows: 3, pitchU: 0.292, pitchV: 0.285,
    tileW: 0.27, tileH: 0.26, tileD: 0.05, rx: -1.265,
    skip: (r, c) => r === 2 && c >= 3 && c <= 5,
  });
  ruGlacisKit(P, { w: 3.30, y: 1.18, z: 2.66, eyeX: 0.96, eyeZ: 2.98,
    eyeSplit: true, hookY: 0.92, hookZ: 3.10, lights: false });
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.10, r: 0.042,
      shield: true, seed: 9351 + (s > 0 ? 1 : 0),
    }), s * 1.16, 1.22, 2.52, [-0.30, 0, 0]);
  }
  P.add('hull', box(2.24, 0.045, 0.15), 0, 1.335, 2.50, -0.30, 0, 0);
  ruDeck(P, { deckY: 1.475, hatchX: -0.40, hatchZ: 1.86, gz: -0.95,
    grilles: 4, gw: 1.48, periY: 1.45, gY: 1.50 });
  // §5.267 fix 3: real louvre relief over the powerpack run (sunk wells +
  // rib bars; relief tops +0.012 over the local deck line — mask-safe)
  for (let k = 0; k < 5; k++) {
    const z = -1.06 - k * 0.21;
    P.add('hullDark', box(1.46, 0.016, 0.14), 0, 1.494, z);
    P.add('hullDetail', box(1.50, 0.030, 0.038), 0, 1.498, z + 0.09);
  }
  for (const s of [-1, 1]) P.add('hull', box(0.06, 0.034, 1.15), s * 0.77, 1.496, -1.48);

  // Malaysian-lineage powerpack stack cadence over the rear deck
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.11, 0.98), s * 0.86, 1.575, -2.58);
    P.add('hullDark', box(0.42, 0.02, 0.88), s * 0.86, 1.64, -2.58);
  }
  P.add('hull', box(0.56, 0.09, 1.00), 0, 1.565, -2.60);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.98, 0.024, 0.05),
    0, 1.585, -2.24 - k * 0.22);

  // ---- rear service load: transverse drums + rack (rear extreme -3.42) ---
  // §5.267 fix 2: the drums READ AS CYLINDERS now — camo steel bodies (the
  // r1 hullWood tone fused them into a tan plank band), dark end rings +
  // hub bosses, steel straps over the crowns; the solid backing plate is
  // replaced by an open rail frame (verticals + the 3 rails) so the round
  // bodies stay visible from dead-rear.
  for (const s of [-1, 1]) {
    P.add('hull', cylX(0.235, 0.74, 18), s * 0.55, 1.16, -3.18);
    for (const rx of [-0.17, 0, 0.17]) P.add('hullDark', cylX(0.244, 0.018, 18),
      s * (0.55 + rx), 1.16, -3.18);
    for (const e of [-1, 1]) {
      P.add('hullDark', cylX(0.238, 0.014, 18), s * 0.55 + e * 0.365, 1.16, -3.18);
      P.add('hullDetail', cylX(0.09, 0.018, 12), s * 0.55 + e * 0.376, 1.16, -3.18);
    }
    P.add('hull', box(0.48, 0.13, 0.22), s * 0.55, 0.98, -3.10);
    P.add('hullDetail', box(0.03, 0.47, 0.022), s * 0.55, 1.17, -3.415); // crown strap
  }
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.80, 0.032, 0.035),
    0, 1.00 + k * 0.11, -3.40);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.035, 0.30, 0.035),
    -0.90 + k * 0.45, 1.11, -3.40);
  // §5.267 fix 2: round log read — end discs + risers keep it proud
  mount(P, 'hull', FITTINGS.unditchingLog({
    mats: { ...P.mats, wood: rehookClone(P.mats.wood, 0x4a4636, 0x0a0906) },
    len: 2.10, r: 0.115, straps: 3, seed: 9301,
  }), 0, 1.44, -3.30);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylX(0.095, 0.02, 12), s * 1.06, 1.44, -3.30);
    P.add('hullDark', box(0.04, 0.09, 0.10), s * 0.80, 1.36, -3.30);
  }

  // ---- turret: measured dome + ERAWA-2 wedges + Polish stations -----------
  // pivot [0,1.38,0.02]; dome crown world 2.19 (published height), base 1.50
  const rings = [
    [1.22, 0.12], [1.26, 0.24], [1.18, 0.46], [1.00, 0.64],
    [0.72, 0.755], [0.38, 0.80], [0.03, 0.81],
  ];
  meshDomeCurved(P, rings, 0.98, 0, -0.08, { capR: 1.85 });
  // bustle (ref 2.04-2.07 band z -1.58..-1.14 -> local -1.60..-1.16)
  P.add('turret', box(1.52, 0.40, 0.50), 0, 0.46, -1.35);
  P.add('turret', box(1.10, 0.30, 0.22), 0, 0.42, -1.66, 0.12, 0, 0);
  P.add('turretDark', box(1.42, 0.28, 0.035), 0, 0.44, -1.625);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.64, d: 0.38, h: 0.16, fill: 0.36, rails: 3, seed: 9311,
  }), 0, 0.56, -1.38);
  // the distinctive Polish flank bins (both cheek-rears, lidded)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.34, 0.88), s * 1.30, 0.40, -0.62, 0, s * 0.14, 0);
    P.add('turretDark', box(0.20, 0.02, 0.80), s * 1.315, 0.585, -0.64, 0, s * 0.14, 0);
    P.add('turretDetail', box(0.03, 0.10, 0.05), s * 1.42, 0.42, -0.30, 0, s * 0.14, 0);
  }

  // ERAWA-2 wedge cheeks — plan tips at the measured 1.72 line (|x| 0.5-0.6),
  // faces falling 2.52 -> 2.46 over z 0.43..1.66 (world)
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.20, 0.16, 1.66], [s * 1.06, 0.14, 1.02], [s * 1.24, 0.16, 0.28], [s * 0.30, 0.18, 0.60],
      [s * 0.18, 0.70, 1.34], [s * 0.96, 0.66, 0.82], [s * 1.14, 0.64, 0.22], [s * 0.28, 0.70, 0.48]));
    erawaCourse(P, {
      bucket: 'turret',
      x: s * 0.64, y: 0.42, z: 1.10, right: [s * 0.50, 0, -0.60],
      up: [0, 0.94, 0.24], out: [s * 0.66, 0.30, 0.60],
      cols: 3, rows: 2, pitchU: 0.315, pitchV: 0.25,
      tileW: 0.28, tileH: 0.22, tileD: 0.05,
      ry: s * 0.66, rx: -0.20,
    });
  }
  // roof ERAWA-1 singles behind the wedges (the Twardy roof course)
  erawaCourse(P, {
    bucket: 'turret', x: 0, y: 0.7825, z: 0.10, right: [1, 0, 0], up: [0, 0.06, -1],
    out: [0, 1, 0.06], cols: 4, rows: 1, pitchU: 0.30, pitchV: 0.26,
    tileW: 0.27, tileH: 0.045, tileD: 0.26, seams: false,
  });
  // §5.267 fix 1: the FRONT-SECTOR ERAWA CARPET — the print wraps the whole
  // dome nose in the square-cassette grid (my r1 build carried wedges +
  // cheek patches only, bare nose/roof between). Two dome-skin arcs seated
  // by ringSkin + two forward-roof rows; every crown stays under the 2.19
  // grace band (tops <=0.80 local).
  {
    // the arcs ride the bare upper-nose band ABOVE the ERAWA-2 wedge tops
    // (~0.68 local) and below the crown — the exact band the critic sheet
    // shows carpeted on the print and bare on r1
    const arcs = [
      { y: 0.58, rows: 1, tile: [0.24, 0.20, 0.05], n: 7, a0: -0.95, a1: 0.95 },
      { y: 0.688, rows: 1, tile: [0.22, 0.16, 0.045], n: 5, a0: -0.72, a1: 0.72 },
    ];
    for (const arc of arcs) {
      const r = ringSkin(rings, arc.y) - 0.012;
      for (let i = 0; i < arc.n; i++) {
        const a = arc.a0 + (i / (arc.n - 1)) * (arc.a1 - arc.a0);
        const cx = Math.sin(a) * r * 0.99;
        const cz = Math.cos(a) * r * 0.98 - 0.08;
        // dome slope tilt at this band (outward lean follows the profile)
        P.add('turret', box(arc.tile[0], arc.tile[1], arc.tile[2]),
          cx, arc.y + 0.02, cz, -0.38, a, 0);
        // seam plate rides the tile FACE (outward), not its crown — the
        // +0.032 y-lift version topped 2.202 and owned heightM's 4th column
        P.add('turretDark', box(arc.tile[0] * 0.86, arc.tile[1] * 0.86, 0.012),
          cx + Math.sin(a) * 0.034, arc.y + 0.008, cz + Math.cos(a) * 0.034, -0.38, a, 0);
      }
    }
    // forward-roof carpet rows (flat tiles lying on the crown fall)
    erawaCourse(P, {
      bucket: 'turret', x: 0, y: 0.745, z: 0.62, right: [1, 0, 0], up: [0, -0.10, -0.995],
      out: [0, 0.995, -0.10], cols: 4, rows: 1, pitchU: 0.27, pitchV: 0.24,
      tileW: 0.25, tileH: 0.05, tileD: 0.23, rx: 0.10, seams: false,
    });
    erawaCourse(P, {
      bucket: 'turret', x: 0, y: 0.775, z: 0.38, right: [1, 0, 0], up: [0, -0.04, -1],
      out: [0, 1, -0.04], cols: 5, rows: 1, pitchU: 0.27, pitchV: 0.24,
      tileW: 0.25, tileH: 0.045, tileD: 0.23, seams: false,
    });
  }

  // stations: commander cupola with a REAL lid (§5.267 fix 4 — crown holds
  // 2.205 world, inside the 2.212 grace edge so dims 100 HOLDS) + radial
  // periscope wreath on the ring wall; the print's broad 2.46-2.60 crest
  // stays certified print-tall
  // (r-fix receipt: the cupola cluster at y 0.78 kept the p95 4th column
  // at 2.2124 — the whole station sinks 12 mm so every wide top holds
  // <=2.196 and the dims-100 constraint keeps real margin)
  polishCupola(P, { x: -0.36, y: 0.768, z: 0.10, r: 0.29, ringH: 0.05,
    lidTop: 0.806, periscopes: 5, arc0: -0.6, arc1: 2.4 });
  // loader/gunner hatch: flush seam ring + handles (no crown budget left)
  P.add('turretDark', torus(0.21, 0.012, 14), 0.42, 0.792, -0.38);
  P.add('turretDetail', box(0.09, 0.018, 0.025), 0.42, 0.80, -0.16);
  P.add('turretDetail', box(0.025, 0.018, 0.09), 0.62, 0.80, -0.38);
  // WKM-B 12.7 low-slung on the right dome shoulder (pt91m NSVT precedent —
  // receiver under the crown line; r1/r2 dims receipts: crown-top stations
  // read heightM 2.45-2.47). Pedestal ring seats it on the dome skin.
  P.add('turretDark', cylY(0.10, 0.13, 0.09, 12), 1.00, 0.585, -0.30);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.52, elev: 0.35,
    ammo: true, seed: 9321,
  }), 1.00, 0.605, -0.30, [0, -0.08, 0]);

  // PCO SKO-1M/Drawa-T sight suite (gunner right-front, hooded) + commander
  // POD-72 head — the Polish optical identity (crowns at the dome band)
  P.add('turretDetail', box(0.34, 0.22, 0.34), 0.52, 0.70, 0.66);
  P.add('turretDark', box(0.26, 0.13, 0.03), 0.52, 0.72, 0.845);
  P.add('turretGlass', box(0.18, 0.08, 0.02), 0.52, 0.72, 0.862);
  P.add('turretDetail', box(0.26, 0.14, 0.22), -0.36, 0.735, -0.38);
  P.add('turretDark', box(0.20, 0.08, 0.025), -0.36, 0.745, -0.265);
  // IR/searchlight block right of the mantlet (ref spike 2.54 @ z 1.44)
  P.add('turretDetail', box(0.30, 0.30, 0.26), 0.58, 0.56, 1.28);
  P.add('turretDark', box(0.24, 0.24, 0.03), 0.58, 0.56, 1.425);

  // met mast — the ref's own 3.52 @ z -1.02 spike (thin, one column).
  // Seated at the ref's own station on a real pedestal cone rising from the
  // dome skin (r1 floater receipt: the bare 0.81 base floated 0.46 above
  // the falling dome at yaw 90).
  P.add('turret', KIT.frustum(0.10, -0.96, -1.16, 0.05, -1.01, -1.11, 0.30, 0.76), -0.55, 0, 0);
  mast(P, -0.55, 0.74, -1.06, 2.06, 0.023, 0.09);

  // Tellur smoke banks on the LEFT cheek (the print's asymmetric tell) +
  // a compact right pair
  mount(P, 'turret', FITTINGS.smokeBank({
    mats: P.mats, count: 6, r: 0.042, len: 0.28, splay: -1.05, pitch: -0.44,
    arc: 0.60, spacing: 0.10, slot: 'detail', rotation: [0, 0, 0.10], seed: 9331,
  }), -1.12, 0.52, 0.30);
  mount(P, 'turret', FITTINGS.smokeBank({
    mats: P.mats, count: 3, r: 0.042, len: 0.28, splay: 1.05, pitch: -0.44,
    arc: 0.42, spacing: 0.10, slot: 'detail', rotation: [0, 0, -0.10], seed: 9332,
  }), 1.16, 0.50, 0.44);
  // conformal antenna bases only (r-fix receipt: the 0.20/0.17 stubs'
  // AA-faded tips floated heightM's 4th p95 column at 2.2016-2.2124
  // phase-dependent — the dims-100 hold needs every read <=2.2119; the
  // rods now stop under the 2.19 crown line)
  polishWhips(P, [[-0.98, 0.62, -1.30, 0.065, -0.05], [1.00, 0.62, -1.20, 0.055, 0.06]], 9341);

  // ---- gun: 2A46MS with thermal sleeve, evacuator, measured muzzle 6.25 ---
  // axis world 1.70 (pivot 1.38 + 0.32); local muzzle 5.73
  ruBoot(P, { pts: [[0.30, 0.64, 0.54, 0.00], [0.64, 0.48, 0.42, 0.01], [0.98, 0.33, 0.31, 0.015]] });
  tubeGun(P, [
    [0.98, 2.50, 0.122, 0.118],
    [2.50, 3.80, 0.118, 0.114],
    [3.80, 4.19, 0.114, 0.112],
    [4.19, 4.66, 0.172, 0.162],          // evacuator (plan col +0.18 to 4.71)
    [4.66, 5.60, 0.110, 0.106],
    [5.60, 5.73, 0.114, 0.114],
  ], { rings: [[2.50, 0.124], [3.80, 0.118], [4.19, 0.176], [4.66, 0.114]], muzzle: 5.73 });
  muzzleBore(P, { r: 0.099, boreR: 0.063 });
  P.addGunExtraDark(cylZ(0.032, 0.10, 10), 0.30, 0.11, 0.55);
  P.decal('turret', 'number', 'PT-91', 0.24, [-1.32, 0.42, -0.98], -Math.PI / 2);
  P.decal('turret', 'number', 'PT-91', 0.24, [1.32, 0.42, -0.98], Math.PI / 2);
  addVehicleGhillieSuit(P);
  P.topY = Math.max(P.topY || 0, 1.35);
}

// ===========================================================================
// PL-01 — the faceted stealth demonstrator (OBRUM/BAE concept).
// Print: pl01_501st.glb (semantic, untextured, hull 6.95 native EXACT;
// authored-look — trusted for identity + facet grammar). Followers row
// completed this round (sight mast / EO heads / RWS shields / gun thermal
// cover were stranded in the hull mask).
// Measured (workorder r1, absolute): hull body -3.505..+3.425 (plan rear
// -3.49, nose V 3.41 center / 3.38 to ±1.635 / 3.29 @ ±1.725 / 3.05 @
// ±1.845), skirt face silhouette: top 2.065 (rear) / 2.04 / 2.01 / 1.98
// falling to the (3.44, 1.44) bow tip, bottom 0.26 with bow chamfer
// (2.30,0.28)->(3.44,1.44) and stern chamfer (-2.35,0.28)->(-3.505,1.44),
// outer-face bevels (front view): top edge 2.10@|x|1.62 -> 1.96@1.87,
// bottom 0.62@1.67 -> 1.27@1.87; belly 0.32 between tracks. Turret diamond:
// roof 2.79 (z -3.16..+0.44), nose tip (0.98, ~2.55), tail wedge to
// (-3.60, 2.37), base plane 2.07; plan nose (±0.405, 0.98) ->
// shoulders (±1.487, -0.88..-1.18) -> tail (±0.405, -3.58); RWS field
// 3.30-3.39 over z -2.44..-0.88 (PRINT-TALL vs published heightM 2.80 —
// only the ref's own -2.44..-2.08 spike window is matched, remainder
// certified-capped), sight-mast head 3.00 @ z 0.08-0.20 (capped to the
// published band), gun cover 2.52->2.43 to z 3.91, bare tube 2.34..2.16 to
// the print's short 4.88 muzzle (published overall wins: muzzle 5.36).
// Published sovereign: hull 6.95, overall 8.96 (tail -3.60 -> muzzle 5.36),
// width 3.80 (skirt outer faces ±1.90), height 2.80 (roof 2.79 p95; the
// RWS window is the <=4-column spike budget).
// 7 roadwheels + raised idler/sprocket behind full skirts (print: road pairs
// r 0.337 @ y 0.38, pitch 0.72 from z 2.166 to -2.154; idler (2.99, 0.956);
// sprocket (-2.80, 0.732); track band x 1.00..1.56, top 1.286).
// ===========================================================================

function buildPL01(P) {
  const { box, cylX, cylY, cylZ, torus, buildRunningGear } = KIT;
  const slab = orientedSlab;
  const is105 = P.spec.id === 'pl01_105';

  // ---- center hull body (x ±1.616): tub + faceted glacis ------------------
  // deck line = the measured falling top run (side_hull tops 2.07 rear ->
  // 1.98 at the z 1.88 fold; the flat 2.10 plateau lives aft of -1.5 only)
  // loft rear face stops at the -3.35 center inset (the print's plan notch:
  // rear -3.49 only at |x| 0.55..1.72, center -3.33) — the rear WINGS below
  // carry the -3.505 plate + boat-tail
  loftHull(P, {
    deck: [[-3.35, 2.095], [-1.50, 2.065], [-0.45, 2.04], [0.50, 2.02],
      [1.30, 1.975], [3.425, 0.88]],
    // stern boat-tails (r3/r6 receipts: the print's rear bottoms rise
    // 0.63 @ -3.23 -> 1.21 @ -3.43 -> 1.46 @ -3.53)
    belly: [[-3.35, 0.92], [-3.10, 0.50], [-2.85, 0.34], [-2.60, 0.30],
      [2.35, 0.30], [2.90, 0.42], [3.425, 0.72]],
    // containment (leclerc glacis-taper precedent + this round's strict
    // sweep 3445): the ascending idler band crosses the glacis plane past
    // z~2.6 — the full-width plate tapers to ±0.94 there; the lower band
    // stays inboard of the 0.955 course wall; the sponson floor rides above
    // the 1.45 return-strand shoe crowns.
    wUp: [[-3.35, 1.616], [2.55, 1.616], [2.66, 0.94], [3.425, 0.90]],
    wLo: [[-3.35, 0.94], [3.425, 0.86]],
    sponsonY: 1.47,
  });
  // glacis is ONE raked plane driving the nose (slope motivates the mass):
  // fold (1.30, 1.975) -> tip (3.425, 0.88). FULL WIDTH only to z 2.60 —
  // past it the plate tapers to ±0.94 (leclerc containment precedent: the
  // ascending idler band crosses the plane there; the plan bow at |x|
  // 0.96..1.60 is carried by the course itself, exactly like the print).
  segmentedStrip(P, 'hull',
    [2.60, 1.305, 2.60, 1.305, 1.616], [1.33, 1.90, 1.30, 1.975, 1.616],
    ([zb0, yb0, zt0, yt0, w0], [zb1, yb1, zt1, yt1, w1]) => {
      P.add('hull', slab(
        [-w0, yb0, zb0], [w0, yb0, zb0], [w1, yb1, zb1], [-w1, yb1, zb1],
        [-w0, yt0, zt0], [w0, yt0, zt0], [w1, yt1, zt1], [-w1, yt1, zt1]));
    });
  segmentedStrip(P, 'hull',
    [3.30, 0.86, 3.425, 0.96, 0.94], [2.60, 1.30, 2.60, 1.315, 0.94],
    ([zb0, yb0, zt0, yt0, w0], [zb1, yb1, zt1, yt1, w1]) => {
      P.add('hull', slab(
        [-w0, yb0, zb0], [w0, yb0, zb0], [w1, yb1, zb1], [-w1, yb1, zb1],
        [-w0, yt0, zt0], [w0, yt0, zt0], [w1, yt1, zt1], [-w1, yt1, zt1]));
    });
  for (const s of [-1, 1]) {
    // plan nose V chamfer: INBOARD carrier only (x <=0.94 — the old
    // 0.675..1.635 sheet crossed the idler sweep: 617 front voxels)
    segmentedStrip(P, 'hull',
      [3.415, 0.88, 3.37, 0.88, 3.10, 3.10], [2.30, 1.42, 2.26, 1.40, 1.62, 1.62],
      ([zA0, yA0, zB0, yB0, zAr0, zBr0], [zA1, yA1, zB1, yB1, zAr1, zBr1]) => {
        P.add('hull', slab(
          [s * 0.30, yA0, zA0], [s * 0.94, yB0, zB0], [s * 0.94, yB0, zBr0], [s * 0.30, yA0, zAr0],
          [s * 0.30, yA1, zA1], [s * 0.94, yB1, zB1], [s * 0.94, yB1, zBr1], [s * 0.30, yA1, zAr1]));
      });
  }
  // rear: the print's plan reads -3.49 rear ONLY on the |x| 0.55..1.65
  // wings; the center |x|<0.47 is an inset -3.33 panel with the service
  // door (r6 plan receipt: a full-width -3.505 plate read the center cols
  // 0.17 too far aft). Wings carry the boat-tail rake (1.36 @ -3.505 ->
  // 0.64 @ -3.30 measured).
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.42, 1.47, -3.505], [s * 1.616, 1.47, -3.505], [s * 1.616, 0.70, -3.32], [s * 0.42, 0.70, -3.32],
      [s * 0.42, 2.09, -3.505], [s * 1.616, 2.09, -3.505], [s * 1.616, 2.09, -3.32], [s * 0.42, 2.09, -3.32]));
  }
  // center inset panel (door bay) + its shallow boat-tail
  P.add('hull', slab(
    [-0.47, 1.02, -3.345], [0.47, 1.02, -3.345], [0.47, 0.70, -3.20], [-0.47, 0.70, -3.20],
    [-0.47, 2.09, -3.345], [0.47, 2.09, -3.345], [0.47, 2.09, -3.20], [-0.47, 2.09, -3.20]));
  P.add('hullDark', box(0.60, 0.60, 0.02), 0.10, 1.55, -3.352);  // door seam
  for (const dy of [0, 0.26]) P.add('hullDetail', box(0.05, 0.14, 0.05),
    0.11, 1.42 + dy, -3.342);
  P.add('hullDetail', box(0.24, 0.05, 0.05), -0.55, 1.92, -3.49);
  P.add('hullDark', box(0.92, 0.26, 0.03), -0.98, 1.60, -3.508); // grille (left wing)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.86, 0.028, 0.026),
    -0.98, 1.50 + k * 0.075, -3.515);

  // ---- full-height faceted stealth skirts (widthM anchor ±1.90) -----------
  // Measured cross-section (r1/r3 front receipts): inner hanging wall
  // (hem 0.27, x <=1.66), lower out-lean bevel (1.66, 0.60) -> (1.90, 1.30),
  // vertical face band at 1.90 (1.30..top-0.14), top in-lean bevel back to
  // the deck edge (1.62, top). Bow chamfer (2.90, 0.30) -> (3.44, 1.44) and
  // stern chamfer (-2.88, 0.28) -> (-3.505, 1.44) ride the section's own
  // lines (r3: the early -2.35 stern knee read bottoms 0.76 where the print
  // holds 0.27 to -2.9).
  for (const s of [-1, 1]) {
    const zs = [
      // [z, topY, faceBotY(knee), hemY(inner wall), faceX(outer)]
      // hem 0.62 across the running-gear span (front cols ±1.67 read the
      // bevel from 0.62 — the 0.26 hem only survives at the chamfer tips);
      // faceX tapers into the bow/stern chamfers (plan receipt: the ±1.85
      // face band spans z -3.33..3.03 only)
      [-3.505, 1.46, 1.455, 1.44, 1.66],
      [-3.30, 2.065, 1.66, 0.92, 1.82],
      [-2.88, 2.065, 1.30, 0.62, 1.90],
      [-1.40, 2.065, 1.30, 0.62, 1.90],
      [0.40, 2.04, 1.30, 0.62, 1.90],
      [1.30, 2.01, 1.30, 0.62, 1.90],
      [1.88, 1.98, 1.30, 0.62, 1.90],
      [2.60, 1.73, 1.30, 0.62, 1.895],
      [3.00, 1.635, 1.34, 0.66, 1.86],
      [3.20, 1.565, 1.38, 0.90, 1.80],
      [3.44, 1.46, 1.45, 1.44, 1.66],
    ];
    for (let i = 0; i < zs.length - 1; i++) {
      // segmented per the station-slice visibility law (r3 receipt: station
      // slices i3-i5 topped at the 1.30 sponson — the 1.5 m panels were
      // edge-on invisible)
      segmentedStrip(P, 'hull', zs[i], zs[i + 1], ([z0, t0, k0, b0, f0], [z1, t1, k1, b1, f1]) => {
        // top bevel band: deck edge (1.62, top) out-down to the face crest
        P.add('hull', slab(
          [s * 1.62, t0 - 0.135, z0], [s * f0, t0 - 0.14, z0], [s * f1, t1 - 0.14, z1], [s * 1.62, t1 - 0.135, z1],
          [s * 1.62, t0, z0], [s * (f0 - 0.025), t0 - 0.125, z0], [s * (f1 - 0.025), t1 - 0.125, z1], [s * 1.62, t1, z1]));
        // face band: vertical outer face from the crest down to the knee
        P.add('hull', slab(
          [s * 1.645, k0, z0], [s * f0, k0, z0], [s * f1, k1, z1], [s * 1.645, k1, z1],
          [s * 1.645, t0 - 0.135, z0], [s * f0, t0 - 0.14, z0], [s * f1, t1 - 0.14, z1], [s * 1.645, t1 - 0.135, z1]));
        // lower bevel: knee leaning back inboard to the hanging hem wall
        P.add('hull', slab(
          [s * 1.64, b0, z0], [s * 1.695, b0, z0], [s * 1.695, b1, z1], [s * 1.64, b1, z1],
          [s * 1.64, k0 + 0.001, z0], [s * f0, k0 + 0.002, z0], [s * f1, k1 + 0.002, z1], [s * 1.64, k1 + 0.001, z1]));
      });
    }
    // panel seams + latch dressing on the face band
    for (let i = 0; i < 7; i++) {
      const z = 2.56 - i * 0.82;
      P.add('hullDark', box(0.014, 0.46, 0.022), s * 1.902, 1.60, z);
      P.add('hullDetail', box(0.018, 0.05, 0.09), s * 1.905, 1.82, z + 0.28);
      P.add('hullDetail', box(0.018, 0.05, 0.09), s * 1.905, 1.42, z - 0.26);
    }
    // shoulder shadow seam follows the falling top line (r3: a full-length
    // strip at 2.0 owned the z 2.4-2.9 tops where the fold reads 1.66-1.81)
    P.add('hullDark', box(0.016, 0.04, 4.55), s * 1.88, 1.925, -1.02);
    P.add('hullDark', box(0.016, 0.04, 0.62), s * 1.88, 1.875, 1.56, -0.075, 0, 0);
  }

  // ---- running gear: 7 hidden road pairs + raised ends (print-exact) ------
  buildRunningGear(P, {
    // print band x 0.949..1.613; r7 receipt: 0.70-wide drums at xc 1.19 ran
    // the disc faces to ±1.72 THROUGH the skirt hem and painted the ±0.88
    // front cols with ground where the print reads its 0.33 belly line —
    // wheels 0.965..1.525, discs held under the 1.60 hem wall
    // r8: band 0.955..1.595 (ref outer 1.606 traced ground at the ±1.60
    // front col; inner edge held off the 0.925 belly col's window)
    style: 'rubber', wheelR: 0.335, wheelW: 0.56, wheelY: 0.38, xc: 1.275,
    dishR: 0.60,
    wheelZs: [2.166, 1.446, 0.726, 0.006, -0.714, -1.434, -2.154],
    // end wheels pulled to the print's own wrap extents (track z
    // -3.168..3.375 — r6/r8 receipts: bigger/further ends swept to 3.46
    // and owned the bow-chamfer bottoms at 3.40)
    idler: { z: 2.84, y: 0.955, r: 0.31 },
    sprocket: { z: -2.72, y: 0.732, r: 0.31 },
    contactZF: 2.10, contactZR: -2.10,
    trackW: 0.64, topY: 1.28, botY: 0.020, paintedEnds: true,
    coveredTop: true, arms: true,
  });

  // The 105-mm demonstrator carries a field-fit glacis protection pack.
  // It is deliberately mounted ON the existing upper-glacis plane: one
  // centered spare-link strip plus two shallow camouflaged ERA courses.
  // Nothing is added to the running gear, so both PL-01s retain one native
  // linked course per side and the front idler wrap stays unobstructed.
  if (is105) {
    const glacisY = (z) => 2.645 - z * 0.515;
    const glacisPitch = 0.476;
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.66, pitch: 0.17, seed: 1057,
      rotation: [glacisPitch, 0, 0],
    });
    links.name = 'pl01_105_glacis_spare_links';
    links.position.set(0, glacisY(2.03) + 0.055, 2.03);
    P.hullG.add(links);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = 1.78 + i * 0.30;
        const y = glacisY(z) + 0.052;
        P.add('hull', box(0.34, 0.060, 0.245), s * 0.72, y, z,
          glacisPitch, 0, 0);
        // A narrow recessed seam keeps the cassettes legible while their
        // broad faces inherit the vehicle camouflage instead of generic
        // gray ERA material.
        P.add('hullDark', box(0.285, 0.012, 0.195), s * 0.72,
          y + 0.034, z - 0.015, glacisPitch, 0, 0);
      }
    }
    P.hullG.userData.pl01FrontGlacisPack = 'seated-spare-links-and-camo-era';
  }

  // ---- hull deck furniture -------------------------------------------------
  // driver's station: flush hatch + the raised twin periscope fairing
  P.add('hull', cylY(0.26, 0.26, 0.030, 16), -0.58, 2.115, 1.06);
  P.add('hullDark', torus(0.265, 0.012, 16), -0.58, 2.122, 1.06);
  KIT.periscope(P, 'hullDetail', -0.80, 2.10, 1.30, -0.3);
  KIT.periscope(P, 'hullDetail', -0.58, 2.10, 1.36);
  KIT.periscope(P, 'hullDetail', -0.36, 2.10, 1.30, 0.3);
  // VisorLid (the print's right-bow sensor lid: x 0.77..1.40, z 1.35..1.97)
  P.add('hull', box(0.60, 0.075, 0.60), 1.08, 1.925, 1.66, -0.485, 0, 0);
  P.add('hullDark', box(0.50, 0.02, 0.50), 1.08, 1.955, 1.67, -0.485, 0, 0);
  // engine deck: inset dark vents at the stern (print Vents z -3.30..-3.52)
  P.add('hullDark', box(2.90, 0.018, 0.20), 0, 2.106, -3.32);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.42, 0.024, 0.16),
    -1.25 + k * 0.5, 2.118, -3.32);
  P.add('hullDark', box(1.80, 0.016, 0.55), -0.2, 2.108, -2.55);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.72, 0.022, 0.05),
    -0.2, 2.12, -2.36 - k * 0.13);
  // recessed bow light clusters (stealth housings, inside the glacis line —
  // r8 receipt: shields at 1.52 topped 1.81 over the 1.68 fold cols; r9
  // containment receipt: the ±1.22 seat sat mid-course in the idler sweep)
  for (const s of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.11, r: 0.040,
      shield: true, seed: 1010 + (s > 0 ? 1 : 0),
    }), s * 0.76, 1.12, 3.02, [-0.44, 0, 0]);
    // Narrow LED position lamps live in the skirt shoulders and rear corner
    // armor; these make the long stealth side planes readable after dark.
    P.add('hullDetail', box(0.024, 0.075, 0.30), s * 1.904, 1.69, 2.32);
    P.add('hullGlass', box(0.010, 0.044, 0.22), s * 1.917, 1.69, 2.32);
    P.add('hullDetail', box(0.024, 0.11, 0.24), s * 1.73, 1.65, -3.34);
    P.add('hullGlass', box(0.014, 0.070, 0.16), s * 1.745, 1.65, -3.485);
  }
  // hinged front access panels (print Hinges x ±0.53, z 2.88..3.30)
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    P.add('hullDetail', box(0.10, 0.035, 0.16), s * (0.18 + k * 0.34), 1.42, 3.06, -0.485, 0, 0);
  }
  // Recovery equipment remains conformal: a deck-clipped tow cable, paired
  // rear clevises, and service handles break up the broad engine surface.
  mount(P, 'hull', FITTINGS.towCable({
    mats: P.mats,
    pts: [[-1.22, 0, -0.08], [-0.62, 0.055, 0.10], [0, 0.025, 0.15],
      [0.62, 0.055, 0.10], [1.22, 0, -0.08]],
    r: 0.018, seg: 26, seed: 1015,
  }), 0, 2.13, -2.78);
  for (const s of [-1, 1]) {
    P.add('hullDetail', torus(0.105, 0.022, 14), s * 1.13, 0.86, -3.39,
      Math.PI / 2, 0, 0);
    for (let k = 0; k < 2; k++) P.add('hullDetail', box(0.28, 0.025, 0.035),
      s * 0.72, 2.135, -2.18 - k * 0.28);
  }

  // ---- turret: the faceted diamond (joined two-band loft) -----------------
  // pivot [0, 2.07, -0.90]; stations from the measured plan/side polylines.
  // Turret-local: y0 = world - 2.07, z0 = world + 0.90.
  {
    const ST = [
      // [zWorld, halfW, roofY, baseY]
      [0.98, 0.34, 2.56, 2.16],
      [0.44, 0.72, 2.79, 2.10],
      [-0.20, 1.10, 2.79, 2.075],
      [-0.88, 1.487, 2.79, 2.07],
      [-1.18, 1.487, 2.79, 2.07],
      [-2.17, 1.245, 2.79, 2.07],
      [-3.16, 0.95, 2.785, 2.09],
      [-3.40, 0.66, 2.60, 2.21],
      [-3.60, 0.09, 2.385, 2.355],
    ];
    const shoulderT = 0.30;  // upper in-lean band depth
    const baseIn = 0.26;     // lower wall inboard set-back at the base plane
    for (let i = 0; i < ST.length - 1; i++) {
      const [zA, wA, rA, bA] = ST[i], [zB, wB, rB, bB] = ST[i + 1];
      const zLA = zA + 0.90, zLB = zB + 0.90;
      const shA = Math.max(rA - shoulderT - 2.07, bA - 2.07);
      const shB = Math.max(rB - shoulderT - 2.07, bB - 2.07);
      const bwA = Math.max(0.08, wA - baseIn), bwB = Math.max(0.08, wB - baseIn);
      // lower out-leaning band: base ring -> widest shoulder ring
      P.add('turret', slab(
        [-bwA, bA - 2.07, zLA], [bwA, bA - 2.07, zLA], [bwB, bB - 2.07, zLB], [-bwB, bB - 2.07, zLB],
        [-wA, shA, zLA], [wA, shA, zLA], [wB, shB, zLB], [-wB, shB, zLB]));
      // upper in-leaning band: shoulder ring -> roof ring
      const rwA = Math.max(0.07, wA - 0.34), rwB = Math.max(0.07, wB - 0.34);
      P.add('turret', slab(
        [-wA, shA, zLA], [wA, shA, zLA], [wB, shB, zLB], [-wB, shB, zLB],
        [-rwA, rA - 2.07, zLA], [rwA, rA - 2.07, zLA], [rwB, rB - 2.07, zLB], [-rwB, rB - 2.07, zLB]));
    }
    // nose cap closes the front ring into the gun-cover root (§B2)
    P.add('turret', slab(
      [-0.34, 0.09, 1.88], [0.34, 0.09, 1.88], [0.30, 0.10, 2.02], [-0.30, 0.10, 2.02],
      [-0.22, 0.49, 1.88], [0.22, 0.49, 1.88], [0.20, 0.30, 2.02], [-0.20, 0.30, 2.02]));
    // tail cap
    P.add('turret', box(0.18, 0.03, 0.06), 0, 0.30, -2.705);
  }
  // roof plate seams (facet grammar, sub-pixel proud)
  P.add('turretDark', box(1.60, 0.014, 0.02), 0, 0.722, -0.60);
  P.add('turretDark', box(0.02, 0.014, 2.10), -0.52, 0.722, -1.35);
  P.add('turretDark', box(0.02, 0.014, 2.10), 0.52, 0.722, -1.35);
  // Stealth-compatible applique: shallow faceted side panels, recessed
  // sensor faces and roof strakes.  They add styling/armor subdivision while
  // preserving the PL-01's intentionally clean, low-observable silhouette.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.42 - i * 0.52;
      const x = 1.18 + Math.min(i, 2) * 0.055;
      P.add('turret', box(0.055, 0.24, 0.42), s * x, 0.40, z,
        -0.08, s * (0.10 + i * 0.035), 0);
      P.add('turretDark', box(0.018, 0.16, 0.30), s * (x + 0.032), 0.405, z,
        -0.08, s * (0.10 + i * 0.035), 0);
    }
    // (§5.290 dims-recovery: strake seats 0.755 -> 0.7225 / rib 0.790 ->
    // 0.7505 — the rib tops read 2.8629 across ten side columns and owned
    // heightM's p95 over the 2.828 grace edge; re-seated the runners stay
    // 3 cm proud of the roof plane with the dark rib line intact)
    P.add('turret', box(0.22, 0.055, 1.28), s * 0.72, 0.7225, -0.76,
      0, s * 0.06, 0);
    P.add('turretDark', box(0.15, 0.012, 1.14), s * 0.72, 0.7505, -0.76,
      0, s * 0.06, 0);
    P.add('turret', box(0.24, 0.10, 0.26), s * 1.02, 0.61, -1.86,
      -0.10, s * 0.14, 0);
    P.add('turretGlass', box(0.14, 0.055, 0.020), s * 1.02, 0.62, -1.715,
      -0.10, s * 0.14, 0);
    // Two-stage cheek armor: a faceted carrier, recessed service seam, and
    // fasteners make each side read as layered armor rather than a flat slab.
    P.add('turret', box(0.075, 0.31, 0.62), s * 1.30, 0.35, 0.18,
      -0.08, s * 0.18, 0);
    P.add('turret', box(0.060, 0.27, 0.48), s * 1.36, 0.33, -0.42,
      -0.06, s * 0.13, 0);
    P.add('turretDark', box(0.012, 0.20, 0.47), s * 1.342, 0.36, 0.18,
      -0.08, s * 0.18, 0);
    for (const dz of [-0.22, 0.22]) for (const dy of [-0.09, 0.09]) {
      P.add('turretDetail', cylX(0.018, 0.020, 8), s * 1.39, 0.36 + dy, 0.18 + dz,
        0, 0, Math.PI / 2);
    }
    // Four-corner laser-warning receivers with paired glass apertures.
    P.add('turretDetail', box(0.115, 0.105, 0.12), s * 1.18, 0.58, 0.62,
      -0.05, s * 0.32, 0);
    P.add('turretGlass', box(0.045, 0.045, 0.016), s * 1.225, 0.595, 0.67,
      -0.05, s * 0.32, 0);
  }
  // (§5.290 dims-recovery: seats 0.755 -> 0.705 — the blocks topped 2.86 on
  // three side columns; at 0.705 they ride 2.5 cm proud, the conformal
  // stealth-roof read, and the glass slits stay above the roof plane)
  for (const [x, z, yaw] of [[-0.34, 0.42, -0.12], [0, 0.34, 0], [0.34, 0.42, 0.12]]) {
    KIT.periscope(P, 'turretDetail', x, 0.705, z, yaw);
  }

  // paired EO/hatch domes on the shoulders (print Cylinder.002/.004 —
  // crowns held at the published band 2.805, certified vs the print's 2.87)
  for (const s of [-1, 1]) {
    P.add('turret', cylY(0.275, 0.29, 0.075, 18), s * 1.02, 0.6225, -0.11);
    P.add('turret', KIT.lathe([[0.275, 0], [0.24, 0.045], [0.13, 0.065], [0.02, 0.075]], 18),
      s * 1.02, 0.66, -0.11);
    P.add('turretDark', torus(0.205, 0.012, 18), s * 1.02, 0.685, -0.11);
  }
  // left EO head (print Cameras.001: x -0.9..-0.58, top 2.43, z 0.03..0.24)
  P.add('turret', box(0.30, 0.20, 0.20), -0.72, 0.26, 1.02, -0.08, 0, 0);
  P.add('turretDark', box(0.22, 0.12, 0.03), -0.72, 0.28, 1.125, -0.08, 0, 0);
  for (const dx of [-0.06, 0.06]) P.add('turretGlass', cylZ(0.042, 0.024, 12),
    -0.72 + dx, 0.28, 1.148, Math.PI / 2, 0, 0);
  // central sight mast head (print Cameras @ z 0.09..0.29 — held at the
  // published band 2.80, print's 3.00 certified-capped)
  P.add('turret', cylY(0.115, 0.13, 0.30, 14), 0, 0.55, 1.09);
  P.add('turret', box(0.26, 0.185, 0.24), 0, 0.635, 1.09);
  P.add('turretDark', box(0.20, 0.10, 0.028), 0, 0.645, 1.222);
  P.add('turretGlass', box(0.13, 0.06, 0.02), 0, 0.645, 1.242);
  // Roof service panels, lifting eyes, and the modular mission-bay rack.
  for (const x of [-0.38, 0.38]) {
    P.add('turretDetail', box(0.50, 0.026, 0.34), x, 0.735, -0.58);
    P.add('turretDark', box(0.42, 0.012, 0.025), x, 0.750, -0.58);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.10, d: 0.34, h: 0.17, rails: 2, fill: 0.42,
    seed: is105 ? 1052 : 1051,
  }), 0, 0.49, -2.12);

  // ---- RWS / CROWS -------------------------------------------------------
  // Base PL-01 keeps the print's laterally parked low-observable RWS. The
  // 105-mm demonstrator receives a forward-aimed CROWS-style powered station
  // with a real roof plate -> slew ring -> pedestal -> cradle load path.
  if (!is105) {
    // RWS (the hump): riser + shielded MG station inside the print's own
    // spike window z -2.44..-2.08 (the <=4-column heightM budget; the print's
    // wider 3.3 field to -0.88 is certified print-tall) --------------------
    // The tower is z-THIN and x-WIDE: heightM prices SIDE columns only, so a
    // 0.20 m deep / 0.52 m wide station spends <=3 of the 4-column p95
    // budget while presenting a real 0.5 m RWS mass in front/hero views
    // (r1/r2 dims receipts: 0.3+ m deep assemblies read heightM 3.37).
    // (r4 dims receipt: a 0.175-radius ring at 0.795 topped 2.89 across 4
    // columns and OWNED heightM's p95 — the ring now hides inside the tower
    // window and the plinth crown stays under the 1% grace edge 2.828)
    P.add('turret', box(0.46, 0.035, 0.34), -0.05, 0.7275, -1.33);    // plinth
    P.add('turret', cylY(0.095, 0.11, 0.05, 16), -0.05, 0.77, -1.33);
    P.add('turret', box(0.52, 0.46, 0.17), -0.05, 1.03, -1.33);       // tower
    P.add('turretDark', box(0.46, 0.035, 0.15), -0.05, 1.278, -1.33); // cap
    P.add('turretDetail', box(0.10, 0.05, 0.09), 0.12, 1.315, -1.325); // sensor
    P.add('turretDark', box(0.065, 0.03, 0.06), 0.12, 1.352, -1.325);
    // RWS gun stowed LATERALLY (parked traverse — the fitting yaws 90 so its
    // whole envelope shares the tower's 3-column window)
    mount(P, 'turret', FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.66, elev: 0.12,
      ammo: true, shield: true, ring: { r: 0.16, stubs: 4 }, seed: 1020,
    }), -0.05, 1.02, -1.33, [0, Math.PI / 2, 0]);
    // RWS ammunition chest and independent day/thermal sensor block.
    P.add('turretDetail', box(0.22, 0.18, 0.15), -0.31, 1.02, -1.33);
    P.add('turretDark', box(0.16, 0.12, 0.025), 0.24, 1.07, -1.235);
    P.add('turretGlass', box(0.055, 0.055, 0.014), 0.20, 1.09, -1.218);
    P.add('turretGlass', box(0.038, 0.038, 0.014), 0.27, 1.04, -1.218);
  } else {
    const cx = -0.05, cy = 0.735, cz = -1.26;
    P.addEquipment('turret', box(0.62, 0.040, 0.50), cx, cy + 0.020, cz);
    P.addEquipment('turretDark', cylY(0.205, 0.215, 0.055, 18),
      cx, cy + 0.0675, cz);
    P.addEquipment('turret', cylY(0.145, 0.175, 0.15, 16),
      cx, cy + 0.17, cz);
    P.addEquipment('turretDark', box(0.42, 0.035, 0.34),
      cx, cy + 0.26, cz + 0.02);
    P.addEquipment('turret', box(0.44, 0.20, 0.38),
      cx, cy + 0.36, cz + 0.08);
    for (const s of [-1, 1]) {
      P.addEquipment('turretDark', box(0.035, 0.22, 0.34),
        cx + s * 0.235, cy + 0.36, cz + 0.08);
    }
    // Day/thermal head is carried on the forward face, clear of the gun.
    P.addEquipment('turretDark', box(0.22, 0.20, 0.18),
      cx + 0.17, cy + 0.37, cz + 0.31);
    P.addEquipment('turretGlass', box(0.070, 0.060, 0.014),
      cx + 0.13, cy + 0.40, cz + 0.407);
    P.addEquipment('turretGlass', box(0.050, 0.045, 0.014),
      cx + 0.21, cy + 0.35, cz + 0.407);
    P.addEquipment('turretDetail', box(0.18, 0.16, 0.24),
      cx - 0.28, cy + 0.35, cz - 0.02);
    const crowsGun = FITTINGS.pintleMG({
      mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.78,
      elev: 0.05, ammo: false, shield: false, seed: 1058,
    });
    crowsGun.name = 'pl01_105_crows_weapon';
    crowsGun.position.set(cx, cy + 0.27, cz + 0.06);
    P.turretG.add(crowsGun);
    P.turretG.userData.pl01RemoteStation = 'forward-crows';
  }

  // smoke banks: recessed multi-tube blocks on the tail deck (print
  // ExplosionTubes — held under the roof band)
  for (const s of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.035, len: 0.24, splay: s * 0.92,
      pitch: -0.35, arc: 0.48, spacing: 0.078, slot: 'detail',
      rotation: [0, s * 0.12, -s * 0.06], seed: 1030 + (s > 0 ? 1 : 0),
    }), s * 0.42, 0.60, -1.78);
  }
  // conformal stub antennas on the tail facet (the real PL-01 carries no
  // whips — stealth conformal; stubs stay under the 2.79 roof line — r5
  // dims receipt: a 0.26 stub owned heightM's p95 column at 2.89)
  polishWhips(P, [[-0.30, 0.40, -2.32, 0.16, -0.04], [0.30, 0.39, -2.44, 0.13, 0.05]], 1040);

  // ---- gun: angular thermal cover + bare tube to the published muzzle -----
  // axis world 2.33 (pivot 2.07 + 0.26); gun pivot world z 0.55.
  // The root sleeve now overlaps the turret nose by 10 cm; its cover then
  // runs forward as one pitch-owned assembly to the bare tube.
  P.addGunExtra(box(0.56, 0.42, 0.90), 0, 0.045, 0.80);            // root sleeve
  P.addGunExtra(orientedSlab(
    [-0.235, -0.12, 1.25], [0.235, -0.12, 1.25], [0.20, -0.115, 3.25], [-0.20, -0.115, 3.25],
    [-0.235, 0.27, 1.25], [0.235, 0.27, 1.25], [0.20, 0.185, 3.25], [-0.20, 0.185, 3.25]));
  P.addGunExtraDark(box(0.38, 0.03, 0.05), 0, 0.225, 2.10);        // cover spine seam
  P.addGunExtraDark(box(0.42, 0.36, 0.03), 0, 0.03, 3.262);        // cover end plate
  // Armored coaxial 7.62 mm fairing and visible receiver beside the main
  // weapon. It follows gun pitch and gives the angular mantlet a second
  // functional layer instead of a single uninterrupted cover.
  P.addGunExtra(box(0.15, 0.16, 0.52), 0.31, 0.015, 0.82);
  P.addGunExtraDark(box(0.105, 0.095, 0.30), 0.31, 0.025, 0.93);
  P.addGunExtraDark(cylZ(0.016, 0.82, 10), 0.31, 0.025, 1.48);
  P.addGunExtraDark(cylZ(0.023, 0.065, 10), 0.31, 0.025, 1.91);
  const mainTubeR = is105 ? 0.086 : 0.098;
  tubeGun(P, [
    [3.26, 4.20, mainTubeR, mainTubeR * 0.96],
    [4.20, 4.24, mainTubeR * 1.06, mainTubeR * 1.06],
    [4.24, 4.60, mainTubeR * 0.96, mainTubeR * 0.94],
    [4.60, 4.71, mainTubeR * 1.02, mainTubeR * 1.02],
  ], { rings: [[4.22, mainTubeR * 1.08], [4.63, mainTubeR * 1.05]], muzzle: 4.71 });
  muzzleBore(P, { r: mainTubeR * 0.90, boreR: mainTubeR * 0.59 });
  const hullMark = P.spec.visual.number || (is105 ? 'PL-105' : 'PL-01');
  P.decal('hull', 'number', hullMark, 0.26, [-1.906, 1.62, -0.60], -Math.PI / 2);
  P.decal('hull', 'number', hullMark, 0.26, [1.906, 1.62, -0.60], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

export const POLAND_PROFILES = {
  t72m1_jaguar: { build: buildT72M1Jaguar },
  pt91_twardy: { build: buildPT91Twardy },
  pl01: { build: buildPL01 },
  pl01_105: { build: buildPL01 },
};
