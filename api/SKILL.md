---
name: api-skill
description: Maintain the deployed ICE credential, telemetry, Jev proxy and public GitHub-count HTTP entrypoints.
---

# claude-of-tanks / api

## Purpose
<!-- agent-docs:fill:purpose -->
Expose the hosted application's small server-side API surface. Keep deployment
adapters thin; room policy belongs to `src/mp/room` and `server/`, not browser code.

## Mental model & key files
<!-- agent-docs:fill:model -->
`ice.ts` provides validated static, coturn, or Cloudflare TURN configuration:
the client (`src/mp/transport/iceConfig.ts`) asks `/api/ice` on https pages, once
per peer connection, and uses host candidates on LAN. It admits a same-origin page
(`Sec-Fetch-Site: same-origin`) or an allow-listed `Origin`, leases credentials
for one hour (`COT_TURN_TTL_SECONDS` may only shorten it) and logs one structured
`cot-ice` line per upstream failure; `github-stars.ts` logs `cot-github-stars`
lines the same way. `github-stars.ts` proxies the public repository
count with bounded upstream requests and cache headers. `telemetry.ts` is the
entry-telemetry fallback sink (`docs/ENTRY-RESILIENCE.md`), used only while
`VITE_TELEMETRY_URL` is unset: one v2 record per request validated through the
shared schema `server/telemetryRecord.ts` (personal field names refused), one
log line per record, no store. The production sink is the Cloudflare Worker
`cloudflare/telemetry` (Workers Analytics Engine). `jev.ts` is the Jev commander
proxy (`docs/JEV-COMMANDER.md`): one text-only team document per request,
validated and bounded, the TypeSafe questions built server-side, the
server-held `TYPESAFE_API_KEY` never leaving the function, upstream
401/422/429/529/timeouts mapped to clean errors with a cool-down, per-address
and per-session buckets, a session budget and a global ceiling. Deployment
routes are configured in `vercel.json`. The signaling function of the first
multiplayer (`api/signal.ts`) left the tree with the cutover of 2026-09-29
(`docs/MULTIPLAYER-V2.md` §13.10): rooms live in the `cloudflare/rooms` Worker.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve allowed-origin checks, method/status contracts, and upstream timeouts.
- Origins, the canonical host and the Worker URLs come from the deployment policy
  module `api/_lib/policy.ts` (`allowedApiOrigins(env)`); never repeat them in a
  function. `_`-prefixed paths are shared code, not routes. The Workers'
  `ALLOWED_ORIGINS` and the entry telemetry literals are pinned to it by
  `node tools/deployment-policy.selftest.mjs`.
- Keep ICE responses private/no-store and credentials server-side. Document
  environment variable names only; never commit secret values or log credentials.
- Handler factories accept injected fetch, clock, and environment dependencies
  so failure paths can be tested without external services.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- TURN configuration: inspect `ice.ts` and run `node server/ice.selftest.mjs`.
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
TURN credentials and a public count have different caching requirements. Do not
import a function module into client bundles.
