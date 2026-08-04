# BMP-2 — reference packet

Exact vehicle: **BMP-2** infantry fighting vehicle — low amphibious hull,
two-man conical turret with the long 30 mm 2A42 autocannon and the
roof-mounted 9M113 Konkurs ATGM.

## Real dimensions (2+ sources)
- Length **6.71-6.735 m**, width **3.09-3.15 m** —
  [Wikipedia: BMP-2](https://en.wikipedia.org/wiki/BMP-2),
  [militaryfactory BMP-2](https://www.militaryfactory.com/armor/detail.php?armor_id=50)
- Height: **2.06 m hull roof** (militaryfactory) / **2.45 m** over the
  turret+ATGM stack (Wikipedia) — TWO DATUMS, note which the in-game
  spec uses before dims scoring.
- Weight 14.3-14.6 t; crew 3 + 7 dismounts.
- Suspension: **6 double road wheels** per side, front drive sprocket,
  rear idler (BMP layout — drive at the BOW), 3 return rollers.

## Identity cues (visual laws for the build)
- VERY low, wide, boat-like amphibious hull with a sharp raked prow
  ("sharper prow" than BMP-1) and a near-flat top deck.
- Two-man CONICAL turret at hull center with the long thin 30 mm 2A42
  (small conical flash hider), coax 7.62 PKT; **Konkurs ATGM launcher
  tube on the turret ROOF** (the BMP-2 tell vs BMP-1's over-gun rail).
- 3+3 smoke dischargers on the turret front cheeks.
- Rear hull face: **twin outward-opening troop doors** (each with a
  fuel-cell bulge + firing port); firing ports along the hull (4 left /
  3 right) with vision blocks.
- Long side fenders/wave planes; trim vane folded on the bow; driver
  front-LEFT with the commander behind (BMP-2 moved the commander into
  the turret).
- Track run per §B6: raised FRONT sprocket + raised REAR idler (mirror
  of the western layout — the ramp rises at both ends regardless).

## Local oracle
`public/models/tanks/community/bmp2_bergman.glb` — m_bergman pack
(QUARANTINE class: gate/measure LOCAL-ONLY, never ship as visuals; the
in-game MODEL_SOURCE registration stays delisted). PROBE BEFORE FIRST
GATE (false-0 law): repair_oracles inspect + vertex-extract — the
Bergman pattons all carried print-bed packing defects (parked turrets);
assume nothing until measured. bmp1_bergman.glb also local (future
BMP-1 coverage).

## Gate wiring
bmp2 rides its procedural modern3.js builder in-game. For gate coverage
register the Bergman print through the fidelity harness override map
(LOCAL_REFERENCE_OVERRIDES, tools/procedural-fidelity.html) — the same
mechanism graduates use — NOT by re-enabling the quarantined
MODEL_SOURCE entry.

## AFV r1 — oracle probe + rebuild (2026-08-04)

### Probe (false-0 law) — print is SANE, gate lane OPEN
`repair_oracles.py inspect`: 4 nodes / 2 meshes, root scale 0.1; the
Turret node carries odd composed transforms (t 16.7/33.6/-17.2 against a
child counter-translate) but they COMPOSE to a correct assembly — turret
seated over the hull (y 0.96..2.62 raw over hull roof 1.87), NOT the
patton parked-turret defect. Gun FUSED into TurretMesh (gunNode null,
same as the patton prints; the gate turret mask includes rig_gun on the
proc side, so fused-gun parity holds by construction).
`vertex-extract` (registry row appended, mirrors the b584a7c override):
verts 379k tris 150k | bodyH 2.422 (-1.1%) bodyLen 6.21 (-7.6%)
hullMask 6.332 (-5.8%) overall 6.332 (-5.8%) width 3.151 (0%) | flip
false, k 0.944. NO structural defect -> no repair-lane stop.

### Stylization + normalize plan (REPORT ONLY — E-lane executes)
The print is proportionally WIDE: width-anchored loading leaves it -5.8%
short in z (6.332 vs 6.72). Normalize plan for the orchestrator warp
lane: uniform z-stretch 1.0613 about the body mid (gate frame; glb-unit
literal = same factor on the z axis of both meshes, root scale 0.1,
offsets per docs/references/vertex/bmp2.json glbToGate). Until that
lands the build resolves the tension inside the masks: every MID feature
sits at the print's own z (ring at z 0, deck/glacis/turret bands at the
print lines) and the ENDS stretch to the published 6.72 envelope, so the
residual is confined to end-column cover (~2-3 cols/end).

### Dims two-datum reconciliation (spec vs published: NO delta)
Spec dims 6.72 / 3.15 / 2.45 all sit inside the published bands
(6.71-6.735 / 3.09-3.15 / 2.45-over-turret+ATGM). heightM rides the
2.45 turret+ATGM-stack datum (hull roof alone is 2.06) — the oracle
agrees (bodyTop 2.424, and its own 2.45+ columns live at z -0.15..+0.10,
the Konkurs/cupola stack band, which the rebuild's stack matches).

### §B6-vs-oracle certified residual (M1-slope precedent)
The print hides its front track run behind a full-width prow plane (one
straight belly line (1.55,0.07)->(2.90,1.05); no wrap bulge). The REAL
BMP-2 shows the raised front drive sprocket below the bow. Built per
owner law: sprocket z 2.42 y 0.60 r 0.26 (wrap bottom ~0.32, visible),
idler z -2.52 y 0.50 r 0.24, contact patch z -2.13..1.77 — the
\________/ trapezoid at both ends. Certified residual vs the print:
bottom-line delta up to ~0.3 m over z 2.4..2.9 (~6-8 side columns),
carried by hullCurves/wholeCurves bottoms.

### Rebuild summary (modern3.js buildBMP2, full re-author)
Tub +-1.0 / sponsons to +-1.37 / roof 1.63 / troop band 1.685; boat prow
two planes at the print's slopes (glacis 0.226, lower 0.81) with a blunt
nose beam (stowed trim vane) keeping the converging lip a >=0.30 m body
band (dims 12%-band law); fenders +-1.525 with outer lips to +-1.575
(width datum 3.15); stern wedge + twin bulged doors; firing ports 4L/3R;
conical turret r 0.99 crest 2.16 with basket to 0.91 (the print turret
mask carries one); Konkurs tube peaking 2.47 ALIGNED with the print's
own 2.45+ spike band; roof PKT pintle (KIT fitting, top 2.42 —
decoration law, budget-free); 3+3 smoke banks as KIT fittings; 2A42
muzzle 3.03 (inside the envelope). Fittings census: pintleMG, smokeBank
x2, towCable, lightCluster x2, antennaWhip, spareTrackLinks.

### r2-r4 gate-loop findings (bank-worthy)
- PLAN-ROW LAW for stylized-length oracles: plan curves compare z-extents
  per X column — an end-stretch pays on EVERY plan column (mean 3.3% =
  -40 pts here), not just end columns. A -5.8%-long print therefore CAPS
  plan rows at ~58 for a published-dims build: dims>=90 and plan>=90 are
  MUTUALLY EXCLUSIVE against this print. WARP LANE REQUIRED for the 90s
  (normalize plan above stands; post-warp both rows are satisfiable).
- STATIONS are FRACTIONAL slabs of each model's own hull span — they
  tolerate the length stylization, so they ARE recoverable pre-warp: the
  r4 killers were real authoring gaps: (a) the print's fenders exist only
  over z 1.75..2.85 / -2.0..-3.07 (mid-hull slices measure 2.75 wide =
  bare track band) — planks split to front/rear sections to match; (b)
  mid-features must sit at PROC-FRACTIONAL positions of the ref features
  (Konkurs re-seated -0.07 for slab alignment). The two 17-21% top
  stations (11/12) are the trimmed-drop pair — free.
- The oracle's covered-run belly line ((1.55,0.07)->(2.90,1.05), slope
  0.727) is now ridden exactly: front wheel pulled to z 1.35 (contact
  ends 1.50 like the print), sprocket HIGH (y 0.77 @ z 2.05, wrap kissing
  the line, ~0.05 bulge on 2-3 cols = the whole §B6 residual), prow face
  from (2.18,0.42) at slope 0.72.
- Thin-member mask law reconfirmed: a 0.6 m whip antenna = 0.35-err
  columns in side_hull (curve masks see geometry the dims 12%-band
  ignores). Whip deleted for a base pot; the pintle MG re-sized to 0.62
  scale INSIDE the print's own 2.40-2.47 stack band.
- The print's fused gun reads halfW ~0.09 in plan (2.5x its side-view
  radius): matched with thin side rails on the 2A42, not a fatter tube.

### AFV r1 CLOSE-OUT — state + formal repair-lane request
Gate trajectory (min row): old build 0 (false-parity baseline) -> rebuild
r1 27.9 -> r5 57.7 (hull/whole 57.7, turret 70.7, stations 73.5, dims
98.4, floaters 100; final x2 numbers in the round log below). The
fidelity-page similarity metric reads 90.7 overall (gun 100, hull 91.9)
— the shape is RIGHT; the gate curve rows are bounded by the print's
-5.8% length stylization (plan rows structurally capped ~58 for a
published-dims build; see the r2-r4 findings above).

FORMAL REPAIR-LANE REQUEST (E-lane, warp law v2): uniform z-stretch
x1.0613 about the print's body mid (bodyZ [-3.138, 3.072] gate frame;
glbToGate in docs/references/vertex/bmp2.json — z-axis scale on both
meshes, root scale 0.1). Post-warp prediction: plan rows recover the
~-40 stylization tax, side rows drop their end-cover residual (~-9),
stations already fraction-normalized; the build as authored is
warp-ready (published dims, mid features at the print's own lines).
Verify against a stable proc build per §E before commit.

Owner-law checks at close: §B2 top-down flood 0 holes (standard-check
row in the round log); §B3 census: pintleMG (PKT, in-stack-band),
smokeBank x2, towCable, lightCluster x2, spareTrackLinks + hand-rolled
justified items (Konkurs launcher = identity hardware, firing ports,
doors); §B5 turret audit clean (Konkurs/PKT/smoke under rig_turret;
basket yaws with the turret like the print's); §B6 trapezoid: contact
z -2.10..1.50, raised front sprocket (y 0.77) + raised rear idler
(y 0.50), certified ~0.05-0.07 wrap bulge residual vs the print's
covered-run line; §B4 clip audit in the round log.

### AFV r1 FINAL LEDGER (2026-08-04, gate x2 identical)
min 57.7 | hullCurves 57.7 / wholeCurves 57.7 / turretCurves 70.7 /
stations 74.9 / dims 100 / floaters 100. standard-check: clip 0/0,
top-down holes 0 (§B2), census mg1+6d (§B3). turret-parent 0/0/0 (§B5).
Fidelity similarity 90.7 (gun 100). Geometry hash 3c496032 (54 meshes /
60080 verts). Oracle bytes ada5a1c7 (untouched). npm test 265 ok.
14-view archives: shots/visual-eval-bmp2/ (+ shots/afv-r1/bmp2-14view/),
overlay pair shots/afv-r1/bmp2_fidelity.png.
Worst remaining columns (side rows, workorder frame): the stern
end-stretch cover band (z -3.19..-3.42, ~3 cols/end) and the certified
§B6 wrap-bulge cols (z 2.4..2.6) — both retire with the requested warp;
plan rows carry the flat -40 stylization tax documented above. The
pre-warp gate CEILING for a published-dims build against this print is
~58 on plan rows; the lane hands over to the E-lane warp batch.

## Batch-39 warp EXECUTED (2026-08-04, orchestrator lane)
The r1 formal request landed as repair_oracles.py batch-39: uniform z
x1.0613 about the centred mask mid (long_map (-3.357,-3.5627)..(3.357,
3.5627) glb units), y identity, width untouched. Byte-idempotent
396cb021 x2; census 2/379253/149999 exact; verify height -1.3% (honest)
/ hullMask 0% / overall 0% / width 0% OK. Gate-in-loop vs the r1 57.7:
min 57.2 — RESHUFFLE, not crater: hull 57.7 -> 75.1 (the plan tax
released), whole 58.1, turret 68.6, stations 74.9 -> 57.2 (slice
re-phase debt — the ref slices moved with the stretch), dims 100 held.
AFV r2 re-anchors per the standard post-warp arc.

## AFV r2 — post-warp re-anchor (2026-08-04)

### Trajectory (gate x2 identical at close)
57.2 -> **78.7** | hull 75.1 -> 80.6 / whole 58.1 -> 78.7 / turret
68.6 -> 79.5 / stations 57.2 -> 87.6 / dims 100 (held, one mid-round
dip repaired) / floaters 100. Geometry hash 3c496032 -> dc28248
(54 meshes / 67136 verts). Oracle bytes 396cb021 untouched. npm test
265 ok. Evaluator digests: shots/visual-eval-bmp2/ (yawProxy <=1.5 deg,
no RIG MISMATCH).

### The r2 REGISTRATION LAW (bank-worthy, the round's central find)
The warped print fills the published envelope but its NOSE is
body-THIN (its 5 cm lip + converging prow columns fail the gate's
0.12*roughH body filter; its own front body column is z ~3.13, giving
its bodyLen read 6.589). dims law forces MY nose body-THICK to z 3.37
(hullLengthM is sovereign to the published 6.72), so the side rows'
bodySpan registration structurally settles at dAlong +0.076 — and the
gate then samples proc at z_r+0.076. CONSEQUENCE: every MID feature
(ring included: spec turretPivot z 0.03 of the allowed ~0.04) authors
FORWARD of the print line, the ends hold the envelope, and the tail
doors stay dims-pinned at -3.36 (they anchor the registration
fixpoint). Stations are PROC-FRACTIONAL and cap the shift: the dome
rear must stay inside its slab (pivot <=0.04) and the fender planks/
width carriers sit at proc fractions, NOT at the mapped lines — the
build now serves three frames at once (side: +0.076, plan/front: 0,
stations: proc-fractional).

### Slice-render laws confirmed/extended (§C bank)
- buildGun's tube is 12-seg at gate quality and RASTERIZES in the
  station slice renders where the print's smooth tube vanishes (st11/12
  read +17/+21). Fix pattern (also applied to the Bradley): SHORT
  buildGun stub ending inside a slab the ref also paints + own 28-seg
  smooth tube extension + P.muzzleZ restored. Slice paint is about
  FACET ANGLE, not thinness: 6-12-seg cylinders paint, 28-seg vanish;
  box z-faces paint, box side/top faces vanish.
- The gate station tops come from the SLICE renders, NOT the vertex
  registry's stations table (a different instrument — its st10 top
  2.018 misled the first collar anchor). Instrumented tmp copy of the
  fidelity page (tools/tmp-bmp2-fidelity.html) is the ground truth
  for station internals.
- Boundary-critical faces: the root collar's front face rode the
  st10/11 slab boundary (1.92-1.93) — parked 40+ mm clear per the §C
  15 mm law (slab bounds move with the proc span).

### Fresh warped anchors delivered (workorder/extract frame)
Stern rebuilt to the print's own profile: belly ledge 0.35->0.49 to
-3.09 (inter-track only — §B4), cliff to 0.96, upper step wedge, door
recess frame, tail doors y 1.135..1.555 with bulge tips -3.36 (the
tail columns stay >0.30 thick under ANY trace grouping — dims body
filter, AA shaves ~10 mm). Prow: covered-run plane A from (2.21,0.40)
slope 0.69, knuckle plane B to the (3.365,1.225) lip, nose lip band y
1.00..1.345 (the dims trade: ~2 tip columns +0.07 top / -0.16 bottom).
Bow corner wedges ride the print's plan step at x 1.07 then the
fender-tip diagonal to (1.545, 2.97). Six-rib glacis sawtooth at the
ref pitch. Gear: contact pinned 1.566/-2.094 (contactZF/ZR — the
default patch overhangs wheelR*0.5 past the last wheel), sprocket
(2.256, 0.80, 0.26) kissing the covered-run line, idler (-2.554, 0.60,
0.24) riding the ref's own wrap-bottom 0.21 read. Turret: cone
steepened at the base wall (ref front wall (1.0,1.66)->(0.95,2.0) is
NOT a revolution of its side profile — composite masses carry the
shoulders), basket z -0.50..+0.66 (raw ASCII read), riser crest
2.151 @ -0.81..-0.63, Konkurs tube top 2.39 z -0.49..+0.17, MG apex
2.47 on the ref's own spike columns, TKN-3 head at the ref's front
block (0.66, 2.288, z 0.15..0.36 + mount stalk — floaters caught the
corner-touch), gunner day-sight housing carrying the left-stack west
flank, 2A42 fat tube (r 0.055 — the print's fused band is 1.875..2.0)
to the ref muzzle 3.245.

### §B table at close
§B2 top-down flood 0 (bow fender webs close the r2-found corner
slits); §B3 census mg1+6d; §B4 clip 0/0; §B5 turret-parent 0/0/0;
§B6 trapezoid: raised front sprocket y 0.80 + raised rear idler y
0.60, certified wrap-bulge residual now ~0.03 on 1-2 approach
columns (the covered-run line is otherwise ridden exactly).

### Worst remaining columns (honest residuals)
side rows: the nose-tip dims trade (2-3 cols, ~0.14 mean each), the
tail door band vs the ref's thin tail sliver (1-2 cols ~0.16), stern
cols -2.6..-3.0 ramp/ledge class ~0.07; front rows: the roof-stack
saddle x 0.16..0.30 (my ring band vs the ref's fall-off, ~0.08),
x ±1.36-1.40 track-top corner (~0.08); plan rows 96.8. Stations:
st3 wPct ~10 (UNEXPLAINED against a matching probe read — trimmed
slot; suspect slice-vanish of the thin track walls vs the ref's
lumpy band), st11/12 topPct 3.4/0.9 residual rib phase. The honest
ceiling of this arc without another instrument-grade find is ~82-85;
>=90 needs the front saddle rebuilt and the stations wPct spread
(1.3-1.7 class) retired.
