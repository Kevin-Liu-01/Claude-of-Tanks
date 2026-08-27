# ADR 0076: The Garage play surface has one typed lifecycle owner

- Status: accepted
- Date: 2026-08-27

## Context

The Garage composition root retained the play-menu promise, pending solo
callback, mode-specific preload graph, active-room precedence, and battle
dismissal policy. The menu itself is network-only for private, LAN, and ranked
operations, yet solo entry still crossed the same inline orchestration. A
failed cold menu construction could also leave callers coupled to stale local
state. Moving the code exposed a separate pristine-boot hazard: a direct port
reference to a later `const` binding reads its temporal dead zone while
`main.js` is still evaluating.

## Decision

`src/game/playSurfaceRuntime.ts` owns one reusable, retryable play-menu
instance. Solo starts without constructing the menu. An active retained room
wins before any replacement operation. Private/LAN and ranked intent acquire
only their required presentation and transport owners. Battle entry calls
`hide(false)` so room membership survives the transition.

The composition root supplies concrete UI and network ports. Any port whose
implementation is declared later in `main.js` must be passed through a closure;
the lifecycle owner invokes it only after explicit user intent.

## Consequences

- Menu construction failure clears its in-flight receipt and a later click can
  retry without reloading the page.
- Solo first use does not evaluate or allocate the network operation picker.
- Room, rematch, invite, and ordinary Garage callers share dismissal and
  active-room precedence.
- Cold module evaluation cannot read a later battle-only binding.
- `main.js` loses its menu promise, pending-solo latch, and mode policy.

## Verification

    npm run typecheck
    node src/game/playSurfaceRuntime.selftest.mjs
    node src/game/loadingIntent.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run perf:cold
    npm test
    npm run build
