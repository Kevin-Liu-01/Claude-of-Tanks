// lazyChunkSites.selftest.mjs — the lazy chunks the 2026-11-02 audit (R6, F2) named, and every hand-made memo that kept
// a failed chunk for the session, are held in app/lazyChunk.ts; no new chunk is memoized by hand (`x ??= import(...)`
// or `x = import(...)`, which keeps a rejection for the session, or a memo or latch cleared on failure, which asks again
// with no backoff, every frame for a caller that asks every frame); a default-policy load of several parts settles them
// all (importAll), so a module's failure never hides its stylesheet's; and every lazy stylesheet has one owner in each
// document, held where a failed sheet is never asked again (Vite's preload keeps one `seen` map for the document and
// never adds a failed sheet again, so a second owner, or an owner that asks again, would run its chunk unstyled).
// Copyright © 2026 Kevin B. Liu.
//
// The audit found at least five failure policies: cached forever (the interior fills, the deferred combat warm, the
// mission attachments, the turret ring, the HUD's aim notice, the prebuild latch), asked again from a nulled memo (the
// Garage's photo mode, facets, hotspots, Deploy pickers and fleet takes, the map placeholders, the camo swatches, the
// battle HUD bundle, the motion override, the Gallery's labs), and never asked again (the kit's openers). Each named
// site now holds its chunk in createLazyChunk (openers with `opener: true` and the kit's reload); the behaviour is
// proved in lazyChunk.selftest.mjs, builderLoadFailure.selftest.mjs and battleEntryLoadFailure.selftest.mjs, and the
// openers' reload in components/loadFailure.selftest.mjs. This reads the sources.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `source` with its comments blanked and its strings kept, every offset unchanged (the blanking
 *  components/loadFailure.selftest.mjs does, as one native pass: this reads every module of src/). */
const blankComments = (source) => source.replace(/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:\\[\s\S]|[^'\\])*'?|"(?:\\[\s\S]|[^"\\])*"?|`(?:\\[\s\S]|[^`\\])*`?/g,
  (part) => (part[0] === '/' ? part.replace(/[^\n]/g, ' ') : part));

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => blankComments(readFileSync(join(ROOT, file), 'utf8'));

// ---- the named sites: each holds its chunk in createLazyChunk, and its old hand-made state is gone
const SITES = [
  ['src/vehicles/interiorFills.ts', ['createLazyChunk('], [/\bpendingGroups\b/, /\bloadedGroups\b/]],
  ['src/vehicles/fleetFactory.ts', ['createLazyChunk(', "createLazyChunk(() => import('./ridingPartsPrebuild.ts'))", "createLazyChunk(() => import('./decorPlanClient.ts'))", 'isInteriorFillsReady(specId)'],
    [/\bridingPartsPrebuildAsked\b/, /\bfactoryReadyPromise\b/, /\bgroupPromises\b/]],
  ['src/vehicles/turretRingLoader.ts', ['createLazyChunk('], [/\bloading\s*\?\?=/]],
  ['src/app/combatWarmComposition.ts', ["createLazyChunk(() => import('../game/deferredCombatWarmRuntime.ts'))"], [/\bdeferredModule\s*\?\?=/]],
  ['src/game/battlePresentationRuntime.ts', ["createLazyChunk(() => import('./missionAttachmentVisual.ts')"], [/\bmissionAttachmentVisualLoad\b/]],
  ['src/ui/hud.ts', ["createLazyChunk(() => import('./battleNotices.ts')", "createLazyChunk(() => import('./provingRangeCard.ts')"],
    [/\baimNoticePort\s*\?\?=/, /\brangeCardLoad\b/]],
  ['src/ui/garage.ts', ["createLazyChunk(() => import('./fleetTakes.ts'))", '{ opener: true }', "createLazyChunk(() => import('./equipmentPreview.ts')",
    "createLazyChunk(() => import('./battleArrangementPanel.ts')", "createLazyChunk(() => importAll([import('./deploy.css'), import('./deployScreen.ts')])",
    "createLazyChunk(() => importAll([import('./modePicker.ts'), import('./pickerText.ts')])"],
    [/\bphotoMode\s*\?\?=/, /\bfacetPanel\s*\?\?=/, /\bhotspotsLoading\b/, /\bdeployFieldLoad\b/, /\bdeployModesLoad\b/, /\bquickLoad\b/,
      /\barrangementPanelLoad\b/, /\bequipmentPreviewLoad\b/, /\bdeployStyles\s*\?\?=/]],
  ['src/ui/battleLoad.ts', ["createLazyChunk(() => import('./mapLqip.ts')", 'heroCardChunk.load()'],
    [/\bmapLqipLoad\b/, /\bheroCards\s*\?\?=/, /(?<!typeof )import\('\.\/heroCard\.(?:ts|css)'\)/]],
  ['src/ui/camoSwatchAccess.ts', ['createLazyChunk(load)'], [/\bpending\s*=\s*null\b/]],
  ['src/ui/battleHudAccess.ts', ['createLazyChunk(() => importAll([', "importAll([import('./hud.ts'), import('./aerialHud.css')])"], [/\bpending\s*=\s*null\b/]],
  ['src/ui/accessibilitySettings.ts', ["createLazyChunk(() => import('./accessibilityMotion.ts'))"], [/void import\('\.\/accessibilityMotion\.ts'\)/]],
  ['src/gallery/gallery.ts', ["createLazyChunk((): Promise<AnatomyModule> => import('./anatomyView.ts'), { opener: true })", 'createLazyChunk(() => import(\'./inAction.ts\')',
    "createLazyChunk(() => import('../ui/components/notice.ts')"],
    [/\banatomyModule\s*\?\?=/, /\binActionLoad\s*\?\?=/, /\bdamageLabModule\s*=\s*null\b/, /\bnoticeKit\s*\?\?=/]],
  // (review round 1) the hand-made memos that kept a failed chunk for the session, and the two loaders ensureTankBuilder
  // awaits beside the fleet's kit, groups and fills
  ['src/ui/battleNotices.ts', ["createLazyChunk(() => import('./components/notice.ts')"], [/\bkit\s*\?\?=/]],
  ['src/game/pointerLockFeedbackRuntime.ts', ["createLazyChunk(() => import('../ui/battleNotices.ts')"], [/\bregionPort\s*\?\?=/]],
  ['src/ui/medalToast.ts', ["createLazyChunk(() => import('./components/notice.ts')"], [/\bloading\s*\?\?=/]],
  ['src/main.ts', ["createLazyChunk(() => import('./game/studioLightRuntime.ts')", '}), { opener: true });',
    "createLazyChunk(() => Promise.all([import('./game/studio.ts'), import('./ui/studioPanel.css'),", 'loadModule: () => studioModule.load()'],
    [/\bstudioLightRuntime\s*\?\?=\s*import\(/]],
  ['src/ui/studioPanel.ts', ["createLazyChunk(() => importAll([import('./camoSwatchPainter.ts'), import('../vehicles/specs.ts')])",
    "createLazyChunk(() => import('../presentation/mediaArchive.css'))", 'heroCardChunk.load()'], [/\bswatchPainter\s*\?\?=/, /(?<!typeof )import\('\.\/heroCard\.(?:ts|css)'\)/]],
  ['src/ui/battlefieldPicker.ts', ["createLazyChunk(() => import('./deployObjectives.ts'))"], [/\bdrawer\s*\?\?=/]],
  ['src/ui/deployScreen.ts', ["createLazyChunk(() => import('./deployObjectives.ts'))"], [/\bdrawer\s*\?\?=/]],
  ['src/engine/lighting.ts', ["createLazyChunk((): Promise<CasterProxyModule> => import('./shadowCasterProxies.ts'))"], [/\bcasterProxiesLoad\s*\?\?=/]],
  ['src/vehicles/vehicleMarkingSeatLoader.ts', ['createLazyChunk(() => load()'], [/\bpendingGroups\b/, /\breadyGroups\b/]],
  ['src/vehicles/combatAnatomyCalibrationLoader.ts', ['createLazyChunk(() => load()'], [/\bpendingGroups\b/, /\breadyGroups\b/]],
  // (review round 2) the AC-130's airframe, which every frame's sync and the lens guns ask for, and the hero cards' one
  // load (their sheet had six boundaries in the game, each with its own state)
  ['src/game/gunshipVisual.ts', ["createLazyChunk((): Promise<AirframeModule> => import('./gunshipAirframe.ts')"], [/\bloading\s*\?\?=/]],
  ['src/fx/effects.ts', ['loadedGunshipAirframe()', 'loadGunshipAirframe()'], [/\blensLoading\b/, /import\('\.\.\/game\/gunshipAirframe\.ts'\)/]],
  ['src/ui/heroCardChunk.ts', ["createLazyChunk(() => importAll([import('./heroCard.ts'), import('./heroCard.css')])"], []],
  ['src/ui/garage.ts', ['heroCardChunk.load()'], [/(?<!typeof )import\('\.\/heroCard\.(?:ts|css)'\)/]],
  ['src/ui/endScreen.ts', ['heroCardChunk.load()'], [/(?<!typeof )import\('\.\/heroCard\.(?:ts|css)'\)/]],
  ['src/gallery/gallery.ts', ['heroCardChunk.load()'], [/(?<!typeof )import\('\.\.\/ui\/heroCard\.(?:ts|css)'\)/]],
  // (round 2 U35) the second policy: createLazyRuntimeOwner and the hand-written access facades (a memo their failure
  // cleared, asked again at once by every call, with no backoff and no 404 rule); the mode world presentation's memo, asked
  // again by every frame's mode state; the latches set before an import and never lifted (the lighting rig's caster kinds
  // and static cache, the post pass's GPU timer); the resident catalog slices; the Garage's environment kit; and the 404
  // search's kept memo, which takes the kit's opener rule (its page does not boot this policy's chunk)
  ['src/app/lazyRuntimeOwner.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/soloBattleAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/soloBattleStartAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/battleVisualStreamerAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/armorAimOverlayAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/battleClientAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/battleWarmAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/garageDressingAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/ui/touchControlsAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/game/battleModuleAccess.ts', ['createLazyChunk(load)'], [/\bpending\b/]],
  ['src/game/mobileBattleInputAccess.ts', ['const autoAimChunk = createLazyChunk('], [/if \(autoAim\) return autoAim;/]],
  ['src/game/matchModeWorldLazy.ts', ['createLazyChunk(load)'], [/\bloading\s*\?\?=/]],
  ['src/fx/fxRuntimeAccess.ts', ['const moduleChunk = createLazyChunk('], [/\bmodulePromise\b/]],
  ['src/game/killcamAccess.ts', ['const moduleChunk = createLazyChunk('], [/\bmodulePromise\b/]],
  ['src/mp/session/compositionAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/dev/perfDiagnosticsAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/dev/driveTestAccess.ts', ['createLazyChunk('], [/\bpending\b/]],
  ['src/ui/garageArchitecture.ts', ['createLazyChunk(loadKit)'], [/\benvironmentKitPromise\b/]],
  ['src/ui/i18nSlices.ts', ['createLazyChunk('], [/\brequest\s*\?\?=/]],
  ['src/engine/lighting.ts', ["import('./shadowDepthKinds.ts').then((module) => { settleDepthKind",
    "createLazyChunk((): Promise<void> => import('./shadowStaticCache.ts')"], [/Requested = true;\s*import\(/]],
  ['src/engine/post.ts', ["createLazyChunk((): Promise<void> => import('./gpuFrameTimer.ts')"], [/gpuFrameTimerRequested = true;\s*import\(/]],
  ['src/presentation/notFound.ts', ['importWhenOnline(', 'markLoadFailed([field])'], [/\bsearch\s*\?\?=/]],
  ['src/vehicles/wreckTurretDriverLoader.ts', ['createLazyChunk(() => importer()'], [/\bloading\s*=\s*importer\(/]],
  // (round 2 review) the two kit facades the first pass left as memos: the custom camouflage studio, preloaded on every
  // pointer over or focus into its swatch, is an opener's chunk (a failure kept; the intent marks the swatch, never asks
  // offline); the settings panel, which every battle entry awaits, is a default-policy chunk (an opener's kept failure
  // would fail every later battle), and the gear keeps the kit's mark and reload for its own press
  ['src/ui/customCamoStudioAccess.ts', ['createLazyChunk(load, { opener: true })'], [/\bpending\b/]],
  ['src/ui/garage.ts', ['if (customCamoStudioFailed || customCamoStudioAccess?.peek() || navigator.onLine === false) return;',
    "markLoadFailed([makeOwnOption()], t('garage.camo.customStudioRetryTitle'));"], [/customCamoStudioAccess\?\.preload\(\)\.catch\(\(\) => \{\s*\}\)/]],
  ['src/ui/settingsAccess.ts', ['const chunk = createLazyChunk(() => load().then(', 'const preload = (): Promise<SettingsRuntime> => chunk.load();'],
    [/\bpending\b/, /\bopener:\s*true\b/]],
  // the lobby's chunk the Play menu's memo joins (playSurfaceRuntime menuPromise, in KNOWN): a bare import, asked again
  // by every Play intent after a failure
  ['src/main.ts', ["const lobbyIntentChunk = createLazyChunk(() => import('./mp/session/lobbyIntent.ts'));", 'lobbyIntentChunk.load().then(({ createLobbyIntent })'], []],
  // (round 2 review 2) the world build coordinator's map module, which every world build awaits: its memo of the loader
  // passed in (`if (!modulePromise) modulePromise = dependencies.loadModule()`) kept its first failure for the document, so
  // one failed transfer failed every later battle's world build until a reload; and the consumables' smoke table, warmed
  // on every pointer crossing into its band, whose memo (cleared on failure) every hover asked again
  ['src/world/worldBuildCoordinator.ts', ['createLazyChunk((): Promise<WorldMapModule<World>> => dependencies.loadModule(), { now })',
    'const loadModule = (): Promise<WorldMapModule<World>> => moduleChunk.load();'], [/\bmodulePromise\s*=\s*dependencies\.loadModule\(/]],
  ['src/ui/garageConsumables.ts', ["createLazyChunk(() => import('../vehicles/auxiliaryInventory.ts')", 'smokeChunk.load().then(undefined, () => undefined)'],
    [/\bsmokeLoad\s*\?\?=/]],
  // the light model's and the cloudscapes' memos (KNOWN) rode only the battle atmosphere runtime's first acquisition, a lazy
  // runtime owner that never loads again once ready: every prepare asks them again
  ['src/engine/battleAtmosphereAccess.ts', ['await Promise.all([owner.preload(), loadGroundedLightModel(), loadCloudscapeLayers()])'], []],
];
const offenders = [];
for (const [file, present, absent] of SITES) {
  const source = read(file);
  for (const text of present) if (!source.includes(text)) offenders.push(`${file}: lacks ${text}`);
  for (const pattern of absent) if (pattern.test(source)) offenders.push(`${file}: still has ${pattern}`);
}
assert.deepEqual(offenders, [], `a named lazy chunk is not on app/lazyChunk.ts:\n  ${offenders.join('\n  ')}`);

// ---- the ratchet: a hand-made memo of a chunk (`x ??= import(...)`, `x = import(...)`, a memo or latch its import's
// failure handler clears, a facade's memo cleared by identity, a `??=` memo of a call its handlers clear, or a `??=` or
// guarded memo of a call named for loading, a loader passed in among them) is one of these, which predate the policy
// and belong to other owners; a new chunk takes createLazyChunk (a module failure is asked again past a backoff, a
// stylesheet never). A memo spelled otherwise is not seen. Each names why it differs:
const KNOWN = new Set([
  // a memo cleared on failure, asked again by the next call without the policy's backoff. None carries a stylesheet, and
  // each is asked once per lifecycle edge or deliberate open, never per frame, tick, pointer move or focus move (review
  // round 2: the AC-130 airframe's was asked every frame and the consumables' smoke table on every hover; both are held
  // now). Their callers: every battle's covered atmosphere prepare (battleAtmosphereAccess.ts asks them at each prepare,
  // since its runtime loads once) and the shot staging (cloudscapeLoad, groundedLoad; lightModelCore.ts also rides the
  // horizon ring and hinterland workers, which do not carry this policy); a world build and a Studio light or map sky
  // applied for an Earth sky (earthLandLoad); the battle's start and its phase change into battle
  // (battleEndGarageWarmLoad); the opening of a dossier's technical drawing section (infoGuides mounted; the drawing
  // holds its own sheet below)
  'src/engine/cloudPresets.ts cloudscapeLoad', 'src/engine/earthLandAccess.ts earthLandLoad', 'src/engine/lightModelCore.ts groundedLoad',
  'src/main.ts battleEndGarageWarmLoad', 'src/ui/infoGuides.ts mounted',
  // a stylesheet alone: kept for the document, the policy's rule for a failed stylesheet (asked again it never applies)
  'src/ui/technicalDiagramLabels.ts sheet', 'src/ui/technicalDrawing.ts sheet',
  // pages that do not boot app/lazyChunk.ts (it rides the game, cn and Gallery boot chunk, vite.config.ts
  // turretSeatPlane): the docs' archive and takes, and the icon sprite every page's boot runtime holds (nulled on
  // failure, and asked again only while its host is not in the document); holding them in lazyChunk would add a boot
  // request there (Main's 253 ruling)
  'src/docs/docs.ts archiveMountPromise', 'src/docs/docs.ts archiveMotionPromise', 'src/docs/referenceTakes.ts fleetTakes',
  'src/ui/icons/icon.ts fullSprite',
  // the sky's HDRI experiment (HDRI_ENV_URL is null: never called)
  'src/engine/sky.ts hdriPromise',
  // (round 2 U35) facade-shaped memos that are not a chunk's load, or that sit over loads this policy already holds:
  // an initialization over a module the policy holds, made again after a failure (the effects' and the kill-cam's runtime
  // over their moduleChunk; the Studio's runtime over main.ts studioModule; the Play menu over battleModuleAccess's chunk);
  // (the Play menu's module joins battleModuleAccess's chunk and main.ts lobbyIntentChunk)
  'src/fx/fxRuntimeAccess.ts runtimePromise', 'src/game/killcamAccess.ts runtimePromise', 'src/game/studioAccess.ts runtimePromise',
  'src/game/playSurfaceRuntime.ts menuPromise',
  // a join of loads the policy holds, cleared so the next ask reaches their own state (the mobile input's touch controls
  // and auto-aim chunks; the Studio's whole fleet, every group a fleetFactory chunk; the Garage's fleet takes, its module
  // fleetTakesChunk and its index a fetch);
  'src/game/mobileBattleInputAccess.ts pending', 'src/game/studio.ts fleetReady', 'src/ui/garage.ts fleetRequest',
  // the Studio's module memo over its opener chunk (main.ts studioModule, opener: true, which keeps any failure, so the
  // memo's clear only reaches that kept failure: the Studio's links are marked and their next press reloads);
  'src/game/studioAccess.ts modulePromise',
  // a fetch of data, which may be asked again (components/loadFailure.ts isChunkFailure): the prop model archive, the fleet
  // takes index, the ICE configuration; and a warm task, not a load (the Studio effects' warm)
  'src/world/propsModelStore.ts loadPromise', 'src/ui/fleetTakes.ts request', 'src/mp/transport/iceConfig.ts inFlight',
  'src/game/battleWarmRuntime.ts studioEffectsWarmPromise',
  // the material painter worker's font, a fetch held for that worker's realm: a failed font answers false, the client ends
  // that worker, and the next bake starts a fresh realm that fetches it again (materialPainterWorkerClient.ts)
  'src/vehicles/materialPainterWorker.ts ready',
  // the audio mixer's chunk (lazyAudio.ts modulePromise), cleared on failure and asked again by the next gesture or phase
  // edge (resume, the loading bed, the Garage sting), never per frame or tick, with a warning each time; the mixer's runtime
  // over it (realPromise) is an initialization. The audio owner moves it onto this policy (round 2 crossClusterNeeds)
  'src/audio/lazyAudio.ts modulePromise', 'src/audio/lazyAudio.ts realPromise',
]);
const found = new Set();
const multipart = [];
// ---- every lazy stylesheet: held where a failed sheet is never asked again (inside createLazyChunk, whose policy keeps a
// failed sheet, or a docs page's importWhenOnline / whenOnline, which asks once), or one of these, and one owner per document
const SHEET_SITES = new Set([
  // a kit opener: a failure marks its trigger, and the next press reloads (components/loadFailure.ts)
  'src/ui/garage.ts ./serviceRecord.css', 'src/ui/garage.ts ./richTooltip.css', 'src/ui/garage.ts ./techTree.css',
  'src/ui/settings.ts ./hudEditor.css', 'src/docs/docs.ts ../presentation/mediaArchive.css',
  // a loader the battle HUD bundle's createLazyChunk calls (battleHudAccess.ts DEFAULT_LOADERS, settled by importAll)
  'src/ui/battleHudAccess.ts ./aerialHud.css',
  // asked once in the document: the report's sheet (createEndScreen, once per HUD), the Filming manual's library and pickers
  'src/ui/endScreen.ts ./endScreenPresentation.css', 'src/docs/filming.ts ../presentation/mediaLibrary.css', 'src/docs/filming.ts ./docsPickers.css',
  // a stylesheet alone, kept for the document (`sheet ??=`, in KNOWN above)
  'src/ui/technicalDiagramLabels.ts ./technicalDiagramLabels.css', 'src/ui/technicalDrawing.ts ./technicalDrawing.css',
]);
const html = (file) => readFileSync(join(ROOT, file), 'utf8');
// two owners in one document, of which one never runs there: publicPages.ts mounts the archives its page serves
// ([data-media-archive] in the markup at boot), and the docs page serves none (its archive is docs.ts's dialog)
const SHARED_SHEETS = new Map([
  ['site/docs.html src/presentation/mediaArchive.css', () => !html('site/docs.html').includes('data-media-archive')
    && read('src/presentation/publicPages.ts').includes("if (document.querySelector('[data-media-archive]')) {")],
]);
/** Each module's runtime imports (static and dynamic, relative, type-only erased) and its lazy stylesheets. */
const graph = new Map();
const looseSheets = [];
const listedSheets = new Set();
const resolveSpecifier = (from, specifier) => {
  const target = resolve(dirname(join(ROOT, from)), specifier);
  for (const candidate of [target, `${target}.ts`]) if (existsSync(candidate)) return relative(ROOT, candidate).split('\\').join('/');
  return null;
};
/** The index just past the bracket that closes the one opening at `open` (comments blanked; strings skipped). */
const closeOf = (source, open) => {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[source[open]]];
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') { for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return source.length;
};
/** The chain a call whose `(` is at `open` starts: the call and each `.then(`, `.catch(` and `.finally(` after it. */
const chainFrom = (source, open) => {
  let end = closeOf(source, open);
  for (let next; (next = /^\s*\.\s*(?:then|catch|finally)\s*\(/.exec(source.slice(end, end + 200)));) end = closeOf(source, end + next[0].length - 1);
  return source.slice(open, end);
};
/** The chain an `import(` at `at` starts. */
const chainOf = (source, at) => chainFrom(source, at + 'import'.length);
/** The body of this module's function or arrow named `name` (its block, or an arrow's expression), or ''. */
const bodyOf = (source, name) => {
  const definition = new RegExp(`\\bfunction\\s+${name}\\s*\\(|\\b(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`).exec(source);
  if (!definition) return '';
  const params = closeOf(source, definition.index + definition[0].length - 1);
  const head = /^\s*(?::[^{=;]*)?(=>)?\s*/.exec(source.slice(params, params + 300));
  const at = params + head[0].length;
  if (source[at] === '{') return source.slice(at, closeOf(source, at));
  return head[1] ? source.slice(at, at + 600).split(/;\n/)[0] : '';
};
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      const source = blankComments(readFileSync(path, 'utf8'));
      const file = relative(ROOT, path).split('\\').join('/');
      const edges = [], sheets = [];
      for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
        if (match.index === 0 || /[;\s]/.test(source[match.index - 1])) edges.push(resolveSpecifier(file, match[1]));
      }
      const holders = [...source.matchAll(/\b(?:createLazyChunk|importWhenOnline|whenOnline)\(/g)]
        .map((match) => [match.index, closeOf(source, match.index + match[0].length - 1)]);
      // every runtime `import(` (a literal search; what precedes it is read from the text before it)
      for (const match of source.matchAll(/import\(/g)) {
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (/[\w.$]$|\btypeof\s+$/.test(before)) continue;
        const specifier = /^import\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/.exec(source.slice(match.index, match.index + 300))?.[2];
        const target = specifier && resolveSpecifier(file, specifier);
        if (target?.endsWith('.css')) {
          sheets.push(target);
          const site = `${file} ${specifier}`;
          if (!holders.some(([from, to]) => match.index > from && match.index < to)) {
            if (SHEET_SITES.has(site)) listedSheets.add(site); else looseSheets.push(site);
          }
        } else if (target) edges.push(target);
        if (file === 'src/app/lazyChunk.ts') continue;
        // a hand-made memo: `x ??= import(`, `x = import(` (not a declaration), with an optional `(` or `Promise.all([`
        const memo = /(?:^|[^.\w?$])(\w+)\s*(\?\?)?=\s*\(?\s*(?:Promise\.all\(\[\s*)?$/.exec(before);
        if (memo && (memo[2] || !/\b(?:const|let|var)\s+$/.test(before.slice(0, memo.index + memo[0].indexOf(memo[1]))))) found.add(`${file} ${memo[1]}`);
        // a memo or latch the import's handlers clear (`x = null`, `flag = false`): asked again at once by the next caller
        for (const reset of chainOf(source, match.index).matchAll(/(?<![=!<>.\w$])(\w+)\s*=\s*(?:false|null)\b(?!\s*=)/g)) found.add(`${file} ${reset[1]}`);
        // (round 2 U35) a latch set just before the import and never lifted (`asked = true; import(`): a failure stood for
        // the session (the lighting rig's caster kinds and static cache, the post pass's GPU timer)
        const latch = /(?:^|[^.\w$])(\w+)\s*=\s*true;\s*$/.exec(before);
        if (latch) found.add(`${file} ${latch[1]}`);
      }
      graph.set(file, { edges: edges.filter((edge) => edge?.endsWith('.ts')), sheets });
      if (file === 'src/app/lazyChunk.ts') continue;
      // (round 2 U35) the hand-written access facade: a memo its failure clears by identity (`if (pending === request)
      // pending = null`), asked again at once by every call with no backoff, whatever its loader (an import here, or one
      // passed in: the nine createLazyRuntimeOwner facades and about twenty more were this second policy)
      for (const match of source.matchAll(/if \((\w+) === (?:request|retryable)\) \1 = null/g)) found.add(`${file} ${match[1]}`);
      // (round 2 U35) a memo of a call (`x ??= load()`, `x ??= f().then(`): cleared by its own handlers (the mode world's
      // `loading ??= load().then(…, () => { loading = null })`, asked again by every frame's mode state), or kept on a
      // failure when the callee is this module's own loader of a chunk (the 404 search's `search ??= loadSearch()`)
      for (const match of source.matchAll(/(?<![.\w$])(\w+)\s*\?\?=\s*([\w$]+)(?:\.[\w$]+)*\(/g)) {
        const [, name, callee] = match;
        if (callee === 'import' || callee === 'createLazyChunk') continue;
        const chain = chainFrom(source, match.index + match[0].length - 1);
        const cleared = new RegExp(`(?<![=!<>.\\w$])${name}\\s*=\\s*(?:false|null)\\b(?!\\s*=)`).test(chain);
        if (cleared || /(?<![\w.$])import\(\s*['"]/.test(bodyOf(source, callee))) found.add(`${file} ${name}`);
      }
      // (round 2 U35) the same memo assigned by hand (`if (!x) x = loader().then(…, () => { x = null })`) from a callee named
      // for loading (a loader passed in: the wreck turret's physics `importer` was one)
      for (const match of source.matchAll(/(?<![.\w$?!=<>])(\w+)\s*=\s*((?:load|import|preload|ensure)[\w$]*)(?:\.[\w$]+)*\(/gi)) {
        const [, name, callee] = match;
        if (callee === 'import' || /\b(?:const|let|var)\s+$/.test(source.slice(Math.max(0, match.index - 8), match.index))) continue;
        const chain = chainFrom(source, match.index + match[0].length - 1);
        if (/\.\s*(?:then|catch|finally)\s*\(/.test(chain)
          && new RegExp(`(?<![=!<>.\\w$])${name}\\s*=\\s*(?:false|null)\\b(?!\\s*=)`).test(chain)) found.add(`${file} ${name}`);
      }
      // (round 2 review 2) a memo of a loader passed in, kept for the document or cleared: a guarded assignment from a call
      // named for loading, a member call or a plain one (`if (!x) x = deps.loadModule()`, `if (x) return x; x = load…(`,
      // `x ??= a.b.load…(`), with or without a clear. The world build coordinator's map module was one
      // (`modulePromise = dependencies.loadModule()`, never cleared: one failed transfer failed every later world build)
      for (const match of source.matchAll(/(?<![.\w$?!=<>])(\w+)\s*(\?\?)?=\s*(?:[\w$]+\.)*((?:load|import|preload|ensure)[\w$]*)\(/gi)) {
        const [, name, nullish, callee] = match;
        if (callee === 'import') continue;
        const before = source.slice(Math.max(0, match.index - 160), match.index);
        if (/\b(?:const|let|var)\s+$/.test(before)) continue;
        const guard = new RegExp(`if\\s*\\(\\s*(?:!\\s*${name}|${name}\\s*===?\\s*(?:null|undefined))\\s*\\)\\s*\\{?\\s*$`
          + `|if\\s*\\(\\s*${name}\\s*\\)\\s*return\\b[^;]*;\\s*$`);
        if (nullish || guard.test(before)) found.add(`${file} ${name}`);
      }
      // a default-policy chunk of several parts settles them all: Promise.all keeps whichever rejection came first
      for (const match of source.matchAll(/\bcreateLazyChunk\(/g)) {
        const open = match.index + match[0].length - 1;
        const call = source.slice(open, closeOf(source, open));
        if (/\bPromise\.all\(\s*\[/.test(call) && !/\bopener:\s*true\b/.test(call)) {
          multipart.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
        }
      }
    }
  }
};
walk(join(ROOT, 'src'));
assert.deepEqual(multipart, [], `a lazy chunk of several parts settles them with importAll (app/lazyChunk.ts), so a module's failure never hides its stylesheet's:\n  ${multipart.join('\n  ')}`);
const fresh = [...found].filter((site) => !KNOWN.has(site));
assert.deepEqual(fresh, [], `a lazy chunk memoized by hand (hold it in app/lazyChunk.ts createLazyChunk):\n  ${fresh.join('\n  ')}`);
const gone = [...KNOWN].filter((site) => !found.has(site));
if (gone.length) console.log(`lazyChunkSites.selftest: moved off the known list (drop them from KNOWN): ${gone.join(', ')}`);
const unlisted = [...SHEET_SITES].filter((site) => !listedSheets.has(site));
if (unlisted.length) console.log(`lazyChunkSites.selftest: held now or gone (drop them from SHEET_SITES): ${unlisted.join(', ')}`);
assert.deepEqual(looseSheets, [], `a lazy stylesheet outside the policy (hold it in a createLazyChunk; asked again after a failure it runs its chunk unstyled):\n  ${looseSheets.join('\n  ')}`);

// one owner per stylesheet in each document: every page's modules (static and dynamic imports from its entries)
const pages = ['index.html', '404.html', ...readdirSync(join(ROOT, 'site')).filter((name) => name.endsWith('.html')).map((name) => `site/${name}`)];
const shared = [];
let sheetCount = 0;
for (const page of pages) {
  const entries = [...html(page).matchAll(/<script[^>]*type="module"[^>]*src="\/(src\/[^"]+\.ts)"/g)].map((match) => match[1]);
  const reached = new Set(entries), queue = [...entries], owners = new Map();
  while (queue.length) {
    const module = graph.get(queue.shift());
    if (!module) continue;
    for (const sheet of module.sheets) (owners.get(sheet) ?? owners.set(sheet, new Set()).get(sheet)).add(module);
    for (const edge of module.edges) if (!reached.has(edge)) { reached.add(edge); queue.push(edge); }
  }
  if (page === 'index.html') assert.ok(reached.has('src/ui/heroCardChunk.ts') && reached.size > 1000, 'the walk reaches the game\'s modules');
  sheetCount += owners.size;
  for (const [sheet, by] of owners) {
    if (by.size < 2 || SHARED_SHEETS.get(`${page} ${sheet}`)?.()) continue;
    shared.push(`${page}: ${sheet} <- ${[...graph].filter(([, module]) => by.has(module)).map(([file]) => file).join(', ')}`);
  }
}
assert.deepEqual(shared, [], `a lazy stylesheet with two owners in one document (Vite's preload skips a sheet that failed at one, so the other runs unstyled; give it one owner, as ui/heroCardChunk.ts):\n  ${shared.join('\n  ')}`);
console.log(`lazyChunkSites.selftest: ${SITES.length} sites on app/lazyChunk.ts, their loads of several parts settled by importAll; ${found.size} older hand-made memos (each with its reason in KNOWN), no new one; ${sheetCount} lazy stylesheets over ${pages.length} pages, each held and with one owner per document`);
