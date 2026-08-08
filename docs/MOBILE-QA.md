# MOBILE QA — sustained-performance round protocol + ledger

Owner directive (2026-08-07): iterate on mobile quality with autonomous
rounds until the budgets hold. First target: IN-BATTLE SUSTAINED
(look/drive/fire/fight). This file is the round contract — every loop
iteration follows it verbatim — and the ledger of what each round found,
changed, and measured.

## Why the iOS simulator is NOT the perf rig

The QA iPhone 16 simulator renders on SOFTWARE GL: absolute FPS there is
meaningless (lit+shadow probe FAILs by design, boots take ~2.5 min). What
transfers to real iPhones is MAIN-THREAD work: long tasks, GC, shader
compiles, camo canvas bakes, texture uploads. So:

- **Rig A (every round): headless Chrome, iPhone emulation** — runs the Lap
  (tools/mobilelap.mjs), produces the scorecard. This is the pass/fail rig.
- **Rig B (per landing): the QA simulator** — functional/visual mobile QA
  (touch HUD, safe areas, layout, Safari-specific breakage) via the QA
  server on :7777, panel attached so the owner can watch. Never FPS.
- **Real felt-FPS**: the owner's phone against the QA server. We report
  main-thread deltas; the phone is the final judge.

## The Lap (tools/mobilelap.mjs)

Deterministic scripted session, real-time (NEVER fastForward — long tasks
only exist in real time), one JSON scorecard per run. Stations:

| station | drive | budget (mobile tier) |
|---|---|---|
| garage_idle | 10 s idle in garage | long-task-free frames > 95% |
| tank_switch | 6 carousel switches | worst task < 250 ms |
| battle_load | real BATTLE click → controllable | < 8 s wall |
| look | 12 s aimpad touch drags | zero tasks > 100 ms / 10 s |
| drive | 15 s virtual-stick driving | zero tasks > 100 ms / 10 s |
| fire | 8 s Bradley mag dump (touch hold) | zero tasks > 100 ms / 10 s |
| fight | 20 s drive-at-enemy + fire; records tank:spotted | zero tasks > 100 ms / 10 s; reveal worst task < 50 ms |
| rematch | second battle start | < 8 s wall |

Per station: long tasks (count, worst, list), rAF gap p95/max, long-task-
free frame %, sim-time delta (battle stations — load throttling makes
wall-clock counts lie; see perf-probe hygiene), renderer.info deltas
(programs / textures / geometries / draw calls), JS heap delta.

## Round protocol (the gates are the contract)

0. **Sync**: `git fetch && git rebase origin/main` on the working branch —
   the parallel orchestrator lands perf work continuously; never measure a
   stale base. Read the last ledger row.
1. **Measure gate**: check foreign load (`ps aux | sort -rk3 | head`,
   `uptime`). If 1-min load per-core is saturated by foreign Chromes, WAIT
   (Monitor on load) rather than measure garbage. Run the Lap twice; a
   station only counts as failing if it fails BOTH runs.
2. **Research gate** (no fix without this): for the worst failing station,
   produce attribution WITH EVIDENCE before touching code — CDP CPU profile
   (Profiler, 0.2 ms sampling) sliced to the station window, long-task
   sources, program/texture/bake deltas. The gate artifact is one sentence
   with numbers ("fight worst task 340 ms: 61% resolveShellHit armor rays,
   22% fx spawn") written into the ledger row BEFORE the fix. A round that
   cannot attribute cleanly STOPS and records why — it does not guess.
3. **Fix**: smallest change that targets the attributed cost. One cause per
   round unless trivially co-located.
4. **Verify gate**: Lap ×2 again — target station improves, NO other
   station regresses past budget, `npm test` green, screenshot harness
   green on living views, afvprobe/reviveprobe/autofireprobe green when the
   touched code overlaps their contracts.
5. **Land**: commit (numbers in the message), cherry-pick → push to main
   (tight fetch→push window; expect one rejection race), fast-forward the
   live tree IF clean + no index.lock, restart the QA server (:7777, it
   never watches files), drop QA-sim Safari cache
   (`simctl terminate <udid> com.apple.mobilesafari`).
6. **Ledger**: append the round row below. Every ~3 rounds, run Rig B and
   attach station screenshots for the owner.

Round hygiene: budgets are the ratified bar (owner 2026-08-07); loosening
one requires an owner decision, never a round's own judgment. If two
consecutive rounds attribute the same cost to code the parallel
orchestrator owns (vehicle builders, world gen), file a chip instead of
fighting over the files.

## Budgets (ratified 2026-08-07)

tank_switch < 250 ms worst · battle_load/rematch < 8 s ·
look/drive/fire/fight zero >100 ms tasks per 10 s window ·
spot reveal < 50 ms · garage_idle > 95% clean frames

## Ledger

| round | date | worst station (baseline) | attribution (evidence) | fix | result | landed |
|---|---|---|---|---|---|---|
| 0 (baseline) | 2026-08-08 | 6/8 FAIL — tank_switch worst 4890 ms (+142 programs), battle_load 26.5 s (+236 MB heap, worst 2827 ms), fire 435 ms, fight 276 ms, look 217 ms, garage_idle 5.6 >100ms/10s (+35 prog +55 MB while "idle"); drive + reveals clean | — (baseline only) | — | scorecard: scratchpad lap-baseline-1.json | harness landed |
