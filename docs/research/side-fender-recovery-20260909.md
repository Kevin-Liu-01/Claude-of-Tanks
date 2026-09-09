# Side/fender work recovery — 2026-09-09

Preservation checkpoint, not a new fleet-quality certification. The owner
explicitly requested recovery/publication of this task's side/fender work and
the separate Abrams work after the unfinished candidates were disclosed.
Abrams recovery and final publication belong to the parent integration.

## Recovered here

Base: `47e86743d098b868513aa841a9e9c00675ad49fd`. Owned worktree:
`cot-side-fender-preservation-20260909`, branch
`codex/side-fender-preservation-20260909`.

| IDs | Original checkpoint | Recovered checkpoint | Exact change |
|---|---|---|---|
| `t90m_x`, `t90a_vladimir_x` | `916902f3e`, `6aa3bb6bf` | `91987740f`, `cf80be36d` | Existing mantlet boot stock uses neutral canvas; retain the original gun rig and distant visibility. Source probes address the separated cloth mesh. |
| `leo2a7v_x`, `leo2a6m_x`, `leo2a4m_x`, `leo2_revolution` | `f6689bde9` | `22409bce7` | Existing smoke-launcher caps share the original tube frame; no new launcher, wheel or bodywork design. Kept separate from side/fender publication decisions. |

`381a9fec8` preserves the earlier native canvas/smoke evidence note from
`b95e3d8dc`. Earlier native screenshots are historical evidence, not renders
of this recovered composition. The smoke conflict was solely adjacent imports:
both the published return-roller import and recovered smoke helper remain.

Shared edits are only the opt-in `gunMountCanvasSkin` bucket, its LOD0 keep
entry, and two focused-test registrations. The old `gunMount` and new canvas
bucket both retain `nonArmor` semantics. No primary armor, registry/spec,
road-wheel/track recipe, source binary, or generated asset is changed here.
The final integration must refresh the six affected IDs' maintained assets.

## Already preserved, not missing

Read-only `git cherry -v origin/main 1338e180c` against observed main
`5b322420483210485dc802bf3f40af0f250ca59e` marks all the following original
checkpoints patch-equivalent to published history:

- `474e17779`: `t90a_burlak_x` fixed side-panel camouflage.
- `827e90c42`: `amx40_x`, `leclerc_x`, `leo2a5_x`, `leo2a6_x` fixed metal
  bodywork paint; supporting `e2f5b90f7` history checks remain present.
- `3800a2e10`: `merkava3d_x`, `merkava4_x` connected upper shoulder returns.
- `128edaa01`, `988ff3518`: Mk3D front return and separated receiving planes.
- `aad42aba1`, `0efadc68a`: Mk4 end returns and composed seam regression.
- `c1b44ee5c`, `bd06e485e`, `183548a33`: associated anatomy/native checkpoint,
  scoped assets, and corrected Merkava presentation anchors.

These are the seven-tank bodywork changes already carried by the published
nine-ID union. They must not be reimported from stale snapshots.

The inspected fleet final-integration, qualified, fixed-stock-paint, verified,
all-tank-scope, fourteen-style/canvas, Merkava shoulder/front/end, paint-history,
and smoke-frame worktrees have no uncommitted tank-runtime hunks. The qualified
tree retains older dirty icons/geometry reports, final integration has an old
ledger delta, and all-tank-scope has cadence-tooling changes. None establishes
an unpublished side/fender runtime change. This bounded check does not claim
to inventory every unrelated worktree; the separate recovery audit covers
other refs, stashes and reflogs.

The independent broader recovery audit subsequently reported no additional
confirmed current-task side/fender runtime delta. Older source-groundup,
T-44/BWP/T-90 prototypes remain unresolved historical work, not automatically
in scope. Large dirty source snapshots mostly match current or historical main.

## Intentionally not imported

- `875525048` wheel tessellation and its cupola-history follow-up.
- `d7f97f67f` and subsequent roller/track experiments.
- `1338e180c` mixed fourteen-ID assets/anatomy: these include the excluded
  wheel and roller candidates and would regress newer published receipts.
- Older superseded Merkava/paint outputs, broad performance tooling, source
  GLBs, and ignored QA files.

Known source/style failures remain recorded in their original checkpoint
notes. Neither the owner's as-is publication request nor this faithful
recovery relabels them PASS or changes a threshold.

## Current verification

Focused canvas, T90 source-geometry, smoke-frame, and TypeScript checks passed
with separate ordinary FIFO leases; the driver exited 0. Runtime input was
`381a9fec8` throughout; only this inventory note was edited during the checks.

- Canvas: 16 actual HIGH/LOW, factory/winter, old/current builds; unchanged
  posed stock and rejecting hull-paint replacement controls.
- T90 geometry: all four existing source-measured solids, bore endpoints,
  wheel stations and articulation checks passed with unchanged tolerances.
- Smoke: 16 builds, 128 launcher-quality records, 512 posed pairs;
  128 old offsets and 16 deliberate mutations rejected. Maximum new axial
  error `4.3906108277855603e-8` m, with finite 6 mm cap overlap.
- `npm run typecheck`: native TypeScript and core-unused checks passed.
- `git diff --check`: passed.

Ignored log: `.qa-dev/side-fender-preservation-focused.log`, SHA-256
`bffa4af9642e8706143c8ebb9bda3e5a771660661fe88e1913382d7b588a7617`.
No full suite, build, anatomy, browser capture or release job is duplicated
here; parent owns final composition and those publication checks. These CPU
results are not new native screenshot or source-fidelity claims.

## Latest-main preservation integration

Integrated after the published MBT-70 checkpoint `1f412d2d2` in
`cot-tank-recovery-publication-20260909`. The same three focused tests and
typecheck passed again. Maintained generation refreshed exactly six IDs / 60
files; 44 files changed on disk, including the manifest. An independent row
comparison confirmed that only the six scoped tank records changed.

`tank-assets-check --ids=t90m_x,t90a_vladimir_x,leo2a7v_x,leo2a6m_x,leo2a4m_x,leo2_revolution`
passed all nine views, file/metadata freshness, geometry and muzzle bores.
The driver ended `RECOVERED SIDE FINISH INTEGRATION: PASS` in
`.qa-dev/recovered-side-finish-integration.log`. This is the bounded as-is
preservation check, not a complete fleet/anatomy/source-fidelity release.
Final composed anatomy and targeted-release attempts remain with the seven-
Abrams integration; the separate frozen MBT full lifecycle is still running.
