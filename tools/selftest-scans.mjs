// What each listing module lists (2026-10-20, after 228p). A receipt that walks a tree reads every file in it, not only
// the files it imports: src/ui/runtimeStyles.selftest.mjs lists all of src, so mediaLibrary.ts's new static CSS import
// broke it, while the 228p selection (the receipts whose closures named a changed file) never ran it: its only match
// was the cache's broad fallback (SELFTEST_BROAD_DIRS), which a selection cannot tell from a real read.
//
// Every module a registered receipt runs (its imports, and the tools a child-process user names) that lists a
// directory of this checkout (readdir, opendir, glob, git ls-files / grep / a name-only diff) has one entry here,
// keyed by its repository path. tools/selftest-scans.selftest.mjs fails on an undeclared listing module, a stale entry
// and a pattern that matches nothing. Patterns use the --only glob syntax (tools/selftest-schedule.mjs).
//
// - `lists`: the checkout paths it lists. Every receipt that runs the module is keyed on every matching file
//   (tools/selftest-cache.mjs closureOf) and is selected by a change to any path the patterns match, deleted ones
//   included (run-selftests.mjs selftestPlan `scanBy`). A pattern starts at a named directory or stays at one level
//   (`*.html`): never `**` from the root.
// - `tracked`: paths it reads through git's index. Git state makes the receipt live (never keyed), so these only
//   select it; a keyed receipt (fixtureKeyed) may not inherit them.
// - `outside`: it lists only directories outside this checkout's sources (tmp fixtures, lock queues, build output,
//   .qa-dev, the proof store); the reason says which. Nothing is inherited.
// - `caller`: a library that lists what its caller passes; the reason names the parameter. Every module that imports
//   or spawns it declares its own entry, so the obligation moves to the module that knows the path.
// - `identity`: it hashes a tree into a provenance record (a report's source digest); no verdict depends on which
//   files it lists. Nothing is inherited.
// - `cli`: the listing runs only when the module is started as a command (or in the fixture repository a receipt
//   starts it in); the receipts that reach it import its functions. Nothing is inherited.
// - `none`: it runs a `caller` library without listing anything through it (a constant, a fixture's root).
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { globToRegExp } from './selftest-schedule.mjs';

/** The literal directory a pattern starts from ('' for the checkout's root). */
export function scanPatternBase(pattern) {
  const segments = pattern.split('/');
  const literal = [];
  for (const segment of segments.slice(0, -1)) {
    if (/[*?{]/.test(segment)) break;
    literal.push(segment);
  }
  return literal.join('/');
}

/** A pattern that walks the whole checkout from its root (shots/, public/models): never a `lists` pattern. */
export const scanPatternFromRoot = pattern => scanPatternBase(pattern) === '' && pattern.includes('**');

const patternRegExps = new Map();
/** A scan pattern as a RegExp over repository-relative paths ('/' separators). */
export function scanPatternRegExp(pattern) {
  if (!patternRegExps.has(pattern)) patternRegExps.set(pattern, globToRegExp(pattern));
  return patternRegExps.get(pattern);
}

const lists = (...patterns) => Object.freeze({ lists: Object.freeze(patterns) });
const tracked = (...patterns) => Object.freeze({ tracked: Object.freeze(patterns) });
const outside = (reason) => Object.freeze({ outside: reason });
const caller = (reason) => Object.freeze({ caller: reason });
const identity = (reason) => Object.freeze({ identity: reason });
const cli = (reason) => Object.freeze({ cli: reason });
const none = (reason) => Object.freeze({ none: reason });

export const SELFTEST_SCANS = Object.freeze({
  // ---- receipts and helpers that list this checkout's sources
  'server/collisionManifestIndex.selftest.mjs': lists('server/world-collision-manifests/*.json'),
  'server/collisionManifestRoutes.selftest.mjs': lists('server/world-collision-manifests-228/*.json', 'src/**/*.{ts,mjs,js}',
    'server/**/*.{ts,mjs,js}'),
  'server/dedicatedWorldCollision.selftest.mjs': lists('server/world-collision-manifests/*.json'),
  'src/audio/audioEngine.selftest.mjs': lists('src/mp/**/*.{ts,mjs}', 'src/sim/**/*.{ts,mjs}', 'server/**/*.{ts,mjs}'),
  'src/audio/soundAssets.selftest.mjs': lists('src/audio/*.ts'),
  'src/audio/voiceTriggers.selftest.mjs': lists('src/audio/*.ts'),
  'src/docs/filming.selftest.mjs': lists('public/media/filming-r1/*'),
  'src/engine/shadowCascadeFade.selftest.mjs': lists('src/**/*.ts'),
  'src/fx/retiredTracers.selftest.mjs': lists('src/**/*.{ts,mjs,js,md,json,html,css}', 'tools/**/*.{ts,mjs,js,md,json,html,css}',
    'docs/**/*.{ts,mjs,js,md,json,html,css}'),
  // (264, premiere-battle) every source module, for a function key acted on with no row or a synthetic KeyboardEvent
  'src/game/keybindingCensus.selftest.mjs': lists('src/**/*.{ts,mjs,js}'),
  'src/mp/host/hostStandby.selftest.mjs': lists('server/world-collision-manifests/*.json'),
  'src/mp/host/worldCollision.selftest.mjs': lists('server/world-collision-manifests/*.json'),
  'src/mp/host/worldCollisionMobileTier.selftest.mjs': lists('server/world-collision-manifests/*.json'),
  'src/mp/room/roomWorkerProgram.selftest.mjs': lists('cloudflare/rooms/src/*.ts'),
  'src/mp/room/roomSizeRules.selftest.mjs': lists('cloudflare/rooms/src/*.ts'),
  'src/techTree/techTree.selftest.mjs': lists('src/techTree/*.ts', 'src/techTree/nations/*'),
  'src/ui/tokens/modeColours.selftest.mjs': lists('src/**/*.css', 'src/**/*.ts', 'src/**/*.mjs', 'src/**/*.html'),
  // item 259: every source, for a Settings category hue written outside the token files
  'src/ui/tokens/settingsColours.selftest.mjs': lists('src/**/*.css', 'src/**/*.ts', 'src/**/*.mjs', 'src/**/*.html'),
  // 261: every source, for another sheet loading the manual's print sheet
  'src/docs/docsPrint.selftest.mjs': lists('src/**/*.css', 'src/**/*.ts', 'src/**/*.html', 'index.html'),
  // 261: every source, for a badge hue written outside the token files
  'src/ui/tokens/badgeColours.selftest.mjs': lists('src/**/*.css', 'src/**/*.ts', 'src/**/*.mjs', 'src/**/*.html'),
  // one selected state (interaction-picker-254 a311036509): every sheet and module under src/ui and src/presentation
  'src/ui/components/components.selftest.mjs': lists('src/ui/**/*.{css,ts}', 'src/presentation/**/*.{css,ts}'),
  'src/ui/droneReturningCascade.selftest.mjs': lists('src/ui/*.css'),
  'src/ui/garageDisplayAtlas.selftest.mjs': lists('src/ui/garage*.ts', 'src/game/garage*.ts'),
  'src/ui/i18n.selftest.mjs': lists('*.html'),
  'src/ui/loadingSurfaceRegistry.selftest.mjs': lists('src/**/*.css', 'src/**/*.ts'),
  'src/ui/components/loadFailure.selftest.mjs': lists('src/**/*.ts'),
  'src/ui/icons.selftest.mjs': lists('public/icons/*_angle.webp', 'public/icons/thumbs/*_angle.webp'),
  'src/ui/mapBackdrop.selftest.mjs': lists('public/maps/cards/*.webp'),
  'src/ui/mapLqip.selftest.mjs': lists('src/**/*.{ts,mts,js,mjs}'),
  // 228p: mediaLibrary.ts's static CSS import was a red no import-closure selection could find
  'src/ui/runtimeStyles.selftest.mjs': lists('src/**/*.ts'),
  // 253 (UI-LOCKDOWN C): every module and static page, for a datum marked outside its owners
  'src/ui/surfaceRegistry.selftest.mjs': lists('src/**/*.{ts,html}', 'site/**/*.html'),
  // (261) every surface the source opens and every dialog it shows: the TypeScript under src
  'src/ui/transientSurfaceRegistry.selftest.mjs': lists('src/**/*.ts'),
  // 255 (triangle 253 item A): every shipped diagram label sidecar's colours name a tone
  'src/ui/technicalDiagramLabels.selftest.mjs': lists('public/icons/*_technical.json'),
  // drawings-overhaul-259: the fleet's technical drawings (COT_DRAWINGS_DIR for a review run lists that folder instead)
  'src/ui/technicalDrawing.selftest.mjs': lists('public/icons/*_drawing.json'),
  // release 230 type package: the shipped faces, every shipped source and document, and no Monument font file anywhere
  'src/ui/typeSystem.selftest.mjs': lists('public/**/*.{woff2,woff,ttf,otf}', 'tools/**/*.{woff2,woff,ttf,otf}',
    'src/**/*.{ts,css,js,mjs}', 'site/**/*.html', 'tools/fixtures/*.html'),
  // (UI-LOCKDOWN A) every source's canvases and canvas text, and every page's canvases
  'src/ui/uiCanvasCensus.selftest.mjs': lists('src/**/*.ts', 'site/*.html'),
  'src/ui/vehicleControlOrder.selftest.mjs': lists('src/ui/*.css'),
  'src/vehicles/camouflageRuntime.selftest.mjs': lists('src/sim/*.ts'),
  'src/vehicles/combatAnatomyAudit.test-support.mjs': lists('src/vehicles/**/*.js'),
  'src/vehicles/trackPatterns.selftest.mjs': lists('src/vehicles/**/*.js'),
  'src/vehicles/vehicleMaterialRawClone.selftest.mjs': lists('src/{app,engine,fx,game,mp,ui,vehicles,world}/**/*.ts'),
  'src/vehicles/weaponFinish.selftest.mjs': lists('src/vehicles/profiles/*.ts'),
  'src/world/civic/civicPlans.selftest.mjs': lists('src/world/civic/*.ts'),
  'tools/deployment-policy.selftest.mjs': lists('api/*.ts'),
  'tools/gate.mjs': lists('cloudflare/*/package.json'),
  'tools/gen-interior-fills.mjs': lists('src/vehicles/interiorFillGroups/*.generated.ts'),
  // 230 (tank hero icons v5): the stray-file and directory-budget checks list the hero directory
  'tools/hero-cards-check.mjs': lists('public/icons/hero/*'),
  'tools/hot-path-alloc.mjs': lists('src/**/*.ts'),
  'tools/i18n-scan.mjs': lists('src/**/*.{ts,tsx,js,mjs,cjs,html}'),
  'tools/id-list.selftest.mjs': lists('tools/*.mjs'),
  // 256 (owner: "no more object containns"): every module, sheet and page, for a contain fit or an unfocused cover
  'tools/image-fit-lint.mjs': lists('src/**/*.{ts,css}', 'site/**/*.html'),
  // 254 (interaction census, part D): every module and static page, for a choose-one built outside the picker
  'tools/interaction-census.mjs': lists('src/**/*.ts', 'site/**/*.html'),
  // 230 (foliage-shadow-sites-228): every virtual: import under src resolves through the probe server's plugins
  'tools/map-probe-runtime.selftest.mjs': lists('src/**/*'),
  'tools/marketing-shots/battle-campaign.selftest.mjs': lists('tools/marketing-shots/scenes-action-r3/*.json',
    'tools/marketing-shots/scenes-foreground-r3/*.json'),
  'tools/marketing-shots/versus-media.selftest.mjs': lists('public/media/versus-r*/*'),
  'tools/media-r5/films/restore.mjs': lists('tools/media-r5/films/**'),
  'tools/media-r5/films/restore.selftest.mjs': lists('tools/media-r5/films/**'),
  'tools/media-r5/fleet-media.selftest.mjs': lists('public/media/site50-r14/fleet/*'),
  'tools/media-r5/motion-type.selftest.mjs': lists('tools/media-r5/**/*.{mjs,json,md}'),
  'tools/native-interior-fill-policy.selftest.mjs': lists('src/vehicles/interiorFillGroups/*.generated.ts'),
  'tools/spare-track-placement-check.mjs': lists('src/vehicles/profiles/*.ts'),
  'tools/vercel-config.selftest.mjs': lists('api/*.ts'),
  'tools/viteGlslMinify.selftest.mjs': lists('src/**/*.ts'),
  'vite.config.ts': lists('server/world-collision-manifests/*.json', 'server/world-collision-manifests-228/*.json'),

  // 248 (selftest-scans hygiene): listings the receipts gained in 240-247
  // the Watch seat ledger never reaches the network: every src/mp module is read
  'src/game/watchTakeover.selftest.mjs': lists('src/mp/**/*.ts'),
  // every icon() id in the sources is drawn by the sprite
  'src/ui/icons/icon.selftest.mjs': lists('src/**/*.ts'),
  // the cascade layers of every sheet, document and source that injects styles
  'src/ui/styleLayers.selftest.mjs': lists('src/**/*.{css,ts,mts}', 'public/**/*.css', 'site/**/*.html', 'tools/fixtures/**/*.html'),
  // nothing outside the token package reads a colour ramp or redefines a legacy alias
  'src/ui/tokens/tokens.selftest.mjs': lists('src/**/*.{css,ts,html}', 'site/**/*.{css,ts,html}', 'public/*.css'),
  'src/vehicles/workingPintleCradle.selftest.mjs': lists('src/**/*.ts'),
  // one row per exported kit style; no module but the registries loads a kit lazily
  'src/world/kitRegistry.selftest.mjs': lists('src/world/maps/regional/*.ts', 'src/**/*.ts'),
  // documentSources: the HTML entries the build emits
  'tools/contentSecurityPolicy.mjs': lists('site/*.html'),
  // repositoryShapeFailures: the root and site documents and every source
  'tools/i18n-catalog-shape.mjs': lists('*.html', 'site/**/*.html', 'src/**/*.ts'),
  // scopeFiles: the UI, Gallery and Studio sources and every sheet
  'tools/i18n-literal-lint.mjs': lists('src/ui/**/*.ts', 'src/gallery/**/*.ts', 'src/game/**/*.ts', 'src/**/*.css'),
  // every media reference in the pages and sources against the collections on disk
  'tools/media-freshness.selftest.mjs': lists('src/**', 'site/*.html', 'public/media/*'),
  // publicPages: the game, the 404 and every page under site/
  'tools/media-page-scan.mjs': lists('site/*.html'),
  // lintFiles: the sources, the public sheets and the site documents
  'tools/motion-lint.mjs': lists('src/**/*.{css,ts,mts}', 'public/**/*.css', 'site/**/*.html'),
  // censusFiles: the sources, the public sheets and the site documents
  'tools/style-literal-census.mjs': lists('src/**/*.{css,ts,mts}', 'public/**/*.css', 'site/**/*.html'),
  'tools/viteCssInTsMinify.selftest.mjs': lists('src/**/*.ts'),

  // ---- git's index (live receipts: selection only)
  // the scene-link codec round-trips every tracked take; its sink audit reads the Studio's own sources
  'src/game/studioSceneShare.selftest.mjs': tracked('**/*.scene.json', 'src/game/studio*.ts', 'src/ui/studio*.ts'),
  'src/presentation/analytics.selftest.mjs': tracked('src/**', '**/*.html'),
  'src/ui/garageFleetTake.selftest.mjs': tracked('src/**/*.ts'),
  'src/ui/i18nChunkImport.selftest.mjs': tracked('**/*.{ts,mts,mjs,js,cjs,html}'),
  'src/ui/i18nLazyCatalog.selftest.mjs': tracked('src/**/*.ts'),
  'src/vehicles/vehicleNightLighting.selftest.mjs': tracked('src/vehicles/**'),
  'tools/attribution-audit.mjs': tracked('**'),
  'tools/browser-launch-census.selftest.mjs': tracked('{api,scripts,server,src,tools}/**'),
  'tools/local-import-integrity.selftest.mjs': tracked('{api,server,src,tools}/**'),
  'tools/object3d-assert-lint.mjs': tracked('**/*.selftest.mjs', '**/*.test-support.mjs'),
  'tools/public-repo-hygiene.selftest.mjs': tracked('**'),
  'tools/selftest-suites.selftest.mjs': tracked('**/*.selftest.mjs'),
  'tools/tool-only-public-files.selftest.mjs': tracked('src/**', 'site/**', 'api/**', 'cloudflare/rooms/src/**',
    'cloudflare/telemetry/src/**', 'middleware.ts', 'index.html', '404.html', 'vercel.json', 'public/site.webmanifest'),
  'tools/worker-generated-types.selftest.mjs': tracked('cloudflare/*/worker-configuration.d.ts'),
  // every release handler in the shell is a hold action or a named non-hold (git grep)
  'src/game/inputHoldToggle.selftest.mjs': tracked('src/ui/**', 'src/game/**', 'src/app/**', 'src/main.ts'),
  // element colour resets outside @layer base (git ls-files of the tracked sheets)
  'tools/surface-element-resets.selftest.mjs': tracked('src/**/*.css'),

  // the import graphs of real receipts (closureOf on this checkout) beside its fixture repository
  'tools/selftest-cache.selftest.mjs': lists('src/**/*.{ts,mts,mjs,js,json}', 'tools/**/*.{ts,mts,mjs,js,json}'),
  // the changed-only fleet partition of this checkout: every module a fleet step's closure can reach (the guards-229
  // red: a new tool in a step closure broke it, and no closure named the new file)
  'tools/changed-only/fleet-partition.selftest.mjs': lists('src/**/*.{ts,mts,mjs,js,json}', 'tools/**/*.{ts,mts,mjs,js,json}'),
  // computeState of this checkout against release/fingerprints.tsv (live: it reads the manifest no closure holds)
  'tools/changed-only/fresh.selftest.mjs': lists('src/**/*.{ts,mts,mjs,js,json}', 'tools/**/*.{ts,mts,mjs,js,json}'),

  // this table's census: every module a registered receipt runs (and the fixture repository it writes under tmpdir)
  'tools/selftest-scans.selftest.mjs': lists('src/**/*.{ts,mts,mjs,js,cjs}', 'tools/**/*.{ts,mts,mjs,js,cjs}',
    'server/**/*.{ts,mts,mjs,js,cjs}', 'scripts/**/*.{ts,mts,mjs,js,cjs}', 'cloudflare/**/*.{ts,mts,mjs,js,cjs}',
    'api/**/*.{ts,mts,mjs,js,cjs}', '*.{ts,mts,mjs,js,cjs}'),

  // ---- libraries that list what their caller passes
  'tools/changed-only/fingerprint.mjs': caller('computeState({ root }): the fleet steps\' closures and tables under root'),
  'tools/changed-only/rows-child.mjs': caller("the data modules under the root its spawner passes (argv[2])"),
  'tools/changed-only/world.mjs': caller('computeWorldState(ctx): the world steps\' closures under ctx.root'),
  'tools/frontend-budget.mjs': caller('collect({ nav, click }): the recorded run folders its caller names'),
  'tools/run-selftests.mjs': caller('selftestPlan and selftestReadOf read the closures of the cache their caller passes; ' +
    'the CLI lists the registry over this checkout'),
  'tools/changed-only/globs.mjs': caller('walk(base, dir): the changed-only regeneration globs over the root it is given'),
  'tools/changed-only/graph.mjs': caller('the changed-only import graph walks the directories a traced closure names'),
  'tools/selftest-cache.mjs': caller("closureOf: the directories a receipt's closure names, its declared fixture patterns " +
    'and the patterns of this table, under the root its caller gives'),
  'tools/shared-main-preflight.mjs': caller('git diff --name-only between the two commits its caller names'),

  // ---- only outside this checkout's sources
  'tools/capture-lock.mjs': outside('the capture queue directory (tmpdir, or the queueDir its caller passes)'),
  'tools/capture-lock.selftest.mjs': outside('its own queue directories under tmpdir'),
  'tools/frontend-budget.selftest.mjs': outside('its fixture runs under tmpdir'),
  'tools/run-selftests.selftest.mjs': outside('the fixture repositories its caches and runner children work in, under tmpdir'),
  'tools/changed-only/resolver.selftest.mjs': outside('its declared fixture repository (SELFTEST_DECLARED_INPUTS)'),
  'tools/changed-only/world.selftest.mjs': outside('its declared fixture repository (SELFTEST_DECLARED_INPUTS)'),
  'tools/selftest-cache-dir.selftest.mjs': outside('the fixture repositories it creates under tmpdir'),
  'tools/shared-main-preflight.selftest.mjs': outside('the fixture repositories it creates under tmpdir'),
  'tools/changed-only/chain.selftest.mjs': outside("the fixture repository's .qa-dev/changed-only summaries under tmpdir"),
  'tools/frame-budget-probe.mjs': outside('the capture queue and the slot-record directories its CLI writes under .qa-dev'),
  'tools/mp-p2p-peer.selftest.mjs': outside('dist/, a finished build, when this checkout has one'),
  'tools/release.selftest.mjs': outside('the asset directories of the release fixtures it writes under tmpdir'),
  'tools/selftest-schedule.mjs': outside("the proof store's run-time records (the cache directory outside the checkout)"),
  'tools/tool-only-public-files.mjs': outside('a build output directory (dist/) its caller names'),
  'tools/vercel-output-immutable.mjs': outside('the .vercel/output tree (or a tmpdir fixture) its caller names'),
  'tools/visual-census-lock.mjs': outside('the visual-census queue directory its caller names'),
  'tools/visual-census.selftest.mjs': outside('its own queue directories under tmpdir'),
  'tools/viteSharedWorkers.selftest.mjs': outside('the build it writes into its tmpdir fixture'),
  'tools/contentSecurityPolicy.selftest.mjs': outside('dist/, a finished build, when this checkout has one'),
  'tools/mode-aggression-harness.mjs': outside('the run directories its report and compare commands name (--dir, --base): ' +
    'its .qa-dev records, or the receipt\'s tmpdir fixtures'),
  'tools/battle-spike-census.mjs': outside('the census folder its CLI writes (--out, under .qa-dev) and the tmpdir fixtures its receipts judge'),
  'tools/battle-spike-budget.mjs': outside('the census folder it judges (--out under .qa-dev, or the selftest\'s tmpdir fixture)'),
  'tools/vercel-static-preview.mjs': outside('the build output it serves (dist/, or the fixture dist its caller passes)'),

  // ---- source digests for provenance records: no verdict depends on what they list
  'tools/appVersion.ts': identity("git status --porcelain: the version string's dirty mark"),
  'tools/base-shell-audit-inputs.mjs': identity("baseShellInputFingerprint: an audit report's input digest (its receipt hashes a fixture)"),
  'tools/first-party-concept-check.mjs': identity("runtimeDigest: the concept report's source digest"),
  'tools/media-production/pipeline.mjs': identity("sourceDigest: a capture batch's source digest, compared by the publish CLIs"),
  'tools/photo-reference-check.mjs': identity("digest: the photo-reference report's source digest"),
  'tools/props-build-profile.mjs': identity("sourceIdentity: the build profile's source identity"),
  'tools/suspension-strip-probe.mjs': identity("git status --porcelain: the probe record's dirty flag"),
  'tools/visual-census.mjs': identity("git status --porcelain: the census record's dirty game paths"),
  'tools/world-residency-probe.mjs': identity("sourceFingerprint: the residency record's source digest (git ls-files src)"),
  'tools/wreck-build-profile.mjs': identity("identity: the wreck build profile's pinned source identity"),
  'tools/wreck-paint-bench.mjs': identity("sourceTreeIdentity: the bench record's source identity"),

  // ---- the listing runs only when the module is started as a command; receipts import its functions or run it in a
  // fixture repository
  'tools/code-quality-metrics.ts': cli('trackedRuntimeFiles (git ls-files) runs from the CLI; its receipt analyzes fixture text'),
  'tools/frame-capture-compare.mjs': cli('run() lists the capture directory its CLI names'),
  'tools/interior-fill-exposure.mjs': cli('--lane diffs its own inputs against the base (git diff --name-only) only when started as ' +
    'a command; its receipt imports laneScope and fillExposure, and gate.selftest only names the command'),
  'tools/media-r5/combat-check.mjs': cli('lists the scenes directory its CLI names; combat.selftest imports combatVerdict'),
  'tools/qa-evidence-manifest.mjs': cli('lists the evidence roots its CLI names (.qa-dev, .qa-bots, shots, ...)'),
  'tools/release.mjs': cli('the release CLI lists cloudflare/* Workers, .vercel env files and its tree\'s git status; ' +
    'release.selftest drives its planners on tmpdir fixtures'),
  'tools/sourced-image-composition-probe.mjs': cli('the acquisition CLI checks git diff/ls-files of src before a capture; ' +
    'its receipts import the option and plan helpers'),
  'tools/tank-id-codemod.mjs': cli('a codemod over the repository it is started in; its receipt starts it in a fixture repository'),
  'tools/tank-id-codemod.selftest.mjs': outside('the fixture repository it creates under tmpdir'),
  'tools/tank-id-move-files.mjs': cli('moves files in the repository it is started in; its receipts start it in a fixture repository'),
  'tools/tank-id-move-files.selftest.mjs': outside('the fixture repository it creates under tmpdir'),
  'tools/tank-id-rename-table.mjs': cli('scanUsage (git ls-files) runs from the CLI; its receipt imports the planners'),
  'tools/tank-world-contact-census.mjs': cli('reads the census output directories its CLI names'),
  'tools/tank-regen-changed.mjs': cli('npm run tank:regen:changed fingerprints this checkout; the chain receipt runs it on its ' +
    'declared fixture repository'),
  'tools/pr-census.mjs': cli('report() lists the record directory --report names; its receipt imports the census helpers'),

  // ---- import a caller-directed lister for a constant
  'tools/gate.selftest.mjs': none('REPO_ROOT from selftest-cache.mjs; its gate runs list through tools/gate.mjs (above)'),
  'tools/selftest-cache-dir.mjs': none("defaultSelftestCacheDir and sha1: the proof store's name"),
  'tools/selftest-schedule.selftest.mjs': none('sha1 from selftest-cache.mjs'),
  // 266 tiers: the tiers receipt reads the workflow files (no CI runs a receipt suite) and its own closure; the lane,
  // recommend and heavy commands list the diff and the closures only when they run as commands
  'tools/selftest-tiers.selftest.mjs': lists('.github/workflows/*'),
  'tools/test-audit.mjs': none('MAX_SELFTEST_WORKERS and the barrier lists from run-selftests.mjs, for the schedule replay'),
  'tools/test-diff.mjs': cli('changedPaths lists the diff and fleetPartition runs computeState only when test:lane or test:recommend run as commands; the tiers receipt imports its pure helpers'),
  'tools/test-heavy.mjs': cli('npm run test:heavy reads the id-scoped closures; the tiers receipt imports idScopedSelection'),
  'tools/changed-only/table.mjs': none("DEFAULT_CONFIG from fingerprint.mjs: a step table's defaults"),
  'tools/selftest-cpu-pool.selftest.mjs': none('the runner\'s pool helpers from run-selftests.mjs, driven with fake children'),  'tools/destruction-slab-kinds.selftest.mjs': none('inputKey of the destruction sources it names (CODE) and of ' +
    'tools/destruction-slab-check.mjs from selftest-cache.mjs: the closures of fixed files, for its pass fingerprint and its maps\' listings'),
});

const KINDS = ['lists', 'tracked', 'caller', 'outside', 'identity', 'cli', 'none'];
/** The declaration's one kind, or null when it has none or several. */
export function scanKind(declaration) {
  const kinds = KINDS.filter((kind) => Object.hasOwn(declaration ?? {}, kind));
  return kinds.length === 1 ? kinds[0] : null;
}

/**
 * The listing census of the registered receipts (selftest-scans.selftest runs it on the real registry): each listing
 * module their run sets reach, each problem with this table, and who inherits what. `cache` is a selftest cache
 * (tools/selftest-cache.mjs); declared-inputs receipts run on their fixtures only and inherit nothing.
 */
export function scanCensus(cache, receipts, { root, scans = SELFTEST_SCANS, declared = {} } = {}) {
  const problems = [], reached = new Map(), inheriting = { lists: 0, tracked: 0 };
  const rel = (file) => relative(root, file).split(sep).join('/');
  const listingsOf = (path) => cache.metadataOf(resolve(root, path))?.scans ?? [];
  for (const receipt of receipts) {
    if (Object.hasOwn(declared, receipt)) continue;
    const file = resolve(root, receipt);
    for (const module of cache.runSetOf(file)) {
      const path = rel(module);
      if (!reached.has(path)) reached.set(path, new Set());
      reached.get(path).add(receipt);
    }
    const { lists, tracked } = cache.scanOf(file);
    if (lists.length) inheriting.lists++;
    if (tracked.length) inheriting.tracked++;
    if (tracked.length && !cache.liveReason(receipt)) {
      problems.push(`${receipt}: a keyed receipt inherits tracked listings (${tracked.join(', ')}); git state never keys a proof`);
    }
  }
  const runsCaller = (path) => cache.runEdgesOf(resolve(root, path)).map(rel).filter((target) => scanKind(scans[target]) === 'caller');
  for (const [path, by] of reached) {
    if (Object.hasOwn(scans, path)) continue;
    const listings = listingsOf(path), callers = runsCaller(path);
    const runBy = `run by ${[...by].slice(0, 3).join(', ')}${by.size > 3 ? ` and ${by.size - 3} more` : ''}`;
    if (listings.length) {
      problems.push(`${path}: lists (${listings.map((listing) => `${listing.call} at line ${listing.line}`).join(', ')}) and has no `
        + `entry in tools/selftest-scans.mjs (${runBy})`);
    }
    for (const target of callers) problems.push(`${path}: runs ${target}, which lists what its caller passes, and declares nothing (${runBy})`);
  }
  for (const [path, declaration] of Object.entries(scans)) {
    const kind = scanKind(declaration);
    if (!kind) { problems.push(`${path}: one of ${KINDS.join(', ')} per entry`); continue; }
    if (!reached.has(path)) { problems.push(`${path}: no registered receipt runs it (a stale entry)`); continue; }
    if (!listingsOf(path).length && !runsCaller(path).length) problems.push(`${path}: lists nothing and runs no caller-directed lister (a stale entry)`);
    const patterns = declaration.lists ?? declaration.tracked;
    if (patterns) {
      if (!patterns.length) problems.push(`${path}: an empty pattern list`);
      for (const pattern of patterns) {
        try { scanPatternRegExp(pattern); } catch (error) { problems.push(`${path}: ${error.message}`); }
      }
    } else if (typeof declaration[kind] !== 'string' || !declaration[kind].trim()) problems.push(`${path}: ${kind} needs its reason`);
    // a pattern may match nothing (trackPatterns watches for .js files that must not exist); its directory must exist
    for (const pattern of declaration.lists ?? []) {
      if (scanPatternFromRoot(pattern)) problems.push(`${path}: '${pattern}' walks the checkout from its root; start it at a directory`);
      else if (!existsSync(join(root, scanPatternBase(pattern)))) problems.push(`${path}: '${pattern}': ${scanPatternBase(pattern)} is gone`);
    }
  }
  const kinds = Object.fromEntries(KINDS.map((kind) => [kind, Object.values(scans).filter((declaration) => scanKind(declaration) === kind).length]));
  return { problems, reached, kinds, inheriting };
}
