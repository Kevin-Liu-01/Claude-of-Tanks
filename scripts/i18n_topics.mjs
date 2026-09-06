// Build i18n keys for src/docs/topics.ts
// Appends ~270 new keys to each catalog.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const EN = {
  // shared
  "docs.topic.pageTitle": "Claude of Tanks Technical Manual",
  "docs.topic.manualIndex": "Manual index",
  "docs.topic.kicker": "Technical manual // {label}",
  "docs.topic.heroAlt": "{label} shown in the current game renderer",
  "docs.topic.asideKicker": "Manual section",
  "docs.topic.asideBody": "Current runtime contracts, implementation choices, and verification paths.",
  "docs.topic.asideLink": "All documentation →",

  // build
  "docs.topic.build.label": "How the game was built",
  "docs.topic.build.title": "A browser game built through verified loops",
  "docs.topic.build.lede": "Claude of Tanks grew from a direct Three.js prototype into a typed, tested game through short implementation rounds: isolate one problem, change the smallest owner, prove it in the browser, record the result, and land it on main.",
  "docs.topic.build.s1.t": "Start with hard constraints",
  "docs.topic.build.s1.p1": "The project is browser-native and built directly on Three.js rather than a general game engine. The simulation runs at a fixed 60 Hz, playable tanks use first-party procedural runtime geometry, and presentation pages stay isolated from the heavy game boot graph.",
  "docs.topic.build.s1.p2": "Those constraints shaped the architecture: deterministic rules can run in Node, the renderer adapts independently, and every public claim can point to code, a test, a capture, or a measured receipt.",
  "docs.topic.build.s2.t": "Separate rules from presentation",
  "docs.topic.build.s2.p1": "Movement, ballistics, armor, damage, spotting, match state, and bot decisions live behind renderer-free contracts. Three.js turns the latest state into cameras, rigs, lighting, effects, audio, and UI without becoming the authority for a hit.",
  "docs.topic.build.s2.p2": "That boundary made local battles, browser-hosted rooms, and dedicated matches share the same combat rules. It also lets lower-end visual settings reduce cost without changing gameplay.",
  "docs.topic.build.s3.t": "Claude Code and Codex workflow",
  "docs.topic.build.s3.p1": "Claude Code and Codex were used as development tools across bounded tasks. Broad or risky work moved into isolated Git worktrees; each lane named the files it owned, preserved unrelated changes, and exchanged exact commit hashes and evidence before integration.",
  "docs.topic.build.s3.p2": "The working rule was simple: main stays current, unfinished experiments stay isolated, and a branch is not proof. Only the integrated bytes count. Human direction set the target and acceptance bar; agents implemented, measured, reviewed, and documented against it.",
  "docs.topic.build.s4.t": "Build, falsify, and measure",
  "docs.topic.build.s4.p1": "A typical round starts with a reproducible baseline, then attribution. The smallest plausible fix is tested with focused self-tests, browser interaction, console inspection, screenshots, and performance probes. A result must survive a second run or a deliberately hostile case before it is accepted.",
  "docs.topic.build.s4.p2": "Visual work is judged from current pixels, not only numeric checks. Performance work records cold and warm conditions, device constraints, long tasks, frame gaps, GPU resources, and transition timings instead of reporting a single FPS number.",
  "docs.topic.build.s5.t": "Make the workflow durable",
  "docs.topic.build.s5.p1": "Repository-level AGENTS.md, indexed subsystem SKILL.md files, and one maintained architecture decision record preserve ownership, invariants, required commands, and recurring failure modes without burying contributors in completed migration notes.",
  "docs.topic.build.s5.p2": "When a manual process repeats, it becomes a script or a gate. That is why model screenshots, combat anatomy, vehicle icons, route probes, public metadata, and release checks are reproducible from the repository. Raw execution receipts stay in Git history or ignored QA artifacts.",
  "docs.topic.build.s6.t": "Land only integrated proof",
  "docs.topic.build.s6.p1": "A finished change is committed as one coherent unit, rebased on the latest origin/main, and rechecked after integration. The final push verifies that its parent is still the remote tip so concurrent work cannot silently overwrite a newer landing.",
  "docs.topic.build.s6.p2": "The public build then proves route isolation and strips non-distributable comparison material. This keeps the playable site, source tree, documentation, and main branch describing the same game.",
  "docs.topic.build.media1": "Current Scene Studio and browser tooling used to stage reproducible game states",
  "docs.topic.build.media2": "A deterministic contact sheet used for visual comparison and review",

  // models
  "docs.topic.models.label": "Procedural model pipeline",
  "docs.topic.models.title": "From reference to playable machine",
  "docs.topic.models.lede": "Kevin B. Liu authored every playable tank as first-party procedural runtime geometry. References guide proportion and detail, but the shipped machine is rebuilt from code, connected to combat data, rendered into its own icon set, and released through measured and visual gates.",
  "docs.topic.models.s1.t": "Research and reference intake",
  "docs.topic.models.s1.p1": "A model round begins with source photographs, published dimensions, plan and side references, or a comparison mesh when its license permits authoring use. The source is an oracle for recognizable shape—not a playable asset and not an automatic truth when the reference itself is wrong.",
  "docs.topic.models.s1.p2": "Proportion comes first: hull length and width, turret station, roof height, gun length, wheel count, track course, and major armor masses must read correctly before small fittings are added.",
  "docs.topic.models.s2.t": "Build the visible machine from parts",
  "docs.topic.models.s2.p1": "Procedural builders assemble hull plates, turret shells, mantlets, barrels, running gear, optics, hatches, smoke launchers, baskets, antennas, armor kits, and stowage from reusable geometry and material vocabulary. Station-section measurements keep front, middle, and rear masses faithful instead of stretching one generic box.",
  "docs.topic.models.s2.p2": "Camouflage-aware structural parts and neutral mechanical parts use explicit roles. Comparison GLBs never become a hidden production fallback.",
  "docs.topic.models.s3.t": "Rig articulation and running gear",
  "docs.topic.models.s3.p1": "Hull, turret, gun mount, recoil group, muzzle, wheels, return rollers, sprockets, idlers, and linked tracks have explicit owners. Turret equipment must rotate with the turret and remain visibly seated; hull equipment must not follow it. The muzzle bore must be open and resolve from the actual barrel hierarchy.",
  "docs.topic.models.s3.p2": "Suspension samples terrain at each support station. Native running gear preserves the correct wheel count and track path while avoiding duplicated donor wheels, clipping shoes, or floating attachments.",
  "docs.topic.models.s4.t": "Author combat anatomy from the same shape",
  "docs.topic.models.s4.p1": "Armor plates, spaced layers, ERA, modules, ammunition, fuel, crew, and articulation anchors are calibrated to the checked vehicle frame. The game therefore uses the same authored shape for presentation, impact tracing, internal damage, and the technical side diagrams.",
  "docs.topic.models.s4.p2": "Structural cupolas can participate in hit geometry. Sights, machine guns, baskets, antennas, and loose equipment remain presentation fittings unless gameplay explicitly gives them a physical role.",
  "docs.topic.models.s5.t": "Generate icons and technical cards",
  "docs.topic.models.s5.p1": "The asset pipeline renders the current procedural rig into garage and gallery imagery, transparent silhouettes, armor diagrams, separate module and crew diagrams, tier treatments, and supporting presentation views. One deterministic angle capture now emits both portrait sizes through a shared framing policy, so a new tank cannot leave behind a hand-cropped or stale thumbnail.",
  "docs.topic.models.s5.p2": "Use `npm run tank:portraits -- --ids=<changed ids>` and `npm run tank:portraits:check -- --ids=<changed ids>` for portrait-only work. The complete release sequence remains `npm run tank:anatomy:update`, `npm run tank:anatomy:check`, then `npm run tank:release:check -- --ids=<changed ids> --gate`.",
  "docs.topic.models.s6.t": "Measure, inspect, and graduate",
  "docs.topic.models.s6.p1": "Automated gates check geometry fingerprints, dimensions, stations, floaters, track intersections, wheel quality, muzzle bores, materials, armor anatomy, markings, provenance, and deterministic asset freshness. Standard front, quarter, side, rear, top, close, and yaw views then expose defects a numeric score can miss.",
  "docs.topic.models.s6.p2": "A model graduates only when every required view clears the visual acceptance floor, attachments have physical load paths, winding and backfaces are healthy, and the clean integrated release check passes. The Tank Gallery is the live inspection surface for that final procedural rig.",
  "docs.topic.models.media1": "Current Tank Gallery rendering a T-90M Proryv and its diagnostic layers",
  "docs.topic.models.media2": "A released first-party rig with armor, fittings, markings, and running gear",

  // ai
  "docs.topic.ai.label": "Bots and tactical AI",
  "docs.topic.ai.title": "One bot controller for every battlefield",
  "docs.topic.ai.lede": "Solo and authoritative multiplayer bots use the same renderer-free decision logic. They navigate a seeded battlefield graph, respect team and visibility rules, choose viable shots, use vehicle capabilities, and remain testable without a GPU.",
  "docs.topic.ai.s1.t": "Perception and target choice",
  "docs.topic.ai.s1.p1": "Bots consume the same team, visibility, range, health, and vehicle-state contracts used by authority. They do not read rendered objects or hidden client-only coordinates. Candidate targets are scored from current tactical state rather than selected by scene proximity alone.",
  "docs.topic.ai.s1.p2": "Difficulty changes reaction, aim quality, engagement distance, and decision pressure without granting information the bot should not have.",
  "docs.topic.ai.s2.t": "Seeded route planning",
  "docs.topic.ai.s2.p1": "One typed traversability grid is built per match from terrain mobility, world collision, openings, objectives, and vehicle capabilities. The planner supplies deterministic paths around blocked cells while local steering handles immediate alignment and avoidance.",
  "docs.topic.ai.s2.p2": "Route decisions can be reproduced in Node across every map, including heavy vehicles, tracked damage, steep slopes, and objective modes.",
  "docs.topic.ai.s3.t": "Gun handling and fire control",
  "docs.topic.ai.s3.p1": "The controller respects turret traverse, elevation and depression, bore obstruction, reloads, magazines, dispersion, shell velocity, penetration, and target motion. It aims for hittable armor and internal weak areas when the current weapon and angle make that shot credible.",
  "docs.topic.ai.s3.p2": "Autocannons, single-shot guns, autoloaders, and guided weapons share the same decision boundary but apply their own cadence and ammunition state.",
  "docs.topic.ai.s4.t": "Team safety and pressure",
  "docs.topic.ai.s4.p1": "Friendly vehicles are rejected from valid shot paths, and the controller avoids firing through allies. Bots spread their attention, move to useful lanes, support objectives, and keep enough separation to avoid turning one friendly cluster into an obstacle.",
  "docs.topic.ai.s4.p2": "Enemy bots and allied bots use the same logic. Team assignment changes targets and objectives, not competence.",
  "docs.topic.ai.s5.t": "Survival and recovery",
  "docs.topic.ai.s5.p1": "Bots consider exposure, cover, damaged tracks, disabled modules, repair opportunities, ammo state, and nearby threats. They can disengage from a losing angle, recover movement, re-path after destruction, and continue contributing instead of waiting in open ground.",
  "docs.topic.ai.s5.p2": "Mode objectives layer onto these survival decisions so capture, defense, escort, and horde pressure do not require separate fake movement systems.",
  "docs.topic.ai.s6.t": "Verification",
  "docs.topic.ai.s6.p1": "Focused AI tests cover aim, friendly-fire rejection, routes, difficulty, deterministic decisions, and authoritative bot integration. Map-wide server tests run the controller without rendering, while browser battles verify that visible movement, firing, and effects match those decisions.",
  "docs.topic.ai.s6.p2": "Bot changes run `node src/game/ai.selftest.mjs`, `node src/sim/ai.aim.selftest.mjs`, `node src/sim/botRoutePlanner.selftest.mjs`, and `node server/authoritativeBots.selftest.mjs`.",
  "docs.topic.ai.media1": "Mixed vehicles holding lanes and exchanging authoritative fire",
  "docs.topic.ai.media2": "An IFV contact showing movement, target pressure, and team spacing",

  // audio
  "docs.topic.audio.label": "Audio and battlefield FX",
  "docs.topic.audio.title": "Every sound begins with a game event",
  "docs.topic.audio.lede": "Weapons, engines, impacts, tracks, ambience, crew radio, destruction, and replay audio are presentation responses to canonical events and listener state. The audio system never decides whether a shell was fired or a target was hit.",
  "docs.topic.audio.s1.t": "Weapons, impacts, and movement",
  "docs.topic.audio.s1.p1": "Canonical fire, projectile, penetration, damage, destruction, engine, and track events drive the corresponding sound layers. Nearby remote tanks remain audible from normal third-person play; scope mode changes perspective instead of acting as an accidental mute.",
  "docs.topic.audio.s1.p2": "Weapon family, caliber, burst cadence, distance, and environment shape the presentation while the originating combat event remains the single source of truth.",
  "docs.topic.audio.s2.t": "Spatial listener model",
  "docs.topic.audio.s2.p1": "The listener combines camera orientation with the occupied vehicle position, then switches deliberately for player, scope, spectator, and killcam views. This hybrid model preserves directional reading without making an orbiting camera detach the player from the tank.",
  "docs.topic.audio.s2.p2": "The occupied engine remains present regardless of distance. Remote engine loops are capped and ranked by proximity so the mix remains bounded in a full battle.",
  "docs.topic.audio.s3.t": "Mix state and voice limits",
  "docs.topic.audio.s3.p1": "Web Audio buses separate weapons, engines, impacts, ambience, music, radio, and interface feedback. Priority, cooldown, deduplication, distance, and phase state limit concurrent voices and keep repeated network events from doubling the same sound.",
  "docs.topic.audio.s3.p2": "Audio initializes only after user gesture. Lazy transfer keeps boot light, and leaving battle stops world loops and stale entity sounds.",
  "docs.topic.audio.s4.t": "Crew radio and feedback",
  "docs.topic.audio.s4.p1": "Typed crew lines respond to useful events such as hits, penetrations, module damage, spotting, reload state, and destruction. Scheduling favors fresh high-priority information and rejects lines that arrive too late to describe the current battle.",
  "docs.topic.audio.s4.p2": "Short feedback layers reinforce the HUD without narrating every action or masking nearby weapons.",
  "docs.topic.audio.s5.t": "Killcam time and perspective",
  "docs.topic.audio.s5.p1": "The killcam owns a distinct listener pose and time scale. Replay audio is stretched and filtered to follow the slowed visual event rather than replaying a normal-speed shot underneath slow motion.",
  "docs.topic.audio.s5.p2": "Entering and leaving the replay tears down its temporary routing cleanly before spectator or garage audio resumes.",
  "docs.topic.audio.s6.t": "Verification",
  "docs.topic.audio.s6.p1": "Pure timing tests cover scheduling, staleness, priority, and phase teardown. Spatial probes render listener and distance cases to PCM, while the canonical audio probe verifies event coverage and bus routing.",
  "docs.topic.audio.s6.p2": "Use `node src/audio/audioTiming.selftest.mjs`, `node src/audio/voices.selftest.mjs`, `node tools/audio-spatial-killcam-probe.mjs`, and `node tools/audio-probe.mjs` for audio changes.",
  "docs.topic.audio.media1": "Overlapping weapon, impact, engine, and destruction events in battle",
  "docs.topic.audio.media2": "The current slowed X-ray killcam with replay-specific listener and timing",

  // performance
  "docs.topic.performance.label": "Performance and loading",
  "docs.topic.performance.title": "Measure the frame that the player actually feels",
  "docs.topic.performance.lede": "Performance work covers cold boot, garage residency, battle acquisition, countdown warmup, the first ten seconds of combat, steady-state frame pacing, device adaptation, and recovery—not just an average frame-rate number.",
  "docs.topic.performance.s1.t": "Keep boot and routes isolated",
  "docs.topic.performance.s1.p1": "The garage does not build a battlefield until concrete Battle intent. Public pages do not import the playable renderer, and garage boot does not eagerly import the complete simulation or fleet graph. Exact vehicle-family and world work is acquired only when the selected route needs it.",
  "docs.topic.performance.s1.p2": "Cold-load probes disable caches and record network plus application work so a warm navigation cannot masquerade as first-visit performance.",
  "docs.topic.performance.s2.t": "Stage battle loading behind cover",
  "docs.topic.performance.s2.p1": "Battle entry acquires the exact world and roster, uploads required textures, prepares effects, submits vehicle materials, warms shaders and post-processing, and establishes the first valid camera before reveal. Required work finishes before the countdown instead of surfacing as a black or frozen opening frame.",
  "docs.topic.performance.s2.p2": "Progress reflects owned stages. Stale work is cancelled when intent changes, and a retryable lifecycle owns recovery rather than scattering timers through the composition root.",
  "docs.topic.performance.s3.t": "Record full frame evidence",
  "docs.topic.performance.s3.p1": "The development flight recorder stores route transitions, long tasks, frame gaps, renderer counters, resolution, simulation debt, memory, and named spans. The performance HUD exposes live statistics for focused probes and saves event histories for later attribution.",
  "docs.topic.performance.s3.p2": "Opening-battle probes focus on the first ten seconds after the countdown because shader births, roster commits, audio startup, and effect bursts often hide there.",
  "docs.topic.performance.s4.t": "Reduce work at its owner",
  "docs.topic.performance.s4.p1": "Static garage presentation sleeps between invalidations. Established frame loops reuse scratch objects, rank or stagger expensive updates, pool transient effects, cache stable worlds, demand-load vehicle families, and remove invisible render submissions rather than merely lowering visual quality.",
  "docs.topic.performance.s4.p2": "Optimization is accepted only when the same scenario improves without shifting cost into loading, memory, correctness, or a later frame.",
  "docs.topic.performance.s5.t": "Adapt to the real device",
  "docs.topic.performance.s5.p1": "Capability probes and measured overload choose render scale, shadows, vegetation, effect budgets, and post-processing. Desktop, mobile, and constrained profiles start differently, then adjust with hysteresis to avoid visible oscillation.",
  "docs.topic.performance.s5.p2": "GPU recovery validates framebuffers and can step down optional presentation layers. Simulation frequency, ballistics, armor, and network authority remain unchanged.",
  "docs.topic.performance.s6.t": "Budgets and release evidence",
  "docs.topic.performance.s6.p1": "Release probes cover cold load, transitions, battle opening, sustained play, map and tank switching, returned garage state, mobile layouts, and constrained CPU/network profiles. Reports include p95 frame gaps, long tasks, program births, draw work, memory, and readiness time.",
  "docs.topic.performance.s6.p2": "Use `npm run perf:cold`, `npm run perf:dev`, `npm run perf:resources:gate`, `npm run qa:device`, and `npm run build` for the corresponding performance claims.",
  "docs.topic.performance.media1": "The current K2 live frame whose pacing, scale, draw work, and simulation debt are measured",
  "docs.topic.performance.media2": "The current Garage adapted to a compact device and touch-safe presentation",

  // simulation
  "docs.topic.simulation.label": "Simulation and combat",
  "docs.topic.simulation.title": "Every hit has a path",
  "docs.topic.simulation.lede": "The battle simulation advances at 60 Hz. Movement, aim, ballistics, armor, damage, reloads, spotting, and match results are resolved from authoritative state—not from the rendered frame.",
  "docs.topic.simulation.s1.t": "Fixed-step battle loop",
  "docs.topic.simulation.s1.p1": "The authoritative step uses metres, seconds, radians, and a fixed 1/60-second interval. Input is sampled into explicit vehicle controls before movement, combat, spotting, and result evaluation run in a stable order. Render rate can change without changing the number or order of simulation steps.",
  "docs.topic.simulation.s1.p2": "Frame-time spikes accumulate into bounded fixed steps. Authoritative randomness is seeded or injected. Wall-clock time and Math.random() are excluded from rules that affect a shot, reload, module state, or match result.",
  "docs.topic.simulation.s2.t": "Aim and shot creation",
  "docs.topic.simulation.s2.p1": "Camera aim and gun aim are separate. The camera chooses the requested point; traverse, elevation, suspension attitude, and bore obstruction determine where the barrel can actually point. A shot starts at the resolved muzzle transform with the current shell, velocity, dispersion, and owner identity.",
  "docs.topic.simulation.s2.p2": "The HUD draws both states. The camera marker communicates the request. The gun marker communicates the ballistic line. “Path blocked” and gun-limit feedback therefore describe physical constraints instead of repainting the request as truth.",
  "docs.topic.simulation.s3.t": "Armor trace and penetration",
  "docs.topic.simulation.s3.p1": "The shell segment is tested against world collision before vehicle armor. Vehicle queries transform the ray into the target pose, order plate crossings, calculate distance and angle, apply normalization or ricochet rules, and consume the shell’s remaining penetration. Spaced layers and internal volumes stay in traversal order.",
  "docs.topic.simulation.s3.p2": "A penetration continues through internal module and crew volumes. A non-penetration still produces an authoritative impact event. Presentation receives the resolved path and result; it does not rerun the decision.",
  "docs.topic.simulation.s4.t": "Damage, reloads, and special weapons",
  "docs.topic.simulation.s4.p1": "Damage updates hit points, tracks, engine, fuel, ammunition, gun, turret drive, optics, and crew state. Autoloaders distinguish intra-clip delay from magazine reload. Guided missiles retain a live projectile and steering state until impact or expiry. Fires, ammunition-rack events, ramming, and repairs use the same event boundary.",
  "docs.topic.simulation.s4.p2": "The X-ray replay, hit card, damage log, reload rack, impact effects, and sound all consume those events. This keeps visible feedback aligned with the result used by solo and multiplayer authority.",
  "docs.topic.simulation.s5.t": "Battle rules",
  "docs.topic.simulation.s5.p1": "Standard Battle, Capture the Flag, Zone Control, Turbo Ball, and Endless Horde compose over the same complete tank simulation. Flag and zone modes add six-second respawns. Turbo Ball keeps weapons active while tanks drive at 1.85× mobility and shells can strike the ball. Horde escalates deterministic bot waves and places increasingly scarce repair or ammunition caches.",
  "docs.topic.simulation.s5.p2": "The renderer-free mode controller owns scores, objectives, respawn timers, wave state, caches, and bot objective points. Solo, private rooms, and LAN rooms use the same rules; the host choice travels in canonical lobby state and survives rematches.",
  "docs.topic.simulation.s6.t": "Verification",
  "docs.topic.simulation.s6.p1": "Node-runnable self-tests cover movement, combat, spotting, missile guidance, special actions, AI aim, and the complete authoritative match. Browser probes add bore parity, projectile travel, live impact effects, and HUD alignment.",
  "docs.topic.simulation.s6.p2": "Run `node src/sim/combat.selftest.mjs`, `node src/sim/authoritativeMatch.selftest.mjs`, and `npm test` after changing shared combat rules.",
  "docs.topic.simulation.media1": "Current resolved X-ray path through armor, modules, and crew",
  "docs.topic.simulation.media2": "Muzzle flashes, tracers, impacts, and destruction from one staged battle state",

  // vehicles
  "docs.topic.vehicles.label": "Vehicles and running gear",
  "docs.topic.vehicles.title": "The model moves as one machine",
  "docs.topic.vehicles.lede": "Every selectable tank is a first-party procedural runtime rig. The same vehicle record drives its geometry, dimensions, armor, internal anatomy, mobility, gun, ammunition, icon set, garage dossier, and battle behavior.",
  "docs.topic.vehicles.s1.t": "Vehicle contract",
  "docs.topic.vehicles.s1.p1": "A vehicle spec defines identity, class, nation, tier, dimensions, mass, engine output, speed, traverse, gun limits, shells, armor, modules, crew, equipment policy, and builder. Consumers read the registry instead of carrying parallel facts.",
  "docs.topic.vehicles.s1.p2": "Entity IDs are not vehicle spec IDs. Multiplayer permits duplicate tank selections, so identity, ownership, and specification remain separate throughout state and presentation.",
  "docs.topic.vehicles.s2.t": "Procedural rig",
  "docs.topic.vehicles.s2.p1": "Builders create hull, turret, gun mount, gun, running gear, tracks, optics, fittings, markings, and damage hooks with stable ownership. Tank forward is local +Z. Articulation occurs at explicit pivots, and the muzzle is resolved from the actual barrel hierarchy.",
  "docs.topic.vehicles.s2.p2": "Roof equipment can move with the turret without becoming armor. Cupolas participate in hit geometry; machine guns, antennas, baskets, loose stowage, and presentation-only fittings do not.",
  "docs.topic.vehicles.s3.t": "Suspension and tracks",
  "docs.topic.vehicles.s3.p1": "Each supported wheel samples terrain beneath its own station. The visual suspension settles to those contacts, the hull derives pitch and roll from support, and the track path is rebuilt around the moved wheels. Swedish siege suspension adds commanded hull attitude without breaking gun tracking.",
  "docs.topic.vehicles.s3.p2": "Track animation follows traveled distance and side speed. Damage can detach a side, remove its running band, throw a persistent ribbon, and leave loose running-gear pieces.",
  "docs.topic.vehicles.s4.t": "Combat anatomy",
  "docs.topic.vehicles.s4.p1": "Armor plates, modules, and crew stations are authored in the vehicle frame and transformed with the live pose. Generated side diagrams are receipts for that same data. They are not separately drawn approximations.",
  "docs.topic.vehicles.s4.p2": "Any playable geometry or profile change runs `tank:anatomy:update`, `tank:anatomy:check`, then the targeted gated release check. This refreshes armor, module, crew, icon, and technical-diagram evidence together.",
  "docs.topic.vehicles.s5.t": "Fleet release gate",
  "docs.topic.vehicles.s5.p1": "Appearance, bore, material, wheel, recoil, combat anatomy, provenance, and profile-specific checks run before a vehicle is considered current. Playable loading never falls back to a comparison GLB.",
  "docs.topic.vehicles.s5.p2": "The Tank Gallery constructs the live builder and overlays the canonical diagnostic volumes, which makes it the fastest manual review surface for a vehicle change.",
  "docs.topic.vehicles.media1": "Current T-90M Proryv rig with articulation and diagnostic layers",
  "docs.topic.vehicles.media2": "Current battle-detail vehicle geometry and running gear",

  // rendering
  "docs.topic.rendering.label": "Renderer and graphics",
  "docs.topic.rendering.title": "Rendering can adapt without changing the rules",
  "docs.topic.rendering.lede": "Three.js owns presentation only. Adaptive resolution, shadows, vegetation, post-processing, particles, and warmup can change with the device; the 60 Hz battle model remains unchanged.",
  "docs.topic.rendering.s1.t": "Frame composition",
  "docs.topic.rendering.s1.p1": "The render path updates camera, visible vehicle rigs, world detail, presentation effects, lighting, shadows, and post-processing from the latest interpolated state. Established hot loops reuse scratch objects and pools rather than allocating each frame.",
  "docs.topic.rendering.s1.p2": "Late transparent effects share depth information with the main scene. Muzzle light, tracer, sparks, smoke, dust, fire, and debris are admitted by distance and quality policy.",
  "docs.topic.rendering.s2.t": "Lighting and post-processing",
  "docs.topic.rendering.s2.p1": "Biome lighting supplies sun direction, sky, fog, exposure, and shadow policy. Stable cascaded shadows follow the relevant camera region. The post chain combines ambient occlusion, anti-aliasing, bloom where useful, output grading, and the final dynamic render scale.",
  "docs.topic.rendering.s2.p2": "Capture views pin quality and render scale so comparison images do not drift. Gameplay can reduce expensive layers under sustained load.",
  "docs.topic.rendering.s3.t": "Adaptive quality",
  "docs.topic.rendering.s3.p1": "Desktop and mobile resolve separate starting profiles. Internal resolution, shadow work, vegetation density, effect budgets, and post features can step down independently. Hysteresis prevents rapid oscillation.",
  "docs.topic.rendering.s3.p2": "Device diagnostics and measured overload—not user-agent labels alone—select the safe path. A quality change never alters shell travel, spotting, damage, or authoritative timing.",
  "docs.topic.rendering.s4.t": "Loading and recovery",
  "docs.topic.rendering.s4.p1": "Boot-critical modules avoid importing the complete fleet builder graph. Deferred vehicle construction, shader warmup, offscreen preparation, and cached garage residents flatten transition spikes. Context-loss handling restores presentation state without inventing battle state.",
  "docs.topic.rendering.s4.p2": "Screenshot and loading probes treat black frames, stale swaps, console errors, and incomplete garage models as failures.",
  "docs.topic.rendering.s5.t": "Performance evidence",
  "docs.topic.rendering.s5.p1": "Performance traces record frame categories, renderer counters, dynamic scale, and transition budgets. Browser probes cover cold load, battle entry, map switching, the garage, and multiplayer rendering.",
  "docs.topic.rendering.s5.p2": "Use `npm run perf:dev`, `npm run perf:cold`, `npm run perf:transitions`, and a production build for renderer work.",
  "docs.topic.rendering.media1": "Current Leclerc XLR precision sight after lighting, depth, anti-aliasing, and output grading",
  "docs.topic.rendering.media2": "Close vehicle material response under the current world lighting",

  // worlds
  "docs.topic.worlds.label": "Battlefields and destruction",
  "docs.topic.worlds.title": "Battlefields are built for armored movement",
  "docs.topic.worlds.lede": "Twenty battlefields share world contracts but keep authored routes, landmarks, cover, atmosphere, and sightlines. Terrain and collision are available to the simulation without importing the renderer.",
  "docs.topic.worlds.s1.t": "Map contract",
  "docs.topic.worlds.s1.p1": "Each map provides terrain height, ground materials, obstacles, collision, concealment, spawn groups, capture areas, lighting, weather, sound context, and a deterministic establishing camera. Simulation consumers use these interfaces rather than scene traversal.",
  "docs.topic.worlds.s1.p2": "The registry is the source for selection, loading, Studio, screenshots, and documentation counts.",
  "docs.topic.worlds.s2.t": "Terrain and movement",
  "docs.topic.worlds.s2.p1": "Height fields answer vehicle support, projectile collision, camera clearance, and prop placement. Surface class affects grip and presentation. Roads, slopes, ridges, water edges, and hull-down positions are composed around the intended armored routes.",
  "docs.topic.worlds.s2.p2": "Vehicle suspension samples the same ground surface used by movement and ballistic terrain queries.",
  "docs.topic.worlds.s3.t": "Structures and utilities",
  "docs.topic.worlds.s3.p1": "Structure families expose readable openings, material sets, damage states, and collision. Utility networks connect poles and lines across valid spans. Large cover blocks sightlines; small visual fittings do not become invisible walls.",
  "docs.topic.worlds.s3.p2": "Detached doors, barriers, street pieces, and other loose props enter bounded physics with stable sleep and cleanup rules.",
  "docs.topic.worlds.s4.t": "Destruction and wrecks",
  "docs.topic.worlds.s4.p1": "Destroyed vehicles retain wreck geometry, detached tracks, fire, smoke, and debris. Map wrecks and disassembled garage pieces use modern first-party vehicle families. Turrets, hulls, wheels, ERA, and weapons remain decoration unless explicitly registered for collision.",
  "docs.topic.worlds.s4.p2": "Persistent aftermath is presentation state derived from authoritative destruction events.",
  "docs.topic.worlds.s5.t": "Map quality gates",
  "docs.topic.worlds.s5.p1": "Automated checks audit spawns, bounds, material coverage, structures, utilities, collision, wrecks, loose props, and placement. Deterministic battle captures expose bad silhouettes and obstructed routes that numeric gates cannot.",
  "docs.topic.worlds.s5.p2": "Run `node src/world/mapQuality.selftest.mjs`, the nearby world self-tests, and targeted screenshot views after map changes.",
  "docs.topic.worlds.media1": "Authored orchard route with structures, vegetation, terrain, and effects",
  "docs.topic.worlds.media2": "Coastal route, persistent wreck fire, and foreground vehicle",

  // multiplayer
  "docs.topic.multiplayer.label": "Multiplayer authority",
  "docs.topic.multiplayer.title": "Clients request and the server decides",
  "docs.topic.multiplayer.lede": "The multiplayer path keeps hits, damage, reloads, spotting, bots, and match results on the authoritative side. Clients predict local movement and present filtered snapshots.",
  "docs.topic.multiplayer.s1.t": "Room and match lifecycle",
  "docs.topic.multiplayer.s1.p1": "A room owns members, teams, selected vehicles, camouflage, map choice, readiness, chat, invites, and reconnect state. Match handoff creates an authoritative world with stable player and entity identities.",
  "docs.topic.multiplayer.s1.p2": "Spectators have an explicit team and perspective. They do not borrow a vehicle ID as their player identity.",
  "docs.topic.multiplayer.s2.t": "Inputs and snapshots",
  "docs.topic.multiplayer.s2.p1": "Clients send normalized control input and an ordered input sequence. Authority advances the same fixed-step movement and combat modules used by solo. Snapshots carry acknowledged input, visible entities, combat state, and presentation events.",
  "docs.topic.multiplayer.s2.p2": "The local tank predicts and reconciles. Remote tanks interpolate. Neither path changes the authoritative shot result.",
  "docs.topic.multiplayer.s3.t": "Spotting boundary",
  "docs.topic.multiplayer.s3.p1": "Enemy coordinates are filtered before serialization. A client never receives hidden positions and relies on rendering to conceal them. Spot persistence, observer rules, and team visibility are applied at the snapshot boundary.",
  "docs.topic.multiplayer.s3.p2": "This boundary also governs minimap, nameplates, effects, and audio presentation.",
  "docs.topic.multiplayer.s4.t": "Combat events",
  "docs.topic.multiplayer.s4.p1": "The server creates shells, validates reload and magazine state, resolves world and armor hits, updates modules and crew, and emits ordered presentation events. Clients use those events for tracers, impacts, shot cards, killcams, and sound.",
  "docs.topic.multiplayer.s4.p2": "Duplicate vehicle selections remain safe because events use entity and owner identities separately from vehicle specs.",
  "docs.topic.multiplayer.s5.t": "Live verification",
  "docs.topic.multiplayer.s5.p1": "Browser soaks cover guest entry, four-player rooms, 7v7 rosters, adverse transport, reconnect handoff, rendering, and both teams dealing live damage. Headless authority tests cover bots, pacing, results, rankings, and persistence.",
  "docs.topic.multiplayer.s5.p2": "Run `npm run test:net:seven:live` for the complete moving-and-firing gate.",
  "docs.topic.multiplayer.media1": "Allied chase camera with the compact target switcher",
  "docs.topic.multiplayer.media2": "Team roster and room state before authoritative handoff",

  // interface
  "docs.topic.interface.label": "Interface and controls",
  "docs.topic.interface.title": "Read the tank without losing the view",
  "docs.topic.interface.lede": "The garage, HUD, sight, killcam, spectator mode, after-action report, settings, keyboard, pointer, controller, and touch input share one control and typography system.",
  "docs.topic.interface.s1.t": "Garage and deployment",
  "docs.topic.interface.s1.p1": "The garage combines vehicle selection, dossier, ammunition, equipment, camouflage, map choice, match mode, room state, and launch. Selection and displayed pedestal identity remain synchronized through explicit state.",
  "docs.topic.interface.s1.p2": "The interface links directly to Tank Gallery for deeper geometry inspection and to Scene Studio for composition work.",
  "docs.topic.interface.s2.t": "Battle HUD",
  "docs.topic.interface.s2.p1": "The HUD prioritizes score, time, teams, reticle state, ammunition, consumables, minimap, damage, spotting, and short event feedback. It does not restate every system continuously.",
  "docs.topic.interface.s2.p2": "Reload racks use the authoritative magazine state. Damage panels use current modules. Team and minimap information obey the spotting boundary.",
  "docs.topic.interface.s3.t": "Death, killcam, and spectating",
  "docs.topic.interface.s3.p1": "A death beat shows the player’s destruction before the X-ray replay. If the battle continues, the camera moves to a living ally. The compact switcher identifies the vehicle, its position in the living roster, equal previous and next controls, and a quiet garage exit.",
  "docs.topic.interface.s3.p2": "Mouse movement orbits the ally without turning a turret. Keyboard and touch targets retain a minimum 44-pixel interaction size.",
  "docs.topic.interface.s4.t": "Input and mobile",
  "docs.topic.interface.s4.p1": "Keyboard, mouse, pointer-lock fallback, free look, zoom, touch joysticks, swipe aim, pinch scope, shell selection, special actions, and consumables normalize into game input. UI ownership prevents a text field or dialog from leaking keys into battle.",
  "docs.topic.interface.s4.p2": "Safe-area layout, compact labels, and device-specific quality preserve the same battle rules on phones.",
  "docs.topic.interface.s5.t": "Accessibility and regression checks",
  "docs.topic.interface.s5.p1": "Semantic buttons, visible focus, reduced-motion handling, descriptive media alternatives, contrast, and touch sizing are part of the public and in-game surfaces. Responsive QA covers desktop and 390-pixel layouts.",
  "docs.topic.interface.s5.p2": "Focused self-tests cover keyboard ownership, settings, icons, flags, loading screens, end screens, the spectator switcher, and touch controls.",
  "docs.topic.interface.media1": "390-pixel spectator layout above the minimap",
  "docs.topic.interface.media2": "Touch-safe garage and mobile control presentation",

  // studio
  "docs.topic.studio.label": "Scene Studio and capture",
  "docs.topic.studio.title": "Every public frame can be reproduced",
  "docs.topic.studio.lede": "Scene Studio uses current maps, vehicle builders, articulation, effects, and camera systems to create deterministic stills and video inside the browser.",
  "docs.topic.studio.s1.t": "Scene document",
  "docs.topic.studio.s1.p1": "A scene stores map, seed, actor spec IDs, names, positions, headings, turret and gun pose, camouflage, effects, camera, time, and optional storyboard. Loading rebuilds from current first-party assets.",
  "docs.topic.studio.s1.p2": "The JSON is a reproducibility record, not a baked screenshot description.",
  "docs.topic.studio.s2.t": "Timeline and actors",
  "docs.topic.studio.s2.p1": "Actor tracks interpolate position and articulation over deterministic time. Storyboard shots animate camera position, target, field of view, roll, and transition. Scrubbing evaluates both without depending on wall-clock time.",
  "docs.topic.studio.s2.p2": "The five current hero films use four-key rails across five battlefields. Each rail keeps multiple vehicles readable while moving from contact to impact.",
  "docs.topic.studio.s3.t": "Effects",
  "docs.topic.studio.s3.p1": "Fire, tracer, impact, sparks, dust, machine-gun bursts, track damage, fuel kills, and ammunition-rack kills are placed on the same timeline. Effects resolve from actor anchors or explicit world points.",
  "docs.topic.studio.s3.p2": "Capture masters preserve motion and effects at 30 frames per second before public encodes are made.",
  "docs.topic.studio.s4.t": "Capture pipeline",
  "docs.topic.studio.s4.p1": "Studio records VP9 through the production renderer. The current publisher preserves the 1920 × 1080 hero masters without another lossy video encode, publishes a native 3840 × 2160 gameplay film, and generates still posters and byte receipts. Public playback uses looping video rather than GIF.",
  "docs.topic.studio.s4.p2": "A rail fails if vehicles disappear behind scenery, effects erase the silhouette, the camera crosses geometry, or the source resolution falls below its delivery contract.",
  "docs.topic.studio.s5.t": "Still-image campaigns",
  "docs.topic.studio.s5.p1": "Battle campaigns start from scene JSON, render review captures, tile contact sheets, export 4K frames, run image statistics, and require owner approval. The public archive retains its scene identifiers and review sheets.",
  "docs.topic.studio.s5.p2": "Run `npm run studio:hero:render`, `npm run studio:hero:publish`, `npm run studio:evidence:capture`, and `npm run showcase:check` to reproduce the current public media.",
  "docs.topic.studio.media1": "Current Scene Studio workspace with actors, effects, storyboard, and camera",
  "docs.topic.studio.media2": "Ten-frame action-campaign contact sheet used for visual review",
};

const ZH = {
  // shared
  "docs.topic.pageTitle": "Claude of Tanks 技术手册",
  "docs.topic.manualIndex": "手册首页",
  "docs.topic.kicker": "技术手册 // {label}",
  "docs.topic.heroAlt": "{label}：当前游戏渲染器中呈现的画面",
  "docs.topic.asideKicker": "手册章节",
  "docs.topic.asideBody": "当前运行时契约、实现选择与可验证路径。",
  "docs.topic.asideLink": "返回文档总览 →",

  // build
  "docs.topic.build.label": "游戏的构建方式",
  "docs.topic.build.title": "通过可验证循环构建的浏览器游戏",
  "docs.topic.build.lede": "Claude of Tanks 由一个直接基于 Three.js 的原型，经历了多轮短周期迭代——隔离一个问题、只改动最小归属方、在浏览器中验证、记录结果、合入主分支——最终演化为一款类型化、可测试的游戏。",
  "docs.topic.build.s1.t": "从硬性约束起步",
  "docs.topic.build.s1.p1": "本项目是浏览器原生、直接构建在 Three.js 之上，而非使用通用游戏引擎。仿真以 60 Hz 固定步长运行，可玩坦克全部采用第一方程序化运行时几何体，公开展示页面与重型游戏启动图保持隔离。",
  "docs.topic.build.s1.p2": "这些约束塑造了整体架构：确定性规则可在 Node 中运行、渲染器可独立自适应、每一条对外声明都能指向具体代码、测试、截图或测量凭证。",
  "docs.topic.build.s2.t": "规则与表现分离",
  "docs.topic.build.s2.p1": "运动、弹道、装甲、伤害、点亮、比赛状态和机器人决策均位于无渲染器的契约之后。Three.js 仅把最新状态转换为相机、车辆模型、灯光、特效、音频和 UI，不会成为命中结果的权威。",
  "docs.topic.build.s2.p2": "这一边界使得本地战斗、浏览器内开房和专用服务器共用同一套战斗规则，也让低端画质在不改变玩法的前提下降低成本。",
  "docs.topic.build.s3.t": "Claude Code 与 Codex 工作流",
  "docs.topic.build.s3.p1": "Claude Code 与 Codex 被作为有边界任务的开发工具。重大或高风险的工作被隔离到独立 Git worktree 中；每条分支声明自己负责的文件、保留无关变更，并在合入前交换精确的提交哈希和证据。",
  "docs.topic.build.s3.p2": "工作准则很简单：主分支保持最新、未完成的实验保持隔离、分支不是证据——只有已合入的代码才算数。人类设定目标与验收标准；代理按此实现、测量、审查并记录。",
  "docs.topic.build.s4.t": "构建、证伪、测量",
  "docs.topic.build.s4.p1": "一轮典型工作从可复现的基线开始，再做归因。最小的合理解法会经过聚焦自测、浏览器交互、控制台检查、截图与性能探针验证。一个结果必须能经得起二次运行或故意构造的反例才会被接受。",
  "docs.topic.build.s4.p2": "视觉工作以当前像素为准，不只看数字检查。性能工作记录冷热条件、设备约束、长任务、帧间空隙、GPU 资源与过渡耗时，而不是只报一个平均 FPS。",
  "docs.topic.build.s5.t": "让工作流可复用",
  "docs.topic.build.s5.p1": "仓库级的 AGENTS.md、索引化的子系统 SKILL.md 与一份持续维护的架构决策记录，共同保存归属、不变量、必需命令与常见失败模式，而不会用完成迁移的笔记把贡献者淹没。",
  "docs.topic.build.s5.p2": "凡是重复的手工流程都会被脚本化或变为关卡。这正是模型截图、战斗解剖、车辆图标、路线探针、公开元数据与发布检查都可由仓库复现的原因。原始执行记录保留在 Git 历史或被忽略的 QA 制品中。",
  "docs.topic.build.s6.t": "只合入已集成的证据",
  "docs.topic.build.s6.p1": "完成一项改动后会作为一个内聚单元提交，在最新的 origin/main 上 rebase，并在集成后重新检查。最后一次推送会校验其父提交仍是远端最新，从而避免并发工作悄悄覆盖更新的合入。",
  "docs.topic.build.s6.p2": "公开构建随后验证路由隔离并剥离不可分发的对比素材。这让可玩站点、源码树、文档与主分支始终描述同一款游戏。",
  "docs.topic.build.media1": "当前用于搭建可复现游戏状态的 Scene Studio 与浏览器工具",
  "docs.topic.build.media2": "用于视觉对比与评审的确定性拼版图",

  // models
  "docs.topic.models.label": "程序化模型流水线",
  "docs.topic.models.title": "从参考资料到可上场的战车",
  "docs.topic.models.lede": "Kevin B. Liu 将每一辆可玩战车都设计为第一方程序化运行时几何体。参考资料用于指导比例与细节，但交付的机器始终由代码重建、接入战斗数据、生成专属图标集，并通过数值与视觉双重关卡发布。",
  "docs.topic.models.s1.t": "研究与资料整理",
  "docs.topic.models.s1.p1": "一轮建模从来源照片、公开尺寸、平面/侧面参考，或（在许可允许的条件下）对比网格开始。资料是识别造型时的参照物——既不是可玩资产，也不是当资料本身有误时的自动真理。",
  "docs.topic.models.s1.p2": "比例优先：车体长宽、炮塔站位、顶高、炮长、轮数、履带走向以及主要装甲块必须先读对，再补小附件。",
  "docs.topic.models.s2.t": "用零件拼出可见的机器",
  "docs.topic.models.s2.p1": "程序化构建器从可复用的几何与材质词汇中拼装车体装甲板、炮塔壳、护盾、炮管、行走机构、光学设备、舱口、烟雾弹发射器、储物筐、天线、装甲套件与外挂物。站位分段测量保证前、中、后段造型忠实，而不是拉伸一个通用盒子。",
  "docs.topic.models.s2.p2": "参与迷彩的结构件与中性机械件使用显式角色。对比 GLB 永远不会作为隐藏的生产回退路径。",
  "docs.topic.models.s3.t": "骨架与履带动作绑定",
  "docs.topic.models.s3.p1": "车体、炮塔、炮架、后坐组、炮口、负重轮、托带轮、主动轮、诱导轮与连接履带都拥有明确的归属。炮塔上的设备需随炮塔旋转并保持正确位置；车体设备不得跟随其旋转。炮口必须贯通，并由真实的炮管层级解析得到。",
  "docs.topic.models.s3.p2": "悬挂机构在每个支撑站位对地面采样。本土行走机构保持正确的轮数与履带路径，同时避免重复使用供体轮、削切的履带板或漂浮的附加物。",
  "docs.topic.models.s4.t": "从同一造型派生战斗解剖",
  "docs.topic.models.s4.p1": "装甲板、间隔层、反应装甲、模块、弹药、燃油、乘员与活动铰链都按已校验的车辆坐标系标定。游戏因此对表现、命中轨迹、内部损伤和技术侧视图使用同一份建模数据。",
  "docs.topic.models.s4.p2": "结构性指挥塔可参与命中几何；瞄具、机枪、储物筐、天线与松散装备除非被玩法显式赋予物理角色，否则仅为表现件。",
  "docs.topic.models.s5.t": "生成图标与技术卡",
  "docs.topic.models.s5.p1": "资产流水线将当前程序化模型渲染为车库与图库图像、透明剪影、装甲图、独立的模块与乘员图、层级处理以及辅助展示视图。统一的取景策略让一次确定性的角度抓取同时输出两种肖像尺寸，避免遗留手工裁剪或陈旧的缩略图。",
  "docs.topic.models.s5.p2": "仅肖像工作时，使用 `npm run tank:portraits -- --ids=<changed ids>` 与 `npm run tank:portraits:check -- --ids=<changed ids>`。完整发布顺序仍为 `npm run tank:anatomy:update`、`npm run tank:anatomy:check`，随后 `npm run tank:release:check -- --ids=<changed ids> --gate`。",
  "docs.topic.models.s6.t": "测量、检视、毕业",
  "docs.topic.models.s6.p1": "自动化关卡会检查几何指纹、尺寸、站位、悬浮物、履带交叉、轮组质量、炮口贯通、材质、装甲解剖、标识、出处和确定性资产新鲜度。然后用标准的前、四分、侧、后、顶、特写与偏航视图暴露数字评分看不出的缺陷。",
  "docs.topic.models.s6.p2": "只有当所有必检视图通过视觉验收下限、附件具备承重路径、绕序与背面健康、并通过洁净的集成发布检查时，模型才算毕业。Tank Gallery 即为该最终程序化模型的实时检视界面。",
  "docs.topic.models.media1": "Tank Gallery 当前渲染的 T-90M Proryv 及其诊断层",
  "docs.topic.models.media2": "已发布的首方模型，含装甲、附件、标识与行走机构",

  // ai
  "docs.topic.ai.label": "机器人与战术 AI",
  "docs.topic.ai.title": "一个机器人控制器，覆盖所有战场",
  "docs.topic.ai.lede": "单人模式和权威多人模式下的机器人共用同一套无渲染器决策逻辑。它们在带种子的战场图上导航、遵守队伍与可见性规则、选择可行的射击、利用车辆能力，并且无需 GPU 也可测试。",
  "docs.topic.ai.s1.t": "感知与目标选择",
  "docs.topic.ai.s1.p1": "机器人使用与权威侧相同的队伍、可见性、距离、血量与车辆状态契约，不会读取渲染对象或仅客户端持有的隐藏坐标。候选目标根据当前战术状态打分，而不是仅凭场景接近度选取。",
  "docs.topic.ai.s1.p2": "难度调整会改变反应速度、瞄准质量、交战距离与决策压力，而不会让机器人获得不应掌握的信息。",
  "docs.topic.ai.s2.t": "带种子的路线规划",
  "docs.topic.ai.s2.p1": "每一场比赛从地形通过性、世界碰撞、开口、目标点和车辆能力构建一份类型化的可穿越栅格。规划器围绕被封堵的格子提供确定性路径，局部转向负责临时的对齐与避让。",
  "docs.topic.ai.s2.p2": "路线决策可在 Node 中跨所有地图复现，包括重型车辆、履带损伤、陡坡与目标模式。",
  "docs.topic.ai.s3.t": "炮控与射击决策",
  "docs.topic.ai.s3.p1": "控制器会遵守炮塔回转、俯仰、炮口遮挡、装填、弹仓、散布、弹速、穿深与目标运动。它在当前武器和角度使射击可信时，瞄准可击穿的装甲和内部弱点。",
  "docs.topic.ai.s3.p2": "机关炮、单发炮、自动装弹机与制导武器共用同一条决策边界，但各自应用自己的节奏与弹药状态。",
  "docs.topic.ai.s4.t": "队伍安全与压力",
  "docs.topic.ai.s4.p1": "友军车辆会被排除在有效射击路径之外，控制器也会避免隔着友军开火。机器人分散注意力、移动到有用的线路、支援目标点，并保持足够间距以免让友方集群变成障碍。",
  "docs.topic.ai.s4.p2": "敌方机器人和友方机器人使用同一套逻辑。队伍归属改变目标与目标点，但不改变能力。",
  "docs.topic.ai.s5.t": "生存与恢复",
  "docs.topic.ai.s5.p1": "机器人会综合考虑暴露、掩体、履带损伤、模块失效、维修机会、弹药状态和附近威胁。它们可以脱离不利角度、恢复机动、损毁后重新规划路线并继续贡献，而不是停在开阔地等待。",
  "docs.topic.ai.s5.p2": "模式目标叠加在这些生存决策之上，使占领、防守、护送与无尽人海压力都不需要再为运动另设一套假系统。",
  "docs.topic.ai.s6.t": "验证",
  "docs.topic.ai.s6.p1": "聚焦的 AI 测试覆盖瞄准、误伤规避、路线、难度、确定性决策与权威机器人集成。地图级的服务端测试在无渲染器的条件下运行控制器；浏览器战斗则验证可见的移动、开火与特效是否与这些决策一致。",
  "docs.topic.ai.s6.p2": "机器人改动需运行 `node src/game/ai.selftest.mjs`、`node src/sim/ai.aim.selftest.mjs`、`node src/sim/botRoutePlanner.selftest.mjs` 与 `node server/authoritativeBots.selftest.mjs`。",
  "docs.topic.ai.media1": "在通路上交火并执行权威射击的混编车辆",
  "docs.topic.ai.media2": "步兵战车接触瞬间：运动、目标压力与队伍间距",

  // audio
  "docs.topic.audio.label": "音频与战场特效",
  "docs.topic.audio.title": "每一声响都源自一个游戏事件",
  "docs.topic.audio.lede": "武器、引擎、撞击、履带、环境、车组无线电、毁坏与回放音频，都是对规范化事件与听者状态的呈现响应。音频系统从不决定是否开火或命中。",
  "docs.topic.audio.s1.t": "武器、撞击与运动",
  "docs.topic.audio.s1.p1": "规范的射击、弹丸、穿透、伤害、毁坏、引擎与履带事件驱动对应的声层。附近的远距战车在常规第三人称下仍可听见；瞄准镜模式会改变视角，而不会变成意外的静音。",
  "docs.topic.audio.s1.p2": "武器家族、口径、连发节奏、距离和环境塑造呈现效果，而作为源头的战斗事件仍是唯一的真相来源。",
  "docs.topic.audio.s2.t": "空间听者模型",
  "docs.topic.audio.s2.p1": "听者将相机朝向与所乘车辆的位置结合，并在玩家、瞄准镜、观察者与击杀回放视角间显式切换。这一混合模型保留方向感，而不会让绕飞的相机把玩家从战车里剥离。",
  "docs.topic.audio.s2.p2": "所乘引擎无论距离都保持可闻。远距引擎循环按距离限流并排名，使满员战斗下的混音可控。",
  "docs.topic.audio.s3.t": "混音状态与声部上限",
  "docs.topic.audio.s3.p1": "Web Audio 总线将武器、引擎、撞击、环境、音乐、无线电与界面反馈分离开来。优先级、冷却、去重、距离与相位状态限制并发声部数量，并防止重复的网络事件把同一个声音加倍。",
  "docs.topic.audio.s3.p2": "音频仅在用户手势后初始化。延迟传输保持启动轻盈，离开战斗时会停止世界循环与陈旧的实体声。",
  "docs.topic.audio.s4.t": "车组无线电与反馈",
  "docs.topic.audio.s4.p1": "类型化的车组台词响应有用的事件，如命中、穿透、模块损伤、点亮、装填状态与毁坏。排程偏向新鲜的高优先级信息，并拒绝太迟到达、已无法描述当前战况的台词。",
  "docs.topic.audio.s4.p2": "短促的反馈层强化 HUD，而不会逐一播报每个动作或盖过附近的武器声。",
  "docs.topic.audio.s5.t": "击杀回放的时间与视角",
  "docs.topic.audio.s5.p1": "击杀回放拥有独立的听者位姿与时间缩放。回放音频被拉伸并滤波以跟随放慢的视觉事件，而不会在慢动作下播放一段常速的射击。",
  "docs.topic.audio.s5.p2": "进入和离开回放会干净地拆除其临时路由，再恢复观察者或车库音频。",
  "docs.topic.audio.s6.t": "验证",
  "docs.topic.audio.s6.p1": "纯时序测试覆盖排程、陈旧度、优先级与相位拆除。空间探针将听者与距离场景渲染为 PCM；规范的音频探针验证事件覆盖与总线路由。",
  "docs.topic.audio.s6.p2": "音频改动请使用 `node src/audio/audioTiming.selftest.mjs`、`node src/audio/voices.selftest.mjs`、`node tools/audio-spatial-killcam-probe.mjs` 与 `node tools/audio-probe.mjs`。",
  "docs.topic.audio.media1": "战斗中重叠的武器、撞击、引擎与毁坏事件",
  "docs.topic.audio.media2": "当前放慢的 X 光击杀回放，使用专属的听者与时序",

  // performance
  "docs.topic.performance.label": "性能与加载",
  "docs.topic.performance.title": "测量玩家真正感受到的那一帧",
  "docs.topic.performance.lede": "性能工作覆盖冷启动、车库驻留、战斗获取、倒计时预热、战斗前十秒、稳态帧率、设备自适应与恢复——而不仅仅是一个平均帧率。",
  "docs.topic.performance.s1.t": "保持启动与路由隔离",
  "docs.topic.performance.s1.p1": "车库在明确的 Battle 意图出现前不会构建战场。公开页面不导入可玩渲染器；车库启动也不会急切地导入完整的仿真或舰队图。具体的车辆族与世界工作只在所选路由需要时才获取。",
  "docs.topic.performance.s1.p2": "冷启动探针禁用缓存并记录网络与应用工作，让一次热导航无法冒充首访性能。",
  "docs.topic.performance.s2.t": "把战斗加载藏到幕布之后",
  "docs.topic.performance.s2.p1": "战斗进入阶段会获取精确的世界与阵容、上传所需纹理、准备特效、提交车辆材质、预热着色器与后处理，并在揭示前建立首个可用相机。必需工作在倒计时之前完成，而不是以黑屏或冻屏开场。",
  "docs.topic.performance.s2.p2": "进度反映归属的阶段。意图改变时取消陈旧工作；可重试的生命周期负责恢复，而不是把定时器散落在组合根中。",
  "docs.topic.performance.s3.t": "记录完整的帧证据",
  "docs.topic.performance.s3.p1": "开发的飞行记录器存储路由过渡、长任务、帧间空隙、渲染器计数、分辨率、仿真负债、内存与具名 span。性能 HUD 暴露聚焦探针的实时统计，并保存事件历史供后续归因。",
  "docs.topic.performance.s3.p2": "开战斗探针聚焦于倒计时之后的前十秒，因为着色器生成、阵容提交、音频启动和特效爆发常藏在这里。",
  "docs.topic.performance.s4.t": "在工作归属处削减成本",
  "docs.topic.performance.s4.p1": "静态的车库表现会在两次失效之间休眠。已建立的帧循环会复用 scratch 对象、排序或错峰昂贵更新、池化瞬态特效、缓存稳定的世界、按需加载车辆族、剔除不可见的渲染提交，而不只是降低画质。",
  "docs.topic.performance.s4.p2": "只有当同一场景在不让成本转移到加载、内存、正确性或后续帧的前提下取得提升时，优化才算被接受。",
  "docs.topic.performance.s5.t": "适配真实设备",
  "docs.topic.performance.s5.p1": "能力探针与实测过载共同决定渲染分辨率、阴影、植被、特效预算和后处理。桌面、移动与受限配置从不同起点启动，并使用滞回调整以避免可见的振荡。",
  "docs.topic.performance.s5.p2": "GPU 恢复会校验帧缓冲并可降级可选的表现层。仿真频率、弹道、装甲与网络权威保持不变。",
  "docs.topic.performance.s6.t": "预算与发布证据",
  "docs.topic.performance.s6.p1": "发布探针覆盖冷加载、过渡、战斗开场、持续游玩、地图与坦克切换、回归车库状态、移动布局以及受限的 CPU/网络配置。报告包含 p95 帧间空隙、长任务、程序生成、绘制量、内存与就绪时间。",
  "docs.topic.performance.s6.p2": "对应性能声明请使用 `npm run perf:cold`、`npm run perf:dev`、`npm run perf:resources:gate`、`npm run qa:device` 与 `npm run build`。",
  "docs.topic.performance.media1": "K2 的当前实景帧，其节奏、缩放、绘制量与仿真负债被同时测量",
  "docs.topic.performance.media2": "当前适配紧凑设备、触控安全表现的车库",

  // simulation
  "docs.topic.simulation.label": "仿真与战斗",
  "docs.topic.simulation.title": "每一次命中都有其轨迹",
  "docs.topic.simulation.lede": "战斗仿真以 60 Hz 推进。运动、瞄准、弹道、装甲、伤害、装填、点亮与比赛结果都由权威状态解算——而不是由渲染帧解算。",
  "docs.topic.simulation.s1.t": "固定步长战斗循环",
  "docs.topic.simulation.s1.p1": "权威步使用米、秒、弧度，并采用固定的 1/60 秒间隔。输入先被采样为显式的车辆控制，再按稳定的顺序执行运动、战斗、点亮与结果评估。渲染速率的改变不会影响仿真步的数量与顺序。",
  "docs.topic.simulation.s1.p2": "帧时间尖峰会被累积为有界固定步。权威随机性使用种子或注入的随机源。影响射击、装填、模块状态或比赛结果的规则会排除挂钟时间和 `Math.random()`。",
  "docs.topic.simulation.s2.t": "瞄准与开火创建",
  "docs.topic.simulation.s2.p1": "相机瞄准与火炮瞄准相互独立。相机选择请求点；回转、俯仰、悬挂姿态与炮口遮挡决定炮管实际能指向的位置。炮弹在解析出的炮口变换处生成，携带当前弹药、速度、散布与所有者身份。",
  "docs.topic.simulation.s2.p2": "HUD 同时绘制两种状态：相机标记表达请求，炮管标记表达弹道线。“路径被挡”与火炮极限反馈因此描述物理约束，而非把请求粉饰为事实。",
  "docs.topic.simulation.s3.t": "装甲轨迹与穿透",
  "docs.topic.simulation.s3.p1": "炮弹线段先与世界碰撞测试，再与车辆装甲测试。车辆查询把射线变换到目标位姿，排序装甲板相交、计算距离与角度、套用法向或跳弹规则，并消耗剩余穿深。间隔层与内部舱室保持原遍历顺序。",
  "docs.topic.simulation.s3.p2": "穿透会继续经过内部模块与乘员舱室。即便未能穿透，也会产生权威的撞击事件。表现层接收已解算的路径与结果，但不会重新执行该决策。",
  "docs.topic.simulation.s4.t": "伤害、装填与特殊武器",
  "docs.topic.simulation.s4.p1": "伤害更新血量、履带、引擎、燃油、弹药、火炮、炮塔驱动、光学与乘员状态。自动装弹机区分弹匣内间隔与弹仓再装。制导导弹保留活跃的弹丸与转向状态，直至命中或失效。起火、弹药架事件、撞击与维修共用同一条事件边界。",
  "docs.topic.simulation.s4.p2": "X 光回放、命中卡、伤害日志、装填架、撞击特效与音效都消费这些事件，使可见反馈与单人/多人权威使用的结果保持一致。",
  "docs.topic.simulation.s5.t": "战斗规则",
  "docs.topic.simulation.s5.p1": "标准战、夺旗、占区、Turbo Ball 与无尽人海在同一套完整坦克仿真上叠加。夺旗与占区模式带来 6 秒复活。Turbo Ball 在武器保持可用的同时提供 1.85× 机动，且炮弹可击中球体。无尽人海会按确定性节奏推高机器人波次，并在地图上放置愈发稀缺的维修或弹药补给。",
  "docs.topic.simulation.s5.p2": "无渲染器的模式控制器掌管得分、目标、复活计时、波次、补给与机器人目标点。单人、私人房与局域网房间使用同一套规则；房主选择以规范化的大厅状态传递，并在重开赛中保留。",
  "docs.topic.simulation.s6.t": "验证",
  "docs.topic.simulation.s6.p1": "可在 Node 运行的自测覆盖运动、战斗、点亮、导弹制导、特殊动作、AI 瞄准以及完整的权威比赛。浏览器探针再补充炮口贯通、弹丸飞行、实景撞击特效与 HUD 对齐。",
  "docs.topic.simulation.s6.p2": "改动共享战斗规则后，请运行 `node src/sim/combat.selftest.mjs`、`node src/sim/authoritativeMatch.selftest.mjs` 与 `npm test`。",
  "docs.topic.simulation.media1": "当前解析的穿越装甲、模块与乘员的 X 光路径",
  "docs.topic.simulation.media2": "由同一场定格战斗状态呈现的炮口闪光、曳光、撞击与毁坏",

  // vehicles
  "docs.topic.vehicles.label": "车辆与行走机构",
  "docs.topic.vehicles.title": "整台机器作为一个整体运动",
  "docs.topic.vehicles.lede": "每一辆可选战车都是第一方程序化运行时模型。同一份车辆记录驱动其几何、尺寸、装甲、内部解剖、机动、火炮、弹药、图标集、车库档案与战斗行为。",
  "docs.topic.vehicles.s1.t": "车辆契约",
  "docs.topic.vehicles.s1.p1": "车辆规格定义身份、级别、国家、层级、尺寸、质量、引擎输出、速度、回转、火炮限制、弹药、装甲、模块、乘员、装备策略与构建器。消费者只读取注册表，不再各自保存并行事实。",
  "docs.topic.vehicles.s1.p2": "实体 ID 不等于车辆规格 ID。多人允许重复选择同一辆坦克，因此身份、归属与规格贯穿状态与表现始终保持分离。",
  "docs.topic.vehicles.s2.t": "程序化骨架",
  "docs.topic.vehicles.s2.p1": "构建器创建车体、炮塔、炮架、火炮、行走机构、履带、光学、附件、标识与毁坏钩子，归属稳定。战车前向为本地 +Z。动作绑定在显式枢轴上，炮口由真实的炮管层级解析得到。",
  "docs.topic.vehicles.s2.p2": "顶部设备可随炮塔移动但不会变成装甲。指挥塔可参与命中几何；机枪、天线、储物筐、松散外挂与仅作表现用的附件不参与。",
  "docs.topic.vehicles.s3.t": "悬挂与履带",
  "docs.topic.vehicles.s3.p1": "每个受支撑的车轮都在自己的站位下对地面采样。视觉悬挂与这些接触点贴合，车体根据支撑推导出俯仰与横滚，履带路径围绕移动后的车轮重建。瑞典式攻城悬挂叠加受控的车体姿态而不破坏火炮随动。",
  "docs.topic.vehicles.s3.p2": "履带动画随行驶距离与单侧速度推进。损伤可以拆离某一侧、移除其行走带、抛出持续的履带条，并留下松散的行走机构碎片。",
  "docs.topic.vehicles.s4.t": "战斗解剖",
  "docs.topic.vehicles.s4.p1": "装甲板、模块与乘员站位都按车辆坐标系编写，并随实时位姿变换。生成的侧面图就是这份数据的凭证，并非另画的近似。",
  "docs.topic.vehicles.s4.p2": "任何可玩几何或档案的改动都需要运行 `tank:anatomy:update`、`tank:anatomy:check`，再跑带关卡的目标化发布检查。这会一并刷新装甲、模块、乘员、图标与技术图的证据。",
  "docs.topic.vehicles.s5.t": "舰队发布关卡",
  "docs.topic.vehicles.s5.p1": "外观、炮口、材质、车轮、后坐、战斗解剖、出处以及规格专属的检查在车辆被认定为现行版本之前必须全部通过。可玩加载绝不会回退到对比 GLB。",
  "docs.topic.vehicles.s5.p2": "Tank Gallery 会构建实时构建器并叠加规范化的诊断体，使其成为车辆改动最快的现场审阅面。",
  "docs.topic.vehicles.media1": "T-90M Proryv 当前模型，含动作绑定与诊断层",
  "docs.topic.vehicles.media2": "当前战斗细节下的车辆几何与行走机构",

  // rendering
  "docs.topic.rendering.label": "渲染器与图形",
  "docs.topic.rendering.title": "渲染可以自适应，规则却不能变",
  "docs.topic.rendering.lede": "Three.js 仅负责表现。自适应分辨率、阴影、植被、后处理、粒子与预热会随设备变化；60 Hz 战斗模型保持不变。",
  "docs.topic.rendering.s1.t": "帧组合",
  "docs.topic.rendering.s1.p1": "渲染路径基于最新的插值状态更新相机、可见的车辆模型、世界细节、表现特效、灯光、阴影与后处理。已建立的热循环复用 scratch 对象与对象池，而不是每帧分配。",
  "docs.topic.rendering.s1.p2": "晚于不透明物体的特效与主场景共享深度信息。炮口光、曳光、火花、烟尘、火与碎片按距离与画质策略被接纳。",
  "docs.topic.rendering.s2.t": "光照与后处理",
  "docs.topic.rendering.s2.p1": "生物群落光照提供太阳方向、天空、雾、曝光与阴影策略。稳定的级联阴影跟随相关的相机区域。后处理链组合环境光遮蔽、抗锯齿、必要的泛光、输出分级以及最终的动态渲染缩放。",
  "docs.topic.rendering.s2.p2": "截图视角会固定画质与渲染缩放，避免对比图漂移。持续负载下，玩法可降级昂贵的层。",
  "docs.topic.rendering.s3.t": "自适应画质",
  "docs.topic.rendering.s3.p1": "桌面与移动端解析出不同的起始配置。内部分辨率、阴影工作、植被密度、特效预算和后处理可独立降级。滞回机制防止快速振荡。",
  "docs.topic.rendering.s3.p2": "设备诊断与实测过载——而非仅靠 user-agent 字符串——决定安全路径。画质变化绝不改变炮弹飞行、点亮、伤害或权威时序。",
  "docs.topic.rendering.s4.t": "加载与恢复",
  "docs.topic.rendering.s4.p1": "启动关键模块避免导入完整的舰队构建图。延迟构建车辆、着色器预热、离屏准备与缓存的车库驻留会压平过渡尖峰。上下文丢失处理在不臆造战斗状态的前提下恢复表现状态。",
  "docs.topic.rendering.s4.p2": "截图与加载探针将黑帧、过期交换、控制台错误和不完整的车库模型视为失败。",
  "docs.topic.rendering.s5.t": "性能证据",
  "docs.topic.rendering.s5.p1": "性能 trace 记录帧类别、渲染器计数、动态缩放与过渡预算。浏览器探针覆盖冷加载、战斗进入、地图切换、车库与多人渲染。",
  "docs.topic.rendering.s5.p2": "渲染相关工作请使用 `npm run perf:dev`、`npm run perf:cold`、`npm run perf:transitions` 与生产构建。",
  "docs.topic.rendering.media1": "Leclerc XLR 当前精度瞄具，经历光照、深度、抗锯齿与输出分级后",
  "docs.topic.rendering.media2": "当前世界光照下近距离的车辆材质表现",

  // worlds
  "docs.topic.worlds.label": "战场与毁坏",
  "docs.topic.worlds.title": "为装甲机动而生的战场",
  "docs.topic.worlds.lede": "二十张战场共用同一套世界契约，但保留各自的路线、地标、掩体、氛围与视野。地形与碰撞对仿真可用，且不需要导入渲染器。",
  "docs.topic.worlds.s1.t": "地图契约",
  "docs.topic.worlds.s1.p1": "每张地图提供地形高度、地表材质、障碍、碰撞、隐蔽、出生组、占领区、灯光、天气、声音上下文与确定性的开场相机。仿真消费者使用这些接口，而不是遍历场景。",
  "docs.topic.worlds.s1.p2": "注册表是选择、加载、Studio、截图与文档计数的唯一来源。",
  "docs.topic.worlds.s2.t": "地形与机动",
  "docs.topic.worlds.s2.p1": "高度场回答车辆支撑、弹丸碰撞、相机净空与道具布置。地表类别影响抓地力与表现。道路、坡地、山脊、水边与半埋射击位围绕预期的装甲路线组合而成。",
  "docs.topic.worlds.s2.p2": "车辆悬挂对地面的采样与运动、弹道地形查询共用同一份地表。",
  "docs.topic.worlds.s3.t": "结构与公用设施",
  "docs.topic.worlds.s3.p1": "结构族暴露可读的开口、材质集、毁坏状态与碰撞。公用网络在合理跨度间连接电杆与电线。大型掩体阻断视野；小型视觉附件不会变成不可见的墙。",
  "docs.topic.worlds.s3.p2": "脱落的门、护栏、街景件与其他松散道具进入有界物理系统，并具备稳定的休眠与清理规则。",
  "docs.topic.worlds.s4.t": "毁坏与残骸",
  "docs.topic.worlds.s4.p1": "被毁车辆保留残骸几何、脱落的履带、火、烟与碎片。地图残骸与拆解的车库部件使用现代第一方车辆族。炮塔、车体、车轮、反应装甲与武器除非显式注册到碰撞，否则仅作装饰。",
  "docs.topic.worlds.s4.p2": "持续的余烬是依据权威毁坏事件派生的表现状态。",
  "docs.topic.worlds.s5.t": "地图质量关卡",
  "docs.topic.worlds.s5.p1": "自动检查会审计出生点、边界、材质覆盖、结构、公用设施、碰撞、残骸、松散道具与布置。确定性的战斗截图会暴露数字关卡无法识别的糟糕剪影与被阻的路线。",
  "docs.topic.worlds.s5.p2": "地图改动后请运行 `node src/world/mapQuality.selftest.mjs`、邻近的世界自测以及定向的截图视图。",
  "docs.topic.worlds.media1": "经过设计的果园路线，含结构、植被、地形与特效",
  "docs.topic.worlds.media2": "沿海路线、持续燃烧的残骸火焰与前景车辆",

  // multiplayer
  "docs.topic.multiplayer.label": "多人权威",
  "docs.topic.multiplayer.title": "客户端请求，服务器决定",
  "docs.topic.multiplayer.lede": "多人路径将命中、伤害、装填、点亮、机器人和比赛结果保留在权威侧。客户端预测本地运动并呈现经过过滤的快照。",
  "docs.topic.multiplayer.s1.t": "房间与比赛生命周期",
  "docs.topic.multiplayer.s1.p1": "房间持有成员、队伍、所选车辆、迷彩、地图选择、准备状态、聊天、邀请与断线重连状态。比赛交接会创建一个具有稳定玩家与实体身份的权威世界。",
  "docs.topic.multiplayer.s1.p2": "观察者拥有明确的队伍与视角，绝不借用一辆载具的 ID 作为自己的玩家身份。",
  "docs.topic.multiplayer.s2.t": "输入与快照",
  "docs.topic.multiplayer.s2.p1": "客户端发送归一化的控制输入与有序的输入序号。权威推进与单人模式相同的固定步运动与战斗模块。快照携带已确认的输入、可见的实体、战斗状态与表现事件。",
  "docs.topic.multiplayer.s2.p2": "本地坦克预测并对账，远程坦克插值。两条路径都不会改变权威的射击结果。",
  "docs.topic.multiplayer.s3.t": "点亮边界",
  "docs.topic.multiplayer.s3.p1": "敌方坐标在序列化前被过滤。客户端绝不会收到隐藏位置并依赖渲染来隐藏。点亮持续、观察者规则与队伍可见性都在快照边界处生效。",
  "docs.topic.multiplayer.s3.p2": "这一边界也同时管辖小地图、名牌、特效与音频表现。",
  "docs.topic.multiplayer.s4.t": "战斗事件",
  "docs.topic.multiplayer.s4.p1": "服务器生成炮弹、校验装填与弹仓状态、解算世界与装甲命中、更新模块与乘员，并发出有序的表现事件。客户端使用这些事件驱动曳光、撞击、命中卡、击杀回放与音效。",
  "docs.topic.multiplayer.s4.p2": "重复的车辆选择依然安全，因为事件使用的实体与所有者身份与车辆规格相互独立。",
  "docs.topic.multiplayer.s5.t": "实景验证",
  "docs.topic.multiplayer.s5.p1": "浏览器浸泡测试覆盖访客进入、四人房、7v7 阵容、不利传输、断线重连交接、渲染以及双方实时造成伤害。无头权威测试覆盖机器人、节奏、结果、排名与持久化。",
  "docs.topic.multiplayer.s5.p2": "完整的“能跑能打”关卡请运行 `npm run test:net:seven:live`。",
  "docs.topic.multiplayer.media1": "紧凑目标切换器下的友军追击相机",
  "docs.topic.multiplayer.media2": "权威交接前的队伍名册与房间状态",

  // interface
  "docs.topic.interface.label": "界面与控制",
  "docs.topic.interface.title": "读懂战车而不丢失视野",
  "docs.topic.interface.lede": "车库、HUD、瞄具、击杀回放、观察者模式、战报、设置、键盘、鼠标、手柄与触摸输入共用一套控制与排版系统。",
  "docs.topic.interface.s1.t": "车库与出击",
  "docs.topic.interface.s1.p1": "车库综合车辆选择、档案、弹药、装备、迷彩、地图、模式、房间状态与启动。选择与所展示展台的身份通过显式状态保持同步。",
  "docs.topic.interface.s1.p2": "界面可直接进入 Tank Gallery 做更深入的几何检查，也可进入 Scene Studio 做构图工作。",
  "docs.topic.interface.s2.t": "战斗 HUD",
  "docs.topic.interface.s2.p1": "HUD 优先展示分数、时间、双方、瞄具状态、弹药、消耗品、小地图、伤害、点亮与短促的事件反馈，而不会持续复述每个系统。",
  "docs.topic.interface.s2.p2": "装填架使用权威的弹仓状态。伤害面板使用当前模块。队伍与小地图信息遵循点亮边界。",
  "docs.topic.interface.s3.t": "死亡、击杀回放与观察",
  "docs.topic.interface.s3.p1": "死亡瞬间会先展示玩家被毁的镜头，再进入 X 光回放。如果战斗继续，相机切换到一名存活的友军。紧凑切换器会指明目标车辆、其在存活名册中的位置、均衡的前后切换以及安静的退出车库方式。",
  "docs.topic.interface.s3.p2": "鼠标移动可绕飞友军，但不会转动炮塔。键盘与触摸目标保持至少 44 像素的交互尺寸。",
  "docs.topic.interface.s4.t": "输入与移动端",
  "docs.topic.interface.s4.p1": "键盘、鼠标、指针锁定回退、自由观察、缩放、触摸摇杆、滑动瞄准、双指开镜、弹药选择、特殊动作与消耗品被归一化为游戏输入。UI 归属防止文本框或对话框把按键泄漏到战斗中。",
  "docs.topic.interface.s4.p2": "安全区布局、紧凑标签与设备专属画质在手机上保留相同的战斗规则。",
  "docs.topic.interface.s5.t": "无障碍与回归检查",
  "docs.topic.interface.s5.p1": "语义化按钮、可见的焦点、减弱动效处理、富描述的媒体替代方案、对比度与触控尺寸都是公开与游戏内界面的组成部分。响应式 QA 覆盖桌面与 390 像素布局。",
  "docs.topic.interface.s5.p2": "聚焦的自测覆盖键盘归属、设置、图标、国旗、加载界面、结算界面、观察者切换器与触摸控制。",
  "docs.topic.interface.media1": "小地图上方的 390 像素观察者布局",
  "docs.topic.interface.media2": "触控安全的车库与移动端控制表现",

  // studio
  "docs.topic.studio.label": "Scene Studio 与截取",
  "docs.topic.studio.title": "每一帧公开画面都可复现",
  "docs.topic.studio.lede": "Scene Studio 在浏览器内使用当前的地图、车辆构建器、动作绑定、特效与相机系统，创建确定性的静帧与视频。",
  "docs.topic.studio.s1.t": "场景文档",
  "docs.topic.studio.s1.p1": "场景保存地图、种子、演员规格 ID、名称、位置、航向、炮塔与火炮位姿、迷彩、特效、相机、时间和可选的分镜。加载时会从当前第一方资产重建。",
  "docs.topic.studio.s1.p2": "这份 JSON 是可复现性记录，不是烘焙好的截图描述。",
  "docs.topic.studio.s2.t": "时间线与演员",
  "docs.topic.studio.s2.p1": "演员轨道在确定性时间内对位置与动作做插值。分镜镜头对相机位置、目标、视场、横滚与转场做动画。拖动评估两者时不依赖挂钟时间。",
  "docs.topic.studio.s2.p2": "当前五部 hero 影片使用跨五张战场的四关键点轨道。每个轨道在从接触到命中的过程中保持多辆战车的可读性。",
  "docs.topic.studio.s3.t": "特效",
  "docs.topic.studio.s3.p1": "火焰、曳光、撞击、火花、扬尘、机枪连发、履带损伤、油料杀伤与弹药架杀伤被安排在同一时间线上。特效由演员锚点或显式的世界点解析。",
  "docs.topic.studio.s3.p2": "截取母版在公开编码之前保留 30 帧/秒的运动与特效。",
  "docs.topic.studio.s4.t": "截取流水线",
  "docs.topic.studio.s4.p1": "Studio 通过生产渲染器录制 VP9。当前的发布器在不做二次有损视频编码的前提下保留 1920×1080 hero 母版，发布原生 3840×2160 玩法影片，并生成静帧海报与字节凭证。公开播放使用循环视频，而非 GIF。",
  "docs.topic.studio.s4.p2": "若车辆被景物遮挡、特效抹去剪影、相机穿越几何，或源分辨率低于交付合同，轨道即视为失败。",
  "docs.topic.studio.s5.t": "静帧战役",
  "docs.topic.studio.s5.p1": "战斗战役从场景 JSON 起步，渲染审阅截图、平铺对比图、导出 4K 帧、运行图像统计，并要求作者签字。公开档案保留其场景标识与审阅表。",
  "docs.topic.studio.s5.p2": "复现当前公开素材请运行 `npm run studio:hero:render`、`npm run studio:hero:publish`、`npm run studio:evidence:capture` 与 `npm run showcase:check`。",
  "docs.topic.studio.media1": "当前 Scene Studio 工作区，含演员、特效、分镜与相机",
  "docs.topic.studio.media2": "用于视觉评审的十帧动作战役对比图",
};

const enKeys = Object.keys(EN);
const zhKeys = Object.keys(ZH);
if (enKeys.length !== zhKeys.length) {
  console.error(`MISMATCH: en=${enKeys.length} zh=${zhKeys.length}`);
  for (const k of enKeys) if (!ZH[k]) console.error(`  missing in ZH: ${k}`);
  for (const k of zhKeys) if (!EN[k]) console.error(`  missing in EN: ${k}`);
  process.exit(1);
}
console.log(`OK: ${enKeys.length} topic keys`);

const EN_FILE = resolve(ROOT, 'src/ui/i18nCatalog.en-US.ts');
const ZH_FILE = resolve(ROOT, 'src/ui/i18nCatalog.zh-CN.ts');

const jsquote = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function appendToCatalog(file, headerComment, headerEn, headerZh) {
  let text = readFileSync(file, 'utf8');
  // Remove old header lines
  const enRe = /^ {2}\/\/ documentation topic pages \(docs\/topics\.ts\) -+\n[\s\S]*?^ {2}'docs\.topic\.onThisPage': '[^']*',\n/m;
  const zhRe = /^ {2}\/\/ documentation topic pages \(docs\/topics\.ts\) -+\n[\s\S]*?^ {2}'docs\.topic\.onThisPage': '[^']*',\n/m;
  text = text.replace(enRe, '');
  text = text.replace(zhRe, '');

  const newEn = EN;
  const newZh = ZH;
  const headerLine = `  ${headerComment}\n`;
  const navLine = `  'docs.topic.navAria': '${jsquote(headerEn.nav)}',\n`;
  const onThisPageLine = `  'docs.topic.onThisPage': '${jsquote(headerEn.onThisPage)}',\n`;
  const extras = enKeys.map(k => `  '${k}': '${jsquote(newEn[k])}',`).join('\n');
  const zhExtras = enKeys.map(k => `  '${k}': '${jsquote(newZh[k])}',`).join('\n');

  const block = headerLine
    + navLine
    + onThisPageLine
    + extras
    + '\n'
    + (file === EN_FILE ? '' : zhExtras + '\n');

  // Replace trailing };\n with new block + };\n
  text = text.replace(/\n\};\s*$/, '\n' + block + '};\n');
  writeFileSync(file, text, 'utf8');
}

// EN
let enText = readFileSync(EN_FILE, 'utf8');
enText = enText.replace(
  /\n {2}\/\/ documentation topic pages \(docs\/topics\.ts\) -+\n[\s\S]*?^};\n/m,
  '\n'
);
enText = enText.replace(/\};\s*$/, '');
const enExtras = enKeys.map(k => `  '${k}': '${jsquote(EN[k])}',`).join('\n');
enText += '\n  // documentation topic pages (docs/topics.ts) --------------------------------\n'
  + `  'docs.topic.navAria': 'Technical manual sections',\n`
  + `  'docs.topic.onThisPage': 'On this page',\n`
  + enExtras + '\n};\n';
writeFileSync(EN_FILE, enText, 'utf8');
console.log(`en-US: +${enKeys.length} keys`);

// ZH
let zhText = readFileSync(ZH_FILE, 'utf8');
zhText = zhText.replace(
  /\n {2}\/\/ documentation topic pages \(docs\/topics\.ts\) -+\n[\s\S]*?^};\n/m,
  '\n'
);
zhText = zhText.replace(/\};\s*$/, '');
const zhExtras = enKeys.map(k => `  '${k}': '${jsquote(ZH[k])}',`).join('\n');
zhText += '\n  // documentation topic pages (docs/topics.ts) --------------------------------\n'
  + `  'docs.topic.navAria': '技术手册章节',\n`
  + `  'docs.topic.onThisPage': '本页导航',\n`
  + zhExtras + '\n};\n';
writeFileSync(ZH_FILE, zhText, 'utf8');
console.log(`zh-CN: +${enKeys.length} keys`);
