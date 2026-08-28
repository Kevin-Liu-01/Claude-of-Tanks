# 0217 — The application composition root has a dedicated contract surface

Status: accepted

## Decision

Keep startup order and runtime wiring in `src/main.ts`, but define its browser
globals and temporary subsystem ports in `src/app/mainContracts.ts`.

The contract module is type-only. It may describe legacy JavaScript owners in
terms of concrete capabilities and `unknown`, but it must not initialize a
renderer, touch the DOM, import a fleet builder at runtime, or own lifecycle
state.

## Why

Composition code needs to show what starts, in what order, and which owner is
connected next. Keeping 149 lines of structural declarations in the middle of
that sequence obscured the dependency graph and made each later extraction
harder to review. The declarations are still valuable: they prevent unchecked
JavaScript values from leaking through the TypeScript root while those owners
are migrated.

## Consequences

- `src/main.ts` is smaller without changing its module graph or boot behavior.
- Browser QA hooks have one discoverable declaration site.
- Future subsystem migrations can delete their compatibility port from one
  module when the real exported contract becomes strict.
- Typecheck, import integrity, production build, and boot/recovery coverage are
  required gates for changes to this surface.
