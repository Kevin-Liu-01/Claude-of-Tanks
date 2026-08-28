# 0121 — Mobile auto-aim has one typed lifecycle owner

## Context

`main.js` retained the mobile target id, target point, three event listeners,
visibility/loss policy, and per-frame center-mass update. That split one input
feature across the composition root and the lazy battle-client module.

## Decision

`mobileAutoAimRuntime.ts` owns acquisition, toggle, target loss, phase reset,
UI state events, and one retained center-mass vector. Battle geometry and
selection functions remain injected through the existing lazy client facade,
and the lifecycle itself transfers alongside touch controls, so desktop Garage
boot acquires neither it nor the combat implementation.

## Consequences

- The frame loop makes one allocation-free `sample(active)` call.
- Desktop, destroyed-player, hidden-target and non-battle guards are explicit.
- Event listeners now share an idempotent teardown boundary.
- Camera following and mobile UI copy remain unchanged.

## Verification

- `npm run typecheck`
- `node src/game/mobileAutoAimRuntime.selftest.mjs`
- `node src/game/mobileAutoAim.selftest.mjs`
- `node tools/controls-probe.mjs`
- `npm run build`
