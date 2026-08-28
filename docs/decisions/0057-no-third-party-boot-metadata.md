# ADR 0057: Decorative repository metadata has a same-origin cache boundary

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

All product surfaces render the release-verified packaged count immediately.
They then refresh through the bounded same-origin `/api/github-stars` endpoint.
That endpoint, rather than each player's browser, calls GitHub and publishes a
shared edge-cached result. A failed refresh keeps the packaged or last verified
count and does not affect startup.

## Consequences

- Fresh players never contact GitHub directly merely by loading the game.
- Boot and multiplayer certification are independent from GitHub availability
  and shared-IP rate limits.
- The displayed count updates automatically while edge caching bounds upstream
  traffic; it may lag by the cache interval.
- Local storage retains the last verified count for six hours and collapses
  repeated mounts into one request.

## Verification

    node src/presentation/publicNav.selftest.mjs
    node server/githubStars.selftest.mjs
    npm run perf:cold -- --sessions 3
    npm run test:net:seven:full
