# 0179 — The application composition root is strict TypeScript

Status: accepted

## Decision

The browser application entry is `src/main.ts` and compiles under the strict
project configuration. It owns dependency order and concrete browser wiring,
while subsystem behavior remains in focused owner modules. Remaining
JavaScript implementations cross this root through explicit `unknown` port
adapters with locally declared capabilities; the root contains no `any`,
`@ts-ignore`, or `@ts-nocheck` escape.

## Why

The composition root is where browser lifecycle, Three.js presentation,
Garage and battle transitions, optional runtime acquisition, and simulation
receipts meet. Leaving this seam unchecked allowed a missing minimap preload
URL and stale callback assumptions to evade compiler validation even though
most extracted owners were already typed.

## Consequences

- The entry document and Vite development warmup reference `src/main.ts`.
- Required DOM anchors fail during boot with an attributable error instead of
  propagating a nullable root through the application.
- Boot-stage work preserves its concrete return type through overloaded typed
  lifecycle calls.
- The minimap preload URL is derived deterministically from the active Vite
  base path and the existing `spawn-oriented-v2` asset contract.
- JavaScript ports expose only the capabilities the root consumes. They remain
  isolated migration seams and can be removed one owner at a time.
- Startup order, visuals, fixed-step gameplay, lazy-loading policy, and runtime
  performance are unchanged.
- Typecheck, production build, all ordered self-tests, resource gates, and
  browser/network entry checks certify the boundary.
