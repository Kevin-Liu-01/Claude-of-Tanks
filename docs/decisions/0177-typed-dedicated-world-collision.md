# 0177 — Dedicated collision-manifest inflation is strict TypeScript

Status: accepted

## Decision

The server adapter that turns generated battlefield collision manifests into
match-local headless collision worlds is strict TypeScript. It exposes typed
world and census results, a typed per-map terrain cache, and a single explicit
adapter for the legacy generated map-config tuple inference.

## Why

Dedicated shells, line of sight, concealment, crushing, and vehicle movement
must resolve the same battlefield that clients render. The former JavaScript
adapter indexed a large JSON manifest and cached terrain values without any
schema or map-key checking at compile time.

## Consequences

- All twenty generated manifests retain their exact obstacle, collider, and
  concealer counts and ordering.
- Terrain height fields remain cached by map ID while destructible collision
  records remain fresh and match-local.
- Missing maps or incompatible manifest versions still fail before a match is
  constructed.
- Headless raycasts, compound hedgehogs, crushable cover, and visual-world
  parity are unchanged.
- Typecheck, the all-map collision census, four-player authority, browser-tool
  imports, import integrity, and production build certify the migration.
