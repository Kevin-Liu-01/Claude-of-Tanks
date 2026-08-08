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

## Rig B pass 1 (2026-08-08, round 3 — QA iPhone 16 sim, portrait, :7777)

Functional: boot ✓ (tier=mobile dpr=3, lit+shadow=FAIL -> shadows-off
rescue, expected on software GL) · garage renders + carousel/tabs work ✓ ·
battle loads ✓ · touch HUD complete and thumb-reachable in portrait, above
Safari's bar (safe areas ✓) · FIRE hold works (ammo 24 -> 23, MBT cadence)
· swipe-to-aim works · audio live · battle sim runs (score/clock tick).
FINDINGS (visual/UX, need rounds): (1) enemy NAMEPLATES overlap into an
unreadable red/green smear at spawn sightlines in portrait FOV — needs
range-based declutter/fade or collision layout; (2) the COT DIAG overlay
persists after boot and covers the first garage carousel cards — should
auto-hide post-splash; (3) the battlefield picker is absent in portrait
garage (camo panel only) — confirm intended vs layout truncation.

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
| 3 | 2026-08-08 | fight residual: worst 152-178 ms, ~0.5 >100ms/10s (budget 0), prog +13/16 mid-fight; desktop-viewport profile shows compile family still top real cost ((program) 2.68 s / 20 s) | Kill-clone theory FALSIFIED (slayEnemies under clone logger = 0 clones — setDestroyed swaps to shared burnt, no clones). Pedestal prefetch properly phase-gated (not the leak). Born inventory (real path, 20 s fight): 2x anon#1301 (suspect: shadow-depth RGBA-packing variants for fx meshes absent at warm time), Decor_mesh#313 (hooked-length kit-decor variant on a battle tank), ~12 anon #250-313 incl. same-length pairs. Source system unidentified — Gate 2 NOT satisfied for a code fix; no change landed | none (protocol: no fix without clean attribution) | Rig B pass 1 DONE (see section above: 3 UX findings). Round 4 instrument: bind born programs to owning materials via renderer.properties INSIDE the fight probe (attribute() at capture time), plus castShadow census on fx meshes | docs-only |
| 4 | 2026-08-08 | fight residual (worst ~160 ms, ~0.5 >100ms/10s, prog +13/16) | Owner-binding probe (renderer.properties at capture): TWO named sources. (a) the shared fx_impactDecals MeshBasicMaterial program (#246) is born PER BATTLE at the first live decal stamp — the boot volley warmed it once, but battle entry re-links it (bound owners: fx_impactDecals nodes under challenger2/t90a/chieftain5/t72b3m/m48); (b) hooked (|burn-r6) MeshStandardMaterial variants on m48>rig_turret and challenger2>rig_hull LOD meshes — STRAGGLER GLB swaps landing past the 15 s drain deadline link on first render mid-battle (design tradeoff, round-5 candidate: compile straggler subtrees before making them visible in the swap pipeline). fx casts no shadows (census 0/23) — the #1301 depth-variant suspicion for fx was wrong | (a) only: per-battle decal warm (stamp -> object-form compile -> clearVehicleDecals) | LANDED — decal-bound born owners 0 (falsified); fight births +13/16 -> +5/+5, exactly one >100ms link per 20 s left (straggler-GLB family, round 5); look/fire/drive GREEN both runs; 5 suites + 4 views green | landed |
| 5 | 2026-08-08 | fight residual: exactly one >100 ms link event per 20 s (worst 188-223 ms), prog +5, born owners = GLB tanks' LOD>Mesh nodes (challenger2/t72b3m/m48) | Code-evidence attribution: the swap pipeline's precompileStaged uses renderer.compile(object,...) which SKIPS visible===false subtrees (three projectObject early-out) — a staged GLB's non-active LOD levels never compile; prewarmBurnStaged also skips !o.visible meshes. main.js's own warm passes solved this with a force-visible window (perf-r2d comment); the swap pipeline never got it. Straggler swaps (past the 15 s drain) commit mid-battle -> first LOD flip links the never-compiled variant (~150-220 ms) | modelLoader.js (staged pipeline) + main.js compileHiddenVariantsSteps: force-visible compile windows — the old 'traverses regardless of visibility' claim was FALSE (three projectObject skips hidden subtrees), so every tank's non-active LOD levels never compiled anywhere | LANDED — LOD-bound born owners 7 -> 3; fight worst 188/223 -> 134/170 ms (still 0.5/10s: remaining families enumerated = straggler post-commit camo repaint (challenger2), post-swap kit re-bolt (k2 decor LOD), first de-track gearThrownRibbon (amx30b2), fx pool growth — round-6 targets); look/drive/fire GREEN both runs; 5 suites + 4 views | landed |
| 6 | 2026-08-08 | fight residual micro-families (r5 enumeration); target (c) first de-track ribbon spawn — chosen because (a)/(b) live in modelLoader/camo territory (r5 already landed there; hygiene rule) and (c) has the cleanest code evidence | tankFactory buildThrownKit() is a lazy per-visual latch — the thrown-track ribbon geometry+materials build on the FIRST setBroken(true), i.e. mid-fight at the first live de-track (r5 born owner: amx30b2>gearThrownRibbon). The loading wreck-dance never toggles tracks, so the kit (and its program) cannot exist for the compile passes | main.js loading dance: one-frame setTrackState broken->ok toggle per fielded visual | LANDED — ribbon-bound born owners 0; fight worst 134/170 -> 112/175 ms at 0.5/10s; look/drive/fire GREEN third consecutive round; remaining families are BOTH orchestrator territory (modelLoader straggler post-commit repaint + camoKit post-swap re-bolt) -> hygiene rule: chip filed, loop moves to battle_load/tank_switch/garage_idle | landed |
| 7 | 2026-08-08 | battle_load 17-20 s vs 8 s budget | Stage telemetry (__BATTLE_LOAD across r4-r6 scorecards): world (cold createMapAsync) 7.1-9.0 s + camo bakes 3.6-4.6 s + wreck/compile warms 1.1-1.3 s, SEQUENTIAL and main-thread-bound; warm entries already pass (rematch 2.3 s). Easy fixes falsified by analysis: interleaving chunked CPU-bound stages saves no wall time without workers; garage-dwell world prefetch would regress garage_idle (world chunks are 100-300 ms tasks) | NONE — OWNER DECISION REQUIRED: (a) redefine the budget as warm-entry (cold first battle accepted at ~13-17 s behind the loading screen), (b) authorize worker-offload surgery for world gen/bakes (big, multi-round), or (c) authorize garage-dwell prefetch accepting garage_idle regression | Rig B quick pass: r5+r6 build boots clean on the sim (no DIAG overlay on splash) | docs-only |
| 8 | 2026-08-08 | tank_switch worst 286-366 ms (Lap); switchprof: every switch 3-7 tasks of 50-250 ms; SEPv3 selection spike 632 ms with prog+91 in ONE task | switchprof (6 timed switches under profiler): (1) selection-time program compile storm — getProgramParameter 1828 ms + (program) 821 ms across 6 switches, worst = never-before-selected specs compiling their whole subtree in one slice (SEPv3 +91 programs/632 ms); (2) camo bakes getImageData 1804 ms per-selection; (3) pedestal floor-fit raycasts 880 ms (intersectTriangle/robustFloorY). Pedestal prefetch only reaches +-1 neighbors and a 1.4 s browse cadence outruns it | ATTEMPTED + REVERTED: chunked per-mesh renderer.compile of the hidden cold-built hero made it WORSE (SEPv3 673 ms/+160 programs vs 632/+91 — per-mesh compile against a hidden root DUPLICATES program work rather than pre-linking the reveal set; switch worst regressed to 389/396). Attribution stands; next angle: warm programs at PREFETCH time (the +-1 neighbor build path) where the visual is built anyway, or investigate why compile-produced cacheKeys mismatch the reveal render | attribution landed; fix reverted per gate (target must improve) | docs-only |
| 9 | 2026-08-08 | tank_switch worst 286-396 ms (Lap); switchprof waves: the big spike MOVES between specs per run (r8 SEPv3 632, r9 SEPv2 1314 ms/+201 progs) and lands 1.3-2.0 s AFTER the click | Wave-timing probe: the budget-breaker is NOT the reveal — it is the pedestal GLB swap pipeline's compileMesh phase landing post-reveal: its slice loop has a >=4-mesh FLOOR that ignores the 12 ms time budget (modelLoader.js ~2872: while (mi<len && (batched<4 || now-tc0<12))) — four monster-material hero meshes in one slice = 600-1300 ms task. Same pipeline as the chipped fight families; SECOND consecutive orchestrator-territory attribution | NONE per hygiene rule — chipped (see task chip: compileMesh floor + upgrade-wave). tank_switch joins fight in the PARKED set | switch cadence budget unreachable until the swap pipeline slice floor is fixed in the orchestrator lane | docs-only |
| 10 | 2026-08-08 | garage_idle ltf 44-73% vs >95%, worst idle task 650-1134 ms | Idle profiler (14 s, 1 ms sampling): the monsters (609+1130 ms) coincide with a +157-program wave ~5.5 s in — the BOOT WARM pipeline's monolithic generator steps running on the post-ready idle pump: renderer.compile(scene,camera) as ONE slice, and compileHiddenVariantsSteps compiling a WHOLE TANK (destroyed+live, force-visible since r5 — heavier) per slice. Compile family dominates idle self-time (getProgramParameter 2040 ms + (program) 845 + getParameters 452 over 14 s). Early tex+6 waves = thumbnail baker (benign 100-150 ms class) | Split the monolithic steps finer in main.js (same compile calls, same variants — r8's hidden-state trap does not apply): scene-wide compile chunked per top-level child with yields; compileHiddenVariantsSteps yields between the destroyed-state and live-state compiles per tank | pending | pending |
| 1 | 2026-08-08 | Gate-1 double-run fails: garage_idle, tank_switch, battle_load, fight. In-battle target = FIGHT (worst 212/323 ms, prog +15 both runs; fire + look passed a run each — baseline fire 435 ms was load contamination) | fightprof (real BATTLE-click entry, 20 s window): 11 programs compile MID-FIGHT — named leak TankWreckShadowProxy (world-prop wreck shadow caster, props.js) + 2× cacheKey-5009 CSM-standard monsters + 8 anonymous classes; compile family getParameters 592 + getProgram 455 + getProgramParameter 428 + (program) 2370 ms over 20 s, worst task 207 ms. Root cause: renderer.compile never builds shadow-DEPTH variant programs — each caster class links on its first shadow-pass render, i.e. when the player first drives it into a CSM cascade mid-fight. (Debug-path entry without loading warms shows the same storm at +33 programs incl. camo-r7 Decor_* kit mats — loading path covers those; the depth-variant class is the real-path residue.) | warmShadowPrograms(): one warm frame behind the loading screen with the far cascade's shadow camera stretched map-wide (existing sun light — adding a light would change light count and recompile every lit program, kill-cam warm lesson) | PARTIAL — TankWreckShadowProxy class provably eliminated from the mid-fight leak (fightprof re-run), fight prog delta run-B +3 (was +15/+15) BUT budget still red both verify runs (worst 407/102 ms; the per-run-variable REVEAL-TIME variant compiles dominate — they hit fire in verify-B too: +13 prog, 568 ms). No regression: drive clean, all 19 living screenshot views green, 5 selftest suites green. Scorecards: r1-verify-a/b.json | landed (kept: correct, evidenced, zero-regression). ROUND 2 TARGET: reveal-time variant compiles (Decor_* kit mats + cacheKey-5009 CSM monsters) — suspect a material define flip on spotting reveal / first visible render; instrument WHICH define differs by diffing cacheKeys of a warmed vs revealed material |

NOTE (r5 Gate-5): live-tree ff DEFERRED — the orchestrator session has
uncommitted modelLoader.js changes (the same file r5 touches); ff aborted
safely per protocol. r5 is on origin/main (7327340); re-run the ff + QA
server restart at the next round Gate-5 once their tree is clean. Watch
for a rebase conflict on their side; r5 diffs are additive force-visible
windows in prewarmBurnStaged/precompileStaged.
