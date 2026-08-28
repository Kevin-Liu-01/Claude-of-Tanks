# 0149: Technical manual runtime is strict TypeScript

## Status

Accepted — 2026-08-28

## Decision

The complete `src/docs/` browser runtime is strict TypeScript. `topics.ts` owns
the technical-manual topic schema and rendering, `battleReels.ts` owns the
typed twenty-reel selector, and `docs.ts` owns section navigation, clipboard,
archive, recipe, dialog, and motion lifecycles.

Documentation remains a separate Vite entry graph. It can reference the same
typed capture recipes and media archive as the public gallery without joining
those resources to game or Garage boot.

## Consequences

- Documentation content and its DOM assumptions are checked together.
- Every technical-manual and archive entry keeps its existing responsive and
  accessibility verification.
- `src/docs/` contains no unchecked JavaScript runtime.
