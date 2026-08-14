#!/usr/bin/env node
// tools/vertex-normalize.mjs — VERTEX-ROUND leg 2 (owner ruling 2026-08-01):
// per-tank axis-wise normalization PLANS for the stylized russia prints.
//
// Each plan is a continuous piecewise-linear warp per axis, authored in GATE
// METERS (the width-normalized world of the gate/lab), derived from the
// vertex-extract measurements (docs/references/vertex/<id>.json) and the
// published dims. This tool converts the plans into GLB-WORLD control points
// (through the extract's affine map: axis permutation x meters-per-unit x
// offset x harness flip) and prints the exact python literals for the
// batch-12 recipes in tools/repair_oracles.py — the recipes stay
// self-contained and census-guarded; this tool is the derivation record.
//
//   node tools/vertex-normalize.mjs            # print all plans
//   node tools/vertex-normalize.mjs --ids=a,b  # subset
//   node tools/vertex-normalize.mjs --verify   # post-repair: re-extract and
//                                              # assert measured ~= published
//
// WARP DESIGN RULES (documented per tank in the packets):
//  * width (gate x) is NEVER touched — it is the safeScale anchor;
//  * y maps anchor ground (0 -> 0); hull zones keep near-1 slopes when the
//    print's deck is true, and the turret/tower zones compress so the WIDE
//    roof plateau lands at published height (p95 law: only masts/thin spikes
//    may stay above);
//  * z maps bring the side hull-mask span to published hullLengthM about the
//    hull center, with a separate barrel zone slope forward of the hull nose
//    landing the muzzle at published overallLengthM (continuous at the nose);
//  * every zone slope stays > 0 (monotone, no fold-over, no tearing).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VDIR = path.join(ROOT, 'docs/references/vertex');

// ---- plans in GATE METERS: [from, to] control points ----------------------
// Derivations: docs/references/vertex/<id>.json measured landmarks vs pubDims
// (see the per-tank packet batch-12 sections for the full derivation).
export const PLANS = {
  // AFV program batch-39 (the AFV-r1 formal warp request, bmp2.md): the
  // Bergman print is -5.8% short — uniform z stretch about the centred
  // mask mid to the published 6.72; y identity (bodyH -1.1% honest);
  // width anchor untouched.
  bmp2: {
    file: 'bmp2_bergman',
    y: [[0, 0], [2.471, 2.471]],
    z: [[-3.166, -3.36], [3.166, 3.36]],
    yTopMax: 2.49,
  },
  // AFV owner drop (2026-08-04, 42manako CC-BY): +10.7% stature, -8% short.
  // Uniform z stretch to the published 6.55 (IFV: overall = hull); y identity
  // below the 2.06 deck knee, turret band 2.06..3.30 -> published 2.98 top.
  // Width -1.5% never touched (anchor).
  m2a2_bradley: {
    file: 'm2_bradley_ifv',
    y: [[0, 0], [2.06, 2.06], [3.30, 2.98]],
    z: [[-3.012, -3.275], [3.012, 3.275]],
    yTopMax: 2.99,
  },
  t62mv1: { // bergman bake: crown/cupola stature + bow-log body span
    file: 't62_bergman',
    y: [[0, 0], [1.50, 1.44], [2.50, 2.40], [2.85, 2.43]],
    z: [[-3.58, -3.315], [3.58, 3.315], [5.84, 6.025]],
    yTopMax: 2.50,
  },
  t64bv1: { // SHORT print: stretch hull +9%, tube to published overall
    y: [[0, 0], [2.283, 2.17]],
    z: [[-4.30, -4.57], [1.70, 1.97], [4.31, 4.655]],
    yTopMax: 2.25,
  },
  t72b_1987: { // Super-Dolly crown +14%, hull +9%
    // r2: p95 roof read 2.11 with the first map (crown MASS rides 2.46-2.60,
    // not the 2.73 peak) — mid anchor moved to (2.50 -> 2.21)
    y: [[0, 0], [1.45, 1.38], [2.50, 2.21], [2.88, 2.31]],
    z: [[-4.84, -4.53], [2.45, 2.14], [4.87, 5.00]],
    yTopMax: 2.37,
  },
  t72bu: { // +30% stature, +17.7% hull span (worst length in family)
    y: [[0, 0], [1.61, 1.44], [2.87, 2.21], [3.58, 2.50]],
    z: [[-5.44, -4.835], [2.63, 2.025], [5.45, 4.695]],
    yTopMax: 2.56,
  },
  t72b3m: { // Sosna tower +47%; hull near-true; tube short
    // r2: tower band p95 read +1.3% — top pinned inside the dims grace
    y: [[0, 0], [1.41, 1.41], [2.75, 2.20], [3.42, 2.25]],
    z: [[-4.53, -4.46], [2.28, 2.21], [4.79, 5.07]],
    yTopMax: 2.31,
  },
  t90sm: { // welded towers +39.5%; wide tower band must land inside grace
    y: [[0, 0], [1.50, 1.38], [2.53, 2.18], [2.80, 2.22], [3.15, 2.26]],
    z: [[-3.81, -3.43], [3.81, 3.43], [6.73, 6.20]],
    yTopMax: 2.32,
  },
  pt91m: { // +23.5% stature; met mast stays proud (thin, p95-exempt)
    // r2: p95 roof read -1.7% — crown anchor raised to (2.70 -> 2.18)
    y: [[0, 0], [1.55, 1.40], [2.70, 2.18], [3.82, 2.62]],
    z: [[-3.83, -3.43], [3.83, 3.43], [6.58, 6.10]],
    yTopMax: 2.68,
  },
  t90a_vladimir: { // +28.6% stature, +14% length (worst print pre-repair)
    y: [[0, 0], [1.40, 1.40], [2.85, 2.21], [3.81, 2.60]],
    z: [[-5.20, -4.72], [2.62, 2.14], [5.22, 4.81]],
    yTopMax: 2.66,
  },
  t90a: { // xarchenko: roof band +19%, hull +9% mask
    y: [[0, 0], [1.35, 1.35], [2.60, 2.20], [2.91, 2.30]],
    z: [[-3.74, -3.43], [3.74, 3.43], [6.13, 6.10]],
    yTopMax: 2.36,
  },
  // ---- batch-14: merkava 3B/3C (certified wholeCurves caps retired at the
  // source). Shared hull: body 7.409 (-2.5% vs pub 7.60) stretched about its
  // center; fused-short MG251 muzzle +4.13 -> +4.8525 = tail'+9.04 (pub
  // overall; barrel zone continuous at the nose). Stature: 3B roof-furniture
  // band 2.84 -> 2.66 (pub height), 3C 2.766 -> 2.66; hull/deck true to 2.50
  // (slope 1). Whip tips compress with the last zone (3B ~3.61, 3C ~3.92) —
  // build re-tunes whips in the push round. Width untouched (-0.8%, anchor).
  merkava3b: { // +6.7% stature band, -2.5% body, -8.6% overall (short gun)
    y: [[0, 0], [2.50, 2.50], [2.84, 2.66]],
    z: [[-4.092, -4.1875], [3.317, 3.4125], [4.13, 4.8525]],
    yTopMax: 3.65,
  },
  merkava3c: { // +3.9% stature band, same shared hull/gun as 3B
    y: [[0, 0], [2.50, 2.50], [2.766, 2.66]],
    z: [[-4.092, -4.1875], [3.317, 3.4125], [4.13, 4.8525]],
    yTopMax: 3.95,
  },
  // ---- batch-15: tejas print W1 (m1a1/m1a1ha/m1a2_tejas shared oracle).
  // Length/width TRUE (±0.6%); the +34.8% height is ENTIRELY the oversized
  // CROWS/M240/whip cluster above the true 2.36 roof. W1 ceiling-compress
  // per the m1a1.md work order: everything above 2.46 -> 2.46 + 0.12*(y-2.46)
  // (whips 4.09 -> 2.656, CROWS 3.30 -> 2.561). Hull/deck/roof untouched
  // (nothing but furniture lives above 2.46). z identity (length true).
  // ---- batch-18: merkava 3D/1B (audit 2026-08-02; batch-14 class).
  merkava3d: { // -8.5% overall (MG251 +4.134), +5.3% p95 (49-col band)
    y: [[0, 0], [2.50, 2.50], [2.852, 2.66]],
    z: [[-4.136, -4.207], [3.322, 3.393], [4.134, 4.833]],
    yTopMax: 3.60,
  },
  merkava1b: { // -6.0% overall (M64 +4.053), +6.5% p95 (45-col dome band)
    y: [[0, 0], [2.50, 2.50], [2.872, 2.65]],
    z: [[-4.063, -4.1675], [3.178, 3.2825], [4.053, 4.4625]],
    yTopMax: 3.50,
  },
  m1a1: { // file m1a2_tejas.glb — W1b (batch-16): tail slope 0.12 -> 0.03
    // so the 8-col knee band 2.545-2.572 lands inside the 2.464 dims grace
    // (agent-measured residual law, m1a1.md post-warp round).
    file: 'm1a2_tejas',
    y: [[0, 0], [2.46, 2.46], [4.09, 2.5089]],
    z: [[-4.8, -4.8], [4.9, 4.9]],
    yTopMax: 2.56,
  },
  // ---- batch-19: m1a2 sepv3 print (m1a2_sepv3_dannzjs.glb; specs.js
  // TurretPivot rig). Width TRUE (-0.5%). Hull -5.9% short: stretch body
  // x1.0645 (hullMask 7.461 -> 7.93), muzzle pinned so overall = 9.77
  // (tube segment gives back its +2% overmodel). Height +59.4% is the
  // crown-band furniture + antenna spikes (crown 2.6-3.0, spikes 3.89 /
  // 5.23 at z -2.16/-1.81, pair 3.13 at z 0): knee 2.38 (deck 1.86 and
  // ring 2.26 untouched), crown band -> 2.407-2.455 (slope 0.123, tejas
  // W1 class), spikes ride the extended slope then clamp at yTopMax
  // (emit adds +0.02 slack -> ceiling 2.46, +0.8% inside dims grace).
  // 4th point flattens the tail to slope 0.009 (tejas W1b class — y_top_max
  // is an ASSERTION in _axis_warp, not a clamp): spikes land 2.456-2.475.
  // p95 lands 2.407-2.475 for ANY percentile placement (raw-sim p95 3.129
  // -> 2.456; extract p95 3.888 -> 2.463). sepv2 DEFERRED: defective oracle
  // (131-vert turret interpenetration 0.81m + hull-node masts at y 3.62)
  // needs triage before any warp.
  m1a2_legacy: { // file m1a2_sepv3_dannzjs.glb
    y: [[0, 0], [2.38, 2.38], [2.99, 2.455], [5.23, 2.475]],
    z: [[-3.713, -3.9565], [3.73, 3.9665], [5.85, 5.8135]],
    yTopMax: 2.48,
  },
  // ---- batch-17: isu152 (fixedMount casemate; REG batch-17 prep entry).
  // Print UNIFORMLY SQUAT (-11.1% p95 roof 2.204 vs 2.48) + body -5.8%
  // (6.40 vs 6.77) + gun short (overall 8.35 vs 9.05). Inverse of the
  // proud-band class: UNIFORM y stretch x1.1252 from ground (p95 -> 2.48
  // for any percentile placement; ratios preserved so the 12% filter
  // behaves identically). Body z x1.0609 about body center -0.9705
  // (rear -4.3555, front 2.4145), gun segment 2.23->4.18 lands muzzle at
  // 4.6945 = rear + 9.05 overall. hullMask verify compares overallLengthM
  // under fixedMount (extract fix, this batch).
  isu152: {
    y: [[0, 0], [2.204, 2.48]],
    z: [[-4.171, -4.3555], [2.23, 2.4145], [4.18, 4.6945]],
    yTopMax: 2.51,
  },
  // ---- batch-20: abramsx (abramsx-mortavex.glb). Body/width TRUE (-0.3%/
  // 0%); +41% height is the RWS bridge band (3.0-3.47 across z -0.83..
  // +0.42, ~15% of cols) + rear sensor rows 3.24-3.25 + antenna 4.13.
  // Tejas-W1 knee 2.30 (crown/roof <=2.3 untouched), RWS band -> 2.44-
  // 2.451, antenna -> 2.468; simulated p93/p95/p97/max = 2.448/2.449/
  // 2.451/2.468 (+0.3..+1.1%). Overall +3.5% (tube long): body identity,
  // tube segment x0.85 pins muzzle at rear+9.77. The 342-vert turret
  // interpenetration is INTERIOR (below-deck bustle content, silhouette
  // unaffected) — packet cert already documents the fused shell class.
  // ---- batch-21: m1a2_sepv2 (recovered; OWNER ORACLE SWITCH 2026-08-03 —
  // the sepv3 print is deprecated as the m1a2's reference; the owner's
  // exemplar is this SEPv2 drop). Body/overall both -16.5%: uniform z
  // x1.1972 about body center fixes both (overall lands -0.25%). Height
  // +30.2% = hull-node masts 3.62 + deck furniture 2.56-2.96: knee 2.30,
  // band -> 2.44 @2.95, tail flat to 2.465 @3.65. Sim: p90/p93/p95/p97/
  // max = 2.437/2.439/2.440/2.464/2.464 — all in grace. Interpenetration
  // (131 verts, 0.81m) is INTERIOR-only — warp legal (triage 2026-08-02).
  m1a2_sepv2: {
    y: [[0, 0], [2.30, 2.30], [2.95, 2.44], [3.65, 2.465]],
    z: [[-3.295, -3.9457], [3.305, 3.9556]],
    yTopMax: 2.47,
  },
  // ---- batch-23: t90m (minehffd print; triage 2026-08-03). Width/roof
  // TRUE; +25.9% bodyH is the Kord/bustle furniture band (crest 2.72-2.97
  // over z -2.4..-1.2): knee 2.20, band -> 2.253 (post-map p95 ~2.24, in
  // grace). hullMask +9.1%: body z x0.9169 about center -1.2045; muzzle
  // pinned rear+9.63 (tube segment x~1.15 absorbs it, abramsx pin class).
  t90m: {
    y: [[0, 0], [2.20, 2.20], [2.973, 2.253]],
    z: [[-4.946, -4.6352], [2.537, 2.2262], [4.954, 4.9948]],
    yTopMax: 2.26,
  },
  // ---- batch-24: t84 (recovered; triage 2026-08-03). Roof TRUE (cols
  // 2.13-2.225 vs pub 2.22); furniture band 2.53-2.58 (Kord/sight cluster
  // z -1.67..-1.17): knee 2.23 -> band 2.240-2.241, in grace. Hull AND
  // fused tube bake short (hullMask -9.7%, overall -11.8%): body x1.1069
  // about center -1.09; muzzle pinned rear+9.72 (tube segment x1.208).
  t84: {
    y: [[0, 0], [2.23, 2.23], [2.603, 2.242]],
    z: [[-4.288, -4.6299], [2.108, 2.4499], [4.294, 5.0901]],
    yTopMax: 2.245,
  },
  // ---- batch-25: t54 (recovered, post batch-22 orientation fix). Dome
  // crest TRUE (2.29-2.38 vs pub 2.40); cupola cluster 2.70-2.81 (z
  // -1.13..-0.43): knee 2.40 -> 2.40-2.424, p95 in grace. hullMask +2%:
  // body x0.9808 about center -1.4095; tube long (+10%): muzzle pinned
  // rear+9.00 (segment x0.9017). Fused shell (no gun node).
  t54: {
    y: [[0, 0], [2.40, 2.40], [2.807, 2.424]],
    z: [[-4.698, -4.6350], [1.879, 1.8160], [4.706, 4.3650]],
    yTopMax: 2.43,
  },
  // ---- batch-26: amx30 + amx30b2 (ahab prints, post batch-22 hull fix).
  // Roofs TRUE (~2.17-2.22 vs pub 2.29); proud band = bustle stowage
  // 2.27-2.47 + searchlight/cupola blob (amx30 2.91, b2 2.755) + antenna
  // tips (3.152 / 2.985): knee 2.20 -> tops land 2.31, p95 well in grace.
  // Hulls short (-2.2% / -7.4%): body stretched about center; muzzles
  // pinned rear+9.48 (segments x1.03 / x1.088).
  amx30: {
    y: [[0, 0], [2.20, 2.20], [3.152, 2.31]],
    z: [[-4.622, -4.6950], [1.822, 1.8950], [4.628, 4.7850]],
    yTopMax: 2.32,
  },
  amx30b2: {
    y: [[0, 0], [2.20, 2.20], [2.985, 2.31]],
    z: [[-4.377, -4.6210], [1.725, 1.9690], [4.382, 4.8590]],
    yTopMax: 2.32,
  },
  // ---- batch-29 PILOT (gate-in-loop law): leo2a5 band-flatten. Roof-
  // furniture band 2.77-3.01 over z -0.67..+0.78 (+14.1% bodyH vs pub
  // 2.64) -> 2.659-2.696, under the proc's 2.697 anchor; whip cluster
  // 4.107-4.114 rides the tail segment to ~2.739 (abramsx antenna
  // precedent; proc whips retune next leopard round). Length axes TRUE
  // (hullMask +2.1% is real rack content, overall 0%) — y-only warp.
  // Post-warp ref p95 lands ~2.68-2.69 (+1.7% — bookkeeping flag only;
  // dims measures the PROC, which anchors 2.697 with <2% p95).
  leo2a5: {
    y: [[0, 0], [2.64, 2.64], [3.014, 2.6959], [4.114, 2.7391]],
    z: [[-3.949, -3.949], [6.031, 6.031]],
    yTopMax: 2.745,
  },
  // ---- batch-33: t80 + t80b end compression (russia r26 blocker: the
  // certified 4.3%/2.5%-long hull ends own ~60% of the remaining whole-row
  // error; heights TRUE — z-only, body-center compress + muzzle pin).
  t80: {
    y: [[0, 0], [3.0, 3.0]],
    z: [[-4.883, -4.7385], [2.186, 2.0415], [4.889, 4.9215]],
    yTopMax: 4.5,
  },
  t80b: {
    y: [[0, 0], [3.0, 3.0]],
    z: [[-4.852, -4.7675], [2.098, 2.0135], [4.857, 4.8925]],
    yTopMax: 4.5,
  },
  abramsx: {
    y: [[0, 0], [2.30, 2.30], [3.0, 2.44], [4.2, 2.47]],
    z: [[-3.932, -3.932], [3.968, 3.968], [6.168, 5.838]],
    yTopMax: 2.48,
  },
  // ---- soviet-heavy batch (derived 2026-08-03; extract of that date).
  // is3 (panzerfactory): hull HONEST (bodyLen +0.7%, hullMask +1.0%, width
  // 0%) but the turret is +27.9% proud — dome crown mass 2.46-2.55 with a
  // broad DShK/cupola cluster 3.0-3.14 (not a thin mast: it holds p95 at
  // 3.13). Tejas-W1 ceiling class: identity to the 2.30 dome shoulder,
  // crown band 2.30-2.55 -> 2.44 (slope 0.56), furniture 2.55-3.135 flat
  // to 2.47 (slope 0.051). Sim on side_whole: p90/p93/p95/p97 =
  // 2.461/2.461/2.463/2.470 (+0.55% vs pub 2.45, inside grace for any
  // percentile seat). z: hull mask 6.836 -> 6.77 about center, D-25T
  // muzzle 5.666 -> 6.465 = rear' + 9.85 (print gun -7.8% short; barrel
  // zone slope 1.369 — merkava batch-14 class). Post-warp the Ø0.35 brake
  // band crosses the 12% filter on the REFERENCE trace (bodyLen reads
  // ~9.76) — verify keys on the gun-excluded hullMask, unaffected.
  is3: {
    file: 'is3_panzerfactory',
    y: [[0, 0], [2.30, 2.30], [2.55, 2.44], [3.135, 2.47]],
    z: [[-3.418, -3.385], [3.417, 3.385], [5.666, 6.465]],
    yTopMax: 2.50,
  },
  // is6b (snowleopard): print UNIFORMLY SHORT+SQUAT with a LONG gun —
  // bodyH -6.2%, hullMask -4.7%, overall +8.3%, width 0% (the loader pins
  // width via safeScale 1.0847). isu152 inverse class: uniform y stretch
  // x1.0666 from ground (p95 2.344 -> 2.50 by construction; ratios
  // preserved for the 12% filter). z: body -4.928..1.65 stretched x1.0491
  // about center -1.639 (hullMask -> 6.90), D-30 muzzle 4.935 -> 4.011 =
  // rear' + 9.10 (barrel zone slope 0.67). Sim: p95 2.4905 (-0.4%),
  // overall 9.094 (-0.07%). 65-vert turret interpenetration is the dome
  // skirt inside the ring recess — silhouette-interior, warp legal.
  is6b: {
    file: 'is6b-snowleopard',
    y: [[0, 0], [2.344, 2.50]],
    z: [[-4.928, -5.089], [1.65, 1.811], [4.935, 4.011]],
    yTopMax: 2.55,
  },
  // ---- UK priority pair (agent derivation 2026-08-03; extracts
  // docs/references/vertex/{chieftain5,challenger1}.json).
  // chieftain5: hull -4.6% (mask 7.173 vs 7.52), overall -3.4% (muzzle
  // 6.839 -> tail'+10.79 = 7.03); width -1.9% untouched (anchor). Stature:
  // deck/roof true to the 2.56 crest, but the print CUPOLA tops 2.735 vs
  // published 2.90 (squat crown band) and the twin sight masts + whip are
  // 4 thin 96-cols at 3.54-3.80 owning p95 (bodyH read 3.537, +22%).
  // Warp: cupola band 2.56->2.735 rises to 2.56->2.90 (published cupola),
  // masts knee-compress to 2.93-2.94. Post-warp 96-col p95 sim: mast cols
  // 2.930-2.940, cupola col 2.900 -> p95 in [2.900, 2.940] (+0.0..+1.4%)
  // for ANY 3-5 mast-col placement. Build retunes mast rods ~2.93 after.
  // CAVEAT (orchestrator): this print is Z-UP in glb world (gate y = glb Z,
  // gate long = -glb Y; loader pitchOffset -pi/2) — _axis_warp as written
  // applies y_map to glb axis 1 and assumes height on glb y; it needs a
  // height-axis parameter (or a pre-rotation pass) before these literals
  // can land. The long_axis='y' emit below is the long-map axis; the y_map
  // must apply to glb Z for this file.
  chieftain5: {
    y: [[0, 0], [2.56, 2.56], [2.735, 2.90], [3.80, 2.94]],
    z: [[-3.586, -3.76], [3.587, 3.76], [6.839, 7.03]],
    yTopMax: 2.95,
  },
  // challenger1: hull -3.9% (mask 7.992 vs 8.32), overall -6.3% (muzzle
  // 6.783 -> tail'+11.50 = 7.34); width 0%. Stature: deck 1.73 true; the
  // wide roof plateau tops 2.756 vs published 2.95 (squat -6.6%) and the
  // three whip antennas read as 4 thin 96-cols at 3.26-3.33 owning p95
  // (bodyH 3.260, +10.5%). Warp: roof band 2.60->2.76 rises to 2.60->2.93,
  // antennas knee to 2.97-2.98. Post-warp p95 sim: plateau cols 2.922,
  // antenna cols 2.974-2.980 -> p95 in [2.922, 2.980] (-0.95..+1.0%) for
  // any percentile placement. Standard Y-up frame — _axis_warp applies
  // as-is. NOTE: extract's ORIENTATION MISMATCH on this print is a FALSE
  // ALARM — the loader's CHALLENGER_TURRET_FOLLOWERS (roof panels to 2.76
  // + antennas) are not modeled by the extract, so the hull top-curve
  // reads the turret roof and the glacis vote fell to the normal-vote
  // fallback. Glacis truly faces +z (hull tops fall 2.0@z2.2 -> 1.2@z3.9;
  // bow belly rake rises to the +z nose; tail undercut at -z; gun +z).
  challenger1: {
    y: [[0, 0], [2.60, 2.60], [2.76, 2.93], [3.33, 2.98]],
    z: [[-3.996, -4.16], [3.996, 4.16], [6.783, 7.34]],
    yTopMax: 2.99,
  },
  // fv510: uniformly SHORT print (-10.9% hull mask = overall; the RARDEN
  // never clears the bow, so one centered hull zone covers both and the
  // pure centered stretch is MIRROR-INVARIANT — the print's flip:true
  // cannot corrupt the literals). Stature near-true: p95 2.851 (+1.8%,
  // the gunner-sight pod band) with three thin mast cols to 3.90 — knee at
  // 2.60 drops the pod to 2.787 and the masts to 2.82-2.83; p95 lands
  // -0.5..+0.7% for any percentile placement. Width -0.3% untouched.
  // Build retunes the mast rod (~2.83) post-warp.
  fv510: {
    y: [[0, 0], [2.60, 2.60], [2.86, 2.795], [3.90, 2.83]],
    z: [[-2.822, -3.17], [2.824, 3.17]],
    yTopMax: 2.85,
  },
  // ---- patton family (agent derivation 2026-08-03; extracts this batch).
  // All three are Z-ONLY body-span + muzzle-pin warps (merkava batch-14
  // class); width anchored, y IDENTITY — heights read +1.8/-1.1/+0.6%.
  // The m26 +1.8% is the over-M2 datum measuring 3.078 vs pub 3.02:
  // RECOMMEND spec true-up heightM 3.02 -> 3.08 (userdrops6.js, owner)
  // instead of squashing the wide 2.92-3.08 periscope/cupola roof band;
  // until then --verify reads m26 height +1.8 vs tol 1.6 (known, benign).
  // Extract ORIENTATION MISMATCH warnings on m26/m46 are FALSE ALARMS of
  // the descent-run vote (the Pershing rear engine deck out-runs its steep
  // glacis; m46 runs 0.40/0.42 — a coin flip): boards verify bow under gun
  // on both (shots/patton-r1/base/). m45_patton: NO WARP — hullMask -0.9%
  // inside grace (bodyLen -5.1% is a 12%-filter artifact on sparse tail
  // columns, not real shortness); its overall convention (pub 6.6 vs
  // seated muzzle 6.468) is an open spec question for the owner.
  m26_pershing: { // body 6.076 -> 6.33 about center -1.317; muzzle pinned
    // at tail'+8.65 (tube slope 0.881)
    y: [[0, 0], [3.101, 3.101]],
    z: [[-4.355, -4.482], [1.721, 1.848], [4.355, 4.168]],
    yTopMax: 3.11,
  },
  m46_patton: { // body 6.149 -> 6.33; LONG m26-reuse tube 8.786 -> 8.48
    // (slope 0.815) — RETIRES the certified tube cap (m46_patton.md)
    y: [[0, 0], [3.169, 3.169]],
    z: [[-4.393, -4.4835], [1.756, 1.8465], [4.393, 3.9965]],
    yTopMax: 3.18,
  },
  m47_patton: { // body 6.266 -> 6.33; short tube 8.206 -> 8.51 (slope 1.124)
    y: [[0, 0], [3.393, 3.393]],
    z: [[-4.103, -4.135], [2.163, 2.195], [4.103, 4.375]],
    yTopMax: 3.40,
  },
  // ---- misc/Euro-Asia moderns batch (derived 2026-08-03; extracts of that
  // date). Sims below are the bodyExtent96 dims replica re-run under the
  // candidate map on side_whole_96 (analyze-styl scratchpad method, same as
  // batch-15/19/20).
  // leclerc (andertan): hull TRUE (bodyLen -0.6%, overall -0.8%, width 0%);
  // +9.1% p95 height is a 7-column furniture band ONLY (pano head 2.76 @z
  // -3.0, crosswind mast 3.06 @z -2.30, antenna pots 2.76 @z -0.4; roof
  // plateau 2.35-2.45 sits UNDER the published 2.53 — honest). Tejas-W1b
  // ceiling class: identity to 2.46, band -> 2.50 (slope 0.133), tail to
  // max 3.065 -> 2.541. Sim p90/93/95/97/max = 2.445/2.500/2.500/2.500/
  // 2.540 (h -1.3%). z IDENTITY: hullMask +3.4% (7.114 vs 6.88) is the
  // REAL rear stowage-rack overhang (band 1.30-1.47, 12%-filter-exempt,
  // z -4.895..-4.645) — verify will keep flagging hullMask on this print;
  // documented as accepted-real-overhang, the build carries the same rack.
  leclerc: {
    file: 'char_leclerc_andertan',
    y: [[0, 0], [2.46, 2.46], [2.761, 2.50], [3.07, 2.541]],
    z: [[-4.895, -4.895], [4.895, 4.895]],
    yTopMax: 2.55,
  },
  // t80u (javanilga): deck TRUE at 1.35 (55 cols); the packet's certified
  // "~9-13% tall upper works" measures as a 21-column proud band (clamshell
  // + 1G46/Utyos cluster 2.35-2.67 over z 0.05..1.84) -> p95 2.482 (+12.6%
  // vs 2.20). The DOME itself is only mildly proud (crown ~2.28 vs pub roof
  // 2.20), so the map keeps a near-1 dome zone and squashes the furniture
  // band: knee 1.35, dome shoulder 2.28 -> 2.16 (slope 0.871), p95 band
  // 2.482 -> 2.19 (slope 0.148), Utyos tail 2.67 -> 2.22. Sim
  // p90/93/95/97/max = 2.183/2.189/2.190/2.216/2.220 (h -0.6%).
  // z: hullMask -1.2% stays (identity through the body); barrel zone
  // stretches the short tube so the muzzle lands at rear+9.65 (6.045 ->
  // 6.188, slope 1.055). RETIRES the partially-tall-print certified
  // ceilings in t80u.md (hull 45-55 / whole 19-30 / turret 39-50 /
  // stations 35-45).
  t80u: {
    file: 't80u_javanilga',
    y: [[0, 0], [1.35, 1.35], [2.28, 2.16], [2.482, 2.19], [2.67, 2.22]],
    z: [[-3.462, -3.462], [3.463, 3.463], [6.045, 6.188]],
    yTopMax: 2.24,
  },
  // type90 (recovered): the packet's "certified ~20% tall/long" measures
  // +59.3% p95 — roof band 2.8-2.9 (+21%, 13 cols) under a REAR MAST
  // CLUSTER to 4.42 (z -3.24..-2.56) that holds p95 at 3.73; deck bands
  // 1.553 (main) / 1.733 (engine) print +9..+21% tall vs the 1.42-1.46
  // published-proportion decks. Two-knee map: decks -> 1.42/1.46, roof
  // band 2.90 -> 2.31, mast tail 4.42 -> 2.40 (slope 0.059). Sim
  // p90/93/95/97/max = 2.278/2.316/2.359/2.380/2.400 (h +0.8%). z: body
  // 7.652 -> 7.45 about hull-mask center -0.813 (slope 0.974); muzzle
  // 4.639 -> rear'+9.76 = 5.2315 (short tube, slope 1.421).
  type90: {
    y: [[0, 0], [1.553, 1.42], [1.733, 1.46], [2.90, 2.31], [4.42, 2.40]],
    z: [[-4.639, -4.5285], [3.013, 2.9215], [4.639, 5.2315]],
    yTopMax: 2.41,
  },
  // ariete (dustymojito, quarantine oracle): SHORT print — hullMask -4%
  // (7.29 vs 7.59), overall -6.3% (9.059 vs 9.67); roof plateau 2.25-2.35
  // honest (under pub 2.50), +5.3% p95 is the 12-col pano/sight band
  // 2.55-2.78. y: identity to 2.40, band -> 2.50, tail 2.784 -> 2.52. Sim
  // p90/93/95/97/max = 2.495/2.499/2.500/2.500/2.520 (h -0.1%). z: body
  // x1.0412 about hull-mask center -0.884 (rear -4.679, nose 2.911);
  // muzzle 4.529 -> rear'+9.67 = 4.991 (slope 1.176).
  ariete: {
    file: 'ariete-dustymojito',
    y: [[0, 0], [2.40, 2.40], [2.634, 2.50], [2.784, 2.52]],
    z: [[-4.529, -4.679], [2.761, 2.911], [4.529, 4.991]],
    yTopMax: 2.53,
  },
  // type74 (nullops, quarantine oracle; scaleToOverall registration — the
  // loader re-normalizes post-warp, verify must re-check): near-uniform
  // +14% tall print — deck band 1.5-1.6, dome/cupola band to 2.827 (18
  // cols at 2.8) vs pub 2.48; whip spike 3.058 @z -2.03. y: 1.60 -> 1.38
  // (slope 0.863), band 2.827 -> 2.46 (slope 0.880), tail -> 2.49. Sim
  // p90/93/95/97/max = 2.460/2.460/2.460/2.460/2.490 (h -0.9%). z: body
  // 6.849 -> 6.70 about mask center -1.1135 (slope 0.978); muzzle 4.538 ->
  // rear'+9.42 = 4.9565 (slope 1.221).
  type74: {
    file: 'type74-nullops',
    y: [[0, 0], [1.60, 1.38], [2.827, 2.46], [3.058, 2.49]],
    z: [[-4.538, -4.4635], [2.311, 2.2365], [4.538, 4.9565]],
    yTopMax: 2.50,
  },
  // recon_tank: NO PLAN — fictional community vehicle (Mophs, CC-BY); its
  // spec dims are authored fantasy numbers that disagree with the print
  // structurally (bodyLen -12.5%, hullMask +15% = gun-in-hull-mask span,
  // deck plateau 2.30 vs the profile's 1.62 roofY, antenna to 4.45).
  // Needs an owner/orchestrator ruling on which is sovereign (re-spec dims
  // to the print vs warp the print to the invented dims) before any warp
  // or rebuild is meaningful. Triage 2026-08-03: reference renders, gate
  // rows honest, turret row empty-mask signature (mean 100 / cover 100).
  // ---- soviet-heavy zero rows (agent derivation 2026-08-03; extracts of
  // that date; triage: all three references RENDER — ledger zeros honest).
  // is7 (snowleopard): print SHORT everywhere — hullMask -11.1%, overall
  // -9.7%, bodyH -5.9% (dome plateau 2.2-2.35, thin cupola/KPVT spikes to
  // 2.62). Uniform y stretch x1.0625 anchored on the replica's own p95
  // (2.447 -> 2.60; spikes ride to ~2.78, 10/657 trace cols — replica
  // p95-invisible). z: hull -5.046..1.513 stretched x1.1252 about center
  // -1.7665 (hullMask -> 7.38), S-70 muzzle 5.045 -> 5.713 = rear' + 11.17
  // (short-gun barrel zone slope 0.907). Sim on side_whole_96: h 2.6001,
  // hullMask 7.380, overall 11.186 (+0.14%). 420-vert turret dip is the
  // dome skirt inside the ring recess — interior, warp legal. RETIRES the
  // is7.md r5 "print 9-11% short" packet cap at the source.
  is7: {
    file: 'is7-snowleopard',
    y: [[0, 0], [2.447, 2.60]],
    z: [[-5.046, -5.457], [1.513, 1.923], [5.045, 5.713]],
    yTopMax: 2.85,
  },
  // object279 (snowleopard): print short+squat — hullMask -9.1%, bodyH
  // -8.3%, overall -5.2%, width 0%. Uniform y stretch x1.0906 (replica p95
  // 2.384 -> 2.60; box top 2.397 -> 2.615 stays the saucer dome crown).
  // z: hull -4.855..1.5 stretched x1.0999 about center -1.6775 (hullMask
  // -> 6.99), M-65 muzzle 4.855 -> 5.067 = rear' + 10.24 (slope 0.943).
  // Sim on side_whole_96: h 2.6001, hullMask 6.990, overall 10.252
  // (+0.12%). 266-vert turret dip interior — warp legal.
  object279: {
    file: 'object279-snowleopard',
    y: [[0, 0], [2.384, 2.60]],
    z: [[-4.855, -5.173], [1.5, 1.817], [4.855, 5.067]],
    yTopMax: 2.65,
  },
  // is3_bergman (recovered; blender-repaired rig 2026-07-30 — today's
  // extract confirms the PROUD dome + full D-25T live in the Turret node
  // (turret yMax 2.97, interpen 0, muzzle 2.45 m past the bow): the
  // packet's v6/v10 "degenerate sunken shell" cap text describes the
  // PRE-repair bytes and is retired by this warp round). Print stature
  // +16.6% (dome shoulder ~2.0-2.2, crown band to 2.48, broad DShK/cupola
  // cluster 2.7-2.97 across ~24% of body cols — NOT a thin mast), overall
  // -5.8% (muzzle 2.45 m past the bow vs the published 3.08), hullMask
  // +1.0%, width 0%. is3-class ceiling compress: identity to the 2.20
  // shoulder, crown 2.20-2.48 -> 2.42 (slope 0.786), cluster 2.48-2.964
  // flat to 2.47 (slope 0.103). z: hull -4.637..2.199 -> 6.77 about center
  // -1.219 (frame stays whole-box rear-shifted — the fused-gun loader
  // centering; the build must replicate it, soviet-heavy FRAME NOTE),
  // muzzle 4.644 -> 5.2465 = rear' + 9.85 (slope 1.26). Sim on
  // side_whole_96: h 2.4575 (+0.3%), hullMask 6.770, overall 9.857
  // (+0.07%). Stations-0 root cause is the STATURE, not the frame: the
  // committed report's stationErr shows widths 0-4.4% but topPct 13-28%
  // on the turret slices (ref cluster 2.85-2.97 vs build crown 2.51) —
  // the y-warp retires it. The whole-box rear-shifted frame is HARMLESS
  // to the gate (hull-curve registration + per-model station ranges);
  // note the print seats its dome ~0.5 m further forward of hull center
  // than the panzerfactory is3 — the build must re-seat, not clone.
  is3_bergman: {
    file: 'bergman_is3',
    y: [[0, 0], [2.20, 2.20], [2.48, 2.42], [2.964, 2.47]],
    z: [[-4.637, -4.604], [2.199, 2.166], [4.644, 5.2465]],
    yTopMax: 2.50,
  },
  // ---- WW2 family plans (authored 2026-08-03, ww2 r1 agent; ORCHESTRATOR
  // executes — repair_oracles batches are orchestrator-only). Derivations
  // from docs/references/vertex/<id>.json vs specs.js pubDims; per-tank
  // structural caps these retire are logged in the r1 packet updates.
  sherman_jumbo: { // roof-furniture band +5.6% (crown/MG 2.99-3.13 vs pub
    // 2.95 — the capped-crown tax on side/front/stations); body -3.9%
    // (6.024 -> 6.27 about mid -0.132); muzzle 3.179 -> 3.078 = rear' +
    // 6.35 overall (short-overhang 75mm per spec sheet).
    file: 'sherman-jumbo',
    y: [[0, 0], [2.01, 2.01], [2.62, 2.58], [3.13, 2.94]],
    z: [[-3.144, -3.267], [2.880, 3.000], [3.179, 3.078]],
    yTopMax: 2.95,
  },
  t34_85_cad: { // SQUAT print: p95 2.376 vs pub 2.72 (-12.6%) — hull zone
    // near-true (deck 1.62 -> 1.66), turret zone stretched to publish;
    // antenna tip 2.74 rides the clamp. Body -8% -> x1.0866 about -1.046;
    // muzzle 3.952 -> 4.004 = rear' + 8.1 overall.
    file: 't34_85_weihe',
    y: [[0, 0], [1.62, 1.66], [2.38, 2.715], [2.74, 2.74]],
    z: [[-3.853, -4.096], [1.761, 2.004], [3.952, 4.004]],
    yTopMax: 2.75,
  },
  pziii_konserwa: { // height true (-0.8%); body -3.5% -> x1.0366 about
    // -0.3135; overlong-modelled 3.7cm still short of published overall:
    // muzzle 3.009 -> 3.206 = rear' + 6.28.
    y: [[0, 0], [2.482, 2.50]],
    z: [[-2.976, -3.074], [2.349, 2.446], [3.009, 3.206]],
    yTopMax: 2.51,
  },
  newc_pziii: { // +2.2% stature squeeze to pub 2.5; body -4% -> x1.0404
    // about +0.01; muzzle 3.415 -> 3.64 = rear' + 6.41 overall.
    file: 'pziii_newc42',
    y: [[0, 0], [1.0, 1.0], [2.554, 2.50]],
    z: [[-2.662, -2.77], [2.682, 2.79], [3.415, 3.64]],
    yTopMax: 2.51,
  },
  tiger2: { // body -5% -> x1.0526 about -1.1855; stature -2.1% stretched
    // above the 1.86 hull roof; muzzle 4.953 -> 5.414 = rear' + 10.29.
    file: 'tiger2-maximus',
    y: [[0, 0], [1.86, 1.86], [3.026, 3.09]],
    z: [[-4.691, -4.876], [2.32, 2.505], [4.953, 5.414]],
    yTopMax: 3.10,
  },
  newc_tiger: { // SQUAT stylized Tiger I: -10.2% stature (2.694 vs 3.0)
    // stretched above the 1.05 track line; body -4.1% -> x1.0432 about
    // +0.029; muzzle 5.15 -> 5.319 = rear' + 8.45 overall.
    file: 'tiger_newc42',
    y: [[0, 0], [1.05, 1.05], [2.694, 3.0]],
    z: [[-3.0, -3.131], [3.058, 3.189], [5.15, 5.319]],
    yTopMax: 3.01,
  },
  // leichttraktor: NO PLAN — its -7.4% overall is a fused tube that never
  // clears the bow; a z-warp of the tube zone would drag the hull bow with
  // it. Certified build-side split (tube + rear tow bar carry published
  // overall; dims 97.5 in the committed row). q_heavy: NO PLAN — invented
  // published spec, certified proportion cap (docs/references/tanks/
  // q_heavy.md) + harness registration defect (r1 triage; false-0 law).
};

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const ids = getArg('ids', 'all') === 'all' ? Object.keys(PLANS)
  : getArg('ids', '').split(',').map((s) => s.trim()).filter(Boolean);
const VERIFY = args.includes('--verify');

const fmt = (v) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0.0' : String(r);
};

if (VERIFY) {
  // re-extract, then assert the measured stylization collapsed to ~published
  execFileSync('node', [path.join(ROOT, 'tools/vertex-extract.mjs'), `--ids=${ids.join(',')}`],
    { stdio: 'inherit' });
  let fails = 0;
  for (const id of ids) {
    const j = JSON.parse(fs.readFileSync(path.join(VDIR, `${id}.json`)));
    const s = j.stylization;
    const rows = [
      ['height', s.heightPct, 1.6],
      ['hullMask', s.hullMaskPct, 2.0],
      ['overall', s.overallPct, 1.0],
      ['width', s.widthPct, 1.0],
    ];
    const bad = rows.filter(([, v, tol]) => v !== null && Math.abs(v) > tol);
    console.log(`[verify ${id}] ` + rows.map(([n, v]) => `${n} ${v}%`).join(' ') +
      (bad.length ? `  FAIL(${bad.map((b) => b[0]).join(',')})` : '  OK'));
    fails += bad.length ? 1 : 0;
  }
  process.exit(fails ? 1 : 0);
}

for (const id of ids) {
  const plan = PLANS[id];
  const j = JSON.parse(fs.readFileSync(path.join(VDIR, `${id}.json`)));
  const ks = j.registration.loaderScale * j.registration.safeScaleK;
  const offY = j.glbToGate.offsetGate[1];
  const longE = j.glbToGate.axisMap.find((a) => a.gateAxis === 'z');
  const S = longE.sign * ks;
  const offZ = j.glbToGate.offsetGate[2];
  // convert control points; keep glb-frame points sorted ascending
  const yPts = plan.y.map(([a, b]) => [(a - offY) / ks, (b - offY) / ks]);
  let zPts = plan.z.map(([a, b]) => [(a - offZ) / S, (b - offZ) / S]);
  if (S < 0) zPts = zPts.reverse();
  // monotonicity check (both frames)
  const mono = (pts) => pts.every((p, i) => i === 0 ||
    (p[0] > pts[i - 1][0] && p[1] > pts[i - 1][1]));
  if (!mono(yPts) || !mono(zPts)) throw new Error(`${id}: non-monotone plan`);
  const yTopGlb = (plan.yTopMax - offY) / ks;
  const py = (pts) => '[' + pts.map(([a, b]) => `(${fmt(a)}, ${fmt(b)})`).join(', ') + ']';
  console.log(`\n# ---- ${id} (file ${plan.file || id}.glb) ----`);
  console.log(`#   gate-m plan y: ${JSON.stringify(plan.y)}`);
  console.log(`#   gate-m plan z: ${JSON.stringify(plan.z)}  long axis glb ${longE.glbAxis} sign ${longE.sign}`);
  console.log(`#   meters/glb-unit ${ks.toFixed(6)}  (loader s ${j.registration.loaderScale} x safeScale ${j.registration.safeScaleK})`);
  console.log(`    long_axis='${longE.glbAxis}',`);
  console.log(`    y_map=${py(yPts)},`);
  console.log(`    long_map=${py(zPts)},`);
  console.log(`    y_top_max=${fmt(yTopGlb + 0.02 / ks)},`);
  console.log(`    expect=(${j.counts.instances - (j.registration.turretNode === 'TurretPivot' ? 2 : 0)}, ${j.counts.verts - (id === 't90a' ? 16 : 0)}, ${j.counts.tris - (id === 't90a' ? 24 : 0)}),`);
}
console.log('\n# paste into tools/repair_oracles.py batch-12 recipes (see _axis_warp)');
