# 0127 — Type continuous FX attachment ownership

## Status

Accepted — 2026-08-28

## Context

Continuous combat emitters cross the authoritative-state and interpolated-
presentation boundary every battle frame. Their anchor mode determines whether
an effect follows a rendered vehicle root, a headless state pose, or remains in
world space. A loose JavaScript contract made invalid roots and incomplete
positions difficult to distinguish during the TypeScript migration.

## Decision

Keep the existing allocation-free anchor algorithm and expose it from
`src/fx/effectAttachments.ts` with strict ports for emitters, subject poses, and
caller-owned vector scratch. Narrow rendered roots at runtime before invoking
their transform methods, and publish the attachment policy as literal types.

The helper still allocates one three-number local anchor only on first
resolution. Every later frame mutates the existing emitter and caller scratch.

## Consequences

- FX attachment modes become an exhaustive typed registry.
- Lazy/headless subjects retain the same yaw-relative fallback behavior.
- Rendered subjects retain interpolation, suspension, and hierarchy fidelity.
- The hot path gains no new scene traversal, allocation, or visual behavior.
