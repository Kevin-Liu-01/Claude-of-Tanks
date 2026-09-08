---
name: src-dev-skill
description: Maintain opt-in diagnostics, bounded traces, deterministic shot controls, and capture readiness gates.
---

# claude-of-tanks / src/dev

## Purpose
<!-- agent-docs:fill:purpose -->
Provide reproducible engineering evidence without adding diagnostics cost to
ordinary player boot or contaminating the behavior being measured.

## Mental model & key files
<!-- agent-docs:fill:model -->
`debugIntent.ts` selects explicit QA intent; `mainDiagnosticsRuntime.ts`
installs telemetry and the `debugSurface.ts` live-access facade.
`perfTrace.ts`, `debugTelemetry.ts`, and `combatTelemetry.ts` own receipts.
`perfDiagnosticsAccess.ts` and `driveTestAccess.ts` keep heavy implementations
lazy. `shotContract.ts`, `shotViews.ts`, and `shotRuntime.ts` define staged
captures; `mapCaptureReadiness.ts` verifies actual sourced-texture completion.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Keep engineering implementations behind explicit development/QA entry;
  inert production facades must not pull in the heavy diagnostic graph.
- Keep traces bounded and frame records allocation-conscious. Snapshot reused
  event payloads deliberately rather than retaining mutable references.
- Capture readiness must reject stale worlds, failed texture application, and
  timeout; a rendered frame alone is not a ready-world receipt.
- Keep shot names and staging behavior synchronized with their typed contract
  and the committed tools that consume them.
- Separate read-only measurements from controls that switch maps, stage tanks,
  or mutate shot state; do not run such controls during another capture.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- Trace/telemetry change: run the adjacent `*.selftest.mjs` with bounded records.
- QA boot/access change: inspect `mainDiagnosticsRuntime.ts`, lazy access
  facades, and their selftests before checking a production build.
- Map/shot capture: run `mapCaptureReadiness.selftest.mjs` and
  `shotViews.selftest.mjs`; read `tools/SKILL.md` and use the existing screenshot
  or map-audit harness for native browser proof.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`__DEBUG` and `__SHOTS` are engineering interfaces, not ordinary player APIs.
An optional performance HUD failure must not erase the remaining diagnostic
surface. Screenshot-only readiness waits must not become production boot gates.
