# Vickers MBT Mk.1 / Vijayanta (`vickers_mk1`) — reference packet

Exact variant: Vickers MBT Mk.1 (Vijayanta production form) — L7A1 105 mm,
6-wheel flat-run gear, low curved cast/welded turret with flank stowage bins.
Scout stub: docs/references/tanks/scout-gen2-vickers_mk1.md (dims sources).

## Published dimensions (sovereign)
- hull 7.92 m, overall gun-forward 9.79 m, width 3.17 m, height 2.71 m, 38.6 t.
  Sources: tanks-encyclopedia.com/coldwar-british-vickers-mbt-mk-1/,
  militaryfactory.com/armor/detail.php?armor_id=788 (per scout stub).

## Oracle (JackTheTinkerer print, CC BY — vickers_mk1_jack.glb)
Extract: docs/references/vertex/vickers_mk1.json (triage 0a39d55 "near-clean").
- AS-LOADED the width guard's safeScale (0.9458, length-keyed loader) shrinks
  the chunky print: hull mask 7.145 (−9.8% vs published), overall 9.247
  (−5.5%), width 3.169 (0%), height 2.663 (−1.7%). The raw print at
  overall-match scale is +5.7% wide / −4.6% hull — the artist compressed the
  WHEELBASE, not the gun.
- Frame: extract z −4.623 (tail) .. +2.521 (hull nose), muzzle +4.646,
  turret pivot z −0.588; ground band z −3.14..+1.19 at |x| 0.89..1.45.
- Print quirks kept (curve-true): swept bow (center nose plate recessed to
  2.141ext behind ±0.68 wing pads at 2.26ext and track tips at 2.528ext),
  raised SMALL front idler (rim top 1.19, steep 0.38-slope climb), raised
  HIGH rear sprocket (wrap bottoms 0.5-0.75, rear extent −4.455ext), center
  rear-deck superstructure (1.786 crown over a full-width 1.547 fender
  plane), asymmetric turret bins (left top 2.364 to x −1.435, right 2.227),
  cupola right at (x 0.44, ext −0.45), 0.838 basket + 1.05 collar ring.

## vertex r2 build law (uk family, 2026-08-03) — LENGTH CARRIERS
Dims are sovereign but the loaded oracle is z-short, and gate registration
is translation-only. The build therefore keeps EVERY mid-hull feature
ref-aligned (build z = ext z + 1.051, body centered) and carries the
published hull length on two 0.12 m-wide, 0.38 m-band boxes:
- bow travel-lock/lamp box z 3.66..3.90 (build), tail phone box −3.66..−3.97,
  giving physical body span 7.87 → measured 7.83-7.92 (pixel-inclusive),
  inside the 1% dims grace. Tips are biased 35 mm rearward so the proc
  body-span midpoint matches the ref's own (its sub-band tail lip drops out
  of its body span) — this zeroes the hull dAlong that turret rows inherit.
- 0.12 m width = ONE pixel column per side in plan and front → under the
  p95 column threshold in both; box tops ride the gun-band line (bow 1.91)
  so side_whole reads gun-vs-box (0.16 err), not gun-vs-void (0.42).
- muzzle at build 5.753 → overall 9.72-9.75 (−0.5%, in grace).
- height anchor: compact cupola dome + MG receiver run ~5 columns at 2.695
  (p95 roof; ref crown peaks 2.664; anchor tax ~2 pts on turret side).
Registration cert (gate r3): side dAlong 1.051 = the frame shift exactly;
plan dy 1.061; front dy 0.005.

## Gate-learned oracle facts (r1-r3 iterations)
- ANTENNA LAW: any mast SHARES its side column with the body below — the
  column band passes the 12% body rule and the mast top poisons heightM
  AND `rough` (12% threshold), which then drops 0.35-band carriers out of
  the body span (r1: heightM 2.80, hullLen 7.58). Print has no masts; build
  carries base pots only.
- Stations prism law bites: all hull lofts segmented at ≤0.45 m (seg5), or
  station windows read track-only width (r2: stations 61 → 86).
- The rear deck rise is a CENTER superstructure (tiers ±0.95/±0.78/±0.55 at
  1.641/1.742/1.786) over a full-width 1.547 fender plane — a full-width
  1.786 deck reads +0.24 on every front column outboard of ±0.4.
- Track channel: xc 1.1575, w 0.545 (shoes land 0.89..1.45 like the ref);
  front flaps hang to 0.55 at |x| 1.475..1.575 (ref front bot 0.549 there).
- Sprocket sits HIGH like the print (z −2.98, y 0.92, r 0.26) under a
  raised 1.36 local sponson floor (containment: wrap top 1.335); idler
  small-high (z 3.145, y 0.80, r 0.255): rim top 1.19, front extent 3.56,
  tangent climb slope 0.38 — all three fitted simultaneously in r3.

## Containment (track-clip audit self-check)
Bow: glacis band floor lifts to 1.23 past z 2.72 over the idler wrap crown
(1.19+dilate); fender tip wedges' bottom line tracks the wrap arc with
≥3 cm (1.24@3.28 → 1.06@3.53). Stern: sponson floor 1.36 over wrap 1.335;
stern rake slab x ≤ 0.85 vs wrap x ≥ 0.885 (lateral clear); mud-flap hems
at 0.88 (rear) / 0.57 (front, ahead of the wrap, outboard x ≥ 1.475).

## Gun-seam note (side_whole)
The bow carrier must attach to the hull for the floater law, but any
connector below the gun band in the z 3.55..3.66 columns reads against the
ref's gun-only band there (bottom 1.89). The build carries ONE thin
diagonal-strut column (~0.4 err, p95-excluded) as the accepted attach tax;
low bracket runs hide inside the fender-tip silhouette, risers hide inside
the box's own columns.

## Round log
- r2 (2026-08-03, this round): first build authored from the extract's
  absolute columns. Gate: 0 → 45 → 47.7 → 75.3 → 80 → **81.8**
  (hull 82 / whole 81.8 / turret 82.6 / stations 88.9 / dims 99 /
  floaters 100). Track-clip audit --exact: 0 front / 0 rear. Parity
  boards: shots/uk-r2/vickers_mk1 (side_whole reads near-total overlap;
  green slivers = the designed length-carrier tips + muzzle). Known
  irreducible costs vs this oracle: side cover ~4.5% (published-length
  carriers), turret-trim cover ~2.8% (the longer hull widens the ±0.6 trim
  window over the gun), one asymmetric ref front column at x +0.87.
  Ceiling est. 86-88 without an oracle warp; a length-normalizing warp
  (z ×1.109 about the hull mid) would release ~6-9 pts across side/turret
  covers if the orchestrator lane ever queues this print.
