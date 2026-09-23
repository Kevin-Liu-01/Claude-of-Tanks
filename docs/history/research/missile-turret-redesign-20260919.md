# Missile turret concepts — 2026-09-19

The owner requested substantially different, missile-oriented turrets for the
Tier IX ZTZ-100 Prototype and Tier X Object 695. Their existing chassis and
running gear are retained; the service ZTZ-100 and Kurganets-25 remain unchanged.
These are original first-party game designs. Weapon names and performance below
are game tuning, not historical specifications.

## Distinct roles

| Vehicle | Turret | Primary tandem missile | Blast missile | Backup cannon | Mobility / HP |
| --- | --- | --- | --- | --- | --- |
| ZTZ-100 Prototype | Low armored base, two four-cell canister banks | 650 damage, 950 mm penetration, 8.2 s cycle, 12 rounds | 800 damage, 9 s cycle, 8 rounds | 35 mm, 44 damage, 0.30 s cycle, 180 rounds | 64/24 km/h, 2,250 HP |
| Object 695 | Raised open cradle, two six-cell pods, three sensors | 560 damage, 1,050 mm penetration, 5.8 s cycle, 12 rounds | 700 damage, 6.6 s cycle, 12 rounds | 30 mm, 34 damage, 0.22 s cycle, 240 rounds | 84/36 km/h, 2,150 HP |

Each vehicle's two missile types share one physical launcher cycle. Its backup
cannon has an independent feed. The finite ammunition load stocks at least one
round of each guided type per physical tube. Both begin with missiles selected.
Object belongs to an explicit missile-carrier balance cohort: a slow guided
primary cannot be meaningfully compared to the conventional IFV belt's raw DPM
and penetration medians. Its exact loadout and tradeoffs have focused coverage;
existing cohort thresholds and other IFV tuning are unchanged.

## Physical and gameplay ownership

The rotating structural bases carry armor; launcher frames, sensors and tubes
are equipment. Tube bodies bind the missile-rack damage module. Three hull crew
operate each unmanned turret, with an explicit owner-directed interior source.
The new turret shapes never consume external model geometry.

Missile mouths attach to the pitching, non-recoiling gun mount. The backup tube
attaches to the recoil group. Authored launch offsets are shared by the native
model and authoritative simulation; a cannon shot does not advance the missile
rack. Guided fire has no cannon recoil. Backup fire uses the existing rapid-gun
recoil scale. The network bridge advances its launcher sequence from accepted
server events, so rejected predictions cannot consume a tube or corrupt replay
origins. Life and round changes reset that presentation sequence.

Physical tests authenticate both retained hull/gear payloads, real tube stock,
open mouths, backplates, finite supports, lens sightlines, legal turret/elevation
poses, actual firing origins and deliberately broken geometry. Object's rear
canisters and backup barrel were shortened to clear the retained rear rack at
oblique azimuth and extreme pitch. The final backup length is 1.35 m.

## Qualification scope

The [authored design contract](../../references/concepts/missile-turrets-20260919.json)
replaces the obsolete turret comparison targets for exactly these two IDs.
Historical preservation exports, source recipes, hashes and receipts remain
archived. They do not certify the new concepts. Source-comparison score is
explicitly not applicable, never a fabricated self-comparison score.

The complete release gate still requires fresh native HIGH/LOW concept tests,
current generated fills, exact declared frames and measured envelopes, strict
tracks, continuity, finite equipment, sealed stock, module/anatomy alignment,
assets, centering, actual bores, tests and build. Other source-backed vehicles
retain their existing floors and missing-source failures. Independent native
visual review covers all seven required views in HIGH and LOW.

## Review corrections

Independent review found an inherited marking in Object's open rear cradle.
Marking anchors now sit on actual closed stock, with finite-surface and
visible-area checks. Object uses its permanent hull armor (zero measured
surface error); Prototype uses the aft turret spine (under 0.9 mm). Both pass
all nine visibility samples in HIGH and LOW. The fill review also traced a false first hit 125.9 mm
outside an actual launcher cylinder. Object's separate closed launcher pieces
now remain external equipment during fill generation; its hull, armored base
and backup cannon still receive the usual body repair. The old fill fails the
new side-gap fixture, while a deleted primary plate still fails the body test.

The first complete anatomy refresh regenerated all fleet technical diagrams.
Only the two concepts and the three T-90M X technical views changed; the latter
reflect the existing upstream fill correction. The first anatomy check passed
all 199 native module/envelope records but stopped at five stale presentation
projection fields for the two redesigned silhouettes. The selected camera receipts and assets were refreshed. The final full anatomy
check passes all 199 native records, 1,718 modules, 398 track sides and 597
technical image files. The fleet report retains its 91 non-blocking dimension
notes; neither concept has a dimension warning in that report.

The first composed release attempt then caught Object's generic turret radio:
calibration compressed it into a 33.19 mm sliver beneath the launcher. The radio
now sits in hull equipment space aft of the crew, above the fuel cells, with a
333.7 × 321.8 × 383.6 mm case. All 27 sampled case points lie inside measured
hull collision cells. Focused tests retain the release's 50 mm minimum for all
internal volumes and reject missing, thin, wrongly framed and outside-hull
radios. Actual native before/after buffers, materials, transforms, instances and
markings are identical at HIGH and LOW for both tanks; only Object's radio
damage volume changes. The earlier release attempt was interrupted after this
failure and is not counted as a completed pass.

The second run passed every vehicle release probe, then found that the fidelity
tool's lifecycle fixture still injected five imports after concept routing
added two more. The fixture now injects the registry and real selection-policy
functions. All original startup, cleanup and error assertions remain, with
additional mixed/concept-only and invalid-selection cases. This correction
changes a test only; the final native capture's 1,185 consumed input hashes
still match. The failing earlier run is preserved separately from the final run.

The third run completed the pre/core lifecycle with one remaining failure in
fleet gun articulation: that test compared Object's raised moving crossbeam
only to the low armored base, excluding its actual fixed feet, towers and
bearings. The geometry stays unchanged. Declared trunnion stations now allow a
finite-triangle check to trace 18 receiving rays through continuous fixed stock
into the moving crossbeam. The original shell/barrel gap limits and fleet
census remain intact. Missing, shifted, thin and hidden supports and a missing
crossbeam must fail; a tall unrelated mast cannot satisfy the support columns.
The focused fleet gate passes all 199 vehicles. Object passes 144 poses and
2,592 receiving rays across HIGH/LOW, plus six broken/hidden-support cases per
quality. Exact rendered payloads for both tanks remain byte-identical.
The capture scope bridge is `.qa-dev/missile-redesign/post-articulation-capture-scope.json`;
its finite-support proof is `.qa-dev/object695-articulation-seat/freeze.json`.

## Visual and Garage verification

An independent reviewer opened all 28 final native originals: quarter, front,
side, rear, roof, detail and elevated views in HIGH and LOW for each tank. Both
concept presentations passed. Object's launcher gaps and seated markings are
visible in those images. The Prototype's marking face is obscured or on the
opposite flank in that camera set; a subsequent normal Garage orbit visibly
confirmed its red star and white 100 on the aft spine, and Object's star and 225
on permanent side armor. The Garage inspection was functional verification by
the Prototype author, separate from the independent shape review.

All 1,185 captured runtime, package, policy and camera inputs stayed unchanged
through the final native run after the radio fix and main update. Its 28 PNGs
are byte-identical to the independently viewed earlier originals. The final
originals and identity verification are under
`.qa-dev/missile-concepts-final-native/final-r2/`; the actual Garage marking
inspection is `.qa-dev/missile-concepts-garage-inspection-r1/review.json`, with
its subsequent cleanup clarification preserved alongside it.

Normal pointer selection passed in both vehicle orders, including rapid final
selection, with matching card and pedestal IDs and no browser/resource errors.
At 4× CPU throttling, first selections became ready in 519–870 ms, repeats in
114–160 ms, and rapid final selections in 198–221 ms. The separate stage pipeline
probe measured first builds at 669/297 ms and cached repeats at 0–1 ms, within
its existing 5,000 ms limit. Production prefetch remained enabled. These are
selection measurements on the Vite-served application, not FPS or empty-cache
production-bundle benchmarks. Idle prefetch stalls remain in the raw report;
this work does not claim to have eliminated them.
All three final Garage jobs passed on `33d032416`, with 2,891 input pins unchanged
during that capture. Subsequent articulation metadata/test and fidelity-fixture
changes are separately audited; they are not silently represented as captured
inputs. Native payload parity establishes whether the render proof carries forward.
The current model, selected card and sidebars also agree in both fresh
rapid-selection screenshots. The final receipt is
`.qa-dev/missile-concepts-garage-final-r2/summary.json`.

## Geometry cost and retained limitations

Final filled near-LOD triangle counts are 75,020 HIGH / 66,476 LOW for Prototype and
81,474 / 74,064 for Object. Both redesigns reduce geometry relative to their
previous turrets. Their preserved hulls and running gear dominate the full-model
LOW counts: LOW is 88.61% and 90.91% of HIGH respectively, above the 75% target.
That inherited optimization debt remains explicit; this change neither pads
HIGH geometry nor weakens a check to claim the target. Object's new turret
alone, including fills, drops from 7,342 to 4,092 triangles in LOW.
The sealed-surface traversal also includes Prototype's alternate simplified
shoe stream: 156 instances × 22 triangles add 3,432, explaining its 78,452
triangle sealing report. That traversal count is not the near rendered cost.

## Final release validation

Type checking, attribution audit and the public production build pass. The
release's standard checks pass for both tanks: strict front/rear and swept
track intersections are all zero, with zero unexpected continuity holes.

The 33-view sealed check passes the unchanged ledger. Prototype has zero open
pixels. Object retains 18 open pixels at two inherited rear hull-armor corners,
within its existing 80-pixel allowance; its inherited inside-out hull/hardware
pixels are recorded as diagnostics. Neither ledger nor winding thresholds were
changed. This is not a claim that Object's preserved chassis has zero defects.

The final composed release passes for both IDs (`release-r4.log`, 37.9 minutes),
including all physical probes, generated anatomy freshness, assets, the private
production build and the complete npm lifecycle: 387 preliminary, 674 core and
42 post-test files. The normal dependency cache reused 276 unchanged passing
receipts; 827 files executed afresh. The browser post-tests passed as well.
The final source receipt is `.qa-dev/missile-redesign/final-release-receipt.json`;
earlier failed/interrupted runs remain separate. Final type checking and the
public production build also pass on the frozen runtime source
(`typecheck-r9.log` and `public-build-final.log`).

The final candidate includes main through `33d032416`, including the upstream
collision-height, moving-wreck, Garage zoom and responsive sidebar changes.
