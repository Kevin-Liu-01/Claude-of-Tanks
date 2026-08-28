# 0103 — Network battle presentation has one strict typed bridge

## Context

Authoritative browser snapshots cross into first-party Three.js tank visuals,
prediction correction, destruction effects, shell presentation, and legacy game
state through `browserBattleBridge`. It was the final JavaScript owner in
`src/net`, so malformed presentation data or an accidental entity/spec mismatch
could remain implicit until a live multiplayer match.

The bridge must remain demand loaded. Moving it into the player boot graph would
undo the cold-start benefit of loading multiplayer presentation only when a
network battle is entered.

## Decision

`src/net/browserBattleBridge.ts` is the single strict boundary between sampled
network state and browser battle presentation. It defines explicit contracts for
bridge entities, tank visuals, collision data, shells, events, and the legacy
game facade. Untrusted snapshot metadata is normalized before it changes UI or
round state, presentation events are adapted at the queue boundary, and lazy
module factories keep exact signatures instead of escaping through variadic
`any` calls.

The bridge remains dynamically imported through `battleModuleAccess.ts`. It
does not simulate hits, damage, reloads, spotting, or match results; authority
continues to live in the match runtime.

## Consequences

- Every runtime owner in `src/net` is strict TypeScript.
- Entity IDs remain distinct from vehicle spec IDs, including duplicate picks.
- Hidden entities still remain absent until an authoritative snapshot reveals
  them.
- Multiplayer presentation remains outside the boot-critical module graph.
- Legacy Three.js/game surfaces are isolated behind explicit narrow contracts
  instead of spreading untyped state through networking code.

## Verification

- `npm run typecheck`
- `node src/net/browserBattleBridge.selftest.mjs`
- `node src/net/net.selftest.mjs`
- `node src/net/privateMatchHandoff.selftest.mjs`
- `node tools/multiplayer-browser-soak.mjs`
- `npm run test:net:entry`
- `npm run build`
