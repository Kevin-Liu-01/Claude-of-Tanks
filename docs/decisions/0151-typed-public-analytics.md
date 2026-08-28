# 0151: Public analytics stays typed and off the game path

## Status

Accepted — 2026-08-28

## Decision

`src/analytics.ts` is the only public analytics entry. Landing, gallery, and
documentation pages schedule its dynamic Vercel client import after a quiet
delay; `index.html` never imports it.

## Consequences

- The latency-sensitive game entry has no analytics request or evaluation.
- Every public informational entry uses the same typed, idle-scheduled owner.
- Production/development mode selection remains explicit and test-covered.
