import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const post = await readFile(new URL('../engine/post.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../game/state.js', import.meta.url), 'utf8');
const particles = await readFile(new URL('./particles.js', import.meta.url), 'utf8');
const battleWarm = await readFile(new URL('../game/battleWarmRuntime.ts', import.meta.url), 'utf8');

if (/import\s*\{\s*createFx\s*\}\s*from\s*['"]\.\/fx\/effects\.js['"]/.test(main)) {
  throw new Error('combat effects must not return to the garage boot graph');
}
if (!main.includes("import('./fx/effects.js')")) {
  throw new Error('combat effects must retain an explicit demand-loaded chunk');
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
  ['Studio', /async function loadStudioRuntime[\s\S]{0,260}ensureFxRuntime\(\)/],
];
for (const [name, pattern] of requiredGates) {
  if (!pattern.test(main)) throw new Error(`${name} can enter without the live effects runtime`);
}
const shotsStart = main.indexOf('window.__SHOTS = {');
const shotsEnd = main.indexOf('// ---------------------------------------------------------------------------', shotsStart);
const deterministicShots = main.slice(shotsStart, shotsEnd);
if (shotsStart < 0 || shotsEnd < 0 ||
    !/async set\(name\)[\s\S]*ensureFxRuntime\(\)/.test(deterministicShots)) {
  throw new Error('deterministic shots can enter without the live effects runtime');
}
const networkBattle = main.slice(
  main.indexOf('async function presentNetworkBattle('),
  main.indexOf('async function beginSoloBattle('),
);
if (!/preloadNetworkBattleModules\(\)[\s\S]{0,900}ensureFxRuntime\(\)/.test(networkBattle)) {
  throw new Error('network battle can enter without the live effects runtime');
}
const battleIntent = main.slice(
  main.indexOf('function preloadBattleIntent('),
  main.indexOf('/** World raycast', main.indexOf('function preloadBattleIntent(')),
);
const plannedRosterAt = battleIntent.indexOf('planBattleParticipantIds(game, specId, true)');
const rosterBuildersAt = battleIntent.indexOf('ensureTankBuilders(planned)');
const fxRuntimeAt = battleIntent.indexOf('ensureFxRuntime()');
const fxTexturesAt = battleIntent.indexOf('live.preloadTextures');
if (!(plannedRosterAt >= 0
  && rosterBuildersAt > plannedRosterAt
  && fxRuntimeAt > rosterBuildersAt
  && fxTexturesAt > fxRuntimeAt)) {
  throw new Error('explicit Battle intent must transfer the exact next roster and FX atlases');
}
if (!/image\.onload = async[\s\S]{0,260}image\.decode/.test(particles)) {
  throw new Error('particle preload must finish PNG decode before texture upload');
}

if (!/openBattle\([^;]*\);\s*scheduleDeferredCombatWarm\(entryWarmGeneration\)/.test(main)) {
  throw new Error('rare combat variants must start only after the first battle reveal');
}
const coveredWarm = main.slice(
  main.indexOf('const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({'),
  main.indexOf('await primeSoloBattleRevealFrame()'),
);
if (!/combatFxSubmission\.staged[\s\S]*combatOpeningWarmed = true;[\s\S]*combatDestructionEffectsWarmed = true;/.test(coveredWarm)) {
  throw new Error('the exact covered FX bind must retire duplicate opening/destruction countdown work');
}
if (!/export function stageCombatFxProgramSubmission\([\s\S]*fx\.warmOpeningEffects[\s\S]*fx\.impact[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush[\s\S]*createShell/.test(battleWarm)) {
  throw new Error('the typed battle warm owner must retain every covered FX family and tracer');
}
const deferredWarm = main.slice(
  main.indexOf('function scheduleDeferredCombatWarm(generation)'),
  main.indexOf('function* warmCombatOpeningPipelineSteps()'),
);
const enemyAt = deferredWarm.indexOf('streamBattleVisuals(');
const openingAt = deferredWarm.indexOf('warmCombatOpeningPipelineChunked(6, guardedYield)');
const rareAt = deferredWarm.indexOf('warmCombatRarePipelineChunked(6, guardedYield)');
if (!(enemyAt >= 0 && openingAt > enemyAt && rareAt > openingAt)) {
  throw new Error('hidden enemy receipts and fallback opening/rare work must retain countdown order');
}
if (!/const fxTextureP = ensureFxRuntime\(\)\.then[\s\S]{0,420}live\.preloadTextures[\s\S]{0,120}live\.warmTextures[\s\S]{0,160}stageRootTextureUploads\(live\.group, loadYield\)[\s\S]{0,900}fxTextureP/.test(main)) {
  throw new Error('solo entry must overlap exact FX atlas decode/install/upload with world construction');
}
if (!/if \(initiallyHidden\) \{[\s\S]{0,900}visual\.setVisible\?\.\(false\)[\s\S]{0,900}root\.removeFromParent\(\)[\s\S]{0,180}battleVisibilityDetached = true/.test(main)
  || !/actorVisible = ent\._spotFade > 0\.02;[\s\S]{0,160}setBattleVisualResident\(visual, actorVisible\)[\s\S]{0,100}visual\.setVisible\(actorVisible\)/.test(main)) {
  throw new Error('countdown-built enemy visuals must stay detached until a legal spotting edge');
}
if (!/function\* warmDestroyedRosterVariantsSteps\(\)[\s\S]*prebakeBurntSteps[\s\S]*setDestroyed/.test(main)
  || !/function\* warmCombatDestructionEffectSteps\(\)[\s\S]*fx\.destruction[\s\S]*fx\.propBreak[\s\S]*fx\.propCrush/.test(main)
  || !/function\* warmCombatRarePipelineSteps\(\)[\s\S]*yield\* warmCombatDestructionEffectSteps\(\)[\s\S]*compileHiddenVariantsSteps/.test(main)) {
  throw new Error('deferred warm lost a full-quality wreck/destruction/hidden-variant family');
}
if (!/finishedAtPreBattleS[\s\S]*doneBeforeRollout[\s\S]*battleWarmPending = false/.test(main)) {
  throw new Error('deferred warm must retain the one-second rollout hold and record completion');
}
if (!/setupBattle\(game, specId, world,[\s\S]{0,900}resetCombatRoundWarmState\(\)/.test(main)
  || !/function resetCombatRoundWarmState\(\)[\s\S]{0,520}combatOpeningWarmed = false;[\s\S]{0,80}combatPipelineWarmed = false;/.test(main)) {
  throw new Error('each new map/roster must receive a fresh opening and rare warm receipt');
}
if (!/deferredCombatWarmPromise === pending/.test(main)) {
  throw new Error('a cancelled round must not clear a newer deferred warm queue');
}
const hiddenVariants = main.slice(
  main.indexOf('function* compileHiddenVariantsSteps('),
  main.indexOf('// ---------------------------------------------------------------------------', main.indexOf('function* compileHiddenVariantsSteps(')),
);
if (!hiddenVariants.includes('yield* compileAll(e.visual.root)')
  || /initializeForwardProgramsSteps\(scene\)|renderer\.compile\(scene/.test(hiddenVariants)) {
  throw new Error('rare effects must never recompile the entire visible battlefield');
}
const routeAt = deferredWarm.indexOf('prepareNextOpeningRoute(game)');
const terrainAt = deferredWarm.indexOf(
  'battleWarm.warmBattleTerrainTiles({',
);
if (!/deferOpeningRoutes: !!opts\.deferVisuals/.test(main)
  || !(routeAt >= 0 && terrainAt > routeAt)
  || !/battleWarm\.warmBattleTerrainTiles\(\{[\s\S]{0,180}primePresentation: false/.test(deferredWarm)
  || !/opts\.deferOpeningRoutes\) game\.openingRouteJobs\.push\(prepareOpeningRoute\)/.test(state)) {
  throw new Error('solo A* routes and their terrain tiles must finish in the bounded deployment queue');
}

console.log('lazyRuntime.selftest: garage boot exclusion and opening/rare warm split passed');
