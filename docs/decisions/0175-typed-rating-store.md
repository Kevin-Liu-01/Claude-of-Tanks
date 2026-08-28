# 0175 — Ranked identity and rating persistence is strict TypeScript

Status: accepted

## Decision

The dedicated server's anonymous identity, bearer authentication, leaderboard,
and Elo persistence store is strict TypeScript. It exports explicit rank,
profile, identity, leaderboard, rated-player, result, and settlement contracts,
and treats the persisted JSON file as untrusted input.

## Why

This module owns long-lived player identity and irreversible rating updates.
Its former JavaScript implementation inferred the saved-file schema and
treated every non-draw/non-Alpha result as a Bravo win. Corrupt persistence or
an invalid upstream result therefore could mutate durable records incorrectly.

## Consequences

- Bearer secrets remain SHA-256 hashes compared with timing-safe equality and
  are never serialized in plaintext.
- Saved profiles are narrowed and clamped before entering live maps; malformed
  rows remain ignored as before.
- Match IDs remain idempotent and the settled-match receipt set remains capped
  to the newest 10,000 entries on disk.
- Only `alpha`, `bravo`, or `draw` can settle ratings; invalid outcomes fail
  before any profile is mutated.
- Rating thresholds, provisional/established K factors, file permissions,
  atomic rename, and leaderboard ordering are unchanged.
- Typecheck, persistence, queue, HTTP, dedicated reconnect, import integrity,
  and production build checks certify the migration.
