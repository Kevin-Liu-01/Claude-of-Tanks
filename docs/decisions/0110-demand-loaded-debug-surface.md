# 0110 — The browser debug surface is demand loaded

## Context

`main.js` installed a large live `window.__DEBUG` object for every player even
though only development, explicit `?debug=1` sessions, and browser automation
use it. That mixed QA composition with player startup, exposed mutable runtime
internals in ordinary production sessions, and made the boot owner harder to
read and type-check.

## Decision

`debugSurface.ts` is the strict TypeScript owner for the browser engineering
API. `main.js` now imports and installs it only when diagnostics are explicitly
requested or the browser reports automation. The surface receives narrow live
getter and action ports, so it retains the established probe contract without
owning gameplay state.

## Consequences

- Ordinary player boot does not transfer, parse, construct, or expose the
  engineering surface.
- Automated and explicit diagnostic sessions retain live Garage, battle,
  networking, telemetry, and capture controls.
- The composition root loses another mutable browser-owned object while all
  visual and gameplay paths remain unchanged.
- The debug module remains a separate 0.83 kB gzip production chunk.

## Verification

- `npm run typecheck`
- `node src/dev/debugSurface.selftest.mjs`
- `node tools/selftest-suites.selftest.mjs`
- `npm run build`
