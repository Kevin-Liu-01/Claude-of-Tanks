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

No additional per-frame work or draw calls; each HIGH/LOW model gains 192
triangles. Native before/after position-buffer hashes confirm unchanged hull,
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

Required generated records and final verification results are recorded below
when completed. Historical comparison receipts are not substituted for a
current measurement, and no geometry gate is weakened for this change.
