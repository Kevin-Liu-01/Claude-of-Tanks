# M1A1 turret rings — 23 September 2026

Owner target: raise the M1A1 tank turrets by **50 mm** so that their turret
rings are visible. This follows the separately completed M1A3 ring/mantlet
work. Publication to `origin/main` is authorized; deployment is separate.

Starting main: `64303600d9b2f77bb4f7d9e8b604815954bed483`.
Implementation worktree: `codex/abrams-upgrades-20260922`; the shared dirty
checkout is not used for editing or staging.

## Scope and construction

| Current name | Stable ID |
| --- | --- |
| M1A1 Abrams | `m1a1` |
| M1A1 Abrams HA | `m1a1ha` |
| M1A1 Abrams HC | `m1a2` |
| M1A1 Abrams SA | `m1a2_tusk` |
| M1A1 Abrams AIM | `m1a2_sepv2` |
| M1A1 Abrams FEP | `m1a2_sepv3` |
| M1A1 SA (Ukraine) | `ua_m1a1` |

All seven share the current M1A1 procedural family builder. Each complete
`rig_turret` moves from Y 1.582 m to 1.632 m, preserving X/Z and the gun's
local anchor. Mantlet, cannon, roof fittings, armor and stowage keep their
owning turret/gun parents. The shared 12 mm Abrams correction is unchanged.

The previous shell floor extended into the hull deck. Its buried lower edge
is relieved from local Y -0.195 m to -0.102 m, exposing a 50 mm side seam
above the flat 1.480 m deck. A 48-sided, 1.25 m radius bearing reaches from
world Y 1.450 m to 1.533 m: its lower lip overlaps the sloping front deck,
and its upper lip overlaps the shell by 3 mm. It is merged into the existing
camouflage-aware structural bucket in both detail levels. Camouflage netting
on FEP/Ukraine intentionally covers sections of the seam.

No additional per-frame work or draw calls; the bearing contributes 192
triangles at each detail level, with regenerated interior-fill counts accounted
for separately. Native before/after position-buffer hashes confirm unchanged hull,
track and wheel geometry, and unchanged gun-local anchors. M1A3, AbramsX,
modern M1A2 (`m1a2_x`), legacy M1A2 and MBT-70 controls are unchanged at both
quality levels. The dormant `m1a1_aim` profile is not the roster's current AIM.

## Evidence

Local evidence: `.qa-dev/abrams-upgrades/m1a1-rings/`.

- `before.json`, `after.json`: per-ID/quality geometry census and controls.
- `lift-test.log`: exact lift, 48 radial bearing samples, structural side
  visibility, deck/shell seating and yaw/elevation checks for all seven in
  HIGH/LOW. Cloth is excluded from the structural occlusion check; it remains
  present in the rendered models.
- `focused.log`: Abrams roof/fitting, M1A3/SEPv3/AbramsX, running-gear, complete
  fleet gun-articulation and recoil regressions.
- `gallery/`: all seven vehicles at rest, side-on, and at 90-degree yaw with
  the gun elevated. No browser errors.
- `garage/`: real carousel selection, cached return and aimed poses.
- `typecheck.log`: strict type and unused-code checks.

Generated records and verification results are recorded below.
Historical comparison receipts are not substituted for a
current measurement, and no geometry gate is weakened for this change.

## Release limitations and baseline verification

The composed release gate was executed for all seven (`release.log`) and
remains **FAIL**. Their retired GLB comparisons are unavailable; no numeric
source-fidelity pass is claimed. All seven pass strict track containment
(0/0 band/shoe intersections), equipment census and the sealed-body ledger.
Six have zero top-down continuity cells. Ukraine has two isolated cells at
approximately (-1.91, -2.30) and (1.88, -2.42), in the unchanged rear hull area.

A separate detached worktree at the exact starting main reproduced **the same
two cells and zero track intersections**, recorded in
`baseline-ukraine-standard.log`. That temporary worktree was then removed.
The ring change neither creates nor repairs those inherited openings.
No thresholds, comparison registrations or certified receipts were changed.

The full anatomy update regenerated 202 receipts and all 229 vehicles' 687
technical images; only selected M1A1 output rows changed. Selected centering
and all 70 selected assets were subsequently refreshed. A generated-scope
comparison confirmed that anatomy, marking seats, presentation anchors and
the asset manifest alter only the seven intended IDs.

## Full-suite corrections

The first complete pre-test phase ran all 406 files: 404 passed and two caught
follow-ups. The relieved underside changes the cheek normal, so the SA/TUSK
right M250 bracket and its complete tube/bore assembly are reseated 12 mm
outward to retain the existing launcher-clearance requirement. That original
clearance assertion is unchanged and passes. The HC's expected turret-shadow
checksum is updated for the requested bearing/lower-edge geometry; its hull
and gun shadow checksums, three-draw limit, triangle budgets and caster
ownership checks remain unchanged. Both formerly failing tests and the full
HIGH/LOW family lift test pass in `corrected-regressions.log`.

Anatomy, marking seats, technical diagrams and SA/TUSK appearance assets were
regenerated again after the launcher correction (`anatomy-update-final.log`).

The broader core/post phases also caught old exact-output fixtures for HC
intact/damage/reset content, M1A1 wreck baking, and M1A1 synchronous/staged
construction. These expected values now include the authorized lift, bearing,
relieved underside and regenerated fills. All original assertions remain:
exact materials/order/geometry, damage reset, staged/synchronous equality,
mutation negatives, disposal, lifetime and unaffected vehicle controls. Fresh
strict runs pass in `equipment-corrected.log`, `wrecks-corrected.log`, and
`staging-corrected.log`. The staging fingerprint collection log is only a
capture of expected values; the separate strict run is the validation.

`balanceMatchups.selftest.mjs` fails the `nextgen-abrams-peer` scenario with
score 0 outside its 0.2–0.8 band. A second temporary detached checkout at the
starting main reproduces the identical failure (`balance-baseline.log`).
Its statistics/scenario and assertions are unchanged by this M1A1 task.

Final full anatomy validation (`anatomy-check-final.log`) passes: 202 current
anatomy/marking receipts, 606 technical assets, 1,745 modules and 404 track sides;
zero failures/outside-envelope modules and the same 93 dimension warnings.
Selected centering, alignment, 70 assets, duplicate-track, muzzle and barrel
checks pass in `remaining-checks.log`. The production build there passes too;
final commit verification is recorded separately in `final-head.log`.

All phases completed: 406 pre, 685 core and 42 post test files. Their first
passes reported 2, 3 and 2 failures respectively; the change-dependent
geometry/clearance fixtures above were then corrected and strictly rerun.
The other post failure was acquisition invalidation: the articulated-shadow
browser check overlapped the follow-up commit and correctly rejected the
changed Git revision, despite its rendering checks passing. It is rerun
against the stable final commit, without changing its assertions, in
`final-shadow.log`. This does not describe the aggregate `npm test` command
as green; the baseline balance failure remains open.
