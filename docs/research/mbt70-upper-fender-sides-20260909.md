# MBT-70 — upper-track fender sides

## Current status

Implementation: complete; focused fit, motion and asset checks PASS.
Publication: NOT PUBLISHED. This is a scoped addition to FSP-05 in the
[fleet bodywork backlog](../tank-generation/fleet-style-performance-priority.md),
not completion of the wider fleet pass. The full release gate still fails
three source-comparison views that also failed on the untouched baseline.
No scoped publication exception has been granted.

## Owner contract and preserved inputs

Kevin B. Liu requested on 2026-09-09: “the mbt 70 needs the above tracks
fender sides as well!” Close the upper side openings with finite painted
bodywork attached to the existing shoulder/fender assembly. Keep the lower
road wheels visible, the single native track course, the complete existing
wheel layout, and the MBT-70's hydropneumatic articulation.

- Exact playable ID: `mbt70`; starting revision
  `6bba0ee6d2cba74942878e0e420c7bcc96db71c4`.
- Own isolated branch: `codex/mbt70-upper-fenders-20260909`.
- The existing model is an owner-directed M1A1 bare-hull composition; this
  request does not authorize changing that donor, turret or running gear.
- Source comparison remains the unchanged local-only `mbt70_usa.glb`;
  SHA-256 `2fe61a6bd2a44b58453fa4c8cfd07a6be07497a2fd5f0faece329652c4dd1c05`.
  No source mesh or texture enters runtime or the publication set.
- Dependency lock SHA-256:
  `53b8f49d80b0a51e9b77d46f11b68f69aeb27f73b46d1c7ad281c27cc8f3b1e0`.
  The linked installed dependencies use that same lockfile.

## Baseline — retained failure

On the unchanged starting revision, the maintained command
`node tools/procedural-fidelity.mjs --ids=mbt70 --check --board --neutral-board`
completed native rendering but exited **1**. Report timestamp:
`2026-09-09T12:15:30.559Z`.

- Aggregate: 91.36304122662092.
- Minimum view: left 89.18059676498531; required floor 90.
- Other failed views: right 89.7636068216623; rear 89.9920636700176.
- Whole masks are available; independently articulated hull/turret/gun
  component masks are unavailable on the fused comparison source.

The dated geometry ledger's earlier 90.1 result is not a fresh full-release
pass. These baseline failures must stay visible in the candidate comparison;
do not change the source, thresholds, or unrelated tank forms to erase them.

The unchanged baseline also completed
`node tools/track-clip-audit.mjs --ids=mbt70 --exact --strict`. It reports zero
band/front/rear contacts, but **eight complete-shoe sweep contacts with
`hullDetail`**. The command exits zero despite listing a shoe offender; that
exit code is not proof of a clean complete-shoe audit.

## Initial candidate review — superseded, not qualification

The initial two folded aprons add 304 triangles. Native shaded board and
24-angle turntable inspection show the continuous camouflaged upper band and
retained visible lower wheels. The source comparison on
`2026-09-09T12:22:28.137Z` still fails: aggregate 91.35688287372068; left
89.18059676498531 and right 89.7636068216623 are exactly unchanged from the
baseline. Rear improves to 90.0161547127834. Initial complete-shoe sweep
contacts also match the baseline's eight `hullDetail` contacts.

Independent review requires two corrections before final validation:

- Separate the new web's exposed outer plane from the existing end-cap plane
  to prevent coplanar flicker at their overlapping joints.
- Keep these thin fenders in persistent camouflage-bearing track-guard
  buckets, not primary `hull` armor; otherwise the generated convex collision
  cells could incorrectly bridge wheel-bay air.

These initial images/metrics are not final candidate acceptance. The final
stock needs independent clearance checks; a track-guard tag is not a waiver.

## Final implementation

- Reuse the existing finite `foldedShoulderReturn` primitive: one mirrored
  152-triangle apron per side, with a 16 mm roof lip and 14 mm outer web.
- Fit the inner lip at `|x| = 1.719 m`, outer web at `1.752 m`, bottom at
  `y = 1.125 m`, and longitudinal stations from `z = -2.62` to `2.60 m`,
  before the existing hull transform. Follow the actual varying deck height.
- Overlap the existing end caps physically, with 2 mm separation between
  their exposed side planes. Retain lower road-wheel openings.
- Use persistent painted `hullTrackGuardL/R` owners with non-primary-armor
  roles, native camouflage projection and native disposal.
- Remove only the two obsolete MBT-70 upper rail boxes. Their rear ends
  contain the old shoe-contact witness (`z = -2.6122 m` after hull seating).
- Add a finite inner riser under each rear roof tip. The full-width donor
  deck ends at `z = -2.50 m`, not its lower tail-rake datum `-2.60 m`; the
  support must bridge to the actual rear fender, not an assumed deck face.
  Each riser spans `|x| = 1.720..1.732`, `y = 1.635..1.706`, and
  `z = -2.618..-2.502 m` in hull-local coordinates, within the existing
  external outline. Its bottom and top require independent contact witnesses.
- Added 328 triangles, removed 24: **net +304 triangles** in HIGH and LOW.
- No shared donor, turret, wheel, track, suspension or spec changes.

The final `modern2.ts` SHA-256 is
`9f8dac9d968e40e8099df2a866c8196f608ab15632278cfdd847b8071f4da306`.
The first riser foot left a measured 2.9 mm gap over a beveled cap edge. Its
bottom was lowered 20 mm, leaving its roof and external outline unchanged.
The final test checks the complete foot against the actual closed rounded
cap: boundary exclusion plus odd-ray interior containment, not an assumed
convex box. Earlier failed test iterations are not acceptance evidence.

MBT-70 has no gameplay ERA clusters. Destructive-ERA qualification is **not
applicable** to this repair; an empty stripping loop is not test evidence.

## Final verification and release boundary

- Maintained `mbt70Fidelity.selftest.mjs` PASS, including the new upper-fender
  test and existing Abrams wheel-spacing tests. Four native HIGH/LOW builds,
  192 motion poses, 268 receiver samples and 24 negative controls pass.
  Minimum conservative whole-stock running-gear separation is approximately
  4.0 mm, including actual ±650 mm travel, pitch and track phases.
- Original authored emissions are authenticated against unchanged baseline
  hashes. Primary hull, native gear geometry and instance transforms remain
  identical. Camouflage materials, non-armor ownership, far LOD, exposed lower
  wheel windows, finite joints and disposal pass.
- Final `track-clip-audit --ids=mbt70 --exact --strict`: zero front/rear/sweep
  band contacts, zero complete-shoe contacts and zero blind spots.
- Final targeted icon generation and `tank-assets-check --ids=mbt70` PASS:
  nine required views, metadata, geometry and muzzle bores current. All 200
  unrelated tank manifest entries remain identical to the starting revision.
- Final native neutral comparison board and shaded side/angle renders were
  inspected. The continuous upper side band preserves the lower wheel view.
- The full `tank:anatomy:update` completed 174 rows / 56 groups and the full
  fleet technical-image generation, with **no anatomy receipt changes**.
  The subsequent `tank:anatomy:check` invocation passed anatomy, markings and
  all 174 module-hit checks (zero failures/outside modules), but failed its
  last asset phase because the MBT-70 geometry had since changed. That
  invocation is **not PASS**; final scoped regeneration/asset checks above
  recover the stale MBT-70 assets. Unrelated assets/receipts did not change.
- Type/unused checks passed after the risers were added, before the final
  buried foot's two numeric height changes; final native construction and
  maintained tests ran again after those changes.
- `tank:release:check -- --ids=mbt70 --gate` **FAIL** at source fidelity.
  Earlier phases passed fresh anatomy, centering, module alignment/hits,
  assets, track duplication, muzzle bore and circularity checks. This run
  preceded the buried-foot lowering; final focused tests, track audit,
  assets and source comparison were then rerun. Standard-check, full
  `npm test` and private build were not reached by the failed release run.

Final source report (`2026-09-09T12:54:08.765Z`): aggregate
**91.4005394877496**, but left **89.19100331394544**, right
**89.82201801800144** and rear **89.93702369587395** are below the required
per-view **90**. The same three views fail on the baseline; final values are
not exactly unchanged. No source or threshold was altered to hide failures.

Next action requires the owner's choice: keep this fix local pending broader
MBT-70 source-shape correction, or explicitly allow these documented source
failures for this scoped repair. If an exception is granted, complete the
remaining release/integration qualification against current `origin/main`
before pushing. Local preservation is not release approval.

Source binaries, comparison boards and temporary logs stay ignored. Only
scoped runtime/test changes, maintained MBT-70 assets and this report belong
to the publication set. Final local receipts are
`.qa-dev/mbt70-fidelity-with-upper-fenders.log`,
`.qa-dev/mbt70-foot-seated-track-clip.log`, `.qa-dev/mbt70-final-assets.log`,
`.qa-dev/mbt70-foot-seated-fidelity.log` and `.qa-dev/mbt70-release.log`.
