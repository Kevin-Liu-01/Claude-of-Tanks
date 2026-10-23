import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { PROJECT_CREATOR, PROJECT_COPYRIGHT } from '../src/authorship.ts';

// Reviewed project-owned source/output families. References, fonts, external
// models and partner branding are deliberately outside this receipt's scope.
export const CONTENT_ROOTS = Object.freeze([
  'src/vehicles/', 'src/world/', 'public/icons/', 'public/maps/', 'public/fx/',
  'public/audio/', 'public/media/', 'public/minimaps/', 'public/field-guide/', 'server/world-collision-manifests/', 'server/world-collision-manifests-228/',
]);
export const POLICY_FILES = Object.freeze(['LICENSE-POLICY.md', 'NOTICE.md', 'docs/ATTRIBUTION.md', 'LICENSES/Proprietary-Content-License.txt']);
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonical = (value) => JSON.stringify(value);
export function coveredPath(path) {
  return !path.includes('..') && !path.includes('\\') && !path.startsWith('/')
    && (POLICY_FILES.includes(path) || CONTENT_ROOTS.some(root => path.startsWith(root)));
}
// The scope is ~11,000 files and 1.2 GB. Hashed one at a time it took 330 s at load ~225 (2026-10-22), waiting on
// one read after another; HASH_WINDOW files are in flight at once, a file up to WHOLE_READ_BYTES is one read, and
// each directory's real path is resolved once.
const HASH_WINDOW = 16;
const WHOLE_READ_BYTES = 8 * 1024 * 1024;
async function fileReceipt(root, realRoot, realDirs, path) {
  assert.ok(coveredPath(path), `Path outside reviewed scope: ${path}`);
  const full = resolve(root, path);
  const info = await lstat(full);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Expected ordinary file: ${path}`);
  // An ordinary file's real path is its directory's real path plus its name.
  const dir = dirname(full);
  if (!realDirs.has(dir)) realDirs.set(dir, realpath(dir));
  assert.ok(join(await realDirs.get(dir), basename(full)).startsWith(realRoot + sep), `Path escapes repository: ${path}`);
  const hash = createHash('sha256');
  if (info.size <= WHOLE_READ_BYTES) hash.update(await readFile(full));
  else for await (const chunk of createReadStream(full, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
  return { path, bytes: info.size, sha256: hash.digest('hex') };
}
export async function createReceipt(root, paths, revision) {
  const scope = [...new Set(paths.filter(coveredPath))].sort();
  const realRoot = await realpath(root), realDirs = new Map();
  // Paths start in order; after a failure no new one starts, the ones in flight finish, and the first failure in
  // path order is thrown, as the one-at-a-time loop threw it.
  const files = new Array(scope.length), failures = [];
  let next = 0;
  const worker = async () => {
    while (next < scope.length && !failures.length) {
      const index = next++;
      try { files[index] = await fileReceipt(root, realRoot, realDirs, scope[index]); } catch (error) { failures.push({ index, error }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HASH_WINDOW, scope.length) }, worker));
  if (failures.length) throw failures.sort((a, b) => a.index - b.index)[0].error;
  assert.ok(files.length, 'No files in provenance scope');
  return {
    schema: 'cot-asset-provenance-v1', project: 'Claude of Tanks',
    creator: PROJECT_CREATOR, copyright: PROJECT_COPYRIGHT,
    rights: 'LICENSE-POLICY.md; embedded and third-party notices take precedence',
    attribution: 'docs/ATTRIBUTION.md', sourceRevision: revision,
    hashAlgorithm: 'sha256', contentId: sha256(canonical(files)), files,
  };
}
export function signReceipt(receipt, privatePem) {
  const key = createPrivateKey(privatePem);
  assert.equal(key.asymmetricKeyType, 'ed25519', 'Use an Ed25519 signing key');
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' });
  return { receipt, signature: { algorithm: 'Ed25519', keyId: sha256(publicKey), value: sign(null, Buffer.from(canonical(receipt)), key).toString('base64') } };
}
export function verifySignature(envelope, trustedPublicPem) {
  assert.equal(envelope.signature?.algorithm, 'Ed25519', 'Signed receipt required');
  const key = createPublicKey(trustedPublicPem);
  assert.equal(key.asymmetricKeyType, 'ed25519');
  assert.equal(envelope.signature.keyId, sha256(key.export({ type: 'spki', format: 'der' })), 'Untrusted signing key');
  assert.ok(verify(null, Buffer.from(canonical(envelope.receipt)), key, Buffer.from(envelope.signature.value, 'base64')), 'Invalid receipt signature');
}
export async function verifyReceipt(root, envelope, paths, trustedPublicPem) {
  if (trustedPublicPem) verifySignature(envelope, trustedPublicPem);
  else assert.ok(!envelope.signature, 'A signed receipt requires an independently trusted --public-key');
  const current = await createReceipt(root, paths, envelope.receipt.sourceRevision);
  assert.deepEqual(envelope.receipt, current, 'Provenance mismatch: source, policy or receipt changed');
  return current.files.length;
}
