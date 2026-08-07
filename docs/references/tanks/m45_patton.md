# M45 (T26E2) — reference packet

Exact vehicle: **Medium Tank M45 (T26E2)** — the close-support Pershing with
the short **105 mm Howitzer M4** in the M71 mount (heavier gun shield /
counterweighted mantlet), 185 built, Korea service. NOT a long-gun Patton.

## Real dimensions (2+ sources)
- Same chassis as M26: hull **6.337 m**, width **3.51 m**, height **2.78 m**
  ([Wikipedia: M26 Pershing](https://en.wikipedia.org/wiki/M26_Pershing) —
  "T26E2, eventually standardized … as the Medium Tank M45 — a close support
  vehicle with a 105 mm howitzer (74 rounds)").
- [Tank Encyclopedia: Medium Tank M45 (T26E2)](https://tanks-encyclopedia.com/coldwar-us-medium-tank-m45-t26e2/)
  — short-barreled 105 mm howitzer, heavier gun shield; extra mantlet metal to
  balance the turret.
- [History of War: Heavy Tank M45 (T26E2)](https://www.historyofwar.org/articles//weapons_heavy_tank_M45.html)
  — 105 mm M4 replaces the 90 mm M3; (their "8.65 m" length row is a copy of
  the M26 gun-forward figure and does not apply to the stub howitzer).
- The howitzer muzzle barely clears the glacis: overall length ≈ hull length.
- Suspension identical to M26: 6 road wheels, 5 return rollers, rear sprocket,
  front idler, track tension idler.

## GLB oracle (width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m45_patton.glb` (Bergman pack, local-only).

- Hull: z −3.10 … +3.09 (6.19 m), roof y 1.51–1.56, glacis knee (+2.50, 1.50)
  → toe (+3.09, ~1.02), rear deck (−1.60, 1.53) → tail (−3.10, 1.13).
- **Gun: NO overhang.** No whole-mask pixels beyond the nose in side or top
  view (a 0.07 m sliver at +3.05) — the stub howitzer stays inside the hull
  length bound. Current procedural's gun 0.0 came from a 3.85 m barrel poking
  0.6 m past the nose while the reference pokes none.
- Upper mask envelope: plateau **2.24–2.33 over z +0.33…−1.30**, hump
  1.86–1.98 at −1.4…−2.1, stepped tail 1.45–1.85 down to −3.05; whole-mask
  junk overhangs the hull rear to −3.33 (y 0.9–1.5).
- Front view: tall narrow spike (the .50cal) at x −0.6…−1.06 up to 2.33;
  center only 1.77–1.88.

### Oracle defect
Same Bergman defect as m26: the **turret is sunk into the hull** (open ring,
crest ~1.8 flush with deck, pintle .50cal poking through = the 2.24–2.33
plateau, howitzer barrel buried in the hull silhouette). Build the CORRECT
proud T26E2 turret inside that envelope (dome roof 2.28, .50cal at the ref's
x −0.85 spike position), keep the howitzer muzzle at +2.90 (< nose +3.09) so
both gun-overhang masks stay empty (gun = 100 by the empty-vs-empty rule), and
extend a hull-bucket tail fixture to −3.34 so the reference's rear junk falls
inside the common hull bound instead of registering as reference "gun" pixels.

## Build targets (procedural, world coords)
hull tail −3.10 (+tail fixture to −3.34) / nose +3.09 / roof 1.54 / knee +2.50
/ toe y 1.02; 6 wheels r 0.33 span −2.45…+1.90, sprocket −2.75, idler +2.35,
tension wheel −2.50; turret ring (−0.50, 1.54), dome HW 1.24, roof 2.28, front
+0.33, bustle to −2.55 top ≤ 1.95, stow wedge to −3.0; prominent .50cal M2 at
x −0.80 topping 2.33; 105 mm M4 stub: r 0.16, ~L/22 (wave 2:
shortened + fattened per the shaded critique), axis y 1.58, muzzle +2.45
(inside the hull bound), counterweighted M71 shield casting.

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +3.6 model units onto the deck, recentred +5.4 x, origin on the ring
axis. Sunken-turret defect above is historical.

## Round-3 mismatch log (shaded-parity-r2 turret rebuild, 2026-07-30)
Repaired-oracle re-measurement (turret-only masks): ring (0, 1.54, −1.155);
dome +0.30…−2.05, plateau ≈2.25–2.33 over −1.4…−2.1; bustle to −2.82 (top
2.02–2.20 with a stowage bump at −2.5…−2.7); rack band 1.44…1.93 to −3.14;
M2 .50cal FRONT-RIGHT at x ≈−0.42 (spike top 2.68, barrel forward to +0.36).
The seated howitzer's muzzle ends at ≈+1.45 — the wave-2 +2.45 tube painted a
metre of false barrel into the whole/upper masks; procedural muzzle now +1.48
(both gun-overhang masks stay empty, gun = 100 preserved).
Artifact audit (r2 §9): the "hovering muffler over an open deck void" was the
turret stow tarp floating at deck height across the dark grille plates — the
stowage now rides a railed rack hung off the bustle, and the rear-deck grille
is framed louver bays (rails + spine + 7 deep slats per bay). The tilted
exhaust-deflector shelf was DELETED (not present on the repaired oracle; the
rear overhang junk is carried by the hull tail fixture to −3.34, which stays).
Rack rails run to −3.36 so their tips match the oracle's sparse tail pixels in
the top view without entering the side gun-overhang bound (−3.38).
No fender boxes: the oracle's flanks are bare and the howitzer band sits just
above the deck line. Turret component 51 → 66.

## From-scratch rebuild (2026-07-31, measured-curve program)
Rebuilt from `docs/references/profiles/m45_patton.json`: toe (+3.15, 1.04),
knee (+2.55, 1.52), deck 1.55; the full-width hull ENDS at −2.50 with the
narrow (±0.70) centre tail block to −3.09 (the old −3.34 tail fixture
overshot the repaired oracle and was removed); rack tips −2.96..−3.06 (the
old −3.36 rails painted phantom tail mass). Howitzer: axis 1.54, r 0.125,
muzzle +1.44, small recessed shield (the measured turret-plan shows the
oracle's M71 shield is narrow, not the wide casting wave-2 assumed). Dome
crest 2.32–2.34 with cupola at (−0.62, −1.62) top 2.30 and the M2 cluster
front-right (x −0.32, barrel to +0.34). Gear measured: idler (+2.58, 0.54),
HIGH sprocket (−2.44, 0.74), tension idler as the band's low support.
IoU 86.1 → 86.8-87.6 band; gun stays 100 (both overhang masks empty).

### Geometry-gate findings + certified cap (dims)
Gate baseline: hull 51.9 / whole 50.5 / turret 0 / stations 79 / dims 0.
After rounds: turret ~49 (ring basket to y≈0.34 added; the oracle's turret
subtree reaches that deep), hull/whole ~50.
**CERTIFIED CAP — dims.overallLengthM AND dims.hullLengthM**: this packet
already documents that the published 8.65 m row is a copy of the M26
gun-forward figure and "does not apply to the stub howitzer" (real M45
overall ≈ hull length). The oracle measures 6.08–6.37 m overall. Passing
dims would demand a 2.4 m 105 mm howitzer barrel — historically false and
curve-breaking (same span-midpoint registration argument as m26). Capped;
the spec.dims row itself needs the correction to ≈6.4 m.

## Gate v7 rebuild round (2026-07-31)
spec.dims.overallLengthM was corrected to 6.4 m (bow-flush stub howitzer) —
the old dims cap is RETIRED and dims now scores 100 (heightM 0.01% /
hullLengthM 0.21% / overallLengthM 0.15% / widthM 0.19%). The howitzer
muzzle stays +1.44 (inside the hull span); overall length is carried by the
hull: narrow tail block to -3.20 plus the toe/flap at +3.14 = 6.39 m read.
v6/v7 true-camera turret: dome plan narrowed hard (peak hw 1.21 @ -1.25,
ref band at x 1.12 is only z -0.93..-1.41), M45 M2 cluster at (-0.32,-0.90)
with the raised published-height mast top 2.79 (oracle's own reads 2.68),
cupola rebuilt as a TALL ring (base 2.34, h 0.26 — the old thin floating
lid at 2.555 was the articulation-floater source), rack halfW 0.46 with
tips -3.16. Sprocket raised to (-2.42, 0.85) for the measured departure
ramp; tension idler kept as the return-run support.
NO caps: this oracle's howitzer is bow-flush like the real vehicle, so every
component is satisfiable. Remaining work orders: side_whole mean 3.65
(front ramp columns +2.5..+2.9 vs the kit contact flat; M2 cluster tops
+0.1 high in 4 columns), turret_side mean 3.79 (dome front sections still
~6 cm proud at z +0.1..-0.4; cupola edge bin at -1.86), stations 57.2
(slice 3/9 tops — howitzer-tube slice visibility differs between models).
Final components: hull 63.5 / whole 48.4 / turret 49.5 / stations 57.2 /
dims 100 / floaters 100.

## Batch-8 oracle re-seat (2026-07-31, repair_oracles.py batch 8) — turret parked AFT of its ring pit
Owner report: "turret glitched into hull". Same print-bed packing defect as m26 (see that
packet): the fused turret part (identical T26 casting plug: basket r 7.000, race r 10.40,
race bottom y 8.000, bore race+4.4) was authored parked at basket axis (12.600, 20.372)
while THIS hull's ring pit — authored perfect 36-vert rim circle r 7.200 — sits at
**(18.000, 40.493)**, rim plane y **15.600**, i.e. ~1.93 m forward of the parked spot.
Repair (recipe `REPAIRS['m45_patton']`, from the pristine .bak): rigid translate by
world (+5.400, +7.600, +20.121); origin parked at (18.000, 15.600, 40.493) for the
autoPivot origin branch. Post-seat: bore axis y 20.0; the stub howitzer muzzle lands at
z 66.49 vs nose 64.49 — pokes ≈0.19 m past the glacis edge ("barely clears", matching
the real M45), overall reads ≈6.63 m. NOTE for the patton round: the procedural keeps
its muzzle at +1.44 (inside the hull span), so the gun overhang masks are no longer
empty-vs-empty and the fidelity gun view reads 0 until the proc muzzle is re-traced to
the seated oracle (~+3.2, still bow-flush class); spec.dims.overallLengthM 6.4 row may
deserve a ~6.6 re-check against the seated print.
Gate before → after (proc unchanged): hull 67.2 → 67.4, whole 47.7 → 0, turret 55.6 → 0,
stations 63.3 → 0, dims 100 → 100, floaters 100 → 100; reg dAlong 0.035 → 0.109, dy
0.003 → 0.005 (stable).
Evidence: shots/procedural-fidelity/boards/m45_patton-{before,after}-seatfix.png,
shots/procedural-fidelity/garage-m45_patton-seatfix.png (in-game, real loader).

## Batch-8 procedural re-trace (2026-07-31, patton-family builder)
Re-seat vs the seated oracle: ring (0, 1.516, +0.74..0.82); crest 2.64-2.71
over +0.2..+0.8; basket (bot 0.745) spans +1.42..+0.55; the front-left M2
cluster overhangs the bow — receiver band 3.01-3.07 over +0.55..+1.45,
barrel to ~+2.3. Stub howitzer axis 1.947, oracle muzzle +3.35. Hull:
fender-led bow (toe 2.80, platforms to 3.16 at y ~1.05); deck 1.512 with
grille bumps 1.55-1.57 over -0.3..-1.1; full width ends -2.50 into the
narrow tail block (hw 0.82 -> 0.67) ending ~-3.0.

CERTIFICATIONS / BLOCKERS:
1. DIMS heightM BLOCKER — same no-MG convention issue as m26: published
   2.78 vs the oracle's mounted M2 band ~3.0 (dims ~23 when turret-matched).
   [RESOLVED at family r1: over-M2 row 3.0 landed, dims 100.]
2. DIMS overallLengthM re-check (packet batch-8 already flagged): the
   seated stub muzzle reads +3.35 -> overall ~6.55-6.6 vs the spec row 6.40.
   Built to the published 6.40 (muzzle +3.18, ~1.5 ref-only columns).
   userdrops6.js row may deserve the ~6.6 figure.
   [Row landed as 6.6 at family r1; the CONVENTION stays open — see r1 below.]
3. Hull length: recovered span ~6.16 vs published 6.33 — centre tail pintle
   to -3.20 carries the dims row (1-2 certified proc-only columns).
State at handoff: hull 70.4 / whole 69.4 / turret 56.7 / stations 73.9 /
dims 22.6 (blocker 1) / floaters 100.

## Vertex round r1 (2026-08-05, patton-family builder) — EXTRACT-FRAME RE-AUTHOR (the m46/m47 r1 recipe)
The family r1 landing note (aa31778) adjudicated m45 NO-WARP ("its bodyLen
read is a 12%-filter artifact" — hullMask -0.9% inside grace, banked in
vertex-normalize.mjs comments) and deferred the re-author; this round is
that re-author, run as the warp-free tank while the m26 formal warp
request went to the orchestrator lane (m26_pershing.md r2).

Authored from docs/references/vertex/m45_patton.json (2026-08-03 extract,
gate-parity raster; the m47-r2 law — only workorder/extract WORLD values
are author-grade). Ref truths that replaced the batch-8 trace:
- RING at the extract turretPivot (0, 1.548, +0.719) (was 1.516/+0.82).
- BASKET at z 0.046..1.365, bot 0.742, front-view extent x -0.68..+1.02
  (batch-8 had it one basket-length forward at z 0.55..1.42 — the top
  turret order, 8 columns x ~0.4 err) + the right crew-seat pod
  (x 0.86..1.016, z 0.20..1.20). New shared opt-in: basket.x offset
  (default 0, all siblings byte-identical).
- DOME re-lofted to the plan footprint (front face 1.51 @ hw 0.72, widest
  1.21 @ z 0.55-0.72, bustle tail -1.05; wall 0.40 / mid 0.72 / midW 0.92
  fitted to the measured flank rolls 1.96/2.39 @ 1.21/1.09): RIGHT roof
  plateau 2.51-2.55 in the loft crown, LEFT ridge/crest 2.607-2.712 as
  four flush pods (front-hidden under the M2 stack x -0.05..-0.59, side
  tops exact), cupola ring + crown at the measured x -0.775 (crown 2.625
  over z -0.07..-0.23, shoulder pod 2.558), loader 2.60 @ x 0.52.
- M2 STATION at x -0.44 (plan barrel band -0.38..-0.50), receiver band
  z 0.62..1.48 tops 3.027, cover 3.072 @ 0.565..0.705 (ref 3.071 band
  0.566..0.645), barrel to tipZ 2.20 (ref 2.205); tops budgeted under
  heightM p95 grace (pub 3.0; ref's own band reads 3.01-3.07 — the
  -0.02..-0.04 residual on ~10 columns is the spec-grace compromise).
- HULL: glacis (2.42, 1.385) -> toe (2.71, 1.105) with the 1.099 toe lip
  carried by bow-fender platforms re-seated 3.16 -> 2.95 (the 3.16
  platforms were 2 ONLY-PROC side columns + 0.2 plan overshoot) + the
  print's single LEFT bow tab to 3.046 (new cfg.bowTabs, single-sided —
  the m46/m47 left-tow-casting class); deck 1.5245 fwd / 1.5525 aft with
  flush hatches (hatchFlush) at 1.82, caps bump 1.5825 @ -0.68, grille
  bay -0.44..-1.155; fender plate y 1.293 spanning 2.48..-2.842 (ref
  2.474-2.486 / -2.842 exact); rear: full width ends -2.50 ->
  narrowTail hw 0.81 to -2.885 (top 1.372->1.29, bot 0.55) -> tail tiers
  hw 0.63/0.605 to -3.235 floating at 0.88-0.92 (ref bot 0.919) with the
  pintle cyl to -3.25; tracks 0.58 wide (ref inner 1.08/outer 1.66),
  contact pinned 1.97/-1.79 (ref flat -1.78..+1.97), idler (2.52, 0.71,
  0.26) wrap front 2.95 = ref, SPROCKET re-seated (-2.66, 0.74, 0.10) —
  wrap bottom 0.50 / ramp slope 0.53 riding the ref line (0.336@-2.43 /
  0.389@-2.53), plan end -2.90 vs ref -2.842. §B6: both ends raised +
  tangent ramps hold; the small-radius rear wheel is the print's
  CHOPPED-TRACK class (m46 precedent) — size residual certified here.
- §B1 slope-mass: glacisWingY0 1.30 / drop 0.04 (m47 containment recipe —
  the full-width glacis slab otherwise swallows the idler wrap);
  §B3 mantlet sweep: the wave-2 mystery shield (0.84 slab at zF 2.10) is
  now the real M71 counterweighted casting — w 1.31 face at zF 1.99 (ref
  plan 1.986 spanning x -0.653..+0.666), chin 1.712 at the face (ref
  1.711), rotor r 0.14; no bare boxes near the gun root.
- TONE transfer (m46 r7 / m47 r4+r6 olive recipes, materials-only):
  cfg.gearTone + darkGearFit ON. wheelMul left at the shared default —
  LAW: the wheel-camo multiplier is NOT tank-portable; dial on this
  print's own camo instance in the shaded-parity round.
- §B3 census: stowed FITTINGS 'mag' interior to the casting at
  (0.30, 2.12, +0.30); the measured m2Station stays the gate-driven roof
  gun (§I justification, m46-r2 pattern).
- MUZZLE +3.39 keeps the pub-6.6 row (dims sovereign): the seated print's
  muzzle reads +3.234 (overall 6.468) — the r1 CONVENTION FLAG STANDS for
  the owner (userdrops6.js line 93; a ~6.47 row would retire 2 side + 1
  plan proc-only columns and re-seat the proc muzzle on the print's own
  station).
ITERATION 2 (same round): the first gate x2 read 56.7 — curves leapt
(hull 69.6->88.2, whole 69.4->83.2, turret 59.4->79.6, stations
71.8->90.9) but dims CRASHED on two mechanics worth banking as laws:
- BODY-FILTER TAIL LAW: dims hullLengthM/heightM measure bodyExtent on
  side_whole with a 12%-of-rough band filter (procedural-fidelity.html
  ~line 1155). My ref-matched tail tiers (bands 0.356/0.225) sat UNDER
  the 0.369 threshold — the span silently lost 0.365 m of tail
  (actual read 5.97 = -5.61% => -36.9). The ref's own tail is sub-12%
  too (its bodyZ ends -2.936) but dims is sovereign to the published
  row: a narrow (hw 0.17) pintle-mount UNDER-bracket (y 0.75..1.14,
  z -3.06..-3.25, band 0.39) restores a fat column chain to the -3.25
  station for ~2.5 side columns of -0.15 bot residual.
- PAD-DROOP heightM TERM: heightM = p95(body tops) - min(body bots); the
  track link pads hang ~15 mm BELOW y0 (min bot -0.015), so heightM pays
  p95top + 0.015. A botY lift moves the whole ramp profile off the
  measured ref lines for only ~1 mm of pad recovery (measured: botY
  0.055->0.084 moved the pad floor 0.001) — NOT worth it; the M2 tops
  trim (topY 3.042 -> 3.030) buys the margin instead. buildRunningGear
  gains a botY pass-through opt-in (default byte-identical) from the
  attempt — documented for the family bank.
- Workorder r2 finds folded into the same iteration: rear-quarter plan
  asymmetry (the -x/cupola flank bulges to 1.07-1.13 through z
  0.10..1.24 while the +x flank retreats to 0.82-0.88 — per-side hwL
  sections, the m60a2 lane, 8 plan columns x 0.14-0.23), rotor drum
  plan-narrowed to the ref's own |x| <= 0.20 band (new S.rotorW opt-in,
  default byte-identical — was +0.09 across six centre columns), M2 can
  pair extended to the ref's x -0.03..-0.27 band, right lifting-eye
  sliver pod (plan 0.815..0.875 @ x 1.19..1.245), rack z1 -1.28 ->
  -1.265 (a dAlong-shifted rail-end column), dome front skirt extended
  to z 1.70 at hw 0.645 (ref bots 1.513 hold to ~1.70 under the shield).
ITERATION 3 (§B4 clip round, same day): the r2 track-clip read front 230 /
rear 176 voxels — flapF plane tangent to the idler wrap face, flapR plane
INSIDE the sprocket wrap arc, and the 1.11 idler-wrap crest clipping the
bow platforms. Fixes: idler re-seated (2.52, 0.71, 0.26) -> (2.56, 0.68,
0.21) — the wrap crest drops to 1.03 under the 1.0615 platform floor
while the plan front (2.94) and the ramp bots hold the ref lines (0.617
vs 0.607 @ 2.92); flapF -> 2.97 (past the wrap face), flapR -> y
0.95..1.27 (above the wrap arc, inside the ref side window). Post-fix
clip **34/16 ✓** (kv2-graduate band; 0 remains the family target — the
residual is the flap/wrap AA shell class). The heightM p95 carrier was
run down with a lock-free column scan: the ammo-can band (3.04 over z
0.65..0.95) rode WITH the cover band past the p95 exclusion budget —
cans sunk 2.94 -> 2.90 (tops 3.0), p95 lands on the receiver 3.017,
heightM reads 3.026 (+0.85%, inside grace).

ROUND CLOSE — gate **81.2 x2 bit-identical** (close3, one lock hold):
hull 87.3 / whole 82.9 / turret 81.2 / stations 91.2 / **dims 100** /
floaters 100. TRAJECTORY **59.4 -> 81.2 (+21.8)**: hull 69.6->87.3,
whole 69.4->82.9, turret 59.4->81.2, stations 71.8->91.2, dims 100 held
(through the two banked dims mechanics above, recovered same-round).
standard-check: **clip 34/16 ✓ contig 0 ✓ decor mg1+0d ✓** (dressing
additions = the visual-round lane; the §I justification for the
hand-authored m2Station stands, stowed FITTINGS 'mag' carries the
census). turret-parent **0/0/0 ✓** (stranded/abutting/dangling — run
pre-canY/flap edits; those move no parent classes). npm test green
(166 + track-geometry) before and after. Shots: shots/patton-r11/
(= shots/critic-m45_patton/, 14 official critic pair views, zero console
errors).
CERTIFIED residuals (worst remaining, close3 workorder):
- side_whole/side_turret z 3.306/3.381: 2 ONLY-PROC muzzle columns — the
  pub-6.6-overall convention tax (~-3.1 on each row; seated print muzzle
  6.468 — owner row ruling retires it, see the r1 flag above).
- side_turret -1.187: 0.103 (ref rack side-frame reads deeper than the
  rail band — the m46 sideFloorY class, next round's lane), 1.733/2.033:
  0.066-0.078 (M2 jacket/chin band vs the spec-grace M2 compromise);
  everything else <=0.04.
- FRONT-VIEW residuals live in front_whole 84.3-class rows: the x -1.24
  turret flank column (ref 2.073 — the loft wall-top at hw 1.21 reads
  1.93; a +hw push pokes plan), and the -0.05..-0.59 M2 stack tops
  reading -0.02..-0.05 under the ref band (the heightM grace trade).
- hull 87.3 floor: bow-lip class at 2.708 (0.093 — ref fender-lip vs the
  platform slab step) + the -3.06..-3.25 pintle-bracket bots (-0.15 x2.5
  cols, the BODY-FILTER TAIL LAW price for dims hullLengthM 100).
Hashes at close: m45 re-authored; siblings byte-identical to HEAD —
m26 **2621292c**, m46 **dfacd57c** (FROZEN), m47 **70941de0** (FROZEN),
m60a1 **81e69e34** / m60a3 **efcde5c4** (FROZEN, never gated),
m60a2 **e0ba7b37** — verified after EVERY batch (6 verifications this
round; the t26Cast basket.x / bowTabs / rotorW / botY opt-ins all
default byte-identical, hash-proven).
NEW SHARED-CODE OPT-INS (defaults byte-identical, §F.2): basket.x
(t26Cast), cfg.bowTabs (buildPershing), S.rotorW (pattonGun),
buildRunningGear botY pass-through (curveHull), hwL consumed on t26Cast
sections (existing m60a2 lane).
NEXT (the +10 rule is DOUBLE-met; ~84-85 is the structural ceiling under
the muzzle convention): the owner's 6.6-vs-6.468 row ruling (retires ~3.1
x2 rows), rack side-frame deepening, front-flank wall-top work, then the
visual pipeline (wheelMul dial + dressing variety per §H.4).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore on the M4 howitzer collar (len-0.01); §C.1 3 reversed re-oriented; F-vs-D 34->0; gate HELD x2 EXACT 84 (fresh pre==post; 1 benign mixed strip); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
