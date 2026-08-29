# T-84 Oplot — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: LastTriarius T-84 remix (effective CC BY-NC-SA) in candidates-gen2/t84/ — known inaccuracies (early-T80 engine deck, fuel-tank mounts)

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.72 m (gun fwd) |
| hull | 7.08 m |
| width | 3.56 m |
| height | 2.22 m |
| weight | 46.0 t |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/modern/Ukraine/T-84.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=304

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-t/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:T-84

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## Oracle state (orchestrator, 2026-08-03)
Warped to published dims by repair batch-24 (roof was TRUE; Kord/sight
furniture knee 2.23; hull + FUSED tube stretched, muzzle pinned rear+9.72
— print has no gun node, so the game gun never elevates; fused-shell
class). Extract verifies 0.0-0.9% all axes. Buildable.
NOTE: batch-24 was DISABLED by the 2026-08-03 incident — the live oracle
is the PRISTINE short print again (overall 8.58 / hull 6.40, −11.8%).

## r30 FIRST BUILD (2026-08-04, russia agent): donor stand-in -> real profile
## 0 -> 15.4 min ×2 (hull 29.9 / whole 15.4 / turret 36.1 / stations 69.3 /
## dims 99.4 / floaters 100) — dims-sovereign vs the pristine SHORT print

buildT84 in src/vehicles/profiles/russia.ts (RUSSIA_PROFILES.t84 replaces
the t80u donor stand-in). Spec dims sovereign: hull 7.08 / overall 9.72 /
width 3.56 / heightM 2.22 BARE-ROOF (unlike t54/t44 there is no MG
convention here — the print's 13-col 2.53-2.60 sight/Utes cluster is
score-carried, not dims-carried). standard-check: holes 0 ✓, mg1 ✓ (Kord
as compact FITTINGS.pintleMG, crest ~2.40 over ≤2 cols), clip 76/235
(strip/sponson fleet class).

BANKED LAWS FROM THIS BUILD (short-print class — read before the re-warp
round):
1. DO NOT STRETCH a short print's features to published dims: the gate
   registers BODY-SPAN MIDS, so a ×1.107 z-stretch put every feature
   0.1-0.35 off its registered pair (means 4-6% on every row — measured,
   reverted). Author features at PRINT-registered positions and carry the
   published dims as PURE END EXTENSIONS (they ride as ~3-9 cover
   columns, priced once).
2. END EXTENSIONS RE-REGISTER THE PAIR: adding the stern stack moved the
   hull body-mid (dAlong 1.11 -> 0.86) and silently re-seated the ref
   0.28 behind my turret (turret 33 -> 6 across two runs that "didn't
   touch the turret"). Re-derive turret/gun seats from a fresh digest
   after ANY hull-end change on a dims-short print.
3. Distribute the dims margin REARWARD where the print is tube-only
   forward: a bow extension paired against the ref's bare-tube columns
   (errs 0.3-0.6); the same margin at the stern rides as ONLY-PROC cover.
4. The unstretched end extensions are too THIN to count as hullLengthM
   body columns (12% band rule) — they need band-deep anchors (bow corner
   stacks + stern stack, t80 pattern) or dims under-reads by ~2%.

Registered print reads (authored frame = print mid at -0.24 after the
final registration; digest-derived): deck dip 1.21, engine plateau
1.33-1.38, ring deck 1.324, glacis 1.28@1.74 -> nose 0.96@3.20; tracks
grounded -1.89..2.27, rear wrap bottoms 0.65-0.74 (high stern fade, t80
class); welded turret: roof 2.13-2.21, bustle 2.11-2.23 to -1.58, cheeks
1.94-2.04, plan front 2.13/rear -1.80, apron 0.94; tube axis 1.845
r 0.105, evac 0.125 @ registered ~3.3; print tube ends ~5.4 (mine pinned
5.94 = stern -3.78 + 9.72; ~6 muzzle cols ONLY-PROC accepted).

Honest ceiling: the −11.8% print means ~9 permanent cover columns
(side_whole −8 class) + the sight-cluster carry (~8 cols ×0.3) until the
batch-24 re-warp relands gate-in-loop against THIS build (its "stretch to
pub dims" recipe would then meet a build already at pub dims — expect
side/plan rows to jump into the 60-70s).

## r31 RE-ANCHOR (2026-08-04, russia agent): post-warp rebuild -> GATE PASS
## 11.1 -> 90.9 min ×2 (hull 90.9 / whole 92.2 / turret 91.4 / stations 96.3
## / dims 99.1 / floaters 100) — standard-check PASS (clip 18/0, holes 0,
## mg1+2d), first russia-family geometric pass since t72b3m

Post-warp (batch-35, be7eb4f) the r30 short-print laws RETIRED: buildT84
re-authored 1:1 in the WARPED REF'S WORLD FRAME (extract hullMask −4.858..
+2.222, muzzle +4.863) — no end extensions, no cover margin, max |x|
EXACTLY 1.78 (kills r30's 0.9958 safeScale shrink). dAlong 0.000 on every
row; dims heightM 2.24 (grace), hullLength 7.00 (1.11%, −0.9 — quantized,
kept: the next 0.1213 bin either end costs −2.6 in side rows).

Done-gates (official rigs): geometry-gate ×2 = 90.9 PASS both;
tank-standard-check PASS; track-clip-audit --exact 18/0 (≤60 band — the 18
is an unnamed proxy-class sliver at y 0.58..0.66 z 1.94..2.0, no real
contact); visual-evaluator clean, parity yawProxy ≤0.8° all 14 views
(evidence shots/visual-eval-t84/); critic pairs shots/critic-t84/ + round
copies shots/russia-r31/. Graduates pt91m e6994e54 / t72b3m c19ec9f0
verified; siblings re-gated byte-stable (t90m 81.7, t80 82.5, t80b 81.6,
t80bv 35.5, t90a_vladimir 53.6, t64bv1 57.4 — all == committed ledger).

BANKED LAWS (r31):
1. RE-ANCHOR = REBUILD IN REF-WORLD FRAME. After an oracle re-warp to
   published dims, re-author IN the ref's own world coordinates (extract
   hullMask/box) instead of patching offsets — dAlong pins to 0.000 and
   every workorder column becomes directly authorable.
2. WORKORDER SIDE-Z BUG: the stock vertex-workorder derives its shared-box
   center while the gate page leaves models HIDDEN (floater-sweep state) —
   side-view z labels ran +0.54 off ref-world this round (y is
   ground-calibrated and safe). Fixed variant with visibility-restored box
   probe + full-row JSON dump: tools/tmp-t84-workorder-full.mjs.
   ORCHESTRATOR: consider patching vertex-workorder.mjs itself.
3. BIN-BOUNDARY LEDGER: side/plan pitch 0.1213 m, FRONT pitch 0.0405 m at
   this shared box. ~6 pts of this round were faces poking 2-25 mm past a
   column boundary (roof plates, carrier, bustle corners, collar, track).
   Keep faces ≥15 mm clear (§C) and RE-CHECK after any change that moves
   the shared box — the bins re-roll.
4. TRACK METAL PRINTS WIDER THAN trackW: instanced link-pad pin bosses
   +0.024/side, sprocket drum +0.030/side (measured — tools/
   tmp-t84-aabbprobe.mjs world-AABB probe). trackW 0.50 @ xc 1.24 fits the
   ref's 0.99..1.52 ground band inside the front bins.
5. INNER PIN ENDS CLIP THE TUB: the same overhang inboard (x 0.9635)
   clipped the ±0.98 wLo walls at both wrap zones (audit 268/302) — wLo
   tapers to 0.94 where the climbs pass; audit -> 18/0.
6. DRAWN-CLIMB EMPIRICS: buildRunningGear's departure ramp zeroes
   0.12-0.45 m PAST contactZ* (tangent overhang varies with idler
   distance) — pin contacts by measuring the drawn line, not trig.
7. FRONT-VIEW BOTTOM PROFILE IS FIRST-CLASS: the "anchor debt" craters
   were the front rows in BOTH oracles (18.3/11.1 pre- and post-warp).
   Center belly pan 0.23 (|x|<=0.835) / tub step 0.35 / ground band
   0.99..1.52 / flap+lip hardware bought ~30 front points. bellyCorners
   0.001 lines are usually TRACK content (min over x), not the tub floor.
8. FUSED-PRINT PLAN LAW: the ref's side band can exceed its plan width —
   evac authored as a BOX (tall/narrow, ±0.20 plan per the ref's own
   ±0.15/0.18 bins) and tube r 0.100 keeps the ±0.1015 plan bins dark
   while holding the 1.94..1.73 side band.
9. FENDER-BAY COVERS BETWEEN THE RUNS: top-down enclosed holes between
   track and skirt close with plates at y 0.805 (bottom run <=0.11, top
   run >=0.99) — zero clip voxels, zero silhouette change.

Variant tells (§H4): right-flank bustle stowage (print asymmetry, plan
−2.26@x0.87..1.09 / −1.87@1.10..1.20), LEFT pano-sight shoulder block
(front 2.243 to x −1.02 — left side only), Kord swung rear-left over the
plates, twin 5-tube Tucha banks inside the tube-band lane.

Honest residuals (worst columns, workorder frame): rear sprocket-wrap
−3.9..−4.1 proc 0.30..0.34 vs ref 0.36..0.40 (arc-vs-straight-ramp class,
~0.04 ×3); front climb 1.69..1.81 −0.04..−0.09 ×3; stern ramp step −4.32
−0.07 ×1; cheek base 1.58 vs 1.669 @ z W 0.2..0.32 (collar/chamfer trade,
−0.04 ×2); muzzle-tip col 2.23 top −0.055 ×1. Critic-lane notes: skirt
band reads shallower than the ref's full-depth side mass (wheel row
exposed dark — pt91m rubberBotH/material-split candidate); the mantlet
gun-slot notch (print-faithful, deck-backed, holes 0) may read dark from
hero angles.

## r32 ORDER ROUND (2026-08-04, russia agent): critic r31 FAIL 7.8/8.01 ->
## all four §B2 void families closed + gray-primer family re-slotted; gate
## 90.2 min ×2 (hull 92.0 / whole 92.3 / turret 90.2 / stations 95.3 /
## dims 99.1 / floaters 100) — hull +1.1 over the r31 record, audit 4/0,
## holes 0, mg1+6d

Work order: the archived visual-review receipt (verdict on 2c262e52).
Landing hash **531fe4f0** (47 meshes / 84292 verts); graduates verified
byte-frozen at every batch (pt91m e6994e54, t72b3m c19ec9f0). Evidence:
shots/critic-t84/ + shots/russia-r32/ + shots/visual-eval-t84/.

ORDER 0 (§B2, mandatory) — border-flood enclosed-sky scan (mask-method
|px−0x151b20| maxch <=13, 8-conn background flood, >=12px clusters,
label-text excluded; tools/tmp-t84-r32-measure.py):
- Baseline 18112 px across 13 proc views -> **2182 px across 4 views**;
  10/14 views scan ZERO. Every ordered TRUE-SKY window is closed and
  raycast-verified solid (tools/tmp-t84-r32-probe.{html,mjs} — DoubleSide
  re-test finds no culled-face holes):
  - 0a V1 slot lane (304/307px side orthos): flank walls x ±0.795..0.855,
    z W −0.50..−0.14, y 1.64..2.06, inboard of the ±0.86 cheek planes —
    dead-front occluded, side columns were EMPTY where the ref is solid.
    Turret rows took it as fill (turret 91.4 -> 91.5 at that batch).
  - 0b V2 under-skirt tunnel (1794/1463px): TWO-COURSE DEEP SKIRT — upper
    course keeps the certified 1.72 face, hem 0.72 -> 0.64 (the gate's
    ±1.74 front bins want 0.63; the stern rows follow the ref's rising
    belly rake 0.33->0.64 — a first flat-0.26 full-face hem read err
    0.191 ×2 front + 0.135 ×1 side and cost 2.8 hull pts, reverted);
    lower course insets to x 1.6825 (face 1.66..1.705, inside the 1.7213
    bin), hem 0.26, wheelbase z −3.55..0.86 only. 0.26 overlaps the
    bottom-run chain-rail tops (0.271) so no side slit survives. BOTH
    sides (the left ortho's "backed" read was drainage, not backing —
    probe showed 37% through-sky there too).
  - 0c V3 slat ladders (418/404px front + ~10 rows/face): NOT holes —
    the fixed near-black pad/chain clones (0x171614/0x27251f) rendered
    INSIDE the ±13 bg tolerance. pt91m r27 gear recipe: padHex 0x343a29,
    chainHex 0x2b3122, gearFloor:true. Front track faces now read as lit
    link ladders; rear rows gone.
  - 0d V4 pod-flank columns (1212/1202/170px): deep fender boxes at the
    strips' own certified x-planes (xi 1.52 — a first 1.53 edge left a
    1-2px hairline against the 1.5165 pad-boss print), tops FOLLOW the
    deck line 4mm under, z 0.87..1.93 + nose cap at 2.00 (the §B2
    top-down scan caught a 1-cell pocket ring after the flap re-seat —
    capped). Plus TRENCH CLOSE-OUT: the skirt-to-track corridor ran open
    the whole hull and exited at the stern (120px pairs threading over
    the V4 slabs at y0 1.24..1.28) — floored at the bay-cover plane
    (z −3.50..0.86, clear of both wrap zones) and capped at the stern
    (z −4.36..−4.30 behind the skirt rear edge, mask-identical).
- Residual 2182 px, ALL probe-verified SOLID shade-class (grazing-angle
  camo on the glacis/stern deck, proxy-turret shadow on the roof plates,
  shaded gear bay through the fender gap): view-front 93px, view-top
  14px, hero-rearright 159px (r31-identical pre-existing family),
  hero-toptilt 813px, close-roof 1103px (was 2651). The evaluator's
  hero-rearright "enclosed-void 1.697 m²" is the same LUMA detector that
  fired in r31 — §B2 cross-check on the zone: 0 sky px, bg census 1,
  and the tone is now camo-class (see group 1).

GROUP 1 (raw-gray family) — the flat-gray primer was the turretDark RING
CARRIER stack (0x36342f) showing its bare faces at z W −0.16 (front
letterbox) and −1.74 (rear collar) + the canyon walls/floor; re-slotted
to the camo bucket (geometry byte-identical). Done-gates (official pair
renders, ITU-601):
- 1a letterbox (855..1065, 258..285): sd 2.5 -> **11.3** (gate >=8),
  g−r −1 -> **+8** (gate >=+5), med 67.8 vs ref 66.8.
- 1a collar (855..1065, 275..340): med 56.0 -> **62.2** (gate 66.2 ±5),
  sd 5.2 -> **11.2** (gate >=9).
- hero-rearright canyon zone: bg 1, med 56.5 with sd 14.5 / g−r +4 /
  p75 72.6 vs ref 72.9 — a walled camo recess in shadow now, not the
  gray trench (r31: sd~5 gray, g−r −1).
- 1b: two gunDark seam rings at gun-z 0.45/0.66 r 0.088 dress the bare
  root stage (inside the ±0.1015 plan bins and the 1.94..1.73 band).

GROUP 2 (side-mass depth + gear shade):
- 2a left lower band sub-30: 2405 -> **0** (ref 0); track rows
  y372..379 med 6.8 -> **51.4** (gate >=35, ref 55.4); wheel-row p5
  18.0 -> 51.4 (ref 51.5).
- 2b delivered as the deep two-course skirt (see 0b) — the ref's ONE
  camo mass to near ground. Honest misses: pale>=95 in the lower band
  1/0 vs targets 60/150 and R skirt-band p75 60.7 vs ref 73.0 — the
  family camo canvas + bakeDirt dust gradient cap pale reach at hem
  depth (fleet materials, not addressable from the profile); med/p5/
  sub-30/sd all land in ref class.
- 2c spike comb: no per-tank horn params exist in the shared shoe
  geometry — the tone lift + deep skirt kill the against-sky comb read
  (ground line now reads as link texture); carried as partially
  delivered.
- 2d stern bullseye: dark cover discs outboard of both sprocket drum
  faces (x 1.547.., r 0.23 inside the 0.27 drum silhouette).
BANKED LAW (r32): fixed near-black GEAR reads as §B2 SKY under the
mask-method — pad/chain hexes must clear bg+13 in shade or the scan
counts venetian-blind holes through every wrap face.

GROUP 3 (roof furniture, budget lane):
- 3a cupola: raised drum (wall 2.14..2.238 — top AT the heightM grace
  ceiling; the ref's own side line here is 2.05..2.19 so silhouette
  height is razor) + recessed dark hatch + SEVEN vision blocks flush to
  the rim; reads as a drum at close-roof. Zone sub-45 4403 -> 3758
  (ref 478 — the rest is proxy-turret shadow + dark camo patches, not
  the cupola).
- 3b Kord: scale 0.50 -> 0.62, mount 0.735 (nsvt receiver top = mount
  +0.192: at 0.705 it hid 1.3cm UNDER the 2.205 plate line — measured,
  the "1px rod" root cause), barrel yaw −2.2 -> −1.75 (the z-spread put
  the 2.31 crest on THREE side columns at +0.05). 3x close-roof crop
  reads gun-with-receiver+cradle+ammo; skyline break preserved.
- 3c: FITTINGS census mg1+**6d** (rack over the right-flank bins at
  outer face 1.08 — the print's stowage plan steps to −1.87 at x
  1.10..1.20 and a 1.17 seat printed +0.176 into the 1.15 plan column;
  spareTrackLinks ×2 + towCable(eyes:false) recessed flush on the
  engine deck; roof-plate seam lines). Edge census (|∇L|>12, same-method
  ref): turret roof 2584 vs ref 2644 (**0.98 — was 0.60-class**),
  engine deck 1734 vs 2559 (0.68, was 0.49), glacis 2326 vs 2961 (0.79).
- 3d Kontakt-5: four low-relief wedge rows + dark seam gaps on the
  upper glacis following the deck fall (<=18mm proud at row edges).
GROUP 4: bow pegs re-slotted to the rubber/flap class and tucked
(hookX/hookY/hookZ/hookBucket opt-ins on ruGlacisKit — the default
w*0.30 hook seat was ALSO the r31 audit's "unnamed 18-voxel sliver";
explicit hookX 0.86 clears the wrap dilation, audit 18 -> 4 front, the
4 = the flap kissing the dilated wrap, no real contact); wide center
flap ±0.95 at z 1.925 under the nose (front-mask interior: bins keep
the 0.225 pan minimum). 4b done-gate: close-front under-pod bg census
+1052 -> **−422** (gate: within +300). Residual: the outboard
flap+bracket pair still reads as two dark sticks at close-front 3x
(now rubber/gunmetal, attached at the stub face — wide/short flap
variants that would fully occlude them re-seated the side registration
and cost 1.3-3.1 hull pts (§C stray-column law) and were reverted;
carried at quarter-point class).

Gate cost ledger vs the r31 90.9 record: hull 90.9 -> **92.0** (+1.1,
the V4/flap/skirt front-bin work), whole 92.2 -> 92.3, dims/floaters
equal, stations 96.3 -> 95.3 (deck kit, i2 1.41-class) and turret
91.4 -> 90.2 — the priced cupola/Kord/rack furniture tax (side rows at
'at' 1.15/1.26/1.37 now +0.036 ×3, BETTER than r31's own +0.046-0.051
×3 there; the mean carries the distributed 2-4cm roof adds). Official
rigs at landing: geometry-gate **90.2 PASS ×2 bit-identical**
(gatePassed:true re-read from JSON both runs); track-clip-audit --exact
**4/0**; tank-standard-check PASS (clip ✓ holes 0 ✓ mg1+6d ✓);
visual-evaluator exit 0, RIG PARITY OK (max dYawProxy 1.8° @close-roof,
max |dCentroid| 0.03 m); critic pairs zero console errors.

Self-read floors (builder, not a verdict): the four ordered void
families no longer exist at any angle; the flanks are one deep camo
mass with lit gear; the turret face/collar/canyon are scheme camo; the
cupola is a drum and the Kord a gun. Worst remaining reads: the
proxy-shadow dark band across the roof plates at close-roof (solid,
269px bg-tolerance), the hero-toptilt grazing strips, and the
close-front flap sticks. Self-read ~8.8-9.0 floor on the side/rear
ring, close-front/close-roof the risk views.

## GRADUATION FREEZE (2026-08-04) — the program's 19th graduate
Dual gate: geometry 90.2 PASS x2 bit-identical (f27feef: hull 92.0 /
whole 92.3 / turret 90.2 / stations 95.3 / dims 99.1 grace / floaters
100) + independent critic PASS floor 9.0 mean 9.14, every view >=9.0
(346c758). HASH FROZEN: **531fe4f0** (47 meshes / 84292 verts) — any
change to buildT84 or its shared helpers is a graduate-change and takes
the §10 re-cert flow. userdrops7 recovered registration RETIRED (t84
removed from the ALLOW_LOCAL_RECOVERED_MODELS loop + USERDROP7_SOURCED_IDS);
reference mirrored into the three measurement override maps
(procedural-fidelity / tmp-tank-critic [gitignored] / visual-evaluator-page)
with no harness offsets. Core variant backfill: clean (no t84 row). Icons
regenerated from the procedural build (5 by exact name, rest restored).

## BATCH-40 TURRET-SEAT PLAN (r33 MEASURE+PLAN, 2026-08-04, russia agent)
## Owner report: "turret elevated too far away from the hull ... an issue
## with the base model." VERDICT: real — the print's casting floats 0.28 m
## over the ring deck AND the print hides a squat deck + squat casting
## behind that float. Plan = compound oracle seat (global y_map + Turret
## translate) + coupled proc re-seat. GRADUATE-CHANGE round: nothing here
## is landed; orchestrator executes the batch, THEN russia re-anchors.

MEASUREMENT TABLE (fresh probes, committed post-batch-35 print; frame:
raw glb u, ground y=0.0000 exactly, registration s = 3.56/width_raw =
3.56/39.4812 = 0.090169 m/u — verified equal to the loader+harness
composite: s_loader = min(9.72/107.87=0.09011 len-limited, 3.8448/39.48,
2.886/24.86) then width safeScale 3.56/3.5577 = 1.00066, clamp far from
0.68/1.65; probes tools/tmp-t84-seatprobe2.py + tmp-t84-rimhist.py +
tmp-t84-siblingprobe.py + tmp-t84-batch40-dryrun.py):

| band (model u -> m)               | print now      | family truth / target |
|---|---|---|
| ring-deck plateau (z -12..+14)    | 14.682 = 1.324 | 1.39-1.45 (see below) -> **15.52 = 1.3994** |
| engine hump top (z -14..-20, ±10) | 15.270 = 1.377 | 1.45-1.50 -> **1.4851** |
| casting shell rim LOW (z +8..10)  | 17.746 = 1.600 | seats deck-0.02..-0.03 -> **1.3769** |
| rim by z: ring 18.07-18.22, cheek-rear 18.44-19.07, bustle 20.55-20.59 | 1.63-1.86 | rising skirt line 1.42..1.70 |
| casting roof plateau (z -6..+6)   | 24.750 = 2.2317| pub 2.22 -> **24.6202 = 2.2200** |
| furniture crest (squashed cluster)| 24.864 = 2.2420| rides -> **2.2303** (score-carried) |
| free tube axis (z 30..68)         | 20.595 = 1.857 | -> **1.7036**, r 0.1234 CIRCULAR |
| basket plug disc (x ±7.8, z -2..10)| 10.682 = 0.963 | interior -> 0.494 (enclosed, above tub floor) |
| DAYLIGHT rim-vs-deck              | +3.06u = +0.28 | **-0.25u = -0.023 contact** |

- Proportion corroboration (the "real roof line"): the T-80 family
  prints (t84's direct lineage, same gen2 contract) read ring deck =
  0.631/0.633/0.635 of their own tops (t80/t80b/t80bv), i.e. ~1.39 m at
  pub height, with casting rims 0.020-0.028 BELOW the deck (seated) and
  casting visible heights 0.74-0.85 m. The certified russia builds agree:
  t72b3m GRADUATE deck 1.395-1.422, t90m 1.35-1.39 (seat 1.40), t80-line
  seats 1.45. The t84 print is the outlier on BOTH counts: deck/top
  0.590 and rim +0.276 OVER the deck — the float hides a ~0.08 m deck
  deficit and a ~0.21 m casting-height deficit (0.63 m vs family
  0.74-0.85). heightM datum re-confirmed BARE ROOF 2.22 (r30 law; Kord/
  sight cluster is score-carried; dims row is proc-only p95-tops).
- Naive seat-down (drop only) is REJECTED by measurement: rigid drop to
  deck+contact reads ~1.97-2.03 top (heightM -8.6%); rigid-casting with
  deck raised to compensate needs deck 1.61 (0.73 of height — off family
  by +0.21). The truth is the COMPOUND: deck UP to family line, casting
  STRETCHED to family visible height, roof pinned at pub 2.22.

BATCH-40 RECIPE (batch-29 format; law v2). RE-BASELINE per the batch-29
fbc4f14 pattern: fresh .bak from committed HEAD bytes (be7eb4f embodies
batch-35's z-warp; archive the pristine bak as
t84.glb.bak.pre-batch40-history) — batch-35 demotes to history and this
recipe is the compound seat ALONE on the new baseline, in the post-35
frame. Census of the committed bytes probe-verified (2, 98284, 259887).

    REPAIRS['t84'] = [
        ('py2', _axis_warp('t84', long_axis='z',
                           y_map=[(0, 0), (11.0, 11.0), (14.682, 15.52),
                                  (19.0, 22.501), (22.2, 25.701),
                                  (24.75, 29.8235), (30.0, 35.0735)],
                           long_map=[(-39.2986, -39.2986), (68.5737, 68.5737)],
                           y_top_max=29.95, expect=(2, 98284, 259887))),
        ('translate', 'Turret', [0.0, -5.2029, 0.0]),
    ]

Zone derivation (u; slopes monotone >0): 0..11.0 identity (tracks/
wheels/skirt hems/belly + width anchor untouched); 11.0..14.682 slope
1.22759 (hull upper band: deck 14.682->15.52 = 1.3994, fender/glacis
lines follow proportionally); 14.682..19.0 slope 1.61672 (daylight +
casting lower wall: rim 17.746->20.4736; the hull's engine hump rides
this zone's toe, 15.27->16.4706 = 1.4851);
19.0..22.2 slope 1 (FUSED-TUBE PROTECTION: tube band 19.226..21.963
rides rigid — stays circular); 22.2..24.75 slope 1.61667 (dome band:
roof 24.7498->29.8232); 24.75+ slope 1 (squashed furniture rides).
Then the Turret-node translate -5.2029 seats the casting: net rim
17.746->15.2708 (1.3769, 2.2-3.4 cm INTO the deck line = family contact
class), net roof 24.7498->24.6202 (2.2200 EXACT), furniture crest
24.7349 (2.2303), tube axis 20.595->18.892 (1.7036). y_top_max 29.95
covers the PRE-translate warp apex 29.9378 (the guard runs inside
_axis_warp before the translate; final top is 24.7349). Order matters:
warp FIRST (zones defined in the unmoved frame), translate second.
Turret node y 10.68191 -> 5.47901; gate autoPivot keeps using the node
origin (0.494 world > 0.25, inside the loose turret box) and x/z pivot
is untouched — rig parity preserved. In-memory dry-run on all 98284
verts (tools/tmp-t84-batch40-dryrun.py) reproduces every number above.

PREDICTED REF SHIFTS PER GATE ROW (ledger frame: side 'at' = -(gate z),
gate z = (z_model - 14.6376) x 0.090169; shifts are absolute-Δ per zone
and frame-independent; plan/x rows CANNOT move — both ops are y-only,
and ref z/x extents are unchanged so camera pitches and station bins do
NOT re-roll):
- side_hull: refTop ring-plateau cols ('at' +0.06..+2.41; at = -(gate z),
  anchor: the r32 cupola/Kord/rack trio sits at 'at' +1.15/1.26/1.37)
  +0.075..0.077 (1.324->1.3994); hump cols ('at' +2.58..+3.12) +0.108
  (1.377->1.4851); stern-deck cols ('at' +3.2..+4.4) +0.083..0.093 (the
  1.337-1.351 stern plateaus sit in the k2 zone); glacis-fall cols ('at'
  -0.3..-2.2) +0.066 at the 1.28 line tapering to 0 below 0.992;
  refBot all cols UNCHANGED (identity below 0.992).
- side_whole: hull cols as above; casting cols ('at' -0.45..+3.04)
  refTop -0.012 (2.2317->2.2200); tube cols ('at' -0.45..-4.86) band
  -0.153 both edges (root band 1.942..1.778 -> 1.789..1.625, tip cols
  follow).
- turret rows (side; scored with the hull row's fixed reg): band top
  -0.012 at casting cols; band BOTTOM = the hull-mask top at ring cols
  (the certified 'at' 1.15/1.26/1.37 worst trio — ledger refBot decodes
  to a 1.0-class hull line there, k1 zone): rises +0.001..+0.077 per the
  k1/k2 interpolation of whatever hull line owns each column; bottom
  -0.153 where it is the bustle rim ('at' +1.9..+3.04, e.g. the
  2.13/2.46/3.01 trio: 1.853->1.6997 over the 1.4851 hump — 0.21 m
  family-normal bustle overhang); mantlet/root cols -0.153.
  turret plan row: UNCHANGED (95.9 class holds).
- front rows: refTop |at|<=1.22 casting roof -0.012; |at| 1.22..1.49
  deck +0.075; |at| 1.49..1.78 skirt/fender line +0.071..0.073 (hump is
  front-occluded: x ±0.91 < casting ±1.22). refBot unchanged.
- stations (same 14 bins — z-extents unchanged): y1 at casting stations
  -0.012; y1 at hump/stern-deck stations +0.075..0.108; w/x0/x1/y0
  unchanged. dims: NO direct effect (proc-only row).
- EXPECTED GATE TRAJECTORY: the frozen proc vs the warped ref fails the
  gate on side/front/turret rows (deck line -0.075 low everywhere, whole
  turret band mis-seated ~0.15-0.28) until the proc re-seat lands — the
  batch must NOT be committed alone (§E gate-in-loop: verify against the
  RE-SEATED proc build in the same round; one graduate-change landing).

PROC RE-SEAT MAP (buildT84, src/vehicles/profiles/russia.ts — DOCUMENTED
DIFF ONLY, NOT LANDED; russia.ts untouched this round, hash 531fe4f0
re-verified frozen 2026-08-04 via tools/tmp-t84-hashgeo74.mjs alongside
pt91m e6994e54 + t72b3m 3d92bb98). Meters formula (certified world y ->
new world y): hull y<=0.9919 keep; 0.9919..1.3239: 0.9919+(y-0.9919)
x1.22759; hull >1.3239: 1.3994+(y-1.3239)x1.61672. Turret zones:
1.3239..1.7132: 0.93025+(y-1.3239)x1.61672; 1.7132..2.0018: y-0.15347;
2.0018..2.2317: 1.84853+(y-2.0018)x1.61667; >2.2317 (furniture lane):
y-0.0117. Key constants (old -> new; the executing round re-derives
exact values from a FRESH digest/workorder per the r31 re-anchor law —
this table is the authored intent):
- turretG.position 1.32 -> 1.40 (ring deck 1.3994-1.4108 class).
- loftHull deck row values: 1.28->1.3456, 1.333->1.4141, 1.321->1.3959,
  1.301->1.3714, 1.278->1.3431, 1.272->1.3358, 1.215->1.2658,
  1.172->1.2130, 1.148->1.1836, 1.06->1.0755; sponsonY 1.12->1.1492;
  wUp 1.28->1.3456. Belly/wLo/tracks/gear/skirt hems UNCHANGED;
  widthAnchor (y 0.95) UNCHANGED.
- side humps 1.3325->~1.433 (top 1.365->1.4659); splash rail
  1.317->1.3902; ruDeck deckY 1.31->1.3824; Kontakt-5 rows
  1.158..1.192 -> 1.196..1.238; fender strips 1.30/1.28/1.215 ->
  1.3701/1.3456/1.2658; stern boxes 1.18/0.99 lanes: map values >=0.992
  only; skirts yTop 1.32/1.30/1.24 -> 1.3947/1.3701/1.2965 (hems 0.64/
  0.26 stay); V4 slab tops 1.122..1.209 -> 1.152..1.258; P.topY
  1.30 -> 1.40.
- turret band (locals vs turretG 1.40): collar world 1.58..1.66 ->
  1.344..1.474 (bottom tucks 2-6 cm into the deck = seat contact);
  cheeks 1.58..1.90 -> 1.344..1.747; ring-side cheek base 1.669 ->
  1.488; apex ramp 1.88..2.04 -> 1.727..1.910; walls top 2.10 -> 2.007;
  carrier stack re-centers to keep apron ~0.94 (interior); bustle
  staircase 1.66/1.72/1.79/1.85 -> 1.474/1.567/1.637/1.697; Utes crate
  top 2.21 -> 2.185.
- ROOF-PLATE LANE (dims protection — DO NOT blind-map): re-author the
  plates/plateau to the FRESH ref plateau lines (2.20..2.22 abs, ref
  roof band by z 2.212-2.220), sights 2.22-2.24, cupola drum top
  ~2.22-2.23, blocks ~2.24, Kord crest 2.29-2.31 over <=2 cols. The
  heightM p95-tops datum must land 2.21-2.23 (pct <=0.5, inside grace);
  a blind -0.055 map of the 2.205 plate constant would read heightM
  ~2.19 (-1.4% = -3.2 dims pts) — the ref demands 2.22 tops anyway.
- gun: gunG y 0.515 -> 0.2815 local (axis 1.835 -> 1.6815 world, ref
  1.7036 - the certified -0.022 authored offset); mantlet 1.58..1.94 ->
  1.344..1.787; evac band 1.735..1.97 -> 1.582..1.817; tube stages/rings
  unchanged (radii keep the plan bins; band follows the axis drop).
- floaters/poses: collar+carrier tuck INTO the deck (contact deepens);
  5-pose islands stay 1; depression -8 deg muzzle ~1.0 m up — clear.
- dims after re-seat: heightM ~2.22 (<=0.5%), hullLengthM 7.00 (1.11%,
  -0.9 — unchanged, quantized r31 decision stands), overall/width
  untouched -> dims holds 99.1.

RISK NOTES
1. dims interaction: heightM is the proc p95-tops datum — protected by
   the roof-plate lane note above; hullLength/overall/width axes are
   untouched by a y-only round.
2. Station/bin re-phase: NONE — ref z/x extents unchanged (y-only ops),
   shared-box side/front camera halves stay length-dominated, so the
   0.1213/0.0405 pitches hold; §C 15 mm face-clearance re-check still
   mandatory after the proc re-author (r31 law 3).
3. The two stretch-zone kinks (1.713 / 2.002 m) bend the cheek/dome
   silhouette slightly; watch the critic on close-front (root stage
   deepens to 1.35..1.72) and the dome slope. Family class says this is
   the CORRECT look (t80 casting 0.74-0.85 visible height).
4. Mantlet-vs-glacis clearance post-seat: +3.1..+3.2 cm per z-bin (z22:
   1.3769 vs 1.3464; z24: 1.3475 vs 1.3151) — contact-free but tight;
   the proc gun at -8 deg depression clears by design (axis drop is
   matched by the deck rise only at the ring, not under the tube).
5. Interior artifacts (accepted): basket plug lands 0.494 (enclosed,
   above the ~0.35 tub floor); root/breech interior verts stretch inside
   the casting; casting front floor tucks <=3.8 cm into the deck-glacis
   corner at |x|<0.23, z gate -0.06..+0.12 (occluded, = family seating).
6. Graduate coupling: this is a §10/§H3 graduate-change — batch-40 +
   proc re-seat + gate >=90 x2 + critic re-cert + re-freeze (531fe4f0 ->
   new hash) land as ONE commit; pt91m e6994e54 / t72b3m 3d92bb98 stay
   byte-frozen (re-verify in-round).
7. y_top_max timing: 29.95 is a PRE-translate guard (warp apex 29.9378),
   not a final-height statement — do not "fix" it down to 24.8.

## r33 TURRET-SEAT RE-ANCHOR (2026-08-04, russia agent): the coupled proc
## half of batch-40 — FAIL-by-design 0 -> 92.5 min x2 (hull 92.5 / whole
## 93.2 / turret 93.2 / stations 96.1 / dims 99.1 / floaters 100), +2.3
## over the r32 graduation record, owner daylight CLOSED (crops archived)

Batch-40 verified in-tree first (probes: deck 15.520u=1.3994, hump 1.4851,
rim 15.271u=1.3769 = 2.3 cm INTO the deck, roof crest 24.7349u=2.2303,
tube axis 18.893u=1.7036 r 0.1234 — rimhist reads RAW mesh coords, minus
the -5.2029 Turret translate). buildT84 re-authored per the plan's zone
map (k1 x1.22759 / k2 x1.61672 hull; z1 x1.61672 / z2 -0.15347 / z3
x1.61667 turret), turretG 1.32 -> 1.40, gunG 0.515 -> 0.2815 (axis
1.6815 = fresh ref 1.7036 - the certified 0.022), roof lane held ABS.
Trajectory 0 -> 50.5 -> 87.8 -> 90.6 -> 92.5 (plateau; every component
>= the r32 record). Diff confined to buildT84 (no shared-helper edits —
proven by the graduates' byte-identical hashes).

MAP CORRECTIONS vs the batch-40 packet table (re-derive law honored —
three table lines were wrong, caught by fresh probes):
1. "wUp 1.28->1.3456" is a DECK-VALUE LEAK: wUp is the loft x half-width
   and x cannot move on a y-only round. wUp stays 1.28.
2. "carrier re-centers to keep apron ~0.94" is WRONG for the gate: the
   turret mask is PART-ISOLATED (no hull occlusion) and the seated ref's
   basket plug paints the band bottom 0.492 across z -0.18..-1.71 (15
   cols; the certified r32 "1.0-class refBot" the plan attributed to a
   hull line WAS the pre-seat plug at 0.963). Carrier follows: apron
   0.490, top 1.3766 (fully interior — inside wLo, above the 0.35 tub).
3. "P.topY 1.30 -> 1.40" applied as written (HUD/camera anchor only).
Blind-map amplification: the zone slopes amplify every certified residual
x1.23..x1.62 — six lanes re-anchored to FRESH per-column ref values
instead: engine humps (asymmetric: L top 1.4659, R split 1.428/1.472,
center crest ribs 1.4851 EXACT with the ref's 1.434 center channel kept),
deck EDGE SHOULDER (loft rows carry the 1.352-1.392 edge line, certified
center line rides new +-1.00 overlay slabs — side/stations unchanged),
glacis knee rows 0.55/0.75 -> 1.320/1.310, driver hatch HELD at 1.245
(the ref hatch is flush; k1's 1.3026 topped the fresh 1.292 line), stern
fender row split into 1.345/1.417 courses (5 mm overlap, no top-down
slit), casting walls 2.007 -> main 1.93 + four edge strips (L 1.942/
1.884, R 1.994/1.942 — print asymmetry; strip gaps never cross a bin,
collar closes them from below), roof-plate rows split (mid pairs x
0.21..0.72 keep the 2.205 side plateau + row1 2.17 for the ref's
2.10->2.205 fore-aft ramp; center lane 2.117 = the fresh ref's roof dip;
seams follow the mid lanes), apex step 2.12 asymmetric (-0.21..-0.50 /
+0.115..+0.50), Utes crate narrowed to the right plate lane (side keeps
its 2.185/2.209 line, front center cols freed), bustle staircase
RE-PHASED to the fresh 0.028/col rising line (seven 1.72-wide stairs
1.474..1.669 with every face >=15 mm FORE of its column boundary +
separate 2.079 upper band starting 15 mm PAST -2.202 — bottoms transition
fore of boundaries, tops aft, never the same box), bow lip -> three-stage
stair (1.118/1.04/0.9575 per the fresh 2.01/2.12/2.23 cols), front flap
-> two courses (0.41 lower ending 16 mm before the 2.066 bin; 0.574 col
kept by the upper), belly pan asymmetric -0.78..+0.835, outer bracket
pair at the 1.58/1.62 front cols' 0.304 bottom, K-5 rows 3-4 1.196/1.184.

§B2 SEAT PROOF + canyon flip (before/after archived
shots/russia-t84-seat/): the owner's ring daylight is GONE at every
angle — view-left/right/frontleft/rearright pairs show the casting
seated INTO the deck like the ref. NEW FINDING: closing the daylight
FLIPPED the old shoulder-to-bustle canyon (z -1.31..-1.80 over the
carrier) from border-connected sky into an ENCLOSED 573/562 px window at
view-left/right — plugged with solid camo at the carrier planform
(x +-0.80, z -1.30..-1.72 full-depth + rear 8 cm bottoming at the ref's
own 1.45 'at'-1.82 line; trace-invisible: tops stay the 2.216 plates,
bottoms the 0.49 carrier). Flood census (mask-method, >=12px clusters):
view-left 573 -> 0, view-right 562 -> 0; TOTAL 2517 px vs the r32
certified 2182 residual — same families (view-front 145 grazing-camo,
hero-toptilt 861, close-roof 1194 proxy-shadow class, hero-rearright 132
BETTER than r32's 159) plus a named NEW class: Kord-barrel sky slits
(view-rear 125 / rearleft 28 / rearright 32) — the enclosed pocket under
the swung barrel between pintle, receiver and roof: MG PHYSICS wants the
sky-backed silhouette (§C pintle allowance), certified as
decoration-lane residual with the rear-cluster crop as evidence.

Done-gates (official rigs, final geometry): geometry-gate min 92.5 PASS
x2 (components identical both runs: 92.5/93.2/93.2/96.1/99.1/100;
gatePassed:true re-read from JSON); dims heightM p95 2.24 (0.74%, grace —
r32-identical; the roof-lane ABS protection held dims at 99.1 exactly,
hullLength 7.00 quantized decision stands); floaters 100 x2 (contact
deepened, no new islands); tank-standard-check PASS (clip 4/0 =
r32-identical, holes 0, mg1+6d); track-clip-audit --exact 4/0;
turret-parent-audit stranded 1 = fitting_towCable(29%) — PRE-EXISTING
audit artifact (the committed r32 build reads stranded 1 + abutting 1;
this round clears the abutting): the engine-deck tow cable is hull deck
furniture the bustle merely overhangs (§B5 keeps it in rig_hull), the
AABB envelope smears over it; adjudicated, negative documented.
visual-evaluator exit 0, RIG PARITY OK (max dYawProxy 1.0 deg
@close-roof vs r32's 1.8, |dCentroid| 0.025 m); named kink findings per
the plan's risk 3, cited per §D: dome-slope class left "edge upper
170.6 vs ref 0 (Δ-9.4 +-0.6) @ z -0.13..0.87 y 1.78..1.95" (the z1/z2
stretch kink bending the cheek ramp — family-correct look per the plan),
close-front root-depth class "lower-left Δ-10.3 +-0.5 @ z 1.41..1.60
y 0.12..0.26" (bow flap course lane). npm test exit 0.

HASHES: t84 531fe4f0 -> **fd0bca6c** (47 meshes / 93220 verts) — for the
re-freeze at landing. Graduates byte-frozen in-round at every measure
batch: pt91m e6994e54, t72b3m 3d92bb98.

Honest residuals (worst columns, gate frame): side 'at' 4.32 err 0.062 x1
(the certified r31 "stern ramp step -4.32 -0.07" arc-vs-straight-ramp
gear class — the ref's rake mapped up while the sprocket wrap is
identity-zone; rear wrap link instances bottom 0.53 at z -4.267, measured
by vertex probe); wheel-gap phase cols 'at' -1.04/-1.15 +-0.03; turret
'at' -0.27 err 0.051 x1 (the ref's 1.442 mantlet-rotor ridge — a collar4
raise to 1.425 would re-open a through-slit over the 1.356 shoulder loft,
rejected per §B2); front center-roof 'at' 0.14 -0.06 (ref's 2.224 lane
pokes between drum and step); plan smoke-tip cols 0.61/0.71 -0.10 x2
(certified since r31); front cupola-drum east edge 'at' 0.66 +0.03
(critic-ordered drum kept over 0.3 gate pts).

BANKED LAWS (r33):
1. PART-ISOLATED TURRET MASK SEES INTERIOR CONTENT: the gate renders the
   turret band with the hull hidden — a seated oracle's interior floors
   (basket plug) SET the band bottom, and the proc's interior stacks must
   match the ref's interior bands, not the visible hull line. Never
   reason "occluded = invisible" about part masks.
2. ZONE MAPS AMPLIFY CERTIFIED RESIDUALS BY THE ZONE SLOPE (x1.23-x1.62
   here): after any compound warp, re-derive per-column targets from a
   FRESH workorder — a -0.01 certified read becomes a -0.016..-0.026 miss
   if mapped blind, and knee zones (glacis fall, wall tops, roof ramps)
   shift NON-uniformly because the per-vertex map crosses zone boundaries
   inside a single authored member.
3. SEAT-CLOSES-DAYLIGHT FLIPS §B2 TOPOLOGY: pockets that scanned "open"
   through a float gap become ENCLOSED windows the moment the seat lands
   — re-run the flood scan after ANY contact-class change and plug with
   trace-invisible interior fills (tops/bottoms owned by other content).
4. The gate's own JSON stores camera-frame values; the workorder's
   world-frame dump with the GATE's hull-row dy (not the row's own mean
   dy) is the only authorable per-column truth (the row-mean dy is
   polluted by exactly the family you are chasing).
