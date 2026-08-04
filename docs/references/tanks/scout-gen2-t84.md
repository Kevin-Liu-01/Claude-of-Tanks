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

buildT84 in src/vehicles/profiles/russia.js (RUSSIA_PROFILES.t84 replaces
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

Work order: docs/critique/shaded-parity-t84-r31.md (verdict on 2c262e52).
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
with no harness offsets. variants.js backfill: clean (no t84 row). Icons
regenerated from the procedural build (5 by exact name, rest restored).
