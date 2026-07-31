// Leopard 2 lineage + KF51 procedural profiles (fidelity oracles:
// leo2a6_buh, recovered leo2a5 / leo2a7v / leo2_revolution / leopard2_proto,
// kf51_grip420). Owned by the Leopard family agent.
//
// Wave 2: fully bespoke build functions replacing the generic kit profiles
// and canonical-donor variants. Every constant below is a WORLD coordinate
// read off the width-normalized silhouette probes of the local reference
// GLBs (docs/references/tanks/<id>.md packets carry the probe tables and the
// corroborated real dimensions). Original primitive reconstructions only —
// no source mesh data.
//
// Oracle honesty notes (HANDOFF §5/§7):
// - leopard2_proto's bergman print has a SUNKEN turret and a deck-level gun
//   bar; the build makes the real proud PT turret + full 105 mm — its turret
//   and gun component scores are knowingly oracle-capped (see packet).
// - leo2a5's print fuses most of the turret shell into the hull node; the
//   turret channel is partially degenerate (see packet).
//
// WIDTH GUARD: the fidelity lab width-normalizes both models to the spec
// width and crops the gun-overhang metric at the union of both hull masks'
// z-extent. Committed max widths: leo2a6/leo2a5 3.75, leopard2_proto 3.70,
// kf51 3.60, leo2a7v/leo2_revolution 4.00. Nothing may stand wider, and the
// hull z-extents below replicate each oracle's frame.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// Leopard 2 running gear: 7 dual rubber-tired wheels (dark tire rim + hub
// contrast from the 'rubber' style), front idler, REAR drive sprocket, return
// run hidden under the skirts (coveredTop).
function leoGear(P, g) {
  const { buildRunningGear, cylX, box } = KIT;
  // raisedEnds: the kit loop always runs its flat ground band to the loop-end
  // wheels, but the oracles' bottom profiles ramp up at both ends. Pass the
  // REAL raised idler/sprocket in g.idler/g.sprocket with g.raisedEnds=true:
  // the kit loop then gets wheel-height inboard ends (flat run spans only the
  // road wheels) and the visible raised end wheels + wrapped band rings +
  // approach/departure ramps are drawn as static primitives.
  const inboard = g.raisedEnds ? {
    sprocket: { z: g.span[1] - 0.16, y: g.wheelY ?? g.wheelR + 0.03, r: g.wheelR },
    idler: { z: g.span[0] + 0.16, y: g.wheelY ?? g.wheelR + 0.03, r: g.wheelR },
  } : { sprocket: g.sprocket, idler: g.idler };
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.84,
    wheelR: g.wheelR, wheelW: Math.min(0.23, g.trackW * 0.36),
    wheelY: g.wheelY ?? g.wheelR + 0.03, xc: g.xc,
    wheelZs: evenStations(7, g.span[0] - g.span[1], (g.span[0] + g.span[1]) / 2),
    sprocket: inboard.sprocket, idler: inboard.idler, rollers: [],
    trackW: g.trackW, topY: g.topY, botY: g.botY ?? 0.075,
    paintedEnds: true, coveredTop: true,
  });
  if (g.raisedEnds) {
    const seg = P.q ? 20 : 12;
    for (const s of [-1, 1]) {
      P.add('hullDetail', cylX(g.idler.r, 0.16, seg), s * g.xc, g.idler.y, g.idler.z);
      P.add('hullDark', cylX(g.idler.r + 0.05, 0.26, seg), s * g.xc, g.idler.y, g.idler.z);
      P.add('hullDark', box(0.26, 0.07, 0.85), s * g.xc, (g.idler.y - g.idler.r + 0.10) / 2 + 0.03,
        g.idler.z - 0.60, -Math.atan2(g.idler.y - g.idler.r - 0.04, 0.85), 0, 0);
      P.add('hullDetail', cylX(g.sprocket.r, 0.16, seg), s * g.xc, g.sprocket.y, g.sprocket.z);
      P.add('hullDark', cylX(g.sprocket.r + 0.055, 0.26, seg), s * g.xc, g.sprocket.y, g.sprocket.z);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        P.add('hullDetail', box(0.26, 0.06, 0.045), s * g.xc,
          g.sprocket.y + Math.sin(a) * (g.sprocket.r + 0.045), g.sprocket.z + Math.cos(a) * (g.sprocket.r + 0.045), -a, 0, 0);
      }
      P.add('hullDark', box(0.26, 0.07, 0.92), s * g.xc, (g.sprocket.y - g.sprocket.r + 0.10) / 2 + 0.03,
        g.sprocket.z + 0.64, Math.atan2(g.sprocket.y - g.sprocket.r - 0.04, 0.92), 0, 0);
    }
  }
}

// Leopard 2 hull: full-width deck-polyline band, short near-horizontal upper
// glacis meeting the deck at a crease, big raked lower front plate, vertical
// rear plate with exhaust louvres/taillights/shackles, twin circular cooling
// fans + radiator wells on the rear deck, driver station front-right.
// H: { W, skirtX, sponsonY, deck:[[z,y]...front->rear], crease:{z,y},
//     prow:{z,y}, beltY, rear:{z,yTop,yBot}, trackW, xc, wheelR, wheelY?,
//     span, sprocket, idler, topY, skirts:[{z0,z1,y0,y1,seams,heavy}...],
//     fans?:{z,x,r}, driverZ?, fansOnDeck?, mastZ?/mastTop?, antiSlip? }
function leoHull(P, H) {
  const { box, slab, cylY, cylZ, frustum, torus, headlight, liftEye, towCable, periscope } = KIT;
  const hw = H.bodyHW ?? (H.W / 2 - 0.01);
  const innerW = H.W - 2 * H.trackW - 0.12;
  const deck = H.deck;
  const tailZ = H.rear.z;
  const noseZ = H.prow.z;

  // full-width deck band: one wedge slab per polyline segment. deckShellY
  // makes the band a thin floating shell (a7v print: open sponson gap
  // between the low hull courses and the deck plate).
  for (let i = 0; i < deck.length - 1; i++) {
    const [zF, yF] = deck[i], [zR, yR] = deck[i + 1];
    const bottom = H.deckShellY ?? Math.min(H.sponsonY, yF - 0.34, yR - 0.34);
    P.add('hull', slab(
      [-hw, bottom, zF], [hw, bottom, zF], [hw, bottom, zR], [-hw, bottom, zR],
      [-hw, yF, zF], [hw, yF, zF], [hw, yR, zR], [-hw, yR, zR]));
  }
  // deck-edge lip + lower hull + belly
  const bellyY = H.bellyY ?? 0.42;
  P.add('hull', box(hw * 2, 0.035, deck[0][0] - tailZ), 0, H.sponsonY + 0.01, (deck[0][0] + tailZ) / 2);
  P.add('hull', box(innerW, H.sponsonY - bellyY, (deck[0][0] - tailZ) * 0.96),
    0, (H.sponsonY + bellyY) / 2, (deck[0][0] + tailZ) / 2);

  // glacis: crease -> prow crest, then the big raked lower plate to the belt
  const cr = H.crease, pw = H.prow;
  P.add('hull', slab(
    [-hw, pw.y - 0.30, cr.z], [hw, pw.y - 0.30, cr.z], [hw * 0.94, pw.y - 0.26, pw.z], [-hw * 0.94, pw.y - 0.26, pw.z],
    [-hw, cr.y, cr.z], [hw, cr.y, cr.z], [hw * 0.94, pw.y, pw.z], [-hw * 0.94, pw.y, pw.z]));
  P.add('hull', slab(                                                        // raked lower front
    [-hw * 0.88, H.beltY, pw.z - 0.72], [hw * 0.88, H.beltY, pw.z - 0.72],
    [hw * 0.88, H.beltY, pw.z - 0.62], [-hw * 0.88, H.beltY, pw.z - 0.62],
    [-hw * 0.94, pw.y - 0.04, pw.z - 0.06], [hw * 0.94, pw.y - 0.04, pw.z - 0.06],
    [hw * 0.94, pw.y - 0.26, pw.z], [-hw * 0.94, pw.y - 0.26, pw.z]));
  P.add('hull', box(hw * 1.76, 0.40, 1.3), 0, pw.y - 0.52, pw.z - 0.75);     // nose interior fill
  // glacis furniture: crease weld seam, V splash board, tow cable + clamps,
  // anti-slip tread zones, headlight clusters in brush-guard frames
  P.add('hullDark', box(hw * 1.86, 0.014, 0.026), 0, cr.y + 0.008, cr.z + 0.02);
  const gRx = -Math.atan2(cr.y - pw.y, pw.z - cr.z);
  const gMid = (cr.z + pw.z) / 2;
  const gY = (cr.y + pw.y) / 2 + 0.012;
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.92, 0.045, 0.07), s * 0.46, cr.y - 0.045, cr.z + 0.42, gRx, s * 0.42, 0);
    if (H.antiSlip !== false) {
      P.add('hullRubber', box(hw * 0.52, 0.013, (pw.z - cr.z) * 0.62), s * hw * 0.5, gY, gMid, gRx, 0, 0);
    }
    P.add('hull', box(0.28, 0.06, 0.17), s * (hw * 0.78), pw.y + 0.07, pw.z - 0.42, gRx, 0, 0);
    P.add('hullDark', box(0.22, 0.035, 0.05), s * (hw * 0.78), pw.y + 0.085, pw.z - 0.35, gRx, 0, 0);
    P.add('hullGlass', box(0.065, 0.028, 0.02), s * (hw * 0.78 + 0.06), pw.y + 0.09, pw.z - 0.32, gRx, 0, 0);
    for (const d of [-0.16, 0.16]) {
      P.add('hullDetail', box(0.02, 0.06, 0.19), s * (hw * 0.78) + d, pw.y + 0.09, pw.z - 0.40, gRx, 0, 0);
    }
    headlight(P, s * hw * 0.72, H.beltY + 0.28, pw.z - 0.30, -0.5);
  }
  towCable(P, [[-hw * 0.62, gY + 0.02, pw.z - 0.55], [0, cr.y - 0.02, cr.z + 0.35], [hw * 0.62, gY + 0.02, pw.z - 0.55]], 0.028);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.09, 0.07, 0.12), s * hw * 0.62, gY + 0.02, pw.z - 0.55, gRx, 0, 0);

  // driver station front-right: hatch ring + 3 periscopes; ammo hatch left
  const dz = H.driverZ ?? cr.z - 0.55;
  const dy = deck[0][1];
  P.add('hull', cylY(0.27, 0.27, 0.035, P.q ? 22 : 12), 0.60, dy + 0.015, dz);
  P.add('hullDark', torus(0.27, 0.013, P.q ? 22 : 12), 0.60, dy + 0.03, dz);
  periscope(P, 'hullDetail', 0.38, dy + 0.045, dz + 0.34);
  periscope(P, 'hullDetail', 0.60, dy + 0.045, dz + 0.37);
  periscope(P, 'hullDetail', 0.82, dy + 0.045, dz + 0.34, 0.3);
  P.add('hull', cylY(0.24, 0.24, 0.03, P.q ? 20 : 12), -0.60, dy + 0.012, dz);
  P.add('hullDark', torus(0.24, 0.012, P.q ? 20 : 12), -0.60, dy + 0.026, dz);
  P.add('hull', box(0.32, 0.09, 0.46), -hw * 0.72, dy + 0.05, dz + 0.35);    // NBC intake
  P.add('hullDark', box(0.26, 0.045, 0.38), -hw * 0.72, dy + 0.10, dz + 0.35);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.026, 12), s * hw * 0.66, dy + 0.014, dz - 0.72); // filler caps

  // rear deck: twin circular cooling fans + slat bars, longitudinal radiator
  // wells, transverse louver inset, torsion access caps, tow rope on clamps
  if (H.fansOnDeck !== false) {
    const fz = H.fans?.z ?? tailZ + 1.15;
    const fx = H.fans?.x ?? 0.78;
    const fr = H.fans?.r ?? 0.38;
    const fy = deckYAt(deck, fz);
    for (const s of [-1, 1]) {
      P.add('hullDark', cylY(fr, fr, 0.02, P.q ? 26 : 14), s * fx, fy + 0.012, fz);
      P.add('hullDetail', torus(fr, 0.032, P.q ? 24 : 14), s * fx, fy + 0.02, fz);
      P.add('hullDetail', torus(fr * 0.58, 0.018, P.q ? 20 : 12), s * fx, fy + 0.018, fz);
      P.add('hullDetail', cylY(0.07, 0.075, 0.04, 10), s * fx, fy + 0.025, fz);
      for (let k = 0; k < 5; k++) {
        P.add('hullDetail', box((fr * 1.7) - Math.abs(k - 2) * fr * 0.36, 0.012, 0.05),
          s * fx, fy + 0.018, fz - fr * 0.62 + k * fr * 0.31);
      }
      // longitudinal radiator wells beside the fans
      const rx = hw - 0.42;
      P.add('hullDark', box(0.40, 0.02, 1.0), s * rx, fy + 0.010, fz + 0.55);
      for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.34, 0.016, 0.065), s * rx, fy + 0.018, fz + 0.18 + k * 0.18);
      for (const zc of [fz + 1.6, fz + 2.3]) {                                // torsion/fuel caps
        P.add('hullDetail', cylY(0.095, 0.095, 0.024, 12), s * rx, deckYAt(deck, zc) + 0.012, zc);
        P.add('hullDark', torus(0.095, 0.011, 12), s * rx, deckYAt(deck, zc) + 0.02, zc);
      }
    }
    // transverse radiator louver inset at the rearmost deck
    const tz = tailZ + 0.42;
    const ty = deckYAt(deck, tz);
    P.add('hullDark', box(hw * 1.6, 0.02, 0.5), 0, ty + 0.008, tz);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(hw * 1.5, 0.016, 0.065), 0, ty + 0.016, tz - 0.18 + k * 0.12);
    // tow rope lying across the deck in clamp blocks, cast eyes at the ends
    if (H.rope !== false) {
      towCable(P, [[-hw * 0.72, ty + 0.02, fz - 0.55], [-0.5, ty + 0.035, tz - 0.28],
        [0.5, ty + 0.035, tz - 0.28], [hw * 0.72, ty + 0.02, fz - 0.55]], 0.032);
      for (const [cx, cz] of [[-hw * 0.5, fz - 0.3], [0, tz - 0.3], [hw * 0.5, fz - 0.3]]) {
        P.add('hullDetail', box(0.10, 0.06, 0.13), cx, deckYAt(deck, cz) + 0.02, cz);
      }
      for (const s of [-1, 1]) {
        P.add('hullDark', KIT.xform(torus(0.06, 0.022, 12), 0, 0, 0, Math.PI / 2, 0, 0), s * hw * 0.76, ty + 0.02, fz - 0.6);
      }
    }
  }
  // anti-slip deck panels (dark matte zones offset from the paint)
  if (H.antiSlip !== false) {
    const az = (deck[0][0] + tailZ) / 2 + 0.8;
    for (const [ax, azz, aw, ad] of [[-hw * 0.55, az + 0.9, hw * 0.5, 1.0], [hw * 0.58, az + 0.7, hw * 0.42, 1.2], [-hw * 0.78, az - 0.9, 0.5, 1.3]]) {
      P.add('hullRubber', box(aw, 0.012, ad), ax, deckYAt(deck, azz) + 0.012, azz);
      P.add('hullDetail', box(aw + 0.05, 0.007, ad + 0.05), ax, deckYAt(deck, azz) + 0.006, azz);
    }
  }
  liftEye(P, 'hullDetail', -hw * 0.8, deckYAt(deck, 0.4) + 0.02, 0.4);
  liftEye(P, 'hullDetail', hw * 0.8, deckYAt(deck, -0.6) + 0.02, -0.6);

  // vertical rear plate: exhaust louvre strips, taillights, shackles + clevis
  // bows, convoy light, jack block, mud flaps
  const R = H.rear;
  P.add('hull', box(hw * 1.72, R.yTop - R.yBot, 0.12), 0, (R.yTop + R.yBot) / 2, R.z + 0.05);
  P.add('hull', box(innerW, 0.55, 0.10), 0, R.yBot - 0.15, R.z + 0.09);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.62, 0.15, 0.04), s * hw * 0.52, R.yTop - 0.32, R.z - 0.005);
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.58, 0.03, 0.05), s * hw * 0.52, R.yTop - 0.395 + k * 0.062, R.z - 0.015);
    P.add('hullDark', box(0.15, 0.085, 0.04), s * hw * 0.78, R.yTop - 0.12, R.z - 0.005); // taillights
    for (const off of [-0.07, 0.07]) P.add('hullDetail', box(0.05, 0.2, 0.12), s * hw * 0.6 + off, R.yBot + 0.28, R.z - 0.02);
    P.add('hullDetail', KIT.cylX(0.032, 0.24, 8), s * hw * 0.6, R.yBot + 0.30, R.z - 0.06);
    if (H.rearFlaps !== false) P.add('hullRubber', box(0.5, 0.32, 0.028), s * (H.xc ?? hw - H.trackW / 2), R.yBot - 0.02, R.z - 0.04, 0.1, 0, 0);
  }
  P.add('hullDark', box(0.15, 0.09, 0.04), 0, R.yTop - 0.14, R.z - 0.005);   // convoy light
  P.add('hullDetail', box(0.19, 0.026, 0.06), 0, R.yTop - 0.085, R.z - 0.02);
  P.add('hullWood', box(0.26, 0.11, 0.09), 0, R.yBot + 0.10, R.z - 0.02);
  // front mud flaps behind the beak
  if (H.frontFlaps !== false) {
    for (const s of [-1, 1]) P.add('hullRubber', box(0.36, 0.40, 0.03), s * (H.xc ?? hw - H.trackW / 2), H.beltY + 0.06, pw.z - 0.14);
  }

  // side skirts: heavy sculpted front blocks + thinner rear run with panel
  // seams and a dangling rubber lip (or full deep courses per variant)
  for (const sk of H.skirts) {
    const skX = sk.x ?? H.skirtX;
    for (const s of [-1, 1]) {
      const h = sk.y1 - sk.y0;
      const th = sk.heavy ? 0.10 : 0.045;
      P.add('hull', box(th, h, sk.z1 - sk.z0), s * (skX - th / 2), (sk.y0 + sk.y1) / 2, (sk.z0 + sk.z1) / 2);
      if (sk.heavy) {
        P.add('hull', box(th, 0.13, sk.z1 - sk.z0 - 0.05), s * (skX - th / 2), sk.y0 - 0.02, (sk.z0 + sk.z1) / 2, 0, 0, -s * 0.26);
      } else {
        P.add('hullRubber', box(0.028, 0.10, sk.z1 - sk.z0 - 0.04), s * (skX - 0.03), sk.y0 - 0.03, (sk.z0 + sk.z1) / 2);
      }
      const seams = sk.seams ?? 4;
      for (let k = 1; k < seams; k++) {
        const z = sk.z0 + (sk.z1 - sk.z0) * (k / seams);
        P.add('hullDark', box(th + 0.006, h * 0.9, 0.016), s * (skX - th / 2), (sk.y0 + sk.y1) / 2, z);
      }
      for (let k = 0; k < seams; k++) {                                       // lift handles / bolts
        const z = sk.z0 + (sk.z1 - sk.z0) * ((k + 0.5) / seams);
        P.add('hullDark', cylZ(0.02, 0.016, 8), s * (skX - 0.024), sk.y1 - 0.12, z, 0, s * Math.PI / 2, 0);
        P.add('hullDetail', box(0.016, 0.03, 0.12), s * (skX + 0.004), sk.y0 + h * 0.35, z);
      }
    }
  }
  // sponson chamfer strip closing the slot between deck edge and skirt top,
  // with a skirt-mount rail + bolt dots so the flank never reads as one
  // featureless dark band (shaded-parity r1 #7)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.09, 0.16, deck[0][0] - tailZ - 0.2), s * (H.skirtX - 0.05), H.sponsonY + 0.05, (deck[0][0] + tailZ) / 2);
    P.add('hullDetail', box(0.035, 0.05, deck[0][0] - tailZ - 0.3), s * (H.skirtX - 0.005), H.sponsonY + 0.10, (deck[0][0] + tailZ) / 2);
    for (let k = 0; k < 8; k++) {
      const z = tailZ + 0.5 + k * ((deck[0][0] - tailZ - 1.0) / 7);
      P.add('hullDark', cylZ(0.018, 0.014, 8), s * (H.skirtX + 0.006), H.sponsonY + 0.10, z, 0, s * Math.PI / 2, 0);
    }
  }

  leoGear(P, {
    xc: H.xc ?? hw - H.trackW / 2, trackW: H.trackW, wheelR: H.wheelR,
    wheelY: H.wheelY, span: H.span, sprocket: H.sprocket, idler: H.idler, topY: H.topY,
    botY: H.botY, raisedEnds: H.raisedEnds,
  });
  return { hw };
}

function deckYAt(deck, z) {
  for (let i = 0; i < deck.length - 1; i++) {
    const [z0, y0] = deck[i], [z1, y1] = deck[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
      const t = (z - z0) / (z1 - z0 || 1);
      return y0 + (y1 - y0) * t;
    }
  }
  return deck[deck.length - 1][1];
}

// Arrowhead wedge turret (A5/A6/A7V): core welded box fully behind TWO thin
// spaced wedge shells with a dark standoff gap, meeting in a plan-view arrow
// ahead of a plate mantlet slot. All coordinates are turret-local.
// T: { tw (wedge tip half-width), boxW, h, boxFront, boxRear, apexZ,
//     gunY (mantlet slot center), sideModules? }
function wedgeTurretShell(P, T) {
  const { box, slab, frustum } = KIT;
  const tw = T.tw, h = T.h;
  const aB = T.apexY ?? 0.04;                 // apex tier base (a7v rides high)
  P.add('turret', frustum(T.boxW, T.boxFront, T.boxRear, T.boxW * 0.96, T.boxFront - 0.03, T.boxRear + 0.03, T.baseY ?? 0.0, h));
  const aZ = T.apexZ, aF = T.boxFront;
  // apex tier: thin near-horizontal arrow plates sweeping under the gun
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.03, aB, aZ], [s * tw, aB, aF + 0.02], [s * tw, aB, aF - 0.14], [s * 0.03, aB, aZ - 0.16],
      [s * 0.03, aB + 0.16, aZ - 0.08], [s * tw, aB + 0.16, aF - 0.06], [s * tw, aB + 0.16, aF - 0.22], [s * 0.03, aB + 0.16, aZ - 0.24]));
    // upper tier: the big wedge planes cresting the roofline
    P.add('turret', slab(
      [s * T.gunW, aB + 0.16, aZ - 0.38], [s * tw, aB + 0.16, aF - 0.06], [s * tw, aB + 0.16, aF - 0.22], [s * T.gunW, aB + 0.16, aZ - 0.54],
      [s * T.gunW, h + 0.06, aZ - 0.86], [s * tw, h + 0.06, aF - 0.56], [s * tw, h + 0.06, aF - 0.72], [s * T.gunW, h + 0.06, aZ - 1.02]));
    // dark standoff wall behind the upper shell (spaced-armor shadow gap)
    P.add('turretDark', slab(
      [s * (T.gunW - 0.02), aB + 0.26, aZ - 0.62], [s * (tw - 0.06), aB + 0.26, aF - 0.30], [s * (tw - 0.06), aB + 0.26, aF - 0.38], [s * (T.gunW - 0.02), aB + 0.26, aZ - 0.70],
      [s * (T.gunW - 0.02), h - 0.04, aZ - 0.94], [s * (tw - 0.06), h - 0.04, aF - 0.62], [s * (tw - 0.06), h - 0.04, aF - 0.70], [s * (T.gunW - 0.02), h - 0.04, aZ - 1.02]));
  }
  // mantlet slot: painted back wall + dark cheek walls
  const slotZ = T.slotZ ?? (aZ - 1.02);
  P.add('turret', box(T.gunW * 2 + 0.06, h * 0.8, 0.06), 0, h * 0.42, slotZ);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, h * 0.74, 0.9), s * (T.gunW + 0.03), h * 0.42, slotZ + 0.42);
  }
  // side armor modules continuing the wedge mass around the corners
  for (const s of [-1, 1]) {
    P.add('turret', box(0.10, h * 0.64, (T.boxFront - T.boxRear) * 0.42), s * (T.boxW + 0.05), h * 0.44, (T.boxFront + T.boxRear) / 2 + 0.35);
    P.add('turretDark', box(0.02, h * 0.56, 0.025), s * (T.boxW + 0.105), h * 0.44, (T.boxFront + T.boxRear) / 2 + 0.35);
  }
}

// Leopard 2 roof furniture + bustle. Turret-local coordinates.
// R: { h, boxW, boxRear, emes:{x,z}, peri:{x,z,top}, cmdr:{x,z}, loader:{x,z},
//     mastZ, antennaZ/antennaTop, rackZ, rackTop, basketZ0?, smoke:{z,y} }
function leoTurretRoof(P, R) {
  const { box, cylY, cylZ, slab, periscope, liftEye, smokeCluster, stowage, jerryCan, tarpRoll, ammoCan, spareTrackStrip } = KIT;
  const h = R.h;
  // EMES 15 gunner sight: rectangular cutout recessed into the right wedge
  // roof edge — dark well, armored head, brow lid, shutter face + glass
  P.add('turretDark', box(0.56, 0.22, 0.48), R.emes.x, h - 0.10, R.emes.z);
  P.add('turret', box(0.46, 0.22, 0.38), R.emes.x, h - 0.06, R.emes.z - 0.02);
  P.add('turretDetail', box(0.50, 0.04, 0.42), R.emes.x, h + 0.055, R.emes.z - 0.04);
  P.add('turretDark', box(0.34, 0.16, 0.035), R.emes.x, h - 0.05, R.emes.z + 0.19);
  P.add('turretGlass', box(0.26, 0.10, 0.018), R.emes.x, h - 0.05, R.emes.z + 0.21);
  // PERI R17 panoramic periscope on its stalk (tallest fixed point)
  P.add('turretDetail', cylY(0.055, 0.065, R.peri.top - h - 0.30, 12), R.peri.x, (h + R.peri.top - 0.30) / 2, R.peri.z);
  P.add('turretDetail', cylY(0.08, 0.08, 0.06, 12), R.peri.x, R.peri.top - 0.26, R.peri.z);
  P.add('turretDark', box(0.17, 0.20, 0.19), R.peri.x, R.peri.top - 0.12, R.peri.z);
  P.add('turretGlass', box(0.11, 0.10, 0.018), R.peri.x, R.peri.top - 0.10, R.peri.z + 0.10);
  // commander + loader hatch rings with lids and periscope blocks
  for (const [st, lo] of [[R.cmdr, false], [R.loader, true]]) {
    P.add('turret', cylY(lo ? 0.22 : 0.24, lo ? 0.22 : 0.24, 0.05, 14), st.x, h + 0.025, st.z);
    P.add('turret', cylY(lo ? 0.19 : 0.21, lo ? 0.19 : 0.21, 0.028, 14), st.x, h + 0.066, st.z);
    P.add('turretDark', box((lo ? 0.34 : 0.38), 0.014, 0.035), st.x, h + 0.085, st.z);
    if (!lo) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add('turretDark', box(0.06, 0.045, 0.02), st.x + Math.sin(a) * 0.20, h + 0.045, st.z + Math.cos(a) * 0.20, 0, a, 0);
    }
  }
  periscope(P, 'turretDetail', R.cmdr.x, h + 0.01, R.cmdr.z + 0.33);
  // crosswind sensor mast at the rear roof + whip antennas at the bustle
  // (mastTop/antennaTop are LOCAL absolutes — the published-height p95 rule
  // allows only 1-2 spike columns, so masts/whips stay near the roofline)
  const mTop = R.mastTop ?? (h + 0.34);
  P.add('turretDetail', cylY(0.014, 0.018, mTop - h - 0.06, 8), R.mastZ != null ? -0.85 : 0, (h + mTop - 0.06) / 2, R.mastZ ?? R.boxRear + 0.4);
  P.add('turretDark', box(0.04, 0.04, 0.11), R.mastZ != null ? -0.85 : 0, mTop - 0.02, R.mastZ ?? R.boxRear + 0.4);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.03, R.antennaTop - h, 0.03),
      s * (R.boxW - 0.18), h + (R.antennaTop - h) / 2, R.antennaZ, 0, 0, s * 0.05);
    P.add('turretDetail', box(0.06, 0.14, 0.06), s * (R.boxW - 0.18), h + 0.06, R.antennaZ); // antenna base pot
  }
  // full-width slatted bustle stowage rack with mesh floor + strapped kit
  const rackZ = R.rackZ, rackT = R.rackTop, rackB = R.rackBottom ?? 0.02;
  P.add('turretDetail', box(2 * R.boxW + 0.26, 0.045, 0.045), 0, rackT, rackZ);
  P.add('turretDetail', box(2 * R.boxW + 0.26, 0.045, 0.045), 0, rackB, rackZ);
  for (let k = 0; k <= 12; k++) {
    P.add('turretDetail', box(0.032, rackT - rackB, 0.032), -R.boxW - 0.08 + k * ((2 * R.boxW + 0.16) / 12), (rackT + rackB) / 2, rackZ);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.045, 0.045, R.boxRear - rackZ + 0.05), s * (R.boxW + 0.09), rackT, (R.boxRear + rackZ) / 2);
    P.add('turretDetail', box(0.045, 0.045, R.boxRear - rackZ + 0.05), s * (R.boxW + 0.09), rackB, (R.boxRear + rackZ) / 2);
  }
  P.add('turretDark', box(2 * R.boxW + 0.1, 0.018, R.boxRear - rackZ), 0, rackB + 0.03, (R.boxRear + rackZ) / 2);
  const bz = (R.boxRear + rackZ) / 2;
  stowage(P, 'turretCloth', P.rng, [
    [-R.boxW * 0.55, 0.40, bz, 0.72, 0.42, 0.38], [R.boxW * 0.15, 0.36, bz - 0.02, 0.62, 0.36, 0.36],
    [R.boxW * 0.72, 0.38, bz, 0.5, 0.40, 0.34],
  ]);
  jerryCan(P, 'turretCloth', -R.boxW * 0.92, 0.36, bz, 0.15);
  tarpRoll(P, 'turretCloth', R.boxW * 0.45, 0.58, bz, 1.05, 0.095, true, P.q ? 12 : 8);
  ammoCan(P, 'turretDark', R.boxW * 0.95, 0.32, bz, 0.2);
  spareTrackStrip(P, 'turret', -R.boxW * 0.3, 0.60, bz, 2, 0, 0);
  // 2x4 Wegmann smoke mortars per side on mount plates, rear cheeks
  // (held inside the wedge-tip width so the turret front mask stays honest)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.05, 0.24, 0.58), s * (R.boxW - 0.01), R.smoke.y, R.smoke.z, 0, s * 0.22, 0);
    smokeCluster(P, s * (R.boxW + 0.02), R.smoke.y + 0.11, R.smoke.z + 0.16, 4, s * 1.05, 0.85);
    smokeCluster(P, s * (R.boxW + 0.04), R.smoke.y - 0.05, R.smoke.z - 0.04, 4, s * 1.2, 0.85);
  }
  for (const s of [-1, 1]) liftEye(P, 'turretDetail', s * (R.boxW * 0.8), h + 0.02, R.emes.z - 0.55, s * 0.4);
}

// Plate mantlet sealed by a trunnion-axis roll (rotation-invariant about the
// gun pivot — no void can open at min/max elevation) + Rh 120/130 tube.
// G: { rollR, rollW, plateW, plateH, len, r, evac, evacR, sleeve, mrs }
function leoMantletGun(P, G) {
  const { box, cylX, cylZ, buildGun } = KIT;
  P.addGunExtra(cylX(G.rollR, G.rollW, P.q ? 18 : 12), 0, 0, 0);              // trunnion roll
  P.addGunExtra(box(G.plateW, G.plateH, 0.26), 0, 0, G.rollR * 0.62);         // plate mantlet
  P.addGunExtra(box(G.plateW * 1.3, G.plateH * 0.62, 0.14), 0, 0, G.rollR * 0.30); // yoke
  P.addGunExtra(cylZ(G.r * 1.7, 0.30, 12, G.r * 2.0), 0, 0, G.rollR * 0.62 + 0.16); // root collar
  P.addGunExtraDark(cylZ(0.028, 0.10, 8), G.plateW * 0.38, 0.06, G.rollR * 0.62 + 0.10); // coax port
  buildGun(P, {
    len: G.len, r: G.r, sleeve: G.sleeve !== false,
    evac: G.evac ?? 0.56, evacR: G.evacR ?? 1.9,
    collar: G.mrs !== false, baseR: Math.max(0.15, G.r * 1.9),
  });
}

// ---------------------------------------------------------------------------
// Leopard 2A6 — docs/references/tanks/leo2a6.md (leo2a6_buh oracle)
// hull ±3.75/+3.76, deck 1.78 fore / 1.95 aft, wedge turret roof ~2.55,
// PERI 2.93, L/55 muzzle z 8.27 at axis ~2.02, antennas to ~4.2.
// ---------------------------------------------------------------------------
function buildLeo2A6(P) {
  leoHull(P, {
    W: 3.75, bodyHW: 1.66, skirtX: 1.79, sponsonY: 1.40, trackW: 0.46, xc: 1.38,
    deck: [[2.05, 1.59], [1.0, 1.61], [-0.6, 1.63], [-1.05, 1.72], [-2.6, 1.79], [-3.5, 1.82], [-3.83, 1.80]],
    crease: { z: 2.05, y: 1.59 }, prow: { z: 3.83, y: 1.41 }, beltY: 0.66,
    rear: { z: -3.83, yTop: 1.78, yBot: 0.52 }, rearFlaps: false, frontFlaps: false,
    wheelR: 0.365, wheelY: 0.39, span: [2.75, -2.5], raisedEnds: true,
    sprocket: { z: -3.38, y: 0.66, r: 0.29 }, idler: { z: 3.32, y: 0.60, r: 0.27 }, topY: 0.95,
    skirts: [
      { z0: 1.28, z1: 3.34, y0: 0.79, y1: 1.26, seams: 3, heavy: true, x: 1.875 },
      { z0: -3.52, z1: 1.28, y0: 0.79, y1: 1.32, seams: 5, x: 1.79 },
    ],
    fans: { z: -2.55, x: 0.78, r: 0.38 },
  });
  P.decal('hull', 'number', 'Y-241', 0.26, [0.62, 1.22, -3.93], Math.PI, 0);

  // turret: ring at z 0.35, roof 2.42 (h 0.72 over pivot 1.70), wedge apex
  // world z 2.75, box rear -2.15, basket to -2.77, antennas to 4.16
  P.turretG.position.set(0, 1.77, 0.35);
  wedgeTurretShell(P, { tw: 1.42, boxW: 1.28, h: 0.76, apexY: 0.16, boxFront: 0.30, boxRear: -2.50, apexZ: 2.95, slotZ: 1.38, gunW: 0.36 });
  leoTurretRoof(P, {
    h: 0.76, boxW: 1.28, boxRear: -2.50,
    emes: { x: 0.72, z: 0.72 }, peri: { x: 0.38, z: -0.80, top: 1.23 },
    cmdr: { x: 0.62, z: -0.42 }, loader: { x: -0.66, z: -0.30 },
    mastZ: -2.15, mastTop: 0.86, antennaZ: -2.30, antennaTop: 0.86,
    rackZ: -3.12, rackTop: 0.68, rackBottom: -0.06, smoke: { z: -1.35, y: 0.40 },
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.36, -0.9], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.36, -0.9], -Math.PI / 2);
  // L/55: trunnion world z 1.55, axis 1.96, muzzle 8.27; the buh mantlet
  // block protrudes deep into the arrow notch (z 2.4..3.3, y 1.67..2.31)
  P.gunG.position.set(0, 0.20, 1.20);
  P.addGunExtra(KIT.box(0.50, 0.54, 0.92), 0, -0.02, 1.24);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.68, plateW: 0.58, plateH: 0.48, len: 5.52, r: 0.085, evac: 0.58, evacR: 1.8 });
  P.topY = 1.20;
}

// ---------------------------------------------------------------------------
// Leopard 2A5 — docs/references/tanks/leo2a5.md (recovered oracle; turret
// shell partially fused into the hull node — turret channel oracle-capped).
// hull ±3.94/3.95, deck 1.84 fore / 1.95 aft, roof ~2.61, L/44 muzzle 6.02.
// ---------------------------------------------------------------------------
function buildLeo2A5(P) {
  leoHull(P, {
    W: 3.75, bodyHW: 1.66, skirtX: 1.79, sponsonY: 1.40, trackW: 0.46, xc: 1.38,
    deck: [[2.35, 1.72], [0.8, 1.75], [-0.7, 1.75], [-1.2, 1.80], [-2.6, 1.84], [-3.5, 1.86], [-3.87, 1.84]],
    crease: { z: 2.35, y: 1.72 }, prow: { z: 3.87, y: 1.46 }, beltY: 0.68,
    rear: { z: -3.87, yTop: 1.83, yBot: 0.55 }, rearFlaps: false, frontFlaps: false,
    wheelR: 0.37, wheelY: 0.395, span: [2.9, -2.6], raisedEnds: true,
    sprocket: { z: -3.40, y: 0.66, r: 0.30 }, idler: { z: 3.36, y: 0.60, r: 0.28 }, topY: 0.97,
    skirts: [
      { z0: 1.25, z1: 3.40, y0: 0.79, y1: 1.28, seams: 3, heavy: true, x: 1.875 },
      { z0: -3.54, z1: 1.25, y0: 0.79, y1: 1.32, seams: 5, x: 1.79 },
    ],
    fans: { z: -2.7, x: 0.78, r: 0.38 },
  });
  P.decal('hull', 'number', 'Y-508', 0.26, [0.62, 1.22, -3.93], Math.PI, 0);

  // turret: ring z 0.30, roof 2.54 (pivot 1.78, h 0.76), apex world 2.68,
  // box rear -2.20, basket -2.92, hatch/PERI cluster peaking ~3.02
  P.turretG.position.set(0, 1.78, 0.30);
  wedgeTurretShell(P, { tw: 1.42, boxW: 1.28, h: 0.76, boxFront: 0.32, boxRear: -2.50, apexZ: 2.38, gunW: 0.36 });
  leoTurretRoof(P, {
    h: 0.76, boxW: 1.28, boxRear: -2.50,
    emes: { x: 0.72, z: 0.74 }, peri: { x: 0.35, z: -0.55, top: 1.24 },
    cmdr: { x: 0.60, z: -0.20 }, loader: { x: -0.66, z: -0.20 },
    mastZ: -2.15, mastTop: 0.84, antennaZ: -2.25, antennaTop: 0.82,
    rackZ: -3.22, rackTop: 0.72, rackBottom: -0.06, smoke: { z: -1.35, y: 0.42 },
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.38, -0.85], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.38, -0.85], -Math.PI / 2);
  // L/44: trunnion world z 1.45, axis 2.0, muzzle 6.02 (2.07 m overhang)
  P.gunG.position.set(0, 0.22, 1.15);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.68, plateW: 0.58, plateH: 0.48, len: 4.63, r: 0.085, evac: 0.52, evacR: 1.8 });
  P.topY = 1.24;
}

// ---------------------------------------------------------------------------
// Leopard 2A7V — docs/references/tanks/leo2a7v.md (desirefx oracle).
// GATE-V9 DIMS-SOVEREIGN REBUILD: the print is proportionally defective
// (width-normalized to 4.00 it reads hull 8.47 m / deck 2.7 / roof 3.24 —
// +10..+23% over the published envelope, certified in the packet), so the
// build now carries the PUBLISHED 2A7V: hull −3.86..+3.86 (7.72), width
// 4.00 over the deep modular skirts (±2.00 exactly), turret roof 2.48 with
// the EMES hood anchoring the 2.64 published height, PERI 2.90 + one slim
// bustle sensor mast as the spike-column budget, L/55A1 muzzle +7.11
// (overall 10.97). Curve components vs this oracle are capped (packet).
// ---------------------------------------------------------------------------
function buildLeo2A7V(P) {
  const { box, cylY } = KIT;
  leoHull(P, {
    W: 4.0, bodyHW: 1.86, skirtX: 1.90, sponsonY: 1.24, trackW: 0.66, xc: 1.56,
    deck: [[2.05, 1.60], [0.5, 1.62], [-1.0, 1.72], [-2.6, 1.79], [-3.4, 1.82], [-3.75, 1.80]],
    crease: { z: 2.05, y: 1.60 }, prow: { z: 3.75, y: 1.42 }, beltY: 0.66,
    rear: { z: -3.75, yTop: 1.78, yBot: 0.52 },
    wheelR: 0.365, wheelY: 0.39, span: [2.75, -2.5],
    sprocket: { z: -3.36, y: 0.64, r: 0.31 }, idler: { z: 3.30, y: 0.56, r: 0.30 }, topY: 0.95,
    // A7V deep modular skirt courses, full length — widest mesh ±2.00 EXACT
    skirts: [
      { z0: 0.9, z1: 3.58, y0: 0.42, y1: 1.30, seams: 3, heavy: true, x: 1.98 },
      { z0: -3.45, z1: 0.9, y0: 0.44, y1: 1.28, seams: 6, heavy: true, x: 1.98 },
    ],
    fans: { z: -2.6, x: 0.80, r: 0.38 },
  });
  // rear APU/cooling boxes on the rear deck shoulders (kept inside 1.78+)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.20, 0.70), s * 1.55, 1.86, -3.35);
    P.add('hullDark', box(0.26, 0.05, 0.60), s * 1.55, 1.97, -3.35);
  }
  P.decal('hull', 'number', 'Y-877', 0.26, [0.62, 1.22, -3.93], Math.PI, 0);

  // turret: A5/A6 wedge family shell with the A7V roof fit; ring z 0.35,
  // pivot 1.72; EMES hood (lid ~2.66) anchors the published 2.64 height
  P.turretG.position.set(0, 1.72, 0.35);
  wedgeTurretShell(P, { tw: 1.42, boxW: 1.28, h: 0.74, apexY: 0.14, boxFront: 0.30, boxRear: -2.50, apexZ: 2.90, slotZ: 1.40, gunW: 0.36 });
  leoTurretRoof(P, {
    h: 0.74, boxW: 1.28, boxRear: -2.50,
    emes: { x: 0.70, z: 0.80 }, peri: { x: 0.36, z: -0.55, top: 0.94 },
    cmdr: { x: 0.60, z: -0.25 }, loader: { x: -0.64, z: -0.22 },
    mastZ: -2.10, mastTop: 0.84, antennaZ: -2.28, antennaTop: 0.84,
    rackZ: -3.10, rackTop: 0.70, rackBottom: -0.05, smoke: { z: -1.30, y: 0.40 },
  });
  // the A7V identity sensor mast on the bustle — ONE slim spike column
  P.add('turretDetail', cylY(0.024, 0.032, 0.24, 8), -0.45, 0.74 + 0.12, -2.60);
  P.add('turretDark', box(0.09, 0.12, 0.09), -0.45, 0.88, -2.60);              // head top 2.66 world
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.36, -0.85], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.36, -0.85], -Math.PI / 2);
  // L/55A1: trunnion world z 1.55, axis 1.98, muzzle 7.11 (overall 10.97)
  P.gunG.position.set(0, 0.26, 1.20);
  P.addGunExtra(KIT.box(0.50, 0.54, 0.90), 0, -0.02, 1.22);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.66, plateW: 0.58, plateH: 0.48, len: 5.45, r: 0.084, evac: 0.58, evacR: 1.75 });
  P.topY = 1.24;
}

// ---------------------------------------------------------------------------
// Leopard 2 Prototype — docs/references/tanks/leopard2_proto.md. Bergman
// oracle is a sunken-turret tub: hull matches the print; the turret is the
// REAL proud PT slab turret (rangefinder blisters, base bulge) + 105 mm
// smoothbore. Turret/gun scores knowingly oracle-capped.
// ---------------------------------------------------------------------------
function buildLeo2Proto(P) {
  const { box, cylY, cylZ, sph, xform } = KIT;
  leoHull(P, {
    W: 3.70, bodyHW: 1.82, skirtX: 1.82, sponsonY: 1.22, trackW: 0.61, xc: 1.46,
    deck: [[2.0, 1.58], [1.35, 1.69], [0.9, 1.71], [-0.6, 1.67], [-1.5, 1.77], [-2.6, 1.83], [-3.5, 1.86], [-4.05, 1.81]],
    crease: { z: 2.0, y: 1.58 }, prow: { z: 3.44, y: 1.42 }, beltY: 0.72,
    rear: { z: -4.05, yTop: 1.78, yBot: 0.52 },
    wheelR: 0.365, wheelY: 0.39, span: [2.3, -2.85],
    sprocket: { z: -3.52, y: 0.60, r: 0.30 }, idler: { z: 3.12, y: 0.66, r: 0.29 }, topY: 0.95,
    // early flat slab skirts, full length (no sculpted A5 blocks)
    skirts: [{ z0: -3.5, z1: 3.30, y0: 0.56, y1: 1.20, seams: 7 }],
    fans: { z: -2.9, x: 0.76, r: 0.36 }, rope: false,
  });
  P.add('hull', box(1.35, 0.26, 0.10), 0, 1.60, -4.06);                        // rear bin (print's tail scrap)
  P.decal('hull', 'number', 'Y-014', 0.26, [0.62, 1.22, -4.12], Math.PI, 0);

  // PT slab turret: low welded box with rounded cheeks, base-ring bulge,
  // stereoscopic rangefinder blisters on BOTH cheeks, simple hatches.
  P.turretG.position.set(0, 1.74, -0.55);
  P.add('turret', cylY(1.30, 1.36, 0.14, P.q ? 24 : 14, false), 0, 0.03, -0.05, 0, 0, 0, [1, 1, 1.15]); // base bulge
  P.add('turret', KIT.polyTurret([
    [-0.30, 1.32], [0.30, 1.32], [0.92, 0.98], [1.12, 0.30],
    [1.06, -1.28], [-1.06, -1.28], [-1.12, 0.30], [-0.92, 0.98],
  ], 0.56, 1.04, 0.86));
  P.add('turret', box(1.84, 0.10, 1.30), 0, 0.51, -0.45);                      // roof plate
  for (const s of [-1, 1]) {                                                   // rangefinder blisters
    P.add('turret', xform(sph(0.17, P.q ? 16 : 10), 0, 0, 0, 0, 0, 0, [1.0, 0.72, 1.5]), s * 1.06, 0.34, 0.42);
    P.add('turretDark', KIT.cylX(0.085, 0.03, 10), s * 1.145, 0.34, 0.42);
  }
  KIT.cupola(P, 'turret', 0.52, 0.56, -0.55, 0.24, 0.10, 6);                   // commander cupola
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.55, 0.575, -0.42);            // loader hatch
  P.add('turretDark', box(0.34, 0.013, 0.035), -0.55, 0.605, -0.42);
  KIT.periscope(P, 'turretDetail', 0.30, 0.60, 0.10);                          // gunner periscope
  P.add('turretDetail', box(0.14, 0.15, 0.15), -0.42, 0.60, 0.30);             // IR light box
  P.add('turretGlass', box(0.10, 0.10, 0.02), -0.42, 0.60, 0.385);
  P.add('turretDetail', cylY(0.014, 0.018, 0.30, 8), -0.9, 0.70, -1.05);       // anemometer mast
  P.add('turretDark', box(0.14, 0.026, 0.026), -0.9, 0.87, -1.05);
  P.add('turret', box(1.55, 0.30, 0.24), 0, 0.24, -1.42);                      // bustle stowage box
  P.add('turretDetail', box(1.55, 0.03, 0.03), 0, 0.44, -1.44);
  for (const s of [-1, 1]) {
    KIT.smokeCluster(P, s * 1.02, 0.30, 0.28, 4, s * 1.0, 0.8);                // early smoke mortars
    P.add('turretDetail', box(0.02, 0.02, 0.85), s * 1.10, 0.30, -0.65);       // grab rails
    KIT.liftEye(P, 'turretDetail', s * 0.82, 0.56, -0.15, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.34, [1.10, 0.24, -0.5], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.34, [-1.10, 0.24, -0.5], -Math.PI / 2);
  // 105 mm smoothbore: bare tube + mid evacuator, narrow plate mantlet.
  // Real overhang ≈2.25 m past the 3.54 bow (oracle's deck-level bar ignored);
  // trunnion rides low in the low-profile PT turret.
  P.gunG.position.set(0, 0.10, 1.50);
  P.addGunExtra(KIT.cylX(0.20, 0.52, P.q ? 16 : 12), 0, 0, 0);                 // trunnion roll
  P.addGunExtra(box(0.42, 0.36, 0.20), 0, 0, 0.18);                            // narrow plate mantlet
  P.addGunExtra(cylZ(0.10, 0.28, 12, 0.125), 0, 0, 0.34);
  P.addGunExtraDark(cylZ(0.025, 0.09, 8), 0.19, 0.05, 0.22);                   // coax port
  KIT.buildGun(P, { len: 4.80, r: 0.062, sleeve: false, evac: 0.55, evacR: 1.8, collar: false, baseR: 0.12 });
  P.topY = 0.75;
}

// ---------------------------------------------------------------------------
// Leopard 2 Revolution — docs/references/tanks/leo2_revolution.md. GATE-V9
// REBUILD from docs/references/profiles/leo2_revolution.json. Oracle hull
// spans EXACTLY the published 7.72 (−4.91..+2.81 world) at width 4.00:
// full-width AMAP skirt walls ±2.00 (y 0.64..1.70), inset upper course
// ±1.62 to 2.05, deck edge ±1.45 (2.08), rear corner posts 2.20-2.33
// (−3.14..−3.85), rear slat rack full width to −4.91 (bottom ramps
// 0.48→1.13), bow shelf 2.02 over z 1.05..2.45 with beak toe to +2.81
// (band 0.92..1.04); tracks ±1.45 to ground between ramps. Turret roofline
// slopes 1.96 (front, z 1.71) → 2.38 (−1.6); rear station plateau (oracle
// 2.84-2.86) rides over −2.37..−3.03 with twin whips to 4.0 at −3.2 —
// published height 2.64 caps the station at 2.66 (p95 anchor; whips are
// the spike budget). Gun axis 1.84, tube band Ø0.19, muzzle 5.06
// (published overall 9.97; oracle tube ends 4.90 → 1-2 cover columns).
// ---------------------------------------------------------------------------
function buildLeo2Revolution(P) {
  const { box, slab, cylY, cylZ, frustum, torus, periscope, liftEye } = KIT;
  // ---- hull ----
  P.add('hull', box(2.28, 0.88, 6.15), 0, 0.86, -0.90);                        // tub y 0.42..1.30, z −3.97..2.17
  // deck plates: fighting deck 2.08 edge at ±1.45, engine deck aft, rear
  // deck 1.70 aft of the AMAP courses
  P.add('hull', box(2.90, 0.05, 4.60), 0, 2.055, -1.20);                       // main deck y 2.03..2.08, z −3.5..1.1
  P.add('hull', box(2.90, 0.34, 4.55), 0, 1.85, -1.22);                        // deck underfill
  P.add('hull', box(2.70, 0.05, 1.15), 0, 1.675, -4.32);                       // rear deck 1.70
  P.add('hull', box(2.70, 0.50, 1.10), 0, 1.42, -4.30);                        // rear deck underfill
  // sloped joint deck course between main deck and rear deck
  P.add('hull', slab(
    [-1.35, 1.30, -3.48], [1.35, 1.30, -3.48], [1.35, 1.15, -3.92], [-1.35, 1.15, -3.92],
    [-1.35, 2.05, -3.48], [1.35, 2.05, -3.48], [1.35, 1.70, -3.92], [-1.35, 1.70, -3.92]));
  // AMAP flank: outer skirt wall ±2.00 (WIDTH GUARD 4.00 — widest mesh),
  // inset upper course ±1.62 to 2.05
  for (const s of [-1, 1]) {
    // outer wall modules (y 0.64..1.70) with the print's inter-module gaps
    for (const [z0, z1] of [[-3.55, -1.95], [-0.80, 0.02], [0.63, 1.05]]) {
      const zm = (z0 + z1) / 2, zl = z1 - z0;
      P.add('hull', box(0.07, 1.06, zl), s * 1.965, 1.17, zm);
      P.add('hullDark', box(0.02, 0.10, zl * 0.96), s * 1.956, 0.685, zm);
      const n = Math.max(2, Math.round(zl / 0.8));
      for (let k = 0; k < n; k++) P.add('hullDark', box(0.06, 0.92, 0.02), s * 1.968, 1.16, z0 + 0.1 + k * ((zl - 0.2) / Math.max(1, n - 1)));
    }
    // inset upper course segments to 2.05
    for (const [z0, z1] of [[-3.55, -1.90], [-0.85, 1.05]]) {
      P.add('hull', box(0.09, 0.40, z1 - z0), s * 1.575, 1.85, (z0 + z1) / 2);
      for (let k = 0; k < 3; k++) P.add('hullDark', box(0.096, 0.32, 0.018), s * 1.575, 1.84, z0 + 0.3 + k * ((z1 - z0 - 0.6) / 2));
    }
    // rear corner posts 2.20→2.33 over −3.14..−3.85
    P.add('hull', box(0.55, 0.52, 0.75), s * 1.20, 2.05, -3.50);
    P.add('hullDark', box(0.35, 0.10, 0.45), s * 1.20, 2.26, -3.55);
  }
  // rear slat rack: full width ±2.0, z −4.25..−4.91, slanted bottom
  // 0.48→1.13, standing to 2.46 (the print's tall tail course)
  P.add('hullDetail', box(3.94, 0.05, 0.05), 0, 2.44, -4.84);
  P.add('hullDetail', box(3.94, 0.05, 0.05), 0, 1.20, -4.88);
  for (let k = 0; k < 13; k++) {
    P.add('hullDetail', box(0.032, 1.30, 0.032), -1.92 + k * 0.32, 1.80, -4.83, 0.12, 0, 0);
  }
  P.add('hullDark', box(3.86, 1.10, 0.02), 0, 1.85, -4.86);
  KIT.stowage(P, 'hullCloth', P.rng, [[-0.9, 2.06, -4.55, 1.4, 0.5, 0.5], [0.8, 2.0, -4.55, 1.2, 0.44, 0.5]]);
  P.add('hull', slab(                                                          // rack tray (slanted underside)
    [-1.95, 0.50, -4.10], [1.95, 0.50, -4.10], [1.95, 1.10, -4.88], [-1.95, 1.10, -4.88],
    [-1.95, 0.72, -4.10], [1.95, 0.72, -4.10], [1.95, 1.32, -4.88], [-1.95, 1.32, -4.88]));
  KIT.stowage(P, 'hullCloth', P.rng, [[-0.7, 1.52, -4.45, 0.9, 0.36, 0.5], [0.6, 1.50, -4.48, 0.8, 0.34, 0.45]]);
  // rear plate + louvres under the rack
  P.add('hull', box(2.60, 0.85, 0.10), 0, 0.85, -4.16);
  P.add('hullDark', box(2.10, 0.30, 0.04), 0, 0.95, -4.20);
  for (const s of [-1, 1]) P.add('hullDark', box(0.14, 0.08, 0.04), s * 1.15, 1.55, -4.88);
  // bow shelf: top 2.02, plan (±1.97,1.05)→(±1.86,2.30)→tip (±1.02,2.83)
  P.add('hull', slab(
    [-1.95, 1.72, 1.05], [1.95, 1.72, 1.05], [1.84, 1.64, 2.30], [-1.84, 1.64, 2.30],
    [-1.95, 2.02, 1.05], [1.95, 2.02, 1.05], [1.84, 2.00, 2.30], [-1.84, 2.00, 2.30]));
  P.add('hull', slab(
    [-1.84, 1.64, 2.30], [1.84, 1.64, 2.30], [1.02, 1.60, 2.80], [-1.02, 1.60, 2.80],
    [-1.84, 2.00, 2.30], [1.84, 2.00, 2.30], [1.02, 1.97, 2.80], [-1.02, 1.97, 2.80]));
  // beak: shelf tip down to the toe (+2.81, band 0.92..1.04)
  P.add('hull', slab(
    [-1.05, 0.92, 2.81], [1.05, 0.92, 2.81], [1.30, 0.65, 2.42], [-1.30, 0.65, 2.42],
    [-1.05, 1.04, 2.81], [1.05, 1.04, 2.81], [1.30, 1.99, 2.42], [-1.30, 1.99, 2.42]));
  P.add('hull', box(2.85, 1.0, 0.9), 0, 1.15, 1.75);                           // glacis fill under the shelf
  P.add('hull', box(2.30, 0.55, 0.55), 0, 0.72, 2.30);                         // lower nose fill
  // deck furniture: driver hatch fore-left, fans flush, filler caps
  P.add('hull', cylY(0.25, 0.25, 0.028, 14), -0.62, 2.095, 0.55);
  P.add('hullDark', torus(0.25, 0.012, 14), -0.62, 2.105, 0.55);
  periscope(P, 'hullDetail', -0.62, 2.10, 0.90);
  periscope(P, 'hullDetail', -0.36, 2.10, 0.88, 0.25);
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.34, 0.34, 0.016, P.q ? 24 : 14), s * 0.72, 2.086, -2.35);
    P.add('hullDetail', torus(0.34, 0.013, P.q ? 22 : 14), s * 0.72, 2.09, -2.35);
    P.add('hullDetail', cylY(0.085, 0.085, 0.02, 12), s * 1.28, 2.088, -0.75);
  }
  P.add('hullDark', box(2.4, 0.016, 0.5), 0, 2.088, -3.15);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.3, 0.014, 0.06), 0, 2.095, -3.28 + k * 0.13);
  liftEye(P, 'hullDetail', -1.30, 2.09, 0.2);
  liftEye(P, 'hullDetail', 1.30, 2.09, 0.2);
  P.decal('hull', 'number', 'Y-660', 0.26, [0.62, 1.0, -4.22], Math.PI, 0);
  // gear: tracks ±1.45 to ground; kit loop ends kept inboard at wheel height
  // (its flat run spans only the road wheels), raised sprocket/idler + band
  // ramps built as static primitives per the measured bottom polyline
  leoGear(P, {
    xc: 1.24, trackW: 0.42, wheelR: 0.355, wheelY: 0.39, span: [1.55, -2.75],
    sprocket: { z: -2.90, y: 0.39, r: 0.35 }, idler: { z: 1.72, y: 0.39, r: 0.35 },
    topY: 0.95, botY: 0.058,
  });
  for (const s of [-1, 1]) {
    // front idler + ring + approach ramp (bottom 0.095@1.71 → 0.55@2.5)
    P.add('hullDetail', KIT.cylX(0.26, 0.20, P.q ? 20 : 12), s * 1.24, 0.60, 2.35);
    P.add('hullDark', KIT.cylX(0.32, 0.28, P.q ? 20 : 12), s * 1.24, 0.60, 2.35);
    P.add('hullDark', box(0.28, 0.075, 0.85), s * 1.24, 0.20, 2.02, -0.38, 0, 0);
    // rear sprocket + ring + departure ramp (0.02@−3.37 → 0.48@−4.03)
    P.add('hullDetail', KIT.cylX(0.27, 0.20, P.q ? 20 : 12), s * 1.24, 0.64, -3.86);
    P.add('hullDark', KIT.cylX(0.335, 0.28, P.q ? 20 : 12), s * 1.24, 0.64, -3.86);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      P.add('hullDetail', box(0.28, 0.065, 0.05), s * 1.24, 0.64 + Math.sin(a) * 0.32, -3.86 + Math.cos(a) * 0.32, -a, 0, 0);
    }
    P.add('hullDark', box(0.28, 0.075, 1.00), s * 1.24, 0.24, -3.42, 0.42, 0, 0);
    mudflapRect(P, s * 1.24, 0.50, 2.72);
  }

  // ---- turret: faceted AMAP arrow, roofline sloping 1.96 (front) → 2.38,
  // rear station capped 2.66, whips to 4.0 at −3.2; ring z −0.60, pivot 1.55
  P.turretG.position.set(0, 1.55, -0.60);
  // core roofline: three roof slabs following the measured slope
  P.add('turret', slab(                                                        // front roof 1.96@2.31 → 2.20@0.32 (local)
    [-1.40, 0.10, 2.31], [1.40, 0.10, 2.31], [1.52, 0.14, 0.32], [-1.52, 0.14, 0.32],
    [-1.40, 0.41, 2.31], [1.40, 0.41, 2.31], [1.52, 0.65, 0.32], [-1.52, 0.65, 0.32]));
  P.add('turret', slab(                                                        // mid roof 2.20@0.32 → 2.38@−1.05
    [-1.52, 0.14, 0.32], [1.52, 0.14, 0.32], [1.50, 0.14, -1.05], [-1.50, 0.14, -1.05],
    [-1.52, 0.65, 0.32], [1.52, 0.65, 0.32], [1.50, 0.83, -1.05], [-1.50, 0.83, -1.05]));
  P.add('turret', frustum(1.50, -1.05, -2.35, 1.28, -1.05, -2.30, 0.10, 0.83)); // rear body to the station front
  // chin apron over the shelf (plan apex world 2.50, hidden under 2.0 side-on)
  P.add('turret', slab(
    [-1.00, 0.30, 3.05], [1.00, 0.30, 3.05], [1.30, 0.30, 2.25], [-1.30, 0.30, 2.25],
    [-1.00, 0.44, 3.05], [1.00, 0.44, 3.05], [1.30, 0.48, 2.25], [-1.30, 0.48, 2.25]));
  P.add('turret', box(2.20, 0.30, 3.2), 0, 0.16, 0.60);                        // underride fill
  P.add('turretDark', box(1.30, 0.26, 1.30), 0, -0.13, 0.55);                  // basket tub
  P.add('turretDark', box(1.50, 0.11, 2.30), 0, -0.05, 0.0);                   // ring shelf
  // module course seams on the cheeks
  for (const s of [-1, 1]) {
    for (const zc of [1.65, 0.75, -0.15, -1.05]) {
      P.add('turretDark', box(0.02, 0.42, 0.02), s * (1.40 - Math.max(0, zc - 0.3) * 0.06), 0.42, zc);
    }
  }
  // rear station: left block top 2.66 (published-height p95 anchor), right
  // shelf 2.34; spans world −2.37..−3.03
  P.add('turret', box(1.70, 0.50, 0.66), -0.40, 0.80, -2.10);                  // left block y 0.55..1.05 → top 2.60
  P.add('turret', box(0.60, 0.28, 0.62), 0.75, 0.65, -2.08);                   // right shelf top 2.34
  P.add('turretDark', box(0.30, 0.16, 0.30), -0.55, 0.955, -2.05);             // RWS head inside the block line
  P.add('turretDark', cylZ(0.022, 0.5, 8), -0.48, 0.90, -1.80, -0.04, 0, 0);
  P.add('turretGlass', box(0.12, 0.08, 0.02), -0.55, 1.02, -1.88);
  P.add('turret', frustum(1.05, -2.30, -2.62, 0.95, -2.30, -2.60, 0.20, 0.75)); // station rear taper
  // bustle basket to −3.30 world + twin whips (tips 4.00 world at −3.15/−3.27)
  P.add('turretDetail', box(2.40, 0.045, 0.045), 0, 0.62, -2.58);
  P.add('turretDetail', box(2.40, 0.045, 0.045), 0, 0.16, -2.56);
  for (let k = 0; k <= 8; k++) P.add('turretDetail', box(0.03, 0.46, 0.03), -1.2 + k * 0.3, 0.39, -2.57);
  P.add('turretDark', box(2.1, 0.016, 0.5), 0, 0.19, -2.42);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.5, 0.34, -2.42, 0.8, 0.3, 0.42], [0.62, 0.32, -2.45, 0.6, 0.28, 0.4]]);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.07, 0.14, 0.07), s * 1.00, 0.62, -2.62);
    P.add('turretDetail', box(0.024, 1.80, 0.024), s * 1.00, 1.55, s > 0 ? -2.55 : -2.67);
  }
  // roof furniture: EMES hood right-front, hatches, pano LEFT (low)
  P.add('turretDark', box(0.46, 0.14, 0.40), 0.62, 0.60, 0.62);
  P.add('turret', box(0.40, 0.16, 0.34), 0.62, 0.64, 0.60);
  P.add('turretGlass', box(0.22, 0.08, 0.018), 0.62, 0.66, 0.79);
  P.add('turret', cylY(0.23, 0.23, 0.04, 14), 0.55, 0.72, -0.35);
  P.add('turret', cylY(0.20, 0.20, 0.036, 14), -0.60, 0.73, -0.25);
  periscope(P, 'turretDetail', 0.55, 0.76, -0.02);
  P.add('turretDetail', cylY(0.09, 0.10, 0.16, 12), -0.55, 0.86, -1.35);       // pano pedestal
  P.add('turretDark', box(0.22, 0.18, 0.24), -0.55, 0.91, -1.35);              // pano head (kept under 2.55)
  P.add('turretGlass', box(0.12, 0.09, 0.02), -0.55, 0.98, -1.22);
  // smoke banks recessed low on the rear cheeks
  for (const s of [-1, 1]) {
    KIT.smokeCluster(P, s * 1.32, 0.35, -1.35, 4, s * 1.05, 0.8);
    liftEye(P, 'turretDetail', s * 1.05, 0.70, -0.5, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.44, 0.40, -0.4], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.44, 0.40, -0.4], -Math.PI / 2);
  // mantlet back wall + cheeks (hidden behind the bow shelf below 2.0)
  P.add('turret', box(0.80, 0.55, 0.08), 0, 0.30, 2.30);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.30, 0.45), s * 0.41, 0.18, 2.50);
  // ---- L/44 at axis 1.84: sealed roll, sleeved tube Ø~0.20, muzzle 5.06 ----
  P.gunG.position.set(0, 0.29, 1.20);
  P.addGunExtra(KIT.cylX(0.22, 0.60, P.q ? 18 : 12), 0, 0, 0);
  P.addGunExtra(box(0.50, 0.42, 0.55), 0, 0.02, 0.45);
  P.addGunExtra(cylZ(0.12, 0.5, 12, 0.15), 0, 0, 0.95);
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.24, 0.08, 0.55);
  KIT.buildGun(P, { len: 4.46, r: 0.09, sleeve: true, evac: 0.52, evacR: 1.35, collar: false, baseR: 0.15 });
  P.topY = 1.9;
}

// small rectangular mud flap helper (leopard family)
function mudflapRect(P, x, y, z) {
  P.add('hullRubber', KIT.box(0.34, 0.44, 0.03), x, y, z);
}

// ---------------------------------------------------------------------------
// KF51 Panther — docs/references/tanks/kf51.md (kf51_grip420 oracle).
// GATE-V9 REBUILD authored from docs/references/profiles/kf51.json (world
// coords; side along = center.z − along). Oracle ≈ published: hull −3.75..
// +3.86 (7.61 vs pub 7.70), muzzle 6.93 (overall 10.68 vs 10.73), roof 2.525,
// crown 2.615, SEOSS 3.03-3.07, bustle plateau 2.955 (band 2.22..2.96), mast
// 3.54 at z −2.30, gun axis 1.84 (tube band 1.744..1.936), deck 1.80-1.82
// aft stepping DOWN to 1.61 fore of z −0.5, tracks to ground (bot 0.012),
// skirt lip band ~0.72..1.38 at ±1.80, fender plank 1.30-1.36 full length.
// Published envelope: tail −3.80, prow +3.90 (7.70), muzzle +6.93 (10.73),
// p95 roof anchored by SEOSS top 3.03 (mast is the 1-2 spike-col budget).
// ---------------------------------------------------------------------------
function buildKF51(P) {
  const { box, slab, cylY, cylZ, frustum, torus, periscope, liftEye } = KIT;
  // ---- hull: low tub + deck shell band with the fore-deck step ----
  P.add('hull', box(2.28, 0.88, 6.18), 0, 0.86, -0.50);                        // tub y 0.42..1.30, z −3.59..2.59
  const deck = [[2.22, 1.60], [0.30, 1.62], [-0.49, 1.615], [-0.80, 1.73], [-1.20, 1.755], [-1.94, 1.79], [-2.30, 1.805], [-3.30, 1.815], [-3.84, 1.80]];
  for (let i = 0; i < deck.length - 1; i++) {
    const [zF, yF] = deck[i], [zR, yR] = deck[i + 1];
    P.add('hull', slab(
      [-1.70, 1.32, zF], [1.70, 1.32, zF], [1.70, 1.32, zR], [-1.70, 1.32, zR],
      [-1.70, yF, zF], [1.70, yF, zF], [1.70, yR, zR], [-1.70, yR, zR]));
  }
  // glacis: crease (2.22,1.60) → knee (2.55,1.43) → prow (3.90,1.215)
  P.add('hull', slab(
    [-1.60, 1.30, 2.22], [1.60, 1.30, 2.22], [1.56, 1.28, 2.55], [-1.56, 1.28, 2.55],
    [-1.70, 1.60, 2.22], [1.70, 1.60, 2.22], [1.62, 1.43, 2.55], [-1.62, 1.43, 2.55]));
  P.add('hull', slab(
    [-1.56, 1.24, 2.55], [1.56, 1.24, 2.55], [1.42, 1.08, 3.76], [-1.42, 1.08, 3.76],
    [-1.62, 1.43, 2.55], [1.62, 1.43, 2.55], [1.42, 1.24, 3.76], [-1.42, 1.24, 3.76]));
  P.add('hull', slab(                                                          // beak tip chamfer to +3.86
    [-1.10, 1.06, 3.86], [1.10, 1.06, 3.86], [1.42, 1.08, 3.76], [-1.42, 1.08, 3.76],
    [-1.10, 1.22, 3.86], [1.10, 1.22, 3.86], [1.42, 1.24, 3.76], [-1.42, 1.24, 3.76]));
  // nose wedge under the glacis: (3.86,1.06) falling to the belt (3.42,0.40)
  P.add('hull', slab(
    [-1.30, 1.04, 3.84], [1.30, 1.04, 3.84], [1.55, 0.40, 3.42], [-1.55, 0.40, 3.42],
    [-1.30, 1.10, 3.84], [1.30, 1.10, 3.84], [1.55, 1.28, 3.42], [-1.55, 1.28, 3.42]));
  P.add('hull', box(3.10, 0.94, 0.86), 0, 0.85, 3.00);                         // lower glacis fill
  // rear plate at −3.60 + louvres/taillights; tail stowage lip to −3.79
  P.add('hull', box(2.86, 1.28, 0.10), 0, 1.16, -3.55);
  P.add('hullDark', box(2.30, 0.30, 0.035), 0, 1.42, -3.605);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.20, 0.045, 0.05), 0, 1.30 + k * 0.075, -3.62);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.15, 0.09, 0.04), s * 1.28, 1.70, -3.615);
    P.add('hullDetail', box(0.05, 0.16, 0.08), s * 0.85, 1.00, -3.62);         // shackles (tucked to the plate)
  }
  P.add('hull', box(2.40, 0.44, 0.20), 0, 1.56, -3.72);                        // tail bin course (band 1.34..1.78)
  P.add('hull', box(2.10, 0.40, 0.05), 0, 1.55, -3.825);
  P.add('hullDark', box(2.20, 0.34, 0.02), 0, 1.56, -3.795);
  for (let k = 0; k < 8; k++) P.add('hullDetail', box(0.03, 0.38, 0.045), -1.08 + k * 0.31, 1.56, -3.83);
  // full-length fender plank (plan corners to ±1.79 × z −3.72..3.78; the
  // forward third DROOPS below the glacis line like the print's mudguards)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.18, 0.05, 6.55), s * 1.70, 1.335, -0.15);              // inner run y 1.31..1.36
    P.add('hull', box(0.09, 0.05, 6.55), s * 1.755, 1.335, -0.42);             // outer lip −3.70..3.13 @ ±1.80
    P.add('hull', box(0.09, 0.04, 0.70), s * 1.755, 1.24, 3.46, -0.10, 0, 0);  // drooping tips to z 3.78 (top ≤1.30)
    P.add('hullDark', box(0.06, 0.016, 6.4), s * 1.775, 1.365, -0.2);
  }
  // flank: deep skirt face at ±1.70 (band 0.43..1.36) + the print's thin
  // outer mounting rail at ±1.80 (band 0.72..1.09 — carries WIDTH 3.60)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 0.93, 4.60), s * 1.675, 0.895, 0.12);              // z −2.18..2.42
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.056, 0.80, 0.018), s * 1.675, 0.88, 2.05 - k * 0.78);
    P.add('hullDark', box(0.02, 0.08, 4.5), s * 1.666, 0.475, 0.12);           // dark bottom lip
    P.add('hull', box(0.038, 0.37, 4.40), s * 1.781, 0.905, 0.10);             // outer rail @ ±1.80
    for (let k = 0; k < 5; k++) {
      P.add('hullDark', cylZ(0.02, 0.016, 8), s * 1.801, 0.95, 1.7 - k * 0.85, 0, s * Math.PI / 2, 0);
    }
  }
  // driver station (deck step fore-right) + episcopes
  P.add('hull', cylY(0.26, 0.26, 0.03, 14), 0.58, 1.625, 1.30);
  P.add('hullDark', torus(0.26, 0.012, 14), 0.58, 1.638, 1.30);
  periscope(P, 'hullDetail', 0.36, 1.63, 1.72);
  periscope(P, 'hullDetail', 0.58, 1.63, 1.75);
  periscope(P, 'hullDetail', 0.80, 1.63, 1.72, 0.3);
  // headlight pods ON the glacis (the oracle's 1.45 bump at z 3.1)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.24, 0.11, 0.18), s * 1.05, 1.385, 3.10, -0.16, 0, 0);
    P.add('hullGlass', box(0.08, 0.05, 0.02), s * 1.05, 1.40, 3.20, -0.16, 0, 0);
    P.add('hullDark', box(0.26, 0.02, 0.20), s * 1.05, 1.445, 3.08, -0.16, 0, 0);
    // front mud flaps behind the idler (band filler 0.24..0.72)
    P.add('hullRubber', box(0.34, 0.48, 0.03), s * 1.30, 0.48, 3.25);
  }
  // engine deck furniture: flush fan discs + louvre field + torsion caps
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.36, 0.36, 0.016, P.q ? 24 : 14), s * 0.74, 1.822, -2.75);
    P.add('hullDetail', torus(0.36, 0.014, P.q ? 22 : 14), s * 0.74, 1.826, -2.75);
    P.add('hullDetail', cylY(0.06, 0.065, 0.03, 10), s * 0.74, 1.83, -2.75);
    P.add('hullDark', box(0.40, 0.016, 0.9), s * 1.30, 1.825, -2.55);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.34, 0.014, 0.06), s * 1.30, 1.832, -2.85 + k * 0.2);
    P.add('hullDetail', cylY(0.09, 0.09, 0.02, 12), s * 1.30, 1.815, -1.60);
  }
  P.add('hullDark', box(2.6, 0.016, 0.44), 0, 1.826, -3.28);                   // transverse louver inset
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.5, 0.014, 0.06), 0, 1.833, -3.40 + k * 0.12);
  P.add('hullDark', box(1.9, 0.014, 0.03), 0, 1.612, 2.20);                    // crease weld seam
  liftEye(P, 'hullDetail', -1.35, 1.79, -1.9);
  liftEye(P, 'hullDetail', 1.35, 1.63, 0.6);
  P.decal('hull', 'number', 'Y-051', 0.26, [0.6, 1.12, -3.66], Math.PI, 0);
  // gear: the kit's track loop always runs its flat ground band out to the
  // loop-end wheels, but the oracle's bottom profile RAMPS up aft of −2.4 /
  // fore of +2.5. So the kit loop gets INBOARD wheel-height end wheels (its
  // flat run then spans only the road-wheel contact, hidden behind the
  // skirts), and the raised idler/sprocket + climbing band ramps are built
  // as static primitives matching the measured bottom polyline.
  leoGear(P, {
    xc: 1.30, trackW: 0.44, wheelR: 0.355, wheelY: 0.39, span: [2.05, -1.94],
    sprocket: { z: -2.10, y: 0.39, r: 0.35 }, idler: { z: 2.21, y: 0.39, r: 0.35 },
    topY: 0.95, botY: 0.058,
  });
  for (const s of [-1, 1]) {
    // front idler (bottom ~0.34) + wrapped-band ring + approach ramp
    P.add('hullDetail', KIT.cylX(0.29, 0.20, P.q ? 20 : 12), s * 1.30, 0.68, 3.28);
    P.add('hullDark', KIT.cylX(0.35, 0.30, P.q ? 20 : 12), s * 1.30, 0.68, 3.28);
    P.add('hullDark', box(0.30, 0.075, 1.00), s * 1.30, 0.26, 2.88, -0.42, 0, 0);
    // rear drive sprocket (bottom ~0.42) + band ring + departure ramp
    P.add('hullDetail', KIT.cylX(0.30, 0.20, P.q ? 20 : 12), s * 1.30, 0.78, -3.30);
    P.add('hullDark', KIT.cylX(0.37, 0.30, P.q ? 20 : 12), s * 1.30, 0.78, -3.30);
    for (let k = 0; k < 9; k++) {                                              // sprocket tooth ring
      const a = (k / 9) * Math.PI * 2;
      P.add('hullDetail', box(0.30, 0.07, 0.05), s * 1.30, 0.78 + Math.sin(a) * 0.355, -3.30 + Math.cos(a) * 0.355, -a, 0, 0);
    }
    P.add('hullDark', box(0.30, 0.075, 1.08), s * 1.30, 0.28, -2.90, 0.40, 0, 0);
  }

  // ---- turret: wide blunt-front faceted body, ring z 0.45, pivot 1.71 ----
  // roof 2.525 (h 0.815), crown 2.615, chin apron to world +2.89 over the
  // glacis, plan: ±1.51 @ z 0.10..2.50w tapering to ±1.27 @ −2.85w; tall
  // bustle block 2.20..2.955 over −1.85..−3.15w; SEOSS (LEFT) top 3.03 is
  // the published-height p95 anchor; slim mast 3.53 = the spike budget.
  P.turretG.position.set(0, 1.71, 0.45);
  const h = 0.815;
  // body: front block (sloped face), mid + rear taper, top chamfer
  P.add('turret', frustum(1.51, 2.05, -0.90, 1.42, 1.15, -0.90, 0.16, 0.72));
  P.add('turret', frustum(1.42, 1.15, -0.42, 1.12, 0.95, -0.44, 0.72, h));
  P.add('turret', frustum(1.44, -0.35, -2.40, 1.16, -0.38, -2.38, 0.16, h));
  P.add('turret', frustum(1.28, -2.40, -3.10, 1.10, -2.40, -3.08, 0.16, h));
  P.add('turret', box(2.20, 0.30, 2.6), 0, 0.16, 0.55);                        // underride fill to the ring
  P.add('turretDark', box(1.30, 0.26, 1.30), 0, -0.13, 0.45);                  // basket tub (turret mask dips to 1.45)
  P.add('turretDark', box(1.50, 0.11, 2.20), 0, -0.05, -0.10);                 // ring shelf (dips to 1.66)
  // chin apron sweeping over the glacis (top 2.15-2.21 world), bowed front:
  // center to world 3.07, ±1.14 shoulder to 2.89, corners to 2.50
  P.add('turret', slab(
    [-0.70, 0.19, 2.62], [0.70, 0.19, 2.62], [0.72, 0.19, 2.30], [-0.72, 0.19, 2.30],
    [-0.70, 0.42, 2.58], [0.70, 0.42, 2.58], [0.72, 0.44, 2.30], [-0.72, 0.44, 2.30]));
  P.add('turret', slab(
    [-1.10, 0.19, 2.44], [1.10, 0.19, 2.44], [1.14, 0.19, 1.55], [-1.14, 0.19, 1.55],
    [-1.10, 0.44, 2.44], [1.10, 0.44, 2.44], [1.14, 0.51, 1.55], [-1.14, 0.51, 1.55]));
  for (const s of [-1, 1]) {                                                   // chin corner chamfers
    P.add('turret', slab(
      [s * 1.10, 0.19, 2.40], [s * 1.49, 0.19, 2.06], [s * 1.49, 0.19, 1.60], [s * 1.10, 0.19, 1.60],
      [s * 1.10, 0.42, 2.36], [s * 1.44, 0.40, 2.02], [s * 1.44, 0.40, 1.60], [s * 1.10, 0.42, 1.60]));
  }
  P.add('turretDark', box(1.9, 0.02, 0.02), 0, 0.52, 1.42);                    // roof-front seam
  // crown block + drone-bay seams
  P.add('turret', box(1.90, 0.09, 0.61), 0, 0.86, 0.205);
  P.add('turretDark', box(0.60, 0.014, 0.40), 0.38, 0.907, 0.20);
  P.add('turretDark', box(0.60, 0.014, 0.40), -0.42, 0.907, 0.16);
  // SEOSS panoramic tower LEFT of center: head top 3.03 world (p95 anchor)
  P.add('turretDetail', cylY(0.09, 0.11, 0.24, 12), -0.50, h + 0.11, -0.46);
  P.add('turretDark', box(0.30, 0.25, 0.48), -0.50, 1.165, -0.46);
  P.add('turretGlass', box(0.18, 0.11, 0.02), -0.50, 1.18, -0.26);
  // hatches + periscopes
  P.add('turret', cylY(0.24, 0.24, 0.04, 14), 0.62, h + 0.018, -0.75);
  P.add('turret', cylY(0.21, 0.21, 0.036, 14), -0.64, h + 0.016, -0.65);
  periscope(P, 'turretDetail', 0.62, h + 0.04, -0.45);
  periscope(P, 'turretDetail', -0.40, h + 0.04, -0.40, 0.3);
  // tall bustle block (band 2.20..2.955 world, offset RIGHT like the print)
  // + wide low course forming the ±1.14 plan corners + slat rear
  P.add('turret', box(1.70, 0.755, 1.14), 0.13, 0.8675, -2.99);                // y 0.49..1.245, z −3.56..−2.42
  P.add('turret', box(2.32, 0.43, 1.14), 0, 0.705, -2.99);                     // low course to 2.63 world
  P.add('turret', box(0.28, 0.42, 0.85), -1.28, 0.51, -2.83);                  // left flank stowage course
  P.add('turretDark', box(1.66, 0.60, 0.04), 0.13, 0.86, -3.57);               // slat face
  for (let k = 0; k < 8; k++) P.add('turretDetail', box(0.028, 0.64, 0.05), -0.72 + k * 0.245, 0.87, -3.59);
  P.add('turretDetail', box(1.66, 0.04, 0.04), 0.13, 1.22, -3.60);
  P.add('turretDetail', box(2.26, 0.04, 0.04), 0, 0.50, -3.58);
  P.add('turretDark', box(0.48, 0.09, 0.50), 0.42, 1.195, -2.75);              // Natter RWS folded silhouette-flat
  P.add('turretDark', cylZ(0.018, 0.40, 8), 0.48, 1.21, -2.48, 0, 0, 0);
  // twin whip antennas at x ±1.01 (world z −2.30/−2.42), tips 3.53 — the
  // print's tall pair; bases seated on the low bustle course
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.07, 0.14, 0.07), s * 1.01, 0.98, s > 0 ? -2.75 : -2.87);
    P.add('turretDetail', box(0.024, 0.80, 0.024), s * 1.01, 1.42, s > 0 ? -2.75 : -2.87);
  }
  // smoke clusters recessed against the mid walls (inside the plan taper)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.05, 0.22, 0.50), s * 1.30, 0.42, 0.10, 0, s * 0.16, 0);
    KIT.smokeCluster(P, s * 1.33, 0.50, 0.22, 4, s * 1.05, 0.8);
    liftEye(P, 'turretDetail', s * 0.95, h + 0.015, -0.1, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.36, 0.40, -0.7], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.36, 0.40, -0.7], -Math.PI / 2);
  // mantlet back wall + dark cheeks behind the shroud (kept under the 2.2 line)
  P.add('turret', box(0.84, 0.62, 0.08), 0, 0.42, 1.58);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.34, 0.55), s * 0.43, 0.23, 1.80);
  // ---- Rh-130 L/52 FGS: axis 1.84 (tube band 1.74..1.96), fat shroud plan
  // (±0.31 to world 3.9, taper to 4.5), squared muzzle device topping 2.04,
  // muzzle world 6.93 ----
  P.gunG.position.set(0, 0.13, 0.88);
  P.addGunExtra(KIT.cylX(0.25, 0.62, P.q ? 18 : 12), 0, 0, 0);                 // trunnion roll
  P.addGunExtra(box(0.56, 0.44, 0.85), 0, 0.05, 0.53);                         // shroud root (band 1.74..2.18)
  P.addGunExtra(box(0.60, 0.355, 2.10), 0, 0.055, 1.95);                       // shroud mid (band 1.72..2.075, to 3.88)
  P.addGunExtra(cylZ(0.14, 1.10, 12, 0.175), 0, 0.01, 3.05);                   // shroud taper (world to 4.48)
  P.addGunExtraDark(cylZ(0.028, 0.10, 8), 0.25, 0.09, 0.70);                   // coax port
  KIT.buildGun(P, { len: 5.58, r: 0.105, sleeve: true, collar: false, baseR: 0.17 });
  P.add('gun', box(0.26, 0.28, 0.34), 0, 0.06, 5.38);                          // squared muzzle section (band 1.76..2.04)
  P.add('gunDark', box(0.18, 0.20, 0.05), 0, 0.06, 5.56);
  P.topY = 1.9;
}

export const LEOPARD_PROFILES = {
  leo2a6: { build: buildLeo2A6 },
  leo2a5: { build: buildLeo2A5 },
  leo2a7v: { build: buildLeo2A7V },
  leopard2_proto: { build: buildLeo2Proto },
  leo2_revolution: { build: buildLeo2Revolution },
  kf51: { build: buildKF51 },
};
