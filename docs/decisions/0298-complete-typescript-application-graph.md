# 0298 — The checked application graph is entirely TypeScript

## Decision

Complete the application migration by moving the Merkava profile family,
Vercel deployment middleware, Vite configuration, and browser-only audit and
benchmark helpers to strict TypeScript. Disable `allowJs` and include the root
configuration, middleware, and tool TypeScript modules in `tsconfig.json`.

Keep `.mjs` only for Node CLI, generator, and self-test entrypoints. These are
executable harnesses around checked owners, not shipped application modules;
they remain covered by the repository's ordered self-test inventory.

## Why

Allowing unchecked JavaScript at the application boundary made a clean
TypeScript surface impossible to enforce. It also let rarely used deployment
and audit paths drift away from the contracts they exercise. A single checked
graph now covers production runtime code, build configuration, middleware,
and browser tooling without suppression or double assertions.

## Consequences

- New application JavaScript fails typecheck instead of entering silently.
- The source and build graph contains no first-party `.js` module.
- Tool-only GLB comparison remains isolated from the playable fleet while its
  semantic articulation and material operations are now typed.
- The terrain benchmark validates map-shape compatibility at runtime before
  passing data into the terrain builder.
- Gameplay, visuals, geometry, lazy-loading boundaries, and deployment routes
  are unchanged.

## Verification

- `npm run typecheck`
- `node src/engine/deploymentSkew.selftest.mjs`
- `node tools/coplanar-surface-overlap.selftest.mjs`
- browser FX texture and terrain-stream benchmark probes
- `npm test`
- `npm run build`
