# Hetman II and Zubr II — preserved earlier design lineage

## Owner direction

On 2026-10-01 the owner approved keeping all twelve current national modernization designs and requested two additional tanks based on the earlier T-72B3 Zubr and T-72B3M Hetman. The owner explicitly confirmed the earlier T-90SM-based versions, rather than the first unpublished redesign. These are additional original game concepts; existing IDs and the twelve current designs must remain intact.

The two new concepts retain the earlier broad welded-turret, extended-bustle, national equipment and donor-chassis identities, while receiving distinct custom primary turret shapes and armor architectures to separate them from the T-90SM. Exact real-vehicle source fidelity is not applicable. No external geometry enters the playable path.

| ID | Name | Earlier design retained | Distinction being authored |
|---|---|---|---|
| `ua_t72b3m_hetman_ii` | T-72B3M Hetman II (Concept) | T-72B3M chassis, long clipped command bustle, flank screens and field camouflage | Split angular cheek structures, welded command turret and service channels |
| `pl_t72b3_zubr_ii` | T-72B3 Zubr II (Concept) | T-72B3 chassis, broad welded turret, clipped bustle, ERAWA flank stacks and rear cage | Flat welded crown, boxy modular flank housings and distinct Polish armor layout |

Baseline earlier design: `git show 0f2b700cde04251914294e2e3e254788ef0d22ab:src/vehicles/profiles/nationalModernization.ts`. Current twelve revision-5 geometry and screenshots are separately documented in `national-modernization-redesign-20261001.md`.

## Ownership and state

Isolated worktree: `/Users/kevinliu/.codex/worktrees/cot-ifv-identity-20260925`.
Bounded geometry writers own `profiles/hetmanII.ts` / `hetmanIIDesign.ts` and `profiles/zubrII.ts` / `zubrIIDesign.ts`. The root owns registration, shared weapon integration, generated assets, validation and publication. Neither writer changes the existing twelve profiles.

Both additional concepts are built and registered. The existing twelve designs are retained; the bounded Sich skirt-joint repair below is the sole later change to those country profiles. Registration includes their own IDs, names, tier-X/next-generation classifications, lazy family entries, garage positions beside their current counterparts, roof-weapon ammunition, internal-layout metadata, markings and native donor wheel policy.

The initial physical run exposed the Hetman II skirt seam at z=0. Five recessed 180 mm permanent backers per side now close the panel joints, while the panel bodies retain 210 mm stock. The original test stations and thickness requirement were retained. All 44 new permanent Hetman solids passed closed-edge/opposite-winding and positive-volume checks; 384 native donor primitive emissions remained byte-identical in the bounded construction probe.

The initial fill run incorrectly treated exterior equipment spans as interior body space. Both concepts now use the same explicit closed primary-hull/turret boundary policy as the twelve current national concepts. Rebuilt fills have zero residual leakage: Hetman II five boxes/60 triangles; Zubr II four boxes/48 triangles. Open exterior screen and cargo spaces remain open. All native meshes remain included in physical and sealed checks.

## Completed local checks

- Full typecheck passed.
- `nationalModernization.selftest.mjs`: all fourteen registrations and HIGH/LOW variants passed, including native chassis/fenders, permanent skirt backing after ERA removal, dense shoulder joins, mantlet fit at pitch, roof seats, full turret underside sweep, module ownership and independent remote weapons.
- Strict exact HIGH/LOW moving-track checks passed for both additions; all zones have zero reported stock/shoe overlap.
- Each new RWS was sampled at 2° yaw increments and ten pitch settings against its actual authored equipment: no barrel or receiver collision.
- Native garage captures: seventeen 1280 × 900 views per new tank, including both sides, front/rear/top, main-gun motion, rotated turret, plain material and live/spent/reset ERA. The six live ERA sectors on each tank strip successfully.
- Sealed checks: all fourteen tanks have zero open views out of 33. Both new ledger rows were admitted only after the new-vehicle sealed rule passed.

Measured stored/instance-expanded triangles are Hetman II 42,386/115,434 HIGH and 38,474/85,326 LOW; Zubr II 29,282/101,154 HIGH and 25,370/71,046 LOW. Actual dimensions and concept declarations are frozen in `docs/references/concepts/national-legacy-pair-20261001.json`; these are original concepts, with no fabricated numerical source-fidelity score.

Actual local development Garage sampling recorded first reveals of 795 ms for Hetman II and 2,207 ms for Zubr II, and repeat reveals of 16.2 and 13.4 ms. The existing M1A1 control took 1,422 ms on its first reveal in the same session. Rapid switching converged correctly to Zubr II in 15.9 ms. These include development/loading/first-use costs and do not establish a production/mobile performance result; the broader cold-switch performance issue remains open.

Independent visual review inspected all 34 new-pair views plus current Hetman/Zubr comparison views and available T-90SM icons. It found no visible geometry blocker. A follow-up review of matching-camera 1280px T-90SM quarter/side captures confirms independent differences in primary turret shape, roof equipment, stowage and skirt construction, closing the initial thumbnail-only comparison limitation. Plain renders are bright; camouflaged views corroborate the major joins. This does not replace numerical physical checks. The initial integrated candidate was committed as `d6f612619`. Publication still requires the final release checks below; this record does not claim a push or deployment.


## Final continuity repair and refreshed evidence

The frozen fourteen-vehicle release attempt (`final14-release-stable.log`) passed its concept and strict HIGH track checks but failed the standard continuity scan: sixteen exposed cells on Sich and ten on Hetman II. The other twelve standard checks and all fourteen sealed checks passed. Later fleet checks did not run; that attempt is a failed release, not qualification.

Both affected skirts now have five short folded lap caps per side, seated across their existing permanent rails/backers and neighboring panel tops. The repair retains the removable panel seams below, the approved silhouette, native fenders and running gear. It adds 280 triangles per vehicle without changing a test threshold. All twenty new caps are closed, consistently wound, positive-volume stock; the exact previously failing cells hit permanent FrontSide stock. The Hetman construction probe now covers 54 new permanent solids and still preserves all 384 donor emissions byte for byte.

Fresh regeneration finished at 2026-10-02T00:52:49Z: fills for both affected IDs, full 219-vehicle anatomy update/check, two icon sets, sealed scans and strict exact LOW track checks all passed. Anatomy reports 1,916 modules, 438 track sides and 657 technical images, with zero failures/outside-envelope results and 110 existing dimension-drift warnings. Both sealed scans have zero open views. Generated manifest changes were compared structurally: only Sich and Hetman II records changed, despite reordered serialization. Seventeen fresh 1280px Garage views for each affected tank were independently reviewed; joints, spent-ERA backing, rear supports and articulated mantlets have no visible blocker.

Local evidence: `seam-regen-results.json`, `seam-regen.log`, `seam-sealed.json`, `seam-track-low/`, `pair-dimensions-final.log` and the refreshed review images in `.qa-dev/national-redesign/`. Earlier images remain under `pre-seam-caps/`. The earlier twelve-file preservation receipt remains historical; Sich's conditional skirt-cap addition is explicitly excluded from subsequent byte-identity claims.

## Validation fixture reconciliation

The concept checker formerly repeated the same complete family fixture once per selected ID. It now shares that exact fixture result only inside one checker process and only for the same complete input digest; failures remain failures. Every vehicle still receives its own HIGH/LOW dimensions and datum checks. Source/tool/concept-document inputs are frozen before runtime modules load, checked during fixtures and between IDs; a change invalidates the run, including Node's cached module state. Focused regressions cover failed results, changed inputs and between-ID changes. This reduces duplicate execution without reducing coverage or thresholds.

Two unrelated baseline fixtures required lifecycle/baseline corrections before the full release could proceed:

- **TOS-1A Tagil:** replay of the T-90MS X profile from `53864e65b` reproduces both previous strict donor hashes exactly. Commit `884384729` extracted the existing roof weapon into yaw/pitch meshes. Only six merged/RWS manifest rows differ; HIGH 103,630 and LOW 73,822 native world triangles reconcile at 10-micrometre quantization, as do normals, UV, color/night-mask attributes and materials. The new full-payload pins retain the strict check: HIGH `52a5f1542223cf26b4ce482b5738017b8de3d2b60d37253b0f5cf282b8cd99ca`, LOW `a14d2e9e283b42319c566f48976d90ad76956fa644365b3644dcb027b1322702`. The complete Tagil fixture passes, including 40 legal launcher poses, 24 real openings and 14 broken-stock/material controls. Evidence: `t90ms-pin-reconciliation.json`, `t90ms-manifest-high.json`, `t90ms-manifest-low.json`, `baseline-reconciliation.log`.
- **Supplied-source armor registration:** the old test tried to refresh donor metadata after finalized role/anatomy state, although `0e5fc79e2` intentionally made that operation immutable. The replacement invokes the actual synchronization before finalization, retaining every original permanent-plate identity/classification/strength assertion. It independently checks asymmetric sentinel XYZ fitting, ERA filtering, native frames, donor preservation and alias/missing-stock negative controls. A separate phase checks that every finalized supplied recipient remains unchanged even when donors change. The original HIGH/LOW stock, stale ERA-event and reset assertions remain. The complete fixture passes. Evidence: `baseline-fixtures-final.log`.

### Open pre-existing shared-corner fitting defect

A broader diagnostic discovered a real issue outside those original assertions: some source armor plates share the same vertex-array objects. `structuredClone` preserves that internal aliasing, while `scaleArmorPlates` mutates every vertex occurrence, applying the scale repeatedly to shared corners. For example, pre-finalization Type 96B donor fitting produced x = 0.16648575476406133 where independently scaling that corner once gives 0.17878832432432432. The scoped fixture's fresh asymmetric sentinel has independent corners and passes; it does **not** certify every inherited plate coordinate. The original identity/strength regression never covered those coordinates.

Reproduce by loading the eager factory's dependency imports without its finalization body, recording a donor armor clone and the recipient/donor width, height and hull-length ratios, calling `synchronizeSuppliedSourceCombatMetadata()`, then comparing each permanent plate's vertices with `plate.verts.map(v => v.map((n, axis) => n * ratios[axis]))` from the untouched donor. Preserve each occurrence as a fresh array in the oracle. The local `supplied-armor-shared-corners-repro.mjs` and its log retain this failing diagnostic. Finalized in-game impact is not established because later native anatomy calibration can replace inherited plates. No fleet-wide fitting algorithm is changed in this tank-addition batch; this remains an unresolved finding, not a dismissed failure.

## Publication state

The frozen `3c1e57f195f4e04ef07453000860a9f41827929b` release completed at 2026-10-02T01:56:19Z. Type checking and public build passed. All fourteen concept/physical, standard, sealed, anatomy, asset, module, muzzle and private-build steps passed, but the integrated release failed in `npm test`: 79 of 1,231 registered test files failed. Its source digest remained stable (`18b3159d21f86bd355777ee2403cb452497219e595940aa09a7a7f4886760775`). This is a failed release, not qualification.

All 79 failed test files were separately run against clean `origin/main` commit `24c5c5b039dded1efa1fc8cf0aae5e554e7b83a4`. Seventy-seven also fail there; that identifies pre-existing failing test files but does not prove that every underlying cause is identical. The two candidate-only failures were the tactical-role fleet count (217 versus the new 219) and the stale generated manual catalog. Both are corrected and pass their focused checks. The ammunition-flow fixture, already failing on main, now explicitly accounts for all fourteen national multi-channel loadouts while retaining its historic assertions; all 215 multi-channel loadouts, 1,254 depleted transitions, 37 guided launches and 640 finite final-round checks pass. The manual was regenerated using its maintained generator, including the two additions and current auxiliary inventories.

Receipts: `.qa-dev/national-redesign/final-publication-results.json`, `main-baseline-comparison.json`, `tactical-count-fixed.log`, `ammunition-count-fixed.log`, and `manual-fixed.log`. Baseline runs are under `.qa-dev/national-main-baseline/`. Cold Garage reveal performance and the pre-finalization shared-corner fitting finding remain explicitly open. The owner's subsequent mantlet request starts a new geometry revision; its regeneration, checks and publication state are recorded separately. No result here claims that the final candidate was pushed or deployed.
