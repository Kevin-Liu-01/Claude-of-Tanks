# 0062 — Batch static presentation and pack world data

Status: accepted

## Context

Frame rate alone concealed two independent costs. The mostly static Garage
submitted hundreds of identical opaque props separately, while the battle map
module embedded 1.2 MB of numeric geometry JSON. The latter forced JavaScript
parsing and object materialization before world construction could progress.
Neither cost improved visual quality.

## Decision

After the complete workshop has streamed, `garageDressingOptimization.ts`
replaces exact repeated opaque meshes with `InstancedMesh` batches keyed by
geometry, material, shadow/receive state, render order, and layer. It preserves
world transforms and excludes transparent, specialized, child-owning, and
authored fleet-exhibit meshes.

`props-models.json` remains the attributed authoring source. The common battle
path uses a deterministic gzip archive of Float32 vertex streams and Uint16
indices. `propsModelStore.ts` owns bounds-checked decoding, shared retryable
loading, and compatibility fallback. Async world construction starts transfer
before terrain work and awaits it only at the prop boundary.

## Consequences

- Initial and returned Garage frames lose 106 exact repeated-prop submissions.
- The executable map chunk falls from about 1.51 MB to 268 KB; the geometry
  payload becomes one compact transferable backing buffer.
- Visual geometry, materials, transforms, simulation, collision, and map
  layouts do not change.
- The old JSON path remains available only for browsers without streaming gzip
  support, so compatibility does not tax the normal module graph.
- An authoring-source change requires regeneration of the tracked archive.

## Verification

```sh
npm run world:props:pack
node src/world/propsModelStore.selftest.mjs
node src/game/garageDressingOptimization.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
node tools/loading-budget-probe.mjs --mode battle --maps verdant \
  --limit 12000 --rollout-limit 16000 --stall-limit 700
```
