# Zero-row triage — 13 no-profile tanks (2026-08-03)

Scope: the 13 ledger zero rows with NO procedural profile key in
`src/vehicles/profiles/*.js`: t90m, t44, t54, type59, t80, t80b, t80bv,
amx30, amx30b2, m48, m60a2, vickers_mk1, t84.

Method (false-0 law respected — probe first, gate only renderers):

1. Registration read from `src/vehicles/userdrops7.js` (12 gen2 rows) and
   `src/vehicles/userdrops2.js` (t90m — NOTE: the specs.js
   `t90m:{source:'procedural'}` row is REPLACED at import time by the
   unconditional userdrops2 override; t90m IS a GLB-sourced reference).
2. Render probe `tools/tmp-triage-probe.mjs`: plain fidelity-page load per id,
   console/pageerror capture, red-pixel census over all overlay canvases
   (red=ref, cyan=proc), rig-split mesh counts, screenshots
   `shots/triage-zero/<id>.png` + raw JSON `shots/triage-zero/triage-probe.json`.
3. Stylization mini-extract `tools/tmp-triage-styl.mjs` (vertex-extract has NO
   REG rows for any of the 13 — extract instrument missing fleet-wide here):
   antenna-robust body extents (gate's 12%-thickness column rule) on side-view
   masks of BOTH models, vs published dims.
4. Gate baseline: ALL 13 probe-rendered, so all 13 batched into one
   `node tools/geometry-gate.mjs --ids=...` run (ledger + per-id jsons
   refreshed against today's tree).

RESULT HEADLINE: every reference loads, swaps, rig-splits and articulates
(floaters 100 across poses, no reference orientation flips). There are NO
broken registrations (b) and NO defective-oracle hard blockers (c) — all 13
are bucket (a): no build attempt exists; every measured "procedural" is a
donor-family stand-in, so the zeros are honest donor-vs-reference divergence.
Four oracles carry caveats to check during authoring (see notes column).

| id | registration | ref renders | proc renders | extract / stylization (ref vs pub, body-extent) | gate baseline (min / components h,w,t,st,d,f) | bucket | proposed family | blocking defect | notes |
|---|---|---|---|---|---|---|---|---|---|
| t90m | userdrops2 glb `t90m_minehffd.glb` turret `^Turret$` gun `^Main_barrel$` autoPivot scaleToOverall yaw +90° heroTex; file OK | YES (25 turret + 6 gun meshes) | YES — canonical `buildT90M`, board 75.4 | no REG; len x1.032, hull x1.089, height x1.350 (roof RWS/sight furniture, thick-column) | 0 / 19.7, 0, 0, 0, 0, 100 | (a) | russia.js | none — packet MISSING (only tank with no scout packet; height datum unresolved) | Closest-to-done: hand-built canonical already bulk-matches (minView 75.9). Proc itself is 13.5% tall vs pub 2.23 (dims 0). One benign 404 (texture-adjacent) during load; masks unaffected. Write packet, then profile-ize vs t90sm/t90a lofts. |
| t44 | userdrops7 glb `community/t44_foxygamer.glb` `^Turret$` autoPivot paintUntextured; file OK | YES (12+4) | YES — donor t34_85 canonical, board 69.6 | no REG; len x0.982, hull x1.013, height x0.937 (clean oracle) | 0 / 0, 0, 0, 0, 0, 100 | (a) | russia.js | none | All-zero components = donor divergence (T-44 low hull + centered turret vs T-34-85), not a defect. Spec height 2.72 uses DShK convention (packet roof datum 2.46; print DShK reads thin — ref 2.55). New low-hull shape, medium effort. |
| t54 | userdrops7 glb `recovered/t54.glb` (NC quarantine, dev-only registration) `^Turret$` autoPivot; file OK | YES (12+4) | YES — donor t62mv1 profile, board 79.2 / minView 83.9 | no REG; len x1.048, hull x1.003, height x1.060 (clean) | 0 / 20.8, 0, 19.1, 6.2, 11.4, 100 | (a) | russia.js | none | Best soviet-medium starting point: hull board 89.2 vs t62mv1 donor. Near-clone of t62mv1 profile (T-62 = stretched T-54). Printed roof DShK present (m26/m45 convention). Easy. |
| type59 | userdrops7 glb `community/type69_lasttriarius.glb` `^Turret$` autoPivot; file OK | YES (12+4) | YES — donor t62mv1 profile, board 76.2 | no REG; len x0.980, height x1.023 (clean) | 0 / 21.4, 0, 0, 26.2, 0, 100 | (a) | russia.js | none | Oracle is a Type 69-II print (same WZ-120 silhouette per packet). Do AFTER t54 — becomes a t54-profile variant kit. Easy once t54 lands. |
| t80 | userdrops7 glb `recovered/t80.glb` (quarantine) `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor t80u profile (misc.js), board 89.4 | no REG; len x1.016, height x1.050 (clean; lenBody 1.4x is fat-tube artifact) | 0 / 0, 2.2, 0, 54.9, 70.8, 100 | (a) | russia.js | none | Highest score-per-effort in the set: t80u profile clone-with-edits (turret rear/stowage, gun). Board hull 88.7. |
| t80b | userdrops7 glb `recovered/t80b.glb` (quarantine) `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor t80u profile, board 80.1 | no REG; len x1.006, height x1.059 (clean) | 0 / 0, 0, 0, 52.2, 66.4, 100 | (a) | russia.js | none | t80 clone + applique turret. Batch with t80/t80bv. |
| t80bv | userdrops7 glb `recovered/t80bv.glb` (quarantine) `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor t80u profile, board 78.0 | no REG; len x0.955, height x0.995 (clean) | 0 / 0, 0, 0, 55.2, 67.4, 100 | (a) | russia.js | none | t80b + full Kontakt-1 ERA (decoration-kit-style brick work). |
| amx30 | userdrops7 glb `community/amx30b_ahab.glb` `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor leo1a5 canonical, board 66.7 (worst of set) | no REG; len x0.979, hull x0.982, height x1.384 (proud turret-top searchlight/cupola band — thick-column, NOT antenna) | 0 / 0, 0, 0, 0, 0, 100 | (a) — oracle caveat | NEW `france.js` (or misc.js) | none hard; oracle-trust check the +38% roof band before authoring | Most divergent donor (leo1a5): all curve components 0. Ref renders correctly; the tall red band is the AMX-30B rangefinder/searchlight cluster. Merkava proud-roof-furniture precedent (certified wholeCurves caps) likely applies. Medium-hard, new shape. |
| amx30b2 | userdrops7 glb `community/amx30b2_ahab.glb` `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor leo1a5 canonical, board 68.4 | no REG; len x0.926, height x1.314 (same roof band) | 0 / 0, 0, 0, 0, 0, 100 | (a) — oracle caveat | NEW `france.js` (or misc.js) | same as amx30 | Flip guard fired on side_hull vs the DONOR (mirrorScore 16.6) — donor-shape artifact, not a reference defect. Build together with amx30 (shared loft). |
| m48 | userdrops7 glb `community/m48a5_atmodeler.glb` `^Turret$` autoPivot; file OK | YES (14+5) | YES — donor m60a1 profile (patton.js), board 78.9 | no REG; len x1.082, hull x1.106, height x0.890 (no cupola-MG on print vs 3.09 MG-datum) | 0 / 53.9, 0, 0, 0, 7, 100 | (a) — oracle caveat | patton.js | none hard; ref TUBE ELEVATED at rest (red barrel angled up in side views) | Hull board 93.2 vs m60a1 donor — chassis nearly free. The elevated rest tube costs whole/gun curves: schedule tube surgery (russia batch-10 precedent) or zero the rest pitch at bake. Turret is rounded M48 casting vs m60a1 — reshape. Easy-medium. |
| m60a2 | userdrops7 glb `community/m60a2_ahab.glb` `^Turret$` autoPivot; file OK | YES (14+5) | YES — donor m60a1 profile, board 78.2 / minView 87.5 | no REG; len x1.025 (pub 7.27 stubby launcher), height x1.093 (clean) | 0 / 64.1, 36, 39.1, 50.1, 0, 100 | (a) | patton.js | none | EASIEST WIN of all 13: hull board 92.9, overall board 91.7. Needs only the Starship turret + stub 152 launcher (donor's long 105 inflates proc overall to 9.5 vs 7.27 → dims 0). |
| vickers_mk1 | userdrops7 glb `community/vickers_mk1_jack.glb` `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor chieftain_mk10 canonical, board 72.6 | no REG; len x0.948, hull x0.899, height x0.996 (clean) | 0 / 34, 0, 0, 0, 0, 100 | (a) | uk.js | none | Slab Centurion-style turret on flat hull; donor hull board 86.9. uk.js loft precedents apply. Medium-easy. |
| t84 | userdrops7 glb `recovered/t84.glb` (quarantine) `^Turret$` autoPivot; file OK | YES (13+4) | YES — donor t80u profile, board 73.3 | no REG; len x0.886 (SHORT — tube), hull x0.886, height x1.185 (roof Utes MG) | 0 / 33.2, 0, 0, 32.1, 81.6, 100 | (a) — oracle caveat | russia.js | none hard; ref overall length 11% short (short-baked tube) | Remix print (effective NC-SA). Recommend tube-length repair (batch-10 recipe) or certify a cap; dims anchor to published stays satisfiable (dims already 81.6). t80u clone + welded turret + bustle. Medium. |

Legend: gate components h=hullCurves, w=wholeCurves, t=turretCurves,
st=stations, d=dims, f=floaters. "board" = the fidelity page's IoU score
(coarser than the gate). Stylization = reference body extents / published
dims; 1.0 is perfect.

## Bucket summary

- (a) no serious build attempt: ALL 13. No profile key exists; the measured
  procedural is a family-donor stand-in in every case.
- (b) broken registration: NONE. Every GLB exists on disk, loads, swaps,
  splits turret+gun rigs and articulates cleanly (floaters 100 across poses).
- (c) defective oracle: NONE requiring a repair batch BEFORE build work
  starts. Caveats to handle inside the family rounds: t84 short tube (repair
  or cap), m48 elevated rest tube (surgery/pose-zero), amx30/amx30b2 proud
  roof band (+31–38% — oracle-trust inspect, likely merkava-style cap),
  t90m roof-furniture height datum (needs its packet written).
- (d) build registering nothing: NONE (the all-zero rows — t44, amx30,
  amx30b2 — are donor divergence, not failed builds).

## Instrument gaps (orchestrator work)

- `tools/vertex-extract.mjs` has NO REG rows for any of the 13. pubDims live
  in the userdrops7.js rows / scout packets; registration configs mirror the
  userdrops7 `glb()` shape (turretNode `^Turret$`, autoPivot, fused gun) and
  the userdrops2 t90m entry (`^Turret$`/`^Main_barrel$`, scaleToOverall,
  yaw +90°).
- t90m has no reference packet (`docs/references/tanks/t90m.md` missing;
  nothing in scout-gen2 covers it). All 12 others are covered by
  `docs/references/tanks/scout-gen2-{t44,t54,type59,t80,amx30,m48,m60a2,
  vickers_mk1,t84}.md` (t80 packet covers t80b/t80bv; amx30 covers b2).
- t44 height convention mismatch: packet roof datum 2.46 vs spec 2.72
  (DShK convention per the userdrops7 comment) — confirm before dims work.

## Build-order recommendation

Modern first per owner (t90m / t84 / t80-line lead), then score-per-effort:

1. russia.js T-80 batch — t80, t80b, t80bv in one round: donor t80u profile
   already boards 78–89, dims/stations halfway up; three rows for one loft.
   Fold t84 into the same round after its tube repair/cap decision.
2. t90m — write the missing packet first (only unpacketed tank), then
   profile-ize against the existing t90sm/t90a russia lofts; the canonical
   buildT90M is already the closest starting build in the whole set.
3. patton.js — m60a2 first (single easiest win: hull 92.9, needs only the
   Starship turret + stub launcher), then m48 (decide tube surgery vs
   rest-pose zeroing at the start of the round).
4. russia.js soviet mediums — t54 (t62mv1 near-clone, board 87.5), then
   type59 as its variant kit, then t44 (new low-hull loft, hardest of the
   three).
5. uk.js — vickers_mk1 (slab turret over a chieftain-adjacent hull).
6. NEW france.js — amx30 + amx30b2 together (shared loft; most divergent
   donor, all-zero curves; inspect the roof-band stylization first). Keeping
   them out of misc.js gives the family an owner for the inevitable second
   round.

Probe artifacts for family agents: `shots/triage-zero/<id>.png` (overlay
boards), `shots/triage-zero/triage-probe.json` (raw probe data),
`docs/geometry-gate/<id>.json` (refreshed work orders, 2026-08-03 run).

## Instrument-grade addendum (orchestrator, post-REG full extracts)

The full vertex-extract pass (REG batch 0a39d55) revises the mini-extract's
"9 of 13 dimensionally clean" and the probe's "no orientation flips":

- **ORIENTATION MISMATCH (t62_bergman class) — t54, amx30, amx30b2**: glacis
  faces −z while the gun faces +z (hull BACKWARDS vs gun). The render probe
  cannot see this (the print renders fine; the landmark analysis catches it).
  DO-NOT-SCORE until an orientation repair batch lands (orchestrator lane).
- **Dims warps needed**: t84 overall −11.8% / hullMask −9.7% (short-baked
  tube compounds it); m48 hullMask +11.1% / overall +7.8% / bodyH −13.3%;
  t90m bodyH +25.9% (roof furniture; warp after its packet is written).
- **Borderline, family judgment**: t80 hullMask +4.3%, t80bv overall −4.8%.
- **Confirmed clean**: t44, type59, vickers_mk1, m60a2, t80b.

Build-order impact: t80-line + t44/type59/vickers_mk1/m60a2 are buildable
now; t54/amx30-line/t84/m48/t90m wait on orchestrator oracle work.
