# Type 100 IFV (`type100`) — reference packet (fifth build, 2026-09-17)

**2026-09-17 (owner: "make the type 100 into a new chinese ifv and make its turret smaller and less long"):** the
vehicle is now the PLA's next-generation tracked support vehicle / heavy IFV — `role: 'ifv'`, public name
"Type 100 IFV", 30 mm autocannon belt (0.40 s, 220 rounds) with HJ-10 guided missiles (8) and programmable HE on
a compact unmanned module 3.8 m long, 2.24 m wide and 0.60 m tall (fourth-build turret grammar at 72 % length /
85 % width, autocannon in a ringed jacket, weapon station, pods, smoke banks and sensors re-seated), hp 2700,
38 t, 76 km/h, crew stations in the hull; dims 7.05 / 7.05 / 3.66 / 2.40 (silhouette 3.65); camo label
"Type 100 IFV Digital". The main battle tank the owner asked for is the separate `ztz100_x` ("ZTZ-100"), generated
from the owner's supplied model (docs/references/tanks/ztz100_x.md). The fourth-build notes below describe the hull,
which is unchanged.

# Type 100 (`type100`) — reference packet (fourth build, 2026-09-16)

**Exact vehicle modeled:** the PLA's next-generation medium tank ZTZ-100 / "Type 100" as shown in
the owner's ten RenderHub reference renders (renderhub.com/finiask/ztz-100-or-type-100-tank, studied
twice on 2026-09-16). What the renders dictate: a long, low hull whose flank is ONE flat surface from
the roof chamfer to the skirt hem, divided only by a horizontal hull/skirt joint seam and seven vertical
panel seams with bolt rows; a single wide glacis over a steep, flaring lower bow with chamfered corner
facets; a diagonal leading cut in the skirt over the idler; chamfered stern corners with three louvred
grilles, tail-lamp clusters and two shackle plates; the front is an IFV prow in the game's Puma / CV90 / Light Tiger grammar (owner: "it should look like the
Puma's or CV90's or Light Tiger's or PL-01's"): a shallow 20° trapezoidal upper glacis from the roof edge
(±1.61, z 2.20) to the nose line (±1.12, y 1.40, z 3.31), a narrow 64° lower bow plate from the belly
(z 2.85) to that nose line, the body narrowing in plan so the glacis side edges are cheek facets, fender
shoulders carrying the glacis edges out to the skirt line, the leading curtain panel running to the nose at
full height and the idler showing in the notch beneath the shoulder; both span the full width and the skirt planes
end on the lower one, so the side profile around the tracks is a single steep "/" (owner: "there's no bow
… the side profile around the tracks should look like /"; "push these glacis back by making the lower
glacis larger"; "the upper glacis … a lot lot less steep and the lower glacis can expand"; CCTV photo:
"closer to a T-14 Armata than an IFV"); two crew hatches with periscopes, a round vent, grab
rails and recessed lamp pods on the glacis; a long low turret set well back (bustle almost to the stern),
narrow louvred bustle, flanks in two steep facets under a chamfer band ("steeply sloped, but not flat"),
a long wedge to a trapezoidal gun housing, the gunner's sight box right of the gun, commander's round hatch, panoramic drum,
met mast, a pedestal-mounted automated weapon station (its own small turret with MG cradle, thermal sight
and dome) at the rear centre, twin quad hard-kill pods on brackets at the rear roof corners, two smoke
discharger banks, four active-protection radar panels on the upper facets, cupola periscopes, roof rails,
lifting eyes, GPS dome, stowage boxes and three whip antennas ("a lot more decorations and equipment"). Digital woodland finish; hull
number LZ|83 and the PLA star on the flank panel row; emblem on both cheeks.

## OWNERSHIP / ROUND STATE (2026-09-16, owner request)
FOURTH BUILD ("MAKE THE HULL TAKE INSPO FROM THE T90M AND THE TURRET TAKE INSPIRATION FROM THE T14
ARMATA AND REDESIGN FROM SCRATCH. RN YOU'RE USING THE PRIMITIVES ONLY"; earlier: "remade from scratch to
look much better", "sideskirts and lower glacis … blend much better with the hull"). The hull follows the
T-90M X study's grammar (bevelled-keel body loft, fender lip and hinge rail, HANGING curtain panels with
hinge blocks / clip bolts / stiffeners, stepped glacis appliqué courses, guarded lamp clusters, bolted bow
strip, louvred deck with hinged covers and exhaust housing, tow cable, pressed wheel faces); the turret
follows the T-14 X study's grammar (chamfered core loft wrapped in facet skins, trapezoid housing with the
mantlet on the gun, rimmed sight cavity, roof tile grid with bolts, drum-stack panoramic sight, pedestal
weapon station with forked cradle and a real pintle machine-gun fitting, radar panels, corner receivers,
bolted stowage, muzzle-reference bracket). Spec in
`src/vehicles/chineseFrontlineSpecs.ts`; builder `buildType100` in `src/vehicles/profiles/type100.ts`
(registered through `CHINESE_FRONTLINE_PROFILES`). The renders are references only: no model geometry,
GLB or measurement oracle participates; every dimension below is a design decision read from the renders
at the 3.66 m width anchor.

## DIMS DECISION — RENDER-PROPORTIONAL
| Measure | Value | Basis |
|---|---|---|
| Hull length | 7.05 m | stern plate z −3.75 to nose z 3.31 |
| Overall length (with gun) | 10.05 m | 105 mm muzzle at z 6.30 |
| Width (over the flank) | 3.66 m | one lofted flank at ±1.83, skirt 0.12 thick; the upper band leans in 0.22 over its top 0.43 (roof ±1.61) |
| Heights | belly 0.40, sponson floor 1.02, hem 0.62, roof 1.80 | wheels r 0.36 at y 0.42 |
| Turret | pivot (0, 1.80, −0.95), roof 0.68, bustle −2.75 .. apex 2.35 (turret frame) | renders 5/6: bustle near the stern, long cheeks |
| Gun | pivot (0, 0.34, 1.65) turret frame, 5.60 m tube | sleeve, evacuator, MRS collar |
| Silhouette | 2.48 m (turret roof) / 3.70 m (weapon-station sight dome) | RWS top 1.87 above the ring |
| Road wheels / rollers / sprocket | 6 / 3 / rear | idler forward, `flanged-twelve` faces |

## Construction (first-party, `sectionSolid` lofts + facet slabs)
- Hull: seven stations along z, each ring = bevelled keel, tub, sponson floor, upper flank (±1.78), inclined
  band, roof (12 points); the curtains (±1.79..1.83) hang separately from the fender line (y 1.37) to the hem. Stern plate half-width 1.50 → flank 1.83 by z −3.42; ahead of the roof
  edge (z 2.20) the prow stations narrow the plan from ±1.78 to ±1.12, the roof descends as the 20° upper
  glacis to the nose line (y 1.40, z 3.31) and, from z 2.85, the belly rises as the 64° lower bow plate to
  the same line; two convex fender-shoulder wedges span glacis edge → skirt line (bottom on the fender line
  y 1.37, crown falling with the glacis). The idler sits at z 2.85 / y 0.70 in the notch under the shoulder. Everything else is engraved or seated on that body.
- Turret: chamfered eight-point core loft (bustle 0.78 → main 1.04 → apex 0.42) wrapped in facet skins
  (foot ±1.32, lower facet leans 0.16 over 0.38, upper facet 0.26 over 0.26 to the roof at 0.68; bustle
  foot ±1.02; shoulder faces; hexagonal bustle face), roof plate loft; trapezoidal housing (foot ±0.50,
  crown ±0.32) with the trapezoid mantlet ring pitching on the gun.

## Receipts
`src/vehicles/profiles/type100.selftest.mjs` (identity, part census at the builder port, loft envelopes,
seams engraved not proud, 3 stern grilles, 8 tubes + caps, three whips, weapon station tallest and inside
the silhouette, muzzle anchor, build receipt `type100-ztz100-r3`); the registry receipts; the regeneration
chain (`gen-interior-fills --ids=type100`, `presentation-centering --update --ids=type100`,
`tank:anatomy:update`, `genIcons --ids=type100`, `tank-sealed-check --update-ledger`, `tank:freeze`,
`tank:roster -- --write`) and the staged release check in the main worktree.

## Release-gate fallout (2026-09-17 evening, IFV build)

`tank-standard-check` on the landing chain: the 28 mm band's real idler wrap met the prow's lower body and the
sponson floor (front 324 vox, strict sweep 955). The hull tub now stays 5 cm inboard of the track lane at every
station (1.15 → 1.06) and the sponson floor sits above the whole visible return run (`FLOOR` 1.02 → 1.26, hidden
behind the curtains); clip 0/0+0/0, holes 0, mg1 (the pintle machine-gun fitting).

