// src/vehicles/profiles/challenger.js — the Challenger family profile module
// (§5.75 owner consistency order, 2026-08-08: one family per module; PURE
// REFACTOR — every moved id hash-proven byte-identical across the split).
// Residents:
//   challenger1 — profiles-class build (CHALLENGER_PROFILES, merged by
//     profiledProcedurals.js like every ./profiles family map); moved from
//     uk.js. Its spec row still derives from challenger2's TANK_SPECS row
//     via the userdrops5 make() donor copy — unchanged mechanism.
//   challenger2 / challenger_3 — modern-class self-contained spec+build
//     entries (CHALLENGER_BUILDERS, merged into tankFactory.BUILDERS by the
//     same extension hook modern1.js uses; specs register HERE by mutating
//     the exported specs.js tables — the modern1 pattern).
// Shared helpers stay with their original owners and are IMPORTED, never
// duplicated (§5.75): uk.js keeps the UK family kit (ukHull / segBoxZ /
// towCableUK / ukToneKit / ukGearAirBackers + the §C.1 winding-guard KIT
// proxy names), modern1.js keeps the spec-table helpers (par/fr/.../shell/
// apfsdsPens).
import * as THREE from 'three';
// §I fittings census: the FITTINGS import is the spelling that survives
// synchronous top-level createTank rigs (kit.js attach-site note). KIT rides
// the deliberate tankFactory module cycle (kit.js re-exports it) — builders
// and helpers here destructure KIT at CALL time only, never at module scope
// (TDZ during our evaluation — the modern1 cycle law).
import { KIT, FITTINGS, muzzleBore } from './kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from '../specs.js';
// ch1-base tone port (uk round 2026-08-07): materials.js is cycle-free — the
// ambient-floor hook re-attach is the same import uk.js carries.
import { vehicleAmbientFloorHook } from '../materials.js';
// Spec-table helpers stay owned by modern1.js (its t72b3/merkava4/leo2a6
// armor tables use them too) — the challenger armor tables import them.
import { par, fr, rr, sR, sL, rf, chR, chL, mbox, cbox, shell, apfsdsPens } from '../modern1.js';
// UK family kit stays owned by uk.js (chieftains/centurions/vickers use it);
// challenger1Build consumes the exact bindings it always did, including the
// §C.1 winding-guarded `slab` (orientedSlab via the uk.js KIT proxy).
import {
  ukHull, segBoxZ, towCableUK, ukToneKit, ukGearAirBackers,
  box, cylY, cylZ, torus, slab, xform, buildRunningGear, buildGun,
  liftEye, periscope, headlight, pintleMG, smokeCluster, stowage,
} from './uk.js';

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
  // NO-STAIRCASES r1 (owner screenshot, §B1 law 5f4cfae): the glacis is ONE
  // plate — the old 8-knot convex run (1.19@4.16 .. 1.60@2.90) flat-shaded
  // as stacked chord bands. The real CR1 carries a single flat glacis from
  // the nose weld to the splash-board knee at 2.90 (true plate line, kept).
  // Side-silhouette cost ~0: the raked guard course (build fn) rides ABOVE
  // this line outboard and owns the bow columns per the ref's own rake.
  // push-2 r1 (post-amendment workorder): the ref hull-mask mid deck is a
  // FLAT 1.622 from z 2.55 back to the engine bulkhead STEP at -1.25/-1.31
  // (real CR1 course line: raised engine deck behind the fighting
  // compartment; ref cols 1.624 flat, 1.689 mixed AA at the -1.214 step
  // col, 1.754 behind) — the old 1.64..1.66 mid table rode 0.02-0.04 high
  // and the 1.74 skirt line painted the whole band +0.13 (see skirt).
  // Bow knee lowered to the ref's 1.559-1.591 splash-board cols.
  deck: [[4.16, 1.19], [2.90, 1.575], [2.55, 1.622], [-1.25, 1.622],
    [-1.31, 1.75], [-2.20, 1.728], [-2.56, 1.732], [-3.10, 1.727], [-3.51, 1.734], [-4.03, 1.73],
    [-4.09, 1.71]],
  beltTop: 1.02, belly: 0.52,
  // Ground bow/tail lines: track climb to the HIGH REAR sprocket (push-2:
  // ref departure ramp fits y=0.5(|z|-2.06) into a (z -2.78, y 0.85) wrap
  // circle), then the steep tail plate into the 1.12 undercut shelf; the
  // tail rake knots sit ON the ref's own 0.682@-3.162 / 0.779@-3.292 /
  // 0.974@-3.422 bottom cols (old table +0.045 high); bow wings ARCH over
  // the raised idler wrap (see build fn).
  noseRake: [[2.82, 0.52], [3.10, 0.56], [3.43, 0.66], [3.90, 0.85], [4.16, 1.02]],
  // r3: the ref's rake-to-shelf knee is near-vertical (0.779@-3.29 ->
  // 0.974@-3.36 col read) — the -3.43 knot read the -3.422 col 0.10 low.
  tailRake: [[-2.25, 0.52], [-2.75, 0.55], [-3.08, 0.615], [-3.25, 0.755], [-3.36, 0.98]],
  tailShelf: { z0: -3.36, z1: -3.60, yBot: 1.12 },
  // Skirt plane at the print's 1.60-1.63 hem band (0.53), OUTSIDE the
  // 1.005..1.525 track band (containment); the ±1.745 width plane is the
  // FRONT-HALF fender/mirror run only (plan z 3.58..-0.40).
  // Hem raised 0.53 -> 0.615 (workorder front_hull: ref hem 0.634 at the
  // ±1.6 columns; the old 0.53 read 0.10 deep). Containment margin grows.
  // push-2 r1: skirt TOP 1.74 -> 1.624 — the ref's hull-mask top is 1.624
  // over the WHOLE mid band (side cols -1.21..2.55; the 1.74 run painted
  // FIFTEEN columns +0.13, the single biggest side_hull error mass), and
  // its rear 1.72-1.75 line is deck/louvre content, not skirt. One skirt
  // course full length, co-planar with the front panels' 1.625 (§B1).
  // z0 -3.30 -> -2.55: the ref hem does NOT paint the -3.16/-3.29 side
  // bottoms (its rake owns 0.682/0.779 there) and its st1 station slice
  // (z -3.35..-2.53) reads ±1.60 — the FULL plane's ±1.655 overran it
  // +4%. The rear quarter is a raised INBOARD panel (build fn: x 1.60,
  // z -2.55..-3.28, hem 0.90) that carries the plan's -3.283 tail and
  // st1's 3.21 width without touching the ramp-owned side bottoms.
  // Face at the ref's own 1.578 plane (front cols: 1.624 tops at x 1.55..
  // 1.589 but 1.534 at 1.589..1.628 — the old 1.605..1.655 plate painted
  // the ±1.609/1.648 columns +0.07..+0.09). Thin sheet via skirtW (the
  // shoe pads end 1.527, band 1.535 — 23 mm §B4 margin).
  skirt: { x: 1.578, top: 1.624, bot: 0.615, z0: -2.55, z1: 0.90 }, skirtPanels: 8,
  skirtTrimFlush: true, skirtW: 0.02,
  // fenderPlaneZ1 (NO-STAIRCASES): the flat plane ends at 2.95 — from there
  // the ONE raked guard course (build fn) falls 0.245/m to the 4.165 nose
  // tip per the ref's own side line (workorder: 1.537@3.07 .. 1.278@4.11).
  // fenderZ1 3.30 stays as the front mud-flap anchor; flapDrop tucks the
  // flap under the rake (top ~1.40 vs rake 1.478 at z 3.275).
  fenderY: 1.54, fenderZ0: -0.40, fenderZ1: 3.30, fenderHalfW: 1.70,
  fenderPlaneZ1: 2.95, flapDrop: 0.17,
  fenderSegLen: 0.45,
  rakeHalfW: 0.92, // containment law: rake lofts clear of the 0.96..1.57 pad envelope
  trackXc: 1.265, trackW: 0.54, wheelR: 0.41, wheelY: 0.46, wheelStyle: 'dished',
  wheelZs: [2.5, 1.62, 0.74, -0.14, -1.02, -1.9],
  // push-2 r1 RUNNING-GEAR LANE (the round's named binder): the ref's
  // idler-wrap climb is a 0.51/m ramp from z 2.89 into a HIGH FORWARD
  // idler (fit: center ~(3.68, 0.845), wrap outer 0.37 — bottoms 0.325@
  // 3.463 / 0.455@3.723, wrap front face to the 0.974 wing-belly line at
  // 4.11), and the rear ramp is y=0.5(|z|-2.06) into a (z -2.78, y 0.85)
  // sprocket wrap (bottoms 0.42@-2.903 / 0.52@-3.032). The old low/short
  // end wheels lagged every climb column 0.10-0.26 on BOTH hull+whole
  // side rows (~10 cols x2). §B6 trapezoid: both ends raised. contactZF/
  // contactZR pin the patch at the ref's own ground-run ends (revolution
  // r15 / centurion r6 precedent); padCornerFloor clamps the steepened
  // ramp-pad corners to the ground plane (centurion r6 law).
  // r2 retune to the LIVE reads (shoe-hang + §C wrap-end law): idler
  // (3.62, 0.80) — the 3.68 wrap's front face painted the 4.112 col 0.68
  // where the ref shows its 0.974 wing line (wrap+shoes now END 22 mm
  // clear of the 4.047 boundary), and the ramp relaxes to the ref's own
  // 0.51/m; sprocket (-2.64, 0.80) + contactZR -2.12 — the -2.78 wrap lit
  // the -3.16 col 0.52 under the ref's 0.682 rake line and the departure
  // ramp ran 0.06 hot.
  sprocket: { z: -2.64, y: 0.80, r: 0.33 }, idler: { z: 3.62, y: 0.80, r: 0.28 },
  // (padHugZ0 is NOT plumbed through ukHull's buildRunningGear call — the
  // centurion entry's `padHugZ0: 0` is dead config; adding the pass-through
  // would alter the FROZEN centurions mid-critic, so CR1 doesn't carry it.)
  contactZF: 2.90, contactZR: -2.12, padCornerFloor: 0.012,
  trackTop: 0.98, arms: false, coveredTop: true,
  // Decal quads are mask geometry — pin the numbers onto the skirt plates
  // (push-2: re-pinned on the 1.578 face).
  numberSize: 0.34, numberR: [1.579, 1.15, 0.5], numberL: [-1.579, 1.15, 0.5],
};

function challenger1Build(P) {
  const g = CR1_HULL;
  ukHull(P, g);
  // BOW GUARD COURSE — NO-STAIRCASES r1 (§B1 law 5f4cfae, owner screenshot).
  // The old bow stacked THREE terraces per side (fender plane 1.5575 ending
  // 3.30 -> transition plate 1.43->1.32 -> wing 1.44->1.185): two ~0.10 m
  // equal risers reading as box steps on the slope. The ref's own side line
  // is ONE rake (workorder cols 1.537@3.07 -> 1.278@4.11, ~0.25/m): the
  // course is now a single raked surface from the fender-plane end
  // (2.95, 1.5575) to the nose tip (4.165, 1.26), emitted as three nested
  // CO-PLANAR strips so the plan keeps its real taper (1.745 mirror plate
  // 3.28..3.60, 1.70 fender edge to 3.30, 1.65 wing run to the tip) while
  // the elevation reads one slope. Underside keeps the print's rising
  // 0.99..1.00 wing belly + hanging tip flaps (mask lines unchanged).
  const rk = (z) => 1.5575 - 0.245 * (z - 2.95);
  for (const s of [-1, 1]) {
    const W = (xi, xo, zf, zr, yb) => {
      const lo = Math.min(s * xi, s * xo), hi = Math.max(s * xi, s * xo);
      P.add('hull', slab(
        [lo, yb(zf), zf], [hi, yb(zf), zf], [hi, yb(zr), zr], [lo, yb(zr), zr],
        [lo, rk(zf), zf], [hi, rk(zf), zf], [hi, rk(zr), zr], [lo, rk(zr), zr]));
    };
    // push-2 r1: the wing belly ARCHES over the raised idler wrap (§B4 —
    // wrap outer tops 1.215 at z 3.68 inside the wing's 0.995..1.535 track
    // x-band; the old flat 0.99-1.00 belly would clip it). The arch is the
    // real mud-guard arch (rise/crest/fall, chord-faceted — §B1: one shaped
    // surface, not steps); it is side-mask INVISIBLE (the wrap paints below
    // it on every column) and the tip segment keeps the ref's own
    // 0.974@4.112 wing-belly column. Segments <=0.35 (§C station caps).
    W(0.95, 1.65, 3.30, 2.95, () => 1.00);
    W(0.95, 1.65, 3.50, 3.30, (z) => 1.00 + (z - 3.30) * 1.225);
    W(0.95, 1.65, 3.85, 3.50, () => 1.245);
    W(0.95, 1.65, 4.06, 3.85, (z) => 1.245 - (z - 3.85) * 1.19);
    W(0.95, 1.65, 4.165, 4.06, () => 0.995);
    W(1.65, 1.70, 3.30, 2.95, () => 1.285);
    W(1.65, 1.745, 3.60, 3.28, (z) => rk(z) - 0.11);
    // tip flaps: r5 OUTBOARD (x 1.54..1.70, hung from the wing edge) —
    // the r2 idler move sweeps the shoes to z 4.04 through the old
    // center flap's plate (§B4 90 vox), and no z exists between the shoe
    // sweep (<=4.065) and the 4.047 column boundary (§C). The wrap owns
    // the 3.982 column's 0.49 bottom regardless (the flap never painted
    // it), so the move is mask-free.
    P.add('hullRubber', box(0.16, 0.30, 0.04), s * 1.62, 0.85, 4.02);
    // (r3 note: trim planks were TRIED here per the revolution r15 recipe
    // and removed — r15's plank painted a line its band couldn't reach
    // behind the skirt window; HERE the band is visible and reads LOWER
    // than the ref line, so a plank above it can never raise the mask
    // bottom. The wrap-zone residual is the band+shoe-hang itself.)
  }
  // Glacis kit: splash board (top ~1.60 — the ref's own 1.57 line at the
  // 2.94 column; the old 1.67 board rode 0.10 proud), headlight pods SEATED
  // ON the guard rake at the ref's own 3.593 bump column (top 1.475), tow
  // point.
  P.add('hullDetail', box(1.9, 0.05, 0.1), 0, 1.565, 2.95, -0.3, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.3, 0.16, 0.12), s * 1.26, 1.395, 3.593);
    P.add('hullGlass', cylZ(0.055, 0.02, 10), s * 1.32, 1.42, 3.655);
    P.add('hullGlass', cylZ(0.045, 0.02, 10), s * 1.18, 1.42, 3.655);
  }
  P.add('hullDetail', box(0.16, 0.12, 0.16), 0, 0.72, 3.62);
  P.add('hullDetail', torus(0.07, 0.018, 10), 0, 0.72, 3.72, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) {
    // side band trimmed to the fender-plane end (its flat 1.55 top ran to
    // z 3.55, poking through the new bow rake and re-painting the terrace)
    // (WIDTH CARRIER: outer 1.755 = the 3.51 visible-box width — §D
    // probe-frame scale anchor; never narrow without a width plan)
    segBoxZ(P, 'hull', 0.09, 0.92, 3.30, s * 1.71, 1.09, 1.30);
    // push-2: skirt-rail mounting bosses — the ref's st2/st3 station
    // slices read ±1.66-1.68 content the thin plane alone lost (centurion
    // boss-row architecture; front-view INTERIOR: tops 1.35 under the
    // side band's 0.63..1.55 window). r2: widened inboard to BRIDGE the
    // 1.578 skirt plane and the 1.598..1.613 outer board (§B2 standoff
    // attachment) while still carrying the ±1.677 station width.
    for (const bz of [-2.11, -1.68, -1.25, -0.82, -0.39, 0.04, 0.47]) {
      P.add('hullDetail', box(0.105, 0.36, 0.16), s * 1.6245, 1.17, bz);
    }
    segBoxZ(P, 'hull', 0.045, 0.025, 3.68, s * 1.7425, 1.435, 1.44);
    // front skirt panels: the ref's LOWER 1.62 course ahead of z 0.90
    // (real CR1 panel line — co-planar hem, one plate step at the course
    // joint, not a slope quantization; side_hull cols 0.99..2.45 read
    // 1.624). push-2: on the 1.578 face with the main plane (§B1 one
    // course; the 1.63 seat painted the 1.609/1.648 front cols +0.08).
    for (const zc of [1.1775, 1.7275, 2.2775]) {
      P.add('hull', box(0.02, 1.01, 0.525), s * 1.568, 1.12, zc);
    }
    P.add('hullDark', box(0.02, 0.90, 0.016), s * 1.570, 1.11, 1.4525);
    P.add('hullDark', box(0.02, 0.90, 0.016), s * 1.570, 1.11, 2.0025);
  }
  towCableUK(P);
  // r10b (uk round 5 — "deck course-line patchwork vs ref's cleaner
  // plates" / close-roof empty fields): flush dark panel seams + filler
  // caps on the flat 1.622 mid deck (tone detail, +2..5 mm — the ref's
  // own deck line is 1.624).
  P.add('hullDark', box(1.9, 0.004, 0.016), 0, 1.624, 0.62);
  P.add('hullDark', box(1.9, 0.004, 0.016), 0, 1.624, 1.72);
  P.add('hullDetail', cylY(0.05, 0.05, 0.005), 0.75, 1.6245, -0.90);
  P.add('hullDetail', cylY(0.05, 0.05, 0.005), -0.75, 1.6245, -0.90);
  // Engine deck louvres.
  P.add('hull', box(1.9, 0.035, 1.05), 0, 1.72, -2.62);
  if (P.q) for (let i = 0; i < 6; i++) {
    P.add('hullDark', box(1.8, 0.016, 0.05), 0, 1.734, -2.25 - i * 0.15);
  }
  // Rear-deck bin (the print's 1.828 bump, held inside the -2.86..-3.07
  // columns — the old 0.28 depth painted the -2.773 column +0.11).
  // push-2 r1 re-profile (front_hull): the ref's 1.822 crest is NARROW
  // (front cols ±0.30 only) with a 1.762 shoulder course running out to
  // x ~1.39 — the old 1.6-wide 1.83 slab painted 24 front columns +0.06
  // and left the ±0.86..1.37 band -0.02 bare. Side line unchanged (the
  // center hump still owns the -2.90/-3.03 1.819 columns).
  P.add('hull', box(0.60, 0.17, 0.20), 0, 1.745, -2.97);
  for (const s of [-1, 1]) P.add('hull', box(1.075, 0.10, 0.20), s * 0.8375, 1.712, -2.97);
  // TAIL: shelf sides to the print's -4.09 corners, recessed center notch,
  // rear fender strips at the 1.73 deck line, low tail lip to -4.16.
  for (const s of [-1, 1]) {
    // (r3: tail side boxes end -3.99 — their -4.02 rear read the -4.072
    // side col 1.137 under the ref's 1.234 box line. r4: bottoms split at
    // -3.77 per the ref's own 1.169/-3.682 vs 1.104/-3.812 underside
    // steps — the flat 1.12 floor was the -3.682 col's painter.)
    P.add('hull', box(0.55, 0.555, 0.22), s * 0.655, 1.4425, -3.66);
    P.add('hull', box(0.55, 0.62, 0.22), s * 0.655, 1.41, -3.88);
    // deep boxes re-cut to the ref's plan: they run to -4.05 ONLY inside
    // |x| 0.95..1.13 (the old ±1.18 x -4.02 footprint overran the ±1.09
    // and ±1.2 columns both ways). push-2: front edge -3.02 -> -3.26 —
    // the raised sprocket wrap crests through the old 1.12 box bottoms in
    // the shared 0.995..1.13 x-band (§B4); the wrap ends -3.06, boxes
    // start clear behind it. Splits <=0.48 (§C caps) with the ref's own
    // stepped bottoms: 1.12 to -3.60, 1.15 to -3.95, 1.22 at the tail.
    P.add('hull', box(0.175, 0.61, 0.32), s * 1.0425, 1.425, -3.42);
    P.add('hull', box(0.175, 0.58, 0.37), s * 1.0425, 1.44, -3.765);
    P.add('hull', box(0.175, 0.51, 0.10), s * 1.0425, 1.475, -4.0);
    // r5 §B2: rear gear-deck cover shelf — the skirt z0 pull to -2.55 +
    // deep-box move to -3.26 opened a sky pit over the dead zone behind
    // the sprocket (12 enclosed cells at z -3.26). Sits over the ended
    // wrap (top 0.98 there), under the deck line; side/plan interior.
    P.add('hull', box(0.62, 0.03, 0.22), s * 1.25, 1.17, -3.16);
    // rear fender strips: LEFT extended to the ref's own -3.608 plan col
    // (was -3.55; the right strip already carries the ref's -3.705).
    segBoxZ(P, 'hull', 0.20, 0.05, s > 0 ? 1.50 : 1.41, s * 1.31, 1.705, s > 0 ? -2.95 : -2.905);
    // r8 (tone round O6): rear-quarter plan coverage — exposed black shoe
    // rungs laddered the quarters in plan where the ref reads covered
    // (z -2.6..-3.1 lanes beside the 0.20 strip). Cover strips at the
    // existing deck line: inboard lane x 0.96..1.21 (under the ±1.45
    // deck-plateau front cover) and outboard lane x 1.415..1.53 (front
    // cols already carry the guard stubs' 1.68..1.73 band); plan-neutral
    // (the band/wrap paints below to -3.10); side tops 1.7255 under the
    // 1.727-1.732 deck knots. The z > -3.10 lane is NOT plan-painted by
    // the track and stays open (honest O6 residual — mask-positive there).
    for (const cz of [-2.48, -2.90]) {
      P.add('hull', box(0.25, 0.045, 0.40), s * 1.085, 1.703, cz);
      P.add('hull', box(0.115, 0.045, 0.40), s * 1.4725, 1.703, cz);
    }
    // outer tail-guard stubs (ref plan is ASYMMETRIC: left rear -3.51,
    // right rear -3.705 at the ±1.5 columns). push-2: pulled INBOARD to
    // x 1.435..1.525 — the old 1.50..1.61 span partial-pixel-painted the
    // ±1.64 plan columns to -3.70/-3.50 where the ref reads its skirt
    // tail -3.283 (the round's worst plan column, 0.195), and lit the
    // 1.569..1.648 front columns at 1.73 over the ref's 1.53-1.62 skirt
    // band. They now seal against the RAISED REAR SKIRT PANEL (below)
    // via a 2 cm z-overlap at -3.26..-3.28 (§B2: the drain channel stays
    // open outboard/rearward — no enclosed cells).
    P.add('hull', box(0.145, 0.05, s > 0 ? 0.44 : 0.24), s * 1.4725, 1.705, s > 0 ? -3.48 : -3.38);
    // push-2: raised INBOARD rear skirt panel z -2.55..-3.28 (x 1.60, hem
    // 0.90): carries the ref's -3.283 plan tail and the st1 station's
    // ±1.60 width WITHOUT painting the ramp-owned side bottoms (its hem
    // stays above the tail-rake/ramp lines — the ref's own architecture
    // per the side/plan/station cross-read). Two <=0.48 segments (§C).
    P.add('hull', box(0.045, 0.63, 0.365), s * 1.5905, 1.215, -2.7325);
    P.add('hull', box(0.045, 0.63, 0.365), s * 1.5905, 1.215, -3.0975);
    // r2: OUTER BOARD course over the main skirt run — the ref's ±1.6
    // front cols carry a SECOND lower layer (top 1.534, hem 0.515; our
    // rear-panel hem 0.90 alone read those bottoms +0.38). Thin row at
    // x 1.598..1.613 (§C: 15 mm clear of the 1.628 front-col boundary),
    // eight <=0.44 segments.
    // r8 (tone round O1b — THE floor-setter): the r2 row was a visually
    // CONTINUOUS wall (0.011 gaps) sealing the gear window — the ref's own
    // layer is SPACED hangers with the wheels reading between (r7: zero of
    // six discs read, slit luma p5 ~7). Slatted: the eight segments keep
    // their z-centers/pitch as an upper course over the wheel line (bottom
    // 0.88 ~ wheel-top), and five hanger STRAPS drop to the 0.515 hem at
    // the wheel-GAP stations. Mask-neutral by construction: front ±1.6
    // cols read min-bottom over z (straps hold 0.515) and the same 1.525
    // top; side bottoms are ground-run-owned; plan is bracketed by the
    // fender (to 3.30) and the rear panel (-3.28) at these x; the strap
    // row's z-extremes reproduce the old row's 0.894/-2.543 ends exactly;
    // every station window keeps 1.613-face content via the course row.
    for (let k = 0; k < 8; k++) {
      P.add('hull', box(0.015, 0.645, 0.42), s * 1.6055, 1.2025, 0.684 - 0.431 * k);
    }
    for (const hz of [0.824, 0.30, -0.58, -1.46, -2.473]) {
      P.add('hull', box(0.015, 0.50, 0.14), s * 1.6055, 0.765, hz);
    }
  }
  P.add('hull', box(0.32, 0.47, 0.45), 0, 1.485, -3.775);
  // tail lip split: the ref's center notch reads -3.998 at |x|<=0.27 — the
  // full-width lip painted those plan columns 0.16 too far rear; the ±0.30
  // ..0.92 segments still carry the published -4.19 tail anchor.
  // push-2: lip lowered 0.055 (the -4.202 side col reads ref 1.526 top /
  // 1.396 bottom vs our old 1.591/1.429).
  for (const s of [-1, 1]) P.add('hullDark', box(0.62, 0.19, 0.09), s * 0.61, 1.47, -4.145);
  P.add('hullDetail', box(2.1, 0.05, 0.05), 0, 1.70, -3.62);
  // §C.1 winding fix-round 2026-08-07 (fleet sweep item 2): the 0.9 soot
  // quad spanned x 0.15..1.05 / y 0.85..1.75 at z -4.0 — its top strip rode
  // over the 1.72 tail-box line and its flanks hung past the backed plate
  // composite, so the one-sided plane painted the gate's DoubleSide masks
  // from frontright/frontleft (199/48 px F-vs-D) while the game culls it.
  // Re-pinned 5 mm proud of the -3.99 tail-box aft face and sized inside
  // that face (x 0.405..0.905, y 1.11..1.61); the O5b outlet boxes/stubs
  // still poke through the stain as before.
  P.decal('hull', 'soot', null, 0.5, [0.655, 1.36, -3.995], Math.PI);
  // COMPANION MASS (same round): the phantom decal's 1.75 top edge was the
  // rearmost station's ONLY 1.74-line painter — the ref reads a bin-rack
  // rim over the tail bins' aft edge (its own side cols 1.741 at
  // -4.01..-4.00, station-0 top 1.743/gate-row ~1.750; the reference md's
  // "rear bin rack across the tail"). Authored honestly: rack rim rails on
  // the tail-bin lids' rear edge (§B3.2 bin class), 5 mm seat on the 1.72
  // lid plane + 15 mm rear lip over the -3.99 aft face (backed, touching —
  // floaters-clean). Column math: tops ride ONLY the -4.00/-3.99 side cols
  // where ref reads 1.741/1.736 (the -4.00 col IMPROVES from the 1.73
  // deep-box read; a flat mid-run rim at 1.75 taxed side_whole off its
  // 90.10 razor edge — r2 evidence in the round notes). x 0.38..0.92 sits
  // inside the ±0.30..0.92 lip plan band (plan tail owned by the -4.19 lip
  // below), center |x|<0.27 lane untouched (the -3.998 notch line keeps
  // its §C margin), and front cols stay under the 1.762 deck-bin shoulder.
  for (const s of [-1, 1]) P.add('hull', box(0.54, 0.0305, 0.02), s * 0.65, 1.73525, -3.995);
  // r10 O5b (shaded-parity r8 — lower rear plate exhaust/cable clutter, the
  // ordered rear tell): exhaust outlet boxes + pipe stubs at the tail
  // corners, a draped cable across the upper plate, cleats and a convoy
  // light. Column-safe envelope (per the r8 tail certs): everything rides
  // z >= -4.045 where the ±1.0425 deep boxes already paint side y 1.22..1.73
  // (parts hold y >= 1.23), and the |x| < 0.27 center lane keeps z >= -3.98
  // (the -3.998 center-notch plan line, §C 15 mm margin); |x| <= 0.90 stays
  // inside the ±0.30..0.92 lip band whose plan tail is the -4.19 lip itself.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.26, 0.20, 0.055), s * 0.70, 1.33, -4.017);
    P.add('hullDark', cylZ(0.042, 0.06, 10), s * 0.58, 1.30, -4.01);
    P.add('hullDark', cylZ(0.042, 0.06, 10), s * 0.80, 1.30, -4.01);
    P.add('hullDark', box(0.09, 0.09, 0.05), s * 0.85, 1.60, -3.99);
  }
  KIT.towCable(P, [[-0.85, 1.60, -3.973], [0, 1.455, -3.973], [0.85, 1.60, -3.973]]);
  // tail-shelf floor under the box lanes (§B2: the cable run below would
  // otherwise SEGMENT the open lanes into enclosed top-down cells — the
  // r5 rear gear-deck cover precedent; standard-check caught 3x6c at
  // x ±0.3). y 1.13..1.16 sits exactly on the box1 bottoms at z -3.62..
  // -3.77 (no side-col move) and above the 1.10 box2 bottoms rearward;
  // z-end -3.98 keeps the -3.998 center-notch plan line with §C margin.
  P.add('hullDark', box(1.86, 0.03, 0.36), 0, 1.145, -3.80);
  // + corner pads at the lip ends (the cleats segmented two 1-cell corner
  // pockets at x ±0.89, z -4.1): y 1.39..1.41 inside the lip's own side
  // band, x 0.815..0.92 inside the lip x-band whose plan already reads
  // -4.19 — plan/side free by construction.
  for (const s of [-1, 1]) P.add('hullDark', box(0.105, 0.02, 0.13), s * 0.8675, 1.40, -4.10);
  // low wavy pipe run riding the shelf (the ref's snaking-cable tell)
  KIT.towCable(P, [[-0.80, 1.25, -3.80], [-0.30, 1.195, -3.83], [0.20, 1.24, -3.82], [0.72, 1.195, -3.79]], 0.020);
  P.add('hullDark', box(0.12, 0.09, 0.05), -0.15, 1.60, -3.985);
  // convoy-light lens dark (a glass disc fired a white bloom dot at 1x)
  P.add('hullDark', cylZ(0.028, 0.012, 10), -0.15, 1.60, -4.014);

  // ---- wedge-faced Chobham CASTING (turret mask): plateau 2.498
  // (z -0.39..0.62), nose to the plan's 2.84 center arc, side bins to
  // x 1.45, bustle tail -2.12; the deep trunnion mass rides at the
  // print's 0.95..1.48 band ----
  P.turretG.position.set(0, 1.62, -0.2);
  P.gunG.position.set(0, 0.23, 0.62);
  // Sloped face: chin raised to the ref's own 1.67 line (workorder
  // side_turret bottoms 1.656..1.689 at z 2.16..2.68 — the old 1.55 chin
  // hung 0.10-0.13 deep on six columns).
  // push-2 r1 — §B1 SLOPE-MOTIVATES-THE-MASS (c1ad424): the ref casting
  // crown is ASYMMETRIC — high commander's plateau (2.498) LEFT of x 0,
  // low loader's roof (~2.33) across the right half (front_whole: ref
  // tops 2.336-2.396 flat from x 0.06 out to the 2.28-2.31 cheek band —
  // our symmetric 0.878 crown+face corners painted 18 columns +0.08..
  // +0.15). The raked right cheek now runs out into its OWN low roof
  // line (the slope drives the whole volume); the sight-plinth step wall
  // at x 0 is the ref's real course line. Face slab split at x 0.
  P.add('turret', slab(
    [-1.02, 0.05, 2.90], [0.0, 0.05, 2.90], [0.0, 0.05, 0.75], [-1.16, 0.05, 0.75],
    [-0.55, 0.77, 1.42], [0.0, 0.755, 1.42], [0.0, 0.878, 0.82], [-0.93, 0.878, 0.82]));
  P.add('turret', slab(
    [0.0, 0.05, 2.90], [1.02, 0.05, 2.90], [1.16, 0.05, 0.75], [0.0, 0.05, 0.75],
    [0.0, 0.725, 1.42], [0.55, 0.71, 1.42], [0.93, 0.705, 0.82], [0.0, 0.705, 0.82]));
  // Nose wedge to the plan's z 2.84 center point; chin RAKED per the ref's
  // own nose line. push-2: chin bottom raised to the ref's LIVE 1.656..
  // 1.689 band (the old -0.05..0.04 hung the 2.16..2.94 side columns
  // 0.06-0.13 deep) and the plan x pulled to ±0.485 (the ±0.52 edge
  // partial-pixel-painted the ±0.568 plan cols to 2.79 vs ref 2.66).
  P.add('turret', slab(
    [-0.485, 0.03, 3.02], [0.485, 0.03, 3.02], [0.80, 0.045, 1.9], [-0.80, 0.045, 1.9],
    [-0.30, 0.62, 2.02], [0.30, 0.62, 2.02], [0.44, 0.72, 1.55], [-0.44, 0.72, 1.55]));
  // Mantlet-recess underside mass (the ref's 1.455..1.62 band at world
  // z 1.66..2.06 — its trunnion/collar line sweeps low ahead of the deep
  // mass; also closes the slot under the raised chin). r4: bottom to the
  // live 1.461 cols (the 1.42 floor hung -0.065 on three columns).
  P.add('turret', box(1.2, 0.24, 0.40), 0, -0.045, 2.06);
  // Crown plateau — the commander's LEFT half only (x -0.70..0, the ref's
  // own 2.498 side line; the step wall at x 0 falls to the loader roof).
  P.add('turret', box(0.70, 0.30, 1.01), -0.35, 0.728, 0.315);
  // Loader's LOW right roof: one 0.705 course from the step wall out to
  // the x 0.93 cheek edge (replaces the right 2.28 shelf — the raked
  // cheek face and this roof meet on the slope's own line, §B1).
  P.add('turret', box(0.93, 0.155, 1.01), 0.465, 0.6275, 0.315);
  P.add('turret', box(0.23, 0.22, 1.01), -0.815, 0.55, 0.315);
  // Rear roof falling to the bustle. push-2: the top-front corners follow
  // the asymmetric crown (left 0.828, right 0.705) and the slab BELLY is
  // now the ref's own RISING underside line 1.72@-0.30 -> 1.82@-1.70
  // (side_turret bottoms; the flat 0.13 belly hung -0.03..-0.065 on seven
  // columns rear of the ring and would overshoot ahead of it).
  // (bottom-rear corners pulled ±0.95 -> ±0.79: the slab's plan footprint
  // painted the ±0.991 plan cols to -1.69 where the ref's casting ends
  // -1.46 — the r3 'stubborn column' class, located by raycast.
  // r3: split at x 0 — the single left-high/right-low diagonal read the
  // 0.06..0.74 front cols 0.76-0.77 where the ref holds a FLAT 0.72
  // loader course; the fall now lives entirely left of the plinth wall.)
  P.add('turret', slab(
    [-1.05, 0.10, -0.10], [0.0, 0.10, -0.10], [0.0, 0.20, -1.50], [-0.79, 0.20, -1.50],
    [-0.74, 0.828, -0.15], [0.0, 0.72, -0.15], [0.0, 0.60, -1.48], [-0.62, 0.60, -1.48]));
  P.add('turret', slab(
    [0.0, 0.10, -0.10], [1.05, 0.10, -0.10], [0.79, 0.20, -1.50], [0.0, 0.20, -1.50],
    [0.0, 0.72, -0.15], [0.74, 0.705, -0.15], [0.62, 0.60, -1.48], [0.0, 0.60, -1.48]));
  // §B1 chamfered joint: grades the LEFT plateau (0.878) onto the rear
  // roof (0.828); on the right both planes sit at 0.705-0.72 (flat).
  P.add('turret', slab(
    [-0.90, 0.70, -0.10], [0.0, 0.70, -0.10], [0.0, 0.70, -0.19], [-0.90, 0.70, -0.19],
    [-0.74, 0.828, -0.10], [0.0, 0.72, -0.10], [0.0, 0.72, -0.19], [-0.70, 0.878, -0.19]));
  P.add('turret', slab(
    [0.0, 0.70, -0.10], [0.90, 0.70, -0.10], [0.90, 0.70, -0.19], [0.0, 0.70, -0.19],
    [0.0, 0.72, -0.10], [0.74, 0.705, -0.10], [0.70, 0.705, -0.19], [0.0, 0.72, -0.19]));
  // Bustle tail + shoulders. Plan re-read (workorder plan_turret): the
  // ref's tail steps in PLAN — |x|<=0.54 runs to -2.11, a 0.54..0.62
  // shoulder stops at -1.92, and the 0.93..1.16 band ends -1.43/-1.46 —
  // the old 1.16-wide tail boxes overran the x 0.60/0.99 columns 0.23-0.46.
  // (bustle floors ride the ref's own 1.82-1.85 underside band — the old
  // 1.66-1.70 floors hung 0.15 deep on seven side_turret columns)
  // (r4: tail-course boxes ±0.53 -> ±0.51 — the 0.53 edge sat 6 mm off
  // the 0.536 plan-band boundary and AA-bled its -2.03 rear into the
  // 0.601 column, §C partial-pixel; raycast-located)
  P.add('turret', box(1.02, 0.30, 0.44), 0, 0.47, -1.61);
  P.add('turret', box(1.02, 0.20, 0.18), 0, 0.34, -1.82);
  P.add('turretDark', box(0.98, 0.02, 0.38), 0, 0.63, -1.61);
  // r4: the RIGHT waist shoulder splits at the ref's own plan staircase —
  // inner (to x 0.745) keeps the -1.92 rear, the 0.74..0.90 band steps to
  // -1.78 (the r2 step box); LEFT stays deep per the ref's loaded flank.
  P.add('turret', box(0.30, 0.36, 0.55), -0.755, 0.42, -1.44);
  P.add('turret', box(0.14, 0.36, 0.55), 0.675, 0.42, -1.44);
  for (const s of [-1, 1]) {
    // plan step shoulder: the ref's -1.92 mid-step at |x| 0.54..0.62
    P.add('turret', box(0.09, 0.30, 0.20), s * 0.575, 0.42, -1.62);
  }
  // push-2 r1: the ref's LEFT flank carries a tall stowage load on the
  // basket front — front_whole reads a 2.386..2.416 band across x -1.08..
  // -1.40 (we sat 0.10-0.16 low) and side_turret holds 2.371 over world
  // z -0.95..-1.21 then FALLS to 2.24 by -1.47: one kit block, ending
  // 19 mm clear of the -1.279 side column boundary (§C).
  P.add('turretCloth', box(0.37, 0.32, 0.31), -1.235, 0.625, -0.905);
  // right bin-end bracket (ref plan col x 0.99 rear -1.46) — widened
  // inboard to stay seated on the narrowed rear-roof wall
  P.add('turret', box(0.26, 0.30, 0.26), 0.93, 0.42, -1.13);
  // Long turret side bins (plan: front 2.30 right / 2.00 left per the
  // print's own plan columns, segmented for station caps). NO-STAIRCASES:
  // each course front ends in a RAKED nose wedge following the ref's own
  // rising side line (2.11@2.42 -> 2.24@2.03 world) instead of a flat
  // overhung box end; flat tops sit at the ref's 2.24 course line (0.635
  // local — the old 0.66 read 0.03 proud) and the dark lid strips are
  // FLUSH (they rode 0.02 proud as a second micro-step).
  const binNose = (x0, x1, zr, zf) => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    P.add('turret', slab(
      [lo, 0.195, zf], [hi, 0.195, zf], [hi, 0.195, zr], [lo, 0.195, zr],
      [lo, 0.48, zf], [hi, 0.48, zf], [hi, 0.635, zr], [lo, 0.635, zr]));
  };
  segBoxZ(P, 'turret', 0.21, 0.44, 2.75, -1.205, 0.415, 0.585);
  // push-2: bin noses re-read from the LIVE plan_turret cols — the ref's
  // right nose is a RAKED plan front falling outboard (2.465@1.12 ->
  // 2.4@1.25 -> 2.303@1.38), the left runs to 2.368@-1.09; the r-stairs
  // 2.30/2.26 fronts sat 0.10-0.16 short on the inner columns.
  // (nose x0 stays -1.31: an -1.29 edge sat 7 mm INSIDE the -1.283 plan
  // band — AA flicker collapsed the whole -1.348 column, -0.49)
  binNose(-1.31, -1.10, 1.96, 2.52);
  P.add('turretDark', box(0.206, 0.02, 2.65), -1.205, 0.633, 0.585);
  // (r3: outer bin's full-height course ends world -1.39 — its rear 0.26
  // ran the -1.47/-1.60 side cols at 2.26 over the ref's falling 2.21
  // line; a lower 2.20 cap carries the plan rear to -1.62)
  segBoxZ(P, 'turret', 0.17, 0.44, 2.86, -1.395, 0.415, 0.24);
  P.add('turretDark', box(0.166, 0.02, 2.78), -1.395, 0.633, 0.23);
  P.add('turret', box(0.17, 0.38, 0.23), -1.395, 0.385, -1.305);
  // (r2: right bin outer edge 1.425 -> 1.375 — it partial-lit the 1.411
  // front col 2.25 over the ref's falling 2.17 line)
  segBoxZ(P, 'turret', 0.27, 0.44, 3.25, 1.24, 0.415, 0.425);
  // r10 (shaded-parity r8 O6c — right crown-course pair, rearright Δ-7.3°
  // "proc level where the ref falls"): the fresh workorder reads the ref
  // right-cheek course HOLDING 2.241 out to the 2.034 col and THEN falling
  // (2.176@2.164, 2.143@2.294) where our r-noses started their rake at
  // local 2.05 (world 1.85) — cols 1.904/2.034 read -0.033/-0.065 under.
  // Hold-then-fall: full-height hold boxes carry the 0.635 course to local
  // 2.23 (world 2.03 = the ref's own break), the nose rakes steepen to the
  // SAME zf (plan fronts untouched — the raked-plan-front read is plan
  // truth). Predicted col moves: 1.904 -0.033 -> +0.014, 2.034 -0.065 ->
  // +0.014, 2.164 -0.005 -> +0.027 (the one honest regression), 2.294 flat.
  P.add('turret', box(0.12, 0.44, 0.18), 1.22, 0.415, 2.14);
  P.add('turret', box(0.09, 0.44, 0.18), 1.325, 0.415, 2.14);
  binNose(1.16, 1.28, 2.23, 2.63);
  binNose(1.28, 1.37, 2.23, 2.50);
  P.add('turretDark', box(0.266, 0.02, 3.15), 1.24, 0.633, 0.425);
  // Outer skirt-top bin tier (the print's 2.06-2.17 tops at x 1.46..1.60;
  // plan_turret: the RIGHT tier runs world 0.0..2.01 — the old rear -0.36
  // overhang broke the x 1.64 plan column by 0.36).
  segBoxZ(P, 'turret', 0.21, 0.42, 1.57, -1.545, 0.33, 0.045);
  P.add('turretDark', box(0.206, 0.02, 1.51), -1.545, 0.549, 0.045);
  // push-2: the RIGHT tier is a LOWER course than the left (front_whole:
  // ref right cols 1.49..1.648 fall 2.148 -> 2.02 where the left holds
  // 2.297 — 'the 2.28 posts' claim was left-side truth only; our right
  // posts+lid painted 5 columns +0.07..+0.15).
  segBoxZ(P, 'turret', 0.21, 0.37, 2.00, 1.545, 0.305, 1.20);
  P.add('turretDark', box(0.206, 0.02, 1.90), 1.545, 0.499, 1.20);
  // tier end posts: LEFT at the ref's 2.28 front tops, RIGHT at its own
  // lower 2.15 line.
  for (const [px, pz, py] of [[-1.545, -0.71, 0.51], [-1.545, 0.78, 0.51],
    [1.545, 0.25, 0.38], [1.545, 2.15, 0.38]]) {
    P.add('turret', box(0.21, 0.30, 0.10), px, py, pz);
  }
  // notched tier tail: the ref's inner tier edge runs on to world -0.36
  // at x<=1.56 while the outer face stops at 0.0 (plan cols 1.51/1.64)
  P.add('turret', box(0.12, 0.42, 0.36), 1.50, 0.33, 0.02);
  // r10b (uk round 5 — the "boxy cheek masses / clean-box tiling" quarter
  // read): flush-tangent 45-deg chamfer strips along the EXPOSED long top
  // arrises (the c5 r9 grammar — each rolled diamond centered t/sqrt2
  // inside BOTH faces, vertices ON the planes: tangent-line contact, zero
  // silhouette by construction; camo 'turret' so the ease reads as the
  // casting/bin edge rounding, not trim). Seats: L outer bin (-1.48 face,
  // 0.635 top — lower vertex 0.567 clears the 0.549 tier top), R bin
  // (1.375/0.635), both outer tiers, the crown plateau's left arris and
  // the low loader-roof's right arris (§B1 crown asymmetry kept).
  P.add('turret', box(0.048, 0.048, 2.70), -1.4461, 0.6011, 0.24, 0, 0, Math.PI / 4);
  P.add('turret', box(0.048, 0.048, 3.10), 1.3411, 0.6011, 0.425, 0, 0, Math.PI / 4);
  P.add('turret', box(0.048, 0.048, 1.50), -1.6161, 0.5061, 0.045, 0, 0, Math.PI / 4);
  P.add('turret', box(0.048, 0.048, 1.55), 1.6161, 0.4561, 1.20, 0, 0, Math.PI / 4);
  P.add('turret', box(0.048, 0.048, 0.95), -0.6661, 0.8441, 0.315, 0, 0, Math.PI / 4);
  P.add('turret', box(0.048, 0.048, 0.95), 0.8961, 0.6711, 0.315, 0, 0, Math.PI / 4);
  // REAR BASKET (live-rig turret): stepped tops 2.165 -> 2.41 -> 2.24
  // across z -2.16..-1.32 — the ref's own REAL course lines (kept).
  // push-2 r1 plan re-cut (workorder plan_turret): the ref basket rear
  // STAIRCASES in plan — |x|<=0.44 to -2.11, ~0.48..0.79 to -1.92/-2.05,
  // 0.80..0.93 to -1.757 (R) / -1.85 (L), 0.93+ bracket only (-1.46).
  // The old 1.84-wide hump/mid boxes painted the ±0.861 cols to -1.92
  // (+0.16) and the ±0.53 tail edge partial-lit the ±0.601 cols (+0.20).
  // Left wall + cloth extend to the ref's -1.724 line.
  // (r2: hump/mid boxes ±0.74 — the ±0.775 edges sat INSIDE the ±0.777
  // front-col bands and partial-lit them 2.416 over the ref's 2.30 cheek
  // line, §C; the dark rim tucks 5 mm under the hump crown so it stops
  // partial-lighting the -1.603 side col.)
  // (r4: the ref tail is plan-ASYMMETRIC — left rear -2.114, right -2.049)
  P.add('turret', box(0.48, 0.33, 0.23), -0.24, 0.38, -1.815);
  P.add('turret', box(0.48, 0.33, 0.19), 0.24, 0.38, -1.795);
  P.add('turret', box(1.48, 0.38, 0.30), -0.01, 0.41, -1.60);
  P.add('turret', box(0.26, 0.38, 0.37), -1.29, 0.41, -1.36);
  P.add('turret', box(1.48, 0.57, 0.16), -0.01, 0.505, -1.60);
  P.add('turret', box(1.48, 0.40, 0.32), -0.01, 0.42, -1.275);
  P.add('turretDark', box(1.48, 0.02, 0.18), 0, 0.775, -1.59);
  P.add('turret', box(0.13, 0.36, 0.26), -1.485, 0.405, -1.28);
  P.add('turretCloth', box(1.7, 0.14, 0.54), -0.2, 0.51, -1.30);
  // plan shoulder steps (ref rear cols): right 0.74..0.90 to -1.78,
  // left 0.74..0.99 to -1.854 (the ref loads its left flank deeper).
  P.add('turret', box(0.16, 0.30, 0.28), 0.82, 0.40, -1.44);
  P.add('turret', box(0.25, 0.30, 0.35), -0.865, 0.40, -1.479);
  // tail-box kit lump (ref side col -1.993 reads 2.306 over our bare
  // 2.165 course; the -2.123 col stays on the 2.14 line).
  P.add('turretCloth', box(0.60, 0.14, 0.12), 0, 0.615, -1.77);
  // Kneed whip antennas: thin masts to the print's 2.975 spikes at
  // (x -1.37, z -1.08) and (x +0.95, z -0.82), potted on the basket/bins.
  // (pots shortened: the old 0.30-tall pots hung to 1.585 world INSIDE the
  // hull body — invisible in renders but painting the TURRET mask 0.15-0.19
  // below the ref's 1.77-1.79 bottoms on four side columns)
  for (const [ax, az] of [[-1.375, -0.88], [0.95, -0.62]]) {
    P.add('turret', cylY(0.05, 0.065, 0.13, 8), ax, 0.225, az);
    P.add('turret', box(0.024, 1.10, 0.07), ax, 0.775, az);
    P.add('turret', box(0.03, 0.06, 0.076), ax, 1.30, az);
  }
  // ROOF FURNITURE on the casting: commander sight (2.925 — the p95 anchor
  // under the published 2.95), left roof block 2.79 with a 2.86 sight-head
  // cap (ref front x -0.61..-0.89 reads 2.861; side holds 2.79@z1.0 /
  // 2.86@z1.13), roof step 2.795, TOGS body 2.86 + head 2.985.
  // push-2: sight x-span 0.26 (the -0.565 edge partial-lit the -0.569
  // front col +0.06); glass strip FLUSH under the ref's 2.79 falling line
  // (it rode 0.09 proud on the 0.735 side col).
  // r10 (shaded-parity r8 O6a — forward sight-hood top rake, close-roof
  // Δ-14.7° ref 37.7 vs proc 23.0): the ref hood wears a raked VISOR falling
  // to its window; our flat box read shallow. Column-safe split (workorder
  // re-pulled this round): body depth 0.46 -> 0.36 (rear face 0.42 kept) +
  // a visor wedge z 0.78..0.86 raking 1.325 -> 1.253 with a 1.19 soffit over
  // the window recess. The wedge END at 0.86 stays OUT of the 0.735-col
  // window (local 0.87..1.00) so that col keeps its current read, and the
  // 0.605 col still reads 1.325 from the body's 0.74..0.78 coverage — ZERO
  // side/front/plan column moves by construction (plan front stays the 0.925
  // glass plane). The recess under the soffit is backed by the body's new
  // 0.78 front face (§B2 — no sky).
  P.add('turret', box(0.26, 0.48, 0.36), -0.40, 1.085, 0.60);
  P.add('turret', slab(
    [-0.53, 1.19, 0.86], [-0.27, 1.19, 0.86], [-0.27, 1.19, 0.78], [-0.53, 1.19, 0.78],
    [-0.53, 1.253, 0.86], [-0.27, 1.253, 0.86], [-0.27, 1.325, 0.78], [-0.53, 1.325, 0.78]));
  // glass tucked under the visor lip (rear face embeds 10 mm into the visor
  // front — the old 0.91 seat floated 50 mm ahead once the body face moved;
  // plan-free: the nose plane owns every plan column this band touches)
  P.add('turretGlass', box(0.21, 0.05, 0.03), -0.40, 1.145, 0.865);
  P.add('turret', box(0.33, 0.49, 0.50), -0.725, 0.92, 1.25);
  // r8 (tone round O4a): sight cap + NBC pack -> 'turretDetail' (same
  // sand-blotch class as the TOGS rebucket above; masks identical).
  P.add('turretDetail', box(0.33, 0.14, 0.10), -0.725, 1.165, 1.325);
  // NBC pack on the left rear roof (ref: 2.566 at the -0.30 col, 2.533 at
  // -0.43 — 0.885 splits the pair)
  P.add('turretDetail', box(0.40, 0.10, 0.36), -0.45, 0.885, -0.10);
  P.add('turret', box(0.12, 0.31, 0.40), -1.0, 0.735, 1.25);
  P.add('turret', box(0.24, 0.31, 0.34), -0.13, 1.02, 0.15);
  // (r3: TOGS body TAPERS — ref front cols read 2.27 at x 0.82 but 2.36
  // at 1.02; a flat 2.355 body overpainted the inner col +0.09)
  // r8 (tone round O4a): TOGS body+head rebucketed 'turret' -> 'turretDetail'
  // — the camo box-UV landed the whole barbette on one pale-sand blotch
  // (front rect rgb 61,61,47, r=g, +12L over the ref's g-dominant face ctx);
  // the scheme-detail olive is the ref's own fitting read. Same geometry,
  // same masks — material slot only.
  P.add('turretDetail', box(0.15, 0.18, 0.42), 0.785, 0.57, 1.30);
  P.add('turretDetail', box(0.15, 0.25, 0.42), 0.935, 0.61, 1.30);
  // (head mast runs INTO the body top — the +0.03 head raise floated it
  // 0.065 clear and minted a yaw-90 mask island, the round's one floater)
  P.add('turretDetail', box(0.10, 0.68, 0.10), 0.93, 1.025, 1.08);
  P.add('turretGlass', box(0.22, 0.12, 0.03), 0.86, 0.60, 1.515);
  // Deep trunnion/breech mass the oracle carries in its turret node
  // (push-2: bottom to the ref's LIVE 0.942 band across world z 0.09..1.64
  // — the old 1.00 floor sat +0.065 high on TWELVE side columns).
  P.add('turretDark', box(1.55, 0.57, 1.58), 0, -0.40, 1.09);
  // Ring collar: the ref's underside STEPS behind the trunnion mass —
  // 1.59 at the -0.30 world col, 1.46 ahead of it (the old one-piece
  // 1.44 floor hung 0.16 into the ring gap on the rear col).
  P.add('turret', box(1.3, 0.21, 0.11), 0, 0.075, -0.095);
  P.add('turret', box(1.3, 0.34, 0.34), 0, 0.01, 0.155);
  // no-air r1 (§5.35 item 15 + §5.18, uk see-through round): the under-skirt
  // band read through at turret overhang — the turret-only side views
  // enclosed 1206px of sky between the trunnion-mass top (1.505 world), the
  // ring-collar rear (z 0.125), the gun cradle, and the casting/skirt-tier
  // undersides (1.67/1.74): the volume between breech mass and casting belly
  // was never built. The ref carries it SOLID (its turret-node trunnion band
  // bottoms 0.942 across world z 0.09..1.64; front_turret bot 0.949 at
  // |x| 0.51-0.85). One closed course continues the breech mass up to the
  // casting: x/z coincide with the trunnion box (plan-interior under the
  // face-slab belly), bottom embeds 15 mm into its top, top rides 1.75
  // world — 10 mm past the outer skirt-tier underside (1.74) and 80 mm into
  // the face-slab volume; the z 0.10..0.125 collar overlap chains the rear
  // (§B2 chain at every face).
  P.add('turretDark', box(1.55, 0.26, 1.58), 0, 0, 1.09);
  liftEye(P, 'turretDetail', -0.95, 0.62, 0.55, 0.4);
  liftEye(P, 'turretDetail', 0.95, 0.62, 0.55, -0.4);
  // 2x5 smoke discharger banks on both cheeks (the print's 2.40-2.42
  // face bumps at z 0.9..1.3).
  // (banks lowered 0.18: the ref's front-view discharger tops read 2.15-
  // 2.19 at the ±1.3-1.5 columns; ours rode at 2.37)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.06, 0.15, 0.34), s * 1.10, 0.40, 1.30, 0, s * 0.55, 0);
    smokeCluster(P, s * 1.26, 0.50, 1.42, 5, s * 0.95, 0.62);
    smokeCluster(P, s * 1.23, 0.37, 1.46, 5, s * 0.95, 0.62);
  }
  // Loader hatch ring on the commander plateau + gunner cowl RE-SEATED on
  // the low loader roof (push-2 §B1: the cowl rode the old symmetric-crown
  // height — every fixture re-derives from the surface it sits on).
  P.add('turretDetail', cylY(0.2, 0.22, 0.05, 14), -0.58, 0.855, -0.05);
  P.add('turret', box(0.30, 0.09, 0.26), 0.35, 0.705, 0.55);
  P.add('turretGlass', box(0.22, 0.05, 0.03), 0.35, 0.725, 0.69);
  // Commander's GPMG (§B3 mandatory MG — FITTINGS census).
  // r8 (tone round O5a): re-posed OUT of the basket band — the push-2 stow
  // at (0.35, 0.46, -1.22) yaw -2.55 censused but never read as a weapon in
  // any of the 14 views (r7); the r8 crown-line pose at (-0.42, 0.56, -0.58)
  // censused + painted the plan line but stayed FAINT (two-tone pale caps on
  // the pale crown) and hid under the plateau cover from close-roof.
  // r10 (shaded-parity r8 O3 — the MG LEGIBLE READ order): loader's pintle
  // station BESIDE the hatch ring on the 0.66 mid-roof shelf, INSIDE the
  // plateau cover's shadow exactly as the verdict stages it: z-envelope
  // 0.06..0.77 sits within the plateau band (-0.19..0.82) whose side
  // ceilings are the sight/hatch cols (2.76-2.92 world; receiver top 0.861
  // = 2.481 rides 0.28 under the LOWEST), x-envelope -0.876..-0.734 sits
  // inside the left roof-block front band (-0.89..-0.56, tops 2.79-2.86;
  // receiver 2.48 far below) — all three ortho masks interior BY COLUMN
  // TABLE (side_turret cols 0.215..0.735 re-read from the fresh workorder
  // this round). Visibility staged by ray-check against the perspective
  // hero camera: from hero-toptilt (0.55,1.35,-0.75) the full receiver +
  // barrel clear the plateau top edge by >=0.12 and pass 0.10 rear of the
  // sight's z-band; from close-roof the top cap + ridge line peek over the
  // plateau (the ordered view pair needs ONE unambiguous read — toptilt
  // carries it, top/plan keep the dark line). tone 'dark' per MG PHYSICS
  // pale-deck inversion (the c5 O10a precedent); scale 0.92 for the
  // receiver-MASS read (top 0.861 keeps 17 mm under the 0.878 plateau line
  // so the close-roof peek never re-tops a side column).
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', elev: 0.06, scale: 0.92, seed: 7 });
    mg.position.set(-0.77, 0.66, 0.16);
    mg.rotation.y = -0.06;
    P.turretG.add(mg);
  }
  // r10b (uk round 5 — the rear-view MG presentation order): AMMO CLUSTER
  // beside the MAG inside the r10-PROVEN envelope (x -0.876..-0.734, tops
  // <= 0.861, z 0.06..0.77 — every ortho mask interior by the same column
  // table). From dead-rear the r10 receiver already peeks 2.40..2.48 over
  // the rear-roof face line at x -0.77; the cans+tray widen that read into
  // a legible weapon-station cluster (close-roof/toptilt bulk up too).
  // (The full crown-MG rear presentation is CERTIFIED UNREACHABLE this
  // round — packet: every above-2.498 rear-projection lane is priced; the
  // §C 0.4 pintle allowance is un-spendable at whole 90.1.)
  P.add('turretDark', box(0.10, 0.12, 0.16), -0.826, 0.72, 0.28);
  P.add('turretDetail', box(0.09, 0.10, 0.14), -0.80, 0.71, 0.52);
  P.add('turretDark', box(0.07, 0.028, 0.10), -0.792, 0.795, 0.24);
  // r10b ROOF DRESSING (the close-roof "large empty camo fields" order):
  // tone-first flush detail — every piece <= 6 mm proud of its host plane
  // and strictly toward the ref's own higher line where the host IS a
  // measured line (right roof 2.325 vs ref 2.336-2.396; NBC 2.555 vs ref
  // 2.566): loader-hatch arc + lid seam + periscope blocks around the
  // ring; right-roof vent disc + periscope ports; plateau/NBC seam strips.
  P.add('turretDark', xform(new THREE.TorusGeometry(0.145, 0.011, 8, 18, 2.0), 0, 0, 0, Math.PI / 2, 0, 0),
    -0.58, 0.869, -0.05, 0, -0.7, 0);
  P.add('turretDetail', cylY(0.155, 0.155, 0.006), -0.58, 0.8755, -0.05);
  for (const [px, pz] of [[-0.48, 0.19], [-0.33, -0.02], [-0.62, 0.185]]) {
    P.add('turretDark', box(0.07, 0.010, 0.05), px, 0.873, pz);
  }
  P.add('turretDetail', cylY(0.055, 0.055, 0.006), 0.42, 0.708, 0.10);
  P.add('turretDark', box(0.09, 0.006, 0.06), 0.62, 0.708, 0.30);
  P.add('turretDark', box(0.07, 0.006, 0.05), 0.16, 0.708, 0.20);
  P.add('turretDark', box(0.016, 0.004, 0.98), -0.175, 0.8795, 0.315);
  P.add('turretDark', box(0.66, 0.004, 0.014), -0.35, 0.8795, 0.10);
  P.add('turretDark', box(0.30, 0.005, 0.05), -0.45, 0.9375, -0.02);
  P.add('turretDark', box(0.30, 0.005, 0.05), -0.45, 0.9375, -0.18);
  // Canvas dust-cover wedge over the low gun root + L11A5 with the print's
  // fat armored collar (contour r 0.42-0.50 at z 0.75..1.75) and wide-flat
  // thermal sleeve sections.
  P.add('turretCloth', box(0.55, 0.22, 0.36), 0, 0.42, 2.42, -0.35, 0, 0);
  // r8 (tone round O4b): the two root/collar masses -> gunMountDark — their
  // camo box-UV landed on one warm-grey blotch and read as flat pale boxes
  // at the gun root (front rect 59.6 vs ref glacis 46.8; the fl-togs crop's
  // grey twin-box). The ref root reads uniform dark olive — gunmetal slot.
  // Same gunG frame, same masks.
  P.addGunExtraDark(box(0.86, 0.55, 0.85), 0, -0.02, 0.55);
  P.addGunExtraDark(box(0.42, 0.235, 0.55), 0, 0, 1.63);
  // push-2: sleeve sections ride +0.02 (ref tube-top cols 1.981 vs our
  // 1.96 print) — offset only, the elevation pivot/cradle stay put.
  // r4: the FORWARD sleeve is segmented like the real L11 thermal sleeve —
  // the ref alternates 1.981 ridge cols with 1.916 valleys; a flat 1.975
  // run read +0.03/-0.03 across six columns. Base at the valley line,
  // three ridge rings at the ref's own ridge columns.
  // r10 (shaded-parity r8 O6b — collar->sleeve upper line, the close-roof
  // Δ+14/+11.9/-7.4/+8.4 family at z 3.55..4.80): the workorder shows BOTH
  // silhouettes FLAT-MATCHED at 1.949 across that run — the flags are the
  // box top-ARRIS shading lines (ortho-projected box corners) vs the ref's
  // round fat-sleeve tangents, an interior-read class. Fix is mask-neutral
  // octagonalization: each box keeps its exact top plane (side line
  // identical — side takes max over x), exact ±x at lower y (plan identical)
  // and exact z ends; a trapezoid cap replaces the sharp corner pair so the
  // oblique views read a faceted-round shoulder (front cols only ROUND
  // toward the ref's own cylinder falloff). Collar + junction ring + shroud.
  P.addGunExtra(box(0.24, 0.19, 2.50), 0, 0.005, 3.10);
  // r10b (uk round 5 — the close-roof Δ+14/+11.9 collar->sleeve family):
  // the r10 octagonal caps kept FLAT top planes, and from the tilted views
  // the flat-top arris is the fitted line (ref presents a round sleeve's
  // falling tangents at the same matched silhouette). CAMBER the caps:
  // each flat top splits into two planar roof quads meeting at a center
  // RIDGE at the exact old top height — side rows read max-over-x = the
  // ridge (byte-equal line), plan keeps the bottom-quad extents, front is
  // turret-interior at these x. The oblique/tilt views now read falling
  // shading tangents instead of a level plane edge.
  P.addGunExtra(slab(
    [-0.12, 0.10, 4.35], [0, 0.10, 4.35], [0, 0.10, 1.85], [-0.12, 0.10, 1.85],
    [-0.085, 0.112, 4.35], [0, 0.13, 4.35], [0, 0.13, 1.85], [-0.085, 0.112, 1.85]), 0, 0, 0);
  P.addGunExtra(slab(
    [0, 0.10, 4.35], [0.12, 0.10, 4.35], [0.12, 0.10, 1.85], [0, 0.10, 1.85],
    [0, 0.13, 4.35], [0.085, 0.112, 4.35], [0.085, 0.112, 1.85], [0, 0.13, 1.85]), 0, 0, 0);
  P.addGunExtra(box(0.22, 0.15, 2.20), 0, -0.05, 5.30);
  P.addGunExtra(slab(
    [-0.11, 0.025, 6.40], [0, 0.025, 6.40], [0, 0.025, 4.20], [-0.11, 0.025, 4.20],
    [-0.11, 0.028, 6.40], [0, 0.085, 6.40], [0, 0.085, 4.20], [-0.11, 0.028, 4.20]), 0, 0, 0);
  P.addGunExtra(slab(
    [0, 0.025, 6.40], [0.11, 0.025, 6.40], [0.11, 0.025, 4.20], [0, 0.025, 4.20],
    [0, 0.085, 6.40], [0.11, 0.028, 6.40], [0.11, 0.028, 4.20], [0, 0.085, 4.20]), 0, 0, 0);
  for (const rz of [4.73, 5.25, 6.60]) {
    P.addGunExtra(box(0.23, 0.235, 0.16), 0, 0.02, rz);
  }
  // MRS/wiper band 0.36 -> 0.24 wide: at ±0.18 its corner painted the
  // x 0.21 plan_turret column to world 4.83 where the ref reads 3.76 —
  // r3's "one stubborn plan_turret column" located. ±0.12 keeps the §C
  // 15 mm AA clearance off the 0.146 column boundary (±0.14 still bled).
  P.addGunExtraDark(box(0.24, 0.23, 0.06), 0, 0, 4.38);
  // Sleeve-end shroud, seated 15 mm LEFT like the print's own gun: the ref
  // plan carries x<=-0.146 sleeve coverage out to z 5.10 (col -0.179) but
  // nothing right of +0.146 (col +0.211) — a centered shroud can't do both.
  P.addGunExtra(box(0.29, 0.175, 0.48), -0.015, -0.0175, 4.44);
  P.addGunExtra(slab(
    [-0.160, 0.07, 4.68], [-0.015, 0.07, 4.68], [-0.015, 0.07, 4.20], [-0.160, 0.07, 4.20],
    [-0.125, 0.092, 4.68], [-0.015, 0.105, 4.68], [-0.015, 0.105, 4.20], [-0.125, 0.092, 4.20]), 0, 0, 0);
  P.addGunExtra(slab(
    [-0.015, 0.07, 4.68], [0.130, 0.07, 4.68], [0.130, 0.07, 4.20], [-0.015, 0.07, 4.20],
    [-0.015, 0.105, 4.68], [0.095, 0.092, 4.68], [0.095, 0.092, 4.20], [-0.015, 0.105, 4.20]), 0, 0, 0);
  // Thermal-sleeve junction ring (the ref's 2.08-2.11 gun-top band at the
  // 2.43..2.67 columns — push-2 raised 0.04 to the live cols).
  P.addGunExtra(box(0.30, 0.26, 0.24), 0, 0.08, 2.13);
  P.addGunExtra(slab(
    [-0.15, 0.21, 2.25], [0, 0.21, 2.25], [0, 0.21, 2.01], [-0.15, 0.21, 2.01],
    [-0.105, 0.235, 2.25], [0, 0.25, 2.25], [0, 0.25, 2.01], [-0.105, 0.235, 2.01]), 0, 0, 0);
  P.addGunExtra(slab(
    [0, 0.21, 2.25], [0.15, 0.21, 2.25], [0.15, 0.21, 2.01], [0, 0.21, 2.01],
    [0, 0.25, 2.25], [0.105, 0.235, 2.25], [0.105, 0.235, 2.01], [0, 0.25, 2.01]), 0, 0, 0);
  // r2: cradle underside re-cut as the ref's own FALLING line (side
  // bottoms 1.429@3.333 -> 1.234@3.723 — the flat 1.30 belly read -0.13
  // rear / +0.065 front of it).
  P.addGunExtraDark(box(1.01, 0.30, 0.22), 0.135, -0.28, 3.03);
  P.addGunExtraDark(box(1.01, 0.36, 0.22), 0.135, -0.42, 3.25);
  // Published 11.50 overall: tail -4.16 -> muzzle +7.34.
  buildGun(P, { len: 6.99, r: 0.095, sleeve: false, evac: 0, collar: false, baseR: 0.15 });
  muzzleBore(P, { len: 6.99, r: 0.095 });                     // §B3.1 (shadow-named, 3fca39b)
  P.addGunExtra(box(0.24, 0.24, 0.62), 0, 0, 3.99);
  // push-2 MRS: the ref carries muzzle mass across BOTH 7.10/7.23 side
  // cols at 1.981 (our thin 0.108 ring at 6.62 left the last col on the
  // bare 0.095 tube, -0.065) — collar z-stretched to the tip band and
  // seated +0.02. r2: radius stays 0.108 — an r 0.13 silhouette sat 5 mm
  // INSIDE the turret-plan row's 0.125 column boundary and lit it to the
  // muzzle (the r-stairs MRS §C lesson, re-learned against the TURRET
  // row's own grid).
  P.add('gun', cylZ(0.108, 0.18, 12), 0, 0.02, 6.75);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.28, 0.45, 0.9], Math.PI / 2);
  // ------------------------------------------------------------------
  // r8 COMBINED TONE ROUND (shaded-parity r7 orders O1a/O2/O4/O5b-d + SHOULD)
  // ------------------------------------------------------------------
  // O5c — smoke banks read as solid crates: dark tube-face caps resolve the
  // 2x5 clusters as tube rows (no geometry move — caps sit inside each
  // tube's own face circle; front rows read y-intervals so the +6 mm z is
  // interior, and the banks are plan-interior behind the 2.52/2.63 bin
  // noses). Placement replicates smokeCluster's own transform math.
  for (const s of [-1, 1]) {
    for (const [bx, by, bz] of [[s * 1.26, 0.50, 1.42], [s * 1.23, 0.37, 1.46]]) {
      const yaw = s * 0.95;
      for (let k = 0; k < 5; k++) {
        const f = k - 2;
        const a = yaw + f * (0.62 / 5);
        const tx = bx + Math.cos(yaw) * f * 0.095, tz = bz - Math.sin(yaw) * f * 0.095;
        // face center = tube center + 0.121 * (Euler XYZ (-0.5, a, 0) local +z)
        const dx = Math.sin(a), dy = Math.sin(0.5) * Math.cos(a), dz = Math.cos(0.5) * Math.cos(a);
        P.add('turretDark', cylZ(0.030, 0.006, 8), tx + 0.121 * dx, by + 0.121 * dy, tz + 0.121 * dz, -0.5, a, 0);
        // r10b (uk round 5 — the r8-O5c/verdict "smoke tube circles absent"
        // hold, c5 r9 O8 recipe): proud tube TIPS + dark bores give the
        // 2x5 clusters real circular mouths at 1x. Interior by construction:
        // tip max (x 1.53, y 0.589, z_local 1.60) rides under the tier
        // posts' 0.66 front line, inside the tiers' 1.985 plan front and
        // the bins' 2.255 side line (§C margins re-checked this round).
        P.add('turretDetail', cylZ(0.014, 0.032, 8), tx + 0.138 * dx, by + 0.138 * dy, tz + 0.138 * dz, -0.5, a, 0);
        P.add('turretDark', cylZ(0.011, 0.005, 8), tx + 0.156 * dx, by + 0.156 * dy, tz + 0.156 * dz, -0.5, a, 0);
      }
    }
  }
  // O5b — bustle basketry tone split: dark strap lines on the stack so it
  // stops reading as clean crates. All faces are silhouette-interior (hump
  // rear-face straps sit in the hump's own side column under its 0.79 top;
  // cloth straps inset 20 mm under the 0.62 mid-course line). A first cut
  // also ran top rails at ±0.746 y 0.79 over z -1.40..-1.70 local — side
  // rows read the MAX top over all x, and the rails re-topped the world
  // z -1.603 column +0.16 over the ref's 2.208 basket course (side_whole
  // 90.1 -> 89.5); withdrawn.
  for (const sx of [-0.62, -0.30, 0.28, 0.60]) {
    P.add('turretDark', box(0.035, 0.42, 0.012), sx, 0.50, -1.687);
  }
  for (const sx of [-0.60, -0.20, 0.25]) {
    P.add('turretDark', box(0.03, 0.03, 0.50), sx, 0.585, -1.30);
  }
  // r10 O5a (shaded-parity r8 — basket-on-rails, second basketry pass): the
  // strap set alone still read crates-with-straps. Rail-and-mesh grammar on
  // the stack faces: dark MESH panels seated on the tail-course rear faces
  // (each embeds 2 mm into its own box face — §B2 chain; the two humps carry
  // DIFFERENT rear planes -1.930/-1.890, so one panel each) with PALE rail
  // pairs + posts (turretDetail = the scheme-detail olive, reading light
  // over the dark mesh like the ref's rail basketry), plus an upper rail
  // pair on the mid-course face and a short pair on the right flank.
  // Mask-interior by column: panel/rail y-tops <= 0.51 (world 2.13 under the
  // 2.143 tail-col tops), plan z >= -1.944 inside the proc's own -2.08 tail
  // columns, right-flank rails add 7 mm x at painted-below-top heights only.
  {
    const meshMat = P.mats.detail.clone();
    meshMat.color.setHex(0x232719);
    meshMat.roughness = 0.96;
    meshMat.envMapIntensity = 0.10;
    meshMat.onBeforeCompile = vehicleAmbientFloorHook;
    meshMat.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    P.disposables.push(meshMat);
    for (const [px, pz] of [[-0.24, -1.933], [0.24, -1.893]]) {
      const pg = new THREE.BoxGeometry(0.46, 0.25, 0.010);
      const mesh = new THREE.Mesh(pg, meshMat);
      mesh.name = 'bustleMeshPanel';
      mesh.position.set(px, 0.385, pz);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.turretG.add(mesh);
      P.disposables.push(pg);
      for (const ry of [0.30, 0.47]) {
        P.add('turretDetail', box(0.44, 0.020, 0.007), px, ry, pz - 0.0065);
      }
      for (const rx of [-0.21, 0, 0.21]) {
        P.add('turretDetail', box(0.020, 0.25, 0.007), px + rx, 0.385, pz - 0.0065);
      }
    }
    for (const ry of [0.63, 0.74]) {
      P.add('turretDetail', box(1.44, 0.020, 0.007), 0, ry, -1.6825);
    }
    // (flank pair constrained to z local -1.55..-1.75 after a first cut at
    // z -1.45..-1.75 y 0.74 re-topped the world -1.603 col +0.13 over its
    // 2.24 course ceiling — the col-window span lesson, gate-verified)
    for (const ry of [0.60, 0.71]) {
      P.add('turretDetail', box(0.007, 0.018, 0.20), 0.7435, ry, -1.65);
    }
  }
  // O5d — the isolated ring fitting at the bustle right edge (view-rear
  // ~(1090,230)): the right lift eye read detached from the cheek — a base
  // pad bridges eye to casting (interior: under the 0.64 casting-top line
  // in its front column, embedded into the sloped face).
  P.add('turretDetail', box(0.08, 0.10, 0.10), 0.955, 0.60, 0.55);
  // SHOULD — plinth step wall dead-front highlight: a flush olive-detail
  // course strip along the split-face line calms the bright triangle
  // (geometry-correct §B1 wall; tone treatment only). Interior: top end
  // 0.87 under the 0.878 plateau line the left slab already paints, low
  // end 0.717 under the left face line at z 1.40.
  P.add('turretDetail', box(0.012, 0.06, 0.55), 0, 0.795, 1.13, -0.178, 0, 0);
  // O3 — mud flaps, all four corners: the ref hangs big pale-buff flap
  // panels at the track fronts/rears (front rects luma 64.3, rear 57.0);
  // proc carried only the outboard guard-tip stubs. Every legal z sits
  // BEHIND the wrap-shoe sweep (law-5: no free z between the sweep and the
  // 4.047 §C boundary), so the panels hang inside the wrap silhouette —
  // the pale plate reads through the comb gaps and around the arc bands
  // (the ref's own corner read once O2 calms the shoes). Mask-safe by
  // interval-interiority: every part sits y-inside its columns' existing
  // top/bottom intervals (front cols ground-run-owned; side cols in the
  // fenced padHug band read the wrap's own deeper bottoms; plan bracketed
  // by wing/panel). Clip-threaded: panels/bars sit between the shoe
  // annulus bands (front dz 0.27-0.29: y<=0.53 / >=1.07; rear dz 0.325:
  // y<=0.604 / >=0.996); stems ride OUTBOARD of the shoe x-band (1.535)
  // and bond to the wing belly / rear skirt panel (§B2 chain).
  {
    const flapMat = P.mats.rubber.clone();
    flapMat.color.setHex(0x4a453a);
    flapMat.roughness = 0.94;
    flapMat.envMapIntensity = 0.18;
    flapMat.onBeforeCompile = vehicleAmbientFloorHook;
    flapMat.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    P.disposables.push(flapMat);
    const flapBox = (w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, flapMat);
      mesh.name = 'mudFlapPanel';
      mesh.position.set(x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.hullG.add(mesh);
      P.disposables.push(geo);
    };
    for (const s of [-1, 1]) {
      // front corner (idler, sweep <= 4.065)
      flapBox(0.42, 0.42, 0.028, s * 1.30, 0.79, 3.90);         // panel
      flapBox(0.06, 0.04, 0.028, s * 1.53, 1.00, 3.90);         // bridge
      flapBox(0.02, 0.24, 0.028, s * 1.555, 1.10, 3.90);        // stem -> wing belly
      // rear corner (sprocket, sweep <= -3.095)
      flapBox(0.42, 0.34, 0.028, s * 1.30, 0.80, -2.965);       // panel
      flapBox(0.06, 0.05, 0.028, s * 1.53, 0.655, -2.965);      // bridge
      flapBox(0.04, 0.37, 0.028, s * 1.568, 0.815, -2.965);     // stem -> rear panel
    }
  }
  // r9 O4 (shaded-parity r8 — glacis-plan tone, gate-free): the LEFT glacis
  // half masks out near-black in plan (the evaluator's Δbot +1.133 @ x
  // -0.94 and the 89.2-vs-74.6 mask-cut edge are the instrument's echo of
  // the same tone hole). The c3 family recipe, both levers: (i) spec-level
  // bakeDirtDeckEq drops the up-face darkening term; (ii) a map-domain
  // dark-texel lift chained after the material's existing hook stack lifts
  // only linear albedo < ~0.04 (the ink/blotch floor class) toward soft
  // dark-olive — mid camo and the parity side tables untouched by
  // construction. Masks and geometry byte-identical (vertex colors +
  // fragment shader only).
  P.spec.visual.bakeDirtDeckEq = true;
  {
    const inkLift = (m, key) => {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, rdr) => {
        if (prev) prev(shader, rdr);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  float ukInkL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float ukLift = smoothstep(0.042, 0.007, ukInkL) * 0.0105;
  diffuseColor.rgb += ukLift * vec3(0.85, 1.0, 0.72);
}`);
      };
      m.customProgramCacheKey = () => key;
    };
    inkLift(P.mats.hull, 'veh-ambient-floor-v2+cr1ink');
  }
  // O1a/O2/O4 — family tone kit (wheels/pads/chain/band/glass/cloth) +
  // gear-air backers (render-only /shadow/ meshes: idler bay 3.06, mid bay
  // 0.30, sprocket bay -2.36 — threaded between the ground-ramp and
  // return-run sag envelopes, clear of wheel discs; §B4 voxel-verified).
  // Cycle-2 dial (ordered-class law): the first-cut olives overshot BRIGHT
  // (gear window med 59.1/p95 91 vs the ref band 54.8/66; plank 60 vs box
  // ctx 37.5; root boxes 63 warm-grey vs ref 47) — every hex re-sampled on
  // the render toward the ref class.
  // r9 (shaded-parity r8 O1a/c — the half-delivered disc read): disc faces
  // 0x3e4531 -> 0x323826 (window band mean 62.1/p95 73.2 vs the ordered
  // ~53/<=70; the §C overshoot note) and the wheel-ring split restores the
  // tire-annulus + bolt-dot read (ringHex 0x2b2f1f ~ the ordered 0x2c-class,
  // ukToneKit r8 — the r7 tireEmissive floor had merged the rings into the
  // disc luma).
  ukToneKit(P, {
    cloth: 0x262b1d, clothEnv: 0.05,
    dark: 0x282c22,
    wheelHex: 0x323826, wheelEnv: 0.13, drumHex: 0x373d2c, drumEnv: 0.14,
    ringHex: 0x2b2f1f, ringEnv: 0.10,
    padHex: 0x272b20, padEnv: 0.18, chainHex: 0x2f3427, chainEnv: 0.22,
    bandMul: [0.92, 0.98, 0.82], bandEnv: 0.08,
  });
  ukGearAirBackers(P, [
    [0.56, 0.60, 0.02, 1.24, 0.615, 3.06],
    [0.56, 0.46, 0.02, 1.24, 0.52, 0.30],
    [0.56, 0.62, 0.02, 1.24, 0.63, -2.36],
  ]);
  // r9 O1b + O2 (both render-only /shadow/ lane, zero gate price; clip-audit
  // envelopes threaded — the audit does NOT skip shadow meshes):
  // - O1b INTER-WHEEL SHADOW WALL: the six gear windows read flat pale
  //   panels with window p5 51.2 vs the ref's 25.8 dark-gap band — the three
  //   r8 backers are z-thin catch plates (edge-on from the side), so side
  //   rays between the discs land on the lit belt face (x 0.975, ~51L). An
  //   x-thin near-black wall 2 mm outboard of the belt face gives the discs
  //   the ref's inter-wheel shadow to read against. Envelope: x 0.977..0.993
  //   (rail inner edge 1.027 stays 34 mm clear), y 0.25..0.60 (under the
  //   top-run rail/horn dip band, above the ground-run pads), z -2.10..2.80
  //   (clear of both wrap annuli: sprocket wrap starts -2.22, approach ramp
  //   climbs from 2.90).
  // - O2 RAMP-BAY BACKER: close-roof's one genuine §B2 finding — a 141-px
  //   enclosed sky pocket at the bow ramp triangle ~(0.86, 0.34, 2.94), the
  //   bay past the last z-backer (3.06). A horizontal dark floor plate under
  //   the bow bay blocks the down-going exit rays BOTH sides. Envelope:
  //   x 0.60..1.00 (ground-run rail inner edge 1.027 clear by 27 mm),
  //   y 0.29..0.31 (ramp band at z<=3.15 stays under ~0.22 incl. rails),
  //   z 2.50..3.15.
  ukGearAirBackers(P, [
    [0.016, 0.35, 4.90, 0.985, 0.425, 0.35],
    [0.40, 0.02, 0.65, 0.80, 0.30, 2.825],
  ], 0x13170d);
  P.topY = 1.35;
}
// Profiles-class family map (merged by profiledProcedurals.js — the same
// interface every ./profiles family module exports).
export const CHALLENGER_PROFILES = {
  challenger1: { build: challenger1Build },
};

// ===========================================================================
// Modern-class residents (spec+build, the modern1.js pattern): challenger2 +
// challenger_3. Armor tables, spec rows, helpers and builders below moved
// byte-intact from modern1.js (§5.75).
// ===========================================================================

// Challenger 2 — §18.2 Dorchester L2: turret ~600/900, hull ~500/800,
// turret sides ~300/450, hull sides 100 + skirt.
function armorChallenger2() {
  const trkTop = 1.0, floor = 0.45, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // tank_models r7 (barge read): ring moved 0.5 forward — the CR2 turret
    // face sits ~2.4 m from the nose (was ~3.0); foredeck 36% -> ~29%.
    turretPivot: [0, 1.55, 0.35],
    gunPivot: [0, 0.35, 0.70],
    gunBarrel: { lengthM: 6.7, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.16, roofY, -4.16),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      chR('turret_cheek_R', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      chL('turret_cheek_L', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      par('mantlet_slot', 400, [-0.20, 0.10, 1.15], [0.20, 0.10, 1.15], [-0.20, 0.55, 1.08],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      sR('turret_side_R', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -2.0, 0.9, -2.0),
      rf('turret_roof', 50, 1.26, 0.92, -1.95, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.05], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, -1.15], [0.95, 1.57, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.5], [-0.1, 0.55, -1.0], true),
      mbox('optics', [0.3, 0.6, 0.3], [0.75, 0.95, 0.8], true),
      mbox('gun', [-0.18, 0.1, -0.5], [0.18, 0.6, 0.75], true),
      mbox('trackL', [-1.84, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.84, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, 0.0], [0.85, 0.7, 0.7], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.8, -0.1], true),
      cbox('loader', [-0.9, 0.0, -0.45], [-0.25, 0.75, 0.5], true),
    ],
  };
}
// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). CR2 hull family
// (EPSOM modular appliqué) under the NEW Rheinmetall turret: big flat cheek
// plates, Trophy APS side modules, RWS. 120 mm L55A1 SMOOTHBORE — the key
// identity change from CR2's rifled L30. RHAe = CR2-class base + modular
// uplift estimates (no public CR3 armor data; game-design baseline).
function armorChallenger3() {
  const trkTop = 1.0, floor = 0.42, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // Turret seat per the NC-quarantined 42manako print (§B8 proportion
    // truth): ring well forward (print autoPivot z +1.31 on its 7.96 hull),
    // face ~2.45 from the ring, the huge squared bustle running to -2.13.
    turretPivot: [0, 1.55, 1.20],
    // print bore line 1.76 (low trunnion — the CR3 turret sits low over
    // the gun); visible run 5.58 -> muzzle +7.335 = 11.50 overall.
    gunPivot: [0, 0.21, 0.55],
    gunBarrel: { lengthM: 5.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.13, roofY, -4.13),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      // the new wedge: near-vertical big cheek plates over jutting lower
      // armor wedges; modular EPSOM appliqué values
      chR('turret_cheek_R', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      chL('turret_cheek_L', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      par('mantlet_slot', 400, [-0.20, 0.08, 1.30], [0.20, 0.08, 1.30], [-0.20, 0.50, 1.22],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      // Trophy APS panels ride the sides (spaced modules)
      sR('trophy_R', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sL('trophy_L', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sR('turret_side_R', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -3.33, 0.85, -3.33),
      rf('turret_roof', 50, 1.40, 0.86, -3.3, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.0], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, 0.2], [0.95, 1.57, 2.2]),
      mbox('radio', [-0.6, 0.1, -2.6], [-0.1, 0.55, -2.1], true),
      mbox('optics', [0.3, 0.6, -0.3], [0.75, 0.95, 0.3], true),
      mbox('gun', [-0.18, 0.05, -0.6], [0.18, 0.55, 1.2], true),
      mbox('trackL', [-1.755, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.755, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.6], [0.85, 0.7, 0.1], true),
      cbox('commander', [0.25, 0.05, -1.45], [0.9, 0.8, -0.7], true),
      cbox('loader', [-0.9, 0.0, -1.05], [-0.25, 0.75, -0.1], true),
    ],
  };
}
// ---------------------------------------------------------------------------
// Specs (stats per roster §18.3-4; CR3 per its packet)
// ---------------------------------------------------------------------------
const CHALLENGER_SPECS = {
  challenger2: {
    id: 'challenger2', name: 'Challenger 2', nation: 'UK', era: 'modern', class: 'mbt',
    hp: 2450,
    enginePowerHp: 1200, weightTons: 62.5, topSpeedKmh: 59, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.8, baseAccuracy: 0.26, aimTimeS: 1.7,
      // Hydrogas suspension: best on-move gun handling in the roster (§18.3)
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('L27A1 CHARM-3', 'APFSDS', 120, apfsdsPens(600)[0], apfsdsPens(600)[1], 520, 1650, { pen2000Mm: apfsdsPens(600)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    // heightM is the sensor-inclusive datum (m26 precedent): 2.49 is the
    // turret roof; the gate p95 rides the pano sight (published 3.04).
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 3.04 },
    armor: armorChallenger2(),
    visual: {
      // British 2-tone: black stripe geometry over NATO green (§18.5)
      scheme: 'stripes', base: '#3f4a36', weather: '#48533e', patches: ['#1d1f1c'],
      marking: 'number', number: '22', trackWidthM: 0.65, camoScale: 0.45,
    },
  },
  challenger_3: {
    id: 'challenger_3', name: 'Challenger 3', nation: 'UK', era: 'modern', class: 'mbt',
    hp: 2500,
    // CV12-9A uprate path (1,500 hp program figure), 66 t combat
    enginePowerHp: 1500, weightTons: 66, topSpeedKmh: 60, reverseSpeedKmh: 20,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      // 120 mm L55A1 SMOOTHBORE — the identity change from CR2's rifled
      // L30: German KE family replaces CHARM/HESH.
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('DM73 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 530, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    // ANCHOR CAVEAT (packet): no official CR3 dims sheet — CR2 hull family
    // figures anchor the row (CR3 reuses the CR2 hull; L55A1 is L/55).
    // heightM is the sensor-inclusive datum (packet-filed 2.49 -> ~2.95:
    // RWS/pano/whips carry the p95 on both the print and the build).
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.95 },
    armor: armorChallenger3(),
    visual: {
      // British 2-tone black-over-green, distinct number from the CR2 (§H.3
      // variant variety: Trophy modules + RWS + smoothbore are the tells)
      scheme: 'stripes', base: '#414c38', weather: '#4a5540', patches: ['#1e201d'],
      marking: 'number', number: '30', trackWidthM: 0.65, camoScale: 0.48,
    },
  },};

// Register specs + model-source rows + garage roster ids (idempotent — vite
// HMR can re-evaluate this module; the modern1.js mechanism, moved with its
// residents). §5.75 ORDER GUARD: modern1.js registered challenger2 and
// challenger_3 BEFORE merkava4/leo2a6, and the garage carousel is ordered by
// ALL_TANK_IDS (main.js); modern1 always evaluates before this module (its
// helpers are imported above), so re-insert at the original slot instead of
// appending to the tail — a pure refactor must not reorder the roster.
for (const [id, spec] of Object.entries(CHALLENGER_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) {
    const at = ALL_TANK_IDS.indexOf('merkava4');
    if (at >= 0) ALL_TANK_IDS.splice(at, 0, id);
    else ALL_TANK_IDS.push(id);
  }
}

// ===========================================================================
// Builders
// ===========================================================================

// ---------------------------------------------------------------------------
// Challenger 2 — §18.5: long low horizontal roofline, shallow one-piece
// glacis + dozer-lip nose, big flat squared skirts, swept-back plan-arrow
// turret with mantlet-less slot, round cdr cupola RIGHT + pano sight,
// huge bustle bin/basket, fat sleeved L30 with MRS, 6 wheels + 4 rollers.
// ---------------------------------------------------------------------------
// BASE-21 helpers (challenger2 rebuild): call-time KIT access only (the
// module-cycle law — KIT initializes after this module evaluates).
// Mirror-safe slab (§C MISSING-SIDE law): s=-1 mirrors x AND swaps corner
// order so faces stay outward — never a bare x*s mirror.
const m1MirrX = ([x, y, z]) => [-x, y, z];
function mslab1(s, b0, b1, b2, b3, t0, t1, t2, t3) {
  const { slab } = KIT;
  return s > 0
    ? slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : slab(m1MirrX(b1), m1MirrX(b0), m1MirrX(b3), m1MirrX(b2), m1MirrX(t1), m1MirrX(t0), m1MirrX(t3), m1MirrX(t2));
}
// Bow tow hook: bracket block + dark pin.
function towHook2(P, x, y, z) {
  const { box, cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.12, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.01, z + 0.03);
}

// ---------------------------------------------------------------------------
// CH1-BASE TONE KIT (uk round 2026-08-07 — owner order: "challenger 2 and 3
// ... using the base of the challenger 1"). The challenger1 r8/r9 family
// tone recipes (uk.js ukToneKit + ukGearAirBackers) re-expressed for the
// modern1 challenger builders: per-instance material work only — the gate
// renders self-lit masks, so nothing here moves a curve or a mask (§C).
// uk.js is single-owner + hash-guarded (challenger1 dbe33204), so the
// mechanism is PORTED, not imported; hex keys follow the tankFactory
// buildRunningGear clone defaults (pads 0x171614 / chain 0x27251f) plus the
// builders' own 0x565c50 tireHex clone (re-keyed to the dark ring tone —
// the ch1 r8 WHEEL-RING GRAMMAR: pale discs read against DARK-drawn tire
// rings, never the inverse).
// ---------------------------------------------------------------------------
function ch1BaseToneKit(P, o = {}) {
  const rehook = (m) => {
    m.onBeforeCompile = vehicleAmbientFloorHook;
    m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    return m;
  };
  // Blue-glass calm (ch1 r8 O4c lineage): smoked dark-olive, b-r <= 0.
  P.mats.glass.color.setHex(o.glassHex ?? 0x3d443c);
  P.mats.glass.roughness = 0.48;
  P.mats.glass.metalness = 0.38;
  P.mats.glass.envMapIntensity = 0.3;
  if (o.cloth) {
    P.mats.canvasCloth.color.setHex(o.cloth);
    P.mats.canvasCloth.envMapIntensity = o.clothEnv ?? 0.10;
  }
  if (o.dark) P.mats.dark.color.setHex(o.dark);
  const wheelTone = rehook(P.mats.wheels.clone());
  wheelTone.color.setHex(o.wheelHex ?? 0x3e4531);
  wheelTone.envMapIntensity = o.wheelEnv ?? 0.13;
  const drumTone = rehook(P.mats.wheels.clone());
  drumTone.color.setHex(o.drumHex ?? 0x373d2c);
  drumTone.envMapIntensity = o.drumEnv ?? 0.14;
  P.disposables.push(wheelTone, drumTone);
  P.hullG.traverse((ob) => {
    if (!ob.isMesh && !ob.isInstancedMesh) return;
    const m = ob.material;
    if (!m || !m.color || !m.color.getHex) return;
    const hex = m.color.getHex();
    if (ob.isInstancedMesh && hex === 0x171614) {
      rehook(m).color.setHex(o.padHex ?? 0x272b20);            // shoe pads
      m.envMapIntensity = o.padEnv ?? 0.18;
    } else if (ob.isInstancedMesh && hex === 0x27251f) {
      rehook(m).color.setHex(o.chainHex ?? 0x2f3427);          // inner chain/horns
      m.envMapIntensity = o.chainEnv ?? 0.22;
    } else if (ob.isInstancedMesh && hex === 0x565c50) {
      rehook(m).color.setHex(o.ringHex ?? 0x2b2f1f);           // tire ring (dark-drawn, ch1 r8 grammar)
      m.envMapIntensity = o.ringEnv ?? 0.10;
      if (m.emissive) m.emissive.setHex(0x000000);
    } else if (m === P.mats.wheels) {
      ob.material = ob.isInstancedMesh ? wheelTone : drumTone; // discs / end-drum spinners
    }
  });
  const bm = o.bandMul ?? [0.92, 0.98, 0.82];
  for (const tm of [P.mats.trackL, P.mats.trackR]) {
    tm.color.setRGB(bm[0], bm[1], bm[2]);
    tm.envMapIntensity = o.bandEnv ?? 0.08;
  }
  P.mats.spareTrack.color.setHex(o.spareHex ?? 0x2c2f24);
  if (P.mats.rubber.emissive) P.mats.rubber.emissive.setHex(o.tireEmissive ?? 0x191d12);
}

// Render-only gear-air backers (ch1 O1a/r9 lineage): thin dark-olive catch
// plates inside the gear bays, NAMED /shadow/i so the gate mask pass, the
// evaluator masks and the critic framing all EXCLUDE them (§C shadow-proxy
// law). track-clip-audit does NOT skip them — callers thread the envelopes.
function ch1BaseGearBackers(P, plates, hex = 0x20261c) {
  const m = P.mats.shadow.clone();
  m.color.setHex(hex);
  m.roughness = 0.97;
  m.metalness = 0.0;
  m.envMapIntensity = 0.14;
  m.onBeforeCompile = vehicleAmbientFloorHook;
  m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
  P.disposables.push(m);
  for (const [w, h, d, x, y, z] of plates) {
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'gearAirShadowBacker';
      mesh.position.set(side * x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.hullG.add(mesh);
      P.disposables.push(geo);
    }
  }
}

// ch1 r10b smoke-tube tips (the c5 r9 O8 recipe, verbatim transform math):
// per-tube proud tips + dark bores so 2x5 banks read circular mouths at 1x.
// Interior by construction at the callers' seats (caps sit inside each
// tube's own r 0.038 face circle; the priced turret rows on both ids are
// print-capped and the deltas are cm-scale on already-authored banks).
function smokeTubeTips(P, banks) {
  const { cylZ } = KIT;
  for (const [bx, by, bz, yaw, arc] of banks) {
    for (let k = 0; k < 5; k++) {
      const f = k - 2;
      const a = yaw + f * (arc / 5);
      const tx = bx + Math.cos(yaw) * f * 0.095, tz = bz - Math.sin(yaw) * f * 0.095;
      const dx = Math.sin(a), dy = Math.sin(0.5) * Math.cos(a), dz = Math.cos(0.5) * Math.cos(a);
      P.add('turretDark', cylZ(0.030, 0.006, 8), tx + 0.121 * dx, by + 0.121 * dy, tz + 0.121 * dz, -0.5, a, 0);
      P.add('turretDetail', cylZ(0.014, 0.032, 8), tx + 0.138 * dx, by + 0.138 * dy, tz + 0.138 * dz, -0.5, a, 0);
      P.add('turretDark', cylZ(0.011, 0.005, 8), tx + 0.156 * dx, by + 0.156 * dy, tz + 0.156 * dz, -0.5, a, 0);
    }
  }
}

function buildChallenger2(P) {
  const { box, cylX, cylY, cylZ, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, tarpRoll,
    ammoCan, buildGun, buildRunningGear, cupola, torus } = KIT;
  const { rng } = P;
  // BASE-21 MODERNIZATION rebuild (owner directive 2026-08-06, modern-first
  // correction). PHOTO-CLASS, no oracle — FALSE-0: never gate this id.
  // Published envelope (dims sovereign): hull 8.33 (z ±4.165), width 3.52
  // over the skirt faces (±1.76 EXACT — §D width guard; the old build
  // authored ±1.895 and rescaled every probe), height 2.49 (GPS hood
  // crest), muzzle +7.335 = overall 11.50 over the −4.165 tail (the old
  // 6.7 tube ran 11.9). Packet: docs/references/tanks/challenger2.md.
  // SPEC NOTE (residual): armor gunBarrel.lengthM 6.7 vs the built 6.29
  // visible run — shadow-proxy true-up flagged for the orchestrator lane.

  // running gear (§B6 trapezoid: rear sprocket 0.55 / front idler 0.52 both
  // raised over the 0.46 wheel line; 6 Hydrogas stations + 4 covered
  // rollers). Track outer face 1.665 — 0.035 clear of the 1.70 skirt
  // inner plane (§B4 lane law). Shoe orbits (r + 0.175): sprocket far
  // −4.105 / top 1.055; idler far +4.085 / top 1.005.
  // uk round (2026-08-07, ch1-base port): SHOE-ENVELOPE IN-WINDOW fix — at
  // xc 1.34 / trackW 0.65 the shoe outer face sat at 1.75, 2 mm inside the
  // plan ±1.82 column window (1.748..1.892): the sprocket-wrap shoes painted
  // those columns to z -3.3 where the batch-48 ref's skirt content ends at
  // -2.43 (the row's worst columns, err ~1.03 ×2). Pulled to xc 1.325 /
  // trackW 0.58 → shoe outer 1.70 (48 mm clear of the plan window; still
  // paints the 1.688 front window whose ref carries ground at 0.03) —
  // track inner face 1.035 keeps 0.05 to the ±0.985 belly (§B4).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.46, xc: 1.325,
    wheelZs: [2.95, 1.81, 0.67, -0.47, -1.61, -2.75],
    sprocket: { z: -3.60, y: 0.55, r: 0.33 }, idler: { z: 3.60, y: 0.52, r: 0.31 },
    rollers: [2.3, 1.0, -0.55, -1.95].map((z) => ({ z, y: 0.95, r: 0.085 })),
    // §B8.1 NATIVE-TONE wheel countability (acceptance residual: wheels
    // read DARK vs the print's pale Hydrogas rims) — tireHex mechanism.
    trackW: 0.58, topY: 0.95, paintedEnds: true, coveredTop: 1.02, tireHex: '#565c50',
  });

  // hull: long low horizontal roofline. Belly between the tracks (±0.985 —
  // 0.03 inboard of the 1.015 track inner face), band above the skirt line
  // ENDING at the ring roof (§B8 acceptance order 2026-08-06: "kill the
  // cliff + its horizontal band"), §B1 glacis rising past the ring plane
  // to the DRIVER CREST 1.78 (the verdict's numeric target) then a short
  // back-slope down to the 1.55 ring roof — the real CR2 bow hump.
  P.add('hull', box(1.97, 0.76, 8.10), 0, 0.68, -0.05);                        // belly
  P.add('hull', box(3.36, 0.41, 4.97), 0, 1.345, -1.585);                      // upper band ±1.68, y 1.14..1.55, z -4.07..0.90
  P.add('hull', box(3.32, 0.05, 4.95), 0, 1.545, -1.575);                      // roof plate to the ring zone
  P.add('hull', slab(                                                          // §B1 main glacis plane ±1.68 -> the 1.78 crest
    [-1.68, 0.96, 4.06], [1.68, 0.96, 4.06], [1.68, 0.90, 3.96], [-1.68, 0.90, 3.96],
    [-1.68, 1.78, 1.70], [1.68, 1.78, 1.70], [1.68, 1.72, 1.56], [-1.68, 1.72, 1.56]));
  P.add('hull', box(3.36, 0.06, 0.42), 0, 1.75, 1.49);                         // crest plateau 1.72..1.78, z 1.28..1.70
  P.add('hull', slab(                                                          // back-slope crest -> ring roof 1.55 (§C.1: ring y-order matches the
    [-1.68, 1.78, 1.30], [1.68, 1.78, 1.30], [1.68, 1.72, 1.30], [-1.68, 1.72, 1.30],   // glacis slab convention — the old order was the r2 standing
    [-1.68, 1.55, 0.90], [1.68, 1.55, 0.90], [1.68, 1.49, 0.90], [-1.68, 1.49, 0.90])); // 1-reversed-piece (winding-audit mesh#24, vol -0.081)
  P.add('hull', slab(                                                          // lower bow RAKED back (kill the cliff)
    [-0.985, 0.40, 3.72], [0.985, 0.40, 3.72], [0.985, 0.40, 3.44], [-0.985, 0.40, 3.44],
    [-0.985, 1.00, 4.105], [0.985, 1.00, 4.105], [0.985, 0.96, 3.98], [-0.985, 0.96, 3.98]));
  P.add('hull', box(1.94, 0.16, 0.30), 0, 0.34, 3.50);                         // toe beam under the rake
  for (const s of [-1, 1]) towHook2(P, s * 0.62, 0.56, 3.86);
  // rear plate: center lane below the band (sprocket lanes stay open), full
  // width above; grilles + louvres + convoy plate + mudflaps.
  // (REGISTRATION-ANCHOR law, measured this round: tucking the grille face
  // off -4.145 dropped the rear BODY column, moved hullLengthM 8.37->8.22
  // and re-phased dAlong 1.369->1.443 — stations 13.4->0. The rear plate
  // kit stays EXACTLY at the r2 stations; it is the length anchor.)
  P.add('hull', box(1.94, 0.62, 0.10), 0, 0.72, -4.10);
  P.add('hullDark', box(1.70, 0.42, 0.05), 0, 0.80, -4.145);
  if (P.q) for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.62, 0.045, 0.05), 0, 0.64 + k * 0.13, -4.16);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.28, 1.42, -4.135);          // taillights
    P.add('hullRubber', box(0.62, 0.40, 0.026), s * 1.40, 0.90, -4.13);        // rear flaps (clear of the −4.105 orbit)
    P.add('hullDetail', box(0.07, 0.05, 0.16), s * 1.40, 1.125, -4.06);        // flap hangers
  }
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.32, -4.155);                 // convoy plate
  // §B8 acceptance order 3 (2026-08-06): the full-length fender SHELF is
  // DELETED ("gunwale ledge ... exists nowhere on the vehicle") — the
  // skirt top now meets the hull band line directly; only the real front
  // mudguards over the idler stay.
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // mudguards 24mm inside the anchor face (plan-row truth)
      [1.02, 1.035, 3.55], [1.735, 1.035, 3.55], [1.735, 1.035, 3.52], [1.02, 1.035, 3.52],
      [1.02, 1.075, 4.15], [1.735, 1.075, 4.15], [1.735, 1.125, 3.57], [1.02, 1.125, 3.57]));
    P.add('hullRubber', box(0.60, 0.30, 0.026), s * 1.40, 0.86, 4.145);        // front flaps ahead of the +4.085 orbit
  }
  // big flat squared skirts at ±1.76 EXACT: raised stepped FRONT panel
  // (raked leading edge, exposes the idler + approach run) + 5 full panels.
  // §B8 acceptance order 1: skirt bottom UP to the 0.58 hub line with a
  // SCALLOPED lower edge (inter-wheel tabs) — 6 Hydrogas wheels ~60%
  // exposed like the print; the old 0.42 rubber fringe is gone.
  // FINISH r2 (plan-row truth): the print's FULL-WIDTH skirt faces span
  // z -1.23..3.13 only — the rear two bays RECESS to a 1.735 face (the
  // §D width anchor stays on the front bays + panel at 1.76 EXACT), the
  // stepped front panel ends at the print's 3.13 line, and the scallop
  // tabs tuck to 1.7525 max (AA-sliver law: no face kisses at the 1.76
  // column window).
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // stepped front panel w/ raked lead edge
      [1.70, 0.88, 2.98], [1.76, 0.88, 2.98], [1.76, 0.92, 2.56], [1.70, 0.92, 2.56],
      [1.70, 1.145, 3.12], [1.76, 1.145, 3.12], [1.76, 1.145, 2.56], [1.70, 1.145, 2.56]));
    for (let k = 0; k < 5; k++) {
      const z = 1.92 - k * 1.28;
      const rec = k >= 3 ? 0.025 : 0;                                          // rear bays recessed off the anchor face
      P.add('hull', box(0.06, 0.565, 1.24), s * (1.73 - rec), 0.8625, z);      // panel (face 1.76 EXACT on bays 1-3)
      P.add('hullDark', box(0.012, 0.05, 0.30), s * (1.7605 - rec), 1.02, z);  // recessed handle strip
      P.add('hullDark', box(0.065, 0.52, 0.018), s * (1.73 - rec), 0.885, z - 0.635); // panel seams
    }
    for (const zg of [2.38, 1.24, 0.10, -1.04, -2.18]) {                       // scallop tabs between the wheel stations
      P.add('hull', box(0.055, 0.10, 0.34), s * (1.725 - (zg < -1.3 ? 0.025 : 0)), 0.55, zg);
    }
    P.add('hullShadow', new THREE.BoxGeometry(0.30, 0.03, 7.4), s * 1.50, 1.10, -0.05);
  }
  // glacis furniture ON the new crest/plane: driver hatch + periscope ride
  // the 1.78 crest plateau, splash V-strips on the steeper rake.
  P.add('hull', cylY(0.29, 0.29, 0.04, P.q ? 20 : 12), 0, 1.795, 1.48);        // driver hatch on the crest
  P.add('hullDark', torus(0.29, 0.014, P.q ? 20 : 12), 0, 1.802, 1.48);
  periscope(P, 'hullDetail', 0, 1.81, 1.66);                                   // driver sight at the crest lip
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.98, 0.045, 0.07), s * 0.55, 1.48, 2.62, 0.334, s * 0.30, 0); // splash V-strip on the rake
  }
  {
    const lights = [];
    for (const s of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, rake: -0.35, seed: 2 + s });
      lc.position.set(s * 1.32, 1.16, 3.95);
      P.hullG.add(lc);
      lights.push(lc);
    }
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.021, seed: 4,
      pts: [[-1.30, 1.24, 2.85], [-0.40, 1.42, 2.20], [0.55, 1.30, 2.66], [1.30, 1.14, 3.30]] });
    P.hullG.add(tc);
  }
  // deck furniture: louvred engine field, fuel caps, lift eyes, sponson
  // bins, strapped kit.
  P.add('hullDark', box(1.90, 0.02, 1.30), 0, 1.556, -2.60);
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.80, 0.025, 0.06), 0, 1.566, -3.10 + k * 0.20);
  for (const zc of [-1.65, -0.75]) {
    P.add('hullDetail', cylY(0.11, 0.11, 0.03, 12), 1.15, 1.56, zc);           // access caps
    P.add('hullDark', torus(0.11, 0.012, 12), -1.15, 1.565, zc);
  }
  liftEye(P, 'hullDetail', -1.45, 1.58, -1.60);
  liftEye(P, 'hullDetail', 1.45, 1.58, -1.60);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.20, 1.35), s * 1.50, 1.66, -2.95);               // sponson stowage bins
    P.add('hullDark', box(0.31, 0.02, 1.37), s * 1.50, 1.765, -2.95);          // bin lid seams
    P.add('hullDark', box(0.026, 0.16, 0.03), s * 1.50, 1.65, -2.30);          // latches
  }
  stowage(P, 'hullCloth', rng, [[-0.85, 1.64, -3.42, 0.5, 0.22, 0.9], [0.85, 1.63, -3.58, 0.4, 0.2, 0.8]]);

  // ---- turret: the Dorchester wedge (§B1 turret slope law — the front is
  // TWO strongly plan-swept AND elevation-raked cheek planes meeting the
  // central embrasure; §B1.1 both cheeks carry the same rake). Ratified
  // plan width 2.80 (CTW 1.40); roof 2.47 world, GPS hood crest 2.49 = the
  // published height line.
  const CTW = 1.40, CTH = 0.92;
  P.add('turret', frustum(CTW, 0.10, -2.15, CTW * 0.92, -0.02, -2.10, 0.0, CTH)); // main body
  // §B8 acceptance order 4 (2026-08-06): the cheek planes carry the
  // Dorchester rake ALL THE WAY to the roof line — top ring at 0.94 (the
  // 2.49 crest), no roof-box step above the face.
  // (cheek UNDERSIDES rise toward the apex clearing the new 1.78 driver
  // hump — the real CR2 turret front floats over the crest)
  P.add('turret', slab(                                                        // R swept cheek
    [0.16, 0.26, 1.28], [CTW, 0, 0.10], [CTW, 0, -0.35], [0.16, 0.14, 0.85],
    [0.16, 0.94, 0.71], [CTW * 0.90, 0.94, -0.32], [CTW * 0.90, 0.94, -0.64], [0.16, 0.94, 0.42]));
  P.add('turret', slab(                                                        // L swept cheek (corner-swapped mirror)
    [-CTW, 0, 0.10], [-0.16, 0.26, 1.28], [-0.16, 0.14, 0.85], [-CTW, 0, -0.35],
    [-CTW * 0.90, 0.94, -0.32], [-0.16, 0.94, 0.71], [-0.16, 0.94, 0.42], [-CTW * 0.90, 0.94, -0.64]));
  for (const s of [-1, 1]) {
    P.add('turret', box(0.10, CTH * 0.94, 0.10), s * 0.17, CTH / 2, 1.06, 0, s * 0.5, 0); // bevel strips at the slot
    P.add('turretDark', box(0.55, 0.03, 0.03), s * 0.7, 0.34, 0.62, 0, s * 0.72, 0);      // cheek module seam
  }
  // Dorchester side module slabs (boxy cheek-to-bustle side read)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, CTH * 0.72, 1.55), s * (CTW + 0.03), CTH * 0.42, -0.90, 0, s * 0.03, 0);
    P.add('turretDark', box(0.145, 0.03, 1.50), s * (CTW + 0.035), CTH * 0.42, -0.90, 0, s * 0.03, 0);
  }
  // gun slot: NARROW mantlet-less embrasure — block + dark walls + the
  // canvas boot collar the sleeve emerges from (§B3.1: a real recessed
  // collar, not a bare notch). L94A1 coax chain-gun port on the LEFT
  // cheek face beside the slot (the real CR2 coax station).
  P.add('turret', box(0.44, 0.62, 0.42), 0, 0.32, 0.92);                       // embrasure block
  P.add('turretDark', box(0.50, 0.50, 0.06), 0, 0.32, 1.12);                   // slot shadow wall
  P.add('turret', cylZ(0.055, 0.06, 10), -0.30, 0.46, 1.005, -0.05, -0.35, 0); // coax port collar on the raked cheek
  P.add('turretDark', cylZ(0.030, 0.10, 8), -0.30, 0.46, 1.03, -0.05, -0.35, 0); // L94A1 bore
  // commander's round cupola RIGHT with episcope ring + VS580 pano ahead
  cupola(P, 'turret', 0.58, CTH, -0.55, 0.26, 0.16, 8);
  // FINISH r2 (datum true-up c48bf50): heightM is now the SENSOR-INCLUSIVE
  // 3.04 published pano line — the VS580 mast rises so the head cap tops
  // 3.04 world across 3 side columns (p95 carrier; whips spike above per
  // the <=4-column budget, aligned with the print's own 3.86/4.0 spikes).
  P.add('turretDetail', cylY(0.075, 0.09, 0.26, 10), 0.52, CTH + 0.13, 0.05);  // pano pedestal column
  P.add('turretDark', cylY(0.115, 0.125, 0.22, 12), 0.52, CTH + 0.40, 0.05);   // VS580 head drum
  P.add('turretDark', box(0.20, 0.06, 0.36), 0.52, CTH + 0.54, 0.05);          // head cap (top 1.49 local = 3.04 published)
  P.add('turretGlass', box(0.15, 0.09, 0.02), 0.52, CTH + 0.41, 0.175);        // pano window
  // gunner's primary sight (GPS) armored housing SUNK INTO the raked face
  // (§B8 order 4: no boxes poking above the cheek plane): hood walls +
  // brow + RECESSED angled glass. Crest 0.94 local = the published 2.49.
  P.add('turret', box(0.52, 0.12, 0.44), 0.42, 0.86, 0.42);                    // housing body (top 0.92)
  P.add('turretDetail', box(0.56, 0.03, 0.48), 0.42, CTH + 0.005, 0.41);       // brow lid (top 0.94 local)
  P.add('turretDark', box(0.44, 0.135, 0.03), 0.42, CTH - 0.025, 0.645);       // aperture back panel
  P.add('turretGlass', box(0.30, 0.075, 0.014), 0.42, CTH - 0.035, 0.658, -0.20, 0, 0); // recessed angled glass
  // loader hatch LEFT + census GPMG on its rim pintle (§I fitting)
  P.add('turret', cylY(0.22, 0.22, 0.05, 14), -0.62, CTH + 0.02, -0.45);
  P.add('turretDark', box(0.32, 0.014, 0.03), -0.62, CTH + 0.052, -0.45);
  {
    // uk round: yaw 0.55 -> 0.12 (owner 2026-08-07 "machine guns point
    // forward, not to the left" — the CROWS-FORWARD spirit applied to the
    // manned pintle rest pose too).
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 22, elev: 0.14, rotation: [0, 0.12, 0] });
    mg.position.set(-0.66, CTH + 0.02, -0.28);
    P.turretG.add(mg);
  }
  // ch1-base MG-station cluster (ch1 r10b grammar): ammo cans + belt tray
  // beside the pintle so the station reads as a manned weapon post, not a
  // lone gun. Interior: tops <= CTH+0.20 = 2.74w under the 2.80 cupola line
  // in the same side band; x >= -0.90 inside the roof plan.
  P.add('turretDark', box(0.10, 0.12, 0.16), -0.86, CTH + 0.08, -0.12);
  P.add('turretDetail', box(0.09, 0.10, 0.14), -0.84, CTH + 0.07, -0.50);
  P.add('turretDark', box(0.07, 0.028, 0.10), -0.78, CTH + 0.155, -0.30);
  // loader-hatch ring dressing (ch1 r10b roof grammar): periscope blocks
  // around the ring + lid seam disc — flush-tangent on the lid/roof planes.
  for (const [px, pz] of [[-0.40, -0.28], [-0.86, -0.42], [-0.44, -0.62]]) {
    P.add('turretDark', box(0.07, 0.010, 0.05), px, CTH + 0.005, pz);
  }
  P.add('turretDetail', cylY(0.155, 0.155, 0.006), -0.62, CTH + 0.048, -0.45);
  // roof plateau seam strips (flush ON the 0.92 roof plane, ch1 deck-seam class)
  P.add('turretDark', box(0.016, 0.004, 0.92), -0.18, CTH + 0.002, -0.40);
  P.add('turretDark', box(0.70, 0.004, 0.014), 0.30, CTH + 0.002, -0.85);
  liftEye(P, 'turretDetail', -1.0, CTH + 0.03, 0.0);
  liftEye(P, 'turretDetail', 1.0, CTH + 0.03, -0.9);
  // twin whips on the bustle corners (uk round: the batch-48 ref's ONE
  // front antenna column reads x -0.886 top 2.94 — a1 re-seated onto it,
  // trimmed so the tip rides the ref line; a2 kept as the real CR2 second
  // whip (variant truth) but shortened under the 2.94-3.04 sensor band —
  // its ref column carries no antenna, honest ~0.5 residual on one col)
  {
    const a1 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.44, rake: 0.05, seed: 5 });
    a1.position.set(-0.886, CTH + 0.02, -1.50);
    P.turretG.add(a1);
    const a2 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.36, rake: -0.04, seed: 6 });
    a2.position.set(0.90, CTH + 0.02, -1.55);
    P.turretG.add(a2);
  }
  // HUGE rear bustle bin + full-width basket (CR2 identity)
  P.add('turret', box(2.60, 0.50, 0.55), 0, 0.30, -2.38);                      // welded bin
  P.add('turretDetail', box(2.62, 0.05, 0.57), 0, 0.57, -2.38);                // bin lid lip
  for (const f of [-0.9, 0, 0.9]) P.add('turretDark', box(0.03, 0.52, 0.57), f, 0.30, -2.38);
  const bkT = 0.56, bkB = 0.12, bkZ = -2.92;
  P.add('turretDetail', box(2.90, 0.05, 0.05), 0, bkT, bkZ);                   // basket rails
  P.add('turretDetail', box(2.90, 0.05, 0.05), 0, bkB, bkZ);
  for (let k = 0; k < 13; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.40 + k * 0.233, (bkT + bkB) / 2, bkZ);
  P.add('turretDark', box(2.80, 0.02, 0.42), 0, bkB + 0.03, -2.70);            // mesh floor
  // ch1-base rail-over-mesh basketry (ch1 r10 O5a grammar): dark mesh
  // panels seated 2 mm into the bin rear face + pale rails reading over
  // them — the stack stops reading as clean crates. Interior: z >= -2.67
  // (the -2.92 basket rails own the tail), y tops 0.575 under the bin lid.
  P.add('turretDark', box(0.46, 0.25, 0.010), -0.45, 0.30, -2.662);
  P.add('turretDark', box(0.46, 0.25, 0.010), 0.45, 0.30, -2.662);
  for (const px of [-0.45, 0.45]) {
    for (const ry of [0.22, 0.40]) P.add('turretDetail', box(0.44, 0.020, 0.007), px, ry, -2.668);
    for (const rx of [-0.20, 0, 0.20]) P.add('turretDetail', box(0.020, 0.25, 0.007), px + rx, 0.30, -2.668);
  }
  stowage(P, 'turretCloth', rng, [
    [-0.75, 0.38, -2.70, 0.6, 0.4, 0.38], [0.15, 0.35, -2.72, 0.5, 0.34, 0.36],
  ]);
  tarpRoll(P, 'turretCloth', 0.7, 0.52, -2.68, 1.05, 0.13, true);              // camo net roll
  jerryCan(P, 'turretCloth', -1.15, 0.36, -2.70, 0.15);
  ammoCan(P, 'turretDark', 1.10, 0.32, -2.72, 0.25);
  // twin 5-tube smoke banks on the cheeks (+ ch1 r10b tube tips + bores —
  // the banks read circular mouths at 1x instead of solid crates)
  smokeCluster(P, 0.98, 0.42, 0.72, 5, 0.85, 0.7);
  smokeCluster(P, -0.98, 0.42, 0.72, 5, -0.85, 0.7);
  smokeTubeTips(P, [[0.98, 0.42, 0.72, 0.85, 0.7], [-0.98, 0.42, 0.72, -0.85, 0.7]]);
  // side stowage baskets along the turret walls
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.26, 1.10), s * (CTW + 0.075), 0.40, -1.65);
    stowage(P, 'turretCloth', rng, [[s * (CTW + 0.02), 0.42, -1.6, 0.14, 0.24, 0.85]]);
  }
  // TOGS II armored barbette ABOVE the gun (pitches with it): boxy housing,
  // shutter brow, dark aperture + glass slit.
  P.addGunExtra(box(0.42, 0.32, 0.66), 0, 0.42, 0.42);
  P.addGunExtra(box(0.46, 0.08, 0.70), 0, 0.60, 0.42);                         // brow lid
  P.addGunExtraDark(box(0.30, 0.18, 0.05), 0, 0.42, 0.76);                     // aperture
  P.addGunExtra(cylZ(0.145, 0.30, P.q ? 20 : 12, 0.165), 0, 0, 0.62);          // boot collar at the slot
  P.addGunExtraDark(cylZ(0.150, 0.05, P.q ? 20 : 12), 0, 0, 0.50);             // boot seam ring
  // fat thermal-sleeved L30 with MRS at the muzzle + fume extractor:
  // muzzle +7.335 world = the published 11.50 overall.
  buildGun(P, { len: 6.29, r: 0.082, sleeve: true, evac: 0.58, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: 6.29, r: 0.082 });                     // §B3.1 (shadow-named, 3fca39b)
  // ch1-base STERN KIT (ch1 r10 O5b grammar, CR2 fit): draped cable +
  // cleats across the upper rear face, outlet boxes at the plate corners.
  // Column-safe: everything rides z >= -4.145 (the rear plate kit is the
  // hullLengthM/dAlong anchor — REGISTRATION-ANCHOR law, never extended)
  // and y <= 1.42 inside the taillight/band rear silhouette.
  KIT.towCable(P, [[-0.78, 1.40, -4.09], [0, 1.26, -4.10], [0.78, 1.40, -4.09]]);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.09, 0.09, 0.05), s * 0.78, 1.40, -4.075);        // cable cleats
    P.add('hullDark', box(0.20, 0.16, 0.05), s * 0.55, 1.30, -4.09);           // outlet boxes on the band rear face
    P.add('hullDark', cylZ(0.036, 0.05, 10), s * 0.34, 1.28, -4.085);          // pipe stubs
  }
  // deck panel seams + filler caps (ch1 r10b deck grammar — flush)
  P.add('hullDark', box(1.60, 0.004, 0.016), 0, 1.572, 0.30);
  P.add('hullDark', box(1.60, 0.004, 0.016), 0, 1.572, -0.72);
  // ch1-base family tone kit + gear-air backers (the r8/r9 recipes): pale
  // Hydrogas discs vs dark tire rings, warm-olive pads/chain, muted band,
  // smoked glass, dark-olive fittings; render-only shadow plates give the
  // scalloped bays their inter-wheel shade (§C shadow-named exclusion).
  ch1BaseToneKit(P, { cloth: 0x262b1d, clothEnv: 0.05, dark: 0x282c22 });
  ch1BaseGearBackers(P, [
    [0.016, 0.35, 5.50, 0.998, 0.42, 0.075],                                   // inter-wheel shadow wall (x 0.99..1.006; band inner 1.035)
    [0.52, 0.42, 0.02, 1.17, 0.48, 2.38],                                      // per-bay catch plates at the scallop stations
    [0.52, 0.42, 0.02, 1.17, 0.48, 1.24],
    [0.52, 0.42, 0.02, 1.17, 0.48, 0.10],
    [0.52, 0.42, 0.02, 1.17, 0.48, -1.04],
    [0.52, 0.42, 0.02, 1.17, 0.48, -2.18],
  ]);
  // ZAP plate front + squadron number on turret sides
  P.decal('hull', 'number', 'KC91AA', 0.34, [0.85, 1.30, 3.20], 0, -1.36);
  P.decal('turret', 'number', P.spec.visual.number || '22', 0.36, [1.20, 0.42, -0.9], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'number', P.spec.visual.number || '22', 0.36, [-1.20, 0.42, -0.9], -Math.PI / 2, 0, -0.06);
  P.decal('hull', 'soot', null, 0.8, [-1.0, 1.1, -4.17], Math.PI);
  P.topY = 1.05;
}
// ---------------------------------------------------------------------------
// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). §B8 PROPORTIONS
// FIRST: authored against the NC-quarantined 42manako print's measured
// tables (docs/references/vertex/challenger_3.json — width 3.519 = the
// anchor, turret face ~2.45w/tail -2.13w, bore line 1.76, ground run
// -2.1..+2.7 with high-tucked end wheels) at the PUBLISHED CR2-anchor
// envelope (dims sovereign: hull ±4.165, width ±1.755 EXACT skirts,
// muzzle +7.335 = 11.50). CR3 identity vs the CR2 resident: the NEW
// Rheinmetall turret (flat raked face over jutting lower cheek wedges,
// huge squared bustle), Trophy APS side modules, roof RWS, and the
// 120 mm L55A1 SMOOTHBORE (evacuator + thermal sleeve + MRS collar +
// §B3.1 muzzle bore) replacing the rifled L30.
// ---------------------------------------------------------------------------
function buildChallenger3(P) {
  const { box, cylY, cylZ, slab, frustum, headlight, liftEye,
    periscope, smokeCluster, stowage, jerryCan, tarpRoll,
    ammoCan, buildGun, buildRunningGear, torus } = KIT;
  const { rng } = P;

  // ---- running gear (§B6 trapezoid; print seats): 6 Hydrogas wheels on
  // the print's -2.0..+2.55 run, HIGH-TUCKED idler/sprocket (approach
  // ramp 3.0->3.8, departure -2.2..-3.2 — both read below the skirt cut).
  // Track outer 1.60 + skirt inner 1.725 (§B4 lane law with margin).
  // uk round (2026-08-07, ch1-base port): SHOE-ENVELOPE IN-WINDOW fix — the
  // old xc 1.29 / trackW 0.56 put the shoe outer face at 1.655 = EXACTLY the
  // plan ±1.72 column window edge (1.6555) and inside the front 1.624 window
  // (1.5945..1.6535): the shoes painted the ±1.72 plan columns to z -3.27
  // where the batch-47 ref ends at -0.892 (err 1.224 ×2, the worst plan
  // columns) and the 1.624 front bottoms to ground (ref 0.838, err 0.397).
  // Pulled to xc 1.245 / trackW 0.50 → shoe outer 1.58 (14 mm inside the
  // front boundary, 75 mm clear of the plan window; still paints the 1.565
  // front window whose ref DOES carry ground). Sprocket tucked -2.66 → -2.60
  // + r 0.31 → 0.28, y 0.98 (wrap far -3.065, pads ≤ -3.15 — out of the
  // -3.258 side window whose ref floor is 1.094; wrap bottom 0.52 vs the
  // ref's own 0.612 wrap line at the -3.13 column; orbit top 1.44 stays
  // 0.035 under the 1.475 sponson floor — §B4 wrap-lane law held).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, wheelY: 0.46, xc: 1.245,
    wheelZs: [2.55, 1.64, 0.73, -0.18, -1.09, -2.00],
    sprocket: { z: -2.60, y: 0.98, r: 0.28 }, idler: { z: 3.35, y: 0.62, r: 0.28 },
    rollers: [1.95, 0.55, -0.85, -1.75].map((z) => ({ z, y: 1.10, r: 0.08 })),
    trackW: 0.50, topY: 1.26, contactZF: 2.75, contactZR: -2.10,
    // §B8.1 NATIVE-TONE wheel countability (acceptance-flagged "wheels
    // render DARK vs the print's pale Hydrogas rims") — merkava r12
    // tireHex mechanism, per-tank param, default byte-identical elsewhere.
    paintedEnds: true, coveredTop: 1.18, tireHex: '#565c50',
  });

  // ---- hull: belly + sponson strips at the print's front rows (0.42 /
  // 0.33), wrap-safe 3-piece band (sprocket orbit top 1.445 vs sponson
  // floor 1.475), stepped engine deck rising rearward like the print.
  // FINISH r2 (2026-08-06 punch list 3): stern floor raised to the print's
  // 0.97..1.19 rising underside line (side_hull worst cols -3.1..-4.05).
  // (uk round: belly rear end pulled -3.15 → -2.93 — its 0.42 floor painted
  // the -3.0/-3.13 side windows where the batch-47 ref bottoms read
  // 0.515/0.612, the ref's own rising wrap/boat-tail line; the stern-rise
  // slabs below now own that line. Sponson strips follow the 1.245 gear
  // lane: outer 0.96 = new track inner 0.995 - 0.035.)
  P.add('hull', box(1.72, 0.60, 6.33), 0, 0.72, 0.235);                        // belly ±0.86, y 0.42..1.02, ends z -2.93
  for (const s of [-1, 1]) {
    P.add('hull', box(0.12, 0.69, 6.30), s * 0.90, 0.675, 0.0);                // sponson under-strip (0.33 line; outer 0.96 = wrap lane 0.995 - 0.035)
  }
  // (plan-grid law, measured this round: plan columns pitch 0.13 — the
  // ±1.72 column window spans 1.655..1.785; the print keeps its band
  // walls INSIDE 1.63 there, only the skirts reach further out)
  P.add('hull', box(1.92, 0.53, 6.35), 0, 1.285, -0.875);                      // band spine ±0.96 (wrap lane 0.995 - 0.035), y 1.02..1.55
  for (const s of [-1, 1]) {
    P.add('hull', box(0.57, 0.075, 5.85), s * 1.345, 1.5125, -0.625);          // sponson floor 1.06..1.63, ends -3.55
    P.add('hull', box(0.04, 0.53, 5.85), s * 1.61, 1.285, -0.625);             // outer band wall 1.59..1.63, ends -3.55
    P.add('hull', mslab1(s,                                                    // tapered sponson floor closure -3.55 -> -3.92
      [1.06, 1.475, -3.55], [1.63, 1.475, -3.55], [1.26, 1.475, -3.92], [1.06, 1.475, -3.92],
      [1.06, 1.55, -3.55], [1.63, 1.55, -3.55], [1.26, 1.55, -3.92], [1.06, 1.55, -3.92]));
  }
  P.add('hull', box(3.36, 0.045, 3.35), 0, 1.5275, 0.625);                     // main deck 1.55, z -1.05..2.30
  P.add('hull', box(3.36, 0.05, 0.53), 0, 1.615, -1.515);                      // engine deck step 1.64
  P.add('hull', box(3.36, 0.05, 0.67), 0, 1.645, -2.115);                      // step 1.67
  P.add('hull', box(1.92, 0.045, 0.35), 0, 1.6775, -2.625);                    // exhaust hump 1.70 (print front deck line 1.66 at ±0.96)
  P.add('hull', box(3.36, 0.05, 0.50), 0, 1.665, -3.05);                       // rear deck 1.69
  P.add('hull', slab(                                                          // stern deck falling 1.64 -> 1.35, rear tapered to ±1.30 (print boat-tail;
    [-1.68, 1.64, -3.30], [1.68, 1.64, -3.30], [1.68, 1.59, -3.30], [-1.68, 1.59, -3.30],   // ends at the -3.94 center-plate line; §C.1 ring order = the glacis
    [-1.30, 1.35, -3.94], [1.30, 1.35, -3.94], [1.30, 1.30, -3.94], [-1.30, 1.30, -3.94])); // convention — the r1 latent reversed piece #1, winding-audit pinned
  // §B1 glacis — ONE plane ±1.62 from the nose lip to the 1.55 roof knee
  // (print top line 1.06@3.95 -> 1.55@2.30, shallow), 0.85 bow underside,
  // raked lower bow back to the belly (center lane, §B4 idler lanes open)
  P.add('hull', slab(                                                          // center lane (deep underside)
    [-0.95, 1.00, 4.11], [0.95, 1.00, 4.11], [0.95, 0.85, 4.02], [-0.95, 0.85, 4.02],
    [-0.95, 1.55, 2.32], [0.95, 1.55, 2.32], [0.95, 1.49, 2.20], [-0.95, 1.49, 2.20]));
  P.add('hull', mslab1(1,                                                      // right wing — THIN co-planar
    [0.95, 1.00, 4.11], [1.62, 1.00, 4.11], [1.62, 0.95, 4.09], [0.95, 0.95, 4.09],
    [0.95, 1.55, 2.32], [1.62, 1.55, 2.32], [1.62, 1.50, 2.30], [0.95, 1.50, 2.30]));
  P.add('hull', mslab1(-1,
    [0.95, 1.00, 4.11], [1.62, 1.00, 4.11], [1.62, 0.95, 4.09], [0.95, 0.95, 4.09],
    [0.95, 1.55, 2.32], [1.62, 1.55, 2.32], [1.62, 1.50, 2.30], [0.95, 1.50, 2.30]));
  P.add('hull', slab(                                                          // nose lip to the 0.85 underside line
    [-1.28, 0.85, 4.10], [1.28, 0.85, 4.10], [1.28, 0.85, 3.84], [-1.28, 0.85, 3.84],
    [-1.28, 1.02, 4.135], [1.28, 1.02, 4.135], [1.28, 1.10, 3.99], [-1.28, 1.10, 3.99]));
  P.add('hull', slab(                                                          // raked lower bow, center lane (§C.1: was the r1 latent reversed
    [-0.98, 0.42, 3.32], [0.98, 0.42, 3.32], [0.98, 0.42, 3.28], [-0.98, 0.42, 3.28],   // piece #2 — an inside-out frustum, vol -0.118; re-authored as a
    [-0.98, 0.85, 4.06], [0.98, 0.85, 4.06], [0.98, 0.85, 3.82], [-0.98, 0.85, 3.82])); // slab in the proven ring convention, identical shape
  P.add('hull', box(1.90, 0.14, 0.26), 0, 0.36, 3.42);                         // toe beam
  for (const s of [-1, 1]) {
    // uk round: corner flaps raised 0.63..0.95 -> 0.90..1.34 — the ref's
    // ±1.58 front bottoms read 1.17 (our 0.63 flap bottom was the row's
    // 0.33-err pair); the +4.1 BODY column keeps its 12% span via the
    // taller flap + nose lip (0.85..1.34 — dims body-band pin held).
    P.add('hull', box(0.38, 0.44, 0.03), s * 1.46, 1.12, 4.10);                // front corner flaps (dims body-band pin)
    P.add('hullDetail', box(0.09, 0.11, 0.09), s * 0.60, 0.56, 3.72);          // tow eyes
  }
  // glacis furniture: driver hatch + periscopes at the crest, splash strip
  P.add('hull', cylY(0.28, 0.28, 0.04, P.q ? 20 : 12), 0.30, 1.575, 1.78);     // driver hatch
  P.add('hullDark', torus(0.28, 0.014, P.q ? 20 : 12), 0.30, 1.582, 1.78);
  periscope(P, 'hullDetail', 0.30, 1.60, 2.12);
  periscope(P, 'hullDetail', 0.02, 1.59, 2.12, -0.15);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.92, 0.045, 0.07), s * 0.52, 1.33, 2.98, 0.30, s * 0.30, 0); // splash V
  }
  {
    const lights = [];
    for (const s of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, rake: -0.32, seed: 6 + s });
      lc.position.set(s * 1.30, 1.13, 3.90);
      P.hullG.add(lc);
      lights.push(lc);
    }
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.021, seed: 9,
      pts: [[-1.25, 1.28, 2.60], [-0.35, 1.44, 2.05], [0.60, 1.33, 2.50], [1.20, 1.32, 2.90]] });
    P.hullG.add(tc);
  }
  // ---- stern: raked boat tail + upper plate with the CR3 print's rear
  // kit (external tank, exhaust boxes, convoy plate) inside ±4.165.
  // FINISH r2: the print's stern floor is HIGH (0.64@-3.14 rising to
  // 1.19@-4.04) — steep boat-tail rise ending -3.40, then a rising
  // underside wedge to the tail; upper plate raised (0.98..1.38, print
  // top 1.39) and NARROWED to ±1.28 with tapered stern walls (the print's
  // plan boat-tail: full-width content ends z -3.55 at |x| 1.34+).
  // uk round: the boat-tail floor re-authored ON the batch-47 ref's own
  // rising bottom line (side ref bottoms 0.515@-3.0 / 0.612@-3.13 /
  // 1.094@-3.258 / 1.191@-4.03 — the old 0.42-floor frustum painted the
  // -3.0..-3.26 windows 0.3-0.65 deep). Three ≤0.48 segments (§C station
  // end-caps), underside-quad-first ring order (the file's stern-wedge
  // convention).
  P.add('hull', slab(                                                          // rise 0.42@-2.93 -> 0.64@-3.16 (through the ref's 0.515/-3.0 read)
    [-0.95, 0.42, -2.93], [0.95, 0.42, -2.93], [0.95, 0.64, -3.16], [-0.95, 0.64, -3.16],
    [-0.95, 1.02, -2.93], [0.95, 1.02, -2.93], [0.95, 1.02, -3.16], [-0.95, 1.02, -3.16]));
  P.add('hull', slab(                                                          // steep knee 0.64@-3.16 -> 1.09@-3.27 (ref 1.094@-3.258)
    [-0.95, 0.64, -3.16], [0.95, 0.64, -3.16], [0.95, 1.09, -3.27], [-0.95, 1.09, -3.27],
    [-0.95, 1.02, -3.16], [0.95, 1.02, -3.16], [0.95, 1.20, -3.27], [-0.95, 1.20, -3.27]));
  P.add('hull', slab(                                                          // rising stern underside wedge 1.09@-3.27 -> 1.19@-4.05 (ref 1.191@-4.03)
    [-0.95, 1.09, -3.27], [0.95, 1.09, -3.27], [0.95, 1.19, -4.05], [-0.95, 1.19, -4.05],
    [-0.95, 1.255, -3.27], [0.95, 1.255, -3.27], [0.95, 1.31, -4.05], [-0.95, 1.31, -4.05]));
  // upper rear plate SPLIT (print plan: center-rear ends ~-3.9; the side
  // -4.17 anchor column rides the OUTER posts — hullLengthM/dAlong held):
  for (const s of [-1, 1]) {
    P.add('hull', box(0.53, 0.45, 0.10), s * 1.015, 1.175, -4.075);            // outer posts x 0.75..1.28, y 0.95..1.40, face -4.125 (anchor col)
  }
  P.add('hull', box(1.50, 0.40, 0.08), 0, 1.18, -3.92);                        // recessed center plate, face -3.96 (print center-rear line)
  P.add('hullDark', box(1.20, 0.24, 0.05), 0, 1.16, -3.945);                   // grille field on the center plate
  if (P.q) for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.14, 0.045, 0.05), 0, 1.04 + k * 0.10, -3.955);
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // tapered stern wall 1.63@-3.55 -> 1.28@-3.92 (plan boat-tail)
      [1.55, 1.02, -3.55], [1.63, 1.02, -3.55], [1.32, 1.02, -3.92], [1.24, 1.02, -3.92],
      [1.55, 1.55, -3.55], [1.63, 1.55, -3.55], [1.32, 1.55, -3.92], [1.24, 1.55, -3.92]));
    P.add('hull', box(0.28, 0.16, 0.42), s * 1.38, 1.585, -3.58);              // low exhaust cowls flush with the deck line
    P.add('hullDark', box(0.24, 0.05, 0.36), s * 1.38, 1.665, -3.58);
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.10, 1.28, -4.115);          // taillights on the narrowed plate
    P.add('hullRubber', box(0.36, 0.28, 0.026), s * 1.42, 1.26, -3.80);        // rear flaps hung at the taper walls (print carries no low flaps)
    // (uk round: a 1.25 lug re-seat was tried for the -4.03 window bottom
    // and REVERTED — the 0.845 lug underside is anchor-column MASS: the
    // -4.1 body column rides the 12% filter margin, and the whip-height
    // chase proved the coupling: a taller row rough eats the column and
    // hullLengthM walks 8.25 -> 8.11. REGISTRATION-ANCHOR law.)
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.85, 0.90, -4.09);         // tow lugs
    // rear light-guard bars (§B3.2 real CR3 kit + anchor-column armor: the
    // bars hold the -4.1 window's height span 0.70..1.40 so the body
    // column keeps headroom over the 12% filter whatever the row rough).
    P.add('hullDetail', box(0.05, 0.66, 0.04), s * 0.98, 1.03, -4.12);
  }
  P.add('hullDetail', box(0.30, 0.16, 0.04), 0, 1.02, -3.975);                 // convoy plate on the center plate
  liftEye(P, 'hullDetail', -1.45, 1.58, -1.60);
  liftEye(P, 'hullDetail', 1.45, 1.58, -1.60);
  headlight(P, -1.45, 1.11, 3.96, -0.25, 0.05);
  headlight(P, 1.45, 1.11, 3.96, -0.25, 0.05);
  // ---- skirts ±1.755 EXACT (§D width anchor): 6 flat bays, bottom at the
  // 0.62 hub line (wheels ~60% exposed — §B8), raised stepped front panel
  // exposing the idler, recessed dark handles, no fringe below.
  for (const s of [-1, 1]) {
    P.add('hull', mslab1(s,                                                    // stepped front panel — print plan: full-width faces end z 3.01;
      [1.695, 1.04, 3.05], [1.755, 1.04, 3.05], [1.755, 0.90, 2.42], [1.695, 0.90, 2.42],   // leading edge reads 1.04..1.32 (print front sliver 1.18..1.32)
      [1.695, 1.32, 3.10], [1.755, 1.32, 3.10], [1.755, 1.32, 2.42], [1.695, 1.32, 2.42]));
    // 3 bays ONLY — the print's skirts END at z ~-0.9 (plan row: ±1.76
    // content spans 3.16..-0.73 on the print) leaving the rear wheels +
    // sprocket run OPEN (§B8 exposure)
    // uk round (batch-47 re-read): hem 0.62 -> 0.73 — the ref's own front
    // bottoms at the ±1.62/1.67 windows read 0.75..0.84 (the old hem read
    // 0.13..0.22 deep); wheels now ~75% exposed (§B8.1 improves). Scallop
    // tabs pulled INBOARD to 1.6325..1.6875 (they AA-kissed the ±1.698
    // window boundary and painted the ±1.727/1.742 windows 0.53-deep where
    // the ref reads 1.176) and hung 0.70..0.79 per the ref's own tab line.
    for (let k = 0; k < 3; k++) {
      const z = 1.90 - k * 1.15;
      P.add('hull', box(0.06, 0.37, 1.11), s * 1.725, 1.135, z);               // bay panel (face 1.755, bottom 0.95 — the ref's own shallow high band)
      P.add('hullDark', box(0.012, 0.05, 0.28), s * 1.7555, 1.10, z);          // recessed handle
      P.add('hullDark', box(0.065, 0.32, 0.018), s * 1.725, 1.135, z - 0.57);  // bay seam
    }
    for (const zg of [2.10, 1.19, 0.28]) {                                     // scallop tabs between wheels (tops weld into the 0.95 bay hem, outer
      P.add('hull', box(0.06, 0.27, 0.30), s * 1.67, 0.835, zg);               // face 1.70 overlaps the 1.695 bay inner plane — §B2 attached)
    }
    P.add('hullShadow', new THREE.BoxGeometry(0.30, 0.03, 7.0), s * 1.45, 1.05, -0.15);
  }

  // ---- turret: the NEW Rheinmetall wedge (§B8 print form: face ~2.45w,
  // huge squared bustle to -2.13w, ±1.41 walls). Pivot [0,1.55,1.20];
  // locals = world - pivot.
  const C3W = 1.41, C3H = 0.85;                                                // wall half-width / roof local (2.40w)
  // core: main walls run the print's z_w 1.08..-1.89 span (local 0.88..
  // -3.09), tail piece ±1.23 to the -2.13w rear face, corner chamfer
  // strakes between; the shell sits 0.02 off the deck (print 1.57 bottoms)
  // FINISH r2: the print's tail zone TOPS at 0.70-0.74 local (side ref
  // 2.25-2.29w at z_w -1.72..-1.98) — the main C3H body ends -2.87 and the
  // tail STEPS DOWN to a 0.72 roof; chamfer strakes re-derived from the
  // print's plan chamfer line (x 1.23 @ -2.13w -> x 1.50 @ -1.86w).
  P.add('turret', frustum(C3W, 0.88, -2.87, 1.30, 0.86, -2.85, 0.02, C3H));    // main body — walls LEAN IN to the roof (print side read)
  P.add('turret', box(2.46, 0.60, 0.48), 0, 0.42, -3.09);                      // stepped bustle tail x ±1.23, y 0.12..0.72, z -2.85..-3.33
  P.add('turret', box(2.42, 0.04, 0.46), 0, 0.70, -3.09);                      // tail step roof (2.27w — print tail line)
  for (const s of [-1, 1]) {                                                   // rear-corner chamfer strakes (print chamfer line)
    P.add('turret', box(0.05, 0.60, 0.38), s * 1.365, 0.42, -3.19, 0, -s * 0.785, 0);
  }
  // FRONT: one big raked face plate (§B8 "flatter wedge, big flat cheek
  // plates"): from the 1.57w lower lip at z_w 2.45 up-back to the roof
  // front edge at z_w 2.02; §B1.1 both cheeks carry the same plane.
  P.add('turret', slab(
    [-1.05, 0.02, 1.25], [1.05, 0.02, 1.25], [1.05, 0.02, 0.95], [-1.05, 0.02, 0.95],
    [-1.05, C3H, 0.82], [1.05, C3H, 0.82], [1.05, C3H, 0.55], [-1.05, C3H, 0.55]));
  P.add('turret', slab(                                                        // right front-side transition plane
    [1.05, 0.02, 1.25], [1.41, 0.02, -0.12], [1.41, 0.02, -0.42], [1.05, 0.02, 0.95],
    [1.05, C3H, 0.82], [1.41, C3H, -0.30], [1.41, C3H, -0.55], [1.05, C3H, 0.55]));
  P.add('turret', slab(                                                        // left front-side transition
    [-1.41, 0.02, -0.12], [-1.05, 0.02, 1.25], [-1.05, 0.02, 0.95], [-1.41, 0.02, -0.42],
    [-1.41, C3H, -0.30], [-1.05, C3H, 0.82], [-1.05, C3H, 0.55], [-1.41, C3H, -0.55]));
  // jutting LOWER CHEEK ARMOR WEDGES to the 2.62w tips (print z-profile:
  // halfW 0.94 at 2.54-2.64w, y 1.57..1.95) — mirrored through mslab1
  // (§C missing-side law: never a bare x*s mirror)
  for (const s of [-1, 1]) {
    P.add('turret', mslab1(s,
      [0.20, 0.02, 1.30], [0.94, 0.02, 1.16], [0.94, 0.02, 0.90], [0.20, 0.02, 1.04],
      [0.24, 0.40, 1.42], [0.90, 0.40, 1.28], [0.90, 0.40, 1.06], [0.24, 0.40, 1.16]));
  }
  P.add('turret', box(2.78, 0.05, 3.75), 0, C3H - 0.025, -1.005);              // roof plate (ends at the -2.87 tail step)
  // embrasure: recessed collar + canvas boot (§B3.1 — no bare notch);
  // L94A1-class coax port on the LEFT of the slot (print 'weapon3')
  P.add('turret', box(0.46, 0.56, 0.36), 0, 0.30, 0.98);
  P.add('turretDark', box(0.52, 0.46, 0.06), 0, 0.30, 1.17);
  P.add('turret', cylZ(0.052, 0.06, 10), -0.32, 0.42, 1.13, -0.05, -0.30, 0);
  P.add('turretDark', cylZ(0.028, 0.10, 8), -0.32, 0.42, 1.16, -0.05, -0.30, 0);
  // TROPHY APS modules on both flanks (§H.4 the CR3 tell): slab boxes with
  // vent lines + angled radar faces front/rear (merkava grammar).
  // FINISH r2: modules re-derived from the print's plan/front rows — faces
  // out to x 1.66 hanging at the roof line (plan ref [0.95, -1.70]w at
  // |x| 1.6; front ref tops 2.44-2.46 at |x| 1.62-1.68).
  // uk round (batch-47 re-read, 2-pass): the ref's Trophy band is a
  // TILTED-PANEL read — side-armor shoulder at 2.42w holding to x 1.60,
  // then the leaned module face falling to 2.20w at 1.74 (front rows read
  // 2.45 at the ±1.61 windows, 2.205 at ±1.73; the old vertical 2.40-top
  // box read +0.18 outboard and -0.24 inboard). Real Trophy grammar: the
  // panel leans against the turret side on standoff brackets (§B2).
  for (const s of [-1, 1]) {
    P.add('turret', box(0.19, 0.06, 2.62), s * 1.505, 0.84, -1.575);           // roof shoulder course (top 2.42w to x 1.60)
    P.add('turret', box(0.02, 0.28, 2.62), s * 1.67, 0.75, -1.575, 0, 0, s * 0.53); // leaned Trophy face (1.59/0.88 -> 1.75/0.62; outer 1.749 < the 1.755 §D anchor)
    for (const bz of [-0.40, -1.55, -2.70]) {
      P.add('turret', box(0.26, 0.05, 0.07), s * 1.525, 0.70, bz);             // standoff mounting brackets (wall -> panel)
    }
    P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.645, 0.79, -1.575, 0, 0, s * 0.53); // panel ribs
    P.add('turretDark', box(0.022, 0.02, 2.35), s * 1.695, 0.705, -1.575, 0, 0, s * 0.53);
    P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.575, 0.70, -0.22, 0, s * 0.35, 0);   // fwd radar
    P.add('turretGlass', box(0.012, 0.14, 0.14), s * 1.60, 0.70, -0.21, 0, s * 0.35, 0);
    P.add('turretDark', box(0.03, 0.18, 0.18), s * 1.53, 0.70, -2.78, 0, -s * 0.35, 0);   // rear radar
  }
  // RWS (PROTECTOR-class, §H.4 UK grammar: M2 12.7 on the remote mount)
  // front-left roof. FINISH r2: seated ON the print's own RCWS body zone
  // (side ref 2.96-3.00 tops at z_w 0.55..1.15) — mount body + sensor
  // head carry that plateau; the M2 runs forward to ~z_w 1.9 at the
  // 2.85-2.97 line. The print's elevated 30 mm barrel columns at
  // z_w 2.15-2.66 stay the certified §H.4 residual (UK M2 grammar).
  P.add('turret', box(0.30, 0.18, 0.30), -0.30, C3H + 0.06, -0.35);            // pedestal
  P.add('turretDetail', box(0.34, 0.36, 0.55), -0.30, C3H + 0.27, -0.37);      // mount body (top 2.85w; z_w 0.555..1.105 = ref 2.96 plateau)
  P.add('turretDark', box(0.16, 0.18, 0.16), -0.48, C3H + 0.47, -0.37);        // sensor head (top 2.96w — the ref's own RCWS line)
  P.add('turretGlass', box(0.12, 0.08, 0.02), -0.48, C3H + 0.48, -0.28);
  // uk round: RWS ammunition/junction tier BEHIND the mount (§B3 named
  // equipment) — the batch-47 ref's own side tops at z_w 0.35..0.48 read
  // 2.575..2.607 (its boxy RCWS base runs rearward; ours ended z_w 0.555
  // and those columns fell to the 2.38 roof). Top 2.60w; front columns
  // unchanged (the 2.85 mount body owns x -0.13..-0.47 tops).
  P.add('turretDetail', box(0.30, 0.20, 0.32), -0.30, C3H + 0.10, -1.02);      // ammo/junction box (top 2.60w, z_w 0.34..0.66)
  P.add('turretDark', box(0.26, 0.03, 0.28), -0.30, C3H + 0.215, -1.02);       // lid seam
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 31, elev: 0.05, ammo: true });
    mg.position.set(-0.24, C3H + 0.22, -0.28);
    P.turretG.add(mg);
  }
  // sights: gunner's EPSOM housing recessed into the face top RIGHT (§B1.1
  // detail rides ON the plane), commander pano rear-right
  P.add('turret', box(0.48, 0.14, 0.40), 0.48, C3H - 0.05, 0.62);              // gunner hood
  P.add('turretDetail', box(0.52, 0.03, 0.44), 0.48, C3H + 0.02, 0.60);        // brow
  P.add('turretDark', box(0.40, 0.12, 0.03), 0.48, C3H - 0.06, 0.83);          // aperture
  P.add('turretGlass', box(0.28, 0.07, 0.014), 0.48, C3H - 0.07, 0.845, -0.20, 0, 0);
  // uk round (ref front render + batch-47 rows): the ref's commander pano
  // is a TALL TOWER at the roof's right edge — front tops 2.88..2.95 across
  // x 0.80..1.15 (our old 0.55-seat drum read 0.4 short there), and the
  // side rows carry a 2.85-2.87 sensor band across z_w -0.6..-1.15 (the
  // tower + pot cluster). Pedestal moved out + raised; head cap tops
  // 2.93w; hood deepened over both -0.97/-1.09 side windows; GPS/met pots
  // extend the band forward.
  P.add('turretDetail', cylY(0.085, 0.10, 0.30, 10), 0.87, C3H + 0.15, -2.25); // pano pedestal tower
  P.add('turretDark', cylY(0.14, 0.15, 0.22, 12), 0.87, C3H + 0.41, -2.25);    // pano head drum
  P.add('turretDark', box(0.72, 0.06, 0.30), 0.76, C3H + 0.55, -2.25);         // armored hood x 0.40..1.12, z_w -0.90..-1.20 (the ref's 2.88-2.98 front band spans x 0.33..1.15)
  P.add('turretDetail', box(0.06, 0.50, 0.09), 0.46, C3H + 0.28, -2.25);       // hood support mast (roof -> hood underside; §B2 attached)
  P.add('turretGlass', box(0.16, 0.10, 0.02), 0.87, C3H + 0.42, -2.09);
  P.add('turretDetail', cylY(0.085, 0.095, 0.24, 10), 0.72, C3H + 0.26, -1.95); // GPS pot (top 2.85w, z_w -0.75)
  P.add('turretDark', cylY(0.055, 0.055, 0.10, 8), 0.72, C3H + 0.43, -1.95);
  P.add('turretDetail', cylY(0.07, 0.08, 0.20, 10), 0.42, C3H + 0.25, -1.95);  // met sensor pot (top 2.82w, z_w -0.75; clear of hatch rim + GPS pot)
  P.add('turretDark', cylY(0.05, 0.035, 0.06, 8), 0.42, C3H + 0.395, -1.95);
  // hatches + periscopes + whips
  P.add('turret', cylY(0.24, 0.24, 0.05, 14), 0.55, C3H + 0.02, -1.55);        // commander hatch
  P.add('turret', cylY(0.22, 0.22, 0.05, 14), -0.60, C3H + 0.02, -1.35);       // loader hatch
  P.add('turretDark', torus(0.22, 0.012, 14), -0.60, C3H + 0.045, -1.35);
  periscope(P, 'turretDetail', 0.55, C3H + 0.06, -1.22);
  periscope(P, 'turretDetail', -0.60, C3H + 0.06, -1.05, -0.3);
  // FINISH r2: whips clustered at the print's own antenna station (its
  // 5.19w spike col sits z_w -1.46; the old -1.75..-1.90 seats cost three
  // 0.42 side cols) — trimmed under the 2.95 sensor datum; x ±0.90 rides
  // the print's front-view antenna columns.
  {
    // a1/a2 are TALL real whips (print's front-view antenna columns read
    // 5.2w at x ±0.9 — the tall pair rides its spike columns; side p95
    // stays on the RWS plateau: only 2 columns above the 2.95 datum,
    // budget <=4, aligned with the ref's own 5.2 spike).
    // uk round (2-pass adjudication): the print's 5.2 antenna spike is a
    // SUB-PIXEL FLICKER — it lit x 0.97 in one trace run and vanished the
    // next (AA-TEETER family: single-run reads are NOT orders). A chase to
    // h 2.75 also lifted the side-row rough so the 12% body filter ate the
    // -4.1 hullLengthM anchor column (dims 99.8 -> 87, the whip-rough
    // coupling now banked). Whips stay at REAL height (the FINISH r2
    // certified fit), a3 co-windowed with a2 so no lone proc column.
    const a1 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.75, rake: 0.0, seed: 7 });
    a1.position.set(-0.90, C3H + 0.02, -2.62);                                 // rake 0: the whip x-lean spread 3 front cols (kit rz-lean decode)
    P.turretG.add(a1);
    const a2 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.60, rake: 0.0, seed: 8 });
    a2.position.set(0.92, C3H + 0.02, -2.67);
    P.turretG.add(a2);
    const a3 = FITTINGS.antennaWhip({ mats: P.mats, h: 1.45, rake: 0.0, seed: 9 });
    a3.position.set(0.925, C3H + 0.02, -2.63);                                 // same front window + same -1.46w side column as a2
    P.turretG.add(a3);
  }
  // smoke: 2x5 low banks on the flanks (print smoke a-j) + ch1 r10b tube
  // tips + bores (circular mouths at 1x)
  smokeCluster(P, 1.10, 0.30, 0.55, 5, 0.85, 0.7);
  smokeCluster(P, -1.10, 0.30, 0.55, 5, -0.85, 0.7);
  smokeTubeTips(P, [[1.10, 0.30, 0.55, 0.85, 0.7], [-1.10, 0.30, 0.55, -0.85, 0.7]]);
  // bustle rack on the stepped tail face (§B3.2; FINISH r2: compacted to
  // the print's -2.13w turret tail — the old -3.62 rails read as 3
  // only-proc cover columns on the turret side row)
  {
    const bkT = 0.64, bkB = 0.22, bkZ = -3.31;                                  // rails 20mm-set into the tail face (rear extreme -3.335 = 32mm
    P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkT, bkZ);                  // clear of the -2.23w column window — AA-sliver law, 2nd pass)
    P.add('turretDetail', box(2.40, 0.05, 0.05), 0, bkB, bkZ);
    for (let k = 0; k < 11; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.15 + k * 0.23, (bkT + bkB) / 2, bkZ);
    P.add('turretDark', box(2.30, 0.30, 0.016), 0, (bkT + bkB) / 2, -3.315);    // mesh back panel
    // ch1-base rail-over-mesh read (r10 O5a): pale rail pair drawn over the
    // dark mesh panel (same envelope — the rails sit 2 mm proud of the mesh
    // inside the -3.335 certified extreme).
    for (const ry of [0.32, 0.50]) P.add('turretDetail', box(2.28, 0.018, 0.008), 0, ry, -3.319);
  }
  liftEye(P, 'turretDetail', -1.15, C3H + 0.03, 0.15);
  liftEye(P, 'turretDetail', 1.15, C3H + 0.03, -1.9);
  // ---- gun: 120 mm L55A1 SMOOTHBORE — evacuator at the Rh-120 station,
  // thermal sleeve, MRS collar, §B3.1 muzzle bore (shadow-named).
  // Muzzle +7.335 world = 11.50 overall (pivot world z 1.75).
  // FINISH r2 (§B3.1 MANTLETS-MANDATORY + owner order "distinctive
  // flat-faced mantlet"): a real flat-faced armored mantlet block at the
  // turret face (proud of the embrasure, pitches with the gun) + the
  // print's FAT root thermal sleeve (its plan gun columns run r~0.185 to
  // z_w 3.59) with clamp + step-down rings.
  P.addGunExtra(box(0.40, 0.30, 0.55), 0, 0.36, 0.45);                         // sight barbette over the gun
  P.addGunExtra(box(0.56, 0.44, 0.28), 0, 0.02, 0.62);                         // flat-faced mantlet block (face z_w 2.51)
  P.addGunExtraDark(box(0.58, 0.06, 0.26), 0, -0.21, 0.62);                    // mantlet chin shadow seam
  P.addGunExtra(cylZ(0.145, 0.30, P.q ? 20 : 12, 0.165), 0, 0, 0.86);          // boot collar ahead of the block
  P.addGunExtraDark(cylZ(0.150, 0.05, P.q ? 20 : 12), 0, 0, 0.78);             // boot seam
  P.addGunExtra(cylZ(0.185, 0.95, P.q ? 20 : 12), 0, 0, 1.32);                 // FAT root sleeve section (print z_w 2.60..3.55)
  P.addGunExtra(cylZ(0.192, 0.05, P.q ? 20 : 12), 0, 0, 1.10);                 // clamp ring
  P.addGunExtra(cylZ(0.130, 0.06, P.q ? 20 : 12), 0, 0, 1.82);                 // step-down ring
  buildGun(P, { len: 5.585, r: 0.082, sleeve: true, evac: 0.50, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: 5.585, r: 0.082 });                                     // §B3.1 (shadow-named, 3fca39b)
  // ch1-base STERN KIT (r10 O5b grammar, CR3 fit): draped cable + cleats
  // across the recessed center plate. Interior: z >= -3.977 (the -4.125
  // anchor posts own the -4.17 column; the cable rides the -3.96 plate
  // face), y 1.18..1.32 inside the plate band.
  KIT.towCable(P, [[-0.58, 1.30, -3.95], [0, 1.21, -3.955], [0.58, 1.30, -3.95]]);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.08, 0.08, 0.045), s * 0.58, 1.315, -3.935);
  // ch1-base family tone kit + gear-air backers (r8/r9 recipes; family
  // resemblance with challenger1 + challenger2). Backer wall spans the
  // SKIRTED bays only (the rear run is honestly naked per the print).
  ch1BaseToneKit(P, { cloth: 0x262b1d, clothEnv: 0.05, dark: 0x282c22 });
  ch1BaseGearBackers(P, [
    [0.016, 0.32, 3.60, 0.970, 0.44, 0.85],                                    // inter-wheel shadow wall (x 0.962..0.978; band inner 0.995)
    [0.46, 0.42, 0.02, 1.23, 0.49, 2.095],                                     // catch plates at the skirted scallop stations
    [0.46, 0.42, 0.02, 1.23, 0.49, 1.185],
    [0.46, 0.42, 0.02, 1.23, 0.49, 0.275],
  ]);
  // decals: squadron number + ZAP plate
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [1.42, 0.40, -1.4], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'number', P.spec.visual.number || '30', 0.34, [-1.42, 0.40, -1.4], -Math.PI / 2, 0, -0.06);
  P.decal('hull', 'number', 'KC93AB', 0.32, [0.80, 1.26, 3.32], 0, -1.27);
  // soot PINNED on the recessed center plate face (§C: decals are mask
  // geometry — never floated mid-air)
  P.decal('hull', 'soot', null, 0.42, [-0.45, 1.10, -3.962], Math.PI);
  P.topY = 1.05;
}
/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const CHALLENGER_BUILDERS = {
  challenger2: buildChallenger2,
  challenger_3: buildChallenger3,
};
