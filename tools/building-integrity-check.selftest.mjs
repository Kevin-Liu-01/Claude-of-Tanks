import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Building integrity (the buildings stream, 2026-10-12; the owner on Steinburg's gate tower, its pyramid roof standing
// over the walls with sky between and its dormers floating in the gap: "make sure our roofs dont have empty spots in
// them"). The checks must find each defect class on synthetic houses and leave a sound house alone (--self-test); the
// owner's two gate towers stay closed; and every kit builder, catalog builder and set piece holds its ledger row: no
// row adds a floating part or a sliver, or more than max(0.05 m2, 10 %) of an open kind's worst view.
const run = (...args) => spawnSync(process.execPath, ['tools/building-integrity-check.mjs', ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
const selfTest = run('--self-test');
assert.equal(selfTest.status, 0, `self-test exit ${selfTest.status}\n${selfTest.stdout}\n${selfTest.stderr}`);
assert.match(selfTest.stdout, /ok {3}a roof standing 1\.2 m clear of its walls: floating/);
assert.match(selfTest.stdout, /ok {3}a hollow house with a 0\.7 m hole in its roof/);
assert.match(selfTest.stdout, /self-test PASS/);

const LEDGER = 'docs/geometry-gate/building-integrity.json';
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const keys = Object.keys(ledger.rows);
assert.ok(keys.filter((k) => !k.startsWith('generic/') && !k.startsWith('landmark/')).length >= 300, 'the ledger covers every kit builder');
assert.ok(keys.some((k) => k.startsWith('generic/')) && keys.some((k) => k.startsWith('landmark/')), 'and the catalog builders and set pieces');
for (const key of keys.filter((k) => /^landmark\/urban:townGate#/.test(k))) {
  assert.equal(ledger.rows[key].floating, 0, `${key}: nothing floats on Steinburg's gate tower`);
  assert.equal(ledger.rows[key].gapM2, 0, `${key}: no sky between its roof and walls`);
}

const gate = run('--source=kits', '--profile=gate', `--ledger=${LEDGER}`, '--gate');
assert.equal(gate.status, 0, `ledger gate exit ${gate.status}\n${gate.stdout.split('\n').filter((l) => /LEDGER|ledger:/.test(l)).join('\n')}\n${gate.stderr}`);
assert.match(gate.stdout, /ledger: \d+ rows hold, 0 regress, 0 without a row/);
console.log(`building-integrity-check.selftest: self-test, gate towers and ${keys.length} ledger rows hold PASS`);
