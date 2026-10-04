# M6 Linebacker concept and M3A3 turret revision

## Current status — 2026-10-03

- Owner selected an **upgraded M6 Linebacker concept**, then requested a new M3A3 turret base, a wider M6 turret with Bradley field equipment, and a much stronger optics package.
- Owner authorized publication of all current vehicle work to origin/main on 2026-10-04. Not yet published. Baseline `1eb8375d6`, managed worktree `m6-linebacker`.
- M6 structural turret width is 2.68 m (previously 2.20 m). The latest quad launcher is 30% smaller in every dimension (body 0.483 m square × 1.218 m long), moved inboard to x=-1.62 m on a shortened, connected cradle. M3A3 retains its chassis; the complete Ukrainian Bradley is preserved.
- Latest optics revision replaces the generic sight boxes with a dual-channel gunner sight and separate ranging window; a raised, fork-mounted panoramic head with three recessed channels; and two outward-facing roof cameras. Each has actual recessed glass, finite protective hoods and mounting stock. This is a visual equipment revision, not an additional weapon or a claim of independent sight simulation.
- PASS on the optics revision: TypeScript/core-unused; native HIGH/LOW fixture; all eight lens sightlines at three turret angles; 43 mm actual glass recess; original M3 chassis and full UA preservation; four tube origins; open gun/cage bays; one remote M2; M3 ERA contact/spent/reset. The preceding larger launcher cleared the hull by at least 33.6 mm across 120 yaw/pitch poses per quality and clears the fixed turret equipment through elevation. Logs: `.qa-dev/m6-linebacker/optics-types.log`, `optics-fit.log`.
- PASS on the preceding optics revision: native captures, regenerated fills/assets/anatomy, physical concept gate, closure, build and production switching (generation completed 2026-10-04 06:20 UTC). Those M6 receipts are superseded by the smaller pod.
- PASS on the smaller-pod revision: focused HIGH/LOW checks, all eight lenses, four firing mouths and 120-pose clearance per quality (minimum 283.3 mm).
- PASS on the smaller-pod combined tree (2026-10-04 09:19 UTC): all 15 generation stages, native seven-view inspection, full anatomy update/check (220 vehicles, 1,988 modules, 440 track sides, zero failed/outside-envelope findings), scoped assets, closure, external-weapon damage, production build and cold/warm/rapid garage switching. M6 has zero open/see-through pixels across 33 closure views. Evidence: `.qa-dev/linebacker-final/generation-results.json` and `visual-review.json`. Final integrated release/receipt checks remain pending.
- The preceding wider revision passed native Gallery inspection, the concept physical gate, full anatomy update/check (220 vehicles; 1,988 modules and 440 track sides; no failures or outside-envelope findings), scoped assets/centering, roster, 33-view closure, external weapons, build and garage switching. Those M6 visual/geometry receipts are superseded by the optics revision, not evidence that it passed. They are archived with the previous source and pictures in `.qa-dev/m6-linebacker/before-optics/`.
- The optics revision’s composed release recorded the pre-existing M3A3 comparison failure (minimum 0; disassembled reference), then was stopped during scoring to integrate the owner’s smaller pod. On 2026-10-04 the owner explicitly approved publishing all while retaining the failed M3A3 reference status. This is a scoped reference exception, not a physical-check waiver. It supplied no overall release pass. Earlier revisions and the stale concept-description failure remain in `before-width/` and `wide-first-generation/`; no thresholds were relaxed.
- Previously observed unrelated BMP-3M Dragun primary-fill and Challenger 3X/T-62MV-1 X balance failures remain unwaived until a fresh run characterizes them. The M6 concept proof does not qualify M3A3 historical source comparison. Numerical historical source comparison is not applicable to the owner-selected M6 concept.

## Source and ownership

The supplied tan M6 photograph establishes the Bradley chassis and left quad
launcher identity. The Army's [2002 Weapon Systems handbook](https://asc.army.mil/docs/wsh2/2002-WSH.pdf)
describes a Bradley-based Linebacker with a four-round Stinger launcher replacing
TOW, retaining the 25 mm M242 and 7.62 mm coax. The [Army historical account](https://www.lineofdeparture.army.mil/Journals/Air-Defense-Artillery/ADA-Archive/2024-Edition/Return-of-Tactical-AAA/)
corroborates that combination. The extra armor, cages, raised sight, remote M2,
800 hp powerpack, and wider turret are owner-requested game modernization choices.
No numerical 3D match or historical replica claim is made.

All runtime geometry is Kevin B. Liu's procedural construction. The photograph
SHA-256 is `a80e1f08b7ef2ae05c5479323c133306c2f3634a00306da4546c664b240af48f`. It is reference-only and is not shipped as a texture or mesh. Coordinates remain
metres, +Y up, +Z forward. The native `buildBradley` chassis and running gear are
explicitly reused, and its complete old turret is cleared before replacement.

## Construction and integration

The new turret uses a continuous welded rear body and separate sloped cheek
solids around a true elevation bay. The rocking mask fills that bay; only the
cannon barrel recoils. The quad pod and its connected trunnion arms share gun
elevation. Final articulation review exposed a roof collision at maximum elevation; the canisters now sit 0.40 m forward and 0.24 m higher on a taller connected cradle. A fresh native HIGH/LOW check probes the actual hull below the housing corners through 120 yaw/pitch poses; all sampled corners clear by more than 10 mm. The wider follow-up also moves the pod outboard and extends its supports; its generated assets follow each final geometry revision. All four missile muzzle locations come from the same lightweight
layout as their visible mouths. The 25 mm barrel and launcher tubes have real
recessed bores. Stinger uses HE fragmentation gameplay, never inherited TOW HEAT
penetration; the existing guided-weapon reload channel remains independent.

The hull retains Bradley suspension and its fenders. A continuous folded
shoulder joins the clipped skirt carrier, six removable-looking armor panels
per side and rear slat cages. Cage bars have finite supports and tested air gaps.
The new spaced plates use the same stations in the armor model. The turret
adds a commander cupola, hatch/periscopes, gunner optic, panoramic viewer,
separate thermal/day/ranging lenses, protective sight hoods and trunnion-mounted panoramic head,
remote M2, paired guarded lamps, smoke banks, antennas, a wider rear cabinet and basket,
strapped roll and packs, water can, service grilles, lifting eyes, shoulder bins,
layered side armor, hatch shields, peripheral cameras and rear shoulder cages. Generic random decor
is disabled for this fully authored concept.

M3A3 receives a separate compact scout turret base: widened rear shoulders,
clipped bustle, separate cheek volumes, off-center M242 opening, trunnion seats,
supported side armor and repositioned frontal ERA outside the gun opening.
The cheek ERA follows the measured side-face normals, and side cassettes sit on the widened carriers. Actual rays verify each cheek cassette remains visible and seated; spending it exposes permanent armor, and round reset restores it.
Its existing sights, TOW installation, roof equipment, low height contract,
weapon balance and native chassis are retained.

## Preservation, budgets and evidence

`m6Linebacker.preservation.json` records HIGH/LOW digests of the complete Ukrainian
Bradley and M3A3 hull/running gear before editing. The focused fixture compares
actual merged geometry and transforms, not source strings. Original M3A3 costs
were 89,294 HIGH / 71,782 LOW triangles; the concept budget is 110,000 in either
quality. This is a mesh budget, not a browser frame-time result.

The focused fixture also checks the actual cannon cutouts, launcher backstops,
cage stock and air, roof weapon census, fixed hull ownership, and firing origins
at yaw −83°/0°/90° and pitch −9°/0°/45°. Fills, full combat anatomy, technical
diagrams, standard/release checks and rendered inspection remain separate gates.
Their actual current outcomes are listed above; do not infer a full release pass from this fixture.
