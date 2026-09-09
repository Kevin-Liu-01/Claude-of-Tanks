# Abrams source X — bounded hull-deck R3

## Scope and result

Added the two source-authenticated raised access covers and their middle-cover catches on the positive-X aft hull deck. These are first-party, hull-owned equipment emitted by `profiles/abramsSourceXHullDeck.ts`, with one import and one call added to `abramsSourceXHull.ts`. No main hull stock, running gear, ERA, pivot, spec or source oracle was changed by this work.

This closes one bounded subset of the R2 roof/deck finding. It does not claim a new 9/10 visual score, complete deck authorship, or source/release qualification. Turret roof/CROWS and the separately authorized stern correction belong to other work.

## Independent source evidence

- Selected original OBJ SHA-256: `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
- Frame unchanged: `[-rawX, rawY + 0.203945, 0.357965 - rawZ]`, scale 1.
- Sparse closed-stock planes and source rays: `.qa-dev/reports/abrams-hull-deck-study-ECSHdr/source-and-before.json`.
- Complete-original-source negative witnesses: `.qa-dev/reports/abrams-hull-deck-heldouts-QVxxKV/source.json`, generated 2026-09-07T11:01:40.479Z, all 143 source owners retained during ray queries.

The first study's `native[].deck` rows are **not** usable native-air evidence: its restrictive parent-name selector collected no targets. Its intercepted seven structural hull hashes and complete gear hashes are valid; candidate surface/contact claims instead come from the focused actual high/low test, which traverses real scene meshes and separately intercepts tagged emissions. This limitation is retained explicitly rather than interpreting empty-target rays as air.

| Source stock | Measured canonical extent / role |
| --- | --- |
| Owner14, island43 | Middle cover X 1.11180–1.75850, Z −3.112665–−2.707415; bottom Y 1.697365, top 1.709765. |
| Owner14, island29 | Aft cover extending to Z −3.760665, forward edge −3.117275; same bottom/top. Includes the small inward receiving ear and shallow open catch pocket. |
| Aft pocket | Floor Y 1.704515; 5.25 mm below the surrounding cover. Rounded end approximated analytically at radius 46.3 mm from independently measured pocket planes/bounds. |
| Owner14, islands5/49 | Separate small forward hinge leaves, Y 1.709765–1.716255. They contact the middle-cover surface; no broad hinge filler. |
| Owner14, islands1/61 | Inboard receiving leaves, Y 1.707065–1.720855, overlapping the cover by 2.70 mm. |
| Owner14, islands981/1449 | Two local catch receivers, Y 1.709325–1.727925. Their 0.44 mm cover overlap and contact with the loops are tested. |
| Owner14, islands2996/2186 | Laid-down bent loops, measured X 1.36698–1.50326 and approximately 72 mm longitudinal span. Original rounded native bends preserve their open middle; local bends are an approximation, not source topology. |

The covers contact the existing narrow outer hull ledge at X 1.74. They bridge the existing hull opening; no central pedestal or broad underside filler was invented. Their actual outer surfaces and local contacts are independent of turret ownership.

The next forward cover (owner14 island37) was deliberately not included. Its measured bottom is 1.97 mm above the current deck plane, and its separate supporting bracket requires additional ownership/attachment study. It was not moved down or given an invented support to expand this bounded pass. The missing aft pocket catch and other deck fixtures likewise remain outside this subset; no complete equipment census is claimed.

## Focused proof

`src/vehicles/abramsSourceXHullDeck.selftest.mjs` passed actual high/low creation before the separately owned stern-stock edit:

- 11 distinct, nonempty physical emissions, all `addEquipment('hullDetail')`, no structural armor registration.
- 18 independently measured source top coordinates per quality, checked both against the emitted parts and the actual complete scene; source top residual below 2 µm.
- Complete-source-confirmed shallow pocket floor and horizontal air, 4.61 mm inter-cover joint air, and both 60 mm loop-middle ray segments.
- Two independent horizontal source catch-surface witnesses, bounded to 4 mm local approximation error. An initial smooth interpolation overshoot failed this bound; the native construction was corrected to straight spans with bounded rounded bends. The test tolerance was not increased.
- Actual cover/outer-ledger contact, cover/receiver overlap and loop/receiver contact.
- Original seven structural hull buffers/transforms and all running-gear attributes, indices, instance matrices and world matrices byte-identical to the pre-add capture.

The first failing catch test and later pass occurred before any source/gate change. The final source-only ray receipt independently confirms every labelled complete-source air segment; this is not an empty-target or candidate-derived oracle.

Original-family and helper-quality checks completed through the normal FIFO and are retained under `.qa-dev/reports/abrams-hull-deck-final-4Bu4q4/`: all 18 independent original high/low fingerprints, all seven new IDs in both qualities, and the new helper's strict quality gate **PASS**. The summary and individual logs are retained; no original fingerprint was refreshed from the current candidate.

## Coordination and limits

The parent subsequently authorized a separate source-measured stern correction to structural hull stock0. The deck test's historical seven-stock preservation checkpoint remains valid for the additive deck change; its final integrated stock0 contract must be reconciled with that independently authored stern proof. The other six stock buffers and all gear remain immutable for this task. No stale baseline should be silently refreshed from the same candidate being tested.

No GPU capture was started by this pass. A later combined parent-owned render is required to assess the visible improvement, and existing failing source/geometry views remain failed until independently rerun.

