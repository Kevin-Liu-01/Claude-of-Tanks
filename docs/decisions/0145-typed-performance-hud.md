# 0145: Performance diagnostics have a typed lazy surface

## Status

Accepted — 2026-08-28

## Decision

`src/ui/perfHud.ts` owns the opt-in diagnostics dashboard, its renderer/game
ports, bounded frame-time ring, long-task window, telemetry schema, and 4 Hz DOM
paint. The module remains dynamically imported only for explicit debug intent
or a persisted diagnostics setting.

Browser-specific heap telemetry is isolated behind a narrow optional contract;
normal browsers continue to report memory as unavailable when the extension is
absent.

## Consequences

- Diagnostics payload drift is caught by strict type checking.
- The overlay adds no ordinary production boot evaluation or network traffic.
- Capture hiding, export, copy, and issue-mark behavior remain unchanged.
