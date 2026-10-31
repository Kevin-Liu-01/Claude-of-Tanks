#!/usr/bin/env node
// Roofs without walls, per tank (tools/roof-pocket.mjs): the see-through pockets under panels that read as solid.
//   node tools/roof-pocket-census.mjs --ids=leclerc_s1,leclerc_s2 [--json=path] [--gate] [--jobs=N]
//   node tools/roof-pocket-census.mjs --all [--json=path] [--from=<id>] [--jobs=N]
//   --cells adds each pocket's air cell centres to the --json rows (for capture probes that paint what a camera sees of it)
//   node tools/roof-pocket-census.mjs --ledger=docs/geometry-gate/roof-pockets.json --update|--check --ids=<a,b>|--all [--jobs=N]
// Builds each id first-party (createTank, proceduralOnly, high, seed 4242, the geometry receipt's build), measures the
// turret (gun at rest) and the hull (no running gear) in their own frames and prints each exposed pocket: owner, plan area,
// volume, depth from its mouth, its box and its census camera (the typical direction that sees the most of it). --gate
// exits non-zero when any measured tank has one. --jobs splits the ids over that many child processes.
//
// Shrink-only ledger (264, Main 2026-10-28: "Put the census --gate in a receipt that's shrink-only fleet-wide"): one row
// per tank, its pocket plan area in three classes (turret RAISED: roofs 0.25 m or more over the turret's frame, the
// Leclerc's false roofs; turret BASE: bustle and ring overhangs, measured without the hull; HULL), bound to the tank's
// hull, turret and gun group digests in docs/references/fleet-geometry-ledger.json. --update re-measures and writes rows
// and refuses a class that grew past the tolerance (--allow-growth=<ids> re-baselines those on purpose: say why in the
// commit); --check re-measures and fails on any class that moved past the tolerance or a stale binding.
// tools/roof-pocket-census.selftest.mjs holds the whole fleet against the ledger without building a tank. First-party
// tooling: Kevin B. Liu (NOTICE.md).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import './tank-surface-collect.mjs'; // node canvas shim: builders paint their canvas textures as in the browser
import { uniqueIds } from './id-list.mjs';
import { OWNER_RULES, POCKET_CLASSES, POCKET_MIN_AREA_M2, POCKET_MIN_DEPTH_M, RAISED_ROOF_Y, VOXEL_M, ownerSoups, pocketClasses, roofPockets } from './roof-pocket.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const LEDGER_PATH = opt('ledger', '');
const FLEET_LEDGER_PATH = 'docs/references/fleet-geometry-ledger.json';
const LEDGER_SETTINGS = Object.freeze({ voxelM: VOXEL_M, minAreaCm2: POCKET_MIN_AREA_M2 * 1e4, minDepthCm: POCKET_MIN_DEPTH_M * 100,
  raisedRoofY: RAISED_ROOF_Y, toleranceCm2: 40, toleranceFrac: 0.02 });
const CLASSES = POCKET_CLASSES;
if (LEDGER_PATH && flag('update') === flag('check')) { console.error('roof-pocket ledger: pass exactly one of --update or --check'); process.exit(2); }

const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
let ids = flag('all') ? [...ALL_TANK_IDS] : uniqueIds(opt('ids', '').split(',').map((s) => s.trim()).filter(Boolean), 'roof-pocket-census --ids');
if (opt('from')) ids = ids.slice(Math.max(0, ids.indexOf(opt('from'))));
if (!ids.length) { console.error('roof-pocket-census: pass --ids=<a,b> or --all'); process.exit(2); }
const unknown = ids.filter((id) => !ALL_TANK_IDS.includes(id));
if (unknown.length) { console.error(`roof-pocket-census: unknown id(s) ${unknown.join(', ')}`); process.exit(2); }

/** Measure `list` here, one tank at a time; each row { id, pockets, areaCm2, found } or { id, error }. */
async function measure(list) {
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const rows = [];
  for (const id of list) {
    const started = Date.now();
    let tank;
    try {
      tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
      const soups = ownerSoups(tank), found = [];
      for (const [owner, soup] of Object.entries(soups)) for (const p of roofPockets(soup.tri, { ...OWNER_RULES[owner], body: soup.body, glass: soup.glass, cells: flag('cells') })) found.push({ owner, ...p });
      found.sort((a, b) => b.areaM2 - a.areaM2);
      const areaCm2 = found.reduce((t, p) => t + p.areaM2 * 1e4, 0);
      rows.push({ id, pockets: found.length, areaCm2: +areaCm2.toFixed(0), found });
      console.log(`${id}: ${found.length ? `${found.length} pocket(s), ${areaCm2.toFixed(0)} cm2` : 'none'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      for (const p of found.slice(0, 8)) {
        console.log(`  ${p.owner} ${(p.areaM2 * 1e4).toFixed(0)} cm2, ${p.volumeL.toFixed(1)} L, depth ${(p.depthM * 100).toFixed(0)} cm, roof y ${p.roof.join('..')}, box x ${p.box[0]}..${p.box[3]} y ${p.box[1]}..${p.box[4]} z ${p.box[2]}..${p.box[5]}, seen from ${p.sight.join(',')}${p.glazed ? ', GLAZED (a window)' : ''}`);
      }
    } catch (error) {
      rows.push({ id, error: String(error?.message || error) });
      console.log(`${id}: ERROR ${String(error?.message || error).slice(0, 200)}`);
    } finally {
      tank?.dispose?.();
    }
  }
  return rows;
}

/** The same measurement over `jobs` child processes (each its own heap, 4 GB), rows back in `list` order. */
async function measureParallel(list, jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'cot-roof-pocket-'));
  const chunks = Array.from({ length: jobs }, (_, j) => list.filter((_, i) => i % jobs === j)).filter((c) => c.length);
  const runs = chunks.map((chunk, j) => new Promise((done, fail) => {
    const out = join(dir, `part-${j}.json`);
    const child = spawn(process.execPath, ['--max-old-space-size=4096', 'tools/roof-pocket-census.mjs', `--ids=${chunk.join(',')}`, `--json=${out}`, ...(flag('cells') ? ['--cells'] : [])],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (b) => process.stdout.write(b));
    child.on('exit', (code) => (code === 0 ? done(JSON.parse(readFileSync(out, 'utf8'))) : fail(new Error(`roof-pocket part ${j} exited ${code}`))));
  }));
  const byId = new Map((await Promise.all(runs)).flat().map((r) => [r.id, r]));
  return list.map((id) => byId.get(id));
}

const jobs = Math.max(1, Math.min(ids.length, Number(opt('jobs', '1')) || 1));
const rows = jobs > 1 ? await measureParallel(ids, jobs) : await measure(ids);
if (opt('json')) writeFileSync(opt('json'), `${JSON.stringify(rows, null, 1)}\n`);
const flagged = rows.filter((r) => r.pockets);
console.log(`roof-pocket census: ${rows.length} tank(s), ${flagged.length} with pockets${flagged.length ? `: ${[...flagged].sort((a, b) => b.areaCm2 - a.areaCm2).map((r) => `${r.id} ${r.areaCm2}`).join(', ')}` : ''}`);
if (flag('gate') && flagged.length) process.exitCode = 1;

if (LEDGER_PATH) {
  const fleet = JSON.parse(readFileSync(resolve(FLEET_LEDGER_PATH), 'utf8')).tanks;
  const book = existsSync(resolve(LEDGER_PATH)) ? JSON.parse(readFileSync(resolve(LEDGER_PATH), 'utf8'))
    : { schemaVersion: 1, generator: 'tools/roof-pocket-census.mjs --ledger', settings: LEDGER_SETTINGS,
      binding: `hull, turret and gun group digests of ${FLEET_LEDGER_PATH} at high quality`, tanks: {} };
  const S = book.settings;
  const allowGrowth = new Set(uniqueIds(opt('allow-growth', '').split(',').filter(Boolean), 'roof-pocket-census --allow-growth'));
  const slack = (held) => S.toleranceCm2 + S.toleranceFrac * held;
  let problems = 0;
  for (const r of rows) {
    if (r.error) { console.log(`${r.id}: not measured (${r.error.slice(0, 160)})`); problems++; continue; }
    const groups = fleet[r.id]?.high?.groups;
    if (!groups) { console.log(`${r.id}: no ${FLEET_LEDGER_PATH} row (run node tools/fleet-geometry-ledger.mjs --update --ids=${r.id} first)`); problems++; continue; }
    const row = { ...pocketClasses(r.found), pockets: r.pockets, geometry: { hull: groups.hull, turret: groups.turret, gun: groups.gun } };
    const held = book.tanks[r.id];
    const grew = held ? CLASSES.filter((k) => row[k] > held[k] + slack(held[k])) : [];
    if (flag('update')) {
      if (grew.length && !allowGrowth.has(r.id)) {
        console.log(`${r.id}: REFUSED, pockets grew: ${grew.map((k) => `${k} ${held[k]} -> ${row[k]}`).join('; ')} (shrink-only: close them, or re-baseline on purpose with --allow-growth=${r.id})`);
        problems++;
        continue;
      }
      book.tanks[r.id] = row;
      continue;
    }
    if (!held) { console.log(`${r.id}: no roof-pocket ledger row`); problems++; continue; }
    const diffs = CLASSES.filter((k) => Math.abs(row[k] - held[k]) > slack(held[k])).map((k) => `${k} ${held[k]} -> ${row[k]}${row[k] > held[k] ? ' (GREW)' : ' (shrank: bank it with --update)'}`);
    for (const g of ['hull', 'turret', 'gun']) if (held.geometry?.[g] !== row.geometry[g]) diffs.push(`${g} geometry moved since the row was measured`);
    if (diffs.length) { console.log(`${r.id}: ledger differs: ${diffs.join('; ')}`); problems++; }
  }
  if (flag('update')) {
    const tanks = Object.fromEntries(Object.keys(book.tanks).sort().map((id) => [id, book.tanks[id]]));
    const head = JSON.stringify({ ...book, tanks: undefined }, null, 1).replace(/\n}$/, '');
    const body = Object.entries(tanks).map(([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
    writeFileSync(resolve(LEDGER_PATH), `${head},\n "tanks": {\n${body}\n }\n}\n`);
    console.log(`roof-pocket ledger: wrote ${rows.length - problems} row(s) to ${LEDGER_PATH} (${Object.keys(tanks).length} held)${problems ? `; ${problems} refused or unmeasured` : ''}`);
  } else console.log(`roof-pocket ledger: ${problems ? `FAIL: ${problems} difference(s)` : `PASS: ${rows.length} tank(s) match ${LEDGER_PATH}`}`);
  if (problems) process.exitCode = 1;
}
