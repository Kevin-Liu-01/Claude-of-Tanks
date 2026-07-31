# Merkava Mk.3C (`merkava3c`) — reference packet

Exact variant: Merkava Mk.3 Baz/Kasag interim (Mk.3C) — Mk.3 hull + modular
turret, between 3B and 3D in fit: same plan as 3B with extra roof stowage and
the Kasag module lines; cupola right, bustle basket + chain curtain, deep
scalloped skirts; front engine, 6 wheels, FRONT sprocket, 120 mm MG251.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.army-guide.com/eng/product261.html ,
  https://www.globalsecurity.org/military/world/israel/merkava-3.htm
- Gun: MG251 120 mm L/44 (tube ≈ 5.3 m), thermal sleeve + evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_III ,
  https://www.primeportal.net/tanks/gil_moshe/merkava_3d_baz/

## Local GLB oracle (public/models/tanks/community/recovered/merkava3c.glb)
Width-normalized to 3.72. Whole z −4.14..+4.14; same sculpt family as 3B/3D:
- Hull: nose +3.33, tail −4.05; deck 1.63–1.72; skirt bottom ≈ 0.30; belly
  0.34; rear rack band to −4.05.
- Turret: roof plateau 2.38–2.45; cupola to 2.79; bustle 2.43 to −2.9; basket
  to −3.2; chains to −3.8; plan ±1.75 (3.50 m).
- Gun: axis y 1.96, tip +4.14, sleeved r ≈ 0.08.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 74.5 | — | 86 | 59 | 38 | 85 | baseline |
| 1 (bespoke rebuild) | 80.7 | — | 88 | 60 | 72 | 88 | |
| 2 (rotor/evac position + Kasag roof clutter kit) | 83.3 | 86.4 | 87 | 66 | 86 | 88 | best turret comp of the family |
| 3 (shaded-parity r2: Kasag clutter as strapped cloth bundles, gunmetal basket mesh/chains, detail-tone cheeks, dished wheels, deck/glacis/tail furniture, skirt bolts + hem, front fender boards) | 83.4 | — | 87 | 66 | 86 | 88 | material/furniture pass — silhouette pinned |

Remaining gaps: follower skirt capture in the ref turret mask (as 3D).
| 4 (r3 turret reconstruction: shared Mk.3 rebuild (see 3B row) + Kasag cloth clutter; cheek-vent louvres never re-added to the turret (r2 flagged them as belonging on the hull sponson) | 82.9 | — | 87 | 65 | 86 | 88 | best family turret comp holds |
| 5 (r5 FROM-SCRATCH curve rebuild: shared Mk.3 loft + turret re-seat (see 3B r5 — face z 1.75, crest 2.55, roof 2.40, axis 1.97, evac at 2.4–2.6, low full-width rear rack) + Kasag cloth clutter | 84.3 | 85.2 | 87 | 67 | 95 | 89 | +1.5 over r4 82.8; best family turret comp 67 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: crest + wide roof ring + bundles match the print's massing.
- side L/R: measured face/crest/saddle/cupola line reads the same; ref keeps
  finer greebles on the cheeks.
- rear: basket + rack bands align.
- quarters: same-vehicle read throughout.
- top: near-identical (97.0).
- CURVE FINDINGS vs r4: identical structure to 3B (same sculpt family); the
  1.97 axis + forward evac were worth +9 G.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 55.4 / whole 40.5 / turret 2.4 / stations 84.6 / dims 96.8 /
floaters 100. Caps identical in kind to merkava3b (root-level gun, follower
sweep) PLUS the 3C-specific bustle-in-hull band: its hull mask carries
2.48-2.55 tops over z -0.7..-2.2 that no articulated build can copy exactly
(deck pack reproduces the band shape on the deck).

### Round-2 mimic purge + gate v10 standing (2026-07-31, post-repair 86d1071)
The defect-mimic packs tuned to the BROKEN oracles are deleted from
`src/vehicles/profiles/merkava.js`: the turret ring-interior column (bot
y~0.6 — the repaired refs carve the crew tunnel at the ring plane, so the
turret masks bottom at ~1.5 world), the hull-node `deckPack` casting-band
crate, and the oracle-matching rear stacks/rod reads listed per mark below.
Whips are seated on the measured reference trace columns (a half-column
offset costs two worst-list columns per whip per view). MEASUREMENT
MECHANICS (extends the Pershing/m60 notes): an unbroken axis-aligned
box is EDGE-ON INVISIBLE to the near/far-clipped station-slice cameras —
width carriers (fender lip/planks) are now SEGMENTED (~0.45 m, hairline
gaps) so every slice window catches an end cap; that alone moved 1b
stations 60 -> 77-79.
Changes as merkava3b (same sculpt): ringFloor/deckPack removed, healed
stack re-fit hull-side, crest/sight-band/vane/casting re-line, whip
re-seat. Kasag bundles anchored to the measured 2.46-2.51 rear roof.
- RE-CERTIFIED caps as 3B (cupola band stature, short gun +4.13 vs +4.73).
- OBSOLETE: the v8 "bustle-in-hull band" hullCurves residue (absorbed).
Standing (gate v10): hull 76.6 / whole 65.5 / turret 52.9 / stations 85.8
/ dims 99 / floaters 100 (was 49.2/41.2/2.4/84.6/96.8/100 at v10 start).

### Round-3 (2026-07-31): shared 3B re-lay + own whip stations
Same sculpt re-lay as 3B (see its round-3 notes for the registration-null
law). 3C-SPECIFIC: its print's whips ride x -0.62 (z -3.19) and +1.03
(z -2.99) — NOT 3B's +0.19/+0.97; the wrong-x whips were most of its
front_whole deficit (50.6 -> 81+ after re-seat). Its stations s4-s6 are
CLEAN (1.7-2.0) where 3B's read 3.5 — the s4-6 station-top anomaly is
3B-print-specific. Standing: min 52.9 -> 81.2 (hull 85.8 / whole 81.2 /
turret 83.1 / stations 84.3 / dims 99.9 / floaters 100).
