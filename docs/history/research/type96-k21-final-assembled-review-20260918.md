# Type96 and K21 final assembled visual review — 2026-09-18

All twenty-eight original images in `.qa-dev/tank-run/final-shadow-review/official14/{type96b_x,k21_x}` were actually inspected against the reference shown in each image. Every PNG and report matches its acquisition manifest; runtime identities before, after and at review match. Both reports confirm loaded generated fills, certified source-world registration, shared cameras and rig parity `OK`.

The reviewer did not author either vehicle’s source geometry or materials, but did add the narrowly scoped metadata-only shadow-source opt-ins and their native coverage fixture. This review is independent of the visible shape work; it must not be described as independent certification of the reviewer’s own shadow selection.

**Scoped source-shape, material and attachment preservation remains 9.0/10 in each inspected image.** No new detached mounting stock, buried receiving piece or closed real-air opening was observed. Small hardware, wheel-face relief and some cover edges remain coarser than the supplied source. Camouflage contrast alone is not treated as missing geometry.

**Rendered cast-shadow coverage is not assessed here.** The unchanged official evaluator creates its renderer and directional light without enabling shadow maps or `sun.castShadow` (`tools/visual-evaluator-page.html`, renderer/light setup). These images cannot prove broad-shadow seating, self-shadowing or absence of convex-proxy bridging. Actual shadow-render proof remains a separate task; native bounds and triangle budgets do not substitute for it.

**Neither vehicle gains a complete release qualification through this review.** The absent-source roof-MG policy questions remain unresolved. K21’s lowered/detached raw export part is still visibly different from the seated native rear/body, particularly front, rear and side views; no raw-source target decision or exception has been supplied. The scoped scores do not erase that failure.

## type96b_x

Profile SHA-256: `645c72e6a2a3e2a0af1dbf51408eabfa28feb22188511f0d103a818afbc102cb`.
Loaded per-ID fill SHA-256: `7fa2bad6646133f22945f03b5309815430596269be5ee36eb5a20eb80c5bb247`.
Canonical source SHA-256: `ac66370796b83d2d63755390ffdbcaa503d9dbc15726630205c4e44a2765b1ed`.

2/14 PNGs changed from the previously reviewed actual-filled archive: hero-toptilt, hero-frontleft. All fourteen were re-viewed, including unchanged images.

| Actually inspected original | Scoped score | Observation |
| --- | --- | --- |
| front | 9.0 | Broad cheeks, paired smoke banks, raised bow plates and connected mast stem remain present; the bore is open. |
| rear | 9.0 | Twin louver banks and four rear latches remain exposed; antenna seating and rear hull closure are preserved. |
| left | 9.0 | Six road wheels, skirt slope and long gun remain coherent; source wheel fasteners and hub relief read more finely than the native approximation. |
| right | 9.0 | Opposite wheel row and belt envelope remain separated; no newly detached mounting stock is visible. |
| frontleft | 9.0 | Raised bow stock remains above its receiving roof; bent fenders follow the track end, with open suspension air preserved. |
| frontright | 9.0 | Opposite fender and bow corner remain seated; smoke tubes and the continuous gun/mantlet stock retain their form. |
| rearleft | 9.0 | Twin rear louvers, skirt edge and running gear remain separate; small rear fittings retain their earlier coarseness. |
| rearright | 9.0 | Rear deck and turret rear preserve their silhouette; the stem reaches its base and the track end remains continuous. |
| top | 9.0 | Roof hatch, sight-box and smoke-bank plan positions remain source-relative; camouflage reduces shallow-detail contrast. |
| hero-toptilt | 9.0 | Stepped cupola, curved secondary hatch, sight boxes and mantlet cover remain distinct; no new clipping is visible. |
| hero-frontleft | 9.0 | Open bore, cupola steps, mast base and separated wheel/belt stock remain intact; native wheel fastener detail is coarser. |
| hero-rearright | 9.0 | Rear latches and twin louvers remain visible together; roof furniture is seated and no receiving surface disappears. |
| close-front | 9.0 | Barrel collars, muzzle aperture and mantle receiving layers are continuous; bow plates remain exposed. Fine edge transitions remain simplified. |
| close-roof | 9.0 | Stepped cupola, curved secondary hatch and optical boxes retain their source arrangement; small clamps and handles remain coarse. |

## k21_x

Profile SHA-256: `ceb4848453657d9acc6ff7dfc8ec8cdf99e3a3cd74e1b658e2a9f15c8353c5f2`.
Loaded per-ID fill SHA-256: `4119cdcaeb8b440a4330a2717bb13c741e28259975e8b71e9c5b64ce73e11f69`.
Canonical source SHA-256: `ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8`.

5/14 PNGs changed from the previously reviewed actual-filled archive: frontright, hero-toptilt, hero-frontleft, hero-rearright, close-roof. All fourteen were re-viewed, including unchanged images.

| Actually inspected original | Scoped score | Observation |
| --- | --- | --- |
| front | 9.0 | Both raised antenna bases, roof stations and closed launcher terminals remain seated. The lowered raw export part below the source hull remains unmatched and unwaived. |
| rear | 9.0 | Open basket rails and cargo stock retain air between members. The seated native rear/body still differs from the lowered raw export configuration. |
| left | 9.0 | Six road wheels, skirt divisions and widened gun terminal remain coherent; the hanging raw-source part below the hull is still a target conflict. |
| right | 9.0 | Opposite running-gear row, side armor and turret slope retain their form. Source hardware and wheel-face detail remain finer. |
| frontleft | 9.0 | Bow shoulders, deck covers, smoke apertures and main bore remain exposed; the antenna collars retain a visible base. |
| frontright | 9.0 | Front corner, wheel/belt clearances and main bore remain continuous; no new duplicate launcher or unsupported collar is visible. |
| rearleft | 9.0 | Rear basket air, hull fittings and running gear remain distinct; the source lower-body export discrepancy persists. |
| rearright | 9.0 | Opposite rear quarter preserves open basket rails, roof stations and the closed native rear; raw export pose remains unresolved. |
| top | 9.0 | Roof hatches, sights, antenna collars and basket preserve their plan arrangement; shallow panel relief is harder to read through camouflage. |
| hero-toptilt | 9.0 | Stepped antenna-to-roof connections, turret covers and rear basket remain seated and separate; no new geometric bridge is visible. |
| hero-frontleft | 9.0 | Main bore, smoke tubes, large deck covers and wheel/belt air remain intact; native small fasteners and hinge relief remain simplified. |
| hero-rearright | 9.0 | Rear basket remains open around the cargo, both antenna bases meet the roof and the side skirt remains above the wheel row. |
| close-front | 9.0 | Mantlet receiving layers, smoke apertures and flared terminal remain exposed; no new clipping or hidden bore is visible. |
| close-roof | 9.0 | Stepped antenna collars and neighboring rounded sight housing are seated; hatch contours and launcher housing remain intact, with coarser fine fittings. |

Exact paths, hashes, current-input checks and per-view comparisons are recorded in `.qa-dev/tank-run/final-shadow-review/type96-k21-independent-review.json`. No runtime, source, camera, generated record or gate was edited during this review.
