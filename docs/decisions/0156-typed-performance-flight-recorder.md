# 0156 — Typed performance flight recorder

Status: accepted

## Decision

The development and production-QA flight recorder is strict TypeScript. Its
renderer telemetry, bounded event payloads, frame columns, browser lifecycle
events, long-task attribution, and exported snapshots use explicit contracts.
Unknown gameplay payloads are narrowed or cloned at the recorder boundary.

## Why

The recorder observes nearly every runtime subsystem and is loaded when a
diagnostic session is already under stress. Leaving that boundary implicit made
it easy for malformed event data or browser-specific APIs to break the probe
that should explain a failure. Types also document which renderer and gameplay
state the recorder may inspect without coupling it to the full application.

## Consequences

- Normal production boot remains unchanged because the recorder stays behind
  the existing dynamic debug import.
- Frame storage remains allocation-bounded typed arrays and event history
  remains a fixed-capacity ring.
- Browser-only memory, device, WebGL, and long-task fields are optional and
  fail closed when a platform does not expose them.
- Event payloads remain behaviorally compatible while circular or unfamiliar
  values are represented safely in exported traces.
