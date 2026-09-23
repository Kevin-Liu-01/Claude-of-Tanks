# Type 96B final geometry review — 2026-09-18

An independent reviewer who did not author Type 96B inspected all fourteen original source/native image pairs in `.qa-dev/tank-run/type96-geometry-repair/final/official14`. Every PNG matches its acquisition hash, capture drift is empty, rig parity is `OK`, and the report confirms the generated interior fill record was loaded.

**Source/native visual fidelity and repair preservation pass at 9.0/10 in every inspected image.** The repaired mast has a continuous receiving stem and base; the five protective bow plates sit above their receiving roof; separate bent front fenders retain the track contour; and the four rear latches remain visible beside the twin louver banks. No newly detached mounting stock, buried bow block or running-gear overlap was found.

Fine wheel fasteners, hatch handles and some mantlet/cover edge transitions remain coarser than the source. The source is shown in plain paint and the native vehicle in camouflage, so reduced contrast alone is not treated as absent stock.

**The complete release is not qualified by this review.** The supplied model has no roof MG, and the existing mandatory-MG policy question remains unresolved and unwaived. No runtime, source, camera or gate was changed.

Profile SHA-256: `fb249c071781c985a452272c8a1374f4a3f2ea2f44199a399d711a0d710305f1`.
Canonical source SHA-256: `ac66370796b83d2d63755390ffdbcaa503d9dbc15726630205c4e44a2765b1ed`.

| Actually inspected original | Visual score | Observation |
| --- | --- | --- |
| front | 9.0 | Broad turret cheeks, paired smoke banks, raised bow stock and physical muzzle aperture are present. Mast stem reaches its roof base. |
| rear | 9.0 | Twin rear louver banks and four raised rear latches remain separate and visible; antenna supports reach the deck. |
| left | 9.0 | Six road wheels, skirt slope, barrel stations and track envelope remain source-relative. Wheel dish relief is visible; small fasteners are coarser. |
| right | 9.0 | Opposite six-wheel row and turret/hull silhouette remain intact. No newly detached stem or running-gear overlap is visible. |
| frontleft | 9.0 | Bow blocks sit above their receiving roof; separate bent fenders retain the front-track contour. Turret cheek smoke bank and long barrel are preserved. |
| frontright | 9.0 | Opposite bow corner and wheel/belt clearance are preserved; smoke apertures and roof-station arrangement remain visible. |
| rearleft | 9.0 | Both louver banks, turret rear edge and separated running gear retain their form. Rear latches no longer disappear behind a smooth hull cap. |
| rearright | 9.0 | Opposite rear quarter retains louver divisions, rear fittings and antenna seating. Source wheel fasteners remain finer than the native approximation. |
| top | 9.0 | Hatch, sight-box and smoke-bank plan positions agree with the supplied configuration; the bow deck is divided into raised plates and receiving stock. |
| hero-toptilt | 9.0 | Stepped cupola, curved secondary hatch, roof boxes and rear deck retain distinct forms. Shallow fasteners are less readable under camouflage. |
| hero-frontleft | 9.0 | Raised bow plates and bent fenders are exposed together; bore, dish wheels, smoke tubes and mast base remain continuous. |
| hero-rearright | 9.0 | Rear latches and twin louver banks are visible together; mast collars connect to the roof without the former unsupported gap. |
| close-front | 9.0 | Barrel collars, open muzzle, mantlet receiving layers and forward bow stock are retained. Small mantlet fasteners and edge transitions remain simplified. |
| close-roof | 9.0 | Stepped cupola, curved secondary hatch and sight housings preserve the source arrangement; small hatch handles and roof fasteners remain coarse at this scale. |

Full paths, verified image hashes and individual observations are in `.qa-dev/tank-run/independent-regional-review/type96-geometry-final-review.json`. The current per-ID fill hash is recorded there separately: the capture manifest pins the fill loader and reports loaded geometry but does not itself contain a before/after hash for the per-ID fill file.

The root's independently timestamped complete source identities at
`.qa-dev/tank-run/final-seating/before-validation.json` and
`after-validation.json` bracket this acquisition and both pin that fill to
`7fa2bad6646133f22945f03b5309815430596269be5ee36eb5a20eb80c5bb247`.
This corroborates the omitted per-ID identity without rewriting the capture
manifest. The later gun-ownership repair has its own neutral-preservation proof
and still requires final regenerated-fill evidence before release.

Supplementary fill provenance: root’s `.qa-dev/tank-run/final-seating/before-validation.json` at `2026-09-18T13:09:10.076Z` pins `type96bX.generated.ts` as `7fa2bad6646133f22945f03b5309815430596269be5ee36eb5a20eb80c5bb247` before acquisition. The independent postcapture file hash matches exactly. This supplementary snapshot closes the missing preacquisition fill pin without claiming it was present in the capture manifest; root retains responsibility for the final whole-run identity comparison.
