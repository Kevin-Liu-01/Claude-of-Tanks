# Tiger I (Newc42) (`newc_tiger`) — reference packet

**Exact variant modeled:** Panzerkampfwagen VI Tiger I Ausf. E (mid
production, drum cupola) as interpreted by the Newc42 low-poly pack — real
Tiger proportions with simplified faceting.

## Corroborated dimensions

| Measure | Value | Sources (2+) |
|---|---|---|
| Hull length | 6.316 m | tank-afv.com Tiger I; Wikipedia Tiger I |
| Overall length | 8.45 m | dday-overlord.com Panzer VI; tank-afv.com |
| Width | 3.705–3.73 m | dday-overlord; Wikipedia |
| Height | 2.93–3.0 m | dday-overlord; Wikipedia |
| Gun | 8.8 cm KwK 36 L/56 (tube 4.93 m) with double-baffle muzzle brake | Wikipedia 8.8 cm KwK 36; tankmuseum.org "What the L" |
| Running gear | interleaved Schachtellaufwerk (8 axles, triple-overlap), FRONT sprocket, rear idler, 725 mm combat track | tank-afv.com; Wikipedia |

## Identity cues

- Slab hull: vertical front plate w/ driver visor + bow MG ball under a flat
  superstructure roof; full-width sponsons; rear deck with twin radiator
  humps + exhaust pair with armored shrouds standing on the tail plate.
- Horseshoe turret with wide flat-sided mantlet, drum cupola mid-left, side
  pistol/escape hatch, rear stowage bin (Rommelkiste).
- 8.8 L/56: fat tube, big double-baffle brake; mantlet sleeve at the root.
- Interleaved big steel-dished wheels ('dished' + layers), front sprocket.

## Reference links

1. https://tank-afv.com/ww2/germany/Panzer-VI-Tiger-I.php — dims/gear
2. https://www.dday-overlord.com/en/material/tank/panzer-vi-tiger-1 — dims
3. https://en.wikipedia.org/wiki/8.8_cm_KwK_36 — gun tube length
4. https://newc-42.itch.io/german-low-poly-wwii-tanks — source model (CC0)

## Local GLB oracle notes

Path: `public/models/tanks/community/tiger_newc42.glb` (turret `^Turret$`,
gun `^Barrel$`). Healthy. Frame REAR-SHIFTED (hull-length centering excludes
the Barrel node, but hull+turret box still biases: front +2.9, tail −3.04).
Width-normalized probe (scale 0.963):

- hull z −3.04..+2.90 (5.94): bow tip 1.14@2.9, glacis/fender 1.47@2.4,
  superstructure front 1.7–1.8 @ z 2.15..1.9, roof 1.70 flat to −0.85, rear
  deck 1.72–1.78 to −2.35, tail 0.81..1.77@−2.85 w/ exhaust stubs ±0.5 to
  z −3.0. Tracks ±1.71 (y 0–0.8), fender flare ±1.84–1.86 (y 0.9–1.1),
  upper hull tapers ±1.59@1.3 → ±1.40@1.8. Contact z ≈ 1.9..−2.3.
- turret z +1.15..−1.45: skirt base 1.51 (proud of roof 1.70 — the shell
  hangs over the ring), roof 2.41–2.46, cupola band 2.63–2.69 crown at
  z 0.15..−0.6, rear bustle bottom 1.83 (z −1.1..−1.35); plan front ±0.78
  @ 1.2 widening to ±1.17 @ z 0, taper ±0.64 @ −1.35 — wide rounded drum.
- gun: axis y ≈ 2.07, mantlet block ±0.81 to z 1.35, tube ±0.17, muzzle
  z +5.15 (2.25 m past the bow) with a Ø0.24 brake bulge at z 4.65..5.15.

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 80.2 | — | 90 | 71 | 47 | 86 | baseline (gun ~0.5 m short, centered frame, wedge turret) |
| 2026-07-30 | 89.0 | 88.3 | 92 | 83 | 85 | 89 | bespoke build: full-track-width bow block + fender flare ±1.85, drum turret w/ hanging skirt + left cupola + rear bin + pistol port, wide mantlet + sealing face plate, L/56 two-step tube + double-baffle brake to +5.15 (G 47→85), interleaved dished wheels + front sprocket, bow spare links/visor/MG ball/exhaust stacks |

Remaining gap: front view ~88 from the drum turret's low-poly faceting vs my
smooth polygon; gun 85 on the thin brake-bulge mask.


## Geometry gate v9 (2026-07-31, from-scratch agent)

dims 0 -> 78.7 (hull lengthened to the published 6.32 span, cupola raised
toward published 3.0 — measured 2.83, needs ~4 more columns of cluster or
+0.05); gun x +0.10 per the print's rest yaw (repair candidate). min 0 ->
20.8; whole 20.8 is the muzzle-region (published 8.45 vs oracle 8.29) plus
the hull-side rear stack (side rows -2.1: ref 2.3-2.8 hull-mask mass -
same intake-tower pattern as tiger2, verify and replicate next pass).