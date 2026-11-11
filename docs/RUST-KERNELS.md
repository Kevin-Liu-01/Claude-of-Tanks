# Rust kernels

The authority can answer its world queries on a WebAssembly build of `crates/cot-sim`. The kernels change no bit of
the simulation: a match on them keeps every state digest of the same match on the TypeScript, so hosts and servers may
mix them. They are on by default since 2026-10-25 ("The decision", below), with the TypeScript as the fallback.

## The decision (2026-10-25)

The owner's ruling on the engine question, approved 2026-10-25 ("approved for all"):

- **The hybrid: keep the three.js renderer and grow a Rust simulation core** under the TypeScript's interfaces, one
  bit-exact kernel or whole subsystem at a time. No port to Bevy and no rewrite: a frame's time goes to render
  submission (18 to 25 ms of main thread against 1.4 to 5.0 ms for the authoritative tick), so a Rust sim cannot buy
  the frame rate back; a kernel earns its place by being bit-exact and owning a whole loop.
- **Why Rust at all: determinism.** The TypeScript sim's `Math.*` results differ between Node and Chromium, between
  operating systems and in Safari; a WebAssembly core with its own math gives the same bits everywhere.
- **The kernels are on by default**, with the TypeScript as the fallback and the opt-outs below. Their gate is below
  ("The default's gate") and their speed under "Measured".
- **The renderer** stays three.js WebGL while the draw count comes down; a lean WebGPU renderer is a later candidate,
  decided only on measurements. A native app wraps the web build first.
- **Step 5, a solo battle's authority in a Worker, was tried and retired on 2026-10-29** by the owner's "one core,
  two drivers" ruling (docs/ARCHITECTURE.md §1.6): a local battle never runs through the multiplayer client. Any
  future off-thread local simulation must be a local driver, with no prediction or interpolation, and needs the
  owner's OK after they have played it.

## What runs on them

| Kernel | Rust | TypeScript it answers for |
|---|---|---|
| Contact surface (heights, fold splits) | `contact.rs` | `world/terrainContactSurface.ts` |
| Obstacle and collider grids | `grid.rs` | `world/collision.ts` `createObstacleGrid` |
| The match's deformed ground (craters, heaps, courses) | `deformation.rs` | `sim/terrainDeformation.ts` |
| Structure support (roofs, decks, stones) | `records.rs`, `structure_support.rs` | `sim/structureSupport.ts` |
| A hull's outer track lines and support fan | `support_sampling.rs` | `sim/movement.ts` `sampleOuterTrackLines`, `sampleSupportFan` |
| The bots' clearance scans (a box's candidates kept by their clearance of a point or a lane) | `clearance.rs` | `world/collision.ts` `collisionClearanceContainsPoint`, `rayCollisionClearanceEntry2` in `game/ai.ts`'s `avoidObstacles`, `solidWithin`, `laneMeetsSolid`, `solidAhead` |

`src/world/wasmWorldKernels.ts` binds them behind the TypeScript interfaces. The clearance scans ride the obstacle
grid (`ObstacleQuery.clearance`): the AI uses them where the grid carries them and its own loops elsewhere, and keeps
reading a record's crushed state itself, since a match changes it. A world built with `kernels`
(`createHeadlessCollisionWorld`) gets its own instance: its own lattice, overlay and record table. The module imports one
function, `env.terrain_height`, the map's height function.

## Protocols (2026-11-02 audit S2)

One instance keeps one world's state across calls, so the calls that only make sense in an order carry that order in
the kernel (`crates/cot-sim-wasm` `State`), checked per call. A call out of order, or naming a stale walk or handle, is
refused with a code (`REFUSED_*`) and never answered from a half-made state. `protocol_refusal` names the last checked
call's code, 0 when it was taken, so the host tells a refused NaN or null from an answer (round 2 U37).
`src/world/wasmWorldKernels.ts` asserts on every refusal, a refused sample's NaN included, so a host's slip throws where
it happens; a NaN the kernel answered (its ground's) passes.

- **Contact lattice:** each corner and fold split is written once (`lattice_set_vertex`, `lattice_fill`,
  `lattice_set_flip_from_centre`): the same value again is taken, another refused, a split waits for its corners. There
  is no raw write pointer. `contact_status` is the last call's, `contact_cell_flipped`'s included.
- **A hull's support:** `support_query` (refused before `records_load`) → the host writes the candidates' flags →
  `support_begin` at the same point (refused with no query since the last begin, or at another point) → the samples
  (refused between a query and its begin: NaN, or −1 for a count; only a `beginHull` that threw leaves a hull there, and
  the host throws on such a sample).
- **The clearance walks:** `clearance_begin` returns the walk's id, which its `*_next` and `clearance_entry` calls name.
  A walk begun inside another supersedes it, and the outer walk's next call is refused (`WALK_STALE`); `records_load`
  ends any walk. `clearance_entry` is NaN for a superseded walk (refused) and for an open one whose lane has handed out
  no record yet (taken); the host's error names which.
- **Grids:** a handle names a grid of the instance that made it; one never made, or freed (`grid_free`), is refused. The
  hosts build a world's grids once, with its instance.
- **The overlay mirror:** the kernel's clock is unset (NaN, `overlay_time`) on a fresh or reset overlay, as the
  TypeScript's `clockS`. A heap goes over with the start the overlay resolved: `overlay_add_rubble` takes no other, so
  the kernel's clock never decides a start and a heap rises the same whether it was laid before or after a `set_time`.
  The host asserts the copy in step: each crater admitted (the bind's replay included), the revisions after every
  change, the clocks at the bind, every step and every reset.

## Turning them off

- **LAN helper** (the one Node authority since the container left the tree, docs/MULTIPLAYER-V2.md §13.10): on unless
  `COT_SIM_KERNELS=ts` (`server/match/simKernels.ts`). It compiles `crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm` once
  per process, so its checkout must carry that file; one it lacks, or that does not compile, logs `world kernels did
  not load` and it plays on the TypeScript.
- **Browser host and solo battles:** on unless `?simKernels=ts`. The lazy chunks read the flag and carry the asset URL;
  nothing loads at boot. A module that does not arrive or compile leaves that host or battle on the TypeScript.
  - A multiplayer host's Worker fetches and compiles the module. The choice stays with the host: it is never sealed into
    the migration config. Its boot (and a standby's preparation) waits for the module before it builds the world, so the
    fetch, its answer and its bytes, has `HOST_KERNELS_FETCH_MS` (15 s, `src/mp/host/worldCollision.ts`) from its start
    (round 5 Q1, review r2): past it the request is aborted and the world is built on the TypeScript, reported
    `timeout`, inside the boot's own 30 s bound (`ELECTED_HOST_BOOT_MS`). Before, a request that never answered held
    the boot until that bound failed it, and the room elected another seat. The 15 s fallback holds where the module's
    own request stalls or crawls: the boot fetches the map's collision manifest only after the module, and a manifest is
    6 to 34 times the module's bytes (gzipped), so a link slow enough to cut the module at 15 s also holds a manifest
    the browser has not cached past the boot's bound, and that boot fails at 30 s with or without the bound. A
    standby's preparation, which starts 20 s after the seat is welcomed as a peer (`STANDBY_HOST_DELAY_MS`) and may
    have minutes before any boot needs its world, is held to the same bound: where the module takes longer than 15 s,
    the standby builds its world on the TypeScript, and a migration onto it once that world is built reuses it, so the
    new host runs on the TypeScript too, reported `timeout` (the same match, without the kernels' tick saving). A
    migration that comes before that world is built waits for it inside the boot's 30 s bound, so on a link slow
    enough to cut the module, where the preparation's manifest crawls too, it fails as above unless that world is built
    inside those 30 s.
  - A solo battle steps on the main thread over the rendered world (`game/state.ts`). There the kernels take the hulls'
    support: `src/world/soloWorldKernels.ts` gives each world its own instance, its grid loaded in the order of the
    world's own obstacle grid, its ground mirrored from the battle's overlay. Each battle chooses once, at its setup
    (2026-11-02 audit S2): set up once the module is ready, it rides the kernels for its hulls' support and its obstacle
    query alike; set up before, it stays on the TypeScript to its end, and the next battle on that world rides them.
    The battle entry waits for the module (round 3 X10): the covered entry's ask for the solo authority
    (`preloadSoloAuthority`, the preload of `game/soloBattleAccess.ts`, beside the world in its barrier) resolves once
    the kernels are installed or failed, or `SOLO_KERNELS_ENTRY_WAIT_MS` (3 s, `game/soloBattleRuntime.ts`) after that
    ask has the chunk: after its transfer, when that is still in flight, since the chunk's body starts the load. The
    bound is each ask's own (round 4 F3), so a garage dwell after the Battle intent, whose ask first loads the chunk,
    does not spend the entry's while the load is younger than its deadline (below); a dwell that outlasts the deadline
    with the load still pending leaves the entry no wait. A battle rides the kernels when they land within its entry's
    bound or before the rest of its barrier ends; otherwise it is set up on the TypeScript and the load goes on. While
    it is pending, each later entry, a Battle Again included, waits up to 3 s of its own again, and the first battle set
    up after the load lands rides them. The load has one deadline of its own (round 5 Q1):
    `SOLO_KERNELS_LOAD_DEADLINE_MS` (15 s) from its start, the chunk's body at its first ask. No entry waits for the
    kernels past it: every entry after the deadline goes on at once, so a load that never answers costs only the entries
    within the deadline, each up to 3 s past the rest of its barrier (one that begins near the deadline goes on at it).
    The deadline ends the waits, not the load (round 5 review r1). The load's request (`src/world/soloWorldKernels.ts`)
    is held to the same deadline from its own start: one with no answer by then is aborted and the load fails, reported
    `timeout`, nothing installed, and every later battle runs on the TypeScript. So the rule above (a battle rides the
    kernels that land before the rest of its barrier ends) holds past the deadline only for a load whose request was
    answered within it. An answered load is never cut, however slow its body or late its compile: it is installed when
    it lands, and only then does `__SIM_KERNELS` say `wasm`. The deadline asks for the answer's headers within 15 s (a
    few hundred bytes behind what is already queued on the link), not the 117 KB module, so a slow link shared with the
    Battle intent's preload wave does not cut a live load; argued, not measured, since no receipt throttles a browser's
    link. A response whose body stalls after its headers is not aborted (on HTTP/2 it holds one stream, not a
    connection) and is reported only when it settles: until then its battles run on the TypeScript and `__SIM_KERNELS`
    stays unset, as for a kernels chunk that never lands (the one silent window, below). The wait never rejects: an
    installer or a failure report that throws leaves the TypeScript, and the entry goes on.
  - `?simKernels=wasm-check` runs both in a solo battle: the TypeScript drives, every answer of the kernels is compared,
    and `window.__SIM_KERNELS.check` counts the comparisons and mismatches.

## A fallback is reported

Every path keeps its fallback to the TypeScript, and every failed load is reported. One window stays silent: a solo load
whose request was answered within its deadline but whose body or compile never ends, or whose kernels chunk never lands,
has not failed, so its battles run on the TypeScript with `__SIM_KERNELS` unset until it settles (above).
`src/world/simKernelsStatus.ts` names the cause: `csp` (a Content Security Policy without `'wasm-unsafe-eval'`),
`http_<status>`, `network`, `timeout` (a solo load's request with no answer by its deadline, or a host's fetch without
the module's bytes by `HOST_KERNELS_FETCH_MS`), `compile`, `link`, `missing` (a server image without the binary),
`no_webassembly` or `error`. `off` means an opt-out.

- **Browser host:** its Worker's `ready` carries `kernels: { mode, reason }`.
- **Solo battle:** `soloBattleRuntime.ts` reports its load failure.
- **On the page,** for both of those, `src/world/simKernelsReport.ts`:
  - sets `window.__SIM_KERNELS`'s `mode`, `source` (`solo` / `host`) and `reason`;
  - on a fallback, sends one telemetry note a session, `kernels:<source>:<reason>` (the entry telemetry's `sim_kernels`);
  - in development, writes one `console.info` line. A production build writes nothing to the console.
- **LAN helper:** logs the reason (`world kernels did not load`, then `world kernels` with `kernels` and `reason`)
  and serves it in `/metrics` as `kernels`.

## Receipts

| Command | Proves |
|---|---|
| `cargo test -p cot-sim` | Every port against the TypeScript's golden vectors (`tools/port-golden-vectors.mjs`) |
| `cargo test -p cot-sim-wasm --lib` | The cross-call protocols, each on an instance's own state or, through the exports, on the instance's statics under `tests::exports()`: one such test at a time, and one that calls an export without it fails the run (round 4 E15; a native test links `terrain_height`) |
| `node src/world/wasmKernelProtocols.selftest.mjs` | The protocols on the committed package: its raw exports and the production seam |
| `node src/world/wasmKernelRefusals.selftest.mjs` | Each refusal named by the call it refused, asserted at the seam (a refused sample's NaN, a walk's missing entry, a replayed crater); a heap's start is the one it was given |
| `node tools/build-cot-sim-wasm.mjs --check` | The committed binary is the clean rebuild |
| `node tools/sim-kernel-manifest.selftest.mjs` (default tier) | The committed binary and every Rust source, Cargo file and toolchain pin match its manifest |
| `node src/world/wasmWorldKernels.selftest.mjs` (core suite) | Parity through the production seam, and a match's digests |
| `node tools/rust-kernel-tick-ab.mjs --map=<id> --bots=30` | Tick CPU against the TypeScript at 16 a side, digests every 300 ticks |
| `node tools/rust-kernel-tick-ab.mjs --map=<id> --bots=30 --base=scans` | The clearance scans' own share: A on the kernels less the scans |
| `node tools/mp-p2p-soak.mjs … --sim-kernels=wasm[@seats]` | The browser host Worker on the kernels, migrations included |
| `node tools/sim-determinism-audit.mjs --craters --kernels` | A match on the kernels against one on the TypeScript, the dug ground included |
| `node tools/solo-kernels-probe.mjs --check` | A solo battle in Chrome: `wasm-check`'s comparison, then the sim step A B B A |
| `node src/world/simKernelsReport.selftest.mjs`, `src/mp/host/hostStandby.selftest.mjs` | A fallback's reason named and reported: the host core's `ready` (`off`, a refused module's `http_404`, `wasm`) |
| `node src/game/soloKernelEntry.selftest.mjs` | The solo load's bounds (round 5 Q1): an entry waits up to 3 s of its own while the load is younger than its deadline, at once after it; a request with no answer is aborted (`timeout`); an answered load is installed however late |
| `node src/mp/host/hostKernelsFetch.selftest.mjs` | The host's fetch bound (round 5 Q1): a request with no answer, or a body that stalls, is aborted at `HOST_KERNELS_FETCH_MS`, and the boot goes live on the TypeScript, its `ready` `ts`/`timeout`; through the host runtime too, with an unprepared boot's room before its boot timer (`ELECTED_HOST_BOOT_MS`) |

Changing a ported TypeScript function means regenerating its vectors (`node tools/port-golden-vectors.mjs`) and
porting the change to its Rust file; `cargo test` fails until both agree.

## The default's gate (2026-10-25)

- Node, all 33 maps, 3,600 ticks at 16 a side: every digest identical at all 12 checks (`tools/rust-kernel-tick-ab.mjs`).
- Chrome, a 32-tank solo battle on every map under `wasm-check`: 111,372,312 comparisons, 0 mismatches
  (`tools/solo-kernels-probe.mjs --check-only --maps=all`).

## Measured

- The authority (server, multiplayer host): 16 a side, 3,600 ticks, digests identical at every check: Verdant −22 to
  −24 %, Urban −21 %, Mars −18 % of the tick's CPU (the decision's kernel measurements, 2026-10-25).
- A solo battle in Chrome, 16 a side, pairs of 20 s runs (profiled): Verdant (four pairs) the sim step 2.57 → 2.37 ms
  a tick (−7.5 %), the support solve −25 %; Urban (three pairs) 2.51 → 2.26 ms (−10 %), the support solve −15 %. Only
  the support rides the kernels there; the rendered world's grids and rays, the AI and the shells stay TypeScript.
  `wasm-check` over 20 s: 5.9 million comparisons on Verdant and 5.8 million on Urban, none differ.
- The bots' clearance walk alone (`--base=scans`: the kernels with it against the kernels without it), 16 a side,
  digests identical: Verdant −1.6 %, Urban −1.2 %, Mars −2.4 % of the tick's CPU. A first version that returned every
  match in the box cost Urban 6.6 %: the TypeScript loops stop at the first solid, and the walk keeps that.
