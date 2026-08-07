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
