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
  P.add('hullDark', box(0.035, (c.tailTopY - c.tailBotY) * 0.82, 0.05),
    0, (c.tailTopY + c.tailBotY) / 2, c.tailZ - 0.015);
  P.add('hullDark', box(w * 0.30, 0.03, 0.05), 0, c.tailBotY + 0.06, c.tailZ - 0.015);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, (c.tailTopY - c.tailBotY) * 0.72, 0.05),
      s * 0.24, (c.tailTopY + c.tailBotY) / 2, c.tailZ - 0.03);
    P.add('hullDetail', box(0.06, 0.09, 0.07), s * 0.52, c.tailTopY - 0.10, c.tailZ - 0.02);
    P.add('hullDark', box(0.13, 0.07, 0.04), s * (rhw - 0.28), c.tailTopY - 0.06, c.tailZ - 0.02);
  }

  // Deck furniture: driver hatch (front LEFT), periscopes, intake/exhaust
  // louvres on the right, lift eyes, headlight brackets, glacis tow cable.
  const dhZ = c.glacisEndZ + (c.noseZ - c.glacisEndZ) * 0.22;
  const dhY = c.deckY - (c.deckY - c.noseTopY) * 0.16;
  P.add('hull', box(0.52, 0.05, 0.58), -w * 0.20, dhY + 0.01, dhZ, -(c.deckY - c.noseTopY) / (c.noseZ - c.glacisEndZ), 0, 0);
  periscope(P, 'hullDetail', -w * 0.20, dhY + 0.06, dhZ - 0.42);
  for (let i = 0; i < 6; i++) {
    P.add('hullDark', box(w * 0.24, 0.028, 0.05),
      w * 0.21, c.deckY + 0.02 - (c.deckY - c.noseTopY) * 0.10 * 0, c.glacisEndZ - 0.30 - i * 0.13);
  }
  P.add('hullDark', box(w * 0.30, 0.02, 0.55), -w * 0.20, c.deckY + 0.015, c.rearDeckZ + 0.55);
  liftEye(P, 'hullDetail', -w * 0.36, c.deckY + 0.02, c.rearDeckZ + 0.35);
  liftEye(P, 'hullDetail', w * 0.36, c.deckY + 0.02, c.rearDeckZ + 0.35);
  headlight(P, -w * 0.33, c.noseTopY + 0.12, c.noseZ - 0.35, -0.3, 0.05);
  headlight(P, w * 0.33, c.noseTopY + 0.12, c.noseZ - 0.35, -0.3, 0.05);
  towCable(P, [[-w * 0.26, c.noseTopY + 0.16, c.noseZ - 0.6],
    [0, c.noseTopY + 0.30, c.noseZ - 0.28],
    [w * 0.26, c.noseTopY + 0.16, c.noseZ - 0.6]]);

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
      // panel seams + rubber hem
      const panels = 7;
      for (let i = 0; i <= panels; i++) {
        P.add('hullDark', box(0.058, (sk.top - sk.bot) * 0.86, 0.02),
          s * (sx + 0.004), (sk.top + sk.bot) / 2, sk.z0 - i * ((sk.z0 - sk.z1) / panels));
      }
      if (sk.fringe) P.add('hullRubber', box(0.03, 0.10, sk.z0 - sk.z1), s * (sx + 0.01), sk.bot - 0.10, (sk.z0 + sk.z1) / 2);
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
// SCORING NOTE (fidelity lab): the component masks keep only LOD0 buckets for
// the procedural side — LOD-wrapped detail buckets re-enable themselves
// during the hull-only render pass and are then subtracted out of the upper
// assembly. Everything silhouette-relevant on these turrets therefore builds
// into the plain 'turret' bucket (painted metal — correct for IDF fittings);
// only sub-5 cm glass/shadow accents stay in detail buckets.
// ---------------------------------------------------------------------------
function merkavaSmallTurret(P, t) {
  const { box, cylY, cylZ, polyTurret, slab } = KIT;
  const apex = t.apexZ, roofF = t.roofFrontZ, roofR = t.roofRearZ;
  const rearZ = t.shellRearZ;
  const h = t.roofH;             // roof height at the FRONT edge
  const hR = t.roofRearH;        // roof height at the REAR (higher)
  const hwM = t.hwMax;

  // Shell: rounded-nose plan, inset roof.
  P.add('turret', polyTurret([
    [-0.34, apex], [0.34, apex],
    [hwM * 0.62, apex - 0.40], [hwM * 0.94, apex - 1.05],
    [hwM, (apex - 1.05 + rearZ) / 2], [hwM * 0.88, rearZ],
    [-hwM * 0.88, rearZ], [-hwM, (apex - 1.05 + rearZ) / 2],
    [-hwM * 0.94, apex - 1.05], [-hwM * 0.62, apex - 0.40],
  ], h, 1.0, t.roofInset ?? 0.60));
  // Rearward-rising roof wedge (the Mk.1/2 signature silhouette).
  P.add('turret', slab(
    [-hwM * 0.56, h - 0.03, roofF], [hwM * 0.56, h - 0.03, roofF],
    [hwM * 0.60, h - 0.03, roofR - 0.3], [-hwM * 0.60, h - 0.03, roofR - 0.3],
    [-hwM * 0.52, h + 0.005, roofF], [hwM * 0.52, h + 0.005, roofF],
    [hwM * 0.56, hR, roofR], [-hwM * 0.56, hR, roofR]));

  // Bustle stowage bin behind the shell + strapped kit on top (fills to the
  // measured bustle top — the oracle carries bags level with the roof).
  const buT = t.bustleTop ?? hR * 0.73, buB = t.bustleBot ?? 0.10;
  P.add('turret', box(hwM * 1.46, buT - buB, rearZ - t.bustleZ1),
    0, (buT + buB) / 2, (rearZ + t.bustleZ1) / 2);
  P.add('turret', box(hwM * 0.86, 0.24, Math.abs(rearZ - t.bustleZ1) * 0.72),
    -hwM * 0.30, buT + 0.10, (rearZ + t.bustleZ1) / 2);
  P.add('turret', box(hwM * 0.60, 0.20, Math.abs(rearZ - t.bustleZ1) * 0.55),
    hwM * 0.42, buT + 0.08, (rearZ + t.bustleZ1) / 2 - 0.08);

  // Big rear basket: solid-read panel bin + frame rails (masks read solid).
  const bkMid = (t.basketZ0 + t.basketZ1) / 2, bkLen = t.basketZ0 - t.basketZ1;
  P.add('turret', box(t.basketHW * 2, t.basketTop - t.basketBot - 0.05, bkLen),
    0, (t.basketTop + t.basketBot) / 2, bkMid);
  P.add('turret', box(t.basketHW * 2 + 0.05, 0.04, bkLen + 0.04), 0, t.basketTop, bkMid);
  P.add('turret', box(t.basketHW * 2 + 0.05, 0.04, bkLen + 0.04), 0, t.basketBot, bkMid);
  for (let i = 0; i < 7; i++) {
    P.add('turret', box(0.03, t.basketTop - t.basketBot, 0.03),
      -t.basketHW + i * (t.basketHW * 2 / 6), (t.basketTop + t.basketBot) / 2, t.basketZ1 + 0.02);
  }
  // Ball-and-chain curtain hanging behind the basket.
  chainCurtain(P, t.basketHW * 0.94, t.basketZ1 - 0.14, t.basketBot + 0.10, 0.34);

  // Commander cupola (left on the oracle sculpt) + gunner hatch right + MG.
  KIT.cupola(P, 'turret', t.cupolaX, hR - 0.02, t.cupolaZ, 0.24, 0.10, 6);
  P.add('turret', cylY(0.20, 0.20, 0.05, 14), -t.cupolaX, hR - 0.03, t.cupolaZ + 0.06);
  merkavaMG(P, t.cupolaX * 0.7, hR + 0.02, t.cupolaZ - 0.28, 0.8);
  // 60 mm mortar plate + sight head
  P.add('turret', box(0.16, 0.18, 0.16), -0.30, hR + 0.07, t.apexZ - 0.85);
  P.add('turret', box(0.20, 0.16, 0.18), 0.30, hR + 0.06, t.apexZ - 0.70);
  P.add('turretGlass', box(0.14, 0.08, 0.02), 0.30, hR + 0.07, t.apexZ - 0.60);
}

// Painted pintle MG built in the LOD0 turret bucket (see scoring note).
function merkavaMG(P, x, y, z, s = 1) {
  const { box, cylZ } = KIT;
  P.add('turret', box(0.035 * s, 0.20 * s, 0.035 * s), x, y + 0.10 * s, z);
  P.add('turret', box(0.09 * s, 0.09 * s, 0.44 * s), x, y + 0.24 * s, z);
  P.add('turret', cylZ(0.02 * s, 0.5 * s, 8), x, y + 0.26 * s, z + 0.42 * s);
}

// ---------------------------------------------------------------------------
// Mk.3/Mk.4 modular wedge turret: raked cheeks meeting a narrow flat roof,
// pronounced side overhang, full-height bustle, basket + chain curtain.
// ---------------------------------------------------------------------------
function merkavaModularTurret(P, t) {
  const { box, cylY, polyTurret, slab, frustum } = KIT;
  const apex = t.apexZ, hwM = t.hwMax;
  const h = t.roofH;

  // Main wedge shell.
  P.add('turret', polyTurret([
    [-t.notchHW, apex], [t.notchHW, apex],
    [hwM * 0.52, apex * 0.52], [hwM, t.maxWZ],
    [hwM * 0.97, t.shellRearZ], [hwM * 0.62, t.shellRearZ - 0.12],
    [-hwM * 0.62, t.shellRearZ - 0.12], [-hwM * 0.97, t.shellRearZ],
    [-hwM, t.maxWZ], [-hwM * 0.52, apex * 0.52],
  ], h, 1.0, t.roofInset ?? 0.46));
  // Flat roof plate holding the plateau line + slight rear roof taper.
  P.add('turret', slab(
    [-t.roofHW, h - 0.045, t.roofFrontZ], [t.roofHW, h - 0.045, t.roofFrontZ],
    [t.roofHW * 1.04, h - 0.045, t.roofRearZ], [-t.roofHW * 1.04, h - 0.045, t.roofRearZ],
    [-t.roofHW * 0.96, h, t.roofFrontZ], [t.roofHW * 0.96, h, t.roofFrontZ],
    [t.roofHW, t.roofRearH ?? h, t.roofRearZ], [-t.roofHW, t.roofRearH ?? h, t.roofRearZ]));

  // Full-height bustle behind the shell (slightly narrower, clipped corners).
  P.add('turret', frustum(hwM * 0.93, t.shellRearZ + 0.05, t.bustleZ1, hwM * 0.80,
    t.shellRearZ + 0.02, t.bustleZ1 + 0.06, t.bustleBot, t.bustleTop));

  // Gun-mount cheek: the angled trapezoid faces flanking the gun notch.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * t.notchHW * 0.9, t.apexY - 0.34, apex - 0.02], [s * t.notchHW * 0.9, t.apexY - 0.34, apex - 0.02],
      [s * hwM * 0.5, t.apexY - 0.42, apex * 0.5], [s * (t.notchHW * 0.96), t.apexY - 0.42, apex * 0.62],
      [s * t.notchHW * 0.9, t.apexY + 0.30, apex - 0.02], [s * t.notchHW * 0.9, t.apexY + 0.30, apex - 0.02],
      [s * hwM * 0.52, t.apexY + 0.16, apex * 0.5], [s * (t.notchHW * 0.96), t.apexY + 0.34, apex * 0.62]));
  }

  // Basket behind the bustle + chain curtain. Solid-read bin for the
  // recovered oracles; open frame + slats when the oracle basket is
  // see-through mesh (t.basketOpen).
  if (t.basketZ0 !== undefined) {
    const bkMid = (t.basketZ0 + t.basketZ1) / 2, bkLen = t.basketZ0 - t.basketZ1;
    if (t.basketOpen) {
      for (const f of [0.33, 0.66]) {
        P.add('turret', box(t.basketHW * 2, 0.035, bkLen),
          0, t.basketBot + (t.basketTop - t.basketBot) * f, bkMid);
      }
      for (let i = 0; i < 6; i++) {
        P.add('turret', box(0.035, t.basketTop - t.basketBot, bkLen * 0.16),
          -t.basketHW + i * (t.basketHW * 2 / 5), (t.basketTop + t.basketBot) / 2, bkMid);
      }
    } else {
      P.add('turret', box(t.basketHW * 2, t.basketTop - t.basketBot - 0.05, bkLen),
        0, (t.basketTop + t.basketBot) / 2, bkMid);
    }
    P.add('turret', box(t.basketHW * 2 + 0.05, 0.045, bkLen + 0.05), 0, t.basketTop, bkMid);
    P.add('turret', box(t.basketHW * 2 + 0.05, 0.045, bkLen + 0.05), 0, t.basketBot, bkMid);
    for (let i = 0; i < 8; i++) {
      P.add('turret', box(0.03, t.basketTop - t.basketBot, 0.03),
        -t.basketHW + i * (t.basketHW * 2 / 7), (t.basketTop + t.basketBot) / 2, t.basketZ1 + 0.02);
    }
    chainCurtain(P, t.basketHW * 0.92, t.basketZ1 - 0.28, t.basketBot + 0.14, t.chainDrop ?? 0.32);
  }
  // Roof kit: commander cupola (right, raised) + MG, loader hatch (left),
  // panoramic sight, gunner's sight brow right of the notch.
  KIT.cupola(P, 'turret', t.cupolaX, h + (t.cupolaRaise ?? 0), t.cupolaZ, 0.23, 0.12, 6);
  merkavaMG(P, t.cupolaX * 0.75, h + (t.cupolaRaise ?? 0) + 0.10, t.cupolaZ - 0.30, 0.75);
  P.add('turret', cylY(0.20, 0.20, 0.05, 14), -t.cupolaX * 0.9, h - 0.03, t.cupolaZ + 0.10);
  if (t.pano) {
    P.add('turret', cylY(0.09, 0.11, 0.16, 10), t.pano.x, h + 0.08, t.pano.z);
    P.add('turret', box(0.24, 0.24, 0.24), t.pano.x, h + 0.28, t.pano.z);
    P.add('turretGlass', box(0.15, 0.10, 0.02), t.pano.x, h + 0.29, t.pano.z + 0.13);
  }
  P.add('turret', box(0.34, 0.20, 0.30), t.sightX ?? 0.42, h + 0.02, t.roofFrontZ + 0.35);
  P.add('turret', box(0.26, 0.12, 0.04), t.sightX ?? 0.42, h + 0.04, t.roofFrontZ + 0.52);
  P.add('turretGlass', box(0.20, 0.08, 0.02), t.sightX ?? 0.42, h + 0.04, t.roofFrontZ + 0.54);
}

// Ball-and-chain curtain: irregular short drops with ball ends (LOD0 turret
// bucket — the curtain is a scored part of the rear silhouette).
function chainCurtain(P, halfW, z, topY, drop) {
  const { box, sph } = KIT;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const x = -halfW + i * (halfW * 2 / (n - 1));
    const d = drop + (i % 3) * 0.05;
    P.add('turret', box(0.016, d, 0.016), x, topY - d / 2, z);
    P.add('turret', sph(0.032, 8), x, topY - d - 0.02, z);
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
    basketOpen: p.basketOpen,
    chainDrop: p.chainDrop,
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

  // Rear chain-rail / rack tips: several oracles hang turret content past the
  // basket (and on Mk.3D past the hull tail — the gun-overhang metric keys
  // off that raw rear sliver). Mirror the measured extent exactly.
  if (p.rearTipZ !== undefined) {
    const tipZ = L(p.rearTipZ);
    const railY = (t.basketBot ?? 0.2) + 0.10;
    P.add('turret', box(0.05, 0.055, (t.basketZ1 ?? t.shellRearZ) - tipZ),
      0, railY, ((t.basketZ1 ?? t.shellRearZ) + tipZ) / 2);
    P.add('turret', box(0.05, p.rearTipH ?? 0.55, 0.12),
      0, railY - (p.rearTipH ?? 0.55) / 2 + 0.03, tipZ + 0.06);
  }

  // Twin whip antennas on the bustle shoulders (tall — they are part of the
  // oracle turret silhouette and cheaply recover the mask bbox height).
  const aH = p.antennaH ?? 1.7;
  const aX = p.antennaX ?? p.hwMax * 0.55;
  const aZs = [p.antennaZ1 !== undefined ? L(p.antennaZ1) : t.shellRearZ - 0.15,
    p.antennaZ2 !== undefined ? L(p.antennaZ2) : t.shellRearZ - 0.15];
  [-1, 1].forEach((s, i) => {
    P.add('turret', box(0.03, 0.16, 0.03), s * aX, (t.bustleTop ?? t.roofH) - 0.04, aZs[i]);
    P.add('turret', box(0.022, aH, 0.022), s * aX, (t.bustleTop ?? t.roofH) + aH / 2 - 0.06, aZs[i], 0, 0, s * 0.05);
  });

  // Gun: trunnions just behind the cheek apex; the Merkava nose is LONG so
  // the visible overhang past it stays short. Tube length is fitted so the
  // muzzle lands exactly on the oracle's tip.
  const gunZL = p.gunZL ?? 0.32;
  P.gunG.position.set(0, V(p.gunAxisY), gunZL);
  // +0.03: the tube geometry ends 0.02 short of len; the pad puts the
  // rendered tip on the oracle's muzzle.
  const gLen = p.gunTipZ - p.pivotZ - gunZL + 0.03;
  // Gun rotor: the thick armored sleeve mass the tube emerges from — a major
  // silhouette feature on every mark (pitches with the gun).
  const apexG = t.apexZ - gunZL;
  const rotorR = p.rotorR ?? 0.14, rotorLen = p.rotorLen ?? 0.65;
  P.addGunExtra(box(p.notchHW ? p.notchHW * 1.9 : 0.55, rotorR * 2.4, 0.5), 0, 0.02, apexG - 0.18);
  P.addGunExtra(cylZ(rotorR, rotorLen, 14), 0, 0, apexG + rotorLen / 2 - 0.06);
  P.addGunExtra(cylZ(rotorR * 0.82, 0.22, 14), 0, 0, apexG + rotorLen + 0.04);
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
// Mk.1/2 shared small-turret proportions (world y values).
const MK12_TURRET = {
  turretStyle: 'small', gunAxisY: 1.98, gunR: 0.072, sleeve: false, evac: 0.52,
  notchHW: 0.30, hwMax: 1.27, roofHW: 0.74,
  rotorR: 0.125, rotorLen: 1.05,
  antennaH: 1.85,
};

// Mk.3 shared chassis (bigger hull, deck 1.70).
const MK3_CHASSIS = {
  width: 3.72, trackW: 0.62, trackTop: 1.00, bellyY: 0.34, sponsonBotY: 0.92,
  noseZ: 3.34, noseTopY: 1.02, noseBotY: 0.85, glacisEndZ: 1.0, deckY: 1.70,
  lowerEndZ: 1.75, tailZ: -4.04, tailTopY: 1.43, tailBotY: 0.86, rearDeckZ: -2.70,
  wheelR: 0.40, wheelZs: [1.85, 0.90, -0.05, -1.00, -1.95, -2.90],
  sprocket: { z: 2.50, y: 0.50, r: 0.31 }, idler: { z: -3.52, y: 0.48, r: 0.29 },
  rollers: [1.4, 0.45, -0.5, -1.45, -2.4],
  skirt: { z0: 2.0, z1: -3.1, top: 1.10, bot: 0.32 },
};
// Mk.3 shared modular turret (world values).
const MK3_TURRET = {
  turretStyle: 'mod', pivotZ: -0.75,
  apexZ: 0.92, gunAxisY: 1.96, gunR: 0.076, sleeve: true, evac: 0.40,
  rotorR: 0.145, rotorLen: 0.75,
  notchHW: 0.30, hwMax: 1.75, maxWZ: -0.55, roofHW: 0.86, roofInset: 0.47,
  roofY: 2.42, roofFrontZ: 0.30, roofRearZ: -1.30, roofRearY: 2.46,
  shellRearZ: -2.15, bustleZ1: -2.90, bustleTop: 2.42, bustleBot: 1.78,
  basketZ0: -2.92, basketZ1: -3.30, basketTop: 2.42, basketBot: 1.90, basketHW: 1.15,
  cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: 0.10, pano: { x: -0.55, z: -0.65 }, sightX: 0.45,
  gunZL: 0.32, antennaH: 1.75, antennaX: 0.90, antennaZ1: -2.35, antennaZ2: -3.10,
};

// Painted smoke launcher cluster in the LOD0 turret bucket.
function merkavaSmoke(P, x, y, z, n, yaw) {
  const { cylZ } = KIT;
  for (let k = 0; k < n; k++) {
    const f = k - (n - 1) / 2;
    const a = yaw + f * (0.55 / n);
    const dx = Math.cos(yaw) * f * 0.095, dz = -Math.sin(yaw) * f * 0.095;
    P.add('turret', cylZ(0.038, 0.24, 8), x + dx, y, z + dz, -0.5, a, 0);
  }
}

// Mk.4 turret kits ------------------------------------------------------------
function merkava4Kit(P, p, t) {
  const { box } = KIT;
  // Trophy APS slabs + radar plates on the turret flanks (Mk.4M Windbreaker).
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, 0.38, 1.20), s * (p.hwMax - 0.05), t.roofH * 0.30, t.maxWZ - 0.35, 0, -s * 0.10, 0);
    P.add('turret', box(0.03, 0.18, 0.18), s * (p.hwMax - 0.10), t.roofH * 0.44, t.apexZ * 0.42, 0, s * 0.35, 0);
    P.add('turretGlass', box(0.012, 0.14, 0.14), s * (p.hwMax - 0.08), t.roofH * 0.44, t.apexZ * 0.42 + 0.01, 0, s * 0.35, 0);
  }
  // .50 cal over the gun.
  merkavaMG(P, 0.12, t.roofH - 0.02, t.roofFrontZ + 0.35, 0.9);
  merkavaSmoke(P, p.hwMax * 0.55, t.roofH * 0.55, t.apexZ * 0.35, 4, 0.95);
  merkavaSmoke(P, -p.hwMax * 0.55, t.roofH * 0.55, t.apexZ * 0.35, 4, -0.95);
}

function merkava4bKit(P, p, t) {
  // Mk.4B without Trophy: cleaner roof, twin hatch/MG fit + smoke clusters.
  merkavaMG(P, -0.55, t.roofH + 0.0, t.cupolaZ - 0.1, 1.0);
  merkavaSmoke(P, p.hwMax * 0.55, t.roofH * 0.55, t.apexZ * 0.35, 6, 1.1);
  merkavaSmoke(P, -p.hwMax * 0.55, t.roofH * 0.55, t.apexZ * 0.35, 6, -1.1);
}

// Mk.2D wedge modules on the small turret's front cheeks.
function merkava2dKit(P, p, t) {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.40, 0.85), s * (p.hwMax * 0.60), t.roofH * 0.40, t.apexZ - 0.40, 0, s * 0.42, 0);
  }
  P.add('turret', box(0.55, 0.30, 0.35), 0, t.apexY + 0.38, t.apexZ - 0.30);
}

// Mk.3D rear-roof stowage + wider wedge flanks.
function merkava3dKit(P, p, t) {
  const { box } = KIT;
  P.add('turret', box(p.hwMax * 1.05, 0.14, 0.85), 0, t.roofH + 0.05, t.roofRearZ - 0.28);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.16, 0.36, 1.05), s * (p.hwMax - 0.05), t.roofH * 0.40, t.maxWZ - 0.30, 0, -s * 0.08, 0);
  }
}

// Mk.3B roof stowage (Baz fit carries kit boxes on the rear roof).
function merkava3bKit(P, p, t) {
  const { box } = KIT;
  P.add('turret', box(0.55, 0.18, 0.7), -0.45, t.roofH + 0.07, t.roofRearZ - 0.05);
  P.add('turret', box(0.45, 0.16, 0.55), 0.5, t.roofH + 0.06, t.roofRearZ - 0.2);
}

// Mk.3C roof clutter (Kasag interim fit).
function merkava3cKit(P, p, t) {
  const { box } = KIT;
  P.add('turret', box(0.6, 0.2, 0.8), -0.5, t.roofH + 0.08, t.roofRearZ - 0.1);
  P.add('turret', box(0.5, 0.18, 0.6), 0.55, t.roofH + 0.07, t.roofRearZ - 0.25);
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
    apexZ: 0.86, roofY: 2.26, roofFrontZ: 0.42, roofRearZ: -1.05, roofRearY: 2.40,
    maxWZ: -0.60, shellRearZ: -1.60, bustleZ1: -2.45, bustleTop: 2.50, bustleBot: 1.86,
    basketZ0: -2.50, basketZ1: -3.36, basketTop: 2.40, basketBot: 1.80, basketHW: 1.05,
    cupolaX: -0.72, cupolaZ: -1.10,
    rearTipZ: -3.82, rearTipH: 0.50,
    gunTipZ: 4.06, gunZL: 0.40, roofInset: 0.60,
  },
  merkava2b: {
    build: buildMerkavaMark,
    ...MK12_CHASSIS, ...MK12_TURRET,
    noseZ: 3.49, glacisEndZ: 1.35, lowerEndZ: 2.10,
    tailZ: -3.60, tailTopY: 1.44, tailBotY: 0.93, rearDeckZ: -2.60,
    wheelZs: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5],
    sprocket: { z: 2.65, y: 0.50, r: 0.30 }, idler: { z: -3.08, y: 0.48, r: 0.28 },
    rollers: [1.55, 0.65, -0.25, -1.15, -2.05],
    skirt: { z0: 2.35, z1: -2.65, top: 1.10, bot: 0.31 },
    pivotZ: -0.55,
    apexZ: 1.30, roofY: 2.36, roofFrontZ: 0.88, roofRearZ: -0.60, roofRearY: 2.44,
    maxWZ: -0.15, shellRearZ: -1.15, bustleZ1: -2.00, bustleTop: 2.52, bustleBot: 1.88,
    basketZ0: -2.05, basketZ1: -2.90, basketTop: 2.42, basketBot: 1.88, basketHW: 1.05,
    cupolaX: -0.72, cupolaZ: -0.65,
    rearTipZ: -3.55, rearTipH: 0.50,
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
    skirt: { z0: 2.35, z1: -2.65, top: 1.10, bot: 0.30 },
    pivotZ: -0.55,
    apexZ: 1.30, roofY: 2.38, roofFrontZ: 0.88, roofRearZ: -0.60, roofRearY: 2.46,
    maxWZ: -0.15, shellRearZ: -1.15, bustleZ1: -2.00, bustleTop: 2.54, bustleBot: 1.88,
    basketZ0: -2.05, basketZ1: -2.90, basketTop: 2.42, basketBot: 1.88, basketHW: 1.05,
    cupolaX: -0.72, cupolaZ: -0.65,
    rearTipZ: -3.50, rearTipH: 0.50,
    gunTipZ: 4.51, gunZL: 0.40,
    turretKit: merkava2dKit,
  },
  merkava3b: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.32, hwMax: 1.72,
    rearTipZ: -4.02, rearTipH: 0.55, tailRackZ: -4.13,
    gunTipZ: 4.14,
    turretKit: merkava3bKit,
  },
  merkava3c: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.33, hwMax: 1.72,
    rearTipZ: -4.02, rearTipH: 0.55, tailRackZ: -4.13,
    gunTipZ: 4.14,
    turretKit: merkava3cKit,
  },
  merkava3d: {
    build: buildMerkavaMark,
    ...MK3_CHASSIS, ...MK3_TURRET,
    noseZ: 3.35, hwMax: 1.78,
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
    turretStyle: 'mod', pivotZ: -0.35,
    apexZ: 1.44, gunAxisY: 1.60, gunR: 0.068, sleeve: true, evac: 0.30,
    rotorR: 0.115, rotorLen: 0.55,
    notchHW: 0.30, hwMax: 1.57, maxWZ: -0.35, roofHW: 0.74, roofInset: 0.44,
    roofY: 2.13, roofFrontZ: 0.05, roofRearZ: -0.95, roofRearY: 2.13,
    shellRearZ: -2.10, bustleZ1: -2.20, bustleTop: 2.10, bustleBot: 1.55,
    basketZ0: -2.20, basketZ1: -2.88, basketTop: 2.00, basketBot: 1.42, basketHW: 1.05,
    chainDrop: 0.28,
    cupolaX: 0.55, cupolaZ: -0.55, pano: { x: 0.25, z: -0.60 }, sightX: 0.45,
    rearTipZ: -3.30, rearTipH: 0.45,
    rearRailY0: 1.55, rearRailY1: 1.80, rearRailZ: -2.60,
    cornerBins: { y: 1.56, h: 0.42, d: 0.62, z: -2.85 },
    basketOpen: true,
    gunTipZ: 3.44, gunZL: 0.30, antennaH: 0.45, antennaX: 0.85,
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
    turretStyle: 'mod', pivotZ: -0.55,
    apexZ: 2.45, gunAxisY: 2.06, gunR: 0.078, sleeve: true, evac: 0.30,
    rotorR: 0.15, rotorLen: 0.50,
    notchHW: 0.32, hwMax: 1.46, maxWZ: -0.60, roofHW: 0.74, roofInset: 0.46,
    roofY: 2.82, roofFrontZ: -0.15, roofRearZ: -1.35, roofRearY: 2.73,
    shellRearZ: -2.20, bustleZ1: -2.35, bustleTop: 2.62, bustleBot: 1.95,
    basketZ0: -2.35, basketZ1: -3.85, basketTop: 2.45, basketBot: 1.92, basketHW: 1.02,
    chainDrop: 0.30,
    cupolaX: 0.55, cupolaZ: -0.90, pano: { x: -0.35, z: -0.95 }, sightX: 0.45,
    rearTipZ: -3.95, rearTipH: 0.55, tailRackZ: -4.24,
    basketOpen: true,
    gunTipZ: 4.29, gunZL: 0.32, antennaH: 1.75, antennaX: 0.80,
    antennaZ1: -2.30, antennaZ2: -3.00,
    turretKit: merkava4bKit,
  },
};
