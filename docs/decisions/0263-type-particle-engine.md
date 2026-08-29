# 0263 — The instanced particle engine has a strict TypeScript owner

Status: accepted

## Decision

`src/fx/particles.ts` owns deterministic procedural atlas generation,
prebuilt-atlas acquisition, soft-particle uniforms, pooled instanced geometry,
partial attribute uploads, and pool-specific emission recipes.

The port introduces explicit contracts for seeded noise, Canvas2D ownership,
GPU pool layout, particle options, the render-context seam, deferred texture
warming, and the public particle runtime. It preserves all GLSL, pool sizes,
render layers, draw order, seeded random consumption, clocks, and update-range
behavior.

## Consequences

- Smoke, fire, propellant, dust, flash, jet, spark, and debris emitters cannot
  accidentally receive another pool's attribute recipe from typed callers.
- Canvas2D resources are acquired only inside the battle-only particle owner.
- The Garage boot graph still excludes the battle-only particle engine, while
  Battle and Studio keep the same deterministic warm-before-first-use path.

## Verification

    npm run typecheck
    node src/fx/lazyRuntime.selftest.mjs
    node src/fx/particleTextureAssets.selftest.mjs
    node src/fx/impactDecals.selftest.mjs
    node src/fx/clock.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
    node tools/studio-selftest.mjs
