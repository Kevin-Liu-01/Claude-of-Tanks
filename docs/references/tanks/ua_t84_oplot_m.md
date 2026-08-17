# ua_t84_oplot_m — BM Oplot / Oplot-M (Ukraine) — §5.248 ground-up round packet

## Round (2026-08-17, ukraine §5.248 builder lane)
Ground-up §K rebuild replacing the donor-clone composition (`T80_PROFILES.t84.build`
+ additive kit). New builder `buildUAOplotM` in `src/vehicles/profiles/ukraine.js`
is measured from the registered print and authored to PUBLISHED dims. No donor
build call remains; the t84 graduate is untouched (hash 54b9debb held through
the round).

## Print / instrument
- `public/models/community-candidates/oplot_m_manako.glb` — CC-BY-NC-4.0
  (never-ship, LOCAL-ONLY measurement/visual oracle; ATTRIBUTION §5.248).
- ORIENTATION FIX (this round, all three maps + vertex REG): muzzle toward
  raw -Z with a FUSED gun (no gunNode for the page auto-flip) →
  `yawOffset: Math.PI`. Without it every gate row measured the print
  backwards.
- FOLLOWER CENSUS FIX: `default076` ("inner", 301v, y 0.61..1.91) is the
  turret interior shell — it rode the HULL mask and printed a 1.91 deck hump
  over 3 m of columns. Added to turretFollowers in all four instruments.
- Stylization (vertex extract, width-true frame): hull mask 6.341 m
  (-10.4% vs pub 7.08), overall 8.786 (-9.6%), body-p95 roof 2.601 m vs the
  2.285 published roof; pano tower tops 3.38. Turret shell roof reads 1.95.

## Spec true-up (P95 law, receipts)
- heightM 3.15 → **2.285** (KMDB Oplot-M: 2.285 m to the turret roof; the
  2.80 m AA-MG band figure is carried by the PNK-6 tower cap in the build).
- widthM 3.56 → **3.775** (published over-skirt width; the donor 3.56 was the
  bare-hull figure). hull 7.08 / overall 9.72 unchanged (already published).
- Spec pin infrastructure: `variant()` now drops inherited `silhouette*`
  measurement overrides (donor rows under live rebuild carry overrides tuned
  to THEIR masks — they never transfer).

## Build (measured lines)
- Hull: loft deck 1.42 plateau, rear fall 1.27, glacis break +1.85 to the
  0.84 bow tip; 0.45 belly, T-80UD stern undercut to the 1.15 lip; Nozh
  glacis wedge courses ×2 rows with center driver break; full-length THICK
  armored skirt slabs x 1.70..1.8875 (the print's plan-width datum) with
  Duplet lids forward; rear-deck powerpack louvres + LEFT exhaust duct.
- Gear: 6 × R0.335 rubber-rim wheels y 0.40 at z ±2.33 pitch 0.93, rear
  sprocket (-2.95, 0.75, 0.28), front idler (+2.93, 0.72, 0.22), 4 rollers,
  trackW 0.58 @ xc 1.24 (print GUS band ±1.53).
- Turret: WELDED ARROWHEAD measured from the warped print's TUR subtree
  (tools/tmp-ua-turprofile.mjs): shell prism (polyTurret) over the flat-roof
  zone only (world -1.88..+0.55, roof at the published 2.285), Duplet wedge
  wings sweeping to world +1.26 at halfW 1.43..1.54 with raked faces, nose
  converging +2.26, bustle to -2.50 with anti-thermal roll + baskets, real
  interior basket drum (the print's turret mask carries its interior),
  PNK-6 tower at the ref's own world -1.34 spike column capped at the
  published 2.80 band (the ONLY p95 spike window, ≤2.5 columns), NSVT
  stowed on the low bustle deck (§K.4 exact-group census), Varta dazzler
  pair on the wings, 2×6 aerosol banks, tied-down whips.
- Gun: KBA-3 125 mm, trunnion world +1.90, stepped thermal sleeve, muzzle
  +6.18 (overall 9.72 exact), machine-tagged bore r 0.0625.

## Gate (close ×2, bit-identical; instruments verified before each run)
```
min 0 | hull 3.9 whole 21.6 turret 0 stations 42.1 dims 100 floaters 100
```
- dims 100.0 (h 2.28/2.285, hull 7.08→7.12 est, overall 9.72, width 3.78).
- floaters 100, exact track-clip 0/0 (band + shoe), §B2 holes 0,
  fittings census mg1+6d PASS.
- CAP (documented): hull/whole/turret curve components are capped by the
  print's -10.4% hull-length / +14..19% height stylization — published dims
  and raw-print curves are mutually unsatisfiable (§E warp class, banked
  below). Post-warp SIM (unmodified gate, request-interception):
  `stations 76.7 wholeCurves 39.4 dims 100 floaters 100` and climbing with
  the v4 turret; turret rows remain the ladder tail after the warp lands.

## §E EXECUTED — batch 61 (2026-08-17, §5.248 §E round)
The banked warp LANDED (repair_oracles.py batch 61; the plan's frame
converted to raw knots, and the scratchpad candidate's vertex mapping was
RECOVERED and matches these knots exactly — sample err <2e-5 raw).
Receipts: .bak = pristine 761c8698…, output fcc9de7b… byte-idempotent ×2;
census (13, 27936, 18992). OFFICIAL GATE ×2 BIT-IDENTICAL: min 0 (print-
cap held as forecast) — whole 18.4->**35.3**, stations 44.6->**68.5**,
hull 8.1->0 (the sim's own forecast number), turret 0 (forecast 0), dims
100 HELD, floaters 100 HELD. vs the filed sim (stations 76.7/whole 39.4):
-8.2/-4.1 — attributed, not plan-drift: the scratch candidate carried
PRISTINE normals (no Jacobian transform — receipt: candidate NORMAL rows
== pristine) + sub-mm knot precision, and the proc moved after sim-time
(procExt h 2.275->2.264, the §5.272 fix landing); the landed bytes are the
registry-standard warp math. The hull/turret ladder resumes from the new
work order (family lane); the y_map furniture-knot variant (2.15->2.38)
stays the documented ASK-ORCHESTRATOR option.

## BANKED WARP PLAN (for repair_oracles.py — §E, orchestrator lane)
Self-measured frame: mpu 3.600129 m/raw-unit (width-anchored), ground
rawY 0.0364, body tail rawF -0.9475 along fwd '-z'.
```
y_map   (gate m): [[0,0],[1.40,1.40],[1.95,2.285],[3.38,2.80]]
fwd_map (m from tail): [[0,0],[5.825,7.08],[8.463,9.72]]
```
Candidate bytes + SIM report: scratchpad ua-round/warp-candidates/
(ua_t84_oplot_m-warped.glb, -sim-report.json). Repo GLB untouched.

## Evidence
- shots/ukraine-wave/pairs/ua_t84_oplot_m-{raw,warped}-*.png (side/front/
  top/hero/rear34 pairs), shots/ukraine-wave/printraw/oplot_m_manako-*.png,
  shots/ukraine-wave/refview/* (mask-ownership probes).

## Residuals / next ladder steps
1. Orchestrator lands the banked warp; resume the curve ladder from the
   sim work order (front_hull rear-deck stowage mass added this round;
   plan x ±1.65 column closed by the thick skirts).
2. Turret side row: the warped ref carries its furniture band at 2.35-2.52
   (cupola class above the roof datum); my roof kit is p95-disciplined at
   ≤2.285 — reconcile via the y_map furniture knot (2.15→2.38 variant) if
   the critic wants the taller cupolas, at ~-7 dims cost. ASK-ORCHESTRATOR.
3. Rear-flap near-contacts are 2 cm-margin class only (exact audit 0).

## §5.272 fix round (2026-08-17, verdict 7.8 -> ordered fixes delivered)
- Hash 6a699084 -> `d7d068be` (+9910 verts). Gate ×2 bit-identical:
  `min 0 | hull 8.1 whole 18.4 turret 0 stations 44.6 dims 100 floaters 100`
  (baseline 0/3.9/21.6/0/42.1/100/100 — min held at the print-cap 0, stations
  +2.5, hull +4.2, dims stays 100). Track-clip --exact --strict 0/0.
- (1) BOW CONTRAPTION DELETED: the 0.945-wide transverse tip bars (x to
  1.745, air under both ends) are gone — real fender run (level plank ->
  raked tip plate -> chained rubber flap, all inside the 1.46 fender line)
  + idler-adjuster crank bosses authored INBOARD on the nose plate.
  Track-clip receipts: plank pitched -0.31 dipped its tail into the wheel-1
  band (90 vox), +0.31 dipped its nose into the idler wrap (68/168) — the
  delivered plank is level (rx -0.06) with the step in the tip plate only.
- (2) TOOTHED-DISC READ KILLED: the thick skirt now runs the print's FULL
  hull length — forward panel + raked tip (inner face 1.60 also closes the
  1.635..1.70 head-on slit; strict-audit hit box proved this face clean)
  shroud the raised idler wrap whose exposed shoe pads read as forward-
  facing gear discs. The idler spinner itself is the smooth dished
  idlerGeo — rear-drive stays honest (rear sprocket keeps its teeth).
- (3) PNK-6 REAL TOWER at the ref's own -1.34 spike column: plinth + broad
  shaft + 0.40-wide head with forward WINDOW FACE + lens hood + cap plate
  at the published 2.80 band. p95 receipts: z-window is the binding budget
  — 0.34 m read heightM 2.78/2.31; delivered window 0.28 m (~2.7 col)
  reads heightM 2.27 -> dims 100.
- (4) ERA ARTICULATION: the one smooth cassette slab per wing replaced by
  two lerped courses of stacked Duplet bricks with lid seams riding the
  measured wing top-face quad + a flank brick aft of the edge stack. The
  final brick of each course lies flatter (rx -0.14) — tilted-corner AABBs
  at rx -0.28 printed 2.30-2.31 tops into the p95 (receipt above).
- (5) ROOF READS: the shell roof plate dropped 0.865 -> 0.795 local (the
  old plate was AT the p95 datum and SWALLOWED every fitting authored
  under it — hatch rings, periscopes, NSVT, anti-thermal roll rendered
  zero pixels). Furniture now stands proud under 2.285: hatch rings,
  vision blocks, lifting eyes, GPS puck, junction box, spent-case port,
  cleats; the NSVT is a real gun (receiver mass + top cover + ammo can +
  barrel with root ring and muzzle booster + grips) stowed ACROSS the
  bustle rack; the anti-thermal roll moved onto the rack (its old seat was
  inside the prism). Varta dazzlers re-seated on the wing leading faces;
  gunner sight on the roof front edge.
- Owner 2b193244 absorb (turret-detail intents on the retired donor-clone
  builders): PNK mass intent + Duplet articulation intent + NSVT-reads
  intent SUPERSEDED by the equivalent ground-up § above (their standing
  ring-mount NSVT stays banked for post-warp per the §5.265 stowed-MG
  doctrine — a standing pintle sweeps 6+ p95 columns pre-warp).

## §5.319 left-side turret finish (2026-08-17, owner order: "finish the left
## side of oplots turret" + close top-left garage screenshot)
- Hash `d7d068be` (64/93173) -> **`6e76802a`** (66/96743). Gate ×2
  BIT-IDENTICAL (row md5 5e4fc7d3 both runs):
  `min 0 | hull 0 whole 37.1 turret 0 stations 68.5 dims 100 floaters 100`
  vs the verified live baseline 0/0/35.3/0/68.5/100/100 — **whole +1.8**,
  stations held exactly, dims 100 HELD (heightM 2.26/2.285 = 0.9% grace,
  hull 7.07 0.21%, overall 9.70 0.22%, width 3.78 0.16%), floaters 100.
- MEASUREMENT (new instruments, uncommitted round tools): the §E-warped
  print normalized into the build frame (yaw PI, z-span 9.72, tail -3.54)
  and ray-scanned — tools/tmp-oplotleft-relief.{html,mjs} (side relief
  100×44 + left-half top relief 40×100) + tools/tmp-oplotleft-shots.{html,
  mjs} (10-view proc/print pair harness incl. the screenshot's close
  top-left garage angle). Print LEFT stations (build frame): full-height
  cheek cassette wall at the max-width plane (x -1.4725 print = -1.54..-1.55
  build) over world z +0.34..+1.36 down to y ~1.37; shoulder smoke cluster
  world z -0.80..-0.38 topping 2.36; mid-wall junction/panel band at
  x -1.41..-1.47 over z -0.80..+0.30; solid bustle flank at x -1.32 over
  z -2.1..-0.95 (rim 2.14); roof sight housing x -0.78..-0.41 z 0.28..0.65
  topping 2.42 (capped class); wing-top terrace field to x -1.29.
- DELIVERED (ASYMMETRY LAW: every piece authored s=-1 only; the ratified
  right side keeps its §5.288/§5.291 bytes — right smoke bank inlined
  VERBATIM from the retired uaSmoke both-sides call, seed 8411 + exact
  seat, so left could re-seat without touching it):
  (a) cheek cassette wall — 3 camo Duplet cassettes, plumb faces x -1.54,
      world y 1.445..2.025 + top deck buried into the raked wing flank
      (closes the wall<->wing slot, §B2) + tier/bay/base seams + a 4th
      cassette riding the leading-edge line yawed +0.848 (silhouette stays
      on the certified wing plan);
  (b) junction cassette panel bridging wing->wall (z 0.07..0.35, clear of
      the ratified edge-stack tiles);
  (c) 3 outer wing-face course lids + dark lids (face-following rx -0.29 /
      rz -0.075) filling the bare flank field outboard of the §5.288 brick
      courses (print terrace field; tilted-brick p95 law respected);
  (d) LEFT smoke bank re-seated to the print's shoulder station: 2
      staggered smokeBank(3) rows (seeds 8412/8413), breeches recessed into
      the shoulder slope, muzzles fanning forward-out; **print top 2.36
      CAPPED to <=2.28 world** — the PNK-6 keeps the ONLY >2.285 window
      (dims receipt above proves the cap held);
  (e) wall kit density per order: ported junction box + pale lid + dome
      bolts, vertical cable drop + clips, angled conduit hugging the
      receding aft wall (ry -0.154 keeps it flush against the raked
      plane), grab rail on 3 standoff feet (rail 2.04 world);
  (f) bustle flank: solid left side bin at the print's x -1.32 face
      (z -1.62..-2.36) + rim + straps + rack bracket, seated into the rack
      tier; gunner-sight ZONE kept and grown to the print's own station
      (housing + brow + twin pane + cheek plates at x -0.60, z_w 0.25..
      0.61, top 2.275 <= datum — the print's 2.42 top stays the banked
      capped class).
- GATES: track-clip --exact --strict 0/0 band + 0/0 shoe + strict sweep
  0/0. §B2 + §B5: the standard-check bow holes (x -1 / +1.06, z 3.41, 3c
  each) and the single §B5 stranded fitting_spareTrackLinks reproduce
  BYTE-IDENTICALLY at HEAD baseline bytes (swap-run receipt this round) —
  pre-existing §5.272-bow / hull-deck class, ZERO delta from this round;
  all new left kit is turret-parented and proven riding the turret in the
  yaw-0.6 pair set. Fittings census mg1+6d -> mg1+7d (net +1: left bank
  -1, shoulder rows +2), mg>=1 PASS. npm test GREEN (exit 0, &&-gated).
- GUARDS byte-held at close: ua_t80u_kursk `1332bd55`, ua_t64bv `4fac9a30`,
  ua_t80bv `554591b8`, ua_m1a1 `f7d2ec40`, t84 `54b9debb`.
- EVIDENCE: shots/oplot-left/ — before-*/after-*/print-* ×10 views each
  (garage-topleft = the owner screenshot's angle, close-turret-left,
  close-wing-left, close-wall-left, hero-frontleft, hero-rearleft, left,
  frontleft, front, plan) + after-yaw06-* (left kit yaws with the shell,
  clears fender bins). Before set captured at the pre-edit tree, after at
  the delivered tree (§5.254 respective-trees law).

## §5.340 right-wall finish (2026-08-17, owner follow-up: "still missing a
## huge chunk of its turret ... visually check the left side from us facing
## the front" = the TANK'S RIGHT; coordinator void shots at shots/oplot-check)
- Hash `6e76802a` (66/96743, the landed §5.338 state) -> **`66fc1724`**
  (66/100085). Gate ×2 BIT-IDENTICAL (row md5 28273969):
  `min 0 | hull 0 whole 38.2 turret 0 stations 68.5 dims 100 floaters 100`
  — **whole 37.1 -> 38.2 (+1.1)**, stations held, dims 100 HELD (heightM
  2.26 0.9% grace), floaters 100.
- MEASUREMENT: the relief probe recreated post-sweep and extended to BOTH
  walls (tools/tmp-oplotright-relief.{html,mjs}). The print is measurably
  ASYMMETRIC: right cheek face +1.462 (build +1.535, 1 cm shier than the
  left's -1.4725 outer stack) over the SAME z -0.25..+1.36 window down to
  y 1.35 with the same 2.003 top deck; same wing terrace steps; mid-wall
  band to 1.417; bustle flank 1.25 with NO bin rim; **NO tall smoke
  cluster** (left-only in the print — top scan right cluster max 2.19 vs
  the left's 2.36) and a LOW shoulder ledge instead.
- DELIVERED (s=+1 only; the §5.338 left side byte-untouched, right wing
  §5.288 bricks + right uaSmoke seat untouched): (a) right cheek cassette
  wall ×3 + top deck (§B2-closes the wing slot) + tier/bay/base seams +
  leading-edge cassette (ry -0.848); (b) junction panel z 0.07..0.35;
  (c) 3 wing-face course lids (rx -0.29 / rz +0.075); (d) LOW shoulder
  ledge + stowage kit + cleats (tops 2.20/2.28 — print parity, no smoke
  mirror per the asymmetry law); (e) wall kit: junction box + lid + dome
  bolts + cable drop + clips + conduit (ry +0.154) + grab rail on 3 feet.
- GATES: track-clip --exact --strict 0/0+0/0 sweep 0/0; §B5 same single
  pre-existing stranded spareTrackLinks (§5.338 baseline receipt — zero
  delta); guards at close: kursk 1332bd55 / t64bv 4fac9a30 / t80bv
  554591b8 / ua_m1a1 f7d2ec40 / t84 54b9debb (taken BEFORE the §5.341
  t80-pair rebase re-opened kursk/t80bv by owner order).
- EVIDENCE: shots/oplot-right/ — before/after/print ×11 views each incl.
  the order's head-on (front-headon) + FQ viewer-left (fq-viewerleft)
  angles + after-yaw06 set; coordinator BEFORE reference at
  shots/oplot-check/.
