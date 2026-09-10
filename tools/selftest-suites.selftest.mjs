import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import ts from 'typescript-compiler-api';

function nestedSelftests(source) {
  const imports = [];
  const visit = node => {
    const specifier = ts.isImportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
    if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.endsWith('.selftest.mjs')) imports.push(specifier.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('test.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  return imports;
}

assert.deepEqual(nestedSelftests(`// import './comment.selftest.mjs';\nconst text = "import './string.selftest.mjs'";`), []);
assert.deepEqual(nestedSelftests(`import './static.selftest.mjs';\nawait import(\n'./dynamic.selftest.mjs'\n);`),
  ['./static.selftest.mjs', './dynamic.selftest.mjs']);

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedScripts = {
  pre: 'node tools/run-selftests.mjs pre',
  core: 'node tools/run-selftests.mjs core',
  post: 'node tools/run-selftests.mjs post',
};
assert.equal(packageJson.scripts.pretest, expectedScripts.pre);
assert.equal(packageJson.scripts.test, expectedScripts.core);
assert.equal(packageJson.scripts.posttest, expectedScripts.post);

let total = 0;
const listed = [];
for (const [name, files] of Object.entries(SELFTEST_SUITES)) {
  assert.ok(files.length > 0, name + ' suite is empty');
  assert.equal(new Set(files).size, files.length, name + ' suite has duplicate entries');
  for (const file of files) {
    assert.match(file, /\.mjs$/, file + ' is not an executable check');
    assert.ok(existsSync(file), file + ' does not exist');
    if (file.endsWith('.selftest.mjs')) assert.deepEqual(nestedSelftests(readFileSync(file, 'utf8')), [],
      file + ': do not execute other registered self-tests; extract shared fixtures into test-support modules');
  }
  listed.push(...files);
  total += files.length;
}
assert.equal(new Set(listed).size, listed.length,
  'a regression check must have exactly one lifecycle owner');

const repositorySelftests = [
  execFileSync('git', ['ls-files', '-z', '*.selftest.mjs'], { encoding: 'utf8' }),
  execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard', '*.selftest.mjs'], {
    encoding: 'utf8',
  }),
].join('').split('\0').filter((file) => file && existsSync(file)).sort();
const listedSelftests = listed.filter((file) => file.endsWith('.selftest.mjs')).sort();
assert.deepEqual(listedSelftests, repositorySelftests,
  'every repository self-test must execute in exactly one npm test lifecycle suite');

console.log('selftest-suites.selftest: ' + total + ' ordered checks are discoverable');
