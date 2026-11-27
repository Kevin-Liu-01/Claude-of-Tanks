#!/usr/bin/env node
// tools/world-cloth-census.mjs — every flag-like cloth on every battlefield, by design id (world-flags-279, 2026-11-26;
// Kevin on the kolkhoz arch: its red banners "read as real Soviet flags"; Main's pass rule: a census lists every
// flag-like mesh on all 33 maps with its design id, and none matches a real flag).
//
//   node tools/world-cloth-census.mjs [--maps=a,b] [--out=<file.json>]
//
// Each map is built in Node as the dedicated host builds it (headlessWorldCollision.mjs: terrain, vegetation, props with
// the map's kits and set pieces), in a process of its own (the kits keep built geometry per process, so a second map
// in one process would not draw a shared piece again), with worldFlags.ts's census open: every cloth a builder draws
// is noted by its worldFlags.ts design id or its PLAIN_CLOTHS id and its site. A shared prop model (the lunar works'
// beacon and tether) is noted once per build of its geometry, not per placed copy. The designs themselves are checked
// against the real flags by src/world/worldFlags.selftest.mjs. Desktop builds (the shards' tier).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z]+)=(.*)$/.exec(a); if (!m) throw new Error(`unknown argument ${a}`); return [m[1], m[2]]; }));
const MARK = 'WORLD_CLOTH_CENSUS ';

if (args.one) {
  const { buildWorldCollisionData } = await import('./headlessWorldCollision.mjs');
  const { openWorldClothCensus, closeWorldClothCensus } = await import('../src/world/worldFlags.ts');
  const t0 = Date.now();
  openWorldClothCensus();
  await buildWorldCollisionData(args.one);
  const cloths = closeWorldClothCensus();
  process.stdout.write(`${MARK}${JSON.stringify({ map: args.one, seconds: Math.round((Date.now() - t0) / 1000), cloths })}\n`);
  process.exit(0);
}

const { MAP_IDS } = await import('../src/world/maps/mapIds.ts');
const maps = args.maps ? args.maps.split(',') : [...MAP_IDS];
for (const id of maps) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
const self = fileURLToPath(import.meta.url), rows = [];
for (const map of maps) {
  const out = execFileSync(process.execPath, [self, `--one=${map}`], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'inherit'] });
  const line = out.split('\n').find((l) => l.startsWith(MARK));
  if (!line) throw new Error(`${map}: the build printed no census`);
  const row = JSON.parse(line.slice(MARK.length));
  const sites = new Map();
  for (const c of row.cloths) { const k = `${c.kind} ${c.id} @ ${c.site}`; sites.set(k, (sites.get(k) ?? 0) + 1); }
  rows.push({ map, seconds: row.seconds, sites: Object.fromEntries([...sites].sort()) });
  console.log(`${map} (${row.seconds} s): ${sites.size ? [...sites].map(([k, n]) => `${k} ×${n}`).join('; ') : 'no cloth'}`);
}
if (args.out) writeFileSync(args.out, `${JSON.stringify(rows, null, 1)}\n`);
