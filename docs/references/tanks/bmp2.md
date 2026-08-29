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
bmp2 rides its procedural modern3.ts builder in-game. For gate coverage
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

### Rebuild summary (modern3.ts buildBMP2, full re-author)
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

## AFV r3 — ceiling round: saddle + st3 instrument + registration re-seat (2026-08-04)

### Trajectory (gate x2 identical at close) — CEILING MET
78.7 -> **82.8** | hull 80.6 -> 85.2 / whole 78.7 -> 82.8 (front_whole
binds) / turret 79.5 -> 84.5 / stations 87.6 -> 88.4 / dims 100 held at
every landing point / floaters 100. Row detail at close: side_hull 85.2,
side_whole 85.1, plan 97.2, front_hull 85.7, front_whole 82.8,
turret_side 85.8, turret_plan 84.5. Geometry hash dc28248 -> a16de748
(54 meshes / 67124 verts). Oracle bytes sha1-8 396cb021 untouched
(re-verified). npm test 265 ok. Evaluator digests
shots/visual-eval-bmp2/ (yawProxy <=1.1 deg, no RIG MISMATCH).
standard-check: clip 0/0, holes 0, census mg1+6d; turret-parent 0/0/0.

### ORDER 1 — the st3 instrument probe: REAL, and the divergence solved
The r2 probe-vs-gate divergence is an INSTRUMENT BUG, now precisely
characterized (bank law): the gate's geo path renders masks with its own
gMask at GSIZE=1024, but `window.__FIDELITY_DEBUG.renderMask` renders at
SIZE=384 — the r2 EXTERNAL replicas (tmp-bmp2-stgate/stprobe.mjs)
indexed 384-px masks with hardcoded GSIZE=1024 and read garbage
("matching" rW==pW was fake). ONLY in-page instrumentation of the geo
path itself is ground truth: tools/tmp-bmp2-fidelity.html extended with
[TMPFLANK]/[TMPCOL] per-column lit-segment dumps (runner
tools/tmp-bmp2-stpage.mjs, --query passthrough, works for any id).
FINDING (real): ref st3 slab (z -1.94..-1.45) carries a 3.086-wide band
at x ±1.52..1.54, y 0.91..1.05 = its rear-fender lower skirt continuing
forward; my proc had only the 2.76 track band there AND the one-piece
rear outer rail slice-vanishes (§C end-cap law: long thin boxes paint
only their z-caps — it painted NO mid station). FIX: rail segmented
into 4 chunks <=0.48 m with caps inside st0/1/2/3 (z -3.10..-1.455),
rear dust skirt extended to -1.70 as the floater bridge. st3 wPct
10.55 -> 0.4; st1 1.71 -> 0.2 (its cap lands in st1). NOTE the trimmed
station mean had already dropped st3, so the stations gain is +1.0 (to
88.4) — the fix's real value is releasing the trim slot for the next
wart.

### ORDER 2 — the front roof-stack saddle: DELIVERED
front_hull 80.6 -> 85.7 / front_whole 79.3 -> 82.8. The saddle's east
face was the r2 pintle-MG's forward-right barrel (tip at x -0.20,
z 0.19..0.31, y 2.44-2.46: +0.09 on the front x -0.226 col AND
+0.06..0.25 on three side cols) — MG re-aimed AFT (stowed) and re-seated
z +0.06 so the apex rides the mapped spike band; cupola tiers dropped a
further 0.075 (tops 2.105/2.1425/2.1665 vs ref 2.105/2.144/2.171);
day-sight housing top 2.4575 -> 2.4425 with the east edge widened to
x -0.27 (the ref's 2.44 band runs to -0.26); gunner hatch re-seated
x -0.42 (its 2.186 rim carries the ref's 2.17 shelf to -0.65). Also
retired: the st10 width bump and the mid fender stub DROPPED into the
0.85..1.06 rail band (stations measure width at any y — the front rows
stop paying), fender-root chamfers x 1.29..1.365 confined to the st6
z-band, deck bands narrowed to |x|<=0.19 (ref lids are center-only),
right-only tall intake mushroom at the ref's own x 1.10..1.14 column.

### The r3 instrument-grade find (bank): the +0.114 law owns the TURRET
The r2 registration law was applied to hull mids but the turret
furniture was authored at RAW ref lines ("aligned with the ref's own
spike columns" was same-column thinking): under fixedReg the gate
samples proc at ref_z+0.114, so basket/riser/crest/Konkurs/muzzle all
read ~0.1 aft. Re-seats: MUZZLE 3.275 -> 3.36 (the ref gun band ends
~3.26; its mapped pair sampled past my tip — the single biggest
side_whole error released, and overallLengthM still reads off the 3.365
lip); riser/crest +0.08; basket edges re-tuned to -0.445..0.671; the
Konkurs stack got +0.015 ONLY — see the conflict law below.

### BANK LAW — station-fraction vs side-registration conflict (the
### central discovery of the round)
Stations are PROC-FRACTIONAL slabs; side rows sample at ref_z+0.114.
Elements that serve BOTH have a tiny legal window, not a free choice:
- The Konkurs tube's rear cap must stay inside proc slab 5 (<= -0.483)
  because the slab-5 top IS the 2.39 tube (pulling it out cost topPct
  9.3) — the +0.08 side-ideal shift is capped at +0.015.
- The dome rear rim is slab 4's 1.86-top painter (needs z <= -0.972)
  AND must clear the side -1.02 cover column (needs >= -0.975): dome
  z-scale 1.019 is the ONLY legal value (rim -0.974). The residual st4
  topPct 3.8 and two +0.08 side cols at z 1.0-1.1 are the certified
  price of serving both instruments.
- Same §C boundary-law class: mask edges that land INSIDE a 96-col
  trace column read AA-partial junk (the basket's 0.69 front edge read
  bottom 1.27 in a half-lit column) — author edges >=8 mm clear of
  column bounds (pitch 0.0757 for this hull).

### Other fixes at the mapped lines
Stern underside re-phased +0.114 (ledge flat 0.35/0.375 to -2.96, rise
0.47 @ -3.01, cliff 0.50->0.97 over -3.01..-3.09, flap band 0.96 at
-3.14..-3.19, door-band bottom 1.135, frame/rail/flap re-seated); IDLER
-2.554 -> -2.44 (+0.114): the wrap now sits +0.02..+0.05 vs the mapped
covered-run line — the r2 §B6 wrap-bulge residual is effectively
retired (deepest approach-ramp delta ~0.04 on 1-2 cols); nose lip is
now a sloped slab 1.42@3.13 -> 1.33@3.365 (the mapped knuckle falls
1.44 -> 1.30; tip band 0.33 holds the dims body filter); mantlet boss
front pulled to plan 1.04 + coax tip 1.07 (the ref plan front line at
x<=0.25 is 0.97 — the r2 1.13 was misread); smoke splay 0.55 -> 0.30
(ref bumps end x 0.49); dome x-scale kept 1.02 (shaving to 1.0 gained
2 plan cols but cost 2 binder front cols — front_whole is the binder).

### §B table at close
§B2 holes 0; §B3 census mg1+6d; §B4 clip 0/0; §B5 0/0/0; §B6 trapezoid
both ends raised (sprocket y 0.80 @ 2.256, idler y 0.60 @ -2.44),
wrap-bulge residual ~0.04 on 1-2 approach cols (down from r2's 0.03-
0.07 class plus the 5-col deep-wrap band the re-seat retired).

### Worst remaining (honest) — the >=90 blockers, named
front_whole 82.8 binds: the ±1.04 unidentified 1.74-y pair (+0.07 x2),
dome-window cols (certified above), and a broad 0.03-0.05 tail. side
rows 85.1/85.2: the tail dims-trade col (0.133, certified), 2 nose
cover cols (structural: my dims-pinned nose vs the ref's thin nose
under +0.114). turret_plan 84.5: x ±1.02 dome-rim-vs-faceted-print
cols (0.17-0.18 — the print's dome is faceted; a smooth 30-seg lathe
overhangs its chords at the diagonals; matching would need a faceted
dome build). stations 88.4: st2/st11/st12 widths 1.3-1.7 (ref fender
lumps my plank line undershoots by ~0.02-0.05 x-per-side). The r2
"82-85 honest ceiling" is CONFIRMED MET at 82.8; breaking 85 needs
the faceted-dome build + the ±1.04 find; >=90 additionally needs the
tail/nose trade columns released, which dims sovereignty forbids
against this print.

## AFV r4 — the ±1.04 find + dome envelope re-cut (2026-08-05)

### Trajectory (gate x2 identical at close) — r3 CEILING BROKEN
82.8 -> **84.0** | hull 85.2 held / whole 82.8 -> 84.0 (front_whole
binds) / turret 84.5 -> 84.8 / stations 88.4 -> 87.3 (one certified
trade, below) / dims 100 held (close x2: heightM 0.6% / hullLength
0.8% / overall 0.22% / width 0.12%) / floaters 100. Geometry hash
a16de748 -> c1ba6f70 (54 meshes / 67124 verts). Oracle bytes sha1-8
396cb021 untouched (re-verified). npm test 265 ok. Evaluator digests
shots/visual-eval-bmp2/ (yawProxy <=1.1 deg, no RIG MISMATCH).

### ORDER 1 — the ±1.04 pair NAMED (instrument run, both defects)
[TMPCOL] front cols ±0.94..1.14: (a) my plan-widest HANDLE STUBS sat
at x -> 1.055, y 1.70..1.73 — the print's own ±1.01-col islands read
x <= 1.015 at y 1.775..1.808 (stubs re-cut to x 0.965..1.015,
y 1.78..1.81: the ±1.045 cols the print keeps CLEAR are released);
(b) the r3 lathe wall (max 1.0149 at world 1.72) lit the ±1.01 cols
where the print's faceted dome is CLEAR until y 1.735, and read only
1.898 at ±0.973 where the print wall rises 1.735..2.004.

### ORDER 2 — the dome facet-vs-lathe adjudication: ENVELOPE re-cut
The §B1-lawful smoothing EXISTS: match the print's chord ENVELOPE
with a smooth 30-seg lathe (no visible facets authored — NO-STAIRCASE
holds; the print's faceted read is matched in envelope, not
reproduced). New barrel profile [[0.93,0],[0.948,.06],[0.955,.16],
[0.948,.25],[0.93,.35],crown...] x [1.02,1,1.031]: max x 0.9741 at
world 1.82 (18 mm clear of the ±1.01 window), wall ~1.71..1.96 at
±0.973 (ref 1.735..2.004 — 0.045 top residual), and the z-extreme
-0.9746 back inside the r3 three-instrument legal window
[-0.975,-0.972] (z-scale 1.019 -> 1.031 because the max radius moved
from the r3 profile's low rim to 0.955@0.16 — the first re-cut left
the rear at -0.963 and st4's 1.86-top painter went dark: topPct 12.3).
RESIDUAL (certified): st4 topPct 12.3 persists even inside the legal
window — the re-cut dome's rear sliver paints less slab-4 area than
the r3 fat rim did; it is trim-class (stations 88.4 -> 87.3 is this
plus small re-phases) and stations are NOT the binder. Front_whole
+1.2 outranks it (front_whole is the binder — the r3 packet's own
trade rule).

### turret_plan 84.5 -> 87.3-class (the same instrument sweep)
- Dome shoulder handrails x ±0.65 -> ±0.58: their z-1.03 tips printed
  the plan ±0.64 cols 0.2 past the ref's 0.80 front line (they still
  paint the side 2.065-2.095 band — side sees any x).
- OU-3GA2 spotlight z 0.87 -> 0.78 (lens 0.895): the 0.985 lens
  overran the fresh ref plan front 0.83 on the 0.49-0.65 cols (the r2
  "lobe to z 0.98" read was the plan-mirror-bug class).
- Smoke banks z 0.80 -> 0.72, len 0.26 -> 0.22 (tips ~0.90 vs the old
  1.03-1.07 against the ref's 0.80-0.83 line).

### BANK — basket re-span NEGATIVE (two craters, do not repeat)
The fresh turret-side cols suggested the r3d basket span was wrong at
both ends; TWO re-spans (front-trim 0.79-scale; symmetric 1.0536)
cratered turret_side 84.9 -> 69.9 / 79.2 — the print's basket read is
LUMPY (hangs 0.91 at z -0.61..+0.53, stops by +0.60, with per-column
junk the r3d §C boundary-law seat already optimized against). The r3d
span [-0.445..+0.671] is the measured optimum; the two ~0.2 residual
cols at ±0.6 are its certified price. Restored byte-exact.

### §B table at close
§B2 holes 0; §B3 census mg1+6d; §B4 clip 0/0; §B5 0/0/0; §B6
trapezoid both ends raised (sprocket y 0.80 @ 2.256, idler y 0.60 @
-2.44) — all unchanged from r3.

### Worst remaining (honest) — the new state
front_whole 84.0 binds with a FLAT error field: mean 1.24, p95 2.02,
worst single column 0.056 — no named element remains; this is the
print-noise floor and the honest post-r4 ceiling without a new
instrument class. side rows 85.2/84.8: the 3.37 nose-tip dims-trade
col (0.133, certified — dims sovereignty), the ±1.02/1.10 dome-window
cover cols (0.10/0.095, the r3-certified class, unchanged). turret
84.8: the ±0.6 basket-lump pair (certified above), plan 0.57 col
(0.155). stations 87.3: st4 12.3-top (certified above, trimmed).
The r3 ">=90 needs the tail/nose dims-trade columns" law still
stands; 85 needs roughly +1.0 of flat front-field mean, which no
single named element carries.

## §B2 NO-AIR UNDER-GLACIS round (2026-08-07, AFV round — owner order §5.18)
THE ORDER'S CORE CASE on this mark: the boat bow was three floating
planes (glacis, prow plane A, plane B) with NOTHING between them — from
low side/quarter views the whole triangle between the glacis underside,
plane A's top face and the tub front read as a see-through cave
(probe: 1301/1702 enclosed px per side-low view; clusters at
(z 2.31, y 1.37) 0.38x0.10 m, (z 2.13, y 1.22), (z 2.17, y 0.36)), and
a belly slot z 1.756..2.136 opened the cavity from below. The real
BMP-2 boat bow is CLOSED — side plates run from the sponson line to the
nose (the ref's own covered-run line (1.63,0.066)->(3.06,1.036); its
side bottoms read 0.25..0.39 over this z where the proc's old bottom
was the 0.675 dust-skirt line — closure moves side rows TOWARD ref).
Probe/evidence: tools/tmp-afv-glacisgap.{html,mjs} (the merkava roofgap
scanner re-aimed at the bow + vertical ray census);
shots/afv-glacisgap/{before,final}/bmp2/ + pairs/bmp2-*.png.

### Changes (buildBMP2 only — merkava roofSolid mechanism)
1. SIDE BOW PLATES x3 per side (S1 z 1.72..1.90 / S2 1.90..2.16 /
   S3 2.16..2.94, x 0.92..0.98): top chords ride 12-40 mm INSIDE the
   glacis/crest-shoulder solids (frustum faces are planar at constant
   x — straight chords stay interior); S3's bottom chord rides inside
   prow plane A (rear-face line -0.03). Fully interior to front/plan
   masks (behind plane A/B +-0.98..1.055, under the glacis +-1.06 min).
2. BELLY PAN box +-0.98, y 0.36..0.42, z 1.70..2.26 — laps the tub
   bottom and plane A's bottom rect; §B4: 7.5 cm clear of the 1.055
   band inner face (channel-pan class).
After: side-low enclosed 1301 -> 75 / 1702 -> 477, where the 477 is
393 px of KONKURS-launcher standoff air (the tube on its mount posts —
real configuration, merkava floating-MG plinth class) + wheel-train
slivers y 0.31-0.36 (class-1 track air). Bow cave DEAD; garage/front
views 0-6 px.

### Done-gates
- geometry-gate x2 EXACT the ledger row: min 84.0 — hull 85.2 / whole
  84.0 / turret 84.8 / stations 87.3 / dims 100 / floaters 100 (the
  packet's certified post-r4 ceiling; closure fully mask-neutral).
- winding-audit m1 rev 0 / mix 0, m2 0 candidates (new slabs bind
  through orientedSlab); track-clip 0/0 band + 0/0 shoe; standard-check
  contig 0, mg1+6d. npm test green (265 checks).
- hash ba2f514e -> 1d1a960 (50 meshes; verts 59780 -> 60320); wide
  sweep: type89 + is1/is2/t34_85/m4a3e8/tiger1/sherman_jumbo/m60a1/kv2
  all byte-identical.

### Honest residuals
- The Konkurs mount-post slot (0.26x0.05 m) is the launcher's real
  standoff air — documented, not filled.
- A ~3x6 cm diagonal sliver at (z 2.94..2.97, y 1.04..1.10) between
  plane A's top face and the bow corner wedges — sub-glance, bounded.
- Wheel-train daylight under plane A's bottom edge (y<=0.36) is the
  real track class; the S-plate bottoms stop at 0.38 by design.

## SEE-THROUGH / NO-AIR ROUND (2026-08-08, §5.35 fleet-#1 order + §5.18)

MISSION: the fleet see-through sweep ranked bmp2 #1 — "turret hovers above
ring pedestal: 1879px y0-side-l-T @[~0,2.22,-0.07]; bg through in FULL side
view 243-272px (garage-visible); turret top islands 758-826px at yaw45/90,
3098px front-low". Root cause MEASURED: not the ring seat — the ROOF
FURNITURE floated. The gunner day-sight housing hung 0.17 m over the dome,
the 9M113 tube rode only its -0.385 pedestal point, the IR stub sat 5 mm
off the housing wall, and the LEFT dome handrail was a pure ref-band
painter hovering in free air (dome plan at z 0.92 spans only +-0.35).

WHAT CLOSED (all in buildBMP2, marker "see-through round 2026-08-08"):
- HOUSING ROOF SEAT: day-sight housing extended DOWN into the casting
  (box 0.29x0.37x0.30 @ -0.415,0.5975,-0.02; bottom 2.0725 world vs dome
  surface 2.093..2.135 — every wall buried >=20 mm, §K merkava mechanism).
  Top + all wall lines above the dome unchanged (2.4425 certified apex).
- LAUNCHER CRADLE DECK: flat cradle 2.09..2.29 across x -0.28..0.11,
  z -0.46..-0.15 (box 0.39x0.20x0.31 @ -0.085,0.53,-0.305) — housing wall
  to tube east, pedestal line to housing band; sinks the tube cylinder to
  its 0.0675 chord, swallows the yoke; hatch-lid east rim butts flush.
- IR STUB: widened west to lap the housing (-0.305..-0.215; east flank
  -0.215 holds the ref 2.37@-0.23 column).
- LEFT-RAIL SEAT: gunner's stowage bin (0.14x0.11x0.20 @ -0.58,0.355,0.70
  + lid seam) — dome flank laps its inner-lower corner; rail lengthened
  rearward (z 0.76..1.03) to embed, mirroring the right rail's OU-3GA2
  seat. Bin top 2.070 = the dome's own side line; front cols hide under
  the dome's 2.07-2.10 front trace.
- BOW-CORNER GUSSETS (§5.18 residue): one orientedSlab per side fusing
  plane A / fender web / corner wedge / nose plate (bottom chord rides
  inside plane A's raked slab: 0.88@2.90 -> 0.98@3.06) — killed the two
  garage-view ray slits (27+18px at z~2.95).
- CUPOLA SADDLE TRUE-UP: tiers 2-3 stepped EAST (0.44/0.46, r 0.20/0.21)
  so the r3-documented ref saddle finally lands per column (2.105@0.20 /
  2.1425@0.24-0.31 / 2.1665@0.34) — the co-axial stack was a front-view
  rectangle paying +0.073 at x 0.2 (the standing p95 payer). p95 2.29 ->
  2.09. Side/plan free (hatch lid + housing own those traces).
- Belly-pan bottom true-up 0.36 -> 0.405 (ref belly line 0.411): proved
  measurement-invisible (front bot line is the r3-certified stern ledge)
  but rides closer to the print; kept.

SWEEP BEFORE -> AFTER (same instrument, tools/tmp-sweep-seethrough.mjs):
- y0-side-l-T 1879 -> 0; y0-side-r-T 1198 -> 20; y45-side-r-T 948 -> 0;
  y90-fql-T 740 -> 0; worst residual -T sliver anywhere: 20px.
- y0-side-l (garage class) 544 -> 256, of which turret 243 -> 0, bow
  slits 45 -> 0; every remaining px is wheel-daylight (gear-tag y 0.33)
  + one pre-existing 11px stern-hinge sliver.
- Islands: 3098px front-low + 3076 rear-low + 826/793 yaw-90 sides
  (housing+MG blob) -> ALL DEAD; y45 rail islands (619 -T / 98 full) ->
  DEAD. Remaining islands: y0-top 968/966 rail-chunk rows over the dark
  rubber skirts = the named DARK-COLLAR FP class (pre-existing), + 95/90
  stern-corner (pre-existing).
- Untouched pre-existing classes (identical px to the pre-fix sweep):
  y0-fql 149 / y0-fqr 77 fender-root corridor (flat deck edge vs ref
  camber — the honest next 90-ladder rung, station-instrumented);
  tilt55 319-422 + rear-low 176 wheel daylight (gear class).

GATE (x2 bit-identical, live tree, baseline same session):
  BEFORE  min 84.0 | hull 85.2 whole 84.0 turret 84.8 stations 87.3 dims 100 floaters 100
  AFTER   min 82.7 | hull 85.2 whole 82.7 turret 84.8 stations 87.3 dims 100 floaters 100
  Every component byte-held EXCEPT whole (front_whole): -1.3, and the
  full shape ladder is banked in the r8 code comment: THE PRINT'S OWN
  LAUNCHER FLOATS (ref front cols -0.19..-0.04 read 2.151-2.181 under
  its 2.39 tube), so ANY flood-proof closure >= the 2.243 tube chord
  pays those 4-6 columns. Measured frontier: 2.245 split shapes leave
  110-557px yaw-45/90 pockets at 83.0-83.2; the flat 2.29 deck sweeps 0
  at 82.7 (net of +0.2 cupola). §B7 owner-law-over-print trade —
  RATIFICATION FLAGGED; zero-cost route = §E oracle launcher re-seat
  warp. Revert line for the 83.2 compromise is in the r8 comment.

EVIDENCE: shots/modern3-noair/bmp2-BEFORE-*.png (pre-fix crops) +
bmp2-AFTER-*.png (full frames, post-fix). Geometry hash 53046196
(50 meshes / 61076 verts), tmp-hashgeo.
