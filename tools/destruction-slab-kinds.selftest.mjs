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

/**
 * Judged exceptions, `map #id`: the reason each still flags (destruction-slabs 227 round 1, each looked at in the
 * detector's renders; none is a room, floor or plate standing in the open past the walls).
 */
const KNOWN = Object.freeze({
  // fallen objects lying on the ground: a face of the object, not a plate in the open
  'longleaf #16': "the fire lookout's cab on its side at the fallen frame's end (its floor stands on edge)",
  'orchard #4': "the bell tower's fallen drum beyond the walls (its broken end)",
  'polders #46': "the tower mill's upper tower on the mound's flank (its broken end, 1.7 m over the slope)",
  'whiteout #21': "the hut's chunks lying on the fallen reflector, 12 m up on it (unchanged from main)",
  // low remnants over the collapse heap, where the drawn wall there stands lower (the regional kits' ruin and remnant
  // walls over the sim's mound; the detector reads the intact top in a 1.5 m window)
  'airfield #25': 'a timber remnant 1.2 m over the drawn wall, banked by the heap',
  'badlands #54': "the ruin's collapse stub over the banked heap in a gap of its drawn wall (1.8 m)",
  'blackglass #9': 'a remnant pier 1.2 m over the drawn wall head, on the heap',
  'blackglass #14': 'a remnant pier 1.1 m over the drawn wall head, on the heap',
  'caldera #34': "the stack's stump 1.3 m over the drawn top at its spot (its heap banked round it)",
  'fjord #0': 'a remnant wall 1.4 m over the drawn wall, banked by the heap',
  'fjord #9': "the ruin's collapse stub over the banked heap (1.7 m)",
  'polders #13': "the ruin's collapse stub over the banked heap (1.2 m)",
  'skybridge #24': 'a remnant wall on the slope, 16 % of it past the plan below the ground on the downhill side',
  'steppe #10': "the stack's steel stub 1.8 m over the drawn base at its spot",
  'titan_gorge #3': "the ruin's collapse stub over the banked heap (1.5 m)",
  'whiteout #40': "the airstrip's steel stub 1.5 m over its drawn base",
  'airfield #12': "a skin wall's post within one enclosure cell (0.9 m on a 56 m hall) of its drawn wall",
  // held storeys (DESTRUCTION.md §3.4): what stands with a storey the simulation holds over a destroyed one
  'oasis #2': "the room of a storey the simulation holds over a destroyed storey, inside the walls drawn round it",
  'oasis #14': "the room of the central tower's held storey, inside the tower's drawn walls",
  'ruinspires #1': "a held upper storey's joist end at the top of the megatower, 2.5 m proud",
  'ruinspires #36': "a held upper storey's joist end at the row house's wall head, 1.4 m proud",
  // fallen roofs and bodies at rest on what holds them
  'ruinspires #7': "the collapse's baked rest lying on the heap's records 1.3 m up",
  'ruinspires #10': "the collapse's baked rest lying on the heap's records 2.2 m up",
  'saltwind #4': 'a partial roof fall at rest on the wall heads, 22 % of it over the eaves',
  'winter #2': "the onion dome's fallen roof slab at rest on the drum, 2.7 m up",
  // rims at holes in curved or open walls
  'reservoir #17': "a breach rim on the valve tower's round wall, 27 % of it off the drawn curve",
  'skybridge #7': "breach rims in the needle tower's open steel frame, past its thin members",
});

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
