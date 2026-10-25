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

## Findings

(The census results and the fixes follow as they land.)
