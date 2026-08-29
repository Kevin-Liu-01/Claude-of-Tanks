# 0009 — Optional garage set pieces load behind a light-stable boundary

## Context

The authored workshop dressing is not needed to establish the first usable
garage frame. Its module contains the complete repair-bay set, five build
chunks, and four procedural vehicle exhibits. Importing that code during boot
made every first-time visitor parse it before the application could become
interactive. Adding its fill light later, however, changed Three.js lighting
program keys and could introduce a visible shader hitch.

## Decision

`garageDressingAccess.ts` owns the workshop as a retryable, demand-loaded
runtime boundary. `garageDressingScheduler.ts` owns its quiet-window state,
chunk order, source-family acquisition, and retry cadence.

- The access owner creates the final garage-dressing group and fill light at
  boot so the initial shader signature is stable.
- The authored module loads after readiness during a genuine garage idle
  window. It reuses that group and light rather than replacing them.
- The ordinary workshop shell is built first. Procedural exhibit families are
  fetched only before the chunks that require them.
- Captures and other deterministic consumers await `ensureBuilt()` and
  therefore still receive the complete authored workshop.
- A failed module request clears the in-flight promise and may be retried.
- Pointer, wheel, keyboard, touch, phase, and transition changes all feed one
  activity epoch shared with the background battlefield builder.

## Consequences

The first interactive garage omits optional workshop clutter briefly while it
streams in. Final visuals, geometry, materials, lighting, and exhibit order are
unchanged. The boot graph is smaller, and a transient chunk failure cannot
permanently poison the workshop owner.

## Verification

- `src/game/garageDressingAccess.selftest.mjs` verifies light stability,
  request coalescing, failure recovery, and runtime reuse.
- `src/game/garageDressingLifecycle.selftest.mjs` verifies idle scheduling,
  coalescing, transition/input deferral, source-family ordering, shared world
  activity, and return-to-garage continuation.
- The production build must place `garageDressing.ts` outside the initial main
  chunk, and deterministic garage capture must complete the full set piece.
