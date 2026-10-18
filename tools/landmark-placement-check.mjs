// landmark-placement-check.mjs — the set-piece placement audit on BOTH variants (base and assault-trenches) of every map
// with set pieces, for a release gate (MAPS Lane A, 2026-10-17). npm test runs the base variant's audit for free on the
// collision drift receipt's own world builds (COT_LANDMARK_PLACEMENT; src/world/landmarks/landmarkPlacement.test-support.mjs);
// this tool adds the trenches variant, which no core receipt builds (about 5 minutes on 14 maps).
//   node tools/landmark-placement-check.mjs [--variant=assault-trenches|base|both]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { landmarkPlacementFailures } from '../src/world/landmarks/landmarkPlacement.test-support.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const want = (process.argv.find((a) => a.startsWith('--variant=')) ?? '--variant=both').split('=')[1];
const VARIANTS = want === 'both' ? [null, 'assault-trenches'] : [want === 'base' ? null : want];
const mapIds = MAP_IDS.filter((id) => getMapConfig(id).props?.landmarks?.length);
const script = (variant) => `
  const { buildWorldCollisionData } = await import(${JSON.stringify(path.join(root, 'tools/headlessWorldCollision.mjs'))});
  for (const mapId of ${JSON.stringify(mapIds)}) {
    let receipt = null;
    await buildWorldCollisionData(mapId, { variant: ${JSON.stringify(variant)}, inspect: ({ dressing }) => { receipt = dressing.group.userData.landmarks ?? null; } });
    const pieces = (receipt?.pieces ?? []).map(({ kind, name, x, z, status, reason }) => ({ kind, name, x, z, status, reason: reason ?? null }));
    process.stdout.write('RECEIPT ' + JSON.stringify({ mapId, receipt: receipt && { placed: receipt.placed ?? 0, skipped: receipt.skipped ?? 0, pieces } }) + '\\n');
  }
`;
const run = promisify(execFile);
const outputs = await Promise.all(VARIANTS.map((variant) => run(process.execPath, ['--input-type=module', '-e', script(variant)], {
  cwd: root, encoding: 'utf8', maxBuffer: 1 << 26,
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096' },
})));
const failures = [], summary = [];
for (const [v, { stdout }] of outputs.entries()) {
  const variant = VARIANTS[v];
  const seen = new Set();
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('RECEIPT ')) continue;
    const { mapId, receipt } = JSON.parse(line.slice(8));
    seen.add(mapId);
    const label = variant ? `${mapId}@${variant}` : mapId;
    const result = landmarkPlacementFailures(label, receipt, getMapConfig(mapId).props.landmarks);
    for (const f of result.failures) failures.push(`${label}: ${f}`);
    summary.push(`${label} ${result.placed}`);
  }
  for (const mapId of mapIds) if (!seen.has(mapId)) failures.push(`${variant ?? 'base'} ${mapId}: not built`);
}
if (failures.length) { console.error(`landmark-placement-check: ${failures.length} failures\n${failures.join('\n')}`); process.exit(1); }
console.log(`landmark-placement-check: ${mapIds.length} maps, ${VARIANTS.map((v) => v ?? 'base').join(' + ')}, every set piece stands: ${summary.join(', ')}`);
