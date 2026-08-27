# 0072 — Browser networking has one cancellable session owner

Status: accepted

## Context

The composition root separately owned the live match, bridge, status UI,
recovery listener, frame pump, snapshot barriers, spectator state, and their
cleanup order. Closing a room during a pristine client's covered battlefield
load could leave that entry waiting for a snapshot or publish a transport after
the room had already closed.

## Decision

`networkBrowserSessionRuntime.ts` owns the browser-side match, bridge, status,
recovery, frame pump, barriers, spectator flag, and round/presentation cleanup.
The launch runtime gives each private, rematch, or ranked entry an
`AbortController`. Room closure aborts the active transaction; every expensive
or externally awaited presentation boundary checks that signal. A match that
arrives after cancellation is closed before it can be published.

A temporarily closed transport generation does not itself fail the initial
snapshot barrier. The retained match/session is allowed to replace its RTC or
WebSocket lane until its bounded entry timeout, explicit abort, or match-owner
removal.

## Consequences

- Cold invitees can recover a transport without restarting the covered load.
- Closing a room cannot later reveal or retain its abandoned battlefield.
- Cancellation returns to Garage without presenting a false connection error.
- Diagnostics, action queues, frame pumping, and entity lookup read one session
  owner instead of loosely synchronized composition-root variables.

## Verification

```sh
npm run test:net:entry
npm run test:net:browser
npm run typecheck
npm run build
```

The entry suite includes a pristine guest whose host closes the room during
cold presentation and asserts loader shutdown, Garage recovery, null match,
and no recorded entry failure.
