# claude-of-tanks - Agent Index

> Pointer index for agents working in this repo. Keep this file lean: load linked
> files on demand, prune no-op instructions, and keep generated facts inside
> `agent-docs:auto` blocks.

## Overview
<!-- agent-docs:fill:overview -->
Browser-native Three.js armored combat game. The runtime combines a fixed-step
60 Hz simulation, procedural first-party vehicle fleet, thirty-three battlefields,
garage/showroom presentation, bots, Watch mode, armor/ballistics/modules, and
mobile input, plus a public site (landing, Field Manual, Tank Gallery) in English
and Chinese.
Treat current `origin/main` as active shared work: isolate broad changes in a
worktree and never stage generated tank work wholesale.

## Architecture Pointers
<!-- agent-docs:fill:architecture -->
- `docs/DEVELOPMENT.md#publishing-to-shared-main` — shared Codex/Claude integration,
  overlap review and preflight; read before integrating or publishing changes.
- `docs/ARCHITECTURE.md` — original module contracts and simulation invariants.
- `docs/AUDIO.md` — the sound engine and how its sounds were generated (ElevenLabs
  catalog, takes, selection, mastering, crew script and cast); read before changing
  `src/audio/` or regenerating sounds.
- `docs/audio-generation/README.md` — the audio-generation handbook: pipeline and
  files, the prompt cookbook (what worked and failed), take scoring and failure
  modes, costs and recipes. Begin with
  [`docs/audio-generation/SKILL.md`](docs/audio-generation/SKILL.md) before
  generating or repairing any sound or crew line.
- `docs/MULTIPLAYER-V2.md` — the peer-to-peer multiplayer: rooms Worker, wire, host, client, the cutover (§13.10).
- `docs/RUST-KERNELS.md` — the authority's WebAssembly kernels (`crates/cot-sim`): what they answer, the flags, the receipts.
- `docs/tank-generation/README.md` — source/markup intake, measured construction,
  prompts, quality gates and resumable tank-generation handoffs. Read before
  new source-backed tanks, family rebuilds or exact-surface geometry repairs.
  Begin with [`docs/tank-generation/SKILL.md`](docs/tank-generation/SKILL.md);
  this documentation-only directory is not discovered by the source-code index.
- `docs/tank-generation/fleet-style-performance-priority.md` — urgent open
  fleet-wide primitive/cost, switching, roller/track, chassis-closure and
  material-role work; read before adding further tank micro-detail.
- `src/main.ts` — strict typed boot, scene composition, UI flow, and render-loop
  wiring across extracted lifecycle owners; keep changes surgical.
- `src/game/stateCore.ts` — dependency-free typed session shell, event bus,
  and deterministic integration RNG.
- `src/game/state.ts` — battle roster and authoritative simulation integration.
- `src/sim/` — movement, armor, damage, spotting, and ballistics logic.
- `src/mp/` — rooms, the binary wire, transports, the match client, the browser host and the session owner.
- `src/docs/SKILL.md` — the Field Manual: chapters built from the game's own tables and
  prerendered by `tools/docs-prerender.mjs`; the public pages' other generators are listed in
  `docs/DEVELOPMENT.md#generated-parts-of-the-public-pages`.

## Stack
<!-- agent-docs:auto:stack start -->
- **Name:** claude-of-tanks
- **Package manager:** npm
- **Languages:** typescript
- **Framework:** vite
<!-- agent-docs:auto:stack end -->

## Commands
<!-- agent-docs:auto:commands start -->
- Package scripts detected: 146. Use `package.json` as the exhaustive source.
- `npm run build` - VITE_PUBLIC_BUILD=1 vite build && node tools/generate-localized-pages.mjs && node tools/strip-nc-assets.mjs && node tools/asset-provenance.mjs --write=dist/asset-provenance.json
- `npm run test` - node tools/run-selftests.mjs all
- `npm run lint` - oxlint
- `npm run typecheck` - node tools/typecheck.mjs
- `npm run agent-docs` - node scripts/run-agent-docs.ts
- Keep this block compact. Put full command catalogs in a generated command index, not in AGENTS.md.
<!-- agent-docs:auto:commands end -->
`npm test` runs the default receipt tier (`tools/selftest-tiers.mjs`) of the pre → core → post groups; a
receipt whose observable inputs are byte-identical to its last PASS is skipped with a SKIP line
(`COT_SELFTEST_CACHE=0 npm test` runs everything), every failure in a group is reported in one run
(`COT_SELFTEST_FAIL_FAST=1` stops at the first), and `tank:release:check` runs its per-id probes beside the
suite and the build after the serial scoring steps. Strenuous suites (balance, pacing, bots, the fleet
passes, world builds, the tank pins) are manual: `npm run test:recommend` says which a diff warrants, Main
relays it, and only the owner triggers `npm run test:heavy -- <suite>`; never from npm test, the gate, a
hook or CI. A lane runs `npm run test:lane` (the default-tier receipts its diff reaches plus its tanks'
pins, each with its reason). `npm run typecheck` is one TypeScript 7 compile with Oxlint beside it; `npm run lint` is
Oxlint alone. See docs/DEVELOPMENT.md "Fast checks".

## Directory index
<!-- agent-docs:auto:dirmap start -->
| Directory | Skill | Purpose |
|---|---|---|
| `api/` | [`api/SKILL.md`](api/SKILL.md) | Maintain the telemetry, Jev proxy and public GitHub-count HTTP entrypoints. |
| `server/` | [`server/SKILL.md`](server/SKILL.md) | Implement and operate the match actor, the LAN room helper, collision manifests, ICE and telemetry services. |
| `src/` | [`src/SKILL.md`](src/SKILL.md) | Navigate browser boot and shared source contracts while preserving subsystem and bundle boundaries. |
| `src/app/` | [`src/app/SKILL.md`](src/app/SKILL.md) | Maintain typed application composition, lazy owner access, frame wiring, and combat warm lifecycle. |
| `src/audio/` | [`src/audio/SKILL.md`](src/audio/SKILL.md) | Work on event-driven spatial audio, radio voices, engines, weapons, ambience, and mix state. |
| `src/dev/` | [`src/dev/SKILL.md`](src/dev/SKILL.md) | Maintain opt-in diagnostics, bounded traces, deterministic shot controls, and capture readiness gates. |
| `src/docs/` | [`src/docs/SKILL.md`](src/docs/SKILL.md) | Maintain the public field manual, indexed topic pages, typed icons, and battle-reel interactions. |
| `src/engine/` | [`src/engine/SKILL.md`](src/engine/SKILL.md) | Work on renderer, lighting, camera, postprocessing, device quality, and frame diagnostics. |
| `src/fx/` | [`src/fx/SKILL.md`](src/fx/SKILL.md) | Work on pooled particles, impacts, destruction effects, decals, and shared FX time. |
| `src/gallery/` | [`src/gallery/SKILL.md`](src/gallery/SKILL.md) | Build and verify the public Tank Gallery, its technical dossiers, diagnostic overlays, and exact-surface markup review packets. |
| `src/game/` | [`src/game/SKILL.md`](src/game/SKILL.md) | Work on battle integration, bots, input, garage dressing, progression, replays, and studio state. |
| `src/presentation/` | [`src/presentation/SKILL.md`](src/presentation/SKILL.md) | Maintain lightweight public navigation, media loading, archive presentation, and public-site contracts. |
| `src/sim/` | [`src/sim/SKILL.md`](src/sim/SKILL.md) | Work on deterministic movement, armor, ballistics, damage, and spotting simulation. |
| `src/techTree/` | [`src/techTree/SKILL.md`](src/techTree/SKILL.md) | Maintain the read-only national tech trees the Garage draws - tree data, lineage, tiers as columns and the connector layout. |
| `src/ui/` | [`src/ui/SKILL.md`](src/ui/SKILL.md) | Work on garage, HUD, settings, mobile controls, transitions, and battle presentation UI. |
| `src/vehicles/` | [`src/vehicles/SKILL.md`](src/vehicles/SKILL.md) | Work on first-party procedural tank specs, builders, materials, profiles, ordering, and asset provenance. |
| `src/world/` | [`src/world/SKILL.md`](src/world/SKILL.md) | Work on terrain, maps, collision, vegetation, props, destructibles, and world streaming. |
| `tools/` | [`tools/SKILL.md`](tools/SKILL.md) | Maintain deterministic performance, screenshot, fleet, geometry, asset, and release verification tools. |
| `tools/marketing-shots/` | [`tools/marketing-shots/SKILL.md`](tools/marketing-shots/SKILL.md) | Generate deterministic branded marketing screenshots from staged game states. |
<!-- agent-docs:auto:dirmap end -->

## Repo graph sidecar (Graphify)
<!-- agent-docs:auto:repo-graph start -->
- Use Graphify for repo topology, path/explain/affected questions, PR risk, and unfamiliar codebase orientation.
- Use `rg` for exact strings; use Kevin-Wiki `qmd` for people, tools, decisions, and compiled wiki knowledge.
- Use `agent-browser` for browser/UI work; use Playwright only for committed regression tests.
- Runtime memories (Hermes/Hindsight/Honcho) are not project truth until written back to AGENTS.md, SKILL.md, or the wiki.
- Status: `cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- status --run outputs/graphify/claude-of-tanks`
- Build from this repo: `PROJECT_ROOT="$(pwd)" && cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- build "$PROJECT_ROOT" --run outputs/graphify/claude-of-tanks --no-viz`
- Query after build: `cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- query "what should I inspect first?" --run outputs/graphify/claude-of-tanks`
- Never run Graphify installers/hooks or commit generated `graphify-out/` artifacts.
<!-- agent-docs:auto:repo-graph end -->

## Environment variables (names only)
<!-- agent-docs:auto:env start -->
- `VITE_COT_DEV_FLEET_KEY`
- `VITE_ROOMS_URL`
<!-- agent-docs:auto:env end -->

## Conventions & invariants
<!-- agent-docs:fill:conventions -->
- Runtime units are meters, seconds, and radians; tank forward is local `+Z`.
- Simulation advances at `SIM_DT = 1/60`; rendering may be variable-rate.
- Simulation randomness is seeded/injected. Do not use wall-clock time or
  `Math.random()` in authoritative logic.
- Keep simulation and network modules Node-runnable and free of DOM/WebGL.
- No per-frame allocation in established hot loops; reuse scratch state.
- All playable tanks are first-party procedural runtime models. Source GLBs
  are comparison/authoring inputs, never a playable loading path.
- Every first-party file and asset is attributed to Kevin B. Liu by
  `NOTICE.md`; every playable spec inherits the named authorship record from
  `src/authorship.ts`. Record third-party exceptions in `docs/ATTRIBUTION.md`
  and run `npm run attribution:check`.
- Every game-mode rule (gravity, speed, hull, damage, reload, ammunition, equipment,
  consumables, respawn, clock, roster split, assault escalation, score targets) lives in
  `src/sim/matchRuleset.ts`; the mode controller, `state.ts`, the authority, the HUD and the
  rule cards read that table. Never add a mode literal elsewhere. (A mode-independent constant
  that geometry also reads may live in a leaf the ruleset imports and re-exports, as the drone
  dock launch height does in `src/sim/droneDockRules.ts`, so the decor path skips the ruleset.)
- Both sides deploy through one function: `src/sim/deployment.ts` (each bravo slot the 180° rotation of
  its alpha slot about the anchors' midpoint), resolved on the world by `sim/matchPlacement.ts`
  `deploymentSlot`, which the authority, the browser host and the solo sim all call; the world keeps
  its spawn clearings round those slots (`deploymentClearings`). Never seat a side anywhere else.
- Objective markers (spawns, flags, zones, sectors, goals, caches) come from one derivation,
  `src/ui/minimapObjectives.ts`, and one glyph set, `src/ui/objectiveGlyphs.ts`; the HUD
  minimap and `src/game/matchModeWorldPresentation.ts` both consume them. A new objective
  gets a marker kind and a glyph there, never an ad-hoc drawing in the HUD or the world.
- One datum, one owner: every on-screen datum (ping, fps, score, clock, objective, ammo, hp,
  tank name, tier, mode, map and the rest) has one row in `src/ui/surfaceRegistry.ts` naming its
  owning module, surface, screens and states; only that owner renders it, through `datumAttr()`,
  `markDatum()` and `datumGlyph()` (in `src/ui/dom.ts`). A new readout gets a row there, never a
  second copy on a screen (`src/ui/surfaceRegistry.selftest.mjs`, `tools/datum-census.mjs`).
- Export only what another file imports: `node tools/unused-exports.mjs` lists the
  exports nothing else mentions and drives the periodic un-export passes;
  `npm run typecheck` runs the unused-locals check on the core owners. Leave
  hash-pinned sources (vehicle profiles, terrain, sky, impact decals, the authority,
  match placement) to their receipts.
- Add focused `*.selftest.mjs` coverage and include it in `npm test`. A receipt that builds the whole
  fleet or every map joins a manual suite in `tools/selftest-tiers.mjs` instead (`docs/TEST-AUDIT.md`).
- A receipt or tool that lists a tree (readdir, glob, `git ls-files`/`grep`) declares what it lists in
  `tools/selftest-scans.mjs`; `tools/selftest-scans.selftest.mjs` fails until it does (228p shipped a red its
  changed-file selection could not see).
- Any playable tank addition or geometry/profile change regenerates with
  `npm run tank:regen:changed` (`-- --ids=<your ids>` while main has no
  `release/fingerprints.tsv`: without it a plain run refuses): every fleet generator (controls, fills, seats,
  spare-track, anatomy, marking, ledger, gun lines, centering, icons) runs only
  on the ids whose inputs or outputs moved, in dependency order, then the world
  steps (wreck plan, collision and trench shards) only on the maps whose config,
  world core or wreck donors moved, until the final resolve is empty
  (`npm run tank:changed -- --explain` says why an id or map is marked). Then
  the targeted `npm run tank:release:check -- --ids=<ids> --gate`: every step
  per id, the combat-anatomy check and the ids' `tanks` pins included. The
  whole-fleet forms (`--all`, `npm run tank:anatomy:update` and
  `tank:anatomy:check`, the fleet passes) are the manual `fleet` suite:
  `npm run test:recommend` names it when a shared builder moved, and the owner
  triggers it; see docs/DEVELOPMENT.md "Changed-only regeneration".
  A tank lane adds `--lane`: the same steps minus the embedded `npm test` and
  `npm run build:private` (its PASS is not a suite or build pass); the
  integrator's run keeps both and the release gate runs the default receipt
  tier and `npm run build` (`docs/DEVELOPMENT.md` "Fast checks").

## Gotchas / never-do-X
<!-- agent-docs:fill:gotchas -->
- Never modify or clean the shared dirty checkout to integrate unrelated work.
- Never equate a player/entity ID with a vehicle spec ID; duplicate tank picks
  are valid in multiplayer.
- Never send hidden enemy coordinates to a client and rely on rendering to hide
  them; spotting filters snapshots before serialization.
- Never make a client authoritative for hits, damage, reloads, or match result.
- Do not import full fleet builders into a new boot-critical module.
- Do not add multicrew roles or multiple player seats inside one vehicle.
- Never deploy per commit. Git auto-deploys are disabled in `vercel.json`
  (`git.deploymentEnabled: false`, every branch); production changes
  only through the once-per-round prebuilt CLI deploy in `docs/DEPLOYS.md`
  (`vercel pull --yes --environment=production && vercel build --prod &&
  node tools/vercel-output-immutable.mjs && vercel deploy --prebuilt --prod`,
  scope `kl01s-projects`) after a green
  gate. Do not add a second gate (Ignored Build Step) or a CI deploy.

## Extending this project's agent system
<!-- agent-docs:fill:extending -->
The `agent-docs:auto` blocks come from the Agent-Docs kit in the owner's
Kevin-Wiki checkout, which is outside this repo and optional: with one,
`KEVIN_WIKI_ROOT=<checkout> npm run agent-docs -- scaffold .` refreshes them
and `-- doctor --json` checks them; without it the command exits 2 and can be
skipped. The Graphify commands above need the same checkout (read
`~/Documents/GitHub/kevin-wiki` as `$KEVIN_WIKI_ROOT`). Edit prose only below
`agent-docs:fill` markers; generated auto blocks are owned by the scaffold
command.

When a generated block lags, `package.json` wins.
