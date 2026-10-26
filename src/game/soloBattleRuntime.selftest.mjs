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
// host a free sortie's default; 256 reverted it: the intent prepares the host thread only when soloAuthorityFor says host)
assert.match(main, /preloadSoloBattle: \(\) => (?:\(soloAuthorityFor\('standard'\)\.authority === 'host'\n\s+\? Promise\.all\(\[preloadSoloBattleRuntime\(\), multiplayerV2\.preload\(\), prepareSoloHost\(\)\]\) : )?preloadSoloBattleRuntime\(\)/,
  'main must give Battle intent the solo authority loader');
// 2026-10-26 (release 256, the owner: a solo game against bots must not create a multiplayer session): every solo battle is the
// page's own simulation by default; a local host only when ?soloAuthority=host forces it, pending the Rust lane's rework
const authorityFor = /\nfunction soloAuthorityFor\([\s\S]*?\n\}\n/.exec(main)?.[0] ?? '';
assert.ok(authorityFor, 'main.ts keeps the solo authority decision in soloAuthorityFor');
assert.match(authorityFor, /if \(SOLO_AUTHORITY_PARAM === 'host'\) return \{ authority: 'host', reason: 'forced' \};\n\s+return page\('default'\);\n\}/,
  'a solo battle is the page\'s by default; the host only when ?soloAuthority=host forces it');
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
console.log('soloBattleRuntime.selftest: garage exclusion and covered battle acquisition passed');
