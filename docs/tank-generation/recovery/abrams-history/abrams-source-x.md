# Abrams source-study X rebuild — working contract

Status: seven conventional X prototypes built; R5 geometry corrections and
fresh presentation verification are in progress. Full-suite integration is still being checked;
no vehicle has passed release acceptance. Nothing has been committed or pushed.

The owner requested a new M1A2 SEP v2 foundation and separately selectable
Abrams-family `X` rebuilds. Existing production vehicles are preserved. This
work is isolated from the uncommitted second source-X wave and does not imply
approval to publish that wave's documented gate failures.

## Reference and authorship

- Selected reference: `M1A2 SEPV2 Abrams Main Battle Tank DC.obj` from the
  owner's local `m1a2-sepv2-abrams-main-battle-tank-dc/source` directory.
- Selected OBJ SHA-256:
  `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
- The loose OBJ is an Apple ModelIO re-export with generic groups and a
  missing MTL. The adjacent ZIP contains a different, named Blender export.
  Names from it may aid identification only after correspondence is proved;
  it must not silently replace the owner's selected geometry.
- External meshes/textures remain local comparison inputs. Runtime solids,
  rigs, gear and fittings are independently authored first-party geometry.
  No source mesh, dense vertex sample, topology or texture is shipped.
- Pin one source-derived uniform metric frame before authoring. Do not reuse
  old Abrams/Leopard piecewise oracle warps or fit the source to the candidate.

### Reproducible source registration

`node tools/abrams-source-reference.mjs --source="<selected OBJ path>"`
reproduces the local comparison GLB and its correspondence receipt. It verifies
all 315,891 source triangles against the named archive (including the 9,427
degenerate triangles and duplicate track courses), rather than treating similar
filenames as identity. Archive material groups account for 143 draw segments
inside 102 named objects. The maximum Float32 correspondence error is 5.142 µm.

The archive hash is
`633a582c8f7d12a1f70679de527b1544c6b8dbdbd55b740dfc4f1a684765f96a`.
The byte-reproducible canonical comparison GLB hash is
`7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`.
Both source geometry and derived comparison outputs stay git-ignored. Units
are inferred metres, not an OBJ declaration. Canonical coordinates are exactly
`X = -rawX`, `Y = rawY + 0.203945`, `Z = 0.357965 - rawZ`: a proper rigid
half-turn and translation, with no scale or candidate-dependent fitting.

Measured source lengths are 7.95389 m structural hull and 9.82426 m overall.
Standard width is 3.66219 m; the rectangular urban configuration is 4.06304 m
and the curved urban configuration 4.39543 m. These are separate physical kits,
not arbitrary per-variant scaling. The source bearing and gun centreline anchor
the rig; the longitudinal gun-pitch pivot is an explicitly inferred joint
because the OBJ contains no skeleton.

Sparse scalar dimensions, analytic planes and section/ray observations guide
new native stock. Neither triangle correspondence nor the source census is
used as playable geometry. Reference loading verifies the canonical hash and
bypasses legacy recentering/width normalization. Fourteen-view evaluation uses
the same source-fixed camera and projection for both models, with camera
matrices included in its receipt.

## Scope

Working conventional family scope: M1A1, M1A1 HA, M1A2, M1A2 TUSK,
M1A2 SEP v2, M1A2 SEP v3, and the Ukrainian M1A1. Each retains its original
gameplay donor and receives a separate `_x` ID and ` X` display suffix.
The owner explicitly confirmed: finish these seven; leave AbramsX and M1A3
concepts unchanged. This confirmation does not waive the release gates.
M1, M1IP, removed AIM, and the hidden legacy M1A2 are not silently revived.

SEP v2 is the direct supplied-model comparison. Other variants require
documented configuration differences; one SEP v2 comparison cannot certify
all their shapes. The existing concept models are outside this rebuild.

## Acceptance sequence

1. Record source ownership, source frame, body and rig datums, longitudinal
   and cross-width sections, running-gear stations and true open structures.
2. Qualify SEP v2 gross proportions before multiplying the family or adding
   detail that could hide a wrong silhouette.
3. Build closed hull/turret solids with actual cheek rake, mantlet recess,
   under-bustle clearance, wheel bays, basket apertures and sight openings.
   No broad fill plates in real air spaces and no black decals for openings.
4. Use source-specific seated fittings; weapon barrels align with receivers.
   Track shoes and end wheels share the same measured loop. Turret, gun,
   recoil and hull furniture stay attached through articulation.
5. Require a 92-point minimum for every registered whole view and geometry
   component, not just an average, with source-fixed cameras/frame. Register
   comparison limits honestly for derived variants and missing source parts.
6. Independent shaded review: all fourteen views at least 9/10, including
   both cheeks, native-tone wheel visibility, real negative-space crops and
   yaw/elevation sweeps. A geometric edit invalidates prior visual acceptance.
7. Run focused tests, winding/ownership/track audits, combat-anatomy update
   and check, targeted assets, full tests/build and targeted release gate.
   Preserve existing vehicle fingerprints and unrelated cosmetic assets.

Failing or unavailable evidence remains a failure/pending result. Do not
weaken a threshold, remove a difficult view, misclassify structural armor as
equipment, or call a provisional vehicle released merely to finish a batch.

## Construction and damage-behaviour checkpoints

- Real gun bore depth is approximately 0.966 m. A separately identified factory
  shadow disc sits 1.2 mm in front of the physical rear wall; it is not a muzzle
  cap or a replacement for the open bore.
- Source wheel pairs retain the measured 60.7 mm axial guide gap. Road-wheel
  geometry is an opt-in native solid set in the existing motion/instancing
  system; it does not add a second cosmetic wheel train.
- The reference rear drive teeth penetrate its track course. Preserve the
  measured axle and 0.410699 m actual tooth-tip radial envelope, but adjust the
  local track wrap to clear the crown. This is a disclosed source defect
  correction, not evidence of exact source identity.
  The revised track top at the rear axle is 1.312497 m rather than the source's
  1.178838 m (+133.659 mm); the axle and tooth crown are unchanged. All 360
  rear-wrap rays on each side clear the crown by at least 20.300 mm. This
  deliberate departure remains visible in the unmodified source comparison.
- Urban ERA uses individually named, physically seated cassettes and actual
  outward triangle hit faces. Standard A2/SEP3 donor gameplay zones use a
  concealed partition of their native exterior, not an invented ARAT loadout.
  Turret/glacis partitions are 12 mm; thin skirt-sheet partitions use at most
  35% of their actual thickness, capped at 12 mm. Permanent backing remains.
- The Float32 cover regression, 2,400 exterior-ray tests and closed-volume
  conservation pass. The existing real combat trace/activation/reset audit
  passes 36 high/low zone flows and 6,536 actual face/corner witnesses across
  the four ERA-equipped variants at that checkpoint. Geometry changes require
  rerunning these tests; these are not release or visual acceptance scores.
- Nine original Abrams geometry fingerprints were independently measured from
  pristine commit `519de9de5`, not copied from stale icon manifests. Preservation
  now passes all eighteen high/low fingerprints. The final bounded hull batch
  passes all 22 checks, including each of the seven new rigs' high/low wheel
  geometry and four end-gear configurations. Angular clearance rays and
  animation-phase assertions are separate tests, not 360 animation phases.

## Recorded shape iterations (not acceptance)

The second source-fixed draft scored 94.8 overall, with hull 96.9, turret 90.2,
gun 98.6 and tracks 93.5. All whole views reached 92, but turret rear-left 85.5,
rear 88.3 and right 87.6 failed the component bar. The geometry gate also failed
curve/dimension checks. Subsequent source-backed stock, shields, glazing,
supports and skirt-return changes invalidate that draft's visual evidence.
Fresh complete captures, independent fourteen-view review, anatomy and release
checks are still required. No failure is converted to a pass by this document.

The subsequent 09:48 UTC checkpoint reached 95.1708 overall fidelity, with
96.8724 hull, 92.0343 turret, 99.113 gun and **88.7623 tracks**. Turret left
90.4948 and right 87.8881 also failed. All fourteen camera matrices were equal
and every whole view exceeded 92, but neither fact overrides failed components.
Geometry remained rejected (minimum 62.2). The independent native-shaded review
recorded **0/14 views at 9/10**, with scores from 6.5 to 7.8; see the separately
hashed `abrams-source-x-visual-review.md` checkpoint.

That review triggered further real geometry work: the source77 sloped rear
case replaces its whole-group bounding box; source82 sacks use three measured
principal orientations and independently constructed rounded fabric sections;
source81 containers have genuine molded handgrip openings; source2/3 cooling
screens retain three unequal bays and recessed pitched blades. The 25.96 mm
front-deck cap overfill was clipped against the independently verified bow
plane, preserving the other hull stocks and gear. The source lower glacis's
black appearance is **not air**: twenty independent full-source and native
rays agree within 3.63e-8 m, so it was not hollowed out to imitate shading.

These are construction checkpoints, not updated visual scores. The new sack
envelopes pass a disclosed 30 mm fabric-approximation tolerance, positive closed
stock and 120 cloth/belt seating witnesses. This does not certify their fine
wrinkles or substitute for the complete source-fixed views. Equipment mount,
lower glazing and roof-weapon mechanism corrections are being checked against
actual whole-scene first hits rather than isolated geometry alone.

The four molded containers now sit on separate source59 folded front trays
and source107 rear floors, with thin perimeter receivers. Their three sampled
handle rays and central recessed-sole air remain clear in the complete native
scene at both quality levels and three turret/gun poses. Front feet retain
the source's 120 µm tray overlap. The source rear sole's 370 µm seam is closed
by extending only the native molded feet 490 µm, not lowering the body or
filling the real central recess. Source107's zero-thickness floors receive a
documented concealed 3.94 mm underside; they do not become rack-wide slabs.
Isolated folds, molded walls and handgrip stock are independently closed and
outward-facing. Fine cap moulding remains approximate, not a certified source
mesh reproduction.

### R2 frozen comparison and subsequent R3 work

The 10:39:02 UTC R2 fidelity checkpoint reached **96.1307 overall**, with
97.0141 hull, 94.9244 turret, 99.1130 gun and **88.6364 tracks (FAIL)**.
Every whole and turret mask view now exceeded92; that does not waive the
track component. Geometry hull curves92.0188, whole curves94.4186 and
stations95.1493 passed, while turret curves88.1800 and dimensions62.2105
still failed. The 10:39:11.891 UTC fourteen-view shaded capture was independently
reviewed at **7.8–8.5, 0/14 reaching9**. Exact cameras and image hashes are
recorded separately in `abrams-source-x-visual-review-r2.md`.

R3 addresses those actual medium-form failures rather than adjusting the
source or score. Work includes source-backed circular roof optics/cradles,
raised aft deck covers, and a first-surface diagnosis of the incorrect lower
stern. The new source59 rack has a narrow real lower receiving strip and
separate extension sills/courses, replacing generic wide rail loops. Its
source79 aft screen contains five individually folded sheets, each with a
documented concealed2.5mm forward backing because the source sheet has no
thickness. The receiver and rack apertures remain physical open space.

The initial rack's39 closed stocks /852 outward triangles passed14 independent
source first-surface witnesses and actual high/low ×3pose checks. An independent
stock review nevertheless found incorrect filled bracket bounds and misplaced
hook returns. The corrected thin profiles, actual backing and attachment pins
are tracked in `abrams-source-x-rack-r3.md`; those earlier focused passes do
not certify the corrected checkpoint. The aft
can lane is occupied by source81 containers; it is **not** an air witness.
Complete-scene air assertions use the independently verified empty forward
side bay at Z−2.88. These focused checks do not constitute R3 visual or release
acceptance; a fresh frozen comparison is required after all R3 edits.

### Frozen R3 and the bounded R4 correction pass

The subsequent frozen R3 checkpoint (11:34:12 UTC, preserved under
`.qa-dev/reports/abrams-visual-r3-20260907T113412`) improved shaded form to
8.2–8.7/10, still **0/14 at the required9**. Raw fidelity was96.3718:
whole97.1760, hull97.1827, turret95.3124, gun99.1130, but tracks88.8565
remained below92. Geometry turret curves90.1236 and dimensions62.2105
also failed. Its camera registration passed; that is not shape acceptance.

R4 corrected independently measured medium forms: the open rear-drive
cone, smaller stepped CITV head and true canopy air, the counter-assault
frame and feed, machined muzzle/sight stock, folded main-rack supports,
and loader receiver/cradle with inclined shields. The source first-hit
diagnosis rejected an initial visual suggestion to deepen the road-wheel
bowls: their measured radial depths were already correct. No extra wheel
caps were added to imitate a shading impression. Component receipts are
separate; the completed frozen fourteen-view R4 review is recorded below.

### Native equipment versus optional presentation cargo

The seven new IDs suppress only the generic decoration manifest. Their
native racks, containers, shields, weapons, tools and fittings remain in the
profile. The gallery explicitly enables decorations, which otherwise adds
unrelated coolers/cases over this source-authored equipment. The focused
presentation regression proves identical decorated/undecorated geometry for
all seven high/low builds, and pins the nine original Abrams decoration
manifests captured before this exception. No original or unrelated X model
loses its existing cargo. This is a presentation correction, not a new
source-comparison score or a waiver of the raw track/dimension failures.

## Source height semantics — diagnostic, not a gate exception

The 2026-09-07 source-only diagnosis separates four different quantities:

| Quantity | Metres | Meaning |
|---|---:|---|
| Broad raised roof equipment | 3.36814 | Raster crown of CROWS/guard owners 88/90, not the armor roof |
| Existing side-curve P95 body measurement | 3.647256525 | Current instrument result, controlled by a whip column |
| Full source antenna envelope | 4.176975 | Actual highest source fittings, retained unchanged |
| Retained donor nominal height | 3.44 | Gameplay specification's published target, not a measured source P95 |

A source-only pixel-centre reconstruction of the existing 1024-pixel,
96-column side instrument reproduces the reported `3.647` reading. Of 73
columns passing its 12%-band filter, sorted index 69 selects column 74:
owner 58, face 74, at world Z approximately -2.035 m. This is a tapered whip
stock, not broad roof equipment. Three higher columns belong to owner 58
(column 75) and owner 78 (columns 79/80); together the four mast/whip columns
exceed the five-percent exclusion. The next lower broad-kit crown is 3.36814 m.
Thus the current P95 instrument's intended antenna robustness is insufficient
for this particular source and bin phase. This does not authorize source
scaling, deleting fittings, substituting a candidate-fitted height, or claiming
the existing dimension gate passed.

The ignored evidence is `.qa-dev/reports/abrams-source-bodyheight-study.json`
(2026-09-07T09:31:51.623Z), tied to the selected OBJ hash above. It uses the
source-limited shared camera bounds; CPU edge-tie rules may differ from GPU
rasterization. The official metric, source, camera and masks remain unchanged.

## R4 checkpoint — not release acceptance

The frozen R4 capture completed on 2026-09-07 at 14:03:32 UTC. Root's
`.qa-dev/reports/abrams-r4-checkpoint-Zp8sEG/receipt.json` records 32 focused
passes, 23 profile files / 539 functions with no quality violations, and a
passing application typecheck. Both raw comparison gates still failed.

| Measure | Raw score | Disposition |
| --- | ---: | --- |
| Fidelity composite | 96.5325 | An aggregate, not acceptance |
| Whole / hull / turret masks | 97.2521 / 97.1936 / 95.4422 | Component aggregates above 92 |
| Track mask | 88.8431 | Fail: lower-side silhouette mismatch; see R5 diagnosis |
| Geometry turret curves | 95.0181 | Pass; supersedes the R3 failure |
| Geometry dimensions | 62.2105 | Fail: unresolved published-height / source-height contract |

The [fourteen-view R4 review](abrams-source-x-visual-review-r4.md) records
8.5–8.9 visually, with no view meeting the 9/10 floor. Its image/archive hashes
preserve the inspected source/native pairs and neutral-clay board. All camera
matrices match; that verifies comparison registration, not geometry quality.
Raw rear-left direct-turret and exposed-upper diagnostics below 92 are retained,
even where the automated gate does not enforce those secondary rows.

Root also inspected the front, right, rear-left, hero-front-left and close-roof
pairs and the neutral board. The corrected drive apertures, loader glazing and
source-shaped seated assemblies are visible. The source-black lower bow is
solid armor, not an opening to reproduce. Mechanical track differences and
remaining regularized roof/weapon medium forms are disclosed, not hidden by
camouflage or erased from the comparison masks.

The seven new IDs suppress the separate randomized cargo decoration pass;
their source-shaped authored equipment remains present. The presentation test
builds all seven at both quality levels with decoration enabled/disabled,
checks actual completed decoration summaries, and pins unchanged old-vehicle
decoration manifests. This prevents generic floating coolers/cases from hiding
the native roof forms in the real Gallery.

Subsequent collision alignment is metadata-only. The inherited donor skirts
and broad rear rack plate are not evidence for the new visible surfaces.
Finite authored stock faces use opt-in physical edge tolerance and same-sheet
coincident-hit grouping, with unchanged ordinary-quad behavior. The focused
simulation test, combat (532 assertions), movement (135 checks), spotting (99
checks), typecheck and 48-function armor quality scan pass. The final metadata
preservation receipt (`.qa-dev/reports/abrams-armor-metadata-visual-BsrsnZ/receipt.json`)
matches all fourteen complete visual hashes and all nine original full-spec
hashes to the immutable pre-hook receipt. Polygon bounds, scaling and asset
fingerprints also have a separate regression; ordinary legacy metadata does
not receive the new optional fields.

The first integration attempt (`.qa-dev/reports/abrams-r4-integration-TIwvIH/receipt.json`)
passed centering and generated anatomy, then stopped during marking-seat
generation. Fresh anatomy correctly expands one logical ERA bank into several
same-name collision faces; the new profile incorrectly required a single face
instead of a single logical bank. This is a real post-generation integration
failure, not a waived check. Asset generation and downstream release checks
were not run by that attempt. Its logs remain preserved for the correction.

The narrow fix now requires one unique logical bank name while retaining every
generated face. `abramsSourceXFinalizedEra.selftest.mjs` reproduced the original
failure, then passed the actual complete 158-ID build order, seven low builds,
fourteen full-scene geometry-equivalence comparisons, and missing/ambiguous
bank negatives. It checks exact ERA-face arrays across each new-model build
and all complete warmed specs across the counterfactual builds. The earlier
cold-spec assertion exposed ordinary first-build `trackShapes` caching on
Tiger I only; its diagnostic and failed log are retained, not erased. Evidence:
`.qa-dev/reports/abrams-finalized-era-warmed-final.log`.
All fourteen logged full visual identities also match the immutable pre-hook
`gZjGG6` receipt exactly; this is not merely an after-fix self-comparison.
The eighteen logical ERA banks retain all 3,352 generated face records.

The fresh integration continuation is
`.qa-dev/reports/abrams-r4-integration-resume-uo3oOW/receipt.json`. It references
the original successful anatomy update and independently reruns its `--check`
before downstream generation. Native-input and original cosmetic-file/record
hash guards remain active. Final stage dispositions belong to that receipt,
not to the existence of this continuation entry.

An early official release attempt is preserved at
`.qa-dev/reports/abrams-release-DT8VV6/receipt.json`. Anatomy passed; the second
step reached its saved-top-image audit before the seven new `_top.webp` files
had been generated, and correctly failed image decoding. The live rendered
centroid check had not reported an out-of-tolerance result. All later release
steps were unrun. This ordering failure requires a fresh attempt after assets,
not a change to centering thresholds or a claim of release success.

The integration continuation finished at 15:25:08 UTC. Anatomy freshness,
marking-receipt freshness, all-fleet module probes, selected image centering
and the public build passed. Its asset audits found fourteen actual errors:
all seven new models lacked their two visible unit markings. Missing explicit
`VEHICLE_MARKING_ANCHORS` entries produced no solver candidates and empty
generated seats; optional cargo suppression was unrelated. These failures are
retained, not waived. The full suite also exposed a test-only multiplication
of finalized skirt ERA faces (17 ray hits instead of 2); a focused correction
must preserve the actual generated bank rather than expand it a second time.

An independent technical-image inspection found the new Abrams gun tips
entering the reserved label gutter. The existing technical-only inset list
omitted these seven IDs. A narrow camera-list correction has a failing-before,
passing-after regression in
`.qa-dev/reports/abrams-technical-framing-q4OYR7/receipt.json`: twenty models
at high/low quality, all forty projections inside the reserved technical
viewport. Existing cameras and ordinary presentation/source-comparison
framing remain unchanged. The earlier images precede this correction; their
required regeneration was subsequently completed by `SWr6Bd` below, with the
fresh technical images captured at 15:43 UTC and independently inspected.

The finalized skirt regression correction changes only the test. Its retained
negative control recreates the former 16-by-16 Cartesian expansion and observes
17 ray layers; the actual finalized bank has one removable skin plus one
permanent backing. Exact visual-receipt depth (the original 1 µm assertion)
and four-decimal generated anatomy are checked separately. Evidence:
`.qa-dev/reports/abrams-skirt-finalized-test-P9Sh8T/summary.json`, with fourteen
builds, forty-two poses, 432 seams and twenty-four actual finalized damage/reset
flows. Every live armor field remains unchanged across the probes.

Seven explicit marking hints now seat full 240 mm insignia/designation quads
on existing permanent turret stock. Their solver regression covers fourteen
high/low builds and eighty-four intact/spent-ERA posed states, with 1,512 near
support rays and 1,512 independent eight-metre visibility rays. Maximum sampled
residual is 41.14 nm; these finite samples are not a continuous all-pixel or
all-view visibility claim. All 151 prior marking policies remain exact.
The original fourteen complete unmarked scene hashes are retained unchanged:
only two authenticated indexed/UV paint quads are temporarily removed. The
authentication rejects hidden/tiny paint, physical geometry masquerading as
paint, and unmarked physical children below otherwise valid paint meshes.
Evidence: `.qa-dev/reports/abrams-markings-solver-leaf-final.log`.

Checkpoint `abrams-presentation-final-8evesO` successfully generated the new
marking seats, then its source guard stopped because independent review
required the physical-child negative control above. No runtime geometry or
marking anchor changed during that interruption. The explicit continuation
`abrams-presentation-final-SWr6Bd` validates that this single test file was the
only source change, references the successful generation receipt, and reruns
marking freshness before targeted image generation. Its stage results, not
the existence of this entry, determine integration status.

## Final presentation and release checkpoint — 2026-09-07

`abrams-presentation-final-SWr6Bd` passed marking-seat freshness, all nine
selected asset views for all seven tanks, the complete 474-image fleet technical
asset check, typecheck and the public build. Its full test run exposed the new
marking test's generated-seat path requesting browser canvas materials under
Node. Only that path's test setup now selects the existing headless material
adapter; `geometryReceipt` remains false and the actual generated-seat path is
asserted. The runtime, seats and source geometry were not changed for this fix.

The corrected default marking test passes both solver and generated paths:
28 high/low builds, 168 intact/spent/posed states, 3,024 full-quad support rays
and 3,024 independent eight-metre visibility rays, with an 82.251 nm maximum
sampled error. Both genuine generated seat transforms match solver results;
all fourteen immutable unmarked scene hashes remain exact. Evidence:
`.qa-dev/reports/abrams-markings-default-headless-final.log`.

The historical full-suite receipt `abrams-final-regressions-YwssN4` passes all
new Abrams tests, including generated ERA, markings, skirt contacts and actual
sparse rack collision. It then fails an existing preservation-oracle test whose
VM context omits the new imported Abrams reference registry. Typecheck and
public build both pass independently. The missing test import was subsequently
corrected by loading the actual pinned Abrams override into the existing VM
context. New assertions verify that its entries are unchanged, retain the
92-point exemplar floor and cannot use a historical preservation exemption;
all existing Revolution baseline assertions remain. The focused test passes
in `.qa-dev/reports/abrams-preservation-oracle-import-final.log`. A fresh full
rerun is recorded by `abrams-final-regressions-PXbkRI`; its final disposition
must be read from the receipt, not inferred from this focused pass.

`PXbkRI` subsequently passed the preservation test, complete lazy fleet sweep,
attribution and suspension census, then reached a second old fleet-census
assumption: `ammunitionFlow.selftest.mjs` hard-coded 535 channels before the
seven new three-channel loadouts. Its 556 observed channels do not indicate
changed ammunition behavior. The test now derives expected `(vehicle ID, slot)`
coverage from `SAVED_TANK_IDS` and compares exact manifests for both the audited
loadouts and authoritative final-round launches; duplicated/substituted or
omitted channels fail. The existing 22-guided-round assertion and all per-round
depletion/reload checks are retained. Focused evidence
`abrams-ammunition-flow-coverage-final.log` passes 556 final-round launches and
1,104 depleted-channel transitions. `PXbkRI` independently passed typecheck
and public build, but remains a failed full-suite attempt. Diagnostic continuation
`abrams-remaining-regressions-FPyDmk` exercises the unchanged suffix of all three
suites while retaining every failure; it is not a substitute for a clean final
`npm test`.

The fresh official release attempt is
`.qa-dev/reports/abrams-release-96XOKF/receipt.json`. Its first eight stages pass:
anatomy freshness, presentation centering, module visual alignment, module-hit
probes, selected assets, duplicate-track audit, muzzle bore and barrel
circularity. It stops at source fidelity. SEP v2 scores 96.5325 overall but only
88.8431 for tracks; the six derived configurations lack independent local mesh
oracles. They are not falsely certified against the SEP v2 urban-kit model.
The official plan's standard check, full tests and private build are **not run**
after this stop. Separate test/public-build evidence is not a release pass.

Final frozen source comparison evidence is archived under
`.qa-dev/reports/abrams-final-source-review-P4Wdzv/outputs/` so that later gates
cannot silently replace the reviewed images or results. Both raw gate scores
remain exactly those of R4 above, including the failed dimension and track
scores. Fourteen matching source/native cameras and unchanged source framing
are verified, but the visual capture's successful execution is not a 9/10
acceptance result. The independent R4 review still has zero accepted views.

The [final integration visual review](abrams-source-x-integration-visual-review.md)
inspects freshly generated technical views, all seven naturally settled Gallery
hero views, the rear view, and fresh registered source comparisons. The initial
Gallery packet is retained because its first hero caught a loading fade. Its
replacement waits for the actual overlay's opacity zero and hidden visibility;
it does not disable animation or hide UI to manufacture readiness. A separate
1600×1100 SEP v2 hero/rear capture keeps the complete rear track silhouette
above the real toolbar. That larger packet reports no page errors and records
unchanged source/tool hashes. It does not substitute for fixed-camera source
comparison or certify every variant against a missing oracle.

Outstanding acceptance issues remain explicit: corrected rear track wrap
versus the defective supplied course; the source P95/published-height contract;
remaining medium-form roof/coaming/CROWS simplifications; and independent reference
coverage for derivative variants. No threshold, source normalization or
preservation exemption was changed to turn these into passes.

## R5 resumption — remaining work, not acceptance

The owner confirmed the seven conventional variants only. The original
AbramsX and M1A3 concepts remain unchanged. The R4 images, scores and generated
assets above remain historical evidence; new geometry invalidates their use
as final acceptance or asset-freshness proof.

The [regression completion receipt](abrams-source-x-regression-completion.md)
records stale fleet-count assertions, the minimally renamed native builder
entry point and fresh focused results. These are integration fixes, not visual
acceptance. A clean full-suite run is still required after the geometry freeze.

The [commander-hatch correction](abrams-source-x-hatch-r5.md) replaces the
incorrectly circular upper lid with measured elliptical stock, and adds its
missing raised polygonal cap on a narrow crossbar. Actual air beneath the cap
is preserved; the independently verified round lower rim is unchanged.

The earlier explanation of the track-mask failure was incomplete. The current
instrument crops the bottom 39% of the right hull silhouette; most of the
raised rear wrap lies above that crop. The raw 88.8431 result therefore cannot
be attributed solely to the deliberate crown-clearance correction. Source
central guides are substantially taller and narrower than the native generic
horns. A height-only change would penetrate the paired wheel webs and is not
an acceptable fix. Source-specific guide clearance and new unchanged-oracle
captures are being investigated separately.

The [user-selected surface repairs](abrams-source-x-user-surfaces-r5.md)
close the bilateral aft shoulder troughs and attach all42 urban turret ERA
receiver tabs to the existing side armor. The two urban unit-marking seats
are moved clear of those roots while retaining their full240mm size. Focused
contact and visibility checks pass, but generated receipts and final source
comparison remain pending the R5 freeze.

