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


## Gate v6/v7 iteration (2026-07-31)
Rebuilt to published dims: hull 8.32 (was built 7.4 to match the small
oracle), overall 11.50 (L11 to +7.34), height anchor 2.95 at the commander
sight block (masts 3.04/2.99 = the 3-column budget), width plane +-1.755.
Floater fixes: the v5 mud flaps hung over the raked bow 0.1 off the deck
(5-pose failure) — UK flaps now mount on the fender tips; the whip antennas
and sight block were re-seated on the roof/bustle. The oracle's deep
trunnion mass (turret mask to y 0.89, z 0.1..1.55) is matched.
CERTIFIED CAP: safeScale keys on the oracle's wing mirrors (wider than its
skirts), shrinking its whole body ~7.4%, and its hull is ~0.9 m short of
8.32 — with dims sovereign every curve/station row carries that scale
mismatch (hull/whole/stations capped ~0-14). dims 94.6, floaters 100 green.
Repair note: mirror-trim + rescale is NOT a rigid transform; loader-side
width-anchor fix required.


## Round 2 — oracle batch 5 + gate v10 (2026-07-31)
OBSOLETE CERT REMOVED: the v6/v7 cap "safeScale keys on the oracle's wing
mirrors, shrinking its whole body ~7.4% (hull/whole/stations capped ~0-14)"
is OBSOLETE — batch 5 hinge-folded the four width-setting stowage panniers
flush; safeScale is length-keyed and the oracle self-measures ~8.3% larger
(hull z -4.19..3.77 = 7.96 in the scoring frame).
Build retuned to the corrected scale: deck retabled (flat 1.64 mid, 1.78
engine hump at -1.5..-1.9, 1.73-1.755 rear run, 1.83 bin bump at -3.05);
tail rake from -2.14 into the 1.15 undercut shelf with the full-width shelf
ending -3.70 and a narrow ±1.1 overhang to the published tail; skirts:
outer armour band z -2.35..3.3 hem 0.62 + a second 1.57..1.69 layer and the
near-full-length inner plate at ~1.5 (hem above the track run); narrow
visible track band (|x| 1.30..1.60 grounds, matching the ref's 1.31..1.58);
turret: roof plateau raised to 1.135-1.15 local (2.69-2.77 world, z 0.7..
-0.35), face line 2.04 at z 2.5 -> 2.41 at 1.1, TOGS top ~2.66 at z 0.44..
1.16, commander sight block x-SLIMMED (0.18) carrying the published 2.95
p95 anchor at the ref's own 2.77 peak zone (z 0.15..0.55), whips to 3.33 at
(x -1.37, z -0.98) and (x +0.97, z -1.24) — both in hull-fraction slice 5,
gun axis raised to 1.90, trunnion mass bottom at the ref's 0.97, bustle
tail pulled to -2.1 with the 2.42 stowage hump, smoke banks out at ±1.41-
1.44 / z 1.4-1.7.
RE-CERTIFIED CAPS (v10): hull print 7.96 vs published 8.32 (4.3% short) —
bounded cover (the ±0.35 bow/tail overhangs); print gun tube ends z 6.79 vs
the published-overall muzzle +7.34 — wholeCurves cover only. Dims sovereign:
98.6, floaters 100.
Numbers (baseline -> now): hull 63.6 -> 66, whole 24.4 -> 32-33, turret
3.1 -> 32.7, stations 16.7 -> 65.5, dims 98.6, floaters 100.

## Plate-fill r1 (2026-08-01, owner directive — GEOMETRY-GATE.md "Plate fill rule")
Turntable review (tools/tmp-platefill probe, shots/plate-fill-r1/challenger1-
{before,after}/): the tail overhang bin + shelf hung over a clean SEE-THROUGH
tunnel (rake band ends -3.42/y0.84; nothing closed up to the 1.14 shelf
underside — rear-quarter leak 10048 px, rear-deck 11974 px). Fills (uk.js):
under-shelf block x±1.48 y0.84..1.16 z-3.42..-3.70 + recessed lower rear
plate x±1.05 y0.82..1.16 z-3.70..-4.08 (8 cm behind the bin tail, overhang
read kept), plus the shared ukHull fender-wedge fill at the bow (see below).
Leak after: 822/976 px (residual = grazing across-deck sight lines, real
daylight). Gate before/after at v11: BYTE-IDENTICAL rows (hull 65.8 whole
32.2 turret 32.7 stations 66.1 dims 98.6 floaters 100) — fills measurement-
invisible.

Shared-helper note: ukHull now closes the wedge between the flat fender plane
and the falling glacis/tail deck line wherever the deck drops below fenderY
(lofted mudguard solids inside the plate's own footprint). Blast radius:
chieftain5 / challenger1 / centurion3 / centurion5 / fv510 — all five re-run
at gate v11 with byte-identical component rows vs pre-fill HEAD.
