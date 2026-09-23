# Merkava attachment repairs and separate logo camos — 2026-09-20

## Current status

Implementation and scoped qualification are complete in branch
`codex/merkava-camo-repairs-20260920`, based on main
`3811a58383bd44dfbd79972a3d0ac073cb6edd37`. The owner authorized ordinary
commits and pushes to `origin/main`; deployment is outside this batch.

The exact vehicle scope is `merkava3d_x`, `merkava4_trophy`,
`merkava4_barak`, and the default paint of `sabra_mk2_x`. Existing OpenAI,
Gemini, and X camo IDs retain saved-selection compatibility while receiving
the official marks. Mono, Carbon, and Prism become separate unbranded choices.
Other geometry, running gear, gameplay balance, and performance architecture
are protected.

## Owner target and surface selections

The latest request explicitly selects a **closed rear door** for Barak. This
supersedes the older source-open presentation at that entrance only. Preserve
the original canonical source and its registration; report raw comparisons
against it. The door is an authored finite leaf on the measured recessed frame,
not a filled passenger room or a plate across the outside stowage. Other genuine
source openings and the surrounding case, rack, and suspension stock remain.

The supplied Gallery exports use HIGH, seed 4242, metres, +Z forward, and
neutral hull/turret/gun poses. Their `remove` operation labels do not override
the owner's request to reseat and attach the equipment. UUIDs and triangle
indices are lookup evidence for the old revision, not durable part identities.

| Vehicle / component | Old local selection bounds, min → max | Repair target |
| --- | --- | --- |
| Mk 3D left forward lift eye, turretDetail faces 348–349 | −1.076,.87796,1.19 → −1.06277,.905,1.19952 | Physically seat on its local shoulder |
| Mk 3D opposite lift eye, faces 668–669 | 1.0005,.88766,1.19 → 1.01058,.905,1.19952 | Physically seat on its local shoulder |
| Mk 3D panoramic sight, faces 2144–2145 | −.57517,.916,−.1155 → −.55809,1.186,−.07426 | Seat the complete sight |
| Mk 3D left MAG mount/body, faces 360–361 | −.01722,.014,−.00861 → −.01167,.13381,0 | Seat the complete roof weapon |
| Mk 3D right MAG barrel, faces 612–613 | .00772,.19464,.22309 → .00772,.19965,.53406 | Continuous receiver-to-barrel stock, both MAGs |
| Trophy left aft pedestal, faces 2594–2595 | −1.60048,.08061,−2.8394 → −1.50648,.66307,−2.1794 | Connect pedestal to real turret stock |
| Trophy right aft pedestal, faces 3052–3053 | 1.50648,.08061,−2.8394 → 1.60048,.66307,−2.1794 | Connect pedestal to real turret stock |
| Trophy MAG barrel, faces 620–621 | −.01317,.3282,.38095 → −.00814,.33512,.91198 | Continuous receiver-to-barrel stock |

## Evidence and release

The independent baseline is frozen at the base commit in
`/private/tmp/cot-merkava-critic-baseline-3811a5838`. Thirty actual HIGH/LOW
rear, rear-quarter, underside, rear-detail, and gun-detail images plus geometry
costs are retained under `.qa-dev/merkava-camo-repairs/critic-baseline/`.
These are targeted diagnostics, not a substitute for final official comparisons.

Focused attachment and door tests, scoped fill/centering/assets, complete
anatomy generation/checks, type checking, attribution, independent scoped
visual assessment, live camouflage verification, the composed release gate
and both public/private builds pass. These results qualify the requested
repairs; the broader inherited whole-model visual HOLD below remains explicit.

## Integrated repair checks

The emitted-geometry attachment test passes both detail levels and 36 combined
yaw/pitch/recoil poses. It also catches a detached barrel bridge, raised gun
foot, raised sight/lifting eye, and detached radar arm. Independent old/new
replay preserves all hull, cannon, and running-gear geometry and the complete
unmodified Mk 4 X and Namer siblings. The historical reconstruction still
authenticates its original full-profile hash and passes 60 negative controls.
An additional read-only close-up check confirms finite surface distance zero
for all six Mk 3D lifting eyes in both quality levels. The apparently raised
middle-left eye has eighteen edge intersections with the turret and 6.014 mm
of lower-stock engagement; no additional edit was needed.

Barak's new 78 mm thick leaf engages its original recessed frame by 40 mm.
Thirty exterior rays, inner-face and frame rays, visible hinge/latch checks,
missing/moved hardware negatives, preserved internal bay rays and turret-yaw
checks pass in HIGH and LOW. Existing bow and rear-sheet/source stock tests
also pass, including 264 moving phases and 148,428 installed shoe instances.
After scoped fill regeneration, Barak has no generated fill boxes; its raw
residual is 0.1 L. The original canonical comparison bytes are unchanged.

Fresh geometric minimums retain the unchanged 92 floor: Mk 3D 92.7024969282,
Trophy 92.3400600240, Barak 92.5379090784, Sabra 92.6520410143. These are geometry
checks, not independent visual scores.

The first live Garage camo capture exposed delayed presentation: a completed
chunked repaint did not wake the settled Garage's event-driven renderer. Its
label could therefore lead the visible tank by one selection. The integration
now invalidates presentation when a selected/custom/automatic paint or vehicle
selection repaint completes. It retains chunked baking and idle rendering.
That failed capture remains in the private record; the accepted replacement
observes texture completion and a subsequent actual rendered frame.

The final live Garage run, `.qa-dev/camo-redesign/garage-final-r3/`, does so for
all seven paints. Both actual albedo and roughness revisions match their
renderer-uploaded revisions before each original screenshot. The source files
did not drift, and the page/console error lists are empty. The failed R1 paint
lag and R2 private capture orchestration error are preserved, not accepted as
verification. Regression coverage exercises both real selected/custom paint
callbacks with deferred completion and a dormant frame scheduler; completion
wakes one frame and returns the Garage to idle.

The full anatomy check audits 199 playable tanks, 1,719 authored modules,
398 track sides and 597 technical-diagram files, with zero failed or
outside-envelope module probes. It retains 91 existing dimension warnings.
The asset manifest changes semantically only for the four scoped vehicles;
eight unrelated rows' generator-induced Unicode serialization changes were
restored byte-for-byte without changing any JSON values. The raw final84
visual capture was sealed before that serialization-only cleanup.

The deterministic fleet snapshot now contains 226 authored vehicles. Besides
the four scoped rows, it catches seventeen missing/stale rows from additions
already on main. Each of those inherited rows' fresh asset fingerprints was
explicitly checked against the original main asset manifest and matches; this
is a reviewed receipt refresh, not an unrelated model edit. The manifest scope
and snapshot scope checks are retained as `manifest-scope.json` and
`freeze-scope.json` under `.qa-dev/merkava-camo-repairs/`.

Mk 3D now has an official source-world certificate and evaluator entry. Its
frame uses the earlier independently measured source turret and gun pivots
and the unchanged canonical source hash, with no candidate-derived refitting.
Its geometric score is identical before/after registration. Four old hull-roof
caliper rays differ from the source by 4–137 mm; those discrepancies are kept
in the source-proof record and were not used to fit the certificate. Fresh
evaluator calibration and source/camera tests pass. Source, detailed receipts,
failed experiments and original review images remain local QA inputs rather
than playable assets or source-model redistributions.

## Independent visual result and limits

The independent critic actually inspected 84 final originals: 42 canonical
source/candidate comparisons, 30 native HIGH/LOW close views and 12 actual
Garage views. It also inspected all seven camouflage originals. The requested
attachments, closed door and paints **PASS**, with no new scoped blocker.
All 91 image hashes, 42 exact source/candidate camera pairs and 30 exact
baseline/final native cameras were checked. The six Garage quality pairs
retain identical projection/root transforms, with at most 0.158 mm position
and 0.000005169 quaternion-component drift. All 3,031 acquisition inputs were
stable during capture; the subsequent manifest-only serialization cleanup is
separately authenticated.

The broader existing source-detail assessment remains **HOLD** at its unchanged
9/10 bar: minimum Mk 3D 8.4, Trophy 8.7, Barak 8.7. Rear cases, roof/hatch
vocabulary and wheel relief retain inherited simplifications. Scoped repair
acceptance does not waive those differences or assert new whole-model visual
certification. The owner-selected closed Barak pose intentionally differs from
the canonical open source. Logos can clip at panel UV boundaries. Native and
canonical diagnostic shadows were disabled; actual shadow presentation is
covered by the Garage views, whose front quarters do not establish rear-door
visibility. Native rear/underside views establish that repair instead.

The critic's consistent rendered-cost controls, after generated fills, are:

| Vehicle | HIGH triangles before → after | LOW triangles before → after | HIGH/LOW draw calls before → after |
| --- | ---: | ---: | ---: |
| Mk 3D | 76,870 → 76,938 | 70,406 → 70,474 | 50/49 → 50/49 |
| Trophy | 85,950 → 86,050 | 54,494 → 54,594 | 48/47 → 47/46 |
| Barak | 98,116 → 98,276 | 53,692 → 53,820 | 45/44 → 44/43 |

These use the same cameras and quality settings. They show no added draw calls;
they are not GPU timing or FPS measurements. Full original per-view scores,
warnings and cost receipts are in
`.qa-dev/merkava-final-review/final-r1/independent/`. The review index SHA-256 is
`8d735354b3f1b00d636b3aa5895caaab1e0fafaf3021ca57fb05e8f2914be60c`.

## Release iteration

The first composed run passed its physical/source stages and private build,
then completed the 390-file pre-test stage with one failure: the existing
modern-Merkava test still asserted fifteen rear-bay witnesses, while the
closed-door policy correctly returns eighteen. Its actual result was
`18 !== 15`, not missing stock. The assertion now explicitly requires eighteen
door/floor/roof/side/back probes; the updated focused test passes. The first
failed run remains in `release-r1.log`, and the complete composed rerun is
`release-r2.log`. No production geometry or captured image inputs changed for
this test-only correction. The independent capture remains immutable.

The complete rerun passed on 2026-09-20 at 10:34 UTC:

- `npm run tank:release:check -- --ids=merkava3d_x,merkava4_trophy,merkava4_barak,sabra_mk2_x --gate`: **PASS**, 22.5 minutes.
- Test stages: **390 pre / 675 core / 42 post**, no failures. The normal input-bound
  runner reused 353 pre-stage PASS receipts from unchanged inputs; the other
  754 test files executed in this successful run. No cache entries were forged
  or edited, and no thresholds or exclusion lists were relaxed.
- Private build **PASS**, followed by `npm run build` public build **PASS** with
  localization validation and non-playable reference-asset stripping.
- Type checking, unused-code check, locale checks, attribution audit and
  staged whitespace checks **PASS**. Attribution reports zero tracked external
  model files. Official logo source vectors are explicitly attributed.

Only the reviewed 72-path change set is staged. The source-model files,
screenshots, private test logs and reference inputs remain untracked local QA
material. The normal `origin/main` publication receipt is retained locally at
`.qa-dev/merkava-camo-repairs/publication.json` after push.
