# Performance architecture

Claude of Tanks is designed to keep the gameplay rules constant while scaling
browser rendering cost across hardware. This document describes the current
load, frame, network-presentation, and diagnostic contracts.

## Performance goals

- Preserve responsive garage and battle transitions on modest hardware.
- Permit high-refresh rendering when the device can sustain it.
- Avoid making solo play pay for network transport or snapshot work.
- Prevent one effects burst from blocking the next visible frame.
- Avoid per-frame object churn in common network and presentation paths.
- Recover from optional graphics failures without a black output.
- Scale visual density before reducing the fidelity of combat rules.

These are architectural goals, not a promise that every device renders every
scene at a fixed frame rate.

## Boot and route isolation

The game entry, public home page, and public docs are separate Vite entries.
Visiting /home or /docs must not cause the browser to preload the game module
graph. This keeps presentation pages small and prevents an accidental garage
boot in the background.

Within the game entry, the first useful garage frame has priority. Essential
renderer, selected vehicle, garage environment, and primary interface work
arrives before optional combat and fleet work. Additional families, maps,
effects, wrecks, and diagnostics can warm in idle slices.

An opaque transition must be visible before asynchronous battle imports or
world loading. Hiding the menu before painting the transition can expose one
garage frame during a cold network handoff.

## Quality policy

src/engine/quality.js combines capability information with measured behavior.
Presentation controls include:

- internal resolution scale;
- antialiasing and post-processing;
- shadow-map resolution and shadow distance;
- texture and render-target sizes;
- vegetation and prop density;
- particle and effect budgets;
- optional background warmup.

Each control can degrade independently. A device that can handle geometry but
not a large post target should not be forced into an unrelated low-detail
fleet.

The simulation remains at 60 Hz. Armor plate count, movement rules, spotting,
damage, and authority do not change by visual tier.

## Render health and recovery

src/engine/deviceDiag.js probes scene output and optional render targets.
Temporary target operations always restore the previous renderer target in a
finally path before disposal. A readback or render failure may disable an
optional feature, but it must not leave future frames bound to an off-screen
target.

The scene-black watchdog runs after meaningful scene transitions, including
network battle entry. It distinguishes a legitimately dark frame from an
unintentionally empty or failed output using bounded diagnostic work.

## Frame ownership

One frame should synchronize each tank visual once. Network bridge application
updates game state; the main loop owns the final visual sync. Performing both
inside the bridge and again in the main loop doubles terrain support, wheel,
track, and transform work.

Common arrays and entity records in snapshot sampling and browser presentation
are reused. At 120 Hz, allocating a new scene-state graph every frame would
create avoidable garbage collection pressure even if the simulation itself is
fast.

Diagnostics remain dormant unless requested. F3 panels and traces must not
become hidden always-on observers in production play.

## Solo composition

Solo bots use the direct in-page composition. They do not instantiate WebRTC,
WebSocket, snapshot encoding, interpolation, reconciliation, or network
diagnostics. This preserves the latency-free path and its established
high-refresh behavior.

The core simulation rules remain shared with network authority. Sharing rules
does not require paying for a network boundary when no boundary exists.

## Network delivery cost

Authority runs at 60 Hz and sends state at 20 Hz. The state channel is
replaceable: old snapshots should not queue behind newer snapshots. Ordered
control and reliable one-shot events use a separate lane.

The browser samples a bounded snapshot buffer. Remote tanks interpolate.
The local tank predicts shared movement and reconciles. Snapshot decoding,
sampling, and presentation reuse storage where practical.

Ranked WebSocket delivery coalesces pending state even though the transport is
ordered, preventing obsolete frames from consuming the reliable queue.

## Effects burst control

Network events can arrive in a batch even when the original actions were
spread across authority ticks. Running every explosion, wreck swap, debris
emitter, smoke column, and audio effect synchronously can create a long task.

src/net/presentationEventQueue.js classifies work:

- durable and critical state applies immediately;
- inexpensive presentation may run immediately;
- heavy cosmetic effects enter a bounded per-frame admission queue.

This changes presentation scheduling, not chronology or outcome. The queue
retains event identity and cause so destruction remains correct while the
expensive visual layers are spread across frames.

## Canvas readback

Canvas 2D contexts that are repeatedly read with getImageData should be created
with the willReadFrequently option. This avoids the browser warning and lets
the implementation choose a readback-appropriate backing strategy.

The option should be used only for genuinely readback-heavy canvases. It can
reduce GPU acceleration for draw-heavy canvases, so it is not a global flag.

## Asset and geometry policy

Playable tanks are assembled from first-party code and cached/generated
presentation assets. The runtime no longer loads comparison GLBs for playable
vehicles. Public builds also remove quarantined source material, reducing
artifact size and eliminating obsolete source-loading branches from the public
path.

Vehicle portraits, silhouettes, and diagrams are generated ahead of time.
The garage does not need to reconstruct armor diagrams by reading pixels from
live tank frames.

## World reuse

Generated worlds can be cached by map. Re-entry restores visibility and resets
match-specific destructible state without rebuilding immutable terrain,
materials, and dressing unless required.

Map building is chunked and transition-covered. Dedicated authority uses
pre-generated collision manifests and does not instantiate Three.js worlds.

## Measurement

Press F3 for live render and network diagnostics.

Use the development flight recorder:

    npm run perf:dev

Use the cold-load probe:

    npm run perf:cold

Use the transition-stall gate:

    npm run perf:transitions

This drives cold Studio-to-garage, cold garage-to-battle, battle-to-garage,
and cached-rematch paths. It records both total duration and the largest
requestAnimationFrame gap, attributes Long Tasks to the visible loading stage,
and includes the first two destination frames so work cannot be moved just
past the loading veil. A run made while another browser renderer or a saturated
host is competing for CPU/GPU is reported as `REFUSED`, not as a valid pass or
failure. Use `npm run perf:loading` for the exhaustive boot/map/Studio/tank
selection matrix.

Use the network render probe:

    npm run test:net:render

See DEV-PERF-TRACE.md for trace fields and MOBILE-QA.md for sustained mobile
test procedure and evidence history.

## Reporting a performance result

Record:

- device and operating system;
- browser version;
- viewport and device pixel ratio;
- quality tier and internal render scale;
- route and battlefield;
- selected vehicles and bot/player count;
- warm or cold load;
- diagnostic overlays;
- average frame time, percentile frame time, and longest gap;
- whether the issue is CPU, GPU, network, or asset-loading bound.

A single frames-per-second number without this context is not a useful
regression record.

## Performance invariants

- No network stack in solo unless explicitly requested.
- No duplicate tank visual synchronization in one frame.
- No unbounded catch-up loop after a long pause.
- No replaceable snapshot backlog.
- No expensive event burst monopolizing a frame.
- No trace in ordinary production; optimized QA recording requires explicit
  `?debug=1` opt-in.
- No game-graph preload from /home or /docs.
- No public comparison-asset loading for a playable tank.
- No quality setting changes simulation truth.
- No failed diagnostic leaves an off-screen render target bound.
- No transition certification from a host-contended measurement window.
- No browser-level second upscale on phone-size viewports: the final WebGL
  backing store is native through DPR 3 while under the 4 MP mobile output
  budget. Adaptive scene/post density remains an independent performance
  lever and its reconstruction mode is exposed in telemetry.
