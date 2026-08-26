# 0010 — Settings are a retryable intent-loaded runtime

## Context

The complete controls editor, graphics and audio panels, pause overlay,
pointer-lock recovery, and hint system were transferred and parsed before the
first garage frame even when a player never opened Settings. Only the small
gear trigger is required in the initial navigation rail.

## Decision

`settingsAccess.ts` owns a stable settings facade and the exact gear trigger.
The full `settings.js` runtime loads on direct gear/menu intent and is also
preloaded behind the covered Battle transition.

- The facade answers `isOpen()` synchronously and safely before acquisition.
- Escape/menu intent, modal ownership, and the kill-cam completion grace are
  enforced by the access owner, so first use remains behaviorally identical.
- The loaded runtime reuses the existing trigger and does not register a
  duplicate menu action.
- A rejected module request clears the in-flight promise and may be retried.
- Battle entry awaits the runtime before pointer lock becomes gameplay state,
  preserving pause, focus-loss, and click-to-resume behavior.

## Consequences

Garage boot no longer transfers or parses the settings implementation. No
control, style, binding, pause, or visual treatment is removed; the cost moves
to explicit intent or the already-opaque Battle loader.

## Verification

- `src/ui/settingsAccess.selftest.mjs` covers request coalescing, retry,
  modal/replay ownership, and trigger behavior.
- `src/ui/settingsControls.selftest.mjs` continues to certify the complete
  settings implementation.
- Production build output must place `settings.js` outside the initial main
  chunk, while cold boot, battle entry, and first-open browser probes pass.
