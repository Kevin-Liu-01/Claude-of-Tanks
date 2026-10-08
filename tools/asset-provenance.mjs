// Transparent build receipt. No keys are generated or embedded automatically.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createReceipt, signReceipt, verifyReceipt } from './asset-provenance-core.mjs';
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(arg('root') || '.');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const paths = git('ls-files', '-z').split('\0').filter(Boolean);
const check = arg('check'), output = arg('write');
assert.ok(Boolean(check) !== Boolean(output), 'Choose --write=<receipt.json> or --check=<receipt.json>');
if (check) {
  const envelope = JSON.parse(await readFile(check, 'utf8'));
  const key = arg('public-key') ? await readFile(arg('public-key')) : undefined;
  const count = await verifyReceipt(root, envelope, paths, key);
  console.log(`Provenance verified: ${count} files; ${envelope.signature ? 'signature + hashes' : 'hashes only (unsigned)'}`);
} else {
  const receipt = await createReceipt(root, paths, git('rev-parse', 'HEAD').trim());
  const envelope = arg('sign-key') ? signReceipt(receipt, await readFile(arg('sign-key'))) : { receipt, signature: null };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(envelope, null, 2) + '\n', { flag: 'w' });
  console.log(`Provenance written: ${receipt.files.length} files; ${envelope.signature ? 'signed' : 'unsigned'}; ${receipt.contentId}`);
}
