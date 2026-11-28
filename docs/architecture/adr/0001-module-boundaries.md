# ADR 0001: Layer rules and import cycles are machine-checked against a shrink-only pin

- Status: accepted (arch-1, 2026-11-27)
- Checks: `tools/module-boundaries.mjs`, `tools/module-boundaries.pin.mjs`, `tools/module-boundaries.selftest.mjs` (default tier)

## Context

The runtime import graph (3,077 modules) has 6 file-level static cycles, and its areas form one strongly connected
component of 20 areas: 60 edges run from lower areas (`src/sim`, `src/world`, `src/vehicles`, `src/engine`,
`src/fx`, `src/audio`) up to the UI, the composition layer or the local driver. Most of them point at a few misplaced
leaves (see [MAP.md](../MAP.md)). Nothing stopped new ones: `driver-boundaries` guards the simulation core and the
drivers only, and Oxlint has no import-cycle rule here. An agent landing in parallel could not tell from the code which
direction an import may go. Separately, seven tools and receipts each resolved import specifiers with their own copy of the same
function, and five walked import declarations on their own (one with a regular expression), with small differences (a
directory, a Worker URL, nested declarations).

## Decision

1. One import reader. `tools/static-import-closure.mjs` owns parsing a module's import edges (static, type-only, lazy,
   Worker) and resolving a specifier to a file. Every tool reads edges through it. The receipt fails on a new specifier
   resolver; the three left (the selftest cache and changed-only graph, which follow template and glob specifiers on
   the TypeScript AST, and the lazy-chunk census) are pinned and only shrink.
2. Coarse layer rules over every runtime edge (static, lazy, Worker; type-only edges are erased and not checked):
   - nothing shipped (`src`, `server`, `api`, `cloudflare`, `middleware.ts`) imports `tools/`. The Field Manual's
     chapters and search index are build-time generators run by `tools/docs-prerender.mjs`: they may import `tools/`,
     and nothing shipped imports them;
   - `src/sim`, `src/world`, `src/vehicles`, `src/engine`, `src/fx`, `src/audio` import no page shell, driver,
     composition or service module (`server/`, `api/`, `cloudflare/`; the core bots excepted, per §1.6);
   - `src/mp` imports no page shell, composition module or local-driver module;
   - `src/entry` (the telemetry beacon and its record schema, arch-2) is a leaf every layer may import, and it imports
     nothing outside itself;
   - `server`, `cloudflare`, `api` import nothing of the page (the phone-pad pairing room's protocol and actor in
     `src/pad` excepted: the services run them).
3. No static import cycle between runtime modules. Lazy and Worker edges do not form evaluation cycles and are allowed.
   A relative import that names no file is reported, never dropped.
4. Debt is pinned, not exempted. Every violation present when a rule lands is a line in the pin. A new violation fails;
   a pinned line that disappears also fails until it is removed, so the pin only shrinks. Adding a pin line is an
   architecture change: it needs an ADR, not a pin edit.

## Options weighed

- Oxlint `import/no-cycle` and a restricted-imports config: covers cycles and simple globs, but has no pin, so it would
  land red or with blanket exemptions, and it reads type-only imports as edges unless configured per file.
- dependency-cruiser: full rule language, but a new dependency, its own resolver (a second import reader), and its
  config sits outside the receipt system the integrator runs.
- Extend `driver-boundaries.mjs`: it owns the §1.6 rules and must stay focused on them; mixing coarse area rules in would
  make each harder to read.
- A separate receipt on the shared reader (chosen): small, uses the existing receipt tiers and seeded-violation style,
  no new dependency.

## Consequences

- An agent sees the allowed direction in one table (`RULES`) and gets a failing receipt with the rule's reason.
- Each migration round removes its lines from the pin in the same commit; MAP.md and BACKLOG.md name the round per group.
- Rules can be added before their migration, with their current edges pinned.
- The rules are coarse by area. Finer rules (for example `src/ui` and `src/game` importing `src/app`) wait until the
  misplaced leaves have moved (T-lazy-1).
