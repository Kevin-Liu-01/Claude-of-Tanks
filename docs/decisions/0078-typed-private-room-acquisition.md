# ADR 0078: Private-room acquisition has one typed lifecycle owner

- Status: accepted
- Date: 2026-08-27

## Context

`playMenu.ts` created signaling, awaited ICE, selected host versus guest
authority, constructed the peer session, subscribed to lobby state, replayed a
cold guest's Garage selection, and duplicated teardown. Closing or changing
the modal while either network request was pending could let a late response
rebuild a stale lobby. Failure cleanup could also close signaling and the
session through multiple UI paths. That ownership ambiguity contributed to
the reported modal stacking, cold-invite, and session-resume failures.

## Decision

`src/net/privateRoomConnectionRuntime.ts` owns one private/LAN acquisition
generation. It starts signaling and ICE discovery in parallel, recognizes a
stable host identity after reload, builds exactly one host or client session,
and publishes the connection only while its generation is live. Client
publication waits for the peer runtime and ordered replay of vehicle,
equipment, and camouflage selection.

The play menu now supplies lifecycle ports, observes the published room, and
renders or commands it. Closing invalidates the generation before teardown.
A transport-originated close forgets already-closed ownership without a
second close. When the battle room coordinator adopts the session, the menu
forgets its acquisition owner without closing the live transport.

## Consequences

- Late signaling, ICE, or peer-ready results cannot resurrect a dismissed
  room or overlap the Garage with stale lobby UI.
- Create, join, host reload, cold guest join, failure, and handoff share one
  teardown order.
- The UI no longer imports or constructs `RoomSignalingClient`,
  `PrivateRoomHostSession`, or `PrivateRoomClientSession` directly.
- The new owner is DOM/WebGL-free and directly testable under delayed network
  completion.

## Verification

```sh
node src/net/privateRoomConnectionRuntime.selftest.mjs
node src/net/privateMatchHandoff.selftest.mjs
node src/net/networkRoomCoordinator.selftest.mjs
node src/game/playSurfaceRuntime.selftest.mjs
npm run typecheck
npm run build
```
