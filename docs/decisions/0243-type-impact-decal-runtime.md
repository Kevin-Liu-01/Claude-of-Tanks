# 0243 — Ballistic impact decals have a strict TypeScript owner

Status: accepted

## Decision

`src/fx/impactDecals.ts` owns the procedural atlas, articulation-local impact
frames, visible-skin clamp, retained hull/turret/gun batches, per-vehicle ring,
and reset/sweep lifecycle behind explicit event, entity, visual, armor, pool,
and statistics contracts.

The conversion preserves the existing shared material, seeded atlas and wear,
24-mark per-vehicle budget, 20-vehicle ceiling, and zero frame-loop work. It
does not change mark appearance, placement, draw order, or authoritative event
ownership.

## Consequences

- Network and solo hit payloads cross one checked presentation contract.
- Pool slots and articulation-node keys cannot silently widen to unrelated
  values.
- The impact-mark hot path remains allocation-bounded and battle-resettable.

## Verification

    npm run typecheck
    node src/fx/impactDecals.selftest.mjs
    node src/fx/effectAttachments.selftest.mjs
    npm run build
