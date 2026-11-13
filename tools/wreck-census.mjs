#!/usr/bin/env node
// The tank-wreck census (wrecks-270, 2026-11-05): every map's placed hulks at the capture seeds — the donor, its damage
// state, where it stands (road verge, field, town, trench line) and its clearances to the spawns and the objective discs —
// and the repeats a player can see together: two hulks of one bake (the same donor in the same state, so the same mesh
// turned) within one view. Built in Node through the collision shards' own world build (headlessWorldCollision.mjs).
//
//   node tools/wreck-census.mjs [--maps=all|<id,...>] [--workers=4] [--out=<file.json>]
//   node tools/wreck-census.mjs --child --maps=<ids>     one child: a CENSUS line per map
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './map-probe-runtime.mjs';

const SELF = fileURLToPath(import.meta.url);
/** Two hulks a player sees in one view: within this many metres of each other (the battle camera's working range). */
export const WRECK_VIEW_M = 250; // wreckStates.ts WRECK_VIEW_M

/** Which kind of ground a hulk stands on: the road verge, a town (a building within 25 m), or open field. */
function siteOf(field, buildings, spot) {
  const road = field._roadDist?.(spot.x, spot.z) ?? Infinity;
  if (road < 14) return 'roadside';
  if (buildings.some((b) => Math.hypot(b[0] - spot.x, b[1] - spot.z) < 25)) return 'town';
  return 'field';
}

/** The pairs of one bake (donor and state) standing within a view of each other. */
export function viewRepeats(spots, range = WRECK_VIEW_M) {
  const out = [];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j];
      if (a.specId !== b.specId || (a.state ?? a.pop) !== (b.state ?? b.pop)) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < range) out.push({ specId: a.specId, state: a.state ?? (a.pop ? 'popped' : 'unseated'), d: Math.round(d) });
    }
  }
  return out;
}

async function censusMaps(ids) {
  const { buildWorldCollisionData } = await import('./headlessWorldCollision.mjs');
  const { getMapConfig } = await import('../src/world/maps/index.ts');
  const { MATCH_OBJECTIVE_LAYOUTS } = await import('../src/sim/matchObjectiveLayouts.ts');
  for (const mapId of ids) {
    const t0 = Date.now();
    const config = getMapConfig(mapId);
    let row = null;
    await buildWorldCollisionData(mapId, {
      inspect: ({ dressing, field: built }) => {
        const field = built ?? null;
        const spots = dressing.tankWreckSpots ?? [];
        const buildings = (dressing.obstacles ?? []).filter((o) => /building|house|structure/.test(o.kind ?? ''))
          .map((o) => [(o.min[0] + o.max[0]) / 2, (o.min[2] + o.max[2]) / 2]);
        const layout = MATCH_OBJECTIVE_LAYOUTS[mapId];
        const discs = [...(layout?.zones ?? []), ...(layout?.kickoff ? [layout.kickoff] : [])];
        const spawns = [config.spawns?.player, ...(config.spawns?.enemies ?? [])].filter(Boolean);
        row = {
          mapId,
          requested: config.props?.tankWrecks?.count ?? 0,
          era: config.props?.tankWrecks?.era ?? null,
          cast: config.props?.tankWrecks?.ids ?? [],
          hulks: spots.map((s) => ({
            specId: s.specId, state: s.state ?? (s.pop ? 'popped' : 'unseated'),
            x: Math.round(s.x), z: Math.round(s.z),
            site: field ? siteOf(field, buildings, s) : 'unknown',
            spawnM: spawns.length ? Math.round(Math.min(...spawns.map((p) => Math.hypot(p.x - s.x, p.z - s.z)))) : null,
            objectiveM: discs.length ? Math.round(Math.min(...discs.map((p) => Math.hypot(p.x - s.x, p.z - s.z)))) : null,
          })),
        };
        row.bakes = new Set(row.hulks.map((h) => `${h.specId}|${h.state}`)).size;
        row.repeats = viewRepeats(row.hulks);
      },
    });
    row.ms = Date.now() - t0;
    console.log(`CENSUS ${JSON.stringify(row)}`);
    await new Promise((resolve) => { setImmediate(resolve); });
  }
}

function runChild(ids) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SELF, '--child', `--maps=${ids.join(',')}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      for (const line of String(chunk).split('\n')) {
        if (!line.startsWith('CENSUS ')) continue;
        try { const r = JSON.parse(line.slice(7)); console.error(`[wreck-census] ${r.mapId}: ${r.hulks.length} hulk(s), ${r.bakes} bake(s), ${r.repeats.length} repeat(s) (${Math.round(r.ms / 1000)} s)`); } catch { /* partial */ }
      }
    });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`child ${ids.join(',')} exited ${code}: ${err.split('\n').slice(-8).join(' | ')}`)); return; }
      resolve(out.split('\n').filter((l) => l.startsWith('CENSUS ')).map((l) => JSON.parse(l.slice(7))));
    });
  });
}

if (isMainModule(import.meta.url)) {
  const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const { MAP_IDS } = await import('../src/world/maps/mapIds.ts');
  const ids = !opt.maps || opt.maps === 'all' ? [...MAP_IDS] : String(opt.maps).split(',').filter(Boolean);
  if (opt.child) { await censusMaps(ids); process.exit(0); }
  const workers = Math.max(1, Number(opt.workers ?? 4));
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const share = ids.filter((_, i) => i % workers === w);
    if (share.length) jobs.push(runChild(share));
  }
  const rows = (await Promise.all(jobs)).flat().sort((a, b) => a.mapId.localeCompare(b.mapId));
  if (opt.out) writeFileSync(String(opt.out), `${JSON.stringify(rows, null, 1)}\n`);
  for (const r of rows) {
    const ids = r.hulks.map((h) => `${h.specId}${h.state === 'popped' ? '*' : ''}`).join(' ');
    const sites = Object.entries(r.hulks.reduce((m, h) => ({ ...m, [h.site]: (m[h.site] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`${r.mapId}: ${r.hulks.length}/${r.requested} hulks, ${r.bakes} bakes, ${r.repeats.length} in-view repeats; ${ids || '-'}; ${sites || '-'}`);
  }
}
