# 0136: Shared modal lifecycle has one typed owner

## Status

Accepted — 2026-08-28

## Decision

`src/ui/modal.ts` owns the reusable accessible dialog contract for Garage,
Studio, Gallery, settings, and contextual help. It types controller elements,
open/close options, focus restoration, dismissal timing, scroll locking, and
the supported size vocabulary.

Feature modules continue to own their content and remain free to demand-load.
The shared shell remains visually identical and does not add a framework or a
new boot dependency.

## Consequences

- Modal callers no longer need local casts or partial controller copies.
- Focus restoration cannot target arbitrary non-focusable DOM nodes.
- Nested feature panels retain one z-index, dismissal, and body-lock policy.
