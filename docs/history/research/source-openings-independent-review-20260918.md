# Source opening gate — independent review, 2026-09-18

Scope: read-only review of the integrated policy, source/native ray collector, finite witness recipes and standard-check integration. No profile edits, full model reconstruction, browser capture or visual approval. The pure policy selftest independently passes, but two gate weaknesses remain.

## P1 — invisible faces become valid stock

`tools/source-opening-check.mjs:24–30` replaces a mesh’s materials with one visible FrontSide material whenever they are not all colorWrite:false. It does not preserve material.visible=false, transparent opacity0, or individual colorWrite:false groups. The resulting ray can certify an invisible ledge/web as finite supporting stock.

I extracted the exact current setup/cast function text unchanged and applied it to four small closed-box fixtures. The ordinary visible control hits as expected; **all three invisible cases also hit** at `[0,0.05000000074505806,0]`: hidden material, zero-opacity transparent material, and the invisible top group of a mixed-material box. Receipt: `.qa-dev/tank-run/approved-policy/independent-opening-visibility-repro.json`.

Preserve original per-face material eligibility during FrontSide probing, or conservatively reject mixed/invisible stock. Add actual ray negatives for the three cases; a visible material on an unused group must not validate the hidden hit. No claim is made that a current authored Warrior or AFT part uses those invalid materials. The defect concerns the promised physical guard against such regressions.

## P2 — malformed physical guard receipts can pass the pure verdict

`tools/source-openings-policy.mjs:32–39` validates exact guard keys, uniqueness, source/native owner order and passed booleans, but does not validate the actual point or compare it with the corresponding witness. The committed positive selftest deliberately has no points. A receipt with missing/null/NaN/wrong-depth stock points can therefore retain passed:true and be accepted.

The current live collector computes passed flags from its rays in the same invocation, so this is a pure-API/receipt weakness rather than a demonstrated current standard CLI false pass. Derive acceptance from the keyed witness plus finite point/mesh fields; air should have an explicitly absent hit and stock should have the actual finite first hit within the recipe tolerance. Add malformed and wrong-depth negatives. Keep exact keys and both owners.

## Checks that are sound in scope

- The registered exception is only Warrior/AFT. Other IDs still require zero holes.
- Original source bytes are authenticated on disk and rechecked after loading; classification reads the complete pinned original source. Approved source assembly elsewhere does not silently alter this equipment/opening authorization.
- The integration loads actual generated fills, retains the raw browser result and writes both classified counts and guard measurements. Errors produce continuity failure. No result silently substitutes for an absent report.
- Every actual hole cell must have the expected unique in-bounds raster indices and matching physical center, be inside its bounded region, and be air in both complete source and native rays. Missing native stock at a source-occupied raster center is rejected; the broad Warrior region is not itself an exemption.
- AFT has146 exact required keys, including slot centers, inside/outside finite edges and top/bottom bridge stock. Warrior has47 distinct source-measured keys covering asymmetric ledges, air corridor, top rail, forward receiver and hanging panels. Required guards remain mandatory even when raw hole count is zero.
- FrontSide and ancestor object visibility are retained. Shadow-only proxies are excluded. Source first-hit occluders are retained rather than filtering to a desired named part.
- HIGH geometryReceipt/LOD0 is the current collector scope. This does not establish LOW/distance or actual production material/shadow rendering.

Finite witnesses are not a continuous watertightness proof. Warrior inward rays first hit the hanging panel before the inner J-web, so those rays alone do not establish the hidden second surface; preserve separate authored-section/stock tests. The .002m Warrior tolerance is source-fitted qualification for these fixed stations, not a global leak allowance. Existing original663-cell failure remains valid historical evidence of356 missing source-stock cells.

File hashes are preserved in `.qa-dev/tank-run/approved-policy/independent-opening-review.json`. Final visual acceptance remains pending the parent’s regenerated freeze.

## Resolution re-review — both reported findings addressed

The independent reviewer read the new `source-opening-rays.mjs`, its fixture, the collector integration, the finite measurement verdict and its negative fixtures. Both focused selftests were independently rerun and pass. The three original synthetic failures were repeated against the new helper: hidden material, zero-opacity transparent material and an invisible top group now produce no hit; the ordinary visible control still hits. Every original material reference restores exactly after disposal.

P1 is resolved for the reported cases. The helper preserves the material-array/group shape and original draw range during FrontSide raycasting, then checks the actual hit face’s original material eligibility and ancestor visibility/shadow flags. It no longer promotes an invisible mixed-group face into supporting stock. The collector restores source/native materials before tank and source disposal.

P2 is resolved for the reported cases. The verdict now requires explicit null/null for air, actual finite three-coordinate points and a string mesh field for stock, the keyed source depth tolerance, and membership in the finite witness ray. Null, absent, NaN, wrong-depth and off-ray stock evidence fail despite retained passed:true flags. The test still requires exact keys, unique raster positions and both source/native owners.

I also checked every current witness recipe: all146 AFT and47 Warrior keys are distinct, origins/directions are finite triples, directions have unit length, ray lengths are finite/positive, and stock axes/values/tolerances are valid. The finite-ray projection formula is therefore sound for the registered recipes. The original failed receipts and critique above remain preserved.

**Scoped outcome: PASS for this bounded policy/ray fix review, with no new concrete blocker found.** Actual loaded AFT/Warrior CLI execution remains pending the parent’s rerun after the profile update. This is not final visual acceptance, LOW qualification, a proof of unmeasured hidden surfaces, or a release declaration. No model build, capture, profile edit or gate edit was performed by this reviewer. Exact reviewed hashes and independently replayed outcomes are in `approved-policy/independent-opening-resolution.json`.
