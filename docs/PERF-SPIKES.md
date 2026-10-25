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

- **The cold session's first-use GPU work (an owner decision).** The deferred warm's first-bind renders after the
  countdown's hold leave 100 ms – 1.1 s GPU-process stalls in a session's first battle. They are gone in its later
  battles. Options:
  - finish the GPU-heavy stages (rare effects, sights) behind the entry veil on a session's first battle, at a few
    seconds' longer entry;
  - or accept them.
- **The watched battle's thermal relink.** A watched battle's second battle links its 11 heat programs again: their
  stand-ins go with the first battle's materials, and the watch drone draws them live. Keeping the heat programs
  across battles would remove it.
- **Dynamic resolution without reallocation.** Each governor step reallocates the composer: a GPU stall on the
  machines that need the governor. Proposed: viewport scaling through the post chain, its own lane with a capture A/B.
- **The HUD's layout pass.** Proposals above, through the UI gauntlet.
- **The deferred warm's opening-route jobs, split by leg.** The countdown's 30–290 ms microtask bursts.
- **The simulation in a Worker.** A frame-rate lever at 21 v 21 (above), its own lane.
- **The browser's growth between battles** (0.3–0.6 GB a battle). For the memory lockdown.

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
