# Documentation index

This is the navigation hub for Claude of Tanks documentation. It prioritizes
current product contracts, contributor guidance, reproducible source evidence,
and durable architecture decisions.

If two current documents disagree, SYSTEMS.md owns runtime architecture,
MULTIPLAYER-ARCHITECTURE.md owns network behavior, and BUILD-STANDARD.md plus
GEOMETRY-GATE.md own vehicle-authoring acceptance.

## Start here

| Document | Audience | Purpose |
| --- | --- | --- |
| ../README.md | Everyone | Public overview, screenshots, features, architecture, and quick start |
| TECHNICAL-OVERVIEW.md | Engineers and technical reviewers | Current architecture, authority boundaries, runtime lifecycle, source ownership, and verification model |
| FEATURES.md | Players, reviewers, contributors | Visible features connected to their implementation and verification |
| HOW-IT-WORKS.md | Technical readers | Technical description of the current game from boot to results |
| GAME-MODES.md | Players and engineers | Standard, flag, zone, Turbo Ball, and Horde rules, authority, presentation, and tests |
| JEV-COMMANDER.md | Players and engineers | The Opponent brain option: Jev (TypeSafe's System One model) commanding the solo bots — proxy, team document, questions, orders, gating, budget, cost, dev path, privacy |
| GARAGE-ENVIRONMENTS.md | Players, designers, and engineers | Ten Garage locations, visual contract, scene-pack lifecycle, collision, performance, and quality gates |
| SYSTEMS.md | Engineers | Current subsystem ownership, data flow, lifecycle, and invariants |
| DEVELOPMENT.md | Engineers and release owners | Local setup, services, test matrix, tools, and release procedure |
| [tank-generation/README.md](tank-generation/README.md) | Tank builders and takeover agents | Source/markup intake, geometry methods, prompts, strict gates, case studies and handoff templates |
| DECISIONS.md | Contributors | Current architecture decisions, non-goals, and proof requirements |

The public browser field manual is available at
https://cot.kevinliu.studio/docs and is sourced from ../docs.html.

The current public presentation is image-led and sourced from a reproducible
88-frame archive: 13 owner-selected features, 60 approved 4K campaign frames,
five directed Studio keyframes, and ten deterministic interface captures. The
manifest lives at `../public/media/showcase-r1/manifest.json`; the landing page,
field manual, Tank Gallery, and Scene Studio share its filtering and inspection
component. Six published campaign contact sheets preserve the human
visual-review pass; the owner-approved ten-Garage contact sheet documents the
complete current environment set.

## Current subsystem references

| Document | Authoritative scope |
| --- | --- |
| MULTIPLAYER-ARCHITECTURE.md | Authority arrangements, protocol v5, delivery, prediction, rooms, signaling, ranked services, trust, and verification |
| ENTRY-RESILIENCE.md | First-visit entry: the anonymous telemetry beacon and its report, the capability gate, download-aware boot watchdogs, immutable assets, reveal budgets, entry failure surfaces |
| GAME-MODES.md | Shared deterministic objectives, respawns, scores, waves, loot, bot targets, and presentation |
| JEV-COMMANDER.md | The Jev commander: the `/api/jev` proxy, the team document schema, the question set, orders and their gating, budgets, measured cost, the dev path |
| PERFORMANCE.md | Boot, route isolation, device quality, render recovery, frame ownership, event budgets, and measurement |
| GARAGE-ENVIRONMENTS.md | Garage destination roster, canonical composition, scene packs, workshop exhibits, structure collision, resource ownership, and quality gates |
| STUDIO.md | Scene Studio interaction, scripted API, scene schema, effects, capture, and determinism |
| GALLERY.md | Tank Gallery architecture, dossiers, diagnostic overlays, exact-surface markup, exports, interaction, and verification |
| TANK-ASSET-PIPELINE.md | Generated portraits, silhouettes, armor/module diagrams, manifests, fingerprints, and release gates |
| VEHICLE-ROSTER.md | Generated complete saved fleet, production/development status, stable IDs, tiers, and visibility reasons |
| MODULES.md | Internal module and crew damage model |
| GUNNERY-CAMERA-SPEC.md | Camera, requested aim point, gun solution, scope, and reticle contract |
| SCREENSHOT_CONTRACT.md | Game-ready and deterministic staged-frame capture contract |
| SHOWCASE-LIBRARY.md | Published 88-frame archive, admission contract, review sheets, and rebuild procedure |
| MARKETING-BATTLE-CAMPAIGN.md | 60-frame 4K campaign composition, capture, contact-sheet review, and grading contract |
| ../public/media/showcase-r1/manifest.json | Current public visual archive, provenance, process sheets, maps, actors, effects, and feature tags |
| DEV-PERF-TRACE.md | Development performance flight recorder |
| ATTRIBUTION.md | Kevin B. Liu project authorship, asset provenance, third-party licenses, and quarantine record |
| ../NOTICE.md | Repository-wide authorship rule for every original file, model, and generated asset |
| ../LICENSE | Default MIT terms for first-party work not identified as an exception |
| ../LICENSE-POLICY.md | Path-level map separating MIT material, proprietary Reserved Content, third-party works, and prior revisions |
| ../LICENSES/ | Proprietary content terms and preserved historical MIT text |

## World, presentation and performance passes

Bounded checkpoint documents for shipped environment and presentation work.
Each records the baseline, the change and its evidence; none is a status
ledger. (Indexed 2026-09-22; they were previously unlinked.)

| Document | Scope |
| --- | --- |
| REGIONAL-MAP-IDENTITIES.md | Regional environment direction: horizon families, per-map identity targets (2026-09-10) |
| REGIONAL-LANDFORM-PASS.md | Regional landforms for playable ground and outland |
| GROUND-MATERIAL-OWNERSHIP.md | Worked-soil versus turf material separation |
| AUTUMN-LEAF-SPRAYS.md | Autumn birch/aspen leaf-spray atlases |
| BIRCH-CROWN-FORM.md | Connected birch and aspen crown structure |
| FOUNDRY-SERVICE-COURT.md | Ironworks service-court layout and contact |
| HORIZON-FOCUSED-CAPTURE.md | Focused horizon evidence flags of the map environment audit |
| BATTLE-WEATHER-AND-DAMAGE.md | Battle day/night presentation and cosmetic damage |
| performance/retained-battle-hud.md | Retained battle HUD presentation (bounded DOM work) |
| performance/shared-texture-worker.md | Shared vehicle texture worker for the asynchronous preload |
| CLEANUP-2026-09-22.md | Round 40 repository cleanup: hidden-tank inventory, phase-1 removals, phase-2 plan and owner decisions |
| CLEANUP-2026-09-23-structure.md | Round 46 cleanup phase 2 (structure): stage wrappers inlined, shadowed builders removed, duplicated helpers folded, core splits; byte-identical fleet proof |

## Vehicle-authoring law

These documents are current for changes to playable tank geometry and generated
assets:

| Document | Scope |
| --- | --- |
| [tank-generation/README.md](tank-generation/README.md) | Current end-to-end creation workflow and chronology of source-study requirements; reusable prompts and run/handoff templates |
| BUILD-STANDARD.md | Vehicle construction, silhouette, topology, fittings, tracks, parenting, review, and landing law |
| GEOMETRY-GATE.md | Measured geometry acceptance, scoring, caps, and anti-gaming rules |
| TANK-ASSET-PIPELINE.md | Presentation asset and fingerprint release contract |
| DECORATIONS.md | Vehicle fitting and decoration system |
| references/tanks/ | Per-vehicle source packets, measurements, known limitations, and certification history |
| geometry-gate/ | Tool-written work orders and score ledger |
| FLEET-FREEZE-CURRENT.json | Deterministic geometry fingerprint ledger |

## World, simulation, and game research

The source studies behind individual systems are archived under
history/research/ (299 dated notes, source packets and second-wave
registrations; moved from docs/research/ on 2026-09-23). Six remain the
canonical design inputs that ARCHITECTURE.md names:

- [armor-penetration.md](history/research/armor-penetration.md)
- [shells-ballistics.md](history/research/shells-ballistics.md)
- [movement-physics.md](history/research/movement-physics.md)
- [modern-roster.md](history/research/modern-roster.md)
- [tank-roster.md](history/research/tank-roster.md)
- [graphics-aaa.md](history/research/graphics-aaa.md)

Research explains inputs and trade-offs. Shipped behavior is defined by code
and the current subsystem documents above.

## Engineering history

Only history that explains a current invariant or a major incident remains in
the repository. Reusable tank-generation prompts, handoff templates and curated
case studies live in [tank-generation/](tank-generation/README.md). Transient
execution handoffs, raw machine-specific benchmarks and redundant transcript
dumps stay outside the maintained documentation; current per-tank/batch packets
retain decisions, status and reproducible evidence summaries.

| Document or directory | Historical role |
| --- | --- |
| ARCHITECTURE.md | Original locked nine-module implementation plan |
| DESIGN.md | Tank-generation program architecture |
| LESSONS.md | Incidents that informed vehicle build law |
| POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md | Running-gear incident record |
| DECISIONS.md | Maintained implementation choices and migration constraints |
| history/research/ | Dated research notes, source studies, independent reviews and the second-wave source registrations (299 files; `docs/research/` until 2026-09-23) |
| history/environment-2026-09/ | Environment-pass checkpoints, candidates, reviews and golden captures from the 2026-09-08/09 world recovery (32 records; evidence paths point at the authoring machine) |

Historical counts and architecture claims may differ from the current runtime.

## Source map

| Path | Responsibility |
| --- | --- |
| src/engine/ | Three.js renderer, camera, lighting, sky, post, quality, and device recovery |
| src/world/ | Maps, terrain, props, vegetation, collision, destructibles, and wrecks |
| src/vehicles/ | Fleet registry, specs, procedural geometry, materials, labels, and asset contracts |
| src/sim/ | Renderer-free movement, aiming, ballistics, armor, damage, spotting, bots, and match authority |
| src/game/ | Local game composition, input, equipment, consumables, profile, killcam, and Scene Studio |
| src/net/ | Protocol, transports, rooms, snapshots, prediction, reconnect, and browser bridge |
| src/ui/ | Garage, battle HUD, lobbies, results, settings, icons, and touch controls |
| src/fx/ | Particles, impacts, decals, explosions, and presentation clock |
| src/audio/ | Audio engine and voices |
| server/ | Signaling, distributed room storage, dedicated matches, matchmaking, and rating |
| tools/ | Generators, probes, browser tests, captures, and release checks |

## Common commands

    npm install
    npx vite
    npm run typecheck
    npm test
    npm run test:net:browser
    npm run tank:native:check
    npm run tank:assets:check
    npm run build
    npm run build:private

See DEVELOPMENT.md for the complete command and release matrix.

## Documentation maintenance

When behavior changes:

1. Update the nearest current subsystem document.
2. Update README.md or FEATURES.md if the visible product changed.
3. Update docs.html if the public technical reference changed, and GALLERY.md
   when the Tank Gallery contract changed.
4. Update the source-level module comment when ownership or invariants changed.
5. Record only a durable, still-binding architecture choice in `DECISIONS.md`;
   keep migration narration and raw run output in Git history, `.qa-*`, or
   external artifacts.
6. Verify every relative link and referenced path.

Machine-generated audits, performance trends, traces, screenshots, and critic
rounds belong under ignored `.qa-dev/` or `.qa-device/`. The maintained docs
describe how to reproduce them; Git history preserves old execution receipts.
