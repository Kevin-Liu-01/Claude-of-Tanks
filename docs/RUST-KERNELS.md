# Rust kernels

The authority can answer its world queries on a WebAssembly build of `crates/cot-sim`. The kernels change no bit of
the simulation: a match on them keeps every state digest of the same match on the TypeScript, so hosts and servers may
mix them. They are on by default since 2026-10-25 (RUST-ENGINE-DECISION §9.3), with the TypeScript as the fallback.

## What runs on them

| Kernel | Rust | TypeScript it answers for |
|---|---|---|
| Contact surface (heights, fold splits) | `contact.rs` | `world/terrainContactSurface.ts` |
| Obstacle and collider grids | `grid.rs` | `world/collision.ts` `createObstacleGrid` |
| The match's deformed ground (craters, heaps, courses) | `deformation.rs` | `sim/terrainDeformation.ts` |
| Structure support (roofs, decks, stones) | `records.rs`, `structure_support.rs` | `sim/structureSupport.ts` |
| A hull's outer track lines and support fan | `support_sampling.rs` | `sim/movement.ts` `sampleOuterTrackLines`, `sampleSupportFan` |

`src/world/wasmWorldKernels.ts` binds them behind the TypeScript interfaces. A world built with `kernels`
(`createHeadlessCollisionWorld`) gets its own instance: its own lattice, overlay and record table. The module imports one
function, `env.terrain_height`, the map's height function.

## Turning them off

- **Dedicated server:** on unless `COT_SIM_KERNELS=ts` (`server/match/simKernels.ts`). The server compiles
  `crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm` once per process, so the deploy image must carry that file; one it lacks,
  or that does not compile, logs `world kernels did not load` and the server plays on the TypeScript.
- **Browser host and solo battles:** on unless `?simKernels=ts`. The lazy chunks read the flag and carry the asset URL;
  nothing loads at boot. A module that does not arrive or compile leaves that host or battle on the TypeScript.
  - A multiplayer host's Worker fetches and compiles the module. The choice stays with the host: it is never sealed into
    the migration config.
  - A solo battle steps on the main thread over the rendered world (`game/state.ts`). There the kernels take the hulls'
    support: `src/world/soloWorldKernels.ts` gives each world its own instance, its grid loaded in the order of the
    world's own obstacle grid, its ground mirrored from the battle's overlay. A world binds them when its hulls first
    need support; one that steps before the module is ready stays on the TypeScript.
  - `?simKernels=wasm-check` runs both in a solo battle: the TypeScript drives, every answer of the kernels is compared,
    and `window.__SIM_KERNELS.check` counts the comparisons and mismatches.

## Receipts

| Command | Proves |
|---|---|
| `cargo test -p cot-sim` | Every port against the TypeScript's golden vectors (`tools/port-golden-vectors.mjs`) |
| `node tools/build-cot-sim-wasm.mjs --check` | The committed binary is the clean rebuild |
| `node src/world/wasmWorldKernels.selftest.mjs` (core suite) | Parity through the production seam, and a match's digests |
| `node tools/rust-kernel-tick-ab.mjs --map=<id> --bots=30` | Tick CPU against the TypeScript at 16 a side, digests every 300 ticks |
| `node tools/mp-p2p-soak.mjs … --sim-kernels=wasm[@seats]` | The browser host Worker on the kernels, migrations included |
| `node tools/sim-determinism-audit.mjs --craters --kernels` | A match on the kernels against one on the TypeScript, the dug ground included |
| `node tools/solo-kernels-probe.mjs --check` | A solo battle in Chrome: `wasm-check`'s comparison, then the sim step A B B A |

Changing a ported TypeScript function means regenerating its vectors (`node tools/port-golden-vectors.mjs`) and
porting the change to its Rust file; `cargo test` fails until both agree.

## Measured

- The authority (server, multiplayer host): 16 a side, 3,600 ticks, digests identical at every check: Verdant −22 to
  −24 %, Urban −21 %, Mars −18 % of the tick's CPU (RUST-ENGINE-DECISION §2).
- A solo battle in Chrome, 16 a side, pairs of 20 s runs (profiled): Verdant (four pairs) the sim step 2.57 → 2.37 ms
  a tick (−7.5 %), the support solve −25 %; Urban (three pairs) 2.51 → 2.26 ms (−10 %), the support solve −15 %. Only
  the support rides the kernels there; the rendered world's grids and rays, the AI and the shells stay TypeScript.
  `wasm-check` over 20 s: 5.9 million comparisons on Verdant and 5.8 million on Urban, none differ.
