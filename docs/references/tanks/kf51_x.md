# KF51 X — independent owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**97.5414677515717**, minimum whole view **97.00196875371914**, and raw
geometry minimum **93.63909005678107**: [exact fidelity](kf51_x.fidelity.json),
[exact geometry](../../geometry-gate/kf51_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero. Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

`buildKF51X` in `src/vehicles/profiles/kf51X.ts` independently constructs
the Panther's hull, pointed turret cheeks, recessed gun well, cannon,
remote weapon and one native running-gear course. The previous KF51 is
unchanged; no source buffers or inherited family builder enter runtime.

## Provenance and canonical pose

The owner supplied `kf51-panther-woodland.zip`, SHA-256
`4ea24378f03f67b03ae68a86dd51dfece356e551fe71b96842bdb8adfb69bcec`.
[David Falke / GRIP420's original Maya model](https://sketchfab.com/3d-models/kf51-panther-woodland-4764a740867c4ea697df8011e7d5bf63)
claims CC-BY 4.0 and matches the existing verified 63,016-triangle source
record. The supplied FBX is a local comparison oracle only.

The FBX displays a −45° turret yaw and −5° gun pose. The QA converter
neutralizes those mesh transforms, rotates the world Y −90°, subtracts
`(0,.1375615597,4.5264759064)` and uniformly scales by
`7.70/77.9067192078`. Declaring turret and gun origins does not move world
vertices. The ignored result is
`public/models/community-candidates/kf51_x_source.glb`.

The final width is 3.5603123 m, hull length 7.700 m, overall 10.74975 m.
The structural roof crest is 2.5603 m; source P95 body height is 3.093 m;
antenna height is 5.7214742 m. Turret pivot `(0,1.4596,.5185)` and bore
axis `(0,1.85491175,1.3478)` are distinct. The provisional 2.0251 m bore
was actually the muzzle-reference optic and was explicitly corrected:
terminal tube Y 1.765712–1.944111 gives radius .0892 m.

## Source-fixed surface construction

Independent outer cheeks preserve the central gun-well opening. Their
foremost thin tips reach Z 3.16 m; the center well floor near Z 1.48 is
about Y 1.665 m, not a solid armor bridge at the adjacent roof height.
The stepped cannon shroud, constant-radius thermal jacket and exposed
130 mm tube use separate physical sections. The muzzle-reference fixture
has its own raised stepped housing and angled optical face. Source MG
and RWS housings are measured separately rather than enlarged to one box.

Seven road wheels per side are at Z `[-2.2118,-1.4265,-.6365,.1300,.8573,
1.5808,2.352]`, radius .328 m and axle Y .4323 m. Sprocket Z −2.9275/Y
.7982 and idler Z 3.1721/Y .7422 remain source-fixed. Native bottom-course
center .097 m puts the physical pads at ground zero without copying the
source's static tooth/tread overlap.

## Verification contract

The source has genuine Body, Turret, Gun, MG, Wheels and Treads ownership.
Its honest component masks remain enabled, each requiring 92 in every
registered view; whole-model overlap cannot waive a weak turret or gun.
Shaded source comparison is independently required. Focused tests probe
the true gun-well floor, outer cheeks, muzzle axis/radius, enclosed hull,
wheel instances and actual track contact. This packet is not acceptance.

The source forward left sight cover is a separate faceted hood reaching
Y 2.56150, not a raised solid cheek. Its recess floor is Y 2.17568;
the opening at X −.75/Y 2.40 remains empty forward of the actual back
wall Z 1.552. Separate side supports carry the thin hood underside at
Y 2.5331. The right hatch stays low at Y 2.51254 inside an L-shaped
periscope band whose separate cap is Y 2.649. CPU tests inspect these
actual surfaces in both LODs, including the empty aperture ray. They do
not replace the still-required visual component gate.

Round 6 (2026-09-05 23:17 UTC) passed the authoritative geometry minimum
92.6 and official standard checks with zero band/shoe/full-sweep overlap,
zero continuity holes and one real MG. Its stricter silhouette receipt
still failed turret left 91.94855 and right 91.73178 despite whole minimum
96.86. The forward sight/hatch correction above is subsequent work, not
retroactive approval of those failing component views.

The adjacent receipt and `docs/research/west-x-source-inventory.md` retain
the source-only measurements and reproducible local-oracle procedure.

## Scoped acceptance evidence — 2026-09-05 local date, round 7

The historical 2026-09-06 00:19:51 UTC row recorded:
aggregate 97.38 and minimum whole view 97.00. All five registered direct
turret views exceed 92: front 95.74, right 92.86, left 92.95, rear 96.19,
top 98.10. The registered hull views are at least 97.46; gun profile 96.66
and track profile 97.21 also pass. No rounding exemption is used.
Geometry minimum is 93.6: hull 93.6, whole 95.6, turret 94.3, stations 100,
dimensions 99.6 and attachment islands 100. The official `--gate` run
measured zero front/rear/full-sweep band and shoe intersections, zero
continuity holes and one real fitting-library MG.

Fresh neutral-clay inspection confirms the gun well between pointed cheeks,
separate left sight recess/hood, low hatch inside the raised right vision
band, sloping rear body, double-plane skirts, bowed whips and separated RWS
yokes. Legal gun pitch preserves the aperture and the actual gun-mount
connection; the MRS and barrel clamps remain recoil-owned. Smaller RWS
braces/optical bevels, fasteners and wheel/link sculpting remain simplified.
Expanded, non-gating oblique turret diagnostics still read approximately
90.8 front-left and 90.4 front-right; the five-view component gate is not
a claim that every optional angle exceeds 92. The complete board remains
available for independent review. Geometry was frozen at this checkpoint; final fleet anatomy and release
validation subsequently passed, including the later collar and ERA work.

## Final-pipeline normalization diagnosis and bounded collar refinement

The later composed run's lower gun score was reproduced without any source
change: two correctly seated marking planes increased visible width from the
structural 3.560312033 m to 3.564223584 m. Ordinary fidelity's former width fit
then scaled every candidate coordinate by 0.998902626653. The gun lost 57 mask
pixels (916 to 859), scoring 91.32857 rather than 96.66023. An isolated
counterfactual retaining visible markings but using the certified metre frame
restored the exact prior 916-pixel gun mask and 96.660227865 score, with direct
turret left/right 92.94728/92.87093. The reference gun stayed at 919 pixels.
This is a registration diagnosis, not permission to resize the physical tank
or hide its markings. Full diagnostic rows are retained locally under
`/private/tmp/cot-kf51-regression.YWIFjo/`; the composed pipeline owns final
receipts under the corrected, independently hash/datum-certified frame.

A separate source measurement found a genuinely undersized jacket collar:
the source occupies Z5.452418073..5.655017121 (202.599 mm), not the previous
85 mm band. Only this collar's radius, axial extent and center were corrected.
`kf51XGunFit.selftest.mjs` checks actual high/low assembled buffers, five
held-out collar rays, neighboring unchanged jacket/neck, and real recoil
ownership. The painted terminal tube's 20 mm allowance remains intentional:
the visible native muzzle rim reaches Z6.897353694, only 2.40 mm behind the
source endpoint Z6.899749978. The regression checks the complete assembled lip,
including its low-LOD merged geometry, rather than extending a solid cylinder
into or beyond it. This bounded change was included in fresh passing final anatomy/assets
and release evidence; the earlier round-7 checkpoint remains historical.

The collar-only profile SHA-256, before the subsequent ERA-role binding, is
`435ae558009bac6b276773cc57af4b0ea0699a3a993610ca9c57629de7fb2426`.
The deterministic all-mesh geometry fingerprints (ordered names/parent names,
world matrices, all sorted attributes, indices and instance matrices; seed
4242, geometry-receipt mode) are high
`c07b694b2c47a7fd8099a1aeb3819890d2410697318b3faf0b6a7b72f01986f5` and low
`64ed65ee42008127f9ed5fd0525a0624ebd97317d2e9b9f06bf4b7da9c1bc314`.

## Live ERA binding without source-shape changes

The two inherited `kf51_skirt_era_L/R` gameplay zones now bind the existing
closed outer skirt solids and their attached fasteners. Each side has one
outer course plus fourteen fastener/pin parts; the independent closed inner
hull, separate front guards, hanging flaps, lamps and rear fittings remain
permanent. The source silhouette and actual world triangle multiset are
unchanged by registration. Existing donor ERA resistance values are retained.

Collision faces reference actual outward triangles of the first-party loft,
not a single PCA rectangle spanning the curved skirt. That former fit would
have granted armor in open space below its raised forward hem. Fasteners
deplete with the course but carry no extra reactive hit face. The dedicated
`westXEraBinding.selftest.mjs` checks every fitted corner and center against
the real high/low mesh within 2 µm, actual surface-normal rays, opposite-side
preservation, unchanged closed backing and exact buffer restoration on reset.
Marking placement, regenerated armor receipts and final damage/release tests
passed in the full integration procedure.
