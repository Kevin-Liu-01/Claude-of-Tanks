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
