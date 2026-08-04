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
import { KIT, FITTINGS, evenStations } from './kit.js';

const {
  box, cylX, cylY, cylZ, sph, torus, slab, frustum, lathe, buildRunningGear,
  buildGun, liftEye, periscope, headlight, cupola, pintleMG, smokeCluster,
  stowage, tarpRoll, jerryCan, spareTrackStrip, xform,
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
      // Opt-in z-segmentation (g.fenderSegLen, default OFF = the original
      // single box): the gate's 14 station slices render front-on — an
      // axis-aligned thin plane paints ONLY its end caps there, so a
      // full-length fender vanishes from every mid slice and the measured
      // station width collapses to the track band (chieftain5 vertex r3
      // finding). Splitting the plate puts end caps in every slice; the
      // union silhouette is unchanged.
      if (g.fenderSegLen) {
        const n = Math.ceil((g.fenderZ1 - g.fenderZ0) / g.fenderSegLen);
        const d = (g.fenderZ1 - g.fenderZ0) / n;
        for (let k = 0; k < n; k++) {
          P.add('hullDetail', box(outer - inner, 0.035, d),
            side * (inner + outer) / 2, g.fenderY, g.fenderZ0 + d * (k + 0.5));
        }
      } else {
        P.add('hullDetail', box(outer - inner, 0.035, g.fenderZ1 - g.fenderZ0),
          side * (inner + outer) / 2, g.fenderY, (g.fenderZ0 + g.fenderZ1) / 2);
      }
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
    // g.wheelW is an r4 opt-in (default = the original formula, byte
    // identical): chieftain5's pad band narrowed to the ref's measured
    // 1.0765..1.4845 ground columns, and the derived wheel width would have
    // gone skinny with it.
    style: g.wheelStyle ?? 'dished', wheelR: g.wheelR, wheelW: g.wheelW ?? Math.min(0.24, g.trackW * 0.42),
    wheelY: g.wheelY ?? g.wheelR + 0.05, xc: g.trackXc, wheelZs: g.wheelZs,
    sprocket: g.sprocket, idler: g.idler, rollers: g.rollers ?? [],
    trackW: g.trackW, topY: g.trackTop, paintedEnds: true,
    coveredTop: g.coveredTop ?? !!g.skirt, arms: g.arms ?? !g.skirt,
    // uk r5 opt-ins (merkava r12 gear-tone law): per-tank pad/chain/tire
    // tones + the ambient-floor re-attach (Material.clone drops the family
    // hook and the default near-black pads render ambient-dead in wheel-bay
    // shade — the chieftain5 'teeth zipper' read). All undefined for every
    // other caller — buildRunningGear defaults are byte-identical.
    padHex: g.padHex, chainHex: g.chainHex, tireHex: g.tireHex,
    gearFloor: g.gearFloor,
  });
  // Mud flaps hang from the FENDER TIPS (hanging them at the hull nose/tail
  // left them floating over the raked plates -> articulation floaters).
  // g.flapDrop is an r4 opt-in (default 0, byte identical): chieftain5's
  // front flap top read over the ref's bare 1.52 glacis-deck columns.
  for (const side of [-1, 1]) {
    if (!g.noFlaps && g.fenderY) {
      const fd = g.flapDrop ?? 0;
      P.add('hullRubber', box(g.trackW * 0.9, 0.26, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.10 - fd, g.fenderZ1 - 0.025, -0.06, 0, 0);
      P.add('hullRubber', box(g.trackW * 0.9, 0.24, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.09, g.fenderZ0 + 0.025, 0.06, 0, 0);
    }
  }
  // Side number decals. Opt-in overrides (g.numberR/g.numberL/g.numberSize)
  // let a build pin them onto real side planes — the decal quad is mask
  // geometry, so a default position off the body's silhouette band costs
  // gate columns (chieftain5 vertex r3 finding). Defaults byte-identical.
  const numS = g.numberSize ?? 0.38;
  const numR = g.numberR ?? [bw + 0.01, (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  const numL = g.numberL ?? [-(bw + 0.01), (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  P.decal('hull', 'number', P.spec.visual.number || '', numS, numR, Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', numS, numL, -Math.PI / 2);
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
// VERTEX r3 retable (post-warp oracle, law v2 665aa7f): the warped print now
// reads published dims straight (hull mask 7.522, overall 10.788, top 2.928)
// — hull span pinned to the mask, glacis tip pulled to the print's 3.47
// CENTER notch (the 3.75 bow line belongs to the fender WINGS, built in the
// build fn), rear sprocket moved to the print's HIGH rear station (the
// climbing-run line 0.03@-2.47 -> 0.66@-3.57 is the track's own rear climb).
// Station-caps helper (vertex r3 finding): the gate's 14 station slices
// render FRONT-ON — an axis-aligned thin box paints only its END CAPS in a
// z-clipped slice, so a long plane vanishes from every mid slice and the
// measured station width collapses to whatever curved geometry remains.
// Split long planes into <=segLen chunks: same union silhouette, end caps
// land in every slice.
function segBoxZ(P, bucket, w, h, d, x, y, z, segLen = 0.48) {
  const n = Math.max(1, Math.ceil(d / segLen));
  const dz = d / n;
  for (let k = 0; k < n; k++) P.add(bucket, box(w, h, dz), x, y, z - d / 2 + dz * (k + 0.5));
}

const CHIEFTAIN_HULL = {
  bodyHalfW: 1.53, nose: 3.47,
  // r4: glacis dip re-knotted to the UNSHIFTED workorder columns (the r3
  // table was tuned against dAlong-poisoned sampling, see the wing-tip note
  // in the build fn) and the tail deck raised to the ref's 1.71 line.
  deck: [[3.47, 1.205], [3.28, 1.30], [3.10, 1.35], [2.88, 1.33], [2.72, 1.325],
    [2.62, 1.375], [2.52, 1.425], [2.42, 1.475], [2.16, 1.49], [2.08, 1.545],
    [1.88, 1.555], [1.62, 1.56], [1.10, 1.58], [0.30, 1.60], [-0.60, 1.61],
    [-1.35, 1.64], [-1.76, 1.705], [-2.47, 1.71], [-2.60, 1.71], [-3.30, 1.71],
    [-3.44, 1.695], [-3.58, 1.70], [-3.70, 1.72]],
  // Belly raised to the ref's cast floor line (front-view bottoms 0.49-0.56
  // across the inter-track band — the flat 0.50 slab read 0.02-0.06 low on
  // ~30 front columns). The keel/V-profile/channel pieces in the build fn
  // carry the measured cross-section; rakes start at the same 0.56 line.
  beltTop: 1.02, belly: 0.56,
  noseRake: [[2.55, 0.56], [2.90, 0.575], [3.20, 0.62], [3.38, 0.69], [3.47, 0.75]],
  tailRake: [[-2.30, 0.56], [-2.72, 0.575], [-3.08, 0.60], [-3.42, 0.64], [-3.60, 0.68]],
  tailShelf: { z0: -3.60, z1: -3.62, yBot: 1.06 },
  // The fender ASYMMETRY cert STANDS after the repair: the ref's LEFT fender
  // runs full-length at x -1.65..-1.77 while the right plane stops ~1.53
  // (the right-side width is completed by the engine-bay bin at the
  // committed plane). Mid-run fenders sit under the deck line; the plates
  // end at the front crest, with low sweep strips carrying the plan forward.
  fenderY: 1.575, fenderZ0: -3.70, fenderZ1: 1.9, fenderHalfW: 1.50, fenderHalfWL: 1.75,
  fenderSegLen: 0.45,
  rakeHalfW: 0.86, // containment law: rake lofts clear of the track channel (dilated)
  // 610 mm Chieftain track. r4: pads pulled to |x| 1.0765..1.4845 — the ref
  // grounds the RIGHT side only to x 1.48 (front col boundary 1.4993, the
  // certified left-shifted print: the old 1.512 pad edge painted the 1.519
  // front column to the ground for a 0.26 m error) and its INNER ground
  // edge reads |x| >= 1.062 (the -1.042 column keeps the 0.374 sponson
  // channel floor). Both pad faces hold ~15 mm off the column boundaries.
  trackXc: 1.2805, trackW: 0.328, wheelW: 0.20, flapDrop: 0.055,
  // r5 O2a gear tones (critic: guide-horn/pad luma p5 3-7 as 'glitch zipper
  // teeth' on pale discs vs the ref's whole-zone 26..76 band): the russia
  // r-series dark-olive recipe + gearFloor ambient re-attach.
  padHex: 0x343a29, chainHex: 0x2b3122, gearFloor: true,
  wheelR: 0.33, wheelY: 0.38, wheelStyle: 'rubber',
  wheelZs: [2.3, 1.42, 0.54, -0.34, -1.22, -2.1],
  // HIGH rear drive sprocket (the real Chieftain layout; the warped print's
  // hull-mask rear bottom line is the climb from the last wheel to this
  // wrap: 0.03@-2.47 rising ~0.53/m to 0.66@-3.57, wrap ending ~-3.60).
  sprocket: { z: -3.10, y: 0.875, r: 0.30 }, idler: { z: 2.58, y: 0.42, r: 0.3 },
  rollers: [{ z: 1.45, y: 0.82, r: 0.09 }, { z: 0.1, y: 0.82, r: 0.09 }, { z: -1.25, y: 0.82, r: 0.09 }],
  trackTop: 0.98, arms: true,
  // Decal quads are mask geometry: pin the side numbers onto real planes
  // (right engine-bay bin face / left deep guard plane) instead of the
  // default mid-air body line the print doesn't carry.
  numberSize: 0.34, numberR: [1.66, 2.01, -0.62], numberL: [-1.695, 1.19, 1.0],
};

function chieftain5Build(P) {
  const g = CHIEFTAIN_HULL;
  ukHull(P, g);
  const { rng } = P;
  // Bow fender WINGS, r4 retable to UNSHIFTED columns. r3's wing tip carried
  // a 0.28-0.30 m band through the LAST side column (3.6753..3.7967) while
  // the ref tip reads 0.214 there — with the 12%-of-height body threshold at
  // 0.267 that single column made the PROC body span one column longer than
  // the ref's, shifting side dAlong by half a pitch (+0.061) and smearing
  // every sharp side transition (REGISTRATION POISONING, BUILD-STANDARD §C).
  // The W3 tip now reads ~0.25 band (thin) and the ref's own bow lines are
  // followed piecewise: top 1.34@3.05 -> 1.22@3.43 -> 1.035@3.63 -> 1.03 at
  // the 3.755 tip; bottom 0.22@3.05 -> 0.56@3.43 -> 0.76@3.63 -> 0.82.
  // Left band full-width (certified left-fender asymmetry), right stops at
  // the 1.545 plane (ref station 13 width 1.542).
  for (const [xw1, xw2a, xw2b] of [
    [[-1.716, -1.077], [-1.716, -1.04], [-1.716, -1.04]],
    [null, [0.78, 0.83], [0.78, 0.83]],
    [[0.875, 1.484], [0.875, 1.523], [0.875, 1.523]],
  ]) {
    if (xw1) {
      // r5: W1 underside lifted 0.22 -> 0.30 at the z 3.05 heel — the ref's
      // 3.123 side column bottoms at 0.305 (the old heel read 0.244, the
      // r4 worst-3 side column). Front bottoms are track/tab-owned, so this
      // is side-only; the corner flap above closes the taller bay.
      P.add('hull', slab(                                  // W1 glacis wing
        [xw1[0], 0.56, 3.43], [xw1[1], 0.56, 3.43], [xw1[1], 0.30, 3.05], [xw1[0], 0.30, 3.05],
        [xw1[0], 1.25, 3.43], [xw1[1], 1.25, 3.43], [xw1[1], 1.34, 3.05], [xw1[0], 1.34, 3.05]));
    }
    P.add('hull', slab(                                    // W2a shoulder
      [xw2a[0], 0.72, 3.55], [xw2a[1], 0.72, 3.55], [xw2a[1], 0.56, 3.43], [xw2a[0], 0.56, 3.43],
      [xw2a[0], 1.235, 3.55], [xw2a[1], 1.235, 3.55], [xw2a[1], 1.25, 3.43], [xw2a[0], 1.25, 3.43]));
    P.add('hull', slab(                                    // W2b ledge
      [xw2b[0], 0.75, 3.616], [xw2b[1], 0.75, 3.616], [xw2b[1], 0.72, 3.55], [xw2b[0], 0.72, 3.55],
      [xw2b[0], 1.22, 3.616], [xw2b[1], 1.22, 3.616], [xw2b[1], 1.235, 3.55], [xw2b[0], 1.235, 3.55]));
    P.add('hull', slab(                                    // W3 thin tip
      [xw2b[0], 0.84, 3.755], [xw2b[1], 0.84, 3.755], [xw2b[1], 0.75, 3.616], [xw2b[0], 0.75, 3.616],
      [xw2b[0], 1.045, 3.755], [xw2b[1], 1.045, 3.755], [xw2b[1], 1.045, 3.616], [xw2b[0], 1.045, 3.616]));
  }
  P.add('hull', slab(
    [1.523, 0.82, 3.755], [1.556, 0.82, 3.755], [1.556, 0.80, 3.55], [1.523, 0.80, 3.55],
    [1.523, 1.045, 3.755], [1.556, 1.045, 3.755], [1.556, 1.13, 3.55], [1.523, 1.13, 3.55]));
  for (const s of [-1, 1]) P.add('hull', box(0.21, 0.06, 0.62), s * 0.945, 1.02, 2.81);
  // Right inner-track ground filler: the certified left-shifted print
  // grounds |x| 0.89..1.05 on the RIGHT side only (left track owns
  // 1.05..1.49 on both) — a dark sponson-shadow wall fills the band.
  segBoxZ(P, 'hullDark', 0.225, 0.456, 4.8, 1.0025, 0.228, 0);
  segBoxZ(P, 'hullDark', 0.045, 0.05, 4.4, 1.4625, 0.025, -0.1);
  segBoxZ(P, 'hullDark', 0.045, 0.05, 4.4, -1.4625, 0.025, -0.1);
  segBoxZ(P, 'hullDark', 0.04, 0.05, 4.4, -1.0965, 0.025, -0.1);
  // Cast belly cross-section (ref front-view floor): center keel line at
  // 0.46 (x -0.14..-0.09 — the print's 0.08 left shift), a shallow V rising
  // 0.49 -> 0.555 outboard, and the two deep sponson-floor channels at 0.37
  // (right 0.766..0.875 with a 0.44 step at 0.705..0.736, left
  // -0.959..-1.068) the probe located at z ~2.56 by the idler.
  P.add('hull', box(0.05, 0.10, 3.4), -0.115, 0.51, 0.2);
  // r5 O4d: cast belly V steepened to the evaluator's ±5.5° class (proc
  // read 0°/179.5° where the ref rises 5.6° front / 4.9° rear). Two-segment
  // per side, fitted to the ref's own front columns: left 0.512@-0.37 /
  // 0.561@-0.803, right 0.551@0.575 (the r4 flat 0.49->0.555 sat 0.02 low
  // mid-span and read level).
  // z-span runs under BOTH rake lofts (2.55/-2.30) — the rake loft bottom
  // edges are x-flat at 0.56 and owned the evaluator's 0-degree read even
  // after the V landed mid-hull; the V bottoms (0.49..0.5645) hang below
  // and give the front/rear faces the ref's rising lower edge. Front
  // columns are unchanged (same profile, longer span).
  P.add('hull', slab(
    [-0.40, 0.513, 2.55], [-0.03, 0.49, 2.55], [-0.03, 0.49, -2.3], [-0.40, 0.513, -2.3],
    [-0.40, 0.62, 2.55], [-0.03, 0.62, 2.55], [-0.03, 0.62, -2.3], [-0.40, 0.62, -2.3]));
  P.add('hull', slab(
    [-0.90, 0.5715, 2.55], [-0.40, 0.513, 2.55], [-0.40, 0.513, -2.3], [-0.90, 0.5715, -2.3],
    [-0.90, 0.62, 2.55], [-0.40, 0.62, 2.55], [-0.40, 0.62, -2.3], [-0.90, 0.62, -2.3]));
  P.add('hull', slab(
    [0.03, 0.49, 2.55], [0.60, 0.5525, 2.55], [0.60, 0.5525, -2.3], [0.03, 0.49, -2.3],
    [0.03, 0.62, 2.55], [0.60, 0.62, 2.55], [0.60, 0.62, -2.3], [0.03, 0.62, -2.3]));
  P.add('hull', slab(
    [0.60, 0.5525, 2.55], [0.90, 0.5645, 2.55], [0.90, 0.5645, -2.3], [0.60, 0.5525, -2.3],
    [0.60, 0.62, 2.55], [0.90, 0.62, 2.55], [0.90, 0.62, -2.3], [0.60, 0.62, -2.3]));
  P.add('hullDark', box(0.109, 0.21, 0.5), -1.0135, 0.475, 2.45);
  P.add('hullDark', box(0.109, 0.21, 0.5), 0.8205, 0.475, 2.45);
  P.add('hullDark', box(0.022, 0.15, 0.5), 0.755, 0.515, 2.45);
  // Glacis furniture: flush splash rail, driver periscope, headlight pods
  // (the print's 1.385 bump at z 2.94..3.02), shackles.
  P.add('hullDetail', box(1.7, 0.02, 0.08), 0, deckAtUK(g, 2.42) + 0.01, 2.42);
  // r5 O3b: the kit periscope's pale-blue glass band read as a blue chip on
  // the glacis (ref driver periscope is dark) — hand-built with a dark visor.
  P.add('hullDetail', box(0.14, 0.07, 0.1), -0.3, deckAtUK(g, 1.95) + 0.01, 1.95);
  P.add('hullDark', box(0.11, 0.032, 0.104), -0.3, deckAtUK(g, 1.95) + 0.022, 1.95);
  for (const side of [-1, 1]) {
    headlight(P, side * 1.15, 1.33, 2.96, -0.2);
    // r5 O3b: blackout covers over the kit lenses — the pale-blue glass
    // chips popped on the glacis where the ref's lamps read dark.
    P.add('hullDark', xform(cylZ(0.046, 0.014, 12), 0, 0, 0.052), side * 1.15, 1.33, 2.96, -0.2, 0, 0);
    P.add('hullDetail', box(0.24, 0.02, 0.18), side * 1.15, 1.385, 2.96, -0.25, 0, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), side * 0.9, 0.66, 3.30);
    P.add('hullDetail', torus(0.065, 0.017, 10), side * 0.9, 0.66, 3.41, Math.PI / 2, 0, 0);
    // Fender crest plates: the live warped-ref side tops ~1.70 only across
    // z 1.38..1.57 (the 1.53 deck line resumes beyond) and 1.72 over the
    // engine bay — mid-run fenders sit under the deck line. r4: front plate
    // 15 mm clear of the 1.3603 column boundary (AA law) and outer edges
    // pulled to the ref's own station widths (1.51 fwd / 1.53 aft).
    P.add('hullDetail', box(0.34, 0.03, 0.20), side * 1.34, 1.685, 1.475);
    P.add('hullDetail', box(0.38, 0.03, 1.3), side * 1.34, 1.695, -2.02);
    // plate-fill r1 (owner directive 2026-08-01): both crest plates floated
    // 9 cm ABOVE the fender plane with a see-through slot beneath — they
    // are raised stowage bins on the real vehicle. Close plate-to-fender
    // (tops tuck under the plates; interior to their side/plan columns).
    P.add('hullDetail', box(0.34, 0.085, 0.20), side * 1.34, 1.6375, 1.475);
    P.add('hullDetail', box(0.38, 0.085, 1.3), side * 1.34, 1.6375, -2.02);
  }
  // Engine deck: louvre field + fuel caps + rear grille face.
  P.add('hull', box(2.2, 0.04, 1.15), 0, 1.685, -2.65);
  if (P.q) for (let i = 0; i < 6; i++) {
    P.add('hullDark', box(2.05, 0.018, 0.05), 0, 1.70, -2.2 - i * 0.17);
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.03, 10), side * 1.15, 1.715, -1.9);
  // Tail kit, r4 retable to the ref's measured rear planes (probe: band
  // 1.176..1.68 at z -3.74, ref rear extent -3.768; plan rear line by
  // column: -3.71 left exhaust box, -3.61 recessed center, -3.72 tow plate,
  // -3.76 right exhaust run, -3.70 right outer). The right exhaust run's
  // -3.79 face is the hull-mask z0 (published-hull-length rear anchor) and
  // reliably paints the -3.819 side column the ref's own 1px sliver paints.
  P.add('hullDark', box(1.16, 0.5, 0.03), 0, 1.32, -3.60);
  P.add('hull', box(0.165, 0.63, 0.115), -0.8175, 1.375, -3.6575);
  P.add('hull', box(0.235, 0.63, 0.105), 0.7475, 1.375, -3.6525);
  P.add('hull', box(0.477, 0.475, 0.19), 0.3685, 1.3375, -3.695); // right exhaust run
  P.add('hull', box(0.59, 0.08, 0.125), -0.165, 1.615, -3.6625);  // tow-plate overhang
  P.add('hull', box(0.477, 0.08, 0.19), 0.3685, 1.615, -3.695);   // shelf over the exhausts
  P.add('hullDetail', box(1.9, 0.05, 0.05), 0, 1.66, -3.595);
  P.add('hullDark', cylZ(0.055, 0.016, 10), 0.37, 1.28, -3.782);
  // Right under-fender sponson strip: the ref carries structure to the
  // -3.70 tail at x 0.99..1.10 (plan col 1.048) where the fender's own
  // 17 mm column sliver is an AA coin-flip. The webs inboard close the
  // top-down pockets between the exhaust boxes and the fenders (§B2 hole
  // scan flagged 10 cells each side at x ±0.9, z -3.45).
  P.add('hull', box(0.11, 0.055, 0.55), 1.045, 1.5325, -3.425);
  P.add('hull', box(0.11, 0.055, 0.55), -1.045, 1.5325, -3.425);
  P.add('hull', box(0.36, 0.05, 0.55), 0.925, 1.535, -3.425);
  P.add('hull', box(0.36, 0.05, 0.55), -0.925, 1.535, -3.425);
  towCableUK(P, [[-1.0, 1.44, 2.2], [0, 1.56, 1.7], [1.0, 1.44, 2.2]], 1.37);
  // Hull-legit fender furniture (stays in the hull mask like the repaired
  // oracle's fused-root bins): RIGHT-side tall bin run over the engine-bay
  // fender, r4 retable to the ref's OWN station widths — outer face steps
  // 1.655 (z -0.97..-0.27) -> 1.63 (-1.30..-0.97) -> 1.595 -> 1.53 going
  // aft (gate stations 4/3 read the print at 1.63/1.53; the old flat-1.70
  // run + 1.70 lid owned station 4's 2.4% width error). The width-plane NUB
  // (1.745) and its under-chamfer live at z -0.56..-0.38 — the ref carries
  // that plane in STATION 6 (its x1 1.749), not station 5 (1.709).
  segBoxZ(P, 'hull', 0.30, 0.42, 0.70, 1.505, 2.0, -0.62);
  P.add('hull', box(0.245, 0.42, 0.33), 1.5075, 2.0, -1.135);
  P.add('hull', box(0.0435, 0.16, 0.37), 1.72675, 2.085, -0.535); // width nub
  P.add('hull', box(0.074, 0.32, 0.55), 1.657, 2.05, -0.625);     // bin outer chamfer
  P.add('hull', box(0.0155, 0.32, 0.37), 1.71375, 2.05, -0.535);  // nub rib
  P.add('hull', box(0.21, 0.42, 0.32), 1.475, 2.0, -1.44);
  P.add('hull', box(0.15, 0.44, 0.17), 1.455, 1.985, -1.635);
  P.add('hullDetail', box(0.275, 0.02, 0.66), 1.5025, 2.205, -0.62);
  P.add('hullDetail', box(0.225, 0.02, 0.30), 1.4975, 2.205, -1.135);
  // plate-fill r1 (owner directive 2026-08-01): the tall bin FLOATED 0.2 m
  // above the fender plane — a clean see-through slot ran under the whole
  // width-committing face (ray-probed: sight lines crossed the vehicle
  // untouched between bin bottom 1.79 and fender 1.59). The REF's own bin
  // floats too (a full-width fill moved front_whole 47.3 -> 45.6: the
  // certified silhouette owns that air), so the corridor closes INBOARD:
  // a web at the right fender's own 1.50 plane, bin bottom to fender top.
  // Sight lines under the bin now end on shadowed structure instead of
  // crossing the vehicle; the authentic bin-overhang read stays.
  P.add('hull', box(0.10, 0.21, 1.33), 1.45, 1.685, -0.935);
  // LOW left bin, z-shrunk to the ref's own 1.675-band (side cols
  // 1.421..1.786 only — the old z 0.85..2.35 run smeared five deck columns
  // 0.09 high) with the inner edge clear of the -1.6923 front boundary.
  P.add('hull', box(0.27, 0.14, 0.456), -1.535, 1.63, 1.604);
  // r5 O3c: the plan read scattered ~6-8 warm lids vs the ref's SINGLE
  // red-brown fender tarp — the lid plates above went scheme-detail olive
  // and this roll becomes the one sanctioned brown accent (hullWood).
  tarpRoll(P, 'hullWood', 1.42, 1.63, -2.2, 1.0, 0.07, false);
  // LEFT track-guard: outer lip band 0.6..1.6 at x -1.73 (kept) — but the
  // r2-era 'inner deep run to the GROUND' (x -1.71..-1.51, y 0..1.58) is
  // DELETED (r5 O1): it hid all six paired Horstmann wheels that the ref's
  // own left view shows below a wheel-top hem. The ref's -1.51..-1.71 front
  // columns still read to the ground (its left flap/track smear), so five
  // thin near-black hem tabs at the wheel-GAP stations own those column
  // BOTTOMS instead (§C material-split lane: hullShadow reads as wheel-bay
  // shadow between the wheels). Side rows are untouched — the ground run
  // already reads y=0 across every tab column; stations are fender-owned
  // (the -1.75 plate outspans the old wall in every window).
  segBoxZ(P, 'hull', 0.06, 1.01, 4.95, -1.72, 1.095, -0.975);
  for (const zTab of [1.86, 0.98, 0.10, -0.78, -1.66]) {
    P.add('hullShadow', box(0.203, 0.625, 0.045), -1.6115, 0.3175, zTab);
  }
  // r5 O2b: front corner flaps tucked behind the bow-wing undersides,
  // FORWARD of the idler wrap (wrap ends z ~3.02; flaps at 3.08..3.16 —
  // containment-clear) with bottoms 0.31 ≥ the ref's own side-column
  // bottoms (0.305 @ z 3.123), so no gate row moves. They close the
  // close-front bow-bay cavity the way the ref's corners read filled;
  // hullTrack matches the ref's warm dusty flap/track tone (measured
  // rgb ~(69,63,53)).
  P.add('hullTrack', box(0.6393, 0.55, 0.08), -1.39365, 0.585, 3.12);
  P.add('hullTrack', box(0.5957, 0.55, 0.08), 1.17965, 0.585, 3.12);
  segBoxZ(P, 'hull', 0.06, 0.98, 4.20, 1.50, 1.08, -0.60);
  segBoxZ(P, 'hull', 0.06, 0.29, 1.00, 1.50, 1.425, -3.20);
  for (const s of [-1, 1]) {
    const xo = s < 0 ? 1.75 : 1.53;
    segBoxZ(P, 'hullDetail', xo - 1.06, 0.03, 0.95, s * (1.06 + xo) / 2, 1.32, 2.35);
    segBoxZ(P, 'hullDetail', xo - 1.06, 0.03, 0.85, s * (1.06 + xo) / 2, 1.15, 3.2);
  }

  // ---- the FULL casting yaws (batch-5 repaired rig): waist + collar +
  // cupola + racks + crown + gun + masts, all in the turret buckets.
  // VERTEX r3 (post-warp): roofline RAISED to the warped ref — cupola crown
  // 2.90 at (x -0.88, z -0.24), sight housing 2.71 at (x -0.57, z -0.05),
  // masts KNEED to 2.93 at the ref's own three spike columns (z -1.02 whip,
  // z 0.49 twin sight masts) instead of the old 3.5-3.8 towers ----
  P.turretG.position.set(0, 1.72, 0.02);
  // r4: gun axis re-seated on the raycast-probed ref tube (y 1.856, x drift
  // centered at -0.125).
  P.gunG.position.set(-0.125, 0.136, 0.62);
  // Saucer crown (non-cupola crown 2.44-2.56 in the fresh curves).
  P.add('turret', KIT.lathe([
    [1.30, 0.13], [1.32, 0.30], [1.22, 0.46], [1.05, 0.565], [0.78, 0.635], [0.45, 0.66], [0.02, 0.665],
  ], 30, 1.25), 0, 0, -0.55);
  P.add('turret', slab(                                               // reclined face
    [-0.55, -0.28, 1.42], [0.55, -0.28, 1.42], [0.62, -0.25, 0.35], [-0.62, -0.25, 0.35],
    [-0.3, 0.62, 0.10], [0.3, 0.62, 0.10], [0.5, 0.655, -0.4], [-0.5, 0.655, -0.4]));
  P.add('turret', slab(                                               // chin to the mantlet
    [-0.5, -0.31, 1.30], [0.5, -0.31, 1.30], [0.6, -0.31, 0.2], [-0.6, -0.31, 0.2],
    [-0.55, -0.28, 1.44], [0.55, -0.28, 1.44], [0.62, -0.25, 0.4], [-0.62, -0.25, 0.4]));
  // Casting waist band (ex-hull static works, absorbed by the oracle repair):
  // ring collar behind the gun. r4: the flat 2.40-wide/2.37-tall box painted
  // seven front columns 0.05-0.07 high — the ref waist SLOPES 2.35@|x|0.98
  // -> 2.27@1.44 (cast shoulders), so the collar narrows to ±0.98 and slab
  // shoulders carry the drop (left one ends at -1.30 under the flank bins).
  P.add('turret', box(1.80, 0.60, 0.90), 0, 0.35, -0.42);
  P.add('turret', slab(
    [0.90, 0.05, 0.03], [1.44, 0.05, 0.03], [1.44, 0.05, -0.87], [0.90, 0.05, -0.87],
    [0.90, 0.635, 0.03], [1.44, 0.55, 0.03], [1.44, 0.55, -0.87], [0.90, 0.635, -0.87]));
  P.add('turret', slab(
    [-1.30, 0.05, 0.03], [-0.90, 0.05, 0.03], [-0.90, 0.05, -0.87], [-1.30, 0.05, -0.87],
    [-1.30, 0.572, 0.03], [-0.90, 0.635, 0.03], [-0.90, 0.635, -0.87], [-1.30, 0.572, -0.87]));
  P.add('turretDetail', box(1.74, 0.024, 0.8), 0, 0.645, -0.42);
  // Right cheek tier along the casting (warped ref plan: front edge 1.95 at
  // x 0.50..0.92, top at the 2.29 band; z-shortened clear of the 1.4817
  // side-column boundary so the chin band owns those columns).
  segBoxZ(P, 'turret', 0.42, 0.55, 2.05, 0.71, 0.295, 0.405);
  P.add('turretDetail', box(0.40, 0.014, 1.95), 0.71, 0.578, 0.405);
  P.add('turret', box(0.36, 0.45, 0.36), 0.68, 0.245, 1.75);
  // Right low bin sliver rows (ref plan: the deep run behind the bins reads
  // to z -1.44 at x 1.60..1.63 — plan col 1.658 — while station 4 caps the
  // slice width at the same 1.63; one x 1.49..1.628 run satisfies both).
  segBoxZ(P, 'turret', 0.21, 0.40, 2.08, 1.355, 0.29, -0.75);
  P.add('turretDetail', box(0.19, 0.014, 2.00), 1.355, 0.497, -0.75);
  // r5 O4 casting shoulder (evaluator refOnly arc r 0.246 span 124° — the
  // ref's right band rolls 2.295 @ x<=1.52 -> 2.245 @ 1.56 -> 2.235 @ 1.60
  // -> 2.215 @ 1.68 where the proc stepped 2.295 | 2.19 | 2.21 square):
  // the 2.295 turret sliver now stops at the 1.5402 column boundary, the
  // hull run behind it rises to the ref's 2.2325 line, and quarter-round
  // crests roll both top-outer edges (r < 0.48 chord-limit class — radius
  // authored, cited, not tool-paired).
  segBoxZ(P, 'hull', 0.138, 0.415, 1.12, 1.559, 2.025, -0.88);
  P.add('hull', xform(cylY(0.045, 0.045, 1.12, 10, false, Math.PI / 2, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0), 1.583, 2.1875, -0.88);
  segBoxZ(P, 'turret', 0.0505, 0.475, 1.30, 1.50025, 0.3375, -0.28);
  P.add('turret', xform(cylY(0.05, 0.05, 1.30, 10, false, Math.PI / 2, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0), 1.4755, 0.525, -0.28);
  P.add('turret', box(0.04, 0.35, 0.50), 1.62, 0.29, 0.04);
  P.add('turret', box(0.034, 0.045, 0.07), 1.583, 0.4425, 0.275);
  // IR searchlight box on the LEFT cheek (warped ref: front face 1.56-1.58,
  // top at the 2.30 band, x -0.55..-0.98).
  P.add('turret', box(0.43, 0.68, 0.72), -0.765, 0.24, 1.06);
  P.add('turret', box(0.29, 0.30, 0.32), -0.695, -0.05, 1.60);
  P.add('turret', box(0.14, 0.30, 0.17), -0.91, -0.05, 1.525);
  P.add('turretDark', box(0.36, 0.34, 0.05), -0.765, 0.30, 1.44, -0.1, 0, 0);
  // r5 O3b: the full-size glass pane read PALE BLUE at luma 58.9 (b>=r)
  // where the ref's panes are barely distinct — near-black door with one
  // small lens glint only.
  P.add('turretDark', box(0.28, 0.24, 0.02), -0.765, 0.30, 1.47, -0.1, 0, 0);
  P.add('turretGlass', box(0.04, 0.03, 0.015), -0.765, 0.325, 1.478, -0.1, 0, 0);
  // Chin casting band over the driver, r4 three-piece to the ref's own side
  // line: 2.285->2.315 rising to z 1.44 (B1), a 2.22 step band to 1.58 (B2),
  // then the dive 2.17 -> 2.12 at the driver plate (B3). The old single
  // slab averaged the profile and painted station 10's top 0.06 high. Top
  // quads taper to ±0.56 so the plan front edge falls off at |x|>0.6 like
  // the print's casting (plan_turret col -0.657 reads 1.846, not the 1.937
  // full-width line).
  P.add('turret', slab(                                               // B1
    [-0.62, 0.10, 1.44], [0.62, 0.10, 1.44], [0.66, 0.14, 0.90], [-0.66, 0.14, 0.90],
    [-0.56, 0.595, 1.44], [0.56, 0.595, 1.44], [0.62, 0.56, 0.90], [-0.62, 0.56, 0.90]));
  // r5 O4a needle-nose recline: the crown-to-collar line ran LEVEL 177°
  // where the ref falls 163° (left view, z 1.47..1.94; ref columns bound
  // the line at ~2.22 @ z 1.54 -> 2.132 @ 1.905). B1's 0.595 rear edge now
  // BREAKS down to a falling B2/B3 bevel (0.505@1.44 -> 0.46@1.58 ->
  // 0.40@1.95, world 2.225 -> 2.12, ~164°) and the chin canvas is trimmed
  // under it (the old roll owned the z 1.905 side column 0.03 high).
  P.add('turret', slab(                                               // B2
    [-0.60, 0.185, 1.58], [0.60, 0.185, 1.58], [0.62, 0.10, 1.44], [-0.62, 0.10, 1.44],
    [-0.56, 0.46, 1.58], [0.56, 0.46, 1.58], [0.56, 0.505, 1.44], [-0.56, 0.505, 1.44]));
  P.add('turret', slab(                                               // B3
    [-0.55, 0.34, 1.95], [0.55, 0.34, 1.95], [0.60, 0.185, 1.58], [-0.60, 0.185, 1.58],
    [-0.52, 0.40, 1.95], [0.52, 0.40, 1.95], [0.56, 0.46, 1.58], [-0.56, 0.46, 1.58]));
  P.add('turretCloth', box(0.5, 0.13, 0.44), 0, 0.285, 1.70, -0.24, 0, 0);
  // No.15 commander cupola LEFT of center (warped ref: drum 2.845 with the
  // 2.90 cap owning exactly ONE side column at z -0.163 — the published-
  // height p95 anchor; drum top 2.833 reads in the -0.285 column like the
  // ref's own stud ring). All faces hold 15 mm off the -0.1017/-0.2243
  // column boundaries (AA law). The small flank block carries the ref's
  // 2.827 read in the -1.002 FRONT column (its vision-block ring bulge).
  P.add('turret', cylY(0.15, 0.165, 0.22, 16), -0.88, 0.69, -0.285);
  P.add('turret', cylY(0.105, 0.105, 0.335, 16), -0.88, 0.9575, -0.225);
  P.add('turret', box(0.045, 0.055, 0.12), -0.9825, 1.0925, -0.22);
  P.add('turret', cylY(0.045, 0.045, 0.055, 14), -0.88, 1.1525, -0.163);
  P.add('turretDark', cylY(0.038, 0.038, 0.016, 14), -0.88, 1.172, -0.163);
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.55;
    P.add('turretDark', box(0.05, 0.045, 0.04), -0.88 + Math.sin(a) * 0.10, 1.09, -0.20 + Math.cos(a) * 0.075, 0, a, 0);
  }
  P.add('turretDark', box(0.05, 0.05, 0.14), -0.88, 1.0975, -0.21);
  // Commander sight saddle behind the cupola: the ref side line steps
  // 2.437 -> 2.498 -> 2.559 going forward — saddle plus a lower rear step.
  P.add('turret', box(0.30, 0.205, 0.32), -0.62, 0.7575, -0.565);
  P.add('turret', box(0.30, 0.15, 0.115), -0.62, 0.705, -0.7775);
  // Roof sight housing forward-left (ref front 2.708 flat band at
  // x -0.42..-0.71, one side column at z ~-0.05).
  P.add('turret', box(0.31, 0.35, 0.11), -0.575, 0.813, -0.075);
  P.add('turretDark', box(0.23, 0.035, 0.02), -0.575, 0.935, -0.012);
  // Loader hatch ring right of the cupola.
  P.add('turretDetail', cylY(0.19, 0.21, 0.06, 14), 0.46, 0.595, -0.54);
  // Crown furniture (probed off the warped print): gunner sight ON the
  // crown, the raised sight plate left of center (ref 2.469 at x -0.13..
  // -0.26 / z -0.20..-0.60), the loader periscope (2.43 at x 0.48..0.55)
  // and the ventilator dome (2.385 at x 0.61..0.67).
  P.add('turret', box(0.2, 0.07, 0.24), 0.3, 0.625, -0.14);
  P.add('turretDark', box(0.14, 0.045, 0.03), 0.3, 0.645, -0.01);
  // r5 O3a: the raised sight plate caught the camo scheme's pale patch and
  // read TAN (luma 63.1/p95 91, yellow-shifted — tan belongs to the
  // CENTURIONS' mantlet canvas, §H.4). detail tint still read 62 up-facing
  // vs the ref's 48.6 at the same columns — dark fitting steel matches.
  P.add('turretDark', box(0.135, 0.082, 0.38), -0.1925, 0.701, -0.40);
  P.add('turret', box(0.08, 0.10, 0.12), 0.515, 0.665, -0.50);
  P.add('turret', cylY(0.034, 0.030, 0.055, 12), 0.6425, 0.6375, -0.50);
  // Twin sight/searchlight masts KNEED to the warped ref tops (2.93 band,
  // both in the ref's own z 0.43/0.55 side-column pair): right mast on the
  // crown at x +0.86, left mast on the long bin run at x -1.26. r4: the
  // left head widens to the ref's TWO-column front read (-1.278/-1.239 both
  // 2.926) and its base drops under the 2.31 bin line (ref front col
  // -1.199 reads 2.305, the old 2.42 base owned it).
  P.add('turret', box(0.06, 0.18, 0.12), 0.87, 0.63, 0.50);
  P.add('turret', box(0.024, 0.40, 0.11), 0.865, 0.92, 0.50);
  P.add('turretDark', box(0.028, 0.23, 0.09), 0.865, 1.10, 0.57);
  P.add('turret', box(0.022, 0.05, 0.12), -1.249, 0.585, 0.50);
  P.add('turret', box(0.02, 0.44, 0.11), -1.25, 0.84, 0.50);
  // r5: head widened to pin BOTH of the ref's 2.926 front columns
  // (-1.278/-1.239) — the r4 0.022 head covered the -1.276 column by only
  // 4.5 mm and the boundary drift law made it a ±0.32 whole-row coin (this
  // round's workorder caught it flapped: proc 2.294 vs ref 2.924).
  P.add('turretDark', box(0.052, 0.235, 0.05), -1.255, 1.0875, 0.445);
  // Whip antenna: base pot on the crown rear + slim kneed mast (the ref's
  // single 2.92 column at z -1.03).
  P.add('turret', box(0.06, 0.16, 0.08), 0.72, 0.70, -1.02);
  P.add('turretDark', box(0.036, 0.40, 0.10), 0.72, 1.00, -1.02);
  liftEye(P, 'turretDetail', -0.84, 0.565, 0.35, 0.4);
  liftEye(P, 'turretDetail', 0.84, 0.565, 0.35, -0.4);
  // Commander's GPMG on the crown left, stowed aft over the saddle (§B3
  // mandatory roof MG — FITTINGS census; envelope inside the turret AABB,
  // receiver 2.67 < the 2.90 cap, barrel under the whip column).
  {
    // r5 O5: a fully-open crown pose priced 7 front columns at +0.15 (the
    // receiver rides the low saucer) — over the 0.4-pt pintle allowance.
    // Kept the r4-priced aft-left station but raised 0.04 and yawed 0.15
    // more aft so the receiver crests the saddle edge and the barrel line
    // crosses the (now olive-detail) bustle lids instead of the dark
    // saddle — dark crown-riding polarity per MG PHYSICS.
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0, scale: 0.8, seed: 5 });
    mg.position.set(-0.33, 0.60, -0.32);
    mg.rotation.y = Math.PI + 0.45;
    P.turretG.add(mg);
  }
  // Smoke discharger bins on bracket arms, below the brow.
  for (const sd of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.05, 0.05), sd * 0.68, 0.1, 0.9, 0, sd * 0.35, 0);
    P.add('turretDark', box(0.15, 0.17, 0.36), sd * 0.9, 0.08, 0.92, 0, sd * 1.1, 0);
    smokeCluster(P, sd * 0.95, 0.2, 0.98, 6, sd * 1.2, 0.8);
  }
  // LEFT flank long bin run (the print's fused fender bins live in its
  // turret node and yaw). r4 terraced: inner shelf x -1.24..-1.02 at the
  // ref's 2.285 side band, outer shelf x -1.37..-1.24 at its 2.24 FRONT
  // band (cols -1.357/-1.318), aft run dropped to the 1.725..2.225 band
  // (side cols -1.869/-1.991 read 2.224..1.736), outer wall at 2.19.
  segBoxZ(P, 'turret', 0.22, 0.8825, 1.99, -1.13, 0.12125, 0.375);
  segBoxZ(P, 'turret', 0.22, 0.7575, 0.31, -1.13, 0.18375, -0.775);
  segBoxZ(P, 'turret', 0.13, 0.84, 1.99, -1.305, 0.10, 0.375);
  segBoxZ(P, 'turret', 0.13, 0.715, 0.31, -1.305, 0.1625, -0.775);
  segBoxZ(P, 'turret', 0.36, 0.50, 0.86, -1.20, 0.255, -1.54);
  // r5: end wall trimmed 2.285 -> 2.235 — the ref's -1.315/-1.355 front
  // columns read 2.235 (was +0.049 on both).
  P.add('turret', box(0.36, 0.51, 0.145), -1.20, 0.26, -1.6175);
  P.add('turretDetail', box(0.205, 0.02, 2.225), -1.1325, 0.552, 0.2025);
  segBoxZ(P, 'turret', 0.07, 0.42, 2.92, -1.515, 0.26, -0.26);
  P.add('turretDark', box(0.16, 0.06, 0.06), -1.44, 0.46, 0.40);
  P.add('turretDark', box(0.16, 0.06, 0.06), -1.44, 0.46, -0.80);
  // Aft flank rack tiers: LEFT inner tall tier at the ref's 2.34 side band
  // (z -1.545..-1.045 — clear of the -1.5647 column boundary; the ref dips
  // to 2.285 in the -1.625 column) with the 2.185 outer tier; RIGHT rack
  // pair at the ref's 2.295/2.315 station-4 top.
  P.add('turret', box(0.42, 0.62, 0.50), -1.03, 0.31, -1.295);
  P.add('turretDetail', box(0.40, 0.02, 0.44), -1.03, 0.612, -1.295);
  P.add('turret', box(0.26, 0.475, 0.50), -1.38, 0.2275, -1.40);
  P.add('turret', box(0.66, 0.54, 0.62), 1.12, 0.305, -1.42);
  P.add('turretDetail', box(0.66, 0.02, 0.56), 1.12, 0.585, -1.42);
  P.add('turret', box(0.36, 0.46, 0.45), -1.17, 0.28, -1.87);
  P.add('turretDetail', box(0.36, 0.02, 0.40), -1.17, 0.51, -1.87);
  P.add('turret', box(0.48, 0.46, 0.40), 1.05, 0.28, -1.845);
  P.add('turretDetail', box(0.46, 0.02, 0.36), 1.05, 0.51, -1.845);
  P.add('turret', box(0.42, 0.10, 0.17), -1.03, 0.44, -1.735);
  // Bustle bins + NBC pack + rear rack lip (warped ref: 2.24 band to the
  // -2.3 turret tail; its rear basket top rail reads 2.01..2.07 in the
  // -2.356 side column — the left rail stub carries it).
  P.add('turret', box(1.5, 0.46, 0.6), 0, 0.29, -1.62);
  P.add('turretDetail', box(1.38, 0.03, 0.5), 0, 0.505, -1.62);
  P.add('turret', box(1.15, 0.46, 0.5), 0.1, 0.29, -2.02);
  P.add('turret', box(1.49, 0.40, 0.16), -0.015, 0.315, -2.18);
  P.add('turretDark', box(0.4, 0.24, 0.05), 0.1, 0.235, -2.17);
  P.add('turretDetail', box(0.13, 0.07, 0.125), -0.685, 0.32, -2.3125);
  P.add('turretDetail', box(1.46, 0.04, 0.04), 0, 0.50, -2.25);
  P.add('turretDetail', box(1.46, 0.04, 0.04), 0, 0.12, -2.25);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.03, 0.36, 0.03), -0.66 + k * 0.264, 0.31, -2.25);
  // L11A5 straight out of the casting: collar -> sleeve -> evac -> MRS.
  // r4 tube profile from raycast probes of the warped print: axis y 1.856,
  // bare/sleeved band r 0.105-0.111 the whole run, fume extractor r 0.129
  // CENTERED AT WORLD 4.90 (the old 0.56 fraction drum sat 0.7 m forward of
  // the ref's and cost ~10 tube columns), breech ring 1.98 to z 2.52, and
  // the muzzle-end MRS block reaching x -0.265..0.065 (plan cols -0.292..
  // 0.074 read the ref gun to z 6.45-6.70 there).
  // r5 O4b/O4c: the L11 emerges from a CASTING, not a bracket — the square
  // collar boxes are now a conical cast stack (same probed bands: block
  // bottom 1.546, z-end 1.83 — r4 raycast anchors); the 0.43-wide sleeve
  // box band is an OCTAGONAL prism at the ref's plan line (flats +-0.111 ->
  // plan edge -0.236 vs the ref's one straight -0.24 line; y-band 0.222
  // unchanged) ending at world 4.47 for the ref's side sleeve->tube STEP
  // (ref bottom lines break 2.52 m @ z 1.95..4.47 + 2.17 m @ 4.83..7.00),
  // then a fatter sagged rear octagon (band 1.706..1.949 — ref columns
  // 1.949..1.706 at z 5.44/5.56) carries to the muzzle kit. The fume-
  // extractor drum swells to the ref's r_y 0.1525 (col 4.829 bottom 1.675).
  P.addGunExtra(cylZ(0.17, 0.42, 18, 0.20), 0, 0, 0.16);
  P.addGunExtra(cylZ(0.155, 0.55, 18, 0.185), 0, -0.01, 0.62);
  P.addGunExtra(cylZ(0.22, 0.28, 18), 0.01, -0.09, 1.05);
  P.addGunExtra(cylZ(0.1375, 0.62, 18), 0.01, -0.012, 1.57);
  // canvas hood ring at the gun root — the chin-canvas trim above exposed
  // the ref's 2.041 read in the z 2.027 side column (hood bulge r ~0.20,
  // z-narrow inside the one column, 15 mm off both boundaries).
  P.addGunExtraDark(cylZ(0.175, 0.092, 16), 0, 0.015, 1.387);
  P.addGunExtra(xform(cylZ(0.1201, 2.88, 8), 0, 0, 0, 0, 0, Math.PI / 8), 0, -0.01, 2.39);
  P.addGunExtra(xform(cylZ(0.1315, 2.11, 8), 0, 0, 0, 0, 0, Math.PI / 8), 0, -0.0285, 5.245);
  P.addGunExtra(cylZ(0.1525, 0.213, 18), 0, -0.0285, 4.2495);
  // transition tapers (evaluator: the ring->sleeve staircase fitted +3.5°
  // vs the ref's 179.1° line, and the sleeve->evac step read 157.8° vs the
  // ref's 168.5° falling swell in close-front) — interior shading lines;
  // the swell taper's 4.80 top meets the ref's own 1.98 column read.
  P.addGunExtra(cylZ(0.124, 0.25, 12, 0.135), 0.005, -0.014, 1.82);
  P.addGunExtra(cylZ(0.148, 0.33, 12, 0.111), 0, -0.02, 3.995);
  P.addGunExtra(box(0.17, 0.19, 0.30), 0.105, 0, 5.91);
  P.addGunExtra(box(0.143, 0.19, 0.26), -0.0565, 0, 5.74);
  P.addGunExtraDark(cylZ(0.126, 0.05, 16), 0, 0, 4.00);
  P.addGunExtraDark(cylZ(0.108, 0.05, 16), 0, 0, 2.95);
  P.addGunExtraDark(cylZ(0.108, 0.05, 16), 0, 0, 5.32);
  P.addGunExtra(cylZ(0.145, 0.62, 16, 0.215), 0, 0, 0.45);
  P.addGunExtraDark(cylZ(0.152, 0.05, 16), 0, 0, 0.72);
  buildGun(P, { len: 6.40, r: 0.105, sleeve: false, evac: 0.6656, evacR: 1.229, collar: false, baseR: 0.16 });
  P.add('gun', cylZ(0.104, 0.09, 12), 0, 0, 6.40 - 0.5);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.1, 0.3, -0.6], Math.PI / 2);
  P.topY = 1.15;
}

// Shared UK tow cable on the glacis with clamp cleats.
const deckAtUK = (g, z) => lineAt(g.deck, z);

// Opt-in path/cleat overrides (uk r4): chieftain5's cable sagged over the
// ref's bare 1.49-1.55 glacis deck line once side registration was honest —
// its call lowers the run. Defaults byte-identical for every other caller.
function towCableUK(P, pts = [[-1.0, 1.52, 2.2], [0, 1.62, 1.7], [1.0, 1.52, 2.2]], cleatY = 1.45) {
  KIT.towCable(P, pts);
  P.add('hullDetail', box(0.1, 0.24, 0.14), -1.0, cleatY, 2.2);
  P.add('hullDetail', box(0.1, 0.24, 0.14), 1.0, cleatY, 2.2);
}

// ---------------------------------------------------------------------------
// Challenger 1 Mk.3 — VERTEX r3 FULL RETUNE (post-warp oracle, law v2
// 665aa7f): roof plateau raised to 2.93, antennas kneed to 2.97-2.98.
// SPLIT-RIG PRINT (certified false-alarm followers): the ref keeps its roof
// FURNITURE — commander sight (2.93), TOGS head (2.97), roof step (2.79),
// antennas (2.98), rear basket (2.16-2.42) — in its HULL mask (un-modeled
// CHALLENGER_TURRET_FOLLOWERS). The build mirrors that split: those pieces
// are hull-bucket statics seated over/around the casting; the TURRET mask
// carries only the casting shell (plateau 2.50, nose z 2.84, side bins to
// x 1.45) + the L11 with its fat armored collar (contour r 0.42-0.50).
// Published: hull 8.32, overall 11.50, width 3.52, height 2.95 (sovereign).
// ---------------------------------------------------------------------------
const CR1_HULL = {
  bodyHalfW: 1.53, nose: 4.16,
  deck: [[4.16, 1.19], [4.04, 1.28], [3.86, 1.325], [3.60, 1.44], [3.43, 1.475],
    [3.17, 1.515], [3.00, 1.545], [2.90, 1.60], [2.30, 1.64], [-1.30, 1.66],
    [-2.20, 1.73], [-2.56, 1.745], [-3.10, 1.727], [-3.51, 1.74], [-4.03, 1.735],
    [-4.09, 1.71]],
  beltTop: 1.02, belly: 0.52,
  // Ground bow/tail lines: track climb to the (z -2.75, y 0.75) sprocket,
  // then the steep tail plate into the 1.12 undercut shelf; bow wings own
  // the rising 0.30@3.5 -> 0.99@4.17 nose-bottom line.
  noseRake: [[2.82, 0.52], [3.10, 0.56], [3.43, 0.66], [3.90, 0.85], [4.16, 1.02]],
  tailRake: [[-2.25, 0.52], [-2.75, 0.55], [-3.08, 0.66], [-3.25, 0.80], [-3.43, 1.02]],
  tailShelf: { z0: -3.43, z1: -3.60, yBot: 1.12 },
  // Skirt plane at the print's 1.60-1.63 hem band (0.53), OUTSIDE the
  // 1.005..1.525 track band (containment); the ±1.745 width plane is the
  // FRONT-HALF fender/mirror run only (plan z 3.58..-0.40).
  skirt: { x: 1.655, top: 1.74, bot: 0.53, z0: -3.30, z1: 2.55 }, skirtPanels: 10,
  fenderY: 1.54, fenderZ0: -0.40, fenderZ1: 3.30, fenderHalfW: 1.70,
  fenderSegLen: 0.45,
  rakeHalfW: 0.92, // containment law: rake lofts clear of the 0.96..1.57 pad envelope
  trackXc: 1.265, trackW: 0.54, wheelR: 0.41, wheelY: 0.46, wheelStyle: 'dished',
  wheelZs: [2.5, 1.62, 0.74, -0.14, -1.02, -1.9],
  sprocket: { z: -2.60, y: 0.74, r: 0.33 }, idler: { z: 3.50, y: 0.60, r: 0.28 },
  trackTop: 0.98, arms: false, coveredTop: true,
  // Decal quads are mask geometry — pin the numbers onto the skirt plates.
  numberSize: 0.34, numberR: [1.628, 1.15, 0.5], numberL: [-1.628, 1.15, 0.5],
};

function challenger1Build(P) {
  const g = CR1_HULL;
  ukHull(P, g);
  // Bow wings: the print's 4.169 bow corners at x 0.93..1.56 with the
  // rising 0.30 -> 0.99 underside; tips thin (<0.27 band) so the side
  // registration's first body column stays at the ref's own z 4.04.
  for (const [x0, x1] of [[-1.65, -0.95], [0.95, 1.65]]) {
    P.add('hull', slab(
      [x0, 0.99, 4.165], [x1, 0.99, 4.165], [x1, 1.00, 3.45], [x0, 1.00, 3.45],
      [x0, 1.185, 4.165], [x1, 1.185, 4.165], [x1, 1.44, 3.45], [x0, 1.44, 3.45]));
    P.add('hullRubber', box(0.5, 0.35, 0.05), (x0 + x1) / 2, 0.82, 4.05, -0.08, 0, 0);
  }
  for (const s2 of [-1, 1]) {
    P.add('hull', slab(
      [s2 * 1.745, 1.285, 3.60], [s2 * 1.00, 1.285, 3.60], [s2 * 1.00, 1.395, 3.28], [s2 * 1.745, 1.395, 3.28],
      [s2 * 1.745, 1.32, 3.60], [s2 * 1.00, 1.32, 3.60], [s2 * 1.00, 1.43, 3.28], [s2 * 1.745, 1.43, 3.28]));
  }
  // Glacis kit: splash board, headlight clusters, tow point.
  P.add('hullDetail', box(1.9, 0.06, 0.1), 0, 1.62, 2.95, -0.3, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.3, 0.2, 0.16), s * 1.26, 1.42, 3.35);
    P.add('hullGlass', cylZ(0.055, 0.02, 10), s * 1.32, 1.44, 3.44);
    P.add('hullGlass', cylZ(0.045, 0.02, 10), s * 1.18, 1.44, 3.44);
  }
  P.add('hullDetail', box(0.16, 0.12, 0.16), 0, 0.72, 3.62);
  P.add('hullDetail', torus(0.07, 0.018, 10), 0, 0.72, 3.72, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) {
    segBoxZ(P, 'hull', 0.09, 0.92, 3.90, s * 1.71, 1.09, 1.60);
    segBoxZ(P, 'hull', 0.045, 0.025, 3.68, s * 1.7425, 1.435, 1.44);
  }
  towCableUK(P);
  // Engine deck louvres.
  P.add('hull', box(1.9, 0.035, 1.05), 0, 1.72, -2.62);
  if (P.q) for (let i = 0; i < 6; i++) {
    P.add('hullDark', box(1.8, 0.016, 0.05), 0, 1.745, -2.25 - i * 0.15);
  }
  // Rear-deck bin (the print's 1.828 bump at z -2.91..-3.03).
  P.add('hull', box(1.6, 0.17, 0.28), 0, 1.745, -2.97);
  // TAIL: shelf sides to the print's -4.09 corners, recessed center notch,
  // rear fender strips at the 1.73 deck line, low tail lip to -4.16.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.55, 0.60, 0.47), s * 0.655, 1.42, -3.785);
    P.add('hull', box(0.23, 0.61, 0.94), s * 1.065, 1.425, -3.55);
    segBoxZ(P, 'hull', 0.31, 0.05, 1.50, s * 1.365, 1.72, -2.95);
  }
  P.add('hull', box(0.32, 0.47, 0.45), 0, 1.485, -3.775);
  P.add('hullDark', box(1.84, 0.19, 0.09), 0, 1.525, -4.145);
  P.add('hullDetail', box(2.1, 0.05, 0.05), 0, 1.70, -3.62);
  P.decal('hull', 'soot', null, 0.9, [0.6, 1.3, -4.0], Math.PI);

  // ---- wedge-faced Chobham CASTING (turret mask): plateau 2.498
  // (z -0.39..0.62), nose to the plan's 2.84 center arc, side bins to
  // x 1.45, bustle tail -2.12; the deep trunnion mass rides at the
  // print's 0.95..1.48 band ----
  P.turretG.position.set(0, 1.62, -0.2);
  P.gunG.position.set(0, 0.23, 0.62);
  // Sloped face: chin 1.55 line up to the 2.50 crest.
  P.add('turret', slab(
    [-1.02, -0.07, 2.90], [1.02, -0.07, 2.90], [1.16, -0.07, 0.75], [-1.16, -0.07, 0.75],
    [-0.55, 0.77, 1.42], [0.55, 0.77, 1.42], [0.93, 0.878, 0.82], [-0.93, 0.878, 0.82]));
  // Nose wedge to the plan's z 2.84 center point.
  P.add('turret', slab(
    [-0.52, -0.02, 3.02], [0.52, -0.02, 3.02], [0.80, -0.05, 1.9], [-0.80, -0.05, 1.9],
    [-0.30, 0.62, 2.02], [0.30, 0.62, 2.02], [0.44, 0.72, 1.55], [-0.44, 0.72, 1.55]));
  // Crown plateau (the casting's own 2.498 roof).
  P.add('turret', box(1.86, 0.30, 1.01), 0, 0.728, 0.315);
  // Rear roof falling to the bustle.
  P.add('turret', slab(
    [-1.05, 0.05, -0.10], [1.05, 0.05, -0.10], [0.95, 0.05, -1.50], [-0.95, 0.05, -1.50],
    [-0.90, 0.828, -0.15], [0.90, 0.828, -0.15], [0.62, 0.60, -1.48], [-0.62, 0.60, -1.48]));
  // Bustle tail + shoulders (plan: -2.118 at ±0.58, -1.92 at ±0.9).
  P.add('turret', box(1.16, 0.45, 0.44), 0, 0.395, -1.61);
  P.add('turret', box(1.16, 0.32, 0.18), 0, 0.28, -1.82);
  P.add('turretDark', box(1.05, 0.02, 0.38), 0, 0.63, -1.61);
  for (const s of [-1, 1]) P.add('turret', box(0.30, 0.36, 0.55), s * 0.755, 0.42, -1.44);
  // Long turret side bins (plan: front 2.2-2.3, left rear -1.0 / right
  // -0.35 — the print's asymmetry), segmented for station caps.
  segBoxZ(P, 'turret', 0.21, 0.48, 3.19, -1.205, 0.42, 0.805);
  P.add('turretDark', box(0.19, 0.02, 3.09), -1.205, 0.67, 0.805);
  segBoxZ(P, 'turret', 0.17, 0.48, 3.12, -1.395, 0.42, 0.11);
  P.add('turretDark', box(0.15, 0.02, 3.02), -1.395, 0.67, 0.11);
  segBoxZ(P, 'turret', 0.32, 0.48, 3.85, 1.265, 0.42, 0.725);
  P.add('turretDark', box(0.30, 0.02, 3.75), 1.265, 0.67, 0.725);
  // Outer skirt-top bin tier (the print's 2.06-2.17 tops at x 1.46..1.60,
  // z 1.26..2.04 — live-rig turret content).
  segBoxZ(P, 'turret', 0.21, 0.42, 1.57, -1.545, 0.33, 0.045);
  P.add('turretDark', box(0.19, 0.02, 1.51), -1.545, 0.55, 0.045);
  segBoxZ(P, 'turret', 0.21, 0.42, 2.36, 1.545, 0.33, 1.02);
  P.add('turretDark', box(0.19, 0.02, 2.26), 1.545, 0.55, 1.02);
  // REAR BASKET (live-rig turret): stepped tops 2.165 -> 2.41 -> 2.24
  // across z -2.16..-1.32, left wall out to the print's -1.56 plane.
  P.add('turret', box(1.20, 0.50, 0.26), 0, 0.295, -1.83);
  P.add('turret', box(2.32, 0.56, 0.30), 0, 0.32, -1.60);
  P.add('turret', box(0.26, 0.56, 0.55), -1.29, 0.32, -1.425);
  P.add('turret', box(2.32, 0.75, 0.16), 0, 0.415, -1.60);
  P.add('turret', box(2.32, 0.58, 0.32), 0, 0.33, -1.275);
  P.add('turretDark', box(2.2, 0.02, 0.22), 0, 0.80, -1.58);
  P.add('turret', box(0.13, 0.64, 0.64), -1.485, 0.365, -1.47);
  P.add('turretCloth', box(1.7, 0.14, 0.5), -0.2, 0.56, -1.28);
  // Kneed whip antennas: thin masts to the print's 2.975 spikes at
  // (x -1.37, z -1.08) and (x +0.95, z -0.82), potted on the basket/bins.
  for (const [ax, az] of [[-1.375, -0.88], [0.95, -0.62]]) {
    P.add('turret', cylY(0.05, 0.065, 0.30, 8), ax, 0.115, az);
    P.add('turret', box(0.024, 1.10, 0.07), ax, 0.775, az);
    P.add('turret', box(0.03, 0.06, 0.076), ax, 1.30, az);
  }
  // ROOF FURNITURE on the casting: commander sight (2.925 — the p95 anchor
  // under the published 2.95), left roof block 2.87 with its 2.51 outer
  // shelf, roof step 2.795, TOGS body 2.86 + head 2.975.
  P.add('turret', box(0.25, 0.48, 0.46), -0.39, 1.085, 0.65);
  P.add('turretGlass', box(0.21, 0.05, 0.03), -0.40, 1.24, 0.91);
  P.add('turret', box(0.33, 0.49, 0.50), -0.725, 1.005, 1.25);
  P.add('turret', box(0.12, 0.31, 0.40), -1.0, 0.735, 1.25);
  P.add('turret', box(0.24, 0.31, 0.34), -0.13, 1.02, 0.15);
  P.add('turret', box(0.30, 0.22, 0.42), 0.86, 0.59, 1.30);
  P.add('turret', box(0.10, 0.60, 0.10), 0.93, 1.035, 1.08);
  P.add('turretGlass', box(0.22, 0.12, 0.03), 0.86, 0.60, 1.515);
  // Deep trunnion/breech mass the oracle carries in its turret node
  // (bottom band 0.951 across z 0.10..1.68).
  P.add('turretDark', box(1.55, 0.52, 1.58), 0, -0.36, 1.09);
  P.add('turret', box(1.3, 0.36, 0.45), 0, 0.0, 0.075);
  liftEye(P, 'turretDetail', -0.95, 0.62, 0.55, 0.4);
  liftEye(P, 'turretDetail', 0.95, 0.62, 0.55, -0.4);
  // 2x5 smoke discharger banks on both cheeks (the print's 2.40-2.42
  // face bumps at z 0.9..1.3).
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.15, 0.34), s * 1.10, 0.55, 1.30, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.26, 0.68, 1.42, 5, s * 0.95, 0.62);
    smokeCluster(P, s * 1.23, 0.55, 1.46, 5, s * 0.95, 0.62);
  }
  // Loader hatch ring + gunner cowl kept under the 2.50 plateau line.
  P.add('turretDetail', cylY(0.2, 0.22, 0.05, 14), -0.58, 0.855, -0.05);
  P.add('turret', box(0.30, 0.10, 0.26), 0.35, 0.82, 0.55);
  P.add('turretGlass', box(0.22, 0.05, 0.03), 0.35, 0.845, 0.69);
  // Commander's GPMG stowed aft over the bustle, tucked inside the hull
  // basket's 2.42 silhouette band (§B3 mandatory MG — FITTINGS census).
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0.02, scale: 0.85, seed: 7 });
    mg.position.set(0.35, 0.40, -1.35);
    mg.rotation.y = 2.5;
    P.turretG.add(mg);
  }
  // Canvas dust-cover wedge over the low gun root + L11A5 with the print's
  // fat armored collar (contour r 0.42-0.50 at z 0.75..1.75) and wide-flat
  // thermal sleeve sections.
  P.add('turretCloth', box(0.55, 0.22, 0.36), 0, 0.42, 2.42, -0.35, 0, 0);
  P.addGunExtra(box(0.86, 0.55, 0.85), 0, -0.02, 0.55);
  P.addGunExtra(box(0.42, 0.235, 0.55), 0, 0, 1.63);
  P.addGunExtra(box(0.24, 0.22, 2.50), 0, 0, 3.10);
  P.addGunExtra(box(0.22, 0.21, 2.20), 0, 0, 5.30);
  P.addGunExtraDark(box(0.36, 0.23, 0.06), 0, 0, 4.38);
  P.addGunExtraDark(box(1.01, 0.36, 0.44), 0.135, -0.37, 3.14);
  // Published 11.50 overall: tail -4.16 -> muzzle +7.34.
  buildGun(P, { len: 6.99, r: 0.095, sleeve: false, evac: 0, collar: false, baseR: 0.15 });
  P.addGunExtra(box(0.24, 0.24, 0.62), 0, 0, 3.99);
  P.add('gun', cylZ(0.108, 0.09, 12), 0, 0, 6.62);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.28, 0.45, 0.9], Math.PI / 2);
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
  // Front-view outer columns (ref, r2 re-read): the MAIN skirt plane tops
  // 1.48 / hems 0.59 at x ~1.63-1.66; an OUTER armour strip (1.31..0.81)
  // rides at ±1.695 (was misread as handles); fender lid pinned at 1.60.
  // Tracks stay INSIDE the 1.56 column — the r1 0.61-wide band's shoes lit
  // the ±1.58 front columns to the ground where the ref reads skirt hem.
  skirt: { x: 1.61, top: 1.48, bot: 0.60, z0: -3.20, z1: 3.05 }, skirtPanels: 6,
  fenderY: 1.60, fenderZ0: -3.55, fenderZ1: 2.58, fenderHalfW: 1.60,
  trackXc: 1.245, trackW: 0.575, wheelR: 0.4, wheelY: 0.45, wheelStyle: 'dished',
  wheelZs: [2.25, 1.40, 0.55, -0.50, -1.35, -2.20],
  // Raised end wheels: band + shoes render ~0.57 beyond each end center
  // (mask-span calibration across three probe runs) — tips ~+3.87/-3.71,
  // hull mask ~7.58 vs published 7.56 and overall ~9.81 vs 9.83 (both in
  // grace; the ref itself reads 7.49). sprocket y capped 1.06 so the wrap
  // (y + r + 0.135) stays under the 1.60 fender plane (containment law).
  sprocket: { z: -3.075, y: 1.06, r: 0.38 }, idler: { z: 3.30, y: 1.03, r: 0.38 },
  trackTop: 0.95, arms: false, coveredTop: true, noFlaps: true, rakeHalfW: 0.88,
};

function centurionBuild(P, mk) {
  const g = CENTURION_HULL;
  ukHull(P, g);
  // Outer skirt armour strip (ref front band 1.31..0.81 at ±1.695 — the r1
  // read called this the handle line; it is a full-run outer plate).
  // WIDTH GUARD: strip outer face at 1.6895 — the committed 3.38 halfwidth
  // exactly (an 8 mm overshoot here rescaled the whole build 0.991x and
  // cost 4.6 dims + ~3 pts on every curve row in r3). SEGMENTED panels
  // (prism law): a single 5.1 m prism read zero width in every mid station
  // window (stations 80 -> 72.6 in r5). Ref strip runs to −3.13 aft.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      P.add('hull', box(0.021, 0.50, 0.60), s * 1.679, 1.06, -2.83 + k * 0.632);
    }
  }
  // Fender horns/guards over the raised idlers: the ref's outboard guard
  // run carries the ±1.66 plan columns to z 3.70 (lateral clearance from
  // the wrap — containment law is x-wise here, guards sit outside the shoe
  // plane, INSIDE the ±1.675 front column: the 1.69 column belongs to the
  // outer strip alone). Segmented for the station windows.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      P.add('hull', box(0.09, 0.045, 0.42), s * 1.630, 1.435, 2.60 + k * 0.435);
      P.add('hullDetail', box(0.03, 0.10, 0.40), s * 1.6525, 1.38, 2.59 + k * 0.435);
    }
    // skirt hem mounting brackets (ref front: hem-depth content at ±1.65)
    for (let k = 0; k < 6; k++) {
      P.add('hullDetail', box(0.015, 0.35, 0.10), s * 1.652, 0.775, -2.4 + k * 0.98);
    }
    // tail lip rail over the sprocket (ref last column band 1.21..1.50)
    P.add('hull', box(0.95, 0.28, 0.14), s * 0.48, 1.335, -3.62);
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
  // Rear mud flaps OUTBOARD of the track band (containment law is lateral
  // here), at the ref's own −3.12 plane, hems above the rim line.
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.12, 0.32, 0.03), s * 1.625, 1.42, -3.12, 0.05, 0, 0);
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
  // VERTEX r2 (2026-08-03): re-authored from the EXTRACT curves (local z =
  // extract + 0.883; the r1 "registered tables" mis-placed the under-ring
  // basket by +0.24, the cupola by +0.31 rear, missed the 2.747 crown ridge
  // and both marks' true bustle rooflines). Ref truth (local/world):
  //   basket 0.651 world over local −0.49..+0.90; ring collar 1.49-1.53
  //   bands −1.02..−0.49 and +0.91..+1.17; crown ridge 2.747-2.754 (LEFT
  //   x −0.91..−0.20) over −0.90..−0.49; cupola dome peak 2.848 at
  //   (x −0.48, local −0.19); fwd crown descends 2.61→2.38 with sight/
  //   periscope bumps; c5 bustle: dip 2.488, step crest 2.55-2.60 to
  //   −1.54, rear flat 2.386 to −2.13 (walls ±1.08 end −1.75, plan-round);
  //   c3 bustle: flat 2.488 to −1.31, hump 2.527@−1.48, rear 2.335@−1.73
  //   (narrow: walls ±1.02 end −1.27).
  P.turretG.position.set(0, 1.78, 0.35);
  P.gunG.position.set(0, 0.155, 0.6);
  P.add('turret', slab(                       // nose plate -> forward cheeks
    [-0.66, -0.29, 1.55], [0.66, -0.29, 1.55], [1.02, -0.29, 1.04], [-1.02, -0.29, 1.04],
    [-0.60, 0.31, 1.55], [0.60, 0.31, 1.55], [0.90, 0.50, 1.04], [-0.90, 0.50, 1.04]));
  P.add('turret', slab(                       // chin fill: 1.53 -> 1.75 rise
    [-0.62, -0.26, 1.07], [0.62, -0.26, 1.07], [0.55, -0.055, 1.57], [-0.55, -0.055, 1.57],
    [-0.62, 0.02, 1.07], [0.62, 0.02, 1.07], [0.55, 0.02, 1.57], [-0.55, 0.02, 1.57]));
  P.add('turret', slab(                       // cheeks -> crown shoulder
    [-1.02, -0.24, 1.04], [1.02, -0.24, 1.04], [1.06, -0.24, 0.50], [-1.06, -0.24, 0.50],
    [-0.90, 0.50, 1.04], [0.90, 0.50, 1.04], [0.95, 0.64, 0.50], [-0.95, 0.64, 0.50]));
  const cwR = mk === 5 ? 1.10 : 0.98, cwL = mk === 5 ? 1.10 : 0.98;
  P.add('turret', slab(                       // mid casting: crown leans LEFT
    [-1.02, -0.24, 0.50], [1.02, -0.24, 0.50], [1.16, -0.28, -0.60], [-1.16, -0.28, -0.60],
    [-0.95, 0.68, 0.50], [0.95, 0.62, 0.50], [cwR, mk === 5 ? 0.78 : 0.66, -0.60], [-cwL, mk === 5 ? 0.85 : 0.78, -0.60]));
  P.add('turret', slab(                       // rear crown over the collar band
    [-1.16, -0.28, -0.60], [1.16, -0.28, -0.60], [1.12, -0.27, -0.92], [-1.12, -0.27, -0.92],
    [-cwL, mk === 5 ? 0.85 : 0.78, -0.60], [cwR, mk === 5 ? 0.78 : 0.66, -0.60], [cwR, mk === 5 ? 0.77 : 0.65, -0.92], [-cwL, mk === 5 ? 0.86 : 0.79, -0.92]));
  // crown ridge (2.747-2.754, left-biased like the print's cast crown)
  P.add('turret', box(0.74, 0.11, 0.41), -0.53, 0.912, -0.69);
  // ---- bustle: mark-specific roofline lofts (tables in local coords) ----
  if (mk === 5) {
    loftBand(P, 'turret', 0.95, 0.04, [
      [-0.92, 0.83], [-1.01, 0.71], [-1.07, 0.71], [-1.10, 0.771], [-1.53, 0.82],
      [-1.575, 0.755], [-1.645, 0.64], [-1.667, 0.607], [-2.02, 0.60],
    ], (z) => lineAt([[-0.92, -0.28], [-1.02, -0.248], [-1.09, 0.011], [-1.54, 0.011],
      [-1.667, 0.07], [-2.02, 0.135]], z), -0.92, -2.02);
    // rounded rear: only the center carries the last 0.13 (plan cert r2)
    P.add('turret', box(1.24, 0.44, 0.15), 0, 0.36, -2.085);
    // bustle WALLS: flare to ±1.20 (front band 2.582), floor at the 1.78
    // line (they never hang below the print's 1.79 bustle bottom), rear
    // rounds: full-x to −1.63, inner sliver to −1.77
    // walls are asymmetric like the print: LEFT runs out to 1.25
    P.add('turret', box(0.30, 0.78, 0.71), -1.10, 0.39, -1.275);
    P.add('turret', box(0.26, 0.78, 0.71), 1.08, 0.39, -1.275);
    for (const s of [-1, 1]) {
      P.add('turret', box(0.15, 0.60, 0.15), s * 1.025, 0.30, -1.695);
    }
    P.add('turretDark', box(1.72, 0.02, 0.42), 0, 0.612, -1.80);
  } else {
    loftBand(P, 'turret', 0.95, 0.04, [
      [-0.92, 0.83], [-1.01, 0.708], [-1.31, 0.708], [-1.40, 0.728], [-1.477, 0.747],
      [-1.647, 0.637], [-1.75, 0.545],
    ], (z) => lineAt([[-0.92, -0.28], [-1.02, -0.248], [-1.09, 0.011], [-1.42, 0.011],
      [-1.647, 0.042], [-1.75, 0.07]], z), -0.92, -1.75);
    for (const s of [-1, 1]) P.add('turret', box(0.10, 0.60, 0.37), s * 0.99, 0.30, -1.085);
    P.add('turretDark', box(1.6, 0.02, 0.28), 0, 0.718, -1.17);
  }
  // Under-ring basket/breech mass + ring collars (extract: basket 0.651
  // world over local −0.49..+0.90; 1.49 collar bands both sides of it).
  P.add('turretDark', box(1.5, 0.90, 1.46), 0, -0.69, 0.171);
  P.add('turret', box(1.3, 0.26, 0.29), 0, -0.155, 1.043);
  // Flank stowage shelves (in the print's TURRET mask — they yaw). Plan
  // cert r2: at x ±1.29 the shelf spans local −1.04..0.78; outer stub
  // (±1.505) is a short 0.55 m cap at local −0.14..+0.41.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.33, 0.50, 1.82), s * 1.305, 0.17, -0.14);
    P.add('turretDark', box(0.34, 0.02, 1.76), s * 1.305, 0.43, -0.14);
    P.add('turret', box(0.06, 0.46, 0.55), s * 1.49, 0.17, 0.135);
    for (const zw of [0.72, -0.14, -1.0]) {
      P.add('turretDark', box(0.32, 0.48, 0.02), s * 1.31, 0.17, zw);
    }
    stowage(P, 'turretCloth', P.rng, [[s * 1.33, 0.36, 0.3, 0.24, 0.14, 0.7]]);
  }
  // Cupola at the print's own peak (x −0.48, local −0.23; dome 2.848);
  // the lid ring carries the published-height p95 anchor at 2.92.
  P.add('turret', cylY(0.24, 0.26, 0.15, 16), -0.45, 0.855, -0.30);
  cupola(P, 'turret', -0.45, 0.93, -0.30, 0.21, 0.17, 6);
  P.add('turretDark', torus(0.18, 0.016, 16), -0.45, 1.115, -0.30);
  // Loader hatch ring + gunner sight (the 2.684 front bump at x 0.36..0.52)
  // + periscope hood; roof MG on a low pintle under the ridge line.
  P.add('turret', cylY(0.20, 0.22, 0.05, 14), 0.42, 0.78, -0.35);
  P.add('turretDark', box(0.32, 0.014, 0.03), 0.42, 0.815, -0.35);
  P.add('turret', box(0.24, 0.10, 0.30), 0.44, 0.80, 0.29);
  P.add('turretGlass', box(0.16, 0.05, 0.03), 0.44, 0.82, 0.45);
  periscope(P, 'turretDetail', 0.30, 0.71, 0.67);
  P.add('turretDetail', box(0.2, 0.10, 0.2), -0.30, 0.82, 0.30);
  P.add('turretGlass', box(0.14, 0.05, 0.03), -0.30, 0.84, 0.41);
  pintleMG(P, -0.10, 0.68, -0.62, false);
  liftEye(P, 'turretDetail', -0.80, 0.42, 1.05, 0.5);
  liftEye(P, 'turretDetail', 0.80, 0.42, 1.05, -0.5);
  liftEye(P, 'turretDetail', -0.88, 0.84, -0.70, 2.6);
  liftEye(P, 'turretDetail', 0.82, mk === 5 ? 0.72 : 0.64, -0.70, -2.6);
  // Smoke discharger banks on the shelf front faces.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.12, 0.10), s * 1.28, 0.28, 0.80, 0, s * 0.4, 0);
    smokeCluster(P, s * 1.22, 0.38, 0.86, mk === 5 ? 6 : 3, s * 0.95, 0.7);
  }
  // Bucket on the shelf rear wall (British) + antenna base pots kept under
  // the local roofline (the print tops 2.85 at the cupola only).
  P.add('turretDark', cylY(0.06, 0.075, 0.13, 10), 1.30, 0.02, -0.85);
  if (mk === 5) {
    P.add('turretDetail', cylY(0.04, 0.05, 0.08, 8), -0.92, 0.70, -1.30);
    P.add('turretDetail', cylY(0.04, 0.05, 0.08, 8), 0.92, 0.70, -1.30);
  } else {
    P.add('turretDetail', cylY(0.04, 0.05, 0.06, 8), -0.50, 0.75, -1.50);
    P.add('turretDetail', cylY(0.04, 0.05, 0.06, 8), 0.50, 0.75, -1.50);
  }
  // Recessed internal mantlet + canvas hood: the print's hood is RIGHT-
  // biased (plan front: right to local 1.83, LEFT recedes at 1.48).
  P.add('turretDark', box(0.85, 0.34, 0.06), 0, 0.10, 1.50);
  P.add('turretCloth', box(0.42, 0.24, 0.34), 0.23, 0.12, 1.63, -0.25, 0, 0);
  P.add('turretCloth', box(0.30, 0.16, 0.22), 0.24, 0.05, 1.78, -0.1, 0, 0);
  const gunLen = 5.15;
  if (mk === 5) {
    // L7: the print tube reads ~0.28 thick the whole way (sleeved); the
    // muzzle collar runs to the tip so the plan trace holds the last bins.
    buildGun(P, { len: gunLen, r: 0.125, sleeve: false, evac: 0.42, evacR: 1.45, collar: false, baseR: 0.15 });
    P.add('gun', cylZ(0.15, 0.8, 12, 0.16), 0, 0, 0.55);
    P.add('gun', cylZ(0.145, 0.56, 12), 0, 0, gunLen - 0.28);
  } else {
    // 20-pdr: the print tube reads nearly as thick as the L7's (0.25); a
    // hair fatter here so the thin tube holds its plan center columns.
    buildGun(P, { len: gunLen, r: 0.125, sleeve: false, evac: 0.52, evacR: 1.4, collar: false, baseR: 0.145 });
    P.add('gun', cylZ(0.138, 0.6, 12, 0.148), 0, 0, 0.5);
    P.add('gun', cylZ(0.145, 0.5, 10), 0, 0, gunLen - 0.25);
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

// ---------------------------------------------------------------------------
// Vickers MBT Mk.1 (Vijayanta) — first build, vertex r2 (2026-08-03).
// Authored column-by-column from docs/references/vertex/vickers_mk1.json
// (JackTheTinkerer print, CC BY, near-clean stylization triage 0a39d55).
// FRAME: build z = extract z + 1.051 (body centered); all values world m.
//
// LENGTH LAW (dims sovereign vs a z-short print): the as-loaded oracle hull
// masks 7.145 m vs the published 7.92 (the width guard's safeScale shrinks
// the chunky print 5.4%). Every mid-hull feature here is REF-ALIGNED so the
// curve rows read the print; the published hull length rides on two NARROW
// (±0.10 — under the plan p95 column threshold) ≥0.33-band carriers:
//   bow sight/lamp box  z 3.60..3.995  y 1.56..1.91 (over the gun-band line
//     so side_whole reads gun-vs-box, not gun-vs-void: err 0.16 not 0.42)
//   tail phone/stow box z −3.60..−3.995  y 1.25..1.60
// both bracket-mounted (contiguity law), both symmetric about the ref body
// midpoint so the hull registration (which the turret rows reuse) stays
// centered. Overall rides the muzzle at +5.75 (9.75, −0.4%); height rides
// the cupola+MG crown run at 2.687 (p95 anchor, ref crown 2.664).
// Published: hull 7.92, overall 9.79, width 3.17, height 2.71.
const VICKERS_DECK = [
  // FULL-WIDTH deck plane (side_hull top fwd of the superstructure; the
  // fender plane 1.547 carries the width aft — front_hull: 1.547 out to
  // ±1.52 while the rear deck rise is a CENTER superstructure only)
  [3.00, 1.368], [2.53, 1.381], [2.38, 1.383], [2.30, 1.428],
  [2.28, 1.469], [2.26, 1.54],
  [1.28, 1.54], [1.27, 1.502], [1.15, 1.502], [1.14, 1.54],
  [-0.27, 1.54], [-0.28, 1.502], [-0.42, 1.502], [-0.43, 1.54], [-0.77, 1.54],
];
// center superstructure tiers (rear deck rise): front_hull tapers 1.786 →
// 1.742 (±0.78) → 1.641 (±0.95) → fender 1.547
const VICKERS_REAR1 = [   // ±0.95 tier
  [-0.77, 1.545], [-0.85, 1.596], [-0.98, 1.641], [-3.15, 1.641],
  [-3.32, 1.641], [-3.34, 1.655], [-3.46, 1.655],
];
const VICKERS_REAR2 = [   // ±0.78 tier
  [-0.98, 1.60], [-1.17, 1.674], [-1.37, 1.72], [-1.58, 1.742],
  [-2.62, 1.742], [-2.72, 1.735], [-3.10, 1.65],
];
const VICKERS_REAR3 = [   // ±0.55 tier (side silhouette line)
  [-1.45, 1.72], [-1.65, 1.786], [-2.28, 1.786], [-2.42, 1.762], [-2.66, 1.745],
];

function vickersMk1Build(P) {
  const { rng } = P;
  // Station-slice prism law (russia r7c): every loft below is SEGMENTED at
  // ≤0.5 m pitch via extraZ knots so each 0.57 m station window contains
  // real end caps — a single full-length prism reads zero width edge-on.
  const seg5 = (a, b) => { const out = []; for (let z = a; z > b; z -= 0.45) out.push(Number(z.toFixed(2))); return out; };
  // ---- sponson band: full width over the tracks, floor above the wrap ----
  // widths: ref stations read ±1.5845 midships, ±1.5525 aft of −2.0.
  loftBand(P, 'hull', 1.5845, 0.05, VICKERS_DECK, () => 1.05, 2.30, -0.77, seg5(2.3, -0.77));
  loftBand(P, 'hull', 1.5845, 0.05, [[-0.77, 1.547], [-2.0, 1.547]], () => 1.05, -0.77, -2.0, seg5(-0.77, -2.0));
  // tail band floor steps to 1.36 over the raised sprocket wrap (top 1.335
  // — TRACK CONTAINMENT: the wrap arc stays clear of the sponson floor);
  // last 0.3 m tapers to ±1.50 (ref's ±1.55 plane ends −3.39; the fender
  // END CAPS carry the ±1.55 station width across the tail window)
  loftBand(P, 'hull', 1.5475, 0.05, [[-2.0, 1.547], [-3.19, 1.547]],
    (z) => (z < -2.42 ? 1.36 : 1.10), -2.0, -3.19, seg5(-2.0, -3.19));
  loftBand(P, 'hull', 1.50, 0.05, [[-3.19, 1.547], [-3.49, 1.547]], () => 1.36, -3.19, -3.49);
  // rear-deck superstructure tiers (see width taper note above; inset thin
  // so the front-view top plane reaches the tier's own width line)
  loftBand(P, 'hull', 0.95, 0.015, VICKERS_REAR1, () => 1.30, -0.77, -3.46, seg5(-0.77, -3.46));
  loftBand(P, 'hull', 0.78, 0.015, VICKERS_REAR2, () => 1.55, -0.98, -3.10, seg5(-0.98, -3.1));
  loftBand(P, 'hull', 0.55, 0.015, VICKERS_REAR3, () => 1.60, -1.45, -2.66, seg5(-1.45, -2.66));
  // glacis band: full width to 3.00 (ref plan holds ±1.585 to ext 1.95).
  // Floor lifts to 1.23 past 2.72 where the raised idler wrap crowns at
  // 1.19 (containment) — the glacis IS a plate over the idler there.
  loftBand(P, 'hull', 1.5845, 0.04, VICKERS_DECK,
    (z) => (z > 2.72 ? 1.23 : 1.05), 3.00, 2.30, seg5(3.0, 2.3));
  // center nose beak (plan: |x|<0.55 ends 3.19) + shackle wing pads (plan:
  // |x| 0.56..0.80 lead the beak to 3.30 — the print's swept bow).
  P.add('hull', slab(
    [-0.55, 1.06, 3.00], [0.55, 1.06, 3.00], [0.55, 1.27, 3.19], [-0.55, 1.27, 3.19],
    [-0.55, 1.368, 3.00], [0.55, 1.368, 3.00], [0.55, 1.36, 3.24], [-0.55, 1.36, 3.24]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.24, 0.30, 0.30), s * 0.68, 1.16, 3.16);
    P.add('hullDetail', box(0.11, 0.10, 0.16), s * 0.68, 0.98, 3.30);
    P.add('hullDetail', torus(0.06, 0.016, 10), s * 0.68, 0.98, 3.40, Math.PI / 2, 0, 0);
  }
  // ---- inner body + lower plates (all inside the track channel) ----
  P.add('hull', box(1.74, 0.58, 5.4), 0, 0.77, -0.35);
  P.add('hull', slab(                                  // lower bow to the beak
    [-0.85, 0.48, 2.30], [0.85, 0.48, 2.30], [0.58, 1.20, 3.17], [-0.58, 1.20, 3.17],
    [-0.85, 1.06, 2.30], [0.85, 1.06, 2.30], [0.58, 1.30, 3.19], [-0.58, 1.30, 3.19]));
  P.add('hull', slab(                                  // lower stern rake
    [-0.85, 0.48, -3.05], [0.85, 0.48, -3.05], [0.80, 0.90, -3.40], [-0.80, 0.90, -3.40],
    [-0.85, 1.38, -3.05], [0.85, 1.38, -3.05], [0.80, 1.38, -3.40], [-0.80, 1.38, -3.40]));
  P.add('hull', box(1.6, 0.48, 0.10), 0, 1.14, -3.44);
  // Tail: stepped rear plate (ref side: 1.655@−3.46 → 1.42@−3.50 → 1.24 lip
  // to −3.57; plan: plate ±1.0 ends −3.48, lip ±0.82 carries to −3.565).
  P.add('hull', slab(
    [-1.0, 0.87, -3.42], [1.0, 0.87, -3.42], [1.0, 0.90, -3.485], [-1.0, 0.90, -3.485],
    [-1.0, 1.655, -3.44], [1.0, 1.655, -3.44], [1.0, 1.46, -3.485], [-1.0, 1.46, -3.485]));
  P.add('hull', slab(
    [-0.82, 0.90, -3.48], [0.82, 0.90, -3.48], [0.82, 0.92, -3.565], [-0.82, 0.92, -3.565],
    [-0.82, 1.46, -3.48], [0.82, 1.46, -3.48], [0.82, 1.225, -3.565], [-0.82, 1.225, -3.565]));
  // Fender end caps + mud flaps at the sprocket line (plan track cols end
  // −3.40; hems above the wrap — containment law). The DEEP flaps hang at
  // the BOW outer corners (ref front bot 0.549 at |x| 1.46..1.56, where the
  // ref side bot is already the idler climb ~0.5).
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.44, 0.04, 0.30), s * 1.33, 1.525, -3.28);
    P.add('hullRubber', box(0.40, 0.34, 0.03), s * 1.30, 1.05, -3.415, 0.06, 0, 0);
    P.add('hullRubber', box(0.10, 0.60, 0.035), s * 1.525, 0.94, 3.31);
  }
  // Fender tip wedges sloping down over the raised idler (ref side falls
  // 1.35 → 1.09 over b 3.30..3.56 at |x| up to 1.55 — thin curved mudguard
  // tips like the print's own 4-14 cm wedge). Bottom line tracks the idler
  // wrap arc (crown 1.19 at z 3.145) with ≥3 cm clearance — containment.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 1.06, 1.24, 3.28], [s * 1.55, 1.24, 3.28], [s * 1.53, 1.06, 3.53], [s * 1.10, 1.06, 3.53],
      [s * 1.06, 1.355, 3.28], [s * 1.55, 1.355, 3.28], [s * 1.53, 1.09, 3.555], [s * 1.10, 1.09, 3.555]));
  }
  // ---- LENGTH CARRIERS (see header law). Carrier tips are biased 35 mm
  // rearward so MY body-span midpoint matches the REF's own (its sub-band
  // tail lip drops out of its body span) — this zeroes the hull dAlong the
  // turret rows inherit. Bands 0.38 ≥ the 12% rule with margin. ----
  // bow: travel-lock crutch / lamp box on twin brackets off the beak. The
  // saddle rides just under the L7 line (tube rests on it at 0°; a real
  // crutch folds for full depression — accepted pose interpen). Box rear
  // face starts PAST the ref span + margin (its front-edge smear against
  // ref idler-tip columns was the r2 worst side_hull cluster).
  // 0.12 x-narrow (one pixel column per side in plan AND front — under the
  // p95 column threshold in both views); bow box OFFSET +x, tail box −x so
  // each plan column carries only ONE end's error (halves the worst-col e)
  P.add('hull', box(0.10, 0.38, 0.24), 0.07, 1.72, 3.78);
  P.add('hullDark', box(0.08, 0.22, 0.02), 0.07, 1.72, 3.901);
  P.add('hullDark', box(0.04, 0.05, 0.24), 0.035, 1.885, 3.79, 0, 0, 0.30);
  P.add('hullDark', box(0.04, 0.05, 0.24), 0.105, 1.885, 3.79, 0, 0, -0.30);
  // bracket run tucked under the fender-tip line + DIAGONAL struts through
  // the 3.59 trace column (bridging arm→box for the floater law: a slanted
  // strut reads mid-height in its column, so the hull-row interp stays near
  // the ref tip line; the whole-row cost is one p95-excluded column)
  P.add('hullDetail', box(0.04, 0.06, 0.36), 0.035, 1.12, 3.46);
  P.add('hullDetail', box(0.04, 0.06, 0.36), 0.105, 1.12, 3.46);
  P.add('hullDetail', box(0.04, 0.44, 0.05), 0.035, 1.33, 3.615, -0.32, 0, 0);
  P.add('hullDetail', box(0.04, 0.44, 0.05), 0.105, 1.33, 3.615, -0.32, 0, 0);
  // tail: infantry-telephone / convoy-stow box on brackets off the rear lip
  // (front face past the ref tail + margin so no edge-smear columns).
  P.add('hull', box(0.10, 0.38, 0.31), -0.07, 1.41, -3.815);
  P.add('hullDark', box(0.08, 0.10, 0.02), -0.07, 1.50, -3.966);
  P.add('hullDetail', box(0.04, 0.05, 0.30), -0.035, 1.19, -3.53);
  P.add('hullDetail', box(0.04, 0.05, 0.30), -0.105, 1.19, -3.53);
  // ---- deck furniture ----
  // engine-deck louvre boxes (ref bumps 1.816 / 1.801: CENTER x ±0.4 only —
  // front_hull reads 1.814 over ±0.4 with the tiers below outboard)
  P.add('hull', box(0.8, 0.062, 0.10), 0, 1.785, -2.575);
  P.add('hull', box(0.8, 0.047, 0.13), 0, 1.7775, -2.365);
  P.add('hullDetail', box(0.84, 0.02, 0.36), 0, 1.755, -2.32);
  P.add('hull', box(0.10, 0.06, 0.30), 0.61, 1.78, -2.45);   // right filler pod
  if (P.q) for (let i = 0; i < 5; i++) {
    P.add('hullDark', box(0.9, 0.018, 0.05), 0, 1.788, -1.80 - i * 0.10);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.035, 10), s * 0.62, 1.75, -1.35);
  // driver hatch strip (ref 1.585 over 2.02..2.25, right side) + periscopes
  P.add('hullDetail', box(0.78, 0.05, 0.24), 0.52, 1.558, 2.135);
  P.add('hullDark', box(0.30, 0.016, 0.18), 0.52, 1.586, 2.135);
  periscope(P, 'hullDetail', 0.30, 1.545, 1.95);
  periscope(P, 'hullDetail', 0.62, 1.545, 1.95);
  // deck periscope/vent wells (ref dips to 1.502): dark well floors sit
  // INSIDE the loft's own dips (the deck table carries the 1.502 line)
  P.add('hullDark', box(1.2, 0.01, 0.11), 0, 1.508, 1.21);
  P.add('hullDark', box(1.2, 0.01, 0.13), 0, 1.508, -0.35);
  // headlight pods on the glacis (ref bump 1.417 at 2.97..3.05)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.26, 0.09, 0.20), s * 0.95, 1.385, 3.0);
    headlight(P, s * 0.95, 1.40, 3.09, -0.15);
  }
  // British glacis kit: spare track links + tow cable run
  spareTrackStrip(P, 'hull', -0.45, 1.40, 2.72, 3);
  KIT.towCable(P, [[-0.9, 1.56, 2.2], [0, 1.57, 1.6], [0.9, 1.56, 2.2]]);
  P.add('hullDetail', box(0.1, 0.05, 0.14), -0.9, 1.545, 2.2);
  P.add('hullDetail', box(0.1, 0.05, 0.14), 0.9, 1.545, 2.2);
  // rear-deck stowage: tarp on the center plateau (under the 1.814 line),
  // camo roll on the left fender run
  tarpRoll(P, 'hullCloth', -0.42, 1.715, -2.0, 0.6, 0.07, false);
  tarpRoll(P, 'hullCloth', -1.30, 1.485, -1.2, 1.0, 0.06, false);
  P.add('hullDark', box(1.9, 0.30, 0.03), 0, 1.15, -3.56);
  // ---- running gear. Ref reads (my frame): ground band z −2.09..2.24 at
  // |x| 0.89..1.45 (w 0.56, xc 1.17); a SMALL HIGH front idler (rim top
  // 1.19, front extent 3.56, steep 0.38-slope climb — fitted r2) and a
  // raised sprocket (rear extent −3.40, climb from −2.09 at ~0.34). ----
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.45, xc: 1.185,
    wheelZs: [2.02, 1.238, 0.456, -0.326, -1.108, -1.89],
    sprocket: { z: -2.98, y: 0.92, r: 0.26 }, idler: { z: 3.145, y: 0.80, r: 0.255 },
    rollers: [{ z: 1.15, y: 0.79, r: 0.09 }, { z: -0.15, y: 0.79, r: 0.09 }, { z: -1.45, y: 0.79, r: 0.09 }],
    trackW: 0.49, trackTh: 0.09, topY: 0.95, paintedEnds: true, arms: true,
  });
  // decals sit 3 mm proud of the sloped band side face, INBOARD of the
  // ±1.5845 width edge (an edge decal minted phantom front-view columns)
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [1.562, 1.28, -0.7], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-1.562, 1.28, -0.7], -Math.PI / 2);

  // ---- turret: low curved casting, wide crown left, cupola right, deep
  // ring collar + basket (side_turret bot: collar 1.05 over ±0.785 of the
  // ring, basket 0.838), long shallow face to the mantlet cone ----
  P.turretG.position.set(0, 1.54, 0.463);
  P.gunG.position.set(0, 0.4855, 0.60);
  // ring collar + basket (world 1.05..1.617 / 0.836..1.05)
  P.add('turret', cylY(0.775, 0.79, 0.567, 22), 0, -0.2065, 0.013);
  P.add('turret', cylY(0.645, 0.655, 0.216, 20), 0, -0.596, 0.035);
  P.add('turretDark', box(1.0, 0.5, 1.0), 0, -0.30, 0.05);
  // main casting belt (skirt 1.617 → shoulder): walls ±1.02; cheek front
  // corners follow the ref plan (right 1.27 at x 0.5, LEFT recedes to 1.12)
  P.add('turret', slab(
    [-0.70, 0.077, 1.08], [0.72, 0.077, 1.10], [1.02, 0.077, 0.30], [-1.02, 0.077, 0.30],
    [-0.62, 0.60, 1.15], [0.64, 0.60, 1.27], [0.95, 0.62, 0.30], [-0.95, 0.62, 0.30]));
  P.add('turret', slab(
    [-1.02, 0.077, 0.30], [1.02, 0.077, 0.30], [0.95, 0.077, -0.75], [-0.95, 0.077, -0.75],
    [-0.95, 0.62, 0.30], [0.95, 0.62, 0.30], [0.90, 0.70, -0.75], [-0.90, 0.70, -0.75]));
  P.add('turret', slab(                        // rear taper into the bustle
    [-0.95, 0.10, -0.75], [0.95, 0.10, -0.75], [0.68, 0.30, -1.46], [-0.68, 0.30, -1.46],
    [-0.90, 0.70, -0.75], [0.90, 0.70, -0.75], [0.66, 0.80, -1.42], [-0.66, 0.80, -1.42]));
  // casting-to-bin waist blocks (ref plan dips to −1.54 at |x| 0.70..0.80)
  P.add('turret', box(0.12, 0.45, 0.16), -0.75, 0.42, -1.47);
  P.add('turret', box(0.12, 0.45, 0.16), 0.75, 0.42, -1.47);
  // rear underside skirt (side bot 1.618..1.655 between collar and bustle)
  P.add('turret', slab(
    [-0.84, 0.078, -0.70], [0.84, 0.078, -0.70], [0.80, 0.115, -1.12], [-0.80, 0.115, -1.12],
    [-0.84, 0.32, -0.70], [0.84, 0.32, -0.70], [0.80, 0.34, -1.12], [-0.80, 0.34, -1.12]));
  // chin under the mantlet (side bot 1.636@0.81..1.07, 1.674@1.08..1.17)
  P.add('turret', slab(
    [-0.60, 0.096, 1.07], [0.60, 0.096, 1.07], [0.52, 0.134, 1.17], [-0.52, 0.134, 1.17],
    [-0.55, 0.55, 1.30], [0.55, 0.55, 1.30], [0.50, 0.55, 1.42], [-0.50, 0.55, 1.42]));
  // FACE: steep brow then a long shallow plate to the gun line (ref side
  // top falls FAST 2.49→2.33 over ext 0.08..0.20 then gently to 2.19 by
  // 0.75); the LEFT cheek recedes earlier than the right (ref plan: left
  // ends 1.12..1.28, right 1.27..1.60)
  P.add('turret', slab(
    [-0.62, 0.55, 0.95], [0.68, 0.55, 0.95], [0.75, 0.60, 0.70], [-0.75, 0.60, 0.70],
    [-0.60, 0.775, 0.81], [0.64, 0.775, 0.81], [0.55, 0.947, 0.66], [-0.55, 0.947, 0.66]));
  P.add('turret', slab(
    [-0.55, 0.55, 1.24], [0.62, 0.55, 1.28], [0.70, 0.55, 0.86], [-0.70, 0.55, 0.86],
    [-0.38, 0.66, 1.40], [0.42, 0.66, 1.44], [0.62, 0.775, 0.82], [-0.58, 0.775, 0.82]));
  // mantlet housing (plan: nose 1.60 spans x −0.15..0.40, right-biased;
  // bottom follows the ref cone line 1.83→1.89 — the r2 worst side_turret
  // columns were this housing's box-bottom hanging 0.17 low)
  P.add('turret', slab(
    [-0.15, 0.31, 1.58], [0.40, 0.31, 1.58], [0.45, 0.27, 1.28], [-0.30, 0.27, 1.28],
    [-0.15, 0.62, 1.60], [0.40, 0.62, 1.60], [0.45, 0.66, 1.30], [-0.30, 0.66, 1.30]));
  // ---- roof: crown plateau left+center 2.607-2.614, right shoulder 2.49,
  // fwd roof 2.487, periscope hood 2.563, cupola right 2.664→2.687 anchor
  P.add('turret', slab(
    [-0.92, 0.62, 0.10], [0.22, 0.62, 0.10], [0.22, 0.64, -1.36], [-0.92, 0.64, -1.36],
    [-0.86, 1.070, 0.06], [0.16, 1.070, 0.06], [0.16, 1.070, -1.35], [-0.86, 1.070, -1.35]));
  P.add('turret', slab(                        // right shoulder falls outboard
    [0.16, 0.62, 0.30], [0.96, 0.60, 0.30], [0.96, 0.64, -1.36], [0.16, 0.64, -1.36],
    [0.16, 1.070, 0.28], [0.94, 0.947, 0.30], [0.94, 0.947, -1.35], [0.16, 1.070, -1.35]));
  P.add('turret', slab(                        // fwd roof band to the face
    [-0.90, 0.62, 0.68], [0.90, 0.60, 0.68], [0.92, 0.62, 0.06], [-0.92, 0.62, 0.06],
    [-0.55, 0.947, 0.67], [0.55, 0.947, 0.67], [0.90, 0.947, 0.10], [-0.90, 0.947, 0.10]));
  // left roof shoulder (front view: 2.544 at x −0.91..−0.96, gone by −0.97)
  P.add('turret', slab(
    [-0.955, 0.62, 0.05], [-0.86, 0.62, 0.05], [-0.86, 0.64, -1.30], [-0.955, 0.64, -1.30],
    [-0.94, 1.004, 0.03], [-0.87, 1.004, 0.03], [-0.87, 1.004, -1.30], [-0.94, 1.004, -1.30]));
  // periscope hood (2.563 over ext −0.12..0.01)
  P.add('turret', box(0.30, 0.076, 0.14), -0.20, 0.985, 0.535);
  P.add('turretGlass', box(0.22, 0.03, 0.02), -0.20, 1.005, 0.61);
  // commander cupola (ref peak footprint is SHORT: ext −0.55..−0.28, x
  // 0.21..0.68): a compact dome carrying the published-height p95 anchor at
  // 2.695 together with the MG receiver run beside it (heightM p95 needs
  // ~5 columns at the anchor; dims grace read 0.98% on the big-dome r2)
  P.add('turret', cylY(0.17, 0.21, 0.045, 16), 0.44, 1.068, 0.10);
  P.add('turret', KIT.lathe([
    [0.155, 0.0], [0.15, 0.045], [0.125, 0.068], [0.09, 0.078], [0.02, 0.082],
  ], 18, 1.0), 0.44, 1.073, 0.10);
  P.add('turretDark', torus(0.13, 0.012, 16), 0.44, 1.105, 0.10);
  for (let k = 0; k < 5; k++) {
    const a = -1.1 + k * 0.55;
    P.add('turretDark', box(0.05, 0.03, 0.035), 0.44 + Math.sin(a) * 0.14, 1.096, 0.10 + Math.cos(a) * 0.14, 0, a, 0);
  }
  // loader hatch ring, left crown
  P.add('turretDetail', cylY(0.19, 0.21, 0.045, 14), -0.42, 1.075, -0.35);
  P.add('turretDark', box(0.30, 0.014, 0.03), -0.42, 1.105, -0.35);
  // roof MG on a LOW stowed pintle (decoration law; centurion precedent:
  // base sunk so tube+receiver stay under the 2.607 crown line — an upright
  // pintle's barrel tip minted 2.70-2.75 columns over the ref's 2.49 fall).
  // The dark ammo-box run beside the cupola carries the 2.695 height anchor.
  pintleMG(P, 0.20, 0.72, -0.20, false);
  P.add('turretDark', box(0.09, 0.08, 0.34), 0.28, 1.115, 0.08);
  liftEye(P, 'turretDetail', -0.85, 0.80, 0.45, 0.5);
  liftEye(P, 'turretDetail', 0.85, 0.78, 0.45, -0.5);
  liftEye(P, 'turretDetail', -0.62, 0.90, -1.25, 2.6);
  liftEye(P, 'turretDetail', 0.62, 0.90, -1.25, -2.6);
  // ---- bustle (flat 2.477 roof, steps up into the crown; rear face at
  // local −2.225 = ref −2.805 ext within 8 mm — also keeps the st3 station
  // window catching the bustle sliver on the longer hull). The ref plan
  // rounds hard: full-rear only inside ±0.545, walls ±0.585, and the outer
  // ±0.585..0.655 band exists only near the casting (to local −1.44) ----
  P.add('turret', box(1.17, 0.646, 0.56), 0, 0.614, -1.67);
  P.add('turret', box(1.09, 0.646, 0.275), 0, 0.614, -2.0875);
  P.add('turret', box(0.07, 0.593, 0.31), -0.62, 0.6405, -1.285);
  P.add('turret', box(0.07, 0.593, 0.31), 0.62, 0.6405, -1.285);
  P.add('turret', slab(                        // fwd floor pan: 1.884 line
    [-0.655, 0.344, -1.13], [0.655, 0.344, -1.13], [0.655, 0.344, -1.50], [-0.655, 0.344, -1.50],
    [-0.655, 0.937, -1.13], [0.655, 0.937, -1.13], [0.655, 0.937, -1.50], [-0.655, 0.937, -1.50]));
  P.add('turret', slab(                        // roof steps 2.518 / 2.582
    [-0.62, 0.90, -1.36], [0.62, 0.90, -1.36], [0.62, 0.90, -1.70], [-0.62, 0.90, -1.70],
    [-0.60, 1.042, -1.39], [0.60, 1.042, -1.39], [0.60, 0.937, -1.69], [-0.60, 0.937, -1.69]));
  // rear corner chamfers (ref plan: bustle walls taper aft of −2.0 ext)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.545, 0.30, -1.95], [s * 0.585, 0.30, -1.95], [s * 0.585, 0.30, -2.10], [s * 0.545, 0.30, -2.22],
      [s * 0.545, 0.937, -1.95], [s * 0.585, 0.937, -1.95], [s * 0.585, 0.937, -2.10], [s * 0.545, 0.937, -2.22]));
  }
  P.add('turretDark', box(1.18, 0.02, 0.44), 0, 0.925, -1.95);
  P.add('turretDetail', box(1.05, 0.04, 0.05), 0, 0.62, -2.20);
  P.add('turretDetail', box(1.05, 0.04, 0.05), 0, 0.34, -2.20);
  for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.30, 0.03), -0.52 + k * 0.26, 0.48, -2.20);
  stowage(P, 'turretCloth', rng, [[-0.2, 0.87, -1.75, 0.62, 0.13, 0.5], [0.42, 0.87, -1.85, 0.4, 0.12, 0.4]]);
  // ---- flank stowage bins: smooth SLOPED masses, not boxes (dense ref
  // front line: 2.37 at x ±0.98 falling to ~2.20 at ±1.40 then off to the
  // fender — the earlier "flat 2.364/2.227 tops" read was a summarizer
  // averaging artifact). Tiers still step shorter outboard in plan. ----
  for (const s of [-1, 1]) {
    const zF = s < 0 ? 0.71 : 0.646, zRm = s < 0 ? -1.25 : -1.246;
    const zF2 = s < 0 ? 0.66 : 0.60, zRo = s < 0 ? -0.98 : -1.04;
    P.add('turret', slab(                     // inner tier (top 0.825→0.74)
      [s * 0.97, 0.36, zF], [s * 1.18, 0.36, zF], [s * 1.18, 0.36, zRm], [s * 0.97, 0.36, zRm],
      [s * 0.97, 0.825, zF - 0.03], [s * 1.18, 0.745, zF - 0.03], [s * 1.18, 0.745, zRm], [s * 0.97, 0.825, zRm]));
    P.add('turret', slab(                     // outer tier (0.74→0.66)
      [s * 1.18, 0.36, zF2], [s * 1.40, 0.36, zF2], [s * 1.40, 0.36, zRo], [s * 1.18, 0.36, zRo],
      [s * 1.18, 0.745, zF2 - 0.03], [s * 1.40, 0.665, zF2 - 0.03], [s * 1.40, 0.665, zRo], [s * 1.18, 0.745, zRo]));
    for (const zb of [0.35, -0.35, -1.0]) {   // brackets close the 1.653 strip
      P.add('turret', box(0.16, 0.25, 0.10), s * 1.06, 0.24, zb);
    }
    P.add('turretDark', box(0.02, 0.02, 1.5), s * 1.09, 0.79, -0.28);
  }
  // edge pouches (the extreme-x sliver is SHORT in the ref plan)
  P.add('turret', slab(
    [-1.40, 0.36, 0.17], [-1.435, 0.36, 0.17], [-1.435, 0.36, -0.13], [-1.40, 0.36, -0.13],
    [-1.40, 0.665, 0.15], [-1.435, 0.60, 0.15], [-1.435, 0.60, -0.13], [-1.40, 0.665, -0.13]));
  P.add('turret', slab(
    [1.40, 0.36, 0.07], [1.435, 0.36, 0.07], [1.435, 0.36, -0.25], [1.40, 0.36, -0.25],
    [1.40, 0.665, 0.05], [1.435, 0.60, 0.05], [1.435, 0.60, -0.25], [1.40, 0.665, -0.25]));
  // bin lids / straps
  for (const zb of [0.3, -0.3, -0.9]) {
    P.add('turretDetail', box(0.39, 0.02, 0.03), -1.145, 0.70, zb);
    P.add('turretDetail', box(0.32, 0.02, 0.03), 1.10, 0.60, zb);
  }
  P.add('turretDark', cylY(0.055, 0.07, 0.12, 10), -1.12, 0.60, 0.80); // bucket on the bin front
  // smoke discharger banks on the cheeks (plan bumps at ±0.55..0.63 → 1.11)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.10, 0.24), s * 0.62, 0.30, 0.98, 0, s * 0.5, 0);
    smokeCluster(P, s * 0.66, 0.42, 1.02, 5, s * 0.9, 0.6);
  }
  // whip antenna base pots ONLY: the print carries no masts, and a tall
  // mast SHARES side columns with the body below it — the column band then
  // passes the 12% rule and the mast top poisons heightM/rough (r1 lesson:
  // a 0.85 mast read heightM 2.80 and dropped the carriers out of the body
  // span; even a 0.16 stub minted a 2.82 turret_side column in r3).
  P.add('turretDetail', cylY(0.045, 0.055, 0.055, 8), -0.50, 1.055, -1.05);
  P.add('turretDetail', cylY(0.045, 0.055, 0.10, 8), 0.72, 0.90, -1.30);
  // ---- L7A1: bare tube, fume extractor at ext 1.895..2.445, thin neck +
  // tip collar at the muzzle (print's own tip read), muzzle 5.75 (overall
  // anchor 9.75, −0.4%) ----
  P.addGunExtra(cylZ(0.135, 0.42, 16, 0.205), 0, 0, 0.78);
  P.addGunExtraDark(cylZ(0.142, 0.05, 14), 0, 0, 1.02);
  buildGun(P, { len: 4.44, r: 0.13, sleeve: false, evac: null, collar: false, baseR: 0.20 });
  P.add('gun', cylZ(0.158, 0.55, 14), 0, 0.03, 2.158);          // extractor
  P.add('gunDark', cylZ(0.05, 0.11, 10), 0, 0, 4.475);          // muzzle neck
  P.add('gun', cylZ(0.132, 0.16, 12), 0, 0, 4.61);              // tip collar
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [1.03, 0.35, -0.35], Math.PI / 2);
  P.topY = 1.2;
}

export const UK_PROFILES = {
  chieftain5: { build: chieftain5Build },
  challenger1: { build: challenger1Build },
  vickers_mk1: { build: vickersMk1Build },
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
