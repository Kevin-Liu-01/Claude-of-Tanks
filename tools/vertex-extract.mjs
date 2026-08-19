#!/usr/bin/env node
// tools/vertex-extract.mjs — VERTEX-ROUND toolchain (owner ruling 2026-08-01,
// docs/GEOMETRY-GATE.md "Reference-model usage"): parse a reference GLB's
// vertex/index data DIRECTLY (no browser), replicate the game loader's
// registration + normalization conventions (turretNode/gunNode/yawOffset/
// autoPivot from MODEL_SOURCE + the fidelity harness width safeScale and
// -Z-forward flip), and emit per-tank authoring JSON:
//
//   * exact silhouette polylines per ortho view (side/plan/front), per part
//     (whole/hull/turret/gun), traced from a software rasterization of the
//     actual triangles — the same mask->column semantics as the gate, at
//     ~4.5 mm/px instead of the gate's ~11 cm columns;
//   * station cross-sections at the gate's 14 slice planes (side-hull-mask
//     z-range, front-view z-slab clip — the exact gate recipe);
//   * vertex-space z-profiles + landmark corners (deck/belly polyline
//     breakpoints, turret ring/crown numbers) for procedural authoring;
//   * the gate's dims-measurement replica (12% body filter, p95 roof,
//     0.35 m plan band) -> the print's TRUE stylization factors vs
//     published dims;
//   * the glb-world <-> gate-world affine map (axis permutation, meters
//     per glb unit, offsets, harness flip) so vertex-space repair recipes
//     (tools/repair_oracles.py batch-12+) can be planned in real meters
//     and written in glb units.
//
// Usage:
//   node tools/vertex-extract.mjs --ids=t62mv1,t64bv1[,...]
//   node tools/vertex-extract.mjs --ids=all           (the nine russia ids)
//   [--out=docs/references/vertex] [--res=2560]
//
// The registration table below MIRRORS src/vehicles/userdrops5.js +
// src/vehicles/variants.js (those modules are vite-env-gated and cannot be
// imported under plain node). Keep in sync when registrations change.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------- registry --
// pubDims from userdrops5.js make() rows (t72b_1987/t72b3m inherit t72b3 in
// modern1.js; t72bu/t90a_vladimir inherit t90a in variants.js).
const REG = {
  // Owner MBT-70 print is fused by material (no honest articulated masks).
  // Raw nose +X; fixedMount scales the whole source envelope to the authored
  // muzzle-to-stern datum while keeping the playable fully procedural.
  mbt70: {
    path: 'public/models/community-candidates/mbt70_usa.glb',
    fixedMount: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.10, overallLengthM: 9.20, widthM: 3.51, heightM: 2.59 },
  },
  // AFV program (owner drop 2026-08-04, CC-BY-4.0 42manako; ATTRIBUTION.md).
  // IFV: no gun overhang — overall = hull length; heightM published over the
  // turret roof (2.98 class), width the base 3.28 datum (packet two-datum note).
  m2a2_bradley: {
    path: 'public/models/tanks/community/m2_bradley_ifv.glb',
    turretNode: '^turret_lod$', autoPivot: true,
    pubDims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98 },
  },
  // SPz Puma NEW VEHICLE (owner drop 2026-08-06, CC-BY-4.0 42manako;
  // ATTRIBUTION.md "SPz Puma oracle drop"). Bradley-flow onboarding: the
  // print carries a real articulated split (turret node [80] with the
  // RCT30 cluster + spike_lr pod; gun_rot -> gun + shooter00/01 rockets)
  // but the registration keeps the gun FUSED under turretNode like the
  // bradley (proc turret mask includes rig_gun — parity holds; autoPivot
  // reads the whole-cluster footprint like bradley's turret_lod). Raw
  // nose = +X (front sprocket wheel_l_1/r_1 raised at +x, doorback1 ramp
  // at -x) -> yawOffset -90 (the leclerc convention). IFV: MK30-2 muzzle
  // stays behind the bow plane in the print -> overall = hull length.
  // pubDims mirror the modern3.js spec row (7.6 hull; width/height datum
  // reconciliation documented in docs/references/tanks/spz_puma.md).
  spz_puma: {
    path: 'public/models/tanks/community/spz_puma.glb',
    turretNode: '^turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.6, overallLengthM: 7.6, widthM: 3.9, heightM: 3.6 },
  },
  t64bv1: {
    path: 'public/models/tanks/community/recovered/t64bv1.glb',
    turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17 },
  },
  t72b_1987: {
    path: 'public/models/tanks/community/recovered/t72b_1987.glb',
    turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 6.67, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
  },
  t72bu: {
    path: 'public/models/tanks/community/recovered/t72bu.glb',
    turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
  },
  t72b3m: {
    // RE-ORACLED 2026-08-06 (owner override; batch-45 roof normalize):
    // the obr_2022 print replaces the recovered print as this id's
    // oracle. Turret shell+ERA Object_14 (gun-run cladding included),
    // gun Object_15, roof cluster Object_3 follower, raw nose -z.
    path: 'public/models/tanks/community/t-72b3m_obr._2022.glb',
    turretNode: '^Object_14$', gunNode: '^Object_15$', autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 6.67, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
  },
  t90sm: {
    path: 'public/models/tanks/community/recovered/t90sm.glb',
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.23 },
  },
  pt91m: {
    path: 'public/models/tanks/community/recovered/pt91m.glb',
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.19 },
  },
  t90a_vladimir: {
    path: 'public/models/tanks/community/recovered/t90a_vladimir.glb',
    turretNode: '^desirefx[._]?me_001$', autoPivot: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
  },
  t90a: {
    path: 'public/models/tanks/community/variants/t90a_xarchenko_variant.glb',
    turretNode: 'TurretPivot', gunNode: 'GunPivot', autoPivot: true,
    // modelLoader applyCommunityFixes adds two K-5 clamshell wedge boxes on
    // the turret cheeks at runtime — part of the gate's reference mask.
    runtimeKit: 't90a_k5_wedges',
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
  },
  // merkava batch-14 candidates (short-MG251 + proud roof-furniture band —
  // the certified wholeCurves caps in the 3b/3c packets). pubDims from the
  // userdrops5.js make() rows; registration = the articulated() default
  // ('^Turret$'/'^Gun$', autoPivot) the game loader uses for the family.
  // ---- casemate lane (batch-17 prep, 2026-08-02) ---------------------------
  // isu152: userdrops6.js fixed() registration — fixedMount casemate, whole
  // model is hull, loader scales the FULL box to overallLengthM (9.05).
  // pubDims from the userdrops6 make() row.
  isu152: {
    path: 'public/models/tanks/community/recovered/isu152.glb',
    fixedMount: true,
    pubDims: { hullLengthM: 6.77, overallLengthM: 9.05, widthM: 3.07, heightM: 2.48 },
  },
  // t95 §5.317 RE-ORACLE (owner drop 2026-08-17): the WoT print replaces the
  // doomturtle as the row oracle (doomturtle retired to reference-history).
  // LOCAL-ONLY gitignored quarantine (extraction-suspect class, ATTRIBUTION
  // §t95). Raw nose +z, fixedMount casemate (gun fused-fixed; whole model is
  // hull). pubDims mirror the specs.js §5.317 row (widthM 3.86 = the
  // published shipping-width datum; the print's raw stance is fighting-trim
  // 4.565 over the outer tracks — packet two-datum note).
  t95: {
    path: 'public/models/community-candidates/t95_world_of_tanks.glb',
    fixedMount: true,
    pubDims: { hullLengthM: 7.6, overallLengthM: 10.7, widthM: 3.86, heightM: 2.9 },
  },
  merkava3b: {
    path: 'public/models/tanks/community/recovered/merkava3b.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 },
  },
  merkava3c: {
    path: 'public/models/tanks/community/recovered/merkava3c.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 },
  },
  // ---- abrams family (append-only grant, 2026-08-02) -----------------------
  // Lab registrations: userdrops4.js points m1a1/m1a2_tusk (and m1a2_tejas)
  // at the local tejas GLB; userdrops5.js does the same for m1a1ha and
  // registers m1a2_sepv2; userdrops6.js registers m1a1_aim (autoPivot:false —
  // empty Turret pivot at origin, see its packet); specs.js registers m1a2
  // (authored TurretPivot/GunPivot, no autoPivot). m1a2_tusk's runtime ARAT
  // kit (modelLoader addRuntimeTuskKit) is NOT modeled here — chimera cert
  // in docs/references/tanks/m1a2_tusk.md. pubDims from variants.js (m1a1),
  // specs.js m1a2 (7.93 family) — ha/aim inherit m1a1, sepv2/tejas/tusk/
  // abramsx inherit or restate m1a2.
  m1a1: {
    path: 'public/models/tanks/m1a2_tejas.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  m1a1ha: {
    path: 'public/models/tanks/m1a2_tejas.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  m1a1_aim: {
    path: 'public/models/tanks/community/recovered/m1a1_aim.glb',
    turretNode: '^Turret$', autoPivot: false,
    // autoPivot:false -> no derived pivot; flip check resolves false (loader
    // keeps the authored placement — bergman print, packet-verified).
    assumeFlip: false,
    pubDims: { hullLengthM: 7.92, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  m1a2: {
    path: 'public/models/tanks/m1a2_tejas.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  m1a2_tusk: {
    path: 'public/models/tanks/m1a2_tejas.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  // ORACLE SWITCH (owner, 2026-08-03): the dannzjs "SEPv3" print turned out to
  // be a mislabeled LEOPARD 2A5. m1a2 now measures against the recovered SEPv2
  // drop (batch-21 warped) — same instrument as the m1a2_sepv2 row below.
  m1a2_legacy: {
    path: 'public/models/tanks/community/recovered/m1a2_sepv2.glb',
    turretNode: '^Turret$', gunNode: '^misc_b$', autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  // RE-ORACLE (SEP-on-tejas ratification 2026-08-07): the sepv2 build now
  // rides the tejas platform (§5.19a), so it measures against the tejas GLB.
  // The recovered SEPv2 print stays registered for m1a2 above only.
  m1a2_sepv2: {
    path: 'public/models/tanks/m1a2_tejas.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
  },
  abramsx: {
    path: 'public/models/tanks/community/abramsx-mortavex.glb',
    turretNode: '^Turret$', gunNode: '^[Ss]tvol$', autoPivot: true,
    // §5.73-1 / §5.82: mandatory-RWS P95 datum (whips remain spikes).
    pubDims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 3.47 },
  },
  merkava3d: {
    path: 'public/models/tanks/community/recovered/merkava3d.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 },
  },
  merkava1b: {
    path: 'public/models/tanks/community/recovered/merkava1b.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.45, overallLengthM: 8.63, widthM: 3.70, heightM: 2.65 },
  },
  // ---- UK family (append-only, 2026-08-03) ---------------------------------
  // Lab registrations mirrored from userdrops5.js (challenger1/chieftain5/
  // fv510) and userdrops6.js articulated() (centurion3/5, comet,
  // challenger_cruiser, charioteer — turretNode only, default gun regex).
  // challenger1's loader also carries turretFollowers/gunFollowers regexes
  // this tool does not model — affects hull/turret SPLIT only, not dims.
  // pubDims from the userdrops5/6 make() rows.
  chieftain5: {
    path: 'public/models/tanks/community/recovered/chieftain5.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pitchOffset: -Math.PI / 2, // authored Z-up OBJ heritage (userdrops5)
    pubDims: { hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.50, heightM: 2.90 },
  },
  challenger1: {
    path: 'public/models/tanks/community/recovered/challenger1.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 8.32, overallLengthM: 11.50, widthM: 3.52, heightM: 2.95 },
  },
  fv510: {
    path: 'public/models/tanks/community/fv510_warrior.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 6.34, overallLengthM: 6.34, widthM: 3.03, heightM: 2.80 },
  },
  centurion3: {
    path: 'public/models/tanks/community/recovered/centurion3.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 },
  },
  centurion5: {
    path: 'public/models/tanks/community/recovered/centurion5.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 },
  },
  comet: {
    path: 'public/models/tanks/community/recovered/comet.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.55, overallLengthM: 7.66, widthM: 3.05, heightM: 2.68 },
  },
  challenger_cruiser: {
    path: 'public/models/tanks/community/recovered/challenger_cruiser.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 8.03, overallLengthM: 8.15, widthM: 2.91, heightM: 2.77 },
  },
  charioteer: {
    path: 'public/models/tanks/community/recovered/charioteer.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.55, overallLengthM: 9.20, widthM: 3.05, heightM: 2.58 },
  },
  // ---- patton family (append-only, 2026-08-03) -----------------------------
  // Lab registrations mirrored from userdrops6.js articulated() (turretNode
  // '^Turret$', autoPivot, no gun node — the bergman prints fuse the gun into
  // TurretMesh). pubDims from the userdrops6 make() rows (heightM uses the
  // over-mounted-M2 convention per the batch-8 packet; m45 overallLengthM 6.6
  // is the seated-oracle muzzle ruling, flagged mid-flight in 4bbf0de).
  m26_pershing: {
    path: 'public/models/tanks/community/recovered/m26_pershing.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.33, overallLengthM: 8.65, widthM: 3.51, heightM: 3.08 },
  },
  m45_patton: {
    path: 'public/models/tanks/community/recovered/m45_patton.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.33, overallLengthM: 6.6, widthM: 3.51, heightM: 3.0 },
  },
  m46_patton: {
    path: 'public/models/tanks/community/recovered/m46_patton.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.33, overallLengthM: 8.48, widthM: 3.51, heightM: 3.18 },
  },
  m47_patton: {
    path: 'public/models/tanks/community/recovered/m47_patton.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.33, overallLengthM: 8.51, widthM: 3.51, heightM: 3.35 },
  },
  // ---- misc/Euro-Asia moderns family (append-only, 2026-08-03) -------------
  // Lab registrations mirrored verbatim: leclerc userdrops2.js, t80u
  // userdrops3.js, type90 userdrops5.js source(), ariete + type74 from the
  // fidelity harness LOCAL_REFERENCE_OVERRIDES (quarantine oracles),
  // recon_tank specs.js MODEL_SOURCE. pubDims from the spec dims rows
  // (modern2.js t80u/leclerc, modern3.js ariete, userdrops5 type90 make(),
  // misc.js TYPE74_SPEC, specs.js recon_tank).
  leclerc: {
    path: 'public/models/tanks/char_leclerc_andertan.glb',
    // raw GLB name is 'Cylinder.086' — GLTFLoader sanitizes the dot out;
    // the extract matches raw names, so the regex accepts both forms.
    turretNode: '^turret$', gunNode: '^Cylinder\\.?086$', autoPivot: true,
    yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 6.88, overallLengthM: 9.87, widthM: 3.60, heightM: 2.53 },
  },
  t80u: {
    path: 'public/models/tanks/t80u_javanilga.glb',
    turretNode: '^Object09_24$', gunNode: '^Object1101_22$', autoPivot: true,
    pubDims: { hullLengthM: 7.01, overallLengthM: 9.65, widthM: 3.60, heightM: 2.20 },
  },
  type90: {
    path: 'public/models/tanks/community/recovered/type90.glb',
    turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.45, overallLengthM: 9.76, widthM: 3.43, heightM: 2.34 },
  },
  ariete: {
    path: 'public/models/tanks/community/ariete-dustymojito.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.50 },
  },
  type74: {
    path: 'public/models/tanks/community/type74-nullops.glb',
    turretNode: '^Tower_9$', gunNode: '^Gun_7$', autoPivot: true,
    scaleToOverall: true,
    pubDims: { hullLengthM: 6.7, overallLengthM: 9.42, widthM: 3.18, heightM: 2.48 },
  },
  // leo2a5 (userdrops5 articulated(): recovered drop). PILOT CASE for the
  // 2026-08-03 gate-in-loop warp law (band-flatten, see leo2a5.md).
  leo2a5: {
    path: 'public/models/tanks/community/recovered/leo2a5.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 2.64 },
  },
  recon_tank: {
    path: 'public/models/tanks/community/recon_tank_mophs.glb',
    turretNode: '^Turret$', gunNode: '^Barrel$', autoPivot: true,
    scaleToOverall: true,
    pubDims: { hullLengthM: 6.2, overallLengthM: 7.2, widthM: 3.0, heightM: 2.5 },
  },
  // ---- soviet-heavy family (append-only, 2026-08-03) -----------------------
  // Lab registrations mirrored verbatim: is3/is7/object279/is6b from specs.js
  // MODEL_SOURCE (snowleopard prints fuse the gun into the Turret mesh — no
  // gun node, loader normalizes on the FULL box); is3_bergman from
  // userdrops6.js articulated('is3_bergman','bergman_is3'). Explicit loader
  // pivots (specs.js pivot:[...]) affect articulation seating only, not the
  // yaw-0 silhouettes this tool measures. pubDims from specs.js dims rows
  // (is3_bergman inherits is3 via make()).
  is3: {
    path: 'public/models/tanks/community/is3_panzerfactory.glb',
    turretNode: '^turret$', gunNode: '^gun$', autoPivot: true,
    pubDims: { hullLengthM: 6.77, overallLengthM: 9.85, widthM: 3.15, heightM: 2.45 },
  },
  is7: {
    path: 'public/models/tanks/community/is7-snowleopard.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.38, overallLengthM: 11.17, widthM: 3.4, heightM: 2.6 },
  },
  object279: {
    path: 'public/models/tanks/community/object279-snowleopard.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.99, overallLengthM: 10.24, widthM: 3.4, heightM: 2.6 },
  },
  is6b: {
    path: 'public/models/tanks/community/is6b-snowleopard.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.9, overallLengthM: 9.1, widthM: 3.2, heightM: 2.5 },
  },
  is3_bergman: {
    path: 'public/models/tanks/community/recovered/bergman_is3.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.77, overallLengthM: 9.85, widthM: 3.15, heightM: 2.45 },
  },
  // ---- WW2 family (append-only, 2026-08-03) --------------------------------
  // Lab registrations mirrored verbatim from specs.js MODEL_SOURCE (tiger2 /
  // sherman_jumbo / t34_85_cad / pziii_konserwa carry explicit loader pivots —
  // articulation-only, no effect on the yaw-0 silhouettes this tool measures;
  // fused-gun prints (no gunNode) normalize on the FULL box to
  // overallLengthM, loader parity). pubDims from the specs.js dims rows.
  sherman_jumbo: {
    path: 'public/models/tanks/community/sherman-jumbo.glb',
    turretNode: '^turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.27, overallLengthM: 6.35, widthM: 2.95, heightM: 2.95 },
  },
  tiger2: {
    path: 'public/models/tanks/community/tiger2-maximus.glb',
    turretNode: '^Object_2$', autoPivot: true,
    pubDims: { hullLengthM: 7.38, overallLengthM: 10.29, widthM: 3.76, heightM: 3.09 },
  },
  t34_85_cad: {
    path: 'public/models/tanks/community/t34_85_weihe.glb',
    turretNode: '^turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.10, overallLengthM: 8.10, widthM: 3.0, heightM: 2.72 },
  },
  pziii_konserwa: {
    path: 'public/models/tanks/community/pziii_konserwa.glb',
    // loader sees GLTFLoader-sanitized 'Plane000'; raw GLB keeps 'Plane.000'
    turretNode: '^Plane\\.?000$', autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 5.52, overallLengthM: 6.28, widthM: 2.9, heightM: 2.5 },
  },
  newc_pziii: {
    path: 'public/models/tanks/community/pziii_newc42.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 5.56, overallLengthM: 6.41, widthM: 2.9, heightM: 2.5 },
  },
  newc_tiger: {
    path: 'public/models/tanks/community/tiger_newc42.glb',
    turretNode: '^Turret$', gunNode: '^Barrel$', autoPivot: true,
    pubDims: { hullLengthM: 6.32, overallLengthM: 8.45, widthM: 3.71, heightM: 3.0 },
  },
  leichttraktor: {
    path: 'public/models/tanks/community/leichttraktor_newc42.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 4.4, overallLengthM: 4.87, widthM: 2.28, heightM: 2.4 },
  },
  q_heavy: {
    path: 'public/models/tanks/community/tank_quaternius_fa5.glb',
    turretNode: '^Tank_Turret$', gunNode: '^Tank_Gun$', autoPivot: true,
    yawOffset: Math.PI / 2,
    pubDims: { hullLengthM: 7.2, overallLengthM: 8.8, widthM: 3.6, heightM: 3.0 },
  },
  // ---- zero-row instrument batch (triage 2026-08-03): 13 no-profile tanks.
  // Registrations mirror userdrops7 glb() (turret '^Turret$', autoPivot, gun
  // via the loader's default gun|barrel|cannon regex — same default as this
  // tool) and userdrops2's t90m override. recovered/* rows are the NC-SA
  // LOCAL-ONLY quarantine class; these REG rows are local instruments, and
  // the tanks' public builds stay procedural. pubDims from the scout-gen2
  // packet stubs (docs/references/tanks/scout-gen2-*.md).
  t44: {
    path: 'public/models/tanks/community/t44_foxygamer.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.07, overallLengthM: 7.65, widthM: 3.18, heightM: 2.46 },
  },
  m48: {
    path: 'public/models/tanks/community/m48a5_atmodeler.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.42, overallLengthM: 9.31, widthM: 3.63, heightM: 3.09 },
  },
  m60a2: {
    path: 'public/models/tanks/community/m60a2_ahab.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.95, overallLengthM: 7.27, widthM: 3.63, heightM: 3.11 },
  },
  amx30: {
    path: 'public/models/tanks/community/amx30b_ahab.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.59, overallLengthM: 9.48, widthM: 3.10, heightM: 2.29 },
  },
  amx30b2: {
    // B2 = upgraded AMX-30B; published dims shared with amx30 above.
    path: 'public/models/tanks/community/amx30b2_ahab.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.59, overallLengthM: 9.48, widthM: 3.10, heightM: 2.29 },
  },
  type59: {
    // Asset is a Type 69-II print (lasttriarius); packet stub keys Type 59
    // dims — same WZ-120 lineage hull.
    path: 'public/models/tanks/community/type69_lasttriarius.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.04, overallLengthM: 9.00, widthM: 3.27, heightM: 2.59 },
  },
  vickers_mk1: {
    path: 'public/models/tanks/community/vickers_mk1_jack.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.92, overallLengthM: 9.79, widthM: 3.17, heightM: 2.71 },
  },
  t54: {
    path: 'public/models/tanks/community/recovered/t54.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.45, overallLengthM: 9.00, widthM: 3.27, heightM: 2.40 },
  },
  t80: {
    path: 'public/models/tanks/community/recovered/t80.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
  },
  t80b: {
    // gen2 stub covers the t80 family; B shares the base hull dims.
    path: 'public/models/tanks/community/recovered/t80b.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
  },
  t80bv: {
    path: 'public/models/tanks/community/recovered/t80bv.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
  },
  t84: {
    path: 'public/models/tanks/community/recovered/t84.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 7.08, overallLengthM: 9.72, widthM: 3.56, heightM: 2.22 },
  },
  t90m: {
    // userdrops2 override (minehffd print): no clean hull-only box, so the
    // loader uses scaleToOverall; nose raw -X -> yaw +90.
    path: 'public/models/tanks/t90m_minehffd.glb',
    turretNode: '^Turret$', gunNode: '^Main_barrel$', autoPivot: true,
    scaleToOverall: true, yawOffset: Math.PI / 2,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.23 },
  },
  // ---- AFV family (append-only, 2026-08-04) --------------------------------
  // bmp2: registration mirrors the fidelity harness LOCAL_REFERENCE_OVERRIDES
  // quarantine-oracle row (b584a7c) — m_bergman print, gate/measure LOCAL-ONLY,
  // in-game MODEL_SOURCE stays procedural. pubDims from the modern3.js spec
  // dims row (2.45 = the turret+ATGM-stack height datum, packet two-datum
  // note).
  bmp2: {
    path: 'public/models/tanks/community/bmp2_bergman.glb',
    turretNode: '^Turret$', autoPivot: true,
    pubDims: { hullLengthM: 6.72, overallLengthM: 6.72, widthM: 3.15, heightM: 2.45 },
  },
  // ---- BASE-21 ORACLE WAVE (owner drop 2026-08-06; ATTRIBUTION.md "Base-21
  // oracle wave"). PROVENANCE ADJUDICATIONS from this onboarding round:
  // * leo2a4's earlier hold is superseded by the owner's explicit
  //   2026-08-10 instruction to use the newly supplied nested source. The
  //   deterministic repaired GLB below preserves every triangle and restores
  //   the OBJ's semantic Hull/Turret/Gun ownership.
  // * type10 <- type-10_main_battle_tank.glb ON HOLD — author
  //   nazidefenseforceofficial was adjudicated a game-rip poster
  //   2026-07-27 (T-90AM, *_dds ripper textures); no per-asset rip
  //   evidence in this file, owner adjudication required before it can
  //   instrument a gate.
  // * challenger_1_main_battle_tank.glb (challenger1 ALTERNATE) NOT
  //   REGISTERED — Sketchfab page is tagged createdwithai +
  //   world-of-tanks (AI-generated); measurement-unusable. challenger1
  //   keeps its gate-PASS recovered print.
  leo2a4: {
    path: 'public/models/community-candidates/leopard_2a4_otco_repaired.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.76 },
  },
  challenger2: {
    // "Challenger II" by buh (CC-BY-4.0, the leo2a6 author). Raw print is
    // ~1:1 meters, nose +z (muzzle overhang +z 2.86 m). Batch 48d splits
    // the material-fused source bucket into true turret, HullParts, and Gun
    // nodes by exact connected components. GLTFLoader sanitizes the turret
    // name to 'challendger_2_0'; running gear remains 'truck.001'.
    // §E height-clamp NOTE: a thin turret-left antenna tops the box at raw
    // y 3.05 (roof mass ends 2.25) + track bottom -0.99 -> box height 4.04
    // binds the 1.30*heightM clamp (s 0.80 vs 1.03 length-anchored); the
    // width safeScale (k~1.23) recovers the frame — document, don't hide.
    path: 'public/models/tanks/community/challenger_ii.glb',
    turretNode: '^challendger[ _]2_0$', gunNode: '^Gun$', autoPivot: true,
    orientationAdjudicated: 'native pose visually verified; CR2 symmetric terminal descent defeats the generic glacis heuristic',
    pubDims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.49 },
  },
  type10: {
    // Deterministic semantic repair of the owner-supplied flat OBJ merge.
    // The unmodified source remains adjacent; the repaired oracle supplies
    // honest Hull/Turret/Gun ownership and published-scale datums.
    path: 'public/models/tanks/community/type-10_main_battle_tank_repaired.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    pubDims: { hullLengthM: 6.84, overallLengthM: 9.49, widthM: 3.24, heightM: 2.68 },
  },
  k2: {
    // "K2 Black Panther (Armored Warfare)" by KojfDiscord (Sketchfab,
    // CC-BY-4.0 tag; owner-supplied 2026-08-08 as the PRIORITY modeling
    // reference). PROVENANCE INCONCLUSIVE: title names a commercial game,
    // live page has no description/tags (checked 2026-08-08) — LOCAL-ONLY
    // QUARANTINE, measurement/influence ONLY, playable is procedural
    // (buildK2). Meters-authored OBJ merge, z-up under the Sketchfab root
    // rotation, gun -y raw (muzzle -7.05); flat Object_N material split:
    // Object_21 turret shell, Object_19 gun+mantlet (with Object_24
    // tube/roof-rail mix), Object_3/7 tracks, Object_29 skirts (x +-1.86),
    // Object_26/27/28 hull bands, Object_25 rear antenna pair (z to 4.73
    // raw — height read needs the antenna excluded or p95 class).
    path: 'public/models/community-candidates/k2_black_panther_armored_warfare.glb',
    turretNode: '^Object_21$', gunNode: '^Object_19$', autoPivot: true,
    pubDims: { hullLengthM: 7.5, overallLengthM: 10.8, widthM: 3.6, heightM: 2.4 },
  },
  // ---- KojfDiscord "(Armored Warfare)" series (owner drops 2026-08-08,
  // §5.38): ALL LOCAL-ONLY QUARANTINE (title names a commercial game; live
  // pages have CC-BY-4.0 tags but no description/tags — provenance
  // inconclusive, K2-page check 2026-08-08). Measurement/influence ONLY;
  // every playable is procedural. k1a1/t90ms/t90 were re-baked from the
  // zips' SEMANTIC OBJ sources (blender obj2glb, real turret/cannon nodes);
  // k2/type99a/amx40/burlak are the flat Object_N Sketchfab GLBs.
  type99a: {
    // "Type 99A2 (Armored Warfare)". Meters, z-up under root rotation, gun
    // -y (muzzle -7.41). Object_31 turret shell (incl. mast to 3.73 raw),
    // Object_17 gun tube, Object_27 skirts/fenders/glacis, Object_25/26
    // running gear + hull bands, Object_5/18 track belts, Object_9/20
    // antenna masts. FOLLOWER CENSUS (§5.38 builder round, vertex-verified
    // — the harness maps carry turretFollowers ^Object_(?:3|4|6|7|9|10|11|
    // 12|13|15|16|19|20|21|23|30)$; this tool models split loss only, t14
    // note): 3 roof trim, 4 cheek smoke banks (z_w 0.33..0.48 full-width),
    // 6 roof plate, 7 mantlet, 10/23 cheek rails, 11/12/15/16/19 turret
    // side bins (x to ±1.75), 13 center sight head, 21 sight wiper, 30
    // gunner-sight tower (right-rear, top 3.14), 9/20 masts. Object_29
    // stays hull (headlights + mirror stalks + glacis rails; its ~18-vert
    // left roof-edge bits are a documented split residual).
    path: 'public/models/community-candidates/type_99a2_armored_warfare.glb',
    turretNode: '^Object_31$', gunNode: '^Object_17$', autoPivot: true,
    pubDims: { hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.37 },
  },
  amx40: {
    // "AMX-40 (Armored Warfare)". Object_12 turret shell (z 1.56..3.11),
    // Object_20 gun tube (y -6.57..-2.86), Object_9 skirts, Object_10/19
    // tracks, Object_15 mantlet, Object_24 masts (z to 5.12 raw).
    path: 'public/models/community-candidates/amx-40_armored_warfare.glb',
    turretNode: '^Object_12$', gunNode: '^Object_20$', autoPivot: true,
    pubDims: { hullLengthM: 6.8, overallLengthM: 10.04, widthM: 3.36, heightM: 2.62 },
  },
  k1a1: {
    // Re-baked from the zip's OBJ source — SEMANTIC nodes. Gun = cannon_10;
    // cannonbase_9 + cage/smokecaps/noeffect01 _turret_ nodes follow.
    path: 'public/models/community-candidates/k1a1_kojf.glb',
    turretNode: '^vehicle#k1a1_turret_0$', gunNode: '^vehicle#k1a1_cannon_10$',
    autoPivot: true,
    pubDims: { hullLengthM: 7.48, overallLengthM: 9.71, widthM: 3.6, heightM: 2.25 },
  },
  leo2a7v: {
    // Owner-authoritative nested OBJ, deterministically repartitioned into
    // exact Hull/Turret/Gun and donor-running-gear nodes.
    path: 'public/models/community-candidates/leopard_2a7v_repaired.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    orientationAdjudicated: 'native +z muzzle/nose pose verified in paired front, side, top and yaw renders; the modular A7V bow defeats the generic glacis-descent heuristic',
    pubDims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.0, heightM: 2.87 },
  },
  leo2_revolution: {
    // Owner-authoritative nested OBJ, semantically recovered and completed
    // with the omitted pressure-turret core/fender floors. Donor wheels and
    // tracks remain reference-only; the playable build uses native gear.
    path: 'public/models/community-candidates/leopard_revolution_repaired.glb',
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    orientationAdjudicated: 'native +z muzzle/nose pose verified from the recovered OBJ and paired front, side, top and yaw renders',
    pubDims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 4.0, heightM: 2.64 },
  },
  t90ms: {
    // Re-baked from OBJ source — semantic (turret_6, cannon_8, era01-10
    // hull+turret, aps/cage/smokecaps/detachparts turret followers).
    path: 'public/models/community-candidates/t90ms_kojf.glb',
    turretNode: '^vehicle#t-90ms_turret_t-90ms_6$',
    // §5.60 instrument verdict: print verified FORWARD-CORRECT in its bytes
    // (accessor-bound receipts) — no yaw keys, ever. gunNode/autoPivot
    // restored (the b786a82 revert over-stripped them with the yaw line).
    gunNode: '^vehicle#t-90ms_cannon_2a46m-5_8$', autoPivot: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
  },
  t90: {
    // Re-baked from OBJ source — semantic (turret_18, cannon_20, era
    // hull+turret sets, hatch01/aps/smokecaps turret followers).
    path: 'public/models/community-candidates/t90_kojf.glb',
    turretNode: '^vehicle#t-90_turret_t-90_18$',
    gunNode: '^vehicle#t-90_cannon_2a46m2_20$', autoPivot: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.23 },
  },
  t90a_burlak: {
    // "T-90A Burlak (Armored Warfare)" — flat Object_N. Object_2 turret
    // shell (z 1.39..3.13), Object_15 gun tube (y -5.88..-1.23), Object_24
    // skirts/fenders, Object_21 hull band, Object_5/13 tracks, Object_11
    // antenna (z 4.63 raw). Experimental Burlak-turret T-90A: pub dims =
    // t90a-class, height to the (taller) Burlak bustle roof est. 2.30.
    path: 'public/models/community-candidates/t-90a_burlak_armored_warfare.glb',
    turretNode: '^Object_2$', gunNode: '^Object_15$', autoPivot: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.78, heightM: 2.30 },
  },
  // ---- §5.248 batch A (13 drops, ALL LOCAL-ONLY quarantine; full
  // censuses + SHA receipts in ATTRIBUTION; weak/fused instruments marked).
  bmp3: {
    // Semantic 42manako print (CC-BY-NC). Nose +x -> yaw -90; muzzle
    // overhangs the bow ~0.27 while published length is hull-total 7.14.
    // §5.248 IFV round reg fix (mirrors the three maps): \.? tolerates the
    // browser loader's dot-sanitized node names; interior.001 (crew basket)
    // follows the turret so ref hull rows stay clean.
    path: 'public/models/community-candidates/bmp3_rok_42manako.glb',
    turretNode: '^turret\\.?001$', gunNode: '^weapon2\\.?001$', autoPivot: true,
    turretFollowers: '^interior\\.?001$',
    yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.14, overallLengthM: 7.14, widthM: 3.23, heightM: 2.40 },
  },
  m2a3_bradley_ua: {
    // Fused alternate m2a2_bradley-family reference (~1/265 scale —
    // pub-dims anchor law). Measurement-only.
    path: 'public/models/community-candidates/m2a3_bradley_ua_42manako.glb',
    autoPivot: true,
    pubDims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98 },
  },
  upior: {
    // FICTIONAL Polish concept (905k-vert original; one BMP-2-turret
    // component tell recorded). Gun = sibling Object004. §5.269 FIX-ROUND
    // RE-ADJUDICATION: this extract's raw parser reads the FBX z-MIRRORED
    // vs THREE's correct native nose-+z frame (critic shaded receipts:
    // doors+tow-cable face = stern). yawOffset PI HERE brings the extract
    // into the true frame; the browser maps carry NO offset. CONCEPT
    // pubDims = print-proportional anchor (ASK-OWNER banked).
    path: 'public/models/community-candidates/upior_killcapturedestroy.glb',
    turretNode: '^mtl_h1_vehicle_bmp_2_turet_woodland$', gunNode: '^Object004$',
    autoPivot: true, yawOffset: Math.PI,
    pubDims: { hullLengthM: 6.70, overallLengthM: 6.70, widthM: 3.00, heightM: 2.50 },
  },
  marder1a3: {
    // Arrafi (rip-poster account history — suspect; no per-file markers).
    // Object_6 turret+whips fused (exclude whips for height); 20mm fused
    // hull-side (no gunNode). Nose +z; ~2.67x meters — anchor law.
    path: 'public/models/community-candidates/marder1a3_arrafi.glb',
    turretNode: '^Object_6$', autoPivot: true,
    pubDims: { hullLengthM: 6.88, overallLengthM: 6.88, widthM: 3.38, heightM: 3.02 },
  },
  m3a3_bradley: {
    // SIpriv rigged lowpoly. bone11_169 turret / bone28_163 M242 (inside
    // subtree, k1a1 pattern). Nose -z -> yaw PI. EXCLUDE detached ground
    // props x +2.1..+3.7 (bone52/61/63). Bind-pose reads only.
    path: 'public/models/community-candidates/m3a3_bradley_sipriv.glb',
    turretNode: '^bone11_169$', gunNode: '^bone28_163$', autoPivot: true,
    yawOffset: Math.PI,
    pubDims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98 },
  },
  stb1: {
    // Owner-authoritative pyaesone print (CC-BY-NC, 119MB). Turret_2 carries the fused 105mm
    // (muzzle x -10.94, no gunNode). Nose -x -> yaw +90. Origin floats —
    // ground-plane re-zero before height reads. Spec 9.20 vs published
    // Type-74-family 9.42 = non-blocking true-up ask.
    path: 'public/models/community-candidates/stb_1_owner.glb',
    turretNode: '^Turret_2$', autoPivot: true, yawOffset: Math.PI / 2,
    pubDims: { hullLengthM: 6.70, overallLengthM: 9.20, widthM: 3.18, heightM: 2.25 },
  },
  leo2a6m: {
    // Arrafi, EXTRACTION-SUSPECT x2 (account + chassis_vlo WT lineage).
    // §E VLO HAZARD: Object_9/10 vlo duplicates + Object_5/7 whole-shell
    // pairs — isolate ONE shell set per measure. Gun fused (no gunNode).
    // Nose +x -> yaw -90.
    path: 'public/models/community-candidates/leo2a6m_arrafi.glb',
    turretNode: '^Object_6$', autoPivot: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.24, heightM: 3.03 },
  },
  leo2a4m: {
    // Same account/verdict. NO usable split (whole-shell pairs + vlo) —
    // measurement-only. Nose +x -> yaw -90.
    // §5.248 germany round row completion: turretless registration needs the
    // fixedMount flag (jaguar class) or the extractor throws 'no turret
    // node', and autoPivot must NOT ride along (it dereferences the turret
    // world matrix). Whole-view instrument only, like the fidelity-map row.
    path: 'public/models/community-candidates/leo2a4m_arrafi.glb',
    fixedMount: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 4.07, heightM: 2.75 },
  },
  // ---- §5.248 batch B (15 prints, ALL LOCAL-ONLY quarantine; censuses +
  // provenance in ATTRIBUTION; weak instruments marked; orientation TBDs
  // resolved by the measure lanes).
  pl01: {
    path: 'public/models/community-candidates/pl01_501st.glb',
    turretNode: '^Tower$', gunNode: '^Cannon$', autoPivot: true,
    // §5.248 poland measure-lane followers completion (round 1): the print's
    // 'Tower Rotation' group also carries the sight mast (Cylinder.005 >
    // CamHolder > Cameras > CamCovers), the left EO head (Cameras.001), the
    // RWS ring base (Cylinder.003), the RWS shields (TurretShields) and the
    // gun thermal cover (TowerBarrelCover, child of 'Tower Turret Rotation').
    // The batch-B row left them in the HULL mask (ref side_hull read tops
    // 2.79-3.15 over the turret works band — baseline workorder receipt).
    turretFollowers: '^(?:TurretBarrel|TurretBase|TurretBody|TurretShields|ExplosionTubes|Cylinder\\.?00[2-5]|Cameras(?:\\.?001)?|CamHolder|CamCovers|TowerBarrelCover)$',
    pubDims: { hullLengthM: 6.95, overallLengthM: 8.96, widthM: 3.80, heightM: 2.80 },
  },
  t72m1_jaguar: {
    // FUSED two-mesh conversion (CC-BY-NC) — whole-view instrument only.
    // §5.248 poland measure-lane orientation TBD resolved (round 1): nose =
    // raw +x (az-0 render shows a full side profile, gun +x — userdrops3
    // convention receipt) -> yawOffset -90°, same as bmp3/leo2a6m.
    path: 'public/models/community-candidates/t72m1_jaguar_manako.glb',
    yawOffset: -Math.PI / 2,
    fixedMount: true, scaleToOverall: true,
    pubDims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
  },
  pt91_twardy: {
    // WT-style naming — _vlo audit before metric use.
    path: 'public/models/community-candidates/pt91a_manako.glb',
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
    pubDims: { hullLengthM: 6.95, overallLengthM: 9.67, widthM: 3.59, heightM: 2.19 },
  },
  strv103: {
    // Casemate, fixedMount by design; wesiora candidateGlb stays in specs.
    // Orientation resolved (sweden rebuild lane 2026-08-17): length on raw X,
    // nose -X (thin fixed-gun tube width 0.043-0.051 at raw X -1.00..-0.48,
    // tube height y 0.027..0.081 = the ~1.4 m gun line; full-width body ends
    // +0.97 with the rear mudguard bulge at X 0.47..0.67) -> raw -X maps to
    // gate +Z via yawOffset +PI/2. Pre-fix rows measured the print sideways
    // (overall read -81.8%).
    path: 'public/models/community-candidates/strv103b_lamonekeli.glb',
    fixedMount: true, scaleToOverall: true, yawOffset: Math.PI / 2,
    pubDims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.63, heightM: 2.14 },
  },
  strv103a: {
    // NEW id (§5.317 lane J): the A-model family member measured against the
    // owner drop strv_103b.glb (Sketchfab "Strv 103B" by BFJFFK/chilecaliente,
    // CC-BY-4.0 embedded in asset.extras; sha256 e0b09973…, LOCAL-ONLY).
    // Census 2026-08-17: 5 meshes / 73,539 verts, ~1:1 meters, length on raw
    // Z with nose +Z (gun tube mesh Object_0 runs z +0.64..+5.01 at the
    // ~1.5 m bore line; tail plate -3.95) -> NO yawOffset (jpz_e100 class).
    // Print is a B: the A build diverges by order (no flotation rim, no
    // dozer, simpler rear deck) — documented caps in the packet.
    path: 'public/models/community-candidates/strv_103b.glb',
    fixedMount: true, scaleToOverall: true,
    // A-model published figures: same hull/gun as the B (hull 7.04, overall
    // 8.99); width 3.60 bare hull (the B's 3.63 includes the added flotation
    // gear); height 2.14 to the cupola line.
    pubDims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.60, heightM: 2.14 },
  },
  strv81: {
    path: 'public/models/community-candidates/strv81_mmdsonic.glb',
    turretNode: '^turret_0$', gunNode: '^gun_0$', autoPivot: true,
    // Orientation resolved (sweden rebuild lane 2026-08-17): raw scene faces
    // -Z (gun_0 extends raw -Z; pre-fix extract auto-flip read flip:true) ->
    // yawOffset PI carried in the row so every consumer agrees (ztz99a2-row
    // convention; the fidelity harness gun-vs-turret auto-flip then no-ops).
    scaleToOverall: true, yawOffset: Math.PI,
    // hullLengthM 7.56 = the committed centurion3 family value (the 7.82
    // batch-B figure was a donor-clone error; print hull mask reads 7.565).
    pubDims: { hullLengthM: 7.56, overallLengthM: 9.85, widthM: 3.39, heightM: 3.01 },
  },
  strv122: {
    // TRIPO AI-GENERATED — WEAK instrument, visual influence only.
    // Orientation resolved (sweden rebuild lane 2026-08-17): length on raw X,
    // nose +X (thin L44 tube width 0.024 at raw X +0.33..+0.49; turret-roof
    // antenna spike tops the raw box at X -0.27, t64bv1-class case) ->
    // raw +X maps to gate +Z via yawOffset -PI/2 (ztz99a2 convention).
    // Pre-fix rows measured the print sideways (overall read -84.6%).
    path: 'public/models/community-candidates/strv122_vavtrudner.glb',
    fixedMount: true, scaleToOverall: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.80, heightM: 3.00 },
  },
  ztz99a2: {
    // SketchUp-authored, inches, fused-by-material — whole-view only.
    // Orientation resolved (china measure lane 2026-08-17): length on raw X,
    // nose +X (thin tube extension x 664..782, axis y (77.75-3.54)*0.0254 =
    // 1.885 m; rear-bustle band at x 334..351) -> raw +X maps to gate +Z.
    // Inches confirmed: raw width 140.14*0.0254 = 3.56 m, roof-to-track
    // (96.6-3.54)*0.0254 = 2.36 m vs published 2.37.
    path: 'public/models/community-candidates/ztz99a2_manako.glb',
    fixedMount: true, scaleToOverall: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.37 },
  },
  ztz85_iii: {
    // FUSED conversion (CC-BY-NC) — whole-view only; hull LOW-CONF.
    // Orientation resolved (china measure lane 2026-08-17): length on raw X,
    // nose +X (sparse tube rings x 69..110 at y 33..38; tall whip at
    // x -22..-13 tops the raw box — the width safeScale recovers the frame,
    // t64bv1-class documented case).
    path: 'public/models/community-candidates/ztz85iii_manako.glb',
    fixedMount: true, scaleToOverall: true, yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 6.40, overallLengthM: 10.28, widthM: 3.45, heightM: 2.30 },
  },
  ua_t84_oplot_m: {
    // TUR carries the FUSED gun — yaw-only articulation.
    // §5.248 ukraine round ORIENTATION FIX: muzzle toward raw -Z (gun-only
    // overhang read z -4.40..-1.95 vs hull mask -1.95..+4.39) and no gun
    // node exists for the auto-flip -> explicit yawOffset PI.
    path: 'public/models/community-candidates/oplot_m_manako.glb',
    turretNode: '^TUR$', yawOffset: Math.PI, autoPivot: true, scaleToOverall: true,
    // default076 ("inner") is the turret interior shell — it tops 1.91
    // over the deck's 1.39 and pollutes the hull mask unless it follows.
    turretFollowers: '^(?:TUR[ _]ARMOR|TUR[ _]POKLOP|default017|default042|default076)$',
    pubDims: { hullLengthM: 7.08, overallLengthM: 9.72, widthM: 3.775, heightM: 2.285 },
  },
  ua_t80u_kursk: {
    // Viewer-rip re-upload suspect; fused 3-mesh, far off-origin.
    // §5.248 ukraine round INSTRUMENT FIX: the diorama parks the tank
    // axis-aligned along raw X (PCA 0.05°, spans 39.86×14.97×19.97u,
    // 0.242 m/u vs pub), nose = raw -X -> yawOffset +90 (the userdrops2
    // FLIP-RETIRED convention). Without it the width normalizer reads the
    // 9.65 m length as width (extract read -86%).
    path: 'public/models/community-candidates/t80u_kursk_manako.glb',
    fixedMount: true, scaleToOverall: true, yawOffset: Math.PI / 2,
    pubDims: { hullLengthM: 7.01, overallLengthM: 9.65, widthM: 3.60, heightM: 2.20 },
  },
  ua_t64bv: {
    // Kitbash print (CC-BY-NC). Also the t64bv1 relay print.
    // §5.248 ukraine round FOLLOWER CENSUS (was OPEN): the 106 _dz_ ERA
    // meshes split by AABB — 55 turret-carried K-1 (cheek/roof fans, all
    // cy>=1.33 above the 1.30 deck, cz<=0.05) join the followers; the 47
    // glacis rows (cz 0.71..1.54) and the four side-band strips
    // (default136/231 pairs, |x| 1.53..1.71) stay hull. Stray _tur_
    // meshes 001/252/255/260/282 + the turret interior 249 join; Vert*
    // (AKM kitbash prop bits) join the existing Cube/Cylinder prop set.
    path: 'public/models/community-candidates/t64bv_donbass_manako.glb',
    turretNode: '^default279$', gunNode: '^default280$', gunFollowers: '^default$',
    autoPivot: true,
    turretFollowers: '^(?:default(?:001|002|007|008|009|010|011|012|013|014|015|016|017|018|019|020|021|022|023|024|025|026|027|028|029|030|031|032|033|036|039|042|045|048|051|054|057|058|059|060|061|062|063|065|066|067|070|071|074|076|077|082|084|085|087|088|236|244|245|247|249|252|253|254|255|256|260|261|262|275|276|281|282)|(?:Cube|Cylinder|Vert)(?:\\.?\\d{3})?)$',
    pubDims: { hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17 },
  },
  ua_t80bv: {
    // bashnya carries the FUSED gun; WT fingerprint — _vlo audit applies.
    // §5.248 ukraine round ORIENTATION FIX: muzzle toward raw -Z (bo4ki
    // fuel drums + unditching log at the raw +Z end) and the fused gun
    // gives the auto-flip nothing to read -> explicit yawOffset PI.
    // _vlo AUDIT: T80BV_chassis_vlo.0 (11316v) rides the hull node but
    // spans only y 0.10..1.12 inside the chassis+track union — a low-LOD
    // running-gear shell, NOT an articulated-content bake; masks benign.
    path: 'public/models/community-candidates/t80bv_ua_manako.glb',
    turretNode: '^bashnya$', yawOffset: Math.PI, autoPivot: true,
    pubDims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
  },
  ariete_c1: {
    // Applique/Glass span hull+turret — stay hull until the measure lane
    // splits them; also the ariete_c2 influence print.
    path: 'public/models/community-candidates/ariete_c1_arrafi.glb',
    turretNode: '^Object_5$', gunNode: '^Object_7$', autoPivot: true,
    turretFollowers: '^Object_(?:2|6)$', scaleToOverall: true,
    pubDims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.50 },
  },
  carro45t: {
    // Paper vehicle — dims LOW-CONF; antenna fused into the turret (window
    // height reads, k2-RWS precedent).
    path: 'public/models/community-candidates/carro45t_hlebov.glb',
    turretNode: '^Object_58$', gunNode: '^Object_4$', gunFollowers: '^Object_6$',
    autoPivot: true,
    pubDims: { hullLengthM: 6.98, overallLengthM: 10.60, widthM: 3.43, heightM: 2.95 },
  },
  t14: {
    // "T-14 Armara Uralvagon Factory" by 3DYAROSLAV2 (CC-BY-4.0; Russian
    // semantic materials BASHNYA/KORPUS/PULEMETORUDIE = original Blender
    // work). 223 MB LOCAL-ONLY (gitignored staging area) — this extract is
    // the committed artifact, the GLB never pushes. Flat OBJ nodes: turret
    // shell Object_8 (BASHNYA1) + Object_9/10/11 cluster (harness maps
    // carry them as turretFollowers — this tool models split loss only),
    // gun tube Object_14 (PULEMETORUDIE, muzzle toward raw -z -> yaw PI).
    path: 'public/models/community-candidates/t-14_armara_uralvagon_factory.glb',
    turretNode: '^Object_8$', gunNode: '^Object_14$', autoPivot: true,
    yawOffset: Math.PI,
    pubDims: { hullLengthM: 8.7, overallLengthM: 10.8, widthM: 3.9, heightM: 2.7 },
  },
  // (t72b3 BASE-id row retired 2026-08-06: the owner delisted t72b3 from
  // the roster and overrode t72b3m's oracle to the obr_2022 print — the
  // registration moved to the t72b3m key above; its extract t72b3.json
  // was deleted as stale pre-batch-45 bytes of a delisted id.)
  challenger_3: {
    // "Challenger 3" by 42manako — CC-BY-NC-4.0: LOCAL MEASUREMENT ONLY,
    // never ship. OWNER GREENLIGHT 2026-08-06: challenger_3 is now a BUILT
    // vehicle (modern1.js spec+builder) and this row is mirrored into all
    // THREE harness maps (oracle-backed moderns round). Authored FBX hierarchy
    // (hull/turret/trophy/smoke*/antennas; gun = 'weapon' under 'mount').
    // pubDims ANCHOR CAVEAT: no CR3 spec exists in the roster — anchored
    // to the Challenger 2 hull family figures (CR3 reuses the CR2 hull;
    // L55A1 is L/55 like the L30) purely to scale the extract; the packet
    // note records the raw proportions as the real deliverable.
    // Raw nose = +X (gunBox +x, turret seat +x) -> yawOffset -90, the
    // leclerc convention (first extract run confirmed: z-box was the 3.5 m
    // width, gun along +x).
    path: 'public/models/tanks/community/challenger_3.glb',
    turretNode: '^turret$', gunNode: '^weapon$', autoPivot: true,
    yawOffset: -Math.PI / 2,
    pubDims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.49 },
  },
  leo1a4_scan: {
    // "Leopard 1A4 [photogrammetry scan]" by pervonharke (CC-BY-4.0) —
    // leo1a5 FAMILY-INFLUENCE report only (no leo1a4 id in the roster; the
    // leo1a5 build takes its grammar from this + photos). Single fused
    // photogrammetry mesh, no turret node -> fixedMount-style whole-box
    // measure against the leo1a5 spec dims (modern2.js).
    path: 'public/models/tanks/community/leopard_1a4_photogrammetry_scan.glb',
    fixedMount: true,
    pubDims: { hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.62 },
  },
  leo1a5: {
    // Owner-supplied articulated Leopard 1 oracle (Marina.Kardava,
    // CC-BY-4.0). The GLB remains a local authoring input: gameplay stays
    // first-party procedural. Raw hierarchy keeps hull, turret, gun and
    // both running-gear sides in distinct nodes.
    path: 'public/models/community-candidates/tank_leopard_1.glb',
    turretNode: '^Turret_01$', gunNode: '^gun_01_Shape$', autoPivot: true,
    yawOffset: Math.PI,
    pubDims: { hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.62 },
  },
};
const RUSSIA_IDS = Object.keys(REG);

// ------------------------------------------------------------------- args --
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const idsArg = getArg('ids', 'all');
const OUTDIR = path.join(ROOT, getArg('out', 'docs/references/vertex'));
const RES = Number(getArg('res', 2560));
const ids = idsArg === 'all' ? RUSSIA_IDS : idsArg.split(',').map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------- glb parsing --
function readGLB(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const length = data.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < length) {
    const clen = data.readUInt32LE(off);
    const ctype = data.readUInt32LE(off + 4);
    const payload = data.subarray(off + 8, off + 8 + clen);
    if (ctype === 0x4e4f534a) json = JSON.parse(payload.toString('utf8'));
    else if (ctype === 0x004e4942) bin = payload;
    off += 8 + clen;
  }
  return { json, bin };
}

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accArray(gltf, bin, ai) {
  const acc = gltf.accessors[ai];
  if (acc.sparse) throw new Error('sparse accessor unsupported');
  const bv = gltf.bufferViews[acc.bufferView];
  const n = NCOMP[acc.type];
  const csz = COMP[acc.componentType];
  const stride = bv.byteStride || n * csz;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = base + i * stride + c * csz;
      let v;
      if (acc.componentType === 5126) v = bin.readFloatLE(o);
      else if (acc.componentType === 5125) v = bin.readUInt32LE(o);
      else if (acc.componentType === 5123) v = bin.readUInt16LE(o);
      else if (acc.componentType === 5121) v = bin.readUInt8(o);
      else if (acc.componentType === 5122) v = bin.readInt16LE(o);
      else v = bin.readInt8(o);
      out[i * n + c] = v;
    }
  }
  return { arr: out, count: acc.count, n };
}

// --------------------------------------------------------------- mat math --
// column-major 4x4 (glTF/three layout)
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function matMul(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
  }
  return r;
}
function nodeLocal(node) {
  if (node.matrix) return [...node.matrix];
  const t = node.translation || [0, 0, 0];
  const q = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
const xfp = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
// three.js Euler XYZ rotation matrix (Matrix4.makeRotationFromEuler order XYZ)
function eulerXYZ(x, y, z) {
  const a = Math.cos(x); const b = Math.sin(x);
  const c = Math.cos(y); const d = Math.sin(y);
  const e = Math.cos(z); const f = Math.sin(z);
  const ae = a * e; const af = a * f; const be = b * e; const bf = b * f;
  return [
    c * e, af + be * d, bf - ae * d, 0,
    -c * f, ae - bf * d, be + af * d, 0,
    d, -b * c, a * c, 0,
    0, 0, 0, 1,
  ];
}

// ------------------------------------------------------------- scene model --
// Flattened list of prim INSTANCES: { nodeIdx, name, meshName, world, pos:
// Float64Array xyz triplets (glb world), tris: Uint32Array }
function buildScene(gltf, bin) {
  const sceneDef = gltf.scenes[gltf.scene ?? 0];
  const nodes = gltf.nodes;
  const inst = [];
  const nodeWorld = new Array(nodes.length).fill(null);
  const nodeParent = new Array(nodes.length).fill(-1);
  const order = []; // three traversal order (depth-first, children in order)
  const visit = (ni, parentM, parentI) => {
    const node = nodes[ni];
    const world = matMul(parentM, nodeLocal(node));
    nodeWorld[ni] = world;
    nodeParent[ni] = parentI;
    order.push(ni);
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        if ((prim.mode ?? 4) !== 4) continue; // triangles only
        if (prim.attributes.POSITION === undefined) continue;
        if (prim.extensions?.KHR_draco_mesh_compression) throw new Error('draco unsupported');
        const P = accArray(gltf, bin, prim.attributes.POSITION);
        const world3 = world;
        const pos = new Float64Array(P.count * 3);
        for (let i = 0; i < P.count; i++) {
          const p = xfp(world3, P.arr[i * 3], P.arr[i * 3 + 1], P.arr[i * 3 + 2]);
          pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
        }
        let tris;
        if (prim.indices !== undefined) {
          const I = accArray(gltf, bin, prim.indices);
          tris = Uint32Array.from(I.arr);
        } else {
          tris = new Uint32Array(P.count);
          for (let i = 0; i < P.count; i++) tris[i] = i;
        }
        // referenced-verts mask: index surgery (repair_oracles batches) leaves
        // stale unreferenced verts in the buffer — they never render and must
        // never count in measurements.
        const refd = new Uint8Array(P.count);
        for (const vi of tris) refd[vi] = 1;
        // GLTFLoader parity: geometry.boundingBox comes from the accessor's
        // authored min/max (NOT the raw array) — repairs rebuild these.
        const accPos = gltf.accessors[prim.attributes.POSITION];
        const localBox = (accPos.min && accPos.max)
          ? { lo: accPos.min.slice(0, 3), hi: accPos.max.slice(0, 3) }
          : null;
        inst.push({
          nodeIdx: ni, name: node.name || '', meshName: mesh.name || '',
          world, pos, tris, vcount: P.count, refd, localBox,
        });
      }
    }
    for (const ci of node.children || []) visit(ci, world, ni);
  };
  for (const ri of sceneDef.nodes) visit(ri, IDENT, -1);
  return { inst, nodeWorld, nodeParent, order, nodes };
}

function findNodeIdx(scene, reStr) {
  const re = new RegExp(reStr, 'i');
  for (const ni of scene.order) {
    if (re.test(scene.nodes[ni].name || '')) return ni;
  }
  return -1;
}
function subtreeSet(scene, rootIdx) {
  const set = new Set();
  if (rootIdx < 0) return set;
  const kids = new Map();
  scene.order.forEach((ni) => {
    const p = scene.nodeParent[ni];
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(ni);
  });
  const stack = [rootIdx];
  while (stack.length) {
    const ni = stack.pop();
    set.add(ni);
    for (const ci of kids.get(ni) || []) stack.push(ci);
  }
  return set;
}
// findBestGunNode parity: all regex hits, pick largest corner-box span
function findBestGunIdx(scene, instances, reStr, withinSet = null) {
  const re = new RegExp(reStr, 'i');
  const hits = [];
  for (const ni of scene.order) {
    if (withinSet && !withinSet.has(ni)) continue;
    if (re.test(scene.nodes[ni].name || '')) hits.push(ni);
  }
  if (hits.length < 2) return hits[0] ?? -1;
  let best = hits[0]; let bestSpan = -Infinity;
  for (const ni of hits) {
    const sub = subtreeSet(scene, ni);
    let lo = [Infinity, Infinity, Infinity]; let hi = [-Infinity, -Infinity, -Infinity];
    for (const it of instances) {
      if (!sub.has(it.nodeIdx)) continue;
      for (let i = 0; i < it.pos.length; i += 3) {
        if (it.refd && !it.refd[i / 3]) continue;
        for (let k = 0; k < 3; k++) {
          if (it.pos[i + k] < lo[k]) lo[k] = it.pos[i + k];
          if (it.pos[i + k] > hi[k]) hi[k] = it.pos[i + k];
        }
      }
    }
    const span = lo[0] === Infinity ? 0 : Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    if (span > bestSpan) { best = ni; bestSpan = span; }
  }
  return best;
}

// corner-box (three Box3/GLTFLoader parity: the prim's ACCESSOR min/max box
// — geometry.boundingBox in the runtime — through nodeWorld then extraM)
function cornerBox(instances, filter, extraM = IDENT) {
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const it of instances) {
    if (filter && !filter(it)) continue;
    let l; let h; let M;
    if (it.localBox) { l = it.localBox.lo; h = it.localBox.hi; M = matMul(extraM, it.world); }
    else {
      // runtime kit boxes: pos is glb-world already
      l = [Infinity, Infinity, Infinity]; h = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < it.pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (it.pos[i + k] < l[k]) l[k] = it.pos[i + k];
          if (it.pos[i + k] > h[k]) h[k] = it.pos[i + k];
        }
      }
      if (l[0] === Infinity) continue;
      M = extraM;
    }
    for (const cx of [l[0], h[0]]) {
      for (const cy of [l[1], h[1]]) {
        for (const cz of [l[2], h[2]]) {
          const p = xfp(M, cx, cy, cz);
          for (let k = 0; k < 3; k++) {
            if (p[k] < lo[k]) lo[k] = p[k];
            if (p[k] > hi[k]) hi[k] = p[k];
          }
        }
      }
    }
  }
  return lo[0] === Infinity ? null : { lo, hi };
}

const isShadowName = (it) => /shadow/i.test(it.name) || /shadow/i.test(it.meshName);

// ------------------------------------------------------------ rasterizer ---
// Software mask raster with pixel-center sampling (GPU parity: degenerate
// projected triangles cover no pixel centers — the edge-on prism law).
function rasterize(tris2d, width, height, u0, v0, du) {
  const mask = new Uint8Array(width * height);
  const n = tris2d.length;
  for (let t = 0; t < n; t += 6) {
    const ax = tris2d[t]; const ay = tris2d[t + 1];
    const bx = tris2d[t + 2]; const by = tris2d[t + 3];
    const cx = tris2d[t + 4]; const cy = tris2d[t + 5];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) continue;
    let minX = Math.min(ax, bx, cx); let maxX = Math.max(ax, bx, cx);
    let minY = Math.min(ay, by, cy); let maxY = Math.max(ay, by, cy);
    let px0 = Math.max(0, Math.floor((minX - u0) / du - 0.5));
    let px1 = Math.min(width - 1, Math.ceil((maxX - u0) / du - 0.5));
    let py0 = Math.max(0, Math.floor((minY - v0) / du - 0.5));
    let py1 = Math.min(height - 1, Math.ceil((maxY - v0) / du - 0.5));
    const inv = 1 / area;
    for (let py = py0; py <= py1; py++) {
      const sy = v0 + (py + 0.5) * du;
      for (let px = px0; px <= px1; px++) {
        const sx = u0 + (px + 0.5) * du;
        const w0 = (bx - ax) * (sy - ay) - (by - ay) * (sx - ax);
        const w1 = (cx - bx) * (sy - by) - (cy - by) * (sx - bx);
        const w2 = (ax - cx) * (sy - cy) - (ay - cy) * (sx - cx);
        if ((w0 * inv >= 0) && (w1 * inv >= 0) && (w2 * inv >= 0)) mask[py * width + px] = 1;
      }
    }
  }
  return mask;
}

// column trace: [u, topV, botV] per lit pixel column (band incl. gaps)
function traceMask(mask, width, height, u0, v0, du) {
  const out = [];
  for (let x = 0; x < width; x++) {
    let top = -1; let bot = -1;
    for (let y = height - 1; y >= 0; y--) if (mask[y * width + x]) { top = y; break; }
    if (top < 0) { out.push(null); continue; }
    for (let y = 0; y < height; y++) if (mask[y * width + x]) { bot = y; break; }
    out.push([u0 + (x + 0.5) * du, v0 + (top + 0.5) * du, v0 + (bot + 0.5) * du]);
  }
  return out;
}

// downsample a pixel trace to N-bin gate-style columns over its own span
function binTrace(px, N) {
  const lit = px.filter(Boolean);
  if (!lit.length) return [];
  const a = lit[0][0]; const b = lit[lit.length - 1][0];
  const step = (b - a) / N;
  const out = [];
  for (let c = 0; c < N; c++) {
    const lo = a + c * step; const hi = a + (c + 1) * step;
    let top = -Infinity; let bot = Infinity; let any = false;
    for (const p of lit) {
      if (p[0] < lo || p[0] >= hi) continue;
      any = true;
      if (p[1] > top) top = p[1];
      if (p[2] < bot) bot = p[2];
    }
    out.push(any ? [+(lo + step / 2).toFixed(4), +top.toFixed(4), +bot.toFixed(4)] : null);
  }
  return out;
}

// Douglas-Peucker on [ [u,v], ... ]
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [x0, y0] = pts[i0]; const [x1, y1] = pts[i1];
    const dx = x1 - x0; const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1; let wd = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs(dy * (pts[i][0] - x0) - dx * (pts[i][1] - y0)) / len;
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([i0, worst], [worst, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Sutherland–Hodgman clip of a triangle against z0 <= z <= z1 (world z)
function clipTriZ(pts, z0, z1) {
  let poly = pts;
  for (const [za, sign] of [[z0, 1], [z1, -1]]) {
    const next = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]; const b = poly[(i + 1) % poly.length];
      const da = sign * (a[2] - za); const db = sign * (b[2] - za);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    poly = next;
    if (!poly.length) return [];
  }
  return poly;
}

// ------------------------------------------------------------ gate dims ----
function bodyExtent96(curve) {
  const cols = curve.filter(Boolean);
  if (!cols.length) return null;
  const rough = Math.max(...cols.map((c) => c[1])) - Math.min(...cols.map((c) => c[2]));
  const body = cols.filter((c) => c[1] - c[2] > rough * 0.12);
  if (!body.length) return null;
  const tops = body.map((c) => c[1]).sort((a, b) => a - b);
  const top = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.95))];
  const bot = Math.min(...body.map((c) => c[2]));
  return {
    h: top - bot, len: Math.abs(body[body.length - 1][0] - body[0][0]),
    top, bot, z0: body[0][0], z1: body[body.length - 1][0],
  };
}

// ------------------------------------------------------------------ main ---
fs.mkdirSync(OUTDIR, { recursive: true });

for (const id of ids) {
  const cfg = REG[id];
  if (!cfg) { console.error(`[skip] ${id}: not in registry`); continue; }
  const file = path.join(ROOT, cfg.path);
  const t0 = Date.now();
  const { json: gltf, bin } = readGLB(file);
  const scene = buildScene(gltf, bin);
  let instances = scene.inst.filter((it) => !isShadowName(it));

  // ---- runtime kit parity (modelLoader per-spec additions) ----
  if (cfg.runtimeKit === 't90a_k5_wedges') {
    const tp = findNodeIdx(scene, cfg.turretNode);
    const tpW = scene.nodeWorld[tp];
    for (const sgn of [-1, 1]) {
      const rot = eulerXYZ(-0.14, sgn * 0.95, sgn * 0.10);
      const T = [...IDENT]; T[12] = sgn * 0.52; T[13] = 0.42; T[14] = 1.42;
      const local = matMul(T, rot);
      const world = matMul(tpW, local);
      const hw = [0.15, 0.20, 0.43];
      const corners = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(xfp(world, sx * hw[0], sy * hw[1], sz * hw[2]));
      }
      const pos = new Float64Array(corners.flat());
      // 12 tris of a box over corner order (-,-,-),(-,-,+),(-,+,-),(-,+,+),(+,-,-)...
      const q = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
      const tris = [];
      for (const [a, b, c, d] of q) tris.push(a, b, c, a, c, d);
      instances.push({
        nodeIdx: tp, name: 'runtime_k5_wedge', meshName: 'runtime_k5_wedge',
        world, pos, tris: Uint32Array.from(tris), vcount: 8,
      });
    }
  }

  // ---- registration resolution (loader parity) ----
  // fixedMount (casemate) parity: loader sets turret=null, gun=null — whole
  // box scales to overallLengthM and every instance partitions as hull.
  const turretIdx = cfg.fixedMount ? -1 : findNodeIdx(scene, cfg.turretNode || 'turret');
  if (turretIdx < 0 && !cfg.fixedMount) throw new Error(`${id}: no turret node`);
  const turretSet = turretIdx >= 0 ? subtreeSet(scene, turretIdx) : new Set();
  const gunRe = cfg.gunNode || '(^|[_\\s.-])(gun|barrel|cannon)(?=$|[_\\s.-])';
  let gunIdx = cfg.fixedMount ? -1 : findBestGunIdx(scene, instances, gunRe, turretSet);
  if (gunIdx < 0 && !cfg.fixedMount && cfg.gunNode) gunIdx = findBestGunIdx(scene, instances, gunRe, null);
  const gunSet = gunIdx >= 0 ? subtreeSet(scene, gunIdx) : new Set();
  const partOf = (it) => {
    if (it.name.startsWith('runtime_')) return 'turret';
    if (gunSet.has(it.nodeIdx)) return 'gun';
    if (turretSet.has(it.nodeIdx)) return 'turret';
    return 'hull';
  };

  // ---- loader normalization chain ----
  // 1. orientation
  const R = eulerXYZ(cfg.pitchOffset || 0, cfg.yawOffset || 0, cfg.rollOffset || 0);
  // 2. hull box (corner boxes through R), gun excluded when resolved
  const useHullLen = gunIdx >= 0 && !cfg.scaleToOverall;
  const hullBB = cornerBox(instances, (it) => !(useHullLen && gunSet.has(it.nodeIdx)), R);
  const size = [hullBB.hi[0] - hullBB.lo[0], hullBB.hi[1] - hullBB.lo[1], hullBB.hi[2] - hullBB.lo[2]];
  const targetLen = useHullLen ? cfg.pubDims.hullLengthM : cfg.pubDims.overallLengthM;
  const s = Math.min(
    targetLen / Math.max(size[2], 1e-3),
    (cfg.pubDims.widthM * 1.08) / Math.max(size[0], 1e-3),
    (cfg.pubDims.heightM * 1.30) / Math.max(size[1], 1e-3),
  );
  const T = [
    -(hullBB.lo[0] + hullBB.hi[0]) / 2 * s,
    -hullBB.lo[1] * s,
    -(hullBB.lo[2] + hullBB.hi[2]) / 2 * s,
  ];
  // chain so far: v' = T + s*(R v)
  const chain = (v) => {
    const r = xfp(R, v[0], v[1], v[2]);
    return [r[0] * s + T[0], r[1] * s + T[1], r[2] * s + T[2]];
  };
  // 3. harness width safeScale (visible box = shadow-filtered corner boxes)
  const chainM = matMul([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, T[0], T[1], T[2], 1], R);
  const visBB = cornerBox(instances, null, chainM);
  const visW = visBB.hi[0] - visBB.lo[0];
  const k = Math.min(1.65, Math.max(0.68, cfg.pubDims.widthM / Math.max(visW, 1e-3)));
  // 4. autoPivot (for the flip check) — three parity
  let turretPivot = null;
  if (cfg.autoPivot) {
    const tb = cornerBox(instances, (it) => turretSet.has(it.nodeIdx), chainM);
    const toRaw = xfp(chainM, ...xfp(IDENT, scene.nodeWorld[turretIdx][12], scene.nodeWorld[turretIdx][13], scene.nodeWorld[turretIdx][14]));
    const inLoose = tb && toRaw[0] > tb.lo[0] - 0.6 && toRaw[0] < tb.hi[0] + 0.6 &&
      toRaw[1] > tb.lo[1] - 0.6 && toRaw[1] < tb.hi[1] + 0.6 &&
      toRaw[2] > tb.lo[2] - 0.6 && toRaw[2] < tb.hi[2] + 0.6;
    if (!tb || (toRaw[1] > 0.25 && inLoose)) turretPivot = toRaw;
    else turretPivot = [(tb.lo[0] + tb.hi[0]) / 2, Math.max(tb.lo[1], 0.4), (tb.lo[2] + tb.hi[2]) / 2];
  }
  let flip = cfg.assumeFlip ?? null;
  if (flip === null) {
    if (gunIdx >= 0 && turretPivot) {
      const gb = cornerBox(instances, (it) => gunSet.has(it.nodeIdx), chainM);
      flip = gb ? ((gb.lo[2] + gb.hi[2]) / 2 < turretPivot[2] - 0.08) : false;
    } else flip = false;
  }
  // final map glb-world -> gate-world
  const mapPt = (x, y, z) => {
    const c = chain([x, y, z]);
    let X = c[0] * k; const Y = c[1] * k; let Z = c[2] * k;
    if (flip) { X = -X; Z = -Z; }
    return [X, Y, Z];
  };

  // ---- transform all verts, build per-part triangle soups ----
  const parts = { whole: [], hull: [], turret: [], gun: [] };
  let totVerts = 0; let totTris = 0;
  for (const it of instances) {
    const part = partOf(it);
    const w = new Float64Array(it.pos.length);
    for (let i = 0; i < it.pos.length; i += 3) {
      const p = mapPt(it.pos[i], it.pos[i + 1], it.pos[i + 2]);
      w[i] = p[0]; w[i + 1] = p[1]; w[i + 2] = p[2];
    }
    totVerts += it.vcount;
    totTris += it.tris.length / 3;
    const entry = { pos: w, tris: it.tris, name: it.name, refd: it.refd };
    parts.whole.push(entry);
    if (part === 'hull') parts.hull.push(entry);
    else if (part === 'gun') { parts.gun.push(entry); parts.turret.push(entry); }
    else parts.turret.push(entry);
  }

  // Named component boxes are the shaded-parity authoring receipt: flat
  // Object_N donor files otherwise reduce every fitting to one undifferenced
  // silhouette. Keep the boxes in normalized gate space so a procedural
  // rebuild can reproduce the source's separate seated masses without ever
  // importing donor vertices at runtime.
  const components = parts.whole.map((entry) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < entry.pos.length; i += 3) {
      if (entry.refd && !entry.refd[i / 3]) continue;
      for (let d = 0; d < 3; d++) {
        lo[d] = Math.min(lo[d], entry.pos[i + d]);
        hi[d] = Math.max(hi[d], entry.pos[i + d]);
      }
    }
    return {
      name: entry.name,
      lo: lo.map((v) => +v.toFixed(3)),
      hi: hi.map((v) => +v.toFixed(3)),
      verts: entry.pos.length / 3,
      tris: entry.tris.length / 3,
    };
  });

  // gate-world box
  const box = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  for (const e of parts.whole) {
    for (let i = 0; i < e.pos.length; i += 3) {
      if (e.refd && !e.refd[i / 3]) continue;
      for (let d = 0; d < 3; d++) {
        if (e.pos[i + d] < box.lo[d]) box.lo[d] = e.pos[i + d];
        if (e.pos[i + d] > box.hi[d]) box.hi[d] = e.pos[i + d];
      }
    }
  }

  // ---- rasterize views ----
  // views: side (u=z, v=y), plan (u=x, v=z), front (u=x, v=y)
  const pad = 0.15;
  const windows = {
    side: { u0: box.lo[2] - pad, u1: box.hi[2] + pad, v0: box.lo[1] - pad, v1: box.hi[1] + pad },
    plan: { u0: box.lo[0] - pad, u1: box.hi[0] + pad, v0: box.lo[2] - pad, v1: box.hi[2] + pad },
    front: { u0: box.lo[0] - pad, u1: box.hi[0] + pad, v0: box.lo[1] - pad, v1: box.hi[1] + pad },
  };
  const proj = {
    side: (p, i) => [p[i + 2], p[i + 1]],
    plan: (p, i) => [p[i], p[i + 2]],
    front: (p, i) => [p[i], p[i + 1]],
  };
  const curves = {};
  const masks = {};
  for (const view of ['side', 'plan', 'front']) {
    const w = windows[view];
    const du = (w.u1 - w.u0) / RES;
    const H = Math.ceil((w.v1 - w.v0) / du);
    for (const part of ['whole', 'hull', 'turret', 'gun']) {
      if (part === 'gun' && !parts.gun.length) continue;
      const tri2 = [];
      for (const e of parts[part]) {
        const P = e.pos; const I = e.tris;
        for (let t = 0; t < I.length; t += 3) {
          const [ax, ay] = proj[view](P, I[t] * 3);
          const [bx, by] = proj[view](P, I[t + 1] * 3);
          const [cx, cy] = proj[view](P, I[t + 2] * 3);
          tri2.push(ax, ay, bx, by, cx, cy);
        }
      }
      const mask = rasterize(tri2, RES, H, w.u0, w.v0, du);
      masks[`${view}_${part}`] = { mask, W: RES, H, u0: w.u0, v0: w.v0, du };
      const px = traceMask(mask, RES, H, w.u0, w.v0, du);
      // emit at 1 cm bins to keep JSON readable but dense
      const lit = px.filter(Boolean);
      const spanU = lit.length ? lit[lit.length - 1][0] - lit[0][0] : 0;
      curves[`${view}_${part}`] = binTrace(px, Math.max(32, Math.round(spanU / 0.01)));
      curves[`${view}_${part}_96`] = binTrace(px, 96);
    }
  }

  // ---- gate dims replica (from the whole side/plan traces) ----
  const ext = bodyExtent96(curves.side_whole_96);
  const sideLit = curves.side_whole.filter(Boolean);
  const overall = sideLit.length ? sideLit[sideLit.length - 1][0] - sideLit[0][0] : 0;
  // plan pixel width, 0.35 m band rule (plan bands run along z = v axis)
  let wMin = null; let wMax = null;
  {
    const m = masks.plan_whole;
    for (let x = 0; x < m.W; x++) {
      let top = -1; let bot = -1;
      for (let y = 0; y < m.H; y++) if (m.mask[y * m.W + x]) { if (bot < 0) bot = y; top = y; }
      if (top < 0 || (top - bot + 1) * m.du < 0.35) continue;
      const u = m.u0 + (x + 0.5) * m.du;
      if (wMin === null) wMin = u;
      wMax = u;
    }
  }
  // hull-mask span: the honest length anchor when a fused/authored-long tube
  // crosses the 12% body rule in the whole view (side_hull has no gun for
  // gun-node prints; fused-gun prints keep the tube here — flagged below)
  const hullLitPre = curves.side_hull.filter(Boolean);
  const hullMask = hullLitPre.length ? {
    z0: +hullLitPre[0][0].toFixed(3), z1: +hullLitPre[hullLitPre.length - 1][0].toFixed(3),
    span: +(hullLitPre[hullLitPre.length - 1][0] - hullLitPre[0][0]).toFixed(3),
  } : null;
  const measured = {
    bodyHeightM: ext ? +ext.h.toFixed(3) : null,
    bodyLenM: ext ? +ext.len.toFixed(3) : null,
    bodyTopM: ext ? +ext.top.toFixed(3) : null,
    bodyZ: ext ? [+ext.z0.toFixed(3), +ext.z1.toFixed(3)] : null,
    overallLenM: +overall.toFixed(3),
    hullMask,
    widthM: wMin !== null ? +(wMax - wMin + masks.plan_whole.du).toFixed(3) : null,
    box: { lo: box.lo.map((v) => +v.toFixed(3)), hi: box.hi.map((v) => +v.toFixed(3)) },
  };
  const pub = cfg.pubDims;
  const stylization = {
    heightPct: measured.bodyHeightM ? +((measured.bodyHeightM / pub.heightM - 1) * 100).toFixed(1) : null,
    hullLenPct: measured.bodyLenM ? +((measured.bodyLenM / pub.hullLengthM - 1) * 100).toFixed(1) : null,
    // fixedMount: the loader's "hull mask" is the FULL box (gun included) —
    // the honest published compare is overallLengthM, not hullLengthM.
    hullMaskPct: hullMask ? +((hullMask.span / (cfg.fixedMount ? pub.overallLengthM : pub.hullLengthM) - 1) * 100).toFixed(1) : null,
    overallPct: +((measured.overallLenM / pub.overallLengthM - 1) * 100).toFixed(1),
    widthPct: measured.widthM ? +((measured.widthM / pub.widthM - 1) * 100).toFixed(1) : null,
  };

  // ---- stations (gate replica: side hull mask z-range, 14 z-slabs) ----
  const hullLit = curves.side_hull.filter(Boolean);
  const zr = hullLit.length ? [hullLit[0][0], hullLit[hullLit.length - 1][0]] : [box.lo[2], box.hi[2]];
  const stations = [];
  for (let i = 0; i < 14; i++) {
    const z0 = zr[0] + (i / 14) * (zr[1] - zr[0]);
    const z1 = zr[0] + ((i + 1) / 14) * (zr[1] - zr[0]);
    const tri2 = [];
    for (const e of parts.whole) {
      const P = e.pos; const I = e.tris;
      for (let t = 0; t < I.length; t += 3) {
        const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]];
        const b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]];
        const c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
        if (Math.max(a[2], b[2], c[2]) < z0 || Math.min(a[2], b[2], c[2]) > z1) continue;
        const poly = clipTriZ([a, b, c], z0, z1);
        for (let v = 1; v + 1 < poly.length; v++) {
          tri2.push(poly[0][0], poly[0][1], poly[v][0], poly[v][1], poly[v + 1][0], poly[v + 1][1]);
        }
      }
    }
    const w = windows.front;
    const du = (w.u1 - w.u0) / 1024;
    const H = Math.ceil((w.v1 - w.v0) / du);
    const m = rasterize(tri2, 1024, H, w.u0, w.v0, du);
    let minX = Infinity; let maxX = -Infinity; let maxY = -Infinity; let minY = Infinity; let area = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 1024; x++) {
        if (!m[y * 1024 + x]) continue;
        area++;
        const wx = w.u0 + (x + 0.5) * du; const wy = w.v0 + (y + 0.5) * du;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy > maxY) maxY = wy; if (wy < minY) minY = wy;
      }
    }
    stations.push(area ? {
      i, z: +((z0 + z1) / 2).toFixed(3), w: +(maxX - minX).toFixed(3),
      top: +maxY.toFixed(3), bot: +minY.toFixed(3),
      x: [+minX.toFixed(3), +maxX.toFixed(3)],
    } : { i, z: +((z0 + z1) / 2).toFixed(3), empty: true });
  }

  // ---- vertex-space z-profiles per part (0.05 m bins) + landmarks ----
  const zProfile = (entries) => {
    const bin = 0.05;
    const n = Math.ceil((box.hi[2] - box.lo[2]) / bin) + 1;
    const rows = Array.from({ length: n }, () => null);
    for (const e of entries) {
      for (let i = 0; i < e.pos.length; i += 3) {
        if (e.refd && !e.refd[i / 3]) continue;
        const zi = Math.floor((e.pos[i + 2] - box.lo[2]) / bin);
        if (zi < 0 || zi >= n) continue;
        const r = rows[zi] || (rows[zi] = { halfW: 0, yMin: Infinity, yMax: -Infinity });
        const ax = Math.abs(e.pos[i]);
        if (ax > r.halfW) r.halfW = ax;
        if (e.pos[i + 1] < r.yMin) r.yMin = e.pos[i + 1];
        if (e.pos[i + 1] > r.yMax) r.yMax = e.pos[i + 1];
      }
    }
    return rows.map((r, i) => (r ? {
      z: +(box.lo[2] + (i + 0.5) * bin).toFixed(3),
      halfW: +r.halfW.toFixed(3), yMin: +r.yMin.toFixed(3), yMax: +r.yMax.toFixed(3),
    } : null)).filter(Boolean);
  };
  const deckPts = curves.side_hull.filter(Boolean).map((p) => [p[0], p[1]]);
  const bellyPts = curves.side_hull.filter(Boolean).map((p) => [p[0], p[2]]);
  const landmarks = {
    deckCorners: simplify(deckPts, 0.02).map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]),
    bellyCorners: simplify(bellyPts, 0.02).map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]),
    turretZProfile: zProfile(parts.turret.filter((e) => !parts.gun.includes(e))),
    hullZProfile: zProfile(parts.hull),
  };
  if (parts.gun.length) {
    // bore line: per z-bin centroid + max radius of gun verts
    const gb = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    const rows = [];
    for (const e of parts.gun) {
      for (let i = 0; i < e.pos.length; i += 3) {
        if (e.refd && !e.refd[i / 3]) continue;
        rows.push([e.pos[i], e.pos[i + 1], e.pos[i + 2]]);
        for (let d = 0; d < 3; d++) {
          if (e.pos[i + d] < gb.lo[d]) gb.lo[d] = e.pos[i + d];
          if (e.pos[i + d] > gb.hi[d]) gb.hi[d] = e.pos[i + d];
        }
      }
    }
    rows.sort((a, b) => a[2] - b[2]);
    const seg = [];
    for (let z = Math.floor(gb.lo[2] * 10) / 10; z < gb.hi[2]; z += 0.1) {
      const sl = rows.filter((r) => r[2] >= z && r[2] < z + 0.1);
      if (!sl.length) continue;
      const cy = sl.reduce((sum, r) => sum + r[1], 0) / sl.length;
      const rr = Math.max(...sl.map((r) => Math.hypot(r[0], r[1] - cy)));
      seg.push({ z: +(z + 0.05).toFixed(2), axisY: +cy.toFixed(3), r: +rr.toFixed(3) });
    }
    landmarks.gunContour = seg;
    landmarks.gunBox = { lo: gb.lo.map((v) => +v.toFixed(3)), hi: gb.hi.map((v) => +v.toFixed(3)) };
  }

  // ---- ORIENTATION ASSERT (owner directive 2026-08-01, three-layer
  // doctrine): bow must be +z by the gun-forward convention, cross-checked
  // against the GLACIS — the dominant sloped upper plate: outward normals of
  // up-sloping hull tris vote sign(n_z) weighted by area, but only where the
  // tri SITS in the matching outer third (a glacis slopes up toward the bow
  // it lives at; engine-deck slopes vote the other way and live aft).
  // A sign mismatch = the print's hull faces away from its gun (the
  // t62_bergman bake bug) — flagged loudly, never silently scored past.
  const orientation = (() => {
    let vote = 0;
    const dbg = [];
    // per-end slope-band accumulators: the GLACIS is a LONG, TALL band of
    // 30-70 deg plates; tail rakes are short — net tri area alone inverted
    // the vote on every print (rear-rake tris are individually larger)
    const band = {
      1: { area: 0, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity },
      '-1': { area: 0, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity },
    };
    const span = box.hi[2] - box.lo[2];
    const zmid = (box.hi[2] + box.lo[2]) / 2;
    for (const e of parts.hull) {
      const Pp = e.pos; const I = e.tris;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3; const b = I[t + 1] * 3; const c = I[t + 2] * 3;
        const ux = Pp[b] - Pp[a]; const uy = Pp[b + 1] - Pp[a + 1]; const uz = Pp[b + 2] - Pp[a + 2];
        const vx = Pp[c] - Pp[a]; const vy = Pp[c + 1] - Pp[a + 1]; const vz = Pp[c + 2] - Pp[a + 2];
        let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
        const area2 = Math.hypot(nx, ny, nz);
        if (area2 < 1e-8) continue;
        const cy = (Pp[a + 1] + Pp[b + 1] + Pp[c + 1]) / 3;
        const cz = (Pp[a + 2] + Pp[b + 2] + Pp[c + 2]) / 3;
        if (cy < box.hi[1] * 0.30) continue;              // upper works only
        // outward orientation: winding is unreliable in these prints — point
        // the normal up (glacis/deck plates face up; belly excluded above)
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const n = 1 / area2;
        // SOVIET GLACIS BAND: the upper glacis runs ~20-30 deg from
        // horizontal (ny 0.85-0.97, |nz| 0.22-0.55). The first two cuts
        // (30-70 deg) selected TAIL RAKES instead on every print — the
        // Soviet glacis is shallower than a western one.
        if (ny * n < 0.85 || ny * n > 0.975) continue;
        if (Math.abs(nz * n) < 0.22 || Math.abs(nz * n) > 0.55) continue;
        if (Math.abs(cz - zmid) < span * 0.18) continue;  // outer thirds only
        if (Math.sign(nz) !== Math.sign(cz - zmid)) continue; // slope faces its own end
        const sgn = Math.sign(nz);
        const bk = band[sgn];
        bk.area += area2;
        if (cz < bk.z0) bk.z0 = cz; if (cz > bk.z1) bk.z1 = cz;
        if (cy < bk.y0) bk.y0 = cy; if (cy > bk.y1) bk.y1 = cy;
        if (process.env.ORIENT_DEBUG) {
          dbg.push([sgn * area2, +cz.toFixed(2), +cy.toFixed(2),
            +(ny * n).toFixed(2), +(nz * n).toFixed(2), e.name]);
        }
      }
    }
    if (process.env.ORIENT_DEBUG) {
      dbg.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
      console.log(`[orient-debug ${id}] top contributors [signedArea, cz, cy, ny, nz, node]:`);
      for (const d of dbg.slice(0, 15)) console.log('   ', JSON.stringify(d));
    }
    const score = (bk) => (bk.area <= 0 ? 0
      : (bk.z1 - bk.z0) * (bk.y1 - bk.y0) * Math.sqrt(bk.area));
    const sPlus = score(band[1]);
    const sMinus = score(band['-1']);
    vote = sPlus - sMinus;
    // PRIMARY glacis signal — mask deck-descent run (normals-free): the bow
    // climbs from a low nose to the deck plateau over a LONG run (Soviet
    // glacis 1.0-1.4 m); the tail tops out within a short drop (tail plate,
    // drums/log sit high immediately). Longer terminal descent = bow.
    const hullTops = curves.side_hull.filter(Boolean);
    let descentBow = 0;
    if (hullTops.length > 10) {
      const tops = hullTops.map((c) => c[1]).sort((a, b) => a - b);
      const plateau = tops[Math.floor(tops.length * 0.9)];
      const runFrom = (arr) => {
        const z0 = arr[0][0];
        for (const c of arr) if (c[1] >= plateau * 0.94) return Math.abs(c[0] - z0);
        return Math.abs(arr[arr.length - 1][0] - z0);
      };
      const runFront = runFrom([...hullTops].reverse());
      const runRear = runFrom(hullTops);
      descentBow = runFront > runRear * 1.15 ? 1 : (runRear > runFront * 1.15 ? -1 : 0);
      band.runs = { runFront: +runFront.toFixed(2), runRear: +runRear.toFixed(2) };
    }
    const glacisSign = descentBow !== 0 ? descentBow : (Math.sign(vote) || 0);
    // gun-forward sign: the barrel overhang end (thin span beyond the hull
    // mask); works for split-gun AND fused-tube prints
    const wl = curves.side_whole.filter(Boolean);
    const wz = wl.length ? [wl[0][0], wl[wl.length - 1][0]] : [0, 0];
    const overF = hullMask ? wz[1] - hullMask.z1 : 0;
    const overR = hullMask ? hullMask.z0 - wz[0] : 0;
    const gunSign = Math.abs(overF - overR) < 0.3 ? 0 : (overF > overR ? 1 : -1);
    const tl = curves.side_turret ? curves.side_turret.filter(Boolean) : [];
    const tmid = tl.length ? (tl[0][0] + tl[tl.length - 1][0]) / 2 : null;
    const hmid = hullMask ? (hullMask.z0 + hullMask.z1) / 2 : 0;
    const turretSeatSign = tmid === null ? null : (Math.sign(tmid - hmid) || 0);
    const rawAgree = glacisSign !== 0 && gunSign !== 0 ? glacisSign === gunSign : null;
    const adjudicated = rawAgree === false ? (cfg.orientationAdjudicated || null) : null;
    return { glacisSign, descentRuns: band.runs || null, normalVote: +vote.toFixed(2),
      gunSign, turretSeatSign, rawAgree, agree: adjudicated ? true : rawAgree,
      ...(adjudicated ? { adjudicated } : {}) };
  })();
  if (orientation.adjudicated) {
    console.warn(`[vertex ${id}] ORIENTATION HEURISTIC MISFIRE ADJUDICATED: ${orientation.adjudicated}`);
  } else if (orientation.agree === false) {
    console.error(`[vertex ${id}] ORIENTATION MISMATCH: glacis faces ${orientation.glacisSign > 0 ? '+z' : '-z'} ` +
      `but the gun faces ${orientation.gunSign > 0 ? '+z' : '-z'} — the hull is BACKWARDS vs its gun ` +
      `(t62_bergman class). DO NOT score this print; repair orientation first.`);
  }

  // ---- INTERPENETRATION ASSERT: turret underside vs hull deck (outside the
  // ring/race annulus the dome must not dip below the local deck line) ----
  const interpen = (() => {
    if (!parts.turret.length) return null;
    const cell = 0.12;
    const deckMap = new Map();
    for (const e of parts.hull) {
      for (let i = 0; i < e.pos.length; i += 3) {
        if (e.refd && !e.refd[i / 3]) continue;
        const y = e.pos[i + 1];
        if (y < box.hi[1] * 0.35) continue; // upper hull only
        const key = `${Math.round(e.pos[i] / cell)},${Math.round(e.pos[i + 2] / cell)}`;
        if (!deckMap.has(key) || deckMap.get(key) < y) deckMap.set(key, y);
      }
    }
    // turret plan center from its own extent
    let cx = 0; let cz = 0; let n = 0;
    for (const e of parts.turret) {
      if (parts.gun.includes(e)) continue;
      for (let i = 0; i < e.pos.length; i += 3) {
        if (e.refd && !e.refd[i / 3]) continue;
        cx += e.pos[i]; cz += e.pos[i + 2]; n++;
      }
    }
    if (!n) return null;
    cx /= n; cz /= n;
    let worst = 0; let count = 0;
    for (const e of parts.turret) {
      if (parts.gun.includes(e)) continue;
      for (let i = 0; i < e.pos.length; i += 3) {
        if (e.refd && !e.refd[i / 3]) continue;
        const r = Math.hypot(e.pos[i] - cx, e.pos[i + 2] - cz);
        if (r < 1.05) continue; // ring/race annulus exempt
        const key = `${Math.round(e.pos[i] / cell)},${Math.round(e.pos[i + 2] / cell)}`;
        const deck = deckMap.get(key);
        if (deck === undefined) continue;
        const dip = deck - e.pos[i + 1];
        if (dip > 0.06) { count++; if (dip > worst) worst = dip; }
      }
    }
    return { violations: count, worstDipM: +worst.toFixed(3), ringExemptR: 1.05 };
  })();
  if (interpen && interpen.violations > 50) {
    console.error(`[vertex ${id}] INTERPENETRATION: ${interpen.violations} turret verts dip up to ` +
      `${interpen.worstDipM} m below the hull deck outside the ring annulus.`);
  }

  // ---- glb-world <-> gate-world affine map (for repair recipes) ----
  // gate = k*(T + s*R*glb), plus optional flip (x,z -> -x,-z).
  // With yaw in {0, ±90, 180}, R is an axis permutation: derive per-axis map.
  const axisMap = [];
  for (let d = 0; d < 3; d++) {
    // image of glb axis d under R (unit vector)
    const img = [R[d * 4], R[d * 4 + 1], R[d * 4 + 2]];
    const gd = img.findIndex((v) => Math.abs(v) > 0.9);
    let sign = Math.sign(img[gd]) * (flip && (gd === 0 || gd === 2) ? -1 : 1);
    axisMap.push({ glbAxis: 'xyz'[d], gateAxis: 'xyz'[gd], scale: +(k * s).toFixed(6), sign });
  }
  const offset = [k * T[0] * (flip ? -1 : 1), k * T[1], k * T[2] * (flip ? -1 : 1)];

  const report = {
    id, file: cfg.path, generated: new Date().toISOString(),
    generator: 'vertex-extract.mjs (triangle raster, gate-parity pipeline)',
    counts: { instances: instances.length, verts: totVerts, tris: totTris },
    registration: {
      turretNode: cfg.turretNode, gunNode: cfg.gunNode || null,
      gunResolved: gunIdx >= 0 ? scene.nodes[gunIdx].name : null,
      yawOffset: cfg.yawOffset || 0, autoPivot: !!cfg.autoPivot,
      useHullLen, loaderScale: +s.toFixed(6), safeScaleK: +k.toFixed(6),
      flip, turretPivot: turretPivot ? turretPivot.map((v) => +v.toFixed(3)) : null,
    },
    glbToGate: { axisMap, offsetGate: offset.map((v) => +v.toFixed(4)) },
    pubDims: pub, measured, stylization,
    orientation, interpen, components,
    stations, landmarks, curves,
  };
  fs.writeFileSync(path.join(OUTDIR, `${id}.json`), JSON.stringify(report));
  console.log(`[vertex ${id}] verts ${totVerts} tris ${totTris} | ` +
    `bodyH ${measured.bodyHeightM} (${stylization.heightPct}%) ` +
    `bodyLen ${measured.bodyLenM} (${stylization.hullLenPct}%) ` +
    `hullMask ${hullMask?.span} (${stylization.hullMaskPct}%) ` +
    `overall ${measured.overallLenM} (${stylization.overallPct}%) ` +
    `width ${measured.widthM} (${stylization.widthPct}%) | ` +
    `flip ${flip} k ${k.toFixed(3)} s ${s.toFixed(4)} | ${Date.now() - t0}ms`);
}
console.log(`[vertex-extract] wrote ${ids.length} report(s) -> ${OUTDIR}`);
