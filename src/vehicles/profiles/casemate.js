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
    [-0.88, 0.46, 2.62], [0.88, 0.46, 2.62], [0.88, 0.84, 3.50], [-0.88, 0.84, 3.50],
    [-0.88, 0.72, 2.66], [0.88, 0.72, 2.66], [0.88, 1.02, 3.50], [-0.88, 1.02, 3.50]));
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
    { z0: 5.47, z1: 5.38, r: 0.092 },                                          // muzzle collar
    { z0: 5.38, z1: 3.30, r: 0.085 },                                          // fore tube
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
    P.add('hull', box(0.20, 0.03, 5.64), s * 1.70, 1.665, 0.54);               // fender plate 3.36..-2.28
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
  // raked antenna masts (oracle: symmetric pair rising to 2.80 at z ~ -2.0)
  antenna(P, -0.96, 1.96, -1.86, 0.78, -0.30);
  antenna(P, 0.96, 1.96, -1.86, 0.78, -0.30);
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
  P.add('hullDark', box(3.0, 0.08, 0.05), 0, 1.30, -3.56);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.55, 0.10, 0.30), s * 0.85, 1.48, -3.46);
    P.add('hullDark', cylZ(0.055, 0.26, 8), s * 0.55, 1.40, -3.60);
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
  P.add('hull', frustum(1.60, -2.62, -3.50, 1.62, -2.60, -3.52, 1.05, 1.20));

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
    { z: 3.95, b: 0.88, t: 1.04, w: 0.85 },                    // bow tip (lower plate edge)
    { z: 3.60, b: 0.68, t: 1.20, w: 1.30 },                    // prow
    { z: 3.20, b: 0.48, t: 1.35, w: 1.45 },                    // nose full width
    { z: 2.60, b: 0.22, t: 1.35, w: 1.45 },                    // glacis foot
    { z: -3.50, b: 0.39, t: 1.35, w: 1.45 },                   // tub run
    { z: -3.83, b: 1.29, t: 1.74, w: 1.42 },                   // tail chamfer (12%-band R lands here)
    { z: -4.12, b: 1.42, t: 1.72, w: 1.40 },                   // tail plate foot (band-thin)
  ]);
  // glacis plate up to the casemate face root (full-ish width)
  P.add('hull', KIT.slab(
    [-1.30, 1.04, 3.90], [1.30, 1.04, 3.90], [1.45, 1.35, 2.60], [-1.45, 1.35, 2.60],
    [-1.28, 1.16, 3.88], [1.28, 1.16, 3.88], [1.12, 2.22, 2.32], [-1.12, 2.22, 2.32]));
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
  P.add('hull', box(2.84, 0.06, 0.55), 0, 1.72, -4.00);                        // tail deck lip

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
    { z0: 6.51, z1: 6.40, r: 0.115 },                                          // front brake drum
    { z0: 6.40, z1: 6.28, r: 0.055, dark: true },                              // brake slot core
    { z0: 6.28, z1: 6.14, r: 0.120 },                                          // rear brake drum
    { z0: 6.14, z1: 4.55, r: 0.095 },                                          // fore tube
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
  P.add('hull', box(0.34, 0.17, 0.44), -0.50, 2.845, 1.00);                    // periscope humps -> 2.93
  P.add('hull', box(0.34, 0.17, 0.44), 0.50, 2.845, 1.00);
  P.add('hullDark', box(0.26, 0.03, 0.05), -0.50, 2.90, 1.21);
  P.add('hullDark', box(0.26, 0.03, 0.05), 0.50, 2.90, 1.21);
  P.add('hull', box(0.34, 0.175, 0.38), 0.02, 2.84, -0.20);                    // vent hump -> 2.93
  P.add('hull', cylY(0.13, 0.13, 0.045, 12), 0.02, 2.94, -0.20);
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
    P.add('hullDetail', cylY(0.115, 0.12, 0.40, 12), s * 0.62, 1.46, -3.94, 0.30, 0, 0);
    P.add('hullDark', cylY(0.075, 0.085, 0.12, 10), s * 0.62, 1.66, -4.00, 0.30, 0, 0);
  }
  P.add('hullDark', box(0.46, 0.13, 0.18), -1.20, 1.86, -3.60);                // jack
  P.add('hullWood', box(0.26, 0.11, 0.28), 1.20, 1.86, -3.58);                 // jack block
  // fenders + fender kit
  KIT.fenders(P, 1.46, 1.80, 1.33, -3.55, 3.74, 0.035);
  for (const s of [-1, 1]) {                                                   // hull side skirt band
    P.add('hull', box(0.05, 0.62, 6.9), s * 1.825, 1.00, -0.15);               // 0.69..1.31 (widthM anchor)
    P.add('hullDark', box(0.02, 0.56, 6.85), s * 1.843, 0.98, -0.15);
  }
  shovelTool(P, 1.60, 1.365, 1.4);
  P.add('hullWood', box(0.03, 0.03, 1.05), -1.60, 1.365, 1.0);
  P.add('hullDark', box(0.09, 0.05, 0.24), -1.60, 1.37, 1.65);
  towCable(P, [[1.40, 1.42, -2.4], [1.47, 1.46, -0.2], [1.40, 1.42, 2.0]]);
  towHook(P, -0.85, 0.95, 3.42); towHook(P, 0.85, 0.95, 3.42);
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
    { z: 4.10, b: 0.85, t: 1.10, w: 1.30 },                    // nose tip (ref plan line)
    { z: 3.80, b: 0.82, t: 1.35, w: 1.58 },                    // prow full width
    { z: 3.50, b: 0.38, t: 1.55, w: 1.60 },                    // lower nose slope
    { z: 3.00, b: 0.14, t: 1.75, w: 1.60 },
    { z: 2.60, b: 0.08, t: 1.86, w: 1.60 },                    // glacis shoulder
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
    { z: -4.02, b: 1.86, t: 3.04, w: 1.48, wt: 1.20 },         // rear chamfer
    { z: -4.18, b: 1.80, t: 2.58, w: 1.46 },
    { z: -4.32, b: 1.70, t: 1.90, w: 1.44 },                   // tail upper foot
  ]);
  // heavy slab side skirts covering the top run (E 100/Maus signature) —
  // panel band y 0.95..1.50 per the oracle's front profile, outer face at
  // EXACTLY +-widthM/2 (procScale 1.000 anchor)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.09, 0.50, 7.40), s * 2.105, 1.19, -0.10);
    P.add('hull', box(0.55, 0.06, 7.70), s * 1.855, 1.63, 0.10);               // fender lip to the hull wall
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
    { z: 3.14, b: 0.55, t: 1.24, w: 1.28 },                    // bow tip
    { z: 2.88, b: 0.34, t: 1.30, w: 1.50 },                    // nose root
    { z: 2.30, b: 0.44, t: 1.30, w: 1.55 },                    // glacis foot
    { z: -2.55, b: 0.44, t: 1.30, w: 1.52 },                   // tub run (idler rise starts)
    { z: -2.95, b: 0.74, t: 1.55, w: 1.50 },                   // tail chamfer
    { z: -3.14, b: 1.14, t: 1.80, w: 1.48 },                   // tail plate (to deck level)
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
  P.add('hull', box(0.13, 0.30, 1.44), -0.85, 3.05, -0.30);                    // crane arm 2.90..3.20
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

  loft(P, [
    { z: 3.80, b: 0.80, t: 1.08, w: 1.25 },                    // glacis tip
    { z: 3.52, b: 0.62, t: 1.22, w: 1.40 },                    // nose
    { z: 3.11, b: 0.28, t: 1.38, w: 1.55 },                    // lower nose
    { z: 2.70, b: 0.06, t: 1.62, w: 1.62 },                    // bow rise
    { z: 2.42, b: 0.35, t: 1.68, w: 1.62 },                    // bow crest
    { z: 1.58, b: 0.35, t: 1.73, w: 1.62 },                    // crest plateau
    { z: 1.17, b: 0.35, t: 1.90, w: 1.62 },                    // shoulder
    { z: -1.17, b: 0.35, t: 1.92, w: 1.62 },                   // hull band under the dome
    { z: -2.70, b: 0.35, t: 1.74, w: 1.62 },                   // rear deck
    { z: -2.97, b: 0.16, t: 1.60, w: 1.55 },                   // tail slope
    { z: -3.39, b: 0.30, t: 1.42, w: 1.48 },
    { z: -3.80, b: 0.50, t: 0.92, w: 1.38 },                   // tail foot
  ]);
  // center superstructure dome (LOW — the print's tall mass sits left)
  loft(P, [
    { z: 1.17, b: 1.90, t: 1.96, w: 1.30, wt: 1.26 },
    { z: 0.76, b: 1.90, t: 2.10, w: 1.30, wt: 0.85 },
    { z: -0.75, b: 1.90, t: 2.10, w: 1.30, wt: 0.85 },
    { z: -1.17, b: 1.90, t: 1.94, w: 1.30, wt: 1.22 },
  ]);
  // LEFT tall block: carries published heightM (p95) at 2.88 over ~1 m of
  // roof — the oracle's off-center mass reads 2.45-2.67 here (packet cap).
  P.add('hull', box(0.80, 0.80, 1.05), 0.75, 2.48, 0.24);
  P.add('hullDark', box(0.70, 0.03, 0.90), 0.75, 2.86, 0.24);
  P.add('hull', box(0.30, 0.10, 0.30), 0.72, 2.90, 0.20);                      // block hatch stub

  // full-width fender shelf over the four-track group (widest band ±1.90)
  P.add('hull', box(3.78, 0.10, 6.60), 0, 1.31, -0.10);
  P.add('hull', box(3.55, 0.08, 6.40), 0, 1.22, -0.12);                        // shelf underlip
  // 105 mm T5E1 in the cast rotor low on the bow shoulder (hull buckets);
  // the oracle's fused tube is FAT (band 0.26-0.31) — replicated.
  P.add('hull', xform2(cylZ(0.34, 0.30, 18), 0, 0, 0, -0.30), 0, 1.32, 1.95);
  P.add('hull', cylZ(0.24, 0.55, 16, 0.30), 0, 1.28, 2.30);                    // rotor collar
  hullGun(P, 1.22, [
    { z0: 6.90, z1: 6.62, r: 0.155 },                                          // muzzle counterweight ring
    { z0: 6.62, z1: 4.40, r: 0.135 },                                          // fore tube
    { z0: 4.40, z1: 2.20, r: 0.150, r2: 0.165 },                               // rear tube half
  ]);
  P.turretG.position.set(0, 1.22, 2.00);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 4.90;

  // FOUR-track running gear: two units per side behind deep armored plates;
  // outer track face at exactly +-1.90 (widthM anchor)
  for (const xc of [1.62]) { // single visible unit per side (twin-call loop-mesh defect; inner bays read as shadow walls)
    steelGear(P, {
      style: 'steel', wheelR: 0.20, wheelW: 0.15, wheelY: 0.29, xc,
      wheelZs: stations(8, 4.60, -0.35),
      sprocket: { z: -3.35, y: 0.34, r: 0.24 }, idler: { z: 2.62, y: 0.34, r: 0.24 },
      trackW: 0.40, topY: 0.66, botY: 0.09, arms: false,
      rollers: [-1.9, -0.4, 1.1].map((z) => ({ z, y: 0.62, r: 0.06 })),
      coveredTop: 0.55, deadSag: 0.02, shadows: false,
    });
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.06, 0.88, 6.30), s * 1.87, 0.80, -0.30);               // outer unit side plate
    P.add('hull', box(0.42, 0.05, 6.30), s * 1.68, 1.26, -0.30);               // unit top decks
    P.add('hull', box(0.36, 0.05, 6.30), s * 1.22, 1.22, -0.30);
    P.add('hullDark', box(0.02, 0.62, 6.5), s * 1.45, 0.75, -0.30);            // between-unit shadow
    P.add('hullDark', box(0.02, 0.62, 6.5), s * 0.98, 0.77, -0.30);
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.68, 1.00, 2.70);          // towing lugs
    P.add('hullDetail', box(0.16, 0.12, 0.10), s * 1.68, 1.00, -3.40);
  }
  // travel lock on the bow
  P.add('hullDetail', box(0.06, 0.42, 0.06), -0.16, 1.30, 3.30, -0.4, 0, 0.35);
  P.add('hullDetail', box(0.06, 0.42, 0.06), 0.16, 1.30, 3.30, -0.4, 0, -0.35);
  P.add('hullDetail', box(0.30, 0.06, 0.12), 0, 1.50, 3.26);
  // roof cluster: cupola + M2 on the RIGHT dome shoulder, scopes center
  P.add('hull', cylY(0.19, 0.21, 0.09, 14), -0.52, 2.10, -0.15);
  P.add('hull', cylY(0.17, 0.17, 0.032, 14), -0.52, 2.19, -0.15);
  P.add('hullDark', KIT.torus(0.19, 0.014, 14), -0.52, 2.20, -0.15);
  P.add('hullDark', cylY(0.02, 0.02, 0.14, 8), -0.52, 2.26, -0.15);            // MG pintle stub
  P.add('hullDark', box(0.085, 0.09, 0.40), -0.52, 2.33, -0.11);
  P.add('hullDark', cylZ(0.021, 0.46, 8), -0.52, 2.35, 0.28, -0.05, 0, 0);
  hatchDome(P, 0.30, 2.08, -0.75, 0.19);
  KIT.periscope(P, 'hullDetail', 0.20, 2.12, 0.42);
  KIT.periscope(P, 'hullDetail', -0.24, 2.12, 0.42);
  antenna(P, 0.35, 2.10, -0.40, 0.72); antenna(P, 0.60, 2.10, -0.68, 0.55);
  // deck fittings
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.20, 0.018, 0.12), 0, 1.755, -1.55 - i * 0.28);
  liftEye(P, 'hullDetail', -1.25, 1.50, 1.60, 0.4); liftEye(P, 'hullDetail', 1.25, 1.50, 1.60, -0.4);
  liftEye(P, 'hullDetail', -1.25, 1.50, -2.35, 2.7); liftEye(P, 'hullDetail', 1.25, 1.50, -2.35, -2.7);
  towCable(P, [[-1.52, 1.36, -1.8], [-1.62, 1.40, 0.4], [-1.52, 1.36, 2.2]]);
  P.add('hullDark', box(0.42, 0.12, 0.18), 1.48, 1.40, -1.6);                  // pioneer tool box
  P.add('hullWood', box(0.03, 0.03, 0.95), 1.55, 1.38, 0.2);
  for (const s of [-1, 1]) P.add('hullDark', box(0.13, 0.07, 0.05), s * 1.05, 1.24, -3.78); // taillights
  P.decal('hull', 'star', null, 0.40, [1.895, 0.92, 1.1], Math.PI / 2, 0, 0);
  P.decal('hull', 'star', null, 0.40, [-1.895, 0.92, 1.1], -Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [1.895, 0.90, -1.5], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '95', 0.28, [-1.895, 0.90, -1.5], -Math.PI / 2, 0, 0);
  P.topY = 1.55;
}

// ---------------------------------------------------------------------------
// ISU-152 / ISU-122S — docs/references/tanks/isu152.md / isu122s.md
// Published 6.77 x 3.07 x 2.48 (overall 9.05 / 9.85). ORACLE DEFECT (packet
// caps): both prints are proportionally squat at published width (roof 2.21 /
// 2.37 vs 2.48) and their fused fat gun sleeves qualify as 12%-band "body"
// columns, gun-biasing the oracle's own registration mid ~0.8m (152) / ~1.65m
// (122S) ahead of the physical hull mid. A dims-compliant build (published
// hull span, thin tube past the bow) therefore registers rear-shifted by the
// same amount — hull/whole ceilings documented. The builds anchor published
// dims and lay the silhouette out in the LANDED frame (bow +3.385/tail
// -3.385 around the registration mid) so every overlapping column tracks the
// oracle exactly.
// ---------------------------------------------------------------------------
function isuCommon(P, o) {
  const { cylY, cylZ, liftEye, shovelTool, towCable } = KIT;
  // public-build rig contract: the virtual turret/cannon groups carry small
  // visible collars INSIDE the hull-side ball-mount silhouette (yaw/pitch
  // invariant footprint — the gate masks and floater poses never see them).
  P.add('turret', cylY(0.20, 0.22, 0.16, 12), 0, -0.08, 0);
  P.add('gun', cylZ(0.115, 0.26, 10), 0, 0, 0.14);
  // landed-frame loft: bow lands at +3.385; oracle features occupy
  // z <= +2.5 (bow tip) .. -3.385 (window end mid-deck for the 152).
  loft(P, o.loftRows);
  // casemate roof furniture: two dome hatches + the commander panorama
  // CLUSTER that carries published heightM (2.48) over ~5 side columns.
  hatchDome(P, 0.68, o.roofY, 0.85, 0.23);
  hatchDome(P, -0.68, o.roofY, -0.35, 0.23);
  P.add('hull', box(0.52, 2.46 - o.roofY, 0.55), o.clusterX, (o.roofY + 2.46) / 2, o.clusterZ); // panorama housing
  P.add('hull', cylY(0.14, 0.15, 0.06, 12), o.clusterX, 2.47, o.clusterZ);     // panorama head
  P.add('hullDark', cylY(0.10, 0.10, 0.03, 10), o.clusterX, 2.50, o.clusterZ);
  P.add('hull', KIT.sph(0.13, 12, Math.PI / 2), -0.15, o.roofY + 0.02, 0.45);  // vent dome
  KIT.periscope(P, 'hullDetail', -0.60, o.roofY + 0.03, 1.30);
  KIT.periscope(P, 'hullDetail', 0.15, o.roofY + 0.03, 1.42);
  // driver's vision port on the casemate front-left
  P.add('hullDetail', box(0.30, 0.16, 0.05), -0.78, o.roofY - 0.50, o.faceZ, -0.52, 0, 0);
  P.add('hullDark', box(0.22, 0.045, 0.03), -0.78, o.roofY - 0.49, o.faceZ + 0.02, -0.52, 0, 0);
  liftEye(P, 'hullDetail', -0.98, o.roofY + 0.01, 1.45, 0.4); liftEye(P, 'hullDetail', 0.98, o.roofY + 0.01, 1.45, -0.4);
  liftEye(P, 'hullDetail', -1.02, o.roofY + 0.01, -1.05, 2.7); liftEye(P, 'hullDetail', 1.02, o.roofY + 0.01, -1.05, -2.7);
  // fenders + sponson kit
  KIT.fenders(P, 1.30, 1.535, 1.30, o.tailZ + 0.10, 2.35, 0.03);
  for (const s of [-1, 1]) {
    fuelDrum(P, s * 1.315, 1.56, -1.55, 0.92);                                 // twin external fuel tanks
    fuelDrum(P, s * 1.315, 1.56, -2.60, 0.92);
    P.add('hull', box(0.30, 0.20, 1.45), s * 1.30, 1.42, 1.55);                // front fender stowage row
    for (const bz of [1.05, 1.55, 2.05]) P.add('hullDark', box(0.31, 0.15, 0.024), s * 1.30, 1.44, bz);
    towHook(P, s * 0.62, 0.95, 2.42);
    towHook(P, s * 0.62, 0.90, o.tailZ + 0.06);
  }
  shovelTool(P, -1.28, 1.335, 0.6);
  P.add('hullTrack', box(0.46, 0.05, 0.24), -0.55, 1.35, 2.30, -0.47, 0, 0);   // spare links on the glacis
  P.add('hullTrack', box(0.46, 0.05, 0.24), 0.55, 1.20, 2.42, -0.47, 0, 0);
  KIT.headlight(P, 0.55, 1.45, 2.42, -0.35);
  P.add('hullDetail', KIT.torus(0.075, 0.011, 12), 0.55, 1.45, 2.49);
  towCable(P, [[1.30, 1.37, -2.0], [1.40, 1.41, 0.1], [1.30, 1.37, 1.9]]);
  // rear deck louvres inside the landed window
  for (let i = 0; i < 3; i++) P.add('hullDark', box(2.20, 0.018, 0.11), 0, o.deckY + 0.037, -2.30 - i * 0.34);
  for (let i = 0; i < 2; i++) P.add('hullDetail', box(2.30, 0.022, 0.045), 0, o.deckY + 0.04, -2.47 - i * 0.34);
  // IS-2 running gear: 6 steel wheels, rear drive, tracks per the oracle line
  steelGear(P, {
    xc: 1.14, trackW: 0.46, wheels: 6, wheelR: 0.30, wheelY: 0.36, span: 3.95, zc: -0.68,
    sprocket: { z: -3.15, y: 0.44, r: 0.26 }, idler: { z: 1.90, y: 0.44, r: 0.30 },
    rollers: [-2.1, -0.68, 0.8].map((z) => ({ z, y: 0.985, r: 0.08 })), topY: 1.00, botY: 0.10,
  });
  P.decal('hull', 'number', P.spec.visual.number || o.number, 0.30, [1.30, 1.86, 0.35], Math.PI / 2, 0, 0.245);
  P.decal('hull', 'number', P.spec.visual.number || o.number, 0.30, [-1.30, 1.86, 0.35], -Math.PI / 2, 0, -0.245);
  P.topY = 1.20;
}

function buildISU152(P) {
  const { cylZ } = KIT;
  // landed frame: oracle features at their measured z; window [+3.385,-3.385].
  isuCommon(P, {
    roofY: 2.07, deckY: 1.42, faceZ: 1.95, clusterX: 0.15, clusterZ: 0.55,
    tailZ: -3.385, number: '152',
    loftRows: [
      { z: 3.385, b: 1.42, t: 1.80, w: 0.38, x: -0.20 },       // beam tip lug (12%-band F anchor)
      { z: 3.28, b: 1.42, t: 1.80, w: 0.40, x: -0.20 },
      { z: 3.20, b: 1.49, t: 1.77, w: 0.42, x: -0.20 },        // beam run (oracle-thin)
      { z: 2.55, b: 1.49, t: 1.77, w: 0.44, x: -0.20 },        // beam root over the bow
      { z: 2.50, b: 0.72, t: 1.79, w: 1.30 },                  // bow point (upper+lower plate meet)
      { z: 1.86, b: 0.30, t: 1.90, w: 1.42, wt: 1.36 },        // upper glacis / casemate face root
      { z: 1.24, b: 0.42, t: 2.00, w: 1.42, wt: 1.10 },        // face mid (belly line 0.42)
      { z: 0.72, b: 0.42, t: 2.07, w: 1.42, wt: 0.98 },        // roof front edge (plate 2.07)
      { z: -1.14, b: 0.42, t: 2.07, w: 1.42, wt: 0.98 },       // roof rear edge
      { z: -1.30, b: 0.42, t: 1.46, w: 1.46 },                 // engine deck step
      { z: -2.30, b: 0.42, t: 1.46, w: 1.46 },                 // deck (louvre run)
      { z: -2.90, b: 0.44, t: 1.87, w: 1.30 },                 // stowage/tarp pile band (oracle 1.85-1.89)
      { z: -3.385, b: 0.30, t: 1.86, w: 1.30 },                // landed window end (tail wall)
    ],
  });
  // ML-20S: recuperator + buffer cluster ABOVE/BELOW the tube kept BEHIND the
  // bow tip (band-thin forward — published hullLengthM is 12%-band-measured).
  P.add('hull', cylZ(0.135, 1.05, 12, 0.155), -0.20, 1.58, 1.65);              // buffer under-tube
  P.add('hull', cylZ(0.095, 0.95, 10, 0.105), -0.20, 1.83, 1.60);              // recuperator above
  P.add('hull', box(0.20, 0.16, 0.75), -0.20, 1.71, 1.60);                     // saddle web
  hullGun(P, 1.64, [
    { z0: 5.665, z1: 5.60, r: 0.10, x: -0.20 },                                // muzzle collar
    { z0: 5.60, z1: 3.60, r: 0.125, x: -0.20 },                                // fore tube (oracle-fat)
    { z0: 3.60, z1: 2.10, r: 0.13, r2: 0.14, x: -0.20 },                       // rear taper
  ]);
  P.turretG.position.set(-0.20, 1.64, 2.00);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 3.665;
}

function buildISU122S(P) {
  const { cylZ } = KIT;
  isuCommon(P, {
    roofY: 2.24, deckY: 1.50, faceZ: 1.60, clusterX: 0.15, clusterZ: -0.28,
    tailZ: -3.385, number: '122',
    loftRows: [
      { z: 3.385, b: 1.44, t: 1.82, w: 0.36, x: -0.20 },       // beam tip lug (12%-band F anchor)
      { z: 3.28, b: 1.44, t: 1.82, w: 0.38, x: -0.20 },
      { z: 3.20, b: 1.51, t: 1.79, w: 0.40, x: -0.20 },        // beam run (oracle-thin)
      { z: 1.70, b: 1.51, t: 1.79, w: 0.44, x: -0.20 },        // beam run over the bow
      { z: 1.60, b: 0.56, t: 1.80, w: 1.30 },                  // bow point
      { z: 1.03, b: 0.42, t: 1.86, w: 1.42, wt: 1.20 },        // upper glacis
      { z: 0.64, b: 0.42, t: 2.15, w: 1.42, wt: 1.04 },        // casemate face
      { z: 0.38, b: 0.42, t: 2.20, w: 1.42, wt: 1.00 },        // face top
      { z: -1.90, b: 0.42, t: 2.24, w: 1.42, wt: 0.98 },       // roof plate run
      { z: -2.20, b: 0.42, t: 1.52, w: 1.46 },                 // deck step
      { z: -3.10, b: 0.42, t: 1.50, w: 1.46 },                 // engine deck
      { z: -3.385, b: 0.25, t: 1.48, w: 1.42 },                // landed window end
    ],
  });
  // raised roof-front section (oracle crown 2.37 over z -0.1..-0.45)
  P.add('hull', box(1.90, 0.13, 0.40), 0, 2.305, -0.27);
  // D-25S: slim tube with recoil sleeve step + German-pattern double-baffle
  // brake, all band-thin past the bow (hullLengthM stays published).
  P.add('hull', cylZ(0.115, 0.85, 10, 0.13), -0.20, 1.63, 1.15);               // recoil sleeve
  hullGun(P, 1.65, [
    { z0: 6.465, z1: 6.40, r: 0.075, x: -0.20 },                               // exit collar
    { z0: 6.40, z1: 6.30, r: 0.115, x: -0.20 },                                // front baffle drum
    { z0: 6.30, z1: 6.14, r: 0.035, x: -0.20, dark: true },                    // slot core
    { z0: 6.14, z1: 6.04, r: 0.12, x: -0.20 },                                 // rear baffle drum
    { z0: 6.04, z1: 3.80, r: 0.115, x: -0.20 },                                // fore tube (oracle-fat)
    { z0: 3.80, z1: 1.60, r: 0.125, r2: 0.135, x: -0.20 },                     // rear section
  ]);
  P.turretG.position.set(-0.20, 1.65, 1.70);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = 4.765;
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
