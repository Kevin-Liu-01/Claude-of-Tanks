# Rust kernels

The authority can answer its world queries on a WebAssembly build of `crates/cot-sim`. The kernels change no bit of
the simulation: a match on them keeps every state digest of the same match on the TypeScript, so hosts and servers may
mix them. They are off by default.

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

## Turning them on

- **Dedicated server:** `COT_SIM_KERNELS=wasm` (`server/match/simKernels.ts`). The server compiles
  `crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm` once per process, so the deploy image must carry that file.
- **Browser host:** `?simKernels=wasm`. The lazy host chunk carries the asset URL; the host Worker fetches and compiles
  the module. The flag stays with the host: it is never sealed into the migration config.

## Receipts

| Command | Proves |
|---|---|
| `cargo test -p cot-sim` | Every port against the TypeScript's golden vectors (`tools/port-golden-vectors.mjs`) |
| `node tools/build-cot-sim-wasm.mjs --check` | The committed binary is the clean rebuild |
| `node src/world/wasmWorldKernels.selftest.mjs` (core suite) | Parity through the production seam, and a match's digests |
| `node tools/rust-kernel-tick-ab.mjs --map=<id> --bots=30` | Tick CPU against the TypeScript at 16 a side, digests every 300 ticks |
| `node tools/mp-p2p-soak.mjs … --sim-kernels=wasm[@seats]` | The browser host Worker on the kernels, migrations included |

Changing a ported TypeScript function means regenerating its vectors (`node tools/port-golden-vectors.mjs`) and
porting the change to its Rust file; `cargo test` fails until both agree.

## Measured

16 a side, 3,600 ticks, digests identical at every check: Verdant −22 to −24 %, Urban −21 %, Mars −18 % of the
authoritative tick's CPU (RUST-ENGINE-DECISION §2).
