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
- Avoid display-rate work and unbounded GPU/heap residency on static screens.
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

The inverse boundary is equally strict: Bots intent does not transfer room
coordination, network battle launch/activation, bridge, status, or chat code.
Those owners share one coalesced, retryable access object and load only after a
Private, LAN, or Ranked signal. In the 2026-08-30 production bundle this moved
six orchestration owners out of the initial graph, reducing its exact gzip sum
from 597,724 to 591,306 bytes and the main entry from about 185.4 to 181.1 kB
gzip. A clean browser trace made zero matching requests through Garage boot and
Bots hover, then fetched the complete orchestration, bridge, and chat graph on
Private intent.

Solo loading, covered deployment, and Garage return/rematch also use stable
typed access facades backed by one retryable lazy owner. Their implementation
modules and large concrete adapter objects are created only on first use. The
2026-08-30 production build moved the main entry from 485.11 kB raw / 181.51 kB
gzip to 474.05 kB raw / 177.28 kB gzip and emitted the three owners as separate
1.39-2.31 kB gzip chunks. Cache-disabled constrained diagnostics moved from
6.98 s wall / 2.28 s app readiness to 6.20 s / 1.64 s on the same host; timing
is diagnostic because host/network noise remains, while the bundle boundary is
deterministic. Failed-main, failed-evaluation, and selected-builder recovery all
completed without a refresh loop.

The selected battlefield module may preload after the garage settles, but the
world itself starts only from explicit solo Battle intent or a joined room's
fixed host-map intent. Combat FX and killcam code are battle/Studio chunks and
are constructed once behind an opaque entry gate. Garage browsing must not
compete with a background terrain, vegetation, or shader build.

Optional garage construction shares one typed idle-work coordinator. Explicit
exact-map intent, adjacent-card texture paint, Battle-intent world generation,
and Garage surface warming are mutually exclusive main-thread lanes with
deterministic priority.
Each producer retains its own cancellation and frame-budget policy, but it must
release the shared lease before waiting for the next construction slice. This
prevents several individually cooperative jobs from combining into a visible
long task while preserving every authored scene and vehicle detail.

Adjacent garage cards prefetch both their texture bakes and their owning
profile-family chunks. Studio transfers its route chunk on nav hover/focus/
touch but does not construct the authoring runtime until entry. These boundaries
keep demand loading without making a card or route click pay the cold parse.

Verdant uses its restored authored indoor workshop; the other nine locations
are bounded authentic scene packs. Their 41x37 terrain grids are generated from
exact battlefield spawn heightfields, then consumed without importing a terrain
or map runtime. Connected landmarks come from the same
first-party structure kits as the battlefields and are composed in canonical
camera space so they cannot disappear behind the hero or side panels. Distant
vegetation uses the real tree kits; ground cover is one immutable instanced
draw; two wrecks reuse a generated 208-triangle proxy of the real first-party
M1A2 silhouette; and nine 512px Garage-specific albedo/normal pairs preserve
material identity without decoding the full map texture set. A low-cost finite
vertex-color sky and three terrain-derived relief bands close the horizon so
every camera ray resolves to a deliberate background rather than the renderer
clear color.

An outdoor pack stays between 16 and 18 draws and approximately 15.8K–21.6K
triangles, including 10–28 real trees, static ground cover, five connected
structures, two wreck silhouettes, three horizon layers, two complete service
bays, 100–423 facility props, 40–365 loose parts, and one or two baked service
vehicles. Cinder's 132 rail segments remain inside the same merged buckets.
The controller retains only the active and previous packs. Tiny colorless
receivers under Verdant's opaque podium seed the exact outdoor material/CSM
variants during the already-covered first frame; their two 1x1 local textures
add no request or decode work. The nine small texture sets then warm
incrementally offscreen after interactive readiness. A persisted outdoor choice
is presented beneath the boot cover immediately and starts the same transaction,
so reload cannot strand a hidden pack on the renderer clear color. Stale rapid-
switch promises never become visible. The former hidden
four-tank workshop and its hundreds of thousands of triangles are retired, and
the compatibility owner builds zero geometry.

One frozen presentation pose is shared by the stage, hero pedestal, return path,
and camera runtime. There are no per-location heading or camera branches. The
Garage phase owns one stable light set so switching cannot relink shaders through
a changing light count; inactive Verdant fixtures retain their objects at zero
intensity. Static environment geometry receives the frozen Garage shadow but
does not cast into live CSM updates. One shadowless bounce illuminates the hero
without another shadow map. On battle entry, phase residency releases every
scene-pack geometry and warmed Garage texture; return restores only the selected
pack behind the opaque transition.

Garage selector previews still decode only when demanded. `npm run qa:garage`
enumerates all ten locations and checks map bindings, authentic source receipts,
dormant world residency, terrain/landmark/draw budgets, canonical hero contact
and pose, persistence, preview decode, console health, rapid intent convergence,
thirty complete cache cycles, and responsive 1180x820 plus 390x844 layouts.
Revealed frame gaps remain under 120 ms under CDP 4x CPU throttling.
`npm run garage:terrain:check` rejects generated excerpt drift and
`npm run garage:wreck:check` rejects first-party wreck-proxy drift, while
`npm run perf:resources:gate` proves Garage resources leave GPU residency during
battle and return behind cover.

An opaque transition must be visible before asynchronous battle imports or
world loading. Hiding the menu before painting the transition can expose one
garage frame during a cold network handoff.

## Quality policy

src/engine/quality.ts combines capability information with measured behavior.
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

src/engine/deviceDiag.ts probes scene output and optional render targets.
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

The Garage workshop finalizes once after its last quiet-window build slice.
Every static descendant bakes its local transform, and sub-40 cm fittings leave
the two shadow cascades while remaining unchanged in the color pass. Authored
tank shadow proxies are exempt. Exact repeated meshes become instances; the
remaining compatible, opaque, semantic-free workshop surfaces merge by material
and render state in root-local space. The finalizer publishes exact batching,
released-geometry, and before/after caster receipts to the phase-resource probe.
The distant repair and salvage exhibits use a standalone low-tessellation
primitive catalog patterned after named fleet components; the selectable tank
remains full quality. Assemblies retain their semantic roots while repeated
wheels, track shoes and armor cassettes are instanced. A
settled Garage is event-invalidated and paints only once per five-second safety
window. It also reuses completed CSM depth maps with zero shadow submissions.
Input, resize, streamed visual work, spring motion, and vehicle switching wake
display-rate presentation and force fresh shadows immediately.

Garage and battle roots are phase-exclusive scene residents. An inactive phase
is detached from the Three.js scene rather than merely hidden, so renderer
projection and matrix traversal cannot reach it. The complete CPU-side scene
graph remains retained. While battle owns the renderer, the inactive workshop
releases its renewable geometry buffers and texture allocations, but retains
material programs: releasing those programs created dozens of unused
light-count variants and a return-transition compile spike. One covered real
Garage frame restores the exact buffers and textures before reveal; isolated
`compileAsync` is forbidden because it compiles variants the displayed Garage
does not use.

Every forward warm also targets the same linear-HDR working space as
`SceneAAPass`. Compiling a Garage hero, battlefield, wreck, or effects root
against the default sRGB framebuffer creates a distinct Three.js program key
that the composer never presents. `garageGpuWarmRuntime.ts` owns the bounded
first-frame sequence, and the shared forward-program owner is the only compile
port exposed to later phase lifecycles. This keeps cold ANGLE state submission
without retaining a duplicate framebuffer-specific shader family.

Ordinary live presentation reads the height field's warmed one-metre bilinear
cache for camera clearance, HUD, effects, running gear, and other non-authoring
queries. Deterministic Studio/marketing captures retain the analytic terrain
function. Both paths resolve the same authored surface; the cache error is
smaller than the rendered terrain mesh discretization. Far-grass construction
keeps a half-chunk lookahead—enough for more than three seconds at 72 km/h—so
invisible 12,000-candidate jobs do not occupy the opening live drive.

Immutable battlefield subtrees finalize their world matrices once and opt out
of recursive matrix traversal. Legitimate runtime world motion continues
through instance buffers, uniforms, geometry-LOD swaps, and visibility. Do not
freeze a subtree that owns an animated Object3D transform.

Terrain chunk topology is shared per battlefield and LOD. The exact surface
and skirt indices fit in Uint16 and one immutable attribute is referenced by
every 96×96, 48×48, or 24×24 chunk at that level. This removes duplicate
JavaScript arrays and GPU element buffers without changing vertex positions,
normals, triangles, materials, LOD transitions, or collision.
Streamed levels not mounted on the current terrain meshes are registered with
the world root's resource lifetime, so cache eviction releases their uploaded
buffers as well as the active scene tree.

Structure detail is paid at build time, not traversal time. Landmark façade
parts are merged into the already-present plaster/stone/wood/roof/dark/glass
batches. Repeated destructible buildings are two instanced pools (intact and
broken), and settled instances require no per-frame transform work. Normal and
packed AO/roughness textures supply surface relief without turning brickwork or
panels into high-density geometry.

Repeated structures vary through one `InstancedMesh.instanceColor` attribute,
not cloned materials. The tint is seeded from map, family, and authored slot;
destruction rewrites only the newly packed wreck color alongside its existing
one-time matrix write. Connected facade bays, recessed window surrounds,
mullions, and louvers are flattened before upload, so the detail pass adds no
scene nodes, shader programs, materials, texture fetches, or live update work.
Glass reflects the shared PMREM environment rather than paying for a separate
screen-space-reflection pass.

Destructible shadow submission is size- and role-aware. Complete buildings,
cover, walls, fences, large silhouettes, and moving topple actors remain CSM
casters. Sub-meter grounded clutter receives the same lighting, GTAO, and world
shadows but does not submit a separate tiny silhouette into every cascade.
This removes shadow-pass work without changing visible geometry, collision, or
destruction state.

The HUD reticle keeps its live CanvasTexture and caches the last complete paint
signature. It repaints for aim, reload, shell, hit, fade, viewport, or mode
changes, but a stable sight picture does not replay the same Canvas2D commands
at the display refresh rate.

Common arrays and entity records in snapshot sampling and browser presentation
are reused. At 120 Hz, allocating a new scene-state graph every frame would
create avoidable garbage collection pressure even if the simulation itself is
fast.

The browser presentation clock is capped at 60 Hz, matching the authoritative
simulation. A 120 Hz or ProMotion display therefore cannot submit the complete
scene, post stack, and near shadow cascades twice for the same simulation
cadence. The cap advances against the browser timestamp rather than sleeping,
so non-divisible refresh rates remain phase-correct without accumulating drift.
Real background tabs and unfocused browser windows cancel their outstanding
animation callback and perform no presentation work. A focused embedded pane
that reports itself hidden retains the bounded recovery path required for live
controls; that exception never applies to an unfocused tab.

Diagnostics remain dormant unless requested. F3 panels and traces must not
become hidden always-on observers in production play.

`npm run perf:resources:gate` is the non-FPS release contract. It measures
browser task/script CPU, forced-GC heap, shader programs, renderer-owned
geometries/textures, visible scene geometries/materials/texture pixels, scene
ownership, complete-frame draw calls/triangles, shadow masks, cache residency,
Garage paint cadence, and animation-versus-idle clock cadence across initial
Garage, live battle, and returned Garage. The probe pins one mixed modern 7v7
roster and waits for all fourteen visuals, preventing random vehicle selection
from hiding a resource regression. Near shadows remain current while the two
distant cascades refresh together at 20 Hz. Their shared timestamp matters:
CSM fade samples both maps in one pixel, so alternating them made a moving
forest swap between two shadow states. Withholding the near pair on that same
frame also made the foreground sample a stale camera pose, so far-refresh
frames intentionally submit all four cascades. Each distant cascade holds its
snapped projection until that cohort refresh. Independent shadow-call and
shadow-triangle ceilings remain, and the limits track the measured production
baseline rather than serving as loose theoretical maxima.

The rendered stability audit separately covers raw CSM motion and the final
post-composed frame. Receiver normal bias scales with each cascade's physical
texel footprint, bounded tightly enough to retain near contact while preventing
far terrain and vegetation acne. Temporal GTAO may preserve brighter history
to reject a one-frame dark pulse, but never carries stale darkness onto a newly
exposed surface. These policies add no render pass, texture, or frame-loop
allocation.

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

src/net/presentationEventQueue.ts classifies work:

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

Static tank wrecks use the production procedural builders and settled-death
pose, then collapse to position/normal/vertex-color geometry under the world's
one baked wreck material. Their factory request therefore uses the explicit
`geometry-only` material mode: it preserves the normal production builder,
running gear, batching, articulation, shadow proxy, and final triangle stream,
but never enters the shared camouflage/normal/roughness/track/burn Canvas2D
cache and skips presentation-only contact and burn-material scans. A controlled
2026-08-30 cold-browser comparison across nine representative modern wrecks
fell from 752.0 ms to 327.4 ms (-56.5%). Every per-vehicle position SHA-256,
triangle count, bound, and shadow proxy matched the rendered-material baseline.
The broader Ruinspires loading probe was refused as certification because the
host GPU was concurrently saturated; retain the isolated parity benchmark as
the attribution evidence, not as a whole-map release claim.

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

Responsive composition is owned by `src/ui/responsiveLayout.ts`. Components
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

This passive-world policy was superseded on 2026-08-27: an idle Garage is not
evidence that the player will battle, so it no longer parses or constructs a
map. World work now requires Battle hover/focus/touch, a joined room with a
fixed map, or covered entry.

### 2026-08-26 exact opening terrain residency

The opening world used to allocate all three terrain LOD buffers inside 430 m
even though only one could render. Initial residency now contains only the
exact visible level: near tiles start at LOD 0, mid tiles at LOD 1, and far
tiles at LOD 2. The existing one-job look-ahead restores every missing coarse
fallback during the frozen deployment countdown while the higher-detail
visible geometry remains in place, so rollout retains the complete visual LOD
policy without an opening allocation spike.

The standalone stream benchmark records 64 initial geometries, 192 complete
geometries, and no stream job longer than 6.4 ms. Current exact-visible
residency takes 462.3 ms versus 693.3 ms for eager all-LOD construction, a
33.3% reduction. Host contention can invalidate end-to-end wall-clock figures;
the deterministic residency counts, bounded jobs, and before-rollout
completion remain the acceptance evidence.

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

### 2026-08-26 transition acquisition and garage retention

Cold solo entry now starts the battle interface transfer beside world, roster,
audio, and combat-runtime acquisition instead of after them. Network entry
similarly overlaps client signaling with module and world acquisition. Browser
hosts still wait for the Three.js world because their local authority consumes
its exact collision owner; clients and dedicated sessions do not inherit that
dependency. Rematches accept synchronous reuse of an existing match owner as
well as a fresh asynchronous connection.

At that point, the desktop garage retained ten recently displayed pedestal
visuals so browsing
the principal modern fleet does not repeatedly reconstruct the vehicles just
visited; verified revisits complete without a builder wait. Battle entry trims
that cache to three visuals (one on mobile) before roster construction, keeping
the responsiveness gain out of the live-scene memory budget. The 2026-08-27
resource pass superseded those cache and timer values: desktop residency is
four pedestal visuals, two worlds, and two detached rematch visuals; passive
map construction was removed entirely.

### 2026-08-27 static-phase CPU and residency

Performance gates now measure phase CPU, forced-GC heap, scene cardinality,
renderer residency, complete-frame draw/primitive work, cache ownership, and
render cadence—not FPS alone. A settled Garage paints at a 0.2 Hz watchdog
cadence, but input and camera motion immediately restore display-rate frames.
The showroom camera no longer walks the selected tank subtree to calculate
bounds that fixed framing discards, and a settled camera solve runs only on a
watchdog paint rather than every display frame.

The production probe is `npm run perf:resources`; its enforceable form is
`npm run perf:resources:gate`. It runs Garage idle, a live solo battle, and
returned Garage in one browser so leaks and hidden ownership remain visible.
The probe accumulates renderer diagnostics across the complete scene, shadow,
and post stack; it does not mistake the composer's final fullscreen triangle
for the complete frame.

At 1280×577 and DPR 1, the current exact production receipt holds initial and
returned Garage CPU at 0.004/0.004 core-equivalent with one watchdog WebGL paint
every four seconds. The initial Garage occupies 63.3 MB forced-GC heap, 844
scene objects, 276 renderer geometries, 88 renderer textures, and 290
complete-frame calls. Four of those textures are tiny `BatchedMesh`
matrix/indirection data;
the actual visible scene owns 70 textures totaling 11.13 million pixels.
These are independent release limits: a high displayed FPS does not compensate
for excess retained memory, scene traversal, or GPU object residency.

The same probe attributes native shadow-map work separately from the forward
and post stack and reports conservative scene-owner, texture-source, and
shader-program residency. In the measured battle, the role-aware destructible
policy reduced the comparable median shadow submission from 272 to 224 calls;
vegetation, props, and terrain remain the largest color-scene geometry owners.
This distinction prevents a lower final-pass counter or a high FPS result from
hiding excess scene traversal, texture memory, program diversity, or shadow
work.

The subsequent display-work pass kept the pinned roster, camera, viewport,
quality, and complete visual scene unchanged. Static midfield grass chunks now
carry conservative instance bounds, allowing the renderer to reject whole
chunks behind the camera. Non-player vehicle presentation outside a generous
viewport guard band advances articulated hierarchy and running gear at 30 Hz
with accumulated elapsed time; simulation, effects, shadows, the player, and
every on-screen actor retain their existing cadence, and viewport re-entry
forces an exact first-frame pose. The opening terrain cache also warms a narrow
spawn-heading corridor and the first 120 m of bot routes behind the deployment
veil instead of synchronously computing those tiles during rollout.

On the identical production resource scenario, active task CPU moved from
0.474 to 0.334 core-equivalent, forced-GC heap from 268.7 to 264.6 MB, median
complete-frame submissions from 586 to 573, and median submitted triangles
from 3,599,773 to 3,485,145. Programs, renderer geometries, textures, scene
objects, shadow policy, and Garage residency did not increase. The initial
Garage remained asleep at 0.003 core-equivalent and 64.1 MB. These numbers are
a controlled before/after regression receipt, not a cross-device FPS claim.

Authored low-polygon tank, canopy, and wreck shadow proxies now live on a
dedicated shadow-only render layer. Three.js otherwise submits a
`colorWrite: false` proxy during the forward pass even though it cannot change
the image. At the same production viewport this removed roughly 21 invisible
forward draws and 90,000 forward-pass triangle submissions per battle frame,
while the exact native-shadow receipt remained unchanged at 267 calls and
1.31 million triangles. The optimization changes neither visible geometry nor
shadow geometry.

Destroyed-only char and ember atlases are also demand-owned. Constructing a
live or showroom tank no longer bakes those canvases merely because its
material vocabulary contains a wreck fallback. The covered battle warm patches
the roster's ordinary materials directly, uploads the shared atlases, and draws
one isolated fallback probe only when an exact non-patchable source exists. It
does not instantiate and render a second destroyed copy of every fielded tank.
`setDestroyed()` remains the synchronous correctness fallback for callers that
deliberately bypass the warm owner. The production path retains eight fewer
renderer textures in both active battle and returned Garage, with the same
explosion, burn-front, ember, and rematch visuals.

Network snapshot reconciliation clears impact decals before applying a newly
destroyed visual. This ordering matters: decals deliberately omit vertex
normals, so treating a still-attached decal as vehicle geometry would replace
it with the opaque wreck fallback, add physical/depth shader permutations, and
turn first destruction into live shader work. The browser capacity gate records
program births after its combat baseline and rejects the associated frame gap.

After these measurements, the enforced heap, shader, geometry, texture,
scene-cardinality, complete-frame call, and triangle ceilings were tightened
around the healthy production envelope. The current battle gate fails above
300 MB forced-GC heap, 1,150 active scene objects, 230 programs, 600 geometries,
300 renderer textures, 680 visible geometries, 220 visible materials, 120
visible textures, 27 million visible texture pixels, 780 complete-frame calls,
or 4.8 million triangle submissions. Those peak submission ceilings describe
the visually-correct all-cascade far-refresh frame; main-thread work retains an
independent 11.5 ms/render ceiling and ordinary near-only frames remain smaller.
The probe still reports absolute core residency, but does not gate on it because
the same work consumes twice the cores when the headless compositor presents at
60 Hz instead of 30 Hz.
Returned Garage has independent 215 MB, 1,000-object, 256-program,
510-geometry, 166-renderer-texture, 475-visible-geometry, 200-visible-material,
82-visible-texture, 15-million-visible-pixel, and 525-call limits so a high-FPS static screen
cannot hide leaked battle residency. Initial Garage independently fails above
74 MB, 900 objects, 96 programs, 300 geometries, 95 renderer textures, 450
visible geometries, 200 visible materials, 82 visible textures, 12 million
visible texture pixels, or 525 calls.

## Submission and world-data round — 2026-08-27

The mostly static Garage first instances exact repeated opaque workshop props
by shared geometry, material, render state, and world transform. It then merges
compatible one-off opaque, semantic-free surfaces by material and render state
in root-local space. Transparent, skinned, specialized, child-owning, and
authored fleet-exhibit meshes remain independent. This preserves the exact
visible surfaces and materials while reducing a complete Garage frame from 733
to 508 draw calls. The production receipt records 137 meshes in 31 instance
batches plus 98 meshes in 21 merged batches: 183 submissions removed and 97
now-unreferenced source geometries released.

Mutually exclusive phase roots are also detached. A live battle therefore does
not traverse the workshop, pedestal, or Garage lights; the returned Garage does
not traverse the retained battlefield. Detachment preserves shaders, textures,
world state, rematch speed, and the exact visible result while shrinking active
battle scene cardinality from 1,925 objects to 1,116 in the measured run.

The baked environment-prop payload no longer enters the battlefield as 1.2 MB
of JavaScript numeric literals. Its authored JSON remains the reviewable source;
the production path fetches one deterministic gzip archive containing exact
Float32 streams and Uint16 indices, starts that transfer alongside terrain
construction, and exposes zero-copy typed-array views after decompression. The
map chunk fell from about 1.51 MB / 279 KB gzip to 268 KB / 94 KB gzip. The
190.7 KB archive overlaps terrain and avoids constructing hundreds of thousands
of boxed parser values. Browsers without `DecompressionStream` demand-load the
legacy JSON fallback rather than placing it on the common path.

At 1280×577, DPR 1, production Chromium, the resulting pinned-roster phase
receipt was:

| Phase | Core equivalent | Forced-GC heap | Scene objects | Programs | Renderer geometries | Renderer textures | Calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial Garage | 0.004 | 63.3 MB | 844 | 54 | 276 | 88 | 290 |
| Active 14-tank battle | 0.439 | 264.5 MB | 1,116 | 193 | 556 | 292 | 648 |
| Returned Garage | 0.004 | 183.5 MB | 880 | 227 | 498 | 162 | 291 |

The same frames contained 442/648/467 visible geometries, 174/214/193 visible
materials, and 70/117/80 visible textures for initial Garage, battle, and
returned Garage respectively. Their visible texture footprints were
11.13/26.06/14.21 million pixels. Separating renderer internals from visible
content keeps static batching data honest without weakening the content budget.

Relative to the immediately preceding production baseline, static repair-bay
batching removed 18 Garage objects, 6 renderer geometries, and 12 complete-frame
draws while preserving all 237,341 submitted Garage triangles. The structure
shadow policy removed roughly 48 median CSM submissions in the comparable
battle without deleting a structure, destructible state, collider, or visible
surface.

A fresh 14-player browser-host certification reached controllable network play
in 7.459 seconds, including 1.548 seconds of exact roster construction and 957
ms of covered combat warming. Its natural full match fired 55 shots from all 14
participants, produced no live frame gaps above 40 ms, no hard prediction
snaps, and no browser errors. These receipts measure CPU, heap,
shader/texture/geometry residency, and complete-frame work in addition to
display rate.

The 2026-08-30 cold-entry lifecycle gate repeated two complete natural 7v7
matches after separating opaque render cover from network progress. The
host-rendered run fired 56 shots from all 14 actors at 16.7 ms p95 / 30.7 ms
maximum frame gap; the remote-rendered run fired 55 at 16.6 ms p95 / 18.7 ms
maximum. Both recorded zero pre-combat and live hard snaps, retained all room
members after the result, cleared readiness, and required no shared browser
storage or warmed participant profile.

The first-ever GPU-process path now passes the same cold gate. At 1.6 Mbps,
150 ms latency, and 4× CPU slowdown, four cache-disabled profiles reached the
complete Garage in 6.210–6.267 seconds wall time / 1.712–1.770 seconds app boot
time; the pristine first GPU profile was 6.251 / 1.754 seconds. The previous
18.5-second outlier compiled the complete scene against the default sRGB
framebuffer and then linked it again for the composer's linear-HDR target;
target-correct submission reduced initial Garage residency from 92 programs
to 54. Injected main-module download, module-evaluation, and selected-builder
failures still recovered automatically without a manual refresh. The eight-
second wall and 2.5-second app budgets were not weakened.

Passive Garage dwell must report zero resident worlds; desktop
pedestal/world/rematch caches must stay within 4/2/2 respectively.

Loading audio begins before these barriers and remains independent of the full
audio graph. A production-path PCM probe captured the battle loader at 48 kHz
with a -25.9 dBFS peak and -33.6 dBFS RMS. A fresh-context 7v7 remote-client
gate then opened fourteen isolated Chromium profiles, synchronized the lobby,
entered the match, and completed live firing with zero prediction hard snaps;
its rendered p95 frame gap was 12.1 ms and maximum gap was 16.9 ms.

The complete host-plus-impaired-client gate was repeated after moving the
deployment queue into its strict-TypeScript owner. Both natural matches used
fourteen pristine profiles and all fourteen players fired. Host rendering
reported an 11.0 ms p95 and 24.4 ms maximum frame gap; the impaired client
reported a 17.9 ms p95 and 26.2 ms maximum. Both paths recorded zero hard
snaps, with worst authority steps of 2.0 ms and 1.7 ms respectively. The
50 ms live-freeze threshold was not relaxed for the refactor.

Repository star counts are release metadata and no longer issue direct
`api.github.com` requests from the browser. Those decorative requests were
rate-limited by shared public IP, produced two 403 console errors during a
pristine 7v7 certification, and supplied no gameplay value. Boot and Garage
render the packaged verified count without creating a third-party dependency.
Static localhost previews also skip the same-origin serverless endpoint that is
known not to exist there, eliminating decorative 404 console noise.

## Typed runtime and coherent-shadow follow-up — 2026-08-30

The completed TypeScript graph retained every authored vehicle, battlefield,
effect, shadow map, and game rule while making phase ownership enforceable.
Combat effects now leave the active scene and release renewable GPU allocations
on Garage return. Relative to the immediately preceding production build, this
removed 29 attached objects, 19 renderer geometries, 8 renderer textures, 14
programs, 18 visible materials, and 10 visible textures from the returned
Garage. Re-entry reuses the same CPU pool and restores it behind the covered
battle warm, so there is no visual or gameplay downgrade.

The CSM scheduler no longer combines a continuously submitted near pair with a
scheduled far pair. Ordinary frames alternate complete near and far cohorts,
with both maps in each cohort sharing one camera, snapped projection, and
vegetation-LOD timestamp. The production probe reduced the worst ordinary
shadow frame from roughly 350 calls / 2.2 million shadow triangles to at most
176 calls / 1.26 million shadow triangles. Map resolution, caster geometry,
lighting, and fade quality are unchanged.

At 1280×577, DPR 1, production Chromium, the pinned modern 14-tank receipt now
measures 70.9/283.0/208.5 MB forced-GC heap and 95/227/252 programs for initial
Garage, active battle, and returned Garage. The corresponding visible scene
counts are 427/670/429 geometries, 197/216/198 materials, and 79/119/79
textures. Settled initial and returned Garage submit zero shadow work; the
eight-second task-residency samples consumed 0.031 and 0.040 of one CPU core.
The thresholds above were re-seated around this larger, current first-party
fleet/workshop baseline. CPU, complete-frame draw, shadow, cache, and
phase-detachment limits were not loosened. The total-triangle ceiling moved by
2.7%, from 3.75 to 3.85 million, because pooled combat-effect timing moved the
same far-cohort frame between 3.67 and 3.81 million across repeated runs; no
visible geometry or effect was removed merely to satisfy the older receipt.

Cold-load certification now fails on latency as well as eventual readiness.
Under the standard 4× CPU slowdown, 150 ms RTT, 1.6 Mbps download, and 750 Kbps
upload profile, every cache-disabled first visit must reach `__GAME_READY`
within 8 seconds and spend no more than 2.5 seconds in post-transfer
application work. A three-profile deployed-production run completed in
6.119–6.444 seconds wall and 1.473–1.512 seconds of application work. Separate
injected main-download, main-evaluation, and selected-builder failures
recovered without a manual refresh.

Optional off-main work is also bounded. A module worker that never posts a
result or error previously left the deferred cloud promise pending forever;
the first battlefield could then remain at “Sealing the battlefield” even
though the Garage was ready. Cloud baking now has a three-second deadline from
worker creation, terminates the failed worker, retains any completed layer, and
finishes the exact remaining texture locally. A new browser session reached an
uncached Fjord battle in 2.65 seconds after the fix (1.64 seconds world build,
23 ms activation, 0 ms cloud wait).

The rendered shadow stability gate now describes the manual coherent-cohort
scheduler rather than the retired native `autoUpdate` path. Ultra, High,
Medium, and Low produced zero visibly changed motion samples against force-all
cascade rendering; a real Fjord drive passed with no WebGL/shader error, a
16.7 ms median frame, and stable tree-caster LOD removal.

The cascade light-camera fit is now independently dirty-checked from shadow
depth submission. A stationary camera retains its exact snapped fit while
moving tanks continue to redraw the same scheduled depth maps. On the pinned
14-vehicle production resource route this reduced active-battle CPU residency
from 0.463–0.499 to 0.401 core equivalent before the near-continuity correction;
the integrated continuous-near route measured 9.7–9.8 ms of main-thread task
time per rendered frame (0.294 core at 30 Hz and 0.583 core at 60 Hz). The
corrected far-refresh frame peaks at 769 calls and 4.76 million triangle
submissions, while preserving the same resolutions and scene residency. All
four rendered quality audits and all 20 battlefield shadow audits passed after
the change.
`phase-resource-probe.mjs` accepts
`--cpu-profile-out <path>` when a DevTools CPU profile is needed to attribute a
future regression without changing the measured workload.

### 2026-08-31 Garage entry and environment-demand correction

A clean production Lighthouse trace and a dedicated five-second post-ready
probe exposed work that the older network-idle measurements hid: all nine
outdoor environments, 125 full-resolution fleet portraits, every map picker
image, and rotating gallery media continued to transfer or build after the
Garage declared itself playable. The Garage now loads only viewport-near
portraits and maps, starts the gallery on one 44 kB derivative, and prepares an
outdoor scene only from exact destination intent. Repeated service-yard
primitives use static instanced batches; all authored transforms and submitted
triangles remain unchanged.

Under Lighthouse's clean mobile profile, the comparable production build
moved from 6.77 MB to 1.08 MB transferred, 252 to 106 requests, 17.82 to 3.54
seconds of main-thread work, 16.33 to 2.61 seconds of JavaScript boot work, and
11.19 seconds to 659 ms total blocking time. The score moved from 30 to 44; the
remaining 6.2/7.6-second FCP/LCP values are Lighthouse simulation, while the
trace observes the inline loading wordmark at roughly 0.49 seconds.

At 4× CPU slowdown the dedicated Garage-entry gate reaches ready in 2.16
seconds (1.89 seconds app boot), then records 38.8 ms maximum / 35.8 ms p95
frame gaps, zero long tasks, 0.091 core-equivalent task residency, 49 MB heap,
and zero unused Garage texture requests during the next five seconds. A native
all-ten-environment lap records 17–18 ms p95 transitions, 25.1 ms maximum over
thirty complete cache-eviction cycles, 6.9 MB forced-GC heap growth, and a
two-pack cache. Cinder and Ironworks visual receipts retain their rails,
platforms, service stations, clutter, lighting, and canonical tank framing.

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
- No presentation cadence above the 60 Hz simulation clock.
- No animation or render work in an unfocused tab/window.
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
- No unselected Garage environment construction or texture upload from passive
  idle. Selector intent may preload the code chunk; only exact destination
  intent may prepare one scene pack, and the two-pack cache remains bounded.
- No eager full-fleet portrait or complete battlefield-thumbnail transfer on
  Garage entry. Viewport proximity owns those requests; selected content may
  reveal immediately.
- No numeric environment-geometry JSON in the common battlefield module graph;
  regenerate and validate the packed archive after authoring-source changes.
- No one-draw-per-prop submission for exact repeated opaque workshop meshes.
- No serial profile-chunk await inside roster visual construction.
- No track deformation or instance upload for an unchanged parked/off-screen actor.
- No display-rate hierarchy sync for a non-player actor wholly outside the
  presentation-camera guard band; re-entry must synchronize immediately.
- No map-wide grass chunk may opt out of conservative frustum rejection.
- No stable reticle Canvas2D repaint at the display refresh rate.
- No `colorWrite: false` authored shadow proxy on the presentation-camera
  layer; route it through `markShadowOnly()` and preserve native shadow work.
- No browser-level second upscale on phone-size viewports: the final WebGL
  backing store is native through DPR 3 while under the 4 MP mobile output
  budget. Adaptive scene/post density remains an independent performance
  lever and its reconstruction mode is exposed in telemetry.
