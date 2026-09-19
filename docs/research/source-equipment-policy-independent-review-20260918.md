# Independent source equipment policy review — 2026-09-18

Read-only review of the private proposed `source-equipment-policy.mjs` and `supplied-afv-configurations.json`. All thirteen original GLB SHA-256 values were independently recomputed and match the records. The exact roof counts are sound for these supplied configurations: zero for Kurganets, Warrior, AFT, Type96, KF41, K21, CV90MkIV and TML; one for ZTZ, Ajax, Griffin, BMP and Sabra. The owner decision record explicitly authorizes actual supplied equipment, not invented roof guns.

Kurganets’ offset receiver/barrel is real coaxial stock under the pitching owner (`kurganetsX.ts`353–357); it must remain, but is not a roof fitting. AFT authors exactly2 sides ×2 columns ×2 rows of sealed canisters, with fixed-launch gameplay metadata. Those eight canisters are not a tank muzzle or MG. The five positive roof cases contain real receiver/barrel stock: Ajax/Griffin use actual mounted fitting builders, BMP/ZTZ mark their dedicated receiver/barrel assemblies, and Sabra marks its dedicated cupola weapon. No zero-count exception is justified by merely deleting a marker.

## Concrete issue: physical census can accept non-rendered stock

**P2:** `rendersStock` tests position count and whether any material appears visible, but not whether an actual triangle renders. Four tiny Three.js fixtures independently reproduced `mg:1`, `invalidWeaponMarkers:0`, and a passing required1 verdict:

- Transparent material with opacity0.
- Geometry drawRange count0.
- Three coincident positions forming a degenerate triangle.
- Material array with an invisible material assigned to the only active group and an unused visible material slot.

Require finite nondegenerate active triangles, respecting index/draw range, actual group material and opacity, before accepting physical stock. Keep the useful existing ancestor visibility, positive instance count and nested-fitting exclusion. Also retain actual weapon receiver/barrel negative fixtures: arbitrary visible bracket stock still does not by itself establish a machine gun.

## Integration conditions

`sourceVerified` is an external boolean precondition. Calling the helper withtrue accepts an arbitrary wrong path/hash record, so integration must resolve by exact vehicle ID and verify its immutable source path/hash itself. This is not a claim that an unseen caller already violates that contract; no integrated caller was supplied. Add wrong-ID, changed-hash, absent-record and unknown-version negatives. Repaired source targets should preserve the reviewed original hash/operation chain, not silently switch the authorized original record to an unrelated file.

A roofMG0 verdict alone does not detect deletion of Kurganets coax or AFT’s real eight canisters. Their existing finite stock, pitch ownership and actual launch-axis checks must stay required in the composed release chain, with missing-stock negatives. Do not overload roofMG census to count them.

Unregistered vehicles retain the historical≥1 rule, with stricter physical-stock validation. Exact counts reject extra marked roof weapons, but this remains a marker-based census: source-specific full-scene weapon proofs and independent images are needed to establish that actual source equipment, rather than mislabeled decoration, is present.

No runtime, policy, registry, source or gate files were edited. [Hash-pinned machine-readable critique](../../.qa-dev/tank-run/approved-policy/independent-equipment-review.json).

## Revised private proposal review

The revised checker addresses the original opacity0, empty draw range, degenerate triangle and unused-visible-material cases; it also rejects collapsed transforms and empty instances. Exact ID/path/hash receipt matching and `verifyConfigurationSource` now bind the configuration to the actual on-disk original. These changes address the earlier findings; no evaluated file was edited by this critic.

**Remaining P2 malformed-stock case:** a triangle with positions `[0,0,0, Infinity,1,0, 0,1,1]` still counts MG1; an ordinary mesh with `matrixAutoUpdate=false` and `matrix.elements[0]=NaN` also counts MG1. The area can becomeInfinity and satisfy the positive-area check; the determinant rejection comparison is false forNaN. Reject nonfinite matrix elements (including translation), vertices and area before accepting stock. Both witnesses were independently reproduced with tiny Three fixtures. These are negative validation cases, not a claim that current authored profiles have malformed coordinates.

Upgraded actual13-profile census is still NOT RUN/not supplied to this review. The older private `standard-native.json` covers the Warrior/AFT diagnostic and cannot substitute for it. The newly reported Warrior missing source-stock ledges/lips remain defects, not authorized openings; an AFT source-air policy still needs exact complete witness binding. [Revised input hashes and witnesses](../../.qa-dev/tank-run/approved-policy/independent-equipment-review-r2.json).

## Updated finite policy and all26 native receipts

The finite-position/world-matrix/instance-matrix rejection now addresses the last reported malformed-stock weakness. The independent reviewer reran the pure policy selftest successfully and checked all26 unique HIGH/LOW native receipt rows in `approved-policy/equipment-native.json`: expected roof count0/1, invalid markers0, fills loaded, and every recorded original source digest recomputed against current disk bytes.

This native job uses `geometryReceipt:true` and forces LOD0; it is a physical-stock census rather than production rendered visibility or distance proof. Kurg coax and AFT eight-canister functionality remain covered by their separate focused weapon tests, not the roof-count exception. The eight no-roof-MG decisions remain exact zero requirements, not permission for phantom stock.

The updated opening policy requires complete AFT146 guard keys, two source/native owners and the actual unique raster centers. Warrior has no completed required-key set yet and fails closed; no acceptance is inferred for its newly discovered missing ledges. Private r3 equipment receipt records hashes and these limitations.
