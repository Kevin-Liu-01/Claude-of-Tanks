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

Round 2 interim (2026-08-08, research gate OPEN — no fix landed): the
in-battle compile leak is NOT (a) spotting reveals or kills (revealprobe:
force-reveal all 13 enemies + wreck one = 0 births), NOT (b) camera/scope/
prop-break (action bisect: 0 births each), NOT (c) fx.resetAll disposal
(fxcycle probe: diedAtReset=0), NOT (d) missing warm coverage of the live
shell pipeline (a boot-time REAL warm shell — mid-flight + impact warm
frames, both caliber classes — changed nothing; reverted), NOT (e) caliber
class alone (m1a2 births like the Bradley). PROVEN SHAPE (fxcycle): every
shot/impact births programs with NEVER-REPEATING cacheKeys (shot1 +3,
shot2 +7, zero re-links) on fx-group MeshBasicMaterials + camo-kit Decor_*
mats — per-instance cacheKey variance, unwarmable by definition. RESOLVED (same
date): cacheKey nearest-neighbor diff — every born key is its warmed
neighbor MINUS the '|burn-r6' customProgramCacheKey suffix, i.e. unhooked
transient clones. Material.clone stack capture named the cloner verbatim:
**src/game/garageDressing.js buildBayA/buildBayB via pumpGarageDressing —
the garage workshop-dressing idle pump has NO battle gate**, so
requestIdleCallback keeps landing 50-170 ms repair-bay tank bakes (with
fresh unhooked material clones + program links) in battle frame gaps.
Combat correlation was coincidence; the same pump explains part of the
garage_idle churn. FIX: pumpGarageDressing defers while
game.phase === 'battle' (enterGarage already force-finishes via
ensureBuilt, so the workshop is never half-dressed). RESULT (clean-window
double-Lap, load 12): fire red -> GREEN both runs (100% ltf, prog+0);
look red-both -> green/106ms-marginal-one-run (no longer confirmed-
failing); fight worst halved 407 -> 152/176 ms, still red (+12/16 progs =
kill-time unhooked clones, round-3 lead); battle_load 25 -> 17 s side
benefit; garage stations unchanged (pump correctly still runs there).
steady-state shots: births 7 -> 1 (fxcycle). 4+1 selftest suites green,
6/6 pump-adjacent views green. LANDED.

| round | date | worst station (baseline) | attribution (evidence) | fix | result | landed |
|---|---|---|---|---|---|---|
| 0 (baseline) | 2026-08-08 | 6/8 FAIL — tank_switch worst 4890 ms (+142 programs), battle_load 26.5 s (+236 MB heap, worst 2827 ms), fire 435 ms, fight 276 ms, look 217 ms, garage_idle 5.6 >100ms/10s (+35 prog +55 MB while "idle"); drive + reveals clean | — (baseline only) | — | scorecard: scratchpad lap-baseline-1.json | harness landed |
| 1 | 2026-08-08 | Gate-1 double-run fails: garage_idle, tank_switch, battle_load, fight. In-battle target = FIGHT (worst 212/323 ms, prog +15 both runs; fire + look passed a run each — baseline fire 435 ms was load contamination) | fightprof (real BATTLE-click entry, 20 s window): 11 programs compile MID-FIGHT — named leak TankWreckShadowProxy (world-prop wreck shadow caster, props.js) + 2× cacheKey-5009 CSM-standard monsters + 8 anonymous classes; compile family getParameters 592 + getProgram 455 + getProgramParameter 428 + (program) 2370 ms over 20 s, worst task 207 ms. Root cause: renderer.compile never builds shadow-DEPTH variant programs — each caster class links on its first shadow-pass render, i.e. when the player first drives it into a CSM cascade mid-fight. (Debug-path entry without loading warms shows the same storm at +33 programs incl. camo-r7 Decor_* kit mats — loading path covers those; the depth-variant class is the real-path residue.) | warmShadowPrograms(): one warm frame behind the loading screen with the far cascade's shadow camera stretched map-wide (existing sun light — adding a light would change light count and recompile every lit program, kill-cam warm lesson) | PARTIAL — TankWreckShadowProxy class provably eliminated from the mid-fight leak (fightprof re-run), fight prog delta run-B +3 (was +15/+15) BUT budget still red both verify runs (worst 407/102 ms; the per-run-variable REVEAL-TIME variant compiles dominate — they hit fire in verify-B too: +13 prog, 568 ms). No regression: drive clean, all 19 living screenshot views green, 5 selftest suites green. Scorecards: r1-verify-a/b.json | landed (kept: correct, evidenced, zero-regression). ROUND 2 TARGET: reveal-time variant compiles (Decor_* kit mats + cacheKey-5009 CSM monsters) — suspect a material define flip on spotting reveal / first visible render; instrument WHICH define differs by diffing cacheKeys of a warmed vs revealed material |
