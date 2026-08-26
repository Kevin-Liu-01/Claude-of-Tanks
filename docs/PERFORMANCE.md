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

Fleet demand loading is profile-module granular. The plain-data fleet manifest
maps every playable id to its owning profile module, and a known battle roster
loads all required modules concurrently before visual construction begins. Do
not put the fleet builders back into four country-sized chunks or await the
first builder of each family inside a serial vehicle loop.

Solo Battle hover/focus/touch is an explicit preload boundary. It resolves the
deterministic next solo roster without mutating the battle ordinal, transfers
only those profile families, starts the selected map promise, and decodes the
shipped deterministic FX atlases. Private/LAN/Ranked intent must not start that
solo warm: it transfers the selected network handoff instead. Once a room is
joined, its exact roster families transfer concurrently and a fixed host map
may build behind the garage-lull gate; Random remains unresolved until start.

The selected battlefield module may preload after the garage settles, but the
world itself starts only from explicit solo Battle intent or a joined room's
fixed host-map intent. Combat FX and killcam code are battle/Studio chunks and
are constructed once behind an opaque entry gate. Garage browsing must not
compete with a background terrain, vegetation, or shader build.

Optional garage construction shares one typed idle-work coordinator. Exact-map
intent, adjacent-card texture paint, background world generation, and workshop
dressing are mutually exclusive main-thread lanes with deterministic priority.
Each producer retains its own cancellation and frame-budget policy, but it must
release the shared lease before waiting for the next construction slice. This
prevents several individually cooperative jobs from combining into a visible
long task while preserving every authored scene and vehicle detail.

Adjacent garage cards prefetch both their texture bakes and their owning
profile-family chunks. Studio transfers its route chunk on nav hover/focus/
touch but does not construct the authoring runtime until entry. These boundaries
keep demand loading without making a card or route click pay the cold parse.

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

Running gear is presentation-dirty, not frame-dirty. Track deformation and
instance-buffer uploads run when pose, scroll, terrain settling, damage state,
or visibility changes. Off-screen remote actors retain their last exact gear
matrices and force one exact catch-up when they return to the camera guard.
Nearby and player running gear keeps the full authored update rate.

Immutable battlefield subtrees finalize their world matrices once and opt out
of recursive matrix traversal. Legitimate runtime world motion continues
through instance buffers, uniforms, geometry-LOD swaps, and visibility. Do not
freeze a subtree that owns an animated Object3D transform.

The HUD reticle keeps its live CanvasTexture and caches the last complete paint
signature. It repaints for aim, reload, shell, hit, fade, viewport, or mode
changes, but a stable sight picture does not replay the same Canvas2D commands
at the display refresh rate.

Common arrays and entity records in snapshot sampling and browser presentation
are reused. At 120 Hz, allocating a new scene-state graph every frame would
create avoidable garbage collection pressure even if the simulation itself is
fast.

Diagnostics remain dormant unless requested. F3 panels and traces must not
become hidden always-on observers in production play.

Combat warming has two ownership phases. The opaque loader builds the exact
roster, presents one real deployment-camera frame, and prepares only opening
effects plus per-roster wreck materials. Full destruction/prop families,
hidden LODs, remaining shadows, scope variants, and deterministic bot routes
run in bounded slices during the frozen deployment countdown. Rollout holds at
one second until that queue finishes. Warm receipts are round-scoped so a new
map, camouflage set, or vehicle family cannot inherit a false "already warm"
state from the previous match; WebGL and browser caches remain reusable.

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

Map building is chunked and transition-covered. Opaque loaders yield tasks at a
tight CPU budget while guaranteeing periodic progress paints; visible garage
work continues to use the stricter per-frame yielder. The deployment area's
fast height tiles, bot spawn tiles, initial bot routes, visible grass cache, and
near/mid terrain LODs are complete before rollout. Distant terrain remains
streamed. Dedicated authority uses pre-generated collision manifests and does
not instantiate Three.js worlds.

Deferred combat compilation must receive the FX subtree explicitly. Passing the
whole scene to an effects-only warm repeats every terrain/tank program and can
turn a bounded countdown job into a second-scale stall.

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

See DEV-PERF-TRACE.md for trace fields.

## Mobile and full-session verification

Mobile release checks use optimized production output, not the development
server and not absolute FPS from a software-rendered iOS simulator. Run:

    npm run qa:trace
    npm run qa:device
    npm run qa:device:stress
    npm run qa:device:software

The native profile exercises the host GPU, constrained applies deterministic
CPU and memory pressure, and software is a portability/shader floor. Reports,
traces, and screenshots are written below ignored `.qa-device/`; they are
release artifacts, not maintained documentation.

Each device lap covers garage idle, repeated vehicle selection, cold battle
entry, look/drive/fire/fight, rematch, a second map, orientation changes,
lifecycle freeze/resume, and WebGL context loss/recovery. It records long
tasks, rAF percentiles, renderer resource counts, retained heap, and cache
limits. A result is valid only when the machine-contention stamp accepts it;
software-renderer FPS must never be presented as physical-device performance.

Responsive composition is owned by `src/ui/responsiveLayout.js`. Components
consume its width, height, input, and panel-mode semantics rather than growing
their own device-label breakpoints. Native display density and internal scene
resolution remain independent: phones retain native DOM/canvas presentation,
while the 3D renderer may scale within the output-pixel and quality budgets.

For multiplayer, release evidence must include two fresh browser profiles with
empty storage and caches completing create, invite-link join, ready, an entire
match, result, rematch, reload/reconnect, and explicit leave. Reusing a browser
that has already cached fleet, map, ICE, or session data is a warm-path test,
not first-visit certification.

### 2026-08-24 loading and rollout receipt

The exact comparison base for this pass is `de2b45c3`. Repeated, alternating
production probes on the same host measured:

- main entry gzip: 370.61 kB -> 299.32 kB (-19.2%);
- complete garage JavaScript transfer: 1,034,013 B -> approximately 941 kB
  (-9.0%);
- 1.6 Mbit/s, 150 ms RTT, 4x-CPU cold load: 9.13 s -> 8.24 s;
- cold hero-vehicle stage: 0.96 s -> 0.47 s;
- cold first-battle diagnostic: 7.85 s -> 5.78 s (-26.3%);
- the accidental effects-only full-scene pass: 1.68 s -> 0.24 s;
- final constrained first-live ten seconds: 52.5 FPS, p95 24.3 ms, maximum
  32.1 ms, zero program births, zero natural long tasks, and zero freezes;
- final normal first-live ten seconds: 53.9 FPS in the headless harness, p95
  23.3 ms, maximum 26.8 ms, with the same zero-birth/zero-stall result;
- visible native-browser validation: 117-125 FPS with p95 10.3-10.6 ms. The
  final intent-preloaded Ruinspires entry took 4.80 s from click to reveal.

The transition tool correctly refused formal certification for the first-battle
pair because unrelated interactive GPU and geometry-audit processes exceeded
the host-contention limits; preserve that caveat rather than promoting the
diagnostic pair to release evidence. The independently scoped normal and
constrained entry gates passed. In the final cold trace the round-specific
deferred queue took 0.27 s, finished with 4.72 s left in deployment, and
produced no post-rollout shader work.

### 2026-08-25 lazy-boundary audit

The production bundle inventory confirmed that the expensive runtime chunks
should remain split: the battlefield runtime is 1,498 kB raw / 276 kB gzip,
profile families range up to 241 kB raw / 72 kB gzip, FX is 130/41 kB,
killcam 81/29 kB, audio 64/21 kB, and Studio 96/31 kB. Eagerly restoring those
to the initial garage graph would regress first-useful-frame transfer and parse
cost. The audit changed where their existing promises begin instead:

- adjacent garage cards transfer their family chunks in the same quiet window
  that already pre-bakes their textures;
- Private/LAN/Ranked Battle hover no longer starts an irrelevant solo roster
  and battlefield build;
- multiplayer mode intent transfers the bridge, status, chat, and matching
  handoff; a joined waiting room transfers its exact roster families and may
  build a fixed host map only behind the garage-lull gate;
- Studio transfers on desktop/mobile nav intent and constructs its runtime only
  after entry.
- landing-page videos transfer just before their section enters view and retain
  a paused source for 8-30 seconds by device class, avoiding the former 1.2-second
  scroll-away/scroll-back reload loop.

Random room maps, actual vehicle geometry, combat FX construction, AudioContext
creation, and full world construction without explicit intent remain deferred.
Wall-clock certification still requires an uncontended `npm run perf:loading`
run; bundle sizes and the loading-intent self-test are host-independent gates.

### 2026-08-26 battle-client boot boundary

The ordinary garage graph no longer includes armor tracing, damage resolution,
ballistics, aiming, special-action mutation, or rendered drive-test controls.
`battleClientAccess.ts` starts their retryable transfer on Battle intent and
every battle entry barrier awaits it before simulation can begin. Garage UI
uses the small pure `specialActionPolicy.ts` metadata module instead.

In three cache-disabled constrained first-visit runs, initial JavaScript
transfer fell from about 730 KB to about 707 KB. End-to-end cold readiness was
host-noise limited and remained around 9.2–9.8 seconds, so this is treated as a
transfer/ownership improvement rather than a claimed wall-time breakthrough.
The production mobile battle probe crossed the new boundary successfully at
6.735 seconds click-to-battle and 8.743 seconds click-to-control; certification
was correctly refused because the host was contended, so those figures are
diagnostic rather than release certification.

### 2026-08-26 garage quiet-window correction

The 4× CPU mobile switch profile showed that a cold modern vehicle converged
in 1.32 seconds, but the speculative world/neighbor queue immediately produced
idle-frame gaps up to 1.03 seconds. Exact hover/focus intent remains immediate;
passive neighbor work now waits 1.8 seconds and passive world construction
waits four seconds after the latest garage activity. On the same contended
host, the repeat profile reported a 73.5 ms maximum idle-prefetch gap and zero
idle freezes. The cold Merkava switch itself remained under its 2.5-second
budget at 1.53 seconds. These measurements diagnose scheduling behavior rather
than certify absolute device latency.

### 2026-08-26 production-path warm correction

The first-battle trace showed that shader submission alone was insufficient:
the default framebuffer produced the wrong color-path variants, hiding light
roots produced the wrong lighting variants, and the opening/destruction pools
were then staged again during countdown. Target-aware typed warm owners now
compile against the linear HDR composer target, retain the production light
set, consume new uniform tables cooperatively, and restore every temporary
renderer and scene flag. WebGL context restoration invalidates their receipts.

A diagnostic mobile production run on Steppe completed click-to-visible in
3.53 seconds and click-to-control in 5.53 seconds. Its complete entry warm was
0.86 seconds; the exact covered FX bind was 0.17 seconds, and the remaining
countdown queue was 0.31 seconds with 1.69 seconds still available before
rollout. The probe refused formal certification because other headless/GPU
work was active, so these numbers describe the corrected path rather than a
release claim. The maintained invariant is stronger than the number: no effect
family may be regenerated merely to warm a program already bound by the same
production transition.

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
- No full battlefield construction from passive garage idle.
- No serial profile-chunk await inside roster visual construction.
- No track deformation or instance upload for an unchanged parked/off-screen actor.
- No stable reticle Canvas2D repaint at the display refresh rate.
- No browser-level second upscale on phone-size viewports: the final WebGL
  backing store is native through DPR 3 while under the 4 MP mobile output
  budget. Adaptive scene/post density remains an independent performance
  lever and its reconstruction mode is exposed in telemetry.
