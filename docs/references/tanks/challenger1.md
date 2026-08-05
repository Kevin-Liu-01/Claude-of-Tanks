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
