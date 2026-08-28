# 0201 — The eager fleet facade is strict TypeScript

Status: accepted

## Decision

`src/vehicles/tankFactory.ts` is the canonical eager full-fleet entry point for
release tools, headless audits, deterministic captures, and dedicated runtime
registration. It owns donor-wave evaluation order, generated receipt
registration, first-party roster finalization, family-order normalization, and
one-time configuration of the cycle-free `tankFactoryCore.js` implementation.

Player boot continues to use `fleetFactory.ts`, which shares the same core but
demand-loads only required families. No compatibility JavaScript wrapper is
kept; all repository imports name the typed facade directly.

## Why

The eager entry point is intentionally side-effectful and widely used. Leaving
its registration sequence outside TypeScript lets an import-order or roster-key
mistake escape the migration while retaining a misleading JavaScript surface.
The facade is small enough to type as one cohesive composition boundary; the
large procedural core remains a separate migration problem.

## Consequences

- TypeScript checks the full-fleet facade and every authored TypeScript import.
- Browser loading behavior and the synchronous `createTank` implementation are
  unchanged.
- Node and browser audit tools import `.ts` directly; the repository's current
  Node and Vite runtimes are the supported execution environments.
- Design documentation distinguishes the eager facade, demand facade, and
  cycle-free implementation instead of describing the retired monolith.
