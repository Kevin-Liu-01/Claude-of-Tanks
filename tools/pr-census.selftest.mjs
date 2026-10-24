// Receipt for the whole-PR draw census (tools/pr-census.mjs): the colour-pass and moving-frame deltas of a view (the
// alternate-frame cascade compared at its per-frame mean, not by a median's parity), the census rule's flags, the subtree
// deltas of the attribution, programs identified by their shading code, the holds' batches (a map's roots together, done
// jobs skipped), and the tool's order: the capture FIFO through runWarmHold, every pose's terrain stream settled before
// its sample.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { censusBatches, censusFlags, comparePrograms, compareView } from './pr-census.mjs';

const view = ({ scene, sceneTris, cascades, outerMedian, outerMean, extra = 20, rows = [], noCache = null }) => {
  const byLabel = { scene: { calls: scene, tris: sceneTris } };
  cascades.forEach((c, i) => { byLabel[`shadow-c${i}`] = { calls: c }; });
  byLabel['shadow-c3'] = { calls: outerMedian };
  const calls = scene + cascades.reduce((s, c) => s + c, 0) + outerMedian + extra;
  return { whole: { calls, byLabel }, attribution: { passes: { 'shadow-c3': { calls: outerMean } }, rows }, noCache };
};
{
  // the base's median frame drew no outer cascade, the branch's moving median drew all 95 of it; per frame both draw about
  // half of theirs (60 / 2 and 95 / 2): the moving delta compares those, not 0 against 95
  const a = view({ scene: 263, sceneTris: 2.6e6, cascades: [80, 71, 73], outerMedian: 0, outerMean: 30,
    rows: [{ pass: 'main', path: 'world-verdant/props', leaf: 'rock-beds', calls: 0 }, { pass: 'shadow-c0', path: 'world-verdant/props', leaf: 'bucket', calls: 10 }] });
  const nbLabels = { scene: { calls: 343 }, 'shadow-c0': { calls: 52 }, 'shadow-c1': { calls: 61 }, 'shadow-c2': { calls: 91 }, 'shadow-c3': { calls: 95 } };
  const b = view({ scene: 343, sceneTris: 3.83e6, cascades: [21, 3, 3], outerMedian: 3, outerMean: 2,
    rows: [{ pass: 'main', path: 'world-verdant/props', leaf: 'rock-beds', calls: 17 }],
    noCache: { calls: 343 + 52 + 61 + 91 + 95 + 20, byLabel: nbLabels, passes: { 'shadow-c3': { calls: 47.5 } },
      shadowRows: [{ pass: 'shadow-c0', path: 'world-verdant/props', leaf: 'bucket', calls: 14 }] } });
  const e = compareView(a, b);
  assert.equal(e.dScene, 80);
  assert.equal(Math.round(e.dSceneTrisPct), 47);
  assert.equal(e.shadowA, 224);
  assert.equal(e.shadowB, 30, 'as staged, the branch reuses its static copies');
  assert.equal(e.shadowBmoving, 299);
  assert.equal(e.movingA, 263 + 224 + 20 + 30);
  assert.equal(e.movingB, 343 + 204 + 20 + 47.5);
  // colour pass +80, the three every-frame cascades 224 → 204, the outer cascade 30 → 47.5 per frame
  assert.equal(e.dMoving, 80 - 20 + 17.5, 'the moving delta with the outer cascade at its per-frame mean');
  assert.deepEqual(e.main.map((r) => [r.key, r.d]), [['world/props :: rock-beds', 17]], 'the world root reads as world');
  assert.deepEqual(e.shadowMoving.map((r) => [r.key, r.d]), [['world/props :: bucket', 4]]);
  const flags = censusFlags({ chase: e });
  assert.ok(flags.some((f) => f.startsWith('scene draws chase +80')));
  assert.ok(flags.some((f) => f.startsWith('moving draws chase')));
  assert.ok(flags.some((f) => f.startsWith('scene tris chase +47')));
  // a build without the static cache has no moving reading of its own: no moving delta, no moving flag
  const plain = compareView(a, view({ scene: 265, sceneTris: 2.61e6, cascades: [80, 71, 73], outerMedian: 0, outerMean: 30 }));
  assert.equal(plain.dMoving, null);
  assert.deepEqual(censusFlags({ chase: plain }), [], 'two draws and 0.4 % triangles close the census');
}
{
  // programs by their shading code: a renamed shader-cache id or a re-minified onBeforeCompile is the same program
  const a = [{ main: 'aa', type: 'MeshStandardMaterial' }, { main: 'bb', type: 'ShaderMaterial', name: 'VolumetricCloudTrace' }];
  const b = [{ main: 'aa', type: 'MeshStandardMaterial' }, { main: 'cc', type: 'ShaderMaterial', name: 'VolumetricCloudTrace' }, { main: 'dd', type: 'ShaderMaterial' }];
  const p = comparePrograms(a, b);
  assert.equal(p.same, 1);
  assert.deepEqual(p.added.map((x) => x.main), ['cc', 'dd']);
  assert.deepEqual(p.gone.map((x) => x.main), ['bb']);
}
{
  // the holds' batches (2026-10-23, runWarmHold): map-major, so an even batch holds a map's base and branch together; a job
  // whose record says ok (or that failed twice) is not staged again
  const { queue, todo, batches } = censusBatches(['verdant', 'desert', 'monsoon'], ['/a', '/b'], ['main', 'pr'], 4,
    (job) => job.key === 'verdant-main');
  assert.equal(queue.length, 6);
  assert.deepEqual(todo.map((j) => j.key), ['verdant-pr', 'desert-main', 'desert-pr', 'monsoon-main', 'monsoon-pr']);
  assert.deepEqual(batches.map((b) => b.map((j) => j.key)), [['verdant-pr', 'desert-main', 'desert-pr', 'monsoon-main'], ['monsoon-pr']]);
  assert.deepEqual(censusBatches(['verdant'], ['/a', '/b'], ['main', 'pr'], 2).batches.map((b) => b.map((j) => j.root)), [['/a', '/b']]);
}
{
  // the tool's order: a browser tool takes the capture FIFO (its pages staged while queued, read inside the hold), and every
  // pose settles the terrain stream before the timer samples it
  const tool = readFileSync(new URL('./pr-census.mjs', import.meta.url), 'utf8');
  assert.match(tool, /await runWarmHold\(\{[^\n]*warm: warm\(batch\), shoot \}\)/, 'every batch is one warm hold');
  assert.match(tool, /process\.env\.COT_LANE_HOLD === '1'/, 'unless a lane hold already holds the FIFO');
  const body = tool.slice(tool.indexOf('async function readView'), tool.indexOf('async function capture('));
  const settle = body.indexOf('page.evaluate(settleResidencyTerrain)'), sample = body.indexOf('const s1 = await sampleFrames(');
  assert.ok(settle > 0 && settle < sample, 'the terrain stream settles before the first sample');
  assert.match(body, /noStaticCache: true[\s\S]*sampleFrames\(30\)[\s\S]*noStaticCache: false/, 'the moving reading, then the cache back on');
}
console.log('pr-census: colour-pass and moving-frame deltas (the alternate-frame cascade at its mean), flags, subtree deltas, programs by shading code, the holds\' batches, the FIFO and the terrain settle PASS');
