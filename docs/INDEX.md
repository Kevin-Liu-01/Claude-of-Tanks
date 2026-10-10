# Documentation index

This is the navigation hub for Claude of Tanks documentation. It names the
**production documentation set**, the documents kept current with the code,
and marks every other document as **history**. History stays where it is, so
existing links and citations keep resolving; nothing here has been moved.

If two current documents disagree, SYSTEMS.md owns runtime architecture,
MULTIPLAYER-V2.md owns network behavior, and BUILD-STANDARD.md plus
GEOMETRY-GATE.md own vehicle-authoring acceptance.

See [repository layout and documentation ownership](REPOSITORY-LAYOUT.md) for source locations, history and generated references.

The public browser field manual is available at
https://cot.kevinliu.studio/docs and is sourced from ../site/docs.html.

## Production documentation set

Update these when behavior changes. Paths are relative to `docs/`.

### Overview and architecture

| Document | Scope |
| --- | --- |
| [../README.md](../README.md) | Public overview, screenshots, features, architecture summary and quick start |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Original module contracts and simulation invariants (the nine-module plan); where it and SYSTEMS.md differ, SYSTEMS.md is current |
| [SYSTEMS.md](SYSTEMS.md) | Current subsystem ownership, data flow, lifecycle and invariants |
| [TECHNICAL-OVERVIEW.md](TECHNICAL-OVERVIEW.md) | Architecture, authority boundaries, runtime lifecycle, source ownership and verification model |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | The current game from boot to results |
| [DECISIONS.md](DECISIONS.md) | Binding architecture decisions, non-goals and proof requirements |
| [MODULES.md](MODULES.md) | Internal module and crew damage model |
| [REPOSITORY-LAYOUT.md](REPOSITORY-LAYOUT.md) | Where code, documentation, tools and assets live |
| INDEX.md | This page |

### Development

| Document | Scope |
| --- | --- |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup, services, test matrix, tools, publishing to shared main and the release procedure |
| [BATTLE-UI-QA.md](BATTLE-UI-QA.md) | Battle HUD lane layout and its regression checks |
| [DEV-PERF-TRACE.md](DEV-PERF-TRACE.md) | Development performance flight recorder |
| [LOCALIZATION.md](LOCALIZATION.md) | The en-US and zh-CN locales, the `/cn` routes and the catalog workflow |
| [SCREENSHOT_CONTRACT.md](SCREENSHOT_CONTRACT.md) | Game-ready and deterministic staged-frame capture contract |

### Multiplayer

| Document | Scope |
| --- | --- |
| [MULTIPLAYER-V2.md](MULTIPLAYER-V2.md) | The peer-to-peer multiplayer: rooms Worker, wire, host, client, certification and the cutover of 2026-09-29 (§13.10) |
| [../src/mp/README.md](../src/mp/README.md) | The client module tree: rooms, wire, transports, match client, browser host and sessions |
| [../server/match/README.md](../server/match/README.md) | The match actor: loop, publisher, interest tiers and seat tokens |
| [../cloudflare/rooms/README.md](../cloudflare/rooms/README.md) | The rooms Worker: deploy and operation |

### Operations

| Document | Scope |
| --- | --- |
| [DEPLOYS.md](DEPLOYS.md) | The manual production deploy procedure and the deploy ledger |
| [ENTRY-RESILIENCE.md](ENTRY-RESILIENCE.md) | First-visit entry: the telemetry beacon and its report, the capability gate, download-aware boot watchdogs, immutable assets, reveal budgets and entry failure surfaces |
| [../cloudflare/telemetry/README.md](../cloudflare/telemetry/README.md) | The telemetry Worker: deploy, verification, report and cost |

### Gameplay

| Document | Scope |
| --- | --- |
| [GAME-MODES.md](GAME-MODES.md) | Shared deterministic objectives, respawns, scores, waves, loot, bot targets and presentation |
| [GUNNERY-CAMERA-SPEC.md](GUNNERY-CAMERA-SPEC.md) | Camera, requested aim point, gun solution, scope and reticle contract |
| [VEHICLE-CONTROLS.md](VEHICLE-CONTROLS.md) | The battle HUD control row, shortcuts and fitted-equipment controls |
| [BOT-TACTICS.md](BOT-TACTICS.md) | Current bot capabilities and the scope of their tests |
| [BATTLE-WEATHER-AND-DAMAGE.md](BATTLE-WEATHER-AND-DAMAGE.md) | Battle day/night presentation and cosmetic damage |
| [DESTRUCTION.md](DESTRUCTION.md) | Buildings that take damage and collapse, craters that deform the ground, the munition blast catalog, the kit seam for damage geometry, and their multiplayer sync |
| [FEATURES.md](FEATURES.md) | Visible features connected to their implementation and verification |

### World

| Document | Scope |
| --- | --- |
| [MAP-RENDER-FOUNDATIONS.md](MAP-RENDER-FOUNDATIONS.md) | Map rendering foundations and their verification checkpoint |
| [REGIONAL-MAP-IDENTITIES.md](REGIONAL-MAP-IDENTITIES.md) | Regional environment direction: horizon families and per-map identity targets |
| [MAP-LAYOUT-BRIEF.md](MAP-LAYOUT-BRIEF.md) | What a battlefield must be as a place: geology, roads and settlements, sightlines, lanes, cover, spawns and objective balance, with the measurable checks of `tools/map-layout-metrics.mjs` |
| [GARAGE-ENVIRONMENTS.md](GARAGE-ENVIRONMENTS.md) | Garage locations, visual contract, scene packs, workshop exhibits, collision, resource ownership and quality gates |
| [MAP-BEAUTIFICATION.md](MAP-BEAUTIFICATION.md) | Battlefield visual goal, priorities and acceptance; the opening sections are the contract, the dated checkpoint log after them is history |

### Vehicles

| Document | Scope |
| --- | --- |
| [BUILD-STANDARD.md](BUILD-STANDARD.md) | Vehicle construction, silhouette, topology, fittings, tracks, parenting, review and landing law |
| [GEOMETRY-GATE.md](GEOMETRY-GATE.md) | Measured geometry acceptance, scoring, caps and anti-gaming rules |
| [TANK-ASSET-PIPELINE.md](TANK-ASSET-PIPELINE.md) | Generated portraits, silhouettes, armor/module diagrams, manifests, fingerprints and release gates |
| [DECORATIONS.md](DECORATIONS.md) | Vehicle fitting and decoration system |
| [VEHICLE-ROSTER.md](VEHICLE-ROSTER.md) | Generated complete saved fleet, production/development status, stable IDs, tiers and visibility reasons |
| [tank-generation/README.md](tank-generation/README.md) | The authoring handbook: source/markup intake, geometry methods, prompts, strict gates, case studies and handoff templates (with [tank-generation/SKILL.md](tank-generation/SKILL.md); its dated audits are records and `recovery/` is history) |

### Media

| Document | Scope |
| --- | --- |
| [MEDIA-PRODUCTION.md](MEDIA-PRODUCTION.md) | Media production tooling and the owner-directed media rule |
| [SHOWCASE-LIBRARY.md](SHOWCASE-LIBRARY.md) | Published 88-frame archive, admission contract, review sheets and rebuild procedure |

The current public presentation is image-led and sourced from a reproducible
88-frame archive: 13 owner-selected features, 60 approved 4K campaign frames,
five directed Studio keyframes, and ten deterministic interface captures. The
manifest lives at `../public/media/showcase-r1/manifest.json`; the landing page,
field manual, Tank Gallery, and Scene Studio share its filtering and inspection
component. Six published campaign contact sheets preserve the human
visual-review pass; the owner-approved ten-Garage contact sheet documents the
complete current environment set.

### Product surfaces

| Document | Scope |
| --- | --- |
| [STUDIO.md](STUDIO.md) | Scene Studio interaction, scripted API, scene schema, effects, capture and determinism |
| [GALLERY.md](GALLERY.md) | Tank Gallery architecture, dossiers, diagnostic overlays, exact-surface markup, exports, interaction and verification |
| [JEV-COMMANDER.md](JEV-COMMANDER.md) | The Opponent brain option: the `/api/jev` proxy, team document, questions, orders, gating, budgets, cost, dev path and privacy |

### Performance

| Document | Scope |
| --- | --- |
| [PERFORMANCE.md](PERFORMANCE.md) | Boot, route isolation, device quality, render recovery, frame ownership, event budgets and measurement |
| [performance/retained-battle-hud.md](performance/retained-battle-hud.md) | Retained battle HUD presentation (bounded DOM work) |
| [performance/shared-texture-worker.md](performance/shared-texture-worker.md) | Shared vehicle texture worker for the asynchronous preload |

### Legal and provenance

| Document | Scope |
| --- | --- |
| [ATTRIBUTION.md](ATTRIBUTION.md) | Kevin B. Liu project authorship, asset provenance, third-party licenses and quarantine record |
| [licenses/](licenses/) | Per-asset licence records |
| [../NOTICE.md](../NOTICE.md) | Repository-wide authorship rule for every original file, model and generated asset |
| [../LICENSE](../LICENSE) | Default MIT terms for first-party work not identified as an exception |
| [../LICENSE-POLICY.md](../LICENSE-POLICY.md) | Path-level map separating MIT material, proprietary Reserved Content, third-party works and prior revisions |
| [../LICENSES/](../LICENSES/) | Proprietary content terms, the Apache-2.0 text and preserved historical MIT text |

## Data and generated references

Code and tools read these; extend or regenerate them with their tools rather
than editing them as prose.

| Path | Contents |
| --- | --- |
| [references/](references/README.md) | Per-vehicle source packets with their certification history, measurements, vertex and profile studies, concepts and source assemblies (selftests read its JSON) |
| [geometry-gate/](geometry-gate/) | Tool-written work orders and score ledger |
| [FLEET-FREEZE-CURRENT.json](FLEET-FREEZE-CURRENT.json) | Deterministic geometry fingerprint ledger |
| [balance/](balance/README.md) | Deterministic matchup receipt and role-balance tables |

## History

Kept in place for provenance and for the citations that point at them. These
documents are not maintained: counts, paths and architecture claims may differ
from the current runtime. Describe current behavior in the production set
instead of updating them.

| Document or directory | What it records |
| --- | --- |
| [CLEANUP-2026-09-22.md](CLEANUP-2026-09-22.md) | Round 40 repository cleanup: hidden-tank inventory, removals, owner decisions and their execution |
| [CLEANUP-2026-09-23-structure.md](CLEANUP-2026-09-23-structure.md) | Round 46 cleanup phase 2 (structure) and its byte-identical fleet proof |
| [CAMOUFLAGE-ART-PASS-2026-09-24.md](CAMOUFLAGE-ART-PASS-2026-09-24.md) | Selectable camouflage art pass |
| [POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md](POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md) | Running-gear incident record |
| [ROAD-SETTLEMENT-REVIEW.md](ROAD-SETTLEMENT-REVIEW.md) | Road and settlement review (2026-09-29) |
| [SHADOW-CLOUD-REVIEW-20260929.md](SHADOW-CLOUD-REVIEW-20260929.md) | Shadow and cloud artifact repair (2026-09-29) |
| [SHORELINE-REGRESSION-RECONCILIATION.md](SHORELINE-REGRESSION-RECONCILIATION.md) | Shoreline regression reconciliation |
| [WOT-ENVIRONMENT-REFERENCE.md](WOT-ENVIRONMENT-REFERENCE.md) | Reference-driven environment direction (2026-09-08) |
| [ENVIRONMENT-PASS.md](ENVIRONMENT-PASS.md) | Environment pass, September 2026 |
| [ENVIRONMENT-RECOVERY.md](ENVIRONMENT-RECOVERY.md) | Environment recovery and acceptance ledger |
| [REGIONAL-LANDFORM-PASS.md](REGIONAL-LANDFORM-PASS.md) | Regional landforms for playable ground and outland |
| [GROUND-MATERIAL-OWNERSHIP.md](GROUND-MATERIAL-OWNERSHIP.md) | Worked-soil versus turf material separation |
| [AUTUMN-LEAF-SPRAYS.md](AUTUMN-LEAF-SPRAYS.md) | Autumn birch and aspen leaf-spray atlases |
| [BIRCH-CROWN-FORM.md](BIRCH-CROWN-FORM.md) | Connected birch and aspen crown structure |
| [FOUNDRY-SERVICE-COURT.md](FOUNDRY-SERVICE-COURT.md) | Ironworks service-court layout and contact |
| [HORIZON-FOCUSED-CAPTURE.md](HORIZON-FOCUSED-CAPTURE.md) | Focused horizon evidence flags of the map environment audit |
| [SHALLOW-WATER-CONTACT.md](SHALLOW-WATER-CONTACT.md) | Shallow water contact presentation |
| [DESIGN.md](DESIGN.md) | Historical tank-generation program architecture |
| [LESSONS.md](LESSONS.md) | Incidents that informed vehicle build law |
| [MEDIA-PRODUCTION-CAMPAIGNS.md](MEDIA-PRODUCTION-CAMPAIGNS.md) | Campaign Studio; the tooling remains for owner-directed sessions, but its publication record is not the current media selection |
| [MARKETING-BATTLE-CAMPAIGN.md](MARKETING-BATTLE-CAMPAIGN.md) | The R3 60-frame 4K battle campaign |
| [performance/garage-switch-profile-20260925.md](performance/garage-switch-profile-20260925.md) | The FSP-01 garage switch profile (2026-09-25) |
| [history/research/](history/research/) | Dated research notes, source studies, independent reviews and the second-wave source registrations (`docs/research/` until 2026-09-23) |
| [history/environment-2026-09/](history/environment-2026-09/README.md) | Environment-pass checkpoints, candidates, reviews and golden captures from the 2026-09-08/09 world recovery (evidence paths point at the authoring machine) |
| history/sync-audit-2026-09-22.md, history/sync-audit-2026-09-23.md | Shared-main sync audits |
| [tank-generation/recovery/](tank-generation/recovery/) | Recovery records of earlier tank-generation runs |

Some history is still read by code: selftests and tools cite files under
`history/research/` by path. Six research notes also remain the canonical
design inputs that ARCHITECTURE.md names:

- [armor-penetration.md](history/research/armor-penetration.md)
- [shells-ballistics.md](history/research/shells-ballistics.md)
- [movement-physics.md](history/research/movement-physics.md)
- [modern-roster.md](history/research/modern-roster.md)
- [tank-roster.md](history/research/tank-roster.md)
- [graphics-aaa.md](history/research/graphics-aaa.md)

Research explains inputs and trade-offs. Shipped behavior is defined by code
and the production documents above.

## Source map

| Path | Responsibility |
| --- | --- |
| src/engine/ | Three.js renderer, camera, lighting, sky, post, quality, and device recovery |
| src/world/ | Maps, terrain, props, vegetation, collision, destructibles, and wrecks |
| src/vehicles/ | Fleet registry, specs, procedural geometry, materials, labels, and asset contracts |
| src/sim/ | Renderer-free movement, aiming, ballistics, armor, damage, spotting, bots, and match authority |
| src/game/ | Local game composition, input, equipment, consumables, profile, killcam, and Scene Studio |
| src/mp/ | The room protocol and policy, the binary wire, transports, the match client, the browser host, and sessions |
| src/ui/ | Garage, battle HUD, lobbies, results, settings, icons, and touch controls |
| src/fx/ | Particles, impacts, decals, explosions, and presentation clock |
| src/audio/ | Audio engine and voices |
| server/ | The match actor (loop, publisher, interest tiers, seat tokens), the LAN room helper, collision manifests, pacing and telemetry receipts |
| tools/ | Generators, probes, browser tests, captures, and release checks |

## Common commands

    npm install
    npx vite
    npm run typecheck
    npm test
    npm run test:net:v2:p2p
    npm run tank:native:check
    npm run tank:assets:check
    npm run build
    npm run build:private

See DEVELOPMENT.md for the complete command and release matrix.

## Documentation maintenance

When behavior changes:

1. Update the nearest production document.
2. Update README.md or FEATURES.md if the visible product changed.
3. Update site/docs.html if the public technical reference changed, and GALLERY.md
   when the Tank Gallery contract changed.
4. Update the source-level module comment when ownership or invariants changed.
5. Record only a durable, still-binding architecture choice in `DECISIONS.md`;
   keep migration narration and raw run output in Git history, `.qa-*`, or
   external artifacts.
6. Verify every relative link and referenced path.

A new document joins the production set in this index or is history from the
day it lands. Machine-generated audits, performance trends, traces,
screenshots, and critic rounds belong under ignored `.qa-dev/` or `.qa-device/`.
The maintained docs describe how to reproduce them; Git history preserves old
execution receipts.
