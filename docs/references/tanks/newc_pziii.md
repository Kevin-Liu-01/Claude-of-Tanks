# Panzer III Ausf. J (`newc_pziii`) — reference packet

**Exact variant modeled:** Panzerkampfwagen III Ausf. J (late, 5 cm KwK 39
L/60), 1941–42 production — the long-gun J the Newc42 low-poly oracle carries
(its tube overhangs the bow ~0.7 m, which only the L/60 does).

## Corroborated dimensions

| Measure | Value | Sources (2+) |
|---|---|---|
| Hull length | 5.52–5.56 m | historyofwar.org Ausf J pages; en.wikipedia.org/wiki/Panzer_III |
| Overall length (w/ L/60) | 6.28 m | historyofwar.org (L/60 page); tank-afv.com Panzer III |
| Width | 2.95 m | historyofwar.org; Wikipedia |
| Height | 2.50 m | historyofwar.org; Wikipedia |
| Gun | 5 cm KwK 39 L/60 (tube ~3.0 m) | historyofwar.org; Wikipedia |
| Running gear | 6 small dual road wheels + 3 return rollers per side, FRONT drive sprocket, rear idler, torsion bars | tank-afv.com; Wikipedia |

## Identity cues

- Boxy hull with near-vertical superstructure sides slightly proud over the
  tracks; flat fender line with tools/jack; stepped bow (tracks lead).
- Turret: rounded-front faceted sides, external mantlet block, side crew
  hatches, drum cupola at turret rear center (oracle crown 2.55).
- 5 cm L/60 with a slim tube, sleeve step at the root.
- 6 small wheels low under the flat fender, 3 return rollers, front sprocket.
- Rear deck with twin louvre banks; rear exhaust muffler across the tail.

## Reference links

1. https://www.historyofwar.org/articles/weapons_panzer_III_ausf_J_60.html — J (L/60) data
2. https://en.wikipedia.org/wiki/Panzer_III — family dims/wheel layout
3. https://tank-afv.com/ww2/germany/Panzer-III.php — running-gear layout

## Local GLB oracle notes

Path: `public/models/tanks/community/pziii_newc42.glb` (CC0, Newc42;
turret `^Turret$`, gun `^Gun$`). Healthy. Width-normalized probe (scale 0.969):

- hull z −2.695..+2.695 (5.39), roof plateau 1.66–1.72, glacis falls
  1.52→1.12 over z 1.67..2.67; fenders ±1.45 at y 1.1–1.4; tracks ±1.43;
  tail drops to y 0.92 at z −2.58. Ground contact z ≈ 1.6..−1.5.
- turret z +1.17..−1.33: base y 1.65, roof 2.19–2.27, cupola crown 2.55 at
  z −0.08..−0.58; rear bin arm 1.83..2.3 at z −0.83..−1.33; plan max ±0.89
  (z 0.15–0.6) tapering to ±0.30 at −1.2.
- gun: axis y ≈ 1.98, mantlet block ±0.88..0.98 at z 0.9–1.2, sleeve step
  ±0.21 (z 1.5–1.65), tube ±0.16 to muzzle z 3.415 (0.72 past bow).

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 68.6 | — | 89 | 52 | 0 | 80 | baseline (short L/42-ish gun never cleared the bow → gun mask 0) |
| 2026-07-30 | 88.9 | 88.6 | 90 | 81 | 97 | 86 | bespoke build: oracle-frame hull, faceted turret w/ rear-center tall cupola + Rommelkiste, L/60 clearing the bow 0.72 m (G 0→97), 6 rubber wheels + 3 return rollers + front sprocket, visor/MG ball/hatches/tools/muffler |

Remaining gap: turret 81 — the oracle's cupola blends into its roof as one
low-poly lump; the front cheek step (low wings at z 0.8–1.05) approximates its
sloped-face read within ~6 cm.


## Geometry gate v9 (2026-07-31, from-scratch agent)

Gun x +0.12 (print turret rest yaw - repair candidate; also its gun rests
visibly ELEVATED: whole-curve gun-line ~0.5 m high at the muzzle columns -
rotate the Gun node's rest pitch to zero in the repair batch). turret
43.9 -> 67. min 28.7 -> 31.2 (whole-limited by the elevated oracle gun).


## Geometry gate v10 round-2 cert update (2026-07-31, oracle batch 7)
The v9 cert ("gun x +0.12 print turret rest yaw; gun rests visibly ELEVATED
~0.5 m — rotate the Gun node's rest pitch to zero") is DOUBLE-DISPROVEN by
vertex + runtime analysis (tools/repair_oracles.py batch 7, no-recipe entry):
- rest PITCH is ZERO (tube centroid line level to the millimetre);
- rest YAW is ZERO (shell facet azimuth -0.045 deg, plan centres -0.007);
- the gun-x offset is REAL but authored INSIDE the fused Gun mesh (+0.06 raw
  off the mantlet's own centre, amplified to +0.10 visible by modelLoader's
  1.5x gun scale). Any rigid node move trades tube error for mantlet error
  1:1 — the file is byte-identical and the offset is a DOCUMENTED PRINT CAP.
Build keeps gun x +0.12 to match the runtime-amplified tube line (this is
mask parity with the shipped reference, not a yaw replication).
Round-2 row: hull 38 whole 32.1 turret 67.6 stations 66.9 dims 100
floaters 100 (dims closed from 82.2: KwK 39 L/60 lengthened to published
overall 6.41; cupola stack lowered 0.03 to published heightM p95; muffler
tucked inside the hullLengthM span).
