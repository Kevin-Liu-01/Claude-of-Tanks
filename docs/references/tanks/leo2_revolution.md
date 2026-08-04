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
