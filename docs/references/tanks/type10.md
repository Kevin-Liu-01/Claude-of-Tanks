# Type 10 (`type10`) — first-party authored record

## Active ownership status

The active playable is **entirely repository-authored procedural geometry**.
`buildType10Native2026` constructs the hull, folded bow, five-wheel native
running gear, linked shoes, welded turret, modular cheek armor, gun, roof
stations and bustle/service kit from shared primitives and fittings. No GLB,
OBJ, copied vertices, source material, texture, rig, animation or converted
payload is loaded by the runtime Type 10 route.

The external-model material recorded below is historical comparison and audit
history only. It is not an active builder, fallback, candidate, wrapper or
shipping dependency. Its presence in this document must never be interpreted
as ownership of the playable model.

Spec home: src/vehicles/modern3.js (P95 datums 6.84 / 9.49 / 3.24 / 2.68).
Build: `buildType10Native2026` (modern3). Family guidance (owner 2026-08-06):
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
`docs/critique/shaded-parity-type10-source-graduation.md`.

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
`docs/critique/native-type10-first-party-recert.md`. **RE-FROZEN / KEEP
`7ac6d434`; source-baked `84f5d108` remains historical only.**

## Modular turret and explicit running-gear re-cert (2026-08-13)

Fresh live evidence found that the authored shell still read too smoothly
through the mantlet-to-flank transition and that the M2 disappeared against a
low outboard wall mount. Three shallow overlapping cheek carriers per side now
follow and bury into the welded pear-plan core, with visible replacement seams
and no source-envelope growth. The panoramic head is broader on a buried
pedestal, the M2 is cupola-owned on a broad rotating cradle, and four additional
low roof fittings restore the asymmetric mechanical cadence.

The running-gear order is now an executable build invariant and recorded on
the hull: **front idler -> five road-wheel pairs -> three supported return
roller pairs -> rear final-drive sprocket**. The geometry remains a single
repository-native linked course. Freeze **`84dacef8`** reproduces at 62 meshes
/ 60,150 vertices. Procedural fidelity is **91.56** overall with minimum whole
view **90.15**; whole/hull/gun are 92.52/92.53/90.09.

Exact terminal bands, instanced shoes and strict moving sweep are **0/0/0**.
Parent audit is **0 stranded / 0 abutting / 0 dangling**. Winding is 0 reversed
/ 0 mixed with only a visually null 7-pixel antialias deficit and zero yaw
candidates. Runtime articulation passes 10/10 and the muzzle bore passes at
134.3 contrast. The immutable procedural-only packet contains 15 appraisal,
15 yaw0 and 15 yaw90 frames: **45 PNGs / 45 distinct hashes**.

**PASS / KEEP `84dacef8`; supersede `434c7928`. The active Type 10 remains
wholly first-party.**
