import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createBattleEntryAcquisition } from '../game/battleEntryAcquisition.ts';
import { renderCoveredComposerWarm } from '../engine/coveredComposerWarm.ts';

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const debugBattleEntry = await readFile(
  new URL('../dev/debugBattleEntryRuntime.ts', import.meta.url), 'utf8',
);
const combatWarmComposition = await readFile(
  new URL('../app/combatWarmComposition.ts', import.meta.url), 'utf8',
);
const battleVisualStreamer = await readFile(
  new URL('../game/battleVisualStreamer.ts', import.meta.url), 'utf8',
);
const post = await readFile(new URL('../engine/post.ts', import.meta.url), 'utf8');
const state = await readFile(new URL('../game/state.ts', import.meta.url), 'utf8');
const particles = await readFile(new URL('./particles.ts', import.meta.url), 'utf8');
const battleWarm = await readFile(new URL('../game/battleWarmRuntime.ts', import.meta.url), 'utf8');
const combatWarmCoordinator = await readFile(
  new URL('../game/combatWarmCoordinator.ts', import.meta.url), 'utf8',
);
const shotRuntime = await readFile(new URL('../dev/shotRuntime.ts', import.meta.url), 'utf8');
const studioAccess = await readFile(new URL('../game/studioAccess.ts', import.meta.url), 'utf8');
const deferredWarm = await readFile(
  new URL('../game/deferredCombatWarmRuntime.ts', import.meta.url), 'utf8',
);
const soloDeployment = await readFile(
  new URL('../game/soloBattleDeploymentRuntime.ts', import.meta.url), 'utf8',
);
const soloLoading = await readFile(
  new URL('../game/soloBattleLoadingRuntime.ts', import.meta.url), 'utf8',
);
const soloStart = await readFile(
  new URL('../game/soloBattleStartRuntime.ts', import.meta.url), 'utf8',
);
const battleIntentRuntime = await readFile(
  new URL('../game/battleIntentRuntime.ts', import.meta.url), 'utf8',
);
const fxRuntimeAccess = await readFile(
  new URL('./fxRuntimeAccess.ts', import.meta.url), 'utf8',
);
const killcamAccess = await readFile(
  new URL('../game/killcamAccess.ts', import.meta.url), 'utf8',
);
const playerBattleActions = await readFile(
  new URL('../game/playerBattleActions.ts', import.meta.url), 'utf8',
);
const playerFrameInput = await readFile(
  new URL('../game/playerFrameInput.ts', import.meta.url), 'utf8',
);
const battlePresentation = await readFile(
  new URL('../game/battlePresentationRuntime.ts', import.meta.url), 'utf8',
);
const networkBattlePresentation = await readFile(
  new URL('../net/networkBattlePresentationRuntime.ts', import.meta.url), 'utf8',
);

if (/import\s*\{\s*createFx\s*\}\s*from\s*['"]\.\/fx\/effects\.ts['"]/.test(main)) {
  throw new Error('combat effects must not return to the garage boot graph');
}
if (!main.includes("import('./fx/effects.ts')")) {
  throw new Error('combat effects must retain an explicit demand-loaded chunk');
}
if (!/createFxRuntimeAccess(?:<[^>]+>)?\(\{[\s\S]{0,260}loadModule:\s*\(\)\s*=>\s*import\(['"]\.\/fx\/effects\.ts['"]\)/.test(main)
    || !/const preloadFxModule = fxRuntimeAccess\.preloadModule/.test(main)
    || !/const ensureFxRuntime = fxRuntimeAccess\.ensureRuntime/.test(main)) {
  throw new Error('the composition root must delegate FX import and construction ownership');
}
if (!/if \(modulePromise === request\) modulePromise = null/.test(fxRuntimeAccess)
    || !/if \(runtimePromise === request\) runtimePromise = null/.test(fxRuntimeAccess)) {
  throw new Error('FX module and runtime failures must remain independently retryable');
}
if (!/post\.attachLateFxState\(live\.group\.userData\.softParticles\)/.test(main)
    || !/activate:\s*\(live\)\s*=>\s*\{[\s\S]{0,120}scene\.add\(live\.group\)/.test(main)
    || !/suspend:\s*\(live\)\s*=>\s*\{[\s\S]{0,180}live\.group\.removeFromParent\(\)[\s\S]{0,320}releaseObject3DGpuResources\(live\.group/.test(main)) {
  throw new Error('demand-loaded FX must register with the already-live late composite pass');
}
if (post.includes("../fx/particles.ts") || !post.includes("../fx/layers.ts")) {
  throw new Error('the post stack must not pull the particle engine into the garage graph');
}
if (!/attachLateFxState\(softState(?:\s*:\s*[^)]+)?\)[\s\S]{0,140}lateFx\.setSoftState\(/.test(post)
  || !/setSoftState\(softState(?:\s*:\s*[^)]+)?\)[\s\S]{0,300}this\.prepared = false/.test(post)) {
  throw new Error('late composite must support explicit post-boot FX registration and re-prepare depth state');
}

const requiredGates = [
  ['QA battle composition', /async function debugStartBattle[\s\S]{0,760}ensureFx:\s*ensureFxRuntime/],
  ['QA battle owner', /await Promise\.all\(\[[\s\S]{0,520}ports\.ensureFx\(\)/],
];
for (const [name, pattern] of requiredGates) {
  const source = name === 'QA battle owner' ? debugBattleEntry : main;
  if (!pattern.test(source)) throw new Error(`${name} can enter without the live effects runtime`);
}
if (!/const loadRuntime[^=]*=[\s\S]{0,520}Promise\.all\(\[[\s\S]{0,120}preloadModule\(\),[\s\S]{0,80}ensureFxRuntime\(\)/.test(studioAccess)) {
  throw new Error('Studio can enter without its module and live effects runtime');
}
if (!/window\.__SHOTS\s*=\s*\{[\s\S]{0,320}import\(['"]\.\/dev\/shotRuntime\.ts['"]\)/.test(main)
    || !/export async function setShotView[\s\S]*context\.ensureFxRuntime\(\)/.test(shotRuntime)) {
  throw new Error('deterministic shots can enter without the live effects runtime');
}
if (!/createKillcamAccess\(\{[\s\S]{0,300}loadModule:\s*\(\)\s*=>\s*import\(['"]\.\/game\/killcam\.ts['"]\)/.test(main)
    || !/const killcam = killcamAccess\.presentation/.test(main)
    || !/const ensureKillcamRuntime = killcamAccess\.ensureRuntime/.test(main)) {
  throw new Error('the composition root must delegate killcam import and runtime ownership');
}
if (!/if \(modulePromise === request\) modulePromise = null/.test(killcamAccess)
    || !/if \(runtimePromise === request\) runtimePromise = null/.test(killcamAccess)) {
  throw new Error('killcam module and runtime failures must remain independently retryable');
}
if (!/createPlayerBattleActions\(\{/.test(main)
    || /const SHELL_LOADOUT\s*=/.test(main)
    || /bus\.on\(['"]ui:consumable['"]/.test(main)) {
  throw new Error('the composition root must delegate player action policy to its typed owner');
}
if (/from\s+['"]three['"]/.test(playerBattleActions)
    || /battleClientRuntime|\.\.\/sim\//.test(playerBattleActions)) {
  throw new Error('player action policy must remain renderer-free and receive combat rules as ports');
}
if (!/createPlayerFrameInput\(\{/.test(main)
    || /input\.consumeMouseDelta\(/.test(main)
    || /input\.getVirtualMove\(/.test(main)) {
  throw new Error('the render loop must delegate device polling to the typed frame owner');
}
if (/from\s+['"]three['"]/.test(playerFrameInput)
    || /document\.|window\.|setTimeout\(/.test(playerFrameInput)) {
  throw new Error('frame input must remain allocation-free and independent from browser presentation');
}
const networkCompositionAt = main.indexOf('function loadNetworkComposition()');
const networkBattleAdapters = main.slice(
  networkCompositionAt,
  main.indexOf("bus.on('phase:change'", networkCompositionAt),
);
if (!/loadModules:[\s\S]{0,700}ensureFxRuntime\(\)/.test(networkBattleAdapters)
    || !/entry\.acquire\(\{[\s\S]{0,220}Promise\.all\(\[entry\.loadModules\(\), load\.ensureBattleVisuals\(\)\]\)/.test(networkBattlePresentation)) {
  throw new Error('network battle can enter without the live effects runtime');
}
// Execute the network-only acquisition callback from the composition root.
// Optional image work overlaps world construction but never owns entry success.
const loadModulesBody = networkBattleAdapters.match(
  /loadModules: \(\) => (Promise\.all\(\[[\s\S]*?\]\)\.then\(\(\[modules\]\) => modules\)),/,
)?.[1];
assert.ok(loadModulesBody, 'network entry retains its explicit module acquisition barrier');
const acquireNetworkModules = new Function(
  'preloadNetworkBattleModules', 'preloadBattleClientRuntime', 'ensureBattleHud',
  'ensureTouchControls', 'garageReturn', 'armorAimOverlay', 'ensureFxRuntime', 'ensureKillcamRuntime',
  'battleWarm', 'audio', `return ${loadModulesBody};`,
);
const acquireWithFx = (ensureFx, preloadGarageReturn = () => Promise.resolve()) => acquireNetworkModules(
  () => Promise.resolve('network-modules'), () => Promise.resolve(),
  () => Promise.resolve(), () => Promise.resolve(),
  { preload: preloadGarageReturn },
  { preload: () => Promise.resolve() }, ensureFx, () => Promise.resolve(),
  { preload: () => Promise.resolve() }, { warmBattleEvents: () => Promise.resolve() },
);
for (const preloadResult of ['pending', 'throw', 'reject', 'ready']) {
  const events = [];
  const preloadFailure = new Error('optional atlas unavailable');
  let releaseDownload;
  const pendingDownload = new Promise((resolve) => { releaseDownload = resolve; });
  const live = { preloadTextures() {
    events.push('texture-download-start');
    if (preloadResult === 'throw') throw preloadFailure;
    if (preloadResult === 'reject') return Promise.reject(preloadFailure);
    return preloadResult === 'pending' ? pendingDownload : Promise.resolve();
  } };
  let releaseWorld;
  const pendingWorld = new Promise((resolve) => { releaseWorld = resolve; });
  const acquisition = createBattleEntryAcquisition({ now: () => 0 });
  let modulesReady = false;
  const entry = acquisition.acquireNetwork({
    loadModules: () => acquireWithFx(() => Promise.resolve(live)).then((modules) => {
      modulesReady = true;
      return modules;
    }),
    loadWorld: () => pendingWorld,
    connect: () => ({ id: 'private-match' }),
    publishMatch() {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['texture-download-start'],
    'the real network callback starts the optional download before world completion');
  assert.equal(modulesReady, true, `${preloadResult} optional atlas must not delay modules`);
  releaseWorld('world');
  assert.equal((await entry).modules, 'network-modules');
  releaseDownload();
}
// The demand-loaded return owner is essential, unlike optional image work.
// Exercise the actual callback's new port instead of omitting it from the
// source-evaluated fixture and failing before FX acquisition ever begins.
for (const returnResult of ['pending', 'reject', 'throw']) {
  const failure = new Error('return owner unavailable');
  let releaseReturn;
  const pendingReturn = new Promise((resolve) => { releaseReturn = resolve; });
  const events = [];
  let modulesReady = false;
  const acquire = () => acquireWithFx(() => {
    events.push('fx-runtime-start');
    return Promise.resolve({ preloadTextures() {
      events.push('texture-download-start');
      return Promise.resolve();
    } });
  }, () => {
    events.push('return-owner-start');
    if (returnResult === 'throw') throw failure;
    return returnResult === 'reject' ? Promise.reject(failure) : pendingReturn;
  });
  if (returnResult === 'throw') {
    assert.throws(acquire, (error) => error === failure,
      'synchronous return acquisition failure cannot become successful modules');
    assert.deepEqual(events, ['return-owner-start'],
      'array evaluation stops at an essential synchronous acquisition failure');
    continue;
  }
  const modules = acquire().then((value) => { modulesReady = true; return value; });
  if (returnResult === 'reject') await assert.rejects(modules, (error) => error === failure);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['return-owner-start', 'fx-runtime-start', 'texture-download-start'],
    `${returnResult} return acquisition still overlaps independent FX download`);
  assert.equal(modulesReady, false, `${returnResult} return owner must not release the essential barrier`);
  if (returnResult === 'pending') {
    releaseReturn();
    assert.equal(await modules, 'network-modules');
    assert.equal(modulesReady, true, 'return readiness releases the original module result');
  }
}
await assert.rejects(acquireWithFx(() => Promise.reject(new Error('FX construction failed'))),
  /FX construction failed/, 'essential FX construction still fails the entry barrier');
assert.equal(main.includes('ensureFxRuntime().then((live) =>'), true);
assert.equal(main.indexOf('ensureFxRuntime().then((live) =>'),
  networkCompositionAt + networkBattleAdapters.indexOf('ensureFxRuntime().then((live) =>'),
  'optional network preload stays inside demand-loaded network composition, not passive Garage boot');
const plannedRosterAt = battleIntentRuntime.indexOf('const planned = planRoster(specId)');
const rosterBuildersAt = battleIntentRuntime.indexOf('ensureTankBuilders(planned)');
const fxRuntimeAt = battleIntentRuntime.indexOf('const live = await ensureFxRuntime()');
const fxTexturesAt = battleIntentRuntime.indexOf('live.preloadTextures');
if (!(plannedRosterAt >= 0
  && rosterBuildersAt > plannedRosterAt
  && fxRuntimeAt > rosterBuildersAt
  && fxTexturesAt > fxRuntimeAt)) {
  throw new Error('explicit Battle intent must transfer the exact next roster and FX atlases');
}
assert.match(main,
  /onBattleIntent:\s*\(options\)\s*=>\s*\{\s*(?:\/\/[^\n]*\n\s*)*if \(!currentNetworkRoom\(\)\?\.prepareLobby\(\)\) battleIntent\.preload\(options\);\s*\},\s*onTankIntent:/,
  'Garage intent keeps its existing room-aware adapter: prepare the authoritative lobby or forward exact Solo options');
if (!/image\.onload = async[\s\S]{0,260}image\.decode/.test(particles)) {
  throw new Error('particle preload must finish PNG decode before texture upload');
}

if (!/openBattle\(visiblePreBattleSeconds\);\s*scheduleDeferredWarm\(generation\)/.test(soloLoading)) {
  throw new Error('rare combat variants must start only after the first battle reveal');
}
function assertCoveredFxRetirement(source) {
  const helperStart = source.indexOf('async function warmDeploymentFx(');
  const helperEnd = source.indexOf('export function createSoloBattleDeploymentRuntime(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'covered FX retains its production helper');
  assert.match(source.slice(helperStart, helperEnd),
    /completed: cohortsCompleted && submission\?\.staged === true,\s*assertCurrent: assertFxCurrent/,
    'readiness requires every cohort and a staged submission');
  const start = source.indexOf('const fxWarm = await warmDeploymentFx(');
  const end = source.indexOf('revealPrimed = await primeCoveredReveal(', start);
  assert.ok(start >= 0 && end > start, 'covered FX interval precedes the production reveal helper');
  const coveredWarm = source.slice(start, end);
  assert.match(coveredWarm,
    /fxWarm\.assertCurrent\(\);\s*const fxReceipt = fxWarm\.receipt;\s*fxReceipt\.completed = fxWarm\.completed;/,
    'the actual caller rechecks the full FX lease after the async helper handoff');
  assert.match(coveredWarm, /if \(fxReceipt\.completed\) \{\s*combatWarm\.markOpeningReady\(\);\s*setDestructionWarmed\(true\);/,
    'only successful covered FX retires duplicate opening/destruction work');
}
assertCoveredFxRetirement(soloDeployment);
assert.throws(() => assertCoveredFxRetirement(soloDeployment.replace(
  'cohortsCompleted && submission?.staged === true', 'true')));
assert.throws(() => assertCoveredFxRetirement(soloDeployment.replace(
  'if (fxReceipt.completed) {', 'if (true) {')));
assert.throws(() => assertCoveredFxRetirement(soloDeployment.replace(
  'fxWarm.assertCurrent();', '')));
// The adjacent soloBattleFxReadiness regression executes the real production
// coordinator/staging path for success, partial cohorts, failures and retry.
if (!/export function stageCombatFxProgramSubmission\([\s\S]*fx\.warmOpeningEffects[\s\S]*fx\.impact[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush[\s\S]*createShell/.test(battleWarm)) {
  throw new Error('the typed battle warm owner must retain every covered FX family and tracer');
}
// Execute the exact production callback, not a parallel fake warmer. A plain
// renderer.render never submits LateFxPass.Copy or its layer-only variants.
const networkWarmPort = main.slice(main.indexOf('battleWarm.warmNetworkOpeningEffects({'));
const networkWarmBody = networkWarmPort.match(/warmRender: \(\) => \{([\s\S]*?)\n\s{14}\},/)?.[1];
assert.ok(networkWarmBody, 'network entry supplies the covered post-composer warm callback');
// Execute only the fixed local repository source read above, never room/user input.
const renderNetworkWarm = new Function('post', 'renderer', 'timing',
  'renderCoveredComposerWarm', networkWarmBody);

function withWarmClock(clock, run) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: clock });
  try { return run(); }
  finally {
    if (prior) Object.defineProperty(globalThis, 'performance', prior);
    else Reflect.deleteProperty(globalThis, 'performance');
  }
}

for (const initial of [true, false]) {
  let draws = 0;
  const timing = {};
  let clock = 10;
  const performance = { now: () => clock };
  const target = { name: 'prior private target' };
  const coveredTarget = { name: 'covered compositor target' };
  let restoredTarget = null;
  const renderer = { getRenderTarget: () => target, getActiveCubeFace: () => 3,
    getActiveMipmapLevel: () => 2,
    info: { programs: [] },
    setRenderTarget: (...state) => { restoredTarget = state; } };
  const pass = { render() { clock += 7; } };
  const composer = { renderer, passes: [pass], renderToScreen: initial, render(dt) {
    assert.equal(this.renderToScreen, false, 'warm effects never reach the default framebuffer');
    assert.equal(dt, 0, 'covered submission does not advance presentation time');
    renderer.setRenderTarget(coveredTarget, 0, 0);
    draws++;
    pass.render();
  } };
  const runWarm = (output, clockSource = performance) => withWarmClock(clockSource, () =>
    renderNetworkWarm({ composer }, renderer, output, renderCoveredComposerWarm));
  runWarm(timing);
  assert.equal(draws, 1, 'the actual post pipeline submits one covered frame');
  assert.equal(timing.openingRenderMs, 7, 'retain the actual compositor cost separately from scar preparation');
  assert.equal(timing.openingPasses.length, 1, 'the actual timing helper records the submitted pass');
  assert.equal(timing.openingPasses[0].renderMs, 7);
  assert.equal(timing.openingPasses[0].programsBefore, 0);
  assert.equal(timing.openingPasses[0].programsAfter, 0);
  assert.equal(composer.renderToScreen, initial);
  assert.deepEqual(restoredTarget, [target, 3, 2]);
  const failure = new Error('warm draw failed');
  composer.render = () => {
    assert.equal(composer.renderToScreen, false);
    renderer.setRenderTarget(coveredTarget, 0, 0);
    clock += 3;
    throw failure;
  };
  restoredTarget = null;
  const failedTiming = {};
  assert.throws(() => runWarm(failedTiming), (error) => error === failure);
  assert.deepEqual(failedTiming, {}, 'a failed draw cannot publish a successful compositor receipt');
  assert.equal(composer.renderToScreen, initial, 'failed submission restores the output target policy');
  assert.deepEqual(restoredTarget, [target, 3, 2], 'a failing pass cannot leave its render target bound');
  restoredTarget = null;
  const brokenClock = { now() { throw new Error('diagnostic clock failed'); } };
  assert.throws(() => runWarm({}, brokenClock), (error) => error === failure,
    'optional timing never replaces the actual draw failure');
  assert.equal(composer.renderToScreen, initial);
  assert.deepEqual(restoredTarget, [target, 3, 2]);
  composer.render = () => { draws++; pass.render(); };
  const invalidTiming = {};
  runWarm(invalidTiming, brokenClock);
  assert.equal(draws, 2, 'missing clock does not prevent the mandatory draw');
  assert.ok(Number.isNaN(invalidTiming.openingRenderMs),
    'unavailable optional timing is not reported as a successful zero');
  assert.equal(invalidTiming.openingPasses.length, 1);
  assert.ok(Number.isNaN(invalidTiming.openingPasses[0].renderMs));
  assert.equal(composer.renderToScreen, initial);
  assert.deepEqual(restoredTarget, [target, 3, 2]);
}
const enemyAt = deferredWarm.indexOf('getBattleVisuals().stream(');
const openingAt = deferredWarm.indexOf('combatWarm.warmOpeningChunked(6, guardedYield)');
const navigationAt = deferredWarm.indexOf('const consumed = prepareNextOpeningRoute();');
const terrainAt = deferredWarm.indexOf('await warmBattleTerrainTiles(guardedYield)');
const rareAt = deferredWarm.indexOf('combatWarm.warmRareChunked(6, guardedYield)');
if (!(enemyAt >= 0 && openingAt > enemyAt && navigationAt > openingAt
    && terrainAt > navigationAt && rareAt > terrainAt)) {
  throw new Error('hidden enemy receipts and fallback opening/rare work must retain countdown order');
}
if (!/const fxTexture = ensureFx\(\)\.then[\s\S]{0,420}live\.preloadTextures[\s\S]{0,120}live\.warmTextures[\s\S]{0,220}battleVisuals\.stageRootTextureUploads\(live\.group, loadYield\)[\s\S]{0,1100}\(\) => fxTexture/.test(soloLoading)
    || !/ensureFx:\s*ensureFxRuntime/.test(main)) {
  throw new Error('solo entry must overlap exact FX atlas decode/install/upload with world construction');
}
if (!/if \(initiallyHidden\) \{[\s\S]{0,900}visual\.setVisible\?\.\(false\)[\s\S]{0,900}root\.removeFromParent\(\)[\s\S]{0,180}battleVisibilityDetached = true/.test(battleVisualStreamer)
  || !/actorVisible = entity\._spotFade > 0\.02;[\s\S]{0,160}setVisualResident\(visual, actorVisible\)[\s\S]{0,100}visual\.setVisible\(actorVisible\)/.test(battlePresentation)) {
  throw new Error('countdown-built enemy visuals must stay detached until a legal spotting edge');
}
if (!/function\* prebakeDestroyedVariantSteps\([\s\S]*prebakeBurntSteps/.test(battleWarm)
  || !/function warmDestroyedVisual\([\s\S]*setDestroyed/.test(battleWarm)
  || !/function\* warmDestroyedRosterVariantsSteps\([\s\S]*prebakeDestroyedVariantSteps[\s\S]*warmDestroyedVisual/.test(battleWarm)
  || !/function\* warmCombatDestructionEffectSteps\([\s\S]*fx\.destruction[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush/.test(battleWarm)
  || !/function\* createCombatRareWarmSteps\([\s\S]*yield\* warmCombatDestructionEffectSteps\(context\)[\s\S]*compileHiddenVariantsSteps/.test(battleWarm)) {
  throw new Error('deferred warm lost a full-quality wreck/destruction/hidden-variant family');
}
if (!/finishedAtPreBattleS[\s\S]*doneBeforeRollout[\s\S]*setPending\(false\)/.test(deferredWarm)
    || !/setPending:\s*\(pending(?::\s*boolean)?\)[\s\S]{0,80}battleWarmPending = pending/.test(main)) {
  throw new Error('deferred warm must retain the one-second rollout hold and record completion');
}
if (!/round\.setupBattle\(game, specId, activeWorld,[\s\S]{0,500}round\.combatWarm\.reset\(\)/.test(soloStart)
  || !/const reset = \(\): void => \{[\s\S]{0,320}openingReady = false;[\s\S]{0,80}rareReady = false;/.test(combatWarmCoordinator)) {
  throw new Error('each new map/roster must receive a fresh opening and rare warm receipt');
}
if (!/pendingPromise === pending/.test(deferredWarm)) {
  throw new Error('a cancelled round must not clear a newer deferred warm queue');
}
const hiddenVariants = battleWarm.slice(
  battleWarm.indexOf('function* compileHiddenVariantsSteps('),
  battleWarm.indexOf('export function* createCombatOpeningWarmSteps'),
);
if (!hiddenVariants.includes('yield* compileAll(entity.visual.root)')
  || /initializeForwardProgramsSteps\(scene\)|renderer\.compile\(scene/.test(hiddenVariants)) {
  throw new Error('rare effects must never recompile the entire visible battlefield');
}
if (!/deferOpeningRoutes: deferVisuals/.test(soloStart)
  || !(navigationAt >= 0 && terrainAt > navigationAt)
  || !/await warmBattleTerrainTiles\(guardedYield\)/.test(deferredWarm)
  || !/warmBattleTerrainTiles:\s*\(yieldForBudget\)\s*=>\s*battleWarm\.warmBattleTerrainTiles\(\{[\s\S]{0,220}primePresentation:\s*false/.test(combatWarmComposition)
  || !/options\.deferOpeningRoutes\) context\.game\.openingRouteJobs\.push\(prepare\)/.test(state)) {
  throw new Error('solo A* routes and their terrain tiles must finish in the bounded deployment queue');
}

console.log('lazyRuntime.selftest: garage boot exclusion and opening/rare warm split passed');
