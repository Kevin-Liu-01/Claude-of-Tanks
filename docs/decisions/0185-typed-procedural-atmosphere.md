# 0185 — Procedural atmosphere ownership is strict TypeScript

Status: accepted

## Decision

The visible sky, map atmosphere presets, deterministic cloud-bake worker
protocol, cloud-deck texture replacement, horizon readback, fog installation,
and PMREM environment replacement are owned by `src/engine/sky.ts` behind the
exported `SkyPreset` and `SkyRig` contracts.

World activation carries the concrete sky-preset type to the application
composition root. The root consumes `createSky()` directly and no longer wraps
the atmosphere owner in a legacy `unknown` adapter.

## Why

Atmosphere is a boot-critical rendering owner with asynchronous worker results,
Canvas resources, shader patching, and replaceable GPU render targets. The
former JavaScript boundary allowed malformed presets or worker payloads and
implicit null assumptions to cross directly into shader uniforms and resource
lifetime code.

## Consequences

- Every visual constant, shader source string, texture size, cloud cadence,
  fog formula, PMREM setting, and map preset remains unchanged.
- Cloud worker messages distinguish cumulus and cirrus payloads and retain
  their transferred `Uint8ClampedArray` ownership.
- Canvas acquisition fails explicitly when a 2D context is unavailable instead
  of dereferencing null during a battle transition.
- PMREM and optional HDRI targets have one typed replacement/disposal path.
- Map activation can no longer erase the sky contract back to `unknown` before
  it reaches the renderer.
- Strict typecheck, deterministic cloud-bake, world-activation, device rescue,
  production build, and repository-integrity gates certify the migration.
