import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
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
// The digest cache (272, the owner's changed-only rule): a file whose working copy equals Git's index is the bytes of
// its index blob, so its digest is keyed by the blob id and reused from the last --write that hashed that blob. The
// caller passes the clean blob ids (cleanBlobIds over `git ls-files -s -z` and `git diff-files --name-only -z`, which
// lists every working file that may differ from its index entry); any other file is read and hashed. The store lives
// outside the tree (node_modules/.cache/cot-asset-provenance) and holds the digests this run used: a store that fails
// to parse is ignored and rewritten. --check and verifyReceipt never pass a cache: they read every byte.
export function cleanBlobIds(stageListing, dirtyListing) {
  const dirty = new Set(dirtyListing.split('\0').filter(Boolean)), clean = new Map();
  for (const row of stageListing.split('\0')) {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) 0\t(.+)$/s.exec(row);
    if (match && match[1] !== '120000' && match[1] !== '160000' && !dirty.has(match[3])) clean.set(match[3], match[2]);
  }
  return clean;
}
const DIGEST_STORE_VERSION = 1;
export async function openDigestCache(dir, cleanBlobs) {
  const file = join(dir, 'digests.json');
  let stored = {};
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed?.version === DIGEST_STORE_VERSION && parsed.digests && typeof parsed.digests === 'object') stored = parsed.digests;
  } catch { /* absent or corrupt: every file is hashed and the store is rewritten */ }
  const used = {};
  let reused = 0;
  return {
    get(path, bytes) {
      const blob = cleanBlobs.get(path);
      const entry = blob && Object.hasOwn(stored, blob) ? stored[blob] : null;
      if (!Array.isArray(entry) || entry[0] !== bytes || !/^[0-9a-f]{64}$/.test(entry[1] ?? '')) return null;
      used[blob] = entry; reused++;
      return entry[1];
    },
    put(path, bytes, digest) { const blob = cleanBlobs.get(path); if (blob) used[blob] = [bytes, digest]; },
    get reused() { return reused; },
    async save() {
      await mkdir(dir, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: DIGEST_STORE_VERSION, digests: used }) + '\n');
      await rename(temporary, file);
    },
  };
}
async function fileReceipt(root, realRoot, realDirs, path, cache) {
  assert.ok(coveredPath(path), `Path outside reviewed scope: ${path}`);
  const full = resolve(root, path);
  const info = await lstat(full);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Expected ordinary file: ${path}`);
  // An ordinary file's real path is its directory's real path plus its name.
  const dir = dirname(full);
  if (!realDirs.has(dir)) realDirs.set(dir, realpath(dir));
  assert.ok(join(await realDirs.get(dir), basename(full)).startsWith(realRoot + sep), `Path escapes repository: ${path}`);
  const cached = cache?.get(path, info.size);
  if (cached) return { path, bytes: info.size, sha256: cached };
  const hash = createHash('sha256');
  if (info.size <= WHOLE_READ_BYTES) hash.update(await readFile(full));
  else for await (const chunk of createReadStream(full, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
  const digest = hash.digest('hex');
  cache?.put(path, info.size, digest);
  return { path, bytes: info.size, sha256: digest };
}
export async function createReceipt(root, paths, revision, { cache = null } = {}) {
  const scope = [...new Set(paths.filter(coveredPath))].sort();
  const realRoot = await realpath(root), realDirs = new Map();
  // Paths start in order; after a failure no new one starts, the ones in flight finish, and the first failure in
  // path order is thrown, as the one-at-a-time loop threw it.
  const files = new Array(scope.length), failures = [];
  let next = 0;
  const worker = async () => {
    while (next < scope.length && !failures.length) {
      const index = next++;
      try { files[index] = await fileReceipt(root, realRoot, realDirs, scope[index], cache); } catch (error) { failures.push({ index, error }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HASH_WINDOW, scope.length) }, worker));
  if (failures.length) throw failures.sort((a, b) => a.index - b.index)[0].error;
  assert.ok(files.length, 'No files in provenance scope');
  await cache?.save();
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
