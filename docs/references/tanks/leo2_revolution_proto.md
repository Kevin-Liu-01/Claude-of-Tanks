# Leopard 2 Revolution Proto — ancestor turret, 2026-09-23

## Current target and scope

The owner requested a complete turret redesign that looks like an ancestor of
**the current first-party Leopard 2 Revolution**. This is an intentional game
prototype design, not a claim about a documented historical vehicle. The target
is the current procedural `leo2_revolution` at base commit
`f5a7bf3ae938cab9d24f3836a98003e5b236e3c4`, especially its compact welded body,
angular modular cheeks, recessed right optical well and horizontal bustle.

This explicit redesign supersedes the earlier instruction to preserve the old
Revolution turret byte-for-byte under the Proto name. It does **not** rewrite the
immutable historical comparison, qualify against it, or authorize a new source
waiver. The historical preservation receipt remains separate in
[the source record](../../research/leopard-revolution-source.md).

Owned ID: `leo2_revolution_proto`. The current Revolution and Leopard 2A7V are
unchanged geometry controls. This work started directly from `origin/main`;
the publication integration also includes the separately verified KF51-U repair.

## Construction

- Retain the authored prototype chassis and running gear; replace the complete
  old layered turret, its forward shelf, stepped fillers and attached roof kit.
- A closed welded core carries shorter modular cheek solids and two side armor
  panels per side. The resulting structural envelope is 3.12 m wide and 3.76 m
  long, distinct from the production Revolution's larger installation.
- Keep an actual right-side optical recess, closed rear wall and low shelf.
  A separate inner pier carries the gun trunnion without blocking the optic.
- Gun-owned tapered mantlet and transverse bearing clear the fixed cheek walls.
  Turret pivot `[0, 1.60, 0.45]`, gun pivot `[0, 0.25, 1.45]`, barrel length
  3.955 m and barrel radius 0.078 m share a boot-light frame definition with the
  firing model. This corrects the stale donor firing frame while retaining the
  original visible gun station and the existing ammunition/balance.
- Two low roof hatches, a small panoramic optic, manual machine gun, two radio
  whips, eight smoke tubes and short supported bustle bins make this the earlier
  member of the family. Generic roof cargo and duplicate weapons are removed;
  the decoration policy retains only the same restrained fender tools used by
  the production Revolution.
- Rear rack legs reach the descending bustle armor. A ray-based regression
  failed on the initial floating aft legs and passes with the corrected legs,
  checking physical contact with both the actual roof and the upper rail.
- All geometry is first-party procedural and merged into existing owner/material
  buckets. No new per-frame work or source-model runtime path is introduced.

## Cost and regression evidence

Stored authored triangle census (same seed 4242 and quality, no decoration layer):

| Quality | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| HIGH | 40,942 | 32,160 | 8,782 / 21.5% |
| LOW | 35,894 | 27,196 | 8,698 / 24.2% |

All current Revolution and Leopard 2A7V position-buffer hashes and rig transforms
are unchanged in both qualities. Named hull and running-gear buckets are
unchanged; turret, gun, fittings, derived shadow proxies and their combined LOW
batch change. This census is geometry cost, not a browser-latency measurement.

`leopardRevolutionTurretCenter.selftest.mjs` loads generated backing and tests
HIGH/LOW, the closed concentric bearing, actual optical/elevation air corridors,
all four yaw quadrants, both legal pitch stops, muzzle/firing-frame agreement and
full-elevation recoil clearance. The declaration/decoration regressions also
check independent registry data, no duplicate roof clutter and staged/synchronous
construction consistency (3,217 lifecycle assertions).

Native before/after views, receipts and raw command logs are retained under
`.qa-dev/revolution-proto/` in the owned worktree. Browser captures include the
production Revolution beside the prototype. These are local review artifacts.

## Validation and publication status

- PASS: focused articulation/recoil, registry, equipment and decoration-staging
  tests; type checking; new profile complexity gate.
- PASS: native Gallery front, rear, both sides, top, quarter and articulated
  captures; no browser errors.
- PASS: complete `tank:anatomy:update` and `tank:anatomy:check` after the final
  rack fix. All 202 receipts and 606 technical assets are current; the module
  probe reports zero failures and zero outside-envelope modules. Its 93 fleet
  dimension warnings remain warnings, not a claim of source qualification.
- PASS: 33-view sealed-body gate; presentation centering (0.00 px live residual,
  0.09 px exported top residual); calibrated module/visual alignment; all ten
  target asset files, muzzle bore and circular centered barrel checks.
- PASS: public production build, including its localization validation.
- PASS: actual Garage carousel entry, Revolution switch, prototype cache return,
  level / +20 degree / -9 degree pitch, side elevation and rear depression.
  The mantlet remains under `rig_gun`, with no browser errors. Served version:
  `v1.0.0+gf5a7bf3ae.dirty`; final captures are in
  `.qa-dev/revolution-proto/garage-final/`.
- BLOCKED: composed `tank:release:check -- --ids=leo2_revolution_proto --gate`
  exits 1. Standard geometry and fidelity cannot load the registered historical
  `/models/community-candidates/leo2_revolution_proto_preservation.glb`.
  The sealed stage passes. The old 99-point preservation contract also targets
  the explicitly replaced turret, so supplying that file alone would not
  establish acceptance of this new concept. No source score is claimed.
- NOT RUN: the composed release's later full test-suite/private-build stage,
  and track/continuity checks downstream of its unavailable comparison. The
  focused tests and separately successful public build are not a full-suite pass.
- Historical preservation/source qualification is **not claimed** for this
  intentionally different design. Gate thresholds and oracle bytes are untouched;
  the generated ledger records the failed availability check instead of retaining
  the obsolete successful preservation receipt as the current result.
- Generated anatomy, fill, marking seats, presentation and asset metadata changes
  are confined to `leo2_revolution_proto`. No other vehicle record changes.
- Original saved revision: `2e2f2f2ee` on
  `codex/revolution-proto-turret-20260923`, based on
  `f5a7bf3ae938cab9d24f3836a98003e5b236e3c4`. The KF51-U cutout work is saved
  through `082491ec8` on `codex/kf51u-gun-seat-20260923`.

## Publication integration (2026-09-23)

After the missing-reference release failure and local-only status were disclosed,
the owner requested: "commit and push origin all our recent changes". This
authorizes publishing this redesign and the KF51-U repairs to main with those
known qualification limits; it is not a source qualification or a changed gate.
The isolated integration branch is `codex/turret-publish-20260923`, starting at
the same `f5a7bf3ae` main revision. Both builder imports are retained and the
shared anatomy records are regenerated from the combined source. No unrelated
shared-checkout work is included.

The publication procedure still runs fresh anatomy, targeted release, typecheck,
the core receipt suite and shared-main preflight on the integrated commit. Its
raw logs and remote verification belong in `.qa-dev/turret-publish/` in the
integration worktree. The missing historical oracle and retired preservation
target remain unresolved; an authorized push does not change that status.
This request does not deploy the game.

Original branch command logs are in `.qa-dev/revolution-proto/checks/`; its final
full-generation log is `.qa-dev/revolution-proto/final-run.log`.
