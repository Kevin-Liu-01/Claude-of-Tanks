# Supplied fleet publication review — 2026-09-18

Result: **no new concrete publication blocker found in the inspected paths**. This is a bounded static review, not final fleet qualification or approval to stage every changed file. Base is `88592876f84eb1794f2a6d5505bd39d7c51c4ecd`; inventory was read at 2026-09-19 00:06 UTC (September 18 locally). No runtime, tool, package, source model, generated asset or index was changed by this review. No build, browser capture or vehicle simulation was run.

The reviewer previously authored European profiles, some BMP/Kurganets/Warrior/K21 corrections, shadow opt-in metadata and the BMP fill-boundary policy. This review does not independently certify those shapes, the latest CV90 bore, or their source assembly decisions. Their separate author and independent review records remain necessary.

## Scope and actual checks

- Inspected the tracked shared runtime diff in `tankFactoryCore.ts`, `materials.ts`, `appearanceAudit.ts`, fleet registration/loading, asset requirements and contracts; read the new scalar-study index, supplied combat metadata, shadow-work counter and gun-mount helper. Profile/source-boundary searches covered all changed runtime files, including untracked helpers. This was not a second line-by-line review of every vehicle profile.
- Inspected new/changed qualification paths for source assemblies, source configuration/equipment, openings, source cameras/dimensions, track separation/quality options, interior-fill selection/provenance/body boundaries, sealed-ledger writes, loaded-fill comparison pages and selection capture. Reviewed associated negative-test logic and the historical staging receipt projection. No test result was inferred merely from the existence of a test.
- Refreshed the TypeScript AST import graph from `src/main.ts`, `src/gallery/gallery.ts` and `src/vehicles/fleetFactory.ts`, following static imports/re-exports and literal dynamic imports. It found **zero reachable tool modules, zero eager new profile modules, zero unresolved relative imports and zero unknown dynamic imports**. Reachable/eager counts are respectively 1,075/331, 630/143 and 612/125. Package internals are outside that traversal.
- Enumerated every current status path, recomputed hashes, checked symlinks/forbidden output paths and PNG signatures, and compared the previous closure/integration inventories. Checked that all **63 changed selftests** appear in the shared suite manifest. The Git index remained empty.

Private evidence: `.qa-dev/tank-run/publication-review/path-inventory.json` and `runtime-import-graph.json`. Earlier inventories remain unchanged at `.qa-dev/tank-run/proposed-staging-paths-closure-88592876.json` and `.qa-dev/tank-run/final-corrections/qualification/staging-inventory.json`.

## Publication boundaries

The 1,054-path snapshot contains 134 `src` paths, 55 `tools` paths, 109 documentation paths, 755 public paths and README. It contains **no GLB/GLTF/OBJ/FBX/ZIP, private QA output, shot directory, build directory, dependency directory, log or symlink**. No model binary is tracked. The comparison directory remains ignored; the unchanged public postbuild stripping step removes that directory. Runtime source filenames/hashes occur as inert provenance fields in the three scalar-study modules, not as loader arguments or mesh payloads. The runtime graph cannot reach the source replay or comparison loaders.

The PNG inventory includes the explicitly required **660 technical diagrams for 220 keyed vehicles**. Nontechnical changed PNGs and WebP portraits are limited to the thirteen supplied fleet IDs. No malformed PNG signature was found. The only changed public paths outside icons are the LLM documentation files and `site.webmanifest`. The all-fleet technical refresh therefore has a documented generation purpose; this review does not approve arbitrary unrelated asset edits.

Source replay is confined to `tools/source-assembly-replay.mjs`: original, recipe, selectors and output are hash-bound; rigid whole-node moves preserve binary chunks; component operations preserve nonselected expanded attributes; the registered output must be ignored and an existing different output is rejected. It is not imported by playable code. Packed runtime fills are admitted only by the literal box-span grammar in `tools/native-interior-fill-policy.mjs`; other opaque payloads still fail provenance checks.

## Gate and shared-change review

The numerical source floor remains 92 for these exemplar registrations; the preservation exemption is explicitly rejected for them. Source-only camera/framing and authenticated assembly transforms remain separate from native geometry. Approved equipment counts require the exact original-source hash and actual visible fitting stock. Approved openings retain every raw raster cell, validate its exact coordinates, require complete source/native air and held-out finite stock witnesses, and fail missing or malformed evidence. Unregistered openings still require zero cells.

Strict track refinement retains raw voxel counts and admits only complete closed-component separation with noncontainment witnesses; uncertain/open/touching stock retains failure. It does not exempt moving shoes. Rough-terrain limits remain 3 mm cut, 30 mm steady daylight and 30 mm minimum travel. The shadow budget remains 120 triangles per part, 320 total and more than eightfold measured caster-work reduction; the sparse-support triangle count is no longer misrepresented as actual draw workload. The counter and the metadata-only shadow sources do not alter native visible stock.

Shared runtime changes remain bounded: wheel-paint lighting uses its explicit material define, fixed rubber/steel clones clear it, shoe colors avoid a second multiplier, additional wheel layers receive initial instance seats, and missing-side track relays retain their existing contact result. Fixed missile canisters preserve explicit firing axes without cannon decorations/recoil. Short recoiling barrels require verified physical bore stock; legacy tubes retain their existing length heuristic. These are code-review observations, not a new GPU/performance verdict.

## Required final handoff

The 22:47 UTC staging inventory is stale: this snapshot found three new review documents and 36 changed hashes, primarily regenerated assets/anchors plus the ledger and CV90 packet. Those changes are consistent with the ongoing integration, but the root must refresh its explicit path/hash manifest after the final generation and visual decision. This review document is itself one additional later path. No whole-tree staging is recommended.

Final filled geometry, every required independent view, production assets, composed release, full tests/type checking/builds and publish-time Git state remain the integrator's responsibility. This review adds no threshold waiver and makes no claim that the outstanding visual diagnosis has passed.
