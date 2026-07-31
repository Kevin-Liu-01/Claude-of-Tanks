// US Pershing/Patton family — FROM-SCRATCH rebuild against the measured
// profile curves in docs/references/profiles/<id>.json (mask-trace-1024 of the
// repaired reference GLBs; world meters, +z forward, y from ground) plus the
// gate-v6 TRUE-AXIS re-measurement of 2026-07-31 (the old side/front cameras
// carried display tilts that inflated tops ~3-9 cm — every constant below is
// from the un-tilted extraction).
//
// Method: the hull is LOFTED STATION SLABS following the measured deck/belly
// polylines; the turret is lofted from the whole−hull side band + measured
// plan half-widths; fittings exist only where the reference board shows them.
//
// Gate-v6 measured landmarks (true cameras):
//   m26  toe (+2.60,1.08) knee (+1.78,1.545) deck 1.53-1.56 tail (-3.40,1.28)
//        dome front -0.10 (top 1.77) -> crest 2.31 @ -1.9, plan max hw 1.22 @
//        -1.6, bustle chin 1.17 @ -2.4, basket floor 0.38 over -0.9..-2.1,
//        M2 band 2.66-2.75 (mast -2.66, tip -1.28), gun axis 1.60 dia 0.23,
//        brake body 0.35 x 0.52.
//   m45  toe (+3.10,1.03) knee (+2.55,1.50) deck 1.53 (rises 1.58 by -1.0);
//        full-width hull ENDS -2.50, narrow tail block to -3.22; dome crest
//        ~2.31 @ -0.9..-1.6, plan max 1.226 @ -1.2, M2 cluster front-left
//        (x -0.32) band 2.58-2.68 barrel to +0.38; howitzer axis 1.56 muzzle
//        +1.44 (no overhang: overall = hull span 6.40).
//   m46  toe (+2.62,1.14) knee (+2.24,1.62) deck 1.664 mufflers 1.73 rear
//        deck 1.726-1.784 tail (-3.42,1.54); crest 2.31 @ -1.45, plan max
//        1.208 @ -1.4, bustle chin 1.19 @ -2.4..-2.6, basket 0.41 over
//        -0.75..-2.25; gun axis 1.618, sleeve band dia 0.33 from +2.2.
//   m47  toe (+2.82,1.19) knee (+2.40,1.54) deck 1.666/1.726 mufflers 1.73;
//        needle nose +0.42 rising to the 2.50 plateau over -0.45..-1.9 (M2
//        corridor above it reads 2.87-2.94), plan max 1.146 @ -1.0, LONG
//        bustle top 2.17->2.13 floor 1.505 to -3.42 w0 0.94 w1 0.69; M36
//        evac 2.35..3.05 + wide flat deflector (side 0.24 / plan 0.68).
//   m60  fender deck 1.75-1.79 with a raised centre engine crown to 1.897;
//        glacis knee (+1.70,1.75) toe (+3.47,1.31); main hull plan 3.51 wide
//        with fender flares to 3.63 only over z -0.45..+1.49; track ramps
//        from the last road wheel to HIGH ends (idler +3.04, sprocket -2.96,
//        y 0.85); casting: plan needle (0.29@+2.62 -> 1.415@+0.5) with the
//        steep forehead (saddle 2.57 @ +1.7, shelf 2.91 @ +1.0..+1.5, crest
//        3.09 @ -0.2, right-hand roof falling to ~2.75), flat 2.66 bustle to
//        -2.02 with the underside rising 1.74 -> 2.10; M19 cupola (-0.58,
//        +0.20) top 3.30 (published 3.27 height governs — the oracle's own
//        cupola reads 3.21); searchlight 0.57 wide, z 2.05..2.88, top 2.77.
//
// PUBLISHED-LENGTH GUNS (gate v5+ hull-anchored registration): m26 overall
// 8.65 m, m46 8.48 m, m47 8.51 m, m45 6.40 m (bow-flush stub). The four
// reference barrels are modelled short (see the packets) — the coverage cost
// lands ONLY in wholeCurves/turretCurves and is certified per packet.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Piecewise deck lookup (z descending front->rear).
// ---------------------------------------------------------------------------
const deckLine = (deck) => (z) => {
  if (z >= deck[0][0]) return deck[0][1];
  for (let i = 0; i < deck.length - 1; i++) {
    const [z0, y0] = deck[i], [z1, y1] = deck[i + 1];
    if (z <= z0 && z >= z1) return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
  }
  return deck[deck.length - 1][1];
};

// ---------------------------------------------------------------------------
// Lofted body: consecutive station slabs in three vertical bands so a cast
// silhouette follows the measured top/bottom curves with rounded-reading
// shoulders. sections: [{z, hw, top, bot}] front -> rear, world coords,
// emitted into `bucket` at a local frame offset by (oy, oz). opts.crownX
// shifts the roof band centreline sideways (fraction of hw) for castings
// whose roof ridge is offset (M60: ridge left of centre).
// ---------------------------------------------------------------------------
function loftBody(P, bucket, sections, opts = {}) {
  const { slab } = KIT;
  const wallT = opts.wall ?? 0.55;     // top of the vertical cheek band
  const midT = opts.mid ?? 0.84;      // top of the shoulder band
  const midW = opts.midW ?? 0.94;     // shoulder half-width fraction
  const crownW = opts.crownW ?? 0.44;  // roof half-width fraction
  const crownX = opts.crownX ?? 0;     // roof band centre offset fraction
  const oy = opts.oy ?? 0, oz = opts.oz ?? 0;
  const L = (s, f) => s.bot + (s.top - s.bot) * f;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    const az = a.z - oz, bz = b.z - oz;
    const quad = (xA0, xA1, yA, xB0, xB1, yB, x2A0, x2A1, y2A, x2B0, x2B1, y2B) => P.add(bucket, slab(
      [xA0, yA - oy, az], [xA1, yA - oy, az], [xB1, yB - oy, bz], [xB0, yB - oy, bz],
      [x2A0, y2A - oy, az], [x2A1, y2A - oy, az], [x2B1, y2B - oy, bz], [x2B0, y2B - oy, bz]));
    // wall band (vertical cheeks)
    quad(-a.hw, a.hw, a.bot, -b.hw, b.hw, b.bot, -a.hw, a.hw, L(a, wallT), -b.hw, b.hw, L(b, wallT));
    // shoulder band
    quad(-a.hw, a.hw, L(a, wallT), -b.hw, b.hw, L(b, wallT),
      -midW * a.hw, midW * a.hw, L(a, midT), -midW * b.hw, midW * b.hw, L(b, midT));
    // crown band (roof, optionally ridge-offset)
    quad(-midW * a.hw, midW * a.hw, L(a, midT), -midW * b.hw, midW * b.hw, L(b, midT),
      (crownX - crownW) * a.hw, (crownX + crownW) * a.hw, a.top,
      (crownX - crownW) * b.hw, (crownX + crownW) * b.hw, b.top);
  }
}

// ---------------------------------------------------------------------------
// Hull from the measured curves. All coordinates are world meters.
// H: { W, trackW, trackInset?, sponsonY, bellyY?, noseW,
//      deck: [[z,y]...] toe -> tail (base plates, fittings excluded),
//      toeBot, bellyFrontZ, bellyRearZ, tailBotY, fenderY?,
//      narrowTail?: { hw, z0, z1, top1, botY },   // m45 centre tail block
//      duckbills?: { z },                          // m26/m46/m47 centre prong
//      mufflers?: { z0, z1, top },
//      flapF/flapR: [z, y0, y1],                   // fender-tip mud flaps
//      gear: { wheelR, wheelY?, span:[zF,zR], idler, sprocket, tension?,
//              rollerN, rollerY } }
// ---------------------------------------------------------------------------
function curveHull(P, H) {
  const { box, slab, cylX, cylZ, torus, buildRunningGear } = KIT;
  const hw = H.W / 2 - 0.008;          // fender edge (widest point)
  const bhw = H.bandHW ?? hw;           // full-width armour band half width
  const xc = H.W / 2 - H.trackW / 2 - (H.trackInset || 0);
  const iw = (H.W - 2 * H.trackW - 0.14) / 2;      // inner (between-track) half width
  const spons = H.sponsonY;
  const belly = H.bellyY ?? 0.44;
  const deck = H.deck;
  const deckAt = deckLine(deck);
  const [toeZ, toeY] = deck[0];
  const [kneeZ, kneeY] = deck[1];
  const tail = deck[deck.length - 1];

  // full-width band: sponson floor -> deck polyline (knee back to the tail,
  // or to the tail-taper start when the plan shows rounded rear corners)
  const bandEnd = H.tailTaper ? H.tailTaper.z0 : -Infinity;
  for (let i = 1; i < deck.length - 1; i++) {
    let [z0, y0] = deck[i];
    let [z1, y1] = deck[i + 1];
    if (z0 <= bandEnd) continue;
    if (z1 < bandEnd) { y1 = y0 + (y1 - y0) * ((bandEnd - z0) / (z1 - z0)); z1 = bandEnd; }
    if (Math.abs(y1 - y0) < 0.004) y1 = y0 + 0.006;
    P.add('hull', slab(
      [-bhw, spons - 0.03, z0], [bhw, spons - 0.03, z0], [bhw, spons - 0.03, z1], [-bhw, spons - 0.03, z1],
      [-bhw, y0, z0], [bhw, y0, z0], [bhw, y1, z1], [-bhw, y1, z1]));
  }
  // thin fender plates carry the true width (the reference decks step DOWN to
  // a narrow fender lip at the extreme edge — a full-width deck slab painted
  // +0.2 m tops into the front-view edge columns under gate v6)
  if (H.fenderY) {
    const [fy, fz0, fz1] = H.fenderY;
    P.add('hull', box(hw - bhw + 0.01, 0.035, fz0 - fz1), (bhw + hw) / 2, fy, (fz0 + fz1) / 2);
    P.add('hull', box(hw - bhw + 0.01, 0.035, fz0 - fz1), -(bhw + hw) / 2, fy, (fz0 + fz1) / 2);
  }
  // upper glacis: full width tapering to the beak edge (knife-edge bow)
  const nw = H.noseW ?? bhw * 0.95;
  const toeBot = H.toeBot ?? toeY - 0.09;
  P.add('hull', slab(
    [-nw, toeBot, toeZ], [nw, toeBot, toeZ], [bhw, spons - 0.03, kneeZ], [-bhw, spons - 0.03, kneeZ],
    [-nw, toeY, toeZ], [nw, toeY, toeZ], [bhw, kneeY, kneeZ], [-bhw, kneeY, kneeZ]));
  // lower glacis wedge + rounded cast transmission nose (between the tracks)
  P.add('hull', slab(
    [-iw, belly, H.bellyFrontZ], [iw, belly, H.bellyFrontZ], [iw * 0.98, toeBot, toeZ - 0.02], [-iw * 0.98, toeBot, toeZ - 0.02],
    [-iw, spons + 0.05, H.bellyFrontZ], [iw, spons + 0.05, H.bellyFrontZ], [iw * 0.98, toeY - 0.02, toeZ - 0.02], [-iw * 0.98, toeY - 0.02, toeZ - 0.02]));
  P.add('hull', cylX(0.21, iw * 2, P.q ? 20 : 12), 0, toeBot - 0.01, toeZ - 0.30);
  // lower hull box
  P.add('hull', box(iw * 2, spons - belly + 0.04, H.bellyFrontZ - H.bellyRearZ),
    0, (spons + belly) / 2, (H.bellyFrontZ + H.bellyRearZ) / 2);

  if (H.narrowTail) {
    // m45: the full-width hull ends early; a narrow centre tail block carries
    // the rear plate/exhaust mass the reference shows from -2.5 rearward.
    const T = H.narrowTail;
    P.add('hull', slab(
      [-T.hw, T.botY, T.z0], [T.hw, T.botY, T.z0], [T.hw * 0.96, T.botY + 0.04, T.z1], [-T.hw * 0.96, T.botY + 0.04, T.z1],
      [-T.hw, deckAt(T.z0), T.z0], [T.hw, deckAt(T.z0), T.z0], [T.hw * 0.96, T.top1, T.z1], [-T.hw * 0.96, T.top1, T.z1]));
  } else {
    // rear undercut wedge from the belly up to the tail lip (narrowed at the
    // tail when the reference plan shows rounded rear corners)
    const tb = H.tailBotY ?? 1.0;
    const twx = H.tailTaper ? Math.max(H.tailTaper.hw1, iw * 0.55) : iw * 0.92;
    P.add('hull', slab(
      [-iw, belly + 0.3, H.bellyRearZ], [iw, belly + 0.3, H.bellyRearZ], [twx, tb, tail[0] + 0.02], [-twx, tb, tail[0] + 0.02],
      [-iw, spons + 0.04, H.bellyRearZ], [iw, spons + 0.04, H.bellyRearZ], [twx, tail[1] - 0.02, tail[0] + 0.02], [-twx, tail[1] - 0.02, tail[0] + 0.02]));
  }
  if (H.tailTaper) {
    // rounded rear corners: the full-width band above stops at tailTaper.z0
    // (deck slabs must end there); this trapezoid carries the deck to the
    // tail tip at hw1 following the deck polyline.
    const T = H.tailTaper;
    P.add('hull', slab(
      [-bhw, spons - 0.03, T.z0], [bhw, spons - 0.03, T.z0], [T.hw1, tail[1] - 0.10, tail[0]], [-T.hw1, tail[1] - 0.10, tail[0]],
      [-bhw, deckAt(T.z0), T.z0], [bhw, deckAt(T.z0), T.z0], [T.hw1, tail[1], tail[0]], [-T.hw1, tail[1], tail[0]]));
  }
  if (H.duckbills) {
    // twin exhaust deflector humps on the centre rear (the plan prong).
    for (const side of [-1, 1]) {
      P.add('hull', slab(
        [side * 0.14, deckAt(H.duckbills.z) - 0.30, H.duckbills.z], [side * 0.52, deckAt(H.duckbills.z) - 0.30, H.duckbills.z],
        [side * 0.46, deckAt(H.duckbills.z) - 0.26, H.duckbills.z - 0.24], [side * 0.16, deckAt(H.duckbills.z) - 0.26, H.duckbills.z - 0.24],
        [side * 0.14, deckAt(H.duckbills.z) - 0.06, H.duckbills.z], [side * 0.52, deckAt(H.duckbills.z) - 0.06, H.duckbills.z],
        [side * 0.46, deckAt(H.duckbills.z) - 0.16, H.duckbills.z - 0.24], [side * 0.16, deckAt(H.duckbills.z) - 0.16, H.duckbills.z - 0.24]));
    }
    P.add('hullDark', box(1.00, 0.14, 0.03), 0, deckAt(H.duckbills.z) - 0.24, H.duckbills.z + 0.01);
  }
  if (H.tongues) {
    for (const [tx, tw, tz1] of H.tongues) {
      P.add('hull', box(tw, 0.045, Math.abs(tail[0] - tz1) + 0.05),
        tx, deckAt(tail[0]) - 0.01, (tail[0] + tz1) / 2);
    }
  }

  // fender mufflers (M46/M47): proud cylinders, end caps, elbows, tailpipes
  if (H.mufflers) {
    const { z0, z1, top } = H.mufflers;
    const mr = 0.14, my = top - mr, mx = bhw - 0.24;
    for (const side of [-1, 1]) {
      P.add('hull', cylZ(mr, z0 - z1 - 0.26, P.q ? 18 : 10), side * mx, my, (z0 + z1) / 2, 0.012, 0, 0);
      P.add('hull', cylZ(mr * 0.8, 0.06, 12), side * mx, my, z0 - 0.08);
      P.add('hull', cylZ(mr * 0.8, 0.06, 12), side * mx, my, z1 + 0.14);
      P.add('hullDark', cylZ(0.06, 0.28, 8), side * (mx - 0.05), my - 0.08, z0 - 0.02, 0.85, 0, 0);
      P.add('hullDark', cylZ(0.052, 0.38, 8), side * mx, my - 0.07, z1 + 0.02, 0.35, 0, 0);
      for (const dz of [0.32, -0.52]) {
        P.add('hullDark', cylZ(mr * 1.04, 0.032, 12), side * mx, my, (z0 + z1) / 2 + dz);
        P.add('hullDetail', box(0.05, my - spons + 0.02, 0.07), side * mx, (my + spons) / 2, (z0 + z1) / 2 + dz);
      }
    }
  }

  // running gear (Patton pattern: dished wheels, torsion arms, rear sprocket)
  const G = H.gear;
  const wheelZs = evenStations(6, G.span[0] - G.span[1], (G.span[0] + G.span[1]) / 2);
  const rollers = evenStations(G.rollerN, (G.span[0] - G.span[1]) * 0.8, (G.span[0] + G.span[1]) / 2)
    .map((z) => ({ z, y: G.rollerY, r: 0.095 }));
  if (G.tension) {
    // track tension idler: a real wheel pair LOW between the last road wheel
    // and the sprocket.
    if (G.tension.support) rollers.push(G.tension);
    for (const side of [-1, 1]) {
      P.add('hullDetail', cylX(G.tension.r, 0.17, 12), side * xc, G.tension.y, G.tension.z);
      P.add('hullDark', cylX(G.tension.r * 0.5, 0.19, 8), side * xc, G.tension.y, G.tension.z);
    }
  }
  const wheelW = Math.min(0.24, H.trackW * 0.4);
  const wy = G.wheelY ?? G.wheelR + 0.03;
  buildRunningGear(P, {
    style: 'dished', wheelR: G.wheelR, wheelW, wheelY: wy, xc, wheelZs,
    sprocket: G.sprocket, idler: G.idler, rollers, trackW: H.trackW,
    topY: G.rollerY + 0.04, paintedEnds: true, coveredTop: false, arms: true,
  });
  // readable hub ring + bolts on every outer wheel face
  for (const z of wheelZs) {
    for (const side of [-1, 1]) {
      const fx = side * (xc + wheelW / 2 + 0.012);
      P.add('hullDark', torus(G.wheelR * 0.3, 0.015, 16), fx, wy, z, 0, 0, Math.PI / 2);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.26;
        P.add('hullDark', cylX(0.026, 0.05, 6), fx, wy + Math.sin(a) * G.wheelR * 0.52, z + Math.cos(a) * G.wheelR * 0.52);
      }
    }
  }
  // roller brackets + mud flaps at the fender tips (measured hang bands)
  for (const rl of rollers) for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.05, Math.max(0.05, spons - rl.y - 0.02), 0.13), side * xc, (spons + rl.y) / 2, rl.z);
  }
  for (const [fz, fy0, fy1] of [H.flapF, H.flapR].filter(Boolean)) {
    for (const side of [-1, 1]) {
      P.add('hullRubber', box(H.trackW * 0.92, fy1 - fy0, 0.03), side * xc, (fy0 + fy1) / 2, fz);
      // hanger strap: articulation floater guard (the flap must stay one
      // island with the hull in every pose)
      P.add('hullDetail', box(0.035, Math.max(0.08, spons - fy1 + 0.06), 0.035), side * xc, (spons + fy1) / 2 - 0.01, fz);
    }
  }
  return { hw, bhw, xc, iw, spons, deckAt, toeZ, tailZ: tail[0], kneeZ, kneeY };
}

// ---------------------------------------------------------------------------
// Shared US hull furniture; only fittings the reference boards show.
// F: { hatchX?, hatchZ, bowMG?, lights:{x,y,z,rx}, siren?,
//      shackleZ, shackleY, grille:{z0,z1,y,rx?,x?,w?}, caps?, rearGrilleY? }
// ---------------------------------------------------------------------------
function usKit(P, hull, F) {
  const { box, cylY, cylZ, sph, torus, headlight, liftEye } = KIT;
  const { bhw, deckAt, tailZ } = hull;
  // driver (+ assistant) hatch discs — FLUSH (v6: the reference decks read
  // within ~0.03 m of the plate; the old proud hoods+periscopes cost the
  // whole mid-deck band)
  const hx = F.hatchX ?? 0.55;
  for (const side of F.singleHatch ? [0] : [-1, 1]) {
    const x = side * hx || F.hatchX0 || 0;
    P.add('hull', cylY(0.20, 0.21, 0.024, P.q ? 18 : 10), x, deckAt(F.hatchZ) + 0.012, F.hatchZ);
    P.add('hullDark', box(0.28, 0.008, 0.04), x, deckAt(F.hatchZ) + 0.028, F.hatchZ);
  }
  // bow .30cal ball mount
  if (F.bowMG) {
    P.add('hull', sph(0.12, P.q ? 16 : 10), F.bowMG[0], F.bowMG[1], F.bowMG[2]);
    P.add('hullDark', cylZ(0.024, 0.26, 8), F.bowMG[0], F.bowMG[1] + 0.03, F.bowMG[2] + 0.13, F.bowMG[3], 0, 0);
  }
  // headlight pods on the glacis
  for (const side of [-1, 1]) {
    headlight(P, side * F.lights.x, F.lights.y, F.lights.z, F.lights.rx, 0.05);
  }
  if (F.siren) P.add('hullDetail', cylY(0.05, 0.06, 0.07, 10), F.siren[0], F.siren[1], F.siren[2]);
  // tow shackles at the bow, flush lift eyes at the stern (suppressible: the
  // M60 reference deck reads 1.83-1.84 there — proud eyes cost side columns)
  for (const side of [-1, 1]) {
    P.add('hullDetail', torus(0.06, 0.015, 10), side * 0.58, F.shackleY, F.shackleZ, Math.PI / 2, 0, 0);
    if (!F.noRearEyes) liftEye(P, 'hullDetail', side * 0.62, deckAt(tailZ + 0.25) - 0.02, tailZ + 0.15);
  }
  // engine deck: framed louvred grille bays (kept within +0.03 of the plate)
  const gr = F.grille;
  const gm = (gr.z0 + gr.z1) / 2, gd = gr.z0 - gr.z1;
  const gx0 = gr.x ?? 0.55, gw = gr.w ?? 0.92;
  const gy = (z, lift) => gr.y + lift + (gr.rx ? (z - gm) * gr.rx : 0);
  for (const side of [-1, 1]) {
    const gx = side * gx0;
    P.add('hullDark', box(gw, 0.012, gd), gx, gy(gm, 0.006), gm, gr.rx || 0, 0, 0);
    for (const dx of [-gw / 2 - 0.02, gw / 2 + 0.02]) {
      P.add('hull', box(0.07, 0.024, gd + 0.05), gx + dx, gy(gm, 0.012), gm, gr.rx || 0, 0, 0);
    }
    for (let i = 0; i < 7; i++) {
      const z = gr.z0 - (i + 0.5) * (gd / 7);
      P.add('hullDetail', box(gw - 0.06, 0.016, (gd / 7) * 0.6), gx, gy(z, 0.02), z, gr.rx || 0, 0, 0);
    }
  }
  P.add('hull', box(0.12, 0.026, gd + 0.05), 0, gy(gm, 0.013), gm, gr.rx || 0, 0, 0);
  for (const z of [gr.z0 + 0.02, gr.z1 - 0.02]) {
    P.add('hull', box(gx0 * 2 + gw + 0.1, 0.026, 0.07), 0, gy(z, 0.012), z, gr.rx || 0, 0, 0);
  }
  if (F.caps) for (const side of [-1, 1]) {
    P.add('hullDetail', cylY(0.07, 0.07, 0.028, 10), side * F.caps[0], deckAt(F.caps[1]) + 0.016, F.caps[1]);
  }
  // rear plate: dark exhaust grille (kept on the rear face — never past the
  // tail tip when the hull plan tapers)
  P.add('hullDark', box(F.rearGrilleW ?? 1.24, 0.22, 0.03), 0, (F.rearGrilleY ?? deckAt(tailZ) - 0.32), F.rearGrilleZ ?? (tailZ - 0.02));
}

// ---------------------------------------------------------------------------
// Browning M2 station: solid pintle mast, cradle, receiver, forward barrel,
// ammo can. World coords via the caller's yl/zl converters.
// M: { x, z, baseY, topY, tipZ, rl?, cans?, w? }
// w scales the receiver/cradle plan width (dims-driven tall masts on m46/m47
// keep the elevated block 1-2 gate columns wide in the front view).
// ---------------------------------------------------------------------------
function m2Station(P, M, yl, zl) {
  const { box, cylY, cylZ, ammoCan } = KIT;
  const axis = M.topY - 0.10;
  const rl = M.rl ?? 0.56;
  const w = M.w ?? 1;
  P.add('turretDark', cylY(0.04, 0.055, axis - 0.12 - M.baseY, 10), M.x, yl((M.baseY + axis - 0.12) / 2), zl(M.z));
  P.add('turretDark', box(0.08 * w, 0.14, 0.09), M.x, yl(axis - 0.09), zl(M.z));
  // cradle + receiver + top cover (the reference station is a solid block)
  P.add('turretDark', box(0.18 * w, 0.17, rl), M.x, yl(axis), zl(M.z + rl / 2 - 0.14), 0.025, 0, 0);
  P.add('turretDark', box(0.11 * w, 0.05, rl * 0.45), M.x, yl(axis + 0.105), zl(M.z + 0.10));
  P.add('turretDark', box(0.15 * w, 0.05, 0.07), M.x, yl(axis), zl(M.z - 0.16)); // spade grips
  // barrel: perforated jacket then tube, forward to tipZ
  const jl = 0.30;
  const j0 = M.z + rl - 0.10;
  P.add('turretDark', cylZ(0.055, jl, 8), M.x, yl(axis + 0.02), zl(j0 + jl / 2), 0.03, 0, 0);
  const bl = M.tipZ - (j0 + jl);
  if (bl > 0.05) P.add('turretDark', cylZ(0.038, bl, 8), M.x, yl(axis + 0.02), zl(j0 + jl + bl / 2), 0.02, 0, 0);
  for (const dx of M.cans ?? [0.22]) {
    ammoCan(P, 'turretDark', M.x + dx, yl(M.canY ?? (axis - 0.07)), zl(M.z + 0.04));
  }
}

// Bustle stowage rack. The v6 plan traces show the reference racks are
// DEEP at the side rails but SHALLOW at the centre (the load stops ~0.25 m
// short of the rail tips): centre floor/loads end at zC, side rails run to
// z1. R: { z0, z1, zC?, halfW, floorY, railY, loadTop? }
function bustleRack(P, R, yl, zl, rng) {
  const { box, tarpRoll, ammoCan } = KIT;
  const zC = R.zC ?? (R.z1 + 0.24);
  const dC = R.z0 - zC, d = R.z0 - R.z1;
  for (const fx of [-0.8, 0, 0.8]) {
    P.add('turretDetail', box(0.05, 0.026, dC), fx * R.halfW, yl(R.floorY), zl((R.z0 + zC) / 2));
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.03, 0.03, d), side * R.halfW, yl(R.railY), zl((R.z0 + R.z1) / 2));
    P.add('turretDetail', box(0.028, R.railY - R.floorY + 0.05, 0.028), side * R.halfW, yl((R.railY + R.floorY) / 2), zl(R.z0 - 0.03));
    // rear posts are SHORT drops (the reference rack floor lifts toward the
    // tail — a full-depth rear post painted the tail band too deep)
    P.add('turretDetail', box(0.028, 0.16, 0.028), side * R.halfW, yl(R.railY - 0.07), zl(R.z1 + 0.03));
  }
  P.add('turretDetail', box(R.halfW * 2, 0.03, 0.03), 0, yl(R.railY), zl(zC));
  const loadY = R.loadTop != null ? R.loadTop : R.floorY + 0.19;
  tarpRoll(P, 'turretDark', -R.halfW * 0.3, yl(loadY - 0.09), zl(R.z0 - dC * 0.3), R.halfW * 0.95, 0.09, true, P.q ? 12 : 8);
  ammoCan(P, 'turretDark', R.halfW * 0.45, yl(R.floorY + 0.11), zl(R.z0 - dC * 0.35), 0.3);
  P.add('turretDark', box(0.40, loadY - R.floorY - 0.02, dC * 0.5), -R.halfW * 0.25, yl((loadY + R.floorY) / 2), zl(R.z0 - dC * 0.35), 0, rng() * 0.25, 0);
}

// Tall AA-pedestal mount (real T26/T42 fitting the recovered oracles model
// short/low): a slim pole + cradle block whose TOP carries the published
// "height over MG". Kept narrow (<= 0.16 m across, ~0.48 m along) so the
// mast owns the dims p95 roof read while its curve cost stays inside the
// certified columns (see the tank packets).
function aaPedestal(P, A, yl, zl) {
  const { box, cylY } = KIT;
  P.add('turretDark', cylY(0.026, 0.034, A.top - 0.16 - A.baseY, 8), A.x, yl((A.baseY + A.top - 0.16) / 2), zl(A.z));
  P.add('turretDark', box(0.15, 0.10, A.zw), A.x, yl(A.top - 0.11), zl(A.z));
  P.add('turretDark', box(0.10, 0.06, A.zw * 0.55), A.x, yl(A.top - 0.03), zl(A.z));
}

// ---------------------------------------------------------------------------
// T26-family cast turret (m26/m45/m46): lofted from the measured side band.
// ---------------------------------------------------------------------------
function t26Cast(P, T) {
  const { box, cylY, sph, liftEye, cupola, tarpRoll } = KIT;
  const yl = (y) => y - T.ringY, zl = (z) => z - T.ringZ;
  const secs = T.sections;
  loftBody(P, 'turret', secs, { oy: T.ringY, oz: T.ringZ, wall: 0.46, mid: 0.79, midW: 0.85, crownW: 0.46, ...(T.loft || {}) });
  if (T.basket) { // crew basket under the ring: the reference rig_turret
    // subtrees hang to y 0.35-0.41 — the gate measures it.
    const B = T.basket;
    P.add('turretDark', box(B.w, B.y1 - B.y0, B.z0 - B.z1), 0, yl((B.y0 + B.y1) / 2), zl((B.z0 + B.z1) / 2));
  }
  bustleRack(P, T.rack, yl, zl, P.rng);
  if (T.stowBump) {
    tarpRoll(P, 'turretDark', T.stowBump.x, yl(T.stowBump.y), zl(T.stowBump.z), T.stowBump.len, T.stowBump.r, true, P.q ? 12 : 8);
  }
  // commander cupola (vehicle right = world -x) + loader hatch (left)
  cupola(P, 'turret', T.cupola.x, yl(T.cupola.base), zl(T.cupola.z), T.cupola.r, T.cupola.h, 6);
  P.add('turret', cylY(0.17, 0.175, 0.05, 14), T.loader.x, yl(T.loader.y), zl(T.loader.z), 0, 0, 0, [1, 1, 1.25]);
  P.add('turretDark', box(0.05, 0.02, 0.16), T.loader.x + 0.14, yl(T.loader.y) + 0.028, zl(T.loader.z));
  if (T.vent) P.add('turret', sph(0.09, 12, Math.PI / 2), T.vent.x, yl(T.vent.y), zl(T.vent.z));
  // lifting eyes seated on the casting
  const eyeF = secs[Math.min(4, secs.length - 1)], eyeR = secs[secs.length - 3];
  for (const side of [-1, 1]) {
    liftEye(P, 'turretDetail', side * eyeF.hw * 0.62, yl(eyeF.top - 0.10), zl(eyeF.z));
    liftEye(P, 'turretDetail', side * eyeR.hw * 0.60, yl(eyeR.top - 0.10), zl(eyeR.z));
  }
  if (T.antenna) { // pot + short stub only: a full whip paints a mast into the masks
    P.add('turretDetail', cylY(0.045, 0.06, 0.10, 8), T.antenna.x, yl(T.antenna.y), zl(T.antenna.z));
    P.add('turretDetail', cylY(0.014, 0.018, 0.16, 6), T.antenna.x, yl(T.antenna.y + 0.11), zl(T.antenna.z));
  }
  m2Station(P, T.mg, yl, zl);
  if (T.pedestal) aaPedestal(P, T.pedestal, yl, zl);
  // markings on the bustle flanks
  const bs = secs[secs.length - 2];
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [bs.hw + 0.02, yl((bs.top + bs.bot) / 2), zl(bs.z - 0.1)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-bs.hw - 0.02, yl((bs.top + bs.bot) / 2), zl(bs.z - 0.1)], -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// M47 long-nose turret: needle prow -> plateau loft, long squared bustle
// overhang, rangefinder blister pods, low cupola, roof M2.
// ---------------------------------------------------------------------------
function m47Cast(P, T) {
  const { box, slab, cylY, cylX, sph, liftEye, cupola, tarpRoll } = KIT;
  const yl = (y) => y - T.ringY, zl = (z) => z - T.ringZ;
  loftBody(P, 'turret', T.sections, { oy: T.ringY, oz: T.ringZ, wall: 0.42, mid: 0.78, midW: 0.84, crownW: 0.44 });
  if (T.basket) {
    const Bk = T.basket;
    P.add('turretDark', box(Bk.w, Bk.y1 - Bk.y0, Bk.z0 - Bk.z1), 0, yl((Bk.y0 + Bk.y1) / 2), zl((Bk.z0 + Bk.z1) / 2));
  }
  // long bustle overhang: measured top 2.17 -> 2.13, floor 1.505, past the
  // hull tail; ammo chin box under the bustle throat (ref bot 1.28 @ -2.2)
  const B = T.bustle;
  P.add('turret', slab(
    [-B.w0, yl(B.floor0), zl(B.z0)], [B.w0, yl(B.floor0), zl(B.z0)], [B.w1, yl(B.floor1), zl(B.z1)], [-B.w1, yl(B.floor1), zl(B.z1)],
    [-B.w0 * 0.94, yl(B.top0), zl(B.z0)], [B.w0 * 0.94, yl(B.top0), zl(B.z0)], [B.w1 * 0.92, yl(B.top1), zl(B.z1)], [-B.w1 * 0.92, yl(B.top1), zl(B.z1)]));
  P.add('turretDark', box(0.9, 0.22, 0.30), 0, yl(B.floor0 - 0.11), zl(B.z0 - 0.18));
  // stowage riding the bustle roof (measured bump 2.35 over -2.45..-2.85)
  tarpRoll(P, 'turretDark', -0.05, yl(2.29), zl(-2.65), 1.05, 0.055, true, P.q ? 12 : 8);
  // rear rack frame on the bustle tail
  P.add('turretDetail', box(B.w1 * 2, 0.03, 0.03), 0, yl(B.top1 - 0.02), zl(B.z1 - 0.01));
  P.add('turretDetail', box(B.w1 * 2, 0.03, 0.03), 0, yl(B.floor1 + 0.14), zl(B.z1 - 0.01));
  for (let i = 0; i < 5; i++) {
    P.add('turretDetail', box(0.026, B.top1 - B.floor1 - 0.18, 0.026), -B.w1 + 0.08 + i * ((B.w1 - 0.08) / 2), yl((B.top1 + B.floor1) / 2), zl(B.z1 - 0.01));
  }
  // stereoscopic rangefinder blisters on both cheeks
  for (const side of [-1, 1]) {
    P.add('turret', sph(0.16, P.q ? 16 : 10), side * T.blisterX, yl(T.blisterY), zl(T.blisterZ), 0, 0, 0, [1.1, 0.72, 1.0]);
    P.add('turretDark', cylX(0.07, 0.03, 10), side * (T.blisterX + 0.16), yl(T.blisterY), zl(T.blisterZ));
  }
  // low-profile cupola (right) + loader hatch (left) + vent
  cupola(P, 'turret', T.cupola.x, yl(T.cupola.base), zl(T.cupola.z), T.cupola.r, T.cupola.h, 6);
  P.add('turret', cylY(0.17, 0.175, 0.05, 14), T.loader.x, yl(T.loader.y), zl(T.loader.z), 0, 0, 0, [1, 1, 1.25]);
  P.add('turretDark', box(0.05, 0.02, 0.16), T.loader.x + 0.14, yl(T.loader.y) + 0.028, zl(T.loader.z));
  P.add('turret', sph(0.085, 12, Math.PI / 2), 0.05, yl(2.50), zl(-0.72));
  for (const side of [-1, 1]) {
    liftEye(P, 'turretDetail', side * 0.9, yl(2.42), zl(-0.86));
    P.add('turretDetail', box(0.02, 0.02, 0.55), side * (B.w1 - 0.02), yl(B.top0 - 0.24), zl(-2.55));
  }
  m2Station(P, T.mg, yl, zl);
  if (T.pedestal) aaPedestal(P, T.pedestal, yl, zl);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [B.w0 + 0.01, yl((B.top0 + B.floor0) / 2), zl(-2.6)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-B.w0 - 0.01, yl((B.top0 + B.floor0) / 2), zl(-2.6)], -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// T26-family gun. The tube is built to the PUBLISHED overall length (the
// reference barrels are short-modelled — certified caps in the packets); the
// measured muzzle devices sit at the published muzzle, and the tall cast
// mantlet matches the measured shield band (it pitches with the gun).
// G: { rootZ, axisY, muzzle, r, device, shield:{w,h,dy,zF,d} }
// ---------------------------------------------------------------------------
function pattonGun(P, G) {
  const { box, slab, cylX, cylZ, xform } = KIT;
  const len = G.muzzle - G.rootZ;
  const w2l = (z) => z - G.rootZ;                            // world z -> gun local
  const seg = P.q ? 20 : 12;
  // cast mantlet: a tall rounded wedge (measured band: chin ~0.43 below the
  // bore, top sloping up-rearward), plus rotor cheeks.
  const S = G.shield;
  const zF = w2l(S.zF), zR = zF - (S.d ?? 0.5);
  const chin = S.chinRise ?? 0.06;     // T26 chins climb toward the face
  P.addGunExtra(slab(
    [-S.w / 2, S.dy - S.h / 2, zR], [S.w / 2, S.dy - S.h / 2, zR], [S.w / 2, S.dy - S.h / 2 + chin, zF], [-S.w / 2, S.dy - S.h / 2 + chin, zF],
    [-S.w / 2 * 0.92, S.dy + S.h / 2, zR], [S.w / 2 * 0.92, S.dy + S.h / 2, zR], [S.w / 2 * 0.9, S.dy + S.h * 0.1, zF], [-S.w / 2 * 0.9, S.dy + S.h * 0.1, zF]));
  P.addGunExtra(xform(cylX(Math.min(0.20, S.h * 0.3), S.w * 0.7, P.q ? 16 : 10), 0, 0, 0), 0, S.dy * 0.4, zF - 0.05);
  const sq = (r, l, at, sy = 1, sx = 1) => P.add('gun', xform(cylZ(r, l, seg), 0, 0, 0, 0, 0, 0, [sx, sy, 1]), 0, 0, at);
  if (G.device === 'm3') {
    // 90 mm M3: bare tube then the double-baffle brake — an oblong solid body
    // with proud baffle rings and dark side windows. Bands kept < 0.33 tall
    // so the barrel never counts into the dims body-extent filter.
    P.add('gun', cylZ(G.r, len - 0.62, seg), 0, 0, (len - 0.62) / 2 + 0.02);
    const b0 = len - 0.58;
    sq(0.16, 0.56, b0 + 0.28, 1, 1.5);                      // brake body
    sq(0.165, 0.11, b0 + 0.10, 1, 1.55);                    // rear baffle ring
    sq(0.165, 0.11, b0 + 0.42, 1, 1.55);                    // front baffle ring
    for (const side of [-1, 1]) P.add('gunDark', box(0.06, 0.10, 0.12), side * 0.19, 0, b0 + 0.26);
    P.add('gun', cylZ(G.r * 1.05, 0.05, 10), 0, 0, len - 0.015);
  } else if (G.device === 'm3a1') {
    // 90 mm M3A1: bore-evacuator sleeve over the mid tube (the measured
    // continuous 0.33 band from +2.2), bare tube, then the single-baffle
    // drum at the published muzzle.
    P.add('gun', cylZ(G.r, len - 0.10, seg), 0, 0, (len - 0.10) / 2 + 0.02);
    P.add('gun', cylZ(0.160, w2l(G.evacZ1) - w2l(G.evacZ0), seg), 0, 0, (w2l(G.evacZ0) + w2l(G.evacZ1)) / 2);
    sq(0.24, 0.17, len - 0.115, 0.66);                      // single baffle drum
    P.add('gunDark', xform(cylZ(0.23, 0.03, seg), 0, 0, 0, 0, 0, 0, [1, 0.7, 1]), 0, 0, len - 0.21);
    sq(0.18, 0.05, len - 0.022, 0.8);                       // muzzle face
  } else if (G.device === 'm36') {
    // 90 mm M36: small bore evacuator mid-tube + short WIDE flat blast
    // deflector at the published muzzle (measured: side 0.24 / plan 0.68).
    const t0 = G.tubeZ0 != null ? w2l(G.tubeZ0) : 0.02;
    P.add('gun', cylZ(G.r, len - 0.28 - t0, seg), 0, 0, (len - 0.28 + t0) / 2);
    P.add('gun', cylZ(0.15, G.evacL, seg), 0, 0, w2l(G.evacZ0) + G.evacL / 2);
    sq(0.30, 0.14, len - 0.24, 0.40);                       // rear drum
    P.add('gunDark', xform(cylZ(0.27, 0.05, seg), 0, 0, 0, 0, 0, 0, [1, 0.36, 1]), 0, 0, len - 0.15);
    sq(0.30, 0.12, len - 0.075, 0.40);                      // front drum
    sq(0.18, 0.04, len - 0.01, 0.6);                        // rounded exit
  } else {
    // m45: 105 mm M4 howitzer stub with a plain muzzle collar
    P.add('gun', cylZ(G.r, len - 0.05, seg), 0, 0, (len - 0.05) / 2 + 0.02);
    P.add('gun', cylZ(G.r * 1.12, 0.08, 12), 0, 0, len - 0.05);
  }
  P.muzzleZ = len;
}

// ---------------------------------------------------------------------------
// Family builder: hull + fittings + turret + gun for the four T26/T42 tanks.
// ---------------------------------------------------------------------------
function buildPershing(P, cfg) {
  const hull = curveHull(P, cfg.hull);
  usKit(P, hull, cfg.fit);
  P.turretG.position.set(0, cfg.ring[0], cfg.ring[1]);
  P.gunG.position.set(0, cfg.gun.axisY - cfg.ring[0], cfg.gun.rootZ - cfg.ring[1]);
  if (cfg.turret.m47) m47Cast(P, cfg.turret); else t26Cast(P, cfg.turret);
  pattonGun(P, cfg.gun);
  P.topY = cfg.topWorld - cfg.ring[0] + 0.12;
}

// ---------------------------------------------------------------------------
// M60 asymmetric casting loft: each section is sliced by a signed-fraction
// cross profile ([fx, fy] pairs, fx of hw, fy of bot->top) so the LEFT ridge
// cliff and the LONG low RIGHT roof of the real casting both read (the
// symmetric loftBody trapezoids cannot carry a +0.4 m left/right roof split).
// Emitted as a shell: outer surface strips + an inward offset for solidity.
// ---------------------------------------------------------------------------
function m60Loft(P, bucket, secs, profile, oy, oz) {
  const { slab } = KIT;
  const pt = (s, f) => [f[0] * (f[0] > 0 && s.hwR ? s.hwR : s.hw), s.bot + (s.top - s.bot) * f[1]];
  const inn = (s, p) => [p[0] * 0.84, p[1] + ((s.top + s.bot) / 2 - p[1]) * 0.16];
  const ring = profile.concat([profile[0]]);
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i], b = secs[i + 1];
    const az = a.z - oz, bz = b.z - oz;
    for (let k = 0; k < ring.length - 1; k++) {
      const a0 = pt(a, ring[k]), a1 = pt(a, ring[k + 1]);
      const b0 = pt(b, ring[k]), b1 = pt(b, ring[k + 1]);
      const ia0 = inn(a, a0), ia1 = inn(a, a1), ib0 = inn(b, b0), ib1 = inn(b, b1);
      P.add(bucket, slab(
        [a0[0], a0[1] - oy, az], [a1[0], a1[1] - oy, az], [b1[0], b1[1] - oy, bz], [b0[0], b0[1] - oy, bz],
        [ia0[0], ia0[1] - oy, az], [ia1[0], ia1[1] - oy, az], [ib1[0], ib1[1] - oy, bz], [ib0[0], ib0[1] - oy, bz]));
    }
  }
  // flush end caps (jut INWARD so the cap never extends the loft footprint —
  // a 2 cm forward cap at the bustle tail straddled a station boundary)
  for (const [s, dir] of [[secs[0], -1], [secs[secs.length - 1], 1]]) {
    const z0 = s.z - oz, z1 = s.z - oz + dir * 0.025;
    P.add(bucket, slab(
      [-s.hw * 0.90, s.bot + 0.03 - oy, z0], [s.hw * 0.90, s.bot + 0.03 - oy, z0], [s.hw * 0.86, s.bot + 0.03 - oy, z1], [-s.hw * 0.86, s.bot + 0.03 - oy, z1],
      [-s.hw * 0.90, s.top - 0.10 - oy, z0], [s.hw * 0.90, s.top - 0.10 - oy, z0], [s.hw * 0.86, s.top - 0.12 - oy, z1], [-s.hw * 0.86, s.top - 0.12 - oy, z1]));
  }
}

// ---------------------------------------------------------------------------
// M60A1/A3: boat hull + the long-nose casting. Rebuilt round-3 against the
// TRUE-AXIS reference trace (docs/references/profiles/m60a1.json decoded to
// world coords) + the gate v10 worst arrays. Key measured landmarks:
//   deck FLAT 1.740 (z -0.45..+1.81), centre engine crown 1.884-1.886 peak
//   (z -1.6..-2.1) easing 1.828 by -3.1; fender band 1.786-1.79; glacis knee
//   (+1.86, 1.675) toe (+3.44, 1.31); bow furniture band 1.52-1.58 over
//   +2.55..+3.41; splash board 1.699-1.710 @ +2.23..+2.45; track flat
//   -2.48..+2.34 with idler (+3.04, 0.85) / sprocket (-2.96, 0.85) 42/34-deg
//   ramps; front mud flap (top 1.297/bot 1.117) to +3.545; rear: centre
//   plate ends -3.28, fender lip 1.84 to -3.39 at |x| 0.85-1.05, mud flap
//   top 1.45 @ -3.44, tail tip 1.35/0.95 to -3.55 (band < 0.39 so
//   hullLengthM keeps its -3.445 anchor); pintle to -3.52 at |x|<0.17.
// ---------------------------------------------------------------------------
function buildM60(P, cfg) {
  const { box, slab, cylY, cylZ, cylX, sph, xform, liftEye, buildGun, tarpRoll, ammoCan } = KIT;
  const hull = curveHull(P, cfg.hull);
  // centre engine crown over the fender-level band deck, CAMBERED: full
  // height only |x|<=0.78, wing wedges taper to the band by |x| 1.02 (the
  // reference front-hull columns read 1.82 at x 0.88, 1.79 by 1.08).
  const CROWN = [
    [-0.45, 1.744], [-1.00, 1.782], [-1.60, 1.884], [-2.10, 1.886],
    [-2.45, 1.872], [-2.80, 1.849], [-3.10, 1.831], [-3.28, 1.838]];
  for (let i = 0; i < CROWN.length - 1; i++) {
    const [z0, y0] = CROWN[i], [z1, y1] = CROWN[i + 1];
    P.add('hull', slab(
      [-0.78, 1.70, z0], [0.78, 1.70, z0], [0.77, 1.70, z1], [-0.77, 1.70, z1],
      [-0.78, y0, z0], [0.78, y0, z0], [0.77, y1, z1], [-0.77, y1, z1]));
    for (const side of [-1, 1]) {
      P.add('hull', slab(
        [side * 0.77, 1.70, z0], [side * 1.02, 1.70, z0], [side * 1.02, 1.70, z1], [side * 0.77, 1.70, z1],
        [side * 0.77, y0 - 0.050, z0], [side * 1.02, y0 - 0.058, z0], [side * 1.02, y1 - 0.058, z1], [side * 0.77, y1 - 0.050, z1]));
    }
  }
  // fender flares: SEGMENTED strips carry the true 3.631 width envelope (the
  // reference's own station at z 0.0..0.5 narrows to 3.343 — its width
  // carriers are panels with a gap there, the round-2 family law).
  for (const side of [-1, 1]) {
    P.add('hull', box(hull.hw - 1.70, 0.03, 0.40), side * (1.70 + hull.hw) / 2, 1.732, -0.26);
    P.add('hull', box(hull.hw - 1.70, 0.03, 0.94), side * (1.70 + hull.hw) / 2, 1.732, 1.02);
  }
  // rear corner package (all measured): inner deck lip strips at 1.842,
  // outer fender tips at 1.786 (ending -3.38, clear of the -3.392 trace
  // column boundary); sloped rear plate ends the centre hull at -3.28;
  // kinked rubber mud flaps carry the tail.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.17, 0.028, 0.14), side * 0.955, 1.828, -3.31);
    P.add('hull', box(0.72, 0.025, 0.12), side * 1.425, 1.774, -3.32);
    P.add('hullDark', box(0.16, 0.09, 0.05), side * 1.30, 1.38, -3.28);
    // mud flap: tall sheet joined to the fender tips, kinked at -3.40 to the
    // measured 1.45 ledge, band-thin tail tip (top 1.33/bot 0.97 keeps the
    // 12% body filter from extending hullLengthM past the -3.445 column)
    P.add('hullRubber', slab(
      [side * 1.02, 0.775, -3.30], [side * 1.78, 0.775, -3.30], [side * 1.78, 0.775, -3.40], [side * 1.02, 0.775, -3.40],
      [side * 1.02, 1.79, -3.30], [side * 1.78, 1.79, -3.30], [side * 1.78, 1.455, -3.40], [side * 1.02, 1.455, -3.40]));
    P.add('hullRubber', box(0.76, 0.675, 0.09), side * 1.40, 1.1125, -3.445);
    P.add('hullRubber', box(0.76, 0.37, 0.06), side * 1.40, 1.145, -3.52);
  }
  // sloped rear plate (centre): plan rear extent -3.28 at |x| <= 1.0
  P.add('hull', slab(
    [-1.0, 0.97, -3.28], [1.0, 0.97, -3.28], [1.02, 1.02, -3.20], [-1.02, 1.02, -3.20],
    [-1.0, 1.44, -3.28], [1.0, 1.44, -3.28], [1.02, 1.79, -3.20], [-1.02, 1.79, -3.20]));
  usKit(P, hull, cfg.fit);
  // splash board chevron across the glacis (measured 1.699-1.710 @ 2.23..2.45)
  P.add('hullDetail', box(1.15, 0.045, 0.10), -0.55, 1.652, 2.30, -0.28, -0.18, 0);
  P.add('hullDetail', box(1.15, 0.045, 0.10), 0.55, 1.652, 2.30, -0.28, 0.18, 0);
  // periscope/IR hood pods on the glacis (measured band 1.559 @ 2.77..2.99)
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.22, 0.105, 0.22), side * 0.35, 1.505, 2.90, -0.10, 0, 0);
  }
  // headlight brush-guard hoops + cross bar (measured bow band 1.549-1.559
  // over +3.31..+3.41 — kept under the published-length hull span)
  for (const side of [-1, 1]) {
    for (const dx of [-0.10, 0.10]) {
      P.add('hullDetail', box(0.018, 0.10, 0.20), side * (cfg.fit.lights.x + dx), 1.46, 3.33, -0.22, 0, 0);
    }
    P.add('hullDetail', box(0.24, 0.018, 0.018), side * cfg.fit.lights.x, 1.548, 3.41);
    // front mud flap: wedge from the toe over the idler (ref top 1.297 /
    // bot 1.117 at +3.52, plan front extent +3.545 at the track columns)
    P.add('hullRubber', slab(
      [side * 1.10, 1.10, 3.44], [side * 1.78, 1.10, 3.44], [side * 1.78, 1.10, 3.53], [side * 1.10, 1.10, 3.53],
      [side * 1.10, 1.278, 3.44], [side * 1.78, 1.278, 3.44], [side * 1.78, 1.264, 3.53], [side * 1.10, 1.264, 3.53]));
  }
  // rear plate: flush transmission access ring + towing pintle (to -3.52)
  P.add('hullDark', cylZ(0.26, 0.02, P.q ? 18 : 12), 0, 1.05, -3.28);
  P.add('hullDetail', box(0.34, 0.18, 0.06), 0, 1.16, -3.31);
  P.add('hullDetail', cylZ(0.05, 0.24, 8), 0, 1.16, -3.40);

  const py = 1.76, pz = 0.30;
  P.turretG.position.set(0, py, pz);
  P.gunG.position.set(0, 2.087 - py, 1.55 - pz);
  const yl = (y) => y - py, zl = (z) => z - pz;

  // crew basket under the ring (ref cast underside 1.33-1.35 over -0.34..+1.47)
  P.add('turretDark', box(1.40, 0.42, 1.79), 0, yl(1.525), zl(0.535));
  // right-cheek stowage bin (the measured long right-side shelf: plan front
  // +1.28 at x 1.25..1.29, +1.06 outboard; front-view tops 2.19 -> 1.90)
  P.add('turret', box(0.04, 0.34, 2.00), 1.265, yl(2.03), zl(0.28), 0.006, 0, 0);
  P.add('turret', slab(
    [1.295, yl(1.86), zl(-0.74)], [1.39, yl(1.86), zl(-0.74)], [1.39, yl(1.86), zl(1.06)], [1.295, yl(1.86), zl(1.06)],
    [1.295, yl(2.19), zl(-0.74)], [1.39, yl(1.98), zl(-0.74)], [1.39, yl(1.98), zl(1.06)], [1.295, yl(2.19), zl(1.06)]));
  P.add('turret', box(0.03, 0.07, 0.64), 1.405, yl(1.895), zl(0.40));
  // the casting, TWO lofts: the crowned front body (left ridge cliff, long
  // low right roof) and the flat-roofed bustle (roof 2.664 to -2.02).
  m60Loft(P, 'turret', cfg.sections, M60_PROFILE, py, pz);
  m60Loft(P, 'turret', cfg.bustle, M60_BUSTLE_PROFILE, py, pz);
  // right roof shelf: the measured flat 2.716-2.72 band (x 0.06..0.80 over
  // the crest zone) with the loader hatch riding it at 2.80
  P.add('turret', box(0.78, 0.10, 1.00), 0.45, yl(2.665), zl(0.08), 0.006, 0, 0);
  P.add('turret', cylY(0.115, 0.12, 0.055, 14), 0.56, yl(2.745), zl(-0.05));
  P.add('turretDark', box(0.05, 0.014, 0.15), 0.625, yl(2.782), zl(-0.05));

  // M19 cupola LEFT of the ridge (measured: base ring curve 3.05 @ x -0.88,
  // plateau 3.197 over x -0.43..-0.80 / z +0.09..+0.30). The narrow spine
  // blade on top carries the published 3.27 m height (heightM p95 needs >=4
  // side columns at 3.26 — the oracle's own cupola stops at 3.199; the
  // residual on those columns is the documented dims-sovereign tradeoff).
  const cx = -0.60, cz = zl(0.20);
  P.add('turret', cylY(0.28, 0.315, 0.11, P.q ? 20 : 12), cx, yl(3.005), cz);
  P.add('turret', cylY(0.175, 0.185, 0.09, P.q ? 20 : 12), cx, yl(3.105), zl(0.24));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    P.add('turretDark', box(0.07, 0.05, 0.02), cx + Math.sin(a) * 0.17, yl(3.115), zl(0.24) + Math.cos(a) * 0.17, 0, a, 0);
  }
  P.add('turret', cylY(0.180, 0.190, 0.047, P.q ? 20 : 12), cx - 0.01, yl(3.173), zl(0.245));
  P.add('turretDark', box(0.05, 0.074, 0.39), cx, yl(3.223), zl(0.25));
  P.add('turretDark', box(0.11, 0.07, 0.14), cx + 0.05, yl(3.055), zl(0.37));
  P.add('turretDark', cylZ(0.020, 0.14, 8), cx + 0.05, yl(3.045), zl(0.50));

  // grab rails on both cheeks (measured 2.33 @ x 1.21) + sunk lift eyes
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.022, 1.10), side * 1.22, yl(2.36), zl(0.50));
    for (const dz of [0.0, 1.00]) P.add('turretDetail', box(0.022, 0.08, 0.022), side * 1.22, yl(2.32), zl(dz));
  }
  liftEye(P, 'turretDetail', -0.70, yl(3.00), zl(0.45));
  liftEye(P, 'turretDetail', 0.70, yl(2.66), zl(0.62));
  // bustle roof stowage rides SUNK to the measured flat 2.664 roofline
  tarpRoll(P, 'turretDark', -0.40, yl(2.578), zl(-1.30), 0.95, 0.085, true, P.q ? 12 : 8);
  ammoCan(P, 'turretDark', 0.52, yl(2.60), zl(-1.28), 0.32);
  // antenna pot: LEFT-REAR bustle roof (the measured one-column 2.835 spike
  // at z -1.41; front-hidden under the ridge at x -0.38)
  P.add('turretDetail', cylY(0.045, 0.06, 0.10, 8), -0.38, yl(2.714), zl(-1.41));
  P.add('turretDetail', cylY(0.014, 0.018, 0.07, 6), -0.38, yl(2.80), zl(-1.41));
  // right-roof whip base (the measured one-column 2.955 front spike at
  // x +0.84; side-hidden under the crest)
  P.add('turretDetail', cylY(0.020, 0.022, 0.54, 6), 0.835, yl(2.685), zl(-0.05));
  P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [1.225, yl(2.30), zl(-1.20)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [-1.225, yl(2.30), zl(-1.20)], -Math.PI / 2);

  if (cfg.a3) { // crosswind sensor stub + TTS blister (A3 fire-control kit).
    // Both stay LOW: the shared reference has no A3 kit, so every proud pixel
    // is pure deduction — the stub reads in exactly one side column and stays
    // under the 2% station-top line (the searchlight cap already consumes
    // both station trim slots on this variant).
    P.add('turretDetail', cylY(0.030, 0.042, 0.046, 8), 0.35, yl(2.687), zl(-1.62));
    P.add('turretDark', box(0.05, 0.028, 0.05), 0.35, yl(2.696), zl(-1.62));
    P.add('turret', box(0.28, 0.14, 0.24), 0.75, yl(2.75), zl(1.02));
    P.add('turretDark', box(0.16, 0.07, 0.02), 0.75, yl(2.76), zl(1.15));
  }

  // M140 mount: cast rotor + canvas boot at the nose throat (kept inside the
  // measured 0.32 plan half-width)
  P.addGunExtra(box(0.56, 0.42, 0.38), 0, 0.02, 0.91);
  P.addGunExtra(xform(cylX(0.17, 0.56, 12), 0, 0, 0), 0, 0.03, 0.97);
  P.addGunExtra(cylZ(0.12, 0.30, 12, 0.10), 0, 0, 1.18);
  P.addGunExtraDark(box(0.48, 0.26, 0.05), 0, -0.03, 0.98);
  if (cfg.searchlight) { // AN/VSS-1 over the mantlet (pitches with the gun)
    // measured: rear roof 2.66 rising to the 2.765 front lip, z 2.02..2.75;
    // plan reads only |x| < 0.22 (the ±0.27 trace columns stay clean)
    P.addGunExtra(box(0.40, 0.34, 0.73), 0.0, 0.45, 0.79);
    P.addGunExtra(box(0.40, 0.06, 0.34), 0.0, 0.645, 0.945);
    P.addGunExtraDark(xform(cylZ(0.135, 0.025, 14), 0, 0, 0), 0.0, 0.47, 1.13);
    for (const side of [-1, 1]) {
      P.addGunExtra(box(0.05, 0.26, 0.05), side * 0.15, 0.26, 0.80, 0.2, 0, 0);
    }
  }
  // M68: bare tube dia 0.164 (measured band 2.001-2.162, axis 2.08), bore
  // evacuator drum 0.24 dia over +3.31..+3.95, muzzle +5.96, no brake.
  buildGun(P, {
    len: cfg.gunLen, r: cfg.sleeve ? 0.076 : 0.082, sleeve: !!cfg.sleeve,
    evac: 0.462, evacR: cfg.sleeve ? 1.62 : 1.47, collar: false, baseR: 0.15,
  });
  P.topY = 3.26 - py + 0.12;
}

// ---------------------------------------------------------------------------
// Measured per-tank data (v6 true-camera work orders, world coords).
// ---------------------------------------------------------------------------
const M26_HULL = {
  W: 3.51, trackW: 0.58, trackInset: 0.08, sponsonY: 1.05, bellyY: 0.46, noseW: 1.30,
  deck: [[2.68, 1.05], [1.78, 1.545], [1.30, 1.545], [0.00, 1.535], [-1.00, 1.55],
    [-1.90, 1.55], [-2.32, 1.505], [-2.56, 1.475], [-2.80, 1.405], [-3.02, 1.395],
    [-3.25, 1.335], [-3.55, 1.26]],
  toeBot: 0.94, bellyFrontZ: 1.65, bellyRearZ: -2.55, tailBotY: 0.90,
  tailTaper: { z0: -2.78, hw1: 0.55 },
  duckbills: { z: -3.28 },
  flapF: [2.72, 0.95, 1.31], flapR: [-3.36, 0.78, 1.06],
  gear: {
    wheelR: 0.33, span: [1.58, -2.30], rollerN: 5, rollerY: 0.98,
    idler: { z: 2.16, y: 0.72, r: 0.28 }, sprocket: { z: -2.90, y: 0.85, r: 0.27 },
    tension: { z: -2.60, y: 0.28, r: 0.14 },
  },
};
const M26_FIT = {
  hatchZ: 1.50, bowMG: [0.55, 1.32, 2.04, -0.55],
  lights: { x: 0.68, y: 1.44, z: 1.98, rx: -0.50 }, siren: [-0.3, 1.40, 2.00],
  shackleY: 1.00, shackleZ: 2.50,
  grille: { z0: -1.60, z1: -2.52, y: 1.525, rx: 0.076 }, caps: [0.85, -1.25],
  rearGrilleY: 1.08, rearGrilleW: 0.95, rearGrilleZ: -3.49,
};

const M45_HULL = {
  W: 3.51, trackW: 0.58, trackInset: 0.08, sponsonY: 1.05, bellyY: 0.46, noseW: 1.30,
  deck: [[3.10, 1.03], [2.55, 1.50], [2.18, 1.53], [0.20, 1.53], [-0.40, 1.555],
    [-1.20, 1.575], [-1.60, 1.545], [-1.80, 1.49], [-2.00, 1.485], [-2.20, 1.425],
    [-2.50, 1.385]],
  toeBot: 0.94, bellyFrontZ: 2.10, bellyRearZ: -2.10,
  narrowTail: { hw: 0.70, z0: -2.50, z1: -3.20, top1: 1.16, botY: 0.82 },
  flapF: [3.135, 0.70, 1.06], flapR: [-2.72, 0.56, 0.94],
  gear: {
    wheelR: 0.33, span: [1.90, -1.72], rollerN: 5, rollerY: 0.98,
    idler: { z: 2.58, y: 0.66, r: 0.28 }, sprocket: { z: -2.42, y: 0.85, r: 0.27 },
    tension: { z: -2.10, y: 0.30, r: 0.14, support: true },
  },
};
const M45_FIT = {
  hatchZ: 2.12, bowMG: [0.55, 1.31, 2.56, -0.80],
  lights: { x: 0.68, y: 1.42, z: 2.68, rx: -0.62 },
  shackleY: 0.98, shackleZ: 3.00,
  grille: { z0: -1.62, z1: -2.44, y: 1.44, rx: 0.13 }, caps: [0.85, -1.40],
  rearGrilleY: 1.05,
};

const M46_HULL = {
  W: 3.51, trackW: 0.58, trackInset: 0.08, sponsonY: 1.12, bellyY: 0.46, noseW: 1.30,
  deck: [[2.78, 1.07], [2.28, 1.60], [1.60, 1.664], [-0.70, 1.664], [-2.90, 1.674],
    [-3.10, 1.63], [-3.30, 1.59], [-3.48, 1.52]],
  toeBot: 1.00, bellyFrontZ: 1.75, bellyRearZ: -2.60, tailBotY: 0.92,
  duckbills: { z: -3.30 },
  mufflers: { z0: -0.95, z1: -2.95, top: 1.73 },
  flapF: [2.73, 0.62, 1.06], flapR: [-3.575, 0.56, 1.00],
  gear: {
    wheelR: 0.33, span: [1.62, -2.50], rollerN: 5, rollerY: 1.02,
    idler: { z: 2.14, y: 0.68, r: 0.28 }, sprocket: { z: -2.68, y: 0.82, r: 0.27 },
    tension: { z: -2.45, y: 0.28, r: 0.14 },
  },
};
const M46_FIT = {
  hatchZ: 1.90, bowMG: [0.55, 1.42, 2.38, -0.66],
  lights: { x: 0.68, y: 1.52, z: 2.36, rx: -0.60 },
  shackleY: 1.10, shackleZ: 2.60,
  grille: { z0: -1.65, z1: -2.70, y: 1.70, rx: 0, x: 0.52, w: 0.88 }, caps: [0.48, -1.35],
  rearGrilleY: 1.20,
};

const M47_HULL = {
  W: 3.51, trackW: 0.58, trackInset: 0.08, sponsonY: 1.12, bellyY: 0.46, noseW: 1.30,
  deck: [[2.82, 1.19], [2.22, 1.49], [1.70, 1.655], [-0.50, 1.666], [-2.90, 1.674],
    [-3.05, 1.64], [-3.25, 1.60], [-3.40, 1.545]],
  toeBot: 1.08, bellyFrontZ: 1.90, bellyRearZ: -2.60, tailBotY: 1.00,
  duckbills: { z: -3.19 },
  tongues: [[-0.55, 0.50, -3.28], [0.55, 0.50, -3.28]],
  mufflers: { z0: -0.85, z1: -2.90, top: 1.73 },
  flapF: [2.68, 0.62, 1.00], flapR: [-3.30, 0.60, 1.00],
  gear: {
    wheelR: 0.33, span: [1.85, -2.15], rollerN: 5, rollerY: 1.00,
    idler: { z: 2.20, y: 0.68, r: 0.27 }, sprocket: { z: -2.55, y: 0.80, r: 0.26 },
    tension: { z: -2.35, y: 0.28, r: 0.14 },
  },
};
const M47_FIT = {
  hatchZ: 1.88, bowMG: [0.55, 1.32, 2.46, -0.60],
  lights: { x: 0.68, y: 1.40, z: 2.42, rx: -0.58 },
  shackleY: 1.04, shackleZ: 2.68,
  grille: { z0: -1.65, z1: -2.70, y: 1.70, rx: 0, x: 0.52, w: 0.88 }, caps: [0.48, -1.35],
  rearGrilleY: 1.20,
};

const M60_HULL = {
  W: 3.631, bandHW: 1.70, trackW: 0.69, trackInset: 0.037, sponsonY: 1.16, bellyY: 0.47, noseW: 1.66,
  deck: [[3.44, 1.31], [1.86, 1.675], [1.76, 1.738], [-0.50, 1.742], [-2.40, 1.79], [-3.28, 1.788]],
  toeBot: 1.10, bellyFrontZ: 2.30, bellyRearZ: -2.55, tailBotY: 1.00,
  gear: {
    // measured: contact flat -2.48..+2.34 (kit: flat spans lastWheel +/-
    // wheelR/2), 34-deg front ramp to the idler (+3.04, 0.85, wrap R 0.325),
    // 42-deg rear ramp to the sprocket (-2.96, 0.85)
    wheelR: 0.37, wheelY: 0.40, span: [2.155, -2.295], rollerN: 3, rollerY: 1.06,
    idler: { z: 3.00, y: 0.96, r: 0.28 }, sprocket: { z: -2.84, y: 0.97, r: 0.28 },
  },
};
const M60_FIT = {
  singleHatch: true, hatchX0: 0, hatchZ: 2.56,
  lights: { x: 0.92, y: 1.47, z: 3.10, rx: -0.24 },
  shackleY: 1.18, shackleZ: 3.34,
  grille: { z0: -1.90, z1: -2.62, y: 1.840, rx: 0.026, x: 0.40, w: 0.62 }, caps: [1.18, -1.35],
  rearGrilleY: 1.15, rearGrilleW: 1.24, rearGrilleZ: -3.265, noRearEyes: true,
};

// M60 casting cross profiles (signed fractions of hw / bot->top): the LEFT
// wall climbs a near-vertical cliff to the ridge shoulder; the RIGHT roof
// falls immediately off the ridge to the long 2.72 shelf line.
const M60_PROFILE = [
  [-1, 0], [-1, 0.29], [-0.94, 0.445], [-0.919, 0.795], [-0.837, 0.927],
  [-0.268, 1.0], [0.038, 0.915], [0.23, 0.72], [1, 0.29], [1, 0]];
const M60_BUSTLE_PROFILE = [
  [-1, 0], [-1, 0.30], [-0.965, 0.66], [-0.945, 0.91], [-0.848, 1.0],
  [0.848, 1.0], [0.945, 0.91], [0.965, 0.66], [1, 0.30], [1, 0]];
// Front casting loft (world coords; tops/hw from the true-axis trace: saddle
// 2.564 @ 1.70..1.91, forehead shelf 2.895 @ 1.06..1.59, crest 3.09 @ ~0,
// falling 2.845 @ -0.77; nose underside hangs to the measured 1.74-1.78)
const M60_SECTIONS = [
  { z: 2.16, hw: 0.30, top: 2.30, bot: 1.90 },
  { z: 2.10, hw: 0.44, top: 2.36, bot: 1.84 },
  { z: 2.02, hw: 0.54, top: 2.42, bot: 1.79 },
  { z: 1.93, hw: 0.62, top: 2.53, bot: 1.76 },
  { z: 1.80, hw: 0.72, top: 2.565, bot: 1.75 },
  { z: 1.71, hw: 0.785, top: 2.568, bot: 1.74 },
  { z: 1.647, hw: 0.825, top: 2.60, bot: 1.74 },
  { z: 1.617, hw: 0.845, top: 2.78, bot: 1.74 },
  { z: 1.592, hw: 0.862, top: 2.89, bot: 1.74 },
  { z: 1.575, hw: 0.885, top: 2.895, bot: 1.74 },
  { z: 1.40, hw: 1.00, top: 2.90, bot: 1.75 },
  { z: 1.26, hw: 1.12, top: 2.90, bot: 1.75 },
  { z: 1.10, hw: 1.19, top: 2.895, bot: 1.75 },
  { z: 0.95, hw: 1.245, top: 2.92, bot: 1.74 },
  { z: 0.80, hw: 1.275, top: 2.99, bot: 1.73 },
  { z: 0.62, hw: 1.285, top: 3.05, bot: 1.72 },
  { z: 0.42, hw: 1.295, top: 3.06, bot: 1.72 },
  { z: 0.20, hw: 1.295, top: 3.08, bot: 1.72 },
  { z: 0.00, hw: 1.285, top: 3.09, bot: 1.72 },
  { z: -0.22, hw: 1.275, top: 3.08, bot: 1.73 },
  { z: -0.40, hw: 1.265, top: 3.065, bot: 1.74 },
  { z: -0.55, hw: 1.25, top: 3.04, bot: 1.75 },
  { z: -0.66, hw: 1.245, top: 3.01, bot: 1.76 },
  { z: -0.71, hw: 1.243, top: 2.885, bot: 1.765 },
  { z: -0.78, hw: 1.24, top: 2.845, bot: 1.77 },
  { z: -0.92, hw: 1.235, top: 2.765, bot: 1.79 },
  { z: -1.05, hw: 1.23, top: 2.70, bot: 1.80 },
];
// Bustle loft: flat 2.664 roof to the measured -2.03 rear face (the -2.037
// station boundary and the -2.033 trace column boundary sit just behind it),
// plan taper 1.12 @ -1.78 -> 0.90 @ -1.87 -> 0.60 @ -1.96 -> 0.30 @ -2.01;
// the RIGHT cheek tapers earlier (measured rear -1.35 at x +1.24).
const M60_BUSTLE = [
  { z: -0.95, hw: 1.235, hwR: 1.225, top: 2.665, bot: 1.80 },
  { z: -1.30, hw: 1.215, hwR: 1.175, top: 2.664, bot: 1.84 },
  { z: -1.60, hw: 1.19, hwR: 1.13, top: 2.664, bot: 1.90 },
  { z: -1.80, hw: 1.12, hwR: 1.07, top: 2.66, bot: 2.04 },
  { z: -1.87, hw: 0.92, top: 2.655, bot: 2.11 },
  { z: -1.93, hw: 0.72, top: 2.65, bot: 2.16 },
  { z: -1.99, hw: 0.44, top: 2.62, bot: 2.20 },
  { z: -2.035, hw: 0.20, top: 2.62, bot: 2.26 },
];

export const PATTON_PROFILES = {
  m26_pershing: {
    build: (P) => buildPershing(P, {
      hull: M26_HULL, fit: M26_FIT,
      ring: [1.545, -1.55], topWorld: 2.76,
      turret: {
        ringY: 1.545, ringZ: -1.55,
        sections: [
          { z: -0.10, hw: 0.55, top: 1.76, bot: 1.44 },
          { z: -0.40, hw: 0.64, top: 1.95, bot: 1.34 },
          { z: -0.70, hw: 0.76, top: 2.06, bot: 1.28 },
          { z: -0.95, hw: 0.92, top: 2.13, bot: 1.27 },
          { z: -1.20, hw: 1.13, top: 2.20, bot: 1.26 },
          { z: -1.40, hw: 1.225, top: 2.24, bot: 1.25 },
          { z: -1.70, hw: 1.21, top: 2.29, bot: 1.24 },
          { z: -1.95, hw: 1.14, top: 2.31, bot: 1.23 },
          { z: -2.20, hw: 0.95, top: 2.30, bot: 1.17 },
          { z: -2.55, hw: 0.80, top: 2.21, bot: 1.18 },
          { z: -2.75, hw: 0.72, top: 2.16, bot: 1.40 },
          { z: -3.00, hw: 0.64, top: 2.10, bot: 1.43 },
        ],
        basket: { w: 2.0, y0: 0.375, y1: 1.30, z0: -0.84, z1: -2.16 },
        rack: { z0: -3.02, z1: -3.44, zC: -3.26, halfW: 0.50, floorY: 1.50, railY: 1.85, loadTop: 2.08 },
        cupola: { x: -0.46, z: -1.90, r: 0.30, base: 2.26, h: 0.06 },
        loader: { x: 0.48, z: -1.80, y: 2.28 },
        vent: { x: 0.04, z: -1.52, y: 2.28 },
        antenna: { x: 0.70, z: -2.60, y: 2.12 },
        mg: { x: 0.12, z: -2.72, baseY: 2.12, topY: 2.78, tipZ: -1.28, rl: 0.62, cans: [0.26] },
      },
      // published overall 8.65 m: muzzle at 8.65 minus the rear flap (-3.575)
      gun: { rootZ: -0.10, axisY: 1.60, muzzle: 4.96, r: 0.115, device: 'm3', shield: { w: 1.24, h: 0.86, dy: 0.0, zF: -0.18, d: 0.44, chinRise: 0.26 } },
    }),
  },
  m45_patton: {
    build: (P) => buildPershing(P, {
      hull: M45_HULL, fit: M45_FIT,
      ring: [1.54, -1.16], topWorld: 2.68,
      turret: {
        ringY: 1.54, ringZ: -1.16,
        sections: [
          { z: 0.35, hw: 0.60, top: 2.00, bot: 1.32 },
          { z: 0.10, hw: 0.66, top: 2.12, bot: 1.30 },
          { z: -0.15, hw: 0.70, top: 2.20, bot: 1.28 },
          { z: -0.42, hw: 0.82, top: 2.26, bot: 1.26 },
          { z: -0.65, hw: 0.98, top: 2.30, bot: 1.25 },
          { z: -0.90, hw: 1.09, top: 2.32, bot: 1.24 },
          { z: -1.10, hw: 1.18, top: 2.33, bot: 1.235 },
          { z: -1.25, hw: 1.21, top: 2.33, bot: 1.23 },
          { z: -1.45, hw: 1.17, top: 2.33, bot: 1.22 },
          { z: -1.65, hw: 1.08, top: 2.32, bot: 1.215 },
          { z: -1.85, hw: 0.95, top: 2.30, bot: 1.21 },
          { z: -2.02, hw: 0.83, top: 2.24, bot: 1.20 },
          { z: -2.25, hw: 0.79, top: 2.12, bot: 1.32 },
          { z: -2.55, hw: 0.72, top: 2.07, bot: 1.38 },
          { z: -2.85, hw: 0.62, top: 2.02, bot: 1.40 },
        ],
        basket: { w: 1.9, y0: 0.36, y1: 1.25, z0: -0.38, z1: -1.92 },
        rack: { z0: -2.88, z1: -3.16, halfW: 0.46, floorY: 1.48, railY: 1.82 },
        cupola: { x: -0.62, z: -1.48, r: 0.28, base: 2.34, h: 0.26 },
        loader: { x: 0.52, z: -1.42, y: 2.28 },
        vent: { x: 0.05, z: -0.66, y: 2.29 },
        stowBump: { x: -0.35, y: 2.11, z: -2.60, r: 0.085, len: 0.5 },
        mg: { x: -0.32, z: -0.90, baseY: 2.26, topY: 2.79, tipZ: 0.38, rl: 0.52, cans: [0.26, -0.22] },
      },
      // bow-flush stub: overall = hull span 6.40 (muzzle stays inside)
      gun: { rootZ: 0.35, axisY: 1.56, muzzle: 1.44, r: 0.125, device: 'stub', shield: { w: 0.84, h: 0.46, dy: -0.08, zF: 0.45, d: 0.42 } },
    }),
  },
  m46_patton: {
    build: (P) => buildPershing(P, {
      hull: M46_HULL, fit: M46_FIT,
      ring: [1.66, -1.53], topWorld: 2.77,
      turret: {
        ringY: 1.66, ringZ: -1.53, loft: { midW: 0.83, crownW: 0.42 },
        sections: [
          { z: -0.02, hw: 0.60, top: 1.92, bot: 1.50 },
          { z: -0.30, hw: 0.68, top: 2.05, bot: 1.49 },
          { z: -0.60, hw: 0.71, top: 2.14, bot: 1.48 },
          { z: -0.85, hw: 0.90, top: 2.20, bot: 1.47 },
          { z: -1.10, hw: 1.07, top: 2.26, bot: 1.46 },
          { z: -1.45, hw: 1.20, top: 2.31, bot: 1.45 },
          { z: -1.75, hw: 1.19, top: 2.31, bot: 1.44 },
          { z: -2.00, hw: 0.99, top: 2.30, bot: 1.43 },
          { z: -2.25, hw: 0.87, top: 2.28, bot: 1.20 },
          { z: -2.55, hw: 0.79, top: 2.16, bot: 1.19 },
          { z: -2.90, hw: 0.71, top: 2.18, bot: 1.42 },
          { z: -3.10, hw: 0.62, top: 2.05, bot: 1.44 },
        ],
        basket: { w: 2.0, y0: 0.39, y1: 1.42, z0: -0.75, z1: -2.28 },
        rack: { z0: -3.10, z1: -3.46, halfW: 0.52, floorY: 1.52, railY: 1.84, loadTop: 2.02 },
        cupola: { x: -0.58, z: -1.85, r: 0.29, base: 2.32, h: 0.06 },
        loader: { x: 0.48, z: -1.72, y: 2.30 },
        vent: { x: 0.04, z: -1.40, y: 2.28 },
        antenna: { x: 0.70, z: -2.58, y: 2.10 },
        stowBump: { x: -0.05, y: 2.20, z: -2.85, r: 0.075, len: 0.9 },
        // the reference's own (short-modelled) M2 line is matched exactly;
        // the real tall AA pedestal carries the published 3.18 m height —
        // certified in the packet (narrow: 0.15 x, 0.48 z).
        mg: { x: -0.42, z: -1.42, baseY: 2.24, topY: 2.72, tipZ: 0.02, rl: 0.52, cans: [0.24, -0.18] },
        pedestal: { x: -0.20, z: -1.52, baseY: 2.24, top: 3.21, zw: 0.46 },
      },
      // published overall 8.48 m: muzzle at 8.48 minus the duckbill tail (-3.545)
      gun: { rootZ: -0.12, axisY: 1.618, muzzle: 4.92, r: 0.115, device: 'm3a1', evacZ0: 2.10, evacZ1: 3.30, shield: { w: 1.24, h: 0.82, dy: -0.06, zF: -0.06, d: 0.52, chinRise: 0.24 } },
    }),
  },
  m47_patton: {
    build: (P) => buildPershing(P, {
      hull: M47_HULL, fit: M47_FIT,
      ring: [1.64, -1.00], topWorld: 2.94,
      turret: {
        m47: true, ringY: 1.64, ringZ: -1.00,
        sections: [
          { z: 0.45, hw: 0.26, top: 1.80, bot: 1.46 },
          { z: 0.30, hw: 0.36, top: 1.86, bot: 1.44 },
          { z: 0.20, hw: 0.42, top: 1.92, bot: 1.43 },
          { z: 0.00, hw: 0.52, top: 2.28, bot: 1.42 },
          { z: -0.20, hw: 0.75, top: 2.42, bot: 1.41 },
          { z: -0.45, hw: 1.00, top: 2.50, bot: 1.40 },
          { z: -0.75, hw: 1.13, top: 2.51, bot: 1.39 },
          { z: -1.10, hw: 1.14, top: 2.52, bot: 1.38 },
          { z: -1.45, hw: 1.10, top: 2.51, bot: 1.37 },
          { z: -1.75, hw: 1.015, top: 2.49, bot: 1.365 },
          { z: -1.95, hw: 0.95, top: 2.48, bot: 1.36 },
        ],
        bustle: { z0: -1.95, z1: -3.42, w0: 0.94, w1: 0.69, top0: 2.17, top1: 2.13, floor0: 1.50, floor1: 1.51 },
        basket: { w: 2.0, y0: 0.39, y1: 1.38, z0: -0.32, z1: -1.70 },
        blisterX: 0.90, blisterY: 2.12, blisterZ: -0.42,
        cupola: { x: -0.52, z: -1.28, r: 0.30, base: 2.445, h: 0.06 },
        loader: { x: 0.50, z: -1.12, y: 2.47 },
        // reference M2 line matched (band to 2.94, barrel to +0.12); the
        // published 3.35 m rides the real AA pedestal — certified in packet.
        mg: { x: 0.04, z: -1.45, baseY: 2.44, topY: 2.94, tipZ: 0.13, rl: 0.50, cans: [0.22, -0.24] },
        pedestal: { x: -0.22, z: -1.38, baseY: 2.44, top: 3.36, zw: 0.52 },
      },
      // published overall 8.51 m: muzzle at 8.51 minus the tail (-3.47)
      gun: { rootZ: 0.40, axisY: 1.60, muzzle: 5.06, r: 0.115, device: 'm36', tubeZ0: 0.92, evacZ0: 2.38, evacL: 0.66, shield: { w: 0.82, h: 0.48, dy: 0.0, zF: 0.62, d: 0.40 } },
    }),
  },
  m60a1: { build: (P) => buildM60(P, { hull: M60_HULL, fit: M60_FIT, sections: M60_SECTIONS, bustle: M60_BUSTLE, searchlight: true, sleeve: false, gunLen: 4.435 }) },
  m60a3: { build: (P) => buildM60(P, { hull: M60_HULL, fit: M60_FIT, sections: M60_SECTIONS, bustle: M60_BUSTLE, searchlight: false, sleeve: true, a3: true, gunLen: 4.435 }) },
};
