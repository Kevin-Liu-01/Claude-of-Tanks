# AbramsX — reference packet

Variant: GDLS AbramsX technology demonstrator (2022): unmanned low-profile
turret, XM360 120 mm, 30 mm RWS on top, hybrid drive, ~60 t.
Sources: armyrecognition AbramsX data
(https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/abramsx-mbt-main-batlle-tank-technology-demonstrator-data),
National Interest (https://nationalinterest.org/blog/buzz/introducing-abramsx-americas-next-gen-battle-tank-209169),
Warrior Maven (https://warriormaven.com/news/land/-abramsx-ai-enabled-fuel-efficient-unmanned-turret-silent-attack).

## Local GLB oracle
`/models/tanks/community/abramsx-mortavex.glb` (owner-supplied, local-only).
Its `Turret` pivot carries no meshes — the shell is static in the hull mask;
only the `stvol` barrel articulates. Scoring frame (ground 0):
- hull: z −3.96…3.96, deck 1.44…1.53 (z 3.5…1.7), track band bottom −0.07
  (run z 1.7…−1.5), belly 0.25; nose bottom rake (2.8, 0.63) → (1.9, −0.02);
  rear: deck steps DOWN behind the turret: 1.84 (z −1.8…−2.2) → 1.34…1.29
  (z −2.6…−2.8), tail block z −3.5…−3.9 y 0.4…1.3; tail bottom rake
  (−2.0, 0.01) → (−2.8, 0.70).
- turret (static shell, scored inside the HULL mask): x ±1.34, z −1.9…1.85,
  sharp front face at z ≈ 1.4, roof plateau ≈ 2.36–2.43 (z 1.3…0.0), rear
  shelf 1.74–1.94 (z −0.3…−1.3), low bustle 1.84 to z −2.2.
- RWS: head to y ≈ 3.0 around z −1.3…−1.5; antenna spike to 4.18 (z −1.8);
  front-view side slopes 2.55…2.80 at x ±(1.3…1.6).
- gun: tube y 1.82…2.05 visible (box 1.61…2.30), axis ≈ 1.93, muzzle z 6.17
  (long XM360 — 2.2 m past the bow).

## Procedural strategy
Build the turret shell + RWS body as HULL-bucket geometry to mirror the
oracle's static shell (turret bucket keeps the RWS head so the rig probe sees
a turret mesh; the barrel keeps full articulation).

## Mismatch note (shared machinery)
The asset's empty turret pivot means the in-game GLB turret does not visually
yaw either; a yawing procedural shell would actually diverge from the oracle.
Flagged for a future modelLoader-side autoPivot fallback.

## Outcome (final lab state)
Baseline 73.8 (H80 T50 G63 R88) -> 81.0 (H84 T60 G77 R94), min view ~79.
Mirrored: blade bow (underside sweeping (3.9,1.05) -> (3.0,0.10)), low deck,
stepped rear, hull-bucket RWS/sensor bridge resting on a yawing chamfered
shell (the asset's shell scores in the turret mask; its bridge does not),
XM360 at axis 1.93 with muzzle 6.17 and a chin cradle at the mantlet root.
Residual gaps: the shell band's exact chamfer profile and the bridge
mass (front view) each hold ~3-5 pts; the asset's empty turret pivot means
its shell yaws around an off-body origin in the articulation strip, which
the procedural intentionally does not copy (its shell yaws about the ring).

## Round 2 (shaded-parity, 2026-07-30)
- XM914 RWS built out on the static bridge (hull bucket, matching the
  asset's non-yawing shell): slew ring, cradle cheeks, stepped 30 mm barrel
  with muzzle ring, dark-faced sensor heads with glass.
- Faceted corner sensor pods flank the bridge at the measured front-view
  slopes (2.62..2.82, x to ±1.58), floored above the yawing shell's swing.
- Round-1 floaters fixed: front mud flaps deleted (nothing behind the blade
  bow to carry them; rears hang at the tail block), and the antenna rods —
  which floated 0.9 m over the deck — now stand on base pods on the rear
  deck at (±1.5, -2.85), outside the shell's yaw sweep. Turret-rear bases
  would orbit/clip a static-antenna asset, so hull-deck pods are the
  closest feasible read of that critique bullet.
- Splitter undercut below the nose tip, hybrid-drive louver panels on the
  raised rear deck, shell panel seams + tie-downs, XM360 angular shroud +
  dark pepperpot muzzle over the tube tip, family glacis/skirt kit with the
  diagonal lead-panel cut.
- Score 81.0 -> 79.4 (T 60->61, R 94->92.5, G 77->71 — the real-XM360
  muzzle furniture the asset's plain tube lacks; within the ±2 gate).


## Gate v6/v7 iteration (2026-07-31)
Rebuilt: hull retabled to the true-camera deck/rakes, corner pods + RWS
bridge seated on hull pylons (v5 left both floating -> 2-pose floater
failure), XM360 at the published 9.77 overall, rear tow-pintle bar at the
oracle's rear overhang (also anchors the shared camera grid so the plan
width columns read the true 3.66 skirt plane — the oracle's 6.16 muzzle
otherwise quantizes widthM to 3.55), shell roof 2.44-2.47 with the undercut
rear block.
CERTIFIED CAP: the oracle carries its RWS bridge as a 2.4 m-long mass at
3.25-3.45 IN ITS HULL MASK plus twin whips at 4.12 — under the published
2.44 heightM (p95) only a 2-column mast head at 3.44 is affordable; the
remaining ~20 columns cap hullCurves/wholeCurves/front rows (~0-26) and
pull the hull registration dy ~0.12-0.27, spreading residual error over
every column. turret rows (the yawing shell) score independently; dims 98.9
and floaters 100 are green.


## Gate v10 cap re-verification (2026-07-31)
The RWS-in-hull-mask cert STANDS under v10: the oracle's hull mask carries
the 3.25-3.45 sensor bridge over 2.4 m plus 4.1 whips; under published
heightM 2.44 those clamp to the 2.44 bridge deck + single 3-column mast
head (hull/whole capped at 0 by the bridge band, turret ~26-31). The
XM360 runs to the published 9.77 overall against the oracle's long tube
(cover-capped). Dims green 98.9; floaters 100.

## 2026-08-01 rebuild — oracle re-derived from CURRENT files
The mortavex bake CHANGED since the v10 cert was written — re-measured with
tools/tmp-abrams-refcurves.mjs (full-curve probe, world coordinates):
- THE SHELL + XM360 NOW RIDE THE TURRET PIVOT AND YAW (the old "empty
  Turret pivot / static shell in the hull mask" cert clause is retired).
  turretCurves is scored against the live shell: hexagonal plan (face 2.34
  wide ±0.6 chamfering to ±1.70 flanks at z 1.9, flank run to -1.29, rear
  chamfer to a flat ±0.78 stern at world -2.45), roof 2.45-2.48 plateau
  (z 0.65..-0.55) easing to a 2.39 shelf and a 2.13 tail, bottom 1.57
  forward rising to 2.04 at the stern, tube band 1.80..2.04 to muzzle 6.22.
- The RWS bridge cert STANDS with confirmed numbers: the HULL mask carries
  a 3.22-3.46 band over z 1.61..-0.75 (~21 columns, plan peak at x ~0.5,
  z -0.3..-0.5) plus twin 4.10-4.13 whips at (x ±1.15, z -1.9..-2.05).
- Rear deck REBAKED LOW: 1.54-1.62 at z -2.3..-2.8 (the old 1.84 -> 1.29
  step table is obsolete); hull-mask sensor stubs 2.33-2.48 at z -1.3..-1.7
  and a 2.75 spike at -1.81; plan bow chamfered (center 3.87, corners 3.65),
  tail plate -3.86 at |x|<=1.55 with a -4.04 pintle bump.
CERTIFIED CAPS (quantified from this rebuild's runs):
- Bridge band + whips under published heightM 2.44: the p95 skip budget on
  this ~7.6 m body is THREE columns; the whips own two (matched at the
  oracle's own stations, tops 4.12 — they also zero the whip station
  slice). The mast head is CLAMPED to the plateau: a 3.46 head kept
  straddling a third column and blew measured heightM to 2.9-3.45 (dims 0).
  The ~21 bridge columns therefore stay unmatched: side/front hull rows are
  structurally capped (~0-15).
- REGISTRATION POLLUTION COROLLARY (new): the bridge band shifts the
  side/front hull mean-dy registration by +0.16-0.20, and that frame is
  REUSED for the whole and turret rows — every turret/whole column carries
  a ~0.17 systematic offset (~-25 pts). turret_side ceiling ≈ 70-75 with a
  physically-true build; matching the polluted frame would need the tube at
  axis ~1.76 and the roof at 2.30 (a dims-breaking, score-chasing distortion
  — rejected per the m1a1_aim gunLength-6.15 precedent).
- Long oracle tube (6.22 vs published 5.71 muzzle): bounded whole-row cover.
Numbers (session start -> now): turret 31.2 -> 46.6 (plan 87.2 side 46.6 —
side is the polluted row), stations 29.1 -> 41.2, dims 98.9 -> 100 (mast
clamp + pintle/prow/rear-face fixes recovered hullLengthM/heightM),
hull/whole 0-9 (capped, registration-polluted), floaters 100.

## 2026-08-01 addendum — edge-on prism law applied (orchestrator broadcast)
Per the fleet mechanism in docs/GEOMETRY-GATE.md (russia r7c): long thin
axis-aligned prisms present only end caps to the clipped station cameras.
Applied here: skirt panels carry two interior flush ribs per panel (shared
abramsHull, whole family), and every longitudinal strip is segmented into
sub-slab bins with real end faces (skirt ribs only; its remaining station rows are bridge/cluster top errors, not width).

## 2026-08-02 vertex round — stylization verdict (build untouched)
REG appended; extract only (docs/references/vertex/abramsx.json). TRUE
stylization: length/width TRUE (hullMask -0.4%, width 0%), overall +3.5%
(the long XM360 tube — bounded whole-row cover, certified), bodyHeight
+41% (3.441 p95 = the RWS bridge band IN THE HULL MASK, 3.22-3.46 over
~21 columns + 4.1 whips — exactly the certified registration-pollution
cap). Orientation clean. 342 turret verts dip to 1.69 below deck = the
yawing shell's deep skirt over the low rear deck (asset geometry, noted).
WARP CANDIDATE (orchestrator lane): W1-style ceiling compression of the
HULL-mask bridge band (y' = 2.46 + (y-2.46)*0.12, whips kept as the p95
budget) — this both uncaps side/front hull rows AND removes the +0.16-0.20
registration dy pollution that costs every turret/whole column ~25 pts.
The masked-registration gate option in the 2026-08-01 caps section is
NOT exercised this round (owner order: abramsx last; no build or gate-run
changes made — ledger row left as the 2026-08-01 state).

## §B1 TURRET FRONT SLOPE (2026-08-04, abrams builder)
MEASURED (probe shots/abrams-b1/probe-abramsx.json): print center face
rakes 29.4° from vertical FROM A CHIN at world y 1.84 (z 2.40, slope
-0.5635, face band 1.84..2.16). Authored before: 13.1° (one slab, top
z 2.60 from the LOW -0.38 chin). REAL CLASS: owner photo = steep rake;
print carries it — print is authority.
FIX: the front-face slab splits at the print's own chin — vertical chin
prism to local y -0.11 (world 1.84; keeps every plan bin + the certified
low-column class), then the raked band pulls top center corners to 2.567
= 29.4° exact. LESSON BANKED: the first cut raked from the authored low
chin (-0.38) — visually steep but it dropped the mid-face side columns
0.22 under the print and cost turretCurves 0.2 (65.6 -> 65.4). The
print's rake lives AT ITS OWN CHIN HEIGHT — measure the chin, not just
the slope (bisect-proven: chin-split restores 65.6 exactly).
GATE x2 IDENTICAL to baseline: min 3.7 both runs (3.7/9.1/65.6/77.5/
100/100, floaters 100 x2) — §B1 read delivered at zero gate cost on this
pre-gate build. §B5 0/0/0. Standard-check: pre-existing bow/tail holes +
clip unchanged (hull zones). Hash 72df04a8 -> 5ae4bd90 (40/71756 ->
40/71792). After-pairs shots/abrams-b1/after-abramsx/.
NOTE m1a1_aim (measured, NOT changed, byte-identical 2804b74): its
bergman print's turret node is gun-fused (single mesh, probe zMax = the
4.54 tube) — leading edge unmeasurable by the turret-only probe; the
proc turret is the certified round-casting identity whose front slopes
continuously (no vertical/slab read, §B1-conformant as built).

## FAMILY BATCH (2026-08-06, abrams builder — owner extension: abramsx
## is an active target with the family)
Orders applied:
- §B1.1: the chin-split raked face (29.4° at the print's own chin, §B1
  round) is SYMMETRIC by construction (slab corners mirror ±x) — both
  front quarters verified in the after-pairs.
- §B3.1 GUN RUN: the XM914 RWS 30 mm receiver/barrel was a SQUARE PRISM
  (the exact failing read) -> cylinder set at the same envelope tops
  (r 0.08 + barrel + step ring). The XM360 shroud top now RAKES toward
  the muzzle inside its old box envelope (real XM360 slope; the tube
  run was already buildGun cylinders + octagonal thermal shroud +
  collar + pepperpot).
- MEASURED SPEND (order-2 mask discipline): stations 77.5 -> 76.8
  (-0.7 = the cylinder swap's slice footprint at the RWS/root zone),
  turret 65.6 -> 65.7, everything else byte-equal: min 3.7 x2 (the
  certified RWS-bridge/registration-pollution caps stand — hull/whole
  structurally capped ~0-15; turret_side ceiling 70-75 per the 2026-08-01
  cert). Documented as what the real weapon demands (§B3.1 priority =
  silhouette break).
- §B3 census: mg0+0d stands WITH JUSTIFICATION (§I clause): the XM914
  RWS is this variant's roof gun, hand-authored to the oracle's own
  bridge stations under the certified height clamp — a KIT pintleMG
  would violate the p95/bridge cert. Packet-justified.
- standard-check: bow/tail holes + clip PRE-EXISTING byte-same (§B1
  round listing; hull zones). §B5 0/0/0. dims 100 x2, floaters 100 x2.
Hash 5ae4bd90-class -> 5963b41b (36/64100, non-graduate). Before/after:
shots/abrams-cheek-r1/{before,after}-abramsx/. §H.4: hero-variant tells
(blade bow, RWS bridge, hex shell, XM360) read distinct at a glance.

## §B3.2 DENSITY + §B2/§B4 ROUND (2026-08-06, abrams builder — owner
## directive: "add far more of these decorations on ALL abrams")
DENSITY (all mask-interior, x2-verified): LEFT sponson-ledge tow cable
(crowns 1.497 under the 1.50 skirt-top class) + clamps; guarded
lightCluster pods ×2 on the lower bow; wing mirrors under the 1.50
front class (heads 1.36..1.46); whip-mast base furniture (junction
boxes + guy collars INSIDE the two certified whip columns at ±1.15,
-1.98 — a first junction seat floated 25 mm over the mast base, contig-
caught, re-seated); glacis tie-down D-rings ×4 (deck-bin slack class).
The XM914 RWS run is this mark's §B3.2 automated-emplacement story.
§B4: lane carve (corridor 1.055, bowZ [2.30,3.20], sternZ [-3.30,
-2.30]) — audit front 133 / rear 104 (HEAD A/B: pre-existing) -> 0 / 8
band-only (shoe 0/0; 8 <= the ~60 zone bar).
§B2: the top-down scan carried PRE-EXISTING 18+18-cell sky holes at
(±0.78, 3.74) — closed with sub-deck bow shelves (tops 1.355 under the
1.371-1.38 deck line, faces inside the 3.97 nose; widened once to x
1.12 for the corridor-edge slivers). Scan now 0 enclosed cells,
contig 0.
GATE (fresh x2 IDENTICAL): min 3.7 | 3.7/9.1/64.2/76.8/100/100 — the
min (capped hull, bridge-band cert above) and dims/floaters are EXACT
vs the round-open line; turret 65.7 -> 64.2 is the bow-shelf hull-
registration coupling (m26 §D law — hull reg pins turret), priced
against the gate-blocking §B2 law (holes 36c -> 0). stations 76.8
held. §B5 0/0/0.
MG CENSUS JUSTIFICATION (§I hand-authored clause): mg0 stands — the
AbramsX is the UNMANNED-turret demonstrator; its crew-served system is
the XM914 30 mm RWS (hand-authored §B3.1 cylinder run at the oracle's
own bridge station). A pintle fitting has no legal mask seat: the deck
is the capped-row silhouette line everywhere a 0.36-tall stamp could
sit, and min binds on hull. Documented exception, standing.
Hash -> (see hashes-final; non-graduate). Shots:
shots/critic-abramsx-b32/ + shots/abrams-b32/yaw{0,90}-abramsx/.

## REAR + BORE ROUND (2026-08-06, abrams builder — non-graduate,
## gate-in-loop; family round home m1a1.md)
ORDER A (rear): AX_HULL takes noRearFace — the default abramsHull rear
kit sat BURIED inside the -3.97 tail loft (the exact class the flag was
built for: the stern rendered one blank camo wall; the old pintle at
-3.915/-3.925 equally invisible). The kit is authored ON the visible
plate now (<=12 mm proud, faces >= -3.982 — the banked -4.05
hullLengthM lesson): full-width hybrid-drive VENT FIELD (9 louver rows
+ frames + sills over a dark bay, the AbramsX's dominant rear feature),
taillight clusters in guards, tow shackles ±0.45, center pintle.
§B2: the top-down scan carried two PRE-EXISTING 18-cell sky holes at
(±1.61..1.67, -3.37) — the deck-band-to-skirt slot over the empty
aft-of-sprocket bay. Closure shelves (x to 1.795/1.815-class, y top
1.4775 under the 1.50 skirt-top + 1.75 deck lines, z -3.20..-3.50; the
shoe sweep tops out at z -3.27 at mid-heights and never reaches this y)
took contig 36 -> 0 in three measured steps. §B3 census: a stowed
FITTINGS M240 on the low rear deck (the hand-authored XM914 censuses
zero) — mg1+3d ✓.
ORDER B (§B3.1): XM360 rim ring (outer 0.083 torus) + near-black bore
disc r 0.060 = 0.60x tube r, faces +0.5 mm past the 3.58 tube cap; the
XM914's dark muzzle run + smokeBank dark tubes are pinhole-class
compliant as built.
GATE x2 (byte-identical, final tree): 6.2 | hull 6.2 (+2.5 IMPROVED)
whole 10.3 (+1.2) turret 75.3 (+11.1 vs the ledger row) stations 69.6
dims 100 floaters 100. Late §B2 closures folded in: corner fender decks
at the 1.55 lip plane + under-deck guard/side panels (tejas grammar) +
bay bulkheads + rack-mesh seal — view-rear stern flood 39 -> 0, hero
2 -> 0, rearleft 137 -> 132; the view-rearright 305 px band decoded as
UNDER-BARREL enclosed air at the bow (the XM360 tube over the bow deck,
framed by the muzzle device — pre-existing 139 px class re-classified
by the frame; not a stern void; same class as the m1a1 hero
border-clip). The min row stays the certified oracle-cap class;
achievable rows dims/floaters HELD 100. Stations decode: i1 8.7% = the
census M240 + closure zone (final-state re-run identical) (owner-density trade on a capped mask);
i3 67% / i12 25% pre-existing print classes. track-clip --exact: band
rear 8 (pre-existing, <=60 bar), shoe 0/0 ✓. turret-parent 0/0/0.

## COMBINED ROUND — CROWS REWORK + ORDER-B BUILD-UP (2026-08-06/07,
## abrams builder, registry §4.999; non-graduate, gate-in-loop)

### ORACLE STATE CORRECTION (supersedes the "certified caps" above)
The 2026-08-01 cap narrative describes the PRE-WARP print. Oracle-repair
batch-20 (commit 42ec7e8, 2026-08-02) COMPRESSED the GLB above its 2.30
knee: RWS bridge band 3.0-3.47 -> 2.44-2.451, whips 4.13 -> ~2.47, tube
pinned to rear+9.77. Re-derived this round from the CURRENT file
(tmp-abrams-refcurves + the gate's own worst tables):
- bridge band A: z +1.06..-0.85, tops 2.43-2.46, front x -0.57..+0.55;
  a step-down to ~2.10 whose z-seat measures ~1.45-1.74 in the gate's
  registered frame (an A/B bisect against a 1.09-1.40 seat read -9.7 on
  the hull row);
- slot z -0.9..-1.3 (tops = deck 1.5-1.7), then band B (rear sensor
  deck) z -1.37..-2.26, tops 2.29-2.35 out to x ±1.45, whip MASTS at
  (±1.13-1.15, -1.9..-2.05) topping 2.46-2.47;
- the SHELL itself is warp-compressed: plateau ~2.33, shelf ~2.33, tail
  ~2.22/1.71-1.74 (the warp's 2.30 knee caught the turret node too);
- skirt: face ±1.80-1.81, top SLOPING with the deck line (1.36 bow ->
  1.745 rear), bottoms LOW over the idler then raised ~0.80 with the
  road wheels exposed (§B8.1), plus a full-length rub strip at ±1.83,
  y 0.77-0.81 — the print's own widest content (widthM carrier);
- corner pod belt runs to x ±1.665 at tops 2.31-2.32.
THE OLD "3.2-3.46 band certified unreachable / registration pollution"
CAPS ARE RETIRED. The remaining structural caps are: (1) PLATEAU CAP —
published heightM 2.44 is sovereign, the proc plateau anchors p95 at
2.43-2.46 while the warped shell reads ~2.33: ~8-10 turret side columns
carry +0.10-0.13 err by construction (batch-20 OVERSHOT on the turret
node; orchestrator warp candidate: turret-node knee 2.44 or a
decompression pass — normalize plan below); (2) the deck-step/slot seats
teeter ±2-5 row pts with the print's articulated-shell registration
(dAlong 0.02-0.05 across configs; minimax seats banked in code
comments); (3) station i12 topPct 25.1 and i1 8.8 (the census-M240
trade) are pre-existing print classes unchanged all round.

### ORDER A on this mark — XM914 station rework (§4.999a)
The 30 mm run was BURIED inside the bridge-deck slab (receiver fully
interior; only a muzzle stub past z 1.45 read). Rebuilt as ONE coherent
station on rest azimuth +34 deg (0.60 rad, toward the left bow quarter
— the family's only station with true yaw freedom: the deck envelope
hides every solid from all three masks): slew drum + receiver housing
with pale cover lick at the 2.435 cap plane + exposed barrel run with
muzzle block and §B3.1 dark bore tip + EO box with aim-face aperture +
ammo can GUN-LEFT with feed chute + flush conduit lick toward the mast
head. Rest yaw documented: +34 deg. The old dead-forward stub and its
z 1.43 light-pod column retired WITH the step retune (ref reads 2.10
there post-warp).

### ORDER-B retune log (gate-in-loop; every step measured)
baseline 6.2 | 6.2/10.3/75.3/69.6/100/100 (the ledger row)
-> whips 4.12 -> 2.47 masts on a new REAR SENSOR DECK (band B: slab +
   louvers + legs + sills, z -1.37..-2.26, tops 2.31; the 4.12 rods were
   the documented batch-20 retune debt: d +1.65..+1.76 on 4 front + 2
   side columns), old 3-pot cluster retired; bridge deck re-seated
   z -0.84..+1.47 with the left edge at -0.57 (ref span) and the
   step-down wedge 1.45 -> 1.74; corner-pod SENSOR WINGS to ±1.665 at
   2.31; XM360: NO evacuator bulge (the real XM360 runs a slim shroud;
   the bulge also broke the dims body filter once the whips came down —
   rough 2.46 puts the 12% band threshold at 0.295 m and the 45-deg
   muzzle box's 0.34 diagonal dragged hullLengthM to 9.09; muzzle boxes
   slimmed 0.24 -> 0.20) -> 52.7 | 52.7/44.6->45/68.9-69.7/79.4/100/100
-> shell follows the warped print DOWN where dims allow: shelf 2.46 ->
   2.325w, stern 2.13 -> 2.06w, top rings widened ±1.62 -> ±1.65,
   plateau 2.46 -> 2.43 (inside the 1% grace; heightM p95 anchors 2.43)
-> SKIRT re-architecture (§B8.1 WHEEL EXPOSURE — the first full-depth
   cut walled off the running gear and failed the glance test, caught on
   the REF|PROC pair): hand-rolled kneed panels (noSkirt + AX-side
   build): face ±1.805, tops on the deck line, bottoms 0.52 over the
   idler rising to 0.80 (wheels read), seam sticks, full-length rub rail
   with outer face ±1.828 = the committed 3.66 width plane (WIDTH
   GUARD); §B2 rear closure kit trimmed inside the new face; decals on
   the face (1.5 mm proud, sub-AA)
-> FINAL 49.4 | 56/49.4/68.6/76.4/100/100 (x2 at close below)
LADDER vs baseline: hull +49.8, whole +39.1, stations +6.8, dims 100
HELD, floaters 100 HELD; turret 75.3 -> 68.6 is the HONEST RE-DECODE:
the old 75.3 was measured under the retired whip-polluted registration
(the 2026-08-01 "+0.16-0.20 dy pollution" note), and the plateau cap
above binds ~8-10 columns; ceiling with a dims-pinned plateau measures
68-72 across seats (teeter documented).

### §C.1 winding + §B5 (the two banked re-cert orders — both resolved)
- rev-1/12px order: the latent reversed piece was the MIRRORED corner
  pod slab (side=-1 handed slab() the opposite ring handedness) — bound
  through sideSlab; a step-wedge slab introduced mid-round was caught
  reversed by the same audit and re-wound. CLOSE STATE: mode-1 rev 0 /
  mix 0, verdict CLEAN; a 12 px @top hairline at the stern lip
  (z -3.95, y 1.33, x ±0.93 — the abramsHull tail-shelf class,
  pre-existing, no reversed piece attached) is the honest residual.
- whip yaw-stranding (mode-2 HARD): the REAL AbramsX carries the whips
  on the turret bustle corners, but the ORACLE bakes them (and the whole
  band-B deck) into its HULL mask — ORACLE-REGISTRATION-PINNED class
  (m1a2 works-field precedent). A proc-only re-parent regresses the
  matched hull columns, so the fix is COUPLED: turretFollowers extension
  on the abramsx MODEL_SOURCE registration (userdrops4.js — outside this
  builder's single-owner file) + the READY turret-side branch behind
  AX_WHIPS_TURRET in buildAbramsX (pods re-based on the shell chamfer,
  mast tops 2.47, world pose preserved at rest) in ONE landing.
  mode-2 close state: 8949 px candidates, top rig_hull/mesh#25 (the
  masts + band-B deck at 2.36-2.47 static under the yawing shell) —
  ADJUDICATED BY-DESIGN pending the coupled landing: it is the print's
  own architecture (its hull mask carries the identical static band).
- §C proxy-size law: buildAbramsX now pins P.muzzleZ = 3.58 (the gun
  shadow proxy ran to the cloned spec's 5.28 barrel = world z +7.48,
  1.7 m past the real tip — the leclerc stale-proxy class).

### §B8.1 four-box (close state, world)
hull x ±1.83 (3.66 committed) y 0.01..2.47 z -4.01..+3.97 (7.98);
turret (shell) x ±1.70 y 1.55..2.43 z -2.53..+1.85 + gun to z +5.80
(overall 9.81 ≈ published 9.77 +0.4%); heightM p95 2.43-2.46 vs 2.44.
Identity read: low-profile unmanned hex shell (0.9 m tall), XM360 slim
angular shroud with bore, kneed slab-side skirts with exposed wheels,
raised twin-mast rear sensor deck, corner pod wings — the four-view
REF|PROC pairs live at shots/abrams-crows-r1/final-abramsx/.

### §I mg census (report-either-way clause)
mg1+3d STANDS via the stowed FITTINGS M240 on the rear deck (unchanged
this round; its z -3.02 column cost is priced in the row). The XM914
remains hand-authored (§B3.1 cylinder run at the print's own bridge
station under the deck clamp) — the census exception narrative from the
rear round is RESOLVED as "census satisfied, XM914 justified" and needs
no further exception.

### CLOSE PROOFS (this round)
GATE x2 IDENTICAL: 49.4 | 56/49.4/68.6/76.4/100/100 (vs the 6.2 |
6.2/10.3/75.3/69.6/100/100 ledger row — min +43.2). Hash x2: 92aed610
-> 9c059ce0 (44/68208). Winding mode-1 CLEAN (rev 0, the 12px stern
hairline documented above); mode-2 8949px adjudicated by-design pending
the coupled whip landing. track-clip --exact 0/8 band (pre-existing
<=60 class) 0/0 shoe; turret-parent 0/0/0; standard-check contig 0,
census mg1+3d. Evidence: shots/abrams-crows-r1/final-abramsx/ +
yaw{0,90}-abramsx/. NORMALIZE PLAN (orchestrator lane, §E): batch-20's
y-compress caught the TURRET node below published height (shell plateau
~2.33 vs heightM 2.44) — candidate follow-up: re-run the compress with
the turret-node knee at 2.44 (or a turret-only decompression), which
would release the ~8-10-column plateau cap and let turret_side re-reach
~75+ honestly.

## §5.27 FIX ROUND (2026-08-07/08, abramsx fix builder — non-graduate,
## gate-in-loop; closes the seven orders of the FAIL-5.5 verdict)

### Per-order log (markers AXFIX-O1..O7 in buildAbramsX/AX_HULL)
1. WHEELS (§B8.1 gate-1): wheel train rebuilt print-true — r 0.38->0.31
   (the 0.38 discs at 0.68 pitch OVERLAPPED 8 cm; the ref's wheels measure
   r ~0.28-0.31, span 0.10..0.66), centers 0.49->0.425 (bottoms stay on the
   band inner face), dishR 0.74 exposes the stock tire cylinder as the FAT
   DARK ANNULUS tinted by the tireHex OWN-BUCKET clone 0x232220 (§C
   tone-slot law: wheels/detail slots are repaint-registered = retint-dead);
   OWN-BUCKET lit-steel face plates + hub caps (merged single mesh, hooked,
   0x4d5044) stand PROUD of the stock disc/cap planes (1.536/1.577 — the
   round's PROUD-PLANE lesson: the first dressing cut at 1.503-1.531 was
   fully occluded and moved nothing). beltCoreTop 0.47 splits the solid
   0.41..1.02 belly core into the real PAN (0.41 front-row floor held,
   hullDark so the bay reads shade) + open under-sponson air = the print's
   inter-wheel daylight (§B2 legal class). contactZF/R pinned 2.24/-2.22
   (certified ramps byte-held); deadSag 0.03 (taut live-track top run —
   at r 0.30/0.415 the run dropped into the sub-hem window as a black
   scalloped band, bisect receipt).
   MEASURED (official view-left, final bytes): band p50->p90 spread 3.6L ->
   37.0L; daylight 0 -> 6 gap runs of 15-17 px at thr40 (+11 bg-through
   column runs; the ref itself reads 2 wide runs); 7 primary disc peaks at
   the 37 px pitch (62/98/135/172/210/254/292, prom >= 6) and 7 lit discs
   countable at garage-frontleft. track-clip --exact 0/0 band 0/0 shoe
   (the pan split also cleared the 10 pre-existing rear band voxels).
2. REAR FLAPS: the floating slab (bg on all four sides, high-rl exhibit)
   is now the print's HINGED assembly per side: hinge bar buried into the
   corner-guard 1.19 bottom edge, 0.62-tall dark flap (ref hanging content
   0.527..1.19 at z -3.62..-3.73), pale hinge straps crossing bar onto the
   guard + bolt heads — guard->strap->bar->flap all interpenetrate: 0 bg
   through the joint by construction; verified in the garage set (enclosed
   sky at rearleft/rearright 3/5 px speckle, none at the flap).
3. STERN RACK -> SOLID STEPPED DECK (§K merkava mechanism): the four
   stilted legs are REPLACED by a full-perimeter closed plinth (front/rear
   walls + side cheeks 0.73 tall, bottoms buried in the deck loft, tops in
   the slab underside) with §B3 grammar (dark intake bays + louver strips
   per cheek + rear inset bay + sills). Close-stern through-sky: the only
   enclosed-sky residual is 56 px UNDER the XM914's exposed barrel run
   (the certified under-barrel open-structure class, XM360-over-bow
   family) — the table see-through and post-gap sky bands are gone
   (high-rl enclosed 207 px == the OLD render's own 207 = the print's
   bridge/band-B slot air, pre-existing unchanged).
4. ROOF EAVE: decoded — the wall band between the flank-rail tops (local
   0.31) and the roof rim (0.48) leaned INWARD and sat in full shade under
   the rim: a mushroom-eave shadow slot at garage-high angles. Closed with
   §K raked closure bands per side (turret bucket, two segments following
   the plateau and falling-shelf lines, from inside the rail shoulder to
   1 mm under the rim corner) — the roof now meets a lit faceted wall
   (pixel-diff witness: 1,619 px in exactly the slot region). The
   remaining plate lips (bridge deck rim <= 4 cm over the shelf) are
   panel-line class, not eave. Yaw-pair verified: the bands rotate with
   the shell (§B5).
5. ROOFLINE IDENTITY (within the 2.435/2.459 caps, p95 budget untouched):
   XM914 receiver 0.15 -> 0.44 wide (real class) + thermal sleeve collar +
   fatter barrel (top plane 2.4315 HELD) + real sensor head with dark
   optic face plate + proud aperture glass + full-size ammo box + chute;
   pano drum 0.098 -> 0.128/0.138 base with 0.098 head (top 2.459 grace
   EXACT), gunner's hood 0.30 -> 0.38 wide; corner pods take bigger dark
   visors + lens strips + wing sensor faces. CROWS-FORWARD azimuth 0 held.
6. MUZZLE: tone-honest pepperpot — OWN-BUCKET lit-steel rib rings (0x8e948c
   clone, recoilG-parented like boreDisc) interleave the dark slot tori on
   the shroud + band the dark end brake: the hero-frontleft axis profile
   alternates 12 lit/dark band transitions (bar >= 3); radial extreme
   0.116 = certified muzzle-cyl class, all z inside the existing device
   span.
7. MG TRAY + STERN (§B3.2): straps now DRAPE OVER the stowed M240 (tops
   1.816 = certified stack class) with buckles + rail drops; taillight
   clusters sit in RECESSED dark bays (lamps 5 mm proud) + glass lens;
   tow points bulked (taller cheek plates, 0.036 bow rings, longer pins,
   dark mouth slots) at the certified proudness class (faces >= -3.986).

### Gate + guards (final bytes)
GATE x2 IDENTICAL: 62.9 | 62.9/69.3/77.7/78.9/100/100 vs the 62.8 |
62.8/69.7/77.2/79/100/100 verdict row — min +0.1 (HOLD-OR-IMPROVE met),
turret +0.5, stations -0.1, whole -0.4 (the O4 closure bands' front-col
cost + teeter; priced against the ordered eave closure), dims/floaters
100 HELD x2. Receipt: a 0.06 aft sill against a misread of the 56 px slit
cost hull -0.2 (62.9 -> 62.7) and was REVERTED (the slit is under-barrel
air, not §B2). Family hashes x2 (before + after, all BYTE-GUARDED):
m1a1 2f277528 / m1a1ha aa7af504 / m1a2 636a4860 / m1a2_tejas f7510d88 /
m1a2_sepv2 e60878a9 / m1a2_sepv3 2c9023d0 / m1a2_tusk b1786e4c. The
abramsHull opt-ins added for O1 (beltCoreTop + dishR/tireHex/deadSag/
contactZF/contactZR passthrough) are byte-identical defaults — proven by
the hash table. abramsx hash 2c6eb344 (53/98961). Audits: track-clip
--exact 0/0/0/0, turret-parent 0/0/0, winding mode-1 CLEAN (rev 0/mix 0;
the 12 px stern-lip hairline is the documented pre-existing residual),
mode-2 5947 px = the certified BY-DESIGN static-band class (was 8949;
the print's own hull mask carries the identical static band — coupled
whip landing stays parked, orchestrator lane). standard-check contig 0,
census mg1+5d. npm test green (166). Whips PARKED, XM914 FORWARD.
Evidence: shots/abramsx-fix-r1/{garage-final, close-final2, pairs-final}
+ shots/abrams-cheek-r1/yaw{0,90}-abramsx (yaw pair at final bytes).

### DIMS-DATUM EXTENSION WORK ORDER (order 5 second half — ORCHESTRATOR
### LANE, §D dims-datum class, filed like the whip normalize plan)
The REAL AbramsX roofline runs ABOVE the batch-20-compressed print: the
un-warped look reference (abrams_x_low_poly.glb, offline probe) reads the
RWS pod at 2.57..3.47 and whips to 4.13, while published heightM 2.44
stays sovereign and the registered print is compressed to ~2.30+ knee.
Candidates, in order: (1) re-run the batch-20 compress with the
turret-node knee at 2.44 (or a turret-only decompression) — releases the
~8-10-column plateau cap AND lets the RWS/sight/pod roofline rise toward
the real proportions; (2) a dims-datum reconciliation for the
mast-inclusive p95 (the §D "datum work order, not a shape defect" class)
so the RWS head + whips can stand at their real heights without dims 0.
Until one lands, the roofline stays clamped at 2.435/2.459 and the whips
at 2.47 (this round held both).

### Coupled whip landing — ORCHESTRATOR ATTEMPT PARKED (2026-08-06)

Attempted the coupled flip with turretFollowers '^Dekali$' (the print's
turret-band cladding group: shell cladding .022, roof plate .023, rear
band-B top .024 at world z -2.13..-1.61 y 2.31, front panel .025).
GATE CRATERED: 0 | hull 0 whole 3.8 turret 0 stations 68.9 — the group
spans the full turret band and AUTOPIVOT RE-DERIVES THE RING from the
enlarged turret footprint; the whole registration shifts (not a mask
migration — a pose break). Reverted; certified 49.4 line reproduced
exactly post-revert (49.4 | 56/49.4/68.6/76.4/100/100, hash 9c059ce0).

REFINED WORK ORDER for the abrams lane: derive the follower set with
mode-2 tooling — candidates must be NARROW nodes (the masts/whip
carriers only; the band-B deck plate stays hull on BOTH sides since the
proc keeps its deck slab on hull). If no narrow node exists (whips baked
into defaultMaterial.022), the coupled fix needs either (a) pinned
pivot (autoPivot:false + explicit ring) so followers can't shift
registration, or (b) an §E node-split surgery isolating the whip
geometry into a new node (batch-43 _index_surgery class) before the
follower re-parent. Print hierarchy + band evidence in the orchestrator
census (2026-08-06): Dekali/korpus/puli groups all sibling to ^Turret$.

## §5.08 DEDICATED ROUND (2026-08-07, abramsx builder — non-graduate,
## gate-in-loop; RELAUNCHED mid-round, prior agent's WIP audited + kept)

### Relaunch WIP audit (AXDED-R1, the stopped agent's tree)
git diff audited hunk-by-hunk (mirror: scratchpad ax-relaunch-wip.diff +
workorder-abramsx-{before,step1,step2}.txt): ALL KEPT, nothing reverted.
The R1 layer (28 AXDED-R1 markers): mid-rear deck DIP retable, belly
0.30->0.41 (front-row 0.412 floor), nose/tail rake lifts (bisect-KEEP),
skirt re-architecture (kneed leaned panels 1.805->1.760, real 16 mm
joints + dark backing, sponson shadow channel, rising lead-fender
diagonal to 3.78, rear -3.505), bridge deck reseat (full height ends
z 0.70, two-segment fall 2.435->2.36->2.10), XM914 station to z 0.05
(azimuth 0 — CROWS-FORWARD held), rear-corner re-scope with open-air
aft of -3.70, MG sunk into a lashed tray, stern ladder, shackle bows
verticalized (the z -4.064 ONLY-PROC column cleared), turret shell
seat drop + stern pull-in to -2.05, flank armor rails, roof/face
identity kit, mantlet collar, muzzle windows + end plate, wheel-face
hub/ring dressing. Verified on relaunch: gate x2 IDENTICAL 62.8 |
62.8/70/77/81.1/100/100 (vs the 49.4 hold bar), family hashes all
byte-guarded, npm test green.

### NEW REFERENCE DROP (owner, mid-round): abrams_x_low_poly.glb
public/models/community-candidates/abrams_x_low_poly.glb (53 MB, same
author Mortavex, Sketchfab Standard = LOCAL-ONLY quarantine; NOT
registered — orchestrator lane; the gate still measures the registered
abramsx-mortavex.glb). Probed OFFLINE (tools/tmp-abramsx-newref.{html,
mjs} — direct GLTFLoader, width-normalized to the committed 3.66):
- UN-WARPED shape truth: whips to 4.13, RWS pod 2.57..3.47 — the
  pre-batch-20 proportions (the registered print is compressed above
  2.30; heightM 2.44 stays sovereign so these stay LOOK reference only);
- node grammar stvol/puli/korpus/dekali* + Bashnya/KOLESA (one tank;
  lowercase set = the RWS assembly, y 2.57+);
- look tells extracted at the garage angles (shots/abramsx-dedicated-r1/
  garage-newref/): upper skirt band ~45% depth with bolt courses +
  crisp panel seams, 7 big readable wheels (light rims/hubs/bolt
  circles), DARK chamfered bow-corner fender blocks, recessed foredeck
  access-panel outlines + shoulder headlight recesses, cheek-recessed
  4-tube smoke banks, twin tall sight drums, pedestal RWS, ribbed
  pepperpot muzzle brake, big rear mud flaps, stern slat stack (the
  vent field, already built), bustle-corner whips (PARKED cert).

### AXDED-R2 layer (this relaunch — new-ref look order, 10 markers)
All mask-interior or sub-AA by construction; every station analyzed
against the current worst tables before authoring:
- WHEEL READ (verdict 1): fat sidewall rings r 0.285 on mid wheels
  (end wheels keep the measured 0.22/0.234 ramp cap), 6-bolt circles
  at radial 0.166 on MID wheels only, hubs 0.118, idler/sprocket hub
  collars r 0.112/0.115 UNDER the 0.13 chain-annulus floor. First cut
  used 0.235/0.255 drum rings + end-wheel bolts: track-clip --exact
  caught shoe front 111 / rear 26 (blind-spot class) — audit-driven
  retreat to the annulus floor; close state front 0/0, rear 10 band
  (pre-existing <=60 class) / 0 shoe, blind spots 0.
- SKIRT READ (verdicts 1+2): per-panel light top-cap strips (x 1.7565,
  47 mm clear of the 1.8065 front-bin boundary) + bolt courses on the
  leaned upper third (heads 1.782+, interior to every proc front span).
- BOW CORNER FENDER CAPS (verdict 2): dark 2 mm relief + bevel strip
  on the risen lead fender (z 3.44-3.76, face 1.806 < the 1.828 width
  plane, tops under skTop).
- FOREDECK GRAMMAR (verdict 2): recessed access-panel outlines (two on
  segment A rx +0.119, one wide on segment B rx -0.053 — RX-SIGN law),
  center crease, shoulder headlight recess bays + split lenses; all
  +7.5 mm flush plates under the local 1.438 mirror-column tops.
- REAR FLAPS (verdict 3): widened 0.30->0.42, outer edge 1.76.
- CHEEK SMOKE BANKS (verdict 4, §B3.2): KIT smokeBank x2 (4 tubes,
  r 0.040, dark) + pale mounting frames, turretG-parented (§B5), on
  the raked band plane at x ±1.10. FIRST SEAT LESSON: authored at the
  FLANK-corner z (2.28) = 0.15 m behind the mid-cheek plane — the
  fitting-census probe (world AABBs via the garage page's __FIT_CENSUS
  debug export) caught the cluster buried; the raked band at x 1.10
  runs z_local 2.38..2.50 — re-seated at 2.41. Measure the plane AT
  THE STATION x, not at the ring corners (the §B1 chin lesson, plan
  edition).
- MUZZLE (verdict 4): 4 pepperpot slot rings (torus 0.104/0.012)
  wrapping the octagonal shroud — radial 0.116 ~= the certified 0.115
  muzzle-cyl class, total 0.232 < the 0.295 12%-band hazard.
- SIGHT DRUMS + RWS BULK (verdict 4): pano base drum 0.098/0.106 +
  head + aperture band + ears (top HELD 2.459 = the 1% grace line),
  gunner's hood + cheeks, RWS pedestal riser + receiver 0.15 wide +
  barrel r 0.023 (top plane 2.4315 HELD), roof bolt courses at ±1.60
  (+8 mm sub-AA).
- (surveyed, rejected: front mini flaps — every legal seat is occluded
  behind the risen fender or undercuts the ref hem line; the
  2026-07-30 floater delete stands.)

### CLOSE PROOFS (relaunch close, final bytes)
GATE x2 IDENTICAL: 62.8 | 62.8/69.7/77.2/79/100/100 — vs the round-open
ledger 49.4 | 56/49.4/68.6/76.4/100/100: min +13.4, hull +6.8, whole
+20.3, turret +8.6, stations +2.6, dims/floaters 100 HELD x2. (R2 vs R1
decode: hull/min BYTE-HELD 62.8; stations 81.1->79 = the R2 dressing's
station-slice footprint, the owner-density trade class; whole -0.3
teeter; turret +0.2.) The gate row was re-stamped from final bytes
after the cross-lane sweep overwrite (orchestrator note honored).
Family hashes x2 (before + after): m1a1 2f277528 / m1a1ha aa7af504 /
m1a2 636a4860 / tejas f7510d88 / sepv2 7ef1c5ec / tusk b1786e4c /
sepv3 12ffb1f4 — ALL BYTE-GUARDED. abramsx hash d2d0ef48 (48/107352).
track-clip --exact: front 0 band / 0 shoe, rear 10 band (pre-existing
<=60) / 0 shoe, blind spots 0. npm test green (166 checks).
Constraints held: whips PARKED (coupled landing stays orchestrator
lane), XM914 azimuth 0 FORWARD at z 0.05, mode-2 8949 px certified
by-design (unchanged), owner WIP files untouched (main.js/garage.js/
materials.js/modelLoader.js), NOTHING committed.
Evidence: shots/abramsx-dedicated-r1/{garage-newref, garage-relaunch-now,
garage-after-r2, close-r2} + the audit logs in the session scratchpad.

## §5.82 COMPLETE REDESIGN — LECLERC METHOD GRADUATION (2026-08-09)

The historical dressed family shell was replaced by a component- and
station-measured AbramsX build using the Leclerc method. Both local prints
were read as geometry instruments: the registered
`abramsx-mortavex.glb` supplies the certified frame and the independent
unwarped `abrams_x_low_poly.glb` supplies the same 1,233-component shape
inventory at its original proportions. The P95 envelope is now the mandatory
XM914/RWS crest: `heightM` 3.47, while the two whip spikes remain excluded.

Delivered geometry:

- continuous knife-bow stations, exact high idler/sprocket and seven-wheel
  centers, loaded shoe corridor, independent suspension links, recessed
  0.5155 m decagonal wheel faces and ten-fastener circles;
- true turret cross-sections rather than an AABB solid: deep lower wall,
  two-stage shoulders, non-monotonic aft terraces/channels, finite-width
  transverse casting at the widest source station, and a real under-bustle
  air gap;
- source-measured asymmetric roof inventory: two staggered open D-hood
  sights with recessed twin lenses, open XM914 rail/saddle receiver and
  articulated 28-round feed, service boxes, smoke banks and corner sensors;
- XM360 tube/shroud/pepperpot run and the source's segmented stern vane,
  spine, vent, socket, flap and tow architecture.

The widest front-elevation wall exposed a useful station-loft lesson. A
single maximum-width section between two narrower sections is a zero-depth
mathematical apex and can disappear from a physical projection. The source
carries that width for 0.06 m; authoring the measured transverse casting
raised `front_whole` from 89.924 to a clean pass without widening the roof.

Final gate x2 IDENTICAL: **90.2** | hull 90.2 / whole 90.5 / turret 91.0 /
stations 93.4 / dims 99.8 / floaters 100. Standard audit: clip 37/26,
contiguity 0, decor mg1+5d. Turret-parent audit 0/0/0. Procedural-fidelity
93.0 (H96/T85/G90/R96). Geometry freeze reproduced x2:
**fe7f9852** (75 meshes / 161040 verts). Batch-20 repair reproduced the
oracle SHA-256 x2 from the standing pristine `.bak`:
**01acf03c1027f08512a0bb7c04fa109b167a281fec0bea017b15638c1aec6816**.

Independent R26 §B8 PASS: every one of 14 views >=9.0, floor 9.0 / mean
9.04. Full verdict:
`docs/critique/shaded-parity-abramsx-redesign-graduation.md`; evidence:
`shots/abramsx-redesign-r2/polish26/`. Non-blocking residuals are slightly
flat side end-track arcs, a more uniform rear bustle shadow, and marginally
smoother top-view mid-shoulders.
