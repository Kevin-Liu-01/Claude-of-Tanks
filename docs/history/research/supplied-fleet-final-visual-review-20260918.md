# Supplied fleet final visual review — 2026-09-18

**Scoped visual acceptance: 13 vehicles, 182 canonical comparison images and 26 actual Garage images.** All 208 image hashes match their acquisition and independent-review records. Every vehicle has fourteen accepted source/native views and two accepted Garage views. The recorded canonical scores meet the existing 9/10 bar. This document reconciles existing independent reviews; it does not claim another image inspection or override the authorship disclosures in those reviews.

Full release qualification was running when this record was written. **Release, performance and publication are not certified here.**

| Vehicle ID | Accepted independent record |
|---|---|
| `kurganets25_x` | [Corrected bow, final14 + Garage2](kurganets-final-bow-independent-review-20260918.md) |
| `ztz100_x` | [Regenerated assembled views](final-regenerated-assembled-visual-review-20260918.md), [Garage](final-garage-shadow-independent-review-20260918.md) |
| `fv510_milan_x` | [Approved assembled target](final-approved-targets-independent-review-20260918.md) |
| `griffin50_x` | [Final BMP/Griffin review — Griffin scope](final-bmp-griffin-independent-review-20260918.md) |
| `ajax_x` | [Regenerated fender and Garage review](final-fenders-independent-review-20260918.md) |
| `aft10_x` | [Regenerated assembled views](final-regenerated-assembled-visual-review-20260918.md), [Garage](final-garage-shadow-independent-review-20260918.md) |
| `bmp3m_dragun125_x` | [Final corrections and Garage review](final-corrections-independent-review-20260918.md) |
| `k21_x` | [Final corrections and Garage review](k21-final-corrections-review-20260918.md) |
| `type96b_x` | [Final assembled review](type96-k21-final-assembled-review-20260918.md), [Garage](final-garage-shadow-independent-review-20260918.md) |
| `kf41_lynx_x` | [Regenerated assembled views](final-regenerated-assembled-visual-review-20260918.md), [Garage](final-garage-shadow-independent-review-20260918.md) |
| `cv90_mkiv_x` | [Final filled 50 mm configuration](final-corrections-independent-review-20260918.md#cv90-mkiv--final-filled-50-mm-configuration) |
| `cv90105_tml_x` | [Regenerated assembled views](final-regenerated-assembled-visual-review-20260918.md), [Garage](final-garage-shadow-independent-review-20260918.md) |
| `sabra_mk2_x` | [Regenerated fender and Garage review](final-fenders-independent-review-20260918.md) |

## Connection to current code

The final snapshot uses main commit `12b5dc936b7cfcb78c79fd1f54c3b33c6c971a61`. Its change since `88592876` adds the Merkava 3D cheek module only inside `buildMerkava3DX`, with its test and packet. Static inspection found no change to a supplied-cohort builder or shared renderer from that integration.

The later integration of `31d08f673` preserves that original capture identity.
Its six upstream changed paths contain only the Merkava permanent-cheek role,
its historical/geometry tests, and the capture-queue correction with its test.
The required full anatomy refresh then changed only the Merkava anatomy group,
its armor diagram and the shared asset manifest. All **87 selected input checks
and 208 reviewed image checks remain exact**, with zero mismatches. The
integration bridge is recorded in
`.qa-dev/tank-run/final-corrections/qualification-r2/integration-bridge.json`,
SHA-256 `edac6071b564f01615f94f3863811530b8a34e9a8db9b68a4ef565e01844a6c5`.
This verifies preservation across integration; it is not another image review
or a replacement for the fresh composed release.

The preceding twelve accepted vehicles retain exact selected profile, fill, marking, material and source identities from the prior closure. Earlier profile refactors remain connected through complete HIGH/LOW native geometry, material, texture, rig, ordering and shadow-payload equality. AFT and Type96 source versions were additionally authenticated by replaying their saved refactoring steps in memory and reproducing the current files exactly. See [readability evidence](supplied-fleet-readability-20260918.md).

The shared-core chain retains its 26-build neutral-equivalence receipt plus the separate [missing-wheel relay review](tml-missing-wheel-relay-independent-review-20260918.md). Neutral equality is not motion proof. The later projecting-bore verifier preserves the older nine vehicles’ HIGH/LOW results; CV90’s changed 50 mm bore has fresh reviewed images.

After full anatomy regeneration, the older twelve selected fill/marking/material/source files remain exact. The changed Kurg profile, anatomy, fill and markings match its fresh canonical and Garage capture identities. Shared generated asset-framing records are not claimed byte-identical: ordinary runtime centering uses gear/contact, and canonical comparisons retain the certified source frame. Kurg’s corrected bow passes all sixteen final images at 9/10; its prior 8.7 failure remains preserved.

## Additive roster integration — 2026-09-19

The comparison from checkpoint `547457932` to combined candidate `98c53a671`
retains all thirteen models' native appearance. The 52-build replay compares
26 HIGH/LOW pairs and finds identical visible buffers, instance counts,
materials/textures and rig data with fills loaded. All 208 original image
hashes still match. Selected anatomy, fill, marking, source-frame and
presentation records also match; Object 695 and other additions account for
the changed shared-file hashes. No additional image inspection is claimed.

The receipt is
`.qa-dev/tank-run/post-merge-root13-preservation/selected-visual-preservation-bridge.json`,
SHA-256 `1a163ca23b47f7f9b581b4ad54faa1f99b6dcea79adc950bbcb20a86ee96ff14`.
Its before/after acquisition inventory covers 2,842 runtime/tool files with
zero drift during the comparison. Later Israeli/Ares geometry commits remain
outside this receipt's exact candidate identity until separately bridged.

Sabra intentionally follows the Merkava 3D gun's Tier-IX gameplay tuning,
within the requested Israeli fleet rebalance: reload 5.9 → 6.2 s, accuracy
0.28 → 0.29, aim time 1.6 → 1.7 s, and the explicit shell balance changes
listed in the receipt. Those thirteen gameplay fields changed; the comparison
does not describe all gameplay as unchanged. Sabra's native visual result
remains exact.

The subsequent bounded merge bridge from `46f2a3a4d` to `c61db17e3` preserves
85 selected input files, all 226 accepted root-thirteen/Ares image hashes and
19 recorded source hashes. Selected generated records and source frames match.
Five inherited launcher-count metadata additions are isolated; source-specific
corrections to those declarations are recorded separately in `dd4cb5e6f`. The upstream
BMPT load/reload rebalance falls outside these fourteen models.

The night runtime remains lazy and inactive in the recorded daytime Garage
path: day preparation returns before import, Garage entry resets it, and frame
updates require prepared night battle presentation. Focused access/runtime
checks pass. This preserves the scope of the existing day images and makes no
new night-image or performance claim. The exact receipt is
`.qa-dev/tank-run/merge-c61-selected-visual/integration-bridge.json`, SHA-256
`5638d56e5da8ab4712a8758fb79557e27000e80fb6c9e29e0b68e1302807f51d`.
That follow-up changes exactly four metadata fields against the merged
227-record registry: AFT 0 → 8, CV90 Mk.IV 4 → 2, Kurganets Kornet 2 → 4,
and its previously undeclared Bulat count → 8. Ammunition quantities, reloads,
other tuning and geometry remain equal. Five focused contract tests pass;
the receipt is under
`.qa-dev/tank-run/final-corrections/integration/guided-tubes/summary.json`.
Final Israeli integration and full regeneration still require their final bridge.

## Receipt and limits

The regenerable private aggregate is [final-13-visual-closure.json](../../.qa-dev/tank-run/final-corrections/visual-closure-final13/final-13-visual-closure.json), SHA-256 `8d91b4ecc8065492bc02352407ac8d6770034d1bb9e69b69d3a4c65749c9cb92`. It lists every image, independent record, capture identity and bridge. The [ready marker](../../.qa-dev/tank-run/final-corrections/qualification/visual-review-ready.json) is SHA-256 `4696aaf8e13271bd8fd8fc253a141c7278a753c4321fa26bfdd2a182e6968aef`. The earlier twelve-vehicle HOLD map is unchanged (`4758337859b932384cce83559e75f39a6d3f5fbb8f05f8cf9d0e07774df3d871`). Ignored QA files are local evidence, not shipped assets; the linked research records preserve the findings.

Canonical views use HIGH graphics and do not enable shadow maps. Garage evidence uses the normal UI/renderer through Vite and covers two frontal quarters per vehicle. It does not qualify rear/underside shadows, night, battle, LOW rendering, articulated suspension, frame rate or a production bundle. The oldest Garage receipt predates the explicit fill-readiness flag; no retrospective flag is invented. Later captures explicitly record loaded fills. Source topology, textures and every small fastener are not reproduced exactly. Numerical source fit, finite seating, gameplay, full-suite, build and performance checks remain separate gates.
