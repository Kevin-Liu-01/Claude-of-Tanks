# Garage switch profile — FSP-01 (2026-09-25)

Owner ruling (2026-09-25): FSP-01 yes — measure and reduce excessive
construction cost; eliminate the reported tank-switch stalls. This document is
the causal profile, the three named causes with evidence, the two reductions
that landed with their A/B numbers, and what stays open. Every number below was
produced by `tools/garage-switch-probe.mjs --profile` on a production preview
(`vite build` output served by `vite preview`) of the named tree; the tables
are pasted from the tool's own markdown output.

## Method

- `node tools/garage-switch-probe.mjs --profile --dist <built dir>
  [--sequence fsp01|walk|garage|receipt|id,…] [--cpuprofile id,…] [--out report.json]
  [--md table.md]`. Without `--dist` an isolated Vite dev server serves the tree
  (module transforms inflate cold rows; the receipt uses that mode and gates
  warm rows only).
- Headless Chrome 151, ANGLE Metal on an Apple M5 Max, 1440×900 at DPR 1,
  desktop tier, no CPU throttle, 2.5 s dwell between selections (the neighbour
  prefetch fires after 1.8 s, so idle work is part of the system under test).
- Selection route: `__DEBUG.selectGarageTank` = `garage.setSelected`, the real
  card-click path (stats card, camo prewarm, `onSelect` → `pedestal.set`). A
  cross-nation entry also switches the visible rail, which a player does with
  a chip click first; that DOM work is inside these rows.
- Per switch: `PerformanceObserver` long tasks in the switch window (call →
  reveal + two rAFs) and the settle window (the dwell); the runtime's
  `window.__GARAGE_SWITCH` stage spans (family chunk import, paint, build with
  the factory's core/tail interval receipts, stage, compile/link wait);
  `renderer.info` program, geometry and texture deltas; the names of programs
  created; request→reveal (8 ms external poll of `pedestalVisual`); the first
  rAF after reveal ("painted") and the following one ("presented"); the worst
  rAF interval; optionally a CDP sampling profile per named switch.
- Classes: **cold** = first construction of that hull in the session;
  **rebuild** = revisit after LRU eviction; **warm** = pedestal cache hit.
- `fsp01` sequence (22 switches): `t90a_burlak, m1a2, leo2a5_a5nl, t90m, k2`;
  the twelve heaviest playable hulls by stored high-LOD triangles in
  `docs/history/research/fleet-continuation-20260921-census.csv`
  (`m1a2_sepv2_x, m1a2_sepv3_x, ua_m1a1, leo2a6_ua, ua_m1a1_x, strv122_x,
  m1a2_tusk_x, m1a2_sepv3, merkava3d, m1a2_tusk, leclerc_classic_x, kf51` —
  `isu152`/`isu122s` are census rows without a Garage card); the five again.
  `walk` (12 switches): six `@next` then six `@prev` through the selected
  nation from the default hero (USA rail), resolved from
  `garage.getNeighborIds(1)` at switch time.
- Host: shared and loaded (load average 10–170 on 18 cores during these runs;
  another lane's fleet builders and headless browsers were running). Long
  tasks, program deltas and the stage receipts are the evidence; wall-clock
  rows are context. The paint stage is worker wall time and swings ±150 ms for
  the same hull between runs; main-thread build work is stable within ±10 ms.
- Percentiles are nearest-rank over the rows of a class (p50 / p95 / max).

## Baseline

`origin/main` `1179f1013`, `fsp01`, production preview. The diagnostics-only
twin `9b5563d61` (stage trace and factory tail receipts, no construction
change) attributes the same behaviour.

| class | n | reveal | painted | presented | max gap | LT max | LT total | LT count | settle LT total | Δprograms |
|---|--:|---|---|---|---|---|---|---|---|---|
| cold (1179f1013) | 17 | 218 / 326 / 326 | 246 / 336 / 336 | 296 / 1445 / 1445 | 100 / 1109 / 1109 | 65 / 1104 / 1104 | 65 / 1189 / 1189 | 1 / 3 / 3 | 0 / 132 / 132 | 0 / 8 / 8 |
| rebuild (1179f1013) | 5 | 218 / 274 / 274 | 230 / 288 / 288 | 246 / 304 / 304 | 58 / 83 / 83 | 0 / 58 / 58 | 0 / 58 / 58 | 0 / 1 / 1 | 0 / 0 / 0 | 0 / 2 / 2 |
| cold (9b5563d61) | 17 | 234 / 306 / 306 | 245 / 1200 / 1200 | 281 / 1217 / 1217 | 92 / 900 / 900 | 75 / 903 / 903 | 78 / 1017 / 1017 | 1 / 3 / 3 | 0 / 207 / 207 | 0 / 8 / 8 |
| rebuild (9b5563d61) | 5 | 168 / 193 / 193 | 180 / 205 / 205 | 196 / 221 / 221 | 33 / 58 / 58 | 0 / 50 / 50 | 0 / 50 / 50 | 0 / 1 / 1 | 0 / 0 / 0 | 0 / 2 / 2 |

"Painted" is the first rAF after reveal and lands on either side of the
stalled frame depending on where in the frame the reveal happened (m1a2:
painted 285 / presented 1085 on `1179f1013`, painted 792 / presented 809 on
`9b5563d61`); "presented" (the following rAF) always contains the stall and
is the conservative time-to-first-painted-frame used below.

Stages of the 22 built switches on `9b5563d61` (ms; `build*` from the runtime,
`core.*` / `tail.*` from the factory's interval receipts):

| stage | p50 / p95 / max |
|---|---|
| import (family chunk, marking seats, anatomy, fills) | 2.0 / 82.2 / 112.0 |
| paint (shared texture bake, worker) | 80.5 / 138.9 / 165.9 |
| build work (sum of steps) | 70.1 / 138.7 / 139.4 |
| build checkpoints | 199 / 283 / 316 |
| build max step | 47.6 / 81.6 / 117.6 |
| core.authored (profile builder call) | 30.3 / 61.7 / 95.6 |
| core.bindMerge | 8.2 / 13.1 / 13.9 |
| core.assembly (ERA, decals, proxies, contact) | 5.1 / 10.1 / 19.5 |
| tail.decor (sliced) | 27.6 / 47.3 / 100.4 |
| tail.fills / normalize / batch / finalize / shadow batch | ≤ 2.0 / ≤ 0.3 / ≤ 5.2 / ≤ 0.3 / ≤ 0.1 |
| compile (submission + two frames) | 23.0 / 36.1 / 44.0 |

## The three causes

1. **The first frame with the new hero blocked on its shader links.** Every
   row whose switch created programs carried one task of 258–1104 ms that
   started exactly at `painted` (m1a2 Δprograms +7 → 801 ms, merkava3d +8 →
   1104 ms, ua_m1a1 +6 → 349, leo2a5_a5nl +3 → 344, t90a_burlak +4 → 258);
   every row with Δprograms ≤ 0 stayed ≤ 70 ms. The dev-server CPU profile
   put the self time in `getProgramParameter` (516 ms for m1a2, 919 ms for
   merkava3d) plus native `(program)` time (447 / 147 ms). Mechanism:
   `src/game/garagePedestalRuntime.ts` `warmPrograms` submitted
   `forwardProgramWarm.compile(root)` (`src/engine/programWarm.ts`
   `compileForRenderTarget` → `renderer.compile`, 20–44 ms) and waited two
   frames; three r185 with `KHR_parallel_shader_compile` defers completion
   (`WebGLProgram.isReady`, `node_modules/three/build/three.module.js:7226`),
   so the first use blocked in `onFirstUse` (`:7094`, link-status and info-log
   reads) and `useProgram`. The programs are forward variants of the vehicle
   materials (`cot:gunmetal`, `cot:spare-track-steel`, `cot:track-band-left`,
   `cot:gear-shadow`, `cot:canvas`, `cot:wheel-paint`, `cot:fitting-paint`,
   `cot:wood`, `cot:optic-glass`, `cot:tire-rubber`, `cot:armor-paint`,
   `Decor_net`); eviction disposes a hero's materials and three deletes a
   program at zero use, so later switches re-link the same variants
   (Δprograms −5 … +8 across the sequence).
2. **One synchronous core construction step of 47.6 / 81.6 / 117.6 ms.** In
   `src/vehicles/tankFactoryCore.ts` `createTankOwnedSteps` the authored
   builder call (`Reflect.apply(builder, undefined, [P])`, line 8086), the
   bucket bind/merge and the assembly run before the first `yield`
   (line 10443); decoration after it is already sliced into 199–316
   checkpoints. This is the 50–130 ms task at ~80–100 ms after the click on
   every built switch (`m1a2_sepv2_x`: authored 95.6 ms, task 127 ms).
3. **Revisits rebuilt and adjacent cards were cold.** The desktop pedestal LRU
   held four visuals (`src/engine/resourceLifetime.ts`), so browsing five or
   more hulls rebuilt every revisit (the five `rebuild` rows: reveal 218 / 274
   ms, paint + build + links again), and stepping to the next card paid the
   whole pipeline (walk on `1179f1013`: 7 cold + 2 rebuild of 12 adjacent
   switches, cold reveal 134 / 217 ms).

Secondary: the first family chunk import costs 82–114 ms wall on a cold family
(async, not a main-thread block); the paint stage is 80 / 139 / 166 ms of
worker wall time (the main thread only pays the commit); settle-window tasks of
up to 207 ms (thumbnails, neighbour prefetch) follow some reveals.

## Reductions

### R1 — prepare the links before reveal (`ac0049ac8`)

The pedestal runtime takes a `prepareProgramSteps` port; `main.ts` wires
`forwardProgramWarm.prepareSceneSteps({ visibleRoot: root, strict: true,
sliceMs: 4 })`. The runtime submits, polls `COMPLETION_STATUS_KHR` one bounded
slice per frame while the outgoing hero stays visible, reflects uniforms, and
only then reveals; a stale selection stops the wait and closes the iterator.
The link receipt lives in the switch record.

A/B `fsp01`, `9b5563d61` → `ac0049ac8`:

| class | metric | before | after |
|---|---|---|---|
| cold | worst long task p50 / p95 / max | 75 / 903 / 903 | 55 / 123 / 123 |
| cold | presented p50 / p95 / max | 281 / 1217 / 1217 | 279 / 754 / 754 |
| cold | worst rAF gap p95 | 900 | 309 |
| cold | reveal p50 / p95 | 234 / 306 | 253 / 728 |
| rebuild | worst long task p95 | 50 | 107 |
| rebuild | presented p95 | 221 | 381 |

Link wait 23.8 / 93.2 / 467.3 ms (p50 / p95 / max) over 22 switches, 1–29
frames; completion queries cost ≤ 0.2 ms each (the old "status reads block for
hundreds of milliseconds" caveat did not reproduce on this driver); uniform
reflection ≤ 7.3 ms. Reveal moves later by the link wait (kf51: two programs
took 29 frames in the background with no long task, versus a 232 ms block
before), which is the intended trade: the outgoing hero keeps rendering.

### R2 — build the adjacent cards ahead; desktop LRU six (this round)

After the neighbour texture bakes, the preloader asks the runtime to construct
`garage.getNeighborIds(1)` under the same quiet-window lease and cancellation:
sliced build, strict link preparation, parked hidden and detached, recorded as
a `speculative` switch record, evicted first, never displacing a hero the
player has seen; selecting that hull during its wait keeps the wait alive and
reveals through the cached path. Desktop residency is six (four recently shown
heroes plus the two idle-built neighbours); mobile stays at two with no
speculation.

A/B `walk` (adjacent navigation), `1179f1013` → R2:

| class | n before → after | reveal p50 / p95 | presented p50 / p95 | worst long task p95 |
|---|---|---|---|---|
| warm | 3 → 10 | 5 / 6 → 6 / 7 | 28 / 43 → 35 / 47 | 0 → 0 |
| cold | 7 → 2 | 134 / 217 → 107 / 187 | 161 / 241 → 130 / 213 | 73 → 66 |
| rebuild | 2 → 0 | 118 / 125 → – | 146 / 154 → – | 87 → – |

The two remaining cold rows are the sixth forward card (its speculative build
had not finished inside the 2.5 s dwell) and the last backward card. On
`fsp01` (cross-nation jumps, no adjacent hits by design) R2 measured cold
worst long task p95 123 → 89 ms and presented p95 754 → 483 ms; build work is
unchanged and the paint-stage swings are host load. Cost: at most one
speculative core step (≤ ~100 ms) inside a quiet window; a click that lands
during it waits for that step.

## Before / after

| switch class | metric | base `1179f1013` | R1 `ac0049ac8` | R2 |
|---|---|---|---|---|
| cold, `fsp01` | worst long task p95 (ms) | 1104 (903 on the instrumented twin) | 123 | 89 |
| cold, `fsp01` | first painted frame, presented p95 (ms) | 1445 (1217) | 754 | 483 |
| rebuild, `fsp01` | worst long task p95 / presented p95 | 58 / 304 | 107 / 381 | 78 / 265 |
| warm, `walk` | switches of 12 / reveal p95 / presented p95 | 3 / 6 / 43 | – | 10 / 7 / 47 |
| cold, `walk` | switches of 12 / worst long task p95 / presented p95 | 7 / 73 / 241 | – | 2 / 66 / 213 |

Receipt (`tools/garage-switch-probe.selftest.mjs`, post group, exclusive CPU,
isolated dev server): warm switches between the five exhibit vehicles must
not block the main thread longer than 120 ms (p95 of the worst long task) and
must paint within 250 ms (p95 of the first rAF after reveal); cold switches
are reported only. First run on the R2 tree under host load 55–170: 8 warm
switches, p95 worst long task 0 ms, p95 painted 46.8 ms; 5 cold switches
p95 worst long task 63 ms.

Geometry and appearance are untouched: `tankFactoryStaging.selftest`
(exact synchronous/sliced equality, 4,296 checks), `appearanceAudit`,
`battleGeometrySharing` and `presentation-centering --check` pass on the
final tree; the factory change is a timestamp record in `userData`.

## Open

- The core step (authored builder + bind/merge + assembly, 45–118 ms) still
  blocks once per built switch; slicing it needs generator-based profile
  builders or a worker construction path.
- Speculation covers the two adjacent cards; cross-nation jumps and the twelve
  heavy hulls stay cold (reveal ~210 ms p50, worst long task ≤ ~90 ms).
- Program variants still relink after evictions (link wait p95 93 ms of a cold
  reveal); a session-wide retainer for the `cot:*` variant set would remove it.
- Mobile tier: unchanged (no link preparation, no speculation, LRU two).
