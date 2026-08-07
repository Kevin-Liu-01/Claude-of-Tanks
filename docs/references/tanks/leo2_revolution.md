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

## §B4 round r13 (2026-08-04) — SPROCKET-DIP CONTAINMENT: clip front 98 / rear 429 -> **0 / 0** (target was <=60), gate 90.7 HELD ×2 bit-identical

The queued r2-era carry closed. Gate at landing: **min 90.7 PASS ×2
BIT-IDENTICAL** (hull 91.4 / whole 90.7 / turret 91.8 / stations 90.8 /
dims 99.5 / floaters 100 — every component the r12 line to the decimal;
side dAlong 0 / dy 0.002 both runs — the body-span guard held through
every toe-adjacent edit). Hash 9249c794 → **eb04115c** (63→64 meshes =
the per-side gear-trim split; 112169→113033 verts = the beak/box
splits). Frozen siblings verified at the same sitting: leo2a5
**bc9bad30**, leo2a6 **80b76338**, kf51 **3ae9b70c** — all byte-frozen.
standard-check: gateMin 90.7 | clip **0/0 ✓ PASS** | contig 0 ✓ | decor
mg1+4d ✓. Official `track-clip-audit --exact` 0/0 read three times at
the landing bytes (standalone ×2 + standard-check). §B2 flood ALL TEN
VIEWS at the r12 digits exactly (front 92, rear 101, rl/rr/fl/fr 92,
left 119, right 125, **top 122**, toptilt 94). Evaluator FULL digest:
RIG PARITY OK, max yawProxy 0.8° (front / close-front — the r9/r12
line), hero-rr 0.742 border-clip chain unchanged, toptilt 3.528 +
**0.294** (the sprocket-zone void SHRANK from the certified 0.311 —
the rear re-planes reduced the enclosure). npm test 166 checks pass.
Evidence: shots/leopard-r13/ (before/after full views + 1× zone crops
per wrap zone), shots/visual-eval-leo2_revolution/, shots/track-clip.json.

Baseline decode (tools/tmp-leo-r13-census.{html,mjs} — a per-PIECE add()
census in the tmp-b5-t72b3m-pieces pattern: instrumented P records
bucket + leopard.js line + transformed AABB, keeps zone-near geometries,
and crosses each piece's surface voxels against the real band sets with
the audit's exact math). The official 98/429 decomposed EXACTLY:
- front 98 = nose fill L4262 (60 vox: ±1.30 side faces + 0.575 bottom
  crossing the idler wrap/ramp ribbons) + beak slab L4259 (38 vox: the
  full-width slab's planes passing THROUGH the wrap — its top plane
  dives under the arc crown past z≈3.52);
- rear 429 = the merged r9gear olive mesh (294 vox: dip plates
  deliberately bedded in the tucked wrap — the t72b3m "strips must stay
  bedded" class — but merged center-spanning, AABB reach 0, defeating
  the audit's lane-local skip) + undercut wedge L4494 (79 vox: ±1.40
  raked/side faces carrying the whole sprocket upper arc through the
  lane) + tail box L4466 (56 vox: 1.13 bottom + ±1.45 sides crossing
  the wrap tangent/upper arc);
- the per-side idler/sprocket spinner meshes (182/58/47 vox each side)
  are in-lane gear the reach rule already skips — by design, not debt.

Fixes (hull re-planes + the t72b3m per-side recipe; certified
idler/ramp geometry and §B6 trapezoid untouched — zero gear params
moved):
1. BEAK split (a5/a6 diving-mudguard class): CENTER slab at ±1.044
   keeps the FULL certified profile (side rows unchanged by projection;
   toe band 0.90..0.965 intact = dAlong guard); per-side mudguard
   PLANKS (x to ±1.42 taper, z 2.83..3.32) carry the bow-corner mass
   with undersides re-planed to 1.385@3.32 — clear of the SHOE
   ENVELOPE, not just the ribbon (pads ride centerline +0.13: crown
   ~1.385, far edge ~3.765 vs ribbon 1.309/3.677; past z≈3.36 no legal
   plane exists over the crown, so the plank ENDS and the wrap crests
   into the open like the real fender line); per-side TOE CAPS
   (z 3.785..3.85 = the slab's own slice) keep the ±1.05..1.30 plan
   columns' 3.83-3.85 nose IN FRONT of the pad far edge; per-side
   corner TONGUES (x to 1.056, z 3.694..3.795, beak planes inset 2 mm)
   close the toe-cap/pad/slab plan slot — past the ribbon far edge the
   band has no voxels, so they share none.
2. NOSE FILL narrowed 2.60 → 2.00 (interior mass; tub owns the
   ±1.02..1.20 front bottoms at 0.36).
3. TAIL BOX split: center 2.00 wide keeps the certified (z,y) profile
   (bottom 1.13, top 1.71); outboard shoulders x 1.00..1.45 keep the
   station/plan footprint with bottoms 1.42, clear of the sprocket pad
   crown 1.395 (return-run pads are covered/hidden z ≥ −3.41, so the
   tangent zone needs only ribbon clearance).
4. UNDERCUT WEDGE narrowed ±1.40 → ±1.00: side rows identical by
   projection; the rear undercut corridor now shows wrap + dip plates
   (the real over-track config) instead of camo wedge — the close-rear
   containment read.
5. r9gear → r9gearL/r9gearR (t72b3m hullTrackTrimL/R recipe, e3918e6
   class): the dip plates + band-edge strips stay at BYTE-IDENTICAL
   transforms and the same gearOlv instance (+1 draw call, meshes named
   leoGearTrimL/R); each merged mesh keeps an honest one-sided AABB
   (reach 1.27 L / 0.972 R > laneInnerX−0.15 = 0.903) and the audit
   classifies them as the in-lane gear trim they are. The B1 tone cert
   (band strip p5 51.4) rides the same material instance unchanged.

Close-view floors (mission order 2, self-read): close-front 1× — the
camo beak no longer dips into the shoe band; pads wrap the idler with
the plank step above them (before/after crop-idler-close-front). Rear
quarter 1× — the undercut shows the track corridor + center wedge
instead of a camo solid crossed by shoes (crop-sprocket-hero-rearright).
Side profile byte-stable (crop-*-view-left pairs) — the certified
silhouette carried the round. The r12 self-read's close-front cap on
this class is released for the round-3 critic to re-price.

LAW DISCOVERIES (bank):
1. **THE SHOE ENVELOPE IS THE VISUAL CONTAINMENT SURFACE**: the audit
   voxels the band RIBBON (outer r = wheel r + 0.045 + trackTh/2), but
   the SHOES ride +0.13 above the centerline (pad far edge 3.765 vs
   ribbon 3.677 on the idler) — §B4 re-planes that clear only the
   ribbon still read as clipping at close view. Plan hull faces against
   the PAD arc (+0.02), not the ribbon. Corollary: coveredTop hides
   return-run pads (z −3.41..3.366 here), so tangent-zone clearances
   only need the ribbon.
2. **PLAN-SLOT AT THE RIBBON FAR EDGE**: past the band's far edge the
   audit has no voxels — hull fillers there are containment-free even
   inside the lane x-window (the corner tongue at x 1.056 vs pads
   1.0595). The top-view flood is the instrument that prices these
   slots (two 10 px sky holes at x ±1.05, z 3.69..3.79 appeared when
   the beak narrowed; closed by the 1.044 widen + tongues at the r12
   digit 122 exactly).
3. **PER-SIDE SPLIT PRICES ZERO**: partitioning a manual mergeAll
   accumulator per side (same material instance, same piece transforms)
   is render-neutral to the gate (90.7 ×2 bit-identical) and to every
   flood digit — the t72b3m BUCKET_DEF recipe works identically for
   finish-block meshUp meshes; the audit only needs the honest AABB.
4. **STASH-ROUNDTRIP A/B**: `git stash push -- <file>` + official rig +
   `git stash pop` is a clean before-state reconstruction when a
   baseline render was overwritten (used for view-top-before and the
   §B5 A/B; verify the diffstat returns after pop).

Residuals (certified/measured):
- FRONT −1.010 COLUMN (the r7 carry's second symptom): err 0.131
  front_whole / 0.133 front_hull, THE DOCUMENTED DIGITS, dAlong 0 —
  adjudicated THIS round as a SHOE-SYSTEM read, not hull containment:
  the kit shoes' inner pin caps (trackShoeGeometries cylX at
  ±trackW·0.49, reaching x 1.028) print a 0.091 bottom on the tucked
  wrap where the ref band tucks bare (refBot 0.341). With hull-vs-band
  interpenetration at 0/0, moving it means kit shoe surgery
  (fleet-frozen; §B4.2 requires the two-layer pin detail) or a
  per-tank cap-suppression opt-in — beyond this round's brief; priced
  inside the passing 90.7 since r7 at the same digits.
- §B5 stranded reads 6 (deck-furniture + whole-bucket AABB classes):
  byte-identical A/B — HEAD bytes read the SAME 6 on today's audit, so
  the r12 note's "3" is instrument drift, not a regression; nothing in
  this round re-parented (gear trims y ≤1.49, below the clamped
  envelope floor).
- hero-rr 0.742 border-clip chain / whip-stub bistability / muzzle tip
  cover 0.56-class / st11/12 wPct / pod-line carries — all r12
  residuals carried unchanged (gate row equality ×2 is the proof).

## §B1 round r14 (2026-08-05) — BOW-WEDGE + CHEEK-RAKE RE-PLANE (owner ruling A on the round-3 verdict): the four ledger-parked geometry classes re-planed INSIDE the gate, min 90.7 -> **90.8 PASS ×2 bit-identical**

Gate at landing: **min 90.8 PASS ×2 BIT-IDENTICAL** (hull 91.2 / whole
**90.8** / turret **92.2** / stations **91.4** / dims 99.5 / floaters 100 —
the whole binder itself moved UP through a geometry re-plane round; turret
+0.4, stations +0.6, hull −0.2 = the priced hem/closure trade). Side
dAlong **0** on every row after every batch — the r5 body-span law held
through the entire bow program (toe y-band byte-identical throughout).
Hash eb04115c → **3820620** (64→79 meshes, 113033→110833 verts — the
stair boxes died into facet slabs; hub dots + fixtures added). Frozen
siblings verified at the same sitting: leo2a5 **bc9bad30**, leo2a6
**80b76338**, kf51 **3ae9b70c**. Evaluator: **RIG PARITY OK** (max
yawProxy 0.8° @front — the r13 line). standard-check: gateMin 90.8 |
clip **0/0 ✓** | contig 0 ✓ | decor mg1+4d ✓. track-clip --exact 0/0
re-read after every §B4-adjacent batch (plank widen, toe sweep, hem,
under-tub filler). npm test at the section's landing. Evidence:
shots/leopard-r14/ (r13 renders under before/, landing renders + 
crop-close-front / crop-view-frontleft before/after pairs),
shots/visual-eval-leo2_revolution/, shots/critic-leo2_revolution/.
Measures: tools/tmp-rev-critic-r9-measure.py (the standing §D mask).

Orders → deliveries (evaluator official digits, before → after):
1. **A-1 BOW WEDGE (the NO-STAIRCASES kill)**: the stepped-strata read is
   re-planed into the ref's continuous rakes at every mechanism the r13
   verdict named:
   - the 1.04-wide camo CREST that floated 0.10-0.19 over the beak plane
     (the "stacked horizontal course" read) → narrow clamp front A-LEG
     (hullDetail, x 0.20..0.50 on the clamp-rod line, rooted through the
     plate; side cols 3.42/3.47 keep the 2.02 top = ref 2.028 line);
   - jacket nose taper end: 0.94-tall vertical cliff at 3.485 → 14°-raked
     face (top corner 3.485→3.25);
   - jacket nose BULGE end (the last outermost vertical at the corner,
     the frontleft Δ+14.2/75.5°-pair's true owner): raked to 25.8°
     (top 3.585→3.44; plan cols keep the 3.585 bottom edge);
   - skirt/lip bottom STAIRCASES (5 equal-pitch boxes per stack) → the
     real diagonal hem cut: three co-planar facets through the ref's own
     bin values (A 0.446@3.2585→0.499@3.3665, B1 →0.777@3.5885, B2
     →0.870@3.6995; per-column errs ≤ the old park's, col 3.32's 0.041
     undercut KILLED) + hem NOSE cut whose top edge meets the beak plane
     at the corner (1.30@3.5885→1.114@3.6995 — co-planar meet, §B1);
     tip nubs kept (plan 3.766 / body-span cap 1.02) with 10-14° raked
     front faces;
   - mudguard planks widened to the jacket inner line (outer 1.42-taper
     → 1.63 straight, same plane, same 1.385 §B4 underside — audit 0/0)
     — the wedge now spans the full inter-jacket width;
   - BOW CROWN: the ref's own front_hull line FALLS outboard (2.104@
     1.333 → 2.047@1.513 — its corners chamfer to the fender line) where
     our flat tops printed +0.02..0.03 on five columns per side — hump/
     shelf/tail outboard chamfer facets (k 0.155 humps / 0.10 shelf+tail,
     |x| ≥ 1.26; center plates flat = side rows + dAlong bins untouched)
     + plank top outboard tilt. front_hull cols now ON the ref line.
   DONE-GATE: the bow-shelf pair (ref 163.6°) **176.9 → 169.2 (Δ+13.3 →
   Δ+5.7 ±0.5)**; the nose-corner vertical pair (ref 75.5°) **89.7 →
   OFF the flag list** (bulge/taper rakes); close-front worst **Δ−14.4 →
   Δ−10.5** and the −10.5 is the parked RWS/pod-zone class, NOT the bow;
   close-front/frontleft at 1× show ONE dominant raked wedge + clamp
   fixture + diagonal hem (crop pairs in shots/leopard-r14/).
2. **A-2 CHEEK RAKE**: the r7 packet's ref cheek line falls ACROSS x
   (inward-leaning facets) — delivered as outboard-down facet tilts +
   face rakes with side rows pinned by the inboard maxima: wing top
   (−0.075 outboard) + tilted dark cover + NOSE LIP restoring the ref's
   own 1.97 side cols at 3.42/3.53 (proc 1.942 → 1.97 EXACT, ×2 cols);
   left cheek top (−0.12 outboard = the probe's 20.6° lean); right wall
   fore-front face raked 15° (top edge 2.04→1.976 plan-safe); notch step
   top 0.56→0.44 (was a lone 2.16w pillar) + 15° face; fore-roof steps
   1-2 + edge seam → ONE raked plane 2.22w@1.15 → 2.124w@1.82 (ref cols
   2.22/2.192/2.164/2.137 — net err −0.05 vs the steps), step 3 kept as
   the MANTLET CROWN (ref 2.164@1.87..2.09) with the roof's own x-facet;
   LEFT core top-front 0.605→0.51 (the notch-side roof line 2.4°→7.1°).
   WING X-EDGE 1.60→1.553: plan_turret col 1.623's **0.773 err KILLED**
   (the #1 plan_turret defect — ref wing ends at its 1.512 col; the wall
   2.04 face owns 1.623 at ref 2.035) — turret 91.8 → **92.2**, stations
   90.8 → **91.4**. DONE-GATE: front view worst flag now **Δ−2.7°**;
   close-roof upper-front pair matched at −8.7 (was UNMATCHED at r13).
3. **A-3 PLAN TOE Δ−10.5 — DELIVERED FREE**: toe caps plan-swept at the
   ref's own 10.4° taper (top edge m 0.184, x→1.34, z0 3.785 §B4-pinned;
   y-profile byte-identical = dAlong bins untouched). The top-view toe
   pair (ref 10.5° @x 0.98..1.60) is **GONE from the flag list**; plan
   cols 1.29/1.401 moved onto the ref line (3.811 exact / err 0.033→
   ~0.013). The r13 tension note is MOOT: the toe step never had to die
   as a step — the sweep re-planed it inside the law.
4. **P-1 WHEEL-ROW READ (left/right window)**: rear-course skirt bottoms
   0.36→0.53 (row-free: side bottoms are gear-owned, front reads the
   unchanged FRONT course, stations don't measure bottoms) opening the
   ref's visible wheel band; 7 pale hub-dot discs per side on the wheel
   faces (mgPale family, r 0.10 × 4 mm, x ±1.386 — inside the wheel
   circle and the skirt plane: zero silhouette in every row); under-tub
   dark filler (y 0.31..0.36) closes the through-slit the raise exposed.
   DONE-GATE: **B1 strip certs to the digit** — left med 56.6 p5 **51.4**
   (r13: 56.4/51.4; gates p5 ≥40 med 48..58), right med **51.1** p5 45.0
   (r13: 51.1/44.3) ✓✓; the hub-dot row reads in the opened band at 1×.
5. **P-2 MAG TOP COVER**: raw-clone pale plate (0x8a8d74, no ambient
   floor hook — the C2b top-lit compression law's bright branch) at the
   receiver's exact top (2.048w, same footprint — zero mask movement);
   pintle post re-rooted through the tilted wing cover (top 2.0355w
   unchanged). Reads as the stowed gun's cover from the close-roof
   camera.

§B standing: **§B2 flood** — front 92 / rear **99** / rl 92 / rr 92 /
fl 92 / fr 92 / left **120** / right **126** / top **110** / toptilt 95
vs the r13 digits 92/101/92×4/119/125/122/94: rear −2 and top −12
BETTER, left/right/toptilt +1 px (single-pixel AA jitter on the
certified residual classes; same bboxes). Mid-round the wing pull +
taper rake exposed two corridor classes (top +171: the deck-edge↔skirt
slot the wing had shadowed; left/right +80/+59: the tube↔beak clamp
slot) — closed the ref's way: corridor roof strips at 1.945 (2.6 cm
under the shelf chamfer corner so the crown line keeps the oblique
silhouette) and the clamp support WEB (the real vehicle's cradle
gusset, fixture-dark, interior to every row). **§B3** mg1+4d ✓ (MAG
plate + hub dots are tone-lane). **§B4 0/0** ✓ ×3 re-reads. **§B5**
stranded 6 / abutting 0 / dangling 0 — the r13 adjudicated classes
exactly (hub dots hull-parented by design; wing/cheek/lip content
turretG). **§B6** untouched (zero gear params moved).

Tone certs re-derived at the landing bytes: D1 tail panel med **77.3**
sd **12.31** (the r12/r13 digits EXACTLY); F1 jacket med **67.4** vs
ref same-rect 67.4 (**Δ0.0** — was Δ+0.6); B1 strips above.

LAW DISCOVERIES (bank):
1. **RE-PLANES MOVE FLOOD SHADOWS**: a rake/pull that removes mass
   REVEALS whatever slot it used to shadow — the taper-end rake exposed
   the tube↔beak clamp slot (79 px) and the wing pull exposed the
   deck↔skirt corridor (2×~90 px) with ZERO silhouette-row movement.
   §B2 flood re-runs after every visibility-changing batch, not only
   after adding geometry; close the slot the way the REAL vehicle does
   (clamp web, deck reach) rather than re-flattening the re-plane.
2. **CLOSURE STRIPS MUST SIT UNDER THE CROWN LINE**: the first corridor
   roof at 1.97 became the oblique silhouette corner and RE-FLATTENED
   the just-delivered crown read (Δ+5.7 bounced to +11.1) — any filler
   near a chamfered corner rides ≥2 cm under the chamfer's outer edge
   or it owns the silhouette.
3. **FACETED HEM ≈ COLUMN LEDGER**: a 3-facet diagonal through the
   bin-START values reproduces a certified per-column stair park within
   ±0.03 per column (net err −0.045 here) — NO-STAIRCASES re-planes of
   bottom stairs are near-free when authored against column starts, not
   centers (the gate reads min-in-column at the column's leading edge).
4. **INWARD-LEANING FACETS ARE SIDE-ROW-FREE**: outboard-down top tilts
   (wing −0.075, cheek −0.12, crown −0.045) never move side rows (max
   over x = the inboard edge) or plan/front rows (footprint + taller
   cover) — the whole "cheek verticality" class was deliverable at zero
   gate spend; only FLOATING consumers (the MAG pintle) need re-rooting.
5. **REF RENDER vs REF COLUMNS at mass breaks**: the ref's rendered
   fore-roof line falls 13.7° THROUGH a zone its own columns read flat
   (2.164@1.87..2.09) — the fall is x-tilt mixing plus the cheek-band
   drop behind the mantlet; column-pinned flats at a mass break can
   read as Δ−8..−11 pairs that no column-legal z-slope can close
   (matching drift, not a defect — price it, don't chase it).

Residuals (certified/measured, self-read):
- frontleft worst **Δ+9.2** (hem oblique: our 3-facet cut reads
  45-54° vs the ref's rendered 38.9-50.2° — its mudflap curtain hangs
  below our hem line; matched smooth-vs-smooth, staircase dead);
  rearleft twin Δ+12.5.
- fore-roof pair: close-roof **Δ−6.9 = the r13 digit exactly**;
  frontright −11.4 (law-5 matching drift at the mantlet break — the
  crown is column-pinned flat at ref 2.164).
- hero-fl Δ+15.0 @(1.47, 0.23, 2.99) — the track APPROACH-RAMP angle
  (ref 19.4° vs kit-tangent 34.4°): §B6 kit geometry, idler position
  dims-guarded since r7 — outside this file's lane, priced since r7.
- top Δ+14.4 ±4.0 — wrap-outline vs ref skirt-shadow projection pair
  at the §B4 open-wrap corner (x 1.55..1.57), gear-projection class.
- close-front Δ−10.5/−13.6 — the parked RWS/pod-zone class (r13 digit)
  and the toe-face lean (dAlong-pinned band, 0.24 len).
- toptilt flood 95 = 94 + one frame-corner px (y470 x633 border pair);
  left 120 / right 126 = the r13 119/125 residual classes ±1 px.
- hero-rr 0.742 border-clip chain / whip-stub bistability / muzzle
  cover 0.56 / st11-12 wPct / pod-line carries — unchanged (gate row
  equality ×2).

## §B6 round r15 (2026-08-05) — R5-1 APPROACH-RAMP FLATTEN (the r14 floor holder, the LAST order): hero-fl low pair Δ+13.2 -> **Δ+3.3 ±0.2 INSIDE ±5°**, gate 90.7 PASS ×2 bit-identical

Gate at landing: **min 90.7 PASS ×2 BIT-IDENTICAL** (hull 90.8 / whole
90.7 / turret 92.1 / stations 91.4 / dims 99.5 / floaters 100 — cmp-clean
between runs; hull −0.4 / whole −0.1 vs r14 = the priced ramp-window
trade, every component ≥90). Side dAlong **0** both rows after every
step (the toe-band/body-span law held; try-1 without the trim plank
crashed side_hull to 89.6 and was measured, diagnosed and repaired
before landing). Hash 3820620 → **7175fbf0** (79 meshes UNCHANGED —
the planks merged into leoGearTrimL/R; verts 110833 → 110905 = +72 =
exactly two 36-vert slabs). Graduates frozen at the same sitting, both
bookends: leo2a5 **bc9bad30**, leo2a6 **80b76338**, kf51 **3ae9b70c**
(the leoGear contactZF/contactZR pass-through defaults are undefined →
byte-identical, proven by the held hashes). Siblings recorded: leo2a7v
e28fc316, leopard2_proto 5647ef3e. Evaluator full run: exit 0, parity
max yawProxy 1.2° @close-front (was 0.8 @front — the front-low mask
moved; <10 gate, no RIG MISMATCH). standard-check: gateMin 90.7 | clip
0/0 ✓ | contig 0 ✓ | decor mg1+4d ✓. track-clip --exact **0/0 ×2**.
npm test green (166 checks + track-geometry). Evidence:
shots/leopard-r15/ (r15-herofl-gear-before-after.png board, pocket
crops, evidence pairs), shots/uk-b6/leo2_revolution-side-*-r15{before,
try1,after}.*, shots/visual-eval-leo2_revolution/, fresh critic pairs at
shots/critic-leo2_revolution/. Measures: tmp-uk-b6-sideprobe/rampcalc
(side ortho), tmp-r15-boxprobe + offline hero-projection solver
(validated against both instrument reads before use), visual-evaluator
FULL digest (the done-gate instrument), tmp-rev-critic-r9-measure.

Order → delivery (official digits, before → after):
1. **R5-1 APPROACH-RAMP FLATTEN — DONE-GATE MET**: hero-fl low-zone
   matched pair **proc 35.2° vs ref 22.1° (Δ+13.2 ±0.5) → proc 22.7° vs
   ref 19.4° (Δ+3.3 ±0.2), len 0.92 m** — INSIDE the ±5° gate with the
   ref angle at the r14 packet's own 19.4 digit. Fresh ref measurement
   first (r15before side probe): ref low-zone ramp **29.8–31.2°** side-
   ortho (chord z 2.54→3.12, lifting at z≈2.54 from ground), steepening
   to 36° at its wrap; kit tangent measured 41.4° analytic / 38.7–40.2
   mask chord. Mechanism, TWO coupled pieces (both this file):
   - **contactZF 2.5975(default) → 2.22** on the revolution's leoGear
     call (opt-in pass-through added to leoGear; §B6 kit machinery at
     tankFactory ~869, m1a2 contact-pin precedent): front tangent
     41.4° → **32.3°** side (T (3.569,0.914) → (3.544,0.895)), idler
     CENTER untouched (dims-guard held, dims 99.5 exact). Kills the
     steep serrated rise under the beak (the r14 "34.4° short rise vs
     the band shadows the hubs" read).
   - **FRONT RAMP TRIM PLANK per side** (the r13 §B4 dip-plate class at
     the front, same r9gearL/R buckets → leoGearTrimL/R, same gearOlv
     instance, +1 slab each): the flattened tangent lives BEHIND the
     0.36 skirt window (measured: the visible tangent run collapses to
     ≤4–7 cm for any cF ≤2.35 — wheel-1 arc below, skirt bottom above —
     so contactZF ALONE cannot register a low edge; try-1 digest proved
     it: ref lower 22.1° UNMATCHED). The plank paints the ref's visible
     ramp line the band cannot own: raked bottom **0.176@z2.74 →
     0.446@z3.2585 (27.5°)**, co-linear with hem facet A's 26.1° — the
     arch-to-beak lower silhouette reads as ONE shallow diagonal (§B1
     no-staircases, co-planar joint at the hem corner); x 1.46..1.54
     bedded inside the pad envelope end-to-end (top 0.50→0.62), wheels
     end 1.386, courses 1.61+ own y≥0.36 outboard; plan-interior
     (z≤3.2585 « 3.765), front bottoms stay band-owned, station width
     skirt-owned, ≤0.48 m end-cap law (0.4785).
   Side-ortho whole-rise after: proc 35.2° vs ref 36.3° (Δ−1.1), hull
   rows 33.3 vs 33.7 (Δ−0.4); proc ground-run end lands within 2 cols
   of the ref's (was 0.19 m long). Gate side_hull worst columns after:
   the z 2.85/2.96/3.07 window reads +0.033..+0.038 (was +0.06..+0.12
   at try-1; r14 carried −0.05..0 there with the WRONG angle read).
2. **R5-2 (wheel-rim contrast) — SKIPPED, measured**: R5-1 landed, and
   the B1 left strip med moved 56.6 → 56.9 (the plank's in-rect pixels)
   leaving **1.1 luma** headroom to the 58.0 ceiling — the +1 notch
   would spend headroom the gates need. The order marked it "not
   required if R5-1 lands".

§B standing at the landing bytes:
- **§B1 strips**: left med **56.9** p5 **51.4** (gates med 48..58, p5
  ≥40; r14 56.6/51.4), right med **51.7** p5 **45.3** (r14 51.1/45.0).
- **§B2 flood, ALL TEN at the r14 digits to the pixel**: front 92 /
  rear 99 / rl 92 / rr 92 / fl 92 / fr 92 / left **120** / right
  **126** / top **110** / toptilt **94** (r14 read 95 = 94 + one
  frame-corner AA px — this run prints the bare 94, same class).
- **§B3**: census mg1+4d unchanged.
- **§B4**: 0/0 --exact ×2 + standard-check (the wrap arc end moved
  138.6°→147.7° with the tangent — audited clean; the plank rides the
  r13 in-lane gear-trim classification, x-reach unchanged 1.27/0.972).
- **§B5**: floaters 100 ×2 in the gate row (plank bedded in the pad
  envelope, merged into the existing hull-parented trim meshes).
- **§B6**: trapezoid lawful both ends — ground run 2.22..−2.1775 stays
  the short base, both end wheels raised with tangent ramps; the ANGLE
  moved into the ref's class, the shape class did not. Rear untouched
  (contactZR default; ref rear 35.1° vs proc rear tangent 34.6°).
- **Tone**: D1 tail med **77.3** sd **12.31** (the r12–r14 digits
  EXACTLY); F1 jacket proc med **67.4** vs ref 67.4 **Δ0.0**.

Evaluator full-digest per-view worst flags — every one an r14-certified
class at its digit: front −2.5 (r14 −2.7), frontleft +9.1 (hem oblique
+9.2 class, now BETTER), left +12.8 (EXACT r14 digit), rearleft −10.6,
rear −9.8, rearright −10.4, right −9.2, frontright −11.2 (law-5 drift
−11.4 class), top +14.5 ±4 (wrap-outline projection), hero-fl **+10.9**
(jacket-corner class — THE RAMP IS OFF THE FLAG BOARD), hero-rr −7.1,
toptilt +13.8 ±4 (wing-pull class), close-front −10.5 (EXACT parked
RWS/pod digit), close-roof −9.2 (EXACT). Voids: top 0.002, hero-rr
0.739 (border-clip chain), toptilt 3.386 + 0.294 — certified digits.

LAW DISCOVERIES (bank):
1. **CONTACT-PIN VISIBILITY BOUND**: flattening a §B6 tangent by moving
   contactZF rearward pivots the ramp about the (frozen) idler tangent
   point — the line RISES off the ground exactly where it flattens. On
   a skirted rig the visible window (ground .. skirt bottom) empties:
   for this tank every cF ≤2.35 leaves ≤7 cm of registered edge. A
   contact-pin flatten on a skirted tank is only HALF the order — the
   visible line must be re-owned (dip-plate-class trim) or the idler
   must drop (dims lane). Measure the visible-window corridor BEFORE
   picking the pin.
2. **PROJECTED-ANGLE SOLVER**: hero-view angle deltas can be solved
   offline (per-model heroFor cameras from the critic's visibleBox +
   NDC line projection) and validated against two instrument reads
   before touching geometry — the r15 solver predicted the try-1 hidden
   state and the final pair inside ~1–2°. Projection is strongly
   window-dependent (~26° 3D reads 22° at z 2.5–3.1 but 14° at
   z 2.8–3.3): compare pairs only in their shared zone, and target the
   REF'S 3D SLOPE, not its projected digit.
3. **TRIM STRIPS PAIR WITH KIT PINS**: the r13 "paint the ref bottoms
   the band cannot own" class extends to RAMP LINES: one raked-bottom
   in-lane strip, co-linear with an existing hem facet, lands a 0.92 m
   matched edge, −1.6 gate pts of try-1 damage repaired, zero flood
   movement on the ten §B2 views, B1 strips inside gates — for +72
   verts and no new meshes.

Residuals (certified/measured, self-read; every owner named):
- ref r2.43 span-97° wheel/ramp ARC still unmatched + two shorter ref
  lower sub-chords (22.4°/0.47, 15.5°/0.67) — our rig is a straight
  tangent + straight trim line; the arc-blend is print identity
  (RE-CERTIFIED per the r14 disposition's "or the residual
  re-certifies" clause; the main chord now matches at Δ+3.3).
- hero-fl lower secondary pair 48.7 vs 43.1 (Δ+5.6 ±0.8) — the hem
  oblique B1-zone family (certified at +9.2/+12.5 since r13; REDUCED).
- close-roof +1 enclosed pocket 28 px / evaluator 0.003 m² (arch/hem
  corridor the flatten opened, y519..527 x133..138) — the ref's OWN
  close-roof carries SIX pockets totaling 289 px of the same gear-slot
  class; §B2 ten-view gate untouched (digits above). Declared carry.
- upper-rear 9.3-vs-21.3 (Δ−12 ±4, 0.26 m) matcher-assignment artifact:
  appears only when the front-low structure changed (absent r15before,
  present try-1 and landing with the deck geometry byte-identical) —
  short-segment corner-bias tier, rear-deck code untouched this round.
- close-front parity yawProxy 1.2° (registration proxy moved with the
  front-low mask; gate <10).
- All r14 carries otherwise unchanged: jacket-corner +10.9/+10.1/+9.8
  trio, upper-rear −8.7, law-5 fore-roof drifts, RWS/pod −10.5,
  no-evacuator, plan width 2.00 dims-sovereign, whip-stub bistability,
  muzzle cover 0.56, border-clip 0.739 chain, B1 rim-contrast tone cap
  (R5-2 headroom now 1.1 luma, documented above).

STOP-state: R5-1 delivered to the done-gate digit (Δ+3.3 inside ±5) with
all gates held ×2 — hero-fl self-reads ≥9.0 on the r14 calibration (the
low band no longer dominates; every residual named with a certified
owner). The tank is READY FOR THE GRADUATION CRITIC per the r14
disposition (13 views at 9.0 + the floor holder killed).

## GRADUATION FREEZE (2026-08-05) — the program's 22nd graduate
Dual gate: geometry 90.7 PASS x2 bit-identical (717f9c8: hull 90.8 /
whole 90.7 / turret 92.1 / stations 91.4 / dims 99.5 / floaters 100) +
graduation critic PASS all fourteen views at 9.0 (ladder 6.6 -> 7.7 ->
8.1 -> 8.8 -> 9.0 across nine builder rounds + five adjudications,
incl. the batch-37 RWS band-flatten warp, the §B4 sprocket kill, the
NO-STAIRCASES bow re-plane, and the R5 ramp flatten). HASH FROZEN:
**7175fbf0** (79 meshes / 110905 verts) — any change is a
graduate-change per §10. Registration state: already retired + mirrored
+ procedural icons at the FLEET FLIP (c487188); userdrops5 SOURCED_IDS
already excludes it; variants backfill clean. The recovered print stays
the measurement oracle via the three maps.

## §B5 DE-FUSION round r16 (2026-08-05, leopard builder) — owner report
## "the leopard 2 revolutions turret appears to have been fused with its
## hull": ROOT CAUSE MEASURED (a certified-instrument defect, the
## chassis_vlo whole-vehicle LOD bake), COUPLED ORACLE-REPAIR + PROC
## RE-LAY STAGED in one landing package (sim-gate min 88.9 x2 bit-stable,
## whole/turret/stations/dims/floaters all >=90); graduate-change per §10 —
## official re-gate/re-cert blocked on the orchestrator repair (§E lane)

ROOT CAUSE (instrument-proven, shots/leo-defuse/):
- The print carries `chassis_vlo` — a 27k-vert whole-vehicle LOD shell in
  the HULL node that BAKES the turret-at-rest (plus clamp/shelf towers) into
  every hull mask. Diff of the ref hull mask with the committed bytes vs a
  copy with the vlo's mesh reference removed: **128 side columns z
  -2.85..+3.50 read 1.74-2.34 committed -> 1.28-1.70 honest**; the ref
  WHOLE mask moves on 25 columns (rear corner-post zone 2.31-2.34 -> the
  real 1.70-2.27 bustle line at z -2.45..-2.85; bow clamp/shelf 1.97-2.04
  -> the gun's 1.92 line at z +2.55..+3.40).
- The print's TRUE split: hi-res `chassis` tops at 1.28-1.73 through the
  whole turret zone (flat deck 1.619 z -0.32..+1.32; only the tail mast
  stack 2.17-2.47 at z -3.7..-3.8 stands above 1.73). EVERYTHING else the
  eye reads as superstructure belongs to the ROTATING `^Turret$`/TurretMesh
  (x -1.76..1.73, y 1.648..2.716, z -2.81..+2.90) + `Gun` (which carries
  the right wing band, x to +1.64).
- The r2-r15 proc mirrored the bake into rig_hull: deck plate 2.06 +
  underfill, fore shelf 1.99, bow humps/crowns 2.02-2.19, mid-deck riser
  stair 2.13-2.22, engine course 2.21, corner posts 2.33 + bridge, fender
  strips 2.03, clamp tower 2.02-2.06 — turret-mass lookalikes that never
  yawed. That IS the owner's "fused" read: the visually-read turret barely
  existed as a rotating mass.
- NO followers regex can fix it (the m1a2 path does not apply): the
  pollution is ONE baked mesh merged into kitMerged_hull_0 at swap time,
  not mis-split follower nodes. The map-side patch is an ORACLE REPAIR.

EVIDENCE RIG (diagnosis lane; no shared file, no committed byte touched):
- tools/tmp-leo-defuse-census.{html,mjs} — official-audit replication +
  per-add census (78 hull pieces overlapped the casting box pre-flip) +
  ref node census + side/plan mask column traces, ref loaded through the
  SAME modelLoader swap the gate uses; --glb= loads a repaired copy.
- tools/tmp-leo-defuse-mkglb.mjs — builds shots/leo-defuse/
  leo2_revolution.novlo.glb (chassis_vlo mesh ref removed).
- tools/tmp-leo-defuse-gate.mjs — the UNMODIFIED procedural-fidelity.html
  math with the ref GLB swapped via puppeteer request interception: the
  simulated coupled gate. Rig parity proven: committed bytes x staged-HEAD
  tree reproduced the graduation line **min 90.7 (90.8/90.7/92.1/91.4/
  99.5/100) to the decimal**.
- tools/tmp-leo-defuse-refprobe/refbands.mjs — offline GLB node/vertex
  censuses (loader normalization replicated: scale 0.904456).

COUPLING PROOF (the m1a2 §B5-r2 mid-state class, on the official math):
- novlo bytes x r15-HEAD tree (repair alone, proc unchanged): **min 0**
  (hull 0 / whole 0 / turret 0 / stations 87.6 / dims 99.5 / floaters 100)
  — hull-anchored registration collapses; both sides of the instrument
  MUST move in one landing. shots/leo-defuse/gate-sim-midstate.json.

ORACLE-REPAIR PLAN (orchestrator lane — §E: builders report, never run):
- leo2_revolution.glb: remove the `chassis_vlo` node's MESH reference
  (node keeps its transform; tools/tmp-leo-defuse-mkglb.mjs is the exact
  literal — my sims ran those bytes). REPAIRS['leo2_revolution'] EXISTS
  (batch-37 band-flatten): EXTEND the chain, never flat-assign; fresh .bak
  from HEAD bytes (archive *.pre-batchNN-history); census guard 28 nodes /
  26 meshes; byte-idempotent x2; gate-in-loop vs THIS staged tree.
- Normalization invariants proven: loader ground comes from the track
  meshes (y=0), length/width from chassis (z ±3.866, x ±2.0) — the frame
  does not move when the vlo dies. The gun's 3-vert bore-line vlo
  (vehicle#gun_tube_vlo) is NOT touched (it is the ref tube mask line).
- Game side: leo2_revolution is FLIP-RETIRED (procedural ships everywhere)
  — the print is measurement-only via the three maps; zero game-render
  consequence.
- Alternative (NOT preferred): per-id maskHide cfg in the three override
  maps + baseVisible exclusion — touches three instruments' code for what
  one data repair fixes permanently.

PROC RE-LAY (this file, STAGED in the working tree — the coupled half):
1. TRUE DECK: the bake deck replaced by an 11-band deckBand stack at the
   chassis lines (novlo 0.05-grid): 1.619 flat z -0.32..1.32, 1.542 ring
   dip, 1.585/1.600 aft, 1.655/1.672 risers, 1.694/1.701 engine-tail
   flats, 1.540/1.500/1.440 bow bands + 1.588 periscope hump + 1.566
   hatch plates; bottoms 1.30 (tub overlap = side-through solid).
2. BAKE-MIRRORS DELETED: humps + r14 crown chamfers + hump seam, riser
   stair, engine course + cap, corner posts + steps + caps, bridge, 2.03
   fender strips, r14-e corridor roof strips, hump shoulder strips, clamp
   rod/web/A-leg, old shelf/E2 seams. The r14 A-1 clamp-leg/crest visual
   is superseded by the honest config: low hull pedestal (top 1.40 = the
   print's own 1.400-1.404 cols) + the r7 clamp JAW on the gun node.
3. BOW RE-PLANE: beak upper plane 1.97@2.83 -> 1.44@2.83 (toe band
   0.90..0.965@3.83/3.85 BYTE-IDENTICAL — the dAlong body-span guard held:
   side dAlong 0 / dy -0.004 in every sim run); mudguard planks split A/B
   with tops on the ref's falling 1.435->1.31 fender line, ENDING at
   z 3.20 — the idler wrap crests into the open past it exactly like the
   print (its own 1.28-1.385 crown line IS the ref's 1.29-1.32 read
   there); §B4 undersides re-derived, min clearance +0.041 over the shoe
   envelope at the 3.20 end (>= the 0.02 law margin).
4. JACKET HONESTY: rear course tops per segment 1.696/1.689/1.662/1.590/
   1.573/1.532/1.614 (segRunXT — the flat 1.70 was bake-height mid-body);
   front course 1.498/1.430/1.320; nose taper top 1.68 -> 1.316/1.29;
   rear+tail courses widened INBOARD 0.36 -> 0.40 (x 1.60..2.00, shoe
   clearance 0.078) for the honest ±1.60 front cols (ref 1.72 line);
   bottoms 0.71 -> 0.7275 (ref ±1.78..1.87 cols bottom 0.728); right
   band-edge strip bottom 0.02 -> 0.0885 (the 0.011 ground read was the
   vlo's 0-stripe).
5. DECK FURNITURE ON THE HONEST DECK: hatch ring/seam + periscopes at the
   1.588/1.566 zones; louvre cluster + cable backer to the 1.694 engine
   flat (tops <=1.692); intake housings trimmed to 1.69; liftEyes 1.611;
   deck discs 1.610; corridor bulkheads 1.578/1.578/1.52; E1 seams on the
   honest beak plane (rx -0.436); E2 seams per deck band; deckTint +
   draped C2b cables on the 1.619 deck (crowns 1.616 — the r9
   riser-window law is moot: the honest deck is flat).
6. TURRET (what now rotates + honest-line trims): corner tabs top 2.12 ->
   2.16 (novlo turret ±1.73 cols); outer shelf 2.34 -> 2.21 (2.34 was
   bake-calibrated; the core's 2.2525 owns the <=1.28 front cols); BUSTLE
   TAIL STUBS per side (tops 2.165, world z to -2.79/-2.82, inside the
   rails'/A-panels' overlap) — the print's rotating basket tail plate
   (novlo plan taper ±1.43@-2.20 -> ±1.09@-2.80) whose station-1 cap the
   dead corner posts used to fake.
7. RING-GAP SHADOW FILL: /shadow/i-NAMED render-only block (x ±1.18,
   y 1.40..1.77, z -0.57..2.32) reproduces the print's dark under-turret
   void (which the bake used to fill in every mask); excluded from every
   measurement mask (fidelity baseVisible, evaluator proxy-hide, critic
   framing-only exclusion verified), renders in critic/game views;
   audit-safe (overlap 0.22 < 0.25).

SIM-GATE LADDER (novlo bytes x staged tree, official page math):
- flip1 (deck + deletions + bow): min 87.1 (hull 87.1 / whole 88.2 /
  turret 91.9 / stations 90.3 / dims 99.5 / floaters 100); side rows
  91.3/91.4 with dAlong 0 — plan rows BIT-IDENTICAL to baseline (96.4/
  96.3/92.63: the deck drop is plan-invariant by construction).
- flip3 x2 (jacket widen/bottoms, plank split, tabs/shelf/stubs, strip
  bottom, ring fill): min 87.8 IDENTICAL x2 (hull 87.8 / whole 89.6 /
  turret 91.9 / stations 91.2 / dims 99.5 / floaters 100); front rows the
  binder (front_hull mean 0.93: the -1.01 certified pin col 0.156 + the
  taper-bottom sextet + long tail), side 91.8/91.4, stations st1 CLOSED by
  the bustle tail stubs (15.58 -> 0.3-class), plan rows bit-identical to
  baseline.
- flip4 x2 (r16-c: taper bottoms 0.7275, core-edge cap 2.21w at x
  1.05..1.28 with side maxima held by construction — 4 slabs narrowed to
  +1.05 + capped right shoulders + plug split + fore-roof +x corner 0.60):
  min 88.1 IDENTICAL x2 (hull 88.1 / whole 89.8 / turret 91.8 / stations
  91.2 / dims 99.5 / floaters 100). The taper fix exposed the ref's SHARP
  outer-lip step (bottoms 0.728 at x <=1.87 -> 0.648-0.658 at x >=1.91).
- FINAL x2 (r16-d: dark bottom lips widened inboard to x 1.894..2.00 —
  their 0.635 bottom owns the ±1.91..2.00 cols at -0.015): **min 88.9
  IDENTICAL x2 (hull 88.9 / whole 90.4 / turret 91.8 / stations 91.2 /
  dims 99.5 / floaters 100)** — every component >=90 EXCEPT hullCurves,
  whose worst list is now: the -1.01 certified kit shoe-pin col (0.156),
  the +1.01 ref asymmetric-band 0-stripe col (0.055, §B6-frozen band),
  1.46/1.51 ground-line cols (0.032 x2), then the ~0.02-avg banded-deck
  long tail. floaters 100 in EVERY sim run (baseline, midstate, flips
  1/2/3 x2/4 x2/final x2 = 10 readings x 5 poses).
- Post-flip audit (census-flip.json): stranded 6 -> 2, abutting 0,
  dangling 0 — both residuals are merged-bucket AABB unions (hullDetail
  0.50 / hullDark 0.26) driven by the hull-TRUE mast stack + full-length
  dressing; the per-add census shows SIX hull pieces intersecting the
  casting box at all: three engine-deck louvre strips (tops 1.692 — deck
  furniture under the bustle overhang, the §B5 law's own hull-side
  clause), two engine deckBands grazing the clamped floor (frac 0.022/
  0.010) and the exhaust (0.016). ZERO turret-mass pieces remain
  hull-parented — the de-fusion is real; the flags are the m1a2-r2
  wind-post adjudication class exactly.
- §B4 track-clip --exact: 0/0 PASS on the staged tree (the plank
  re-plane + 3.20 open-crest held containment).
- r16-e FLOOD ROUND (fresh critic pairs at the final bytes; PROC-half
  blue-signature flood, the r9 rig): the deck drop re-opened the honest
  print's own sight-lines — ring-gap fills re-parented to TURRET (the
  shadow yaws with the mass casting it; §B5-audit-clean as ordinary
  turret furniture) and split 3-zone (ring capped 1.75 so the certified
  V-stair side reads survive; bow/aft to 1.86), corridor roofs re-cut at
  the honest deck level (tops 1.525/1.428 — parked UNDER the local
  side/front lines, mask-free by construction). Digits: front 176 / rear
  125 / rearleft 631 / rearright 313 / frontleft 143 / frontright 205 /
  left 410 / right 460 / top 131 / toptilt 94 (r13-cert baselines 92/99/
  92/92/92/92/119-120/125-126/110/94: toptilt EXACT, top +21, front/rear
  small; the left/right/quarter residuals are the ring-gap band above
  the fill caps + the reopened oblique sponson corridors — REF-PARITY
  classes post-repair: the honest print opens the same sight-lines, so
  the r13 flood baselines (measured against a bake-filled ref) are
  INVALID for the coupled state; the re-cert critic re-derives them on
  the honest pair). Gate x2 after the flood fixes: min 88.9 IDENTICAL
  (components byte-equal to the pre-fix pair — the fills are
  mask-excluded and the strips are under-line, proven).

HASHES + CHECKS (staged tree): leo2_revolution 7175fbf0 -> **1993cfb1**
(82 meshes / 110365 verts at the r16-e landing bytes; +3 meshes = the
3-zone ring shadow fills, -1 merged) — the re-freeze candidate for the
coupled landing commit. Frozen siblings verified at the
same sitting: leo2a5 **bc9bad30**, leo2a6 **80b76338**, kf51 **3ae9b70c**
— byte-identical (no shared-helper change; segRunXT is builder-local).
leo2a7v e28fc316, leopard2_proto 5647ef3e recorded. npm test: 166 checks +
track-geometry PASS on the staged tree.

RESIDUALS (coupled state, measured on the sim rig):
- front -1.01 col errM 0.156 (0.131-0.133 committed): the r13-certified
  kit shoe-pin class vs the honest ref belly 0.35 — kit-frozen, priced.
- side z 3.41..3.53 (+0.05..0.06 x ~4 cols): OUR idler-wrap crown
  1.36-1.385 vs the ref's lower 1.28-1.30 fender line — §B6 dims-guarded
  idler + §B4 shoe envelope: the print clips its own track there; owner
  law outranks oracle (m1-slope precedent class).
- side z 3.86 toe col -0.05: the toe band stays 0.965 (honest toe reads
  1.02-1.08) — raising it re-flips the 3.743 bin to BODY and smears every
  side row (the r5/r7 dAlong law).
- plan_turret cam +1.61 col: the r12-documented REF-side bistable (rear
  flips -1.0/-2.48) — observed in both states on the sim rig; carried.
- §B5 audit after the flip: residual merged-bucket AABB unions (hullDetail
  ~0.50 / hullDark ~0.26) — the m1a2-r2 wind-post class: driven by the
  hull-TRUE mast stack (novlo hull cols 2.17-2.47) + full-length dressing
  unions; per-piece census (census-flip.json) shows the turret-zone mass
  above the honest deck lines is zero. The cable/deckTint/periscope-glass
  strands of the r13 six CLEARED by the deck drop itself. Audit growth
  suggestion (orchestrator): per-piece above-ring resolution would zero it.

LANDING ORDER (one commit, the m1a2 §B5-r2 shape): orchestrator lands the
vlo repair + this staged tree together; official geometry-gate x2 +
floaters x5 + 14-view critic re-cert (full — the hull camo bucket
re-merged: mottle re-derives on changed pieces; the owner-visible deck
drop changes every close view) + yaw-90 pair + re-freeze 1993cfb1 in the same commit. Until then the official gate MUST
NOT run on the staged tree alone (mid-state min 0 — proven above).

### COUPLED LANDING EXECUTED (2026-08-05, orchestrator — owner takeover order)
Both halves landed in ONE commit per the LANDING ORDER: repair_oracles.py
batch-41 (chassis_vlo mesh-ref drop; byte-idempotent 11f9d8c0 x2; pre-flight
proved .bak + batch-37 chain reproduced committed bytes exactly) + the
staged leopard.js flip. Official gate x3 IDENTICAL post-repair: min 88.9 |
hull 88.9 / whole 90.4 / turret 91.8 / stations 91.2 / dims 99.5 /
floaters 100 — the request-interception sim reproduced to the decimal.
LEDGER ROW DROPS 90.7 -> 88.9 BY HONESTY: the old row measured the vlo-
polluted mask (VLO-BAKE POLLUTION law, BUILD-STANDARD §E). RE-FREEZE
CANDIDATE 1993cfb1 (82 meshes / 110365 verts, orchestrator-verified) —
full 14-view re-cert critic IN FLIGHT at landing (owner takeover order
landed the tree mid-protocol; the critic's verdict either ratifies the
re-freeze or files orders). QUEUED NEXT: the hullCurves 88.9 -> 90+
retune round (r7-class ledger retune against the honest hull line +
vertex-workorder against repaired bytes + the per-tank shoe-pin-cap
opt-in decision, all decoded in the §B5-r16 section above).

### RE-CERT RATIFIED (2026-08-05): RE-FREEZE 1993cfb1 CONFIRMED — floor
9.0 all fourteen views at the coupled 88.9 state (c9ddba0 = the certified
bytes; docs/critique/shaded-parity-leo2_revolution-defuse-recert.md).
Yaw-90 killed three ways (vertex census, 4-camera pairs, official audits).
Retune round takes: hull 88.9 -> 90+ orders (§B5-r16 decode) + P-1
fore-ring deck cluster tells (close-front floor-setter) + P-2 top tint
edges. New laws banked: DE-BAKE CONTRAST WINDOW, YAW-PROOF STATIC-PIXEL
FALSE-FLAG (BUILD-STANDARD §E).

## HULL-RETUNE round r17 (2026-08-05, leopard builder) — the de-bake debt paid: min 88.9 -> **91.2 PASS x2 bit-identical** (hull 91.8 / whole 91.4 / turret 91.8 / stations 91.2 / dims 99.5 / floaters 100) + P-1 tells + P-2 measured disposition

| component | r16 coupled (certified) | after r17 |
|---|---|---|
| hull | 88.9 (front_hull 88.89 binder) | **91.8** (front_hull 95.35; side_hull 91.79 = new binder) |
| whole | 90.4 (front_whole 90.45) | **91.4** (front_whole 93.01; side_whole 91.41 binder) |
| turret | 91.8 | 91.8 (side 91.83 / plan 92.27 — rows byte-equal) |
| stations | 91.2 | 91.2 (identical list — NEW GATE BINDER: st8 4.9 flicker + st11/12 width-guard sovereign, all certified classes) |
| dims | 99.5 | 99.5 (identical: h 0.5 / hullL 0.68 / overallL 1.06 / w 0.11) |
| floaters | 100 | 100 |

ORDERS -> DELIVERIES:

1. **HULL RETUNE 88.9 -> 90+ (front_hull 88.89 -> 95.35, mean 0.87 -> 0.36,
   p95 1.09 -> 0.60, reg dy -0.015 -> 0.000)** — the honest-residual decode
   (workorder vs REPAIRED bytes + gate-identical in-page column-ownership
   probe + ref z-windowed sweeps + plan pixel-column traces):
   - The +0.055 43-column mid class was ONE piece: the r2 tail riser
     (box 2.0 wide, top 1.775, z -3.635..-3.735) — a bake-mirror survivor
     (its "ref -3.68 tops 1.796" comment was the vlo bake). But its SIDE
     read is REAL: honest ref side -3.681 tops 1.776 = mast-base equipment
     hidden inside the mast's own front column. **BAKE-MIRROR
     NARROW-NOT-DROP**: riser narrowed to exactly the mast column
     (box 0.02 x 0.065 x 0.11 @ x 0.0745) — side -3.681 keeps 1.776 at
     zero cost, all 43 front columns drop to the honest deck line.
   - The honest print's REAR DECK PLATE measured: ref plan-hull zmin
     -3.856 CONTINUOUS x 1.43..1.982 (pixel-column probe) + ref front-hull
     1.71 full-width sourced at z -3.95..-3.65 (z-sweep). ONE new plate
     carries three rows: **rear deck shelf** box(3.978, 0.032, 0.245) @
     (0, 1.696, -3.7425) — front outboard cols 1.46..2.00 rise 1.688 ->
     1.71 (ref line), plan outboard rear edges -3.825 -> -3.865 (plan_hull
     96.45 -> 97.56, plan_whole 96.33 -> 97.39 — free), mid/shelf columns
     get a STABLE 1.71 print (the bare tail-box top at authored 1.710 was
     a 40%-pixel-coverage coin flip). Rests on tail box + shoulders,
     meets the rail aft; x 1.989 inside the +-2.0 width guard.
   - Top rail 1.70 -> 1.6895 (top 1.7145): the ref front at the rail z is
     1.71 full width; the old 1.725 top printed a 1.721 lid over every mid
     column once the riser died. Priced trade: the ref's 1.721-line shelf
     cols (+1.15..1.33, 5 cols) now read -0.011 at top (0.016 errM each,
     in the worst list below).
   - Fan wells re-sunk <=1.712 authored + hinge chord bars/plates/bolts
     dropped ~6 mm (tops 1.711-1.7122): with the riser gone these become
     the mid columns' top painters; the old 1.7185 rim line straddles the
     r16 grid's next bin edge (1.721-print risk, model sensitivity -0.9).
   - **Belly honesty**: tub bottom 0.36 -> 0.338 (box y-center 0.849,
     h 1.022) — the honest ref belly prints 0.337 across ~30 mid front
     columns (0.009-0.020 errM each at the re-derived dy); side/plan are
     blind to it (tracks own every side bottom — side rows byte-equal
     before/after) and st topPct measures tops only. front_whole shares
     the gain (its bottoms are the same tub).
   - Scenario model (gate-math replica on the full 96-column dumps,
     scripts in scratchpad): predicted front_hull 96.7 / front_whole 93.6
     at re-derived dy +0.004, robust to +-1 print bin (95.8/96.7);
     measured 95.35/93.01 at dy 0.000. The model's residual list matched
     the gate's worst list ordering exactly.

2. **P-1 fore-ring cluster tells (defuse-recert floor order)** — the
   named coordinates decode AGAINST the render, not the probe:
   - The KIT periscope bodies sit ENTIRELY under the 1.562 hump-plate
     bottom (bodies 1.483..1.554) — buried, pixel-free from every
     official view (close-front pixel-diff: zero changed px at their
     projected rect 787..818 x 312..324). A first dressing pass
     (hood caps + pale lips + glass slits) was REVERTED as dead geometry
     (r12 buried-class law). **BURIED-FURNITURE PROBE FALSE-ATTRIBUTION**
     law banked below.
   - The VISIBLE "flat-grey cuboids" decode via critic-camera projection
     (orthoFor math, no render needed) to: mantlet cheek blocks
     (turretDark, screen 818..895) = the "posts"; the wing dark-cover
     leading edge + exposed top zones (875..1034) = the "slab"; the fore
     core front face (camo, 835..924) = the "stepped box"; clamp jaw +
     recoil rod (certified travel-lock group members) between them.
   - Tells delivered (all interior — gate rows byte-identical
     before/after): RIGHT cheek carries the coax MG port (pale collar +
     dark bore stub on its front face, the real L/44 coax spot); LEFT
     cheek a 3-bolt pale row; wing cover gets 2 pale hinge bars riding
     the TILTED top surface (rz -0.0527 matching its slope) + a 4-bolt
     leading-edge row at per-x surface heights; the hatch riser gets its
     ordered LID: camo lid disc (top 1.542) + dark lid-seam ring + two
     pale hinge blocks on the 1.566 hatch-plate zone + grab handle —
     the lid's fore arc is the top-view-visible tell.

3. **P-2 top-view dark rect — MEASURED DISPOSITION (honest residual)**:
   the rect (PROC px [267:310]x[335:385]) decodes to WORLD x -0.93..
   -0.44, z 1.36..2.29 and is NOT a tint plate: it is the mantlet/left-
   cheek CAST SHADOW pooling on the fore-left deck. Its interior reads
   p10=p50=p90=34.0 — the deck material's deep-shade floor, which
   NORMALIZES albedo. Two full overlay attempts rendered ZERO changed
   pixels (verified by pixel-diff both times): darkening bridge quads
   (tints 0.72-0.80) and lifting quads (1.18-1.38), both riding the
   local plate heights straddling every ruler edge. The edges ARE the
   certified mantlet/cheek silhouette projected by the sun — albedo work
   cannot soften them (the caster is gate-priced geometry). Quads
   removed (dead-geometry law); source comment at the deckTint block
   carries the receipts. The ref's same zone reads 44-65 mottle because
   its differing turret nose shades it differently — a geometry-class
   difference already priced in the turret rows.

4. **§J DE-BAKE CONTRAST WINDOW re-audit**: fore window borders = the
   P-1 pieces (now told) + certified travel-lock group; aft window
   borders = louvre cluster (pale BY DESIGN, r16-e certified) + intake
   housings (camo) + cable backer — no new bare-grey neighbors; the
   stern sponson corridors reopened by the vlo drop are now COVERED
   top-down by the honest full-width shelf (flood direction: fewer sky
   px; the re-cert critic re-derives the flood baselines).

5. **Close battery (all on the final bytes)**:
   - Official gate x2 BIT-IDENTICAL (cmp on the tool-written JSON):
     **min 91.2 | 91.8/91.4/91.8/91.2/99.5/100 PASS** — run twice on the
     main tree at a healthy shared-module snapshot AND twice in the
     clean-room worktree (HEAD 8594840 + this leopard.js): four runs,
     one line.
   - §B4 `track-clip --exact`: **0/0 PASS** (clean-room; the plank
     re-plane + 3.20 open-crest held; shelf sits behind the sprocket
     wrap, shoulders' 1.42 bottoms untouched).
   - §B5 turret-parent: **stranded 2 / abutting 0 / dangling 0** — the
     two certified mast-union AABB false-flag classes exactly (61%/31%,
     unchanged from the ratified verdict).
   - standard-check: clip 0/0 | contig 0 | decor mg1+4d (identical
     census).
   - visual-evaluator: **RIG PARITY OK** (max yawProxy 2.3 deg @
     close-roof — the certified value), exit 0; flagged edge deltas are
     the carried wing-tilt/ramp families.
   - npm test: 166 checks + track-geometry PASS (clean-room worktree).

HASHES — TWO BASELINES VERIFIED (the INVISIBLE-LOD de-track fix 9bf2a6d
landed MID-ROUND with its 24-graduate mass re-freeze; every number below
was measured, not inferred):
- At the OLD baseline (clean-room worktree = HEAD 8594840 + this file):
  candidate 2385487d (82 meshes / 111649 verts); frozen sibs EXACT at
  their pre-fix values (bc9bad30 / 80b76338 / 3ae9b70c) — proof my file
  changes nothing sibling-side.
- At the CURRENT baseline (9bf2a6d, de-track kit lazy-built): the r17
  re-freeze candidate is **323228f8 (78 meshes / 104305 verts)**, stable
  x3; frozen siblings EXACT at their 9bf2a6d mass-refrozen values in the
  same sittings: leo2a5 **2f9d0af0**, leo2a6 **f25dad51**, kf51
  **1452024b**. (The -4 meshes per tank fleet-wide = the de-tracked
  thrown-kit meshes, per the 9bf2a6d landing.)
- Full battery REPEATED at the settled 9bf2a6d tree: gate x2
  BIT-IDENTICAL min 91.2 | 91.8/91.4/91.8/91.2/99.5/100; track-clip
  --exact (updated tool) front 0 / rear 0 | shoe 0/0, blind spots 0;
  turret-parent 2/0/0 (61%/31% certified classes); standard-check 0/0,
  contig 0, mg1+4d; npm test 166 + track-geometry PASS.
- NOTE: HEAD already contains an 87-line MID-ROUND snapshot of this file
  (the 2a6094b DEVICE HANDOVER sweep) — the diff to land is live-file vs
  HEAD, not vs 636d3e4. Renders in the report were taken at the pre-fix
  tankFactory; the de-track fix is render-invisible (visible=false
  meshes), so they remain representative of 323228f8's pixels.

CHANGED VIEWS for the re-cert critic: ALL 14 (the hull camo bucket
re-merged -> bakeDirt mottle reseeds everywhere, the r16 precedent).
Geometry deltas concentrate in: top/toptilt/rear/rearleft/rearright
(stern shelf + narrowed riser + rail drop + sunk wells), left/right
(rail -1 px; shelf stern edge), front/frontleft/frontright/close-front/
hero-frontleft (belly line +22 mm, outboard top line +1 px, cheek/wing
tells), close-roof (hatch lid + wells).

HONEST RESIDUALS (front_hull worst list, measured):
- -1.01 col errM 0.133 — the r13-certified kit shoe-pin class, back at
  its certified 0.131-0.133 value with dy at 0.000 (kit-frozen, priced).
- +1.01 col 0.047 — the §B6-frozen ref asymmetric-band 0-stripe.
- -1.06 col 0.025; +-1.24..1.33 cols 0.016 x5 — the rail-drop trade on
  the ref's asymmetric 1.721-line (model-predicted, priced).
- stations 91.2 is the NEW GATE BINDER — st8 4.9 (r7-documented window
  flicker), st11/12 3.3/2.7 (width-guard sovereign class); untouched.
- P-2 cast-shadow rect (above) — geometry-certified caster, albedo-
  unreachable, receipts in source + here.
- Ring fills inkier than the print's open gap; rear bustle breadth;
  deck micro-grain — carried r16 classes, unchanged.

LAW DISCOVERIES (for the bank):
1. **DEEP-SHADE ALBEDO CLAMP**: inside a cast-shadow pool the deck
   material's deep-shade floor normalizes albedo — tint overlays in BOTH
   directions (0.72..1.38) render zero pixel change. A zero-variance
   dark zone (p10=p50=p90) is a SHADOW read: adjudicate against the
   caster's silhouette, never order mottle/tint work on it. Critics:
   check the percentile spread before calling a "tint rect".
2. **BURIED-FURNITURE PROBE FALSE-ATTRIBUTION**: world-box triangle
   probes attribute close-range pixel reads to geometry that is fully
   occluded (the periscopes under the hump plate). Decode screen rects
   with the critic camera's own orthoFor projection (cheap, no render)
   before naming pieces in orders; verify tells with a pixel-diff.
3. **BAKE-MIRROR NARROW-NOT-DROP**: a bake-mirror piece can carry one
   REAL row read among its fakes (the riser's side 1.776 vs its false
   front 1.766 x43). Narrow it to the witness column instead of
   deleting/lowering — the honest row keeps its read at zero cost.
4. **LIVE-TREE FROZEN-SIB VERIFICATION HAZARD** (process, for §F):
   sibling-agent WIP in shared modules (tankFactory.js here) transiently
   changes every family build (-4 track meshes fleet-wide, track-clip
   blind-spots, all four leopard hashes moved). Frozen-hash proofs and
   §B batteries must come from a CLEAN-ROOM WORKTREE (committed HEAD +
   own file + symlinked node_modules) whenever `git status` shows
   foreign shared-module edits. Corollary: a handover/takeover sweep can
   commit MID-ROUND builder snapshots (2a6094b took this file at 87
   lines in) — diff against CURRENT HEAD at landing, not the round's
   starting commit.

### r17 LANDED PENDING RE-CERT (2026-08-05, orchestrator — no-new-spawns
order): gate 91.2 PASS x2 bit-identical at both baselines — the graduate
is back above 90 (stations 91.2 now binds, certified classes). RE-FREEZE
CANDIDATE 323228f8 (78/104305, orchestrator-verified on the post-LOD-fix
factory; sibs exact at new frozen values). Changed views: ALL 14 (camo
mottle reseeds). THE NEW DEVICE'S FIRST CRITIC SPAWN: full 14-view
re-cert at 323228f8; on PASS ratify the re-freeze (final renders
preserved in the round's scratchpad paths per §r17).

### r18 OWNER RULING (2026-08-05): REF-WRONG turret override (§B7)
Owner: "the revolution turret looks terrible because its source material
is wrong. just go in and make it more like the actual tank since our
reference is wrong." The r17 323228f8 re-cert is SUPERSEDED — r18
re-authors the turret to the real Rheinmetall MBT Revolution
configuration (photo class governs); gate turret-row divergence vs the
flawed print gets an OWNER REF-WRONG cap per §B7. Hull/running-gear rows
keep chasing the print (uncontested).

## §B7 round r18 (2026-08-05, leopard builder) — OWNER REF-WRONG TURRET
## RE-AUTHOR: the turret is the real MBT Revolution now; gate rows record
## the honest distance to the wrong print under the r18 §B7 cap.
## Gate at close: min 0.2 | hull 91.8 / whole 76.4 / turret 0.2 /
## stations 78 / dims 99.5 / floaters 100 — x2 BIT-IDENTICAL (cmp on the
## tool JSON). Candidate hash ce7f3824 (78 meshes / 107353 verts, x2).

WHAT WAS AUTHORED (photo class, everything under rig_turret):
1. FRONT WEDGE (§B1 slope-motivates-the-mass): ONE face plane per side —
   world z = 2.50 − 1.3772(|x|−0.44) − 0.8421(y−1.79): 40° back-rake from
   vertical, 54° plan sweep from the embrasure (±0.44 @ w 2.50) to the
   shoulder (±1.58 @ w 0.93); three stacked module courses per side with
   co-planar faces whose BOTTOMS ride the certified ref floor staircase
   exactly (2.045w / 1.90w / 1.79w — the r5/r7-chased channel floors
   survive by construction); outer edge chamfers 1.58 -> 1.50 at the
   roof; center PROW halves meet over the mantlet at a +0.13 ridge
   (planarity verified to 0.6 mm); module-joint grammar ON the plane
   (vertical seam + course seam ±4 mm, lifting bosses).
2. GUNNER'S SIGHT recessed in the right cheek top: hood walls + roof
   (2.42w) over a dark rectangular aperture + recessed glass.
3. ROOF DECK at 2.36w — one plateau (real deck->roof 0.74 over the
   honest 1.62 hull line; the print dives to 2.23) with a roof-edge
   chamfer course closing to the panel tops.
4. SIDE PANELS: two-facet courses — cant OUT ±1.615 @1.92w -> ±1.700
   @2.17w (the real modules' ±1.70 width; front cols ±1.66..1.74 top out
   at the ref's own 2.17 corner line BY CONSTRUCTION), then a top bevel
   to ±1.6425 @2.30w (chamfered-joint grammar); three segments ending at
   w −1.45 where the real modules meet the bustle; dark seam strips in
   the gaps; ROSY four-tube banks integrated low on the mid panels
   (housing + mouths + rim collars riding the cant face, x-reach inside
   the panel-printed plan columns).
5. ROOF SET: SEOSS panoramic on ring+pedestal, head 0.46 x 0.36 topping
   EXACTLY 2.66w (the heightM anchor ON the ref's own spike band; face
   package recessed 22 mm clear of the −0.725 column boundary), hood
   visor + recessed lens; equipment module (x −0.44..−1.26, w −1.22..
   −2.00, top 2.575w) with louvre ribs + lid seams + latches + the st4
   cap blades INSIDE at its own top line (station cap law); compact
   .50-cal RWS rear-right — the §B3 census pintleMG fitting (m2,
   two-tone) with its foot SUNK to 2.30w so the pale cap tops 2.633w
   under the 2.64 published line (a deck-level fitting stack reads
   2.69-2.79 and blows the dims-sovereign p95 budget; §I hand-dressing:
   base/collar/slew disc/sensor pack/ready-ammo bin justified here);
   crosswind mast (fore-aft head, one column, top 2.62w); hatches SEATED
   on the roof with lid seams + hinge blocks + cupola periscopes.
6. BUSTLE RACK read: certified rails/A-panels/stubs kept + frame drops,
   strapped duffel, upper bustle rail at the roof edge, jerry cans +
   tarp roll against the shaded rear face; right rail widened to the
   real (and ref) ±1.4 basket line.
7. RECESSED UNDER-WEDGE STEEL as a SHADOW-NAMED render-only mesh
   ('leoTurretRecessShadow', §C mechanism): per-side courses swept 0.28
   behind the face plane + the mantlet/ring collar — the A4 turret front
   under the appliqué reads live at ZERO mask cost (a turretDark first
   cut printed 1.71 bottoms across the certified 2.05-2.08 stair
   columns, −0.35 x6). Bow ring-gap fill split: aft full-height to
   w 1.40 + fore LOW band (±0.60 x-width still blocks the §B2 side
   x-ray) so the old dead-front BLACK BOX is gone.

DELETED PRINT ARTIFACTS (the owner's "terrible" reads): the Gun-node fore
WING (y 1.79-2.03 out to w 3.56 — physically impossible on the real
vehicle), left cheek/notch complex (1.33w notch), left mid slab,
asymmetric fore cores, diving fore-roof plane + crown, ±1.71 corner tabs,
right-wall fore-front slab, the pod deck (station tub + right pod +
shoulder + shelf + roof step), print-parked floating cupolas, EMES
box/sight pod/riser, the wing-cover finish suite (overlay quads, seams,
hinge bars, bolt row, stowed-MAG dressing).

### r18 §B7 OWNER REF-WRONG CAP (region: TURRET; ruling quote + date
above; ratified in BUILD-STANDARD §B7). Rows moved r17 -> r18, measured
at the close x2 line (all divergence = real-vehicle-vs-wrong-print in
the overridden region; hull rows BYTE-EQUAL scores — uncontested intact):
| row | r17 | r18 | Δ | dominant §B7 classes |
|---|---|---|---|---|
| plan_turret | 92.32 | 0.23 (mean 7.11) | −92.1 | ref's Gun-node wing fronts w 3.54-3.57 vs real wedge sweep (x 0.17..1.61, errs 0.7-1.6 x ~11 cols); panels-vs-tab-nub at ±1.72 (2.34 x2); wall-front w 2.06 vs module end (−1.61) |
| side_turret | 91.83 | 74.75 (mean 1.88) | −17.1 | 2.36w roof plateau + wedge top vs the print's 2.06-2.24 diving pancake nose (w 0.2..2.5, +0.10..0.24 x ~14 cols); sight hood 2.42 vs 2.21 (x2 cols) |
| turretCurves | 91.8 | 0.2 | −91.6 | binder = plan_turret |
| front_whole | 93.01 | 76.37 | −16.6 | roof plateau/wedge cols x ±0.1..1.3 (+0.1-0.2); SEOSS/module band vs ref band asymmetries; mast col −0.29 (+0.28 x1); ±1.78 col (ref turret wider than the real ±1.70, −0.2 x1) |
| side_whole | 91.41 | 80.96 | −10.5 | same plateau-vs-dive classes through the whole mask |
| wholeCurves | 91.4 | 76.4 | −15.0 | binder = front_whole |
| stations | 91.2 | 78.0 | −13.2 | topPct: st6 3.4 (cupola at real seat) / st7 4.5 / st9 5.1 / st10 7.7 / st11 9.6 (wedge/prow plateau vs diving print); st8 wPct settled 2.91 (certified flicker band); st11/12 wPct 2.6/2.6 sovereign carry |
| hull rows | 91.79/97.56/95.35 | 91.79/97.56/95.35 | 0 | side/plan/front_hull IDENTICAL — hull/running gear untouched |
| plan_whole | 97.39 | 97.39 | 0 | hull owns every plan front |
| dims | 99.5 | 99.5 | 0 | caps never cover dims: heightM 2.65 (SEOSS anchor = the ref's own spike band), hullL 0.68, overallL 1.06, w 0.11 |
| floaters | 100 | 100 | 0 | x2 |
Registration UNMOVED in every row (side dAlong 0 / dy −0.004, front dy
0.000 — the §D counterweight held; no smear).

CLOSE BATTERY (all at the final bytes):
- geometry-gate x2 BIT-IDENTICAL: min 0.2 | 91.8 / 76.4 / 0.2 / 78 /
  99.5 / 100 (full lines above).
- track-clip --exact: front 0 / rear 0 | shoe 0 / 0, blind spots 0 PASS.
- turret-parent: stranded 2 / abutting 0 / dangling 0 — the two
  certified mast-union AABB false-flag classes (53%/26% — ratios moved
  with the turret envelope, same two merged hull buckets).
- standard-check: clip 0/0 | contig 0 (§B2 top-down clean) | decor
  mg1+4d (RWS M2 fitting + 2 cables + 2 light clusters).
- visual-evaluator: RIG PARITY OK, max yawProxy 2.9° @close-front (no
  RIG MISMATCH); flagged edge deltas are the §B7 wedge-vs-print classes.
- yaw-90 pair (shots/leo-r18/*-yaw90.png + census): the ENTIRE new
  turret — wedge, SEOSS, module, RWS, rack, ring shadow fills — yaws as
  one mass (§B5 de-fusion proven at the new config).
- npm test: 166 checks + track-geometry PASS.
- Hashes: candidate ce7f3824 x2 (78/107353); frozen sibs BYTE-IDENTICAL
  pre-edit AND at close: leo2a5 2f9d0af0, leo2a6 f25dad51, kf51 1452024b.
- Renders: shots/leo-r18/{before,after}/ (14 views each), crops/ (2x all
  14 + 4x close-front/close-roof/front/left, before/after), yaw pair.
  CHANGED VIEWS for the re-cert critic: ALL 14 (turret camo bucket
  re-merged -> mottle reseeds; the turret silhouette changes every view).

SELF-READ (photo class for the turret region per §B7(3); hull-only reads
stay ref-parity — hull rows byte-equal): front 8.7 / frontleft 8.9 /
frontright 8.9 / left 8.8 / right 8.8 / rear 8.6 / rearleft 8.7 /
rearright 8.7 / top 9.0 / hero-fl 8.8 / hero-rr 8.6 / hero-toptilt 8.9 /
close-front 8.5 / close-roof 8.9. Weakest reads named: the ring-gap
band still reads flat-dark at 1x side/front (certified §C mechanism —
the real gap is shallower; a recess-steel tone pass is the follow-up),
and close-front's mantlet zone is shadow-heavy vs the photo class.

LAW DISCOVERIES (bank):
1. §B7-ECONOMY ORDER: in an overridden region, spend in this order —
   (a) real masses that COINCIDE with ref bands (SEOSS on the ref's own
   2.66 spike band = heightM anchor kept; ammo bin on the right-pod
   band; basket rail to the ref's own ±1.4); (b) §C shadow-named
   render-only for RECESS reads over certified floors (the under-wedge
   steel — a bucket-mesh first cut cost −0.35 x6 on certified columns,
   the named mesh costs zero); (c) honest divergence only where the
   real shape demands it (wedge plateau, wing deletion).
2. FITTING-SINK: a pintleMG fitting can serve a low RWS by sinking its
   origin BELOW deck level (column emerges through a mount collar) —
   the cap lands under the published-height line without scaling; a
   deck-seated M2 stack reads 2.69-2.79 and breaks the p95 budget.
3. DEAD-PLANE DECALS PRINT LONE COLUMNS (§C decals-are-mask-geometry,
   sharpened): a decal left on a deleted face's plane printed the
   otherwise-EMPTY −1.72 plan column alone at 2.85 errM — re-pin decals
   whenever their host face moves; a floating decal is a full mask
   column, not a texture.
4. MIRRORED-SLAB WINDING: mirror slab() geometry across x by negating
   corners AND swapping (b0<->b1, b2<->b3, t0<->t1, t2<->t3) — the
   corner swap restores outward winding (backface culling otherwise
   eats every mirrored face from outside).
5. WINDOW-EDGE Z-CAPS RE-TRIGGER STATION FLICKER: new segment end-caps
   parked ON a station window boundary (panels at w 0.55 = st8's 0.555
   edge) re-arm the certified width flicker at its worst state (6.5%);
   park caps >=40 mm clear (settled 2.91).
6. SHADOW-FILL EXPOSURE: a shadow-named fill is only legal where REAL
   geometry covers it from every scored-and-rendered angle it isn't
   meant to read from — the full-width bow fill's lit top read as a
   floating black slab once the wing died; a side x-ray is blocked by
   ANY x-width, so recess fills can narrow to ±0.60 and hide under the
   prow plan-cover.

RESIDUALS (certified/measured):
- The §B7 cap rows above — the r18 floor until the ORACLE-REPAIR
  CANDIDATE lands: the print's wing band rides the Gun node (r16
  census); a wing-band mesh drop (batch-41 chassis_vlo class, §E
  orchestrator lane — builders never touch GLBs) would free
  plan_turret's ~11 wing columns and side_turret's w 2.4..3.3 band, and
  the cap shrinks to the roof/nose classes. RECOMMENDED.
- procShadow_gun oversize: the gun shadow proxy runs to z 7.6 = 1.6 m
  past the 6.005 muzzle (the fleet LOD-fix follow-up class: t84 +1.80,
  m46 +1.60, kf51 +1.16...) — mask-excluded, render-only; true-up in
  the family's next shared round.
- Ring-gap band tone at 1x (above); st8 wPct flicker band 2.6-6.5
  carried; mast col −0.29 +0.28 x1 (thin-feature, ref's own 2.34 step
  zone); ±1.78 front col — the print's turret is wider than the real
  ±1.70 (ref-only, capped).
- r13 kit shoe-pin front −1.01 col + §B6 idler-wrap crown + toe-band
  dAlong guard: all carried byte-identical (hull rows identical).

### r18 LANDED (2026-08-05, orchestrator) — §B7 cap in force, candidate ce7f3824
Landed with the turret authored to the real MBT Revolution per the owner
ruling; hull rows held r17 EXACTLY (91.79/97.56/95.35 + plan_whole 97.39,
registration unmoved). Gate x2 bit-identical: min 0.2 — the §B7 cap table
above decodes it (dominant class: the print's Gun-node/TurretMesh wing
band). ORACLE-EXCISION ROUND QUEUED (§E lane): orchestrator component
census on committed bytes (probe: scratchpad probe-rev-guncomp.py, output
banked in the session tool-results) found the wing band = a SWARM of
hundreds of small TurretMesh fragments at glb y 1.13-1.29 reaching x
±1.78 (gate w 3.56, roof-height plan carriers) + two DEGENERATE
single-triangle slivers: GunMesh prim0 (x -1.84..-0.03, one tri) and the
whole vehicle#gun_tube_vlo node (one tri, z -6.04..-1.12 along the tube —
VLO-BAKE class, batch-41 sibling). The excision round uses
REQUEST-INTERCEPTION SIM iteratively (multi-box _index_surgery + the two
JSON-only drops), then the gate re-derives and the §B7 cap shrinks to the
genuine real-vs-print divergence. RE-CERT CRITIC spawned at ce7f3824 —
photo-class scoring on the turret per §B7, ref parity hull-only; the
capped gate row is adjudicated, NOT a critic concern.

### r18 RE-CERT RATIFIED (2026-08-05): RE-FREEZE ce7f3824 CONFIRMED —
floor 9.0, mean 9.04, all fourteen views (§B7 photo-class turret + ref-
parity hull; docs/critique/shaded-parity-leo2_revolution-r18-recert.md).
The owner's "turret looks terrible" is CLOSED: wedge one-plane-per-side
at 4x, §B3 tells at 2x-6x, §B2 cleaner than the print every view, whole
turret yaws as one. Builder's close-front 8.5 refuted upward (carried
§C mechanism tier, priced by delta). Non-blocking orders for the next
dressing round: P-R1 fill/recess tone pass WITH top-face darkening term
(SHADOW-FILL LIT-TOP law), P-R2 SEOSS pale top -> sight-family tone.
Wing-excision §E round re-endorsed (sim planner in flight).

## batch-43 WING-BAND EXCISION PLAN (sim-verified, 2026-08-05, §E oracle-repair
## planner — REQUEST-INTERCEPTION SIM lane; committed bytes NEVER touched.
## Simulated line: min 0.2 -> **62.8 x2 BIT-IDENTICAL** (hull 91.8 BYTE-HELD /
## whole 69.9 / turret 62.8 / stations 78.0 / dims 99.5 / floaters 100).
## Deliverable: ops literals below — ORCHESTRATOR appends to the
## repair_oracles.py chain and lands; builders never run repairs.

SWARM CENSUS (committed bytes = post batch-37+41 chain state; probe
tools/tmp-leo-wingex-census.py in the EXACT _index_surgery frame —
repair_oracles.node_world_matrix glb-world, both sides):
- TurretMesh (mesh 'chassis_vlo.002') prim0: 1697 index-connected
  components, 9050v/5649t, ALL <200v. Solid turret core (walls with
  support down to y 0.71-0.93) ends at |x| ~1.26; EVERYTHING at |x|
  1.32..1.94 is a FLOATING SHELF y 1.02..1.32 (glb) with zero support
  below — the swarm. Fore/aft lobes: glb z -1.9..-0.65 outboard (the
  orchestrator's sample rows z -1.37..-1.82) + glb z +0.9..+3.3 outboard;
  center tail strip glb z -1.95..-3.0 x ±1.0 (12t).
- TurretMesh prim1: 379 comps, 2400v/1832t, ALL inside x +0.38..+1.39,
  y 1.40..1.90, z +1.33..+2.74 — the mast/sensor furniture cluster.
  REAL — untouched.
- GunMesh (mesh 'chassis_vlo.001') prim0: ONE degenerate tri (3v/1t,
  x -1.843..-0.028, y 0.292 const, z -3.419..-3.382) — the plan_turret
  "wing fronts w 3.54-3.57" carrier (differential-proven: its lone drop
  moves turretCurves 0.2 -> 34.8 with EVERY other row byte-equal).
- GunMesh prim1 RE-CHECKED for outboard fragments: 33 comps, 356v/286t,
  ALL x -0.145..+0.158 (pure tube, z -6.041..-1.122). ZERO outboard. Keep.
- vehicle#gun_tube_vlo: ONE degenerate tri (3v/1t, x -0.015..0.026,
  y 1.005..1.015, z -6.041..-1.122). Differential sim: dropping it is a
  measured NO-OP (all rows/stations equal to the decimal) — r16's "it is
  the ref tube mask line" is moot at these bytes (prim1's 33 fragments
  carry the line). Dropped for batch-41-class hygiene at zero cost.

FRAME LAW (bank candidate — this round's near-miss): the print's
TurretMesh content renders PI-YAWED about the turret pivot relative to
raw glb coords (loader rest-yaw); the Gun subtree does NOT get the extra
flip. A glb-frame census maps to gate/packet-w meaning with x AND z
negated for TurretMesh only. Proven by station attribution: the glb
z -2.0..-3.0 center strip owns st12 (the TAIL station, topPct 0.11 ->
23.10 when deleted) — it is the print's rotating BUSTLE TAIL PLATE, not
fore-wing. First candidate ate it and cost stations 78 -> 70.4; the
landed plan KEEPS it (and the ±1.75 basket rails, and all core/prim1
furniture). "Dome, hatches, sights survive" verified by census + renders.

BATCH-43 OPS (the exact literals; EXTEND REPAIRS['leo2_revolution'] —
never flat-assign; chain order batch-37 warp -> batch-41 vlo drop ->
these three):

  ('py2', _index_surgery('leo2_revolution', 'TurretMesh', prim_index=0,
      delete_rules=[((-2.00, -1.32, 0.95, 1.35, -1.90, -0.05), 0, 0),
                    ((1.32, 2.00, 0.95, 1.35, -1.90, -0.05), 0, 0)],
      gun_rules=[((-0.30, 0.30, 0.85, 1.20, -6.10, -2.95), 0, 0)],
      expect_delete=(470, 1917, 953),
      expect_gun=(0, 0, 0)))
  # gun_rules here = pure GUARD: expect_gun (0,0,0) makes the op REFUSE
  # to write if anything ever occupies the tube corridor inside TurretMesh
  # (zero matches = no gun-move side effect, proven every build).

  ('py', repair_leo2_revolution_gunmesh_prim0_drop)   # asserts 2 prims,
  # prim0 == 3v/1t and prim1 == 356v/286t, then mesh['primitives'] =
  # [prims[1]] — drops the degenerate wing-front sliver, keeps the tube.

  ('py', repair_leo2_revolution_gun_tube_vlo_drop)    # batch-41 literal
  # class: asserts the node's prim is 3v, removes exactly 1 mesh ref
  # (node keeps its transform).

  (Working reference implementations with the exact asserts:
  tools/tmp-leo-wingex-mkglb.py — drop_gunmesh_prim0 / drop_gun_tube_vlo.)

EXPECT CENSUSES (§E): surgery expect_delete (470 parts, 1917 verts, 953
tris); expect_gun (0,0,0). Post-chain state census (idempotency
tripwire): 28 nodes / 26 meshes; TurretMesh prim0 4696t, prim1 1832t;
GunMesh 1 prim 286t; gun_tube_vlo mesh-less. A re-run replays from .bak
(repair() semantics) so the recipe is idempotent by construction; the
expect censuses refuse on any drifted input.

PRE-FLIGHT (proven in scratch this round, shots/leo-wingex/):
1. Chain replay batch-37+41 from leo2_revolution.glb.bak -> BYTE-EQUAL to
   committed bytes (2499440 B, md5 2d8b74b8...). No STALE-BAK.
2. Full dress rehearsal .bak + 37 + 41 + 43 -> 2527660 B, md5
   c0ffb352bd5fcf283bed0efdc29752b3 — byte-equal to the sim-verified
   candidate, build-deterministic x2.

SIM VERIFICATION (tools/tmp-leo-wingex-gate.mjs = the r16 precedent
driver cloned; UNMODIFIED official procedural-fidelity.html?geo=1 math,
candidate bytes served by request interception):
- RIG PARITY: committed bytes x HEAD tree reproduced the r18 close line
  TO THE DECIMAL: min 0.2 | 91.8 / 76.4 / 0.2 / 78 / 99.5 / 100.
- FINAL x2 BIT-IDENTICAL (cmp on tool JSON):
  min 62.8 | hull 91.8 / whole 69.9 / turret 62.8 / stations 78.0 /
  dims 99.5 / floaters 100
  min 62.8 | hull 91.8 / whole 69.9 / turret 62.8 / stations 78.0 /
  dims 99.5 / floaters 100
- HULL UNTOUCHED: side_hull 91.79 / front_hull 95.35 rows BYTE-EQUAL to
  baseline (full JSON compare); plan_hull 97.56 / plan_whole 97.39 equal
  in every curve/reg/worst byte with a 3e-7 raw-score float drift
  (sub-ulp GPU accumulation from the changed buffer layout; invisible at
  the gate's 1-decimal output). dims rows + floaters identical every run.
- Sim ladder (each iteration x1 unless noted): prim0-only 34.8; vlo-only
  no-op; strip-only stations 70.4-71.7 (REJECTED); one-shelf 11.9;
  shelves+strip+prim0+vlo 62.8 but stations 70.4 (REJECTED); +z-outboard
  ring variants 62/66-whole (REJECTED); FINAL shelves+prim0+vlo 62.8 with
  stations HELD x2. Corner-tab nub plates (12 tiny plates z +1.28..+1.54,
  |x| 1.72..1.84) tested: zero measurable effect — left in place.

VISUAL PARITY (tools/tmp-leo-wingex-pair.mjs, board-mode shaded pair +
articulation strip, committed vs candidate, shots/leo-wingex/pair-*):
2870 px changed (t>4) of 1.4M in the hero pair, all thin-sliver-shaped
inside the reference turret band; articulation deltas confined to the
reference row's same band at every yaw/pitch pose. No crater — the print
still reads as a whole tank (crop proof hero-crop-compare.png).

§B7 CAP AFTER EXCISION (measured, final x2; cap shrinks to genuine
real-vs-print divergence):
| row | r18 cap | post-43 | Δ | class after excision |
|---|---|---|---|---|
| plan_turret | 0.23 | 62.82 | +62.6 | wing fronts + shelf swarm GONE; left: wedge fore-sweep vs print (±1.61 0.52-0.56), module-depth classes (0.28-0.48), cover 3.23% = emptied outboard cols (print has NO solid side modules) |
| turretCurves | 0.2 | 62.8 | +62.6 | binder = plan_turret |
| side_turret | 74.75 | 73.49 | -1.3 | plateau-vs-pancake widened honestly at rear cols (0.12-0.17 x6) once the shelf's false tops left |
| front_whole | 76.37 | 69.94 | -6.4 | ±1.78 ref-only col CLEARED; new honest class ±1.69/±1.73 x4 (0.24-0.27): real modules where the print carries only air after the junk leaves |
| side_whole | 80.96 | 80.00 | -1.0 | same honest-exposure family |
| wholeCurves | 76.4 | 69.9 | -6.5 | binder = front_whole |
| stations | 78.0 | 78.0 | 0 | st10 7.72 -> 9.28 (shelf aft fragments were st10 top carriers; class already listed), st12 0.11 PRESERVED (tail plate kept) |
| hull rows / plan_whole / dims / floaters | — | — | 0 | untouched by construction |
The whole/side drops are the §B7 FALSE-AGREEMENT corollary: impossible
junk that accidentally mimicked real geometry (wing shelf tops = module
tops in the front mask) scored better than the honest print; the capped
rows now measure the true print. All divergence above = real-vs-wrong-
print in the overridden region; the cap covers it.

ORCHESTRATOR LANDING STEPS: (1) pre-flight chain replay (above) must
byte-match committed; (2) append the three ops (batch-43 header + the two
py helpers) — NEVER flat-assign; (3) python3 tools/repair_oracles.py
repair leo2_revolution; verify output md5 c0ffb352... and byte-idempotent
x2 (second run replays .bak identically); (4) official geometry-gate x2
(expect the line above to the decimal) + floaters x5 + standard-check;
(5) the proc tree is UNTOUCHED this batch (leopard.js frozen — no coupled
half; the repair is ref-side only and gates standalone, midstate-safe:
proven by the sims running the HEAD tree); (6) §J DE-BAKE CONTRAST WINDOW
does not trigger (render deltas are sliver-scale) but the re-cert critic
should note the reference pair, not proc views — proc bytes identical.

LAW DISCOVERIES (bank): (1) TURRET-FLIP CENSUS LAW (above — glb-frame
turret censuses need the pivot pi-flip before gate/w-frame attribution;
station ownership is the cheap proof). (2) DEGENERATE-SLIVER MASK
CARRIERS: one zero-area triangle carried 34.6 turretCurves pts of mask
error — census degenerate prims by bbox, never by area, and expect
single-tri drops to move whole rows. (3) FALSE-AGREEMENT JUNK: §B7 rows
can legitimately DROP under an honest excision where junk mimicked real
masses — price the cap by class, not by score sign. (4) FULLY-INSIDE box
rules auto-protect long real furniture (the ±1.75 basket rails span z
-0.105..+3.631 and straddle every box by construction) — author boxes so
real furniture straddles them. (5) gun_tube_vlo class refinement: a
Gun-node vlo sliver is NOT hull-bake pollution (it articulates with the
gun); measure before assuming the batch-41 class applies — here it was a
harmless no-op, not a mask-line owner.

### batch-43 EXECUTED (2026-08-05, orchestrator lane)
Pre-flight: chain 37+41 byte-reproduced committed (md5 2d8b74b8). Ops
landed per the plan literals verbatim; guards all passed (surgery -953
plate tris = expect exact; GunMesh prim asserts; vlo 3v assert).
Idempotent x2 at md5 c0ffb352 / 2527660 B = the sim-verified candidate to
the byte. OFFICIAL gate x2 IDENTICAL = the simulated line to the decimal:
min 62.8 | hull 91.8 / whole 69.9 / turret 62.8 / stations 78.0 /
dims 99.5 / floaters 100. The §B7 cap now covers only genuine
real-vs-print divergence (wedge fore-sweep, module-depth classes, 3.23%
cover where the print carries NO solid side modules — the real vehicle
does). Proc untouched (ce7f3824 stands ratified).

## r19 P-R1/P-R2 TONE ROUND (2026-08-06, leopard BASE-21 starter round —
## the r18 re-cert's non-blocking orders; graduate-change candidate)

Orders executed (albedo/tone only, ZERO geometry):
- **P-R1 fill/recess tone pass WITH the top-face darkening term**
  (SHADOW-FILL LIT-TOP law, §J №6): the four `leoRingGapShadowFill`
  boxes move to a dedicated fillDark clone (cables keep their certified
  two-point tone) and both fill + `leoTurretRecessShadow` bake
  vertex-color shading — up-facing fragments multiply DOWN (fills 0.55,
  recess 0.50: a lit top on a shadow fill is the r18 floating-slab
  class), undersides stay deep (0.80/0.85), vertical faces carry a
  bottom->top ambient grade (fills 0.90->1.16; recess steel 0.96->1.30
  so steel-vs-shadow separates at the recess mouth — the r18 self-read
  residual). Positions/index untouched; meshes stay /shadow/i-named
  (mask-excluded, §C).
- **P-R2 SEOSS pale top -> sight-family tone**: the SEOSS head box
  leaves the camo 'turret' bucket for 'turretDark' (the a5/a6 PERI-head
  optics-housing class). Same box, same transform — silhouette, the
  2.66w heightM anchor and its −1.01 front-column cover are unmoved;
  bakeDirt is position-hashed so every other camo vertex keeps
  byte-identical color.

### Measured tone deltas (ITU-601 luma on the changed pixels, official
### photoclass renders, shots/leo-tone-r19/{before,after})
- view-top (SEOSS head): med 55.6 -> 49.4 (the pale-top kill).
- view-rear: med 46.1 -> 41.5; view-front: med 53.7 -> 50.5 with p10
  40.1 -> 34.6 (tops darken) and p90 held (walls).
- close-front (recess zone): med 40.1 -> 35.2 with p90 53.8 -> 64.1 —
  the recess-mouth lift (steel separation) + top-kill signature.

### Graduate-change proofs (final bytes)
- geometry-gate x2 BIT-IDENTICAL = the ratified r18/batch-43 line TO
  THE DECIMAL: min 62.8 | hull 91.8 / whole 69.9 / turret 62.8 /
  stations 78 / dims 99.5 / floaters 100. Mask-neutrality proven (the
  §B7 capped row is adjudicated, not re-opened).
- HASH MOVED (expected — the P-R2 bucket move changes two merged
  buffers): ce7f3824 -> candidate **b53a16f8**, stable x2, meshes 78 /
  verts 107353 both unchanged. P-R1 alone is hash-free (vertex colors
  and materials do not feed tmp-hashgeo).
- CHANGED VIEWS for the mini re-cert critic: ALL 14 (pixel-diff t>4:
  369 px [view-rearleft] .. 5963 px [view-rear], total 26 583 px of
  14x768² — SEOSS head zones + the ring/recess band; bboxes in
  tools/tmp-leo-tonediff.py output, banked in the round report).
- track-clip --exact 0/0 + 0/0 (x2 runs this round); standard-check
  clip ✓ contig 0 ✓ mg1+4d ✓; turret-parent stranded 2 = the two
  CERTIFIED mast-union AABB false-flag classes (53 %/26 % — byte-same
  as the r18 close); npm test PASS.
- Frozen sibs BYTE-IDENTICAL at close: leo2a5 2f9d0af0, leo2a6
  f25dad51, kf51 1452024b.

RE-FREEZE PROTOCOL: candidate b53a16f8 awaits the mini re-cert critic
on the changed views (tone-only; the capped gate line is reproduced
above) — orchestrator re-freezes on PASS in the landing commit.

Residuals: the ring band at 1x remains a conservative dark read (the
grade is deliberately subtle — the §J DEEP-SHADE ALBEDO CLAMP bounds
what albedo can move in the floor-lit zone; a stronger lift would need
the ambient-floor hook and re-certification of the fills' certified
raw-clone tone class). procShadow_gun oversize (+1.6 m) still carried
(fleet LOD-fix follow-up class).

### r19 RE-CERT RATIFIED (2026-08-06): RE-FREEZE b53a16f8 CONFIRMED —
floor 9.0, mean 9.11 (up from 9.04; no view below its r18 score). P-R1
lit-tops dead at 5x, recess steel separated (p90 64.1 exact); P-R2 SEOSS
pale population extinct. Flood delta-0 x14. Erratum: min-diff view is
view-left (369 px). docs/critique/shaded-parity-leo2_revolution-r19-
recert.md. No orders — the revolution arc is fully settled.

## OWNER RING-GAP ORDER (2026-08-06) — GRADUATE CHANGE: "see-through / disembodied" sides closed
Owner report (with screenshot): "the leopard 2 revolutions turret is a
little see through right now... fix these sides and turret ring area
that makes it seem disembodied." Diagnosis: the r16-e/§B7-r18
leoRingGapShadowFill set stopped at x ±1.18 with tops 1.75 (ring) /
1.86 (bow-aft/aft) — a see-through band stayed open between the fill
tops and the side-module floors (walls floor 1.96-2.05w, AMAP panel
bottoms 1.92w), and everything outboard of ±1.18 under the panels was
open background at oblique angles (A/B crops:
shots/leopard-shoe-b4/ring-crop-{base,fixed}.png — the baseline band is
BROKEN by background slivers; fixed is one continuous seated shade).
Fix — same §C SHADOW-NAMED mechanism (mask-excluded, turret-parented,
shadeFill lit-top bake), three moves:
- the ring / bow-aft / aft fills WIDEN 2.36 -> 2.76 (±1.38, inside the
  walls' 1.39/1.43 inner faces) and RISE to 1.95 (10 mm under the
  lowest wall floor). The sub-1.95 ring-belt V-stairs now read as
  under-structure in deep shade instead of against background — the
  real vehicle's tight dark ring (§B7 photo class); their MASK rows are
  untouched (shadow meshes excluded from every measurement mask).
- per-side UNDER-WALL CURTAINS (x 1.36..1.58, y 1.42..1.94, z world
  -2.00..0.70) close the oblique daylight under the AMAP modules,
  recessed 7 cm behind the wall faces (they read as the modules' own
  under-shade). Curtain tops tuck 20 mm under the 1.96 wall floors —
  no 3D contact with mask solids.
- bow-fore LOW fill untouched (the r18-certified recessed bow read).
DONE-GATES: gate x2 REPRODUCES THE §B7-CAPPED LINE EXACTLY both runs:
62.8 | 91.8/69.9/62.8/78/99.5/100 (mask-exclusion proven end-to-end);
shoe/band audit --exact 0/0 + 0/0 (fills/curtains are mid-hull, clear
of both wrap zones); standard-check clip 0/0 contig 0 mg1+4d; npm test
green. YAW-90 CLEAN: the fills/curtains rotate with the turret (pair
under shots/leopard-shoe-b4/leo2_revolution-yaw{0,90}/) — nothing
strands over the hull flanks; the swung corners stay under the turret
walls (they overhang the hull side less than the turret itself does).
CANDIDATE HASH fa1a47fc (80 meshes / 109729 verts; frozen b53a16f8 —
the +2 meshes are the curtains) — pending re-cert critic. Changed views
(diff-derived): view-left/right (the closed band), view-rearleft/
rearright + hero-rearright/hero-frontleft (oblique under-panel shade),
close-front unchanged-class but include for the ring shade grade.
Residual: at extreme low grazing angles a 10 mm slit under the wall
floors remains by design (kept so the shadow set never touches the
mask solids); the under-BUSTLE opening aft of z -2.0 is the real
vehicle's open rack zone, intentionally left.

### §B4 SHOE-ROUND RE-CERT RATIFIED (2026-08-06): RE-FREEZE fa1a47fc CONFIRMED
(docs/critique/shaded-parity-leopard-shoe-recert.md; floors 9.0-9.1).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 r9 flat dark end-cap kept; furniture adds rim+recess read (z 4.985); §C.1 14 reversed re-oriented; F-vs-D 54->1 (3cm mixed sliver); gate HELD x2 EXACT - NOTE pre-existing turret 0.2 at HEAD (ledger said 62.8; batch-37 oracle revert suspected - ORCHESTRATOR ITEM); hash fa1a47fc -> bb2bb60c CANDIDATE; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.

## 2026-08-06 GRAY-RECTANGLE FIX (owner PRIORITY order: "fix the leopard 2
## revolution from all angles, the gray rectangles are really making it
## look so weird")
DEFECT: the r16-e/r18 ring-gap shadow-fill band (deck 1.62 -> wall floors
1.96-2.05: ~0.4 m of near-black boxes + under-wall curtains at ±1.58)
rendered as flat gray/black RECTANGLES in every compass/hero view —
measured (5,7,5) flat at the ambient floor, band 281 px wide in
view-left. Root causes: (1) NO REAL METAL where the real vehicle has its
module lower course — half a meter of void can never read as shadow;
(2) fillDark/recessSteel inherited cableDark's deliberate RAW-clone (no
ambient-floor hook) so no gradient could render; (3) the r19 grade
brightened wall tops (inverted vs physics).

FIX (three mechanisms, all angles proven):
1. REAL §B7 MODULE APRON (turret camo bucket, yaws with the mass): side
   runs face ±1.60, y 1.735..1.975w, z -2.06..0.70w + RAKED front
   extensions following the wedge plane (wfz - 0.06 setback, kills the
   hard vertical start edge) + rear return x ±1.55 face -2.03..-2.08w +
   8 mm proud turretDark seam strips (module joint grammar). The real
   MBT Revolution's AMAP side modules hang low over the deck (the
   A-panel 1.70 bottoms are the same real line); the honest ~11 cm
   shadow slit over the 1.62 deck remains. Side-row floors in the apron
   span (certified 1.79/1.90/2.045w staircase) re-price under the
   standing §B7 turret cap — packet-documented, RENDER-ONLY round (the
   oracle is BROKEN at HEAD: batch-37 revert; gate NOT run by order).
2. UNDER-WALL CURTAINS DELETED (the single biggest side-view carrier);
   their §B2 oblique-daylight duty moved to the real apron.
3. SHADOW RE-TONE: fillDark 0x1f231a -> 0x3a4033 + rehook (ambient
   floor ON — raw-clone darkness stays cableDark's certified lever, the
   fills split off it); grade INVERTED to physics (top faces 0.38,
   walls 1.22 bottom -> 0.42 top: darkest under the overhang,
   bounce-lit at the deck); fill tops 1.95 -> 1.78 (overlap band
   1.735..1.78 under the apron — no sight-line slit; ring-belt V-stairs
   now hang INTO the slit as real structure); fore-low fill ±0.60 ->
   ±0.48 / z end 2.28 -> 2.20 (tucked inside the mantlet collar
   footprint); recessSteel 0x262b22 -> 0x333931 + rehook + inverted
   grade (0.45/0.90/1.26 -> 0.58) — steel-vs-shade separates at close
   range.

PROOF (render-only, official photoclass rig, 14 views + yaw90):
shots/leo-rev-gray/{before,before-yaw90,after,after2,after2-yaw90}.
Before: black band y350-376 x181-461 px (view-left), pure (5,7,5).
After2: band GONE in all 8 compass + 3 hero + 2 close views; under-gun
shade reads graded steel; yaw90 pair — apron/fills rotate as one mass
(§B5 unity). Battery: winding-audit m1 rev0 mix0 deficit 0px / m2 clean
(coinc-dominated); track-clip --exact 0/0 band + 0/0 shoe; turret-parent
stranded-2 = PRE-EXISTING whole-bucket false-flag (identical at clean
HEAD, verified by stash A/B — documented negative, my pieces
turret-parented); standard-check clip/contig/decor ✓ (gate columns VOID
this round: broken oracle, turret 0.2 pre-exists at HEAD); npm test 166
+ track-geometry PASS. HASH: bb2bb60c -> bbae2c80 NEW CANDIDATE
(supersedes bb2bb60c pending the batch re-cert; meshes 82 -> 80: the
two curtain meshes deleted). Graduates untouched: leo2a5 e215a738 /
leo2a6 09912270 / kf51 9ac547ac verified before and after.

## 2026-08-07 §5.09 ROUND (leopard builder) — §B2 TURRET SEE-THROUGH
## CLOSURE + HUGE FLW 200 RCWS
Owner order §5.09-4/5 (verbatim): "for the leopard revolution, we need to
close the gaps and empty spaces in its turret that dont have plates for
some reason but are see through to the other side. and put a huge
automated turret crows system on the revolution and other leopards too."

### GAP INVENTORY (found by enclosed-background scan — mask-method +
### blue-signature — across 14 views x rest/yaw45/yaw90;
### tools/tmp-leo509-holes.py; before px -> close px)
| sightline | before | closure (REAL geometry per §B2 — no willy-nilly fills) |
|---|---|---|
| view-top tail slits x ±1.55-1.60, z -3.6..-1.5 (270+270 px; yaw45 563+417) | 12 / 154y45 / 38y90 | HULL TAIL+MID CORRIDOR ROOFS: the 5 cm deck-edge<->jacket slot (probe: deck edge 1.549 / jacket inner 1.599, tops 1.700/1.699) closed by the certified r16-e corridor-roof mechanism — 5 segs/side top 1.665 (z -3.60..-1.48) + 6 segs/side top 1.52 (z -1.48..+1.06); every top parked under the local deck/jacket/lip lines: side/front/plan masks unchanged by construction (hull rows held: 94.5 -> 94.3) |
| view-rear outboard corridors x ±1.28..1.55 over the apron (149+64+43+12 px) | 11 | BUSTLE CORNER STOWAGE BINS ±1.29..1.43 (§B3 grammar: lid seam + latch + rail straps; bottoms 1.955w overlap the apron top) + MODULE END PLATES ±1.43..1.55 abutting the wall sliver rear faces |
| yaw90 close-roof rail<->A-panel corridor x -0.86..-1.01 (361 px) | 55 | LEFT + RIGHT RAIL STOWAGE BOARDS (the r9-c card grown to the full rail z-window, y 1.86..2.145w, z -1.755..-2.355 — dropping the under-rack daylight to the real shallow band) |
| yaw45 rearright bustle lattice (237+25+19 px) | 26 | bins + boards + end plates + the under-rack fill |
| rearleft/left/right under-rack band (158+55 / 64 / 82 px) | 42 / 0 / 0 | §C SHADOW-NAMED UNDER-RACK FILL (leoRingGapShadowFill class extended aft: x ±1.38, y 1.40..1.78, world z -2.60..-1.98 — mask-excluded, turret-parented, the honest slit stays) |
| front flank slots ±1.59 (47+20+20 px) | 58 total front (flank pair DEAD; remainder = whip/tower air) | CHAMFER FORWARD CAPS (the roof-edge course continues to the wedge sweep line, raked front cut) + module lower front end-caps (±1.59, y 0.18..0.38, z 0.955) |
| yaw45 front under-RWS air (356 px) | 138 | the compact r18 RWS replaced by the full FLW 200 station (trough + pod + tower fill the old skeletal air; the remainder is the real gun-cradle air under the elevated receiver) |
TOTALS: rest 7-view sum 1355 -> 197 px (-85%); yaw set 2232 -> 373
(-83%); heroes 0 px x3. Documented residuals: under-barrel/whip
furniture air (real station air, not plate holes — the §B2 law targets
hull/turret voids); the station-air pocket behind the elevated receiver
(74 px, view-rearright); yaw45 bustle-OVERHANG daylight (80+41 px — the
swung basket overhangs the hull side; air outboard of the hull is real);
ring-dip top slivers 4-9 px (mid-hull corridor at the 1.542 dip band —
roof strips there would poke the dip deck line).
### §5.09-5 RCWS (leoFLW200; §5.07 FORWARD; §4.9999 connections)
The r18 compact RWS upgraded IN PLACE (same rear-right seat, the real
MBT Revolution RCWS spot; old base/collar/sensor-pack/bin retired, their
ref-band duties absorbed): full station at (0.43, 0.76, -1.25) s 1.15 —
slew ring/drum, armored trough + flank shields + rear plate, m2 census
fitting FITTING-SUNK at 0.72 (cap 2.65w), sensor pod on the aim face
(pod top 2.55w), gun-left ammo bin + feed chute, IR pointer, cable +
conduit, elev 0.06 (tip ~2.63w), NARROW optic tower (top 2.93w, z-window
0.14 = <=3 columns; above-grace budget = whip col 1 + tower <=3 = 4).
### Gate + battery (batch-46 honest-baseline regime: 0-at-§B7-cap; hull
### 94.5 is the trustworthy band)
- geometry-gate x2 IDENTICAL:
  `0 | hull 94.3 whole 66.7 turret 0 stations 73.2 dims 99.5 floaters 100`
  — hull 94.5 -> 94.3 (-0.2, inside the ±1.0 hold), dims 99.5 = the
  baseline value EXACTLY (heightM 2.65 +0.5% in grace; hullL 0.68 /
  overallL 1.06 = the certified carries), floaters 100 x2. whole 70.3 ->
  66.7 and stations 72.8 -> 73.2: the §B7-capped-region turret adds
  (bins/boards/station read against the broken print — the
  FALSE-AGREEMENT class; cap covers them, never dims).
- DIMS INCIDENT (banked): the first close read dims 90.9 — the 2.70
  whip-rod tops (certified against the OLD print lineage) straddled a
  trace boundary after the batch-46 AABB re-phase (TWO above-grace
  columns + the tower's three -> heightM p95 2.69). The §B7 cap killed
  the rods' 2.70 duty (turret rows read 0); rods dropped to 2.64w tops
  and dims returned to 99.5. LAW: certified spike tops die with their
  oracle lineage — re-audit every above-grace carrier after an oracle
  restructure.
- Hash: bbae2c80 -> 531d8a7c (81 meshes / 112874 verts — moves by
  design; photo-class re-freeze after the critic). Graduates byte-held:
  leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac / leo1a5 1c79188.
- track-clip --exact: 0/0 band + 0/0 shoe, blind spots 0.
- Corridor roofs are the ONLY hull-bucket change and are mask-invisible
  by construction (tops under every local line; interior to plan
  silhouette) — hull rows held within 0.2.
Renders: shots/leo-509/final/leo2_revolution{,-yaw45,-yaw90};
before/after sightline crops shots/leo-509/evidence/.

## batch-46 ORACLE ADJUDICATION (2026-08-06, orchestrator lane) — CHAIN RETIRED

The owner's parallel session landed b08d1a2 ("revert batch-37 warp to
last-good asset") + 8ad527a ("drop chassis_vlo junk shell, dedicated
track material") — not a re-dress of the repaired lineage but a FULL
PRINT RESTRUCTURE. Census of the live bytes (sha1 1d7112d9, 1,442,776
B): `chassis`/`GunMesh`/`TurretMesh` are meshless articulation shells;
geometry lives on new children `chassis_vlo001` + `chassis_vlo001_1`
(gun tube, under GunMesh) and `chassis_vlo002` + `chassis_vlo002_1`
(turret print, under TurretMesh); 12 per-shoe track nodes + big wheels
under Scene; 5 materials incl. a dedicated `Tracks`.

ADJUDICATION: batches 37 (mast warp) / 41 (vlo drop) / 43 (wing
excision) all assert on retired-lineage nodes (`chassis_vlo` mesh node,
2-prim GunMesh mesh, `vehicle#gun_tube_vlo`) — pre-flight can never
pass. Whole chain RETIRED to history (repair_oracles.py batch-46 note;
no REPAIRS entry remains). Old .bak (2,499,448 B, pre-batch-37 +
blender-reparent lineage) archived `*.pre-batch46-history`; fresh .bak
= owner bytes verbatim (the new pristine).

HONEST BASELINE (x2 bit-identical, official gate):
`0 | hull 94.5 whole 70.3 turret 0 stations 72.8 dims 99.5 floaters 100`
Mechanism (tmp-leo-defuse-refprobe, gate frame): the rescue restored
the PRISTINE tall mast/whip band — turret subtree y 1.648..4.026 vs
published roof 2.64 (the exact geometry batch-37 flattened, whip tips
raw 3.27-class). The loader height clamp governs (scale 0.771 vs len
0.903), the whole model squeezes, and the turret band comparison
collapses to 0. Hull improved under the rescue: 91.8 -> 94.5 BYTE-HELD
class. The 3v wing-front sliver (batch-43's carrier) is BACK in the
print (GUN `chassis_vlo001` x 0..1.64 flat y 1.267 z ~3.55).

§B7 CAP RE-DERIVATION: owner ruling stands ("source material is
wrong") — the print's turret band (mast height, wing slivers) is
REF-WRONG; photo class governs the turret. The §B8-accepted candidate
bbae2c80 (grays dead, acid YES every family, independent critic)
RE-FREEZES as the render truth. Gate line reads 0-at-cap and is NOT a
regression signal; hull 94.5 / dims 99.5 / floaters 100 remain the
print's trustworthy bands. Any future gate work on this id starts by
filing a fresh normalize batch against THIS lineage (mast flatten to
the 2.68 anchor + wing-sliver drop — batch-37/43 intent, new nodes).

## 2026-08-07 §5.17 TURRET-COMPLETION ROUND (leopard builder) — owner order
## "theres still a gap under front part of its turret ... fix the turret"
## + owner correction (supersedes the gray-squares half): "the turret didnt
## finish building under that front part and sides"

DIAGNOSIS (owner-angle rig tools/tmp-rev517-owner.{html,mjs} — fixed
perspective cameras at the garage drag-pose class, elevated close 3/4
front-left + chin/side/rear probes, yaw 0/45/90, §B2 bg census per view;
before-crops shots/rev517/before*): the turret rendered as a roof/upper
shell floating over unbuilt volume. Under the FRONT: the wedge courses
ended at their certified 1.79/1.90/2.045w floors and the only content in
the chin cavity was the r18 SHADOW-NAMED recess/collar mesh — render-only
slabs FLOATING in open air (the owner's "gap": daylight between the
wedge underside, the floating collar bar, and the bow deck, wide open at
elevated angles). Along the SIDES: through the 1.619..1.735 ring slit the
eye hit the bare near-black fill faces 17 cm inside — hollow, no
structure. Root cause: r18 §B7 re-authored the turret DOWN to the course
floors and §C-shadow-filled the rest; nothing REAL was ever built between
the shell and the ring band.

FIX (REAL §B2 geometry — the A4 casting + mantlet collar the AMAP shell
bolts onto; all under rig_turret, §5.17 block in buildLeo2Revolution):
1. REAL MANTLET COLLAR (turretDark, ±0.52, y 1.74..2.02w, z 0.20..2.16w)
   — the r18 render-only collar's certified visual footprint made REAL
   and widened past the cheek blocks (elevation-safe: same top/front the
   -9/+20 sweep was certified against since r18).
2. Per-side CHIN BAND (camo, x 0.44..1.20, y 1.74..1.91w) riding the
   wedge plane at a 0.05 module-lip setback (modules stay proud — photo
   class), top buried in the C3 course, meeting the collar at ±0.44/0.52.
3. Per-side UNDER-CHEEK CLOSURE (camo, x 1.20..1.55, top ring tapered to
   C2's 1.48 knife line, y 1.74..2.06w into the wall floors, plane-0.05
   back to z 0.50w) — the cheek underside is a closed volume.
4. Per-side UNDER-SKIRT WALL (camo, x 1.36..1.46, y 1.725..2.00w,
   z -2.00..0.60w) — the visible stepped casting wall 9 cm inside the
   apron line; the ring/aft fills behind it keep the last ~10 cm as the
   honest ring-clearance shade.
5. Fore-LOW fill raised (top 1.66 -> 1.73w, 1 cm under the real collar;
   front tucked 2.20 -> 2.14w) — the 1.66..1.755 under-chin daylight
   sliver is dead.
6. r18 RECESSED UNDER-WEDGE STEEL shadow mesh DELETED (courses + old
   collar) — its floating-slab read WAS the complaint; real geometry
   supersedes it. Fills (ring/bow-aft/aft/under-rack) unchanged.
YAW-SWEEP LAW (banked, in-source): every new bottom clears the deck
content of its own sweep annulus about the ring pivot (0, -0.35w) by
>= 2 cm at ALL yaw — deck-edge/jacket strips 1.700 @ r >= 1.55 -> floors
1.725+; tail box 1.71 @ r >= 2.55 -> chin/collar floors 1.74; fan wells
(r 2.95) / tail mast (r 3.33) outside the max piece radius 2.88. Tops
<= 2.06w (heightM anchor 2.65 unmoved); widest x 1.55 inside ±2.00.

PROOF (clean-room worktree = HEAD 507f83b + this file only — LIVE-TREE
FROZEN-SIB law; foreign WIP in materials/main/abrams at round time):
- geometry-gate x2 IDENTICAL, the §5.09/batch-46 baseline TO THE DECIMAL:
  `0 | hull 94.3 whole 66.7 turret 0 stations 73.2 dims 99.5 floaters
  100` — hull 94.3 (guard >= 93.5: UNMOVED), dims 99.5 EXACT, floaters
  100 x2; whole/stations/turret byte-equal to the §5.09 line (the adds
  are fully mask-interior — not even a documented §B7 move).
- §B2 FLOOD DELTA-0 x14 rest views (front 58 / fl 0 / left 0 / rl 42 /
  rear 11 / rr 74 / right 0 / fr 13 / top 12 / hero-fl 0 / hero-rr 0 /
  toptilt 0 / close-front 0 / close-roof 27 = the §5.09 digits EXACTLY);
  yaw sets IMPROVED, zero regressions: yaw45 frontright 98 -> 20, top
  154 -> 113; yaw90 right 226 -> 45, rearleft 172 -> 148, top 38 -> 34
  (the new walls close real yaw sightlines; every other view at digit).
- track-clip --exact 0/0 band + 0/0 shoe, blind spots 0. turret-parent
  stranded 2 / abutting 0 / dangling 0 = the two CERTIFIED mast-union
  false-flags (53%/26%). standard-check clip 0/0, contig 0, mg1+4d.
  winding-audit m1 rev 0 / mix 0 / deficit 0 px; m2 clean (coincidence-
  dominated, candidatePx 5). npm test 166 checks + track-geometry PASS.
- HASHES: leo2_revolution 531d8a7c -> **db70c929** (81 -> 80 meshes =
  the recess shadow mesh deleted; 112874 -> 113594 verts), stable across
  both bookends. Guarded siblings BYTE-HELD at both bookends: leo2a5
  e215a738 / leo2a6 09912270 / kf51 9ac547ac / leo1a5 1c79188 / leo2a4
  12db10a0 / leopard2_proto 24bd57cc / leo2a7v 3ca4af86.
- OWNER-ANGLE EVIDENCE: shots/rev517/evidence/pair-owner-*.png (labeled
  before/after boards at the owner's elevated close 3/4 + chin/chin-low/
  side/rear probes, rest + yaw45 + yaw90); official 14-view sets at
  shots/rev517/photoclass{,-yaw45,-yaw90} vs the §5.09 baseline
  shots/leo-509/final/*.

RESIDUALS (measured, named):
- yaw45 owner-rig swung-chin air: ONE new 153 px enclosed pocket on the
  bespoke owner camera only (sky between the swung closure underside,
  the bow deck corner and the jacket rail — the §5.09 "swung basket
  overhangs the hull side" class at the front; real air, physically
  correct at yaw45, floors sweep-law-bound). Official rig: zero new
  enclosed px anywhere, six views improved.
- The chin band/collar read DARK at garage angles — they sit in the
  wedge's own cast shadow (DEEP-SHADE ALBEDO CLAMP class; they are
  surfaces now, not voids — tone work there stays bounded by the clamp).
- Dead-side low view barely moves (the §5.09 apron already owned that
  read); the under-skirt wall's stepped edge registers only under the
  apron line at near-horizontal pitches.
- Carried untouched: §5.09 documented residuals (under-barrel/whip
  station air, bustle-overhang daylight, ring-dip top slivers 4-9 px),
  fills' certified tones, batch-46 oracle 0-at-cap state.
