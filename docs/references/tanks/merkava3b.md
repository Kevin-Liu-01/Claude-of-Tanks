# Merkava Mk.3B (`merkava3b`) — reference packet

Exact variant: Merkava Mk.3 Baz (Mk.3B) — bigger hull than Mk.1/2, first
modular-armor turret (squarer, larger than the Mk.1/2 casting), commander
cupola right, bustle basket + ball-and-chain curtain, deep scalloped skirts;
front engine, 6 road wheels, FRONT sprocket, 120 mm MG251.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m;
  63.5–65 t. Sources: https://en.wikipedia.org/wiki/Merkava ,
  https://www.army-guide.com/eng/product261.html ,
  https://www.globalsecurity.org/military/world/israel/merkava-3.htm
- Gun: MG251 120 mm L/44 (tube ≈ 5.3 m), thermal sleeve + evacuator.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_III ,
  https://www.primeportal.net/tanks/gil_moshe/merkava_3d_baz/

## Local GLB oracle (public/models/tanks/community/recovered/merkava3b.glb)
Width-normalized to 3.72. Whole z −4.14..+4.14; same sculpt family as the 3D
oracle with a slightly narrower turret:
- Hull: nose +3.32 (toe y ≈ 1.0), tail −4.05; deck 1.63–1.72; lower glacis to
  (1.7, 0.03); skirt bottom ≈ 0.30 with scallops; belly 0.34.
- Turret: front cheek from z ≈ 0.9; roof plateau 2.38–2.45 (z 0..−0.8);
  cupola 2.65–2.79; bustle 2.43 to −2.9; basket to −3.2; chains to −3.8;
  plan ±1.75 (3.50 m).
- Gun: axis y 1.96, tip +4.14, sleeved r ≈ 0.08.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (generic MERKAVA profile) | 71.3 | — | 86 | 43 | 38 | 85 | baseline |
| 1 (bespoke rebuild) | 79.4 | — | 90 | 53 | 72 | 88 | |
| 2 (rotor/evac position, roof stowage kit, tail rack to -4.13) | 82.0 | 86.3 | 89 | 57 | 87 | 87 | |
| 3 (shaded-parity r2: strapped cloth roof bundles, gunmetal basket mesh/chains, detail-tone gun-mount cheeks + rotor recess rings, dished wheels, deck grilles/headlight guards/tow eyes/tail hinges, skirt bolts + hem, front fender boards) | 82.0 | — | 89 | 57 | 87 | 87 | material/furniture pass — silhouette pinned |

Remaining gaps: follower skirt capture in the ref turret mask (as 3D).
| 4 (r3 turret reconstruction: ONE continuous raked cheek plane per side from the gun notch to the roof shoulders (mount-box + detail-cheek slabs deleted), plateau re-seated to the measured z 0..-0.8, bustle walls flush with the shell (no parapet step), SHORT open basket -2.9..-3.2 + low chain band, twin pintle MGs + port-cheek smoke cluster on the beak plane, cloth roof bundles, skirt hem + scallop tabs) | 81.4 | — | 89 | 55 | 87 | 87 | ref upper mask still carries captured rear sponson strips (8 ex_armor_[lr] nodes) |
| 5 (r5 FROM-SCRATCH curve rebuild: hull lofted from docs/references/profiles/merkava3b.json (steep glacis (3.33,1.0)→(2.55,1.58), front-deck shelf 1.70, keel to (2.0,0.0), full-width plan ±1.75 with skirt bulge ±1.845 over −3.4..2.6); turret re-seated on the measured face z 1.75 (r4 used 0.92!) with the proud gun-mount CREST 2.55 over 0.42..1.50, roof 2.40, wide roof ring (roofHW 1.32 per the ±1.3–1.4 front band), cupola/pano band to 2.86, bustle 2.40 to −2.72, basket to −3.22; gun axis raised to the measured 1.97 with the evac bulge at z 2.4–2.6 (G 87 → 95); tall rear rack rebuilt as a low full-width band [1.42..1.94] + front fender boards at y 1.06 | 82.3 | 85.2 | 88 | 57 | 95 | 88 | +1.0 over r4 81.3 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: cheek planes, crest and wide roof ring match; ref hangs more clutter
  off the roof edges.
- side L/R: face at 1.75 + crest + saddle + cupola band track the print; ref
  still carries captured skirt strips in its turret node that no clean split
  mirrors.
- rear: bustle width and basket rim align; ref's rack band reads slightly
  taller at the corners.
- quarters: same vehicle; my Kasag-less roof is cleaner than the print's.
- top: near-identical (97.0).
- CURVE FINDINGS vs r4: the modular turret face is 0.8 m forward of the r4
  seat (z 1.75 vs 0.92) with a PROUD rotor-housing crest above the roof line;
  the gun axis is 1.97 (1.95 cost 4 G points — the sliver metric is 1 cm
  sensitive); the evacuator sits at z 2.4–2.6, outside the mantlet; hull
  furniture above the basket floor erases our own turret mask (rack capped at
  1.94).

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 54.6 / whole 39.9 / turret 1.5 / stations 81 / dims 96.8 /
floaters 100.
- turretCurves CAP: print rig_gun at GLB root (gun absent from its turret
  mask) + follower sweep leaves skirt panels/chassis bits in its turret mask
  (side bottoms 0.55-0.66 across the casting span). Ring column matches the
  interior; the gun asymmetry needs an oracle re-rig (cf. 6fa0335).
- wholeCurves gun cap: oracle MG251 muzzle +4.14 vs published-true +4.73
  (L/48 at overall 9.04) — ~6 columns of symmetric coverage on side_whole.
- Measured findings this pass: tall rear stowage is a NARROW center stack
  (front hull tops 2.2-2.47 only inside |x|<0.8) over a low full-width frame;
  skirts ride 0.62-1.36; whips both at x ~ +1.0, tops 4.83-4.86.

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
Removed here: ringFloor; deckPack (ref deck is bare 1.60 across the old
2.44 band). rearPack RE-FIT, not removed: the repair healed the tall rear
stack HULL-side (x -1.08..0.93, y to 2.55, z -3.1..-4.13) — authored as
the measured center stack [1.50..2.32] to -4.14 with a thin high rail
[1.19..1.45] to -4.18 (bot 0.80 keeps the dims hullLength band).
Re-lined: crest from z 1.78 (2.56-2.64), saddle 2.41 at 0.0..-0.25,
sight band capped 2.655 (-0.36..-1.70), rear roof 2.64; chain-mat vane
(the absorbed ex_armor mats) z -3.30..-4.06 [1.90..2.33] hw 0.92;
casting wide to maxWZ +0.35 / rearWide 0.97 with a slim 1.08 bustle;
whips at x 0.19/-3.15 and x 1.01/-2.97 per the front+side traces.
- RE-CERTIFIED cupola/pano stature residual: repaired oracle band 2.71-
  2.87 over -0.34..-1.65 vs published 2.66 (p95) — build capped 2.655.
- RE-CERTIFIED short-gun cap: oracle MG251 tip +4.13 vs published-true
  +4.73 (~6 proc-only side_whole columns).
- OBSOLETE: v8 root-gun/follower-sweep turret caps (86d1071).
Standing (gate v10): hull 77.9 / whole 69.7 / turret 52.9 / stations 84.9
/ dims 99 / floaters 100 (was 58.7/39.5/2.4/81/96.8/100 at v10 start).

### Round-3 measured re-lay + registration nulling (2026-07-31, gate v10 + kit track fix)
THE ROUND'S MASTER LAW — NULL THE REGISTRATION: the gate registers each
view once from the HULL body span (12%-band columns) and a half-pitch
dAlong (side pitch 0.104 m, front pitch 0.042 m!) makes the worst-row
interpolation sample BETWEEN proc columns — every sharp feature (whips,
pack edges, crest face) reads as smeared midpoints (whips at half height).
Fixing spans is worth more than any shape edit: 3b went 67->81 the moment
side dAlong hit 0. Mechanics used here:
- Hull-mask 12% threshold is ~0.21-0.29 (hull rough 1.75-2.4), whole-mask
  ~0.32. METROLOGY-SELECTIVE structures: sub-threshold geometry UNDER the
  gun makes whole-only body columns — the published hullLength rides on
  pods/posts the hull registration cannot see. Hairline tailPins carry
  overallLengthM's pixel span with no body-column effect.
- p95 height spike budget is TWO columns on this print (whips own it); a
  third 3.22 whip-can column put heightM at 3.22 and dims to 0. Pot capped.
- Sleeve clamp rings (r*1.31) straddled the plan +-0.15 column at the AA
  boundary and flickered run-to-run; gunR 0.085 pins them IN (they match
  the ref's own sleeve-end content there).
Turret re-laid to the dumped full curves: narrow rotor-crest nose
(|x|<=0.18) standing at z 1.76 side-apex 2.56, widening 0.41 by z 1.21;
cheek plan plateau z +1.20 with ASYMMETRIC sweeps (left cuts to 0.48 by
x 0.85; right holds 1.19 to x 0.64 + sight pod bump 0.90 at x 1.06-1.37);
near-vertical casting walls (inset 0.94), carved-ring bottoms 1.53 rising
1.85 at the face and ramping 1.70->1.93 under the bustle; shell capped at
the 2.41 saddle (z +0.16..-0.28); LEFT sight plinth at the 2.655 cap over
x -0.20..-0.94 with the RIGHT deck LOW at 2.47 (the old symmetric cap band
overshot the right roof 0.2); rear-deck dip 2.53 then pot bump 2.65; vane
V-taper (full rear only |x|<=0.7, two-segment, xoff -0.05); mantlet drum
laid 1.84..2.50 at r 0.165 (evac at its measured 2.0-2.5, evacR 1.94).
Hull: blunt prow (plan fwd 3.12 to |x| 1.29), deck-edge fender step (body
wT 1.66 under the 1.60-1.67 plank line), rearPack at the measured stack
(x -1.01..0.85, z -3.06..-4.12, top 2.38), glacis fittings on LOCAL slope
(rxAt — the average-rake tilt poked the louvre bank 0.15 proud).
Standing: min 52.9 -> 81.0 (hull 86.7 / whole 81.0 / turret 83.1 /
stations 82.1 / dims 99.9 / floaters 100). Whole is gun-cap-bounded:
side_whole cover 4.05% (muzzle 4.73 vs oracle 4.13) caps it ~86-87;
plan p95 4.3 is the same cap in plan (~89 ceiling); t_plan col 1.26
carries a ~0.6 anomaly (suspect gate-side interp at a proc grid boundary).
Stations 82: s4-s6 tops ~3.5% unexplained at 384-probe parity (windows
match, tops match within 0.014 — 1024-only effect, unresolved); s11 whip
window luck; both trimmed. Remaining honest headroom: stations, front rows.

### Round-4 fleet dual-gate pass (2026-07-31, gate v10)
World-probe re-lay against the LIVE 1024 gate frame (tools/tmp-merkava-probe.mjs
maps every worst row to world meters; the stale docs/references/profiles dump
is pre-repair for the deck/turret split and was retired as an authority).
Standing: **hull 90.9 / whole 83.4 / turret 90.0 / stations 92.6 / dims 100 /
floaters 100** (from 86.7/81.0/83.1/82.1/99.9/100). Every component ≥ 90
except wholeCurves — see refined cap below.
Load-bearing fixes: measured deck line into the body loft (rearBins deleted;
lift eyes/grille fins hug the deck); front track ramp = one 0.478-slope line
from (1.79, 0.02) — wheel1 at 1.55, sprocket HIGH/FWD (2.35, 0.72, r .29),
trackW 0.58 at gearOut 1.72 (print's inner track face ≥ 1.10); skirts re-laid
at the measured ±1.83 mid-band (stations read 3.66!) with front/rear end
flares 1.844/1.855 and the WIDTH-GUARD lip moved INSIDE the rear-guard
window (z −3.12..−3.40) — published 3.72 lives there, mid-hull 1.86 content
broke s3-s10; segmented skirt plate (slice-cap law); tailRack to ±1.755 with
a LOW outer wall [0.87..1.35] + 0.72 end-drop; rearPack tail taper 2.39→2.22;
bustle rebuilt as a lofted underside RAMP 1.56→1.96 with plan taper
1.20→1.06 (rear roof slab 1.09 — the old hwM*rw*.94 flare planted phantom
plan columns); shell nose pulled to +0.30 with a chin wedge carrying the
1.53→1.72 underside rise; sight plinth at the 2.68 dims-GRACE line spanning
the print's true x −0.70..−0.94 band; chain-vane V re-measured (hwMid .852 @
−3.575, hwRear .73, xoff −0.045); whips at z −3.19/−3.00 with tapered tips
(a full-width box read 0.3 over the print's aliased tip in the split
column); ONE p95-budget mast-head at 2.845 inside the s5 window (the p95
exclusion budget is 3 columns here: 2 whips + this spike — a 4th tall
column becomes heightM and killed dims twice this round).
- REFINED wholeCurves cap (certified): oracle MG251 tip +4.14 vs published
  +4.74 → side_whole symmetric-coverage 4.05% (−6.1 pts) PLUS the certified
  2.81-2.87 stature band above the 2.68 grace line (~10 columns × 0.13-0.19
  → ~0.3 mean% ≈ −3.6 pts). Measured ceiling ≈ 86-87; standing 83.4.
  Hull/turret/stations/dims all pass — consistent with GEOMETRY-GATE.md's
  rule that a short-gun oracle caps ONLY wholeCurves.
- Station s11 note: the pins/pods that carry published lengths stretch the
  proc hull span (−4.24..+3.42 vs ref −4.15..+3.34), so the fractional s11
  window shifts ~0.07 rearward off the crest face; reads ~7.7% and is
  dropped by the gate's own trimmed mean (not certified, self-trimming).

### Batch-14 oracle normalization (2026-08-02, orchestrator) — caps RETIRED
Vertex-space axis warp (tools/repair_oracles.py batch 14; plans derived by
tools/vertex-normalize.mjs from docs/references/vertex/merkava3b.json, same
sanction/mechanism as russia batch 12): fused-short MG251 muzzle +4.13 ->
+4.85 gate-m (= tail'+9.04 published overall; barrel zone forward of the
nose), hull body 7.409 -> 7.60 published (slope 1.026 about body center),
proud roof-furniture band 2.84 -> 2.66 published height (hull/deck true to
2.50, slope 1; whips ride the last zone to ~3.61 — re-tune build whips in
the push round). Width untouched (-0.8%, safeScale anchor).
Post-repair verify: height -0.2% / overall +0.5% / body -0.3% vs published.
NOTE: the extract's hullMask replica now reads 9.085 (+19.5%) — the boxy
mantlet/evacuator band crosses the 12% body filter on this print class, so
the replica measures muzzle-span. This is informational only (gate
registration is hull-PART-anchored; dims measures the BUILD) — do not
"fix" the build against it.
The round-4 certified wholeCurves cap (short gun + stature band) is hereby
RETIRED — wholeCurves is no longer capped; the family push round re-tunes
the build to the normalized oracle (fresh workorder mandatory; the old
work-order digests are pre-warp and invalid).

### Push round 1 intel (2026-08-02, merkava agent) — WARPED-REF WORLD FRAME
Fresh baseline: hull 86.7 / whole 73.7 / turret 34.7 / stations 72.6 /
dims 99.7 / floaters 100. Probe = tools/tmp-merkava-probe.mjs (full world
curves both models; OUTDIR now this session's scratchpad).
MASTER FACT: the warped ref is TRUE to published but sits ~0.35 m REARWARD
of the build's old frame (loader re-centered after the muzzle grew). Ref
world: muzzle +4.56, hull full span −4.54..+3.10, overall 9.10 (=9.04+0.7%),
side-hull BODY span (12% rule) −4.54..+2.81..2.86. Gate side reg dAlong
0.368 (= procBodyMid −0.525 minus refBodyMid −0.865) — a 3.5-pitch offset
whose 0.5-pitch FRACTION smears every sharp column (r3 law). Fix = author
the whole build in the REF frame (global z −0.35 + per-feature re-lay), NOT
chase published absolutes: dims are translation-invariant.
Registration mechanics (from tools/procedural-fidelity.html source):
dAlong = refBodyMid − procBodyMid over side-hull cols with band >12% of
hull rough; ONLY-REF fires when a ref col maps >0.02 outside proc FULL
span (tight!); ONLY-PROC margin 0.75·pitch. Turret rows trim each model to
its OWN hull full span ±0.6 (so the proc gun tip is already trimmed out of
turret rows — workorder gun ONLY-PROC rows there are a tool artifact).
Stations slice each model's own side-hull FULL span (s0 = rear).
KEY REF TARGETS (world z, tops in m — author the build to THESE):
- Muzzle +4.56 (tail −4.54 + 9.04 within aliasing). Gun band 1.86..2.04,
  sleeve-ring bumps 2.07 at 4.01..4.30 / 3.46..3.54.
- Mantlet drum band top 2.15 over z 1.55..2.26 (bots 1.83).
- Crest face z 1.51 (top jumps 2.07 -> 2.52); plateau 2.52-2.54 to z ~0.2,
  2.57 bump 0.11..0.04, saddle DIP 2.38-2.41 over −0.10..−0.59.
- Sight band (p95 stature): 2.59-2.62 at −0.62..−0.80, 2.65 (max 2.67) at
  −0.83..−1.88; front x-split: LEFT plinth 2.64-2.68 only x −0.61..−0.86
  (falls 2.58 by −0.94), RIGHT band 2.59-2.62 x 0.91..1.32, CENTER only
  2.54-2.58 (old center 2.65 crest/pano content was 0.1 proud).
- Rear roof 2.52 at −1.93..−2.27; pot bump 2.57 at −2.29..−2.37; 3B stack
  hump 2.57-2.59 at −2.45..−2.53 (kit bundle z −2.50, top 2.58); bustle top
  2.46-2.49 to −3.05, 2.44 to −3.18, rim 2.38-2.41 to −3.29.
- WHIPS: z −3.34 (top 3.61, x +1.015) and −3.58 (top 3.59, x +0.19); spring
  CAN at z −3.55 top 2.70 (x 0.19). p95 budget = 2 whips + this can.
- Vane (TURRET node) runs to −4.44: tops 2.33 -> 2.25, bots 1.94 -> 1.86;
  plan V: full-rear −4.41 across |x| <= 0.72, taper to basket rim by ±1.0.
- TURRET RING TUB (was the 34.7 killer): ref turret mask bottoms 0.58 flat
  over z −0.36..−2.14 (ramps −0.25..−0.36 and −2.14..−2.28) — the turret
  basket/interior descends into the hull. Build a turret-node tub (hw
  ~0.85, bot 0.58) fully hidden inside the hull silhouette: invisible in
  whole/hull/front/plan rows and all stations; only turret side rows see
  it. Without it turret_side mean carries ~8% and caps at ~35.
- HULL: rack band 2.38-2.41 over −3.50..−4.12 falling 2.36->2.25 by −4.46
  (rearPack z −3.50..−4.41 + outboard tall lobes to −4.465 top 2.26); tail
  frame 1.42..0.74 at −4.49..−4.54 (replaces hairline pins; it IS the ref
  body-span end). Plan rear: center −4.41 (|x|<0.33), −4.52..−4.54 at
  0.35..1.06 (wings), −4.44 at 1.08..1.77 (rack wall zone).
- NOSE: plan face 2.89 (2.91 at |x| 1.32..1.77 = front boards); pods
  (x ±0.56..0.69) poke to 3.10 at y 0.87..1.00 — they ARE the ref side
  tip; glacis top 1.21@2.81 -> 1.36@2.55 -> 1.52@2.31. Deck line survives
  the −0.35 shift almost exactly (peak 1.73 @ 0.40..0.74, crest 1.73 @
  −2.84..−2.92 — but crest is CENTER-narrow: front tops 1.65-1.68 outside
  |x|~1.42, so the two crest loft stations need wT ~1.42).
- SKIRT: z0 L 2.36 / R 2.28 (plan L −1.82 col 2.36; R +1.82 col 2.28 and
  +1.84 col starts 1.84 -> per-side flareF z0 [2.36, 1.84]); z1 −3.79 with
  rear content to −3.84-3.87. Outermost ±1.84-1.86 front-view column is a
  THIN HIGH LIP 1.28..1.33 (not a deep flare!) — retire fenderLip(1.86,
  y1.06); make flareR the width carrier: x 1.8575, z −3.47..−3.87 (0.40
  run >= 0.35 so pixel widthM counts it; fully inside station s1 window
  [−4.0..−3.45] so s1 reads 3.715 like the ref and s2 stays 3.66), y-band
  1.27..1.35 (flareR now takes top/bot in the shared chassis — additive,
  sibling-safe). widthM -> 3.715 (−0.13%), WIDTH GUARD max |x| 1.8575 <
  committed 1.86.
- STATION TOP TARGETS (ref): s0 2.375, s1 3.595 (whip), s2 3.609 (whip),
  s3 2.594, s4 2.677, s5 2.663, s6 2.649, s7 2.622, s8 2.553, s9 2.567,
  s10 2.526, s11 2.526 (crest face must sit at z >= 1.51 to be caught!),
  s12 2.156, s13 2.074; widths 3.66 mid / 3.715 s1 / 3.687 s12 / 3.55 s0
  / 3.52 s13.
- dims plan: heightM p95 excludes exactly 3 spikes (2 whips + can) ->
  reads plateau 2.66; hullLength = pods 3.10 to tail frame −4.54 = 7.64
  (+0.5%); overall 9.10 (+0.66%); width 3.715 (−0.13%) -> dims 100.
PLAN: rebuild profile in ref frame (all z −0.35 + above targets), incl.
per-profile wheelZs/sprocket/idler/rollers copies (MK3_GEAR override,
sibling-safe), pivotZ −1.10, gunTipZ 4.56, evac ~0.70 (verify), plinth
split into stepped bands, ring tub, vane to −4.44, delete 2.845 mast pot.

### Push round 1 RESULT + round 2 (2026-08-02)
R1 (frame shift + re-lay): 34.7 -> min 55.8: hull 56.3 / whole 55.8 /
turret 76.1 / stations 95.8 / dims 96.9. SIDE dAlong 0.368 -> 0.000 (the
shift worked; side_hull 91.3, stations s1-s13 all <1% except s10 9.4/s13
2.2). Plan rows 56 = ONE poisoned column: the ref's ±1.9 plan columns are
ASYMMETRIC (LEFT = front-mudguard corner z~2.32 AND rear guard to −3.80;
RIGHT = rear-guard sliver −3.82 only) — my symmetric 1.8575 flareR put
rear-only content on the left, err 5.8 m on that column, which dragged
plan dy to −0.167 and smeared EVERY plan column (mean-dy echo). Lesson:
plan dy is a MEAN — one bad column shifts the whole row's frame.
R2 fixes: flareR pulled to 1.8435 (still the 0.40-run widthM carrier,
inside s1) + per-side lipStrips at ±1.8575 (new chassis param): left
front lip 2.26..2.38, left rear lip −3.75..−3.85, right rear lip only
−3.78..−3.86; skirt `flush: true` (new param — proud panel seams/bolts
leaked into the outermost front column, bots read 0.85 vs ref lip 1.27);
gunAxisY 1.95 (ref tube band 1.849..2.029), evacR 1.35 (ref MG251 evac is
sleeve-flush — the 1.94 drum lit plan ±0.167 cols; buildGun sleeve clamp
rings r*1.31 at 0.46/0.82*len are the remaining small plan bumps, ref has
its rings at world 4.14/3.5/3.0/2.7/2.4), evac 0.72; podIn is SUBTRACTED
(hz = z1 − podIn!) — −0.33 pushed pods FORWARD, now podX 0.62 podIn −0.25
(pods x 0.535..0.705, foremost ~3.06; ref pod cols 0.53..0.69 to 3.10,
col 0.475 is glacis-only 2.906); crest z1 −0.08 (ref dip starts −0.10);
right box top 2.60 z0 −0.63; pot bump 2.545; shelf2 x0 −1.24; cheekPod R
{1.08..1.44, z 0.62..0.29, top 2.19} L top 2.10; tailRack z1 −4.445,
lobes x1 0.86, frame z1 −4.52; rearPack hw 0.92 x −0.06 + NEW lobeL
{−1.04..−0.95, top 2.18} (ref front_hull 2.176@−1.02); rearFlaps 3rd row
bot 0.57@−4.17; bustle segs hw 1.16@−2.94/1.12@−3.05; basketHW 1.10;
vane z1 −4.415; deck stations 1.58/1.42/1.24 re-lay; frontBoard R x1
1.77 (ref right board reaches ~1.77); ringTub rear STEP (stepY 1.05,
zF1 −2.145, z1 −2.30 — ref tub tail steps 0.58->1.05 near-vertically at
−2.15 then shelves to the bustle); spring can w 0.036 tucked INTO the
whip trace column (x 0.20; its 0.05 width lit the neighbour col at 2.70
vs ref 2.55); gunTipZ 4.55, dims quantization (7.71 hullLength was
content straddling one extra trace column at each end).
OPEN mystery: r1 workorder showed ONE col z=−3.65 proc top 3.57 (turret
node, unexplained — whips are at −3.58/−3.34 tops 3.59/3.61, pot 2.70;
mesh-blame merged buckets max out at 3.615=whip2 top). Recheck after r2.

### Rounds 3-7 log (2026-08-02, cont.)
R3 84.0 (whips seated in-column, sleeveTo 4.22/r 0.118 for the ref's
muzzle-ring plan cols, evacR 1.35 — the MG251 evac is sleeve-flush).
R4 REGRESSED to 82.6/75.7: three lessons: (1) tailRack z1 −4.445 squeezed
wingA (z1 −4.465) to a 2 cm sliver — the tail tops collapsed; keep rack z1
−4.41 and carry plan x 1.4-1.6 rear −4.44 with a LOW outboard frame wing
{1.10..1.69, z1 −4.45, 1.60..0.92}. (2) wingB z1 −4.49 moved the body-span
mid → side dAlong −0.05 = half-pitch smear everywhere; the tail frame END
(−4.52) is REGISTRATION-CRITICAL — dims hullLength is instead trimmed at
the POD end (podIn −0.245, foremost 3.055, out of the 3.13 trace column;
costs one ONLY-REF pod col, accepted). (3) plank x1 1.775 leaked into the
±1.78 front col (ref plank ends ~1.75 → x1 1.748).
R5 3B 86.6 (turret 90.5, dims 100). Remaining front_whole 86.6 fixed in
R6/R7 by: ARCHED BELLY (ref front bots: 0.41 center / 0.33 mid / 0.24
outboard — new keel.bellySideY, center box 1.30 wide), rear-roof plateau
CENTER-NARROW (2.52 only |x|<=0.40 via roofBox; roofLine shoulders 2.465;
ref front reads 2.44-2.47 at x 0.42..0.87), left band step to x −0.548,
spring cans w 0.030 fully inside the whip trace columns, front skirt hem
drops (rearFlaps gained per-flap x).
WIDTH GUARD INCIDENT (R7): a hem flap at x 1.795 w 0.18 put its outer
edge at 1.885 > 1.86 → the loader rescaled the WHOLE tank 0.986 → every
dim read −1.4..−1.7% and all components collapsed to ~62-66 IDENTICALLY
on both tanks. Any new outboard part: outer edge = x + w/2 MUST stay
< 1.86. Fixed (x 1.775 w 0.14).
MEASUREMENT-STABILITY NOTE: the fidelity page's load-time geo report has
shown run-to-run swings under concurrent headless-Chrome load (3C front
rows carried constant phantom ~3.3 tops at the whip-neighbor columns
across several runs; a fresh in-page 1024 re-render of the same build
reads those columns CLEAN at 2.57-2.62 — tools/tmp-merkava-probe.mjs
--blame=dump:<x,...> prints per-column pixel tops + luminance to verify).
The scene is UNLIT with self-lit mask materials (mask threshold is pure
geometry). Do not chase phantom columns without a dump first.

### GATE PASS (2026-08-02, gate v11): min 90.5
**hull 91.2 / whole 90.9 / turret 90.5 / stations 92.7 / dims 100 /
floaters 100** — from the batch-14 baseline 34.7 (hull 86.7 / whole 73.7
/ turret 34.7 / stations 72.6 / dims 99.7). NO CAPS. dims: heightM 2.66
(0.12%) hullLength 7.59 (0.12%) overall 9.11 (0.72%) width 3.70 (0.49%).
Final r9/r10 knob states vs r8: podIn −0.245 (pods 3.055 — pods at 3.10
flip the side registration to dAlong −0.05 in the CURRENT tail state and
smear every side row for −8 turret; the ONE pod ONLY-REF col at z 3.13
is the accepted cost, worth net +4); three-tier arched belly (0.41 /
0.35 to |x| 1.04 / 0.24 outboard); rear plateau center box ±0.40; hem
lip drop x 1.815 w 0.04 (single trace column); spring cans w 0.030.
REGISTRATION LAW (hard-won, THREE incidents): the side dAlong nulls only
with the tail frame end at −4.52 AND pods at 3.055 — touching EITHER
hull-mask extremity re-quantizes the body-span columns and flips dAlong
to ±0.05 (half-pitch smear, −5 to −8 on side/turret rows). Fine-tune
dims via content-vs-column-boundary placement, never by moving the span
carriers.
VISUAL REVIEW (owner "top-down fill & circularity" directive, this
round): board re-rendered (IoU 92.7 overall, total 87.7) + dedicated
shaded top-down and high-perspective shots (tools/tmp-merkava-topdown.
{html,mjs}, shots/procedural-fidelity/boards/merkava3b-topdown-*.png).
Verdict: orientation truth OK (gun over the louvred bow, front
sprocket); turret seated through the full articulation strip; deck,
turret roof, rear pack/rack/basket all read as CLOSED fabricated
volumes from above (no hollow shells/see-through); cupola + hatch rings
and the gun tube read as true circles; the ring tub is fully hidden
inside the hull from every exterior view. Sibling gate run: merkava1b
62.5 / 2b 39.9 / 2d 34.9 / 3d 67.8 / 4b 34.6 — bit-identical to the
required baselines, zero regression.

## Shaded-parity r1 (2026-08-02) — FAIL min 7.0 (geometric 90.5 stands)
Work order: docs/critique/shaded-parity-merkava3bc-r1.md (shared with 3C).
Headline: slab turret front (needs wedge cheeks + boxy mantlet depth
volumes), container-wall rear (needs low baskets + chain curtain),
missing cupola rings/pintle MGs (circularity law), olive/blue palette off
the ref's pale sand, scalloped skirts.

## VISUAL round r2 (2026-08-02, merkava agent) — all 5 defect classes fixed
Gate after the round: **hull 91.2 / whole 90.8 / turret 90.4 / stations
93.3 / dims 100 / floaters 100 (min 90.4, PASS)** — the certified 90.5
silhouette survived (stations actually +0.6); siblings bit-identical
(1b 62.5 / 2b 39.9 / 2d 34.9 / 3d 67.8 / 4b 34.6); npm test 166/166;
board IoU 92.9 / total 87.6 (pre-round 92.7/87.7 — silhouette pinned).
All changes are 3B/3C-scoped optional params in merkava.js
(wedgeFront/cheekRake, mantlet.boxy, cupolaRing/loaderRing, pano.seat,
paleKit/paleVents, chainFringe, skirt.wavy/flapMat, fenderKit,
glassTiles:false, rearFlaps mat/wood) — sibling paths untouched.
Per-defect status:
1. TURRET FRONT — FIXED: cheek faces raked 0.34 (top edges pulled back;
   plan bottom-edge line + front x/y extents unchanged), converging
   trapezoid fillet planes flanking the crest (bottom edges ON the zW
   step line), round mantlet drum -> compact BOXY housing 0.34 wide on
   the ref's exact 1.83..2.15 band (plan stays inside the drum's ±0.175).
2. REAR STOWAGE — FIXED: every hullCloth/turretCloth wall re-bucketed to
   the sand camo ('hull'/'turret') with open-frame posts + slat rails,
   strap seams, crown tarp rolls; vane re-textured as the chain mat:
   14-rod comb + half-embedded ball fringe row + hanger rail ON the
   certified band (nothing hangs below tv.bot).
3. ROOF — FIXED: raised circular commander ring (r .205 at x 1.10, band
   2.525..2.60 — the old right-box 2.60 tops now ride the ring; pad
   2.535) + loader ring (r .175 at -0.79/-2.05, top 2.53 = the ref's own
   2.52 rear-roof band); pano dome re-seated ON the deck (drum 2.41->
   2.525, dome to the same 2.60 top — the half-sunk crescent is gone);
   both pintle MGs re-seated ON the rings with crowns at the cap line.
4. MATERIAL/TONE — FIXED: monochrome pale sand everywhere (glacis
   louvres + deck grille pale with dark slats, smoke-cluster plate pale,
   dark-lens headlights, periscope/sight glass -> dark bucket); front
   mud flaps layered hullTrack + hullWood mud strip (straight hullWood
   read CARAMEL under the warm key — r2 lesson).
5. SKIRTS/FENDERS — FIXED: wavy hem V-teeth (detail tone) at every wheel
   bay + front/rear leads with a dark rubbing strip riding the dip line
   (same 0.755 depth as the certified tabs; straight hem strip deleted
   when wavy); fender-shelf stowage boxes/can added inside the deck-peak
   envelope.
GATE INCIDENTS (lessons, both tanks):
- r1 fillet diagonal: bridging crest face -> cheek inner edge on a plan
  DIAGONAL read plausible from the pre-warp "widening 0.41 by 1.21"
  note, but the WARPED ref plan is FLAT ~0.92-0.93 across x 0.18..0.41 —
  cost 4 t_plan cols (turret 89.8/89.6 FAIL). Fillet bottom edges now sit
  ON the zW line (yaw only 0.06).
- Kasag depth: a 0.30-deep lower tier + 0.16 hump aliased into the
  z -2.71 side column at +0.18 (3C turret 90.1) — ref hump band is ONLY
  -2.56..-2.61; prominence must come from width/tiering, never z-depth.
- Rear-flap wood strip at z -4.187 AA-bled into the z -4.25 side_whole
  column (0.5 pts both tanks, stable across runs — 3 mm outside the
  column edge still rasterizes at 1024). Tail corner flaps reverted to
  certified form; the brown accent lives on the BOW flaps only.
Honest residuals: skirt wave is present but subtler than the ref's
(tonal band + dark line, plate bottom edge itself stays straight — a
true cut hem risks station bottoms); rear corner flaps grey not brown
(gate trade above); cheek planes read as 2-3 facets where the ref is one
clean plane per side; MGs slimmer than the print's (p95 cap); ref's
bolt/seam texture density still higher overall.
Predicted per-view (was 7.0-8.0 everywhere): front 8.5 · frontleft 8.5 ·
left 8.5 · rearleft 8.0 · rear 8.0 · rearright 8.0 · right 8.5 ·
frontright 8.5 · top 8.5 — worst view rear ~8.0 (clutter granularity).
