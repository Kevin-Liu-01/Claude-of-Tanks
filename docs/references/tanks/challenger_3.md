# Challenger 3 (`challenger_3` candidate) — report-only oracle packet

NEW-VEHICLE CANDIDATE (no TANK_SPECS row, no build, no tech-tree slot).
**License gate: CC-BY-NC-4.0** — local measurement/influence ONLY,
never ships as an asset, and NC quarantine rules apply to any icons or
derivative renders if a build ever lands (strip-nc precedent).

## Asset (2026-08-06 base-21 wave)
"Challenger 3" by 42manako (verified catalog author), 6.9 MB —
`community/challenger_3.glb`. ORIGINAL authored FBX with a full
semantic hierarchy: `hull` (skirts, bowobjects, guard, frontlights,
toolbox, fireexting, fueltank2, back-lens, wheels x16, track/track2) +
`turret` (smoke a-j pods, `trophy` = Trophy APS panels both cheeks,
RCWS `stand`/`mount2`/`weapon2` cluster reusing their Boxer 30 mm RWS
kit, `turret_interior`, antennas x3, periscopes, `sensorfront`/
`sensorback`, hatches, and the main gun under `mount` -> `weapon`
(+`weapon3` coax)). 21,148 verts / 15,355 tris — low-poly-clean, ideal
grammar reference.

## Extract (docs/references/vertex/challenger_3.json — vertex REG entry `challenger_3`, NOT in any harness map)
Registration: turretNode `^turret$`, gunNode `^weapon$`, autoPivot,
yawOffset -PI/2 (raw nose +x, the leclerc convention — first run
confirmed z-box was the width). ANCHOR CAVEAT: scaled against the
CR2 spec dims (8.33 / 11.50 / 3.52 / 2.49) because no CR3 spec exists;
percentages below are vs that anchor, the raw proportions are the
deliverable.
- width 3.519 (0% — the anchor axis), hull mask 7.964 (-4.4%), overall
  10.335 (-10.1%: the print's L55A1 run is short vs the CR2 11.50
  anchor), body height 2.982 (+19.8% vs 2.49 — the print reads tall:
  RCWS + sensor masts carry the p95, plus a proud turret).
- Proportion set (anchor-free): body h / hull-mask len = 0.374; width /
  hull-mask len = 0.442; overall / hull-mask = 1.298.
- Orientation assert: AGREES after the yaw fix (glacis +z, gun +z).

## If the owner greenlights the build
Spec row first (66 t, 1,500 hp CV12 upgrade path, 120 mm L55A1 smoothbore
— NEW ammo family vs CR2's rifled L30, Trophy APS, EPSOM/Thales sights);
profile home = modern1 next to challenger2 or the future uk.js family
file; the build is PHOTO-CLASS with this print as NC-quarantined
influence + measurement oracle (it may instrument a LOCAL gate the same
way recovered NC prints do — registration would go into the three
harness maps at that point, not before).
