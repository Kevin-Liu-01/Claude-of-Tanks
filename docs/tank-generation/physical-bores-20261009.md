# Fleet physical cannon bores — 2026-10-09

Status: deployed as version `v1.0.0+ge502c7670` (deployment 206). Owner authorized publication with incomplete checks on 2026-10-09. Generated assets and full release qualification remain follow-up work.

## Construction

Legacy main-cannon masks are replaced by apertures subtracted from the native terminal stock. The cutter preserves the outside outline, interpolates existing vertex attributes, and retriangulates planar faces around the opening rather than clipping every radial fan independently. One 12-sided inward wall and recessed backstop adds 34 interior triangles per converted mouth. This is an interior cost, not a claim of net model savings: native face changes and removed masks must also be counted.

Verified authored bores retain their geometry. Fixed missile canisters remain sealed. Muzzle markers and recoil ownership are unchanged. The actual assembled stock, including generated interior fills, is tested for retained rim, inward wall at several depths, and recessed floor. Negative controls cover a blocking front cap, missing wall, missing rim, and a duplicate floor at the exact backstop plane.

The Leopard 2A5 family terminal stock needed its bevel removed at the aperture edge. The Leclerc X terminal assembly had redundant nested bore stock; its native outer shape is retained while the common cutter produces the opening. Four historical photo draft profiles needed correctly inward-wound existing bore walls.

## Evidence so far

- Full assembled geometry audit: **440/440 pass**, all 220 playable IDs at high and low detail.
- Across both qualities: 388 converted mouths, 50 preserved authored mouths; three missile-only IDs per quality have no cannon opening.
- Focused historical/source regressions: all nine retests pass.
- Abrams source muzzle: all 30 vehicle/quality/pose combinations pass, retaining independent collar and MRS witnesses.
- Representative rendered close-ups: five of five pass (M1A2, Leopard 2A5, Leclerc X, BMPT T-90, KF41).
- Typecheck and unused-code check pass. Changed geometry modules: 64 functions, zero complexity violations, zero explicit `any`/`unknown`.

Local raw evidence is under `.qa-dev/physical-bores/`: `final-fleet.json`, `retest.json`, `visual/report.json`, `abrams-regression.log`, `typecheck-final.log`, and `metrics-final.log`.

## Outstanding

Exact before/after fleet triangle census, rendered all-fleet and oblique checks, generated anatomy/assets/ledger refresh, complete test suite, release gate, and deployment verification. Earlier generated receipts predate this conversion and cannot certify it. Prior unrelated contact repairs remain in this batch and must be distinguished from the bore conversion when reporting aggregate savings. No failed reference comparison is reclassified by these bore checks.

## Publication scope

The owner renewed “go ahead” after disclosure that 440 bore geometry cases pass but the complete suite, image refresh, triangle comparison and release checks are incomplete. This publication contains the source repairs and their tests. Unfinished generated refresh outputs stay in the authoring worktree for a separately validated follow-up. No all-tests-pass or net triangle-saving claim is made.
