# Leopard 2 Revolution (`leo2_revolution`)

**Exact variant modeled:** KMW Leopard 2A4 "Revolution" / MBT Revolution
demonstrator (2010) — 2A4 with the IBD/Rheinmetall AMAP passive composite
package: full faceted turret module cladding, modular hull-side courses,
bow appliqué, roof RWS station, retains the 120 mm L/44.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m (2A4 hull) | Wikipedia Leopard 2, army-guide product149 |
| Overall length (gun forward) | 9.97 m (L/44) | Wikipedia Leopard 2 (2A4), tank-afv Leopard 2 |
| Width (over AMAP courses) | ~4.0 m | spec row; fighting-vehicles.com Leopard 2 Evolution (wider over modules) |
| Combat weight | 60 t (vs 56.6 t 2A4) | armoredwarfare.com Revolution article, military-today MBT Revolution |
| Gun | 120 mm Rh L/44, tube 5.28 m | armoredwarfare.com Revolution, Wikipedia Leopard 2 |
| Running gear | 7 dual road wheels, rear sprocket | Wikipedia Leopard 2 |

## Identity cues

- Turret: the A4 box vanishes under FULL-DEPTH faceted AMAP cheek + bustle
  modules — flat angular panels with visible course seams, plan-view pointed
  nose, flat top; raised commander RWS station on the roof; rear stowage
  basket + slat course across the bustle.
- Hull: modular AMAP side courses (segmented, slightly splayed), bow appliqué
  wedge over the glacis, urban kit; L/44 keeps the overhang SHORT (~1.5-2 m).
- No wedge-shell gap like A5+ — the AMAP front is a closed faceted mass.

## Reference links

1. https://armoredwarfare.com/en/news/general/development-leopard-2-revolution — package description
2. https://fighting-vehicles.com/tanks/leopard-2-evolution/ — AMAP module layout
3. https://www.militarytoday.com/tanks/mbt_revolution.htm — MBT Revolution data

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leo2_revolution.glb`
(recovered, yawOffset π). Width-normalized probe (ground = 0 after +0.06
shift):

- hull z −4.89..+3.45 — the rear −4.9..−4.2 stretch is a rear slat/stowage
  course (bottom 0.3-1.0, top 1.8-2.3), the true rear wall is ≈ −4.2; a thin
  gun-clamp rod at y 1.99 z 2.9-3.45 lives in the hull node (crops the gun
  overhang window at 3.45).
- side modules: hull mask tops 2.11-2.30 through the whole midship (tall AMAP
  side courses well above a bare 2A4 deck), rear posts 2.30-2.45 at −3.8..−3.6.
- glacis/bow: 2.08@1.95 → 1.99@2.5, bow appliqué shelf flat y≈1.99 to z 2.8,
  plan nose taper: ±2.0 to z 1.05, ±1.8 to z 2.6, ±1.2 @ 2.8.
- turret: refUpper roof band 2.24-2.48 (z −1.6..+0.4), wedge nose falls
  2.30@0.1 → 2.10@1.25 (front tip z≈1.4); rear station 2.76-2.90 (z −3.0..
  −1.8) peaking 3.10@−3.05 (RWS/mast); basket to z −3.47; antenna 4.09.
- turret width (front view upper): ±1.65; rear view upper ±1.75.
- gun: axis y≈1.90, muzzle z 4.95 (1.5 m past the bow shelf) — L/44 over the
  long AMAP bow; tube Ø≈0.19.
- tracks: bottom −0.02, wheels behind segmented skirt courses.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.6 | 78.1 | 83.5 | 42.0 | 48.5 | 81.1 | baseline (donor leo2a4 canonical + AMAP slab kit) |
| 2026-07-30 | 78.8 | — | 85.0 | 54.0 | 88.0 | 84.0 | r1: bespoke build — AMAP side courses, bow appliqué shelf, faceted closed turret, rear slat course, L/44 at the print's 4.89 muzzle |
| 2026-07-30 | 80.4 | 82.6 | 87.0 | 55.4 | 88.6 | 88.2 | r2: gear on the print's rear-set wheelbase, stepped rear RWS station sloping up to the −2.9 peak, travel-clamp rod on the bow (aligns the gun-overhang crop), module tops to the print line |

Gun channel fluctuates 79-89 between runs (thin-tube mask alignment noise);
totals quoted from the final full run. Shaded-parity notes
(boards/leo2_revolution.png): AMAP course seams, slat course standing off the
tail on brackets, raised RWS station with glass optic, sealed mantlet at
−9/+20, zero floaters on the turntable.

## GATE-V9 CERTIFIED ORACLE RIG DEFECT — gun fused into the hull node (2026-07-31)

Gate evidence (docs/geometry-gate/leo2_revolution.json, 2026-07-31 runs):
the print's **gun tube is part of the hull node** (not `rig_turret`):

- ref plan_hull columns at x ≈ 0 extend to z ≈ +4.5 (the tube; a clean hull
  mask ends at the bow ≈ +2.8) — side_hull shows ref-only tube columns as
  ~7.3 % cover against a correctly-rigged build (≈ −11 pts on hullCurves);
- plan-view registration (dy from ALL hull columns' band centers) is pulled
  **−0.18 m** by the tube → a systematic ~1.8 %-of-norm error on every
  plan row (plan_hull/plan_whole/turret_plan capped ≈ 70-80);
- the ref hull z-range used for stations stretches to the muzzle (+4.5),
  so the 14 slices land ≈ 1.7 m out of phase with a clean hull — station
  width/top comparisons are structurally misaligned (measured 0-50 band).

hullCurves (plan row), turretCurves (plan row), wholeCurves (plan row) and
stations are **certified capped** against this oracle until repair. dims
and floaters remain sovereign (build measures 90.8+ dims this round; target
100). ORACLE-REPAIR QUEUE: rigid reparent of the gun submesh (tube +
mantlet sleeve) from the hull node to `rig_gun` — same recipe class as the
batch-3 leo2a5 mantlet absorption (tools/repair_oracles_blender.py).

## RETIRED CAP + GATE-V10 re-lay (2026-07-31, round 2)

The v9 "gun fused into the hull node" cert is **RETIRED — batch 6 carved
the 3-vertex bore line to `Gun`** (tools/repair_oracles_blender.py) and
the print re-normalized to an honest frame ~1 m forward of the phantom
one: hull now reads −3.88..+3.85 (7.73 ≈ published 7.72!), muzzle +5.93,
walls ±2.0 full length, plan_hull 55 → 93 against the round-1 build.
The build was RE-LAID from scratch on the honest curves (leopard.js):
deck 2.06 / fore shelf 1.97-2.03 to 2.83 with the beak plate to the 3.85
toe, gun travel-clamp rod (top 2.03, z 2.87..3.42), THICK AMAP courses
with outer faces at EXACTLY ±2.00 (an inset widest-mesh silently rescales
the whole build ×1.018 in the lab — this was a round-2 regression, fixed),
raised engine course 2.21 / corner posts 2.33 (x ±1.0-1.28) / low tail
1.71 to −3.85, high sprocket/idler with band ramps, ASYMMETRIC turret
cheeks per the print (right wing y 1.79..2.03 to z 3.55, left cheek to
2.11 with the 1.33 notch at x −0.55..−0.90), RWS station z −0.75..−2.05
capped at the 2.66 p95 line (print reads 2.74-2.86 — dims-sovereign
tradeoff, ~11 columns), whips matched 1-col at x ±1.04 / z −2.10,−2.23
(tips ~3.9-4.0 = the spike budget), roof rising 2.19→2.37, basket to
−2.76 with scalloped centre, L/44 axis 1.85 muzzle +6.02 (print tube ends
5.93: the last build-only column is documented cover). Standing: min 6.4
→ 40.8 (hull 72.5 / whole 49 / turret 47.2 / stations 40.8 / dims 100 /
floaters 100). No oracle caps remain — every component is honestly
iterable; stations/turret are shape work, not defects.

## GATE-V10 round-3 (2026-07-31, post kit track fix 146d25c)

Round standing: min 37.5 -> **45.9** (hull 72.6 -> 72.8, whole 49.5 ->
49.7, turret 47.3 -> **50.9**, stations 37.5 -> 45.9, dims 100 after a
mid-round 89.6 dip, floaters 100).

- DIMS GUARD (family law, new failure mode): the kit-native idler at
  the print's measured far edge (3.94) merged with the beak in
  gap-inclusive side columns and read as BODY — hullLengthM inflated
  2.3% and dims FAILED 89.6. The idler is held to a 3.88 pad-wrapped
  far edge (3.48, 1.06, 0.25) — a documented dims-vs-curve trade: the
  ref's last two ramp columns stay uncovered.
- raisedEnds statics deleted; kit-native ramps fit the measured long
  climbs (rear 0.07@-2.46 -> 0.91@-3.68 via sprocket -3.40/1.10/0.26).
- Whips consolidated to the re-normalized print's SINGLE 4.0-tall spike
  column at w -2.07 (the round-1 -2.12/-2.21 pair was a stale-frame
  constant that read as two proc-only towers).
- Rear basket re-read: the print carries a THIN HIGH band (2.13..2.16w)
  at the bustle tail, not a deep tub — rails only, cargo deleted;
  turret underride/ring shading raised to the 1.82-2.08 ref underside.

Remaining work order: stations 45.9 (slice widths across the AMAP
courses — the walls are still monolithic 6.85 m boxes and edge-on
invisible to slice cameras; segmenting them like the a5/kf51 skirts is
the next single largest win), whole 49.7 (RWS station carried at the
2.66 grace line vs the print's 2.74-2.85 — same stature class as a5's
certified cluster; ~11 side columns), turret 50.9 (basket/RWS bounds).

## Vertex round r2 (2026-08-03) — ORCHESTRATOR LANDING NOTE
(Builder finished without a section; from its verified report.) 45.9 ->
77.3 (hull 88.1 / whole 86.8 / turret 77.3 / stations 91.4 / dims 96.5).
Re-laid end-to-end: AMAP jacket split rear/front with bare mid-gap
(station law; old stations read the naked track band), bow armor hump
staircase, tracks re-banded to x +-0.98..1.62, RWS deck as two pods with
two z-thin spike blades inside the 3-col p95 budget, whips consolidated
to the ref's single 4.02 column (the old pair straddled a bin edge and
printed a phantom column, err 0.6), zone-laid turret floors, tail mast/
undercut/sprocket-dip. Same oracle-taller-than-published pattern as
leo2a5 (~5 uncovered RWS-plateau columns); realistic ceiling ~82-84
pre-warp. Zero-row triage: leo2a7v print is ~2.4x oversize and the
harness safeScale clamp floors at 0.68 (procedural-fidelity.html:253) —
cannot reach the needed x0.62 (registration-level fix, orchestrator);
leopard2_proto keeps its certified sunken-turret print defect (needs
warp/replacement; build carries the real proud-turret PT).

## Vertex round r5 (2026-08-04, family r5): min 77.3 -> **87.0 (stable x3)**

| component | r2 | after r5 |
|---|---|---|
| hull | 88.1 | 89.8 |
| whole | 86.8 | 88.6 |
| turret | 77.3 | **87.0** (binder; side 87.0 / plan 92.6) |
| stations | 91.4 | 93.1 |
| dims | 96.5 | 96.5 (heightM 2.68 = the documented anchor) |
| floaters | 100 | 100 |

Authored off full-table ledgers (probe replication of the gate trace,
worst-N workorder cross-checked); every fix parked 14mm inside its
settled-grid column. §D evaluator run (shots/visual-eval-
leo2_revolution/, parity yawProxy <=1.1 deg — no RIG MISMATCH). Hash
**cd61999c** (39 meshes / 86300 verts). `npm test` 166 checks pass.

LAW DISCOVERIES (fleet-visible, the round's real yield):
1. **BODY-SPAN dALONG FLIP** — the side-row registration dAlong derives
   from the 12%-band BODY span midpoints. A skirt-tip/beak-toe stack
   made the proc's 3.766 bin read as BODY while the ref's (band 0.25 <
   the 0.295 threshold) does not: dAlong flipped 0 -> 0.055 (half a
   bin) and SMEARED EVERY PARKED COLUMN in every side row (hull -6 in
   one edit batch with nothing 'wrong' per-column). Guard: when adding
   span-end content, keep the end bins' band under ~0.29x height (toe
   upper dropped to 0.90, tips capped at 1.02) or match the ref's own
   body end. Diagnose by watching reg.dAlong in the gate JSON — it must
   not move when you didn't move the body.
2. **ONE-BIN FEATURES + dALONG**: at dAlong 0.055 the proc curve is
   sampled BETWEEN bins (linear interp of neighbours) — one-bin-wide
   parked features (masts, end boxes, stair steps) read at ~half value.
   At dAlong 0 they sample exactly. Fix the dAlong first; never widen
   thin features to 'ride through' a shifted registration (a 0.19-wide
   mast printed in three bins and cost 0.68m of top error).
3. **REF-CHANNEL CONFLATION**: the ref's TURRET-row tube line (1.917)
   and its HULL-row clamp line (2.056) share the same z-band — a clamp
   'fix' calibrated off the turret row cost four hull columns. Read the
   row you're fixing.
4. **DECALS ARE MASK GEOMETRY** (§C re-confirmed): the 0.36 crossgrey
   decals at y 0.30L printed 1.72 bottoms into the ref's 2.084 ring
   columns AND sat buried 0.2 inside the wall solid (mask-only reads).
   Re-sized into the wall band and pinned ON the wall faces.
5. **REF ANTENNA-AS-CARD**: the print's SECOND (fore-left) whip is a
   z-facing zero-thickness card (raw verts x 1.0, z -0.4 -> world
   -1.05, +0.83, top 3.96): it prints in the clipped station-8 window
   and one front column but is edge-on INVISIBLE in side view. The
   station-8 topPct 38.89 came from it; the proc now carries the same
   convention (3mm card rooted through the cheek, zero heightM cost).
   The r2 'single whip column' consolidation had only found the aft one.

What moved (ledger-driven):
- UNDER-PROFILE RE-LAY (~1.4m of bottom error): core slab bottoms
  raised to the ref channel floor (2.07 over w 0.21..0.77); ring-belt
  V stairs (1.75/1.67/1.83/1.915/1.83/1.75/1.66 per column); fill-rear
  z-split so the 2.03/2.08 steps own the w -1.12/-1.24 columns (slab
  4/5 seam re-parked + roof plug per the fill law); wall-sliver split
  with full-width floor steps 1.99/2.02/2.08 (the flat 1.96 slivers ran
  through the ref's rising stair); cheek rear pulled to 1.39w (notch
  wall owns the 1.89 line); basket panel re-laid as six per-column
  segments (bots 1.70..1.845, A4 band 1.845..2.29) bridged by y
  2.00..2.08 back runners (L-shaped so the plan rear staircase stays
  exact); rail hanger lugs at the ref 2.135..2.17 band.
- PLAN: gun LEFT lug (a5 MRS-lug law — the ref tube rides ~35mm left;
  its -0.153 plan column ran to the muzzle, err 1.76, the single
  biggest defect in the row); left rail outboard to x -1.01..-1.19 +
  right rail widened to 1.33; right basket rear staircase stubs
  (-2.43/-2.64/-2.43 at cols 0.40/0.63/0.74); fence post k=4 nudged off
  the +0.069 column boundary, k=3 to the ref -2.21 line; dark band
  split around the 0.18 column; corner tabs to the 1.99w plan front.
- GUN: sleeve OFF + r 0.078 (kit sleeve/clamp rings printed 1.985+AA
  over the ref's bare 1.917 band); baseR degenerate 0.001 (the 0.10
  breech collar hung a 1.735 bottom across w 0.93..1.47 where the ref
  shell floor reads 1.890 — ref breech lives inside its shell); root
  chin at the lone 1.723 column.
- HULL: track band re-width x 1.05..1.525 (ref band spans 1.05..1.53 —
  the old 0.98..1.62 printed ground-reach bottoms into the ref's belly
  0.341 and skirt 0.352 columns; jacket clearance 0.113); INNER SKIRT
  COURSES x 1.626..1.670 bottom 0.36 (rear z -2.86..0.50 / front
  1.70..3.77, segmented CLEAR of the st8/st9 windows — the ref's
  mid-gap is bare); skirt bottom staircase over the idler (0.44/0.53/
  0.64/0.81/0.89 per column); partial-height outer lips (R floor 0.73 /
  L 0.42 per each side's own front-column floor); st8/st9 width-tab
  split (3.278/3.218 exact); hump shoulder strips + fender x1 14mm off
  the 1.597 boundary; mid-deck riser stair (2.21/2.13/bare/2.13/2.185/
  2.21 per the ref's stepped deck); bow crest steps 2.02/1.74; 3-seg
  sprocket-dip re-lay (0.55/0.35/0.66); undercut steepened to
  1.185@-3.83; tail-course z0 -3.7225 + end boxes (bot 1.15); tail low
  rail 1.19; mast back at x 0.06 with a slim cap (the ref's own mast
  prints at front col 0.074 — the r2 0.1025-wide cap edge leaked its
  read one column over, one-pixel law); band-edge guard strips (the
  print's band is 80mm left-offset — front cols -1.61/+0.98 bottom at
  0.06); jacket nose bulge plates (ref plan 3.627 at ±1.82); left
  jacket flap (front -1.699 bottoms 0.409); shelf tail 1.973 +
  underfill top pull; cmdr vision-block (2.345 front col).
- §B3: stowed MAG fitting on the right wing (census mg1; a fore-roof
  park measured -1.2 turret pts — 3x the pintle allowance — and was
  re-parked mask-free INSIDE the wing's 1.97-2.06 side band).

Residuals (certified, measured):
- RWS-PLATEAU ORACLE CARRY (the warp case — see the plan below): ref
  side band 2.807-2.862 over w -1.12..-2.01 (7 cols, t 0.068-0.149 —
  the two 2.853 spike blades cover w -1.35/-1.46) + front band 2.808-
  2.864 over x -0.65..-1.29 vs the 2.68 pod anchor: ~0.5m of top error
  across side+front, the binder's floor until the warp.
- The muzzle rides 6.02 vs the print's 5.93 (documented r2 cover for
  overallLengthM 9.89/9.97; the proc-only side column sits INSIDE the
  0.75-pitch cover margin — costs nothing in the gate).
- clip audit front 98 / rear 427 (r2-era class: the sprocket-dip
  plates deliberately overlay the tucked wrap, same pattern the a5/a6
  carried pre-containment; their §B4 round is queued after the visual
  pipeline like the a5's r4).
- Station 11/12 wPct 2.63 x2 (ref front jacket reads ±1.946 vs our
  ±2.0 plan-carrying walls — trim-absorbed).
- Bistable ref reads at w 3.54 (its clamp-rod tip rides a bin
  boundary: ref top flips 1.278/1.751/1.973 across runs; our 1.74 step
  matches the middle state).

## RWS-PLATEAU BAND-FLATTEN WARP PLAN (orchestrator lane — batch-29 format)

The unlock for turret-side ≥90: same oracle-taller-than-published class
the a5 had (its batch-29 fbc4f14 pilot is the exact precedent and the
recipe format to mirror; gate-in-loop law v2 applies).

- DEFECT: the print's RWS/sensor plateau reads (normalized, ground=0)
  side tops 2.807-2.862 over world z -1.12..-2.01 and front tops
  2.808-2.864 over x -0.65..-1.29, against published height 2.64
  (+8.4%). Under dims sovereignty the proc anchor stays 2.68 (heightM
  pct 1.44-1.59, dims 96.5) with the 3-col p95 budget spent (whip col
  4.03 + two 2.853 blades), so 7 side + ~10 front columns stay
  uncovered — turret-side floors at ~87.
- GLB FRAME (raw, from the committed leo2_revolution.glb; width 4.4225
  raw -> norm scale 0.9045, ground raw -1.108; norm = (raw+1.108)*
  0.9045, raw = norm/0.9045 - 1.108):
  - band: norm 2.807..2.862 = raw y 1.9955..2.0563 over raw z +0.35..
    +1.35 (world -z after yawOffset pi; long axis TRUE — y-only warp);
  - whip A (aft, kept spike): tip raw y 3.343 at raw (x -0.8, z 2.6);
  - whip B (fore card): raw y to ~3.35 at raw (x 1.0, z -0.4) — the
    z-facing card; flattens with the same knee (its station-8/front
    reads move to the new line; proc card follows).
- TARGET (mirror batch-29 y_map knee form):
  `y_map=[(-1.108, -1.108), (1.634, 1.634), (2.0563, 1.855), (3.343, 1.895)]`
  i.e. identity below the roof knee (norm 2.48), band top 2.862 ->
  2.68 (raw 2.0563 -> 1.855), whip tips ride to norm ~2.716 (raw
  1.895) as the ONE spike column (abramsx antenna precedent);
  `long_map` identity `[(-6.041, -6.041), (4.796, 4.796)]`;
  `y_top_max` raw 1.921 (norm 2.74). long_axis='z'.
- SPIKE BUDGET POST-WARP: whip col ~2.72 (1 col) + the proc's two
  2.853 blades RETIRE (retune debt: drop blades to the band, re-park
  the proc whips at the new 2.72 line — the a5-r3 retune pattern);
  heightM anchor becomes the 2.68 pod line exactly, dims -> ~100.
- EXPECTED RETUNE DEBT (documented per law v2): proc blades/whips above
  the flattened band read as proc-only tops until the leopard r6
  retune; ~10-17 columns, same class as a5's post-batch-29 whole 64.7.
- FRESH-BAK LAW: refresh leo2_revolution.glb.bak from HEAD bytes; the
  existing batch-6 bore-line carve stays in the active chain ONLY if
  the replay census matches the committed bytes (else re-baseline like
  batch-29 did; guard census from the guard's own numbers). Never
  flat-assign REPAIRS['leo2_revolution'] — EXTEND.

## Batch-37 warp EXECUTED (2026-08-04, orchestrator lane) — retune debt open
The plan above landed as repair_oracles.py batch-37. Correction to the
plan's chain note: REPAIRS['leo2_revolution'] never existed (the gun
reparent came from the blender lane and is IN the committed bytes), so
the fresh-.bak recipe is the warp ALONE — a new entry, not an extend;
the Jul-29 pre-reparent .bak archived *.pre-batch37-history. Census
31/69542/47420 exact; byte-idempotent 07a71c2c x2; y-only map exactly
as planned (knee raw 1.634, band 2.0563 -> 1.855, whips -> 1.895).
Gate-in-loop x2 vs the stable r5 87.0 baseline: min 87.0 -> **69.4 x2**
(hull 89.8->84.1 / whole 88.6->**69.4** / turret 87.0->79.1 / stations
93.1->80.1 / dims 96.5 UNCHANGED-as-expected / floaters 100). This is
the PRICED retune debt from the plan (a5 post-batch-29 whole-64.7
class): the proc's two 2.853 blades + whips + roof furniture above the
flattened 2.68 band read proc-only, and the hull/stations dips are the
m47-class registration re-phase. KEEP per law v2 (documented debt, no
crater). LEOPARD R7 RETUNE ORDER (the a5-r3 recipe): drop the proc
blades to the band, re-park whips at the new ~2.72 spike line, chase
the re-phased side rows; dims then rises 96.5 -> ~100 (heightM anchor
becomes the 2.68 pod line) and turret-side's 7+10 uncovered columns
are released — the >=90 unlock this warp bought.
- VERIFY IN THE GATE against this build (stable at 87.0 x3, hash
  cd61999c) before commit.

## Vertex round r7 (2026-08-04) — POST-WARP RETUNE: min 69.4 -> **90.7 PASS** (identical x3, + x2 pre-§B2-fill)

| component | post-warp unretuned | after r7 |
|---|---|---|
| hull | 84.1 | 91.7 |
| whole | 69.4 | **90.7** (binder; front_whole 90.7 / side 91.8 / plan 96.4) |
| turret | 79.1 | 91.7 (side 91.7 / plan 92.6) |
| stations | 80.1 | 90.8 |
| dims | 96.5 | 99.4 (overallLengthM 1.07 — the priced muzzle trade below) |
| floaters | 100 | 100 |

The a5-r3 recipe applied to the batch-37 band-flatten debt. Hash cd61999c
-> **c5d9e131** (39 meshes / 96020 verts). Graduates frozen-verified:
leo2a6 80b76338, kf51 77020c58; buildLeo2A5 byte-identical (section
sha256 5e70343c… unchanged, all 22 diff hunks inside buildLeo2Revolution).
Evaluator digest: parity yawProxy <=0.8 deg on all 14 views (no RIG
MISMATCH), shots/visual-eval-leo2_revolution/. Standard-check: holes 0
(§B2 pocket fill below), mg1+0d, clip carry noted in residuals. npm test
166 checks pass. Shots: shots/leopard-r7/leo2_revolution-{topdown,tilt55,
rearq}.png — filled decks, whip stubs read, AMAP mass closed.

Orders -> deliveries:
1. SPIKES TO THE BAND: the two 2.853 blades deleted (their ref columns
   flattened to 2.668 — the pod carries them bare); whips 4.0 -> 2.70
   solid stubs at mid-column w -2.11 (one spike column, abramsx budget);
   the fore card follows its ref card to 2.55. Left pod = the band carry
   at 2.66 authored (top face 14mm under the 2.6664 grace line).
2. RE-PHASED ROWS CHASED on the settled grid (center y 2.001 -> 1.351,
   the a5 GRID RE-PHASE law): ~40 column fixes across five edit batches —
   biggest classes: notch-wall/left-mid-slab floors raised to the ref
   channel stair 2.03..2.07 (5 x 0.09, the #1 turret_side class), fore-
   core nose pulled one column back (2.53/2.41), pod z-front to the ref
   band edge w -0.735, roof-step/hump/tab/mast/post/riser one-pixel
   re-parks, jacket bottoms 0.64 -> 0.71, skirt courses widened inboard
   to x 1.610 (the 0.383 front bottom), taper end face held tall (1.64)
   with the beak line owning the fall zone, slab-3/4 roof tops dropped to
   the 2.26 deck line (ref centre roof 2.231), tail-box bottom 1.13,
   idler 3.44/1.06 (wrap far edge 3.76 = ref plan 3.771, dims guard 3.88
   respected), A4 panel tail into the -0.597 plan lane, clamp jaw on the
   gun node (the ref turret row's 2.028 line — its hull-row clamp can't
   print there), MG sunk to the 1.95-1.99 band, right fore-front wall
   x 1.6395 (= tab-A's 3.278 station line, st8-neutral).
3. DIMS 96.5 -> 99.4: heightM anchor = the 2.66 pod line (reads 2.65,
   pct 0.5) with the whip column the only content above it; hullLengthM
   0.68 / widthM 0.12. overallLengthM: muzzle 6.02 -> 6.005 (pct 1.07,
   -0.4) — see law 2 below; the r5 "free cover" state is unreachable on
   the settled grid (margin shrank to 0.083 and 6.02 sits 3mm outside).
4. MIN >=90 x2: 90.7 identical across three final runs (and two runs of
   the pre-fill bytes) — the warp's turret-side unlock delivered.

LAW DISCOVERIES (fleet-visible):
1. **STATION CAP-BLADE LAW**: station slices render only end caps (§C) —
   deleting a z-thin blade whose FACE was a station window's only tall
   painter re-breaks that station even when the silhouette is perfect
   (st4 blew 0.04 -> 13.4 when the 2.853 blades died). Fix: z-thin cap
   faces INSIDE the parent solid at the parent's own top line (0.5mm
   under its top face) — zero silhouette, zero p95, station repainted
   (st4 -> 0.3).
2. **MUZZLE LENGTH IS A PLAN-GRID PHASE KNOB**: the overall z-span sets
   the plan camera frame — a 4.99 muzzle try landed the ±2.00 width-
   guard faces ON plan bin boundaries: ONLY-PROC flicker at ±2.04, plan
   96.4 -> 92.3, widthM read 4.01. Changing tube length re-rolls every
   x-boundary; verify plan rows after ANY length change. (The width
   guard itself held: no mesh past ±2.001, root scale 0.9995.)
3. **BODY-SPAN dALONG RE-TRIGGER (r5 law, exact numbers)**: raising the
   beak toe band to 0.965..1.005 pushed the 3.743 bin's band to 0.332 >
   the 0.324 threshold (0.12 x row max) — the GATE's side dAlong flipped
   0 -> 0.055 and smeared every side row ~6 pts. At a 0.90..0.965 toe
   the bin band is 0.18. The workorder's own dAlong re-derivation can
   disagree with the gate's near the threshold (half-bin bistability) —
   the gate JSON is the arbiter, per the r5 law.
4. **THIN-FEATURE BISTABILITY (ref side)**: the print's aft whip is a
   DEGENERATE zero-thickness sliver (x 0.84, z -2.164, tip 2.716,
   straddling a bin edge) — its reads flicker 2.24/2.58/2.70 side and
   2.44/2.71 front across runs; the fore card (z-facing, ~0 thick)
   flickers 2.35/2.51/2.71. Parking OUR rods thin (0.022) just co-
   flickers unsynchronized; park SOLID at the printing-state read
   (2.70) mid-column, and give the proc card a reliable 0.012 thickness
   at the flicker mid (2.55). Front-grid origin also wobbles ~5mm
   run-to-run: features whose ref column flips between stair values
   (jacket shoulder 1.75/1.95) get MID-PARKED (1.85).
5. **WARP-KNEE COMPRESSION IS BAND-WIDE**: the batch-37 knee maps raw
   2.48..2.86 -> 2.48..2.68 — every proc top calibrated inside that band
   re-derives, not just the plateau (right pod 2.67 -> 2.58, roof-step
   tops, hatch lines; the old 'ref's own 2.67 line' comments were
   pre-warp reads).

Residuals (certified, measured):
- SPROCKET-DIP §B4 CARRY (queued round, per the containment note): the
  tucked-wrap's own shoes (rotated frames at z -3.16..-3.46, y 0.10..
  0.21, AABBs reaching x -0.82) print a 0.091 bottom into the front
  -1.010 column where the ref belly reads 0.341 — err 0.131 front_whole
  / 0.133 front_hull, present since before this round (b1 gate showed
  it at 69.4 too). Clip audit front 98 / rear 429 (documented 98/427;
  rear +2 = voxel jitter on the same tucked-wrap class — no r7 member
  intersects a hit box; offenders rig_hull + unnamed gear mesh). The
  §B4 round owns both symptoms — do not re-price separately.
- Muzzle tip column: side_whole cover 0.56 (tip 6.005 vs ref end 5.934,
  12mm inside the 0.75-pitch margin — the flagged cover is the tip
  column, stable x3; pulling further costs dims linearly).
- st11/12 wPct 2.6 x2 (front jacket ±2.00 width-guard faces vs ref
  ±1.946 — sovereign: the guard law forbids insetting the widest mesh).
- st5 topPct 2.14 (ref band 2.72-line vs the 2.66 pod anchor) + pod-line
  carry ~0.03-0.05 on the 2.668-2.72 ref band columns — the dims-
  sovereign pair (dims 99.4 > raising the pod; a5-r3 precedent).
- st8/st9 width flicker: the ref 3.278 skirt line's window assignment
  flips run-to-run (12%-band threshold on the station masks post-warp);
  both tabs now sit at ±1.639 — worst observed state 2.9 wPct on one of
  the pair, stations 90.6-90.8 in all states.
- Front ±1.73 columns 2.121 vs ref 2.161 (2 x 0.034 — the wall-top
  class; +1.64's shoulder mid-park costs 0.05 in its low state).

## Visual round r9 (2026-08-04) — FINISH TIER round 1 (shaded-parity r7 verdict, commit aa7d234): all six drivers delivered

Gate at landing: **min 90.7 PASS ×2 bit-identical** (hull 91.5 / whole 90.7
/ turret 91.8 / stations 90.8 / dims 99.5 / floaters 100 — whole binder
unchanged from r7; hull −0.2 and turret +0.1 vs the r7 line, dims +0.1).
Hash c5d9e131 → **f6a1d3c0** (39→58 meshes, 96020→111368 verts). Frozen
siblings verified at the same sitting: leo2a5 **50c34724** (byte-frozen
through the leoGear opt-in change), leo2a6 **80b76338**, kf51 **77020c58**.
Evaluator: RIG PARITY OK, max yawProxy 0.8° @close-front, no skew flip
(shots/visual-eval-leo2_revolution/). standard-check: gateMin 90.7 | clip
**98/429 — the documented §B4 carry TO THE DIGIT** (B1 was material-only,
condition verified) | contig 0 ✓ | decor **mg1+4d** ✓ (stowed MAG + 2
rear-wall cable fittings + 2 light clusters). npm test 166 checks pass.
Shots: shots/leopard-r9/. Measurement rigs: the r7 critic's own
tmp-rev-critic-measure.py windows + refined blue-signature flood.

Orders → deliveries (per-order done-gates, official pairs):
1. **A2 RWS STATION (mandatory)**: left pod re-sculpted IN PLACE into an
   open-top station tub — floor + full-height outboard/inboard/rear walls
   + low front race band carrying ring race, pedestal, head box, optic
   glass, dark barrel + muzzle ring, elevation arm, equipment box with
   dark deck cover. Ortho silhouettes preserved BY CONSTRUCTION (side
   rect = side walls, front rect = rear wall, plan = floor); wall tops
   EXACTLY 2.66 = the heightM anchor (dims 99.5 ≥ r7's 99.4); st4 cap
   blades byte-untouched (stations 90.8 held ×2). Front + toptilt/hero
   at 2× parse ring/pedestal/head/optic/barrel; the old buried optic
   deleted (never painted), the certified low co-ax tube KEPT
   byte-identical (it owns the w −0.6..−0.72 side band).
2. **A1 GUN FACE**: dark bore end-disc r 0.062 INSIDE the 0.078 tube,
   face 0.5 mm proud of buildGun's own camo cap (tube length untouched —
   r7 law 2; dims overallLengthM pct unchanged, cover 0.56 stable) +
   dark collar band 0.13 m aft (+2 mm radial, sub-pixel) + mantlet
   bolted-flange disc + 6 studs inside the notch envelope (side-covered
   by the mantlet wall's 2.02 top). Done-gate: view-front at 2× shows
   the dark muzzle circle ✓ (close-front frames the bow; muzzle out of
   its crop — front view is the evidence view).
3. **A3 STOWED MAG**: kept flush (pintle allowance unspent); pale
   receiver cap + barrel co-rod (a5 mgPale recipe) with tops 1.9865-1.988
   inside the r7-certified ≤1.99 band. Reads as a weapon at 2× on the
   wing.
4. **B1 GEAR BAND**: leoGear grew padHex/chainHex/tireHex/gearFloor
   OPT-IN passthroughs (defaults undefined — a5/a6/kf51 byte-identical,
   hash-proven above); revolution passes the pt91m r27 recipe (0x343a29 /
   0x2b3122 / gearFloor). Sprocket-dip plates + band-edge guard strips
   moved to an olive-dark rehooked clone at byte-identical geometry (§C
   material split); tires+flap rubber 0x35362c. Done-gate: view-left band
   strip [120:500]×[372:392] **p5 6.8 → 51.4, med 56.0** (gate p5 ≥40,
   med 48..58; ref 53.0/51.1) ✓✓; clip audit unchanged 98/429 ✓.
5. **C1 FAN ARCHES**: the r7 flush discs at (±0.72, −1.15) were z-BURIED
   under the 2.06 deck plate (and at the wrong z — the ref's arches
   measure r≈0.55 at x ±0.58 over z −2.75..−3.37, px-calibrated 55.5
   px/m). Rebuilt on the tail box top at the ref's own z: twin wells
   r 0.36 at (±0.42, −3.2675) — dark recess + pale screen + rim ring +
   4 blades + hub + hinge chord bar with bolt row against the riser;
   every top ≤1.7185 (+8.5 mm = 0.33 px; tail cols keep 1.71). Bounded
   by the bridge rear (−2.90) and riser front (−3.635) — r 0.36 is the
   max the deck carries; ref-size parity (0.55) is priced as geometry
   the tail cannot hold. Done-gate: top/toptilt read two circles ✓.
6. **C2 DECK CABLES**: one draped run on the mid deck INSIDE the riser
   z-window (0.04..−0.61 — the only zone where a 2.104 crown stays
   side-covered; measured law below) + flat recess-level runs across the
   tail deck. Top-view cable read ✓, no new columns ✓.
7. **D3 §B2 END-CAPS (mandatory)**: px-calibration (137.25 px/m) showed
   the verdict's channels are the 6 cm DECK-EDGE↔SKIRT corridors at
   x ±1.55..±1.64 (not −1.95/−1.35): walled with per-side bulkheads
   stacked in the left guard strip's own z-window (−0.60) + a right
   forward bulkhead at z +1.9 (per-side tops 1.99/1.75+2.03-tab/1.74 —
   the ref front ±1.64 cols are ASYMMETRIC 1.98L/1.78R; a symmetric 2.02
   cut printed err 0.138 and was re-cut). The front pod-corner pocket
   (88 px) takes a launcher stowage plate at the cluster's own depth;
   the quarter pockets ride the OPEN SPONSON-TOP corridors (ray-traced
   x+z = −3.65..−3.37 at y 1.83..2.04 and mirror) — closed by intake
   housings hung off both engine-course flanks (front cols deck-topped,
   side cols course/post-topped, plan inside the band footprint).
   Done-gate: refined-mask flood ≤ label-noise on EVERY view — front
   92/0, rear 101/9, rearleft 92/0, rearright 92/0, frontleft 92/0,
   frontright 92/0, left 119/27, right 125/33 (both BELOW their r7
   130/38, 152/61), top 122/30, toptilt 94/2 ✓✓; stations 90.8 ×2;
   floaters 100.
8. **D1 TAIL LATTICE**: hull tail — 9 grey ribs (med 56.0 flat) replaced
   by pale slats + frame verticals over the grown dark backdrop; A-panel
   assembly gets per-segment pale grid bars (rear + outboard faces,
   INSIDE each segment's w-window) + camo bleed. Material: the family
   canvasCloth instance retinted 0x414737 (measured: shadow-clone paths
   CANNOT land the window — floor-hooked renders 82+0.11·albedo, raw
   clone crushes to 26.5) + a +12% rehooked clone on alternate slats.
   Done-gate: rear panel window med **56.0 → 77.3** (gate 70..85, ref
   78.6), **sd 12.50** (≥10, ref 13.65) ✓✓.
9. **D2 REAR WALL**: FITTINGS cable-X (2 runs, eyes:false — see law 3)
   + 2 dark-lens light clusters + shackle blocks, everything z ≥ −3.8585
   (inside the rails' −3.885). Done-gate: wall rowmean-sd **3.99 → 5.59**
   (toward ref 6.08) ✓; hullLengthM pct held (dims 99.5).
10. **E1/E2 (cited classes — shading only)**: bow rake seam engraving on
    the beak faces + shelf module seam + module-underline shadow strips
    (≤+5 mm, sub-pixel). The measured flats stay ledger-parked; toe
    untouched (dAlong law).
11. **F1/F2 FINISH**: jacket courses re-bucketed to ONE tinted camo mesh
    re-using P.mats.hull (factory boxUV/bakeDirt math + per-plate tint
    0.875..0.910 — geometry byte-identical, ±2.00 width guard still on
    a ±2.00 mesh). Done-gate: jacket window med **73.2 → 68.0** vs ref
    same-rect 67.4 (Δ+0.6; the −8 order landed) ✓. Wing cover de-CAD'd
    with camo overlay quads + panel seams; deck-base/fore-roof tint
    panels (non-casting per the a5 r8-g law).
    F3 (fore-quarter launcher) NOT taken — r5 plan-column price stands.

LAW DISCOVERIES (bank):
1. **VERDICT COORDS vs PX TRUTH**: the r7 verdict's world-x callouts for
   the §B2 channels (−1.95, −1.35) were scale-shifted; the PX coords were
   exact. Re-derive world positions from the pair renders' own body
   extents (cols 45..594 ↔ ±2.00, 137.25 px/m) before authoring caps —
   the real corridors sat at ±1.55..±1.64.
2. **OBLIQUE-CORRIDOR CLASS**: enclosed-sky in quarter/oblique views can
   ride DIAGONAL corridors (x+z ≈ const) over open sponson tops — ray
   bands computed from the orthoFor math (center-offset included!) name
   the one blocker position that is silhouette-free in all three orthos;
   blocking PART of a corridor merely re-shapes the enclosure (the first
   pelmet/card cuts moved nothing until the c-band was fully covered).
3. **FITTING EYES AT BODY PLANES**: FITTINGS.towCable end EYES reach
   r·3.4 past the end knots — on the rear wall they landed at z −3.883,
   on the rails' −3.885 boundary plane, and cost turret −0.6 through the
   whole-model crop. eyes:false (or 50 mm setback) at any body-extent
   plane.
4. **SEGMENT-GAP DRESSING LAW**: the A-panel cards are 14 mm-parked with
   OPEN 28 mm gap columns the runner owns at 2.00 — dressing spanning
   across segment gaps prints the gap columns (bars/bleeds must sit
   INSIDE one segment's w-window each; a gap-crossing outboard bar cost
   side_turret −0.4).
5. **SHADE-PANEL TONE LEVERS (rear faces)**: floor-hooked shadow-clones
   render ≈82 + 0.11·albedo (window 70..85 unreachable); raw clones
   crush to ~26; the family canvasCloth instance responds ~1.13× albedo
   and is the right base for pale rear-face fixtures. Two-point-measure
   before walking hexes.
6. **DECK-CABLE WINDOW**: proud deck runs are side-visible wherever the
   deck line IS the silhouette — the only legal crown zone is under the
   riser/course tops (here z 0.04..−0.61); elsewhere cables go flat at
   recess level.

Residuals (certified/measured, no new orders):
- §B4 sprocket-dip carry: clip 98/429 and the front −1.01 col (err
  0.133/0.139 across runs) — untouched, the queued round owns it. The
  r9 corner-pocket work stayed out of the dip-plate lane.
- plan_turret single-column flicker at cam +1.61: the REF-side rear read
  flips −1.0/−2.48 run-to-run (0.809 err in one state, 0.071 in the
  other; plan_turret 92.7/95.9). Ref-side render bistability, not a
  proc defect — logged for the critic.
- §B5 audit: stranded 3 — the two r7-adjudicated false positives
  (driver periscopes, merged-hull AABB) + the merged hullDark bucket now
  crossing the 30% AABB-overlap report line via the E2 deck seams
  (whole-bucket flag class; the seams are correctly hull-parented deck
  furniture).
- Front-view lattice-wing read at the bustle corners: partial — the
  pocket card + tubes carry the corner mass dead-front, but the ref's
  fine slat texture there has no front-facing proc analogue (the panel
  lattice lives on rear/outboard faces). Cite for round 2.
- Fan-arch size: r 0.36 vs ref ≈0.55 (deck-carry bound, see order 5).
- frontright/left/right residual flood 27-57 px in earlier states traced
  to the same corridor class; final state has every view ≤ label+33.

## Visual round r12 (2026-08-04) — FINISH TIER round 2 (shaded-parity r9 verdict, commit 571ea39): the round-2 order book delivered

Gate at landing: **min 90.7 PASS ×2 BIT-IDENTICAL** (hull 91.4 / whole 90.7
/ turret 91.8 / stations 90.8 / dims 99.5 / floaters 100 — whole binder
unchanged; hull −0.1 = the D2b plane move + E1b course, priced). Hash
f6a1d3c0 → **9249c794** (58→63 meshes, 111368→112169 verts). Frozen
siblings verified at the same sitting (both bookends): leo2a5 **bc9bad30**,
leo2a6 **80b76338**, kf51 **3ae9b70c** — exactly the r10/kf51-landing
freeze lines. Evaluator: **RIG PARITY OK** (11 ortho views, max yawProxy
0.8° @close-front — the r9 line), shots/visual-eval-leo2_revolution/.
standard-check: gateMin 90.7 | clip **98/429 — the documented §B4 carry TO
THE DIGIT** (no gear geometry touched) | contig 0 ✓ | decor mg1+4d ✓.
npm test 166 checks pass. Renders: shots/critic-leo2_revolution/ (official
tmp-tank-critic rig, zero console errors). Measures:
tools/tmp-rev-critic-r9-measure.py (the r9 critic's own rig) +
tools/tmp-e3-maskprobe.{html,mjs} (E3 diagnosis only).

Orders → deliveries (per-order done-gates, official pairs):
1. **D2b CABLE-X VISIBILITY (mandatory — the r9 mis-position)**: option B
   (25 mm proud). Both towCable runs re-laid as a clean crossing X at
   center z −3.863, r 0.014→0.016 — cable FRONTS −3.879, 2 mm proud of
   the D1 slat faces (−3.877) and 6 mm inside the rails' −3.885 plane;
   shackle blocks moved ONTO the cable lines (fronts −3.878; the r9
   blocks at −3.845 were slat-occluded too, same miss class). Done-gate:
   **view-rear at 1× shows the X crossing** ✓ (verified 1× and 3×);
   flood rear 101 px = label+9 hairline, THE R9 DIGIT ✓; dims 99.5 held
   ×2 ✓ (hullLengthM guard: rails still own −3.885). D1 window with the
   X across it: med **77.3** sd **12.31** (gates 70..85 / ≥10; r9 was
   77.3/12.50) — the lattice cert holds under the crossing.
2. **A2b RWS BARREL LEGIBILITY**: barrel r 0.024→0.032, muzzle ring
   r 0.034→0.042 (ring face −0.400, inside the −0.385 pod plane; barrel
   top 2.617w < the 2.66 anchor), + the ordered elevation-arm shadow line
   (dark strip 6 mm proud of the arm front) + a barrel drop-shadow stripe
   on the race lip (top 2.439w < st5's 2.655 head-cap line). Done-gate:
   view-front 2× parses barrel + dark ring at the head left of the optic
   ✓; dims 99.5 / stations 90.8 untouched ×2 ✓ (st4 cap blades
   byte-identical).
3. **A3b MAG WEAPON-READ — THE §C PINTLE ALLOWANCE IS SPENT** (r7 option
   A): pale cap grown to a receiver BLOCK (top 2.048w) + co-rod lifted
   (top 2.0465w) + pale pintle post tying rod to the wing cover. Priced
   exactly as ordered: the w 2.337/2.447 side cols take ~0.05 over the
   ref's 1.991-2.001 wing band — **turret_side held ≥91 (turret 91.8
   unmoved at gate precision)**, well inside the ≤0.4 allowance. Census
   mg1+ held ✓. close-roof 2×: pale receiver mass + post + rod parse as
   a mounted weapon ✓.
4. **C1b FAN SCREEN READ**: the 4 radial blades DELETED (the wagon-wheel
   signature) → 4 horizontal chord slats per well (dz ±0.075/±0.205,
   tops ≤1.718 inside the r9 +8.5 mm budget) + hinge contrast plates
   (dark-on-pale, top 1.7183). Zero new columns ✓ gate ×2 trivially ✓.
   Done-gate: top view circles read as chorded slat-screen arches ✓.
5. **C2b CABLE VISIBILITY (tone)**: two-point measures FIRST (the
   ordered discipline): deck camo 47-56, pure hullDark top faces 49-57,
   floor-hooked shadow-clone 55 — **top-lit tone is COMPRESSED** (the
   ambient floor + sun): the rehooked path cannot land dark-on-pale, the
   order's anticipated 'tone stalls' branch. Landed: RAW shadow-clone
   (no ambient-floor hook — the D1 two-point's dark end) at 0x1f231a:
   cable minima 32-44 vs deck med 55 (Δ11-23). Tail runs read as dark
   lines at 1×; draped runs show as dark arc segments in the bare
   z −0.12..−0.35 window (the r9 deck-cable law bounds them — crowns
   legal only under the riser tops, so the risers occlude the covered
   spans top-down too; the ref's long unbroken read is priced by that
   banked law). One MORE draped run added inside the certified window
   (x 0.55..0.95). Same certified pts/r elsewhere; non-casting.
6. **E3 UNDER-WING FILL (carried) — ADJUDICATED MEASUREMENT ARTIFACT +
   real fills**: the 0.741 m² "enclosed-void" was REPLICATED off-rig
   (tmp-e3-maskprobe: same heroFor camera, same marching-squares/
   shoelace semantics): it is an **OPEN contour chain that exits the
   1024-mask frame border** (closed=false, bbox to x 1023, virtually-
   closed area 0.755, centroid px (833,440) = the report's (839,442) to
   AA) — the proc tail-rail corner overflows the heroFor frame (the
   proc print is ~0.07 m longer than the ref's; the rails' 2.85 width
   is st0/plan-load-bearing and cannot legally narrow). A probe box
   filling the whole wing-beak gap moved NOTHING (0.741 unchanged) —
   no interior fill can move a border-clip chain. Post-round evaluator:
   0.742 (stable), toptilt 3.528+0.311 = the r9-certified classes
   exactly. REAL fills delivered for the slot the critics see: E3a
   bustle shoulder box (x −0.9975..−1.1875 inside the rails' st3 width
   line, y 2.26..2.60 under the pod's 2.664 side cover, both z-caps
   inside station i3, top under the whip's 2.70 window line) + E3b
   pelmet deepening (y 1.9025..2.0725 in the r9-c pelmet's certified
   x/w footprint, under the A-panel 2.08 side band). Gate ×2 held
   90.7 bit-identical with both in ✓.
7. **D1b LATTICE-WING FRONT READ**: pale grid bars (latticePale canvas)
   4-6 mm proud of the corner pocket cards' front faces, every bar
   INSIDE its own card's x-window (segment-gap law): left stowage plate
   (3 verticals + rail, placed in the x −1.29..−1.44 range the pod wall
   leaves dead-front visible) + rack card (oblique-front carrier) + a
   NEW right-corner card (x 1.286..1.333 — fully under the right rail's
   2.1875 front cover, past the core slab's ±1.28 dead-front occlusion
   edge, inside A4's side band and the rail's plan footprint) with 2
   verticals + rail. Done-gate: view-front 2× shows grid texture at the
   left corner (clean lattice read at 4×+); the right corner reads a
   pale grid post — the full ref-width grid there is PRICED: ref front
   col +1.333 reads 2.138 vs our rail's 2.182 (already +0.044-high);
   no legal room outboard/above. Honest residual below.
8. **F2b SEAM ORGANICS**: the identical E2 seam pair split into 4
   staggered segments (varied lengths 0.74-1.28, gaps, same planes);
   louvre strips varied (1.64/1.72/1.80 lengths, offset centers); +2
   further tint plates via the F1 prepCamo mechanism: turret fore-roof
   step (top +4 mm) and hull mid-deck + fore-shelf pair (tops +4.5 mm,
   z-parked in bare-deck zones clear of risers/humps/furniture). No
   window inversion: D1 panel 77.3 (70..85 ✓); flood digits unchanged.
9. **E1b BOW-SHELF SEAM COURSE**: one MORE engraved course on the upper
   beak face at (±0.72, 1.77, 3.033) — 0.020 wide (≈3 px at 1×, vs the
   r9 0.014 courses) so the rake suggestion survives at 1×; the three
   courses now carry varied lengths 0.50/0.56/0.62 (organics). Priced
   inside the hull −0.1 movement; gate ×2 PASS.

§B standing: §B2 flood ALL TEN VIEWS at the r9-verdict digits exactly
(front 92, rear 101, rearleft/rearright/frontleft/frontright 92, left
119, right 125, top 122, toptilt 94) ✓. §B3 census mg1+4d ✓ (A3b spend
documented above). §B4 carry untouched (clip 98/429 to the digit). §B5
untouched classes (no re-parents; E3a/E3b/D1b-card are turret furniture
in turretG). §B6 untouched (no gear geometry).

LAW DISCOVERIES (bank):
1. **HERO-FRAME BORDER-CLIP VOIDS**: visual-evaluator hero-view "holes"
   include OPEN marching-squares chains cut by the mask frame border,
   virtually closed by shoelace across the cut — a model whose box
   corner overflows heroFor's frame prints a phantom multi-m² void
   (leo2_revolution hero-rr 0.741) that NO interior geometry can move.
   Diagnose: replicate mask + chain (closed flag, bbox at the border);
   probe-box test. Hero-void claims should re-derive with the chain's
   closed flag before ordering geometry.
2. **TOP-LIT TONE COMPRESSION**: on sun-lit top faces the family
   ambient floor compresses EVERYTHING to luma ~47-57 (deck camo, pure
   hullDark, floor-hooked clones all read alike) — dark-on-pale deck
   dressing is only reachable via RAW clones (no ambient-floor hook);
   the D1 raw-clone "crush" (26.5 rear-face) is the FEATURE here, not
   the bug. Two-point on the actual face class before picking the path.
3. **OCCLUSION AUDIT FOR PROUD DRESSING** (the D2b/r9 lesson made
   mechanical): any read-critical fitting near a textured backdrop
   needs a camera-side depth check — cable fronts −3.856 behind slat
   faces −3.877 was invisible despite 35 mm of standoff from the wall
   itself. Check the FRONT surface of the dressing against the FRONT
   surface of everything in its y-band, not against the wall.

Residuals (certified/measured, no new orders):
- hero-rr 0.742 border-clip chain (finding 1) — measurement artifact,
  not a geometry defect; stands until the harness frames per-model
  overflow or the muzzle/rail load-bearing lengths change lanes.
- Right-corner grid read bounded to the 47 mm rail-covered window (ref
  front col +1.333 2.138 vs our 2.182 rail — priced, no legal room).
- Draped-cable read limited to the bare-deck arc windows by the r9
  deck-cable law (crowns must stay under riser tops; risers then
  occlude those spans top-down as well).
- §B4 carry digits identical (clip 98/429); rear 9 px flood hairline;
  toptilt 3.528/0.311 m² certified classes; whip-stub bistability
  convention — all carried unchanged.
- hull 91.5→91.4: the D2b proud plane + E1b third course — priced
  against the mandatory visibility order (whole binder unmoved 90.7).
