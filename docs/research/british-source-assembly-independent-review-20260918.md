# Warrior / Griffin / Kurg source assemblies — independent review, 2026-09-18

Verdict: accept these three private derived sources as documented static assembled comparison targets. All24 before/after originals were actually viewed, including each close and oblique view. This does not qualify procedural geometry, alter previous raw-source failures, or approve deleting unrelated source components. The reviewer did not author these source assemblies.

## Independent preservation checks

All72 manifest-referenced image/source/output/proof/tool hashes recompute correctly. Each of the12 paired views retains identical camera position, target and orthographic scale. Neutral clay renders compare shape rather than original texture. All original source bytes remain separately pinned.

An independent GLB parser compared the expanded actual accessors without invoking the author’s writer or validation routine:

| Model | Exact unchanged triangles | Translated triangles | Removed triangles | Result |
|---|---:|---:|---:|---|
| fv510_milan_x | 73,372 | 0 | 958 | PASS |
| griffin50_x | 144,538 | 902 | 0 | PASS |
| kurganets25_x | 252,443 | 3,118 | 0 | PASS |

For Griffin and Kurg, every moved position equals Float32(original position + documented translation); every other position and all retained normals/UV/other attributes are byte-exact. For Warrior, every retained expanded triangle is an exact ordered subsequence of the original across all attributes. Every removed triangle is confined to the specifically selected original component bounds. The entire original binary chunk remains byte-exact as a prefix; the derived GLBs append revised selected accessors. Node transforms and unrelated JSON are unchanged. The author’s separate selector digest/reload/replay proofs were read and their hashes checked; their jobs were not rerun.

## Source-only assembly evidence

**Griffin:** ten components, including two existing viewport surfaces, translate by `[-0.5964815621274728,1.305143093732878,-2.3034231065654867]`. The two measured receiver/moving hinge midpoint differences independently recompute that translation. Maximum midpoint residual is0.157mm. Source knuckles38.033/38.088mm fit receiver axial gaps38.167/38.137mm. All four paired views show the original door plate covering the existing aperture, with both hinge knuckles in their original receiver gaps, the circular feature and upper viewport preserved. Body, boxes, tracks and weapons remain unchanged. This is a static seating result; full hinge-motion clearance is not proven.

**Kurg:** Object_39 components0–97 translate by `[-0.4918696077250789,1.4916125,-3.6010853218781516]`; mounted components98+ remain untouched. Both source hinge gaps are40mm and moving knuckle spans38.40/38.45mm. All four paired views show the complete door, circular port, latch, hinges and step in the existing rear receiving frame, with rear vent banks and surrounding stock retained. The door-edge dark seam remains visible; no warping or scale adjustment was used to hide it.

Kurg limitation: moved step terminal tabs Object_39:11/12 nearly coincide with fixed Object_23:38/39. The exact-duplicate test failed and both source parts remain. This supports the step’s assembly location, but does not prove those tabs are distinct nonintersecting solids. Preserve this disclosed source ambiguity; do not delete either pair without new source evidence. It does not invalidate the source-only door placement.

**Warrior:** the mounted door and its circular hardware already exist behind the rear cage. Ten origin-local components have rigid oriented-triangle correspondences to their retained mounted counterparts; four additional Object_36 components share the same part topology and XY coordinates but differ in cover-extension depth. The proposed target removes958 triangles across these14 redundant assembly components, retaining the complete mounted door/cage. All four before/after pairs show the lower loose assembly gone while the mounted door, cage, circular cover, hinges and surrounding vehicle stock remain. The cage obscures much of the cover in shaded images, so the scalar correspondence is necessary evidence.

I independently recomputed the five Object_36 vertex bijections and oriented topology from the recorded source point maps. XY residual is at most0.067µm; depth stations differ by0 or11.4–11.5mm. The four variants are **not exact rigid duplicates**. Choosing the already mounted version is supported as a static closed/assembled state by the retained counterpart and the exactly duplicated surrounding door assembly. No original animation provenance survives the OBJ-derived export; do not claim which authoring operation produced that difference. This review accepts the static assembled target without erasing the original variant data.

## Actually viewed originals

| Model | View | Before | After |
|---|---|---|---|
| griffin50_x | rear | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/before/rear.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/after/rear.png) |
| griffin50_x | rear-quarter | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/before/rear-quarter.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/after/rear-quarter.png) |
| griffin50_x | door-close | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/before/door-close.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/after/door-close.png) |
| griffin50_x | door-oblique | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/before/door-oblique.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/griffin50_x/after/door-oblique.png) |
| kurganets25_x | rear | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/before/rear.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/after/rear.png) |
| kurganets25_x | rear-quarter | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/before/rear-quarter.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/after/rear-quarter.png) |
| kurganets25_x | door-close | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/before/door-close.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/after/door-close.png) |
| kurganets25_x | door-oblique | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/before/door-oblique.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/kurganets25_x/after/door-oblique.png) |
| fv510_milan_x | rear | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/before/rear.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/after/rear.png) |
| fv510_milan_x | rear-quarter | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/before/rear-quarter.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/after/rear-quarter.png) |
| fv510_milan_x | door-close | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/before/door-close.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/after/door-close.png) |
| fv510_milan_x | door-oblique | [Original](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/before/door-oblique.png) | [Assembled](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/source-assembly-20260918/review/fv510_milan_x/after/door-oblique.png) |

## Limits and next step

Retain originals, operation selectors/digests, source-only receiver evidence, the failed Kurg duplicate check and the Warrior variant classification. Adopt derived paths/hashes explicitly, then run the existing native comparison gates unchanged. These target approvals do not excuse Warrior’s independently discovered missing native ledges or any native/source shape error. No runtime, source registry, profile, gate, source writer or capture tool was edited by this reviewer. No new acquisition was launched. Further final native captures remain on hold until the parent announces the final regenerated freeze.

Independent receipt: `.qa-dev/tank-run/source-assembly-20260918/independent-checks.json`.
