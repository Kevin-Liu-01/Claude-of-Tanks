# Panzerkampfwagen III, early 3.7 cm (`pziii_konserwa`) — reference packet

**Exact variant modeled:** early Panzer III (Ausf. E/F/G configuration) with
the 3.7 cm KwK 36 L/46.5 — the konserwa OpenGameArt model carries the thin
37 mm tube and the six-wheel torsion-bar chassis of the E-onward marks.

## Corroborated dimensions

| Measure | Value | Sources (2+) |
|---|---|---|
| Hull length | 5.38–5.52 m (E/F/G) | en.wikipedia.org/wiki/Panzer_III; tank-afv.com Panzer III |
| Width | 2.91–2.95 m | Wikipedia; historyofwar.org Pz III pages |
| Height | 2.44–2.50 m | Wikipedia; historyofwar.org |
| Gun | 3.7 cm KwK 36 L/46.5 (tube ~1.72 m) | Wikipedia; tank-afv.com |
| Running gear | 6 small dual road wheels + 3 return rollers per side, FRONT sprocket, rear idler, torsion bars | tank-afv.com; Wikipedia |

## Identity cues

- Same boxy Pz III hull language as `newc_pziii`: vertical superstructure,
  flat full-length fenders, stepped bow, rear tail plate with muffler.
- Early turret: internal mantlet with the thin 37 mm flanked by twin coax
  MG ports; drum cupola at the turret rear; side crew hatches.
- 6 small wheels + 3 return rollers, front drive sprocket.

## Reference links

1. https://en.wikipedia.org/wiki/Panzer_III — marks/dims/armament
2. https://tank-afv.com/ww2/germany/Panzer-III.php — early-mark gear layout
3. https://opengameart.org/content/panzerkampfwagen-iii — source model (CC0, konserwa)

## Local GLB oracle notes

Path: `public/models/tanks/community/pziii_konserwa.glb` (turret
`^Plane000$`, yawOffset π, no gun node — tube fused into the turret mesh).
Healthy shape; frame is REAR-SHIFTED (loader centers the full box incl. the
gun). Width-normalized probe (scale 0.958):

- hull z −3.01..+2.30 (5.31), superstructure roof 1.57–1.62 (z 1.26..−1.99),
  glacis 1.28→1.13 over z 1.5..2.26, rear deck steps 1.52→1.43, tail y 1.0;
  tracks ±1.41, fender band ±1.45 at y 1.0–1.3, superstructure ±1.0 at y 1.6.
  Ground contact z ≈ 1.3..−1.8.
- turret plan ±0.88 (z 0.45..−0.3) tapering to −1.05 rear, dome front ~z 0.8;
  base y 1.58, roof 2.11–2.20, cupola crown 2.48 at z −0.24..−0.74; mantlet
  cheek block 1.76..1.93 at z 1.26.
- gun (fused): axis y ≈ 1.85, thin tube (Ø≈0.05–0.12) muzzle z +3.01 —
  0.71 m past the bow. NOTE: a real KwK 36 L/46.5 would reach only ~0.2 m
  past this bow; the oracle's tube is visibly longer than scale. Matched to
  the oracle (it is what the game shows when the GLB loads).

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.7 | — | 91 | 56 | 0 | 80 | baseline (gun never cleared the bow → gun mask 0; centered frame vs rear-shifted oracle) |
| 2026-07-30 | 89.0 | 88.3 | 90 | 81 | 97 | 87 | bespoke build in the oracle's REAR-SHIFTED frame (zc −0.35): thin 3.7 cm reaching +3.01 (G 0→97), twin coax MGs, tall rear-center cupola, narrow top cap over the fender band, raised end wheels matching the oracle's wrap line |

Remaining gap: turret 81 (same fused-lump cupola read as newc_pziii); front/rear
views ~88.5 from the low-poly track band edges.


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 52.2 whole 42.7 turret 64.6 stations 77.9 dims 100
floaters 100 (ledger: 49.7/46.5/68.2/78.5/82.5/100).
Dims closed: cupola stack raised to published heightM 2.5 (p95) and the
3.7 cm KwK 36 lengthened to published overall 6.28 (muzzle +3.15).
