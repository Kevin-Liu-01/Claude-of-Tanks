// balance-matchups.selftest.mjs (inherited-reds-276, 2026-11-23; owner ruling via Main: "update the target ranges, keep the
// stats", and the receipt regenerated so it "can't go stale or be hand-edited again"). docs/balance/deterministic-matchups.json
// is what tools/balance-matchups.mjs generates from the fleet's specs and the scenarios, byte for byte. Its --check ran only
// in the manual balance suite, so the file went stale at 17d796abac (2026-10-30) and Release 274 edited rows by hand
// (b58ebea027, 75a93b3de3). This receipt runs the check with the default tier: a stat or scenario change without
// `npm run balance:update` fails here, and so does a hand edit (the negative control).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tool = fileURLToPath(new URL('./balance-matchups.mjs', import.meta.url));
const check = (...extra) => spawnSync(process.execPath, [tool, '--check', ...extra], { cwd: root, encoding: 'utf8' });

const current = check();
assert.equal(current.status, 0, `docs/balance/deterministic-matchups.json is a fresh generation (run npm run balance:update):\n${current.stderr}`);

// negative control: the committed receipt with one score edited by hand
const dir = mkdtempSync(join(tmpdir(), 'cot-balance-receipt-'));
try {
  const receipt = JSON.parse(readFileSync(join(root, 'docs', 'balance', 'deterministic-matchups.json'), 'utf8'));
  receipt.scenarios[0].aScore = receipt.scenarios[0].aScore === 0.5 ? 0.25 : 0.5;
  const edited = join(dir, 'deterministic-matchups.json');
  writeFileSync(edited, `${JSON.stringify(receipt, null, 2)}\n`);
  const handEdited = check(`--receipt=${edited}`);
  assert.equal(handEdited.status, 1, 'a hand-edited receipt fails the check');
  assert.match(handEdited.stderr, /deterministic receipt is stale/, 'and says to regenerate it');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('balance-matchups.selftest: the matchup receipt is a fresh generation; a hand-edited copy fails (negative control) PASS');
