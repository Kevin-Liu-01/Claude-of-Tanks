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
// The quick battle is a local battle (2026-10-29, the owner: "rubberbanding on a LOCAL game"; one core, two drivers): its
// intent warms the page's own simulation alone, and a solo entry never routes elsewhere. The solo sim Worker (261) and the
// solo local host (255) are gone, and so is the ?soloAuthority switch that reached them (tools/driver-boundaries.selftest.mjs
// guards the rest: no local-driver module reaches src/mp).
assert.match(main, /\n {2}preloadSoloBattle: \(\) => preloadSoloBattleRuntime\(\),\n/, "the Battle intent warms the page's own simulation alone");
assert.doesNotMatch(main, /soloAuthority|SOLO_AUTHORITY_PARAM|soloSim|soloHost|prepareSoloHost/, 'no solo authority switch, solo sim Worker or solo host is left');
assert.match(main, /\nfunction beginLocalBattleEntry\([\s\S]*?\n {2}return soloBattleEntry\.begin\(specId, mapId, options\);\n\}/,
  "the Garage's Battle press is a local battle: the solo entry's own begin");
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
console.log('soloBattleRuntime.selftest: garage exclusion, covered battle acquisition and the local battle (the page\'s own simulation, no authority switch) passed');
