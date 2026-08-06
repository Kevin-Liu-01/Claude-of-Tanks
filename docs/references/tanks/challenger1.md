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

## Vertex round r1 (2026-08-03, uk agent) — WARP PLAN AUTHORED, build paused
Extract: hull mask 7.992 (-3.9% vs 8.32), overall 10.779 (-6.3%), width 0%;
p95 3.264 (+10.5%) is four thin antenna cols at 3.26-3.33 over a SQUAT wide
roof plateau (2.756 vs published 2.95). Normalize plan authored
(tools/vertex-normalize.mjs challenger1): z hull -> ±4.16 + muzzle 6.783 ->
7.34; y roof band 2.60->2.76 rises to 2.93 with antennas knee'd to
2.97-2.98 (p95 sim -0.95..+1.0% any placement). Standard Y-up — _axis_warp
applies as-is. FALSE-ALARM CERT: the extract's ORIENTATION MISMATCH is the
un-modeled CHALLENGER_TURRET_FOLLOWERS contaminating its hull top-curve
(roof panels 2.76 + antennas) + the normal-vote fallback; the glacis truly
faces +z (hull tops fall 2.0@z2.2 -> 1.2@z3.9, bow belly rake rises to the
+z nose, tail undercut at -z, gun overhang +z). TRACK CONTAINMENT LAW:
rakeHalfW 1.19, inner skirt plate trimmed to z -1.82..2.28 and the outer
layer moved to the 1.65..1.73 plane clear of the shoe surface — audit
413/293 -> 20/0 (residual sub-severe boundary kiss). Gate steady at 32.2
min (turret 32.7 -> 35). Build resumes after the warp lands.

## Vertex round r3 — POST-WARP RETUNE (2026-08-03, uk agent)
Full rebuild to the law-v2 re-warped oracle (roof plateau -> 2.93, antennas
kneed 2.97-2.98). Gate: 18.8 -> **69.9** min (hull 74.9, whole 75.8, turret
69.9-region, stations 81.3, dims 95, floaters 100); containment 176/194 ->
**0/0**; FITTINGS census mg1 (MAG GPMG on the bustle, swept inboard-aft
inside the hull-basket silhouette band).
LIVE-RIG SPLIT (supersedes the extract read): the batch-5 repair moved BOTH
followers (antennas) AND the roof furniture INTO the live `Turret` node —
the extract's raster shows them in hull, but the gate's live hull mask is
BARE (rough 1.82 = deck height). Everything decorative is turret-bucket:
casting shell (plateau 2.498, nose z 2.84 center arc, face bottom 2.70 at
|x|<=1.0), long side bins (L inner z -0.99..2.20 / L outer -1.65..1.47 at
x to 1.48; R -1.40..2.45 at x to 1.43 — the print's asymmetry), outer
skirt-top tiers (L midship -0.94..0.63, R 0.0..2.36 at x to 1.65), stepped
rear basket (2.165 tail at |x|<=0.60 only, 2.415 hump z -1.92..-1.68, 2.24
mid, left wall to -1.55), roof furniture (commander sight 2.945 anchor at
x -0.515..-0.265 z 0.22..0.68; left block 2.87 + 2.51 outer shelf at
z 0.80..1.30; roof step 2.795 left-of-center; TOGS body LOW 2.32 with the
thin 2.955 head at (0.93, 0.91)), kneed antennas 2.945 at (-1.375, -1.08)
and (0.95, -0.82).
GUN: fat cast collar boxes (r 0.43 at z 0.55..1.40 + 0.21 step to 2.33),
wide-flat sleeve sections (plan half-width 0.12 per the print), evac box,
L11 to muzzle 7.41; right-biased cradle/clamp mass (x -0.37..+0.64,
z 3.34..3.78, y 1.29..1.65 — the print's turret-mask nose at 3.75).
HULL: belly 0.52; skirt plane 1.655 (hem 0.53, z -3.30..2.55) OUTSIDE the
0.95..1.58 pad envelope (containment law); fender run z -0.40..3.30 at
±1.70 with the 1.435 outer edge-roll strip carrying the width plane and
the 0.63-hem lip plates at ±1.71; bow wings ±(0.95..1.65) to z 4.165
riding ABOVE the idler wrap (mud guards — the print's rising bow-bottom
line is the TRACK's own climb; hanging tip flaps carry the 0.65-1.0 line
past the wrap); track 1.005..1.535 (print grounds 0.97..1.56); idler
(3.50, 0.60, 0.28), sprocket (-2.60, 0.74, 0.33); tail: rake into the
1.12 undercut at -3.60, side deep boxes to -4.09, recessed center, THIN
tail lip at -4.10..-4.19 (sub-12%-band so the strays+lip never mint a
rear body column — see the chieftain5 r3 law bank).
Honest residuals (plateaued 68-70 over 4 iterations): t_side ~68 — the
basket/bustle boundary columns flip-flop with the ref's own AA edges
(z -1.3..-2.1 band, ~6 cols x 0.10-0.16); the ONE stubborn plan_turret
column at x 0.21 (proc reads z 4.84 content this agent could not locate
with vertex probes — suspected gun-group AA stack); hullLengthM 8.16 vs
8.32 pub (1.87%) is the print's own certified -2% hullLen stylization —
the body-column span cannot reach 8.24 without minting registration-
breaking body columns at the thin wing/lip tips. dims 95 is the floor
under that stylization. Stations 81.3 (st5/st8 top jitter at the antenna
columns).
STOP note: challenger1 fell short of the 75 target (69.9 at lock); the
remaining levers are all sub-0.15-per-column trades against the ref's own
edge jitter. Recommend an oracle-lane look at the basket band and the
x 0.21 gun column before the next builder round.

## NO-STAIRCASES round (2026-08-04, uk agent — owner screenshot directive, §B1 law 5f4cfae)
IDENTIFICATION: the screenshot tank IS challenger1 (rear-3/4 pair match:
big slab turret + stacked bustle + segmented thermal-sleeve L11 + twin rear
mudflaps; freshly flipped c487188, owner browsing it in the garage).
Verified against the before-critic pairs at the same angle.

STAIRCASE KILLS (each course now ONE raked face or the ref's real lines):
- BOW (the worst read): fender plane (1.5575, ended 3.30) -> transition
  plate (1.43->1.32) -> bow wing (1.44->1.185) stacked THREE terraces with
  two ~0.10 equal risers. Now ONE guard rake y = 1.5575 - 0.245(z-2.95)
  from the fender end to the 4.165 nose tip, emitted as three nested
  CO-PLANAR strips (plan taper kept: 1.745 plate 3.28..3.60, 1.70 edge to
  3.30, 1.65 wing run; underside/flap mask lines unchanged). Authored to
  the workorder's own ref line (1.537@3.07 .. 1.278@4.11, one rake).
  Headlamp pods re-seated ON the rake at the ref's own 3.593 bump column
  (top 1.475); the ±1.71 side band (flat 1.55 top) trimmed to 2.95 so it
  can't re-paint the terrace; splash board to the ref's 1.60; front flaps
  flapDrop 0.17 under the rake; ukHull gains OPT-IN g.fenderPlaneZ1
  (default = fenderZ1, byte-identical — hash-proof below).
- GLACIS: the 8-knot convex deck run (1.19@4.16..1.60@2.90) flat-shaded as
  stacked chord bands; the real CR1 glacis is ONE plate — deck re-knotted
  to the single 4.16->2.90 line (real knee at the splash board kept).
- TURRET side courses: bin fronts were flat overhung box-ends (proc 2.273
  vs ref's RISING 2.11@2.42->2.24@2.03 line) — both inner bins end in
  RAKED nose wedges at the ref plan fronts (R 2.30, L 2.26); flat tops to
  the ref's 2.24 course (0.635 loc); dark lid strips FLUSH (rode 0.02
  proud as a micro-step); right outer tier re-cut to the ref's 0.0..2.01
  with its notched -0.36 inner tail; tier end posts at the ref's 2.28
  front-view tops. Crown: ±0.93 flat plateau narrowed to the ref's ±0.70
  with 2.28 cheek-top shelves (plan unchanged); crown->rear-roof 5 cm
  ledge now a §B1 CHAMFERED joint; rear-roof top corners follow (±0.74).
- BUSTLE: the ref basket IS stepped (2.165/2.415/2.24 real course lines,
  kept) but re-cut to its true plan: hump/mid boxes ±0.90-0.92 (were
  ±1.16 overrunning the 0.99/1.12 plan cols by 0.23-0.46), tail |x|<=0.53,
  ±0.575 step shoulders, left wall pulled to the -1.61/-1.72 rear line,
  floors raised to the ref's 1.82-1.85 underside band (hung 0.15 deep).
MEASURED EXTRAS (workorder-authored, same round): face chin 1.55->1.67
(ref 1.656..1.689) + raked nose-wedge chin + 1.42..1.66 mantlet-recess
underside; rear-roof slab belly 1.67->1.75 (dead mass painting the turret
mask); antenna pots shortened (hung to 1.585 INSIDE the hull body, four
cols at -0.15..-0.19); THE r3 "stubborn x 0.21 plan column" FOUND = the
0.36-wide MRS band at gun z 4.38 (corner painted plan to 4.83 vs ref
3.76) -> 0.24 wide (§C 15 mm clearance) + a 15 mm-LEFT sleeve-end shroud
matching the print's own asymmetric x<=-0.146 coverage to z 5.10; sleeve
junction ring (ref 2.06-2.08 band); smoke banks lowered 0.18 (ref 2.15-
2.19 front tops); skirt hem 0.53->0.615 (ref 0.634) and the skirt split
at the ref's own front-panel course (main 1.74 run ends z 0.90, lower
1.625 panels forward — side cols 0.99..2.45 read 1.624); deck rear knots
-0.01; rear bin/deep boxes/tail lip/fender strips re-cut to ref plan
(asymmetric tail-guard stubs L -3.51 / R -3.705, sealed against the skirt
and vented inboard after a first cut enclosed 20 top-down cells — §B2
back to 0); NBC pack (ref 2.57 roof step); left roof block to the warped
print's 2.79 (r3's "2.87" is the OLD extract); commander sight widened
to -0.565 (its column under-covered and dropped to the NBC top).
GATE: 69.9 -> 77.9 min x2 (hull 71.9->79.7, whole 78.5->77.9, turret
69.9->82.9, stations 86.6->90.2, dims 95, floaters 100 — every component
except whole up; whole -0.6 traded inside the round, min +8.0).
CHECKS: §B2 holes 0, §B4 clip 0/0 exact, §B5 parent 0/0/0, npm 166 green.
EVALUATOR (official rig, final geometry): RIG PARITY OK; the stair-
flicker chains on the bow (159.1/94.4/87.0/29.4 connected slope-riser
alternation, mirrored rearright) are GONE — remaining bow-band proc-only
edges are discrete fixture faces <=0.41 m (pods/flaps/nose end), the
class the ref itself carries; profile p95 dTop: rearright 0.585->0.247,
frontright 0.502->0.408, frontleft 0.453->0.273, rear 0.370->0.261,
close-roof 0.394->0.309.
HASHES: challenger1 7ed08078 -> a18d91a8; chieftain5 FROZEN 5117b9a8
byte-identical (stash round-trip), and centurion3/5, fv510, vickers_mk1,
comet, charioteer all byte-identical pre/post (opt-in default proof).
Shots: shots/uk-challenger1-stairs/{before,after,crops}/.
HONEST RESIDUALS: whole 77.9 is the min — the 3.33..3.85 side BOTTOMS
(ref's idler-wrap climb 0.325->0.974 vs our lower wrap, ~4 cols x 0.13,
running-gear lane, r3 carried it too); plan rear lip cols ±0.31..0.73
(-4.16 vs ref -4.06, the published-tail anchor, dims-priced); front
parity yawProxy 4° (ref's own skew, under the 10° abort); nose-top AA
flip-flop band 2.55..2.81 (~0.07x3, r3 plateau class).

## PUSH-2 — post-staircase ladder (2026-08-05, uk agent): 77.9 -> 90.1 GATE PASS x2
FRESH BASELINE: 77.9 unchanged post-amendment (ad39179 moved nothing here;
hash a18d91a8 verified). Five worst-rows-first cycles to the program's
dual-gate bar — geometry side DONE: **min 90.1 | hull 91.9 whole 90.1
turret 90.2 stations 90.6 dims 95 floaters 100 — PASS x2 bit-identical**
(fleet 24/88). Hash a18d91a8 -> **8ef58c18** (41 meshes, 88 644 verts).
Trajectory: 77.9 -> 86.2 -> 88.7 -> 89.2 -> 90.0 -> 90.1 PASS.

THE THREE STRUCTURAL FINDS (each worth 2-4 pts, all workorder-measured):
- SKIRT COURSE TRUTH: the ref hull-mask top is 1.624 across the WHOLE mid
  band (side cols -1.21..2.55) — our 1.74 skirt run painted FIFTEEN
  columns +0.13. Skirt top 1.74 -> 1.624 (one course, co-planar with the
  front panels), face pulled to the ref's own 1.578 plane, plus its TWO
  outboard layers re-read from the front/station cross-check: a 0.515-hem
  OUTER BOARD row at 1.598..1.613 (top 1.525) and the ±1.66-1.68 station
  bosses now BRIDGING skirt->board (§B2 attachment). Rear quarter is an
  INBOARD raised panel (x 1.568..1.613, top 1.53, hem 0.90, z -2.55..
  -3.28) carrying the plan's -3.283 tail with the ramp-owned side bottoms
  left bare (skirt z0 -3.30 -> -2.55; st1 ±1.60 station read).
- RUNNING-GEAR LANE (the round's named binder): ref front ramp is 0.51/m
  from z 2.89 into a HIGH FORWARD idler — (3.50,0.60,0.28) ->
  **(3.62, 0.80, 0.28)** + contactZF 2.90; rear y=0.5(|z|-2.06) into
  **sprocket (-2.64, 0.80, 0.33)** + contactZR -2.12 + padCornerFloor
  0.012 (centurion r6 law). Bow wings ARCH over the raised wrap (belly
  1.00 -> 1.245 crest -> 0.995 tip, §B4/§B1); §B6 trapezoid both ends.
  The deck knee lowered to the ref's splash-board cols ([2.90,1.575]) and
  the mid deck to its flat 1.622 with the REAL engine-bulkhead step at
  -1.25/-1.31 (ref's own 1.689 mixed-AA step col reproduced exactly).
- §B1 CROWN ASYMMETRY (c1ad424 clause applied): the ref casting crown is
  commander-high LEFT (2.498 plateau, x<0) / loader-low RIGHT (~2.33 flat
  to the 2.28-2.31 cheek band) — our symmetric 0.878 crown painted 18
  front columns +0.08..+0.15. Face slab split at x 0 (plinth step wall =
  the ref's real course line), right cheek rake runs out into its OWN low
  roof (slope motivates the mass), rear roof + chamfer top quads kink at
  x 0, cowl re-seated on the surface it sits on. Turret furniture
  re-derived: TOGS tapered body (2.28 inner / 2.355 outer) + 2.985 head
  (run INTO the body — a 0.065 float minted a yaw-90 mask island, the
  round's one floater, raycast-located), left-block 2.86 sight cap, NBC
  0.885, glass strips flush, sight x-span 0.26, deep trunnion floor to
  the live 0.942 band (12 cols), ring-collar split 1.59/1.46 (§C: the
  front piece's rear face moved 24 mm clear of the -0.239 boundary).
BASKET/BUSTLE plan staircase re-cut to the live cols (hump/mid ±0.74,
asymmetric tail halves -2.13/-2.09, waist shoulders stepped -1.92/-1.78
right and -1.92/-1.854 left, left wall to -1.75, cloth to -1.77, 2.40
left kit block at x -1.05..-1.42 for the front row's 2.386-2.416 band);
rear-deck bin re-profiled (1.83 crest ±0.30 + 1.762 wings to ±1.375);
tail furniture stepped to the ref's own underside jitter (side boxes
1.165/-3.66 + 1.10/-3.88, deep-box segs 1.12/1.15/1.22, lip 1.47); gun
lane: junction ring 2.10, sleeves +0.02 with authored RIDGE RINGS at the
ref's 1.981 ridge cols (4.73/5.25/6.60) over a 1.935 valley base, MRS
z-stretched to cover both muzzle cols at r 0.108.
CHECKS: standard-check PASS (clip 0/0 exact, §B2 holes 12 -> 0 via the
rear gear-deck cover shelf, mg1 census); §B5 parent 0/0/0; evaluator
14/14 RIG PARITY OK (max yawProxy 2.1°), no stair-chain reads; npm 166 +
track-geometry green. FROZEN PROOFS at close: chieftain5 **5117b9a8**,
centurion3 **caa2e91c**, centurion5 **bbcf7d80** — byte-identical (the
ukHull opt-ins skirtW/skirtTrimFlush default byte-identical; padHugZ0
NOT plumbed on purpose — plumbing it would alter the frozen centurions'
live `padHugZ0: 0` config mid-critic, orchestrator-lane coupling).
Evidence: shots/uk-challenger1-push2/ (gate-final.json, track-clip),
shots/visual-eval-challenger1/.

LAW BANK (push-2 discoveries):
1. TRIM-PLANK ANTI-RECIPE: r15's plank painted a line its band couldn't
   reach behind a skirt window — a plank can NEVER raise a mask bottom
   the visible band itself paints lower (tried + removed here; the wrap
   deficit is the band+shoe-hang itself).
2. §C IS PER-ROW-GRID: the turret rows sample their OWN column grids —
   the MRS cleared plan_whole's 0.146 boundary but sat 5 mm inside
   plan_turret's 0.125 and lit the column to the muzzle (-4.3 pts on one
   col). Clearance checks must run against every scored row's grid.
3. STATION FRAMES ARE PER-MODEL: the gate's stations band each model's
   OWN side-hull z-range — a dims-priced tail-lip overhang shifts every
   proc band ~0.13 vs ref, so st0 fragility is structural (and trimmed).
4. RAYCAST ATTRIBUTION beats AABB probing on merged buckets: three
   stubborn plan columns traced to painters static analysis missed (the
   rear-roof slab's plan footprint at ±0.95, the tail-course ±0.53 AA
   edge 6 mm off a boundary, the old waist shoulder's outer half).
5. GEAR MOVES SWEEP THE SHOE ENVELOPE: idler-forward pushed the shoe
   sweep (r+CLEAR+pads ≈ r+0.15) through the center tip flap with NO
   legal z between the sweep (<=4.065) and the next §C boundary (4.047)
   — solids sharing the gear x-band re-derive with every end-wheel move.
HONEST RESIDUALS (the measured ceiling without orchestrator help):
side_whole 90.03 — the wrap-zone bottoms z 3.46..3.98 read -0.05..-0.16
under the ref line (band+shoe-hang; padHug is unplumbed on this rig —
fixing it couples to the frozen centurions); muzzle ridge/valley ±0.03
alternation; plan rear lip cols (dims-priced tail anchor, unchanged);
st0 wPct ~7.6 trimmed (law 3). turret:plan 89.97 -> 90.2 came from the
§C fixes — the 0.861/0.601 columns hold ~0.08 of ref-side basket kit our
shell reads clean. Dual gate: geometry side PASSED — independent critic
>= 9.0 every view is the remaining graduation leg.

## r8 — COMBINED UK TONE ROUND (2026-08-05, uk agent; answers shaded-parity r7 0b4c6d0)
Shared family recipes built ONCE (ukToneKit + ukGearAirBackers, §F.2
opt-in per build fn — chieftain5 does NOT call them) and applied with
per-mark params; three tone dial cycles on the official critic pairs.
Gate: **90.1 -> 90.2 PASS x2 bit-identical** (hull 91.9 / whole 90.2 /
turret 90.3 / stations 90.6 / dims 95 / floaters 100 — whole+turret both
+0.1 over the r7 floor). Hash 8ef58c18 -> **e686ddb6** (59 meshes,
92 256 verts). ORDERS:
- O1a/O1b EXPOSE THE GEAR (the 5.5-floor setter): the eight 0.42-long
  outer boards (a visually continuous wall, hem 0.515) slatted into an
  upper course row (bottom 0.88 ~ wheel-top) + five 0.14-wide hanger
  STRAPS to the 0.515 hem at the wheel-gap stations, z-extremes 0.894/
  -2.543 reproduced exactly — mask-neutral by construction (front ±1.6
  cols read min-bottom via straps + same 1.525 top; side bottoms ground-
  run-owned; plan bracketed by fender/rear panel; every station window
  keeps 1.613-face content). Wheels re-toned pale-olive (0x3e4531 clone
  + ambient rehook, drums 0x373d2c), tires emissive-floored, dark-olive
  render-only /shadow/ bay backers at z 3.06/0.30/-2.36. MEASURED: left
  gear window med 6.8 -> 54.1 vs ref 54.8 (PARITY, was "zero of six
  discs"); slit 6.8 -> 53.0. Six disc faces read between straps (flat-
  topped by the 0.615 skirt hem like the ref's own read).
- O2 WRAP TONE: pads 0x272b20/env .18, chain 0x2f3427/.22, band mul
  [.92,.98,.82], spareTrack 0x2c3f24-class, gearFloor rehook (the clones
  were ambient-dead). Front corner rects 30.0/31.1 -> 50.0/48.4 (in the
  ref 26..64 band); rear corner 5.9 -> 55.0 vs ref flap 63.5.
- O3 MUD FLAPS x4: pale-buff panels (0x4a453a clone) hung INSIDE the
  wrap silhouette (law-5: no free z outside the sweep) — panels at
  z 3.90/-2.965 threaded between the shoe annulus bands, stems outboard
  of the shoe x-band bonded to wing belly/rear panel (§B2 chains), every
  part y-interior of its columns' existing intervals. Clip 0/0 exact x2.
  The panel reads through the comb gaps and around the arc (the ref's
  own corner read); a dead-front full-flap read is geometrically
  unreachable behind our wrap (honest residual: corner med 50 vs ref 64).
- O4 PALETTE: TOGS body+head/sight cap/NBC rebucketed 'turret' ->
  'turretDetail' (the camo box-UV had landed them on one sand blotch —
  61,61,47 r=g -> 47-49 g-dominant); gun-root/collar masses ->
  gunMountDark + mats.dark olive swap 0x36342f -> 0x282c22 (travel-lock
  rect 61,60,52 -> 55,58,47 g-dominant; luma residual +11 is lit-face
  physics); canvasCloth 0x262b1d (plank hue fixed, top-lit luma residual
  documented); glass smoked dark-olive (patton C1) — ALL 8 blue chips
  b-r +12..+22 -> -3..-5.3.
- O5 WEAPON/BUSTLE: MAG re-posed from the buried stow to the left rear
  roof, barrel swept FORWARD under the 0.878-plateau cover (two aft
  poses priced -0.8..-1.7 gate pts on side rows and were withdrawn —
  the pintle allowance is 0.4; the landed pose is mask-interior).
  Smoke banks: 20 dark tube-face caps (cluster-transform math) — tube
  rows resolve, crate read dead. Bustle: hump-face straps + cloth
  straps (a rail pair at ±0.746 re-topped the world -1.603 column +0.16
  and was withdrawn — side rows read max-over-x). Ring fitting (O5d):
  base pad bridges the right lift eye to the cheek.
- O6 REAR-QUARTER PLAN: cover strips x 0.96..1.21 + 1.415..1.53 at the
  1.703 deck line over z -2.28..-3.10 (plan-neutral: the wrap paints
  below; front cols carried by deck plateau/guard stubs). The z < -3.10
  lane is NOT track-painted in plan and stays open (mask-positive there
  — reported, not chased).
- SHOULD: plinth-wall dead-front highlight calmed with a flush olive
  course strip along the split-face line (top end 0.87 under the 0.878
  plateau line, interior).
CHECKS at close: standard-check PASS (clip 0/0 exact, contig 0, mg1);
turret-parent 0/0/0; npm 166 + track-geometry green. FROZEN PROOFS:
chieftain5 5117b9a8, fv510 a55c85cc, vickers_mk1 1389d11c, comet
8c9a2098, charioteer c6fc76a8 — all byte-identical (skirtHemSplit/tone
opt-ins default byte-identical). Evidence: shots/uk-tone-combined/
(gate finals x2-verified, tone-measure-final.txt, gear crops),
shots/critic-challenger1/ (fresh 14 pairs).
LAW BANK: (1) side rows read the MAX top over ALL x at a z-column — a
"bins cover it" interiority argument must check every x, not the
outermost body (the rail-pair lesson). (2) A muzzle-tip face must not
extend the mask tip even 3 mm: dAlong quantizes at ~1 mm and smears
mean pct across every side column (shorten the collar, seat the dark
disc face AT the original plane). (3) MG poses: the protective cover
mass (plateau/ridge) must span the WHOLE barrel run in the priced
view's projection; aft-facing barrels over falling rooflines are the
expensive class. (4) /shadow/-named render-only meshes are the zero-
price lane for bay-interior tone fills (gate/evaluator masks + critic
framing exclude them; clip audit does NOT — thread the envelopes).

## r9 — COMBINED UK ROUND 3 (2026-08-05, uk agent; answers shaded-parity r8 984dc10)
Orders O1 (disc structure — the unshipped half of r8-O1, both 7.0 side
floors), O2 (the one §B2 finding), O4 (glacis-plan tone); O3/O5/O6
left for the next round (this round scoped ch1 to the floor-clears).
Gate: **90.2 -> 90.2 PASS x2 bit-identical** (hull 91.9 / whole 90.2 /
turret 90.3 / stations 90.6 / dims 95 / floaters 100 — the 0.2 wall
untouched: every delivery is material/shadow-lane). Hash e686ddb6 ->
**e4d77fd2** (59 -> 63 meshes: +4 /shadow/ backer meshes). ORDERS:
- O1a/c DISC STRUCTURE (the W1 family recipe, ukToneKit r8 — see the
  c3 r8 section): the r7 tireEmissive floor had merged the tire
  annulus + bolt ring into the disc luma — the windows read flat pale
  panels. Split: wheel-rubber IMs onto the 0x2b2f1f ring clone (the
  ordered 0x2c-class), disc faces 0x3e4531 -> 0x323826. MEASURED
  (fresh pairs 16:18, hash e4d77fd2): left window band mean 62.1 ->
  **54.6** (ordered ~53) p95 73.2 -> **58.2** (<=70 ✓) sd 2.6; right
  band 58.3 -> **51.5** vs ref 50.2; tire-annulus + bolt rings draw
  dark-on-olive on every disc.
- O1b INTER-WHEEL SHADOW — PARTIAL, structural (reported per §D): the
  near-black wall is in place (x 0.977..0.993 — rail inner edge 34 mm
  clear; y 0.25..0.60; z -2.10..2.80) and clip-clean, but the window
  p5 stays ~51 vs the ref's 25.8: the fresh crops show the ref's dark
  gaps are its BAY VOID — ours are filled by the toned top-run
  rail/web stream at x 1.03..1.50, i.e. the r8-O2 landed parity class
  itself. No /shadow/ plate can sit in front of that stream without
  entering the shoe envelope (§B4/banked law 4), and re-blackening the
  run would revert the certified O2 parity. Aggregates are at ref
  parity (mean/p95/sd); the tangency-gap oscillation is the honest
  carried residual.
- O2 RAMP-BAY BACKER (§B2 kill): horizontal dark floor plate under the
  bow bay BOTH sides (x 0.60..1.00 — ground-run rail edge 27 mm clear;
  y 0.29..0.31; z 2.50..3.15). VERIFIED: tmp-cr1-r8-voidcheck on the
  fresh close-roof reads ZERO proc-side enclosed components (the
  141-px pocket is dead; remaining hits are label speckle + the REF
  pane's own 49-px pocket). track-clip --exact 0/0 with both new
  backers in.
- O4 GLACIS-PLAN TONE (gate-free): the c3 family recipe, both levers —
  bakeDirtDeckEq + the map-domain dark-texel lift chained after the
  hull material's hook stack (cache key 'veh-ambient-floor-v2+cr1ink';
  lifts only linear albedo < ~0.04). MEASURED: glacis plan halves now
  BALANCED (L med 45.4 / R 45.8 — the near-black left hole is gone)
  with sub38 below the REF's own on both halves (209/277 vs 247/320);
  the remaining -5L field is the scheme's own darkness, not a mask
  hole.
CHECKS at close: gate x2 bit-identical at 90.2; standard-check PASS
(clip 0/0 exact, contig 0, mg1 — the MAG pose byte-untouched);
turret-parent 0/0/0; npm 166 + track-geometry green. Frozen proofs as
the c3 r8 section. ACCEPTANCE OFFER TAKEN (r8 §5): the dead-front
corner ladder-over-panel residual (front corners 51.6 vs ref 64.3) is
CERTIFIED — the panel hangs inside the wrap silhouette because law-5
leaves no legal z outside the shoe sweep (the r8 packet's own
geometry argument; rects reproduce via tools/tmp-cr1-r8-tone.py).
HONEST RESIDUALS: O3 (MG legible read), O5 (bustle/tail), O6 (small
real-angle family) not taken this round. Evidence:
shots/critic-challenger1/ (fresh 14 pairs, 16:18, zero console
errors), tools/tmp-uk-r8-gear-measure.py, tmp-cr1-r8-voidcheck.py.

## r10 — UK ROUND 4 (2026-08-05, uk agent; the shaded-parity r8 REMAINING orders O3/O5/O6)
Round scope: the r8 verdict's three undelivered order families (r9 took
O1/O2/O4 + the acceptance offer). Gate: **90.2 -> 90.1 PASS x2
bit-identical on final bytes** (hull 91.8-91.9 / whole 90.1 / turret
90.2 / stations 90.6 / dims 95 / floaters 100) — 0.1 of the 0.2 wall
spent across the whole delivery. Hash e4d77fd2 -> **c9df0b28** (63 ->
65 meshes: +2 bustle mesh panels). ORDERS:
- O3 MG LEGIBLE READ — DELIVERED (the verdict's own staging: "raise/yaw
  within the plateau cover's shadow"). The MAG re-poses to the loader
  station beside the hatch ring on the 0.66 mid-roof shelf at
  (-0.77, 0.66, 0.16) yaw -0.06, scale 0.85 -> 0.92, tone two-tone ->
  'dark' (MG PHYSICS pale-deck inversion; the c5 O10a precedent).
  Column-safe by the fresh workorder: z-envelope 0.06..0.77 inside the
  plateau band whose side ceilings are the sight/hatch cols (2.76-2.92;
  receiver top 2.481), x-envelope -0.876..-0.734 inside the left
  roof-block front band (2.79-2.86). Ray-staged against the REAL
  perspective hero camera: from hero-toptilt the full receiver + barrel
  clear the plateau edge by >=0.12 and pass 0.10 rear of the sight —
  VERIFIED on the fresh board: unambiguous dark receiver-mass +
  barrel-line at 1x in hero-toptilt, dark line kept in top/plan.
  close-roof gets the top-cap peek only (the ordered pair needs ONE
  view; toptilt carries it).
- O5a BASKET-ON-RAILS — DELIVERED: dark mesh panels seated on the two
  tail-course rear faces (each embeds 2 mm into ITS OWN box plane —
  the humps carry different rears -1.930/-1.890) + pale rail pairs and
  posts (turretDetail over dark mesh = the ref's rail-over-mesh
  polarity) + upper rail pair on the mid course + short flank pair.
  Envelope lesson BANKED: a first flank pair at z -1.45..-1.75 y 0.74
  re-topped the world -1.603 col +0.13 over its 2.24 course ceiling
  (side_turret 90.28 -> 90.05) — a rail's WHOLE SPAN must clear every
  column window it enters, not just its midpoint; constrained to
  z -1.55..-1.75 y <=0.71, gate recovered to 90.2.
- O5b REAR PLATE CLUTTER — DELIVERED: exhaust boxes + twin pipe stubs
  at the tail corners (y >= 1.23 inside the deep-box side band), upper
  cable drape with cleats, LOW WAVY pipe run riding a new tail-shelf
  floor, dark convoy light. §B2 chain lesson BANKED: the low cable
  SEGMENTED the open tail lanes into enclosed top-down cells
  (standard-check 3x6c at x ±0.3, then 2x1c at the lip corners after
  the shelf) — dressing that crosses an open lane needs the lane
  FLOORED first: tail-shelf plate y 1.13..1.16 (sits exactly on the
  box1 bottoms at z -3.62..-3.77 — no side-col move) + lip-band corner
  pads; contig now 0. A glass convoy lens fired a white bloom dot at
  1x — hullDark lens instead.
- O5c smoke tube circles — NOT TAKEN (optional in the order): a pale
  rim ring behind each cap risks partial-pixel on the ±1.3-1.5 front
  discharger cols for a sub-pixel read; documented.
- O6a SIGHT-HOOD VISOR — geometry delivered, fitted edge UNMOVED
  (documented per the chieftain-O4 refusal precedent): body depth 0.46
  -> 0.36 + visor wedge z 0.78..0.86 raking 1.325 -> 1.253 with a 1.19
  soffit; glass tucked under the lip (0.91 -> 0.865). Zero column
  moves by construction (wedge ends OUT of the 0.735-col window; the
  0.605 col keeps 1.325 from the body). The evaluator's close-roof
  Δ-14.7 (ref 37.7 proc 23.0, mid[-0.28,2.75,2.40]) re-measured
  IDENTICAL after the visor — the fitted proc edge is not the hood top
  face; the ref's 37.7° line has no reachable mask-legal author. Rake
  exists and reads at 2x; residual carried with numbers.
- O6b COLLAR/SLEEVE SHOULDER — mask-neutral octagonalization: collar +
  junction ring + shroud rebuilt as body + flush trapezoid caps (exact
  top planes at narrower x, exact ±x at lower y, exact z ends — side/
  plan/front silhouettes identical; front corners only ROUND toward
  the ref's cylinder falloff). The close-roof Δ+14/+11.9/-8.3 family
  re-measured unchanged — those fitted lines live on ref-vs-proc
  shading tangents at MATCHED silhouettes (workorder: both FLAT 1.949
  across z 3.9..4.5); documented as the shading-class residual.
- O6c RIGHT CHEEK COURSE — DELIVERED AND GATE-MEASURED: the workorder
  read the ref holding 2.241 to the 2.034 col THEN falling (2.176@
  2.164, 2.143@2.294) where the r-noses raked from local 2.05; hold
  boxes carry the 0.635 course to local 2.23 (world 2.03) and the
  noses steepen to the SAME plan fronts. The 2.034 worst-turret col
  (err 0.039) and the 1.904 col (0.033) both dropped OUT of the
  worst-14 table; the predicted 2.164 regression (+0.027) is the one
  honest cost. rearright's fitted Δ-7.3 persists (-7.5 after) — same
  shading-class note as O6b.
- O6 SHOULDs NOT TAKEN: whip lean (an 18° lean walks the mast tip
  ~0.34 in z off the ref's own p95 spike columns — heightM budget
  outranks a SHOULD); right fender-line run (course-strip family,
  rows did not allow inside the 0.1 remaining wall).
CHECKS at close: gate x2 bit-identical 90.1; standard-check PASS (clip
0/0 exact, contig 0, mg1+0d); track-clip --exact 0/0; turret-parent
0/0/0 (MG + panels in turretG); visual-evaluator fresh both ends (rig
parity OK, yawProxy <=1.6°); npm 166 + track-geometry green. FROZEN
PROOFS: chieftain5 5117b9a8 + centurion3 bf0a45e8 byte-identical at
round start AND close. SELF-READS (ordered views, vs the r8 scores):
close-roof 7.0 -> 7.5 (pocket dead r9, MG peek + visor + collar
shoulders; empty camo fields hold), hero-toptilt 7.5 -> 8.5 (the
ordered MG read is THE new tell), top 7.5 -> 8.0, rear 7.5 -> 8.0
(clutter + rails; ref-presented crown MG from dead-rear still absent
— honest), rearleft/rearright 7.5 -> 8.0, left/right 7.0 -> 8.0 (r9
disc delivery verified holding), close-front 7.5 -> 8.0, front 8.0 ->
8.0, frontleft/frontright 7.5 -> 7.5-8.0, hero-fl/hero-rr 7.5 -> 8.0.
Floors ~7.5: BELOW the 8.9 adjudication bar — no graduation request;
the remaining distance is the O6 fitted-edge shading family (numbers
above), close-roof camo fields, and the rear-view MG presentation.
Evidence: shots/critic-challenger1/ (fresh 14 pairs, zero console
errors), shots/visual-eval-challenger1/ (report.json + overlays),
scratchpad workorder dumps (before/after column tables).
