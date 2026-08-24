# Documentation index

This is the navigation hub for Claude of Tanks documentation. It separates the
current product and runtime contract from the historical evidence created while
the fleet and engine were being built.

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
| SYSTEMS.md | Engineers | Current subsystem ownership, data flow, lifecycle, and invariants |
| DEVELOPMENT.md | Engineers and release owners | Local setup, services, test matrix, tools, and release procedure |

The public browser field manual is available at
https://cot.kevinliu.studio/docs and is sourced from ../docs.html.

The current public presentation is image-led and sourced from a reproducible
88-frame archive: 13 owner-selected features, 60 approved 4K campaign frames,
five directed Studio keyframes, and ten deterministic interface captures. The
manifest lives at `../public/media/showcase-r1/manifest.json`; the landing page,
field manual, Tank Gallery, and Scene Studio share its filtering and inspection
component. Six published contact sheets preserve the human visual-review pass.

## Current subsystem references

| Document | Authoritative scope |
| --- | --- |
| MULTIPLAYER-ARCHITECTURE.md | Authority arrangements, protocol v5, delivery, prediction, rooms, signaling, ranked services, trust, and verification |
| PERFORMANCE.md | Boot, route isolation, device quality, render recovery, frame ownership, event budgets, and measurement |
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
| MOBILE-QA.md | Sustained mobile test procedure and evidence ledger |
| IMPROVEMENT-PROGRAM-2026-08-17.md | Dated implementation and verification record for the 16-map, multiplayer, UI, destruction, and rendering improvement program |
| ATTRIBUTION.md | Kevin B. Liu project authorship, asset provenance, third-party licenses, and quarantine record |
| ../NOTICE.md | Repository-wide authorship rule for every original file, model, and generated asset |
| ../LICENSE | Default MIT terms for first-party work not identified as an exception |
| ../LICENSE-POLICY.md | Path-level map separating MIT material, proprietary Reserved Content, third-party works, and prior revisions |
| ../LICENSES/ | Proprietary content terms and preserved historical MIT text |

## Vehicle-authoring law

These documents are current for changes to playable tank geometry and generated
assets:

| Document | Scope |
| --- | --- |
| BUILD-STANDARD.md | Vehicle construction, silhouette, topology, fittings, tracks, parenting, review, and landing law |
| GEOMETRY-GATE.md | Measured geometry acceptance, scoring, caps, and anti-gaming rules |
| TANK-ASSET-PIPELINE.md | Presentation asset and fingerprint release contract |
| DECORATIONS.md | Vehicle fitting and decoration system |
| references/tanks/ | Per-vehicle source packets, measurements, known limitations, and certification history |
| geometry-gate/ | Tool-written work orders and score ledger |
| critique/ | Independent visual review evidence |

PROGRAM-STATE.md remains the detailed fleet-program ledger and takeover record.
It is not the current runtime architecture.

## World, simulation, and game research

The files under research/ preserve the source study used to build individual
systems:

- armor-penetration.md
- shells-ballistics.md
- movement-physics.md
- modern-roster.md
- tank-roster.md
- graphics-aaa.md

Research explains inputs and trade-offs. Shipped behavior is defined by code
and the current subsystem documents above.

## Historical and audit documents

The following files are retained for provenance, incident learning, and
reproducibility. They must not be treated as the current product guide:

| Document or directory | Historical role |
| --- | --- |
| ARCHITECTURE.md | Original locked nine-module implementation plan |
| DESIGN.md | Tank-generation program architecture |
| PROGRAM-STATE.md | Fleet program registry, directives, and takeover handbook |
| PROGRAM-STATE-base21.md | Earlier modernization roster snapshot |
| HANDOFF-FABLE.md | Corrective handoff that began the reference rebuild |
| RECOVERED-FLEET.md | Recovered-fleet integration report |
| EVALUATION.md | Point-in-time whole-game audit |
| LESSONS.md | Incidents that informed vehicle build law |
| QA-ARCHIVE.md | Archived performance and quality evidence index |
| POSTMORTEM-RUNNING-GEAR-REGRESSION-2026-08-13.md | Running-gear incident record |
| FLEET-OVERHAUL-WORKLOG-2026-08-13-18.md | Conversation-scale fleet, tooling, runtime, and verification worklog |
| DEVELOPMENT-EVOLUTION-2026-07-27-08-18.md | Commit-backed synthesis of the Claude/Codex conversation record, engineering-practice evolution, and fresh 2026-08-18 visual evidence |
| handoff/ | Previous task and program handoffs |
| perf-*.json, cert-*.json, feel-*.json | Point-in-time measurements |
| marketing-shots-report.md | Generated public image report |

Historical counts, file paths, and architecture claims may differ from the
current runtime by design.

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
5. Preserve historical ledgers; add a new dated record instead of rewriting old
   evidence as though it described the present.
6. Verify every relative link and referenced path.
