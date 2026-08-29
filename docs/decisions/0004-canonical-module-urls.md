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
limited to the game, Studio, and Gallery document routes; static assets bypass
it. Gallery is included because the deployment cookie is scoped to the whole
site: excluding its document can mix an old game deployment pin with a newer
Gallery document and produce removed hashed-chunk URLs.

Boot/chunk recovery appends a one-shot `_dplreset=1` signal. Middleware expires
the HttpOnly deployment pin and redirects back to the same playable URL while
preserving the bounded `_bootretry` receipt. Vercel then resolves the newest
document, which establishes a fresh pin before parsing its module graph. This
keeps Retry effective when a tab has no pin, a stale pin, or references a
deployment outside the platform skew window.

The root deployment adapter remains `// @ts-check` JavaScript because Vercel's
current Node builder crashes while compiling it against this repository's
TypeScript 7 toolchain. It stays inside the strict typecheck include set; this
platform boundary does not set the language policy for domain modules.

## Consequences

- Modulepreload and native import requests share the browser module cache.
- Long-running battles can lazy-load against their originating deployment.
- A missing game chunk can escape its stale pin without clearing all site data.
- Gallery can escape a stale site-wide pin without clearing cookies, and its
  HTML is never stored independently from its hashed module graph.
- Other public presentation routes avoid middleware cost.
- Production cold-load checks reject duplicate positive-byte script transfers.

## Verification

    npm run typecheck
    node src/engine/deploymentSkew.selftest.mjs
    VERCEL_DEPLOYMENT_ID=dpl_local_probe npm run build
    npm run perf:cold -- --url=http://127.0.0.1:5180/
