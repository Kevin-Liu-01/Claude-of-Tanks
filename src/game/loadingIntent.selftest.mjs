import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.ts'), 'utf8');
const garage = fs.readFileSync(path.join(here, '..', 'ui', 'garage.ts'), 'utf8');
const pedestalPreloader = fs.readFileSync(
  path.join(here, 'garagePedestalPreloader.ts'), 'utf8',
);
const pedestalRuntime = fs.readFileSync(
  path.join(here, 'garagePedestalRuntime.ts'), 'utf8',
);
const studioAccess = fs.readFileSync(path.join(here, 'studioAccess.ts'), 'utf8');
const soloLoading = fs.readFileSync(path.join(here, 'soloBattleLoadingRuntime.ts'), 'utf8');
const soloStartAccess = fs.readFileSync(path.join(here, 'soloBattleStartAccess.ts'), 'utf8');
const playSurface = fs.readFileSync(path.join(here, 'playSurfaceRuntime.ts'), 'utf8');
const networkLobbyPreloader = fs.readFileSync(
  path.join(here, '..', 'net', 'networkLobbyPreloader.ts'), 'utf8',
);
const networkCompositionAccess = fs.readFileSync(
  path.join(here, '..', 'net', 'networkCompositionAccess.ts'), 'utf8',
);
const lobbyIntent = fs.readFileSync(
  path.join(here, '..', 'mp', 'session', 'lobbyIntent.ts'), 'utf8',
);
const browserComposition = fs.readFileSync(
  path.join(here, '..', 'mp', 'session', 'browserComposition.ts'), 'utf8',
);
const debugBattleEntry = fs.readFileSync(
  path.join(here, '..', 'dev', 'debugBattleEntryRuntime.ts'), 'utf8',
);

const neighborWarm = pedestalPreloader.slice(
  pedestalPreloader.indexOf('const queueNeighbors = () =>'),
  pedestalPreloader.indexOf('const preloadIntent ='),
);
assert.ok(
  neighborWarm.indexOf('await ensureTankBuilders(ids);') <
    neighborWarm.indexOf('for (const id of ids)'),
  'adjacent family chunks must transfer before their texture pre-bakes',
);

const garageTree = ts.createSourceFile('garage.ts', garage, ts.ScriptTarget.Latest, true);
const intentNodes = [];
function findIntent(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(garageTree) === 'signalBattleIntent') {
    intentNodes.push(node.initializer);
  }
  ts.forEachChild(node, findIntent);
}
findIntent(garageTree);
assert.equal(intentNodes.length, 1, 'find the actual intent callback independently of its typed signature');
const battleIntent = intentNodes[0].getText(garageTree);
assert.match(battleIntent, /battleMode === 'solo'/,
  'only solo mode may start the solo roster/world warm');
assert.match(battleIntent, /onPlayModeIntent\?\.\(battleMode\)/,
  'network modes should warm their own selected path');
class IntentNode {}
for (const mode of ['solo', 'private', 'lan']) {
  const calls = [], multiplayerTarget = new IntentNode();
  const intent = new Function('opts', 'battleMode', 'Node', 'multiplayerEntry', 'selectedId', 'selectedMapId',
    `return ${stripTypeScriptTypes(battleIntent)};`)(
    { onBattleIntent: value => calls.push(['solo', value]), onPlayModeIntent: value => calls.push(['network', value]) },
    mode, IntentNode, { contains: target => target === multiplayerTarget }, 'm1a1', 'coastal');
  intent({ target: multiplayerTarget });
  assert.deepEqual(calls, [], 'multiplayer configuration must not warm a solo battle');
  intent({ target: new IntentNode() });
  assert.deepEqual(calls, mode === 'solo'
    ? [['solo', { specId: 'm1a1', mapId: 'coastal' }]] : [['network', mode]],
  `${mode}: actual callback warms only its selected path`);
}

assert.match(garage,
  /pointerenter[\s\S]{0,120}signalTankIntent\(spec\.id\)[\s\S]{0,500}pointerdown[\s\S]{0,120}signalTankIntent\(spec\.id, true\)/,
  'vehicle cards must expose deliberate hover and immediate press intent');
assert.match(garage, /garage\.roomReminder\.readyCount/,
  'active-room visible readiness copy must use the locale catalog');
assert.match(garage, /garage\.roomReminder\.aria/,
  'active-room assistive copy must use the locale catalog');
assert.doesNotMatch(garage, /'PRIVATE'\} ROOM|NOT READY'\} ·/,
  'active-room status must not rebuild English-only fragments');
assert.match(pedestalPreloader,
  /const preloadIntent = \(specId: string\)[\s\S]{0,800}Promise\.all\(\[[\s\S]{0,220}ensureTankBuilder\(specId\)[\s\S]{0,300}prebakeSharedTextures/,
  'tank intent must overlap the exact builder transfer and chunked texture bake');
assert.match(main, /createGaragePedestalRuntime\(\{/,
  'main must compose one typed garage-hero lifecycle owner');
assert.match(pedestalRuntime, /createGaragePedestalPreloader\(\{/,
  'the lifecycle owner must compose neighbor and pointer-intent warming');
assert.match(main, /onTankIntent: pedestal\.preloadIntent/,
  'garage vehicle intent must be wired to the runtime loader');
assert.match(main, /createSoloBattleStartAccess\(\{/,
  'main should compose one typed solo activation owner');
assert.doesNotMatch(main, /function startBattle\(/,
  'solo activation policy must not return to the composition root');
assert.match(soloStartAccess,
  /load = \(\) => import\('\.\/soloBattleStartRuntime\.ts'\)/,
  'Garage boot must not evaluate solo-round activation policy');
const activationPreload = soloLoading.indexOf('() => preloadBattleStart()');
const activationHandoff = soloLoading.indexOf('startBattle(specId, resolved');
assert.ok(activationPreload >= 0 && activationHandoff > activationPreload,
  'covered loading must acquire the activation owner before its synchronous handoff');

// Multiplayer (the cutover of 2026-09-29, docs/MULTIPLAYER-V2.md §13.10): the lobby's Garage presence loads with
// the Play menu and the browser composition loads behind explicit room intent; the solo boot path evaluates
// nothing under src/mp.
assert.match(lobbyIntent, /createNetworkLobbyPreloader\(\{ \.\.\.preloader, preloadChat/,
  'joined rooms need one typed lobby-intent owner over the room preloader');
assert.match(networkLobbyPreloader, /for \(const player of state\.players \|\| \[\]\)[\s\S]{0,260}missingBuilders\.push\(specId\)[\s\S]{0,280}ensureTankBuilders\(missingBuilders\)/,
  'joined rooms should transfer only missing roster builders');
assert.match(networkLobbyPreloader, /if \(nextMapId\) prefetchWorld\(nextMapId, \{ intent: true \}\);/,
  'joined-room fixed maps should use explicit-intent background preparation, not passive Garage construction');
assert.match(main, /import\('\.\/mp\/session\/lobbyIntent\.ts'\)/,
  'the lobby owner loads with the menu, never on the boot path');
assert.match(main, /import\('\.\/mp\/session\/browserComposition\.ts'\)/,
  'the complete multiplayer composition must remain behind explicit network intent');
assert.doesNotMatch(main, /^import (?!type)[^\n]* from '\.\/mp\//m,
  'the solo boot path imports nothing under src/mp at module evaluation (types only)');
assert.doesNotMatch(main, /import\('\.\/net\/networkBattleComposition\.ts'\)|createNetworkBrowserSessionRuntime|readMultiplayerV2Flag|mp=v2/,
  'the v1 composition, its session runtime and the opt-in switch left main with the cutover');
assert.match(main, /createPlaySurfaceRuntime\(\{/,
  'main should compose one typed play-surface lifecycle owner');
const playSurfaceComposition = main.slice(
  main.indexOf('const playSurface = createPlaySurfaceRuntime({'),
  main.indexOf("bus.on('ui:battleStart'"),
);
const commonPlayPreload = playSurfaceComposition.slice(
  playSurfaceComposition.indexOf('preloadCommon:'),
  playSurfaceComposition.indexOf('preloadNetworkPresentation:'),
);
assert.doesNotMatch(commonPlayPreload, /multiplayerV2\.preload|preloadBattleClientRuntime/,
  'solo intent must never transfer the multiplayer composition or the battle client runtime');
const networkPlayPreload = playSurfaceComposition.slice(playSurfaceComposition.indexOf('preloadNetworkPresentation:'));
assert.match(networkPlayPreload, /multiplayerV2\.preload\(\)/,
  'network intent must acquire its isolated orchestration graph');
assert.match(networkPlayPreload, /preloadBattleClientRuntime\(\)/,
  'network intent should still overlap the shared battle client transfer');
for (const runtime of [
  'networkRoundLifecycle',
  'networkBattlePresentationAccess',
  'networkBattleLaunchRuntime',
  'networkLobbyPreloader',
  'networkRoomCoordinator',
  'networkBattleActivationRuntime',
  'networkBattleComposition',
]) {
  assert.doesNotMatch(main, new RegExp(`import \\{[^}]*create[^}]*\\} from './net/${runtime}\\.ts'`),
    `${runtime} must stay out of the pristine Garage graph`);
}
assert.match(networkCompositionAccess,
  /pending = request[\s\S]{0,180}pending === request[\s\S]{0,80}pending = null/,
  'a failed first-visit network composition transfer must remain retryable');
assert.doesNotMatch(playSurfaceComposition, /^\s*preloadKillcamModule,$/m,
  'cold composition must not read the later killcam binding from its temporal dead zone');
assert.match(playSurfaceComposition, /\(\) => preloadKillcamModule\(\)/,
  'the later killcam binding stays behind a lazy lifecycle port');
assert.doesNotMatch(main, /function preloadPlayMode\(/,
  'mode preload and retry policy must not return to the composition root');
assert.match(playSurface, /export interface PlaySurfaceRuntime/,
  'play intent should cross a stable typed interface');
assert.match(main, /preloadPresentation: \(\) => multiplayerV2\.preload\(\)/,
  'a joined waiting room should keep the composition warm');
assert.match(browserComposition,
  /await Promise\.all\(\[\s*load\.loadModules\(\),\s*load\.ensureBattleVisuals\(\),\s*load\.loadWorld\(active\.mapId/,
  'network entry should join modules, visual initialization and battlefield construction inside one parallel acquisition');
const networkWorldAdapter = main.slice(main.indexOf('loadWorld: (mapId: string'),
  main.indexOf('recordTrace: (trace) => { window.__NETWORK_LOAD = trace; }'));
// batch 27 (2026-09-15): a Frontline Assault room also hands the trench terrain variant through
const coveredWorldOptions = /ensureWorld\(mapId, onProgress, \{ precompile: false, atmosphere: 'covered-battle', \.\.\.\(terrainVariant \? \{ terrainVariant \} : \{\}\) \}\)/;
assert.match(networkWorldAdapter, coveredWorldOptions,
  'network acquisition must defer Garage-light compilation and select covered battle atmosphere');
assert.doesNotMatch(networkWorldAdapter.replace("atmosphere: 'covered-battle'", "atmosphere: 'garage'"),
  coveredWorldOptions, 'a Garage-atmosphere regression must fail the loading contract');
assert.doesNotMatch(networkWorldAdapter.replace('precompile: false', 'precompile: true'),
  coveredWorldOptions, 'an eager-compilation regression must fail the loading contract');
assert.match(main,
  /Promise\.all\(\[[\s\S]{0,500}armorAimOverlay\.preload\(\)\.catch/,
  'network entry must acquire the optional armor overlay under its loading veil');
assert.match(main,
  /async function debugStartBattle[\s\S]{0,240}import\('\.\/dev\/debugBattleEntryRuntime\.ts'\)/,
  'cold QA entry policy must stay demand-loaded outside the composition root');
assert.match(debugBattleEntry,
  /await Promise\.all\(\[[\s\S]{0,420}ports\.preloadSoloAuthority\(\)[\s\S]{0,120}ports\.ensureBattleHud\(\)[\s\S]{0,120}ports\.ensureTouchControls\(\)[\s\S]{0,120}ports\.preloadArmorAim\(\)/,
  'cold QA entry must acquire every battle-only presentation owner before setup');

assert.match(garage, /\[data-nav="studio"\], \[data-mobile-nav="studio"\]/,
  'desktop and mobile Studio controls should expose an intent boundary');
assert.match(main, /function preloadStudioIntent\(\) \{ studioAccess\.preloadIntent\(\); \}/,
  'main should delegate Studio intent to the typed lazy owner');
assert.match(studioAccess,
  /preloadIntent\(\)[\s\S]{0,180}preloadModule\(\)[\s\S]{0,100}preloadFxModule\(\)/,
  'Studio intent should transfer its route and effect chunks');
assert.match(studioAccess, /Promise\.all\(\[\s*preloadModule\(\),\s*ensureFxRuntime\(\)/,
  'Studio entry should reuse the intent-preloaded chunk and construct FX only on entry');

console.log('loadingIntent.selftest: solo, multiplayer, garage-neighbor, and Studio boundaries passed');
