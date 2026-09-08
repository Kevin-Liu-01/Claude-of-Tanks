// Test-only successor contract for the already published, owner-requested
// Mk5-derived Mk10 foundation. This does not reconstruct the earlier casting.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const root = new URL('../../../', import.meta.url);
const receipt = JSON.parse(readFileSync(new URL(
  '../../../docs/references/tanks/chieftain_mk10_x.published-foundation-preservation.json',
  import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');

export const PRE_FOUNDATION_HISTORY = [
  ['high', 317904, 'f8ca53fd1bdb78ead30c90b2d50ffde9464888ebaeb0f8da690dacfe3adb1c31'],
  ['low', 291504, '2f8909bdea9e969f2dc65834150533937167523b47073aee5c858de0e07120d3'],
];

export function assertPublishedChieftainFoundationSources(
  read = file => readFileSync(new URL(file, root), 'utf8'),
) {
  assert.equal(receipt.protocol, 'published-post-foundation-successor-v1');
  assert.equal(receipt.commit, '099edfa49603bc473548f6986c8598267a24a4db');
  assert.equal(receipt.historicalStatus, 'pre-foundation receipt retained; not a current whole-model preservation claim');
  assert.deepEqual(receipt.preFoundationHistory, PRE_FOUNDATION_HISTORY);
  assert.equal(Object.keys(receipt.authoredSources).length, 24,
    'Complete Mk10 profile/helper family, shared foundation and its three direct geometry leaves');
  for (const [file, expected] of Object.entries(receipt.authoredSources)) {
    let source = read(file);
    if (file === receipt.laterMetadataAnnotation.file) {
      assert.equal(sha(source), receipt.laterMetadataAnnotation.currentSourceSha256,
        'Authenticate the complete subsequently published night-lamp annotation source');
      const addedImport = "import { markVehicleNightLens } from '../vehicleNightLighting.ts';\n";
      const wrapper = "markVehicleNightLens(front, 'headlight')";
      assert.equal(source.split(addedImport).length, 2);
      assert.equal(source.split(wrapper).length, 2);
      source = source.replace(addedImport, '').replace(wrapper, 'front');
    }
    assert.equal(sha(source), expected, `Published Mk10 foundation source contract: ${file}`);
  }
  const three = JSON.parse(read('node_modules/three/package.json'));
  assert.equal(three.version, receipt.dependencies.three,
    'The independently published baseline uses the same Three.js geometry version');
  for (const [file, expected] of Object.entries(receipt.dependencyFileHashes)) {
    assert.equal(sha(read(`node_modules/three/${file}`)), expected,
      `Published construction dependency bytes: ${file}`);
  }
  const history = JSON.parse(read('docs/references/tanks/chieftain_mk10_x.service-frame-source.json'));
  for (const [quality, count, hash] of PRE_FOUNDATION_HISTORY) {
    assert.deepEqual(history.verification.exactOldDrawVertexPreservation[quality],
      {count, sha256:hash}, 'The independently archived pre-foundation receipt remains unchanged');
  }
  return receipt.successor;
}
