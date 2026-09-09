# Abrams X — rear shoulder and turret receiver repair

Status: focused geometric checks passed; not a release or visual-fidelity
acceptance. This work changes the seven conventional Abrams X builds only.
The original Abrams and the AbramsX/M1A3 concepts are not edited.

## User-selected rear shoulder

The SEPv2 X markup identified the left aft hull surface between X−1.724 and
−1.03203, Y1.332 and1.69737, Z−3.47277 and−1.112. The prior U-section joined
the outer roof to the lower inner shoulder datum, producing the visible
diagonal trough. Both aft shoulders now carry the existing roof datum across
to the inner wall. The middle engine well and air beneath the sponsons remain
open; this is not a hull-wide filler block.

The independent full143-owner OBJ study remains in
`.qa-dev/reports/abrams-user-surface-r5-CN8qH3/source.json`, together with the
pre-edit Hull and Equipment files. Source SHA256:
`85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
The unchanged metre frame is `[-rawX, rawY+.203945, .357965-rawZ]`.
Three held-out left cover intersections are Y1.7008664,1.7006656,1.7003516
at Z−3.3,−2.988,−2.5. The retained native roof Y1.697365 is within5mm;
the independently raised right service covers remain separate stock.

## User-selected turret fitting

The selected 105×55mm face belongs to `AratBracket-1_4_0.34`. All42 matching
fore/aft receiver tabs on each urban TUSK/SEPv2 build now extend to the actual
sloped turret armor, preserving their original visible tips and cassette
positions. The inner feet have a3mm concealed lap and25mm finite height.
The lap is an explicit assembly accommodation, not a source protection value.
The receivers are permanent turret-owned equipment and keep the air between
tabs; removing ERA cannot remove their supporting structure.

The longer roots clipped the old urban unit-marking seats. A full-scene
clearance census found room slightly aft and above the prior seats. Only the
two urban hints change from `(right,.35,.80)` to `(right,.32,.81)`.
Both actual markings remain240mm squares on permanent armor. The151 previous
vehicle policies and all immutable pre-edit scene hashes remain authenticated;
the test-only counterfactual reconstructs exact replaced stock, not a new
candidate-derived expected hash.

## Focused evidence

- `abramsSourceXUserSurfaces.selftest.mjs`:14 high/low builds,42 turret poses,
  840 finite bracket-contact witnesses and28 under-shoulder air checks pass.
- `abramsSourceXMarkings.selftest.mjs --solver-only`:14 builds,84 intact/spent
  poses,1512 full-quad support rays and1512 independent visibility rays pass.
  Maximum support error4.49e−8m. Generated seats still require regeneration.
- CROWS and stern immutable-preservation checks pass after these changes.

The newest request also asks for filled shoulder/skirt coverage with no
exposed wheel. Whether this means upper shoulder/skirt gaps or the complete
road-wheel faces is awaiting clarification; no claim of complete lower-wheel
coverage is made here. Fresh full-fleet anatomy, selected assets, source
comparisons and release checks are required after the remaining R5 geometry
is frozen. The R4 track/dimension/visual failures remain historical failures.

## Latest owner priority and resumable checkpoint

On 2026-09-07 the owner requested an urgent fleet-wide performance/style
backlog: slower switching, excessive geometry, shared primitives, return
rollers, thicker tracks, closed chassis/shoulder/skirt stock, camouflage-aware
bodywork and separately colored equipment/fabric. Detail expansion is paused
for that priority; neither this focused repair nor the new baseline closes it.

The destination integration worktree is
`/Users/kevinliu/.codex/worktrees/cot-abrams-source-x-integrated-20260907`, based
on `12a5b9aec317107782b5f6505065ada7c721f290`. Its durable priority contract is
`docs/tank-generation/fleet-style-performance-priority.md`; its measured report
is `docs/research/fleet-style-performance-baseline-20260907.md`. The baseline
uses an earlier integration snapshot, not the final authoring geometry here.
Do not copy its input hash to claim acceptance of this newer work.

Final source-to-integration resync remains pending. Preserve integration's
upstream-compatible armor tracing and narrow TypeScript fixes; carry these
shoulder/bracket/marking repairs, their tests and this note. Regenerate marking
seats and all required anatomy/assets only after the next geometry freeze.
The unwired `abramsSourceXCrowsFeed.ts` draft is rejected for this pass: it adds
4,538 triangles in place of 24, has no cheaper low-detail path and lacks a
proven receiver connection. Do not wire or publish that draft. No commit or
push has been performed at this checkpoint.

## Integrated continuation

The selective R5 resync is now applied in the integrated worktree. Interim,
truthfully measured Abrams marking/anatomy group receipts unblock browser
preview; they do not freeze ongoing chassis/gear changes or replace the final
full-fleet generation/release procedure. See
[the construction and preview receipt](fleet-construction-performance-20260907.md)
for measured paths, cache isolation, current tests and remaining gates. The
owner clarified that upper shoulder/skirt gaps must close while lower wheels
remain visible; no full road-wheel-covering skirt extension is authorized.

