# Tiger II (`tiger2`) — reference packet

**Exact variant modeled:** Panzerkampfwagen Tiger Ausf. B (Sd.Kfz. 182) with
the series Henschel (Krupp-built) turret, 1944–45 — 8.8 cm KwK 43 L/71.

## Corroborated dimensions

| Measure | Value | Sources (2+) |
|---|---|---|
| Hull length | 7.38 m | en.wikipedia.org/wiki/Tiger_II; tanks-encyclopedia.com Tiger II |
| Overall length (gun forward) | 10.286 m — the L/71 overhangs the bow ~2.9 m | Wikipedia; dday-overlord.com Königstiger |
| Width | 3.755 m | Wikipedia; tanks-encyclopedia |
| Height | 3.09 m | Wikipedia; dday-overlord |
| Gun | 8.8 cm KwK 43 L/71 (tube 6.25 m) with double-baffle muzzle brake | Wikipedia KwK 43; tanks-encyclopedia |
| Running gear | 9 overlapped (not interleaved) steel-rim road wheel stations per side, FRONT drive sprocket, rear idler, 800 mm track, no return rollers | tanks-encyclopedia; Wikipedia |

## Identity cues

- Long low hull with one huge 50° glacis plate full width, upper hull sides
  vertical (~3.27 m over the sponsons) inside wider track guards (3.755 m).
- Series Henschel turret: narrow flat front plate, sides sloped inward and
  splaying rearward in plan, long overhanging bustle, curved-base Saukopf-less
  mantlet collar (Turmzielfernrohr port right), drum cupola LEFT-forward, rear
  hatch. Turret side bins/track hangers on many vehicles.
- 8.8 L/71: huge overhang, sleeve step mid-tube, double-baffle brake.
- Overlapped Schachtellaufwerk with steel-tired wheels (dished style, 2 rows),
  front sprocket, exhaust pair with armored bases on the tail plate.

## Reference links

1. https://en.wikipedia.org/wiki/Tiger_II — dims, gun, running gear
2. https://tanks-encyclopedia.com/ww2/germany/panzer-vi_konigstiger.php — turret/hull construction
3. https://www.dday-overlord.com/en/material/tank/koenigstiger-royal-tiger — dims cross-check

## Local GLB oracle notes

Path: `public/models/tanks/community/tiger2-maximus.glb` (20 flat sibling
meshes; turret `^Object_2$` = turret+gun fused; explicit pivot). Frame is
REAR-SHIFTED (full-box centering incl. the L/71). Width-normalized probe
(scale 0.963):

- hull z −4.95..+2.24 (7.19), roof 1.86, glacis 1.29@z1.94 → fender line
  1.81@z1.64; engine deck 1.88–1.97 (z −3.46..−4.06), tail 1.17..1.82@−4.66;
  tracks ±1.82, fender band ±1.88 (y 1.0–1.4), upper hull ±1.55 at y 1.5
  tapering to ±1.28 at y 1.9. Ground contact z ≈ 1.0..−3.3.
- ORACLE RIG DEFECT: several hull-parented meshes (mantlet collar at
  z 0.4–1.05 to y 2.5, cupola drum at z −1.06..−1.66 to y 3.03, aerials at
  z −2.2..−3.2 to y 2.8) belong on the turret/gun — they do NOT yaw with
  Object_2. The procedural build parents them correctly (cupola on turret,
  collar on gun), knowingly sacrificing a few hull/turret component points
  against the mis-parented reference masks (is3_bergman rule: identity wins).
- turret (fused w/ gun): shell z +0.44..−2.1, plan front ±0.63 @ z 0.3
  splaying to ±1.29 @ z −1.35..−1.5, bustle tail bins to −3.0 (±0.54..0.70);
  side base y 1.86, roof rises 2.6@0.14 → 3.03 crown @ −1.06..−1.66 (that
  crown IS the cupola band), rear roof 2.57@−1.96; front profile sides slope
  ±1.29 @ y 1.9 → ±0.80 @ y 3.0.
- gun: axis y ≈ 2.26, tube Ø0.18–0.24, muzzle z +4.94 (2.70 m past the bow).

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 76.3 | — | 77 | 53 | 85 | 83 | baseline (centered frame vs rear-shifted oracle; generic wedge turret) |
| 2026-07-30 | 81.1 | 87.0 | 84 | 54 | 90 | 87 | bespoke rear-shifted build: 7.19 m hull w/ full-width 50° glacis + overhung tail + tail exhausts, splayed Henschel turret w/ rearward roof ramp + raised rear roof mound (crown 3.02) + flush cupola ring + wall track links + bustle bins, saddle-roll mantlet collar + chin, L/71 two-step tube + double-baffle brake reaching +4.94 (2.70 m overhang), 9 overlapped dished wheels, raised front sprocket |

ORACLE CAP (documented after 3 revisions): the maximus print's rig is
mis-parented — the mantlet collar (z 0.44..1.04, to y 2.5), the cupola-height
band (z −1.06..−1.66, to y 3.03) and the aerials (z −2.2..−3.2) live in HULL
meshes that do not yaw with Object_2. The component masks subtract them from
the reference's turret and credit them to its hull, so a correctly-rigged
procedural (cupola/collar on the yawing turret/gun, per the m1a1_aim lesson)
is structurally capped near T≈55/H≈84 while the whole-view silhouettes sit at
87-96. Identity wins over the metric; whole-mask overall is 89.7.
