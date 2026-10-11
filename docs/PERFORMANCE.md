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

### Presentation measurements

Battle presentation currently admits at most 60 frames per second on an
absolute deadline grid; the deterministic simulation remains 60 Hz. A bounded
early-callback allowance (1.5 ms at this cap) avoids unnecessarily missing a
display slot. It does not rebase the grid or increase the cap.

`tools/perfprobe.mjs` acquisition `perfprobe-submission-v3` measures intervals
between positive renderer-submission observations. Browser callbacks skipped by
the presentation scheduler remain in separate `nativeCallbacks` arrays. The
older `perfprobe-raf-v2` results counted those callbacks as frames and must not
be compared with v3 as one FPS series. Neither protocol measures GPU completion
or display scanout. The terminal unfinished interval is recorded explicitly;
incomplete or invalid samples refuse certification, and any failed budget exits
nonzero. Idle, event-driven Garage output is not a 60 FPS benchmark: use the
Garage action/transition probes for responsiveness instead.

The [matrix reuse and cadence follow-up](history/research/frame-matrix-reuse-20260910.md)
records native pixel parity, measured battle intervals, unsuccessful acquisitions,
and limitations without attributing untraced historical stalls to a guessed cause.

The 2026-09-07 [urgent fleet construction/style pass](tank-generation/fleet-style-performance-priority.md)
tracks the owner's report of slower tank selection and suspected excessive
triangle counts in new X/Revolution and older Challenger builds. It requires
per-ID cost attribution, reusable quality-aware primitives and real cold/warm/
rapid-switch measurements. That backlog is open; it is not an assertion that
triangles alone explain the latency or that fleet optimization has passed.

The [Garage switch profile](performance/garage-switch-profile-20260925.md)
(2026-09-25) closed FSP-01's measurement and the reported stalls:
`tools/garage-switch-probe.mjs --profile` records long tasks, the runtime's
`__GARAGE_SWITCH` stage spans, program deltas and frame gaps per selection on
a production preview. The stall was not triangle count: the first frame with a
new hero blocked on its deferred shader links (0.25–1.1 s), the core builder
step is one 50–120 ms task, and revisits rebuilt through a four-entry LRU. The
pedestal now prepares links before reveal and builds the two adjacent cards in
the quiet window (desktop residency six); `tools/garage-switch-probe.selftest.mjs`
gates warm switches in the post group.

Tank energy highlights stay on the existing vehicle surfaces and add no geometry
or draw calls. Stable models no longer undergo periodic recursive scans: hierarchy
change listeners discover streamed parts, while a flat binding check catches repaired
materials. The listeners are released with the effect. Each style evaluates only its
own wave pattern instead of computing the Juggernaut pattern before replacing it.
The original localized hit-ripple calculation and bounded six-contact pool are
preserved; the rim uses a simple squared falloff.

`node tools/tank-energy.browser.mjs` renders the real M1A2 with one and fourteen
vehicles, quiet and impact-active effects, and saves screenshots and timing receipts
under `.qa-dev/tank-energy/`. It uses native GPU queries when available and explicitly
labels the render-plus-flush fallback. Set `COT_ENERGY_BASELINE` to a Vite-served copy
of the previous effect module for a paired comparison. These isolated effect samples
are not whole-game FPS measurements; the game still needs its normal battle checks.

Mode previews use the same readiness principle. Opening the mode selector
transfers the optional preview code; it does not start preparing a battlefield.
Only the actual launch controls signal deployment intent. Juggernaut, CTF and
Infected share their compiled energy materials and change pattern/color uniforms.
The current Garage tank also retains these materials when switching to an ordinary
mode: a zero-strength branch restores the original paint, and returning to an aura
applies uniforms immediately without entering the pending preparation state. This
cache is bounded to the current tank and released on tank replacement or battle
entry. Garage shaders omit the battle-only hit-ripple calculations; battle effects
retain the full contact animation. First-time preparation uses the actual Garage
forward and late-FX render targets and layer masks to avoid another program variant
on reveal.
The selected preview prepares new equipment and shader links before its first
visible frame, retaining the previous complete canvas while menus and the network
pump remain active. Tank or mode changes cancel superseded preparation, and battle
entry cancels all pending Garage work. Mobile tank switches also wait for bounded
shader preparation instead of deferring that cost to the reveal frame.

Solo and multiplayer loading install the initial vehicle mode effects before
shader preparation. `garageModePreviewRuntime.selftest.mjs` covers cancellation,
readiness and retry; `tools/garage-mode-preview.browser.mjs` records mode timing,
checks material reuse across ordinary-mode round trips and rapid selections,
records program counts and animation-frame gaps, and captures desktop, phone landscape
and battle-return views. Timing receipts include menu interaction, so they are
end-to-end readiness measurements, not isolated GPU compile durations.

AC-130 entry prepares an aircraft-only flight anchor rather than the selected
tank. Solo and multiplayer skip the pilot's tank builder, camouflage textures,
and damage-panel masks while still preparing ground escorts. Loading rosters
identify pilots as AC-130 aircraft. Flight anchors are disposed on exit and cannot
enter either the Garage hero cache or the reusable tank pool.

## Build-local procedural plaster relief

The second and third procedural plaster palettes retain independent albedo
textures and materials, but share their identical 256² normal and packed
AO/roughness textures within one props build. The primary plaster remains
exclusive because sourced building images replace its backing textures in
place. No cache survives its world owner, and retained-material disposal
deduplicates the shared pair even when one palette has no geometry.

`node src/world/plasterSurfaceSharing.selftest.mjs` requires the pinned native
Canvas rasterizer and compares exact pixels and material/shader state with a
frozen pre-sharing painter across seeds, tones and anisotropy settings. It also
checks replacement isolation, empty-bucket ownership and repeated GPU
suspension/final eviction. Construction removes two textures and 131,072 pixels
(524,288 base RGBA bytes) per props build without changing geometry or palette
variety. Scene/native residency savings depend on both palettes being attached
and uploaded; this allocation proof is not a browser timing or resource-gate
pass, and does not resolve the other recorded resource-budget excesses.

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
draw; and nine 512px Garage-specific albedo/normal pairs preserve material
identity without decoding the full map texture set. Environment packs contain
no tank-shaped fallback meshes. The existing quiet-window workshop streamer
provides four fleet-exact service exhibits and their real turret, gun, armor,
wheel, track, and rack components once for every Garage. The shared procedural
engine sky and three terrain-derived relief bands close the horizon so every
camera ray resolves to a deliberate background rather than the renderer clear
color.

An outdoor pack stays between 23 and 25 draws and approximately 19.7K–36.7K
triangles in the production browser probe, including real trees, static ground
cover, seven connected map-native structures, three
horizon layers, two complete service bays, 143–615 support-certified facade
fixtures, four PBR facility material classes, at least three assembled operating
machines, and distributed service terraces. The shared full-detail vehicle and
component set is streamed separately after Garage readiness. Cinder's
three complete rail roads remain inside the same merged buckets.
The controller retains only the active and previous packs. Tiny colorless
receivers under Verdant's opaque podium seed the exact outdoor material/CSM
variants during the already-covered first frame; their two 1x1 local textures
add no request or decode work. The nine small texture sets then warm
incrementally offscreen after interactive readiness. A persisted outdoor choice
is presented beneath the boot cover immediately and starts the same transaction,
so reload cannot strand a hidden pack on the renderer clear color. Stale rapid-
switch promises never become visible. One modern four-bay maintenance graph is
demand-loaded in quiet slices after readiness, optimized once, and shared by
all ten environments. Its static Burlak, Abrams, T-90M, and K2 displays surround
the podium without per-frame update work or per-variant duplication;
Verdant's extra wall clutter remains a separate visibility branch. The Abrams
bay merges as its own nested display owner (a few extra draws) so a switch
can move it between Verdant's canister station and the outdoor station.

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
Each non-Verdant environment is bounded to 23-25 draw calls and
19,732-36,624 triangles despite carrying seven map-native buildings, 143-615
support-certified facade fixtures, one continuous terrain-following approach,
and distributed service terraces. Cinder's
three-road fan contributes 39 connected route segments and 216 rail details;
all nine packs report zero structure/facility overlaps and a maximum facade
support gap of 0.015 m.
`garageQualityRubric.ts` scores structural integrity, functional story,
four-quadrant composition, map identity, material detail, and performance on a
strict 100-point receipt. Criteria are atomic: a floating member, overlap,
missing service machine, proxy vehicle, blocked hero view, resource overage, or
transition stall loses its entire criterion instead of being averaged away.
The production probe pairs that receipt with default/left/rear/right captures
for human visual adjudication.
`npm run garage:terrain:check` rejects generated excerpt drift, while
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
The four repair and salvage exhibits retain their complete first-party
high-detail geometry and ordinary `ai`-resolution PBR material tier. Their
procedural geometry is generated by an optional worker containing only the
Burlak, Abrams, T-90 and K2 families, then transferred as typed attributes and
reconstructed in cooperative frame slices during separate quiet leases. Exact
worker-computed bounds travel with each geometry, so the render thread never
rescans transferred vertex buffers. This removes the synchronous T-90M
construction atom from the render thread without putting the remaining fleet
into Garage boot. The final dedicated ten-variant probe measured a 45.7 ms
worst workshop frame at normal speed and 73.5 ms under 4x CPU throttling, down
from the original 416 ms, while retaining 373,380 workshop triangles. Assemblies retain their semantic roots while
repeated wheels, track shoes and armor cassettes are instanced. A
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

Authority runs at 60 Hz and publishes state at 20 Hz over one reliable ordered
channel per seat: snapshots are deltas against the viewer's acknowledged
baseline with a keyframe every two seconds, and a visible entity's row refreshes
every snapshot when near or engaged, every second in the middle band, every
third far away (`server/match/interestTiers.ts`).

The browser samples a bounded snapshot buffer. Remote tanks interpolate.
The local tank predicts shared movement and reconciles. Snapshot decoding,
sampling, and presentation reuse storage where practical.

The transport counts a drop instead of queueing a frame that would leave more
than 64 KB unsent, and a refusal sustained for 5 s closes the link as
`backpressure` rather than letting obsolete state pile up behind control traffic.

## Effects burst control

Network events can arrive in a batch even when the original actions were
spread across authority ticks. Running every explosion, wreck swap, debris
emitter, smoke column, and audio effect synchronously can create a long task.

`src/mp/match/events.ts` bounds the release:

- a reliable event is released only once the presentation renders the tick it
  belongs to; the viewer's own accepted shots bypass that delay;
- at most three events per rendered frame, and a heavy one (shot, hit, impact,
  destruction, prop) ends the flush.

This changes presentation scheduling, not chronology or outcome. The events
keep their order and cause, so destruction remains correct while the expensive
visual layers are spread across frames.

## Canvas readback

Canvas 2D contexts that are repeatedly read with getImageData should be created
with the willReadFrequently option. This avoids the browser warning and lets
the implementation choose a readback-appropriate backing strategy.

The option should be used only for genuinely readback-heavy canvases. It can
reduce GPU acceleration for draw-heavy canvases, so it is not a global flag.

## Workers share the page's chunks (2026-10-02)

Vite bundles every `new Worker(new URL(...))` as a separate build, so a worker that imports the fleet used to
re-emit every page module it reaches under other hashes: the wreck bake worker's graph was 12.40 MB raw /
2.26 MB brotli and the Garage workshop worker's 2.53 MB, all of it page code. `tools/viteSharedWorkers.ts` (a
build-only plugin listed in `vite.config.ts`) emits those two workers as entries of the page build instead, so
they statically import the chunk files the page loads and the browser serves them from its HTTP cache. Two
details keep page chunks unchanged and safe in a worker: Vite's preload helper is guarded (no `document`: import
directly; no `window`: rethrow), and the Garage worker gets a private copy of the stateless 298-byte
`profileBuilderAdapter.ts` so the page's `fleetFactory` chunk is not split (that split would add a request to
the game and gallery boot). The workers execute exactly their source static closures (199 and 154 repository
modules, plus `three.core` and the helper); a misconfigured worker, an unused private copy or a changed helper
fails the build (`tools/viteSharedWorkers.selftest.mjs` builds a fixture and runs its worker in a realm with
no `document`, with the unguarded helper as the failing control).

Measured: `dist/assets` 954 files / 34.86 MB → 682 / 27.66 MB; a fresh-profile session (Garage boot, the
five workshop exhibits, a solo battle on Desert with its five wreck donors) fetched 312 → 275 `/assets` files,
16.16 → 11.21 MB raw, 3.800 → 2.744 MB brotli; the game, gallery, home, docs and 404 boot closures keep their
request counts. Both workers' replies were byte-identical between the two builds in headless Chrome (the
workshop's `begin` message differs only in its `buildMs` timing field). The match host worker keeps its own
bundle: its spec-only graph would split four boot chunks (+5 game / +4 gallery requests) or pull the builder
core into the host. The small sky, cloud, schematic, painter and texture workers are single self-contained
files. Baking wrecks on the main thread instead would cost 36–158 ms per donor (Node, first bake) as single
long tasks under the loading countdown, which is why the worker stays.

## Shader programs minified at build (2026-10-02)

The game's shader programs ship as JS literals with long explanatory comments. `tools/viteGlslMinify.ts` (a
build-only transform listed in `vite.config.ts`) removes GLSL comments, line-start indentation, trailing
whitespace and blank lines from the literals under `src/` that hold a complete stage (`void main() {`). It never
joins lines (every `#` directive stays on its own line and starts it), never changes text inside a line, never
touches `${…}` interpolations, tagged templates or a literal's outer edges, and leaves a literal alone when a
comment could continue past it. Library shaders (three's chunks, postprocessing) and shader fragments are never
rewritten: game code patches them by verbatim anchors, some indented across lines — the first cut also stripped
three's chunks and broke `lighting.ts`'s `'\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)'`
anchor ("shadow-density anchors not found", the boot never finished). Every rewrite is checked at build time (the
GLSL token stream and the directive lines must be unchanged, or the build fails), and
`tools/viteGlslMinify.selftest.mjs` checks all 66 project programs against the 37 patch anchors the source uses.

Measured: game boot 3,626,263 → 3,594,943 B raw and 871,651 → 861,280 B brotli (the entry chunk 775,316 →
744,287 B raw); 232 literal pieces, 47 kB of source. In headless Chrome every program linked in both builds
(Garage 88/88, Studio Desert 159–182), with no console or page error, and the Desert Studio capture differed from
the unminified build by no more than two captures of one build differ from each other (23,292 px, max Δ 54,
against 22–27 thousand px, max Δ 29–60).

## Battle hull static draw merges (2026-10-02, P21)

Battle and Garage builds (`batchStatic`) fold every contiguous run of a hull's final coplanar depth-layer order
whose meshes share an articulation owner, material, vertex layout, raster flags, LOD switch, near-hull shadow and
distance-detail membership into one draw (`src/vehicles/staticDrawMerge.ts`). Every color-pass mesh has a unique
polygon offset (`installCoplanarDepthLayers`), so only a run with no foreign layer between its members can share
one offset without reversing a cross-mesh winner; unmerged meshes keep their exact layer and the run takes its
top layer. Only parts already at their owner's frame fold (every vertex byte and world matrix unchanged), at most
16,384 vertices per merged draw; running gear, ERA/equipment/weapon damage buffers, proxies, markings,
transparent, multi-material, instanced and batched meshes never fold. The merged draw's side table
(`staticMergeParts.ts`) keeps each source's name, userData, layer, geometry and frame chain; rest contact, the
presentation floor and the showroom framing box replay the sources exactly, and near-hull shadow casters,
distance-detail records, night lenses and smoke sockets move to the merged draw.

Measured (node census, near-visible forward draws, the 217-hull fleet; on the 219-tank tree the rewritten
national concepts and the two new hulls stay equal to the unmerged build draw for draw, and the new hulls fold
nothing): bots 58.2 → 55.8 per hull, player builds
58.8 → 56.4; the five Abrams source-X hulls (`m1a2_x`, `m1a2_tusk_x`, `m1a2_sepv2_x`, `m1a2_sepv3_x`,
`ua_m1a1_x`) −88 each, 76 hulls −1 or −2, 135 unchanged. The round-79 estimate (27 per hull) counted same-material
meshes regardless of layer order, LOD switch, shadow or detail class; folding across a foreign layer is not
pixel-exact. Same-build pairs (`?staticmerge=off`, one ABBA per map, a pinned 14v14 roster with one Abrams
source-X bot, headless High, 1600×900): at chase only the player and one or two bots are on screen (the other
hulls submitted just their off-screen `fx_impactDecals`, fixed below), so calls move by 0 to −6; an overview of the field drops
93 draws on Verdant Fields and Sirocco Wadi (tank forward 841 → 748), and the phone tier 93–102. An Abrams
source-X player hull is −87 to −89 calls in every chase frame and −181 to −184 with two in an overview. CPU
frame-time deltas stayed inside this loaded host's noise (GPU-bound 22–38 ms frames; the four seeded overview
pairs read −0.5 to −1.6 ms at p25). `staticDrawMerge.selftest.mjs` and the fleet-wide off/merged comparison
hold the merged scene equal draw for draw. Float-target captures (13 vehicles × bot and player builds × High and
Low × six cameras, every capture of a pose in one task, so the renderer's own run-to-run noise is exactly 0 px
and a 0.5 mm shift moves at least 31,962 px) were bit-identical in 302 of 312 pose captures; ten differed by one
pixel (`ua_m1a1_x` and `m1a2_sepv3_x` chase, `challenger_3x` at 140 m), from the polygon-offset compression
inside a run. The opt-in translation bake (`staticDrawMerge: 'translations'`, `?staticmerge=translations`) saves
more draws but moved up to 1,615 px (float rounding of baked positions), so it is not the default.

Impact decals now cull with their own quads. Each scarred hull's `fx_impactDecals` mesh had
`frustumCulled = false`, so an off-screen or distant hull with a scar still submitted that one draw every frame.
`writeQuad` (`src/fx/impactDecals.ts`) keeps the mesh's bounding sphere over the quads it writes (pool reuse
empties it) and the mesh uses the default culling; the covered network warm lifts culling on its staged scar for
that one draw. Same build, the pinned 14v14 roster, each pose read live and with the pre-fix submission restored
in the page (decal meshes unculled) as an ABBA (draw counts, so the pairs are exact): chase forward draws
319 → 309 on Verdant Fields, 304 → 295 on Sirocco Wadi and 301 → 291 at the phone tier, with ten of the 28 hulls
carrying a scar. The hulls that submit any draw fall from 13 to 3, 11 to 2 and 13 to 3. The overview, with
every scarred hull in view, is unchanged.

Those ten scars were the rare combat warm's own. It stamps one armour scar per fielded hull so its hidden-variant
compile prepares the impact-decal program inside every hull, and their only cleanup was the destruction warm's
`resetAll`, which a cached destruction warm skips; the covered deployment always warms destruction first. With
every bot frozen from the first battle frame (no shell fired), ten of the 28 hulls carried a scar at rollout on a
fresh profile and again on a second battle entry, on Verdant Fields and Sirocco Wadi: all on the player's side
(the enemies' countdown-built roots are detached, so the decal sweep drops theirs). The rare warm now clears exactly
the scars it stamped once that compile is done, or when it fails or is closed (`createCombatRareWarmSteps`): no
scarred hull in any of the four entries. The overview loses those ten draws (966 → 956 and 953 → 943 forward
calls); the rollout chase pose, with the scarred allies off screen and already culled, is unchanged (293 and 287).

## Frame budget (2026-10-02)

Owner target: desktop High holds 60 fps (16.7 ms) on a mid-range laptop GPU; phones keep their cheaper path.

### Method

`tools/frame-budget-probe.mjs` measures production builds (`vite preview`, one headless Chrome on hardware ANGLE,
the repo's capture flags) in A B B A slots. Each slot is a fresh page: the High preset pinned before boot, a solo
battle with the 14 v 14 sides switch and a pinned roster (`t90m_x` for the player, 27 opponents taken from the
sorted catalog, so every build of one catalog fields the same hulls), the sourced textures awaited, every bot frozen
and the governor pinned at full scale. Per viewport (1600×900 and 1920×1080 at device pixel ratio 1) and view
(`chase`, the hull-relative chase pose; `centre-far`, the battle overview) it settles, then samples whole frames and
the prefix decomposition through `tools/frame-pass-timer.mjs`:

- GPU per pass: one `EXT_disjoint_timer_query_webgl2` query per frame, from the frame's start to a checkpoint that
  rotates over the frame (world simulations, clouds, shadow maps, main scene draw, aerial, late FX, bloom, sun
  shafts, lens flare, grade, SMAA, upscale); a pass is the difference of consecutive checkpoint medians. Split
  queries (one per pass) over-count on ANGLE's Metal backend — their pieces summed to 4–5.5× the whole frame in the
  pilots, flushed or not — so they are a diagnostic only (`--segmented`).
- CPU per pass: `performance.now()` around the same boundaries (the main thread's render path), draw calls and
  triangles from `renderer.info`; `--profile` adds a CDP CPU profile at the first pose, self time per emitted chunk
  per frame, which attributes the work no label covers (the audio engine's per-frame update among it).
- Pairs: a delta is the median of the A B B A pair deltas, both shown. The machine is shared with other sessions'
  headless browsers; the probe records the load and the foreign GPU processes' CPU per slot. Under that load the
  whole-frame query reads high — in the pilots 20–55 ms against a presented interval of 16.5–16.7 ms, a span that
  includes other work rather than the frame's occupancy — so the tables lead with p25 and the paired deltas.
- Toggles (`--toggle=shadow-cache|sim-sleep`): A B B A blocks of a runtime switch inside one page and pose, with
  moving views (`chase@7`, the pose gliding over the ground at 7 m/s) where the cascades' snapped poses change.
- Light presets (the ground lane's holds 14–16, 2026-10-04): a control toggle — a uniform the shader never reads —
  swung −0.82 to +0.76 ms between quartets under other sessions' GPU load. The land-use block read 2.7–3.2 ms at Low
  in two holds and 0.4–1.1 ms in the next, and a fixed GPU ballast drawn every frame did not lower it. On this
  machine a light frame does not inflate a toggle's cost through an idle-clocked GPU; foreign GPU load does. Report a
  control beside any toggle under a millisecond, and take at least four quartets an arm.
- The pages' agreement (2026-10-05, the ground lane's hold 51): two pages of one dist can draw different scenes — the
  base drew 685 scene draws and 3.50 M triangles there, its twin 369 and 3.20 M, and the twin's −8.3 ms "null" compared
  the two — so every slot reads its scene's draws and triangles at the first pose before it measures, with a census of
  its visible meshes by subtree, and `judgeScenes` holds it against the slots before it. Scene identity is the twins'
  triangles (slots of one root) within `--twin-tris-tol` (3 %); draws may wander `--draws-tol` (25 %: dynamic culling
  moved them 3.8–5.9 % cycle to cycle within one dist on Verdant and ±11 % on mr2's chase pages while the triangles held
  within 1–3 %, and the draws only need to catch a gross difference such as hold 51's 46 %); another build's own delta is
  accepted once two of its stagings in a row repeat its triangles within `--stable-tol` (1 %). A slot that fails is
  staged again before it measures (three readings at most), an earlier slot the judgement implicates measures again at
  the end of the run, and a slot whose measured counts leave its staged reading, or a report row whose slots disagree,
  is VOID. Every sample records its scene draws and triangles. `--scene-check=off` is for a change that adds or removes
  draws on purpose.
- Unchanged pictures: `tools/shadow-cache-truth.mjs` renders every scenario through the cache and without it inside
  one page task (temporal AA and the cloud history held, so a frame is a function of the scene state) and runs the
  2026-09-12 consecutive-frame flicker meter on live frames; `tools/frame-capture-compare.mjs` compares the probe's
  `--shots` captures across builds on the pixels each build reproduces across its own two loads.

### The mid-range proxy

Measuring machine: Apple M5 Max, 40-core GPU. Proxy: GeForce RTX 4050 Laptop with a Ryzen 7 7840HS, the volume
gaming-laptop pairing. Throughput ratios from published results (notebookcheck):

| | RTX 4050 Laptop | M5 Max 40-core | ratio |
| --- | ---: | ---: | ---: |
| 3DMark Wild Life Extreme | 13,488 | 39,389 | 0.342 |
| 3DMark Steel Nomad Light | 7,254 | 16,191 | 0.448 |
| 3DMark Steel Nomad | 1,669 | 3,924 | 0.425 |
| Geekbench 6 single-core (7840HS / M5 Max) | 2,664 | 4,268 | 0.624 |

The projection takes the most conservative GPU ratio (Wild Life Extreme) and the single-core CPU ratio for the main
thread: `projected = max(GPU here / 0.342, main thread here / 0.624)`. For 16.7 ms on the proxy the frame must
take at most 5.7 ms of GPU here (7.5 ms at the Steel Nomad Light ratio) and 10.4 ms of main thread. The Radeon 780M
(the same CPU's iGPU) is 0.126 (Wild Life Extreme 4,945) to 0.171 (Steel Nomad Light 2,775) of this GPU — a third
of the 4050 — and would need 2.1–2.9 ms here.

### The changes

- Static shadow-caster cache (P20, `src/engine/shadowStaticCache.ts`). Each desktop cascade keeps a depth copy of
  the battle world's casters (the world root `map.ts` freezes after its build) rendered from the cascade's snapped
  light pose; a frame that keeps the pose and the static content copies it into the live map and draws only the
  dynamic casters on top (hulls, wrecks, effects, the cloud gobos, and any world caster seen changing on
  consecutive frames — a moored hull's bob, a falling tree, a toppling pole — until it has been still for a
  second). The static content is hashed every frame from what three's shadow traversal reads (visibility, layers,
  cast flag, geometry and draw range, materials and versions, world matrix, instance count and every instanced
  stream's version, the router's cascade masks); a change, a pose change (cascade snap, sun) or a map reallocation
  re-renders that layer. A cascade takes the cache only once its snapped pose has held for two lighting updates: a
  camera on the move re-snaps nearly every cascade every frame — on live frames, driving and turning, 315 of 315
  cached cascade renders were re-renders, each the ordinary render plus a copy and a second pass — so a moving
  cascade renders the ordinary way and the saving is the held camera's: a parked or aiming hull, the overview, a
  held sniper view. A reuse always copies the static layer back (a single-light render — the deployment warm, the
  covered prime — writes the live map without the cache seeing it). Phones keep the plain render. Cost: one depth
  copy per cascade (5 bytes a texel): 68 MB on High (2048² ×3 + 1024²), 52 MB on Medium, 273 MB on Ultra.
  Rendered proof (`tools/shadow-cache-truth.mjs`, Verdant Fields and Monsoon, 1600×900): the uncached render twice
  differs by 0 px, and every scenario — still, a hull moved and turned and back, camera steps of 0.37 m, 11 cm and
  1.8 m across the snaps, the sun turned 7° and back, a felled tree and a destroyed prop through 240 frames of their
  fall (the falling caster promoted to the dynamic layer), a hull driving past a still camera for 25 frames and a
  25-step camera dolly — renders 0 px apart through the cache and without it. On live frames (temporal AA on, the
  flicker meter's one-frame blips at 320×180, cache on and off in A B B A segments) driving and turning took no
  cached path at all (0 re-renders, 0 reuses: the ordinary render) and their blip counts differ by less than the
  segments of one mode do; parked, the cascades reused 258–315 of 315 renders, the blips stayed level or fell
  (Verdant 1.7 / 1.2 against 2.9 / 1.5, Monsoon 66 / 53 against 96 / 139) and the presented rate rose from 39 / 40
  to 47 / 49 fps on Verdant and from 38 / 35 to 48 / 51 fps on Monsoon on this shared machine.
- The governor (`src/engine/post.ts`, `adaptiveQualityPolicy.ts`, `gpuFrameTimer.ts`): High may now lower its
  raster on a native-density display (device pixel ratio below 1.75) down to `nativeDynMin` 0.67 per axis, FSR1's
  quality ratio, reconstructed by EASU + RCAS to the native canvas (retina keeps 0.9). Every fourth frame's GPU time
  is sampled; a window's median lets the policy predict an up-step's cost (taken only if
  `gpu × (next / now)² ≤ 0.85 × budget`), cut proportionally (at most two 0.09 steps) and leave a main-thread
  overload to the tier lever. A sample longer than 1.2 × the presented frame interval is not occupancy and is set
  aside, so a pessimistic timer can never hold the scale down. Without the extension (Firefox, Safari) the cadence
  rules decide as before.
- Default tiers (`quality.ts` `heuristicAutoCap`): discrete GPUs (RTX 4050 class and up) start on High with the
  governor; the RDNA iGPUs that name their model (Radeon 680M / 760M / 780M / 880M / 890M) and Intel's Arc iGPUs
  (Meteor Lake "Arc Graphics", Lunar Lake 130V / 140V) now start on Medium like the generic iGPUs; Strix Halo's
  8050S / 8060S and the RX / Pro / Arc A / B dGPUs stay uncapped.
- Idle simulations: the water-ripple field (512², up to three steps a frame) sleeps after 20 s without a hull in
  the water or a splash, set to rest (its largest wake is then ~1e-7 m) until the next disturbance; the tall-grass
  pressure field (256²) steps every eighth frame with the summed time while every stamp and the window hold (its
  max/decay step composes exactly), and steps every frame again the moment anything moves.
- The horizon ring bound to the terrain material builds no vista program: its own material only carries the
  relief atlas, the canopy tile and the haze the terrain bands and the ring forest read, and the empty face group
  that made three link and bind the vista program every frame is gone.
- Boot entry: the cache (`shadowStaticCache.ts`, loaded with the first battle world), the GPU timer (loaded at the
  governor's first decision over a battle world) and the r8 cascade caster proxies (`shadowCasterProxies.ts`, moved
  out of `lighting.ts` and imported when the first lighting rig is created) live outside the entry chunk: 762,514 →
  760,037 bytes raw and 227,873 → 227,153 brotli against the PR head (a24eb4770). Until a module arrives the ordinary path
  renders — every caster into every cascade (a proxy only drops instances outside its cascade, so the maps are the
  same), the cadence rules.

### Before / after (the PR head d3202245c against this branch)

A B B A slots per map (base, new, new, base: each cell lists a label's two slots), the pinned 14 v 14 roster, High,
the governor pinned at 1, each pose a still camera (the static shadow cache's case; a moving camera renders the
ordinary way). Draw calls are exact; CPU is the main thread's render path (world update to the end of the post
transaction); presented fps is the median frame interval at the game's 60 fps cap. The machine's load average ran
40–225 with other sessions' headless browsers on the GPU: the whole-frame GPU query (last column) reads 13–27 ms
while the same frames presented every 16.7 ms, so it measures spans with other work in them, not occupancy, and is
listed only for completeness; the prefix decomposition per pass was swamped the same way (negative steps) and is
kept in the probe's JSON only.

| pose | draws base → new | shadow draws | render-path CPU ms (base / base → new / new) | shadow CPU ms | presented fps | frame GPU p25 ms |
| --- | --- | --- | --- | --- | --- | --- |
| verdant · centre-far · 1600x900 | 500 / 421 → 261 / 261 | 297 / 218 → 60 / 60 | 7.5 / 7.2 → 5.7 / 6.3 | 2.4 / 1.9 → 1.0 / 1.2 | 60 / 61 → 60 / 60 | 17.4 / 14.5 → 18.8 / 17.6 |
| verdant · chase · 1600x900 | 774 / 777 → 538 / 521 | 369 / 369 → 135 / 118 | 11.3 / 11.3 → 7.8 / 7.8 | 3.8 / 3.8 → 1.6 / 1.4 | 61 / 61 → 60 / 60 | 18.4 / 20.0 → 19.7 / 19.2 |
| verdant · centre-far · 1920x1080 | 501 / 501 → 262 / 261 | 297 / 297 → 60 / 60 | 7.0 / 8.1 → 4.9 / 5.9 | 2.5 / 2.9 → 1.0 / 1.2 | 60 / 60 → 60 / 61 | 17.6 / 16.7 → 16.6 / 16.4 |
| verdant · chase · 1920x1080 | 774 / 777 → 538 / 538 | 369 / 369 → 135 / 135 | 10.9 / 12.4 → 8.1 / 8.3 | 3.3 / 4.3 → 1.7 / 1.9 | 60 / 60 → 60 / 59 | 19.9 / 20.0 → 20.4 / 18.5 |
| desert · centre-far · 1600x900 | 366 / 366 → 171 / 171 | 206 / 206 → 12 / 12 | 8.4 / 8.3 → 6.9 / 7.6 | 2.0 / 1.9 → 0.5 / 0.7 | 60 / 60 → 60 / 60 | 15.8 / 16.5 → 22.8 / 26.8 |
| desert · chase · 1600x900 | 590 / 586 → 419 / 434 | 289 / 289 → 121 / 138 | 9.6 / 14.6 → 8.2 / 12.6 | 3.3 / 5.0 → 2.0 / 3.3 | 61 / 56 → 61 / 55 | 13.3 / 15.4 → 18.3 / 25.9 |
| desert · centre-far · 1920x1080 | 378 / 379 → 183 / 184 | 206 / 206 → 12 / 12 | 7.0 / 5.8 → 5.5 / 5.7 | 2.0 / 1.5 → 0.6 / 0.4 | 60 / 60 → 61 / 60 | 15.2 / 18.7 → 20.0 / 22.3 |
| desert · chase · 1920x1080 | 588 / 584 → 434 / 415 | 289 / 289 → 138 / 121 | 9.8 / 9.6 → 8.3 / 8.3 | 3.5 / 3.4 → 2.2 / 1.8 | 59 / 60 → 60 / 60 | 21.4 / 22.2 → 22.2 / 24.4 |
| whiteout · centre-far · 1600x900 | 355 / 304 → 176 / 176 | 183 / 132 → 6 / 6 | 7.1 / 8.2 → 6.3 / 6.7 | 1.4 / 1.5 → 0.4 / 0.4 | 60 / 59 → 61 / 60 | 24.1 / 23.0 → 16.6 / 22.9 |
| whiteout · chase · 1600x900 | 634 / 645 → 451 / 448 | 322 / 322 → 129 / 129 | 9.5 / 10.9 → 8.6 / 8.8 | 2.9 / 3.7 → 2.1 / 1.9 | 61 / 60 → 60 / 60 | 21.6 / 21.1 → 18.4 / 19.1 |
| whiteout · centre-far · 1920x1080 | 355 / 355 → 177 / 178 | 183 / 183 → 8 / 8 | 6.5 / 6.5 → 5.4 / 7.2 | 1.6 / 1.4 → 0.5 / 0.8 | 60 / 60 → 60 / 59 | 23.8 / 25.7 → 22.8 / 27.1 |
| whiteout · chase · 1920x1080 | 569 / 649 → 436 / 448 | 256 / 325 → 112 / 128 | 9.2 / 11.3 → 9.5 / 10.7 | 2.6 / 3.9 → 2.2 / 2.5 | 60 / 60 → 60 / 59 | 25.4 / 26.8 → 21.0 / 26.3 |
| monsoon · centre-far · 1600x900 | 369 / 428 → 206 / 205 | 170 / 231 → 13 / 13 | 12.1 / 11.9 → 7.7 / 6.2 | 2.9 / 3.6 → 0.8 / 0.5 | 54 / 40 → 59 / 60 | 23.2 / 17.1 → 20.4 / 18.5 |
| monsoon · chase · 1600x900 | 671 / 600 → 456 / 456 | 318 / 244 → 104 / 104 | 13.7 / 16.8 → 10.1 / 7.8 | 4.6 / 5.0 → 2.3 / 1.4 | 34 / 44 → 59 / 60 | 70.7 / 61.1 → 20.1 / 23.1 |
| monsoon · centre-far · 1920x1080 | 438 / 378 → 217 / 214 | 231 / 170 → 9 / 9 | 11.4 / 9.2 → 5.5 / 5.8 | 3.6 / 2.6 → 0.4 / 0.5 | 58 / 59 → 60 / 60 | 17.8 / 20.1 → 18.1 / 20.2 |
| monsoon · chase · 1920x1080 | 670 / 598 → 455 / 471 | 318 / 244 → 104 / 121 | 16.4 / 16.0 → 8.9 / 9.3 | 5.8 / 4.7 → 1.9 / 2.1 | 49 / 35 → 60 / 60 | 38.9 / 22.5 → 21.8 / 21.8 |

What the rows show: the cache removes 135–240 draws a frame at a held camera (shadow draws 132–369 → 6–138, the
dynamic hulls and cloud gobos are what remain) and 1–3.5 ms of shadow CPU; the render path falls 1–3.5 ms on Verdant
Fields and Sirocco Wadi, 0.2–1 ms on Whiteout and 4–7 ms on Monsoon, where the base build fell to 34–58 fps at
three of four poses (its main thread had 1.3 ms of idle a frame in the CDP profile against 6.4 ms in the new build)
and the new one held 59–60. The audio engine's per-frame main-thread work is a 0.07–0.12 ms line item in both
builds (CDP self time of its chunks). Across builds the captures differ on pixels both builds reproduce only along
the borders of animated regions: Whiteout 0 px at all four poses, Verdant and Sirocco 3–171 px (grass blades
beside a hull, a distant forest edge), Monsoon 158–1,105 px except the 1080p overview, the slot's last capture,
whose cloud field — and its shadow on the ground — had drifted differently (the base build's slower frames
reached it later); the cache's rendered proof is the in-page comparison above.

### The cache in one page (`--toggle=shadow-cache`)

Cache on and off in A B B A blocks at one pose of one page, 1600×900, all four maps (off / off → on / on):

| pose | draws | render-path CPU ms | shadow CPU ms |
| --- | --- | --- | --- |
| Verdant chase | 753 / 674 → 519 / 519 | 11.2 / 11.1 → 9.6 / 10.3 | 3.5 / 3.2 → 2.0 / 2.4 |
| Verdant overview | 498 / 499 → 262 / 245 | 8.1 / 7.8 → 6.6 / 6.4 | 2.7 / 2.8 → 1.4 / 1.1 |
| Sirocco chase | 522 / 587 → 436 / 419 | 8.9 / 8.9 → 7.5 / 7.9 | 2.4 / 2.6 → 1.6 / 1.6 |
| Sirocco overview | 318 / 329 → 176 / 181 | 7.9 / 6.4 → 5.6 / 5.5 | 1.3 / 1.3 → 0.4 / 0.4 |
| Whiteout chase | 627 / 627 → 434 / 418 | 9.5 / 10.8 → 8.4 / 7.9 | 3.1 / 3.6 → 1.9 / 1.6 |
| Whiteout overview | 301 / 352 → 177 / 177 | 7.2 / 5.3 → 4.9 / 4.8 | 1.2 / 1.1 → 0.4 / 0.5 |
| Monsoon chase | 670 / 669 → 473 / 455 | 9.7 / 9.2 → 8.0 / 8.1 | 3.1 / 2.9 → 1.8 / 1.7 |
| Monsoon overview | 424 / 429 → 204 / 207 | 7.1 / 7.0 → 5.6 / 5.5 | 1.6 / 1.7 → 0.4 / 0.4 |
| moving chase (`chase@7`, 7 m/s), every map | equal within the blocks' spread | equal within the blocks' spread | equal |

The moving pose takes no cached path — 0–3 reuses in 1,152–1,159 cascade renders, every cascade re-snapping every
frame and rendering the ordinary way — so the cache costs nothing there; at the held poses 1,131–1,158 of the
cascade renders were reuses (4–24 re-renders: the first held frame, and at the overview 3–6 static-content
changes during the sample). Every block presented at the 60 fps cap except one Whiteout block during a load spike,
so the GPU saving shows only as throughput below the cap: in the parked flicker segments above (TAA on, frames
under the cap) the presented rate rose 8–13 fps with the cache on (39 / 40 → 47 / 49 on Verdant, 38 / 35 → 48 / 51
on Monsoon).

### The governor's scale (`--scales=1,0.82,0.67`, 1920×1080)

High pinned at each step of the governor's ladder down to its native-density floor, Verdant Fields and Whiteout,
chase and overview: the 3D view keeps 74–78 % of its native edge energy (summed luminance gradients outside the
HUD) at 0.82 and 69–74 % at 0.67, reconstructed by EASU + RCAS (the HUD stays native); the whole-frame GPU p25 fell
17–28 % at 0.67 on this shared GPU (Verdant chase 27.1 → 22.8 → 19.4 ms), where a GPU-bound laptop would shed up
to 55 % of its raster work. The policy's own state machine — the predicted up-step, the proportional cut, the
main-thread guard, the trust rule — is held by `resolutionGovernor.selftest.mjs`: driven by a frame model of a
4050-class GPU (8 ms fixed + 18 ms × scale², a 9 ms main thread, vsync-quantized presentation) it settles at a
scale between 0.67 and 0.85 inside the budget within 8 s and makes no change from 20 s to the end of the two-minute
run, where the
cadence-only rules probe upward and are pushed back periodically; a 21 ms main thread keeps full resolution.

### Projected mid-range frame

- Main thread. The new build's render path at a held camera is 4.9–10.7 ms here (chase 7.8–10.7, overview 4.9–7.7)
  and, with no cached path while the camera moves, 9.2–13.0 ms at a moving chase; the CDP profile puts the whole
  main thread at 9.4–12.4 ms busy in each 16.7 ms frame at a held chase with the bots frozen. At the 7840HS's
  single-core ratio (0.624) that is 15–20 ms held and 15–21 ms for the moving render path alone, before the 27
  bots' AI: a mid-range laptop is main-thread bound at or above 16.7 ms in a 14 v 14 battle. These numbers come from a machine running at load average 40–225,
  so they are upper bounds, but the conclusion stands: the next 60 fps work on mid-range hardware is the main
  thread (three's per-draw submission is 4.3–5.0 ms of it here), not the raster.
- GPU. The proxy needs ≤ 5.7 ms of GPU here (≤ 7.5 ms at the Steel Nomad Light ratio). This shared GPU cannot
  certify that: every pose presented at the 60 fps cap, so occupancy here is below 16.7 ms, but the timer's spans
  (13–27 ms) include other sessions' work. If the 4050 is GPU-bound, High's governor has the raster lever down to
  0.67² = 45 % of the pixels, reconstructed by EASU + RCAS; the cache removes the static casters' shadow draws at
  a held camera.
- Where the frame was over budget here, the changes fixed it: Monsoon's base build presented 34–58 fps at three of
  its four poses (main thread saturated: 1.3 ms idle a frame), the new build 59–60.

### Risks and follow-ups

- Static shadow cache: 68 MB of depth copies on High (273 MB on Ultra). Its correctness rests on the per-frame hash
  covering what three's shadow traversal reads; a static caster whose depth material animated vertices from a
  uniform would not be seen (none does today: the foliage depth materials do not sway, LOD and occlusion fades are
  instanced streams). It saves only at a held camera; making the far cascade's fit follow the camera position
  rather than its frustum would let the far cascades reuse while driving (a lighting-lane decision).
- The governor on a shared or tiled GPU: samples longer than the presented interval are set aside, so such a
  machine runs the cadence rules (and their periodic up-probes) as before.
- High's native floor lowers sharpness under load on 1080p laptops (EASU + RCAS reconstruct it); the 780M / 680M /
  Arc iGPUs now start on Medium.
- The caster proxies arrive asynchronously at boot: until then heavy owners draw every instance into every cascade
  (the same maps, more shadow draws for those first frames).
- Not measured here: a live-governor run with an emulated 4050 and Medium's cost — this machine's GPU timer cannot
  drive or judge them. A quiet machine or the target laptop is the remaining certification step.

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

For multiplayer presentation and performance use the peer-to-peer rigs (the
v1 network render probe left with the cutover, MULTIPLAYER-V2.md §13.10):

    npm run test:net:v2:p2p
    npm run test:net:v2:p2p:soak

The first drives three real browsers through a hosted match and a host
migration; the soak reports host tick cost, uplink, migrations and desync
against the §13.8 budgets. DEVELOPMENT.md lists the rest of `test:net:v2:*`.

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

Panel policy (2026-09-19, owner: "we're cutting it all off a lil too early, it's
not mobile yet but we already lost all the side panel details"): a fine-pointer
window keeps the two persistent Garage sidebars from
`PERSISTENT_PANELS_MIN_WIDTH` (900 px) up — the plates narrow through the
tablet-persistent rules in `garage.css` and the UI scale falls to 0.78 before
anything is hidden — and only phones, compact widths, short heights and
coarse-pointer tablets or laptops fold the panels into overlays. The former
laptop pressure rule (narrower than 1240 px or taller than 900 px) folded
ordinary desktop windows.

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

Near-hull detail casters (2026-09-20, owner: "shadows look weird on tanks").
A convex proxy has no concavities, so a hull's turret never shadowed its own
deck, the gun never shadowed the glacis, and the ground shadow was a box that
floated at belly height because the running gear was not among the proxy's
support points. `engine/nearVehicleShadowDetail.ts` lets at most the four
nearest hulls within 70 m of the camera cast their authored armour shells,
gun, track bands and instanced running gear (28 meshes at most, never the
30k-triangle detailed track pads, greeble, decals or fills) into the cascade
whose depth range covers them, while their proxies are hidden for that
cascade only. The shadow router (`engine/renderLayers.ts`) renders the CSM
lights one at a time when a cascade policy is installed and flips the flags
around each light, restoring them exactly; with no policy, or for the single
light the deployment shadow warm renders, the call is the one three makes.
The convex proxies themselves are unchanged (their byte-exact armour-derived
hulls are pinned by the source-study coverage receipts), so a hull beyond the
near set still casts the floating belly-height box — at 70 m and more that
offset is a pixel or two. Desktop tiers with a 2K+ near cascade only; `__SHADOW_DEBUG.noVehicleDetail` keeps every hull on proxies
for A/B probes. Measured on Verdant with two hulls in the near cascade: frame
medians 16.7 ms on vs 16.6 ms off (vsync-bound, 506 calls / 5.0 M triangles
either way).

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
all-ten-environment lap records 16.9–23.5 ms p95 transitions, 43.4 ms maximum
per switch and 58.9 ms maximum over thirty complete cache-eviction cycles,
8.5 MB forced-GC heap growth, and a two-pack cache. Cinder and Ironworks visual receipts retain their rails,
platforms, service stations, clutter, lighting, and canonical tank framing.

The outdoor authored pass keeps Verdant unchanged and spreads each other scene
across seven connected map structures, seven service terraces, three or more
assembled service machines, and a full perimeter of asymmetric three-tree
groves. A separate post-ready workshop supplies four full-detail fleet exhibits
and their real teardown parts without duplicating them per environment. Every long rail,
gantry, rack, and station is terrain-seated before the terrain mesh is emitted;
the probe rejects structure/service overlaps and support-plane errors above
0.1 m. The resulting packs remain at 23–25 draw calls and 19.7–36.6 thousand
submitted triangles. A native production lap measured 4.9–14.4 ms construction,
43.4 ms worst transition gap and flat renderer geometry/texture counts. The
residency gate exercises one complete builder round before its forced-GC
baseline so demand-loaded fleet JIT/code-cache growth is not misclassified as
scene retention; the following thirty measured cache-eviction cycles retained
no positive JS heap on the current fleet. Do not retain a source tree kit from
a merged grove: its disposer closes over the pre-merge attribute arrays and
materially increases repeated-switch heap residency.

### 2026-09-02 Garage service-fleet finish and transfer correction

The four shared Burlak, Abrams, T-90M, and K2 maintenance exhibits now keep
their full 374,952-triangle authored geometry while using three immutable solid
national-service palettes. They allocate zero texture maps, share the Russian
palette between Burlak and T-90M, remain on the Garage's resident Standard PBR
shader family, and drop colour, UV, and tangent buffers that their static
materials cannot consume. The worker omitted 5,986,160 bytes across 317 unused
attribute channels in the measured four-exhibit payload. The normal browser
path no longer imports or constructs a duplicate fleet family on the render
thread; exact main-thread construction remains only as a worker-failure escape.

At 4x CPU throttling, a clean production entry reached the interactive Garage
in 1.98 seconds wall / 1.70 seconds app time. During the following nine-second
sample the worst frame was 116.2 ms, p95 was 18.3 ms, task residency was 0.134
core-equivalent, and the complete workshop streamed with zero console errors.
The all-ten-environment native gate then scored every Garage 100/100: the
intent-warmed first outdoor handoff was 33.8 ms, all later cold switches stayed
at or below 24.5 ms, thirty cache-eviction cycles peaked at 43.3 ms, and renderer
residency remained flat at 282 geometries and 103 textures. Final static merging
removed 441 display draws and released 354 source geometries without changing
the 374,952 submitted workshop triangles.

## Field size — 2026-09-18

The sides switch (owner: "a switch that's default set to 7v7 but then switching it does 14v14 and
you can also enter custom numbers of allies and enemies … go up to a number that you test is the
total limit to how many tanks can be in a game before performance is unacceptable") needed a field
ceiling. A scratch probe (`.qa-dev/field-perf-probe.mjs`, never staged: a private-cache vite server
over the round-21 worktree, headless Chromium on the hardware ANGLE path, `tier=desktop`, a stored
sides arrangement, a real Standard entry with `t90m_x` on `verdant`, then 15 s of driving and
firing) recorded the dev flight recorder's live frame gaps for four field sizes on the M5 Max
desktop. Two other release gates were running (1-minute load 37 → 143 across the runs), so the
absolute numbers are pessimistic; the per-vehicle slope is the signal.

| Field (player included) | Entry → live | Live fps | Gap p50 | p90 | p99 | Draw calls | Sim share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 14 (7 v 7) | 26.5 s | 37.5 | 25.3 ms | 33.5 | 48.0 | 561 | 98 % |
| 28 (14 v 14) | 38.9 s | 27.9 | 31.2 ms | 42.5 | 67.7 | 722 | 101 % |
| 42 (21 v 21) | 44.3 s | 23.5 | 39.4 ms | 53.5 | 70.7 | 1151 | 98 % |
| 56 (28 v 28) | 57.2 s | 19.0 | 49.7 ms | 68.3 | 82.9 | 1129 | 82 % |

The frame gap grows about 0.6 ms per vehicle under that load (the simulation — bot AI, spotting,
contacts — owns the frame at every size; draw calls double from 14 to 42 vehicles), and the entry
grows about 0.7 s per vehicle. `BATTLE_FIELD_LIMIT` is 42: the 14 v 14 preset keeps a wide margin,
a custom field may reach 1 v 41 or 20 v 21, and the 56-vehicle field's fifty-second entry and
sub-20 fps under load put it past the acceptable line. Re-measure on a quiet machine before raising
the limit (`sim/matchRuleset.ts`, `docs/GAME-MODES.md` "Sides"). The loading screen's reveal budget
scales with the field for the same reason (`game/battleEntryLifecycle.ts` `revealTimeoutForField`).

## Vista pass — 2026-09-19

The horizon vista pass (round 24: 431-column ring with a subdivided ridged ladder, the layered world-anchored
vista material, terrain-material rim bands and an 8000-instance ring forest — ARCHITECTURE.md §3.1.3) was
measured with the same field probe as the sides switch (`.qa-dev/field-perf-probe.mjs`, `m1a2` on `verdant`,
6 v 7, 15 s live, headless Chromium on ANGLE, `tier=desktop`), the vista worktree against main at cc2b452dc, back
to back on the M5 Max desktop under a 1-minute load of 35–40 from other sessions:

| Build | Live fps | Gap p50 | p90 | p99 | Perf HUD fps / p50 / p95 | Entry → live |
| --- | --- | --- | --- | --- | --- | --- |
| main cc2b452dc | 56.8 | 16.9 ms | 20.2 | 31.0 | 54.9 / 16.7 / 25.2 | 17.4 s |
| vista pass | 55.0 | 17.3 ms | 21.3 | 33.4 | 52.5 / 16.9 / 25.7 | 18.7 s |

The forest is one draw per species and detail class (eight InstancedMeshes; the four near-class meshes cast into
the cascade): about 1500 rich crowns (≈180 triangles), 4500 rim-band crowns (≈70) and 2000 range crowns (≈25), some
0.6 M triangles in total, so the frame gap moves by well under a millisecond at the median and about 2 ms at p99 —
inside the run-to-run noise of a loaded machine. The tone-only base atlas takes 3,072 recipe samples instead of
98,304 per map, and the five vista tiles are authored once per page. Mobile keeps the older per-vertex ring programs
and no ring forest (`maxInstances` 0 below the desktop tier).

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


### Combat equipment visibility at range

`src/vehicles/combatVisibility.ts` protects gameplay-tagged armor/equipment,
ERA-bound geometry, weapon stock, smoke apertures and complete working weapon
assemblies from both renderer LOD cutoffs and mobile/bot cosmetic detachment.
Authored wrappers remain intact through profile assembly; their combat-bearing
levels receive an infinite cull horizon afterward. Cosmetic detail keeps its
existing distance thresholds. This changes visibility only, not geometry,
collision, damage or spotting.

Regression: `node src/vehicles/combatVisibility.selftest.mjs` covers 31 vehicles
(including every external-launcher platform), both geometry tiers, six ranges
through 720 metres and ERA consumption/reset. The native rendered gate
`nice -n 19 node tools/combat-visibility.browser.mjs` verifies actual color-pass
submission: all 55 checked combat meshes remain at 540 metres while total
fixture draws fall from 135 to 97. These are fixture draw counts, not a fleet FPS
claim. Evidence is retained locally under `.qa-dev/combat-visibility/`.
