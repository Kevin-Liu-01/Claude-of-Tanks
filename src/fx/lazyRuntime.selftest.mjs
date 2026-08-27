import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const battleVisualStreamer = await readFile(
  new URL('../game/battleVisualStreamer.ts', import.meta.url), 'utf8',
);
const post = await readFile(new URL('../engine/post.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../game/state.js', import.meta.url), 'utf8');
const particles = await readFile(new URL('./particles.js', import.meta.url), 'utf8');
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

if (/import\s*\{\s*createFx\s*\}\s*from\s*['"]\.\/fx\/effects\.js['"]/.test(main)) {
  throw new Error('combat effects must not return to the garage boot graph');
}
if (!main.includes("import('./fx/effects.js')")) {
  throw new Error('combat effects must retain an explicit demand-loaded chunk');
}
if (!/createFxRuntimeAccess\(\{[\s\S]{0,220}loadModule:\s*\(\)\s*=>\s*import\(['"]\.\/fx\/effects\.js['"]\)/.test(main)
    || !/const preloadFxModule = fxRuntimeAccess\.preloadModule/.test(main)
    || !/const ensureFxRuntime = fxRuntimeAccess\.ensureRuntime/.test(main)) {
  throw new Error('the composition root must delegate FX import and construction ownership');
}
if (!/if \(modulePromise === request\) modulePromise = null/.test(fxRuntimeAccess)
    || !/if \(runtimePromise === request\) runtimePromise = null/.test(fxRuntimeAccess)) {
  throw new Error('FX module and runtime failures must remain independently retryable');
}
if (!/scene\.add\(live\.group\)[\s\S]{0,480}post\.attachLateFxState\(live\.group\.userData\.softParticles\)/.test(main)) {
  throw new Error('demand-loaded FX must register with the already-live late composite pass');
}
if (post.includes("../fx/particles.js") || !post.includes("../fx/layers.js")) {
  throw new Error('the post stack must not pull the particle engine into the garage graph');
}
if (!/attachLateFxState\(softState\)[\s\S]{0,100}lateFx\.setSoftState\(softState\)/.test(post)
  || !/setSoftState\(softState\)[\s\S]{0,260}this\.prepared = false/.test(post)) {
  throw new Error('late composite must support explicit post-boot FX registration and re-prepare depth state');
}

const requiredGates = [
  ['solo battle', /async function startBattleLoading[\s\S]{0,5200}const fxTextureP = ensureFxRuntime\(\)/],
  ['QA battle', /async function debugStartBattle[\s\S]{0,420}ensureFxRuntime\(\)/],
];
for (const [name, pattern] of requiredGates) {
  if (!pattern.test(main)) throw new Error(`${name} can enter without the live effects runtime`);
}
if (!/const loadRuntime[^=]*=[\s\S]{0,520}Promise\.all\(\[[\s\S]{0,120}preloadModule\(\),[\s\S]{0,80}ensureFxRuntime\(\)/.test(studioAccess)) {
  throw new Error('Studio can enter without its module and live effects runtime');
}
if (!/window\.__SHOTS\s*=\s*\{[\s\S]{0,320}import\(['"]\.\/dev\/shotRuntime\.ts['"]\)/.test(main)
    || !/export async function setShotView[\s\S]*context\.ensureFxRuntime\(\)/.test(shotRuntime)) {
  throw new Error('deterministic shots can enter without the live effects runtime');
}
if (!/createKillcamAccess\(\{[\s\S]{0,220}loadModule:\s*\(\)\s*=>\s*import\(['"]\.\/game\/killcam\.js['"]\)/.test(main)
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
const networkBattle = main.slice(
  main.indexOf('async function presentNetworkBattle('),
  main.indexOf('async function beginSoloBattle('),
);
if (!/preloadNetworkBattleModules\(\)[\s\S]{0,900}ensureFxRuntime\(\)/.test(networkBattle)) {
  throw new Error('network battle can enter without the live effects runtime');
}
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
if (!/onBattleIntent: battleIntent\.preload/.test(main)) {
  throw new Error('the garage Battle intent must remain wired to the typed lifecycle owner');
}
if (!/image\.onload = async[\s\S]{0,260}image\.decode/.test(particles)) {
  throw new Error('particle preload must finish PNG decode before texture upload');
}

if (!/openBattle\([^;]*\);\s*scheduleDeferredCombatWarm\(entryWarmGeneration\)/.test(main)) {
  throw new Error('rare combat variants must start only after the first battle reveal');
}
const coveredWarm = soloDeployment.slice(
  soloDeployment.indexOf(
    'const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({',
  ),
  soloDeployment.indexOf('await entryLifecycle.primeReveal()'),
);
if (!/combatFxSubmission\.staged[\s\S]*combatWarm\.markOpeningReady\(\);[\s\S]*setDestructionWarmed\(true\);/.test(coveredWarm)) {
  throw new Error('the exact covered FX bind must retire duplicate opening/destruction countdown work');
}
if (!/export function stageCombatFxProgramSubmission\([\s\S]*fx\.warmOpeningEffects[\s\S]*fx\.impact[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush[\s\S]*createShell/.test(battleWarm)) {
  throw new Error('the typed battle warm owner must retain every covered FX family and tracer');
}
const enemyAt = deferredWarm.indexOf('getBattleVisuals().stream(');
const openingAt = deferredWarm.indexOf('combatWarm.warmOpeningChunked(6, guardedYield)');
const navigationAt = deferredWarm.indexOf('prepareNextOpeningRoute(game)');
const terrainAt = deferredWarm.indexOf('battleWarm.warmBattleTerrainTiles({');
const rareAt = deferredWarm.indexOf('combatWarm.warmRareChunked(6, guardedYield)');
if (!(enemyAt >= 0 && openingAt > enemyAt && navigationAt > openingAt
    && terrainAt > navigationAt && rareAt > terrainAt)) {
  throw new Error('hidden enemy receipts and fallback opening/rare work must retain countdown order');
}
if (!/const fxTextureP = ensureFxRuntime\(\)\.then[\s\S]{0,420}live\.preloadTextures[\s\S]{0,120}live\.warmTextures[\s\S]{0,220}battleVisuals\.stageRootTextureUploads\(live\.group, loadYield\)[\s\S]{0,900}fxTextureP/.test(main)) {
  throw new Error('solo entry must overlap exact FX atlas decode/install/upload with world construction');
}
if (!/if \(initiallyHidden\) \{[\s\S]{0,900}visual\.setVisible\?\.\(false\)[\s\S]{0,900}root\.removeFromParent\(\)[\s\S]{0,180}battleVisibilityDetached = true/.test(battleVisualStreamer)
  || !/actorVisible = entity\._spotFade > 0\.02;[\s\S]{0,160}setVisualResident\(visual, actorVisible\)[\s\S]{0,100}visual\.setVisible\(actorVisible\)/.test(battlePresentation)) {
  throw new Error('countdown-built enemy visuals must stay detached until a legal spotting edge');
}
if (!/function\* warmDestroyedRosterVariantsSteps\([\s\S]*prebakeBurntSteps[\s\S]*setDestroyed/.test(battleWarm)
  || !/function\* warmCombatDestructionEffectSteps\([\s\S]*fx\.destruction[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush/.test(battleWarm)
  || !/function\* createCombatRareWarmSteps\([\s\S]*yield\* warmCombatDestructionEffectSteps\(context\)[\s\S]*compileHiddenVariantsSteps/.test(battleWarm)) {
  throw new Error('deferred warm lost a full-quality wreck/destruction/hidden-variant family');
}
if (!/finishedAtPreBattleS[\s\S]*doneBeforeRollout[\s\S]*setPending\(false\)/.test(deferredWarm)
    || !/setPending:\s*\(pending\)[\s\S]{0,80}battleWarmPending = pending/.test(main)) {
  throw new Error('deferred warm must retain the one-second rollout hold and record completion');
}
if (!/setupBattle\(game, specId, world,[\s\S]{0,900}combatWarm\.reset\(\)/.test(main)
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
if (!/deferOpeningRoutes: !!opts\.deferVisuals/.test(main)
  || !(navigationAt >= 0 && terrainAt > navigationAt)
  || !/battleWarm\.warmBattleTerrainTiles\(\{[\s\S]{0,180}primePresentation: false/.test(deferredWarm)
  || !/opts\.deferOpeningRoutes\) game\.openingRouteJobs\.push\(prepareOpeningRoute\)/.test(state)) {
  throw new Error('solo A* routes and their terrain tiles must finish in the bounded deployment queue');
}

console.log('lazyRuntime.selftest: garage boot exclusion and opening/rare warm split passed');
