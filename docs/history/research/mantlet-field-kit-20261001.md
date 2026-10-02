# Fourteen national roof packages, fitted mantlets and AMX 56 field equipment

## Owner scope and current state

The owner requested the same natural, filled gun-opening treatment accepted on
the three Leopards for all twelve current national T-72/T-80 modernizations,
then requested an AMX 56 side-armor/cage/equipment package inspired by the
AMX-10P 25. The owner also requested continuing the earlier work and publishing
it on `origin/main`. Existing national designs and the separate Hetman II and
Żubr II additions are retained. The owner subsequently confirmed fourteen national variants and requested distinct roof weapons, paired mantlet lamps, observation eyes/monocles and more roof equipment across all fourteen.

Implementation is local in `cot-ifv-identity-20260925`, branch
`codex/national-modernization-20261001`. Final qualification and publication are
pending. Earlier source/release failures remain recorded in the national pair
and Leopard packets; no earlier permission exception is represented as a pass.

## Mechanical changes

- Leopard 2A7V, 2A6M and displayed 2A5M (`leo2a4m_x`) have broad pitching
  shields and curved rear receivers within their existing 800 mm openings.
  The rear underside rises to clear the bearing at full elevation. An initial
  unchamfered draft intersected the ring and was rejected. Trunnions, barrels,
  muzzles and independent recoil remain unchanged.
- All twelve national modernizations receive fitted upper covers and finite
  curved receiver stock. Nose length, crown, bevel and service cover vary with
  each national turret. The shield leaves 9 mm beside each cheek; rear clearance
  is measured against actual moving/fixed meshes, including generated fill.
- The AMX 56 display name resolves to `leclerc_classic_x`; legacy `amx56` is
  Leclerc S1 and is untouched. The added package includes folded thick side
  modules joined to the existing fenders, lower open slat screens with end
  returns, four supported turret cargo baskets, an aft cage and strapped cases.
  Hull/gun/gear authoring is retained. The installed width, including fastener
  heads, is 4.125 m; original 3.6 m source datums remain separate and unchanged.
  This is an owner-directed original field package, not a historical claim.
- AMX 56 fill generation uses the closed primary bodies as its boundary,
  following the AMX-10P 25 policy. Exterior cage/cargo air is not interior volume.
  Physical and rendered audits still include every native mesh and fill.

## Evidence completed before final regeneration

- PASS: Leopard opening test, 810 air witnesses, 54 HIGH/LOW articulation poses,
  and 1,242 rear-clearance witnesses with regenerated fill loaded.
- PASS: all fourteen national registrations and HIGH/LOW physical fixtures,
  including fitted mantlets, actual rear receiver clearance, permanent skirt
  stock/joins, roof contact, full turret sweep, modules and remote weapons.
- PASS: national preservation probe; original hull, external hull armor,
  gun tube, road-wheel tires and track pads are byte-identical in HIGH/LOW.
  Hetman II and Żubr II primary turret and mantlet are also byte-identical.
- PASS: AMX 56 HIGH/LOW checks of retained source surfaces, cage air including fill, 24-position turret sweep, gun ownership, bore and 48-phase running gear contact.
- PASS: primary-body fill policy regression. Restricted regeneration adds ten boxes / 120 triangles; raw residual remains 0.8 L and is not described as zero. Rendered sealed-hull qualification remains a separate check.
- PASS: Leopard unchanged-body preservation in HIGH/LOW, including 2A5/2A6 controls.
- PASS: type checking after the AMX field-kit implementation; changed helper complexity audit (33 functions, zero violations, zero `any`/`unknown`); attribution audit (219 playables).
- Initial AMX source-roof fixture stopped because the new case obscures its
  former first-surface witness. The source roof remains checked underneath
  the mounting pallet; its original expected coordinate/tolerance is retained.

The first final capture attempt failed with `ERR_CONNECTION_REFUSED` after the local preview server stopped. Restarted Vite on the same port; all 128 final Garage captures then completed successfully. That infrastructure failure is retained separately. Three wider AMX side/rear captures followed after the independent critic correctly identified cropped cage coverage. Root and the independent critic inspected all three: lower cage, end returns and bustle supports are now covered, with no observed track or rear-deck clipping.

Logs and exact commands are in `.qa-dev/mantlet-final/`. Failed attempts remain
under their attempt-specific names. Final native Garage views use
`.qa-dev/leopard-mantlets-fit/{final,national-final,amx56-final}/`; review page
`.qa-dev/mantlet-final/review.html`. Captures use actual pedestal construction,
1280 × 900 rendering, yaw and pitch poses. A served application-version is a
server-startup identifier, not proof of the later HMR source or a deployment.

## Recovered comparison inputs

Exact ignored comparison-only files were recovered from older local worktrees.
None are staged or admitted to the playable loading path.

| ID | SHA-256 |
| --- | --- |
| `leo2a7v_x` | `8cf3935defb761e0b6b02299d7c2af8648a949ee5733c8851f14525c5e2c9611` |
| `leo2a6m_x` | `4f801ac2546229397307a77507c0658c44757a00cde970c871805e84068e2c30` |
| `leo2a4m_x` | `59771994cef5162da9984892dac5f2142f91a6e1f887d87531176a692779e31b` |
| `leclerc_classic_x` | `e1a3fa18589075da9fbe0bd19fb504ca1e3d579eae52b926c1d73a43e432e4f0` |

Leopard accessor bounds match their archived source measurements within 11 μm.
Recovery closes the missing-file blocker, not the numerical comparison itself.
The AMX file matches its original reference packet hash. The new field kit is
not added to or disguised in any reference file.

## Fourteen roof loadouts

The eight 12.7 mm heavy machine guns and six 30 mm cannon stations have explicit
per-ID construction: open forks, protected side shields, tapered housings or
round receiver/drum assemblies, with different feeds, sights and dimensions.
Yaw supports and pitch stock remain separate; the actual mouth, trunnion and
caliber regenerate into the authoritative auxiliary inventory. Every variant
receives two guarded working lamps beside the mantlet and its own observation
and roof equipment layout. Permanent bodywork supports the lights and optics;
removable ERA is excluded from seating. Existing hatch positions are retained.

Pure height datums and original-concept packets reflect the measured taller
stations. No dimension tolerance, source score or failure status was relaxed.
Only the fourteen owned control-inventory rows changed.

Physical review caught real fork/feed interference and disconnected drum sights;
these were repaired with wider bearing spacing, a lower crossmember, supported
feeds and receiver-contacting sight feet. Lens and lamp guard connections were
also given finite overlap. The final new regression samples all unique vertices
and triangle centroids, checks 36 yaw positions and all three runtime pitch
extremes in HIGH/LOW, probes support-volume intersections, verifies a continuous
sight foot, and checks actual recessed bores, metal rims and working lamps.
It passed for all fourteen. The 33-vehicle remote-gun regression (fourteen new
stations plus the existing nineteen controls) also passed actual target
acquisition, cartridge/caliber, independent main reload and authority/rendered
muzzle parity.

All 140 fresh roof captures completed (fourteen vehicles × ten views). The root
reviewed the labelled quarter/top comparisons and full-size additional-tank
views; the independent critic inspected all 140 views plus eight full-size
vulnerable sight/drum details. No new floating stock or visible captured-pose
intersection was found. Different combinations remain recognizable as sharing
four mount families. The existing deep primary-mantlet recess on Żubr II is
retained; it is outside the twelve newer mantlet replacements. Top-view glare
is covered by the quarter, side and left views. Static frames qualify the
observed poses, not continuous mechanical motion.

Current visual evidence is 175 views: 140 new national roofs, 24 Leopards, and
11 AMX field-kit views. The older 96 national roof screenshots are historical,
not final evidence. `national-roofs/source-sha256.json` records the exact roof
source and auxiliary inventory hashes at capture start. The final changed-helper
complexity audit covers six files / 42 functions: zero violations and zero
explicit `any` or `unknown`. The 14-step final regeneration completed successfully: control inventory,
HIGH/LOW roof regression, 33-vehicle firing controls, all 219 anatomy/marking
receipts and 657 technical diagrams, 18-vehicle centering/icons, full anatomy
check, 18 module-visual alignments, 18 bores/circular sections, current assets,
sealed ledger, type checking and the public production build. All 1,916 authored
modules and 438 track sides pass the all-fleet hit probe; 111 existing/design
envelope drift warnings remain explicitly reported. Only the eighteen owned
icon-manifest entries and their generated images changed. Sealing passes the
existing ledger (zero open *views*, not a claim of zero raw pixels on every
vehicle). The integrated release and cold/warm Garage performance results are recorded
below; neither implies that publication has occurred.


## Final release comparison attempt

The required eighteen-ID release was attempted with the results below. Its forced geometry phase
passes all three Leopards: minimums 92.7 (2A7V), 93.7 (2A6M), 92.8 (2A5M),
against unchanged 92 floors. AMX 56 fails: minimum 0/92, hull 73.2, whole 64.9,
turret 66.7, station and dimension scores 0. Its actual installed cage/fastener
width is 4.125 m against the unchanged 3.600000143 m reference (14.5833% wider).
Physical height and total length remain effectively unchanged. The prior
committed AMX receipt was 93.8; that archived result is not a fresh baseline
rerun. The new field equipment is an intentional departure but does not turn
the failed reference measurement into a pass. Because the forced source phase
stops before the fourteen concept checks, a separate seventeen-ID standard run
continues the national and Leopard physical/track/continuity qualification.

The first Garage performance run completed 17 cold, 14 rebuild and 7 valid warm
switches. One extra row repeated the already-selected Żubr II immediately; the
hero was visible after 4.5 ms but no switch-path event existed, and the maintained
probe correctly rejected that no-op as an invalid switch row. The failed run is
retained as `attempt1-garage-performance.*`. A corrected sequence removes only
adjacent duplicate selections and reruns against the same frozen production
build, 1440×900, desktop, CPU 1×, 2500 ms dwell, and unchanged warm-switch budget.
No runtime behavior or benchmark threshold was changed to address that failure.


## Final Garage switching result

The corrected production-preview sequence passes all 39 real switches: 17 cold
(including three retained control tanks), 14 rebuilds and 8 warm-cache returns.
Painted p95 was 174.2 ms cold, 193.0 ms rebuild and 48.1 ms warm. Warm reveal
p95 was 8.8 ms. This is the desktop CPU 1× result on Chrome 151 at 1440×900; it
is not a mobile or thermally constrained-device claim. The original invalid
no-op row remains archived and no thresholds were loosened.

A fresh fetch still resolves `origin/main` to `24c5c5b039dded1efa1fc8cf0aae5e554e7b83a4`;
the branch has three owned commits above it and no missing upstream commits.
This is an ancestry check, not publication confirmation. The final release
sealing rerun also passes all eighteen against the unchanged ledger.


The integrated eighteen-ID release completed with status 1, retaining two
AMX 56 source-comparison failures. The unchanged fidelity floor is 92: its
overall score is 93.37, but front 87.92, rear 89.35 and top 87.49, plus several
hull/turret component views, remain below the floor. All three Leopards pass
fidelity (94.41, 94.72, 95.49). The neutral comparison board at
`shots/procedural-fidelity/boards/leclerc_classic_x-neutral.png` visibly shows
the requested extra side armor, cage and turret baskets against the original
stock model; these additions explain substantial silhouette differences, not
a false claim that the stock geometry gate passed. The root inspected it.
The separate AMX strict track report has zero front, rear and full-sweep overlap
for both bands and shoes. Its final continuity and equipment report also passes (zero unexpected holes and one verified roof weapon).

The remaining release probes now pass: read-only centering, duplicate-track
audit and `npm run build:private`. The full-suite run freshly passes all 219
demand-loaded profiles, national HIGH/LOW roof checks, remote-gun firing and
main-reload independence, and all fourteen national physical fixtures. Its
remaining fleet assertions are still running.


## Completed standard checks and damage-registration correction

The separate strict seventeen-ID run passes every national variant and all
three Leopards: zero front/rear/full-sweep band or shoe overlap, zero unexpected
continuity openings and verified roof equipment. It includes both Hetman II and
Żubr II. AMX 56 independently passes those physical checks while its two stock
source comparisons remain failed. Evidence: `standard17.log`, `standard17/`,
`standard-amx.log`, and `standard-amx/`.

The broad regression run caught an introduced AMX armor-registration error in
`sourceXAuxArmorOptimization.selftest.mjs`. Raising installed width from 3.6 to
4.125 m had also expanded the inherited track screen plates and conservative
bounding radius. Actual tracks did not move. `armorFitDimensions` now fits the
retained hull/running gear in the original structural width in both initial
registration and donor synchronization; the installed width stays 4.125 m.
A serialized comparison against committed HEAD `4d5faa3d7` now preserves all
seven tested armor objects byte for byte, excluding the test's existing derived
traceBounds exclusion. No checksum, threshold or test assertion was changed.
The exact original optimization regression and full anatomy update/check chain
are rerunning after this correction. The earlier failing full-suite row remains
recorded, not silently removed.

The historical marking fixture initially counted the fourteen new national
anchors as members of its original fleet (155 versus 141). Its historical count
and digest remain unchanged; the twelve concepts and two successors are now
explicit additions, with a positive presence check for each. The historical 141-record count/digest and fourteen new-anchor presence
checks pass. The complete marking fixture still fails later assertions on
older vehicles; these are recorded separately in `national-marking-fixture.log`.
The original seven-object armor optimization fixture passes all 15,975 actual
full-result controls in the post-correction run.

Other early failures were compared against the actual clean-main logs in
`/Users/kevinliu/.codex/worktrees/national-release-baseline/claude-of-tanks/`
at `24c5c5b039dded1efa1fc8cf0aae5e554e7b83a4`. The local report
`baseline-assertion-comparison.json` preserves each assertion text/value rather
than treating matching file names as proof. The Mk10 service-frame assertion
still fails its older immutable source hash; this pass adds the optional glass
slot to `sourceMachineGun.ts`, so the reported actual text hash changes again.
An independent replay of the HEAD helper verifies exact native geometry, index
buffers, material colors, ownership, world transforms and fitting metadata in
all sixteen existing dark/detail cases (station/plain, yaw/pitch, rotated/plain).
No source hash was repinned. Receipt: `source-gun-compatibility.json`. This
compatibility proof does not represent the failing historical fixture as green.

Replaying the adjusted marking test against the isolated `4d5faa3d7` source
snapshot reproduces the same two T-62MV-1 X failures (two actual marking kinds
where three were expected). Both candidate and snapshot retain the original
141-anchor checksum. The candidate AMX 56 passes all actual footprint, nine-ray
visibility, ERA state and owner-pose assertions in HIGH/LOW. Evidence:
`national-marking-baseline.log`, `national-marking-fixture.log`, and
`national-marking-baseline-comparison.json`.

The owner was asked for a specific AMX stock-comparison publication exception
after the physical checks and neutral comparison board were ready. No response
has been received yet; the request itself is not authorization.


## Integration checkpoint

The post-correction armor/anatomy chain completed successfully: original armor
optimization regression, AMX HIGH/LOW physical fixture, all-fleet anatomy and
marking-seat update/checks, 657 regenerated technical diagrams, all-fleet module
hit checks, type checking and both public/private builds. Receipt:
`amx-armor-final-results.json`, first row status 0.

Before publication, a fresh fetch found nine new main commits at `5140ba9ca`,
including shared vehicle/roof-weapon handling and regenerated fleet assets.
The older-base full suite and queued AMX release rerun were deliberately stopped
for rebase; these interrupted runs are not qualification. Their logs and failure
comparisons remain retained. Validation must continue on the combined tree.


## Rebased integration — 2026-10-02

The four local commits were rebased onto `5140ba9ca36ca4b13eea05569245c9113552ad18`. The candidate is `fd6254bdea95ee4accb55d5949146ff0ceceff06` before this regenerated-receipt commit. Upstream smoke socket registration and damageable roof-weapon behavior were preserved. Conflicted generated maps were merged per owned vehicle, then regenerated from the combined tree.

Fresh combined-tree results are in `.qa-dev/mantlet-final/rebased/results.json` and `regeneration-and-physical.log`. The regeneration/physical chain completed with exit 0 at 2026-10-02T10:38:32.164Z:

- All 14 HIGH/LOW roof sweeps, 33 remote-weapon rigs/firing origins, national geometry and both legacy registrations passed.
- Leopard openings passed 810 air, 54 articulation and 1,242 rear-clearance witnesses. AMX 56 HIGH/LOW physical checks passed.
- Updated upstream seven-vehicle armor preservation fixture passed 15,975 full-result controls. Main-gun ammunition/reload checks passed.
- Controls, anatomy, marking seats, all 657 technical diagrams, 18 centering records and the 18 complete image sets were regenerated.
- Anatomy/marking freshness and assets passed for all 219 vehicles. Module probe: 1,976 modules, 438 track sides, zero failures/out-of-envelope modules; 111 dimension-envelope warnings remain recorded.
- Targeted module alignment, muzzle bore, barrel circularity, asset freshness, duplicate-track and sealing checks passed.
- Type checking and both public/private production builds passed.
- Generated control inventories outside the owned set remain exact to main.

The stricter source/standard release chain and broader regression run remain pending at this checkpoint. AMX 56 still requires the requested owner exception for its intentionally widened stock-source comparison; no approval has been received and no publication is claimed. Pre-rebase pictures remain available, and fresh combined-build quarter views of all fourteen national tanks are queued.
