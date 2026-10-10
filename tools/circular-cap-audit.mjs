import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findCoplanarSurfaceOverlaps } from './coplanar-surface-overlap.ts';

/** Plug into the existing HIGH/LOW passes: no extra fleet construction. Keep
 * collecting after a finding so one bad tank cannot hide later failures. */
export function createCircularCapAudit({ quality, out } = {}) {
  if (!['high', 'low'].includes(quality)) throw Error('Circular cap audit requires high or low quality');
  const rows = [];
  const output = resolve(out ?? `.qa-dev/circular-caps/fleet-${quality}-${process.pid}.json`);
  return {
    check(id, tank) {
      try {
        const result = findCoplanarSurfaceOverlaps(tank.root, { circularCapsOnly: true });
        rows.push({ id, ...result });
      } catch (error) {
        rows.push({ id, error: String(error.stack ?? error) });
      }
    },
    finish() {
      const affected = rows.filter(row => row.error || row.findings.length
        || row.stats.skipped.instancedMeshes || row.stats.skipped.batchedMeshes);
      const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), quality,
        method: 'Native drawn circular fan caps; positive-area same-plane overlap, including merged buffers and instances; exterior normal-ray witnesses; depth offsets do not waive duplicated discs',
        limits: ['Circular fan caps with at least six sectors; not arbitrary polygon triangulations.',
          'Normal-ray exposure samples are not exhaustive camera visibility proof.',
          '10-micrometre quantized planes; minimum overlap area one square millimetre.',
          'Batched meshes fail as unsupported; shared fleet passes use unbatched geometry.'],
        tanks: rows.length, affectedTanks: affected.length, rows };
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`circular-cap audit ${quality}: ${rows.length} tanks, ${affected.length} affected; ${output}`);
      if (affected.length) {
        const descriptions = affected.map(row => row.error ? `${row.id}: ${row.error}`
          : `${row.id}: ${row.findings.length} overlapping cap groups; unsupported meshes ${row.stats.skipped.batchedMeshes + row.stats.skipped.instancedMeshes}`);
        throw Error(`Circular cap lint failed (${quality}):\n${descriptions.join('\n')}\nFull planes, surface paths and triangle witnesses: ${output}`);
      }
      return report;
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node tools/circular-cap-audit.mjs [--ids=vt4a1,t90m] [--quality=high|low|both] [--out-dir=path]\nDefault: all playable tanks, HIGH and LOW. Findings or unsupported meshes exit 1.');
    return;
  }
  for (const arg of args) if (!/^--(ids|quality|out-dir)=.+$/.test(arg)) throw Error(`Unknown option: ${arg}`);
  const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const quality = option('quality', 'both');
  if (!['high', 'low', 'both'].includes(quality)) throw Error(`Invalid quality: ${quality}`);
  const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const ids = option('ids', '').split(',').filter(Boolean);
  for (const id of ids) if (!ALL_TANK_IDS.includes(id)) throw Error(`Unknown playable tank: ${id}`);
  const out = resolve(option('out-dir', `.qa-dev/circular-caps/run-${Date.now()}`));
  const errors = [];
  for (const q of quality === 'both' ? ['high', 'low'] : [quality]) {
    const audit = createCircularCapAudit({ quality: q, out: `${out}/${q}.json` });
    for (const id of ids.length ? ids : ALL_TANK_IDS) {
      const tank = createTank(id, null, { proceduralOnly: true, quality: q, camoSeed: 4242, geometryReceipt: true, batchStatic: false });
      try { audit.check(id, tank); } finally { tank.dispose(); }
    }
    try { audit.finish(); } catch (error) { errors.push(error.message); }
  }
  if (errors.length) throw Error(errors.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
