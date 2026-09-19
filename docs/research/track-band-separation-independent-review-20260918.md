# Closed track-band separation proof — independent review, 2026-09-18

Read-only review of the helper, its28 negative/positive controls and strict/exact integration in `track-clip-audit.html`. No browser capture, actual tank construction, runtime geometry edit or gate modification was performed. All28 committed controls independently pass.

## Concrete P2 malformed-input failure

`closedStock` checks index.count is an integer, then accepts any truthy multiple of3. A negative count therefore skips the triangle loop. Exact reproduction: take a regular BoxGeometry mesh, call `geometry.clearGroups()` and set `geometry.index.count=-3`; test against a separate valid box. The helper returns **separated:true, trianglePairs:0, candidate components:[]**. The same omission can affect a malformed band.

Reject nonpositive counts and assert at least one triangle/component on both sides. Checking count against the actual attribute storage also helps reject inconsistent BufferAttribute metadata. Add both candidate and band negatives. This is not evidence that a current native profile has a negative count; it is a hole in the helper’s advertised malformed-input contract.

## Reasoning and integration reviewed

The positive proof checks the whole candidate against every supplied band. It uses exact world-coordinate welding; rejects open/inconsistent/duplicate/degenerate triangles and zero-volume components; and treats every edge-connected closed component separately. Requiring a vertex outside the other component’s expanded full bounds in both directions prevents either containment case from borrowing an exterior witness from another component. Rejecting any candidate triangle intersection with every expanded band-triangle AABB is stronger than ordinary triangle intersection; it can conservatively refuse a valid separation but cannot intentionally overlook a contact. Consistent reversed orientation is allowed; it does not change the occupied boundary.

The1µm expansion is a conservative ambiguity margin, not permission for overlap. Sub-micron separation remains failure. Unrepresentable margins, partial draw/group topology and unsupported instanced/skinned/batched stock remain failure. The helper does not accept an ID-specific coordinate exception, adjust the voxel grid, or change geometry.

The live page invokes this refinement only for strict + exact (`!dilate`) ordinary band mode after raw voxel overlap exists. It records rawOverlapVox and the complete separation proof, caches by candidate UUID only within the single static acquisition, and retains raw failures when unsupported or ambiguous. The shoe overlap path remains unchanged. Legacy/dilated/hand-rolled modes do not use the proof. This is a refinement of a conservative static band candidate, not a proof of moving-shoe or full-suspension contact.

The author’s four source-frozen actual Griffin receipts were read: cold/filled × HIGH/LOW, six candidate closed components,842240 tested triangle pairs each, positive separation; every20mm intrusion control fails. These model jobs were not rerun by this reviewer. They do not replace the outstanding independent final geometry/visual review.

Exact hashes, reproduction and receipt scope are in `.qa-dev/tank-run/final-approved-targets-review/band-proof-independent-review.json`. Capture scripts for70 canonical and10 Garage originals are prepared but remain unlaunched until explicit post-generation freeze.

## Frozen count-fix re-review — scoped PASS

The reviewer read and authenticated helper SHA256 `9c510141b056fc918aa2474a6cf3d8209beda81afbad3e8626ee7006b1820d71` and test SHA256 `9ce0dad6e300ffc8de9090c322800be2fe63a0035360e5dcd1211d607913f175`. The36-case suite was independently rerun successfully.

The original negative-count counterexample was independently replayed on **both** candidate and band sides, along with zero,39 (past the actual36-index backing array) and3.6-billion counts. All eight now return separated:false / invalid-index-stock. The helper requires a positive integer index count within real backing storage, a positive triangle count, and nonempty triangles/components. The original zero-work pass is resolved; its earlier evidence remains above.

No new concrete blocker was found in this bounded helper/integration review. Both containment directions, multiple closed-component isolation, contact ambiguity, malformed topology rejection and strict/exact-only use remain as described. The author reports the same four actual cold/filled HIGH/LOW cases still test842240 triangle pairs and the20mm intrusion controls still fail; those model jobs were not rerun by this reviewer. This is a conservative static separation refinement, not approval of current source shapes, moving shoes, suspension or final visual quality.

Independent replay details and hashes: `.qa-dev/tank-run/final-approved-targets-review/band-proof-resolution.json`. No production edits or captures were made. Prepared70 canonical +10 Garage acquisition remains on hold until the root’s explicit post-generation freeze.
