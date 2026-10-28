# Battle spikes: the census, the causes and the budget

The owner's ask (2026-10-25, the PERF-LOCKDOWN program, workstream 1): "no more lag spikes, beautiful gameplay, all
accelerated". This page is the method and the record. It covers:

- the census of full battles;
- how each long frame and long task is attributed;
- what was found and fixed, with before/after counts;
- the spike-budget receipt;
- the measured case for (or against) moving the simulation and bots into a Worker.

## The census

`node tools/battle-spike-census.mjs` plays full solo battles on the production build (`npm run build` first):

- The bots fight. The player drives (W held, A/D alternating) and fires whenever reloaded (`forceFire`). In drone mode
  the player also launches the FPV drone.
- Each battle runs on each map × mode × team size: 7 v 7, 14 v 14 and 21 v 21 (the field limit). A mode's own
  ranges clamp a size; the AC-130's allies stop at 8.
- **Cold** is a fresh browser profile: nothing compiled, nothing in the GPU program cache. **Warm** is a second
  battle on the same page after a Garage return.
- The default scenarios are:
  - Verdant, standard;
  - Steinburg (urban), zone control;
  - Cinder Junction, capture the flag;
  - Sirocco Wadi, AC-130;
  - Amberford, drone;
  - Ironworks, frontline assault;
  - Suzhou Creek (urban canals), standard.

Flags:

```
--scenarios=<map>:<mode>,...   --sizes=7,14,21   --seconds=45   --passes=cold,warm
--spec=t90m   --preset=high   --viewport=1920x1080   --port=5396   --root=.   --out=<dir>
--trace=0     (the recorder alone)
--resume      (skip battles already in --out)
--reanalyze=<dir>   (re-run the analysis over a finished census)
```

House rules the tool keeps:

- one browser at a time, its JS heap capped at 3 GB;
- a battle aborts past 6 GB of browser RSS;
- the capture FIFO (`tools/capture-lock.mjs`) is held for the whole run;
- the machine's load is recorded before and after each battle.

Each battle writes `<map>-<mode>-<n>v<n>-<pass>.json` (the analysis), plus two companions so the analysis can be
re-run:

- the recorder's readout, `.frames.json.gz`;
- the renderer main thread's trace events, `.trace.json.gz`.

`census.json` sets the battles side by side.

## Attribution

Three sources meet on one clock. The Chrome trace's clock is tied to `performance.now()` through a user-timing sync
mark.

1. **The frame-stage recorder** (`src/dev/frameStageRecorder.ts`, installed through `__DEBUG.frameStages`).
   - The rendered frame and the fixed step mark the stage they enter (`src/game/frameStages.ts`). A player's session
     has no recorder, so each mark is one null test.
   - The frame stages are input, network, countdown, presentation, camera, sniper fill, world (streaming), fx, match
     world, HUD, audio, night, lighting, post (the render) and perf HUD.
   - The fixed-step stages are spotting, bots, aerial, movement, contacts, fire, shells, damage, destruction, mode and
     pose.
   - Per frame it records:
     - the work by stage;
     - the simulation steps;
     - the programs, textures and geometries the renderer gained;
     - the JS heap at the frame's end (`--enable-precise-memory-info`);
     - the three bus events whose listeners cost most;
     - the WebGL program links and texture and buffer uploads, timed in the frame (taken out of the stage they ran in)
       and in the gap before it.
   - It writes to typed columns, so it makes no garbage of its own.
2. **The Chrome trace** of the renderer main thread. It supplies:
   - the tasks;
   - GC (MinorGC, MajorGC and V8's GC phases);
   - the rendering pipeline after the frame callback (style, layout, paint, commit: the DOM);
   - other tasks' scripts, named by the chunk of the nearest call (a worker's reply, a timer, an idle callback);
   - script compiles (a lazy chunk's first use);
   - image decodes.
3. **The page's observers:** long tasks, long animation frames (with their scripts) and audio decodes.

A **spike** is a frame interval over 33.4 ms between two consecutive rendered battle frames. Paused frames and frames
behind an entry veil are excluded. The interval is split into:

- the previous frame's stages (less the GC the trace saw inside them, pro rata);
- that frame's WebGL links and uploads;
- the rest of its task (the pipeline);
- the other tasks in the gap, by kind;
- the main thread **idle**: a frame the GPU or the compositor held.

The largest bucket is the spike's cause. When a stage's time was mostly one bus event's listeners, the event names the
cause instead (`structure:stage` is destruction, for example).

A **long task** is a main-thread task over 50 ms, split the same way.

Causes:

| Cause | Buckets |
|---|---|
| gc | the trace's GC inside the interval |
| program link | WebGL compile/link and their status reads (first-use programs) |
| upload | texture and buffer uploads |
| streaming | the world stage (terrain LOD, vegetation, props); terrain and world chunks' scripts |
| sim tick | spotting, aerial, movement, contacts, fire, shells, damage, mode |
| bots | the bot controllers' step |
| destruction | the destruction step; the `structure:*`, `terrain:crater`, `munition:blast` and `prop:*` listeners; wreck and collapse builds |
| kill | the `tank:destroyed` listeners (the wreck, the killfeed, the kill's effects) |
| combat fx | the fire, shell and impact listeners (effects and sounds of a shot) |
| audio | the audio stage; audio chunks' scripts |
| hud/dom | the HUD stages, the countdown, the rendering pipeline's style/layout/paint |
| render cpu | lighting, post (the render's CPU side), night, sniper fill |
| chunk load | script compiles |
| gpu/present | the main thread idle through the interval |

`node tools/battle-spike-analysis.selftest.mjs` proves the attribution on a synthetic battle whose causes are known.

## The census's result (ab1)

The A/B ran base 3852a725d4 against the lane: the heat stand-ins and the bots' first-step fix (runtime as
ffa2158835).

- **What was played:** all 42 pairs over Verdant (standard), Steinburg (zone control), Cinder Junction (capture the
  flag), Sirocco Wadi (AC-130), Amberford (drone), Ironworks (frontline assault) and Suzhou Creek (standard), at
  7/14/21 v 21, cold and warm.
- **Conditions:** 35 s of combat each; the governor pinned; the loaded Mac (load 10–60, other sessions' Chromes on
  the GPU).
- **Evidence:** `~/cot-lanes/battle-spikes-253-evidence/ab1`, with `census-ab.json` there.

| Over the 42 pairs | Base | Lane | Change |
|---|---|---|---|
| Hitches (whole battle) | 1,080 | 810 | −25 % |
| Hitches, live combat | 767 | 524 | −32 % |
| GPU-busy hitches | 88 | 48 | −45 % |
| Program links in live combat | 830 | 406 | −51 % |
| 7 v 7 / 14 v 14 / 21 v 21 hitches | 410 / 388 / 282 | 318 / 303 / 189 | |

**By map:**

| Map | Hitches, base → lane |
|---|---|
| Verdant | 146 → 70 |
| Ironworks | 105 → 67 |
| Amberford | 163 → 112 |
| Cinder Junction | 171 → 120 |
| Suzhou Creek | 211 → 170 |
| Steinburg | 171 → 149 |
| Sirocco Wadi (AC-130) | 113 → 122 |

The hitch threshold follows each battle's median. As a check free of it, the 26 pairs whose live medians agree
within 2 ms:

- live frames past 100 ms: 54 → 38 (−30 %);
- live frames past 50 ms: 1,406 → 1,321 (−6 %; that band is mostly the machine's load).

**Memory.** The browser's resident set (renderer and GPU process) peaks at 5.0–6.1 GB in the heavier maps, on both
builds alike:

- Steinburg and Cinder Junction lead;
- a page's second battle peaks 0.3–0.6 GB over its first.

The census's 6 GB guard sits at that footprint: it stopped base Steinburg 21 v 21's warm battle and base Cinder
Junction 7 v 7's first try (both measured on resume). The growth between battles is its own finding for the memory
lockdown, not this lane's.

## The budget

`npm run perf:spikes:check` (`tools/battle-spike-budget.mjs --gate`) replays the budget's battles on the production
build and fails a battle past its limits (`tools/battle-spike-budget.json`):

- **The battles:** watched (every seat a bot's, the camera riding the human seat's hull) on a fresh profile with a
  pinned roster, so a build plays the same battle tick for tick. Verdant standard and Steinburg zone control, 14 v 14,
  cold and warm, 40 s each.
- **Judged under any load:**
  - `links`: programs linked in live combat (cold ≤ 20, warm ≤ 16);
  - `allocMBPerS`: the allocation rate from the trace's scavenges (≤ 400).
- **Judged only while load1 ≤ 0.75 × cores, else HELD:** long tasks, hitches a minute, frames past 33 ms a minute.

Calibrated 2026-10-25 on the lane's head, at load 10–12 on 18 cores with other sessions' GPU processes near 86 % CPU,
with headroom over the measurements. The time limits catch a regression of today's state; the reference machine
tightens them (owed). `tools/battle-spike-budget.selftest.mjs` (core) holds the judge and the shipped budget's shape.

## Follow-ups (not done here)

- **The watched battle's thermal relink.** A watched battle's second battle links its 11 heat programs again: their
  stand-ins go with the first battle's materials, and the watch drone draws them live. Keeping the heat programs
  across battles would remove it.
- **Dynamic resolution without reallocation.** Each governor step reallocates the composer: a GPU stall on the
  machines that need the governor. Proposed: viewport scaling through the post chain, its own lane with a capture A/B.
- **The HUD's layout pass.** Proposals above, through the UI gauntlet (premiere-battle's).
- **The simulation in a Worker.** A frame-rate lever at 21 v 21 (below), its own lane.
- **The entry's other long tasks** (below, "The entry's long tasks"): the roster's tank builds at the battle's start
  (one 1.5 s task on Steinburg) and the lazy audio's first decode (0.3 s). Not map kits: routed to their owners.

## The first battle's covered warm (option a)

The coordinator's call (2026-10-25): a session's first battle finishes the GPU-heavy warm stages behind the entry veil;
later battles skip it. `runFirstBattleCoveredWarm` (game/deferredCombatWarmRuntime.ts, the lazy deferred-warm chunk),
once a renderer through `warmFirstBattleCovered` (app/combatWarmComposition.ts), between the deployment's warm and the
reveal (game/soloBattleLoadingRuntime.ts): the hidden enemies' visuals and their programs, the opening and rare effects
as a covered load renders them, the sights' heat stand-ins. Its record is `window.__BATTLE_FIRST_WARM`.

- **The A/B** (ab-firstwarm: Verdant standard and Steinburg zone control, 7 v 7 and 14 v 14, cold and warm, base
  3852a725d4 against the lane, load 35–75). A cold battle's live program links fell from 27–28 to 4 on Steinburg; the
  warm cost 0.9–2.3 s of entry once. Base Verdant twice passed the 6 GB guard and has no row.
- **Unfinished links.** Seven of eight warms in that A/B stopped at the sights' stage on "Program uniform preparation
  incomplete: budget" (links still pending under load), so the once flag stayed down and later battles paid again.
  Each stage now leaves links still linking to their first draw and the next stage goes on, as the deferred warm does
  (`unfinishedLinks` names the stage); the flag is set after any attempt (3b3e01ba49). The memory probe's three battles
  in one page then show it once (2.2 s, the sights' links unfinished) and skipped after.
- **The late pass's target.** The opening and destruction volleys drew their soft-particle layer into the multisampled
  warm target; a live frame draws that layer through the late-FX pass (single-sample, a depth texture), and a GPU
  pipeline is made per program and attachment set. The volleys now draw it a second time through the late pass's own
  target, two effects at a time (`post.warmLateFxDraw`, as the deployment's warm does; 009cebba90). A capture A/B of
  the cold battles' "gpu busy" hitches is owed.

## The entry's long tasks (the map kits)

nav-perf's entry census (lockdown #2, main 250): deploy-to-battle 21 s on a desktop, 63–77 long tasks (the worst
844 ms); program links, tank-build sweeps (nav-perf's) and the map kits. The map kits' and the links' share is this
lane's: no single task past 50 ms behind the loader, the world byte-identical.

**Method.** `tools/tmp-perf253-entry-profile.mjs` (lane-local) enters one cold battle on a sourcemap build with the CPU
profiler at 500 µs and keeps the long tasks; `tools/tmp-perf253-entry-resolve.mjs` resolves each task's samples through
the build's sourcemaps (by self time and by owner frame). In Node, a map's props build alone, each generator slice
timed (the evidence folder's `props-slices.mjs`), ranks the props' slices fast; it overstates what the browser does in
workers (the wreck bakes, the rock and detail prints).

**Steinburg's entry** (cold, load 37–56): 17.8 s, 49 tasks past 50 ms, 7.2 s in all. By source:

| Task | ms | Source | Fix |
|---|---|---|---|
| Roster tank builds at the battle's start | 1515 | state.ts setupBattle, tankFactoryCore | nav-perf's (routed) |
| The horizon's farmsteads | 486 | borderFarmsteads.ts, the regional houses | a farmstead a step |
| Lazy audio's first decode | 344 | audio/lazyAudio.ts | routed |
| A first render's link wait | 308 | getProgramParameter under the post chain | the late-pass warm; link census owed |
| The field works' footprints | 304 | props destructibleFootprint (the pillbox's whole work) | measured a step a slice before the works |
| Civic pathways | 296 | civic/pathwayKit.ts | a street a step |
| The pillbox's pool | 182 | finalizeDestructiblePool (build, refit, broken) | build, refit and broken form each a slice |
| A light wreck's settle | 161 | lightWreck / fractureSettle in a pool | its own slice (the broken form's) |
| The vehicle roles' footprints | 144 | civilianVehicleKit roleFootprint (8 roles in one task) | a role a slice ahead of the table |
| Street rubble | 141 | rubblePile collision | a pile a slice |

The Node ranking adds, on Alpine and Badlands: the battle scars' ejecta (every lump a new welded icosahedron: the
welded templates are built once and cloned; a scar a slice), the carts' seating (every stone's plan drawn up front:
drawn now only when a cart's reach meets its box; a cart a slice), and the field mud and grime prints (main-thread
paints the surface-paint worker does not plan yet).

**Byte-identical.** Every change only moves a slice boundary or skips work whose result was not read: the same calls
in the same order, the same streams. In Node the props output (every mesh's attribute bytes, matrix and program key;
the obstacle, collider, crushable, loose, wreck-spot, utility, grounding and feature records; each destructible's pose,
state and boxes; the carts' seating receipt) is hashed before (HEAD, through a load hook) and after on Alpine and
Steinburg. The scheduling receipts (propsScheduling) walk the new slices against a synchronous control.

## A room's first live frames (the MP cover)

nav-perf's program log of a room (root-p, 1f58a4460e) recorded each program made after the cover lifts, with its
drawer and the cache-key difference from the nearest program of the same shader. The first live seconds still had a
1.2 s task of eight links.

- **Five depth programs** (the horizon ring's rocks, far vegetation, two baked prop buckets and a rock pool's
  shadow-only proxy) differed from their warmed twins only at key index 34, the point-light count: 8 live, 7 warmed.
  The light census (`window.__LIGHT_CENSUS`) read 8 point lights at both the compile and the watchdog, so the 7-light
  programs came from the Garage's background build. Under the cover these casters never drew at 8: the caster warm-up
  (`engine/shadowPrime.ts`) renders cascade 0 with the shadow map's frustum cull, and they stand outside its box. The
  shadow-only proxy was not batched at all: the warm-up filtered on the camera's layers, which leave out layer 29, so
  the proxy sat unmuted in every batch. Each batch now draws its own casters unculled, and shadow-only casters join the
  batches. A batched caster (the field boundary works' BatchedMesh) culls its items again in its own shadow hook, so in
its batch its per-item cull is off too and its draw list is rebuilt. The batch count is unchanged; a batch's draws are
its own eight casters wherever they stand.
- **`LateFxPass.Copy`** never compiled at the post warm: the late pass draws nothing while no effect is live, and none
  is live under the cover. It now has the post warm's `warmGated` switch, as the sun shafts and the lens flare do, and
  draws its active path (input copy, depth copy, the FX layer, output copy) with the image unchanged.
- **The impostor atlas's bake programs** (the two `COT_BAKE_BILLBOARD` materials) linked at the first live frame that
  showed the far tier. The room's world is built without activation's precompile, so nothing baked it. The MP compile
  now calls `warmImpostors()`, as the solo loading does.

Receipts: `shadowPrime.selftest` (a far caster, a far proxy and a far batch each draw in their own batch; the final cascades keep
their cull), `lateFxColorHandoff.selftest` (no copy without the switch, both copies and the depth copy with it, live
counts untouched), `worldMaterialsBeforeCompile.selftest` (the MP compile bakes the impostors before its strict
compile). Each case fails against the previous source.

**root-r** (nav-perf, load 31-33) confirmed the leave and `LateFxPass.Copy`, and named the rest's callers:

- The depth variants were still made, by the opening effects' warm: its covered composer render drew the shadow pass
  at the battle's light counts before `finalShadows` ran (one 1.6 s task on each page). It now renders without shadow
  updates (`renderWithoutShadowUpdates`, exported from `deploymentWarm.ts`, where the solo deployment's warm already used
  it), so the prime's batches, a painted frame apart, are the first drawers.
- The impostor bake did run under the cover (the MP compile), but linked its two programs inside its first draw: a
  1.1 s task. `ensureBakedAsync` submits them against the atlas with no draw, the compile waits for their links between
  painted frames (`linkerBreathingSlices`), and the draws follow.
- Page B's leave (1.3 s) and its watchdog stage (1.3 s) were single `getProgramParameter` calls: a completion query is
  a synchronous round trip behind the GPU process's whole queue. `engine/gpuCatchUp.ts` gives each link poll a fence:
  a poll asks only once the fence its previous poll left has signalled (Blink answers `clientWaitSync(sync, 0, 0)` from a
  cached status, no round trip). The first-use rounds, `linkerBreathingSlices` and the watchdog's link wait use it; a
  held poll takes no round and does not count as a stalled cohort.
- The panel stage (2.0-3.2 s) was its mask programs' link wait (`hullCompile` 1.9 s): kicked at the warm's start, they
  linked behind the scene's programs submitted at the WELCOME. The panel stage now follows the strict compile, by which
  time they are linked.

**root-s** (load 12-18): no battle long task makes a program; the panel stage is 35 ms (it ran 2.0-3.2 s); compile
910/951 ms (root-r: 2829/4090). Two costs of the gate: the wreck warm doubled (2.2 -> 4.3 s), one uniform drain per
wreck visual each spending its first poll placing a mark, so the gate is now one per context (a drain after another
finds the last mark signalled). And guest B's leave still had one 1.4 s query in `linkerBreathingSlices`, after its own
fence had signalled: the census's two pages share one GPU process, and B's query can wait behind A's simultaneous
Garage restore, which no fence of B's context sees. The env validity probe's synchronous 1x1 read (88 ms at B's leave)
stays synchronous: the sky's install decides on its answer, and a provisional answer would show the poisoned-PMREM
iPhones black frames before the rescue; its per-call relink is nav-perf's (4cae8e9c43, the probe kept for the session).

**root-u** (load 3-9): the tall grass's task is gone, and a single player's leave has no task of 200 ms or more. The
solo stage's 8-28 s task was the census's debug entry (`__DEBUG.startBattle`), not a player's path; through the Garage's
covered entry the longest solo task is the AudioContext constructor (347 ms). A guest's first live frames still linked
eight programs: the FFT ocean's, the water ripples' and the ground pressure's passes, which run only on a frame that
advances time while the covered presentation updates at dt 0. Each field now submits its pass programs against the
targets it renders to, with no draw (`engine/fullscreenProgramWarm.ts`), and both covered entries call the world's
`warmSimulationPrograms()`.

**The room's leave** (root-p, Garage return): one 661 ms task, all `getBufferSubData`, under `beginRgba8Readback`.
The stack named the `tankThumbs` chunk only because `rgba8Readback.ts` is bundled there. Its one synchronous starter
was the clouds' `updateSunMean`, a 32² readback every 30 frames in every battle and Garage with clouds. Chromium serves
`getBufferSubData` as `GetBufferSubDataCHROMIUM` + `WaitForCmd`: a synchronous round trip behind every command queued
before it, even after the fence signals. perf-245's readback-shadow reading was wrong: Blink's getBufferSubData never
takes the client's shadow path. Behind the Garage's first frames that queue was 661 ms deep. Nothing has read the
sun mean since Clouds 2.0, so it now refreshes only while a reader asks (`watchSunMean()`), and `rgba8Readback.ts`
states the copy's cost. A lane-local micro-probe (`tools/tmp-readback-shadow-probe.mjs`) could not load the M5 Max's
queue (its heavy draws drained in under 2 ms), so the evidence is the Chromium source and the field profile.

## Memory across battles

`tools/battle-memory-probe.mjs` plays N battles in one page (the census's battle driver) and measures the garage after
each, after two collections: the JS heap, DOM nodes, listeners, the renderer's textures, geometries and programs, the
game's residency, and the browser's resident set by process (browser, renderer, GPU, other); `--retained` samples the
heap from the second battle on, `--census` sums what each world child keeps on the CPU beside the GPU's copy.
`tools/battle-memory-probe.selftest.mjs` holds its growth arithmetic and judge.

**Steinburg 14 v 14, three battles** (memory2, the lane at 009cebba90): the garage at boot 1.7 GB (renderer 0.93,
GPU 0.37); after each battle 4.62, 4.60, 4.64 GB (renderer 3.09–3.11, GPU 0.98); in battle 5.0–5.1 GB. The growth from
the first return to the last is 10 MB a battle (heap +35 MB a battle, textures and geometries flat, listeners +1):
on one map the page does not grow. The census's "0.3–0.6 GB a battle" was a page's second battle against its first:
the garage that came back keeps the cached battle world (`worldCacheIds ["urban"]`, desktop keeps two). Its 2.9 GB
is the level to cut: the renderer process +2.2 GB (of which the JS heap is 0.19) and the GPU process +0.6 GB.

**What the page can see** (memory3, `--census`, the same scenario): the cached world keeps 0.35 GB on the CPU beside
its GPU copies — the props' geometry 223 MB and their textures 30 MB, the terrain 17 + 21 MB, the vegetation's and the
tall grass's instance matrices 21 + 14 MB — and the scene outside it 0.09 GB in the garage (0.21 GB in battle). With
the heap that is about 0.7 GB of the renderer's 3.0 GB. The other 1.5 GB is out of the page's sight: the workers'
heaps (the paint, wreck, shell and vehicle pools), WebAssembly memory, decoded audio, or the allocator's high water
after the build's transient arrays. Chrome's memory-infra dump by allocator (`--dump`) is the next probe; then the
fix — dropping the dormant world's CPU copies where nothing reads them, releasing its GPU buffers, or ending the
build's workers — and the receipt (`--gate`, tools/battle-memory-budget.json).

## Memory: the dormant world's release, tried and reverted

The probe's `--sequence` plays a map per battle in one page (a player on the random rotation). Before (Steinburg,
Verdant, Steinburg, Desert): the Garage held two worlds (desktop keeps two) at 3.9-4.6 GB, the in-battle peak 5.5 GB.
9ee50b12cd released a dormant world once another battlefield was asked for (a battle entry, the Garage's planned battle):
one world was cached at a time and the renderer's geometries fell (1,065 -> 722), but the resident set rose (4.7, 5.5,
5.8 GB after battles 2-4; the peak 6.4 GB) and the JS heap with it (259 -> 359 MB). A released world is not collected:
something outside the cache keeps it, so releasing and rebuilding stacks copies where the cache reused one. Reverted
(f2af3d2b3e). Next: the probe's `--leak-check` holds each battle's world weakly (marked with a class of its own) and says
after the Garage's collections whether an evicted one is still alive; then a heap snapshot's retainers from the mark.

In Node a Steinburg props build keeps 519 MB of ArrayBuffers alive against 222 MB in its group's geometry. Chrome's
memory-infra dump in the Garage after a Steinburg battle: the renderer's partition_alloc array_buffer partition 1.28-1.5
GB, the walk from the world, the game and the scene reaching 0.36-0.38 GB of it; the rest is held by closures and
module state a property walk cannot see.

## Memory: the retainers found, the release restored

The probe's `--retainers` (tools/heap-retainers.mjs) took three fixes before it could read the game page's snapshot (11
million nodes, 31 million edges, ~760 MB of JSON): the node and edge arrays sized from the counts the meta declares (the
doubling Float64 arrays' growth threw inside the protocol's event handler, which swallowed it, and every chunk after was
lost); the chunks kept while they arrive and parsed once the snapshot is done (parsed in the handler, the probe read slower
than the snapshot came and the stream ended at ~470 MB); a marker found by its heap id, asked after the snapshot (V8 assigns
ids then). A WeakMap table's edge is never a retainer (it holds a value only while its key lives).

The evicted world (Steinburg, Verdant, Desert in one page: the first battle's world leaves the two-world cache at the
third) had two retainers:
- **The drones' callbacks** (20abf7caad): `game.aerialCallbacks` was made inside `simStep` on the first step; a closure
  made there shares the call's context with every variable any of its closures reads, the step's collider among them,
  so the first battle's collision bundle and world stayed reachable for the life of the game state. A module-level factory.
- **The sourced terrain's cancel** (cd5539133b): `abort()` with no reason made a DOMException whose captured stack held
  the frames' receivers, the disposing world among them. A plain reason; the hook dropped after it runs.

After both: the evicted world is collected; the peak 5,482 MB (8,207 before), the renderer 3,892 MB (6,694). The dormant
battlefield's release (9ee50b12cd, reverted for this leak) is back (242033223f). The gated receipt is
`node tools/battle-memory-probe.mjs --root=. --scenarios=urban:zone_control --sequence=urban:zone_control,verdant:standard,desert:standard --size=7 --battles=3 --seconds=10 --leak-check --gate`
against tools/battle-memory-budget.json (no leaked world; heap, RSS, textures and listeners a battle and the peak about
1.5x the fixed build's run).

## The Garage's background world build and presses

nav-perf's phone census (4x CPU): the next battle's world builds behind the Garage and its steps met presses (stonePlan
253 ms, sourcedTextureComposition 233, fractureSettle 192, botRoutePlanner 173, fortKit 132, rockCollision 98 and 76).
- **Pacing** (engine/backgroundYield.ts, loaded with a build's first background slice): a 4 ms slice ends early when
  `navigator.scheduling.isInputPending()` says input is waiting; a pointerdown or keydown, seen in the capture phase,
  holds the next slice until that press's paint; the build resumes as a `scheduler.postTask` background task between
  frames (no longer inside an animation callback), raced against 50 ms so a covered load can never starve it.
- **Slices:** the scenery's field-works keep-out builds one objective access (navigation grid and floods) for its four
  modes, not one each; a light wreck settles a body a slice; the rock colliders and beds go 8 a slice (were 48); with
  the entry's slicing above (stonePlan, fortKit's footprint and pools). Byte-identical: the props hashes, the 33 exact
  collision manifests and matchPlacement's pinned placement hash.
- **The source bitmaps** (sourcedTextureCompositionClient): `createImageBitmap(<img>)` decoded each 1K JPEG in its
  native front half on the main thread (31-75 ms at 4x; `img.decode()` first moved nothing). The browser port decodes
  the element's cached file as a Blob instead: ≤ 3.6 ms of main thread, the same pixels in Chrome.
- **The Garage pedestal** (nav-perf's garage-idle profile on main 251, phone): an idle Garage's long tasks are the hero
  tank's builds, not the world's. The mudguard hangers and the fitting snap souped every running-gear triangle for a few
  station boxes (an Abrams X: 3.4 s and 2.0 s at 4x); the running gear now soups a piece only when a tested box meets
  its bounds. Over the fleet at HIGH and LOW (442 builds): the same answer on all 2,757 queries, 1.1 s against 21.9 s.
  The Abrams X profile body (4.1 s and 1.5 s at 4x) is still one step: its authored stages are drained synchronously,
  and yielding inside it needs the profile's run serial (spareTrackRunTag) to tolerate another build between stages.
- **The world's assembly** (map.ts assembleWorld: one 164 ms task on a desktop Verdant entry, the ground cover's seal 94
  of it) is a step generator: createMap drains it, createMapAsync paces the fine-sliced build between its steps (seven
  of its own, and the seal a step per grass mesh). The group stays hidden from its scene add to its last step; a pace
  that throws (a cancelled build) lets the assembly finish so the coordinator releases a whole world. Byte-identical:
  Verdant, Urban and Alpine through createMapAsync and Verdant through createMap, HEAD against the lane in Node.
- **The terrain mask** (terrain.ts makeMaskTexture: its splat step one 87 ms task on the desktop Verdant entry) bakes in
  steps: the land grid, the road raster, 64 rows of the paint a step, the road layers. Byte-identical with every data
  texture the world's materials reach (the mask and its road layers) on the same three maps. liquidMarshSurface's red
  (Mangrove's bank grade 0.88) is the base's: the same with terrain.ts at HEAD.

- **nav-perf's phone Garage sweep** (main 251, 4x, ten presses) read through the dist's sourcemaps, beyond the items
  above:
  - the props build's first building measured the last battlefield's whole deferred-measure queue in one task (1,444 ms on
    the filter press): a prefetched map's measures are never run by a world that was not played. The build now drains
    another map's queue in 6 ms slices before it describes a building (structureDamageSeam measureOtherMapStructures);
  - the horizon ring and the Hinterland were each one supply slot: a second world build (a deploy while the Garage built
    another map) took it, and the first built its ring on the page (14 tasks of 100-376 ms on deploy). One supply a map
    and variant now;
  - a civic square (368 ms), the structure shells' join (175 ms) and a kit's lime render or limewash prints (150-180 ms a
    seed) are steps or the surface paint worker's now. Props output identical in Node on Alpine+Urban (the queue
    drained), Autumn and Delta (civic; Autumn's destructible records differ only in three's random UUIDs), Coastal and
    Desert (lime render).
  - a road wreck's commit (150 ms) is steps: a step after each of its hulk's three transforms (a hulk ~50k vertices, a
    transform ~6.5 ms in desktop Node), its bounds computed once after the last, its debris its own step, its own
    quaternion (another world build may run between the steps). A planned building is three steps: its base build and
    pose, its region's rebuild, its collision and merge. A set piece's collision derives a height band a step
    (structureCollision.ts deriveRuntimeStructureCollisionProfileSteps; Verdant's worst landmark slice was 444 ms in Node).
    Props output identical in Node on Airfield and Urban (wrecks); Suzhou Creek, Mangrove, Verdant (buildings); Suzhou
    Creek, Verdant, Orchard and Delta (landmarks, the station below); and Urban and Airfield again with every world file
    of these steps against the revision before them (60c2f2f1e2), each structure's damage anatomy hashed too. (Steinburg's
    map id is `urban`: a run asked for `steinburg` built Verdant, so the earlier "Steinburg" rows were Verdant's.)
  - The describers read plain position and index arrays where they stand (rawAttributes.ts; the getters were a third of
    Verdant's church describe); anatomies identical on the same maps.
  - Open: a set piece's damage anatomy (describeStructure: Verdant's church 285 ms in Node, its kit's describe reading
    every triangle) and the church builder itself (261 ms, its openings' dressing); the yards (42 ms) are under budget.

- **Suzhou Creek's entry: one 3.6-5.1 s task** (blackglass solo, lane and main 252 alike; the profiled entry with the
  reverb's convolver a pass-through, `--no-convolver`): the Shanghai kit's North Station forecourt fit
  (shanghaiStreets.ts dressNorthStation) shrank its rectangle a metre a try and tested every 1 m cell of each try against
  every record on the map (collisionFootprintContainsPoint). On a multiplayer host that is a page that forwards no link
  pressure for 5 s (the rooms census's server 9). The records are binned now (collision.ts createFootprintPointIndex):
  each by a box its footprint cannot pass at the largest margin asked (a convex part's mitred corners, margin /
  sin(θ/2), included; a needle, a reflex or a degenerate ring is tested at every point), the same answers as the scan
  (footprintPointIndex.selftest: 60,000 points over 600 seeded records of every kind).

## Draw count (the engine ruling's lever)

The census's `--draw-attribution` (30 frames) and the frame recorder's draw columns. Diag build, cold, load 45-69 (the
per-draw cost about 1.7x a quiet machine's):

| Battle | Draws a frame | Programs | Switches | Submission | µs a draw |
|---|---|---|---|---|---|
| Verdant 7v7 | 722 | 120 | 231 | 22.5 ms | 32 |
| Steinburg 14v14 | 1,126 | 137 | 359 | 39.6 ms | 36 |
| Verdant 14v14 | 1,327 | 132 | 400 | 44.8 ms | 35 |
| Steinburg 21v21 | 1,326 | 134 | 431 | 47.8 ms | 37 |
| Verdant 21v21 | 1,343 | 127 | 423 | 47.5 ms | 36 |

By owner (Steinburg 14v14, a frame): the world's shadow casters 424 and its main pass 179; the tanks 333 in the shadow
maps and 444 in the main pass (16-31 a tank under 30 m, 13-22 at 30-180 m, 4-12 shadow draws a tank); effects 118. The
world's shadow draws hold at 312-424 in every battle although a static shadow cache exists: the next run samples its
decisions (`staticCacheFrame`) and the tanks' parts by pass before a lever is chosen.

### The plan (2026-10-26)

In order of draws saved per unit of risk, each step A/B'd with `--draw-attribution` at 7v7, 14v14 and 21v21 on
Steinburg and Verdant (paired, one build, ABBA):

1. **The world's shadow casters (312-424 draws a frame).** The static shadow cache exists, yet these hold in every
   battle: sample its decisions (`staticCacheFrame`) to find which statics miss it (cascade refits, epochs, roots outside
   a static nest) and close the misses. This lane's alone; the cache's receipts (shadowStaticCache.selftest) pin it.
2. **The tanks' mid band (13-22 draws a tank at 30-180 m).** The far LOD (farLod.ts, past 180 m) already merges every
   visible static draw per owner and material in the owner's frame, then clusters it. The same merge without the
   clustering is a mid LOD: the detail parked as the far LOD parks it, the silhouette exact, about 5-8 draws a tank.
   Render-only (armor, modules and crew read their own records), but it is the vehicles lane's builder and its CPU pair
   receipts; agreed with that lane first.
3. **The tanks' shadow draws (333 a frame).** The mid band's merged owners draw the shadow pass too, in place of
   per-part casters.
Not taken: instancing across the roster (pose and damage state differ per tank; duplicate picks are few).

### Step 1: what the shadow maps draw (2026-10-26)

`--draw-attribution` now splits the shadow draws by cascade, the static cache's phase (`static`: a rebuild's static
layer; `dynamic`: the layer drawn over a copy; `full`: an ordinary render) and owner, and names the world's draws in the
dynamic layer. Two urban 7v7 runs on the current build (the census serves the root's `dist/`: an earlier run measured a
stale build and read every draw as `full`):

- The cache holds when little breaks: 12 cascades rebuilt to 91 reused in 30 frames, the world's static layer about 42
  draws a frame across the four cascades.
- When a building comes down, its flying bodies dominate: `fx-fracture-body` drew 252 times a frame into the shadow maps
  against 117 in the main pass, about 110 a cascade. The cascades' boxes overlap, so a body near the view stands in
  every box. Fix (1a8c1ebbee): each shadow-casting body carries a caster profile whose reach (its planar distance from
  the view) shadowCasterProfiles' reach law reads, so no cascade sampled from beyond it draws the body.
- The world's dynamic layer (about 90 a frame): the per-cascade caster proxies (`*-shadow-c`, by design) and the
  promoted buckets (canopy shadows, poles, props buckets that changed recently).
- Tanks: 75 shadow draws a frame at 7v7, the one tank under 30 m at 22-42 of them (steps 2 and 3).

A census battle rarely brings a building down inside its 30 sampled frames, so the fix's A/B is a staged demolition
(`tools/tmp-253-collapse-draws.mjs`, untracked: perf-240's staging of Urban's rowhouse 165, 7v7 with the bots frozen,
the player 42 m before its widest face, HE rounds every 0.45 s until it collapses; 30 frames of draws after the 6th
round, 0.3 s after the collapse and 2 s after it; base, lane, lane, base on one machine). Fracture-body shadow draws a
frame, and per body drawn in the main pass:

| Sample | Base (two runs) | Reach law (two runs) |
|---|---|---|
| Breach | 307-329 (1.82-1.92 a body), far cascade 44-47 | 225-229 (1.36-1.45), far cascade 0 |
| Collapse | 387-402 (2.91-2.97), far cascade 57-59 | 385-407 (2.56-2.84), far cascade 0.6-1.7 |
| 2 s later | 204-262 (2.79-2.94), far cascade 30-38 | 193-212 (2.47-2.80), far cascade 0.5-1.2 |

The far cascade is gone, but a collapse farther from the view still draws its bodies into the near cascades. The near
law (shadowCasterProfiles.ts law 4) is the reach law's mirror: a caster whose owner reports its nearest view depth is
hidden from a cascade whose sampled range (`csmSliceToM`, the fade's half-band past its break) ends short of that depth
less its shadow footprint and the 8 m margin. The fracture bodies report it from the fx update's camera. The same
staging with both laws (a second ABBA on a rebuilt lane dist):

| Sample | Base (two runs) | Reach and near laws (two runs) |
|---|---|---|
| Breach | 279-298 (1.64-1.81 a body) | 221-258 (1.31-1.49) |
| Collapse | 412-448 (3.01-3.20) | 311-354 (2.42-2.45) |
| 2 s later | 253-283 (2.93-3.10) | 163-231 (2.34-2.44) |

About a fifth fewer shadow draws a body, and the collapse frame's whole shadow pass 787 -> 695-717 draws. High samples
cascade 0 to 32 m and cascade 1 to 94 m (its 30 / 89 m breaks and the fade's 6 %): a body leaves the first past about
45 m of view depth and the second past about 105 m, so these bodies at 42 m mostly stay in cascade 0 (102-112 against
107-121 in cascade 1).

### Steps 2 and 3, measured before building (2026-10-26)

- **The mid LOD saves nothing.** Built to the vehicles lane's conditions (a sibling of buildFarHull, grouped per
  parent, material, layout, render order, layers, coplanar depth and ties; gear, markings, lenses, suits, hand-offs and
  LODs left live), it merged 0-1 draws a tank: T-90M 0, Leopard 2A7V 0, SEPv3 1 (two sources). At 100 m these battle
  builds draw 51-63 meshes: 11-15 running gear (live by the conditions), 16-22 greebles under the 150 m LODs, and the
  rest already merged by the 'dual' static merge, one per owner, material and coplanar depth layer. What separates them
  is the depth layering, which the merge must keep. Shelved (`battle-spikes-253-evidence/mid-lod-shelved.patch`).
- **The tanks' shadow draws are the near-hull policy, not per-part casters.** A bot casts through one
  `articulatedShadowBatch` (a BatchedMesh on the shadow-only layer: one draw a cascade). The extra draws are
  nearVehicleShadowDetail.ts: the six nearest hulls within 90 m cast their real armour into the cascades that cover them
  (the owner's 2026-09-20 ask), 22-42 draws for the nearest hull and 10-17 for the others. Those casters write depth
  only, so they could merge per articulation owner across materials; that is the remaining lever here.

### Step 3: the near hulls' merged shadow casters (2026-10-26)

nearVehicleShadowMerge.ts, under the vehicles lane's conditions. A selected hull's real opaque casters merge per owner
(the detail mesh's parent, a static LOD wrapper skipped: hull, turret, gun mount, recoil, a roof station) and per
effective shadow side, into the owner's own frame. The merged copy holds positions only, sits on the shadow-only layer,
and is attached under its owner only while one of its cascades renders. Cut-out casters keep their own cast (alpha test,
alpha or displacement maps, transparency, field suits, lattice and slat panels), and so do instanced, skinned and morphed
meshes (the running gear), runtime-written buffers and meshes with their own depth material.

Each source is stamped when merged: geometry, material, position version, visibility, parent and cast flag. A stamp
that no longer holds (damage, a detached part, a bent gun, a wreck's swap) drops the set, and the hull casts mesh by
mesh for 30 updates before it is rebuilt. The policy builds one set a frame, holds at most 12 and gives one back after
600 updates out of the selection. It runs in live battle frames only (`setVehicleShadowMerge(frame.inBattle &&
!frame.killcamActive)`), never in the reduced tier, and `__SHADOW_DEBUG.noVehicleMerge` turns it off for A/Bs.

Per hull and cascade, high geometry (unique detail meshes; a detail list can name a merged mesh more than once): T-90M
20 -> 14 shadow draws, Leopard 2A7V 23 -> 15, SEPv3 25 -> 13. The depth triangles per shadow side match the detail's
(nearVehicleShadowMerge.selftest: count, area, area-weighted centroid and normal).

In the browser (`tools/tmp-253-merge-shadow-ab.mjs`, untracked; one build, merge on and off by `noVehicleMerge`): Urban
7v7, the bots frozen and moved 400 m off, the player's T-90M with the Leopard 14 m and the SEPv3 24 m ahead, the battle
held by the settings pause, every cascade rendered each frame.

- Draws: the near hulls' shadow draws 143 -> 109 a frame (cascade 0 55 -> 41, cascade 1 60 -> 40). The whole shadow
  pass went 175 -> 141 and the main pass held at 451. Off, on, off, on gave the same counts both times.
- Never cast twice: over 60 frames, 240 hull-cascade checks and 720 merged draws, no merged caster drew in a cascade
  with a detail mesh it covers.
- Depth: each hull's shadow depth rendered from cascades 0 and 1 as the policy casts it, into a float target the size
  of the map, with each caster's own shadow side. Crops of 192 texels about each hull matched merged against mesh by
  mesh texel for texel: 0 of 3,236-15,175 covered texels differ, max delta 0. The control pair: the merged casters
  alone (2-4 a hull) against the 8-14 detail meshes they cover alone also match texel for texel (0 of 1,144-13,716),
  and the merged casters alone against the whole detail differ on 16-45 % of the covered texels, so the comparison
  sees a caster missing. Final frames cannot show it: the held
  scene still animates (clouds, wind, temporal post), and two frames with the merge off already differed on about as
  many crop pixels as off against on.
- Live battles (2026-10-27, `tools/battle-spike-census.mjs --draw-attribution`, 30 sampled frames; off is
  `--shadow-debug=noVehicleMerge`): the player's near tank (under 30 m) casts 16.5 shadow draws a frame with the merge
  on and 22.5 off. The pair on one build (ed163c4af3, Verdant 7v7 cold): 16.5 on, 22.5 off. Earlier pairs on the lane's
  previous build: Verdant 16.6 and 16.5 on against 22.5 off, Urban 16.5 on against 22.5 off. Its main-pass draws hold at
  53. The far tanks (past 180 m) cast 3.3-4.2 a tank either way. Whole-pass and per-cascade totals are not an A/B
  across census battles: the bots, the tanks in each band and the trees' shadows differ from run to run (the pair's
  tank shadow draws by cascade were 22/9/9/4.5 on with 8 far tanks against 31/20/12/6 off with 11).

## The HUD's frame cost (UI-LOCKDOWN part E: 0.5 ms a frame)

The Steinburg 14v14 profile: code under the HUD's sources costs 20.8 ms a second (about 1 ms a frame there).
battleHudLayout.ts refresh() is 30 % of it: on the frames it runs it re-queries its ~40 selectors (querySelectorAll
204 ms in the profile) and its first read forces a ~15 ms reflow (getClientRects 145 ms); the DOM census (`--dom-census`,
120 frames) finds 3.6 reads a frame, median 0 ms, max 28. hud.ts drawMinimapChrome strokes the minimap's static grid,
strips, vignette and frame on every redraw (its hottest line, ~206 ms). Both routed to premiere-battle (the layout's
owner) with a proposal: re-query after a childList record, reads before writes; the chrome composited once.

## Hitches, not frames past 33 ms

The census runs on a shared, loaded Mac:

- the load average sits at 30–100;
- other sessions' headless Chromes keep their GPU processes at about 140 % CPU.

On it a 14 v 14 battle's median frame is 34–42 ms. "Every frame past 33 ms" then counts the machine: 621 of 744
intervals in the first pilot.

So the analysis names a **hitch**:

- an interval past 33.4 ms **and** past `HITCH_RATIO` (2) × the battle's own median;
- on a quiet machine, every frame past 33 ms; on a loaded one, the frames the load alone does not explain.

A hitch's cause is the bucket furthest past its own median over the battle's ordinary intervals: its **excess**, not
its size. A render that takes 20 ms in every frame is not the cause of the one frame that took 200.

Long tasks behind the entry veil are entry time, not battle hitches. The analysis marks each long task as seen or
behind the veil, and counts only the seen ones.

The browser's `performance.memory` no longer moves in this Chrome. Allocation and collections come from the trace's
scavenges (`usedHeapSizeBefore` and `usedHeapSizeAfter`).

## Findings

Pilots: Verdant, standard, 14 v 14, cold and warm (`~/cot-lanes/battle-spikes-253-evidence/pilot3`, `diag1`). The full
census is in progress (`before/`).

### GPU-process stalls on first use (cold battles only)

The largest hitches are the main thread idle while the GPU process works through one long task: 128–758 ms,
**`gpu busy`**. A warm battle on the same page has none: Verdant 7 v 7 cold had 10 (worst 758 ms), warm 0 (worst frame
108 ms).

They follow the deferred warm's **vision programs**, the thermal stand-ins (`engine/thermalVehicles.ts`):

- the warm runs in the battle's background after rollout (`game/deferredCombatWarmRuntime.ts`);
- it links 25 programs, polled, never blocking (16 "Thermal vehicle hull", 8 "running gear", 1 "gun"), 2–15 s into
  the fight;
- it gives each actor a private first-bind render;
- that render makes ANGLE build each program's Metal pipeline on the GPU process's main thread, and the frames after it
  wait.

In Verdant 7 v 7 cold, each of the stalls of 758, 323, 158, 132 and 66 ms came 1–3 s after a burst of those links.

Two further first uses:

- a 575 ms frame at 36 s of combat linked an unnamed program synchronously (435 ms of link, right after a shell hit and
  a structure breach);
- two 183 and 315 ms GPU stalls at 29 and 33 s had no link near them.

The recorder now names raw programs by their uniforms and records every program's first draw into each framebuffer, to
attribute these.

#### The warm under the live battle, paced by the GPU

The first A/B pairs (`ab1`: base 3852a725d4, lane with the stand-ins) bore the stand-in fix out:

| Measure | Base | Lane |
|---|---|---|
| Live thermal links (Verdant 7 v 7 cold) | 25 | 9 |
| The vision warm | 7.2 s | 4.7 s |
| GPU-busy hitches, 7 v 7 cold | 6 | 2 |
| GPU-busy hitches, 14 v 14 cold | 5 | 0 |

The worst GPU stall did not shrink, though: 800 ms in the lane's 7 v 7. The deferred warm's own record placed it inside
the **rare effects'** window, not the sights'.

- Everything after the countdown's hold runs under the live battle for its first 5–10 s: wreck variants, scars,
  shadows, hidden variants, rare effects, the sights.
- The warm is paced by 6 ms main-thread slices, but a first-bind render costs the main thread almost nothing: the link
  is polled and the draw only queued.
- So one slice issued a dozen renders, and the GPU process built all their pipelines in one flush.

**Tried and reverted: pacing the warm by the GPU.**

What was tried (67c4a3d35a):

- the combat warm's renderer fenced each render;
- after the hold's release, each yield of the deferred warm waited until the last render's fence had signalled.

The A/B (`ab2`: twelve battles a side, Verdant and Steinburg at 7/14/21 v 21, cold and warm) had the same combat
content on both sides: 72 shots and 3 kills each. Against base:

| Measure | Base | Lane | Note |
|---|---|---|---|
| GPU-busy hitches | 30 | 18 | the same fall the stand-ins alone gave in `ab1` |
| Hitches | 184 | 211 | up |
| Worst stall | 707 ms | 1,149 ms | one render's own pipelines; no pacing splits that |
| Rare-effects warm, Verdant 14 v 14 cold | 6.35 s | 8.29 s | the warm ran 2–4 s longer into the fight |
| Program-link excess | 541 ms | 1,150 ms | effects fired inside the longer warm compiled at first use |

Reverted (32d4854895).

**What is left** is the GPU process's first-use pipeline work for the warm's renders after the countdown's hold.
One render can cost a second of it on the census machine, whose GPU other sessions' Chromes share. It is gone once
warm: a warm battle on the same page has none. The structural choice is the owner's, between:

- finishing the GPU-heavy warm stages behind the entry veil on a session's first battle (the entry a few seconds
  longer, once a session), or
- accepting the first-use stalls in a cold session's first battle.

### The bots' first step (cold)

At rollout the first simulation step ran 33 ms at 14 v 14 and 42 ms at 21 v 21 (the authority on thread CPU; the
census saw 90–125 ms hitches under load).

- **Cause:** each bot's controller walked the whole obstacle list on its first box query, to learn whether the obstacle
  grid's order is the list's. That answer is the same for every bot.
- **Fix (`game/ai.ts` `gridOrderMatches`):** one answer per list and grid, shared by every bot.
- **Result:** the first step is now 16.4 ms (14 v 14) and 18.4 ms (21 v 21). The paired bench (base and lane in one
  process) keeps every state digest identical over 1,800 ticks. The rest is the first run's compilation.

### The adaptive resolution's steps

The governor (`engine/post.ts` `dynGovern`, `engine/adaptiveQualityPolicy.ts`) moves the composer's pixel ratio in
0.09 steps, at most two a cut and one cut every 1.5 s. Every step reallocates the whole composer chain: the MSAA HDR
scene target, GTAO, bloom, SMAA and TAA (`applySize` → `composer.setPixelRatio`).

On the loaded census machine the diagnostic battle (Verdant 7 v 7 cold) stepped down three times in combat's first 5 s:

| Step | Re-created scene target (first draws) | Stall that followed |
|---|---|---|
| 1.94 s | framebuffer 71 (80 first draws) | 1,233 ms just before it: no frames while the GPU caught up |
| 3.46 s | framebuffer 93 (69) | 141 ms GPU busy at 3.7 s |
| 4.97 s | framebuffer 114 (81) | 217 ms at 5.3 s |

A player whose machine needs the governor pays a hitch at every step. The census pins the scale (`--governor=pinned`):
a pair must render the same pixels, and the steps are the loaded machine's, not the battle's.

**The root fix** is a resolution change that allocates nothing: targets kept at the preset's full ratio, the scene
rendered into a scaled viewport, and every pass reading the scaled sub-rectangle (UV scale and clamp, the upscaler
from the sub-rectangle). It touches every pass of the post chain and its edges (GTAO's and bloom's taps, TAA's
history), so it is proposed as its own lane with a capture A/B. Not done here.

### The HUD's layout pass

`ui/battleHudLayout.ts` `refresh` re-plans the HUD whenever a watched element's class, `hidden` or `data-count`
changes, or the kill lane's, toasts' or log's children change. It ran 25–27 times in a 14 v 14 battle:

- 461–499 ms in all under load, up to 44 ms a pass;
- about three quarters of it is the pass's own script, the rest the forced style and layout of its reads after its
  body-variable writes.

It is the most frequent hitch cause after the GPU stalls (`hud/dom`).

**Proposed to the UI owner (a UI-gauntlet change, not made blind here):**

- A transient part's change (kill lane, toasts, log, alerts, the sixth-sense mark) re-plans nothing (`planInputs`
  stays false), but still re-reads every instrument's box. It needs only the notice placement; the steady
  instruments' boxes can be kept between passes until a plan input changes.
- The pass writes body variables and attributes between its reads. A write to `body` invalidates the whole page's
  style, so the next read pays a full recalculation (two of about 14 ms in the worst pass under load). All reads
  first, then all writes, keeps it to one.
- `observe()` runs five selector-list queries a pass. They matter only when the HUD's elements change, which a
  childList record marks.

### Allocation

| Measure | Value |
|---|---|
| Battle (the trace's scavenges) | 150–330 MB/s |
| Scavenges | 7–10 a second, a handful past 5 ms |
| Authority alone (`tools/sim-alloc-probe.mjs`) | 1.08 MB a 14 v 14 Verdant tick |

- **The authority's largest sites:** the ground contact's sampler (`terrainContactSurface.ts` `sample`, about 200 KB a
  tick), `movement.ts` `contactAwareFit`, the structure supports and the track-line sampling.
- **Where it comes from:** doubles that cross non-inlined calls. Every hot ground query is reached through a function
  reference, and V8 boxes a double argument or result as a HeapNumber at the boundary. Moving the sampler's cached
  corners into a typed array changed nothing, so the boxing is the calls'.
- **What it costs:** collection was never a hitch's dominant cause in the census (1–12 ms against 90–750 ms
  hitches).
- **The real fix:** the sim's numeric kernels batched or in WASM (PERF-LOCKDOWN workstream 3), not a scratch object at
  a time.

## The simulation and the bots in a Worker: weighed

The question (PERF-LOCKDOWN workstream 1): would moving the authoritative simulation and the bots into a Worker, the
main thread only rendering, remove the hitches?

### What the main thread spends on them

- **Steady state:**
  - The recorder's fixed-step stages (spotting, bots, aerial, movement, contacts, fire, shells, damage, destruction,
    mode, pose) take about 6 ms of a 42 ms frame in a loaded 14 v 14 battle, at 2.5 steps a frame. Movement (3.4–4.5
    ms) and the bots (1.6–1.9 ms) lead.
  - On thread CPU the authority's step is 1.6–1.8 ms at 14 v 14 and 2.5 ms at 21 v 21 (`tools/sim-alloc-probe.mjs`'s
    match; the multiplayer bench: 0.9 ms at 14 v 14, 2.2 ms at 32 v 32, less loaded).
  - At 60 fps that is one step a frame: 10–15 % of a 16.7 ms frame at 21 v 21.
- **Hitches:** of the census pilots' hitches, the simulation was the excess in two:
  - the bots' first step at rollout, now halved;
  - a contacts burst after a building's collapse (15 ms past median).
  
  Everything else is GPU first use, the governor's reallocations, the HUD's layout pass, the deferred warm's
  countdown bursts, and effects listeners — main-thread presentation work a Worker would not take.

### What the move costs

- The solo battle would run through the multiplayer path: the authority in `src/mp/host/matchHostWorker.ts`, the main
  thread a client of snapshots with prediction and interpolation.
- Every presentation listener now fed synchronously by the step's bus would be fed by messages a frame later:
  effects, audio, HUD, killcam recording, the watch seats.
- The solo-only rules would all need the host's parity: the proving ground, the campaign's frontline, the watch mode's
  taken seats, practice.
- `main.ts` records why solo stays in-page: the multiplayer modules "duplicated work without adding any useful
  authority boundary" for a local battle.

### The census's rows

Verdant, the base build, warm battles, live frames, on the loaded Mac:

| Room | Frame work | Fixed-step stages | Share | Steps a frame | A step |
|---|---|---|---|---|---|
| 7 v 7 | 23.9 ms | 2.6 ms (bots 0.6, movement 1.4) | 11 % | 1.67 | 1.55 ms |
| 14 v 14 | 33.1 ms | 5.6 ms (bots 1.5, movement 3.2) | 17 % | 2.31 | 2.43 ms |
| 21 v 21 | 42.7 ms | 10.3 ms (bots 2.7, movement 6.0) | 24 % | 2.99 | 3.43 ms |

The step's share grows with the room, and it feeds itself: a slower frame owes more fixed steps the next frame, up to
the accumulator's cap. That is the 21 v 21 battle's 3 steps a frame at a 50 ms median.

### The call

**Not the spike lever.** The hitches are presentation and GPU work that stays on the main thread whichever thread steps
the battle.

**A real frame-rate lever for the largest rooms.**

- At 21 v 21 the step is a quarter of the main thread's work here. On a machine holding 60 fps (one step a frame, about
  2–3.5 ms) it is 12–20 % of the frame.
- Off the main thread it no longer compounds: a slow frame owes the Worker steps, not itself.

If it is taken, it is its own lane: the solo battle as a local host in the existing multiplayer path, with parity
receipts per mode. Recommended after the GPU first-use work below, which is what the census's worst hitches are.
