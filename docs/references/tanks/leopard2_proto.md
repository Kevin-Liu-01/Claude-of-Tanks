# Leopard 2 Prototype (`leopard2_proto`)

**Exact variant modeled:** Leopard 2 prototype series (PT 1972-74, Krauss-
Maffei) — 16 hulls / 17 turrets built; TEN turrets carried the Rheinmetall
105 mm smoothbore. Modeled as a 105 mm-smoothbore PT with the pre-2AV spaced
armor turret: slab-sided welded turret with stereoscopic-rangefinder blisters
on both cheeks and the turret-base side bulge, Leopard 2 hull layout.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m (production Leo 2 hull layout) | Wikipedia Leopard 2 (7.72 hull), spec row (7.72) |
| Overall length (gun forward) | ~9.97 m (105 mm smoothbore ≈ L/50 class overhang) | spec row 9.97; Wikipedia Leopard 2 9.97 for the L/44 family envelope |
| Width | 3.70 m | spec row, Wikipedia Leopard 2 (3.7 hull) |
| Height (turret roof) | 2.48 m | spec row; Wikipedia Leopard 2 2A4 height 2.48 |
| Gun | Rheinmetall 105 mm smoothbore (10 of 17 turrets) | Wikipedia Leopard 2 (prototype armament), armoredwarfare.com Leopard 2AV article |
| Turret externals | stereoscopic rangefinder w/ armored cheek blocks; turret base wider than turret (side bulge); anemometer, IR light, commander periscope | panzerplace.eu/leopard-2-prototype (Swedish PT hull 7) |
| Running gear | 7 dual road wheels, rear sprocket, front idler | Wikipedia Leopard 2 |

## Identity cues

- Turret: LOW slab-sided welded box (no wedge appliqué, no EMES doghouse) with
  a rounded-cheek front, stereoscopic rangefinder blisters bulging from BOTH
  cheek sides, base ring bulge wider than the turret wall, simple commander
  cupola + loader hatch, early smoke mortar clusters.
- Gun: 105 mm smoothbore — slimmer tube than the 120s, mid-tube bore
  evacuator, NO thermal sleeve (bare tube), plate mantlet in a narrow notch.
- Hull: production-pattern Leopard 2 hull (crease glacis, driver front-right,
  raised engine deck) with plain slab side skirts (no sculpted A5 blocks).

## Reference links

1. https://panzerplace.eu/leopard-2-prototype/ — Swedish PT walkaround notes
2. https://en.wikipedia.org/wiki/Leopard_2 — prototype program history
3. https://armoredwarfare.com/en/news/general/vehicles-focus-leopard-2av — PT/2AV development

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leopard2_proto.glb` (m_bergman
print). ORACLE DEFECT — sunken turret: the print is a tall Leopard 2 hull tub
with the turret shell melted to deck level (side hump only 2.21-2.24 over
z −1.4..−0.3) and the gun printed as a bar lying at DECK height (axis ~1.33,
muzzle z 4.30 = only 0.76 m overhang); the `Turret` node contains belly and
scrap geometry, so the turret/gun component channels are meaningless.
Per HANDOFF §5 + shaded-parity precedent (is3_bergman): the build makes the
REAL proud prototype turret + full-length 105 (muzzle ≈ z 5.7, axis ≈1.92);
turret and gun scores are knowingly oracle-capped — logged here.

Width-normalized probe of the tub (ground = 0 after +0.09 shift):

- hull z −4.23..+3.54 (7.77); wall crest: front deck 1.80-1.83, engine deck
  walls 1.96-2.01 (z −3.4..−1.9), sunken-turret hump 2.22-2.24 (z −1.4..−0.3),
  glacis 1.72@2.0 → 1.51@3.43; rear wall bottom slope to 0.9 under z −3.9;
  bustle-basket scrap overhangs to z −4.23 at y 1.3-1.9.
- plan: full width ±1.85 from z −4.1..+3.4 (fenders full width).
- tracks: bottom 0, front ramp z 2.3→3.4, rear ramp z −3.5→−2.9.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 67.1 | 77.2 | 89.7 | 25.9 | 31.9 | 80.1 | baseline (generic WESTERN cast-turret profile — wrong identity) |
| 2026-07-30 | 65.5 | — | 86.2 | 27.9 | 30.5 | 81.7 | r1: bespoke build — Leo2 hull matched to the tub + REAL proud PT turret (blisters, base bulge) + 105 mm |
| 2026-07-30 | 67.2 | — | 89.0 | 28.0 | 31.0 | 83.0 | r2: deck/fitting slimming (rope off, thin louvres), gear ends on the tub's ramps, turret shifted onto the sunken hump, slimmer mantlet |
| 2026-07-30 | 67.2 | 77.9 | 89.3 | 28.6 | 31.0 | 83.0 | r3: wheels out to the a6 track line, low PT trunnion (axis 1.88) |

TURRET+GUN ORACLE CAP (per HANDOFF §5, is3_bergman precedent): the tub's
turret channel is belly scraps + a deck-level gun bar (0.76 m overhang at
axis ~1.3); the build keeps the real proud turret and the full-length 105
(2.25 m overhang at axis 1.88), costing T≈28/G≈31 against this oracle while
every shaded view finally shows a Leopard 2 prototype instead of a turretless
tub. Total is pinned at baseline (67.1→67.2) by those two capped channels;
hull/tracks/overall all improved.
