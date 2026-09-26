# IFV upgrades and additive replicas — 2026-09-25

Qualification boundaries: source comparisons for Puma S1 X and Type 89 X; approved photographic qualification for CV9040C X, whose numerical 3D comparison remains unverified.

The owner approved keeping the initial four improved designs on 2026-09-25: “we can keep the versions you have right now ... and then make x versions”. Preserve their saved IDs, equipment and game tuning. The earlier exact-replica decision now applies to separate X versions, not replacements.

| Existing upgraded ID | Separate replica ID | Approved target |
| --- | --- | --- |
| spz_puma_s1 | spz_puma_s1_x | German Puma S1, real 30 mm MK30-2/ABM, MG4 and twin MELLS |
| cv90 | cv90_x | Swedish CV9040C, Bofors 40 mm and Ksp 58C, no missile rack or roof RWS |
| cv90_mkiv | cv90_mkiv_x (already present) | Owner-supplied CV90 Mk IV, 50 mm and twin Spike LR |
| type89_light_tiger | type89_x | Japanese Type 89 IFV, KDE 35 mm and two Type 79 launchers |

The original upgrades are owner-approved fictional designs with independently authored hull and turret sections. They are not claimed as exact replicas. Replica dimensions and equipment follow the targets; damage/protection remain game abstractions. Source meshes remain local comparison inputs, never runtime assets. Existing `cv90_mkiv_x` is preserved rather than duplicated.

## Frozen intake

Local inputs are under `/Users/kevinliu/Downloads/Claude of Tanks Models/`:

- `spz_puma.glb`, SHA-256 `d6fb2ecb257513ea7bc9e3f5d2ecb32b0a6cbcd5013f6cb7029aa16b206a0f43`; source forward +X, Y up. Uniform length registration 7.6 / 146.06089456243296, proper Y rotation −90°. Model includes MELLS. S1-specific optical/radio changes require corroborating photos.
- `type_89_ifv_war_thunder.glb`, SHA-256 `14b1e191d166b621c0c271c35da2a7cd4a55212e63490ac6e1d42fc672d425aa`; source metres, +Z forward, Y up; ground correction +0.019990000873804783 m.
- `cv90_mk.iv_armored_warfare.glb`, SHA-256 `d310fed791778e966ca70454df5e02614fdef95fe1768920fd140e369baeec0c`; preserve the existing source-only registration in [CV90 Mk IV X](../tanks/cv90_mkiv_x.md).

The existing first-party Mk IV X reconstruction is unchanged. No reference is fitted to the original upgraded models. The approved original draft is backed up in `.qa-dev/ifv-identity/superseded-concept-r1.patch` (historical filename).

## Primary corroboration

- [PSM turret and VJTF configuration](https://www.psm-spz.de/technik/turmkonzept/): unmanned MK30-2/ABM, MG4, MELLS; S1 development follows VJTF 2023.
- [PSM upgrade programme](https://www.psm-spz.de/puma/upgrade-programme/).
- [Swedish Armed Forces magazine, September 2014, page 25](https://www.forsvarsmakten.se/siteassets/3-aktuellt/forsvarets-forum/2014/forsvarets-forum-nr4-2014-2.pdf): distinguishes 9040 A/B/C; C has extra armor, Bofors 40 mm, coaxial Ksp 58C and six Galix launchers. Overall length 7 m and width 3.38 m. Published 4.17 m height includes equipment; do not treat it as a roof datum.
- [JGSDF vehicle catalogue](https://www.mod.go.jp/gsdf/equipment/ve/): Type 89 IFV with 35 mm cannon and guided-missile launchers.
- [Supplied Mk IV publisher configuration](https://armoredwarfare.com/en/news/general/development-cv90-mkiv): 50 mm cannon and twin Spike-LR.

## Scope and release requirements

The three new replicas have source/photo view comparison, native HIGH/LOW articulation and stock checks, launcher-origin verification, actual Garage/carousel inspection, and regenerated anatomy/marking/asset records. The complete integrated release check is the final publication prerequisite. CV9040C has no registered local 3D oracle; photo evidence must not be represented as a numerical 3D comparison pass. Existing certified reference receipts cannot certify these new builds.

The camo/picker and fleet missile-origin batch landed on main as `ed4ab2204`; this IFV continuation adds to that commit. No shared dirty checkout is touched.

## Implementation review, first pass

- Separate lazy registrations are present for all three new IDs; the existing Mk IV X is unchanged. Original IDs and game equipment are preserved. First-party HIGH/LOW builds have different hull and turret geometry from their donors.
- Native articulation, real weapon calibers, launcher counts, crew layouts, and unchanged-original synchronization passed `src/vehicles/ifvReplicas.selftest.mjs`. A repeated metadata sync initially replaced finalized armor: fixed by retaining the replica's independent physical frame/anatomy when syncing combat tuning.
- Type 89 X's 180 mm side-to-side axle stagger exposed a folded short ground-course cell. Only moving its end arcs reversed one shoe and put its guide 72 mm below ground. The scoped `fitStaggeredGroundRun` construction option remaps the flat course to its real axle stations without lifting the chassis, thinning stock, or adding per-frame work. Actual near-shoe vertices now pass the ±4 mm floor bound at HIGH/LOW.
- First-pass X Gallery and Garage captures exist under `.qa-dev/ifv-identity`. Served version: `v1.0.0+g0293fb36a.dirty`. These show drafts before final source comparison and before carousel images were generated, not release certification.
- The first `puma-x-r1.png` was an empty pre-generation Gallery capture and is invalid. Files named `*-original-kept-garage.png` and `puma-x-garage-cache-return.png` are also invalid: F8 entered Studio during that capture attempt. They must not be used as proof of original-model or cache-return acceptance. Recapture using explicit phase, selected-ID and drawn-root checks.
- The primary [FMV CV9040C photograph](https://www.fmv.se/globalassets/bilder/nyheter/2023/stridsfordon-cv-90-foto-mats-carlsson-fm.jpg) was inspected through the browser. It supports the frontal applique, offset cannon and turret outline; one photograph cannot establish hidden surfaces or a numerical 3D comparison pass.

## Continuation and merged handoff

The owner's handoff of `fleet/ifv-identity-continue` (`f2ee3fd11`, snapshot
`3f30f2834`) was reviewed against this live worktree before integration. The
round-one ammunition names, census coverage and gameplay eras were retained.
CV9040C's two real Swedish APFSDS natures remain distinct. Type 89 X stays in
its donor's next-generation balance bracket; the original four IDs keep their
existing tuning. Borsuk and LRMV are next-generation designs; Dardo is modern.

The two independently authored Puma follow-ups were merged by feature: the
measured stern recess, blunt bow, forward cassette and skirt course from the
handoff; the source-measured paired mirrors, lower rear deck, raised local
access platform and MUSS housing from this worktree. Type 89's measured sight
housings and narrower skirt fasteners corrected the separate dimensional gate:
its fresh component minimum reached 93.7/92, with dimensions at 99.6. Before
the merged Puma follow-up, both source replicas passed the silhouette gate
(Puma 94.5, Type 89 95.1); those results do not certify subsequent edits.

All ten targets passed the complete final standard check, including the merged
Puma S1 X shape and Borsuk's repaired bore wall. All 22 wheel builds (ten changed
IDs plus the existing KF41 control, HIGH and LOW) passed their construction and
finish audit. Puma and Type 89 assets are regenerated; full release checks apply to the final
integrated commit before publication. Evidence is local under
`.qa-dev/ifv-identity`; the failed runs remain alongside their replacements.

## Combined continuation verification

The final merged Puma source shape passes the geometry gate at 93.5/92;
Type 89 X passes at 93.7/92. Both pass silhouette fidelity at 95.1 with every
required view above 92. The source registrations and comparison GLBs were not
changed to obtain these results. Evidence: `merged-physical-r7.log` and the
fresh per-ID geometry packets.

All ten vehicles are watertight with zero deep-interior leakage. Puma S1 X,
Type 89 X and Borsuk pass all 33 closure views and strict HIGH animated track
checks with zero band/shoe intersections. Finite wheel-stock probes also pass
HIGH/LOW at the actual axle coordinates; they supplement the construction
audit rather than treating its metadata as physical clearance proof.

The actual Garage carousel shows all ten correct attached vehicle roots, and
Puma S1 X returns correctly after cache eviction. Fresh six-view Gallery
captures are in the `r7b` set. Those captures identify the local dirty candidate;
they do not assert a production deployment. Final anatomy generation refreshed 198 records and 594 technical cards; Puma
and Type 89 icons were regenerated and aligned. Release checks remain a
requirement on the integrated commit before publication.

## Final physical review

The per-ID regeneration, strict track/skirt checks, fresh source geometry packets,
photo-reference records, 1280 px or larger native views, module alignment and
asset freshness requested in the handoff are complete. The final standard check
passed 10/10; the closure check passed all ten IDs across 33 views each.

The final muzzle probe exposed a sampling error for small-caliber weapons inside
wide brakes: it averaged the painted brake face into the dark aperture. The
probe now uses the same measured physical inner radius as its ray checks;
luminance thresholds, physical clearance and occlusion checks are unchanged.
Regression controls reject blocked, flat and missing apertures. Vehicle geometry
and source registrations did not change for this correction.

The corrected native muzzle probe passes all ten IFVs plus M1A2, BMP-2 and
KV-2 controls (13/13). All sampled centers read 16.9 luminance; thresholds and
physical ray checks remain unchanged. Evidence: `muzzle-caliber-final.log`.
