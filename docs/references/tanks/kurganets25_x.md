# Kurganets-25 source study

## Current gun correction — 2026-09-21

This vehicle is already published. The owner-requested mantlet/autocannon
correction restores the receiver recess that the former roof loft covered.
The compact 57 mm source configuration, gun axis, muzzle, hull and running
gear are retained. See the [gun correction and verification record](../../history/research/kurganets-gun-mantlet-20260921.md).
Earlier draft/pending statements below describe their dated work rounds.

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Approved assembled-source correction — 2026-09-18

The owner approved the correctly assembled source target. Original raw and
canonical files and their failing receipts remain retained; the deterministic
assembly recipe and independent review are recorded in
[the source assembly record](../source-assemblies/README.md).
This supersedes the earlier pending-target statements below, not their evidence.
The active comparison source is `kurganets25_x_assembled_20260918.glb`, SHA-256
`417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793`.
Axes, scale, pivot, source camera, and the 92 floor are unchanged.

Source Object_29 has four distinct stepped roof fittings, rather than the
previous two generic whips and simplified post. Independent axial sections
establish their X/Z axes and respective top heights: (−.783995,−1.23913)/4.17415 m,
(−.638995,−2.84023)/4.11555 m, (−.019845,−2.66298)/3.93775 m, and
(−.292545,−1.22183)/3.69945 m. Sparse analytic lathe profiles reproduce the
measured stems/collars; source-scale receiver feet and the raised central roof
step connect the fittings. Thirty-six source side rays show flush outer armor,
so unsupported protruding bolts/boxes were removed instead of widening the target.

The fixed comparison now scores **95.89 aggregate / 94.50 minimum view**;
geometry components are whole curves 94.5, dimensions 98.4, floaters 100.
Source and candidate raster height and width match exactly. This is a shape
pass, not final release qualification. The native profile SHA-256 is
`1e1a80993eb7b218a2f058dbe30e02a6a5559524b499c17a3349fdbc072d8535`.

The source-detail fixture, new `kurganetsRoofFittings.selftest.mjs`, and typecheck
pass. HIGH/LOW strict bands and moving shoes have zero front, rear and sweep
overlaps; the physical/visible muzzle probe passes. All 19 running-gear meshes
retain exact HIGH/LOW geometry, attributes, instance matrices/colors and world
matrices. Selected 10 m census before the final fill refresh: 56,368 HIGH /
36,514 LOW triangles, 43/42 objects, with fill records loaded. Final generated
assets, refreshed costs, and independent 14-view review remain integrator work.

Original diagnostics, source sections, exact preservation, fixed masks and
reports are retained under `.qa-dev/tank-run/assembled-shape-repair/`, especially
`kurg-source-masts.json`, `kurg-width.json`, `kurg-r2-fidelity.json`,
`kurg-r2-geometry.json`, `gear-preservation.json`, and `track-{high,low}/`.



Status: draft, unqualified, unpublished. See [batch record](../batches/supplied-afv-20260917.md).

Raw `/Users/kevinliu/Downloads/kurganets-25_armored_warfare.glb`, SHA-256
`0af5ccde32d66d5f56cbf7b543e000f64fa28e18cc0eb560d92ed7b05e7f7fd2`,
47,627,960 bytes. Owner-supplied reference only; author/license not verified.
All 39 generic source mesh nodes retained. XYZ world coordinates, metres,
+Z bow. Uniform scale1; translation `[.0054349899291992,.0139,0]` centers
the source width and puts the actual tracks at ground. This does not raise
the complete export: defective disconnected hardware extends below ground.
Canonical oracle SHA-256
`a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0`.

Falsifiable form: tall flat rear passenger deck descending continuously into
a shallow bow; broad side buoyancy armor covers the upper portion of seven
small nonuniform wheels; a low unmanned turret carries paired flank canisters
and a raised rear launcher rack. Real rack and running-gear air stay open.

Measured source wheel centers Z: −2.3517, −1.6305, −.9202, −.1978,
.5168,1.2329,1.9595; radius.285, ground-frame Y.3612, X≈±1.405.
Front drive/end wheel Z2.8598,Y.9013,R.3481; rear Z−3.3018,Y.9458,R.2434.
Independent turret construction pivot `[0,2.21,-1.27]` is inferred, not a source
bone. Round2 corrected the gun datum from a guessed overlong gun to measured
`[-.004,2.917,-.68]`, muzzle world Z.857 (source Object31 cylinder extent).
The raw/canonical oracle did not change. Previous gun-frame receipts are stale.

Round1 aggregate84.8; the cylinder helper API was corrected first, then the
oversized turret/hull was reauthored from measured stations, wheels moved to
component-derived centers, and gun/rack equipment reconstructed. Round2
aggregate90.7, min85.9 rear; FAIL92. Current below-ground source target pending.
Normal neutral boards still show insufficient equipment detail. No visual
qualification, standard, armor/anatomy, switching or release pass claimed.

Regeneration commands and evidence live under `.qa-dev/tank-run/kurganets-odztz`.
Raw component datums are scalar authoring evidence, not imported topology.

## Rear receiver and deck-fan correction — 2026-09-18

The source Object23 rear receiver is Z−3.5586, ahead of the projecting rear
mudguards. The former hull end used the mudguard envelope and carried an
incorrect central grille. The procedural receiver now uses its own datum;
two outboard banks retain six upper and five lower folded blades at both
quality levels. The central ramp remains closed pending the owner's detached
source-door target; this is not approval to remove source parts from scoring.

Twelve deck tubes now retain the measured nearly horizontal radial axes,
~0.4043m length and 0.062m radius, with the source's small side-specific
height/yaw differences. Actual terminal-face rays, finite rear receiver
contact, exposed vent lips, recessed bank spacing and hull ownership pass
HIGH/LOW in `kurganetsSourceDetail.selftest.mjs`, including loaded fills.

Evidence: `.qa-dev/tank-run/kurganets-odztz/rear-fan-scalar-study.json`,
source-only louver calipers, and `.qa-dev/tank-run/postfill-root-r8`.
The source and registration are unchanged. Actual fill regeneration writes
four boxes (48 triangles); earlier `--stats` runs were measurements only.
Final source scoring and independent review remain separately required.

## Fittings detail10 — 2026-09-18

Added the independently measured Object23 stepped deck drum (closed center,
real 29.3 mm annular recess) and replaced the roof sight AABB with an analytic
rounded case, two receiver steps and a sloping front crown. The cap is split
at its crown crease so triangulation cannot cave in the flat rear roof. The
source front cover remains closed; internal receiver circles are not exposed
as invented holes. The fitted drum underside overlaps the native deck and is
explicitly authored closure, not a claimed source sheet thickness.

Calipers: `docs/history/research/kurganets-source-fitting-calipers-20260918.md`.
Actual native HIGH/LOW full-scene first-hit, groove, curvature, crown and closed
face regressions pass. Selected costs are 54,020/34,318 triangles, 40/39 objects.
Fresh14 originals and stable identities are under
`.qa-dev/tank-run/kurg-detail10-final`. Independent review remains separate.


## Source attachment repair — 2026-09-18

The native isolated region was the turret smoke bank, not the below-floor source hardware. Original gate-camera rays hit its four tubes at X≈−1.02…−1.26, Y2.67…2.775, Z−.10…+.44; yaw moved the island with the turret. Source `Object_29` instead carries two **paired** stations per side beneath the forward canisters. Left mouth centers are (−.964395,2.676650,−.141980), (−1.065745,2.681700,−.101430), (−1.409495,2.678000,−.443980), (−1.512045,2.677500,−.453230); right source differences are preserved separately. Source inspection measured the inclined paired case lengths and finite folded receiving stock, rather than adding a solid bridge through air. The source carrier crossmember at X≈±1.35,Y2.6906,Z−1.37463 has .4248×.2287×.0892 m stock and meets the narrow shoulder foot (Y2.65665,Z−1.37653). Corrected smoke cases, terminal caps, open receiving tray, narrow strap and canister carrier now use those measured stations. Native first-hit rays see the closed smoke caps; stock-interval probes prove the measured carrier/shoulder overlap. The hull-owned six-tube radial fans and all gear datums remain unchanged.

Frozen profile SHA256: `932bd2c49eee7d9e33ffb80e2a463ad445c513e666fdaf0790dcd37cfe7a44eb`. Canonical source remains `a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0`. Native focused fixture `src/vehicles/profiles/sourceStudyAttachmentSeats.selftest.mjs` passes HIGH and LOW; TypeScript and whitespace checks pass. Fresh geometry preflight now reports **floaters 100 / zero failures across all five poses**. The full raw geometry gate remains FAIL; no score threshold, oracle selection, camera registration or pending source decision changed.

Previous final visual receipts are superseded for these changed attachments. Final filled-path costs, strict clips, bore, standard subgates and 14-view independent review must reference the regenerated-fill capture that follows this freeze. Private immutable diagnosis and preflight receipts: `.qa-dev/tank-run/british-us-source/floater-diagnosis.json`, `floater-source-components.json`, `floater-source-datums.json`, `attachment-repair-freeze.json`, and `kurganets25_x-attachment-preflight-geometry.json`. Source observations precede the profile correction; source vertices were not copied into runtime geometry.


### Final regenerated-fill attachment verification

Fresh HIGH/LOW physical seating fixture: **PASS** after the shared actual fill/marking/anatomy/asset regeneration. Selected 10 m geometry census: HIGH **54,964 triangles / 40 objects**, LOW **35,230 triangles / 39 objects** (64.10% of HIGH); both rows explicitly report `interiorFillRecordLoaded:true`. The fixed 80,000-triangle / 85-object ceiling and LOW≤75% check pass.

Fresh official 14-view originals: `.qa-dev/tank-run/british-us-source/kurganets25_x-attachment-final14`. Capture completed `2026-09-18T13:06:19.501Z` with the same certified source-world registration and shared source camera. `identity.json` verifies all 14 image hashes, the actual loaded fill record, and unchanged profile/core/material/loader/tool/source files before versus after capture. Author specifically inspected `close-roof.png` for this attachment repair; that limited observation is not an independent all-view qualification. Independent 14-view review remains pending. Raw source-reference conflicts and failed full-source gate components remain unwaived.

Private shared cost receipt: `.qa-dev/tank-run/british-us-source/attachment-final-selected-geometry.json`; native log: `attachment-final-native.log`; capture/identity verification summary: `attachment-final-summary.json`. Root owns subsequent composed release checks and shared geometry-gate ledger writes.


## Gun cradle ownership repair — 2026-09-18

The existing main root block and offset coaxial receiver, barrel and cover now pitch without inheriting main-cannon recoil. The main tube, sleeve, inner bore and muzzle remain on the recoil owner. The source is a static study, so this is an explicit mechanical ownership correction supported by the actual receiving stock, not a claim that source animation or internal breech kinematics were recovered. No primitive dimensions, source registration, root/pivot, running gear, threshold or comparison target changed. Profile freeze: `38b058e3d00510c505c6fbdbf02d3298d7fbeafc1f3c523b2a685dea7f567302`.

The source-study mount helper preserves the original barrel material object, UV projection, weathering colors and factory disposal ownership. Kurganets coaxial stock and the Ajax sight remain visible through HIGH/LOW near/far/near LOD updates; their former temporary detail wrappers are removed completely. Dark stock is never duplicated.

Verification: `src/vehicles/profiles/sourceStudyGunCradles.selftest.mjs` passes for all six corrected profiles in HIGH and LOW. It probes actual measured housing planes and full-scene first-visible surfaces at minimum, neutral and maximum legal pitch, exercises real firing recoil, confirms positive physical tube/cradle cross-section overlap, detects the former wrong parent using the real stock, checks actual dark LOD visibility and observes exactly one disposal per migrated geometry. Type checking passes. The 12 neutral before/after fingerprints retain every visible world triangle, normal, UV, weathering color and material descriptor exactly; evidence is `.qa-dev/tank-run/gun-ownership/british-six-before.json` and `british-six-after.json`. These full-scene counts include unselected LOD geometry and are not substitutes for the selected runtime cost ceiling.

Earlier capture and assembly receipts remain historical. Root-owned regeneration, final filled verification and composed release must follow this new owner split. Existing raw-source comparison/target conflicts remain unchanged and unwaived.

Rendered replay also passes for all 12 HIGH/LOW cases using preserved pre-edit profile copies and real factory materials: `.qa-dev/tank-run/gun-ownership/british-rendered-parity.json`. World-face attributes and material/shader descriptors match exactly, and an already-live untouched Leclerc control remains unchanged. This additional check exercises the rendered path rather than relying only on geometry-receipt material stand-ins.


## Epokha weapon metadata reconciliation — 2026-09-18

The supplied Armored Warfare source depicts the short-gun Epokha configuration: 57 mm main weapon, four large Kornet flank canisters and an eight-tube raised rear Bulat rack. This matches the [publisher's configuration](https://armoredwarfare.com/en/news/general/development-kurganets-25), distinct from its earlier 30 mm turret. The authored opening remains 58.46 mm across; no source geometry, gear or frame was edited to correct the metadata.

The three playable channels are now 57 mm APFSDS, Kornet and Bulat. Ready counts are four and eight visible tubes, with no invented hidden reload stock. Bulat's nominal 70 mm, HE effect and borrowed guided motion are explicit game tuning, not measured hardware data or a thermobaric simulation. Its independent numbered selector, reload and inventory are covered alongside the complete fleet's actual authoritative guided launches. Full configuration sources, balance values and limits are recorded in the [runtime integration review](../../history/research/supplied-fleet-runtime-integration-review-20260918.md#supplied-weapon-configuration-cross-check). Final generated anatomy and release receipts must postdate this metadata correction.


## Folded bow and receiving hull — 2026-09-18

The independent final frontal review held the former smooth wedge at 8.7/10. Measured source stock now replaces that wedge: the broad folded skin, narrower lower tongue, hollow rolled return, separate beveled receiving armor and thin side arms/pivots. The front roof terminates at its own source datum and continues as a thin lip over real air. The two generic front flaps were forward of their actual source receiver and obscured the restored plate ends; their compound sheets are now seated to the measured hull. The rear flaps and external armor bays remain untouched.

The thick backing plates and roof continuation are structural hull geometry; trim and attachment hardware remain equipment. Source-only measurements, precise scope, original failed evidence, physical test method and remaining rendered acceptance are recorded in [the bow correction study](../../history/research/kurganets-bow-stock-correction-20260918.md). No source/camera/92-point qualification floor changed.

Cold HIGH/LOW before/after receipts prove unchanged primitive stock outside this repair, all aft hull triangles and actual wheel/track buffers/matrices. Loaded HIGH/LOW verification now passes after the scoped fill refresh (23 boxes / 276 triangles), including complete-scene source rays, 10 finite joints, retained real air, actual hull ownership and moving-shoe bounds. Visible counts are 59,334 / 38,752 triangles; all other fill groups and the loader remain byte-identical. Fresh independent fourteen-view/Garage acceptance remains required; the old frontal review remains superseded.

Final author-side freeze is recorded in `.qa-dev/tank-run/kurganets-final-bow/freeze.json`: profile `79710d6e…`, fill `b70b1cc2…`. New bow, existing rear-door, roof-fittings, source-detail and attachment-seat fixtures pass; type checking and strict profile metrics pass. The older rear-detail scalar was corrected against an independent assembled-source ray, retaining its 1 mm tolerance; exact pre-bow/current HIGH/LOW rays prove that adjustment is unrelated to the bow repair. Root-owned final source/track/bore gates, regenerated presentation and independent rendered acceptance remain required.

The subsequent [final bow review](../../history/research/kurganets-final-bow-independent-review-20260918.md)
accepted all fourteen fresh canonical views and both actual Garage views at
9/10, with the final profile and loaded fill identities authenticated.
The previous 8.7 hold and the pending-review statements above remain historical.
Final generated presentation, strict HIGH/LOW tracks and geometry budgets now
pass; complete release and publication status are tracked in the current batch
section linked at the top of this packet.
