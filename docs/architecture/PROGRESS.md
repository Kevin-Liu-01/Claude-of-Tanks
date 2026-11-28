# Architecture governance progress

One entry per round: what was found, what changed, the checks run and what the pin now holds. The task pool is
[BACKLOG.md](BACKLOG.md); the map is [MAP.md](MAP.md).

## Round 1: arch-1, one import reader and the module-boundaries receipt (2026-11-27)

- Base: origin/main b6c100411f (release 278 live). Release 279 integrating; this round touches only tools/ and docs/,
  none of them in integ/279's diff.
- Phase 1 maps: MAP.md (layers, dependency graph, state ownership, duplicates, technical solutions, standards), the
  task pool, ADR 0001. Four read-only surveys (UI, network and contracts, domain, infrastructure) fed the duplicate
  lists.
- Change: `tools/static-import-closure.mjs` is the one import reader (`importEdgesOf`, `moduleImportEdges`,
  `resolveImportSpecifier`, `parseModule`). Migrated `driver-boundaries.mjs`, `i18n-page-catalogs.mjs`,
  `bundle-budget.mjs` (and its receipt), `local-import-integrity.selftest.mjs`, `src/mp/room/roomWorkerProgram.selftest.mjs`;
  deleted their resolvers and walkers (3 resolvers, 4 edge walkers). Added `tools/module-boundaries.mjs` with 5 layer rules and the cycle check, its pin
  (6 cycles, 60 layer edges) and its receipt (seeded cycle, layer, stale-pin, unresolved and resolver violations).
- Behaviour: no runtime file changed. The canonical resolver resolves a directory specifier to its `index.ts` where two
  old copies returned the directory; no import in the tree names a directory, so every caller's result is unchanged.
- Pin after: 6 cycles; layer edges 60 (foundation 52, online driver 7, services 1); 3 pinned resolvers.
- Found while merging with integ/279: its Field Manual chapters import `tools/media-files.mjs`. The chapters are
  build-time generators, so the rules name them as such (`BUILD_TIME`) instead of pinning: they may use tools, and a
  fifth rule keeps shipped code from importing them. Checked on a scratch merge of this commit into integ/279.
- The repository hygiene receipt forbids a file named `TASKS.md` (transient task notes), so the pool is `BACKLOG.md`.
- Independent review: no code defect; every migrated caller gives identical results on all 6,737 tracked files, and the
  cycle finder matches an independent Kosaraju pass. Its findings, all taken: MAP.md's counts; a seventh resolver (the
  rooms Worker program receipt, now on the reader); test files counted as runtime and one shipped `.browser.ts` excluded
  (classification fixed, which also retires the test-oracle pin line); unresolved imports dropped silently (now reported);
  the services rule's `src/pad` exception written down.

## Round 2: arch-2, the telemetry schema leaf (2026-11-28)

- Base: arch-1 (5264d79b02), on origin/main b6c100411f. No file in integ/279's diff.
- Found: the page's beacon (`src/entry/telemetry.ts`) copied the record's schema version, timing and note limits and the
  stage-column list from `server/telemetryRecord.ts`, with nothing checking they matched; the render guard
  (`src/engine/blackWorldGuard.ts`) imported the services' 594-line validator for its record encoding, so the renderer
  bundled it. `src/entry` held only the beacon, which imports nothing, yet the layer rules filed it as composition.
- Options weighed: an equality receipt over the copies (keeps two definitions); moving the beacon out of `src/entry`
  (churn, no gain); one import-free schema leaf beside the beacon plus the encoding beside its only writer (chosen).
- Change: `src/entry/telemetrySchema.ts` (version, limits, stage slots), imported by the beacon and the record;
  `src/engine/blackWorldRecord.ts` (the encoding, moved whole), imported by the guard and the report tool. The beacon's
  receipt now pins "imports only its schema leaf, which imports nothing". `src/entry` is a layer-0 leaf with its own rule
  (`telemetry-beacon-is-a-leaf`).
- Behaviour: none. The record bytes are unchanged (same constants, same encoder); the renderer's bundle loses the
  validator.
- Pin after: 6 cycles; layer edges 56 (foundation 48, online driver 7, services 1).
- Independent review: no defect (the moved encoding is byte-identical; nothing still imports a moved name from the
  services' record). Taken: the services may import the schema but not the beacon itself (the services rule names
  `src/entry/telemetry.ts`); the inline boot watchdog in `index.html`, which cannot import, is held to the schema version
  by the beacon's receipt (a planted `v: 3` fails it).
- Checks: typecheck clean; test:lane 204 receipts, the one own red is the TEST-AUDIT regeneration for the integrator;
  `media-freshness` and `gpu-reset.browser` inherited, `changed-only/fresh` flaky.
