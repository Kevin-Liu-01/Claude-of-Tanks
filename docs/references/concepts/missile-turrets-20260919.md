# Missile turret concepts — comparison applicability and physical QA

The owner requested on 2026-09-19: “different than counterparts...both more missile oriented...complete redesigns to turrets”. This explicitly replaces the old turret targets for `ztz100_prototype` and `object695_x`. The original hull and running gear remain preservation obligations. These are first-party concepts, with no new real-world source or historical turret fidelity claim.

The machine-readable design is [missile-turrets-20260919.json](missile-turrets-20260919.json). It separates retained hull dimensions from the approved complete equipment envelope. Missile modes use the same eight Prototype cells or twelve Object cells; the backup weapons are 35 mm and 30 mm respectively. Both concepts intentionally have zero roof machine guns. The existing physical marker census still rejects empty, hidden, degenerate, invalid or extra weapon markers.

## Required route

`node tools/tank-standard-check.mjs --ids=ztz100_prototype,object695_x --gate` runs each actual profile selftest, requires loaded generated fills, validates HIGH and LOW complete bounds against the declared dimensions with the existing 3% tolerance, and records frozen input digests. The profile fixtures retain authenticated hull/gear preservation, actual attachment/air/weapon motion and negative controls. The standard still runs strict track band/shoe sweeps, continuity and physical equipment checks. Unknown IDs cannot obtain the concept classification. Old geometry packets, stale design hashes, a fabricated 99 score, absent LOW evidence and invalid bounds cannot satisfy the fresh concept receipt.

The targeted release retains sealed hull, all-fleet combat anatomy, centering, module alignment/hits, generated assets, track duplication, muzzle bore, circularity, complete tests and private build checks with the original flags. Only the obsolete comparison step is inapplicable. A mixed release continues source comparison for all other selected IDs. Direct fidelity output reports the two concept comparisons as N/A with `score:null`; it does not count them as passing source references or constitute physical qualification.

## Preserved history

The original Object hybrid source assembly manifest, ignored GLB, source measurement packet, historical visual receipts and source-only transform tests remain intact. Its retired source/equipment registration is recorded separately and cannot authorize the current concept. The Prototype immutable historical export/hash tuple and its changed-byte/cross-target negative tests remain intact, but it is no longer an active turret preservation target. The service `ztz100_x` keeps its 92-point source requirement unchanged. Every other 90/92/99 registration and missing-oracle failure remains unchanged.

## Validation scope

Policy, registration, historical-negative and release-plan tests have passed. This record authorizes no final visual or physical PASS. Actual profile proofs must run after authors freeze and final generated fills/anatomy are refreshed. Independent final views assess the written original designs and hull preservation, not obsolete turret comparison images. Full release completion remains a separate result.
