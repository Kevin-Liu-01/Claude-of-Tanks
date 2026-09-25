---
name: api-skill
description: Maintain deployed signaling, ICE credential, and public GitHub-count HTTP entrypoints.
---

# claude-of-tanks / api

## Purpose
<!-- agent-docs:fill:purpose -->
Expose the hosted application's small server-side API surface. Keep deployment
adapters thin; room/session policy belongs to `server/`, not browser code.

## Mental model & key files
<!-- agent-docs:fill:model -->
`signal.ts` configures the shared signaling server and distributed room store.
`ice.ts` provides validated static, coturn, or Cloudflare TURN configuration.
`github-stars.ts` proxies the public repository count with bounded upstream
requests and cache headers. `telemetry.ts` is the entry-telemetry fallback
sink (`docs/ENTRY-RESILIENCE.md`), used only while `VITE_TELEMETRY_URL` is
unset: one v2 record per request validated through the shared schema
`server/telemetryRecord.ts` (personal field names refused), one log line per
record, no store. The production sink is the Cloudflare Worker
`cloudflare/telemetry` (Workers Analytics Engine).
`jev.ts` is the Jev commander proxy (`docs/JEV-COMMANDER.md`): one text-only
team document per request, validated and bounded, the TypeSafe questions built
server-side, the server-held `TYPESAFE_API_KEY` never leaving the function,
upstream 401/422/429/529/timeouts mapped to clean errors with a cool-down,
per-address and per-session buckets, a session budget and a global ceiling.
Deployment routes are configured in `vercel.json`.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Read `server/SKILL.md` before changing signaling or room-store behavior.
- Preserve allowed-origin checks, method/status contracts, and upstream timeouts.
- Production signaling requires complete distributed Redis configuration;
  do not silently substitute an instance-local room store.
- Keep ICE responses private/no-store and credentials server-side. Document
  environment variable names only; never commit secret values or log credentials.
- Handler factories accept injected fetch, clock, and environment dependencies
  so failure paths can be tested without external services.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- TURN configuration: inspect `ice.ts` and run `node server/ice.selftest.mjs`.
- Signaling deployment: trace `signal.ts` into `server/signalingServer.ts` and
  `server/distributedRoomStore.ts`; start with the corresponding server tests.
- Star-count responses: run `node server/githubStars.selftest.mjs`; inspect
  `src/ui/githubStars.ts` for the loading/error presentation contract.
- Telemetry beacon: run `node server/telemetryRecord.selftest.mjs`,
  `node server/telemetry.selftest.mjs` and `node src/entry/telemetry.selftest.mjs`;
  the Worker sink is `npm run test:telemetry:cloudflare`; read the funnel with
  `node tools/telemetry-report.mjs` (docs/ENTRY-RESILIENCE.md,
  `cloudflare/telemetry/README.md`).
- Jev commander proxy: run `node server/jev.selftest.mjs` (fake upstream:
  auth header, server-built questions, every error mapping, rate limits,
  budget, origin and state validation); locally `npm run jev:dev` serves it
  on 8794 with the key from the environment (docs/JEV-COMMANDER.md).

## Gotchas
<!-- agent-docs:fill:gotchas -->
Importing `signal.ts` constructs the deployed server and validates its environment.
Do not import it into client bundles or bypass its production checks for tests.
TURN credentials and a public count have different caching requirements.
