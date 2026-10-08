import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { PROJECT_CREATOR, PROJECT_COPYRIGHT } from '../src/authorship.ts';

// Reviewed project-owned source/output families. References, fonts, external
// models and partner branding are deliberately outside this receipt's scope.
export const CONTENT_ROOTS = Object.freeze([
  'src/vehicles/', 'src/world/', 'public/icons/', 'public/maps/', 'public/fx/',
]);
export const POLICY_FILES = Object.freeze(['LICENSE-POLICY.md', 'NOTICE.md', 'docs/ATTRIBUTION.md', 'LICENSES/Proprietary-Content-License.txt']);
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonical = (value) => JSON.stringify(value);
export function coveredPath(path) {
  return !path.includes('..') && !path.includes('\\') && !path.startsWith('/')
    && (POLICY_FILES.includes(path) || CONTENT_ROOTS.some(root => path.startsWith(root)));
}
async function fileReceipt(root, path) {
  assert.ok(coveredPath(path), `Path outside reviewed scope: ${path}`);
  const full = resolve(root, path), realRoot = await realpath(root);
  const info = await lstat(full);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Expected ordinary file: ${path}`);
  assert.ok((await realpath(full)).startsWith(realRoot + sep), `Path escapes repository: ${path}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(full)) hash.update(chunk);
  return { path, bytes: info.size, sha256: hash.digest('hex') };
}
export async function createReceipt(root, paths, revision) {
  const files = [];
  for (const path of [...new Set(paths.filter(coveredPath))].sort()) files.push(await fileReceipt(root, path));
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
