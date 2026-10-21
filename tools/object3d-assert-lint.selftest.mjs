// The Object3D-assert lint (tools/object3d-assert-lint.mjs, test-speed PLAN R10, 2026-10-16): it flags the four 226
// T-72 X receipt lines that ran to 28-40 GB (verbatim below from b383cf010^), every operand shape it reads (tree links,
// mesh buffers and materials, lookups, constructors, variables, loop and callback items, local helpers, the assert
// import forms), and none of the value comparisons beside them; the allowlist marker accepts one call only with a reason,
// from a real comment, and goes stale when its call is fixed; the rewrites keep each assertion's verdict (they still
// fail on a defect) while the failure message shrinks to a line; and every receipt in the repository lints clean.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { applyFixes, lintRepo, lintSources, REPO_ROOT } from './object3d-assert-lint.mjs';
import { graphLabels } from './receipt-kit.test-support.mjs';

const HEAD = `import assert from 'node:assert/strict';\nimport * as THREE from 'three';\n`;
const file = name => resolve(REPO_ROOT, 'src/vehicles/profiles', name);
const lint = (text, name = 'case.selftest.mjs') => lintSources(new Map([[file(name), text]]));
const lines = result => result.findings.map(row => row.line);

// 1. The original pattern, verbatim from the four T-72 receipts before b383cf010: each line is one finding, with both
// operands named, and the value assert sharing the line is not.
const ORIGINAL = HEAD + [
  'function checkGearAndMachineGun(tank){',
  "  const gunMesh=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=gunMesh.parent;",
  "  assert.equal(group.parent,tank.root.getObjectByName('rig_turret'));",
  '  assert.deepEqual(group.userData.barrelAxisLocal,[0,0,1]);',
  '}',
  'function ownerAndContact(tank){',
  "  const mesh=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=mesh.parent,yaw=tank.root.getObjectByName('rig_turret');",
  '  assert.equal(group.parent,yaw);assert.deepEqual(group.userData.barrelAxisLocal,[0,0,1]);',
  '}',
  'function sourceForms(t){',
  "  const mg=t.root.getObjectByName('sourceMachineGun_turretDark');assert.equal(mg.parent.parent,t.root.getObjectByName('rig_turret'));",
  '}',
  'function gearAndFitting(tank){',
  "  const gun=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=gun.parent;",
  "  assert.equal(group.parent,tank.root.getObjectByName('rig_turret'));",
  '}',
].join('\n');
const original = lint(ORIGINAL, 't72b3XGeometry.selftest.mjs');
assert.deepEqual(lines(original), [5, 10, 13, 17], 'all four T-72 lines, and not the barrel-axis deepEqual');
// Both operands are named on every line (on the second, `yaw` is read through its initializer).
assert.deepEqual(original.findings.map(row => `${row.op}: ${row.reason}`),
  Array(4).fill('equal: actual .parent; expected getObjectByName()'));

// 2. Operand shapes: each `flag` line must be flagged, each `pass` line must not.
const SHAPES = HEAD + `
const root = new THREE.Group(), scene = new THREE.Scene(), other = new THREE.Mesh(), x = {}, n = 3;
const tank = make(), sound = {}, stats = {}, el = {}, node = {}, spec = {}, texture = {}, peer = {}, key = 'wrapS', g = make();
assert.equal(other.parent, null); // flag
assert.strictEqual(other.material, x.material); // flag
assert.notEqual(other.geometry, x.geometry); // flag
assert.deepEqual(scene.children, [root, other]); // flag
const turret = tank.root.getObjectByName('turret');
assert.equal(turret, x); // flag
for (const child of root.children) assert.equal(child, x); // flag
root.traverse(o => assert.equal(o, x)); // flag
const findGun = r => r.getObjectByName('gun');
assert.equal(findGun(tank.root), x); // flag
assert.equal(new THREE.Mesh(), x); // flag
assert.strict.equal(other.parent, x); // flag
assert.equal(root.children[0], other); // flag
assert.equal(x.mat.map, x); // flag
let held; held = tank.root.getObjectByName('held');
assert.equal(held, x); // flag
assert.equal(x.hullMesh, x); // flag
assert.deepEqual([x, [scene, 1]], [x, [scene, 1]]); // flag
assert.equal(g.index, null); // flag
for (const [kind, mesh] of [['lamp', other], ['relay', root]]) { assert.equal(mesh, x); /* flag */ assert.equal(x.kind, kind); }
assert.equal(other.parent?.name, 'turret'); // pass
assert.equal(other.uuid, x.uuid); // pass
assert.ok(other.parent === x); // pass
assert.equal(sound.material, 'brick'); // pass
assert.equal(stats.materials, n - 1); // pass
assert.notEqual(other.parent, null); // pass
assert.deepEqual(other.userData.axis, [0, 0, 1]); // pass
assert.equal(el.dataset.group, x); // pass
assert.equal(node.getAttribute('href'), x); // pass
assert.equal(texture[key], peer[key]); // pass
assert.deepEqual(spec.armor.turretPivot, [0, 1.6, 0]); // pass
assert.equal(root.children.length, 2); // pass
const text = "assert.equal(other.parent, x)"; // pass
x.equal(other.parent, x); // pass
`;
const shapes = lint(SHAPES), shapeLines = SHAPES.split('\n');
const expected = shapeLines.flatMap((line, index) => /\/[/*] flag\b/.test(line) ? [index + 1] : []);
assert.equal(expected.length, 17);
assert.deepEqual(lines(shapes), expected,
  `flagged: ${shapes.findings.map(row => `${row.line} ${row.reason}`).join(' | ')}`);
assert.match(shapes.findings.find(row => row.line === expected[5]).reason, /item of \.children|element of \.children/);
assert.match(shapes.findings.find(row => row.line === expected[6]).reason, /item of traverse\(\)/);
assert.match(shapes.findings.find(row => row.line === expected[7]).reason, /findGun\(\) returns getObjectByName\(\)/);

// The import forms: direct named imports, `strict` from the legacy module, and the legacy loose module itself.
const IMPORTS = `import { equal, deepEqual as same } from 'node:assert/strict';\nimport { strict as check } from 'node:assert';
import loose from 'node:assert';\nconst a = {}, b = {};
equal(a.parent, b);\nsame(a.children, []);\ncheck.equal(a.parent, b);\nloose.equal(a.parent, b);\nloose.equal(a.parent?.id, b.id);\n`;
assert.deepEqual(lines(lint(IMPORTS)), [5, 6, 7, 8]);

// 3. The allowlist: a reasoned marker on the line or the line above accepts one call; a reasonless marker and a marker
// on no flagged call fail; the marker text inside a string is not a marker.
const ALLOW = HEAD + `const a = {}, b = {};
// object3d-assert-ok: take.scene is a Studio scene id string
assert.equal(a.scene, b);
assert.equal(a.parent, b); // object3d-assert-ok: a counted parent index
// object3d-assert-ok
assert.equal(a.root, b);
// object3d-assert-ok: nothing flagged here
assert.equal(a.name, b.name);
const s = '// object3d-assert-ok: in a string'; assert.equal(a.mesh, b);
`;
const allow = lint(ALLOW);
assert.deepEqual(allow.allowed.map(row => [row.line, row.allow]),
  [[5, 'take.scene is a Studio scene id string'], [6, 'a counted parent index']]);
assert.deepEqual(allow.badAllow.map(row => row.line), [8]);
assert.deepEqual(allow.stale.map(row => row.line), [9]);
assert.deepEqual(lines(allow), [11], 'a marker inside a string literal accepts nothing');
// One marker, one call: a second flagged call on the marker's line, or on the line after a marker that already
// accepted its own line's call, is a finding.
const ONCE = HEAD + `const a = {}, b = {};
// object3d-assert-ok: one reason
assert.equal(a.scene, b); assert.equal(a.parent, b);
assert.equal(a.root, b); // object3d-assert-ok: its own line
assert.equal(a.mesh, b);
`;
const once = lint(ONCE);
assert.deepEqual(once.allowed.map(row => row.line), [5, 6]);
assert.deepEqual(lines(once), [5, 7], 'the second call under each marker is flagged');
assert.deepEqual(once.stale, []);

// 4. Rewrites: identity asserts become booleans and deep asserts compare identity labels; the result lints clean.
const BEFORE = `import assert from 'node:assert/strict';
import { near } from '../../../tools/receipt-kit.test-support.mjs';
export function check(a, b, list, msg) {
  assert.equal(a.parent, b.parent, msg);
  assert.notStrictEqual(a.material, b.material);
  assert.equal(b.parent ?? a, a.parent);
  assert.deepEqual(a.children, list, msg);
  assert.equal(a.geometry /* shared */, b.geometry);
}
`;
const before = lint(BEFORE, 'rewrite.selftest.mjs');
assert.deepEqual(lines(before), [4, 5, 6, 7, 8]);
assert.equal(before.findings.at(-1).fix, null, 'a comment between the operands is left for a hand edit');
const after = applyFixes(BEFORE, before.findings);
assert.deepEqual([after.applied, after.skipped], [4, 1]);
assert.equal(after.text, `import assert from 'node:assert/strict';
import { near, graphLabels } from '../../../tools/receipt-kit.test-support.mjs';
export function check(a, b, list, msg) {
  assert.ok(a.parent === b.parent, msg);
  assert.ok(a.material !== b.material);
  assert.ok((b.parent ?? a) === a.parent);
  assert.deepEqual(graphLabels(a.children), graphLabels(list), msg);
  assert.equal(a.geometry /* shared */, b.geometry);
}
`);
assert.deepEqual(lines(lint(after.text, 'rewrite.selftest.mjs')), [8]);
// A file without a kit import gains one after its last import; the legacy loose module keeps == semantics; an
// attribute's deepEqual (by value: it has no uuid) and a directly imported equal() stay for a hand edit.
const LEGACY = `import assert from 'node:assert';\nimport { equal } from 'node:assert/strict';\nconst a = {}, b = {};
assert.equal(a.parent, b);\nassert.deepEqual(a.children, b.children);\nassert.deepEqual(a.geometry.index, b.index);\nequal(a.parent, b);\n`;
const legacy = lint(LEGACY, 'legacy.selftest.mjs');
const legacyAfter = applyFixes(LEGACY, legacy.findings);
assert.deepEqual([legacyAfter.applied, legacyAfter.skipped], [2, 2]);
assert.equal(legacyAfter.text, `import assert from 'node:assert';\nimport { equal } from 'node:assert/strict';
import { graphLabels } from '../../../tools/receipt-kit.test-support.mjs';\nconst a = {}, b = {};
assert.ok(a.parent == b);\nassert.deepEqual(graphLabels(a.children), graphLabels(b.children));\nassert.deepEqual(a.geometry.index, b.index);\nequal(a.parent, b);\n`);

// 5. Mutation: the rewritten assertions keep their verdicts on real three.js objects and fail on a seeded defect, with
// a one-line message where the original dumped and diffed both graphs.
const body = code => code.split('\n').filter(line => !line.startsWith('import ')).join('\n').replace(/^export /m, '');
const run = (code, a, b, list) => new Function('assert', 'graphLabels', 'a', 'b', 'list', `${body(code)}\ncheck(a, b, list);`)(
  assert, graphLabels, a, b, list);
const fixture = () => {
  const turret = new THREE.Group(), a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  turret.add(a);
  const b = new THREE.Mesh(a.geometry, new THREE.MeshBasicMaterial());
  turret.add(b);
  return { a, b, list: [...a.children] };
};
for (const code of [BEFORE, after.text]) {
  const f = fixture();
  assert.doesNotThrow(() => run(code, f.a, f.b, f.list), 'sound tree: both forms pass');
}
const defects = [
  ['reparented', f => { new THREE.Group().add(f.b); }, /a\.parent === b\.parent|Expected values to be strictly equal/],
  ['material shared', f => { f.b.material = f.a.material; }, /a\.material !== b\.material|strictly unequal/],
  ['child added', f => { f.a.add(new THREE.Object3D()); }, /Object3D #\d+|deep-equal/],
];
for (const [name, seed, message] of defects) {
  const original = fixture(), rewritten = fixture();
  seed(original); seed(rewritten);
  assert.throws(() => run(BEFORE, original.a, original.b, original.list), assert.AssertionError, `${name}: the original fails`);
  let error;
  try { run(after.text, rewritten.a, rewritten.b, rewritten.list); } catch (caught) { error = caught; }
  assert.ok(error instanceof assert.AssertionError, `${name}: the rewrite still fails on the defect`);
  assert.match(error.message, message, `${name}: ${error.message}`);
  assert.ok(error.message.length < 600, `${name}: a short message (${error.message.length} chars)`);
}

// 6. The per-file result cache reuses a result only for identical bytes: an edited file is linted afresh, and
// { cache: false } (COT_SELFTEST_CACHE=0) never reads it.
const scratch = mkdtempSync(join(tmpdir(), 'object3d-assert-lint-'));
try {
  const cachePath = join(scratch, 'cache.json'), receipt = join(scratch, 'probe.selftest.mjs');
  const options = { root: scratch, files: ['probe.selftest.mjs'], cachePath, cache: true };
  writeFileSync(receipt, ORIGINAL);
  const cold = lintRepo(options), warm = lintRepo(options);
  assert.deepEqual([cold.reused, cold.findings.length, warm.reused, warm.findings.length], [0, 4, 1, 4]);
  assert.deepEqual(warm.findings.map(({ fix, ...row }) => row), cold.findings.map(({ fix, ...row }) => row), 'a reused result is the result');
  writeFileSync(receipt, ORIGINAL.replace("assert.equal(group.parent,yaw);", "assert.ok(group.parent===yaw);"));
  const edited = lintRepo(options);
  assert.deepEqual([edited.reused, lines(edited)], [0, [5, 13, 17]], 'one changed byte range re-lints the file');
  writeFileSync(receipt, ORIGINAL);
  assert.deepEqual([lintRepo(options).reused, lintRepo({ ...options, cache: false }).reused], [1, 0]);
  // Two files with the same bytes share a key: each still reports its own four findings, cold and warm.
  writeFileSync(join(scratch, 'twin.selftest.mjs'), ORIGINAL);
  const pair = { ...options, files: ['probe.selftest.mjs', 'twin.selftest.mjs'], cachePath: join(scratch, 'pair.json') };
  const pairCold = lintRepo(pair), pairWarm = lintRepo(pair);
  assert.deepEqual([pairCold.findings.length, pairWarm.reused, pairWarm.findings.length], [8, 2, 8]);
} finally { rmSync(scratch, { recursive: true, force: true }); }

// 7. The repository: every receipt lints clean, and each allowlisted call says why.
const repo = lintRepo();
assert.ok(repo.files > 1500, `receipts listed (${repo.files})`);
assert.deepEqual(repo.findings.map(row => `${row.file}:${row.line} ${row.text}`), [],
  'equality asserts on three.js graph objects: compare booleans, uuids, names or ids (node tools/object3d-assert-lint.mjs --fix)');
assert.deepEqual([...repo.stale, ...repo.badAllow].map(row => `${row.file}:${row.line}`), []);
for (const row of repo.allowed) assert.ok(row.allow.length >= 12, `${row.file}:${row.line}: a reason, not a token`);

console.log(`object3d-assert-lint.selftest: the four T-72 lines, ${expected.length} operand shapes, the import forms, the allowlist, `
  + `the rewrites and their mutation verdicts, the byte-keyed cache pass; ${repo.files} receipts clean (${repo.allowed.length} allowlisted, `
  + `${repo.reused} reused)`);
