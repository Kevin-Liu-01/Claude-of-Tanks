// tools/assert-graph-guard.mjs, the runtime half of the Object3D-assert policy: in a child that preloads it (as every
// self-test child does), a failing equality assert on a three.js graph object or a raycast hit on one fails fast with
// identity labels; passing asserts and asserts on plain values keep node's behaviour and messages. Every import form
// is guarded: the default export, named imports, assert/strict and a destructured method.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
// The runner's flag (tools/run-selftests.mjs SELFTEST_GRAPH_GUARD, held there by run-selftests.selftest); spelled here so
// this receipt's inputs stay the guard alone.
const SELFTEST_GRAPH_GUARD = `--import=${new URL('./assert-graph-guard.mjs', import.meta.url).href}`;

const run = (body) => spawnSync(process.execPath, ['--max-old-space-size=512', '--input-type=module', '-e', body], {
  encoding: 'utf8', timeout: 60_000,
  // only the guard: the child gets no other options or variables (its heap cap is the argument above)
  env: { NODE_OPTIONS: SELFTEST_GRAPH_GUARD },
});
// A scene large enough that node's own message (inspect at depth 1000, then a line diff) would not fit 512 MB.
const SCENE = `import * as THREE from 'three';
const scene = new THREE.Group(); scene.name = 'scene';
const geometry = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial()); m.name = 'part' + i; m.position.x = i; scene.add(m); }
scene.updateMatrixWorld(true);
const ray = new THREE.Raycaster(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(1, 0, 0));
const hit = ray.intersectObject(scene, true)[0];
`;
// Every failing form in one child: each case runs in its own try and reports its message (a whole-graph dump would
// exhaust the 512 MB heap and kill the child instead).
const CASES = [
  ['a raycast hit', `assert.equal(hit, undefined, 'ray must miss')`, /^ray must miss\nassert\.equal on a three\.js graph object .*actual hit Mesh "part0"/],
  ['two scenes', `assert.deepEqual(scene, scene.clone())`, /expected Group "scene"/],
  ['a named import', `strictEqual(scene.children[1].parent, null)`, /actual Group "scene"/],
  ['legacy assert', `legacy.notEqual(scene, scene)`, /^assert\.notEqual on a three\.js graph object/],
  ['destructured', `equal([hit], [])`, /actual \[hit Mesh "part0"/],
  ['an Error message', `assert.equal(scene, null, new TypeError('own error'))`, /^own error$/],
];
const failing = run(SCENE + `import assert from 'node:assert/strict'; import legacy from 'node:assert'; import { strictEqual } from 'node:assert';
const { equal } = assert; const out = [];
${CASES.map(([, call]) => `try { ${call}; out.push(null); } catch (error) { out.push(error.message); }`).join('\n')}
console.log(JSON.stringify(out));`);
assert.equal(failing.status, 0, failing.stderr);
const messages = JSON.parse(failing.stdout.trim().split('\n').at(-1));
CASES.forEach(([label, , pattern], index) => assert.match(String(messages[index]), pattern, `${label}: ${messages[index]}`));

// Passing calls pass; plain values keep node's message.
const ok = run(SCENE + `import assert from 'node:assert/strict'; import legacy from 'node:assert';
assert.equal(scene.children[0].parent, scene); assert.notEqual(hit, undefined); assert.deepEqual([scene], [scene]);
legacy.equal(scene, scene); legacy.notStrictEqual(scene, null);
try { legacy.notDeepEqual([scene, 1], [scene, '1']); throw new Error('passed'); } catch (error) { if (error.message === 'passed') throw new Error('a loose-equal pair passed notDeepEqual'); }
try { assert.equal(1, 2); } catch (error) { if (!/1 !== 2/.test(error.message)) throw error; }
const sentinel = new Proxy({}, { get() { throw new Error('must not be inspected'); }, has() { throw new Error('must not be inspected'); } });
assert.equal(sentinel, sentinel); assert.notEqual(sentinel, null); legacy.strictEqual(sentinel, sentinel);
console.log('passed');`);
assert.equal(ok.status, 0, ok.stderr);
assert.match(ok.stdout, /passed/);
console.log('assert-graph-guard.selftest: hits, scenes, named, legacy, destructured and Error-message forms fail fast with labels; passing and plain asserts unchanged; a sentinel that throws on every read passes through');
