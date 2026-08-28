const TOPIC_ORDER = ['simulation', 'vehicles', 'rendering', 'worlds', 'multiplayer', 'interface', 'studio'];

const topics = {
  simulation: {
    label: 'Simulation and combat', title: 'Every hit has a path',
    lede: 'The battle simulation advances at 60 Hz. Movement, aim, ballistics, armor, damage, reloads, spotting, and match results are resolved from authoritative state—not from the rendered frame.',
    hero: '/media/hero-rails-r2/01_desert-ground-rush.webm',
    sections: [
      ['Fixed-step battle loop', 'The authoritative step uses metres, seconds, radians, and a fixed 1/60-second interval. Input is sampled into explicit vehicle controls before movement, combat, spotting, and result evaluation run in a stable order. Render rate can change without changing the number or order of simulation steps.', 'Frame-time spikes accumulate into bounded fixed steps. Authoritative randomness is seeded or injected. Wall-clock time and Math.random() are excluded from rules that affect a shot, reload, module state, or match result.'],
      ['Aim and shot creation', 'Camera aim and gun aim are separate. The camera chooses the requested point; traverse, elevation, suspension attitude, and bore obstruction determine where the barrel can actually point. A shot starts at the resolved muzzle transform with the current shell, velocity, dispersion, and owner identity.', 'The HUD draws both states. The camera marker communicates the request. The gun marker communicates the ballistic line. “Path blocked” and gun-limit feedback therefore describe physical constraints instead of repainting the request as truth.'],
      ['Armor trace and penetration', 'The shell segment is tested against world collision before vehicle armor. Vehicle queries transform the ray into the target pose, order plate crossings, calculate distance and angle, apply normalization or ricochet rules, and consume the shell’s remaining penetration. Spaced layers and internal volumes stay in traversal order.', 'A penetration continues through internal module and crew volumes. A non-penetration still produces an authoritative impact event. Presentation receives the resolved path and result; it does not rerun the decision.'],
      ['Damage, reloads, and special weapons', 'Damage updates hit points, tracks, engine, fuel, ammunition, gun, turret drive, optics, and crew state. Autoloaders distinguish intra-clip delay from magazine reload. Guided missiles retain a live projectile and steering state until impact or expiry. Fires, ammunition-rack events, ramming, and repairs use the same event boundary.', 'The X-ray replay, hit card, damage log, reload rack, impact effects, and sound all consume those events. This keeps visible feedback aligned with the result used by solo and multiplayer authority.'],
      ['Battle rules', 'Standard Battle, Capture the Flag, Zone Control, Turbo Ball, and Endless Horde compose over the same complete tank simulation. Flag and zone modes add six-second respawns. Turbo Ball keeps weapons active while tanks drive at 1.85× mobility and shells can strike the ball. Horde escalates deterministic bot waves and places increasingly scarce repair or ammunition caches.', 'The renderer-free mode controller owns scores, objectives, respawn timers, wave state, caches, and bot objective points. Solo, private rooms, and LAN rooms use the same rules; the host choice travels in canonical lobby state and survives rematches.'],
      ['Verification', 'Node-runnable self-tests cover movement, combat, spotting, missile guidance, special actions, AI aim, and the complete authoritative match. Browser probes add bore parity, projectile travel, live impact effects, and HUD alignment.', 'Run `node src/sim/combat.selftest.mjs`, `node src/sim/authoritativeMatch.selftest.mjs`, and `npm test` after changing shared combat rules.'],
    ],
    media: [
      ['/media/presentation-r1/ui_killcam_xray.webp', 'Resolved X-ray path through armor, modules, and crew'],
      ['/media/presentation-r1/04_desert_last_stand.webp', 'Muzzle flashes, tracers, impacts, and destruction from one staged battle state'],
    ],
  },
  vehicles: {
    label: 'Vehicles and running gear', title: 'The model moves as one machine',
    lede: 'Every selectable tank is a first-party procedural runtime rig. The same vehicle record drives its geometry, dimensions, armor, internal anatomy, mobility, gun, ammunition, icon set, garage dossier, and battle behavior.',
    hero: '/media/hero-rails-r2/03_steppe-charge-thread.webm',
    sections: [
      ['Vehicle contract', 'A vehicle spec defines identity, class, nation, tier, dimensions, mass, engine output, speed, traverse, gun limits, shells, armor, modules, crew, equipment policy, and builder. Consumers read the registry instead of carrying parallel facts.', 'Entity IDs are not vehicle spec IDs. Multiplayer permits duplicate tank selections, so identity, ownership, and specification remain separate throughout state and presentation.'],
      ['Procedural rig', 'Builders create hull, turret, gun mount, gun, running gear, tracks, optics, fittings, markings, and damage hooks with stable ownership. Tank forward is local +Z. Articulation occurs at explicit pivots, and the muzzle is resolved from the actual barrel hierarchy.', 'Roof equipment can move with the turret without becoming armor. Cupolas participate in hit geometry; machine guns, antennas, baskets, loose stowage, and presentation-only fittings do not.'],
      ['Suspension and tracks', 'Each supported wheel samples terrain beneath its own station. The visual suspension settles to those contacts, the hull derives pitch and roll from support, and the track path is rebuilt around the moved wheels. Swedish siege suspension adds commanded hull attitude without breaking gun tracking.', 'Track animation follows traveled distance and side speed. Damage can detach a side, remove its running band, throw a persistent ribbon, and leave loose running-gear pieces.'],
      ['Combat anatomy', 'Armor plates, modules, and crew stations are authored in the vehicle frame and transformed with the live pose. Generated side diagrams are receipts for that same data. They are not separately drawn approximations.', 'Any playable geometry or profile change runs `tank:anatomy:update`, `tank:anatomy:check`, then the targeted gated release check. This refreshes armor, module, crew, icon, and technical-diagram evidence together.'],
      ['Fleet release gate', 'Appearance, bore, material, wheel, recoil, combat anatomy, provenance, and profile-specific checks run before a vehicle is considered current. Playable loading never falls back to a comparison GLB.', 'The Tank Gallery constructs the live builder and overlays the canonical diagnostic volumes, which makes it the fastest manual review surface for a vehicle change.'],
    ],
    media: [
      ['/media/presentation-r1/ui_gallery.webp', 'Current procedural rig with articulation and diagnostic layers'],
      ['/media/presentation-r1/ui_tank_closeup_modern.webp', 'Current battle-detail vehicle geometry and running gear'],
    ],
  },
  rendering: {
    label: 'Renderer and performance', title: 'Rendering can adapt without changing the rules',
    lede: 'Three.js owns presentation only. Adaptive resolution, shadows, vegetation, post-processing, particles, and warmup can change with the device; the 60 Hz battle model remains unchanged.',
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    sections: [
      ['Frame composition', 'The render path updates camera, visible vehicle rigs, world detail, presentation effects, lighting, shadows, and post-processing from the latest interpolated state. Established hot loops reuse scratch objects and pools rather than allocating each frame.', 'Late transparent effects share depth information with the main scene. Muzzle light, tracer, sparks, smoke, dust, fire, and debris are admitted by distance and quality policy.'],
      ['Lighting and post-processing', 'Biome lighting supplies sun direction, sky, fog, exposure, and shadow policy. Stable cascaded shadows follow the relevant camera region. The post chain combines ambient occlusion, anti-aliasing, bloom where useful, output grading, and the final dynamic render scale.', 'Capture views pin quality and render scale so comparison images do not drift. Gameplay can reduce expensive layers under sustained load.'],
      ['Adaptive quality', 'Desktop and mobile resolve separate starting profiles. Internal resolution, shadow work, vegetation density, effect budgets, and post features can step down independently. Hysteresis prevents rapid oscillation.', 'Device diagnostics and measured overload—not user-agent labels alone—select the safe path. A quality change never alters shell travel, spotting, damage, or authoritative timing.'],
      ['Loading and recovery', 'Boot-critical modules avoid importing the complete fleet builder graph. Deferred vehicle construction, shader warmup, offscreen preparation, and cached garage residents flatten transition spikes. Context-loss handling restores presentation state without inventing battle state.', 'Screenshot and loading probes treat black frames, stale swaps, console errors, and incomplete garage models as failures.'],
      ['Performance evidence', 'Performance traces record frame categories, renderer counters, dynamic scale, and transition budgets. Browser probes cover cold load, battle entry, map switching, the garage, and multiplayer rendering.', 'Use `npm run perf:dev`, `npm run perf:cold`, `npm run perf:transitions`, and a production build for renderer work.'],
    ],
    media: [
      ['/media/presentation-r1/ui_sniper_view.webp', 'Precision sight after lighting, depth, anti-aliasing, and output grading'],
      ['/media/showcase-r1/105_foreground_urban_hero_abramsx.webp', 'Close vehicle material response under the current world lighting'],
    ],
  },
  worlds: {
    label: 'Battlefields and destruction', title: 'Battlefields are built for armored movement',
    lede: 'Twenty battlefields share world contracts but keep authored routes, landmarks, cover, atmosphere, and sightlines. Terrain and collision are available to the simulation without importing the renderer.',
    hero: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
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
    sections: [
      ['Room and match lifecycle', 'A room owns members, teams, selected vehicles, camouflage, map choice, readiness, chat, invites, and reconnect state. Match handoff creates an authoritative world with stable player and entity identities.', 'Spectators have an explicit team and perspective. They do not borrow a vehicle ID as their player identity.'],
      ['Inputs and snapshots', 'Clients send normalized control input and an ordered input sequence. Authority advances the same fixed-step movement and combat modules used by solo. Snapshots carry acknowledged input, visible entities, combat state, and presentation events.', 'The local tank predicts and reconciles. Remote tanks interpolate. Neither path changes the authoritative shot result.'],
      ['Spotting boundary', 'Enemy coordinates are filtered before serialization. A client never receives hidden positions and relies on rendering to conceal them. Spot persistence, observer rules, and team visibility are applied at the snapshot boundary.', 'This boundary also governs minimap, nameplates, effects, and audio presentation.'],
      ['Combat events', 'The server creates shells, validates reload and magazine state, resolves world and armor hits, updates modules and crew, and emits ordered presentation events. Clients use those events for tracers, impacts, shot cards, killcams, and sound.', 'Duplicate vehicle selections remain safe because events use entity and owner identities separately from vehicle specs.'],
      ['Live verification', 'Browser soaks cover guest entry, four-player rooms, 7v7 rosters, adverse transport, reconnect handoff, rendering, and both teams dealing live damage. Headless authority tests cover bots, pacing, results, rankings, and persistence.', 'Run `npm run test:net:seven:live` for the complete moving-and-firing gate.'],
    ],
    media: [
      ['/media/presentation-r1/ui_spectator_switcher.webp', 'Allied chase camera with the compact target switcher'],
      ['/media/presentation-r1/ui_roster.webp', 'Team roster and room state before authoritative handoff'],
    ],
  },
  interface: {
    label: 'Interface and controls', title: 'Read the tank without losing the view',
    lede: 'The garage, HUD, sight, killcam, spectator mode, after-action report, settings, keyboard, pointer, controller, and touch input share one control and typography system.',
    hero: '/media/presentation-r1/ui_spectator_switcher.webp',
    sections: [
      ['Garage and deployment', 'The garage combines vehicle selection, dossier, ammunition, equipment, camouflage, map choice, match mode, room state, and launch. Selection and displayed pedestal identity remain synchronized through explicit state.', 'The interface links directly to Tank Gallery for deeper geometry inspection and to Scene Studio for composition work.'],
      ['Battle HUD', 'The HUD prioritizes score, time, teams, reticle state, ammunition, consumables, minimap, damage, spotting, and short event feedback. It does not restate every system continuously.', 'Reload racks use the authoritative magazine state. Damage panels use current modules. Team and minimap information obey the spotting boundary.'],
      ['Death, killcam, and spectating', 'A death beat shows the player’s destruction before the X-ray replay. If the battle continues, the camera moves to a living ally. The compact switcher identifies the vehicle, its position in the living roster, equal previous and next controls, and a quiet garage exit.', 'Mouse movement orbits the ally without turning a turret. Keyboard and touch targets retain a minimum 44-pixel interaction size.'],
      ['Input and mobile', 'Keyboard, mouse, pointer-lock fallback, free look, zoom, touch joysticks, swipe aim, pinch scope, shell selection, special actions, and consumables normalize into game input. UI ownership prevents a text field or dialog from leaking keys into battle.', 'Safe-area layout, compact labels, and device-specific quality preserve the same battle rules on phones.'],
      ['Accessibility and regression checks', 'Semantic buttons, visible focus, reduced-motion handling, descriptive media alternatives, contrast, and touch sizing are part of the public and in-game surfaces. Responsive QA covers desktop and 390-pixel layouts.', 'Focused self-tests cover keyboard ownership, settings, icons, flags, loading screens, end screens, the spectator switcher, and touch controls.'],
    ],
    media: [
      ['/media/presentation-r1/ui_spectator_switcher_mobile.webp', '390-pixel spectator layout above the minimap'],
      ['/media/presentation-r1/ui_mobile.webp', 'Touch-safe garage and mobile control presentation'],
    ],
  },
  studio: {
    label: 'Scene Studio and capture', title: 'Every public frame can be reproduced',
    lede: 'Scene Studio uses current maps, vehicle builders, articulation, effects, and camera systems to create deterministic stills and video inside the browser.',
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    sections: [
      ['Scene document', 'A scene stores map, seed, actor spec IDs, names, positions, headings, turret and gun pose, camouflage, effects, camera, time, and optional storyboard. Loading rebuilds from current first-party assets.', 'The JSON is a reproducibility record, not a baked screenshot description.'],
      ['Timeline and actors', 'Actor tracks interpolate position and articulation over deterministic time. Storyboard shots animate camera position, target, field of view, roll, and transition. Scrubbing evaluates both without depending on wall-clock time.', 'The five current hero films use four-key rails across five battlefields. Each rail keeps multiple vehicles readable while moving from contact to impact.'],
      ['Effects', 'Fire, tracer, impact, sparks, dust, machine-gun bursts, track damage, fuel kills, and ammunition-rack kills are placed on the same timeline. Effects resolve from actor anchors or explicit world points.', 'Capture masters preserve motion and effects at 30 frames per second before public encodes are made.'],
      ['Capture pipeline', 'Studio records VP9 through the production renderer. The current publisher preserves the 1920 × 1080 hero masters without another lossy video encode, publishes a native 3840 × 2160 gameplay film, and generates still posters and byte receipts. Public playback uses looping video rather than GIF.', 'A rail fails if vehicles disappear behind scenery, effects erase the silhouette, the camera crosses geometry, or the source resolution falls below its delivery contract.'],
      ['Still-image campaigns', 'Battle campaigns start from scene JSON, render review captures, tile contact sheets, export 4K frames, run image statistics, and require owner approval. The public archive retains its scene identifiers and review sheets.', 'Run `npm run studio:hero:render`, `npm run studio:hero:publish`, `npm run studio:evidence:capture`, and `npm run showcase:check` to reproduce the current public media.'],
    ],
    media: [
      ['/media/presentation-r1/ui_studio.webp', 'Scene Studio workspace with actors, effects, storyboard, and camera'],
      ['/media/showcase-r1/process/action-review-02.webp', 'Ten-frame action-campaign contact sheet used for visual review'],
    ],
  },
};

function mediaFigure([src, caption]) {
  return `<figure class="topic-figure"><img src="${src}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
}

function formatText(text) {
  return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

function sectionMarkup(section, index, media) {
  const [title, ...paragraphs] = section;
  return `<section class="topic-section"><p class="section-index">${String(index + 1).padStart(2, '0')} // ${title}</p><h2>${title}</h2>${paragraphs.map((text) => `<p>${formatText(text)}</p>`).join('')}${media ? mediaFigure(media) : ''}</section>`;
}

const slug = location.pathname.split('/').filter(Boolean).at(-1) || 'simulation';
const topic = topics[slug] || topics.simulation;
document.title = `${topic.label} — Claude of Tanks Technical Manual`;

const topicNav = TOPIC_ORDER.map((id) => `<a href="/docs/${id}"${id === slug ? ' aria-current="page"' : ''}>${topics[id].label}</a>`).join('');
const root = document.querySelector('#topicRoot');
const heroMarkup = topic.hero.endsWith('.webm')
  ? `<video autoplay muted loop playsinline preload="metadata" poster="${topic.hero.replace(/\.webm$/, '.jpg')}" aria-label="${topic.label} shown in the current game renderer"><source src="${topic.hero}" type="video/webm"></video>`
  : `<img src="${topic.hero}" alt="${topic.label} shown in the current game renderer">`;
root.innerHTML = `
  <header class="topic-hero">${heroMarkup}<div class="topic-hero-shade"></div><div class="shell"><p class="kicker">Technical manual // ${topic.label}</p><h1>${topic.title}</h1><p>${topic.lede}</p></div></header>
  <nav class="topic-nav" aria-label="Technical manual sections"><div class="shell"><a href="/docs">Manual index</a>${topicNav}</div></nav>
  <div class="shell topic-layout"><article>${topic.sections.map((section, index) => sectionMarkup(section, index, topic.media[index === 1 ? 0 : index === 3 ? 1 : -1])).join('')}</article><aside><p>Manual section</p><strong>${topic.label}</strong><span>Current runtime contracts and verification paths.</span><a href="/docs">All documentation →</a></aside></div>`;
