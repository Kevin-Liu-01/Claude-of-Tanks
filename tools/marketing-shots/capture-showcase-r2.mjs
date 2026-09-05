// Rebuild the R2 UI showcase while retaining explicitly approved exceptions.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const rawDir = resolve(ROOT, 'shots/showcase-r2/raw');

mkdirSync(rawDir, { recursive: true });
const shotBySource = new Map(config.shots.map((shot) => [shot.source, shot]));
for (const file of readdirSync(rawDir).filter((name) => name.endsWith('.png'))) {
  const shot = shotBySource.get(file);
  if (!shot?.preservePublic) rmSync(join(rawDir, file));
}

const run = (script, args, label) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${label} failed`);
};
const nonAbramsRoster = [
  't90m', 'challenger_3', 'leo2a7v', 'merkava4b', 'ztz99a2', 'strv122', 'ariete_c2',
];

run(join(HERE, 'capture-showcase-r2-ui.mjs'), ['--out', rawDir], 'R2 product UI capture');
const liveByVehicle = new Map();
for (const shot of config.shots.filter((entry) => entry.sourceType === 'shot-view'
  && !entry.preservePublic)) {
  if (!liveByVehicle.has(shot.vehicleId)) liveByVehicle.set(shot.vehicleId, []);
  liveByVehicle.get(shot.vehicleId).push(shot.view);
}
for (const [vehicleId, views] of liveByVehicle) {
  run(resolve(ROOT, 'tools/screenshot.mjs'), [
    '--out', rawDir,
    '--views', views.join(','),
    '--tank', vehicleId,
    '--roster', nonAbramsRoster.join(','),
    '--width', '1920',
    '--height', '1080',
    '--dpr', '2',
  ], `R2 ${vehicleId} UI capture`);
}

const captured = config.shots.filter((shot) => readdirSync(rawDir).includes(shot.source));
if (captured.length !== config.expectedCount) {
  const missing = config.shots.filter((shot) => !readdirSync(rawDir).includes(shot.source));
  throw new Error(`Expected ${config.expectedCount} R2 captures, found ${captured.length}; missing ${missing.map((shot) => shot.source).join(', ')}`);
}
console.log(`[showcase-r2] captured ${captured.length}/${config.expectedCount} masters in ${rawDir}`);
