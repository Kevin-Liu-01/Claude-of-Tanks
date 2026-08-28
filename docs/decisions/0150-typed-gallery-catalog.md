# 0150: Gallery dossiers derive from one typed vehicle contract

## Status

Accepted — 2026-08-28

## Decision

`src/gallery/catalog.ts` owns the strict vehicle subset required to derive Tank
Gallery search records, ratings, technical prose, shell summaries, and the
versioned exported specification. Armor plates, autoloaders, shells, dimensions,
roster metadata, and filters are explicit inputs.

The catalog remains a pure, read-only derivation. It does not construct fleet
visuals, mutate a vehicle spec, or import battle authority.

## Consequences

- Gallery copy and metrics now fail type checking when vehicle schema use
  drifts.
- Search and serialized dossiers still derive from the same canonical spec.
- The gallery bundle and game boot graph remain separate.
