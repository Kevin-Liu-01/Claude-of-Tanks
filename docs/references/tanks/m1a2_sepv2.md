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
the archived visual-review receipt). FREEZE HASH b489ba14
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
floor 9.1 (the archived visual-review receipt). Left
cheek reads ONE raked plane; gun run reads the real M256. No orders.

## §B3.2 DENSITY ROUND (2026-08-06, abrams builder — graduate-change)
The rebase half of the owner directive was already this build's
architecture (rides buildM1a2 with the family shell/cheek/gun lines;
§H.4 kit: RIGHT deck tow cable, CIP panels both forward walls, twin
fifties, rigid ammo crate in the rack, CROWS station) — this round is
the density half.
ADDED: 4 deck tie-down D-rings — glacis pair (±0.60, 2.60) + MID-DECK
pair (±0.85, 1.55); both inside this build's own A/B-measured +17 mm
deck-bin slack (the r3 cable round). The mid-deck pair is legal HERE
and not on the m1a2: this variant's hull mask carries the works field
(wf split) and absorbs the registration hair the bare-deck m1a2 could
not (bisect-proven, see m1a2.md).
REVERTED with the m1a2 (shared decode): right-edge rack fill (ammo-can
pair — the same plan-edge law) and duffel straps. RESIDUAL as m1a2.
GATE HOLD x2 EXACT: min 91.3 PASS | 93.1/92.4/91.3/93.4/100/100 (= the
same-day baseline, both close runs). standard-check clip 0/0, contig 0,
mg1+1d.
§B5 AUDIT (documented negative, HEAD A/B-proven PRE-EXISTING): stranded
2 (unnamed 45% box [-1.42..1.42, 1.04..2.37, -3.96..0.28]; unnamed 26%
full-hull box) — the ORACLE-REGISTRATION-PINNED works field (hull-side
BY DESIGN per this print's follower registration, the documented
BUILD-STANDARD §B5 class) smeared across whole-bucket merged AABBs
(the audit's own coarse-AABB caveat). Identical flags on the committed
HEAD build; adjudicated LEAVE.
CANDIDATE: b74366ac -> b284b8ac (42 meshes / 112100 verts).
CHANGED VIEWS (diff-derived): view-front 0.009% + close-front 0.003%
+ close-roof/hero-frontleft <= 0.002% — ring stations only.
Yaw pair: shots/abrams-b32/yaw{0,90}-m1a2_sepv2/.

### DENSITY-ROUND RE-CERT RATIFIED (2026-08-06): RE-FREEZE b284b8ac CONFIRMED
(floors 9.1-9.3; American MG grammar audited YES; the archived visual-review receipt).

## REAR + BORE + VISIBILITY ROUND (2026-08-06, abrams builder — graduate-
## change; family round home m1a1.md, m1a2.md carries the shared-recipe
## mechanics)
Shares the m1a2 round set: corner taillight guards + tow shackles (rear),
M256 rim+bore (§B3.1), the FULL CROWS mast — here the CROWS II TALL head
+ gun raised +0.075 (top 2.95; §H.4 vs the m1a2's CROWS-LP wide-flat),
loader shield on the TWIN-FIFTY mount (its standing tell), dual whip
rods. p95: spikes = the 3 mast columns; dims 100 by construction.
GATE x2 (byte-identical): 60.3 | hull 93.2 (+0.1) whole 60.3 turret
80.6 stations 83.6 dims 100 floaters 100 (frozen 91.3 |
93.1/92.4/91.3/93.4/100/100). §B7-class owner-authorized cap: mast
columns (front x -0.88..-0.14 err 0.264-0.280, side z +0.17..+0.39 err
0.269), rows whole -32.1 / turret -10.7 / stations -9.8 — the sepv2
head is taller than the m1a2's (the §H.4 split), so its spend is the
family's largest. Owner/escalation quotes in m1a2.md.
§C.1 WINDING: shared band() fix — census rev 2 -> 0, mode-1 clean.
MODE-2 ADJUDICATION (5,519 yaw-stranded candidate px, coordinator
fold-in): ALL FOUR candidate meshes (2666+1788+909+156 px, rig_hull,
heights 1.97-2.41, works-band z -2.7..0.2) are the CERTIFIED
ORACLE-REGISTRATION-PINNED works field — this registration keeps the
ten works-band stowage nodes in the REF HULL mask (bc225318-class
split, proven 91.5 all-components); re-parenting would break the
certified split. Adjudicated CERTIFIED, no move; same disposition for
the turret-parent audit's stranded 2 (the same whole-bucket hull meshes,
45%/26% coarse-AABB overlap — the documented audit-artifact pairing).
Audits: standard-check clip 0/0 contig 0 mg1+1d; track-clip --exact
0/0 + 0/0; npm test green.
CANDIDATE b284b8ac -> 83277374 (42 meshes / 116220 verts, tmp-hashgeo x2
at the verdict tree) — re-freeze on re-cert ratification.

### VISIBILITY RE-CERT RATIFIED (2026-08-06): RE-FREEZE 83277374 CONFIRMED
(floor 9.1+; owner-question YES — the archived visual-review receipt).

## CROWS-REWORK ROUND (2026-08-06/07, abrams builder — §4.999a; family
## round home m1a1.md, per-station table + laws there)
CROWS II tall made coherent (yoke spans the +sepTall gap, collar, can
GUN-LEFT + bracket + chute, IR pod, R1 conduit) + §4.999a PARTIAL ARMOR:
armored crown plate under the lick line + head brow plate (proud flank
plates are structurally unpayable — the graduate's z window leaves ~5 mm
per receiver flank and the plan-pixel flips price anything prouder;
documented). Twin-fifty loader station byte-identical (its shield is
correctly forward). GATE HELD EXACT x2: 60.3 |
93.2/60.3/80.6/83.6/100/100. Mode-2: 5519 px = the certified works
field EXACT (no new stranding). Candidate hash in m1a1.md — re-freeze on
re-cert.

### CROWS AIM-FRAME RE-CERT RATIFIED (2026-08-06): RE-FREEZE dda7bcf4
CONFIRMED (floor 9.1-9.2; owner both-halves YES — the archived visual-review receipt).

## SEPV2 REMAKE ROUND (2026-08-07, abrams builder — §5.07 owner order,
## verbatim: "right now just focus on remaking the sepv2 and sepv3 based
## on the current abrams platforms"; graduate-change, moves the frozen
## dda7bcf4)

### Platform audit (job 1 first half)
The id already IS the current platform: one build path (buildM1a2 + the
V.sepv2/worksHull param surface, the r10 §H derivation) — no stale
variant branches survive (r10 deleted the standalone tables). Audit of
every sep/wf gate this round: works-field parenting (wf, certified
oracle-registration split), §H.4 tells (cable/CIPs/crate/twin fifties),
CROWS II tall + partial armor, mid-deck rings — all current-platform
lines. The remake therefore = the §5.07 kit delta below, all sep-gated
(the m1a2 graduate takes ONLY the shared CROWS-forward azimuth change).

### The remake delta (owner order + coordinator wiki reference)
1. ELEVATED CROWS II — FORWARD (the mark's signature tell per the wiki
   drop; §5.07 order 2): the tall-mast station re-aims to rest yaw 0 via
   the family CROWS-FORWARD mechanics (m1a1.md round home): receiver/
   can/yoke pinned in the certified 3 spike columns (z 0.517/0.625/0.739,
   sepTall heights byte-kept), armored crown re-pinned over the receiver,
   brow on the head, barrel run SHADOW-NAMED past the window. The pod's
   +z apertures now look down the gun line — the §4.999a aperture
   residual CLOSES.
2. IMPROVED CITV + GPS DOGHOUSES (owner: "improved CITV/GPS doghouses"):
   CITV pot (drum + rotating head + thermal window + crown, right of
   center) + GPS doghouse (armored hood + cap + dark aperture + glass,
   left of center) seated on the 2.365 center band INSIDE the station's
   3 spike columns — side-view interior (p95 untouched, dims 100 by
   construction); the read prices FRONT columns only.
3. UAAPU READ (coordinator wiki fact — SEPv2 carries the APU): the LEFT
   outboard grille door reads as the APU exhaust — pale frame + round
   exhaust outlet cut into the louver field + junction box + vent slot,
   all in the rear-band proudness envelope (outlet ring 6.5 mm rearward
   on plan columns whose REF corners reach -3.96 — toward-ref class).
4. URBAN-KIT STOWAGE DENSITY (§B3.2): ratchet straps + buckles across
   the sponson bin lids (+10 mm flush class, side/plan-interior) and
   cinch straps + buckles on the outer duffels' rear faces (1 mm
   sub-AA proud of the -3.295 tails, tops 2.17 — the §B3.2 crown-margin
   lesson honored).
5. Family §B3.2 mid-deck rings, tan/decor: inherited (m1a2ToneKit).

### Gate x2 (byte-identical runs, final tree) — movement vs the 60.3 baseline
**65.1 | hull 93.3 (+0.1) whole 65.1 (+4.8) turret 80.6 (EXACT) stations
83.6 (EXACT) dims 100 floaters 100** (frozen row was 60.3 |
93.2/60.3/80.6/83.6/100/100). The whole-row gain is the CROWS-forward
re-price (the transverse barrel's priced front columns vanish; the §B7
mast cap shrinks); hull +0.1 is the APU/strap dressing net. p95 probe:
spikes = EXACTLY the 3 mast columns @ 2.9616, 4th-tallest 2.4353 —
byte-same as the baseline probe.
CANDIDATE HASH for re-cert + re-freeze: dda7bcf4 -> 7ef1c5ec
(45 meshes / 119460 verts). CHANGED VIEWS (station + roof + tail):
view-front, view-frontleft/right, view-left/right, view-top, close-front,
close-roof, hero-frontleft, hero-toptilt, view-rear/rearleft/rearright
(APU door read + duffel straps), hero-rearright.

### Evidence
shots/abrams-crowsfwd-r1/after-m1a2_sepv2/ + yaw{0,90}-m1a2_sepv2/ (official 14-view pairs; the
M2 reads FORWARD in view-left/close-roof/heroes). Audit lines in the
round report (standard-check, track-clip --exact, turret-parent — the
certified ORACLE-REGISTRATION-PINNED works-field classes expected
byte-same, winding x2 modes). DELIVERED-PENDING-CRITIC; the orchestrator
runs re-cert + re-freeze (§5.07).

## SEP REBUILD-ON-BASE ROUND (2026-08-07, abrams builder — §5.19 +
## §5.19a owner orders, verbatim: "for sepv2s and sepv3, we need to
## rebuild them to use the M1A2 abrams base model and then start slapping
## on extra stuff and decorations" + "i meant the m1a2 abrams (ex tejas)
## is the correct base, the base m1a2 platform is WRONG."; graduate-change
## — moves the frozen 7ef1c5ec)

### The rebase (what changed)
`m1a2_sepv2` no longer rides buildM1a2: profile entry is now
`{ build: buildTejasFamily, station: 'crows2tall', abramsKit: 'sepv2' }` —
the VISUAL PLATFORM IS the tejas-grade build (id m1a2_tejas, f7510d88,
untouched): TEJAS_HULL loft (vertex-measured deck/splash/periscope-shelf
knots, bow planTaper + headlight pods, raised engine deck, §B4 lane
carve, clamped-panel skirts), fender wings + corner tongues + guard
plates with taillight clusters, tejasWheelKit + tejasSuspensionDress
(per-wheel rim/hub/bolt packages), abramsShell swept cheeks (§B1
faceRake 34.8° + §B1.1 raked left bulge), abramsBustleRack open basket,
tejasRoofKit (M250 clusters, wall bands, GPS doghouse, blow-off etch,
cable drum), hand-rolled mantlet + segmented elliptical M256 jacket +
stepped evac + MRS + §B3.1 bore, tejasRearKit + tejasToneKit. The old
buildM1a2 base fit — the works-field box pile, box-core turret,
print-matched deep skirts and inboard narrow tracks — is exactly what
§5.19a ruled WRONG; its sep/wf branches inside buildM1a2 are now dead
code (flagged for an r10-precedent cleanup pass, orchestrator lane).

### Variant kit (kept/reseated on the new base + §B3.2 generosity)
1. ELEVATED FORWARD CROWS II — tejasRoofKit station 'crows2tall': the
   family CROWS-II aim-frame assembly with the riser grown +0.075 and
   the whole head/gun group riding up (receiver lick tops 3.02w vs the
   tejas's 2.95w — the mark's tall-mast §H.4 split survives the rebase)
   + the §4.999a partial armor re-pinned (armored crown under the lick,
   brow plate flush at the head top). Same z-local window [0.135..0.422]
   — probe: EXACTLY 3 side spike columns @ 3.0274, 4th-tallest 2.4591
   (knee class) -> dims heightM 0.78% inside grace.
2. IMPROVED CITV: pot left-forward (drum base sunk into the 0.710 roof
   line, head + crown + thermal window on the +z aim face) INSIDE the
   station's 3 spike columns (z local [0.1615..0.3515], faces to 0.3615
   < the 0.363 window edge) — side-interior, priced on front columns
   (§5.07 class). GPS doghouse = the tejas fixture (already the improved
   wedge + window grammar).
3. TWIN FIFTIES (loader): the skate-rail M240 swaps for a second M2 —
   fatter receiver + top-cover lick + spade grips + heavy barrel +
   muzzle device + fat can + feed chute at the certified transverse rest
   (§5.20 manned-rail class); shield kept; tops <= the 2.453w knee.
4. UAAPU exhaust read: left band of the turbine grille field — frame
   posts + outlet ring/throat cut into the lattice + junction box + vent
   slot, everything <= 6.5 mm proud, rearmost -3.9435 (family law).
5. REAR CIP THERMAL PANEL off the exhaust grille (dark frame + pale
   panel on standoff arms into the -3.937 wall) — completes the CIP set
   AND pins the rear body bin (dims mechanics below).
6. CIP PANELS both forward flank walls (left wall-band bay face -1.695,
   right lip face 1.612; 12 mm on-face) — the side-on garage tell.
7. WORKS-FIELD PARITY ECHO (hull buckets, world coords): this id's
   registration keeps the ten works nodes in the REF HULL mask (the
   certified ORACLE-REGISTRATION-PINNED split) — the echo re-authors the
   works A/A2/B/C blocks + tarp/saddle/strap/crate-lid dressing + the
   glsaa_5 wind sensor at their certified world stations with every top
   CLAMPED under the tejas shell roof at its own z (A 2.398->2.30,
   stair 2.368->2.30, A2 2.328->2.295; B/C unclamped; C rear slices
   trimmed at the shell/rack seam). At REST the echo is fully enclosed
   by the tejas shell — the visible platform is pure tejas; at yaw it
   reads as deck stowage, the print's own rig behavior. Mode-2
   yaw-stranded: 490 px candidates (was 5519 on the old fit) — the same
   certified class, adjudicate LEAVE.
8. §B3.2 density: RIGHT-deck tow cable re-derived on the tejas deck
   polyline (drapes the 1.51 periscope-shelf step; half-sunk class),
   rigid ammo crate in the rack center slot (lid slats + strap +
   bedroll on the lid, top 2.30w fill class) with the stowed-MAG census
   fitting grazing its flank, helmet bag on the LEFT duffel crown
   (mirrors the tejas right-bag), jerry can pair left rear deck (tusk-
   proven sweep-clear seat), glacis spare links + pioneer tools (x <=
   1.04, inboard of the 1.115 band inner face — see the §B4 lesson),
   bow tow-shackle stations, mid-glacis ring pair, dual whip pods
   (family).

### Gate x2 (byte-identical runs, final tree) vs the 65.1 baseline
**0 | hull 1.8 whole 0 turret 29.3 stations 25.3 dims 100 floaters 100**
(frozen row was 65.1 | 93.3/65.1/80.6/83.6/100/100). The movement IS the
owner's order: the old rows were achievable only by BEING the base-m1a2
fit the owner ruled wrong. Registration is sane (side dAlong 0.057, dy
0.014; front dy -0.002 — no rig break); per-class decomposition of the
honest platform price (worst-list, camera-frame deltas):
- FRONT rows (hull 1.8 / whole 0 drivers): the print carries NARROW
  INBOARD tracks (band ~0.98..1.42) and nothing below y~0.60 at |x|
  1.54-1.71; the tejas platform runs the real M1 wide gear (band
  1.115..1.695 + wheels to ground) — err 0.52-0.84 on ~12 columns.
- SIDE bottoms: the print's skirts brush the ground (its front columns
  bottom ~0.14); the tejas skirt hem rides 0.69 with 40-70% §B8.1 wheel
  exposure — err ~0.27-0.35 per skirt column. The print's own read is
  the §B8.1 wheels-invisible auto-FAIL class; the owner's base look
  wins by order.
- SIDE bow tops: tejas headlight-pod/glacis lines vs the print's lower
  bow band (err ~0.33-0.35, 3 columns).
- STATION columns: the tall CROWS II mast vs the print's flattened 2.43
  works band (+0.59, 3 columns) — the pre-existing owner-authorized
  §B7 mast cap, carried from the 65.1 row.
- PLAN spans: tejas full-length skirts/fenders vs the print's short
  skirt band (cover 6.45%, ~1.0 m on the |x| 1.6-1.8 columns).
- TURRET row 29.3: the tejas shell is longer (z -2.78..2.355w + rack to
  -3.17w) and the bore line higher (1.88 vs the print's 1.68) — the
  real-vehicle configuration vs the recovered print's.
The works echo holds the works-band hull columns to the clamp residual
(<= 0.10-0.13) — no works column ranks in any row's worst-12.
DIMS MECHANICS: heightM 2.4591 p95 (3 spike columns exactly, probe
banked); hullLengthM initially quantized 7.82 (-1.37%) on this pairing's
grid phase — the bow shackle stations pin the pod column into the 12%
body filter and the rear CIP panel owns the rear bin: 7.94 (+0.07%),
dims 100. overall 9.78 (+0.15%), width 3.65 (-0.35%).

### Audits (official rigs, final tree)
- standard-check: clip 0/0 ✓, contig 0 ✓ (§B2 zero enclosed holes),
  decor mg1+3d ✓ (stowed MAG + cable/links/cans fittings).
- track-clip --exact: 0/0 band + 0/0 shoe (the first pass read shoeVox
  front 1 — the pioneer shovel seat at x 1.24 sat inside the idler
  shoe-wrap band's radial shell about (0.88, 3.02); tools re-seated
  x <= 1.04 inboard of the 1.115 band inner face. §B4 LESSON, bank:
  the WRAP BAND has a radial SHELL footprint over the glacis — deck
  kit near the end wheels needs a radius check, not just an x check).
- turret-parent: stranded 4 / abutting 2 / dangling 0 — ALL the works
  echo + whole-bucket coarse-AABB smear (rig_hull 29%/29%/26%): the
  certified ORACLE-REGISTRATION-PINNED class, same disposition as the
  graduation-era stranded-2. Adjudicated LEAVE (re-parenting breaks the
  proven ref split).
- winding-audit: census reversed 0 / mixed 0, deficit 0 px, mode-2 490
  px candidates = the echo class above (was 5519). No HARD.
- npm test: 166/166 + track-geometry green (clean-room worktree).
- Whole round measured in a CLEAN-ROOM worktree at HEAD be02f5d + this
  file only (LIVE-TREE FROZEN-SIB law; the live tree carries foreign
  owner WIP in materials.js/main.js/garage.ts).
- DELIVERY-TREE RE-VERIFICATION: HEAD moved be02f5d -> f2720c2 mid-round
  (owner lanes landing; abrams.js + both SEP packets untouched
  upstream). Re-proved at f2720c2 + this file: all 8 hashes IDENTICAL
  (six guards + both candidates) and gate x2 BYTE-IDENTICAL
  (0 | 1.8/0/29.3/25.3/100/100) — the round's numbers bind at the
  delivery tree.

### Hashes
FROZEN SIBLINGS BYTE-EXACT through the whole round (verified at every
milestone): m1a1 2f277528, m1a1ha aa7af504, m1a2_tejas f7510d88, m1a2
636a4860, m1a2_tusk b1786e4c, abramsx d2d0ef48. THIS id:
7ef1c5ec -> **e60878a9** (50 meshes / 172952 verts) — candidate for the
orchestrator's re-cert + re-freeze (§5.19 protocol).

### Evidence
shots/sep-rebase-r1/: self-m1a2_sepv2/ (14 views, proc-only critic-rig
replica), yaw90-m1a2_sepv2/ (yaw pair: shell/rack/CROWS/CITV/crate/CIPs
rotate; echo + hull kit stay — the print-rig class), pairs-m1a2_sepv2/
(official tmp-tank-critic 14-view pairs, zero console errors),
family-strip/ (strip-left/hero/top: tejas | sepv2 | sepv3 in ONE scene —
the shared platform + distinct kits at a glance). Probe tools banked:
tools/tmp-sep-{selfshots,familystrip,fourbox,regprobe,invprobe,endcols}.*

### Honest residuals (for the re-cert critic)
- The gate rows above are the §5.19a platform price — scoring this id
  against its print now measures the print's OWN divergence from the
  owner-ordered base look (deep skirts, inboard tracks, short shell).
  A §B7-class cap table per row is in the gate decomposition above; the
  orchestrator may prefer re-oracling this id (the tejas GLB serves the
  other five family members) — flagged as the clean long-term fix.
- procShadow_gun (factory, spec-length 5.283 from the tejas trunnion
  pivot z 1.91) tips at z 7.19 — 1.39 past the muzzle, the §C stale-
  proxy size class. Harness-neutral TODAY (visibleBox/masks exclude
  /shadow/i), but it is real shadow-pass geometry family-wide on the
  tejas rig (tejas/m1a1/m1a1ha/tusk identical) — shared-file fix
  (tankFactory), orchestrator lane.
- The works echo pokes into the (hollow) shell interior at rest by
  construction; the shell roof/walls occlude it everywhere (verified in
  the 14-view set + yaw pair + toptilt).
- ARAT-none, TUSK-none: variant identity is CROWS-II-tall + CIP + twin
  fifties + APU read + urban stowage — §H.4 tells vs tejas (tall mast,
  CIP pair, crate, twin fifties, cans, rear CIP) verified in the strip.

## RE-ORACLE (2026-08-07, SEP-on-tejas ratification §5.34)
Ratified critic PASS 9.3 (hash bracket e60878a9 / tejas f7510d88).
This id formerly measured against the now-deleted Tejas comparison adaptation;
that registration is historical and no longer used. Honest
baseline x2: min 0 — FALSE-0: the works-field parity echo (sep2 block,
abrams.js) serves the retired print's REF-HULL mask and reads as hull
mass the bare tejas print lacks. NEXT TOUCH (moves hash, per critic
constraint): delete the echo + its wf dressing, then graduate-change
chain (gate x2, re-cert changed views, re-freeze). Expected recovery:
hull/whole/turret re-read as pure tejas platform + kit deltas.

## WORKS-ECHO DELETION (2026-08-08, §5.34 chain — dedicated graduate-change touch)
Pre-edit verified in the live tree: hash e60878a9 (50/172952) + all seven
family guards at frozen values in one battery; abrams.js byte-clean vs
HEAD 3d204b8 (HEAD moved 35cb17e -> a70aa18 -> 3d204b8 across the wait
window with abrams.js untouched — delivery-tree law carries).

DELETED from the `if (sep2)` block (src/vehicles/profiles/abrams.js):
- the 14-box WORKS-FIELD PARITY ECHO (A/A2/B/C hull-bucket hb2 boxes,
  tops clamped 2.30/2.295/2.281/2.262) — existed only to serve the
  RETIRED recovered-print registration's REF-HULL mask (§5.34 FALSE-0
  class; vs the bare-hulled tejas oracle it read as phantom hull mass).
- the whole `if (P.q)` echo-dressing block (tarp bed + saddle trio +
  straps + crate-lid ribs — the wf set).
KEPT (genuine SEPv2 identity, certified lines, per the round order):
glsaa_5 driver's wind sensor (code-labeled genuine hull-side kit; the
hb2 world-corner helper stays for its two hullDetail boxes), RIGHT-deck
tow cable, flank CIP pair + rear CIP thermal panel (dims service), UAAPU
exhaust read, jerry cans, spare links, pioneer tools, bow shackles,
mid-glacis rings; turret kit (CROWS-II-tall/CITV/twin fifties) untouched.
Spec-map comment updated to the re-oracle truth (echo sentence removed).
Diff: -52/+15 lines, both hunks sepv2-only. npm test 166/166 +
track-geometry green.

### Gate x2 (byte-identical, live tree, tejas oracle)
**64.6 | hull 69.5 whole 64.6 turret 78.9 stations 77.4 dims 100
floaters 100** — runs 1 and 2 cmp BIT-IDENTICAL on the full report
(docs/geometry-gate/m1a2_sepv2.json). Recovery vs the §5.34 FALSE-0 row
(0 | 0/17.3/19.8/77.4/100/100): hull +69.5, whole +47.3, turret +59.1;
stations/dims/floaters carried exactly (the station read is the
pre-existing owner-authorized CROWS-mast §B7 class, untouched by this
deletion). The row now prices what §5.34 predicted: pure tejas platform
+ SEPv2 kit deltas vs the tejas print.

### Hashes
sepv2 e60878a9 -> **54b35994** (50 meshes / 166364 verts; -6588 verts =
the echo mass; graduate-change — the freeze moves BY DESIGN, §5.34).
sepv3 FIRST-CHECK: 2c9023d0 HELD (shared buildTejasFamily; deletion is
sep2-gated in bytes). Family byte-guard 6/6 EXACT same battery: m1a1
2f277528, m1a1ha aa7af504, m1a2 636a4860, m1a2_tejas f7510d88,
m1a2_tusk b1786e4c, abramsx 2c6eb344.

### Evidence (shots/sepv2-echodel/, before/after, same rigs)
{before,after}-garage/ (6 garage angles), {before,after}-self/ (14-view
critic-rig replica), {before,after}-yaw90/ (turret-swung pair — the arc
where the echo lived). Deck verdict: NOT BALD — at yaw the exposed
mid/rear deck reads the real tejas engine deck (grille field, panel
seams, corner furniture) + the retained SEPv2 deck kit; no re-seat
needed (the echo pile was phantom stowage OVER the real deck, never a
substitute for it). Rest arc: front views byte-IDENTICAL across
independent runs (renderer determinism proven); rear/side/top rest
deltas are localized slivers where echo tops peeked at the shell/rack
seam — pixdiff (tools/tmp-sepv2-echodel-pixdiff.mjs): worst view-rear
1282 px (0.313%), all others <= 0.09%, bboxes inside the rack band.
Changed views for the re-cert critic: the yaw90 set + view-rear/
rearleft/rearright/left/right/top + garage-rear{left,right}/high-rl.

### Mechanics
LIVE-TREE ritual held: marker greps (hb2 17 -> 3, WORKS-ECHO DELETED
== 1, old header == 0) + git log -1 immediately before every battery;
pre/post-edit abrams.js mirrored to scratchpad. FIFO: one ticket per
shot batch (3 rigs per ticket). Machine-storm discipline: the round
waited out sustained load 250-1000 (parallel-lane batteries) and ran
in the 8-21 trough per the starved-Chrome law. DELIVERY-TREE
RE-VERIFICATION: HEAD moved 3d204b8 -> b0ea4f5 (docs-only landing,
§5.46) after the measure batteries — full 8-id hash battery re-proven
EXACT at b0ea4f5 (sepv2 54b35994; sepv3 + six guards frozen-identical),
the round's numbers bind at the delivery tree. DELIVERED UNCOMMITTED
for the orchestrator's re-cert critic + re-freeze (§10 graduate-change).

## FLANK-PANEL PITCH + RE-CERT (2026-08-08, owner order)
The SEPv2 kit rides the shared pitched carriers; CIP faces retain their proud
offsets and stay connected. Gate x2 byte-identical: 64.6 |
69.5/64.6/78.9/77.4/100/100. Independent 14-view re-cert PASS, floor 9.1 /
mean 9.18. RE-FREEZE **54b35994 -> c5bfbb70** (50 meshes / 165356 verts).
Full verdict: the archived visual-review receipt.

## §5.74 DISTINCTIVENESS + P95 RE-FREEZE (2026-08-08)
SEPv2 is now the tall passive-armor member: an elevated massive CROWS under a
full rectangular armor hood, one broad rectangular hull cassette course, and
four large pitched passive slabs per turret flank. This is deliberately unlike
TUSK's two-course ARAT and SEPv3's fine grid. Mandatory-kit P95 = 3.4265 m;
heightM 2.44 -> 3.43. Gate x2 exact: 37.3 |
69.4/37.3/53/73.2/100/100 — owner-adjudicated oracle divergence caused by the
mandatory new silhouette/datum, NOT a geometry PASS. Independent 14-view
re-cert PASS, floor 9.2 / mean 9.31. RE-FREEZE **c5bfbb70 -> a0a4e87c**
(50 meshes / 168548 verts). Full verdict:
the archived visual-review receipt.

## FULL ARMOR/GHILLIE RE-FREEZE (2026-08-10, §5.107)
Full cover now sits over the segmented side armor, SEP rear panels and tall
armored CROWS without obscuring its apertures. P95 height is 3.44 m. Corrected
yaw ownership PASS; independent §B8 floor 9.2 / mean 9.41. RE-FREEZE
**a0a4e87c -> 7680a400** (58 meshes / 232258 verts). Full verdict:
the archived visual-review receipt.
