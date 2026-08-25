import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.js'), 'utf8');
const garage = fs.readFileSync(path.join(here, '..', 'ui', 'garage.js'), 'utf8');

const neighborWarm = main.slice(
  main.indexOf('function queuePedestalTexturePrefetch()'),
  main.indexOf('function setPedestalTank('),
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
assert.match(main,
  /function preloadPedestalIntent\(specId\)[\s\S]{0,800}Promise\.all\(\[[\s\S]{0,220}ensureTankBuilder\(specId\)[\s\S]{0,300}prebakeSharedTextures/,
  'tank intent must overlap the exact builder transfer and chunked texture bake');
assert.match(main, /onTankIntent: preloadPedestalIntent/,
  'garage vehicle intent must be wired to the runtime loader');

assert.match(main, /function preloadNetworkLobbyIntent\(state\)/,
  'joined rooms need an exact lobby-intent warm boundary');
assert.match(main, /for \(const player of state\.players \|\| \[\]\)[\s\S]{0,100}rosterIds\.push\(player\.specId\)[\s\S]{0,100}ensureTankBuilders\(rosterIds\)/,
  'joined rooms should transfer the actual roster families');
assert.match(main, /prefetchWorld\(mapId\);/,
  'fixed host maps should use the quiet background world path');
assert.match(main, /const \[networkModules\] = await Promise\.all\(\[\s*preloadNetworkBattleModules\(\)/,
  'network entry should join the intent-preloaded module promise');
assert.match(main, /await preloadPrivateMatchHandoffModule\(\)/,
  'private handoff should join the mode-intent preload');
assert.match(main, /await preloadDedicatedClientModule\(\)/,
  'ranked entry should join the mode-intent preload');

assert.match(garage, /\[data-nav="studio"\], \[data-mobile-nav="studio"\]/,
  'desktop and mobile Studio controls should expose an intent boundary');
assert.match(main, /function preloadStudioIntent\(\)[\s\S]*?preloadStudioModule\(\)/,
  'Studio intent should transfer its route chunk');
assert.match(main, /Promise\.all\(\[\s*preloadStudioModule\(\),\s*ensureFxRuntime\(\)/,
  'Studio entry should reuse the intent-preloaded chunk and construct FX only on entry');

console.log('loadingIntent.selftest: solo, multiplayer, garage-neighbor, and Studio boundaries passed');
