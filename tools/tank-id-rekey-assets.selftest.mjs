// Receipt: the tank asset manifest (public/icons/tank-assets/) is keyed to the current tank ids (SSOT 2.19, ID.04/05).
// The CPU re-key tool recomputes every id-bearing field the browser generator writes (metadata, metadataHash, file
// names, bytes, sha256) and finds every row file byte-identical; after a rename the same tool re-keys it without
// rendering.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = spawnSync(process.execPath, ['tools/tank-id-rekey-assets.mjs', '--check'], {
  cwd: root, encoding: 'utf8', timeout: 300_000, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
});
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
console.log(run.stdout.trim());
