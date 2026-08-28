# 0155 — Typed Tank Gallery application

Status: accepted

## Decision

The standalone Tank Gallery composition root is strict TypeScript. Its DOM,
filter controls, camera views, procedural vehicle lifecycle, diagnostic
overlays, articulation, URL state, and browser automation surface use explicit
contracts shared with the typed catalog and surface-markup modules.

## Why

The Gallery is a complete Three.js application, not a static marketing page.
Typing only its leaf modules left the integration layer free to pass nullable
records, arbitrary modes, unvalidated view keys, generic event targets, and
unowned procedural visuals between them.

## Consequences

- `src/gallery/` contains no JavaScript runtime entry points.
- The Gallery remains a separate Vite entry and contributes nothing to game
  boot.
- Missing required DOM controls fail with their selector at startup.
- Vehicle, overlay, markup, camera, filter, and URL behavior is unchanged.
