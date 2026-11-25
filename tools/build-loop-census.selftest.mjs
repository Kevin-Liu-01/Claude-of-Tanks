// build-loop-census.selftest.mjs — every Node loop that builds tank after tank or world after world awaits betweenBuilds()
// (build-loop-yield-277, 2026-11-24). An await-only build loop never ends its job, so every build's WeakRef targets and
// native canvases stayed resident (gen-interior-fills --all 31 GB, roadLife.selftest 8.1 GiB, gun-junction-census
// --update --all ~5 GB a minute). tools/build-loop-census.mjs reads the scripts under tools/ and src/; this receipt holds
// its rules on fixtures (negative controls included) and fails on every build loop of the tree without the yield, with
// file:line, outside BUILD_LOOP_EXCEPTIONS (whose rows must match the tree exactly).
import assert from 'node:assert/strict';
import { BUILD_LOOP_EXCEPTIONS, buildLoopsOf, census, openBuildLoops, parseScript } from './build-loop-census.mjs';

/** The loops of one fixture text: [{ line, kind, yields }]. */
const loopsIn = (text, outside) => buildLoopsOf(parseScript('fixture.mjs', text), outside).loops.map(({ line, kind, yields }) => ({ line, kind, yields }));

// 1. the rules -------------------------------------------------------------------------------------------------------
assert.deepEqual(loopsIn('for (const id of ids) { const t = createTank(id); t.dispose(); }'), [{ line: 1, kind: 'forof', yields: false }],
  'a tank build per id without the yield is a finding');
assert.deepEqual(loopsIn('for (const id of ids) { const t = createTank(id); t.dispose(); await betweenBuilds(); }'), [{ line: 1, kind: 'forof', yields: true }]);
assert.deepEqual(loopsIn('for (const id of ids) { createTank(id).dispose(); betweenBuilds(); }')[0].yields, false,
  'an un-awaited betweenBuilds() yields nothing');
assert.deepEqual(loopsIn('for (const m of maps) { props.createProps(f, e, 2002, cfg(m), veg); }')[0].yields, false, 'a member call builds too');
assert.deepEqual(loopsIn('for (let i = 0; i < n; i++) fleet.createTank(ids[i]);\nwhile (q.length) createMap(q.pop());').map((l) => l.kind), ['for', 'while']);
assert.deepEqual(loopsIn('const all = ids.map((id) => createTank(id));'), [{ line: 1, kind: '.map', yields: false }],
  'a per-element callback is a loop that cannot yield between its builds');
assert.deepEqual(loopsIn('for (const id of ids) { const n = id.length; total += n; }'), [], 'a loop that builds nothing is not read');
// a builder of the same file, to a fixpoint; one that awaits the yield itself covers its callers
const helpers = 'function stock(id) { const t = createTank(id); try { return 1; } finally { t.dispose(); } }\nconst twice = (id) => [stock(id), stock(id)];\n';
assert.deepEqual(loopsIn(`${helpers}for (const id of ids) twice(id);`).map((l) => l.yields), [false], 'a loop over a builder of a builder is a finding');
assert.deepEqual(loopsIn('async function build(m) { await betweenBuilds(); return createProps(m); }\nfor (const m of maps) { await build(m); }').map((l) => l.yields), [true],
  'a builder that awaits the yield itself (roadLife.selftest build()) covers its loop');
// nested: the inner loop's yield is in the outer's body
assert.deepEqual(loopsIn('for (const id of ids) for (const q of qs) { await betweenBuilds(); createTank(id, q); }').map((l) => l.yields), [true, true]);
// a builder exported by another script (a test-support module) counts by name
assert.deepEqual(loopsIn('for (const id of ids) gunHullProbe(id);', new Set(['gunHullProbe'])).map((l) => l.yields), [false]);
assert.deepEqual(buildLoopsOf(parseScript('support.mjs', 'export function probe(id) { return createTank(id); }\nexport const plain = () => 1;')).exported,
  new Set(['probe']), 'an exported builder is named for the other scripts');

// 2. the tree --------------------------------------------------------------------------------------------------------
const { files, parsed, loops } = census();
assert.ok(files > 2000 && parsed > 300, `the census reads the scripts (${files}; ${parsed} name a builder)`);
assert.ok(loops.length > 300, `the census finds the build loops (${loops.length})`);
for (const known of ['tools/gun-junction-census.mjs', 'tools/tank-sealed-check.mjs', 'tools/tank-watertight-check.mjs', 'tools/gen-interior-fills.mjs',
  'src/world/civic/roadLife.selftest.mjs']) assert.ok(loops.some((l) => l.file === known && l.yields), `${known}: its build loop is found and yields`);
const { open, stale } = openBuildLoops(loops);
assert.deepEqual(stale, [], `tools/build-loop-census.mjs BUILD_LOOP_EXCEPTIONS rows must match the tree:\n  ${stale.join('\n  ')}`);
assert.deepEqual(open.map((l) => `${l.file}:${l.line}: ${l.kind} builds ${l.builds.join(', ')}`), [],
  'await betweenBuilds() (tools/build-loop-yield.mjs) in every loop that builds tank after tank or world after world, once the '
  + 'last build is dropped; or name the loop in BUILD_LOOP_EXCEPTIONS with the reason nothing is free to go between its builds');
for (const [file, row] of Object.entries(BUILD_LOOP_EXCEPTIONS)) assert.ok(row.reason.length > 20, `${file}: an exception says why`);
console.log(`build-loop-census.selftest: ${parsed} of ${files} scripts name a builder, ${loops.length} build loops, every one yields `
  + `(${Object.keys(BUILD_LOOP_EXCEPTIONS).length} files excepted) PASS`);
