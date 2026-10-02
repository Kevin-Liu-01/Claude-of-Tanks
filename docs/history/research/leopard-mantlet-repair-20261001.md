# Leopard gun openings — owner-directed repair

Worktree: cot-ifv-identity-20260925, branch codex/national-modernization-20261001. Existing national-modernization changes are retained separately. No publication requested for this repair.

## Scope

Displayed Leopard 2A7V (`leo2a7v_x`), Leopard 2A6M (`leo2a6m_x`), Leopard 2A5M (`leo2a4m_x`). The owner requests distinct mantlets/gun assemblies and actual cutouts in their messy turret fronts, using Leopard 2A5/2A6 as the design guide. This is a scoped mechanical redesign, not a claim to newly reproduce a particular real variant.

## Construction

- Keep hull, tracks, bore radius, trunnion and muzzle locations.
- Split the forward primary shell and nose into closed left/right armor stock around an 800 mm open gun channel. Preserve the independent left EMES sight opening.
- Replace the buried 410 mm box with a faceted pitching mantlet, transverse trunnion and receiving collar. Fixed bearings connect it to the cheek reveals. The tube retains independent recoil.
- Reseat the 2A7V rack's inner foot onto remaining stock; prevent generic roof decorations from straddling the full new aperture.
- Regenerate fills against primary body shells so fittings do not bound artificial interior stock across outside air.
- Scope the source-shape self-test's nose witness to remaining cheek tips, explicitly retaining the original source numbers. The complete reference comparison remains independent; a user-directed cutout does not silently waive it.

## Verification — final

- Opening/contact regression: PASS, 810 air witnesses and 54 yaw/pitch poses across HIGH/LOW with regenerated fills loaded.
- Existing Leopard source-datum self-test: PASS after explicitly changing central nose/roof witnesses to the owner-requested aperture. Original independent source constants and outboard roof probes retained.
- Baseline geometry attribute hashes: identical hull, gun tube, road-wheel tires and track pads for all three edited IDs at HIGH/LOW. Original Leopard 2A5 hull, turret, mantlet, gun and running gear preserved.
- Full anatomy update/check: PASS, 217 current receipts; fleet module-hit probe has zero failures (108 existing dimension warnings retained).
- Centering update, icons/technical images, calibrated module alignment, muzzle-bore checks, barrel circularity, type checking and public production build: PASS.
- Sealed-surface ledger gate: PASS for all three IDs, zero qualifying opening views out of 33 per tank. This is not a claim of zero raster pixels or zero volumetric residual: fill residuals are A7V 1.5 L, A6M 0.3 L, A5M 2.3 L.
- Independent final visual review: all nine garage captures reviewed, no remaining concrete mantlet/attachment issue in the supplied views. The initial floating roof hatch and unsupported rack foot were corrected and recaptured. This review does not replace numerical clearance or reference comparisons.
- Targeted release: BLOCKED, exit 1. Both standard geometry and fidelity stages lack the registered `leo2a7v_x_source.glb`, `leo2a6m_x_source.glb`, and `leo2a4m_x_source.glb` comparison files. Old fidelity scores are not reused. Later integrated release stages were not reached; individual checks above ran separately.
- Broad npm test not rerun: prior batch documented the unrelated runaway `awSecondWaveGeometry` test. Cold/warm/rapid-switch performance and remaining source-dependent qualification are not newly certified by this repair.

Receipts: `.qa-dev/leopard-mantlets/qualification.json`, `existing-leopard-final.log`, `preservation.log`, `opening-test.log`, and `release.log`. Initial failed attempts remain in their original logs. Actual 1280×900 garage images and nine-view gallery: `.qa-dev/leopard-mantlets/review.html`.

No commit, push or deployment performed for this repair. Earlier national-modernization work is preserved in this worktree.

## Main integration — 2026-10-01

After the local-only status and missing-reference blockers were explicitly reported, the owner instructed “get it on my main.” This authorizes publishing both batches with those limitations retained. The batch was committed and rebased onto origin/main at 10109cdbb; only fleet-count documentation needed conflict resolution. Main’s 33 maps, seven modes, lighting, multiplayer, and UI changes are preserved. Full post-rebase tests and production build are recorded separately; this authorization does not convert unavailable comparison results into passes.

Post-rebase verification: type checking and public build passed. Full npm test was attempted with a bounded heap, then stopped after the first 57 registered tests to investigate failures (not a full-suite pass). The 217-vehicle demand-load sweep and wheel/track quality passed. Two new-fleet expectation failures (205 versus 217 roles, missing 12 concept IDs) were corrected and rerun successfully. The TOS donor hash and supplied-source armor-registration failures reproduce identically on clean main 10109cdbb in an isolated checkout: same T-90MS hash and same AFT-10 permanent plate count 10 versus 15. They remain upstream failures, not waived passes.

Post-rebase focused tests pass: tactical roles, exact concept authorization, national modernization, existing Leopard geometry, 810 opening rays / 54 poses, manual reference, product counts, roster policy and AFV balance. Regenerated main’s newly introduced auxiliary inventory and manual catalog for all 217 vehicles; all 12 concepts have one 12.7 mm remote station and driving lights. Logs: `.qa-dev/leopard-mantlets/integration-results.json`, `post-rebase-tests.log`, `integrated-main-donor.log`, `integrated-main-armor.log`, and `publish-final-build.log`.
