// British family procedural profiles — FROM-SCRATCH rebuild (2026-07-31).
// Authored against the measured silhouette curves in
// docs/references/profiles/<id>.json (mask-trace polylines decoded to
// hull-centered world meters; the UK oracles sit z-shifted in the lab frame,
// which the per-view centroid alignment absorbs) plus the packets in
// docs/references/tanks/<id>.md. Hulls are lofted station slabs following
// the measured deck/belly polylines; turrets are authored from the
// whole-minus-hull band. Oracles: recovered chieftain5 / challenger1 /
// fv510 GLBs and the re-repaired m_bergman centurion / comet / charioteer /
// A30 prints (assembled turrets — the honest curves).
import { KIT, evenStations } from './kit.js';

const {
  box, cylX, cylY, cylZ, sph, torus, slab, frustum, lathe, buildRunningGear,
  buildGun, liftEye, periscope, headlight, cupola, pintleMG, smokeCluster,
  stowage, tarpRoll, jerryCan, spareTrackStrip,
} = new Proxy({}, { get: (_, name) => (...args) => KIT[name](...args) });

// ---------------------------------------------------------------------------
// Curve helpers (same discipline as the Abrams module: the deck/belly tables
// are the measured polylines, tilt-compensated ~0.05x(plate half width)).
// ---------------------------------------------------------------------------
function lineAt(pts, z) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
      return y0 + (y1 - y0) * ((z - z0) / ((z1 - z0) || 1));
    }
  }
  return (Math.abs(z - pts[0][0]) < Math.abs(z - pts[pts.length - 1][0]) ? pts[0] : pts[pts.length - 1])[1];
}

function loftBand(P, bucket, halfW, inset, top, bottomAt, zA, zB, extraZ = []) {
  const zs = [...new Set([zA, zB, ...top.map((p) => p[0]), ...extraZ]
    .filter((z) => z >= Math.min(zA, zB) - 1e-6 && z <= Math.max(zA, zB) + 1e-6)
    .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
  for (let i = 0; i < zs.length - 1; i++) {
    const zf = zs[i], zr = zs[i + 1];
    const tf = lineAt(top, zf), tr = lineAt(top, zr);
    const bf = bottomAt(zf), br = bottomAt(zr);
    if (tf - bf < 0.015 && tr - br < 0.015) continue;
    P.add(bucket, slab(
      [-halfW, bf, zf], [halfW, bf, zf], [halfW, br, zr], [-halfW, br, zr],
      [-(halfW - inset), tf, zf], [halfW - inset, tf, zf],
      [halfW - inset, tr, zr], [-(halfW - inset), tr, zr]));
  }
}

// Generic UK hull: curve-lofted bow wedge + full band + stern wedge (+ rear
// shelf), fenders, optional skirts, running gear. All values world meters.
function ukHull(P, g) {
  const bw = g.bodyHalfW;
  const bowZ = g.noseRake[0][0];
  const sternZ = g.tailRake[0][0];
  const innerW = g.trackXc - g.trackW / 2 - 0.02;
  P.add('hull', box(innerW * 2, g.beltTop - g.belly, (bowZ - sternZ) + 0.4),
    0, (g.beltTop + g.belly) / 2, (bowZ + sternZ) / 2);
  // TRACK CONTAINMENT (owner law 2026-08-03, GEOMETRY-GATE.md #4): the bow/
  // stern rake lofts must stay OUT of the track channel — g.rakeHalfW pins
  // the below-deck rake width to the inter-track span where the wrap arcs
  // and climbing runs live. Silhouettes are unchanged: the tracks own those
  // side/front columns by construction.
  const rakeW = g.rakeHalfW ?? bw * 0.96;
  loftBand(P, 'hull', rakeW, 0.04, g.deck, (z) => lineAt(g.noseRake, z),
    g.nose, bowZ, g.noseRake.map((p) => p[0]));
  loftBand(P, 'hull', bw, g.deckInset ?? 0.08, g.deck, () => g.beltTop, bowZ, sternZ);
  loftBand(P, 'hull', g.rakeHalfW ?? bw * 0.94, 0.04, g.deck, (z) => lineAt(g.tailRake, z),
    sternZ, g.tailRake[g.tailRake.length - 1][0], g.tailRake.map((p) => p[0]));
  if (g.tailShelf) {
    loftBand(P, 'hull', g.rakeHalfW ?? bw * 0.94, 0.04, g.deck, () => g.tailShelf.yBot, g.tailShelf.z0, g.tailShelf.z1);
  }
  // Fender plates over the tracks. Outer edge defaults to the track edge;
  // g.fenderHalfW/g.fenderHalfWL pin it (right/left) so the widest full-length
  // plane reads the published width without breaching the width guard.
  if (g.fenderY) {
    for (const side of [-1, 1]) {
      const outer = side < 0 ? (g.fenderHalfWL ?? g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02))
        : (g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02));
      const inner = g.trackXc - g.trackW * 0.55;
      P.add('hullDetail', box(outer - inner, 0.035, g.fenderZ1 - g.fenderZ0),
        side * (inner + outer) / 2, g.fenderY, (g.fenderZ0 + g.fenderZ1) / 2);
      // plate-fill r1 (owner directive 2026-08-01, GEOMETRY-GATE.md "Plate
      // fill rule"): the flat fender plane rides ABOVE the deck line where
      // the glacis/tail falls away — the open wedge between the plate
      // underside and the hull top read as a see-through shell from every
      // low angle (centurion bow: a 0.3 m sky wedge THROUGH the vehicle).
      // Close it with lofted mudguard solids from the deck line up to the
      // plate wherever the deck drops below it. Silhouette-inert by
      // construction: the fill lives inside the plate's own plan footprint,
      // under its 1.6-line side columns, and inside front columns already
      // banded by the plate edge + skirts/tracks.
      const fy = g.fenderY - 0.004;
      const zKnots = [...new Set([g.fenderZ0, g.fenderZ1,
        ...g.deck.map((p) => p[0]).filter((z) => z > g.fenderZ0 && z < g.fenderZ1)]
        .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
      for (let i = 0; i < zKnots.length - 1; i++) {
        const zf = zKnots[i], zr = zKnots[i + 1];
        const df = Math.min(lineAt(g.deck, zf), fy), dr = Math.min(lineAt(g.deck, zr), fy);
        if (fy - df < 0.02 && fy - dr < 0.02) continue;
        const xi = Math.min(side * inner, side * outer), xo = Math.max(side * inner, side * outer);
        P.add('hull', slab(
          [xi, df, zf], [xo, df, zf], [xo, dr, zr], [xi, dr, zr],
          [xi, fy, zf], [xo, fy, zf], [xo, fy, zr], [xi, fy, zr]));
      }
    }
  }
  // Optional armored skirts (measured plane).
  if (g.skirt) {
    const sk = g.skirt;
    const panels = g.skirtPanels ?? 6;
    const panelD = (sk.z1 - sk.z0) / panels;
    for (const side of [-1, 1]) {
      for (let k = 0; k < panels; k++) {
        const z = sk.z1 - panelD / 2 - k * panelD;
        P.add('hull', box(0.05, sk.top - sk.bot, panelD * 0.97), side * (sk.x - 0.025), (sk.top + sk.bot) / 2, z);
        if (P.q) {
          P.add('hullDark', box(0.05, (sk.top - sk.bot) * 0.9, 0.016), side * (sk.x - 0.02), (sk.top + sk.bot) / 2, z - panelD / 2);
          P.add('hullDetail', box(0.02, 0.05, 0.2), side * (sk.x + 0.005), sk.top - 0.1, z);
        }
      }
      P.add('hullDark', box(0.014, 0.035, sk.z1 - sk.z0 - 0.1), side * (sk.x - 0.01), sk.top + 0.02, (sk.z0 + sk.z1) / 2);
    }
  }
  buildRunningGear(P, {
    style: g.wheelStyle ?? 'dished', wheelR: g.wheelR, wheelW: Math.min(0.24, g.trackW * 0.42),
    wheelY: g.wheelY ?? g.wheelR + 0.05, xc: g.trackXc, wheelZs: g.wheelZs,
    sprocket: g.sprocket, idler: g.idler, rollers: g.rollers ?? [],
    trackW: g.trackW, topY: g.trackTop, paintedEnds: true,
    coveredTop: g.coveredTop ?? !!g.skirt, arms: g.arms ?? !g.skirt,
  });
  // Mud flaps hang from the FENDER TIPS (hanging them at the hull nose/tail
  // left them floating over the raked plates -> articulation floaters).
  for (const side of [-1, 1]) {
    if (!g.noFlaps && g.fenderY) {
      P.add('hullRubber', box(g.trackW * 0.9, 0.26, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.10, g.fenderZ1 - 0.025, -0.06, 0, 0);
      P.add('hullRubber', box(g.trackW * 0.9, 0.24, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.09, g.fenderZ0 + 0.025, 0.06, 0, 0);
    }
  }
  P.decal('hull', 'number', P.spec.visual.number || '', 0.38, [bw + 0.01, (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.38, [-(bw + 0.01), (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0], -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Chieftain Mk.5 — full from-scratch build (recovered oracle, repaired rig).
// Round-2 retable against the BATCH-5 REPAIRED oracle (369 stranded turret
// members — chin casting band, discharger banks, searchlight face, cupola
// glass, rack contents, waist kit — absorbed into the turret; the old
// "split-rig mirror" cert is OBSOLETE). Fresh curves: bare hull deck 1.56-
// 1.61 mid, fender crests 1.69/1.71 only at z ~1.7 and -1.7..-2.35, bow
// bottom on the ground to z 2.42 then rising to a 0.83-0.97 blade tip, tail
// rake from -2.35 to the 1.05 shelf. The casting waist, collar, cupola and
// flank racks all live in the TURRET buckets now (they yaw together).
const CHIEFTAIN_HULL = {
  bodyHalfW: 1.58, nose: 3.735,
  deck: [[3.735, 1.06], [3.52, 1.22], [3.28, 1.27], [3.03, 1.36], [2.78, 1.37],
    [2.54, 1.41], [2.30, 1.47], [2.05, 1.53], [1.86, 1.68], [1.62, 1.56],
    [1.10, 1.58], [0.30, 1.60], [-0.60, 1.61], [-1.35, 1.64], [-1.74, 1.71],
    [-2.35, 1.71], [-3.20, 1.70], [-3.57, 1.66]],
  beltTop: 1.02, belly: 0.44,
  // Body rakes stay at the belly line — the ground-level bow/tail silhouette
  // belongs to the tracks (idler/sprocket descents), not the hull plates.
  noseRake: [[2.55, 0.44], [2.90, 0.46], [3.28, 0.55], [3.52, 0.68], [3.735, 0.80]],
  tailRake: [[-2.30, 0.44], [-2.72, 0.45], [-3.08, 0.48], [-3.32, 0.57]],
  tailShelf: { z0: -3.32, z1: -3.735, yBot: 1.05 },
  // The fender ASYMMETRY cert STANDS after the repair: the ref's LEFT fender
  // runs full-length at x -1.65..-1.77 while the right plane stops ~1.53
  // (the right-side width is completed by the engine-bay bin at the
  // committed plane). Mid-run fenders sit under the deck line; the plates
  // end at the front crest, with low sweep strips carrying the plan forward.
  fenderY: 1.575, fenderZ0: -3.05, fenderZ1: 1.9, fenderHalfW: 1.50, fenderHalfWL: 1.75,
  rakeHalfW: 1.00, // containment law: rake lofts clear of the 1.07..1.51 track channel (dilated)
  trackXc: 1.29, trackW: 0.44, wheelR: 0.33, wheelY: 0.38, wheelStyle: 'rubber',
  wheelZs: [2.3, 1.42, 0.54, -0.34, -1.22, -2.1],
  sprocket: { z: -2.52, y: 0.48, r: 0.32 }, idler: { z: 2.58, y: 0.42, r: 0.3 },
  rollers: [{ z: 1.45, y: 0.82, r: 0.09 }, { z: 0.1, y: 0.82, r: 0.09 }, { z: -1.25, y: 0.82, r: 0.09 }],
  trackTop: 0.98, arms: true,
};

function chieftain5Build(P) {
  const g = CHIEFTAIN_HULL;
  ukHull(P, g);
  const { rng } = P;
  // Glacis furniture: flush splash rail, driver periscope, headlight pods
  // (the fender crest at z ~1.7 in the fresh curves), shackles.
  P.add('hullDetail', box(1.7, 0.035, 0.08), 0, deckAtUK(g, 2.42) + 0.02, 2.42);
  periscope(P, 'hullDetail', -0.3, deckAtUK(g, 1.95) + 0.01, 1.95);
  for (const side of [-1, 1]) {
    headlight(P, side * 1.15, 1.30, 2.92, -0.2);
    P.add('hullDetail', box(0.24, 0.02, 0.18), side * 1.15, 1.38, 2.9, -0.25, 0, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), side * 0.9, 0.66, 3.36);
    P.add('hullDetail', torus(0.065, 0.017, 10), side * 0.9, 0.66, 3.47, Math.PI / 2, 0, 0);
    // Fender crest plates: the fresh ref side tops 1.69 at z ~1.7 and 1.71
    // over the engine bay only — the mid-run fenders sit under the deck line.
    P.add('hullDetail', box(0.42, 0.03, 0.55), side * 1.35, 1.675, 1.72);
    P.add('hullDetail', box(0.42, 0.03, 1.3), side * 1.35, 1.695, -2.02);
    // plate-fill r1 (owner directive 2026-08-01): both crest plates floated
    // 9 cm ABOVE the fender plane with a see-through slot beneath — they
    // are raised stowage bins on the real vehicle. Close plate-to-fender
    // (tops tuck under the plates; interior to their side/plan columns).
    P.add('hullDetail', box(0.42, 0.085, 0.55), side * 1.35, 1.6325, 1.72);
    P.add('hullDetail', box(0.42, 0.085, 1.3), side * 1.35, 1.6375, -2.02);
  }
  // Engine deck: louvre field + fuel caps + rear grille face.
  P.add('hull', box(2.2, 0.04, 1.15), 0, 1.68, -2.65);
  if (P.q) for (let i = 0; i < 6; i++) {
    P.add('hullDark', box(2.05, 0.018, 0.05), 0, 1.71, -2.2 - i * 0.17);
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.03, 10), side * 1.15, 1.72, -1.9);
  P.add('hullDark', box(2.6, 0.5, 0.03), 0, 1.30, -3.77);
  P.add('hullDetail', box(2.7, 0.05, 0.05), 0, 1.62, -3.76);
  towCableUK(P);
  // Hull-legit fender furniture (stays in the hull mask like the repaired
  // oracle's fused-root bins): RIGHT-side tall bin run over the engine-bay
  // fender (z -0.25..-1.41, top 2.2 — its face IS the right width plane) +
  // a LOW left bin (left tall stowage is rack gear that yaws now).
  P.add('hull', box(0.34, 0.42, 1.16), 1.57, 2.0, -0.83);
  P.add('hullDark', box(0.35, 0.02, 1.10), 1.57, 2.21, -0.83);
  // plate-fill r1 (owner directive 2026-08-01): the tall bin FLOATED 0.2 m
  // above the fender plane — a clean see-through slot ran under the whole
  // width-committing face (ray-probed: sight lines crossed the vehicle
  // untouched between bin bottom 1.79 and fender 1.59). The REF's own bin
  // floats too (a full-width fill moved front_whole 47.3 -> 45.6: the
  // certified silhouette owns that air), so the corridor closes INBOARD:
  // a web at the right fender's own 1.50 plane, bin bottom to fender top.
  // Sight lines under the bin now end on shadowed structure instead of
  // crossing the vehicle; the authentic bin-overhang read stays.
  P.add('hull', box(0.10, 0.21, 1.16), 1.45, 1.685, -0.83);
  P.add('hull', box(0.30, 0.14, 1.5), -1.55, 1.63, 1.6);
  tarpRoll(P, 'hullCloth', 1.42, 1.63, -2.2, 1.0, 0.07, false);
  // LEFT track-guard planes (ref front: outer lip band 0.6..1.6 at x -1.74,
  // inner deep run to the GROUND at -1.65..-1.69) + a right guard lip; the
  // forward fender sweep strips carry the plan run to the bow (right side
  // stops at the ref's 1.53 plane).
  P.add('hull', box(0.06, 1.01, 5.1), -1.745, 1.095, 0.1);
  P.add('hull', box(0.07, 1.55, 5.1), -1.665, 0.805, 0.1);
  P.add('hull', box(0.06, 0.98, 4.85), 1.50, 1.08, 0.0);
  for (const s of [-1, 1]) {
    const xo = s < 0 ? 1.75 : 1.53;
    P.add('hullDetail', box(xo - 1.06, 0.03, 0.95), s * (1.06 + xo) / 2, 1.44, 2.35);
    P.add('hullDetail', box(xo - 1.06, 0.03, 0.85), s * (1.06 + xo) / 2, 1.15, 3.2);
  }

  // ---- the FULL casting yaws (batch-5 repaired rig): waist + collar +
  // cupola + racks + crown + gun + masts, all in the turret buckets ----
  P.turretG.position.set(0, 1.72, 0.02);
  P.gunG.position.set(0, 0.145, 0.62);
  // Saucer crown (non-cupola crown 2.44-2.56 in the fresh curves).
  P.add('turret', KIT.lathe([
    [1.30, 0.13], [1.32, 0.30], [1.22, 0.50], [1.05, 0.64], [0.78, 0.74], [0.45, 0.79], [0.02, 0.80],
  ], 30, 1.35), 0, 0, -0.30);
  P.add('turret', slab(                                               // reclined face
    [-0.55, -0.28, 1.42], [0.55, -0.28, 1.42], [0.62, -0.25, 0.35], [-0.62, -0.25, 0.35],
    [-0.3, 0.62, 0.10], [0.3, 0.62, 0.10], [0.5, 0.70, -0.4], [-0.5, 0.70, -0.4]));
  P.add('turret', slab(                                               // chin to the mantlet
    [-0.5, -0.31, 1.30], [0.5, -0.31, 1.30], [0.6, -0.31, 0.2], [-0.6, -0.31, 0.2],
    [-0.55, -0.28, 1.44], [0.55, -0.28, 1.44], [0.62, -0.25, 0.4], [-0.62, -0.25, 0.4]));
  // Casting waist band (ex-hull static works, absorbed by the oracle repair):
  // ring collar behind the gun (top 2.43 world, z -0.85..0.05).
  P.add('turret', box(2.90, 0.66, 0.90), 0, 0.38, -0.42);
  P.add('turretDark', box(2.74, 0.03, 0.8), 0, 0.695, -0.42);
  // Right forward waist tier (top 2.29, z 0.05..1.42).
  P.add('turret', box(0.76, 0.62, 1.38), 1.02, 0.26, 0.73);
  P.add('turretDark', box(0.76, 0.02, 1.32), 1.02, 0.57, 0.73);
  // Left forward step — IR searchlight face (top 2.24).
  P.add('turret', box(0.55, 0.56, 0.85), -1.0, 0.24, 0.53);
  P.add('turretDark', box(0.42, 0.34, 0.05), -1.0, 0.30, 0.97, -0.1, 0, 0);
  P.add('turretGlass', box(0.32, 0.24, 0.02), -1.0, 0.30, 1.0, -0.1, 0, 0);
  // Chin casting band over the driver (ref 2.09 at z 1.93 -> 2.32 at 1.44).
  P.add('turret', slab(
    [-0.62, 0.10, 1.42], [0.62, 0.10, 1.42], [0.66, 0.14, 0.9], [-0.66, 0.14, 0.9],
    [-0.55, 0.34, 1.95], [0.55, 0.34, 1.95], [0.62, 0.58, 0.95], [-0.62, 0.58, 0.95]));
  P.add('turretCloth', box(0.5, 0.16, 0.5), 0, 0.30, 1.72, -0.24, 0, 0);
  // Cupola drum on the crown (periscope ring 2.875 = published-height p95).
  P.add('turret', cylY(0.30, 0.34, 0.28, 16), -0.45, 0.84, -0.42);
  P.add('turret', cylY(0.26, 0.28, 0.16, 16), -0.45, 1.06, -0.42);
  P.add('turretDark', torus(0.24, 0.022, 18), -0.45, 1.155, -0.42);
  for (let k = 0; k < 5; k++) {
    const a = -0.8 + k * 0.5;
    P.add('turretDark', box(0.07, 0.05, 0.05), -0.45 + Math.sin(a) * 0.24, 1.125, -0.42 + Math.cos(a) * 0.24, 0, a, 0);
  }
  P.add('turretDark', box(0.06, 0.1, 0.06), -0.45, 1.12, -0.64);
  P.add('turretDark', box(0.09, 0.08, 0.26), -0.45, 1.135, -0.58);
  P.add('turretDark', cylX(0.02, 0.4, 8), -0.45, 1.14, -0.44);
  // Loader hatch ring right of the cupola.
  P.add('turretDetail', cylY(0.19, 0.21, 0.06, 14), 0.46, 0.70, -0.54);
  // Crown furniture: gunner sight ON the crown.
  P.add('turret', box(0.2, 0.1, 0.24), 0.3, 0.78, -0.14);
  P.add('turretGlass', box(0.14, 0.045, 0.03), 0.3, 0.80, -0.01);
  // Twin sight/searchlight masts at the oracle's stations: SLIM columns
  // (front view: 1-2 pixel columns each) to 3.70 at (x +0.89, z 0.52) and
  // 3.52 at (x -1.23, z 0.46) — both in the same 2-column side window.
  P.add('turret', box(0.06, 0.80, 0.05), 0.89, 0.90, 0.50);
  P.add('turretDark', box(0.035, 0.78, 0.035), 0.89, 1.59, 0.50);
  P.add('turretDetail', box(0.05, 0.08, 0.05), 0.89, 1.94, 0.50);
  P.add('turret', box(0.06, 0.74, 0.05), -1.23, 0.80, 0.44);
  P.add('turretDark', box(0.035, 0.70, 0.035), -1.23, 1.44, 0.44);
  P.add('turretDetail', box(0.05, 0.08, 0.05), -1.23, 1.77, 0.44);
  // Whip antenna: base pot on the crown rear + slim mast (one column, to
  // 3.78, ref x +0.71, z -0.88).
  P.add('turret', box(0.1, 0.3, 0.1), 0.71, 0.82, -0.90);
  P.add('turretDark', box(0.022, 1.1, 0.022), 0.71, 1.51, -0.90);
  liftEye(P, 'turretDetail', -0.84, 0.62, 0.35, 0.4);
  liftEye(P, 'turretDetail', 0.84, 0.62, 0.35, -0.4);
  // Smoke discharger bins on bracket arms, below the brow.
  for (const sd of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.05, 0.05), sd * 0.68, 0.1, 0.9, 0, sd * 0.35, 0);
    P.add('turretDark', box(0.15, 0.17, 0.36), sd * 0.9, 0.08, 0.92, 0, sd * 1.1, 0);
    smokeCluster(P, sd * 0.95, 0.2, 0.98, 6, sd * 1.2, 0.8);
  }
  // Flank rack tiers (rack walls + strapped contents — the oracle absorbed
  // these into the turret): inner tier top 2.31 (z -0.95..-1.5), outer run
  // top 2.20 to z -2.1, x out to +-1.46.
  for (const sd of [-1, 1]) {
    P.add('turret', box(0.70, 0.54, 0.62), sd * 1.14, 0.32, -1.42);
    P.add('turretDark', box(0.70, 0.02, 0.56), sd * 1.14, 0.60, -1.42);
    P.add('turret', box(0.62, 0.42, 0.55), sd * 1.16, 0.26, -1.92);
    P.add('turretDark', box(0.62, 0.02, 0.50), sd * 1.16, 0.48, -1.92);
    P.add('turret', box(0.05, 0.50, 1.10), sd * 1.51, 0.30, -1.55);
  }
  // Bustle bins + NBC pack (turret mask: bottom 1.78, top 2.30 world).
  P.add('turret', box(1.5, 0.5, 0.6), 0, 0.31, -1.62);
  P.add('turretDark', box(1.38, 0.03, 0.5), 0, 0.57, -1.62);
  P.add('turret', box(1.15, 0.42, 0.5), 0.1, 0.26, -2.02);
  P.add('turretDark', box(0.4, 0.24, 0.04), 0.1, 0.24, -2.24);
  P.add('turretDetail', box(1.7, 0.04, 0.04), 0, 0.50, -2.24);
  P.add('turretDetail', box(1.7, 0.04, 0.04), 0, 0.12, -2.24);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.03, 0.36, 0.03), -0.8 + k * 0.32, 0.31, -2.24);
  stowage(P, 'turretCloth', rng, [[-0.35, 0.60, -1.9, 0.7, 0.18, 0.36]]);
  jerryCan(P, 'turretDetail', 0.58, 0.64, -1.92, 0.15);
  // L11A5 straight out of the casting: collar -> sleeve -> evac -> MRS.
  // Published overall 10.79 -> muzzle at +7.03 (oracle tube ends 6.82).
  P.addGunExtra(box(0.4, 0.4, 0.4), 0, 0, 0.15);
  P.addGunExtra(cylZ(0.145, 0.62, 16, 0.215), 0, 0, 0.45);
  P.addGunExtraDark(cylZ(0.152, 0.05, 16), 0, 0, 0.72);
  buildGun(P, { len: 6.39, r: 0.09, sleeve: true, evac: 0.56, collar: false, baseR: 0.16 });
  P.add('gun', cylZ(0.105, 0.09, 12), 0, 0, 6.39 - 0.5);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.1, 0.3, -0.6], Math.PI / 2);
  P.topY = 1.15;
}

// Shared UK tow cable on the glacis with clamp cleats.
const deckAtUK = (g, z) => lineAt(g.deck, z);

function towCableUK(P) {
  KIT.towCable(P, [[-1.0, 1.52, 2.2], [0, 1.62, 1.7], [1.0, 1.52, 2.2]]);
  P.add('hullDetail', box(0.1, 0.24, 0.14), -1.0, 1.45, 2.2);
  P.add('hullDetail', box(0.1, 0.24, 0.14), 1.0, 1.45, 2.2);
}

// ---------------------------------------------------------------------------
// Challenger 1 Mk.3 — recovered CR1 oracle, BATCH-5 REPAIRED: the four
// width-setting stowage panniers were hinge-folded flush, safeScale is now
// length-keyed and the oracle self-measures ~8.3% larger (the old "7.4%
// small" cert is OBSOLETE). Fresh curves: hull z -4.19..3.77 (7.96 vs the
// published 8.32), deck flat 1.64, engine hump 1.78 at z -1.5..-1.9, tail
// rake from -2.14 into a deep 1.15 undercut shelf, deep inner skirts to the
// ground with the outer armour band hem at 0.64.
// ---------------------------------------------------------------------------
// Published: hull 8.32, overall 11.50, width 3.52, height 2.95 (sovereign).
const CR1_HULL = {
  bodyHalfW: 1.58, nose: 4.16,
  deck: [[4.16, 1.16], [3.90, 1.27], [3.64, 1.32], [3.38, 1.42], [3.13, 1.44],
    [2.87, 1.53], [2.61, 1.575], [2.36, 1.61], [2.10, 1.65], [-1.10, 1.65],
    [-1.37, 1.73], [-1.50, 1.78], [-1.88, 1.78], [-2.01, 1.74], [-2.65, 1.755],
    [-3.17, 1.73], [-3.94, 1.73], [-4.16, 1.58]],
  beltTop: 1.02, belly: 0.44,
  // Body rakes stay at the belly line — the ground bow/tail lines belong to
  // the track band (idler/sprocket descents behind the skirts).
  noseRake: [[2.55, 0.44], [3.13, 0.48], [3.38, 0.53], [3.64, 0.66], [3.90, 1.00], [4.16, 1.10]],
  tailRake: [[-2.10, 0.44], [-2.78, 0.46], [-3.04, 0.52], [-3.42, 0.84]],
  tailShelf: { z0: -3.42, z1: -3.70, yBot: 1.14 },
  skirt: { x: 1.755, top: 1.58, bot: 0.62, z0: -2.35, z1: 3.3 }, skirtPanels: 8,
  fenderY: 1.62, fenderZ0: -2.4, fenderZ1: 3.55, fenderHalfW: 1.755,
  rakeHalfW: 1.19, // containment law: rake lofts clear of the 1.30..1.60 track channel (dilated)
  // Narrow visible track band: the fresh ref grounds only |x| 1.31..1.58
  // (its inner skirt plate hides the rest of the run).
  trackXc: 1.445, trackW: 0.30, wheelR: 0.41, wheelY: 0.46, wheelStyle: 'dished',
  wheelZs: [2.5, 1.62, 0.74, -0.14, -1.02, -1.9],
  sprocket: { z: -2.35, y: 0.50, r: 0.36 }, idler: { z: 2.78, y: 0.46, r: 0.34 },
  trackTop: 0.98, arms: false, coveredTop: true,
};

function challenger1Build(P) {
  const g = CR1_HULL;
  ukHull(P, g);
  // Inner skirt side-plate: near-full-length plane at |x| ~1.5 (the fresh
  // ref plan runs z -3.55..3.82 there) with the hem ABOVE the track run —
  // the ground line belongs to the narrow track band behind it. A second
  // outer layer fills the ref's 0.63-hem band at x 1.57..1.69 (the armour
  // skirt reads THICK in the fresh front view).
  // Containment law: both skirt layers clear the idler/sprocket wrap arcs
  // (inner plate z -1.82..2.28; outer layer pushed to the 1.65..1.73 plane).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.16, 0.52, 4.10), s * 1.50, 0.84, 0.23);
    P.add('hull', box(0.08, 0.94, 4.5), s * 1.69, 1.10, 0.20);
  }
  // Glacis kit: splash board, headlight clusters, tow point, travel lock.
  P.add('hullDetail', box(1.9, 0.06, 0.1), 0, 1.60, 2.5, -0.3, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.3, 0.2, 0.16), s * 1.26, 1.30, 3.2);
    P.add('hullGlass', cylZ(0.055, 0.02, 10), s * 1.32, 1.32, 3.29);
    P.add('hullGlass', cylZ(0.045, 0.02, 10), s * 1.18, 1.32, 3.29);
    P.add('hullDetail', box(0.34, 0.02, 0.2), s * 1.26, 1.42, 3.18, -0.3, 0, 0);
  }
  P.add('hullDetail', box(0.16, 0.12, 0.16), 0, 0.66, 3.5);
  P.add('hullDetail', torus(0.07, 0.018, 10), 0, 0.66, 3.6, Math.PI / 2, 0, 0);
  P.add('hullDetail', box(0.1, 0.3, 0.1), 0, 1.30, 2.4, -0.5, 0, 0);
  P.add('hullDetail', box(0.3, 0.1, 0.1), 0, 1.45, 2.27, -0.5, 0, 0);
  towCableUK(P);
  // Engine deck louvres + rear bin rack across the tail (kept UNDER the
  // 1.78 deck plateau — the fresh ref front tops at 1.78 inside ±0.9).
  P.add('hull', box(2.0, 0.04, 1.3), 0, 1.70, -2.3);
  if (P.q) for (let i = 0; i < 7; i++) {
    P.add('hullDark', box(1.9, 0.018, 0.05), 0, 1.735, -1.8 - i * 0.16);
    P.add('hullDetail', box(1.95, 0.02, 0.04), 0, 1.745, -1.77 - i * 0.16, 0.5, 0, 0);
  }
  // Narrow tail overhang (ref plan: full width ends -3.6, ±1.1 to -4.1).
  P.add('hull', box(2.2, 0.59, 0.46), 0, 1.435, -3.93);
  // plate-fill r1 (owner directive 2026-08-01): the overhang bin + tail
  // shelf hung over a clean SEE-THROUGH tunnel — the tail rake band ends
  // at -3.42/y0.84 and nothing closed the volume up to the 1.14 shelf
  // underside, so low rear-quarter views looked straight through the
  // vehicle. Two solids extend the hull to bin contact: an under-shelf
  // block meeting the rake end, and a recessed lower rear plate under the
  // bin (8 cm behind the bin tail so the overhang read stays). Both stay
  // inside the shelf/bin plan footprints and below their side lines.
  P.add('hull', box(2.96, 0.32, 0.28), 0, 1.00, -3.56);
  P.add('hull', box(2.10, 0.34, 0.38), 0, 0.99, -3.89);
  // Rear-deck bin (the ref's one-column 1.83 bump at z -3.05).
  P.add('hull', box(0.9, 0.16, 0.35), -0.5, 1.75, -3.05);
  P.add('hull', box(1.05, 0.32, 0.2), -0.62, 1.36, -3.62);
  P.add('hull', box(0.85, 0.28, 0.18), 0.68, 1.34, -3.62);
  P.add('hullDark', box(1.06, 0.018, 0.16), -0.62, 1.53, -3.63);
  P.add('hullDetail', box(2.4, 0.04, 0.04), 0, 1.16, -3.68);
  P.decal('hull', 'soot', null, 0.9, [0.6, 1.2, -3.66], Math.PI);

  // ---- wedge-faced Chobham turret (ring y 1.62, z -0.2), retuned to the
  // batch-5 corrected oracle scale: roof plateau 2.69-2.77 world (z 0.7..
  // -0.35), face line 2.04@2.5 -> 2.41@1.1, bustle 2.33 falling to the
  // 2.42 rear-stowage hump and a -2.35 tail ----
  P.turretG.position.set(0, 1.62, -0.2);
  P.gunG.position.set(0, 0.28, 0.62);
  const tw = 1.35;
  // Sloped face from the gun root up to the roof crest.
  P.add('turret', slab(
    [-tw * 0.82, -0.12, 2.3], [tw * 0.82, -0.12, 2.3], [tw, -0.12, 0.6], [-tw, -0.12, 0.6],
    [-tw * 0.56, 0.79, 1.27], [tw * 0.56, 0.79, 1.27], [tw * 0.63, 1.15, 0.60], [-tw * 0.63, 1.15, 0.60]));
  // Crown plateau.
  P.add('turret', slab(
    [-tw, -0.12, 0.62], [tw, -0.12, 0.62], [tw, -0.12, -0.45], [-tw, -0.12, -0.45],
    [-tw * 0.63, 1.15, 0.60], [tw * 0.63, 1.15, 0.60], [tw * 0.63, 1.06, -0.45], [-tw * 0.63, 1.06, -0.45]));
  // Rear roof falling to the bustle.
  P.add('turret', slab(
    [-tw, -0.12, -0.42], [tw, -0.12, -0.42], [tw * 0.97, -0.12, -1.6], [-tw * 0.97, -0.12, -1.6],
    [-tw * 0.63, 1.06, -0.45], [tw * 0.63, 1.06, -0.45], [tw * 0.62, 0.64, -1.6], [-tw * 0.62, 0.64, -1.6]));
  // Bustle tail box + rear stowage hump (ref 2.42 at z -1.88..-2.01).
  P.add('turret', box(1.55, 0.50, 0.56), 0, 0.38, -1.80);
  P.add('turretCloth', box(1.0, 0.20, 0.38), 0, 0.71, -1.80);
  P.add('turretDark', box(1.45, 0.02, 0.48), 0, 0.62, -1.80);
  // Face underside chin closing to the mantlet slot.
  P.add('turret', slab(
    [-0.62, -0.12, 1.5], [0.62, -0.12, 1.5], [0.8, -0.14, 0.4], [-0.8, -0.14, 0.4],
    [-0.6, 0.44, 2.3], [0.6, 0.44, 2.3], [0.82, 0.42, 0.5], [-0.82, 0.42, 0.5]));
  // TOGS thermal barbette RIGHT of the gun root (top ~2.66 world).
  P.add('turret', box(0.52, 0.54, 0.72), 0.82, 0.77, 0.98);
  P.add('turretDark', box(0.42, 0.38, 0.05), 0.82, 0.80, 1.32);
  for (const [px, py] of [[-0.1, 0.1], [0.1, 0.1], [-0.1, -0.08], [0.1, -0.08]]) {
    P.add('turretGlass', cylZ(0.045, 0.03, 10), 0.82 + px, 0.82 + py, 1.36);
  }
  P.add('turretDetail', box(0.54, 0.03, 0.72), 0.82, 1.05, 0.98);
  // Roof: commander sight block carries the published 2.95 height as the
  // p95 anchor, seated at the ref roof's own 2.77 peak zone (z 0.15..0.55)
  // and kept x-SLIM so the front view stays at the ref's 2.6-2.7 line;
  // whip masts take the remaining above-height column budget.
  P.add('turret', box(0.18, 0.40, 0.42), -0.15, 1.13, 0.35);
  P.add('turretDark', box(0.14, 0.10, 0.04), -0.15, 1.24, 0.57);
  P.add('turretGlass', box(0.10, 0.07, 0.02), -0.15, 1.24, 0.595);
  P.add('turret', box(0.34, 0.12, 0.3), 0.28, 1.05, 0.85);
  P.add('turretGlass', box(0.24, 0.06, 0.03), 0.28, 1.07, 1.01);
  P.add('turret', cylY(0.2, 0.22, 0.06, 14), -0.58, 1.09, -0.35);
  P.add('turretDark', box(0.32, 0.014, 0.03), -0.58, 1.125, -0.35);
  // Deep trunnion/breech mass the oracle carries in its turret node.
  P.add('turretDark', box(1.55, 0.5, 1.4), 0, -0.40, 0.85);
  liftEye(P, 'turretDetail', -0.95, 1.03, 0.55, 0.4);
  liftEye(P, 'turretDetail', 0.95, 1.03, 0.55, -0.4);
  // 2x5 smoke discharger banks on both cheeks.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.15, 0.34), s * 1.24, 0.42, 1.42, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.44, 0.55, 1.62, 5, s * 0.95, 0.62);
    smokeCluster(P, s * 1.41, 0.42, 1.66, 5, s * 0.95, 0.62);
  }
  // Flank + rear tubular baskets full of kit.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.16, 0.44, 1.55), s * 1.32, 0.3, -0.75, 0, s * 0.02, 0);
    P.add('turretDark', box(0.17, 0.02, 1.5), s * 1.32, 0.45, -0.75, 0, s * 0.02, 0);
    for (const zc of [-0.25, -1.25]) P.add('turretDark', box(0.17, 0.45, 0.022), s * 1.325, 0.3, zc);
    P.add('turretDetail', box(0.035, 0.035, 1.6), s * 1.42, 0.48, -0.8);
    P.add('turretDetail', box(0.035, 0.035, 1.6), s * 1.42, 0.1, -0.8);
    for (const zr of [-0.1, -0.8, -1.5]) P.add('turretDetail', box(0.03, 0.4, 0.03), s * 1.42, 0.29, zr);
  }
  P.add('turretDetail', box(2.55, 0.04, 0.04), 0, 0.52, -2.05);
  P.add('turretDetail', box(2.55, 0.04, 0.04), 0, 0.14, -2.05);
  for (let k = 0; k < 9; k++) P.add('turretDetail', box(0.03, 0.4, 0.03), -1.2 + k * 0.3, 0.33, -2.05);
  stowage(P, 'turretCloth', P.rng, [
    [-1.38, 0.62, -0.65, 0.3, 0.24, 1.0], [1.38, 0.62, -0.9, 0.3, 0.26, 0.9],
    [-0.45, 0.40, -1.58, 0.8, 0.3, 0.34], [0.55, 0.38, -1.58, 0.7, 0.28, 0.34],
  ]);
  // Whip antennas (ref masts to 3.33 world at z -0.98 / -1.24, x ±1.37),
  // seated on the basket rails so no articulation pose strands them.
  P.add('turretDetail', cylY(0.045, 0.055, 0.1, 8), -1.37, 0.53, -0.92);
  P.add('turretDetail', box(0.022, 1.14, 0.022), -1.37, 1.14, -0.92, 0, 0, -0.02);
  P.add('turretDetail', cylY(0.045, 0.055, 0.1, 8), 0.97, 0.68, -0.98);
  P.add('turretDetail', box(0.022, 1.0, 0.022), 0.97, 1.22, -0.98, 0, 0, 0.02);
  // Canvas dust-cover wedge over the low gun root + L11A5.
  P.add('turretCloth', box(0.55, 0.26, 0.36), 0, 0.52, 2.05, -0.45, 0, 0);
  P.add('turretCloth', box(0.48, 0.18, 0.26), 0, 0.36, 2.35, -0.18, 0, 0);
  P.addGunExtra(box(0.5, 0.44, 0.3), 0, 0.02, 0.35);
  P.addGunExtra(cylZ(0.13, 0.4, 14, 0.18), 0, 0, 0.62);
  // Published 11.50 overall: tail -4.16 -> muzzle +7.34 (oracle tube 6.79 — cover cap).
  buildGun(P, { len: 6.92, r: 0.09, sleeve: true, evac: 0.58, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(0.102, 0.09, 12), 0, 0, 6.42);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [tw + 0.08, 0.35, -0.8], Math.PI / 2);
  P.topY = 1.35;
}

// ---------------------------------------------------------------------------
// Centurion Mk.3 / Mk.5 — re-repaired bergman prints (assembled turrets).
// VERTEX ROUND r1 (2026-08-03): retabled against the registered parity
// tables (tools/tmp-uk-parity.mjs -> shots/uk-r1/centurion5). The print is
// the best-conditioned UK oracle (hull span -1%, width 0%): hull plate runs
// -3.55..+3.48 with a stepped driver plate (1.69 deck -> 1.51 glacis) and a
// vertical nose plate; the ground line belongs to a 24-inch track band at
// |x| 0.94..1.55 with RAISED END WHEELS at the extremes (idler z 3.50
// y 1.03, sprocket z -3.33 y 1.15 — long climbing runs both ends, the rim
// bands carry the silhouette past the hull plates to z +-3.85); fender
// horns over the idlers carry the plan to (x 1.70, z 3.86).
// Published: hull 7.56, overall 9.83, width 3.38, height 2.94 (sovereign).
const CENTURION_HULL = {
  bodyHalfW: 1.55, nose: 3.48,
  deck: [[3.48, 1.505], [2.88, 1.51], [2.72, 1.545], [2.62, 1.60], [2.52, 1.69],
    [-0.10, 1.69], [-1.00, 1.75], [-3.28, 1.75], [-3.48, 1.62], [-3.55, 1.53]],
  beltTop: 1.0, belly: 0.53,
  noseRake: [[2.55, 0.53], [3.05, 0.56], [3.30, 0.72], [3.48, 1.08]],
  tailRake: [[-2.30, 0.53], [-3.10, 0.62], [-3.35, 0.80]],
  tailShelf: { z0: -3.35, z1: -3.55, yBot: 0.87 },
  // Front-view outer columns (ref): fender lid ends ~1.60, skirt top band
  // falls 1.48 -> 1.32 outboard — skirt top 1.48, fender lid pinned at 1.60.
  skirt: { x: 1.685, top: 1.48, bot: 0.60, z0: -3.20, z1: 3.05 }, skirtPanels: 6,
  fenderY: 1.60, fenderZ0: -3.55, fenderZ1: 2.58, fenderHalfW: 1.60,
  trackXc: 1.245, trackW: 0.61, wheelR: 0.4, wheelY: 0.45, wheelStyle: 'dished',
  wheelZs: [2.25, 1.40, 0.55, -0.50, -1.35, -2.20],
  // Raised end wheels: band + shoes render ~0.57 beyond each end center
  // (mask-span calibration across three probe runs) — tips ~+3.87/-3.71,
  // hull mask ~7.58 vs published 7.56 and overall ~9.81 vs 9.83 (both in
  // grace; the ref itself reads 7.49). sprocket y capped 1.06 so the wrap
  // (y + r + 0.135) stays under the 1.60 fender plane (containment law).
  sprocket: { z: -3.14, y: 1.06, r: 0.38 }, idler: { z: 3.30, y: 1.03, r: 0.38 },
  trackTop: 0.95, arms: false, coveredTop: true, noFlaps: true, rakeHalfW: 0.88,
};

function centurionBuild(P, mk) {
  const g = CENTURION_HULL;
  ukHull(P, g);
  // Fender horns over the raised idlers (ref plan: x to 1.70, z to 3.86 with
  // the horn line at 1.41-1.47 in side view; the idler rim owns the tip).
  // Containment law: horn plates sit OUTBOARD of the shoe plane and END
  // before the idler wrap crown (z <= 3.28) — the idler rim itself owns the
  // 3.3..3.85 tip silhouette.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.11, 0.045, 0.76), s * 1.645, 1.435, 2.90);
    P.add('hullDetail', box(0.04, 0.10, 0.72), s * 1.68, 1.38, 2.88);
  }
  // Glacis: driver hatches at the plate step, headlights, splash V,
  // shackles on the nose plate, spare track links (British glacis kit).
  for (const [hx, hz] of [[0.48, 2.50], [0.96, 2.50]]) {
    P.add('hullDetail', box(0.4, 0.03, 0.42), hx, 1.70, hz);
    P.add('hullDark', box(0.34, 0.016, 0.03), hx, 1.715, hz - 0.1);
  }
  for (const s of [-1, 1]) {
    headlight(P, s * 1.05, 1.42, 3.02, -0.2);
    P.add('hullDetail', box(0.2, 0.02, 0.16), s * 1.05, 1.50, 2.96, -0.25, 0, 0);
    P.add('hullDetail', box(1.05, 0.045, 0.08), s * 0.54, 1.70, 2.32, 0, s * -0.3, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), s * 0.82, 0.95, 3.40);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * 0.82, 0.95, 3.50, Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[-1.0, 1.71, 2.4], [0, 1.73, 1.4], [1.0, 1.71, 2.4]]);
  P.add('hullDetail', box(0.1, 0.05, 0.14), -1.0, 1.70, 2.4);
  P.add('hullDetail', box(0.1, 0.05, 0.14), 1.0, 1.70, 2.4);
  // Rear mud flaps OUTBOARD of the track band (containment law), hanging
  // behind the sprockets at the fender width plane, hems above the rim line.
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.13, 0.32, 0.03), s * 1.63, 1.42, -3.62, 0.05, 0, 0);
  }
  spareTrackStrip(P, 'hull', -0.55, 1.545, 3.05, 3);
  // Engine deck: louvre field + fillers, all under the ref's 1.755 ceiling.
  P.add('hull', box(1.86, 0.05, 1.35), 0, 1.705, -2.2);
  if (P.q) for (let i = 0; i < 7; i++) {
    P.add('hullDark', box(1.62, 0.02, 0.05), 0, 1.735, -1.68 - i * 0.17);
    P.add('hullDetail', box(1.72, 0.02, 0.042), 0, 1.745, -1.65 - i * 0.17, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.04, 10), s * 0.95, 1.71, -1.35);
  P.add('hullDark', box(1.70, 0.35, 0.03), 0, 1.17, -3.51);

  // ---- slab-walled cast turret, ring (0, 1.78, 0.35) ----
  // Registered-table casting (auth frame): face nose plate 1.54..2.09 at
  // z 1.90, recline to a WIDE flat crown 2.55-2.64 spanning |x| <= 1.18,
  // cupola peak zone 2.76-2.79 at (x -0.5, z -0.15), wide flat bustle
  // (x +-1.15) ending z -1.79 with the lid at 2.43-2.46, flank stowage
  // shelves 1.70..2.20 out to x 1.54 over z -0.6..1.23, and the under-ring
  // basket bottoming 0.68 over z -0.15..1.15 only.
  P.turretG.position.set(0, 1.78, 0.35);
  P.gunG.position.set(0, 0.155, 0.6);
  P.add('turret', slab(                       // wide nose plate -> forward cheeks
    [-0.85, -0.24, 1.55], [0.85, -0.24, 1.55], [1.02, -0.24, 1.04], [-1.02, -0.24, 1.04],
    [-0.72, 0.31, 1.55], [0.72, 0.31, 1.55], [0.90, 0.52, 1.04], [-0.90, 0.52, 1.04]));
  P.add('turret', slab(                       // cheeks -> crown shoulder
    [-1.02, -0.24, 1.04], [1.02, -0.24, 1.04], [1.06, -0.24, 0.50], [-1.06, -0.24, 0.50],
    [-0.90, 0.52, 1.04], [0.90, 0.52, 1.04], [0.95, 0.77, 0.50], [-0.95, 0.77, 0.50]));
  P.add('turret', slab(                       // mid casting, near-vertical walls
    [-1.02, -0.24, 0.50], [1.02, -0.24, 0.50], [1.16, -0.10, -0.60], [-1.16, -0.10, -0.60],
    [-0.95, 0.77, 0.50], [0.95, 0.77, 0.50], [1.10, 0.84, -0.60], [-1.10, 0.84, -0.60]));
  P.add('turret', slab(                       // rear crown over the bustle root
    [-1.16, -0.10, -0.60], [1.16, -0.10, -0.60], [1.15, 0.03, -1.20], [-1.15, 0.03, -1.20],
    [-1.10, 0.84, -0.60], [1.10, 0.84, -0.60], [1.10, 0.86, -1.20], [-1.10, 0.86, -1.20]));
  P.add('turret', slab(                       // bustle fall to the lid line
    [-1.15, 0.03, -1.20], [1.15, 0.03, -1.20], [1.15, 0.10, -1.66], [-1.15, 0.10, -1.66],
    [-1.08, 0.86, -1.20], [1.08, 0.86, -1.20], [1.08, 0.68, -1.66], [-1.08, 0.68, -1.66]));
  const bustleTail = mk === 5 ? -2.06 : -1.55;
  P.add('turret', slab(                       // bustle tail box, corners taper in
    [-1.15, 0.10, -1.66], [1.15, 0.10, -1.66], [0.98, 0.16, bustleTail], [-0.98, 0.16, bustleTail],
    [-1.08, 0.68, -1.66], [1.08, 0.68, -1.66], [0.94, 0.65, bustleTail], [-0.94, 0.65, bustleTail]));
  P.add('turretDark', box(1.9, 0.02, 0.52), 0, 0.675, -1.60 - (mk === 5 ? 0.14 : 0));
  // Under-ring basket/breech mass (registered table: bottom ~0.65 world,
  // z auth -0.10..1.47 ONLY — the old full-length 0.62 band is a stale cert).
  P.add('turretDark', box(1.5, 0.90, 1.57), 0, -0.69, 0.335);
  // Flank stowage shelves (in the print's TURRET mask — they yaw). The
  // outer edge is a rounded stub: full 1.8 m run only to x 1.47, a short
  // 0.6 m cap carries the last 0.07 to the 1.54 plan plane; the inner face
  // meets the casting wall (no see-through plan slot).
  for (const s of [-1, 1]) {
    P.add('turret', box(0.33, 0.50, 1.82), s * 1.305, 0.17, -0.03);
    P.add('turretDark', box(0.34, 0.02, 1.76), s * 1.305, 0.43, -0.03);
    P.add('turret', box(0.07, 0.46, 0.60), s * 1.505, 0.17, -0.05);
    for (const zw of [0.86, -0.02, -0.92]) {
      P.add('turretDark', box(0.32, 0.48, 0.02), s * 1.31, 0.17, zw);
    }
    stowage(P, 'turretCloth', P.rng, [[s * 1.33, 0.36, 0.4, 0.24, 0.14, 0.7]]);
  }
  // Cupola on a riser at the print's own peak zone (x -0.48, z -0.50 local);
  // the lid ring carries the published-height p95 anchor at 2.92.
  P.add('turret', cylY(0.31, 0.33, 0.15, 16), -0.48, 0.855, -0.50);
  cupola(P, 'turret', -0.48, 0.93, -0.50, 0.27, 0.17, 6);
  P.add('turretDark', torus(0.24, 0.016, 16), -0.48, 1.115, -0.50);
  // Loader hatch ring + gunner periscope + sight; roof MG on a low pintle
  // beside the cupola (owner decoration law; stays under the crown line).
  P.add('turret', cylY(0.20, 0.22, 0.05, 14), 0.42, 0.87, -0.35);
  P.add('turretDark', box(0.32, 0.014, 0.03), 0.42, 0.90, -0.35);
  periscope(P, 'turretDetail', 0.30, 0.83, 0.15);
  P.add('turretDetail', box(0.2, 0.12, 0.2), -0.30, 0.80, 0.30);
  P.add('turretGlass', box(0.14, 0.05, 0.03), -0.30, 0.83, 0.41);
  pintleMG(P, -0.10, 0.68, -0.62, false);
  liftEye(P, 'turretDetail', -0.80, 0.50, 1.05, 0.5);
  liftEye(P, 'turretDetail', 0.80, 0.50, 1.05, -0.5);
  liftEye(P, 'turretDetail', -0.95, 0.83, -0.95, 2.6);
  liftEye(P, 'turretDetail', 0.95, 0.83, -0.95, -2.6);
  // Smoke discharger banks on the shelf front faces (inboard of the cap so
  // the outer plan stub stays the ref's short 0.6 m corner).
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.12, 0.10), s * 1.28, 0.28, 0.92, 0, s * 0.4, 0);
    smokeCluster(P, s * 1.22, 0.38, 0.98, mk === 5 ? 6 : 3, s * 0.95, 0.7);
  }
  // Bucket hung on the shelf rear wall (British) + antenna stubs on the lid
  // kept under the 2.46 bustle-lid line (the print tops 2.79 at the cupola).
  P.add('turretDark', cylY(0.06, 0.075, 0.13, 10), 1.30, 0.02, -0.99);
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylY(0.04, 0.05, 0.09, 8), s * 0.92, 0.70, -1.50);
    P.add('turretDark', box(0.022, 0.18, 0.022), s * 0.92, 0.58, -1.50, 0, 0, s * 0.05);
  }
  // Recessed internal mantlet + wide canvas hood (band 1.78..2.09 to z 2.37).
  P.add('turretDark', box(0.85, 0.42, 0.06), 0, 0.05, 1.52);
  P.add('turretCloth', box(0.72, 0.26, 0.42), 0, 0.14, 1.78, -0.3, 0, 0);
  P.add('turretCloth', box(0.58, 0.18, 0.34), 0, 0.06, 2.04, -0.12, 0, 0);
  const gunLen = 5.15;
  if (mk === 5) {
    // L7: the print tube reads ~0.28 thick the whole way (sleeved); the
    // muzzle collar runs to the tip so the plan trace holds the last bins.
    buildGun(P, { len: gunLen, r: 0.125, sleeve: false, evac: 0.42, evacR: 1.45, collar: false, baseR: 0.15 });
    P.add('gun', cylZ(0.15, 0.8, 12, 0.16), 0, 0, 0.55);
    P.add('gun', cylZ(0.145, 0.56, 12), 0, 0, gunLen - 0.28);
  } else {
    // 20-pdr: the print tube reads nearly as thick as the L7's (0.25).
    buildGun(P, { len: gunLen, r: 0.12, sleeve: false, evac: 0.52, evacR: 1.4, collar: false, baseR: 0.14 });
    P.add('gun', cylZ(0.135, 0.6, 12, 0.145), 0, 0, 0.5);
    P.add('gun', cylZ(0.14, 0.5, 10), 0, 0, gunLen - 0.25);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [1.17, 0.2, -0.3], Math.PI / 2);
  P.topY = 1.2;
}

// ---------------------------------------------------------------------------
// Cromwell-family chassis (Comet / Charioteer / A30): boxy pannier hull with
// a vertical driver's plate, LOW bow deck step, flat full-length track
// guards and exposed Christie gear. Curve-corrected: the tall pannier band
// ends at the driver's plate; the bow runs LOW to a blunt nose.
// ---------------------------------------------------------------------------
function cromwellHull(P, o) {
  const width = o.width, halfL = o.hullLength / 2;
  const rearL = halfL - (o.tailTrim ?? 0);     // hull rear plate station
  const roofY = o.roofY, bandY = o.bandY, trackW = o.trackW;
  // Containment law: the inner body hugs the REAL track channel (which may
  // sit inboard of the width-derived default when o.trackXc overrides it).
  const chanIn = (o.trackXc ?? (width / 2 - trackW / 2)) - trackW / 2 - 0.06;
  const innerW = Math.min(width - trackW * 2.1, chanIn * 2);
  const bandW = o.bandHalfW ? o.bandHalfW * 2 : width * 0.94;
  const bowZ = o.bowZ ?? halfL * 0.62;         // driver's plate station
  const bowY = o.bowY ?? roofY - 0.24;         // low bow deck
  const noseTipY = o.noseTipY ?? bandY + 0.36;

  P.add('hull', box(innerW, bandY - 0.14, halfL * 0.99 + rearL * 0.98), 0, 0.24 + (bandY - 0.14) / 2, (halfL * 0.99 - rearL * 0.98) / 2);
  // Containment law: the end-wheel wrap circles top out at hornY + 0.72R +
  // 0.135 band — full-width solids stay above that line in the wrap zones.
  const wrapTop = (o.hornY ?? 0.62) + o.wheelR * 0.72 + 0.155;
  // Pannier band: vertical sides ending at the vertical driver's plate.
  // Split at the wrap line: the full-length slice rides above it, the lower
  // slice stops short of the sprocket wrap (silhouette owned by the tracks).
  const ySplit = Math.min(roofY - 0.05, Math.max(bandY, wrapTop));
  P.add('hull', box(bandW, roofY - ySplit, rearL + bowZ), 0, (roofY + ySplit) / 2, (bowZ - rearL) / 2);
  const zRearLow = -(rearL - (o.sprocketInset ?? 0.38)) + o.wheelR * 0.72 + 0.155;
  if (ySplit > bandY + 0.01) {
    P.add('hull', box(bandW, ySplit - bandY, bowZ - zRearLow), 0, (ySplit + bandY) / 2, (bowZ + zRearLow) / 2);
  }
  // Low bow deck from the driver's plate to the nose, then the short glacis
  // (lower edge held above the idler wrap line).
  const bowLo = Math.min(bowY - 0.02, Math.max(bandY - 0.05, wrapTop));
  P.add('hull', slab(
    [-bandW / 2, bowLo, bowZ], [bandW / 2, bowLo, bowZ],
    [bandW / 2, bowLo + 0.12, halfL * 0.99], [-bandW / 2, bowLo + 0.12, halfL * 0.99],
    [-bandW / 2 * 0.98, bowY, bowZ], [bandW / 2 * 0.98, bowY, bowZ],
    [bandW / 2 * 0.98, noseTipY, halfL], [-bandW / 2 * 0.98, noseTipY, halfL]));
  P.add('hull', slab(                       // narrow under-slab to the belly
    [-chanIn, bandY - 0.05, bowZ], [chanIn, bandY - 0.05, bowZ],
    [chanIn, bandY + 0.1, halfL * 0.99], [-chanIn, bandY + 0.1, halfL * 0.99],
    [-chanIn, bowLo + 0.01, bowZ], [chanIn, bowLo + 0.01, bowZ],
    [chanIn, noseTipY, halfL], [-chanIn, noseTipY, halfL]));
  // Lower toe/tail solids stay INSIDE the track channel (containment law:
  // the wrap arcs + climbing runs at |x| chanIn..width/2 own those zones).
  const toeW = Math.min(width * 0.44, chanIn);
  P.add('hull', slab(                              // lower glacis to the toe
    [-toeW, 0.32, halfL * 0.9], [toeW, 0.32, halfL * 0.9],
    [toeW, 0.3, halfL * 0.82], [-toeW, 0.3, halfL * 0.82],
    [-toeW, noseTipY, halfL], [toeW, noseTipY, halfL],
    [toeW, noseTipY, halfL * 0.94], [-toeW, noseTipY, halfL * 0.94]));
  // Rear plate closing to the floor + tail rake.
  P.add('hull', frustum(toeW, -rearL * 0.84, -rearL * 0.91, toeW, -rearL * 0.84, -rearL * 0.99, 0.32, bandY + 0.03));
  P.add('hull', frustum(toeW, -rearL * 0.91, -rearL * 0.99, toeW, -rearL * 0.985, -rearL * 0.99, bandY + 0.03, roofY - 0.06));

  // Riveted plate seams + rivet dots on the pannier band.
  for (const s of [-1, 1]) {
    const px = s * (bandW / 2 + 0.006);
    P.add('hullDark', box(0.012, 0.016, rearL + bowZ - 0.3), px, roofY - 0.055, (bowZ - rearL) / 2);
    P.add('hullDark', box(0.012, 0.016, rearL + bowZ - 0.3), px, bandY + 0.1, (bowZ - rearL) / 2);
    if (P.q) for (let i = 0; i < 11; i++) {
      P.add('hullDark', cylX(0.016, 0.024, 6), px, roofY - 0.13, -halfL * 0.9 + i * (o.hullLength * 0.78 / 10));
    }
    for (const zc of [halfL * 0.4, -halfL * 0.28]) {
      P.add('hullDark', box(0.012, roofY - bandY - 0.14, 0.016), px, (roofY + bandY) / 2, zc);
    }
  }
  // Vertical driver's plate face: framed visor + Besa ball (or blanking).
  P.add('hullDetail', box(0.42, 0.18, 0.05), -width * 0.2, roofY - 0.14, bowZ + 0.02);
  P.add('hullDark', box(0.34, 0.055, 0.03), -width * 0.2, roofY - 0.13, bowZ + 0.035);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.07, 0.045, 0.05), -width * 0.2 + s * 0.16, roofY - 0.035, bowZ + 0.03);
  if (o.mgBall !== false) {
    P.add('hullDetail', cylZ(0.135, 0.06, 14), width * 0.2, roofY - 0.16, bowZ + 0.02);
    P.add('hullDetail', sph(0.105, 12), width * 0.2, roofY - 0.16, bowZ + 0.03);
    P.add('hullDark', cylZ(0.024, 0.22, 8), width * 0.2, roofY - 0.145, bowZ + 0.08);
  } else {
    P.add('hullDetail', box(0.3, 0.16, 0.04), width * 0.2, roofY - 0.15, bowZ + 0.02);
    periscope(P, 'hullDetail', width * 0.2, roofY + 0.045, bowZ - 0.25);
  }
  periscope(P, 'hullDetail', -width * 0.2, roofY + 0.045, bowZ - 0.25);
  // Bow deck kit: hatch + headlights on the low deck.
  P.add('hullDetail', box(0.62, 0.035, 0.55), width * 0.24, bowY + 0.06, bowZ + 0.7, -0.08, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.018, 0.018, 0.12, 8), s * width * 0.36, bowY + 0.12, halfL * 0.96);
    headlight(P, s * width * 0.36, bowY + 0.2, halfL * 0.96, -0.12);
  }
  // Deck: raised louvred engine bank + fillers + intake mushroom.
  P.add('hull', box(width * 0.58, 0.075, o.hullLength * 0.245), 0, roofY + 0.03, -halfL * 0.42);
  if (P.q) for (let i = 0; i < 6; i++) {
    const z = -halfL * 0.42 + (2.5 - i) * o.hullLength * 0.036;
    P.add('hullDark', box(width * 0.5, 0.022, 0.048), 0, roofY + 0.062, z);
    P.add('hullDetail', box(width * 0.53, 0.024, 0.04), 0, roofY + 0.08, z + 0.028, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.05, 10), s * width * 0.3, roofY + 0.045, -halfL * 0.16);
  P.add('hullDetail', cylY(0.075, 0.095, 0.09, 10), -width * 0.24, roofY + 0.05, halfL * 0.3);
  P.add('hullDetail', cylY(0.12, 0.085, 0.035, 10), -width * 0.24, roofY + 0.11, halfL * 0.3);
  // Twin fishtail exhaust cowls on the rear deck (kept at the deck line —
  // the comet print's rear deck reads flat).
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.105, 0.72, 12), s * 0.52, roofY + 0.015, -rearL * 0.72);
    P.add('hullDetail', box(0.26, 0.05, 0.3), s * 0.52, roofY - 0.02, -rearL * 0.915, 0.55, 0, 0);
    P.add('hullDark', box(0.22, 0.022, 0.06), s * 0.52, roofY - 0.075, -rearL * 0.98, 0.55, 0, 0);
  }
  P.add('hullDark', box(width * 0.3, 0.16, 0.03), 0, roofY - 0.3, -rearL * 0.985);
  // Fender aprons: with a narrowed pannier band the ref reads a low flat
  // apron plate out to the guards (comet/charioteer prints: 1.54 line).
  if (o.bandHalfW) for (const s of [-1, 1]) {
    P.add('hullDetail', box(width / 2 - 0.02 - o.bandHalfW, 0.035, o.hullLength * 0.86),
      s * (o.bandHalfW + (width / 2 - 0.02 - o.bandHalfW) / 2), o.apronY ?? (roofY - 0.16), -o.hullLength * 0.02);
  }
  // Flat full-length track guards + pannier bins (WIDTH GUARD: guard outer
  // edge sits exactly at the committed width/2). Containment law: the guard
  // plane and its tip plates ride ABOVE the end-wheel wrap line.
  for (const s of [-1, 1]) {
    const gx = s * (width / 2 - trackW / 2);
    const gy = Math.max(bandY + 0.02, wrapTop + 0.015);
    P.add('hullDetail', box(trackW, 0.035, halfL + rearL + 0.1), gx, gy, (halfL - rearL) / 2);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.26), gx, gy - 0.02, halfL - 0.14, -0.3, 0, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.26), gx, gy - 0.02, -(rearL - 0.14), 0.28, 0, 0);
    P.add('hullDetail', box(trackW * 0.82, 0.09, 0.3), gx, gy + 0.06, halfL * 0.52);
    if (!o.noBins) for (const [zc, len2] of [[halfL * 0.24, o.hullLength * 0.2], [-halfL * 0.44, o.hullLength * 0.18]]) {
      P.add('hull', box(trackW * 0.92, 0.22, len2), gx + s * 0.03, roofY - 0.03, zc);
      P.add('hullDark', box(trackW * 0.92 + 0.012, 0.018, len2 - 0.06), gx + s * 0.03, roofY + 0.075, zc);
      for (const f of [-0.3, 0.3]) {
        P.add('hullDark', box(trackW * 0.94, 0.23, 0.022), gx + s * 0.035, roofY - 0.03, zc + f * len2);
      }
    }
  }
  // Bow tow shackles.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.1, 0.09, 0.14), s * width * 0.28, 0.5, halfL * 0.945);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * width * 0.28, 0.5, halfL * 1.0, Math.PI / 2, 0, 0);
  }
  // Christie run: big dished wheels, no return rollers (Comet adds 4).
  const wheelZs = evenStations(o.wheels, o.wheelSpan, o.wheelBias ?? 0.05);
  buildRunningGear(P, {
    style: 'holes', wheelR: o.wheelR, wheelW: Math.min(0.24, trackW * 0.55),
    wheelY: o.wheelR + 0.15, xc: o.trackXc ?? (width / 2 - trackW / 2), wheelZs, botY: 0.13,
    sprocket: { z: -(rearL - (o.sprocketInset ?? 0.38)), y: o.hornY ?? 0.62, r: o.wheelR * 0.72 },
    idler: { z: halfL - 0.42, y: o.hornY ?? 0.62, r: o.wheelR * 0.72 },
    rollers: o.rollers || [],
    trackW, topY: bandY - 0.07, paintedEnds: true, coveredTop: true, arms: false,
  });
  P.decal('hull', 'number', P.spec.visual.number || '', 0.3, [width / 2 + 0.01, (roofY + bandY) / 2, -halfL * 0.3], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.3, [-(width / 2 + 0.01), (roofY + bandY) / 2, -halfL * 0.3], -Math.PI / 2);
  return { width, length: o.hullLength, halfL, roofY };
}

// Comet A34: low welded turret with curved cast front + rear radio bustle,
// 77 mm HV. Band: turret z -1.9..+2.0 rel ring 0.55, roof 2.55, mantlet 2.0.
function cometBuild(P, o) {
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, 0.55);
  P.gunG.position.set(0, 0.16, 0.35);
  const h = 0.75;
  // vertex r1 v2 — REGISTERED PARITY TABLES ONLY (the extract z-frame for
  // this fused/repaired print is unreliable; shots/uk-r1/comet-r2). Lab
  // truth (world): casting face 1.50 with the mantlet band 1.50..1.97
  // (y 1.52..2.14), crown 2.45-2.57 peaking over z -0.02..0.55, rear end
  // -1.00 (bot 1.72 aft of -0.58), walls to |x| ~1.15, under-skirt bot 1.52,
  // basket 0.74 under z 0.27..1.50 ONLY, gun axis ~1.87, and the tall
  // strapped bin on the turret RIGHT (x to 1.52, y 1.92..2.29).
  P.add('turret', KIT.polyTurret([
    [-0.42, 0.95], [0.42, 0.95], [0.92, 0.72], [1.15, 0.10], [1.10, -0.95], [0.88, -1.53],
    [-0.88, -1.53], [-1.10, -0.95], [-1.15, 0.10], [-0.92, 0.72],
  ], h, 1.02, 0.88));
  P.add('turret', cylY(0.50, 0.55, h * 0.92, 18, false, -0.9, 1.8), 0, h * 0.03, 0.45);
  // Crown pad (2.45..2.57 world over z -0.57..0.0 local).
  P.add('turret', box(1.28, 0.12, 0.62), 0, 0.81, -0.28);
  // Under-skirt band closing the casting bottom to the 1.52 line.
  P.add('turret', box(1.85, 0.18, 2.30), 0, -0.09, 0.12);
  // Rear casting bottom 1.72 aft of z -0.58 comes from the poly base; the
  // -1.53..-1.0 rear quarter reads in the poly rear wall.
  // Cupola carries the published-height (2.68) p95 anchor at 2.66 (the
  // print's own peak is 2.57 — dims sovereign, bounded anchor tax).
  P.add('turret', cylY(0.26, 0.28, 0.12, 16), 0.60, h - 0.03, -0.30);
  cupola(P, 'turret', 0.60, h + 0.09, -0.30, 0.25, 0.10, 6);
  P.add('turretDark', torus(0.25, 0.016, 16), 0.60, h + 0.212, -0.30);
  // Turret-right tall bin (print turret mask; outer face capped at the
  // width guard's 1.52 plane).
  P.add('turret', box(0.20, 0.37, 0.75), 1.42, 0.405, -0.50);
  P.add('turretDark', box(0.21, 0.02, 0.69), 1.42, 0.60, -0.50);
  P.add('turretDetail', box(0.16, 0.03, 0.77), 1.42, 0.22, -0.50);
  // Deep basket/breech mass (0.74 world under z 0.27..1.50 world ONLY).
  P.add('turretDark', box(1.3, 0.87, 1.23), 0, -0.615, 0.335);
  P.add('turret', cylY(0.2, 0.2, 0.05, 12), -0.5, h, -0.30);
  P.add('turretDark', box(0.32, 0.014, 0.03), -0.5, h + 0.035, -0.30);
  pintleMG(P, -0.28, h - 0.34, -0.72, false); // owner decoration law: roof MG (kept under the crown line)
  periscope(P, 'turretDetail', 0.3, h + 0.04, 0.15);
  liftEye(P, 'turretDetail', -0.72, h + 0.01, 0.45, 0.5);
  liftEye(P, 'turretDetail', 0.72, h + 0.01, 0.45, -0.5);
  liftEye(P, 'turretDetail', -0.60, h + 0.01, -1.15, 2.6);
  liftEye(P, 'turretDetail', 0.60, h + 0.01, -1.15, -2.6);
  P.add('turretDetail', box(0.05, 0.14, 0.26), 0.98, h * 0.42, 0.45, 0, 0.6, 0);
  smokeCluster(P, 1.06, h * 0.52, 0.52, 5, 0.95, 0.65);
  // Bolted internal mantlet: wide plate + bolt ring + coax/sight ports
  // (registered mantlet band 1.50..1.97 world -> gun-frame z 0.60..1.05).
  P.addGunExtra(box(0.74, 0.58, 0.12), 0, 0, 0.68);
  for (const [bx, by] of [[-0.3, 0.21], [0, 0.24], [0.3, 0.21], [-0.3, -0.21], [0, -0.24],
    [0.3, -0.21], [-0.34, 0], [0.34, 0]]) {
    P.addGunExtraDark(cylZ(0.021, 0.03, 6), bx, by, 0.745);
  }
  P.addGunExtraDark(cylZ(0.032, 0.14, 8), 0.24, 0.1, 0.72);
  P.addGunExtraDark(cylZ(0.026, 0.12, 8), -0.24, 0.12, 0.72);
  P.addGunExtra(cylZ(0.115, 0.3, 12, 0.145), 0, 0, 0.90);
  buildGun(P, { len: o.gunLength, r: 0.115, brake: 'single', sleeve: false, evac: null, collar: false, baseR: 0.16 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, h * 0.42, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

// FV4101 Charioteer: tall angular two-tier welded turret, slim 20-pdr.
function charioteerBuild(P, o) {
  cromwellHull(P, o);
  // The print's turret band registers ~1 m aft of the hull-length mid (its
  // bow-short hull anchors the frame) — the pivot follows the oracle.
  P.turretG.position.set(0, o.roofY, 0.2);
  P.gunG.position.set(0, 0.27, 0.35);
  P.add('turret', frustum(1.04, 1.22, -1.3, 0.96, 1.02, -1.16, 0, 0.42));
  P.add('turret', frustum(0.96, 1.02, -1.16, 0.56, 0.34, -0.78, 0.42, 0.78));
  P.add('turret', box(0.78, 0.42, 0.14), 0, 0.5, 0.78, -0.35, 0, 0);
  P.add('turretDark', box(0.3, 0.05, 0.05), 0.42, 0.72, -0.1);
  P.add('turret', cylY(0.24, 0.26, 0.14, 16), -0.34, 0.80, -0.52);
  cupola(P, 'turret', -0.34, 0.86, -0.52, 0.22, 0.12, 6);
  P.add('turretDark', torus(0.25, 0.016, 16), -0.34, 1.015, -0.52);
  P.add('turretDark', box(1.3, 0.72, 0.9), 0, -0.51, 0.65);
  P.add('turret', cylY(0.19, 0.19, 0.05, 12), 0.4, 0.78, -0.45);
  P.add('turretDark', box(0.3, 0.014, 0.03), 0.4, 0.815, -0.45);
  periscope(P, 'turretDetail', 0.26, 0.83, 0.05);
  liftEye(P, 'turretDetail', -0.82, 0.53, 0.85, 0.5);
  liftEye(P, 'turretDetail', 0.82, 0.53, 0.85, -0.5);
  liftEye(P, 'turretDetail', -0.7, 0.8, -0.72, 2.6);
  liftEye(P, 'turretDetail', 0.7, 0.8, -0.72, -2.6);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.24, 0.13, 0.1), s * 0.8, 0.3, 0.92, 0, s * 0.35, 0);
    for (const k of [-1, 0, 1]) {
      P.add('turretDark', cylZ(0.028, 0.16, 8), s * 0.8 + k * 0.065, 0.38, 0.96, -0.45, s * 0.35, 0);
    }
  }
  P.add('turret', box(1.15, 0.32, 0.55), 0, 0.71, -0.80);
  P.add('turretDark', box(1.03, 0.018, 0.48), 0, 0.88, -0.80);
  P.add('turret', box(1.0, 0.5, 0.45), 0, 0.42, -1.20);
  P.add('turret', box(0.9, 0.35, 0.4), 0, 0.18, -1.70);
  for (const xr of [-0.34, 0.34]) P.add('turretDark', box(0.022, 0.30, 0.56), xr, 0.71, -0.805);
  // Forward face wedge (print face line 2.20 at z 0.5 -> 2.42 at 0.0).
  P.add('turret', slab(
    [-0.65, 0.30, 1.10], [0.65, 0.30, 1.10], [0.75, 0.30, 0.30], [-0.75, 0.30, 0.30],
    [-0.55, 0.52, 1.05], [0.55, 0.52, 1.05], [0.72, 0.80, 0.32], [-0.72, 0.80, 0.32]));
  P.add('turretDetail', box(0.022, 0.22, 0.022), -0.88, 0.78, -0.95, 0, 0, -0.05);
  P.add('turretDetail', box(0.022, 0.22, 0.022), 0.88, 0.78, -0.95, 0, 0, 0.05);
  P.addGunExtra(box(0.5, 0.44, 0.12), 0, 0, 0.62);
  for (const [bx, by] of [[-0.2, 0.16], [0.2, 0.16], [-0.2, -0.16], [0.2, -0.16]]) {
    P.addGunExtraDark(cylZ(0.019, 0.03, 6), bx, by, 0.685);
  }
  P.addGunExtra(cylZ(0.095, 0.42, 12, 0.125), 0, 0, 0.86);
  buildGun(P, { len: o.gunLength, r: 0.105, sleeve: false, evac: 0.52, evacR: 1.3, collar: true, baseR: 0.15 });
  P.add('gun', cylZ(0.14, 1.5, 12, 0.15), 0, 0, 1.9);
  P.add('gun', cylZ(0.12, 1.2, 12, 0.14), 0, 0, 3.25);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, 0.24, -0.3], Math.PI / 2);
  P.topY = 1.05;
}

// A30 Challenger: long six-wheel chassis, tall narrow 17-pdr turret.
function a30Build(P, o) {
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, 0.12);
  P.gunG.position.set(0, 0.35, 0.35);
  const h = 0.84;
  P.add('turret', frustum(0.86, 1.02, -1.18, 0.78, 0.86, -1.06, 0, h));
  P.add('turret', cylY(0.56, 0.62, h * 0.96, 20, false, -1.1, 2.2), 0, h * 0.02, 0.52);
  P.add('turret', box(1.42, 0.3, 0.72), 0, 0.15, -0.95);
  P.add('turretDark', box(1.3, 0.018, 0.62), 0, 0.31, -0.95);
  for (const xr of [-0.42, 0.42]) P.add('turretDark', box(0.022, 0.31, 0.73), xr, 0.15, -0.955);
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylX(0.085, 0.035, 12), s * 0.83, h * 0.48, -0.18);
    P.add('turretDark', cylX(0.032, 0.04, 8), s * 0.835, h * 0.48, -0.18);
    liftEye(P, 'turretDetail', s * 0.62, h + 0.01, 0.55, s * -0.5);
    liftEye(P, 'turretDetail', s * 0.58, h + 0.01, -0.85, s * -2.6);
  }
  P.add('turret', cylY(0.26, 0.28, 0.34, 16), 0.02, h + 0.13, -0.55);
  cupola(P, 'turret', 0.02, h + 0.34, -0.55, 0.23, 0.12, 6);
  P.add('turretDark', torus(0.26, 0.016, 16), 0.02, h + 0.505, -0.55);
  P.add('turretDark', box(1.2, 0.7, 1.05), 0, -0.5, 0.55);
  P.add('turret', cylY(0.18, 0.18, 0.05, 12), -0.44, h, 0.02);
  P.add('turretDark', box(0.28, 0.014, 0.03), -0.44, h + 0.035, 0.02);
  periscope(P, 'turretDetail', 0.3, h + 0.04, -0.05);
  P.add('turretDetail', box(0.022, 0.3, 0.022), 0.7, h + 0.12, -0.9, 0, 0, 0.05);
  P.addGunExtra(box(0.44, 0.42, 0.2), 0, 0, 0.55);
  P.addGunExtraDark(box(0.3, 0.3, 0.03), 0, 0, 0.665);
  P.addGunExtra(cylZ(0.088, 0.44, 12, 0.115), 0, 0, 0.8);
  P.addGunExtra(cylZ(0.062, 0.1, 10), 0, 0, 1.04);
  buildGun(P, { len: o.gunLength, r: 0.11, sleeve: false, evac: null, collar: true, baseR: 0.15 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [0.86, h * 0.35, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

// ---------------------------------------------------------------------------
// FV510 Warrior — recovered oracle (repaired: turret purified, mirrors keep
// the width bound). Tall ribbed troop hull (flank top ~2.06 rendered), long
// shallow glacis (1.83 -> 1.77 to the nose), compact square two-man turret
// at +0.5, thin RARDEN that never clears the nose.
// ---------------------------------------------------------------------------
function fv510Build(P, o) {
  const halfL = o.hullLength / 2;
  const roofY = o.roofY;
  const g = {
    bodyHalfW: o.width / 2 - o.trackW - 0.02, nose: halfL,
    deck: o.deck, beltTop: 1.0, belly: 0.4,
    noseRake: o.noseRake, tailRake: o.tailRake,
    skirt: { x: o.width / 2, top: 1.3, bot: 0.55, z0: -halfL * 0.92, z1: halfL * 0.92 }, skirtPanels: 6,
    fenderY: 1.36, fenderZ0: -halfL + 0.1, fenderZ1: halfL - 0.1, fenderHalfW: o.width / 2 - 0.01,
    // Containment law: the track band + shoes pull inboard so the skirt
    // panels (committed width plane) clear the dilated shoe surface.
    trackXc: o.width / 2 - o.trackW / 2 - 0.135, trackW: o.trackW, wheelR: 0.4, wheelY: 0.45,
    rakeHalfW: o.width / 2 - o.trackW - 0.23,
    wheelStyle: 'rubber',
    wheelZs: evenStations(6, o.wheelSpan),
    sprocket: { z: halfL - 0.47, y: 0.58, r: 0.34 }, idler: { z: -halfL + 0.47, y: 0.55, r: 0.32 },
    trackTop: 0.95, arms: false, coveredTop: true, noFlaps: true,
  };
  ukHull(P, g);
  // The tall troop-bay walls above the fender line (band top ~2.06).
  P.add('hull', slab(
    [-1.42, 1.34, 0.3], [1.42, 1.34, 0.3], [1.42, 1.34, -2.62], [-1.42, 1.34, -2.62],
    [-1.38, 2.05, 0.1], [1.38, 2.05, 0.1], [1.38, 2.05, -2.58], [-1.38, 2.05, -2.58]));
  P.turretG.position.set(0, o.turretPivotY, o.turretPivotZ);
  P.gunG.position.set(o.gunX, o.gunY, o.gunZ);
  // Compact welded two-man turret (oracle envelope: ~1.7 wide, 1.26 deep).
  const h = 0.45, tw = 0.85;
  P.add('turret', frustum(tw, 0.72, -0.66, tw * 0.93, 0.6, -0.6, 0, h));
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.32, 0.09, 0.05), s * 0.34, h * 0.72, 0.63);
    P.add('turretGlass', box(0.24, 0.045, 0.03), s * 0.34, h * 0.72, 0.65);
  }
  for (const zs of [0.1, -0.28]) {
    P.add('turretDark', box(0.05, 0.09, 0.24), -tw - 0.01, h * 0.7, zs);
  }
  // Gunner sight pod — the published-height (2.80) p95 anchor at 2.79.
  P.add('turret', cylY(0.16, 0.18, 0.2, 14), -0.34, h + 0.09, 0.2);
  P.add('turret', box(0.30, 0.20, 0.20), -0.34, h + 0.25, 0.2);
  P.add('turret', box(0.34, 0.04, 0.24), -0.34, h + 0.36, 0.2);
  P.add('turretGlass', box(0.19, 0.06, 0.03), -0.34, h + 0.22, 0.32);
  P.add('turretDark', box(0.035, 0.3, 0.035), 0.06, h + 0.16, 0.5, -0.4, 0, 0);
  for (const [hx, hz, hr] of [[-0.3, -0.36, 0.2], [0.36, -0.12, 0.18]]) {
    P.add('turret', cylY(hr, hr + 0.02, 0.06, 14), hx, h + 0.03, hz);
    P.add('turret', cylY(hr - 0.03, hr - 0.03, 0.025, 14), hx, h + 0.075, hz);
    P.add('turretDark', box(hr * 1.7, 0.014, 0.03), hx, h + 0.095, hz);
  }
  periscope(P, 'turretDetail', 0.12, h + 0.05, 0.04);
  liftEye(P, 'turretDetail', -0.68, h + 0.01, 0.48, 0.4);
  liftEye(P, 'turretDetail', 0.68, h + 0.01, 0.48, -0.4);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.14, 0.28), s * 0.8, 0.28, 0.52, 0, s * 0.7, 0);
    smokeCluster(P, s * 0.92, 0.38, 0.58, 4, s * 1.05, 0.55);
    smokeCluster(P, s * 0.88, 0.26, 0.62, 4, s * 1.05, 0.55);
  }
  // Rear stowage basket.
  P.add('turretDetail', box(1.55, 0.04, 0.04), 0, h * 0.62, -0.96);
  P.add('turretDetail', box(1.55, 0.04, 0.04), 0, h * 0.14, -0.96);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.028, h * 0.5, 0.028), -0.7 + k * 0.28, h * 0.38, -0.96);
  P.add('turretDark', box(1.45, 0.018, 0.26), 0, h * 0.2, -0.82);
  stowage(P, 'turretCloth', P.rng, [[-0.35, h * 0.5, -0.8, 0.6, 0.22, 0.28], [0.42, h * 0.48, -0.8, 0.5, 0.2, 0.28]]);
  // Single mid mast to the oracle's 3.88 (two columns of the p95 budget);
  // the aft whip stays a stub.
  P.add('turretDetail', cylY(0.05, 0.06, 0.14, 8), -0.4, h + 0.07, -0.45);
  P.add('turretDark', box(0.028, 1.72, 0.028), -0.4, h + 1.0, -0.45);
  P.add('turretDetail', cylY(0.045, 0.055, 0.12, 8), 0.58, h + 0.06, -0.52);
  // RARDEN: mantlet block + LONG THIN stepped tube + flash hider.
  P.addGunExtra(box(0.28, 0.32, 0.38), 0, 0, 0.3);
  P.addGunExtra(cylZ(0.07, 0.24, 10, 0.088), 0, 0, 0.54);
  buildGun(P, { len: o.gunLength, r: 0.03, sleeve: false, evac: null, collar: false, baseR: 0.062 });
  P.add('gun', cylZ(0.05, 0.6, 10, 0.056), 0, 0, 0.78);
  P.add('gun', cylZ(0.038, 0.42, 10), 0, 0, 1.3);
  P.add('gunDark', cylZ(0.047, 0.13, 8), 0, 0, 1.72);
  P.add('gunDark', cylZ(0.033, 0.09, 8, 0.047), 0, 0, 1.82);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [tw + 0.01, h * 0.45, -0.45], Math.PI / 2);
  P.topY = h + 0.55;

  // Horizontal slat/bar-armour banks on bow, flanks and rear — WIDTH GUARD:
  // the slat faces ARE the committed 3.03 plane. Containment law: the
  // lowest bow/rear rows start above the end-wheel wrap line (~1.06).
  for (let k = 0; k < 5; k++) {
    const y = 1.10 + k * 0.15;
    const z = halfL * 0.97 - (y - 0.72) * 0.964;
    P.add('hullDetail', box(2.3, 0.05, 0.09), 0, y + 0.02, z + 0.05, -0.77, 0, 0);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(0.045, 0.05, 4.6), s * (o.width / 2 - 0.0235), 0.86 + k * 0.17, -0.35);
    }
    for (const zh of [-2.3, -0.35, 1.55]) {
      P.add('hullDetail', box(0.05, 0.9, 0.06), s * (o.width / 2 - 0.045), 1.2, zh);
    }
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(2.1, 0.05, 0.05), 0, 1.10 + k * 0.16, -halfL - 0.03 - 0.001 * s);
    }
  }
  // Fender stowage bins at the bow corners.
  for (const s of [-1, 1]) {
    for (const [bz, bl] of [[2.32, 0.52], [1.7, 0.48]]) {
      P.add('hull', box(0.24, 0.2, bl), s * 1.36, 1.47, bz);
      P.add('hullDark', box(0.25, 0.016, bl - 0.05), s * 1.36, 1.575, bz);
      P.add('hullDetail', box(0.18, 0.035, 0.035), s * 1.24, 1.4, bz);
    }
  }
  // LEFT-side exhaust cowl + heat-shield louvres (Warrior signature).
  P.add('hull', box(0.3, 0.42, 1.2), -1.28, 1.9, -0.3);
  P.add('hullDark', box(0.2, 0.14, 0.06), -1.30, 2.04, -0.95);
  for (let k = 0; k < 3; k++) P.add('hullDark', box(0.032, 0.26, 0.24), -1.435, 1.9, -0.62 + k * 0.34);
  // Raised louvred powerpack bank RIGHT front deck.
  P.add('hull', box(1.05, 0.055, 1.15), 0.6, 1.9, 1.35);
  if (P.q) for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(0.95, 0.02, 0.05), 0.6, 1.93, 1.75 - k * 0.2);
    P.add('hullDetail', box(0.99, 0.022, 0.042), 0.6, 1.945, 1.78 - k * 0.2, 0.5, 0, 0);
  }
  // Driver hatch + periscope hoods on the right glacis shoulder.
  P.add('hullDetail', cylY(0.24, 0.26, 0.05, 14), 0.62, 1.87, 2.0);
  periscope(P, 'hullDetail', 0.48, 1.9, 2.3);
  periscope(P, 'hullDetail', 0.78, 1.9, 2.3);
  // Rear troop door + frame + bin.
  P.add('hullDetail', box(1.3, 0.06, 0.06), 0, 1.98, -halfL - 0.01);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.06, 1.24, 0.06), s * 0.62, 1.36, -halfL - 0.01);
    P.add('hullDetail', box(0.07, 0.1, 0.08), s * 0.58, 1.72, -halfL - 0.03);
  }
  P.add('hullDark', box(0.05, 0.16, 0.04), 0.3, 1.28, -halfL - 0.03);
  P.add('hull', box(0.55, 0.28, 0.15), -0.55, 0.9, -halfL + 0.02);
  P.add('hullDark', box(0.56, 0.014, 0.11), -0.55, 1.045, -halfL + 0.01);
  // Comms mast on a base pot, rear-right deck.
  P.add('hullDetail', cylY(0.05, 0.065, 0.14, 8), 0.98, 2.12, -1.18);
  P.add('hullDetail', box(0.035, 0.5, 0.035), 0.98, 2.45, -1.18, 0, 0, 0.03);
  // Rear top-corner rail frames over the troop bay.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.04, 0.04, 1.3), s * 1.1, 2.16, -2.0);
    P.add('hullDetail', box(0.7, 0.04, 0.04), s * 0.78, 2.16, -2.62);
    for (const zr of [-1.4, -2.0, -2.6]) {
      P.add('hullDetail', box(0.035, 0.16, 0.035), s * 1.1, 2.07, zr);
    }
  }
}

export const UK_PROFILES = {
  chieftain5: { build: chieftain5Build },
  challenger1: { build: challenger1Build },
  centurion3: { build: (P) => centurionBuild(P, 3) },
  centurion5: { build: (P) => centurionBuild(P, 5) },
  comet: {
    build: cometBuild, width: 3.05, hullLength: 6.55, roofY: 1.70, bandY: 0.96, trackW: 0.36,
    bowZ: 2.05, bowY: 1.50, noseTipY: 1.16, tailTrim: 0.02, wheels: 5, wheelR: 0.44, wheelSpan: 3.8,
    gunLength: 3.49, noBins: true, bandHalfW: 1.26, apronY: 1.54, sprocketInset: 0.50,
    trackXc: 1.30, // ref ground band |x| ~1.10..1.50 (v2 front row; the v1 narrow read was dy-shifted)
    // Comet cue: FOUR return rollers between the big Christie wheels.
    rollers: evenStations(4, 3.3).map((z) => ({ z, y: 0.76, r: 0.085 })),
  },
  challenger_cruiser: {
    build: a30Build, width: 2.91, hullLength: 8.03, roofY: 1.50, bandY: 0.88, trackW: 0.44,
    bowZ: 2.85, bowY: 1.40, noseTipY: 0.96, tailTrim: 0.03, wheels: 6, wheelR: 0.41, wheelSpan: 5.9,
    gunLength: 3.67, mgBall: false,
  },
  charioteer: {
    build: charioteerBuild, width: 3.05, hullLength: 6.55, roofY: 1.62, bandY: 0.94, trackW: 0.40,
    bowZ: 2.2, bowY: 1.40, noseTipY: 1.10, tailTrim: 0.02, wheels: 5, wheelR: 0.44, wheelSpan: 4.3,
    gunLength: 5.38, noBins: true, bandHalfW: 1.30, apronY: 1.50,
  },
  // FV510 Warrior sized to its recovered oracle (hull ±2.83, flank top ~2.06
  // rendered, RARDEN never clears the nose).
  // Published: hull = overall 6.34, width 3.03, height 2.80. The recovered
  // oracle is ~10% short — dims sovereign, curve rows carry the bounded cap.
  fv510: {
    build: fv510Build, width: 3.03, hullLength: 6.34, roofY: 1.80, trackW: 0.42,
    deck: [[3.17, 1.15], [2.85, 1.35], [2.55, 1.64], [1.4, 1.66], [1.24, 1.79], [0.42, 1.78],
      [-0.05, 1.81], [-0.32, 2.00], [-1.05, 2.02], [-2.58, 2.06], [-2.78, 1.42], [-3.17, 1.30]],
    noseRake: [[1.92, 0.42], [2.45, 0.50], [2.92, 1.02], [3.17, 1.13]],
    tailRake: [[-2.05, 0.42], [-2.85, 0.62], [-3.17, 0.85]],
    wheelSpan: 4.6,
    turretPivotY: 2.02, turretPivotZ: 0.5, gunX: 0.22, gunY: 0.3, gunZ: 0.4, gunLength: 1.85,
  },
};
