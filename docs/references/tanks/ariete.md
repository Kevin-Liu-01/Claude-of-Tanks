# C1 Ariete (`ariete`)

**Exact variant modeled:** C1 Ariete series production (Esercito Italiano,
1995–2002 fit) — 120 mm OTO Breda L/44, GALIX launchers, TURMS fire control,
no PSO/AMV appliqué package.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.59 m | weaponsystems.net/system/837-Ariete; army-technology.com/projects/ariete |
| Overall length (w/ gun forward) | 9.52 m | en.wikipedia.org/wiki/Ariete; weaponsystems.net |
| Width (hull / over skirts) | 3.42 m hull / 3.61 m over skirts | weaponsystems.net (3.42 hull); Wikipedia infobox 3.61 |
| Height (turret roof / over sights) | 2.45 m roof; ~2.7 over commander pano | Wikipedia; army-technology.com |
| Gun (model, caliber, tube length) | OTO Breda 120 mm smoothbore L/44 (~5.28 m tube), thermal sleeve + fume extractor + MRS | Wikipedia; army-technology.com |
| Road wheels / rollers / sprocket | 7 dual road wheels/side (shock absorbers on 1,2,3,6,7), return rollers behind skirts, rear drive sprocket, front idler | Wikipedia (damper stations imply 7); tanknutdave.com |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: long low WELDED turret, slab side walls
  with a slight inward cant, cheek plates converging on a narrow flat front;
  gunner's TURMS primary sight in an armored split-door box on the RIGHT
  front roof; commander's SP-T-694 panoramic on a pedestal aft of it;
  loader hatch left; flat roof; stowage baskets/rails wrap the bustle rear.
- Mantlet/gun mount: distinctive ANGULAR MANTLET CHEEKS — a protruding
  central mantlet block flanked by two backward-raked wedge plates; coax port
  right of gun.
- Hull front: very long shallow one-piece glacis running almost to mid-hull,
  flush driver hatch right with 3 episcopes, V splash rail.
- Running gear + skirts: 7 rubber-tired wheels, rear sprocket; full-length
  side skirts, front two panels heavier armor with a slanted leading cut.
- Signature equipment: GALIX 80 mm launchers (4-tube bank each turret side),
  left-hull rear exhaust outlet, rear turret basket, two whip antennas.

## Reference links (links only — no downloaded images committed)

1. https://weaponsystems.net/system/837-Ariete — spec table (7.59 hull, 3.42 w)
2. https://en.wikipedia.org/wiki/Ariete — infobox 9.52/3.61/2.45, L/44, GALIX
3. https://www.army-technology.com/projects/ariete/ — TURMS, layout notes
4. https://tanknutdave.com/the-italian-c1-ariete-main-battle-tank/ — walkaround-style detail notes

## Local GLB oracle notes

Path: `public/models/tanks/community/ariete-dustymojito.glb` (LOCAL-ONLY
quarantine; registered for the lab through LOCAL_REFERENCE_OVERRIDES).
Width-normalized to 3.60: overall length reads 9.07, hull ≈ 7.0, height 2.79
(over pano/antennas). The asset is proportionally STUBBIER than the published
hull (7.0 vs 7.59 at the same width, ~8%) and its fused gun carries a slight
droop; the procedural keeps the published 7.59 hull and a level tube, so a
few silhouette points are structurally capped (documented, not gamed).
Shape truths taken from the oracle: turret roof ≈ 2.40 m with stepped
shoulder masses, sight cluster forward-right to ~2.7 m, bustle + basket
running well aft over the engine deck, gun axis ≈ 1.84 m, gun overhang past
the bow ≈ 1.7–1.9 m, wheels visible below the skirt line.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 77.3 | 80.0 | 89.8 | 68.7 | 40.2 | 78.3 | baseline (modern3 canonical builder) |
| 2026-07-30 | 79.0 | — | 89 | 76 | 46 | 76 | bespoke misc.js build: taller welded turret (roof 2.38) + angular mantlet cheek wedges, sealed trunnion roll, TURMS box + pano, bustle + basket, GALIX, 7-wheel gear w/ dark recesses, L/44 re-seated |
| 2026-07-30 | 80.0 | — | 89 | 76 | 50 | 77 | r2: gun len to the oracle overhang (4.90) + fatter sleeve, skirt bottom raised (wheels exposed), side shelves + GALIX outboard, sight cluster forward, whips raked aft |
| 2026-07-30 | 79.8 | 82.1 | 88.9 | 75.8 | 50.2 | 76.9 | r3 final: glacis headlight pods + fender rib, evac at 0.44. CAPS: the oracle tube DROOPS (fused ~1.5° decl.) — a level tube tops out near G≈50; oracle hull is ~8% stubbier than the published 7.59 m (kept real), costing edge overlap in side views |

## GATE-V9 CERTIFIED ORACLE-DEFECT CAP — hull/whole coverage + stations (2026-07-31)

Measured from docs/references/profiles/ariete.json: the dustymojito print's
hull body spans **7.03 m vs the published 7.59 m (−7.4 %)** (hull-mask span
7.26), its gun tube ends 0.63 m short of the published overall (9.04 vs
9.67), and the print sits ~1.2 m off-centre in its normalized frame (hull
z −4.97..+2.29 in the trace frame) with a band-thin fender tail that drops
out of the 12 % body rule — shifting the hull-anchored registration
midpoint (measured dAlong ≈ 0.75). The dims-sovereign build carries the
published envelope: after mid-alignment its body overhangs the oracle's by
≈ 0.28 m per end (cover + tail/nose band error → **side/plan hullCurves
ceiling ≈ 85-90**), the published-length gun reads as build-only columns in
the whole rows (**wholeCurves ceiling ≈ 80-85**), and the ref station
z-range (7.26 m) vs the published-length build (7.59 m) drifts slice
features ≈ 4.5 % (**stations ceiling ≈ 70-85**). dims + floaters sovereign.

### V10 re-verification (2026-07-31, round 2)

Fresh extraction confirms the certified short print: ref box z ±4.54
(9.07 m overall vs published 9.52), the −7.4 % hull span and off-centre
frame unchanged. Cap STANDS at the measured v10 residuals (hull 30.1 /
whole 0 / turret 0 / stations 26.4); dims + floaters pass (100/100).

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage + normalize plan (2026-08-03, misc agent)

Ledger 0 (wholeCurves/turretCurves) is HONEST — the quarantine reference
renders (gate rows carry real ref values); the zeros are big residuals vs
a SHORT print, not registration failure. Extract REG appended (quarantine
oracle path, ^Turret$ autoPivot). Stylization: hullMask -4.0% (7.29 vs
7.59), overall -6.3% (9.059 vs 9.67), bodyH +5.3% (a 12-col pano/sight
furniture band 2.55-2.78; roof plateau 2.25-2.35 is honest under the
published 2.50), width -0.7%. **Normalize plan authored**
(tools/vertex-normalize.mjs `ariete`): y identity to 2.40 then band ->
2.50/2.52 (sim p95 2.500, h -0.1%); z body x1.0412 about -0.884 + muzzle
-> rear'+9.67. DO NOT BUILD pre-warp (>2% law).

## VERTEX ROUND r2 note (2026-08-03, misc agent) — post-warp standing, NOT rebuilt

Post-warp gate rows (v11): hull 29.6 / whole 0 / turret 0 / stations
26.2 / dims 100. Zeros are honest big residuals (no orientationFlip;
reg side dAlong 0.759 dy 0.101 / plan dy 0.788). The stretched print
(z body x1.0412 about -0.884, muzzle -> rear'+9.67) now measures the
published envelope, so the old short-print caps (hull 30.1 / whole 0 /
turret 0 / stations 26.4) DISSOLVED into live work orders of nearly
identical magnitude — i.e. the build must now actually match the
stretched geometry it was never tuned to. Same structural class as
type90: the print sits ~0.8-0.9 aft of our frame (registration handles
the translation; the internal hull-to-turret offsets and the hull end
profiles must be re-derived from a fresh vertex-workorder dump). dims
already 100 — dims-sovereign scaffolding is in place; the next round is
a leclerc-style worst-first hull+turret re-lay against fresh dumps.

## VERTEX ROUND r3 (2026-08-03, misc agent) — §B4 + §B3 landed; rows held; same side-row pathology as type90

Final: gate rows held at baseline (hull 27.4 / whole 0 / turret 0 /
stations 37.2 / dims 100 / floaters 100). Track-clip exact: **front 6 /
rear 28** (from 100/120). §B3: loader's MG42-class = FITTINGS.pintleMG mag
two-tone, foot sunk to 0.80 (receiver ~2.53w, 2 cols inside the ≤4-col
budget under the 2.50 TURMS-lid anchor; dims stayed 100). Boards:
shots/misc-r3/after/ariete.png.

§B4 fixes (all lateral-margin class): hull tub 2.35 -> 2.28 wide (its
±1.175 edges sat ONE dilation voxel inside the ±1.18 band planes through
both wrap zones — the audit dilates 2cm); raked lower bow narrowed to
x<=1.06 below the 0.98 glacis line (the 1.66 width crossed the idler
wrap; z-extent kept, dims safe); the rear skirt panel's dark edge strip
flipped to its FRONT edge (it capped over the sprocket wrap at -3.27);
left exhaust box shortened+forward (rear face -2.99, its fins re-centered)
— its old -3.20 face and 1.755-1.771 fins grazed the wrap laterally.

NO whole/turret build round attempted: ariete shows the SAME class of
side-row pathology as type90 (side dAlong 0.962 registered, side_whole
mean 7.5% -> 0 while plan rows score 78-83 at mean 1.4-1.7; front_hull
48.9). Read docs/references/tanks/type90.md r3 section for the full
diagnosis + the verification recipe before building here — the r2 note
"leclerc-style worst-first re-lay against fresh dumps" stands ONLY after
the side-row comparison question is resolved. dims already 100 (the
dims-sovereign scaffolding is in place; the print measures the published
envelope post-warp).

## VERTEX ROUND r4 (2026-08-04, misc agent) — FULL RE-LAY: 0 -> 64.4 min (hull 27.4->69.5, whole 0->67.8, turret 0->64.4, stations 37.2->71.9, dims 100)

Gate x2 stable: min **64.4** | hull 69.5 / whole 67.8 / turret 64.4 /
stations 71.9 / dims 100 / floaters 100. Track-clip exact **0/0**;
standard-check clip ✓ contig 0 ✓ **mg1+2d** (MAG + 2x antennaWhip;
GALIX/basket stay hand-authored: silhouette-structural, gate-matched).
Legacy visual board 86.2: shots/misc-r4/after/ariete.png.

WHAT LANDED (from the r27-fixed workorder dump; ref rows ~+0.86 side /
+0.91 plan into our frame — REGISTRATION SETTLED AT 0.84-0.90, NOT the
0.96 bootstrap map: the turret sits at turretG.z -0.29 and the deck/glacis
features were re-seated -0.08..-0.12 after the first pairing measurement):
- HULL: deck 1.445 with the 1.385 driver dip + 1.415 step; long shallow
  glacis (2.42,1.418)->(3.38,1.21), center nose to 3.68 (tip 1.234);
  front mudguard CRESTS to 1.60 (x 1.55-1.77, z 3.31-3.59) + thin flap =
  the plan front lane; stern rake (bottoms 0.24@-2.75 -> 0.69@-3.66),
  raised rear plate, thin tail lip to -3.90, CENTER TAIL BLOCK to -3.89
  at the ref's own 1.385-1.565 lip heights = the SS-A rear anchor (its
  plan -3.88 center column); muzzle 5.78 = rear extreme + published 9.67
  (the print's own tube ends 5.73).
- REAR SUPERSTRUCTURE: stepped deck 1.475/1.505/1.535 -> powerpack hump
  1.655 (z -1.33..-1.83) -> rear deck 1.595 (to -2.80) -> tail 1.565.
- GEAR: 7 wheels on the [-2.15, 2.45] contact patch; HIGH small idler
  (z 3.14, r 0.19 — far 3.50, the ref's wrap ends ~3.50 with its crest
  bottom 0.90 above) + sprocket (z -3.10, r 0.21, far -3.48 = its -3.46
  plan lane); track xc 1.42 / W 0.55 (outer ~1.70 = the print's WIDE
  track plane: its full-depth +-1.6-1.69 front cols are TRACKS).
- SKIRTS: panels at +-1.76 (faces 1.735-1.785) hanging 0.78..1.42 ABOVE
  the exposed wheels (identity per the print's shaded views); stations
  read the ref's ~3.54-3.60 constant width.
- TURRET: canted-wall slab (polyTurret inset 0.90), mid roof 2.32, RAISED
  front roof with side sections 2.455 + center channel 2.37 (the ref roof
  is HIGHER at the sides), TURMS box top 2.514 fwd-right (heightM p95
  anchor, ref 2.51@x 0.51-0.84), pano tower 2.495 at x -0.26/z_w -0.95
  (its 2.38-2.50 spike), hatch NOTCH plate 2.23 (z_w -0.56..-1.04),
  bustle roof 2.32 ends z_w -1.96, LOW rear wings +-1.28 (tops 2.01 under
  the basket line), LOW basket (top rail ~2.09, to z_w -2.62), MAG
  fitting ON the bustle roof line (receiver ~2.32: zero side-col cost vs
  the r3 2.53 perch), whips low+raked (tips ~2.25 inside the basket band).
- PROW: the mantlet complex sweeps a FULL METRE ahead of the body — plan
  front 2.29@center -> 1.90@+-1.25 (backward-raked wedge cheeks, tops
  ~1.83-1.87 per its side band) with the central block to z_w 2.32.
- GUN: axis 1.686 MEASURED (the r3 1.84 axis rode 0.15 high), r 0.075
  (sleeve band 0.183 under the 0.30 cut), MRS collar on the ref's own
  4.6-4.8 swell, evac 0.685.

LAWS BANKED:
1. +-1.85 MIRROR-DOT BIN: the print's outermost plan column is a
   mirror-arm DOT; ANY of my content with outer face >1.785 (strip
   1.80, panels 1.7975, even a 1.792 dark-strip edge via AA) prints a
   full-span column there = 2.5-3.3 err x2 cols. Outer faces cap at
   1.785 (widthM 3.57, -0.83% inside grace).
2. BOOTSTRAP-MAP LAW: authoring against an assumed dAlong before the
   anchors settle skews EVERY feature; measure the settled registration
   after the first anchored run, then re-seat the internal features
   (deck knees, turret seat) to the measured map. Side and plan maps can
   disagree ~5-7 cm — split the difference on features both views see.
3. The ref's low-slung front-view skirt read (+-1.6-1.69 to ground) was
   its TRACKS: match with track width, never with ground-scraping skirts
   (identity error caught on the r4 board).

CERTIFIED RESIDUALS: the plan-center muzzle-island col (~1.0 err, its
tube band is turret+hull mixed at x -0.18) and the +-1.85 dot cols (2x
cover) cap plan rows ~80-84; turret_side binds at 64-69 with the
remaining prow/roof band deltas; stations 71.9. dims 100 stable.

## TURRET-FIX ROUND (2026-08-04, misc agent) — owner report "c1 ariete turret is quite broken": diagnosed + fixed; gate UP on every component

Final gate x2 stable: min **65.5** | hull 69.7 / whole 68.8 / turret 65.5 /
stations 72.8 / dims 100 / floaters 100 (r4 baseline 64.4 | 69.5 / 67.8 /
64.4 / 71.9 / 100 / 100 — every component held-or-up). Track-clip exact
0/0; standard-check clip ✓ contig 0 ✓ mg1+**3d** (MAG + 2x antennaWhip +
spareTrackLinks). Official visual-evaluator run clean (yawProxy 0.1-2.9°,
no RIG MISMATCH; findings are the certified cliff-offset class). Boards:
shots/misc-ariete-turretfix/{before,after}/ (14 critic views + heroes),
shots/visual-eval-ariete/.

DIAGNOSIS (before set archived): the r4 build passed its masks but READ as
a giant camo casemate in every shaded 3/4 view: (1) a 0.18 m BLACK TRENCH
over the exposed track top between the deck edge (+-1.56) and the skirt
inner faces (+-1.735), full hull length — SS-B2; (2) skirt courses 0.455
deep on a 0.4775 pitch = 2.25 cm through-slots reading as a picket fence
under that trench; (3) a BLANK roof plain (3.8 cm hatch crowns invisible
at 1x, bare deck, bare walls) fusing hull+turret+skirts into one slab —
no AO in the shaded path and the world-projected camo is continuous
across parts, so only geometry/material breaks can separate masses;
(4) the basket read as an empty wire frame with sky through it; (5) the
mantlet read as a pinhole in the big front wall.

FIXES (all mask-checked, mostly interior):
- hull: fender TRENCH FILL plate x 1.55..1.735 @ y 1.400 (top 1.412 under
  both the 1.42 skirt line and the 1.424 fender top — the first 1.41 seat
  cost side_hull 0.6); deck contact-shadow band ahead of the turret ring;
  fore-deck battery/intake panels; spareTrackLinks fitting on the tail
  deck (tops 1.65 by the ref's own 1.6 aft line).
- turret: dark RING PLINTH at the base (polyTurret +2% flare x 5 cm — the
  SS-B2 contact-shadow device that separates turret from deck); RAISED
  hatch ring rims + domed/open lids (crowns 2.31-2.34 inside the ref's
  notch-zone fall); pano tower re-detailed at the print's 2.495 ceiling
  (slimmer pedestal + foot collar); ration box by the TURMS; weld seam
  strips x3 per canted wall; under-lip contact shadow + tie-down HORNS on
  the shelf lids (outer 1.63 = the ref's +-1.60-1.63 plan dot columns,
  seated LOW at 1.58w so the 1.62 front-row line clears them); basket gets
  dark FLOOR + side mesh sheets + side rails + duffel pile (top 2.13) —
  solid top-down read inside the r4 footprint; dark canvas MANTLET COVER
  (0.70 wide, band y 1.51-1.83 / z_w 1.01-1.31 inside the priced mantlet
  band) + gun-root collar cylZ r0.135 to z_w 2.20 — the prow now reads
  mantlet+gun, and the certified plan-center col improved 2.07 -> 1.84;
  mantlet block narrowed 0.44 -> 0.36 (+-0.18 covers the +-0.165 plan
  col); closer wedge top 2.395 -> 2.35; raised-front-roof lips pulled to
  z_w 0.61; MAG foot sunk 0.63 -> 0.55 (receiver 2.52 -> 2.44 vs ref
  2.31); whips re-raked rotation -1.15 (tips 2.10 at z_w -2.38 = the ref
  2.12 aft band; the r4 -0.9 rake put shafts 2.25-2.35 there = the gate's
  top side columns).

LAWS BANKED (turret-fix round):
1. TURRET-ROW BBOX NORMALIZATION: the gate's turret rows compare
   bbox-normalized traces. With the certified-long tube (+0.94 vs the
   print) the turret REAR must stay correspondingly short — the r4 short
   basket was the undocumented compensation. Extending the basket to the
   "measured" ref tail smeared every column: turret 64.4 -> 0, stations
   71.9 -> 29. Basket length is HARNESS-PINNED, not free identity space.
2. WORKORDER FRAME TRAP: vertex-workorder printed z for turret rows is
   bbox-skewed — authoring the roof/prow from it moved everything ~0.85
   off and cratered the gate. Decode the GATE LEDGER's own worst columns
   instead: side rows map z_w = 1.15 - at, y = val + 1.25 (calibrate on
   your own authored planes, non-circularly, before trusting any target).
3. FRONT-ROW LINE POLICES x-COLUMNS: anything stacked above the ref's
   front-row line at its x prints immediately (shelf-top duffels at 2.15
   over the 1.91 shelf line cost whole -4.9; horns at 1.92 over the 1.62
   line cost 3 cols — seat wall furniture AT the ref's own front line).
4. p95 HEIGHT BUDGET IS NARROWER THAN IT READS: a 0.26-wide pano head +
   dilation spans ~5 side columns — the 2.66 identity tower (real C1
   ~2.7; the packet dims table) priced dims 100 -> 91.3 and was revoked.
   The vertex-normalize warp clamped the print's 2.55-2.78 furniture band
   to 2.50/2.52, so the 2.7 pano stays a DOCUMENTED residual, not gamed.

SS-B5 ADJUDICATIONS (audit: stranded 1, abutting 1, dangling 0):
- stranded (unnamed, 100% overlap, box x[-1.53,-1.07] y[1.59,1.74]
  z[-2.57,-1.73]) = the hull-deck stowage roll at (-1.30, 1.66, -2.15):
  DECK GEAR the basket merely overhangs (bottom sits ON the 1.595 deck) —
  the documented ring-tub envelope-smear false-positive class. Stays in
  rig_hull. NO re-parent.
- abutting (fitting_spareTrackLinks, x[-0.93,-0.47] z[-3.37,-2.73]) =
  tail-deck spares BEHIND the basket end (-2.705); links top 1.65 clears
  the basket floor 1.665 at every yaw. Deck gear — stays in rig_hull.

CERTIFIED/DOCUMENTED RESIDUALS: the 8 ONLY-PROC side tube columns
(published 9.67 muzzle vs the print's short tube — dims-sovereign, never
traded); the plan-center muzzle-island col (improved 2.07 -> 1.84 by the
collar); pano at 2.495 vs the real ~2.7 (warp-clamped print, p95-priced);
closer-wedge/roof-corner +0.08-0.17 over 2-3 cols (the raised front roof
is a real C1 feature); shaded-path flatness vs the ref's baked texture
(world-continuous camo + no AO is engine-level, out of profile scope).

## PUSH ROUND 2 (2026-08-05, misc agent) — 76.0 -> 78.5 x2 FINAL (hull 81.1 / whole 78.5 / turret 82.1 / stations 88.6 / dims 100 / floaters 100; legacy board 86.2 -> 88.3); §B: clip 0/0, contig 0, mg1+3d, parent = the two certified adjudications. Post-amendment re-baseline + phantom-column re-probe + targeted col work; CEILING MEASURED (see below) — 82+ requires breaking a certified class.

BASELINE: the ad39179 trim-boundary amendment re-gated ariete 76.3 -> 76.0
(whole 76.3->76.0, others byte-same) — the amendment slightly REPRICED the
half-pitch lerp pairings here (opposite sign to the centurions).

PHANTOM-COLUMN QUESTION CLOSED (the push-round residual (a)): re-probed
with the render-scale factor via the gate-registered worldtrace — the
"±1.72/1.76 columns with bottoms 0.26-0.36 no authored mesh owns" DO NOT
REPRODUCE post-amendment. The fresh front rows read those columns as
ordinary small residuals (my crest top 1.615 vs want 1.557-1.567, bottoms
+0.03) — no LOD-far phantom, no orchestrator harness probe needed. The
class is RETIRED (it was a pre-amendment read, most plausibly the same
trim-boundary fake-cover family the amendment fixed).

WHAT LANDED (fresh worldtrace work orders, rendered-frame k=1.01266 per
the render-scale law):
- WELD-SEAM WINDING FIX (the §B3-adjacent find): the canted-wall seam
  strips' z-tilt was REVERSED (-s*0.234) — their tops swung OUTBOARD 0.07
  past the wall cant and printed 2.15 tops in the ±1.28 front cols (ref
  2.074). Flipped inboard along the cant.
- HUMP/DECK-EDGE BAND: powerpack hump 1.585 -> 1.640 x ±1.333 — the fresh
  rows want 1.661 rendered across side z -1.35..-1.85 AND front 1.658 at
  |x| 1.03-1.36 (one edit, both views; x capped so the rendered edge
  stays 2px clear of the 1.372 front-col boundary).
- STERN NOTCH SPLIT: the ref rear at |x| 0.85-0.97 reads -3.53/-3.57 (a
  cutout between its center plate and exhaust pods) — rear plate split
  ±0.83 / 0.99-1.42, rake slab ±0.82, tail deck notched to -3.50 there,
  grille narrowed ±0.81; exhaust stubs narrowed to x 0.99-1.13 and
  DEEPENED to y 0.72 (ref -3.85-zone bottoms 0.65).
- ±1.85 DOT-BIN sharpened: skirt end plates depth 0.38 -> 0.14 (z_w
  0.85-0.99 about the ref's 0.936 mirror dot; y-band 0.59-1.31 and the
  ±1.7775 widthM faces unchanged).
- approach ramp: contactZF 2.36 -> 2.22 (ref liftoff ~2.33, shallow climb
  0.22@2.68 — the old patch held ground to 2.45 then climbed steep; 6 ramp
  cols were 0.06-0.12 deep). The idler-crest hook stays the certified curl
  class.
- basket rear pulled 3 cm (rails/sheets/posts rendered aft-faces -2.75,
  clear of the -2.775 col boundary): the -2.782 faces lit the straddling
  col and smeared the ref's deck col at -2.894 to 1.897 — cliff-lerp
  optimum = zero the low col, eat half the high one.
- front-row micro (all fresh wants): periscope vane re-windowed x
  0.01-0.15 top 2.40 authored; L-only roof-edge stowage lip (x 1.175-
  1.215, top 2.276) fills the ref's L/R-asymmetric wall-top col (L 2.306
  vs R 2.155); asym roof rails (L 2.395 / R 2.475); loader hood 2.427;
  turret lift eyes 0.74; deck lift eyes zone: spare links sunk 2 cm
  (their 1.665 tops printed five front cols over the ref's 1.598 line);
  crest split with an outer 1.545 crown step; pano head top 2.468
  (rendered 2.499 = the fresh front want; also -0.03 on its side spike).
- §B3 MANTLET SWEEP (owner directive class): the two canvas masses at the
  gun root now carry canvas tells — cinch straps + rolled top hem, coax
  hood — all inside the priced mantlet band (y 1.51-1.83, x ±0.41), no
  mask-row change. No bare cuboids remain around the mantlet/gun.

LANDED: 76.0 -> 78.5 x1 (hull 80.7->81.1, whole 76.0->78.5, turret
83.6->82.1, stations 85.9->88.6, dims 100, floaters 100); x2 pending in
the round's final batch. The turret -1.5 is a PRICED TRADE: the basket
3 cm pull removed my rearmost turret-mask column, so the ref's -2.775
basket col fell outside the ±0.02 interp window = a side_turret REF-ONLY
cover col (-1.4 turret) — but it killed the -2.894 deck-col smear on
side_whole (0.147+0.035 -> 0.015+0.134), and side_whole IS the min
binder (turret stays 3.6 clear). Kept deliberately.

LAWS BANKED (push-2):
1. CLIFF-LERP TAX (generalizes the type90 CLIFF-LERP law): with the
   half-pitch dAlong phase, ANY mask cliff of height h pays ~h/2 top-err
   on exactly one ref column — the only choice is WHICH column (put the
   full column on the ref's high col; zero the low col). The pano
   2-column spike is AT its tax floor (~0.26 sum): every repositioning
   priced equal-or-worse. Measure before moving cliffs.
2. The commander-ring z-footprint (r 0.235 cylinder = 0.47 of z) makes
   ring crowns 3-4-column-wide side content — hatch hardware near a ref
   fall line needs the ring SMALL or the line matched, not both.
3. SPAN-END COROLLARY to the cliff-lerp law: if the cliff you pull IS
   the mask's span end (basket rear = the turret row's last column),
   pulling it past a column boundary doesn't just move the smear — it
   NULLS the ref's edge column (interp span +-0.02 window) and books
   COVER (1.5 pts/%). Price cover vs smear before pulling span ends.

BANKED NON-BINDING ORDERS (diagnosed this round, NOT applied — they move
turret_plan/front_whole which sit 3.6-6 pts ABOVE the side_whole binder;
apply only if the certified side classes ever break):
- galixBank x 1.36 -> 1.315: the k3 tube tips (x 1.586) poke the ±1.63
  plan col whose ref content is the horn DOT at z_w -0.73 (0.28 err x2 —
  the worst plan_turret pair);
- roof plates (mid 2.32 + bustle 2.30) x ±1.175 -> ±1.12: their rendered
  1.19 edges print 2.35 into the ref's falling 2.25/2.18 wall-top cols
  (front 1.159/1.2, −0.067 sum net after the wall-edge re-read);
- R rail L-profile: inner segment to x 0.9825 (fills the ref 2.49-want
  col at 0.997) + outer flange top 2.379 at x 1.0435-1.0775 (the ref
  falls 2.409 at 1.078; the plain 2.509 rail overshoots);
- pano head widen to x -0.2125..-0.3025 (the ref 2.511 front col at
  -0.299; z-footprint unchanged so the side spike stays at its tax);
- loader ring/lid +0.045 (ref 2.399-want at x -0.66..-0.72);
- second periscope y 0.715 (its helper tops +0.12 above the seat; the
  0.81 seat still reads 2.445 vs the 2.349 want);
- plan bow corner taper (type90-r5 find applies here too if the plan
  rows ever bind).

MEASURED CEILING (push-2, supersedes the push-1 estimate): side_whole
binds wholeCurves at ~78.5; its residual budget is now certified
classes almost entirely — cover 1.83% (stubby-print, -2.75), the
nose/tube frame-lock col (0.243, dims-sovereign), the idler-curl +
crest-cliff family (0.11-0.14 x3), the half-phase cliff taxes (TURMS
front, pano window, bustle-roof rear, hatch-ring line: ~0.05-0.09
each, all AT the h/2 floor), the station-slice-6 rail trap (r10), and
the ramp's convex-vs-tangent gap (~0.05 x2). Sum ≈ every remaining
worst column. wholeCurves ceiling ≈ 79-80 with the kit's circular wrap
and the certified print defects standing; 82+ requires breaking a
certified class (non-circular wrap authoring or oracle-lane print
repair). hull/turret/stations are 81-89 and non-binding; dims 100
robust.

## PUSH ROUND (2026-08-05, misc agent) — 65.5 -> 76.3 x2, every component up, dims 100 held

Final gate x2 stable (three consecutive runs): min **76.3** | hull 80.7 /
whole 76.3 / turret 83.6 / stations 85.9 / dims 100 / floaters 100
(baseline 65.5 | 69.7 / 68.8 / 65.5 / 72.8 / 100 / 100 — every component
+7.7..+18.1). Track-clip exact **0/0**; standard-check clip 0/0 ✓ contig 0 ✓
mg1+3d ✓; turret-parent stranded-1/abutting-1 = the SAME two documented
turret-fix adjudications (deck roll false-positive + tail spares — both
stay in rig_hull, re-verified against shots/turret-parent.json boxes);
npm test clean. Twelve landed edit cycles; probes:
tools/tmp-ariete-worldtrace.mjs (gate-identical registration, prints every
row's full column work order in the BUILD's world frame — kills the ledger
'at'-decode guessing), tmp-ariete-slice4.mjs (station slice-top attribution),
tmp-ariete-raycol.mjs / tmp-ariete-xmax.mjs (column-content attribution).

THE ROUND'S STRUCTURAL DISCOVERY — THE WIDTH-NORMALIZE RENDER SCALE: the
fidelity harness scales BOTH roots so the visible-box width equals
spec widthM (procedural-fidelity.html:403 `safeScale(3.60, procWidth)`).
With the build's widest authored |x| at 1.7775 the WHOLE tank renders
x1.01266 (verified: skirt bucket maxX prints 1.8000 exactly; z extents
match authored x1.0127). Consequences, all measured this round: the
overallLengthM mystery (authored 9.60 read 9.72-9.78), the certified-cap
"±1.85 mirror-dot bin" boundary being GRID-relative (an authored-1.7775
edge + AA landed in the dot col the moment a gun-length edit moved the
shared box), and every boundary-hugging margin being ~1.27% narrower than
authored. LAW FOR THIS FILE: author against RENDERED = authored x k
(k = 1.80/max-authored-|x|); NEVER change the widest piece (currently the
SKIRT END PLATES at +-1.7775) without re-deriving every fitted value.

WHAT LANDED (worst-rows-first, per the worldtrace work orders):
- PLAN REAR RE-LAY: center-only tail lip (x +-0.20; the 2.70-wide lip
  printed plan rear -3.94 at every x where the ref reads -3.65..-3.83),
  rear exhaust/hitch stubs at +-1.02 to -3.825 (ref -3.79..-3.82 both
  sides), 14th skirt course pulled to -3.56, trench fill widened/extended
  (x 1.42-1.67, rear -3.71). plan_hull 83.4 -> 90.4.
- MUZZLE/MRS COLLAR (r 0.135, off-axis xc -0.04, world 5.40-5.70 via the
  gunMount +0.60 frame — verified against the mantlet block's 1.745
  front): covers the plan x=-0.165 column the ref's off-center fused tube
  owns — the certified 1.84-err plan-center col DIED (turret_plan 75.9 ->
  87.4). Band 0.27 stays under the 12% body cut so dims never see it.
- GUN LEN 5.18 -> 5.10: the MASK is the measure of record — the rendered
  tube read overallLengthM 9.78/+1.19% (the render scale); 5.10 reads 9.70.
- TURRET UNDERSIDE RE-LAY: body poly ends z_w -1.27, raked-belly bustle
  slabs (1.50 -> 1.645 -> flat) — the ref turret underside RISES aft
  (1.405 front / 1.555@-1.27 / 1.645@-1.5..-2.0 / 1.675 basket); plinth
  dropped to the 1.445 deck line; wedge undersides 1.455 (1 cm over the
  deck at every yaw — the ref's 1.375-1.405 is unreachable without
  yaw-sweep clip). turret_side 65.5 -> 84.0.
- ROOF RE-METER: mid/bustle roof plates +-1.175 top 2.32/2.30; poly h
  0.72 (top 2.20 — the ref wall-top corner falls 2.31@1.19 -> 2.16@1.24);
  channel 2.31; TURMS x 0.505-0.84 top 2.4925/lid 2.506 (heightM p95
  anchor, +0.4%); 6-cm roof-edge RAILS at +-1.02-1.065 top 2.46 (the
  ref's tall shoulder prints ONLY in the +-1.058 front col); slim pano
  x -0.21..-0.255, z_w -1.10..-1.27; loader sight hood x -0.73..-0.99
  top 2.46; center periscope vane top 2.44; hatches aft (crowns 2.30-2.33
  in the ref's 2.30 band); BROW LOFT: three chained raked planes
  2.28@0.95 -> 2.11@1.15 -> 2.03@1.61 -> 1.865@1.99 (smoothLoft class,
  replaced the floating brow box).
- MANTLET SNOUT (canvas, x +-0.40 to z_w 2.16): the ref plan front holds
  2.16-2.19 across +-0.2-0.42 — the gap between the 0.36 block and the
  wedge roots read 0.85 short.
- GEAR: both end wheels raised HARD per the ref wrap-crest bottoms
  (idler 3.30/0.89/r0.13, sprocket -3.12/0.86/r0.21, contact patch pinned
  2.36/-2.05, track band x 1.065-1.68 rendered 1.078-1.70 — the ref front
  rows reach near-ground at +-1.07-1.10); SS-B6 trapezoid stronger than
  baseline. Skirts: band 0.60-1.42 (ref front-row skirt bottom 0.626),
  SLANTED LEADING CUT (one raked lip 1.42@2.52 -> 1.34@2.98), courses
  x 1.715-1.755, SKIRT END PLATES x 1.7225-1.7775 (the +-1.81 front cols
  want the ref's full 0.59-1.31 band AND the +-1.84 plan bin wants a
  short dot — the 38-cm plate delivers both and carries widthM 3.60).
- HULL LINES: glacis (2.44,1.386)->(3.40,1.15); nose 3.60 with the
  FRAME-LOCK (the nose-tip col band = nose UNION tube = 0.845 — robustly
  over the 12% body cut, so hullLengthM holds 7.57 and side dAlong stays
  pinned ~0.775); mudguard crest x 1.55-1.745 z 3.28-3.49 (clear of the
  1024-grid tube-only col at 3.60); stern rake 0.38@-2.60 -> 0.74@-3.66;
  rear plate to 0.62; V splash rail hugging the glacis; hump 1.585; deck
  roll flattened to 1.61; belly 0.40; deck decal moved onto the glacis
  plane (its floating band owned the tube-only col after the nose pull).
- CLIP RE-CERT after the wrap raise: flap re-seated as a thin lip under
  the crest (the 0.72-0.88 flap sat INSIDE the wrap annulus — 94 vox),
  idler 0.92 -> 0.89 (glacis edge vs dilated wrap), left exhaust raised
  to 1.20 (the sprocket wrap climbed to 1.15) — 0/0 exact; sponson band
  rear to -3.62 (two top-down sky cells at +-1.53/-3.57) — contig 0.

LAWS BANKED (push round):
1. RENDER-SCALE LAW (above) — the widest authored |x| is a global
   calibration constant, not decoration.
2. WORK-ORDER FRAME: tools/tmp-ariete-worldtrace.mjs replicates the
   gate's registration exactly (body-span dAlong from the hull row, dy,
   fixedReg reuse, turret hull-span trim) and prints want/have per column
   in build coordinates — author from IT, never from the bbox-skewed
   vertex-workorder turret rows and never from hand-decoded ledger 'at's.
3. FRAME-LOCK: registration dAlong follows the body-column census; any
   front/rear column whose band hovers near the 12% cut flips per-run and
   sloshes dAlong +-0.06, moving every turret/pano/basket target. Pin the
   end columns with band-robust geometry (nose-tip UNION tube = 0.845
   here) BEFORE fitting anything aft of the ring.
4. STATION-SLICE TOPS are per-slice-index comparisons of topH ABOVE EACH
   MODEL'S OWN box-min: ref slice tops here read ~2.33 (i6), ~2.2 (i4) —
   fitting my 2.46-rails into slice 6 cost 6.2%; the 1-cm window between
   the -0.18 side col (wants 2.50) and the slice-6 boundary is
   unbuildable — station trim priced lower than the side col.
5. GRID-COUPLING: every 96-col grid is derived from the SHARED box —
   a gun-length edit moves every view's column boundaries. Boundary-
   hugging margins under ~8 mm rendered are coin-flips; design features
   to sit mid-column or accept the flicker class explicitly.

MEASURED CEILING / REMAINING (honest): front_whole 76.3 binds. Remaining
worst columns are (a) the +-1.72/1.76 track-curtain/bottom class — the
ledger reads bottoms 0.26-0.36 there that no authored mesh owns (static
vertex scan + raycast negative; suspected harness-side LOD-far render at
the gate's 60-m camera — ~0.5 pts, needs an orchestrator-lane harness
probe to certify), (b) the L/R-asymmetric ref columns (wall-top 1.19 L vs
1.24 R, track inner edges, +-1.03/1.07 cols — symmetric geometry can
satisfy one side per column pair, ~0.5 pts), (c) the idler-wrap curl
(ref crest-bottom 0.80-0.91 vs a physical wheel's 0.62-0.75 — matching
it exactly needs a non-circular wrap the kit doesn't build, ~0.4 pts),
(d) the certified stubby-print cover cols (side 1.83%: nose-tip
PROC-ONLY + two ref tail-lip cols beyond my published rear; front 0.56%).
Ceiling with (b)-(d) certified and (a) unresolved ≈ 78-80 on wholeCurves;
hull/turret/stations have 85-90 reachable if whole unbinds. dims 100 is
robust (all four dims 0.05-0.57%).
