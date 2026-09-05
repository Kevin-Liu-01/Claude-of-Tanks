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
requests and cache headers. Deployment routes are configured in `vercel.json`.

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

## Gotchas
<!-- agent-docs:fill:gotchas -->
Importing `signal.ts` constructs the deployed server and validates its environment.
Do not import it into client bundles or bypass its production checks for tests.
TURN credentials and a public count have different caching requirements.
