import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** A narrowed census must explicitly disclose every excluded playable ID. */
export function baseShellAuditScope(playableIds, requestedIds = '', quality = 'both') {
  const ids = requestedIds ? requestedIds.split(',') : [...playableIds];
  if (ids.some(id => !playableIds.includes(id)) || new Set(ids).size !== ids.length)
    throw new Error('IDs must be unique playable vehicle IDs');
  const qualities = quality === 'both' ? ['high', 'low'] : [quality];
  if (qualities.some(q => !['high', 'low'].includes(q)))
    throw new Error('Quality must be high, low, or both');
  return {
    ids, qualities, excluded: playableIds.filter(id => !ids.includes(id)),
    completePlayableScope: ids.length === playableIds.length && qualities.length === 2,
  };
}

/** Read before loading factory/spec modules, and again after all builds. */
export function baseShellInputFingerprint(root) {
  const digest = crypto.createHash('sha256');
  for (const directory of ['src', 'tools']) {
    const files = fs.readdirSync(path.join(root, directory), { recursive: true })
      .filter(file => /\.(ts|js|mjs|json)$/.test(file)).sort();
    for (const file of files) {
      const relative = directory + '/' + file;
      digest.update(relative); digest.update('\0');
      digest.update(fs.readFileSync(path.join(root, relative))); digest.update('\0');
    }
  }
  return digest.digest('hex');
}
