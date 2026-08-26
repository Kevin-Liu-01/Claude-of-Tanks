# ADR 0031: Engineering diagnostics are absent from player boot

- Status: accepted
- Date: 2026-08-26

## Context

Every production player downloaded and constructed the performance dashboard
and its scene/shadow telemetry even though the dashboard is only available to
development, explicit `?debug=1` sessions, and browser automation. The hidden
HUD still allocated frame-history buffers and installed a long-task observer.

## Decision

A strict TypeScript facade owns the optional diagnostics runtime. Its ordinary
frame methods are allocation-free no-ops until explicit QA intent acquires the
existing HUD and telemetry modules. The first request is shared, failures are
retryable, and capture-hidden/provider state is replayed when the runtime
arrives. The pure debug-URL policy lives in a tiny independent module.

## Consequences

- Ordinary production sessions transfer neither diagnostics chunk.
- Ordinary frames perform no dashboard sampling, DOM work, or observers.
- Development, `?debug=1`, and automation retain the exact dashboard and
  `window.__DEBUG` telemetry behavior.
- Diagnostics failure cannot block a playable first visit.

## Verification

    node src/dev/perfDiagnosticsAccess.selftest.mjs
    node src/dev/perfTrace.selftest.mjs
    node src/engine/deviceDiag.selftest.mjs
    npm run typecheck
    npm run build
    npm run perf:cold -- --url http://127.0.0.1:4173/ --sessions=1 --summary=1

The cold probe also fails if an ordinary pristine session requests either
diagnostics chunk.
