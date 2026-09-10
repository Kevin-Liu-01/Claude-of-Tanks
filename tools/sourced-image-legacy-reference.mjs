import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const LEGACY_COMPOSER_REVISION = '4b321885c676877b83f9dd6725bcef164cab8f29';
export const LEGACY_COMPOSER_SOURCE_SHA256 = '3fb5c6115f439341d01e38a693c33e0fbab16dd46974933aeeb518ae71f58379';
export const LEGACY_COMPOSER_FIXTURE_PATH = 'tools/fixtures/sourced-image-legacy-composer-4b321885c.txt';
export const LEGACY_COMPOSER_FIXTURE_SHA256 = 'd17256331cea8285e2a9ecf5d329338d9b8a013896b1d7c328b89ccec84e0cdd';

/** Self-contained source-only/shallow-checkout reference; no git dependency. */
export async function readLegacyComposerFixture() {
  const source = await readFile(new URL('./fixtures/sourced-image-legacy-composer-4b321885c.txt', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), LEGACY_COMPOSER_FIXTURE_SHA256,
    'Frozen independent legacy composer fixture changed');
  return source;
}
