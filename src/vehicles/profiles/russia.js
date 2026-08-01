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
  const raw = [...new Set([o.deck, o.belly, o.wUp, o.wLo].flat().map((p) => p[0]))]
    .sort((a, b) => a - b);
  // EDGE-ON PRISM LAW (docs/GEOMETRY-GATE.md, r7c): the station cameras clip
  // a ~0.52 m z-slab; an axis-aligned long box shows the front camera only
  // its end caps, so a multi-metre loft slab is INVISIBLE at every mid-span
  // station slice. Subdivide the loft at <=0.36 m pitch so every station
  // slab contains real cross-section faces. Outer silhouette is unchanged
  // (the cuts interpolate the same curves).
  const zs = [];
  for (let i = 0; i < raw.length; i++) {
    zs.push(raw[i]);
    if (i < raw.length - 1) {
      const span = raw[i + 1] - raw[i];
      const cuts = Math.floor(span / 0.36);
      for (let c = 1; c <= cuts; c++) zs.push(raw[i] + (span * c) / (cuts + 1));
    }
  }
  zs.sort((a, b) => a - b);
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
// o.th: panel thickness (default 0.04) — front-view columns only register
// the band when the face is >1-2 mask pixels deep (t62mv1 r6 lesson).
function ruSkirtBand(P, o) {
  const { box } = KIT;
  const panels = o.panels ?? 7;
  const panelD = (o.z1 - o.z0) / panels;
  const yMid = (o.yTop + o.yBot) / 2, h = o.yTop - o.yBot;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      const z = o.z0 + panelD * (i + 0.5);
      P.add('hull', box(o.th ?? 0.04, h, panelD * 0.94), s * o.x, yMid, z);
      P.add('hullDark', box(0.048, h * 0.9, 0.02), s * (o.x + 0.003), yMid, z + panelD / 2);
      P.add('hullDark', KIT.cylZ(0.014, 0.014, 8), s * (o.x + 0.015), o.yTop - 0.07, z, 0, s * Math.PI / 2, 0);
      // bottom lip segmented per panel (edge-on prism law: a full-length
      // strip has no station-visible faces mid-span)
      P.add('hullDark', box(0.042, 0.09, panelD * 0.92), s * (o.x - 0.002), o.yBot - 0.03, z);
    }
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
  // VERTEX ROUND r2 (batch-12 oracle normalized to published dims): re-anchor
  // to docs/references/vertex/t90a.json — hull mask +-3.43 (6.865), deck
  // plateau 1.29-1.37 with the rear stack bumps 1.44-1.49 @ -3.16..-3.32,
  // glacis 1.15@3.11 -> 0.85@3.43; roof plateau 2.16-2.22 over z -0.01..0.69
  // (the old print's 2.54-2.66 band is GONE); gun axis 1.50, tube r 0.117
  // sleeve / 0.096 forward, muzzle +6.10. Orientation asserts: glacis +z,
  // gun +z, agree (descent runs 1.29 / 0).
  loftHull(P, {
    deck: [[-3.43, 1.31], [-3.30, 1.36], [-2.89, 1.36], [-2.38, 1.375], [0.83, 1.375], [2.02, 1.30], [2.42, 1.24], [2.71, 1.19], [3.11, 1.15], [3.43, 0.85]],
    belly: [[-3.43, 1.26], [-3.10, 1.02], [-2.83, 0.86], [-2.62, 0.44], [-2.42, 0.32], [2.48, 0.30], [2.97, 0.62], [3.16, 0.85], [3.43, 0.98]],
    wUp: [[-3.43, 0.90], [-2.97, 0.98], [-2.83, 1.30], [-2.70, 1.60], [3.05, 1.60], [3.43, 1.20]],
    wLo: [[-3.43, 0.78], [-3.10, 0.88], [3.10, 1.00], [3.43, 0.72]],
    sponsonY: 0.86,
  });
  // fender tips held behind the loft bow (they merge with the gun band)
  for (const s of [-1, 1]) P.add('hull', box(0.64, 0.07, 0.26), s * 1.43, 0.94, 3.02);
  // fender lips: thin shelves at the ref's 1.14-1.22 outer band (segmented
  // per the r7c prism law so station slices see end faces)
  for (const s of [-1, 1]) for (let i = 0; i < 11; i++) {
    P.add('hull', box(0.16, 0.05, 0.50), s * 1.70, 1.17, -2.75 + i * 0.545);
  }
  ruDeck(P, { deckY: 1.365, hatchZ: 2.16, gz: -1.74, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.5, y: 1.10, z: 2.83, eyeZ: 3.03, hookY: 0.62, hookZ: 3.08 });
  // K-5 glacis chevron rows
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.235 - row * 0.075, 2.50 + row * 0.29, -0.42, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.25, 1.30, 2.29], [0, 1.36, 1.74], [1.25, 1.30, 2.29]]);
  // rear stack: the normalized print's tail bumps 1.44-1.49 over -3.16..-3.32
  // (stowage + drums + log at the same thin band — the 12% law watch keeps)
  stowage(P, 'hull', P.rng, [[-0.85, 1.36, -2.81, 1.19, 0.13, 0.28], [0.75, 1.36, -2.81, 1.24, 0.13, 0.28]]);
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.112, 0.62, 12), s * 0.72, 1.36, -3.12);
    P.add('hullDark', cylZ(0.116, 0.03, 12), s * 0.72, 1.36, -2.94);
    P.add('hullDark', box(0.05, 0.11, 0.05), s * 0.72, 1.36, -3.17);
  }
  P.add('hullDark', cylX(0.115, 2.55, 10), 0, 1.49, -1.43);
  for (const s of [-0.5, 0.5]) P.add('hullDetail', box(0.06, 0.16, 0.09), s * 2, 1.40, -1.43);
  P.add('hullWood', cylX(0.095, 2.1, 10), 0, 1.36, -3.23);
  for (const s of [-0.55, 0.55]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 1.05, 1.36, -3.23);
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.385, wheelW: 0.21, wheelY: 0.455, xc: 1.44, dishR: 0.84,
    wheelZs: evenStations(6, 4.04, 0.14),
    sprocket: { z: -2.50, y: 0.90, r: 0.28 }, idler: { z: 2.83, y: 0.62, r: 0.30 },
    rollers: [-1.38, 0.14, 1.65].map((z) => ({ z, y: 0.82, r: 0.086 })),
    trackW: 0.58, topY: 0.86, botY: 0.05, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.80, z0: -2.88, z1: 3.03, yTop: 1.02, yBot: 0.50, panels: 7 });
  widthAnchor(P, 1.89, 0.95, 0.46);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    P.add('hull', box(0.05, 0.42, 0.56), s * 1.863, 0.88, 2.40 - i * 0.55);
    P.add('hullDark', box(0.04, 0.36, 0.03), s * 1.859, 0.88, 2.15 - i * 0.55);
  }

  // ---- turret: normalized roof plateau 2.16-2.22, dome plan -1.49..+1.81 ----
  P.turretG.position.set(0, 1.335, 0.459);
  const rings = [[1.30, -0.049], [1.36, 0.097], [1.30, 0.35], [1.16, 0.55], [0.95, 0.70], [0.55, 0.82], [0.02, 0.875]];
  meshDome(P, rings, 1.21, 0, -0.18);
  const p5 = { rings, sz: 1.21 };
  eraRuCheeks(P, p5, 'k5');
  ruShtora(P, p5, 0.52);
  // left sight cluster (ref spikes 2.25-2.30) + right TKN block
  P.add('turret', box(0.46, 0.36, 0.80), -0.86, 0.70, -0.05);
  P.add('turretGlass', box(0.30, 0.18, 0.03), -0.86, 0.72, 0.36);
  P.add('turretDark', box(0.30, 0.08, 0.34), -0.86, 0.84, 0.10);
  P.add('turret', box(0.50, 0.30, 0.55), 0.64, 0.68, -0.44);
  P.add('turret', cylY(0.17, 0.19, 0.10, 12), 0.62, 0.56, -0.37);
  P.add('turret', cylY(0.22, 0.24, 0.12, 14), -0.28, 0.80, -0.28);
  P.add('turretDark', cylY(0.19, 0.19, 0.03, 12), -0.28, 0.85, -0.28);
  // pano tower right-rear (ref spike 2.30) + met mast left-rear (thin)
  P.add('turretDetail', box(0.12, 0.34, 0.12), 0.30, 0.795, -0.87);
  P.add('turretDark', cylY(0.05, 0.05, 0.16, 10), 0.30, 0.76, -0.87);
  mast(P, -0.23, 0.63, -1.24, 0.64, 0.022, 0.06);
  nsvt(P, -0.55, 0.55, -0.50);
  // bustle bin band (ref tops ~1.80 over z -0.9..-1.5, rails to -1.8)
  P.add('turret', box(2.5, 0.58, 0.60), 0, 0.175, -1.66);
  P.add('turretDark', box(2.3, 0.42, 0.03), 0, 0.16, -1.94);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.03, 0.05, 0.60), s * 1.05, 0.03, -1.85);
  // flank stowage bins hugging the dome sides
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.40, 1.33), s * 1.44, 0.34, -0.41, 0, s * 0.06, 0);
    P.add('turretDark', box(0.25, 0.32, 0.03), s * 1.46, 0.34, 0.05, 0, s * 0.06, 0);
  }
  // ---- 2A46M-2 on the normalized contour: axis 1.50, muzzle world +6.10 ----
  P.gunG.position.set(0, 0.165, 0.825);
  ruSaddle(P, { rollR: 0.22, rollW: 0.62, tubeR: 0.117, rootL: 0.69 });
  P.addGunExtra(box(0.56, 0.40, 0.30), 0, 0.02, 0.13);
  P.addGunExtra(box(0.34, 0.24, 0.30), -0.15, 0.55, 0.30);  // sight housing over the mantlet (ref 2.15-2.18)
  P.addGunExtra(box(0.46, 0.22, 1.03), 0, 0.33, 0.69);      // recoil-housing hump (ref 1.94-2.01, ends 2.49)
  P.addGunExtra(box(0.62, 0.34, 0.55), 0, -0.16, 0.39);     // mantlet chin
  tubeGun(P, [
    [0.65, 1.47, 0.112], [1.47, 3.17, 0.117], [3.17, 4.72, 0.096], [4.72, 4.816, 0.090],
  ], { rings: [[1.47, 0.119], [2.12, 0.120], [3.17, 0.099], [3.87, 0.100], [4.30, 0.097]], muzzle: 4.816 });
  P.add('gun', cylZ(0.125, 0.42, 14, 0.117), 0, 0, 2.88);   // bore-evacuator swell
  P.add('gunDark', cylZ(0.127, 0.04, 14), 0, 0, 3.09);
  const dx = ringSkin(rings, 0.34) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dx, 0.30, -0.42], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dx, 0.30, -0.42], -Math.PI / 2);
  P.topY = 0.90;
}

// ---- T-62MV-1 (r7 REBUILD vs the batch-10-repaired t62_bergman oracle) -----
// The oracle swapped (commit c44033c) from the old print pack to the gen2
// bergman bake; batch-10 split its fused 2A20 onto a Gun node and trimmed
// the authored-long tube to published overall (muzzle world +5.84). This
// build is authored in the BAKE's frame: hull-centered, ground y=0.
// Ref worldtrace (width-normalized 3.30): hull mask z -3.60..+3.56; deck
// 1.55-1.58, splash brow 1.61 @ +1.77..2.13, glacis fall from +2.61; rear
// rake -3.48 (0.81) -> track flat 0 from -2.41; bow wrap 0.03@1.89 ->
// 0.45@2.73; track contact -2.41..+1.83, outer edge ±1.66; fenders 1.57
// top out to ±1.54. BOW LOG: full-width ribbed log/links raft x ±1.06,
// tops 1.73..2.05 over z 2.76..3.56 (real print equipment). Dome: plan
// x -1.36..+1.39, z -0.26..+2.52 (center ~+1.13), skirt bot 1.49, sunken
// ring race to 0.72 @ z 0.34..1.77, crown 2.42-2.48 @ 0.34..0.94, front
// slope 2.00 @ 2.37; DShK receiver 2.84 (x -0.68..-1.20) with its BARREL
// forward at 2.75-2.78 over z 1.06..2.25. U-5TS: axis ~1.78, tube band
// 1.64..1.91, evac swell 1.97 @ 5.00..5.84 (trimmed muzzle).
// CERTIFIED CAPS (packet §r7): the DShK forward-barrel band (13 side
// columns 2.75-2.84 vs pub roof 2.40) and the bow-log tail columns beyond
// the hullLengthM body line are matched only up to the dims budget — no
// parity shelf is built (dims stay ~99, the batch-9 shelf lesson).
function buildT62MV1(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // BATCH-12 VERTEX ROUND + ORIENTATION REPAIR (owner bug "hull is
  // backwards"): the bergman bake's t54-frame hull faced -z with the ring
  // seated 35% from the wrong end; repair op 4 (repair_oracles.py
  // _rotate_mesh_180y) rotates HullMesh 180 deg — glacis under the gun,
  // drums/log to the tail, ring 34% from the bow (real T-62). This build is
  // authored to the CORRECTED frame (docs/references/vertex/t62mv1.json):
  // hull mask +-3.315, deck plateau 1.51, tail drum/log stack tops 1.94-1.97
  // over -2.77..-3.13, glacis falls 1.42@2.47 -> 1.06@3.31, muzzle +6.03.
  // Orientation asserts: glacis +z (descent run 1.11 vs 0), gun +z, agree.
  loftHull(P, {
    deck: [[-3.31, 1.62], [-3.10, 1.66], [-2.85, 1.60], [-2.72, 1.42], [-2.37, 1.44], [-2.28, 1.512], [0.76, 1.512], [0.87, 1.48], [1.53, 1.48], [1.61, 1.512], [2.04, 1.512], [2.31, 1.50], [2.47, 1.42], [2.68, 1.40], [2.93, 1.33], [3.09, 1.29], [3.24, 1.17], [3.31, 1.06]],
    belly: [[-3.31, 1.47], [-3.10, 1.05], [-2.80, 0.72], [-2.55, 0.53], [-2.30, 0.46], [2.10, 0.46], [2.50, 0.53], [2.90, 0.70], [3.10, 0.85], [3.31, 0.95]],
    wUp: [[-3.31, 0.90], [-3.05, 1.20], [-2.75, 1.54], [2.69, 1.54], [3.10, 1.10], [3.31, 0.70]],
    wLo: [[-3.31, 0.90], [3.31, 0.95]],
    sponsonY: 0.864,
  });
  // splash-board brow strip on the real glacis deck
  P.add('hull', box(2.5, 0.035, 0.37), 0, 1.529, 1.806, 0, 0, 0);
  ruDeck(P, { deckY: 1.512, hatchX: -0.55, hatchZ: 2.13, gz: -1.435, grilles: 4, gw: 1.4 });
  KIT.towCable(P, [[-1.15, 1.46, 1.11], [0, 1.512, 0.65], [1.15, 1.46, 1.11]]);
  // fender stowage boxes low on the sponson line
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.09, 1.30), s * 1.24, 1.483, s > 0 ? 0.46 : 1.30);
    P.add('hullDark', box(0.26, 0.02, 0.03), s * 1.24, 1.536, s > 0 ? 1.11 : 0.74);
  }
  // ---- TAIL DRUM + LOG stack (the print's rear fittings, tops 1.94-1.97
  // over z -2.77..-3.13, band tapering to the -3.31 tip) ----
  for (const s of [-1, 1]) {
    P.add('hull', box(0.90, 0.27, 0.34), s * 0.57, 1.82, -2.95);
    P.add('hull', cylX(0.135, 0.9, 10), s * 0.57, 1.832, -3.10);
  }
  for (const s of [-0.5, 0.5]) P.add('hullDark', box(0.05, 0.29, 0.34), s * 1.90, 1.82, -2.95);
  // spare-track-link rows on the aft deck shoulder
  for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.86, 0.09, 0.21), s * 0.53, 1.60, -2.60, 0.30, 0, 0);
    P.add('hullTrack', box(0.78, 0.08, 0.17), s * 0.49, 1.70, -2.72, 0.20, 0, 0);
  }
  // glacis eye hooks on the lower bow
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.10, 0.115, 0.13), s * 0.94, 0.816, 2.519, -0.3, 0, 0);
    P.add('hullDetail', KIT.torus(0.082, 0.016, 10), s * 1.18, 0.595, 2.686, Math.PI / 2, 0, 0);
  }
  P.add('hullRubber', box(0.40, 0.12, 0.05), 0, 1.64, -3.30);    // stack tip band
  for (const s of [-1, 1]) P.add('hullRubber', box(0.40, 0.18, 0.05), s * 1.30, 0.60, -3.18); // rear mud flaps
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.40, wheelW: 0.28, wheelY: 0.437, xc: 1.27, dishR: 0.88,
    wheelZs: [1.278, 0.463, -0.333, -1.102, -1.815],
    sprocket: { z: -2.704, y: 0.672, r: 0.235 }, idler: { z: 2.223, y: 0.595, r: 0.24 },
    rollers: [], trackW: 0.52, topY: 0.845, botY: 0.05, paintedEnds: true, coveredTop: false, arms: true,
  });
  // full-length fender runs + segmented outer fender-bin row (r7c prism law)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.26, 0.03, 4.58), s * 1.50, 1.512, 0.032);
    P.add('hullDark', box(0.22, 0.012, 0.02), s * 1.50, 1.531, 0.032);
    for (let i = 0; i < 9; i++) {
      P.add('hull', box(0.055, 0.29, 0.445), s * 1.612, 1.368, -1.908 + i * 0.4816);
      P.add('hullDark', box(0.05, 0.25, 0.02), s * 1.614, 1.363, -1.908 + i * 0.4816 + 0.232);
    }
    P.add('hull', box(0.055, 0.25, 0.39), s * 1.612, 1.26, -2.60, 0.08, 0, 0);  // aft rake bin
    P.add('hull', box(0.055, 0.24, 0.315), s * 1.612, 1.325, 2.519, -0.05, 0, 0); // glacis bin
    P.add('hull', box(0.055, 0.24, 0.30), s * 1.612, 1.26, 2.86, -0.10, 0, 0);
    P.add('hull', box(0.44, 0.055, 0.54), s * 1.38, 1.142, 2.695, -0.20, 0, 0);   // front corner guards
    P.add('hull', box(0.025, 0.25, 0.57), s * 1.60, 1.018, 2.667);
  }
  widthAnchor(P, 1.65, 1.344, -0.463);

  // ---- turret on the normalized casting: TRUE seat (bias split deleted),
  // crown 2.40, cupola 2.42, receiver stow spike 2.43 — published stature ----
  P.turretG.position.set(0, 1.4304, 1.046);
  const rings = [[1.30, -0.022], [1.355, 0.151], [1.34, 0.410], [1.25, 0.560], [0.96, 0.711], [0.62, 0.841], [0.30, 0.927], [0.02, 0.970]];
  meshDome(P, rings, 0.81, 0, -0.30);
  P.add('turret', cylY(0.62, 0.66, 0.74, 20), 0, -0.36, -0.19); // sunken race drum
  P.add('turret', box(0.92, 0.24, 0.46), 0, 0.17, -1.60);       // aft race skirt (ref band 1.48..1.71 to z -0.62)
  const pD = { rings, sz: 0.81, k1Y: 0.06, k1Pitch: 0.20, k1Out: -0.06, k1T0: 0.30, k1Step: 0.22, k1H: 0.20 };
  eraRuCheeks(P, pD, 'k1');
  // LEFT cheek raft (Luna shoulder bulge)
  P.add('turret', box(0.30, 0.42, 0.37), -0.94, 0.25, 0.778, -0.15, -0.55, 0);
  P.add('turretTrack', box(0.26, 0.33, 0.085), -1.04, 0.25, 0.926, -0.15, -0.55, 0);
  // egg fat-end REAR wedges
  P.add('turret', box(1.10, 0.25, 0.65), 0, 0.528, -0.852, -0.30, 0, 0);
  P.add('turret', box(1.25, 0.29, 0.41), 0, 0.25, -0.963, -0.18, 0, 0);
  // DShK receiver + cradle over the left shoulder (post-warp ref spike 2.43,
  // kept 2-3 side columns deep per the p95 law)
  P.add('turretDark', box(0.20, 0.30, 0.26), -0.775, 0.85, -0.093);
  P.add('turretDark', box(0.20, 0.05, 0.16), -0.79, 0.985, -0.093);
  P.add('turretDark', cylY(0.032, 0.040, 0.25, 8), -0.86, 0.62, -0.093);
  P.add('turretDetail', box(0.11, 0.13, 0.13), -0.60, 0.70, -0.12);
  P.add('turret', cylY(0.22, 0.24, 0.09, 14), -0.85, 0.797, -0.278);
  // stowed DShK tube transverse across the roof clamp (batch-11 parity)
  P.add('turretDark', cylX(0.085, 1.25, 10), -0.04, 0.758, -0.083);
  P.add('turretDark', box(0.10, 0.10, 0.10), 0.52, 0.73, -0.083);
  // commander cupola LEFT-center (post-warp ref 2.42)
  P.add('turret', cylY(0.25, 0.27, 0.15, 14), -0.52, 0.905, -0.574);
  P.add('turret', cylY(0.21, 0.22, 0.06, 14), -0.52, 0.962, -0.574);
  P.add('turretDark', cylY(0.075, 0.085, 0.04, 10), -0.46, 0.965, -0.519);
  // loader hump RIGHT (post-warp ref 2.41) + vent dome
  P.add('turret', cylY(0.24, 0.26, 0.14, 14), 0.62, 0.91, -0.324);
  P.add('turretDark', cylY(0.20, 0.20, 0.02, 12), 0.62, 0.988, -0.324);
  P.add('turret', KIT.sph(0.125, 12, Math.PI / 2), 0.26, 0.72, 0.278);
  domeRailRu(P, rings, 0.935, 0.43, 0.93);
  // ---- U-5TS: axis 1.717 (post-warp contour), pivot world +2.065, evac
  // swell 4.99..5.99, muzzle +6.03 (overall 9.34 published) ----
  P.gunG.position.set(0, 0.2866, 1.019);
  ruSaddle(P, { rollR: 0.19, rollW: 0.42, tubeR: 0.145, rootL: 0.58 });
  P.addGunExtra(box(0.38, 0.33, 0.42), 0, -0.02, 0.25);     // mantlet collar block
  P.addGunExtra(box(0.30, 0.28, 0.28), 0, 0.38, -0.575);    // KTD-2 hood (ref spike 2.24 @ z 1.49)
  P.addGunExtra(box(0.26, 0.25, 0.28), -0.55, -0.05, 0.02); // Luna bracket
  tubeGun(P, [
    [0.40, 1.06, 0.140], [1.06, 2.93, 0.136], [2.93, 3.93, 0.142],
  ], { rings: [[0.72, 0.141], [1.06, 0.141], [1.41, 0.138], [1.76, 0.138], [2.11, 0.138], [2.46, 0.138], [2.93, 0.1425], [3.28, 0.1425], [3.63, 0.1425]], muzzle: 3.93 });
  P.add('gunDark', cylZ(0.1425, 0.05, 14), 0, 0, 3.905);    // evac front seam
  const dx = ringSkin(rings, 0.43) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dx * 0.98, 0.40, 0.51], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dx * 0.98, 0.40, 0.51], -Math.PI / 2);
  P.topY = 1.10;
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
  // BATCH-12 VERTEX ROUND (owner ruling b522c34): the print is normalized to
  // published dims in vertex space (repair_oracles.py REPAIRS['t64bv1'] —
  // hull mask stretched -8.2% -> 6.545 m, stature 2.283 -> 2.17, fused tube
  // to overall 9.225). This build re-anchors on the post-warp vertex trace
  // (docs/references/vertex/t64bv1.json): every dims-anchor workaround of the
  // short-print era (fat drum pair past the tail, flap-under-tube column) is
  // DELETED — the honest print now spans published length itself.
  // Frame: hull mask -4.614..+1.931, deck plateau 1.197, tail step 0.925-1.0,
  // glacis nose 0.798@1.93, tracks grounded (belly flat 0.00-0.04).
  loftHull(P, {
    deck: [[-4.29, 0.98], [-4.24, 1.05], [-3.97, 1.19], [-3.50, 1.197], [0.24, 1.197], [0.70, 1.15], [1.14, 1.08], [1.62, 1.055], [1.80, 0.97], [1.93, 0.80]],
    belly: [[-4.29, 0.47], [-3.92, 0.40], [1.23, 0.40], [1.60, 0.46], [1.86, 0.68], [1.93, 0.75]],
    wUp: [[-4.29, 1.30], [-4.12, 1.42], [1.53, 1.42], [1.93, 1.20]],
    wLo: [[-4.29, 0.96], [1.93, 0.94]],
    sponsonY: 0.80,
  });
  ruDeck(P, { deckY: 1.19, hatchZ: 0.72, gz: -2.50, grilles: 5, gw: 1.4 });
  ruGlacisKit(P, { w: 3.2, y: 0.93, z: 1.53, eyeZ: 1.77, hookY: 0.46, hookZ: 1.84 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.62, 0.07, 0.28), s * 0.36, 0.99 - row * 0.07, 1.26 + row * 0.28, -0.35, s * 0.32, 0);
  }
  KIT.towCable(P, [[-1.05, 1.12, 0.55], [0, 1.18, 0.01], [1.05, 1.12, 0.55]]);
  for (const s of [-1, 1]) {
    // fender as a segmented bin row (r7c stations law — end caps per slice)
    for (let i = 0; i < 8; i++) {
      P.add('hull', box(0.20, 0.09, 0.50), s * 1.55, 1.17, -3.26 + i * 0.556);
      P.add('hullDark', box(0.17, 0.07, 0.02), s * 1.552, 1.165, -3.26 + i * 0.556 + 0.26);
    }
    P.add('hull', box(0.20, 0.05, 0.60), s * 1.55, 1.03, 1.27, -0.06, 0, 0);
    P.add('hull', box(0.20, 0.05, 0.40), s * 1.55, 0.96, 1.72, -0.10, 0, 0);
  }
  P.add('hullDark', box(0.16, 0.10, 0.93), -1.35, 1.24, -2.61);         // left exhaust duct
  stowage(P, 'hull', P.rng, [[1.05, 1.21, -0.86, 0.30, 0.11, 1.42], [-1.05, 1.21, -1.73, 0.30, 0.10, 1.20]]);
  // center-rear drum rack ON the print's own tail (post-warp mask reaches
  // -4.61 with tops 0.93-1.0 — no dims anchors needed, the span IS published)
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.155, 0.35, 10), s * 0.45, 0.85, -4.45);
    P.add('hullDark', cylZ(0.159, 0.03, 10), s * 0.45, 0.85, -4.30);
    P.add('hull', box(0.24, 0.05, 0.76), s * 1.50, 1.045, -4.15);
    P.add('hullRubber', box(0.26, 0.21, 0.05), s * 1.50, 0.80, -4.48);
  }
  P.add('hullDark', box(1.5, 0.10, 0.16), 0, 0.46, -4.45);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.05, 0.30, 0.08), s * 1.38, 1.20, -4.30);
    P.add('hullDark', box(0.05, 0.30, 0.08), s * 1.38, 1.20, -3.60);
  }
  P.add('hullDark', box(1.5, 0.05, 0.05), 0, 0.74, -4.59);
  ruFlaps(P, { x: 0.30, w: 0.20, front: [0.80, 0.14], frontZ: 1.93 });
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.27, wheelW: 0.20, wheelY: 0.30, xc: 1.25, dishR: 0.88,
    wheelZs: evenStations(6, 4.52, -1.32),
    sprocket: { z: -3.95, y: 0.68, r: 0.26 }, idler: { z: 1.50, y: 0.70, r: 0.23 },
    rollers: [-3.04, -1.79, -0.54, 0.72].map((z) => ({ z, y: 0.72, r: 0.066 })),
    trackW: 0.58, topY: 0.76, botY: 0.02, paintedEnds: true, coveredTop: true, arms: true,
  });
  widthAnchor(P, 1.71, 0.86, -1.0);
  ruSkirtBand(P, { x: 1.675, z0: -3.67, z1: 1.26, yTop: 1.045, yBot: 0.55, panels: 6 });

  // ---- turret on the normalized casting: plateau (left gallery) ref 2.173
  // = published 2.17 EXACTLY — the r7-era stature clamps are retired; low
  // right roof ~1.78-1.83, steep face, sloped bustle, rear rack drums ----
  P.turretG.position.set(0, 1.046, -1.266);
  const rings = [[1.24, -0.029], [1.32, 0.114], [1.30, 0.523], [1.22, 0.684], [1.02, 0.779], [0.55, 0.827], [0.02, 0.836]];
  meshDome(P, rings, 0.93);
  // BV cheek WING PLATES seated ON the face
  for (const s of [-1, 1]) {
    P.add('turretTrack', box(0.10, 0.49, 0.70), s * 0.99, 0.27, 0.55, -0.15, s * -0.24, 0);
    P.add('turretTrack', box(0.09, 0.42, 0.58), s * 0.78, 0.29, 0.88, -0.18, s * -0.10, 0);
  }
  // LEFT roof gallery strip: ref plateau 2.173 over z -1.6..-0.25 (pub 2.17)
  for (let gi = 0; gi < 4; gi++) {
    P.add('turret', box(0.52, 0.09, 0.42), -0.60, 1.079, 0.46 - 0.645 + gi * 0.43);
    P.add('turretDark', box(0.44, 0.02, 0.38), -0.60, 1.114, 0.46 - 0.645 + gi * 0.43);
  }
  // narrow center face bulge around the gun port
  P.add('turret', box(0.30, 0.72, 0.24), -0.05, 0.52, 1.10);
  // sloped two-part bustle
  P.add('turret', box(1.70, 0.72, 0.55), 0, 0.55, -1.28);
  P.add('turret', box(1.70, 0.50, 0.44), 0, 0.25, -1.80);
  P.add('turretDark', box(1.7, 0.42, 0.04), 0, 0.30, -2.00);
  P.add('turretCloth', box(1.5, 0.13, 0.50), 0, 0.79, -1.02, 0.12, 0, 0);
  // rear rack rails + LONGITUDINAL corner drums + thin center rods
  for (const s of [-1, 1]) P.add('turretDetail', box(0.05, 0.05, 1.09), s * 0.60, -0.02, -1.91);
  for (const s of [-1, 1]) {
    P.add('turret', cylZ(0.165, 0.80, 12), s * 0.82, 0.06, -2.55);
    P.add('turretDark', cylZ(0.17, 0.03, 12), s * 0.82, 0.06, -2.18);
    P.add('turretDetail', cylZ(0.055, 1.45, 8), s * 0.15, 0.095, -2.55);
    P.add('turretDark', cylZ(0.088, 0.14, 8), s * 0.15, 0.13, -3.22);   // rod end caps (ref -4.45..-4.55 band)
  }
  // commander cupola LEFT (ref 2.173 = the plateau top; head carries it)
  P.add('turret', cylY(0.20, 0.22, 0.15, 14), -0.68, 0.895, -0.09);
  P.add('turretDark', cylY(0.10, 0.11, 0.095, 10), -0.68, 1.00, -0.09);
  P.add('turret', cylY(0.10, 0.10, 0.066, 10), -0.68, 1.085, -0.09);
  P.add('turret', box(0.34, 0.23, 0.39), 0.10, 0.895, -0.33);
  P.add('turretDark', box(0.22, 0.15, 0.05), 0.10, 0.915, -0.11);
  // ORACLE-PARITY: the print parents thin fender-line rails into the
  // turret (plan x -1.49 z +1.1..-4.0; x +1.20 z -0.75..-3.70, side band
  // ~1.34..1.39) — matched as thin turret rails at the same seats
  P.add('turretDetail', box(0.03, 0.05, 5.08), -1.49, 0.315, -0.18);
  P.add('turretDetail', box(0.03, 0.05, 2.94), 1.20, 0.315, -0.96);
  nsvt(P, -0.45, 0.57, -0.93);
  P.add('turret', KIT.sph(0.114, 12, Math.PI / 2), 0.45, 0.715, -0.16);
  domeRailRu(P, rings, 0.93, 0.38, 0.98);
  // ---- 125 mm 2A46-2 on the normalized tube: axis 1.445, muzzle world
  // +4.61 (overall 9.225 = published, matching the stretched print) ----
  P.gunG.position.set(0, 0.399, 1.634);
  ruSaddle(P, { rollR: 0.143, rollW: 0.22, tubeR: 0.091, rootL: 0.6 });
  P.addGunExtra(box(0.20, 0.114, 0.39), 0, 0.143, 0.46);                // KTD hood
  P.addGunExtra(box(0.22, 0.30, 0.65), 0, -0.15, 0.41);                 // narrow mantlet collar
  P.addGunExtra(box(0.30, 0.42, 0.46), 0, -0.03, -0.15);               // breech throat to the dome face
  tubeGun(P, [
    [0.60, 2.26, 0.0875], [2.26, 3.31, 0.095], [3.31, 4.01, 0.0875], [4.01, 4.24, 0.0835],
  ], { rings: [[0.95, 0.0895], [1.30, 0.0895], [1.62, 0.0895], [1.94, 0.0895], [2.26, 0.097], [2.61, 0.097], [2.96, 0.097], [3.31, 0.097], [3.66, 0.0895], [4.01, 0.0895]], muzzle: 4.24 });
  const dx4 = ringSkin(rings, 0.36) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [dx4 * 0.99, 0.34, -0.55], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-dx4 * 0.99, 0.34, -0.55], -Math.PI / 2);
  P.topY = 1.09;
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
  P.add('hull', box(2.2, 0.05, 0.30), 0, 1.55, -3.44);      // rear span lip
  P.add('hullDark', box(1.7, 0.03, 0.04), 0, 1.58, -3.57);
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
    wLo: [[-4.14, 1.05], [2.40, 1.03]],
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
  P.add('hullWood', cylX(0.095, 2.0, 10), 0, 1.60, -4.68);   // log rides the drum band (thin-tail rule)
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.102, 0.045, 10), s * 1.0, 1.60, -4.68);
  stowage(P, 'hull', P.rng, [[-1.2, 1.56, -1.6, 0.32, 0.18, 1.4], [1.2, 1.56, -0.6, 0.32, 0.18, 1.6]]);
  ruFlaps(P, { x: 1.46, w: 0.60, front: [0.62, 0.55], frontZ: 2.34 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.21, wheelY: 0.46, xc: 1.35, dishR: 0.84,
    wheelZs: evenStations(6, 4.45, -0.75),
    sprocket: { z: -3.55, y: 0.75, r: 0.31 }, idler: { z: 2.10, y: 0.62, r: 0.29 },
    rollers: [-2.4, -0.75, 0.9].map((z) => ({ z, y: 0.86, r: 0.086 })),
    trackW: 0.58, topY: 0.90, botY: 0.075, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.75, z0: -3.20, z1: 2.10, yTop: 1.30, yBot: 0.60, panels: 6, th: 0.10 });

  // ---- turret: Super-Dolly dome + K-1 + 902B left bank (roof at 2.26) ----
  P.turretG.position.set(0, 1.455, -0.70); // r6: keep the r5 seat (roof-band probe misled)
  const rings = [[1.30, -0.03], [1.36, 0.10], [1.31, 0.36], [1.16, 0.56], [0.86, 0.70], [0.42, 0.755], [0.02, 0.77]];
  meshDome(P, rings, 0.82);
  const pD = { rings, sz: 0.82, k1Y: 0.10, k1Pitch: 0.24, k1Out: 0.09 };
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
  mast(P, -0.40, 0.72, -0.40, 1.02, 0.020, 0.04);
  // rear deck bins riding the turret rear (bustle band)
  P.add('turret', box(2.15, 0.42, 0.85), 0, 0.60, -1.60);
  P.add('turretDark', box(2.0, 0.32, 0.03), 0, 0.60, -2.04);
  P.add('turretCloth', box(1.6, 0.22, 0.6), 0.1, 0.70, -1.55);
  domeRailRu(P, rings, 0.82, 0.40, 1.1);
  // ---- 2A46M ----
  P.gunG.position.set(0, 0.19, 1.00);
  ruSaddle(P, { rollR: 0.20, rollW: 0.58, tubeR: 0.10, rootL: 0.65 });
  P.addGunExtra(box(0.50, 0.26, 0.42), 0, -0.13, 0.18);
  P.addGunExtra(box(0.42, 0.30, 0.55), 0, 0.0, -0.28);     // root bridge onto the dome (floater guard)
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
  P.addGunExtra(box(0.42, 0.32, 0.55), 0, 0.0, -0.30);     // root bridge onto the dome (floater guard)
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
  ruFlaps(P, { x: 1.47, w: 0.60, front: [0.65, 0.60], frontZ: 2.58 });
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
  P.turretG.position.set(0, 1.52, -0.72); // r7: resurrected-ref dome front (+0.1..0.3 plan)
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
  P.gunG.position.set(0, 0.105, 1.52); // world pivot unchanged after the -0.47 turret shift
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
    deck: [[-3.32, 1.53], [-1.94, 1.61], [-0.5, 1.58], [1.26, 1.55], [2.21, 1.52], [2.69, 1.40], [3.16, 1.34], [3.62, 1.25]],
    belly: [[-3.32, 0.72], [-2.30, 0.19], [2.85, 0.25], [3.35, 0.48], [3.62, 0.66]],
    wUp: [[-3.32, 1.10], [-3.10, 1.78], [3.20, 1.78], [3.62, 1.45]],
    wLo: [[-3.32, 0.90], [3.62, 0.88]],
    sponsonY: 0.88,
  });
  widthAnchor(P, 1.89, 0.95, 0.3);
  // span-matching lips: thin sub-body plates carry the hull MASK SPAN to
  // the ref's -3.84..+3.76 so the 14 station slices align, while the BODY
  // (12% filter) stays inside the published-dims window.
  P.add('hull', box(2.4, 0.05, 0.45), 0, 1.50, -3.44);
  P.add('hullDark', box(1.9, 0.03, 0.04), 0, 1.53, -3.64);
  ruDeck(P, { deckY: 1.57, hatchZ: 2.35, gz: -1.85, grilles: 5, gw: 1.5 });
  ruGlacisKit(P, { w: 3.5, y: 1.28, z: 2.90, eyeZ: 3.20, hookY: 0.75, hookZ: 3.32 });
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.72, 0.075, 0.30), s * 0.42, 1.40 - row * 0.075, 2.55 + row * 0.32, -0.42, s * 0.35, 0);
  }
  KIT.towCable(P, [[-1.25, 1.48, 2.3], [0, 1.55, 1.8], [1.25, 1.48, 2.3]]);
  stowage(P, 'hull', P.rng, [[0.2, 1.64, -3.10, 1.7, 0.18, 0.45]]);
  ruFlaps(P, { x: 1.46, w: 0.60, front: [0.70, 0.50], frontZ: 3.46 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.385, wheelW: 0.21, wheelY: 0.46, xc: 1.46, dishR: 0.84,
    wheelZs: evenStations(6, 4.5, 0.15),
    sprocket: { z: -2.73, y: 0.80, r: 0.31 }, idler: { z: 3.22, y: 0.68, r: 0.30 },
    rollers: [-1.55, 0, 1.6].map((z) => ({ z, y: 0.84, r: 0.086 })),
    trackW: 0.58, topY: 0.88, botY: 0.05, paintedEnds: true, coveredTop: true, arms: true,
  });
  ruSkirtBand(P, { x: 1.845, z0: -3.25, z1: 3.45, yTop: 1.32, yBot: 0.55, panels: 7, th: 0.08 });
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
  P.add('turret', box(2.05, 0.58, 1.55), 0, 0.41, -2.18);
  P.add('turretDark', box(2.07, 0.46, 0.05), 0, 0.41, -2.93);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.72, 0.12, 0.95), s * 0.55, 0.64, -2.05);
  P.add('turret', box(1.6, 0.05, 0.95), 0, 0.71, 0.0);   // roof plateau slab at the 2.26 ceiling
  const pW = { rings: [[tw, 0], [tw * 0.96, h * 0.6], [tw * 0.9, h]], sz: 0.95 };
  eraRuCheeks(P, { ...pW, weldFlat: true }, 'relikt');
  // pano tower left + UDP RWS right, folded to the published roof (the
  // print's 3.15 towers are a packet cap); pano head is the spike column
  P.add('turretDetail', box(0.20, 0.46, 0.20), -0.62, 0.48, -0.85);
  P.add('turretDark', cylY(0.055, 0.055, 0.16, 10), -0.62, 0.76, -0.85);
  P.add('turret', box(0.44, 0.38, 0.50), 0.32, 0.50, -1.35);
  P.add('turretDark', box(0.12, 0.14, 0.20), 0.32, 0.64, -1.35);
  P.add('turretDark', cylZ(0.024, 0.62, 8), 0.32, 0.70, -1.00, -0.04, 0, 0);
  P.add('turretGlass', box(0.12, 0.09, 0.02), 0.24, 0.56, -1.11);
  P.add('turret', box(0.30, 0.36, 0.30), -0.85, 0.50, -0.30);
  // ---- 2A46M-5 + MRS bulge ----
  P.gunG.position.set(0, 0.375, 1.30);
  ruSaddle(P, { rollR: 0.22, rollW: 0.64, tubeR: 0.115, rootL: 0.75 });
  P.addGunExtra(box(0.66, 0.44, 0.30), 0, 0.14, 0.16);
  tubeGun(P, [
    [0.80, 3.56, 0.115], [3.56, 4.59, 0.105],
  ], { rings: [[0.84, 0.117], [3.56, 0.107], [4.45, 0.107]], muzzle: 4.59 });
  P.add('gun', cylZ(0.128, 0.26, 14), 0, 0, 3.72);          // MRS/evac bulge
  P.add('gunDark', cylZ(0.13, 0.035, 14), 0, 0, 3.86);
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
        const t = Math.PI / 2 + s * ((p.k1T0 ?? 0.22) + i * (p.k1Step ?? 0.21));
        put(t, y, 0.30, p.k1H ?? 0.24, 0.16, -0.24 - row * 0.09, 'turretTrack', skinD(t, y) + (p.k1Out ?? 0.03));
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
