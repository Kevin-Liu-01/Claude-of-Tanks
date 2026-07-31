// Merkava family procedural profiles (fidelity oracles: merkava4_arlassar
// plus recovered merkava1b..merkava4b marks). Owned by the Merkava agent.
//
// Every mark here is a bespoke original primitive reconstruction fitted to
// the width-normalized silhouettes of the LOCAL reference GLBs (measured via
// tools/procedural-fidelity.html mask renders) plus published Merkava
// dimensions — see docs/references/tanks/merkava*.md. No source mesh data is
// extracted, traced or embedded.
//
// Shared architecture (all marks): front engine with FRONT drive sprocket,
// 6 road wheels, long pointed nose (short visible gun overhang), aft-set
// turret, rear hull clamshell door, turret bustle basket + ball-and-chain
// curtain, deep scalloped side skirts on Mk.2D+ (Mk.1B keeps exposed gear
// under a narrow fender line).
import { KIT } from './kit.js';

// ---------------------------------------------------------------------------
// Chassis: hull body, glacis stack, rear slope, skirts, running gear, deck kit
// ---------------------------------------------------------------------------
function merkavaChassis(P, c) {
  const { box, cylZ, slab, headlight, towCable, liftEye, periscope,
    buildRunningGear } = KIT;
  const w = c.width, hw = w / 2;
  const innerW = w - 2 * c.trackW - 0.06, ihw = innerW / 2;
  const nHW = c.noseHW ?? hw * 0.30;
  const ghw = hw * 0.985;

  // Belly / lower center body between the tracks.
  P.add('hull', box(innerW, c.trackTop - c.bellyY + 0.10, c.lowerEndZ - c.tailZ - 0.25),
    0, (c.trackTop + c.bellyY) / 2 + 0.05, (c.lowerEndZ + c.tailZ) / 2 + 0.1);
  // Full-width sponson body from the glacis break back to the rear slope.
  P.add('hull', box(w * 0.985, c.deckY - c.sponsonBotY, c.glacisEndZ - c.rearDeckZ),
    0, (c.deckY + c.sponsonBotY) / 2, (c.glacisEndZ + c.rearDeckZ) / 2);

  // Upper glacis + nose wedge: one solid from the blunt nose tip edge back to
  // the deck line, tapering in plan to the narrow Merkava prow.
  P.add('hull', slab(
    [-nHW, c.noseBotY, c.noseZ], [nHW, c.noseBotY, c.noseZ],
    [ghw, c.trackTop - 0.12, c.glacisEndZ], [-ghw, c.trackTop - 0.12, c.glacisEndZ],
    [-nHW, c.noseTopY, c.noseZ - 0.02], [nHW, c.noseTopY, c.noseZ - 0.02],
    [ghw, c.deckY, c.glacisEndZ], [-ghw, c.deckY, c.glacisEndZ]));
  // Lower glacis from the nose bottom edge down to the belly front.
  P.add('hull', slab(
    [-ihw, c.bellyY, c.lowerEndZ], [ihw, c.bellyY, c.lowerEndZ],
    [ihw, c.bellyY, c.lowerEndZ - 0.55], [-ihw, c.bellyY, c.lowerEndZ - 0.55],
    [-nHW, c.noseBotY, c.noseZ], [nHW, c.noseBotY, c.noseZ],
    [nHW, c.noseBotY + 0.02, c.noseZ - 0.45], [-nHW, c.noseBotY + 0.02, c.noseZ - 0.45]));
  // Rear slope + tail plate (clamshell troop door lives on the tail face).
  const rhw = hw * 0.94;
  P.add('hull', slab(
    [-rhw, c.tailBotY, c.tailZ + 0.02], [rhw, c.tailBotY, c.tailZ + 0.02],
    [rhw, c.trackTop - 0.05, c.rearDeckZ], [-rhw, c.trackTop - 0.05, c.rearDeckZ],
    [-rhw, c.tailTopY, c.tailZ], [rhw, c.tailTopY, c.tailZ],
    [rhw, c.deckY, c.rearDeckZ], [-rhw, c.deckY, c.rearDeckZ]));

  // Clamshell door seams + hinges + taillights on the tail plate.
  // shaded-parity r1 systemic 3 (applied family-wide): the tail carried only
  // painted leaf plates — real Merkava doors read via dark seam recesses,
  // vertical hinge barrels on the outer edges and a latch handle stack.
  const doorMidY = (c.tailTopY + c.tailBotY) / 2;
  P.add('hullDark', box(0.035, (c.tailTopY - c.tailBotY) * 0.82, 0.05),
    0, doorMidY, c.tailZ - 0.015);
  P.add('hullDark', box(w * 0.30, 0.03, 0.05), 0, c.tailBotY + 0.06, c.tailZ - 0.015);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, (c.tailTopY - c.tailBotY) * 0.72, 0.05),
      s * 0.24, doorMidY, c.tailZ - 0.03);
    // dark recess seam around each leaf so the door separates from the plate
    P.add('hullDark', box(0.020, (c.tailTopY - c.tailBotY) * 0.74, 0.045),
      s * 0.42, doorMidY, c.tailZ - 0.025);
    P.add('hullDetail', box(0.06, 0.09, 0.07), s * 0.52, c.tailTopY - 0.10, c.tailZ - 0.02);
    P.add('hullDark', box(0.13, 0.07, 0.04), s * (rhw - 0.28), c.tailTopY - 0.06, c.tailZ - 0.02);
    // vertical hinge barrels (2 per leaf) on the outer door edge
    for (const hy of [doorMidY + 0.16, doorMidY - 0.16]) {
      P.add('hullDetail', KIT.cylY(0.026, 0.026, 0.13, 8), s * 0.435, hy, c.tailZ - 0.045);
    }
    // latch handle + lock plate beside the center seam
    P.add('hullDark', box(0.035, 0.10, 0.035), s * 0.09, doorMidY + 0.02, c.tailZ - 0.055);
    P.add('hullDetail', box(0.07, 0.05, 0.03), s * 0.09, doorMidY - 0.08, c.tailZ - 0.045);
  }

  // Deck furniture: driver hatch (front LEFT), periscopes, intake/exhaust
  // louvres on the right, lift eyes, headlight brackets, glacis tow cable.
  const glacisRx = -(c.deckY - c.noseTopY) / (c.noseZ - c.glacisEndZ);
  const dhZ = c.glacisEndZ + (c.noseZ - c.glacisEndZ) * 0.22;
  const dhY = c.deckY - (c.deckY - c.noseTopY) * 0.16;
  P.add('hull', box(0.52, 0.05, 0.58), -w * 0.20, dhY + 0.01, dhZ, glacisRx, 0, 0);
  // dark hatch rim seam so the driver plate reads as an opening, not a decal
  P.add('hullDark', box(0.55, 0.018, 0.61), -w * 0.20, dhY + 0.005, dhZ, glacisRx, 0, 0);
  periscope(P, 'hullDetail', -w * 0.20, dhY + 0.06, dhZ - 0.42);
  // Engine intake louvre bank ON the glacis slope right of the driver.
  // shaded-parity r2 (family): the old deck-level bank sat flush against the
  // turret cheek and read as a "comb growing from the casting" — the oracle
  // grilles sit forward of the ring, on the slope. Mk.4 marks carry their
  // louvres on the intake hump instead (c.hump), so this bank is skipped.
  if (!c.hump) {
    const lvZ = c.glacisEndZ + (c.noseZ - c.glacisEndZ) * 0.30;
    const lvY = c.deckY + (lvZ - c.glacisEndZ) * glacisRx + 0.014;
    P.add('hullDark', box(w * 0.24, 0.020, 0.78), w * 0.225, lvY, lvZ, glacisRx, 0, 0);
    for (let i = 0; i < 6; i++) {
      const fz = lvZ + 0.29 - i * 0.115;
      P.add('hullDetail', box(w * 0.22, 0.024, 0.040),
        w * 0.225, lvY + 0.016 + (fz - lvZ) * glacisRx, fz, glacisRx, 0, 0);
    }
  }
  // rear deck extraction grille (left) — dark well + transverse lips
  P.add('hullDark', box(w * 0.30, 0.02, 0.55), -w * 0.20, c.deckY + 0.015, c.rearDeckZ + 0.55);
  for (let i = 0; i < 4; i++) {
    P.add('hullDetail', box(w * 0.27, 0.026, 0.04),
      -w * 0.20, c.deckY + 0.028, c.rearDeckZ + 0.35 + i * 0.135);
  }
  // fuel filler caps along the right deck edge
  for (const fz of [c.rearDeckZ + 0.35, c.rearDeckZ + 0.95]) {
    P.add('hullDetail', KIT.cylY(0.055, 0.055, 0.035, 10), w * 0.38, c.deckY + 0.02, fz);
  }
  liftEye(P, 'hullDetail', -w * 0.36, c.deckY + 0.02, c.rearDeckZ + 0.35);
  liftEye(P, 'hullDetail', w * 0.36, c.deckY + 0.02, c.rearDeckZ + 0.35);
  // Headlight pods: armored bases + wrap-over brush-guard bars (the KIT drum
  // alone read as a painted dot — systemic 6, empty glacis).
  for (const s of [-1, 1]) {
    const hx = s * w * 0.33, hy = c.noseTopY + 0.12, hz = c.noseZ - 0.35;
    P.add('hullDetail', box(0.17, 0.11, 0.12), hx, hy - 0.015, hz - 0.09);
    headlight(P, hx, hy, hz, -0.3, 0.05);
    // brush guard: two side bars + top bow standing proud of the lens
    P.add('hullDark', box(0.016, 0.13, 0.15), hx - 0.085, hy, hz - 0.02, -0.3, 0, 0);
    P.add('hullDark', box(0.016, 0.13, 0.15), hx + 0.085, hy, hz - 0.02, -0.3, 0, 0);
    P.add('hullDark', box(0.185, 0.016, 0.15), hx, hy + 0.065, hz - 0.02, -0.3, 0, 0);
    // towing clevis at the nose toe — bracket plate + side lugs + cross pin.
    // shaded-parity r2 (merkava2b #5): the old upright torus ring read as a
    // dark "cannon bore" porthole on the lit glacis; no Merkava bow carries
    // a ring that size — the real fitting is a compact shackle bracket.
    const tx = s * nHW * 0.85, tyE = c.noseBotY + 0.07;
    P.add('hullDetail', box(0.11, 0.08, 0.045), tx, tyE, c.noseZ - 0.045);
    for (const ls of [-1, 1]) {
      P.add('hullDetail', box(0.028, 0.075, 0.085), tx + ls * 0.045, tyE - 0.005, c.noseZ + 0.015);
    }
    P.add('hullDark', KIT.cylX(0.018, 0.10, 8), tx, tyE - 0.012, c.noseZ + 0.042);
  }
  towCable(P, [[-w * 0.26, c.noseTopY + 0.16, c.noseZ - 0.6],
    [0, c.noseTopY + 0.30, c.noseZ - 0.28],
    [w * 0.26, c.noseTopY + 0.16, c.noseZ - 0.6]]);
  // Mk.4 family: raised driver-station spine forward of the hatch (the hump
  // line the oracle glacis carries left of the engine intake).
  if (c.driverHump) {
    P.add('hull', box(0.50, 0.042, 1.00), -w * 0.20, dhY + 0.03 + (c.noseZ - dhZ) * 0.32 * glacisRx,
      dhZ + (c.noseZ - dhZ) * 0.32, glacisRx, 0, 0);
  }
  // Exhaust outlet grille on the RIGHT sponson face behind the engine bay.
  const exTop = c.deckY - 0.06, exBot = (c.skirt ? c.skirt.top : c.trackTop) + 0.05;
  if (exTop - exBot > 0.10) {
    const exY = (exTop + exBot) / 2, exZ = c.glacisEndZ - 0.55;
    P.add('hullDark', box(0.02, exTop - exBot, 0.62), w * 0.4925 + 0.006, exY, exZ);
    for (let i = 0; i < 4; i++) {
      P.add('hullDetail', box(0.028, (exTop - exBot) * 0.86, 0.045),
        w * 0.4925 + 0.010, exY, exZ - 0.24 + i * 0.16);
    }
  }

  // Front engine intake hump (Mk.4 family): raised louvred box right of the
  // driver with a lipped forward edge.
  if (c.hump) {
    const h = c.hump;
    const hx = (h.x0 + h.x1) / 2, hwd = h.x1 - h.x0;
    // faceted intake housing: raked front + slight plan taper toward the top
    // (same silhouette envelope as a box, reads as armor instead of a crate)
    P.add('hull', KIT.xform(slab(
      [-hwd / 2, c.deckY - 0.10, h.z1 - 0.30], [hwd / 2, c.deckY - 0.10, h.z1 - 0.30],
      [hwd / 2, c.deckY - 0.10, h.z0], [-hwd / 2, c.deckY - 0.10, h.z0],
      [-hwd / 2 + 0.04, h.top, h.z1], [hwd / 2 - 0.04, h.top, h.z1],
      [hwd / 2 - 0.04, h.top, h.z0 + 0.06], [-hwd / 2 + 0.04, h.top, h.z0 + 0.06]), hx, 0, 0));
    P.add('hullDark', box(hwd * 0.82, 0.02, (h.z1 - h.z0) * 0.80), hx, h.top + 0.012, (h.z0 + h.z1) / 2);
    for (let i = 0; i < 5; i++) {
      P.add('hullDetail', box(hwd * 0.78, 0.026, 0.05), hx, h.top + 0.028, h.z1 - 0.16 - i * ((h.z1 - h.z0 - 0.3) / 4));
    }
  }

  // Running gear: FRONT sprocket (signature), 6 wheels, high rear idler.
  // xc keeps the sprocket/idler carrier rings (track-band edge + 3.5 cm)
  // exactly at the design width — anything wider silently rescales the whole
  // tank in the fidelity lab's width normalization.
  const xc = hw - c.trackW / 2 - 0.036;
  buildRunningGear(P, {
    style: 'rubber', wheelR: c.wheelR, wheelW: Math.min(0.23, c.trackW * 0.37),
    wheelY: c.wheelR + 0.07, xc,
    wheelZs: c.wheelZs,
    sprocket: { z: c.sprocket.z, y: c.sprocket.y, r: c.sprocket.r },
    idler: { z: c.idler.z, y: c.idler.y, r: c.idler.r },
    rollers: c.rollers.map((z) => ({ z, y: c.trackTop - 0.10, r: 0.075 })),
    trackW: c.trackW, topY: c.trackTop - 0.02, paintedEnds: true,
    coveredTop: c.skirt ? true : c.trackTop - 0.04, arms: !c.skirt,
    // shaded-parity r1 systemic 1 (flat-disc wheels): the Merkava wheel is a
    // fat rubber tire around a prominent dished hub — pull the painted dish
    // in so the dark tire band + recess annulus + bolt ring actually read.
    dishR: c.dishR ?? 0.78,
  });

  if (c.skirt) {
    const sk = c.skirt;
    const sx = hw - 0.036;
    for (const s of [-1, 1]) {
      P.add('hull', box(0.052, sk.top - sk.bot, sk.z0 - sk.z1), s * sx, (sk.top + sk.bot) / 2, (sk.z0 + sk.z1) / 2);
      // scallop drop tabs between the wheel stations (only where the oracle
      // skirts hang lower between wheels, showing arcs of wheel below the hem)
      if (sk.scallop) for (let i = 0; i < c.wheelZs.length - 1; i++) {
        const z = (c.wheelZs[i] + c.wheelZs[i + 1]) / 2;
        P.add('hull', box(0.052, 0.22, Math.abs(c.wheelZs[i] - c.wheelZs[i + 1]) * 0.74),
          s * (sx + 0.004), sk.bot - 0.08, z);
      }
      // panel seams + hanger bolts + rubber hem
      const panels = 7;
      for (let i = 0; i <= panels; i++) {
        const pz = sk.z0 - i * ((sk.z0 - sk.z1) / panels);
        P.add('hullDark', box(0.058, (sk.top - sk.bot) * 0.86, 0.02),
          s * (sx + 0.004), (sk.top + sk.bot) / 2, pz);
        // dark hanger bolt head at the top of every seam (bolted-skirt read)
        if (i < panels) {
          P.add('hullDark', KIT.cylX(0.024, 0.022, 8),
            s * (sx + 0.024), sk.top - 0.09, pz - ((sk.z0 - sk.z1) / panels) / 2);
        }
      }
      // flush rubber hem lip over the lower skirt edge (material break only —
      // it does NOT hang below the fitted hem, so the silhouette is untouched)
      P.add('hullRubber', box(0.026, 0.12, sk.z0 - sk.z1), s * (sx + 0.017), sk.bot + 0.04, (sk.z0 + sk.z1) / 2);
      if (sk.fringe) P.add('hullRubber', box(0.03, 0.10, sk.z0 - sk.z1), s * (sx + 0.01), sk.bot - 0.10, (sk.z0 + sk.z1) / 2);
      // front fender board from the skirt lead over the drive sprocket: the
      // oracle runs plates to the nose corner — without it the tapering nose
      // opens a see-through slot and the FAR sprocket's hub bolt ring reads
      // as a phantom "dotted porthole" floating on the glacis.
      const ffTip = c.sprocket.z + c.sprocket.r + 0.25;
      if (ffTip > sk.z0 + 0.05) {
        P.add('hull', box(0.50, 0.045, ffTip - sk.z0), s * (sx - 0.25), sk.top - 0.02, (sk.z0 + ffTip) / 2);
        P.add('hullRubber', box(0.44, 0.15, 0.03), s * (sx - 0.25), sk.top - 0.115, ffTip + 0.01, -0.30, 0, 0);
      }
      // mud flaps
      if (sk.flaps !== false) {
        P.add('hullRubber', box(0.30, 0.34, 0.035), s * (xc), sk.bot + 0.05, c.sprocket.z + c.sprocket.r + 0.16, -0.12, 0, 0);
      }
      P.add('hullRubber', box(0.30, 0.30, 0.035), s * (xc), sk.bot + 0.02, c.idler.z - c.idler.r - 0.12, 0.12, 0, 0);
    }
  } else if (c.fenderY) {
    // Mk.1: narrow fender line over exposed running gear.
    for (const s of [-1, 1]) {
      P.add('hull', box(0.07, 0.075, c.noseZ - c.tailZ - 0.7), s * (hw - 0.05), c.fenderY, (c.noseZ + c.tailZ) / 2 + 0.1);
      for (let i = 0; i < 5; i++) {
        P.add('hullDetail', box(0.075, 0.05, 0.14), s * (hw - 0.05), c.fenderY - 0.05, c.noseZ - 1.3 - i * 1.05);
      }
    }
  }

  // Rear hull stowage rail rows above the tail plate.
  if (c.rearRail !== false) {
    const r0 = c.rearRailY0 ?? c.tailTopY + 0.10, r1 = c.rearRailY1 ?? c.tailTopY + 0.32;
    const rz = c.rearRailZ ?? c.tailZ + 0.13;
    P.add('hull', box(w * 0.62, 0.035, 0.035), 0, r0, rz - 0.03);
    P.add('hull', box(w * 0.62, 0.035, 0.035), 0, r1, rz + 0.03);
    for (let i = 0; i < 5; i++) {
      P.add('hull', box(0.03, r1 - r0 + 0.05, 0.03), -w * 0.31 + i * (w * 0.155), (r0 + r1) / 2, rz);
    }
    if (c.rearRack) {
      P.add('hull', box(w * 0.58, c.rearRack.h, c.rearRack.d), 0, c.rearRack.y, c.rearRack.z);
    }
  }
  // Rear corner stowage bins on the fenders (Mk.4 family).
  if (c.cornerBins) {
    for (const s2 of [-1, 1]) {
      P.add('hull', box(0.5, c.cornerBins.h, c.cornerBins.d),
        s2 * (hw - 0.32), c.cornerBins.y, c.cornerBins.z);
    }
  }
  // Some oracles carry a hull rack/tow-frame past the tail plate — the hull
  // mask length keys the gun/hull metrics, so mirror the measured extent.
  if (c.tailRackZ !== undefined) {
    P.add('hull', box(w * 0.46, 0.05, c.tailZ - c.tailRackZ + 0.06), 0, c.tailTopY - 0.04, (c.tailZ + c.tailRackZ) / 2);
    P.add('hull', box(w * 0.46, 0.42, 0.05), 0, c.tailTopY - 0.26, c.tailRackZ + 0.05);
  }
}

// ---------------------------------------------------------------------------
// Mk.1/2 turret: small aft-set casting — rounded-front wedge, roof rising to
// the rear, long bustle with the BIG rear basket + ball-and-chain curtain.
// All coordinates are turret-local (pivot at hull deck, p.pivotZ).
//
// SCORING NOTE (fidelity lab): the old LOD mask bug (detail buckets bleeding
// between the hull/turret passes) is FIXED — the lab pins every LOD to level
// 0, so turretDark/turretDetail/turretCloth geometry is mask-safe and scores
// identically to the plain bucket. Fittings now build in their real
// materials (shaded-parity r1 systemic 2, "one clay material per tank"):
// gunmetal chains/rails/MGs, cloth stowage, glass optics.
// ---------------------------------------------------------------------------
function merkavaSmallTurret(P, t) {
  const { box, cylY, polyTurret, slab } = KIT;
  const apex = t.apexZ, roofF = t.roofFrontZ, roofR = t.roofRearZ;
  const rearZ = t.shellRearZ;
  const h = t.roofH;             // roof height at the FRONT edge
  const hR = t.roofRearH;        // roof height at the REAR (higher)
  const hwM = t.hwMax, gy = t.apexY;
  const sf = apex - 0.45;        // full-height casting starts here

  // Shell: ONE compact low casting from the cheek shoulders back to the
  // integral bustle rear. shaded-parity r2 (family): the old build stacked a
  // separate full-width bustle box + solid basket bin behind the shell — the
  // "drawer cabinet" read that dragged the visual mass aft of the print's
  // small forward turret. The casting now ends at the measured bustle rear
  // and everything behind it is open basket frame.
  const inset = t.roofInset ?? 0.66;
  P.add('turret', polyTurret([
    [-hwM * 0.44, sf], [hwM * 0.44, sf],
    [hwM * 0.80, sf - 0.55], [hwM, sf - 1.15],
    [hwM * 0.99, rearZ + 0.75], [hwM * 0.82, rearZ],
    [-hwM * 0.82, rearZ], [-hwM * 0.99, rearZ + 0.75],
    [-hwM, sf - 1.15], [-hwM * 0.80, sf - 0.55],
  ], h, 1.0, inset));
  // Cast cheek beak: partial-height prow converging on the gun rotor
  // (oracle 1B: cheek tip y 1.8..2.2 — a band around the gun axis, NOT a
  // full-height wall). ONE continuous plane per side running the full rake
  // from the notch to the roof shoulder (ending at the shell's top ring —
  // stopping at the base ring left a hidden trench behind the beak).
  const czS = ((sf) + (sf - 0.55) + (sf - 1.15) + (rearZ + 0.75) + rearZ) / 5;
  const bkR = czS + (sf - czS) * inset + 0.08;
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.12, gy - 0.34, apex], [s * 0.30, gy - 0.31, apex - 0.03],
      [s * hwM * 0.62, 0.05, bkR + 0.05], [s * 0.06, 0.05, bkR + 0.05],
      [s * 0.12, gy + 0.25, apex], [s * 0.30, gy + 0.22, apex - 0.03],
      [s * hwM * 0.56, h - 0.02, bkR], [s * 0.06, h - 0.02, bkR]));
  }
  // notch chin bridge under the rotor path (closes the see-through slot)
  P.add('turret', box(0.34, 0.12, apex - bkR + 0.08), 0, gy - 0.33, (apex + bkR) / 2);

  // Roof plateau, rising slightly to the rear (Mk.1/2 signature).
  P.add('turret', slab(
    [-t.roofHW * 0.94, h - 0.05, roofF], [t.roofHW * 0.94, h - 0.05, roofF],
    [t.roofHW, h - 0.05, roofR], [-t.roofHW, h - 0.05, roofR],
    [-t.roofHW * 0.90, h + 0.005, roofF], [t.roofHW * 0.90, h + 0.005, roofF],
    [t.roofHW * 0.96, hR, roofR], [-t.roofHW * 0.96, hR, roofR]));

  // Soft stowage lashed over the rear casting (the oracle bustle carries
  // tarp/bag mounds, not crates): irregular cloth mounds + thin straps.
  const stZ0 = roofR - 0.02, stZ1 = t.bustleZ1;
  const stMid = (stZ0 + stZ1) / 2, stLen = stZ0 - stZ1;
  const stT = t.bustleTop, stB = hR - 0.14;
  P.add('turretCloth', box(hwM * 1.50, stT - stB, stLen * 0.85), -hwM * 0.10, (stT + stB) / 2, stMid);
  P.add('turretCloth', box(hwM * 0.85, (stT - stB) * 0.62, stLen * 0.52), hwM * 0.44, stB + (stT - stB) * 0.28, stMid - 0.04);
  for (const f of [-0.30, 0.24]) {
    P.add('turretDark', box(hwM * 1.52, stT - stB + 0.02, 0.018), -hwM * 0.10, (stT + stB) / 2, stMid + f * stLen);
  }

  // Open pipe-frame basket + coiled cable + ball-and-chain curtain.
  merkavaBasket(P, {
    hw: t.basketHW, z0: t.basketZ0, z1: t.basketZ1,
    top: t.basketTop, bot: t.basketBot,
    coil: hwM * 0.26, chainDrop: t.chainDrop ?? 0.34, chainGap: t.chainGap,
  });

  // Roof kit (the print's roof is busy at garage range): commander cupola
  // with dome lid + pintle MG (left), gunner hatch disc + second 7.62
  // (right), internal-mortar lid, sight hood, periscopes, utility mast.
  const cz = t.cupolaZ;
  KIT.cupola(P, 'turret', t.cupolaX, hR - 0.02, cz, 0.25, 0.18, 6);
  P.add('turret', KIT.sph(0.175, 14, Math.PI * 0.55), t.cupolaX, hR + 0.17, cz);
  merkavaMG(P, t.cupolaX + 0.30, hR + 0.10, cz - 0.18, 0.85);
  P.add('turret', cylY(0.19, 0.19, 0.045, 12), -t.cupolaX * 0.9, hR - 0.01, cz + 0.05);
  P.add('turret', box(0.07, 0.05, 0.09), -t.cupolaX * 0.9 + (t.cupolaX > 0 ? -0.20 : 0.20), hR + 0.005, cz + 0.05);
  merkavaMG(P, -t.cupolaX * 0.75, hR + 0.02, cz - 0.32, 0.68);
  // 60 mm mortar: internal on the Mk.2 — a round roof lid, not a box
  P.add('turret', cylY(0.11, 0.12, 0.035, 10), t.cupolaX * 0.5, h + 0.02, roofF - 0.24);
  // gunner's sight hood with glass slit (right-front, ON the plateau)
  P.add('turret', box(0.30, 0.13, 0.26), -t.cupolaX * 0.55, h + 0.05, roofF - 0.16);
  P.add('turretGlass', box(0.20, 0.055, 0.02), -t.cupolaX * 0.55, h + 0.06, roofF - 0.02);
  KIT.periscope(P, 'turretDetail', t.cupolaX * 0.35, h + 0.02, cz + 0.34);
  KIT.periscope(P, 'turretDetail', -t.cupolaX * 0.55, h + 0.02, cz + 0.18);
  // thin utility mast on the rear roof (the print's mid spike)
  P.add('turretDetail', box(0.05, 0.06, 0.05), -0.22, hR + 0.02, roofR + 0.12);
  P.add('turretDark', box(0.018, 1.15, 0.018), -0.22, hR + 0.60, roofR + 0.12);
  // smoke discharger cluster ON the port cheek plane by the roof edge
  // (r2: real Merkavas carry small discrete clusters port-side — never
  // roof-crest combs)
  merkavaSmokeCluster(P, -0.46, gy + 0.25 + 0.60 * (h - 0.27 - gy), apex - 0.55, -0.55, 5,
    { pitch: -0.34 });
}

// Pintle MG in gunmetal (mask-safe — see scoring note): post, receiver with
// ammo box, barrel with a flash-hider step.
function merkavaMG(P, x, y, z, s = 1) {
  const { box, cylZ } = KIT;
  P.add('turretDark', box(0.035 * s, 0.20 * s, 0.035 * s), x, y + 0.10 * s, z);
  P.add('turretDark', box(0.09 * s, 0.09 * s, 0.44 * s), x, y + 0.24 * s, z);
  P.add('turretDark', box(0.12 * s, 0.10 * s, 0.16 * s), x - 0.09 * s, y + 0.23 * s, z - 0.06 * s);
  P.add('turretDark', cylZ(0.02 * s, 0.5 * s, 8), x, y + 0.26 * s, z + 0.42 * s);
  P.add('turretDark', cylZ(0.028 * s, 0.07 * s, 8), x, y + 0.26 * s, z + 0.64 * s);
}

// Discrete smoke-grenade cluster snugged onto the PORT cheek plane.
// shaded-parity r2 (family artifact kill): the old merkavaSmoke spread a
// full-width row of tubes along the roof crest — a "discharger comb" no
// Merkava carries. The real CL-3030 fit is a compact rosette of short tube
// mouths on the left cheek: a small body-tone tray on the 1/2-series cast
// cheeks, a shallow recessed bay on the 4-series cheek tops (opts.recessed
// — mouths only, half-sunk, so nothing reads as a toothed box).
function merkavaSmokeCluster(P, x, y, z, yaw = 0, n = 5, opts = {}) {
  const { box, cylY } = KIT;
  const pitch = opts.pitch ?? -0.30;
  const tubeL = opts.recessed ? 0.09 : 0.15;
  const lift = opts.recessed ? 0.015 : 0.035;
  if (opts.recessed) {
    P.add('turretDark', box(0.30, 0.018, 0.20), x, y, z, pitch, yaw, 0);
  } else {
    P.add('turretDetail', box(0.36, 0.10, 0.20), x, y - 0.05, z, pitch, yaw, 0);
  }
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rows = [Math.ceil(n / 2), Math.floor(n / 2)];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < rows[r]; k++) {
      const u = (k - (rows[r] - 1) / 2) * 0.088;   // spread along the tray
      const v = (r - 0.5) * 0.078;                 // row offset across it
      P.add('turretDark', cylY(0.032, 0.036, tubeL, 8),
        x + cy * u + sy * v, y + lift + r * 0.012, z - sy * u + cy * v,
        pitch - 0.15, yaw, 0);
    }
  }
}

// Open pipe-frame stowage basket + ball-and-chain curtain (the rounded
// basket silhouette every mark carries behind the bustle). Gunmetal frame,
// sparse cloth kit visible through the rails, optional coiled cable disc on
// the rear face — replaces the r2 solid "panel bin" that read as furniture.
function merkavaBasket(P, b) {
  const { box } = KIT;
  const mid = (b.z0 + b.z1) / 2, len = b.z0 - b.z1;
  const midY = (b.top + b.bot) / 2;
  // floor pan
  P.add('turretDark', box(b.hw * 2 - 0.06, 0.035, len - 0.04), 0, b.bot + 0.02, mid);
  // top rail hoop + mid rail (sides + rear)
  for (const [ry, rw] of [[b.top, 0.045], [midY, 0.030]]) {
    for (const s of [-1, 1]) {
      P.add('turretDark', box(rw, rw, len), s * b.hw, ry, mid);
    }
    P.add('turretDark', box(b.hw * 2 + rw, rw, rw), 0, ry, b.z1 + rw / 2);
  }
  // posts: rear corners + rear mids + side mids + front corners
  for (const px of [-b.hw, -b.hw * 0.34, b.hw * 0.34, b.hw]) {
    P.add('turretDark', box(0.034, b.top - b.bot, 0.034), px, midY, b.z1 + 0.02);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.034, b.top - b.bot, 0.034), s * b.hw, midY, b.z0 - 0.04);
    P.add('turretDark', box(0.034, b.top - b.bot, 0.034), s * b.hw, midY, mid);
  }
  // cloth kit inside — lumps filling most of the frame (the oracle baskets
  // carry packed stowage) while the rim rails stay proud and open
  P.add('turretCloth', box(b.hw * 1.70, (b.top - b.bot) * 0.72, len * 0.80),
    -b.hw * 0.08, b.bot + (b.top - b.bot) * 0.40, mid);
  P.add('turretCloth', box(b.hw * 0.90, (b.top - b.bot) * 0.52, len * 0.52),
    b.hw * 0.42, b.bot + (b.top - b.bot) * 0.30, mid + len * 0.08);
  // coiled cable disc strapped to the rear frame
  if (b.coil) {
    P.add('turretDark', KIT.torus(0.14, 0.045, 18, 8), b.coil, midY + 0.04, b.z1 - 0.04,
      Math.PI / 2, 0, 0);
    P.add('turretDark', KIT.cylZ(0.05, 0.06, 10), b.coil, midY + 0.04, b.z1 - 0.04);
  }
  chainCurtain(P, b.hw * 0.92, b.z1 - (b.chainGap ?? 0.16), b.bot + 0.10, b.chainDrop ?? 0.32);
}

// ---------------------------------------------------------------------------
// Mk.3/Mk.4 modular wedge turret. shaded-parity r2 rebuild: the front cheeks
// rake back in ONE continuous plane per side from the narrow gun notch to
// the roof shoulders — no pillbox verticals, no bolt-on "gun-mount box".
// The gun emerges from the V-notch between the cheek planes on a small
// curved rotor collar; the bustle picks up flush behind the shell.
// ---------------------------------------------------------------------------
function merkavaModularTurret(P, t) {
  const { box, cylY, polyTurret, slab, frustum } = KIT;
  const apex = t.apexZ, hwM = t.hwMax;
  const h = t.roofH, hR = t.roofRearH ?? h, gy = t.apexY;
  const sf = t.shellFrontZ ?? apex * 0.48;   // full-height section starts here

  // Main wedge shell: continuous side planes to the shell rear.
  const inset = t.roofInset ?? 0.46;
  P.add('turret', polyTurret([
    [-t.notchHW * 1.4, sf], [t.notchHW * 1.4, sf],
    [hwM * 0.66, sf - (sf - t.maxWZ) * 0.48], [hwM, t.maxWZ],
    [hwM * 0.985, t.shellRearZ + 0.55], [hwM * 0.955, t.shellRearZ],
    [-hwM * 0.955, t.shellRearZ], [-hwM * 0.985, t.shellRearZ + 0.55],
    [-hwM, t.maxWZ], [-hwM * 0.66, sf - (sf - t.maxWZ) * 0.48],
  ], h, 1.0, inset));

  // Front cheek beak: ONE continuous raked plane per side from the narrow
  // gun notch all the way to the roof shoulders (the plane ends at the
  // shell's top ring; ending at the base ring left a hidden trench and a
  // two-plane read — the print's cheek is a single sweep, r2 family bullet).
  const czM = ((sf) + (sf - (sf - t.maxWZ) * 0.48) + t.maxWZ + (t.shellRearZ + 0.55) + t.shellRearZ) / 5;
  const bkR = czM + (sf - czM) * inset + 0.08;
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.10, gy - 0.36, apex], [s * (t.notchHW + 0.03), gy - 0.33, apex - 0.05],
      [s * hwM * 0.88, 0.05, bkR + 0.06], [s * 0.06, 0.05, bkR + 0.06],
      [s * 0.10, gy + 0.24, apex], [s * (t.notchHW + 0.03), gy + 0.21, apex - 0.05],
      [s * t.roofHW * 1.02, h - 0.02, bkR], [s * 0.06, h - 0.02, bkR]));
  }
  // notch chin bridge under the rotor path (closes the see-through slot)
  P.add('turret', box(t.notchHW * 2 + 0.12, 0.12, apex - bkR + 0.10), 0, gy - 0.35, (apex + bkR) / 2);
  t.bkR = bkR;   // kits anchor cheek fittings to the beak plane via this

  // Roof plateau + rear-roof slope running down to the bustle top — one
  // continuous crest line, no parapet step.
  P.add('turret', slab(
    [-t.roofHW * 0.94, h - 0.05, t.roofFrontZ], [t.roofHW * 0.94, h - 0.05, t.roofFrontZ],
    [t.roofHW * 1.02, h - 0.05, t.roofRearZ], [-t.roofHW * 1.02, h - 0.05, t.roofRearZ],
    [-t.roofHW * 0.90, h, t.roofFrontZ], [t.roofHW * 0.90, h, t.roofFrontZ],
    [t.roofHW, hR, t.roofRearZ], [-t.roofHW, hR, t.roofRearZ]));
  P.add('turret', slab(
    [-t.roofHW * 1.02, hR - 0.07, t.roofRearZ], [t.roofHW * 1.02, hR - 0.07, t.roofRearZ],
    [hwM * 0.82, t.bustleTop - 0.07, t.shellRearZ + 0.05], [-hwM * 0.82, t.bustleTop - 0.07, t.shellRearZ + 0.05],
    [-t.roofHW * 0.98, hR, t.roofRearZ], [t.roofHW * 0.98, hR, t.roofRearZ],
    [hwM * 0.78, t.bustleTop, t.shellRearZ + 0.05], [-hwM * 0.78, t.bustleTop, t.shellRearZ + 0.05]));

  // Bustle: flush continuation of the shell walls (matched base width,
  // near-vertical sides), overhanging the rear deck.
  P.add('turret', frustum(hwM * 0.955, t.shellRearZ + 0.30, t.bustleZ1, hwM * 0.86,
    t.shellRearZ + 0.26, t.bustleZ1 + 0.05, t.bustleBot, t.bustleTop));

  // Open basket + chains behind the bustle.
  if (t.basketZ0 !== undefined) {
    merkavaBasket(P, {
      hw: t.basketHW, z0: t.basketZ0, z1: t.basketZ1,
      top: t.basketTop, bot: t.basketBot,
      chainDrop: t.chainDrop ?? 0.30, chainGap: t.chainGap,
    });
  }

  // Roof kit: LOW fittings only (r2: "sight bumps currently boxes floating
  // proud"). Commander cupola ring; loader hatch disc on 3-series (the Mk.4
  // correctly has none); panoramic sight as a rounded pod; gunner's sight as
  // a low hood with a glass slit. MGs/smoke live in the per-mark kits.
  KIT.cupola(P, 'turret', t.cupolaX, h + (t.cupolaRaise ?? 0), t.cupolaZ, 0.24, 0.12, 6);
  if (!t.noLoaderHatch) {
    P.add('turret', cylY(0.20, 0.20, 0.05, 14), -t.cupolaX * 0.9, h - 0.02, t.cupolaZ + 0.10);
    P.add('turret', box(0.07, 0.05, 0.10), -t.cupolaX * 0.9 - (t.cupolaX > 0 ? 0.22 : -0.22), h, t.cupolaZ + 0.10);
  }
  if (t.pano) {
    P.add('turret', cylY(0.13, 0.15, 0.14, 12), t.pano.x, h + 0.07, t.pano.z);
    P.add('turret', KIT.sph(0.13, 12, Math.PI * 0.55), t.pano.x, h + 0.15, t.pano.z);
    P.add('turretGlass', box(0.13, 0.06, 0.02), t.pano.x, h + 0.13, t.pano.z + 0.125);
  }
  P.add('turret', box(0.32, 0.13, 0.30), t.sightX ?? 0.42, h + 0.045, t.roofFrontZ - 0.16);
  P.add('turretGlass', box(0.18, 0.05, 0.02), t.sightX ?? 0.42, h + 0.06, t.roofFrontZ - 0.005);
}

// Ball-and-chain curtain: irregular short drops with ball ends. GUNMETAL
// (turretDark is mask-safe post LOD-fix) — the curtain stays a scored part
// of the rear silhouette and articulates with the turret via turretG.
function chainCurtain(P, halfW, z, topY, drop) {
  const { box, sph } = KIT;
  // dark hanger rail the drops attach to (closes the visual gap between the
  // basket bottom and the chain tops at every yaw)
  P.add('turretDark', box(halfW * 2 + 0.06, 0.028, 0.028), 0, topY + 0.01, z);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const x = -halfW + i * (halfW * 2 / (n - 1));
    const d = drop + (i % 3) * 0.05;
    P.add('turretDark', box(0.016, d, 0.016), x, topY - d / 2, z);
    P.add('turretDark', sph(0.032, 8), x, topY - d - 0.02, z);
  }
}

// ---------------------------------------------------------------------------
// Family assembler: chassis + turret + rig seating + gun + insignia.
// ---------------------------------------------------------------------------
function buildMerkavaMark(P, p) {
  const { box, cylZ } = KIT;
  merkavaChassis(P, p);

  const pivotY = p.deckY + 0.02;
  P.turretG.position.set(0, pivotY, p.pivotZ);

  // Turret-local parameter block (world -> local).
  const L = (z) => z - p.pivotZ;
  const V = (y) => y - pivotY;
  const t = {
    apexZ: L(p.apexZ), apexY: V(p.gunAxisY),
    notchHW: p.notchHW ?? 0.30,
    roofH: V(p.roofY), roofRearH: p.roofRearY !== undefined ? V(p.roofRearY) : undefined,
    roofHW: p.roofHW ?? p.hwMax * 0.48,
    roofInset: p.roofInset,
    roofFrontZ: L(p.roofFrontZ), roofRearZ: L(p.roofRearZ),
    maxWZ: L(p.maxWZ), hwMax: p.hwMax,
    shellRearZ: L(p.shellRearZ),
    bustleZ1: L(p.bustleZ1),
    bustleTop: p.bustleTop !== undefined ? V(p.bustleTop) : V(p.roofY) - 0.03,
    bustleBot: p.bustleBot !== undefined ? V(p.bustleBot) : 0.04,
    basketZ0: p.basketZ0 !== undefined ? L(p.basketZ0) : undefined,
    basketZ1: p.basketZ1 !== undefined ? L(p.basketZ1) : undefined,
    basketTop: p.basketTop !== undefined ? V(p.basketTop) : undefined,
    basketBot: p.basketBot !== undefined ? V(p.basketBot) : undefined,
    basketHW: p.basketHW ?? p.hwMax * 0.66,
    chainDrop: p.chainDrop, chainGap: p.chainGap,
    shellFrontZ: p.shellFrontZ !== undefined ? L(p.shellFrontZ) : undefined,
    noLoaderHatch: p.noLoaderHatch,
    cupolaX: p.cupolaX ?? -0.52, cupolaZ: L(p.cupolaZ ?? (p.roofRearZ + 0.1)),
    cupolaRaise: p.cupolaRaise,
    pano: p.pano ? { x: p.pano.x, z: L(p.pano.z) } : null,
    sightX: p.sightX,
  };
  if (p.turretStyle === 'small') {
    merkavaSmallTurret(P, t);
  } else {
    merkavaModularTurret(P, t);
  }
  if (p.turretKit) p.turretKit(P, p, t);

  // Rear chain-rail tip (Mk.3D only): the 3D oracle hangs turret content
  // past the hull tail — the gun-overhang metric keys off that raw rear
  // sliver. Rebuilt as a chain rail + hanging drops (r2: the old bar +
  // plate skimmed the rear deck and read as loose furniture).
  if (p.rearTipZ !== undefined) {
    const tipZ = L(p.rearTipZ);
    const fromZ = t.basketZ1 ?? t.shellRearZ;
    // Mass and placement mirror the r2-measured oracle sliver EXACTLY: the
    // gun metric aligns its masks by combined centroid, so lightening or
    // raising this rear mass shifts the aligned barrel line and collapses
    // the front-overhang IoU (pass-1 lesson: 89 -> 70).
    const railY = (t.basketBot ?? 0.2) + 0.02;
    const tipH = p.rearTipH ?? 0.5;
    P.add('turretDark', box(0.05, 0.055, fromZ - tipZ), 0, railY, (fromZ + tipZ) / 2);
    // hanging chain-mat vane at the tip + drops in front for the close read
    P.add('turretDark', box(0.05, tipH, 0.12), 0, railY - tipH / 2 + 0.03, tipZ + 0.06);
    chainCurtain(P, 0.24, tipZ + 0.14, railY - 0.02, tipH * 0.55);
  }

  // Twin whip antennas on the bustle/basket rear corners (r2 merkava1b #3:
  // Merkava masts ride the turret bustle corners, never the hull deck).
  // Gunmetal whips on painted base fixtures with a mount stem dropping into
  // the frame below so the bases never float.
  const aH = p.antennaH ?? 1.7;
  const aX = p.antennaX ?? p.hwMax * 0.55;
  const aY = p.antennaY !== undefined ? V(p.antennaY) : (t.bustleTop ?? t.roofH);
  const aZs = [p.antennaZ1 !== undefined ? L(p.antennaZ1) : t.shellRearZ - 0.15,
    p.antennaZ2 !== undefined ? L(p.antennaZ2) : t.shellRearZ - 0.15];
  [-1, 1].forEach((s, i) => {
    P.add('turretDetail', box(0.10, 0.08, 0.10), s * aX, aY - 0.04, aZs[i]);
    P.add('turretDark', box(0.045, 0.30, 0.045), s * aX, aY - 0.22, aZs[i]);
    P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.10, 8), s * aX, aY + 0.04, aZs[i]);
    P.add('turretDark', KIT.cylY(0.020, 0.026, 0.09, 8), s * aX, aY + 0.11, aZs[i]);
    P.add('turretDark', box(0.022, aH, 0.022), s * aX, aY + aH / 2 - 0.02, aZs[i], 0, 0, s * 0.05);
  });

  // Gun: trunnions just behind the cheek apex; the Merkava nose is LONG so
  // the visible overhang past it stays short. Tube length is fitted so the
  // muzzle lands exactly on the oracle's tip.
  const gunZL = p.gunZL ?? 0.32;
  P.gunG.position.set(0, V(p.gunAxisY), gunZL);
  // +0.03: the tube geometry ends 0.02 short of len; the pad puts the
  // rendered tip on the oracle's muzzle.
  const gLen = p.gunTipZ - p.pivotZ - gunZL + 0.03;
  // Gun rotor: a SMALL curved collar the tube emerges from at the V-notch
  // (r2 family bullet #1: the giant square gun-mount box is deleted). The
  // base drum runs DEEP through the notch so the casting stays overlapped
  // through the full pitch range — this family's floating-gun curse.
  const apexG = t.apexZ - gunZL;
  const rotorR = p.rotorR ?? 0.14, rotorLen = p.rotorLen ?? 0.65;
  P.addGunExtra(cylZ(rotorR * 1.14, 0.62, 16), 0, 0, apexG - 0.26);
  P.addGunExtra(cylZ(rotorR, rotorLen, 16, rotorR * 1.10), 0, 0, apexG + rotorLen / 2 - 0.08);
  P.addGunExtra(cylZ(rotorR * 0.80, 0.24, 14, rotorR * 0.92), 0, 0, apexG + rotorLen + 0.02);
  // dark recess rings where the collar steps — the armored sleeve separates
  // from the painted tube instead of reading as one casting
  P.addGunExtraDark(cylZ(rotorR * 1.05, 0.035, 16), 0, 0, apexG + rotorLen - 0.05);
  P.addGunExtraDark(cylZ(rotorR * 0.85, 0.03, 14), 0, 0, apexG + rotorLen + 0.13);
  KIT.buildGun(P, {
    len: gLen, r: p.gunR,
    sleeve: p.sleeve !== false, evac: p.evac ?? 0.30, collar: p.collar !== false,
    baseR: Math.max(0.13, p.gunR * 2.0),
  });

  P.decal('turret', 'number', P.spec.visual.number || '', 0.25,
    [p.hwMax * 0.9, t.roofH * 0.42, t.maxWZ], Math.PI / 2);
  P.topY = t.roofH + 0.45;
}

// ---------------------------------------------------------------------------
// Per-mark oracle-fitted parameter tables (docs/references/tanks/merkava*.md)
// ---------------------------------------------------------------------------

// Mk.1/2 shared chassis proportions (small hull, deck ~1.72).
const MK12_CHASSIS = {
  width: 3.70, trackW: 0.60, trackTop: 1.02, bellyY: 0.44, sponsonBotY: 0.95,
  noseTopY: 1.10, noseBotY: 0.90, deckY: 1.72,
  wheelR: 0.40,
};
// Mk.1/2 shared small-turret proportions (world y values). Oracle front
// view: flat top ~±0.85, shoulders to ~±1.25 — the r2 shell (hwMax 1.27,
// roofHW 0.74) was wider at the base and narrower at the crest than the
// print, part of the "slab-pillbox" read.
const MK12_TURRET = {
  turretStyle: 'small', gunAxisY: 1.98, gunR: 0.072, sleeve: false, evac: 0.52,
  notchHW: 0.30, hwMax: 1.25, roofHW: 0.85, roofInset: 0.66,
  rotorR: 0.125, rotorLen: 0.55,
  antennaH: 2.2, antennaX: 1.00, antennaY: 2.44,
};

// Mk.3 shared chassis (bigger hull, deck 1.70).
const MK3_CHASSIS = {
  width: 3.72, trackW: 0.62, trackTop: 1.00, bellyY: 0.34, sponsonBotY: 0.92,
  noseZ: 3.34, noseTopY: 1.02, noseBotY: 0.85, glacisEndZ: 1.0, deckY: 1.70,
  lowerEndZ: 1.75, tailZ: -4.04, tailTopY: 1.43, tailBotY: 0.86, rearDeckZ: -2.70,
  wheelR: 0.40, wheelZs: [1.85, 0.90, -0.05, -1.00, -1.95, -2.90],
  sprocket: { z: 2.50, y: 0.50, r: 0.31 }, idler: { z: -3.52, y: 0.48, r: 0.29 },
  rollers: [1.4, 0.45, -0.5, -1.45, -2.4],
  // r2 #3: hem raised + scallop tabs so the wheel arcs read below the
  // skirt line (the prints scallop over the return-roller stations).
  skirt: { z0: 2.0, z1: -3.1, top: 1.10, bot: 0.38, scallop: true },
};
// Mk.3 shared modular turret (world values). Oracle: cheek from z ~0.9,
// plateau 2.38-2.45 over z 0..-0.8, bustle top ~2.43 running to -2.9,
// short basket to -3.2, chains 1.9..2.15 trailing to -3.8.
const MK3_TURRET = {
  turretStyle: 'mod', pivotZ: -0.75,
  apexZ: 0.92, shellFrontZ: 0.15, gunAxisY: 1.96, gunR: 0.076, sleeve: true, evac: 0.40,
  rotorR: 0.145, rotorLen: 0.75,
  notchHW: 0.30, hwMax: 1.75, maxWZ: -0.55, roofHW: 0.86, roofInset: 0.47,
  roofY: 2.42, roofFrontZ: 0.02, roofRearZ: -0.80, roofRearY: 2.45,
  shellRearZ: -2.15, bustleZ1: -2.90, bustleTop: 2.43, bustleBot: 1.80,
  basketZ0: -2.92, basketZ1: -3.22, basketTop: 2.38, basketBot: 1.98, basketHW: 1.15,
  chainDrop: 0.26, chainGap: 0.30,
  cupolaX: 0.92, cupolaZ: -0.75, cupolaRaise: 0.10, pano: { x: -0.55, z: -0.65 }, sightX: 0.45,
  gunZL: 0.32, antennaH: 1.75, antennaX: 0.90, antennaZ1: -2.40, antennaZ2: -2.75,
  antennaY: 2.43,
};

// Point ON the modular beak's port/starboard cheek plane, parameterized by
// f (0 = notch tip, 1 = roof shoulder) and lateral spread (0..1 of the
// plane's outer edge). Kits anchor cheek fittings here so nothing floats
// off the receding cheek corner (r2 exit gate: zero floaters).
function merkavaCheekPoint(t, f, spread = 0.78) {
  const apex = t.apexZ, bkR = t.bkR ?? apex * 0.4;
  const xo = (t.notchHW + 0.03) + ((t.roofHW * 1.02) - (t.notchHW + 0.03)) * f;
  const yo = (t.apexY + 0.21) + ((t.roofH - 0.02) - (t.apexY + 0.21)) * f;
  return { x: xo * spread, y: yo, z: apex + (bkR - apex) * f };
}

// Flush modular side panels (Trophy launcher zone on the 4-series prints):
// the panel LIES ON the 45-degree shell slope — thin proud plate with seam
// strips and a launcher wedge at the front end, plus the corner radar plate
// on a short strut. Replaces the r2 vertical slabs that stood off the
// inward-sloping wall on long stay rods.
function merkavaSidePanels(P, p, t, opts = {}) {
  const { box } = KIT;
  const hwM = t.hwMax, h = t.roofH;
  const inset = t.roofInset ?? 0.46;
  const phi = Math.atan2(hwM * (1 - inset), h);      // wall slope from vertical
  const fMid = 0.42;
  const wx = hwM * (1 - fMid * (1 - inset)) + 0.045; // just proud of the wall
  const wy = h * fMid;
  const pz = t.maxWZ - 0.30;
  for (const s of [-1, 1]) {
    const rz = s * phi;
    P.add('turretDetail', box(0.07, 0.60, 1.30), s * wx, wy, pz, 0, 0, rz);
    // seam strips along the panel edges
    P.add('turretDark', box(0.075, 0.62, 0.022), s * wx, wy, pz + 0.66, 0, 0, rz);
    P.add('turretDark', box(0.075, 0.62, 0.022), s * wx, wy, pz - 0.66, 0, 0, rz);
    // launcher wedge head at the panel front end with a dark port face
    P.add('turretDetail', box(0.13, 0.34, 0.30), s * (wx + 0.02), wy, pz + 0.82, 0, 0, rz);
    P.add('turretDark', box(0.10, 0.26, 0.03), s * (wx + 0.045), wy + 0.02, pz + 0.975, 0, 0, rz);
    if (opts.radar) {
      // Trophy radar aperture ON the launcher wedge head (a separate corner
      // plate floated off the steep rebuilt cheek wall — r2 exit gate:
      // zero floaters — so the sensor face rides the flush wedge instead).
      P.add('turretGlass', box(0.09, 0.20, 0.014), s * (wx + 0.045), wy + 0.01, pz + 0.99, 0, 0, rz);
    }
  }
}

// Mk.4 turret kits ------------------------------------------------------------
function merkava4Kit(P, p, t) {
  // Trophy APS launcher panels flush on the shell flanks + corner radar.
  merkavaSidePanels(P, p, t, { radar: true });
  // .50 cal on the mantlet bridge directly over the gun (not roof-center).
  merkavaMG(P, 0.14, t.roofH - 0.02, t.roofFrontZ + 0.04, 0.8);
  // commander's 7.62 on the left-rear pintle.
  merkavaMG(P, -t.cupolaX, t.roofH + 0.02, t.cupolaZ - 0.30, 0.85);
  // smoke cluster recessed at the PORT cheek top (r2: never a roof comb).
  const sc4 = merkavaCheekPoint(t, 0.58, 0.80);
  merkavaSmokeCluster(P, -sc4.x, sc4.y - 0.01, sc4.z, -0.30, 4,
    { recessed: true, pitch: -0.24 });
  // tarp roll lashed on the rear roof.
  KIT.tarpRoll(P, 'turretCloth', -0.28, t.roofH + 0.04, t.roofRearZ - 0.32, 0.85, 0.105);
}

function merkava4bKit(P, p, t) {
  // Mk.4B print carries the same paneled flanks (its defining kit per r2).
  merkavaSidePanels(P, p, t, { radar: true });
  merkavaMG(P, t.cupolaX + 0.30, t.roofH + (t.cupolaRaise ?? 0) + 0.10, t.cupolaZ - 0.20, 0.8);
  merkavaMG(P, -t.cupolaX, t.roofH + 0.02, t.cupolaZ + 0.15, 0.65);
  const sc4b = merkavaCheekPoint(t, 0.58, 0.80);
  merkavaSmokeCluster(P, -sc4b.x, sc4b.y - 0.01, sc4b.z, -0.30, 4,
    { recessed: true, pitch: -0.24 });
  KIT.tarpRoll(P, 'turretCloth', -0.28, t.roofH + 0.04, t.roofRearZ - 0.28, 0.8, 0.10);
}

// Cloth kit bundle with two dark cinch straps (roof stowage reads as
// strapped-down canvas, not painted armor prisms — systemic 2).
function merkavaKitBundle(P, x, y, z, w, h, d) {
  const { box } = KIT;
  P.add('turretCloth', box(w, h, d), x, y, z);
  P.add('turretCloth', box(w * 1.04, h * 0.2, d * 1.04), x, y + h * 0.44, z);
  for (const f of [-0.28, 0.28]) {
    P.add('turretDark', box(w * 1.05, h * 1.05, 0.026), x, y, z + f * d);
  }
}

// Mk.2D cheek appliqué wedges riding the cast beak planes (proud overlays,
// r2 #2 fix: the old yawed boxes left a detached "standing plate" sliver
// beside the gun mount — both are gone).
function merkava2dKit(P, p, t) {
  const { box, slab } = KIT;
  const sf = t.apexZ - 0.45;
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.26, t.apexY - 0.38, t.apexZ - 0.04], [s * 0.42, t.apexY - 0.35, t.apexZ - 0.09],
      [s * t.hwMax * 0.60, 0.10, sf + 0.03], [s * 0.18, 0.10, sf + 0.03],
      [s * 0.26, t.apexY + 0.18, t.apexZ - 0.04], [s * 0.42, t.apexY + 0.15, t.apexZ - 0.09],
      [s * t.hwMax * 0.54, t.roofH - 0.07, sf - 0.02], [s * 0.18, t.roofH - 0.07, sf - 0.02]));
  }
  // 2D thermal sight box, low on the roof right-front
  P.add('turret', box(0.26, 0.12, 0.22), -t.cupolaX * 0.30, t.roofH + 0.04, t.roofFrontZ + 0.55);
  P.add('turretGlass', box(0.16, 0.05, 0.02), -t.cupolaX * 0.30, t.roofH + 0.05, t.roofFrontZ + 0.665);
}

// Mk.1B: cast-turret jewelry — lifting lugs on the cheek shoulders.
function merkava1bKit(P, p, t) {
  for (const s of [-1, 1]) {
    KIT.liftEye(P, 'turretDetail', s * t.hwMax * 0.70, t.roofH * 0.60, t.apexZ - 1.05, s * 0.5);
  }
  KIT.liftEye(P, 'turretDetail', 0, t.roofH * 0.9, t.shellRearZ + 0.35, Math.PI / 2);
}

// Shared Mk.3 roof/cheek fit: twin pintle MGs + port-side smoke cluster
// (r2: the 3-series busy roof was "two boxes + a comb").
function merkava3Kit(P, p, t) {
  merkavaMG(P, t.cupolaX * 0.70, t.roofH + (t.cupolaRaise ?? 0) + 0.10, t.cupolaZ - 0.32, 0.75);
  merkavaMG(P, -t.cupolaX * 0.78, t.roofH + 0.02, t.cupolaZ + 0.05, 0.62);
  // cluster rides the port cheek plane just below the roof edge
  const sc3 = merkavaCheekPoint(t, 0.52, 0.80);
  merkavaSmokeCluster(P, -sc3.x, sc3.y - 0.04, sc3.z, -0.45, 5,
    { pitch: -0.30 });
}

// Mk.3D: Dor Dalet bulged cast cheeks + rear-roof tarp roll.
function merkava3dKit(P, p, t) {
  const { box } = KIT;
  merkava3Kit(P, p, t);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.55, 0.30, 0.95), s * t.hwMax * 0.40, t.apexY - 0.08, (t.apexZ + (t.shellFrontZ ?? t.apexZ * 0.48)) / 2 + 0.02, 0.06, s * 0.52, 0);
    P.add('turretDark', box(0.50, 0.025, 0.90), s * t.hwMax * 0.42, t.apexY + 0.10, (t.apexZ + (t.shellFrontZ ?? t.apexZ * 0.48)) / 2, 0.06, s * 0.52, 0);
  }
  KIT.tarpRoll(P, 'turretCloth', -0.15, t.roofH + 0.06, t.roofRearZ - 0.30, 1.1, 0.09);
}

// Mk.3B roof stowage (Baz fit carries soft kit on the rear roof).
function merkava3bKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.45, t.roofH + 0.06, t.roofRearZ - 0.15, 0.55, 0.16, 0.65);
  merkavaKitBundle(P, 0.50, t.roofH + 0.05, t.roofRearZ - 0.30, 0.45, 0.14, 0.50);
}

// Mk.3C roof clutter (Kasag interim fit).
function merkava3cKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.50, t.roofH + 0.07, t.roofRearZ - 0.20, 0.58, 0.17, 0.72);
  merkavaKitBundle(P, 0.55, t.roofH + 0.05, t.roofRearZ - 0.35, 0.48, 0.15, 0.55);
}

export const MERKAVA_PROFILES = {
  merkava1b: {
    build: buildMerkavaMark,
    ...MK12_CHASSIS, ...MK12_TURRET,
    // 1B oracle sits ~0.44 m rearward in its own frame — replicated so the
    // raw-bounds gun-overhang metric lines up (see reference packet).
    noseZ: 3.05, glacisEndZ: 0.92, lowerEndZ: 1.90,
    tailZ: -3.93, tailTopY: 1.42, tailBotY: 0.93, rearDeckZ: -2.55,
    wheelZs: [1.55, 0.65, -0.25, -1.15, -2.05, -2.95],
    sprocket: { z: 2.22, y: 0.50, r: 0.30 }, idler: { z: -3.44, y: 0.48, r: 0.28 },
    rollers: [1.1, 0.2, -0.7, -1.6, -2.5],
    skirt: null, fenderY: 1.22,
    pivotZ: -1.00,
    // Oracle: cheek tip z 0.86 (y 1.8..2.2), roof rising (0.4, 2.28) ->
    // (-1.0, 2.40), cupola bumps at -0.7..-1.1, stowage 2.5-2.8 to -2.4,
    // basket -2.5..-3.4 top 2.44, chains to -3.68, shoulders ±1.2.
    hwMax: 1.26, roofHW: 0.86, roofInset: 0.68,
    apexZ: 0.86, roofY: 2.28, roofFrontZ: 0.40, roofRearZ: -1.00, roofRearY: 2.40,
    maxWZ: -0.60, shellRearZ: -1.72, bustleZ1: -2.40, bustleTop: 2.72, bustleBot: 1.86,
    basketZ0: -2.50, basketZ1: -3.36, basketTop: 2.44, basketBot: 1.85, basketHW: 1.02,
    cupolaX: -0.72, cupolaZ: -0.90,
    chainDrop: 0.36, chainGap: 0.20,
    antennaZ1: -2.95, antennaZ2: -2.60,
    rotorR: 0.125, rotorLen: 0.95,
    gunTipZ: 4.06, gunZL: 0.40,
    turretKit: merkava1bKit,
  },
  merkava2b: {
    build: buildMerkavaMark,
    ...MK12_CHASSIS, ...MK12_TURRET,
    noseZ: 3.49, glacisEndZ: 1.35, lowerEndZ: 2.10,
    tailZ: -3.60, tailTopY: 1.44, tailBotY: 0.93, rearDeckZ: -2.60,
    wheelZs: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5],
    sprocket: { z: 2.65, y: 0.50, r: 0.30 }, idler: { z: -3.08, y: 0.48, r: 0.28 },
    rollers: [1.55, 0.65, -0.25, -1.15, -2.05],
    // r2 #3: straight-bottom slabs hid the running gear — hem raised with
    // scallop tabs so wheel arcs show through, matching the print.
    skirt: { z0: 2.35, z1: -2.65, top: 1.10, bot: 0.38, scallop: true },
    pivotZ: -0.55,
    // Oracle: cheek z 1.3, plateau 2.40-2.46 over z 0.5..-0.6, cupola
    // 2.6-2.8 ON the plateau, soft stowage to 2.58, casting to -1.6, open
    // basket to -2.9 (top 2.44), chains to -3.3. r2 #1: the old build put
    // the plateau front at 0.88 and stacked solid boxes to -2.9, reading
    // aft + tall of the print's compact forward turret.
    apexZ: 1.30, roofY: 2.40, roofFrontZ: 0.52, roofRearZ: -0.60, roofRearY: 2.46,
    maxWZ: -0.15, shellRearZ: -1.60, bustleZ1: -1.52, bustleTop: 2.62, bustleBot: 1.88,
    basketZ0: -1.66, basketZ1: -2.92, basketTop: 2.44, basketBot: 1.90, basketHW: 1.02,
    cupolaX: -0.72, cupolaZ: -0.28,
    chainDrop: 0.36, chainGap: 0.20,
    antennaZ1: -2.80, antennaZ2: -2.45,
    gunTipZ: 4.55, gunZL: 0.40,
  },
  merkava2d: {
    build: buildMerkavaMark,
    ...MK12_CHASSIS, ...MK12_TURRET,
    noseZ: 3.49, glacisEndZ: 1.35, lowerEndZ: 2.10,
    tailZ: -3.55, tailTopY: 1.44, tailBotY: 0.93, rearDeckZ: -2.60,
    wheelZs: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5],
    sprocket: { z: 2.65, y: 0.50, r: 0.30 }, idler: { z: -3.05, y: 0.48, r: 0.28 },
    rollers: [1.55, 0.65, -0.25, -1.15, -2.05],
    skirt: { z0: 2.35, z1: -2.65, top: 1.10, bot: 0.38, scallop: true },
    pivotZ: -0.55,
    apexZ: 1.30, roofY: 2.40, roofFrontZ: 0.52, roofRearZ: -0.60, roofRearY: 2.46,
    maxWZ: -0.15, shellRearZ: -1.60, bustleZ1: -1.52, bustleTop: 2.58, bustleBot: 1.88,
    basketZ0: -1.66, basketZ1: -2.90, basketTop: 2.42, basketBot: 1.90, basketHW: 1.02,
    cupolaX: -0.72, cupolaZ: -0.28,
    chainDrop: 0.36, chainGap: 0.20,
    antennaZ1: -2.78, antennaZ2: -2.44,
    gunTipZ: 4.51, gunZL: 0.40,
    turretKit: merkava2dKit,
  },
  merkava3b: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.32, hwMax: 1.72,
    tailRackZ: -4.13,
    gunTipZ: 4.14,
    turretKit: merkava3bKit,
  },
  merkava3c: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.33, hwMax: 1.72,
    tailRackZ: -4.13,
    gunTipZ: 4.14,
    turretKit: merkava3cKit,
  },
  merkava3d: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.35, hwMax: 1.78,
    // 3D oracle hangs turret content past the hull tail — the rear sliver
    // feeds the raw-bounds gun-overhang metric (see packet).
    rearTipZ: -4.15, rearTipH: 1.00,
    gunTipZ: 4.14,
    turretKit: merkava3dKit,
  },
  merkava4: {
    build: buildMerkavaMark,
    width: 3.72, trackW: 0.62, trackTop: 0.95, bellyY: 0.26, sponsonBotY: 0.88,
    noseZ: 2.95, noseTopY: 0.88, noseBotY: 0.62, glacisEndZ: 1.00, deckY: 1.32,
    lowerEndZ: 2.05, tailZ: -3.43, tailTopY: 1.17, tailBotY: 0.58, rearDeckZ: -2.85,
    wheelR: 0.36, wheelZs: [1.60, 0.80, 0.0, -0.80, -1.60, -2.40],
    sprocket: { z: 2.15, y: 0.47, r: 0.29 }, idler: { z: -2.95, y: 0.45, r: 0.27 },
    rollers: [1.2, 0.4, -0.4, -1.2, -2.0],
    skirt: { z0: 2.10, z1: -2.75, top: 1.02, bot: 0.46, fringe: true, scallop: true, flaps: false },
    hump: { x0: 0.22, x1: 0.95, z0: 0.70, z1: 1.85, top: 2.05 },
    driverHump: true,
    turretStyle: 'mod', pivotZ: -0.35,
    // Oracle: notch apex (1.44, y 1.6), flat roof 2.13 over z 0..-0.9
    // (sight bumps 2.27-2.38), rear roof sloping to (-1.95, 2.0), bustle
    // face -2.1, basket to -2.9 at top ~1.96 with chains below.
    apexZ: 1.44, shellFrontZ: 0.75, gunAxisY: 1.60, gunR: 0.068, sleeve: true, evac: 0.30,
    rotorR: 0.115, rotorLen: 0.55,
    notchHW: 0.30, hwMax: 1.57, maxWZ: -0.35, roofHW: 0.72, roofInset: 0.44,
    roofY: 2.13, roofFrontZ: 0.02, roofRearZ: -0.90, roofRearY: 2.13,
    shellRearZ: -2.10, bustleZ1: -2.20, bustleTop: 2.00, bustleBot: 1.55,
    basketZ0: -2.20, basketZ1: -2.88, basketTop: 1.96, basketBot: 1.42, basketHW: 1.05,
    chainDrop: 0.26, chainGap: 0.12,
    cupolaX: 0.55, cupolaZ: -0.55, noLoaderHatch: true,
    pano: { x: 0.32, z: -0.62 }, sightX: 0.45,
    rearRailY0: 1.55, rearRailY1: 1.80, rearRailZ: -2.60,
    cornerBins: { y: 1.50, h: 0.30, d: 0.62, z: -2.85 },
    gunTipZ: 3.44, gunZL: 0.30,
    antennaH: 1.15, antennaX: 0.85, antennaZ1: -2.35, antennaZ2: -2.62, antennaY: 1.96,
    turretKit: merkava4Kit,
  },
  merkava4b: {
    build: buildMerkavaMark,
    width: 3.72, trackW: 0.62, trackTop: 1.05, bellyY: 0.50, sponsonBotY: 0.98,
    noseZ: 3.50, noseTopY: 1.26, noseBotY: 1.06, glacisEndZ: 1.15, deckY: 1.78,
    lowerEndZ: 2.00, tailZ: -4.08, tailTopY: 1.44, tailBotY: 0.98, rearDeckZ: -3.45,
    wheelR: 0.42, wheelZs: [2.05, 1.04, 0.03, -0.98, -1.99, -3.00],
    sprocket: { z: 2.72, y: 0.52, r: 0.32 }, idler: { z: -3.70, y: 0.50, r: 0.30 },
    rollers: [1.55, 0.55, -0.45, -1.45, -2.45],
    skirt: { z0: 2.25, z1: -3.20, top: 1.14, bot: 0.45, scallop: true },
    driverHump: true,
    turretStyle: 'mod', pivotZ: -0.55,
    // Oracle: cheek/mantlet tip z 2.4-2.6 at y 1.93..2.23 (a low BEAK, not
    // a full-height prow), plateau 2.82 over z -0.2..-1.35, rear roof 2.73
    // to -1.9, basket band 1.95-2.6 from -2.4 back to -3.9, whips to 4.54.
    apexZ: 2.50, shellFrontZ: 1.35, gunAxisY: 2.06, gunR: 0.078, sleeve: true, evac: 0.30,
    rotorR: 0.15, rotorLen: 0.50,
    notchHW: 0.32, hwMax: 1.50, maxWZ: -0.60, roofHW: 0.74, roofInset: 0.46,
    roofY: 2.82, roofFrontZ: -0.20, roofRearZ: -1.35, roofRearY: 2.80,
    shellRearZ: -2.20, bustleZ1: -2.40, bustleTop: 2.62, bustleBot: 1.95,
    basketZ0: -2.40, basketZ1: -3.88, basketTop: 2.56, basketBot: 1.95, basketHW: 1.02,
    chainDrop: 0.30, chainGap: 0.14,
    cupolaX: 0.55, cupolaZ: -0.90, noLoaderHatch: true,
    pano: { x: -0.35, z: -0.95 }, sightX: 0.45,
    tailRackZ: -4.24,
    gunTipZ: 4.29, gunZL: 0.32, antennaH: 1.90, antennaX: 0.80,
    antennaZ1: -2.60, antennaZ2: -3.05, antennaY: 2.56,
    turretKit: merkava4bKit,
  },
};
