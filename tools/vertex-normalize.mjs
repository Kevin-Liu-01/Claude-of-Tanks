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
