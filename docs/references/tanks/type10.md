# Type 10 (`type10`) — oracle packet

Spec home: src/vehicles/modern3.js (P95 datums 6.84 / 9.49 / 3.24 / 2.68).
Build: buildType10 (modern3). Family guidance (owner 2026-08-06):
type10 takes inspiration from type90 recipes.

## ORACLE HOLD (2026-08-06 base-21 wave — provenance, §E ORACLE PROVENANCE law)
The dropped `type-10_main_battle_tank.glb` ("TYPE-10 Main Battle Tank"
by Muhamad Mirza Arrafi / sketchfab.com/nazidefenseforceofficial,
CC-BY-4.0 embedded) is ON HOLD and was NOT registered anywhere:

- The AUTHOR ACCOUNT was adjudicated a game-rip poster on 2026-07-27
  (ATTRIBUTION.md evaluation record: their "Uralvagonzavod T-90AM"
  carried hash-named `*_dds` ripper textures; "the same author's other
  MBTs carry ripper-tool texture names... several pages are now
  deleted. Treated as game rips — forbidden").
- Per-asset evidence is INCONCLUSIVE both ways: this file shows no rip
  signature in-file (flat 5-mesh OBJ pipeline, generic material names,
  4 JPEG textures — but Sketchfab's materialmerger strips original
  names), and the live page description/tags are clean. War Thunder
  does carry a Type 10, so absence of the tag is not clearance. The
  same author's Challenger 1 upload is tagged `createdwithai` +
  `world-of-tanks` — a mixed-provenance account.
- Disposition (orchestrator, 28bf608): GLB moved to the gitignored
  `community-candidates/` staging area pending OWNER adjudication.
  Never gate against it while held (a refused oracle never writes a
  ledger row). The briefly-recorded false-0 ledger row was dropped in
  the same commit.

If the owner clears it: onboarding facts gathered so far — raw bbox
2.982 x 8.288 x 3.626 (y = length axis pre-root-matrix), 148,461 verts
/ 99,944 tris, 5 flat Object_N nodes (turret/gun ids not yet mapped),
Sketchfab-16.59 generator. Expect the standard flat-OBJ follower
treatment (t14/t72b3 class). Until then the type10 lane builds
photo-class from photos + type90 family grammar (false-0 law: dims +
floaters only, never curves without a reference).

## ONBOARDED (2026-08-06, orchestrator lane — owner-cleared hold)

The owner adjudicated the rip-history hold CLEARED ("build the type 10
and challenger 2 as a priority using the real glbs"). Un-quarantined:
community-candidates/ -> public/models/tanks/community/. Registered in
all four harness maps (procedural-fidelity, vertex-extract,
visual-evaluator-page, tmp-tank-critic): turretNode `^Object_6$`,
autoPivot, nose +z, no yaw, textured atlas (no paintUntextured).

Node adjudication (world-box + band probes): Object_2 (49.6k) +
Object_3 (47.4k) running gear/lower hull; Object_4 (8.3k) skirts;
Object_5 (23.9k) HULL DECK + THE SIGHT MASTS FUSED (raw y to 2.53 —
material split, not assembly: the pano/commander sights classify
hull-side, so turret rows are PRINT-CAPPED, challenger2 class);
Object_6 (19.3k) TURRET + GUN FUSED (tube z 1.5..4.73 raw at trunnion
y~0.5, muzzle section at z 4.5+).

Extract (committed docs/references/vertex/type10.json): bodyH 3.478 =
+51.2% vs the 2.30 datum (TALL-STYLIZED print — deep gear + sight
masts; §E height clamp binds s 0.8246, width safeScale k 1.318
recovers); bodyLen +6.3% / hullMask +7% / overall -5.2% / width -2.2%;
773 turret verts interpenetrate 1.2 m below deck (split disease).

HONEST BASELINE (x2 bit-identical, first real type10 gate line):
`0 | hull 0 whole 0 turret 0 stations 0 dims 0 floaters 100`
Verified real (FALSE-0 law): both silhouettes render, curve rows carry
populated ref+proc pairs (side_hull mean 11.17% cover 4.88, reg dAlong
0.87 dy 0.416). The zero is the ANCIENT base-21 build vs the real
print — the §B8 rebuild round starts from this ladder.

## ROUND r1 — §B8 PRIORITY REBUILD (2026-08-07, type10 lane, modern3.js)

Full §B8 rebuild of the ancient base-21 custom against the a06f00c oracle.
Real-proportion re-lay (dims sovereign): hull z -3.415..+3.415, width
anchor = low guard strips at +-1.62 (§D — the ref's own gear-bulge band,
plan z_my -2.39..+2.20), deck 1.44, turret roof plateau 2.28-2.31, ring
pivot [0,1.50,-0.12], trunnion world +1.30 (gunPivot [0,0.32,1.42], len
4.748 + local muzzleBore face 4.79) -> muzzle +6.09 = overall 9.49.

GATE (x2 bit-identical, r14 tree):
`0 | hull 0 whole 0 turret 0 stations 24.8 dims 100 floaters 100`
dims rows: heightM 2.31 (0.58%), hullLengthM 6.79 (0.07%), overallLengthM
9.56 (0.69%), widthM 3.24 (0.03%). plan_hull 80.7 / plan_whole 69.2 /
plan_turret 22.3. tmp-hashgeo 89a11aea (60 meshes / 53656 verts).
Baseline was all-0 + floaters 100.

### §E PRINT-CAP EVIDENCE (why the remaining rows are floored — measured
### per-column with a gate-parity scorer on the live trace, r5 tree)
1. dy COUPLING (the master cap): the hull-row registration fits dy +0.44
   to the print's mast/deck-inflated band centers and fixedReg drags every
   whole/turret comparison up by it — my gun tube's TRUE error vs the ref
   tube is 0.06 m (mine 1.73..1.91 vs ref 1.67..1.85) but scores as 0.50
   on ~14 columns. No legal proc change can shrink dy: it would need +0.4
   mean deck-center lift (= the print's tall hull).
2. FUSED SIGHT CLUSTER (Object_5, hull-side): ref side_hull tops 2.77-2.87
   across ref z -0.7..+0.9 (my +0.25..+1.85) vs the real 1.44-1.50 deck
   under my turret: ~14 cols x err ~0.65. Front-row center cols same class
   (x -0.4..+0.1 top 2.81-2.87): err 0.43-0.62 x ~10.
3. TWIN FAT REAR MASTS (hull-side x +-1.3, my z -1.6..-2.2, tops 3.89 /
   3.94) + turret center mast (3.48): side_hull worst cols 0.95-1.24;
   front +-1.30 cols 1.09/1.11; stations st2/st3 topPct 40.7/28.1 (the
   two trimmed worst). Real T10 carries thin whips there — mine are
   authored thin/clipped (dims-invisible), the print's are solid.
4. TALL DECK LINE (+26%): ref hull deck 2.06-2.10 vs real 1.44-1.50 —
   remaining hull cols carry err 0.3-0.5 after the dy split. My stern
   rack (top 1.66) + engine riser recover what the yaw-stranded gate
   (ringY+0.20 = 1.70) allows.
5. STATIONS st5-10 BLOCK: ref slice tops 2.60-2.87 vs my legal roof
   2.28-2.31 -> topPct 7.1-13.6 x6 slices = the stations ceiling ~25
   (achieved 24.8; mW 0.27-3.19). heightM p95 tolerance on this 58-body-
   column build is TWO spike columns (p95 = 3rd-largest top; the §A
   "<=4 cols" budget scales with body length — baseline heightM 2.58 was
   the old pano box owning p95). The one budgeted spike = the crosswind
   mast (z_my -1.72, top 2.84, <=2 cols, aligned with the ref's own mast
   zone).
6. OVERALL -5.2% PRINT: 9.49 sovereign puts my muzzle 0.72 past the ref's
   (ref my-frame ~5.37 vs 6.09): ~7 side_whole ONLY-PROC gun cols (cover
   3.8) + plan_whole gun-col p95 7.2 — dims caps never trade.
7. hullMask +7%: ref hull mask 7.27 vs my 6.83 -> mid-alignment leaves
   ~3 only-ref stern-basket cols (side_hull cover 3.33) + 0.15-0.22
   nose/tail err on every plan column = the plan_hull ceiling ~80
   (achieved 80.7). The ref stern basket (z_my -3.45..-3.61) lies beyond
   the 6.79 envelope entirely.
Honest ceilings from the table: side_hull 0-10, side_whole 0-5, front
0-20, turret_side ~0 (sub() vs the fused-mast hull rows), stations ~25,
plan_hull ~80. Rows at/near ceiling: plan_hull, plan_whole, plan_turret,
stations, dims, floaters.

### Round mechanics banked
- WIDTH-GUARD (leclerc class, reproduced): the M2's outboard-yawed barrel
  tip at x ~1.69 rescaled EVERY dim -3.9% (dims 100 -> 14.4). Yawed
  inboard.
- PLAN COLUMN WINDOW: the plan trace column at |x| 1.61 has a ~0.12
  window starting ~1.55 — full-length fenders/skirts must end <= 1.545 or
  the extreme plan cols inherit the whole hull span (err 1.07 x2).
- GUN-UNION BODY LAW (new): in side_whole ANY nose content under the gun
  line forms a >=12% band by union (gunTop-fenderBot 0.83) — fender lobes
  past the beak stretch hullLengthM (3.60 lobes read 7.03). Nose plan
  content beyond the dims anchor is unreachable on gun-forward builds.
- §B6 CONTACT PINS: the free tangent solver ran the approach ramp to
  z 3.9 (past the nose, 5 ONLY-PROC side cols); pinned 2.26/-2.20 at the
  end-wheel edges.
- Yaw-stranded gate: static hull mass above ringY+0.20 inside the turret
  footprint reads HARD (my 1.72 stern-rack rails, 932px) — the whole
  stern rack now tops 1.675.
- §B4: inter-track members (tub/lower glacis/stern wedge) at +-0.895 ate
  55/89 exact shoe voxels vs the 0.882 shoe inner faces -> +-0.855.
- §B8.1 gate-1: wheels count only at native tone with the hem at 0.64
  (49% disc arc above the guide-horn line), R 0.35 packed at 0.93 pitch,
  and hullShadow AO bay walls (the lit camo tub had inverted the ref's
  light-wheels-on-dark-bay contrast).
- M2 height law (type90 precedent applied): receiver top 2.31 on a LOW
  right-side swing mount — a roof-standing pintleMG fitting owns p95 and
  zeroes dims on a 2.30-datum short hull.
- Turret-parent audit: 3 stranded flags = towCable / spareTrackLinks /
  stern-rack rail — hull DECK gear under turret overhang (kf51 AABB
  false-flag class); adjudicated LEAVE on renders.

Audits (r14): track-clip 0/0 band + 0/0 shoe; winding m1 clean (0 rev,
0 mix, deficit 0.03%), m2 yaw-stranded clean (0 candidates); standard-
check clip 0/0, holes 0, decor mg1+8d. Self-shots (14 views + gear
zooms): shots/critic-type10/. DELIVERED-PENDING-CRITIC (§B8 — builder
self-reads never accept).

## OWNER SOURCE-EXACT REBUILD + NATIVE TRACKS (2026-08-10)

The owner's `type-10-main-battle-tank.zip` (SHA-256
`22bf48234c20edad51c9087dc4c02b99156c687af6a326533275eca9953d7468`)
contains the OBJ already preserved in the ignored Type 10 source packet,
byte-identical at SHA-256
`c95211bba65d883700671373816c182c749f1973b638c42d21a562f244d686c5`.
This supersedes the hand-estimated r1 shell. The pristine tracked GLB remains
unchanged at
`2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67`;
`tools/type10-source-bake.py` deterministically classifies its 2,450 authored
components and produces a semantic repair without cutting triangles.

The playable source payload is Hull 30,754 vertices / 20,125 triangles,
TrackGuards 15,030 / 10,488, Turret 31,174 / 21,492 and Gun 2,803 / 2,487.
All 1,064 donor-track components and 60 donor wheel/end-drum components are
excluded from rendering. Instead, the fleet-native running-gear system owns
five Type 10 road-wheel stations per side, separate front idlers and rear
sprockets, rollers, damage-aware linked shoes, chain and guide horns. Optional
`trackR` and radial shoe compression are normal `buildRunningGear` inputs;
their defaults are byte-identical for every existing vehicle.

Published horizontal datums are applied directly. P95 vertical law compresses
only geometry above the raw ring and two duplicate full-height whip courses;
one complete antenna and all mandatory roof hardware remain. Final dimensions
read body 2.646 m, hull 6.774 m, overall 9.478 m and width 3.169 m against
2.68 / 6.84 / 9.49 / 3.24 sovereign datums. The repaired semantic oracle is
SHA-256 `1d7fff3c390aef8898a05e2017e8abdd42f3b1a1df07ab86b7dd456a8c3bdfca`.

Final geometry gate is bit-identical x2: **94.6** |
94.6/95.1/96.6/99.9/96.7/100. Direct fidelity is **97.4** overall
(hull 97, turret/gun 100, running gear 91). Standard-check reports zero band
or shoe clips, zero contiguity holes and mg1+0d; turret-parent is 0/0/0.
Winding mode 1 is clean (0 reversed / 0 mixed, one-pixel deficit). Mode 2's
3,584-pixel `rig_hull/mesh#17` candidate is the source-exact engine-deck/stern
service course behind the ring: current-byte yaw proves it remains correctly
hull-owned while the complete turret, gun, bustle and roof kit rotate as one
seated assembly. Freeze **84f5d108** reproduces x2 (25 meshes / 184,760
vertices); `npm test` and `npm run build:private` are green.

Independent §B8 passes every current-byte view at floor **9.2**, mean
**9.48**. The standard vector is
`[9.6,9.5,9.2,9.3,9.6,9.3,9.2,9.4,9.8,9.4,9.4,9.8,9.4,9.8]`.
Yaw/load paths pass **9.7**: the complete turret equipment tree rotates and
remains seated, while the adjudicated engine-deck course stays continuously
attached to the hull. The sitting independently confirms five Type 10 road
wheels per side plus front idler/rear sprocket, one clean native linked-shoe
belt and no rendered donor track or donor wheel/end-drum set. Verdict:
the archived visual-review receipt.

## Native-only replacement and re-freeze (2026-08-12)

The source-baked `84f5d108` playable described above is retired. The active
runtime calls `buildType10Native2026`, whose hull, continuous welded shell,
gun, roof/bustle kit and exact five-wheel linked course are authored entirely
from repository primitives and fittings. The repaired GLB is retained only as
an isolated visual/measurement oracle; no source geometry or converted payload
enters runtime.

The final thin paired bow-shoulder bridges close two inboard one-cell plan
pockets while remaining above the idler/shoe arcs. Freeze **`7ac6d434`**
reproduces at 62 meshes / 56,562 vertices. Procedural fidelity is **91.41**
with a **90.02** minimum required view; whole 92.29 / hull 92.41 / gun 90.09.
The native running-gear-only component is 86.42, an expected source-donor
substitution difference rather than a whole-vehicle failure.

Exact band and shoe containment is 0/0 at both ends, plan contiguity is zero
holes, the bore probe passes, and winding is 0 reversed / 0 mixed. The 42
distinct frames in `/tmp/critic-type10-native-final-r10/type10` prove genuine
yaw and complete seated turret ownership. The legacy source-component gate
remains an honest incompatible zero rather than a fabricated pass. See
the archived visual-review receipt. **RE-FROZEN / KEEP
`7ac6d434`; source-baked `84f5d108` remains historical only.**

## §5.248 JAPAN-WAVE GROUND-UP REBUILD (2026-08-17, japan lane) — honest 0 -> **69.3 ×2 BIT-IDENTICAL** (hull 77.3 / stations 85.4 / whole 69.3 / dims 100 / floaters 100; row md5 31692002; hash 97267188, 62/59890)

First honest non-zero curve row for a first-party type10. Oracle restored
from 952561ea^ (md5 c3df50a6; .bak untouched); fresh vertex REG. SPEC
TRUE-UP: dims -> 6.84/9.49/3.24/2.68 (the 08-10 sovereign datums,
§5.73-1); armor pivots synced to the print ring [0,1.52,+0.21], bore 1.81.
buildType10Native2026 rewritten to the print: 1.535/1.62 decks, W-plan
bow, RAISED 0.34 BELLY (the print's visible belly line — its 0.001
corners are donor track sheet), print-station terminals (drive HIGH at
-2.86/1.05 in a carved sprocket-bay roof; trackR<=0.21 per the band-
solver landmine), print-ring wedge loft w/ 2.09 crown, continuous central
sight complex (pano head = the 2.68 P95 carrier), commander cluster LEFT
per the print, slat-sided rack to -2.98, §B3.1 boot/sleeve/evac/muzzle
collar/bore. Floater baseline was REAL (5.5 cm mast air-gap, visibility-
bisected). Receipts + five reverted experiments (raked whip p95, rail-
seated R mast, solid poles x2, 3.17 anchor strip):
shots/japan-wave/PACKET-type10.md. Battery: strict clip 0/0+0/0+0/0
(three-stage §B4 fix), parent 4-stranded = kf51 false-flag deck-gear
class (adjudicated LEAVE), winding clean, npm test exit 0. KEEP 97267188;
the 08-12 7ac6d434 "direct fidelity 91.41" board row was a different
instrument (never the curve gate).

## §5.299 REVERT — owner order: keep type10b, revert plain type10 (2026-08-17, lane C)

Owner order §5.299 lane C, verbatim: **"keep the type 10b and revert the
plain type 10 to the model before"**. Delivered uncommitted-unstaged.
- **type10b PINNED FIRST (the keep)**: the japan-wave base it builds on was
  frozen as a verbatim private copy `buildType10BBase` in
  src/vehicles/modern3.js (the buildType10Native2026 text exactly as it read
  at 9555f7fe), and profiles/japan.js buildType10B re-pointed at it — the
  ONLY consumer. Byte-identity receipt: hashgeo **77870ef0** (76 meshes /
  77,246 verts) before and after the pin, and again after the revert.
- **plain type10 REVERTED** to the pre-wave model: buildType10Native2026
  restored byte-exact from `9555f7fe^` (the 21-line japan-wave delta out:
  sprocket-bay roof split + raised louvre bank + fender/shadow trims + mast
  x-nudges). Spec row untouched — the wave never changed it (whole-file
  equality vs 9555f7fe^ proven after the splice, pin block aside).
- Reverted hash: **a1cecea6** (62 meshes / 59,602 verts). Before: 97267188
  (62/59,890).
- Honest gate row ×2 bit-identical at the reverted build (row md5
  018aa586a912690ae6546502e1e8b6f5): **min 68.7** (hull 77.3 / whole 68.7 /
  stations 85.4 / dims 100 / floaters 100) — vs the wave's 69.3; the old
  floater island does NOT reproduce (floaters 100 measured, truth over
  expectation). The type-10_main_battle_tank_repaired.glb oracle (restored
  §5.281) stays registered; rows are tool-written only.
- Guards unmoved: type90 43179448 / type74 ca287df4 / type89 3c89045d.
- §5.254 pairs (captured at their respective trees; before = clean worktree
  at 33260080 pre-lane state, after = the delivered tree):
  shots/type10-revert/{before,after}/{type10,type10b}/ — **type10 0/14
  byte-identical** (real change in every view), **type10b 14/14
  byte-identical** (the pixel hold proof of the keep, isu152 precedent).
  Capture determinism proven 28/28 across independent before runs.
- npm test exit 0. File scope: modern3.js (buildType10 region + pin block
  only) + profiles/japan.js (type10b import/call only); ariete/italy code in
  the shared file untouched.
The §5.248 JAPAN-WAVE section above stays as history; its KEEP 97267188 is
superseded by this order for plain type10 — that geometry lives on solely
as the type10b base pin.

## §5.336 OWNER ORDER — pair enlargement + fleet gear + quality round (2026-08-17)
Order verbatim: "make the type 10s larger make their tracks much better using
our better track system and make their hulls and turrets much mcuh beter."
Both marks upgraded through ONE shared base (the §5.299/§5.308 type10b
byte-pin is RETIRED BY OWNER AUTHORITY — buildType10BBase now delegates to
the rebuilt buildType10Native2026; the B identity delta lives in
profiles/japan.js addType10BPackage, re-seated at scale).

### 1. LARGER — owner-decreed ×1.10 (§5.304-class divergence)
- Scale judged against the owner-corrected type90 side-by-side in the live
  garage (diagnosis harness; receipts shots/type10-enlarge/scale-probe/:
  pair-s1/s106/s108/s11/s112.png + aabb.json). ×1.10 reads decisively
  larger with a balanced stance; ×1.12 added no garage presence beyond it.
  AFTER read at build scale: shots/type10-enlarge/after-garage/pair-s1.png.
- Every §5.248 print-decoded station carried at EXACT ×1.10. Spec dims
  re-derived exactly: 6.84/9.49/3.24/2.68 -> **7.524 / 10.439 / 3.564 /
  2.948** (type10b 7.513 / 10.439 / 3.564 / 2.838). EXACT values (not
  rounded) so the type90 spec-clone chain (userdrops5 make ->
  fitArmorToDims) refits to byte-invariant results — the owner-corrected
  type90 hit frame cannot move. Armor frame scaled in the SAME edit (§D
  coupling law); protection mm values kept (gameplay truth).
- The registered oracle (type-10_main_battle_tank_repaired.glb, md5
  c3df50a6) now reads ~9.1% SMALL against the build BY DECREE — adjudicated
  FALSE-class divergence, never chase the print back. Honest gate cost:
  68.7 -> **67.2 ×2 bit-identical** (hull 77.1 / whole 67.2 / stations 73.1
  / dims **100** / floaters 100). dimRows: height 0.15% / hull 0.45% /
  overall 0.07% / width 0.02%. The stations 85.4->73.1 + whole 68.7->67.2
  drops are the ordered divergence, documented here, no chase-back.
- ANATOMY-RECONCILE LAW (banked): combatAnatomy reconcileFrame maps
  armor.gunPivot/turretPivot into the calibrated frame
  (combatAnatomyCalibrations, auto-regenerated receipts) — the gun group
  seats at world z ~1.41, not the naive spec sum (rig-probe receipt
  gunLocal z 1.1771 + ring 0.2354). The exposed run (buildGun len 5.207,
  muzzleZ 5.24) carries the ×1.10 muzzle to world ~6.65 = overall 10.45
  measured vs 10.439 published (0.07%). First cut at len 5.027 measured
  overall 10.26 (-1.73%, dims 94.2) — receipt of the reconcile offset.

### 2. TRACKS — fleet §B6/§5.262 smart course (amx §5.318 / kf51b §5.324 grammar)
- Five big exposed rubber-tired wheels (r 0.385, xc 1.3337) + VISIBLE
  TORSION ARMS (arms:true) + FOUR return rollers (r 0.0935 @ y 0.8525) +
  RAISED drive sprocket (z -3.146, y 1.155, r 0.352/trackR 0.22) + RAISED
  idler (z 3.278, y 0.88, r 0.385/trackR 0.231) = the §B6 \________/
  trapezoid at the print's own wrap stations ×1.10.
- Fine-pitch integrated detailed shoes: linkPitchM 0.112, shoeRadialScale
  0.55 (the old flattened 0.20 course retired), padCornerFloor 0.0132,
  paintedEnds, coveredTop (skirted top run), pinCapOuter 0.252 (caps 2 mm
  proud of the 1.5837 pad face).
- §5.262 tones: gearFloor ambient hook + tireHex 0x24261f + wheelHex
  0x3f4837 + padHex 0x31322a / chainHex 0x292a24 — the exposed train never
  reads ambient-black behind skirt shade.
- Rotation-invariant end-drum face anatomy (leo1a5/§5.324 grammar): rim +
  inner tori + hub caps at the band face x 1.604-1.607, radially <=0.155
  inside the guide-horn sweep annulus (§B4).
- §B9: skirt hem 0.42 exposes ~49% of the 0.77 wheel discs (fleet 40-70
  band); five stations countable in every side frame
  (after/type10/paired/view-left.png).
- track-clip --exact --strict **0/0 band + 0/0 shoe + 0/0 sweep — BOTH ids,
  final bytes**. Three §B4 fixes receipted en route: (a) louvre bank
  re-seated high on the bay-roof flank (§5.308-B fix carried ×1.10; low
  seat measured 33 band/18 shoe vox), (b) sponson REAR STEP (underside
  1.32, z -2.45..-1.95) — the rising run crosses y 1.2265 at z -2.40 (16
  vox at the old full-depth edge), (c) skirt course moved inboard to 1.622
  after the failed rear-fender cap (82/44 vox receipt: no horizontal cap
  fits over the climbing run; the 3.0 cm band/skirt slit is the certified
  sub-scan class). §B4 VOXEL-MARGIN LAW banked: lateral gaps of 0.6-1.8 cm
  to the band/caps still voxel-count at --exact; ~3 cm is the clean margin
  (ledge receipts 1.4 cm -> 36 vox, 3.1 cm -> 0).
- Duplicate-course audit PASS ×2 (one suspension-driven layer each).

### 3. HULLS + TURRETS — leclerc-bar quality on the shared base
- Hull: measured §5.248 station geometry at ×1.10 (two-plane glacis,
  W-beak, undercut stern, sponson chain closed §B2) + §B2 closures: fender
  run extended to the skirt-panel end (6 cm slit read 5 cells/side) +
  inner fender ledge over the idler (the print's own |x| 0.81-1.13 fender
  lobes; 9-cell channel receipt) — standard-check holes **38 -> 0** both
  ids.
- §B3.2 density adds: second tow-cable run (left deck lane), welded
  brush-guard frames over both lamp clusters (amx §5.318 grammar), FOLDED
  side mirrors at the deck corners (the upright first cut floated in three
  views — float receipt in work1 frames; folded = JGSDF combat fit), horn
  pod on the beak shoulder, third driver periscope, pioneer shovel, engine
  deck frames + access seams, convoy plate, turret GPS dome, rack corner
  gussets + rear-face X-braces + rolled tarp, turret lifting eyes, wall
  rail support posts (§B2 no-air), sight window brow hoods + wiper stub,
  pano slew ring, cupola hatch lid + hinge lugs + grab bars, flank-sight
  window glass, module lid seams.
- §B3.1 gun run: armored mantlet housing + raked cradle side cheeks + top
  cover w/ lift lugs + canvas boot (cone-seated clamp rings ×2) + coax
  port w/ armored fairing + muzzle reference collar + recessed bore
  (muzzle-bore probe PASS, contrast 40.7). No prism reads on the run.
- §B5: 0 dangling / 0 abutting / 5 stranded = the certified kf51-AABB
  false-flag deck-gear class (towCable ×2 + driver periscope glass — the
  §5.248 packet's own adjudicated LEAVE class, +1 for the added second
  cable); yaw90 receipts show them static and correct
  (after/type10/yaw90/). Winding audit m1 0 rev/0 mix + m2 clean, both ids.
- Evidence: shots/type10-enlarge/{before,after}/ — before pairs at the
  pre-edit tree (14 type10 ref-pairs + 14 type10b proc-only), after final
  = 14 paired + 14 yaw0 + 14 yaw90 per id. Assets: 18 files regenerated
  (tank:assets); tank-assets-check PASS (9 views, bores verified);
  release-check components all PASS except gate>=90 (by-decree divergence
  row) and the type10b no-gate-json (FALSE-0 class, next section).
  npm test && production build exit 0.

### Hashes, guards, live-tree events (receipts)
- type10 d4b5d788 (62/59,602, session start) -> **b2f9a0ee** (64/80,854).
- type10b f8f00058 (76/77,246) -> **ca20604** (79/98,612).
- Guards at close (held EXACT across every batch since the §5.352-era
  re-baseline): type90 **518e88f0** / type74 **818321a5** / type89
  **b9b1b264** / type90a **71208238**. Baseline drift earlier in the
  session (d4a9410->...->518e88f0 etc., verts invariant) is attributed to
  the foreign landing stream (§5.341-§5.352 + owner live session), not
  this lane; helper A/B proof: type90a + stb1 hash BYTE-IDENTICAL with
  HEAD's profiles/japan.js vs this lane's (71208238 / f3ee84d8 both ways —
  the s=1-default shared-helper law §F.2 held).
- Ariete fence: modern3.js ariete spec regions untouched (verbatim);
  ariete_c1/c2 hash movement during the session = the live §5.322 lane's
  own italy.js WIP.
- LIVE-TREE EVENT (snapshot law receipt): mid-session, modern3.js was
  externally swept to a HEAD-class state carrying the owner bradley WIP
  (§5.349) — this lane's section re-spliced from the scratchpad snapshot
  (wip-snap-2), zero loss. The sweep's kit.js orientedSlab import collided
  with the file's local duplicate — de-duped to the import (bodies
  byte-identical, diff receipt). One transient npm-test failure (tiger1
  transmission volume) was a torn read during the owner session's live
  write — clean re-run exit 0.

## §5.364 packet — pivot re-auth + owner see-through/black-line/track/fill orders (2026-08-17)

### Item 1 — rig/sim pivot re-auth (§5.362 finding, §5.361 rig-anchor law)
- ROOT: the §5.336 rig was authored THROUGH the old finalizeCombatAnatomy
  pivot remap; §5.361 (pivots never ride the calibration map) re-seated
  rig_gun +0.242 m forward / −0.132 low vs certification (overall read
  10.686 vs the decreed 10.439 row).
- FIX (values = the EXACT retired-remap outputs, derived by running the
  pre-§5.361 finalizer on the raw specs in a pinned worktree; the
  old-module cross-check matched to the last double):
  - turretPivot `[0, 1.8027777777777776, 0.2713333333333332]` (both ids;
    sim frame + turret-local equipment datum — the VISUAL turret seat is
    builder-pinned at [0, 1.672, 0.2354], modern3.js P.turretG line).
  - gunPivot type10 `[0.01100000000000012, 0.4511015831134565,
    1.1771211453744495]` (the +11 mm x = the certified asymmetric turret
    envelope map, −1.573..+1.595); type10b `[0, 0.4511015831134565,
    1.1771211453744495]`.
  - SITE: japan.ts post-clone re-seat block (NOT the modern3 armor row —
    userdrops5's type90 clones that armor through fitArmorToDims, which
    scales pivots; a donor-row edit would have silently moved the
    byte-held type90 hit frame; japan.ts evaluates after userdrops5 in
    tankFactory's registration order). modern3 row carries the
    clone-frame law comment.
- PROOF: with item 1 alone the builds returned to the CERTIFIED BYTES —
  hashgeo type10 **b2f9a0ee** / type10b **ca20604** exact (worktree
  rigseat probe: rig_gun world [0.011, 2.1231, 1.4125] = certification).

### Items 2-5 — §5.364 owner orders (verbatim: "type 10s are see through
### and have a big black line on each side of hull. fix all of these, fix
### the hulls, make the tracks beefier and have the same decorations as
### other tracks, and fill up the insides of the tanks")
- BLACK LINE ATTRIBUTED (receipt shots/type10-fix/before-type10/
  attrib.json): flank raycast rows y 1.393..1.486 read 66/72 rays
  `hullShadow #0b0c0a` — the 11.5 cm × 5.94 m pure-black "fender-line
  relief" AO fake. RETIRED → 3.3 cm gunmetal fender support rail +
  skirt-top junction seam retoned hullShadow→hullDark (§5.262: never
  ambient-black). Flank shadow-rows after: **0**.
- SEE-THROUGH (receipt before/sweep.json: cross-hull daylight y 1.20 =
  60/103 rays clean through): the old 0.616-tall near-black bay liner
  topped at 1.10 under the 1.2265 sponson floor. FILLS (all real geometry,
  suspension gunmetal, inboard of the 1.0757 band inner face): inner bay
  walls raised to the sponson floor (0.484..1.30) + rear bay wall
  (0.62..1.56, front edge −2.44 meets the rear step) + bow bay wall +
  per-station hydropneumatic strut heads/mounts; sponson-front side
  closures (1.30..1.6583, z 1.606..2.233); driver/bow bulkhead
  (±1.05 × 0.682..1.43 at the glacis knee); JGSDF fender toolboxes +
  straps closing the fender-gully cells. Skirt tops rise 1.175→1.2265 to
  the sponson underside; raked front panels top out at the 1.301 fender
  underside (§B9 hem 0.42 and wheel exposure UNTOUCHED). AFTER: zero
  interior see-through rows — every remaining open cell is stern-overhang
  (z<−3.4) or beak-taper air (z>3.15), designed-openness class.
- TRACKS BEEFIER (§5.364): band 0.055→0.072, shoe relief 0.55→0.85 of the
  fleet shoe (full default connector-rail/guide-horn/pin-cap anatomy at
  honest height), pitch 0.112→0.138, botY +9 mm (ground clearance held).
  Lateral stations (trackW/xc/pinCapOuter) §B4-certified — untouched.
  track-clip strict: **0 front / 0 rear / 0 shoe / 0 sweep** both ids
  (the first full-width bulkhead cut read 18 sweep voxels in the top-run
  lane — clamped to ±1.05 same run).
- HULLS: judged at the §5.254 pairs (shots/type10-fix/cert-* vs
  pairfinal-*): flank now continuous camo with real paneling, structured
  bays, chunkier articulated track — silhouette/proportions unchanged.

### Receipts and rows
- AABB (probe, identical filter both states): overall 10.4512 / width
  3.5640 / z-max 6.6632 — BYTE-EQUAL before→after items 2-5, and equal to
  the certified-bytes worktree measurement (the sitting instrument read
  the same state 10.4440; the +0.242 regression is dead).
- geometry-gate type10 ×2 (final state, deterministic): **66.9 / 66.9**
  (hull 79.1 = +2.0 vs the 67.2 row, dims **100**, floaters 100; whole
  66.9 = −0.3, stations 71.5 = −1.6). The −0.3 is the honest cost of the
  owner's own §5.364 seal orders measured against the §5.304-decreed
  FALSE print (~9.1% small by decree) — §5.355 precedent (68.7→67.2 for
  the ×1.10 order itself). dims (spec truth) untouched at 100.
  type10b: FALSE-0 class unchanged (no reference row).
- HASHES (final, live == pinned-worktree clean-room): type10 **6e25b62e**
  (66/86,338), type10b **5e6f7700** (81/104,096).
- GUARDS: clean-room A/B at HEAD 7b85fe43 — type90 **518e88f0** /
  type90a **71208238** byte-held at HEAD-pure AND at HEAD+this-lane's
  files (the live tree's type90 drift = the §5.364 type90-guns lane's own
  WIP in profiles/misc.js, attributed).
- combatAnatomyCalibrations regenerated (116 rows; the pair's hull/track
  receipts moved with the geometry). NOTE: the shared live tree carried
  co-resident lanes' WIP (leo2a4m/leo2a6m/kf51b/bmp3_rok/upior_ifv/
  marder1a3/bmpt_t90/type90/type90a) — their rows reflect their in-flight
  geometry and re-regenerate at their landings.
- npm test EXIT 0 + production build EXIT 0. Delivered UNCOMMITTED.
