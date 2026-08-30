# ua_t80u_kursk — UA-service T-80U "Kursk" — §5.248 ground-up round packet

## Round (2026-08-17, ukraine §5.248 builder lane)
Ground-up §K rebuild replacing the donor-clone composition
(`MISC_PROFILES.t80u.build` + kit). New builder `buildUAT80UKursk` in
`src/vehicles/profiles/ukraine.ts`. Donor t80u untouched (hash e963fb60
held through the round).

## Print / instrument — THE DIORAMA FIX
- `public/models/community-candidates/t80u_kursk_manako.glb` — viewer-rip
  re-upload STRONG SUSPECT (ATTRIBUTION), LOCAL-ONLY, whole-view oracle
  (fused 3-mesh, fixedMount).
- INSTRUMENT REPAIR (this round): the print is parked in a diorama —
  axis-aligned along raw X (PCA 0.05°), nose raw -X, centroid ~(-1118, -2163)
  raw units, 0.242 m/u. The registration measured GARBAGE (-86% overall,
  width clamped): fixed with `yawOffset: +Math.PI/2` (retired wave-two oracle
  FLIP-RETIRED convention) in all three maps + vertex REG, PLUS the
  reference-glb-loader off-origin recenter (below). Post-fix instrument:
  overall -2.6%, width -1.8%, body -6.3% — usable near-true print.
- LOADER FIX (tools/reference-glb-loader.ts, byte-identical default): the
  loader never recentered x/z, so a far-off-origin print blows the shared
  comparison frame apart (both masks collapse to dots), and recentering via
  root.position breaks under the page's origin-anchored gun-forward flip.
  The raw footprint now centers INSIDE the authored frame (pre-yaw) when
  its offset exceeds 0.35 × model diagonal — pathological-only; every
  near-centered print keeps its exact historical transform.

## Spec true-up
- heightM 2.90 (donor-clone override) → **2.20** published (T-80U 2.202 m to
  the turret roof; the donor t80u row already carries 7.01/9.65/3.60/2.20).

## Build (measured lines)
- T-80 turbine chassis at ±3.505: 1.505 deck plateau, turbine stern hump
  band 1.845 with lip, K-5 glacis wedge modules, published gear constants
  (6 × R0.335 dished @ 0.72 pitch, rear drive 0.95 high, 5 rollers),
  skirts at the published ±1.80 face with drooped rubber forward third.
- Turret: T-80U dome (crown 2.16) with K-5 wedge shoulders sweeping to the
  mantlet tips; tall right-forward gunner sight kept as the silhouette
  identity but p95-flattened (see DISCIPLINE); NSVT stowed FOLDED on the
  roof (§K.4 exact-group census — Challenger 2 folded-MAG precedent);
  asymmetric rear crates + rolled snorkel across the bustle (print tells);
  2×5 smoke banks; tied-down whips low on the bustle flank.
- Gun: 2A46M-1, muzzle +6.145 (overall 9.65 exact), bore r 0.082.

## P95 DISCIPLINE (the height law, learned this round)
The gate's heightM = p95 of side body-column tops − min bottom: with
~65-70 body columns only ~3 columns may exceed published height before p95
jumps. A standing pintleMG sweeps 6+ columns at 2.4-2.5 — hence the stowed
MG doctrine on this and the t80bv/oplot builds. NOTE (fleet finding): the
donor t80/t80b/t80bv ledger dims=100 rows predate the §5.229 MG
standardization and cannot refresh (their oracles are .bak-only on disk);
a live re-measure of donor t80bv reads p95 ≈ 2.46 — stale-row class, FYI
orchestrator.

## Gate (close ×2, bit-identical)
```
min 82.3 | whole 82.3 dims 100 floaters 100   (hull/turret/stations vacuous — fused ref)
```
- dims 100 (h 2.19-est/2.20, hull 7.02/7.01, overall 9.65/9.65, width 3.60).
- exact track-clip 0/0, holes 0, census mg1+5d PASS.
- wholeCurves 82.3 = the worst registered standard-view mask (fused-ref
  metric). Residual: front/side whole deltas vs the print's tall roof-kit
  band (+24% bodyH) — warp-blocked, banked below; remaining fixable slack
  is the K-5 wedge plan sweep + glacis detail.

## §E SKIPPED — raw close verified better on the current tree (2026-08-17,
## §5.248 §E round; print PRISTINE, sha eaa2136b…, no recipe landed)
The optional warp was RE-VERIFIED against the current tree (post-§5.272
build 1332bd55) via request-interception with the banked candidate bytes:
sim whole 83.4 / dims 89.9 / floaters 100 (receipt scratchpad
e-round/kursk-verify-sim.json) vs the standing raw close 82.6 / dims 100.
+0.8 whole buys -10.1 dims — dims sovereignty confirms the packet's own
adjudication: the RAW instrument close is the better line. Warp stays
unexecuted; the ~8-pt whole ladder (K-5 wedge plan + turret front vs the
raw print) remains the documented build-side path.

## BANKED WARP PLAN (§E)
Frame: mpu 0.240642, ground rawY 1.0002, tail rawF 1105.3977 along '-x'.
```
y_map   (gate m): [[0,0],[1.55,1.55],[2.20,2.20],[2.73,2.50]]
fwd_map (m from tail): [[0,0],[6.125,7.01],[9.224,9.65]]
```
SIM (unmodified gate): min 83.2 — whole 83.2, dims 89.9 (the warp's frame
shift costs dims noise; the RAW instrument close at 82.3/dims-100 is the
better line for this near-true print — warp optional, low priority).

## Evidence
- shots/ukraine-wave/pairs/ua_t80u_kursk-raw-*.png; printraw shots.

## Residuals
1. Whole 82.3 → 90: K-5 wedge plan + turret front mask work against the
   raw print (achievable without the warp; ~8 pts).
2. The tall 1G46 sight identity is p95-capped at 2.22; post-warp (kit band
   2.50) it can return to ~2.45 for ~2 curve pts. Orchestrator's call.

## §5.272 fix round (2026-08-17, verdict 8.4 -> ordered fixes delivered)
- Hash 3985f9b0 -> `1332bd55`. Gate ×2 bit-identical:
  `min 82.6 | whole 82.6 dims 100 floaters 100` (baseline 82.3 — IMPROVED
  +0.3, dims stays 100). Track-clip --exact --strict 0/0.
- (1) §B9 GEAR-VISIBILITY: skirt bottom authored to the print's exposure
  line (ruSkirtBand yBot 0.60 -> 1.02, lip 1.03; forward rubber droop kept
  as a short hem to 0.82) — all six dished wheels read side-on; wheel
  rim/hub contrast lifted per the tireHex/wheelHex law (0x2e2f29 /
  0x4b503d; the resident t80u guard proves the pipeline bar).
- (2) K-5 CLAMSHELL: the five small dome-hugging modules (one-smooth-shield
  read) replaced by the print's big split wedge plates — lower main + outer
  cheek wedges, upper clamshell plate pair on the dome slope, V tips
  meeting over the mantlet, dark seam gaps between every plate.
- (3) FOLDED NSVT READS AS A GUN (Challenger 2 folded-MAG precedent):
  receiver mass + top cover + left ammo can + long barrel with root ring
  and muzzle booster + spade grips + cradle blocks, all under the 2.20 p95
  datum (receiver top 2.195), exact-group census held.
- (4) LOG seated LOW on the stern (y 1.02 -> 0.64, print class) and
  DESATURATED (wood clone 0x77705d, ambient hook re-attached per the
  merkava gearFloor law); hanger straps root it into the stern plate.
- Owner 2b193244 absorb: their broken-Kontakt nose course intent is
  carried by the clamshell above (the U's armor grammar is the big-wedge
  split, not small cassettes); roof-relief intent already carried by the
  ground-up roof kit.

## §5.341 T-80 dome rebase + t90-read front + skirt/ERA program (2026-08-17,
## owner orders — same two-part order as ua_t80bv, kursk lane)
- Hash `1332bd55` (62/80579) -> **`fe3c4dc8`** (62/90089). Gate ×2
  BIT-IDENTICAL (row md5 ba313f37):
  `min 81.7 | whole 81.7 dims 100 floaters 100` (whole-view oracle class).
  **dims 100 HELD** (heightM 2.20 exact / hull 7.02 / overall 9.65 /
  width 3.60 at 0%); whole 82.6 -> 81.7 (-0.9, the ordered dome cost —
  released; dims held as commanded).
- DOME REBASE: the odd sz-1.12 ellipse replaced by the RESIDENT t80-line
  cast profile (t80.js buildT80Line v1 9-ring raw list), y-squashed 0.88,
  sz 0.88, cz +0.22 per the resident; turretG 1.50 -> 1.44 (ring recess +
  hidden carrier); gun axis holds its certified 1.70 world (gunG +0.06).
- T-90-READ FRONT: the §5.272 hand clamshell re-landed on the shared t90a
  grammar — eraRuCheeks 'k5' DARK steel wedge leaves (kursk identity vs
  the bv's scheme paint; k5Seg 5, k5D 0.55 dome-hug, k5Lower two-leaf,
  flank tiles) + a varied MIXED-BUCKET brick course ×4/side (alternating
  camo/steel, depth and pitch — the varied-field law) + the V tips
  re-seated at the new casting front (z 1.56, meeting over the mantlet)
  + mantlet under-blocks at the face.
- ROOF RE-SEAT on the rebased skin: the tall right-forward gunner sight
  keeps its ONE budgeted p95 spike window at the same world band (top
  2.20-2.21); cupolas/TKN/vision blocks re-seated (tops 2.10-2.13);
  folded NSVT lowered to the new slope (receiver proud, top 2.06);
  asymmetric crates/snorkel/rail/whips pulled to the shorter rear wall
  (snorkel still crosses the bustle, print tell held); smoke banks flush
  on the cheeks (x 1.28, z 0.62); decals to the wall band (±1.37, -0.30).
- SKIRT/ERA PROGRAM: §5.272 band + 3 rubber fore-sections stay; SIX
  armored K-1 panels/side now run the full hull (face 1.783 inside the
  ±1.80 anchor §5.263; fronts to 0.84 / aft 0.87 — above the 0.775 wheel
  tops, §B9 wheels read) + skirt-top ERA strip; glacis: SECOND staggered
  K-5 chevron course at the toe — first lay at x->1.17 / z 2.83 entered
  the idler-lane strict sweep (34/16 voxel receipt, §5.272 precedent),
  re-seated x<=1.00 / z 3.02 -> strict 0/0.
- GATES: track-clip --exact --strict 0/0+0/0 sweep 0/0; §B2 holes 0; §B5
  0/0/0; census mg1+5d; npm test GREEN at the final state; guards as the
  ua_t80bv §5.341 list (russian residents byte-held — family DNA shared,
  distinctness via the dark-wedge front + UA kit).
- EVIDENCE: shots/ua-t80-rebase/ ua_t80u_kursk-{before,after}-* ×10 views
  (before at the pre-edit tree).
