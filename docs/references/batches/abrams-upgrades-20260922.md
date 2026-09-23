# Abrams visual upgrades — 22 September 2026

Status: owner-authorized publication to main; no production deployment requested.
The owner confirmed that there is no comparison reference and explicitly
requested rebasing onto main, committing and pushing this batch. The unavailable
comparison results below remain recorded as unavailable, not as passing scores.
Built in `codex/abrams-upgrades-20260922` from baseline
`690356ec4c66330fc25ee48b02bd593c5e32c12c`. The shared dirty checkout was not
modified. The baseline includes the Korean wheel release and the main branch's
existing rendering changes.
Before closeout the branch fast-forwarded to current `origin/main`
`77b53397b5767a6c66310ec3ca8c0ce4b06cfc3b`, retaining the three intervening
sky/rendering/deployment-record commits. No files overlapped this tank batch.
The shortened-ring revision subsequently fast-forwarded to
`ebc3025f72bf5a978f48d1778761b0f953ffe372`, preserving the additional Redrock,
far-range atmosphere and deployment-record changes without overlapping edits.

## Owner target and implementation

| Vehicle | Requested result | Implementation |
| --- | --- | --- |
| `m1a2_sepv3_x` | Heavy side protection visibly distinct from TUSK | Eight deep, chamfered reactive cassettes per side, permanent backing, hinge shoulders, pivots, load rails, handles and lower lips. Existing reactive-bank behavior retained. Overall kit width is 4.48 m. |
| `m1a3` | Enhanced armor, attachments and decorations; visible turret ring | Thicker skirts, sloped cheek modules, fasteners, supported service trays/cases, strapped packs and rear cooling furniture. The complete articulated turret is translated upward by 0.128 m without stretching its shell. Its base clears the hull roof by 50 mm, joined by a 56 mm circular bearing flange. |
| `abramsx` | Improved detail, circular ring, removal of marked underside strips | A 48-sided circular bearing replaces the marked rectangular carrier at the true yaw axis. Both static 55 × 55 mm, 4.69 m underside strips are removed. Compact flank armor, service cases, side rails and tie-downs preserve the low profile and original designation panels. |

The owner first shortened the 122 mm exposed M1A3 ring to 12 mm, then raised
it to 32 mm, and finally confirmed a 50 mm (5 cm) visible-height target.
The latest adjustment raises the complete turret another 18 mm: a 0.128 m
translation and 50 mm visible seam. The bearing itself is 56 mm tall, with
3 mm embedded in the deck and 3 mm embedded in the turret base. Gun, mantlet,
roof weapons, sensors and stowage remain children of the same turret rig;
the earlier 0.30 m forward shift is retained. The existing shared 12 mm
seating correction also remains, so the final rig Y is 1.810 m.

American carousel order now places `abramsx` immediately after `m1a2_tusk_x`
and before `m551a1_tts`.

These are owner-directed enhancements to the current procedural models, not
claims that the added equipment is historically documented. External GLBs are
not added to the playable loading path. TUSK and SEPv2 retain their own kits.

## Regression and review evidence

Local artifacts live in `.qa-dev/abrams-upgrades/` within this worktree.
The committed regression `abramsUpgradePackage.selftest.mjs` checks HIGH and
LOW native geometry: 48 bearing raycasts, both removed strips, exact M1A3
translation, actual exposed-bearing sightlines, finite fitting support, and
SEPv3 live/spent/reset geometry with permanent backing retained. It is registered
in the normal test suite.

Actual Garage selection and cached return were inspected. Gallery inspection
covered front, side, rear, top, quarter and 90-degree turret yaw views. The
18 views in `final-gallery/` show the superseded taller M1A3 ring. The live
Garage was captured on synced main in `final-synced-garage/` before the latest
request to shorten the ring. Current-revision evidence belongs in `ring-short/`.

TUSK, SEPv2 and K2 controls have identical HIGH/LOW/AI geometry hashes to the
baseline. Only the three intended tank rows change in the asset manifest.
The added geometry is construction-time work, merged into the existing material
groups, with one additional mesh per vehicle and no new per-frame update loop.
Instance-expanded triangle growth remains below the 5% per-vehicle budget;
final counts are recorded in `final.json` against `baseline.json`.

| Vehicle | HIGH/AI growth | LOW growth |
| --- | ---: | ---: |
| SEPv3 | 2.12% | 2.61% |
| M1A3 | 4.22% | 4.63% |
| AbramsX | 3.05% | 3.33% |

Matched seven-selection browser probes pass the existing latency gate:
baseline worst 123 ms, candidate worst 122 ms, median 0 ms in both runs.
The measurements include cold selections and cached returns, before the final
M1A3 vertical-only adjustment. They are not proof of an FPS improvement:
the shared headless environment still shows roughly 500 ms sampled frame gaps
and much slower background dressing frames in both runs.

## Comparison limitations and inherited defect

The required composed release command was run and failed. No comparison floor,
source registry, sealed-body threshold or track gate was relaxed.

- `abramsx`'s registered comparison file
  `/models/tanks/community/abramsx-mortavex.glb` is unavailable. Its historical
  90.4 result does not qualify the new model. The current ledger records failed
  oracle availability, not a measured fidelity score for this candidate.
- `m1a2_sepv3_x` and `m1a3` have no local GLB comparison in the current fidelity
  harness. That is reported as unavailable, not automatically waived as a
  concept exemption.
- Strict AbramsX track containment reports 266 band / 10 shoe voxels in the
  return-run hull overlap. The same HIGH result reproduces on unchanged baseline
  `690356ec4`; the candidate LOW result is also 266/10. The marked underside
  strips were separate from this inherited hull overlap. Front/rear end zones
  are zero. SEPv3 and M1A3 have zero strict band/shoe overlaps.

The owner's September 22 follow-up ("commit and push origin main (there is no
comparison reference) after rebasing onto main") authorizes publication of this
batch despite the unavailable comparison. The prior Korean wheel exception is
not used as authority. The inherited AbramsX return-run overlap remains reported
above; this package does not change its track or suspension datums. Fetch current
`origin/main` before integrating; never copy whole generated groups or a stale
shared checkout over newer work.

## Verification before the shortened-ring revision

| Check | Result and evidence |
| --- | --- |
| Full regression suite | PASS: 408 pre + 685 core + 42 post = 1,135 files, `tests.log`. The run straddled the final cosmetic/translation adjustments; relevant geometry regressions were rerun afterward. |
| Final M1A3 and batch geometry | PASS: `visible-ring.log`, `m1a3-concept-final.log`, and `main-sync-tests.log`. HIGH/LOW ring visibility and finite fitting seats included. |
| Full anatomy regeneration | PASS: `anatomy-update-ring.log`, 202 anatomy/marking records and 229 tanks' technical images. |
| Full anatomy check after final translation | PASS: `anatomy-check-ring.log`; 202 current receipts, zero module failures/outside-envelope modules, 606 technical assets current. The 93 existing dimension-drift warnings remain visible. |
| Final selected asset freshness | PASS: `final-tank-assets-check.log`, all 30 selected assets and metadata current. |
| Presentation centering | The earlier `final-presentation-centering.log` failed on a 1.08 px SEPv3 residual; its previous PASS label was incorrect. Refresh and verification are recorded below for the shortened-ring revision. |
| Internal module alignment/hits | PASS for the final M1A3 in `final-module-visual-align-probe.log` and `final-module-hit-probe.log`; all three passed before the final vertical-only adjustment. |
| Sealed bodies | PASS for all three; final M1A3 rerun in `final-tank-sealed-check.log`. |
| Duplicate tracks, muzzle bores, circular barrels | PASS for all three; final M1A3 barrel rerun also passes. |
| Strict tracks | SEPv3/M1A3 HIGH and LOW: zero band/shoe overlaps. AbramsX retains the baseline 266/10 failure described above. |
| Main synchronization | Clean fast-forward; changed sky/terrain regressions and the Abrams geometry regression pass in `main-sync-tests.log`. |
| Type checking | PASS: `typecheck-synced.log`. |
| Private/public production builds | PASS: `build-private-synced.log`, `build-public-synced.log`. These are local builds, not a deployment. |
| Composed release gate | FAIL: missing comparison inputs; no pass waiver. `release.log` records the attempted composition. |

Superseded centering/asset runs remain in the local artifact directory, including
an asset-read/write race during regeneration and a nested capture-lock attempt.
The latter was stopped and the LOW track audit rerun directly; its completed
evidence is `tracks-low-final.log`. They are not counted as passes. The final
anatomy check ran after generation completed and passes. Historical certified
scores are not substituted for the unavailable current comparisons.

## Shortened-ring revision

The earlier shortened-ring target was an 18 mm bearing / 12 mm visible seam.
Evidence for this revision lives under `.qa-dev/abrams-upgrades/ring-short/`:

- `geometry.log`: HIGH/LOW native geometry and M1A3 concept regressions pass,
  including measured bearing thickness, deck/base overlap and side sightlines.
- `interior.log`, `anatomy-update.log`, `anatomy-check.log`: regenerated interiors,
  anatomy, markings and diagrams; all 202 anatomy/marking receipts and 606
  technical images pass. Module hits report zero failures/outside-envelope
  modules; the 93 pre-existing dimension warnings remain.
- `probes.json`: all six selected checks pass: presentation centering, module
  visual alignment, module hits, asset freshness, sealed bodies and barrel
  circularity. All three edited tanks are now centered within 0.14 px; this
  corrects the earlier failed SEPv3 centering run.
- `garage/` and `gallery/`: actual Garage selection/cached return and six Gallery
  views, including the side and 90-degree turret pose. Garage and side images
  were visually inspected; no browser errors were reported.
- `typecheck-synced.log`, `build-synced.log`, `main-sync-tests.log`: type checking,
  private production build and the incoming map regressions pass on main
  `ebc3025f7` plus the local tank changes.
- `release.log`: the required M1A3 release composition still fails because no
  registered/local comparison reference is available. Its track and sweep
  overlaps are zero, contiguity passes, equipment census passes, and the sealed
  gate passes. No comparison policy was changed or bypassed.

This correction adds no geometry or runtime work beyond the earlier package:
it changes the turret's vertical datum and the existing bearing's height and
center. Publication is authorized by the owner's follow-up; the comparison gate
is not represented as passing, and no global qualification threshold is relaxed.

## Small upward adjustment after the fleet wheel and muzzle update

The owner subsequently asked for a slightly taller ring with the turret raised
along with it. This revision adds 20 mm to the previously published ring and
turret position, giving a 38 mm bearing and 32 mm exposed seam.
The lower bearing edge stays at world Y 1.657 m; the turret rig moves from
Y 1.772 m to 1.792 m. Both physical overlaps remain 3 mm. No turret surface is
stretched, and all articulated fittings retain their turret-local coordinates.

The isolated branch first fast-forwarded to `39f897a5d` from main, preserving
the intervening national wheel standard, muzzle changes and fleet measurements.
Only the M1A3 row changes in the regenerated asset manifest. Evidence is in
`.qa-dev/abrams-upgrades/ring-refine/`: HIGH/LOW geometry and M1A3 concept
regressions pass; all six selected asset, framing, module, sealed-body and
barrel probes pass; type checking and the private production build pass.
Actual Garage and 90-degree Gallery turret views were visually inspected,
with no browser errors. The existing no-reference publication authorization
applies; missing comparison data is not represented as a passing source score.
Full anatomy regeneration and verification pass: 202 anatomy/marking receipts,
606 technical images, zero module failures/outside-envelope modules, and the
same 93 existing dimension warnings. The fresh M1A3 release attempt reports
zero track/sweep overlaps, zero unexpected holes and a passing equipment/sealed
check; its only unmet requirement remains the unavailable comparison reference.
The ring change retains the existing mesh tessellation, and regenerated hidden
interior fill uses one fewer box (62 instead of 63).

## Confirmed 50 mm target

The owner's unit clarification explicitly selects **50 mm (5 cm)** of visible
ring. Relative to `7c0160425`, the complete turret rises another 18 mm to rig
Y 1.810 m. A 56 mm bearing retains the same lower edge at Y 1.657 m and the
same 3 mm physical overlap with both the hull and turret. One shared visible
height value now drives both the turret offset and the bearing geometry.

Evidence is in `.qa-dev/abrams-upgrades/ring-height-target/`. HIGH/LOW geometry
regressions, all six selected asset/framing/module/sealed/barrel probes, type
checking and the private production build pass. Actual Garage and side views
were inspected, with six Gallery poses captured. Only the M1A3 asset-manifest
row changes; no wheel, muzzle, armor layout or per-frame behavior is changed.
Full anatomy regeneration and checking pass again: 202 anatomy/marking records,
606 current technical images and zero module failures/outside-envelope modules.
The same 93 pre-existing dimension warnings remain. The owner's existing
no-comparison-reference publication decision continues to apply to this
confirmed-height adjustment; no reference score or global threshold is changed.
