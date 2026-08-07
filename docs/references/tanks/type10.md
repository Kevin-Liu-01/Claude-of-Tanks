# Type 10 (`type10`) — oracle packet

Spec home: src/vehicles/modern3.js (dims 6.79 / 9.49 / 3.24 / 2.30).
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
