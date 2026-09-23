# Shared regional launch diff — independent read-only review, 2026-09-18

Scope: current worktree changes in `materials.ts`, `appearanceAudit.ts`, `tankFactoryCore.ts`, physical muzzle helper/test and seat policy, visual/fidelity fill preload, and scoped fill generator/selection helper/test. No runtime edits or new browser jobs were performed for this review. This is separate from the original GPU wheel-shader matrix and the 70-image loaded-fill review.

## P2: invisible transparent stock can satisfy the physical bore verifier

`src/vehicles/physicalMuzzleBore.ts` collects meshes when every material has `visible` and `colorWrite` enabled. It does not reject a material with `transparent:true, opacity:0`. Three raycasting still intersects those triangles and the vertex scan still uses them, so invisible rim, backstop and wall geometry can satisfy the exact same physical proof as rendered stock. The helper's stated contract is proof of actual rendered stock. This is a code-established false-positive path; no new synthetic run was claimed here. Current reviewed native profile buckets appear opaque, so this finding does not establish a current fleet rendering defect.

Reject fully transparent stock before both extent scans and rays, retaining the current conservative rejection of mixed material groups. Add a negative using the existing complete positive fixture with zero-opacity transparent material; retain the normal opaque positive and existing missing-stock/winding negatives. Do not broaden acceptance or change physical tolerances.

## Other reviewed paths

- Wheel-only shader define is added after shadow setup using object spread, preserving pre-existing CSM defines. Fixed rubber/steel clones remove only the wheel readability define. Ordinary armor/gear shader branch remains textually retained; the wheel albedo floor is unchanged. The earlier independent GPU matrix verifies exact non-wheel pixel equality and restored-material equality for its fixed gallery controls. Actual night/CSM GPU behavior remains outside that gallery proof.
- New road-wheel layers receive their actual rest translation before a raycaster can cache an identity-position bound. They remain in the existing `made` list and retain canonical `suspensionSource`, so later wheel motion still owns their placement. This adds construction work only. No unrelated source axle or gear default is changed by this patch.
- Fixed launch-canister handling is explicitly gated by the spec flag and requires authored axes. It creates firing anchors without inventing cannon mouth furniture and cancels tube recoil for that flag. Unflagged legacy cannon furniture/recoil follows the existing path.
- The physical bore path is opt-in, rejects multi-axis declarations, verifies authored stock before installing finish geometry, then verifies the full gun including generated fills. Radius, recess, projection and wall stock are finite sampled evidence rather than a full topology/manifold theorem. Its two verification traversals add construction-only CPU work; this review makes no new timing claim.
- Visual and fidelity tools await fill-group preload before constructing the procedural model and report record presence. The evaluator clears/restores instance color for masks in a `finally` block; its existing GPU negative verifies a dark instanced object cannot disappear below the silhouette threshold. Source-world cameras remain derived from the reference and shared by both panels.
- Scoped fill generation validates selected IDs, updates only those records, preserves existing sibling records and sibling absence, and writes the loader from registered modules that exist on disk. Generated records retain the current v/o/t/g/hull/turret/gun schema. All-fleet deletion remains confined to explicit `--all`; `--stats` writes nothing. The helper regression covers unrequested sibling identity, absent siblings, invalid IDs and cross-group updates. No additional provenance or default-behavior regression was established in this bounded review.

This report does not certify complete release, final revised profiles, raw-source target exceptions or performance budgets. Parent owns the identified verifier correction and required integration checks.

## P2 follow-up — resolved in source review

The updated verifier excludes transparent materials with nonfinite opacity or opacity≤.001 before extent scans and ray collection. New focused negatives replace the real backstop with zero-opacity material and introduce a mixed visible/invisible rim material array; both require rejection. The normal opaque fixture and prior cap/missing-wall/winding checks remain. This directly addresses the reported false-positive path without changing geometry tolerances or the legacy bore branch. Parent reports the focused tests pass; this follow-up independently read the actual implementation and test, and did not rerun the suite.

## Correction verified by root

The verifier now excludes fully transparent stock before extent scans or rays.
The complete opaque positive fixture still passes; new zero-opacity backstop
and mixed-material rim negatives fail as intended. Existing capped, missing,
inverted-wall and transformed-frame negatives remain green. This correction
does not change runtime geometry or relax physical tolerances.
