# Abrams source X — frozen R4 visual review

## Verdict

**Visual fidelity remains below the requested9/10 floor in all14 views.** The scores below range from8.5 to8.9. This is substantially closer than the earlier drafts, but neither the focused CPU passes nor a96.5 aggregate outline score establishes exact appearance or release readiness.

All14 actual source/native pairs were opened at their original1280×706 size, followed by the2520×3496 equal-neutral-clay board. This review does not prescribe another small-accessory implementation cycle. The most consequential remaining confirmed difference is the documented mechanical track/drive interface, not missing tiny bolts. Roof hatch/coaming and upper weapon relief also retain visible medium-form simplifications.

The reviewer previously authored the Drive, CROWS and LoaderShields helpers. This is a full-scene review rather than an isolated-test approval, but it is not a substitute for root's independent inspection of those components. The `improve-threejs` workflow guided the distinction between visible geometry, materials, physical evidence and capture limitations. No runtime, source, camera, score policy or generated asset was edited, and no new browser/GPU job was launched.

## Frozen evidence and camera integrity

The inspected capture is `m1a2_sepv2_x`, source left and native right, quality`high`, camouflage seed4242. The report's actual `generatedAt` is **2026-09-07T14:03:32.830Z**;14:03:32.962Z is the visual phase completion time, not the report timestamp.

Before review, all14 pairs, the neutral board, the exact visual/fidelity/geometry reports and root checkpoint receipt were copied into the unique ignored directory **`.qa-dev/reports/abrams-visual-r4-review-A0aFDH`**. Its `receipt.json` was written at14:05:53.625Z and records every original path, preserved path, byte size, PNG dimensions and full SHA-256. Receipt SHA-256: `d29206f08f4513eeff313755aefd14ee43733737dd531217deeec1cb73fa3aa6`. These preserved bytes, not later same-path captures, are the authority for this review.

- Visual report SHA-256: `4076618b073614597849d2cd567ac0c6d72b4b92a97598f8fdcf0d2da40410a0`.
- Neutral board SHA-256: `3afd78816d4efb6711e392fcf407f282cb2990a54b02b63e24c0664bf6572dea`.
- Fidelity report SHA-256: `a3623e31e6d759640b0dcd9b4421d6b5e51804ddf3b6e311060a1a901c7d649d`.
- Geometry report SHA-256: `93454236dc74ad770673a82431e503e8437ce2a404e5e23d8b75db04ff53fe65`.
- Root checkpoint receipt SHA-256: `a4d7c80b3211fa9683bf003971d8800c17f4ad83b473224d34f241bef84ed918`.

The canonical GLB's actual bytes still hash to `7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`, matching the configured source-world certificate. The source transform remains `[-rawX, rawY+.203945, .357965-rawZ]`, scale1. Both gate reports record canonical-source-world registration PASS with zero fixed registration displacement; fidelity explicitly records `normalizationAnchors.applied:false`.

For **every one of the14 pairs**, source/native camera positions, projection matrices and view matrices are exactly equal. All28 `reframed` flags are false. The three hero views correctly declare approximate world coordinates; the other11 do not. The reported diagnostic frame offset `(0,-.009,.010)` is not an applied candidate-fitting transform.

The nine whole orthographic views and `hero-frontleft` have zero border clips on both sides. `hero-rearright` has1/1, `hero-toptilt`1/2, `close-front`1/1 and `close-roof`2/2. The close views are intentional details; the cropped hero endpoints cannot certify the complete envelope. No pair is blank, corrupt or missing its central model.

## Material control and corrected prior diagnoses

The supplied MTL is unavailable. Source neutral gray versus native camouflage/blue glazing is **not scored as missing geometry**. The neutral board corroborates broad geometry without treating camouflage edges as cracks. Blue panes must not be called empty apertures; the real source103/106/92 glazing and its supporting steel have separate physical evidence.

The black source lower-glacis field is known solid owner4 stock from the earlier complete-source rays, not an absent native rectangular cavity. No bow cut or new underbody-fill diagnosis is made from its dark shaded appearance.

The earlier **shallow road-wheel bowl diagnosis remains withdrawn**. Independent source/native first-surface measurements already demonstrate the road bowl depth; the current camouflaged wheels merely read flatter in some shaded views. There is no new measured road-wheel deficiency or recommendation to reshape them.

The old exposed-drive cap error is visibly improved: both outboard stock faces now render in left/right and rear-quarter views, including the formerly at-risk mirrored side. No vanished left stock or obvious backface-culling failure is observed. This does not erase the [documented drive boundary/teeth/wrap limitations](abrams-source-x-drive-r4.md), establish every source aperture, or qualify moving gear. Eleven source carrier scallops must not by themselves be reinterpreted as proof of an eleven-tooth engagement cadence.

The new canted loader panes, folded frames and receiving geometry now occupy the proper roof region instead of the old generic upright walls. The upper CROWS and CITV bodies, three soft stowage bodies, source-shaped rack and unequal stern grilles are substantially improved. The historical R3 `RearGrilles` contact failure is superseded by the fresh focused checkpoint; it is **not** carried forward as an unresolved R4 attachment failure.

## Per-view scores

These are visual judgments of major and medium forms, not rescaled raster scores.9 means close overall agreement with only small remaining simplifications. Fine fasteners alone do not justify withholding9. Every sub9 result independently fails the requested visual floor.

| View | Score | Remaining visible form difference or evidence limit |
| --- | ---: | --- |
| front | 8.7 | Main shell, gun and station placement agree well. The track presentation remains different, and roof upper-weapon/coaming relief and guard/towing terminations are simplified. The dark source bow is not called air. |
| frontleft | 8.7 | Broad hull, curved armor course and barrel relationships are strong. Exposed rear wrap and front guard terminations differ; the complete roof weapon still reads less finely articulated. Road bowl depth is not a new defect. |
| left | 8.5 | The raised/re-shaped rear wrap and bottom course remain the clearest whole-model difference. The corrected drive face is present; roof lid/coaming and upper weapon transitions remain more regular than the source. |
| rearleft | 8.6 | Rack, containers, soft bodies and repaired stern receivers are coherent. Rear course exposure still differs, with simpler hatch/station profiles above. No current missing grille attachment is alleged. |
| rear | 8.6 | The broad rack and three unequal grille fields correspond. Track presentation and the upper roof station/coaming courses still differ. Bag creases, grille wire relief and small straps are secondary, not the sole reason for failure. |
| rearright | 8.7 | Drive stock and rear assemblies are materially closer. Retained rear wrap/course differences and upper weapon/coaming simplification prevent a near-exact result. |
| right | 8.6 | Main turret, gun and curved urban course agree well. Mechanical rear wrap remains visibly different; source roof upper relief and hatch edge profiles are more articulated. The camouflaged wheel discs are not evidence of shallower geometry. |
| frontright | 8.8 | Strong major-form agreement. The guard/towing termination layers, rear wrap exposure and remaining regularized roof courses still fall short of the source's complete medium forms. |
| top | 8.9 | Deck/rack plan layout and canted loader shields are much closer. Hatch/lid/coaming outlines remain rounder and simpler than the source's polygonal/stepped courses; the complete weapon mechanism's plan relief is reduced. |
| hero-frontleft | 8.8 | CITV, muzzle details and roof stations are improved. Remaining front guard/termination layering and upper weapon/coaming simplification are still visible at the hero scale. |
| hero-rearright | 8.7 | The corrected Drive face renders and the rack/stowage/receiver changes hold together. Rear course and roof-course differences remain; both aft endpoints are cropped, limiting whole-envelope judgment. |
| hero-toptilt | 8.9 | The strongest overall plan relationship. The canted pane installation is coherent, but polygonal hatch/coaming courses and weapon relief remain simplified. Aft endpoints touch/cross the frame. |
| close-front | 8.7 | Main tube/muzzle and counter-assault installation are closer. Front guard/tow terminal curvature and layered stock still differ; no conclusion about a bow cavity is drawn from shading. |
| close-roof | 8.7 | New loader glazing/frames, CITV and CROWS shapes close major prior omissions. The upper CROWS receiver/weapon relief still reads blockier, and rounder hatch/coaming courses remain evident. This is a visible-form observation, not new proof that a specific full-source hole is filled. |

**Result:0/14 at or above9.** No average or isolated-helper pass overrides that result.

## Ranked material residuals — not a new implementation authorization

1. **Track/drive mechanical departure:** source119–142 course geometry versus the retained native engagement/track mechanism remains a confirmed broad difference in side, front and rear relationships. Source118 axial stock has improved, but the documented raised rear wrap and retained engagement geometry remain. These must be resolved or explicitly accepted as a source-proportion limitation by the owner; no hidden masking, axle move or reduced clearance is justified by this review. Accepting that limitation does not make the unchanged raw track gate pass.
2. **Roof hatch/coaming and upper weapon relief:** top, hero-toptilt and close-roof show rounder regularized lid/rim courses and simpler surrounding steps than the supplied roof. Source roof owners84–107, and the CROWS87/88/90 assembly, are the relevant study areas if later authorized. The new loader97/103 pane/receiving correction is not the remaining generic-wall defect. A small dark oval/relief beneath the source upper weapon reads less clearly in the native close-roof pair, but this review does not promote that pixel observation into a proven full-scene air defect.
3. **Front guard/towing terminations:** close-front, quarters and neutral clay retain differences in rounded/folded end transitions and layered receiving stock. They are local form limitations, not a reason to replace the now-close main bow/turret shell. No unmeasured geometry change is requested.

Cloth wrinkles, tiny pins, straps and dense service fasteners are lower-priority fine simplifications. The former drum-bag, absent-deck, missing-loader-wall and gross drive-cap diagnoses must not be reused as if R4 had not corrected them.

## Raw gates and release status remain separate

Root's `.qa-dev/reports/abrams-r4-checkpoint-Zp8sEG` ran14:01:09.096Z–14:03:33.005Z. Its32 focused checks,23-profile quality scan (539 functions, zero issues) and typecheck pass. Visual capture exited0 because capture completed, **not** because all views achieved9. Fidelity and geometry both exited1. This is not a full `npm test`, anatomy regeneration, gallery or release receipt.

Fidelity at14:03:23.304Z records raw composite **96.5325260108**, whole97.2521205852, hull97.1936011228, turret95.4421801487, gun100 and **tracks88.8430936939<92**. All nine whole views exceed92. `gateFailures` lists tracks; that must not be rewritten as an overall PASS. Separately, the board's rear-left direct-turret diagnostic is91.5, and exposed-upper diagnostics include front91.55/top88.42. These are retained as below92 diagnostic observations, not falsely presented as newly enforced or waived gate rows. It is incorrect to claim every displayed component/view passed.

Geometry records hull93.3634690910, whole95.2424540898, turret95.0180709898, stations95.2118038156, **dimensions62.2104778873**, floaters100. The prior R3 turret-curve failure is no longer current. The dimensional failure remains: measured filtered height3.6368949451m versus configured published height3.44m (+5.72369%). The same report independently lists source body extent3.647m and native3.637m. This is a target/instrument-versus-physical-height contract issue, not image evidence of a0.20m missing roof or permission to shrink the source-faithful model. It needs an explicit source-backed owner disposition without a waiver.

No strict standard, anatomy, complete seven-variant visual approval or release pass is asserted here. Only the supplied SEP v2 configuration is directly compared; the other six remain documented configuration approximations. Collision-metadata-only work subsequent to this frozen capture cannot inherit a new physical appearance claim without its promised exact visual preservation evidence.

## Individual inspected image identities

Names are relative to the preserved archive, not mutable `shots/` paths. Full hashes also appear in the archive receipt.

| Image | SHA-256 |
| --- | --- |
| front-shaded.png | `6f5855f30d94294b56ea6e4d05349da2089a561d91ed7ce37acd655090d7f378` |
| frontleft-shaded.png | `3026f873e0c42c62b265d5ad0481ff60760591e3bc6be698bd27c0a973dd36cb` |
| left-shaded.png | `af9effa34bcd3b3ad928eb66ec68ddd93b2fc1be0aa916c2bdfd2148270e7124` |
| rearleft-shaded.png | `6d3b9cbe376b666f218ce46814241e955f60effc0ec4e634d0e434bd7323eabc` |
| rear-shaded.png | `ee8feb16274fc536edea8711f9611e8edc6efa5dc6387d36f45a0fc1e154d04b` |
| rearright-shaded.png | `47bc1ffc1ea6d574cdceae6391b2c64299f3d8f9b2df33f78390c030dbebfbd5` |
| right-shaded.png | `fb8c5243bcc140e24baf91370a474ed33b4248ccc91d0e2d03b483ed1f1f1501` |
| frontright-shaded.png | `d1945855c15b732504dd231d5015164ed8b51e01f7c8290a83a9551541c00e49` |
| top-shaded.png | `d9e62ab1fd951df7e39cddb3c29128be6760e426692614ba16fb4b4ccc5391d8` |
| hero-frontleft-shaded.png | `798e6d34c27e27f36456ed1c3459a6c299b8ec96cff2efb616120fb069240e99` |
| hero-rearright-shaded.png | `4e77ace5397d2933b1afc4c1256d86212749b5206228ca4a3176e6dc5571af7c` |
| hero-toptilt-shaded.png | `52bb760d0e898305d3095fb956f6da1c8ab4a0dafc33369b4c260679ad01aff1` |
| close-front-shaded.png | `45ddd2b93786e3879d7dcc7d463a36ba22ba60e2f82ad6510883b976982d32f7` |
| close-roof-shaded.png | `1ecb3b029c64816b27a4503f138395cc66bb0a849a85da668120f89b88756746` |

