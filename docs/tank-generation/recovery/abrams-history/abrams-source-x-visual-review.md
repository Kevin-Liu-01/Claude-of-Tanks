# Abrams source X: independent shaded-view review

Date: 2026-09-07. Vehicle: `m1a2_sepv2_x`. Verdict: **FAIL — 0/14 views meet the requested minimum 9/10.** No average substitutes for a failed view.

## Evidence and scope

Every image listed below was opened and visually inspected, with the supplied reference on the left and the first-party native model on the right. This review uses the refreshed `visual-evaluator r1` receipt generated at **2026-09-07T09:48:15.420Z**, after the road/idler FrontSide winding correction. The earlier 09:43:47.083Z pairs were also inspected but are superseded here; their pre-fix tire rendering is not evidence of a remaining winding defect.

The refreshed `shots/visual-eval-m1a2_sepv2_x/report.json` records `canonical-source-world`, high quality and seed 4242. Independent JSON comparisons confirmed identical reference/native camera position, projection and view arrays in all 14 pairs; every `reframed` value is false. Rig parity is `OK`. These establish comparable views, not matching geometry. Three hero views use perspective-derived approximate world diagnostics.

Scores are independent visual judgments, not calibrated metrics: 9 requires matching major and medium forms and convincing visible openings/attachments; 8 is recognizable with a material medium-form discrepancy; 7 has several conspicuous medium-form simplifications. Gray reference versus tan camouflage, or opaque comparison glazing versus blue native glazing, is not itself a shape penalty. Camouflage boundaries are not identified as geometric cracks. The Three.js skill informed the evidence-based visual review; this is not a performance, code-scanner or temporal rendering audit.

## Per-view verdicts

All filenames are relative to `shots/visual-eval-m1a2_sepv2_x/`. Scores apply only to the hashed checkpoint below, not to later equipment repairs.

| Inspected image | Score /10 | Principal visible reason below 9 |
| --- | ---: | --- |
| `front-shaded.png` | 7.4 | Roof receiver/shield/support assembly is markedly simplified; front tow-frame and guard hardware are sparse. The black reference lower glacis is not an air opening. |
| `frontleft-shaded.png` | 7.6 | Roof weapon mechanism reads as a thin scaffold and blocks; front guard termination and rear stowage have different medium forms. |
| `left-shaded.png` | 7.5 | Upper station support/receiver and rear stowage silhouettes differ; native end-wheel exposure and course appearance remain visibly unlike the reference, requiring component diagnosis rather than an assumed axle shift. |
| `rearleft-shaded.png` | 7.0 | Rear baggage and cage are simplified rigid forms; engine-grille subdivisions, surrounding frames and towing hardware do not reproduce the source hierarchy. |
| `rear-shaded.png` | 6.5 | Three large faceted circular baggage ends replace irregular leaning soft stowage; sparse wire basket and two plain louver blocks replace more structured rear assemblies. |
| `rearright-shaded.png` | 7.2 | Rear stowage/cage and grille forms remain wrong at medium scale; roof station is substantially simplified. |
| `right-shaded.png` | 7.5 | Source compact roof mechanism becomes a visibly open triangular support under blocks; aft baggage and exposed running-gear forms differ. |
| `frontright-shaded.png` | 7.7 | Gross wedge and barrel alignment are convincing, but roof station, front guard termination and small mounted armor hardware remain under-authored. |
| `top-shaded.png` | 7.8 | Overall plan and main gun extent are close; rear baggage footprints, cupola/mechanism forms and roof-panel/attachment hierarchy are not. |
| `hero-frontleft-shaded.png` | 7.6 | Good gross hull/turret/barrel relationship; conspicuous simplified roof mechanism, guard details and rigid rear baggage. |
| `hero-rearright-shaded.png` | 7.0 | Clearly exposes cylindrical baggage ends and sparse basket lattice, plus simplified rear grille/frame geometry. Under-bustle space remains visibly open. |
| `hero-toptilt-shaded.png` | 7.6 | Roof stock and main axis read coherently; cupola/weapon assembly, baggage and blow-out-panel/roof fittings lack the source's form hierarchy. |
| `close-front-shaded.png` | 7.3 | Receiver/support, front guard trim and tow fittings are coarse; the main barrel is not visibly reversed or materially shortened. |
| `close-roof-shaded.png` | 6.8 | Most diagnostic gear-independent failure: source articulated receiver, shields, curved cutouts and layered bases become thin triangular supports, rectangular masses and simplified rings. |

## Bounded correction priorities

1. **Roof mechanism and actual attachment.** Inspect source-specific receiver/shield/body sections and their base assemblies before altering whole turret stock. The native high triangular support and plain upper blocks do not reproduce the source's compact articulated mechanism, particularly in `right`, `close-roof` and both front heroes. The equipment owner's separate actual-scene audit reports a 39.09 mm CROWS base gap, a 467 mm tall electronics-mast foot gap, and a commander rim occluding the real lower `106/26` pane. These are physical audit findings, not dimensions inferred from the screenshots, and remain open at this checkpoint. Replace missing real supports; do not add arbitrary pedestals or erase glazing.
2. **Rear stowage and basket.** Measure the individual source soft stowage silhouettes, leaning axes, flattened/rounded sections and retaining straps. Current hard circular endcaps and uniform straight lattice are not sufficient. Preserve the real gaps behind/below the basket and its distinct corner stock. This is a medium-form issue, not merely missing surface texture.
3. **Rear hull grille/frame assembly.** Source rear openings have multiple subdivisions, surrounding/recessed frames and separate towing/hinge fixtures. Native twin uniform louver rectangles and broad plain lower stock simplify this assembly excessively. Diagnose exact source planes and stock before changing the main stern envelope.
4. **Front fittings and running gear.** Front tow bar/frame, hooks and guard terminations need source-specific comparison. In the refreshed frames the road/end-wheel faces are present, so the old reversed-tire diagnosis is not repeated. Nevertheless front/rear track presentation and side end-wheel exposure still differ. Separate actual track surfaces, materials, source courses and the already documented mechanical wrap departure before proposing any width/radius/axle changes. Do not resize from a projected edge alone.
5. **Secondary roof detail.** Roof panel boundaries, collars, hinge/latch layers and rail attachment points are sparse. Improve these after the medium-form receiver and rear assemblies; fine fasteners cannot repair their outlines.

The main gun axis/extent, gross turret wedge and overall assembly relationships are recognizable and substantially closer than the equipment. No evidence here justifies global scale, whole-roof lifting, reference reframing or masking away real equipment.

## Negative-space and shading distinctions

The conspicuous black source lower-glacis rectangle is **real solid stock, not a missing native opening**. The independent full-source FrontSide/DoubleSide study (`.qa-dev/reports/abrams-front-lower-1r5hKL/rays.json`) reports 20 witnesses over X −0.9…+0.9 / Y 0.65…1.1, agreeing with the native plane within 3.63e−8 m and matching owner-4 normal `[0, −0.621608, 0.783328]`. Its gray/black versus gold appearance is shading/material evidence. Hollowing the native lower plate to imitate it would introduce a defect.

The main muzzle and under-bustle spaces remain readable. Still images do not prove the complete depth/contact contracts. The upper shield's steel frame has an opening, but the complete supplied source includes actual glazing: `106/44` and commander panes must not be treated as air. The reported lower-pane occlusion requires a real frame/rim correction, not removal of the pane. No shimmer, z-fighting, all-pose contact or disposal claim is made from static images.

## Signed angle evidence — projected, not vehicle pitch

These are matched projected edge slopes in the refreshed receipt. Delta is the evaluator's wrapped procedural-minus-reference angle, modulo 180°. A `front`/`left` label describes an image edge region, not a verified source-owner face; hero-derived lengths/world coordinates are approximate. The values are diagnostics for follow-up source sections, not commands to rotate the gun or tank.

| View / reported region | Reference | Native | Signed delta | Reported edge length / noise |
| --- | ---: | ---: | ---: | --- |
| front / left | 105.386° | 102.202° | −3.184° | 0.456 m / 0.296° |
| close-front / lower-front | 23.449° | 27.695° | +4.246° | 0.432 m / 0.417° |
| close-roof / front | 19.632° | 10.317° | −9.316° | 0.434 m / 0.411° |
| hero-rearright / lower-rear | 11.655° | 5.250° | −6.405° | approximate 0.652 m / 0.352° |

Large automatic offsets at a vertical silhouette cliff are not automatically height/length errors. In particular the top-view gun cliff diagnostic is not evidence that the visibly matching barrel is about 1.5 m short.

## Gates and freshness

The surrounding qualification checkpoint remained rejected despite about 95.2 overall fidelity: reported component averages were hull 97, turret 92, gun 99 and tracks 89; geometry reported whole curves 92.1, turret curves 87.4, hull curves 90.8 and dimensions 62.2. These rounded parent-reported scores are context, not scores computed by this visual review. Neither the average nor rig parity closes the valid individual failures.

The separate source-only height study distinguishes broad equipment at 3.36814 m, the unchanged instrument's P95 at 3.647256525 m, highest antenna at 4.176975 m, and donor nominal height 3.44 m. Its coarse body columns admit thick mast/whip stock into P95. This is documented measurement semantics, not a waiver or justification to rescale body geometry; the official failed metric remains failed.

The current roof/mast/rim corrections were not yet present in these frames. Fresh matched views and independent complete-source gates are required after their freeze. Existing focused bore/glazing/air/ERA-support tests remain separate evidence and do not establish visual acceptance of all seven family variants.

## Exact checkpoint hashes

These hashes pin the inspected files because later captures reuse their paths. SHA-256 of `report.json`: `e021de8fa3b6737a34cde2f6e753b7ce470f3f59fbae99485bc9cfa678383661`.

| Image basename | SHA-256 |
| --- | --- |
| front | `646a0fc6a8cce7fa2bcaad17a6d8e279cd5c6dcd7dac425468041fe0609ce5f2` |
| frontleft | `412816ee2c0af4de3427876b43de1f5e3feb732555f8d085b37797aaf8392980` |
| left | `b49b01526379adc9544abaa4564f39b87b1c2bdabdd22463dc4cf92b4869b8ef` |
| rearleft | `4558f32a558dd1ecef1e3f4537065cde212df48710b31e270740340ad54b9d6b` |
| rear | `f996a5594c179132419d99a1835fdd706a2cf6d27027017dca2d3528f56b2709` |
| rearright | `2cfcf2a55322538b69d887115f0bcc4cf0d93beee0595c53e3bc1b0015e6dca4` |
| right | `102330e58f048b3152bd1d00e9b15195cffb1cd22bc3764b1054aaa3b4d8241e` |
| frontright | `c16c6e0c04798e07a2077e8249e642e34cc6429804ebf37b10300f206fb5301a` |
| top | `ced68c9a06b66d43e133dfff12dc27ae6bfc7daa8ca90313120e086ce2bb25d0` |
| hero-frontleft | `cb9c38bc6e2f638e247e4b817a6dd192340dd860c92710d99fef6b10d8067b2b` |
| hero-rearright | `3d2cffc4fcd70e0be611d60e1887d3788fdcde9f64e3596b24e8d4c514ace8ae` |
| hero-toptilt | `e173aad9ac90de8b7062c8ee2008e4f19a070e970d6191a48bc6a8f25ea1af68` |
| close-front | `041a2b0a6b123c81749cb2a2baffe13299e2ccbf94fd7a5f2955aec9dfdb4fb7` |
| close-roof | `5405116f185c61b482389e05174af5fc667f19d89a48e9bd6e0032b5a10f7066` |

