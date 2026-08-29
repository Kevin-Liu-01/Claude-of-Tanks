# M26 Pershing — reference packet

Exact vehicle: **Heavy/Medium Tank M26 Pershing** (production, 90 mm Gun M3 with
double-baffle muzzle brake, T80E1 24" tracks). US, 1945.

## Real dimensions (2+ sources)
- Hull length (turret aft): 20 ft 9.5 in = **6.337 m**; overall gun forward
  28 ft 4.5 in = **8.649 m**; width 11 ft 6 in = **3.51 m**; height 9 ft 1.5 in
  = **2.781 m** — [Wikipedia: M26 Pershing](https://en.wikipedia.org/wiki/M26_Pershing)
- Same figures repeated at [globalmilitary.net M26](https://www.globalmilitary.net/vehicles/m26-pershing/)
  and [onwar.com M26](https://www.onwar.com/wwii/tanks/usa/us022m26.html).
- 90 mm Gun M3 (M3 L/53, double-baffle brake, no bore evacuator), 70 rds.
- Torsion bar suspension: **6 road wheels/side, 5 return rollers**, rear drive
  sprocket, front idler, plus the small **track tension idler** ahead of the
  sprocket (kept in the M46 — [Wikipedia: M46 Patton](https://en.wikipedia.org/wiki/M46_Patton)).
- Turret: rounded one-piece **casting** with rear bustle, commander cupola
  right, loader hatch left, .50cal M2 pintle at bustle rear.
- Photo refs: [Wikimedia Commons: M26 Pershing](https://commons.wikimedia.org/wiki/Category:M26_Pershing),
  [militaryfactory M26](https://www.militaryfactory.com/armor/detail.php?armor_id=64).

## GLB oracle (local, width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m26_pershing.glb` (Bergman pack, CC BY-NC-SA,
local-only quarantine; visual oracle only).

- Hull: z −3.44 … +2.55 (5.99 m — the model is proportionally shorter than the
  real 6.34 m hull), roof y ≈ 1.53–1.57, glacis knee (+1.77, 1.53) → toe
  (+2.55, ~1.06), rear deck slopes from (−2.10, 1.51) to tail (−3.44, 1.24).
- Full width 3.52 in plan along the whole hull (sponsons over the tracks).
- Gun: tube emerges over the glacis at z ≈ +2.2, **muzzle +3.46** (0.91 m past
  the nose), tube plan width 0.24–0.28, **brake plan width 0.52** (double
  baffle), authored LOW (band y 1.03–1.38; see defect below).
- Upper mask envelope (whole−hull): mantlet region −0.5…−1.25 (top ≤ 1.77),
  plateau **2.26–2.35 over z −1.3…−2.9**, bustle/stowage tail to −3.44
  (y 1.5–1.8).

### Oracle defect (measured, load-bearing for scores)
The recovered model's **turret casting is sunk ~0.8–0.9 m into the hull**: the
hero render shows an open turret ring, the dome crest roughly flush with the
deck, the .50cal pintle MG poking through (that MG is the 2.26–2.35 "roof"
plateau above), and the 90 mm barrel emerging low over the glacis (band
1.03–1.38 instead of a ~1.9 m trunnion line). The procedural build keeps a
CORRECT proud turret sized into the oracle's upper-mask envelope (dome roof
2.30, bustle tail into the −3.0…−3.4 stowage band), so the turret component is
capped in front/rear views against this reference. Gun overhang is matched in
length/shape (the gun metric centroid-aligns, so trunnion height is free).

## Build targets (procedural, world coords)
hull tail −3.44 / nose +2.55 / roof 1.55 / knee +1.77 / toe y 1.06; sponson
floor 0.98; 6 wheels r 0.33 spanning −2.55…+1.75, sprocket −2.90, idler +2.10,
tension wheel −2.60 low, 5 rollers; turret ring (−1.70, 1.55), dome HW 1.24,
roof 2.30, front −0.55, bustle to −3.35; gun axis y 1.60 (wave 2: raised from the
oracle's sunken barrel line to the turret-lip/mantlet center per the shaded
critique; overhang length unchanged), muzzle +3.46, double-baffle brake;
muzzle stays 0.9 m past nose to mirror the oracle (real overhang is ~2.3 m —
oracle wins for scoring).

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +4.0 model units onto the deck and recentred (+5.4 x) on the hull
centreline; node origin parked on the ring axis for autoPivot. Sunken-turret
defect above is historical.

## Round-3 mismatch log (shaded-parity-r2 turret rebuild, 2026-07-30)
Re-measured the REPAIRED oracle via turret-only subtree masks (world coords):
ring axis (0, 1.54, −1.55); dome plan front −0.23 (center), widest ±1.26 at
z −1.2…−1.8, dome mass to −2.1; bustle (halfW ~0.8) to −2.9; stowage rack to
−3.48 in the 1.45…1.98 band; roof plateau 2.26–2.38; cupola on the vehicle
RIGHT (world x −0.3…−0.6, top 2.38); M2 .50cal at x 0…+0.5 topping 2.75 with
the barrel running FORWARD from a bustle pintle (band 2.67 to z −1.3); gun
axis y ≈1.60, muzzle band stays 0.35 dia (double-baffle body) from +2.7 all
the way to ≈+3.52 — the wave-2 "muzzle +3.46 with waisted drums" undershot
both. Procedural rebuilt to these numbers (turret component 60 → 76).
Wave-2 fitting corrections: fender stowage/tools moved from sponson height
(inside the full-width hull, invisible) to the glacis deck edge; the tow-cable
run was deleted — the oracle's flank along the gun-tube band is bare, and any
deck-edge kit there subtracts the tube band out of the upper-assembly mask.

## From-scratch rebuild (2026-07-31, measured-curve program)
Build rewritten in `src/vehicles/profiles/patton.ts` against
`docs/references/profiles/m26_pershing.json` (mask-trace-1024 of the repaired
oracle) — lofted station-slab hull following the deck/belly polylines, turret
lofted from the whole−hull side band + plan footprint (no lathe egg). Key
measured constants now in code: toe (+2.60, 1.08), knee (+1.82, 1.55), deck
1.57, sponson 1.05, tail duckbill prong to −3.48; dome front lip −0.06 with
the long 1.78→2.22 cast slope into a 2.34–2.37 crest; bustle 2.25→2.16 to
−3.02; rack to −3.40; M2 station z −2.72 band 2.66–2.76 with the barrel
forward to −1.28; gun axis 1.62, tube band dia 0.26, double-baffle body
0.34 × 0.50 from +2.92, muzzle +3.50. IoU 88.4 → 88.4 (T 75.8 → 77-79 band,
shaded pair reads as the same casting; boards in shots/procedural-fidelity/).

### Geometry-gate findings + certified cap (dims/overallLengthM)
`tools/geometry-gate.mjs` baseline (gate freeze): hull 55.4 / whole 51.0 /
turret 1.7 / stations 89.4 / dims 0. After the rebuild rounds: turret ~56
(the reference's rig_turret subtree carries a crew basket to y≈0.37 in the
ring zone — now modelled), hull/whole ~55, stations ~82.
**CERTIFIED ORACLE-DEFECT CAP — dims.overallLengthM**: the reference's 90 mm
M3 is modelled SHORT: measured muzzle +3.48 → overall 6.96 m (curve span
6.81 m body-filtered) vs published 8.65 m (21% short; real M3 overhang
≈ 2.31 m vs the oracle's 0.86 m). Matching published overall requires a
+1.7 m barrel, which shifts the gate's span-midpoint registration by +0.85 m
and zeroes EVERY curve component (hull/whole/turret) — published-dims and
measured-curve components are mutually unsatisfiable against this oracle.
No rigid transform can repair a short-modelled barrel (repair queue:
barrel-extension is a scale/translate of a fused gun submesh). The build
matches the oracle's gun band (the undamaged-views rule); dims.overallLengthM
stays capped until the oracle barrel is repaired.

## Gate v7 rebuild round (2026-07-31, published-length gun program)
Gun rebuilt to the PUBLISHED envelope per the v5+ hull-anchored registration
contract: 90 mm M3 muzzle now at +4.97 (overall reads 8.57 m vs 8.65 published,
0.91%; the last few cm were traded against the widthM bin-phase, see below),
double-baffle body 0.32 x 0.50 at the tube end, tube r 0.115 at axis 1.60.
The old CERTIFIED CAP on dims.overallLengthM is RETIRED — dims now scores
96.3 (heightM 0.99% / hullLengthM 0.40% / overallLengthM 0.91% / widthM 1.46%).
v6 true-camera constants baked into patton.ts: deck 1.535-1.55 (not 1.57),
casting crest 2.31 (not 2.37), plan peak hw 1.225 @ z -1.40, mantlet chin
1.17..1.43 sloping up to the face at -0.18, basket floor 0.375 over
-0.84..-2.16, M2 band top 2.78, high sprocket (-2.90, 0.85) fitting the
measured departure ramp, tail plan taper (full width ends -2.78, tip +-0.55).

### CERTIFIED ORACLE-DEFECT CAP — wholeCurves + turretCurves (short barrel)
The oracle's M3 tube ends at +3.52 (0.86 m overhang) vs the published-length
build's +4.97 (Δ = 1.45 m ≈ 15 gate columns at 0.097 m pitch). Because the
gun is below rig_turret in BOTH rigs, the delta lands in all four gun-bearing
rows, measured this round as:
- side_whole  coverPct 9.82  → −14.7 pts (proc-only barrel columns)
- turret_side coverPct 9.26  → −13.9 pts
- plan_whole  8 barrel x-columns read as BAND error (bustle rear + muzzle
  front in one column): mean +1.2% → ≈−14, p95 11.9% → −7.2
- turret_plan same mechanism: mean 4.18 includes ≈1.2% gun-column share
Structural ceilings against this oracle ≈ side_whole 85, turret_side 86,
plan_whole/turret_plan ≈ 78. hullCurves, stations, dims, floaters are NOT
capped (hull mask carries no barrel). A repair (scale/translate of the fused
gun submesh to the published overhang) retires this cap.

### Remaining work orders (fixable, not capped)
hull 56.1 (side_hull mean 2.9: bow ramp columns +2.2..+2.6 still read the
kit's contact flat vs the ref ramp; rear deck steps -2.4..-3.0 within 4 cm),
stations 60.2 (width column at the fender lip aliasing 3.35/3.51; slice tops
within 3%), whole/turret residuals beyond the certified columns ≈ mean 1.5%.
Final components this round: hull 56.1 / whole 37.7 / turret 43.1 / stations
60.2 / dims 96.3 / floaters 100.

## Batch-8 oracle re-seat (2026-07-31, repair_oracles.py batch 8) — turret parked AFT of its ring pit
Owner report: "turret glitched into hull". Vertex census re-diagnosis of the pristine
print (.bak): the fused turret part was authored PARKED, not assembled — laid flat for
printing (basket disc on y=0) and stationed ~1.77 m aft and 0.53 m left of the hull's
ring pit. Every prior "sunken turret" measure, the open-ring hero render, and the
CERTIFIED SHORT-BARREL CAP measured that parked pose. Kit truth (model units, y-up,
hull x 0..36 / z 0..62.47):
- turret plug: basket disc+wall r 7.000 (perfect authored circle = ring axis), ring-race
  cylinder r 10.40, race BOTTOM authored at y 8.000; bore axis race+4.4.
- hull ring pit: authored perfect 36-vert rim circle r 7.200 at **(18.000, 38.468)**,
  rim plane y **15.600** (fighting-roof plate), open interior below — the basket drops
  through with 0.2 u designed clearance, the race rests on the roof plate.
- batch-2 recipe had recentred x only (+5.4) and lifted +4.0 to a score optimum: casting
  left 1.84 m aft of the pit and race bottom 0.36 m below the roof plate.
Repair (recipe `REPAIRS['m26_pershing']`, re-runnable from the pristine .bak): rigid
translate of the fused Turret subtree by world (+5.400, +7.600, +18.096) — basket/race
axis ON the pit axis, race bottom ON the rim plane; node origin parked at
(18.000, 15.600, 38.468) so autoPivot's origin branch yaws about the true ring.
Post-seat: bore axis y 20.0 (≈1.98 m; real M26 trunnion ≈1.93), muzzle z 89.51 →
**overall reads ≈8.68 m vs published 8.65 (+0.4%)** — the SHORT-BARREL CAP's premise is
dissolved (the M3 was never short; the whole turret+gun sat 1.8 m aft of station). Ring
station is now z 38.47 ≈ 0.6 m FORWARD of hull mid (was measured at −1.55 m aft on the
parked print) — the procedural profiles/turret placement must be re-traced in the patton
round; wholeCurves/turretCurves/stations read ~0 against the un-rebuilt proc meanwhile.
Gate before → after (proc unchanged): hull 56.1 → 64.7, whole 37.7 → 0, turret 43.1 → 0,
stations 64.3 → 0, dims 97 → 98, floaters 100 → 100; side_hull reg dAlong 0.047 → 0.947
(registration absorbing the new normalization frame; dy stable 0.007 → 0.004).
Evidence: shots/procedural-fidelity/boards/m26_pershing-{before,after}-seatfix.png,
shots/procedural-fidelity/garage-m26_pershing-seatfix.png (in-game, real loader).

## Batch-8 procedural re-trace (2026-07-31, patton-family builder)
Full from-scratch re-seat of the procedural build against the SEATED oracle
(tools/tmp-patton-retrace.mjs world decode, hull-anchored registration).
Landmarks (proc frame): ring pit (0, 1.517, +0.19..+0.33 — frame follows the
final hull span); casting crest 2.66-2.69 (front view 2.63-2.75 incl. cupola);
basket to y 0.74; the mounted M2 assembly is ~1.65 m long — receiver band
tops 3.03-3.09 over z -0.45..-1.26, barrel line to ~+0.65. Hull: fender-led
bow (glacis toe ~2.39-2.52, fender platforms project ~0.15 further carrying
the bow silhouette at y 1.05-1.09); deck baseline 1.51 with the grille bay
reading 1.55-1.58 over -0.8..-1.9; tracks 0.62-0.65 wide (inner ~1.03);
stepped rear corner (tracks -3.15 / plate -3.07 / duckbills -3.31 / centre
-3.35).

CERTIFICATIONS / BLOCKERS:
1. DIMS heightM BLOCKER (needs an owner spec decision): spec.dims.heightM
   2.78 is the published no-MG figure (over cupola). The seated oracle's
   mounted M2 reads 3.03-3.09 across ~14 side body columns, so any build
   that satisfies turretCurves vs this oracle measures heightM ~3.05
   (dims ~28) and any build that satisfies dims 2.78 caps turretCurves ~76
   — mathematically disjoint (worked inequality in the builder session).
   m46 (3.18) and m47 (3.35) already use over-MG published rows. Options:
   heightM -> ~3.05 over-MG row (no verified published figure found in a
   quick search; Wikipedia/afvdatabase list only 2.78), or an owner call to
   build the M2 low and certify the turretCurves shortfall.
   [RESOLVED at r1: the over-M2 row landed as 3.02; the r2 true-up below
   re-measures the datum at 3.078 -> recommend 3.08.]
2. Hull-length tension (certified, structural): the recovered hull spans
   6.11 m vs published 6.33. dims stays sovereign: the excess is carried by
   the bow fender platforms (+gun-union body columns) and a narrow centre
   tail pintle stack to -3.61 — costing ~2-3 proc-only cover columns split
   between side_hull/side_whole. Oracle muzzle +5.21 vs proc published
   muzzle +5.00 adds ~2 ref-only columns (overall 8.65 sovereign).
State at handoff: hull 77.3 / whole 71.2 / turret 73.5 / stations 83.2 /
dims 25.3 (blocker 1) / floaters 100.

## Vertex round r2 (2026-08-05, patton-family builder) — FORMAL WARP REQUEST + heightM true-up verification
m26 stayed DEFERRED FOR POST-WARP RE-AUTHOR per the r1 landing note
(aa31778: "m26/m45 deferred for post-warp re-authors; three z-only tube/
body warp plans banked — EXECUTION FROZEN per the incident law"). This
section is the formal execution request for the banked m26 plan
(orchestrator lane per §E — builder reports plans + literals only; the
m45 ladder ran concurrently as the warp-free tank).

### FORMAL WARP REQUEST — m26_pershing body-stretch + muzzle-pin (m46 batch-36 class)
Print defect (extract docs/references/vertex/m26_pershing.json, generated
2026-08-03 on the committed batch-8-seated bytes — the PLANS-authoring
extract): hull mask spans 6.076 m (z -4.355..+1.721) vs published 6.33
(-4.0%); overall reads 8.71 vs published 8.65 while the hull is short, so
the tube must COMPRESS when the body stretches (muzzle pinned at
tail'+8.65). Width TRUE (3.509, anchor untouched); y IDENTITY (stature
+1.8% is the over-M2 datum — see the true-up below, spec lane, NOT a
warp).
- Plan literals (banked at r1, re-verified this round against the extract
  byte-for-byte — vertex-normalize.mjs PLANS m26_pershing, world frame):
  z: [[-4.355, -4.482], [1.721, 1.848], [4.355, 4.168]]  (body 6.076 ->
  6.33 about centre -1.317, slope 1.0418; muzzle 4.355 -> 4.168 =
  tail'+8.65, tube slope 0.8808 — both maps monotone);
  y: [[0, 0], [3.101, 3.101]] identity, yTopMax 3.11.
- Raw GLB-frame literals for `_axis_warp` (derived via the extract's own
  glbToGate: scale 0.0975 all axes, offsetGate z -4.3636, y 0 — the same
  frame mechanism the batch-34/36 executions used):
  long_map = [(0.0882, -1.2144), (62.4062, 63.7087), (89.4215, 87.5036)]
  y_map    = [(0, 0), (31.8051, 31.8051)]
  y_top_max = 31.90   # guard only (y identity; 3.110 world)
  expect   = (2, 54984, 109998)   # extract counts on committed HEAD bytes
- LAW v2 mechanics: fresh .bak from committed HEAD bytes (the batch-8
  seat_turret output is IN the committed bytes -> the seat recipe demotes
  to history exactly like m46 batch-36/m47 batch-34; recipe = the warp
  ALONE). Never flat-assign over a live entry without the demotion note.
- Gate-in-loop baseline: min 72.1 — hull 77.9 / whole 72.1 / turret 73.7 /
  stations 78.5 / dims 100 / floaters 100 (single run this round; the
  2026-08-05 ledger row reads 70.6 with whole 70.6 — the 1.5-pt spread is
  ledger-generation phase, both are valid pre-warp baselines; the
  orchestrator's gate-in-loop re-baselines at execution per LAW v2).
  Expected releases: the certified batch-8 hull-length-tension cover
  columns (proc-only bow-platform/tail-pintle columns vs the short print
  body) and the ~2 ref-only muzzle columns (print muzzle sat 0.06 long of
  the published station pre-warp in the proc frame). dims MUST hold 100.
  A side dAlong re-phase is EXPECTED re-anchor debt (m47 batch-34
  precedent: healthy plan/front/stations = keep the warp, queue the m26
  post-warp re-anchor round in the patton lane — I execute that round).
- Verification: vertex-normalize --verify deltas ~0% post-warp except the
  KNOWN heightM +1.8-vs-tol-1.6 flag, which dies iff the spec true-up
  below lands with the same batch; regenerate the vertex extract after
  the warp (the re-anchor round authors from the WARPED extract frame).
- BANKED for the post-warp re-anchor round (§B orders, builder lane):
  (1) §B3 mantlet-area sweep — the current build's left cheekPod
  (x -1.25..-1.00, y 1.90..2.09, z 0.85..-0.20) is a bare 1.05 m
  rectangle riding the casting cheek: re-derive it from the warped
  extract as casting mass (loft/pod flush on the dome) or replace with
  identifiable stowage; same sweep over the m3 brake flank boxes.
  (2) §B1 slope-mass re-check on the glacis wings after the body
  stretch. (3) The m45-r1 recipe transfers (gearTone olive + darkGearFit
  + stowMG census fitting are cfg opt-ins already proven family-safe —
  hashes byte-identical on every sibling).

### heightM true-up VERIFIED (spec lane — flag for the orchestrator landing)
Mission item: verify the r1 recommendation (3.02 -> 3.08, userdrops6.js).
Re-derived this round from the extract curves (independent of the banked
scalar, §D re-derive law): the mounted M2 band is REAL print geometry
spanning 166 side_whole columns (1.65 m, z -0.405..-2.055 extract frame)
with tops 3.025..3.099, max 3.099, body-p95 3.061; the extract's own
bodyTopM datum reads 3.078. Published-row candidates: 3.02 (current row,
src/vehicles/userdrops6.js line 87) sits -1.9% under the datum — a proc
that matches the ref M2 band would read heightM ~-1.9% => dims ~92.6,
while the current proc holds dims 100 only by building its M2 band LOW
(turret_side residual). CONFIRMED RECOMMENDATION: heightM 3.02 -> 3.08
(the bodyTopM datum, rounding 3.078). Coupling: land it in the same batch
as the warp (kills the --verify +1.8% flag; the post-warp re-anchor then
raises the proc M2 band to the ref's own 3.03-3.09 line and recovers the
turret_side residual without a dims trade). Builder does NOT edit
userdrops6.js — single-owner law; this is the flag.

### batch-42 EXECUTED (2026-08-05, orchestrator lane)
- repair_oracles.py batch-42: batch-8 seat recipe DEMOTED TO HISTORY (old
  pre-batch-8 bak archived as *.pre-batch42-history); recipe = the warp
  ALONE on a fresh .bak from committed HEAD bytes. Byte-idempotent
  ec9c61ad x2; census guard (2, 54984, 109998) exact.
- Extract regenerated on warped bytes (pubDims mirror 3.08): bodyH -0.2% /
  bodyLen -0.2% / hullMask 0% / overall 0% / width 0% — the -4.0% print
  body defect is CURED. Orientation agree:false pre-existed (t62_bergman
  print class, unchanged by the z-monotone warp; gate frame handles it).
- heightM true-up 3.02 -> 3.08 landed with this batch (userdrops6.js:87 +
  vertex-extract.mjs pubDims mirror) — the --verify +1.8% flag is dead.
- Gate-in-loop: pre-warp 72.1 (ledger 70.6) -> 74.8 | hull 86.0 (+8.1, the
  certified batch-8 hull-length-tension covers RELEASED) / whole 76.3 /
  turret 74.8 / stations 76.0 / dims 91.9 / floaters 100. ISOLATION RUN
  PROVED warp-alone dims = 100 (heightM reverted -> 100, restored -> 91.9):
  the 91.9 is solely the spec-vs-proc M2-band gap = the documented
  re-anchor debt (the re-anchor round lifts the proc M2 band to 3.08).
  Healthy plan/front/stations = keep the warp (m47 batch-34 precedent).
- Post-warp re-anchor round: SPAWNED (patton lane) — authors from THIS
  warped extract frame per the banked §B orders above.

## Vertex round r3 (2026-08-05, patton-family builder) — POST-WARP RE-ANCHOR: 74.8 -> 90.4 PASS (+15.6)
The banked re-anchor round, authored entirely from the WARPED extract frame
(docs/references/vertex/m26_pershing.json @ bc17984: hull mask -4.326..
+2.004 = 6.33 exact, ring (0, 1.518, -0.454), muzzle +4.326, pubDims
heightM 3.08). The old batch-8 trace frame (ring +0.187, tail -3.61,
muzzle +5.00) sat ~0.65 forward of the warped print: the r0 workorder read
**side dAlong 0.632 / plan dy -0.832** — the m47 batch-34 re-phase class,
retired by re-seating every constant in the extract frame (m45/m46/m47 r1
recipe; dense retrace probe tools/tmp-m46-retrace.mjs --id=m26_pershing,
vertex probe tools/tmp-m26-boxprobe.mjs for the three grid-mysteries).

GATE (x2 bit-identical, current HEAD tree incl. the 9bf2a6d de-track-kit
fix): **min 90.4 PASS — hull 93.1 / whole 90.4 / turret 94.2 / stations
90.6 / dims 100 / floaters 100** (from 74.8 | 86.0/76.3/74.8/76.0/91.9).
Battery: track-clip --exact **0/0 front/rear + 0/0 shoe**; turret-parent
**0/0/0**; standard-check **contig 0 ✓ decor mg1+0d ✓** (stowed FITTINGS
'mag' carries the census; the measured m2Station stays the gate-driven
roof gun — m45/m46 §I justification); npm suite green (166 + track-geo).
Graduate freeze verified against the 9bf2a6d MASS RE-FREEZE registry:
m46 90ebf864 / m47 53b6123a / m60a1 fbf9f4cc / m60a3 051c454c — the brief's
pre-refreeze values (dfacd57c/70941de0/81e69e34/efcde5c4) were superseded
by the orchestrator's own landing mid-round; byte-identity vs the NEW
registry holds (m60a2 c99cd1a7, m45 31914c3f unchanged post-refreeze).

ORDER DELIVERY:
1. RE-ANCHOR: done — every seat from the warped extract (workorder ABS
   columns). Post-anchor registration reads dAlong -0.002 / dy 0.001.
2. DIMS 91.9 -> **100**: heightM = the mounted-M2 band raised to the 3.08
   row (receiver/cover band 3.03-3.09, ref's own spikes 3.1036 x2 covered
   at z -1.83/-1.93; heightM reads 3.09 = +0.36%); hullLengthM held 6.34
   (+0.19%) via the tier3 duckbill under-band (see law 1 below).
3. §B orders: left cheekPod (bare 1.05 m box) DELETED — the left flank
   tops 2.08-2.25 @ x -1.0..-1.24 ride the loft's own bands (per-side hwL,
   the m45 cupola-side bulge: LEFT holds 1.11+ to the -1.036 plan corner);
   the right shelf / cupola seat drum / left shoulder are flush casting
   pods (§B3: casting mass, not boxes). §B1 glacis re-check: the print's
   bow is a compressed near-vertical face (knee (1.564,1.54) -> toe
   (1.60,1.135)) with fender-led 1.008..1.099 platforms to z 1.913 — the
   PRE-WARP extract shows the same cliff (deckCorners (1.564,1.54) ->
   (1.594,1.193)), so it is the print's own read, not a warp artifact;
   authored as ONE rake + real bow furniture (eyes/clevis tab/platforms).
   The real M26's ~46-deg glacis is unreachable against this print: a
   true-rake toe at z 2.0 costs ~+0.37 x 12 plan-front columns + 4 side
   cols (measured in-session) — certified print-class residual, in the
   m46 chopped-track lineage. m45 recipe transfers: gearTone olive +
   darkGearFit + MG two-tone landed (materials-only); fender hangers =
   fenderHW 1.673 + 7 discrete bump pairs at the ref's own wide slices
   (stations alternate 3.3466/3.5045). m3 brake flank boxes adjudicated
   §B3-legit (the double-baffle's real side windows, not mystery boxes).
4. Battery + packet: this section; shots at shots/track-clip.json,
   shots/turret-parent.json, docs/geometry-gate/m26_pershing.json.

LAW DISCOVERIES (for the bank):
1. **PER-ROW BODY-FILTER / REGISTRATION-COUNTERWEIGHT LAW** (the big one):
   the 12%-band body filter uses each ROW's own rough — side_whole rough
   ~3.1 (threshold 0.37) but side_HULL rough ~1.6 (threshold 0.19). A
   dims tail anchor fat enough for the whole-row (hullLengthM) is
   automatically fat in the hull-row too and SHIFTS THE HULL-ROW BODY MID;
   hull reg pins whole+turret (fixedReg), so a 0.05 dAlong smeared every
   side row (turret 89.8 -> 83.6, whole 90 -> 86.6) while the workorder
   digest — which re-derives registration with its own sign — still
   printed near-zero errors. Counterweight per §A: extend the hull-row
   body SYMMETRICALLY — here the left tow-clevis tab deepened to y0 0.85
   (hull-row band 0.25 > 0.19) makes the proc hull body -4.36..1.98
   mirror the ref's own -4.26..1.885 mid exactly (dAlong -> 0, all six
   points recovered, dims kept). Cost: tab bot -0.15 x1 + tier3 bot
   -0.30 x1 certified columns.
2. STATION-BOUNDARY BUMP LAW: fenderBump spans must stay >=10 mm clear of
   the 14 station-slice boundaries — a 9 mm bump sliver inside a narrow
   slice reads the full 3.5045 width (wPct 4.64 on i4/i8/i10 = ~5 station
   pts).
3. M2-STATION TWO-BAND SPLIT: the print's mounted M2 carries a rear
   receiver/cover spike (~3.10) over a ~3.0 barrel line; m2Station's
   fixed cover-tube spacing (0.077) fits it only with the COVER on the
   spike (topY 3.06 -> cover 3.09 / tube 3.01). Seating topY on the
   receiver band instead over-reads the barrel corridor stations (i5-i9
   topPct +0.4 each; measured both ways in-gate).
4. PADS-BEYOND-FACE: the two-layer shoe pads extend a wrap face +0.05..
   0.08 beyond r+CLEAR+trackTh/2 (vertex-probed at x +-1.65, z 1.93-1.98)
   — seat idlers by probe, not formula; the idler ring's dark carrier
   extends x to ~1.69 (wider than the 0.60 band).
5. PROBE-GRID vs GATE-GRID: the retrace probe's 96 columns are NOT the
   gate's (different shared box) — razor seats (the basket front edge sat
   between the two grids' boundaries) must be tuned against the GATE run
   (basket z0 0.26 splits both windows; 0.20 lost a 0.4-err column, 0.28
   poked the next).
6. CHOPPED-TRACK REAR (m46 class, confirmed on m26): the print's rear
   wrap is an impossible circle (side flat 0.566 @ -3.98..-4.17 vs plan
   track end -4.11): small sprocket (-3.87, 0.79, r 0.07) seats the plan
   face; the hull's own tail transmission shelf (bowTabs box, y 0.566..
   0.75, z -4.03..-4.175 — the real M26 final-drive mass) carries the
   belly flat the track cannot.
CERTIFIED residuals (worst columns, gate JSON): side_whole 'at' 4.34
(tier3 bot 0.82 vs ref 1.12 — law-1 price, 0.119), 'at' -2.0 (tab bot
0.85 vs ref 1.0 — law-1 price, 0.085), 'at' -4.34 (muzzle-collar band
0.063); turret_side 'at' -1.02 (basket rear/casting 0.068) + the mantlet
zF 0.89 plan-vs-side trade (side col z~1.0 reads tube-only vs the ref's
2.12 rotor lane: -0.07 x1); front_whole x -0.054 (the fixed-width 0.38
M2 crown strip pokes one column: +0.24 — MG-PHYSICS two-tone kept);
stations i1 topPct 1.81 (rear-ramp window, un-attributed after two deck
trims — candidate for the visual round's evaluator pass).
State: m26_pershing hash f348ecd5 (post-9bf2a6d baseline), NOT frozen —
graduation needs the independent critic (dual gate). Ready for the
graduation-critic round.
§H.4 family tells (vs m45/m46/m47, geometry lane): the m26 keeps its own
mark kit — 5 return rollers (m46/m47 carry 3), the rear TENSION idler
(-3.30, 0.25) pressing the shallow ramp start, duckbill prongs + pintle
tail tiers, bow fender PLATFORMS + tow eyes + clevis tab (m45's bow is
fender-platforms + single tab, m46/m47 are fender-shelf bows), NO fender
mufflers (m46/m47 tell), M2 at the bustle rear with the barrel forward
over the crest (m45 mounts front-left x -0.44, m46 forward station).
Loadout dressing variety beyond the print is the visual round's lane.

## Vertex round r4 (2026-08-05, patton-family builder) — GRADUATION-BLOCKER RETUNE (shaded-parity FAIL floor 8.8 -> orders delivered)
The retune ordered by the archived visual-review receipt
(GRADUATION FAIL floor 8.8 at f348ecd5: slab-loft facet patchwork on
every casting-dominant view + the deck-slat crown gap; geometry certified
sound). Both family-proven orders delivered + the optional polish lane;
no re-author, no warp, no dims motion.

GATE (close x2, runs consecutive, lines identical): **min 90.5 PASS —
hull 93.1 / whole 90.5 / turret 94.2 / stations 90.6 / dims 100 /
floaters 100**. The whole row reads +0.1 over the verdict's 90.4 line:
measured MID-ROUND on byte-identical geometry (order-1-only state read
90.4 x2 then 90.5 on the next run, no edit between) — the 90.4<->90.5
whole-row flicker is run-phase (AA-teeter class), not geometry. Battery:
track-clip --exact **0/0 band + 0/0 shoe**; turret-parent **0/0/0**;
standard-check **contig 0 / decor mg1+0d / clip 0/0** all green;
evaluator **RIG PARITY OK** (max yawProxy 0.9 deg @frontright, no
flips); npm suite green (166 + track-geometry). Sib freeze verified at
open + mid-round x3 + close: m45 31914c3f, m46 90ebf864, m47 53b6123a,
m60a1 fbf9f4cc, m60a3 051c454c — byte-identical throughout.
**Candidate hash: f348ecd5 -> 2f579de8** (46 meshes / 72532 verts).
Shots: shots/critic-m26_pershing/ (14 fresh official pairs at the
candidate, zero console errors), shots/patton-r4/{rest,yaw90} (B5
eyeball sets), shots/visual-eval-m26_pershing/.

ORDER DELIVERY:
1. **loft.smooth: true** (t26Cast -> smoothLoft, m47 r6-B8 / m46 r9-R4
   lineage). LAW DISCOVERY on landing: smoothLoft's ring() read only
   s.hw — the m26 sections carry per-side **hwL** (cupola-flank bulge,
   15 sections) and the first flip DROPPED the left bulge (gate 90.4 ->
   89.0, whole/turret down). smoothLoft now carries loftBody's exact
   opt-in hl()/crownL() expressions; absent-hwL rings are byte-identical
   (m46/m47 smooth lofts hash-held 90ebf864/53b6123a). Post-fix gate
   read the r3 line EXACT x2 (93.1/90.4/94.2/90.6/100/100) — the smooth
   re-emit is silhouette-identical on an hwL rig too. Close-roof A/B vs
   the verdict critic's before-pairs: the flat-quad patchwork (front
   face / cheek planes / shoulder step / crown) shades as ONE cast roll;
   same read at quarters, heroes, and head-on.
2. **Deck-slat crowns at the ref's own array stations** (m46 r10 R5
   recipe, m26 grammar measured on the verdict critic's view-top pair,
   ITU-601; mapping z(y) = -4.315 + (y-48)/62.88 verified on the proc's
   own ramp step edges to ~1 px):
   - ENGINE-BAY dash arrays: ref crest rows y156..217 = z -2.598..
     -1.629, pitch 5.08 px = **0.0808 m** (13 rows — the M26's fine
     louvre rhythm; m46's ref ran 0.199); dash x-grammar pitch 0.158,
     dash ~0.063, five bands 0.324..1.020 per side, mirrored. Ref crest
     luma p75 63-74 over 52-59 fields (plain-olive print — a full class
     dimmer than m46's 86-95). Delivered via cfg.deckSlats: field plate
     1.561 swallowing the LOWERED grille slats (M26_FIT.grille.y 1.545
     -> 1.532, slat tops 1.560 = 1 mm under the plate, m46-exact
     mechanism), crownTop 1.572 <= deck +0.024 and under the 1.5781
     trace quantum (gate-mask-free); footprint z1 -2.513 >= 10 mm clear
     of the -2.523 station boundary; 11 of 13 ref rows delivered (the
     two aft-most ceded to the boundary law — they sit in the rack's 1x
     shadow zone); skips = the ref's own crest breaks at its proud
     fittings (bump plates -2.33..-2.47, fuel caps -1.88). Sampled dial
     hex 0x4a4f3d: proc crowns read p75 61-67 IN the ref band.
   - RAMP LOUVRE BANKS (new opt-in cfg.rampBanks, every sibling absent
     -> byte-identical): Bank B = the ref's loudest deck read (5
     full-width med-64-68 rows, z -3.504..-3.186 @ 0.0795, x +-0.85),
     Bank A = centre dash rows (z -4.013..-3.695, |x| 0.15..0.45); the
     ref's plain zones (-2.65..-3.10, -3.55..-3.65) left bare. Proc
     Bank B reads med/p75 66.8 = the ref band EXACT; Bank A 66.8 vs ref
     60-63 (a hair hot, inside the ref crest envelope). Heights
     TONE-PURE (crest top = line +0.002, seam bar embedded +0.001):
     measured in-gate twice, +0.019/+0.008 crests pushed the certified
     i1 rear-ramp window 1.81 -> 2.40/2.05 (stations 89.6/89.7 FAIL) —
     the r3 deck polyline was traced from the ref's side silhouette
     WITH its banks, so proud crests double-count the line. At
     tone-pure heights i1 reads 1.93, stations 90.6 held (i3 0.13 back
     to baseline after the footprint trim; measured stepwise with a
     full per-station bisect).
3. Optional polish (both landed): (a) **pintle-bracket tell** inside
   the tier3 envelope (backing plate / latch / chain-eye dots, |x| <=
   0.175, z >= -4.321 — mask-neutral by construction, the tier's own
   silhouette owns every view boundary; the pintle cyl's -4.33 stays
   the rearmost read). (b) **brake window-contrast bars** (m46 r7-C5
   lane): dark transverse bars on the m3 double-baffle body flanks
   between the rings, faces 0.5 mm proud of the 0.24 body face, inside
   the certified 0.256 ring plan band; muzzle z untouched; m45 (the
   only other m3 consumer) byte-identical, hash-proven. (c) X-BRACES
   NOT TAKEN (documented residual): the ref's rear mud-guard X-stays
   span x 1.24..1.70 over what the stations law makes an OPEN track
   zone on the proc (narrow 1.673 fender lip + discrete hanger bumps)
   — floating X-strips there would violate B2 attachment; needs an
   orchestrator ruling on the rear-fender architecture if ever taken.

Standing checks re-verified: **B2 floods 14/14 views byte-match the
verdict's adjudicated-legal table** (front 536 / fl 97 / fr 89 / left
119 / right 142 / rl 41 / rear 213 / rr 45 / top 8 / hero-fl 140 /
hero-rr 155 / toptilt 36 / close-front 58 / close-roof 1334; ref halves
0 except its own wheel-pocket classes) — the round added ZERO new sky.
**H.4 four-up** fresh proc pixels: tells hold (m26 plain-olive +
double-baffle + bustle-rear M2 barrel-forward + platforms/eyes/clevis +
5 rollers + tension idler + duckbills; no re-badge read). **B5 yaw-90
eyeball** (instanced meshes are audit-exempt): dash arrays / Banks A+B /
pintle kit stay hull-side, casting kit + M2 + rack + gun (with the new
brake bars) rotate; nothing sweeps, nothing drags.

SELF-READ vs the verdict's per-view floors (builder estimate, not a
verdict): the ten 8.8-8.9 views all read >= 9.0 to my eye — close-roof
and hero-toptilt (the joint 8.8 floor) are the acid tests and both
holders are delivered (facet patchwork GONE at close-roof; deck density
+ roof roll at toptilt); front/quarters/heroes ride the same dead facet
family; view-top carries the ref's own louvre grammar at its own pitch
row-for-row; rear delivers the pintle tell + smooth bustle (X-braces
residual documented, priced inside the 8.9 -> 9.0 step per the
verdict's "these two orders clear all ten" calibration). left/right/
close-front held their 9.0 (brake bars add the notch-window contrast).

LAW DISCOVERIES (for the bank):
1. **SMOOTHLOFT-hwL PARITY LAW**: any smooth re-emit of a slab loft
   must consume the FULL opt-in section grammar (hwL per-side widths,
   crownL clamp) — a smooth flip on an hwL rig silently sheds the
   asymmetric flank and the gate reads it as -1.4 min. Byte-identical-
   default proof: absent-hwL rings emit the exact symmetric
   expressions (sib hashes held).
2. **TRACE-LINE DOUBLE-COUNT LAW** (deck-dressing corollary): when a
   deck polyline was authored FROM the ref's side trace, the trace
   already includes the ref's own proud deck furniture — re-adding
   that furniture as proud geometry DOUBLE-COUNTS it (i1 1.81 -> 2.40
   measured). Dressing over trace-authored lines must be tone-pure
   (<= +0.002) unless the window's ref top provably rides higher than
   the authored line (i2 absorbed +0.019 free — its ref window carries
   the ref's own crests).
3. Station-boundary law extension: the >=10 mm clearance applies to
   plan-interior deck FIELDS too, not just width-carrying bumps — the
   i3 window read a 1.02-hw field plate's +0.013 top across the
   boundary as +0.84 topPct (max-over-window semantics, one certified
   baseline was near-perfect at 0.13).

State: candidate **2f579de8** at gate 90.5 PASS x2, NOT frozen — ready
for the fresh independent 14-view graduation adjudication (would be the
26th graduate). Residual carry-list for that critic: X-brace
architecture residual (above), ramp-band rear-grazing read (tone rows
vanish at the rear camera's ~4.6 deg — the ref's 3D louvres read there;
top/tilt views carry the density), Bank A +4L vs its ref rows, the
certified r3 list unchanged (side_whole tail/tab/muzzle-collar columns,
turret_side basket/rotor-lane, front_whole M2 crown strip, i1 1.93 =
1.81 certified + 0.12 tone-row quantization).

## GRADUATED 2026-08-05 — DUAL-GATE PASS (fleet graduate 26)
Geo 90.5 gatePassed x2 EXACT (93.1/90.5/94.2/90.6/100/100; 90.4/90.5 =
banked flicker twin) + independent critic 9.0 ALL FOURTEEN views on the
second sitting (r2 adjudication, the archived visual-review receipt — close-roof and hero-toptilt 8.8 -> 9.0, facet
patchwork dead, deck arrays at ref density row-for-row). FREEZE HASH
2f579de8 (46 meshes / 72532 verts, orchestrator-verified at landing).
The print's journey: 70.6 baseline -> batch-42 warp (print body defect
cured) -> r3 re-anchor (90.4 first-ever pass) -> r4 blocker retune ->
graduation. Flip-era §10: no runtime registration (dump clean), mirrors
x3, no variants backfill, icons x5 from a clean HEAD worktree. Carry
list held by owners: X-brace architecture ruling (orchestrator), ramp
grazing class, certified residual columns (re-measured EXACT at both
adjudications).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore on the m3 brake exit collar (len+0.01); §C.1 3 reversed slabs re-oriented (bow belly, deck lip, mantlet slab); F-vs-D 19->0; gate HELD x2 EXACT 90.5 PASS; hash 2f579de8 -> 65c564c0 CANDIDATE; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
