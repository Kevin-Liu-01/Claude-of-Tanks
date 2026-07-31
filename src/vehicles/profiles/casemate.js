// Casemate / turretless procedural profiles (fidelity oracles: recovered
// ISU-152/122S, community Jagdtiger, JPz E100, Sturmtiger, T95, Strv 103).
// Owned by the casemate family agent.
//
// Wave-3 rebuild (2026-07-31, geometry gate v9): every id rebuilt against the
// measured reference polylines in docs/references/profiles/<id>.json plus the
// published dims in specs. Original primitive reconstructions only — the
// polylines are mask-trace DIMENSION data (no source mesh data is copied).
//
// GATE-STRUCTURAL RULES (v9, fixedMount oracles):
//  - The reference GLBs are fixedMount: the loader parents the ENTIRE model
//    under rig_hull (no turret/gun nodes). The gate's hull mask for the
//    reference therefore INCLUDES the fused gun. These builds mirror that
//    topology: gun tube + mount live in HULL buckets and rig_turret stays
//    EMPTY — hull/whole masks match 1:1, station slicing sees the same
//    z-range on both models, and articulation poses cannot detach anything
//    (there is nothing to articulate — exactly like the shipped reference).
//    P.turretG/P.gunG keep their pivot positions so the sim's virtual gun
//    and the rig_muzzle fx anchor stay correct; P.muzzleZ is set per tank.
//  - DIMS ANCHORING: p95 roof plateaus at published heightM; the side
//    12%-band span lands on published hullLengthM (fat gun sleeves stay
//    band-thin past the bow so they don't inflate the measured hull length);
//    muzzle at published overallLengthM; widest mesh EXACTLY ±widthM/2.
//  - WIDTH GUARD: nothing exceeds spec dims.widthM (the lab width-normalizes
//    both models; procScale must stay 1.000).
//  - Oracle-defect caps (quantified in docs/references/tanks/<id>.md): the
//    ISU pair and T95/Strv103 oracles are proportionally off published dims;
//    dims stays sovereign here and the curve ceilings are documented.
import { KIT } from './kit.js';

// NOTE: KIT arrives through the tankFactory module cycle — it must only be
// dereferenced inside functions (module-scope destructuring hits the TDZ).
const box = (...a) => KIT.box(...a);
const stations = (count, span, zc = 0) => Array.from({ length: count }, (_, i) =>
  zc + span / 2 - i * (span / (count - 1)));

// ---------------------------------------------------------------------------
// Silhouette loft: sts is an ordered front->rear list of cross-section
// stations {z, b, t, w, wt?} (bottom y, top y, half-width, optional top
// half-width for leaned sides). Emits one slab per span. This is how each
// casemate tracks its measured reference polyline to gate tolerance.
// ---------------------------------------------------------------------------
function loft(P, sts, bucket = 'hull') {
  const { slab } = KIT;
  for (let i = 0; i < sts.length - 1; i++) {
    const a = sts[i], c = sts[i + 1];
    const awt = a.wt ?? a.w, cwt = c.wt ?? c.w;
    const ax = a.x ?? 0, cx = c.x ?? 0;
    P.add(bucket, slab(
      [ax - a.w, a.b, a.z], [ax + a.w, a.b, a.z], [cx + c.w, c.b, c.z], [cx - c.w, c.b, c.z],
      [ax - awt, a.t, a.z], [ax + awt, a.t, a.z], [cx + cwt, c.t, c.z], [cx - cwt, c.t, c.z]));
  }
}

// ---------------------------------------------------------------------------
// Shared fittings (all hull buckets — see GATE-STRUCTURAL RULES above)
// ---------------------------------------------------------------------------

// Round crew hatch: low drum + lid + dark seam ring.
function hatchDome(P, x, y, z, r = 0.22) {
  const { cylY } = KIT;
  P.add('hull', cylY(r, r * 1.06, 0.055, 14), x, y + 0.028, z);
  P.add('hull', cylY(r * 0.9, r * 0.9, 0.03, 14), x, y + 0.07, z);
  P.add('hullDark', cylY(r * 0.94, r * 0.94, 0.012, 14), x, y + 0.062, z);
  P.add('hullDark', box(0.06, 0.02, r * 1.1), x + r * 0.7, y + 0.075, z);   // hinge
}

// German Bosch blackout light: hooded drum, dark slit, stalk.
function boschLight(P, x, y, z) {
  const { cylY } = KIT;
  P.add('hullDetail', cylY(0.05, 0.06, 0.085, 10), x, y, z);
  P.add('hullDetail', box(0.12, 0.03, 0.095), x, y + 0.05, z);
  P.add('hullDark', box(0.09, 0.016, 0.02), x, y + 0.03, z + 0.048);
  P.add('hullDark', cylY(0.018, 0.018, 0.06, 8), x, y - 0.06, z);
}

// Hull MG ball (Kugelblende): painted collar, dark steel ball + barrel stub.
function mgBall(P, x, y, z, rx = 0, r = 0.13) {
  const { sph, cylZ } = KIT;
  P.add('hull', xform2(cylZ(r * 1.5, 0.07, 14), 0, 0, -0.01, rx), x, y, z);
  P.add('hullDark', sph(r, 12), x, y, z);
  P.add('hullDark', xform2(cylZ(r * 0.36, 0.14, 8), 0, 0, r * 0.8, rx), x, y, z);
  P.add('hullDark', xform2(cylZ(0.022, 0.30, 6), 0, 0, r * 1.5, rx), x, y, z);
}
// Small helper: bake a pitch into a geo before P.add (keeps call sites flat).
function xform2(geo, x, y, z, rx) {
  return KIT.xform(geo, x, y, z, rx, 0, 0);
}

// Bow tow hook / shackle bracket.
function towHook(P, x, y, z) {
  const { cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.13, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.015, z + 0.03);
}

// External fuel drum on brackets (ISU rear sponsons).
function fuelDrum(P, x, y, z, len, r = 0.15) {
  const { cylZ } = KIT;
  P.add('hull', cylZ(r, len, 12), x, y, z);
  for (const e of [-1, 1]) P.add('hullDark', cylZ(r + 0.004, 0.022, 12), x, y, z + e * (len / 2 - 0.013));
  for (const f of [-0.30, 0.30]) {
    P.add('hullDark', box(0.032, r + 0.09, 0.05), x - Math.sign(x) * 0.02, y - r * 0.5, z + f * len);
  }
}

// Whip antenna on a base cone. Height budget: the gate's heightM reads the
// p95 of side-column tops, so a single whip (1-2 mask columns) never defines
// the roof — but it DOES set the curve's rough height, which the reference
// masts also set. Antennas are replicated where the oracle carries them.
function antenna(P, x, y, z, h = 0.85, rake = 0) {
  P.add('hullDetail', KIT.cylY(0.028, 0.045, 0.07, 8), x, y + 0.035, z);
  P.add('hullDetail', KIT.xform(box(0.016, h, 0.016), 0, h / 2 + 0.07, 0, rake, 0, 0.03), x, y, z);
}

// Fixed gun tube in HULL buckets. Sections front->rear from the muzzle.
// axisY/axisZ locate the bore in world; secs = [{z0, z1, r, dark?}] in world z.
function hullGun(P, axisY, secs) {
  const { cylZ } = KIT;
  for (const s of secs) {
    const len = s.z0 - s.z1;
    P.add(s.dark ? 'hullDark' : 'hull', cylZ(s.r, len, P.q ? 18 : 12, s.r2), 0 + (s.x || 0), axisY + (s.dy || 0), s.z1 + len / 2);
  }
}

// Deep steel-wheel run in the soviet-heavy style: painted steel wheels with a
// dark recess drum behind each so hubs/rims read out of the bay shadow.
function steelGear(P, g) {
  const { buildRunningGear, cylX } = KIT;
  const zs = g.wheelZs || stations(g.wheels, g.span, g.zc ?? 0);
  const wheelW = g.wheelW ?? Math.min(0.24, g.trackW * 0.42);
  buildRunningGear(P, {
    style: g.style || 'steel', wheelR: g.wheelR, wheelW, wheelY: g.wheelY, xc: g.xc, wheelZs: zs,
    sprocket: g.sprocket, idler: g.idler, rollers: g.rollers || [],
    trackW: g.trackW, topY: g.topY, botY: g.botY ?? 0.08, arms: g.arms ?? true,
    coveredTop: g.coveredTop ?? false, deadSag: g.deadSag, layers: g.layers,
    trackTh: g.trackTh, bayShadowTop: g.bayShadowTop, dishR: g.dishR,
  });
  if (g.shadows !== false) for (const z of zs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(g.wheelR * 0.72, wheelW * 1.06, 12), s * g.xc, g.wheelY, z);
  }
}

// ---------------------------------------------------------------------------
// Strv 103B — docs/references/tanks/strv103.md
// Published 7.04 x 3.63 x 2.14 (hull/width/height), overall 8.99.
// Oracle work order (docs/references/profiles/strv103.json): gun axis 1.65,
// muzzle +5.34 from body mid; dozer tip +3.86 (build trims to +3.52 for the
// published hull span); deck 1.94 with glacis break at +0.85; oversized
// cupola cluster 2.33-2.38 (build holds 2.18 — heightM is sovereign; cap
// documented); raked antenna mast to 2.80 at z~-1.9; raised rear idler with
// high tail (bottom edge ~1.2 behind z -2.9).
// ---------------------------------------------------------------------------
function buildStrv103(P) {
  const { cylY, cylZ, frustum, liftEye, periscope } = KIT;

  // ---- primary silhouette loft (side top/bot + widths from the work order)
  // lower hull band: belly line ~0.33 between the tracks, sides at deck width
  loft(P, [
    { z: 3.52, b: 1.02, t: 1.16, w: 0.60 },                    // blade-top shelf tip
    { z: 2.61, b: 0.72, t: 1.30, w: 1.50 },                    // nose root
    { z: 1.60, b: 0.33, t: 1.58, w: 1.64 },                    // glacis mid (under gun)
    { z: 1.10, b: 0.33, t: 1.72, w: 1.64 },                    // glacis upper
    { z: 0.75, b: 0.33, t: 1.94, w: 1.64 },                    // glacis break
    { z: -2.10, b: 0.33, t: 1.94, w: 1.64 },                   // deck run
    { z: -2.75, b: 0.80, t: 1.86, w: 1.56 },                   // rear deck fall
    { z: -3.58, b: 1.19, t: 1.62, w: 1.50 },                   // tail (12%-band R)
  ]);
  // dozer blade under the nose. GATE NOTE (packet cap): the oracle's dozer
  // nose line runs to +3.86, but ANY sub-gun geometry past +3.52 lifts the
  // 12%-band span over published hullLengthM (side columns integrate all x),
  // so the blade stops at the published span and the plan view carries the
  // difference as a certified oracle-frame cost.
  P.add('hull', KIT.slab(
    [-1.20, 0.46, 2.62], [1.20, 0.46, 2.62], [1.20, 0.84, 3.50], [-1.20, 0.84, 3.50],
    [-1.20, 0.72, 2.66], [1.20, 0.72, 2.66], [1.20, 1.02, 3.50], [-1.20, 1.02, 3.50]));
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.06, 0.07, 0.85), s * 1.02, 0.62, 2.35, -0.35, 0, 0); // blade arms
  }
  P.add('hullDark', box(1.76, 0.05, 0.06), 0, 0.50, 2.66);                     // cutting edge shadow
  // glacis louvre banks (radiators live ON the glacis): dark wells + ribs
  const glY = (z) => 1.90 - (z - 0.85) * (0.74 / 1.76);                        // glacis surface line
  for (let i = 0; i < 6; i++) {
    const z = 1.10 + i * 0.22;
    P.add('hullDark', box(2.45, 0.02, 0.16), 0, glY(z) + 0.012, z, -0.40, 0, 0);
    P.add('hullDetail', box(2.52, 0.028, 0.05), 0, glY(z) + 0.035, z + 0.06, -0.40, 0, 0);
  }
  P.add('hullDetail', box(2.60, 0.05, 0.05), 0, glY(2.45) + 0.02, 2.45, -0.40, 0, 0); // splash rail

  // ---- fixed 105 mm L74 in the glacis (hull bucket, fixedMount topology).
  // Bore axis 1.65; muzzle at published overall: tail -3.52 -> muzzle +5.47.
  hullGun(P, 1.65, [
    { z0: 5.40, z1: 5.31, r: 0.110 },                                          // muzzle collar
    { z0: 5.31, z1: 3.30, r: 0.085 },                                          // fore tube
    { z0: 3.30, z1: 2.20, r: 0.092 },                                          // mid step
    { z0: 2.20, z1: 1.05, r: 0.098, r2: 0.108 },                               // rear taper into the glacis
  ]);
  P.add('hull', xform2(cylZ(0.10, 0.42, 12, 0.12), 0, 0, 0, -0.40), 0, 1.60, 1.15); // glacis exit sleeve
  // travel clamp yoke on the nose shelf (under-tube, band-thin from the side)
  P.add('hullDetail', box(0.06, 0.28, 0.06), 0, 1.22, 3.05);
  P.add('hullDetail', box(0.22, 0.05, 0.09), 0, 1.38, 3.05);
  // virtual articulation anchors (empty groups; fx muzzle anchor only)
  P.turretG.position.set(0, 1.65, 0.40);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 5.07;

  // ---- deck furniture
  // commander cluster rides LEFT-of-center like the print (broad sight block
  // x -0.92..-0.22 + crown drum straddling x 0): crown held at 2.18.
  // ORACLE DEFECT CAP: the print's cluster reads 2.33-2.38 over ~1 m of roof;
  // published heightM (2.14, p95-sovereign) pins the build at 2.18 max.
  P.add('hull', box(0.70, 0.21, 1.15), 0.57, 2.045, -0.42);                    // broad sight/stowage block
  P.add('hullDark', box(0.60, 0.02, 1.05), 0.57, 2.14, -0.42);
  P.add('hull', cylY(0.15, 0.17, 0.14, 14), 0.06, 2.03, -0.35);                // crown cupola drum
  P.add('hull', cylY(0.135, 0.135, 0.045, 14), 0.06, 2.155, -0.35);
  P.add('hullDark', KIT.torus(0.145, 0.013, 14), 0.06, 2.15, -0.35);
  P.add('hull', KIT.sph(0.15, 14, Math.PI / 2), -0.55, 1.95, 0.05);            // observation dome (left)
  P.add('hullDark', KIT.torus(0.135, 0.012, 12), -0.55, 2.00, 0.05);
  periscope(P, 'hullDetail', 0.25, 1.88, 0.55);
  periscope(P, 'hullDetail', -0.30, 1.88, 0.72);
  // flotation-screen rim strip around the deck edge (103B cue) + fenders
  for (const s of [-1, 1]) {
    P.add('hull', box(0.07, 0.06, 4.2), s * 1.665, 1.955, -0.95);
    P.add('hull', box(0.20, 0.03, 5.64), s * 1.53, 1.665, 0.54);               // fender plate 3.36..-2.28
  }
  P.add('hull', box(3.40, 0.06, 0.07), 0, 1.955, -3.02);
  P.add('hull', box(3.40, 0.06, 0.07), 0, 1.93, 0.88);
  // engine-deck intake ribs behind the glacis break
  for (let i = 0; i < 5; i++) P.add('hullDark', box(2.70, 0.016, 0.09), 0, 1.945, 0.45 - i * 0.24);
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), -1.15, 1.955, -1.35);        // fuel fillers
  P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), 1.15, 1.955, -1.35);
  // rear deck stowage boxes (oracle: proud line 2.04-2.10 behind z -2.1)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.52, 0.18, 0.85), s * 1.28, 1.98, -2.42);
    P.add('hullDark', box(0.53, 0.14, 0.024), s * 1.28, 2.00, -2.42);
  }
  // raked antenna masts (oracle: symmetric pair rising to 2.80 at z ~ -2.0;
  // 5 cm poles so the station slices actually rasterize them)
  for (const s of [-1, 1]) {
    P.add('hullDetail', KIT.cylY(0.035, 0.05, 0.09, 8), s * 0.96, 2.00, -1.86);
    P.add('hull', KIT.xform(box(0.05, 0.86, 0.05), 0, 0.47, 0, -0.28, 0, 0), s * 0.96, 1.96, -1.86);
  }
  // fixed MG box on the left front fender (KsP 58 pair)
  P.add('hull', box(0.24, 0.15, 0.60), -1.50, 1.50, 1.95);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.56, 1.53, 2.30);
  P.add('hullDark', cylZ(0.020, 0.24, 6), -1.46, 1.53, 2.30);
  KIT.headlight(P, -1.28, 1.22, 2.65, -0.35);
  KIT.headlight(P, 1.28, 1.22, 2.65, -0.35);
  liftEye(P, 'hullDetail', -1.55, 1.92, 0.70, 0.4); liftEye(P, 'hullDetail', 1.55, 1.92, 0.70, -0.4);
  towHook(P, -0.85, 0.80, 2.55); towHook(P, 0.85, 0.80, 2.55);
  // tail: rear plate rail + thin-band exhaust pipes filling the oracle's
  // overhung tail line (band < 12% so hullLengthM stays published)
  P.add('hullDark', box(3.0, 0.08, 0.05), 0, 1.30, -3.54);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.55, 0.10, 0.30), s * 0.85, 1.48, -3.44);
    P.add('hullDark', cylZ(0.055, 0.26, 8), s * 0.55, 1.40, -3.55);
  }

  // ---- running gear: 4 road wheels, front drive, RAISED rear idler.
  // Track contact z +1.6..-1.75; skirt band over the top run.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 1.17, 3.45), s * 1.79, 1.085, -0.06);              // deep skirt band 0.50..1.67
    P.add('hullDark', box(0.02, 1.10, 3.40), s * 1.808, 1.06, -0.06);
    for (let k = 0; k < 6; k++) P.add('hullDetail', KIT.cylZ(0.02, 0.016, 8), s * 1.812, 1.30, -1.5 + k * 0.60, 0, s * Math.PI / 2, 0);
    P.add('hullDark', box(0.02, 0.70, 4.4), s * 1.02, 0.55, -0.1);             // bay shadow wall
  }
  steelGear(P, {
    style: 'rubber', dishR: 0.84, wheelR: 0.33, wheelW: 0.20, wheelY: 0.36, xc: 1.30,
    wheelZs: [1.45, 0.62, -0.21, -1.04], trackW: 0.66,
    sprocket: { z: 2.05, y: 0.42, r: 0.31 }, idler: { z: -2.16, y: 0.66, r: 0.33 },
    topY: 0.95, botY: 0.06, arms: true, coveredTop: true, deadSag: 0.035, shadows: false,
  });
  // tail underside wedge from the raised idler to the high stern
  P.add('hull', frustum(1.18, -2.62, -3.50, 1.20, -2.60, -3.52, 1.20, 1.30));

  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [1.755, 1.55, -1.4], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '103', 0.30, [-1.755, 1.55, -1.4], -Math.PI / 2, 0, 0);
  P.topY = 1.35;
}

// ---------------------------------------------------------------------------
// Jagdtiger — docs/references/tanks/jagdtiger.md
// Published 7.8 x 3.7 x 2.95, overall 10.65. Oracle (profiles/jagdtiger.json):
// bow tip +3.83 at y~0.9, glacis underside to tracks at +2.10, gun axis 2.11
// (tube band 2.04-2.18), casemate front from (2.0,2.3) to roof 2.79-2.85 at
// z 0.5, roof to -1.6, rear deck 2.24 at -2.1..-3.4, tail chamfer to
// (-4.23, 1.77/1.38). SHORT-BARRELLED oracle: muzzle +6.06 = overall 10.01 vs
// published 10.65 — wholeCurves carries the symmetric-coverage cost (docs
// cap note); hull/stations/dims fully satisfiable.
// ---------------------------------------------------------------------------
function buildJagdtiger(P) {
  const { cylY, cylZ, liftEye, towCable, shovelTool, periscope } = KIT;

  // LOWER hull tub (belt top 1.35) + nose/tail wedges
  loft(P, [
    { z: 3.80, b: 0.84, t: 1.08, w: 0.85 },                    // bow tip (published hullLengthM F; print reaches 3.95)
    { z: 3.56, b: 0.68, t: 1.20, w: 1.30 },                    // prow
    { z: 3.20, b: 0.48, t: 1.35, w: 1.45 },                    // nose full width
    { z: 2.60, b: 0.22, t: 1.35, w: 1.45 },                    // glacis foot
    { z: -3.50, b: 0.39, t: 1.35, w: 1.45 },                   // tub run
    { z: -3.83, b: 1.29, t: 1.74, w: 1.42 },                   // tail chamfer (12%-band R lands here)
    { z: -3.98, b: 1.42, t: 1.68, w: 1.40 },                   // tail plate foot (band-thin)
  ]);
  // glacis plate up to the casemate face root (full-ish width)
  P.add('hull', KIT.slab(
    [-1.30, 1.04, 3.82], [1.30, 1.04, 3.82], [1.45, 1.35, 2.60], [-1.45, 1.35, 2.60],
    [-1.28, 1.16, 3.80], [1.28, 1.16, 3.80], [1.12, 2.22, 2.32], [-1.12, 2.22, 2.32]));
  // UPPER casemate: 21 deg leaned sides, base +-1.45 at the 1.35 belt,
  // crown +-0.89; roof plate 2.72 with proud humps; rear wall to the 1.81 deck
  loft(P, [
    { z: 2.32, b: 1.35, t: 2.24, w: 1.45, wt: 1.10 },          // face root
    { z: 1.85, b: 1.35, t: 2.39, w: 1.45, wt: 1.05 },          // 15 deg face
    { z: 1.23, b: 1.35, t: 2.64, w: 1.45, wt: 0.92 },
    { z: 0.85, b: 1.35, t: 2.76, w: 1.45, wt: 0.85 },          // roof front edge
    { z: -1.36, b: 1.35, t: 2.74, w: 1.45, wt: 0.85 },         // roof rear edge
    { z: -1.73, b: 1.35, t: 1.81, w: 1.45 },                   // rear wall -> deck
  ]);
  // engine deck at 1.81 back to the tail
  P.add('hull', box(3.00, 0.46, 2.10), 0, 1.58, -2.70);
  P.add('hull', box(2.84, 0.06, 0.50), 0, 1.72, -3.92);                        // tail deck lip

  // pot mantlet on the face: fixed bolted ring + slim cast pot (the oracle's
  // mantlet is slim — its gun band tops 2.24), then the 12.8 cm PaK 44.
  // All hull buckets. Axis 2.11; muzzle at published overall: +6.37.
  P.add('hull', xform2(cylZ(0.26, 0.20, 18), 0, 0, 0.02, -0.26), 0, 2.11, 2.28);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.1;
    P.add('hullDark', KIT.xform(cylZ(0.013, 0.03, 6),
      Math.cos(a) * 0.225, Math.sin(a) * 0.225, 0.12, -0.26, 0, 0), 0, 2.11, 2.28);
  }
  P.add('hull', cylZ(0.185, 0.55, 18, 0.13), 0, 2.11, 2.62);                   // slim cast pot
  hullGun(P, 2.11, [
    { z0: 6.39, z1: 6.28, r: 0.115 },                                          // front brake drum (overall 10.65)
    { z0: 6.28, z1: 6.16, r: 0.055, dark: true },                              // brake slot core
    { z0: 6.16, z1: 6.02, r: 0.120 },                                          // rear brake drum
    { z0: 6.02, z1: 4.55, r: 0.095 },                                          // fore tube
    { z0: 4.60, z1: 4.45, r: 0.108 },                                          // joint collar
    { z0: 4.45, z1: 2.62, r: 0.100, r2: 0.112 },                               // rear section
  ]);
  P.turretG.position.set(0, 2.11, 1.86);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 4.65;

  // glacis furniture: MG ball right, Bosch light left, spare-track nose rack
  mgBall(P, 0.62, 1.72, 2.88, -0.68, 0.12);
  boschLight(P, -0.62, 1.98, 2.60);
  P.add('hullTrack', box(0.48, 0.05, 0.26), -0.55, 1.52, 3.10, -0.68, 0, 0);
  P.add('hullTrack', box(0.48, 0.05, 0.26), 0.55, 1.68, 2.90, -0.68, 0, 0);
  // roof furniture: the raised periscope/vent humps carry published heightM
  // (2.95 -> humps at 2.93) over >5% of body columns per the p95 rule — the
  // real vehicle's roof gear stands proud of the 2.76 plate.
  P.add('hull', box(0.34, 0.21, 0.44), -0.50, 2.87, 1.00);                     // periscope humps -> 2.975 (heightM p95)
  P.add('hull', box(0.34, 0.21, 0.44), 0.50, 2.87, 1.00);
  P.add('hullDark', box(0.26, 0.03, 0.05), -0.50, 2.945, 1.21);
  P.add('hullDark', box(0.26, 0.03, 0.05), 0.50, 2.945, 1.21);
  P.add('hull', box(0.34, 0.215, 0.38), 0.02, 2.865, -0.20);                   // vent hump -> 2.975
  P.add('hull', cylY(0.13, 0.13, 0.045, 12), 0.02, 2.985, -0.20);
  P.add('hull', box(0.32, 0.16, 0.34), -0.45, 2.83, -0.42);                    // close-defense hump
  hatchDome(P, 0.60, 2.74, -0.60, 0.24);                                       // commander hatch
  hatchDome(P, -0.60, 2.74, -1.20, 0.22);                                      // loader hatch
  for (const [px, pz] of [[-0.88, 0.55], [0.88, 0.55], [0, -1.30]]) {
    P.add('hullDetail', cylY(0.055, 0.06, 0.07, 8), px, 2.76, pz);             // Pilze sockets
  }
  // spare track links racked on BOTH casemate sides (signature)
  for (const s of [-1, 1]) {
    const tilt = s * -0.36;
    P.add('hull', box(0.03, 0.50, 1.60), s * 1.24, 2.12, 0.10, 0, 0, tilt);
    for (let k = 0; k < 5; k++) {
      P.add('hullTrack', box(0.055, 0.44, 0.17), s * 1.27, 2.12, -0.48 + k * 0.30, 0, 0, tilt);
      P.add('hullTrack', box(0.07, 0.15, 0.06), s * 1.285, 2.12, -0.48 + k * 0.30, 0, 0, tilt);
    }
  }
  // engine deck (1.81): Tiger II grille fields + central fan
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.72, 0.02, 1.05), s * 1.00, 1.815, -2.70);
    for (let i = 0; i < 4; i++) P.add('hullDetail', box(0.66, 0.026, 0.06), s * 1.00, 1.828, -2.35 - i * 0.24);
  }
  P.add('hull', cylY(0.27, 0.27, 0.035, 16), 0, 1.818, -2.45);
  P.add('hullDark', KIT.torus(0.27, 0.013, 14), 0, 1.828, -2.45);
  // rear plate: twin shrouded exhausts (LOW — the oracle tail tops 1.76)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.115, 0.12, 0.40, 12), s * 0.62, 1.46, -3.84, 0.30, 0, 0);
    P.add('hullDark', cylY(0.075, 0.085, 0.12, 10), s * 0.62, 1.66, -3.90, 0.30, 0, 0);
  }
  P.add('hullDark', box(0.46, 0.13, 0.18), -1.20, 1.86, -3.60);                // jack
  P.add('hullWood', box(0.26, 0.11, 0.28), 1.20, 1.86, -3.58);                 // jack block
  // fenders + fender kit
  KIT.fenders(P, 1.46, 1.80, 1.33, -3.55, 3.58, 0.035);
  for (const s of [-1, 1]) {                                                   // hull side skirt band
    P.add('hull', box(0.05, 0.62, 6.9), s * 1.825, 1.00, -0.15);               // 0.69..1.31 (widthM anchor)
    P.add('hullDark', box(0.02, 0.56, 6.85), s * 1.843, 0.98, -0.15);
  }
  shovelTool(P, 1.60, 1.365, 1.4);
  P.add('hullWood', box(0.03, 0.03, 1.05), -1.60, 1.365, 1.0);
  P.add('hullDark', box(0.09, 0.05, 0.24), -1.60, 1.37, 1.65);
  towCable(P, [[1.40, 1.42, -2.4], [1.47, 1.46, -0.2], [1.40, 1.42, 2.0]]);
  towHook(P, -0.85, 0.95, 3.30); towHook(P, 0.85, 0.95, 3.30);
  liftEye(P, 'hullDetail', -1.02, 2.76, 1.15, 0.4); liftEye(P, 'hullDetail', 1.02, 2.76, 1.15, -0.4);
  // 9 interleaved Tiger II stations, FRONT drive — dished steel-rim wheels;
  // track outer face at exactly +-1.85 (widthM anchor)
  steelGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.44, xc: 1.42,
    wheelZs: stations(9, 4.40, -0.25), layers: [[0.105], [-0.105]],
    sprocket: { z: 2.70, y: 0.50, r: 0.37 }, idler: { z: -2.92, y: 0.46, r: 0.33 },
    trackW: 0.72, topY: 1.02, botY: 0.06, arms: false, bayShadowTop: 1.10, deadSag: 0.075, shadows: false,
  });
  P.decal('hull', 'cross', null, 0.42, [1.17, 2.12, 0.55], Math.PI / 2, 0, 0.36);
  P.decal('hull', 'cross', null, 0.42, [-1.17, 2.12, 0.55], -Math.PI / 2, 0, -0.36);
  P.decal('hull', 'number', P.spec.visual.number || '314', 0.34, [1.14, 2.10, -0.75], Math.PI / 2, 0, 0.36);
  P.decal('hull', 'number', P.spec.visual.number || '314', 0.34, [-1.14, 2.10, -0.75], -Math.PI / 2, 0, -0.36);
  P.topY = 1.60;
}

// ---------------------------------------------------------------------------
// Jagdpanzer E 100 — docs/references/tanks/jpz_e100.md
// Published 8.7 x 4.3 x 3.29, overall 11.1. Oracle (profiles/jpz_e100.json)
// is dimensionally CLEAN: muzzle +6.87/tube axis ~2.27 (fat 17 cm), glacis
// tip +4.09 at y 0.85, tracks reach ground +2.29, gun-line top 2.41-2.46 to
// z 1.74, mantlet base 2.52-2.59, then the single signature slope: roof
// rising 2.76 @ z 0.76 to 3.29 @ z -3.0 (8 deg), tail chamfer down to
// (-4.23, 1.77/1.38). Hull span stretched +-0.2 to land published 8.7.
// ---------------------------------------------------------------------------
function buildJPzE100(P) {
  const { cylY, cylZ, liftEye, towCable } = KIT;

  // LOWER hull: tub + nose/tail wedges (side-bot silhouette forward/aft of
  // the tracks; belly clearance 0.45 between them)
  loft(P, [
    { z: 4.10, b: 0.85, t: 1.10, w: 0.72 },                    // nose tip (ref plan line)
    { z: 3.80, b: 0.82, t: 1.35, w: 1.05 },                    // prow
    { z: 3.50, b: 0.44, t: 1.55, w: 1.58 },                    // lower nose slope (belly 0.45
    { z: 3.00, b: 0.44, t: 1.75, w: 1.60 },                    //  between the tracks — ref front)
    { z: 2.60, b: 0.44, t: 1.86, w: 1.60 },                    // glacis shoulder
    { z: -3.55, b: 0.45, t: 1.86, w: 1.60 },                   // hull tub run
    { z: -4.02, b: 0.98, t: 1.86, w: 1.58 },                   // tail chamfer
    { z: -4.30, b: 1.32, t: 1.85, w: 1.52 },                   // tail foot (12%-band R)
  ]);
  // narrow prow beam: carries the published hullLengthM span (12%-band F)
  // with minimal plan/side cost; reads as the E100 bow towing spur
  P.add('hull', box(0.68, 0.48, 0.60), 0, 0.98, 4.10);
  // prow cheek bumps (the oracle's nose pokes to ~+4.26 at x +-0.9)
  P.add('hull', box(0.42, 0.34, 0.30), -0.90, 1.02, 4.12);
  P.add('hull', box(0.42, 0.34, 0.30), 0.90, 1.02, 4.12);
  // fore deck plate + UPPER casemate (leaned trapezoid, piecewise ref roof)
  P.add('hull', box(3.10, 0.05, 1.60), 0, 1.885, 2.30);                        // fore deck
  loft(P, [
    { z: 1.55, b: 1.86, t: 1.92, w: 1.50, wt: 1.48 },          // casemate face foot
    { z: 0.76, b: 1.86, t: 2.76, w: 1.50, wt: 1.02 },          // face -> roof front
    { z: 0.20, b: 1.86, t: 2.84, w: 1.50, wt: 1.00 },          // roof knee
    { z: -0.50, b: 1.86, t: 2.95, w: 1.50, wt: 0.97 },         // sloped roof (piecewise ref)
    { z: -1.20, b: 1.86, t: 3.16, w: 1.50, wt: 0.93 },
    { z: -1.60, b: 1.86, t: 3.20, w: 1.50, wt: 0.92 },
    { z: -2.60, b: 1.86, t: 3.26, w: 1.50, wt: 0.90 },
    { z: -3.00, b: 1.86, t: 3.30, w: 1.50, wt: 0.90 },         // crest (published height)
    { z: -3.70, b: 1.86, t: 3.30, w: 1.50, wt: 0.90 },         // rear wall top
    { z: -4.02, b: 1.86, t: 3.04, w: 1.46, wt: 1.02 },         // rear chamfer (narrow top edge:
    { z: -4.18, b: 1.80, t: 2.58, w: 1.30, wt: 1.16 },         //  the ref corner line in front view)
    { z: -4.32, b: 1.70, t: 1.90, w: 1.20 },                   // tail upper foot
  ]);
  // heavy slab side skirts covering the top run (E 100/Maus signature) —
  // panel band y 0.95..1.50 per the oracle's front profile, outer face at
  // EXACTLY +-widthM/2 (procScale 1.000 anchor)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.09, 0.50, 7.40), s * 2.105, 1.19, -0.10);
    P.add('hull', box(0.30, 0.06, 7.70), s * 1.72, 1.63, 0.10);                // fender lip to the hull wall
    P.add('hullDark', box(0.02, 0.44, 7.35), s * 2.149, 1.17, -0.10);          // panel shadow face
    for (let k = 0; k < 7; k++) {
      P.add('hullDark', box(0.105, 0.46, 0.02), s * 2.105, 1.18, -3.30 + k * 1.08);
    }
    P.add('hullDark', box(0.03, 0.08, 7.2), s * 2.06, 0.92, -0.10);            // lower edge shadow
  }

  // saukopf collar low on the casemate front + 17 cm StuK with its enormous
  // overhang. Axis 2.27; muzzle at published overall: 11.1 - 4.42 = +6.68.
  P.add('hull', xform2(cylZ(0.34, 0.30, 18), 0, 0, 0, -0.50), 0, 2.28, 0.85);
  P.add('hull', cylZ(0.30, 0.65, 18, 0.26), 0, 2.27, 1.30);                    // cast pot
  hullGun(P, 2.27, [
    { z0: 6.85, z1: 6.55, r: 0.185 },                                          // muzzle collar step
    { z0: 6.55, z1: 4.20, r: 0.150 },                                          // fore tube
    { z0: 4.20, z1: 1.55, r: 0.165, r2: 0.178 },                               // thick rear section
  ]);
  P.turretG.position.set(0, 2.27, 0.42);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 6.43;

  // fore-deck grilles (powerpack forward of the fighting compartment)
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.92, 0.02, 1.10), s * 1.10, 1.905, 2.30);
    for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.84, 0.026, 0.06), s * 1.10, 1.918, 2.68 - i * 0.22);
  }
  P.add('hull', cylY(0.30, 0.30, 0.04, 16), 0, 1.908, 1.75);                   // access hatch
  P.add('hullTrack', box(0.52, 0.06, 0.26), -0.85, 1.93, 3.30);                // spare links
  P.add('hullTrack', box(0.52, 0.06, 0.26), 0.20, 1.93, 3.36);
  boschLight(P, -0.70, 1.95, 3.60);
  towHook(P, -1.05, 0.78, 4.10); towHook(P, 1.05, 0.78, 4.10);
  // roof furniture ON the slope (fittings pitch with the two-segment roof)
  const roofY = (z) => (z >= -1.2 ? 2.76 + (0.76 - z) * 0.204 : 3.16 + (-1.2 - z) * 0.072);
  hatchDome(P, 0.62, roofY(-1.1) - 0.10, -1.10, 0.26);
  hatchDome(P, -0.62, roofY(-1.9) - 0.10, -1.90, 0.24);
  P.add('hull', KIT.sph(0.13, 12, Math.PI / 2), 0.05, roofY(-0.75) - 0.07, -0.75); // vent domes (sunk)
  P.add('hull', KIT.sph(0.11, 12, Math.PI / 2), -0.62, roofY(-0.9) - 0.06, -0.90);
  KIT.periscope(P, 'hullDetail', 0.30, roofY(-0.5) - 0.06, -0.50);
  KIT.periscope(P, 'hullDetail', -0.30, roofY(-0.5) - 0.06, -0.50);
  liftEye(P, 'hullDetail', -0.88, roofY(-0.5) - 0.04, -0.50, 0.4); liftEye(P, 'hullDetail', 0.88, roofY(-0.5) - 0.04, -0.50, -0.4);
  liftEye(P, 'hullDetail', -0.85, roofY(-2.9) - 0.12, -2.90, 2.7); liftEye(P, 'hullDetail', 0.85, roofY(-2.9) - 0.12, -2.90, -2.7);
  // rear wall: armored exhaust covers + jack + blocks
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.50, 0.34, 0.06), s * 0.85, 1.60, -4.30, 0.6, 0, 0);
    P.add('hullDetail', box(0.56, 0.05, 0.08), s * 0.85, 1.80, -4.24, 0.6, 0, 0);
  }
  P.add('hullDark', box(0.50, 0.14, 0.20), 1.35, 2.10, -3.95);                 // jack
  P.add('hullWood', box(0.30, 0.12, 0.30), -1.35, 2.09, -3.95);                // jack block
  towCable(P, [[1.95, 1.54, -2.8], [2.04, 1.58, -0.3], [1.95, 1.54, 2.0]]);
  steelGear(P, {
    style: 'dished', wheelR: 0.30, wheelW: 0.22, wheelY: 0.34, xc: 1.55,
    wheelZs: stations(8, 4.40, -0.15), layers: [[0.10], [-0.10]],
    sprocket: { z: -3.10, y: 0.45, r: 0.31 }, idler: { z: 2.68, y: 0.45, r: 0.30 },
    trackW: 0.80, topY: 0.90, botY: 0.06, arms: false, coveredTop: 1.20, deadSag: 0.05, shadows: false,
  });
  P.decal('hull', 'cross', null, 0.46, [1.78, 2.45, -0.35], Math.PI / 2, 0, 0.14);
  P.decal('hull', 'cross', null, 0.46, [-1.78, 2.45, -0.35], -Math.PI / 2, 0, -0.14);
  P.decal('hull', 'number', P.spec.visual.number || '100', 0.36, [1.76, 2.40, -1.85], Math.PI / 2, 0, 0.14);
  P.decal('hull', 'number', P.spec.visual.number || '100', 0.36, [-1.76, 2.40, -1.85], -Math.PI / 2, 0, -0.14);
  P.topY = 1.90;
}

// ---------------------------------------------------------------------------
// Sturmtiger — docs/references/tanks/sturmtiger.md
// Published 6.28 x 3.57 x 3.2, overall 6.28. Oracle (profiles/sturmtiger.json):
// stub RW61 muzzle +3.08 (axis ~1.0 exit... measured band 0.79-1.24 at the
// muzzle = tube over the bow slope), 47 deg casemate face crest 2.33 at
// z 2.7, roof 2.76 z 1.15..0.8, then the ERECTED CRANE + loading-bin mass
// 2.93->3.37 over z 0.38..-1.0 (build holds the block at 3.19 and the crane
// post spike to 4.15 stays 1-2 columns — heightM p95 3.2 sovereign), engine
// deck 1.79-1.81 z -1.28..-2.05, exhaust shrouds 1.85 z -2.3..-3.0, raised
// rear idler bottom 0.44-0.75, tail foot (-3.09, 1.64/1.85).
// ---------------------------------------------------------------------------
function buildSturmtiger(P) {
  const { cylY, cylZ, liftEye, towCable, shovelTool, periscope } = KIT;

  // LOWER hull (belt 1.30) + nose/tail; raised rear idler tail line
  loft(P, [
    { z: 3.17, b: 0.55, t: 1.24, w: 1.28 },                    // bow tip
    { z: 2.90, b: 0.34, t: 1.30, w: 1.50 },                    // nose root
    { z: 2.30, b: 0.44, t: 1.30, w: 1.55 },                    // glacis foot
    { z: -2.55, b: 0.44, t: 1.30, w: 1.52 },                   // tub run (idler rise starts)
    { z: -2.95, b: 0.74, t: 1.55, w: 1.50 },                   // tail chamfer
    { z: -3.16, b: 1.14, t: 1.80, w: 1.48 },                   // tail plate (to deck level)
  ]);
  // UPPER casemate: 47 deg face crest 2.33, saddle, wall edge rising to the
  // 2.59 roof plate; rear wall down to the 1.81 engine deck
  loft(P, [
    { z: 2.92, b: 1.30, t: 1.95, w: 1.44, wt: 1.40 },          // face root
    { z: 2.68, b: 1.30, t: 2.33, w: 1.42, wt: 1.22 },          // face crest
    { z: 2.42, b: 1.30, t: 2.27, w: 1.40, wt: 1.20 },          // saddle under the ball
    { z: 1.50, b: 1.30, t: 2.58, w: 1.40, wt: 1.16 },          // wall top edge rise
    { z: -1.06, b: 1.30, t: 2.59, w: 1.40, wt: 1.16 },         // roof rear
    { z: -1.26, b: 1.30, t: 1.81, w: 1.45 },                   // rear wall -> deck
  ]);
  P.add('hull', box(2.90, 0.50, 1.90), 0, 1.55, -2.20);                        // engine deck block (top 1.80)
  P.add('hull', box(0.92, 0.165, 0.38), -0.15, 2.675, 0.97);                   // roof hatch hump -> 2.76

  // 38 cm RW61 ball mount on the 47 deg plate (hull buckets): aperture ring,
  // cast ball, stub tube with the signature muzzle vent-hole ring. The tube
  // stays flush with the bow tip (published overall == hull length).
  P.add('hull', xform2(cylZ(0.48, 0.26, 18), 0, 0, 0.04, -0.75), 0.10, 2.02, 2.42);
  P.add('hullDark', KIT.sph(0.38, 18), 0.10, 2.00, 2.52);                      // cast ball
  hullGun(P, 2.00, [
    { z0: 2.85, z1: 2.76, r: 0.225, x: 0.10 },                                 // muzzle rim collar
    { z0: 2.78, z1: 2.42, r: 0.205, x: 0.10, r2: 0.235 },                      // stub tube
  ]);
  P.add('hullDark', cylZ(0.135, 0.05, 14), 0.10, 2.00, 2.84);                  // bore face
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    P.add('hullDark', cylZ(0.021, 0.06, 6), 0.10 + Math.cos(a) * 0.170, 2.00 + Math.sin(a) * 0.170, 2.83);
  }
  P.turretG.position.set(0.10, 2.00, 2.42);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 0.43;

  // casemate front: MG ball right, driver visor left low
  mgBall(P, 0.80, 1.68, 2.78, -0.82, 0.115);
  P.add('hullDetail', box(0.34, 0.15, 0.05), -0.85, 1.58, 2.82, -0.82, 0, 0);
  P.add('hullDark', box(0.26, 0.045, 0.03), -0.85, 1.59, 2.84, -0.82, 0, 0);
  // roof: loading hatch + periscope hump + vent + pilze (roof plate 2.59)
  P.add('hullDark', box(0.86, 0.016, 0.024), -0.12, 2.605, -0.30);
  P.add('hull', box(0.30, 0.09, 0.34), -0.55, 2.62, 1.35);                     // periscope hump
  periscope(P, 'hullDetail', -0.55, 2.70, 1.35);
  P.add('hull', KIT.sph(0.115, 12, Math.PI / 2), 0.55, 2.60, 1.30);            // vent dome
  for (const [px, pz] of [[-1.0, 1.35], [1.0, 1.35], [-1.0, -0.90], [1.0, -0.90]]) {
    P.add('hullDetail', cylY(0.05, 0.055, 0.06, 8), px, 2.615, pz);            // Pilze sockets
  }
  // THE CRANE: the oracle's tall mass is a NARROW folded loading-crane arm
  // riding the right roof edge (x ~ +1.1, y 2.9-3.37, z +0.4..-1.0) with a
  // single post spike to 4.14. The beam crowns at 3.20 and carries published
  // heightM (p95) over its ~12 side columns; the post stays 1-2 columns.
  P.add('hull', box(0.13, 0.30, 1.44), -0.85, 3.08, -0.30);                    // crane arm 2.93..3.23 (heightM p95)
  P.add('hullDark', box(0.10, 0.24, 0.026), -0.85, 3.04, 0.43);
  for (const zz of [0.22, -0.78]) {
    P.add('hull', box(0.12, 0.36, 0.14), -0.85, 2.74, zz);                     // arm legs on the roof edge
  }
  P.add('hullDetail', cylY(0.045, 0.05, 0.94, 10), -0.85, 3.67, -0.87);        // crane post -> 4.14
  P.add('hullDark', box(0.018, 0.40, 0.018), -0.85, 3.00, -1.06);              // fall cable
  P.add('hullDark', box(0.07, 0.11, 0.05), -0.85, 2.86, -0.60);                // hook block on the arm
  // engine deck (Tiger I grilles + fans) + rear exhausts
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.66, 0.02, 0.80), s * 0.98, 1.802, -1.75);
    for (let i = 0; i < 3; i++) P.add('hullDetail', box(0.60, 0.026, 0.06), s * 0.98, 1.815, -1.52 - i * 0.24);
    P.add('hullDark', cylY(0.20, 0.20, 0.016, 14), s * 0.88, 1.808, -1.42);    // fan wells
    P.add('hullDetail', KIT.torus(0.20, 0.018, 14), s * 0.88, 1.815, -1.42);
  }
  P.add('hull', cylY(0.24, 0.24, 0.035, 14), 0, 1.808, -1.62);                 // engine hatch
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.12, 0.13, 0.52, 12), s * 0.55, 1.50, -2.92);    // muffler drums
    P.add('hullDark', cylY(0.075, 0.085, 0.12, 10), s * 0.55, 1.82, -2.94);    // sooted tips
  }
  // fenders + deep side skirts + kit
  KIT.fenders(P, 1.56, 1.785, 1.32, -2.60, 2.60, 0.04);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 0.46, 5.1), s * 1.60, 1.08, -0.05);                // side skirt band 0.85..1.31
    P.add('hullDark', box(0.02, 0.40, 5.05), s * 1.628, 1.06, -0.05);
  }
  shovelTool(P, -1.25, 1.355, 0.9);
  P.add('hullWood', box(0.03, 0.03, 1.0), 1.36, 1.355, 0.6);
  P.add('hullDark', box(0.09, 0.05, 0.22), 1.36, 1.36, 1.25);
  P.add('hullTrack', box(0.48, 0.05, 0.24), -0.60, 1.15, 2.92, -0.30, 0, 0);
  P.add('hullTrack', box(0.48, 0.05, 0.24), 0.60, 1.15, 2.92, -0.30, 0, 0);
  boschLight(P, 0, 1.26, 2.84);
  towHook(P, -0.90, 0.72, 2.84); towHook(P, 0.90, 0.72, 2.84);
  towCable(P, [[-1.60, 1.36, -2.0], [-1.70, 1.40, 0.2], [-1.60, 1.36, 2.1]]);
  liftEye(P, 'hullDetail', -1.20, 2.60, 1.05, 0.4); liftEye(P, 'hullDetail', 1.20, 2.60, 1.05, -0.4);
  // Tiger I interleaved gear, raised rear idler per the oracle bottom line
  steelGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.44, xc: 1.4125,
    wheelZs: stations(8, 3.80, 0.10), layers: [[0.105], [-0.105]],
    sprocket: { z: 2.35, y: 0.55, r: 0.32 }, idler: { z: -2.42, y: 0.62, r: 0.32 },
    trackW: 0.725, topY: 1.00, botY: 0.08, bayShadowTop: 1.06, deadSag: 0.075, shadows: false,
  });
  P.decal('hull', 'cross', null, 0.40, [1.50, 1.90, 0.85], Math.PI / 2, 0, 0.17);
  P.decal('hull', 'cross', null, 0.40, [-1.50, 1.90, 0.85], -Math.PI / 2, 0, -0.17);
  P.decal('hull', 'number', P.spec.visual.number || '1001', 0.30, [1.47, 1.88, -0.35], Math.PI / 2, 0, 0.17);
  P.decal('hull', 'number', P.spec.visual.number || '1001', 0.30, [-1.47, 1.88, -0.35], -Math.PI / 2, 0, -0.17);
  P.topY = 1.62;
}

// ---------------------------------------------------------------------------
// T95 / T28 Super Heavy — docs/references/tanks/t95.md
// Published 7.6 x 3.8 x 2.9, overall 10.7. ORACLE DEFECT (packet cap): at
// published width the print measures body 6.48 (-15%), overall 9.54 (-11%),
// crown 2.67 (-8%) — the build anchors published dims (sovereign) and scales
// the oracle's shape onto them; hull/whole curve ceilings are documented.
// Shape (z scaled 1.173 onto the published span; heights kept at oracle
// values so the dy-registered curves stay tight): gun axis 1.22 (fat fused
// tube), glacis tip +3.8, bow crest 1.68-1.73, the print's tall mass rides
// LEFT (x -0.35..-1.15) and is raised to 2.88 to carry published heightM,
// center dome 2.10, deck 1.74 z -1.2..-2.7, tail foot (-3.8, 0.9/0.5).
// ---------------------------------------------------------------------------
function buildT95(P) {
  const { cylY, cylZ, liftEye, towCable } = KIT;

  // ROUND-2 REBUILD: the v9 z-stretch (×1.173 onto published spans) put
  // 0.5-0.6 m of error on EVERY plan/side column. The hull now sits in the
  // ORACLE-TRUE frame (bow +3.24, tail -3.24, features at the measured ref
  // stations); the published hullLengthM (7.6) is carried by a bow towing
  // clevis + tail skid on the gun line (band > 12%, ISU beam pattern), and
  // published heightM (2.9) by the print's own three whip masts (p95 rule)
  // instead of the v9 oversized left block.
  loft(P, [
    { z: 3.24, b: 0.80, t: 1.30, w: 0.30 },                    // prow tip (under the tube)
    { z: 3.00, b: 0.62, t: 1.42, w: 0.55 },
    { z: 2.76, b: 0.34, t: 1.50, w: 0.80 },                    // lower nose
    { z: 2.50, b: 0.34, t: 1.60, w: 1.15 },                    // bow rise
    { z: 2.20, b: 0.32, t: 1.66, w: 1.15 },                    // bow crest (contact starts)
    { z: 1.30, b: 0.34, t: 1.76, w: 1.15 },                    // crest plateau
    { z: 0.90, b: 0.34, t: 1.98, w: 1.15, wt: 1.10 },          // shoulder
    { z: -0.90, b: 0.34, t: 1.80, w: 1.15 },                   // mid deck under the dome
    { z: -1.95, b: 0.34, t: 1.62, w: 1.12 },                   // rear deck
    { z: -2.42, b: 0.32, t: 1.60, w: 1.10 },
    { z: -2.90, b: 0.32, t: 1.50, w: 1.06 },                   // tail slope
    { z: -3.24, b: 0.42, t: 1.30, w: 1.00 },                   // tail foot (ref-true)
  ]);
  // center superstructure dome
  loft(P, [
    { z: 1.00, b: 1.90, t: 1.98, w: 0.98, wt: 0.94 },
    { z: 0.66, b: 1.92, t: 2.09, w: 0.95, wt: 0.42 },
    { z: -0.66, b: 1.92, t: 2.09, w: 0.95, wt: 0.42 },
    { z: -1.00, b: 1.88, t: 1.94, w: 0.95, wt: 0.90 },
  ]);
  // LEFT broad deckhouse (ref front 2.12 over x -0.1..-0.6) + the NARROW
  // ventilation tower right of center (ref side 2.45-2.67 over z 0.05..0.7,
  // front a 1-2 column 2.71 spike at x ~0.55)
  P.add('hull', box(0.52, 0.34, 1.12), -0.35, 1.95, -0.22);
  P.add('hullDark', box(0.44, 0.03, 1.00), -0.35, 2.11, -0.22);
  P.add('hull', box(0.35, 0.52, 0.64), -0.775, 2.18, 0.36);                    // LEFT tall block (ref 2.38-2.47)
  P.add('hullDark', box(0.29, 0.03, 0.54), -0.775, 2.45, 0.36);
  P.add('hull', box(0.16, 0.56, 0.62), 0.53, 2.34, 0.38);                      // exhaust tower (side 2.62)
  P.add('hullDark', box(0.12, 0.03, 0.52), 0.53, 2.61, 0.38);
  // published-heightM masts: the print's own whip-antenna bases (thin spikes
  // to 2.94-3.21) — two 4 cm antenna-rail blades to 2.92 carry the p95 roof
  // line with 2-3 side columns each and 1-2 front columns
  for (const [mx, mz] of [[0.11, -0.30], [0.53, 0.42]]) {
    P.add('hullDetail', cylY(0.035, 0.05, 0.09, 8), mx, 2.12, mz);
    P.add('hull', box(0.04, 0.85, 0.30), mx, 2.49, mz);                        // blade to 2.92
  }

  // fender shelf over the four-track group (the ±1.90 width lives on the
  // unit side plates; the ref shelf edge line tops ~1.0-1.2 at ±1.86-1.90)
  P.add('hull', box(3.44, 0.10, 6.48), 0, 1.31, -0.10);
  P.add('hull', box(3.30, 0.08, 6.30), 0, 1.22, -0.12);                        // shelf underlip
  // published hullLengthM carriers on the gun line: bow towing clevis +
  // tail skid (band 0.38 incl gaps; the clevis hides under the fat tube)
  P.add('hull', box(0.30, 0.38, 0.62), 0, 1.11, 3.61);                         // bow clevis block
  P.add('hullDark', box(0.16, 0.16, 0.10), 0, 1.10, 3.88);
  P.add('hull', box(0.34, 0.38, 0.46), 0, 1.09, -3.46);                        // tail skid/lug block
  P.add('hullDark', box(0.16, 0.14, 0.08), 0, 1.08, -3.66);
  // 105 mm T5E1 in the cast rotor low on the bow shoulder (hull buckets);
  // the oracle's fused tube is FAT (band 0.26-0.31) — replicated.
  P.add('hull', xform2(cylZ(0.34, 0.30, 18), 0, 0, 0, -0.30), 0, 1.32, 1.95);
  P.add('hull', cylZ(0.24, 0.55, 16, 0.30), 0, 1.28, 2.30);                    // rotor collar
  hullGun(P, 1.22, [
    { z0: 7.02, z1: 6.70, r: 0.150 },                                          // muzzle counterweight ring
    { z0: 6.70, z1: 6.30, r: 0.132 },                                          // muzzle step
    { z0: 6.30, z1: 4.60, r: 0.105 },                                          // fore tube (ref dia 0.20-0.22)
    { z0: 4.60, z1: 2.20, r: 0.110, r2: 0.125 },                               // rear tube half
  ]);
  P.add('hull', cylZ(0.115, 0.03, 12), 0, 1.22, 5.30);                         // slice-visibility rings
  P.add('hull', cylZ(0.115, 0.03, 12), 0, 1.22, 5.85);
  P.turretG.position.set(0, 1.22, 2.00);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 5.02;

  // FOUR-track running gear: two visible units per side behind deep armored
  // plates (the v9 single-unit workaround is DROPPED — the tankFactory
  // track-band ground clamp fixed the below-ground band at source).
  // KIT NOTE (kit repair queue): each buildRunningGear call OVERWRITES
  // P.gear and the factory only calls update(0,0) on the LAST one — the
  // first unit's InstancedMeshes would render at identity (an origin blob
  // 0.4 m below ground that poisons heightM). The inner unit is built
  // FIRST and initialized explicitly; the outer (visible) unit stays last
  // so it keeps live wheel animation. Outer plate face = ±1.90 widthM anchor.
  for (const xc of [1.22, 1.68]) {
    steelGear(P, {
      style: 'steel', wheelR: 0.20, wheelW: 0.15, wheelY: 0.29, xc,
      wheelZs: stations(8, 3.95, -0.25),
      sprocket: { z: -3.20, y: 0.40, r: 0.24 }, idler: { z: 2.55, y: 0.40, r: 0.24 },
      trackW: 0.40, topY: 0.66, botY: 0.09, arms: false,
      rollers: [-1.9, -0.4, 1.1].map((z) => ({ z, y: 0.62, r: 0.06 })),
      coveredTop: 0.55, deadSag: 0.02, shadows: false,
    });
    if (xc === 1.22 && P.gear) P.gear.update(0, 0);   // init inner-unit instances
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.06, 0.88, 6.10), s * 1.87, 0.80, -0.30);               // outer unit side plate
    P.add('hull', box(0.42, 0.05, 6.10), s * 1.68, 1.26, -0.30);               // unit top decks
    P.add('hull', box(0.36, 0.05, 6.10), s * 1.22, 1.22, -0.30);
    P.add('hullDark', box(0.02, 0.62, 6.3), s * 1.45, 0.75, -0.30);            // between-unit shadow
    P.add('hullDark', box(0.02, 0.62, 6.3), s * 0.98, 0.77, -0.30);
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.68, 1.00, 2.70);          // towing lugs
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.68, 1.00, -3.40);
  }
  // travel lock legs on the prow (inside the clevis silhouette)
  P.add('hullDetail', box(0.06, 0.30, 0.06), -0.16, 1.40, 3.10, -0.4, 0, 0.35);
  P.add('hullDetail', box(0.06, 0.30, 0.06), 0.16, 1.40, 3.10, -0.4, 0, -0.35);
  // roof cluster: low cupola on the deckhouse (ref broad top 2.12), scopes
  P.add('hull', cylY(0.19, 0.21, 0.07, 14), -0.35, 2.00, -0.15);
  P.add('hull', cylY(0.17, 0.17, 0.03, 14), -0.35, 2.075, -0.15);
  P.add('hullDark', KIT.torus(0.185, 0.014, 14), -0.35, 2.09, -0.15);
  hatchDome(P, 0.30, 2.02, -0.80, 0.19);
  KIT.periscope(P, 'hullDetail', 0.20, 2.10, 0.42);
  KIT.periscope(P, 'hullDetail', -0.24, 2.10, 0.42);
  // deck fittings
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.10, 0.018, 0.12), 0, 1.635, -1.55 - i * 0.26);
  liftEye(P, 'hullDetail', -1.10, 1.72, 1.35, 0.4); liftEye(P, 'hullDetail', 1.10, 1.72, 1.35, -0.4);
  liftEye(P, 'hullDetail', -1.08, 1.60, -2.10, 2.7); liftEye(P, 'hullDetail', 1.08, 1.60, -2.10, -2.7);
  towCable(P, [[-1.14, 1.70, -1.6], [-1.20, 1.74, 0.3], [-1.14, 1.70, 1.9]]);
  P.add('hullDark', box(0.42, 0.12, 0.18), 1.04, 1.68, -1.5);                  // pioneer tool box
  P.add('hullWood', box(0.03, 0.03, 0.95), 1.10, 1.66, 0.2);
  for (const s of [-1, 1]) P.add('hullDark', box(0.13, 0.07, 0.05), s * 0.80, 1.20, -3.30); // taillights
  P.decal('hull', 'star', null, 0.40, [1.895, 0.92, 1.1], Math.PI / 2, 0, 0);
  P.decal('hull', 'star', null, 0.40, [-1.895, 0.92, 1.1], -Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [1.895, 0.90, -1.5], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [-1.895, 0.90, -1.5], -Math.PI / 2, 0, 0);
  P.topY = 1.55;
}

// ---------------------------------------------------------------------------
// ISU-152 / ISU-122S — docs/references/tanks/isu152.md / isu122s.md
// Published 6.77 x 3.07 x 2.48 (overall 9.05 / 9.85). ROUND-2 REBUILD after
// oracle batch 7 (tools/repair_oracles.py) radially slimmed both fused guns:
// the refs' 12%-band spans now end at the BOW, hull-anchored registration is
// restored, and the v9 "landed frame" / "beam-lug frame anchor" compensations
// are DROPPED. Both builds are authored in the oracle-true frame (fresh
// docs/references/profiles/*.json, body mid z=0): every feature sits at the
// measured reference station.
// Residual honest costs (certified, quantified in the packet docs):
//  - both prints are squat (roof 2.36 / 2.22 vs published 2.48): the
//    panorama cluster carries published heightM per the p95 rule (~3-4
//    columns of +0.11/+0.26 top error);
//  - both prints' hulls are short (~6.5 vs 6.77): a slim rod-stowage beam
//    riding the gun line past the bow carries the published hullLengthM
//    span (band 0.34-0.36 incl gaps) at near-zero curve cost, and the
//    sprocket-wrap/flap columns carry the rear anchor;
//  - the 152's ML-20S print gun is ~0.5 m short of published overall: the
//    published-length tube costs ~4 muzzle cover columns (side rows).
// ---------------------------------------------------------------------------
function isuCommon(P, o) {
  const { cylY, cylZ, liftEye, shovelTool, towCable } = KIT;
  // public-build rig contract: the virtual turret/cannon groups carry small
  // visible collars INSIDE the hull-side ball-mount silhouette (yaw/pitch
  // invariant footprint — the gate masks and floater poses never see them).
  P.add('turret', cylY(0.20, 0.22, 0.16, 12), 0, -0.08, 0);
  P.add('gun', cylZ(0.115, 0.26, 10), 0, 0, 0.14);
  loft(P, o.loftRows);                                         // oracle-true silhouette loft
  // published-heightM carrier (p95-sovereign): TWO thin periscope/panorama
  // stalks at the reference's own front hump pair (x ±0.45) — ~4 side
  // columns and ~6 front columns of top error instead of a broad housing.
  P.add('hull', box(0.20, o.pedestalTop - o.roofY, o.stalkLen * 0.72), o.stalkXs[0] - 0.03, (o.roofY + o.pedestalTop) / 2, o.clusterZ); // hump pedestal
  P.add('hull', box(0.10, 2.44 - o.roofY, o.stalkLen), o.stalkXs[0], (o.roofY + 2.44) / 2, o.clusterZ);
  P.add('hull', box(0.10, 0.06, o.stalkLen * 0.55), o.stalkXs[0], 2.44, o.clusterZ); // panorama head
  P.add('hullDark', box(0.08, 0.026, o.stalkLen * 0.40), o.stalkXs[0], 2.472, o.clusterZ);
  P.add('hull', box(0.20, o.domeTop - o.roofY, 0.30), o.stalkXs[1], (o.roofY + o.domeTop) / 2, o.clusterZ); // left periscope hump
  P.add('hullDark', box(0.16, 0.024, 0.24), o.stalkXs[1], o.domeTop + 0.01, o.clusterZ);
  hatchDome(P, 0.68, o.roofY, o.hatchZ, 0.23);                                 // loader dome (fwd right)
  hatchDome(P, -0.68, o.roofY, o.hatchZ - 1.1, 0.22);                          // rear-left dome
  P.add('hull', KIT.sph(o.ventR, 12, Math.PI / 2), -0.15, o.ventY, -0.05);     // center-rear vent hump
  KIT.periscope(P, 'hullDetail', -0.35, o.roofY + 0.03, o.clusterZ + 0.35);
  KIT.periscope(P, 'hullDetail', 0.15, o.roofY + 0.03, o.clusterZ + 0.45);
  // driver's vision port on the casemate front-left
  P.add('hullDetail', box(0.30, 0.16, 0.05), -0.78, o.roofY - 0.42, o.faceZ, -0.52, 0, 0);
  P.add('hullDark', box(0.22, 0.045, 0.03), -0.78, o.roofY - 0.41, o.faceZ + 0.02, -0.52, 0, 0);
  liftEye(P, 'hullDetail', -0.98, o.roofY + 0.01, o.clusterZ + 0.55, 0.4); liftEye(P, 'hullDetail', 0.98, o.roofY + 0.01, o.clusterZ + 0.55, -0.4);
  liftEye(P, 'hullDetail', -1.00, o.roofY + 0.01, o.clusterZ - 0.9, 2.7); liftEye(P, 'hullDetail', 1.00, o.roofY + 0.01, o.clusterZ - 0.9, -2.7);
  // sponson deck over the tracks + drooping outer lip. Widths/heights are
  // per-print (o.*): the 122s print carries a high full sponson (edge ~1.66),
  // the 152 a low ±1.49 fender plane with a low droop edge. The droop strip
  // runs the FULL fender span at exactly ±1.535: the widthM pixel anchor.
  P.add('hull', box(o.sponsonW * 2, o.sponsonTop - o.sponsonBot, o.fenderFront - o.fenderRear - 0.1),
    0, (o.sponsonTop + o.sponsonBot) / 2, (o.fenderFront + o.fenderRear) / 2);
  for (const s of [-1, 1]) {
    P.add('hull', box(1.505 - o.sponsonW + 0.005, o.lipTop - o.lipBot, o.fenderFront - o.fenderRear - 0.1),
      s * (o.sponsonW + 1.505) / 2, (o.lipTop + o.lipBot) / 2, (o.fenderFront + o.fenderRear) / 2);
    P.add('hull', box(0.030, o.lipEdgeH, o.fenderFront - o.fenderRear - 0.1),
      s * 1.520, o.lipEdgeY, (o.fenderFront + o.fenderRear) / 2);
    for (let bz = o.fenderRear + 0.30; bz < o.fenderFront - 0.20; bz += 0.45) {
      if (o.bracketGap && bz > o.bracketGap[0] && bz < o.bracketGap[1]) continue;
      P.add('hull', box(0.052, 0.16, 0.055), s * 1.508, o.lipEdgeY, bz);
    }
    P.add('hull', box(0.40, 0.05, 0.36), s * 1.29, o.lipTop - 0.10, o.fenderFront - 0.10, -0.85, 0, 0);  // front flap fall
    P.add('hull', box(0.44, 0.38, 0.045), s * 1.29, o.flapY ?? 0.77, o.flapRear);             // rear mud flaps (band-safe: 12% rule carrier)
    P.add('hull', box(0.28, o.boxH, 1.30), s * o.boxX, o.boxY, o.faceZ + 0.35);               // front fender stowage row
    for (const bz of [-0.45, 0.05, 0.55]) P.add('hullDark', box(0.29, o.boxH - 0.05, 0.024), s * o.boxX, o.boxY + 0.01, o.faceZ + 0.35 + bz);
    towHook(P, s * 0.62, 0.95, o.bowZ - 0.25);
    towHook(P, s * 0.62, 0.90, o.tailZ + 0.10);
  }
  shovelTool(P, -1.28, o.sponsonTop + 0.035, o.faceZ - 0.9);
  P.add('hullTrack', box(0.46, 0.05, 0.24), -0.55, o.roofY - 0.72, o.faceZ + 0.62, -0.47, 0, 0); // spare links on the glacis
  P.add('hullTrack', box(0.46, 0.05, 0.24), 0.55, o.roofY - 0.86, o.faceZ + 0.72, -0.47, 0, 0);
  KIT.headlight(P, 0.55, o.roofY - 0.68, o.faceZ + 0.80, -0.35);
  towCable(P, [[1.22, o.sponsonTop + 0.04, -1.6], [1.32, o.sponsonTop + 0.07, 0.3], [1.22, o.sponsonTop + 0.04, 1.7]]);
  // IS-2 running gear: 6 steel wheels + 3 rollers, rear drive; the wheel
  // patch/sprocket/idler land on the reference contact line (the kit's
  // track clamp ramps departures from the last road wheel like the print)
  steelGear(P, {
    xc: o.xc, trackW: o.trackW, wheelR: 0.30, wheelW: 0.24, wheelY: 0.36,
    wheelZs: o.wheelZs,
    sprocket: o.sprocket, idler: o.idler,
    rollers: o.rollerZs.map((z) => ({ z, y: 0.96, r: 0.08 })), topY: 1.00, botY: 0.10,
  });
  P.decal('hull', 'number', P.spec.visual.number || o.number, 0.22, [o.sponsonW + 0.004, o.sponsonTop - 0.11, o.clusterZ], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || o.number, 0.22, [-o.sponsonW - 0.004, o.sponsonTop - 0.11, o.clusterZ], -Math.PI / 2, 0, 0);
  P.topY = 1.20;
}

function buildISU152(P) {
  const { cylZ } = KIT;
  isuCommon(P, {
    roofY: 2.02, ventY: 2.06, ventR: 0.115, stalkLen: 0.60, trackW: 0.62, xc: 1.09, bracketGap: [1.00, 1.80],
    sponsonW: 1.44, sponsonTop: 1.425, sponsonBot: 1.30, lipTop: 1.17, lipBot: 0.52,
    lipEdgeY: 0.91, lipEdgeH: 0.10, stalkXs: [0.45, -0.62], domeTop: 2.20, pedestalTop: 2.22, flapY: 0.68,
    boxX: 1.20, boxY: 1.56, boxH: 0.24,
    clusterZ: 1.40, hatchZ: 1.00, faceZ: 2.30,
    bowZ: 3.28, tailZ: -3.26, fenderFront: 3.19, fenderRear: -2.50, flapRear: -3.38,
    number: '152',
    wheelZs: [1.92, 1.15, 0.38, -0.38, -1.15, -1.92],
    sprocket: { z: -2.42, y: 0.58, r: 0.26 }, idler: { z: 2.32, y: 0.56, r: 0.28 },
    rollerZs: [-1.55, -0.05, 1.50],
    loftRows: [
      { z: 3.28, b: 0.72, t: 1.60, w: 0.50 },                  // bow point
      { z: 3.00, b: 0.50, t: 1.72, w: 0.95 },                  // lower/upper plates converge
      { z: 2.77, b: 0.34, t: 1.83, w: 1.25 },
      { z: 2.60, b: 0.38, t: 1.90, w: 1.42, wt: 1.16 },        // casemate face root
      { z: 2.50, b: 0.38, t: 2.015, w: 1.42, wt: 1.06 },       // face crest 2.01
      { z: 2.20, b: 0.40, t: 2.01, w: 1.43, wt: 1.05 },        // roof front edge
      { z: 1.95, b: 0.40, t: 1.99, w: 1.43, wt: 1.05 },        // roof dip
      { z: 0.90, b: 0.40, t: 2.02, w: 1.43, wt: 1.05 },        // roof plate run (ref belly 0.34-0.40)
      { z: -0.38, b: 0.40, t: 2.03, w: 1.43, wt: 1.06 },       // roof rear edge
      { z: -0.46, b: 0.40, t: 1.47, w: 1.46, wt: 1.18 },       // LOW engine deck step (two-step corner)
      { z: -1.48, b: 0.40, t: 1.48, w: 1.46 },                 // deck run 1.47
      { z: -2.52, b: 0.42, t: 1.30, w: 1.44 },                 // deck tail / slope start
      { z: -2.90, b: 0.46, t: 1.09, w: 1.40 },                 // tail slope
      { z: -3.10, b: 0.53, t: 1.02, w: 1.38 },                 // tail wall (center; ref center tail -3.03)
    ],
  });
  // tail corner posts: the ref's rear plate reaches -3.26 only at the sides
  P.add('hull', box(0.66, 0.30, 0.20), -1.00, 0.65, -3.16);
  P.add('hull', box(0.66, 0.30, 0.20), 1.00, 0.65, -3.16);
  // rear-deck stowage/tarp pile band (ref 1.86-1.90 over z -1.55..-2.44)
  P.add('hull', box(2.16, 0.38, 0.84), 0, 1.66, -2.04);
  P.add('hullCloth', box(2.06, 0.10, 0.76), 0, 1.87, -2.04);
  P.add('hullDark', box(2.08, 0.30, 0.024), 0, 1.64, -2.44);
  // twin external fuel drums ride the pile line (top 1.87 = ref band),
  // clear of station slice 3 (z > -1.50 pokes the LOW-deck slice)
  fuelDrum(P, -1.00, 1.62, -2.10, 0.84); fuelDrum(P, 1.00, 1.62, -2.10, 0.84);
  // rear deck louvres on the LOW deck
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.16, 0.018, 0.11), 0, 1.485, -0.65 - i * 0.30);
  // ML-20S in the offset-right two-part ball mount: bolted ring + ball +
  // recuperator/buffer stack tucked behind the bow tip
  P.add('hull', xform2(cylZ(0.34, 0.22, 16), 0, 0, 0, -0.42), -0.24, 1.78, 2.42); // fixed bolted ring
  P.add('hull', KIT.sph(0.30, 14), -0.24, 1.70, 2.62);                         // moving ball shield
  P.add('hull', cylZ(0.115, 0.80, 10, 0.13), -0.24, 1.42, 2.30);               // buffer under-tube
  P.add('hull', cylZ(0.085, 0.70, 10, 0.095), -0.24, 1.90, 2.35);              // recuperator above
  // rod-stowage beam riding the gun line past the bow: the published
  // hullLengthM (6.77) 12%-band carrier — band 0.35 incl gaps, tracking the
  // ref's own slim tube columns within ~5 cm
  P.add('hull', box(0.36, 0.14, 1.10), -0.24, 1.50, 2.89);
  P.add('hullDark', box(0.30, 0.03, 1.06), -0.24, 1.575, 2.89);
  hullGun(P, 1.653, [
    { z0: 5.60, z1: 5.49, r: 0.100, x: -0.24 },                                // muzzle collar (published overall)
    { z0: 5.49, z1: 4.72, r: 0.107, x: -0.24 },                                // fore tube
    { z0: 4.72, z1: 4.50, r: 0.118, x: -0.24 },                                // mid ring
    { z0: 4.50, z1: 3.50, r: 0.107, x: -0.24 },                                // tube
    { z0: 3.50, z1: 3.28, r: 0.115, x: -0.24 },                                // root ring
    { z0: 3.28, z1: 2.55, r: 0.118, r2: 0.125, x: -0.24 },                     // sleeve into the ball
  ]);
  // slice-visibility rings: end-on the slim tube wall shades under the mask
  // threshold; z-facing ring lips keep every station slice lit
  P.add('hull', cylZ(0.118, 0.03, 12), -0.24, 1.653, 4.00);
  P.turretG.position.set(-0.24, 1.653, 2.50);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 3.10;
}

function buildISU122S(P) {
  const { cylZ } = KIT;
  isuCommon(P, {
    roofY: 2.155, ventY: 2.13, ventR: 0.11, stalkLen: 0.50, trackW: 0.65, xc: 1.15,
    sponsonW: 1.475, sponsonTop: 1.67, sponsonBot: 1.47, lipTop: 1.56, lipBot: 1.42,
    lipEdgeY: 1.49, lipEdgeH: 0.10, stalkXs: [0.50, -0.66], domeTop: 2.30, pedestalTop: 2.36,
    boxX: 1.18, boxY: 1.77, boxH: 0.16,
    clusterZ: 1.35, hatchZ: 1.02, faceZ: 2.20,
    bowZ: 3.34, tailZ: -3.30, fenderFront: 3.19, fenderRear: -2.48, flapRear: -3.32,
    number: '122',
    wheelZs: [1.95, 1.10, 0.26, -0.59, -1.44, -2.28],
    sprocket: { z: -2.80, y: 0.60, r: 0.26 }, idler: { z: 2.50, y: 0.64, r: 0.28 },
    rollerZs: [-1.85, -0.15, 1.55],
    loftRows: [
      { z: 3.28, b: 0.85, t: 1.60, w: 0.50 },                  // bow point
      { z: 3.10, b: 0.55, t: 1.71, w: 0.90 },
      { z: 2.82, b: 0.40, t: 1.80, w: 1.20 },                  // upper glacis
      { z: 2.57, b: 0.38, t: 1.92, w: 1.42, wt: 1.22 },        // face root
      { z: 2.42, b: 0.40, t: 2.145, w: 1.42, wt: 1.13 },       // face crest 2.14
      { z: 2.02, b: 0.42, t: 2.16, w: 1.44, wt: 1.13 },        // roof front edge
      { z: 0.40, b: 0.42, t: 2.15, w: 1.44, wt: 1.13 },        // roof plate run (ref belly 0.28-0.43)
      { z: -0.47, b: 0.42, t: 2.19, w: 1.44, wt: 1.16 },       // roof rear edge (ref 2.20 @ -0.39)
      { z: -0.50, b: 0.42, t: 1.67, w: 1.46, wt: 1.30 },       // deck step (two-step wall corner)
      { z: -2.46, b: 0.42, t: 1.65, w: 1.46 },                 // deck run 1.65-1.68
      { z: -2.62, b: 0.42, t: 1.44, w: 1.44 },                 // tail slope (fenders end here;
      { z: -2.86, b: 0.42, t: 1.335, w: 1.42 },                //  center belly stays 0.42 — the
      { z: -3.10, b: 0.45, t: 1.10, w: 1.40 },                 //  sprocket wrap owns the side bots)
      { z: -3.30, b: 0.55, t: 1.02, w: 1.38 },                 // tail wall
    ],
  });
  // twin external fuel drums on the deck run (top = ref 1.66 deck line)
  fuelDrum(P, -1.05, 1.51, -1.05, 0.86); fuelDrum(P, 1.05, 1.51, -1.05, 0.86);
  fuelDrum(P, -1.05, 1.51, -2.00, 0.86); fuelDrum(P, 1.05, 1.51, -2.00, 0.86);
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.16, 0.018, 0.11), 0, 1.675, -0.85 - i * 0.34);
  // D-25S in the offset-right ball mount + recoil sleeve
  P.add('hull', xform2(cylZ(0.30, 0.20, 16), 0, 0, 0, -0.45), -0.25, 1.80, 2.30); // fixed bolted ring
  P.add('hull', KIT.sph(0.26, 14), -0.25, 1.72, 2.50);                         // ball shield
  P.add('hull', cylZ(0.10, 0.80, 10, 0.115), -0.25, 1.44, 2.25);               // recoil buffer under
  // rod-stowage beam over the bow: published hullLengthM carrier (band 0.35)
  P.add('hull', box(0.36, 0.14, 0.96), -0.25, 1.50, 2.90);
  P.add('hullDark', box(0.30, 0.03, 0.92), -0.25, 1.575, 2.90);
  hullGun(P, 1.66, [
    { z0: 6.54, z1: 6.46, r: 0.100, x: -0.25 },                                // exit collar
    { z0: 6.46, z1: 6.34, r: 0.118, x: -0.25 },                                // front baffle drum
    { z0: 6.34, z1: 6.18, r: 0.035, x: -0.25, dark: true },                    // slot core
    { z0: 6.18, z1: 6.05, r: 0.120, x: -0.25 },                                // rear baffle drum
    { z0: 6.05, z1: 3.90, r: 0.085, x: -0.25 },                                // fore tube (repaired-oracle slim)
    { z0: 3.90, z1: 3.30, r: 0.098, x: -0.25 },                                // sleeve step
    { z0: 3.30, z1: 2.40, r: 0.105, r2: 0.115, x: -0.25 },                     // rear section into the ball
  ]);
  // slice-visibility rings on the long slim tube (see isu152 note)
  P.add('hull', cylZ(0.093, 0.03, 12), -0.25, 1.66, 4.55);
  P.add('hull', cylZ(0.093, 0.03, 12), -0.25, 1.66, 5.35);
  P.turretG.position.set(-0.25, 1.66, 2.35);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 4.16;
}

export const CASEMATE_PROFILES = {
  strv103: { build: buildStrv103 },
  jagdtiger: { build: buildJagdtiger },
  jpz_e100: { build: buildJPzE100 },
  sturmtiger: { build: buildSturmtiger },
  t95: { build: buildT95 },
  isu152: { build: buildISU152 },
  isu122s: { build: buildISU122S },
};
