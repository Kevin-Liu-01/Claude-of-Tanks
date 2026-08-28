import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.ts'), 'utf8');
const garage = fs.readFileSync(path.join(here, '..', 'ui', 'garage.js'), 'utf8');
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
const networkLaunch = fs.readFileSync(
  path.join(here, '..', 'net', 'networkBattleLaunchRuntime.ts'), 'utf8',
);
const networkLobbyPreloader = fs.readFileSync(
  path.join(here, '..', 'net', 'networkLobbyPreloader.ts'), 'utf8',
);
const networkPresentationAccess = fs.readFileSync(
  path.join(here, '..', 'net', 'networkBattlePresentationAccess.ts'), 'utf8',
);
const networkPresentation = fs.readFileSync(
  path.join(here, '..', 'net', 'networkBattlePresentationRuntime.ts'), 'utf8',
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

const battleIntent = garage.slice(
  garage.indexOf('const signalBattleIntent = () =>'),
  garage.indexOf("roomReminder.addEventListener('click'"),
);
assert.match(battleIntent, /battleMode === 'solo'/,
  'only solo mode may start the solo roster/world warm');
assert.match(battleIntent, /onPlayModeIntent\?\.\(battleMode\)/,
  'network modes should warm their own selected path');

assert.match(garage,
  /pointerenter[\s\S]{0,120}signalTankIntent\(s\.id\)[\s\S]{0,500}pointerdown[\s\S]{0,120}signalTankIntent\(s\.id, true\)/,
  'vehicle cards must expose deliberate hover and immediate press intent');
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
assert.match(soloLoading,
  /\(\) => preloadBattleStart\(\)[\s\S]{0,900}startBattle\(specId, resolved/,
  'covered loading must acquire the activation owner before its synchronous handoff');

assert.match(main, /createNetworkLobbyPreloader\(\{/,
  'joined rooms need one typed lobby-intent owner');
assert.match(networkLobbyPreloader, /for \(const player of state\.players \|\| \[\]\)[\s\S]{0,260}missingBuilders\.push\(specId\)[\s\S]{0,280}ensureTankBuilders\(missingBuilders\)/,
  'joined rooms should transfer only missing roster builders');
assert.match(networkLobbyPreloader, /if \(nextMapId\) prefetchWorld\(nextMapId\);/,
  'fixed host maps should use the quiet background world path');
assert.match(main, /createNetworkBattlePresentationAccess\(\{/,
  'main should compose one intent-loaded network presentation owner');
assert.doesNotMatch(main, /async function presentNetworkBattle\(/,
  'the cold network lifecycle must not return to the composition root');
assert.match(networkPresentationAccess,
  /load = \(\) => import\('\.\/networkBattlePresentationRuntime\.ts'\)/,
  'Garage boot must not evaluate the multiplayer-only presentation runtime');
assert.match(main, /createPlaySurfaceRuntime\(\{/,
  'main should compose one typed play-surface lifecycle owner');
const playSurfaceComposition = main.slice(
  main.indexOf('const playSurface = createPlaySurfaceRuntime({'),
  main.indexOf("bus.on('ui:battleStart'"),
);
assert.doesNotMatch(playSurfaceComposition, /^\s*preloadKillcamModule,$/m,
  'cold composition must not read the later killcam binding from its temporal dead zone');
assert.match(playSurfaceComposition, /\(\) => preloadKillcamModule\(\)/,
  'the later killcam binding stays behind a lazy lifecycle port');
assert.doesNotMatch(main, /function preloadPlayMode\(/,
  'mode preload and retry policy must not return to the composition root');
assert.match(playSurface, /export interface PlaySurfaceRuntime/,
  'play intent should cross a stable typed interface');
assert.match(main,
  /preloadPresentation: \(\) => networkBattlePresentation\.preload\(\)/,
  'a joined waiting room should keep the presentation runtime warm');
assert.match(networkPresentation,
  /entry\.acquire\(\{[\s\S]{0,180}loadModules: entry\.loadModules/,
  'network entry should delegate the intent-preloaded module join');
assert.match(networkPresentation,
  /loadWorld:[\s\S]{0,180}entry\.loadWorld\(mapId[\s\S]{0,300}connect: async \(\) =>/,
  'network entry should delegate modules, battlefield construction, and connection setup');
assert.match(networkPresentation,
  /connect: async \(\) => \{[\s\S]{0,160}await connectMatch\(\)[\s\S]{0,240}match\.close\?\.\('network_entry_cancelled'\)/,
  'a transport resolving after room closure must be retired before publication');
assert.match(networkLaunch, /connectAfterWorld: role === 'host'/,
  'browser authority must wait for world collision while cold clients connect concurrently');
assert.match(main,
  /Promise\.all\(\[[\s\S]{0,500}armorAimOverlay\.preload\(\)\.catch/,
  'network entry must acquire the optional armor overlay under its loading veil');
assert.match(networkLaunch, /await loadPrivateMatch\(\)/,
  'private handoff should join the mode-intent preload');
assert.match(networkLaunch, /await loadDedicatedMatch\(\)/,
  'ranked entry should join the mode-intent preload');
assert.match(main,
  /async function debugStartBattle[\s\S]{0,760}preloadSoloBattleRuntime\(\)[\s\S]{0,100}ensureBattleHud\(\)[\s\S]{0,100}ensureTouchControls\(\)[\s\S]{0,100}armorAimOverlay\.preload\(\)/,
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
