// Rebuild all 40 R2 showcase masters from the current production renderer.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const rawDir = resolve(ROOT, 'shots/showcase-r2/raw');

mkdirSync(rawDir, { recursive: true });
for (const file of readdirSync(rawDir).filter((name) => name.endsWith('.png'))) {
  rmSync(join(rawDir, file));
}

const run = (script, args, label) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${label} failed`);
};

const liveViews = config.shots
  .filter((shot) => shot.sourceType === 'shot-view')
  .map((shot) => shot.view);
const sceneIds = config.shots
  .filter((shot) => shot.sourceType === 'studio-scene')
  .map((shot) => shot.scene);

run(join(HERE, 'capture-showcase-r2-ui.mjs'), ['--out', rawDir], 'R2 product UI capture');
run(resolve(ROOT, 'tools/screenshot.mjs'), [
  '--out', rawDir,
  '--views', liveViews.join(','),
  '--width', '1920',
  '--height', '1080',
  '--dpr', '2',
], 'R2 live feature capture');
run(join(HERE, 'shoot.mjs'), [
  '--scenes', join(HERE, 'scenes-presentation-r1'),
  '--out', rawDir,
  '--match', sceneIds.join(','),
  '--width', '3840',
], 'R2 directed battle capture');

const captured = readdirSync(rawDir).filter((file) => file.endsWith('.png')).sort();
if (captured.length !== config.expectedCount) {
  throw new Error(`Expected ${config.expectedCount} R2 captures, found ${captured.length}`);
}
console.log(`[showcase-r2] captured ${captured.length}/${config.expectedCount} masters in ${rawDir}`);
