import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const access = await readFile(new URL('./soloBattleAccess.ts', import.meta.url), 'utf8');
const intent = await readFile(new URL('./battleIntentRuntime.ts', import.meta.url), 'utf8');
const loading = await readFile(new URL('./soloBattleLoadingRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(main, /from ['"]\.\/game\/state\.js['"]/, 
  'garage boot must not statically import solo battle authority');
assert.match(main, /from ['"]\.\/game\/soloBattleAccess\.ts['"]/,
  'the composition root uses the typed lazy-access owner');
assert.doesNotMatch(main, /\bsoloBattleRuntime\b\s*\?/,
  'world preparation must query the lazy owner instead of a removed runtime variable');
assert.match(main, /isReady:\s*isSoloBattleRuntimeReady/,
  'non-battle world activation uses the typed readiness contract');
assert.match(access, /import\(['"]\.\/soloBattleRuntime\.ts['"]\)/,
  'solo authority must be demand-loaded behind its typed boundary');
assert.match(main, /preloadSoloBattle: \(\) => preloadSoloBattleRuntime\(\)/,
  'main must give Battle intent the solo authority loader');
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
