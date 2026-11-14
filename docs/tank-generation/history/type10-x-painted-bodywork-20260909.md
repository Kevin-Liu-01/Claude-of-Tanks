# Type 10 X fixed-bodywork camouflage — 2026-09-09

Current status (2026-09-10): the three-tank composed release finished PASS,
including one uninterrupted 923-entry `npm test` invocation and private build.
Typecheck, scoped Doctor (zero findings), public build and final rebased-main
integration also passed. Type 10 X's fourteen fixed panels use camouflage;
flexible flaps and equipment retain their own materials. Scope does not claim
a running-gear redesign or measured switching-speed improvement.

The auxiliary source-freeze wrapper remains FAIL because a standalone crop
test loader changed before its first execution; it is not represented as an
immutable-snapshot pass. The exact change, consumed hash, independent review,
official terminal results and final-main integration are recorded in
[the three-tank release receipt](t90-x-shared-shtora-20260910.md#completed-three-tank-release--2026-09-10).
Earlier failures below are preserved diagnostic history, not current status.

Historical status: focused source, physical differential, four-view native review,
anatomy, assets and measured geometry checks passed. The latest complete
release attempt is terminal: core stopped in the unrelated
`src/world/villageWear.selftest.mjs:37` parent-config fingerprint assertion
(actual `2121d16793b38c105f84173ee362ed6c0833b3138bb92022a146d730a4e4048d`,
expected `1e2782ff93df30c67766053893fbef56fdd676912b43a0e386aad102eaa820f1`).
The pre suite and preceding core checks passed; post, public build and final
attribution stages were not reached. This is not a full-suite release
certificate. No live Type 10 retry remains, and the failure is not waived.

## Scope and cause

Starting revision: `7351f0b4ad92c97be03e7be0bb7a700a3f332484`.
Only `type10_x` changes. The original `type10` is an unchanged control.

Ten fixed folded skirt leaves, two long upper fascia strips, and two aft
fascia strips were assigned to `hullDetail`, which uses plain fitting paint.
They were not rubber, so a rubber-material cleanup could not fix their
uncamouflaged appearance. These fourteen pieces now use the established
`hullPaintedDetail` bucket and exact `markFixedPaintedPanel` labels. They use
the hull camouflage map and its spatial UV convention while retaining the
detail LOD and non-armor collision role.

No panel dimensions, triangulation, bend functions, placement, suspension,
armor billing, or hull/turret/gun shapes change. Genuine flexible rear flaps,
tires, hardware, optics, and other accessories retain their existing roles.
This is a finish correction, not a track/roller redesign or a measured
switching-performance improvement.

## Evidence already completed

- `registeredGuardPaint.selftest.mjs`: PASS. Exactly fourteen Type 10 X
  emissions at both quality levels with factory and winter camouflage;
  real material/map/UV checks and authenticated pre-change source comparison.
  The complete four-model run checked 5,808 emissions and 336 posed,
  spent-ERA receiving rays. No broad material-name exclusion was introduced.
- `profiles/type10XSkirts.selftest.mjs`: PASS. Native high/low folded faces,
  true extrema, source air, U straps, and fascia engagement remain intact.
- `profiles/type10X.selftest.mjs`: PASS. High/low envelope, gear, source folds,
  roof facets/coax air, antenna mounts, and ownership remain intact.
- `sourceXOtherAuxArmor.selftest.mjs`: PASS across all existing cases. Type
  10 X retained 2,320 independent native held-out rays per quality level,
  with maximum transverse error 0.0011416163 m. Existing source-air,
  single-billing, seam, and armor expectations were not lowered.
- Native before/after angle, side, top, and front images were generated and
  inspected. The broad side sheets now visibly carry camouflage. Original
  Type 10 images in all four views are byte-identical. This four-view
  finish review is not a new fourteen-view source-fidelity score.
- `git diff --check`: PASS. Post-change React Doctor scoped scan: nine files,
  no findings. Its full-repository scan found 674 broader findings; this
  checkpoint does not claim the whole repository is lint-clean.

The historical paint inverse authenticates full source SHA-256 values from
the pinned starting revision before reversing only these declared finish
assignments. It does not refresh the previous physical-mesh expected hash.
Native physical/air/armor checks still inspect the actual painted candidate.

## Historical pending publication checks

The original normal-FIFO driver owned, in order: `tank:anatomy:update`, the selected
Type 10 X asset refresh, `tank:anatomy:check`, `typecheck`, and
`tank:release:check -- --ids=type10_x --gate`. No parallel duplicate of this
driver was launched. Final outcomes and any release failure must be recorded
before this is described as qualified for publication. That original driver
and the subsequent failed attempts are terminal; none remains live.

Source models and temporary QA remain excluded. The ignored local Type 10 X
comparison oracle was verified as SHA-256
`fb6c2aa30119ac45b49fdfb7393a13760109ce4c9cc3f6244e579eb4944879fe`;
it is not copied into a playable loading path or committed.

## Evidence locations

Owning worktree:
`/Users/kevinliu/.codex/worktrees/cot-fleet-painted-bodywork-20260909`.
Native images and manifests: `.qa-dev/type10-before/` and
`.qa-dev/type10-after/` in that worktree. This source checkpoint remains
separate from the frozen Abrams qualification tree and its recovery receipts.

## First composed result and publication preparation

The original driver completed fleet anatomy update/check, marking freshness,
module-hit and technical-card checks, selected asset regeneration and typecheck.
All targeted pre-test release phases passed: live asset hashes, centering,
module alignment, duplicate tracks, muzzle bore/circularity, measured source
comparison (95.3 against 92) and standard geometry (minimum 93.6 against 92).
The source comparison was available and measured; fused component masks were
not substituted for a missing whole-vehicle comparison. The fleet module-hit
run retained 83 dimension-drift warnings; the targeted Type 10 X run had none.

The full suite then failed in `src/sim/ammunitionFlow.selftest.mjs:152`:
556 versus expected 535 outside the second-wave X batch. The private build
therefore did not run. The same failure was reproduced on unchanged published
vehicle source at `034bb8344`; all seven published Abrams X variants each add
three channels. The correction explicitly preserves the old 535-channel
population, separately checks 69 second-wave and 21 Abrams channels, and
checks the complete 625-channel total. It does not change ammunition runtime
or relax a geometry threshold. Its focused run passes 209 multi-channel
loadouts, 1,242 depleted-slot transitions, 22 guided launches and 625 final-round
launches; the separate seven-Abrams registry test also passes.

Generated publication candidates remain limited to Type 10 X's manifest entry,
seven changed image files, and the generator's ledger timestamp. These assets
and the failed/passing phase evidence are preserved locally while the final
composed release remains pending. Source models and temporary QA are excluded.

## Second release result — 2026-09-09

All geometry, source, presentation, asset and anatomy phases passed again.
The full test suite stopped at the second-wave marking census: 158 current
non-second-wave records versus the immutable 151-record pre-Abrams population.
The repair explicitly separates the seven later Abrams X IDs and requires
each to remain present. The exact original 151-record SHA-256 is unchanged;
no anchor values or runtime paint placements were edited. The targeted Type
10 X HIGH/LOW footprint, support, ERA depletion/reset and articulation check
passes, including the original 151-record hash. Full release remains pending;
this focused result does not turn the failed full suite into a pass.

## Third release and integration-count correction — 2026-09-09

The third composed release again passed the source and standard geometry
phases, then failed at `src/game/loadingIntent.selftest.mjs:161`. Published
world commit `16269dc30` had added `atmosphere: 'covered-battle'` to the
deferred network-world call. The assertion still expected the older exact
argument object. Its correction requires both the deferred precompile flag
and the explicit covered-battle atmosphere; focused loading-intent tests pass.
No loading runtime is changed by that correction.

The subsequent core-only diagnostic (session 13156) reached a different
failure: `src/productStats.selftest.mjs:36`. Four public totals omitted the
seven already-published Abrams X variants. The dependency-free product values
now match the actual registry: 171 production-visible, 208 development,
210 saved records and 181 battle playables. `vehicle-roster-report.mjs --write`
regenerated the roster from the canonical registry, adding the seven missing
rows; current public fact text is synchronized. No vehicle registration or
geometry changed, and the test continues to compare all fields exactly.

The five-step focused run (session 96172) passed roster generation, product
stats, roster freshness, loading intent and SEO metadata. The earlier failing
core run did not reach Doctor or a private build. Full post-integration
qualification remains outstanding; no failed result is reclassified as a pass.
