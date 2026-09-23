import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { repinReceipt, planEdits, planArraySwap, applyEdits, applyArraySwap, failedReceiptsFromLog, diffLines } from './receipt-repin.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const dir = mkdtempSync(join(tmpdir(), 'receipt-repin-'));
const fixture = (name, body) => { const file = join(dir, name); writeFileSync(file, body); return file; };
try {
  // 1. A quoted 64-hex digest moves: every quoted occurrence is rewritten from the receipt's own output, and the
  //    receipt passes on the next round. Two rows share the stale digest to prove the "every occurrence" rule.
  const current = sha('current build'), stale = sha('stale build');
  const digestFile = fixture('digest.selftest.mjs', `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const GOLDEN = { high: '${stale}', low: "${stale}" };
assert.equal(sha('current build'), GOLDEN.high, 'high digest');
assert.equal(sha('current build'), GOLDEN.low, 'low digest');
console.log('digest fixture PASS');
`);
  const digestDry = repinReceipt(digestFile, { dry: true });
  assert.equal(digestDry.ok, false); assert.equal(digestDry.reason, 'dry run');
  assert.ok(readFileSync(digestFile, 'utf8').includes(stale), 'a dry run never writes');
  const digest = repinReceipt(digestFile);
  assert.equal(digest.ok, true, JSON.stringify(digest));
  assert.equal(digest.rounds, 1, 'both quoted occurrences moved in one round');
  assert.ok(!readFileSync(digestFile, 'utf8').includes(stale) && readFileSync(digestFile, 'utf8').includes(`'${current}'`) && readFileSync(digestFile, 'utf8').includes(`"${current}"`));

  // 2. A [digest, count, count] tuple: the digest and the numbers on ITS line move; the neighbouring row that
  //    shares the same counts is untouched (the round-38 Chieftain Mk5 trap).
  const tupleFile = fixture('tuple.selftest.mjs', `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const BEFORE = {
  high: ['${stale}', 76, 43],
  low: ['${sha('low build')}', 76, 43],
};
assert.deepEqual([sha('current build'), 75, 42], BEFORE.high, 'high tuple');
assert.deepEqual([sha('low build'), 76, 43], BEFORE.low, 'low tuple');
console.log('tuple fixture PASS');
`);
  const tuple = repinReceipt(tupleFile);
  assert.equal(tuple.ok, true, JSON.stringify(tuple));
  const tupleText = readFileSync(tupleFile, 'utf8');
  assert.ok(tupleText.includes(`high: ['${current}', 75, 42],`), tupleText);
  assert.ok(tupleText.includes(`low: ['${sha('low build')}', 76, 43],`), 'the neighbouring row keeps its counts');

  // 3. A flat numeric array compared with deepStrictEqual: the whole literal is swapped once.
  const arrayFile = fixture('array.selftest.mjs', `import assert from 'node:assert/strict';
const bounds = [42088, 4.445803761482239, 3.807588815689087, 3.2081706523895264];
assert.deepStrictEqual([41794, 4.444735169410706, 3.807588815689087, 3.2081706523895264], bounds);
console.log('array fixture PASS');
`);
  const array = repinReceipt(arrayFile);
  assert.equal(array.ok, true, JSON.stringify(array));
  assert.ok(readFileSync(arrayFile, 'utf8').includes('[41794, 4.444735169410706, 3.807588815689087, 3.2081706523895264]'));

  // 4. A non-literal failure is reported and the file is left byte-identical.
  const otherBody = `import assert from 'node:assert/strict';\nassert.ok(false, 'real barrel mouth annulus');\n`;
  const otherFile = fixture('other.selftest.mjs', otherBody);
  const other = repinReceipt(otherFile);
  assert.equal(other.ok, false); assert.match(other.reason, /non-literal failure/);
  assert.equal(readFileSync(otherFile, 'utf8'), otherBody);

  // 5. A short fingerprint that occurs twice is ambiguous: refused, file untouched.
  const shortBody = `import assert from 'node:assert/strict';\nconst rows = { a: 'deadbeef', b: 'deadbeef' };\nassert.equal('cafef00d', rows.a, 'short fingerprint');\n`;
  const shortFile = fixture('short.selftest.mjs', shortBody);
  const short = repinReceipt(shortFile);
  assert.equal(short.ok, false); assert.match(short.reason, /occurs 2 times/);
  assert.equal(readFileSync(shortFile, 'utf8'), shortBody);

  // 6. Pure helpers: diff parsing, plans, and both runner log line formats.
  const output = "+ actual - expected\n\n+ 'aaaa'\n- 'bbbb'\n";
  assert.deepEqual(diffLines(output), { plus: ["'aaaa'"], minus: ["'bbbb'"] });
  assert.deepEqual(planEdits(`+ actual - expected\n+ '${current}'\n- '${stale}'\n`), [{ expected: stale, actual: current, kind: 'hex' }]);
  assert.deepEqual(planArraySwap('  actual: [ 1, 2.5 ],\n  expected: [ 1, 3 ],'), { actual: ['1', '2.5'], expected: ['1', '3'] });
  assert.equal(planArraySwap("  actual: [ 'x', 2 ],\n  expected: [ 'x', 3 ],"), null, 'arrays with strings are tuples, not numeric arrays');
  assert.deepEqual(applyEdits("a: 5,\n", [{ expected: '5', actual: '6', kind: 'num' }]), { error: 'numbers without a digest anchor' });
  assert.equal(applyArraySwap('[1, 2]\n[1, 2]\n', { expected: ['1', '2'], actual: ['3', '4'] }).error, 'array literal [1, 2]… occurs 2 times');
  assert.deepEqual(failedReceiptsFromLog('[selftests] pre 7/406 FAIL src/a.selftest.mjs: 4190ms child, 0ms FIFO\n[selftests] FAIL src/b.selftest.mjs\n[selftests] pre 8/406 PASS src/c.selftest.mjs: 1ms\n'), ['src/a.selftest.mjs', 'src/b.selftest.mjs']);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('receipt-repin.selftest: quoted digests, digest-line tuples, numeric arrays, non-literal and ambiguous refusals, log parsing pass');
