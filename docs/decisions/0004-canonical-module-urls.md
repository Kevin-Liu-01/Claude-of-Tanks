# ADR 0004: Deployment pinning preserves canonical module URLs

- Status: accepted
- Date: 2026-08-26

## Context

Vite emits modulepreload links and native ESM import specifiers for the same
chunks. Its experimental `renderBuiltUrl` hook rewrote preload dependencies
with Vercel's `?dpl=` query while leaving native static and dynamic import
specifiers relative. The browser therefore saw two distinct module URLs and
transferred much of the boot graph twice. On a constrained production first
visit, the duplicate wave added several seconds and roughly 450 KB of script
payload.

## Decision

All Vite-generated module URLs remain canonical. Root-level Vercel Routing
Middleware sets the platform's official HttpOnly `__vdpl` cookie on playable
document responses. Vercel applies that deployment pin to later asset and
document requests without changing JavaScript module identity. Middleware is
limited to the game and Studio document routes; static assets bypass it.

The one-shot boot/chunk recovery remains the fallback when platform skew
protection is unavailable or an old deployment has expired.

The root deployment adapter remains `// @ts-check` JavaScript because Vercel's
current Node builder crashes while compiling it against this repository's
TypeScript 7 toolchain. It stays inside the strict typecheck include set; this
platform boundary does not set the language policy for domain modules.

## Consequences

- Modulepreload and native import requests share the browser module cache.
- Long-running battles can lazy-load against their originating deployment.
- Public presentation routes avoid middleware cost.
- Production cold-load checks reject duplicate positive-byte script transfers.

## Verification

    npm run typecheck
    node src/engine/deploymentSkew.selftest.mjs
    VERCEL_DEPLOYMENT_ID=dpl_local_probe npm run build
    npm run perf:cold -- --url=http://127.0.0.1:5180/
