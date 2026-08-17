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
