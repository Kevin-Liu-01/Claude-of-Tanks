# 0191 — The after-action and rematch report is strict TypeScript

Status: accepted

## Decision

The cinematic battle result surface is owned by `src/ui/endScreen.ts` behind
explicit result-summary, roster, best-shot, room-context, DOM, and animation
contracts. It continues to consume resolved combat-event totals from
`shotInfo.js`; it does not recompute authority state.

The report narrows room-state bus payloads before rendering multiplayer
readiness. Required descendants created by its own templates fail at their
point of acquisition instead of flowing as nullable elements.

## Why

The report spans solo results, persistent private/LAN rooms, live ready/rematch
commands, adopted Garage navigation, vehicle imagery, count-up animation, and
accessible roster meters. In JavaScript, those distinct states shared implicit
objects and nullable DOM queries, allowing a malformed event or template drift
to fail only after a complete match.

## Consequences

- Verdict copy, report layout, animation timing, icons, roster ordering, and
  room commands are visually and behaviorally unchanged.
- Result statistics and roster rows have one documented presentation shape.
- Missing vehicle selections no longer request a synthetic `null` icon URL.
- Count-up handles are finalized and cancelled through an explicit lifecycle.
- Typecheck, summary arithmetic, responsive layout, accent styling, local
  import integrity, production build, and live browser result rendering certify
  the migration.
