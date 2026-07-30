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
  const { buildRunningGear } = KIT;
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.84,
    wheelR: g.wheelR, wheelW: Math.min(0.23, g.trackW * 0.36),
    wheelY: g.wheelY ?? g.wheelR + 0.03, xc: g.xc,
    wheelZs: evenStations(7, g.span[0] - g.span[1], (g.span[0] + g.span[1]) / 2),
    sprocket: g.sprocket, idler: g.idler, rollers: [],
    trackW: g.trackW, topY: g.topY, botY: g.botY ?? 0.075,
    paintedEnds: true, coveredTop: true,
  });
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
    P.add('hullRubber', box(0.5, 0.32, 0.028), s * (H.xc ?? hw - H.trackW / 2), R.yBot - 0.02, R.z - 0.08, 0.1, 0, 0);
  }
  P.add('hullDark', box(0.15, 0.09, 0.04), 0, R.yTop - 0.14, R.z - 0.005);   // convoy light
  P.add('hullDetail', box(0.19, 0.026, 0.06), 0, R.yTop - 0.085, R.z - 0.02);
  P.add('hullWood', box(0.26, 0.11, 0.09), 0, R.yBot + 0.10, R.z - 0.02);
  // front mud flaps behind the beak
  for (const s of [-1, 1]) P.add('hullRubber', box(0.36, 0.40, 0.03), s * (H.xc ?? hw - H.trackW / 2), H.beltY + 0.06, pw.z - 0.14);

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
        P.add('hullDark', cylZ(0.02, 0.016, 8), s * (skX + 0.004), sk.y1 - 0.12, z, 0, s * Math.PI / 2, 0);
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
  P.add('turret', box(0.46, 0.24, 0.38), R.emes.x, h - 0.05, R.emes.z - 0.02);
  P.add('turretDetail', box(0.50, 0.045, 0.42), R.emes.x, h + 0.085, R.emes.z - 0.04);
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
  periscope(P, 'turretDetail', R.cmdr.x, h + 0.05, R.cmdr.z + 0.33);
  // crosswind sensor mast at the rear roof + whip antennas at the bustle
  P.add('turretDetail', cylY(0.014, 0.018, 0.30, 8), R.mastZ != null ? -0.85 : 0, h + 0.15, R.mastZ ?? R.boxRear + 0.4);
  P.add('turretDark', box(0.04, 0.04, 0.11), R.mastZ != null ? -0.85 : 0, h + 0.32, R.mastZ ?? R.boxRear + 0.4);
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
    W: 3.75, bodyHW: 1.82, skirtX: 1.83, sponsonY: 1.22, trackW: 0.62, xc: 1.46,
    deck: [[2.05, 1.59], [1.0, 1.61], [-0.6, 1.63], [-1.05, 1.72], [-2.6, 1.79], [-3.45, 1.82], [-3.75, 1.79]],
    crease: { z: 2.05, y: 1.59 }, prow: { z: 3.70, y: 1.44 }, beltY: 0.66,
    rear: { z: -3.75, yTop: 1.78, yBot: 0.52 },
    wheelR: 0.365, wheelY: 0.39, span: [2.75, -2.5],
    sprocket: { z: -3.28, y: 0.62, r: 0.31 }, idler: { z: 3.18, y: 0.55, r: 0.30 }, topY: 0.95,
    skirts: [
      { z0: 1.05, z1: 3.62, y0: 0.58, y1: 1.26, seams: 3, heavy: true, x: 1.875 },
      { z0: -3.42, z1: 1.05, y0: 0.62, y1: 1.22, seams: 5 },
    ],
    fans: { z: -2.55, x: 0.78, r: 0.38 },
  });
  P.decal('hull', 'number', 'Y-241', 0.26, [0.62, 1.22, -3.82], Math.PI, 0);

  // turret: ring at z 0.35, roof 2.42 (h 0.72 over pivot 1.70), wedge apex
  // world z 2.75, box rear -2.15, basket to -2.77, antennas to 4.16
  P.turretG.position.set(0, 1.70, 0.35);
  wedgeTurretShell(P, { tw: 1.42, boxW: 1.28, h: 0.72, apexY: 0.16, boxFront: 0.30, boxRear: -2.50, apexZ: 2.95, slotZ: 1.38, gunW: 0.36 });
  leoTurretRoof(P, {
    h: 0.72, boxW: 1.28, boxRear: -2.50,
    emes: { x: 0.72, z: 0.72 }, peri: { x: 0.38, z: -0.80, top: 1.16 },
    cmdr: { x: 0.62, z: -0.42 }, loader: { x: -0.66, z: -0.30 },
    mastZ: -2.15, antennaZ: -2.30, antennaTop: 2.46,
    rackZ: -3.12, rackTop: 0.68, rackBottom: -0.06, smoke: { z: -1.35, y: 0.40 },
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.36, -0.9], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.36, -0.9], -Math.PI / 2);
  // L/55: trunnion world z 1.55, axis 1.96, muzzle 8.27; the buh mantlet
  // block protrudes deep into the arrow notch (z 2.4..3.3, y 1.67..2.31)
  P.gunG.position.set(0, 0.26, 1.20);
  P.addGunExtra(KIT.box(0.50, 0.54, 0.92), 0, -0.02, 1.24);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.68, plateW: 0.58, plateH: 0.48, len: 6.72, r: 0.085, evac: 0.58, evacR: 1.8 });
  P.topY = 1.20;
}

// ---------------------------------------------------------------------------
// Leopard 2A5 — docs/references/tanks/leo2a5.md (recovered oracle; turret
// shell partially fused into the hull node — turret channel oracle-capped).
// hull ±3.94/3.95, deck 1.84 fore / 1.95 aft, roof ~2.61, L/44 muzzle 6.02.
// ---------------------------------------------------------------------------
function buildLeo2A5(P) {
  leoHull(P, {
    W: 3.75, bodyHW: 1.82, skirtX: 1.83, sponsonY: 1.22, trackW: 0.62, xc: 1.46,
    deck: [[2.35, 1.72], [0.8, 1.75], [-0.7, 1.75], [-1.2, 1.80], [-2.6, 1.84], [-3.5, 1.87], [-3.94, 1.84]],
    crease: { z: 2.35, y: 1.72 }, prow: { z: 3.88, y: 1.46 }, beltY: 0.68,
    rear: { z: -3.94, yTop: 1.83, yBot: 0.55 },
    wheelR: 0.37, wheelY: 0.395, span: [2.9, -2.6],
    sprocket: { z: -3.4, y: 0.62, r: 0.32 }, idler: { z: 3.35, y: 0.55, r: 0.30 }, topY: 0.97,
    skirts: [
      { z0: 1.1, z1: 3.80, y0: 0.58, y1: 1.28, seams: 3, heavy: true, x: 1.875 },
      { z0: -3.6, z1: 1.1, y0: 0.70, y1: 1.24, seams: 5 },
    ],
    fans: { z: -2.7, x: 0.78, r: 0.38 },
  });
  P.decal('hull', 'number', 'Y-508', 0.26, [0.62, 1.22, -4.0], Math.PI, 0);

  // turret: ring z 0.30, roof 2.54 (pivot 1.78, h 0.76), apex world 2.68,
  // box rear -2.20, basket -2.92, hatch/PERI cluster peaking ~3.02
  P.turretG.position.set(0, 1.78, 0.30);
  wedgeTurretShell(P, { tw: 1.42, boxW: 1.28, h: 0.76, boxFront: 0.32, boxRear: -2.50, apexZ: 2.38, gunW: 0.36 });
  leoTurretRoof(P, {
    h: 0.76, boxW: 1.28, boxRear: -2.50,
    emes: { x: 0.72, z: 0.74 }, peri: { x: 0.35, z: -0.55, top: 1.24 },
    cmdr: { x: 0.60, z: -0.20 }, loader: { x: -0.66, z: -0.20 },
    mastZ: -2.15, antennaZ: -2.25, antennaTop: 2.39,
    rackZ: -3.22, rackTop: 0.72, rackBottom: -0.06, smoke: { z: -1.35, y: 0.42 },
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.38, -0.85], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.38, -0.85], -Math.PI / 2);
  // L/44: trunnion world z 1.45, axis 2.0, muzzle 6.02 (2.07 m overhang)
  P.gunG.position.set(0, 0.22, 1.15);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.68, plateW: 0.58, plateH: 0.48, len: 4.57, r: 0.085, evac: 0.52, evacR: 1.8 });
  P.topY = 1.24;
}

// ---------------------------------------------------------------------------
// Leopard 2A7V — docs/references/tanks/leo2a7v.md (desirefx oracle; prints
// tall/chunky — deck 2.7 on a 4.0 width). Hull z −5.92..+2.60, turret roof
// 3.05 rear / 2.75 fore, mast farm to 5.5, L/55A1 muzzle 5.92.
// ---------------------------------------------------------------------------
function buildLeo2A7V(P) {
  const { box, cylY } = KIT;
  leoHull(P, {
    W: 4.0, bodyHW: 1.90, skirtX: 1.99, sponsonY: 1.88, deckShellY: 2.30, trackW: 0.66, xc: 1.60,
    deck: [[1.35, 2.60], [0.2, 2.66], [-2.6, 2.64], [-3.3, 2.70], [-4.4, 2.80], [-4.68, 2.55], [-4.88, 2.06], [-5.4, 2.02], [-5.92, 1.94]],
    crease: { z: 1.35, y: 2.60 }, prow: { z: 2.30, y: 1.58 }, beltY: 0.75,
    rear: { z: -5.92, yTop: 1.94, yBot: 0.50 },
    wheelR: 0.37, wheelY: 0.40, span: [1.35, -4.3],
    sprocket: { z: -5.3, y: 0.70, r: 0.31 }, idler: { z: 2.28, y: 0.70, r: 0.30 }, topY: 1.0,
    // one deep modular course per side: the print hides the gear entirely
    // (its top at ~1.9 leaves the open sponson gap under the deck shell)
    skirts: [
      { z0: -0.8, z1: 2.35, y0: 0.16, y1: 1.90, seams: 4, heavy: true },
      { z0: -5.4, z1: -0.8, y0: 0.16, y1: 1.88, seams: 6, heavy: true },
    ],
    fans: { z: -3.6, x: 0.82, r: 0.40 },
    driverZ: 0.6, antiSlip: true,
  });
  // course-top rail + rear APU/cooling boxes on the rear shoulders
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.16, 0.05, 6.6), s * 1.90, 1.93, -1.5);
    P.add('hullDetail', box(0.28, 0.55, 0.72), s * 1.66, 2.55, -4.3);         // rear APU/cooling boxes
    P.add('hullDark', box(0.24, 0.05, 0.60), s * 1.66, 2.84, -4.3);
  }
  P.add('hullDark', box(2.5, 0.45, 0.05), 0, 1.65, -5.95);                    // rear cooling grille
  // hull-node sensor mast (the print carries one midship reaching ~3.2)
  P.add('hullDetail', cylY(0.03, 0.035, 0.5, 8), -1.35, 2.90, -1.5);
  P.add('hullDark', box(0.12, 0.12, 0.12), -1.35, 3.18, -1.5);
  P.decal('hull', 'number', 'Y-877', 0.26, [0.62, 1.4, -5.99], Math.PI, 0);

  // turret: ring z −1.05, pivot y 2.00; front roof 2.75, raised rear band
  // 3.02 (world −2.1..−1.0), apex world 2.50; basket to −4.6; masts 5.5/5.0
  P.turretG.position.set(0, 2.00, -1.05);
  wedgeTurretShell(P, { tw: 1.23, boxW: 1.10, h: 0.75, baseY: -0.08, apexY: 0.42, boxFront: 0.55, boxRear: -2.35, apexZ: 3.05, slotZ: 1.52, gunW: 0.34 });
  P.add('turret', box(2.16, 0.18, 1.1), 0, 0.93, -0.50);                      // raised rear roof band (3.02)
  leoTurretRoof(P, {
    h: 0.75, boxW: 1.10, boxRear: -2.35,
    emes: { x: 0.66, z: 1.45 }, peri: { x: 0.34, z: -0.25, top: 1.10 },
    cmdr: { x: 0.56, z: 0.35 }, loader: { x: -0.60, z: 0.42 },
    mastZ: -1.45, antennaZ: -1.55, antennaTop: 1.35,
    rackZ: -3.55, rackTop: 0.60, rackBottom: -0.05, smoke: { z: -0.55, y: 0.40 },
  });
  // bustle mast farm (the a7v print identity): two tall sensor masts + heads
  for (const [mx, mz, top] of [[-0.5, -2.80, 3.50], [0.45, -2.60, 3.00]]) {
    P.add('turretDetail', cylY(0.025, 0.035, top - 0.95, 8), mx, 0.95 + (top - 0.95) / 2, mz);
    P.add('turretDark', box(0.10, 0.22, 0.10), mx, top - 0.11, mz);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.16, 0.35, -0.8], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.16, 0.35, -0.8], -Math.PI / 2);
  // L/55A1: trunnion world z 0.35, axis 2.10, muzzle 5.92
  P.gunG.position.set(0, 0.10, 1.40);
  leoMantletGun(P, { rollR: 0.27, rollW: 0.64, plateW: 0.58, plateH: 0.48, len: 5.57, r: 0.082, evac: 0.58 });
  P.topY = 3.6;
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
    deck: [[2.0, 1.58], [1.35, 1.69], [0.9, 1.71], [-0.6, 1.67], [-1.5, 1.77], [-2.6, 1.83], [-3.5, 1.86], [-4.12, 1.81]],
    crease: { z: 2.0, y: 1.58 }, prow: { z: 3.44, y: 1.42 }, beltY: 0.72,
    rear: { z: -4.12, yTop: 1.78, yBot: 0.52 },
    wheelR: 0.365, wheelY: 0.39, span: [2.3, -2.85],
    sprocket: { z: -3.52, y: 0.60, r: 0.30 }, idler: { z: 3.12, y: 0.66, r: 0.29 }, topY: 0.95,
    // early flat slab skirts, full length (no sculpted A5 blocks)
    skirts: [{ z0: -3.5, z1: 3.30, y0: 0.56, y1: 1.20, seams: 7 }],
    fans: { z: -2.9, x: 0.76, r: 0.36 }, rope: false,
  });
  P.add('hull', box(1.35, 0.26, 0.10), 0, 1.60, -4.16);                        // rear bin (print's tail scrap)
  P.decal('hull', 'number', 'Y-014', 0.26, [0.62, 1.22, -4.19], Math.PI, 0);

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
  KIT.buildGun(P, { len: 4.84, r: 0.062, sleeve: false, evac: 0.55, evacR: 1.8, collar: false, baseR: 0.12 });
  P.topY = 0.75;
}

// ---------------------------------------------------------------------------
// Leopard 2 Revolution — docs/references/tanks/leo2_revolution.md. AMAP
// package on the 2A4: faceted closed turret cladding, tall modular hull-side
// courses, bow appliqué shelf, rear slat/stowage course, roof RWS, L/44.
// ---------------------------------------------------------------------------
function buildLeo2Revolution(P) {
  const { box, slab, cylY, frustum } = KIT;
  leoHull(P, {
    W: 4.0, bodyHW: 1.86, skirtX: 1.99, sponsonY: 1.26, trackW: 0.64, xc: 1.58,
    deck: [[1.95, 1.76], [0.6, 1.78], [-1.2, 1.82], [-2.6, 1.86], [-3.6, 1.82], [-4.18, 1.78]],
    crease: { z: 1.95, y: 1.76 }, prow: { z: 2.72, y: 1.55 }, beltY: 0.62,
    rear: { z: -4.18, yTop: 1.76, yBot: 0.52 },
    wheelR: 0.365, wheelY: 0.39, span: [1.5, -3.15],
    sprocket: { z: -3.95, y: 0.58, r: 0.30 }, idler: { z: 2.2, y: 0.58, r: 0.30 }, topY: 0.95,
    skirts: [
      { z0: 0.3, z1: 2.35, y0: 0.42, y1: 1.30, seams: 2, heavy: true },
      { z0: -3.9, z1: 0.3, y0: 0.46, y1: 1.26, seams: 6, heavy: true },
    ],
    fans: { z: -3.1, x: 0.78, r: 0.36 }, antiSlip: false,
  });
  // AMAP hull-side courses: tall faceted module walls above the skirts
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 1.80, 1.24, 1.5], [s * 1.98, 1.24, 1.35], [s * 1.98, 1.24, -3.55], [s * 1.80, 1.24, -3.62],
      [s * 1.80, 2.16, 1.30], [s * 1.94, 2.14, 1.15], [s * 1.94, 2.14, -3.55], [s * 1.80, 2.16, -3.62]));
    for (let k = 0; k < 6; k++) P.add('hullDark', box(0.17, 0.82, 0.02), s * 1.87, 1.70, 1.1 - k * 0.85);
    P.add('hull', box(0.16, 1.10, 0.30), s * 1.86, 1.80, -3.72);               // rear corner posts
    P.add('hullDark', box(0.10, 0.08, 0.05), s * 1.86, 2.30, -3.72);
  }
  // bow appliqué wedge: flat shelf over the glacis reaching z 2.85, with the
  // print's gun travel-clamp rod running forward at the shelf line
  P.add('hull', slab(
    [-1.85, 1.55, 1.9], [1.85, 1.55, 1.9], [1.35, 1.42, 2.72], [-1.35, 1.42, 2.72],
    [-1.85, 2.05, 1.75], [1.85, 2.05, 1.75], [1.15, 1.99, 2.85], [-1.15, 1.99, 2.85]));
  P.add('hullDark', box(2.3, 0.015, 0.03), 0, 2.03, 1.82);
  P.add('hull', box(0.05, 0.05, 0.62), 0.12, 1.99, 3.12);                      // travel-clamp rod
  P.add('hullDetail', box(0.04, 0.22, 0.04), 0.12, 1.86, 2.86);                // clamp strut on the shelf
  P.add('hullDark', box(0.09, 0.09, 0.06), 0.12, 2.0, 3.42);                   // clamp jaw
  // rear slat/stowage course standing off the tail on brackets
  for (const s of [-1, 1]) P.add('hullDetail', box(0.05, 0.05, 0.55), s * 1.3, 1.32, -4.5);
  P.add('hullDetail', box(2.9, 0.05, 0.05), 0, 1.74, -4.82);
  P.add('hullDetail', box(2.9, 0.05, 0.05), 0, 0.80, -4.68);
  for (let k = 0; k < 11; k++) {
    P.add('hullDetail', box(0.03, 0.98, 0.03), -1.35 + k * 0.27, 1.27, -4.76, 0.14, 0, 0);
  }
  KIT.stowage(P, 'hullCloth', P.rng, [[-0.7, 1.50, -4.42, 0.9, 0.4, 0.4], [0.55, 1.46, -4.42, 0.8, 0.36, 0.38]]);
  P.decal('hull', 'number', 'Y-660', 0.26, [0.62, 1.2, -4.26], Math.PI, 0);

  // AMAP turret: closed faceted arrow — no spaced gap; flat roof band 2.33,
  // raised rear station to 3.0, basket to −3.45. Ring z −0.6, pivot 1.55.
  P.turretG.position.set(0, 1.55, -0.60);
  const h = 0.78;
  P.add('turret', frustum(1.42, 0.95, -2.30, 1.36, 0.90, -2.26, 0.02, h));     // core box
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // faceted closed cheek wedges
      [s * 0.10, 0.04, 2.02], [s * 1.62, 0.06, 0.55], [s * 1.62, 0.06, -0.75], [s * 0.10, 0.04, 1.86],
      [s * 0.10, h - 0.02, 1.28], [s * 1.56, h - 0.04, 0.05], [s * 1.56, h - 0.04, -0.75], [s * 0.10, h - 0.02, 1.12]));
    P.add('turret', slab(                                                      // side course to the bustle
      [s * 1.62, 0.06, -0.75], [s * 1.62, 0.06, -2.28], [s * 1.42, 0.06, -2.30], [s * 1.42, 0.06, -0.75],
      [s * 1.56, h - 0.04, -0.75], [s * 1.56, h - 0.04, -2.28], [s * 1.42, h - 0.05, -2.30], [s * 1.42, h - 0.05, -0.75]));
    for (const zc of [1.35, 0.45, -0.45, -1.35]) {                             // module course seams
      P.add('turretDark', box(0.02, h * 0.7, 0.02), s * (1.58 - Math.max(0, zc - 0.5) * 0.35), h * 0.45, zc);
    }
  }
  P.add('turret', box(0.78, h * 0.82, 0.06), 0, h * 0.44, 1.55);               // mantlet back wall
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, h * 0.72, 0.75), s * 0.40, h * 0.42, 1.62);
  // roof: EMES hood + hatches + raised rear RWS station
  P.add('turretDark', box(0.5, 0.16, 0.42), 0.66, h + 0.02, 0.55);
  P.add('turret', box(0.42, 0.20, 0.34), 0.66, h + 0.04, 0.53);
  P.add('turretGlass', box(0.24, 0.09, 0.018), 0.66, h + 0.06, 0.73);
  P.add('turret', cylY(0.24, 0.24, 0.05, 14), 0.55, h + 0.02, -0.35);
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.60, h + 0.02, -0.25);
  KIT.periscope(P, 'turretDetail', 0.55, h + 0.05, -0.02);
  // rear station: stepped raised platform + RWS block (world peak ~3.0 at
  // z −2.9, sloping up rearward like the print)
  P.add('turret', box(1.7, 0.20, 1.15), 0, h + 0.08, -1.85);
  P.add('turret', box(1.5, 0.18, 0.95), 0, h + 0.26, -2.05);
  P.add('turretDetail', cylY(0.10, 0.12, 0.10, 12), -0.2, h + 0.40, -2.30);
  P.add('turretDark', box(0.22, 0.28, 0.34), -0.2, h + 0.58, -2.30);
  P.add('turretDark', KIT.cylZ(0.024, 0.55, 8), -0.14, h + 0.64, -1.95, -0.06, 0, 0);
  P.add('turretGlass', box(0.10, 0.08, 0.02), -0.2, h + 0.60, -2.12);
  P.add('turretDetail', box(0.03, 1.55, 0.03), 0.95, h + 0.95, -1.62, 0, 0, 0.04); // whip antenna
  P.add('turretDetail', box(0.06, 0.14, 0.06), 0.95, h + 0.22, -1.62);         // antenna base pot
  // bustle basket to −3.45 + smoke banks low on the cheeks
  P.add('turretDetail', box(2.6, 0.045, 0.045), 0, 0.60, -3.35);
  P.add('turretDetail', box(2.6, 0.045, 0.045), 0, 0.14, -3.30);
  for (let k = 0; k <= 9; k++) P.add('turretDetail', box(0.03, 0.46, 0.03), -1.3 + k * 0.289, 0.37, -3.33);
  P.add('turretDark', box(2.5, 0.016, 0.85), 0, 0.17, -2.85);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.6, 0.36, -2.85, 0.8, 0.36, 0.6], [0.6, 0.34, -2.9, 0.7, 0.32, 0.55]]);
  for (const s of [-1, 1]) {
    KIT.smokeCluster(P, s * 1.5, 0.30, 0.15, 4, s * 1.05, 0.85);
    KIT.liftEye(P, 'turretDetail', s * 1.1, h + 0.02, 0.4, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.5, 0.36, -0.4], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.5, 0.36, -0.4], -Math.PI / 2);
  // L/44: trunnion world z 0.60, axis 1.83, muzzle 4.89
  P.gunG.position.set(0, 0.28, 1.20);
  leoMantletGun(P, { rollR: 0.26, rollW: 0.64, plateW: 0.56, plateH: 0.46, len: 4.29, r: 0.080, evac: 0.52, evacR: 1.85 });
  P.topY = 1.9;
}

// ---------------------------------------------------------------------------
// KF51 Panther — docs/references/tanks/kf51.md (kf51_grip420 oracle).
// Angular faceted turret with stepped roof, SEOSS tower to 3.10, rear sensor
// mast, big squared bustle to −2.95 (basket −3.12); Rh-130 muzzle z 6.81.
// ---------------------------------------------------------------------------
function buildKF51(P) {
  const { box, slab, cylY, cylZ, frustum } = KIT;
  leoHull(P, {
    W: 3.60, bodyHW: 1.75, skirtX: 1.79, sponsonY: 1.22, trackW: 0.60, xc: 1.44,
    deck: [[1.95, 1.66], [0.3, 1.69], [-0.9, 1.77], [-1.9, 1.86], [-3.3, 1.92], [-3.64, 1.95], [-3.81, 1.87]],
    crease: { z: 1.95, y: 1.66 }, prow: { z: 3.66, y: 1.40 }, beltY: 0.58,
    rear: { z: -3.81, yTop: 1.85, yBot: 0.52 },
    wheelR: 0.36, wheelY: 0.385, span: [2.6, -2.3],
    sprocket: { z: -3.42, y: 0.66, r: 0.30 }, idler: { z: 3.38, y: 0.60, r: 0.29 }, topY: 0.94,
    // continuous flat-face skirt courses nearly to the ground
    skirts: [
      { z0: 0.9, z1: 3.7, y0: 0.34, y1: 1.24, seams: 3, heavy: true },
      { z0: -3.55, z1: 0.9, y0: 0.30, y1: 1.20, seams: 6, heavy: true },
    ],
    fans: { z: -2.7, x: 0.74, r: 0.36 },
  });
  P.decal('hull', 'number', 'Y-051', 0.26, [0.6, 1.22, -3.88], Math.PI, 0);

  // turret: ring z 0.45, pivot 1.71; flat roof 2.62 (h 0.91), front crown
  // 2.72, forward roof 2.55 falling to the gun; sloped cheek panels; big
  // squared bustle z −1.2..−3.4 (local), basket to −3.55.
  P.turretG.position.set(0, 1.71, 0.45);
  const h = 0.91;
  // core: sloped-side frustum body + full-width squared bustle
  P.add('turret', frustum(1.44, 0.75, -1.70, 1.06, 0.70, -1.66, 0.0, h));
  P.add('turret', frustum(1.40, -1.55, -3.40, 1.24, -1.58, -3.38, 0.06, h - 0.05));
  P.add('turretDark', box(2.44, h * 0.5, 0.05), 0, h * 0.42, -3.40);           // slat rear face
  for (let k = 0; k < 10; k++) P.add('turretDetail', box(0.03, h * 0.62, 0.05), -1.15 + k * 0.256, h * 0.42, -3.42);
  // front wedge plates sweeping to the gun (apex world ~2.45)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.06, 0.02, 1.98], [s * 1.44, 0.04, 0.80], [s * 1.44, 0.04, 0.62], [s * 0.06, 0.02, 1.80],
      [s * 0.36, 0.70, 1.36], [s * 1.06, 0.74, 0.72], [s * 1.06, 0.74, 0.55], [s * 0.36, 0.70, 1.19]));
    // forward roof wedge falling from the crown to the mantlet
    P.add('turret', slab(
      [s * 0.36, 0.70, 1.36], [s * 1.06, 0.74, 0.72], [s * 1.06, 0.74, 0.55], [s * 0.36, 0.70, 1.19],
      [s * 0.30, 0.76, 1.34], [s * 0.98, 0.80, 0.70], [s * 0.98, 0.80, 0.53], [s * 0.30, 0.76, 1.17]));
  }
  P.add('turret', box(0.80, 0.72, 0.06), 0, 0.40, 1.32);                       // mantlet back wall
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.66, 0.7), s * 0.41, 0.40, 1.62);
  // stepped roof: raised front crown block + flat main roof
  P.add('turret', box(1.9, 0.10, 0.55), 0, h - 0.045 + 0.09, 0.42);            // front crown (2.72)
  P.add('turretDark', box(0.62, 0.016, 0.4), 0.35, h + 0.02, 0.42);            // drone bay seams
  P.add('turretDark', box(0.62, 0.016, 0.4), -0.55, h + 0.02, 0.30);
  // SEOSS panoramic tower (world 3.10 at z ~-0.05 → local −0.5)
  P.add('turretDetail', cylY(0.10, 0.12, 0.20, 12), 0.12, h + 0.10, -0.50);
  P.add('turretDark', box(0.26, 0.26, 0.28), 0.12, h + 0.30, -0.50);
  P.add('turretGlass', box(0.16, 0.12, 0.02), 0.12, h + 0.32, -0.35);
  // commander/loader hatches + periscopes
  P.add('turret', cylY(0.24, 0.24, 0.045, 14), 0.62, h + 0.02, -0.75);
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.64, h + 0.02, -0.65);
  KIT.periscope(P, 'turretDetail', 0.62, h + 0.05, -0.45);
  KIT.periscope(P, 'turretDetail', -0.40, h + 0.05, -0.40, 0.3);
  // rear sensor mast (3.05) + whip antenna (3.58) + Natter RWS on the bustle
  P.add('turretDetail', cylY(0.03, 0.04, 0.35, 8), -0.55, h + 0.22, -3.05);
  P.add('turretDark', box(0.13, 0.14, 0.13), -0.55, h + 0.44, -3.05);
  P.add('turretDetail', box(0.03, 1.1, 0.03), 0.9, h + 0.37, -2.6, 0, 0, 0.05);
  P.add('turretDetail', box(0.06, 0.13, 0.06), 0.9, h + 0.02, -2.6);           // antenna base pot
  P.add('turretDetail', cylY(0.09, 0.10, 0.07, 10), 0.35, h - 0.06, -2.65);    // Natter ring
  P.add('turretDark', box(0.17, 0.14, 0.28), 0.35, h + 0.05, -2.65);
  P.add('turretDark', cylZ(0.02, 0.45, 8), 0.42, h + 0.08, -2.38, -0.05, 0, 0);
  // bustle-rear basket + stowage
  P.add('turretDetail', box(2.5, 0.045, 0.045), 0, 0.52, -3.62);
  P.add('turretDetail', box(2.5, 0.045, 0.045), 0, 0.12, -3.58);
  for (let k = 0; k <= 9; k++) P.add('turretDetail', box(0.03, 0.4, 0.03), -1.25 + k * 0.278, 0.32, -3.60);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.5, 0.3, -3.15, 0.8, 0.34, 0.5], [0.6, 0.28, -3.2, 0.6, 0.3, 0.45]]);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.05, 0.24, 0.55), s * 1.24, 0.30, -1.15, 0, s * 0.2, 0);
    KIT.smokeCluster(P, s * 1.27, 0.42, -1.0, 4, s * 1.05, 0.85);
    KIT.smokeCluster(P, s * 1.29, 0.26, -1.2, 4, s * 1.15, 0.85);
    KIT.liftEye(P, 'turretDetail', s * 0.95, h + 0.02, -0.1, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.30, 0.35, -0.7], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.30, 0.35, -0.7], -Math.PI / 2);
  // Rh-130 L/52 FGS: fat shrouded tube, blocky muzzle section; trunnion
  // world z 1.33, axis 1.97, muzzle 6.81
  P.gunG.position.set(0, 0.26, 0.88);
  P.addGunExtra(KIT.cylX(0.30, 0.70, P.q ? 18 : 12), 0, 0, 0);                 // trunnion roll
  P.addGunExtra(box(0.55, 0.52, 0.55), 0, 0, 0.42);                            // blocky mantlet shroud
  P.addGunExtra(box(0.42, 0.40, 0.35), 0, 0, 0.80);
  P.addGunExtraDark(cylZ(0.03, 0.10, 8), 0.24, 0.08, 0.70);
  KIT.buildGun(P, { len: 5.48, r: 0.102, sleeve: true, evac: 0.52, evacR: 1.7, collar: false, baseR: 0.18 });
  // squared muzzle section (the FGS's blocky device)
  P.add('gun', box(0.20, 0.20, 0.42), 0, 0, 5.20);
  P.add('gunDark', box(0.145, 0.145, 0.06), 0, 0, 5.44);
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
