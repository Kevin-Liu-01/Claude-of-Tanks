// The battle memory receipt's judge (tools/battle-memory-probe.mjs; docs/PERF-SPIKES.md "Memory across battles"): the
// growth is measured from the first battle's return to the garage to the last (the first battle's one-time builds are
// not growth), per battle; every budget limit is judged and a reading the probe did not take fails; the flags parse.
import assert from 'node:assert/strict';
import { growthOf, judgeMemory, parseMemoryArgs } from './battle-memory-probe.mjs';

const at = (jsHeapMB, nodes, textures, total, gpu) => ({
  jsHeapMB, nodes, listeners: 40, documents: 1, textures, geometries: 100, programs: 60, sceneObjects: 900,
  rss: { total, gpu, renderer: total - gpu, browser: 0, other: 0 },
});

// the boot garage, then three battles' returns: the first battle's builds (boot → return 1) are not growth
const returns = [at(80, 2000, 10, 1500, 400), at(200, 2600, 90, 2900, 1200), at(230, 2650, 95, 3100, 1300), at(260, 2700, 100, 3300, 1400)];
const growth = growthOf(returns);
assert.deepEqual(growth.jsHeapMB, { total: 60, perBattle: 30 }, 'the heap growth runs from the first return to the last, a battle at a time');
assert.deepEqual(growth.textures, { total: 10, perBattle: 5 });
assert.deepEqual(growth.rssMB, { total: 400, perBattle: 200 });
assert.deepEqual(growth.gpuMB, { total: 200, perBattle: 100 });
assert.equal(growthOf(returns.slice(0, 2)), null, 'one battle has no growth to measure');

const budget = { limits: { jsHeapGrowthPerBattleMB: 40, texturesGrowthPerBattle: 4, rssGrowthPerBattleMB: 250, peakRssMB: 4000, listenersGrowthPerBattle: 50 } };
const verdicts = Object.fromEntries(judgeMemory({ growth, peakRss: { total: 3600 } }, budget).map((v) => [v.name, v]));
assert.equal(verdicts.jsHeapGrowthPerBattleMB.verdict, 'PASS');
assert.equal(verdicts.texturesGrowthPerBattle.verdict, 'FAIL', 'a texture a battle past the limit fails');
assert.equal(verdicts.rssGrowthPerBattleMB.verdict, 'PASS');
assert.equal(verdicts.peakRssMB.verdict, 'PASS');
assert.equal(verdicts.listenersGrowthPerBattle.value, 0);
assert.equal(judgeMemory({ growth }, budget).find((v) => v.name === 'peakRssMB').verdict, 'FAIL', 'a peak the probe did not take fails');
// (--leak-check) a released world still alive after a return fails; a cached or current one does not
const leakBudget = { limits: { leakedWorlds: 0 } };
const alive = (label, extra) => ({ label, mapId: label, alive: true, cached: false, current: false, ...extra });
const leakedRecord = { growth, returns: [
  { worldsAlive: [alive('1_urban', { current: true })] },
  { worldsAlive: [alive('1_urban', { cached: true }), alive('2_verdant', { current: true })] },
  { worldsAlive: [alive('1_urban'), alive('2_verdant', { cached: true }), alive('3_desert', { current: true })] },
] };
assert.equal(judgeMemory(leakedRecord, leakBudget)[0].value, 1);
assert.equal(judgeMemory(leakedRecord, leakBudget)[0].verdict, 'FAIL', 'a released world still alive fails');
leakedRecord.returns[2].worldsAlive[0].alive = false;
assert.equal(judgeMemory(leakedRecord, leakBudget)[0].verdict, 'PASS', 'collected, it passes');
assert.equal(judgeMemory({ growth, returns: [{}] }, leakBudget)[0].verdict, 'FAIL', 'unchecked (no --leak-check) fails');

const options = parseMemoryArgs(['--scenarios=urban:zone_control,verdant:standard', '--size=21', '--battles=4', '--gate', '--out=/tmp/x']);
assert.deepEqual(options.scenarios, ['urban:zone_control', 'verdant:standard']);
assert.equal(options.size, 21);
assert.equal(options.battles, 4);
assert.equal(options.gate, true);
assert.throws(() => parseMemoryArgs(['--authority=host']), /unknown flag --authority/, 'a battle is a local battle: no authority switch');
assert.throws(() => parseMemoryArgs(['--battles=1']), /at least 2/);
assert.throws(() => parseMemoryArgs(['--scenarios=urban']), /<map>:<mode>/);
assert.throws(() => parseMemoryArgs(['--nope']), /unknown flag/);
console.log('battle-memory-probe.selftest: growth from the first return a battle at a time, every limit judged, a released world alive fails, flags PASS');
