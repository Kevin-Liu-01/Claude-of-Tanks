import { mountDocsIcons, type DocsIconKey } from './docsIcons.ts';

type TopicSection = readonly [string, ...string[]];
type TopicMedia = readonly [string, string];

interface TopicDefinition {
  label: string;
  title: string;
  lede: string;
  hero: string;
  icon: DocsIconKey;
  sectionIcons: readonly DocsIconKey[];
  sections: readonly TopicSection[];
  media: readonly TopicMedia[];
}

export const TOPIC_ORDER = [
  'build', 'models', 'simulation', 'vehicles', 'rendering', 'performance',
  'worlds', 'ai', 'multiplayer', 'audio', 'interface', 'studio',
] as const;

export const topics: Record<string, TopicDefinition> = {
  build: {
    label: 'How the game was built', title: 'A browser game built through verified loops',
    lede: 'Claude of Tanks grew from a direct Three.js prototype into a typed, tested game through short implementation rounds: isolate one problem, change the smallest owner, prove it in the browser, record the result, and land it on main.',
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    icon: 'build',
    sectionIcons: ['architecture', 'workflow', 'isolation', 'evidence', 'memory', 'landing'],
    sections: [
      ['Start with hard constraints', 'The project is browser-native and built directly on Three.js rather than a general game engine. The simulation runs at a fixed 60 Hz, playable tanks use first-party procedural runtime geometry, and presentation pages stay isolated from the heavy game boot graph.', 'Those constraints shaped the architecture: deterministic rules can run in Node, the renderer adapts independently, and every public claim can point to code, a test, a capture, or a measured receipt.'],
      ['Separate rules from presentation', 'Movement, ballistics, armor, damage, spotting, match state, and bot decisions live behind renderer-free contracts. Three.js turns the latest state into cameras, rigs, lighting, effects, audio, and UI without becoming the authority for a hit.', 'That boundary made local battles, browser-hosted rooms, and dedicated matches share the same combat rules. It also lets lower-end visual settings reduce cost without changing gameplay.'],
      ['Claude Code and Codex workflow', 'Claude Code and Codex were used as development tools across bounded tasks. Broad or risky work moved into isolated Git worktrees; each lane named the files it owned, preserved unrelated changes, and exchanged exact commit hashes and evidence before integration.', 'The working rule was simple: main stays current, unfinished experiments stay isolated, and a branch is not proof. Only the integrated bytes count. Human direction set the target and acceptance bar; agents implemented, measured, reviewed, and documented against it.'],
      ['Build, falsify, and measure', 'A typical round starts with a reproducible baseline, then attribution. The smallest plausible fix is tested with focused self-tests, browser interaction, console inspection, screenshots, and performance probes. A result must survive a second run or a deliberately hostile case before it is accepted.', 'Visual work is judged from current pixels, not only numeric checks. Performance work records cold and warm conditions, device constraints, long tasks, frame gaps, GPU resources, and transition timings instead of reporting a single FPS number.'],
      ['Make the workflow durable', 'Repository-level AGENTS.md, indexed subsystem SKILL.md files, and one maintained architecture decision record preserve ownership, invariants, required commands, and recurring failure modes without burying contributors in completed migration notes.', 'When a manual process repeats, it becomes a script or a gate. That is why model screenshots, combat anatomy, vehicle icons, route probes, public metadata, and release checks are reproducible from the repository. Raw execution receipts stay in Git history or ignored QA artifacts.'],
      ['Land only integrated proof', 'A finished change is committed as one coherent unit, rebased on the latest origin/main, and rechecked after integration. The final push verifies that its parent is still the remote tip so concurrent work cannot silently overwrite a newer landing.', 'The public build then proves route isolation and strips non-distributable comparison material. This keeps the playable site, source tree, documentation, and main branch describing the same game.'],
    ],
    media: [
      ['/media/showcase-r2/15_studio_workspace.webp', 'Current Scene Studio and browser tooling used to stage reproducible game states'],
      ['/media/showcase-r1/process/action-review-02.webp', 'A deterministic contact sheet used for visual comparison and review'],
    ],
  },
  models: {
    label: 'Procedural model pipeline', title: 'From reference to playable machine',
    lede: 'Kevin B. Liu authored every playable tank as first-party procedural runtime geometry. References guide proportion and detail, but the shipped machine is rebuilt from code, connected to combat data, rendered into its own icon set, and released through measured and visual gates.',
    hero: '/media/hero-rails-r2/03_steppe-charge-thread.webm',
    icon: 'models',
    sectionIcons: ['research', 'construction', 'rig', 'anatomy', 'iconPipeline', 'critique'],
    sections: [
      ['Research and reference intake', 'A model round begins with source photographs, published dimensions, plan and side references, or a comparison mesh when its license permits authoring use. The source is an oracle for recognizable shape—not a playable asset and not an automatic truth when the reference itself is wrong.', 'Proportion comes first: hull length and width, turret station, roof height, gun length, wheel count, track course, and major armor masses must read correctly before small fittings are added.'],
      ['Build the visible machine from parts', 'Procedural builders assemble hull plates, turret shells, mantlets, barrels, running gear, optics, hatches, smoke launchers, baskets, antennas, armor kits, and stowage from reusable geometry and material vocabulary. Station-section measurements keep front, middle, and rear masses faithful instead of stretching one generic box.', 'Camouflage-aware structural parts and neutral mechanical parts use explicit roles. Comparison GLBs never become a hidden production fallback.'],
      ['Rig articulation and running gear', 'Hull, turret, gun mount, recoil group, muzzle, wheels, return rollers, sprockets, idlers, and linked tracks have explicit owners. Turret equipment must rotate with the turret and remain visibly seated; hull equipment must not follow it. The muzzle bore must be open and resolve from the actual barrel hierarchy.', 'Suspension samples terrain at each support station. Native running gear preserves the correct wheel count and track path while avoiding duplicated donor wheels, clipping shoes, or floating attachments.'],
      ['Author combat anatomy from the same shape', 'Armor plates, spaced layers, ERA, modules, ammunition, fuel, crew, and articulation anchors are calibrated to the checked vehicle frame. The game therefore uses the same authored shape for presentation, impact tracing, internal damage, and the technical side diagrams.', 'Structural cupolas can participate in hit geometry. Sights, machine guns, baskets, antennas, and loose equipment remain presentation fittings unless gameplay explicitly gives them a physical role.'],
      ['Generate icons and technical cards', 'The asset pipeline renders the current procedural rig into garage and gallery imagery, transparent silhouettes, armor diagrams, separate module and crew diagrams, tier treatments, and supporting presentation views. One deterministic angle capture now emits both portrait sizes through a shared framing policy, so a new tank cannot leave behind a hand-cropped or stale thumbnail.', 'Use `npm run tank:portraits -- --ids=<changed ids>` and `npm run tank:portraits:check -- --ids=<changed ids>` for portrait-only work. The complete release sequence remains `npm run tank:anatomy:update`, `npm run tank:anatomy:check`, then `npm run tank:release:check -- --ids=<changed ids> --gate`.'],
      ['Measure, inspect, and graduate', 'Automated gates check geometry fingerprints, dimensions, stations, floaters, track intersections, wheel quality, muzzle bores, materials, armor anatomy, markings, provenance, and deterministic asset freshness. Standard front, quarter, side, rear, top, close, and yaw views then expose defects a numeric score can miss.', 'A model graduates only when every required view clears the visual acceptance floor, attachments have physical load paths, winding and backfaces are healthy, and the clean integrated release check passes. The Tank Gallery is the live inspection surface for that final procedural rig.'],
    ],
    media: [
      ['/media/showcase-r2/11_gallery_hero.webp', 'Current Tank Gallery rendering a T-90M Proryv and its diagnostic layers'],
      ['/media/presentation-r1/ui_tank_closeup_modern.webp', 'A released first-party rig with armor, fittings, markings, and running gear'],
    ],
  },
  ai: {
    label: 'Bots and tactical AI', title: 'One bot controller for every battlefield',
    lede: 'Solo and authoritative multiplayer bots use the same renderer-free decision logic. They navigate a seeded battlefield graph, respect team and visibility rules, choose viable shots, use vehicle capabilities, and remain testable without a GPU.',
    hero: '/media/hero-rails-r2/01_desert-ground-rush.webm',
    icon: 'ai',
    sectionIcons: ['perception', 'navigation', 'aiming', 'teamwork', 'survival', 'verification'],
    sections: [
      ['Perception and target choice', 'Bots consume the same team, visibility, range, health, and vehicle-state contracts used by authority. They do not read rendered objects or hidden client-only coordinates. Candidate targets are scored from current tactical state rather than selected by scene proximity alone.', 'Difficulty changes reaction, aim quality, engagement distance, and decision pressure without granting information the bot should not have.'],
      ['Seeded route planning', 'One typed traversability grid is built per match from terrain mobility, world collision, openings, objectives, and vehicle capabilities. The planner supplies deterministic paths around blocked cells while local steering handles immediate alignment and avoidance.', 'Route decisions can be reproduced in Node across every map, including heavy vehicles, tracked damage, steep slopes, and objective modes.'],
      ['Gun handling and fire control', 'The controller respects turret traverse, elevation and depression, bore obstruction, reloads, magazines, dispersion, shell velocity, penetration, and target motion. It aims for hittable armor and internal weak areas when the current weapon and angle make that shot credible.', 'Autocannons, single-shot guns, autoloaders, and guided weapons share the same decision boundary but apply their own cadence and ammunition state.'],
      ['Team safety and pressure', 'Friendly vehicles are rejected from valid shot paths, and the controller avoids firing through allies. Bots spread their attention, move to useful lanes, support objectives, and keep enough separation to avoid turning one friendly cluster into an obstacle.', 'Enemy bots and allied bots use the same logic. Team assignment changes targets and objectives, not competence.'],
      ['Survival and recovery', 'Bots consider exposure, cover, damaged tracks, disabled modules, repair opportunities, ammo state, and nearby threats. They can disengage from a losing angle, recover movement, re-path after destruction, and continue contributing instead of waiting in open ground.', 'Mode objectives layer onto these survival decisions so capture, defense, escort, and horde pressure do not require separate fake movement systems.'],
      ['Verification', 'Focused AI tests cover aim, friendly-fire rejection, routes, difficulty, deterministic decisions, and authoritative bot integration. Map-wide server tests run the controller without rendering, while browser battles verify that visible movement, firing, and effects match those decisions.', 'Bot changes run `node src/game/ai.selftest.mjs`, `node src/sim/ai.aim.selftest.mjs`, `node src/sim/botRoutePlanner.selftest.mjs`, and `node server/authoritativeBots.selftest.mjs`.'],
    ],
    media: [
      ['/media/presentation-r1/04_desert_last_stand.webp', 'Mixed vehicles holding lanes and exchanging authoritative fire'],
      ['/media/presentation-r1/43_frontier_contact.webp', 'An IFV contact showing movement, target pressure, and team spacing'],
    ],
  },
  audio: {
    label: 'Audio and battlefield FX', title: 'Every sound begins with a game event',
    lede: 'Weapons, engines, impacts, tracks, ambience, crew radio, destruction, and replay audio are presentation responses to canonical events and listener state. The audio system never decides whether a shell was fired or a target was hit.',
    hero: '/media/hero-rails-r2/05_coastal-shell-skim.webm',
    icon: 'audio',
    sectionIcons: ['weapons', 'spatial', 'mix', 'radio', 'replay', 'verification'],
    sections: [
      ['Weapons, impacts, and movement', 'Canonical fire, projectile, penetration, damage, destruction, engine, and track events drive the corresponding sound layers. Nearby remote tanks remain audible from normal third-person play; scope mode changes perspective instead of acting as an accidental mute.', 'Weapon family, caliber, burst cadence, distance, and environment shape the presentation while the originating combat event remains the single source of truth.'],
      ['Spatial listener model', 'The listener combines camera orientation with the occupied vehicle position, then switches deliberately for player, scope, spectator, and killcam views. This hybrid model preserves directional reading without making an orbiting camera detach the player from the tank.', 'The occupied engine remains present regardless of distance. Remote engine loops are capped and ranked by proximity so the mix remains bounded in a full battle.'],
      ['Mix state and voice limits', 'Web Audio buses separate weapons, engines, impacts, ambience, music, radio, and interface feedback. Priority, cooldown, deduplication, distance, and phase state limit concurrent voices and keep repeated network events from doubling the same sound.', 'Audio initializes only after user gesture. Lazy transfer keeps boot light, and leaving battle stops world loops and stale entity sounds.'],
      ['Crew radio and feedback', 'Typed crew lines respond to useful events such as hits, penetrations, module damage, spotting, reload state, and destruction. Scheduling favors fresh high-priority information and rejects lines that arrive too late to describe the current battle.', 'Short feedback layers reinforce the HUD without narrating every action or masking nearby weapons.'],
      ['Killcam time and perspective', 'The killcam owns a distinct listener pose and time scale. Replay audio is stretched and filtered to follow the slowed visual event rather than replaying a normal-speed shot underneath slow motion.', 'Entering and leaving the replay tears down its temporary routing cleanly before spectator or garage audio resumes.'],
      ['Verification', 'Pure timing tests cover scheduling, staleness, priority, and phase teardown. Spatial probes render listener and distance cases to PCM, while the canonical audio probe verifies event coverage and bus routing.', 'Use `node src/audio/audioTiming.selftest.mjs`, `node src/audio/voices.selftest.mjs`, `node tools/audio-spatial-killcam-probe.mjs`, and `node tools/audio-probe.mjs` for audio changes.'],
    ],
    media: [
      ['/media/presentation-r1/04_desert_last_stand.webp', 'Overlapping weapon, impact, engine, and destruction events in battle'],
      ['/media/showcase-r2/25_live_killcam_xray.webp', 'The current slowed X-ray killcam with replay-specific listener and timing'],
    ],
  },
  performance: {
    label: 'Performance and loading', title: 'Measure the frame that the player actually feels',
    lede: 'Performance work covers cold boot, garage residency, battle acquisition, countdown warmup, the first ten seconds of combat, steady-state frame pacing, device adaptation, and recovery—not just an average frame-rate number.',
    hero: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
    icon: 'performance',
    sectionIcons: ['loading', 'profiling', 'optimization', 'device', 'budgets', 'verification'],
    sections: [
      ['Keep boot and routes isolated', 'The garage does not build a battlefield until concrete Battle intent. Public pages do not import the playable renderer, and garage boot does not eagerly import the complete simulation or fleet graph. Exact vehicle-family and world work is acquired only when the selected route needs it.', 'Cold-load probes disable caches and record network plus application work so a warm navigation cannot masquerade as first-visit performance.'],
      ['Stage battle loading behind cover', 'Battle entry acquires the exact world and roster, uploads required textures, prepares effects, submits vehicle materials, warms shaders and post-processing, and establishes the first valid camera before reveal. Required work finishes before the countdown instead of surfacing as a black or frozen opening frame.', 'Progress reflects owned stages. Stale work is cancelled when intent changes, and a retryable lifecycle owns recovery rather than scattering timers through the composition root.'],
      ['Record full frame evidence', 'The development flight recorder stores route transitions, long tasks, frame gaps, renderer counters, resolution, simulation debt, memory, and named spans. The performance HUD exposes live statistics for focused probes and saves event histories for later attribution.', 'Opening-battle probes focus on the first ten seconds after the countdown because shader births, roster commits, audio startup, and effect bursts often hide there.'],
      ['Reduce work at its owner', 'Static garage presentation sleeps between invalidations. Established frame loops reuse scratch objects, rank or stagger expensive updates, pool transient effects, cache stable worlds, demand-load vehicle families, and remove invisible render submissions rather than merely lowering visual quality.', 'Optimization is accepted only when the same scenario improves without shifting cost into loading, memory, correctness, or a later frame.'],
      ['Adapt to the real device', 'Capability probes and measured overload choose render scale, shadows, vegetation, effect budgets, and post-processing. Desktop, mobile, and constrained profiles start differently, then adjust with hysteresis to avoid visible oscillation.', 'GPU recovery validates framebuffers and can step down optional presentation layers. Simulation frequency, ballistics, armor, and network authority remain unchanged.'],
      ['Budgets and release evidence', 'Release probes cover cold load, transitions, battle opening, sustained play, map and tank switching, returned garage state, mobile layouts, and constrained CPU/network profiles. Reports include p95 frame gaps, long tasks, program births, draw work, memory, and readiness time.', 'Use `npm run perf:cold`, `npm run perf:dev`, `npm run perf:resources:gate`, `npm run qa:device`, and `npm run build` for the corresponding performance claims.'],
    ],
    media: [
      ['/media/showcase-r2/17_live_player_hud.webp', 'The current K2 live frame whose pacing, scale, draw work, and simulation debt are measured'],
      ['/media/showcase-r2/16_mobile_garage.webp', 'The current Garage adapted to a compact device and touch-safe presentation'],
    ],
  },
  simulation: {
    label: 'Simulation and combat', title: 'Every hit has a path',
    lede: 'The battle simulation advances at 60 Hz. Movement, aim, ballistics, armor, damage, reloads, spotting, and match results are resolved from authoritative state—not from the rendered frame.',
    hero: '/media/hero-rails-r2/01_desert-ground-rush.webm',
    icon: 'combat',
    sectionIcons: ['simulation', 'aiming', 'armor', 'weapons', 'modes', 'verification'],
    sections: [
      ['Fixed-step battle loop', 'The authoritative step uses metres, seconds, radians, and a fixed 1/60-second interval. Input is sampled into explicit vehicle controls before movement, combat, spotting, and result evaluation run in a stable order. Render rate can change without changing the number or order of simulation steps.', 'Frame-time spikes accumulate into bounded fixed steps. Authoritative randomness is seeded or injected. Wall-clock time and Math.random() are excluded from rules that affect a shot, reload, module state, or match result.'],
      ['Aim and shot creation', 'Camera aim and gun aim are separate. The camera chooses the requested point; traverse, elevation, suspension attitude, and bore obstruction determine where the barrel can actually point. A shot starts at the resolved muzzle transform with the current shell, velocity, dispersion, and owner identity.', 'The HUD draws both states. The camera marker communicates the request. The gun marker communicates the ballistic line. “Path blocked” and gun-limit feedback therefore describe physical constraints instead of repainting the request as truth.'],
      ['Armor trace and penetration', 'The shell segment is tested against world collision before vehicle armor. Vehicle queries transform the ray into the target pose, order plate crossings, calculate distance and angle, apply normalization or ricochet rules, and consume the shell’s remaining penetration. Spaced layers and internal volumes stay in traversal order.', 'A penetration continues through internal module and crew volumes. A non-penetration still produces an authoritative impact event. Presentation receives the resolved path and result; it does not rerun the decision.'],
      ['Damage, reloads, and special weapons', 'Damage updates hit points, tracks, engine, fuel, ammunition, gun, turret drive, optics, and crew state. Autoloaders distinguish intra-clip delay from magazine reload. Guided missiles retain a live projectile and steering state until impact or expiry. Fires, ammunition-rack events, ramming, and repairs use the same event boundary.', 'The X-ray replay, hit card, damage log, reload rack, impact effects, and sound all consume those events. This keeps visible feedback aligned with the result used by solo and multiplayer authority.'],
      ['Battle rules', 'Standard Battle, Capture the Flag, Zone Control, Turbo Ball, and Endless Horde compose over the same complete tank simulation. Flag and zone modes add six-second respawns. Turbo Ball keeps weapons active while tanks drive at 1.85× mobility and shells can strike the ball. Horde escalates deterministic bot waves and places increasingly scarce repair or ammunition caches.', 'The renderer-free mode controller owns scores, objectives, respawn timers, wave state, caches, and bot objective points. Solo, private rooms, and LAN rooms use the same rules; the host choice travels in canonical lobby state and survives rematches.'],
      ['Verification', 'Node-runnable self-tests cover movement, combat, spotting, missile guidance, special actions, AI aim, and the complete authoritative match. Browser probes add bore parity, projectile travel, live impact effects, and HUD alignment.', 'Run `node src/sim/combat.selftest.mjs`, `node src/sim/authoritativeMatch.selftest.mjs`, and `npm test` after changing shared combat rules.'],
    ],
    media: [
      ['/media/showcase-r2/25_live_killcam_xray.webp', 'Current resolved X-ray path through armor, modules, and crew'],
      ['/media/presentation-r1/04_desert_last_stand.webp', 'Muzzle flashes, tracers, impacts, and destruction from one staged battle state'],
    ],
  },
  vehicles: {
    label: 'Vehicles and running gear', title: 'The model moves as one machine',
    lede: 'Every selectable tank is a first-party procedural runtime rig. The same vehicle record drives its geometry, dimensions, armor, internal anatomy, mobility, gun, ammunition, icon set, garage dossier, and battle behavior.',
    hero: '/media/hero-rails-r2/03_steppe-charge-thread.webm',
    icon: 'vehicles',
    sectionIcons: ['specification', 'rig', 'vehicles', 'anatomy', 'release'],
    sections: [
      ['Vehicle contract', 'A vehicle spec defines identity, class, nation, tier, dimensions, mass, engine output, speed, traverse, gun limits, shells, armor, modules, crew, equipment policy, and builder. Consumers read the registry instead of carrying parallel facts.', 'Entity IDs are not vehicle spec IDs. Multiplayer permits duplicate tank selections, so identity, ownership, and specification remain separate throughout state and presentation.'],
      ['Procedural rig', 'Builders create hull, turret, gun mount, gun, running gear, tracks, optics, fittings, markings, and damage hooks with stable ownership. Tank forward is local +Z. Articulation occurs at explicit pivots, and the muzzle is resolved from the actual barrel hierarchy.', 'Roof equipment can move with the turret without becoming armor. Cupolas participate in hit geometry; machine guns, antennas, baskets, loose stowage, and presentation-only fittings do not.'],
      ['Suspension and tracks', 'Each supported wheel samples terrain beneath its own station. The visual suspension settles to those contacts, the hull derives pitch and roll from support, and the track path is rebuilt around the moved wheels. Swedish siege suspension adds commanded hull attitude without breaking gun tracking.', 'Track animation follows traveled distance and side speed. Damage can detach a side, remove its running band, throw a persistent ribbon, and leave loose running-gear pieces.'],
      ['Combat anatomy', 'Armor plates, modules, and crew stations are authored in the vehicle frame and transformed with the live pose. Generated side diagrams are receipts for that same data. They are not separately drawn approximations.', 'Any playable geometry or profile change runs `tank:anatomy:update`, `tank:anatomy:check`, then the targeted gated release check. This refreshes armor, module, crew, icon, and technical-diagram evidence together.'],
      ['Fleet release gate', 'Appearance, bore, material, wheel, recoil, combat anatomy, provenance, and profile-specific checks run before a vehicle is considered current. Playable loading never falls back to a comparison GLB.', 'The Tank Gallery constructs the live builder and overlays the canonical diagnostic volumes, which makes it the fastest manual review surface for a vehicle change.'],
    ],
    media: [
      ['/media/showcase-r2/11_gallery_hero.webp', 'Current T-90M Proryv rig with articulation and diagnostic layers'],
      ['/media/presentation-r1/ui_tank_closeup_modern.webp', 'Current battle-detail vehicle geometry and running gear'],
    ],
  },
  rendering: {
    label: 'Renderer and graphics', title: 'Rendering can adapt without changing the rules',
    lede: 'Three.js owns presentation only. Adaptive resolution, shadows, vegetation, post-processing, particles, and warmup can change with the device; the 60 Hz battle model remains unchanged.',
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    icon: 'rendering',
    sectionIcons: ['rendering', 'measured', 'device', 'loading', 'performance'],
    sections: [
      ['Frame composition', 'The render path updates camera, visible vehicle rigs, world detail, presentation effects, lighting, shadows, and post-processing from the latest interpolated state. Established hot loops reuse scratch objects and pools rather than allocating each frame.', 'Late transparent effects share depth information with the main scene. Muzzle light, tracer, sparks, smoke, dust, fire, and debris are admitted by distance and quality policy.'],
      ['Lighting and post-processing', 'Biome lighting supplies sun direction, sky, fog, exposure, and shadow policy. Stable cascaded shadows follow the relevant camera region. The post chain combines ambient occlusion, anti-aliasing, bloom where useful, output grading, and the final dynamic render scale.', 'Capture views pin quality and render scale so comparison images do not drift. Gameplay can reduce expensive layers under sustained load.'],
      ['Adaptive quality', 'Desktop and mobile resolve separate starting profiles. Internal resolution, shadow work, vegetation density, effect budgets, and post features can step down independently. Hysteresis prevents rapid oscillation.', 'Device diagnostics and measured overload—not user-agent labels alone—select the safe path. A quality change never alters shell travel, spotting, damage, or authoritative timing.'],
      ['Loading and recovery', 'Boot-critical modules avoid importing the complete fleet builder graph. Deferred vehicle construction, shader warmup, offscreen preparation, and cached garage residents flatten transition spikes. Context-loss handling restores presentation state without inventing battle state.', 'Screenshot and loading probes treat black frames, stale swaps, console errors, and incomplete garage models as failures.'],
      ['Performance evidence', 'Performance traces record frame categories, renderer counters, dynamic scale, and transition budgets. Browser probes cover cold load, battle entry, map switching, the garage, and multiplayer rendering.', 'Use `npm run perf:dev`, `npm run perf:cold`, `npm run perf:transitions`, and a production build for renderer work.'],
    ],
    media: [
      ['/media/showcase-r2/19_live_sniper.webp', 'Current Leclerc XLR precision sight after lighting, depth, anti-aliasing, and output grading'],
      ['/media/showcase-r1/105_foreground_urban_hero_abramsx.webp', 'Close vehicle material response under the current world lighting'],
    ],
  },
  worlds: {
    label: 'Battlefields and destruction', title: 'Battlefields are built for armored movement',
    lede: 'Twenty battlefields share world contracts but keep authored routes, landmarks, cover, atmosphere, and sightlines. Terrain and collision are available to the simulation without importing the renderer.',
    hero: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
    icon: 'worlds',
    sectionIcons: ['battlefields', 'navigation', 'construction', 'damage', 'quality'],
    sections: [
      ['Map contract', 'Each map provides terrain height, ground materials, obstacles, collision, concealment, spawn groups, capture areas, lighting, weather, sound context, and a deterministic establishing camera. Simulation consumers use these interfaces rather than scene traversal.', 'The registry is the source for selection, loading, Studio, screenshots, and documentation counts.'],
      ['Terrain and movement', 'Height fields answer vehicle support, projectile collision, camera clearance, and prop placement. Surface class affects grip and presentation. Roads, slopes, ridges, water edges, and hull-down positions are composed around the intended armored routes.', 'Vehicle suspension samples the same ground surface used by movement and ballistic terrain queries.'],
      ['Structures and utilities', 'Structure families expose readable openings, material sets, damage states, and collision. Utility networks connect poles and lines across valid spans. Large cover blocks sightlines; small visual fittings do not become invisible walls.', 'Detached doors, barriers, street pieces, and other loose props enter bounded physics with stable sleep and cleanup rules.'],
      ['Destruction and wrecks', 'Destroyed vehicles retain wreck geometry, detached tracks, fire, smoke, and debris. Map wrecks and disassembled garage pieces use modern first-party vehicle families. Turrets, hulls, wheels, ERA, and weapons remain decoration unless explicitly registered for collision.', 'Persistent aftermath is presentation state derived from authoritative destruction events.'],
      ['Map quality gates', 'Automated checks audit spawns, bounds, material coverage, structures, utilities, collision, wrecks, loose props, and placement. Deterministic battle captures expose bad silhouettes and obstructed routes that numeric gates cannot.', 'Run `node src/world/mapQuality.selftest.mjs`, the nearby world self-tests, and targeted screenshot views after map changes.'],
    ],
    media: [
      ['/media/presentation-r1/24_autumn_orchard_stand.webp', 'Authored orchard route with structures, vegetation, terrain, and effects'],
      ['/media/showcase-r1/116_foreground_coastal_harbor_kill.webp', 'Coastal route, persistent wreck fire, and foreground vehicle'],
    ],
  },
  multiplayer: {
    label: 'Multiplayer authority', title: 'Clients request and the server decides',
    lede: 'The multiplayer path keeps hits, damage, reloads, spotting, bots, and match results on the authoritative side. Clients predict local movement and present filtered snapshots.',
    hero: '/media/hero-rails-r2/05_coastal-shell-skim.webm',
    icon: 'multiplayer',
    sectionIcons: ['multiplayer', 'interface', 'perception', 'combat', 'verification'],
    sections: [
      ['Room and match lifecycle', 'A room owns members, teams, selected vehicles, camouflage, map choice, readiness, chat, invites, and reconnect state. Match handoff creates an authoritative world with stable player and entity identities.', 'Spectators have an explicit team and perspective. They do not borrow a vehicle ID as their player identity.'],
      ['Inputs and snapshots', 'Clients send normalized control input and an ordered input sequence. Authority advances the same fixed-step movement and combat modules used by solo. Snapshots carry acknowledged input, visible entities, combat state, and presentation events.', 'The local tank predicts and reconciles. Remote tanks interpolate. Neither path changes the authoritative shot result.'],
      ['Spotting boundary', 'Enemy coordinates are filtered before serialization. A client never receives hidden positions and relies on rendering to conceal them. Spot persistence, observer rules, and team visibility are applied at the snapshot boundary.', 'This boundary also governs minimap, nameplates, effects, and audio presentation.'],
      ['Combat events', 'The server creates shells, validates reload and magazine state, resolves world and armor hits, updates modules and crew, and emits ordered presentation events. Clients use those events for tracers, impacts, shot cards, killcams, and sound.', 'Duplicate vehicle selections remain safe because events use entity and owner identities separately from vehicle specs.'],
      ['Live verification', 'Browser soaks cover guest entry, four-player rooms, 7v7 rosters, adverse transport, reconnect handoff, rendering, and both teams dealing live damage. Headless authority tests cover bots, pacing, results, rankings, and persistence.', 'Run `npm run test:net:seven:live` for the complete moving-and-firing gate.'],
    ],
    media: [
      ['/media/showcase-r2/18_live_spectator.webp', 'Current allied chase camera with the compact target switcher'],
      ['/media/showcase-r2/17_live_player_hud.webp', 'Current team state and battle HUD after authoritative handoff'],
    ],
  },
  interface: {
    label: 'Interface and controls', title: 'Read the tank without losing the view',
    lede: 'The garage, HUD, sight, killcam, spectator mode, after-action report, settings, keyboard, pointer, controller, and touch input share one control and typography system.',
    hero: '/media/showcase-r2/18_live_spectator.webp',
    icon: 'interface',
    sectionIcons: ['garage', 'interface', 'replay', 'mobile', 'accessibility'],
    sections: [
      ['Garage and deployment', 'The garage combines vehicle selection, dossier, ammunition, equipment, camouflage, map choice, match mode, room state, and launch. Selection and displayed pedestal identity remain synchronized through explicit state.', 'The interface links directly to Tank Gallery for deeper geometry inspection and to Scene Studio for composition work.'],
      ['Battle HUD', 'The HUD prioritizes score, time, teams, reticle state, ammunition, consumables, minimap, damage, spotting, and short event feedback. It does not restate every system continuously.', 'Reload racks use the authoritative magazine state. Damage panels use current modules. Team and minimap information obey the spotting boundary.'],
      ['Death, killcam, and spectating', 'A death beat shows the player’s destruction before the X-ray replay. If the battle continues, the camera moves to a living ally. The compact switcher identifies the vehicle, its position in the living roster, equal previous and next controls, and a quiet garage exit.', 'Mouse movement orbits the ally without turning a turret. Keyboard and touch targets retain a minimum 44-pixel interaction size.'],
      ['Input and mobile', 'Keyboard, mouse, pointer-lock fallback, free look, zoom, touch joysticks, swipe aim, pinch scope, shell selection, special actions, and consumables normalize into game input. UI ownership prevents a text field or dialog from leaking keys into battle.', 'Safe-area layout, compact labels, and device-specific quality preserve the same battle rules on phones.'],
      ['Accessibility and regression checks', 'Semantic buttons, visible focus, reduced-motion handling, descriptive media alternatives, contrast, and touch sizing are part of the public and in-game surfaces. Responsive QA covers desktop and 390-pixel layouts.', 'Focused self-tests cover keyboard ownership, settings, icons, flags, loading screens, end screens, the spectator switcher, and touch controls.'],
    ],
    media: [
      ['/media/showcase-r2/18_live_spectator.webp', 'Current spectator layout above the minimap'],
      ['/media/showcase-r2/16_mobile_garage.webp', 'Current touch-safe Garage and mobile presentation'],
    ],
  },
  studio: {
    label: 'Scene Studio and capture', title: 'Every public frame can be reproduced',
    lede: 'Scene Studio uses current maps, vehicle builders, articulation, effects, and camera systems to create deterministic stills and video inside the browser.',
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    icon: 'studio',
    sectionIcons: ['specification', 'workflow', 'weapons', 'studio', 'critique'],
    sections: [
      ['Scene document', 'A scene stores map, seed, actor spec IDs, names, positions, headings, turret and gun pose, camouflage, effects, camera, time, and optional storyboard. Loading rebuilds from current first-party assets.', 'The JSON is a reproducibility record, not a baked screenshot description.'],
      ['Timeline and actors', 'Actor tracks interpolate position and articulation over deterministic time. Storyboard shots animate camera position, target, field of view, roll, and transition. Scrubbing evaluates both without depending on wall-clock time.', 'The five current hero films use four-key rails across five battlefields. Each rail keeps multiple vehicles readable while moving from contact to impact.'],
      ['Effects', 'Fire, tracer, impact, sparks, dust, machine-gun bursts, track damage, fuel kills, and ammunition-rack kills are placed on the same timeline. Effects resolve from actor anchors or explicit world points.', 'Capture masters preserve motion and effects at 30 frames per second before public encodes are made.'],
      ['Capture pipeline', 'Studio records VP9 through the production renderer. The current publisher preserves the 1920 × 1080 hero masters without another lossy video encode, publishes a native 3840 × 2160 gameplay film, and generates still posters and byte receipts. Public playback uses looping video rather than GIF.', 'A rail fails if vehicles disappear behind scenery, effects erase the silhouette, the camera crosses geometry, or the source resolution falls below its delivery contract.'],
      ['Still-image campaigns', 'Battle campaigns start from scene JSON, render review captures, tile contact sheets, export 4K frames, run image statistics, and require owner approval. The public archive retains its scene identifiers and review sheets.', 'Run `npm run studio:hero:render`, `npm run studio:hero:publish`, `npm run studio:evidence:capture`, and `npm run showcase:check` to reproduce the current public media.'],
    ],
    media: [
      ['/media/showcase-r2/15_studio_workspace.webp', 'Current Scene Studio workspace with actors, effects, storyboard, and camera'],
      ['/media/showcase-r1/process/action-review-02.webp', 'Ten-frame action-campaign contact sheet used for visual review'],
    ],
  },
};

function mediaFigure([src, caption]: TopicMedia): string {
  return `<figure class="topic-figure"><img src="${src}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
}

function formatText(text: string): string {
  return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

function sectionId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function sectionMarkup(section: TopicSection, index: number, icon: DocsIconKey, media?: TopicMedia): string {
  const [title, ...paragraphs] = section;
  return `<section class="topic-section" id="${sectionId(title)}"><p class="section-index">${String(index + 1).padStart(2, '0')} // ${title}</p><h2><span class="topic-section-icon" data-doc-icon="${icon}"></span><span>${title}</span></h2>${paragraphs.map((text) => `<p>${formatText(text)}</p>`).join('')}${media ? mediaFigure(media) : ''}</section>`;
}

function renderTopicPage(): void {
  const slug = location.pathname.split('/').filter(Boolean).at(-1) || 'simulation';
  const topic = topics[slug] || topics.simulation;
  document.title = `${topic.label} — Claude of Tanks Technical Manual`;

  const topicNav = TOPIC_ORDER.map((id) => `<a href="/docs/${id}"${id === slug ? ' aria-current="page"' : ''}><span class="topic-nav-icon" data-doc-icon="${topics[id].icon}"></span><span>${topics[id].label}</span></a>`).join('');
  const root = document.querySelector<HTMLElement>('#topicRoot');
  if (!root) throw new Error('technical manual topic root is unavailable');
  const heroMarkup = topic.hero.endsWith('.webm')
    ? `<video autoplay muted loop playsinline preload="metadata" poster="${topic.hero.replace(/\.webm$/, '.jpg')}" aria-label="${topic.label} shown in the current game renderer"><source src="${topic.hero}" type="video/webm"></video>`
    : `<img src="${topic.hero}" alt="${topic.label} shown in the current game renderer">`;
  const sectionMap = topic.sections.map(([title], index) => `<a href="#${sectionId(title)}"><span data-doc-icon="${topic.sectionIcons[index] || topic.icon}"></span><b>${String(index + 1).padStart(2, '0')}</b><strong>${title}</strong></a>`).join('');
  root.innerHTML = `
    <header class="topic-hero">${heroMarkup}<div class="topic-hero-shade"></div><div class="shell"><p class="topic-kicker"><span data-doc-icon="${topic.icon}"></span><span>Technical manual // ${topic.label}</span></p><h1>${topic.title}</h1><p>${topic.lede}</p></div></header>
    <nav class="topic-nav" aria-label="Technical manual sections"><div class="shell"><a href="/docs"><span class="topic-nav-icon" data-doc-icon="manual"></span><span>Manual index</span></a>${topicNav}</div></nav>
    <div class="shell topic-layout"><article><nav class="topic-section-map" aria-label="On this page">${sectionMap}</nav>${topic.sections.map((section, index) => sectionMarkup(section, index, topic.sectionIcons[index] || topic.icon, topic.media[index === 1 ? 0 : index === 3 ? 1 : -1])).join('')}</article><aside><span class="topic-aside-icon" data-doc-icon="${topic.icon}"></span><p>Manual section</p><strong>${topic.label}</strong><span>Current runtime contracts, implementation choices, and verification paths.</span><a href="/docs">All documentation →</a></aside></div>`;
  mountDocsIcons(root);

  const navStrip = root.querySelector<HTMLElement>('.topic-nav .shell');
  const activeTopic = navStrip?.querySelector<HTMLElement>('[aria-current="page"]');
  if (navStrip && activeTopic && navStrip.scrollWidth > navStrip.clientWidth) {
    navStrip.scrollLeft = Math.max(0, activeTopic.offsetLeft - (navStrip.clientWidth - activeTopic.offsetWidth) / 2);
  }
}

if (typeof document !== 'undefined') renderTopicPage();
