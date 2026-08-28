# 0170 — Typed armor tracing and articulation frames

Status: accepted

## Decision

Armor tracing is strict TypeScript and owns the canonical contracts for armor
plates, closed collision cells, module and crew volumes, track prisms,
articulation-local hit records, aim queries, and blast targets. Damage,
reticle, scoped armor overlay, bots, and authority consume those exported
contracts directly.

## Why

An armor contact is produced in one of four moving frames—hull, turret, gun,
or barrel—and then drives authoritative damage plus several presentation
systems. Previously the tracing module was untyped while each consumer
redeclared a partial approximation of its output. That invited drift in ERA,
closed-cell, barrel-screen, and turret-local hit handling.

## Consequences

- Quad, convex-cell, AABB, ellipsoid, elliptic-cylinder, capsule, track-prism,
  and barrel intersection math is unchanged.
- Module-scope matrices and vectors remain reused; only returned hit records
  allocate, exactly as before.
- Damage resolution imports the armor tracer's exact intersection union rather
  than maintaining a second shape hierarchy.
- Aim and scoped-overlay scratch poses are complete reusable typed records.
- Combat, aim, overlay, ERA, Type 99 armor, fleet balance, import integrity,
  production build, and resource gates certify the migration.
