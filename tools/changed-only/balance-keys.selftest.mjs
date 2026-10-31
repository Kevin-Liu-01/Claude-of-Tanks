// The balance pass keyed per id on the real fleet (266, Main: a balance merge re-keyed every generator step on every id
// through the changed-only shared core, though ~19 ids' outputs moved). In a copy of the working tree's src and tools, a
// one-id lever on a combat leaf marks that id (and any id whose spec chain holds it) on the steps that key SPEC_COMBAT
// alone. Controls: a lever on a non-combat field marks the same ids on every step; a comment marks nothing; with the pass
// in the core (no BALANCE), the combat lever marks every id on every step. Manual (fleet suite): five fleet
// registrations, about three minutes. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, computeState, emptyManifest, recordStep, refreshComponents, resolveChanged } from './fingerprint.mjs';
import { BALANCE, SPEC_COMBAT, SPEC_REST, STEPS } from './steps.mjs';

const root = join(import.meta.dirname, '../..');
const [entry] = BALANCE.entries;
const source = readFileSync(join(root, entry), 'utf8');
// The lever goes last in the last pass the importer applies (applySameTierFairness), so no later line overrides it: the
// function's closing brace, found by counting braces outside strings and comments.
const opening = source.search(/^export function applySameTierFairness\(registry: TankSpecRegistry\): void \{$/m);
assert.ok(opening >= 0, `${entry}: applySameTierFairness, where the lever goes`);
let closing = -1;
for (let at = source.indexOf('{', opening), depth = 0; at < source.length && closing < 0; at += 1) {
  const char = source[at];
  if (char === '/' && source[at + 1] === '/') at = source.indexOf('\n', at);
  else if (char === '/' && source[at + 1] === '*') at = source.indexOf('*/', at) + 1;
  else if (char === "'" || char === '"' || char === '`') for (at += 1; source[at] !== char; at += source[at] === '\\' ? 2 : 1);
  else if (char === '{') depth += 1;
  else if (char === '}' && --depth === 0) closing = at;
}
assert.ok(closing > opening, 'the end of applySameTierFairness');
const dir = mkdtempSync(join(tmpdir(), 'cot-balance-keys-'));
try {
  const files = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', 'src', 'tools', 'package.json', 'package-lock.json'],
    { cwd: root, maxBuffer: 1 << 28 });
  execFileSync('/bin/sh', ['-c', 'tar --null -T - -cf - | tar -x -C "$1"', 'sh', dir], { cwd: root, input: files, maxBuffer: 1 << 28 });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  writeFileSync(join(dir, entry), source);

  const s0 = computeState({ root: dir });
  assert.deepEqual([s0.partition.balance.includes(entry), s0.partition.balanceReason, s0.partition.core.includes(entry)], [true, null, false],
    `the pass is out of the core (${s0.partition.balanceReason ?? 'ok'}; a stale pin prints the new one: re-pin steps.mjs BALANCE after review)`);
  assert.deepEqual(s0.globalReasons, []);
  // the lever's id: one no other spec chain holds, so exactly it moves
  const id = ['leo2a3', ...s0.ids].find((candidate) => s0.ids.includes(candidate)
    && s0.ids.every((other) => other === candidate || !s0.chainOf(other).includes(candidate)));
  const readers = STEPS.filter((step) => step.rowReads?.includes(SPEC_COMBAT)).map((step) => step.name);
  assert.ok(readers.includes('anatomy') && readers.includes('icons') && readers.length < STEPS.length, `readers: ${readers}`);
  const bootstrap = (state) => {
    const manifest = emptyManifest();
    for (const name of Object.keys(state.steps)) recordStep(manifest, name, null, Object.fromEntries(state.ids.map((one) => [one, state.inKey(name, one)])), state);
    return refreshComponents(manifest, state);
  };
  const marks = (state, manifest) => Object.fromEntries(Object.entries(resolveChanged(state, manifest)).map(([name, result]) => [name, result.ids]));
  const lever = (line) => writeFileSync(join(dir, entry), `${source.slice(0, closing)}  ${line}\n${source.slice(closing)}`);
  const m0 = bootstrap(s0);
  const only = (names) => Object.fromEntries(STEPS.map((step) => [step.name, names.includes(step.name) ? [id] : []]));
  const moved = (state) => Object.entries(state.rows).flatMap(([table, rows]) => Object.keys({ ...rows, ...s0.rows[table] })
    .filter((one) => rows[one] !== s0.rows[table]?.[one]).map((one) => `${table}[${one}]`)).sort();

  lever(`spec(registry, '${id}').hp += 1;`);
  const s1 = computeState({ root: dir });
  assert.deepEqual(moved(s1), [`${SPEC_COMBAT}[${id}]`], 'a combat lever moves its id\'s combat row alone');
  assert.equal(s1.core, s0.core, 'and leaves the core');
  assert.deepEqual(marks(s1, m0), only(readers), `a combat lever marks ${id} on ${readers.join(', ')} alone`);

  lever(`spec(registry, '${id}').weightTons += 0.5;`);
  const s2 = computeState({ root: dir });
  assert.deepEqual(moved(s2), [`${SPEC_REST}[${id}]`]);
  assert.deepEqual(marks(s2, m0), only(STEPS.map((step) => step.name)), `negative control: a non-combat lever marks ${id} on every step`);

  lever('// a comment');
  assert.deepEqual(marks(computeState({ root: dir }), m0), only([]), 'a comment marks nothing');

  // the shared-core key this replaces: the same combat lever marks every id on every step
  const core = { ...DEFAULT_CONFIG, balance: null };
  writeFileSync(join(dir, entry), source);
  const c0 = bootstrap(computeState({ root: dir, config: core }));
  lever(`spec(registry, '${id}').hp += 1;`);
  const c1 = marks(computeState({ root: dir, config: core }), c0);
  assert.ok(Object.values(c1).every((ids) => ids.length === s0.ids.length), 'control: through the core, every id on every step');
  console.log(`changed-only balance-keys.selftest: PASS (${s0.ids.length} ids; a ${id} combat lever marks it on ${readers.join(', ')}; a non-combat lever on all ${STEPS.length} steps; through the core, ${s0.ids.length} ids on every step)`);
} finally {
  rmSync(dir, { recursive: true, force: true }); // this receipt's own copy
}
