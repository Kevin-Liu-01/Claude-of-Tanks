# 0146: Public capture archives share a typed lazy owner

## Status

Accepted — 2026-08-28

## Decision

`src/presentation/mediaArchive.ts` owns the shared landing-page, documentation,
and Scene Studio capture gallery. Its manifest, shot, filter, pagination,
lightbox, and recipe-button contracts are strict TypeScript while the module and
its stylesheet remain demand-loaded.

The archive keeps eager loading bounded to its first three visible frames and
disposes modal-backed recipe controls before replacing filtered cards.

## Consequences

- Invalid manifest or DOM assumptions fail at the archive boundary rather than
  producing partially wired controls.
- Gallery typing does not add work to game or Garage boot.
- Public, docs, and Studio surfaces continue to use one visual implementation.
