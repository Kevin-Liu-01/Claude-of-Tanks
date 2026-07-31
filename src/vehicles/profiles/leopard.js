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
  // inboard end-wheel radius clamped so the band wrap never dips below the
  // ground plane (wrap bottom = wheelY - r - trackTh; a sub-zero bottom
  // inflates dims.heightM, which measures p95 top MINUS min bottom)
  const inbY = g.wheelY ?? g.wheelR + 0.03;
  const inbR = Math.min(g.wheelR, inbY - 0.09 - 0.015);
  const inboard = g.raisedEnds ? {
    sprocket: { z: g.span[1] - 0.16, y: inbY, r: inbR },
    idler: { z: g.span[0] + 0.16, y: inbY, r: inbR },
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
    // band ramps derived from the actual wrap geometry: from the contact
    // flat just past the end road wheel up to the raised wheel's wrap
    // bottom (measured refs: long ~40-48deg climbs, band visibly wrapping)
    const ramp = (end, dir) => {
      const z0 = (dir > 0 ? g.span[0] : g.span[1]) + dir * (g.wheelR + 0.06);
      const y0 = (g.botY ?? 0.06) + 0.02;
      const z1 = end.z - dir * end.r * 0.25;
      const y1 = end.y - end.r - 0.02;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const rx = -dir * Math.atan2(y1 - y0, dir * (z1 - z0));
      for (const s of [-1, 1]) {
        P.add('hullDark', box(0.26, 0.075, len), s * g.xc, (y0 + y1) / 2, (z0 + z1) / 2, rx, 0, 0);
      }
    };
    ramp(g.idler, 1);
    ramp(g.sprocket, -1);
    for (const s of [-1, 1]) {
      P.add('hullDetail', cylX(g.idler.r, 0.16, seg), s * g.xc, g.idler.y, g.idler.z);
      P.add('hullDark', cylX(g.idler.r + 0.05, 0.26, seg), s * g.xc, g.idler.y, g.idler.z);
      P.add('hullDetail', cylX(g.sprocket.r, 0.16, seg), s * g.xc, g.sprocket.y, g.sprocket.z);
      P.add('hullDark', cylX(g.sprocket.r + 0.055, 0.26, seg), s * g.xc, g.sprocket.y, g.sprocket.z);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        P.add('hullDetail', box(0.26, 0.06, 0.045), s * g.xc,
          g.sprocket.y + Math.sin(a) * (g.sprocket.r + 0.045), g.sprocket.z + Math.cos(a) * (g.sprocket.r + 0.045), -a, 0, 0);
      }
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
// GATE-V10 measured-curve machinery for the two live-mask wedge tanks
// (leo2a6 / leo2a5). Every constant is read off the fresh post-repair
// extractions (docs/references/profiles/<id>.json decoded to world coords)
// — the a6 whips are folded and the a5 shell fully absorbed, so the masks
// are honest now. Original primitive lofts only.
// ---------------------------------------------------------------------------

// Lofted hull: deck polyline band + two-slope glacis + beak, measured rear
// wall/lip, segmented full-length fender planks (width carriers must catch
// station slice windows — merkava packet mechanics), heavy front skirt
// blocks at EXACTLY the committed half-width, inset rear skirt run.
function leoHullV3(P, H) {
  const { box, slab, cylY, cylZ, torus, headlight, liftEye, towCable, periscope } = KIT;
  const hw = H.bodyHW;
  const deck = H.deck;                     // [[z,y] ...] crease -> tail
  const tailZ = deck[deck.length - 1][0];
  // deck band slabs down to the sponson floor
  for (let i = 0; i < deck.length - 1; i++) {
    const [zF, yF] = deck[i], [zR, yR] = deck[i + 1];
    P.add('hull', slab(
      [-hw, H.sponsonY, zF], [hw, H.sponsonY, zF], [hw, H.sponsonY, zR], [-hw, H.sponsonY, zR],
      [-hw, yF, zF], [hw, yF, zF], [hw, yR, zR], [-hw, yR, zR]));
  }
  // lower hull tub + belly
  const bellyY = H.bellyY ?? 0.42;
  const innerW = H.innerW ?? (H.xc - H.trackW / 2 - 0.05) * 2;
  P.add('hull', box(innerW, H.sponsonY - bellyY + 0.06, deck[0][0] - tailZ - 0.1),
    0, (H.sponsonY + bellyY) / 2 - 0.03, (deck[0][0] + tailZ) / 2);
  // glacis: chained slabs along the measured two-slope polyline (near-full
  // width: the measured beaks stay wide — plan nose +-1.6 at the tip band)
  const g = H.glacis;                      // [[z,y] ...] crease -> beak tip
  const gwid = H.glacisTaper ?? 0.03;
  for (let i = 0; i < g.length - 1; i++) {
    const [zF, yF] = g[i], [zR, yR] = g[i + 1];
    const wF = hw * (1 - gwid * Math.max(0, zF - g[0][0]) / (g[g.length - 1][0] - g[0][0]));
    const wR = hw * (1 - gwid * Math.max(0, zR - g[0][0]) / (g[g.length - 1][0] - g[0][0]));
    P.add('hull', slab(
      [-wF, yF - 0.16, zF], [wF, yF - 0.16, zF], [wR, yR - 0.14, zR], [-wR, yR - 0.14, zR],
      [-wF, yF, zF], [wF, yF, zF], [wR, yR, zR], [-wR, yR, zR]));
  }
  // beak tip: the measured plan nose is CLIPPED at the centre (tow-hook
  // recess) with the wings running further forward
  const tip = g[g.length - 1];
  if (H.beakWings) {
    const BW = H.beakWings;               // {z: wing tip z, x0: notch half-w, th?}
    const bwT = BW.th ?? 0.17;
    for (const s of [-1, 1]) {
      P.add('hull', slab(
        [s * BW.x0, tip[1] - bwT, tip[0]], [s * (hw * 0.97), tip[1] - bwT, tip[0] - 0.02], [s * (hw * 0.97), tip[1] - bwT + 0.01, tip[0] - 0.3], [s * BW.x0, tip[1] - bwT + 0.01, tip[0] - 0.3],
        [s * BW.x0, tip[1], BW.z], [s * (hw * 0.97), tip[1] + 0.005, BW.z - 0.02], [s * (hw * 0.97), tip[1] + 0.01, tip[0] - 0.3], [s * BW.x0, tip[1] + 0.01, tip[0] - 0.3]));
    }
  }
  // beak underside: tip band down-back to the belt
  P.add('hull', slab(
    [-hw * 0.86, H.beltY, tip[0] - 0.52], [hw * 0.86, H.beltY, tip[0] - 0.52],
    [hw * 0.86, H.beltY, tip[0] - 0.38], [-hw * 0.86, H.beltY, tip[0] - 0.38],
    [-hw * 0.90, tip[1] - 0.05, tip[0] - 0.04], [hw * 0.90, tip[1] - 0.05, tip[0] - 0.04],
    [hw * 0.90, tip[1] - 0.19, tip[0]], [-hw * 0.90, tip[1] - 0.19, tip[0]]));
  P.add('hull', box(hw * 1.6, 0.5, 1.1), 0, tip[1] - 0.42, tip[0] - 0.95);   // nose interior fill (kept above the belly line)
  // glacis furniture: weld seam, splash V, tow eyes, headlight pods
  const cr = g[0];
  P.add('hullDark', box(hw * 1.8, 0.014, 0.026), 0, cr[1] + 0.006, cr[0] + 0.02);
  const gRx = -Math.atan2(g[0][1] - g[1][1], g[1][0] - g[0][0]);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.85, 0.035, 0.06), s * 0.44, cr[1] - 0.05, cr[0] + 0.40, gRx, s * 0.42, 0);
    headlight(P, s * hw * 0.66, H.headlightY ?? (tip[1] + 0.02), H.headlightZ ?? (tip[0] - 0.62), gRx);
  }
  // driver hatch + flush periscopes front-right, ammo hatch left
  const dz = H.driverZ ?? cr[0] - 0.60;
  const dy = deck[0][1];
  P.add('hull', cylY(0.26, 0.26, 0.022, P.q ? 22 : 12), 0.60, dy + 0.008, dz);
  P.add('hullDark', torus(0.26, 0.010, P.q ? 22 : 12), 0.60, dy + 0.018, dz);
  for (const [px, pz, pr] of [[0.38, dz + 0.34, 0], [0.60, dz + 0.37, 0], [0.82, dz + 0.34, 0.3]]) {
    P.add('hullDark', box(0.16, 0.018, 0.09), px, dy + 0.012, pz, 0, pr, 0);
  }
  P.add('hull', cylY(0.23, 0.23, 0.018, P.q ? 20 : 12), -0.60, dy + 0.007, dz);
  P.add('hullDark', torus(0.23, 0.010, P.q ? 20 : 12), -0.60, dy + 0.015, dz);
  // rear deck furniture: flush fan discs, radiator wells, transverse louvre
  const fz = H.fans.z, fx = H.fans.x, fr = H.fans.r;
  const fy = deckYAt(deck, fz);
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(fr, fr, 0.014, P.q ? 26 : 14), s * fx, fy + 0.008, fz);
    P.add('hullDetail', torus(fr, 0.022, P.q ? 24 : 14), s * fx, fy + 0.012, fz);
    P.add('hullDetail', torus(fr * 0.58, 0.014, P.q ? 20 : 12), s * fx, fy + 0.010, fz);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box((fr * 1.7) - Math.abs(k - 2) * fr * 0.36, 0.010, 0.05),
        s * fx, fy + 0.012, fz - fr * 0.62 + k * fr * 0.31);
    }
    const rx = hw - 0.40;
    P.add('hullDark', box(0.38, 0.014, 1.0), s * rx, fy + 0.008, fz + 0.55);
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.32, 0.012, 0.06), s * rx, fy + 0.013, fz + 0.18 + k * 0.18);
    for (const zc of [fz + 1.6, fz + 2.2]) {
      P.add('hullDetail', cylY(0.09, 0.09, 0.016, 12), s * rx, deckYAt(deck, zc) + 0.008, zc);
    }
  }
  const tz = tailZ + 0.40;
  const ty = deckYAt(deck, tz);
  P.add('hullDark', box(hw * 1.6, 0.014, 0.48), 0, ty + 0.006, tz);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(hw * 1.5, 0.012, 0.06), 0, ty + 0.011, tz - 0.18 + k * 0.12);
  if (H.rope !== false) {
    towCable(P, [[-hw * 0.7, ty + 0.015, fz - 0.5], [-0.5, ty + 0.02, tz - 0.26],
      [0.5, ty + 0.02, tz - 0.26], [hw * 0.7, ty + 0.015, fz - 0.5]], 0.024);
  }
  // anti-slip zones (paint-flat)
  for (const [ax, azz, aw, ad] of [[-hw * 0.5, 0.9, hw * 0.5, 1.0], [hw * 0.55, 0.6, hw * 0.42, 1.2]]) {
    P.add('hullRubber', box(aw, 0.010, ad), ax, deckYAt(deck, azz) + 0.008, azz);
  }
  liftEye(P, 'hullDetail', -hw * 0.8, deckYAt(deck, 0.4) + 0.015, 0.4);
  liftEye(P, 'hullDetail', hw * 0.8, deckYAt(deck, -0.6) + 0.015, -0.6);

  // rear wall: plate from the measured undercut line up to the deck, tail
  // lip (deck overhang) beyond it, louvres/taillights on the plate.
  // NOTHING deep below the undercut — the print's sprocket zone stays open
  // (the old full-depth lower box read as a 0.1-bottom column in the
  // front-view hull mask; ref bottoms there are the 0.42 belly).
  const R = H.rear;
  P.add('hull', box(hw * 1.94, R.yTop - R.yBot, 0.12), 0, (R.yTop + R.yBot) / 2, R.wallZ + 0.06);
  P.add('hull', slab(                                                        // tail lip overhang
    [-hw, R.yTop - 0.10, R.wallZ], [hw, R.yTop - 0.10, R.wallZ],
    [hw, R.yTop - 0.09, R.lipZ], [-hw, R.yTop - 0.09, R.lipZ],
    [-hw, R.yTop + 0.015, R.wallZ], [hw, R.yTop + 0.015, R.wallZ],
    [hw, R.yTop, R.lipZ], [-hw, R.yTop, R.lipZ]));
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.60, 0.14, 0.04), s * hw * 0.52, R.yTop - 0.30, R.wallZ - 0.005);
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.56, 0.028, 0.05), s * hw * 0.52, R.yTop - 0.36 + k * 0.058, R.wallZ - 0.015);
    P.add('hullDark', box(0.14, 0.08, 0.04), s * hw * 0.80, R.yTop - 0.11, R.wallZ - 0.005);
  }
  P.add('hullDark', box(0.14, 0.085, 0.04), 0, R.yTop - 0.13, R.wallZ - 0.005); // convoy light
  P.add('hullWood', box(0.24, 0.10, 0.08), 0, R.yBot + 0.08, R.wallZ - 0.02);
  // rear corner mud flaps hanging off the fender ends (real A5/A6 fit; they
  // also carry the tail body-span columns the published hullLengthM needs)
  if (H.rearFlaps) {
    const FL = H.rearFlaps;
    for (const s of [-1, 1]) {
      P.add('hullRubber', box(0.38, FL.y1 - FL.y0, 0.035), s * FL.x, (FL.y0 + FL.y1) / 2, FL.z, 0.06, 0, 0);
      // mounting bracket back onto the rear wall (floater-safe)
      P.add('hullDetail', box(0.07, 0.07, R.wallZ - FL.z + 0.14), s * FL.x, FL.y1 - 0.03, (FL.z + R.wallZ) / 2);
    }
  }

  // full-length fender planks, SEGMENTED so every station slice window
  // catches an end cap (unbroken axis-aligned boxes are edge-on invisible)
  const F = H.fender;
  {
    const segN = Math.max(6, Math.round((F.z1 - F.z0) / 0.45));
    const segL = (F.z1 - F.z0) / segN;
    for (const s of [-1, 1]) {
      for (let k = 0; k < segN; k++) {
        const zc = F.z0 + segL * (k + 0.5);
        P.add('hull', box(F.x1 - F.x0, F.y1 - F.y0, segL - 0.02),
          s * (F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, zc);
      }
      P.add('hullDark', box((F.x1 - F.x0) * 0.7, 0.012, F.z1 - F.z0 - 0.1),
        s * (F.x0 + F.x1) / 2, F.y1 + 0.006, (F.z0 + F.z1) / 2);
    }
  }
  // heavy sculpted front skirt blocks — outer face at EXACTLY H.frontSkirt.x
  // (the committed width guard: nothing on the vehicle stands wider)
  const FS = H.frontSkirt;
  const fsTh = FS.th ?? 0.10;
  for (const s of [-1, 1]) {
    P.add('hull', box(fsTh, FS.y1 - FS.y0, FS.z1 - FS.z0), s * (FS.x - fsTh / 2), (FS.y0 + FS.y1) / 2, (FS.z0 + FS.z1) / 2);
    for (let k = 1; k < 3; k++) {
      const z = FS.z0 + (FS.z1 - FS.z0) * (k / 3);
      P.add('hullDark', box(fsTh + 0.002, (FS.y1 - FS.y0) * 0.86, 0.016), s * (FS.x - fsTh / 2), (FS.y0 + FS.y1) / 2, z);
    }
    P.add('hull', box(fsTh, 0.12, FS.z1 - FS.z0 - 0.06), s * (FS.x - fsTh / 2 - 0.005), FS.y0 - 0.02, (FS.z0 + FS.z1) / 2, 0, 0, -s * 0.22);
  }
  // thinner rear skirt run, inset under the fender lip
  const RS = H.rearSkirt;
  for (const s of [-1, 1]) {
    P.add('hull', box(0.045, RS.y1 - RS.y0, RS.z1 - RS.z0), s * (RS.x - 0.0225), (RS.y0 + RS.y1) / 2, (RS.z0 + RS.z1) / 2);
    P.add('hullRubber', box(0.028, 0.09, RS.z1 - RS.z0 - 0.05), s * (RS.x - 0.03), RS.y0 - 0.025, (RS.z0 + RS.z1) / 2);
    for (let k = 1; k < 6; k++) {
      const z = RS.z0 + (RS.z1 - RS.z0) * (k / 6);
      P.add('hullDark', box(0.05, (RS.y1 - RS.y0) * 0.9, 0.014), s * (RS.x - 0.0225), (RS.y0 + RS.y1) / 2, z);
    }
  }
  leoGear(P, {
    xc: H.xc, trackW: H.trackW, wheelR: H.wheelR, wheelY: H.wheelY,
    span: H.span, sprocket: H.sprocket, idler: H.idler, topY: H.topY,
    botY: H.botY ?? 0.06, raisedEnds: true,
  });
}

// Measured wedge turret (a6/a5): arrowhead plates lofted along the traced
// nose line with the crest FALLING outboard (ref front views read 2.6 ->
// 2.05 across the wedge), wall taper, measured rack, roof clusters capped
// by the published-height p95 budget (<= 4 raised trace columns).
// All coordinates turret-local.
function wedgeTurretV3(P, T) {
  const { box, slab, frustum, cylY, cylZ, periscope, liftEye, smokeCluster, stowage, jerryCan, tarpRoll } = KIT;
  const h = T.h;
  // core body: stepped boxes following the measured plan taper. Walls run
  // vertical to the chamfer line, then tilt inward to the narrower roof
  // plateau (ref front views: vertical to ~2.32, roof edge at ~+-1.05).
  // T.body: [{x, z0(rear), z1(front), top?, xt?, cY?}] y 0.02..(top ?? h)
  for (const B of T.body) {
    const cY = B.cY ?? Math.min(T.chamferY ?? (h - 0.24), (B.top ?? h) - 0.1);
    P.add('turret', frustum(B.x, B.z1, B.z0, B.x, B.z1 - 0.01, B.z0 + 0.01, T.baseY ?? 0.02, cY));
    P.add('turret', frustum(B.x, B.z1, B.z0, B.xt ?? Math.min(B.x, T.roofX ?? B.x * 0.76), B.z1 - 0.03, B.z0 + 0.03, cY, B.top ?? h));
  }
  P.add('turret', box(T.body[0].x * 1.5, 0.30, 1.6), 0, 0.16, T.body[0].z1 + 0.5); // underride fill to the mantlet slot
  // basket/ring shading kept ABOVE the hull deck line (a hanging tub reads
  // as the turret mask bottom in side view — the refs bottom at the deck)
  P.add('turretDark', box(1.30, 0.10, 1.30), 0, -0.03, 0.30);
  P.add('turretDark', box(1.50, 0.08, 2.0), 0, -0.02, -0.30);
  // wedge shells per side: apex tier (thin near-horizontal arrow plates
  // carrying the plan nose line + the low tips), then the big upper plate
  // whose crest falls outboard along the measured front-view line.
  const N = T.nose;              // [[x, z] ...] apex ridge -> tip nose corner
  const C = T.crest;             // [[x, y, z] ...] crest inner -> crest outer
  const aB = T.apexY;
  for (const s of [-1, 1]) {
    for (let i = 0; i < N.length - 1; i++) {
      const [x0, z0] = N[i], [x1, z1] = N[i + 1];
      P.add('turret', slab(
        [s * x0, aB, z0], [s * x1, aB, z1], [s * x1, aB, z1 - 0.55], [s * x0, aB, z0 - 0.55],
        [s * x0, aB + 0.15, z0 - 0.06], [s * x1, aB + 0.15, z1 - 0.06], [s * x1, aB + 0.15, z1 - 0.58], [s * x0, aB + 0.15, z0 - 0.58]));
    }
    // tip block: the wedge tip plan pad (widest point, low)
    P.add('turret', box(0.16, T.tip.h, T.tip.z1 - T.tip.z0), s * (T.tip.x - 0.08), aB + T.tip.h / 2, (T.tip.z0 + T.tip.z1) / 2, 0, s * (T.tip.yaw ?? 0.10), 0);
    // upper wedge plates: nose-line base -> falling crest
    for (let i = 0; i < C.length - 1; i++) {
      const [cx0, cy0, cz0] = C[i], [cx1, cy1, cz1] = C[i + 1];
      const nz = (x) => {                          // z on the nose line at x
        for (let k = 0; k < N.length - 1; k++) {
          const [xa, za] = N[k], [xb, zb] = N[k + 1];
          if (x <= xb + 1e-6 || k === N.length - 2) return za + (zb - za) * ((x - xa) / (xb - xa || 1));
        }
        return N[N.length - 1][1];
      };
      P.add('turret', slab(
        [s * cx0, aB + 0.13, nz(cx0)], [s * cx1, aB + 0.13, nz(cx1)], [s * cx1, aB + 0.13, nz(cx1) - 0.42], [s * cx0, aB + 0.13, nz(cx0) - 0.42],
        [s * cx0, cy0, cz0], [s * cx1, cy1, cz1], [s * cx1, cy1 - 0.06, cz1 - 0.34], [s * cx0, cy0 - 0.06, cz0 - 0.34]));
      // dark spaced-armor shadow wall behind the plate
      P.add('turretDark', slab(
        [s * (cx0 * 0.97), aB + 0.2, nz(cx0) - 0.44], [s * (cx1 * 0.97), aB + 0.2, nz(cx1) - 0.44], [s * (cx1 * 0.97), aB + 0.2, nz(cx1) - 0.52], [s * (cx0 * 0.97), aB + 0.2, nz(cx0) - 0.52],
        [s * (cx0 * 0.97), cy0 - 0.06, cz0 - 0.36], [s * (cx1 * 0.97), cy1 - 0.06, cz1 - 0.36], [s * (cx1 * 0.97), cy1 - 0.10, cz1 - 0.44], [s * (cx0 * 0.97), cy0 - 0.10, cz0 - 0.44]));
    }
  }
  // mantlet slot back wall + cheeks
  P.add('turret', box(T.gunW * 2 + 0.08, h * 0.82, 0.06), 0, h * 0.44, T.slotZ);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, h * 0.7, 0.8), s * (T.gunW + 0.04), h * 0.40, T.slotZ + 0.36);
  // bustle rack: rails + slats + strapped kit, measured width/height
  const RK = T.rack;
  P.add('turretDetail', box(2 * RK.x, 0.045, 0.045), 0, RK.top, RK.z1 + 0.03);
  P.add('turretDetail', box(2 * RK.x, 0.045, 0.045), 0, RK.bot, RK.z1);
  for (let k = 0; k <= 10; k++) {
    P.add('turretDetail', box(0.03, RK.top - RK.bot, 0.03), -RK.x + k * (2 * RK.x / 10), (RK.top + RK.bot) / 2, RK.z1 + 0.015);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.045, 0.045, RK.z0 - RK.z1), s * RK.x, RK.top, (RK.z0 + RK.z1) / 2);
    P.add('turretDetail', box(0.045, 0.045, RK.z0 - RK.z1), s * RK.x, RK.bot, (RK.z0 + RK.z1) / 2);
  }
  P.add('turretDark', box(2 * RK.x - 0.1, 0.016, RK.z0 - RK.z1 - 0.05), 0, RK.bot + 0.03, (RK.z0 + RK.z1) / 2);
  const bz = (RK.z0 + RK.z1) / 2;
  stowage(P, 'turretCloth', P.rng, [
    [-RK.x * 0.55, RK.bot + 0.24, bz, 0.7, (RK.top - RK.bot) * 0.85, 0.4],
    [RK.x * 0.25, RK.bot + 0.22, bz - 0.02, 0.62, (RK.top - RK.bot) * 0.75, 0.38],
    [RK.x * 0.78, RK.bot + 0.20, bz, 0.42, (RK.top - RK.bot) * 0.7, 0.36],
  ]);
  jerryCan(P, 'turretCloth', -RK.x * 0.9, RK.bot + 0.20, bz, 0.15);
  tarpRoll(P, 'turretCloth', RK.x * 0.5, RK.top - 0.02, bz, 0.9, 0.085, true, P.q ? 12 : 8);
  // roof: EMES hood (recessed cutout, lid at the published-height line),
  // hatches, PERI blister (the <=0.45 m p95 spike budget), smoke mortars
  // tucked inside the wedge plan, optional whip antennas (measured 1-col
  // positions), crosswind mast at the roofline.
  const E = T.emes;
  P.add('turretDark', box(0.54, 0.20, 0.46), E.x, h - 0.09, E.z);
  P.add('turret', box(0.44, 0.18, 0.36), E.x, h - 0.045, E.z - 0.02);
  P.add('turretDetail', box(0.48, 0.035, 0.40), E.x, E.top - 0.018, E.z - 0.03);
  P.add('turretDark', box(0.32, 0.14, 0.03), E.x, h - 0.04, E.z + 0.20);
  P.add('turretGlass', box(0.24, 0.09, 0.016), E.x, h - 0.04, E.z + 0.215);
  const PR = T.peri;
  const prD = PR.d ?? 0.24;
  if (PR.top - h > 0.20) {
    P.add('turretDetail', cylY(0.10, 0.12, PR.top - h - 0.24, 12), PR.x, h + (PR.top - h - 0.24) / 2, PR.z);
  }
  P.add('turretDark', box(0.24, 0.26, prD), PR.x, PR.top - 0.13, PR.z);
  P.add('turretGlass', box(0.15, 0.10, 0.016), PR.x, PR.top - 0.10, PR.z + prD / 2);
  for (const [st, lo] of [[T.cmdr, false], [T.loader, true]]) {
    P.add('turret', cylY(lo ? 0.21 : 0.23, lo ? 0.21 : 0.23, 0.035, 14), st.x, h + 0.017, st.z);
    P.add('turretDark', box((lo ? 0.32 : 0.36), 0.012, 0.03), st.x, h + 0.042, st.z);
  }
  periscope(P, 'turretDetail', T.cmdr.x, h - 0.01, T.cmdr.z + 0.30);
  const mTop = T.mastTop ?? (h + 0.06);
  P.add('turretDetail', cylY(0.014, 0.018, mTop - h - 0.02, 8), T.mastX ?? -0.85, (h + mTop) / 2 - 0.01, T.mastZ);
  P.add('turretDark', box(0.04, 0.035, 0.10), T.mastX ?? -0.85, mTop - 0.017, T.mastZ);
  for (const w of T.whips ?? []) {
    P.add('turretDetail', box(0.06, 0.12, 0.06), w.x, w.baseY, w.z);
    P.add('turretDetail', box(0.026, w.top - w.baseY - 0.05, 0.026), w.x, (w.baseY + w.top) / 2, w.z);
  }
  for (const s of [-1, 1]) {
    const sm = T.smoke;
    P.add('turret', box(0.05, 0.22, 0.52), s * sm.x, sm.y, sm.z, 0, s * 0.20, 0);
    smokeCluster(P, s * (sm.x + 0.02), sm.y + 0.10, sm.z + 0.14, 4, s * 1.05, 0.85);
    smokeCluster(P, s * (sm.x + 0.04), sm.y - 0.06, sm.z - 0.06, 4, s * 1.2, 0.85);
    liftEye(P, 'turretDetail', s * (T.body[0].x * 0.58), h - 0.02, E.z - 0.5, s * 0.4);
  }
}

// ---------------------------------------------------------------------------
// Leopard 2A6 — GATE-V10 rebuild against the REPAIRED buh oracle (whips
// stowed, honest 2.85 normalization frame). Measured world targets:
// deck 1.67 fore / 1.60 dip / 1.83 aft, tail wall -3.60 undercut at 1.15
// with the lip to -3.79, fenders +-1.66 full length, heavy skirt blocks
// +-1.875 over z 1.44..3.56 (top 1.36), roof 2.55 with the PERI blister
// 2.85 at x -0.32 / z -0.45, wedge crest falling 2.61@x1.0 -> 2.05@x1.47,
// plan nose 3.08 -> tips +-1.50 @ z 0.65..1.90, rack +-1.02 to -2.78,
// mantlet block top 2.14 over z 3.35..3.90, L/55 axis 1.94 muzzle 7.08.
// ---------------------------------------------------------------------------
function buildLeo2A6(P) {
  const { box, slab } = KIT;
  leoHullV3(P, {
    bodyHW: 1.58, sponsonY: 1.30, trackW: 0.46, xc: 1.38,
    deck: [[2.10, 1.67], [-0.10, 1.67], [-0.24, 1.60], [-0.68, 1.60], [-0.95, 1.71], [-1.32, 1.79], [-2.45, 1.815], [-3.10, 1.825], [-3.60, 1.825]],
    glacis: [[2.10, 1.67], [2.64, 1.59], [3.13, 1.40], [3.60, 1.24]],
    beakWings: { z: 3.81, x0: 0.55 },
    beltY: 0.62, bellyY: 0.50, headlightY: 1.49,
    rear: { wallZ: -3.62, lipZ: -3.78, yTop: 1.80, yBot: 1.13 },
    rearFlaps: { x: 1.44, z: -3.77, y0: 0.45, y1: 1.12 },
    fender: { x0: 1.615, x1: 1.74, y0: 1.60, y1: 1.665, z0: -3.70, z1: 3.58 },
    frontSkirt: { x: 1.875, z0: 1.44, z1: 3.56, y0: 0.87, y1: 1.365, th: 0.16 },
    rearSkirt: { x: 1.73, z0: -3.50, z1: 1.44, y0: 0.86, y1: 1.32 },
    wheelR: 0.365, wheelY: 0.39, span: [2.55, -2.42],
    idler: { z: 3.30, y: 0.90, r: 0.28 }, sprocket: { z: -3.22, y: 0.92, r: 0.30 },
    topY: 0.95, fans: { z: -2.55, x: 0.78, r: 0.38 },
  });
  P.decal('hull', 'number', 'Y-241', 0.26, [0.62, 1.45, -3.70], Math.PI, 0);

  // turret: pivot (0,1.77,0.35); roof 2.55 (h 0.78); measured wedge tables
  P.turretG.position.set(0, 1.77, 0.35);
  wedgeTurretV3(P, {
    h: 0.75, apexY: 0.16, gunW: 0.36, slotZ: 1.55,
    chamferY: 0.55, roofX: 1.05,
    body: [
      { x: 1.38, z0: -1.52, z1: 0.60 },       // wide fore body (ref +-1.41 to -1.19w)
      { x: 1.29, z0: -2.07, z1: -1.52, xt: 1.05 },  // step (ref +-1.32 to -1.72w)
      { x: 1.10, z0: -2.28, z1: -2.07, xt: 0.99 }, // bustle neck (ref +-1.13)
    ],
    rack: { x: 1.10, z0: -2.28, z1: -3.10, top: 0.56, bot: 0.02 },
    nose: [[0.15, 2.66], [1.06, 2.14], [1.50, 1.52]],
    tip: { x: 1.50, z0: 0.30, z1: 1.52, h: 0.16, yaw: 0.06 },
    crest: [[0.16, 0.85, 1.42], [0.88, 0.82, 0.72], [1.20, 0.64, 0.28], [1.46, 0.50, 0.02]],
    emes: { x: 0.68, z: -0.22, top: 0.875 },
    peri: { x: -0.32, z: -0.90, top: 1.08, d: 0.30 },
    cmdr: { x: 0.62, z: -0.55 }, loader: { x: -0.66, z: -0.42 },
    mastX: -0.85, mastZ: -2.20, mastTop: 0.78,
    smoke: { x: 1.24, z: -0.05, y: 0.38 },
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.15, 0.36, -0.9], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.15, 0.36, -0.9], -Math.PI / 2);
  // L/55: trunnion world (1.55), axis 1.94, tube band 1.83..2.05 to the
  // muzzle at +7.08; deep mantlet block in the arrow notch (top 2.14 over
  // z 3.35..3.90 world) + root fill under the notch. No proud evacuator —
  // the print's side band is constant.
  P.gunG.position.set(0, 0.17, 1.20);
  P.addGunExtra(KIT.cylX(0.24, 0.62, P.q ? 18 : 12), 0, 0, 0);                 // trunnion roll
  P.addGunExtra(box(0.56, 0.46, 0.30), 0, 0, 0.16);                            // plate mantlet
  P.addGunExtra(box(0.44, 0.30, 1.10), 0, 0.02, 0.90);                         // root fill (top ~2.11)
  P.addGunExtra(box(0.40, 0.335, 0.56), 0, 0.03, 2.08);                        // deep mantlet block (top 2.14, z 3.35..3.91)
  P.addGunExtraDark(KIT.cylZ(0.026, 0.10, 8), 0.24, 0.06, 0.30);               // coax port
  KIT.buildGun(P, { len: 5.55, r: 0.105, sleeve: true, evac: null, collar: false, baseR: 0.16 });
  // third sleeve section: the print's fat band runs to ~0.15 short of the
  // muzzle (ref plan cols +-0.18 light out to z 6.86)
  P.add('gun', KIT.cylZ(0.126, 0.82, 12), 0, 0, 4.96);
  P.add('gunDark', KIT.cylZ(0.130, 0.05, 12), 0, 0, 5.38);
  P.topY = 1.24;
}

// ---------------------------------------------------------------------------
// Leopard 2A5 — GATE-V10 rebuild against the fully-repaired recovered
// oracle (batch-3 shell absorption + batch-6 hull-aerial fold: the hull
// and turret masks are honest; the TURRET whips still stand — matched as
// 1-column rods). Measured world targets: deck 1.70 fore / 1.84 aft,
// glacis shelf 1.49 over z 2.95..3.6, beak 3.93, hull rear stowage FRAME
// (Strv-pattern, batch-3 certified hull-side) z -3.4..-3.97 top ~1.96,
// fenders +-1.775, heavy skirt +-1.875 over 1.5..3.6, roof 2.54 with the
// wide hatch/PERI cluster (center 4-col tower 2.98 at z -0.25..-0.65 =
// the p95 spike budget; flanks capped 2.66), wedge crest 2.60@x1.0 ->
// 2.03@x1.51, plan nose 3.19 -> tips +-1.50 @ z 0.72..1.84, full-width
// bustle to -2.90, whips (x -0.96, z -1.93) / (+1.08, -2.02) to 4.11,
// mantlet block top 2.21 over z 3.43..3.95, L/44 axis 1.99 muzzle 6.02.
// ---------------------------------------------------------------------------
function buildLeo2A5(P) {
  const { box, slab } = KIT;
  leoHullV3(P, {
    bodyHW: 1.62, sponsonY: 1.32, trackW: 0.64, xc: 1.38,
    deck: [[2.42, 1.665], [1.95, 1.685], [-1.02, 1.70], [-1.35, 1.775], [-2.20, 1.79], [-2.60, 1.84], [-3.34, 1.84]],
    glacis: [[2.42, 1.665], [2.66, 1.585], [2.95, 1.49], [3.62, 1.44], [3.82, 1.24]],
    beakWings: { z: 3.93, x0: 0.55, th: 0.26 },
    beltY: 0.62, bellyY: 0.50, headlightY: 1.50, headlightZ: 3.60,
    rear: { wallZ: -3.42, lipZ: -3.56, yTop: 1.82, yBot: 0.86 },
    fender: { x0: 1.655, x1: 1.775, y0: 1.61, y1: 1.675, z0: -3.60, z1: 3.30 },
    frontSkirt: { x: 1.875, z0: 1.50, z1: 3.60, y0: 0.90, y1: 1.40, th: 0.16 },
    rearSkirt: { x: 1.73, z0: -3.30, z1: 1.50, y0: 0.86, y1: 1.34 },
    wheelR: 0.37, wheelY: 0.395, span: [2.70, -2.35],
    idler: { z: 3.44, y: 0.90, r: 0.28 }, sprocket: { z: -3.30, y: 0.92, r: 0.30 },
    topY: 0.97, fans: { z: -2.70, x: 0.78, r: 0.38 },
  });
  // hull rear stowage frame (batch-3 certified Strv-pattern HULL rack): tray
  // rails riding high over the sprocket zone, slats + strapped load to ~1.96
  {
    const { stowage } = KIT;
    P.add('hullDetail', box(3.05, 0.05, 0.05), 0, 1.335, -3.87);              // low rail (tail body col -> published hullLengthM)
    P.add('hullDetail', box(3.05, 0.05, 0.05), 0, 1.30, -3.44);
    for (let k = 0; k < 8; k++) {
      P.add('hullDetail', box(0.035, 0.035, 0.49), -1.47 + k * 0.42, 1.32, -3.655, -0.05, 0, 0);
    }
    for (const s of [-1, 1]) {                                                // frame legs onto the hull wall
      P.add('hullDetail', box(0.05, 0.36, 0.05), s * 1.42, 1.18, -3.44, 0.25, 0, 0);
      P.add('hullDetail', box(0.05, 0.05, 0.55), s * 1.50, 1.62, -3.62);
    }
    P.add('hullDark', box(2.9, 0.014, 0.44), 0, 1.36, -3.65);
    // wide low load (front-view tops stay at the 1.80-1.85 deck band) + ONE
    // narrow tall tarp roll along z (the ref's single 2.0 front-view column)
    stowage(P, 'hullCloth', P.rng, [
      [-0.85, 1.56, -3.64, 1.15, 0.44, 0.40], [0.55, 1.55, -3.66, 1.05, 0.42, 0.38],
    ]);
    P.add('hullCloth', box(0.16, 0.30, 0.50), -0.08, 1.80, -3.70);            // tall roll (top 1.95, one col)
  }
  P.decal('hull', 'number', 'Y-508', 0.26, [0.62, 1.35, -3.50], Math.PI, 0);

  // turret: pivot (0,1.78,0.30); roof 2.54 (h 0.76); measured wedge tables
  P.turretG.position.set(0, 1.78, 0.30);
  wedgeTurretV3(P, {
    h: 0.76, apexY: 0.16, gunW: 0.36, slotZ: 1.60,
    chamferY: 0.52, roofX: 1.06,
    body: [
      { x: 1.40, z0: -1.20, z1: 0.90 },       // fore body (ref +-1.40)
      { x: 1.31, z0: -2.05, z1: -1.20, xt: 1.04 }, // mid bustle (roof 2.54 to -1.75w)
      { x: 1.31, z0: -3.01, z1: -2.05, xt: 1.08, top: 0.68 }, // rear bustle 2.46w
    ],
    rack: { x: 1.32, z0: -3.01, z1: -3.12, top: 0.62, bot: 0.06 },
    nose: [[0.30, 2.89], [1.29, 2.10], [1.50, 1.54]],
    // full-length side wedge-module band: the a5 print's widest turret run
    // (+-1.52) spans z -1.3..+1.8 WORLD, not just the arrow tips
    tip: { x: 1.52, z0: -1.60, z1: 1.54, h: 0.14, yaw: 0.02 },
    crest: [[0.20, 0.82, 1.50], [1.00, 0.80, 0.72], [1.30, 0.66, 0.28], [1.49, 0.26, 0.06]],
    emes: { x: 0.68, z: 0.30, top: 0.875 },
    // PERI head capped at the published-height p95 line: the two whip rods
    // already spend the 3-column spike budget (heightM = 4th-highest top),
    // so the ref's 2.98 cluster peak is knowingly flattened to 2.66 (dims
    // sovereign; the delta stays a curve residual, not a dims failure)
    peri: { x: -0.30, z: -0.72, top: 0.88 },
    cmdr: { x: 0.60, z: -0.30 }, loader: { x: -0.62, z: -0.30 },
    mastX: -0.85, mastZ: -2.30, mastTop: 0.82,
    whips: [
      { x: -0.96, z: -2.16, baseY: 0.60, top: 2.33 },  // world (x -0.96, z -1.86) tip 4.11
      { x: 1.03, z: -2.29, baseY: 0.60, top: 2.33 },   // world (x +1.03, z -1.99)
    ],
    smoke: { x: 1.26, z: 0.10, y: 0.38 },
  });
  // the rest of the raised hatch cluster around the PERI tower, capped at
  // the published-height p95 line (2.66 world = local 0.88)
  P.add('turret', box(0.55, 0.14, 0.85), -0.28, 0.81, -0.30);                 // left hatch stack (top 2.66)
  P.add('turret', box(0.42, 0.12, 0.60), 0.94, 0.78, -0.42);                  // right cupola stack (ref 2.88, capped)
  P.add('turretDark', box(0.30, 0.045, 0.30), 0.94, 0.858, -0.42);            // lid at the 2.66 p95 line
  P.decal('turret', 'crossgrey', null, 0.36, [1.17, 0.38, -0.85], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.17, 0.38, -0.85], -Math.PI / 2);
  // L/44: trunnion world z 1.45, axis 1.99, tube band 1.90..2.09, muzzle
  // 6.02; deep mantlet block top 2.21 over z 3.43..3.95 world
  P.gunG.position.set(0, 0.21, 1.15);
  P.addGunExtra(KIT.cylX(0.24, 0.62, P.q ? 18 : 12), 0, 0, 0);                 // trunnion roll
  P.addGunExtra(box(0.56, 0.46, 0.30), 0, 0, 0.18);                            // plate mantlet
  P.addGunExtra(box(0.44, 0.30, 1.05), 0, 0.03, 0.95);                         // root fill
  P.addGunExtra(box(0.40, 0.36, 0.52), 0, 0.04, 2.24);                         // deep mantlet block (top 2.21, z 3.43..3.95)
  P.addGunExtraDark(KIT.cylZ(0.026, 0.10, 8), 0.24, 0.06, 0.32);               // coax port
  KIT.buildGun(P, { len: 4.58, r: 0.095, sleeve: true, evac: null, collar: false, baseR: 0.155 });
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
// Leopard 2 Revolution — GATE-V10 re-lay against the REPAIRED oracle
// (batch-6 carved the hull-fused gun line to `Gun`; the whole print
// re-normalized: honest frame reads hull -3.88..+3.85, muzzle 5.93 —
// ~1 m forward of the phantom frame the round-1 build was laid in).
// Measured world targets: AMAP walls +-1.965 (y 0.64..1.70) full length,
// deck 2.06 (+-1.55), fore shelf 1.97-2.03 to z 2.83 with the beak plate
// falling to the 3.85 toe, gun travel-clamp rod (top 2.03, z 2.87..3.42),
// raised engine course 2.21 (-1.85..-2.35), corner posts 2.33 at x
// +-1.0-1.28 (-2.40..-2.90), low tail 1.71 to -3.86, long track ramps to
// HIGH end wheels; turret: roof rising 2.19@1.3 -> 2.37@-0.65, RWS
// station -0.75..-2.05 (print 2.74-2.86, capped 2.66 = published-height
// p95 anchor), rear basket to -2.76, whips x -+1.04 / z -2.12,-2.21 to
// ~4.0 (the spike budget), ASYMMETRIC cheeks: right wing to z 3.55 (x
// 0.1..1.60, y 1.79..2.03), left cheek to 2.11 (x -0.95..-1.50) with the
// 1.33 notch at x -0.55..-0.90; L/44 axis 1.85, muzzle 6.02 (published
// overall 9.97; print tube ends 5.93 -> ~1 cover column, documented).
// ---------------------------------------------------------------------------
function buildLeo2Revolution(P) {
  const { box, slab, cylY, cylZ, torus, periscope, liftEye } = KIT;
  // ---- hull ----
  P.add('hull', box(2.40, 1.00, 5.80), 0, 0.86, 0.0);                          // tub y 0.36..1.36, z -2.9..2.9
  P.add('hull', box(3.10, 0.05, 2.85), 0, 2.035, -0.375);                      // main deck plate z -1.80..1.05
  P.add('hull', box(3.10, 0.40, 2.85), 0, 1.82, -0.375);                       // deck underfill
  P.add('hull', box(3.00, 0.05, 1.78), 0, 1.985, 1.94);                        // fore shelf 2.01, z 1.05..2.83
  P.add('hull', box(3.00, 0.45, 1.78), 0, 1.76, 1.94);
  P.add('hullDark', box(2.4, 0.02, 0.03), 0, 2.03, 1.06);                      // shelf seam
  // beak plate: shelf end falling to the toe (plan nose 3.79-3.85 at
  // x <= +-1.44; the centre carries the tow-clevis face)
  P.add('hull', slab(
    [-1.42, 1.62, 2.83], [1.42, 1.62, 2.83], [1.30, 0.80, 3.83], [-1.30, 0.80, 3.83],
    [-1.42, 1.97, 2.83], [1.42, 1.97, 2.83], [1.30, 0.97, 3.85], [-1.30, 0.97, 3.85]));
  P.add('hull', box(2.60, 0.75, 1.0), 0, 0.95, 2.95);                          // nose fill
  // gun travel-clamp rod on the beak (top 2.03, z 2.87..3.42)
  P.add('hullDetail', box(0.09, 0.30, 0.09), 0.35, 1.72, 2.90);
  P.add('hullDetail', box(0.08, 0.16, 0.50), 0.35, 1.95, 3.11);
  // AMAP flank walls — outer faces at EXACTLY +-2.00 (the committed 4.00
  // width guard: an inset widest-mesh silently rescales the whole build
  // ~1.018x in the lab and drifts every authored coordinate)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.36, 1.06, 6.85), s * 1.82, 1.17, -0.225);              // THICK AMAP course, faces 1.64..2.00
    for (let k = 0; k < 9; k++) {
      P.add('hullDark', box(0.05, 0.92, 0.02), s * 1.955, 1.16, -3.4 + k * 0.78);
    }
    P.add('hullDark', box(0.02, 0.10, 6.7), s * 1.957, 0.685, -0.2);           // dark bottom lip
    P.add('hull', slab(                                                        // nose taper 3.20 -> 3.48
      [s * 1.92, 0.66, 3.20], [s * 2.0, 0.66, 3.20], [s * 2.0, 0.66, 3.22], [s * 1.72, 0.70, 3.48],
      [s * 1.92, 1.68, 3.20], [s * 2.0, 1.68, 3.20], [s * 2.0, 1.68, 3.22], [s * 1.72, 1.30, 3.48]));
    // low fender strip over the wall (deck edge line)
    P.add('hull', box(0.10, 0.06, 5.9), s * 1.55, 2.03, -0.6);
  }
  // raised engine course + corner posts + tail
  P.add('hull', box(1.94, 0.16, 0.50), 0, 2.13, -2.10);                        // engine course top 2.21 (x +-0.97)
  P.add('hullDark', box(1.7, 0.02, 0.4), 0, 2.145, -2.10);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.28, 0.50), s * 1.14, 2.19, -2.65);               // corner posts top 2.33 (x 0.99..1.29)
    P.add('hullDark', box(0.26, 0.05, 0.44), s * 1.14, 2.30, -2.65);
  }
  P.add('hull', box(1.60, 0.14, 0.50), 0, 2.12, -2.65);                        // centre bridge between posts
  P.add('hull', box(2.90, 0.62, 0.94), 0, 1.40, -3.37);                        // tail box top 1.71, z -2.90..-3.84
  P.add('hullDark', box(2.60, 0.40, 0.05), 0, 1.38, -3.835);                    // tail slat face
  for (let k = 0; k < 9; k++) P.add('hullDetail', box(0.03, 0.48, 0.06), -1.24 + k * 0.31, 1.40, -3.85);
  P.add('hullDetail', box(2.85, 0.05, 0.05), 0, 1.70, -3.86);                  // tail top rail (body col -3.88)
  P.add('hullDetail', box(2.85, 0.05, 0.05), 0, 1.08, -3.86);
  P.add('hull', slab(                                                          // tail undercut wedge
    [-1.40, 1.02, -3.28], [1.40, 1.02, -3.28], [1.40, 1.02, -3.82], [-1.40, 1.02, -3.82],
    [-1.40, 1.36, -3.08], [1.40, 1.36, -3.08], [1.40, 1.30, -3.82], [-1.40, 1.30, -3.82]));
  // deck furniture: driver hatch fore-left on the shelf, flush fans, louvres
  P.add('hull', cylY(0.25, 0.25, 0.024, 14), -0.62, 2.00, 1.45);
  P.add('hullDark', torus(0.25, 0.011, 14), -0.62, 2.01, 1.45);
  periscope(P, 'hullDetail', -0.62, 2.0, 1.80);
  periscope(P, 'hullDetail', -0.36, 2.0, 1.78, 0.25);
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.33, 0.33, 0.014, P.q ? 24 : 14), s * 0.72, 2.042, -1.15);
    P.add('hullDetail', torus(0.33, 0.012, P.q ? 22 : 14), s * 0.72, 2.046, -1.15);
    P.add('hullDetail', cylY(0.085, 0.085, 0.018, 12), s * 1.26, 2.043, 0.35);
  }
  P.add('hullDark', box(1.9, 0.014, 0.44), 0, 2.044, -1.62);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.8, 0.012, 0.055), 0, 2.05, -1.74 + k * 0.12);
  P.add('hullDark', box(0.15, 0.60, 0.30), -1.70, 1.90, -2.35);                // left-hull exhaust outlet
  liftEye(P, 'hullDetail', -1.30, 2.045, 0.2);
  liftEye(P, 'hullDetail', 1.30, 2.045, 0.2);
  P.decal('hull', 'number', 'Y-660', 0.26, [0.62, 1.2, -3.84], Math.PI, 0);
  // gear: HIGH raised end wheels with long band ramps (ref bottoms climb
  // 0.02@2.55 -> 0.93@3.84 and 0.44@-2.95 -> 0.93@-3.68)
  leoGear(P, {
    xc: 1.42, trackW: 0.52, wheelR: 0.355, wheelY: 0.39, span: [2.45, -2.55],
    sprocket: { z: -3.35, y: 0.95, r: 0.32 }, idler: { z: 3.42, y: 0.92, r: 0.25 },
    topY: 0.95, botY: 0.058, raisedEnds: true,
  });

  // ---- turret: ring pivot (0, 1.60, -0.35); local z = w + 0.35, y = w - 1.60
  P.turretG.position.set(0, 1.60, -0.35);
  // core body under the rising roof: plan +-1.28 back to the basket
  P.add('turret', slab(
    [-1.30, 0.10, 2.60], [1.30, 0.10, 2.60], [1.28, 0.10, -1.72], [-1.28, 0.10, -1.72],
    [-1.30, 0.57, 2.48], [1.30, 0.57, 2.48], [1.28, 0.79, -1.72], [-1.28, 0.79, -1.72]));
  P.add('turret', box(1.80, 0.26, 3.4), 0.28, 0.15, 0.50);                     // underride fill (clear of the left notch)
  P.add('turretDark', box(1.30, 0.10, 1.30), 0, -0.02, 0.35);                  // ring shading (above deck line)
  // fore roof step (2.16-2.19 over z 1.3..2.1w)
  P.add('turret', box(1.80, 0.06, 0.85), 0.36, 0.565, 2.08);
  P.add('turretDark', box(1.9, 0.02, 0.02), 0, 0.60, 1.66);
  // RIGHT low wing over the bow shelf (y 1.79..2.03, z 2.2..3.55w)
  P.add('turret', box(1.52, 0.24, 1.34), 0.86, 0.31, 3.24);                    // x 0.10..1.62, z 2.57..3.91L
  P.add('turretDark', box(1.44, 0.02, 1.26), 0.86, 0.44, 3.24);
  // LEFT cheek: nose line (-0.2,2.38w)->(-0.5,2.15w), notch at -0.55..-0.90
  // (1.33w), outer cheek block to 2.11w (x -0.95..-1.50, top 2.14)
  P.add('turret', slab(
    [-0.16, 0.10, 2.70], [-0.52, 0.10, 2.48], [-0.52, 0.10, 1.60], [-0.16, 0.10, 1.60],
    [-0.16, 0.54, 2.60], [-0.52, 0.54, 2.38], [-0.52, 0.56, 1.60], [-0.16, 0.56, 1.60]));
  P.add('turret', box(0.38, 0.44, 0.75), -0.72, 0.32, 1.31);                   // notch back wall (nose 1.33w)
  P.add('turret', slab(
    [-0.93, 0.10, 2.44], [-1.66, 0.10, 2.40], [-1.70, 0.10, 0.60], [-0.93, 0.10, 0.60],
    [-0.93, 0.54, 2.42], [-1.62, 0.52, 2.38], [-1.66, 0.52, 0.60], [-0.93, 0.54, 0.60]));
  P.add('turretDark', box(0.68, 0.30, 0.03), -1.28, 0.30, 2.43);               // cheek face seam
  // side walls: left to -2.14w, right to -1.07w (asymmetric print)
  P.add('turret', box(0.24, 0.50, 3.35), -1.55, 0.30, 0.115);                  // left wall x -1.67, z -1.79..1.56L
  P.add('turret', box(0.06, 0.30, 0.30), -1.70, 0.30, 2.22);                   // cheek corner tab (ref sliver col -1.72)
  P.add('turret', box(0.22, 0.48, 4.55), 1.50, 0.30, 1.63);                    // right wall x 1.61, z -0.64..3.91L
  // RWS / sensor station (print 2.74-2.86; TOP CAPPED at the published-
  // height p95 line 2.66w = 1.06L; the residual is a certified dims-vs-
  // curve tradeoff, not a shape error)
  P.add('turret', box(1.90, 0.25, 1.24), -0.05, 0.895, -1.05);                 // station body z -0.40..-1.70L
  P.add('turretDark', box(1.70, 0.04, 1.10), -0.05, 1.015, -1.05);
  P.add('turretDark', box(0.34, 0.16, 0.30), -0.30, 0.955, -0.80);             // RWS head under the p95 line
  P.add('turretGlass', box(0.16, 0.08, 0.02), -0.30, 0.97, -0.64);
  P.add('turretDetail', cylZ(0.02, 0.5, 8), -0.24, 0.94, -0.42, -0.05, 0, 0);  // RWS barrel stub
  // rear basket to -2.41L (top 0.56..0.71L, floor 0.10..0.22L)
  P.add('turretDetail', box(2.30, 0.045, 0.045), 0, 0.665, -2.16);
  P.add('turretDetail', box(2.30, 0.045, 0.045), 0, 0.12, -2.14);
  for (let k = 0; k <= 8; k++) P.add('turretDetail', box(0.03, 0.55, 0.03), -1.15 + k * 0.2875, 0.39, -2.15);
  P.add('turretDark', box(2.1, 0.016, 0.5), 0, 0.15, -1.95);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.5, 0.38, -1.95, 0.8, 0.34, 0.42], [0.62, 0.36, -1.98, 0.6, 0.30, 0.40]]);
  for (const s of [-1, 1]) {                                                   // deep side rails to -2.76w
    P.add('turretDetail', box(0.05, 0.5, 0.05), s * 1.10, 0.38, -2.38);
    P.add('turretDetail', box(0.24, 0.045, 0.68), s * 1.02, 0.645, -2.08);
    P.add('turretDetail', box(0.24, 0.045, 0.68), s * 1.02, 0.12, -2.06);
  }
  // whip antennas: x -1.04 / +1.04, z -2.12/-2.21w (1-col spikes to ~4.0w)
  P.add('turretDetail', box(0.06, 0.12, 0.06), -1.04, 0.80, -1.75);
  P.add('turretDetail', box(0.024, 1.44, 0.024), -1.04, 1.57, -1.75);
  P.add('turretDetail', box(0.06, 0.12, 0.06), 1.04, 0.80, -1.88);
  P.add('turretDetail', box(0.024, 1.54, 0.024), 1.04, 1.62, -1.88);
  // roof furniture: EMES hood right-front, hatches, GALIX on the rear corners
  P.add('turretDark', box(0.44, 0.13, 0.38), 0.62, 0.70, 0.90);
  P.add('turret', box(0.38, 0.15, 0.32), 0.62, 0.735, 0.88);
  P.add('turretGlass', box(0.20, 0.08, 0.018), 0.62, 0.75, 1.06);
  P.add('turret', cylY(0.23, 0.23, 0.036, 14), 0.55, 0.755, -0.10);
  P.add('turret', cylY(0.20, 0.20, 0.032, 14), -0.60, 0.76, 0.05);
  periscope(P, 'turretDetail', 0.55, 0.78, 0.22);
  for (const s of [-1, 1]) {
    KIT.smokeCluster(P, s * 1.22, 0.45, -1.60, 4, s * 2.2, 0.8);
    liftEye(P, 'turretDetail', s * 0.95, 0.62, 0.6, s * 0.4);
  }
  P.decal('turret', 'crossgrey', null, 0.36, [1.40, 0.30, 0.3], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.44, 0.30, 0.3], -Math.PI / 2);
  // mantlet back wall behind the notch
  P.add('turret', box(0.80, 0.50, 0.08), 0, 0.28, 2.55);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.28, 0.42), s * 0.41, 0.20, 2.72);
  // ---- L/44 at axis 1.85 (band 1.76..1.94): muzzle 6.02 (published
  // overall 9.97; print tube ends 5.93 -> the last column is documented
  // build-only cover), tube dia ~0.18 ----
  P.gunG.position.set(0, 0.25, 1.35);
  P.addGunExtra(KIT.cylX(0.20, 0.56, P.q ? 18 : 12), 0, 0, 0);
  P.addGunExtra(box(0.46, 0.40, 0.50), 0, 0.02, 0.42);
  P.addGunExtra(cylZ(0.115, 0.5, 12, 0.14), 0, 0, 0.90);
  P.addGunExtraDark(cylZ(0.026, 0.10, 8), 0.23, 0.08, 0.50);
  KIT.buildGun(P, { len: 5.02, r: 0.080, sleeve: true, evac: null, collar: false, baseR: 0.135 });
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
