# ADR 0057: Decorative repository metadata is network-silent

- Status: accepted
- Date: 2026-08-27

## Context

The loading screen, Garage, and public navigation each mounted a GitHub star
badge. A direct browser request to GitHub's repository API refreshed the badge,
but anonymous requests are rate-limited by public IP. A pristine 14-browser
multiplayer certification received two 403 responses before combat, causing a
strict zero-browser-error gate to fail.

The star count is decorative release metadata. It is unrelated to boot,
gameplay, networking, or safety and cannot justify a runtime dependency on a
third-party rate limit.

## Decision

All product surfaces render the release-verified packaged count. Mounting or
refreshing the badge performs no network request. The release/docs workflow
owns future count updates.

## Consequences

- Fresh players never contact GitHub merely by loading the game.
- Boot and multiplayer certification are independent from GitHub availability
  and shared-IP rate limits.
- The displayed count may lag between releases, which is acceptable for
  decorative metadata.

## Verification

    node src/presentation/publicNav.selftest.mjs
    npm run perf:cold -- --sessions 3
    npm run test:net:seven:full
