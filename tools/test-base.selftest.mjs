// The base a lane command diffs against (tools/test-diff.mjs suggestedBase, chooseBase `--base=integ`) on criss-cross
// history (266, the M60 lane: it merged integ/265, then main, after integ/265 had merged main; plain `git merge-base`
// picked main's commit, so the suggestion fell back to origin/main and 2,903 paths). A fixture repository with an
// origin: the lane's newest merge base that origin/main does not contain is integ's, and a lane that never merged integ
// gets no suggestion (the negative control). And a JSON table's moved ids, resolved row by row (tools/test-diff.mjs
// changedTankIds), and a one-id row file (a jsonRow table's <id>.json) as that id's row. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedTankIds, chooseBase, suggestedBase } from './test-diff.mjs';

const dir = mkdtempSync(join(tmpdir(), 'cot-test-base-'));
try {
  const origin = join(dir, 'origin.git'), work = join(dir, 'work');
  let clock = 1_700_000_000;
  const git = (cwd, ...args) => {
    clock += 60; // each commit a minute later: the newest base is unambiguous
    const date = `${clock} +0000`;
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }).trim();
  };
  const commit = (name) => { writeFileSync(join(work, `${name}.txt`), name); git(work, 'add', '.'); git(work, 'commit', '-q', '-m', name); return git(work, 'rev-parse', 'HEAD'); };
  const merge = (ref) => { git(work, 'merge', '-q', '--no-ff', '--no-edit', ref); return git(work, 'rev-parse', 'HEAD'); };
  git(dir, 'init', '-q', '--bare', origin);
  git(dir, 'init', '-q', '-b', 'main', work);
  commit('m0');
  git(work, 'switch', '-q', '-c', 'integ/265'); const i1 = commit('i1');
  git(work, 'switch', '-q', '-c', 'lane'); commit('l1');
  git(work, 'switch', '-q', 'main'); const m1 = commit('m1');
  git(work, 'switch', '-q', 'integ/265'); merge('main'); // integ merges main
  git(work, 'switch', '-q', 'main'); commit('m2');
  git(work, 'switch', '-q', 'lane'); merge('main'); // the lane merges the newer main
  git(work, 'remote', 'add', 'origin', origin);
  git(work, 'push', '-q', 'origin', 'main', 'integ/265');
  git(work, 'fetch', '-q', 'origin');

  const bases = git(work, 'merge-base', '--all', 'HEAD', 'origin/integ/265').split('\n').sort();
  assert.deepEqual(bases, [i1, m1].sort(), 'the fixture is criss-cross: two merge bases, one of them on origin/main');
  const suggestion = suggestedBase(work, 'origin/main');
  assert.deepEqual([suggestion?.name, suggestion?.mergeBase], ['integ/265', i1], 'the base origin/main does not contain is integ\'s');
  const said = [], log = console.log;
  console.log = (line) => said.push(line);
  try { assert.equal(chooseBase(work, 'integ', 'test:lane'), i1, '--base=integ takes it'); } finally { console.log = log; }
  assert.match(said.join('\n'), /--base=integ: origin\/integ\/265 at /);

  // negative control: a lane that never merged integ has every base on origin/main
  git(work, 'switch', '-q', '-c', 'plain', 'origin/main'); commit('p1');
  assert.equal(suggestedBase(work, 'origin/main'), null, 'a lane without integ commits gets no suggestion');

  // a requested local branch behind its origin branch is the origin branch (267: --base=main took the shared checkout's
  // stale main and a lane saw 21,662 paths); one with commits origin lacks is kept, with a warning
  const based = (requested) => {
    said.length = 0;
    console.log = (line) => said.push(line);
    try { return chooseBase(work, requested, 'test:lane'); } finally { console.log = log; }
  };
  assert.equal(based('main'), 'main', 'a local main at origin/main is taken as asked');
  assert.deepEqual(said, [], 'silently');
  git(work, 'branch', '-f', 'main', m1);
  assert.equal(based('main'), 'origin/main', 'a local main behind origin/main is origin/main');
  assert.match(said.join('\n'), /--base=main: the local main is 1 commit behind origin\/main; diffing against origin\/main/);
  git(work, 'branch', '-f', 'main', 'plain');
  assert.equal(based('main'), 'main', 'a local main with its own commits is kept');
  assert.match(said.join('\n'), /warning: --base=main: the local main has 1 commit origin\/main lacks/);

  // a JSON table's moved rows, compared row by row (the 55 MB icons manifest's 2,055,741-line diff took git 182 s): the
  // working tree's edit to row a marks a alone; an edit outside the rows marks every id the file holds
  const table = { schemaVersion: 1, tanks: { a: { view: 1 }, b: { view: 2 }, c: { view: 3 } } };
  writeFileSync(join(work, 'assets.json'), JSON.stringify(table, null, 1));
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'assets');
  const partition = { ids: ['a', 'b', 'c'], core: new Set(), groups: {}, groupChain: () => [], fileIds: { 'assets.json': ['a', 'b', 'c'] },
    jsonRows: new Map([['assets.json', ['tanks']]]) };
  const moved = () => [...changedTankIds(partition, ['assets.json'], { root: work, mergeBase: git(work, 'rev-parse', 'HEAD') }).ids.keys()].sort();
  writeFileSync(join(work, 'assets.json'), JSON.stringify({ ...table, tanks: { ...table.tanks, a: { view: 9 } } }, null, 1));
  assert.deepEqual(moved(), ['a'], 'a row edit marks its id alone');
  writeFileSync(join(work, 'assets.json'), JSON.stringify({ ...table, schemaVersion: 2 }, null, 1));
  assert.deepEqual(moved(), ['a', 'b', 'c'], 'an edit outside the rows marks every id (negative control)');
  writeFileSync(join(work, 'assets.json'), JSON.stringify(table, null, 2));
  assert.deepEqual(moved(), [], 'reformatting alone moves no row');
  // a jsonRow table's file holds one id's row (266: public/icons/tank-assets/tanks/<id>.json): that id's row, no diff read
  const rowFiles = { ...partition, fileIds: { 'rows/b.json': ['b'], 'assets.json': ['a', 'b', 'c'] }, jsonRows: new Map() };
  const marked = (paths) => changedTankIds(rowFiles, paths, {}).ids;
  assert.deepEqual([...marked(['rows/b.json']).keys()], ['b'], 'a one-id row file marks its id alone');
  assert.equal(marked(['rows/b.json']).get('b')[0], 'rows/b.json row', 'as a resolved row, with no diff');
  assert.deepEqual([...marked(['assets.json']).keys()].sort(), ['a', 'b', 'c'], 'a many-id table with no diff marks every id (negative control)');

  // a module table's moved rows, its exports imported on both sides (267: auxiliaryInventory, auxiliaryRoofGuns and the
  // combat anatomy groups are one-line literals, so any hunk named every id): a plain literal, and a codec's decoded rows
  // whose relative import binds to the tree
  const rowsLine = (rows) => `export const ROWS: Readonly<Record<string, { view: number }>> = ${JSON.stringify(rows)};`;
  const module = (rows, packed, comment = 'generated') => `// ${comment}\nimport type { Packed } from './codec.ts';\n`
    + `import { decode } from './codec.ts';\n${rowsLine(rows)}\nexport const PACKED = decode(${JSON.stringify(packed)} as Packed);\n`;
  const rows = { a: { view: 1 }, b: { view: 2 }, c: { view: 3 } }, packed = [['a', 1], ['b', 2], ['c', 3]];
  writeFileSync(join(work, 'package.json'), '{ "type": "module" }\n');
  writeFileSync(join(work, 'codec.ts'), 'export type Packed = [string, number][];\n'
    + 'export const decode = (rows: Packed) => Object.fromEntries(rows.map(([id, body]) => [id, { body }]));\n');
  writeFileSync(join(work, 'table.generated.ts'), module(rows, packed));
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'module table');
  const tables = { ...partition, fileIds: { 'table.generated.ts': ['a', 'b', 'c'] }, jsonRows: new Map(),
    moduleRows: new Map([['table.generated.ts', ['ROWS', 'PACKED']]]) };
  const movedRows = () => {
    const { ids } = changedTankIds(tables, ['table.generated.ts'], { root: work, mergeBase: git(work, 'rev-parse', 'HEAD') });
    return Object.fromEntries([...ids].map(([id, why]) => [id, why.join('; ')]));
  };
  const edited = rowsLine({ ...rows, b: { view: 9 } });
  assert.ok(['a', 'b', 'c'].every((id) => edited.includes(`"${id}"`)), 'the edited line names every id (what the hunk reader marked)');
  writeFileSync(join(work, 'table.generated.ts'), module({ ...rows, b: { view: 9 } }, packed));
  assert.deepEqual(movedRows(), { b: 'table.generated.ts row' }, 'a one-line literal\'s row edit marks its id alone');
  writeFileSync(join(work, 'table.generated.ts'), module(rows, [['a', 1], ['b', 2], ['c', 4]]));
  assert.deepEqual(movedRows(), { c: 'table.generated.ts row' }, 'a decoded row moves through the tree\'s codec');
  writeFileSync(join(work, 'table.generated.ts'), module(rows, packed, 'regenerated'));
  assert.deepEqual(movedRows(), {}, 'a comment moves no row');
  writeFileSync(join(work, 'table.generated.ts'), `${module(rows, packed)}export const = ;\n`);
  assert.deepEqual(movedRows(), { a: 'table.generated.ts (rows unresolved)', b: 'table.generated.ts (rows unresolved)',
    c: 'table.generated.ts (rows unresolved)' }, 'a side that cannot be imported marks every id (negative control)');
  console.log('test-base.selftest: criss-cross history suggests integ\'s own merge base; a lane without integ commits gets none; a stale '
    + 'local --base is its origin branch; JSON and module tables resolve row by row; a one-id row file is its id\'s row');
} finally {
  rmSync(dir, { recursive: true, force: true }); // this receipt's own fixture
}
