# Release fixture repairs (2026-09-09 UTC)

Test-only repair against `2dbddba5b`; no application, renderer, route, tank,
localization, or loading behavior changes.

- Garage/mobile source contracts now require the canonical translation keys
  instead of obsolete English literals. Authoritative ammunition interpolation,
  semantic roles, active selection, warning distinctions, and layout rules remain.
- Loading intent requires the current room-preparation guard and Solo fallback,
  rather than the obsolete direct callback assignment.
- The depth-copy test serves its private document before public route rewriting.
  Previously the public 404 page rendered all twelve native cases successfully,
  but correctly failed the strict empty-console gate. The test now additionally
  requires HTTP 200 and its own document marker. No error is filtered or waived.

Verified: all three focused UI entrypoints (including 51 representative viewport
contracts), full typecheck/core-unused check, and all twelve native depth-copy
cases on Chrome 151 / ANGLE Metal Apple M5 Max / Three 185. Native cases retain
byte parity, color preservation, no-copy/wrong-sampler negative controls, zero
fallbacks, context restoration, and browser/server/lock cleanup; errors are empty.

This removes four existing suite failures. It is not a full-suite or tank-release
PASS; independent world and profiling fixture failures remain under repair.
