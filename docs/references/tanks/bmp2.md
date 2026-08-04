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
