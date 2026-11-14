# Ajax r9 apparent open track wraps — independent diagnosis

Verdict: sampled apparent openings are dark rendered stock, not demonstrated missing stock or reversed faces. A concrete shared double-tint defect makes shoe relief nearly black. This is not whole-track physical qualification or a release pass.

## Original evidence

- [front](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/british-us-source/ajax-round9-official14/front.png) — SHA256 `62956867b578a80070d394190b97385a6c2514650b5ff48cf804b2c684322c9b`
- [rear](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/british-us-source/ajax-round9-official14/rear.png) — SHA256 `7f96b673a7e474c335ffb143ccd2304c9398d715305c2b849199db1215c6012e`
- [close-front](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/british-us-source/ajax-round9-official14/close-front.png) — SHA256 `fcea1a98de118139178672fea50ec5f4410c6dafc31e336efa3f4917f722ffc1`

The front picture background is RGB (21,27,32). Inside the supposed empty region, x790 at y475 is (24,24,23), y485 (33,32,29), y505 (33,31,29). These are rendered opaque stock, not the background. Broad low-contrast shoe faces still give an open/empty impression; that visual defect should not be dismissed merely because collision is zero.

## Actual finite FrontSide witnesses

Read-only native HIGH construction (geometryReceipt materials, same native geometry), local +X track center x1.322, horizontal end rays:

- Front y.8: shoe instance125 triangle5 at z3.256530166; carrier triangle256 at z3.231138238 with outward normal [0,-.051219728,.998687408].
- Rear y.8: shoe instance169 triangle4 at z-3.363632466; carrier triangle1176 at z-3.338158049 with outward normal [0,-.109943520,-.993937836].
- Both sides and six levels .2/.4/.6/.8/1/1.15: actual stock is hit. Diagnostic DoubleSide changes no first-hit distance in these samples. It was restored immediately; no runtime material was edited.
- Materials are opaque FrontSide, alphaTest0, full draw range, visible ancestry. `coveredTop` no longer suppresses upper shoes; shared course code explicitly retains the closed chain. Ajax profile has ordinary compact-ifv geometry, no special wrap removal.

The follow-up probe samples official front/rear direction (downward .08 slope), three lanes across each band (center +/- .23m), upper-wrap levels .65/.85/1.05, both sides/ends, HIGH/LOW. All 432 ray queries hit near stock and have zero first-hit discrepancy with the diagnostic double-sided ray. This includes duplicate rest rows: only 72 rest queries are unique; rest phase fields were not applied via sync and therefore are not phase coverage. The 216 wave queries use actual syncFromState over 60 settling frames and phases0/.055/.11m; the band position buffers demonstrably change. The wave is .09sin(1.4z) plus side offset +/- .025m. This proves those sampled visible faces remain, not full continuous overlap/nonpenetration or all terrain.

Raw `probe.json`, `moved.json`, script and logs reside beside this report. Initial probe.log retains a failed diagnostic due to a nonexistent `tank.hull` accessor; r2 uses actual band.parent (rig_hull) and completes. No production edits or browser acquisition were made.

## Concrete cause and narrow repair recommendation

`src/vehicles/tankFactoryCore.ts` creates `padMat` with white color near4849 because the authored per-instance shade is installed near4885. Ajax's compact-ifv palette is #2e302f/#373a38/#3e413e in `trackPatterns.ts`. After construction, `normalizeTankAppearance` near12986 sees role trackPad and unconditionally overwrites that base to #30312f (`appearanceAudit.ts` fixed role policy).

Three multiplies material color by instanceColor. In linear color space those intended palette entries multiplied by #30312f become effective sRGB #030303/#040404/#050505 before lighting. Thus the normalizer applies darkening twice and defeats the intended per-instance neutral-steel presentation. The readability shader floor can leave colored pixels around24–33 but cannot recover clear shoe relief; the textured carrier is also dark.

Preserve a white multiplicative material base for explicitly instance-colored native shoe batches and normalize their actual per-instance palette exactly once, or otherwise represent base color and variation without multiplying two absolute dark albedos. Keep the ordinary role policy for uncolored geometry. Do not blanket exempt all track materials, brighten the entire fleet, change camera/lighting to conceal this defect, reverse correct triangles, add DoubleSide, or relax track gates.

Smallest validation: a meaningful pure/material test for effective final shoe albedo after normalization (HIGH+LOW, near+far sharing), plus same-camera Ajax front/rear native before/after to show tread relief with geometry/instance-matrix hashes unchanged. Include one additional shared-shoe control to confirm scope; physical collision gates remain unchanged.

## Root repair — independent source review

The subsequent root repair marks only the shared native shoe material `appearanceColorSource: instance-palette`. `instanceTrackPalette` additionally requires an InstancedMesh, material role trackPad and an actual instanceColor buffer. Normalization leaves the multiplicative base white, preserves already-neutral per-instance linear values, and replaces saturated/nonfinite entries with the neutral trackPad palette. The shared near/far buffer is processed once. Ordinary uncolored gear retains the fixed role policy; armor retains its existing behavior. The new selftest checks exact effective shader colors, near/far buffer sharing, repeated normalization and a saturated-instance negative. No geometry, winding, clip tolerance or render-time loop change was found. Independent source verdict: no blocker for the current factory wiring; native image comparison remains pending at this checkpoint.

Future reuse caveat: the opted-in white-base material must not also be shared with an ordinary uncolored mesh. The current factory shares it only between colored near/far shoe batches. Appearance processing is construction-only and linear in palette size, with a Set avoiding duplicate processing; no new per-frame work is introduced. Root reports the pure test passed; this reviewer did not rerun it or acquire the queue.

## Fresh three-view check — no visible improvement established

Actually viewed all three new originals in `.qa-dev/tank-run/track-palette-proof/ajax/{front,rear,close-front}.png` against Ajax r9. All three PNGs are byte-identical, not merely visually similar. The reports have different generatedAt values (08:37:53.292Z and08:57:45.072Z), but front SHA remains62956867b578a80070d394190b97385a6c2514650b5ff48cf804b2c684322c9b; rear7f96b673a7e474c335ffb143ccd2304c9398d715305c2b849199db1215c6012e; close-frontfcea1a98de118139178672fea50ec5f4410c6dafc31e336efa3f4917f722ffc1. RGB image difference bounding boxes are null.

Therefore the code repair is NOT sufficient evidence that the original presentation concern is resolved. The double-multiply defect is real in native construction, but this three-image counterexample leaves rendering-path causality unresolved. Next smallest diagnostic is read actual browser native gearTrackPads visibility/LOD/material/instanceColor and whether its draw is submitted, then a same-instance in-memory color change to determine whether that batch contributes pixels. Do not weaken any geometry or visual gate or claim recovery from the pure test. Root owns further acquisition; this reviewer acquired no capture lease for this review.

## Browser draw-path diagnosis — missing vertex-color attribute

Two bounded FIFO observational runs used private copies of the official evaluator HTML under `.qa-dev/tank-run/independent-regional-review/ajax-track-render-r{1,2}`. Only diagnostic object/camera exposure was added; official cameras, geometry, thresholds and evaluator outputs were not changed. Both jobs completed and released their leases. Private report JSON and original diagnostic PNGs are preserved.

The browser contains correct white-base `cot:track-pad`, intended instance colors2e302f/373a38/3e413e, visible near LOD, hidden far LOD, and no unexpected ancestor suppression. The actual near pad batch submits one draw /28208 triangles (172 instances). Hiding it changes23476pixels; disabling frustum culling changes0. It is not missing, culled or merely represented by the carrier. Hiding it exposes the textured carrier below the broad dark native shoe faces.

Same-instance native white→old#30312f→white changes zero pixels. A temporary unhooked StandardMaterial clone changes23476pixels by at most14, but its white and old-dark bases also render identically. Basic-white control changes23476pixels/max52. This rules out absent draw/LOD and isolates an albedo path that is zero before lighting; the ambient hook produces the residual near-black visible stock.

Concrete source cause: `padMat.vertexColors=true` in tankFactoryCore, but the actual shoe geometry has only position/normal/uv, no color attribute. Three's WebGLPrograms.js308 derives vertexColors from the material without checking geometry. WebGLProgram.js567 enables vertex USE_COLOR; color_vertex.glsl.js14 multiplies by color, then line20 multiplies by instanceColor. WebGLBindingStates.js leaves a missing color attribute without a supplied default for MeshStandardMaterial (only ShaderMaterial defines defaultAttributeValues). The default black vertex value zeros the intended instance palette. This is independent of the previously found double tint and explains why fixing the tint alone produced identical images.

Narrow recommendation: disable vertexColors on native shoe materials when their geometry has no color attribute; instanceColor has its own shader define and remains active (WebGLProgram.js486/737). If a custom near/far pair has different color-attribute layouts, use correctly configured materials for each while retaining shared matrices/palette; do not drop real supplied native vertex colors. No position/index/winding changes or new white attribute buffers are needed for ordinary uncolored shoes. Root owns actual repair and positive native validation. A same-material toggle retaining all other StandardMaterial settings is the decisive positive follow-up; the current reports establish draw and source causality but do not claim that follow-up already passed.

## Positive rendering fix review — all three originals viewed

Root disabled the unused per-vertex color input while retaining instance colors and the repaired white multiplicative base. Actually viewed front/rear/close-front in track-palette-proof/ajax-r2. Tread faces now read as neutral gray stock with visible narrow rib/pin highlights rather than nearly featureless black panels. The front and rear upper wraps are visibly continuous; close-front distinguishes the outer shoe course around the end wheel. Scoped presentation defect is corrected in these three views. This is not source-detail parity, whole-tank 9/10 acceptance, LOW visual acceptance or a new physical-contact qualification. Root reports actual near/far cadence regression passed; independent reviewer did not rerun it.

- [front](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/track-palette-proof/ajax-r2/front.png) — 22474 pixels differ from r9; SHA256 `0d3d608770432315a835625e2f3d0fdba73bd2616b09386542aa6a177839681a`.
- [rear](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/track-palette-proof/ajax-r2/rear.png) — 13142 pixels differ from r9; SHA256 `7410a8c8fd93550c6569bfe2bf29ffeb83471432bca04336f1d2c2cccc65e587`.
- [close-front](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/track-palette-proof/ajax-r2/close-front.png) — 10281 pixels differ from r9; SHA256 `c42e3e797fc89acd4a20f67b6471eceb75e5c14aaccc0017ff4b00b3aa24c87e`.

## Separate evaluator mask defect — confirmed source path

The remaining magenta internal contour lines are not a reliable hole finding. `visual-evaluator-page.html` swapToMask replaces materials with white MeshBasicMaterial but retains `InstancedMesh.instanceColor`. Three enables USE_INSTANCING_COLOR independently of material.vertexColors, so opaque full-covered shoe pixels receive palette red46–62 rather than255, below the evaluator127.5 contour/occupied threshold. Those dark mask fragments still write depth and can hide the white carrier, making false internal mask openings. The observed shaded gray stock is real; this instrument defect does not justify deleting/moving it or changing geometry/winding/gates. Old evaluator contour/profile/area claims involving these tinted instances must retain this limitation until fixed and recaptured.

Current `procedural-fidelity.html` already handles exactly this: renderGeometryOnly temporarily detaches instanceColor on both reference and procedural roots, renders, and restores every original buffer in finally. readGeometryMask routes through it, including whole/hull/turret/gun metric masks. Thus the current fidelity gate is not affected by this exact omission; no threshold or target change is warranted. Neutral/shaded boards have separate display paths and are not the metric-mask proof.

Narrow evaluator repair: mirror the temporary detach/restore contract for its mask-only pass, with finally covering materials and original color buffers. Preserve FrontSide culling, camera,127.5 threshold and all shaded rendering. A tinted-instanced-vs-identical-uninstanced mask counterfactual plus render-state restoration test is appropriate. This reviewer made no shared change and acquired no capture queue in this positive-review round.
