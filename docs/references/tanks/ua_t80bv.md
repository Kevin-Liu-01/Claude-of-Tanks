# ua_t80bv — T-80BV in Ukrainian service — §5.248 ground-up round packet

## Round (2026-08-17, ukraine §5.248 builder lane)
Ground-up §K rebuild replacing the donor-clone composition
(`T80_PROFILES.t80bv.build` + kit). New builder `buildUAT80BV` in
`src/vehicles/profiles/ukraine.ts`. Donor t80bv untouched (hash d2d21390
held through the round).

## Print / instrument
- `public/models/community-candidates/t80bv_ua_manako.glb` — WT-fingerprint
  EXTRACTION-SUSPECT (`_vlo`/Tr1/bashnya scheme; ATTRIBUTION), LOCAL-ONLY.
- ORIENTATION FIX (this round): muzzle toward raw -Z with the gun FUSED in
  the `bashnya` subtree (nothing for the page auto-flip to read; the bo4ki
  drums + log sit at the raw +Z end) → `yawOffset: Math.PI` in all three
  maps + vertex REG.
- _vlo AUDIT (BUILD-STANDARD §E class): `T80BV_chassis_vlo.0` (11316v)
  rides the hull node but spans only y 0.10..1.12 inside the chassis+track
  union — a low-LOD running-gear shell, NOT an articulated-content bake;
  masks benign. Recorded in the vertex REG comment.
- ORACLE DEFECT (cap class): `bashnya_dz.0` (the turret ERA mesh) contains
  vertices reaching the tail (raw z to -4.95 post-yaw) — rear-hull
  furniture fused into the TURRET node. The ref's turret plan center
  column spans to -4.7; a correct build cannot match it (turret-row cap;
  a node-scoped split would repair it).
- Stylization: body +6.4% (drum/log overhang in the 12% band), roof-kit
  band +23% (NSVT mast to 3.43).

## Spec
- Donor dims already published-true (6.78/9.66/3.52/2.20) — no change.
  armorFactor/stats inherited unchanged.

## Build (measured lines)
- T-80 hull at ±3.39 with the print's lines mapped to the published datum
  (deck 1.505 family line, print's 1.58 → K.1-normalized), turbine stern
  hump 1.845 + lip, K-1 glacis raft, published T-80 gear constants,
  skirts at ±1.76 with the K-1 band over the front half (print dz1.003).
- Stern identity: the measured TRANSVERSE bo4ki drum pair on stern
  brackets (print x -1.65..1.56, y 1.27..1.85), unditching log LOW on the
  transom (the print's low rear band), rear fender tips carrying the
  published width to the tail station.
- Turret: cast dome (crown 2.16) at ring seat -0.05 (gate-verified; the
  extract's -0.49 was follower-polluted by the fused-gun shell), K-1 fan
  2×6 per cheek sweeping forward to the mantlet flanks + roof-arc pair,
  commander cupola RIGHT with the NSVT stowed across the rear roof arc
  (§K.4 exact-group census; p95 law), gunner hatch LEFT, Luna IR left of
  the gun, 902 banks, tied-down whips.
- Gun: 2A46M-1, muzzle +6.27 (overall 9.66 exact), bore r 0.082.

## Gate (close ×2, bit-identical)
```
min 2.4 | hull 56.2 whole 2.4 turret 18.9 stations 23.1 dims 94.6 floaters 100
```
- dims 94.6 (h 2.19/2.20, hull 6.89/6.78 +1.7%, overall 9.67, width 3.51),
  floaters 100, exact track-clip 0/0, holes 0, census mg1+5d PASS.
- CAPS: wholeCurves is dominated by the print's +23% roof-kit band (the
  2.3-2.9 furniture the p95 law forbids the build from carrying) and the
  fused-drum turret defect above; hull carries the +6.4% length overhang.
  All warp-class, banked below.

## §E STOPPED — revision disproven by isolation sims (2026-08-17, §5.248
## §E round; print PRISTINE, sha 4dd58764…, no recipe landed)
The REVISE hypothesis (tail-scoped fwd compress rescues hull) is
DISPROVEN. Three request-interception sims vs the standing row
2.5/56.8/19.3/26.7/95/100 (receipts scratchpad e-round/t80bv-*.json):
1. REVISED full plan (banked y_map + tail-scoped fwd_map [[0,0],
   [0.55,0.28],[6.906,6.78],[9.741,9.66]]): 0 | hull 32.9 whole 0
   turret 14 stations 36.6 dims 100 — hull STILL craters (56.8->32.9,
   same as the rejected uniform's 33.9).
2. Y-MAP ONLY (fwd identity): hull 32.9 whole 0 turret 21.8 stations
   53.5 dims 95 — THE Y_MAP OWNS THE HULL CRATER (its "directional"
   receipt was measured on the turret row only: turret +2.5 confirmed,
   hull -23.9 unmeasured at filing). Max-y drops 3.43->2.66 re-framing
   every court (k2 batch-56 frame-pin class) + the deck-band compress
   re-registers the hull rows.
3. (Uniform fwd receipt stands from the lane's own sim: 33.9.)
VERDICT: no filed or revised variant survives its own acceptance (hull
must hold); a working recipe needs a re-derived y_map (frame-pinned kit
band, deck untouched — pl01/k2 class) — NEW PLAN REQUIRED, not this
batch's to improvise. Print stays pristine; the whole/turret caps stand
as documented.

## BANKED WARP PLAN (§E) — REVISION FLAG
Frame: mpu 1.010217, ground rawY -0.8870, tail rawF -3.9124 along '-z'.
```
y_map   (gate m): [[0,0],[1.51,1.48],[2.29,2.20],[3.43,2.55]]
fwd_map (m from tail): [[0,0],[6.906,6.78],[9.741,9.66]]   <- REVISE
```
SIM verdict: the uniform body compress HURT hull (56.5→33.9) — the +6.4%
lives in the STERN drum/log overhang, not the hull proper. The recipe
needs the compression scoped to the first ~0.55 m from the tail
(fwd_map [[0,0],[0.55,0.28],[6.906,6.78],[9.741,9.66]]-class) or a
node-scoped z-map; REPORTED for the orchestrator batch rather than
proposed as-is. The y_map half verified directionally (turret 18.9→21.9).

## Evidence
- shots/ukraine-wave/pairs/ua_t80bv-raw-*.png; printraw shots + node
  census (bashnya parent tree).

## Residuals
1. Whole row needs the y-warp (kit band) + the stern-scoped z-warp; then
   ladder from the sim order.
2. K-1 fan plan coverage vs the print's ±1.68 dz extremes (post-split of
   the fused mesh, or accept as furniture-cap).

## §5.272 fix round (2026-08-17, verdict 8.3 -> ordered fixes delivered)
- Hash bc3c80a -> `554591b8` (+6318 verts). Gate ×2 bit-identical:
  `min 2.5 | hull 56.8 whole 2.5 turret 19.3 stations 26.7 dims 95
  floaters 100` (baseline 2.4/56.2/2.4/18.9/23.1/94.6 — EVERY component
  improved; stations +3.6). Track-clip --exact --strict 0/0 (the interim
  deep-tile/raft configs printed 44/60 strict voxels — fixed to the
  resident-guard plate class + raft row-2 outer-column drop, receipts in
  shots/track-clip.json history).
- (1) BO4KI MUST-FIX: the hump's -3.14/-3.33 boxes buried the drum pair
  into a squared shelf — hump pulled FORWARD off the drum stations; the
  pair is now TWO REAL TRANSVERSE CYLINDERS (18-seg, print-exact z -2.86..
  -3.40, y 1.305..1.845) on open brackets with proud rim rings, recessed
  end faces + filler bosses reading at side garage, a 0.29 m center gap +
  gap saddle post reading at the rear, cradle pedestal + tail step tucked
  UNDER the arc (mask-neutral, round read stays proud). Stern grille held
  at its measured seat below them.
- (2) §B9 MUST-FIX (worst print-parity gap of the four): skirt bottom
  0.60 -> 1.03 (resident t80bv class), K-1 skirt plates to the print's
  0.87 band over the gear + the FRONT PAIR at the resident guard's deep
  class (bottoms 0.74, th 0.028 at the 1.7295 inner face); tireHex/
  wheelHex contrast (0x2e2f29/0x4b503d) — all six dished wheels read.
- (3) GLACIS RAFT: three courses CLIMBING the glacis surface (the old
  row 1 sat 0.2 m INSIDE the hull — zero pixels), h 0.135 tiles with
  alternating proud checker offsets + dark lids; splash board moved
  upslope clear of the raft; row 2 runs 3 columns (lane-clearance
  receipt above).
- (4) LUNA-4 READABLE left of the gun: scheme-painted 0.185 drum on a mask
  bracket in the GUN frame (elevates with the tube — the real L-4A
  articulation) with dark face rim, recessed lens + inner lens ring; the
  old turret-bucket lamp was a sideways-rotated cylinder reading as
  nothing. The forward mask seat also bought stations +3.6 (the aft seat
  A/B measured -3.6).
- (5) PENDANT-ROD READ FIXED: the 0.945-wide bow tip bars hanging their
  flaps at the skirt plane are gone — fender bridge continues the sponson
  strip over the idler, tip plate at the fender line, flap chained under
  it (z 3.35, inside the bow).
- Owner 2b193244 absorb: ventilator mushroom ADOPTED (left rear roof);
  Luna lens-ring intent ADOPTED into the gun-frame drum; their
  turret-bustle transverse drums are SUPERSEDED by the print-station hull
  drums (packet AABB: the print's bo4ki live at the tail, z -2.87..-3.40 —
  the print merely fuses them into the bashnya node, the documented oracle
  defect); their K-1 fan/roof-relief intents already carried ground-up.

## §5.341 T-80 dome rebase + t90-read front + skirt/ERA program (2026-08-17,
## owner orders: "use the same base t80 turret shapes again used with russian
## tanks instead of the new odd base shape" + "a ton more varied era in front
## that makes them look like t90 turrets a bunch of sideskirts and more era")
- Hash `554591b8` (58/96877) -> **`1e175410`** (58/100843). Gate ×2
  BIT-IDENTICAL (row md5 96addfeb):
  `min 0 | hull 57.1 whole 0 turret 0 stations 9 dims 97.4 floaters 100`.
  **dims 95 -> 97.4 IMPROVED** (heightM 2.20 exact 0.19% — squash 0.94 @
  the 1.44 ring seat receipt; hullLengthM 6.87 improved from 6.89; width
  3.52 0.13%); floaters 100; hull 56.8->57.1. whole 2.5->0 / turret
  19.3->0 / stations 26.7->9 are the ORDERED dome cost (the russian-shape
  casting vs this print's own tall-ellipse turret — "will measure whatever
  it measures", released by the order; dims held as commanded).
- DOME REBASE: the odd sz-1.10 9-ring ellipse replaced by the RESIDENT
  t80-line cast profile (t80.js buildT80Line BV raw ring list [[1.44,.06],
  [1.465,.42],[1.435,.47],[1.28,.655],[1.19,.69],[.80,.74],[.02,.75]]),
  y-squashed 0.94 above the 0.06 base, sz 0.88, plan bias cz +0.17 per the
  resident; turretG 1.50 -> 1.44 (ring recess; hidden carrier box) — the
  gun axis holds its certified 1.69 world (gunG local +0.06). meshDome ->
  meshDomeCurved is normals-only (silhouette-identical lathe).
- T-90-READ FRONT: the K-1 hand fan + roof-arc pairs superseded by the
  shared t90a grammar — eraRuCheeks 'k5' scheme-paint clamshell leaves
  (k5Seg 4 seams, k5D 0.52 dome-hug, k5Lower two-leaf plates, 3 flank
  tiles/side) + a VARIED dark brick course ×4/side on the upper slope
  (alternating depth/pitch — the wedge+brick mix law) + mantlet
  under-blocks re-seated at the new casting front.
- ROOF RE-SEAT (the resident dome is fuller at mid-radius — old seats
  sink, §5.04): cupolas/TKN/periscopes/vision blocks/mushroom/NSVT all
  recomputed on the rebased skin (skin-math seats, bases buried 1-2 cm,
  tops 2.18-2.21 = the heightM p95 carrier band); smoke banks re-seated
  flush on the casting cheeks (x 1.36, z 0.64); bustle rail/boxes/tarp/
  whips pulled to the shorter rear wall; decals to the fat wall band
  (±1.39, z -0.30).
- SKIRT/ERA PROGRAM: K-1 plate row now runs the FULL hull (8 panels/side
  at the §5.272-proven 1.7435/0.028 deep-class face, fronts to 0.74, aft
  0.87 — all above the 0.775 wheel tops, §B9 wheels read; panel run
  CLAMPED inside the -2.66 band end — the first 0.705-pitch lay enclosed a
  2-cell §B2 stern pocket per side, swap-run receipt holes 0@HEAD ->
  fixed 0); skirt-top ERA cassette strip on the lip; rubber fore-sections
  ×2/side at the idler lane; glacis: varied 4th half-tile course on the
  toe (x <= 1.10, clear of the §5.272 idler window). Width guard §5.263:
  all faces <= 1.7505 inside the ±1.76 anchor — widthM 3.52 unmoved.
- GATES: track-clip --exact --strict 0/0+0/0 sweep 0/0; §B2 holes 0; §B5
  0 stranded / 0 abutting / 0 dangling; census mg1+5d; npm test GREEN at
  the final state. Guards byte-held: t80b fc659eb8 / t80u e963fb60 /
  t80bv d2d21390 (the russian residents — family DNA shared, bytes
  untouched, distinctness via the UA scheme-paint leaves + full skirt
  program) + ua_m1a1 f7d2ec40 / t84 54b9debb / ua_t64bv 4fac9a30 /
  ua_t84_oplot_m 66fc1724.
- EVIDENCE: shots/ua-t80-rebase/ ua_t80bv-{before,after}-* ×10 views
  (before at the pre-edit tree) + after-yaw06 set (§B5 rotate-as-one in
  pixels).
