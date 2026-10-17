// destruction-slab-kinds.selftest.mjs — the stray-slab detector over every destructible kind of every map (destruction-
// slabs 227, 2026-10-17; the owner: "for building destruction, these weird ugly boxes/surfaces still randomly come up.
// fix"). Each map is built once (the detector's own run: one props build, every kind on it — a builder under its damage
// kit — struck on the battle's path, sections on, the fracture on), on a short staging (32 rounds over 3 m bands up the
// drawn height, a 6 s settle, the late joiner's replays), in a pool of worker processes. Every kind passes: no plate or
// wall standing past the walls of its height band, none floating, none untextured or degenerate, no run off the walls, no
// remnant taller than the building is drawn there, no fallen roof slab drawn off its body. A kind listed in KNOWN is a
// judged exception (its reason); one that stops flagging must leave the list (the ratchet).
//   COT_SLAB_KINDS_WORKERS=<n> (default a third of the CPUs, at most 6); COT_SLAB_KINDS_MAPS=<map,...> (a subset)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const { MAP_IDS } = await import('../src/world/maps/index.ts');

/** Judged exceptions, `map #id`: the reason each still flags (none: every kind passes). */
const KNOWN = Object.freeze({});

const maps = process.env.COT_SLAB_KINDS_MAPS ? process.env.COT_SLAB_KINDS_MAPS.split(',') : [...MAP_IDS];
const workers = Math.max(1, Number(process.env.COT_SLAB_KINDS_WORKERS ?? Math.min(6, Math.max(1, Math.floor(os.availableParallelism() / 3)))));
const ARGS = ['--per-builder=1', '--storeys=0,1,2,3', '--rounds=32', '--settle=6', '--max-snapshots=24'];
const out = mkdtempSync(path.join(os.tmpdir(), 'slab-kinds-'));

function runMap(mapId) {
  return new Promise((resolve) => {
    const json = path.join(out, `${mapId}.json`);
    const child = spawn(process.execPath, ['--max-old-space-size=4096', path.join(here, 'destruction-slab-check.mjs'), `--map=${mapId}`, ...ARGS, `--json=${json}`],
      { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 40 * 60 * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ mapId, code, report: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null, err });
    });
  });
}

const queue = [...maps];
const results = [];
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  while (queue.length) results.push(await runMap(queue.shift()));
}));
rmSync(out, { recursive: true, force: true });

let kinds = 0, snaps = 0;
const flagged = [], known = new Set();
for (const r of results.sort((a, b) => a.mapId.localeCompare(b.mapId))) {
  assert.ok(r.report, `${r.mapId}: the detector reported (exit ${r.code}): ${r.err.slice(-600)}`);
  for (const row of r.report.rows) {
    kinds++;
    snaps += row.snapshots.length;
    const key = `${r.mapId} #${row.id}`;
    if (row.pass) continue;
    if (Object.hasOwn(KNOWN, key)) { known.add(key); continue; }
    const worst = row.worst[0];
    flagged.push(`${key} ${row.builder}/${row.kit}: ${row.snapshots.filter((p) => p.findings.length).length} snapshots flag; worst ${worst?.mesh} `
      + `${worst?.orientation} ${worst?.extentsM?.join(' x ')} m [${worst?.phase}]: ${worst?.reasons?.join('; ')}${row.spanIssues.length ? `; spans: ${row.spanIssues.join('; ')}` : ''}`);
  }
}
assert.deepEqual(flagged, [], `every destructible kind passes the stray-slab check:\n${flagged.join('\n')}`);
const stale = Object.keys(KNOWN).filter((k) => maps.includes(k.split(' ')[0]) && !known.has(k));
assert.deepEqual(stale, [], `known exceptions that no longer flag leave KNOWN: ${stale.join(', ')}`);
console.log(`destruction-slab-kinds selftest: ${kinds} kinds on ${results.length} maps, ${snaps} snapshots, none flags a stray slab`
  + `${known.size ? ` (${known.size} judged exceptions)` : ''} — ok`);
