# ua_t64bv — T-64BV, Donbas war (Ukraine) — §5.248 ground-up round packet

## Round (2026-08-17, ukraine §5.248 builder lane)
Ground-up §K rebuild replacing the donor-clone composition (`buildT64BV1` +
kit). New builder `buildUAT64BV` in `src/vehicles/profiles/ukraine.js`.
NOTE: the donor t64bv1 is mid-§5.247 rebuild in the russia lane and moved
externally during this round (its own lane; russia.js was never in this
round's edit set). This build is the UA VARIANT — distinct print, distinct
identity, decoupled spec dims.

## Print / instrument
- `public/models/community-candidates/t64bv_donbass_manako.glb` —
  CC-BY-NC-4.0 modder kitbash (never-ship, LOCAL-ONLY; ATTRIBUTION).
- FOLLOWER CENSUS CLOSED (was OPEN in the §5.248 REG): the 106 `_dz_` ERA
  meshes split by AABB — 55 turret-carried K-1 (cheek/roof fans, cy ≥ 1.33
  over the 1.30 deck, cz ≤ 0.05) joined turretFollowers; the 47 glacis rows
  (cz 0.71..1.54) and the four side-band strips (default136/231 pairs at
  |x| 1.53..1.71) stay hull. Stray `_tur_` meshes 001/252/255/260/282 + the
  turret interior 249 joined; `Vert*` (AKM kitbash prop bits) joined the
  Cube/Cylinder prop set. Applied to all three maps + vertex REG.
- OFF-CENTER FIX: the print sits +4.2 m off-center in raw X; under the
  page's origin-anchored gun-forward flip the hull landed at x ≈ -3.9
  (plan registration dAlong -3.93, halved mask resolution). Fixed by the
  reference-glb-loader pre-yaw footprint recenter (see ua_t80u_kursk
  packet; 0.35-diagonal threshold, byte-identical for centered prints).
- Stylization: body -9.6%, overall -13.5%, roof-kit band +22% (banked
  warp below).

## Spec true-up / pin
- dims PINNED to this id's own published receipts:
  hull 6.54 / overall 9.23 / width 3.42 / height 2.17 (REG pubDims).
  The donor's live silhouette* overrides (5.98/8.61/2.28-class, tuned to
  ITS §5.247 masks) are dropped by the new variant() silhouette-purge —
  they do not transfer to a ground-up build.

## Build (measured lines)
- Hull: T-64 lines — 1.315 deck plateau, glacis break +0.53 to the 0.70
  nose, 0.38 belly, layered transom; print wheel stations mapped
  (1.92/1.17/0.29/-0.45/-1.25/-2.06, raised idler +2.75@0.675, drive
  -2.63@0.76), four return rollers (real-truth over the kitbash's three),
  trackW 0.57 steel-wheel course.
- Donbas identities: TWO-TIER K-1 side band (print x ±1.53..1.71,
  y 0.69..1.24 over z -1.47..+2.67); glacis K-1 raft ×4 staggered courses;
  dense turret K-1 horseshoe (two swept rows per cheek + roof-arc row +
  three flank returns/side); raised LEFT commander gallery at the 2.17
  datum; shielded forward NSVT (standing — it fits this print's p95);
  right transom snorkel rack + left btr stowage bin + transom drums
  (print rear cluster); AKM + crate prop cluster on the left rear roof;
  headlights center-glacis; chained front mud flaps (fender tip → bracket
  → flap, floater law below).
- Gun: 2A46-2, muzzle +5.96 (overall 9.23 exact), bore r 0.082.

## Gate (close ×2, bit-identical)
```
min 30.2 | hull 39.6 whole 30.2 turret 34.3 stations 35.4 dims 99.8 floaters 100
```
- dims 99.8 (h 2.18/2.17 +0.5%), floaters 100, exact track-clip 0/0
  (one 12-voxel rear shoe near-contact, 2 cm-margin class), holes 0,
  census mg1+6d PASS.
- CAP: curve components capped by the print's -9.6% body stylization
  (banked warp). Post-warp SIM: hull 62.8 / stations 50.6 / whole 43.6 /
  dims 91.8 — the ladder resumes from the sim work order after the warp.

## §E EXECUTED — batch 62 (2026-08-17, §5.248 §E round)
The banked warp LANDED (repair_oracles.py batch 62; raw knots converted
from the plan frame; candidate mapping recovered and matched — y 2e-5 /
z 5e-4 raw). Receipts: .bak = pristine 57676493…, output 99c27a43…
byte-idempotent ×2; census (228, 52781, 40697). OFFICIAL GATE ×2
BIT-IDENTICAL: hull 39.6->**56.3**, whole 30.5->**42.9**, stations
36.8->**49.3**, dims 99.8->**91.8 = the filed forecast's own number**
(shared-frame requantization priced into the plan), floaters 100 HELD;
turret 30.8->24.9 (now the min; sim said 32.1 — the -7.2 delta is
attributed to the scratch candidate's PRISTINE normals + sub-mm knots
[receipt: candidate NORMAL rows == pristine bytes] pricing knife-edge
chevron/mask columns differently; proc extents identical sim-vs-now).
The per-node z-scope refinement for the fused rear-rack masses stays a
documented follow-up option; the ladder resumes from the new work order.

## BANKED WARP PLAN (§E)
Frame: mpu 0.928041, ground rawY 0.0381, tail rawF -3.0534 along '-z'.
```
y_map   (gate m): [[0,0],[1.35,1.35],[2.28,2.17],[2.70,2.35]]
fwd_map (m from tail): [[0,0],[5.732,6.54],[7.957,9.23]]
```
Candidate + SIM report in scratchpad ua-round/warp-candidates/.

## LAW-BANK finds (this round)
- FLOATER = REAR FLAPS: a mud flap hung at x 1.565 with 35 cm of air to
  the sprocket forms a yaw-invariant ~958 px island in every pose (the
  hull carries nothing at that x aft of the fenders). Flaps must seat
  against the sprocket shoe face or chain through fender-tip brackets.
- The gate's plan registration reads |dAlong| ≈ 4 m when a reference's
  footprint is off-center in X — the off-origin recenter law (loader fix)
  covers the whole class.

## Evidence
- shots/ukraine-wave/pairs/ua_t64bv-raw-*.png; printraw + refview probes
  (the blue/yellow-painted dz census renders in the follower views).

## Residuals
1. Warp lands → hull/whole/turret ladder from the sim order (the kitbash's
   fused rear-rack masses put ±0.5 m reads at the tail — may need a
   per-node z-scope in the final repair recipe).
2. Stations 35.4: sponson/skirt width courses vs the print's full-length
   K-1 plane — partially warp-blocked, partially authorable.

## §5.272 fix round (2026-08-17, verdict 8.7 -> ordered fixes delivered)
- Hash d6ac5b50 -> `4fac9a30`. Gate ×2 bit-identical:
  `min 30.5 | hull 39.6 whole 30.5 turret 30.8 stations 36.8 dims 99.8
  floaters 100` (baseline 30.2/39.6/30.2/34.3/35.4/99.8 — min IMPROVED
  +0.3, stations +1.4). Track-clip --exact --strict byte-equal to the
  baseline run (885/909 sweep + 30 rear shoe = the pre-existing banked
  class; swap-run receipt).
- (1) STERN GRAMMAR (print): the right rack-box + left btr-bin read
  replaced by the print's cluster — an OPEN right-half RACK (posts + thin
  dark lid + solid cheeks, the print's default241 x 0.02..0.97 envelope)
  carrying the TWIN OPVT snorkel tubes (round bodies + cinch bands + end
  rims, reading through the open sides at rear/3q), the hull-LEFT corner
  DRUM (dark ribbed cylZ, round face aft with rim + filler boss, saddle),
  and a canister pair on the left louvre deck. The fat drum left the
  turret rear (bustle now: rail + tarp roll + one strapped box).
  GATE FORENSICS BANKED: a 4-way bisect switchboard attributed the whole
  row exactly — full-width tubes (±1.13) printed new columns into the
  gate's lifted front view over the dome (30.2 -> 28.2); the solid-box
  rack's removal cost stations -5.9; the print-true right-half rack +
  center-left tubes recovered both (front columns dome-covered at <=0.95,
  lid restores the station tops). Cans/chevron/MG-stand measured ZERO gate
  cost. Registration law confirmed: side dAlong 1.117 is structural
  (print -13.5%), NOT edit-driven.
- (2) FLAPS RUBBER-DARK front AND rear: the camo top plates read raw
  wood-tan in the flap closeups — whole flap stacks are hullRubber now
  (geometry unchanged; the documented 12-voxel rear near-contact is
  byte-identical).
- (3) CHEVRON WRAP +2 per cheek toward the mantlet: one lower-row cassette
  flanking the boot (x 0.255, z 1.175, full sweep rotation) + one upper-row
  block riding the dome slope.
- (4) MG STAND thickened: base flange + tapered sleeve around the
  fitting's 2 cm pintle post + gallery gusset (all turretDark, gun
  untouched — p95 headroom is zero at h 2.18/2.17).
- Owner 2b193244 absorb: ventilator mushroom ADOPTED (right rear roof,
  zero gate cost); their outer-return chevron module MEASURED -1.2 on the
  binding turret row and was withdrawn (receipt in the switchboard runs);
  their transverse-drum read is superseded by the print's round-face-aft
  cylZ drum (the ref rear view shows the drum FACE, packet AABB receipt);
  their hull-left cylX aux drum intent is carried by the corner drum.
