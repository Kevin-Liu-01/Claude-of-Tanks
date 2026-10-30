import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./soloBattleAccess.ts', import.meta.url), 'utf8');
const intent = await readFile(new URL('./battleIntentRuntime.ts', import.meta.url), 'utf8');
const loading = await readFile(new URL('./soloBattleLoadingRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(main, /from ['"]\.\/game\/state\.(?:js|ts)['"]/, 
  'garage boot must not statically import solo battle authority');
assert.match(main, /from ['"]\.\/game\/soloBattleAccess\.ts['"]/,
  'the composition root uses the typed lazy-access owner');
assert.doesNotMatch(main, /\bsoloBattleRuntime\b\s*\?/,
  'world preparation must query the lazy owner instead of a removed runtime variable');
assert.match(main, /isReady:\s*isSoloBattleRuntimeReady/,
  'non-battle world activation uses the typed readiness contract');
assert.match(access, /import\(['"]\.\/soloBattleRuntime\.ts['"]\)/,
  'solo authority must be demand-loaded behind its typed boundary');
// (integ 254: rust-support-solve 14357f5225 warms the network composition beside it under ?soloAuthority=host; 255 made the
// host a free sortie's default; 256 reverted it; 261 makes the solo sim Worker the quick battle's: the intent prepares what
// soloAuthorityFor names for it, the Worker's chunk and battlefield by default, the host thread only when forced)
const preloadSolo = /preloadSoloBattle: \(\) => \{[\s\S]*?\n {2}\},\n/.exec(main)?.[0] ?? '';
assert.match(preloadSolo, /const \{ authority \} = soloAuthorityFor\('standard'\);/, 'main must give Battle intent the solo authority loader');
assert.match(preloadSolo, /if \(authority === 'host'\) return Promise\.all\(\[preloadSoloBattleRuntime\(\), multiplayerV2\.preload\(\), prepareSoloHost\(\)\]\);/);
assert.match(preloadSolo, /if \(authority === 'worker'\) return Promise\.all\(\[preloadSoloBattleRuntime\(\), soloSim\.preload\(\), prepareSoloSimWorker\(\)\]\);/,
  'the quick battle\'s intent loads the solo sim Worker\'s chunk and prepares its Worker (lazily: no boot request)');
assert.match(preloadSolo, /return preloadSoloBattleRuntime\(\);\n {2}\},/, 'a battle the page simulates warms the page\'s own solo alone');
// 2026-10-26 (release 256, the owner: a solo game against bots must not create a multiplayer session); 2026-10-27 (release
// 261, the owner's "yes"): the quick battle ran on the solo sim Worker by default; 2026-10-29 (the owner: "everything is now
// delayed laggy as if it was using the multiplayer architecture"): every solo battle runs locally on the page again, the
// Worker only when ?soloAuthority=worker forces it, the local host only when ?soloAuthority=host does
const authorityFor = /\nfunction soloAuthorityFor\([\s\S]*?\n\}\n/.exec(main)?.[0] ?? '';
assert.ok(authorityFor, 'main.ts keeps the solo authority decision in soloAuthorityFor');
assert.doesNotMatch(main, /SOLO_WORKER_MODES/, 'no mode flips to the Worker by default');
assert.match(authorityFor, /\n\s+if \(SOLO_AUTHORITY_PARAM === 'page'\) return page\('opt_out'\);\n\s+if \(campaign\) return page\('campaign'\);\n\s+if \(watch\) return page\('watch'\);/,
  'the page override, the campaign and a watched battle come first');
assert.match(authorityFor, /if \(readBrainSettings\(\)\.opponent === 'jev'\) return page\('jev'\);/, 'a battle Jev commands stays on the page');
assert.match(authorityFor, /if \(SOLO_AUTHORITY_PARAM === 'host'\) return \{ authority: 'host', reason: 'forced' \};\n\s+if \(SOLO_AUTHORITY_PARAM === 'worker'\) return \{ authority: 'worker', reason: 'forced' \};\n\s+return page\('local'\);\n\}/,
  'a solo battle runs on the page by default; the Worker and the host only when forced');
assert.equal((authorityFor.match(/\{ authority: 'worker', reason:/g) ?? []).length, 1, 'the forced branch is the only way a solo battle reaches the Worker');
assert.equal((authorityFor.match(/\{ authority: 'host', reason:/g) ?? []).length, 1, 'the forced branch is the only way a solo battle reaches the host');
assert.equal((main.match(/(?<!function )\bprepareSoloHost\(\)/g) ?? []).length, 1, 'only the host-gated Battle intent prepares the solo host thread');
assert.match(intent, /const preload = \([\s\S]{0,700}ignoreFailure\(preloadSoloBattle\)/,
  'Battle intent must overlap the solo authority transfer with garage dwell');
assert.match(main, /preloadSoloAuthority:\s*preloadSoloBattleRuntime/,
  'the composition root supplies the lazy solo authority to the loading owner');
assert.match(loading, /\(\) => preloadSoloAuthority\(\)/,
  'battle entry must include solo authority in its covered parallel barrier');

const runtime = await import('./soloBattleRuntime.ts');
for (const name of ['createCollider', 'prepareNextOpeningRoute', 'setupBattle', 'simStep']) {
  assert.equal(typeof runtime[name], 'function', `${name} remains exported by the lazy owner`);
}
console.log('soloBattleRuntime.selftest: garage exclusion, covered battle acquisition and the solo authority (the page by default, the Worker and the host when forced) passed');
