<p align="center">
  <img src="public/brand/logo-mark.svg" alt="Claude of Tanks crest" width="110">
</p>

<h1 align="center">CLAUDE OF TANKS</h1>

<p align="center">
  A World of Tanks-style, Vite-powered, engine-free armored combat simulator in <strong>pure Three.js</strong> —
  resolving plate-level armor, ballistics, modules, spotting, and physics across 108 vehicles and eight destructible
  battlefields. Playable entirely in the browser on desktop and mobile devices. Built end-to-end by a long-running
  multi-agent Claude/Codex pipeline.
</p>

<p align="center">
  <a href="https://claudeoftanks.kevinliu.studio"><strong>▶&nbsp;&nbsp;PLAY IT IN YOUR BROWSER</strong></a>
  &nbsp;·&nbsp; desktop, tablet, and phone
</p>

![A T-90 column on the Verdant Fields road under fire — staged and captured in the in-game Scene Studio](public/media/featured/f7_studio_t90_column_fire.webp)

---

## What is this

A from-scratch armored combat simulator powered by Vite and [Three.js](https://threejs.org) — no game engine,
native runtime, install, or account — and ~70k lines of JavaScript. Its plate-level combat model is transcribed from
World of Tanks mechanics research and verified by node-run self-tests; all 108 playable vehicles are original,
first-party procedural builds authored from dimensions and reference study; and its eight battlefields generate terrain,
vegetation, buildings, props, and textures in code. Every screenshot below is the actual game.

## Playing

**[claudeoftanks.kevinliu.studio](https://claudeoftanks.kevinliu.studio)** — no install, no account. Pick a tank,
pick a map (or Random), press **BATTLE**.

| Action | Default bind |
|---|---|
| Drive | `W A S D` (or arrow keys) |
| Handbrake | `Space` |
| Aim turret | Mouse |
| Fire | Left mouse button |
| Sniper mode | `Shift` tap · hold `RMB` (configurable: hold / toggle / free-look) |
| Zoom steps | Mouse wheel |
| Shells | `1` `2` `3` |
| Consumables (repair / med / extinguisher) | `4` `5` `6` |
| Minimap zoom / shot log | `M` / `L` |
| Settings | `Esc` |

Every binding is remappable in **Settings → Controls** and persists locally.

**On phones and tablets:** a full touch layout — virtual joystick, swipe-to-aim, **pinch to scope and zoom**,
and Dynamic Aim: drag either fire button to refine aim, lift quickly to shoot once, or keep holding for continuous
fire as the gun reloads (drag onto the compact red × to cancel).
The thumb-side fire cluster works identically on every vehicle, and a vertical equipment column keeps consumables
reachable. A device quality tier keeps GPU memory ~80% lower than
desktop, and a boot-time GPU self-test heals device-specific rendering faults automatically (add `?diag=1` to the
URL to watch it work).

## The game

### Combat simulation
- **Plate-level armor**: real thickness and slope per plate, effective armor via impact angle with slope exponents,
  shell normalization, ricochet gates (70°/78°/85°), 3× / 2× caliber overmatch, spaced armor and screens,
  composite RHAe tracked separately vs kinetic and chemical energy, one-shot ERA, HEAT standoff decay.
- **Five shell classes** (AP / APCR / HEAT / HE / APFSDS) with per-type muzzle velocity, travel time, gravity drop,
  distance falloff, and HE splash. ±25% pen/damage rolls in WoT's order.
- **Modules and crew**: ammo rack, engine, fuel, tracks, radio, optics and crew roles with individual HP, save
  throws, repair timers, and fire chances.
- **Real spotting**: the concealment formula, firing bloom, bush mechanics, the 15 m rule, and a sixth-sense lamp —
  the AI acquires targets only through this system.
- **Honest gunnery**: the reticle draws the actual 2σ dispersion cone at your aim distance — movement, traverse and
  firing bloom all feed real shell dispersion.

### Feedback that teaches you
- **WoT-style hit direction indicators**: tapered crescent wedges around your reticle, world-anchored as you turn —
  bold red for penetrations (with pooled damage numbers and CRIT tags), steel-white RICOCHET/BLOCKED reads for
  bounces, amber for HE splash.
- **Killcam x-ray**: your death (and your winning shot) replays with a ghosted hull, the shell path drawn through
  the internals, damaged modules called out, and shell/angle/effective-armor annotations pulled from the real
  resolved hit event.
- **Shot info panels**: per-shot cards with result, distance, impact angle, nominal vs effective armor, your pen
  roll, and an armor diagram with the hit point marked. Every number traces to a sim event.

![Incoming-fire direction wedges with pooled damage numbers, ricochet reads, and the damage log](docs/readme/hit-indicators.jpg)

### Destructible battlefields
Stone and adobe wall runs breach **locally** where the shell lands or the hull drives through; sandbag lines burst;
crates splinter; fuel drums toss ballistically — and red drums detonate and chain. Wrecked tanks baked from the
actual roster dress the roadsides, and camps, truck stops, and convoy remains give every map a life of its own.
Everything resets for the rematch.

<table><tr>
<td width="50%"><img src="docs/readme/destructibles.jpg" alt="A stone wall run breached locally by an AP shell — rubble at the hole, wall standing on both sides"></td>
<td width="50%"><img src="docs/readme/map-dressing.jpg" alt="A supply truck stop with spilled cargo on Cinder Junction"></td>
</tr></table>

### Vehicles
**108 first-party playables in the deployed build**, organized by era and family in the garage. Every tank is an
original procedural construction: spec-driven hulls, turrets, equipment, and native running gear built from published
dimensions and reference study, then refined by a dual-gate fidelity program (geometric accuracy *and* an independent
visual critic, both ≥90). Reference models are quarantined to comparison tooling and never become gameplay geometry.
16 camouflage schemes with real
concealment values — including AUTO, which repaints to the biome you deploy into — plus an equipment system and
consumables that change how each tank plays.

### Eight battlefields
**Verdant Fields** (grassland village) · **Sirocco Wadi** (desert mesas) · **Frosthollow** (winter alpine) ·
**Steinburg** (urban grid) · **Saltmere Bay** (coastal harbor) · **Amberford** (autumn orchards) ·
**Tarkhan Steppe** (open grass sea) · **Cinder Junction** (rail industrial). Each has its own heightmap, splat
palette, vegetation, dressing, sky and fog character, and minimap rendered from the actual terrain.

### Atmosphere
Cascaded shadow maps, PMREM image-based lighting baked from the procedural sky, aerial-perspective fog, layered
muzzle flashes, per-type tracers, spall and ricochet sparks, staged vehicle fires, ammo-rack turret pops, de-track
ribbons, dust wakes, persistent smoke columns — and a **neural-voiced crew** (four distinct personas, generated
100% locally with Piper TTS) calling out hits, bounces, and module damage over a full sound system.

---

## Gallery

Shots below are in-engine captures, staged with the built-in Scene Studio.

<table>
<tr>
<td width="50%"><img src="public/media/featured/f1_09_winter_lake_duel.webp" alt="Winter lake duel at dawn on Frosthollow"></td>
<td width="50%"><img src="public/media/featured/f6_studio_strv_steinburg_duel.webp" alt="Strv 103 street duel in Steinburg"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/featured/f2_06_desert_hero_kf51.webp" alt="KF51 Panther hero shot in Sirocco Wadi"></td>
<td width="50%"><img src="public/media/featured/f3_19_urban_overwatch_church.webp" alt="Urban overwatch by the church in Steinburg"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/featured/f5_01_desert_duel_leclerc_kill.webp" alt="Leclerc kill shot in the desert"></td>
<td width="50%"><img src="public/media/featured/f4_20_urban_ruin_brawl.webp" alt="Ruin brawl in Steinburg"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/p2_35_winter_ice_breaker.webp" alt="Ice breaker charge on Frosthollow"></td>
<td width="50%"><img src="public/media/home/p2_49_coastal_harbor_kill.webp" alt="Harbor kill on Saltmere Bay"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/p2_53_autumn_gold_inferno.webp" alt="Autumn inferno on Amberford"></td>
<td width="50%"><img src="public/media/home/p2_55_steppe_horizon_charge.webp" alt="Horizon charge on Tarkhan Steppe"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/p2_60_railyard_sodium_dusk.webp" alt="Sodium dusk in Cinder Junction"></td>
<td width="50%"><img src="public/media/home/p2_44_verdant_hedgerow_breakout.webp" alt="Hedgerow breakout on Verdant Fields"></td>
</tr>
</table>

More: the in-game **[home gallery](https://claudeoftanks.kevinliu.studio/home)** shows the full 30-shot graded set.

## Scene Studio

The game ships its own cinematic staging tool — press **F8** from the garage or open
[`/studio`](https://claudeoftanks.kevinliu.studio/studio). Place any roster vehicles on any map, pose hulls and
turrets, trigger effects (firing moments, kills, fires, dust) on a stepped timeline, drive the camera freely, and
capture. Every marketing shot in this README was made with it — the scene files are plain JSON
(see [`docs/STUDIO.md`](docs/STUDIO.md)).

<table>
<tr>
<td width="50%"><img src="public/media/home/st_scene.webp" alt="Scene Studio: staging a scene with the actor panel open"></td>
<td width="50%"><img src="public/media/home/st_roster.webp" alt="Scene Studio: the full roster picker"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/st_timeline.webp" alt="Scene Studio: effects timeline"></td>
<td width="50%"><img src="public/media/home/st_burning.webp" alt="Scene Studio: staged burning wreck"></td>
</tr>
</table>

## Interface

<table>
<tr>
<td width="50%"><img src="public/media/home/ui_garage.webp" alt="Garage: showroom, camouflage picker, era filters, tank carousel"></td>
<td width="50%"><img src="public/media/home/ui_spectate.webp" alt="Spectator interface with live team status and vehicle switching"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/ui_battle.webp" alt="Battle HUD: reticle, minimap, damage panel schematic, team panels"></td>
<td width="50%"><img src="public/media/home/ui_sniper.webp" alt="Sniper mode: full-frame scope with zoom readout"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/ui_killcam.webp" alt="Killcam x-ray: shell path through the internals with module callouts"></td>
<td width="50%"><img src="public/media/home/ui_aar.webp" alt="After-action report with per-shot analytics"></td>
</tr>
<tr>
<td width="50%"><img src="public/media/home/ui_spectate.webp" alt="Spectator orbit after death"></td>
<td width="50%"><img src="public/media/home/ui_boot.webp" alt="Boot splash with featured-shot backdrop"></td>
</tr>
</table>

## Mobile

The same deployment runs on phones and tablets: touch HUD with virtual joystick, swipe-to-aim, pinch-to-scope,
and hybrid release/hold-to-auto-fire Dynamic Aim on both fire buttons,
a mobile device tier (half-resolution texture generation, tuned shadow cascades — **~80%
less GPU memory**), safe-area-aware layout, and a self-healing GPU pipeline: at boot the game renders test probes,
validates the environment-lighting bake on-device, and degrades gracefully around device-specific driver faults
instead of showing a black screen — then reclaims quality when a re-test proves the frame healthy.

![Touch HUD on a phone: joystick, fire cluster, pinch-to-scope, right-side equipment column](docs/readme/mobile-touch.jpg)

## Under the hood

```
src/engine/    renderer, cascaded shadow maps, post chain, procedural sky + IBL, camera rig,
               quality tiers, on-device GPU diagnostics
src/world/     terrain, vegetation, buildings/props, destructibles, baked tank wrecks,
               horizon, eight map configs
src/vehicles/  specs (stats + armor zones), procedural tank factory, per-family profiles,
               quarantined comparison importer, materials/camouflage painters
src/sim/       ballistics, armor resolution, damage, movement, spotting  (pure logic — node-run selftests)
src/fx/        muzzle flash, tracers, impacts, explosions, destruction, particles
src/ui/        HUD, garage, settings, damage panel, shot info, touch controls
src/game/      state, AI, input, killcam, scene studio
```

| Command | Purpose |
|---|---|
| `npx vite` | Run locally |
| `npm test` | 500+ sim/equipment/track assertions under plain node |
| `node tools/screenshot.mjs` | The screenshot contract: 20 deterministic views, zero console errors |
| `node tools/perfprobe.mjs` | Perf budgets: worst-frame draws < 900, triangles ≤ 6M, textures < 512 MB |
| `node tools/procedural-fidelity.mjs` | Tank fidelity gate: 9 ortho proof views + shaded boards vs references |
| `npm run build` | Public production build (also what the deployment runs) |

Development happens through verification-gated agent rounds: every change lands with probe evidence, a green
screenshot contract, and green self-tests. Docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`docs/STUDIO.md`](docs/STUDIO.md) · [`docs/GEOMETRY-GATE.md`](docs/GEOMETRY-GATE.md).

## Assets & licensing

All gameplay code and all 108 playable vehicle models are original first-party work. External models may be used only
as quarantined, read-only visual references during QA; they are never loaded as gameplay geometry and never ship as
playable assets. **No assets extracted from commercial games are used.** Provenance is enforced by the native-playable,
private-build, and public-build audits.

## Finding your way around

**[`docs/INDEX.md`](docs/INDEX.md)** is the navigation hub — what every document is, what every
measurement tool does, and where things live. From there: [`docs/DESIGN.md`](docs/DESIGN.md) (how the
tank generation program is architected), [`docs/LESSONS.md`](docs/LESSONS.md) (the incident stories
behind its laws), [`docs/PROGRAM-STATE.md`](docs/PROGRAM-STATE.md) (the live fleet registry and
how a session resumes), and [`docs/BUILD-STANDARD.md`](docs/BUILD-STANDARD.md) (the living rulebook).
Operational checklists for the program's recurring flows live as skills in `.claude/skills/`.

---

<p align="center">
  Built through a long-running Claude/Codex pipeline — research agents, subsystem builders, adversarial critics,
  and verification gates, orchestrated over many rounds.
</p>
