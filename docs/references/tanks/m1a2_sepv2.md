# M1A2 Abrams SEPv2 — reference packet

Variant: M1A2 SEPv2 — CROWS II station (tall mast), otherwise SEP-family roof;
M256 L/44; deep skirts.
Sources: GlobalSecurity (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams),
armyrecognition M1A2 (https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/m1a2-abrams-main-battle-tank).

## Local GLB oracle
`/models/tanks/community/recovered/m1a2_sepv2.glb` (m_bergman pack), yaw 180,
turret `^Turret$` + follower list, gun `^misc_b$`.
Scoring frame (ground 0):
- hull: z −3.32…3.32 (6.64 — short), deck 1.26 (z 3.2) → 1.40…1.47 (mid),
  rear deck 1.64…1.76 (z −2.5…−3.4). Belly ≈ 0.30. Skirts to ≈ 0.0 (ground
  brushing) mid-run; nose bottom rake (3.5, 0.85) → (2.6, −0.02); tail rake
  (−2.4, 0.11) → (−3.4, 0.65).
- SPLIT QUIRK: part of the upper works does NOT follow the yaw node and lands
  in the hull mask: a commander pedestal hump z −0.4…0.3 up to y ≈ 2.79 and a
  rear rack z −0.6…−2.2 up to y ≈ 2.23 (x ≈ ±1.55).
- yawing turret shell: x ±1.55, z −2.77…1.98 world, y 1.38 up to roughly 2.4
  roof; CROWS II mast + antennas to y ≈ 3.6–3.9 near (x −0.5…−1.0).
- gun: mesh y 1.17…2.20 (visual axis ≈ 1.68), muzzle z 4.85.

## Procedural strategy
Mirror the split: static hull-bucket pedestal + rear deck rack at the stations
above (they read as deck furniture), yawing turret shell + CROWS II mast in
the turret buckets, low gun axis, muzzle 4.85.

## Mismatch note
The oracle's own turret split is partial (recovered asset); a perfect turret
component score is capped by whatever follower list modelLoader applies.

## Outcome (final lab state)
Baseline 66.2 (H73 T39 G60 R71) -> 74.4 (H82 T55 G75 R78).
Mirrored: static commander pedestal + rear deck rack in the hull mask,
stepped turret (tall front block / low saddle / separate rear stowage box),
CROWS II mast at the rear-left, broad rotor-shield mantlet (kept inside the
hull-length bound so the gun-overhang mask stays a clean tube).
Residual gaps: the asset's turret follower split leaves parts of the shell
in whichever mask modelLoader's follower regex assigns them, and its widest
point (one-station protrusion) narrows the whole reference body after width
normalization — the uniform-width procedural reads ~4% wide against it in
plan. Both are recovered-asset quirks, not geometry choices.

## Round 2 (shaded-parity, 2026-07-30)
- The round-1 "rotor-shield" slab (gun-local z 2.05) hovered 1.4 m ahead of
  the turret face over the glacis and swung as a detached box in every yaw
  cell — the critique's floating part. The housing now sits AT the embrasure
  face (gun-local 1.42/1.86) with cover seams + coax, still inside the
  hull-length bound so the overhang mask keeps its clean tube.
- Roof pulled down to the measured band (roofFront/Rear 0.98/1.02 ->
  0.82/0.87; shell roof ~2.55 world) per "pull the roof down ~15%".
- CROWS II mast gets a slew collar, dark-faced head with glass lens and a
  cradled M2 + ammo can; hatches gain rings + periscope fences; M250 banks
  sit on the cheek plates (the old nub block floated 0.6 m ahead of the
  swept face); static deck rack gains a dark mesh floor + strap details.
- Family glacis/skirt/grille kit; driver hump offset left (periX -0.42) to
  clear the recovered asset's low gun line at -10 deg.
- Score 74.4 -> 76.5 (H 82->83, T 55, G 75->73, R 78->79).


## Gate v6/v7 iteration (2026-07-31)
Rebuilt published-true: hull 7.93 (print: ~6.6 — 17% SHORT, certified), deck
line 1.56 rear / 1.40-1.22 front per the true-camera curves, commander
pedestal SEATED on the deck (v5 left it floating 0.55 above — the 3-pose
floater failure), deck rack split into the print's rail run (2.18) + cargo
box (2.27) with its one-column gap, CROWS II head as the only geometry above
the 2.44 plateau (2 columns to 2.93), running gear riding the print's 0.17
floor line (wheels still ground-true at 0 — the print floats, an oracle
defect).
CERTIFIED CAP: the print is ~17% short in hull length and ~19% short overall
with its forward roof at 2.9; under sovereign dims every curve/station row
carries the scale mismatch (hull/whole/turret/stations capped ~0-19). dims
100 and floaters 100 are green.


## Gate v10 cap re-verification (2026-07-31)
The short-print cert STANDS under v10: the bergman print spans ~6.6 m vs
the published 7.93 hull (17% short) with its forward roof at 2.9 — curve
and station rows are structurally capped (hull/whole/turret 0, stations
~19). Dims sovereign and green: 100; floaters 100. No compensation is
carried in the build (published dims 7.93/9.77/3.66/2.44 all hold).

## 2026-08-01 re-verification
Short-print cert STANDS against the current GLB (~6.6 m vs published 7.93
with the forward roof at 2.9): fresh run hull/whole/turret 0, stations 15.1,
dims 98, floaters 100 — the achievable components stay green (dims moved
100 -> 98 from this session's shared rear-face/lift-eye seating in
abrams.js; heightM/hullLengthM remain within grace, >= 90 with margin).
No compensation is carried in the build. Board regenerated.

## 2026-08-02 vertex round — triage classification: ORACLE DEFECT (short print)
Zero-row triage per the fleet directive. Fresh gate run this round:
hull/whole/turret 0, stations 15.3, dims 98, floaters 100 — the SHORT-PRINT
CERT STANDS. TRUE stylization from the vertex toolchain (REG appended;
docs/references/vertex/m1a2_sepv2.json): hullMask -16.5%, bodyLen -16.4%,
overall -16.6%, width 0% (harness-normalized), bodyHeight +30.2% (3.178 —
the CROWS II mast/pedestal band). Orientation clean; 131 turret verts dip
to 0.81 below deck outside the ring (recovered-asset split quirk, matches
the packet's follower notes). NORMALIZATION WARP CANDIDATE (orchestrator
lane): uniform z-stretch x1.197 about the print's z-mid squares hull,
overall AND bodyLen with published in one move (all three axes are short
by the same ~16.5% — the print is proportionally too WIDE, and the width
axis is what the harness normalizes on); the roof band above 2.46 then
needs the same W1-style compression as the family (CROWS II mast 3.6-3.9,
pedestal 2.79). Until warped: not buildable past the cert; build stays
published-true.

## §B1 TURRET FRONT SLOPE (2026-08-04, abrams builder)
MEASURED (probe shots/abrams-b1/probe-m1a2_sepv2.json, same print as
m1a2): print cheek rake 40.4° from vertical (chin y 1.66 z 2.372, slope
-0.851, res 6 mm). Authored before: implicit faceRake default 0.34 ~ 30°
(visible carrier read ~22° through the chamfers). After: explicit
faceRake 0.51 = 40.3° over the 0.60 cheek edge, chin keeps zTip (plan);
slot plate pitches with the face (shared abramsShell §B1 mechanics).
GATE x2 IDENTICAL runs, IMPROVED: min 0 -> 0 (hull 0 unchanged) but
whole 0 -> 7.9, turret 0 -> 15.2, stations 15.3 -> 30.1, dims 98 -> 100,
floaters 100 x2 — the raked face pulls the turret rows toward the print
even under this tank's known misregistration (proc turret front z 1.80
world vs print chin 2.37 — the 0.57 m offset class is the REAL sepv2
work order, its own round). §B5 audit: pre-existing stranded-1
"(unnamed)" reproduced byte-exact at HEAD (HEAD-swap proof this round) —
not from this change; documented for the sepv2 registration round.
Standard-check: pre-existing skirt-zone holes/clip/census unchanged.
Hash 95c8592c -> 11a471d (43/77912). After-pairs
shots/abrams-b1/after-m1a2_sepv2/.

## r10 REBUILD FROM THE GRADUATED ABRAMS (2026-08-04, abrams builder) —
## owner directive "based on our actual abrams": buildSepv2 + the stale
## SEPV2_HULL/SEPV2_TURRET tables are DELETED; m1a2_sepv2 is now a §H
## FAMILY-RIG PARAM DELTA on buildM1a2 (profile entry
## `{ build: buildM1a2, worksHull: true, sepv2: true }` — the factory passes
## the entry as the variant surface, tejas precedent). Gate 0 -> 91.3 PASS x2.

### Scores (own oracle, own userdrops5 registration; runs consecutive)
- BEFORE (the §B1-round state, stale pre-warp tables + misregistered ring):
  min 0 — hull 0 / whole 7.9 / turret 15.2 / stations 30.1 / dims 100 /
  floaters 100.
- PURE PORT (worksHull only, no tells): min 91.5 — hull 93.3 / whole 92.5 /
  turret 91.5 / stations 93.4 / dims 100 / floaters 100 (x2 identical) — the
  m1a2 GRADUATION class against the same print.
- LANDED (with the §H.4 loadout tells): **min 91.3 x2 identical — hull 93.2 /
  whole 92.4 / turret 91.3 / stations 93.4 / dims 100 / floaters 100 PASS**
  (tells spend -0.1 hull / -0.2 turret, inside the §C 0.4 decoration
  allowance; every component >= the m1a2's own current 91.0 row).
- Hash m1a2_sepv2 d98bf39a (46 meshes / 113084 verts). FROZEN SIBLINGS
  BYTE-EXACT before/mid/after (5 checks): m1a2 f3c34424, m1a1 97c10194,
  m1a1ha 5c765fc4, m1a2_tejas 3fcae440.

### Why the derivation is 1:1 (probe evidence, this round)
- The oracle is THE SAME GLB the graduated m1a2 gates against
  (recovered/m1a2_sepv2.glb, batch-21 warped to published dims). The old
  "17% short print" cert is OBSOLETE — fresh refcurves show the warped print
  at published scale: muzzle z 5.79, floating 0.149 track line with the
  single 0.011 ground dip at z 1.5-1.6, 2.431/2.404 works band, 2.459 rear
  crowns, NO tall mast (batch-21 compressed the old 2.9-3.9 CROWS cluster —
  the "tall mast" identity note above is pre-warp history).
- REGISTRATION DELTA vs m1a2 (the only scorer difference): userdrops5 keeps
  the ORIGINAL turretFollowers (no §B5-r2 ten-node extension), so
  ex_armor_turret/2, ex_armor_01/02/04/04_2, ex_armor_l/r,
  ex_era_turret_2/3 ride the REF HULL mask here. Fresh ref side_hull proves
  it: works tops 2.404/2.349/2.321 @ z 0.4..-0.5, B 2.184, the B/C gap dip
  @ -2.125, crates 2.211/2.266, wind post 1.936 @ z 2.60 — the m1a2 works
  recipes map onto the ref hull mask column-for-column.
- worksHull therefore reverts EXACTLY the §B5-r2 proc re-parent (the
  graduation-state bc225318 arrangement, proven 91.5 under this split):
  works A/A2/B/C + dressing in hull buckets at 1.36 deck-embedded bottoms
  (floater-proof at every pose — hull pieces never yaw), sponson walls
  z -0.94..-1.92 @ 1.42, rail boxes @ 1.42 (step edge 1.44; the 1.415
  turret_plan AA fix is moot in the hull mask). All §B5-r2 print-true
  SHARED refinements stay: M1A2_DECK mid-deck knots, 1.468 rear shoulder,
  -0.225 wind-post edge, §B1 faceRake cheek layers.

### §H.4 variety tells (A/B-measured; the variant reads distinct from
### m1a2/m1a1/m1a1ha/tejas at a garage glance)
1. TOW CABLE draped across the right forward deck (§I FITTINGS.towCable,
   26 mm rod + clamp blocks; z 0.62..2.02, x <= 1.333 plan-interior).
   A/B LAW (bank): the first lay at crown deck+27 mm lit the certified
   1.414 deck bins for -0.6 hull — a rod crossing a DOZEN side columns is
   NOT the one-column 29-31 mm hider class. Half-sunk (centers deck+0.004,
   crown +17 mm, knot y tracking deckAt incl. the 1.386 dip) costs -0.1.
2. CIP PANELS on both forward turret flanks replacing the m1a2's
   coil/links pair — same certified bin footprints (left outer -1.449 = the
   coil's outer; right insert 1.333 = the links' stamped class; forward
   wall windows only, per the m1a2 r4 BIN-EXTENT law).
3. RIGID AMMO CRATE + lid slats + strap replacing the center bustle
   sausage (box-vs-round through the rail windows; top 2.28 <= the 2.318
   rail class, seated on the 1.758 floor; z -3.27..-2.83 inside the old
   duffel's own span).
4. LOADER'S SECOND M2 (twin fifties) instead of the M240: fatter receiver
   + spade grips + heavier barrel/hider + bigger can, every crown inside
   the SAME certified M1 caps (receiver 2.385, hider top 2.386 EXACT,
   barrel run byte-identical so the lane-1 window law tip z 0.942 holds).
5. (Shared identity kept: raked §B1 cheeks, works field, drum, paneled
   skirts, sight bands, scallop flanks — the family read.)

### §B table (official rigs, this round)
- §B1 sloped fronts: inherited (glacis one-line 1.15@3.97->1.38@2.21;
  §B1 cheek rake layers 38.2/40.4 deg — print chin probe banked in the §B1
  section above).
- §B2 flood: standard-check contig 0; critic-pair top/tilt sweeps show
  filled decks (works field seats at 1.36 — no pedestal float class).
- §B3 decoration: mg1+1d ✓ (rack MAG fitting + towCable fitting; CROWS M2
  + loader M2 hand-authored under the SS I clause — carrier-bin headroom).
- §B4 containment: track-clip 0/0 exact (same certified rig params as
  m1a2: contactZF/ZR-pinned ramps, xc 1.197, trackW 0.44).
- §B5 parenting: audit stranded 2 / abutting 0 / dangling 0 — ADJUDICATED
  ORACLE-REGISTRATION-PINNED (BUILD-STANDARD §B5 names the m1a2 works
  field as this class's canonical case): the 45% hit is the works-cloth
  bucket (tarp/saddle trio/A2 duffel + the rear louver slats diluting the
  box), the 26% hit is hullDetail (works-A slats + wind post + full-length
  skirt strips — the m1a2 §B5-r2 26% false-flag signature plus the real
  works slats). The REF keeps all ten works nodes hull-side in THIS
  registration, so every proc re-parent breaks parity (§B5-r1
  quantification: full move ~-67 hull). Siblings audit 0/0/0. Yaw-90
  documentation pair: shots/abrams-sepv2-r10/{rest,yaw90} — shell, rack,
  CROWS, crate, CIPs rotate; works field stays, like the print's own rig.
  NORMALIZE PLAN (orchestrator lane, one coupled landing): extend the
  userdrops5 m1a2_sepv2 turretFollowers with the SAME ten-node extension
  the m1a2 override maps carry (`ex_armor(?:_turret2?|_0[124]|_04_2|_[lr])?
  (?!_body)` + `ex_era_turret(?:_[23])?`), then flip the profile entry to
  worksHull:false — the proc side re-parents by construction (one flag),
  re-gate x2 + re-cert in the same landing.
- §B6 trapezoid: raised idler 2.92/0.7675 + sprocket -3.00/0.86, certified
  contact tangents (bow 0.399 / stern 0.637) — the \\____/ read, unchanged
  from the donor rig.

### §D evidence
- visual-evaluator: RIG PARITY OK all views (max yawProxy 1.3 deg @front,
  max |dCentroid| 0.065 m) — the old 0.57 m misregistration class is DEAD.
  Flagged profile rows are the m1a2's documented three-state-invariant
  corner-handover class (quarter dbot -0.65..-0.68 @ z -2.15..-2.17 at
  vertical edges) + short re-segmented contours; report + overlays at
  shots/visual-eval-m1a2_sepv2/.
- Official pairs: shots/critic-m1a2_sepv2/ (14 views, zero console
  errors). Orientation parity ✓ (yawOffset PI honored end-to-end).
- npm test: full suite green (equipment 166 checks, track-geometry ok).

### Honest residuals (for the next critic)
- The m1a2's certified carry classes transfer verbatim: the 0.111-0.113 x3
  side_whole works-band columns (glsaa_8/CDR class), bistable ref columns,
  BIN-EXTENT rear-flank dressing void, plan tail-notch bins (96.9 plan
  rows), corner-handover evaluator rows.
- Tells are ortho-subtle at gate distance (by design — bin-capped); they
  read at garage/hero range: cable + crate from top, CIPs from the sides,
  twin fifties from front/close-roof.
- The §B5 stranded-2 stands BY CERTIFICATION until the orchestrator lands
  the coupled registration+flag round (one-flag flip on our side).

## §B3 BOX-CLEANUP ROUND (2026-08-05, abrams builder) — owner directive:
## "random boxes that are not ERAs... especially around guns"
SWEEP METHOD: fresh critic pairs + a tint-probe (tools/tmp-sepv2-b3-tint.*,
per-mesh flat colors -> pixel-sampled identities; shots/abrams-b3/) mapped
every bare-cuboid read to its source line before any edit; mask-visible
swaps were measured first (refcurves cols + trace-frame math per §D).

### Box table (violation -> read, all `sep`-gated — m1a2 f3c34424 FROZEN)
1. GUN-ROOT D/E BAND (the owner's exact class): bare stacked rectangles ->
   the M256's ARMORED SLEEVE HOUSING. Top edges ROUNDED r 0.04/0.035 via
   the crown-pair recipe (lower box + tangent edge cylinder + exact top
   slab — every side top, plan extent and front bin byte-equal; the
   exposed-corner arc cols are union-covered by D2 behind). CLAMP COLLARS
   at the two seam stations z 2.49/3.06 (flank plates + dark tension-bolt
   segment Z-SPLIT into one plane; x-proud only — plan cols read
   z-extents, side projects along x; right D2 face 0.005 proud = 15 mm
   clear of the 0.44 col boundary per the partial-pixel law). TUBE EXIT
   BOOT (gunDark r 0.10 x 0.05, world z 3.878..3.928) inside the
   [3.82..3.93] col's existing envelope — the gun exits a collar, not a
   flat wall.
2. WIND POST (glacis peg, certified glsaa_5 mask content): bare square
   peg -> the driver's wind SENSOR: head keeps the certified 1.925 top
   plane over the FULL -0.225..-0.13 footprint (front bin -0.221 + side
   col spike hold), dark lens slot, slim dark mast r 0.015 filling the
   exact [2.612..2.642] side window, base bracket; front bins below the
   head stay works-A-covered (union along z). Mask-exact swap.
3. BOW SHOE STACKS (cert 0.53/0.465 side bins): bare dark cuboids ahead
   of the tracks -> stowed idler SHOES: proud pad plates + pale guide-horn
   dots on the OUTER face only (x to 1.4185 < the 1.419 filler face;
   y/z strictly inside each certified block).
4. SPONSON RAIL BOXES (wf hull split, ex_armor_l/r mirrors): bare camo
   slabs -> stowage BINS: dark lid-seam lines + latch blocks + pale hinge
   dots, 6 mm x-proud, >=16 mm clear of the 1.43 col boundaries.
5. ADJUDICATED KEEP: the close-front "dark box at the root" is partly the
   REF-ENDORSED shadow pocket between cheek tips and the D1 start (the r3
   no-holes pocket) — shadow, not a box; the collar/boot work re-frames
   the rest.

### Gate (official rig, x2 consecutive)
BEFORE: min 91.3 | hull 93.2 whole 92.4 turret 91.3 stations 93.4 dims 100
floaters 100 PASS. AFTER x2 IDENTICAL: **min 91.3 | hull 93.1 whole 92.4
turret 91.3 stations 93.4 dims 100 floaters 100 PASS** — hull -0.1 is the
sweep's total spend (bow-shoe/rail AA), inside the §C decoration
allowance; every other component byte-equal. Hash d98bf39a -> b489ba14
(46 meshes / 116696 verts). FROZEN SIBLINGS BYTE-EXACT through the round:
m1a2 f3c34424, m1a1 97c10194, m1a2_tejas 3fcae440, m1a2_tusk f7ecade4
(m1a1ha moved 5c765fc4 -> f5c556dc in its OWN owner-ordered lane — see
m1a1ha.md).

### §H.4 variety intact
Cable, CIP pair, rigid crate, twin fifties all untouched (close-roof/top
pairs); the new bin/clamp/boot/sensor tells ADD variant texture without
moving any §H.4 item.

### Honest residuals
- The graduated m1a2 shows the SAME 1x classes (bare D/E band, square wind
  post, bare bow shoe stacks, bare non-wf rail boxes — same shared lines,
  sep-gated off): REPORTED for a scheduled m1a2 graduate round, per the
  "report, don't force" clause. Evidence: shots/abrams-b3/ tint set +
  this table (the m1a2 renders read identically at those stations).
- CITV/GPS hoods stay unauthored: the r3 roof-recess law (2.4275 lid
  ceiling forbids proud drums) blocks them; the CDR/loader ring drums
  carry the station reads. Documented as law-blocked, not §B3 misses.
- The band's close-front read keeps the ref-endorsed root shadow pocket
  (adjudicated above).

### Round-close audit lines (official rigs, 2026-08-05 — queue-delayed, all landed)
- standard-check: gateMin 91.3 (93.1/92.4/91.3/93.4/100/100), clip 0/0 ✓,
  contig 0 ✓ (§B2 zero enclosed holes), decor mg1+1d ✓ (§B3 census).
- track-clip --exact: front 0 / rear 0 (0/2 offenders with m1a1ha).
- turret-parent: stranded 2 / abutting 0 / dangling 0 — byte-same certified
  ORACLE-REGISTRATION-PINNED classes (45%/26% works-cloth + hullDetail).
- visual-evaluator (fresh, post-§B3): RIG PARITY OK all 14 views
  (yawProxy 0.1-0.7°); flagged rows are the documented carry classes
  (corner-handover + short re-segmented contours). report + overlays at
  shots/visual-eval-m1a2_sepv2/ (17:08 run).
- npm test: full suite green (equipment 166 checks, track-geometry ok).
- LAW-BANK note (orchestrator lane): the cot-shots FIFO at today's agent
  count exceeds the tools' hardcoded 30-min acquireLock timeout — three
  official-rig runs died queued before landing on retry. Timeout or a
  per-agent render budget wants an infra pass. Also: a wrapper holding the
  lock around a tool that self-tickets DEADLOCKS the fleet (this round's
  jam, self-diagnosed + repaired) — never wrap the self-ticketing rigs
  (track-clip/turret-parent/standard-check/visual-evaluator/tank-critic).

### LANDED AS GRADUATION CANDIDATE (2026-08-05, orchestrator)
§B3 box-cleanup round landed. Gate x2 IDENTICAL min 91.3 PASS
(93.1/92.4/91.3/93.4/100/100). Hash b489ba14 (46/116696, orchestrator-
verified). The full-14-view graduation adjudication critic (the program's
25th candidate) is IN FLIGHT at landing — on PASS the orchestrator runs §10.

## GRADUATED 2026-08-05 — DUAL-GATE PASS (fleet graduate 25)
Geo 91.3 gatePassed x2 (93.1/92.4/91.3/93.4/100/100, critic-verified) +
independent critic 9.0+ ALL FOURTEEN views (floor 9.0, mean 9.11;
docs/critique/shaded-parity-sepv2-graduation.md). FREEZE HASH b489ba14
(46 meshes / 116696 verts). Flip-era §10: no runtime registration (dump
clean), three-map mirrors present, no variants backfill, icons x5 from a
clean HEAD worktree. §B5 stranded-2 = certified registration-pinned
classes (coupled followers+worksHull landing remains queued). Critic law
finds banked: yaw-pair evidence is hash-stamped; flood tooling excludes
the pair-PNG label band. Recommended next: m1a2 graduate-change §B3 round
(same shared 1x classes, sep-gated off today).

## §B3.1 GUN-RUN ROUND (2026-08-06, abrams builder — the owner's named
## id; shared buildM1a2 lines, full mechanics in m1a2.md this round)
Inherits the complete D/E-band prism retirement (elliptical housings,
clamp rings, MRS spine, elliptical throat/cinch disks — m1a2.md §B3.1
section). PROOF: m1a2 A/B curves byte-identical; THIS id gate x2
IDENTICAL at the FROZEN ROW: min 91.3 | 93.1/92.4/91.3/93.4/100/100
PASS both runs. standard-check clip 0/0, contig 0, mg1+1d. §B5 audit
stranded 2 / abutting 0 / dangling 0 = the certified ORACLE-
REGISTRATION-PINNED classes byte-same (45% works-cloth / 26% hullDetail,
graduation cert). §H.4 tells untouched (cable, CIPs, crate, twin
fifties). Before/after: shots/abrams-cheek-r1/{before,after}-m1a2_sepv2/.
CANDIDATE HASH for re-cert + re-freeze: m1a2_sepv2 5564306c -> b74366ac
(42/110180). CHANGED VIEWS: view-frontleft, view-frontright, view-left,
view-right, close-front, hero-frontleft.

### CHEEK+GUN RE-CERT RATIFIED (2026-08-06): RE-FREEZE b74366ac CONFIRMED —
floor 9.1 (docs/critique/shaded-parity-abrams-cheekgun-recert.md). Left
cheek reads ONE raked plane; gun run reads the real M256. No orders.
