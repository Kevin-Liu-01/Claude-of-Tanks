# 0228 — Public-build provenance probes the complete boot registry

Status: accepted

## Decision

Make `tools/strip-nc-registry-probe.mjs` import `fleetFactory.ts`, the same
boot-light registration facade used by the browser, rather than maintaining a
second hand-written list of legacy spec and builder modules.

Remove exception-tolerant partial imports. A registry import failure now
prevents the marker from being emitted, so the parent strip guard fails closed.

## Why

After fleet lazy loading split combat data from visual builders, the old probe
still imported `modern1.js`, `modern2.js`, and `modern3.js`. Several donor specs
were consequently absent when the recovered-family registries evaluated. The
probe logged those failures and certified only 56 of 129 playables.

The boot facade already owns the canonical ordering and loads combat data
without demand-loading the visual families. Reusing it removes configuration
drift and makes the postbuild provenance claim exhaustive.

## Consequences

- Public builds certify every playable id in the current roster.
- Registry exceptions are no longer downgraded to notes.
- The probe still runs out of process and public source gates still resolve
  with production-safe fallbacks.
- No browser bundle or gameplay behavior changes.
