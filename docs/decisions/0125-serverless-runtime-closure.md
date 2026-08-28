# ADR 0125: JavaScript serverless closures remain runtime-complete

## Context

The browser multiplayer protocol moved to TypeScript, but the Vercel signaling
entry remains `api/signal.js`. Both signaling room stores imported the browser
`protocol.ts` module solely for six-character room-code generation. Local Node
tests can load that mixed extension graph; Vercel packaged the JavaScript
function without `src/net/protocol.ts`, so production `/api/signal` failed at
module evaluation before it could report Redis health or accept a room.

## Decision

`server/roomCode.js` owns server-side room-code generation until the entire
signaling deployment entry is compiled as TypeScript. Both in-memory and Redis
room stores import that runtime-complete JavaScript leaf. Signaling regression
coverage rejects raw `.ts` imports from either production room-store closure.

The alphabet, length, finite-range validation, and deterministic test vectors
remain identical to the browser protocol implementation. This is a deployment
boundary, not a second room-membership policy owner.

## Consequences

- A TypeScript source migration cannot silently break the deployed JavaScript
  signaling function again.
- The serverless entry can cold-start without a custom TypeScript loader.
- A future compiled server entry may merge the two small generators only after
  its emitted deployment closure is covered by the same production probe.

## Verification

- `node server/signaling.selftest.mjs`
- `npm run net:prod:check` after the fixed deployment reaches production
