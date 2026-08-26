# ADR 0037: Network presentation shapes synchronized volleys

- Status: accepted
- Date: 2026-08-26

## Context

Authoritative multiplayer can legitimately resolve many guns on one fixed
tick. Their presentation events arrived in order, but the browser client was
allowed to submit eight complete muzzle, particle, light, and audio graphs in
one render beat. A pristine 14-session 7v7 match measured a 54-131 ms long
task at the synchronized volley even though authority itself averaged less
than 0.2 ms and dropped no simulation time.

## Decision

Keep every authoritative event and its order, but admit at most three ordinary
presentation events and one complete gun/destruction presentation per rendered
frame. Snapshots remain authoritative, so this shapes only visual/audio
submission and never delays simulation or damage.

## Consequences

- Full effects, audio, hit resolution, and event order are unchanged.
- A fourteen-gun volley is presented over a short bounded sequence of 120 Hz
  frames instead of one main-thread burst.
- Presentation can trail authority by several frames during exceptional event
  storms, while snapshot state continues to converge immediately.

## Verification

    node src/net/presentationEventQueue.selftest.mjs
    npm run test:net:seven:full
    npm run test:net:render
