// The combat anatomy step's parallel parts (268, tools/changed-only/parts.mjs) on a fixture roster, through the
// generator's own row assembly and serializer (tools/combat-anatomy-files.mjs):
//   - parts measured apart, written to their scratch dirs and merged write every file byte for byte as one process
//     does, for a whole run and an --ids run (rows kept, measured and missing from the committed table);
//   - a part keeps no row but its own and writes nothing outside its dir; an id two parts measured, a part's row for an id
//     the merge keeps, or a part of another tool is refused; the arguments the seats, spare-track and gun-line tools
//     take (partArgs) hand each id's part row to the merge once and refuse a row no id took;
//   - (the mutant) parts that each write the shared files themselves, as two --ids runs would, lose a part's rows: the
//     bytes differ from the whole run, and the chain's digests around the parts name every shared file they wrote.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { anatomyOutputFiles, anatomyRows } from './combat-anatomy-files.mjs';
import { movedShared, partArgs, partWriter, readPartRows, sharedDigests, writePartRows } from './changed-only/parts.mjs';

const TOOL = 'gen-combat-anatomy';
const scratch = mkdtempSync(join(tmpdir(), 'combat-anatomy-parts-'));
try {
  const roster = ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'n1', 'n2'];
  const groupById = { a1: 'alpha', a2: 'alpha', b1: 'beta', b2: 'beta', b3: 'beta', c1: 'charlie' }; // n1, n2: core
  // rows shaped as the real ones are awkward to serialize: integer-like keys (enumerated first), -0, tiny and long
  // floats, nulls, nested cells
  const measure = (id, salt = 0) => ({
    hull: { min: [-1.2345678, -0, 0.1 + salt], max: [1e-7, 2.5, 3.33333333] },
    turret: id.startsWith('n') ? null : { min: [-0.5, 1.1, -0.9], max: [0.5, 1.6, 0.9], sourceHash: `${id}${salt}` },
    tracks: { left: { min: [1, 0, -3], max: [1.5, 0.8, 3] }, right: { min: [-1.5, 0, -3], max: [-1, 0.8, 3] } },
    hullCollision: [{ 10: 'ten', 2: 'two', name: id }, [[0.1, 0.2], [0.3, salt]]],
    crewSeats: [{ role: 'driver', at: [0, 0.4, 1.9] }],
  });
  const measured = [];
  const measuring = (id) => { measured.push(id); return measure(id); };
  const committed = Object.fromEntries(roster.filter((id) => id !== 'n2').map((id) => [id, measure(id, 1)])); // n2: new
  const paths = (dir) => ({ outPath: join(dir, 'combatAnatomyCalibrations.ts'), groupDir: join(dir, 'combatAnatomyGroups'),
    loaderPath: join(dir, 'combatAnatomyLoaders.generated.ts') });
  const relativeFiles = (dir, files) => Object.fromEntries(Object.entries(files).map(([path, text]) => [relative(dir, path), text]));
  const filesOf = (dir, rows) => relativeFiles(dir, anatomyOutputFiles(rows, groupById, paths(dir)).outputs);
  /** The chain's split (tools/tank-regen-changed.mjs runCpuStep): round-robin over the ids. */
  const split = (ids, n) => { const lists = Array.from({ length: n }, () => []); ids.forEach((id, i) => lists[i % n].push(id)); return lists; };

  /** Parts measured into their dirs, then merged: the files the merge writes, and the dirs. */
  const viaParts = (label, only, n) => {
    const dirs = split(only ? [...only] : roster, n).map((list, k) => {
      const dir = join(scratch, label, `part${k}`);
      const rows = anatomyRows({ roster, only: new Set(list), committed, part: true, measure: measuring });
      assert.deepEqual(Object.keys(rows), roster.filter((id) => list.includes(id)), `${label} part ${k} keeps its own rows alone`);
      writePartRows(dir, TOOL, rows);
      return dir;
    });
    const merged = anatomyRows({ roster, only, committed, parts: readPartRows(dirs, TOOL),
      measure: (id) => assert.fail(`${label}: the merge measured ${id}, which a part had measured`) });
    return { files: filesOf(join(scratch, label, 'tree'), merged), dirs };
  };

  // 1. a whole run, one process against three parts
  const whole = filesOf(join(scratch, 'whole', 'tree'), anatomyRows({ roster, measure: measuring }));
  assert.ok(Object.keys(whole).length === 6, `the index, the loader map and four groups: ${Object.keys(whole)}`);
  measured.length = 0;
  const parted = viaParts('whole', null, 3);
  assert.deepEqual(measured.sort(), [...roster].sort(), 'each id measured once, in one part');
  assert.deepEqual(Object.keys(parted.files), Object.keys(whole), 'the same files');
  for (const [file, text] of Object.entries(whole)) assert.equal(parted.files[file], text, `${file}: byte-identical to the whole run`);

  // 2. an --ids run: kept rows, measured rows and an id the committed table lacks (measured though not selected)
  const only = new Set(['a2', 'b1', 'b3', 'c1']);
  measured.length = 0;
  const scoped = filesOf(join(scratch, 'scoped', 'tree'), anatomyRows({ roster, only, committed, measure: measuring }));
  assert.deepEqual(measured, ['a2', 'b1', 'b3', 'c1', 'n2'], 'an --ids run measures its ids and an id with no committed row');
  // the chain's parts list the selected ids; the merge measures an uncommitted id no part held
  measured.length = 0;
  const scopedParts = (() => {
    const dirs = split([...only], 2).map((list, k) => {
      const dir = join(scratch, 'scoped', `part${k}`);
      writePartRows(dir, TOOL, anatomyRows({ roster, only: new Set(list), committed, part: true, measure: measuring }));
      return dir;
    });
    return filesOf(join(scratch, 'scoped', 'tree'), anatomyRows({ roster, only, committed, parts: readPartRows(dirs, TOOL), measure: measuring }));
  })();
  assert.deepEqual(measured.sort(), ['a2', 'b1', 'b3', 'c1', 'n2'], 'parts measure the selected ids; the merge the uncommitted one');
  for (const [file, text] of Object.entries(scoped)) assert.equal(scopedParts[file], text, `--ids ${file}: byte-identical`);

  // 3. what a merge refuses, and the part's writer
  const twice = [join(scratch, 'twice', 'p0'), join(scratch, 'twice', 'p1')];
  writePartRows(twice[0], TOOL, { a1: measure('a1'), b1: measure('b1') });
  writePartRows(twice[1], TOOL, { b1: measure('b1'), c1: measure('c1') });
  assert.throws(() => readPartRows(twice, TOOL), /b1: measured by more than one --merge-from part/);
  assert.throws(() => readPartRows(parted.dirs, 'gen-vehicle-marking-seats'), /a part of gen-combat-anatomy/);
  assert.throws(() => anatomyRows({ roster, only, committed, parts: new Map([['a1', measure('a1')]]), measure }),
    /rows for ids this run does not measure: a1/, 'a part row for a kept id');
  assert.throws(() => anatomyRows({ roster, part: true, measure }), /a part measures --ids/);
  const tree = join(scratch, 'guard', 'tree'), home = join(scratch, 'guard', 'part0');
  const write = partWriter(home);
  write(join(home, 'rows.json'), '{}');
  assert.throws(() => write(join(tree, 'combatAnatomyCalibrations.ts'), 'x'), /writes only inside its own directory/,
    'a part cannot write a shared file');
  assert.throws(() => write(join(home, '..', 'part1', 'rows.json'), 'x'), /writes only inside its own directory/, 'nor a sibling part');
  // partArgs (seats, spare track, gun lines): a part needs --ids and never merges; a merge takes each row once
  assert.throws(() => partArgs([`--out-dir=${home}`], 'gen-x'), /a part \(--out-dir\) measures --ids/);
  assert.throws(() => partArgs(['--ids=a1', `--out-dir=${home}`, `--merge-from=${home}`], 'gen-x'), /never both/);
  assert.deepEqual(partArgs(['--ids=a1', `--out-dir=${home}`], 'gen-x').partDir, home);
  const plain = partArgs(['--ids=a1'], 'gen-x');
  assert.equal(plain.partDir ?? plain.merging, false, 'no part flags: a plain run');
  assert.equal(plain.take('a1'), undefined);
  plain.done();
  const xDirs = [join(scratch, 'args', 'p0'), join(scratch, 'args', 'p1')];
  writePartRows(xDirs[0], 'gen-x', { a1: { record: null }, b1: { record: { y: 1 } } });
  writePartRows(xDirs[1], 'gen-x', { c1: { record: { y: -0 } } });
  const merge = partArgs([`--merge-from=${xDirs.join(',')}`], 'gen-x');
  assert.equal(merge.merging, true);
  assert.deepEqual([merge.take('a1'), merge.take('b1'), merge.take('a1')], [{ record: null }, { record: { y: 1 } }, undefined], 'each row once');
  assert.throws(() => merge.done(), /rows for ids this run does not measure: c1/, 'a row no id of the merge took');
  assert.throws(() => partArgs([`--merge-from=${xDirs[0]}`], 'gen-y'), /a part of gen-x, not gen-y/);

  // 4. the mutant: parts that write the shared files themselves (each as an --ids run: the committed rows read at start,
  // its own measured), one after the other into one tree
  const raceTree = join(scratch, 'race', 'tree');
  const seed = filesOf(raceTree, committed);
  for (const [file, text] of Object.entries(seed)) { mkdirSync(join(raceTree, file, '..'), { recursive: true }); writeFileSync(join(raceTree, file), text); }
  const shared = Object.keys(seed);
  const before = sharedDigests(raceTree, shared);
  for (const list of split([...only], 2)) {
    const own = anatomyRows({ roster, only: new Set(list), committed, measure });
    for (const [file, text] of Object.entries(filesOf(raceTree, own))) writeFileSync(join(raceTree, file), text);
  }
  const raced = Object.fromEntries(shared.map((file) => [file, readFileSync(join(raceTree, file), 'utf8')]));
  const lost = shared.filter((file) => raced[file] !== scoped[file]);
  assert.ok(lost.length > 0, 'the mutant fails the byte rule: the last part overwrote the first part\'s rows');
  assert.ok(raced['combatAnatomyGroups/beta.generated.ts'] !== scoped['combatAnatomyGroups/beta.generated.ts'],
    'beta, split between the parts, lost one part\'s rows');
  assert.deepEqual(movedShared(before, sharedDigests(raceTree, shared)), shared.filter((file) => raced[file] !== seed[file]).sort(),
    'the chain\'s digests around the parts name every shared file a part wrote');
  assert.deepEqual(movedShared(before, sharedDigests(raceTree, shared).set('x.ts', 'new')), [...shared.filter((file) => raced[file] !== seed[file]), 'x.ts'].sort(),
    'and a file a part created');
  console.log(`combat-anatomy-parts.selftest: ${roster.length} fixture rows in 3 and 2 parts merge byte for byte as one run `
    + `(${Object.keys(whole).length} files); a part writes its own dir alone; the two-writer mutant lost rows in `
    + `${lost.length} of ${shared.length} shared files and the chain's digests named them`);
} finally {
  rmSync(scratch, { recursive: true, force: true }); // this receipt's own temporary tree
}
