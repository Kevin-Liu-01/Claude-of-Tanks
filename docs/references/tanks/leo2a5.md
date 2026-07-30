# Leopard 2A5 (`leo2a5`)

**Exact variant modeled:** Leopard 2A5, Bundeswehr, 1998+ fit — first
arrowhead-wedge turret generation, retains the 120 mm Rh L/44, electric turret
drive, enlarged commander periscope fit, heavy front skirt modules.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | army-guide.com/eng/product149, Wikipedia Leopard 2 |
| Overall length (gun forward) | 9.97 m | Wikipedia Leopard 2 (2A4/L44 length), tank-afv.com Leopard 2 |
| Width (over skirts) | 3.75 m | Wikipedia Leopard 2, armyrecognition 2A4 (3.7 hull) |
| Height (turret roof / over sights) | 2.64 m / ~3.0 m | Wikipedia, steelbeasts SBWiki |
| Combat weight | 59.5 t | Wikipedia Leopard 2 (2A5 row), military-history.fandom Leopard 2 |
| Gun | 120 mm Rh L/44, tube 44×0.12 = 5.28 m | Wikipedia Leopard 2 |
| Running gear | 7 dual road wheels, 4 return rollers, rear sprocket | Wikipedia Leopard 2 |

## Identity cues

- The A5/A6 tell: SAME arrowhead wedge turret — the SHORT L/44 tube is what
  separates an A5 from an A6 at a glance (~1.3 m less overhang, no L/55 step).
- Turret roof: EMES 15 cutout right wedge edge, PERI R17A2, crosswind mast,
  full-width bustle rack, whip antennas; wedge shells crest the roofline.
- Hull identical to 2A6: crease glacis, driver front-right, twin deck fans,
  vertical rear plate, heavy front skirt blocks + rubber-lip rear skirts.

## Reference links

1. https://www.primeportal.net/tanks/de_craecker/leo2_demo_walk.htm — Prime Portal walkaround
2. https://en.wikipedia.org/wiki/Leopard_2 — dims/variant table
3. https://tank-afv.com/coldwar/West_Germany/leopard-2.php — family overview

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leo2a5.glb` (recovered pack).
DEGENERATE RIG NOTE: the print's `Turret` node holds only roof fittings + the
gun; most of the turret SHELL is fused into the hull node (side hull mask tops
at 2.5-3.0 through the turret zone, upper mask is a sparse roof strip). The
turret component score is therefore oracle-capped — the build makes the real
proud wedge turret and takes the metric hit (HANDOFF §7 "keep the lower
score"; shaded critique judges identity, not the broken channel).

Width-normalized probe (ground = 0 after +0.07 shift):

- hull z −3.94..+3.95 (7.89 — prints ~2% long), plan full width ±1.87;
  front deck 1.83-1.85, engine deck 1.91-1.99 (rear high), glacis crease
  z≈2.35 falling 1.63@2.95 → 1.32@3.96; bustle basket piece overhangs the
  hull REAR to z −3.96 at y 1.5-2.4 (fused into hull node).
- turret: walls z −2.2..+2.2, wedge nose z≈2.4-2.7 (hull-fused shell tops
  2.44-3.06 over z −0.6..+2.1); roof 2.58-2.64; hatch/PERI cluster peaks
  2.98-3.06 at z −0.6..+0.9; antenna spike 4.13 at z −1.9; basket to −2.97.
- turret width (front view upper): ±1.45.
- gun: axis y≈2.04, muzzle z 6.02 (2.07 m past the bow) — L/44 proportion;
  tube Ø≈0.19-0.26.
- tracks: idler ramp z 3.1→3.75, sprocket ramp z −3.6→−3.0.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 74.6 | 80.8 | 77.2 | 47.7 | 70.6 | 88.4 | baseline (donor leo2a6 canonical + L/44 kit) |
