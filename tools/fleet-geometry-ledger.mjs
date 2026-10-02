#!/usr/bin/env node
// Measure, verify or re-pin the fleet geometry ledger (docs/references/fleet-geometry-ledger.json): one row per
// playable tank at HIGH and LOW quality, digest and rig-group rollups defined in tools/fleet-geometry-digest.mjs.
//
// The ledger replaces the frozen per-receipt geometry pins (2026-10-01, owner: "Retire frozen pins"). npm test
// verifies every row without a second fleet build: wheelQuality.selftest (HIGH) and gunArticulation.selftest (LOW)
// digest the models they already build. A geometry change is expected to move rows: review the named tanks and
// groups, then re-pin in one command.
//
//   node tools/fleet-geometry-ledger.mjs --check [--jobs=4]           # fail when a row moved (default)
//   node tools/fleet-geometry-ledger.mjs --update [--jobs=4]          # re-pin the whole fleet
//   node tools/fleet-geometry-ledger.mjs --update --ids=t90m,leclerc_x [--quality=high]   # re-pin some rows
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LEDGER_PATH, LEDGER_QUALITIES, ledgerBuildOptions, digestTankRoot, fleetRoster, readFleetGeometryLedger,
  compareFleetGeometry, serializeFleetGeometryLedger,
} from './fleet-geometry-digest.mjs';

async function measureFleetGeometry(ids, qualities) {
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const rows = {};
  for (const id of ids) {
    rows[id] = {};
    for (const quality of qualities) {
      const tank = createTank(id, null, ledgerBuildOptions(quality));
      try { rows[id][quality] = digestTankRoot(tank.root); }
      finally { tank.dispose(); }
    }
  }
  return rows;
}

function parseArgs(argv) {
  const value = name => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    update: argv.includes('--update'),
    worker: argv.includes('--worker'),
    ids: value('ids')?.split(',').filter(Boolean) ?? null,
    qualities: value('quality')?.split(',').filter(Boolean) ?? [...LEDGER_QUALITIES],
    jobs: Math.max(1, Number(value('jobs') ?? 1) | 0),
    shard: value('shard'),
  };
}

function runShard(ids, qualities, shard, jobs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', `--shard=${shard}/${jobs}`,
      `--ids=${ids.join(',')}`, `--quality=${qualities.join(',')}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) { reject(new Error(`fleet-geometry-ledger shard ${shard}/${jobs} exited ${code}`)); return; }
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const roster = fleetRoster();
  const ids = options.ids ?? roster;
  for (const id of ids) if (!roster.includes(id)) throw new Error(`${id}: not a playable roster id`);
  for (const quality of options.qualities) ledgerBuildOptions(quality);
  if (options.worker) {
    const [index, count] = options.shard.split('/').map(Number);
    process.stdout.write(JSON.stringify(await measureFleetGeometry(ids.filter((_, i) => i % count === index), options.qualities)));
    return;
  }
  const started = Date.now();
  const jobs = Math.min(options.jobs, ids.length);
  const rows = jobs > 1
    ? Object.assign({}, ...await Promise.all(Array.from({ length: jobs }, (_, shard) => runShard(ids, options.qualities, shard, jobs))))
    : await measureFleetGeometry(ids, options.qualities);
  const seconds = () => ((Date.now() - started) / 1000).toFixed(0);
  if (options.update) {
    const partial = options.ids || options.qualities.length !== LEDGER_QUALITIES.length;
    const tanks = partial ? readFleetGeometryLedger().tanks : {};
    for (const [id, row] of Object.entries(rows)) tanks[id] = { ...tanks[id], ...row };
    for (const id of Object.keys(tanks)) if (!roster.includes(id)) delete tanks[id];
    writeFileSync(LEDGER_PATH, serializeFleetGeometryLedger(tanks));
    console.log(`[fleet-geometry] wrote ${Object.keys(rows).length} tanks x ${options.qualities.join('/')} to docs/references/fleet-geometry-ledger.json (${seconds()} s)`);
    return;
  }
  const problems = compareFleetGeometry(readFleetGeometryLedger(), rows,
    { roster: options.ids ? null : roster, qualities: options.qualities });
  if (problems.length) {
    console.error(`[fleet-geometry] FAIL: ${problems.length} difference(s); review them, then re-pin with npm run tank:geometry:update`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else console.log(`[fleet-geometry] PASS: ${Object.keys(rows).length} tanks x ${options.qualities.join('/')} match the ledger (${seconds()} s)`);
}

await main();
