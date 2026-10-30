#!/usr/bin/env node
// Interior fill exposure: committed fill voxels standing outside the current body. First-party tooling: Kevin B. Liu.
//
//   node tools/interior-fill-exposure.mjs --ids=a,b | --all [--check] [--json=<file>] [--jobs=2] [--fills-from=<dir>]
//   node tools/interior-fill-exposure.mjs --ids=a,b --lane [--base=<rev>] [--check] [--jobs=4]
//
// A fill record is measured on one build of the body (tools/gen-interior-fills.mjs) and never re-measured until its
// regen. When a hull or turret skin moves without a fills regen the boxes stay where the old skin was: they stand
// outside the new plates and draw as stair-stepped slabs on a glacis, deck or stern (2026-10-27, the owner's
// "voxel block like generations"). This tool builds each id without fills, voxelises the body exactly as the generator
// does (same triangles, boundary policy and exclusions) on the record's OWN lattice, and sorts every committed fill
// voxel into: inside a body column span (where the generator puts fills), on a body shell voxel (the skin now runs
// through the fill: teeth up to one voxel proud), or exposed (outside both the hull's and the turret's column spans:
// open air above a deck, ahead of a glacis, behind a stern). A record generated on the current build has neither:
// the generator fills only non-shell voxels inside those spans, on that lattice. It is a cheap screen (one build and
// one voxelisation, no flood rounds); tools/changed-only/fills-check.mjs remains the exact staleness check.
// `--check` exits 1 when any id has an exposed or on-shell fill voxel. `--fills-from` reads the group modules from
// another directory (a fills-check scratch part, an archived tree) in place of src/vehicles/interiorFillGroups.
//
// Where it runs (Main, 2026-10-29): fleet-wide (`--all --jobs=4`) once per integration round, as tools/gate.mjs's
// `fills` step; scoped in tank:release:check by `--lane`. A lane run measures the selected ids plus every id whose
// body moved against the base (default: the merge-base of HEAD and origin/main): its hull, turret or gun digest at the
// fleet geometry ledger's HIGH build differs from the base's ledger row, or its committed fill record line differs
// from the base's. That is every id a changed shared builder actually moved; an id whose body and record both equal
// the base's was measured there by the gate. When this checker's own inputs moved against the base, every id runs.
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectTriangles } from './tank-surface-collect.mjs';
import { voxelise, columnSpans, DEFAULT_EXCLUDE } from './tank-voxel-body.mjs';
import { interiorFillBoundaryTriangles } from './interior-fill-body-policy.mjs';
import { uniqueIds } from './id-list.mjs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from '../src/vehicles/interiorFillLoaders.generated.ts';
import { interiorFillSpans } from '../src/vehicles/interiorFills.ts';

const COMPONENTS = ['hull', 'turret', 'gun'];
const CELL_M = 0.5;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** What this checker reads besides the fleet's bodies and fill records: a change re-measures every id in --lane. */
const CHECKER_INPUTS = Object.freeze(['tools/interior-fill-exposure.mjs', 'tools/tank-voxel-body.mjs',
  'tools/interior-fill-body-policy.mjs', 'tools/tank-surface-collect.mjs', 'tools/fleet-geometry-digest.mjs',
  'tools/fleet-geometry-ledger.mjs', 'src/vehicles/interiorFills.ts', 'src/vehicles/nationalModernizationConfig.ts',
  'src/vehicles/nationalLegacyConfig.ts']);
const LEDGER_TOOL = fileURLToPath(new URL('./fleet-geometry-ledger.mjs', import.meta.url));

/** The committed fill record of an id (read through the loader map, never registered: builds here stay fill-free). */
export async function committedFillRecord(id, fillsFrom = null) {
  const group = FLEET_GROUP_BY_ID[id] || 'core';
  const module = fillsFrom
    ? await import(pathToFileURL(resolve(fillsFrom, `${group}.generated.ts`)).href)
    : await INTERIOR_FILL_GROUP_LOADERS[group]?.();
  return module?.INTERIOR_FILLS?.[id] ?? null;
}

/**
 * Sort a fill record's voxels against the body of a fill-free build (`root`, the tank frame at build pose).
 * Returns counts per class and component, and the tank-frame box and centroid of the offending voxels.
 */
export function fillExposure({ id, record, root }) {
  const { tris, meshes } = collectTriangles(root);
  const own = tris.filter((t) => !/InteriorFill$/.test(meshes[t.mesh] || ''));
  const boundary = interiorFillBoundaryTriangles(id, own, meshes);
  const v = record.v, o = record.o;
  const offLattice = (g) => g.origin.some((x, a) => { const s = (o[a] - x) / v; return Math.abs(s - Math.round(s)) > 1e-3; });
  // The generator's own lattice first: voxelise puts its origin three voxels below the body's minimum, and the record
  // keeps that origin to 6 decimals. While the minimum has not moved off the record's lattice this is exactly the grid
  // a fresh generation measures, so a plate face lying on a lattice plane rasterises to the same side as it did there
  // (re-anchoring on the rounded origin moved such faces into the fill: whole planes of false on-shell voxels).
  let grid = voxelise(boundary, meshes, { voxel: v, exclude: DEFAULT_EXCLUDE });
  if (offLattice(grid)) {
    // The body's minimum moved off the lattice (the record is stale): anchor a lattice congruent to the record's with
    // a degenerate triangle (one sample, a body-less group that no column span counts) at a lattice point no higher
    // than that minimum.
    const min = [Infinity, Infinity, Infinity];
    for (const t of boundary) {
      if (DEFAULT_EXCLUDE.test(meshes[t.mesh] || 'mesh')) continue;
      for (const [x, y, z] of [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]]) {
        if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      }
    }
    const [ax, ay, az] = min.map((m, a) => { let p = o[a] + 3 * v + v * Math.floor((m - o[a] - 3 * v) / v); if (p > m) p -= v; return p; });
    grid = voxelise([...boundary, { ax, ay, az, bx: ax, by: ay, bz: az, cx: ax, cy: ay, cz: az, mesh: meshes.length }],
      [...meshes, 'latticeAnchor'], { voxel: v, exclude: DEFAULT_EXCLUDE });
    if (offLattice(grid)) throw new Error(`${id}: lattice anchor missed the record's lattice`);
  }
  const shift = grid.origin.map((g, a) => (o[a] - g) / v);
  const [sx, sy, sz] = shift.map(Math.round);
  const { shell, nx, ny, nz } = grid;
  const { minY, maxY } = columnSpans(grid); // deepInterior's per-column hull/turret spans: where the generator fills
  const out = { voxels: 0, inside: 0, onShell: 0, exposed: 0, byComponent: {}, maxStandoff: 0, box: null, centroid: null };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  const cells = new Map(); // half-metre cells of offending voxels: the regions a reviewer looks at
  const offend = (x, y, z) => {
    const p = [o[0] + (x + 0.5) * v, o[1] + (y + 0.5) * v, o[2] + (z + 0.5) * v];
    for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; sum[a] += p[a]; }
    const key = p.map((c) => Math.floor(c / CELL_M)).join(',');
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = { n: 0, sum: [0, 0, 0], lo: [...p], hi: [...p] });
    cell.n++;
    for (let a = 0; a < 3; a++) { cell.sum[a] += p[a]; if (p[a] < cell.lo[a]) cell.lo[a] = p[a]; if (p[a] > cell.hi[a]) cell.hi[a] = p[a]; }
  };
  for (const key of COMPONENTS) {
    const spans = interiorFillSpans(record, key);
    const counts = { voxels: 0, onShell: 0, exposed: 0 };
    for (let b = 0; b + 5 < spans.length; b += 6) {
      for (let z = spans[b + 2]; z <= spans[b + 5]; z++) for (let y = spans[b + 1]; y <= spans[b + 4]; y++) for (let x = spans[b]; x <= spans[b + 3]; x++) {
        counts.voxels++;
        const gx = x + sx, gy = y + sy, gz = z + sz;
        if (gx < 0 || gy < 0 || gz < 0 || gx >= nx || gy >= ny || gz >= nz) { counts.exposed++; out.maxStandoff = Infinity; offend(x, y, z); continue; }
        if (shell[(gz * ny + gy) * nx + gx]) { counts.onShell++; offend(x, y, z); continue; }
        const k = gz * nx + gx;
        if ((minY[1][k] < gy && gy < maxY[1][k]) || (minY[2][k] < gy && gy < maxY[2][k])) continue;
        counts.exposed++; offend(x, y, z);
        // voxels of air between the fill and the nearest span of its column (none: the column has no body at all)
        let standoff = Infinity;
        for (const c of [1, 2]) if (maxY[c][k] >= 0) standoff = Math.min(standoff, gy >= maxY[c][k] ? gy - maxY[c][k] : minY[c][k] - gy);
        if (standoff > out.maxStandoff) out.maxStandoff = standoff;
      }
    }
    if (!counts.voxels) continue;
    out.byComponent[key] = counts;
    out.voxels += counts.voxels; out.onShell += counts.onShell; out.exposed += counts.exposed;
  }
  out.inside = out.voxels - out.onShell - out.exposed;
  const bad = out.onShell + out.exposed;
  if (bad) {
    out.box = [lo.map((x) => +x.toFixed(3)), hi.map((x) => +x.toFixed(3))];
    out.centroid = sum.map((x) => +(x / bad).toFixed(3));
    out.regions = offendingRegions(cells);
  }
  out.litres = +(bad * v ** 3 * 1000).toFixed(2);
  return out;
}

/** Touching half-metre cells joined into regions, largest first (at most four): voxels, centroid and box, tank frame. */
function offendingRegions(cells) {
  const seen = new Set(), regions = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const region = { voxels: 0, sum: [0, 0, 0], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    const stack = [start]; seen.add(start);
    while (stack.length) {
      const key = stack.pop(), cell = cells.get(key);
      region.voxels += cell.n;
      for (let a = 0; a < 3; a++) { region.sum[a] += cell.sum[a]; region.lo[a] = Math.min(region.lo[a], cell.lo[a]); region.hi[a] = Math.max(region.hi[a], cell.hi[a]); }
      const [i, j, k] = key.split(',').map(Number);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const next = `${i + di},${j + dj},${k + dk}`;
        if (cells.has(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    regions.push(region);
  }
  return regions.sort((a, b) => b.voxels - a.voxels).slice(0, 4).map((r) => ({ voxels: r.voxels,
    centroid: r.sum.map((x) => +(x / r.voxels).toFixed(3)), box: [r.lo.map((x) => +x.toFixed(3)), r.hi.map((x) => +x.toFixed(3))] }));
}

/** --lane's ids to digest: not selected, a fill record to expose, and the same record line as at the base. */
export function lanePending({ all, selected, now, then }) {
  const chosen = new Set(selected);
  return all.filter((id) => !chosen.has(id) && now[id] && now[id] === then[id]);
}

/**
 * --lane's scope. `now` and `then`: each id's fill record line here and at the base (null: none); `ledger`: the base's
 * fleet geometry ledger rows; `digests`: the hull/turret/gun digests of lanePending's ids built here. Returns the ids
 * to measure in fleet order, with the ids a changed record or a moved body added.
 */
export function laneScope({ all, selected, now, then, ledger, digests }) {
  const chosen = new Set(selected);
  const records = all.filter((id) => !chosen.has(id) && now[id] && now[id] !== then[id]);
  const bodies = lanePending({ all, selected, now, then })
    .filter((id) => COMPONENTS.some((group) => ledger[id]?.high?.groups?.[group] !== digests[id]?.[group]));
  const added = new Set([...records, ...bodies]);
  return { ids: all.filter((id) => chosen.has(id) || added.has(id)), records, bodies };
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

/** Each id's fill record line in its group module, in the working tree or (rev) at a commit; null when it has none. */
function fillRecordLines(ids, rev = null) {
  const texts = new Map(), lines = {};
  for (const id of ids) {
    const group = FLEET_GROUP_BY_ID[id] || 'core';
    if (!texts.has(group)) {
      const path = `src/vehicles/interiorFillGroups/${group}.generated.ts`;
      let text = '';
      try { text = rev ? git('show', `${rev}:${path}`) : readFileSync(join(ROOT, path), 'utf8'); } catch {}
      texts.set(group, text.split('\n'));
    }
    lines[id] = texts.get(group).find((line) => line.startsWith(`  ${JSON.stringify(id)}: `)) ?? null;
  }
  return lines;
}

/** Measure ids in this process: one build each, fills never applied. */
async function measureIds(ids, { fillsFrom = null } = {}) {
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const rows = {};
  for (const id of ids) {
    const t0 = performance.now();
    const record = await committedFillRecord(id, fillsFrom);
    if (!record) { rows[id] = { id, record: false }; console.log(`${id}: no fill record`); continue; }
    const tank = createTank(id, null, { proceduralOnly: true });
    try { rows[id] = { id, ...fillExposure({ id, record, root: tank.root }), ms: Math.round(performance.now() - t0) }; }
    finally { tank.dispose?.(); }
    const r = rows[id];
    console.log(`${id}: ${r.voxels} fill voxels, on shell ${r.onShell}, exposed ${r.exposed}${r.exposed ? ` (max ${r.maxStandoff} voxel(s) off the body)` : ''}${r.box ? `, box ${JSON.stringify(r.box)}` : ''} (${r.ms} ms)`);
  }
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const idsArg = value('ids');
  const all = Object.keys(FLEET_GROUP_BY_ID).sort();
  const everyId = args.includes('--all') || idsArg === 'all';
  const ids = everyId ? all : uniqueIds((idsArg ?? '').split(',').filter(Boolean), 'interior-fill-exposure --ids');
  if (!ids.length) throw new Error('interior-fill-exposure: pass --ids=a,b or --all');
  for (const id of ids) if (!Object.hasOwn(FLEET_GROUP_BY_ID, id)) throw new Error(`interior-fill-exposure: unknown id ${id}`);
  const fillsFrom = value('fills-from') ?? null;
  const lane = args.includes('--lane'), child = args.includes('--child');
  if (lane && (everyId || fillsFrom)) throw new Error('interior-fill-exposure: --lane widens --ids=<selected> against the committed fills');
  const jobs = Math.max(1, Number(value('jobs') ?? 1) | 0);
  // A tank build keeps geometry outside the V8 heap: more than a dozen ids run as child processes of at most twelve.
  const CHUNK = 12;
  const inChildren = async (list, label, command) => {
    const chunks = []; for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
    const rows = {};
    const runChunk = (part, k) => new Promise((done, fail) => {
      const { argv, read } = command(part, k);
      const proc = execFile(process.execPath, ['--max-old-space-size=4096', ...argv], { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' } },
        (error, stdout, stderr) => { if (error) { process.stdout.write(stdout); process.stderr.write(stderr); fail(new Error(`${label} part ${k} failed`)); } else done(read(stdout)); });
      proc.on('spawn', () => console.log(`[fill-exposure] ${label} part ${k}: ${part.length} id(s), pid ${proc.pid}`));
    });
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(jobs, chunks.length) }, async () => {
      while (next < chunks.length) { const k = next++; Object.assign(rows, await runChunk(chunks[k], k)); }
    }));
    return rows;
  };
  const measure = (list) => {
    if (list.length <= CHUNK) return measureIds(list, { fillsFrom });
    const scratch = mkdtempSync(join(tmpdir(), 'cot-fill-exposure-'));
    return inChildren(list, 'exposure', (part, k) => {
      const json = join(scratch, `part${k}.json`);
      return { argv: [import.meta.filename, `--ids=${part.join(',')}`, '--child', `--json=${json}`, ...(fillsFrom ? [`--fills-from=${fillsFrom}`] : [])],
        read: (stdout) => { process.stdout.write(stdout); return JSON.parse(readFileSync(json, 'utf8')); } };
    });
  };
  // Body digests come from the ledger tool's own worker: this module loads tank-surface-collect's canvas fixture, under
  // which builders paint suits, nets and kit fabrics as shipped, so a build here never digests to the ledger's row.
  const digestBodies = (list) => inChildren(list, 'digest', (part) => ({
    argv: [LEDGER_TOOL, '--worker', '--shard=0/1', `--ids=${part.join(',')}`, '--quality=high'],
    read: (stdout) => Object.fromEntries(Object.entries(JSON.parse(stdout))
      .map(([id, row]) => [id, Object.fromEntries(COMPONENTS.map((group) => [group, row.high.groups[group]]))])),
  }));
  let measured = ids, rows;
  if (child) rows = await measureIds(ids, { fillsFrom });
  else {
    if (lane) {
      const base = value('base') ?? git('merge-base', 'HEAD', 'origin/main').trim();
      const moved = git('diff', '--name-only', base, '--', ...CHECKER_INPUTS).split('\n').filter(Boolean);
      if (moved.length) {
        measured = all;
        console.log(`[fill-exposure] lane: this checker's inputs moved against ${base.slice(0, 10)} (${moved.join(', ')}): every id`);
      } else {
        const now = fillRecordLines(all), then = fillRecordLines(all, base);
        let ledger = {};
        try { ledger = JSON.parse(git('show', `${base}:docs/references/fleet-geometry-ledger.json`)).tanks ?? {}; } catch {}
        const digests = await digestBodies(lanePending({ all, selected: ids, now, then }));
        const scope = laneScope({ all, selected: ids, now, then, ledger, digests });
        measured = scope.ids;
        console.log(`[fill-exposure] lane against ${base.slice(0, 10)}: ${ids.length} selected + ${scope.bodies.length} moved bod${scope.bodies.length === 1 ? 'y' : 'ies'}`
          + `${scope.bodies.length ? ` (${scope.bodies.join(',')})` : ''} + ${scope.records.length} changed fill record(s)`
          + `${scope.records.length ? ` (${scope.records.join(',')})` : ''} = ${measured.length} id(s)`);
      }
    }
    rows = await measure(measured);
  }
  if (value('json')) writeFileSync(resolve(value('json')), `${JSON.stringify(rows, null, 1)}\n`);
  if (!child) {
    const stale = measured.filter((id) => rows[id]?.onShell || rows[id]?.exposed);
    if (stale.length) {
      console.error(`[fill-exposure] ${stale.length} of ${measured.length} id(s) have fills outside the current body (regenerate their fills and the chain after them):\n  `
        + stale.map((id) => `${id} (on shell ${rows[id].onShell}, exposed ${rows[id].exposed}, ${rows[id].litres} L)`).join('\n  '));
      if (args.includes('--check')) process.exitCode = 1;
    } else console.log(`[fill-exposure] PASS: ${measured.length} id(s), every committed fill voxel inside its body`);
  }
}
