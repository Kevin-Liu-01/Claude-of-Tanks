# ZTZ-100 (`ztz100_x`) — reference packet (2026-09-17)

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


**Exact vehicle modeled:** the PLA's next-generation main battle tank as the owner supplied it — the Sketchfab
model "[OD]ZTZ-20 Test-3" by EXcaliburK117 (CC-BY-4.0), `Downloads/odztz-20_test-3.glb`, 50 unnamed material
meshes, 464 332 triangles, raw SHA-256 `387d8655…5da5d`. Owner: "add a new ztz100 tank … for the ztz100 use the glb
model and our best most up to date tank generation procedures based off of models"; "the ztz 100 should NOT be
based off of the type 100 at all. it needs to be completely separate following completely inspired generation".

## Procedure (the source-study pipeline)

1. **Quarantine + recipe.** `node tools/source-x-oracle.mjs --prepare=<glb> --recipe=<json>` baked the reviewed
   recipe (axes x,y,z — the glTF node matrices already give +Y up with the gun toward +z; uniform 0.92; translation
   (0, 0.00644, −0.12098)) into the ignored oracle `public/models/community-candidates/ztz100_x_source.glb`
   (SHA-256 `7eeb9852…758f1`, certified in `tools/source-world-registration.mjs`, comparison entry in
   `tools/second-wave-x-reference-overrides.ts`, ruler id in `tools/source-dimension-frame.mjs`). 0.92 puts the
   skirt planes at 3.70 m; the translation seats the lowest track vertex on y = 0 and centres the structural hull
   (stern plate … nose) on z = 0. The oracle never enters the runtime (`tank:native:check`).
2. **Metrology.** `.qa-dev/ztz100-source-study.mjs` (welded-vertex islands, 1 cm axis-aligned first-hit depth maps,
   roof/flank/front/rear profile tables) and `.qa-dev/ztz100-shaded.mjs` (normal-shaded orthographic elevations)
   produced the scalars in `docs/references/tanks/ztz100_x.source-measurements.json` — no mesh payload.
3. **Independent build.** `src/vehicles/profiles/ztz100X.ts` transcribes those scalars into `ZTZ100_X_DATUMS` and
   lays original primitives on the measured planes: one twelve-point hull loft (belly 0.35, sponson 1.08, fender
   1.30, roof 1.41, engine deck 1.50, 4.6° glacis to the nose line y 1.20 / z 3.56 over the stepped lower bow),
   two measured skirt bands with bolt rows and the forward sponson boxes, the glacis plate field, driver's hood,
   lamps and tow hooks, twin louvred deck grilles, the slatted deck rack, the full-width stern louvre and the
   0.70 m stern stowage bin inside its slat cage; seven road wheels on `KIT.buildRunningGear`; one ten-point turret loft (flanks ±1.50 to
   2.09, shelf 2.14, plateau 2.31, bustle ±0.91, wedge over the housing to z 1.13) with the trapezoid mantlet on
   the gun, two cylindrical sensor/launcher towers, the tall weapon station (fork, the fleet pintle machine-gun
   fitting as its gun, twin tubes, sight plate), the right-cheek missile bank, the left panoramic sight, hatches, smoke banks, rails and
   the 105 mm gun with its multi-baffle brake. The module imports only the shared kit, loft and lighting helpers;
   the receipt (`ztz100X.selftest.mjs`) pins that independence, the datums against the record, the part census,
   the running-gear receipt and the gun anchor.
4. **Gate.** `node tools/procedural-fidelity.mjs --ids=ztz100_x --check --board` rasterises the oracle and the build
   from nine cameras. Eight authoring passes, each read off `.qa-dev/ztz100-mask-diff.mjs` (true-axis XOR masks
   of the build against the oracle), took the aggregate from 90.9 to 93.4 with eight of nine views over the
   exemplar 92: whips → stub antennas, the stern reach to z −4.08, the raked lower stern and the stern tub taper,
   the roof falling to 2.05 at the housing, the narrow-lower-body / wide-pod turret section, the dense deck rack,
   the long pod bodies, the aft sponson boxes, the eight-bar slat cage around the stern and rear flanks, the
   measured skirt band spans. One side view sits at 91.9 (the concept model's bar cage and twin-tube fittings), so
   the comparison entry carries the fleet floor (90) like the KF51 X; the exemplar pass remains a follow-up.

## Combat record

`src/vehicles/chineseFrontlineSpecs.ts` `ztz100_x`: China, next-generation, MBT, tier X, 105 mm autoloaded gun
(4.8 s), hp 2600, 42 t, 1200 hp, 72 km/h; dims 6.94 / 8.98 / 3.70 / 2.31 (silhouette 3.04); turret pivot
(0, 1.41, −0.55), gun pivot (0, 0.35, 1.10), barrel 4.625 m to the measured muzzle z 5.175. Signature camo
`sig_ztz100_x` "ZTZ-100 Digital" (PLA digital woodland). Public name "ZTZ-100"; the former Type 100 build is now
the "Type 100 IFV" (`type100`).

## Release-gate fallout (2026-09-17 evening)

`tank-standard-check --gate` on the landing chain: the stern sponson floor (`sternTub` returned the sponson height
.78 behind the sprocket) put 56 voxels of hull in the rear track band → the tub alone narrows now; the top
silhouette read holes through the slat cage → a `cage-bin` body fills the cage; the hand-built weapon-station gun
counted as mg0 → the fleet `FITTINGS.pintleMG` (scale 1.15, seated so the fitting tops out at the measured 3.04 m —
a taller seat dropped the dims component to 40.8) is the station's gun. Fidelity after: 93.0 aggregate, worst view
91.6 (fleet floor 90); dims 99.5; clip 0/0, holes 0, mg1.


## Supplied-source batch continuation — 2026-09-18

Current changes are **draft, unqualified and unpublished**. The same raw source
was supplied in the batch, so its already-landed `ztz100_x` entry is retained
instead of introducing the duplicate `odztz20_x`. The existing canonical hash,
scale, translation and rig registration remain fixed. Qualification now requires
92 in every silhouette view and an independent 9/10 in all fourteen shaded views.
The preceding 90-floor result is historical, not sufficient for this procedure.

The integrated baseline scored 93.0 aggregate but failed that per-view floor.
The independent fourteen-view review found a filled stern cage, generic roof-gun
geometry, a round brake replacing a wide/flat slotted source brake, missing
angular gun shroud and other simplified equipment. Baseline originals are saved
under `.qa-dev/tank-run/ztz100-integrated-baseline`.

The current correction restores actual open cage bars, a measured open RWS fork
and visible source-specific receiver/barrel, an angular gun shroud, and flat
separated brake baffles around a genuinely recessed bore. The open cage is
classified as lattice equipment; no solid body is excluded to silence a hole.
The profile test now probes the real bore and the air between stern bars.
Further source-fit/detail, LOW/HIGH track/contact, anatomy and release checks
remain required. No final visual or performance pass is claimed.

## Bounded panoramic and smoke correction — 2026-09-18, r7

This correction remains **unqualified and unpublished**. Profile SHA-256
`cb8bbe8214c70e3ab6f055257598a59b5e52570d84d70be97efbd05dec7844f6`
was frozen at `2026-09-18T10:34:32.567Z`; the unchanged canonical source is
`7eeb985247a5a44bf4dcf6b573ac66d9fef1b0ce6ea42666d01bb1e85c8758f1`.
The r6 images and receipts remain archived under `.qa-dev/tank-run/root-r6`.

Connected source components and first-hit rays identify a low gimballed
panoramic assembly, not the previously authored tall drum. Its chamfered case
occupies y 2.18049–2.41033 m. The independent U-shaped saddle and two lateral
pivots follow the source support; five circular receivers have three different
lens sizes and distinct receiving planes. Native HIGH and LOW scene rays reach
the actual glass at all five centres, with no opaque receiver cap in front.
The neighboring RWS and fixed turret/gun parent datums remain unchanged.

Both smoke banks now place four mouths laterally at |x| 1.14714, 1.23454,
1.32194 and 1.40934 m, all at y 2.135509 / z −0.473386 m. Their common axis
is proportional to (0, 0.74048, 0.67208). Independent closed lathed stock
reproduces the measured body, two collars, end taper and opaque source cap.
An inherited turret shoulder initially buried the lower quadrant of the
innermost mouth. Source Object_14 measurements support a narrow receiving
relief; it now seats the tubes without moving their measured mouths or filling
source air. Every centre plus four offset face probes per mouth passes in
both HIGH and LOW builds.

The scalar record is `ztz100_x.source-measurements.json` under
`boundedPanoramicSmokeStudy20260918`. Full private measurements, failed early
receiving-seat diagnostics and immutable r7 receipts are under
`.qa-dev/tank-run/british-us-source/ztz-*`. These are analysis artifacts;
no source geometry or texture becomes a runtime asset.

The r7 checks report:

- Type checking and focused native geometry tests pass. Both strict LOW and
  HIGH track audits have zero front/rear/sweep intersections and no anomalies.
- At matched 10 m, selected HIGH geometry is 99,376 triangles / 46 objects;
  LOW is 69,594 / 45, or 70.03%. This is below the fixed 100,000 / 65 and
  75% limits before the pending refreshed interior-fill census.
- Nine-view source fidelity is **93.37 aggregate**, 93.24 whole / 93.96
  tracks. Per-view scores: front 93.88, front-left 93.55, left 92.22,
  rear-left 94.00, rear 92.49, rear-right 94.30, **right 91.83**,
  front-right 93.39, top 93.46. The right view fails the unchanged 92 floor.
- Consequently both strict standard checks fail qualification. The component
  receipts still record dimensions 99.5, floaters 100, continuity 0, MG 1 and
  zero track contacts. Those native results do not override the shape failure.

The aggregate improves from r6, but the corrected lower sight no longer
contributes the old silhouette. The remaining right-view residual needs
source-supported diagnosis; restoring incorrect sight height or changing the
fixed camera/gate would not qualify it. Fresh fourteen-view shaded review,
updated fills/anatomy/marking/technical receipts, loaded geometry/performance
checks and the complete release gate remain outstanding for this correction.

## Right-profile diagnosis and r9 freeze — 2026-09-18

The r7 failure above remains a historical receipt. Complete source side-envelope
slices identified unsupported generic antenna and met-mast stock above the
flat rear roof. Those pieces and their pots have been removed. r8 retained that
source correction but still failed the right view at 91.71; no failed receipt
was discarded or replaced by a relaxed threshold.

The remaining broad residual was the central raised roof ahead of the sight:
Object_14 receives a separate Object_20 cover, 0.6072 m wide and approximately
30.698 mm thick, sloping from y 2.203 to 2.087 over z 0.105–0.893 m. Independent
source rays constrain the underside, top plane, full width and chamfered plan.
The receiving loft now connects to the existing body and supports that cover.
The corrected panoramic/smoke assemblies, neighboring RWS, gun datums, flank
geometry and source registration remain fixed. Native HIGH/LOW scene rays at
three cover stations reproduce the source top within 1 mm.

Current frozen profile SHA-256 is
`e15952c631737ae7a3383894ec8384c26f6bc100b259f36982f858dd226f1b52`.
Type checking, the focused HIGH/LOW native test and all nine source views pass.
Fidelity is **93.63 aggregate / minimum 92.67**: front 94.00, front-left 93.64,
left 93.28, rear-left 94.04, rear 92.67, rear-right 94.38, right 93.09,
front-right 93.46 and top 93.46. The tool explicitly loaded the older modern2
interior-fill record in this preflight; the integrator must regenerate that
record for r9 and verify the loaded result. Evidence is preserved in
`.qa-dev/tank-run/british-us-source/ztz-detail-r9-*`; scalar roof diagnosis is in
`ztz-side-envelope-study.json` and the three `ztz-centre-cover-*` records there.

This is a geometry freeze for composed verification, **not publication or
independent visual approval**. The integrator owns regenerated modern2 fills,
final loaded geometry/track/standard/bore proofs, official14 review, remaining
performance checks, anatomy/marking/technical records and release checks.


## Actual loaded r9 audit — 2026-09-18

The first “loaded” audit found the old 252-box / 3,024-triangle record: the
integrator's `--stats` invocation calculated replacements without writing them.
That HIGH census **failed at 102,240 triangles** and is retained under
`ztz-detail-r9-loaded-*`; its images are `ztz100_x-r9-oldfill-shaded14`.
No candidate stock or budget was changed to hide this failure.

After the actual write, ZTZ loads **26 boxes / 312 triangles**. The final r9
receipts under `ztz-detail-r9-final-*` pass native HIGH/LOW tests (including
all panoramic and smoke face first hits, cover seating and recessed gun bore),
strict standard, exact LOW/HIGH track checks and type checking. Loaded selected
geometry is **99,528 HIGH / 69,746 LOW**, 48/47 objects, or **70.08%**. The
nine-view comparison is **93.52 aggregate / minimum 92.38**, with scores
front 93.93, front-left 93.73, left 92.74, rear-left 94.09, rear 92.61,
rear-right 94.43, right 92.38, front-right 93.45 and top 93.46.

The fresh fourteen-view original archive is
`.qa-dev/tank-run/british-us-source/ztz100_x-r9-final-shaded14` (capture identity
records source, camera, profile, materials, fill and PNG hashes). The author
actually viewed all fourteen originals. A subsequent unrelated modern2
sibling restoration changed that file's broad hash while leaving this exact
ZTZ record unchanged; the integrator owns that restoration record.

Independent parent inspection identified a remaining substantive rear bustle
louvre mismatch despite the numerical pass. This r9 geometry is therefore a
preserved measured baseline, **not final visual qualification**. The next
bounded step is source measurement of the two rear ventilation banks and
receiving surfaces; anatomy, performance and publication remain integrator work.


## r10 measured rear screen — 2026-09-18

Independent rear-view inspection prompted direct source geometry checks. The
visible broad assembly is an **open inclined stowage screen**, not a dense
solid-backed ventilation panel. Object_20's connected screen spans X ±.95865,
Y1.77954–2.15267 and Z−3.21141…−2.96220 m. Three bays have seven horizontal
rows each, rising 60.235 mm and advancing 36.141 mm in Z per row. Bars are
10.12 mm high and 32.36 mm deep; nine inclined vertical members divide the
bays. Source Object_34 remains the separate predominantly planar wall at
Z−2.60171. This distinguishes actual sparse stock from shading/texture cues.

The existing vertical hull rack is replaced, not duplicated. Two measured
folded trays reach the turret-side bins at Z−2.23139 / Y≈1.737 m; the rebuilt
rack follows the turret rig as open-lattice equipment. The unsupported five-bar
solid-backed panel on the wall is removed. No filled plate is introduced into
the source gap. The source registration, wheels, optics, smoke and gun remain
unchanged.

Profile SHA-256: `48419bbc65ccee456ac7f6ad904957b77f4c835df4dab7d1d049f8b0c7c4b26e`.
Focused native HIGH/LOW tests and type checking pass. Separate whole-scene
proofs hit all 21 source bar stations in both qualities and preserve open cells
through to the receiving wall. The actual refreshed fill record remains 26
boxes / 312 triangles. Final loaded source/cost/standard/clips/official14 audit
is running under `ztz-detail-r10-final-*`; r9 originals remain immutable in
`ztz100_x-r9-final-shaded14`. Scalar construction evidence is recorded under
`bustleRackStudy20260918` in the measurement packet.


Final loaded r10 audit completed with every command passing. Native full-scene
optics/smoke/cover/bore and rack probes, strict standard, exact HIGH/LOW track
sweeps and type checking pass. Selected 10 m geometry is **99,536 HIGH /
69,754 LOW**, 49/48 objects (**70.08%**); both budgets remain fixed and pass.
Source fidelity is **93.52 aggregate / minimum 92.39**. Per-view scores are
front 93.94, front-left 93.72, left 92.75, rear-left 94.09, rear 92.61,
rear-right 94.42, right 92.39, front-right 93.44 and top 93.46.

Fresh originals: `.qa-dev/tank-run/british-us-source/ztz100_x-final-shaded14`,
created **2026-09-18T11:38:44.338Z**. The identity has no input drift and hashes
all fourteen originals. The author actually opened all fourteen; the corrected
inclined open rack is visible, and the preserved optics/smoke/roof remain
coherent. Parent and independent reviewer received the archive for follow-up;
this author inspection does not itself confer independent visual approval.
No profile changes followed the captured `48419bbc…` freeze. Final anatomy,
shared performance and release/publication remain integrator responsibilities.
