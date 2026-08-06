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

## VISUAL round r4 (2026-08-02, merkava agent) — three moves + pot dome
Gate after the round, TWO consecutive runs bit-identical: **hull 91.4 /
whole 90.7 / turret 90.2 / stations 93.9 / dims 100 / floaters 100 (min
90.2, PASS x2)**. Siblings bit-identical; npm test 166/166. Shared fix
list + ALL r4 gate incidents/laws: see merkava3b.md "VISUAL round r4"
(1.3225 band-wall boundary, s7 window 2.622 MG police line, comb hems at
the basket floor, hem outer-face band, seam tilt sign). The -0.1 vs r3's
90.3 is the same diffuse AA cost (t_side mean 0.64 -> 0.65; every top
worst column is the pre-existing ringTub seam / whip aliasing set).
3C-SPECIFIC this round:
- HEM at ITS certified 0.72 line: lobeBot 0.782 / lintelBot 0.84 (tooth
  tips 0.718 ON the ref hem; scallop amplitude 0.06 — the 3C ref skirt
  hangs higher than 3B's).
- POT DOME (work-order cheap win) at the ref's chunky mass: drum r 0.105
  + sph r 0.115 crown 2.59 = the certified 2.59 @ -2.35 column EXACTLY
  (was a flat 2.575 crate); dark rim torus. Sphere reach trimmed so the
  -2.51 window (Kasag hump boundary) never sees it.
- TARP FIELD, 16 lumps (its ref rear IS tarp edge-to-edge): fwd row
  crowns 2.486 max (band 2.46-2.49), rim row 2.446-2.452, in-basket heap
  2.410-2.415, rear-slope pair 2.484-2.487 at -2.64..-2.67 — all placed
  CLEAR of the Kasag stack's certified -2.56..-2.61 band and the -2.71
  lesson column; Kasag keeps its two-tier strapped mass + canister.
- Second-story shelves at ITS ref front lines (gate-POSITIVE both: the
  standing under-reads closed): right shelf 2.542 (ref 2.54-2.55 from x
  0.09) and mid-left shelf 2.585 (ref 2.59-2.61 at -0.24..-0.53), left
  spine wedge RISES 2.525 -> 2.578 into the notch box; pad->ring bevel
  to ITS ring (x 1.115 r 0.185).
- Band-wall housing cluster on ITS plinth wall (-0.94 face, dressing
  outer edges <= -0.944).
Honest residuals: as 3B (mask-bound second-story rectangle, dead-rear
amplitude under the print's) — the dead-rear now carries organic
crumple + continuous fringe + canvas mat + recessed corner bays, but
the ref's edge-to-edge canvas chaos is still denser at 2x.
Predicted per-view (r3 critic: 3C min 7.0, held SOLELY by the dead-rear
tarp miss): front 8.5 · frontleft 8.5 · left 8.0-8.5 · rearleft 8.0-8.5
· rear 8.0-8.5 · rearright 8.5 · right 8.5 · frontright 8.5 · top 8.5.

## Shaded-parity r4 (2026-08-02) — FAIL 7.5 (up from 7.0; "different vehicle" gone)
Shared work order r4 doc. 3C extras: pot crown to ~1.5x width (certified
column check), dead-rear fold shading language.

## VISUAL round r5 (2026-08-02, merkava agent) — all 8 r4 items, SAMPLED
Gate after the round, TWO consecutive runs bit-identical: **hull 91.4 /
whole 90.7 / turret 90.8 / stations 92.6 / dims 100 / floaters 100 (min
90.7, PASS x2 — best 3C min yet; turret 90.2 -> 90.8)**. Siblings
bit-identical; npm test 166/166. Shared fix list + ALL r5 laws (clone
materials, sRGB emissive, 384-quant, ring furniture, receiver/station):
see merkava3b.md "VISUAL round r5". SAMPLED numbers (3C pairs):
- Run rect (view-left): proc med 56.1 / mean 53.2 vs ref 54.6 / 55.7.
- Rear corner flap block: proc (71,61,48) lum 59-62 vs ref (68,62,52)
  lum 63-67; black stacks gone (residual sub-flap strip 36 vs 63).
3C-SPECIFIC this round:
- POT SAUCER (work-order item 7): box-stack crown — saucer plate 0.31
  wide x 0.020 (top 2.512) + mid tier 0.22 (2.564) + crown knob 0.13
  (2.5895 = the certified 2.59 @ -2.35) + dark rim lines; the REAR read
  widens 0.21 -> 0.31 (~1.5x). The round r 0.115 dome was DELETED: its
  surface lit the -2.415 column at 2.56 vs ref 2.538, and any round
  saucer of the needed width crosses the -2.402 column edge — the box
  stack keeps the z-span certified (-2.28..-2.40); the pot roofBox z1
  trimmed to -2.398 for the same column.
- Kasag z-trims off the probe: lower tier -2.458..-2.628 (d 0.17), hump
  bundle -2.532..-2.632 (d 0.10, h 0.118 so the crown lip 2.6487 stays
  under the 2.649 s3 target), canister ends -2.645 — the old tier/hump
  faces lit -2.517/-2.646/-2.671 at +0.08..+0.15.
- Band-end STEP: plinth z1 -1.835 + step roofBox { -0.90..-0.60,
  z -1.838..-1.912, top 2.585 } = the ref's own 2.589 shoulder columns,
  then the vertical fall to its 2.538 plateau (apron deleted; probe cols
  -1.851..-2.235 now EQUAL ref).
- Left band box z0 -0.61 (ref band starts -0.62; its -0.594 col is
  saddle 2.41 — the 3B-style -0.585 start would overshoot 3C).
- Stowed rod at x -0.88 on ITS plinth (top 2.6625 vs its 2.65 lid, ref
  flicker 2.64-2.666 at -1.36..-1.78); receiver seated -1.755 (inside
  z1 -1.835); crest hood 2.585-top at z 0.52..0.60 + rear crest bumplet
  2.576 at 0.055..0.115 (s8 target 2.581 — the first 2.585 cut read
  +0.46% on s8).
- Whip2 spring can { 1.02, -3.319, top 2.607 } (ref 2.615 col); can2 to
  -3.601 top 2.531 (ref -3.594 col 2.538).
- Tarp rows: fwd -2.72/-2.78 down to 2.462/2.458 (ref 2.435-2.461), the
  -3.00 lump up to 2.481 (ref 2.486 @ -3.03), ONE rear-slope lump at
  -2.60 (2.496) — the old -2.67 lump topped the ref's 2.435 col.
Honest residuals: as 3B (sub-flap strip, band bottom edge, vane dot
density) plus the s4 station 1.35% top read (receiver/window boundary
quantization at 1024 — 384 raw reads +0.011) and the pre-existing
whip-tip aliasing pair.
Predicted per-view (r4 critic: 7.5 min): front 8.5 · frontleft 8.5 ·
left 8.5 · rearleft 8.5 · rear 8.5 · rearright 8.5 · right 8.5 ·
frontright 8.5 · top 8.5 — the dead-rear now carries sagged-curtain
language + saucer mass + matched gear tone.

## Shaded-parity r5 (2026-08-02) — FAIL 8.0 (pot saucer FIXED; same 3 gating items)
Shared work order r5 doc.

## VISUAL round r6 (2026-08-02, merkava agent) — the three 9.0-gating items
Gate after the round, TWO consecutive runs bit-identical: **hull 91.2 /
whole 90.7 / turret 90.9 / stations 92.5 / dims 100 / floaters 100 (min
90.7, PASS x2; turret 90.8 -> 90.9)**. Siblings bit-identical; npm test
166/166. hull 91.4 -> 91.2 is the same diffuse-AA cost class as 3B's
(no r6 mesh in any worst list).
Shared fix list + ALL r6 calibration laws (floor-clamped rear normals,
+-10 camo patch noise, the canvasCloth shade channel at 0x464a3e ->
renders 84, ortho-occlusion/link-pad-crest law, -4.479 wing column
budget): see merkava3b.md "VISUAL round r6". All changes ride the shared
3B/3C branches (chainFringe vane rework, wing-tarp fold grammar,
cornerCurtain, plinth slot + merkavaPlinthMG, proud pods, hull-bucket
wave band) — sibling paths byte-identical per the gate.
Per-item status (verified on the fresh 3C renders):
1. CANVAS — same rebuilt drape read as 3B (billow crowns + kinked
   diagonal shade folds + sag hems + sparse ball row on the vane; wing
   plates re-dressed; pack slot de-lined). Kasag stack untouched (its
   certified two-tier mass + canister still crown the field).
2. CORNER — sampled med 62.2 / mean 58.7 vs ref ~63.5 (was the 36-44
   ribbed stack). Same three-tier hullWood curtain, same residuals.
3. MG LINES — READ in BOTH 3C elevations (own reading of the crops):
   plinth slot z -0.95..-1.70 at ITS 2.65 band (rod z -0.80..-1.79 at
   the certified 2.6625 top; receiver 2.648 over z -1.30..-1.49 spanning
   x -0.62..-0.88 = its wider 2.62-2.65 front band; the -1.838..-1.912
   band-end step box unchanged behind the slot), plus the re-posed
   cupola rod as the second line. Side tops unchanged (ref 2.65 at
   -0.72..-1.51 = rod; flicker 2.62-2.67 to -1.88 = receiver/posts).
Honest residuals: as 3B (band p75 95 vs ref ~107, crisp fold-band edges
at 2x, inner-corner run-end strip, whip-tip aliasing pair, s4 window
quantization).
Predicted per-view (r5 critic: 8.0 min): front 8.5 · frontleft 8.5 ·
left 8.5-9.0 · rearleft 8.5 · rear 8.5-9.0 · rearright 8.5 · right
8.5-9.0 · frontright 8.5 · top 8.5.

## Shaded-parity r6 (2026-08-02) — FAIL 8.5 all views; MG rods zero on 3C
Shared r6 work order. 3C: rods absent on all four elevations — build
them to measured-render proof; flap tone 63→70.

## VISUAL round r7 (2026-08-02, merkava agent) — the three 9.0-gating items
Gate after the round, TWO consecutive runs bit-identical: **hull 91.2 /
whole 90.6 / turret 90.7 / stations 92.5 / dims 100 / floaters 100 (min
90.6, PASS x2)**. Siblings bit-identical; npm test 166/166. Shared fix
list + ALL r7 laws (the measured FLOAT LAW — the ref's forward "band"
is two floating rod lines over sky, its wall lives only at z -1.3..-1.9;
short-pitched-crown reach law; per-half frame anchors; camo-bucket roof
plates): see merkava3b.md "VISUAL round r7".
3C-SPECIFIC this round:
- MG RODS MEASURED (was ZERO everywhere): right x 358..384 w27
  ytop~263 (+ w9/w10 rearward) vs REF x 356..378 w23 ytop~277 — and the
  float BREAK at its pano (ref -0.97, proc -0.98: the 3C pano at -1.10
  STAYS, it IS the break; only the ring moved to -1.45). Left: proc w8
  (its ref shows zero — band wall from z0 -0.72; presence kept per the
  work order's "rods visible" intent). Front: ref zero = proc zero.
  Rear: ref's w6/w13 floats are its whip-can furniture (p95 budget —
  documented gap, see 3B).
- Float-law knob deltas vs 3B: slot z0 -0.95 -> -0.74; rodZf -0.63 /
  tipDrop 0.0555 (its -0.594 col stays saddle-clean; s4-s7 targets are
  2.663 — no police pinch); left band box 2.62 -> 2.52 (its lower droop
  bottoms at 2.556); notch box 2.59 -> 2.55; mid-left shelf z0 -0.78 ->
  -1.28 (front x-run z-agnostic); spine wedge rakeX 2.578 -> 2.548;
  pad z0 -1.28 + wall dressing rides it.
- CANVAS: band rect p5/p25/p50/p75/p95 = 84/87/95/104/109 vs its ref
  81/86/92/98/112 (r6 p75 95 -> 104) — closest quartile match in the
  family; same crown-wave + prism-fold + hem-smile grammar as 3B
  (Kasag stack untouched, still crowns the field).
- ROOF: top rect p5 66 (ref 75), med 76 vs 85 — fused; saucer shadow
  plate -> detail, shelf plate -> camo bucket.
- FLAP TONE (work-order trivia): woodHex 0x463d30 -> corner flap block
  samples 68.2 vs ref ~70 (was 62.2; first cut 0x4a4134 sampled 74.9 —
  sRGB law, dialed back).
Honest residuals: as 3B (crown amplitude vs print texture, med 95
floor-clamp, rear mast floats unmatched) plus its s4 window
quantization note stands.
Predicted per-view (r6 critic: 8.5 min ALL NINE): front 8.5-9.0 ·
frontleft 8.5-9.0 · left 8.5-9.0 · rearleft 8.5-9.0 · rear 9.0 ·
rearright 8.5-9.0 · right 9.0 · frontright 8.5-9.0 · top 9.0.

## Shaded-parity r7 (2026-08-02) — FAIL 8.5 all views; same six-item set
Shared r7 work order. 3C extras: drop the left w8 rod float (ref shows
none), chains thick-sticks → fine.

## VISUAL round r8 (2026-08-02, merkava agent) — the six-item 9.0 set
Gate after the round, TWO consecutive runs bit-identical: **hull 91.5 /
whole 90.6 / turret 90.8 / stations 92 / dims 100 / floaters 100 (min
90.6, PASS x2)**. Siblings bit-identical; npm test 166/166. Shared fix
list + ALL r8 laws (the rear-skyline crown measurement + crownprofile
calibration, lane/slope/span laws, the ringTub stepY BUG FIX + 1024-ref
tail shape, up-face-gated roof lift, fine chains, mantlet wrap, skirt
hem/bead, tower shave): see merkava3b.md "VISUAL round r8".
MEASURED (tools/tmp-crownprofile.py, same window):
- CROWN: maxflat 39px -> **15px (ref 24)**, rev(w3) 11 -> **21 (ref
  20; critic target ~17)**, amp 102px.
- ROOF (top rect): med 77 -> **87.1 (ref 86.5)**, p5 65 -> **78 (ref
  78 EXACT)**.
- MG RODS: **left w8 float DROPPED (PROC 0 runs = REF 0 runs)** — the r8
  work-order extra. Mechanics: left band box top 2.52 -> 2.545 (the
  r7-measured <1px-sky kill value; the droop bottoms at 2.556 so the
  certified 2.62 side cols still ride the rod), split into three x-steps
  (2.545/2.539/2.543 — the raised top would otherwise rule a 32px
  skyline flat). Right float: proc w19@263 main run (+w9/w10 rearward)
  vs ref w23@277 — the box lift absorbed the front ~7px of the r7 w27
  as predicted; float alive and within family.
3C-SPECIFIC this round:
- The 32px flat @x391 was ITS plinth FRONT wall segment (z -0.72..-0.74
  top 2.65 — the 2 cm sliver's forward-z h'-boost crowns the skyline
  x -0.66..-0.94): same three-x-step treatment as 3B via crestWaves.
- The 19px flat @x232 was the r7 shelf clutter plates' ruled tops: both
  re-rolled (rz 0.022-0.05) + split; third shelf nub at x 0.665.
- Kasag stack untouched (still crowns the field; certified band).
- Band rect: proc 63/84/93/105/112 vs ref 82/88/96/101/114 (med/p75/p95
  in family; p5 63 = fine-chain darks + valley shadows, same class as
  3B's honest residual).
Honest residuals: as 3B (band p5, sleeve ring rhythm, tub quantization);
its s4 window quantization note stands.
Predicted per-view (r7 critic: 8.5 all nine): front 8.5-9.0 · frontleft
8.5-9.0 · left 8.5-9.0 · rearleft 8.5-9.0 · rear 9.0 · rearright
8.5-9.0 · right 9.0 · frontright 8.5-9.0 · top 9.0.

## GRADUATED 2026-08-02 — DUAL-GATE PASS (fleet graduate 9)
Geo 90.6 gatePassed + critic 9.0 ALL NINE VIEWS (r8). FREEZE HASH
5287233e (41 meshes, 147216 verts). Registration retired; override
added w/ followers; icons x5 staged.

## Graduate-change round r12 — TRACK CONTAINMENT (2026-08-03, NEW hash 1d9b026c)

Fleet-worst-class rear clip (303 front / 718 rear exact voxels) fixed
under the graduate-change protocol; NEW hash 1d9b026c (was 5287233e) —
re-freeze at the orchestrator's landing after critic re-cert. Gate HELD
x2 at the graduation-class line: min 90.5 (91.5/90.5/90.8/92/100/100).
`track-clip-audit --exact` now reads **0 / 0**.

Same minimal-footprint set as 3B (see its r12 note): wrap-station yB
lifts (2.28/1.95 -> 1.13; -3.47 -> 1.06), keel.hwClamp 1.13,
corner-curtain v2 tiers outside the band shell, rearFlaps[0] -> -3.945,
frontBoard z1 -> 2.26, wall/filler clamps, tailRack.frontClear
{z:-3.92, bot:1.06}.

SELF-AUDIT (shots/merkava-r12/critic-merkava3c-final, before/after on
the changed views): rearleft cornerL IDENTICAL (p5/p25/med 29.5/64.3/
78.7); rearright flapR med 99.8 -> 97.7 (ref 81.3: toward ref);
view-rear corners p25 82.6 -> 83.4 / 84.0 IDENTICAL; wheel row
byte-identical. No regression candidate; re-cert requested.

§I mg-census note: the 3C roof guns are the same hand-authored
ref-parity instruments as 3B/3D (see the 3D packet's §I justification).

## §B5 TURRET-FURNITURE PARENTING round (merkava-b5, 2026-08-04)
Owner law 2026-08-04 (BUILD-STANDARD §B5). Same mark class and same
delivery as the 3B (see merkava3b.md §B5 for the full mechanics — the
two marks share merkavaChassis's rearPack/tailRack code paths; the 3C has
no lobeL and its own oracle decor numbering). LANDED STATE: opt-in
machinery only (c.bustlePackTurret, default OFF, set on NO mark) — hash
1d9b026c UNCHANGED, gate x2 IDENTICAL to the ledger row (min 90.5: hull
91.5 / whole 90.5 / turret 90.8 / stations 92 / dims 100 / floaters 100).
Flip BLOCKED on the same coupled oracle/override change.

STRANDED FURNITURE: identical assembly to 3B (rearPack pile y 1.30..2.39
+ tarp wings tops 2.26 + posts/dressing) — swing-test fails against the
vane underside 1.88 the same way. Articulation strips: bug in
artic-before-merkava3c.png, fix in board-after-merkava3c.png.

MEASUREMENTS (flag temporarily ON, then reverted):
- Official audit: stranded 4 -> 2, dangling 0 (residuals = merged
  hull-loft 44% + hullDetail 63% envelope-smear unions, adjudicated-hull).
  Per-add: 61 -> 11 (periscope rims + loft bands only).
- Gate vs current oracle: min 90.5 -> 18.6 (hull 18.6, whole 43.9,
  turret 60.0; stations 92, dims 100, floaters 100) — hull-anchored
  height-registration collapse, plan rows survive (~96): the coupling
  proof, see 3B.
- Rest pixel-diff: 75,918 changed px across 12/14 views (close-front +
  close-roof IDENTICAL), max delta 48, confined to the pack/wings region
  (shots/merkava-b5/diff-rest-merkava3c/) — camo-bucket vertex-bake
  frame dependence; full §10 critic re-cert required, cheap pixel bar
  unreachable.
- Yaw proof pairs: yaw90-before-merkava3c/ (bug) vs yaw90-after-
  merkava3c/ (pack rides the bustle).

COUPLED CHANGES TO FLIP: oracle repair (preferred) — re-parent
vehicle#ex_decor_10/11/15/16/17 (raw y 1.96..2.55, z -4.23..-3.18) into
the 3C print's ^Turret$ node, world transforms preserved (deck boards
12/14 stay hull); FALLBACK followers extension for the three override
maps: 3c: ex_decor_(?:0[1-9]|1[01]|13|1[5-7]). Then bustlePackTurret:
true + gate hold + critic re-cert + re-freeze, one commit.
Deterministic flag-ON hash for that re-freeze (measured this round,
camoSeed 4242): 1d9b026c -> e454a60a (41 meshes / 146136 verts — vert
count unchanged: pure re-parent).

## §B5-r2 RE-TUNE round (merkava-b5-r2, 2026-08-04)
Same coupled flip + re-anchor as 3B (see merkava3b.md §B5-r2 for the full
mechanism a-h; the two marks share every tail assembly and took identical
geometry values — 3C has no lobeL and its own followers extension
ex_decor_(?:0[1-9]|1[01]|13|1[5-7])). Per-mark deltas only:
- tr.fall breaks one bin earlier: [[-3.88,1.562],[-3.99,1.532],
  [-4.31,1.462]] (3C ref reads 1.538 already at -4.05..-4.15 where 3B
  holds 1.564).
- Known residual: the loft line at -3.74 reads 1.615 vs 3C ref 1.59
  (one bin, 0.026 — the shared body table favors 3B's ref there).
FINAL HASH FOR THE RE-FREEZE: d3358744 (41 meshes / 148584 verts).
Siblings byte-frozen (see 3B §B5-r2 list).

ROW LEDGER (pre-flip record -> coupled-flip crater -> §B5-r2 final):
  side_hull    91.5 -> 90.6 -> 91.9      turret_side  90.8 -> 75.7 -> 90.8
  side_whole   90.7 -> 90.5 -> 91.1      turret_plan  92.3 -> 85.8 -> 91.7
  plan_hull    96.7 -> 81.5 -> 93.6      stations     92.0 -> 92.0 -> 92.3
  plan_whole   95.6 -> 90.1 -> 95.2      dims          100 -> 100  -> 100
  front_hull   92.3 -> 93.2 -> 93.1      floaters      100 -> 100  -> 100 (x5)
  front_whole  90.5 -> 90.6 -> 90.5      min          90.5 -> 75.7 -> 90.5 PASS x2

HONEST RESIDUALS: front_whole 90.5 floor (skirt-hem bottom class, see
3B); turret_side 90.8 (sleeve-band columns + the 3.34-row 0.159);
side_hull cover 0.66 (ref z 3.13 pod sliver — dims-tripwire adjudicated,
see 3B law bank).

## §B3 POD-IDENTITY graduate-change round (2026-08-05, merkava family agent)
Owner directive ff50bf5 (NO MYSTERY BOXES — "random boxes that are not
ERAs around armor and especially guns", the merkava mantlet area named):
the two measured cheek-shoulder pod boxes beside the gun root read as bare
cuboids at 1x. Graduate-change flow (gate hold x2 + changed-view re-cert
list + re-freeze at landing).

### Change (merkavaPodTell, podTell: true)
- RIGHT pod = gunner's sight: pale hood lip over a dark aperture slot with
  the lens inside, hood side cheeks, wiper tick, outer-face louver pair.
- LEFT pod = fitting bin: lid seam ring, latch pair + keepers, handle bar,
  stiffener line.
- MASK SAFETY by construction: the pod boxes themselves are UNTOUCHED
  (the certified mask carriers); every tell lies strictly inside the pod
  x/y footprint at <= 5.5 mm face-proud (the r10 "+3 mm strap over
  certified tops" precedent class); the certified 15 mm glass strip is
  kept byte-identical as the lens. No piece rises above pod top or
  leads the lens line.

### Gate hold (official rig, x2)
- Run 1: min 90.5 — hull 91.9 / whole 90.5 / turret 90.8 / stations 92.3 / dims 100 / floaters 100 PASS
- Run 2: min 90.5 — hull 91.9 / whole 90.5 / turret 90.8 / stations 92.3 / dims 100 / floaters 100 PASS
  (every component EXACTLY the frozen row — the tells are mask-invisible
  as constructed). Floaters 100 both runs. turret-parent audit unchanged
  vs HEAD A/B. Furniture is casting-fixed turret-bucket
  (yaws with the turret; no re-parenting, yaw pair n/a).

### Re-freeze
- hash d3358744 -> 4880b0a4 (meshes unchanged, verts 148584 -> 149160).

### Changed-view list (for the independent re-cert critic)
- close-front, view-front, view-frontleft, view-frontright,
  hero-frontleft, hero-toptilt, close-roof (pod faces);
  view-left / view-right / view-top carry only the sub-pixel louver/seam
  hairlines and the <= 6 mm proud face-edge slivers.
- Unchanged views: view-rear, hero-rearright and every hull-only crop.
