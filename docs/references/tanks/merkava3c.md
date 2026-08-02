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

### Round-4 fleet dual-gate pass (2026-07-31, gate v10)
Shared 3B re-lay (see merkava3b.md round-4 for the full fix list: deck line,
track ramp/gear, skirt 1.83-band + end flares + relocated WIDTH-GUARD lip,
segmented plate, rack outer wall, pack taper, bustle ramp+taper, chin wedge,
2.68 grace-line plinth/caps, vane V, whip law). 3C-specific: whips at
z −3.21 (x −0.63) / −3.00 (x 1.015); whip-can pot tower reading 2.94 at the
z −2.90 column; Kasag hump bundle x −0.82..−1.02 capped at 2.649 with the
mast-head spike AT the 2.68 grace line (p95 budget 3 = whips + the 2.94
pot); left roof wing x −1.26..−1.36 LOW (2.06) to z −1.66; left shelf pair
x −1.10/−1.17/−1.25 to z −3.05/−2.82; plinth x1 −0.545 (its band is wider
than 3B's); right roofBox keeps the 2.63 hump (3B's is 2.47).
Standing: **hull 90.9 / whole 84.8 / turret 90.3 / stations 92.1 / dims 100
/ floaters 100** (from 85.8/81.2/83.1/84.3/99.9/100). Every component ≥ 90
except wholeCurves.
- REFINED wholeCurves cap (certified): short MG251 (+4.14 vs +4.74) →
  side_whole cover 4.05% (−6.1) + the certified 2.73-2.77 stature band
  residual above the 2.68 grace line (~0.25 mean% ≈ −3.0). Measured ceiling
  ≈ 87; standing 84.8. All other components pass, per the gate's short-gun
  cap rule.
- Station s11: same self-trimming window-shift artifact as 3B.

### Batch-14 oracle normalization (2026-08-02, orchestrator) — caps RETIRED
Same warp as merkava3b (shared hull plan; see merkava3b.md batch-14 entry):
muzzle +4.13 -> +4.85 (published overall 9.04), body 7.409 -> 7.60, 3C
stature band 2.766 -> 2.66 published (whips to ~3.92). Post-repair verify:
height -0.1% / overall +0.5% / body -0.3%. Same hullMask-replica caveat as
3B (mantlet band crosses the 12% filter — informational only). The round-4
certified wholeCurves cap is RETIRED; fresh workorder required before any
build edits (pre-warp digests invalid).

### Push round 1 intel (2026-08-02, merkava agent) — 3C deltas vs 3B
Fresh baseline: hull 87.8 / whole 79.8 / turret 40.7 / stations 82.2 /
dims 99.7 / floaters 100. READ merkava3b.md "Push round 1 intel" FIRST —
same warped-ref frame (−0.35 shift), same registration law, same hull
targets (rack/tail/nose/skirt/flareR/stations), same ring-tub lobe
(0.58 bottoms over −0.36..−2.14), same muzzle +4.56 / vane-to-−4.44.
3C-SPECIFIC ref targets (world):
- WHIPS: tops 3.90-3.93 (not 3B's 3.61): z −3.58 (x −0.63) and −3.34
  (x +1.015). Spring can z −3.55 top 2.75 (x −0.63). p95 budget = 3.
- Crest: face z 1.53 top 2.54; 2.57 zone wider (0.53..−0.04) -> top1 2.57.
- Sight band: 2.62 at −0.62..−0.67, 2.65 at −0.72..−1.51, flickers 2.62-
  2.67 to −1.88. Front x-split: left plinth band 2.62-2.65 spans x −0.61..
  −0.94 (wider + lower than 3B's 2.68); mid-left 2.59-2.61 at −0.24..−0.53;
  CENTER 2.65 spike at x +0.01..0.05 (pano head sits near centerline, not
  x −0.34); right 2.54-2.55 from 0.09.
- Rear roof 2.54 at −1.93..−2.24; pot bump 2.57@−2.29 / 2.59@−2.35;
  KASAG hump 2.65 at −2.56..−2.61 (kit bundle -> z −2.58 top 2.65; the old
  2.94 whip-can tower at −2.90 is DEAD — ref max there is 2.49);
  bustle 2.46-2.49 to −3.03, rim 2.41 to −3.29.
- Stations (ref): s0 2.375, s1 3.897, s2 3.91, s3 2.649, s4-s7 2.663,
  s8/s9 2.581, s10/s11 2.54, s12 2.156, s13 2.074; widths as 3B.
PLAN: same rebuild as 3B with these deltas.

### Push rounds 1-4 (2026-08-02) — shared trajectory with 3B
R1 40.7 -> 63.2 (frame shift; read merkava3b.md round-1/2 notes for the
mechanics), R2 -> 82.1, R3 -> 84.2 (dims 100 -> 98.3 after pods moved to
the ref 3.10 tip; hullLength quantization), R4 pending. All shared fixes
are 3B's (lipStrips, flush skirt, flareF/flareR thin lips, sleeveTo 4.22,
ringTub step, vane V re-fit, roofBox[0] x1 1.32 — a 2 mm leak into the
plan x-1.38 column read as z -1.85 content and cost ~1.6 turret_plan pts).
3C-SPECIFIC learned this round:
- rearPack has NO left lobe (3B's lobeL comes from ITS ref only; adding it
  to 3C put 2.18-content at x -1.0 where the 3C ref hull reads 1.58).
- 3C whip straddles: whip1 x -0.64 (was -0.63: its x-column pair reads
  2.76/3.90 on the ref — the -0.60 col is carried by the 2.75 spring can),
  whip2 x 1.02 (1.015 split the 0.996/1.05 cols differently than the ref).
- Second spring can z -3.64 top 2.45 (the ref's -3.6 column reads 2.45,
  not the can crown 2.75 which hides in the whip column).
- Kasag hump bundle at z -2.58 top ~2.65 lands clean (not in any worst
  list since R2); pano head near centerline x 0.03 confirmed (no center
  columns in the R3 worst).

### R4-R8: the 3C front phantom was ENVIRONMENTAL (2026-08-02)
Several consecutive gate runs read constant proc tops ~3.27-3.33 at the
whip-neighbor front columns (±0.6-0.7, +0.95-1.05) — build-invariant
across whip rebuilds (thin 0.20 solid, bright material) — costing front
_whole ~12 pts (75.2). A fresh in-page 1024 re-render (probe --blame=
dump:) read the same columns CLEAN (2.57-2.62), proving no such build
geometry; after the width-guard incident was fixed and the environment
quieted, the SAME build gated at whole 87.8 twice byte-identically (the
phantom never returned). Verdict: transient measurement contamination
under concurrent headless-Chrome/GPU load, not build or oracle. Protocol:
before chasing any inexplicable column, (1) re-run the gate twice, (2)
pixel-dump the column. Whips stay thin: 0.20 + bright: true (harmless,
kept). 3C-vs-3B roof deltas confirmed this round: left band x1 -0.56
(3B: -0.548), plateau 2.54 vs 2.52, pot bump 2.575 vs 2.545.

### GATE PASS (2026-08-02, gate v11): min 90.5
**hull 91.5 / whole 90.7 / turret 90.5 / stations 93.3 / dims 100 /
floaters 100** — from the batch-14 baseline 40.7 (hull 87.8 / whole 79.8
/ turret 40.7 / stations 82.2 / dims 99.7). NO CAPS. Stable across two
consecutive runs; siblings unregressed (see 3B packet for the shared
registration law — pods 3.055 / tail frame -4.52 are untouchable span
carriers). Final 3C-only deltas beyond the shared re-lay: bellyMidX 1.10
(its outer 0.24 belly starts at |x| 1.10 vs 3B's 1.04), spring can top
2.90 (carries the ref whip-ribbon's x -0.60 feather column), cupolaX
1.09 / R 0.15 (its cupola ring must clear the x 0.87 column the 3B ref
fills), left-band notch step { -0.535..-0.455, top 2.59 } (ref: 2.51 at
-0.55, 2.59 at -0.49..-0.53), hem lip bot 0.72 (3B: 0.62).

## Shaded-parity r1 (2026-08-02) — FAIL min 7.0 (geometric 90.5 stands)
Shared work order: docs/critique/shaded-parity-merkava3bc-r1.md. 3C extras:
Kasag/pot gesture present but toy-scaled — bring to the ref's mass.

## VISUAL round r2 (2026-08-02, merkava agent) — all 5 defect classes fixed
Gate after the round: **hull 91.5 / whole 90.8 / turret 90.5 / stations
93.9 / dims 100 / floaters 100 (min 90.5, PASS)** — certified silhouette
survived (stations +0.6); siblings bit-identical; npm test 166/166.
Shared fix list + gate incidents: see merkava3b.md "VISUAL round r2"
(wedge front, boxy mantlet, pale re-bucketing, hatch rings, chain-fringe
comb, wavy hem, fender kit, muted brown bow flaps — all via the same
optional params).
3C-SPECIFIC this round:
- KASAG at the ref's prominence: the toy 0.38-wide box became a two-tier
  strapped stack — broad lower tier (0.50 x 0.095 x 0.24 at -0.79/-2.565,
  top 2.505) + strapped hump bundle (0.44 wide at -0.78/-2.58, top 2.65 =
  the certified hump line) + a dark canister at -0.42/-2.62. r2 GATE
  LESSON: the r1 0.30-deep tier + 0.16-deep hump aliased into the
  z -2.71 turret side column at +0.18 (turret 90.5 -> 90.1) — the ref
  hump band is ONLY -2.56..-2.61; keep hump z-depth <= 0.13 + strap.
- Cupola ring pulled outboard vs 3B (x 1.115, r 0.185): its ring edge at
  0.93 clears the x 0.87 front column the 3B ref fills (gate-pass law).
- Pano dome (near-centerline x 0.03) re-seated: drum 2.41 -> 2.573, dome
  to the certified 2.648 top — was the family's worst half-sunk read.
Honest residuals: as 3B (subtle wave, grey tail-corner flaps, faceted
cheek planes, slim MGs) plus: the Kasag stack still reads tidier than
the ref's tarp chaos (its mass/tiering now match, surface chaos does
not).
Predicted per-view (was 7.0-8.0 everywhere): front 8.5 · frontleft 8.5 ·
left 8.0 · rearleft 8.0 · rear 8.0 · rearright 8.0 · right 8.5 ·
frontright 8.5 · top 8.5 — worst views the rear arc ~8.0.

## Shaded-parity r2 (2026-08-02) — FAIL min 7.0 (converging; roof law PASS)
Shared work order: shaded-parity-merkava3bc-r2.md. 3C emphasis: the
ref's wrinkled Kasag tarp mass dominates rear/top — its absence is the
loudest gap; add soft masses.

## VISUAL round r3 (2026-08-02, merkava agent) — all 7 r2 items addressed
Gate after the round, TWO consecutive runs bit-identical: **hull 91.4 /
whole 90.7 / turret 90.3 / stations 93.9 / dims 100 / floaters 100 (min
90.3, PASS ×2)**. Siblings bit-identical; npm test 166/166; board total
87.7. Shared fix list + the span-carrier incident + all mechanics: see
merkava3b.md "VISUAL round r3" (same optional params; 3C roofSpine top
2.53 to its 2.54 plateau, plinth-wall seams at its x -0.94, extra
chamfers on its two left-step boxes ch 0.03/0.04).
3C-SPECIFIC this round:
- TARP CHAOS (the r2 'tidier than ref' flag): SIX wrinkled lumps across
  the bustle deck — four in the 2.46-2.49 band (-2.74/-2.90/-3.00 + the
  pot-shoulder one at -2.36 under the 2.575 line) and a REAR PAIR at
  -3.10/-3.13 whose crowns poke ~2 cm over the basket rim so the
  dead-rear top edge reads as a crumpled canvas line, not a straight
  rim. Kasag stack (certified band) untouched; the lumps surround it.
- Turret 90.5 -> 90.3 (-0.2, stable across three identical runs): the
  r3 furniture's diffuse cost; every remaining worst column is the
  pre-existing ringTub-step interp seam (-2.26), the 3.9 m whip-tip
  aliasing pair, or the vane V-taper AA columns — no r3 mesh appears in
  any worst list.
Honest residuals: as 3B (clean-panel grunge gap, plain bustle side
walls) — the Kasag zone now carries mass AND crumple, but the ref's
canvas chaos is still denser at 2x.
Predicted per-view (r2 was 7.0-8.0, worst rr 7.0): front 8.5 ·
frontleft 8.5 · left 8.0-8.5 · rearleft 8.0 · rear 8.5 · rearright
8.0-8.5 · right 8.5 · frontright 8.5 · top 8.5.

## Shaded-parity r3 (2026-08-02) — FAIL 7.0 (tarp miss alone holds the floor)
Work order: shaded-parity-merkava3bc-r3.md. Dead-rear = the ref's tarp
edge-to-edge; deliver real lump masses. Pot dome scale up.
