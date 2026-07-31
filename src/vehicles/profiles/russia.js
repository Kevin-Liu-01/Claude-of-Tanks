// Soviet/Russian modern family procedural profiles (fidelity oracles:
// recovered T-62/T-64/T-72/T-90 variants + PT-91M). Owned by the
// Russia-modern family agent.
//
// 2026-07-31 r4: FROM-SCRATCH rebuild of all nine tanks against the measured
// silhouette polylines in docs/references/profiles/<id>.json (the r1-r3
// donor/parametric builders are deleted, not patched). Every hull is a loft
// of measured stations, every dome a lathe of measured rings, every tube a
// measured segment stack; the r3 fitting language that already read on
// boards (Shtora eyes, K-1/K-5/Relikt/ERAWA architectures, seam-ringed
// sleeves, NSVT, glacis kit) is re-seated on the new curve-true shells.
// Oracle-parity notes (misparented drums/racks, hull-parented barrels,
// floating baselines) live per-build below and in the reference packets.
//
// Coordinate convention: authored directly in the width-normalized lab
// frame each profile JSON was traced in — ground y=0, +z forward, and the
// oracle's own (often aft-shifted) hull center, so the raw-frame component
// masks (gun overhang especially) line up. Everything is an original
// primitive construction — measured dimensions only, no source topology.
import { KIT, evenStations } from './kit.js';

// NOTE: KIT bindings are only dereferenced inside build-time functions —
// never at module scope — because of the tankFactory extension-module cycle.

// ---------------------------------------------------------------------------
// 2026-07-31 FROM-SCRATCH rebuild core. Authoring data: the measured
// silhouette polylines in docs/references/profiles/<id>.json (side/plan/front
// mask traces of each width-normalized local reference + 14 hull stations).
// Hulls are LOFTED STATION SLABS that follow the measured deck/belly/width
// polylines; domes are lathed against the measured whole-minus-hull curves;
// gun tubes are segment stacks with the measured radii/breaks. These are
// measurements (dimension tables), never source topology.
//
// Frame: world meters of the width-normalized lab — ground y=0, +z forward,
// the same aft-shifted oracle frames the raw-mask gun-overhang crop needs.
// Side-view mask traces lean +0.05·|x| (camera tilt), so full-width plate
// lines are authored ~0.09 below their traced values; iteration against the
// per-view overlays settles the rest.
// ---------------------------------------------------------------------------

// Piecewise-linear lookup over [[z, v], ...] breakpoints (sorted by z).
function lerpPts(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const [z0, v0] = pts[i - 1], [z1, v1] = pts[i];
      return v0 + (v1 - v0) * ((z - z0) / Math.max(1e-6, z1 - z0));
    }
  }
  return pts[pts.length - 1][1];
}

// Lofted station hull following the measured curves EXACTLY.
//   deck : [[z, y]] hull plate top line (furniture excluded), rear -> front
//   belly: [[z, y]] plate underside (rear rake, flat belly, lower bow)
//   wUp  : [[z, halfW]] upper-band half width (sponson/fender line)
//   wLo  : [[z, halfW]] lower-band half width (between the tracks)
//   sponsonY: track-bay roof — the upper band lofts sponsonY->deck, the
//   lower band belly->sponsonY, both pinch out where the curves cross.
function loftHull(P, o) {
  const { slab } = KIT;
  const zs = [...new Set([o.deck, o.belly, o.wUp, o.wLo].flat().map((p) => p[0]))]
    .sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    if (z1 - z0 < 0.015) continue;
    const d0 = lerpPts(o.deck, z0), d1 = lerpPts(o.deck, z1);
    const b0 = lerpPts(o.belly, z0), b1 = lerpPts(o.belly, z1);
    const s0 = Math.min(o.sponsonY, d0 - 0.01), s1 = Math.min(o.sponsonY, d1 - 0.01);
    const u0 = Math.max(s0, b0), u1 = Math.max(s1, b1);
    const wu0 = lerpPts(o.wUp, z0), wu1 = lerpPts(o.wUp, z1);
    const wl0 = lerpPts(o.wLo, z0), wl1 = lerpPts(o.wLo, z1);
    if (d0 > u0 + 0.012 || d1 > u1 + 0.012) {
      P.add('hull', slab(
        [-wu1, u1, z1], [wu1, u1, z1], [wu0, u0, z0], [-wu0, u0, z0],
        [-wu1, d1, z1], [wu1, d1, z1], [wu0, d0, z0], [-wu0, d0, z0]));
    }
    if (u0 > b0 + 0.012 || u1 > b1 + 0.012) {
      P.add('hull', slab(
        [-wl1, b1, z1], [wl1, b1, z1], [wl0, b0, z0], [-wl0, b0, z0],
        [-wl1, Math.max(u1, b1), z1], [wl1, Math.max(u1, b1), z1],
        [wl0, Math.max(u0, b0), z0], [-wl0, Math.max(u0, b0), z0]));
    }
  }
}

// Measured cast dome: lathe rings [[r, y]] (y=0 at the ring base, in the
// turret frame), plan-stretched by sz = depth/width, centered (cx, cz).
function meshDome(P, rings, sz, cx = 0, cz = 0) {
  P.add('turret', KIT.lathe(rings, P.q ? 30 : 16, sz), cx, 0, cz);
}

// Dome-skin radius at height y for a measured ring profile (fitting seats).
function ringSkin(rings, y) {
  let r = rings[0][0];
  for (let i = 1; i < rings.length; i++) {
    const [r0, y0] = rings[i - 1], [r1, y1] = rings[i];
    if (y <= rings[i][1]) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
    r = r1;
  }
  return r;
}

// Gun tube as measured contour segments. segs: [[zStart, zEnd, r, r2?]] in
// gun-local z (0 at the gun pivot). Dark seam rings close each diameter
// break so sleeve/tube stages read as separate fittings (r3 language).
function tubeGun(P, segs, opts = {}) {
  const { cylZ } = KIT;
  const seg = P.q ? 24 : 12;
  for (const [z0, z1, r, r2] of segs) {
    P.add('gun', cylZ(r, z1 - z0, seg, r2 ?? r), 0, 0, (z0 + z1) / 2);
  }
  for (const ring of opts.rings || []) {
    const [z, r] = ring;
    P.add('gunDark', cylZ(r, 0.045, seg), 0, 0, z);
  }
  P.muzzleZ = opts.muzzle ?? segs[segs.length - 1][1];
}

// Sealed trunnion saddle for the Soviet slit mantlet: every piece is a body
// of revolution about the trunnion X-axis through the gun pivot, so no slot
// can open at any elevation. Root cone tapers onto the tube.
function ruSaddle(P, o) {
  const { cylX, cylZ } = KIT;
  P.addGunExtra(cylX(o.rollR, o.rollW, 14), 0, 0, 0);
  P.addGunExtra(cylZ(o.rootR ?? o.rollR * 0.62, o.rootL ?? 0.55, 12, o.tubeR * 1.25), 0, 0, (o.rootL ?? 0.55) * 0.5 + 0.05);
}
// ---------------------------------------------------------------------------
// Shared Soviet-family furniture (hull frame unless noted)
// ---------------------------------------------------------------------------

// NSVT/DShK pintle with a real cradle, receiver, finned barrel and ammo box
// (r1 bullet 8: "AA MGs are stick-blocks on posts") — turret frame.
function nsvt(P, x, y, z, shield = false) {
  const { box, cylY, cylZ } = KIT;
  P.add('turretDark', cylY(0.025, 0.032, 0.16, 8), x, y + 0.08, z);          // pintle post
  P.add('turretDark', box(0.10, 0.06, 0.16), x, y + 0.19, z);                // cradle yoke
  P.add('turretDark', box(0.09, 0.10, 0.42), x, y + 0.27, z + 0.06);         // receiver
  P.add('turretDark', cylZ(0.024, 0.55, 8), x, y + 0.28, z + 0.50, -0.06, 0, 0); // barrel
  P.add('turretDark', cylZ(0.035, 0.10, 8), x, y + 0.295, z + 0.76, -0.06, 0, 0); // flash hider
  P.add('turretDetail', box(0.09, 0.11, 0.16), x - 0.11, y + 0.24, z - 0.04); // ammo box
  if (shield) P.add('turretDetail', box(0.34, 0.22, 0.025), x, y + 0.30, z + 0.20);
}
// Thin roof mast (met mast / antenna base / pano tower stem) — turret frame.
function mast(P, x, yBase, z, yTop, r = 0.028, head = 0.11) {
  const { box } = KIT;
  const h = Math.max(0.05, yTop - yBase);
  P.add('turretDetail', box(r * 2, h, r * 2), x, yBase + h / 2, z);
  P.add('turretDark', box(head, head, head), x, yTop - head / 2, z);
}
// ---------------------------------------------------------------------------
// FROM-SCRATCH builds (curve-lofted). World frame per module header.
// ---------------------------------------------------------------------------

// Shared Russia-family dressing at measured seats.
function ruGlacisKit(P, o) {
  const { box, torus, headlight } = KIT;
  const yG = o.y, zG = o.z;                       // glacis mid reference
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(o.w * 0.30, 0.045, 0.05), s * o.w * 0.16, yG + 0.04, zG, -0.35, s * 0.25, 0);
    P.add('hullDark', box(0.10, 0.12, 0.14), s * o.w * 0.30, o.hookY ?? yG - 0.42, o.hookZ ?? zG + 0.42, -0.3, 0, 0);
    P.add('hullDetail', torus(0.085, 0.016, 10), s * o.w * 0.36, 0.50, o.eyeZ ?? zG + 0.30, Math.PI / 2, 0, 0);
  }
  headlight(P, -o.w * 0.44, yG + 0.10, zG + 0.14, -0.30, 0.05);
  headlight(P, o.w * 0.44, yG + 0.10, zG + 0.14, -0.30, 0.05);
}

// Soviet deck furniture at explicit seats: driver hatch, engine grilles.
function ruDeck(P, o) {
  const { box, cylY } = KIT;
  P.add('hull', cylY(0.24, 0.24, 0.04, 14), o.hatchX ?? 0, o.deckY + 0.025, o.hatchZ);
  P.add('hullDark', cylY(0.247, 0.247, 0.012, 14), o.hatchX ?? 0, o.deckY + 0.032, o.hatchZ);
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) - 0.16, o.deckY + 0.05, o.hatchZ + 0.30);
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) + 0.16, o.deckY + 0.05, o.hatchZ + 0.30);
  for (let i = 0; i < (o.grilles ?? 6); i++) {
    P.add('hullDark', box(o.gw ?? 1.5, 0.018, 0.075), o.gx ?? 0, o.deckY + 0.012, o.gz - i * 0.24);
    P.add('hullDetail', box(o.gw ?? 1.5, 0.028, 0.026), o.gx ?? 0, o.deckY + 0.026, o.gz - 0.12 - i * 0.24);
  }
}

// Segmented rubber skirt band with dark inset lip (r3 language, explicit y).
function ruSkirtBand(P, o) {
  const { box } = KIT;
  const panels = o.panels ?? 7;
  const panelD = (o.z1 - o.z0) / panels;
  const yMid = (o.yTop + o.yBot) / 2, h = o.yTop - o.yBot;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      const z = o.z0 + panelD * (i + 0.5);
      P.add('hull', box(0.04, h, panelD * 0.94), s * o.x, yMid, z);
      P.add('hullDark', box(0.048, h * 0.9, 0.02), s * (o.x + 0.003), yMid, z + panelD / 2);
      P.add('hullDark', KIT.cylZ(0.02, 0.016, 8), s * (o.x + 0.025), o.yTop - 0.07, z, 0, s * Math.PI / 2, 0);
    }
    P.add('hullDark', box(0.042, 0.09, (o.z1 - o.z0) * 0.98), s * (o.x - 0.002), o.yBot - 0.03, (o.z0 + o.z1) / 2);
  }
}

// Front/rear rubber mud flaps over the track runs.
function ruFlaps(P, o) {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    const xf = s * o.x;
    if (o.front) P.add('hullRubber', box(o.w, o.front[1], 0.045), xf, o.front[0], o.frontZ);
    if (o.rear) P.add('hullRubber', box(o.w, o.rear[1], 0.045), xf, o.rear[0], o.rearZ);
  }
}

// ---- T-90A (docs/references/profiles/t90a.json) ---------------------------
// r5 DIMS-FIRST: the print (safeScale 1.093) is 9.3% inflated vs published
// dims — published wins (gate doctrine). Envelope: body span -3.30..3.56
// (hullLength 6.86), thin tail rack to -3.72, muzzle +5.81 (overall 9.53),
// p95 roof 2.25 (heightM 2.23; mast + pano are the 2 spike columns). Ref
// curve targets kept wherever dims allow: deck 1.37-1.41, bustle top 2.02
// z -1.7..-1.05, crown plateau pushed to the dims ceiling, wedges to +2.3.
function buildT90A(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // v10 body-span note: the 12% filter measures top-minus-bottom PER COLUMN,
  // gaps included — every column under the gun tube (top 1.69) reads as body
  // no matter how thin the furniture below it is, and the tail drums over
  // the rear rake merge the same way. Measured budget (probe-verified):
  // rear = drums-over-rake column at -3.32, front = idler-wrap-under-gun
  // column at +3.57 -> 6.89 vs published 6.86.
  loftHull(P, {
    deck: [[-3.26, 1.30], [-3.15, 1.36], [-2.60, 1.375], [-0.60, 1.375], [0.90, 1.375], [2.20, 1.30], [3.16, 1.20], [3.44, 1.08]],
    belly: [[-3.26, 1.10], [-3.08, 0.86], [-2.86, 0.44], [-2.64, 0.32], [2.70, 0.30], [3.24, 0.62], [3.44, 1.00]],
    wUp: [[-3.24, 0.98], [-3.08, 1.30], [-2.94, 1.75], [3.44, 1.75]],
    wLo: [[-3.26, 0.88], [3.44, 1.02]],
    sponsonY: 0.86,
  });
  // fender tips held behind the loft bow (they merge with the gun band)
  for (const s of [-1, 1]) P.add('hull', box(0.64, 0.07, 0.26), s * 1.43, 0.94, 3.29);
  // deck furniture: driver hatch fwd-center, transverse engine grilles aft
  ruDeck(P, { deckY: 1.365, hatchZ: 2.35, gz: -1.9, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.5, y: 1.10, z: 3.08, eyeZ: 3.30, hookY: 0.62, hookZ: 3.36 });
  // K-5 glacis chevron rows (steel-dark rafts angled down the plate)
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.235 - row * 0.075, 2.72 + row * 0.32, -0.42, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.25, 1.30, 2.5], [0, 1.36, 1.9], [1.25, 1.30, 2.5]]);
  // thin tail rack past the rear plate (band < 12% of height, so the body
  // span holds 6.86 while the silhouette runs to the ref's -3.6..-3.75):
  // drums + stowage riding the tail at the measured ~1.58 top line.
  // v10: drum r 0.135 gave a 0.27m band — exactly the 12% threshold (rough
  // 2.21m) — so the tail read as body and hullLengthM ran +2.07%. r 0.112
  // keeps the drums 4cm under the filter with everything else on the plate.
  stowage(P, 'hull', P.rng, [[-0.85, 1.42, -3.06, 1.3, 0.14, 0.28], [0.75, 1.42, -3.06, 1.35, 0.14, 0.28]]);
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.112, 0.62, 12), s * 0.72, 1.44, -3.33);
    P.add('hullDark', cylZ(0.116, 0.03, 12), s * 0.72, 1.44, -3.13);
    P.add('hullDark', box(0.05, 0.11, 0.05), s * 0.72, 1.44, -3.38);
  }
  P.add('hullDark', cylX(0.115, 2.55, 10), 0, 1.56, -1.56);
  for (const s of [-0.5, 0.5]) P.add('hullDetail', box(0.06, 0.16, 0.09), s * 2, 1.46, -1.56);
  // log rides BETWEEN the drums at the same y-band (1.33..1.55) so the tail
  // columns keep one thin 0.22m band — stacking it lower would fuse a >12%
  // column with the drums and re-extend hullLengthM (the 7.00 lesson)
  P.add('hullWood', cylX(0.095, 2.1, 10), 0, 1.44, -3.45);
  for (const s of [-0.55, 0.55]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 1.05, 1.44, -3.45);
  // running gear: 6 dished wheels; sprocket/idler pulled inside the 6.86
  // body span (the print's rear gear is MISSING below z<-2 — packet cap)
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.385, wheelW: 0.21, wheelY: 0.455, xc: 1.44, dishR: 0.84,
    wheelZs: evenStations(6, 4.4, 0.15),
    sprocket: { z: -2.86, y: 0.86, r: 0.30 }, idler: { z: 3.08, y: 0.62, r: 0.30 },
    rollers: [-1.5, 0.15, 1.8].map((z) => ({ z, y: 0.82, r: 0.086 })),
    trackW: 0.58, topY: 0.86, botY: 0.05, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.845, z0: -3.14, z1: 3.30, yTop: 1.02, yBot: 0.50, panels: 7 });
  // K-5 heavy side plates over the front third (the ±1.885 plan course)
  widthAnchor(P, 1.89, 0.95, 0.5);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    P.add('hull', box(0.05, 0.42, 0.56), s * 1.863, 0.88, 2.62 - i * 0.60);
    P.add('hullDark', box(0.04, 0.36, 0.03), s * 1.859, 0.88, 2.34 - i * 0.60);
  }

  // ---- turret: forward-seated dome, crown plateau at the dims ceiling ----
  P.turretG.position.set(0, 1.335, 0.35);  // r3: −0.025 — kit track round lifted heightM to 2.26 vs pub 2.23 (1.39%)
  const rings = [[1.30, -0.05], [1.36, 0.10], [1.33, 0.42], [1.22, 0.62], [1.04, 0.77], [0.60, 0.87], [0.02, 0.90]];
  meshDome(P, rings, 1.15);
  const p5 = { rings, sz: 1.15 };
  eraRuCheeks(P, p5, 'k5');
  ruShtora(P, p5, 0.52);
  // left sight cluster + right TKN block, capped at the 2.26 roof ceiling
  P.add('turret', box(0.46, 0.36, 0.85), -0.86, 0.72, -0.05);
  P.add('turretGlass', box(0.30, 0.18, 0.03), -0.86, 0.74, 0.39);
  P.add('turretDark', box(0.30, 0.08, 0.34), -0.86, 0.86, 0.12);
  P.add('turret', box(0.50, 0.30, 0.60), 0.64, 0.68, -0.48);
  P.add('turret', cylY(0.17, 0.19, 0.10, 12), 0.62, 0.56, -0.40);
  P.add('turret', cylY(0.22, 0.24, 0.12, 14), -0.28, 0.80, -0.30);  // commander ring aft of the sight cluster
  P.add('turretDark', cylY(0.19, 0.19, 0.03, 12), -0.28, 0.87, -0.30);
  // pano tower right-rear + met mast left-rear (the 2 spike columns)
  P.add('turretDetail', box(0.12, 0.34, 0.12), 0.30, 0.90, -0.95);
  P.add('turretDark', cylY(0.05, 0.05, 0.16, 10), 0.30, 0.86, -0.95);
  mast(P, -0.23, 0.63, -1.35, 1.52, 0.022, 0.06);
  // NSVT on the left cluster rear, folded under the roof ceiling
  nsvt(P, -0.55, 0.55, -0.55);
  // bustle bin band across the dome rear (ref top 2.02, z -1.7..-1.05)
  P.add('turret', box(2.5, 0.58, 0.60), 0, 0.36, -1.72);
  P.add('turretDark', box(2.3, 0.42, 0.03), 0, 0.34, -2.03);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.03, 0.30, 0.03), s * 1.05, 0.26, -2.0);
  // flank stowage bins hugging the dome sides (rear-view shoulders)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.40, 1.45), s * 1.44, 0.34, -0.45, 0, s * 0.06, 0);
    P.add('turretDark', box(0.25, 0.32, 0.03), s * 1.46, 0.34, 0.05, 0, s * 0.06, 0);
  }
  // ---- gun: sealed saddle + measured tube (muzzle world +5.81) ----
  P.gunG.position.set(0, 0.216, 1.05);
  ruSaddle(P, { rollR: 0.22, rollW: 0.62, tubeR: 0.118, rootL: 0.75 });
  P.addGunExtra(box(0.56, 0.40, 0.30), 0, 0.02, 0.14);
  P.addGunExtra(box(0.46, 0.22, 1.5), 0, 0.26, 0.95);       // recoil-housing hump over the root
  P.addGunExtra(box(0.62, 0.34, 0.55), 0, -0.16, 0.42);     // mantlet chin under the root
  tubeGun(P, [
    [0.80, 3.12, 0.116], [3.12, 4.34, 0.101], [4.34, 4.54, 0.088],
  ], { rings: [[0.84, 0.118], [3.12, 0.104], [4.32, 0.09]], muzzle: 4.54 });
  P.add('gun', cylZ(0.128, 0.42, 14, 0.118), 0, 0, 3.00);   // 2A46M bore-evacuator swell at the sleeve step
  P.add('gunDark', cylZ(0.130, 0.04, 14), 0, 0, 3.22);
  const dx = ringSkin(rings, 0.34) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dx, 0.30, -0.45], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dx, 0.30, -0.45], -Math.PI / 2);
  P.topY = 0.95;
}

// ---- T-62MV-1 (docs/references/profiles/t62mv1.json) ----------------------
// hull z -4.72..+1.95 fenders ±1.56 (z -4.33..2.03); MV appliqué skirt band
// ±1.65 z -2.67..+0.17 hanging y 0.45..1.32; deck ~1.36, glacis 1.38@0.9 ->
// 0.97@1.95; rear plate overhang -4.72 (deck 1.29 belly 0.99); 5 big steel
// wheels, no return rollers; egg dome center -0.70 crown 2.36 w/ left cupola
// 2.72 @(-0.63,-0.95); U-5TS: axis 1.635, evac swell r.10 z 2.49..3.36,
// muzzle collar 4.43.., muzzle 4.755. Oracle parents its rear drums/log into
// the turret node (bergman print) — ours stay hull (documented T cap).
function buildT62MV1(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  loftHull(P, {
    deck: [[-4.69, 1.22], [-4.45, 1.28], [-4.10, 1.355], [-2.20, 1.36], [0.90, 1.375], [1.35, 1.16], [1.93, 0.97]],
    belly: [[-4.69, 1.00], [-4.50, 0.92], [-4.28, 0.90], [-4.08, 0.42], [-3.80, 0.35], [1.10, 0.35], [1.60, 0.48], [1.93, 0.93]],
    wUp: [[-4.69, 0.95], [-4.36, 1.56], [1.98, 1.56]],
    wLo: [[-4.69, 0.90], [1.93, 0.88]],
    sponsonY: 0.88,
  });
  ruDeck(P, { deckY: 1.36, hatchX: -0.55, hatchZ: 1.05, gz: -2.6, grilles: 5, gw: 1.4 });
  ruGlacisKit(P, { w: 3.1, y: 1.08, z: 1.45, eyeZ: 1.70, hookY: 0.55, hookZ: 1.76 });
  KIT.towCable(P, [[-1.15, 1.30, 0.6], [0, 1.36, 0.1], [1.15, 1.30, 0.6]]);
  // fender stowage boxes; the drum rack rides the TURRET (below, at the
  // oracle's own seat) — hull keeps only the tail log.
  stowage(P, 'hull', P.rng, [[-1.1, 1.46, -1.6, 0.34, 0.20, 1.5], [1.1, 1.46, -0.4, 0.34, 0.20, 1.9]]);
  P.add('hullWood', cylX(0.095, 1.9, 10), 0, 1.05, -4.70);
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 0.95, 1.05, -4.70);
  ruFlaps(P, { x: 1.28, w: 0.56, front: [0.70, 0.35], frontZ: 1.90 });
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.40, wheelW: 0.24, wheelY: 0.46, xc: 1.28, dishR: 0.88,
    wheelZs: [1.0, -0.1, -1.2, -2.3, -3.38],
    sprocket: { z: -4.05, y: 0.62, r: 0.31 }, idler: { z: 1.60, y: 0.55, r: 0.32 },
    rollers: [], trackW: 0.55, topY: 0.87, botY: 0.05, paintedEnds: true, coveredTop: false, arms: true,
  });
  // MV appliqué skirt band over the mid run only (deep rubber-armor panels)
  widthAnchor(P, 1.65, 0.9, -1.2);
  ruSkirtBand(P, { x: 1.615, z0: -2.67, z1: 0.17, yTop: 1.30, yBot: 0.48, panels: 4 });

  // ---- turret: measured egg dome, rear-left cupola, K-1 cheek rafts ----
  // r5: crown raised to the published-height ceiling (p95 roof 2.42 ->
  // heightM 2.39 vs 2.40 published); the print's 2.54-2.79 cluster plateau
  // is above the published envelope — packet cap on the difference.
  P.turretG.position.set(0, 1.38, -0.70);
  const rings = [[1.28, -0.03], [1.34, 0.10], [1.30, 0.38], [1.14, 0.66], [0.86, 0.87], [0.44, 0.98], [0.02, 1.02]];
  meshDome(P, rings, 0.95, 0, -0.06);
  const pD = { rings, sz: 0.95 };
  eraRuCheeks(P, pD, 'k1');
  // roof clutter slab holding the crown plateau at the dims ceiling
  P.add('turret', box(1.35, 0.14, 1.25), 0, 0.935, -0.30);
  P.add('turretDark', box(1.05, 0.02, 0.95), 0, 1.015, -0.30);
  // canvas stowage bundle hugging the dome rear slope
  P.add('turretCloth', box(1.35, 0.35, 0.5), 0, 0.42, -1.32, 0.28, 0, 0);
  P.add('turret', box(1.5, 0.30, 0.55), 0, 0.20, -1.30);               // bustle shelf under it
  // ORACLE-PARITY: the print parents its rear drum rack into the Turret
  // node (world seat z -4.0..-4.75). Matched here — with real support rails
  // back from the dome so the rack stays one island at every yaw (floater
  // gate); drums band-thin so the published hull span holds.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.06, 2.55), s * 0.55, 0.30, -2.42);  // rack rails to the dome rear
  }
  for (const s of [-1, 0, 1]) {
    P.add('turret', cylZ(0.16, 0.70, 12), s * 0.62, 0.24, -3.58);
    P.add('turretDark', cylZ(0.164, 0.03, 12), s * 0.62, 0.24, -3.35);
  }
  P.add('turretDetail', box(1.65, 0.05, 0.05), 0, 0.30, -3.90);         // rack cross rail
  // commander cupola rear-left + loader hatch right (lids at the ceiling,
  // cupola periscope is the single spike column)
  P.add('turret', cylY(0.20, 0.22, 0.12, 14), -0.63, 0.90, -0.28);
  P.add('turret', cylY(0.17, 0.17, 0.05, 14), -0.63, 0.985, -0.28);
  P.add('turretDark', box(0.30, 0.016, 0.03), -0.63, 1.02, -0.28);
  KIT.periscope(P, 'turretDetail', -0.63, 1.05, -0.10);
  P.add('turret', cylY(0.21, 0.22, 0.08, 14), 0.55, 0.86, -0.30);
  P.add('turretDark', cylY(0.185, 0.185, 0.02, 12), 0.55, 0.915, -0.30);
  P.add('turret', KIT.sph(0.12, 12, Math.PI / 2), 0.20, 0.90, 0.18);    // loader vent dome
  nsvt(P, 0.55, 0.68, -0.55);
  // KTD-2 rangefinder over the root + Luna IR searchlight high on the right
  // cheek (the measured 2.3 plateau out to x 1.1)
  P.addGunExtra(box(0.34, 0.13, 0.40), 0, 0.19, 0.42);
  P.add('turret', box(0.36, 0.34, 0.34), 0.80, 0.72, 0.55, 0, 0.35, 0);
  P.add('turretGlass', box(0.24, 0.24, 0.02), 0.86, 0.72, 0.72, 0, 0.35, 0);
  P.add('turretDetail', box(0.04, 0.18, 0.04), 0.78, 0.50, 0.50);
  P.add('turret', box(0.30, 0.26, 0.30), 1.02, 0.55, 0.16, 0, 0.2, 0);  // IR housing beside it
  domeRailRu(P, rings, 0.91, 0.30, 1.0);
  // ---- U-5TS: sealed saddle + measured contour ----
  P.gunG.position.set(0, 0.255, 1.00);
  ruSaddle(P, { rollR: 0.19, rollW: 0.55, tubeR: 0.085, rootL: 0.55 });
  P.addGunExtra(box(0.50, 0.26, 0.40), 0, -0.14, 0.16);     // cast chin under the mantlet
  tubeGun(P, [
    [0.55, 2.09, 0.081], [2.09, 2.92, 0.10], [2.92, 3.93, 0.081], [3.93, 4.24, 0.091],
  ], { rings: [[2.09, 0.102], [2.92, 0.102], [3.93, 0.093]], muzzle: 4.24 });
  const dx = ringSkin(rings, 0.45) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dx * 0.98, 0.42, -0.55], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dx * 0.98, 0.42, -0.55], -Math.PI / 2);
  P.topY = 1.15;
}

// ---- T-90A "Vladimir" recovered print (profiles/t90a_vladimir.json) -------
// Aft-shifted frame: hull z -5.20..+2.61, crew deck ~1.66, engine deck 1.76,
// glacis -> 1.28@2.62; oracle parents a full-width stowage STACK (top 2.31,
// z -2.84..-0.94) and the tail drum rack (-4.5..-5.35) into the hull. Dome
// crown 2.32 center trough with left sight block 2.92, pano 3.10 @ +0.39,
// met mast 3.81 @ (-0.24, -2.25), tall rear bin stack to 3.1 on the turret.
// Tube: axis 1.92, sleeve r.105 -> 4.2, muzzle 5.15.
function buildT90AVladimir(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.86 hull / 9.53 overall / 2.23 roof. The
  // print is +14% long, +34% tall (safeScale 1.31 — the worst in the
  // family) — hull cut to -4.22..2.64, all roof furniture under 2.26.
  loftHull(P, {
    deck: [[-4.22, 1.58], [-4.12, 1.66], [-3.10, 1.66], [-2.88, 1.60], [-0.80, 1.58], [0.60, 1.54], [1.30, 1.46], [2.10, 1.36], [2.62, 1.26]],
    belly: [[-4.22, 0.66], [-3.90, 0.54], [-3.25, 0.24], [-2.95, 0.17], [1.45, 0.17], [1.80, 0.24], [2.35, 0.80], [2.62, 1.04]],
    wUp: [[-4.20, 1.30], [-3.94, 1.815], [2.05, 1.815], [2.60, 1.05]],
    wLo: [[-4.20, 0.90], [2.62, 0.88]],
    sponsonY: 0.95,
  });
  // oracle hull-parented mid stack, folded under the published roof
  P.add('hull', box(2.96, 0.44, 1.80), 0, 1.90, -1.89);
  P.add('hullCloth', box(2.98, 0.13, 1.82), 0, 2.145, -1.89);
  for (const f of [-0.6, 0, 0.6]) P.add('hullDark', box(3.0, 0.46, 0.03), 0, 1.93, -1.89 + f);
  // band-thin tail rack: drums + bins past the cut rear plate
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.14, 0.62, 12), s * 0.62, 1.60, -4.58);
    P.add('hullDark', cylZ(0.144, 0.03, 12), s * 0.62, 1.60, -4.37);
    P.add('hullDark', box(0.05, 0.13, 0.05), s * 0.62, 1.60, -4.72);
  }
  stowage(P, 'hull', P.rng, [[0, 1.62, -4.50, 1.5, 0.18, 0.45]]);
  P.add('hull', box(2.5, 0.44, 0.1), 0, 1.42, -4.18);                   // rack back plate
  ruDeck(P, { deckY: 1.58, hatchZ: 1.62, gz: -3.15, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.6, y: 1.38, z: 2.36, eyeZ: 2.5, hookY: 1.02, hookZ: 2.55 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.42 - row * 0.075, 1.62 + row * 0.32, -0.40, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.30, 1.60, 1.2], [0, 1.66, 0.6], [1.30, 1.60, 1.2]]);
  ruFlaps(P, { x: 1.50, w: 0.60, front: [0.85, 1.10], frontZ: 2.62 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.21, wheelY: 0.50, xc: 1.47, dishR: 0.84,
    wheelZs: evenStations(6, 4.5, -0.70),
    sprocket: { z: -3.70, y: 0.68, r: 0.28 }, idler: { z: 2.05, y: 0.68, r: 0.28 },
    rollers: [-2.4, -0.70, 0.9].map((z) => ({ z, y: 0.88, r: 0.086 })),
    trackW: 0.58, topY: 0.92, botY: 0.15, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.845, z0: -4.15, z1: 2.30, yTop: 1.36, yBot: 0.68, panels: 7 });
  widthAnchor(P, 1.89, 1.0, 0.3);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hull', box(0.05, 0.46, 0.56), s * 1.858, 1.10, 1.85 - i * 0.60);
    P.add('hullDark', box(0.04, 0.40, 0.03), s * 1.862, 1.10, 1.57 - i * 0.60);
  }

  // ---- turret: low crown dome + roof cluster folded to the 2.26 ceiling
  // (the print's 2.9-3.1 cluster/bins are a packet cap) ----
  P.turretG.position.set(0, 1.58, -0.50);
  const rings = [[1.30, -0.02], [1.38, 0.12], [1.30, 0.40], [1.05, 0.56], [0.60, 0.65], [0.02, 0.68]];
  meshDome(P, rings, 0.85);
  const p5 = { rings, sz: 0.85, k5Len: 1.2, k5Y: 0.14 };
  eraRuCheeks(P, p5, 'k5');
  ruShtora(P, p5, 0.32);
  // left sight block + commander ring + pano tower right (pano = spike col)
  P.add('turret', box(0.52, 0.40, 0.62), -0.95, 0.46, -0.05);
  P.add('turretGlass', box(0.32, 0.20, 0.03), -0.95, 0.50, 0.37);
  P.add('turret', cylY(0.24, 0.26, 0.12, 14), -0.35, 0.56, -0.45);
  P.add('turretDetail', box(0.15, 0.46, 0.15), 0.39, 0.44, -0.35);
  P.add('turretDark', cylY(0.05, 0.05, 0.14, 10), 0.39, 0.595, -0.35);
  nsvt(P, -0.30, 0.34, -0.35);
  // rear bin stack + basket, folded under the roofline
  P.add('turret', box(0.92, 0.56, 1.05), -0.72, 0.36, -1.10);
  P.add('turretDark', box(0.94, 0.46, 0.03), -0.72, 0.36, -1.63);
  P.add('turret', box(0.85, 0.50, 1.05), 0.62, 0.34, -1.10);
  for (const y of [0.50, 0.64]) {
    P.add('turretDetail', box(2.1, 0.035, 0.035), 0, y, -1.62);
    for (const s of [-1, 0.02, 1]) P.add('turretDetail', box(0.035, y > 0.6 ? 0.0 : 0.42, 0.035), s * 1.0, 0.30, -1.62);
  }
  mast(P, -0.24, 0.64, -1.45, 1.34, 0.024, 0.06);
  P.add('turretDetail', box(0.30, 0.03, 0.03), -0.24, 1.28, -1.45);
  // ---- 2A46M: sealed saddle + measured tube ----
  P.gunG.position.set(0, 0.26, 1.15);
  ruSaddle(P, { rollR: 0.21, rollW: 0.60, tubeR: 0.108, rootL: 0.70 });
  P.addGunExtra(box(0.54, 0.38, 0.30), 0, 0.02, 0.14);
  P.addGunExtra(box(0.44, 0.20, 1.1), 0, 0.25, 0.75);
  tubeGun(P, [
    [0.75, 3.07, 0.107], [3.07, 3.76, 0.096], [3.76, 3.99, 0.089],
  ], { rings: [[0.79, 0.107], [3.07, 0.098], [3.74, 0.09]], muzzle: 3.99 });
  P.add('gun', cylZ(0.118, 0.40, 14, 0.108), 0, 0, 3.00);
  P.add('gunDark', cylZ(0.120, 0.04, 14), 0, 0, 3.21);
  const dxV = ringSkin(rings, 0.32) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxV, 0.28, -0.35], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxV, 0.28, -0.35], -Math.PI / 2);
  P.topY = 1.45;
}

// ---- T-64BV-1 (docs/references/profiles/t64bv1.json) ----------------------
// hull z -4.30..+1.71 (6.0 m), deck 1.21, rear step 1.02 @ -3.9, glacis ->
// 0.94@1.71; slab sides ±1.70 full length; 6 small wheels + 4 rollers, rear
// sprocket; dome center -0.6 crown ~2.02 w/ left cupola 2.29; K-1 cheeks;
// 125 mm at axis 1.466, evac swell z 2.11..3.01, muzzle 4.312. The bergman
// print parents its rear drum/log rack into the Turret node — matched here
// (same world seats) so the component masks compare like for like.
function buildT64BV1(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.54 hull / 9.23 overall / 2.17 roof — the
  // print is 6-9% SHORT, so the build extends past it (tail -4.53, bow
  // 1.99, muzzle 4.70) and the roof plateau rides the 2.19 ceiling.
  loftHull(P, {
    deck: [[-4.53, 0.96], [-4.40, 1.04], [-3.72, 1.04], [-3.62, 1.26], [-3.30, 1.27], [0.30, 1.27], [0.91, 1.19], [1.51, 1.12], [1.99, 0.96]],
    belly: [[-4.53, 0.78], [-4.28, 0.42], [-3.78, 0.20], [-3.45, 0.16], [1.05, 0.16], [1.45, 0.24], [1.99, 0.60]],
    wUp: [[-4.53, 1.62], [-4.22, 1.685], [1.70, 1.685], [1.99, 1.58]],
    wLo: [[-4.53, 0.86], [1.99, 0.84]],
    sponsonY: 0.82,
  });
  ruDeck(P, { deckY: 1.27, hatchZ: 0.85, gz: -2.4, grilles: 5, gw: 1.4 });
  ruGlacisKit(P, { w: 3.2, y: 1.06, z: 1.45, eyeZ: 1.75, hookY: 0.48, hookZ: 1.82 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.62, 0.07, 0.26), s * 0.36, 1.14 - row * 0.07, 1.20 + row * 0.28, -0.35, s * 0.32, 0);
  }
  KIT.towCable(P, [[-1.05, 1.21, 0.4], [0, 1.27, -0.1], [1.05, 1.21, 0.4]]);
  P.add('hullDark', box(0.16, 0.10, 0.85), -1.45, 1.33, -2.5);          // left exhaust duct
  stowage(P, 'hull', P.rng, [[1.05, 1.31, -0.9, 0.30, 0.13, 1.4], [-1.05, 1.31, -1.7, 0.30, 0.12, 1.1]]);
  ruFlaps(P, { x: 1.40, w: 0.56, front: [0.55, 0.55], frontZ: 2.0 });
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.285, wheelW: 0.20, wheelY: 0.34, xc: 1.32, dishR: 0.88,
    wheelZs: evenStations(6, 4.2, -1.15),
    sprocket: { z: -4.10, y: 0.56, r: 0.26 }, idler: { z: 1.55, y: 0.52, r: 0.26 },
    rollers: [-2.8, -1.65, -0.5, 0.65].map((z) => ({ z, y: 0.78, r: 0.07 })),
    trackW: 0.55, topY: 0.82, botY: 0.04, paintedEnds: true, coveredTop: true, arms: true,
  });
  widthAnchor(P, 1.71, 0.9, -1.0);
  ruSkirtBand(P, { x: 1.668, z0: -4.50, z1: 1.95, yTop: 1.16, yBot: 0.60, panels: 7 });

  // ---- turret: small egg dome + K-1 + left cupola (roof at 2.17-2.19) ----
  P.turretG.position.set(0, 1.20, -1.00);
  const rings = [[1.22, -0.03], [1.28, 0.10], [1.25, 0.36], [1.10, 0.62], [0.80, 0.84], [0.40, 0.94], [0.02, 0.97]];
  meshDome(P, rings, 0.81);
  const pD = { rings, sz: 0.81, k1Y: 0.12 };
  eraRuCheeks(P, pD, 'k1');
  // roof clutter plateau at the published-roof ceiling
  P.add('turret', box(1.15, 0.10, 1.05), 0, 0.90, -0.25);
  P.add('turretDark', box(0.90, 0.02, 0.80), 0, 0.955, -0.25);
  // oracle turret-parented rear rack: drums high over the aft deck + log
  for (const s of [-1, 1]) {
    P.add('turret', cylZ(0.17, 0.80, 12), s * 0.66, 0.56, -1.85);
    P.add('turretDark', cylZ(0.174, 0.03, 12), s * 0.66, 0.56, -1.60);
    P.add('turretDark', box(0.05, 0.26, 0.06), s * 0.66, 0.40, -1.75);
  }
  P.add('turretDetail', box(1.75, 0.045, 0.045), 0, 0.40, -2.20);
  P.add('turretDark', KIT.cylX(0.09, 1.7, 10), 0, 0.30, -2.30);        // log on the rack (oracle: turret node)
  // commander cupola rear-left + right sight cluster (lids at the ceiling,
  // cupola periscope is the spike column)
  P.add('turret', cylY(0.21, 0.23, 0.14, 14), -0.82, 0.90, -0.10);
  P.add('turret', cylY(0.17, 0.17, 0.05, 14), -0.82, 0.965, -0.10);
  P.add('turretDark', box(0.30, 0.016, 0.03), -0.82, 0.995, -0.10);
  KIT.periscope(P, 'turretDetail', -0.82, 1.03, 0.11);
  P.add('turret', box(0.34, 0.30, 0.36), 0.10, 0.82, 0.10);
  P.add('turretDark', box(0.22, 0.20, 0.05), 0.10, 0.84, 0.30);
  nsvt(P, -0.45, 0.62, -0.35);
  P.add('turret', KIT.sph(0.12, 12, Math.PI / 2), 0.45, 0.84, 0.45);
  domeRailRu(P, rings, 0.81, 0.30, 0.9);
  // ---- 125 mm 2A46-2: sealed saddle + measured contour ----
  P.gunG.position.set(0, 0.265, 1.10);
  ruSaddle(P, { rollR: 0.20, rollW: 0.55, tubeR: 0.096, rootL: 0.6 });
  P.addGunExtra(box(0.30, 0.14, 0.36), 0, 0.20, 0.55);                  // KTD hood
  P.addGunExtra(box(0.48, 0.24, 0.38), 0, -0.13, 0.15);
  tubeGun(P, [
    [0.55, 2.11, 0.094], [2.11, 3.13, 0.10], [3.13, 4.36, 0.094], [4.36, 4.60, 0.088],
  ], { rings: [[2.11, 0.102], [3.13, 0.102], [4.36, 0.096]], muzzle: 4.60 });
  const dx4 = ringSkin(rings, 0.38) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [dx4 * 0.99, 0.36, -0.5], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-dx4 * 0.99, 0.36, -0.5], -Math.PI / 2);
  P.topY = 1.0;
}

// ---- PT-91M Pendekar (docs/references/profiles/pt91m.json) ----------------
// Centered frame: hull ±3.85, deck 1.81, tall powerpack stack (±0.9 wide,
// steps 2.02/2.16) over the raised tail, glacis -> 1.44@3.80; skirts ±1.735
// with ERAWA plates ±1.79 on the front half; dome crown ~2.33 center 0.18,
// left cluster 2.64, pano 2.85, met mast 3.82 @ (-0.25, -1.0); tube axis
// 2.008, sleeve r.122, muzzle 6.58.
function buildPT91M(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.86 hull / 9.53 overall / 2.19 roof / 3.59
  // wide. Print is +12% long, +27% tall in the p95 — cut to -3.42..3.44,
  // turret ring dropped to 1.63 with the crown at 2.21.
  loftHull(P, {
    deck: [[-3.42, 1.55], [-3.32, 1.66], [-2.72, 1.68], [2.00, 1.66], [2.60, 1.56], [3.05, 1.50], [3.44, 1.40]],
    belly: [[-3.42, 1.35], [-3.10, 1.20], [-2.85, 0.90], [-2.45, 0.48], [-2.05, 0.19], [2.40, 0.19], [2.90, 0.42], [3.44, 1.02]],
    wUp: [[-3.42, 1.10], [-3.16, 1.755], [3.10, 1.755], [3.44, 1.48]],
    wLo: [[-3.42, 0.92], [3.44, 0.88]],
    sponsonY: 0.92,
  });
  // Malaysian powerpack stack: two-step hump on the rear deck + louvers
  P.add('hull', box(1.85, 0.26, 0.95), 0, 1.83, -2.92);
  P.add('hull', box(1.6, 0.13, 1.6), 0, 1.78, -2.55);
  P.add('hull', box(1.7, 0.44, 0.3), 0, 1.62, -3.28);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(1.5, 0.025, 0.10), 0, 1.86, -2.10 - i * 0.22);
  stowage(P, 'hull', P.rng, [[-0.9, 1.76, -1.9, 0.8, 0.15, 0.8], [0.95, 1.76, -2.0, 0.7, 0.15, 0.7]]);
  ruDeck(P, { deckY: 1.665, hatchZ: 2.35, gz: -1.15, grilles: 4, gw: 1.5 });
  ruGlacisKit(P, { w: 3.45, y: 1.44, z: 2.90, eyeZ: 3.22, hookY: 1.05, hookZ: 3.36 });
  // ERAWA-1 tile field on the glacis (regular flat tiles, steel-dark)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    P.add('hullTrack', box(0.27, 0.05, 0.25), -0.72 + c * 0.29, 1.58 - r * 0.055, 2.30 + r * 0.26, -0.32, 0, 0);
  }
  KIT.towCable(P, [[-1.28, 1.60, 2.1], [0, 1.66, 1.6], [1.28, 1.60, 2.1]]);
  ruFlaps(P, { x: 1.42, w: 0.60, front: [0.85, 0.7], frontZ: 3.42 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.21, wheelY: 0.53, xc: 1.42, dishR: 0.84,
    wheelZs: evenStations(6, 4.7, 0.1),
    sprocket: { z: -2.90, y: 0.76, r: 0.31 }, idler: { z: 3.10, y: 0.68, r: 0.29 },
    rollers: [-1.55, 0.1, 1.7].map((z) => ({ z, y: 0.90, r: 0.086 })),
    trackW: 0.58, topY: 0.94, botY: 0.15, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.76, z0: -3.30, z1: 3.30, yTop: 1.30, yBot: 0.68, panels: 7 });
  // ERAWA skirt plates over the front half (the ±1.79 course)
  widthAnchor(P, 1.795, 1.0, 0.5);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    P.add('hullTrack', box(0.045, 0.44, 0.52), s * 1.77, 1.02, 2.30 - i * 0.56);
  }

  // ---- turret: ERAWA dome + Malaysian roof suite (roof at 2.21) ----
  P.turretG.position.set(0, 1.63, 0.18);
  const rings = [[1.40, -0.02], [1.47, 0.10], [1.40, 0.32], [1.15, 0.45], [0.70, 0.54], [0.02, 0.57]];
  meshDome(P, rings, 1.12);
  const pD = { rings, sz: 1.12 };
  eraRuCheeks(P, pD, 'erawa');
  // left sight cluster + commander ring + pano tower + OBRA corner sensors
  P.add('turret', box(0.52, 0.38, 0.60), -0.48, 0.36, 0.10);
  P.add('turretGlass', box(0.30, 0.18, 0.03), -0.48, 0.40, 0.41);
  P.add('turret', cylY(0.23, 0.25, 0.12, 14), -0.42, 0.42, -0.62);
  P.add('turretDetail', box(0.13, 0.44, 0.13), 0.35, 0.36, -0.30);
  P.add('turretDark', cylY(0.05, 0.05, 0.12, 10), 0.35, 0.50, -0.30);
  nsvt(P, 0.55, 0.22, -0.60);
  for (const s of [-1, 1]) P.add('turretDark', box(0.15, 0.13, 0.15), s * 1.10, 0.28, -0.72);
  mast(P, -0.25, 0.42, -1.18, 1.30, 0.024, 0.09);
  P.add('turretDetail', box(0.32, 0.03, 0.03), -0.25, 1.16, -1.18);
  // bustle basket ring
  P.add('turret', box(2.2, 0.34, 0.7), 0, 0.24, -1.45);
  P.add('turretDark', box(2.1, 0.26, 0.03), 0, 0.24, -1.82);
  // ---- 125 mm 2A46MS: sealed saddle + measured tube ----
  P.gunG.position.set(0, 0.29, 0.85);
  ruSaddle(P, { rollR: 0.22, rollW: 0.62, tubeR: 0.124, rootL: 0.7 });
  P.addGunExtra(box(0.55, 0.40, 0.30), 0, 0.02, 0.15);
  P.addGunExtra(box(0.45, 0.18, 1.0), 0, 0.15, 0.72);
  P.addGunExtra(box(0.32, 0.50, 0.42), 0, -0.42, 0.28);   // deep cradle chin (oracle center column)
  tubeGun(P, [
    [0.85, 3.22, 0.122], [3.22, 4.85, 0.101], [4.85, 5.06, 0.09],
  ], { rings: [[0.89, 0.124], [3.22, 0.104], [4.83, 0.092]], muzzle: 5.06 });
  P.add('gun', cylZ(0.134, 0.44, 14, 0.122), 0, 0, 3.16);
  P.add('gunDark', cylZ(0.136, 0.04, 14), 0, 0, 3.38);
  const dxP = ringSkin(rings, 0.30) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxP, 0.26, -0.5], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxP, 0.26, -0.5], -Math.PI / 2);
  P.topY = 1.30;
}


// Invisible width anchor: sub-pixel studs at the exact normalized half-width
// (is7 precedent) so safeScale stays 1.0 and authored heights hold.
function widthAnchor(P, halfW, y, z) {
  for (const s of [-1, 1]) P.add('hull', KIT.box(0.012, 0.02, 0.02), s * (halfW - 0.006), y, z);
}

// ---- T-72B obr.1987 (profiles/t72b_1987.json) ------------------------------
// Aft frame: hull -4.84..+2.43, deck 1.56-1.61, tail rack to 1.74 (drums+log
// on the plate), glacis 1.42@1.1 -> 1.13@2.43; Super-Dolly dome center -0.7
// crown ~2.55 w/ left cluster, 902B bank LEFT cheek, K-1 rafts; 2A46M axis
// 1.75, evac swell r.119 z 2.65..3.53, muzzle 4.852.
function buildT72B87(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.67 hull / 9.53 overall / 2.23 roof. Print is
  // +9% long in the hull — tail cut to -4.21 with a band-thin drum rack
  // carrying the silhouette to the ref's -4.9; roof capped at 2.26.
  loftHull(P, {
    deck: [[-4.16, 1.38], [-4.06, 1.46], [-3.60, 1.47], [-2.90, 1.48], [-1.20, 1.48], [0.42, 1.46], [1.11, 1.40], [1.90, 1.30], [2.40, 1.10]],
    belly: [[-4.16, 1.14], [-3.96, 0.94], [-3.68, 0.60], [-3.32, 0.28], [-3.02, 0.15], [1.50, 0.15], [1.95, 0.30], [2.40, 0.88]],
    wUp: [[-4.14, 0.92], [-3.96, 1.36], [-3.76, 1.765], [2.10, 1.765], [2.40, 1.50]],
    wLo: [[-4.14, 0.88], [2.40, 0.86]],
    sponsonY: 0.90,
  });
  widthAnchor(P, 1.795, 0.95, -0.5);
  ruDeck(P, { deckY: 1.475, hatchZ: 1.05, gz: -2.9, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.3, y: 1.22, z: 1.85, eyeZ: 2.15, hookY: 0.68, hookZ: 2.25 });
  KIT.towCable(P, [[-1.2, 1.38, 1.3], [0, 1.46, 0.8], [1.2, 1.38, 1.3]]);
  // OPVT snorkel hump + band-thin tail drum rack past the cut rear plate
  P.add('hullDark', cylX(0.115, 2.4, 10), 0, 1.56, -0.24);
  for (const s of [-0.45, 0.45]) P.add('hullDetail', box(0.06, 0.14, 0.09), s * 1.9, 1.48, -0.24);
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.14, 0.60, 12), s * 0.66, 1.60, -4.42);
    P.add('hullDark', cylZ(0.144, 0.03, 12), s * 0.66, 1.60, -4.22);
    P.add('hullDark', box(0.05, 0.13, 0.05), s * 0.66, 1.60, -4.56);
  }
  P.add('hullWood', cylX(0.095, 2.0, 10), 0, 1.60, -4.80);   // log rides the drum band (thin-tail rule)
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 1.0, 1.60, -4.80);
  stowage(P, 'hull', P.rng, [[-1.2, 1.56, -1.6, 0.32, 0.18, 1.4], [1.2, 1.56, -0.6, 0.32, 0.18, 1.6]]);
  ruFlaps(P, { x: 1.46, w: 0.60, front: [0.62, 0.55], frontZ: 2.40 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.21, wheelY: 0.46, xc: 1.45, dishR: 0.84,
    wheelZs: evenStations(6, 4.45, -0.75),
    sprocket: { z: -3.65, y: 0.75, r: 0.31 }, idler: { z: 2.10, y: 0.62, r: 0.29 },
    rollers: [-2.4, -0.75, 0.9].map((z) => ({ z, y: 0.86, r: 0.086 })),
    trackW: 0.58, topY: 0.90, botY: 0.075, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.75, z0: -4.15, z1: 2.10, yTop: 1.30, yBot: 0.60, panels: 7 });

  // ---- turret: Super-Dolly dome + K-1 + 902B left bank (roof at 2.26) ----
  P.turretG.position.set(0, 1.455, -0.70); // r3: −0.015 — heightM 2.25 vs pub 2.23 (1.02%) after the kit track round
  const rings = [[1.30, -0.03], [1.36, 0.10], [1.31, 0.36], [1.16, 0.56], [0.86, 0.70], [0.42, 0.755], [0.02, 0.77]];
  meshDome(P, rings, 0.82);
  const pD = { rings, sz: 0.82, k1Y: 0.10, k1Pitch: 0.24 };
  eraRuCheeks(P, pD, 'k1');
  // 902B six-tube bank seated ON the left cheek skin (mount rail bridges
  // the bank to the casting so no pose strands it)
  P.add('turret', box(0.60, 0.06, 0.34), -0.98, 0.42, 0.42, 0, -0.55, 0);
  for (let i = 0; i < 6; i++) {
    P.add('turretDark', cylZ(0.042, 0.30, 8), -0.80 - i * 0.065, 0.46 + (i % 2) * 0.02, 0.70 - i * 0.075, -0.45, -0.28, 0);
  }
  P.add('turret', box(0.30, 0.28, 0.26), 0.66, 0.44, 0.86, 0, 0.25, 0);
  P.add('turretGlass', box(0.20, 0.18, 0.02), 0.70, 0.46, 0.99, 0, 0.25, 0);
  P.add('turret', box(0.34, 0.30, 0.38), -0.55, 0.62, 0.15);
  P.add('turretGlass', box(0.22, 0.14, 0.03), -0.55, 0.66, 0.35);
  P.add('turret', cylY(0.22, 0.24, 0.12, 14), -0.45, 0.70, -0.42);
  nsvt(P, -0.45, 0.44, -0.60);
  P.add('turret', cylY(0.19, 0.20, 0.08, 12), 0.52, 0.72, -0.35);
  P.add('turretDark', cylY(0.165, 0.165, 0.02, 12), 0.52, 0.775, -0.35);
  mast(P, -0.40, 0.72, -0.40, 1.28, 0.022, 0.06);
  // rear deck bins riding the turret rear (bustle band)
  P.add('turret', box(2.15, 0.42, 0.85), 0, 0.30, -1.60);
  P.add('turretDark', box(2.0, 0.32, 0.03), 0, 0.30, -2.04);
  P.add('turretCloth', box(1.6, 0.22, 0.6), 0.1, 0.56, -1.55);
  // whip antenna rooted in the bustle bin, near-vertical (single spike col)
  P.add('turretDetail', box(0.03, 1.05, 0.03), -0.35, 0.95, -1.35, -0.08, 0, 0.06);
  domeRailRu(P, rings, 0.82, 0.40, 1.1);
  // ---- 2A46M ----
  P.gunG.position.set(0, 0.19, 1.00);
  ruSaddle(P, { rollR: 0.20, rollW: 0.58, tubeR: 0.10, rootL: 0.65 });
  P.addGunExtra(box(0.50, 0.26, 0.42), 0, -0.13, 0.18);
  tubeGun(P, [
    [0.60, 2.22, 0.098], [2.22, 3.08, 0.117], [3.08, 4.31, 0.098],
  ], { rings: [[2.22, 0.119], [3.08, 0.119], [4.10, 0.10]], muzzle: 4.31 });
  const dxB = ringSkin(rings, 0.42) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxB * 0.99, 0.40, -0.5], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxB * 0.99, 0.40, -0.5], -Math.PI / 2);
  P.topY = 1.2;
}

// ---- T-72B3M obr.2022 (profiles/t72b3m.json) -------------------------------
// Aft frame: hull -4.56..+2.27, deck 1.36-1.39 with a raised soft-stowage
// band 1.94 (z -2.7..-1.4, oracle hull-parented), tail slat shelf 1.53; dome
// center -0.5 crown ~2.35 under the Sosna-U tower (3.05) / mast 3.40; Relikt
// cassettes + soft-bag skirts; 2A46M-5 axis 1.679, muzzle 4.792.
function buildT72B3M(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.67 hull / 9.53 overall / 2.23 roof / 3.59
  // wide. Print length is near-true (+2.4%) but its Sosna tower/roof ride
  // 0.5-1.1 over the published envelope — everything folded under 2.26.
  loftHull(P, {
    deck: [[-4.36, 1.30], [-4.26, 1.37], [-3.30, 1.37], [-2.90, 1.385], [-0.80, 1.39], [0.48, 1.34], [1.11, 1.28], [1.74, 1.22], [2.27, 1.08]],
    belly: [[-4.36, 0.86], [-3.96, 0.55], [-3.48, 0.25], [-3.08, 0.11], [1.50, 0.11], [1.85, 0.28], [2.27, 0.70]],
    wUp: [[-4.34, 0.95], [-4.12, 1.765], [1.95, 1.765], [2.27, 1.45]],
    wLo: [[-4.34, 0.88], [2.27, 0.86]],
    sponsonY: 0.88,
  });
  widthAnchor(P, 1.795, 0.95, -0.5);
  // oracle hull-parented soft stowage band over the engine deck
  P.add('hull', box(2.9, 0.42, 1.30), 0, 1.70, -2.05);
  P.add('hullCloth', box(2.92, 0.16, 1.32), 0, 1.94, -2.05);
  for (const f of [-0.45, 0.15, 0.55]) P.add('hullDark', box(2.94, 0.46, 0.03), 0, 1.72, -2.05 + f);
  P.add('hullDark', box(2.6, 0.26, 0.05), 0, 1.32, -4.55);              // rear slat shelf (band-thin past the plate)
  ruDeck(P, { deckY: 1.38, hatchZ: 0.95, gz: -2.95, grilles: 4, gw: 1.4 });
  ruGlacisKit(P, { w: 3.3, y: 1.16, z: 1.70, eyeZ: 1.95, hookY: 0.60, hookZ: 2.05 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.70, 0.075, 0.28), s * 0.40, 1.24 - row * 0.07, 1.30 + row * 0.30, -0.38, s * 0.34, 0);
  }
  KIT.towCable(P, [[-1.2, 1.28, 1.0], [0, 1.34, 0.5], [1.2, 1.28, 1.0]]);
  // v10: ANY column under the gun tube reads as body (top≈1.78 minus flap
  // bottom clears the 12% filter no matter the flap height) — the flap face
  // IS the measured bow. frontZ 2.29 puts the body front at 2.31 so
  // -4.36..2.31 = the published 6.67 exactly.
  ruFlaps(P, { x: 1.46, w: 0.60, front: [0.55, 0.50], frontZ: 2.29 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.21, wheelY: 0.45, xc: 1.45, dishR: 0.84,
    wheelZs: evenStations(6, 4.3, -1.0),
    // v10: idler wrap+pads reach z+r+0.15 and read as body under the gun —
    // 1.95/0.28 put the measured bow at 2.38 (hullLengthM +1.21%); 1.90/0.26
    // ends the wrap at the published 6.67 body line.
    sprocket: { z: -3.75, y: 0.72, r: 0.30 }, idler: { z: 1.90, y: 0.60, r: 0.26 },
    rollers: [-2.5, -0.95, 0.6].map((z) => ({ z, y: 0.82, r: 0.086 })),
    trackW: 0.58, topY: 0.86, botY: 0.045, paintedEnds: true, coveredTop: true, arms: true,
  });
  // Relikt soft-bag skirt courses (sagging cloth rows) + hard front plates
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      P.add('hullCloth', box(0.05, 0.55, 0.80), s * 1.765, 0.92, 1.55 - i * 0.82, 0.05 * ((i % 3) - 1), 0, 0);
      P.add('hullDark', box(0.05, 0.10, 0.78), s * 1.767, 1.22, 1.55 - i * 0.82);
    }
    for (let i = 0; i < 3; i++) P.add('hullTrack', box(0.05, 0.44, 0.52), s * 1.77, 0.98, 2.0 - i * 0.56);
  }

  // ---- turret: dome under the Sosna-U suite, Relikt clamshells ----
  P.turretG.position.set(0, 1.40, -0.50);
  const rings = [[1.26, -0.03], [1.32, 0.10], [1.28, 0.36], [1.12, 0.58], [0.80, 0.75], [0.40, 0.83], [0.02, 0.85]];
  meshDome(P, rings, 0.85);
  const pD = { rings, sz: 0.85 };
  eraRuCheeks(P, pD, 'relikt');
  // Sosna-U sight tower LEFT + housing right of the gun, folded to the
  // published roof (print carries them 0.5+ higher — packet cap)
  P.add('turret', box(0.50, 0.50, 0.60), -0.85, 0.58, 0.05);
  P.add('turretDark', box(0.28, 0.24, 0.05), -0.85, 0.62, 0.37);
  P.add('turret', box(0.16, 0.50, 0.16), -0.35, 0.57, -0.15);
  P.add('turret', box(0.48, 0.38, 0.55), 0.62, 0.64, 0.42);
  P.add('turretDark', box(0.28, 0.22, 0.05), 0.62, 0.67, 0.72);
  P.add('turret', cylY(0.22, 0.24, 0.12, 14), -0.42, 0.76, -0.55);
  nsvt(P, 0.30, 0.50, -0.55);
  mast(P, -0.25, 0.86, 0.05, 1.55, 0.022, 0.07);
  // whip antenna rooted in the bustle basket, near-vertical spike
  P.add('turretDetail', box(0.03, 1.05, 0.03), -0.35, 0.70, -1.45, -0.08, 0, 0.06);
  // bustle basket
  P.add('turret', box(2.1, 0.40, 0.80), 0, 0.28, -1.45);
  P.add('turretDark', box(2.0, 0.30, 0.03), 0, 0.28, -1.87);
  P.add('turretCloth', box(1.7, 0.24, 0.7), -0.1, 0.52, -1.42);
  // ---- 2A46M-5 ----
  P.gunG.position.set(0, 0.28, 1.00);
  ruSaddle(P, { rollR: 0.20, rollW: 0.58, tubeR: 0.106, rootL: 0.65 });
  P.addGunExtra(box(0.50, 0.26, 0.42), 0, -0.13, 0.18);
  tubeGun(P, [
    [0.64, 2.70, 0.104], [2.70, 3.01, 0.108], [3.01, 4.45, 0.089],
  ], { rings: [[2.70, 0.11], [3.01, 0.11], [4.21, 0.091]], muzzle: 4.45 });
  const dx3 = ringSkin(rings, 0.40) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dx3 * 0.99, 0.38, -0.45], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dx3 * 0.99, 0.38, -0.45], -Math.PI / 2);
  P.topY = 1.3;
}

// ---- T-72BU (profiles/t72bu.json) ------------------------------------------
// Aft frame: hull plates -4.75..+2.68; the print parents its BARREL and a
// dome filler band (1.78-1.81, z -1.5..+0.9) into the HULL node — the filler
// is matched with a hull-bucket box under the dome; the barrel stays on the
// correct rig (documented oracle cap: hull/turret masks split the tube).
// Dome crown ~2.20 center w/ big left cluster 2.78 and mast 3.58; rear
// basket run -1.5..-3.2 rising 2.0 -> 2.43. Tube axis 1.715, muzzle 5.448.
function buildT72BU(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r5 dims-first: published 6.86 hull / 9.53 overall / 2.23 roof. The
  // print is +16% long and +36% tall at the p95 — tail cut to -4.16 with a
  // band-thin drum rack, muzzle 4.62, roof folded to 2.25.
  loftHull(P, {
    deck: [[-4.16, 1.36], [-4.06, 1.46], [-3.30, 1.46], [-3.05, 1.50], [-1.60, 1.52], [0.95, 1.52], [1.60, 1.46], [2.20, 1.36], [2.68, 1.22]],
    belly: [[-4.16, 0.98], [-3.94, 0.72], [-3.62, 0.36], [-3.15, 0.06], [1.55, 0.06], [2.00, 0.26], [2.68, 0.84]],
    wUp: [[-4.14, 0.95], [-3.90, 1.40], [-3.70, 1.82], [2.30, 1.82], [2.68, 1.48]],
    wLo: [[-4.14, 0.90], [2.68, 0.88]],
    sponsonY: 0.92,
  });
  widthAnchor(P, 1.89, 1.0, -0.5);
  // oracle hull-parented dome filler band (reads as the turret-ring collar)
  P.add('hull', box(2.55, 0.26, 2.30), 0, 1.60, -0.30);
  ruDeck(P, { deckY: 1.52, hatchZ: 1.15, gz: -3.15, grilles: 4, gw: 1.5 });
  ruGlacisKit(P, { w: 3.4, y: 1.28, z: 2.05, eyeZ: 2.35, hookY: 0.72, hookZ: 2.45 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.35 - row * 0.075, 1.75 + row * 0.32, -0.40, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.25, 1.40, 1.4], [0, 1.47, 0.9], [1.25, 1.40, 1.4]]);
  // band-thin tail rack: drums + log past the cut rear plate
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.14, 0.62, 12), s * 0.64, 1.58, -4.42);
    P.add('hullDark', cylZ(0.144, 0.03, 12), s * 0.64, 1.58, -4.21);
    P.add('hullDark', box(0.05, 0.13, 0.05), s * 0.64, 1.58, -4.56);
  }
  P.add('hullWood', cylX(0.095, 2.0, 10), 0, 1.58, -4.80);   // log rides the drum band (thin-tail rule)
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 1.0, 1.58, -4.80);
  stowage(P, 'hull', P.rng, [[-1.15, 1.56, -2.4, 0.34, 0.18, 1.5], [1.15, 1.56, -2.0, 0.34, 0.18, 1.7]]);
  ruFlaps(P, { x: 1.47, w: 0.60, front: [0.65, 0.60], frontZ: 2.70 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.39, wheelW: 0.21, wheelY: 0.45, xc: 1.47, dishR: 0.84,
    wheelZs: evenStations(6, 4.35, -0.85),
    sprocket: { z: -3.50, y: 0.74, r: 0.31 }, idler: { z: 2.32, y: 0.62, r: 0.30 },
    rollers: [-2.3, -0.75, 0.85].map((z) => ({ z, y: 0.84, r: 0.086 })),
    trackW: 0.58, topY: 0.88, botY: 0.04, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.815, z0: -4.10, z1: 2.30, yTop: 1.34, yBot: 0.58, panels: 7 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    P.add('hull', box(0.05, 0.44, 0.56), s * 1.845, 1.02, 2.30 - i * 0.60);
    P.add('hullDark', box(0.04, 0.38, 0.03), s * 1.849, 1.02, 2.02 - i * 0.60);
  }

  // ---- turret: wide low dome + left sight cluster folded to the 2.25
  // published roof (the print's 2.8-3.0 cluster is a packet cap) ----
  P.turretG.position.set(0, 1.52, -0.25);
  const rings = [[1.36, -0.03], [1.42, 0.10], [1.37, 0.34], [1.16, 0.52], [0.74, 0.66], [0.32, 0.71], [0.02, 0.73]];
  meshDome(P, rings, 0.78);
  const p5 = { rings, sz: 0.78, k5Len: 1.25, k5Y: 0.14 };
  eraRuCheeks(P, p5, 'k5');
  ruShtora(P, p5, 0.36);
  // commander sight cluster LEFT of the ring + hatches (roof-capped)
  P.add('turret', box(0.72, 0.42, 0.85), -0.68, 0.50, -0.10);
  P.add('turretGlass', box(0.36, 0.20, 0.03), -0.68, 0.56, 0.34);
  P.add('turretDark', box(0.40, 0.06, 0.5), -0.68, 0.70, -0.10);
  P.add('turret', cylY(0.20, 0.22, 0.10, 14), 0.55, 0.62, -0.40);
  P.add('turretDark', cylY(0.175, 0.175, 0.02, 12), 0.55, 0.695, -0.40);
  nsvt(P, -0.40, 0.40, -0.55);
  mast(P, -0.20, 0.60, -1.35, 1.34, 0.024, 0.09);
  // rear basket run rising toward the dome
  P.add('turret', box(2.2, 0.42, 0.85), 0, 0.42, -1.62);
  P.add('turretDark', box(2.1, 0.34, 0.03), 0, 0.42, -2.06);
  P.add('turret', box(2.0, 0.30, 0.85), 0, 0.22, -2.50);
  P.add('turretCloth', box(1.8, 0.20, 0.8), 0, 0.44, -2.48);
  P.add('turretDetail', box(2.05, 0.04, 0.04), 0, 0.42, -2.95);
  // ---- 2A46M (turret-parented on the correct rig; oracle carries it in
  // the hull node — documented cap, not chased) ----
  P.gunG.position.set(0, 0.105, 1.05);
  ruSaddle(P, { rollR: 0.21, rollW: 0.60, tubeR: 0.112, rootL: 0.70 });
  P.addGunExtra(box(0.54, 0.38, 0.30), 0, 0.02, 0.14);
  P.addGunExtra(box(0.44, 0.20, 1.0), 0, 0.26, 0.72);
  tubeGun(P, [
    [0.70, 2.70, 0.11], [2.70, 3.82, 0.10],
  ], { rings: [[0.74, 0.112], [2.70, 0.103], [3.70, 0.102]], muzzle: 3.82 });
  P.add('gun', cylZ(0.122, 0.42, 14, 0.11), 0, 0, 2.64);
  P.add('gunDark', cylZ(0.124, 0.04, 14), 0, 0, 2.85);
  const dxU = ringSkin(rings, 0.32) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxU, 0.30, -0.4], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxU, 0.30, -0.4], -Math.PI / 2);
  P.topY = 1.0;
}

// ---- T-90SM (profiles/t90sm.json) ------------------------------------------
// Near-centered frame: hull -3.83..+3.85, deck 1.55, glacis -> 1.13@3.73;
// WELDED turret ~3.3 wide with the squared bustle to -2.9 (top 2.20) and two
// sight towers to 3.15 (pano left -0.65, RWS right +0.25); Relikt cheeks.
// Tube axis 1.912, MRS bulge r.118 at world 5.17..5.29, muzzle 6.732.
function buildT90SM(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage, polyTurret, slab } = KIT;
  // r5 dims-first: published 6.86 hull / 9.63 overall / 2.23 roof. Print is
  // +8% long / +9% inflated (safeScale 1.11) — hull cut to ±3.43, muzzle
  // 6.20, welded roof at 2.25 with pano/RWS folded.
  loftHull(P, {
    deck: [[-3.44, 1.42], [-3.33, 1.50], [-2.95, 1.53], [-2.20, 1.55], [0.80, 1.55], [1.60, 1.50], [2.30, 1.46], [3.02, 1.26], [3.40, 1.06]],
    belly: [[-3.44, 1.02], [-3.22, 0.78], [-2.86, 0.38], [-2.62, 0.28], [2.45, 0.28], [3.02, 0.50], [3.46, 0.96]],
    wUp: [[-3.42, 0.98], [-3.26, 1.30], [-3.11, 1.78], [3.10, 1.78], [3.46, 1.50]],
    wLo: [[-3.44, 0.88], [3.46, 0.86]],
    sponsonY: 0.88,
  });
  widthAnchor(P, 1.89, 0.95, 0.3);
  ruDeck(P, { deckY: 1.55, hatchZ: 2.35, gz: -1.85, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.5, y: 1.28, z: 2.90, eyeZ: 3.20, hookY: 0.75, hookZ: 3.32 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.40 - row * 0.075, 2.55 + row * 0.32, -0.42, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.25, 1.48, 2.3], [0, 1.55, 1.8], [1.25, 1.48, 2.3]]);
  stowage(P, 'hull', P.rng, [[0.2, 1.64, -3.10, 1.7, 0.18, 0.45]]);
  ruFlaps(P, { x: 1.46, w: 0.60, front: [0.70, 0.60], frontZ: 3.38 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.385, wheelW: 0.21, wheelY: 0.46, xc: 1.46, dishR: 0.84,
    wheelZs: evenStations(6, 4.5, 0.05),
    sprocket: { z: -2.88, y: 0.80, r: 0.31 }, idler: { z: 2.98, y: 0.62, r: 0.30 },
    rollers: [-1.55, 0, 1.6].map((z) => ({ z, y: 0.84, r: 0.086 })),
    trackW: 0.58, topY: 0.88, botY: 0.05, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.845, z0: -3.32, z1: 3.30, yTop: 1.32, yBot: 0.55, panels: 7 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    P.add('hull', box(0.05, 0.46, 0.56), s * 1.863, 1.04, 2.60 - i * 0.60);
    P.add('hullDark', box(0.04, 0.40, 0.03), s * 1.859, 1.04, 2.32 - i * 0.60);
  }

  // ---- WELDED turret: faceted prism + squared removable bustle ----
  P.turretG.position.set(0, 1.525, 0.10);  // r3: −0.025 — heightM 2.26 vs pub 2.23 (1.28%) after the kit track round
  const tw = 1.55, f = 1.55, b = -1.45, h = 0.70;
  P.add('turret', polyTurret([
    [-tw * 0.15, f], [tw * 0.15, f], [tw * 0.60, f * 0.62], [tw, f * 0.14],
    [tw * 0.95, b * 0.60], [tw * 0.70, b], [-tw * 0.70, b], [-tw * 0.95, b * 0.60],
    [-tw, f * 0.14], [-tw * 0.60, f * 0.62],
  ], h, 1.02, 0.90));
  for (const s of [-1, 1]) {
    const inner = s * tw * 0.15, outer = s * tw;
    P.add('turret', slab(
      [inner, 0.03, f], [outer, 0.03, f * 0.18], [outer, 0.03, -0.2], [inner, 0.03, f * 0.60],
      [inner, h * 0.8, f * 0.58], [outer * 0.9, h * 0.66, f * 0.05], [outer * 0.9, h * 0.72, -0.3], [inner, h * 0.9, f * 0.38]));
    // side stowage panels flaring toward the cheeks
    P.add('turret', box(0.24, 0.55, 1.2), s * (tw - 0.05), 0.36, 0.45, 0, s * 0.08, 0);
    P.add('turret', box(0.22, 0.48, 0.9), s * (tw - 0.10), 0.34, -0.60);
  }
  // squared removable bustle: slat rear face + top boxes
  P.add('turret', box(2.05, 0.58, 1.30), 0, 0.32, -2.10);
  P.add('turretDark', box(2.07, 0.46, 0.05), 0, 0.32, -2.78);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.72, 0.14, 0.95), s * 0.55, 0.62, -2.05);
  const pW = { rings: [[tw, 0], [tw * 0.96, h * 0.6], [tw * 0.9, h]], sz: 0.95 };
  eraRuCheeks(P, { ...pW, weldFlat: true }, 'relikt');
  // pano tower left + UDP RWS right, folded to the published roof (the
  // print's 3.15 towers are a packet cap); pano head is the spike column
  P.add('turretDetail', box(0.16, 0.46, 0.16), -0.65, 0.44, -0.35);
  P.add('turretDark', cylY(0.05, 0.05, 0.18, 10), -0.65, 0.74, -0.35);
  P.add('turret', box(0.42, 0.32, 0.46), 0.28, 0.52, -0.55);
  P.add('turretDark', box(0.12, 0.14, 0.20), 0.28, 0.62, -0.55);
  P.add('turretDark', cylZ(0.024, 0.62, 8), 0.28, 0.68, -0.18, -0.04, 0, 0);
  P.add('turretGlass', box(0.12, 0.09, 0.02), 0.20, 0.56, -0.31);
  P.add('turret', box(0.30, 0.36, 0.30), -0.85, 0.50, -0.30);
  // ---- 2A46M-5 + MRS bulge ----
  P.gunG.position.set(0, 0.27, 1.30);
  ruSaddle(P, { rollR: 0.22, rollW: 0.64, tubeR: 0.104, rootL: 0.75 });
  P.addGunExtra(box(0.66, 0.44, 0.30), 0, 0.02, 0.16);
  tubeGun(P, [
    [0.80, 3.56, 0.101], [3.56, 4.74, 0.094],
  ], { rings: [[0.84, 0.103], [3.56, 0.096], [4.60, 0.096]], muzzle: 4.74 });
  P.add('gun', cylZ(0.118, 0.26, 14), 0, 0, 3.72);          // MRS/evac bulge
  P.add('gunDark', cylZ(0.12, 0.035, 14), 0, 0, 3.86);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [tw * 0.99, 0.32, -0.35], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-tw * 0.99, 0.32, -0.35], -Math.PI / 2);
  P.topY = 1.7;
}

// Dome grab rail pair seated just off the measured skin.
function domeRailRu(P, rings, sz, y, len) {
  const { box } = KIT;
  const r = ringSkin(rings, y) + 0.035;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.02, 0.02, len), s * r, y, -0.2);
    for (const dz of [-len / 2 + 0.06, len / 2 - 0.06]) {
      P.add('turretDetail', box(0.05, 0.018, 0.018), s * (r - 0.025), y, -0.2 + dz);
    }
  }
}

// K-5/K-1/relikt/erawa cheek arrays seated on a MEASURED ring profile.
function eraRuCheeks(P, p, kind) {
  const { box } = KIT;
  const skinD = (t, y) => {
    const r = ringSkin(p.rings, y);
    const A = r, B = r * p.sz;
    return 1 / Math.sqrt((Math.cos(t) / A) ** 2 + (Math.sin(t) / B) ** 2);
  };
  const put = (t, y, w, hgt, d, tilt, bucket, dist) => {
    P.add(bucket, box(w, hgt, d), Math.cos(t) * dist, y, Math.sin(t) * dist, tilt, Math.PI / 2 - t, 0);
  };
  if (kind === 'k5') {
    // Kontakt-5 clamshell: one wedge course per cheek meeting at the mantlet,
    // welded end caps, dark course seam + proud flank tiles. The wedges own
    // the measured front-arc wings (tips near the full turret-mask width,
    // hanging to just above the fender line).
    for (const s of [1, -1]) {
      const t = Math.PI / 2 + s * 0.55;
      const yc = p.k5Y ?? 0.16;
      const D = skinD(t, yc) - 0.04;
      const x = Math.cos(t) * D, z = Math.sin(t) * D;
      const ry = Math.PI / 2 - t;
      const L = p.k5Len ?? 1.30;
      P.add('turretTrack', box(L, 0.40, 0.40), x, yc, z, -0.40, ry, 0);
      P.add('turretDark', box(L + 0.01, 0.035, 0.36), x, yc + 0.20, z, -0.40, ry, 0);
      for (const e of [-1, 1]) {
        P.add('turretTrack', box(0.06, 0.38, 0.38),
          x + e * -Math.sin(t) * (L / 2 + 0.02), yc, z + e * Math.cos(t) * (L / 2 + 0.02), -0.40, ry, 0);
      }
      for (let i = 0; i < 3; i++) {
        const tf = s * (0.12 + i * 0.17);
        put(tf, 0.26, 0.34, 0.30, 0.07, -0.08, 'turretTrack', skinD(tf, 0.26) + 0.02);
      }
    }
  } else if (kind === 'k1') {
    // K-1 brick field over the whole front arc, ring to shoulder (the MV
    // turret wears 3 tall courses wrapping the sight housings).
    for (const s of [1, -1]) for (let row = 0; row < 3; row++) {
      const y = (p.k1Y ?? 0.15) + row * (p.k1Pitch ?? 0.27);
      for (let i = 0; i < 4; i++) {
        const t = Math.PI / 2 + s * (0.22 + i * 0.21);
        put(t, y, 0.30, 0.24, 0.16, -0.24 - row * 0.09, 'turretTrack', skinD(t, y) + 0.03);
      }
    }
  } else if (kind === 'erawa') {
    for (const s of [1, -1]) {
      for (let row = 0; row < 3; row++) {
        const y = 0.04 + row * 0.18;
        for (let i = 0; i < 5; i++) {
          const t = Math.PI / 2 + s * (0.12 + i * 0.18);
          put(t, y, 0.28, 0.22, 0.06, -0.20 - row * 0.09, 'turretTrack', skinD(t, y) + 0.015);
        }
      }
    }
  } else if (kind === 'relikt') {
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const t = Math.PI / 2 + s * (0.28 + i * 0.28);
        for (const [row, y0] of [[0, 0.06], [1, 0.34]]) {
          const yc = y0 + 0.13;
          put(t, yc, 0.48, 0.27, 0.22, -0.34 + row * 0.10, 'turretTrack', skinD(t, yc) - 0.05);
        }
        put(t, 0.34, 0.50, 0.032, 0.20, -0.30, 'turretDark', skinD(t, 0.34) - 0.03);
      }
    }
  }
}

// Shtora dazzler pair seated on the measured skin (THE T-90 cue).
function ruShtora(P, p, y) {
  const { box } = KIT;
  const r = ringSkin(p.rings, y);
  const A = r, B = r * p.sz, x = 0.52;
  const zSkin = B * Math.sqrt(Math.max(0.1, 1 - (x / A) ** 2));
  const zc = zSkin + 0.06;
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.24, 0.27, 0.22), s * x, y, zc);
    P.add('turretGlass', box(0.17, 0.18, 0.03), s * x, y, zc + 0.115);
    P.add('turretDetail', box(0.27, 0.04, 0.24), s * x, y + 0.155, zc + 0.01);
  }
}
// ---------------------------------------------------------------------------
// Profiles. Dimensions are width-normalized oracle measurements (packets);
// width = spec width − 0.09 so skirts/fasteners land exactly on spec width.
// zC = the oracle's hull-center offset (overall-bbox-centered GLBs).
// turretPivotZ stays hull-center relative; gun muzzle = zC+pivotZ+gunZ+len.
// ---------------------------------------------------------------------------
export const RUSSIA_PROFILES = {
  t90a: { build: buildT90A },
  t62mv1: { build: buildT62MV1 },
  t64bv1: { build: buildT64BV1 },
  pt91m: { build: buildPT91M },
  t72b_1987: { build: buildT72B87 },
  t72b3m: { build: buildT72B3M },
  t72bu: { build: buildT72BU },
  t90sm: { build: buildT90SM },
  t90a_vladimir: { build: buildT90AVladimir },
};
