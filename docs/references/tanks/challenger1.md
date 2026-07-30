# Challenger 1 Mk.3 (`challenger1`) — reference packet

Exact variant: FV4030/4 Challenger 1 Mk.3, Royal Ordnance L11A5 120 mm rifled gun.

## Corroborated real dimensions
- Overall length gun-forward 11.55–11.56 m; hull ≈ 8.3 m; width 3.51–3.52 m over skirts;
  height 2.95 m to the commander's sight.
  Sources: https://en.wikipedia.org/wiki/Challenger_1 ,
  https://www.inetres.com/gp/military/cv/tank/Challenger1.html ,
  https://en.wikipedia.org/wiki/Royal_Ordnance_L11
- Gun: L11A5 120 mm rifled, L/55 → 6.6 m tube (6.86 m overall), thermal sleeve over most
  of the tube, fume extractor at ~60 %, MRS collar at the muzzle. Tube rides LOW over the
  long shallow glacis at 0° elevation.
- Running gear: 6 road wheels per side (Hydrogas), rear drive sprocket, full-length
  armoured skirts covering the return run.
- Distinctive: wedge-faced Chobham turret with flat sloped cheeks, TOGS thermal-sight
  barbette on the roof RIGHT, long flat bustle with basket + square side stowage bins,
  two tall whip antennas, commander's cupola left.

## Local GLB oracle (recovered CR1, proper articulated rig)
Width-normalized reference (scale ×0.926): hull z ±3.69 (7.38 — proportionally shorter
than the 8.3 m real hull, the model reads width-normalized), hull top 1.69 (skirt/fender
line), turret+gun rig sane: barrel tip z 6.26 → 2.57 m overhang past the nose, gun node
y 0.95–1.97 (tube low over the glacis), upper assembly to y 3.07 (TOGS/masts), bustle
ends z −1.87. This oracle is trustworthy for all five component masks.

## Procedural gaps identified (baseline 70.7: H81 T51 G47 R77)
- L11A5 far too short: procedural tip 5.09 vs 6.26 (−1.17) → gunLength 5.72 → 6.95.
- Turret roof 2.67 vs 3.07: no TOGS barbette, low antennas → +0.08 turret height, TOGS
  box, 1.05 m antennas.
- Bustle reached −2.21 vs −1.87 → turretRear −1.92 → −1.55.
- Gun trunnion 0.15 too high → gunY 0.34 → 0.23; donor CR2 hull runs 7.79 long vs 7.38
  (kept — CR2 hull detail is worth more than the last ~2 pts of hull bbox).

## Mismatch log — shaded-parity r2 (2026-07-30)
- TOGS thermal barbette rebuilt BESIDE the gun root (0.52x0.56x0.85 housing, dark shutter
  face, 4 round glass sensor ports, lid rim) — the r1 roof stub read as a vent box.
- Roof: template pintle/smoke defaults disabled; commander now carries a LOW pintle GPMG +
  sight housing, plus gunner sight cowl and loader cupola ring (r1 "oversized RWS block").
- Gun raised out of the wedge toe (gunY 0.10 -> 0.20; G 90 -> 92) with a two-piece canvas
  dust-cover wedge at the root; MRS muzzle collar + thermal sleeve retained.
- Cheeks: real 2x5 smoke discharger banks on brackets (was a flush 5-dot row).
- Flanks/rear wrapped with tubular stowage baskets (rails + posts) filled with strapped
  canvas kit; rear basket rails span the bustle.
- Hull: splash board, twin-lens headlight clusters in guards, central tow point + eye,
  travel-lock crutch on the nose, rear bin rack across the tail, tow-cable clamp cleats
  (the buildHull cable ends hovered over the glacis), 8 skirt panels with bolt rows +
  lifting handles, dished road wheels (hub caps + rubber rings).
- Fidelity 81.5 vs 80.3 committed (T 71 -> 78). Remaining gap: R ~73 — ref track band
  reads wider/lower at the sprocket taper; would need shared running-gear geometry work.
