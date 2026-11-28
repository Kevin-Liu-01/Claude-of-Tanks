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
